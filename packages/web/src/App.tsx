import { useCallback, useEffect, useState } from 'react';
import { api, ErreurApi, type EtatPlan } from './api.js';
import { Chargement, ErreurAffichee } from './composants.js';
import { VuePlan } from './vues/Plan.js';
import { VueSynchro } from './vues/Synchro.js';
import { VueRessenti } from './vues/Ressenti.js';
import { VueCoach } from './vues/Coach.js';

type Onglet = 'plan' | 'synchro' | 'ressenti' | 'coach';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'plan', libelle: 'Plan' },
  { cle: 'synchro', libelle: 'Synchro' },
  { cle: 'ressenti', libelle: 'Ressenti' },
  { cle: 'coach', libelle: 'Coach' },
];

export function App() {
  const [onglet, setOnglet] = useState<Onglet>('plan');
  const [etat, setEtat] = useState<EtatPlan | null>(null);
  const [authentifie, setAuthentifie] = useState<boolean | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);

  const charger = useCallback(async () => {
    try {
      const r = await api.plan();
      setEtat(r);
      setAuthentifie(true);
      setErreur(null);
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 401) {
        setAuthentifie(false);
      } else {
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

  if (authentifie === null && etat === null && erreur === null) {
    return <Chargement quoi="de l'application" />;
  }

  return (
    <>
      <ErreurAffichee erreur={erreur} />

      {onglet === 'plan' && <VuePlan etat={etat} recharger={() => void charger()} />}
      {onglet === 'synchro' && <VueSynchro />}
      {onglet === 'ressenti' && <VueRessenti etat={etat} />}
      {onglet === 'coach' && <VueCoach recharger={() => void charger()} />}

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
      <p className="doux">Plan d'entrainement trail. Acces protege.</p>
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
