import {
  ActiviteSchema,
  WellnessSchema,
  type Activite,
  type IsoDate,
  type Wellness,
} from '@carter/shared';
import type { BaseCarter } from './index.js';
import type { DepotSessionGarmin } from '../garmin/client.js';
import { JetonsSchema, type Jetons } from '../garmin/sso.js';
import { chiffrer, dechiffrer } from '../chiffrement.js';

const COLONNES_ACTIVITE = [
  'id',
  'date',
  'heure',
  'nom',
  'sport',
  'sport_garmin',
  'duree_s',
  'duree_totale_s',
  'distance_m',
  'denivele_m',
  'denivele_negatif_m',
  'fc_moy',
  'fc_max',
  'allure_s_km',
  'vitesse_kmh',
  'calories',
  'cadence_moy',
  'rpe',
  'charge',
] as const;

export class DepotActivites {
  constructor(private readonly db: BaseCarter) {}

  async surPeriode(debut: IsoDate, fin: IsoDate): Promise<Activite[]> {
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM activite WHERE date >= $1 AND date <= $2 ORDER BY date DESC, heure DESC',
      [debut, fin],
    );
    return rows.map((l) => ActiviteSchema.parse(l));
  }

  async recentes(limite: number): Promise<Activite[]> {
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM activite ORDER BY date DESC, heure DESC LIMIT $1',
      [limite],
    );
    return rows.map((l) => ActiviteSchema.parse(l));
  }

  async parId(id: string): Promise<Activite | null> {
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM activite WHERE id = $1',
      [id],
    );
    return rows.length === 0 ? null : ActiviteSchema.parse(rows[0]);
  }

  /**
   * Enregistre un lot d'activites.
   *
   * En une seule requete plutot qu'une par activite : un import initial en
   * remonte plusieurs centaines, et autant d'allers-retours vers une base
   * distante depasserait le temps imparti a une fonction serverless.
   */
  async enregistrerLot(activites: Activite[]): Promise<number> {
    if (activites.length === 0) return 0;

    const valeurs: unknown[] = [];
    const lignes: string[] = [];

    activites.forEach((a, i) => {
      const base = i * COLONNES_ACTIVITE.length;
      lignes.push(`(${COLONNES_ACTIVITE.map((_, n) => `$${base + n + 1}`).join(', ')})`);
      valeurs.push(
        a.id, a.date, a.heure, a.nom, a.sport, a.sport_garmin,
        a.duree_s, a.duree_totale_s, a.distance_m, a.denivele_m, a.denivele_negatif_m,
        a.fc_moy, a.fc_max, a.allure_s_km, a.vitesse_kmh,
        a.calories, a.cadence_moy, a.rpe, a.charge,
      );
    });

    const majSet = COLONNES_ACTIVITE.filter((c) => c !== 'id')
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(', ');

    const { rowCount } = await this.db.query(
      `INSERT INTO activite (${COLONNES_ACTIVITE.join(', ')})
       VALUES ${lignes.join(', ')}
       ON CONFLICT (id) DO UPDATE SET ${majSet}`,
      valeurs,
    );

    return rowCount ?? 0;
  }

  /** Date de l'activite la plus recente en cache, pour ne recharger que la suite. */
  async derniereDate(): Promise<IsoDate | null> {
    const { rows } = await this.db.query<{ date: string | null }>(
      'SELECT MAX(date) AS date FROM activite',
    );
    return rows[0]?.date ?? null;
  }

  async compter(): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>('SELECT COUNT(*) AS n FROM activite');
    return Number(rows[0]?.n ?? 0);
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
   * Une valeur absente n'ecrase jamais une valeur deja connue : Garmin ne
   * remonte pas toujours toutes les metriques d'une journee, et une seconde
   * recuperation partielle ne doit pas effacer la premiere.
   */
  async enregistrerLot(entrees: Wellness[]): Promise<number> {
    let ecrites = 0;
    for (const w of entrees) {
      await this.db.query(
        `INSERT INTO wellness
           (date, poids_kg, fc_repos, hrv, sommeil_h, body_battery, stress_moy, pas)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (date) DO UPDATE SET
           poids_kg = COALESCE(EXCLUDED.poids_kg, wellness.poids_kg),
           fc_repos = COALESCE(EXCLUDED.fc_repos, wellness.fc_repos),
           hrv = COALESCE(EXCLUDED.hrv, wellness.hrv),
           sommeil_h = COALESCE(EXCLUDED.sommeil_h, wellness.sommeil_h),
           body_battery = COALESCE(EXCLUDED.body_battery, wellness.body_battery),
           stress_moy = COALESCE(EXCLUDED.stress_moy, wellness.stress_moy),
           pas = COALESCE(EXCLUDED.pas, wellness.pas)`,
        [w.date, w.poids_kg, w.fc_repos, w.hrv, w.sommeil_h, w.body_battery, w.stress_moy, w.pas],
      );
      ecrites += 1;
    }
    return ecrites;
  }
}

/**
 * Session Garmin : une seule ligne, jetons chiffres.
 *
 * Le mot de passe n'apparait nulle part. Seuls les jetons OAuth sont
 * conserves, chiffres avec une clef derivee de SESSION_SECRET, pour qu'une
 * fuite de la base seule ne donne pas acces au compte.
 */
export class DepotSessionGarminPg implements DepotSessionGarmin {
  constructor(
    private readonly db: BaseCarter,
    private readonly secret: string | undefined,
  ) {}

  async lire(): Promise<{
    jetons: Jetons;
    nomAffichage: string | null;
    derniereSynchro: string | null;
  } | null> {
    if (!this.secret) return null;

    const { rows } = await this.db.query<{
      jetons_chiffres: string;
      nom_affichage: string | null;
      derniere_synchro: string | null;
    }>(
      'SELECT jetons_chiffres, nom_affichage, derniere_synchro FROM session_garmin WHERE id = 1',
    );

    const ligne = rows[0];
    if (ligne === undefined) return null;

    try {
      return {
        jetons: JetonsSchema.parse(JSON.parse(dechiffrer(ligne.jetons_chiffres, this.secret))),
        nomAffichage: ligne.nom_affichage,
        derniereSynchro: ligne.derniere_synchro,
      };
    } catch {
      // Jetons illisibles (SESSION_SECRET change) : repartir de zero plutot
      // que d'echouer a chaque appel.
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

    await this.db.query(
      `INSERT INTO session_garmin (id, jetons_chiffres, nom_affichage, connecte_le)
       VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET
         jetons_chiffres = EXCLUDED.jetons_chiffres,
         nom_affichage = COALESCE(EXCLUDED.nom_affichage, session_garmin.nom_affichage)`,
      [chiffrer(JSON.stringify(jetons), this.secret), nomAffichage, new Date().toISOString()],
    );
  }

  async marquerSynchro(): Promise<void> {
    await this.db.query('UPDATE session_garmin SET derniere_synchro = $1 WHERE id = 1', [
      new Date().toISOString(),
    ]);
  }

  async effacer(): Promise<void> {
    await this.db.query('DELETE FROM session_garmin WHERE id = 1');
  }
}
