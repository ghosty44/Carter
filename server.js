'use strict';
require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));

const NOTION = 'https://api.notion.com/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

function nHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };
}

async function nQuery(dbId, body = {}) {
  const r = await fetch(`${NOTION}/databases/${dbId}/query`, {
    method: 'POST',
    headers: nHeaders(),
    body: JSON.stringify({ page_size: 100, ...body }),
  });
  return r.json();
}

function richText(page, prop) {
  return (page.properties[prop]?.rich_text ?? []).map(t => t.plain_text).join('');
}

// GET /api/data — recettes + garde-manger + 5 dernières semaines d'historique
app.get('/api/data', async (req, res) => {
  try {
    const [rR, rG, rH] = await Promise.all([
      nQuery(process.env.NOTION_DB_RECETTES, {
        filter: { property: 'Adapté_bébé', checkbox: { equals: true } },
        sorts: [{ property: 'Fois_préparé', direction: 'ascending' }],
      }),
      nQuery(process.env.NOTION_DB_GARDE_MANGER),
      nQuery(process.env.NOTION_DB_HISTORIQUE, {
        sorts: [{ property: 'Date_début', direction: 'descending' }],
        page_size: 5,
      }),
    ]);

    const recettes = rR.results.map(p => ({
      id: p.id,
      nom: p.properties.Nom.title[0]?.plain_text ?? '',
      categorie: p.properties.Catégorie.select?.name ?? '',
      jour_type: p.properties.Jour_type.select?.name ?? '',
      duree_minutes: p.properties['Durée_minutes'].number ?? 0,
      complexite: p.properties.Complexité.select?.name ?? '',
      adapte_bebe: p.properties['Adapté_bébé'].checkbox ?? false,
      derniere_preparation: p.properties['Dernière_préparation'].date?.start ?? null,
      fois_prepare: p.properties['Fois_préparé'].number ?? 0,
      ingredients: richText(p, 'Ingrédients'),
      source_url: p.properties.Source_url?.url ?? null,
      notes: richText(p, 'Notes'),
    }));

    const gardeManger = rG.results.map(p => ({
      id: p.id,
      article: p.properties.Article.title[0]?.plain_text ?? '',
      categorie: p.properties.Catégorie.select?.name ?? '',
      toujours_en_stock: p.properties.Toujours_en_stock.checkbox ?? false,
      a_renouveler: p.properties['À_renouveler'].checkbox ?? false,
    }));

    const historique = rH.results.map(p => ({
      id: p.id,
      semaine: p.properties.Semaine.title[0]?.plain_text ?? '',
      date_debut: p.properties['Date_début'].date?.start ?? null,
      statut: p.properties.Statut.select?.name ?? '',
      validation_json: richText(p, 'Validation_json'),
    }));

    res.json({ recettes, gardeManger, historique });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/historique — créer l'entrée de la semaine courante
app.post('/api/historique', async (req, res) => {
  const { semaine, date_debut, validation_json } = req.body;
  try {
    const r = await fetch(`${NOTION}/pages`, {
      method: 'POST',
      headers: nHeaders(),
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_DB_HISTORIQUE },
        properties: {
          Semaine: { title: [{ text: { content: semaine } }] },
          'Date_début': { date: { start: date_debut } },
          Statut: { select: { name: 'En attente' } },
          Validation_json: { rich_text: [{ text: { content: JSON.stringify(validation_json) } }] },
        },
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/historique/:id — mettre à jour statut et/ou menu
app.patch('/api/historique/:id', async (req, res) => {
  const { statut, validation_json } = req.body;
  const props = {};
  if (statut) props.Statut = { select: { name: statut } };
  if (validation_json !== undefined) {
    props.Validation_json = { rich_text: [{ text: { content: JSON.stringify(validation_json) } }] };
  }
  try {
    const r = await fetch(`${NOTION}/pages/${req.params.id}`, {
      method: 'PATCH',
      headers: nHeaders(),
      body: JSON.stringify({ properties: props }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recettes/:id — mise à jour stats d'usage après validation
app.patch('/api/recettes/:id', async (req, res) => {
  const { derniere_preparation, fois_prepare } = req.body;
  const props = {};
  if (derniere_preparation) props['Dernière_préparation'] = { date: { start: derniere_preparation } };
  if (fois_prepare !== undefined) props['Fois_préparé'] = { number: fois_prepare };
  try {
    const r = await fetch(`${NOTION}/pages/${req.params.id}`, {
      method: 'PATCH',
      headers: nHeaders(),
      body: JSON.stringify({ properties: props }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gemini/menu — proposer 7 recettes pour la semaine
app.post('/api/gemini/menu', async (req, res) => {
  const { recettes, historique } = req.body;

  const mois = new Date().getMonth();
  const saisons = ['Hiver','Hiver','Printemps','Printemps','Printemps','Été','Été','Été','Automne','Automne','Automne','Hiver'];
  const saison = saisons[mois];
  const today = new Date().toISOString().split('T')[0];

  const candidates = recettes.map(r => ({
    id: r.id,
    nom: r.nom,
    categorie: r.categorie,
    jour_type: r.jour_type,
    duree_minutes: r.duree_minutes,
    complexite: r.complexite,
  }));

  const prompt = `Tu es un assistant culinaire pour une famille française (2 adultes + 1 bébé de 12 mois).

MISSION : Sélectionner 7 recettes pour la semaine (lundi à dimanche) parmi les candidates.

CONTRAINTES :
- Toutes adaptées bébé 12 mois (pas d'épices fortes, pas de miel cru, pas de sel en excès)
- Lundi–vendredi : recettes simples (≤ 30 min), Samedi–dimanche : recettes élaborées
- Ne pas répéter les recettes de l'historique récent
- Varier les protéines (pas 2 jours consécutifs identiques)
- Favoriser les légumes de saison : ${saison}

CONTEXTE :
- Date : ${today}
- Saison : ${saison}
- Historique (noms à éviter) : ${JSON.stringify(historique)}

CANDIDATES :
${JSON.stringify(candidates)}

RÉPONSE : JSON uniquement, sans markdown ni commentaire.
{
  "menu": {
    "lundi":    { "id": "...", "nom": "...", "duree_min": 0 },
    "mardi":    { "id": "...", "nom": "...", "duree_min": 0 },
    "mercredi": { "id": "...", "nom": "...", "duree_min": 0 },
    "jeudi":    { "id": "...", "nom": "...", "duree_min": 0 },
    "vendredi": { "id": "...", "nom": "...", "duree_min": 0 },
    "samedi":   { "id": "...", "nom": "...", "duree_min": 0 },
    "dimanche": { "id": "...", "nom": "...", "duree_min": 0 }
  }
}`;

  try {
    const r = await fetch(`${GEMINI}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    const raw = data.candidates[0].content.parts[0].text;
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    const validIds = new Set(recettes.map(r => r.id));
    for (const [jour, info] of Object.entries(result.menu)) {
      if (!validIds.has(info.id)) {
        return res.status(422).json({ error: `ID invalide retourné par Gemini pour ${jour} : ${info.id}` });
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gemini/courses — générer la liste de courses consolidée
app.post('/api/gemini/courses', async (req, res) => {
  const { menu, recettes, gardeManger } = req.body;

  const recetteMap = Object.fromEntries(recettes.map(r => [r.id, r]));
  const rawIngredients = Object.entries(menu)
    .map(([, info]) => {
      const r = recetteMap[info.id];
      return r ? `=== ${info.nom} ===\n${r.ingredients}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  const pantryAlways = gardeManger.filter(g => g.toujours_en_stock).map(g => g.article).join(', ') || 'aucun';
  const pantryRestock = gardeManger.filter(g => g.a_renouveler).map(g => g.article).join(', ') || 'aucun';

  const prompt = `Tu es un assistant courses pour une famille française (2 adultes + 1 bébé de 12 mois).

MISSION : Consolider les ingrédients de 7 recettes en une liste de courses structurée par rayon.

ÉTAPES :
1. Dédoublonner et additionner les quantités identiques
2. Supprimer les articles du garde-manger permanent
3. Ajouter les articles à renouveler
4. Regrouper par rayon (ordre logique drive)
5. Ajuster les quantités pour 2 adultes + 1 bébé sur 7 jours
6. Normaliser les unités (g, kg, L, pcs, sachet, boîte)

INGRÉDIENTS BRUTS :
${rawIngredients}

GARDE-MANGER PERMANENT (exclure) : ${pantryAlways}
À RENOUVELER CETTE SEMAINE (inclure) : ${pantryRestock}

RÉPONSE : JSON uniquement, sans markdown.
{
  "liste_courses": {
    "Fruits & Légumes": [{ "article": "...", "quantite": "...", "unite": "..." }],
    "Viandes & Poissons": [],
    "Produits laitiers & Œufs": [],
    "Boulangerie": [],
    "Épicerie sèche": [],
    "Conserves & Sauces": [],
    "Surgelés": [],
    "Boissons": [],
    "Hygiène & Maison": []
  },
  "total_articles": 0
}`;

  try {
    const r = await fetch(`${GEMINI}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    const raw = data.candidates[0].content.parts[0].text;
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    res.json(JSON.parse(cleaned));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Carter → http://localhost:${PORT}`));
