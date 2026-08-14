import { z } from 'zod';
import {
  Intensite,
  NomProvider,
  PrioriteCourse,
  RoleEtape,
  SyncState,
  TypeCible,
  TypeSeance,
  TypeSemaine,
} from './enums.js';

/**
 * Les dates sont manipulees en chaines `YYYY-MM-DD`, jamais en `Date`.
 * Un plan d'entrainement est un objet de calendrier local : le fuseau horaire
 * n'a aucun sens ici, et l'utiliser introduit des decalages d'un jour selon
 * l'heure a laquelle on ouvre l'app. Les providers attendent d'ailleurs une
 * date locale (`start_date_local` chez Intervals.icu).
 */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'date inexistante');
export type IsoDate = z.infer<typeof IsoDate>;

export const IsoDateTime = z.string().datetime({ offset: true });

/** Cible d'une etape structuree (allure, FC ou puissance). */
export const CibleSchema = z
  .object({
    type: TypeCible.default('AUCUNE'),
    min: z.number().nonnegative().optional(),
    max: z.number().nonnegative().optional(),
  })
  .refine(
    (c) => c.min === undefined || c.max === undefined || c.min <= c.max,
    { message: 'cible : min doit etre inferieur ou egal a max' },
  );
export type Cible = z.infer<typeof CibleSchema>;

/**
 * Une etape de seance structuree. Une etape porte soit une duree, soit une
 * distance, jamais les deux : c'est ce que savent exprimer les montres.
 */
