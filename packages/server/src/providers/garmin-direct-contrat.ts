import { z } from 'zod';
import type { IsoDate, SeanceRealisee, Wellness } from '@carter/shared';

/**
 * =========================================================================
 *  CONTRAT DE L'API INTERNE GARMIN CONNECT
 * =========================================================================
 *
 * Formes de reponses et conversion vers les types Carter. Isole du flux
 * d'authentification : ce fichier est testable contre des reponses
 * enregistrees, et c'est lui qu'on corrige quand un champ change de nom.
 *
 * NON VERIFIE CONTRE L'API REELLE — pas d'acces reseau vers Garmin depuis
 * l'environnement de developpement. Les schemas sont volontairement
 * permissifs : un champ inconnu ne casse rien, un champ manquant degrade au
 * lieu de faire echouer tout l'import.
 */

export const BASE_API = 'https://connectapi.garmin.com';

/**
 * Types de sport Garmin ramenes au vocabulaire deja utilise dans l'app
 * (celui d'Intervals.icu). Le reste du code — rapprochement, comparaison
 * prevu/realise, alertes — continue de fonctionner sans modification.
 */
const SPORTS: Record<string, string> = {
  running: 'Run',
  trail_running: 'TrailRun',
  treadmill_running: 'VirtualRun',
  indoor_running: 'VirtualRun',
  track_running: 'Run',
  virtual_run: 'VirtualRun',
  cycling: 'Ride',
  road_biking: 'Ride',
  gravel_cycling: 'Ride',
  mountain_biking: 'Ride',
  indoor_cycling: 'VirtualRide',
  virtual_ride: 'VirtualRide',
  strength_training: 'WeightTraining',
  indoor_cardio: 'Workout',
  yoga: 'Yoga',
  walking: 'Walk',
  hiking: 'Hike',
};

export function typeSport(cle: string | null | undefined): string {
  if (!cle) return 'Other';
  return SPORTS[cle] ?? 'Other';
}

export const ActiviteSchema = z
  .object({
    activityId: z.union([z.string(), z.number()]).transform(String),
    activityName: z.string().nullish(),
    startTimeLocal: z.string().nullish(),
    activityType: z.object({ typeKey: z.string().nullish() }).nullish(),
    duration: z.number().nullish(),
    movingDuration: z.number().nullish(),
    distance: z.number().nullish(),
    elevationGain: z.number().nullish(),
    averageHR: z.number().nullish(),
    maxHR: z.number().nullish(),
    averageSpeed: z.number().nullish(),
  })
  .passthrough();
export type ActiviteGarmin = z.infer<typeof ActiviteSchema>;

export const ResumeJournalierSchema = z
  .object({
    calendarDate: z.string().nullish(),
    restingHeartRate: z.number().nullish(),
    bodyBatteryMostRecentValue: z.number().nullish(),
    averageStressLevel: z.number().nullish(),
  })
  .passthrough();

export const SommeilSchema = z
  .object({
    dailySleepDTO: z
      .object({
        calendarDate: z.string().nullish(),
        sleepTimeSeconds: z.number().nullish(),
      })
      .nullish(),
  })
  .passthrough();

export const HrvSchema = z
  .object({
    hrvSummary: z
      .object({
        calendarDate: z.string().nullish(),
        lastNightAvg: z.number().nullish(),
      })
      .nullish(),
  })
  .passthrough();

