import { describe, expect, it } from 'vitest';
import { exporterIcs } from '../src/export/ics.js';
import { planTest } from './aide.js';

const HORODATAGE = '20260302T090000Z';

function lignes(ics: string): string[] {
  // Deplie les lignes de continuation avant d'assertionner.
  return ics.replace(/\r\n /g, '').split('\r\n');
}

describe('exporterIcs', () => {
  it('produit un calendrier valide avec un evenement journee entiere par seance', () => {
    const plan = planTest([[{ id: 'a', jour: 1, titre: 'Footing facile 30 min' }]]);
    const ics = exporterIcs(plan, { horodatage: HORODATAGE });
    const l = lignes(ics);

    expect(l[0]).toBe('BEGIN:VCALENDAR');
    expect(l.at(-2)).toBe('END:VCALENDAR');
    expect(l).toContain('DTSTART;VALUE=DATE:20260303');
    expect(l).toContain('DTEND;VALUE=DATE:20260304');
    expect(l).toContain('SUMMARY:Footing facile 30 min');
  });

  it('termine chaque ligne par CRLF, comme l exige la RFC 5545', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }]]);
    const ics = exporterIcs(plan, { horodatage: HORODATAGE });

    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
  });

  it('echappe les virgules, points-virgules et retours a la ligne', () => {
    const plan = planTest([
      [{ id: 'a', jour: 1, titre: 'Cotes; series', consignes: 'Ligne 1\nLigne 2, suite' }],
    ]);
    const ics = exporterIcs(plan, { horodatage: HORODATAGE });
    const l = lignes(ics);

    expect(l).toContain('SUMMARY:Cotes\\; series');
    expect(l.find((x) => x.startsWith('DESCRIPTION:'))).toContain('Ligne 1\\nLigne 2\\, suite');
  });

  it('plie les lignes longues sans couper un caractere accentue en deux', () => {
    const consignes = 'Éviter la flexion lombaire chargée. '.repeat(12);
    const plan = planTest([[{ id: 'a', jour: 1, consignes }]]);
    const ics = exporterIcs(plan, { horodatage: HORODATAGE });

    const encodeur = new TextEncoder();
    for (const ligne of ics.split('\r\n')) {
      expect(encodeur.encode(ligne).length).toBeLessThanOrEqual(76);
    }
    // Le depliage restitue le texte d'origine, accents intacts.
    expect(lignes(ics).join('\n')).toContain('Éviter la flexion lombaire chargée.');
  });

  it('exclut les journees de repos', () => {
    const plan = planTest([[{ id: 'r', jour: 2, type: 'REPOS' }, { id: 'a', jour: 1 }]]);
    const ics = exporterIcs(plan, { horodatage: HORODATAGE });

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('respecte le filtre de periode', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }], [{ id: 'b', jour: 1 }]]);
    const ics = exporterIcs(plan, {
      horodatage: HORODATAGE,
      debut: '2026-03-09',
      fin: '2026-03-15',
    });

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(lignes(ics)).toContain('DTSTART;VALUE=DATE:20260310');
  });

  it('donne a chaque seance un UID stable et unique', () => {
    const plan = planTest([[{ id: 'a', jour: 1 }, { id: 'b', jour: 3 }]]);
    const uids = lignes(exporterIcs(plan, { horodatage: HORODATAGE }))
      .filter((l) => l.startsWith('UID:'));

    expect(new Set(uids).size).toBe(2);
    expect(uids[0]).toBe('UID:carter-plan-test-a@carter.local');
  });
});
