# Schéma Notion — Base `Historique_menus`

## Propriétés

| Propriété | Type Notion | Valeurs / Notes |
|---|---|---|
| `Semaine` | **Title** | Format ISO : `2026-W17` |
| `Date_début` | **Date** | Lundi de la semaine |
| `Recettes_proposées` | **Relation → Recettes** | Les 7 recettes proposées par l'IA |
| `Recettes_validées` | **Relation → Recettes** | Subset validé par la famille |
| `Statut` | **Select** | En attente · Validé · Courses faites |
| `Liste_courses_finale` | **Rich Text** | Liste générée après soustraction garde-manger |
| `Telegram_message_id` | **Number** | ID du message Telegram pour édition en-place |
| `Telegram_chat_id` | **Number** | ID du chat Telegram de la famille |
| `Validation_json` | **Rich Text** | JSON intermédiaire stockant l'état de validation jour par jour |
| `Note_semaine` | **Rich Text** | Notes libres de la famille sur cette semaine |

## Champ `Validation_json` — format

Ce champ permet à n8n de connaître l'état de chaque jour sans perdre de données entre les redémarrages :

```json
{
  "lundi":    { "id": "notion_id", "nom": "Poulet rôti", "validé": true },
  "mardi":    { "id": "notion_id", "nom": "Pâtes bolognaise", "validé": false },
  "mercredi": { "id": "notion_id", "nom": "Saumon vapeur", "validé": false },
  "jeudi":    { "id": "notion_id", "nom": "Gratin courgettes", "validé": false },
  "vendredi": { "id": "notion_id", "nom": "Soupe légumes", "validé": false },
  "samedi":   { "id": "notion_id", "nom": "Quiche lorraine", "validé": false },
  "dimanche": { "id": "notion_id", "nom": "Blanquette veau", "validé": false }
}
```

n8n met à jour ce champ JSON à chaque clic sur un bouton Telegram inline.
