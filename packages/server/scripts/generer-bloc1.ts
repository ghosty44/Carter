/**
 * Genere le plan initial (bloc 1, 8 semaines) decrit dans le brief.
 *
 * Le fichier produit est un plan importable comme un autre : il n'a rien de
 * special, et le regenerer avec une autre date de depart suffit a decaler tout
 * le bloc. C'est volontaire — le plan vient de l'exterieur, l'app le gere.
 *
 *   npx tsx scripts/generer-bloc1.ts [AAAA-MM-JJ]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  lundiDeLaSemaine,
  ajouterJours,
  aujourdhui,
  PlanSchema,
  validerCoherencePlan,
  volumesParSemaine,
  formatDuree,
  type Plan,
  type Seance,
  type Semaine,
} from '../../shared/src/index.js';

const CONSIGNE_FOOTING =
  "Endurance fondamentale stricte. Allure a laquelle tu peux tenir une conversation en phrases completes. " +
  "Si tu es essouffle, tu es trop vite : ralentis, quitte a marcher les cotes. " +
  "L'objectif du bloc est le volume, pas l'allure.";

const CONSIGNE_SORTIE_LONGUE =
  "Sortie longue en endurance fondamentale. Terrain vallonne si possible, pour habituer les appuis. " +
  "Marche les portions raides plutot que de forcer : c'est du temps d'effort, pas une course. " +
  "Emporte de l'eau au-dela de 45 min.";

/**
 * Contraintes de l'athlete, rappelees sur chaque seance de renforcement.
 * Elles apparaissent telles quelles sur la montre : c'est le seul endroit ou
 * elles seront relues au moment ou elles comptent.
 */
const CONSIGNE_RENFO =
  "Renforcement preventif, 20 min.\n" +
  "HERNIE DISCALE L5 : aucune flexion lombaire chargee. Pas de crunch, pas de souleve de terre, " +
  "pas de rowing buste penche. Gainage en position neutre uniquement : planche, planche laterale, bird-dog.\n" +
  "MOLLETS ET TENDON D'ACHILLE : montees sur pointes 3x15, phase excentrique controlee sur 3 secondes, " +
  "jamais en explosif, jamais en pliometrie sur ce bloc.\n" +
  "CHEVILLES INSTABLES : proprioception unipodale 3x30 s par cote, yeux ouverts puis fermes.\n" +
  "Arreter des qu'une douleur depasse 3/10 et la consigner dans l'app.";

interface LigneSemaine {
  type: 'CHARGE' | 'ALLEGEE';
  /** Durees des footings, dans l'ordre mardi, jeudi, vendredi. */
  footings: number[];
  sortieLongue: number;
}

/** Le tableau du brief, transcrit tel quel. */
const SEMAINES: LigneSemaine[] = [
  { type: 'CHARGE', footings: [30, 30], sortieLongue: 40 },
  { type: 'CHARGE', footings: [30, 35], sortieLongue: 45 },
  { type: 'CHARGE', footings: [30, 40], sortieLongue: 50 },
  { type: 'ALLEGEE', footings: [25, 25], sortieLongue: 30 },
  { type: 'CHARGE', footings: [30, 30, 30], sortieLongue: 40 },
  { type: 'CHARGE', footings: [30, 30, 35], sortieLongue: 50 },
  { type: 'CHARGE', footings: [30, 35, 40], sortieLongue: 55 },
  { type: 'ALLEGEE', footings: [30, 30], sortieLongue: 45 },
];

/** Jours des footings : mardi, jeudi, puis vendredi pour le troisieme. */
const JOURS_FOOTING = [1, 3, 4];
const JOUR_SORTIE_LONGUE = 6; // dimanche
const JOURS_RENFO = [0, 3]; // lundi, et jeudi apres le footing

const NOTES_COACH: Record<number, string> = {
  1: "Prise de contact. Le volume est bas volontairement : on installe la regularite avant tout.",
  2: "Meme structure, on allonge un footing de 5 min et la sortie longue de 5 min.",
  3: "Troisieme semaine de charge, la plus dure du premier cycle. La semaine suivante allege.",
  4: "Semaine allegee. Volume reduit d'un tiers. C'est pendant cette semaine que l'adaptation se fait.",
  5: "Passage a trois footings. Le vendredi s'ajoute, court, pour repartir la charge plutot que l'augmenter.",
  6: "Second cycle de charge. Sortie longue a 50 min, on retrouve le niveau de la semaine 3 avec une seance de plus.",
  7: "Pic du bloc. Si la fatigue est marquee, c'est la sortie longue qu'on raccourcit, jamais les footings.",
  8: "Semaine allegee de fin de bloc. On sort du bloc 1 frais, pas cuit.",
};

