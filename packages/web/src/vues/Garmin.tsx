import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErreurAffichee, Message } from '../composants.js';

type Etat = { connecte: boolean; nomAffichage: string | null; active: boolean };

/**
 * Connexion au compte Garmin Connect.
 *
 * Le mot de passe est envoye au backend, utilise une seule fois pour obtenir
 * les jetons, et jamais conserve. Il n'est pas non plus garde dans l'etat du
 * composant apres l'envoi.
 */
export function PanneauGarmin({ onConnecte }: { onConnecte: () => void }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [jetonMfa, setJetonMfa] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    api
      .garminEtat()
      .then((r) => setEtat(r.garmin))
      .catch(() => setEtat(null));
  }, []);

  async function connecter(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    setInfo(null);
    try {
      const r = await api.garminConnexion(identifiant, motDePasse);
      setMotDePasse(''); // ne pas le garder en memoire une fois envoye

      if (r.mfa_requis === true && r.jeton_mfa) {
        setJetonMfa(r.jeton_mfa);
        setInfo(r.message ?? 'Code de verification demande par Garmin.');
        return;
      }

      setEtat({ connecte: true, nomAffichage: r.nom_affichage ?? null, active: true });
      setInfo('Compte Garmin connecte.');
      onConnecte();
    } catch (err) {
      setErreur(err);
    } finally {
      setOccupe(false);
    }
  }

  async function validerCode(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (jetonMfa === null) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await api.garminMfa(jetonMfa, code.trim());
      setJetonMfa(null);
      setCode('');
      setEtat({ connecte: true, nomAffichage: r.nom_affichage, active: true });
      setInfo('Compte Garmin connecte.');
      onConnecte();
    } catch (err) {
      setErreur(err);
    } finally {
      setOccupe(false);
    }
  }

  async function deconnecter(): Promise<void> {
    if (!confirm('Deconnecter le compte Garmin ? Les jetons stockes seront effaces.')) return;
    try {
      await api.garminDeconnexion();
      setEtat({ connecte: false, nomAffichage: null, active: etat?.active ?? false });
      setInfo('Compte Garmin deconnecte.');
    } catch (err) {
      setErreur(err);
    }
  }

  if (etat === null) return null;

  if (!etat.active) {
    return (
      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Garmin Connect</h2>
        <p className="doux">
          La connexion directe est desactivee. Pour l'activer, mets{' '}
          <code>GARMIN_DIRECT_ENABLED=true</code> cote serveur — lis d'abord la section
          « Garmin direct » du README, elle liste ce que ca implique.
        </p>
      </section>
    );
  }

  return (
    <section className="carte">
      <h2 style={{ marginTop: 0 }}>Garmin Connect</h2>
      <ErreurAffichee erreur={erreur} />
      {info && <Message type="succes">{info}</Message>}

      {etat.connecte ? (
        <>
          <p>
            Connecte{etat.nomAffichage ? ` — compte ${etat.nomAffichage}` : ''}.
          </p>
          <p className="doux">
            Les jetons sont chiffres en base. Ton mot de passe n'a pas ete conserve.
          </p>
          <button type="button" className="danger" onClick={() => void deconnecter()}>
            Deconnecter
          </button>
        </>
      ) : jetonMfa !== null ? (
        <form onSubmit={(e) => void validerCode(e)}>
          <label>
            <span>Code de verification Garmin</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button type="submit" className="principal" disabled={occupe || code.trim() === ''}>
            Valider
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => void connecter(e)}>
          <p className="doux">
            Connexion non officielle, en lecture seule. Ton mot de passe sert une fois a
            obtenir des jetons, puis il est oublie. L'ecriture du plan vers ta montre
            continue de passer par Intervals.icu.
          </p>
          <label>
            <span>Identifiant Garmin (e-mail)</span>
            <input
              type="email"
              autoComplete="username"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
            />
          </label>
          <label>
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="principal"
            disabled={occupe || identifiant === '' || motDePasse === ''}
          >
            Connecter
          </button>
        </form>
      )}
    </section>
  );
}
