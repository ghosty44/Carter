# Intégration Intermarché Drive API

## Accès développeur

1. Aller sur [developers.intermarche.com](https://developers.intermarche.com)
2. Créer un compte développeur
3. Soumettre une demande d'accès API (usage personnel / projet familial)
4. Attendre validation (délai variable)

Une fois l'accès accordé, récupérer :
- `INTERMARCHE_CLIENT_ID`
- `INTERMARCHE_CLIENT_SECRET`
- `INTERMARCHE_STORE_ID` (numéro de ton magasin Intermarché)

## Workflow Drive (Workflow 4)

Une fois les credentials obtenus, le Workflow 4 suit cette séquence :

```
POST /oauth/token
  → body: grant_type=client_credentials
  → retourne: access_token (valable ~1h)

GET /stores/{store_id}/catalog/search?q={article_name}
  → retourne: liste de produits avec product_id, prix, stock

POST /carts/current/items
  → body: { product_id, quantity }
  → ajoute l'article au panier courant

GET /carts/current
  → retourne le récapitulatif du panier
```

## Fallback si API non disponible

Si l'accès API n'est pas encore accordé (ou refusé), le Workflow 3 envoie déjà une liste de courses **formatée par catégorie** via Telegram, prête à utiliser manuellement dans l'interface Intermarché Drive.

Format de la liste Telegram envoyée en fallback :

```
🛒 Liste de courses — Semaine 17

🥦 Fruits & Légumes
• Carottes — 8 pcs
• Courgettes — 4 pcs
• Brocoli — 1 tête

🥩 Viandes & Poissons
• Pavés de saumon — 2 pcs
• Bœuf haché — 400 g

🧀 Produits laitiers
• Gruyère râpé — 200 g
• Crème fraîche — 200 ml

...

Total : 23 articles
```

Ce format par rayon (correspondant à l'ordre logique du drive) réduit le temps de saisie manuelle de 30 min à ~5 min.

## Variable à sauvegarder

```
INTERMARCHE_CLIENT_ID=<id>
INTERMARCHE_CLIENT_SECRET=<secret>
INTERMARCHE_STORE_ID=<id_magasin>
```
