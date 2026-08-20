import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aktualisierePerson,
  analysiereImport,
  jaNein,
  monatAus,
  neuePersonAus,
} from './personenImport';
import type { Person } from '../types/kleidung';

const person = (ueber: Partial<Person> = {}): Person => ({
  id: 1,
  name: 'Müller, Anna',
  atemschutz: false,
  tauglichBis: null,
  aktiv: true,
  notiz: null,
  ...ueber,
});

test('liest die üblichen Ja/Nein-Schreibweisen', () => {
  for (const wert of ['ja', 'JA', 'x', '1', 'true', 'wahr', ' Ja ']) {
    assert.equal(jaNein(wert), true, wert);
  }
  for (const wert of ['nein', 'NEIN', '0', 'false', '-', 'inaktiv']) {
    assert.equal(jaNein(wert), false, wert);
  }
  assert.equal(jaNein('vielleicht'), null);
  // Was die leere Zelle bedeutet, hängt von der Spalte ab – siehe unten.
  assert.equal(jaNein(''), null);
});

test('leere Atemschutz-Zelle gilt als nein', () => {
  // Verbreiteter Fall: nur die Träger sind mit einem x markiert.
  const bericht = analysiereImport('Name;AGT\nMüller, Anna;x\nSchmidt, Ben;\n', [], 'ueberspringen');

  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.zeilen[0].werte?.atemschutz, true);
  assert.equal(bericht.zeilen[1].werte?.atemschutz, false);
});

test('leere Status-Zelle legt niemanden still', () => {
  const bestand = [person({ aktiv: true })];
  const bericht = analysiereImport('Name;Status\nMüller, Anna;\n', bestand, 'aktualisieren');

  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.zeilen[0].werte?.aktiv, undefined);
  assert.equal(aktualisierePerson(bestand[0], bericht.zeilen[0].werte!).aktiv, true);
});

test('liest Monatsangaben in den Excel-Formen', () => {
  assert.equal(monatAus('2027-03'), '2027-03');
  assert.equal(monatAus('2027-3'), '2027-03');
  assert.equal(monatAus('2027-03-15'), '2027-03');
  assert.equal(monatAus('03/2027'), '2027-03');
  assert.equal(monatAus('3.2027'), '2027-03');
  assert.equal(monatAus('15.03.2027'), '2027-03');
  assert.equal(monatAus(''), null);
  assert.equal(monatAus('irgendwann'), undefined);
  assert.equal(monatAus('2027-13'), undefined);
});

test('legt neue Personen an und meldet sie als neu', () => {
  const bericht = analysiereImport(
    'Name;Atemschutz;Tauglich bis\nMüller, Anna;ja;2027-03\nSchmidt, Ben;nein;\n',
    [],
    'ueberspringen',
  );

  assert.equal(bericht.problem, null);
  assert.equal(bericht.neu, 2);
  assert.equal(bericht.fehler, 0);
  assert.deepEqual(bericht.zeilen[0].werte, {
    name: 'Müller, Anna',
    atemschutz: true,
    tauglichBis: '2027-03',
  });
  assert.equal(bericht.zeilen[1].werte?.atemschutz, false);
});

test('findet den Namen auch aus Nachname und Vorname', () => {
  const bericht = analysiereImport('Nachname;Vorname\nMüller;Anna\n', [], 'ueberspringen');
  assert.equal(bericht.zeilen[0].name, 'Müller, Anna');
});

test('erkennt Bestehende unabhängig von Gross- und Kleinschreibung', () => {
  const bestand = [person()];
  const bericht = analysiereImport('Name\nmüller, anna\n', bestand, 'ueberspringen');

  assert.equal(bericht.uebersprungen, 1);
  assert.equal(bericht.neu, 0);
  assert.equal(bericht.zeilen[0].personId, 1);
});

test('aktualisiert Bestehende nur im passenden Modus', () => {
  const bestand = [person({ atemschutz: false })];
  const csv = 'Name;Atemschutz\nMüller, Anna;ja\n';

  assert.equal(analysiereImport(csv, bestand, 'ueberspringen').uebersprungen, 1);

  const bericht = analysiereImport(csv, bestand, 'aktualisieren');
  assert.equal(bericht.aktualisiert, 1);
  assert.equal(bericht.zeilen[0].personId, 1);
});