export const PoidsSchema = z
  .object({
    dateWeightList: z
      .array(
        z
          .object({
            calendarDate: z.string().nullish(),
            weight: z.number().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();

export const ProfilSchema = z
  .object({
    displayName: z.string(),
    fullName: z.string().nullish(),
  })
  .passthrough();

/** Extrait `YYYY-MM-DD` d'un horodatage local Garmin (`2026-03-03 18:12:04`). */
export function dateDe(valeur: string | null | undefined): IsoDate | null {
  if (!valeur) return null;
  const jour = valeur.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null;
}

/** Vitesse moyenne (m/s) -> allure (s/km). Null si la vitesse est nulle. */
export function allureDepuisVitesse(vitesse: number | null | undefined): number | null {
  if (vitesse === null || vitesse === undefined || vitesse <= 0) return null;
  return 1000 / vitesse;
}

const SPORTS_COURSE = new Set(['Run', 'TrailRun', 'VirtualRun']);

/** Convertit une activite Garmin en seance realisee Carter. */
export function versSeanceRealisee(brut: unknown): SeanceRealisee | null {
  const parse = ActiviteSchema.safeParse(brut);
  if (!parse.success) return null;

  const a = parse.data;
  const date = dateDe(a.startTimeLocal);
  if (date === null) return null;

  const sport = typeSport(a.activityType?.typeKey);
  const estCourse = SPORTS_COURSE.has(sport);

  return {
    id: `garmin-${a.activityId}`,
    seance_id: null,
    date,
    source: 'GARMIN_DIRECT',
    external_id: a.activityId,
    nom: a.activityName ?? '',
    type_sport: sport,
    // `movingDuration` exclut les pauses : c'est le temps d'effort reel, et
    // c'est ce qui doit etre compare au volume prevu.
    duree_s: Math.round(a.movingDuration ?? a.duration ?? 0),
    distance_m: a.distance ?? 0,
    denivele_m: a.elevationGain ?? 0,
    fc_moy: arrondirOuNull(a.averageHR),
    fc_max: arrondirOuNull(a.maxHR),
    allure_moy_s_km: estCourse ? allureDepuisVitesse(a.averageSpeed) : null,
    // Garmin ne fournit pas d'allure ajustee au denivele dans cette reponse.
    allure_gap_s_km: null,
    rpe: null,
    ressenti: null,
    douleurs: [],
    commentaire: '',
  };
}

/** Assemble les differentes sources de wellness d'une journee. */
export function assemblerWellness(entrees: {
  date: IsoDate;
  resume?: unknown;
  sommeil?: unknown;
  hrv?: unknown;
  poids?: number | null;
}): Wellness {
  const resume = ResumeJournalierSchema.safeParse(entrees.resume);
  const sommeil = SommeilSchema.safeParse(entrees.sommeil);
  const hrv = HrvSchema.safeParse(entrees.hrv);

  const secondes = sommeil.success ? sommeil.data.dailySleepDTO?.sleepTimeSeconds : null;

  return {
    date: entrees.date,
    poids_kg: entrees.poids ?? null,
    fc_repos: resume.success ? arrondirOuNull(resume.data.restingHeartRate) : null,
    hrv: hrv.success ? (hrv.data.hrvSummary?.lastNightAvg ?? null) : null,
    sommeil_h: secondes != null ? Math.round((secondes / 3600) * 10) / 10 : null,
    // Garmin ne demande pas de fatigue ni d'humeur declarees : ces deux
    // champs restent a la saisie manuelle, dans l'app.
    fatigue_1_5: null,
    humeur_1_5: null,
    note: noteContexte(resume.success ? resume.data : null),
  };
}

/**
 * Body Battery et stress ne rentrent dans aucune des cinq regles d'alerte.
 * Plutot que d'ajouter des colonnes qui ne serviraient a rien, on les met en
 * note : visibles a la lecture, embarquees dans l'export coach.
 */
function noteContexte(
  resume: z.infer<typeof ResumeJournalierSchema> | null,
): string {
  if (resume === null) return '';
  const morceaux: string[] = [];
  if (resume.bodyBatteryMostRecentValue != null) {
    morceaux.push(`Body Battery ${Math.round(resume.bodyBatteryMostRecentValue)}`);
  }
  if (resume.averageStressLevel != null && resume.averageStressLevel >= 0) {
    morceaux.push(`stress moyen ${Math.round(resume.averageStressLevel)}`);
  }
  return morceaux.join(', ');
}

/** Poids par date, extrait de la reponse de plage. */
export function poidsParDate(brut: unknown): Map<IsoDate, number> {
  const parse = PoidsSchema.safeParse(brut);
  const resultat = new Map<IsoDate, number>();
  if (!parse.success) return resultat;

  for (const entree of parse.data.dateWeightList ?? []) {
    const date = dateDe(entree.calendarDate);
    // Garmin stocke le poids en grammes.
    if (date !== null && entree.weight != null) {
      resultat.set(date, Math.round((entree.weight / 1000) * 10) / 10);
    }
  }
  return resultat;
}

function arrondirOuNull(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Math.round(v);
}
