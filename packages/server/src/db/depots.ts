import {
  PlanSchema,
  SeanceRealiseeSchema,
  WellnessSchema,
  type EntreeJournal,
  type IsoDate,
  type NomProvider,
  type Plan,
  type SeanceRealisee,
  type Wellness,
} from '@carter/shared';
import type { BaseCarter } from './index.js';
import type { Correspondance } from '../sync/diff.js';
import type { DepotSync } from '../sync/moteur.js';

/** Origine d'une revision, tracee dans l'historique. */
export type OriginePlan = 'IMPORT' | 'EDITION' | 'COACH' | 'RESTAURATION' | 'INITIAL';

export class DepotPlan {
  constructor(private readonly db: BaseCarter) {}

  courant(): Plan | null {
    const ligne = this.db
      .prepare('SELECT contenu FROM plan ORDER BY modifie_le DESC LIMIT 1')
      .get() as { contenu: string } | undefined;
    if (ligne === undefined) return null;
    return PlanSchema.parse(JSON.parse(ligne.contenu));
  }

  /**
   * Enregistre une revision. Le numero de version est attribue ici et non par
   * l'appelant : c'est la base qui arbitre, sinon deux imports concurrents
   * ecrivent la meme version.
   */
  enregistrer(plan: Plan, origine: OriginePlan, commentaire = ''): Plan {
    const maintenant = new Date().toISOString();

    const tx = this.db.transaction((p: Plan) => {
      const max = this.db
        .prepare('SELECT MAX(version) AS v FROM plan_version WHERE plan_id = ?')
        .get(p.id) as { v: number | null };
      const version = (max.v ?? 0) + 1;

      const complet: Plan = { ...p, version, modifie_le: maintenant, cree_le: p.cree_le ?? maintenant };
      const contenu = JSON.stringify(complet);

      this.db
        .prepare(
          `INSERT INTO plan (id, contenu, version, modifie_le) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET contenu = excluded.contenu,
                                         version = excluded.version,
                                         modifie_le = excluded.modifie_le`,
        )
        .run(complet.id, contenu, version, maintenant);

      this.db
        .prepare(
          `INSERT INTO plan_version (plan_id, version, contenu, origine, commentaire, cree_le)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(complet.id, version, contenu, origine, commentaire, maintenant);

      return complet;
    });

    return tx(plan);
  }

  versions(planId: string): {
    version: number;
    origine: string;
    commentaire: string;
    cree_le: string;
  }[] {
    return this.db
      .prepare(
        `SELECT version, origine, commentaire, cree_le
         FROM plan_version WHERE plan_id = ? ORDER BY version DESC`,
      )
      .all(planId) as { version: number; origine: string; commentaire: string; cree_le: string }[];
  }

  versionPrecise(planId: string, version: number): Plan | null {
    const ligne = this.db
      .prepare('SELECT contenu FROM plan_version WHERE plan_id = ? AND version = ?')
      .get(planId, version) as { contenu: string } | undefined;
    return ligne ? PlanSchema.parse(JSON.parse(ligne.contenu)) : null;
  }
}

/** Correspondances + journal : c'est l'implementation SQLite de `DepotSync`. */
export class DepotSyncSqlite implements DepotSync {
  constructor(private readonly db: BaseCarter) {}

  correspondances(provider: NomProvider): Correspondance[] {
    const lignes = this.db
      .prepare(
        `SELECT seance_id, provider, external_id, hash_synchronise
         FROM correspondance WHERE provider = ?`,
      )
      .all(provider) as {
      seance_id: string;
      provider: NomProvider;
      external_id: string;
      hash_synchronise: string;
    }[];

    return lignes.map((l) => ({
      seanceId: l.seance_id,
      provider: l.provider,
      externalId: l.external_id,
      hashSynchronise: l.hash_synchronise,
    }));
  }

  enregistrerCorrespondance(e: {
    seanceId: string;
    externalId: string;
    provider: NomProvider;
    hash: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO correspondance (seance_id, provider, external_id, hash_synchronise, synchronise_le)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(seance_id, provider) DO UPDATE SET
           external_id = excluded.external_id,
           hash_synchronise = excluded.hash_synchronise,
           synchronise_le = excluded.synchronise_le`,
      )
      .run(e.seanceId, e.provider, e.externalId, e.hash, new Date().toISOString());
  }

  oublierCorrespondance(externalId: string): void {
    this.db.prepare('DELETE FROM correspondance WHERE external_id = ?').run(externalId);
  }

  journaliser(entree: {
    provider: NomProvider;
    action: string;
    seanceId: string | null;
    externalId: string | null;
    dateSeance: IsoDate | null;
    titre: string;
    ok: boolean;
    erreur: string | null;
    reponse: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO journal_sync
           (horodatage, provider, action, seance_id, external_id, date_seance, titre, ok, erreur, reponse)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        new Date().toISOString(),
        entree.provider,
        entree.action,
        entree.seanceId,
        entree.externalId,
        entree.dateSeance,
        entree.titre,
        entree.ok ? 1 : 0,
        entree.erreur,
        entree.reponse,
      );
  }

  journal(limite = 200): EntreeJournal[] {
    const lignes = this.db
      .prepare(
        `SELECT id, horodatage, provider, action, seance_id, external_id,
                date_seance, titre, ok, erreur, reponse
         FROM journal_sync ORDER BY id DESC LIMIT ?`,
      )
      .all(limite) as Record<string, unknown>[];

    return lignes.map((l) => ({
      id: l.id as number,
      horodatage: l.horodatage as string,
      provider: l.provider as NomProvider,
      action: l.action as EntreeJournal['action'],
      seance_id: (l.seance_id as string | null) ?? null,
      external_id: (l.external_id as string | null) ?? null,
      date_seance: (l.date_seance as IsoDate | null) ?? null,
      titre: (l.titre as string) ?? '',
      ok: l.ok === 1,
      erreur: (l.erreur as string | null) ?? null,
      reponse: (l.reponse as string | null) ?? null,
    }));
  }
}

export class DepotRealise {
  constructor(private readonly db: BaseCarter) {}

  surPeriode(debut: IsoDate, fin: IsoDate): SeanceRealisee[] {
    const lignes = this.db
      .prepare('SELECT * FROM seance_realisee WHERE date >= ? AND date <= ? ORDER BY date')
      .all(debut, fin) as Record<string, unknown>[];
    return lignes.map(versRealisee);
  }

  parId(id: string): SeanceRealisee | null {
    const ligne = this.db.prepare('SELECT * FROM seance_realisee WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return ligne ? versRealisee(ligne) : null;
  }

  /**
   * Insere ou met a jour. Le couple (source, external_id) est unique : une
   * activite reimportee deux fois ne cree pas de doublon, et un rattachement
   * fait a la main n'est pas ecrase par un reimport.
   */
  enregistrer(r: SeanceRealisee): void {
    const existant =
      r.external_id === null
        ? null
        : (this.db
            .prepare('SELECT id, seance_id, rpe, ressenti, douleurs, commentaire FROM seance_realisee WHERE source = ? AND external_id = ?')
            .get(r.source, r.external_id) as Record<string, unknown> | undefined) ?? null;

    // Les champs saisis a la main ne sont jamais ecrases par un reimport.
    const fusion: SeanceRealisee = existant
      ? {
          ...r,
          id: existant.id as string,
          seance_id: (existant.seance_id as string | null) ?? r.seance_id,
          rpe: (existant.rpe as number | null) ?? r.rpe,
          ressenti: (existant.ressenti as number | null) ?? r.ressenti,
          douleurs: existant.douleurs ? JSON.parse(existant.douleurs as string) : r.douleurs,
          commentaire: (existant.commentaire as string) || r.commentaire,
        }
      : r;

    this.db
      .prepare(
        `INSERT INTO seance_realisee
           (id, seance_id, date, source, external_id, nom, type_sport, duree_s, distance_m,
            denivele_m, fc_moy, fc_max, allure_moy_s_km, allure_gap_s_km, rpe, ressenti,
            douleurs, commentaire)
         VALUES (@id, @seance_id, @date, @source, @external_id, @nom, @type_sport, @duree_s,
                 @distance_m, @denivele_m, @fc_moy, @fc_max, @allure_moy_s_km, @allure_gap_s_km,
                 @rpe, @ressenti, @douleurs, @commentaire)
         ON CONFLICT(id) DO UPDATE SET
           seance_id = excluded.seance_id, date = excluded.date, nom = excluded.nom,
           type_sport = excluded.type_sport, duree_s = excluded.duree_s,
           distance_m = excluded.distance_m, denivele_m = excluded.denivele_m,
           fc_moy = excluded.fc_moy, fc_max = excluded.fc_max,
           allure_moy_s_km = excluded.allure_moy_s_km, allure_gap_s_km = excluded.allure_gap_s_km,
           rpe = excluded.rpe, ressenti = excluded.ressenti,
           douleurs = excluded.douleurs, commentaire = excluded.commentaire`,
      )
      .run({ ...fusion, douleurs: JSON.stringify(fusion.douleurs) });
  }

  rattacher(realiseeId: string, seanceId: string | null): void {
    this.db.prepare('UPDATE seance_realisee SET seance_id = ? WHERE id = ?').run(seanceId, realiseeId);
  }
}

export class DepotWellness {
  constructor(private readonly db: BaseCarter) {}

  surPeriode(debut: IsoDate, fin: IsoDate): Wellness[] {
    const lignes = this.db
      .prepare('SELECT * FROM wellness WHERE date >= ? AND date <= ? ORDER BY date')
      .all(debut, fin) as Record<string, unknown>[];
    return lignes.map((l) => WellnessSchema.parse(l));
  }

  enregistrer(w: Wellness): void {
    this.db
      .prepare(
        `INSERT INTO wellness (date, poids_kg, fc_repos, hrv, sommeil_h, fatigue_1_5, humeur_1_5, note)
         VALUES (@date, @poids_kg, @fc_repos, @hrv, @sommeil_h, @fatigue_1_5, @humeur_1_5, @note)
         ON CONFLICT(date) DO UPDATE SET
           poids_kg = COALESCE(excluded.poids_kg, wellness.poids_kg),
           fc_repos = COALESCE(excluded.fc_repos, wellness.fc_repos),
           hrv = COALESCE(excluded.hrv, wellness.hrv),
           sommeil_h = COALESCE(excluded.sommeil_h, wellness.sommeil_h),
           fatigue_1_5 = COALESCE(excluded.fatigue_1_5, wellness.fatigue_1_5),
           humeur_1_5 = COALESCE(excluded.humeur_1_5, wellness.humeur_1_5),
           note = CASE WHEN excluded.note = '' THEN wellness.note ELSE excluded.note END`,
      )
      .run(w);
  }
}

export class DepotQuestions {
  constructor(private readonly db: BaseCarter) {}

  ouvertes(): { id: number; texte: string; cree_le: string }[] {
    return this.db
      .prepare('SELECT id, texte, cree_le FROM question_coach WHERE repondue = 0 ORDER BY id')
      .all() as { id: number; texte: string; cree_le: string }[];
  }

  ajouter(texte: string): void {
    this.db
      .prepare('INSERT INTO question_coach (texte, cree_le) VALUES (?, ?)')
      .run(texte, new Date().toISOString());
  }

  marquerRepondues(ids: number[]): void {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    this.db
      .prepare(`UPDATE question_coach SET repondue = 1 WHERE id IN (${placeholders})`)
      .run(...ids);
  }
}

function versRealisee(l: Record<string, unknown>): SeanceRealisee {
  return SeanceRealiseeSchema.parse({
    ...l,
    douleurs: JSON.parse((l.douleurs as string) ?? '[]'),
  });
}
