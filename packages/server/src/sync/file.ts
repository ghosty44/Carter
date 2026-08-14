import { ErreurProvider } from '../providers/types.js';

export interface OptionsFile {
  /** Delai minimal entre deux requetes, en millisecondes. */
  delaiMs: number;
  /** Nombre maximal de tentatives par operation, premiere incluse. */
  tentativesMax: number;
  /** Base du backoff exponentiel, en millisecondes. */
  backoffBaseMs: number;
  /** Injectable pour les tests : evite d'attendre reellement. */
  dormir?: (ms: number) => Promise<void>;
}

export const OPTIONS_FILE_DEFAUT: OptionsFile = {
  delaiMs: 350,
  tentativesMax: 4,
  backoffBaseMs: 1000,
};

export function dormirReel(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface Tentative<T> {
  ok: boolean;
  valeur: T | null;
  erreur: Error | null;
  tentatives: number;
}

/**
 * Execute des taches une par une, avec un delai entre chacune et un backoff
 * exponentiel sur les erreurs transitoires.
 *
 * Sequentiel par choix : les API d'entrainement sont lentes et limitees en
 * debit, et une synchro porte sur quelques dizaines d'evenements. Le
 * parallelisme n'apporterait rien d'autre que des 429.
 *
 * Une tache qui echoue definitivement n'interrompt pas les suivantes : la
 * synchro doit pouvoir passer sur 18 seances meme si la 3e est refusee.
 */
export class FileSequentielle {
  private readonly opts: Required<OptionsFile>;

  constructor(options: Partial<OptionsFile> = {}) {
    const fusion = { ...OPTIONS_FILE_DEFAUT, ...options };
    this.opts = { ...fusion, dormir: fusion.dormir ?? dormirReel };
  }

  async executer<T>(taches: (() => Promise<T>)[]): Promise<Tentative<T>[]> {
    const resultats: Tentative<T>[] = [];
    for (let i = 0; i < taches.length; i++) {
      if (i > 0) await this.opts.dormir(this.opts.delaiMs);
      resultats.push(await this.avecReprise(taches[i]!));
    }
    return resultats;
  }

  /** Une tache isolee, avec la meme politique de reprise. */
  async executerUne<T>(tache: () => Promise<T>): Promise<Tentative<T>> {
    return this.avecReprise(tache);
  }

  private async avecReprise<T>(tache: () => Promise<T>): Promise<Tentative<T>> {
    let derniere: Error | null = null;

    for (let tentative = 1; tentative <= this.opts.tentativesMax; tentative++) {
      try {
        const valeur = await tache();
        return { ok: true, valeur, erreur: null, tentatives: tentative };
      } catch (e) {
        const erreur = e instanceof Error ? e : new Error(String(e));
        derniere = erreur;

        const reessayable = erreur instanceof ErreurProvider ? erreur.reessayable : false;
        if (!reessayable || tentative === this.opts.tentativesMax) break;

        await this.opts.dormir(this.delaiBackoff(tentative, erreur));
      }
    }

    return { ok: false, valeur: null, erreur: derniere, tentatives: this.tentativesConsommees(derniere) };
  }

  private tentativesConsommees(erreur: Error | null): number {
    if (erreur instanceof ErreurProvider && !erreur.reessayable) return 1;
    return this.opts.tentativesMax;
  }

  /** 1s, 2s, 4s... avec une gigue pour ne pas repartir tous en meme temps. */
  private delaiBackoff(tentative: number, erreur: Error): number {
    const base = this.opts.backoffBaseMs * 2 ** (tentative - 1);
    const gigue = Math.floor(Math.random() * 250);
    if (erreur instanceof ErreurProvider && erreur.statut === 429) {
      return base * 2 + gigue;
    }
    return base + gigue;
  }
}
