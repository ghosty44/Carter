import { estCourse, type Sport } from './enums.js';
import { ajouterJours, lundiDeLaSemaine } from './dates.js';
import type { Activite, IsoDate } from './modele.js';

export interface Totaux {
  nb_activites: number;
  duree_s: number;
  distance_m: number;
  denivele_m: number;
  /** Frequence cardiaque moyenne ponderee par la duree. */
  fc_moy: number | null;
  /** Allure moyenne sur la course a pied uniquement, en s/km. */
  allure_s_km: number | null;
}

export interface TotauxSemaine extends Totaux {
  /** Lundi de la semaine. */
  debut: IsoDate;
  fin: IsoDate;
  /** Meme chose, restreint a la course a pied. */
  course: Totaux;
  /** Duree de la plus longue sortie de course. */
  plus_longue_s: number;
}

export interface RepartitionSport {
  sport: Sport;
  nb_activites: number;
  duree_s: number;
  distance_m: number;
}

/**
 * Totaux d'un ensemble d'activites.
 *
 * L'allure n'a de sens que pour la course : melanger une sortie velo a 30 km/h
 * et un footing a 10 km/h donnerait un chiffre qui ne veut rien dire. Elle est
 * donc calculee sur la seule course a pied, meme quand le lot en contient
 * d'autres.
 */
export function totaux(activites: Activite[]): Totaux {
  const course = activites.filter((a) => estCourse(a.sport));

  return {
    nb_activites: activites.length,
    duree_s: activites.reduce((s, a) => s + a.duree_s, 0),
    distance_m: activites.reduce((s, a) => s + a.distance_m, 0),
    denivele_m: Math.round(activites.reduce((s, a) => s + a.denivele_m, 0)),
    fc_moy: moyennePonderee(activites.map((a) => [a.fc_moy, a.duree_s])),
    allure_s_km: allureGlobale(course),
  };
}

/**
 * Allure moyenne reelle : distance totale sur temps total.
 *
 * Et non la moyenne des allures de chaque sortie, qui donnerait le meme poids
 * a un 40 minutes et a un 3 heures.
 */
function allureGlobale(course: Activite[]): number | null {
  const distance = course.reduce((s, a) => s + a.distance_m, 0);
  const duree = course.reduce((s, a) => s + a.duree_s, 0);
  if (distance <= 0 || duree <= 0) return null;
  return (duree / distance) * 1000;
}

/** Regroupe par semaine calendaire, du lundi au dimanche. */
export function parSemaine(
  activites: Activite[],
  nbSemaines: number,
  today: IsoDate,
): TotauxSemaine[] {
  const lundiCourant = lundiDeLaSemaine(today);
  const semaines: TotauxSemaine[] = [];

  for (let i = nbSemaines - 1; i >= 0; i--) {
    const debut = ajouterJours(lundiCourant, -7 * i);
    const fin = ajouterJours(debut, 6);

    const dedans = activites.filter((a) => a.date >= debut && a.date <= fin);
    const course = dedans.filter((a) => estCourse(a.sport));

    semaines.push({
      ...totaux(dedans),
      debut,
      fin,
      course: totaux(course),
      plus_longue_s: course.reduce((m, a) => Math.max(m, a.duree_s), 0),
    });
  }

  return semaines;
}

/** Repartition par sport, du plus pratique au moins pratique. */
export function repartition(activites: Activite[]): RepartitionSport[] {
  const parSport = new Map<Sport, RepartitionSport>();

  for (const a of activites) {
    const courant = parSport.get(a.sport) ?? {
      sport: a.sport,
      nb_activites: 0,
      duree_s: 0,
      distance_m: 0,
    };
    courant.nb_activites += 1;
    courant.duree_s += a.duree_s;
    courant.distance_m += a.distance_m;
    parSport.set(a.sport, courant);
  }

  return [...parSport.values()].sort((a, b) => b.duree_s - a.duree_s);
}

/**
 * Records personnels sur la periode chargee.
 *
 * Volontairement limites a ce qui est calculable de facon fiable a partir des
 * totaux d'activite. Les records sur distance exacte (meilleur 10 km au sein
 * d'une sortie plus longue) demanderaient les donnees seconde par seconde,
 * que cette app ne telecharge pas.
 */
export interface Records {
  plus_longue_duree: Activite | null;
  plus_longue_distance: Activite | null;
  plus_gros_denivele: Activite | null;
}

export function records(activites: Activite[]): Records {
  const course = activites.filter((a) => estCourse(a.sport));
  return {
    plus_longue_duree: maxPar(course, (a) => a.duree_s),
    plus_longue_distance: maxPar(course, (a) => a.distance_m),
    plus_gros_denivele: maxPar(activites, (a) => a.denivele_m),
  };
}

function maxPar(activites: Activite[], valeur: (a: Activite) => number): Activite | null {
  let meilleur: Activite | null = null;
  for (const a of activites) {
    if (valeur(a) <= 0) continue;
    if (meilleur === null || valeur(a) > valeur(meilleur)) meilleur = a;
  }
  return meilleur;
}

function moyennePonderee(paires: [number | null, number][]): number | null {
  let somme = 0;
  let poids = 0;
  for (const [valeur, p] of paires) {
    if (valeur === null || p <= 0) continue;
    somme += valeur * p;
    poids += p;
  }
  return poids === 0 ? null : Math.round(somme / poids);
}
