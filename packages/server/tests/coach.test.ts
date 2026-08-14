import { describe, expect, it } from 'vitest';
import {
  ExportCoachSchema,
  PlanReviseSchema,
  extrairePlanRevise,
  SCHEMA_VERSION_COACH,
  type SeanceRealisee,
} from '@carter/shared';
import {
  CONTRAINTES_PAR_DEFAUT,
  construireExportCoach,
  rendreMarkdownCoach,
} from '../src/export/coach.js';
import { diffPlans, diffEnMarkdown } from '../src/export/diff-plan.js';
import { planTest } from './aide.js';

function realisee(
  id: string,
  date: string,
  options: Partial<SeanceRealisee> = {},
): SeanceRealisee {
  return {
    id,
    seance_id: null,
    date,
    source: 'INTERVALS',
    external_id: null,
    nom: 'Footing',
    type_sport: 'Run',
    duree_s: 1800,
    distance_m: 5000,
    denivele_m: 30,
    fc_moy: 142,
    fc_max: 158,
    allure_moy_s_km: 356,
    allure_gap_s_km: 350,
    rpe: 4,
    ressenti: 4,
    douleurs: [],
    commentaire: '',
    ...options,
  };
}

const BASE = {
  wellness: [],
  alertes: [],
  questions: [],
  contraintes: CONTRAINTES_PAR_DEFAUT,
  debut: '2026-03-02',
  fin: '2026-03-15',
  today: '2026-03-16',
};

describe('export coach — JSON', () => {
  it('produit une charge utile conforme au schema d echange', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, duree: 30 }],
      [{ id: 'b', jour: 1, duree: 35 }],
    ]);

    const jsonExport = construireExportCoach({
      plan,
      realisees: [realisee('r1', '2026-03-03', { seance_id: 'a' })],
      ...BASE,
    });

    expect(() => ExportCoachSchema.parse(jsonExport)).not.toThrow();
    expect(jsonExport.schema_version).toBe(SCHEMA_VERSION_COACH);
    expect(jsonExport.semaines).toHaveLength(2);
    expect(jsonExport.plan_actuel.id).toBe('plan-test');
  });

  it('calcule l observance a partir du volume, pas du nombre de seances', () => {
    const plan = planTest([[{ id: 'a', jour: 1, duree: 60 }]]);

    const jsonExport = construireExportCoach({
      plan,
      realisees: [realisee('r1', '2026-03-03', { seance_id: 'a', duree_s: 1800 })],
      ...BASE,
    });

    // 30 min realisees sur 60 prevues.
    expect(jsonExport.semaines[0]!.observance_pct).toBe(50);
  });

  it('liste les seances manquees deja dues, pas celles a venir', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }, { id: 'b', jour: 5 }]]);

    const jsonExport = construireExportCoach({
      plan,
      realisees: [],
      ...BASE,
      today: '2026-03-04', // mercredi : le mardi est du, le samedi non
    });

    const manquees = jsonExport.semaines[0]!.seances_manquees;
    expect(manquees).toHaveLength(1);
    expect(manquees[0]!.date).toBe('2026-03-03');
  });

  it('remonte le commentaire saisi comme raison d une seance manquee', () => {
    const plan = planTest([[{ id: 'a', jour: 1, duree: 60 }]]);

    const jsonExport = construireExportCoach({
      plan,
      realisees: [
        realisee('r1', '2026-03-03', {
          duree_s: 0,
          commentaire: 'dos bloque le matin, seance annulee',
        }),
      ],
      ...BASE,
    });

    expect(jsonExport.semaines[0]!.seances_manquees[0]!.raison).toBe(
      'dos bloque le matin, seance annulee',
    );
  });

  it('embarque les contraintes permanentes de l athlete', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const jsonExport = construireExportCoach({ plan, realisees: [], ...BASE });

    expect(jsonExport.contraintes_athlete.join(' ')).toContain('L5');
    expect(jsonExport.contraintes_athlete.join(' ')).toContain('Achille');
  });
});

