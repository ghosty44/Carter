import { describe, expect, it } from 'vitest';
import type { SeanceRealisee, Wellness } from '@carter/shared';
import { calculerAlertes } from '../src/alertes/regles.js';
import { LUNDI, planTest } from './aide.js';

function wellness(entrees: [string, number][]): Wellness[] {
  return entrees.map(([date, fc]) => ({
    date,
    poids_kg: null,
    fc_repos: fc,
    hrv: null,
    sommeil_h: null,
    fatigue_1_5: null,
    humeur_1_5: null,
    note: '',
  }));
}

function realisee(
  id: string,
  date: string,
  options: Partial<SeanceRealisee> = {},
): SeanceRealisee {
  return {
    id,
    seance_id: null,
    date,
    source: 'MANUEL',
    external_id: null,
    nom: '',
    type_sport: 'Run',
    duree_s: 1800,
    distance_m: 5000,
    denivele_m: 0,
    fc_moy: null,
    fc_max: null,
    allure_moy_s_km: null,
    allure_gap_s_km: null,
    rpe: null,
    ressenti: null,
    douleurs: [],
    commentaire: '',
    ...options,
  };
}

const VIDE = { realisees: [], wellness: [], today: '2026-06-01' as const };

describe('alerte volume en hausse', () => {
  it('signale une hausse de plus de 10 %', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 60 }],
      [{ id: 'b', jour: 1, duree: 75 }], // +25 %
    ]);

    const alertes = calculerAlertes({ plan, ...VIDE });
    const volume = alertes.filter((a) => a.code === 'VOLUME_HAUSSE_10PCT');

    expect(volume).toHaveLength(1);
    expect(volume[0]!.details.hausse_pct).toBe(25);
    expect(volume[0]!.gravite).toBe('ATTENTION');
  });

  it('ne dit rien pour une hausse de 10 % pile', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 100 }],
      [{ id: 'b', jour: 1, duree: 110 }],
    ]);

    const alertes = calculerAlertes({ plan, ...VIDE });
    expect(alertes.filter((a) => a.code === 'VOLUME_HAUSSE_10PCT')).toHaveLength(0);
  });

  it('ne compte pas le renfo dans le volume de course', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 60 }],
      [
        { id: 'b', jour: 1, duree: 60 },
        { id: 'renfo', jour: 0, type: 'RENFO', duree: 30 },
      ],
    ]);

    const alertes = calculerAlertes({ plan, ...VIDE });
    expect(alertes.filter((a) => a.code === 'VOLUME_HAUSSE_10PCT')).toHaveLength(0);
  });
});

describe('alerte semaines de charge enchainees', () => {
  it('se declenche a la quatrieme semaine de charge consecutive', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1 }],
      [{ id: 'b', jour: 1 }],
      [{ id: 'c', jour: 1 }],
      [{ id: 'd', jour: 1 }],
    ]);

    const alertes = calculerAlertes({ plan, ...VIDE }).filter(
      (a) => a.code === 'QUATRIEME_SEMAINE_CHARGE',
    );

    expect(alertes).toHaveLength(1);
    expect(alertes[0]!.details.consecutives).toBe(4);
  });

  it('ne se declenche pas si une semaine allegee coupe la serie', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1 }],
      [{ id: 'b', jour: 1 }],
      [{ id: 'c', jour: 1 }],
      [{ id: 'd', jour: 1 }],
    ]);
    plan.blocs[0]!.semaines[2]!.type = 'ALLEGEE';

    const alertes = calculerAlertes({ plan, ...VIDE });
    expect(alertes.filter((a) => a.code === 'QUATRIEME_SEMAINE_CHARGE')).toHaveLength(0);
  });

  it('ne se declenche pas sur le bloc 1 reel, qui allege en semaine 4', () => {
    const plan = planTest(Array.from({ length: 8 }, (_, i) => [{ id: `s${i}`, jour: 1 }]));
    plan.blocs[0]!.semaines[3]!.type = 'ALLEGEE';
    plan.blocs[0]!.semaines[7]!.type = 'ALLEGEE';

    const alertes = calculerAlertes({ plan, ...VIDE });
    expect(alertes.filter((a) => a.code === 'QUATRIEME_SEMAINE_CHARGE')).toHaveLength(0);
  });
});

