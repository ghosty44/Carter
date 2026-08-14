import {
  aujourdhui,
  ajouterJours,
  seancesPlanifiees,
  type ApercuSync,
  type IsoDate,
  type NomProvider,
  type OperationSync,
  type Plan,
  type SeanceExterne,
  type SeancePlanifiee,
  type TypeSeance,
} from '@carter/shared';

/** Ce que le serveur sait d'une seance deja poussee chez un provider. */
export interface Correspondance {
  seanceId: string;
  externalId: string;
  provider: NomProvider;
  /** Hash du contenu au moment de la derniere synchro reussie. */
  hashSynchronise: string;
}

export interface OptionsDiff {
  provider: NomProvider;
  /** Types pousses vers le calendrier. REPOS n'est jamais synchronise. */
  typesSynchronises: readonly TypeSeance[];
  fenetreSemaines: number;
  /** Injectable pour les tests. Par defaut, la date du jour. */
  today?: IsoDate;
}

/**
 * Clef d'idempotence envoyee au provider.
 *
 * Elle est deterministe : deux clics sur « Appliquer » produisent la meme
 * clef, donc le provider reconnait la seconde requete comme un doublon au lieu
 * de creer un second evenement. C'est la seule protection qui tienne quand le
 * reseau repond lentement et que l'utilisateur reclique.
 */
export function clefIdempotence(planId: string, seanceId: string): string {
  return `carter:${planId}:${seanceId}`;
}

/**
 * Calcule ce qu'une synchronisation ferait, sans rien envoyer.
 *
 * Deux garde-fous sont appliques ici et nulle part ailleurs :
 *
 * 1. Protection du passe : aucune operation ne porte sur une date anterieure
 *    a aujourd'hui, ni cote plan ni cote provider. Un evenement passe est de
 *    l'historique : on ne le reecrit pas, on ne l'efface pas.
 * 2. Propriete : seuls les evenements marques comme appartenant a Carter
 *    peuvent etre supprimes. Un evenement cree a la main dans le calendrier
 *    n'est jamais touche, meme s'il tombe le meme jour.
 */
export function calculerDiff(
  plan: Plan,
  distantes: SeanceExterne[],
  correspondances: Correspondance[],
  options: OptionsDiff,
): ApercuSync {
  const today = options.today ?? aujourdhui();
  const fin = ajouterJours(today, options.fenetreSemaines * 7);
  const typesOk = new Set<TypeSeance>(options.typesSynchronises);

  const parSeanceId = new Map<string, Correspondance>();
  for (const c of correspondances) {
    if (c.provider === options.provider) parSeanceId.set(c.seanceId, c);
  }

  const parExternalId = new Map<string, SeanceExterne>();
  for (const d of distantes) parExternalId.set(d.externalId, d);

  const aCreer: OperationSync[] = [];
  const aMettreAJour: OperationSync[] = [];
  const aSupprimer: OperationSync[] = [];
  const ignorees: ApercuSync['ignorees'] = [];

  /** externalId encore rattaches a une seance vivante : a ne pas supprimer. */
  const externalIdsConserves = new Set<string>();

  for (const p of seancesPlanifiees(plan)) {
    const raison = raisonIgnorer(p, { today, fin, typesOk });
    if (raison !== null) {
      ignorees.push({
        seanceId: p.seance.id,
        date: p.date,
        titre: p.seance.titre,
        raison,
      });
      continue;
    }

    const corr = parSeanceId.get(p.seance.id);
    const distante = corr ? parExternalId.get(corr.externalId) : undefined;

    if (corr === undefined || distante === undefined) {
      aCreer.push(
        operation('CREER', p, null, {
          motif:
            corr === undefined
              ? 'jamais synchronisee'
              : "l'evenement a disparu chez le provider, il est recree",
        }),
      );
      continue;
    }

    if (distante.date < today) {
      // L'evenement pointe sur une date passee alors que la seance a ete
      // deplacee dans le futur. On laisse l'ancien tel quel (protection du
      // passe) et on en cree un nouveau a la bonne date.
      aCreer.push(
        operation('CREER', p, null, {
          motif: `seance deplacee depuis le ${distante.date}, l'evenement passe est laisse intact`,
        }),
      );
      externalIdsConserves.add(distante.externalId);
      continue;
    }

    externalIdsConserves.add(distante.externalId);

    if (corr.hashSynchronise !== p.hash) {
      aMettreAJour.push(
        operation('METTRE_A_JOUR', p, distante.externalId, {
          motif:
            distante.date === p.date
              ? 'contenu modifie depuis la derniere synchro'
              : `deplacee du ${distante.date} au ${p.date}`,
        }),
      );
    }
  }

  for (const distante of distantes) {
    if (!distante.possedeParCarter) continue;
    if (externalIdsConserves.has(distante.externalId)) continue;
    if (distante.date < today) continue; // protection du passe
    if (distante.date > fin) continue; // hors fenetre : hors de notre ressort

    aSupprimer.push({
      action: 'SUPPRIMER',
      seanceId: null,
      externalId: distante.externalId,
      date: distante.date,
      titre: distante.nom,
      type: null,
      motif: 'plus aucune seance du plan ne correspond a cet evenement',
    });
  }

  const cle = (o: OperationSync) => `${o.date}#${o.titre}`;
  aCreer.sort((a, b) => cle(a).localeCompare(cle(b)));
  aMettreAJour.sort((a, b) => cle(a).localeCompare(cle(b)));
  aSupprimer.sort((a, b) => cle(a).localeCompare(cle(b)));

  return {
    provider: options.provider,
    fenetre: { debut: today, fin },
    aCreer,
    aMettreAJour,
    aSupprimer,
    ignorees,
    calcule_le: new Date().toISOString(),
  };
}

function raisonIgnorer(
  p: SeancePlanifiee,
  bornes: { today: IsoDate; fin: IsoDate; typesOk: Set<TypeSeance> },
): string | null {
  if (p.seance.type === 'REPOS') return 'journee de repos';
  if (!bornes.typesOk.has(p.seance.type)) {
    return `type ${p.seance.type} exclu de la synchro`;
  }
  if (p.date < bornes.today) return 'date passee (protection du passe)';
  if (p.date > bornes.fin) return 'au-dela de la fenetre de synchro';
  return null;
}

function operation(
  action: OperationSync['action'],
  p: SeancePlanifiee,
  externalId: string | null,
  extra: { motif: string },
): OperationSync {
  return {
    action,
    seanceId: p.seance.id,
    externalId,
    date: p.date,
    titre: p.seance.titre,
    type: p.seance.type,
    motif: extra.motif,
  };
}

/** Vrai si l'apercu ne propose aucune modification. */
export function apercuVide(apercu: ApercuSync): boolean {
  return (
    apercu.aCreer.length === 0 &&
    apercu.aMettreAJour.length === 0 &&
    apercu.aSupprimer.length === 0
  );
}
