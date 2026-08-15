import type { Activite, Sport } from '@carter/shared';

/** Active de test, avec des valeurs par defaut plausibles. */
export function activite(
  id: string,
  date: string,
  options: Partial<Activite> = {},
): Activite {
  return {
    id,
    date,
    heure: '18:00',
    nom: 'Séance',
    sport: 'COURSE' as Sport,
    sport_garmin: 'running',
    duree_s: 1800,
    duree_totale_s: 1850,
    distance_m: 5000,
    denivele_m: 40,
    denivele_negatif_m: 40,
    fc_moy: 142,
    fc_max: 158,
    allure_s_km: 360,
    vitesse_kmh: null,
    calories: 350,
    cadence_moy: 172,
    rpe: null,
    charge: null,
    ...options,
  };
}
