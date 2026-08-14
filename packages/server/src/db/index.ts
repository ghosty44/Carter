import Database from 'better-sqlite3';
import { copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type BaseCarter = Database.Database;

/**
 * Schema. Le plan lui-meme est stocke en JSON dans une seule colonne :
 * il est arborescent, toujours lu en entier, et le versionner est plus simple
 * qu'une dizaine de tables a joindre. Les tables relationnelles servent a ce
 * qui se requete par date : realise, wellness, correspondances, journal.
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

      -- Historique complet : chaque revision est conservee telle quelle.
      CREATE TABLE plan_version (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id      TEXT NOT NULL,
        version      INTEGER NOT NULL,
        contenu      TEXT NOT NULL,
        origine      TEXT NOT NULL,
        commentaire  TEXT NOT NULL DEFAULT '',
        cree_le      TEXT NOT NULL,
        UNIQUE (plan_id, version)
      );

      -- Lien entre une seance locale et son evenement chez un provider.
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
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        horodatage   TEXT NOT NULL,
        provider     TEXT NOT NULL,
        action       TEXT NOT NULL,
        seance_id    TEXT,
        external_id  TEXT,
        date_seance  TEXT,
        titre        TEXT NOT NULL DEFAULT '',
        ok           INTEGER NOT NULL,
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
        distance_m       REAL NOT NULL DEFAULT 0,
        denivele_m       REAL NOT NULL DEFAULT 0,
        fc_moy           INTEGER,
        fc_max           INTEGER,
        allure_moy_s_km  REAL,
        allure_gap_s_km  REAL,
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
        poids_kg      REAL,
        fc_repos      INTEGER,
        hrv           REAL,
        sommeil_h     REAL,
        fatigue_1_5   INTEGER,
        humeur_1_5    INTEGER,
        note          TEXT NOT NULL DEFAULT ''
      );

      -- Questions libres de l'athlete, reprises dans l'export coach.
      CREATE TABLE question_coach (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        texte      TEXT NOT NULL,
        cree_le    TEXT NOT NULL,
        repondue   INTEGER NOT NULL DEFAULT 0
      );
    `,
  },
];

export function ouvrirBase(chemin: string): BaseCarter {
  const absolu = resolve(chemin);
  mkdirSync(dirname(absolu), { recursive: true });

  const db = new Database(absolu);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  migrer(db);
  return db;
}

function migrer(db: BaseCarter): void {
  const actuelle = db.pragma('user_version', { simple: true }) as number;
  for (const migration of MIGRATIONS) {
    if (migration.version <= actuelle) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/**
 * Sauvegarde la base avant une operation risquee.
 *
 * Appelee systematiquement avant d'appliquer une synchro et avant d'importer
 * un plan revise : ce sont les deux moments ou l'on peut perdre du travail.
 * `better-sqlite3` expose `backup()` en asynchrone ; ici la base est petite et
 * mono-utilisateur, une copie de fichier apres checkpoint suffit et reste
 * lisible par n'importe quel outil.
 */
export function sauvegarder(db: BaseCarter, cheminBase: string, motif: string): string {
  const dossier = join(dirname(resolve(cheminBase)), 'backups');
  mkdirSync(dossier, { recursive: true });

  db.pragma('wal_checkpoint(TRUNCATE)');

  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const cible = join(dossier, `carter-${horodatage}-${motif}.db`);
  copyFileSync(resolve(cheminBase), cible);

  purgerSauvegardes(dossier, 30);
  return cible;
}

/** Conserve les N sauvegardes les plus recentes. */
function purgerSauvegardes(dossier: string, garder: number): void {
  const fichiers = readdirSync(dossier)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ f, t: statSync(join(dossier, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  for (const { f } of fichiers.slice(garder)) {
    try {
      unlinkSync(join(dossier, f));
    } catch {
      // Une sauvegarde qu'on n'arrive pas a purger n'est pas un incident.
    }
  }
}
