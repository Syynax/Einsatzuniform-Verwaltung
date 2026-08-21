import test from 'node:test';
import assert from 'node:assert/strict';
import { leseMatrixCode } from './matrixCode';

/**
 * Fester Stichtag statt der Systemuhr: Die Plausibilitätsgrenze „nicht in der
 * Zukunft" wäre sonst vom Tag des Testlaufs abhängig.
 */
const HEUTE = new Date('2026-08-21T00:00:00.000Z');

/**
 * Vier echte Etiketten aus dem Bestand, so wie der Scanner sie liefert.
 * `hose349` gehört zur selben Lieferung wie `jacke306` – dass das eine eine
 * Jacke und das andere eine Hose ist, steht nirgends im Code.
 */
const ECHT = {
  jacke2014: 'BO00063544TOTAL CAREECV133366 / LION 20141107M/R 19989 112812',
  jacke306: 'BO00297306TOTAL CARE21021892 / LION 20200228S/S 60602 163364',
  hose349: 'BO00297349TOTAL CARE21021892 / LION 20200228S/S 60602 163364',
  hose362: 'BO00297362TOTAL CARE21021892 / LION 20200228S/R 60602 163364',
};

/**
 * Derselbe Aufbau mit ausgetauschten Feldern – so lassen sich Datum und Größe
 * einzeln prüfen, ohne die Bauart zu verlassen.
 */
const wieEcht = (datum: string, groesse: string, hersteller = 'LION'): string =>
  `BO00297362TOTAL CARE21021892 / ${hersteller} ${datum}${groesse} 60602 163364`;

// --- Die echten Codes ----------------------------------------------------

test('Aus den echten LHD-Etiketten kommen Hersteller, Herstellmonat und Größe', () => {
  assert.deepEqual(leseMatrixCode(ECHT.jacke2014, HEUTE), {
    groesse: 'M/R',
    hersteller: 'Lion',
    beschaffung: '2014-11',
  });
  assert.deepEqual(leseMatrixCode(ECHT.hose362, HEUTE), {
    groesse: 'S/R',
    hersteller: 'Lion',
    beschaffung: '2020-02',
  });
});

test('Jacke und Hose eines Satzes ergeben dieselben Vorschläge – und keinen Typ', () => {
  // `BO00297306` (Jacke) und `BO00297349` (Hose) sind bis auf die
  // Seriennummer zeichengleich. Größe, Hersteller und Datum gelten für beide;
  // welches Teil es ist, steht nicht im Code und wird nie vorgeschlagen.
  const erwartet = { groesse: 'S/S', hersteller: 'Lion', beschaffung: '2020-02' };
  assert.deepEqual(leseMatrixCode(ECHT.jacke306, HEUTE), erwartet);
  assert.deepEqual(leseMatrixCode(ECHT.hose349, HEUTE), erwartet);
  assert.notEqual(ECHT.jacke306, ECHT.hose349);

  for (const code of [ECHT.jacke306, ECHT.hose349]) {
    const vorschlag = leseMatrixCode(code, HEUTE) ?? {};
    assert.deepEqual(Object.keys(vorschlag).sort(), ['beschaffung', 'groesse', 'hersteller']);
  }
});

test('Das Lectra-Feld darf Buchstaben enthalten', () => {
  // `ECV133366` statt einer reinen Ziffernfolge – wer dort acht Ziffern
  // erwartet, verliert den ganzen Code.
  assert.equal(leseMatrixCode(ECHT.jacke2014, HEUTE)?.beschaffung, '2014-11');
});

// --- Was kein Datum ist --------------------------------------------------

test('Die Lectra-Nummer geht nie als Herstelldatum durch', () => {
  // `21021892` steht in allen drei jüngeren Codes und ist wie das
  // Herstelldatum acht Ziffern lang. Neben der Position trennt beide die
  // Plausibilität: Monat 18 und Tag 92 gibt es nicht.
  assert.equal(leseMatrixCode(wieEcht('21021892', 'S/R'), HEUTE)?.beschaffung, undefined);
  // Und selbst als echter Kalendertag bliebe eine Lectra-Nummer draussen,
  // weil `2102` in der Zukunft liegt.
  assert.equal(leseMatrixCode(wieEcht('21020228', 'S/R'), HEUTE)?.beschaffung, undefined);
  // Die übrigen Felder fallen deswegen nicht mit aus.
  assert.deepEqual(leseMatrixCode(wieEcht('21021892', 'S/R'), HEUTE), {
    groesse: 'S/R',
    hersteller: 'Lion',
  });
});

test('Ein unplausibles Datum bleibt leer', () => {
  const monat = (datum: string) => leseMatrixCode(wieEcht(datum, 'S/R'), HEUTE)?.beschaffung;
  // Monat 99 und Tag 99 gibt es nicht.
  assert.equal(monat('20209999'), undefined);
  // Vor 1990 wurde keine Kleidung erfasst, die heute noch im Bestand liegt.
  assert.equal(monat('18800101'), undefined);
  // Den 30. Februar rollt `Date` stillschweigend in den März weiter.
  assert.equal(monat('20200230'), undefined);
  // Der 29.02.2020 dagegen gab es wirklich.
  assert.equal(monat('20200229'), '2020-02');
});

