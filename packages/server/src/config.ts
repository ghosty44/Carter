import { config as chargerDotenv } from 'dotenv';
import { z } from 'zod';

chargerDotenv();

const Schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  /**
   * Chaine de connexion Postgres. Sur Vercel + Neon, utiliser l'URL **poolee**
   * (elle contient `-pooler`) : en serverless chaque invocation peut ouvrir sa
   * propre connexion, et le pooler evite de saturer la base.
   */
  DATABASE_URL: z.string().min(1).optional(),

  APP_PASSWORD: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /**
   * Connexion au compte Garmin Connect, par le mecanisme de l'application
   * mobile. Lecture seule. Desactivee par defaut : c'est un choix a poser
   * sciemment, pas un reglage par omission.
   */
  GARMIN_ENABLED: z
    .string()
    .default('false')
    .transform((s) => s === 'true'),

  /** Nombre d'activites remontees a chaque recuperation. */
  GARMIN_LIMITE_ACTIVITES: z.coerce.number().int().min(1).max(500).default(100),

  /** Nombre de jours de forme remontes a chaque recuperation. */
  GARMIN_JOURS_WELLNESS: z.coerce.number().int().min(1).max(90).default(30),
});

export type Config = z.infer<typeof Schema> & { protectionActive: boolean };

/**
 * Charge et valide la configuration.
 *
 * Une fonction, et non une constante evaluee a l'import : en serverless, une
 * exception pendant l'evaluation d'un module fait echouer le chargement de la
 * fonction entiere, et la plateforme renvoie un 500 opaque ou aucun de ces
 * messages n'apparait. Appelee depuis `construireApp()`, l'erreur remonte au
 * gestionnaire qui la renvoie en clair.
 */
export function chargerConfig(): Config {
  const parse = Schema.safeParse(process.env);
  if (!parse.success) {
    const details = parse.error.issues
      .map((i) => `  ${i.path.join('.')} : ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }

  const c = parse.data;

  if (!c.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL est obligatoire.\n' +
        'Sur Vercel : Storage > Create Database > Neon, puis relie la base au projet.\n' +
        'En local : copie une URL Neon poolee dans .env.',
    );
  }

  const protectionActive = Boolean(c.APP_PASSWORD && c.SESSION_SECRET);

  // Hebergee en ligne sans mot de passe, l'app expose des donnees de sante a
  // qui trouve l'URL. On refuse de demarrer plutot que d'exposer.
  if (c.NODE_ENV === 'production' && !protectionActive) {
    throw new Error(
      'APP_PASSWORD et SESSION_SECRET sont obligatoires en production.\n' +
        "Sans eux, n'importe qui atteignant l'URL lit tes donnees Garmin.\n" +
        'Genere le secret avec : openssl rand -hex 32',
    );
  }

  // Les jetons Garmin sont chiffres avec une clef derivee de SESSION_SECRET.
  if (c.GARMIN_ENABLED && !c.SESSION_SECRET) {
    throw new Error(
      'GARMIN_ENABLED exige SESSION_SECRET : les jetons Garmin sont chiffres avec.\n' +
        'Genere-le avec : openssl rand -hex 32',
    );
  }

  return { ...c, protectionActive };
}
