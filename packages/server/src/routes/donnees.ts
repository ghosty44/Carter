import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  IsoDate,
  ajouterJours,
  aujourdhui,
  parSemaine,
  records,
  repartition,
  totaux,
} from '@carter/shared';
import { ErreurHttp, type Contexte } from './contexte.js';

export function routesDonnees(app: FastifyInstance, ctx: Contexte): void {
  /** Liste des seances, de la plus recente a la plus ancienne. */
  app.get<{ Querystring: { limite?: string } }>('/api/activites', async (requete) => {
    const limite = Math.min(Math.max(Number(requete.query.limite ?? 50), 1), 300);
    return { activites: await ctx.activites.recentes(limite) };
  });

  app.get<{ Params: { id: string } }>('/api/activites/:id', async (requete) => {
    const activite = await ctx.activites.parId(requete.params.id);
    if (activite === null) throw new ErreurHttp(404, 'Seance introuvable');
    return { activite };
  });

  /**
   * Tout ce qu'affiche l'ecran Stats, en une requete.
   *
   * Les agregats sont calcules ici plutot que dans le navigateur : c'est la
   * meme fonction partagee que celle des tests, et ca evite de transferer
   * plusieurs centaines d'activites pour en tirer douze totaux.
   */
  app.get<{ Querystring: { semaines?: string } }>('/api/stats', async (requete) => {
    const nbSemaines = Math.min(Math.max(Number(requete.query.semaines ?? 12), 1), 52);
    const today = aujourdhui();

    // On remonte au lundi de la premiere semaine voulue, pas a J-n*7 : sinon
    // la semaine la plus ancienne est tronquee et parait anormalement basse.
    const debut = ajouterJours(today, -(nbSemaines * 7 + 7));
    const activites = await ctx.activites.surPeriode(debut, today);

    const quatreSemaines = activites.filter((a) => a.date >= ajouterJours(today, -27));

    return {
      semaines: parSemaine(activites, nbSemaines, today),
      derniers_28_jours: totaux(quatreSemaines),
      repartition: repartition(quatreSemaines),
      records: records(activites),
    };
  });

  const Plage = z.object({ debut: IsoDate.optional(), fin: IsoDate.optional() });

  app.get<{ Querystring: z.infer<typeof Plage> }>('/api/wellness', async (requete) => {
    const query = Plage.parse(requete.query);
    const today = aujourdhui();
    return {
      wellness: await ctx.wellness.surPeriode(
        query.debut ?? ajouterJours(today, -29),
        query.fin ?? today,
      ),
    };
  });
}
