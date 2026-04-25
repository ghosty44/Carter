# Schéma Notion — Base `Garde-manger`

## Propriétés

| Propriété | Type Notion | Valeurs / Notes |
|---|---|---|
| `Article` | **Title** | Nom de l'article (doit correspondre aux noms dans `Ingrédients` des recettes) |
| `Catégorie` | **Select** | Épices & Aromates · Huiles & Vinaigres · Féculents · Conserves · Condiments · Surgelés |
| `Toujours_en_stock` | **Checkbox** | Si coché → jamais ajouté à la liste de courses |
| `À_renouveler` | **Checkbox** | Si coché → ajouté à la liste cette semaine (remettre à false après les courses) |

## Garde-manger de base recommandé

Ajouter ces articles au démarrage, tous avec `Toujours_en_stock = true` :

- Sel, Poivre, Huile d'olive, Huile de tournesol
- Vinaigre, Moutarde, Sauce soja
- Farine, Sucre, Maïzena
- Concentré de tomate, Bouillon cube légumes, Bouillon cube poulet
- Herbes de Provence, Thym, Laurier, Cumin, Paprika, Noix de muscade
- Ail en poudre, Oignon en poudre
- Pâtes (stock), Riz (stock), Lentilles (stock)
- Beurre, Crème fraîche (si toujours en stock chez vous)

## Usage

n8n interroge cette base dans Workflow 3 :
1. Tous les articles `Toujours_en_stock = true` → soustraits de la liste de courses
2. Tous les articles `À_renouveler = true` → ajoutés à la liste de courses
3. Après les courses, n8n remet `À_renouveler = false` sur tous les articles
