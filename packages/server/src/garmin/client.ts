import {
  ajouterJours,
  diffJours,
  type Activite,
  type IsoDate,
  type Wellness,
} from '@carter/shared';
import { ErreurGarmin, ErreurNonConnecte } from './erreurs.js';
import {
  BASE_API,
  ProfilSchema,
  assemblerWellness,
  poidsParDate,
  versActivite,
} from './contrat.js';
import { SessionGarminSso, type Jetons } from './sso.js';

export interface DepotSessionGarmin {
  lire(): Promise<{
    jetons: Jetons;
    nomAffichage: string | null;
    derniereSynchro: string | null;
  } | null>;
  enregistrerJetons(jetons: Jetons, nomAffichage: string | null): Promise<void>;
  marquerSynchro(): Promise<void>;
  effacer(): Promise<void>;
}

export interface OptionsClient {
  depot: DepotSessionGarmin;
  active: boolean;
  fetch?: typeof globalThis.fetch;
  sso?: SessionGarminSso;
}

/**
 * Client Garmin Connect.
 *
 * Utilise le meme mecanisme que l'application mobile : ce n'est pas une API
 * publique. Lecture seule — l'app ne modifie jamais rien chez Garmin.
 */
export class ClientGarmin {
  private readonly sso: SessionGarminSso;
  private readonly fetch: typeof globalThis.fetch;

  private session: {
    jetons: Jetons;
    nomAffichage: string | null;
    derniereSynchro: string | null;
  } | null = null;
  private chargee = false;

