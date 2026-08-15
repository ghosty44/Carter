import type { IsoDate } from './modele.js';

/** `1h40`, `45 min`, `—` si nul. */
export function formatDuree(secondes: number): string {
  if (secondes <= 0) return '—';
  const minutes = Math.round(secondes / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/** `12,4 km`. Une decimale suffit : le GPS n'est pas plus precis. */
export function formatDistance(metres: number): string {
  if (metres <= 0) return '—';
  return `${(metres / 1000).toFixed(1).replace('.', ',')} km`;
}

/** `5'42/km`. */
export function formatAllure(secondesParKm: number | null): string {
  if (secondesParKm === null || secondesParKm <= 0) return '—';
  const m = Math.floor(secondesParKm / 60);
  const s = Math.round(secondesParKm % 60);
  // 59,6 s doit donner 6'00 et non 5'60.
  if (s === 60) return `${m + 1}'00/km`;
  return `${m}'${String(s).padStart(2, '0')}/km`;
}

export function formatVitesse(kmh: number | null): string {
  return kmh === null || kmh <= 0 ? '—' : `${kmh.toFixed(1).replace('.', ',')} km/h`;
}

export function formatDenivele(metres: number): string {
  return metres <= 0 ? '—' : `${Math.round(metres)} m D+`;
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** `mardi 3 mars`. */
export function formatDate(iso: IsoDate): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** `3 mars`, sans le jour de la semaine. */
export function formatDateCourte(iso: IsoDate): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** `3 mars – 9 mars`. */
export function formatPeriode(debut: IsoDate, fin: IsoDate): string {
  return `${formatDateCourte(debut)} – ${formatDateCourte(fin)}`;
}

/** `7 h 30`, pour le sommeil. */
export function formatHeures(heures: number | null): string {
  if (heures === null || heures <= 0) return '—';
  const h = Math.floor(heures);
  const m = Math.round((heures - h) * 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
