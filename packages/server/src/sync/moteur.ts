import {
  aujourdhui,
  seancesPlanifiees,
  type ApercuSync,
  type IsoDate,
  type OperationSync,
  type Plan,
  type ResultatOperation,
  type ResultatSync,
  type SeancePlanifiee,
} from '@carter/shared';
import type { PlanSyncProvider } from '../providers/types.js';
import { FileSequentielle, type OptionsFile } from './file.js';

/**
 * Ecriture de l'etat de synchro. Abstrait pour que le moteur se teste sans
 * base de donnees : l'implementation SQLite vit dans `src/db/`.
 */
export interface DepotSync {
  enregistrerCorrespondance(entree: {
    seanceId: string;
    externalId: string;
    provider: ApercuSync['provider'];
    hash: string;
  }): void;
  oublierCorrespondance(externalId: string): void;
  journaliser(entree: {
    provider: ApercuSync['provider'];
    action: OperationSync['action'];
    seanceId: string | null;
    externalId: string | null;
    dateSeance: IsoDate | null;
    titre: string;
    ok: boolean;
    erreur: string | null;
    reponse: string | null;
  }): void;
}

export interface OptionsApplication {
  /** Sauvegarde de la base prise avant application, tracee dans le resultat. */
  sauvegarde?: string | null;
  file?: Partial<OptionsFile>;
  today?: IsoDate;
}

/**
 * Applique un apercu de synchronisation.
 *
 * L'apercu est recalculable et peut avoir vieilli entre son affichage et la
 * confirmation de l'utilisateur. Le moteur ne lui fait donc pas confiance : il
 * revalide chaque operation contre le plan courant et contre la protection du
 * passe avant de l'envoyer. Un apercu affiche hier soir ne peut pas ecrire sur
 * une date devenue passee entre-temps.
 */
export async function appliquerSync(
  plan: Plan,
  apercu: ApercuSync,
  provider: PlanSyncProvider,
  depot: DepotSync,
  options: OptionsApplication = {},
): Promise<ResultatSync> {
  const demarre = new Date().toISOString();
  const today = options.today ?? aujourdhui();
  const file = new FileSequentielle(options.file ?? {});

  const parId = new Map<string, SeancePlanifiee>();
  for (const p of seancesPlanifiees(plan)) parId.set(p.seance.id, p);

  // Suppressions d'abord : liberer le calendrier avant d'y reecrire evite
  // d'afficher transitoirement deux seances le meme jour cote montre.
  const ops = [...apercu.aSupprimer, ...apercu.aMettreAJour, ...apercu.aCreer];

  const resultats: ResultatOperation[] = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;

    const refus = verifier(op, parId, today, provider);
    if (refus !== null) {
      resultats.push({ operation: op, ok: false, externalId: op.externalId, erreur: refus, tentatives: 0 });
      depot.journaliser({
        provider: apercu.provider,
        action: op.action,
        seanceId: op.seanceId,
        externalId: op.externalId,
        dateSeance: op.date,
        titre: op.titre,
        ok: false,
        erreur: refus,
        reponse: null,
      });
      continue;
    }

    const tentative = await file.executerUne(() => executer(op, parId, provider));

    if (tentative.ok) {
      const externalId = tentative.valeur ?? op.externalId;
      appliquerEffet(op, externalId, parId, depot, apercu.provider);
      resultats.push({ operation: op, ok: true, externalId, erreur: null, tentatives: tentative.tentatives });
      depot.journaliser({
        provider: apercu.provider,
        action: op.action,
        seanceId: op.seanceId,
        externalId,
        dateSeance: op.date,
        titre: op.titre,
        ok: true,
        erreur: null,
        reponse: null,
      });
    } else {
      const message = tentative.erreur?.message ?? 'erreur inconnue';
      resultats.push({
        operation: op,
        ok: false,
        externalId: op.externalId,
        erreur: message,
        tentatives: tentative.tentatives,
      });
      depot.journaliser({
        provider: apercu.provider,
        action: op.action,
        seanceId: op.seanceId,
        externalId: op.externalId,
        dateSeance: op.date,
        titre: op.titre,
        ok: false,
        erreur: message,
        reponse: null,
      });
    }
  }

  const echecs = resultats.filter((r) => !r.ok).length;

  return {
    provider: apercu.provider,
    demarre_le: demarre,
    termine_le: new Date().toISOString(),
    resultats,
    succes: resultats.length - echecs,
    echecs,
    sauvegarde: options.sauvegarde ?? null,
  };
}

