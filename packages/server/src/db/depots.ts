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
import type { DepotSessionGarmin } from '../providers/garmin-direct.js';
import { JetonsSchema, type Jetons } from '../providers/garmin-direct-sso.js';
import { chiffrer, dechiffrer } from '../chiffrement.js';

/** Origine d'une revision, tracee dans l'historique. */
export type OriginePlan = 'IMPORT' | 'EDITION' | 'COACH' | 'RESTAURATION' | 'INITIAL';

export class DepotPlan {
  constructor(private readonly db: BaseCarter) {}

  async courant(): Promise<Plan | null> {
    const { rows } = await this.db.query<{ contenu: string }>(
      'SELECT contenu FROM plan ORDER BY modifie_le DESC LIMIT 1',
    );
    if (rows.length === 0) return null;
    return PlanSchema.parse(JSON.parse(rows[0]!.contenu));
  }

  /**
   * Enregistre une revision.
   *
   * Le numero de version est attribue par la base et non par l'appelant, dans
   * une transaction : sinon deux imports concurrents ecrivent la meme version.
   * En serverless, deux requetes simultanees ne sont pas un cas theorique.
   */
  async enregistrer(plan: Plan, origine: OriginePlan, commentaire = ''): Promise<Plan> {
    const maintenant = new Date().toISOString();
    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      // Verrou consultatif sur l'identifiant du plan, relache au COMMIT.
      //
      // Pas un `SELECT ... FOR UPDATE` sur la ligne : au tout premier import
      // la ligne n'existe pas encore, il n'y a donc rien a verrouiller, et
      // deux requetes concurrentes lisent toutes les deux MAX(version) = 0
      // avant de se disputer la version 1. Le verrou consultatif ne depend
      // pas de l'existence de la ligne.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [plan.id]);

      const { rows } = await client.query<{ v: number | null }>(
        'SELECT MAX(version) AS v FROM plan_version WHERE plan_id = $1',
        [plan.id],
      );
      const version = (rows[0]?.v ?? 0) + 1;

      const complet: Plan = {
        ...plan,
        version,
        modifie_le: maintenant,
        cree_le: plan.cree_le ?? maintenant,
      };
      const contenu = JSON.stringify(complet);

      await client.query(
        `INSERT INTO plan (id, contenu, version, modifie_le) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET contenu = EXCLUDED.contenu,
                                        version = EXCLUDED.version,
                                        modifie_le = EXCLUDED.modifie_le`,
        [complet.id, contenu, version, maintenant],
      );

      await client.query(
        `INSERT INTO plan_version (plan_id, version, contenu, origine, commentaire, cree_le)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [complet.id, version, contenu, origine, commentaire, maintenant],
      );

      await client.query('COMMIT');
      return complet;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async versions(planId: string): Promise<
    { version: number; origine: string; commentaire: string; cree_le: string }[]
  > {
    const { rows } = await this.db.query<{
      version: number;
      origine: string;
      commentaire: string;
      cree_le: string;
    }>(
      `SELECT version, origine, commentaire, cree_le
       FROM plan_version WHERE plan_id = $1 ORDER BY version DESC`,
      [planId],
    );
    return rows;
  }

  async versionPrecise(planId: string, version: number): Promise<Plan | null> {
    const { rows } = await this.db.query<{ contenu: string }>(
      'SELECT contenu FROM plan_version WHERE plan_id = $1 AND version = $2',
      [planId, version],
    );
    return rows.length === 0 ? null : PlanSchema.parse(JSON.parse(rows[0]!.contenu));
  }
}

/** Correspondances + journal : implementation Postgres de `DepotSync`. */
export class DepotSyncPg implements DepotSync {
  constructor(private readonly db: BaseCarter) {}

  async correspondances(provider: NomProvider): Promise<Correspondance[]> {
    const { rows } = await this.db.query<{
      seance_id: string;
      provider: NomProvider;
      external_id: string;
      hash_synchronise: string;
    }>(
      `SELECT seance_id, provider, external_id, hash_synchronise
       FROM correspondance WHERE provider = $1`,
      [provider],
    );

    return rows.map((l) => ({
      seanceId: l.seance_id,
      provider: l.provider,
      externalId: l.external_id,
      hashSynchronise: l.hash_synchronise,
    }));
  }

  async enregistrerCorrespondance(e: {
    seanceId: string;
    externalId: string;
    provider: NomProvider;
    hash: string;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO correspondance
         (seance_id, provider, external_id, hash_synchronise, synchronise_le)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (seance_id, provider) DO UPDATE SET
         external_id = EXCLUDED.external_id,
         hash_synchronise = EXCLUDED.hash_synchronise,
         synchronise_le = EXCLUDED.synchronise_le`,
      [e.seanceId, e.provider, e.externalId, e.hash, new Date().toISOString()],
    );
  }

