import type { IsoDate } from './plan.js';

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
  const recul = jour === 0 ? 6 : jour - 1;
  return ajouterJours(iso, -recul);
}

/** Date du jour dans le fuseau local de la machine, au format `YYYY-MM-DD`. */
export function aujourdhui(maintenant: Date = new Date()): IsoDate {
  const an = maintenant.getFullYear();
  const mois = String(maintenant.getMonth() + 1).padStart(2, '0');
  const jour = String(maintenant.getDate()).padStart(2, '0');
  return `${an}-${mois}-${jour}`;
}

const JOURS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** Nom du jour a partir d'un offset 0 = lundi. */
export function nomJour(offset: number): string {
  return JOURS_FR[offset] ?? `jour ${offset}`;
}

/** Formate une duree en minutes vers `1h40` ou `45 min`. */
export function formatDuree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}
