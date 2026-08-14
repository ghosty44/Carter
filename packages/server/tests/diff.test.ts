import { describe, expect, it } from 'vitest';
import type { SeanceExterne } from '@carter/shared';
import { calculerDiff, apercuVide, type Correspondance } from '../src/sync/diff.js';
import { LUNDI, TYPES_SYNC, hashDe, planTest } from './aide.js';

const OPTIONS = {
  provider: 'LOCAL' as const,
  typesSynchronises: TYPES_SYNC,
  fenetreSemaines: 6,
  today: LUNDI,
};

function distante(
  externalId: string,
  date: string,
  nom = '[PLAN] Seance',
  possede = true,
): SeanceExterne {
  return { externalId, date, nom, possedeParCarter: possede };
}

describe('calculerDiff — creation', () => {
  it('propose la creation des seances jamais synchronisees', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }, { id: 'b', jour: 3 }]]);
    const apercu = calculerDiff(plan, [], [], OPTIONS);

    expect(apercu.aCreer.map((o) => o.seanceId)).toEqual(['a', 'b']);
    expect(apercu.aMettreAJour).toHaveLength(0);
    expect(apercu.aSupprimer).toHaveLength(0);
  });

  it('recree une seance dont l evenement a disparu chez le provider', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const corr: Correspondance[] = [
      { seanceId: 'a', externalId: 'ext-1', provider: 'LOCAL', hashSynchronise: hashDe(plan, 'a') },
    ];

    const apercu = calculerDiff(plan, [], corr, OPTIONS);

    expect(apercu.aCreer).toHaveLength(1);
    expect(apercu.aCreer[0]!.motif).toContain('disparu');
  });
});

describe('calculerDiff — mise a jour', () => {
  it('ne propose rien quand le hash est inchange', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const corr: Correspondance[] = [
      { seanceId: 'a', externalId: 'ext-1', provider: 'LOCAL', hashSynchronise: hashDe(plan, 'a') },
    ];

    const apercu = calculerDiff(plan, [distante('ext-1', '2026-03-03')], corr, OPTIONS);

    expect(apercuVide(apercu)).toBe(true);
  });

  it('propose une mise a jour quand le contenu a change', () => {
    const plan = planTest([[{ id: 'a', jour: 1, duree: 30 }]]);
    const corr: Correspondance[] = [
      { seanceId: 'a', externalId: 'ext-1', provider: 'LOCAL', hashSynchronise: 'hash-perime' },
    ];

    const apercu = calculerDiff(plan, [distante('ext-1', '2026-03-03')], corr, OPTIONS);

    expect(apercu.aMettreAJour).toHaveLength(1);
    expect(apercu.aMettreAJour[0]!.externalId).toBe('ext-1');
    expect(apercu.aCreer).toHaveLength(0);
  });

  it('traite un deplacement de jour comme une mise a jour, pas comme un doublon', () => {
    const plan = planTest([[{ id: 'a', jour: 4 }]]); // vendredi
    const corr: Correspondance[] = [
      { seanceId: 'a', externalId: 'ext-1', provider: 'LOCAL', hashSynchronise: 'ancien' },
    ];

    // L'evenement distant est encore au mardi.
    const apercu = calculerDiff(plan, [distante('ext-1', '2026-03-03')], corr, OPTIONS);

    expect(apercu.aMettreAJour).toHaveLength(1);
    expect(apercu.aMettreAJour[0]!.date).toBe('2026-03-06');
    expect(apercu.aMettreAJour[0]!.motif).toContain('deplacee');
    expect(apercu.aSupprimer).toHaveLength(0);
  });

  it('ignore le renommage d une note de coach, qui ne sort pas vers le provider', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const hash = hashDe(plan, 'a');
    plan.blocs[0]!.semaines[0]!.note_coach = 'commentaire ajoute apres coup';

    const apercu = calculerDiff(
      plan,
      [distante('ext-1', '2026-03-03')],
      [{ seanceId: 'a', externalId: 'ext-1', provider: 'LOCAL', hashSynchronise: hash }],
      OPTIONS,
    );

    expect(apercuVide(apercu)).toBe(true);
  });
});

describe('calculerDiff — suppression', () => {
  it('supprime un evenement Carter qui ne correspond plus a aucune seance', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const corr: Correspondance[] = [
      { seanceId: 'a', externalId: 'ext-1', provider: 'LOCAL', hashSynchronise: hashDe(plan, 'a') },
    ];

    const apercu = calculerDiff(
      plan,
      [distante('ext-1', '2026-03-03'), distante('ext-orphelin', '2026-03-05')],
      corr,
      OPTIONS,
    );

    expect(apercu.aSupprimer).toHaveLength(1);
    expect(apercu.aSupprimer[0]!.externalId).toBe('ext-orphelin');
  });

  it("ne touche JAMAIS un evenement qui n'appartient pas a Carter", () => {
    const plan = planTest([[]]);
    const externe = distante('ext-perso', '2026-03-05', 'Sortie club', false);

    const apercu = calculerDiff(plan, [externe], [], OPTIONS);

    expect(apercu.aSupprimer).toHaveLength(0);
  });

  it('ne supprime pas un evenement Carter situe au-dela de la fenetre', () => {
    const plan = planTest([[]]);
    const loin = distante('ext-loin', '2026-08-01');

    const apercu = calculerDiff(plan, [loin], [], OPTIONS);

    expect(apercu.aSupprimer).toHaveLength(0);
  });
});

