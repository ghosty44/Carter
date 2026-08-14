import type { ReactNode } from 'react';
import { ErreurApi } from './api.js';

export function Message({
  type,
  children,
}: {
  type: 'erreur' | 'succes';
  children: ReactNode;
}) {
  return <div className={`message ${type}`}>{children}</div>;
}

/**
 * Affiche une erreur d'API avec le detail champ par champ quand le serveur
 * l'a fourni. Un « import refuse » sans dire quelle ligne pose probleme
 * oblige a deviner, ce qui est exactement ce que le brief demande d'eviter.
 */
export function ErreurAffichee({ erreur }: { erreur: unknown }) {
  if (erreur === null || erreur === undefined) return null;

  const message = erreur instanceof Error ? erreur.message : String(erreur);
  const lignes = erreur instanceof ErreurApi ? erreur.lignes : [];

  return (
    <Message type="erreur">
      <strong>{message}</strong>
      {lignes.length > 0 && (
        <ul>
          {lignes.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </Message>
  );
}

export function Chargement({ quoi }: { quoi: string }) {
  return <p className="doux">Chargement {quoi}…</p>;
}

/** Selecteur d'echelle (RPE 1-10, ressenti 1-5) en gros boutons tactiles. */
export function Echelle({
  min,
  max,
  valeur,
  onChange,
  legende,
}: {
  min: number;
  max: number;
  valeur: number | null;
  onChange: (v: number | null) => void;
  legende: string;
}) {
  const valeurs = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <span className="doux">{legende}</span>
      <div className="choix" style={{ marginTop: 4 }}>
        {valeurs.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={valeur === v}
            onClick={() => onChange(valeur === v ? null : v)}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

export function formatSecondes(s: number): string {
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

export function formatAllure(sParKm: number | null): string {
  if (sParKm === null) return '—';
  const m = Math.floor(sParKm / 60);
  const s = Math.round(sParKm % 60);
  return `${m}'${String(s).padStart(2, '0')}/km`;
}
