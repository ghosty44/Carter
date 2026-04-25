# Carter Meal Planner

Automatisation repas + courses pour famille (2 adultes + bébé 12 mois).

**Stack :** Telegram Bot · n8n (Railway) · Notion · Gemini API · Intermarché Drive  
**Coût :** 0€/mois (Railway $5 crédit gratuit, Gemini gratuit, Notion gratuit)

---

## Ce que ça fait

1. **Chaque lundi à 8h**, ou à la demande via `/planifier`, le bot propose 7 recettes pour la semaine (5 simples en semaine, 2 élaborées le weekend) — toutes adaptées bébé, jamais répétées dans les 3 dernières semaines.

2. **Tu valides ou remplaces** chaque recette depuis Telegram (boutons inline).

3. **La liste de courses est générée automatiquement** : ingrédients dédupliqués, garde-manger soustrait, regroupés par rayon.

4. **La liste est envoyée au Drive Intermarché** (ou copiée/collée en 5 min si l'API n'est pas encore activée).

---

## Commandes Telegram

| Commande | Action |
|---|---|
| `/planifier` | Propose le menu de la semaine maintenant |
| `/courses` | Affiche la liste de courses de la semaine |
| `/ajouter Lait de coco` | Ajoute un article à la liste |
| `/statut` | Statut de la semaine (En attente / Validé / Courses faites) |
| `/aide` | Affiche l'aide |

---

## Installation

### Prérequis (comptes gratuits)

- [ ] [Telegram](https://telegram.org) — créer un bot via @BotFather
- [ ] [Notion](https://notion.so) — compte existant ou nouveau
- [ ] [Google AI Studio](https://aistudio.google.com) — clé API Gemini gratuite
- [ ] [Railway.app](https://railway.app) — compte GitHub requis

### Ordre de setup

1. **[Telegram](docs/setup_telegram.md)** — créer le bot, récupérer token + chat_id
2. **[Notion](docs/setup_notion.md)** — intégration + 3 bases de données + import recettes CSV
3. **[Gemini](docs/setup_gemini.md)** — clé API gratuite
4. **[Railway + n8n](docs/setup_railway.md)** — déploiement et import des workflows
5. **[Intermarché Drive](docs/intermarche_api.md)** — optionnel, à activer quand l'accès API est accordé

---

## Structure du projet

```
meal-planner/
├── README.md                       ← Ce fichier
│
├── n8n/                            ← Workflows à importer dans n8n
│   ├── 01_planifier_semaine.json   ← Trigger lundi + proposition IA
│   ├── 02_validation_callbacks.json← Gestion boutons Telegram
│   ├── 03_generer_liste_courses.json← Génération et envoi liste
│   ├── 04_intermarche_drive.json   ← Sync panier Drive (nécessite API)
│   └── 05_commandes_telegram.json  ← /planifier /courses /ajouter etc.
│
├── prompts/                        ← Prompts Gemini (référence)
│   ├── 01_selection_recettes.md    ← Prompt sélection menu hebdo
│   └── 02_liste_courses.md         ← Prompt consolidation courses
│
├── notion/                         ← Schémas et données initiales
│   ├── schema_recettes.md          ← Propriétés base Recettes
│   ├── schema_garde_manger.md      ← Propriétés base Garde-manger
│   ├── schema_historique_menus.md  ← Propriétés base Historique
│   └── recettes_initiales.csv      ← 25 recettes de démarrage à importer
│
└── docs/                           ← Guides d'installation pas-à-pas
    ├── setup_telegram.md
    ├── setup_notion.md
    ├── setup_gemini.md
    ├── setup_railway.md
    └── intermarche_api.md
```

---

## Variables d'environnement (Railway)

Ne jamais committer ces valeurs. Les stocker dans Railway → Variables.

```env
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID_PRINCIPAL=
TELEGRAM_CHAT_ID_CONJOINT=

# Notion
NOTION_TOKEN=
NOTION_DB_RECETTES=
NOTION_DB_GARDE_MANGER=
NOTION_DB_HISTORIQUE=

# Gemini (gratuit)
GEMINI_API_KEY=

# Intermarché (optionnel)
INTERMARCHE_CLIENT_ID=
INTERMARCHE_CLIENT_SECRET=
INTERMARCHE_STORE_ID=

# n8n
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=
WEBHOOK_URL=https://<ton-domaine>.railway.app
```

---

## Ajouter de nouvelles recettes

Dans Notion, ouvrir la base **Recettes** et ajouter une ligne :
- Remplir `Nom`, `Catégorie`, `Jour_type`, `Durée_minutes`, `Complexité`
- Cocher `Adapté_bébé` si la recette convient à un bébé de 12 mois
- Dans `Ingrédients` : un ingrédient par ligne au format `Nom quantité unité`

La recette sera automatiquement incluse dans les propositions futures.

---

## Limites des tiers gratuits

| Service | Limite | Usage estimé | Marge |
|---|---|---|---|
| Railway | $5/mois | ~$2.50/mois | ✅ Confortable |
| Gemini 1.5 Flash | 1 500 req/jour | ~4 req/semaine | ✅ Extrême |
| Notion API | Illimitée | ~50 appels/semaine | ✅ |
| Telegram Bot API | Illimitée | ~20 messages/semaine | ✅ |
