import { z } from 'zod';
import { SourceRealisee } from './enums.js';
import { IsoDate } from './plan.js';

export const DouleurSchema = z.object({
  zone: z.string().min(1).max(100),
  /** 0 = rien, 10 = insupportable. */
  intensite: z.number().int().min(0).max(10),
  note: z.string().max(1000).default(''),
});
export type Douleur = z.infer<typeof DouleurSchema>;

export const SeanceRealiseeSchema = z.object({
  id: z.string().min(1),
  /** Null tant que le rapprochement avec une seance planifiee n'a pas eu lieu. */
  seance_id: z.string().nullable().default(null),
  date: IsoDate,
  source: SourceRealisee,
  /** Identifiant chez la source, pour ne pas importer deux fois la meme sortie. */
  external_id: z.string().nullable().default(null),
  nom: z.string().max(300).default(''),
  type_sport: z.string().max(60).default('Run'),
  duree_s: z.number().int().nonnegative().default(0),
  distance_m: z.number().nonnegative().default(0),
  denivele_m: z.number().nonnegative().default(0),
  fc_moy: z.number().int().positive().nullable().default(null),
  fc_max: z.number().int().positive().nullable().default(null),
  /** Secondes par kilometre. */
  allure_moy_s_km: z.number().positive().nullable().default(null),
  /** Allure ajustee au denivele, quand la source la fournit. */
  allure_gap_s_km: z.number().positive().nullable().default(null),
  /** Effort percu, 1 a 10, saisi a la main. */
  rpe: z.number().int().min(1).max(10).nullable().default(null),
  /** Ressenti general, 1 a 5. */
  ressenti: z.number().int().min(1).max(5).nullable().default(null),
  douleurs: z.array(DouleurSchema).default([]),
  commentaire: z.string().max(4000).default(''),
});
export type SeanceRealisee = z.infer<typeof SeanceRealiseeSchema>;

export const WellnessSchema = z.object({
  date: IsoDate,
  poids_kg: z.number().positive().nullable().default(null),
  fc_repos: z.number().int().positive().nullable().default(null),
  hrv: z.number().positive().nullable().default(null),
  sommeil_h: z.number().nonnegative().max(24).nullable().default(null),
  /** 1 = frais, 5 = vide. */
  fatigue_1_5: z.number().int().min(1).max(5).nullable().default(null),
  /** 1 = mauvaise, 5 = excellente. */
  humeur_1_5: z.number().int().min(1).max(5).nullable().default(null),
  note: z.string().max(2000).default(''),
});
export type Wellness = z.infer<typeof WellnessSchema>;
