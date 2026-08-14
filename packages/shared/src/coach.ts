import { z } from 'zod';
import { IsoDate, PlanSchema } from './plan.js';
import { DouleurSchema } from './realise.js';
import { TypeSemaine } from './enums.js';

/**
 * Schema d'echange avec le coach IA.
 *
 * Ce schema est un contrat : il est versionne et documente dans le README.
 * L'export produit `schema_version`, et l'import refuse une version qu'il ne
 * connait pas plutot que de deviner. C'est ce qui permet au coach de renvoyer
 * un plan revise sans que l'app ait a interpreter du texte libre.
 */
export const SCHEMA_VERSION_COACH = 1 as const;

export const SemaineComparaisonSchema = z.object({
  numero_global: z.number().int(),
  date_debut: IsoDate,
  type: TypeSemaine,
  prevu: z.object({
    volume_course_min: z.number(),
    nb_seances_course: z.number().int(),
    sortie_longue_min: z.number().nullable(),
    denivele_m: z.number(),
  }),
  realise: z.object({
    volume_course_min: z.number(),
    nb_seances_course: z.number().int(),
    sortie_longue_min: z.number().nullable(),
    denivele_m: z.number(),
  }),
  observance_pct: z.number(),
  seances_manquees: z.array(
    z.object({
      date: IsoDate,
      titre: z.string(),
      raison: z.string(),
    }),
  ),
});
export type SemaineComparaison = z.infer<typeof SemaineComparaisonSchema>;

export const TendancesSchema = z.object({
  fc_repos_moy_14j: z.number().nullable(),
  fc_repos_derniere: z.number().nullable(),
  sommeil_moy_h: z.number().nullable(),
  fatigue_moy_1_5: z.number().nullable(),
  humeur_moy_1_5: z.number().nullable(),
  rpe_moy: z.number().nullable(),
});

export const ExportCoachSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION_COACH),
  genere_le: z.string(),
  plan: z.object({
    id: z.string(),
    nom: z.string(),
    version: z.number().int(),
  }),
  periode: z.object({ debut: IsoDate, fin: IsoDate }),
  blocs_couverts: z.array(
    z.object({ numero: z.number().int(), nom: z.string(), objectif: z.string() }),
  ),
  courses: z.array(
    z.object({
      nom: z.string(),
      date: IsoDate,
      distance_km: z.number(),
      denivele_m: z.number(),
      priorite: z.string(),
      jours_restants: z.number().int(),
    }),
  ),
  semaines: z.array(SemaineComparaisonSchema),
  tendances: TendancesSchema,
  douleurs: z.array(
    DouleurSchema.extend({
      date: IsoDate,
      seance: z.string(),
    }),
  ),
  alertes: z.array(
    z.object({ code: z.string(), gravite: z.string(), message: z.string() }),
  ),
  contraintes_athlete: z.array(z.string()),
  questions_ouvertes: z.array(z.string()),
  /** Le plan courant, pour que le coach puisse le renvoyer amende. */
  plan_actuel: PlanSchema,
});
export type ExportCoach = z.infer<typeof ExportCoachSchema>;

/**
 * Ce que l'app accepte en retour. Volontairement permissif sur l'enveloppe
 * (le coach peut ne renvoyer que le plan) mais strict sur le plan lui-meme.
 */
export const PlanReviseSchema = z.union([
  z.object({
    schema_version: z.literal(SCHEMA_VERSION_COACH),
    plan: PlanSchema,
    commentaire_coach: z.string().max(20000).optional(),
  }),
  PlanSchema,
]);
export type PlanRevise = z.infer<typeof PlanReviseSchema>;

/** Extrait le plan d'une reponse coach, quelle que soit l'enveloppe. */
export function extrairePlanRevise(valeur: PlanRevise): {
  plan: z.infer<typeof PlanSchema>;
  commentaire: string | null;
} {
  if ('plan' in valeur && typeof valeur.plan === 'object') {
    return { plan: valeur.plan, commentaire: valeur.commentaire_coach ?? null };
  }
  return { plan: valeur as z.infer<typeof PlanSchema>, commentaire: null };
}
