import { z } from 'zod';
import {
  formatDuree,
  type IsoDate,
  type SeancePlanifiee,
  type TypeSeance,
} from '@carter/shared';

/**
 * =========================================================================
 *  CONTRAT D'API INTERVALS.ICU — LE SEUL ENDROIT A VERIFIER
 * =========================================================================
 *
 * Tout ce qui touche a la forme exacte des requetes et des reponses
 * d'Intervals.icu est concentre ici. Le reste du code ne manipule que des
 * types Carter. Si l'API change, c'est ce fichier qu'on corrige, et les
 * fixtures de `tests/fixtures/intervals/` qu'on remplace.
 *
 * ATTENTION — CE CONTRAT N'A PAS ETE VALIDE CONTRE L'API EN DIRECT.
 * L'environnement de developpement utilise n'avait pas d'acces reseau vers
 * intervals.icu. Les noms de champs ci-dessous viennent du brief et de la
 * documentation publique connue ; ils doivent etre confrontes a la doc a jour
 * avant la premiere synchro reelle. La procedure est decrite dans le README,
 * section « Verifier le contrat Intervals.icu ».
 *
 * Les schemas de lecture sont volontairement permissifs (`.passthrough()`,
 * champs optionnels) : un champ supplementaire cote Intervals.icu ne doit pas
 * faire echouer un import, et un champ manquant doit degrader proprement
 * plutot que planter la synchro.
 */

export const BASE_URL = 'https://intervals.icu/api/v1';

/** Correspondance type de seance Carter -> type de sport Intervals.icu. */
export const TYPE_SPORT: Record<TypeSeance, string> = {
  FOOTING: 'Run',
  SORTIE_LONGUE: 'Run',
  COTES: 'Run',
  SEUIL: 'Run',
  RENFO: 'WeightTraining',
  VELO: 'Ride',
  REPOS: 'Other',
};

/** Types de sport Intervals.icu comptes comme de la course a pied. */
export const SPORTS_COURSE = new Set(['Run', 'TrailRun', 'VirtualRun']);

/** Corps envoye pour creer ou mettre a jour un evenement planifie. */
export interface CorpsEvenement {
  category: 'WORKOUT';
  start_date_local: string;
  name: string;
  type: string;
  moving_time: number;
  description: string;
  external_id?: string;
}

/**
 * Construit le corps d'un evenement a partir d'une seance du plan.
 *
 * `external_id` porte une clef deterministe : elle rend la creation
 * idempotente cote Intervals.icu, ce qui protege du double-clic et du rejeu
 * apres timeout — les deux cas ou l'on cree des doublons sans s'en rendre
 * compte.
 */
export function corpsEvenement(
  p: SeancePlanifiee,
  prefixe: string,
  clefIdempotence: string,
): CorpsEvenement {
  return {
    category: 'WORKOUT',
    // Date locale sans fuseau : une seance appartient a un jour, pas a un
    // instant. Ajouter un decalage horaire ferait glisser la seance d'un jour
    // pour tout athlete hors UTC.
    start_date_local: `${p.date}T00:00:00`,
    name: `${prefixe} ${p.seance.titre}`.trim(),
    type: TYPE_SPORT[p.seance.type],
    moving_time: p.seance.duree_min * 60,
    description: description(p),
    external_id: clefIdempotence,
  };
}

/** Texte affiche sur la montre. Compact, l'essentiel d'abord. */
export function description(p: SeancePlanifiee): string {
  const entete = [
    `Semaine ${p.semaine.numero_global} (${p.semaine.type}) — ${p.bloc.nom}`,
    `Duree prevue : ${formatDuree(p.seance.duree_min)} — intensite ${p.seance.intensite}`,
    p.seance.distance_km ? `Distance : ${p.seance.distance_km} km` : null,
    p.seance.denivele_m ? `Denivele : ${p.seance.denivele_m} m D+` : null,
  ].filter((l): l is string => l !== null);

  const corps = [entete.join('\n'), '', p.seance.consignes];

  if (p.semaine.note_coach) {
    corps.push('', `Note de la semaine : ${p.semaine.note_coach}`);
  }

  return corps.join('\n').trim();
}

/** Reponse d'un evenement planifie. */
export const EvenementSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    start_date_local: z.string().optional(),
    name: z.string().nullish(),
    category: z.string().nullish(),
    type: z.string().nullish(),
    external_id: z.string().nullish(),
  })
  .passthrough();
export type EvenementIntervals = z.infer<typeof EvenementSchema>;

/** Reponse d'une activite realisee. */
export const ActiviteSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    start_date_local: z.string().optional(),
    name: z.string().nullish(),
    type: z.string().nullish(),
    moving_time: z.number().nullish(),
    elapsed_time: z.number().nullish(),
    distance: z.number().nullish(),
    total_elevation_gain: z.number().nullish(),
    average_heartrate: z.number().nullish(),
    max_heartrate: z.number().nullish(),
    average_speed: z.number().nullish(),
    gap: z.number().nullish(),
    icu_rpe: z.number().nullish(),
    feel: z.number().nullish(),
  })
  .passthrough();
export type ActiviteIntervals = z.infer<typeof ActiviteSchema>;

/** Reponse d'une entree wellness. */
export const WellnessIntervalsSchema = z
  .object({
    id: z.string().optional(),
    weight: z.number().nullish(),
    restingHR: z.number().nullish(),
    hrv: z.number().nullish(),
    sleepSecs: z.number().nullish(),
    fatigue: z.number().nullish(),
    mood: z.number().nullish(),
    comments: z.string().nullish(),
  })
  .passthrough();
export type WellnessIntervals = z.infer<typeof WellnessIntervalsSchema>;

/** Extrait la date `YYYY-MM-DD` d'un `start_date_local` ISO. */
export function dateDe(valeur: string | undefined | null): IsoDate | null {
  if (!valeur) return null;
  const jour = valeur.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null;
}

/**
 * Convertit une vitesse moyenne (m/s) en allure (s/km).
 * Retourne null pour une vitesse nulle : une allure infinie n'a pas de sens
 * et pollue toutes les moyennes en aval.
 */
export function allureDepuisVitesse(vitesse: number | null | undefined): number | null {
  if (vitesse === null || vitesse === undefined || vitesse <= 0) return null;
  return 1000 / vitesse;
}