describe('calculerDiff — protection du passe', () => {
  it('ignore les seances anterieures a aujourd hui', () => {
    // Semaine 1 commence le 2026-03-02 ; on se place au 2026-03-05.
    const plan = planTest([[{ id: 'lundi', jour: 0 }, { id: 'vendredi', jour: 4 }]]);

    const apercu = calculerDiff(plan, [], [], { ...OPTIONS, today: '2026-03-05' });

    expect(apercu.aCreer.map((o) => o.seanceId)).toEqual(['vendredi']);
    const ignoree = apercu.ignorees.find((i) => i.seanceId === 'lundi');
    expect(ignoree?.raison).toContain('passe');
  });

  it('ne supprime jamais un evenement distant deja passe', () => {
    const plan = planTest([[]]);
    const vieux = distante('ext-vieux', '2026-03-01');

    const apercu = calculerDiff(plan, [vieux], [], { ...OPTIONS, today: '2026-03-05' });

    expect(apercu.aSupprimer).toHaveLength(0);
  });

  it('recree ailleurs une seance deplacee depuis une date passee, sans toucher l ancien evenement', () => {
    const plan = planTest([[{ id: 'a', jour: 6 }]]); // dimanche 2026-03-08
    const corr: Correspondance[] = [
      { seanceId: 'a', externalId: 'ext-1', provider: 'LOCAL', hashSynchronise: 'ancien' },
    ];

    const apercu = calculerDiff(plan, [distante('ext-1', '2026-03-01')], corr, {
      ...OPTIONS,
      today: '2026-03-05',
    });

    expect(apercu.aCreer).toHaveLength(1);
    expect(apercu.aCreer[0]!.motif).toContain('passe');
    expect(apercu.aSupprimer).toHaveLength(0);
    expect(apercu.aMettreAJour).toHaveLength(0);
  });
});

describe('calculerDiff — fenetre et filtrage par type', () => {
  it('ne pousse pas au-dela de la fenetre configuree', () => {
    const semaines = Array.from({ length: 10 }, (_, i) => [{ id: `s${i}`, jour: 2 }]);
    const plan = planTest(semaines);

    const apercu = calculerDiff(plan, [], [], { ...OPTIONS, fenetreSemaines: 2 });

    // Fenetre = 2 semaines a partir du lundi 02/03, soit jusqu'au 16/03.
    // Les mercredis des semaines 1 et 2 (04/03 et 11/03) rentrent ; celui de
    // la semaine 3 (18/03) non.
    expect(apercu.aCreer.map((o) => o.date)).toEqual(['2026-03-04', '2026-03-11']);
    expect(apercu.ignorees.some((i) => i.raison.includes('fenetre'))).toBe(true);
  });

  it('exclut le velo quand il ne fait pas partie des types synchronises', () => {
    const plan = planTest([
      [
        { id: 'course', jour: 1, type: 'FOOTING' },
        { id: 'renfo', jour: 1, type: 'RENFO', ordre: 1 },
        { id: 'velo', jour: 2, type: 'VELO' },
      ],
    ]);

    const apercu = calculerDiff(plan, [], [], OPTIONS);

    expect(apercu.aCreer.map((o) => o.seanceId).sort()).toEqual(['course', 'renfo']);
    expect(apercu.ignorees.find((i) => i.seanceId === 'velo')?.raison).toContain('VELO');
  });

  it('ignore les journees de repos', () => {
    const plan = planTest([[{ id: 'repos', jour: 2, type: 'REPOS' }]]);

    const apercu = calculerDiff(plan, [], [], OPTIONS);

    expect(apercu.aCreer).toHaveLength(0);
    expect(apercu.ignorees[0]!.raison).toContain('repos');
  });
});

describe('calculerDiff — isolement des providers', () => {
  it('ignore les correspondances etablies avec un autre provider', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const corr: Correspondance[] = [
      { seanceId: 'a', externalId: 'g-1', provider: 'GARMIN', hashSynchronise: hashDe(plan, 'a') },
    ];

    const apercu = calculerDiff(plan, [distante('g-1', '2026-03-03')], corr, OPTIONS);

    // Vu depuis LOCAL, la seance n'a jamais ete synchronisee.
    expect(apercu.aCreer).toHaveLength(1);
  });
});
