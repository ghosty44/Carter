import { useEffect, useState } from 'react';
import {
  ajouterJours,
  aujourdhui,
  type Douleur,
  type SeanceRealisee,
  type Wellness,
} from '@carter/shared';
import { api, type EtatPlan, type EtatProvider } from '../api.js';
import { Echelle, ErreurAffichee, Message, formatAllure, formatSecondes } from '../composants.js';

/** Zones proposees d'office : celles que l'athlete surveille en permanence. */
const ZONES_FREQUENTES = [
  'Bas du dos (L5)',
  'Tendon Achille droit',
  'Tendon Achille gauche',
  'Mollet droit',
  'Mollet gauche',
  'Cheville droite',
  'Cheville gauche',
  'Genou droit',
  'Genou gauche',
];

export function VueRessenti({ etat }: { etat: EtatPlan | null }) {
  const [realisees, setRealisees] = useState<SeanceRealisee[]>([]);
  const [providers, setProviders] = useState<EtatProvider[]>([]);
  const [erreur, setErreur] = useState<unknown>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    charger();
    api
      .providers()
      .then((r) => setProviders(r.providers))
      .catch(() => setProviders([]));
  }, []);

  function charger(): void {
    api
      .realisees(ajouterJours(aujourdhui(), -28), aujourdhui())
      .then((r) => setRealisees(r.realisees))
      .catch(setErreur);
  }

  async function importer(provider: string): Promise<void> {
    setOccupe(true);
    setErreur(null);
    setInfo(null);
    try {
      const r = await api.importerDonnees(
        provider,
        ajouterJours(aujourdhui(), -28),
        aujourdhui(),
      );
      setInfo(
        `${r.activites_importees} activite(s) et ${r.wellness_importe} jour(s) de wellness importes. ` +
          `${r.rapprochements_appliques} rapprochement(s) automatique(s)` +
          (r.rapprochements_a_confirmer.length > 0
            ? `, ${r.rapprochements_a_confirmer.length} a confirmer.`
            : '.'),
      );
      charger();
    } catch (e) {
      setErreur(e);
    } finally {
      setOccupe(false);
    }
  }

  const lecteurs = providers.filter((p) => p.configure && p.capacites.lire);

  return (
    <>
      <h1>Ressenti</h1>
      <ErreurAffichee erreur={erreur} />
      {info && <Message type="succes">{info}</Message>}

      <SaisieWellness onErreur={setErreur} />

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Importer les donnees realisees</h2>
        {lecteurs.length === 0 ? (
          <p className="doux">
            Aucun provider de lecture configure. Tu peux saisir une seance a la main
            ci-dessous — l'app fonctionne sans API.
          </p>
        ) : (
          <div className="rangee">
            {lecteurs.map((p) => (
              <button
                key={p.nom}
                type="button"
                disabled={occupe}
                onClick={() => void importer(p.nom)}
              >
                Importer depuis {p.libelle}
              </button>
            ))}
          </div>
        )}
      </section>

      <SaisieManuelle etat={etat} onAjoute={charger} onErreur={setErreur} />

      <section>
        <h2>Seances des 4 dernieres semaines</h2>
        {realisees.length === 0 ? (
          <p className="doux">Rien d'enregistre sur la periode.</p>
        ) : (
          [...realisees]
            .reverse()
            .map((r) => (
              <CarteSeance key={r.id} realisee={r} etat={etat} onMaj={charger} onErreur={setErreur} />
            ))
        )}
      </section>
    </>
  );
}

