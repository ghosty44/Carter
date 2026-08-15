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
 * Affiche une erreur d'API avec son detail quand le serveur en a fourni.
 * Un echec sans indication oblige a deviner ; c'est ce qu'on veut eviter.
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
