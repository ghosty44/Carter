import type { NomProvider } from '@carter/shared';
import type { Config } from '../config.js';
import type { BaseCarter } from '../db/index.js';
import type {
  DepotPlan,
  DepotQuestions,
  DepotRealise,
  DepotSyncPg,
  DepotWellness,
} from '../db/depots.js';
import type { PlanSyncProvider } from '../providers/types.js';

export interface Contexte {
  config: Config;
  db: BaseCarter;
  plans: DepotPlan;
  sync: DepotSyncPg;
  realise: DepotRealise;
  wellness: DepotWellness;
  questions: DepotQuestions;
  providers: Map<NomProvider, PlanSyncProvider>;
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

export function providerRequis(ctx: Contexte, nom: string): PlanSyncProvider {
  const provider = ctx.providers.get(nom as NomProvider);
  if (provider === undefined) {
    throw new ErreurHttp(400, `Provider inconnu : ${nom}`);
  }
  return provider;
}

export async function planRequis(ctx: Contexte) {
  const plan = await ctx.plans.courant();
  if (plan === null) {
    throw new ErreurHttp(
      404,
      "Aucun plan charge. Importe un plan JSON pour commencer — data/plan-bloc1.json contient le bloc 1.",
    );
  }
  return plan;
}
