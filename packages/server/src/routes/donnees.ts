import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  DouleurSchema,
  IsoDate,
  NomProvider,
  WellnessSchema,
  ajouterJours,
  aujourdhui,
} from '@carter/shared';
import { comparerParSemaine } from '../analyse/comparaison.js';
import { proposerRapprochements } from '../analyse/rapprochement.js';
import { ErreurHttp, planRequis, providerRequis, type Contexte } from './contexte.js';

const Plage = z.object({
  debut: IsoDate.optional(),
  fin: IsoDate.optional(),
});

const CorpsImport = z.object({
  provider: NomProvider,
  debut: IsoDate,
  fin: IsoDate,
  /** Applique automatiquement les rapprochements sans ambiguite. */
  rapprocher: z.boolean().default(true),
});

/** Saisie post-seance : trois champs, trois clics. */
const CorpsRessenti = z.object({
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  ressenti: z.number().int().min(1).max(5).nullable().optional(),
  douleurs: z.array(DouleurSchema).optional(),
  commentaire: z.string().max(4000).optional(),
});

function plageParDefaut(query: z.infer<typeof Plage>): { debut: string; fin: string } {
  const today = aujourdhui();
  return {
    debut: query.debut ?? ajouterJours(today, -56),
    fin: query.fin ?? today,
  };
}

export function routesDonnees(app: FastifyInstance, ctx: Contexte): void {
  /** Import des activites et du wellness depuis un provider. */
  app.post('/api/donnees/importer', async (requete) => {
    const corps = CorpsImport.parse(requete.body);
    const provider = providerRequis(ctx, corps.provider);

    if (!provider.capacites().lire) {
      throw new ErreurHttp(409, `${provider.libelle} ne sait pas lire de donnees`);
    }
    if (!provider.estConfigure()) {
      throw new ErreurHttp(409, `${provider.libelle} n'est pas configure`);
    }

    const activites = await provider.listerActivites(corps.debut, corps.fin);
    // Import provider : ne jamais ecraser RPE, ressenti, douleurs, commentaire.
    for (const a of activites) await ctx.realise.enregistrer(a, { preserverSaisie: true });

    const wellness = await provider.listerWellness(corps.debut, corps.fin);
    for (const w of wellness) await ctx.wellness.enregistrer(w);

    const plan = await ctx.plans.courant();
    let appliques = 0;
    let aConfirmer: ReturnType<typeof proposerRapprochements> = [];

    if (plan !== null) {
      const propositions = proposerRapprochements(
        plan,
        await ctx.realise.surPeriode(corps.debut, corps.fin),
      );

      if (corps.rapprocher) {
        for (const p of propositions.filter((x) => x.certain)) {
          await ctx.realise.rattacher(p.realiseeId, p.seanceId);
          appliques += 1;
        }
      }
      aConfirmer = propositions.filter((p) => !p.certain);
    }

    return {
      activites_importees: activites.length,
      wellness_importe: wellness.length,
      rapprochements_appliques: appliques,
      rapprochements_a_confirmer: aConfirmer,
    };
  });

  app.get<{ Querystring: z.infer<typeof Plage> }>('/api/donnees/realisees', async (requete) => {
    const { debut, fin } = plageParDefaut(Plage.parse(requete.query));
    return { realisees: await ctx.realise.surPeriode(debut, fin) };
  });

  /** Saisie du ressenti apres une sortie. */
  app.patch<{ Params: { id: string } }>('/api/donnees/realisees/:id', async (requete) => {
    const corps = CorpsRessenti.parse(requete.body);
    const existante = await ctx.realise.parId(requete.params.id);
    if (existante === null) throw new ErreurHttp(404, 'Seance realisee introuvable');

    await ctx.realise.enregistrer({
      ...existante,
      rpe: corps.rpe !== undefined ? corps.rpe : existante.rpe,
      ressenti: corps.ressenti !== undefined ? corps.ressenti : existante.ressenti,
      douleurs: corps.douleurs ?? existante.douleurs,
      commentaire: corps.commentaire ?? existante.commentaire,
    });

    return { realisee: await ctx.realise.parId(requete.params.id) };
  });

  /** Saisie manuelle d'une seance realisee, quand aucun provider ne la remonte. */
  app.post('/api/donnees/realisees', async (requete) => {
    const Corps = z.object({
      date: IsoDate,
      seance_id: z.string().nullable().default(null),
      nom: z.string().max(300).default(''),
      type_sport: z.string().max(60).default('Run'),
      duree_s: z.number().int().nonnegative(),
      distance_m: z.number().nonnegative().default(0),
      denivele_m: z.number().nonnegative().default(0),
      rpe: z.number().int().min(1).max(10).nullable().default(null),
      ressenti: z.number().int().min(1).max(5).nullable().default(null),
      douleurs: z.array(DouleurSchema).default([]),
      commentaire: z.string().max(4000).default(''),
    });

    const corps = Corps.parse(requete.body);
    const id = `manuel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await ctx.realise.enregistrer({
      ...corps,
      id,
      source: 'MANUEL',
      external_id: null,
      fc_moy: null,
      fc_max: null,
      allure_moy_s_km: null,
      allure_gap_s_km: null,
    });

    return { realisee: await ctx.realise.parId(id) };
  });

  /** Rattachement manuel, ou correction d'un rapprochement automatique. */
  app.post('/api/donnees/rapprocher', async (requete) => {
    const Corps = z.object({
      realisee_id: z.string(),
      seance_id: z.string().nullable(),
    });
    const corps = Corps.parse(requete.body);

    if ((await ctx.realise.parId(corps.realisee_id)) === null) {
      throw new ErreurHttp(404, 'Seance realisee introuvable');
    }

    await ctx.realise.rattacher(corps.realisee_id, corps.seance_id);
    return { realisee: await ctx.realise.parId(corps.realisee_id) };
  });

  /** Propositions de rapprochement en attente. */
  app.get<{ Querystring: z.infer<typeof Plage> }>(
    '/api/donnees/rapprochements',
    async (requete) => {
      const plan = await planRequis(ctx);
      const { debut, fin } = plageParDefaut(Plage.parse(requete.query));
      return {
        propositions: proposerRapprochements(plan, await ctx.realise.surPeriode(debut, fin)),
      };
    },
  );

  /** Prevu contre realise, semaine par semaine. */
  app.get('/api/donnees/comparaison', async () => {
    const plan = await planRequis(ctx);
    const today = aujourdhui();
    const debut = plan.blocs[0]?.date_debut ?? today;

    return {
      comparaisons: comparerParSemaine(plan, await ctx.realise.surPeriode(debut, today), today),
    };
  });

  app.get<{ Querystring: z.infer<typeof Plage> }>('/api/wellness', async (requete) => {
    const { debut, fin } = plageParDefaut(Plage.parse(requete.query));
    return { wellness: await ctx.wellness.surPeriode(debut, fin) };
  });

  /** Saisie manuelle du wellness : doit marcher sans aucun provider connecte. */
  app.put('/api/wellness', async (requete) => {
    const corps = WellnessSchema.parse(requete.body);
    await ctx.wellness.enregistrer(corps);
    return { wellness: (await ctx.wellness.surPeriode(corps.date, corps.date))[0] ?? null };
  });

  app.get('/api/questions', async () => ({ questions: await ctx.questions.ouvertes() }));

  app.post('/api/questions', async (requete) => {
    const Corps = z.object({ texte: z.string().min(1).max(2000) });
    await ctx.questions.ajouter(Corps.parse(requete.body).texte);
    return { questions: await ctx.questions.ouvertes() };
  });
}
