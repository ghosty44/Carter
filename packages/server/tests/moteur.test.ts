import { beforeEach, describe, expect, it } from 'vitest';
import type { ApercuSync } from '@carter/shared';
import { calculerDiff, type Correspondance } from '../src/sync/diff.js';
import { appliquerSync, apercuDesEchecs, type DepotSync } from '../src/sync/moteur.js';
import { ProviderMemoire } from '../src/providers/memoire.js';
import { ErreurProvider, ErreurProviderNonConfigure } from '../src/providers/types.js';
import { LUNDI, TYPES_SYNC, hashDe, planTest } from './aide.js';

const OPTIONS = {
  provider: 'LOCAL' as const,
  typesSynchronises: TYPES_SYNC,
  fenetreSemaines: 6,
  today: LUNDI,
};

/** Depot en memoire : reproduit le contrat attendu par le moteur. */
class DepotMemoire implements DepotSync {
  correspondances = new Map<string, Correspondance>();
  journal: Parameters<DepotSync['journaliser']>[0][] = [];

  enregistrerCorrespondance(e: {
    seanceId: string;
    externalId: string;
    provider: ApercuSync['provider'];
    hash: string;
  }): void {
    this.correspondances.set(e.seanceId, {
      seanceId: e.seanceId,
      externalId: e.externalId,
      provider: e.provider,
      hashSynchronise: e.hash,
    });
  }

  oublierCorrespondance(externalId: string): void {
    for (const [k, v] of this.correspondances) {
      if (v.externalId === externalId) this.correspondances.delete(k);
    }
  }

  journaliser(entree: Parameters<DepotSync['journaliser']>[0]): void {
    this.journal.push(entree);
  }

  liste(): Correspondance[] {
    return [...this.correspondances.values()];
  }
}

/** Pas d'attente reelle dans les tests : le backoff est simule. */
const SANS_ATTENTE = { delaiMs: 0, backoffBaseMs: 0, dormir: async () => {} };

let depot: DepotMemoire;
let provider: ProviderMemoire;

beforeEach(() => {
  depot = new DepotMemoire();
  provider = new ProviderMemoire();
});

describe('appliquerSync — cas nominal', () => {
  it('cree les seances et enregistre les correspondances', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }, { id: 'b', jour: 3 }]]);
    const apercu = calculerDiff(plan, [], [], OPTIONS);

    const resultat = await appliquerSync(plan, apercu, provider, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(resultat.succes).toBe(2);
    expect(resultat.echecs).toBe(0);
    expect(depot.liste()).toHaveLength(2);
    expect(provider.etat()).toHaveLength(2);
  });

  it('est idempotent : une seconde synchro ne propose plus rien', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);

    const premier = calculerDiff(plan, [], [], OPTIONS);
    await appliquerSync(plan, premier, provider, depot, { today: LUNDI, file: SANS_ATTENTE });

    const distantes = await provider.listerSeancesPlanifiees('2026-03-02', '2026-06-01');
    const second = calculerDiff(plan, distantes, depot.liste(), OPTIONS);

    expect(second.aCreer).toHaveLength(0);
    expect(second.aMettreAJour).toHaveLength(0);
    expect(second.aSupprimer).toHaveLength(0);
  });

  it('applique les suppressions avant les creations', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    provider.amorcer({ externalId: 'ext-orphelin', date: '2026-03-05', nom: '[PLAN] Vieille' });

    const distantes = await provider.listerSeancesPlanifiees('2026-03-02', '2026-06-01');
    const apercu = calculerDiff(plan, distantes, [], OPTIONS);
    await appliquerSync(plan, apercu, provider, depot, { today: LUNDI, file: SANS_ATTENTE });

    const actions = provider.appels.filter((a) => a.action !== 'lister').map((a) => a.action);
    expect(actions).toEqual(['supprimer', 'creer']);
  });
});

