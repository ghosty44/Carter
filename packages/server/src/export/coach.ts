import {
  SCHEMA_VERSION_COACH,
  ajouterJours,
  diffJours,
  formatDuree,
  type Alerte,
  type ExportCoach,
  type IsoDate,
  type Plan,
  type SeanceRealisee,
  type Wellness,
} from '@carter/shared';
import { calculerTendances, comparerParSemaine } from '../analyse/comparaison.js';

export interface EntreesExportCoach {
  plan: Plan;
  realisees: SeanceRealisee[];
  wellness: Wellness[];
  alertes: Alerte[];
  questions: string[];
  contraintes: string[];
  debut: IsoDate;
  fin: IsoDate;
  today: IsoDate;
}

/** Contraintes permanentes de l'athlete, rappelees a chaque echange. */
export const CONTRAINTES_PAR_DEFAUT = [
  'Hernie discale L5 — pas de flexion lombaire chargee',
  'Mollets et tendon d\'Achille fragiles — pas de pliometrie ni de travail explosif',
  'Chevilles instables — proprioception a maintenir',
];

/** Construit la charge utile JSON conforme au schema d'echange. */
export function construireExportCoach(e: EntreesExportCoach): ExportCoach {
  const comparaisons = comparerParSemaine(e.plan, e.realisees, e.today).filter(
    (c) => c.semaine.date_debut <= e.fin && c.fin >= e.debut,
  );

  const dansPeriode = e.realisees.filter((r) => r.date >= e.debut && r.date <= e.fin);
  const wellnessPeriode = e.wellness.filter((w) => w.date >= e.debut && w.date <= e.fin);

  const blocs = new Map<number, { numero: number; nom: string; objectif: string }>();
  for (const c of comparaisons) {
    const bloc = e.plan.blocs.find((b) => b.numero === c.semaine.bloc_numero);
    if (bloc) blocs.set(bloc.numero, { numero: bloc.numero, nom: bloc.nom, objectif: bloc.objectif });
  }

  return {
    schema_version: SCHEMA_VERSION_COACH,
    genere_le: new Date().toISOString(),
    plan: { id: e.plan.id, nom: e.plan.nom, version: e.plan.version },
    periode: { debut: e.debut, fin: e.fin },
    blocs_couverts: [...blocs.values()].sort((a, b) => a.numero - b.numero),
    courses: e.plan.courses.map((c) => ({
      nom: c.nom,
      date: c.date,
      distance_km: c.distance_km,
      denivele_m: c.denivele_m,
      priorite: c.priorite,
      jours_restants: diffJours(e.today, c.date),
    })),
    semaines: comparaisons.map((c) => ({
      numero_global: c.semaine.numero_global,
      date_debut: c.semaine.date_debut,
      type: c.semaine.type,
      prevu: c.prevu,
      realise: {
        volume_course_min: c.realise.volume_course_min,
        nb_seances_course: c.realise.nb_seances_course,
        sortie_longue_min: c.realise.sortie_longue_min,
        denivele_m: c.realise.denivele_m,
      },
      observance_pct: c.observance_pct,
      seances_manquees: c.manquees.map((m) => ({
        date: m.date,
        titre: m.titre,
        raison: m.raison,
      })),
    })),
    tendances: calculerTendances(wellnessPeriode, dansPeriode),
    douleurs: dansPeriode.flatMap((r) =>
      r.douleurs.map((d) => ({ ...d, date: r.date, seance: r.nom || 'seance' })),
    ),
    alertes: e.alertes.map((a) => ({ code: a.code, gravite: a.gravite, message: a.message })),
    contraintes_athlete: e.contraintes,
    questions_ouvertes: e.questions,
    plan_actuel: e.plan,
  };
}

/**
 * Resume Markdown destine a etre colle dans une conversation.
 *
 * Contrainte du brief : deux pages maximum. Ce qui compte tient dans les
 * premieres lignes — un coach qui survole doit voir l'observance, les
 * douleurs et les questions sans derouler. Le detail exhaustif est dans le
 * JSON, pas ici.
 */