function construireSemaine(index: number, ligne: LigneSemaine): Semaine {
  const numero = index + 1;
  const seances: Seance[] = [];

  ligne.footings.forEach((duree, i) => {
    const jour = JOURS_FOOTING[i]!;
    seances.push({
      id: `b1-s${numero}-footing${i + 1}`,
      jour_offset: jour,
      ordre_dans_journee: 0,
      type: 'FOOTING',
      titre: `Footing facile ${formatDuree(duree)}`,
      duree_min: duree,
      intensite: 'EF',
      consignes: CONSIGNE_FOOTING,
    });
  });

  seances.push({
    id: `b1-s${numero}-sl`,
    jour_offset: JOUR_SORTIE_LONGUE,
    ordre_dans_journee: 0,
    type: 'SORTIE_LONGUE',
    titre: `Sortie longue ${formatDuree(ligne.sortieLongue)}`,
    duree_min: ligne.sortieLongue,
    intensite: 'EF',
    consignes: CONSIGNE_SORTIE_LONGUE,
  });

  for (const jour of JOURS_RENFO) {
    // Le renfo du jeudi passe apres le footing : meme jour, ordre superieur.
    const ordre = jour === 3 ? 1 : 0;
    seances.push({
      id: `b1-s${numero}-renfo-j${jour}`,
      jour_offset: jour,
      ordre_dans_journee: ordre,
      type: 'RENFO',
      titre: 'Renforcement preventif 20 min',
      duree_min: 20,
      intensite: 'EF',
      consignes: CONSIGNE_RENFO,
    });
  }

  return {
    id: `b1-s${numero}`,
    numero_global: numero,
    numero_dans_bloc: numero,
    type: ligne.type,
    note_coach: NOTES_COACH[numero] ?? '',
    seances,
  };
}

function construirePlan(dateDebut: string): Plan {
  const maintenant = new Date().toISOString();
  return {
    id: 'plan-trail-2026',
    nom: 'Trail 43 km puis 46 km / 1500 D+',
    version: 1,
    cree_le: maintenant,
    modifie_le: maintenant,
    courses: [],
    blocs: [
      {
        id: 'bloc-1',
        numero: 1,
        nom: 'Base aerobie',
        date_debut: dateDebut,
        nb_semaines: 8,
        objectif:
          "Installer la regularite et le volume en endurance fondamentale, sans aucune intensite. " +
          "Toute la charge passe par la duree, jamais par l'allure.",
        semaines: SEMAINES.map((ligne, index) => construireSemaine(index, ligne)),
      },
    ],
  };
}

function main(): void {
  const argument = process.argv[2];
  const depart = argument ?? lundiDeLaSemaine(ajouterJours(aujourdhui(), 7));

  const plan = construirePlan(depart);

  const parse = PlanSchema.safeParse(plan);
  if (!parse.success) {
    console.error('Le plan genere ne respecte pas le schema :');
    console.error(parse.error.format());
    process.exit(1);
  }

  const erreurs = validerCoherencePlan(parse.data);
  if (erreurs.length > 0) {
    console.error('Incoherences dans le plan genere :');
    for (const e of erreurs) console.error(`  - ${e}`);
    process.exit(1);
  }

  const sortie = resolve(import.meta.dirname, '../../../data/plan-bloc1.json');
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, `${JSON.stringify(parse.data, null, 2)}\n`, 'utf8');

  console.log(`Plan ecrit dans ${sortie}`);
  console.log(`Debut du bloc : ${depart} (lundi)\n`);
  console.log('Semaine  Type      Course  Seances  SL      Total');
  for (const v of volumesParSemaine(parse.data)) {
    console.log(
      [
        String(v.numero_global).padStart(7),
        v.type.padEnd(9),
        formatDuree(v.volume_course_min).padStart(6),
        String(v.nb_seances_course).padStart(8),
        formatDuree(v.sortie_longue_min ?? 0).padStart(6),
        formatDuree(v.volume_total_min).padStart(7),
      ].join(' '),
    );
  }
}

main();
