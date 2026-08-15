import { useEffect, useState } from 'react';
import {
  LIBELLE_SPORT,
  estCourse,
  formatAllure,
  formatDate,
  formatDenivele,
  formatDistance,
  formatDuree,
  formatVitesse,
  type Activite,
} from '@carter/shared';
import { api } from '../api.js';
import { Chargement, ErreurAffichee } from '../composants.js';

export function VueSeances({ connecte }: { connecte: boolean }) {
  const [activites, setActivites] = useState<Activite[] | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const [limite, setLimite] = useState(50);

  useEffect(() => {
    api
      .activites(limite)
      .then((r) => setActivites(r.activites))
      .catch(setErreur);
  }, [limite]);

  if (erreur !== null) return <ErreurAffichee erreur={erreur} />;
  if (activites === null) return <Chargement quoi="des seances" />;

  if (activites.length === 0) {
    return (
      <>
        <h1>Séances</h1>
        <div className="carte">
          <p>Aucune séance en mémoire.</p>
          <p className="doux">
            {connecte
              ? 'Va dans l’onglet Compte et lance « Récupérer mes données ».'
              : 'Connecte ton compte Garmin depuis l’onglet Compte.'}
          </p>
        </div>
      </>
    );
  }

  // Regroupe par mois : sur une liste longue, c'est le repere naturel.
  const groupes = new Map<string, Activite[]>();
  for (const a of activites) {
    const clef = a.date.slice(0, 7);
    const liste = groupes.get(clef) ?? [];
    liste.push(a);
    groupes.set(clef, liste);
  }

  return (
    <>
      <h1>Séances</h1>
      <p className="doux">{activites.length} séances</p>

      {[...groupes.entries()].map(([mois, lot]) => (
        <section key={mois}>
          <h2>{libelleMois(mois)}</h2>
          {lot.map((a) => (
            <CarteSeance key={a.id} activite={a} />
          ))}
        </section>
      ))}

      {activites.length >= limite && (
        <button type="button" onClick={() => setLimite(limite + 100)}>
          Afficher plus
        </button>
      )}
    </>
  );
}

function CarteSeance({ activite }: { activite: Activite }) {
  const [ouvert, setOuvert] = useState(false);
  const course = estCourse(activite.sport);

  return (
    <div className={`carte seance sport-${activite.sport}`}>
      <div
        className="entete"
        role="button"
        tabIndex={0}
        onClick={() => setOuvert(!ouvert)}
        onKeyDown={(e) => e.key === 'Enter' && setOuvert(!ouvert)}
      >
        <div>
          <strong>{activite.nom || LIBELLE_SPORT[activite.sport]}</strong>
          <div className="doux">
            {formatDate(activite.date)}
            {activite.heure && ` · ${activite.heure}`}
          </div>
        </div>
        <span className="etiquette">{LIBELLE_SPORT[activite.sport]}</span>
      </div>

      <div className="mesures">
        <Mesure valeur={formatDuree(activite.duree_s)} legende="durée" />
        {activite.distance_m > 0 && (
          <Mesure valeur={formatDistance(activite.distance_m)} legende="distance" />
        )}
        {course && activite.allure_s_km !== null && (
          <Mesure valeur={formatAllure(activite.allure_s_km)} legende="allure" />
        )}
        {!course && activite.vitesse_kmh !== null && (
          <Mesure valeur={formatVitesse(activite.vitesse_kmh)} legende="vitesse" />
        )}
        {activite.denivele_m > 0 && (
          <Mesure valeur={formatDenivele(activite.denivele_m)} legende="dénivelé" />
        )}
        {activite.fc_moy !== null && (
          <Mesure valeur={`${activite.fc_moy} bpm`} legende="FC moy" />
        )}
      </div>

      {ouvert && (
        <div className="detail">
          <Ligne label="Temps en mouvement" valeur={formatDuree(activite.duree_s)} />
          <Ligne label="Temps écoulé" valeur={formatDuree(activite.duree_totale_s)} />
          {activite.fc_max !== null && (
            <Ligne label="FC max" valeur={`${activite.fc_max} bpm`} />
          )}
          {activite.denivele_negatif_m > 0 && (
            <Ligne label="Dénivelé négatif" valeur={`${Math.round(activite.denivele_negatif_m)} m`} />
          )}
          {activite.cadence_moy !== null && (
            <Ligne label="Cadence" valeur={`${activite.cadence_moy} /min`} />
          )}
          {activite.calories !== null && (
            <Ligne label="Calories" valeur={`${activite.calories} kcal`} />
          )}
          {activite.charge !== null && (
            <Ligne label="Charge d’entraînement" valeur={String(Math.round(activite.charge))} />
          )}
          <Ligne label="Type Garmin" valeur={activite.sport_garmin || '—'} />
        </div>
      )}
    </div>
  );
}

function Mesure({ valeur, legende }: { valeur: string; legende: string }) {
  return (
    <div className="mesure">
      <div className="valeur">{valeur}</div>
      <div className="legende">{legende}</div>
    </div>
  );
}

function Ligne({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="ligne">
      <span className="doux">{label}</span>
      <span>{valeur}</span>
    </div>
  );
}

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function libelleMois(clef: string): string {
  const [an, mois] = clef.split('-');
  return `${MOIS[Number(mois) - 1]} ${an}`;
}
