import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookie from '@fastify/cookie';
import statique from '@fastify/static';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import { enregistrerAuth } from './auth.js';
import { ouvrirBase } from './db/index.js';
import {
  DepotPlan,
  DepotQuestions,
  DepotRealise,
  DepotSyncSqlite,
  DepotWellness,
} from './db/depots.js';
import { construireProviders } from './providers/registry.js';
import { ErreurProvider } from './providers/types.js';
import { ErreurHttp, type Contexte } from './routes/contexte.js';
import { routesPlan } from './routes/plan.js';
import { routesSync } from './routes/sync.js';
import { routesDonnees } from './routes/donnees.js';
import { routesExports } from './routes/exports.js';

const db = ouvrirBase(config.DATABASE_PATH);

const ctx: Contexte = {
  config,
  db,
  plans: new DepotPlan(db),
  sync: new DepotSyncSqlite(db),
  realise: new DepotRealise(db),
  wellness: new DepotWellness(db),
  questions: new DepotQuestions(db),
  providers: construireProviders(config),
};

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    // Ne jamais journaliser les entetes : l'Authorization vers Intervals.icu
    // et le cookie de session s'y trouvent.
    redact: ['req.headers.authorization', 'req.headers.cookie'],
  },
  bodyLimit: 8 * 1024 * 1024, // un plan de 12 mois avec consignes reste petit
});

await app.register(cookie);
enregistrerAuth(app, config);

routesPlan(app, ctx);
routesSync(app, ctx);
routesDonnees(app, ctx);
routesExports(app, ctx);

/** Traduction des erreurs internes en reponses lisibles. */
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

// Frontend compile, quand il existe. En developpement, Vite le sert lui-meme.
const racineWeb = join(import.meta.dirname, '..', '..', 'web', 'dist');
if (existsSync(racineWeb)) {
  await app.register(statique, { root: racineWeb, prefix: '/' });

  app.setNotFoundHandler((requete, reponse) => {
    if (requete.url.startsWith('/api/')) {
      return reponse.code(404).send({ erreur: 'Route inconnue' });
    }
    return reponse.sendFile('index.html'); // routage cote client
  });
}

function avertissements(): void {
  if (config.productionSansProtection && config.NODE_ENV !== 'production') {
    app.log.warn(
      "Aucun mot de passe configure : l'app est ouverte. " +
        'Acceptable en local, jamais en ligne. Renseigne APP_PASSWORD et SESSION_SECRET.',
    );
  }
  if (config.INTERVALS_API_KEY === '') {
    app.log.info(
      "Intervals.icu non configure : le provider « bac a sable » (LOCAL) reste utilisable " +
        'pour exercer tout le cycle de synchro sans cle.',
    );
  }
}

try {
  avertissements();
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (erreur) {
  app.log.error(erreur);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info('arret demande, fermeture de la base');
    db.close();
    void app.close().then(() => process.exit(0));
  });
}
