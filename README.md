# Carter

Gestion et synchronisation d'un plan d'entrainement de trail sur 12 mois.

L'app est la source de verite du plan. Elle le pousse vers le calendrier
d'entrainement, recupere les donnees realisees, et produit un export destine a
un coach IA qui renvoie un plan revise que l'app reimporte. C'est une boucle :
plan pousse, donnees recuperees, plan ajuste, plan repousse.

Mono-utilisateur. Aucun compte, aucune authentification tierce.

---

## Pourquoi l'app n'est pas construite autour de Garmin

L'API Training de Garmin — celle qui permet de pousser des seances structurees
vers Garmin Connect — **n'est pas accessible a un particulier**. Elle fait
partie du Garmin Connect Developer Program et exige une candidature validee
dans le cadre d'un partenariat.

L'app est donc construite autour d'une interface `PlanSyncProvider` dont Garmin
n'est qu'une implementation, desactivee par defaut.

| Provider | Ecriture du plan | Lecture des donnees | Etat dans l'app |
| --- | --- | --- | --- |
| **Intervals.icu** | oui | activites + wellness | chemin principal |
| **Garmin direct** (non officiel) | non | tout, Body Battery compris | desactive par defaut |
| Fichier local (.ics, .csv) | export manuel | non | disponible, sans aucune cle |
| Bac a sable (memoire) | oui | non | disponible, pour essayer sans risque |
| Garmin Training API | oui | oui | squelette desactive |

**Intervals.icu est le chemin qui fonctionne pour l'ecriture** : il se connecte
a Garmin Connect cote utilisateur, donc les seances poussees vers Intervals.icu
redescendent sur la montre sans acces partenaire.

Pour la **lecture**, un second chemin existe : la connexion directe au compte
Garmin Connect, decrite plus bas.

---

## Demarrage

