# Setup Telegram Bot

## 1. Créer le bot

1. Ouvrir Telegram → chercher **@BotFather**
2. Envoyer `/newbot`
3. Nom du bot : `Carter Meal Planner`
4. Username : `carter_meal_bot` (ou tout autre nom disponible)
5. BotFather renvoie un **token** → le copier et le garder secret

## 2. Récupérer ton `chat_id`

1. Démarrer ton bot en lui envoyant `/start`
2. Ouvrir Telegram → chercher **@userinfobot**
3. Lui envoyer `/start` → il affiche ton `chat_id`
4. Répéter pour le compte de ta conjointe si elle souhaite aussi recevoir les messages

> Le `chat_id` est l'identifiant unique de la conversation avec le bot. Il faut le stocker dans les variables d'environnement Railway.

## 3. Partager le bot avec ta conjointe

Envoyer le lien `t.me/carter_meal_bot` à ta conjointe.  
Elle démarre le bot → son `chat_id` apparaît dans les logs n8n au premier message.  
Ajouter son `chat_id` dans la variable `TELEGRAM_FAMILY_CHAT_IDS` (séparés par une virgule).

## 4. Enregistrement du webhook (automatique via n8n)

n8n enregistre le webhook Telegram automatiquement au démarrage du workflow Telegram Trigger.  
Vérifier que c'est actif :
```
https://api.telegram.org/bot<TON_TOKEN>/getWebhookInfo
```
Doit retourner `"url": "https://ton-domaine.railway.app/webhook/..."`.

## Variables à sauvegarder

```
TELEGRAM_BOT_TOKEN=7xxxxxxxxx:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID_PRINCIPAL=123456789
TELEGRAM_CHAT_ID_CONJOINT=987654321
```
