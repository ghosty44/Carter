import type { NomProvider } from '@carter/shared';
import type { Config } from '../config.js';
import type { PlanSyncProvider } from './types.js';
import { ProviderIntervals } from './intervals.js';
import { ProviderGarmin } from './garmin.js';
import { ProviderMemoire } from './memoire.js';

/**
 * Seul endroit qui connait la liste des providers.
 *
 * Ajouter un provider = ecrire son adaptateur + une ligne ici. Le moteur de
 * synchro, les routes et l'interface n'ont pas a etre touches.
 */
export function construireProviders(config: Config): Map<NomProvider, PlanSyncProvider> {
  const providers = new Map<NomProvider, PlanSyncProvider>();

  providers.set(
    'INTERVALS',
    new ProviderIntervals({
      athleteId: config.INTERVALS_ATHLETE_ID,
      apiKey: config.INTERVALS_API_KEY,
      prefixe: config.INTERVALS_EVENT_PREFIX,
    }),
  );

  providers.set(
    'GARMIN',
    new ProviderGarmin({
      active: config.GARMIN_ENABLED,
      consumerKey: config.GARMIN_CONSUMER_KEY,
      consumerSecret: config.GARMIN_CONSUMER_SECRET,
    }),
  );

  // Bac a sable : permet d'exercer tout le cycle de synchro sans aucune cle.
  providers.set('LOCAL', new ProviderMemoire(config.INTERVALS_EVENT_PREFIX));

  return providers;
}

export interface EtatProvider {
  nom: NomProvider;
  libelle: string;
  configure: boolean;
  capacites: { ecrire: boolean; lire: boolean; supprimer: boolean };
  /** Message affiche quand le provider n'est pas utilisable. */
  indisponibilite: string | null;
}

export function etatDesProviders(
  providers: Map<NomProvider, PlanSyncProvider>,
): EtatProvider[] {
  return [...providers.values()].map((p) => ({
    nom: p.nom,
    libelle: p.libelle,
    configure: p.estConfigure(),
    capacites: p.capacites(),
    indisponibilite: p.estConfigure() ? null : messageIndisponibilite(p.nom),
  }));
}

function messageIndisponibilite(nom: NomProvider): string {
  switch (nom) {
    case 'INTERVALS':
      return "Renseigne INTERVALS_ATHLETE_ID et INTERVALS_API_KEY dans le .env du serveur. La cle se genere dans Settings > Developer Settings sur intervals.icu.";
    case 'GARMIN':
      return "Acces au Garmin Connect Developer Program requis. Ce provider reste desactive : passe par Intervals.icu, qui redescend vers ta montre Garmin.";
    default:
      return 'Provider indisponible.';
  }
}
