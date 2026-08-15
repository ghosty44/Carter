import {
  ajouterJours,
  diffJours,
  type CapacitesProvider,
  type IsoDate,
  type NomProvider,
  type SeanceExterne,
  type SeancePlanifiee,
  type SeanceRealisee,
  type Wellness,
} from '@carter/shared';
import { ErreurProvider, ErreurProviderNonConfigure, type PlanSyncProvider } from './types.js';
import {
  BASE_API,
  ProfilSchema,
  assemblerWellness,
  poidsParDate,
  versSeanceRealisee,
} from './garmin-direct-contrat.js';
import { SessionGarminSso, type Jetons } from './garmin-direct-sso.js';

/** Ce que l'adaptateur a besoin de lire et d'ecrire pour tenir sa session. */
export interface DepotSessionGarmin {
  lire(): Promise<{ jetons: Jetons; nomAffichage: string | null } | null>;
  enregistrerJetons(jetons: Jetons, nomAffichage: string | null): Promise<void>;
  effacer(): Promise<void>;
}

export interface OptionsGarminDirect {
  depot: DepotSessionGarmin;
  active: boolean;
  fetch?: typeof globalThis.fetch;
  sso?: SessionGarminSso;
  /** Nombre maximal de jours de wellness recuperes en une fois. */
  fenetreWellnessMax?: number;
}

/**
 * Connexion directe au compte Garmin Connect.
 *
 * Utilise le meme mecanisme que l'application mobile Garmin : ce n'est pas une
 * API publique. Consequences a assumer, documentees dans le README :
 *
 * - c'est contraire aux conditions d'utilisation de Garmin ;
 * - ca casse quand Garmin modifie son SSO, sans preavis ;
 * - depuis une IP de datacenter (Vercel, AWS), le SSO passe par Cloudflare et
 *   se fait souvent bloquer la ou la meme requete aboutit depuis une
 *   connexion domestique.
 *
 * En lecture seule. L'ecriture du plan reste sur Intervals.icu : pousser des
 * seances par ce canal demanderait de reproduire un second format non
 * documente, pour un resultat plus fragile que ce qui existe deja.
 */
export class ProviderGarminDirect implements PlanSyncProvider {
  readonly nom: NomProvider = 'GARMIN_DIRECT';
  readonly libelle = 'Garmin Connect (connexion directe)';

  private readonly sso: SessionGarminSso;
  private readonly fetch: typeof globalThis.fetch;
  private readonly fenetreMax: number;

  /** Etat charge depuis la base, garde en memoire le temps de l'invocation. */
  private session: { jetons: Jetons; nomAffichage: string | null } | null = null;
  private sessionChargee = false;

