import type { FastifyInstance } from 'fastify';
import {
  PlanSchema,
  aujourdhui,
  seancesPlanifiees,
  validerCoherencePlan,
  volumesParSemaine,
} from '@carter/shared';
import { calculerAlertes } from '../alertes/regles.js';
import { diffEnMarkdown, diffPlans } from '../export/diff-plan.js';
import { sauvegarder } from '../db/index.js';
import { ErreurHttp, planRequis, type Contexte } from './contexte.js';

export function routesPlan(app: FastifyInstance, ctx: Contexte): void {
  /** Le plan courant, avec tout ce que l'interface affiche autour. */
  app.get('/api/plan', async () => {
    const plan = await ctx.plans.courant();
    if (plan === null) return { plan: null, volumes: [], seances: [], alertes: [] };

    const today = aujourdhui();
    const debut = plan.blocs[0]?.date_debut ?? today;

    return {
      plan,
      volumes: volumesParSemaine(plan),
      seances: seancesPlanifiees(plan),
      alertes: calculerAlertes({
        plan,
        realisees: await ctx.realise.surPeriode(debut, today),
        wellness: await ctx.wellness.surPeriode(debut, today),
        today,
      }),
    };
  });

  /**
   * Import d'un plan. La validation est stricte et le rapport d'erreurs
   * lisible : un plan a moitie valide qui passe en silence produit des degats
   * bien plus loin, au moment de la synchro.
   */
  app.post('/api/plan/import', async (requete) => {
    const parse = PlanSchema.safeParse(requete.body);
    if (!parse.success) {
      throw new ErreurHttp(422, 'Le plan ne respecte pas le schema', {
        erreurs: parse.error.issues.map((i) => ({
          champ: i.path.join('.') || '(racine)',
          probleme: i.message,
        })),
      });
    }

    const incoherences = validerCoherencePlan(parse.data);
    if (incoherences.length > 0) {
      throw new ErreurHttp(422, 'Le plan est incoherent', { erreurs: incoherences });
    }

    const existant = await ctx.plans.courant();
    const diff = existant === null ? null : diffPlans(existant, parse.data);

    const enregistre = await ctx.plans.enregistrer(parse.data, existant === null ? 'INITIAL' : 'IMPORT');

    return {
      plan: enregistre,
      diff,
      diff_markdown: diff === null ? null : diffEnMarkdown(diff),
    };
  });

  /** Enregistrement d'une edition faite dans l'interface. */
  app.put('/api/plan', async (requete) => {
    const parse = PlanSchema.safeParse(requete.body);
    if (!parse.success) {
      throw new ErreurHttp(422, 'Plan invalide', {
        erreurs: parse.error.issues.map((i) => ({
          champ: i.path.join('.') || '(racine)',
          probleme: i.message,
        })),
      });
    }

    const incoherences = validerCoherencePlan(parse.data);
    if (incoherences.length > 0) {
      throw new ErreurHttp(422, 'Plan incoherent', { erreurs: incoherences });
    }

    return { plan: await ctx.plans.enregistrer(parse.data, 'EDITION') };
  });

  app.get('/api/plan/versions', async () => {
    const plan = await planRequis(ctx);
    return { versions: await ctx.plans.versions(plan.id) };
  });

  app.get<{ Params: { version: string } }>('/api/plan/versions/:version', async (requete) => {
    const plan = await planRequis(ctx);
    const version = await ctx.plans.versionPrecise(plan.id, Number(requete.params.version));
    if (version === null) throw new ErreurHttp(404, 'Version introuvable');
    return { plan: version };
  });

  /** Diff entre deux versions, ou entre une version et le plan courant. */
  app.get<{ Querystring: { a?: string; b?: string } }>('/api/plan/diff', async (requete) => {
    const plan = await planRequis(ctx);

    const a = requete.query.a
      ? await ctx.plans.versionPrecise(plan.id, Number(requete.query.a))
      : null;
    const b = requete.query.b
      ? await ctx.plans.versionPrecise(plan.id, Number(requete.query.b))
      : plan;

    if (a === null || b === null) {
      throw new ErreurHttp(400, 'Indique deux versions existantes (parametres a et b)');
    }

    const diff = diffPlans(a, b);
    return { diff, markdown: diffEnMarkdown(diff) };
  });

  /**
   * Retour a une version anterieure. Le retour est lui-meme une nouvelle
   * version : l'historique n'est jamais reecrit, on ne perd pas la trace de
   * ce qui a ete annule.
   */
  app.post<{ Params: { version: string } }>(
    '/api/plan/versions/:version/restaurer',
    async (requete) => {
      const courant = await planRequis(ctx);
      const cible = await ctx.plans.versionPrecise(courant.id, Number(requete.params.version));
      if (cible === null) throw new ErreurHttp(404, 'Version introuvable');

      await sauvegarder(ctx.db, 'restauration');

      const restaure = await ctx.plans.enregistrer(
        cible,
        'RESTAURATION',
        `retour a la version ${requete.params.version}`,
      );
      const diff = diffPlans(courant, restaure);

      return { plan: restaure, diff, diff_markdown: diffEnMarkdown(diff) };
    },
  );
}
