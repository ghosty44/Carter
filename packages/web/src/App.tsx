import { useCallback, useEffect, useState } from 'react';
import { api, ErreurApi } from './api.js';
import { Chargement, ErreurAffichee } from './composants.js';
import { VueSeances } from './vues/Seances.js';
import { VueStats } from './vues/Stats.js';
import { VueCompte } from './vues/Compte.js';

type Onglet = 'seances' | 'stats' | 'compte';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'seances', libelle: 'Séances' },
  { cle: 'stats', libelle: 'Stats' },
  { cle: 'compte', libelle: 'Compte' },
];

export function App() {
  const [onglet, setOnglet] = useState<Onglet>('seances');
  const [authentifie, setAuthentifie] = useState<boolean | null>(null);
  const [connecte, setConnecte] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  // Force le remontage des vues apres une recuperation de donnees.
  const [version, setVersion] = useState(0);

  const charger = useCallback(async () => {
    try {
      const r = await api.garmin();
      setConnecte(r.garmin.connecte);
      setAuthentifie(true);
      setErreur(null);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) {
        setAuthentifie(false);
      } else {
        setAuthentifie(true);
        setErreur(e);
      }
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (authentifie === false) {
    return <Connexion onConnecte={() => void charger()} />;
  }

  if (authentifie === null) return <Chargement quoi="de l’application" />;

  return (
    <>
      <ErreurAffichee erreur={erreur} />

      {onglet === 'seances' && <VueSeances key={version} connecte={connecte} />}
      {onglet === 'stats' && <VueStats key={version} />}
      {onglet === 'compte' && (
        <VueCompte
          onChangement={() => {
            setVersion((v) => v + 1);
            void charger();
          }}
        />
      )}

      <nav className="onglets">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            aria-current={onglet === o.cle ? 'page' : undefined}
            onClick={() => setOnglet(o.cle)}
          >
            {o.libelle}
          </button>
        ))}
      </nav>
    </>
  );
}

function Connexion({ onConnecte }: { onConnecte: () => void }) {
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);
  const [occupe, setOccupe] = useState(false);

  async function envoyer(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      await api.ouvrirSession(motDePasse);
      onConnecte();
    } catch (err) {
      setErreur(err);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <form onSubmit={(e) => void envoyer(e)} style={{ maxWidth: 340, margin: '80px auto' }}>
      <h1>Carter</h1>
      <p className="doux">Tes séances et tes stats Garmin.</p>
      <ErreurAffichee erreur={erreur} />
      <label>
        <span>Mot de passe</span>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
      </label>
      <button type="submit" className="principal" disabled={occupe || motDePasse === ''}>
        Entrer
      </button>
    </form>
  );
}