  constructor(private readonly options: OptionsGarminDirect) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.sso = options.sso ?? new SessionGarminSso({ fetch: this.fetch });
    this.fenetreMax = options.fenetreWellnessMax ?? 60;
  }

  /**
   * Vrai si le provider est active ET une session existe.
   *
   * Volontairement synchrone pour respecter l'interface : l'etat est
   * pre-charge par `initialiser()`, appele au demarrage.
   */
  estConfigure(): boolean {
    return this.options.active && this.session !== null;
  }

  capacites(): CapacitesProvider {
    return { ecrire: false, lire: true, supprimer: false };
  }

  /** A appeler une fois avant usage : charge la session depuis la base. */
  async initialiser(): Promise<void> {
    if (this.sessionChargee) return;
    this.session = await this.options.depot.lire();
    this.sessionChargee = true;
  }

  async connecter(
    identifiant: string,
    motDePasse: string,
  ): Promise<{ nomAffichage: string | null }> {
    const jetons = await this.sso.connecter(identifiant, motDePasse);
    return this.finaliserConnexion(jetons);
  }

  async validerMfa(
    etat: Parameters<SessionGarminSso['validerMfa']>[0],
    code: string,
  ): Promise<{ nomAffichage: string | null }> {
    const jetons = await this.sso.validerMfa(etat, code);
    return this.finaliserConnexion(jetons);
  }

  async deconnecter(): Promise<void> {
    await this.options.depot.effacer();
    this.session = null;
    this.sessionChargee = true;
  }

  private async finaliserConnexion(jetons: Jetons): Promise<{ nomAffichage: string | null }> {
    this.session = { jetons, nomAffichage: null };
    this.sessionChargee = true;

    // Le nom d'affichage est la clef de la plupart des endpoints wellness.
    const nomAffichage = await this.recupererNomAffichage().catch(() => null);

    this.session = { jetons, nomAffichage };
    await this.options.depot.enregistrerJetons(jetons, nomAffichage);
    return { nomAffichage };
  }

  private async recupererNomAffichage(): Promise<string | null> {
    const brut = await this.appeler<unknown>('/userprofile-service/socialProfile');
    const parse = ProfilSchema.safeParse(brut);
    return parse.success ? parse.data.displayName : null;
  }

  // --- Lecture ------------------------------------------------------------

  async listerActivites(debut: IsoDate, fin: IsoDate): Promise<SeanceRealisee[]> {
    const brut = await this.appeler<unknown[]>(
      `/activitylist-service/activities/search/activities?${new URLSearchParams({
        startDate: debut,
        endDate: fin,
        start: '0',
        limit: '200',
      }).toString()}`,
    );

    const activites: SeanceRealisee[] = [];
    for (const item of Array.isArray(brut) ? brut : []) {
      const seance = versSeanceRealisee(item);
      // Une activite illisible est ignoree plutot que de faire echouer
      // l'import entier : on prefere 19 sorties sur 20 a zero.
      if (seance !== null) activites.push(seance);
    }
    return activites;
  }

  /**
   * Wellness jour par jour.
   *
   * Garmin n'expose pas d'endpoint de plage pour le sommeil et la HRV : il
   * faut une requete par jour et par metrique. On borne donc la fenetre et on
   * limite la concurrence — marteler l'API est le meilleur moyen de se faire
   * remarquer sur un canal qui n'est deja pas officiel.
   */
  async listerWellness(debut: IsoDate, fin: IsoDate): Promise<Wellness[]> {
    const nomAffichage = this.session?.nomAffichage;
    if (!nomAffichage) {
      throw new ErreurProvider(
        "Nom d'affichage Garmin inconnu : reconnecte-toi depuis l'app.",
        null,
      );
    }

    const jours = Math.min(diffJours(debut, fin) + 1, this.fenetreMax);
    if (jours <= 0) return [];

    // Le poids s'obtient en une seule requete de plage.
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

    for (const lot of parPaquets(dates, 3)) {
      const entrees = await Promise.all(
        lot.map(async (date) => {
          const [resume, sommeil, hrv] = await Promise.all([
            this.appelerSilencieux(
              `/usersummary-service/usersummary/daily/${encodeURIComponent(
                nomAffichage,
              )}?calendarDate=${date}`,
            ),
            this.appelerSilencieux(
              `/wellness-service/wellness/dailySleepData/${encodeURIComponent(
                nomAffichage,
              )}?date=${date}&nonSleepBufferMinutes=60`,
            ),
            this.appelerSilencieux(`/hrv-service/hrv/${date}`),
          ]);

          return assemblerWellness({
            date,
            resume,
            sommeil,
            hrv,
            poids: poids.get(date) ?? null,
          });
        }),
      );
      resultats.push(...entrees);
    }

    // Une journee sans aucune donnee ne merite pas d'etre enregistree.
    return resultats.filter(
      (w) =>
        w.fc_repos !== null || w.hrv !== null || w.sommeil_h !== null || w.poids_kg !== null,
    );
  }

  // --- Ecriture : non supportee -------------------------------------------

  private refuserEcriture(): never {
    throw new ErreurProviderNonConfigure(
      "La connexion directe a Garmin est en lecture seule dans Carter.\n" +
        "Pour pousser le plan vers ta montre, utilise Intervals.icu : il ecrit dans " +
        'le calendrier Garmin par un canal supporte.',
    );
  }

  async listerSeancesPlanifiees(_debut: IsoDate, _fin: IsoDate): Promise<SeanceExterne[]> {
    // Pas d'ecriture, donc rien a reconcilier : une liste vide est la reponse
    // correcte, et elle evite au moteur de proposer des suppressions.
    return [];
  }

  async creerSeance(_p: SeancePlanifiee): Promise<{ externalId: string }> {
    this.refuserEcriture();
  }

  async mettreAJourSeance(_externalId: string, _p: SeancePlanifiee): Promise<void> {
    this.refuserEcriture();
  }

  async supprimerSeance(_externalId: string): Promise<void> {
    this.refuserEcriture();
  }

  // --- Transport ----------------------------------------------------------

  /** Appel qui renvoie null au lieu d'echouer : pour les metriques absentes. */
  private async appelerSilencieux(chemin: string): Promise<unknown> {
    try {
      return await this.appeler<unknown>(chemin);
    } catch (e) {
      // Un 404 sur une journee sans donnee de sommeil est normal.
      if (e instanceof ErreurProvider && e.statut === 404) return null;
      throw e;
    }
  }

  private async appeler<T>(chemin: string): Promise<T> {
    await this.initialiser();

    if (!this.options.active) {
      throw new ErreurProviderNonConfigure(
        'La connexion directe a Garmin est desactivee (GARMIN_DIRECT_ENABLED).',
      );
    }
    if (this.session === null) {
      throw new ErreurProviderNonConfigure(
        "Aucune session Garmin. Connecte ton compte depuis l'onglet Ressenti de l'app.",
      );
    }

    await this.assurerJetonValide();

    const url = `${BASE_API}${chemin}`;
    let reponse: Response;

    try {
      reponse = await this.fetch(url, {
        headers: {
          Authorization: `Bearer ${this.session.jetons.oauth2.access_token}`,
          'User-Agent': 'com.garmin.android.apps.connectmobile',
          Accept: 'application/json',
          'NK': 'NT',
        },
      });
    } catch (e) {
      throw new ErreurProvider(
        `Garmin injoignable : ${e instanceof Error ? e.message : String(e)}`,
        null,
      );
    }

    if (reponse.status === 401 || reponse.status === 403) {
      throw new ErreurProvider(
        "Garmin a refuse la session. Si l'app tourne sur un hebergeur cloud, le blocage " +
          'vient probablement de la protection anti-bot : voir le README, section Garmin direct. ' +
          "Sinon, reconnecte ton compte depuis l'app.",
        reponse.status,
      );
    }

    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => '');
      throw new ErreurProvider(
        `Garmin a repondu ${reponse.status} sur ${chemin}${texte ? ` : ${texte.slice(0, 200)}` : ''}`,
        reponse.status,
        texte,
      );
    }

    const texte = await reponse.text();
    if (texte.trim() === '') return null as T;

    try {
      return JSON.parse(texte) as T;
    } catch {
      throw new ErreurProvider(`Reponse illisible de Garmin sur ${chemin}`, reponse.status);
    }
  }

  /** Rafraichit le jeton d'acces s'il est expire, sans redemander le mot de passe. */
  private async assurerJetonValide(): Promise<void> {
    if (this.session === null) return;
    if (this.session.jetons.oauth2.expire_le > Date.now()) return;

    const oauth2 = await this.sso.rafraichir(this.session.jetons.oauth1);
    this.session = { ...this.session, jetons: { ...this.session.jetons, oauth2 } };
    await this.options.depot.enregistrerJetons(this.session.jetons, this.session.nomAffichage);
  }

  /** Etat de la connexion, pour l'interface. */
  etat(): { connecte: boolean; nomAffichage: string | null; active: boolean } {
    return {
      connecte: this.session !== null,
      nomAffichage: this.session?.nomAffichage ?? null,
      active: this.options.active,
    };
  }
}

function* parPaquets<T>(elements: T[], taille: number): Generator<T[]> {
  for (let i = 0; i < elements.length; i += taille) {
    yield elements.slice(i, i + taille);
  }
}
