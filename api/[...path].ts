import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { construireApp } from '@carter/server/app';

/**
 * Point d'entree Vercel.
 *
 * Fichier catch-all (`[...path]`) : Vercel y route toutes les requetes
 * commencant par `/api/` en conservant le chemin d'origine dans `req.url`,
 * ce que Fastify utilise pour router en interne. Un fichier `api/index.ts`
 * avec une reecriture ne garantit pas cette conservation.
 *
 * Le statique (le frontend compile) n'est pas servi ici : Vercel le sert
 * directement depuis `packages/web/dist`, sans reveiller de fonction.
 */

let appPromise: Promise<FastifyInstance> | null = null;

/**
 * L'app est construite une fois et gardee entre invocations.
 *
 * Le module reste charge tant que l'instance est chaude : on evite ainsi de
 * rejouer les migrations et de rouvrir le pool a chaque requete. En cas
 * d'echec, la promesse est relachee pour que l'invocation suivante retente
 * — sinon une panne transitoire de la base condamnerait l'instance.
 */
async function obtenirApp(): Promise<FastifyInstance> {
  if (appPromise === null) {
    appPromise = construireApp({ servirStatique: false })
      .then(async (app) => {
        await app.ready();
        return app;
      })
      .catch((erreur: unknown) => {
        appPromise = null;
        throw erreur;
      });
  }
  return appPromise;
}

export default async function handler(
  requete: IncomingMessage,
  reponse: ServerResponse,
): Promise<void> {
  try {
    const app = await obtenirApp();
    app.server.emit('request', requete, reponse);
  } catch (erreur) {
    // Echec au demarrage : configuration absente, base injoignable. Repondre
    // en clair vaut mieux qu'une 500 opaque de la plateforme.
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    reponse.statusCode = 500;
    reponse.setHeader('Content-Type', 'application/json; charset=utf-8');
    reponse.end(
      JSON.stringify({
        erreur: "Le serveur n'a pas pu demarrer",
        details: message,
      }),
    );
  }
}
