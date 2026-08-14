# Reponses enregistrees d'Intervals.icu

Ces fichiers sont des reponses figees, utilisees par `tests/intervals.test.ts`.
Les tests ne tapent jamais l'API en direct : une suite qui depend du reseau
echoue pour des raisons qui n'ont rien a voir avec le code, et ne dit rien
d'utile quand elle passe.

## Statut : NON VERIFIEES CONTRE L'API REELLE

Ces fixtures ont ete ecrites a partir du brief et de la documentation publique
connue, dans un environnement sans acces reseau vers `intervals.icu`. Elles
decrivent ce que le code **attend**, pas ce que l'API **renvoie**.

## Comment les remplacer par de vraies reponses

Avec ta cle API personnelle, depuis une machine ayant acces au reseau :

```bash
ATHLETE=i123456
CLE=ta-cle-api

curl -s -u "API_KEY:$CLE" \
  "https://intervals.icu/api/v1/athlete/$ATHLETE/events?oldest=2026-03-01&newest=2026-03-31" \
  | python3 -m json.tool > evenements.json

curl -s -u "API_KEY:$CLE" \
  "https://intervals.icu/api/v1/athlete/$ATHLETE/activities?oldest=2026-03-01&newest=2026-03-31" \
  | python3 -m json.tool > activites.json

curl -s -u "API_KEY:$CLE" \
  "https://intervals.icu/api/v1/athlete/$ATHLETE/wellness?oldest=2026-03-01&newest=2026-03-31" \
  | python3 -m json.tool > wellness.json
```

Retire ensuite toute donnee personnelle que tu ne veux pas versionner, relance
`npm test`, et corrige `src/providers/intervals-contrat.ts` si des noms de
champs different. Le reste du code n'a pas a bouger : c'est le seul fichier qui
connait la forme des reponses.
