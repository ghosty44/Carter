import { useEffect, useState } from 'react';
import {
  AVERTISSEMENT_ALERTES,
  ajouterJours,
  aujourdhui,
  formatDuree,
  nomJour,
  type SeancePlanifiee,
  type VolumeSemaine,
} from '@carter/shared';
import { api, type Comparaison, type EtatPlan } from '../api.js';
import { Chargement, ErreurAffichee, Message } from '../composants.js';

export function VuePlan({
  etat,
  recharger,
}: {
  etat: EtatPlan | null;
  recharger: () => void;
}) {
  const [comparaisons, setComparaisons] = useState<Comparaison[]>([]);
  const [erreur, setErreur] = useState<unknown>(null);
  const [ouvertes, setOuvertes] = useState<Set<number>>(new Set());
  const [succes, setSucces] = useState<string | null>(null);

  useEffect(() => {
    if (etat?.plan == null) return;
    api
      .comparaison()
      .then((r) => setComparaisons(r.comparaisons))
      .catch(() => setComparaisons([]));
  }, [etat?.plan?.version]);

  useEffect(() => {
    // Ouvre la semaine en cours a l'arrivee : c'est celle qu'on vient voir.
    const today = aujourdhui();
    const courante = etat?.volumes.find(
      (v) => v.date_debut <= today && ajouterJours(v.date_debut, 6) >= today,
    );
    if (courante) setOuvertes(new Set([courante.numero_global]));
  }, [etat?.plan?.id]);

  if (etat === null) return <Chargement quoi="du plan" />;

  if (etat.plan === null) {
    return <ImportInitial onImporte={recharger} />;
  }

  const today = aujourdhui();
  const parSemaine = new Map<string, SeancePlanifiee[]>();
  for (const s of etat.seances) {
    const liste = parSemaine.get(s.semaine.id) ?? [];
    liste.push(s);
    parSemaine.set(s.semaine.id, liste);
  }

  const realiseParSemaine = new Map(
    comparaisons.map((c) => [c.semaine.numero_global, c.realise.volume_course_min]),
  );

  function basculer(numero: number): void {
    setOuvertes((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(numero)) suivant.delete(numero);
      else suivant.add(numero);
      return suivant;
    });
  }

  return (
    <>
      <h1>{etat.plan.nom}</h1>
      <p className="doux">
        Version {etat.plan.version} — {etat.volumes.length} semaines,{' '}
        {formatDuree(etat.volumes.reduce((s, v) => s + v.volume_course_min, 0))} de course
      </p>

      <ErreurAffichee erreur={erreur} />
      {succes && <Message type="succes">{succes}</Message>}

      {etat.alertes.length > 0 && (
        <section>
          <h2>Alertes</h2>
          {etat.alertes.map((a, i) => (
            <div key={i} className={`alerte ${a.gravite}`}>
              {a.message}
            </div>
          ))}
          <p className="doux">{AVERTISSEMENT_ALERTES}</p>
        </section>
      )}

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Volume hebdomadaire</h2>
        <Graphe volumes={etat.volumes} realise={realiseParSemaine} />
        <p className="doux">
          Barre pleine : volume prevu. Zone claire en bas : volume realise. Les semaines
          allegees sont en vert.
        </p>
      </section>

      <section>
        <h2>Plan</h2>
        {etat.volumes.map((v) => {
          const seances = (parSemaine.get(v.semaine_id) ?? []).sort(
            (a, b) =>
              a.seance.jour_offset - b.seance.jour_offset ||
              a.seance.ordre_dans_journee - b.seance.ordre_dans_journee,
          );
          const ouverte = ouvertes.has(v.numero_global);
          const enCours = v.date_debut <= today && ajouterJours(v.date_debut, 6) >= today;

          return (
            <div key={v.semaine_id} className={`semaine ${v.type}`}>
              <div
                className="entete-semaine"
                onClick={() => basculer(v.numero_global)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && basculer(v.numero_global)}
              >
                <div>
                  <strong>
                    Semaine {v.numero_global}
                    {enCours && ' — en cours'}
                  </strong>{' '}
                  <span className="etiquette">{v.type}</span>
                  <div className="doux">
                    {v.date_debut} · {v.nb_seances_course} seances ·{' '}
                    {v.sortie_longue_min ? `SL ${formatDuree(v.sortie_longue_min)}` : 'pas de SL'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div>{formatDuree(v.volume_course_min)}</div>
                  <div className="doux">{ouverte ? 'replier' : 'deplier'}</div>
                </div>
              </div>

              {ouverte && (
                <div style={{ marginTop: 8 }}>
                  {seances[0]?.semaine.note_coach && (
                    <p className="doux" style={{ fontStyle: 'italic' }}>
                      {seances[0].semaine.note_coach}
                    </p>
                  )}
                  {seances.map((s) => (
                    <div key={s.seance.id} className="seance">
                      <span className="jour">
                        {nomJour(s.seance.jour_offset)}
                        <br />
                        {s.date.slice(5)}
                      </span>
                      <span>
                        {s.seance.titre}
                        <br />
                        <span className="etiquette">{s.seance.type}</span>{' '}
                        {s.seance.consignes && (
                          <span className="doux" title={s.seance.consignes}>
                            {s.seance.consignes.split('\n')[0]!.slice(0, 60)}…
                          </span>
                        )}
                      </span>
                      <span className="duree">{formatDuree(s.seance.duree_min)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Exports</h2>
        <div className="rangee">
          <a href="/api/export/ics" download>
            <button type="button" className="compact">
              Calendrier .ics
            </button>
          </a>
          <a href="/api/export/plan.csv" download>
            <button type="button" className="compact">
              Plan .csv
            </button>
          </a>
          <a href="/api/export/realise.csv" download>
            <button type="button" className="compact">
              Realise .csv
            </button>
          </a>
          <a href="/api/export/plan.json" download>
            <button type="button" className="compact">
              Plan .json
            </button>
          </a>
        </div>
        <p className="doux">
          Le .ics fonctionne sans aucune API : importe-le dans n'importe quel agenda.
        </p>
      </section>

      <Historique
        onRestaure={(m) => {
          setSucces(`Version restauree. ${m}`);
          recharger();
        }}
        onErreur={setErreur}
      />
    </>
  );
}

function Graphe({
  volumes,
  realise,
}: {
  volumes: VolumeSemaine[];
  realise: Map<number, number>;
}) {
  const max = Math.max(60, ...volumes.map((v) => v.volume_course_min));

  return (
    <div className="graphe">
      {volumes.map((v) => {
        const fait = realise.get(v.numero_global) ?? 0;
        return (
          <div
            key={v.semaine_id}
            className={`barre ${v.type}`}
            style={{ height: `${(v.volume_course_min / max) * 100}%` }}
            title={`Semaine ${v.numero_global} (${v.type}) — prevu ${formatDuree(
              v.volume_course_min,
            )}${fait > 0 ? `, realise ${formatDuree(fait)}` : ''}`}
          >
            {fait > 0 && (
              <div
                className="realise"
                style={{
                  height: `${Math.min(100, (fait / Math.max(v.volume_course_min, 1)) * 100)}%`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ImportInitial({ onImporte }: { onImporte: () => void }) {
  const [erreur, setErreur] = useState<unknown>(null);
  const [occupe, setOccupe] = useState(false);

  async function importer(fichier: File): Promise<void> {
    setOccupe(true);
    setErreur(null);
    try {
      await api.importerPlan(JSON.parse(await fichier.text()));
      onImporte();
    } catch (e) {
      setErreur(e);
    } finally {
      setOccupe(false);
    }
  }

  async function chargerBloc1(): Promise<void> {
    setOccupe(true);
    setErreur(null);
    try {
      await api.chargerPlanInitial();
      onImporte();
    } catch (e) {
      setErreur(e);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <h1>Aucun plan charge</h1>
      <ErreurAffichee erreur={erreur} />

      <div className="carte">
        <h2 style={{ marginTop: 0 }}>Demarrer avec le bloc 1</h2>
        <p>
          8 semaines de base aerobie, de 1h40 a 2h40 de course par semaine, avec le
          renforcement preventif. Le bloc demarre <strong>lundi prochain</strong>.
        </p>
        <button
          type="button"
          className="principal"
          disabled={occupe}
          onClick={() => void chargerBloc1()}
        >
          Charger le bloc 1
        </button>
        <p className="doux" style={{ marginTop: 10 }}>
          Tu pourras tout modifier ensuite, et revenir en arriere : chaque revision est
          conservee dans l'historique.
        </p>
      </div>

      <details className="carte">
        <summary>Ou importer un plan JSON</summary>
        <p className="doux">
          Utile pour reprendre un plan existant, ou celui qu'un coach t'a renvoye.
        </p>
        <label>
          <span>Fichier JSON</span>
          <input
            type="file"
            accept="application/json,.json"
            disabled={occupe}
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void importer(fichier);
            }}
          />
        </label>
      </details>
    </>
  );
}

function Historique({
  onRestaure,
  onErreur,
}: {
  onRestaure: (message: string) => void;
  onErreur: (e: unknown) => void;
}) {
  const [versions, setVersions] = useState<
    { version: number; origine: string; commentaire: string; cree_le: string }[]
  >([]);
  const [diff, setDiff] = useState<{ version: number; markdown: string } | null>(null);
  const [deplie, setDeplie] = useState(false);

  useEffect(() => {
    if (!deplie) return;
    api
      .versions()
      .then((r) => setVersions(r.versions))
      .catch(onErreur);
  }, [deplie]);

  return (
    <section className="carte">
      <h2 style={{ marginTop: 0 }}>
        Historique des versions{' '}
        <button type="button" className="compact" onClick={() => setDeplie(!deplie)}>
          {deplie ? 'masquer' : 'afficher'}
        </button>
      </h2>

      {deplie && (
        <>
          <div className="defilant">
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Origine</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.version}>
                    <td>{v.version}</td>
                    <td>
                      {v.origine}
                      {v.commentaire && <div className="doux">{v.commentaire}</div>}
                    </td>
                    <td className="doux">{v.cree_le.slice(0, 16).replace('T', ' ')}</td>
                    <td>
                      <div className="rangee">
                        <button
                          type="button"
                          className="compact"
                          onClick={() =>
                            api
                              .diffVersions(v.version)
                              .then((r) => setDiff({ version: v.version, markdown: r.markdown }))
                              .catch(onErreur)
                          }
                        >
                          diff
                        </button>
                        <button
                          type="button"
                          className="compact"
                          onClick={() => {
                            if (
                              !confirm(
                                `Revenir a la version ${v.version} ? Une nouvelle version sera creee, rien n'est efface.`,
                              )
                            )
                              return;
                            api
                              .restaurer(v.version)
                              .then((r) => onRestaure(r.diff_markdown.slice(0, 200)))
                              .catch(onErreur);
                          }}
                        >
                          restaurer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {diff && (
            <>
              <h3>Version {diff.version} comparee au plan courant</h3>
              <pre className="bloc">{diff.markdown}</pre>
            </>
          )}
        </>
      )}
    </section>
  );
}
