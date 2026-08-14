import {
  ajouterJours,
  formatDuree,
  seancesPlanifiees,
  type IsoDate,
  type Plan,
  type SeancePlanifiee,
  type TypeSeance,
} from '@carter/shared';

export interface OptionsIcs {
  /** Filtre optionnel sur la periode. */
  debut?: IsoDate;
  fin?: IsoDate;
  types?: readonly TypeSeance[];
  /** Prefixe du resume, pour reperer les evenements Carter dans un agenda. */
  prefixe?: string;
  /** Injectable pour rendre la sortie deterministe dans les tests. */
  horodatage?: string;
}

/**
 * Export iCalendar du plan.
 *
 * Evenements journee entiere : une seance d'entrainement n'a pas d'heure fixe,
 * et un evenement horaire force un choix arbitraire qui se retrouve faux des
 * la premiere sortie decalee. La duree prevue est dans le titre.
 *
 * Cet export ne depend d'aucune API : c'est le filet de securite qui rend
 * l'app utile meme sans provider configure.
 */
export function exporterIcs(plan: Plan, options: OptionsIcs = {}): string {
  const horodatage = options.horodatage ?? formatHorodatageIcs(new Date());
  const types = options.types ? new Set(options.types) : null;

  const lignes: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Carter//Plan trail//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${echapper(plan.nom)}`,
  ];

  for (const p of seancesPlanifiees(plan)) {
    if (p.seance.type === 'REPOS') continue;
    if (types !== null && !types.has(p.seance.type)) continue;
    if (options.debut !== undefined && p.date < options.debut) continue;
    if (options.fin !== undefined && p.date > options.fin) continue;

    lignes.push(...evenement(p, plan, horodatage, options.prefixe ?? ''));
  }

  for (const course of plan.courses) {
    lignes.push(
      'BEGIN:VEVENT',
      `UID:carter-course-${course.id}@carter.local`,
      `DTSTAMP:${horodatage}`,
      `DTSTART;VALUE=DATE:${compact(course.date)}`,
      `DTEND;VALUE=DATE:${compact(ajouterJours(course.date, 1))}`,
      `SUMMARY:${echapper(`Course ${course.priorite} — ${course.nom}`)}`,
      `DESCRIPTION:${echapper(`${course.distance_km} km, ${course.denivele_m} m D+`)}`,
      'CATEGORIES:COURSE',
      'END:VEVENT',
    );
  }

  lignes.push('END:VCALENDAR');
  return lignes.map(plier).join('\r\n') + '\r\n';
}

function evenement(
  p: SeancePlanifiee,
  plan: Plan,
  horodatage: string,
  prefixe: string,
): string[] {
  const titre = `${prefixe}${prefixe ? ' ' : ''}${p.seance.titre}`;
  const details = [
    `Semaine ${p.semaine.numero_global} (${p.semaine.type}) — ${p.bloc.nom}`,
    `Duree prevue : ${formatDuree(p.seance.duree_min)}`,
    p.seance.distance_km ? `Distance : ${p.seance.distance_km} km` : null,
    p.seance.denivele_m ? `Denivele : ${p.seance.denivele_m} m D+` : null,
    `Intensite : ${p.seance.intensite}`,
    '',
    p.seance.consignes,
    p.semaine.note_coach ? `\nNote de la semaine : ${p.semaine.note_coach}` : null,
  ]
    .filter((l) => l !== null)
    .join('\n');

  return [
    'BEGIN:VEVENT',
    `UID:carter-${plan.id}-${p.seance.id}@carter.local`,
    `DTSTAMP:${horodatage}`,
    `DTSTART;VALUE=DATE:${compact(p.date)}`,
    `DTEND;VALUE=DATE:${compact(ajouterJours(p.date, 1))}`,
    `SUMMARY:${echapper(titre)}`,
    `DESCRIPTION:${echapper(details)}`,
    `CATEGORIES:${p.seance.type}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
}

function compact(iso: IsoDate): string {
  return iso.replace(/-/g, '');
}

function formatHorodatageIcs(d: Date): string {
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** Echappement RFC 5545 : antislash, point-virgule, virgule, retour ligne. */
function echapper(texte: string): string {
  return texte
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Pliage RFC 5545 : 75 octets par ligne, continuation prefixee d'une espace.
 * Le decompte se fait en octets et non en caracteres, sinon un accent en fin
 * de ligne se retrouve coupe en deux et le fichier devient illisible.
 */
function plier(ligne: string): string {
  const encodeur = new TextEncoder();
  if (encodeur.encode(ligne).length <= 75) return ligne;

  const morceaux: string[] = [];
  let courant = '';
  let octets = 0;
  let limite = 75;

  for (const caractere of ligne) {
    const taille = encodeur.encode(caractere).length;
    if (octets + taille > limite) {
      morceaux.push(courant);
      courant = caractere;
      octets = taille + 1; // l'espace de continuation compte
      limite = 75;
    } else {
      courant += caractere;
      octets += taille;
    }
  }
  if (courant.length > 0) morceaux.push(courant);

  return morceaux.join('\r\n ');
}
