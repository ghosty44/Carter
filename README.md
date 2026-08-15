# Carter

App web personnelle : connecte ton compte Garmin, regarde tes séances et tes
statistiques. Mono-utilisateur, en lecture seule — l'app ne modifie jamais rien
chez Garmin.

Trois écrans : **Séances**, **Stats**, **Compte**.

---

## Ce que ça affiche

**Séances** — toutes tes activités, groupées par mois, avec durée, distance,
allure (ou vitesse pour le vélo), dénivelé et fréquence cardiaque. Un appui
déplie le détail : temps écoulé, FC max, cadence, calories, charge
d'entraînement.

**Stats** — totaux des 4 dernières semaines, volume par semaine sur 3 mois avec
la part de course à pied, répartition par sport, tendances de forme (FC de
repos, sommeil, VFC, poids) et records de la période.

**Compte** — connexion Garmin et récupération des données.

Les activités sont mises en cache dans la base. Les écrans lisent le cache,
jamais Garmin directement : l'app reste rapide, et une API non officielle qu'on
martèle est une API qui finit par répondre non.

---

## La connexion Garmin, dite franchement

L'app se connecte à Garmin Connect par le même mécanisme que l'application
mobile : login SSO, échange contre des jetons OAuth, puis appels à l'API
interne. **Ce n'est pas une API publique.**

- **C'est contraire aux conditions d'utilisation de Garmin.** C'est ton compte
  et tes données, c'est ta décision.
- **Ça casse sans préavis.** Quand Garmin modifie son SSO, la connexion échoue
  jusqu'à correction. Tout est concentré dans `packages/server/src/garmin/sso.ts`.
- **Ça peut échouer depuis un hébergeur cloud.** La protection anti-bot devant
  le SSO bloque parfois les IP de datacenter là où une connexion domestique
  passe. Ce n'est pas systématique — ça vaut le coup d'essayer. Si tu vois une
  erreur d'authentification alors que tes identifiants sont bons, c'est la
  première piste, et la solution est d'héberger l'app chez toi.

**Ce qui est fait pour limiter la casse :**

- ton mot de passe n'est **jamais** stocké : il sert une fois à obtenir les
  jetons, puis il est oublié — pas en base, pas dans les journaux ;
- les jetons sont chiffrés en base (AES-256-GCM, clef dérivée de
  `SESSION_SECRET`) : une fuite de la base seule ne suffit pas à lire ton
  compte ;
- le jeton OAuth 1 vit environ un an et renouvelle le jeton d'accès tout seul :
  tu ne ressaisis pas ton mot de passe à chaque session ;
- « Déconnecter » efface les jetons. Pour révoquer côté Garmin, change ton mot
  de passe Garmin.

**Réserve de vérification** : le flux d'authentification n'a **pas** pu être
testé contre Garmin — pas d'accès réseau vers `sso.garmin.com` depuis
l'environnement de développement. Il suit la méthode publiquement documentée.
Ce qui est testé hors ligne : la signature OAuth 1, la conversion des réponses
et le chiffrement des jetons. Ta première connexion est donc aussi le premier
test réel du SSO.

---

## Démarrage

Il faut une base Postgres. Neon en propose une gratuite.

```bash
npm install
cp .env.example .env       # renseigne DATABASE_URL et SESSION_SECRET
npm run build
npm start                  # http://localhost:8787
```

En développement, deux terminaux :

```bash
npm run dev        # backend, port 8787
npm run dev:web    # frontend Vite, port 5173
```

Puis onglet **Compte** → connecte ton compte Garmin → **Récupérer mes données**.

---

## Déploiement sur Vercel

1. **Base** — Storage → Create Database → **Neon**, puis relie-la au projet.
   `DATABASE_URL` est injectée automatiquement.
2. **Variables** — Settings → Environment Variables, en Production :

| Variable | Valeur |
| --- | --- |
| `APP_PASSWORD` | une phrase longue, c'est ta porte d'entrée |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `GARMIN_ENABLED` | `true` |

3. **Déployer** — les migrations s'appliquent seules au premier appel d'API.

**La protection d'accès n'est pas optionnelle.** Sans elle, tes données Garmin
sont lisibles par qui trouve l'URL. En production, le serveur refuse de démarrer
sans `APP_PASSWORD` ni `SESSION_SECRET`.

Le fichier `vercel.json` épingle les fonctions à Paris (`cdg1`) et sert le
frontend en statique ; seul `/api/*` réveille une fonction.

---

## Architecture

```
api/        fonction Vercel : monte l'app Fastify
packages/
  shared/   types, formats, calculs de statistiques
  server/   Fastify + Postgres, client Garmin
  web/      React + Vite, mobile d'abord
```

Les dates sont manipulées en chaînes `YYYY-MM-DD`, jamais en `Date` : une
séance appartient à un jour, pas à un instant, et passer par des objets Date
introduit des décalages d'un jour.

Les statistiques sont calculées côté serveur, dans `shared`, par les mêmes
fonctions que celles des tests — plutôt que de transférer plusieurs centaines
d'activités au navigateur pour en tirer douze totaux.

Le client Garmin est découpé en trois : `sso.ts` (authentification, la partie
qui casse quand Garmin bouge), `contrat.ts` (forme des réponses, testable sur
fixtures) et `client.ts` (usage). Une réparation se limite en général à un seul
de ces fichiers.

### Tests

```bash
npm test
```

46 tests sans base : calculs de statistiques, conversion des réponses Garmin,
signature OAuth 1, chiffrement des jetons.

10 tests supplémentaires couvrent Postgres et ne s'exécutent que si
`TEST_DATABASE_URL` est renseignée :

```bash
TEST_DATABASE_URL=postgres://user@localhost:5432/carter_test npm test
```

**Ces tests effacent le schéma `public`** : ne les pointe jamais sur ta vraie
base.

---

## Historique

Ce dépôt a d'abord contenu une app de gestion de plan d'entraînement avec
synchronisation vers Intervals.icu, export coach et alertes. Elle a été retirée
au profit de l'app actuelle, plus simple. Tout reste dans l'historique git, au
commit précédant la réécriture.