describe('alerte FC de repos', () => {
  const plan = planTest([[{ id: 'a', jour: 1 }]]);

  it('se declenche apres trois jours consecutifs au-dessus du seuil', () => {
    const base: [string, number][] = [
      ['2026-03-01', 48],
      ['2026-03-02', 47],
      ['2026-03-03', 49],
      ['2026-03-04', 48],
      ['2026-03-05', 55],
      ['2026-03-06', 56],
      ['2026-03-07', 57],
    ];

    const alertes = calculerAlertes({
      plan,
      realisees: [],
      wellness: wellness(base),
      today: '2026-03-08',
    });

    const fc = alertes.filter((a) => a.code === 'FC_REPOS_ELEVEE');
    expect(fc).toHaveLength(1);
    expect(fc[0]!.gravite).toBe('ATTENTION');
    expect(fc[0]!.details.jours_consecutifs).toBe(3);
  });

  it('ne se declenche pas sur deux jours seulement', () => {
    const base: [string, number][] = [
      ['2026-03-01', 48],
      ['2026-03-02', 47],
      ['2026-03-03', 49],
      ['2026-03-04', 48],
      ['2026-03-05', 55],
      ['2026-03-06', 56],
      ['2026-03-07', 48],
    ];

    const alertes = calculerAlertes({
      plan,
      realisees: [],
      wellness: wellness(base),
      today: '2026-03-08',
    });

    expect(alertes.filter((a) => a.code === 'FC_REPOS_ELEVEE')).toHaveLength(0);
  });

  it('reste silencieuse sans historique suffisant', () => {
    const alertes = calculerAlertes({
      plan,
      realisees: [],
      wellness: wellness([['2026-03-05', 60]]),
      today: '2026-03-06',
    });

    expect(alertes.filter((a) => a.code === 'FC_REPOS_ELEVEE')).toHaveLength(0);
  });
});

describe('alerte douleur persistante', () => {
  const plan = planTest([[{ id: 'a', jour: 1 }]]);

  it('signale la meme zone a 4+ sur deux seances consecutives', () => {
    const realisees = [
      realisee('r1', '2026-03-03', {
        douleurs: [{ zone: 'Tendon achille droit', intensite: 4, note: '' }],
      }),
      realisee('r2', '2026-03-05', {
        douleurs: [{ zone: 'Tendon Achille droit', intensite: 6, note: 'plus marque' }],
      }),
    ];

    const alertes = calculerAlertes({ plan, realisees, wellness: [], today: '2026-03-06' });
    const douleur = alertes.filter((a) => a.code === 'DOULEUR_PERSISTANTE');

    expect(douleur).toHaveLength(1);
    expect(douleur[0]!.gravite).toBe('CRITIQUE');
    expect(douleur[0]!.details.evolution).toBe(2);
  });

  it('ne signale pas une douleur sous 4/10', () => {
    const realisees = [
      realisee('r1', '2026-03-03', { douleurs: [{ zone: 'Mollet', intensite: 3, note: '' }] }),
      realisee('r2', '2026-03-05', { douleurs: [{ zone: 'Mollet', intensite: 3, note: '' }] }),
    ];

    const alertes = calculerAlertes({ plan, realisees, wellness: [], today: '2026-03-06' });
    expect(alertes.filter((a) => a.code === 'DOULEUR_PERSISTANTE')).toHaveLength(0);
  });

  it('ne signale pas deux zones differentes', () => {
    const realisees = [
      realisee('r1', '2026-03-03', { douleurs: [{ zone: 'Mollet', intensite: 5, note: '' }] }),
      realisee('r2', '2026-03-05', { douleurs: [{ zone: 'Genou', intensite: 5, note: '' }] }),
    ];

    const alertes = calculerAlertes({ plan, realisees, wellness: [], today: '2026-03-06' });
    expect(alertes.filter((a) => a.code === 'DOULEUR_PERSISTANTE')).toHaveLength(0);
  });
});

