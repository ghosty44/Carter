import { z } from 'zod';
import { ErreurProvider } from './types.js';
import {
  enteteOAuth1,
  parserFormulaire,
  type Consommateur,
  type JetonOAuth1,
} from './garmin-direct-oauth.js';

/**
 * =========================================================================
 *  CONNEXION AU COMPTE GARMIN CONNECT — PARTIE NON VERIFIABLE HORS LIGNE
 * =========================================================================
 *
 * Reproduit la sequence d'authentification de l'application mobile Garmin
 * Connect : login SSO, recuperation d'un ticket de service, echange contre un
 * jeton OAuth 1, puis contre un jeton OAuth 2 utilise pour les appels d'API.
 *
 * CE FICHIER N'A PAS PU ETRE TESTE CONTRE GARMIN. L'environnement de
 * developpement n'a pas d'acces reseau vers `sso.garmin.com`. La sequence
 * suit la methode publiquement documentee (celle de `garth`), mais les
 * details — noms de champs du formulaire, forme exacte des redirections —
 * doivent etre confrontes au comportement reel a la premiere connexion.
 *
 * C'est aussi la partie qui casse quand Garmin modifie son SSO. Tout le reste
 * de l'adaptateur ne depend que du jeton produit ici : une reparation se
 * limite a ce fichier.
 *
 * Le mot de passe n'est utilise que dans `connecter()` et n'est jamais
 * conserve, ni en base, ni en journal.
 */

const SSO = 'https://sso.garmin.com/sso';
const API = 'https://connectapi.garmin.com';

/**
 * L'application mobile signe ses echanges avec un couple consommateur public.
 * Garmin le fait tourner ; on le recupere donc a la volee plutot que de le
 * figer dans le code.
 */
const URL_CONSOMMATEUR = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json';

/** En-tete de l'app mobile : le SSO refuse un User-Agent de navigateur nu. */
const UA_MOBILE = 'com.garmin.android.apps.connectmobile';
const UA_NAVIGATEUR =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

export const JetonsSchema = z.object({
  oauth1: z.object({
    oauth_token: z.string(),
    oauth_token_secret: z.string(),
  }),
  oauth2: z.object({
    access_token: z.string(),
    refresh_token: z.string(),
    /** Horodatage d'expiration, en millisecondes. */
    expire_le: z.number(),
  }),
});
export type Jetons = z.infer<typeof JetonsSchema>;

export class MfaRequis extends Error {
  constructor(
    /** Etat a renvoyer avec le code, pour reprendre la sequence. */
    readonly etat: EtatMfa,
  ) {
    super('Code de verification Garmin requis.');
    this.name = 'MfaRequis';
  }
}

export interface EtatMfa {
  cookies: string;
  csrf: string;
  urlSignin: string;
}

interface OptionsSso {
  fetch?: typeof globalThis.fetch;
  /** Injectable pour les tests. */
  urlConsommateur?: string;
}

/** Accumulateur de cookies : le SSO en depose plusieurs au fil des redirections. */
class BocalCookies {
  private readonly cookies = new Map<string, string>();

  absorber(reponse: Response): void {
    const entetes = reponse.headers.getSetCookie?.() ?? [];
    for (const brut of entetes) {
      const paire = brut.split(';')[0];
      if (paire === undefined) continue;
      const index = paire.indexOf('=');
      if (index <= 0) continue;
      this.cookies.set(paire.slice(0, index).trim(), paire.slice(index + 1).trim());
    }
  }

  entete(): string {
    return [...this.cookies.entries()].map(([c, v]) => `${c}=${v}`).join('; ');
  }

  charger(entete: string): void {
    for (const paire of entete.split(';')) {
      const index = paire.indexOf('=');
      if (index <= 0) continue;
      this.cookies.set(paire.slice(0, index).trim(), paire.slice(index + 1).trim());
    }
  }
}

const PARAMS_SIGNIN = new URLSearchParams({
  id: 'gauthWidget',
  embedWidget: 'true',
  gauthHost: SSO,
  service: `${SSO}/embed`,
  source: `${SSO}/embed`,
  redirectAfterAccountLoginUrl: `${SSO}/embed`,
  redirectAfterAccountCreationUrl: `${SSO}/embed`,
});

