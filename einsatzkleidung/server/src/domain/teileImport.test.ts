import test from 'node:test';
import assert from 'node:assert/strict';
import { aktualisiereTeil, analysiereTeileImport, neuesTeilAus } from './teileImport';
import { IDENT_HINWEIS } from './kleidung';
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

const BERND: Person = {
  id: 2, name: 'Schmitt, Bernd', atemschutz: false, tauglichBis: null, aktiv: true, notiz: null,
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
  personen: [ANNA, BERND],
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

test('neuesTeilAus legt ein Teil ohne Nummer mit null an, nicht mit leerem String', () => {
  // Der Unterschied ist nicht kosmetisch: Ein leerer String ist eine Nummer,
  // die es zu sein behauptet – `stammdatenDiff` meldete später „Nummer  → …",
  // und der Import-Index über Nummer, Typ und Träger nähme das Teil wieder auf.
  const neu = neuesTeilAus(
    { nummer: null, typId: 2, matrixCode: 'BO00297362' },
    7,
    HELM,
    '2026-08-20T10:00:00.000Z',
  );

  assert.equal(neu.nummer, null);
  assert.equal(neu.matrixCode, 'BO00297362');
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

test('dieselbe Nummer darf mehrfach vorkommen, wenn der Träger sie trennt', () => {
  // Steht auf dem Etikett die Nummer der Lieferung, tragen alle Jacken daraus
  // dieselbe. Das ist kein Fehler, solange klar ist, wer welche hat.
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Träger\n'
    + '6072-10/23;Überjacke HuPF Teil 1;Müller, Anna\n'
    + '6072-10/23;Überjacke HuPF Teil 1;Schmitt, Bernd\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.neu, 2);
});

test('zwei Zeilen mit gleicher Nummer, Typ und Träger sind eine Dublette', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Träger\n'
    + '6072-10/23;Überjacke HuPF Teil 1;Müller, Anna\n'
    + '6072-10/23;Überjacke HuPF Teil 1;Müller, Anna\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.neu, 1);
  assert.equal(bericht.fehler, 1);
  assert.match(bericht.zeilen[1].meldung ?? '', /Zeile 2/);
});

test('der Träger entscheidet, welches der gleichnamigen Teile aktualisiert wird', () => {
  const vorhanden = bestand({
    teile: [
      teil({ id: 1, nummer: '6072-10/23', personId: ANNA.id, groesse: '52' }),
      teil({ id: 2, nummer: '6072-10/23', personId: BERND.id, groesse: '54' }),
    ],
  });

  const bericht = analysiereTeileImport(
    'Nummer;Typ;Träger;Größe\n6072-10/23;Überjacke HuPF Teil 1;Schmitt, Bernd;56\n',
    vorhanden,
    'aktualisieren',
  );

  assert.equal(bericht.aktualisiert, 1);
  assert.equal(bericht.zeilen[0].teilId, 2);
});

test('sind zwei Teile im Bestand nicht unterscheidbar, rät der Import nicht', () => {
  const vorhanden = bestand({
    teile: [
      teil({ id: 1, nummer: '6072-10/23', personId: null }),
      teil({ id: 2, nummer: '6072-10/23', personId: null }),
    ],
  });

  const bericht = analysiereTeileImport(
    'Nummer;Typ;Träger;Größe\n6072-10/23;Überjacke HuPF Teil 1;;56\n',
    vorhanden,
    'aktualisieren',
  );

  assert.equal(bericht.aktualisiert, 0);
  assert.equal(bericht.fehler, 1);
  assert.equal(bericht.zeilen[0].teilId, null);
});

// --- Matrixcode als zweiter Schlüssel ------------------------------------

test('eine Datei ganz ohne Nummernspalte wird angenommen', () => {
  // „Nummer oder Matrixcode" gilt auch für die Kopfzeile: Wer seinen Bestand
  // mit dem Scanner aufgenommen hat, hat gar keine Nummernspalte.
  const bericht = analysiereTeileImport(
    'Matrixcode;Typ\nBO00297362TOTAL CARE21021892 / LION 20200228S/R;Feuerwehrhelm\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.problem, null);
  assert.equal(bericht.neu, 1);
  assert.equal(bericht.fehler, 0);
});

test('eine Zeile ohne Nummer, aber mit Matrixcode, ist ein neues Teil', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Matrixcode\n;Feuerwehrhelm;ABC123\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.neu, 1);
  assert.equal(bericht.zeilen[0].werte?.nummer, null);
  assert.equal(bericht.zeilen[0].werte?.matrixCode, 'ABC123');
});

test('eine Zeile ohne Nummer und ohne Matrixcode benennt kein Teil', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Matrixcode\n;Feuerwehrhelm;\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.fehler, 1);
  assert.equal(bericht.neu, 0);
  // Derselbe Satz, den auch Dialog und Scan zeigen – es ist dieselbe Regel.
  assert.equal(bericht.zeilen[0].meldung, IDENT_HINWEIS);
});

