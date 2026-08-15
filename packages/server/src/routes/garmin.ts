import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ajouterJours, aujourdhui } from '@carter/shared';
import { MfaRequis, type EtatMfa } from '../garmin/sso.js';
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
 * Pas en base : ils contiennent des cookies SSO a usage unique, sans valeur
 * passe le delai. Sur une instance froide l'etat est perdu et l'utilisateur
 * recommence — acceptable pour une operation faite une fois par an.
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
  app.get('/api/garmin', async () => ({ garmin: await ctx.garmin.etat() }));

  /**
   * Connexion.
   *
   * Le mot de passe traverse cette route et n'est jamais conserve : ni en
   * base, ni en journal, ni dans la reponse.
   */
  app.post('/api/garmin/connexion', async (requete, reponse) => {
    const corps = CorpsConnexion.parse(requete.body);

    try {
      const nom = await ctx.garmin.connecter(corps.identifiant, corps.mot_de_passe);
      return { connecte: true, nom_affichage: nom };
    } catch (e) {
      if (e instanceof MfaRequis) {
        purger();
        const jeton = randomBytes(18).toString('base64url');
        attentesMfa.set(jeton, { etat: e.etat, expire: Date.now() + DELAI_MFA_MS });

        return reponse.code(202).send({
          mfa_requis: true,
          jeton_mfa: jeton,
          message: 'Garmin demande un code de verification.',
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
      throw new ErreurHttp(410, 'Demande expiree. Recommence la connexion Garmin.');
    }

    const nom = await ctx.garmin.validerMfa(attente.etat, corps.code);
    attentesMfa.delete(corps.jeton_mfa);

    return { connecte: true, nom_affichage: nom };
  });

  app.delete('/api/garmin/connexion', async () => {
    await ctx.garmin.deconnecter();
    return { connecte: false };
  });

  /**
   * Recupere activites et forme depuis Garmin, puis les met en cache.
   *
   * Le cache evite de rappeler Garmin a chaque affichage : c'est lent, et
   * marteler une API non officielle est le meilleur moyen de se faire
   * remarquer. Tous les ecrans lisent la base, jamais Garmin directement.
   */
  app.post('/api/garmin/recuperer', async (requete) => {
    const Corps = z
      .object({
        /** Vrai pour tout recharger, faux pour ne prendre que la suite. */
        complet: z.boolean().default(false),
      })
      .default({ complet: false });
    const corps = Corps.parse(requete.body ?? {});

    const today = aujourdhui();

    // Increment : on repart de l'avant-derniere semaine connue, parce qu'une
    // activite peut etre renommee ou corrigee apres coup.
    const derniere = corps.complet ? null : await ctx.activites.derniereDate();
    const depuis = derniere === null ? undefined : ajouterJours(derniere, -14);

    const activites = await ctx.garmin.activites(ctx.config.GARMIN_LIMITE_ACTIVITES, depuis);
    const nbActivites = await ctx.activites.enregistrerLot(activites);

    const debutWellness = ajouterJours(today, -(ctx.config.GARMIN_JOURS_WELLNESS - 1));
    const wellness = await ctx.garmin.wellness(debutWellness, today);
    const nbWellness = await ctx.wellness.enregistrerLot(wellness);

    await ctx.garmin.marquerSynchro();

    return {
      activites: nbActivites,
      wellness: nbWellness,
      total_en_cache: await ctx.activites.compter(),
    };
  });
}
