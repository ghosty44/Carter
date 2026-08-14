/**
 * Hash de contenu deterministe, en JavaScript pur.
 *
 * Volontairement sans `node:crypto` ni `SubtleCrypto` : ce module est importe
 * par le serveur ET par le navigateur, et le hash doit pouvoir se calculer de
 * facon synchrone des deux cotes pour que l'apercu de synchro soit instantane.
 *
 * Il ne s'agit pas d'un usage cryptographique : le hash sert uniquement a
 * repondre a « ce contenu a-t-il change depuis la derniere synchro ». Deux
 * FNV-1a avec des graines differentes donnent 128 bits, ce qui rend une
 * collision accidentelle sans consequence pratique a cette echelle.
 */

const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x01000193;
const PRIME = 0x01000193;

function fnv1a(texte: string, graine: number): number {
  let h = graine >>> 0;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i) & 0xff;
    h = Math.imul(h, PRIME) >>> 0;
    h ^= texte.charCodeAt(i) >>> 8;
    h = Math.imul(h, PRIME) >>> 0;
  }
  return h >>> 0;
}

/** Hash hexadecimal stable d'une chaine (16 caracteres). */
export function hashTexte(texte: string): string {
  const a = fnv1a(texte, OFFSET_A);
  const b = fnv1a(texte, OFFSET_B);
  const c = fnv1a(`${texte}#${texte.length}`, a ^ b);
  return (
    a.toString(16).padStart(8, '0') +
    (b ^ c).toString(16).padStart(8, '0')
  );
}

/**
 * Serialisation canonique : cles triees, `undefined` et `null` omis.
 * Garantit que deux objets equivalents produisent la meme chaine quel que
 * soit l'ordre d'insertion des cles.
 */
export function canonique(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  if (Array.isArray(valeur)) {
    return `[${valeur.map(canonique).join(',')}]`;
  }
  if (typeof valeur === 'object') {
    const entrees = Object.entries(valeur as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entrees.map(([k, v]) => `${k}:${canonique(v)}`).join(',')}}`;
  }
  return String(valeur);
}

/** Hash canonique d'une valeur structuree. */
export function hashValeur(valeur: unknown): string {
  return hashTexte(canonique(valeur));
}
