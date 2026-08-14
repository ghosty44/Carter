import type {
  CapacitesProvider,
  IsoDate,
  NomProvider,
  SeanceExterne,
  SeancePlanifiee,
  SeanceRealisee,
  Wellness,
} from '@carter/shared';
import { ErreurProvider, type PlanSyncProvider } from './types.js';

interface EvenementMemoire {
  externalId: string;
  date: IsoDate;
  nom: string;
  possedeParCarter: boolean;
  contenu: unknown;
}

/**
 * Provider en memoire.
 *
 * Sert a deux choses : faire tourner toute l'app sans aucune cle API, et
 * donner aux tests du moteur de synchro une cible sur laquelle injecter des
 * pannes (429, 500, coupure reseau) de facon reproductible.
 */
export class ProviderMemoire implements PlanSyncProvider {
  readonly nom: NomProvider = 'LOCAL';
  readonly libelle = 'Provider en memoire (bac a sable)';

  private evenements = new Map<string, EvenementMemoire>();
  private compteur = 0;

  /** Pannes programmees : cle = `action:externalId` ou `action:*`. */
  private pannes = new Map<string, { restantes: number; erreur: ErreurProvider }>();

  /** Trace de tous les appels recus, pour les assertions de test. */
  readonly appels: { action: string; externalId: string | null; date: IsoDate | null }[] = [];

  constructor(
    private readonly prefixe = '[PLAN]',
    private readonly caps: CapacitesProvider = { ecrire: true, lire: true, supprimer: true },
  ) {}

  estConfigure(): boolean {
    return true;
  }

  capacites(): CapacitesProvider {
    return this.caps;
  }

  /** Ajoute un evenement preexistant, comme s'il etait deja chez le provider. */
  amorcer(evt: {
    externalId: string;
    date: IsoDate;
    nom: string;
    possedeParCarter?: boolean;
  }): void {
    this.evenements.set(evt.externalId, {
      externalId: evt.externalId,
      date: evt.date,
      nom: evt.nom,
      possedeParCarter: evt.possedeParCarter ?? evt.nom.startsWith(this.prefixe),
      contenu: null,
    });
  }

  /**
   * Programme `nb` echecs consecutifs sur une action.
   * `cible` vaut `*` pour toutes les operations de cette action.
   */
  programmerPanne(
    action: 'creer' | 'maj' | 'supprimer' | 'lister',
    cible: string,
    erreur: ErreurProvider,
    nb = 1,
  ): void {
    this.pannes.set(`${action}:${cible}`, { restantes: nb, erreur });
  }

  private declencher(action: string, cible: string | null): void {
    for (const clef of [`${action}:${cible ?? ''}`, `${action}:*`]) {
      const panne = this.pannes.get(clef);
      if (panne && panne.restantes > 0) {
        panne.restantes -= 1;
        if (panne.restantes === 0) this.pannes.delete(clef);
        throw panne.erreur;
      }
    }
  }

  async listerSeancesPlanifiees(debut: IsoDate, fin: IsoDate): Promise<SeanceExterne[]> {
    this.appels.push({ action: 'lister', externalId: null, date: debut });
    this.declencher('lister', null);
    return [...this.evenements.values()]
      .filter((e) => e.date >= debut && e.date <= fin)
      .map((e) => ({
        externalId: e.externalId,
        date: e.date,
        nom: e.nom,
        possedeParCarter: e.possedeParCarter,
        brut: e.contenu,
      }));
  }

  async creerSeance(p: SeancePlanifiee): Promise<{ externalId: string }> {
    this.appels.push({ action: 'creer', externalId: null, date: p.date });
    this.declencher('creer', p.seance.id);
    const externalId = `mem-${++this.compteur}`;
    this.evenements.set(externalId, {
      externalId,
      date: p.date,
      nom: `${this.prefixe} ${p.seance.titre}`,
      possedeParCarter: true,
      contenu: p.hash,
    });
    return { externalId };
  }

  async mettreAJourSeance(externalId: string, p: SeancePlanifiee): Promise<void> {
    this.appels.push({ action: 'maj', externalId, date: p.date });
    this.declencher('maj', externalId);
    const existant = this.evenements.get(externalId);
    if (existant === undefined) {
      throw new ErreurProvider(`evenement ${externalId} introuvable`, 404);
    }
    this.evenements.set(externalId, {
      ...existant,
      date: p.date,
      nom: `${this.prefixe} ${p.seance.titre}`,
      contenu: p.hash,
    });
  }

  async supprimerSeance(externalId: string): Promise<void> {
    this.appels.push({ action: 'supprimer', externalId, date: null });
    this.declencher('supprimer', externalId);
    if (!this.evenements.has(externalId)) {
      throw new ErreurProvider(`evenement ${externalId} introuvable`, 404);
    }
    this.evenements.delete(externalId);
  }

  async listerActivites(): Promise<SeanceRealisee[]> {
    return [];
  }

  async listerWellness(): Promise<Wellness[]> {
    return [];
  }

  /** Etat courant, pour les assertions. */
  etat(): EvenementMemoire[] {
    return [...this.evenements.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
