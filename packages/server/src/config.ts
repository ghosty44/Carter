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
  DATABASE_PATH: z.string().default('./data/carter.db'),

  APP_PASSWORD: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  INTERVALS_ATHLETE_ID: z.string().default(''),
  INTERVALS_API_KEY: z.string().default(''),
  INTERVALS_EVENT_PREFIX: z.string().min(1).default('[PLAN]'),

  SYNC_WINDOW_WEEKS: z.coerce.number().int().min(1).max(52).default(6),
  SYNC_TYPES: listeTypes.default('FOOTING,SORTIE_LONGUE,COTES,SEUIL,RENFO'),
  SYNC_RATE_LIMIT_MS: z.coerce.number().int().min(0).default(350),

  GARMIN_ENABLED: z
    .string()
    .default('false')
    .transform((s) => s === 'true'),
  GARMIN_CONSUMER_KEY: z.string().default(''),
  GARMIN_CONSUMER_SECRET: z.string().default(''),
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

  return { ...c, productionSansProtection: protectionManquante };
}

export const config = construire();

export function intervalsConfigure(c: Config = config): boolean {
  return c.INTERVALS_ATHLETE_ID.length > 0 && c.INTERVALS_API_KEY.length > 0;
}
