import { config } from './config.js';
import { construireApp } from './app.js';
import { fermerBase } from './db/index.js';

/**
 * Serveur long-vivant : developpement local, ou hebergement classique.
 * Sur Vercel, c'est `api/index.ts` a la racine du depot qui prend le relais.
 */
const app = await construireApp({ config });

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

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (erreur) {
  app.log.error(erreur);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info('arret demande, fermeture des connexions');
    void app
      .close()
      .then(() => fermerBase())
      .then(() => process.exit(0));
  });
}
