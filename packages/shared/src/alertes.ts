import { z } from 'zod';
import { IsoDate } from './plan.js';

export const CodeAlerte = z.enum([
  'VOLUME_HAUSSE_10PCT',
  'QUATRIEME_SEMAINE_CHARGE',
  'FC_REPOS_ELEVEE',
  'DOULEUR_PERSISTANTE',
  'OBSERVANCE_FAIBLE',
]);
export type CodeAlerte = z.infer<typeof CodeAlerte>;

export const GraviteAlerte = z.enum(['INFO', 'ATTENTION', 'CRITIQUE']);
export type GraviteAlerte = z.infer<typeof GraviteAlerte>;

export interface Alerte {
  code: CodeAlerte;
  gravite: GraviteAlerte;
  message: string;
  /** Date ou semaine concernee, pour pointer l'endroit du plan. */
  reference: IsoDate | null;
  /** Chiffres qui ont declenche la regle, affiches au survol. */
  details: Record<string, number | string | null>;
}

/**
 * Les alertes informent, elles ne modifient jamais le plan.
 * Aucune fonction de ce module ne doit ecrire quoi que ce soit.
 */
export const AVERTISSEMENT_ALERTES =
  "Ces alertes sont des reperes d'entrainement calcules localement. " +
  "Elles ne constituent pas un avis medical et ne modifient jamais le plan.";
