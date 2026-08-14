import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { seancesPlanifiees } from '@carter/shared';
import { ProviderIntervals } from '../src/providers/intervals.js';
import { ErreurProvider } from '../src/providers/types.js';
import { corpsEvenement } from '../src/providers/intervals-contrat.js';
import { planTest } from './aide.js';

const DOSSIER = join(import.meta.dirname, 'fixtures', 'intervals');

function fixture(nom: string): unknown {
  return JSON.parse(readFileSync(join(DOSSIER, `${nom}.json`), 'utf8'));
}

interface AppelEnregistre {
  url: string;
  methode: string;
  entetes: Record<string, string>;
  corps: unknown;
}

/** Faux `fetch` : rejoue une reponse enregistree et note l'appel recu. */
function faussetFetch(
  reponses: { statut?: number; corps?: unknown; texte?: string }[],
  appels: AppelEnregistre[],
): typeof globalThis.fetch {
  let index = 0;
  return (async (url: string | URL, init?: RequestInit) => {
    const config = reponses[Math.min(index, reponses.length - 1)]!;
    index += 1;

    appels.push({
      url: String(url),
      methode: init?.method ?? 'GET',
      entetes: (init?.headers ?? {}) as Record<string, string>,
      corps: init?.body ? JSON.parse(init.body as string) : undefined,
    });

    const statut = config.statut ?? 200;
    const texte = config.texte ?? JSON.stringify(config.corps ?? null);

    return {
      ok: statut >= 200 && statut < 300,
      status: statut,
      text: async () => texte,
    } as Response;
  }) as typeof globalThis.fetch;
}

function provider(
  reponses: { statut?: number; corps?: unknown; texte?: string }[],
  appels: AppelEnregistre[] = [],
): { p: ProviderIntervals; appels: AppelEnregistre[] } {
  return {
    p: new ProviderIntervals({
      athleteId: 'i123456',
      apiKey: 'cle-de-test',
      prefixe: '[PLAN]',
      fetch: faussetFetch(reponses, appels),
    }),
    appels,
  };
}

describe('ProviderIntervals — configuration', () => {
  it('se declare non configure sans cle', () => {
    const p = new ProviderIntervals({ athleteId: '', apiKey: '', prefixe: '[PLAN]' });
    expect(p.estConfigure()).toBe(false);
  });

  it('echoue explicitement plutot que de partir en requete sans cle', async () => {
    const p = new ProviderIntervals({ athleteId: '', apiKey: '', prefixe: '[PLAN]' });
    await expect(p.listerSeancesPlanifiees('2026-03-01', '2026-03-31')).rejects.toThrow(
      /pas configure/i,
    );
  });

  it('envoie un basic auth avec le login litteral API_KEY', async () => {
    const { p, appels } = provider([{ corps: [] }]);
    await p.listerSeancesPlanifiees('2026-03-01', '2026-03-31');

    const entete = appels[0]!.entetes['Authorization']!;
    expect(entete.startsWith('Basic ')).toBe(true);
    expect(Buffer.from(entete.slice(6), 'base64').toString()).toBe('API_KEY:cle-de-test');
  });
});

describe('ProviderIntervals — lecture des evenements planifies', () => {
  it('lit les evenements enregistres et marque ceux qui appartiennent a Carter', async () => {
    const { p } = provider([{ corps: fixture('evenements') }]);
    const evenements = await p.listerSeancesPlanifiees('2026-03-01', '2026-03-31');

    expect(evenements.map((e) => e.externalId)).toEqual([
      '481001',
      '481002',
      '481003',
      '481004',
    ]);

    const parId = new Map(evenements.map((e) => [e.externalId, e]));
    expect(parId.get('481001')!.possedeParCarter).toBe(true);
    // La sortie club n'a pas le prefixe : elle ne sera jamais supprimee.
    expect(parId.get('481003')!.possedeParCarter).toBe(false);
    expect(parId.get('481001')!.date).toBe('2026-03-03');
  });

  it('ignore un evenement sans date exploitable au lieu de faire echouer la synchro', async () => {
    const { p } = provider([{ corps: fixture('evenements') }]);
    const evenements = await p.listerSeancesPlanifiees('2026-03-01', '2026-03-31');

    expect(evenements.find((e) => e.externalId === '481005')).toBeUndefined();
  });

  it('tolere un champ inconnu ajoute par Intervals.icu', async () => {
    const { p } = provider([{ corps: fixture('evenements') }]);
    const evenements = await p.listerSeancesPlanifiees('2026-03-01', '2026-03-31');

    expect(evenements.find((e) => e.externalId === '481004')).toBeDefined();
  });
});

