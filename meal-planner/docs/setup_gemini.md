# Setup Google Gemini API (gratuit)

## 1. Obtenir la clé API

1. Aller sur [aistudio.google.com](https://aistudio.google.com)
2. Se connecter avec un compte Google
3. Cliquer **Get API key** → **Create API key in new project**
4. Copier la clé (`AIza...`)

> Aucune carte bancaire requise. Le tier gratuit Gemini 1.5 Flash :
> - 15 requêtes/minute
> - 1 500 requêtes/jour
> - 1 000 000 tokens/jour
>
> Pour ce projet : ~4 requêtes/semaine → marge extrême.

## 2. Tester la clé (optionnel)

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=TON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Dis bonjour en français"}]}]}'
```

Réponse attendue : un JSON avec `candidates[0].content.parts[0].text`.

## 3. Configuration dans n8n

Dans n8n, les appels Gemini se font via le nœud **HTTP Request** :
- Method : `POST`
- URL : `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={{ $env.GEMINI_API_KEY }}`
- Body : JSON avec le contenu du prompt

Ajouter `GEMINI_API_KEY` dans les variables d'environnement Railway (ne jamais la mettre dans le code).

## Variable à sauvegarder

```
GEMINI_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
