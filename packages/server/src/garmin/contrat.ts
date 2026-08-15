import { z } from 'zod';
import { Sport, type Activite, type IsoDate, type Wellness } from '@carter/shared';

/**
 * =========================================================================
 *  CONTRAT DE L'API INTERNE GARMIN CONNECT
 * =========================================================================
 *
 * Forme des reponses et conversion vers les types de l'app. Isole du flux
 * d'authentification : ce fichier se teste contre des reponses enregistrees,
 * et c'est lui qu'on corrige quand un champ change de nom.
 *
 * NON VERIFIE CONTRE L'API REELLE — pas d'acces reseau vers Garmin depuis
 * l'environnement de developpement. Les schemas sont donc permissifs : un
 * champ inconnu ne casse rien, un champ manquant degrade au lieu de faire
 * echouer tout l'import.
 */

export const BASE_API = 'https://connectapi.garmin.com';

/** `typeKey` Garmin ramenes au vocabulaire de l'app. */
const SPORTS: Record<string, Sport> = {
  running: 'COURSE',
  street_running: 'COURSE',
  track_running: 'COURSE',
  road_running: 'COURSE',
  trail_running: 'TRAIL',
  ultra_run: 'TRAIL',
  treadmill_running: 'COURSE_INTERIEUR',
  indoor_running: 'COURSE_INTERIEUR',
  virtual_run: 'COURSE_INTERIEUR',
  cycling: 'VELO',
  road_biking: 'VELO',
  gravel_cycling: 'VELO',
  mountain_biking: 'VELO',
  cyclocross: 'VELO',
  indoor_cycling: 'VELO_INTERIEUR',
  virtual_ride: 'VELO_INTERIEUR',
  strength_training: 'RENFORCEMENT',
  indoor_cardio: 'RENFORCEMENT',
  hiit: 'RENFORCEMENT',
  walking: 'MARCHE',
  casual_walking: 'MARCHE',
  speed_walking: 'MARCHE',
  hiking: 'RANDONNEE',
  lap_swimming: 'NATATION',
  open_water_swimming: 'NATATION',
};

export function versSport(cle: string | null | undefined): Sport {
  if (!cle) return 'AUTRE';
  return SPORTS[cle] ?? 'AUTRE';
}

export const ActiviteGarminSchema = z
  .object({
    activityId: z.union([z.string(), z.number()]).transform(String),
    activityName: z.string().nullish(),
    startTimeLocal: z.string().nullish(),
    activityType: z.object({ typeKey: z.string().nullish() }).nullish(),
    duration: z.number().nullish(),
    movingDuration: z.number().nullish(),
    elapsedDuration: z.number().nullish(),
    distance: z.number().nullish(),
    elevationGain: z.number().nullish(),
    elevationLoss: z.number().nullish(),
    averageHR: z.number().nullish(),
    maxHR: z.number().nullish(),
    averageSpeed: z.number().nullish(),
    calories: z.number().nullish(),
    averageRunningCadenceInStepsPerMinute: z.number().nullish(),
    averageBikingCadenceInRevPerMinute: z.number().nullish(),
    activityTrainingLoad: z.number().nullish(),
  })
  .passthrough();

export const ResumeJournalierSchema = z
  .object({
    calendarDate: z.string().nullish(),
    restingHeartRate: z.number().nullish(),
    bodyBatteryMostRecentValue: z.number().nullish(),
    bodyBatteryHighestValue: z.number().nullish(),
    averageStressLevel: z.number().nullish(),
    totalSteps: z.number().nullish(),
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
        z.object({ calendarDate: z.string().nullish(), weight: z.number().nullish() }).passthrough(),
      )
      .nullish(),
  })
  .passthrough();

export const ProfilSchema = z
  .object({ displayName: z.string(), fullName: z.string().nullish() })
  .passthrough();

/** `2026-03-03 18:12:04` -> `2026-03-03`. */
export function dateDe(valeur: string | null | undefined): IsoDate | null {
  if (!valeur) return null;
  const jour = valeur.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null;
}

/** `2026-03-03 18:12:04` -> `18:12`. */
export function heureDe(valeur: string | null | undefined): string | null {
  if (!valeur || valeur.length < 16) return null;
  const heure = valeur.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(heure) ? heure : null;
}