describe('ProviderIntervals — ecriture', () => {
  it('poste un evenement WORKOUT avec une date locale sans fuseau', async () => {
    const plan = planTest([[{ id: 'a', jour: 1, titre: 'Footing facile 30 min', duree: 30 }]]);
    const planifiee = seancesPlanifiees(plan)[0]!;

    const { p, appels } = provider([{ corps: { id: 481010 } }]);
    const { externalId } = await p.creerSeance(planifiee);

    expect(externalId).toBe('481010');
    expect(appels[0]!.methode).toBe('POST');
    expect(appels[0]!.url).toContain('/athlete/i123456/events');

    const corps = appels[0]!.corps as Record<string, unknown>;
    expect(corps.category).toBe('WORKOUT');
    expect(corps.start_date_local).toBe('2026-03-03T00:00:00');
    expect(corps.name).toBe('[PLAN] Footing facile 30 min');
    expect(corps.type).toBe('Run');
    expect(corps.moving_time).toBe(1800);
    expect(corps.external_id).toBe('carter:bloc-1:a');
  });

  it('envoie le renforcement avec le type de sport WeightTraining', async () => {
    const plan = planTest([[{ id: 'r', jour: 0, type: 'RENFO', duree: 20 }]]);
    const planifiee = seancesPlanifiees(plan)[0]!;

    const { p, appels } = provider([{ corps: { id: 1 } }]);
    await p.creerSeance(planifiee);

    expect((appels[0]!.corps as Record<string, unknown>).type).toBe('WeightTraining');
  });

  it('fait porter la meme clef d idempotence a deux appels identiques', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const planifiee = seancesPlanifiees(plan)[0]!;

    const un = corpsEvenement(planifiee, '[PLAN]', 'carter:bloc-1:a');
    const deux = corpsEvenement(planifiee, '[PLAN]', 'carter:bloc-1:a');

    expect(un.external_id).toBe(deux.external_id);
    expect(un).toEqual(deux);
  });

  it('met a jour via PUT sur l identifiant distant', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const planifiee = seancesPlanifiees(plan)[0]!;

    const { p, appels } = provider([{ statut: 200, corps: { id: 481010 } }]);
    await p.mettreAJourSeance('481010', planifiee);

    expect(appels[0]!.methode).toBe('PUT');
    expect(appels[0]!.url).toContain('/events/481010');
  });

  it('accepte un 204 sans corps sur une suppression', async () => {
    const { p, appels } = provider([{ statut: 204, texte: '' }]);
    await expect(p.supprimerSeance('481010')).resolves.toBeUndefined();

    expect(appels[0]!.methode).toBe('DELETE');
  });
});

describe('ProviderIntervals — erreurs', () => {
  it('marque un 429 comme reessayable', async () => {
    const { p } = provider([{ statut: 429, texte: 'rate limited' }]);

    await expect(p.listerSeancesPlanifiees('2026-03-01', '2026-03-31')).rejects.toSatisfy(
      (e: unknown) => e instanceof ErreurProvider && e.reessayable && e.statut === 429,
    );
  });

  it('marque un 400 comme definitif', async () => {
    const { p } = provider([{ statut: 400, texte: 'champ manquant' }]);

    await expect(p.listerSeancesPlanifiees('2026-03-01', '2026-03-31')).rejects.toSatisfy(
      (e: unknown) => e instanceof ErreurProvider && !e.reessayable,
    );
  });

  it('traite une panne reseau comme reessayable', async () => {
    const p = new ProviderIntervals({
      athleteId: 'i1',
      apiKey: 'k',
      prefixe: '[PLAN]',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof globalThis.fetch,
    });

    await expect(p.listerSeancesPlanifiees('2026-03-01', '2026-03-31')).rejects.toSatisfy(
      (e: unknown) => e instanceof ErreurProvider && e.reessayable && e.statut === null,
    );
  });

  it('refuse une reponse de creation sans identifiant', async () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const planifiee = seancesPlanifiees(plan)[0]!;
    const { p } = provider([{ corps: { message: 'ok' } }]);

    await expect(p.creerSeance(planifiee)).rejects.toThrow(/identifiant/i);
  });
});

describe('ProviderIntervals — lecture des activites', () => {
  it('convertit une activite en seance realisee', async () => {
    const { p } = provider([{ corps: fixture('activites') }]);
    const activites = await p.listerActivites('2026-03-01', '2026-03-31');

    const footing = activites.find((a) => a.external_id === 'i91001')!;
    expect(footing.date).toBe('2026-03-03');
    expect(footing.duree_s).toBe(1854);
    expect(footing.distance_m).toBeCloseTo(5210.4);
    expect(footing.fc_moy).toBe(142);
    expect(footing.rpe).toBe(4);
    // 2,81 m/s -> environ 355 s/km, soit 5'56/km.
    expect(footing.allure_moy_s_km).toBeCloseTo(355.87, 1);
    expect(footing.allure_gap_s_km).toBeCloseTo(364.96, 1);
  });

  it('ne calcule pas d allure pour une activite non pedestre', async () => {
    const { p } = provider([{ corps: fixture('activites') }]);
    const activites = await p.listerActivites('2026-03-01', '2026-03-31');

    const renfo = activites.find((a) => a.external_id === 'i91003')!;
    expect(renfo.allure_moy_s_km).toBeNull();
  });

  it('degrade proprement une activite sans donnees', async () => {
    const { p } = provider([{ corps: fixture('activites') }]);
    const activites = await p.listerActivites('2026-03-01', '2026-03-31');

    const vide = activites.find((a) => a.external_id === 'i91004')!;
    expect(vide.duree_s).toBe(0);
    expect(vide.fc_moy).toBeNull();
    expect(vide.allure_moy_s_km).toBeNull();
  });
});

describe('ProviderIntervals — lecture du wellness', () => {
  it('convertit les secondes de sommeil en heures', async () => {
    const { p } = provider([{ corps: fixture('wellness') }]);
    const entrees = await p.listerWellness('2026-03-01', '2026-03-31');

    expect(entrees[0]!.date).toBe('2026-03-03');
    expect(entrees[0]!.sommeil_h).toBe(7.5);
    expect(entrees[0]!.fc_repos).toBe(48);
  });

  it('rejette les valeurs hors plage plutot que de les propager', async () => {
    const { p } = provider([{ corps: fixture('wellness') }]);
    const entrees = await p.listerWellness('2026-03-01', '2026-03-31');

    const aberrante = entrees.find((e) => e.date === '2026-03-05')!;
    expect(aberrante.fatigue_1_5).toBeNull(); // 9 sort de l'echelle 1-5
    expect(aberrante.humeur_1_5).toBeNull(); // 0 aussi
  });
});
