import { z } from 'zod';

/**
 * Sports, ramenes a un vocabulaire stable.
 *
 * Garmin expose des dizaines de `typeKey` (`running`, `treadmill_running`,
 * `track_running`...). Les regrouper ici evite que chaque ecran refasse le
 * meme tri, et que l'ajout d'un sport casse les statistiques.
 */
export const Sport = z.enum([
  'COURSE',
  'TRAIL',
  'COURSE_INTERIEUR',
  'VELO',
  'VELO_INTERIEUR',
  'RENFORCEMENT',
  'MARCHE',
  'RANDONNEE',
  'NATATION',
  'AUTRE',
]);
export type Sport = z.infer<typeof Sport>;

/** Sports comptes comme de la course a pied dans les totaux. */
export const SPORTS_COURSE: readonly Sport[] = ['COURSE', 'TRAIL', 'COURSE_INTERIEUR'];

/** Libelles affiches. */
export const LIBELLE_SPORT: Record<Sport, string> = {
  COURSE: 'Course',
  TRAIL: 'Trail',
  COURSE_INTERIEUR: 'Tapis',
  VELO: 'Vélo',
  VELO_INTERIEUR: 'Home-trainer',
  RENFORCEMENT: 'Renforcement',
  MARCHE: 'Marche',
  RANDONNEE: 'Randonnée',
  NATATION: 'Natation',
  AUTRE: 'Autre',
};

export function estCourse(sport: Sport): boolean {
  return SPORTS_COURSE.includes(sport);
}
