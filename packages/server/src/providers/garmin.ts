import type {
  CapacitesProvider,
  IsoDate,
  NomProvider,
  SeanceExterne,
  SeancePlanifiee,
  SeanceRealisee,
  Wellness,
} from '@carter/shared';
import { ErreurProviderNonConfigure, type PlanSyncProvider } from './types.js';

export const LIEN_PROGRAMME =
  'https://developer.garmin.com/gc-developer-program/training-api/';

const MESSAGE_INDISPONIBLE = [
  "L'API Training de Garmin n'est pas accessible a un compte particulier.",
  'Elle fait partie du Garmin Connect Developer Program et demande une',
  'candidature validee par Garmin dans le cadre d\'un partenariat.',
  '',
  `Page du programme : ${LIEN_PROGRAMME}`,
  '',
  'En attendant, le chemin qui fonctionne est Intervals.icu : il se connecte',
  'a Garmin Connect cote utilisateur, donc les seances poussees vers',
  'Intervals.icu redescendent sur la montre.',
].join('\n');

export interface OptionsGarmin {
  active: boolean;
  consumerKey: string;
  consumerSecret: string;
}

/**
 * Squelette de l'adaptateur Garmin. Desactive par defaut.
 *
 * Il existe pour prouver que l'interface `PlanSyncProvider` tient sans que le
 * reste du code ait a savoir que Garmin existe : le jour ou les identifiants
 * partenaires arrivent, seul ce fichier change.
 *
 * INTERDIT, ET CE N'EST PAS UNE PREFERENCE DE STYLE :
 * ne jamais implementer ici une connexion par identifiant et mot de passe
 * Garmin Connect, ni s'appuyer sur une bibliotheque non officielle qui scrape
 * la session web. C'est contraire aux conditions d'utilisation de Garmin, ca
 * fait transiter les identifiants du compte par cette app, et ca casse a
 * chaque changement cote Garmin. Si l'acces partenaire n'est pas accorde, la
 * reponse est « on reste sur Intervals.icu », pas « on contourne ».
 */
export class ProviderGarmin implements PlanSyncProvider {
  readonly nom: NomProvider = 'GARMIN';
  readonly libelle = 'Garmin Training API';

  constructor(private readonly options: OptionsGarmin) {}

  estConfigure(): boolean {
    return (
      this.options.active &&
      this.options.consumerKey.length > 0 &&
      this.options.consumerSecret.length > 0
    );
  }

  capacites(): CapacitesProvider {
    // Les capacites annoncees sont celles de l'API une fois l'acces obtenu.
    // Le moteur s'appuie d'abord sur `estConfigure()` pour ne rien tenter.
    return { ecrire: true, lire: true, supprimer: true };
  }

  private refuser(): never {
    throw new ErreurProviderNonConfigure(MESSAGE_INDISPONIBLE);
  }

  async listerSeancesPlanifiees(_debut: IsoDate, _fin: IsoDate): Promise<SeanceExterne[]> {
    this.refuser();
  }

  async creerSeance(_p: SeancePlanifiee): Promise<{ externalId: string }> {
    this.refuser();
  }

  async mettreAJourSeance(_externalId: string, _p: SeancePlanifiee): Promise<void> {
    this.refuser();
  }

  async supprimerSeance(_externalId: string): Promise<void> {
    this.refuser();
  }

  async listerActivites(_debut: IsoDate, _fin: IsoDate): Promise<SeanceRealisee[]> {
    this.refuser();
  }

  async listerWellness(_debut: IsoDate, _fin: IsoDate): Promise<Wellness[]> {
    this.refuser();
  }
}
