import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fermerBase, migrer, ouvrirBase, type BaseCarter } from '../src/db/index.js';
import { DepotActivites, DepotSessionGarminPg, DepotWellness } from '../src/db/depots.js';
import { activite } from './aide.js';

/**
 * Tests d'integration contre un vrai Postgres.
 *
 * Ignores quand `TEST_DATABASE_URL` est absente, pour que `npm test` reste
 * executable sans base. Seul endroit du projet qui touche une base reelle.
 *
 *   TEST_DATABASE_URL=postgres://carter@127.0.0.1:5433/carter npm test
 */
const URL_TEST = process.env.TEST_DATABASE_URL;
const suite = URL_TEST ? describe : describe.skip;

let db: BaseCarter;

suite('couche Postgres', () => {
  beforeAll(async () => {
    db = ouvrirBase(URL_TEST!);
    // Table rase : ces tests partent d'un schema vierge.
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrer(db);
  });

  afterAll(async () => {
    await fermerBase();
  });

  it('cree le schema et se rejoue sans effet', async () => {
    await migrer(db);

    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tables = rows.map((r) => r.table_name);

    expect(tables).toContain('activite');
    expect(tables).toContain('wellness');
    expect(tables).toContain('session_garmin');
  });

  it('nettoie les tables de l ancienne version de l app', async () => {
    // Simule un deploiement par-dessus l'ancien schema.
    await db.query('CREATE TABLE IF NOT EXISTS plan (id TEXT PRIMARY KEY)');
    await db.query('CREATE TABLE IF NOT EXISTS journal_sync (id BIGSERIAL PRIMARY KEY)');

    await migrer(db);

    const { rows } = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('plan', 'journal_sync')`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('enregistre un lot d activites en une requete', async () => {
    const depot = new DepotActivites(db);

    const ecrites = await depot.enregistrerLot([
      activite('a1', '2026-03-03'),
      activite('a2', '2026-03-05', { sport: 'TRAIL', duree_s: 5400 }),
      activite('a3', '2026-03-07', { sport: 'VELO', vitesse_kmh: 28.4 }),
    ]);

    expect(ecrites).toBe(3);
    expect(await depot.compter()).toBe(3);

    const recentes = await depot.recentes(10);
    // La plus recente en premier.
    expect(recentes[0]!.id).toBe('a3');
    expect(recentes[0]!.vitesse_kmh).toBeCloseTo(28.4);
  });

  it('met a jour une activite deja connue au lieu de la dupliquer', async () => {
    const depot = new DepotActivites(db);

    // Garmin renvoie parfois une activite renommee apres coup.
    await depot.enregistrerLot([activite('a1', '2026-03-03', { nom: 'Footing renomme' })]);

    expect(await depot.compter()).toBe(3);
    expect((await depot.parId('a1'))!.nom).toBe('Footing renomme');
  });

  it('retrouve les activites sur une periode, de la plus recente', async () => {
    const depot = new DepotActivites(db);
    const lot = await depot.surPeriode('2026-03-04', '2026-03-31');

    expect(lot.map((a) => a.id)).toEqual(['a3', 'a2']);
  });

  it('donne la date de la derniere activite, pour ne recharger que la suite', async () => {
    const depot = new DepotActivites(db);
    expect(await depot.derniereDate()).toBe('2026-03-07');
  });

  it('preserve les valeurs connues quand une recuperation est partielle', async () => {
    const depot = new DepotWellness(db);

    await depot.enregistrerLot([
      {
        date: '2026-03-03',
        poids_kg: 72.4,
        fc_repos: 48,
        hrv: 68,
        sommeil_h: 7.5,
        body_battery: 88,
        stress_moy: 28,
        pas: 9412,
      },
    ]);

    // Seconde recuperation : Garmin ne remonte pas le poids ce coup-ci.
    await depot.enregistrerLot([
      {
        date: '2026-03-03',
        poids_kg: null,
        fc_repos: 47,
        hrv: null,
        sommeil_h: null,
        body_battery: null,
        stress_moy: null,
        pas: null,
      },
    ]);

    const [w] = await depot.surPeriode('2026-03-03', '2026-03-03');
    expect(w!.poids_kg).toBe(72.4); // conserve
    expect(w!.sommeil_h).toBe(7.5); // conserve
    expect(w!.fc_repos).toBe(47); // rafraichi
  });

  it('chiffre les jetons Garmin et sait les relire', async () => {
    const secret = 'secret-de-test-suffisamment-long-0123456789';
    const depot = new DepotSessionGarminPg(db, secret);

    const jetons = {
      oauth1: { oauth_token: 'jeton-1', oauth_token_secret: 'secret-1' },
      oauth2: { access_token: 'acces', refresh_token: 'refresh', expire_le: 1_800_000_000_000 },
    };

    await depot.enregistrerJetons(jetons, 'mon-compte');

    const relu = await depot.lire();
    expect(relu?.jetons).toEqual(jetons);
    expect(relu?.nomAffichage).toBe('mon-compte');

    // Rien en clair dans la colonne.
    const { rows } = await db.query<{ jetons_chiffres: string }>(
      'SELECT jetons_chiffres FROM session_garmin WHERE id = 1',
    );
    expect(rows[0]!.jetons_chiffres).not.toContain('jeton-1');
    expect(rows[0]!.jetons_chiffres).not.toContain('acces');
  });

  it('efface une session illisible plutot que d echouer a chaque appel', async () => {
    // Change de secret : les jetons deviennent indechiffrables.
    const autre = new DepotSessionGarminPg(db, 'un-tout-autre-secret-0123456789abcd');

    expect(await autre.lire()).toBeNull();
    // La ligne a ete nettoyee, la reconnexion repart proprement.
    const { rows } = await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM session_garmin');
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('trace la date de derniere recuperation', async () => {
    const secret = 'secret-de-test-suffisamment-long-0123456789';
    const depot = new DepotSessionGarminPg(db, secret);

    await depot.enregistrerJetons(
      {
        oauth1: { oauth_token: 't', oauth_token_secret: 's' },
        oauth2: { access_token: 'a', refresh_token: 'r', expire_le: 1_800_000_000_000 },
      },
      'compte',
    );

    expect((await depot.lire())?.derniereSynchro).toBeNull();
    await depot.marquerSynchro();
    expect((await depot.lire())?.derniereSynchro).not.toBeNull();
  });
});
