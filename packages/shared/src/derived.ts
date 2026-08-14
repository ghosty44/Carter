import { TYPES_COURSE, type TypeSeance } from './enums.js';
import { ajouterJours } from './dates.js';
import { hashValeur } from './hash.js';
import type { Bloc, Etape, IsoDate, Plan, Seance, Semaine } from './plan.js';

/**
 * Une seance replacee dans le calendrier : c'est la forme que consomment le
 * moteur de synchro, la vue calendrier et tous les exports. Le plan stocke des
 * offsets relatifs ; cette projection resout les dates une bonne fois.
 */
export interface SeancePlanifiee {
  seance: Seance;
  semaine: Semaine;
  bloc: Bloc;
  date: IsoDate;
  /** Hash du contenu qui compte pour le provider. */
  hash: string;
}

/** Date d'une seance = debut du bloc + semaines ecoulees + jour dans la semaine. */
export function dateSeance(bloc: Bloc, semaine: Semaine, seance: Seance): IsoDate {
  const joursAvant = (semaine.numero_dans_bloc - 1) * 7 + seance.jour_offset;
  return ajouterJours(bloc.date_debut, joursAvant);
}

/** Lundi d'une semaine donnee. */
export function dateDebutSemaine(bloc: Bloc, semaine: Semaine): IsoDate {
  return ajouterJours(bloc.date_debut, (semaine.numero_dans_bloc - 1) * 7);
}

/**
 * Contenu qui determine si le provider doit etre mis a jour.
 *
 * Ce qui est absent d'ici est, par construction, invisible du provider :
 * changer `note_coach` ou reordonner deux seances du meme jour ne declenche
 * aucune requete reseau. Ce qui est present ici doit rester stable dans le
 * temps, sinon toutes les seances repassent en « a mettre a jour » a la
 * premiere ouverture apres un deploiement.
 */
export function contenuSynchronisable(
  date: IsoDate,
  seance: Seance,
): Record<string, unknown> {
  return {
    date,
    type: seance.type,
    titre: seance.titre,
    duree_min: seance.duree_min,
    distance_km: seance.distance_km,
    denivele_m: seance.denivele_m,
    intensite: seance.intensite,
    consignes: seance.consignes,
    structure: seance.structure ? normaliserStructure(seance.structure) : undefined,
  };
}

function normaliserStructure(etapes: Etape[]): unknown[] {
  return etapes.map((e) => ({
    role: e.role,
    duree_s: e.duree_s,
    distance_m: e.distance_m,
    cible: e.cible,
    repetitions: e.repetitions,
    etapes: e.etapes ? normaliserStructure(e.etapes) : undefined,
  }));
}

export function hashSeance(date: IsoDate, seance: Seance): string {
  return hashValeur(contenuSynchronisable(date, seance));
}

/** Projette le plan entier en seances datees, triees chronologiquement. */
export function seancesPlanifiees(plan: Plan): SeancePlanifiee[] {
  const sorties: SeancePlanifiee[] = [];
  for (const bloc of plan.blocs) {
    for (const semaine of bloc.semaines) {
      for (const seance of semaine.seances) {
        const date = dateSeance(bloc, semaine, seance);
        sorties.push({ seance, semaine, bloc, date, hash: hashSeance(date, seance) });
      }
    }
  }
  sorties.sort((a, b) =>
    a.date === b.date
      ? a.seance.ordre_dans_journee - b.seance.ordre_dans_journee
      : a.date < b.date
        ? -1
        : 1,
  );
  return sorties;
}

export interface VolumeSemaine {
  semaine_id: string;
  numero_global: number;
  numero_dans_bloc: number;
  bloc_numero: number;
  bloc_nom: string;
  type: Semaine['type'];
  date_debut: IsoDate;
  /** Minutes de course a pied uniquement (hors renfo et velo). */
  volume_course_min: number;
  /** Minutes toutes activites confondues. */
  volume_total_min: number;
  nb_seances_course: number;
  sortie_longue_min: number | null;
  denivele_m: number;
}

/** Volume par semaine, dans l'ordre chronologique. */
export function volumesParSemaine(plan: Plan): VolumeSemaine[] {
  const resultats: VolumeSemaine[] = [];
  for (const bloc of plan.blocs) {
    for (const semaine of bloc.semaines) {
      let course = 0;
      let total = 0;
      let nbCourse = 0;
      let sortieLongue: number | null = null;
      let denivele = 0;

      for (const s of semaine.seances) {
        if (s.type === 'REPOS') continue;
        total += s.duree_min;
        denivele += s.denivele_m ?? 0;
        if (estCourse(s.type)) {
          course += s.duree_min;
          nbCourse += 1;
        }
        if (s.type === 'SORTIE_LONGUE') {
          sortieLongue = Math.max(sortieLongue ?? 0, s.duree_min);
        }
      }

      resultats.push({
        semaine_id: semaine.id,
        numero_global: semaine.numero_global,
        numero_dans_bloc: semaine.numero_dans_bloc,
        bloc_numero: bloc.numero,
        bloc_nom: bloc.nom,
        type: semaine.type,
        date_debut: dateDebutSemaine(bloc, semaine),
        volume_course_min: course,
        volume_total_min: total,
        nb_seances_course: nbCourse,
        sortie_longue_min: sortieLongue,
        denivele_m: denivele,
      });
    }
  }
  resultats.sort((a, b) => a.numero_global - b.numero_global);
  return resultats;
}

export function estCourse(type: TypeSeance): boolean {
  return TYPES_COURSE.includes(type);
}
