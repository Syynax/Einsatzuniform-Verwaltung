import test from 'node:test';
import assert from 'node:assert/strict';
import { aktualisiereTeil, analysiereTeileImport, neuesTeilAus } from './teileImport';
import type { Kleidungsstueck, Person, Teiletyp } from '../types/kleidung';

const JACKE: Teiletyp = {
  id: 1,
  name: 'Überjacke HuPF Teil 1',
  kategorie: 'einsatzkleidung',
  waschbar: true,
  waschgrenze: 50,
  warnschwelle: 40,
  pruefIntervallMonate: 12,
  aktiv: true,
};

const HELM: Teiletyp = {
  id: 2,
  name: 'Feuerwehrhelm',
  kategorie: 'ausruestung',
  waschbar: false,
  waschgrenze: null,
  warnschwelle: null,
  pruefIntervallMonate: 12,
  aktiv: true,
};

const ANNA: Person = {
  id: 1, name: 'Müller, Anna', atemschutz: true, tauglichBis: null, aktiv: true, notiz: null,
};

const teil = (ueber: Partial<Kleidungsstueck> = {}): Kleidungsstueck => ({
  id: 1,
  nummer: '1042-07/19',
  matrixCode: null,
  typId: 1,
  groesse: '52',
  hersteller: null,
  beschaffung: null,
  personId: null,
  standort: null,
  status: 'dienst',
  waschzaehler: 10,
  letzteWaesche: null,
  letztePruefung: null,
  naechstePruefung: null,
  chargeId: null,
  notiz: null,
  angelegt: '2019-07-01T00:00:00.000Z',
  ...ueber,
});

const bestand = (ueber: Partial<{ teile: Kleidungsstueck[]; typen: Teiletyp[]; personen: Person[] }> = {}) => ({
  teile: [],
  typen: [JACKE, HELM],
  personen: [ANNA],
  ...ueber,
});

test('legt Teile an und löst Typ und Träger über den Namen auf', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Größe;Träger\n1042-07/19;Überjacke HuPF Teil 1;52;Müller, Anna\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.problem, null);
  assert.equal(bericht.neu, 1);
  assert.equal(bericht.fehler, 0);
  assert.deepEqual(bericht.zeilen[0].werte, {
    nummer: '1042-07/19',
    typId: 1,
    groesse: '52',
    personId: 1,
  });
  assert.equal(bericht.zeilen[0].typName, 'Überjacke HuPF Teil 1');
});

test('Typname wird unabhängig von Schreibweise und Leerzeichen erkannt', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ\n1042-07/19;ueberjacke hupf teil1\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(bericht.neu, 1);
  assert.equal(bericht.zeilen[0].werte?.typId, 1);
});

test('unbekannter Typ wird gemeldet statt still angelegt', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ\n1042-07/19;Überjacke Modell Neu\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(bericht.fehler, 1);
  assert.equal(bericht.neu, 0);
  assert.match(bericht.zeilen[0].meldung ?? '', /nicht angelegt/);
});

test('unbekannter Träger wird gemeldet', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Träger\n1042-07/19;Feuerwehrhelm;Unbekannt, Uwe\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(bericht.fehler, 1);
  assert.match(bericht.zeilen[0].meldung ?? '', /Träger/);
});

test('leere Trägerzelle bedeutet Pool, nicht Fehler', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Träger\n1042-07/19;Feuerwehrhelm;\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.zeilen[0].werte?.personId, null);
});

test('Nummern werden normalisiert, unbrauchbare gemeldet', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ\n10420719;Feuerwehrhelm\n1042/07-19;Feuerwehrhelm\nABC;Feuerwehrhelm\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.zeilen[0].werte?.nummer, '1042-07/19');
  // Zweite Zeile ergibt dieselbe Nummer – das ist ein Dublett in der Datei.
  assert.equal(bericht.zeilen[1].befund, 'fehler');
  assert.match(bericht.zeilen[1].meldung ?? '', /Zeile 2/);
  assert.equal(bericht.zeilen[2].befund, 'fehler');
  assert.match(bericht.zeilen[2].meldung ?? '', /XXXX-XX\/XX/);
});

test('Datums- und Monatsangaben aus Excel werden gelesen', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Beschaffung;Letzte Prüfung\n1042-07/19;Feuerwehrhelm;07/2019;15.03.2026\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.zeilen[0].werte?.beschaffung, '2019-07');
  assert.equal(bericht.zeilen[0].werte?.letztePruefung, '2026-03-15');
});

test('ein unmögliches Datum ist ein Fehler, kein stiller Übertrag', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Letzte Prüfung\n1042-07/19;Feuerwehrhelm;31.02.2026\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(bericht.fehler, 1);
  assert.match(bericht.zeilen[0].meldung ?? '', /Prüfdatum/);
});

