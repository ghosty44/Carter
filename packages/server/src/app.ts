import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import statique from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { chargerConfig, type Config } from './config.js';
import { enregistrerAuth } from './auth.js';
import { migrer, ouvrirBase } from './db/index.js';
import { DepotActivites, DepotSessionGarminPg, DepotWellness } from './db/depots.js';
import { ClientGarmin } from './garmin/client.js';
import { ErreurGarmin } from './garmin/erreurs.js';
import { ErreurHttp, type Contexte } from './routes/contexte.js';
import { routesGarmin } from './routes/garmin.js';
import { routesDonnees } from './routes/donnees.js';

export interface OptionsApp {
  config?: Config;
  /** Sert le frontend compile. Inutile sur Vercel, qui sert le statique. */
  servirStatique?: boolean;
}

/**
 * Construit l'application sans l'ecouter.
 *
 * Separee de `index.ts` pour que la meme app tourne dans deux contextes : un
 * serveur long-vivant en local, et une fonction serverless sur Vercel.
 */
export async function construireApp(options: OptionsApp = {}): Promise<FastifyInstance> {
  const config = options.config ?? chargerConfig();

  const db = ouvrirBase(config.DATABASE_URL!);
  await migrer(db);

  const ctx: Contexte = {
    config,
    db,
    activites: new DepotActivites(db),
    wellness: new DepotWellness(db),
    garmin: new ClientGarmin({
      depot: new DepotSessionGarminPg(db, config.SESSION_SECRET),
      active: config.GARMIN_ENABLED,
    }),
  };

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Ne jamais journaliser les entetes : le jeton Garmin et le cookie de
      // session s'y trouvent.
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    bodyLimit: 1024 * 1024,
    // Derriere un proxy, l'IP et le protocole reels sont dans les en-tetes
    // X-Forwarded-*. Sans ca, le cookie `secure` voit l'adresse interne.
    trustProxy: true,
  });

  await app.register(cookie);
  enregistrerAuth(app, config);

  routesGarmin(app, ctx);
  routesDonnees(app, ctx);

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

    if (erreur instanceof ErreurGarmin) {
      // 409 pour ce que l'utilisateur peut corriger (session, identifiants),
      // 502 quand c'est Garmin qui va mal.
      return reponse.code(erreur.statut !== null && erreur.statut < 500 ? 409 : 502).send({
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
