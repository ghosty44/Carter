import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { construireApp } from '@carter/server/app';

/**
 * Point d'entree Vercel : monte l'app Fastify entiere dans une fonction.
 *
 * Le routage vers cette fonction est declare explicitement dans `vercel.json`
 * (`/api/(.*)` -> `/api/index`) plutot que laisse au routage implicite par
 * nom de fichier. Un fichier catch-all `api/[...path].ts` avait l'air plus
 * elegant, mais les crochets sont aussi une syntaxe de glob : dans la cle
 * `functions`, `[...path]` est lu comme une classe de caracteres et ne
 * designe jamais le fichier voulu. Un nom sans crochet supprime l'ambiguite.
 *
 * Le statique n'est pas servi ici : Vercel le sert depuis
 * `packages/web/dist`, sans reveiller de fonction.
 */

let appPromise: Promise<FastifyInstance> | null = null;

/**
 * L'app est construite une fois et gardee entre invocations : tant que
 * l'instance est chaude, on evite de rejouer les migrations et de rouvrir le
 * pool. En cas d'echec la promesse est relachee, pour qu'une panne
 * transitoire de la base ne condamne pas l'instance.
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

/**
 * Retrouve le chemin d'origine de la requete.
 *
 * Selon la facon dont la plateforme applique la reecriture, `req.url` peut
 * arriver tel quel ou reduit a la destination (`/api/index`). Fastify a besoin
 * du chemin reel pour router : on le reconstruit a partir des en-tetes que
 * Vercel ajoute, plutot que de supposer un comportement.
 */
function cheminOriginal(requete: IncomingMessage): string {
  const url = requete.url ?? '/';

  // Cas normal : la reecriture a preserve le chemin demande.
  if (url.startsWith('/api/') && !url.startsWith('/api/index')) return url;

  const entetes = requete.headers;
  const candidat =
    premiere(entetes['x-vercel-original-path']) ??
    premiere(entetes['x-now-route-matches']) ??
    premiere(entetes['x-vercel-path']);

  if (candidat !== null && candidat.startsWith('/api/')) return candidat;

  return url;
}

function premiere(valeur: string | string[] | undefined): string | null {
  if (valeur === undefined) return null;
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur;
}

export default async function handler(
  requete: IncomingMessage,
  reponse: ServerResponse,
): Promise<void> {
  try {
    const app = await obtenirApp();

    const chemin = cheminOriginal(requete);
    if (chemin !== requete.url) {
      app.log.debug({ recu: requete.url, resolu: chemin }, 'chemin reconstruit');
      requete.url = chemin;
    }

    app.server.emit('request', requete, reponse);
  } catch (erreur) {
    // Echec au demarrage : configuration absente, base injoignable. Repondre
    // en clair vaut mieux qu'une 500 opaque de la plateforme.
    const message = erreur instanceof Error ? erreur.message : String(erreur);

    // Trace complete cote plateforme : seule facon de diagnostiquer une panne
    // de demarrage depuis les journaux Vercel.
    console.error('[carter] demarrage impossible', erreur);

    reponse.statusCode = 500;
    reponse.setHeader('Content-Type', 'application/json; charset=utf-8');
    reponse.end(
      JSON.stringify({
        erreur: "Le serveur n'a pas pu demarrer",
        details: { erreurs: message.split('\n').filter((l) => l.trim() !== '') },
      }),
    );
  }
}
