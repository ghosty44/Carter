import { createHmac, randomBytes } from 'node:crypto';

/**
 * Signature OAuth 1.0a (HMAC-SHA1).
 *
 * L'echange de jetons Garmin passe encore par OAuth 1, et aucune dependance
 * maintenue ne fait uniquement ca. L'algorithme tient en quarante lignes et
 * est fige depuis 2010 ; l'implementer evite d'ajouter une dependance de plus
 * dans un chemin deja fragile.
 */

export interface Consommateur {
  consumer_key: string;
  consumer_secret: string;
}

export interface JetonOAuth1 {
  oauth_token: string;
  oauth_token_secret: string;
}

/**
 * Encodage percent selon la RFC 5849 section 3.6.
 *
 * Plus strict que `encodeURIComponent`, qui laisse passer `!`, `'`, `(`, `)`
 * et `*`. Seuls les caracteres non reserves de la RFC 3986 restent en clair :
 * lettres, chiffres, `-`, `.`, `_` et `~`.
 */
export function encoder(valeur: string): string {
  return encodeURIComponent(valeur).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export interface OptionsSignature {
  /** Parametres OAuth supplementaires (oauth_callback, oauth_verifier...). */
  extra?: Record<string, string>;
  /** Injectables pour rendre la signature reproductible en test. */
  nonce?: string;
  timestamp?: string;
  /** Omet `oauth_version`, absent de certains vecteurs de reference. */
  sansVersion?: boolean;
}

/**
 * Construit l'en-tete `Authorization: OAuth ...` pour une requete.
 *
 * `url` doit etre l'URL complete : ses parametres de requete entrent dans la
 * signature, et les oublier est l'erreur classique de toute implementation
 * OAuth 1.
 */
export function enteteOAuth1(
  methode: string,
  url: string,
  consommateur: Consommateur,
  jeton?: JetonOAuth1,
  options: OptionsSignature = {},
): string {
  const cible = new URL(url);

  const parametresOAuth: Record<string, string> = {
    oauth_consumer_key: consommateur.consumer_key,
    oauth_nonce: options.nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: options.timestamp ?? Math.floor(Date.now() / 1000).toString(),
    ...(options.sansVersion === true ? {} : { oauth_version: '1.0' }),
    ...(options.extra ?? {}),
  };
  if (jeton !== undefined) parametresOAuth.oauth_token = jeton.oauth_token;

  // Tous les parametres, y compris ceux de la query string, tries.
  const tous: [string, string][] = [
    ...Object.entries(parametresOAuth),
    ...[...cible.searchParams.entries()],
  ];

  const normalises = tous
    .map(([c, v]) => [encoder(c), encoder(v)] as [string, string])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([c, v]) => `${c}=${v}`)
    .join('&');

  const baseSignature = chaineDeSignature(methode, cible, normalises);

  const clef = `${encoder(consommateur.consumer_secret)}&${encoder(
    jeton?.oauth_token_secret ?? '',
  )}`;

  const signature = createHmac('sha1', clef).update(baseSignature).digest('base64');

  const entete = { ...parametresOAuth, oauth_signature: signature };

  return `OAuth ${Object.entries(entete)
    .map(([c, v]) => `${encoder(c)}="${encoder(v)}"`)
    .join(', ')}`;
}

/**
 * Chaine de signature, RFC 5849 section 3.4.1.
 *
 * L'URL de base exclut la query string et le fragment. `URL.origin` met deja
 * le schema et l'hote en minuscules et retire le port par defaut, ce que la
 * norme exige.
 */
export function chaineDeSignature(
  methode: string,
  cible: URL,
  parametresNormalises: string,
): string {
  return [
    methode.toUpperCase(),
    encoder(`${cible.origin}${cible.pathname}`),
    encoder(parametresNormalises),
  ].join('&');
}

/** Parse une reponse `application/x-www-form-urlencoded`. */
export function parserFormulaire(corps: string): Record<string, string> {
  const resultat: Record<string, string> = {};
  for (const [c, v] of new URLSearchParams(corps).entries()) resultat[c] = v;
  return resultat;
}