test('meldet unveränderte Zeilen getrennt von geänderten', () => {
  const bestand = [person({ atemschutz: true, tauglichBis: '2027-03' })];
  const bericht = analysiereImport(
    'Name;Atemschutz;Tauglich bis\nMüller, Anna;ja;2027-03\n',
    bestand,
    'aktualisieren',
  );

  assert.equal(bericht.unveraendert, 1);
  assert.equal(bericht.aktualisiert, 0);
});

test('lässt Spalten weg, die die Datei nicht mitbringt', () => {
  // Ohne Notiz-Spalte darf die bestehende Notiz nicht verschwinden.
  const bestand = [person({ notiz: 'Spind 12' })];
  const bericht = analysiereImport('Name;Atemschutz\nMüller, Anna;ja\n', bestand, 'aktualisieren');

  assert.equal(bericht.zeilen[0].werte?.notiz, undefined);
  const geaendert = aktualisierePerson(bestand[0], bericht.zeilen[0].werte!);
  assert.equal(geaendert.notiz, 'Spind 12');
  assert.equal(geaendert.atemschutz, true);
});

test('leert die Tauglichkeit, wenn der Atemschutz wegfällt', () => {
  const bestand = [person({ atemschutz: true, tauglichBis: '2027-03' })];
  const bericht = analysiereImport('Name;Atemschutz\nMüller, Anna;nein\n', bestand, 'aktualisieren');

  assert.equal(bericht.aktualisiert, 1);
  assert.equal(aktualisierePerson(bestand[0], bericht.zeilen[0].werte!).tauglichBis, null);
});

test('weist Zeilen ohne brauchbaren Namen ab', () => {
  const bericht = analysiereImport('Name;Atemschutz\n;ja\nA;ja\n', [], 'ueberspringen');
  assert.equal(bericht.fehler, 2);
  assert.equal(bericht.neu, 0);
});

test('meldet Doppelte innerhalb der Datei mit Zeilennummer', () => {
  const bericht = analysiereImport('Name\nMüller, Anna\nMüller, Anna\n', [], 'ueberspringen');

  assert.equal(bericht.neu, 1);
  assert.equal(bericht.fehler, 1);
  assert.match(bericht.zeilen[1].meldung ?? '', /Zeile 2/);
});

test('eine fehlerhafte Zeile blockiert den Namen nicht für eine spätere', () => {
  const bericht = analysiereImport(
    'Name;Atemschutz\nMüller, Anna;vielleicht\nMüller, Anna;ja\n',
    [],
    'ueberspringen',
  );

  assert.equal(bericht.fehler, 1);
  assert.equal(bericht.neu, 1);
});

test('nennt unlesbare Werte samt Inhalt', () => {
  const bericht = analysiereImport('Name;Atemschutz\nMüller, Anna;vielleicht\n', [], 'ueberspringen');
  assert.equal(bericht.fehler, 1);
  assert.match(bericht.zeilen[0].meldung ?? '', /vielleicht/);
});

test('lehnt eine Datei ohne Namensspalte als Ganzes ab', () => {
  const bericht = analysiereImport('Vorgang;Datum\nWäsche;2026-01-01\n', [], 'ueberspringen');
  assert.match(bericht.problem ?? '', /Namensspalte/);
  assert.deepEqual(bericht.zeilen, []);
});

test('lehnt eine Datei ohne Datenzeilen ab', () => {
  const bericht = analysiereImport('Name;Atemschutz\n', [], 'ueberspringen');
  assert.match(bericht.problem ?? '', /keine Zeilen/);
});

test('meldet, welche Spalte wofür genommen wurde', () => {
  const bericht = analysiereImport('Name;AGT;Bemerkung\nMüller, Anna;ja;hallo\n', [], 'ueberspringen');
  assert.equal(bericht.zuordnung.name, 'Name');
  assert.equal(bericht.zuordnung.atemschutz, 'AGT');
  assert.equal(bericht.zuordnung.notiz, 'Bemerkung');
});

test('neuePersonAus setzt die Standardwerte', () => {
  const neu = neuePersonAus({ name: 'Schmidt, Ben' }, 7);
  assert.deepEqual(neu, {
    id: 7,
    name: 'Schmidt, Ben',
    atemschutz: false,
    tauglichBis: null,
    aktiv: true,
    notiz: null,
  });
});

test('neuePersonAus verwirft eine Tauglichkeit ohne Atemschutz', () => {
  const neu = neuePersonAus({ name: 'Schmidt, Ben', atemschutz: false, tauglichBis: '2027-03' }, 7);
  assert.equal(neu.tauglichBis, null);
});