export const EtapeSchema = z
  .object({
    role: RoleEtape,
    duree_s: z.number().int().positive().optional(),
    distance_m: z.number().positive().optional(),
    cible: CibleSchema.optional(),
    repetitions: z.number().int().positive().optional(),
    /** Sous-etapes, quand `repetitions` est renseigne (bloc repete). */
    etapes: z.lazy((): z.ZodTypeAny => z.array(EtapeSchema)).optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    (e) =>
      e.role === 'REPETITION'
        ? true
        : (e.duree_s !== undefined) !== (e.distance_m !== undefined),
    { message: 'une etape porte soit duree_s soit distance_m, pas les deux' },
  )
  .refine(
    (e) => e.role !== 'REPETITION' || (e.etapes?.length ?? 0) > 0,
    { message: 'une etape REPETITION doit contenir des sous-etapes' },
  );
export type Etape = {
  role: z.infer<typeof RoleEtape>;
  duree_s?: number;
  distance_m?: number;
  cible?: Cible;
  repetitions?: number;
  etapes?: Etape[];
  note?: string;
};

/**
 * Etat de synchronisation. Absent d'un plan importe : c'est de la comptabilite
 * locale, reconstruite par le serveur. Present a l'export pour diagnostic.
 */
export const EtatSyncSchema = z.object({
  external_id: z.string().nullable().default(null),
  external_provider: NomProvider.nullable().default(null),
  sync_state: SyncState.default('A_CREER'),
  /** Hash du contenu au moment de la derniere synchro reussie. */
  hash_synchronise: z.string().nullable().default(null),
});
export type EtatSync = z.infer<typeof EtatSyncSchema>;

export const SeanceSchema = z.object({
  id: z.string().min(1),
  /** 0 = lundi ... 6 = dimanche. */
  jour_offset: z.number().int().min(0).max(6),
  /** Depart 0. Discrimine deux seances le meme jour (footing puis renfo). */
  ordre_dans_journee: z.number().int().min(0).default(0),
  type: TypeSeance,
  titre: z.string().min(1).max(200),
  duree_min: z.number().int().min(0),
  distance_km: z.number().nonnegative().optional(),
  denivele_m: z.number().nonnegative().optional(),
  intensite: Intensite.default('EF'),
  consignes: z.string().max(4000).default(''),
  structure: z.array(EtapeSchema).optional(),
  sync: EtatSyncSchema.optional(),
});
export type Seance = z.infer<typeof SeanceSchema>;

export const SemaineSchema = z.object({
  id: z.string().min(1),
  /** 1 a 52 sur l'ensemble du plan. */
  numero_global: z.number().int().min(1).max(60),
  /** 1..n a l'interieur du bloc. */
  numero_dans_bloc: z.number().int().min(1).max(20),
  type: TypeSemaine,
  note_coach: z.string().max(2000).default(''),
  seances: z.array(SeanceSchema),
});
export type Semaine = z.infer<typeof SemaineSchema>;

export const BlocSchema = z
  .object({
    id: z.string().min(1),
    numero: z.number().int().min(1).max(12),
    nom: z.string().min(1).max(200),
    /** Lundi de la premiere semaine du bloc. */
    date_debut: IsoDate,
    nb_semaines: z.number().int().min(1).max(20),
    objectif: z.string().max(1000).default(''),
    semaines: z.array(SemaineSchema),
  })
  .refine((b) => b.semaines.length <= b.nb_semaines, {
    message: 'le bloc contient plus de semaines que nb_semaines',
  });
export type Bloc = z.infer<typeof BlocSchema>;

export const CourseSchema = z.object({
  id: z.string().min(1),
  nom: z.string().min(1).max(200),
  date: IsoDate,
  distance_km: z.number().positive(),
  denivele_m: z.number().nonnegative(),
  priorite: PrioriteCourse,
});
export type Course = z.infer<typeof CourseSchema>;

export const PlanSchema = z.object({
  id: z.string().min(1),
  nom: z.string().min(1).max(300),
  version: z.number().int().min(1),
  cree_le: z.string().optional(),
  modifie_le: z.string().optional(),
  courses: z.array(CourseSchema).default([]),
  blocs: z.array(BlocSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * Validation transverse : ce que Zod ne peut pas exprimer champ par champ.
 * Retourne une liste de messages lisibles, vide si le plan est coherent.
 */
export function validerCoherencePlan(plan: Plan): string[] {
  const erreurs: string[] = [];

  const idsBloc = new Set<string>();
  const idsSemaine = new Set<string>();
  const idsSeance = new Set<string>();
  const numerosGlobaux = new Map<number, string>();

  for (const bloc of plan.blocs) {
    if (idsBloc.has(bloc.id)) erreurs.push(`bloc ${bloc.id} : id en double`);
    idsBloc.add(bloc.id);

    if (!estLundi(bloc.date_debut)) {
      erreurs.push(
        `bloc ${bloc.numero} "${bloc.nom}" : date_debut ${bloc.date_debut} n'est pas un lundi`,
      );
    }

    for (const semaine of bloc.semaines) {
      if (idsSemaine.has(semaine.id)) erreurs.push(`semaine ${semaine.id} : id en double`);
      idsSemaine.add(semaine.id);

      if (semaine.numero_dans_bloc > bloc.nb_semaines) {
        erreurs.push(
          `semaine ${semaine.numero_global} : numero_dans_bloc ${semaine.numero_dans_bloc} depasse nb_semaines du bloc ${bloc.numero}`,
        );
      }

      const deja = numerosGlobaux.get(semaine.numero_global);
      if (deja !== undefined) {
        erreurs.push(
          `numero_global ${semaine.numero_global} utilise deux fois (${deja} et ${semaine.id})`,
        );
      }
      numerosGlobaux.set(semaine.numero_global, semaine.id);

      const creneaux = new Set<string>();
      for (const seance of semaine.seances) {
        if (idsSeance.has(seance.id)) erreurs.push(`seance ${seance.id} : id en double`);
        idsSeance.add(seance.id);

        const creneau = `${seance.jour_offset}#${seance.ordre_dans_journee}`;
        if (creneaux.has(creneau)) {
          erreurs.push(
            `semaine ${semaine.numero_global} : deux seances au meme creneau (jour ${seance.jour_offset}, ordre ${seance.ordre_dans_journee})`,
          );
        }
        creneaux.add(creneau);
      }
    }
  }

  for (const course of plan.courses) {
    if (!plan.blocs.length) break;
    const debut = plan.blocs[0]!.date_debut;
    if (course.date < debut) {
      erreurs.push(
        `course "${course.nom}" le ${course.date} : anterieure au debut du plan (${debut})`,
      );
    }
  }

  return erreurs;
}

function estLundi(iso: IsoDate): boolean {
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}
