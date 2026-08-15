import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import statique from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { chargerConfig, type Config } from './config.js';
import { enregistrerAuth } from './auth.js';
import { migrer, ouvrirBase } from './db/index.js';
import {
  DepotPlan,
  DepotQuestions,
  DepotRealise,
  DepotSessionGarminPg,
  DepotSyncPg,
  DepotWellness,
} from './db/depots.js';
import { construireProviders } from './providers/registry.js';
import { ErreurProvider } from './providers/types.js';
import { ProviderGarminDirect } from './providers/garmin-direct.js';
import { ErreurHttp, type Contexte } from './routes/contexte.js';
import { routesPlan } from './routes/plan.js';
import { routesSync } from './routes/sync.js';
import { routesDonnees } from './routes/donnees.js';
import { routesExports } from './routes/exports.js';
import { routesGarmin } from './routes/garmin.js';

export interface OptionsApp {
  config?: Config;
  /** Sert le frontend compile. Inutile sur Vercel, qui sert le statique. */
  servirStatique?: boolean;
}

/**
 * Construit l'application sans l'ecouter.
 *
 * Separee de `index.ts` pour que la meme app tourne dans deux contextes : un
 * serveur long-vivant en local, et une fonction serverless sur Vercel. Rien
 * ici ne suppose l'un ou l'autre.
 */
export async function construireApp(options: OptionsApp = {}): Promise<FastifyInstance> {
  const config = options.config ?? chargerConfig();

  const db = ouvrirBase(config.DATABASE_URL!);
  await migrer(db);

  const ctx: Contexte = {
    config,
    db,
    plans: new DepotPlan(db),
    sync: new DepotSyncPg(db),
    realise: new DepotRealise(db),
    wellness: new DepotWellness(db),
    questions: new DepotQuestions(db),
    providers: construireProviders(
      config,
      new DepotSessionGarminPg(db, config.SESSION_SECRET),
    ),
  };

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Ne jamais journaliser les entetes : l'Authorization vers Intervals.icu
      // et le cookie de session s'y trouvent.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 8 * 1024 * 1024,
    // Derriere le proxy Vercel, l'IP et le protocole reels sont dans les
    // en-tetes X-Forwarded-*. Sans ca, le cookie `secure` et les journaux
    // voient l'adresse interne du proxy.
    trustProxy: true,
  });

  await app.register(cookie);
  enregistrerAuth(app, config);

  routesPlan(app, ctx);
  routesSync(app, ctx);
  routesDonnees(app, ctx);
  routesExports(app, ctx);
  routesGarmin(app, ctx);

  // La session Garmin est chargee une fois, pour que `estConfigure()` puisse
  // rester synchrone comme le veut l'interface PlanSyncProvider.
  const garmin = ctx.providers.get('GARMIN_DIRECT');
  if (garmin instanceof ProviderGarminDirect) {
    await garmin.initialiser().catch((e: unknown) => {
      app.log.warn({ err: e }, 'session Garmin illisible, connexion a refaire');
    });
  }

  app.setErrorHandler((erreur, _requete, reponse) => {
    if (erreur instanceof ErreurHttp) {
      return reponse.code(erreur.statut).send({
        erreur: erreur.message,
        details: erreur.details ?? null,
      });
    }

    if (erreur instanceof ZodError) {
      return reponse.code(422).send({
        erreur: 'Donnees invalides',
        details: {
          erreurs: erreur.issues.map((i) => ({
            champ: i.path.join('.') || '(racine)',
            probleme: i.message,
          })),
        },
      });
    }

    if (erreur instanceof ErreurProvider) {
      return reponse.code(erreur.statut && erreur.statut < 500 ? 409 : 502).send({
        erreur: erreur.message,
        details: { reessayable: erreur.reessayable, statut: erreur.statut },
      });
    }

    app.log.error(erreur);
    return reponse.code(500).send({ erreur: 'Erreur interne' });
  });

  if (options.servirStatique !== false) {
    const racineWeb = join(import.meta.dirname, '..', '..', 'web', 'dist');
    if (existsSync(racineWeb)) {
      await app.register(statique, { root: racineWeb, prefix: '/' });

      app.setNotFoundHandler((requete, reponse) => {
        if (requete.url.startsWith('/api/')) {
          return reponse.code(404).send({ erreur: 'Route inconnue' });
        }
        return reponse.sendFile('index.html');
      });
    }
  } else {
    app.setNotFoundHandler((_requete, reponse) =>
      reponse.code(404).send({ erreur: 'Route inconnue' }),
    );
  }

  return app;
}
