import {
  ajouterJours,
  formatDuree,
  type Alerte,
  type IsoDate,
  type Plan,
  type SeanceRealisee,
  type Wellness,
} from '@carter/shared';
import { comparerParSemaine } from '../analyse/comparaison.js';

export interface EntreesAlertes {
  plan: Plan;
  realisees: SeanceRealisee[];
  wellness: Wellness[];
  today: IsoDate;
}

/**
 * Les cinq regles du brief, calculees localement.
 *
 * Aucune de ces fonctions n'ecrit quoi que ce soit : une alerte informe, elle
 * ne corrige pas le plan. C'est deliberé — une app qui allege toute seule la
 * semaine parce que la FC de repos a monte de 6 bpm prend une decision
 * d'entrainement a la place de l'athlete et de son coach.
 */
export function calculerAlertes(entrees: EntreesAlertes): Alerte[] {
  return [
    ...volumeEnHausse(entrees),
    ...semainesDeChargeEnchainees(entrees),
    ...fcReposElevee(entrees),
    ...douleurPersistante(entrees),
    ...observanceFaible(entrees),
  ];
}

/** Volume hebdomadaire en hausse de plus de 10 % par rapport a la semaine precedente. */
function volumeEnHausse({ plan, today }: EntreesAlertes): Alerte[] {
  const semaines = comparerParSemaine(plan, [], today).map((c) => c.semaine);
  const alertes: Alerte[] = [];

  for (let i = 1; i < semaines.length; i++) {
    const precedente = semaines[i - 1]!;
    const courante = semaines[i]!;
    if (precedente.volume_course_min === 0) continue;

    const hausse =
      ((courante.volume_course_min - precedente.volume_course_min) /
        precedente.volume_course_min) *
      100;

    if (hausse <= 10) continue;

    alertes.push({
      code: 'VOLUME_HAUSSE_10PCT',
      gravite: hausse > 20 ? 'ATTENTION' : 'INFO',
      message:
        `Semaine ${courante.numero_global} : volume en hausse de ${Math.round(hausse)} % ` +
        `(${formatDuree(precedente.volume_course_min)} puis ${formatDuree(courante.volume_course_min)}). ` +
        'La regle des 10 % est un repere, pas une loi, mais une hausse repetee sur plusieurs semaines use les tendons.',
      reference: courante.date_debut,
      details: {
        semaine: courante.numero_global,
        volume_precedent_min: precedente.volume_course_min,
        volume_courant_min: courante.volume_course_min,
        hausse_pct: Math.round(hausse),
      },
    });
  }

  return alertes;
}

/** Quatrieme semaine de charge consecutive sans allegement. */
function semainesDeChargeEnchainees({ plan, today }: EntreesAlertes): Alerte[] {
  const semaines = comparerParSemaine(plan, [], today).map((c) => c.semaine);
  const alertes: Alerte[] = [];
  let consecutives = 0;

  for (const semaine of semaines) {
    if (semaine.type === 'CHARGE') {
      consecutives += 1;
      if (consecutives >= 4) {
        alertes.push({
          code: 'QUATRIEME_SEMAINE_CHARGE',
          gravite: 'ATTENTION',
          message:
            `Semaine ${semaine.numero_global} : ${consecutives}e semaine de charge d'affilee ` +
            "sans semaine allegee. L'adaptation se fait pendant la decharge, pas pendant la charge.",
          reference: semaine.date_debut,
          details: { semaine: semaine.numero_global, consecutives },
        });
      }
    } else {
      consecutives = 0;
    }
  }

  return alertes;
}

/**
 * FC de repos superieure de plus de 5 bpm a la moyenne des 14 derniers jours,
 * trois jours de suite.
 */
