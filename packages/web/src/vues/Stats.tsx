import { useEffect, useState } from 'react';
import {
  LIBELLE_SPORT,
  formatAllure,
  formatDate,
  formatDateCourte,
  formatDenivele,
  formatDistance,
  formatDuree,
  formatHeures,
  type Activite,
  type Wellness,
} from '@carter/shared';
import { api, type Stats } from '../api.js';
import { Chargement, ErreurAffichee } from '../composants.js';

export function VueStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [wellness, setWellness] = useState<Wellness[]>([]);
  const [erreur, setErreur] = useState<unknown>(null);

  useEffect(() => {
    api.stats(12).then(setStats).catch(setErreur);
    api
      .wellness()
      .then((r) => setWellness(r.wellness))
      .catch(() => setWellness([]));
  }, []);

  if (erreur !== null) return <ErreurAffichee erreur={erreur} />;
  if (stats === null) return <Chargement quoi="des statistiques" />;

  const t = stats.derniers_28_jours;
  const maxDuree = Math.max(1, ...stats.semaines.map((s) => s.duree_s));

  if (t.nb_activites === 0 && stats.semaines.every((s) => s.duree_s === 0)) {
    return (
      <>
        <h1>Stats</h1>
        <div className="carte">
          <p>Rien à afficher pour l’instant.</p>
          <p className="doux">
            Récupère tes données depuis l’onglet Compte, puis reviens ici.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Stats</h1>

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>4 dernières semaines</h2>
        <div className="mesures grandes">
          <Bloc valeur={formatDuree(t.duree_s)} legende="temps total" />
          <Bloc valeur={formatDistance(t.distance_m)} legende="distance" />
          <Bloc valeur={formatDenivele(t.denivele_m)} legende="dénivelé" />
          <Bloc valeur={String(t.nb_activites)} legende="séances" />
          <Bloc valeur={formatAllure(t.allure_s_km)} legende="allure course" />
          <Bloc valeur={t.fc_moy === null ? '—' : `${t.fc_moy} bpm`} legende="FC moyenne" />
        </div>
      </section>

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Volume par semaine</h2>
        <div className="graphe">
          {stats.semaines.map((s) => (
            <div
              key={s.debut}
              className="colonne"
              title={`${formatDateCourte(s.debut)} : ${formatDuree(s.duree_s)}`}
            >
              <div
                className="barre"
                style={{ height: `${(s.duree_s / maxDuree) * 100}%` }}
              >
                <div
                  className="part-course"
                  style={{
                    height: `${s.duree_s > 0 ? (s.course.duree_s / s.duree_s) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="doux">
          12 dernières semaines. La partie pleine est la course à pied, le reste les
          autres sports. Dernière colonne : semaine en cours.
        </p>

        <div className="defilant">
          <table>
            <thead>
              <tr>
                <th>Semaine</th>
                <th>Total</th>
                <th>Course</th>
                <th>Distance</th>
                <th>D+</th>
                <th>Plus longue</th>
              </tr>
            </thead>
            <tbody>
              {[...stats.semaines].reverse().map((s) => (
                <tr key={s.debut}>
                  <td>{formatDateCourte(s.debut)}</td>
                  <td>{formatDuree(s.duree_s)}</td>
                  <td>{formatDuree(s.course.duree_s)}</td>
                  <td>{formatDistance(s.distance_m)}</td>
                  <td>{s.denivele_m > 0 ? `${s.denivele_m} m` : '—'}</td>
                  <td>{formatDuree(s.plus_longue_s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {stats.repartition.length > 0 && (
        <section className="carte">
          <h2 style={{ marginTop: 0 }}>Répartition sur 4 semaines</h2>
          {stats.repartition.map((r) => {
            const part = t.duree_s > 0 ? (r.duree_s / t.duree_s) * 100 : 0;
            return (
              <div key={r.sport} className="repartition">
                <div className="rangee" style={{ justifyContent: 'space-between' }}>
                  <span>{LIBELLE_SPORT[r.sport]}</span>
                  <span className="doux">
                    {formatDuree(r.duree_s)} · {r.nb_activites} séance
                    {r.nb_activites > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="jauge">
                  <div className={`remplissage sport-${r.sport}`} style={{ width: `${part}%` }} />
                </div>
              </div>
            );
          })}
        </section>
      )}

      <SectionForme wellness={wellness} />

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Records de la période</h2>
        <Record titre="Plus longue sortie" activite={stats.records.plus_longue_duree} valeur={(a) => formatDuree(a.duree_s)} />
        <Record titre="Plus longue distance" activite={stats.records.plus_longue_distance} valeur={(a) => formatDistance(a.distance_m)} />
        <Record titre="Plus gros dénivelé" activite={stats.records.plus_gros_denivele} valeur={(a) => formatDenivele(a.denivele_m)} />
        <p className="doux">
          Calculés sur les séances chargées. Les records sur distance exacte (meilleur
          10 km au sein d’une sortie) demanderaient les données seconde par seconde,
          que l’app ne télécharge pas.
        </p>
      </section>
    </>
  );
}

function SectionForme({ wellness }: { wellness: Wellness[] }) {
  const avec = (champ: keyof Wellness) =>
    wellness.filter((w) => w[champ] !== null).map((w) => w[champ] as number);

  const fcRepos = avec('fc_repos');
  const sommeil = avec('sommeil_h');
  const hrv = avec('hrv');
  const poids = wellness.filter((w) => w.poids_kg !== null);

  if (fcRepos.length === 0 && sommeil.length === 0 && hrv.length === 0) return null;

  const moyenne = (v: number[]) =>
    v.length === 0 ? null : Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;

  return (
    <section className="carte">
      <h2 style={{ marginTop: 0 }}>Forme sur 30 jours</h2>
      <div className="mesures grandes">
        <Bloc
          valeur={fcRepos.length > 0 ? `${Math.round(moyenne(fcRepos)!)} bpm` : '—'}
          legende="FC de repos"
        />
        <Bloc valeur={formatHeures(moyenne(sommeil))} legende="sommeil" />
        <Bloc valeur={hrv.length > 0 ? String(Math.round(moyenne(hrv)!)) : '—'} legende="VFC" />
        <Bloc
          valeur={
            poids.length > 0 ? `${poids[poids.length - 1]!.poids_kg!.toFixed(1)} kg` : '—'
          }
          legende="poids"
        />
      </div>
      <p className="doux">
        Moyennes sur les jours où Garmin a remonté une mesure. Le poids est la dernière
        pesée connue.
      </p>
    </section>
  );
}

function Bloc({ valeur, legende }: { valeur: string; legende: string }) {
  return (
    <div className="mesure">
      <div className="valeur">{valeur}</div>
      <div className="legende">{legende}</div>
    </div>
  );
}

function Record({
  titre,
  activite,
  valeur,
}: {
  titre: string;
  activite: Activite | null;
  valeur: (a: Activite) => string;
}) {
  if (activite === null) return null;
  return (
    <div className="ligne">
      <span className="doux">
        {titre}
        <br />
        <span style={{ fontSize: '0.8rem' }}>{formatDate(activite.date)}</span>
      </span>
      <strong>{valeur(activite)}</strong>
    </div>
  );
}
