import { describe, expect, it } from 'vitest';
import {
  formatAllure,
  formatDistance,
  formatDuree,
  parSemaine,
  records,
  repartition,
  totaux,
} from '@carter/shared';
import { activite } from './aide.js';

describe('totaux', () => {
  it('additionne duree, distance et denivele', () => {
    const t = totaux([
      activite('1', '2026-03-03', { duree_s: 1800, distance_m: 5000, denivele_m: 40 }),
      activite('2', '2026-03-05', { duree_s: 2400, distance_m: 7000, denivele_m: 120 }),
    ]);

    expect(t.nb_activites).toBe(2);
    expect(t.duree_s).toBe(4200);
    expect(t.distance_m).toBe(12000);
    expect(t.denivele_m).toBe(160);
  });

  it('pondere la FC moyenne par la duree', () => {
    // 30 min a 140 et 90 min a 160 : la moyenne doit pencher vers 160.
    const t = totaux([
      activite('1', '2026-03-03', { duree_s: 1800, fc_moy: 140 }),
      activite('2', '2026-03-05', { duree_s: 5400, fc_moy: 160 }),
    ]);

    expect(t.fc_moy).toBe(155);
  });

  it('ignore les FC absentes au lieu de les compter comme zero', () => {
    const t = totaux([
      activite('1', '2026-03-03', { fc_moy: 150 }),
      activite('2', '2026-03-05', { fc_moy: null }),
    ]);

    expect(t.fc_moy).toBe(150);
  });

  /**
   * L'allure globale est distance totale sur temps total, et non la moyenne
   * des allures : sinon un footing de 30 min pese autant qu'une sortie de
   * 3 h, et le chiffre ne veut plus rien dire.
   */
  it('calcule l allure sur les totaux, pas en moyennant les allures', () => {
    const t = totaux([
      // 5 km en 30 min -> 6'00/km
      activite('1', '2026-03-03', { duree_s: 1800, distance_m: 5000 }),
      // 30 km en 3 h -> 6'00/km
      activite('2', '2026-03-05', { duree_s: 10800, distance_m: 30000 }),
    ]);

    expect(formatAllure(t.allure_s_km)).toBe("6'00/km");
  });

  it('exclut le velo du calcul d allure', () => {
    const t = totaux([
      activite('1', '2026-03-03', { duree_s: 1800, distance_m: 5000 }),
      activite('2', '2026-03-04', {
        sport: 'VELO',
        duree_s: 3600,
        distance_m: 30000,
        allure_s_km: null,
      }),
    ]);

    // Seule la course compte : 5 km en 30 min.
    expect(formatAllure(t.allure_s_km)).toBe("6'00/km");
    // Mais la distance totale, elle, comprend tout.
    expect(t.distance_m).toBe(35000);
  });

  it('ne divise pas par zero sur un lot sans distance', () => {
    const t = totaux([activite('1', '2026-03-03', { sport: 'RENFORCEMENT', distance_m: 0 })]);
    expect(t.allure_s_km).toBeNull();
  });

  it('rend des totaux nuls sur un lot vide', () => {
    const t = totaux([]);
    expect(t).toMatchObject({ nb_activites: 0, duree_s: 0, fc_moy: null, allure_s_km: null });
  });
});

