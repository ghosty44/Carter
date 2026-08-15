import { config as chargerDotenv } from 'dotenv';
import { z } from 'zod';
import { TypeSeance } from '@carter/shared';

chargerDotenv();

const listeTypes = z
  .string()
  .transform((s) => s.split(',').map((t) => t.trim()).filter(Boolean))
  .pipe(z.array(TypeSeance));

const Schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /**
   * Chaine de connexion Postgres. Sur Vercel + Neon, utiliser l'URL
   * **poolee** (elle contient `-pooler`) : en serverless, chaque invocation
   * peut ouvrir sa propre connexion, et le pooler est ce qui evite de saturer
   * la limite de connexions de la base.
   */
  DATABASE_URL: z.string().min(1).optional(),

  APP_PASSWORD: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  INTERVALS_ATHLETE_ID: z.string().default(''),
  INTERVALS_API_KEY: z.string().default(''),
  INTERVALS_EVENT_PREFIX: z.string().min(1).default('[PLAN]'),

  SYNC_WINDOW_WEEKS: z.coerce.number().int().min(1).max(52).default(6),
  SYNC_TYPES: listeTypes.default('FOOTING,SORTIE_LONGUE,COTES,SEUIL,RENFO'),
  SYNC_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(350),
  /**
   * Budget accorde a une application de synchro, en millisecondes.
   * Doit rester en dessous du `maxDuration` de la fonction Vercel (60 s),
   * avec de la marge pour la reponse HTTP.
   */
  SYNC_BUDGET_MS: z.coerce.number().int().min(1000).default(45_000),

  GARMIN_ENABLED: z
    .string()
    .default('false')
    .transform((s) => s === 'true'),
  GARMIN_CONSUMER_KEY: z.string().default(''),
  GARMIN_CONSUMER_SECRET: z.string().default(''),

  /**
   * Connexion directe au compte Garmin Connect, par le mecanisme de
   * l'application mobile. Lecture seule.
   *
   * Non officiel : contraire aux CGU de Garmin, casse quand Garmin modifie
   * son SSO, et souvent bloque depuis une IP de datacenter. Desactive par
   * defaut — c'est un choix a poser sciemment, pas un reglage par omission.
   */
  GARMIN_DIRECT_ENABLED: z
    .string()
    .default('false')
    .transform((s) => s === 'true'),
});

export type Config = z.infer<typeof Schema> & { productionSansProtection: boolean };

function construire(): Config {
  const parse = Schema.safeParse(process.env);
  if (!parse.success) {
    const details = parse.error.issues
      .map((i) => `  ${i.path.join('.')} : ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide (verifie ton .env) :\n${details}`);
  }

  const c = parse.data;

  if (!c.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL est obligatoire.\n' +
        'Sur Vercel : ajoute une base Neon au projet, la variable est injectee automatiquement.\n' +
        'En local : cree une base Neon gratuite et copie son URL poolee dans .env.',
    );
  }

  // L'app est hebergee en ligne : sans mot de passe, le plan et les donnees
  // de sante sont publics. On refuse de demarrer plutot que d'exposer.
  const protectionManquante = !c.APP_PASSWORD || !c.SESSION_SECRET;
  if (c.NODE_ENV === 'production' && protectionManquante) {
    throw new Error(
      "APP_PASSWORD et SESSION_SECRET sont obligatoires en production.\n" +
        "Sans eux, n'importe qui atteignant l'URL lit tes donnees.\n" +
        'Genere le secret avec : openssl rand -hex 32',
    );
  }

  // Les jetons Garmin sont chiffres avec une clef derivee de SESSION_SECRET :
  // sans lui, ils finiraient en clair dans la base.
  if (c.GARMIN_DIRECT_ENABLED && !c.SESSION_SECRET) {
    throw new Error(
      'GARMIN_DIRECT_ENABLED exige SESSION_SECRET : les jetons Garmin sont chiffres avec.\n' +
        'Genere-le avec : openssl rand -hex 32',
    );
  }

  return { ...c, productionSansProtection: protectionManquante };
}

export const config = construire();

export function intervalsConfigure(c: Config = config): boolean {
  return c.INTERVALS_ATHLETE_ID.length > 0 && c.INTERVALS_API_KEY.length > 0;
}