function CarteSeance({
  realisee,
  etat,
  onMaj,
  onErreur,
}: {
  realisee: SeanceRealisee;
  etat: EtatPlan | null;
  onMaj: () => void;
  onErreur: (e: unknown) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [rpe, setRpe] = useState<number | null>(realisee.rpe);
  const [ressenti, setRessenti] = useState<number | null>(realisee.ressenti);
  const [douleurs, setDouleurs] = useState<Douleur[]>(realisee.douleurs);
  const [commentaire, setCommentaire] = useState(realisee.commentaire);
  const [enregistre, setEnregistre] = useState(false);

  const seanceLiee = etat?.seances.find((s) => s.seance.id === realisee.seance_id);
  const complete = realisee.rpe !== null && realisee.ressenti !== null;

  async function enregistrer(): Promise<void> {
    try {
      await api.majRessenti(realisee.id, { rpe, ressenti, douleurs, commentaire });
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 2000);
      onMaj();
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <div className="carte">
      <div
        className="entete-semaine"
        role="button"
        tabIndex={0}
        onClick={() => setOuvert(!ouvert)}
        onKeyDown={(e) => e.key === 'Enter' && setOuvert(!ouvert)}
      >
        <div>
          <strong>{realisee.nom || realisee.type_sport}</strong>
          <div className="doux">
            {realisee.date} · {formatSecondes(realisee.duree_s)} ·{' '}
            {(realisee.distance_m / 1000).toFixed(1)} km ·{' '}
            {formatAllure(realisee.allure_moy_s_km)}
            {realisee.fc_moy && ` · ${realisee.fc_moy} bpm`}
          </div>
          <div className="doux">
            {seanceLiee ? `Rattachee a « ${seanceLiee.seance.titre} »` : 'Non rattachee'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {complete ? (
            <span className="etiquette">saisi</span>
          ) : (
            <span className="etiquette" style={{ borderColor: 'var(--attention)' }}>
              a completer
            </span>
          )}
        </div>
      </div>

      {ouvert && (
        <div style={{ marginTop: 12 }}>
          <Echelle min={1} max={10} valeur={rpe} onChange={setRpe} legende="RPE (effort percu)" />
          <div style={{ height: 10 }} />
          <Echelle
            min={1}
            max={5}
            valeur={ressenti}
            onChange={setRessenti}
            legende="Ressenti general (1 mauvais, 5 excellent)"
          />

          <h3>Douleurs</h3>
          {douleurs.map((d, i) => (
            <div key={i} className="rangee" style={{ marginBottom: 8 }}>
              <input
                style={{ flex: '2 1 140px', width: 'auto' }}
                value={d.zone}
                onChange={(e) =>
                  setDouleurs(douleurs.map((x, n) => (n === i ? { ...x, zone: e.target.value } : x)))
                }
              />
              <input
                style={{ flex: '0 0 70px', width: 'auto' }}
                type="number"
                min={0}
                max={10}
                value={d.intensite}
                onChange={(e) =>
                  setDouleurs(
                    douleurs.map((x, n) =>
                      n === i ? { ...x, intensite: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="compact danger"
                onClick={() => setDouleurs(douleurs.filter((_, n) => n !== i))}
              >
                retirer
              </button>
            </div>
          ))}

          <div className="choix" style={{ marginTop: 6 }}>
            {ZONES_FREQUENTES.filter((z) => !douleurs.some((d) => d.zone === z)).map((z) => (
              <button
                key={z}
                type="button"
                className="compact"
                onClick={() => setDouleurs([...douleurs, { zone: z, intensite: 4, note: '' }])}
              >
                + {z}
              </button>
            ))}
          </div>

          <label style={{ marginTop: 12 }}>
            <span>Commentaire</span>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Sensations, meteo, raison d'une seance ecourtee…"
            />
          </label>

          <div className="rangee">
            <button type="button" className="principal" onClick={() => void enregistrer()}>
              Enregistrer
            </button>
            {enregistre && <span className="doux">enregistre</span>}
          </div>

          {etat?.plan && (
            <label style={{ marginTop: 12 }}>
              <span>Rattacher a une seance planifiee</span>
              <select
                value={realisee.seance_id ?? ''}
                onChange={(e) =>
                  api
                    .rapprocher(realisee.id, e.target.value === '' ? null : e.target.value)
                    .then(onMaj)
                    .catch(onErreur)
                }
              >
                <option value="">— aucune —</option>
                {etat.seances
                  .filter((s) => Math.abs(Date.parse(s.date) - Date.parse(realisee.date)) < 6e8)
                  .map((s) => (
                    <option key={s.seance.id} value={s.seance.id}>
                      {s.date} — {s.seance.titre}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function SaisieWellness({ onErreur }: { onErreur: (e: unknown) => void }) {
  const [date, setDate] = useState(aujourdhui());
  const [w, setW] = useState<Partial<Wellness>>({});
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    api
      .wellness(date, date)
      .then((r) => setW(r.wellness[0] ?? {}))
      .catch(() => setW({}));
  }, [date]);

  async function enregistrer(): Promise<void> {
    try {
      await api.enregistrerWellness({ ...w, date });
      setEnregistre(true);
      setTimeout(() => setEnregistre(false), 2000);
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <section className="carte">
      <h2 style={{ marginTop: 0 }}>Forme du jour</h2>
      <label>
        <span>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>

      <div className="rangee">
        <label style={{ flex: '1 1 110px' }}>
          <span>FC repos</span>
          <input
            type="number"
            inputMode="numeric"
            value={w.fc_repos ?? ''}
            onChange={(e) =>
              setW({ ...w, fc_repos: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
        <label style={{ flex: '1 1 110px' }}>
          <span>Sommeil (h)</span>
          <input
            type="number"
            step="0.5"
            inputMode="decimal"
            value={w.sommeil_h ?? ''}
            onChange={(e) =>
              setW({ ...w, sommeil_h: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
        <label style={{ flex: '1 1 110px' }}>
          <span>Poids (kg)</span>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={w.poids_kg ?? ''}
            onChange={(e) =>
              setW({ ...w, poids_kg: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </label>
      </div>

      <Echelle
        min={1}
        max={5}
        valeur={w.fatigue_1_5 ?? null}
        onChange={(v) => setW({ ...w, fatigue_1_5: v })}
        legende="Fatigue (1 frais, 5 vide)"
      />
      <div style={{ height: 10 }} />
      <Echelle
        min={1}
        max={5}
        valeur={w.humeur_1_5 ?? null}
        onChange={(v) => setW({ ...w, humeur_1_5: v })}
        legende="Humeur (1 mauvaise, 5 excellente)"
      />

      <div className="rangee" style={{ marginTop: 12 }}>
        <button type="button" onClick={() => void enregistrer()}>
          Enregistrer
        </button>
        {enregistre && <span className="doux">enregistre</span>}
      </div>
    </section>
  );
}

function SaisieManuelle({
  etat,
  onAjoute,
  onErreur,
}: {
  etat: EtatPlan | null;
  onAjoute: () => void;
  onErreur: (e: unknown) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState(aujourdhui());
  const [duree, setDuree] = useState(30);
  const [distance, setDistance] = useState(0);
  const [denivele, setDenivele] = useState(0);
  const [type, setType] = useState('Run');
  const [seanceId, setSeanceId] = useState('');

  async function ajouter(): Promise<void> {
    try {
      await api.ajouterRealisee({
        date,
        seance_id: seanceId === '' ? null : seanceId,
        nom: 'Saisie manuelle',
        type_sport: type,
        duree_s: duree * 60,
        distance_m: distance * 1000,
        denivele_m: denivele,
      });
      setOuvert(false);
      onAjoute();
    } catch (e) {
      onErreur(e);
    }
  }

  return (
    <section className="carte">
      <h2 style={{ marginTop: 0 }}>
        Saisir une seance a la main{' '}
        <button type="button" className="compact" onClick={() => setOuvert(!ouvert)}>
          {ouvert ? 'annuler' : 'ouvrir'}
        </button>
      </h2>

      {ouvert && (
        <>
          <div className="rangee">
            <label style={{ flex: '1 1 150px' }}>
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label style={{ flex: '1 1 110px' }}>
              <span>Duree (min)</span>
              <input
                type="number"
                inputMode="numeric"
                value={duree}
                onChange={(e) => setDuree(Number(e.target.value))}
              />
            </label>
            <label style={{ flex: '1 1 110px' }}>
              <span>Distance (km)</span>
              <input
                type="number"
                step="0.1"
                inputMode="decimal"
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
              />
            </label>
            <label style={{ flex: '1 1 110px' }}>
              <span>D+ (m)</span>
              <input
                type="number"
                inputMode="numeric"
                value={denivele}
                onChange={(e) => setDenivele(Number(e.target.value))}
              />
            </label>
          </div>

          <label>
            <span>Sport</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="Run">Course</option>
              <option value="TrailRun">Trail</option>
              <option value="WeightTraining">Renforcement</option>
              <option value="Ride">Velo</option>
            </select>
          </label>

          {etat?.plan && (
            <label>
              <span>Rattacher a</span>
              <select value={seanceId} onChange={(e) => setSeanceId(e.target.value)}>
                <option value="">— aucune —</option>
                {etat.seances
                  .filter((s) => Math.abs(Date.parse(s.date) - Date.parse(date)) < 6e8)
                  .map((s) => (
                    <option key={s.seance.id} value={s.seance.id}>
                      {s.date} — {s.seance.titre}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <button type="button" className="principal" onClick={() => void ajouter()}>
            Ajouter
          </button>
        </>
      )}
    </section>
  );
}