describe('regroupement par semaine', () => {
  // 2026-03-04 est un mercredi ; la semaine court du lundi 02 au dimanche 08.
  const today = '2026-03-04';

  it('regroupe du lundi au dimanche', () => {
    const semaines = parSemaine(
      [
        activite('a', '2026-03-02', { duree_s: 1800 }), // lundi
        activite('b', '2026-03-08', { duree_s: 3600 }), // dimanche
        activite('c', '2026-03-09', { duree_s: 9999 }), // lundi suivant : hors plage
      ],
      1,
      today,
    );

    expect(semaines).toHaveLength(1);
    expect(semaines[0]!.debut).toBe('2026-03-02');
    expect(semaines[0]!.fin).toBe('2026-03-08');
    expect(semaines[0]!.duree_s).toBe(5400);
  });

  it('rend les semaines de la plus ancienne a la plus recente', () => {
    const semaines = parSemaine([], 4, today);
    expect(semaines.map((s) => s.debut)).toEqual([
      '2026-02-09',
      '2026-02-16',
      '2026-02-23',
      '2026-03-02',
    ]);
  });

  it('distingue le total du volume de course', () => {
    const semaines = parSemaine(
      [
        activite('a', '2026-03-03', { duree_s: 1800 }),
        activite('b', '2026-03-04', { sport: 'VELO', duree_s: 3600 }),
        activite('c', '2026-03-05', { sport: 'RENFORCEMENT', duree_s: 1200 }),
      ],
      1,
      today,
    );

    expect(semaines[0]!.duree_s).toBe(6600);
    expect(semaines[0]!.course.duree_s).toBe(1800);
  });

  it('retient la plus longue sortie de course, pas le plus long effort', () => {
    const semaines = parSemaine(
      [
        activite('a', '2026-03-03', { duree_s: 2400 }),
        // Une sortie velo plus longue ne doit pas devenir « la plus longue ».
        activite('b', '2026-03-04', { sport: 'VELO', duree_s: 7200 }),
      ],
      1,
      today,
    );

    expect(semaines[0]!.plus_longue_s).toBe(2400);
  });

  it('rend des semaines vides quand il n y a rien', () => {
    const semaines = parSemaine([], 3, today);
    expect(semaines.every((s) => s.duree_s === 0 && s.nb_activites === 0)).toBe(true);
  });
});

describe('repartition par sport', () => {
  it('classe du plus pratique au moins pratique', () => {
    const r = repartition([
      activite('a', '2026-03-03', { sport: 'COURSE', duree_s: 1800 }),
      activite('b', '2026-03-04', { sport: 'VELO', duree_s: 7200 }),
      activite('c', '2026-03-05', { sport: 'COURSE', duree_s: 2400 }),
    ]);

    expect(r.map((x) => x.sport)).toEqual(['VELO', 'COURSE']);
    expect(r[1]!.duree_s).toBe(4200);
    expect(r[1]!.nb_activites).toBe(2);
  });
});

describe('records', () => {
  it('retient la plus longue, la plus lointaine et la plus montagneuse', () => {
    const lot = [
      activite('a', '2026-03-03', { duree_s: 1800, distance_m: 5000, denivele_m: 40 }),
      activite('b', '2026-03-05', { duree_s: 7200, distance_m: 18000, denivele_m: 300 }),
      activite('c', '2026-03-07', { duree_s: 3600, distance_m: 12000, denivele_m: 900 }),
    ];
    const r = records(lot);

    expect(r.plus_longue_duree?.id).toBe('b');
    expect(r.plus_longue_distance?.id).toBe('b');
    expect(r.plus_gros_denivele?.id).toBe('c');
  });

  it('ne retient pas une valeur nulle comme record', () => {
    const r = records([activite('a', '2026-03-03', { denivele_m: 0 })]);
    expect(r.plus_gros_denivele).toBeNull();
  });

  it('ne compte que la course pour duree et distance', () => {
    const r = records([
      activite('a', '2026-03-03', { duree_s: 1800, distance_m: 5000 }),
      activite('velo', '2026-03-04', { sport: 'VELO', duree_s: 14400, distance_m: 120000 }),
    ]);

    expect(r.plus_longue_duree?.id).toBe('a');
    expect(r.plus_longue_distance?.id).toBe('a');
  });
});

describe('formats', () => {
  it('formate les durees', () => {
    expect(formatDuree(0)).toBe('—');
    expect(formatDuree(1800)).toBe('30 min');
    expect(formatDuree(3600)).toBe('1h00');
    expect(formatDuree(6000)).toBe('1h40');
  });

  it('formate les distances a la virgule francaise', () => {
    expect(formatDistance(12400)).toBe('12,4 km');
    expect(formatDistance(0)).toBe('—');
  });

  it('formate les allures sans produire 5 minutes 60 secondes', () => {
    expect(formatAllure(342)).toBe("5'42/km");
    // 359,6 s doit donner 6'00 et non 5'60.
    expect(formatAllure(359.6)).toBe("6'00/km");
    expect(formatAllure(null)).toBe('—');
  });
});
