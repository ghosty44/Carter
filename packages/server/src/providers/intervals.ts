import {
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
  ActiviteSchema,
  BASE_URL,
  EvenementSchema,
  SPORTS_COURSE,
  WellnessIntervalsSchema,
  allureDepuisVitesse,
  corpsEvenement,
  dateDe,
} from './intervals-contrat.js';

export interface OptionsIntervals {
  athleteId: string;
  apiKey: string;
  prefixe: string;
  baseUrl?: string;
  /** Injectable pour tester contre des reponses enregistrees. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Adaptateur Intervals.icu.
 *
 * C'est le chemin principal de l'app : Intervals.icu se connecte a Garmin
 * Connect cote utilisateur, donc les seances poussees ici redescendent sur la
 * montre sans avoir besoin d'un acces partenaire Garmin.
 *
 * Authentification : basic auth avec le login litteral « API_KEY » et la cle
 * personnelle en mot de passe. La cle ne quitte jamais le serveur.
 */
export class ProviderIntervals implements PlanSyncProvider {
  readonly nom: NomProvider = 'INTERVALS';
  readonly libelle = 'Intervals.icu';

  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly options: OptionsIntervals) {
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  estConfigure(): boolean {
    return this.options.athleteId.length > 0 && this.options.apiKey.length > 0;
  }

  capacites(): CapacitesProvider {
    return { ecrire: true, lire: true, supprimer: true };
  }

  async listerSeancesPlanifiees(debut: IsoDate, fin: IsoDate): Promise<SeanceExterne[]> {
    const brut = await this.appeler<unknown[]>(
      'GET',
      `/events?oldest=${debut}&newest=${fin}`,
    );

    const evenements: SeanceExterne[] = [];
    for (const item of Array.isArray(brut) ? brut : []) {
      const parse = EvenementSchema.safeParse(item);
      if (!parse.success) continue; // un evenement illisible ne bloque pas la synchro

      const evt = parse.data;
      const date = dateDe(evt.start_date_local);
      if (date === null) continue;

      const nom = evt.name ?? '';
      evenements.push({
        externalId: evt.id,
        date,
        nom,
        // Un evenement n'appartient a Carter que s'il porte le prefixe. Sans
        // cette marque, il est considere comme cree a la main et jamais
        // supprime, meme s'il tombe le meme jour qu'une seance du plan.
        possedeParCarter: nom.startsWith(this.options.prefixe),
        brut: evt,
      });
    }
    return evenements;
  }

  async creerSeance(p: SeancePlanifiee): Promise<{ externalId: string }> {
    const corps = corpsEvenement(p, this.options.prefixe, clef(p));
    const reponse = await this.appeler<unknown>('POST', '/events', corps);

    const parse = EvenementSchema.safeParse(reponse);
    if (!parse.success) {
      throw new ErreurProvider(
        "Intervals.icu a repondu sans identifiant d'evenement exploitable",
        null,
        JSON.stringify(reponse).slice(0, 500),
      );
    }
    return { externalId: parse.data.id };
  }

  async mettreAJourSeance(externalId: string, p: SeancePlanifiee): Promise<void> {
    const corps = corpsEvenement(p, this.options.prefixe, clef(p));
    await this.appeler<unknown>('PUT', `/events/${encodeURIComponent(externalId)}`, corps);
  }

  async supprimerSeance(externalId: string): Promise<void> {
    await this.appeler<unknown>('DELETE', `/events/${encodeURIComponent(externalId)}`);
  }

  async listerActivites(debut: IsoDate, fin: IsoDate): Promise<SeanceRealisee[]> {
    const brut = await this.appeler<unknown[]>(
      'GET',
      `/activities?oldest=${debut}&newest=${fin}`,
    );

    const activites: SeanceRealisee[] = [];
    for (const item of Array.isArray(brut) ? brut : []) {
      const parse = ActiviteSchema.safeParse(item);
      if (!parse.success) continue;

      const a = parse.data;
      const date = dateDe(a.start_date_local);
      if (date === null) continue;

      const sport = a.type ?? 'Other';
      activites.push({
        id: `intervals-${a.id}`,
        seance_id: null,
        date,
        source: 'INTERVALS',
        external_id: a.id,
        nom: a.name ?? '',
        type_sport: sport,
        duree_s: Math.round(a.moving_time ?? a.elapsed_time ?? 0),
        distance_m: a.distance ?? 0,
        denivele_m: a.total_elevation_gain ?? 0,
        fc_moy: arrondirOuNull(a.average_heartrate),
        fc_max: arrondirOuNull(a.max_heartrate),
        allure_moy_s_km: SPORTS_COURSE.has(sport)
          ? allureDepuisVitesse(a.average_speed)
          : null,
        allure_gap_s_km: SPORTS_COURSE.has(sport) ? allureDepuisVitesse(a.gap) : null,
        rpe: borner(a.icu_rpe, 1, 10),
        ressenti: borner(a.feel, 1, 5),
        douleurs: [],
        commentaire: '',
      });
    }
    return activites;
  }

  async listerWellness(debut: IsoDate, fin: IsoDate): Promise<Wellness[]> {
    const brut = await this.appeler<unknown[]>(
      'GET',
      `/wellness?oldest=${debut}&newest=${fin}`,
    );

    const entrees: Wellness[] = [];
    for (const item of Array.isArray(brut) ? brut : []) {
      const parse = WellnessIntervalsSchema.safeParse(item);
      if (!parse.success) continue;

      const w = parse.data;
      // L'identifiant d'une entree wellness est la date elle-meme.
      const date = dateDe(w.id);
      if (date === null) continue;

      entrees.push({
        date,
        poids_kg: w.weight ?? null,
        fc_repos: arrondirOuNull(w.restingHR),
        hrv: w.hrv ?? null,
        sommeil_h: w.sleepSecs != null ? Math.round((w.sleepSecs / 3600) * 10) / 10 : null,
        fatigue_1_5: borner(w.fatigue, 1, 5),
        humeur_1_5: borner(w.mood, 1, 5),
        note: w.comments ?? '',
      });
    }
    return entrees;
  }

  private async appeler<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
    if (!this.estConfigure()) {
      throw new ErreurProviderNonConfigure(
        "Intervals.icu n'est pas configure : renseigne INTERVALS_ATHLETE_ID et INTERVALS_API_KEY dans le .env du serveur.",
      );
    }

    const url = `${this.baseUrl}/athlete/${this.options.athleteId}${chemin}`;
    const entetes: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`API_KEY:${this.options.apiKey}`).toString('base64')}`,
      Accept: 'application/json',
    };
    if (corps !== undefined) entetes['Content-Type'] = 'application/json';

    let reponse: Response;
    try {
      reponse = await this.fetch(url, {
        method: methode,
        headers: entetes,
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
    } catch (e) {
      // Panne reseau : statut null, donc consideree comme reessayable.
      throw new ErreurProvider(
        `Intervals.icu injoignable : ${e instanceof Error ? e.message : String(e)}`,
        null,
      );
    }

    if (!reponse.ok) {
      const texte = await reponse.text().catch(() => '');
      throw new ErreurProvider(
        `Intervals.icu a repondu ${reponse.status} sur ${methode} ${chemin}${
          texte ? ` : ${texte.slice(0, 300)}` : ''
        }`,
        reponse.status,
        texte,
      );
    }

    if (reponse.status === 204) return undefined as T;

    const texte = await reponse.text();
    if (texte.trim() === '') return undefined as T;

    try {
      return JSON.parse(texte) as T;
    } catch {
      throw new ErreurProvider(
        `Reponse illisible d'Intervals.icu sur ${methode} ${chemin}`,
        reponse.status,
        texte.slice(0, 300),
      );
    }
  }
}

function clef(p: SeancePlanifiee): string {
  return `carter:${p.bloc.id}:${p.seance.id}`;
}

function arrondirOuNull(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Math.round(v);
}

/** Ramene une valeur dans une plage, ou null si elle est absente ou aberrante. */
function borner(v: number | null | undefined, min: number, max: number): number | null {
  if (v === null || v === undefined) return null;
  const arrondi = Math.round(v);
  return arrondi >= min && arrondi <= max ? arrondi : null;
}