export class SessionGarminSso {
  private readonly fetch: typeof globalThis.fetch;
  private readonly urlConsommateur: string;

  constructor(options: OptionsSso = {}) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.urlConsommateur = options.urlConsommateur ?? URL_CONSOMMATEUR;
  }

  /**
   * Connexion complete.
   *
   * Leve `MfaRequis` si Garmin demande un code : l'appelant collecte le code
   * aupres de l'utilisateur puis appelle `validerMfa()` avec l'etat fourni.
   */
  async connecter(identifiant: string, motDePasse: string): Promise<Jetons> {
    const bocal = new BocalCookies();
    const urlSignin = `${SSO}/signin?${PARAMS_SIGNIN.toString()}`;

    // 1. Poser les cookies et recuperer le jeton anti-CSRF.
    const page = await this.appeler(urlSignin, {
      headers: { 'User-Agent': UA_NAVIGATEUR },
    });
    bocal.absorber(page);

    if (!page.ok) {
      throw new ErreurProvider(interception(page.status), page.status);
    }

    const csrf = extraireCsrf(await page.text());
    if (csrf === '') {
      // Page servie, mais pas celle attendue : filtrage reseau ou page
      // d'interstitiel anti-bot. Distinguer ce cas du « formulaire modifie »
      // evite de partir chercher un bug qui n'existe pas.
      throw new ErreurProvider(
        "Page de connexion Garmin inexploitable : aucun jeton anti-CSRF trouve.\n" +
          interception(page.status),
        page.status,
      );
    }

    // 2. Soumettre les identifiants.
    const reponse = await this.appeler(urlSignin, {
      method: 'POST',
      headers: {
        'User-Agent': UA_NAVIGATEUR,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: urlSignin,
        Cookie: bocal.entete(),
      },
      body: new URLSearchParams({
        username: identifiant,
        password: motDePasse,
        embed: 'true',
        _csrf: csrf,
      }).toString(),
      redirect: 'manual',
    });
    bocal.absorber(reponse);
    const html = await reponse.text();

    if (html.includes('verifyMFA') || html.includes('mfa-code')) {
      throw new MfaRequis({
        cookies: bocal.entete(),
        csrf: extraireCsrf(html) || csrf,
        urlSignin,
      });
    }

    const ticket = extraireTicket(html);
    if (ticket === null) {
      throw new ErreurProvider(
        identifiantsProbablementFaux(html)
          ? 'Identifiant ou mot de passe Garmin refuse.'
          : "Garmin n'a pas renvoye de ticket de service. Le formulaire de connexion a probablement change : voir garmin-direct-sso.ts.",
        401,
      );
    }

    return this.echangerTicket(ticket);
  }

  /** Seconde etape quand un code de verification est demande. */
  async validerMfa(etat: EtatMfa, code: string): Promise<Jetons> {
    const bocal = new BocalCookies();
    bocal.charger(etat.cookies);

    const url = `${SSO}/verifyMFA/loginEnterMfaCode?${PARAMS_SIGNIN.toString()}`;
    const reponse = await this.appeler(url, {
      method: 'POST',
      headers: {
        'User-Agent': UA_NAVIGATEUR,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: etat.urlSignin,
        Cookie: bocal.entete(),
      },
      body: new URLSearchParams({
        'mfa-code': code,
        embed: 'true',
        fromPage: 'setupEnterMfaCode',
        _csrf: etat.csrf,
      }).toString(),
      redirect: 'manual',
    });
    bocal.absorber(reponse);

    const ticket = extraireTicket(await reponse.text());
    if (ticket === null) {
      throw new ErreurProvider('Code de verification Garmin refuse.', 401);
    }

    return this.echangerTicket(ticket);
  }

  /**
   * Rafraichit le jeton OAuth 2 a partir du jeton OAuth 1.
   *
   * Le jeton OAuth 1 vit environ un an ; le jeton OAuth 2 quelques heures.
   * C'est ce qui evite de redemander le mot de passe a chaque session.
   */
  async rafraichir(oauth1: JetonOAuth1): Promise<Jetons['oauth2']> {
    const consommateur = await this.consommateur();
    const url = `${API}/oauth-service/oauth/exchange/user/2.0`;

    const reponse = await this.appeler(url, {
      method: 'POST',
      headers: {
        Authorization: enteteOAuth1('POST', url, consommateur, oauth1),
        'User-Agent': UA_MOBILE,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: '',
    });

    if (!reponse.ok) {
      throw new ErreurProvider(
        `Rafraichissement du jeton Garmin refuse (${reponse.status}). Reconnecte-toi depuis l'app.`,
        reponse.status,
      );
    }

    const corps = (await reponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!corps.access_token) {
      throw new ErreurProvider("Garmin n'a pas renvoye de jeton d'acces.", null);
    }

    return {
      access_token: corps.access_token,
      refresh_token: corps.refresh_token ?? '',
      // Marge de 5 minutes : on prefere rafraichir un peu tot que rater un appel.
      expire_le: Date.now() + Math.max(0, (corps.expires_in ?? 3600) - 300) * 1000,
    };
  }

  /** Ticket de service -> jeton OAuth 1 -> jeton OAuth 2. */
  private async echangerTicket(ticket: string): Promise<Jetons> {
    const consommateur = await this.consommateur();

    const urlPre = `${API}/oauth-service/oauth/preauthorized?${new URLSearchParams({
      ticket,
      'login-url': `${SSO}/embed`,
      'accepts-mfa-tokens': 'true',
    }).toString()}`;

    const reponsePre = await this.appeler(urlPre, {
      headers: {
        Authorization: enteteOAuth1('GET', urlPre, consommateur),
        'User-Agent': UA_MOBILE,
      },
    });

    if (!reponsePre.ok) {
      throw new ErreurProvider(
        `Garmin a refuse l'echange du ticket (${reponsePre.status}).`,
        reponsePre.status,
      );
    }

    const champs = parserFormulaire(await reponsePre.text());
    const oauth1: JetonOAuth1 = {
      oauth_token: champs.oauth_token ?? '',
      oauth_token_secret: champs.oauth_token_secret ?? '',
    };

    if (oauth1.oauth_token === '') {
      throw new ErreurProvider("Garmin n'a pas renvoye de jeton OAuth 1.", null);
    }

    return { oauth1, oauth2: await this.rafraichir(oauth1) };
  }

  private consommateurCache: Consommateur | null = null;

  private async consommateur(): Promise<Consommateur> {
    if (this.consommateurCache !== null) return this.consommateurCache;

    const reponse = await this.appeler(this.urlConsommateur);
    if (!reponse.ok) {
      throw new ErreurProvider(
        "Impossible de recuperer les clefs consommateur de l'app mobile Garmin.",
        reponse.status,
      );
    }

    this.consommateurCache = (await reponse.json()) as Consommateur;
    return this.consommateurCache;
  }

  private async appeler(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetch(url, init);
    } catch (e) {
      throw new ErreurProvider(
        `Garmin injoignable : ${e instanceof Error ? e.message : String(e)}`,
        null,
      );
    }
  }
}

