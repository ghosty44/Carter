import { useEffect, useState } from 'react';
import type { EtatGarmin } from '@carter/shared';
import { api } from '../api.js';
import { Chargement, ErreurAffichee, Message } from '../composants.js';

export function VueCompte({ onChangement }: { onChangement: () => void }) {
  const [etat, setEtat] = useState<EtatGarmin | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);

  function recharger(): void {
    api
      .garmin()
      .then((r) => setEtat(r.garmin))
      .catch(setErreur);
  }

  useEffect(recharger, []);

  if (etat === null && erreur === null) return <Chargement quoi="du compte" />;

  return (
    <>
      <h1>Compte</h1>
      <ErreurAffichee erreur={erreur} />
      {info && <Message type="succes">{info}</Message>}

      {etat !== null && !etat.active && (
        <div className="carte">
          <h2 style={{ marginTop: 0 }}>Garmin désactivé</h2>
          <p>
            La connexion Garmin n’est pas activée côté serveur. Ajoute{' '}
            <code>GARMIN_ENABLED=true</code> dans les variables d’environnement, puis
            redéploie.
          </p>
        </div>
      )}

      {etat !== null && etat.active && !etat.connecte && (
        <Connexion
          onConnecte={(nom) => {
            setInfo(nom ? `Compte ${nom} connecté.` : 'Compte Garmin connecté.');
            recharger();
            onChangement();
          }}
          onErreur={setErreur}
        />
      )}

      {etat !== null && etat.connecte && (
        <Connecte
          etat={etat}
          onMaj={(message) => {
            setInfo(message);
            recharger();
            onChangement();
          }}
          onErreur={setErreur}
        />
      )}
    </>
  );
}

function Connecte({
  etat,
  onMaj,
  onErreur,
}: {
  etat: EtatGarmin;
  onMaj: (message: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const [occupe, setOccupe] = useState(false);

  async function recuperer(complet: boolean): Promise<void> {
    setOccupe(true);
    onErreur(null);
    try {
      const r = await api.recuperer(complet);
      onMaj(
        `${r.activites} séance${r.activites > 1 ? 's' : ''} et ${r.wellness} jour${
          r.wellness > 1 ? 's' : ''
        } de forme récupérés. ${r.total_en_cache} séances en mémoire.`,
      );
    } catch (e) {
      onErreur(e);
    } finally {
      setOccupe(false);
    }
  }

  async function deconnecter(): Promise<void> {
    if (!confirm('Déconnecter le compte Garmin ? Les jetons seront effacés.')) return;
    try {
      await api.deconnexion();
      onMaj('Compte Garmin déconnecté.');
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <>
      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Garmin Connect</h2>
        <p>
          Connecté{etat.nom_affichage ? ` — ${etat.nom_affichage}` : ''}.
        </p>
        <p className="doux">
          {etat.derniere_synchro
            ? `Dernière récupération : ${new Date(etat.derniere_synchro).toLocaleString('fr-FR')}`
            : 'Aucune récupération pour l’instant.'}
        </p>

        <button
          type="button"
          className="principal"
          disabled={occupe}
          onClick={() => void recuperer(false)}
        >
          {occupe ? 'Récupération…' : 'Récupérer mes données'}
        </button>

        <p className="doux" style={{ marginTop: 12 }}>
          Récupère les nouvelles séances et 30 jours de forme. Les données sont gardées
          en mémoire pour que l’app reste rapide et n’interroge pas Garmin à chaque
          écran.
        </p>
      </section>

      <details className="carte">
        <summary>Options</summary>
        <div className="rangee" style={{ marginTop: 12 }}>
          <button type="button" disabled={occupe} onClick={() => void recuperer(true)}>
            Tout recharger
          </button>
          <button type="button" className="danger" onClick={() => void deconnecter()}>
            Déconnecter
          </button>
        </div>
        <p className="doux" style={{ marginTop: 10 }}>
          « Tout recharger » reprend l’historique depuis le début plutôt que les seules
          nouveautés. Plus lent, utile après un changement chez Garmin.
        </p>
      </details>
    </>
  );
}

/**
 * Formulaire de connexion.
 *
 * Le mot de passe part au backend, sert une fois a obtenir des jetons, puis
 * est oublie — ici comme cote serveur. Il n'est pas conserve dans l'etat du
 * composant apres l'envoi.
 */
function Connexion({
  onConnecte,
  onErreur,
}: {
  onConnecte: (nom: string | null) => void;
  onErreur: (e: unknown) => void;
}) {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [jetonMfa, setJetonMfa] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function connecter(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setOccupe(true);
    onErreur(null);
    try {
      const r = await api.connexion(identifiant, motDePasse);
      setMotDePasse('');

      if (r.mfa_requis === true && r.jeton_mfa) {
        setJetonMfa(r.jeton_mfa);
        setMessage(r.message ?? 'Code de vérification demandé par Garmin.');
        return;
      }
      onConnecte(r.nom_affichage ?? null);
    } catch (err) {
      onErreur(err);
    } finally {
      setOccupe(false);
    }
  }

  async function valider(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (jetonMfa === null) return;
    setOccupe(true);
    onErreur(null);
    try {
      const r = await api.mfa(jetonMfa, code.trim());
      onConnecte(r.nom_affichage);
    } catch (err) {
      onErreur(err);
    } finally {
      setOccupe(false);
    }
  }

  if (jetonMfa !== null) {
    return (
      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Code de vérification</h2>
        {message && <Message type="succes">{message}</Message>}
        <form onSubmit={(e) => void valider(e)}>
          <label>
            <span>Code reçu de Garmin</span>
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
      </section>
    );
  }

  return (
    <section className="carte">
      <h2 style={{ marginTop: 0 }}>Connecter Garmin</h2>
      <form onSubmit={(e) => void connecter(e)}>
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
          {occupe ? 'Connexion…' : 'Connecter'}
        </button>
      </form>

      <p className="doux" style={{ marginTop: 14 }}>
        Connexion en lecture seule : l’app ne modifie jamais rien chez Garmin. Ton mot
        de passe sert une fois à obtenir des jetons, puis il est oublié — seuls les
        jetons sont conservés, chiffrés.
      </p>
    </section>
  );
}