/** Renvoie un motif de refus, ou null si l'operation peut partir. */
function verifier(
  op: OperationSync,
  parId: Map<string, SeancePlanifiee>,
  today: IsoDate,
  provider: PlanSyncProvider,
): string | null {
  if (!provider.estConfigure()) {
    return `provider ${provider.libelle} non configure`;
  }

  const caps = provider.capacites();
  if (op.action === 'SUPPRIMER' && !caps.supprimer) {
    return `${provider.libelle} ne sait pas supprimer`;
  }
  if (op.action !== 'SUPPRIMER' && !caps.ecrire) {
    return `${provider.libelle} est en lecture seule`;
  }

  if (op.date < today) {
    return `operation perimee : ${op.date} est anterieure a aujourd'hui (${today})`;
  }

  if (op.action === 'SUPPRIMER') {
    if (op.externalId === null) return 'suppression sans identifiant distant';
    return null;
  }

  if (op.seanceId === null) return 'operation sans seance de reference';
  const planifiee = parId.get(op.seanceId);
  if (planifiee === undefined) {
    return 'la seance a disparu du plan depuis le calcul de l apercu';
  }
  if (planifiee.date !== op.date) {
    return `la seance a ete deplacee (${op.date} -> ${planifiee.date}) depuis le calcul de l apercu`;
  }
  if (op.action === 'METTRE_A_JOUR' && op.externalId === null) {
    return 'mise a jour sans identifiant distant';
  }
  return null;
}

async function executer(
  op: OperationSync,
  parId: Map<string, SeancePlanifiee>,
  provider: PlanSyncProvider,
): Promise<string | null> {
  if (op.action === 'SUPPRIMER') {
    await provider.supprimerSeance(op.externalId!);
    return op.externalId;
  }

  const planifiee = parId.get(op.seanceId!)!;

  if (op.action === 'CREER') {
    const { externalId } = await provider.creerSeance(planifiee);
    return externalId;
  }

  await provider.mettreAJourSeance(op.externalId!, planifiee);
  return op.externalId;
}

function appliquerEffet(
  op: OperationSync,
  externalId: string | null,
  parId: Map<string, SeancePlanifiee>,
  depot: DepotSync,
  provider: ApercuSync['provider'],
): void {
  if (op.action === 'SUPPRIMER') {
    if (externalId !== null) depot.oublierCorrespondance(externalId);
    return;
  }
  const planifiee = parId.get(op.seanceId!);
  if (planifiee === undefined || externalId === null) return;
  depot.enregistrerCorrespondance({
    seanceId: planifiee.seance.id,
    externalId,
    provider,
    hash: planifiee.hash,
  });
}

/** Reconstruit un apercu ne contenant que les operations en echec. */
export function apercuDesEchecs(apercu: ApercuSync, resultat: ResultatSync): ApercuSync {
  const echouees = resultat.resultats.filter((r) => !r.ok).map((r) => r.operation);
  return {
    ...apercu,
    aCreer: echouees.filter((o) => o.action === 'CREER'),
    aMettreAJour: echouees.filter((o) => o.action === 'METTRE_A_JOUR'),
    aSupprimer: echouees.filter((o) => o.action === 'SUPPRIMER'),
    calcule_le: new Date().toISOString(),
  };
}