export function rendreMarkdownCoach(e: ExportCoach): string {
  const l: string[] = [];

  l.push(`# ${e.plan.nom}`);
  l.push('');
  l.push(
    `Periode du ${e.periode.debut} au ${e.periode.fin} — plan version ${e.plan.version}`,
  );

  if (e.blocs_couverts.length > 0) {
    const blocs = e.blocs_couverts.map((b) => `bloc ${b.numero} « ${b.nom} »`).join(', ');
    l.push(`Bloc(s) couvert(s) : ${blocs}`);
  }

  if (e.courses.length > 0) {
    l.push('');
    for (const c of e.courses) {
      const reste =
        c.jours_restants >= 0 ? `dans ${c.jours_restants} j` : `il y a ${-c.jours_restants} j`;
      l.push(
        `Objectif ${c.priorite} : ${c.nom}, ${c.date} (${reste}) — ${c.distance_km} km / ${c.denivele_m} m D+`,
      );
    }
  }

  l.push('', '## Prevu contre realise', '');
  l.push('| Sem. | Type | Volume prevu | Volume realise | Seances | Sortie longue | Observance |');
  l.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const s of e.semaines) {
    l.push(
      [
        s.numero_global,
        s.type,
        formatDuree(s.prevu.volume_course_min),
        formatDuree(s.realise.volume_course_min),
        `${s.realise.nb_seances_course}/${s.prevu.nb_seances_course}`,
        `${formatDuree(s.realise.sortie_longue_min ?? 0)} / ${formatDuree(s.prevu.sortie_longue_min ?? 0)}`,
        `${s.observance_pct} %`,
      ]
        .map((c) => `| ${c} `)
        .join('') + '|',
    );
  }

  const manquees = e.semaines.flatMap((s) =>
    s.seances_manquees.map((m) => ({ ...m, semaine: s.numero_global })),
  );
  if (manquees.length > 0) {
    l.push('', '## Seances manquees', '');
    for (const m of manquees) {
      l.push(`- ${m.date} (sem. ${m.semaine}) — ${m.titre}${m.raison ? ` : ${m.raison}` : ''}`);
    }
  }

  l.push('', '## Etat de forme', '');
  const t = e.tendances;
  l.push(
    `- FC de repos : ${valeur(t.fc_repos_derniere, 'bpm')} (moyenne 14 j : ${valeur(t.fc_repos_moy_14j, 'bpm')})`,
  );
  l.push(`- Sommeil moyen : ${valeur(t.sommeil_moy_h, 'h')}`);
  l.push(`- Fatigue declaree : ${valeur(t.fatigue_moy_1_5, '/5')}`);
  l.push(`- Humeur : ${valeur(t.humeur_moy_1_5, '/5')}`);
  l.push(`- RPE moyen : ${valeur(t.rpe_moy, '/10')}`);

  if (e.douleurs.length > 0) {
    l.push('', '## Douleurs signalees', '');
    for (const [zone, entrees] of grouperParZone(e.douleurs)) {
      const suite = entrees
        .map((d) => `${d.date} : ${d.intensite}/10`)
        .join(' -> ');
      const evolution = tendanceDouleur(entrees.map((d) => d.intensite));
      l.push(`- **${zone}** — ${suite} (${evolution})`);
      const notes = entrees.map((d) => d.note).filter((n) => n.trim() !== '');
      for (const note of notes) l.push(`  - ${note}`);
    }
  }

  if (e.alertes.length > 0) {
    l.push('', '## Alertes automatiques', '');
    for (const a of e.alertes) l.push(`- [${a.gravite}] ${a.message}`);
  }

  l.push('', '## Contraintes permanentes', '');
  for (const c of e.contraintes_athlete) l.push(`- ${c}`);

  if (e.questions_ouvertes.length > 0) {
    l.push('', '## Questions', '');
    for (const q of e.questions_ouvertes) l.push(`- ${q}`);
  }

  l.push(
    '',
    '---',
    '',
    "Pour repondre avec un plan revise : renvoyer un JSON conforme au schema " +
      `d'echange version ${e.schema_version} (le plan actuel est joint dans l'export JSON). ` +
      "L'app validera le schema et affichera un diff avant d'appliquer quoi que ce soit.",
  );

  return l.join('\n');
}

function valeur(v: number | null, unite: string): string {
  return v === null ? 'non renseigne' : `${v} ${unite}`.trim();
}

function grouperParZone(
  douleurs: ExportCoach['douleurs'],
): [string, ExportCoach['douleurs']][] {
  const groupes = new Map<string, ExportCoach['douleurs']>();
  for (const d of douleurs) {
    const liste = groupes.get(d.zone) ?? [];
    liste.push(d);
    groupes.set(d.zone, liste);
  }
  for (const liste of groupes.values()) liste.sort((a, b) => a.date.localeCompare(b.date));
  return [...groupes.entries()];
}

function tendanceDouleur(intensites: number[]): string {
  if (intensites.length < 2) return 'signalee une fois';
  const premier = intensites[0]!;
  const dernier = intensites.at(-1)!;
  if (dernier > premier) return 'en aggravation';
  if (dernier < premier) return 'en amelioration';
  return 'stable';
}

/** Periode par defaut : les 4 dernieres semaines terminees. */
export function periodeParDefaut(today: IsoDate): { debut: IsoDate; fin: IsoDate } {
  return { debut: ajouterJours(today, -28), fin: today };
}