const SPORTS_ALLURE = new Set<Sport>(['COURSE', 'TRAIL', 'COURSE_INTERIEUR', 'MARCHE', 'RANDONNEE']);
const SPORTS_VITESSE = new Set<Sport>(['VELO', 'VELO_INTERIEUR']);

/** Convertit une activite Garmin. Retourne null si elle est inexploitable. */
export function versActivite(brut: unknown): Activite | null {
  const parse = ActiviteGarminSchema.safeParse(brut);
  if (!parse.success) return null;

  const a = parse.data;
  const date = dateDe(a.startTimeLocal);
  if (date === null) return null;

  const sport = versSport(a.activityType?.typeKey);
  const vitesse = a.averageSpeed ?? null;

  return {
    id: a.activityId,
    date,
    heure: heureDe(a.startTimeLocal),
    nom: a.activityName ?? '',
    sport,
    sport_garmin: a.activityType?.typeKey ?? '',
    // `movingDuration` exclut les pauses : c'est le temps d'effort reel.
    duree_s: Math.round(a.movingDuration ?? a.duration ?? 0),
    duree_totale_s: Math.round(a.elapsedDuration ?? a.duration ?? 0),
    distance_m: a.distance ?? 0,
    denivele_m: a.elevationGain ?? 0,
    denivele_negatif_m: a.elevationLoss ?? 0,
    fc_moy: arrondirOuNull(a.averageHR),
    fc_max: arrondirOuNull(a.maxHR),
    allure_s_km: SPORTS_ALLURE.has(sport) ? allureDepuisVitesse(vitesse) : null,
    vitesse_kmh: SPORTS_VITESSE.has(sport) && vitesse !== null && vitesse > 0
      ? Math.round(vitesse * 3.6 * 10) / 10
      : null,
    calories: arrondirOuNull(a.calories),
    cadence_moy: arrondirOuNull(
      a.averageRunningCadenceInStepsPerMinute ?? a.averageBikingCadenceInRevPerMinute,
    ),
    rpe: null,
    charge: a.activityTrainingLoad ?? null,
  };
}

/** Vitesse (m/s) -> allure (s/km). Null si nulle : une allure infinie n'a pas de sens. */
export function allureDepuisVitesse(vitesse: number | null | undefined): number | null {
  if (vitesse === null || vitesse === undefined || vitesse <= 0) return null;
  return 1000 / vitesse;
}

/** Assemble les differentes sources de forme d'une journee. */
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
  const r = resume.success ? resume.data : null;

  return {
    date: entrees.date,
    poids_kg: entrees.poids ?? null,
    fc_repos: arrondirOuNull(r?.restingHeartRate),
    hrv: hrv.success ? (hrv.data.hrvSummary?.lastNightAvg ?? null) : null,
    sommeil_h: secondes != null ? Math.round((secondes / 3600) * 10) / 10 : null,
    // La valeur haute du jour approche le niveau au reveil, plus parlante que
    // la derniere mesure, qui depend de l'heure a laquelle on regarde.
    body_battery: borner(r?.bodyBatteryHighestValue ?? r?.bodyBatteryMostRecentValue, 0, 100),
    // Garmin renvoie -1 ou -2 quand la mesure est absente.
    stress_moy: borner(r?.averageStressLevel, 0, 100),
    pas: arrondirOuNull(r?.totalSteps),
  };
}

/** Poids par date. Garmin stocke des grammes. */
export function poidsParDate(brut: unknown): Map<IsoDate, number> {
  const parse = PoidsSchema.safeParse(brut);
  const resultat = new Map<IsoDate, number>();
  if (!parse.success) return resultat;

  for (const entree of parse.data.dateWeightList ?? []) {
    const date = dateDe(entree.calendarDate);
    if (date !== null && entree.weight != null) {
      resultat.set(date, Math.round((entree.weight / 1000) * 10) / 10);
    }
  }
  return resultat;
}

function arrondirOuNull(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Math.round(v);
}

function borner(v: number | null | undefined, min: number, max: number): number | null {
  if (v === null || v === undefined) return null;
  const arrondi = Math.round(v);
  return arrondi >= min && arrondi <= max ? arrondi : null;
}
