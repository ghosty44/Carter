import {
  formatDuree,
  seancesPlanifiees,
  volumesParSemaine,
  type IsoDate,
  type Plan,
  type SeancePlanifiee,
} from '@carter/shared';

export type NatureChangement = 'AJOUT' | 'SUPPRESSION' | 'MODIFICATION' | 'DEPLACEMENT';

export interface ChangementSeance {
  nature: NatureChangement;
  seanceId: string;
  date: IsoDate;
  titre: string;
  /** Descriptions lisibles des champs modifies. */
  details: string[];
}

export interface ChangementSemaine {
  numero_global: number;
  date_debut: IsoDate;
  volume_avant_min: number;
  volume_apres_min: number;
  type_avant: string | null;
  type_apres: string | null;
}

export interface DiffPlan {
  version_avant: number;
  version_apres: number;
  seances: ChangementSeance[];
  semaines: ChangementSemaine[];
  resume: {
    ajouts: number;
    suppressions: number;
    modifications: number;
    deplacements: number;
    volume_avant_min: number;
    volume_apres_min: number;
  };
}

/**
 * Diff lisible entre deux plans.
 *
 * Sert a deux endroits : l'historique des versions et la confirmation avant
 * d'appliquer un plan revise par le coach. Dans les deux cas ce qui compte
 * n'est pas le JSON, c'est « qu'est-ce qui bouge dans ma semaine » : on
 * compare donc des seances datees, pas des arbres.
 */
export function diffPlans(avant: Plan, apres: Plan): DiffPlan {
  const avantParId = indexer(avant);
  const apresParId = indexer(apres);

  const seances: ChangementSeance[] = [];

  for (const [id, p] of apresParId) {
    const ancien = avantParId.get(id);
    if (ancien === undefined) {
      seances.push({
        nature: 'AJOUT',
        seanceId: id,
        date: p.date,
        titre: p.seance.titre,
        details: [`${formatDuree(p.seance.duree_min)}, ${p.seance.type}`],
      });
      continue;
    }

    const details = comparerSeances(ancien, p);
    if (details.length === 0) continue;

    seances.push({
      nature: ancien.date !== p.date ? 'DEPLACEMENT' : 'MODIFICATION',
      seanceId: id,
      date: p.date,
      titre: p.seance.titre,
      details,
    });
  }

  for (const [id, p] of avantParId) {
    if (apresParId.has(id)) continue;
    seances.push({
      nature: 'SUPPRESSION',
      seanceId: id,
      date: p.date,
      titre: p.seance.titre,
      details: [`${formatDuree(p.seance.duree_min)}, ${p.seance.type}`],
    });
  }

  seances.sort((a, b) => a.date.localeCompare(b.date) || a.seanceId.localeCompare(b.seanceId));

  const semaines = comparerSemaines(avant, apres);
  const compter = (n: NatureChangement) => seances.filter((s) => s.nature === n).length;

  return {
    version_avant: avant.version,
    version_apres: apres.version,
    seances,
    semaines,
    resume: {
      ajouts: compter('AJOUT'),
      suppressions: compter('SUPPRESSION'),
      modifications: compter('MODIFICATION'),
      deplacements: compter('DEPLACEMENT'),
      volume_avant_min: volumeTotal(avant),
      volume_apres_min: volumeTotal(apres),
    },
  };
}

function indexer(plan: Plan): Map<string, SeancePlanifiee> {
  return new Map(seancesPlanifiees(plan).map((p) => [p.seance.id, p]));
}

