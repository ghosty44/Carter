import type {
  Alerte,
  ApercuSync,
  EntreeJournal,
  ExportCoach,
  IsoDate,
  Plan,
  ResultatSync,
  SeancePlanifiee,
  SeanceRealisee,
  VolumeSemaine,
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

  /** Liste de messages lisibles, quand le serveur a detaille les erreurs. */
  get lignes(): string[] {
    const d = this.details as { erreurs?: unknown[] } | null;
    if (d?.erreurs === undefined) return [];
    return d.erreurs.map((e) =>
      typeof e === 'string'
        ? e
        : `${(e as { champ?: string }).champ ?? ''} : ${(e as { probleme?: string }).probleme ?? ''}`,
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
    const message =
      (corps as { erreur?: string } | null)?.erreur ?? `Erreur ${reponse.status}`;
    throw new ErreurApi(reponse.status, message, (corps as { details?: unknown })?.details);
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

export interface EtatPlan {
  plan: Plan | null;
  volumes: VolumeSemaine[];
  seances: SeancePlanifiee[];
  alertes: Alerte[];
}

export interface EtatProvider {
  nom: string;
  libelle: string;
  configure: boolean;
  capacites: { ecrire: boolean; lire: boolean; supprimer: boolean };
  indisponibilite: string | null;
}

export interface Comparaison {
  semaine: VolumeSemaine;
  fin: IsoDate;
  prevu: { volume_course_min: number; nb_seances_course: number; sortie_longue_min: number | null };
  realise: { volume_course_min: number; nb_seances_course: number; sortie_longue_min: number | null };
  observance_pct: number;
  manquees: { date: IsoDate; titre: string; raison: string }[];
  en_cours: boolean;
}

export const api = {
  sante: () => appeler<{ ok: boolean; protection: boolean }>('/api/sante'),

  ouvrirSession: (motDePasse: string) =>
    appeler<{ ouverte: boolean }>('/api/session', {
      method: 'POST',
      body: JSON.stringify({ mot_de_passe: motDePasse }),
    }),

  plan: () => appeler<EtatPlan>('/api/plan'),

  importerPlan: (plan: unknown) =>
    appeler<{ plan: Plan; diff_markdown: string | null }>('/api/plan/import', {
      method: 'POST',
      body: JSON.stringify(plan),
    }),

  enregistrerPlan: (plan: Plan) =>
    appeler<{ plan: Plan }>('/api/plan', { method: 'PUT', body: JSON.stringify(plan) }),

  versions: () =>
    appeler<{ versions: { version: number; origine: string; commentaire: string; cree_le: string }[] }>(
      '/api/plan/versions',
    ),

  diffVersions: (a: number, b?: number) =>
    appeler<{ markdown: string }>(
      `/api/plan/diff?a=${a}${b === undefined ? '' : `&b=${b}`}`,
    ),

  restaurer: (version: number) =>
    appeler<{ plan: Plan; diff_markdown: string }>(
      `/api/plan/versions/${version}/restaurer`,
      { method: 'POST' },
    ),

  providers: () =>
    appeler<{
      providers: EtatProvider[];
      reglages: { fenetre_semaines: number; types_synchronises: string[]; prefixe: string };
    }>('/api/providers'),

  apercuSync: (provider: string, fenetre?: number) =>
    appeler<{ apercu: ApercuSync }>('/api/sync/apercu', {
      method: 'POST',
      body: JSON.stringify({ provider, fenetre_semaines: fenetre }),
    }),

  appliquerSync: (provider: string, apercu: ApercuSync) =>
    appeler<{ resultat: ResultatSync }>('/api/sync/appliquer', {
      method: 'POST',
      body: JSON.stringify({ provider, apercu }),
    }),

  journal: () => appeler<{ journal: EntreeJournal[] }>('/api/sync/journal?limite=100'),

  importerDonnees: (provider: string, debut: IsoDate, fin: IsoDate) =>
    appeler<{
      activites_importees: number;
      wellness_importe: number;
      rapprochements_appliques: number;
      rapprochements_a_confirmer: { realiseeId: string; seanceId: string; explication: string }[];
    }>('/api/donnees/importer', {
      method: 'POST',
      body: JSON.stringify({ provider, debut, fin }),
    }),

  realisees: (debut?: IsoDate, fin?: IsoDate) => {
    const q = new URLSearchParams();
    if (debut) q.set('debut', debut);
    if (fin) q.set('fin', fin);
    return appeler<{ realisees: SeanceRealisee[] }>(`/api/donnees/realisees?${q}`);
  },

  majRessenti: (
    id: string,
    donnees: {
      rpe?: number | null;
      ressenti?: number | null;
      douleurs?: { zone: string; intensite: number; note: string }[];
      commentaire?: string;
    },
  ) =>
    appeler<{ realisee: SeanceRealisee }>(`/api/donnees/realisees/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(donnees),
    }),

  ajouterRealisee: (donnees: {
    date: IsoDate;
    seance_id: string | null;
    nom: string;
    type_sport: string;
    duree_s: number;
    distance_m?: number;
    denivele_m?: number;
    rpe?: number | null;
    ressenti?: number | null;
    douleurs?: { zone: string; intensite: number; note: string }[];
    commentaire?: string;
  }) =>
    appeler<{ realisee: SeanceRealisee }>('/api/donnees/realisees', {
      method: 'POST',
      body: JSON.stringify(donnees),
    }),

  rapprocher: (realiseeId: string, seanceId: string | null) =>
    appeler<{ realisee: SeanceRealisee }>('/api/donnees/rapprocher', {
      method: 'POST',
      body: JSON.stringify({ realisee_id: realiseeId, seance_id: seanceId }),
    }),

  comparaison: () => appeler<{ comparaisons: Comparaison[] }>('/api/donnees/comparaison'),

  wellness: (debut?: IsoDate, fin?: IsoDate) => {
    const q = new URLSearchParams();
    if (debut) q.set('debut', debut);
    if (fin) q.set('fin', fin);
    return appeler<{ wellness: Wellness[] }>(`/api/wellness?${q}`);
  },

  enregistrerWellness: (w: Partial<Wellness> & { date: IsoDate }) =>
    appeler<{ wellness: Wellness }>('/api/wellness', {
      method: 'PUT',
      body: JSON.stringify({
        poids_kg: null,
        fc_repos: null,
        hrv: null,
        sommeil_h: null,
        fatigue_1_5: null,
        humeur_1_5: null,
        note: '',
        ...w,
      }),
    }),

  questions: () =>
    appeler<{ questions: { id: number; texte: string }[] }>('/api/questions'),

  ajouterQuestion: (texte: string) =>
    appeler<{ questions: { id: number; texte: string }[] }>('/api/questions', {
      method: 'POST',
      body: JSON.stringify({ texte }),
    }),

  exportCoach: (debut?: IsoDate, fin?: IsoDate) => {
    const q = new URLSearchParams();
    if (debut) q.set('debut', debut);
    if (fin) q.set('fin', fin);
    return appeler<{ markdown: string; json: ExportCoach }>(`/api/export/coach?${q}`);
  },

  importerPlanRevise: (contenu: unknown, appliquer: boolean) =>
    appeler<{
      applique: boolean;
      diff_markdown: string;
      commentaire: string | null;
    }>(`/api/export/coach/importer?appliquer=${appliquer}`, {
      method: 'POST',
      body: JSON.stringify(contenu),
    }),
};
