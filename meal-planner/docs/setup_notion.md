# Setup Notion

## 1. Créer l'intégration Notion

1. Aller sur [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Cliquer **+ New integration**
3. Nom : `Carter Meal Planner`
4. Type : **Internal integration**
5. Capabilities : cocher `Read content`, `Update content`, `Insert content`
6. Copier le **Internal Integration Token** (`ntn_...`)

## 2. Créer les 3 bases de données

### Base 1 — Recettes
- Nouvelle page Notion → choisir **Database (full page)**
- Nom : `Recettes`
- Créer les propriétés selon `notion/schema_recettes.md`
- Partager avec l'intégration : `...` → **Connections** → Carter Meal Planner
- Copier l'**ID de la base** depuis l'URL : `notion.so/workspace/`**`DATABASE_ID`**`?v=...`

### Base 2 — Garde-manger
- Même procédure
- Créer les propriétés selon `notion/schema_garde_manger.md`
- Ajouter les ~20 articles permanents listés dans le schéma

### Base 3 — Historique_menus
- Même procédure
- Créer les propriétés selon `notion/schema_historique_menus.md`
- Créer les **Relations** vers la base Recettes (propriétés `Recettes_proposées` et `Recettes_validées`)

## 3. Importer les recettes initiales

1. Ouvrir la base **Recettes** dans Notion
2. `...` → **Import** → **CSV**
3. Charger le fichier `notion/recettes_initiales.csv`
4. Mapper les colonnes sur les propriétés Notion

## 4. Variables à sauvegarder

```
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DB_RECETTES=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DB_GARDE_MANGER=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DB_HISTORIQUE=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> Les IDs de base ont le format `32 caractères hexadécimaux` (sans tirets dans l'URL, avec tirets dans l'API).