function comparerSeances(avant: SeancePlanifiee, apres: SeancePlanifiee): string[] {
  const details: string[] = [];

  if (avant.date !== apres.date) {
    details.push(`deplacee du ${avant.date} au ${apres.date}`);
  }
  if (avant.seance.duree_min !== apres.seance.duree_min) {
    details.push(
      `duree ${formatDuree(avant.seance.duree_min)} -> ${formatDuree(apres.seance.duree_min)}`,
    );
  }
  if (avant.seance.type !== apres.seance.type) {
    details.push(`type ${avant.seance.type} -> ${apres.seance.type}`);
  }
  if (avant.seance.titre !== apres.seance.titre) {
    details.push(`titre « ${avant.seance.titre} » -> « ${apres.seance.titre} »`);
  }
  if (avant.seance.intensite !== apres.seance.intensite) {
    details.push(`intensite ${avant.seance.intensite} -> ${apres.seance.intensite}`);
  }
  if (avant.seance.consignes !== apres.seance.consignes) {
    details.push('consignes reecrites');
  }
  if (JSON.stringify(avant.seance.structure) !== JSON.stringify(apres.seance.structure)) {
    details.push('structure modifiee');
  }
  if ((avant.seance.distance_km ?? null) !== (apres.seance.distance_km ?? null)) {
    details.push(`distance ${avant.seance.distance_km ?? '—'} -> ${apres.seance.distance_km ?? '—'} km`);
  }
  if ((avant.seance.denivele_m ?? null) !== (apres.seance.denivele_m ?? null)) {
    details.push(`denivele ${avant.seance.denivele_m ?? '—'} -> ${apres.seance.denivele_m ?? '—'} m`);
  }

  return details;
}

function comparerSemaines(avant: Plan, apres: Plan): ChangementSemaine[] {
  const va = new Map(volumesParSemaine(avant).map((v) => [v.numero_global, v]));
  const vb = new Map(volumesParSemaine(apres).map((v) => [v.numero_global, v]));

  const numeros = [...new Set([...va.keys(), ...vb.keys()])].sort((a, b) => a - b);
  const changements: ChangementSemaine[] = [];

  for (const numero of numeros) {
    const a = va.get(numero);
    const b = vb.get(numero);
    const volumeA = a?.volume_course_min ?? 0;
    const volumeB = b?.volume_course_min ?? 0;
    if (volumeA === volumeB && a?.type === b?.type) continue;

    changements.push({
      numero_global: numero,
      date_debut: b?.date_debut ?? a!.date_debut,
      volume_avant_min: volumeA,
      volume_apres_min: volumeB,
      type_avant: a?.type ?? null,
      type_apres: b?.type ?? null,
    });
  }

  return changements;
}

function volumeTotal(plan: Plan): number {
  return volumesParSemaine(plan).reduce((s, v) => s + v.volume_course_min, 0);
}

/** Rend le diff en Markdown, pour l'ecran de confirmation et le journal. */
export function diffEnMarkdown(diff: DiffPlan): string {
  if (diff.seances.length === 0 && diff.semaines.length === 0) {
    return '_Aucun changement._';
  }

  const lignes: string[] = [];
  const r = diff.resume;

  lignes.push(
    `**${r.ajouts} ajout(s), ${r.suppressions} suppression(s), ` +
      `${r.modifications} modification(s), ${r.deplacements} deplacement(s)**`,
    '',
    `Volume total : ${formatDuree(r.volume_avant_min)} -> ${formatDuree(r.volume_apres_min)}`,
    '',
  );

  if (diff.semaines.length > 0) {
    lignes.push('### Semaines touchees', '');
    lignes.push('| Semaine | Debut | Volume avant | Volume apres | Type |');
    lignes.push('| --- | --- | --- | --- | --- |');
    for (const s of diff.semaines) {
      const type =
        s.type_avant === s.type_apres ? (s.type_apres ?? '—') : `${s.type_avant} -> ${s.type_apres}`;
      lignes.push(
        `| ${s.numero_global} | ${s.date_debut} | ${formatDuree(s.volume_avant_min)} | ` +
          `${formatDuree(s.volume_apres_min)} | ${type} |`,
      );
    }
    lignes.push('');
  }

  if (diff.seances.length > 0) {
    lignes.push('### Seances', '');
    for (const s of diff.seances) {
      lignes.push(`- **${etiquette(s.nature)}** ${s.date} — ${s.titre}`);
      for (const d of s.details) lignes.push(`  - ${d}`);
    }
  }

  return lignes.join('\n');
}

function etiquette(nature: NatureChangement): string {
  switch (nature) {
    case 'AJOUT':
      return 'Ajout';
    case 'SUPPRESSION':
      return 'Suppression';
    case 'DEPLACEMENT':
      return 'Deplacement';
    default:
      return 'Modification';
  }
}
