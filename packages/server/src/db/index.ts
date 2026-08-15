import pg from 'pg';

const { Pool } = pg;

export type BaseCarter = pg.Pool;

/**
 * Schema Postgres (Neon).
 *
 * Le plan reste stocke en JSON dans une colonne : il est arborescent, toujours
 * lu en entier, et le versionner est plus simple qu'une dizaine de tables a
 * joindre. Les tables relationnelles servent a ce qui se requete par date :
 * realise, wellness, correspondances, journal.
 *
 * `jsonb` n'apporterait rien ici — le contenu n'est jamais interroge par
 * champ, seulement lu et reecrit en entier — et imposerait des conversions a
 * chaque lecture. On garde `text`.
 */
const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE plan (
        id           TEXT PRIMARY KEY,
        contenu      TEXT NOT NULL,
        version      INTEGER NOT NULL,
        modifie_le   TEXT NOT NULL
      );

      CREATE TABLE plan_version (
        id           BIGSERIAL PRIMARY KEY,
        plan_id      TEXT NOT NULL,
        version      INTEGER NOT NULL,
        contenu      TEXT NOT NULL,
        origine      TEXT NOT NULL,
        commentaire  TEXT NOT NULL DEFAULT '',
        cree_le      TEXT NOT NULL,
        UNIQUE (plan_id, version)
      );

      CREATE TABLE correspondance (
        seance_id         TEXT NOT NULL,
        provider          TEXT NOT NULL,
        external_id       TEXT NOT NULL,
        hash_synchronise  TEXT NOT NULL,
        synchronise_le    TEXT NOT NULL,
        PRIMARY KEY (seance_id, provider)
      );
      CREATE INDEX idx_correspondance_external
        ON correspondance (provider, external_id);

      CREATE TABLE journal_sync (
        id           BIGSERIAL PRIMARY KEY,
        horodatage   TEXT NOT NULL,
        provider     TEXT NOT NULL,
        action       TEXT NOT NULL,
        seance_id    TEXT,
        external_id  TEXT,
        date_seance  TEXT,
        titre        TEXT NOT NULL DEFAULT '',
        ok           BOOLEAN NOT NULL,
        erreur       TEXT,
        reponse      TEXT
      );
      CREATE INDEX idx_journal_horodatage ON journal_sync (horodatage DESC);

      CREATE TABLE seance_realisee (
        id               TEXT PRIMARY KEY,
        seance_id        TEXT,
        date             TEXT NOT NULL,
        source           TEXT NOT NULL,
        external_id      TEXT,
        nom              TEXT NOT NULL DEFAULT '',
        type_sport       TEXT NOT NULL DEFAULT 'Run',
        duree_s          INTEGER NOT NULL DEFAULT 0,
        distance_m       DOUBLE PRECISION NOT NULL DEFAULT 0,
        denivele_m       DOUBLE PRECISION NOT NULL DEFAULT 0,
        fc_moy           INTEGER,
        fc_max           INTEGER,
        allure_moy_s_km  DOUBLE PRECISION,
        allure_gap_s_km  DOUBLE PRECISION,
        rpe              INTEGER,
        ressenti         INTEGER,
        douleurs         TEXT NOT NULL DEFAULT '[]',
        commentaire      TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX idx_realisee_date ON seance_realisee (date);
      CREATE UNIQUE INDEX idx_realisee_source_external
        ON seance_realisee (source, external_id)
        WHERE external_id IS NOT NULL;

      CREATE TABLE wellness (
        date          TEXT PRIMARY KEY,
        poids_kg      DOUBLE PRECISION,
        fc_repos      INTEGER,
        hrv           DOUBLE PRECISION,
        sommeil_h     DOUBLE PRECISION,
        fatigue_1_5   INTEGER,
        humeur_1_5    INTEGER,
        note          TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE question_coach (
        id         BIGSERIAL PRIMARY KEY,
        texte      TEXT NOT NULL,
        cree_le    TEXT NOT NULL,
        repondue   BOOLEAN NOT NULL DEFAULT FALSE
      );

      /*
       * Instantanes pris avant chaque operation risquee.
       *
       * Sur disque, la sauvegarde etait une copie du fichier SQLite. Sur une
       * base geree, ce mecanisme n'existe plus : on conserve donc un export
       * JSON complet du plan et de son historique, qui est ce qu'on ne peut
       * pas reconstruire. Les activites et le wellness sont, eux,
       * reimportables depuis le provider.
       */
      CREATE TABLE sauvegarde (
        id       BIGSERIAL PRIMARY KEY,
        motif    TEXT NOT NULL,
        cree_le  TEXT NOT NULL,
        contenu  TEXT NOT NULL
      );
      CREATE INDEX idx_sauvegarde_cree_le ON sauvegarde (cree_le DESC);
    `,
  },
  {
    version: 2,
    sql: `
      /*
       * Session Garmin Connect. Une seule ligne (id = 1).
       *
       * On y stocke les jetons OAuth, chiffres, et JAMAIS le mot de passe :
       * celui-ci ne sert qu'une fois, au moment de l'echange initial, et il
       * n'est pas conserve. Un jeton compromis se revoque en changeant le mot
       * de passe Garmin ; un mot de passe stocke compromet le compte entier.
       */
      CREATE TABLE session_garmin (
        id                INTEGER PRIMARY KEY DEFAULT 1,
        jetons_chiffres   TEXT NOT NULL,
        nom_affichage     TEXT,
        connecte_le       TEXT NOT NULL,
        rafraichi_le      TEXT,
        CONSTRAINT ligne_unique CHECK (id = 1)
      );
    `,
  },
];

let poolPartage: pg.Pool | null = null;
let migrationEnCours: Promise<void> | null = null;

/**
 * Pool partage entre invocations.
 *
 * En environnement serverless, le module reste charge entre deux requetes sur
 * une meme instance : garder le pool en variable de module evite de rouvrir
 * une connexion a chaque appel. Neon multiplexe derriere son pooler, donc un
 * pool de petite taille suffit pour un usage mono-utilisateur — et evite de
 * consommer la limite de connexions avec des instances qui refroidissent.
 *
 * On utilise `pg` plutot que le driver WebSocket de Neon : il parle le
 * protocole Postgres standard, donc la meme configuration marche contre Neon,
 * contre un Postgres local et contre n'importe quel autre hebergeur. C'est
 * aussi ce qui rend la couche testable pour de vrai.
 */
export function ouvrirBase(url: string): BaseCarter {
  if (poolPartage !== null) return poolPartage;

  poolPartage = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // TLS obligatoire des qu'on sort de la machine : la base porte des
    // donnees de sante. Neon impose deja `sslmode=require` dans son URL.
    ssl: estLocal(url) ? undefined : { rejectUnauthorized: true },
  });

  // Une erreur sur une connexion inactive ne doit pas faire tomber le
  // processus : le pool la remplacera a la prochaine requete.
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
 * Idempotent et sur par concurrence : un verrou consultatif Postgres empeche
 * deux invocations simultanees d'appliquer la meme migration. C'est le cas
 * normal au premier deploiement, ou plusieurs requetes arrivent avant que la
 * base soit initialisee.
 */
export async function migrer(db: BaseCarter): Promise<void> {
  if (migrationEnCours !== null) return migrationEnCours;

  migrationEnCours = (async () => {
    const client = await db.connect();
    try {
      await client.query(
        `CREATE TABLE IF NOT EXISTS schema_version (
           version     INTEGER PRIMARY KEY,
           applique_le TEXT NOT NULL
         )`,
      );

      // 8472531 : identifiant arbitraire mais stable, propre a ce schema.
      await client.query('SELECT pg_advisory_lock($1)', [8472531]);

      try {
        const { rows } = await client.query<{ v: number | null }>(
          'SELECT MAX(version) AS v FROM schema_version',
        );
        const actuelle = rows[0]?.v ?? 0;

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

/**
 * Prend un instantane avant une operation risquee (synchro, import coach,
 * restauration) et retourne son identifiant.
 *
 * Contrairement a la copie de fichier SQLite qu'elle remplace, cette
 * sauvegarde ne couvre que le plan et son historique. C'est volontaire : le
 * plan est la seule donnee non reconstructible. Les activites et le wellness
 * se reimportent depuis Intervals.icu, et les dupliquer a chaque synchro
 * ferait gonfler la base sans rien apporter.
 */
export async function sauvegarder(
  db: BaseCarter,
  motif: string,
): Promise<string | null> {
  const cree = new Date().toISOString();

  const plans = await db.query('SELECT * FROM plan');
  if (plans.rows.length === 0) return null; // rien a sauvegarder

  const versions = await db.query(
    'SELECT * FROM plan_version ORDER BY plan_id, version',
  );
  const correspondances = await db.query('SELECT * FROM correspondance');

  const contenu = JSON.stringify({
    cree_le: cree,
    motif,
    plan: plans.rows,
    plan_version: versions.rows,
    correspondance: correspondances.rows,
  });

  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO sauvegarde (motif, cree_le, contenu) VALUES ($1, $2, $3) RETURNING id',
    [motif, cree, contenu],
  );

  await purgerSauvegardes(db, 30);
  return rows[0]?.id ?? null;
}

/** Conserve les N sauvegardes les plus recentes. */
async function purgerSauvegardes(db: BaseCarter, garder: number): Promise<void> {
  await db.query(
    `DELETE FROM sauvegarde
     WHERE id NOT IN (SELECT id FROM sauvegarde ORDER BY id DESC LIMIT $1)`,
    [garder],
  );
}

/** Ferme le pool. Utile en test et a l'arret d'un serveur long-vivant. */
export async function fermerBase(): Promise<void> {
  if (poolPartage === null) return;
  const pool = poolPartage;
  poolPartage = null;
  await pool.end();
}
