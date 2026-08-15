import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chaineDeSignature,
  encoder,
  enteteOAuth1,
  parserFormulaire,
} from '../src/providers/garmin-direct-oauth.js';
import {
  assemblerWellness,
  poidsParDate,
  typeSport,
  versSeanceRealisee,
} from '../src/providers/garmin-direct-contrat.js';
import { chiffrer, dechiffrer } from '../src/chiffrement.js';

const DOSSIER = join(import.meta.dirname, 'fixtures', 'garmin');

function fixture<T = unknown>(nom: string): T {
  return JSON.parse(readFileSync(join(DOSSIER, `${nom}.json`), 'utf8')) as T;
}

describe('signature OAuth 1.0a', () => {
  /**
   * Le flux Garmin n'etant pas joignable depuis l'environnement de
   * developpement, on verifie ce qui est verifiable hors ligne : les regles
   * d'encodage et de construction de la chaine de signature, qui sont
   * normalisees et ou se logent la quasi-totalite des bugs OAuth 1.
   *
   * L'encodage percent (RFC 5849 section 3.6) est la regle la plus souvent
   * mal appliquee, parce que `encodeURIComponent` ne suffit pas.
   */
  it('encode selon la RFC 5849 et non selon encodeURIComponent', () => {
    // Ces cinq caracteres doivent etre encodes, contrairement au defaut JS.
    expect(encoder("!'()*")).toBe('%21%27%28%29%2A');
    // Les caracteres non reserves de la RFC 3986 restent en clair.
    expect(encoder('aZ09-._~')).toBe('aZ09-._~');
    // Espace en %20, jamais en +.
    expect(encoder('r b')).toBe('r%20b');
    expect(encoder('http://x.test/a?b=c')).toBe('http%3A%2F%2Fx.test%2Fa%3Fb%3Dc');
  });

  it('construit une chaine de signature conforme', () => {
    const chaine = chaineDeSignature(
      'post',
      new URL('https://Example.COM:443/request?ignore=moi'),
      'a=1&b=2',
    );

    // Methode en majuscules, hote en minuscules, port par defaut retire,
    // query string absente de l'URL de base.
    expect(chaine).toBe('POST&https%3A%2F%2Fexample.com%2Frequest&a%3D1%26b%3D2');
  });

  /**
   * Valeur de reference calculee localement en reappliquant l'algorithme a la
   * main (voir l'historique de developpement), pas un vecteur publie. Elle
   * sert de garde-fou contre une regression, pas de preuve de conformite —
   * la conformite est couverte par les deux tests ci-dessus.
   */
  it('reste stable a parametres fixes', () => {
    const entete = enteteOAuth1(
      'POST',
      'http://photos.example.net/initiate',
      { consumer_key: 'dpf43f3p2l4k3l03', consumer_secret: 'kd94hf93k423kf44' },
      undefined,
      {
        nonce: 'wIjqoS',
        timestamp: '137131200',
        sansVersion: true,
        extra: { oauth_callback: 'http://printer.example.com/ready' },
      },
    );

    expect(entete).toContain('oauth_signature="mIPx9sQqO97OuihOwUEyB7c4%2FGI%3D"');
    expect(entete).toContain('oauth_nonce="wIjqoS"');
    expect(entete).not.toContain('oauth_version');
  });

  it('inclut les parametres de la query string dans la signature', () => {
    const commun = {
      consommateur: { consumer_key: 'k', consumer_secret: 's' },
      options: { nonce: 'n', timestamp: '1000' },
    };

    const avec = enteteOAuth1(
      'GET',
      'https://exemple.test/chemin?ticket=ST-1',
      commun.consommateur,
      undefined,
      commun.options,
    );
    const sans = enteteOAuth1(
      'GET',
      'https://exemple.test/chemin',
      commun.consommateur,
      undefined,
      commun.options,
    );

    expect(avec).not.toBe(sans);
  });

  it('fait entrer le secret du jeton dans la clef de signature', () => {
    const options = { nonce: 'n', timestamp: '1000' };
    const consommateur = { consumer_key: 'k', consumer_secret: 's' };

    const a = enteteOAuth1('GET', 'https://exemple.test/x', consommateur, {
      oauth_token: 't',
      oauth_token_secret: 'secret-a',
    }, options);
    const b = enteteOAuth1('GET', 'https://exemple.test/x', consommateur, {
      oauth_token: 't',
      oauth_token_secret: 'secret-b',
    }, options);

    expect(a).not.toBe(b);
    expect(a).toContain('oauth_token="t"');
  });

  it('parse une reponse form-urlencoded', () => {
    const champs = parserFormulaire('oauth_token=abc&oauth_token_secret=def%2Bghi');
    expect(champs.oauth_token).toBe('abc');
    expect(champs.oauth_token_secret).toBe('def+ghi');
  });
});