test('ohne Matrixcode-Spalte bleibt eine leere Nummernzelle eine Fehlerzeile', () => {
  const bericht = analysiereTeileImport(
    'Nummer;Typ\n;Feuerwehrhelm\n',
    bestand(),
    'ueberspringen',
  );

  assert.equal(bericht.fehler, 1);
  assert.equal(bericht.zeilen[0].meldung, IDENT_HINWEIS);
});

test('der Matrixcode erkennt ein Bestandsteil wieder, auch wenn der Träger abweicht', () => {
  // Der Dreier-Schlüssel ginge hier daneben und legte ein zweites Teil an:
  // Im Bestand liegt die Jacke im Pool, in der Datei trägt sie jemand. Genau
  // das ist der Normalfall beim Import – die Datei bringt den neuen Stand.
  const vorhanden = bestand({
    teile: [teil({ id: 1, nummer: '1042-07/19', matrixCode: 'ABC123', personId: null })],
  });

  const bericht = analysiereTeileImport(
    'Nummer;Typ;Träger;Matrixcode;Größe\n1042-07/19;Überjacke HuPF Teil 1;Müller, Anna;ABC123;54\n',
    vorhanden,
    'aktualisieren',
  );

  assert.equal(bericht.neu, 0);
  assert.equal(bericht.aktualisiert, 1);
  assert.equal(bericht.zeilen[0].teilId, 1);
});

test('ein Bestandsteil ohne Nummer ist kein Matrixcode-Konflikt', () => {
  // Der Code sitzt am selben Teil, die Datei trägt bloss die Nummer nach.
  // Früher galt jede Abweichung als „Matrixcode gehört schon zu …".
  const vorhanden = teil({ id: 1, nummer: '', matrixCode: 'ABC123' });
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Matrixcode\n1042-07/19;Überjacke HuPF Teil 1;ABC123\n',
    bestand({ teile: [vorhanden] }),
    'aktualisieren',
  );

  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.aktualisiert, 1);
  assert.equal(bericht.zeilen[0].teilId, 1);
  assert.equal(aktualisiereTeil(vorhanden, bericht.zeilen[0].werte!, JACKE).nummer, '1042-07/19');
});

test('eine leere Nummernzelle löscht keine vorhandene Nummer', () => {
  // Hier weicht die Nummer bewusst von allen anderen Spalten ab: Bei
  // matrixCode oder Standort heisst eine leere Zelle „entfernen", bei der
  // Nummer heisst sie „weiss ich nicht". Eine aufgedruckte Nummer
  // verschwindet nicht vom Kleidungsstück, bloss weil sie in der Tabelle
  // fehlt.
  const vorhanden = teil({ id: 1, nummer: '1042-07/19', matrixCode: 'ABC123' });
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Matrixcode;Größe\n;Überjacke HuPF Teil 1;ABC123;54\n',
    bestand({ teile: [vorhanden] }),
    'aktualisieren',
  );

  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.aktualisiert, 1);

  const geaendert = aktualisiereTeil(vorhanden, bericht.zeilen[0].werte!, JACKE);
  assert.equal(geaendert.nummer, '1042-07/19', 'die aufgedruckte Nummer bleibt stehen');
  assert.equal(geaendert.groesse, '54');
});