test('Waschzähler an einem nicht waschbaren Typ wird abgewiesen', () => {
  const mitZaehler = analysiereTeileImport(
    'Nummer;Typ;Waschzähler\n1042-07/19;Feuerwehrhelm;12\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(mitZaehler.fehler, 1);
  assert.match(mitZaehler.zeilen[0].meldung ?? '', /keinen Waschzähler/);

  // Leer und 0 sind in Ordnung.
  const ohne = analysiereTeileImport(
    'Nummer;Typ;Waschzähler\n1042-07/19;Feuerwehrhelm;\n1042-07/20;Feuerwehrhelm;0\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(ohne.fehler, 0);
});

test('doppelter Matrixcode fällt auf, in der Datei wie im Bestand', () => {
  const inDatei = analysiereTeileImport(
    'Nummer;Typ;Matrixcode\n1042-07/19;Feuerwehrhelm;ABC123\n1042-07/20;Feuerwehrhelm;ABC123\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(inDatei.fehler, 1);
  assert.match(inDatei.zeilen[1].meldung ?? '', /Zeile 2/);

  const imBestand = analysiereTeileImport(
    'Nummer;Typ;Matrixcode\n1042-07/20;Feuerwehrhelm;ABC123\n',
    bestand({ teile: [teil({ nummer: '9999-99/99', matrixCode: 'ABC123' })] }),
    'ueberspringen',
  );
  assert.equal(imBestand.fehler, 1);
  assert.match(imBestand.zeilen[0].meldung ?? '', /9999-99\/99/);
});

test('bestehende Teile werden übersprungen oder aktualisiert', () => {
  const vorhanden = bestand({ teile: [teil({ groesse: '52' })] });
  const csv = 'Nummer;Typ;Größe\n1042-07/19;Überjacke HuPF Teil 1;54\n';

  assert.equal(analysiereTeileImport(csv, vorhanden, 'ueberspringen').uebersprungen, 1);

  const bericht = analysiereTeileImport(csv, vorhanden, 'aktualisieren');
  assert.equal(bericht.aktualisiert, 1);
  assert.equal(bericht.zeilen[0].teilId, 1);
});

test('unveränderte Zeilen werden getrennt gezählt', () => {
  const vorhanden = bestand({ teile: [teil({ groesse: '52' })] });
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Größe\n1042-07/19;Überjacke HuPF Teil 1;52\n',
    vorhanden,
    'aktualisieren',
  );
  assert.equal(bericht.unveraendert, 1);
  assert.equal(bericht.aktualisiert, 0);
});

test('Spalten, die die Datei nicht mitbringt, bleiben unangetastet', () => {
  const vorhanden = teil({ standort: 'Spind 12', waschzaehler: 30 });
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Größe\n1042-07/19;Überjacke HuPF Teil 1;54\n',
    bestand({ teile: [vorhanden] }),
    'aktualisieren',
  );

  const geaendert = aktualisiereTeil(vorhanden, bericht.zeilen[0].werte!, JACKE);
  assert.equal(geaendert.groesse, '54');
  assert.equal(geaendert.standort, 'Spind 12', 'Standort darf nicht verschwinden');
  assert.equal(geaendert.waschzaehler, 30, 'Waschzähler darf nicht auf 0 fallen');
});

test('Datei ohne Nummern- oder Typspalte wird als Ganzes abgelehnt', () => {
  assert.match(
    analysiereTeileImport('Typ;Größe\nHelm;52\n', bestand(), 'ueberspringen').problem ?? '',
    /Nummernspalte/,
  );
  assert.match(
    analysiereTeileImport('Nummer;Größe\n1042-07/19;52\n', bestand(), 'ueberspringen').problem ?? '',
    /Typspalte/,
  );
});

test('neuesTeilAus rechnet den nächsten Prüftermin aus', () => {
  const neu = neuesTeilAus(
    { nummer: '1042-07/19', typId: 1, letztePruefung: '2026-03-15' },
    7,
    JACKE,
    '2026-08-20T10:00:00.000Z',
  );
  assert.equal(neu.naechstePruefung, '2027-03-15');
  assert.equal(neu.status, 'dienst');
  assert.equal(neu.waschzaehler, 0);
});

test('neuesTeilAus lässt einen nicht waschbaren Typ ohne Zähler', () => {
  const neu = neuesTeilAus({ nummer: '1042-07/19', typId: 2, waschzaehler: 5 }, 7, HELM, '2026-08-20T10:00:00.000Z');
  assert.equal(neu.waschzaehler, 0);
});

test('Fehlerzeile blockiert die Nummer nicht für eine spätere, saubere Zeile', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ\n1042-07/19;Gibtsnicht\n1042-07/19;Feuerwehrhelm\n',
    bestand(),
    'ueberspringen',
  );
  assert.equal(bericht.fehler, 1);
  assert.equal(bericht.neu, 1);
});