test('Ein Datum in der Zukunft ist kein Herstelldatum', () => {
  const monat = (datum: string) => leseMatrixCode(wieEcht(datum, 'S/R'), HEUTE)?.beschaffung;
  assert.equal(monat('20991231'), undefined);
  assert.equal(monat('20260822'), undefined);
  // Der Stichtag selbst zählt noch.
  assert.equal(monat('20260821'), '2026-08');
});

// --- Größe ---------------------------------------------------------------

test('Weite und Länge werden nach der Größentabelle erkannt', () => {
  const groesse = (feld: string) => leseMatrixCode(wieEcht('20200228', feld), HEUTE)?.groesse;
  assert.equal(groesse('S/R'), 'S/R');
  // `S` ist Weite und Länge zugleich – zwei der echten Etiketten stehen so da.
  assert.equal(groesse('S/S'), 'S/S');
  assert.equal(groesse('M/T'), 'M/T');
  assert.equal(groesse('XL/XT'), 'XL/XT');
  assert.equal(groesse('XXL/XXT'), 'XXL/XXT');
  assert.equal(groesse('3XL/S'), '3XL/S');
  assert.equal(groesse('XXS/XS'), 'XXS/XS');
  assert.equal(leseMatrixCode(wieEcht('20200228', 'm/r').toLowerCase(), HEUTE)?.groesse, 'M/R');
});

test('Was nur wie eine Größe aussieht, wird keine', () => {
  const groesse = (feld: string) => leseMatrixCode(wieEcht('20200228', feld), HEUTE)?.groesse;
  // `L` und `XL` sind Weiten, aber keine Längen.
  assert.equal(groesse('M/L'), undefined);
  assert.equal(groesse('XL/XL'), undefined);
  // Die größte Weite heisst `3XL`, ein `2XL` gibt es in der Tabelle nicht.
  assert.equal(groesse('2XL/R'), undefined);
  // `S/N` steht auf Etiketten für die Seriennummer – `N` ist keine Länge.
  assert.equal(groesse('S/N'), undefined);
  // Konfektionsgrößen und Zoll-Paare werden bewusst nicht gelesen.
  assert.equal(groesse('44/32'), undefined);
  assert.equal(groesse('L52'), undefined);
  // Das Datum daneben bleibt davon unberührt.
  assert.equal(leseMatrixCode(wieEcht('20200228', 'M/L'), HEUTE)?.beschaffung, '2020-02');
});

// --- Hersteller ----------------------------------------------------------

test('Hersteller werden in üblicher Schreibweise übernommen', () => {
  const hersteller = (name: string) =>
    leseMatrixCode(wieEcht('20200228', 'S/R', name), HEUTE)?.hersteller;
  assert.equal(hersteller('LION'), 'Lion');
  assert.equal(hersteller('LHD'), 'LHD Group');
  assert.equal(hersteller('NOVOTEX'), 'Novotex');
});

test('Ein unbekannter Herstellername bleibt leer, ohne den Rest mitzunehmen', () => {
  assert.deepEqual(leseMatrixCode(wieEcht('20200228', 'S/R', 'WERAUCHIMMER'), HEUTE), {
    groesse: 'S/R',
    beschaffung: '2020-02',
  });
});

// --- Fremde Bauart -------------------------------------------------------

test('Ein Code fremder Bauart ergibt keinen Vorschlag', () => {
  // Alle drei Felder stehen darin – aber nicht in einem bekannten Aufbau.
  // Lieber nichts vorbelegen als halbe Treffer aus einem fremden Format.
  assert.equal(leseMatrixCode('LION 20200228 S/R', HEUTE), null);
  assert.equal(leseMatrixCode('0F3A-77C1B905', HEUTE), null);
  assert.equal(leseMatrixCode('4056677123456', HEUTE), null);
  assert.equal(leseMatrixCode('', HEUTE), null);
  assert.equal(leseMatrixCode('   ', HEUTE), null);
});

test('Ein angehängter Rest lässt den Aufbau nicht mehr passen', () => {
  // Das Muster ist bis ans Ende verankert: Was hinten dazukommt, ist eine
  // andere Bauart – und die ist unbekannt.
  assert.equal(leseMatrixCode(`${ECHT.hose362} UND NOCH WAS`, HEUTE), null);
  assert.equal(leseMatrixCode(ECHT.hose362.replace('TOTAL CARE', 'TOTALCARE'), HEUTE), null);
});

// --- Robustheit ----------------------------------------------------------

test('Kein Code bringt den Parser zum Werfen', () => {
  const wild = [
    '\\', '$', '((((', ' ', 'a'.repeat(500), '////', '99999999', '/', 'S/', '/R',
    'BO00297362TOTAL CARE', 'BO00297362TOTAL CARE /', wieEcht('', ''),
  ];
  for (const code of wild) {
    assert.doesNotThrow(() => leseMatrixCode(code, HEUTE));
  }
});
