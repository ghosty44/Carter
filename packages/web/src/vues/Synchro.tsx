import { useEffect, useState } from 'react';
import type { ApercuSync, EntreeJournal, OperationSync, ResultatSync } from '@carter/shared';
import { api, type EtatProvider } from '../api.js';
import { ErreurAffichee, Message } from '../composants.js';

export function VueSynchro() {
  const [providers, setProviders] = useState<EtatProvider[]>([]);
  const [reglages, setReglages] = useState<{
    fenetre_semaines: number;
    types_synchronises: string[];
    prefixe: string;
  } | null>(null);
  const [choisi, setChoisi] = useState<string>('INTERVALS');
  const [apercu, setApercu] = useState<ApercuSync | null>(null);
  const [resultat, setResultat] = useState<ResultatSync | null>(null);
  const [journal, setJournal] = useState<EntreeJournal[]>([]);
  const [erreur, setErreur] = useState<unknown>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    api
      .providers()
      .then((r) => {
        setProviders(r.providers);
        setReglages(r.reglages);
        // Selectionne d'office un provider utilisable.
        const utilisable = r.providers.find((p) => p.configure);
        if (utilisable) setChoisi(utilisable.nom);
      })
      .catch(setErreur);
    rafraichirJournal();
  }, []);

  function rafraichirJournal(): void {
    api
      .journal()
      .then((r) => setJournal(r.journal))
      .catch(() => setJournal([]));
  }

  const actif = providers.find((p) => p.nom === choisi);

  async function previsualiser(): Promise<void> {
    setOccupe(true);
    setErreur(null);
    setResultat(null);
    try {
      const r = await api.apercuSync(choisi);
      setApercu(r.apercu);
    } catch (e) {
      setErreur(e);
      setApercu(null);
    } finally {
      setOccupe(false);
    }
  }

  async function appliquer(): Promise<void> {
    if (apercu === null) return;

    const total =
      apercu.aCreer.length + apercu.aMettreAJour.length + apercu.aSupprimer.length;
    const message =
      apercu.aSupprimer.length > 0
        ? `Appliquer ${total} operation(s), dont ${apercu.aSupprimer.length} suppression(s) ?`
        : `Appliquer ${total} operation(s) ?`;
    if (!confirm(message)) return;

    setOccupe(true);
    setErreur(null);
    try {
      const r = await api.appliquerSync(choisi, apercu);
      setResultat(r.resultat);
      setApercu(null);
      rafraichirJournal();
    } catch (e) {
      setErreur(e);
    } finally {
      setOccupe(false);
    }
  }

  /**
   * Relance ce qui reste : les echecs et ce qui n'a pas ete tente faute de
   * temps. On repasse par un apercu frais plutot que de rejouer l'ancien, pour
   * que la revalidation cote serveur travaille sur l'etat courant.
   */
  async function reessayer(): Promise<void> {
    await previsualiser();
  }

  const total =
    apercu === null
      ? 0
      : apercu.aCreer.length + apercu.aMettreAJour.length + apercu.aSupprimer.length;

  return (
    <>
      <h1>Synchronisation</h1>
      <ErreurAffichee erreur={erreur} />

      <section className="carte">
        <label>
          <span>Destination</span>
          <select value={choisi} onChange={(e) => setChoisi(e.target.value)}>
            {providers.map((p) => (
              <option key={p.nom} value={p.nom} disabled={!p.configure}>
                {p.libelle}
                {p.configure ? '' : ' — non configure'}
              </option>
            ))}
          </select>
        </label>

        {actif?.indisponibilite && <Message type="erreur">{actif.indisponibilite}</Message>}

        {reglages && (
          <p className="doux">
            Fenetre : {reglages.fenetre_semaines} semaines a partir d'aujourd'hui. Types
            synchronises : {reglages.types_synchronises.join(', ')}. Prefixe des evenements :{' '}
            <code>{reglages.prefixe}</code>. Rien n'est ecrit ni supprime avant aujourd'hui.
          </p>
        )}

        <div className="rangee">
          <button
            type="button"
            onClick={previsualiser}
            disabled={occupe || actif?.configure !== true}
          >
            Previsualiser la synchro
          </button>
          <button
            type="button"
            className="principal"
            onClick={appliquer}
            disabled={occupe || apercu === null || total === 0}
          >
            Appliquer{total > 0 ? ` (${total})` : ''}
          </button>
        </div>
      </section>

      {apercu !== null && (
        <section>
          <h2>Apercu</h2>
          {total === 0 ? (
            <Message type="succes">
              Tout est deja a jour chez {actif?.libelle}. Rien a envoyer.
            </Message>
          ) : (
            <>
              <ListeOperations titre="A creer" operations={apercu.aCreer} />
              <ListeOperations titre="A mettre a jour" operations={apercu.aMettreAJour} />
              <ListeOperations
                titre="A supprimer"
                operations={apercu.aSupprimer}
                avertissement="Seuls les evenements crees par Carter sont concernes."
              />
            </>
          )}

          {apercu.ignorees.length > 0 && (
            <details className="carte">
              <summary>{apercu.ignorees.length} seance(s) ignoree(s)</summary>
              {apercu.ignorees.map((i, n) => (
                <div key={n} className="op">
                  <span className="date">{i.date}</span>
                  <span>
                    {i.titre}
                    <span className="motif">{i.raison}</span>
                  </span>
                </div>
              ))}
            </details>
          )}
        </section>
      )}

      {resultat !== null && (
        <section>
          <h2>Resultat</h2>
          <Message
            type={resultat.echecs === 0 && !resultat.interrompu ? 'succes' : 'erreur'}
          >
            {resultat.succes} operation(s) reussie(s), {resultat.echecs} en echec.
            {resultat.interrompu && (
              <div>
                <strong>Interrompu faute de temps</strong> — {resultat.non_traitees}{' '}
                operation(s) non tentees. Elles n'ont rien ecrit : relance pour
                terminer.
              </div>
            )}
            {resultat.sauvegarde && (
              <div className="doux">Sauvegarde du plan prise avant application.</div>
            )}
          </Message>

          {(resultat.echecs > 0 || resultat.interrompu) && (
            <>
              <div className="carte">
                {resultat.resultats
                  .filter((r) => !r.ok)
                  .map((r, i) => (
                    <div key={i} className="op">
                      <span className={`pastille ${r.operation.action}`} />
                      <span className="date">{r.operation.date}</span>
                      <span>
                        {r.operation.titre}
                        <span className="motif">
                          {r.erreur} ({r.tentatives} tentative(s))
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
              <button type="button" onClick={() => void reessayer()} disabled={occupe}>
                Recalculer et reprendre ce qui reste
              </button>
            </>
          )}
        </section>
      )}

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Journal</h2>
        {journal.length === 0 ? (
          <p className="doux">Aucune synchronisation enregistree.</p>
        ) : (
          <div className="defilant">
            <table>
              <thead>
                <tr>
                  <th>Quand</th>
                  <th>Action</th>
                  <th>Seance</th>
                  <th>Etat</th>
                </tr>
              </thead>
              <tbody>
                {journal.slice(0, 40).map((e) => (
                  <tr key={e.id}>
                    <td className="doux">{e.horodatage.slice(0, 16).replace('T', ' ')}</td>
                    <td>{e.action}</td>
                    <td>
                      {e.titre}
                      {e.date_seance && <div className="doux">{e.date_seance}</div>}
                    </td>
                    <td>
                      {e.ok ? 'ok' : <span style={{ color: 'var(--danger)' }}>{e.erreur}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ListeOperations({
  titre,
  operations,
  avertissement,
}: {
  titre: string;
  operations: OperationSync[];
  avertissement?: string;
}) {
  if (operations.length === 0) return null;

  return (
    <div className="carte">
      <h3 style={{ marginTop: 0 }}>
        {titre} ({operations.length})
      </h3>
      {avertissement && <p className="doux">{avertissement}</p>}
      {operations.map((o, i) => (
        <div key={i} className="op">
          <span className={`pastille ${o.action}`} />
          <span className="date">{o.date}</span>
          <span>
            {o.titre}
            <span className="motif">{o.motif}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
