# Setup n8n sur Railway (gratuit)

Railway offre $5 de crédit gratuit/mois. n8n y consomme ~$2.50/mois → **coût net : 0€**.

## 1. Créer le compte Railway

1. Aller sur [railway.app](https://railway.app)
2. Se connecter via **GitHub** (recommandé)
3. Vérifier son email si demandé

## 2. Déployer n8n

1. Dashboard Railway → **New Project**
2. Choisir **Deploy a Docker image**
3. Image : `n8nio/n8n`
4. Cliquer **Deploy**

Railway génère automatiquement un domaine HTTPS public (ex: `n8n-production-xxxx.railway.app`).

## 3. Configurer les variables d'environnement

Dans Railway → ton projet → onglet **Variables** → ajouter :

```
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=<mot_de_passe_fort>
N8N_HOST=<ton-domaine>.railway.app
N8N_PORT=5678
N8N_PROTOCOL=https
WEBHOOK_URL=https://<ton-domaine>.railway.app
DB_TYPE=sqlite
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168

# Secrets de l'application
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_CHAT_ID_PRINCIPAL=<chat_id>
TELEGRAM_CHAT_ID_CONJOINT=<chat_id>
NOTION_TOKEN=<token>
NOTION_DB_RECETTES=<id>
NOTION_DB_GARDE_MANGER=<id>
NOTION_DB_HISTORIQUE=<id>
GEMINI_API_KEY=<clé>
```

## 4. Accéder à n8n

1. Ouvrir `https://<ton-domaine>.railway.app`
2. Se connecter avec `admin` + ton mot de passe
3. n8n est prêt

## 5. Importer les workflows

1. Dans n8n → **Workflows** → **Import from file**
2. Importer dans l'ordre :
   - `n8n/05_commandes_telegram.json`
   - `n8n/01_planifier_semaine.json`
   - `n8n/02_validation_callbacks.json`
   - `n8n/03_generer_liste_courses.json`
   - `n8n/04_intermarche_drive.json`
3. Pour chaque workflow : ouvrir, configurer les credentials (Telegram, Notion), activer

## 6. Configurer les credentials n8n

Dans n8n → **Settings** → **Credentials** :

- **Telegram Bot API** : coller le bot token
- **Notion API** : coller le integration token
- Pas de credential pour Gemini : la clé est passée directement dans l'URL via `$env.GEMINI_API_KEY`

## Suivi des coûts Railway

Surveiller dans Railway → **Usage** que la consommation reste sous $5/mois.  
n8n avec SQLite (faible charge) consomme généralement 256MB RAM → ~$2-3/mois.

## Alternatives si Railway devient payant

1. **Oracle Cloud Always Free** : VM ARM 4 cœurs / 24GB RAM — n8n tourne en permanence, gratuitement, mais configuration plus complexe
2. **Fly.io** : tier gratuit, 3 VM partagées, déploiement Docker similaire
3. **Render.com** : gratuit mais sleep après 15min d'inactivité (les triggers schedulés peuvent manquer)