  constructor(private readonly options: OptionsClient) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.sso = options.sso ?? new SessionGarminSso({ fetch: this.fetch });
  }

  async etat(): Promise<{
    connecte: boolean;
    nom_affichage: string | null;
    derniere_synchro: string | null;
    active: boolean;
  }> {
    await this.charger();
    return {
      connecte: this.session !== null,
      nom_affichage: this.session?.nomAffichage ?? null,
      derniere_synchro: this.session?.derniereSynchro ?? null,
      active: this.options.active,
    };
  }

  private async charger(): Promise<void> {
    if (this.chargee) return;
    this.session = await this.options.depot.lire();
    this.chargee = true;
  }

  // --- Connexion ----------------------------------------------------------

  async connecter(identifiant: string, motDePasse: string): Promise<string | null> {
    this.exigerActif();
    return this.finaliser(await this.sso.connecter(identifiant, motDePasse));
  }

  async validerMfa(
    etat: Parameters<SessionGarminSso['validerMfa']>[0],
    code: string,
  ): Promise<string | null> {
    this.exigerActif();
    return this.finaliser(await this.sso.validerMfa(etat, code));
  }

  async deconnecter(): Promise<void> {
    await this.options.depot.effacer();
    this.session = null;
    this.chargee = true;
  }

  private exigerActif(): void {
    if (!this.options.active) {
      throw new ErreurNonConnecte(
        'La connexion Garmin est desactivee. Mets GARMIN_ENABLED=true cote serveur.',
      );
    }
  }

  private async finaliser(jetons: Jetons): Promise<string | null> {
    this.session = { jetons, nomAffichage: null, derniereSynchro: null };
    this.chargee = true;

    // Le nom d'affichage est la clef de la plupart des endpoints de forme.
    const nomAffichage = await this.nomAffichage().catch(() => null);

    this.session = { ...this.session, nomAffichage };
    await this.options.depot.enregistrerJetons(jetons, nomAffichage);
    return nomAffichage;
  }

  private async nomAffichage(): Promise<string | null> {
    const brut = await this.appeler<unknown>('/userprofile-service/socialProfile');
    const parse = ProfilSchema.safeParse(brut);
    return parse.success ? parse.data.displayName : null;
  }

  // --- Lecture ------------------------------------------------------------

  /**
   * Active depuis la plus recente. `limite` borne le nombre remonte, ce qui
   * evite de tirer dix ans d'historique au premier chargement.
   */
  async activites(limite: number, depuis?: IsoDate): Promise<Activite[]> {
    const parametres = new URLSearchParams({ start: '0', limit: String(limite) });
    if (depuis !== undefined) parametres.set('startDate', depuis);

    const brut = await this.appeler<unknown[]>(
      `/activitylist-service/activities/search/activities?${parametres.toString()}`,
    );

    const resultat: Activite[] = [];
    for (const item of Array.isArray(brut) ? brut : []) {
      const activite = versActivite(item);
      // Une activite illisible est ignoree : mieux vaut 19 sur 20 que zero.
      if (activite !== null) resultat.push(activite);
    }
    return resultat;
  }

  /**
   * Forme, jour par jour.
   *
   * Garmin n'expose pas de plage pour le sommeil et la HRV : une requete par
   * jour et par metrique. On borne donc la fenetre et on limite la
   * concurrence — marteler une API non officielle est le meilleur moyen de se
   * faire remarquer.
   */
  async wellness(debut: IsoDate, fin: IsoDate): Promise<Wellness[]> {
    await this.charger();
    const nom = this.session?.nomAffichage;
    if (!nom) {
      throw new ErreurNonConnecte(
        "Nom d'affichage Garmin inconnu : reconnecte ton compte depuis l'app.",
      );
    }

    const jours = Math.max(0, diffJours(debut, fin) + 1);
    if (jours === 0) return [];

    const poids = await this.appeler<unknown>(
      `/weight-service/weight/dateRange?${new URLSearchParams({
        startDate: debut,
        endDate: fin,
      }).toString()}`,
    )
      .then(poidsParDate)
      .catch(() => new Map<IsoDate, number>());

    const dates = Array.from({ length: jours }, (_, i) => ajouterJours(debut, i));
    const resultats: Wellness[] = [];

    for (let i = 0; i < dates.length; i += 3) {
      const lot = dates.slice(i, i + 3);
      const entrees = await Promise.all(
        lot.map(async (date) => {
          const [resume, sommeil, hrv] = await Promise.all([
            this.silencieux(
              `/usersummary-service/usersummary/daily/${encodeURIComponent(nom)}?calendarDate=${date}`,
            ),
            this.silencieux(
              `/wellness-service/wellness/dailySleepData/${encodeURIComponent(nom)}?date=${date}&nonSleepBufferMinutes=60`,
            ),
            this.silencieux(`/hrv-service/hrv/${date}`),
          ]);
          return assemblerWellness({ date, resume, sommeil, hrv, poids: poids.get(date) ?? null });
        }),
      );
      resultats.push(...entrees);
    }

    // Une journee sans aucune donnee ne merite pas d'etre enregistree.
    return resultats.filter(
      (w) =>
        w.fc_repos !== null ||
        w.hrv !== null ||
        w.sommeil_h !== null ||
        w.poids_kg !== null ||
        w.body_battery !== null,
    );
  }

  async marquerSynchro(): Promise<void> {
    await this.options.depot.marquerSynchro();
    if (this.session !== null) {
      this.session = { ...this.session, derniereSynchro: new Date().toISOString() };
    }
  }

  // --- Transport ----------------------------------------------------------

  /** Renvoie null au lieu d'echouer : pour les metriques absentes un jour donne. */
  private async silencieux(chemin: string): Promise<unknown> {
    try {
      return await this.appeler<unknown>(chemin);
    } catch (e) {
      // Un 404 sur une nuit sans donnee de sommeil est normal.
      if (e instanceof ErreurGarmin && e.statut === 404) return null;
      throw e;
    }
  }

  private async appeler<T>(chemin: string): Promise<T> {
    await this.charger();
    this.exigerActif();

    if (this.session === null) {
      throw new ErreurNonConnecte(
        "Aucune session Garmin. Connecte ton compte depuis l'onglet Compte.",
      );
    }

    await this.rafraichirSiExpire();

    let reponse: Response;
    try {
      reponse = await this.fetch(`${BASE_API}${chemin}`, {
        headers: {
          Authorization: `Bearer ${this.session.jetons.oauth2.access_token}`,
          'User-Agent': 'com.garmin.android.apps.connectmobile',
          Accept: 'application/json',
          NK: 'NT',
        },
      });
    } catch (e) {
      throw new ErreurGarmin(
        `Garmin injoignable : ${e instanceof Error ? e.message : String(e)}`,
        null,
      );
    }

    if (reponse.status === 401 || reponse.status === 403) {
      throw new ErreurNonConnecte(
        "Garmin a refuse la session. Reconnecte ton compte depuis l'onglet Compte. " +
          "Si l'app est hebergee dans le cloud, le blocage peut aussi venir de la " +
          'protection anti-bot de Garmin.',
      );
    }

    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => '');
      throw new ErreurGarmin(
        `Garmin a repondu ${reponse.status}${texte ? ` : ${texte.slice(0, 200)}` : ''}`,
        reponse.status,
        texte,
      );
    }

    const texte = await reponse.text();
    if (texte.trim() === '') return null as T;

    try {
      return JSON.parse(texte) as T;
    } catch {
      throw new ErreurGarmin(`Reponse illisible de Garmin sur ${chemin}`, reponse.status);
    }
  }

  /** Renouvelle le jeton d'acces sans redemander le mot de passe. */
  private async rafraichirSiExpire(): Promise<void> {
    if (this.session === null) return;
    if (this.session.jetons.oauth2.expire_le > Date.now()) return;

    const oauth2 = await this.sso.rafraichir(this.session.jetons.oauth1);
    this.session = { ...this.session, jetons: { ...this.session.jetons, oauth2 } };
    await this.options.depot.enregistrerJetons(this.session.jetons, this.session.nomAffichage);
  }
}
