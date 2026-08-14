import {
  ajouterJours,
  estCourse,
  seancesPlanifiees,
  volumesParSemaine,
  type IsoDate,
  type Plan,
  type SeanceRealisee,
  type VolumeSemaine,
  type Wellness,
} from '@carter/shared';

export interface Realise {
  volume_course_min: number;
  nb_seances_course: number;
  sortie_longue_min: number | null;
  denivele_m: number;
  /** Moyenne ponderee par la duree, en battements par minute. */
  fc_moy: number | null;
  allure_moy_s_km: number | null;
}

export interface SeanceManquee {
  date: IsoDate;
  titre: string;
  duree_min: number;
  raison: string;
}

export interface ComparaisonSemaine {
  semaine: VolumeSemaine;
  fin: IsoDate;
  prevu: {
    volume_course_min: number;
    nb_seances_course: number;
    sortie_longue_min: number | null;
    denivele_m: number;
  };
  realise: Realise;
  /** Part du volume prevu effectivement realisee, en pourcentage. */
  observance_pct: number;
  manquees: SeanceManquee[];
  /** Vrai tant que la semaine n'est pas terminee : l'observance est partielle. */
  en_cours: boolean;
}

/**
 * Compare prevu et realise, semaine par semaine.
 *
 * L'observance porte sur le volume de course a pied, pas sur le nombre de
 * seances : rentrer 25 min sur une sortie longue de 55 prevues n'est pas
 * « une seance faite ». Le renfo est compte a part, parce qu'il ne se mesure
 * pas en volume comparable.
 */
export function comparerParSemaine(
  plan: Plan,
  realisees: SeanceRealisee[],
  today: IsoDate,
): ComparaisonSemaine[] {
  const volumes = volumesParSemaine(plan);

  const realiseesParSeance = new Map<string, SeanceRealisee[]>();
  for (const r of realisees) {
    if (r.seance_id === null) continue;
    const liste = realiseesParSeance.get(r.seance_id) ?? [];
    liste.push(r);
    realiseesParSeance.set(r.seance_id, liste);
  }

  return volumes.map((semaine) => {
    const fin = ajouterJours(semaine.date_debut, 6);
    const dansLaSemaine = realisees.filter((r) => r.date >= semaine.date_debut && r.date <= fin);
    const course = dansLaSemaine.filter((r) => estSportCourse(r.type_sport));

    const realise: Realise = {
      volume_course_min: Math.round(course.reduce((s, r) => s + r.duree_s, 0) / 60),
      nb_seances_course: course.length,
      sortie_longue_min:
        course.length > 0
          ? Math.round(Math.max(...course.map((r) => r.duree_s)) / 60)
          : null,
      denivele_m: Math.round(dansLaSemaine.reduce((s, r) => s + r.denivele_m, 0)),
      fc_moy: moyennePonderee(course.map((r) => [r.fc_moy, r.duree_s])),
      allure_moy_s_km: moyennePonderee(course.map((r) => [r.allure_moy_s_km, r.duree_s])),
    };

    const manquees: SeanceManquee[] = [];
    for (const p of seancesPlanifiees(plan)) {
      if (p.date < semaine.date_debut || p.date > fin) continue;
      if (!estCourse(p.seance.type)) continue;
      if (p.date > today) continue; // pas encore due
      if ((realiseesParSeance.get(p.seance.id)?.length ?? 0) > 0) continue;

      manquees.push({
        date: p.date,
        titre: p.seance.titre,
        duree_min: p.seance.duree_min,
        raison: raisonManquee(realisees, p.date),
      });
    }

    const observance =
      semaine.volume_course_min === 0
        ? 100
        : Math.round((realise.volume_course_min / semaine.volume_course_min) * 100);

    return {
      semaine,
      fin,
      prevu: {
        volume_course_min: semaine.volume_course_min,
        nb_seances_course: semaine.nb_seances_course,
        sortie_longue_min: semaine.sortie_longue_min,
        denivele_m: semaine.denivele_m,
      },
      realise,
      observance_pct: observance,
      manquees,
      en_cours: fin >= today,
    };
  });

  function raisonManquee(toutes: SeanceRealisee[], date: IsoDate): string {
    // Si un commentaire a ete saisi ce jour-la, il fait office d'explication.
    const memeJour = toutes.find((r) => r.date === date && r.commentaire.trim() !== '');
    return memeJour?.commentaire.trim() ?? '';
  }
}

const SPORTS_COURSE = new Set(['Run', 'TrailRun', 'VirtualRun']);

export function estSportCourse(type: string): boolean {
  return SPORTS_COURSE.has(type);
}

/** Moyenne ponderee ignorant les valeurs absentes. */
function moyennePonderee(paires: [number | null, number][]): number | null {
  let somme = 0;
  let poids = 0;
  for (const [valeur, p] of paires) {
    if (valeur === null || p <= 0) continue;
    somme += valeur * p;
    poids += p;
  }
  return poids === 0 ? null : Math.round((somme / poids) * 10) / 10;
}

export interface Tendances {
  fc_repos_moy_14j: number | null;
  fc_repos_derniere: number | null;
  sommeil_moy_h: number | null;
  fatigue_moy_1_5: number | null;
  humeur_moy_1_5: number | null;
  rpe_moy: number | null;
}

export function calculerTendances(
  wellness: Wellness[],
  realisees: SeanceRealisee[],
): Tendances {
  const tries = [...wellness].sort((a, b) => a.date.localeCompare(b.date));
  const recents = tries.slice(-14);

  return {
    fc_repos_moy_14j: moyenne(recents.map((w) => w.fc_repos)),
    fc_repos_derniere: [...tries].reverse().find((w) => w.fc_repos !== null)?.fc_repos ?? null,
    sommeil_moy_h: moyenne(recents.map((w) => w.sommeil_h)),
    fatigue_moy_1_5: moyenne(recents.map((w) => w.fatigue_1_5)),
    humeur_moy_1_5: moyenne(recents.map((w) => w.humeur_1_5)),
    rpe_moy: moyenne(realisees.map((r) => r.rpe)),
  };
}

function moyenne(valeurs: (number | null)[]): number | null {
  const presentes = valeurs.filter((v): v is number => v !== null);
  if (presentes.length === 0) return null;
  return Math.round((presentes.reduce((a, b) => a + b, 0) / presentes.length) * 10) / 10;
}
