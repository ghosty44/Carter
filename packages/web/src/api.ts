import type {
  Activite,
  EtatGarmin,
  Records,
  RepartitionSport,
  Totaux,
  TotauxSemaine,
  Wellness,
} from '@carter/shared';

export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }

  /** Messages detailles, quand le serveur en a fourni. */
  get lignes(): string[] {
    const d = this.details as { erreurs?: unknown[] } | null;
    if (d?.erreurs === undefined) return [];
    return d.erreurs.map((e) =>
      typeof e === 'string'
        ? e
        : `${(e as { champ?: string }).champ ?? ''} ${(e as { probleme?: string }).probleme ?? ''}`.trim(),
    );
  }
}

async function appeler<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const reponse = await fetch(chemin, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...init.headers,
    },
  });

  const texte = await reponse.text();
  const corps = texte === '' ? null : safeJson(texte);

  if (!reponse.ok) {
    const structure = corps as { erreur?: string; details?: unknown } | null;

    // Une reponse sans champ `erreur` ne vient pas de l'app mais de
    // l'hebergeur. Le dire evite de chercher un bug applicatif inexistant.
    const message =
      structure?.erreur ??
      `Erreur ${reponse.status} renvoyee par l'hebergeur. ` +
        'La fonction a probablement echoue au demarrage — regarde les journaux du deploiement.';

    const details =
      structure?.details ??
      (typeof corps === 'string' && corps.trim() !== ''
        ? { erreurs: [corps.slice(0, 300)] }
        : null);

    throw new ErreurApi(reponse.status, message, details);
  }

  return corps as T;
}

function safeJson(texte: string): unknown {
  try {
    return JSON.parse(texte);
  } catch {
    return texte;
  }
}

export interface Stats {
  semaines: TotauxSemaine[];
  derniers_28_jours: Totaux;
  repartition: RepartitionSport[];
  records: Records;
}

export const api = {
  sante: () => appeler<{ ok: boolean; protection: boolean }>('/api/sante'),

  ouvrirSession: (motDePasse: string) =>
    appeler<{ ouverte: boolean }>('/api/session', {
      method: 'POST',
      body: JSON.stringify({ mot_de_passe: motDePasse }),
    }),

  garmin: () => appeler<{ garmin: EtatGarmin }>('/api/garmin'),

  connexion: (identifiant: string, motDePasse: string) =>
    appeler<{
      connecte?: boolean;
      nom_affichage?: string | null;
      mfa_requis?: boolean;
      jeton_mfa?: string;
      message?: string;
    }>('/api/garmin/connexion', {
      method: 'POST',
      body: JSON.stringify({ identifiant, mot_de_passe: motDePasse }),
    }),

  mfa: (jetonMfa: string, code: string) =>
    appeler<{ connecte: boolean; nom_affichage: string | null }>('/api/garmin/mfa', {
      method: 'POST',
      body: JSON.stringify({ jeton_mfa: jetonMfa, code }),
    }),

  deconnexion: () =>
    appeler<{ connecte: boolean }>('/api/garmin/connexion', { method: 'DELETE' }),

  recuperer: (complet = false) =>
    appeler<{ activites: number; wellness: number; total_en_cache: number }>(
      '/api/garmin/recuperer',
      { method: 'POST', body: JSON.stringify({ complet }) },
    ),

  activites: (limite = 50) =>
    appeler<{ activites: Activite[] }>(`/api/activites?limite=${limite}`),

  stats: (semaines = 12) => appeler<Stats>(`/api/stats?semaines=${semaines}`),

  wellness: () => appeler<{ wellness: Wellness[] }>('/api/wellness'),
};