L'app a besoin d'une base Postgres. Cree-en une gratuitement sur
[Neon](https://neon.tech) (ou utilise un Postgres local), puis :

```bash
npm install
cp .env.example .env          # renseigne au moins DATABASE_URL
npm run build
npm start                     # http://localhost:8787
```

Les migrations sont appliquees automatiquement au demarrage.

En developpement, deux terminaux :

```bash
npm run dev        # backend, port 8787
npm run dev:web    # frontend Vite, port 5173, proxy /api vers 8787
```

### Charger le plan initial

L'app demarre sans plan. Le bloc 1 decrit dans le brief est fourni :

1. ouvre l'app, onglet **Plan** ;
2. importe `data/plan-bloc1.json`.

Pour le regenerer a une autre date de depart (le lundi de la semaine 1) :

```bash
cd packages/server
npx tsx scripts/generer-bloc1.ts 2026-09-07
```

Le script refuse d'ecrire un plan qui ne passe pas la validation, et affiche
le tableau des volumes pour verification.

---

## Obtenir les cles, provider par provider

### Intervals.icu

1. cree un compte sur [intervals.icu](https://intervals.icu) ;
2. connecte Garmin Connect : **Settings > Connections > Garmin**. C'est cette
   liaison qui fait redescendre les seances planifiees vers ta montre ;
3. genere une cle API : **Settings > Developer Settings > API Key** ;
4. releve ton identifiant athlete, visible dans l'URL de ton profil, au format
   `i123456` ;
5. renseigne dans `.env` :

```
INTERVALS_ATHLETE_ID=i123456
INTERVALS_API_KEY=ta-cle
```

L'authentification est un basic auth avec le login **litteral** `API_KEY` et la
cle en mot de passe. La cle reste cote serveur : le navigateur n'appelle jamais
Intervals.icu directement.

### Garmin

Non disponible. Il faut candidater au
[Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/training-api/).
Tant que `GARMIN_ENABLED` vaut `false`, le provider refuse toute operation avec
un message explicite.

**Ne mets jamais tes identifiants Garmin Connect dans cette app.** Ce n'est pas
le mecanisme prevu, c'est contraire aux conditions d'utilisation, et les
bibliotheques non officielles qui scrapent la session cassent a chaque
changement chez Garmin. Si l'acces partenaire n'est pas accorde, la reponse est
« on reste sur Intervals.icu ».

### Garmin direct — connexion a ton compte

Se connecte a Garmin Connect par le meme mecanisme que l'application mobile :
login SSO, echange contre des jetons OAuth, puis appels a l'API interne.
**Lecture seule.**

Activation :

```
GARMIN_DIRECT_ENABLED=true
SESSION_SECRET=<obligatoire, sert a chiffrer les jetons>
```

Puis onglet **Ressenti** de l'app, section Garmin Connect : identifiant et mot
de passe, plus le code de verification si tu as la double authentification.

Ce que ca remonte en plus d'Intervals.icu : Body Battery, stress moyen, et le
detail du sommeil. Ces valeurs arrivent dans la note du jour — aucune des cinq
regles d'alerte ne les utilise, elles servent au coach et a la lecture.

**Ce que ca coute, dit franchement :**

- **C'est contraire aux conditions d'utilisation de Garmin.** C'est ton compte
  et tes donnees, c'est ta decision ; le code est la.
- **Ca casse sans preavis.** Quand Garmin modifie son SSO, la connexion echoue
  jusqu'a correction. Tout est concentre dans
  `packages/server/src/providers/garmin-direct-sso.ts` : la reparation ne
  touche que ce fichier.
- **Ca marche mal depuis un hebergeur cloud.** Le SSO Garmin est derriere une
  protection anti-bot : une requete venant d'une IP de datacenter (Vercel,
  AWS, Fly) se fait souvent bloquer, la ou la meme requete aboutit depuis une
  connexion domestique. Le piege classique est que ca marche en local et
  echoue une fois deploye. Si tu tiens a ce provider, heberge l'app chez toi.
  Une erreur 401 ou 403 sur ce chemin affiche un message qui le rappelle.

**Ce qui est fait pour limiter la casse :**

- ton mot de passe n'est **jamais** stocke : il sert une fois a obtenir les
  jetons, puis il est oublie — pas en base, pas en journal ;
- les jetons sont chiffres en base (AES-256-GCM, clef derivee de
  `SESSION_SECRET`) : une fuite de la base seule ne suffit pas a lire ton
  compte ;
- le jeton OAuth 1 vit environ un an et sert a renouveler le jeton d'acces
  tout seul : tu ne ressaisis pas ton mot de passe a chaque session ;
- « Deconnecter » efface les jetons. Pour revoquer cote Garmin, change ton mot
  de passe Garmin.

**Etat de verification** : le flux d'authentification n'a **pas** pu etre teste
contre Garmin — pas d'acces reseau vers `sso.garmin.com` depuis l'environnement
de developpement. Il suit la methode publiquement documentee (celle de
`garth`). Ce qui est teste hors ligne : la signature OAuth 1 (regles
d'encodage et de construction de la chaine de signature), la conversion des
reponses vers les types Carter, et le chiffrement des jetons. La premiere
connexion reelle est donc aussi le premier test du flux SSO.

### Strava

Non implemente. L'interface `PlanSyncProvider` est prete a l'accueillir en
lecture seule (`capacites().ecrire === false`) : Strava ne permet pas d'ecrire
des seances planifiees, et ne remonte pas le wellness — ce serait un recul par
rapport aux deux chemins existants.

---

## Verifier le contrat Intervals.icu — a faire avant la premiere synchro reelle

**Le contrat d'API n'a pas pu etre confronte a la documentation en direct.**
L'environnement de developpement n'avait pas d'acces reseau vers
`intervals.icu`. Les noms de champs proviennent du brief et de la documentation
publique connue.

Tout ce qui touche a la forme des requetes et des reponses est concentre dans
un seul fichier : `packages/server/src/providers/intervals-contrat.ts`. Le reste
du code ne manipule que des types Carter.

Avant la premiere synchro reelle :

1. recupere de vraies reponses et remplace les fixtures — la procedure exacte
   est dans `packages/server/tests/fixtures/intervals/README.md` ;
2. lance `npm test` ;
3. si des noms de champs different, corrige **uniquement**
   `intervals-contrat.ts` ;
4. fais une premiere synchro sur une fenetre courte (`SYNC_WINDOW_WEEKS=1`) et
   verifie le resultat dans Intervals.icu avant d'elargir.

L'apercu obligatoire avant application limite deja les degats : rien ne part
tant que tu n'as pas confirme.

---

## Comment la synchronisation se comporte

Le moteur applique trois garanties, toutes couvertes par des tests.

**Apercu obligatoire.** « Previsualiser la synchro » calcule le diff et affiche
trois listes — a creer, a mettre a jour, a supprimer — avec le motif de chaque
operation. Rien n'est envoye avant confirmation.

**Protection du passe.** Aucune ecriture ni suppression sur une date anterieure
a aujourd'hui, ni cote plan ni cote provider. Une seance deplacee depuis une
date passee est recreee a sa nouvelle date, et l'ancien evenement est laisse
intact : le passe est de l'historique, on ne le reecrit pas.

**Propriete.** Seuls les evenements crees par Carter sont supprimables. Ils
sont identifies par le prefixe `INTERVALS_EVENT_PREFIX` dans leur nom et par la
table de correspondance locale. Une sortie club ajoutee a la main dans ton
calendrier n'est jamais touchee, meme si elle tombe le meme jour qu'une seance
du plan. **Ne change pas le prefixe apres une premiere synchro** : les
evenements deja crees ne seraient plus reconnus comme appartenant a l'app.

Par ailleurs :

- **fenetre limitee** : 6 semaines par defaut, pour ne pas encombrer le
  calendrier avec 12 mois de seances qui vont changer ;
- **idempotence** : chaque creation porte une clef deterministe
  (`carter:bloc:seance`) envoyee en `external_id`, ce qui absorbe le double-clic
  et le rejeu apres timeout ;
- **reprise sur erreur** : une operation qui echoue n'interrompt pas les
  autres ; l'ecran de resultat propose de rejouer uniquement les echecs ;
- **limitation de debit** : file sequentielle, delai reglable entre requetes,
  backoff exponentiel sur 429 et 5xx, aucun retry sur les erreurs definitives ;
- **sauvegarde** : un instantane du plan et de son historique est pris avant
  chaque synchro et chaque import de plan revise (30 derniers conserves) ;
- **revalidation** : un apercu affiche hier soir et confirme ce matin est
  reverifie operation par operation avant envoi ;
- **budget de temps** : sur une plateforme qui tue les fonctions apres un
  delai fixe, le moteur s'arrete avant la coupure et annonce ce qui reste,
  plutot que de se faire interrompre au milieu d'une requete.

### Quels types sont synchronises

Reglage retenu : **course + renforcement, sans le velo**. Le renfo part vers le
calendrier parce qu'il porte les consignes de prevention, qui doivent etre
lisibles au moment ou elles servent. Modifiable via `SYNC_TYPES`.

---

## Boucle avec le coach

**Exporter.** Onglet Coach, choisis une periode, « Exporter pour le coach ».
Deux sorties decrivant la meme periode :

- un **resume Markdown** court, a coller dans une conversation : prevu contre
  realise par semaine, seances manquees avec leur raison, tendances de forme,
  douleurs avec leur evolution, alertes, contraintes permanentes, questions ;
- un **JSON complet** conforme au schema d'echange versionne, contenant le plan
  actuel pour que le coach puisse le renvoyer amende.

**Reimporter.** Colle le JSON renvoye, « Valider et voir le diff ». L'app
verifie le schema, refuse un plan incoherent avec un rapport lisible, et
affiche ce qui changerait. Rien n'est applique avant que tu confirmes. Le plan
precedent reste dans l'historique.

Le schema d'echange est en version 1 et defini dans
`packages/shared/src/coach.ts`. Un import portant une version inconnue est
refuse plutot qu'interprete au juge.

---

## Alertes

Cinq regles calculees localement, affichees sur l'onglet Plan. **Elles
informent, elles ne modifient jamais le plan.** Ce n'est pas un avis medical.

| Regle | Declenchement |
| --- | --- |
| Volume en hausse | plus de 10 % par rapport a la derniere semaine de charge |
| Charge enchainee | 4e semaine de charge consecutive sans allegement |
| FC de repos | plus de 5 bpm au-dessus de la moyenne 14 jours, 3 jours de suite |
| Douleur persistante | meme zone a 4+/10 sur deux seances consecutives |
| Observance faible | sous 60 % sur deux semaines terminees |

### Un ecart assume sur la regle du volume

Le brief demande de comparer a la semaine **precedente**. Applique
litteralement, cela declenche l'alerte apres **chaque** semaine allegee : le
bloc 1 passe de 1h20 en semaine 4 a 2h10 en semaine 5, soit +63 %, ce qui est
le fonctionnement normal d'une periodisation.

La comparaison se fait donc avec la derniere semaine **non allegee**. Une
alerte qui se declenche a chaque cycle est une alerte qu'on apprend a ignorer,
et le jour ou la hausse est reellement anormale elle passerait inapercue. Le
message indique la semaine de reference quand ce n'est pas la precedente.

---

## Deploiement sur Vercel

### 1. Base de donnees

Depuis le tableau de bord Vercel : **Storage > Create Database > Neon
(Postgres)**, puis rattache-la au projet. Vercel injecte `DATABASE_URL` dans
les variables d'environnement — rien a copier a la main.

Si tu crees la base directement chez Neon, prends l'URL **poolee** (elle
contient `-pooler`) et ajoute-la en variable `DATABASE_URL`.

### 2. Variables d'environnement

Dans **Settings > Environment Variables**, pour l'environnement Production :

| Variable | Valeur |
| --- | --- |
| `DATABASE_URL` | injectee par l'integration Neon |
| `APP_PASSWORD` | une phrase longue, c'est ta porte d'entree |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `INTERVALS_ATHLETE_ID` | ton identifiant, format `i123456` |
| `INTERVALS_API_KEY` | ta cle personnelle |

**La protection d'acces n'est pas optionnelle.** Sans elle, ton plan, tes
douleurs et tes donnees de sommeil sont lisibles par qui trouve l'URL. En
`NODE_ENV=production`, le serveur **refuse de demarrer** sans `APP_PASSWORD` ni
`SESSION_SECRET`.

### 3. Deployer

```bash
npm i -g vercel
vercel link
vercel --prod
```

Le premier deploiement applique les migrations tout seul, au premier appel
d'API. Ouvre ensuite l'app et importe `data/plan-bloc1.json`.

### Comment c'est cable

`vercel.json` decrit tout :

- **frontend** : `packages/web/dist`, servi en statique par Vercel, sans
  reveiller de fonction ;
- **backend** : `api/[...path].ts`, une fonction unique qui monte l'app Fastify
  entiere. Le fichier est un catch-all pour que le chemin d'origine arrive
  intact a Fastify ;
- **fallback** : toute route non-`/api/` renvoie `index.html` ;
- **`maxDuration: 60`** sur la fonction, parce qu'une premiere synchro est
  longue (voir ci-dessous).

L'app Fastify est construite une fois par instance et gardee chaude entre
invocations : les migrations et l'ouverture du pool ne sont pas rejouees a
chaque requete.

### La premiere synchro peut demander deux passes

Une fonction serverless est tuee au bout d'un delai fixe. Une premiere synchro
du bloc 1 represente une trentaine d'operations, chacune avec un appel reseau
vers Intervals.icu et un delai anti-429 : on peut depasser la minute.

Le moteur ne se laisse pas couper au milieu. Il travaille avec un budget de
temps (`SYNC_BUDGET_MS`, 45 s par defaut) et **n'entame pas** une operation
au-dela. Ce qui n'a pas ete tente n'a rien ecrit : l'ecran affiche
« interrompu, N operations non tentees », et le bouton « Recalculer et
reprendre ce qui reste » termine le travail.

Si tu preferes tout faire d'un coup, baisse temporairement
`SYNC_WINDOW_WEEKS` a 2 ou 3, synchronise, puis remonte-le.

### Autres hebergeurs

Le serveur est un Fastify ordinaire (`npm start`). Sur Fly.io, Railway ou
Render, il tourne sans modification : seule `DATABASE_URL` est requise. Sers-le
derriere HTTPS — le cookie de session est marque `secure` en production.

Aucune cle API n'est presente dans le bundle frontend : le navigateur n'appelle
que le backend Carter.

### Sauvegardes

La sauvegarde d'avant-operation existe toujours, sous une autre forme : au lieu
d'une copie du fichier SQLite, c'est un instantane JSON du plan et de son
historique, ecrit dans la table `sauvegarde` avant chaque synchro, import coach
ou restauration. Les 30 derniers sont conserves.

Le choix de ne sauvegarder que le plan est deliberé : c'est la seule donnee non
reconstructible. Les activites et le wellness se reimportent depuis
Intervals.icu, et les dupliquer a chaque synchro ferait gonfler la base sans
rien apporter. Neon fournit par ailleurs sa propre restauration dans le temps.

---

## Ce qui n'est pas fait

**Export .fit des seances structurees** (etape 7 du brief). Le brief demande de
verifier, avant de s'y engager, que Garmin Connect accepte bien l'import de
seances au format vise. Cette verification n'a pas pu etre faite :
l'environnement de developpement n'avait pas d'acces reseau vers les
ressources Garmin.

Livrer un encodeur .fit non verifie produirait des fichiers potentiellement
rejetes en silence, ce qui est pire que pas de fonctionnalite du tout. Pour le
reprendre :

1. verifier dans la documentation du FIT SDK officiel quel type de fichier
   Garmin Connect accepte a l'import manuel de seances ;
2. verifier que l'import manuel de seances structurees est bien ouvert cote
   Garmin Connect, et par quel ecran ;
3. seulement ensuite, implementer l'encodeur — le modele de donnees porte deja
   les seances structurees (`Seance.structure`, avec roles, cibles et blocs
   repetes), rien n'est a migrer ;
4. documenter ici la procedure exacte d'import.

L'export `.ics` couvre le besoin de secours en attendant : il fonctionne sans
aucune API et s'importe dans n'importe quel agenda.

**Autres points non couverts** : mode hors ligne (l'app se consulte en ligne ;
la structure PWA n'est pas posee), glisser-deposer d'une seance dans le
calendrier (le deplacement se fait en editant le plan), import de fichiers
`.fit` / `.tcx` en lecture.

---

## Architecture

```
api/        fonction Vercel : monte l'app Fastify
packages/
  shared/   types, schemas Zod, hash de contenu, projection du plan en dates
  server/   Fastify + Postgres, providers, moteur de synchro, exports
  web/      React + Vite, mobile d'abord
data/       plan-bloc1.json
vercel.json configuration du deploiement
```

**Regle structurante** : rien en dehors de `packages/server/src/providers/` ne
connait le nom d'un service tiers. Ajouter un provider ne touche que son
adaptateur et son enregistrement dans `registry.ts`.

Les dates sont manipulees en chaines `YYYY-MM-DD`, jamais en `Date`. Un plan
d'entrainement est un objet de calendrier local ; utiliser des instants
introduit des decalages d'un jour selon l'heure a laquelle on ouvre l'app.

Le plan est stocke en JSON dans une colonne, et exportable a tout moment. Les
tables relationnelles ne servent qu'a ce qui se requete par date : realise,
wellness, correspondances, journal.

### Tests

```bash
npm test
```

96 tests sans base. Le moteur de diff et de synchro est couvert : suppressions,
reprises sur erreur, conflits, apercus perimes, et arret sur budget de temps.
Les adaptateurs sont testes contre des reponses enregistrees, jamais contre
l'API en direct — une suite qui depend du reseau echoue pour des raisons
etrangeres au code, et ne dit rien d'utile quand elle passe.

11 tests supplementaires couvrent la couche Postgres et ne s'executent que si
`TEST_DATABASE_URL` est renseignee :

```bash
TEST_DATABASE_URL=postgres://user@localhost:5432/carter_test npm test
```

Ils verifient les migrations, la concurrence sur les numeros de version, la
non-duplication des activites reimportees et la fusion du wellness.
**Ces tests effacent le schema `public`** : ne les pointe jamais sur ta vraie
base.
