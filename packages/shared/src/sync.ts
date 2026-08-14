import { z } from 'zod';
import { ActionSync, NomProvider, TypeSeance } from './enums.js';
import { IsoDate } from './plan.js';

/** Un evenement tel qu'il existe chez le provider. */
export interface SeanceExterne {
  externalId: string;
  date: IsoDate;
  nom: string;
  /** Vrai si l'evenement a ete cree par Carter (prefixe ou table locale). */
  possedeParCarter: boolean;
  /** Charge utile brute, conservee pour le journal et le diagnostic. */
  brut?: unknown;
}

export interface CapacitesProvider {
  ecrire: boolean;
  lire: boolean;
  supprimer: boolean;
}

/** Une operation que la synchro appliquerait. */
export interface OperationSync {
  action: z.infer<typeof ActionSync>;
  /** Null pour une suppression d'orphelin sans seance locale correspondante. */
  seanceId: string | null;
  externalId: string | null;
  date: IsoDate;
  titre: string;
  type: z.infer<typeof TypeSeance> | null;
  /** Pourquoi cette operation est proposee, affiche dans l'apercu. */
  motif: string;
}

export interface ApercuSync {
  provider: z.infer<typeof NomProvider>;
  fenetre: { debut: IsoDate; fin: IsoDate };
  aCreer: OperationSync[];
  aMettreAJour: OperationSync[];
  aSupprimer: OperationSync[];
  /** Seances ignorees et pourquoi (passe, type non synchronise, hors fenetre). */
  ignorees: { seanceId: string; date: IsoDate; titre: string; raison: string }[];
  calcule_le: string;
}

export interface ResultatOperation {
  operation: OperationSync;
  ok: boolean;
  externalId: string | null;
  erreur: string | null;
  /** Nombre de tentatives consommees, backoff compris. */
  tentatives: number;
}

export interface ResultatSync {
  provider: z.infer<typeof NomProvider>;
  demarre_le: string;
  termine_le: string;
  resultats: ResultatOperation[];
  succes: number;
  echecs: number;
  /** Chemin de la sauvegarde prise avant application. */
  sauvegarde: string | null;
}

export const EntreeJournalSchema = z.object({
  id: z.number().int(),
  horodatage: z.string(),
  provider: NomProvider,
  action: ActionSync,
  seance_id: z.string().nullable(),
  external_id: z.string().nullable(),
  date_seance: IsoDate.nullable(),
  titre: z.string(),
  ok: z.boolean(),
  erreur: z.string().nullable(),
  reponse: z.string().nullable(),
});
export type EntreeJournal = z.infer<typeof EntreeJournalSchema>;