describe('appliquerSync — reprise sur erreur', () => {
  it('poursuit les autres operations quand une seule echoue', async () => {
    const plan = planTest([
      [{ id: 'a', jour: 1 }, { id: 'b', jour: 2 }, { id: 'c', jour: 3 }],
    ]);
    provider.programmerPanne('creer', 'b', new ErreurProvider('refus', 400), 1);

    const apercu = calculerDiff(plan, [], [], OPTIONS);
    const resultat = await appliquerSync(plan, apercu, provider, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(resultat.succes).toBe(2);
    expect(resultat.echecs).toBe(1);
    expect(depot.liste().map((c) => c.seanceId).sort()).toEqual(['a', 'c']);
  });

  it('retente une erreur 429 puis reussit', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    provider.programmerPanne('creer', 'a', new ErreurProvider('trop de requetes', 429), 2);

    const apercu = calculerDiff(plan, [], [], OPTIONS);
    const resultat = await appliquerSync(plan, apercu, provider, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(resultat.succes).toBe(1);
    expect(resultat.resultats[0]!.tentatives).toBe(3);
  });

  it('ne retente pas une erreur 400, qui ne passera jamais', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    provider.programmerPanne('creer', 'a', new ErreurProvider('payload invalide', 400), 5);

    const apercu = calculerDiff(plan, [], [], OPTIONS);
    const resultat = await appliquerSync(plan, apercu, provider, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(resultat.echecs).toBe(1);
    expect(resultat.resultats[0]!.tentatives).toBe(1);
  });

  it('abandonne apres le nombre maximal de tentatives sur une panne persistante', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    provider.programmerPanne('creer', 'a', new ErreurProvider('serveur en vrac', 503), 99);

    const apercu = calculerDiff(plan, [], [], OPTIONS);
    const resultat = await appliquerSync(plan, apercu, provider, depot, {
      today: LUNDI,
      file: { ...SANS_ATTENTE, tentativesMax: 3 },
    });

    expect(resultat.echecs).toBe(1);
    expect(resultat.resultats[0]!.tentatives).toBe(3);
    expect(depot.liste()).toHaveLength(0);
  });

  it('rejoue uniquement les operations en echec', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }, { id: 'b', jour: 2 }]]);
    // Exactement le nombre d'echecs que la premiere passe va consommer :
    // la panne est retombee au moment du rejeu, comme une indisponibilite
    // passagere du provider.
    provider.programmerPanne('creer', 'b', new ErreurProvider('panne', 503), 2);

    const apercu = calculerDiff(plan, [], [], OPTIONS);
    const premier = await appliquerSync(plan, apercu, provider, depot, {
      today: LUNDI,
      file: { ...SANS_ATTENTE, tentativesMax: 2 },
    });
    expect(premier.echecs).toBe(1);

    const rejeu = apercuDesEchecs(apercu, premier);
    expect(rejeu.aCreer.map((o) => o.seanceId)).toEqual(['b']);

    const second = await appliquerSync(plan, rejeu, provider, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(second.succes).toBe(1);
    expect(depot.liste()).toHaveLength(2);
  });
});

describe('appliquerSync — revalidation d un apercu perime', () => {
  it("refuse d ecrire sur une date devenue passee entre l apercu et la confirmation", async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]); // mardi 2026-03-03
    const apercu = calculerDiff(plan, [], [], OPTIONS);

    // L'utilisateur confirme deux jours plus tard.
    const resultat = await appliquerSync(plan, apercu, provider, depot, {
      today: '2026-03-05',
      file: SANS_ATTENTE,
    });

    expect(resultat.echecs).toBe(1);
    expect(resultat.resultats[0]!.erreur).toContain('perimee');
    expect(provider.etat()).toHaveLength(0);
  });

  it('refuse une operation dont la seance a disparu du plan', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const apercu = calculerDiff(plan, [], [], OPTIONS);

    const planAmpute = planTest([[]]);
    const resultat = await appliquerSync(planAmpute, apercu, provider, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(resultat.echecs).toBe(1);
    expect(resultat.resultats[0]!.erreur).toContain('disparu');
  });

  it('refuse une operation dont la seance a bouge depuis le calcul', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const apercu = calculerDiff(plan, [], [], OPTIONS);

    const planDeplace = planTest([[{ id: 'a', jour: 4 }]]);
    const resultat = await appliquerSync(planDeplace, apercu, provider, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(resultat.echecs).toBe(1);
    expect(resultat.resultats[0]!.erreur).toContain('deplacee');
  });
});