describe('alerte observance', () => {
  it('se declenche sous 60 % sur deux semaines terminees', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 60 }],
      [{ id: 'b', jour: 1, duree: 60 }],
    ]);

    const realisees = [
      realisee('r1', '2026-03-03', { duree_s: 1200, seance_id: 'a' }), // 20 min sur 60
      realisee('r2', '2026-03-10', { duree_s: 1200, seance_id: 'b' }),
    ];

    const alertes = calculerAlertes({
      plan,
      realisees,
      wellness: [],
      today: '2026-03-20',
    });

    const obs = alertes.filter((a) => a.code === 'OBSERVANCE_FAIBLE');
    expect(obs).toHaveLength(1);
    expect(obs[0]!.details.observance_a).toBe(33);
  });

  it('ignore une semaine encore en cours', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 60 }],
      [{ id: 'b', jour: 1, duree: 60 }],
    ]);

    const alertes = calculerAlertes({
      plan,
      realisees: [],
      wellness: [],
      today: LUNDI, // on est dans la semaine 1
    });

    expect(alertes.filter((a) => a.code === 'OBSERVANCE_FAIBLE')).toHaveLength(0);
  });
});

describe('les alertes ne modifient jamais le plan', () => {
  it('laisse le plan strictement identique', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 60 }],
      [{ id: 'b', jour: 1, duree: 90 }],
    ]);
    const avant = JSON.stringify(plan);

    calculerAlertes({
      plan,
      realisees: [realisee('r1', '2026-03-03')],
      wellness: wellness([['2026-03-03', 60]]),
      today: '2026-03-20',
    });

    expect(JSON.stringify(plan)).toBe(avant);
  });
});

describe('alerte volume — comparaison apres une semaine allegee', () => {
  it('ne se declenche pas mecaniquement au retour de decharge', () => {
    // Reproduit le bloc 1 : 2h00 en S3, 1h20 de decharge en S4, 2h10 en S5.
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 100 }],
      [{ id: 'b', jour: 1, duree: 120 }],
      [{ id: 'c', jour: 1, duree: 80 }],
      [{ id: 'd', jour: 1, duree: 130 }],
    ]);
    plan.blocs[0]!.semaines[2]!.type = 'ALLEGEE';

    const alertes = calculerAlertes({ plan, ...VIDE }).filter(
      (a) => a.code === 'VOLUME_HAUSSE_10PCT',
    );

    // S4 est comparee a S2 (120 min), pas a la decharge S3 (80 min) :
    // 130 contre 120 fait +8 %, sous le seuil.
    expect(alertes.map((a) => a.details.semaine)).not.toContain(4);
  });

  it('compare bien a la derniere semaine de charge et le dit', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 100 }],
      [{ id: 'b', jour: 1, duree: 60 }],
      [{ id: 'c', jour: 1, duree: 130 }],
    ]);
    plan.blocs[0]!.semaines[1]!.type = 'ALLEGEE';

    const alertes = calculerAlertes({ plan, ...VIDE }).filter(
      (a) => a.code === 'VOLUME_HAUSSE_10PCT',
    );

    expect(alertes).toHaveLength(1);
    expect(alertes[0]!.details.semaine_reference).toBe(1);
    expect(alertes[0]!.details.hausse_pct).toBe(30);
    expect(alertes[0]!.message).toContain('comparee a la semaine 1');
  });

  it('ne signale jamais une semaine allegee comme une hausse', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 60 }],
      [{ id: 'b', jour: 1, duree: 200 }],
    ]);
    plan.blocs[0]!.semaines[1]!.type = 'ALLEGEE';

    const alertes = calculerAlertes({ plan, ...VIDE });
    expect(alertes.filter((a) => a.code === 'VOLUME_HAUSSE_10PCT')).toHaveLength(0);
  });
});
