import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SeanceRealisee } from '@carter/shared';
import { fermerBase, migrer, ouvrirBase, sauvegarder, type BaseCarter } from '../src/db/index.js';
import {
  DepotPlan,
  DepotQuestions,
  DepotRealise,
  DepotSyncPg,
  DepotWellness,
} from '../src/db/depots.js';
import { calculerDiff } from '../src/sync/diff.js';
import { appliquerSync } from '../src/sync/moteur.js';
import { ProviderMemoire } from '../src/providers/memoire.js';
import { LUNDI, TYPES_SYNC, hashDe, planTest } from './aide.js';

/**
 * Tests d'integration contre un vrai Postgres.
 *
 * Ignores automatiquement quand `TEST_DATABASE_URL` est absente, pour que
 * `npm test` reste executable sans base. C'est le seul endroit du projet qui
 * touche une base reelle : le reste des tests est isole par construction.
 *
 *   TEST_DATABASE_URL=postgres://carter@127.0.0.1:5433/carter npm test
 */
const URL_TEST = process.env.TEST_DATABASE_URL;
const suite = URL_TEST ? describe : describe.skip;

let db: BaseCarter;

suite('couche Postgres', () => {
  beforeAll(async () => {
    db = ouvrirBase(URL_TEST!);
    // Table rase : ces tests doivent partir d'un schema vierge.
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrer(db);
  });

  afterAll(async () => {
    await fermerBase();
  });

  it('applique les migrations et est rejouable sans effet', async () => {
    await migrer(db); // second passage : ne doit rien casser

    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tables = rows.map((r) => r.table_name);

    expect(tables).toContain('plan');
    expect(tables).toContain('plan_version');
    expect(tables).toContain('correspondance');
    expect(tables).toContain('journal_sync');
    expect(tables).toContain('seance_realisee');
    expect(tables).toContain('wellness');
    expect(tables).toContain('sauvegarde');
  });

  it('enregistre un plan et incremente la version a chaque revision', async () => {
    const depot = new DepotPlan(db);
    const plan = planTest([[{ id: 'a', jour: 1, duree: 30 }]]);

    const v1 = await depot.enregistrer(plan, 'INITIAL');
    expect(v1.version).toBe(1);

    const v2 = await depot.enregistrer(plan, 'EDITION');
    expect(v2.version).toBe(2);

    const courant = await depot.courant();
    expect(courant?.version).toBe(2);

    const versions = await depot.versions(plan.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);

    const ancienne = await depot.versionPrecise(plan.id, 1);
    expect(ancienne?.version).toBe(1);
  });

  it('serialise deux revisions concurrentes sans collision de version', async () => {
    const depot = new DepotPlan(db);
    const plan = planTest([[{ id: 'a', jour: 1 }]], '2026-03-09');
    plan.id = 'plan-concurrent';

    // Le cas serverless typique : deux invocations en parallele.
    const resultats = await Promise.all([
      depot.enregistrer(plan, 'IMPORT'),
      depot.enregistrer(plan, 'IMPORT'),
      depot.enregistrer(plan, 'IMPORT'),
    ]);

    const versions = resultats.map((r) => r.version).sort((a, b) => a - b);
    expect(versions).toEqual([1, 2, 3]);
  });

  it('conserve les correspondances et le journal de synchro', async () => {
    const depot = new DepotSyncPg(db);

    await depot.enregistrerCorrespondance({
      seanceId: 's1',
      externalId: 'ext-1',
      provider: 'INTERVALS',
      hash: 'h1',
    });
    // Reecriture : doit mettre a jour, pas dupliquer.
    await depot.enregistrerCorrespondance({
      seanceId: 's1',
      externalId: 'ext-1',
      provider: 'INTERVALS',
      hash: 'h2',
    });

    let liste = await depot.correspondances('INTERVALS');
    expect(liste).toHaveLength(1);
    expect(liste[0]!.hashSynchronise).toBe('h2');

    // Isolement par provider.
    expect(await depot.correspondances('LOCAL')).toHaveLength(0);

    await depot.journaliser({
      provider: 'INTERVALS',
      action: 'CREER',
      seanceId: 's1',
      externalId: 'ext-1',
      dateSeance: '2026-03-03',
      titre: 'Footing',
      ok: true,
      erreur: null,
      reponse: null,
    });

    const journal = await depot.journal(10);
    expect(journal[0]).toMatchObject({ action: 'CREER', ok: true, titre: 'Footing' });
    expect(typeof journal[0]!.id).toBe('number');

    await depot.oublierCorrespondance('ext-1');
    liste = await depot.correspondances('INTERVALS');
    expect(liste).toHaveLength(0);
  });

  it('ne laisse pas un reimport ecraser une saisie manuelle', async () => {
    const depot = new DepotRealise(db);

    const importee: SeanceRealisee = {
      id: 'intervals-1',
      seance_id: null,
      date: '2026-03-03',
      source: 'INTERVALS',
      external_id: 'i1',
      nom: 'Footing',
      type_sport: 'Run',
      duree_s: 1800,
      distance_m: 5000,
      denivele_m: 30,
      fc_moy: 142,
      fc_max: 158,
      allure_moy_s_km: 356,
      allure_gap_s_km: 350,
      rpe: null,
      ressenti: null,
      douleurs: [],
      commentaire: '',
    };

    // 1. Import provider.
    await depot.enregistrer(importee, { preserverSaisie: true });

    // 2. L'athlete saisit son ressenti depuis l'app : ecriture directe.
    const apres = (await depot.parId('intervals-1'))!;
    await depot.enregistrer({
      ...apres,
      rpe: 6,
      ressenti: 3,
      douleurs: [{ zone: 'Mollet droit', intensite: 4, note: 'tiraillement' }],
      commentaire: 'jambes lourdes',
    });

    const saisi = (await depot.parId('intervals-1'))!;
    expect(saisi.douleurs).toHaveLength(1);

    // 3. Reimport provider, comme le fait la route : la saisie est preservee.
    await depot.enregistrer({ ...importee, fc_moy: 145 }, { preserverSaisie: true });

    const final = (await depot.parId('intervals-1'))!;
    expect(final.fc_moy).toBe(145); // la donnee objective est rafraichie
    expect(final.rpe).toBe(6); // la saisie manuelle survit
    expect(final.ressenti).toBe(3);
    expect(final.douleurs).toHaveLength(1);
    expect(final.commentaire).toBe('jambes lourdes');
  });

  it('laisse une saisie manuelle retirer une douleur entree par erreur', async () => {
    const depot = new DepotRealise(db);
    const avant = (await depot.parId('intervals-1'))!;
    expect(avant.douleurs).toHaveLength(1);

    // Ecriture directe : l'athlete efface la douleur.
    await depot.enregistrer({ ...avant, douleurs: [] });

    const apres = (await depot.parId('intervals-1'))!;
    expect(apres.douleurs).toHaveLength(0);
    expect(apres.rpe).toBe(6); // le reste de la saisie est intact
  });

  it('ne cree pas de doublon sur reimport de la meme activite', async () => {
    const { rows } = await db.query<{ n: string }>(
      "SELECT COUNT(*) AS n FROM seance_realisee WHERE source = 'INTERVALS' AND external_id = 'i1'",
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('fusionne le wellness sans effacer une valeur deja saisie', async () => {
    const depot = new DepotWellness(db);

    await depot.enregistrer({
      date: '2026-03-04',
      poids_kg: 72.4,
      fc_repos: null,
      hrv: null,
      sommeil_h: null,
      fatigue_1_5: 2,
      humeur_1_5: null,
      note: 'saisie du matin',
    });

    // Import provider : ne remonte pas le poids ni la note.
    await depot.enregistrer({
      date: '2026-03-04',
      poids_kg: null,
      fc_repos: 48,
      hrv: 68.2,
      sommeil_h: 7.5,
      fatigue_1_5: null,
      humeur_1_5: 4,
      note: '',
    });

    const [w] = await depot.surPeriode('2026-03-04', '2026-03-04');
    expect(w!.poids_kg).toBe(72.4);
    expect(w!.fatigue_1_5).toBe(2);
    expect(w!.note).toBe('saisie du matin');
    expect(w!.fc_repos).toBe(48);
    expect(w!.sommeil_h).toBe(7.5);
  });

  it('gere les questions coach', async () => {
    const depot = new DepotQuestions(db);
    await depot.ajouter('Faut-il maintenir la sortie longue si le dos tire ?');

    const ouvertes = await depot.ouvertes();
    expect(ouvertes).toHaveLength(1);
    expect(typeof ouvertes[0]!.id).toBe('number');

    await depot.marquerRepondues([ouvertes[0]!.id]);
    expect(await depot.ouvertes()).toHaveLength(0);
  });

  it('prend une sauvegarde du plan et purge les anciennes', async () => {
    const id = await sauvegarder(db, 'test');
    expect(id).not.toBeNull();

    const { rows } = await db.query<{ contenu: string }>(
      'SELECT contenu FROM sauvegarde ORDER BY id DESC LIMIT 1',
    );
    const contenu = JSON.parse(rows[0]!.contenu) as { plan: unknown[]; motif: string };
    expect(contenu.motif).toBe('test');
    expect(contenu.plan.length).toBeGreaterThan(0);

    for (let i = 0; i < 35; i++) await sauvegarder(db, `bourrage-${i}`);
    const { rows: compte } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM sauvegarde');
    expect(Number(compte[0]!.n)).toBeLessThanOrEqual(30);
  });

  it('boucle complete : plan, apercu, application, idempotence', async () => {
    await db.query('TRUNCATE correspondance, journal_sync');

    const depotPlan = new DepotPlan(db);
    const depotSync = new DepotSyncPg(db);
    const provider = new ProviderMemoire();

    const plan = planTest([[{ id: 'x1', jour: 1 }, { id: 'x2', jour: 3 }]]);
    plan.id = 'plan-boucle';
    await depotPlan.enregistrer(plan, 'INITIAL');

    const options = {
      provider: 'LOCAL' as const,
      typesSynchronises: TYPES_SYNC,
      fenetreSemaines: 6,
      today: LUNDI,
    };

    const apercu = calculerDiff(plan, [], await depotSync.correspondances('LOCAL'), options);
    expect(apercu.aCreer).toHaveLength(2);

    const resultat = await appliquerSync(plan, apercu, provider, depotSync, {
      today: LUNDI,
      file: { delaiMs: 0, backoffBaseMs: 0, dormir: async () => {} },
    });
    expect(resultat.succes).toBe(2);
    expect(resultat.interrompu).toBe(false);

    // Les correspondances ont bien ete persistees, avec le bon hash.
    const corr = await depotSync.correspondances('LOCAL');
    expect(corr).toHaveLength(2);
    expect(corr.find((c) => c.seanceId === 'x1')!.hashSynchronise).toBe(hashDe(plan, 'x1'));

    // Second passage : plus rien a faire.
    const distantes = await provider.listerSeancesPlanifiees('2026-03-02', '2026-06-01');
    const second = calculerDiff(plan, distantes, corr, options);
    expect(second.aCreer.length + second.aMettreAJour.length + second.aSupprimer.length).toBe(0);

    // Le journal a garde la trace des deux creations.
    const journal = await depotSync.journal(10);
    expect(journal.filter((e) => e.action === 'CREER' && e.ok)).toHaveLength(2);
  });
});