describe('export coach — Markdown', () => {
  it('reste compact et met l essentiel en tete', () => {
    const plan = planTest([[{ id: 'a', jour: 1, duree: 60 }]]);
    const md = rendreMarkdownCoach(
      construireExportCoach({
        plan,
        realisees: [realisee('r1', '2026-03-03', { seance_id: 'a' })],
        ...BASE,
      }),
    );

    expect(md.startsWith('# Plan de test')).toBe(true);
    expect(md).toContain('## Prevu contre realise');
    // Deux pages ~ 120 lignes. Une semaine ne doit pas en approcher.
    expect(md.split('\n').length).toBeLessThan(60);
  });

  it('affiche l evolution d une douleur repetee', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const md = rendreMarkdownCoach(
      construireExportCoach({
        plan,
        realisees: [
          realisee('r1', '2026-03-03', {
            douleurs: [{ zone: 'Tendon Achille droit', intensite: 3, note: 'leger' }],
          }),
          realisee('r2', '2026-03-05', {
            douleurs: [{ zone: 'Tendon Achille droit', intensite: 6, note: 'plus net' }],
          }),
        ],
        ...BASE,
      }),
    );

    expect(md).toContain('Tendon Achille droit');
    // La suite est datee : le coach doit voir quand, pas seulement combien.
    expect(md).toContain('2026-03-03 : 3/10 -> 2026-03-05 : 6/10');
    expect(md).toContain('en aggravation');
  });

  it('indique explicitement les donnees absentes plutot que d afficher zero', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const md = rendreMarkdownCoach(
      construireExportCoach({ plan, realisees: [], ...BASE }),
    );

    expect(md).toContain('FC de repos : non renseigne');
  });

  it('explique au coach comment repondre', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const md = rendreMarkdownCoach(
      construireExportCoach({ plan, realisees: [], ...BASE }),
    );

    expect(md).toContain("schema d'echange version 1");
    expect(md).toContain('diff');
  });
});

describe('import d un plan revise', () => {
  it('accepte un plan nu', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const parse = PlanReviseSchema.safeParse(plan);

    expect(parse.success).toBe(true);
    expect(extrairePlanRevise(parse.data!).plan.id).toBe('plan-test');
  });

  it('accepte une enveloppe avec commentaire du coach', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const parse = PlanReviseSchema.safeParse({
      schema_version: 1,
      plan,
      commentaire_coach: 'J ai allege la semaine 3.',
    });

    expect(parse.success).toBe(true);
    const extrait = extrairePlanRevise(parse.data!);
    expect(extrait.commentaire).toBe('J ai allege la semaine 3.');
  });

  it('refuse un plan dont une seance a un jour invalide', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    (plan.blocs[0]!.semaines[0]!.seances[0] as { jour_offset: number }).jour_offset = 9;

    expect(PlanReviseSchema.safeParse(plan).success).toBe(false);
  });
});

describe('diff de plans', () => {
  it('detecte ajout, suppression, modification et deplacement', () => {
    const avant = planTest([
      [
        { id: 'a', jour: 1, duree: 30 },
        { id: 'b', jour: 3, duree: 40 },
        { id: 'c', jour: 5, duree: 50 },
      ],
    ]);
    const apres = planTest([
      [
        { id: 'a', jour: 1, duree: 45 }, // modification
        { id: 'b', jour: 4, duree: 40 }, // deplacement
        { id: 'd', jour: 6, duree: 60 }, // ajout ; c supprimee
      ],
    ]);

    const diff = diffPlans(avant, apres);

    expect(diff.resume).toMatchObject({
      ajouts: 1,
      suppressions: 1,
      modifications: 1,
      deplacements: 1,
    });
  });

  it('resume le changement de volume par semaine', () => {
    const avant = planTest([[{ id: 'a', jour: 1, duree: 60 }]]);
    const apres = planTest([[{ id: 'a', jour: 1, duree: 30 }]]);

    const diff = diffPlans(avant, apres);

    expect(diff.semaines).toHaveLength(1);
    expect(diff.semaines[0]!.volume_avant_min).toBe(60);
    expect(diff.semaines[0]!.volume_apres_min).toBe(30);
  });

  it('ne signale rien entre deux plans identiques', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const diff = diffPlans(plan, planTest([[{ id: 'a', jour: 1 }]]));

    expect(diff.seances).toHaveLength(0);
    expect(diffEnMarkdown(diff)).toBe('_Aucun changement._');
  });

  it('rend un diff lisible en Markdown', () => {
    const avant = planTest([[{ id: 'a', jour: 1, duree: 30 }]]);
    const apres = planTest([[{ id: 'a', jour: 1, duree: 45 }]]);

    const md = diffEnMarkdown(diffPlans(avant, apres));

    expect(md).toContain('Modification');
    expect(md).toContain('duree 30 min -> 45 min');
  });
});
