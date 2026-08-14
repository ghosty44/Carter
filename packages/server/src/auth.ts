import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';

const NOM_COOKIE = 'carter_session';

/**
 * Protection d'acces.
 *
 * L'app est mono-utilisateur mais hebergee en ligne : sans porte d'entree,
 * le plan, les douleurs et les donnees de sommeil sont lisibles par quiconque
 * trouve l'URL. Un mot de passe unique suffit ici — il n'y a pas de comptes a
 * gerer — mais il n'est pas optionnel en production.
 *
 * Le jeton est un HMAC signe cote serveur : pas de stockage de session, et un
 * cookie forge sans le secret est rejete.
 */
export function creerJeton(config: Config): string {
  const expiration = Date.now() + config.SESSION_TTL_DAYS * 86_400_000;
  const alea = randomBytes(12).toString('hex');
  const charge = `${expiration}.${alea}`;
  return `${charge}.${signer(charge, config.SESSION_SECRET!)}`;
}

export function jetonValide(jeton: string | undefined, config: Config): boolean {
  if (!jeton || !config.SESSION_SECRET) return false;

  const morceaux = jeton.split('.');
  if (morceaux.length !== 3) return false;

  const [expiration, alea, signature] = morceaux as [string, string, string];
  const attendue = signer(`${expiration}.${alea}`, config.SESSION_SECRET);

  if (!comparerConstant(signature, attendue)) return false;

  const echeance = Number(expiration);
  return Number.isFinite(echeance) && echeance > Date.now();
}

function signer(charge: string, secret: string): string {
  return createHmac('sha256', secret).update(charge).digest('hex');
}

/** Comparaison a temps constant : evite de reveler le secret octet par octet. */
function comparerConstant(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function motDePasseCorrect(fourni: string, config: Config): boolean {
  if (!config.APP_PASSWORD) return false;
  const a = Buffer.from(fourni);
  const b = Buffer.from(config.APP_PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const CHEMINS_LIBRES = new Set(['/api/session', '/api/sante']);

export function enregistrerAuth(app: FastifyInstance, config: Config): void {
  app.addHook('onRequest', async (requete: FastifyRequest, reponse: FastifyReply) => {
    // Sans mot de passe configure (developpement local), tout passe.
    if (!config.APP_PASSWORD || !config.SESSION_SECRET) return;

    const chemin = requete.url.split('?')[0]!;
    if (!chemin.startsWith('/api/')) return; // le frontend static est servi librement
    if (CHEMINS_LIBRES.has(chemin)) return;

    if (!jetonValide(requete.cookies[NOM_COOKIE], config)) {
      return reponse.code(401).send({ erreur: 'Authentification requise' });
    }
  });

  app.post('/api/session', async (requete, reponse) => {
    const corps = requete.body as { mot_de_passe?: string } | undefined;

    if (!config.APP_PASSWORD || !config.SESSION_SECRET) {
      return reponse.send({ ouverte: true, protection: false });
    }

    if (!corps?.mot_de_passe || !motDePasseCorrect(corps.mot_de_passe, config)) {
      // Delai fixe : ne pas donner d'indice par le temps de reponse.
      await new Promise((r) => setTimeout(r, 400));
      return reponse.code(401).send({ erreur: 'Mot de passe incorrect' });
    }

    return reponse
      .setCookie(NOM_COOKIE, creerJeton(config), {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.NODE_ENV === 'production',
        path: '/',
        maxAge: config.SESSION_TTL_DAYS * 86_400,
      })
      .send({ ouverte: true, protection: true });
  });

  app.delete('/api/session', async (_requete, reponse) => {
    return reponse.clearCookie(NOM_COOKIE, { path: '/' }).send({ ouverte: false });
  });

  app.get('/api/sante', async () => ({
    ok: true,
    protection: Boolean(config.APP_PASSWORD && config.SESSION_SECRET),
  }));
}
