import type { IsoDate } from './modele.js';

const MS_JOUR = 86_400_000;

/** Parse une date `YYYY-MM-DD` en Date UTC a minuit. */
export function parseIso(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** Formate une Date en `YYYY-MM-DD` (composantes UTC). */
export function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** Ajoute n jours (n peut etre negatif). */
export function ajouterJours(iso: IsoDate, n: number): IsoDate {
  return toIso(new Date(parseIso(iso).getTime() + n * MS_JOUR));
}

/** Nombre de jours entre deux dates (b - a). */
export function diffJours(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / MS_JOUR);
}

/** Lundi de la semaine contenant `iso`. */
export function lundiDeLaSemaine(iso: IsoDate): IsoDate {
  const jour = parseIso(iso).getUTCDay(); // 0 = dimanche
  return ajouterJours(iso, jour === 0 ? -6 : -(jour - 1));
}

/**
 * Date du jour dans le fuseau local de la machine.
 *
 * Volontairement les composantes locales et non UTC : a 23 h a Paris en ete,
 * `toISOString()` renvoie deja le lendemain, et une seance faite le soir
 * apparaitrait au mauvais jour.
 */
export function aujourdhui(maintenant: Date = new Date()): IsoDate {
  const an = maintenant.getFullYear();
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0');
  const jour = String(maintenant.getDate()).padStart(2, '0');
  return `${an}-${mois}-${jour}`;
}
