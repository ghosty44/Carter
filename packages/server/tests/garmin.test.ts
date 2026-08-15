import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  chaineDeSignature,
  encoder,
  enteteOAuth1,
  parserFormulaire,
} from '../src/garmin/oauth.js';
import {
  assemblerWellness,
  heureDe,
  poidsParDate,
  versActivite,
  versSport,
} from '../src/garmin/contrat.js';
import { chiffrer, dechiffrer } from '../src/chiffrement.js';

const DOSSIER = join(import.meta.dirname, 'fixtures', 'garmin');

function fixture<T = unknown>(nom: string): T {
  return JSON.parse(readFileSync(join(DOSSIER, `${nom}.json`), 'utf8')) as T;
}

describe('signature OAuth 1.0a', () => {
  /**
   * Le flux Garmin n'etant pas joignable depuis l'environnement de
   * developpement, on verifie ce qui l'est hors ligne : les regles d'encodage
   * et la construction de la chaine de signature. C'est la que se logent la
   * quasi-totalite des bugs OAuth 1.
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

  it('inclut les parametres de la query string dans la signature', () => {
    const consommateur = { consumer_key: 'k', consumer_secret: 's' };
    const options = { nonce: 'n', timestamp: '1000' };

    const avec = enteteOAuth1('GET', 'https://x.test/c?ticket=ST-1', consommateur, undefined, options);
    const sans = enteteOAuth1('GET', 'https://x.test/c', consommateur, undefined, options);

    expect(avec).not.toBe(sans);
  });

  it('fait entrer le secret du jeton dans la clef de signature', () => {
    const consommateur = { consumer_key: 'k', consumer_secret: 's' };
    const options = { nonce: 'n', timestamp: '1000' };

    const a = enteteOAuth1('GET', 'https://x.test/y', consommateur, { oauth_token: 't', oauth_token_secret: 'a' }, options);
    const b = enteteOAuth1('GET', 'https://x.test/y', consommateur, { oauth_token: 't', oauth_token_secret: 'b' }, options);

    expect(a).not.toBe(b);
    expect(a).toContain('oauth_token="t"');
  });

  /**
   * Valeur calculee localement en reappliquant l'algorithme a la main, pas un
   * vecteur publie : garde-fou contre une regression, pas preuve de
   * conformite — celle-ci est couverte par les tests ci-dessus.
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
    expect(entete).not.toContain('oauth_version');
  });

  it('parse une reponse form-urlencoded', () => {
    const champs = parserFormulaire('oauth_token=abc&oauth_token_secret=def%2Bghi');
    expect(champs.oauth_token).toBe('abc');
    expect(champs.oauth_token_secret).toBe('def+ghi');
  });
});

describe('conversion des activites', () => {
  const activites = fixture<unknown[]>('activites');

  it('convertit une course', () => {
    const a = versActivite(activites[0])!;

    expect(a.id).toBe('18734001');
    expect(a.date).toBe('2026-03-03');
    expect(a.heure).toBe('18:12');
    expect(a.sport).toBe('COURSE');
    expect(a.fc_moy).toBe(142);
    expect(a.distance_m).toBeCloseTo(5210.4);
    expect(a.allure_s_km).toBeCloseTo(355.87, 1);
  });

  it('retient le temps en mouvement, pas le temps ecoule', () => {
    // 1854 s en mouvement contre 1902 s ecoulees.
    const a = versActivite(activites[0])!;
    expect(a.duree_s).toBe(1854);
    expect(a.duree_totale_s).toBe(1902);
  });

  it('accepte un identifiant numerique comme une chaine', () => {
    expect(versActivite(activites[1])!.id).toBe('18734002');
  });

  it('tolere un champ inconnu ajoute par Garmin', () => {
    expect(versActivite(activites[1])!.sport).toBe('TRAIL');
  });

  it('donne une vitesse au velo et une allure a la course, jamais les deux', () => {
    const course = versActivite(activites[0])!;
    expect(course.allure_s_km).not.toBeNull();
    expect(course.vitesse_kmh).toBeNull();

    const velo = versActivite({
      activityId: 1,
      startTimeLocal: '2026-03-04 10:00:00',
      activityType: { typeKey: 'cycling' },
      movingDuration: 3600,
      distance: 30000,
      averageSpeed: 8.33,
    })!;
    expect(velo.allure_s_km).toBeNull();
    expect(velo.vitesse_kmh).toBeCloseTo(30, 0);
  });

  it('ne calcule ni allure ni vitesse pour le renforcement', () => {
    const a = versActivite(activites[2])!;
    expect(a.sport).toBe('RENFORCEMENT');
    expect(a.allure_s_km).toBeNull();
    expect(a.vitesse_kmh).toBeNull();
  });

  it('degrade proprement une activite sans donnees', () => {
    const a = versActivite(activites[3])!;
    expect(a.duree_s).toBe(0);
    expect(a.fc_moy).toBeNull();
    expect(a.allure_s_km).toBeNull();
  });

  it('ignore une activite sans date exploitable', () => {
    expect(versActivite(activites[4])).toBeNull();
  });

  it('range un sport inconnu dans AUTRE plutot que de le rejeter', () => {
    const a = versActivite(activites[5])!;
    expect(a.sport).toBe('AUTRE');
    expect(a.duree_s).toBe(600);
    // Le type brut est conserve, pour comprendre ce que Garmin a envoye.
    expect(a.sport_garmin).toBe('underwater_basket_weaving');
  });

  it('regroupe les variantes de course sous les memes sports', () => {
    expect(versSport('running')).toBe('COURSE');
    expect(versSport('track_running')).toBe('COURSE');
    expect(versSport('trail_running')).toBe('TRAIL');
    expect(versSport('treadmill_running')).toBe('COURSE_INTERIEUR');
    expect(versSport('gravel_cycling')).toBe('VELO');
    expect(versSport('strength_training')).toBe('RENFORCEMENT');
    expect(versSport(null)).toBe('AUTRE');
  });

  it('extrait l heure locale, ou null si le format surprend', () => {
    expect(heureDe('2026-03-03 18:12:04')).toBe('18:12');
    expect(heureDe('2026-03-03')).toBeNull();
    expect(heureDe(null)).toBeNull();
  });
});

describe('assemblage de la forme', () => {
  const w = fixture<Record<string, unknown>>('wellness');

  it('reunit resume, sommeil, HRV et poids', () => {
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
    expect(jour.pas).toBe(9412);
  });

  it('prend la valeur haute de Body Battery, plus parlante que la derniere', () => {
    const jour = assemblerWellness({ date: '2026-03-03', resume: w.resume });
    expect(jour.body_battery).toBe(88);
  });

  it('ignore un stress negatif, qui signale une mesure absente', () => {
    const jour = assemblerWellness({ date: '2026-03-04', resume: w.resumeVide });
    expect(jour.stress_moy).toBeNull();
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
    // IV aleatoire : deux chiffrements du meme texte ne doivent pas coincider.
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
