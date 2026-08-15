import { chargerConfig } from './config.js';
import { construireApp } from './app.js';
import { fermerBase } from './db/index.js';

/**
 * Serveur long-vivant : developpement local, ou hebergement classique.
 * Sur Vercel, c'est `api/[...path].ts` a la racine qui prend le relais.
 */
const config = chargerConfig();
const app = await construireApp({ config });

if (!config.protectionActive) {
  app.log.warn(
    "Aucun mot de passe configure : l'app est ouverte. Acceptable en local, jamais en ligne.",
  );
}

if (!config.GARMIN_ENABLED) {
  app.log.info('Connexion Garmin desactivee (GARMIN_ENABLED=false).');
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
