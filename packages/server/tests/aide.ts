import {
  hashSeance,
  type IsoDate,
  type Plan,
  type Seance,
  type TypeSeance,
} from '@carter/shared';

/** Lundi de reference utilise par tous les tests. 2026-03-02 est un lundi. */
export const LUNDI: IsoDate = '2026-03-02';

export interface SpecSeance {
  id: string;
  jour: number;
  type?: TypeSeance;
  titre?: string;
  duree?: number;
  ordre?: number;
  consignes?: string;
}

/** Construit un plan minimal : un bloc, n semaines, des seances explicites. */
export function planTest(semaines: SpecSeance[][], dateDebut: IsoDate = LUNDI): Plan {
  return {
    id: 'plan-test',
    nom: 'Plan de test',
    version: 1,
    courses: [],
    blocs: [
      {
        id: 'bloc-1',
        numero: 1,
        nom: 'Bloc de test',
        date_debut: dateDebut,
        nb_semaines: Math.max(semaines.length, 1),
        objectif: '',
        semaines: semaines.map((seances, i) => ({
          id: `s${i + 1}`,
          numero_global: i + 1,
          numero_dans_bloc: i + 1,
          type: 'CHARGE' as const,
          note_coach: '',
          seances: seances.map(construireSeance),
        })),
      },
    ],
  };
}

function construireSeance(spec: SpecSeance): Seance {
  return {
    id: spec.id,
    jour_offset: spec.jour,
    ordre_dans_journee: spec.ordre ?? 0,
    type: spec.type ?? 'FOOTING',
    titre: spec.titre ?? `Seance ${spec.id}`,
    duree_min: spec.duree ?? 30,
    intensite: 'EF',
    consignes: spec.consignes ?? '',
  };
}

/** Hash attendu d'une seance donnee, pour amorcer une correspondance a jour. */
export function hashDe(plan: Plan, seanceId: string): string {
  for (const bloc of plan.blocs) {
    for (const semaine of bloc.semaines) {
      for (const seance of semaine.seances) {
        if (seance.id !== seanceId) continue;
        const jours = (semaine.numero_dans_bloc - 1) * 7 + seance.jour_offset;
        const date = new Date(
          new Date(`${bloc.date_debut}T00:00:00Z`).getTime() + jours * 86_400_000,
        )
          .toISOString()
          .slice(0, 10);
        return hashSeance(date, seance);
      }
    }
  }
  throw new Error(`seance ${seanceId} introuvable`);
}

/** Tous les types de course + renfo : le reglage retenu pour cette app. */
export const TYPES_SYNC: TypeSeance[] = [
  'FOOTING',
  'SORTIE_LONGUE',
  'COTES',
  'SEUIL',
  'RENFO',
];