function fcReposElevee({ wellness, today }: EntreesAlertes): Alerte[] {
  const mesures = wellness
    .filter((w) => w.fc_repos !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (mesures.length < 4) return [];

  let consecutifs = 0;
  let debutSerie: IsoDate | null = null;

  for (let i = 0; i < mesures.length; i++) {
    const courante = mesures[i]!;
    // Reference : les 14 jours qui precedent, la mesure du jour exclue.
    const debutFenetre = ajouterJours(courante.date, -14);
    const fenetre = mesures
      .slice(0, i)
      .filter((m) => m.date >= debutFenetre)
      .map((m) => m.fc_repos!);

    if (fenetre.length < 3) continue;

    const moyenne = fenetre.reduce((a, b) => a + b, 0) / fenetre.length;

    if (courante.fc_repos! > moyenne + 5) {
      consecutifs += 1;
      debutSerie ??= courante.date;

      if (consecutifs >= 3) {
        return [
          {
            code: 'FC_REPOS_ELEVEE',
            gravite: 'ATTENTION',
            message:
              `FC de repos elevee depuis le ${debutSerie} : ${courante.fc_repos} bpm contre ` +
              `${Math.round(moyenne)} bpm de moyenne sur 14 jours. Trois jours d'affilee au-dessus du seuil. ` +
              'Souvent le signe qu\'il manque du sommeil ou de la recuperation.',
            reference: courante.date,
            details: {
              fc_repos: courante.fc_repos,
              moyenne_14j: Math.round(moyenne),
              ecart: Math.round(courante.fc_repos! - moyenne),
              jours_consecutifs: consecutifs,
            },
          },
        ];
      }
    } else {
      consecutifs = 0;
      debutSerie = null;
    }
  }

  void today;
  return [];
}

/** Douleur >= 4/10 sur la meme zone lors de deux seances consecutives. */
function douleurPersistante({ realisees }: EntreesAlertes): Alerte[] {
  const avecDouleurs = [...realisees].sort((a, b) => a.date.localeCompare(b.date));
  const alertes: Alerte[] = [];
  const dejaSignalees = new Set<string>();

  for (let i = 1; i < avecDouleurs.length; i++) {
    const precedente = avecDouleurs[i - 1]!;
    const courante = avecDouleurs[i]!;

    for (const douleur of courante.douleurs) {
      if (douleur.intensite < 4) continue;
      if (dejaSignalees.has(douleur.zone)) continue;

      const avant = precedente.douleurs.find(
        (d) => normaliser(d.zone) === normaliser(douleur.zone) && d.intensite >= 4,
      );
      if (avant === undefined) continue;

      dejaSignalees.add(douleur.zone);
      alertes.push({
        code: 'DOULEUR_PERSISTANTE',
        gravite: 'CRITIQUE',
        message:
          `Douleur « ${douleur.zone} » signalee a ${avant.intensite}/10 le ${precedente.date} ` +
          `puis ${douleur.intensite}/10 le ${courante.date}, sur deux seances consecutives.`,
        reference: courante.date,
        details: {
          zone: douleur.zone,
          intensite_precedente: avant.intensite,
          intensite_courante: douleur.intensite,
          evolution: douleur.intensite - avant.intensite,
        },
      });
    }
  }

  return alertes;
}

/** Observance inferieure a 60 % sur deux semaines terminees consecutives. */
function observanceFaible({ plan, realisees, today }: EntreesAlertes): Alerte[] {
  const comparaisons = comparerParSemaine(plan, realisees, today).filter((c) => !c.en_cours);

  for (let i = 1; i < comparaisons.length; i++) {
    const a = comparaisons[i - 1]!;
    const b = comparaisons[i]!;
    if (a.observance_pct >= 60 || b.observance_pct >= 60) continue;

    return [
      {
        code: 'OBSERVANCE_FAIBLE',
        gravite: 'ATTENTION',
        message:
          `Observance de ${a.observance_pct} % puis ${b.observance_pct} % sur les semaines ` +
          `${a.semaine.numero_global} et ${b.semaine.numero_global}. ` +
          "Deux semaines sous 60 %, c'est souvent que le plan ne rentre pas dans la vraie semaine.",
        reference: b.semaine.date_debut,
        details: {
          semaine_a: a.semaine.numero_global,
          observance_a: a.observance_pct,
          semaine_b: b.semaine.numero_global,
          observance_b: b.observance_pct,
        },
      },
    ];
  }

  return [];
}

function normaliser(zone: string): string {
  return zone
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