function extraireCsrf(html: string): string {
  const m =
    /name="_csrf"\s+value="([^"]+)"/.exec(html) ??
    /"_csrf"\s*:\s*"([^"]+)"/.exec(html);
  return m?.[1] ?? '';
}

function extraireTicket(html: string): string | null {
  return /embed\?ticket=([^"']+)["']/.exec(html)?.[1] ?? null;
}

function identifiantsProbablementFaux(html: string): boolean {
  return /invalid|incorrect|locked|error/i.test(html);
}

/**
 * Message pour le cas ou la reponse ne vient pas de Garmin.
 *
 * C'est le mode de panne le plus probable en production : protection anti-bot
 * devant le SSO, ou filtrage sortant de l'hebergeur. Le dire explicitement
 * evite de chercher une regression dans le code alors que la requete n'est
 * jamais arrivee.
 */
function interception(statut: number): string {
  return (
    `Garmin a repondu ${statut} au lieu du formulaire de connexion. ` +
    "Les causes habituelles, dans l'ordre : l'app tourne sur un hebergeur cloud et la " +
    'protection anti-bot de Garmin bloque les IP de datacenter ; le reseau sortant filtre ' +
    'Garmin ; ou le SSO a change. Depuis une connexion domestique, ce chemin passe ' +
    'generalement. Voir le README, section « Garmin direct ».'
  );
}
