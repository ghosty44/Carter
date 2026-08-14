import {
  nomJour,
  seancesPlanifiees,
  type Plan,
  type SeanceRealisee,
} from '@carter/shared';

/**
 * Echappement CSV. Une consigne de renforcement contient des points-virgules,
 * des virgules et des retours a la ligne : sans guillemets, le fichier casse
 * des la premiere ouverture dans un tableur.
 */
function champ(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return '';
  const texte = String(valeur);
  if (/[",\n\r]/.test(texte)) {
    return `"${texte.replace(/"/g, '""')}"`;
  }
  return texte;
}

function ligne(cellules: unknown[]): string {
  return cellules.map(champ).join(',');
}

/** Le plan, une ligne par seance. */
export function exporterPlanCsv(plan: Plan): string {
  const lignes = [
    ligne([
      'bloc_numero',
      'bloc_nom',
      'semaine_globale',
      'semaine_type',
      'date',
      'jour',
      'ordre',
      'type',
      'titre',
      'duree_min',
      'distance_km',
      'denivele_m',
      'intensite',
      'consignes',
    ]),
  ];

  for (const p of seancesPlanifiees(plan)) {
    lignes.push(
      ligne([
        p.bloc.numero,
        p.bloc.nom,
        p.semaine.numero_global,
        p.semaine.type,
        p.date,
        nomJour(p.seance.jour_offset),
        p.seance.ordre_dans_journee,
        p.seance.type,
        p.seance.titre,
        p.seance.duree_min,
        p.seance.distance_km ?? '',
        p.seance.denivele_m ?? '',
        p.seance.intensite,
        p.seance.consignes,
      ]),
    );
  }

  // BOM UTF-8 : sans lui, Excel affiche les accents en mojibake.
  return `﻿${lignes.join('\r\n')}\r\n`;
}

/** Les seances realisees, une ligne chacune. */
export function exporterRealiseCsv(realisees: SeanceRealisee[]): string {
  const lignes = [
    ligne([
      'date',
      'source',
      'seance_id',
      'nom',
      'type_sport',
      'duree_s',
      'distance_m',
      'denivele_m',
      'fc_moy',
      'fc_max',
      'allure_moy_s_km',
      'allure_gap_s_km',
      'rpe',
      'ressenti',
      'douleurs',
      'commentaire',
    ]),
  ];

  for (const r of [...realisees].sort((a, b) => a.date.localeCompare(b.date))) {
    lignes.push(
      ligne([
        r.date,
        r.source,
        r.seance_id ?? '',
        r.nom,
        r.type_sport,
        r.duree_s,
        Math.round(r.distance_m),
        Math.round(r.denivele_m),
        r.fc_moy ?? '',
        r.fc_max ?? '',
        r.allure_moy_s_km === null ? '' : Math.round(r.allure_moy_s_km),
        r.allure_gap_s_km === null ? '' : Math.round(r.allure_gap_s_km),
        r.rpe ?? '',
        r.ressenti ?? '',
        r.douleurs.map((d) => `${d.zone} ${d.intensite}/10`).join(' | '),
        r.commentaire,
      ]),
    );
  }

  return `﻿${lignes.join('\r\n')}\r\n`;
}
