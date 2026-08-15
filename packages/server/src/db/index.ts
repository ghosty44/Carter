import pg from 'pg';

const { Pool } = pg;

export type BaseCarter = pg.Pool;

/**
 * Schema.
 *
 * Trois tables seulement : la session Garmin, les activites et la forme du
 * jour. Les activites sont mises en cache localement plutot que redemandees a
 * chaque affichage — Garmin est lent, et marteler une API non officielle est
 * le meilleur moyen de se faire remarquer.
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE session_garmin (
        id                INTEGER PRIMARY KEY DEFAULT 1,
        jetons_chiffres   TEXT NOT NULL,
        nom_affichage     TEXT,
        connecte_le       TEXT NOT NULL,
        derniere_synchro  TEXT,
        CONSTRAINT ligne_unique CHECK (id = 1)
      );

      CREATE TABLE activite (
        id                  TEXT PRIMARY KEY,
        date                TEXT NOT NULL,
        heure               TEXT,
        nom                 TEXT NOT NULL DEFAULT '',
        sport               TEXT NOT NULL,
        sport_garmin        TEXT NOT NULL DEFAULT '',
        duree_s             INTEGER NOT NULL DEFAULT 0,
        duree_totale_s      INTEGER NOT NULL DEFAULT 0,
        distance_m          DOUBLE PRECISION NOT NULL DEFAULT 0,
        denivele_m          DOUBLE PRECISION NOT NULL DEFAULT 0,
        denivele_negatif_m  DOUBLE PRECISION NOT NULL DEFAULT 0,
        fc_moy              INTEGER,
        fc_max              INTEGER,
        allure_s_km         DOUBLE PRECISION,
        vitesse_kmh         DOUBLE PRECISION,
        calories            INTEGER,
        cadence_moy         INTEGER,
        rpe                 INTEGER,
        charge              DOUBLE PRECISION
      );
      CREATE INDEX idx_activite_date ON activite (date DESC);

      CREATE TABLE wellness (
        date          TEXT PRIMARY KEY,
        poids_kg      DOUBLE PRECISION,
        fc_repos      INTEGER,
        hrv           DOUBLE PRECISION,
        sommeil_h     DOUBLE PRECISION,
        body_battery  INTEGER,
        stress_moy    INTEGER,
        pas           INTEGER
      );
    `,
  },
];

/**
 * Tables de la version precedente de l'app (gestion de plan, synchro,
 * export coach). Supprimees si elles trainent : elles ne sont plus lues par
 * personne et personne ne les remplira.
 */
const TABLES_OBSOLETES = [
  'plan',
  'plan_version',
  'correspondance',
  'journal_sync',
  'seance_realisee',
  'question_coach',
  'sauvegarde',
];

let poolPartage: pg.Pool | null = null;
let migrationEnCours: Promise<void> | null = null;

/**
 * Pool partage entre invocations.
 *
 * En serverless, le module reste charge entre deux requetes sur une meme
 * instance : garder le pool ici evite de rouvrir une connexion a chaque appel.
 * Petit pool volontairement — un seul utilisateur, et des instances qui
 * refroidissent sans prevenir consommeraient sinon la limite de connexions.
 */
export function ouvrirBase(url: string): BaseCarter {
  if (poolPartage !== null) return poolPartage;

  poolPartage = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // TLS des qu'on sort de la machine : la base porte des donnees de sante.
    ssl: estLocal(url) ? undefined : { rejectUnauthorized: true },
  });

  // Une erreur sur une connexion inactive ne doit pas tuer le processus.
  poolPartage.on('error', () => undefined);

  return poolPartage;
}

function estLocal(url: string): boolean {
  try {
    const hote = new URL(url).hostname;
    return hote === 'localhost' || hote === '127.0.0.1' || hote === '::1';
  } catch {
    return false;
  }
}

/**
 * Applique les migrations manquantes.
 *
 * Verrou consultatif : au premier deploiement, plusieurs requetes arrivent
 * avant que la base soit initialisee, et deux instances appliqueraient la
 * meme migration en parallele.
 */
export async function migrer(db: BaseCarter): Promise<void> {
  if (migrationEnCours !== null) return migrationEnCours;

  migrationEnCours = (async () => {
    const client = await db.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [8472531]);

      try {
        // Nettoyage de l'ancienne app, avant toute chose : son schema porte
        // des noms de table qui n'entrent pas en conflit, mais qui trainent.
        for (const table of TABLES_OBSOLETES) {
          await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        }

        await client.query(
          `CREATE TABLE IF NOT EXISTS schema_version (
             version     INTEGER PRIMARY KEY,
             applique_le TEXT NOT NULL
           )`,
        );

        const { rows } = await client.query<{ v: number | null }>(
          'SELECT MAX(version) AS v FROM schema_version',
        );

        // L'ancien schema montait a la version 2 avec des tables differentes.
        // On repart de zero : les seules donnees etaient des jetons Garmin,
        // que la reconnexion regenere.
        const ancienSchema = (rows[0]?.v ?? 0) > 0 && !(await tableExiste(client, 'activite'));
        if (ancienSchema) {
          await client.query('DROP TABLE IF EXISTS session_garmin CASCADE');
          await client.query('DROP TABLE IF EXISTS wellness CASCADE');
          await client.query('DELETE FROM schema_version');
        }

        const actuelle = ancienSchema ? 0 : (rows[0]?.v ?? 0);

        for (const migration of MIGRATIONS) {
          if (migration.version <= actuelle) continue;

          await client.query('BEGIN');
          try {
            await client.query(migration.sql);
            await client.query(
              'INSERT INTO schema_version (version, applique_le) VALUES ($1, $2)',
              [migration.version, new Date().toISOString()],
            );
            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK');
            throw e;
          }
        }
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [8472531]);
      }
    } finally {
      client.release();
    }
  })();

  try {
    await migrationEnCours;
  } finally {
    migrationEnCours = null;
  }
}

async function tableExiste(client: pg.PoolClient, nom: string): Promise<boolean> {
  const { rows } = await client.query<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS existe`,
    [nom],
  );
  return rows[0]?.existe === true;
}

/** Ferme le pool. Utile en test et a l'arret d'un serveur long-vivant. */
export async function fermerBase(): Promise<void> {
  if (poolPartage === null) return;
  const pool = poolPartage;
  poolPartage = null;
  await pool.end();
}