describe('conversion des activites Garmin', () => {
  const activites = fixture<unknown[]>('activites');

  it('convertit une course en seance realisee', () => {
    const s = versSeanceRealisee(activites[0])!;

    expect(s.id).toBe('garmin-18734001');
    expect(s.external_id).toBe('18734001');
    expect(s.source).toBe('GARMIN_DIRECT');
    expect(s.date).toBe('2026-03-03');
    expect(s.type_sport).toBe('Run');
    expect(s.fc_moy).toBe(142);
    expect(s.distance_m).toBeCloseTo(5210.4);
    expect(s.allure_moy_s_km).toBeCloseTo(355.87, 1);
  });

  it('retient la duree en mouvement, pas la duree totale', () => {
    // 1854 s en mouvement contre 1902 s ecoulees : c'est le temps d'effort
    // qui doit etre compare au volume prevu.
    expect(versSeanceRealisee(activites[0])!.duree_s).toBe(1854);
  });

  it('accepte un identifiant numerique comme une chaine', () => {
    expect(versSeanceRealisee(activites[1])!.external_id).toBe('18734002');
  });

  it('tolere un champ inconnu ajoute par Garmin', () => {
    expect(versSeanceRealisee(activites[1])!.type_sport).toBe('TrailRun');
  });

  it('ne calcule pas d allure pour le renforcement', () => {
    const s = versSeanceRealisee(activites[2])!;
    expect(s.type_sport).toBe('WeightTraining');
    expect(s.allure_moy_s_km).toBeNull();
  });

  it('degrade proprement une activite sans donnees', () => {
    const s = versSeanceRealisee(activites[3])!;
    expect(s.duree_s).toBe(0);
    expect(s.fc_moy).toBeNull();
    expect(s.allure_moy_s_km).toBeNull();
  });

  it('ignore une activite sans date exploitable', () => {
    expect(versSeanceRealisee(activites[4])).toBeNull();
  });

  it('range un sport inconnu dans Other plutot que de le rejeter', () => {
    const s = versSeanceRealisee(activites[5])!;
    expect(s.type_sport).toBe('Other');
    expect(s.duree_s).toBe(600);
  });

  it('mappe les types de sport vers le vocabulaire deja utilise dans l app', () => {
    expect(typeSport('running')).toBe('Run');
    expect(typeSport('trail_running')).toBe('TrailRun');
    expect(typeSport('strength_training')).toBe('WeightTraining');
    expect(typeSport('gravel_cycling')).toBe('Ride');
    expect(typeSport(null)).toBe('Other');
  });
});

describe('assemblage du wellness Garmin', () => {
  const w = fixture<Record<string, unknown>>('wellness');

  it('reunit resume, sommeil, HRV et poids en une journee', () => {
    const jour = assemblerWellness({
      date: '2026-03-03',
      resume: w.resume,
      sommeil: w.sommeil,
      hrv: w.hrv,
      poids: 72.4,
    });

    expect(jour.fc_repos).toBe(48);
    expect(jour.sommeil_h).toBe(7.5);
    expect(jour.hrv).toBe(68);
    expect(jour.poids_kg).toBe(72.4);
  });

  it('met Body Battery et stress en note, sans creer de colonnes inutiles', () => {
    const jour = assemblerWellness({ date: '2026-03-03', resume: w.resume });
    expect(jour.note).toBe('Body Battery 72, stress moyen 28');
  });

  it('laisse fatigue et humeur a la saisie manuelle', () => {
    const jour = assemblerWellness({ date: '2026-03-03', resume: w.resume });
    expect(jour.fatigue_1_5).toBeNull();
    expect(jour.humeur_1_5).toBeNull();
  });

  it('ignore un stress negatif, qui signale une mesure absente', () => {
    const jour = assemblerWellness({ date: '2026-03-04', resume: w.resumeVide });
    expect(jour.note).toBe('');
    expect(jour.fc_repos).toBeNull();
  });

  it('survit a des sources totalement absentes', () => {
    const jour = assemblerWellness({ date: '2026-03-04' });
    expect(jour.date).toBe('2026-03-04');
    expect(jour.fc_repos).toBeNull();
    expect(jour.sommeil_h).toBeNull();
  });

  it('convertit le poids des grammes vers les kilos', () => {
    const parDate = poidsParDate(w.poids);
    expect(parDate.get('2026-03-03')).toBe(72.4);
    expect(parDate.get('2026-03-05')).toBe(72.1);
    // Une pesee sans valeur n'entre pas dans la table.
    expect(parDate.has('2026-03-06')).toBe(false);
  });
});

describe('chiffrement des jetons', () => {
  const secret = 'un-secret-de-test-suffisamment-long-0123456789';

  it('fait un aller-retour fidele', () => {
    const jetons = JSON.stringify({ oauth1: { oauth_token: 'abc' } });
    expect(dechiffrer(chiffrer(jetons, secret), secret)).toBe(jetons);
  });

  it('produit un chiffre different a chaque appel', () => {
    // IV aleatoire : deux chiffrements du meme texte ne doivent pas coincider,
    // sinon on revele que la valeur n'a pas change.
    expect(chiffrer('meme-valeur', secret)).not.toBe(chiffrer('meme-valeur', secret));
  });

  it('refuse un dechiffrement avec un autre secret', () => {
    const charge = chiffrer('donnees', secret);
    expect(() => dechiffrer(charge, 'un-autre-secret-completement-different')).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('detecte une charge alteree au lieu de l interpreter', () => {
    const charge = chiffrer('donnees', secret);
    const morceaux = charge.split('.');
    const altere = `${morceaux[0]}.${morceaux[1]}.${Buffer.from('bidon').toString('base64url')}`;

    expect(() => dechiffrer(altere, secret)).toThrow();
  });

  it('rejette un format inattendu', () => {
    expect(() => dechiffrer('pas-du-tout-le-bon-format', secret)).toThrow(/format/);
  });
});
