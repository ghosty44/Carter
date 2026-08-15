import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/**
 * Chiffrement au repos des jetons de session Garmin.
 *
 * Ces jetons donnent un acces complet en lecture au compte Garmin Connect :
 * activites, sommeil, frequence cardiaque, position des sorties. Les laisser
 * en clair dans la base reviendrait a ce qu'une fuite de la base soit une
 * fuite du compte.
 *
 * AES-256-GCM : chiffre et authentifie. Un enregistrement modifie est rejete
 * au dechiffrement au lieu d'etre interprete.
 *
 * La clef derive de `SESSION_SECRET`. Consequence a connaitre : changer
 * `SESSION_SECRET` rend les jetons illisibles, et il faut se reconnecter a
 * Garmin. C'est le comportement voulu — un secret change est un secret qu'on
 * suppose compromis.
 */

const ALGO = 'aes-256-gcm';
const SEL = 'carter-jetons-v1';

function derivierClef(secret: string): Buffer {
  return scryptSync(secret, SEL, 32);
}

export function chiffrer(valeur: string, secret: string): string {
  const clef = derivierClef(secret);
  const iv = randomBytes(12);
  const chiffreur = createCipheriv(ALGO, clef, iv);

  const donnees = Buffer.concat([chiffreur.update(valeur, 'utf8'), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();

  // iv.tag.donnees, en base64url pour rester lisible dans une colonne texte.
  return [iv, tag, donnees].map((b) => b.toString('base64url')).join('.');
}

export function dechiffrer(charge: string, secret: string): string {
  const morceaux = charge.split('.');
  if (morceaux.length !== 3) {
    throw new Error('Jetons illisibles : format inattendu.');
  }

  const [iv, tag, donnees] = morceaux.map((m) => Buffer.from(m, 'base64url')) as [
    Buffer,
    Buffer,
    Buffer,
  ];

  const dechiffreur = createDecipheriv(ALGO, derivierClef(secret), iv);
  dechiffreur.setAuthTag(tag);

  try {
    return Buffer.concat([dechiffreur.update(donnees), dechiffreur.final()]).toString('utf8');
  } catch {
    throw new Error(
      "Jetons Garmin indechiffrables. SESSION_SECRET a probablement change : reconnecte-toi a Garmin depuis l'app.",
    );
  }
}
