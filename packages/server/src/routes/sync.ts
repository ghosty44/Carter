import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NomProvider, ajouterJours, aujourdhui } from '@carter/shared';
import { calculerDiff } from '../sync/diff.js';
import { appliquerSync } from '../sync/moteur.js';
import { sauvegarder } from '../db/index.js';
import { etatDesProviders } from '../providers/registry.js';
import { ErreurHttp, planRequis, providerRequis, type Contexte } from './contexte.js';

const CorpsApercu = z.object({
  provider: NomProvider,
  fenetre_semaines: z.number().int().min(1).max(52).optional(),
});

/**
 * L'apercu renvoye au client est resoumis tel quel a l'application.
 * Le moteur le revalide integralement : ce schema ne fait que garantir la
 * forme, pas la fraicheur.
 */
const OperationSchema = z.object({
  action: z.enum(['CREER', 'METTRE_A_JOUR', 'SUPPRIMER']),
  seanceId: z.string().nullable(),
  externalId: z.string().nullable(),
  date: z.string(),
  titre: z.string(),
  type: z.string().nullable(),
  motif: z.string(),
});

const CorpsApplication = z.object({
  provider: NomProvider,
  apercu: z.object({
    provider: NomProvider,
    fenetre: z.object({ debut: z.string(), fin: z.string() }),
    aCreer: z.array(OperationSchema),
    aMettreAJour: z.array(OperationSchema),
    aSupprimer: z.array(OperationSchema),
    ignorees: z.array(z.unknown()).default([]),
    calcule_le: z.string(),
  }),
});

export function routesSync(app: FastifyInstance, ctx: Contexte): void {
  app.get('/api/providers', async () => ({
    providers: etatDesProviders(ctx.providers),
    reglages: {
      fenetre_semaines: ctx.config.SYNC_WINDOW_WEEKS,
      types_synchronises: ctx.config.SYNC_TYPES,
      prefixe: ctx.config.INTERVALS_EVENT_PREFIX,
    },
  }));

  /**
   * Calcule le diff sans rien envoyer. C'est l'ecran que l'utilisateur voit
   * avant de confirmer : rien ne part vers le provider tant qu'il n'a pas
   * appuye sur « Appliquer ».
   */
  app.post('/api/sync/apercu', async (requete) => {
    const corps = CorpsApercu.parse(requete.body);
    const plan = planRequis(ctx);
    const provider = providerRequis(ctx, corps.provider);

    if (!provider.estConfigure()) {
      throw new ErreurHttp(409, `${provider.libelle} n'est pas configure`, {
        provider: provider.nom,
      });
    }

    const today = aujourdhui();
    const fenetre = corps.fenetre_semaines ?? ctx.config.SYNC_WINDOW_WEEKS;
    const fin = ajouterJours(today, fenetre * 7);

    const distantes = await provider.listerSeancesPlanifiees(today, fin);

    return {
      apercu: calculerDiff(plan, distantes, ctx.sync.correspondances(provider.nom), {
        provider: provider.nom,
        typesSynchronises: ctx.config.SYNC_TYPES,
        fenetreSemaines: fenetre,
        today,
      }),
    };
  });

  /** Applique un apercu confirme. Sauvegarde la base avant d'ecrire. */
  app.post('/api/sync/appliquer', async (requete) => {
    const corps = CorpsApplication.parse(requete.body);
    const plan = planRequis(ctx);
    const provider = providerRequis(ctx, corps.provider);

    if (corps.apercu.provider !== provider.nom) {
      throw new ErreurHttp(400, "L'apercu ne correspond pas au provider demande");
    }

    const sauvegarde = sauvegarder(ctx.db, ctx.config.DATABASE_PATH, 'sync');

    const resultat = await appliquerSync(
      plan,
      corps.apercu as Parameters<typeof appliquerSync>[1],
      provider,
      ctx.sync,
      {
        sauvegarde,
        file: { delaiMs: ctx.config.SYNC_RATE_LIMIT_MS },
      },
    );

    return { resultat };
  });

  app.get<{ Querystring: { limite?: string } }>('/api/sync/journal', async (requete) => ({
    journal: ctx.sync.journal(Number(requete.query.limite ?? 200)),
  }));
}
