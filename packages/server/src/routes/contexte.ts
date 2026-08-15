import type { Config } from '../config.js';
import type { BaseCarter } from '../db/index.js';
import type { DepotActivites, DepotWellness } from '../db/depots.js';
import type { ClientGarmin } from '../garmin/client.js';

export interface Contexte {
  config: Config;
  db: BaseCarter;
  activites: DepotActivites;
  wellness: DepotWellness;
  garmin: ClientGarmin;
}

/** Erreur portant un code HTTP, convertie en reponse par le gestionnaire. */
export class ErreurHttp extends Error {
  constructor(
    readonly statut: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ErreurHttp';
  }
}
