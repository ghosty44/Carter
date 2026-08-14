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
| Fichier local (.ics, .csv) | export manuel | non | disponible, sans aucune cle |
| Bac a sable (memoire) | oui | non | disponible, pour essayer sans risque |
| Garmin Training API | oui | oui | squelette desactive |

**Intervals.icu est le chemin qui fonctionne** : il se connecte a Garmin
Connect cote utilisateur, donc les seances poussees vers Intervals.icu
redescendent sur la montre sans acces partenaire.

---

## Demarrage

```bash
npm install
cp .env.example .env          # puis remplis les valeurs
npm run build
npm start                     # http://localhost:8787
```

En developpement, deux terminaux :

```bash
npm run dev        # backend, port 8787
npm run dev:web    # frontend Vite, port 5173, proxy /api vers 8787
```

Lance toujours le serveur depuis la racine du depot : `DATABASE_PATH` est
relatif au repertoire courant.

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

### Strava

Non implemente. L'interface `PlanSyncProvider` est prete a l'accueillir en
lecture seule (`capacites().ecrire === false`) : Strava ne permet pas d'ecrire
des seances planifiees.

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
- **sauvegarde** : la base est copiee avant chaque synchro et avant chaque
  import de plan revise, dans `data/backups/` (30 dernieres conservees) ;
- **revalidation** : un apercu affiche hier soir et confirme ce matin est
  reverifie operation par operation avant envoi.

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

## Deploiement en ligne

L'app est prevue pour un petit hebergement prive, accessible depuis le
telephone.

**La protection d'acces n'est pas optionnelle.** Sans elle, ton plan, tes
douleurs et tes donnees de sommeil sont lisibles par qui trouve l'URL. En
`NODE_ENV=production`, le serveur **refuse de demarrer** sans `APP_PASSWORD` et
`SESSION_SECRET`.

```bash
openssl rand -hex 32     # SESSION_SECRET
```

- sers l'app derriere HTTPS : le cookie de session est marque `secure` en
  production ;
- monte un volume persistant sur le dossier de `DATABASE_PATH` — le conteneur
  est ephemere, pas la base ;
- aucune cle API n'est presente dans le bundle frontend : le navigateur
  n'appelle que le backend Carter.

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
packages/
  shared/   types, schemas Zod, hash de contenu, projection du plan en dates
  server/   Fastify + SQLite, providers, moteur de synchro, exports
  web/      React + Vite, mobile d'abord
data/       plan-bloc1.json, base SQLite, sauvegardes
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

93 tests. Le moteur de diff et de synchro est couvert, suppressions, reprises
sur erreur, conflits et apercus perimes compris. Les adaptateurs sont testes
contre des reponses enregistrees, jamais contre l'API en direct : une suite qui
depend du reseau echoue pour des raisons etrangeres au code, et ne dit rien
d'utile quand elle passe.
