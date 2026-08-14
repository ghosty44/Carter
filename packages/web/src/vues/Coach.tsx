import { useEffect, useState } from 'react';
import { ajouterJours, aujourdhui } from '@carter/shared';
import { api } from '../api.js';
import { ErreurAffichee, Message } from '../composants.js';

export function VueCoach({ recharger }: { recharger: () => void }) {
  const [debut, setDebut] = useState(ajouterJours(aujourdhui(), -28));
  const [fin, setFin] = useState(aujourdhui());
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [questions, setQuestions] = useState<{ id: number; texte: string }[]>([]);
  const [nouvelle, setNouvelle] = useState('');

  useEffect(() => {
    api
      .questions()
      .then((r) => setQuestions(r.questions))
      .catch(() => setQuestions([]));
  }, []);

  async function generer(): Promise<void> {
    setErreur(null);
    try {
      const r = await api.exportCoach(debut, fin);
      setMarkdown(r.markdown);
      setJson(JSON.stringify(r.json, null, 2));
    } catch (e) {
      setErreur(e);
    }
  }

  async function copier(texte: string, quoi: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(quoi);
      setTimeout(() => setCopie(null), 2000);
    } catch {
      setErreur(new Error('Copie refusee par le navigateur. Selectionne le texte a la main.'));
    }
  }

  return (
    <>
      <h1>Coach</h1>
      <ErreurAffichee erreur={erreur} />

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Questions a poser</h2>
        {questions.length > 0 && (
          <ul>
            {questions.map((q) => (
              <li key={q.id}>{q.texte}</li>
            ))}
          </ul>
        )}
        <div className="rangee">
          <input
            style={{ flex: '1 1 200px', width: 'auto' }}
            value={nouvelle}
            placeholder="Une question pour le prochain echange…"
            onChange={(e) => setNouvelle(e.target.value)}
          />
          <button
            type="button"
            disabled={nouvelle.trim() === ''}
            onClick={() =>
              api
                .ajouterQuestion(nouvelle.trim())
                .then((r) => {
                  setQuestions(r.questions);
                  setNouvelle('');
                })
                .catch(setErreur)
            }
          >
            Ajouter
          </button>
        </div>
        <p className="doux">Les questions ouvertes sont jointes a l'export.</p>
      </section>

      <section className="carte">
        <h2 style={{ marginTop: 0 }}>Exporter pour le coach</h2>
        <div className="rangee">
          <label style={{ flex: '1 1 150px' }}>
            <span>Du</span>
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </label>
          <label style={{ flex: '1 1 150px' }}>
            <span>Au</span>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
        </div>
        <button type="button" className="principal" onClick={() => void generer()}>
          Exporter pour le coach
        </button>
      </section>

      {markdown !== null && (
        <section>
          <h2>Resume a coller</h2>
          <div className="rangee" style={{ marginBottom: 8 }}>
            <button type="button" onClick={() => void copier(markdown, 'markdown')}>
              Copier le Markdown
            </button>
            {json && (
              <button type="button" onClick={() => void copier(json, 'json')}>
                Copier le JSON complet
              </button>
            )}
            {copie && <span className="doux">{copie} copie</span>}
          </div>
          <pre className="bloc">{markdown}</pre>
        </section>
      )}

      <ImportRevise onApplique={recharger} />
    </>
  );
}

/**
 * Import d'un plan revise. Deux temps obligatoires : on valide et on montre
 * le diff, puis seulement on applique. Un plan qui change tout seul apres un
 * copier-coller est le meilleur moyen de perdre confiance dans l'outil.
 */
function ImportRevise({ onApplique }: { onApplique: () => void }) {
  const [contenu, setContenu] = useState('');
  const [diff, setDiff] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState<string | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  async function envoyer(appliquer: boolean): Promise<void> {
    setOccupe(true);
    setErreur(null);
    setSucces(null);
    try {
      const parse: unknown = JSON.parse(contenu);
      const r = await api.importerPlanRevise(parse, appliquer);
      setDiff(r.diff_markdown);
      setCommentaire(r.commentaire);
      if (r.applique) {
        setSucces('Plan revise applique. Une nouvelle version a ete enregistree.');
        setContenu('');
        onApplique();
      }
    } catch (e) {
      setErreur(
        e instanceof SyntaxError
          ? new Error("Le texte colle n'est pas du JSON valide.")
          : e,
      );
      setDiff(null);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <section className="carte">
      <h2 style={{ marginTop: 0 }}>Importer un plan revise</h2>
      <ErreurAffichee erreur={erreur} />
      {succes && <Message type="succes">{succes}</Message>}

      <label>
        <span>JSON renvoye par le coach</span>
        <textarea
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          placeholder="Colle ici le JSON conforme au schema d'echange…"
          style={{ minHeight: 140 }}
        />
      </label>

      <div className="rangee">
        <button
          type="button"
          disabled={occupe || contenu.trim() === ''}
          onClick={() => void envoyer(false)}
        >
          Valider et voir le diff
        </button>
        <button
          type="button"
          className="principal"
          disabled={occupe || diff === null}
          onClick={() => {
            if (confirm('Appliquer ce plan revise ? Le plan actuel reste dans l historique.'))
              void envoyer(true);
          }}
        >
          Appliquer
        </button>
      </div>

      {commentaire && (
        <>
          <h3>Commentaire du coach</h3>
          <p>{commentaire}</p>
        </>
      )}

      {diff !== null && (
        <>
          <h3>Ce qui changerait</h3>
          <pre className="bloc">{diff}</pre>
        </>
      )}
    </section>
  );
}
