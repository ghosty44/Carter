# Schéma Notion — Base `Recettes`

Créer une base de données Notion avec les propriétés suivantes.

## Propriétés

| Propriété | Type Notion | Valeurs / Notes |
|---|---|---|
| `Nom` | **Title** | Nom de la recette en français |
| `Catégorie` | **Select** | Viandes · Poissons · Végétarien · Pâtes & Riz · Soupe · Salade |
| `Jour_type` | **Select** | Semaine · Weekend |
| `Durée_minutes` | **Number** | Durée totale prep + cuisson (entier) |
| `Complexité` | **Select** | Facile · Moyenne · Élaborée |
| `Adapté_bébé` | **Checkbox** | Cocher si adapté à un bébé ≥ 12 mois |
| `Dernière_préparation` | **Date** | Mis à jour automatiquement par n8n à chaque usage |
| `Fois_préparé` | **Number** | Compteur, incrémenté par n8n à chaque usage. Défaut : 0 |
| `Ingrédients` | **Rich Text** | Un ingrédient par ligne, format : `Nom quantité unité` (ex: `Carottes 4 pcs`) |
| `Source_url` | **URL** | Optionnel — lien vers la recette originale |
| `Notes` | **Rich Text** | Notes de la famille, adaptations bébé, variantes |

## Filtres utilisés par n8n

- Proposer des recettes : `Adapté_bébé = true` ET `Dernière_préparation > il y a 21 jours` (ou vide)
- Tri : `Fois_préparé` croissant → favorise les recettes peu faites

## Import initial

Importer le fichier `recettes_initiales.csv` via l'import CSV de Notion.
Chemin : `meal-planner/notion/recettes_initiales.csv`