  async oublierCorrespondance(externalId: string): Promise<void> {
    await this.db.query('DELETE FROM correspondance WHERE external_id = $1', [externalId]);
  }

  async journaliser(entree: {
    provider: NomProvider;
    action: string;
    seanceId: string | null;
    externalId: string | null;
    dateSeance: IsoDate | null;
    titre: string;
    ok: boolean;
    erreur: string | null;
    reponse: string | null;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO journal_sync
         (horodatage, provider, action, seance_id, external_id, date_seance, titre, ok, erreur, reponse)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        new Date().toISOString(),
        entree.provider,
        entree.action,
        entree.seanceId,
        entree.externalId,
        entree.dateSeance,
        entree.titre,
        entree.ok,
        entree.erreur,
        entree.reponse,
      ],
    );
  }

  async journal(limite = 200): Promise<EntreeJournal[]> {
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT id, horodatage, provider, action, seance_id, external_id,
              date_seance, titre, ok, erreur, reponse
       FROM journal_sync ORDER BY id DESC LIMIT $1`,
      [limite],
    );

    return rows.map((l) => ({
      id: Number(l.id),
      horodatage: l.horodatage as string,
      provider: l.provider as NomProvider,
      action: l.action as EntreeJournal['action'],
      seance_id: (l.seance_id as string | null) ?? null,
      external_id: (l.external_id as string | null) ?? null,
      date_seance: (l.date_seance as IsoDate | null) ?? null,
      titre: (l.titre as string) ?? '',
      ok: l.ok === true,
      erreur: (l.erreur as string | null) ?? null,
      reponse: (l.reponse as string | null) ?? null,
    }));
  }
}

export class DepotRealise {
  constructor(private readonly db: BaseCarter) {}

  async surPeriode(debut: IsoDate, fin: IsoDate): Promise<SeanceRealisee[]> {
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM seance_realisee WHERE date >= $1 AND date <= $2 ORDER BY date',
      [debut, fin],
    );
    return rows.map(versRealisee);
  }

  async parId(id: string): Promise<SeanceRealisee | null> {
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM seance_realisee WHERE id = $1',
      [id],
    );
    return rows.length === 0 ? null : versRealisee(rows[0]!);
  }

  /**
   * Insere ou met a jour une seance realisee.
   *
   * `preserverSaisie` distingue les deux appelants, et cette distinction doit
   * rester explicite : un import provider ne doit pas ecraser ce que l'athlete
   * a note, mais une saisie faite dans l'app doit pouvoir tout modifier, y
   * compris retirer une douleur entree par erreur.
   *
   * Deduire l'intention de la forme des donnees ne marche pas : une liste de
   * douleurs vide et une liste de douleurs absente sont indistinguables une
   * fois serialisees, et on finit par refuser silencieusement une saisie
   * legitime.
   *
   * Le couple (source, external_id) reste unique : une activite reimportee ne
   * cree jamais de doublon, quel que soit le mode.
   */
  async enregistrer(
    r: SeanceRealisee,
    options: { preserverSaisie?: boolean } = {},
  ): Promise<void> {
    let fusion = r;

    if (r.external_id !== null) {
      const { rows } = await this.db.query<Record<string, unknown>>(
        `SELECT id, seance_id, rpe, ressenti, douleurs, commentaire
         FROM seance_realisee WHERE source = $1 AND external_id = $2`,
        [r.source, r.external_id],
      );

      const existant = rows[0];
      if (existant !== undefined) {
        // L'identifiant existant l'emporte toujours : c'est ce qui garantit
        // qu'on met a jour la ligne au lieu d'en creer une seconde.
        fusion = { ...r, id: existant.id as string };

        if (options.preserverSaisie === true) {
          const douleurs = existant.douleurs as string | null;
          fusion = {
            ...fusion,
            seance_id: (existant.seance_id as string | null) ?? r.seance_id,
            rpe: (existant.rpe as number | null) ?? r.rpe,
            ressenti: (existant.ressenti as number | null) ?? r.ressenti,
            douleurs:
              douleurs === null
                ? r.douleurs
                : (JSON.parse(douleurs) as SeanceRealisee['douleurs']),
            commentaire: (existant.commentaire as string) || r.commentaire,
          };
        }
      }
    }

    await this.db.query(
      `INSERT INTO seance_realisee
         (id, seance_id, date, source, external_id, nom, type_sport, duree_s, distance_m,
          denivele_m, fc_moy, fc_max, allure_moy_s_km, allure_gap_s_km, rpe, ressenti,
          douleurs, commentaire)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE SET
         seance_id = EXCLUDED.seance_id, date = EXCLUDED.date, nom = EXCLUDED.nom,
         type_sport = EXCLUDED.type_sport, duree_s = EXCLUDED.duree_s,
         distance_m = EXCLUDED.distance_m, denivele_m = EXCLUDED.denivele_m,
         fc_moy = EXCLUDED.fc_moy, fc_max = EXCLUDED.fc_max,
         allure_moy_s_km = EXCLUDED.allure_moy_s_km,
         allure_gap_s_km = EXCLUDED.allure_gap_s_km,
         rpe = EXCLUDED.rpe, ressenti = EXCLUDED.ressenti,
         douleurs = EXCLUDED.douleurs, commentaire = EXCLUDED.commentaire`,
      [
        fusion.id,
        fusion.seance_id,
        fusion.date,
        fusion.source,
        fusion.external_id,
        fusion.nom,
        fusion.type_sport,
        fusion.duree_s,
        fusion.distance_m,
        fusion.denivele_m,
        fusion.fc_moy,
        fusion.fc_max,
        fusion.allure_moy_s_km,
        fusion.allure_gap_s_km,
        fusion.rpe,
        fusion.ressenti,
        JSON.stringify(fusion.douleurs),
        fusion.commentaire,
      ],
    );
  }

  async rattacher(realiseeId: string, seanceId: string | null): Promise<void> {
    await this.db.query('UPDATE seance_realisee SET seance_id = $1 WHERE id = $2', [
      seanceId,
      realiseeId,
    ]);
  }
}

export class DepotWellness {
  constructor(private readonly db: BaseCarter) {}

  async surPeriode(debut: IsoDate, fin: IsoDate): Promise<Wellness[]> {
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM wellness WHERE date >= $1 AND date <= $2 ORDER BY date',
      [debut, fin],
    );
    return rows.map((l) => WellnessSchema.parse(l));
  }

  /**
   * Une valeur absente ne doit jamais effacer une valeur deja saisie : un
   * import Intervals.icu qui ne remonte pas le poids ne doit pas supprimer le
   * poids entre a la main le matin meme.
   */
  async enregistrer(w: Wellness): Promise<void> {
    await this.db.query(
      `INSERT INTO wellness
         (date, poids_kg, fc_repos, hrv, sommeil_h, fatigue_1_5, humeur_1_5, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (date) DO UPDATE SET
         poids_kg = COALESCE(EXCLUDED.poids_kg, wellness.poids_kg),
         fc_repos = COALESCE(EXCLUDED.fc_repos, wellness.fc_repos),
         hrv = COALESCE(EXCLUDED.hrv, wellness.hrv),
         sommeil_h = COALESCE(EXCLUDED.sommeil_h, wellness.sommeil_h),
         fatigue_1_5 = COALESCE(EXCLUDED.fatigue_1_5, wellness.fatigue_1_5),
         humeur_1_5 = COALESCE(EXCLUDED.humeur_1_5, wellness.humeur_1_5),
         note = CASE WHEN EXCLUDED.note = '' THEN wellness.note ELSE EXCLUDED.note END`,
      [
        w.date,
        w.poids_kg,
        w.fc_repos,
        w.hrv,
        w.sommeil_h,
        w.fatigue_1_5,
        w.humeur_1_5,
        w.note,
      ],
    );
  }
}

export class DepotQuestions {
  constructor(private readonly db: BaseCarter) {}

  async ouvertes(): Promise<{ id: number; texte: string; cree_le: string }[]> {
    const { rows } = await this.db.query<{ id: string; texte: string; cree_le: string }>(
      'SELECT id, texte, cree_le FROM question_coach WHERE repondue = FALSE ORDER BY id',
    );
    return rows.map((r) => ({ id: Number(r.id), texte: r.texte, cree_le: r.cree_le }));
  }

  async ajouter(texte: string): Promise<void> {
    await this.db.query('INSERT INTO question_coach (texte, cree_le) VALUES ($1, $2)', [
      texte,
      new Date().toISOString(),
    ]);
  }

  async marquerRepondues(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.query('UPDATE question_coach SET repondue = TRUE WHERE id = ANY($1)', [ids]);
  }
}

/**
 * Session Garmin Connect : une seule ligne, jetons chiffres.
 *
 * Le mot de passe n'apparait nulle part. Seuls les jetons OAuth sont
 * conserves, et ils sont chiffres avec une clef derivee de SESSION_SECRET,
 * de sorte qu'une fuite de la base seule ne suffise pas a lire le compte.
 */
export class DepotSessionGarminPg implements DepotSessionGarmin {
  constructor(
    private readonly db: BaseCarter,
    private readonly secret: string | undefined,
  ) {}

  async lire(): Promise<{ jetons: Jetons; nomAffichage: string | null } | null> {
    if (!this.secret) return null;

    const { rows } = await this.db.query<{
      jetons_chiffres: string;
      nom_affichage: string | null;
    }>('SELECT jetons_chiffres, nom_affichage FROM session_garmin WHERE id = 1');

    const ligne = rows[0];
    if (ligne === undefined) return null;

    try {
      const jetons = JetonsSchema.parse(
        JSON.parse(dechiffrer(ligne.jetons_chiffres, this.secret)),
      );
      return { jetons, nomAffichage: ligne.nom_affichage };
    } catch {
      // Jetons illisibles (secret change, format ancien) : on repart de zero
      // plutot que de laisser l'app echouer a chaque appel.
      await this.effacer();
      return null;
    }
  }

  async enregistrerJetons(jetons: Jetons, nomAffichage: string | null): Promise<void> {
    if (!this.secret) {
      throw new Error(
        'SESSION_SECRET est requis pour stocker une session Garmin : les jetons sont chiffres avec.',
      );
    }

    const maintenant = new Date().toISOString();
    await this.db.query(
      `INSERT INTO session_garmin (id, jetons_chiffres, nom_affichage, connecte_le, rafraichi_le)
       VALUES (1, $1, $2, $3, $3)
       ON CONFLICT (id) DO UPDATE SET
         jetons_chiffres = EXCLUDED.jetons_chiffres,
         nom_affichage = COALESCE(EXCLUDED.nom_affichage, session_garmin.nom_affichage),
         rafraichi_le = EXCLUDED.rafraichi_le`,
      [chiffrer(JSON.stringify(jetons), this.secret), nomAffichage, maintenant],
    );
  }

  async effacer(): Promise<void> {
    await this.db.query('DELETE FROM session_garmin WHERE id = 1');
  }
}

function versRealisee(l: Record<string, unknown>): SeanceRealisee {
  return SeanceRealiseeSchema.parse({
    ...l,
    // Postgres renvoie les DOUBLE PRECISION en nombre, mais les BIGINT en
    // chaine ; les colonnes concernees ici sont toutes numeriques cote JS.
    douleurs: JSON.parse((l.douleurs as string) ?? '[]'),
  });
}
