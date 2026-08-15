import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { ProviderGarminDirect } from '../providers/garmin-direct.js';
import { MfaRequis, type EtatMfa } from '../providers/garmin-direct-sso.js';
import { ErreurHttp, type Contexte } from './contexte.js';

const CorpsConnexion = z.object({
  identifiant: z.string().min(3).max(200),
  mot_de_passe: z.string().min(1).max(500),
});

const CorpsMfa = z.object({
  jeton_mfa: z.string().min(1),
  code: z.string().min(4).max(12),
});

/**
 * Etats MFA en attente, gardes en memoire quelques minutes.
 *
 * Pas en base : ils contiennent des cookies de session SSO a usage unique et
 * n'ont aucune valeur passe le delai. En serverless, une instance froide perd
 * l'etat — l'utilisateur recommence la connexion, ce qui est acceptable pour
 * une operation faite une fois par an.
 */
const attentesMfa = new Map<string, { etat: EtatMfa; expire: number }>();
const DELAI_MFA_MS = 10 * 60 * 1000;

function purger(): void {
  const maintenant = Date.now();
  for (const [clef, valeur] of attentesMfa) {
    if (valeur.expire < maintenant) attentesMfa.delete(clef);
  }
}

export function routesGarmin(app: FastifyInstance, ctx: Contexte): void {
  function provider(): ProviderGarminDirect {
    const p = ctx.providers.get('GARMIN_DIRECT');
    if (!(p instanceof ProviderGarminDirect)) {
      throw new ErreurHttp(500, 'Provider Garmin direct absent du registre');
    }
    return p;
  }

  app.get('/api/garmin/etat', async () => {
    const p = provider();
    await p.initialiser();
    return { garmin: p.etat() };
  });

  /**
   * Connexion.
   *
   * Le mot de passe traverse cette route et n'est jamais conserve : ni en
   * base, ni en journal, ni dans la reponse. Fastify est configure pour ne
   * pas journaliser les corps de requete.
   */
  app.post('/api/garmin/connexion', async (requete, reponse) => {
    if (!ctx.config.GARMIN_DIRECT_ENABLED) {
      throw new ErreurHttp(
        409,
        'La connexion directe a Garmin est desactivee. Mets GARMIN_DIRECT_ENABLED=true cote serveur.',
      );
    }

    const corps = CorpsConnexion.parse(requete.body);
    const p = provider();

    try {
      const { nomAffichage } = await p.connecter(corps.identifiant, corps.mot_de_passe);
      return { connecte: true, nom_affichage: nomAffichage };
    } catch (e) {
      if (e instanceof MfaRequis) {
        purger();
        const jeton = randomBytes(18).toString('base64url');
        attentesMfa.set(jeton, { etat: e.etat, expire: Date.now() + DELAI_MFA_MS });

        return reponse.code(202).send({
          mfa_requis: true,
          jeton_mfa: jeton,
          message: 'Garmin demande un code de verification. Saisis-le pour terminer.',
        });
      }
      throw e;
    }
  });

  app.post('/api/garmin/mfa', async (requete) => {
    const corps = CorpsMfa.parse(requete.body);
    purger();

    const attente = attentesMfa.get(corps.jeton_mfa);
    if (attente === undefined) {
      throw new ErreurHttp(
        410,
        'Demande de verification expiree. Recommence la connexion Garmin.',
      );
    }

    const p = provider();
    const { nomAffichage } = await p.validerMfa(attente.etat, corps.code);
    attentesMfa.delete(corps.jeton_mfa);

    return { connecte: true, nom_affichage: nomAffichage };
  });

  app.delete('/api/garmin/connexion', async () => {
    await provider().deconnecter();
    return { connecte: false };
  });
}