test('eine fehlende Nummer allein macht aus einem Teil keine Änderung', () => {
  // Sonst meldete jeder Import ohne Nummernspalte lauter Änderungen, die
  // gar keine sind – und schriebe sie in den Nachweis.
  const bericht = analysiereTeileImport(
    'Matrixcode;Typ;Größe\nABC123;Überjacke HuPF Teil 1;52\n',
    bestand({ teile: [teil({ id: 1, matrixCode: 'ABC123', groesse: '52' })] }),
    'aktualisieren',
  );

  assert.equal(bericht.unveraendert, 1);
  assert.equal(bericht.aktualisiert, 0);
});

test('ein abweichender Typ beim Matrixcode-Treffer wird gemeldet, nicht übernommen', () => {
  // Über den Dreier-Schlüssel konnte das nie passieren: Dort steckt der Typ
  // im Schlüssel, ein abweichender Typ trifft also gar nicht erst. Der
  // Matrixcode trifft trotzdem – und ein Vertipper in der Typspalte, der
  // zufällig einen anderen angelegten Typ trifft, machte aus der Jacke sonst
  // stillschweigend einen Helm.
  const vorhanden = teil({ id: 1, typId: JACKE.id, matrixCode: 'ABC123', waschzaehler: 37 });
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Matrixcode\n1042-07/19;Feuerwehrhelm;ABC123\n',
    bestand({ teile: [vorhanden] }),
    'aktualisieren',
  );

  assert.equal(bericht.fehler, 1);
  assert.equal(bericht.aktualisiert, 0);
  assert.equal(bericht.neu, 0);
  assert.equal(bericht.zeilen[0].teilId, null, 'kein Teil wird angefasst');
  assert.equal(bericht.zeilen[0].werte, null, 'es gibt nichts zu übernehmen');
  assert.match(bericht.zeilen[0].meldung ?? '', /Überjacke HuPF Teil 1/);
  assert.match(bericht.zeilen[0].meldung ?? '', /Feuerwehrhelm/);

  // Der eigentliche Punkt: Der Helm ist nicht waschbar, `aktualisiereTeil`
  // hätte den Waschzähler deshalb auf 0 gesetzt. Ein Nachweis über 37
  // Wäschen an einem Teil mit Waschgrenze wäre ohne jede Spur verschwunden.
  assert.equal(vorhanden.waschzaehler, 37, 'der Waschzähler bleibt unangetastet');
});

test('derselbe Typ ist beim Matrixcode-Treffer selbstverständlich kein Fehler', () => {
  // Die Sperre gilt dem Typwechsel, nicht dem Matrixcode-Weg an sich.
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Matrixcode;Größe\n1042-07/19;Überjacke HuPF Teil 1;ABC123;54\n',
    bestand({ teile: [teil({ id: 1, typId: JACKE.id, matrixCode: 'ABC123' })] }),
    'aktualisieren',
  );

  assert.equal(bericht.fehler, 0);
  assert.equal(bericht.aktualisiert, 1);
  assert.equal(bericht.zeilen[0].teilId, 1);
});

test('eine Typkonflikt-Zeile blockiert den Code nicht für eine spätere, saubere Zeile', () => {
  // Dieselbe Regel, die weiter oben schon für die Nummer gilt: Was an einer
  // fehlerhaften Zeile scheitert, darf die folgende nicht mitreissen.
  const bericht = analysiereTeileImport(
    'Nummer;Typ;Matrixcode;Größe\n1042-07/19;Feuerwehrhelm;ABC123;54\n1042-07/19;Überjacke HuPF Teil 1;ABC123;54\n',
    bestand({ teile: [teil({ id: 1, typId: JACKE.id, matrixCode: 'ABC123' })] }),
    'aktualisieren',
  );

  assert.equal(bericht.fehler, 1);
  assert.equal(bericht.aktualisiert, 1);
  assert.equal(bericht.zeilen[1].teilId, 1);
});
