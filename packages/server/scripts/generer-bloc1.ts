/**
 * Ecrit le plan de depart dans `data/plan-bloc1.json`.
 *
 * La construction elle-meme vit dans `src/plan-initial.ts`, partagee avec la
 * route « Charger le bloc 1 » : deux definitions du meme plan finiraient par
 * diverger. Ce script ne sert qu'a produire un fichier importable a la main.
 *
 *   npx tsx scripts/generer-bloc1.ts [AAAA-MM-JJ]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PlanSchema,
  formatDuree,
  validerCoherencePlan,
  volumesParSemaine,
} from '../../shared/src/index.js';
import { construirePlanInitial, lundiProchain } from '../src/plan-initial.js';

function main(): void {
  const depart = process.argv[2] ?? lundiProchain();
  const plan = construirePlanInitial(depart);

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
