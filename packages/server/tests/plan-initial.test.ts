import { describe, expect, it } from 'vitest';
import {
  PlanSchema,
  formatDuree,
  validerCoherencePlan,
  volumesParSemaine,
} from '@carter/shared';
import { construirePlanInitial, lundiProchain } from '../src/plan-initial.js';
import { calculerAlertes } from '../src/alertes/regles.js';

describe('plan de depart', () => {
  const plan = construirePlanInitial('2026-03-02');

  it('respecte le schema et les regles de coherence', () => {
    expect(PlanSchema.safeParse(plan).success).toBe(true);
    expect(validerCoherencePlan(plan)).toEqual([]);
  });

  /**
   * Les volumes du brief, verifies un a un. C'est le seul contenu de l'app
   * qui vient d'une source exterieure : s'il derive, tout ce qui en depend
   * (observance, alertes, export coach) devient faux en silence.
   */
  it('reproduit exactement les volumes du tableau de reference', () => {
    const attendus = ['1h40', '1h50', '2h', '1h20', '2h10', '2h25', '2h40', '1h45'];
    const obtenus = volumesParSemaine(plan).map((v) => formatDuree(v.volume_course_min));

    expect(obtenus).toEqual(attendus);
  });

  it('place les seances aux bons jours', () => {
    const semaine1 = plan.blocs[0]!.semaines[0]!;
    const creneaux = semaine1.seances
      .map((s) => `${s.jour_offset}:${s.type}`)
      .sort();

    // Lundi renfo, mardi footing, jeudi footing + renfo, dimanche sortie longue.
    expect(creneaux).toEqual([
      '0:RENFO',
      '1:FOOTING',
      '3:FOOTING',
      '3:RENFO',
      '6:SORTIE_LONGUE',
    ]);
  });

  it('ne programme jamais de renforcement la veille de la sortie longue', () => {
    for (const semaine of plan.blocs[0]!.semaines) {
      const jourSl = semaine.seances.find((s) => s.type === 'SORTIE_LONGUE')!.jour_offset;
      const joursRenfo = semaine.seances
        .filter((s) => s.type === 'RENFO')
        .map((s) => s.jour_offset);

      expect(joursRenfo).not.toContain(jourSl - 1);
    }
  });

  it('fait passer le renfo du jeudi apres le footing', () => {
    const semaine1 = plan.blocs[0]!.semaines[0]!;
    const jeudi = semaine1.seances.filter((s) => s.jour_offset === 3);

    const footing = jeudi.find((s) => s.type === 'FOOTING')!;
    const renfo = jeudi.find((s) => s.type === 'RENFO')!;
    expect(renfo.ordre_dans_journee).toBeGreaterThan(footing.ordre_dans_journee);
  });

  it('porte les contraintes de l athlete sur chaque seance de renforcement', () => {
    const renfos = plan.blocs[0]!.semaines.flatMap((s) =>
      s.seances.filter((x) => x.type === 'RENFO'),
    );

    expect(renfos.length).toBe(16); // deux par semaine, huit semaines
    for (const r of renfos) {
      expect(r.consignes).toContain('L5');
      expect(r.consignes).toContain('ACHILLE');
      expect(r.consignes).toContain('CHEVILLES');
    }
  });

  it('ne declenche pas l alerte de charge enchainee', () => {
    // Les semaines 4 et 8 sont allegees : la serie ne doit jamais atteindre 4.
    const alertes = calculerAlertes({
      plan,
      realisees: [],
      wellness: [],
      today: '2026-06-01',
    });

    expect(alertes.filter((a) => a.code === 'QUATRIEME_SEMAINE_CHARGE')).toHaveLength(0);
  });

  it('demarre toujours un lundi, sans argument', () => {
    const auto = construirePlanInitial();
    const debut = auto.blocs[0]!.date_debut;

    expect(new Date(`${debut}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(debut).toBe(lundiProchain());
  });

  it('demarre dans le futur', () => {
    const auto = construirePlanInitial();
    const aujourdhuiIso = new Date().toISOString().slice(0, 10);

    expect(auto.blocs[0]!.date_debut > aujourdhuiIso).toBe(true);
  });
});
