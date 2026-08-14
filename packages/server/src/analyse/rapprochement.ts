import {
  diffJours,
  seancesPlanifiees,
  type Plan,
  type SeancePlanifiee,
  type SeanceRealisee,
  type TypeSeance,
} from '@carter/shared';

/** Familles de sport, pour ne pas rapprocher un renfo d'une sortie longue. */
const FAMILLE: Record<TypeSeance, string> = {
  FOOTING: 'course',
  SORTIE_LONGUE: 'course',
  COTES: 'course',
  SEUIL: 'course',
  RENFO: 'renfo',
  VELO: 'velo',
  REPOS: 'aucune',
};

const FAMILLE_SPORT: Record<string, string> = {
  Run: 'course',
  TrailRun: 'course',
  VirtualRun: 'course',
  Walk: 'course',
  Hike: 'course',
  WeightTraining: 'renfo',
  Workout: 'renfo',
  Ride: 'velo',
  VirtualRide: 'velo',
  GravelRide: 'velo',
  MountainBikeRide: 'velo',
};

export interface Proposition {
  realiseeId: string;
  seanceId: string;
  /** 0 = meme jour, 1 = a un jour d'ecart. */
  ecartJours: number;
  /** Vrai si le rapprochement ne souffre aucune ambiguite. */
  certain: boolean;
  explication: string;
}

export interface OptionsRapprochement {
  /** Tolerance en jours. 1 couvre la sortie longue avancee au samedi. */
  toleranceJours?: number;
}

/**
 * Propose un rattachement entre seances realisees et seances planifiees.
 *
 * Ne modifie rien : renvoie des propositions que l'appelant applique ou non.
 * Une proposition « certaine » peut etre appliquee automatiquement ; les
 * autres demandent une confirmation, parce qu'un mauvais rattachement fausse
 * l'observance et l'export coach sans que ca se voie.
 */
export function proposerRapprochements(
  plan: Plan,
  realisees: SeanceRealisee[],
  options: OptionsRapprochement = {},
): Proposition[] {
  const tolerance = options.toleranceJours ?? 1;

  const candidates = seancesPlanifiees(plan).filter((p) => p.seance.type !== 'REPOS');
  const dejaPrises = new Set<string>(
    realisees.map((r) => r.seance_id).filter((id): id is string => id !== null),
  );

  const propositions: Proposition[] = [];

  for (const realisee of realisees) {
    if (realisee.seance_id !== null) continue; // deja rattachee, on n'y touche pas

    const famille = FAMILLE_SPORT[realisee.type_sport] ?? 'autre';
    const compatibles = candidates
      .filter((p) => !dejaPrises.has(p.seance.id))
      .filter((p) => FAMILLE[p.seance.type] === famille)
      .map((p) => ({ p, ecart: Math.abs(diffJours(p.date, realisee.date)) }))
      .filter(({ ecart }) => ecart <= tolerance)
      .sort((a, b) => a.ecart - b.ecart || ecartDuree(a.p, realisee) - ecartDuree(b.p, realisee));

    const meilleur = compatibles[0];
    if (meilleur === undefined) continue;

    const memeJour = compatibles.filter((c) => c.ecart === meilleur.ecart);
    const certain = meilleur.ecart === 0 && memeJour.length === 1;

    propositions.push({
      realiseeId: realisee.id,
      seanceId: meilleur.p.seance.id,
      ecartJours: meilleur.ecart,
      certain,
      explication: explication(meilleur.ecart, memeJour.length, meilleur.p),
    });

    dejaPrises.add(meilleur.p.seance.id);
  }

  return propositions;
}

function ecartDuree(p: SeancePlanifiee, r: SeanceRealisee): number {
  return Math.abs(p.seance.duree_min * 60 - r.duree_s);
}

function explication(ecart: number, concurrents: number, p: SeancePlanifiee): string {
  if (ecart === 0 && concurrents === 1) {
    return `meme jour, seule seance ${p.seance.type} prevue`;
  }
  if (ecart === 0) {
    return `meme jour, ${concurrents} seances possibles — duree la plus proche retenue`;
  }
  return `${ecart} jour d'ecart avec « ${p.seance.titre} » prevue le ${p.date}`;
}
