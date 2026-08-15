import { z } from 'zod';
import { Sport } from './enums.js';

/**
 * Les dates sont des chaines `YYYY-MM-DD`, jamais des `Date`.
 *
 * Une seance appartient a un jour, pas a un instant : passer par des objets
 * Date introduit des decalages d'un jour selon l'heure a laquelle on ouvre
 * l'app. Garmin renvoie d'ailleurs des dates locales.
 */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format YYYY-MM-DD');
export type IsoDate = z.infer<typeof IsoDate>;

export const ActiviteSchema = z.object({
  /** Identifiant Garmin de l'activite. */
  id: z.string(),
  date: IsoDate,
  /** Heure de debut locale, `HH:MM`, pour l'affichage. */
  heure: z.string().nullable().default(null),
  nom: z.string().default(''),
  sport: Sport,
  /** Type brut renvoye par Garmin, conserve pour diagnostic. */
  sport_garmin: z.string().default(''),
  /** Temps en mouvement : c'est le temps d'effort reel, pauses exclues. */
  duree_s: z.number().int().nonnegative().default(0),
  /** Temps ecoule, pauses comprises. */
  duree_totale_s: z.number().int().nonnegative().default(0),
  distance_m: z.number().nonnegative().default(0),
  denivele_m: z.number().nonnegative().default(0),
  denivele_negatif_m: z.number().nonnegative().default(0),
  fc_moy: z.number().int().positive().nullable().default(null),
  fc_max: z.number().int().positive().nullable().default(null),
  /** Secondes par kilometre. */
  allure_s_km: z.number().positive().nullable().default(null),
  /** Vitesse moyenne en km/h, pour le velo. */
  vitesse_kmh: z.number().positive().nullable().default(null),
  calories: z.number().int().nonnegative().nullable().default(null),
  cadence_moy: z.number().int().positive().nullable().default(null),
  /** Effort percu renvoye par Garmin, 1 a 10. */
  rpe: z.number().int().min(1).max(10).nullable().default(null),
  /** Charge d'entrainement Garmin, si disponible. */
  charge: z.number().nonnegative().nullable().default(null),
});
export type Activite = z.infer<typeof ActiviteSchema>;

export const WellnessSchema = z.object({
  date: IsoDate,
  poids_kg: z.number().positive().nullable().default(null),
  fc_repos: z.number().int().positive().nullable().default(null),
  hrv: z.number().positive().nullable().default(null),
  sommeil_h: z.number().nonnegative().max(24).nullable().default(null),
  /** Batterie corporelle Garmin au reveil, 0 a 100. */
  body_battery: z.number().int().min(0).max(100).nullable().default(null),
  /** Niveau de stress moyen Garmin, 0 a 100. */
  stress_moy: z.number().int().min(0).max(100).nullable().default(null),
  pas: z.number().int().nonnegative().nullable().default(null),
});
export type Wellness = z.infer<typeof WellnessSchema>;

/** Etat de la connexion Garmin, tel qu'affiche par l'interface. */
export interface EtatGarmin {
  connecte: boolean;
  nom_affichage: string | null;
  /** Derniere recuperation reussie. */
  derniere_synchro: string | null;
  active: boolean;
}
