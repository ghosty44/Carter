import { z } from 'zod';

/** Type de semaine dans la periodisation. */
export const TypeSemaine = z.enum([
  'CHARGE',
  'ALLEGEE',
  'AFFUTAGE',
  'COURSE',
  'RECUPERATION',
]);
export type TypeSemaine = z.infer<typeof TypeSemaine>;

/** Nature d'une seance. REPOS existe pour rendre une journee vide explicite. */
export const TypeSeance = z.enum([
  'FOOTING',
  'SORTIE_LONGUE',
  'COTES',
  'SEUIL',
  'RENFO',
  'VELO',
  'REPOS',
]);
export type TypeSeance = z.infer<typeof TypeSeance>;

/** Types qui comptent dans le volume de course a pied. */
export const TYPES_COURSE: readonly TypeSeance[] = [
  'FOOTING',
  'SORTIE_LONGUE',
  'COTES',
  'SEUIL',
];

/** Intensite cible. EF = endurance fondamentale. */
export const Intensite = z.enum(['EF', 'Z2', 'SEUIL', 'VMA']);
export type Intensite = z.infer<typeof Intensite>;

/** Etat de synchronisation d'une seance vis-a-vis du provider. */
export const SyncState = z.enum([
  'A_CREER',
  'SYNCHRONISEE',
  'A_METTRE_A_JOUR',
  'A_SUPPRIMER',
  'ERREUR',
]);
export type SyncState = z.infer<typeof SyncState>;

/**
 * Providers connus. Le moteur de synchro ne connait que cette liste.
 *
 * GARMIN        : API Training officielle, sous reserve d'acces partenaire.
 * GARMIN_DIRECT : connexion au compte Garmin Connect de l'athlete, par le
 *                 meme mecanisme que l'application mobile. Non officiel.
 */
export const NomProvider = z.enum(['INTERVALS', 'GARMIN', 'GARMIN_DIRECT', 'LOCAL']);
export type NomProvider = z.infer<typeof NomProvider>;

/** Role d'une etape dans une seance structuree. */
export const RoleEtape = z.enum([
  'ECHAUFFEMENT',
  'EFFORT',
  'RECUPERATION',
  'REPETITION',
  'RETOUR_AU_CALME',
]);
export type RoleEtape = z.infer<typeof RoleEtape>;

/** Nature de la cible d'une etape structuree. */
export const TypeCible = z.enum(['ALLURE', 'FC', 'PUISSANCE', 'AUCUNE']);
export type TypeCible = z.infer<typeof TypeCible>;

/** Priorite d'une course dans la saison. */
export const PrioriteCourse = z.enum(['A', 'B', 'C']);
export type PrioriteCourse = z.infer<typeof PrioriteCourse>;

/** Origine d'une seance realisee. */
export const SourceRealisee = z.enum([
  'INTERVALS',
  'GARMIN_DIRECT',
  'STRAVA',
  'FIT_IMPORT',
  'MANUEL',
]);
export type SourceRealisee = z.infer<typeof SourceRealisee>;

/** Action possible lors d'une synchronisation. */
export const ActionSync = z.enum(['CREER', 'METTRE_A_JOUR', 'SUPPRIMER']);
export type ActionSync = z.infer<typeof ActionSync>;
