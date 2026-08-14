import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  IsoDate,
  PlanReviseSchema,
  TypeSeance,
  aujourdhui,
  extrairePlanRevise,
  validerCoherencePlan,
} from '@carter/shared';
import { calculerAlertes } from '../alertes/regles.js';
import {
  CONTRAINTES_PAR_DEFAUT,
  construireExportCoach,
  periodeParDefaut,
  rendreMarkdownCoach,
} from '../export/coach.js';
import { exporterPlanCsv, exporterRealiseCsv } from '../export/csv.js';
import { exporterIcs } from '../export/ics.js';
import { diffEnMarkdown, diffPlans } from '../export/diff-plan.js';
import { sauvegarder } from '../db/index.js';
import { ErreurHttp, planRequis, type Contexte } from './contexte.js';

const PlageExport = z.object({
  debut: IsoDate.optional(),
  fin: IsoDate.optional(),
  types: z.string().optional(),
});

export function routesExports(app: FastifyInstance, ctx: Contexte): void {
  app.get<{ Querystring: z.infer<typeof PlageExport> }>(
    '/api/export/ics',
    async (requete, reponse) => {
      const plan = await planRequis(ctx);
      const query = PlageExport.parse(requete.query);

      const types = query.types
        ? query.types.split(',').map((t) => TypeSeance.parse(t.trim()))
        : undefined;

      const ics = exporterIcs(plan, {
        debut: query.debut,
        fin: query.fin,
        types,
        prefixe: ctx.config.INTERVALS_EVENT_PREFIX,
      });

      return reponse
        .header('Content-Type', 'text/calendar; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="carter-plan.ics"')
        .send(ics);
    },
  );

  app.get('/api/export/plan.csv', async (_requete, reponse) => {
    const plan = await planRequis(ctx);
    return reponse
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="carter-plan.csv"')
      .send(exporterPlanCsv(plan));
  });

  app.get<{ Querystring: z.infer<typeof PlageExport> }>(
    '/api/export/realise.csv',
    async (requete, reponse) => {
      const query = PlageExport.parse(requete.query);
      const today = aujourdhui();
      const plan = await ctx.plans.courant();
      const debut = query.debut ?? plan?.blocs[0]?.date_debut ?? today;

      return reponse
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="carter-realise.csv"')
        .send(exporterRealiseCsv(await ctx.realise.surPeriode(debut, query.fin ?? today)));
    },
  );

  /** Le plan brut, pour ne jamais enfermer les donnees dans l'app. */
  app.get('/api/export/plan.json', async (_requete, reponse) => {
    const plan = await planRequis(ctx);
    return reponse
      .header('Content-Disposition', 'attachment; filename="carter-plan.json"')
      .send(plan);
  });

  /**
   * Export coach : Markdown a coller dans une conversation et JSON complet
   * conforme au schema d'echange. Les deux sont produits ensemble pour qu'ils
   * decrivent forcement la meme periode.
   */
  app.get<{ Querystring: z.infer<typeof PlageExport> }>(
    '/api/export/coach',
    async (requete) => {
      const plan = await planRequis(ctx);
      const query = PlageExport.parse(requete.query);
      const today = aujourdhui();
      const defaut = periodeParDefaut(today);

      const debut = query.debut ?? defaut.debut;
      const fin = query.fin ?? defaut.fin;
      const debutPlan = plan.blocs[0]?.date_debut ?? debut;

      const realisees = await ctx.realise.surPeriode(debutPlan, today);
      const wellness = await ctx.wellness.surPeriode(debutPlan, today);

      const charge = construireExportCoach({
        plan,
        realisees,
        wellness,
        alertes: calculerAlertes({ plan, realisees, wellness, today }),
        questions: (await ctx.questions.ouvertes()).map((q) => q.texte),
        contraintes: CONTRAINTES_PAR_DEFAUT,
        debut,
        fin,
        today,
      });

      return { markdown: rendreMarkdownCoach(charge), json: charge };
    },
  );

  /**
   * Import d'un plan revise par le coach.
   *
   * Deux temps : `?appliquer=false` (defaut) valide et renvoie le diff sans
   * rien changer, `?appliquer=true` enregistre. L'utilisateur voit toujours ce
   * qui bouge avant que ca bouge.
   */
  app.post<{ Querystring: { appliquer?: string } }>(
    '/api/export/coach/importer',
    async (requete) => {
      const parse = PlanReviseSchema.safeParse(requete.body);
      if (!parse.success) {
        throw new ErreurHttp(422, "Le plan revise ne respecte pas le schema d'echange", {
          erreurs: parse.error.issues.map((i) => ({
            champ: i.path.join('.') || '(racine)',
            probleme: i.message,
          })),
        });
      }

      const { plan: revise, commentaire } = extrairePlanRevise(parse.data);

      const incoherences = validerCoherencePlan(revise);
      if (incoherences.length > 0) {
        throw new ErreurHttp(422, 'Le plan revise est incoherent', { erreurs: incoherences });
      }

      const courant = await planRequis(ctx);
      if (revise.id !== courant.id) {
        throw new ErreurHttp(
          409,
          `Le plan revise porte l'identifiant « ${revise.id} » alors que le plan courant est « ${courant.id} ». ` +
            "Verifie que le coach a bien travaille sur le plan joint a l'export.",
        );
      }

      const diff = diffPlans(courant, revise);
      const appliquer = requete.query.appliquer === 'true';

      if (!appliquer) {
        return { applique: false, diff, diff_markdown: diffEnMarkdown(diff), commentaire };
      }

      await sauvegarder(ctx.db, 'import-coach');
      const enregistre = await ctx.plans.enregistrer(revise, 'COACH', commentaire ?? '');

      return {
        applique: true,
        plan: enregistre,
        diff,
        diff_markdown: diffEnMarkdown(diff),
        commentaire,
      };
    },
  );
}