describe('appliquerSync — capacites du provider', () => {
  it('refuse toute ecriture sur un provider non configure', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const apercu = calculerDiff(plan, [], [], OPTIONS);

    const inerte = new ProviderMemoire();
    inerte.estConfigure = () => false;

    const resultat = await appliquerSync(plan, apercu, inerte, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(resultat.echecs).toBe(1);
    expect(resultat.resultats[0]!.erreur).toContain('non configure');
  });

  it('refuse une ecriture sur un provider en lecture seule', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const apercu = calculerDiff(plan, [], [], OPTIONS);

    const lectureSeule = new ProviderMemoire('[PLAN]', {
      ecrire: false,
      lire: true,
      supprimer: false,
    });

    const resultat = await appliquerSync(plan, apercu, lectureSeule, depot, {
      today: LUNDI,
      file: SANS_ATTENTE,
    });

    expect(resultat.echecs).toBe(1);
    expect(resultat.resultats[0]!.erreur).toContain('lecture seule');
  });

  it('propage une erreur explicite pour un provider non configure', async () => {
    const erreur = new ErreurProviderNonConfigure('cles absentes');
    expect(erreur.reessayable).toBe(false);
  });
});

describe('appliquerSync — journal', () => {
  it('journalise chaque operation, reussie ou non', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }, { id: 'b', jour: 2 }]]);
    provider.programmerPanne('creer', 'b', new ErreurProvider('refus', 400), 1);

    const apercu = calculerDiff(plan, [], [], OPTIONS);
    await appliquerSync(plan, apercu, provider, depot, { today: LUNDI, file: SANS_ATTENTE });

    expect(depot.journal).toHaveLength(2);
    expect(depot.journal.filter((e) => e.ok)).toHaveLength(1);
    const echec = depot.journal.find((e) => !e.ok);
    expect(echec?.erreur).toContain('refus');
    expect(echec?.seanceId).toBe('b');
  });
});

describe('cycle complet plan -> synchro -> modification -> resynchro', () => {
  it('cree, puis met a jour, puis supprime en suivant les modifications du plan', async () => {
    // 1. Creation initiale
    let plan = planTest([[{ id: 'a', jour: 1, duree: 30 }, { id: 'b', jour: 3, duree: 45 }]]);
    let apercu = calculerDiff(plan, [], [], OPTIONS);
    await appliquerSync(plan, apercu, provider, depot, { today: LUNDI, file: SANS_ATTENTE });
    expect(provider.etat()).toHaveLength(2);

    // 2. Une seance est allongee, l'autre retiree du plan
    plan = planTest([[{ id: 'a', jour: 1, duree: 50 }]]);
    let distantes = await provider.listerSeancesPlanifiees('2026-03-02', '2026-06-01');
    apercu = calculerDiff(plan, distantes, depot.liste(), OPTIONS);

    expect(apercu.aMettreAJour).toHaveLength(1);
    expect(apercu.aSupprimer).toHaveLength(1);

    await appliquerSync(plan, apercu, provider, depot, { today: LUNDI, file: SANS_ATTENTE });

    expect(provider.etat()).toHaveLength(1);
    expect(depot.liste()).toHaveLength(1);

    // 3. Plus rien a faire
    distantes = await provider.listerSeancesPlanifiees('2026-03-02', '2026-06-01');
    apercu = calculerDiff(plan, distantes, depot.liste(), OPTIONS);
    expect(apercu.aCreer.length + apercu.aMettreAJour.length + apercu.aSupprimer.length).toBe(0);

    // Le hash enregistre correspond bien au contenu courant.
    expect(depot.liste()[0]!.hashSynchronise).toBe(hashDe(plan, 'a'));
  });
});
