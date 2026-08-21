import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aenderungsText,
  ampelVon,
  auswertung,
  brauchtAufmerksamkeit,
  istNummer,
  mitDetails,
  nachDringlichkeit,
  naechsteChargenNummer,
  naechstePruefungAus,
  normalisiereMatrixCode,
  normalisiereNummer,
  plusMonate,
  plusTage,
  pruefStatusVon,
  stammdatenDiff,
  pruefungFaellig,
  verbleibendeWaeschen,
  warnschwelleVon,
  waeschenProMonat,
} from './kleidung';
import type { Charge, Kleidungsstueck, Person, Teiletyp, Vorgang } from '../types/kleidung';

const typ = (ueber: Partial<Teiletyp> = {}): Teiletyp => ({
  id: 1,
  name: 'Überjacke HuPF Teil 1',
  kategorie: 'einsatzkleidung',
  waschbar: true,
  waschgrenze: 50,
  warnschwelle: 40,
  pruefIntervallMonate: 12,
  aktiv: true,
  ...ueber,
});

const teil = (ueber: Partial<Kleidungsstueck> = {}): Kleidungsstueck => ({
  id: 1,
  nummer: '1042-07/19',
  matrixCode: null,
  typId: 1,
  groesse: '52',
  hersteller: null,
  beschaffung: '2019-07',
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

const vorgang = (ueber: Partial<Vorgang> = {}): Vorgang => ({
  id: 1,
  teilId: 1,
  typ: 'waesche',
  zeit: '2026-08-01T10:00:00.000Z',
  detail: null,
  anlass: 'atemschutz',
  zaehlerVorher: 9,
  zaehlerNachher: 10,
  personId: null,
  chargeId: null,
  benutzer: null,
  ...ueber,
});

// --- Nummerncode ---------------------------------------------------------

test('Nummerncode akzeptiert nur das Muster XXXX-XX/XX', () => {
  assert.equal(istNummer('1042-07/19'), true);
  assert.equal(istNummer('104-07/19'), false);
  assert.equal(istNummer('1042-7/19'), false);
  assert.equal(istNummer('1042-07-19'), false);
  assert.equal(istNummer('ABCD-07/19'), false);
});

test('Nummerncode wird aus tolerant getippten Eingaben gebildet', () => {
  assert.equal(normalisiereNummer(' 1042-07/19 '), '1042-07/19');
  assert.equal(normalisiereNummer('10420719'), '1042-07/19');
  assert.equal(normalisiereNummer('1042 07 19'), '1042-07/19');
  assert.equal(normalisiereNummer('1042-07-19'), '1042-07/19');
});

test('Zu kurze oder zu lange Eingaben ergeben keine Nummer', () => {
  assert.equal(normalisiereNummer('1042071'), null);
  assert.equal(normalisiereNummer('104207199'), null);
  assert.equal(normalisiereNummer(''), null);
});

test('Ein Matrixcode mit acht Ziffern ist trotzdem keine Nummer', () => {
  // Sonst landete "0F3A-77C1B905" als Nummer 0377-19/05 in der Suche.
  assert.equal(normalisiereNummer('0F3A-77C1B905'), null);
  assert.equal(normalisiereNummer('LOT12345678'), null);
});

test('Matrixcode wird nur gesäubert, nicht ausgewertet', () => {
  assert.equal(normalisiereMatrixCode('  8F2A-91B27C4E \n'), '8F2A-91B27C4E');
  assert.equal(normalisiereMatrixCode('LOT\n4711\tX'), 'LOT 4711 X');
  assert.equal(normalisiereMatrixCode('ab'), null, 'zu kurz');
  assert.equal(normalisiereMatrixCode('x'.repeat(201)), null, 'zu lang');
});

// --- Waschzähler ---------------------------------------------------------

test('Ampel springt an Warnschwelle und Höchstzahl um', () => {
  assert.equal(ampelVon(teil({ waschzaehler: 39 }), typ()), 'ok');
  assert.equal(ampelVon(teil({ waschzaehler: 40 }), typ()), 'warnung');
  assert.equal(ampelVon(teil({ waschzaehler: 49 }), typ()), 'warnung');
  assert.equal(ampelVon(teil({ waschzaehler: 50 }), typ()), 'grenze');
  assert.equal(ampelVon(teil({ waschzaehler: 61 }), typ()), 'grenze');
});

test('Ohne eigene Warnschwelle gilt 80 Prozent der Höchstzahl', () => {
  const ohneSchwelle = typ({ warnschwelle: null });
  assert.equal(warnschwelleVon(ohneSchwelle), 40);
  assert.equal(ampelVon(teil({ waschzaehler: 39 }), ohneSchwelle), 'ok');
  assert.equal(ampelVon(teil({ waschzaehler: 40 }), ohneSchwelle), 'warnung');
});

test('Teile ohne Waschzähler bleiben immer grün', () => {
  const helm = typ({ waschbar: false, waschgrenze: null, warnschwelle: null });
  assert.equal(ampelVon(teil({ waschzaehler: 99 }), helm), 'ok');
  assert.equal(verbleibendeWaeschen(teil({ waschzaehler: 99 }), helm), null);
  assert.equal(warnschwelleVon(helm), null);
});

test('Verbleibende Wäschen können negativ werden', () => {
  assert.equal(verbleibendeWaeschen(teil({ waschzaehler: 48 }), typ()), 2);
  assert.equal(verbleibendeWaeschen(teil({ waschzaehler: 51 }), typ()), -1);
});

// --- Prüfung -------------------------------------------------------------

test('Prüftermin rechnet Monate weiter und kappt zu lange Monate', () => {
  assert.equal(plusMonate('2026-03-14', 12), '2027-03-14');
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  assert.equal(plusMonate('2026-11-30', 3), '2027-02-28');
});

test('Ohne Intervall gibt es keinen nächsten Prüftermin', () => {
  assert.equal(naechstePruefungAus('2026-03-14', typ()), '2027-03-14');
  assert.equal(naechstePruefungAus('2026-03-14', typ({ pruefIntervallMonate: null })), null);
  assert.equal(naechstePruefungAus(null, typ()), null);
});

test('Prüfung ist am Termin selbst fällig, ausgesonderte Teile nie', () => {
  assert.equal(pruefungFaellig(teil({ naechstePruefung: '2026-08-20' }), '2026-08-20'), true);
  assert.equal(pruefungFaellig(teil({ naechstePruefung: '2026-08-21' }), '2026-08-20'), false);
  assert.equal(pruefungFaellig(teil({ naechstePruefung: null }), '2026-08-20'), false);
  assert.equal(
    pruefungFaellig(teil({ naechstePruefung: '2020-01-01', status: 'ausgesondert' }), '2026-08-20'),
    false,
  );
});

// --- Anreicherung --------------------------------------------------------

const personen: Person[] = [
  { id: 1, name: 'Kramer, Sandra', atemschutz: true, tauglichBis: '2027-06', aktiv: true, notiz: null },
];
const chargen: Charge[] = [
  {
    id: 7, nummer: 'W-25', anlass: 'atemschutz', ort: 'Eigene Waschmaschine', status: 'erfasst',
    notiz: null, erstellt: '2026-08-20T05:40:00.000Z', abgegeben: null, zurueck: null, benutzer: null,
  },
];
const nachschlag = { typen: [typ()], personen, chargen, heute: '2026-08-20' };

/**
 * Ein Teil mit gepflegter Prüfung. Tests, die etwas anderes prüfen, sollen
 * nicht am Hinweis "Prüfung nie eingetragen" hängen bleiben.
 */
const GEPRUEFT = { letztePruefung: '2026-06-01', naechstePruefung: '2027-06-01' };

test('Ein Teil wird um Typ, Träger und Charge ergänzt', () => {
  const detail = mitDetails(teil({ personId: 1, chargeId: 7, status: 'waesche' }), nachschlag);
  assert.equal(detail.typName, 'Überjacke HuPF Teil 1');
  assert.equal(detail.personName, 'Kramer, Sandra');
  assert.equal(detail.atemschutz, true);
  assert.equal(detail.chargeNummer, 'W-25');
  assert.equal(detail.verbleibend, 40);
});

test('Ein Teil mit gelöschtem Typ verschwindet nicht', () => {
  const detail = mitDetails(teil({ typId: 99 }), nachschlag);
  assert.equal(detail.typName, 'Unbekannter Typ');
  assert.equal(detail.ampel, 'ok');
});

test('Hinweise nennen Waschgrenze, Prüfung und Reparatur', () => {
  const nahAnDerGrenze = mitDetails(teil({ waschzaehler: 48, ...GEPRUEFT }), nachschlag);
  assert.deepEqual(nahAnDerGrenze.hinweise, ['Noch 2 Wäschen bis zur Grenze']);

  const ueberGrenze = mitDetails(teil({ waschzaehler: 50, naechstePruefung: '2026-08-01' }), nachschlag);
  assert.deepEqual(ueberGrenze.hinweise, [
    'Waschgrenze erreicht – Ersatz beschaffen',
    'Prüfung fällig seit 2026-08-01',
  ]);

  const inReparatur = mitDetails(teil({ status: 'reparatur', ...GEPRUEFT }), nachschlag);
  assert.deepEqual(inReparatur.hinweise, ['In Reparatur']);

  const ausgesondert = mitDetails(teil({ status: 'ausgesondert', waschzaehler: 60 }), nachschlag);
  assert.deepEqual(ausgesondert.hinweise, ['Ausgesondert']);
  assert.equal(brauchtAufmerksamkeit(ausgesondert), false);
});

test('Einzahl bei genau einer verbleibenden Wäsche', () => {
  const detail = mitDetails(teil({ waschzaehler: 49, ...GEPRUEFT }), nachschlag);
  assert.deepEqual(detail.hinweise, ['Noch 1 Wäsche bis zur Grenze']);
});

test('Handlungsbedarf sortiert Grenze vor Prüfung vor Warnung', () => {
  const liste = [
    mitDetails(teil({ id: 1, nummer: '0001-01/20', waschzaehler: 45, ...GEPRUEFT }), nachschlag),
    mitDetails(teil({ id: 2, nummer: '0002-01/20', waschzaehler: 50, ...GEPRUEFT }), nachschlag),
    mitDetails(teil({ id: 3, nummer: '0003-01/20', naechstePruefung: '2026-01-01' }), nachschlag),
    mitDetails(teil({ id: 4, nummer: '0004-01/20', status: 'reparatur', ...GEPRUEFT }), nachschlag),
  ].sort(nachDringlichkeit);

  assert.deepEqual(liste.map(t => t.id), [2, 3, 1, 4]);
});

// --- Chargen -------------------------------------------------------------

test('Chargennummern zählen hoch und ignorieren fremde Formate', () => {
  assert.equal(naechsteChargenNummer([]), 'W-1');
  assert.equal(naechsteChargenNummer(chargen), 'W-26');
  assert.equal(
    naechsteChargenNummer([{ ...chargen[0], nummer: 'Sonderwäsche' }]),
    'W-1',
  );
});

// --- Auswertung ----------------------------------------------------------

test('Wäschen pro Monat füllen leere Monate mit 0', () => {
  const reihe = waeschenProMonat(
    [vorgang({ zeit: '2026-08-02T10:00:00.000Z' }), vorgang({ id: 2, zeit: '2026-08-11T10:00:00.000Z' })],
    new Date(Date.UTC(2026, 7, 20)),
    3,
  );
  assert.deepEqual(reihe, [
    { monat: '2026-06', waeschen: 0 },
    { monat: '2026-07', waeschen: 0 },
    { monat: '2026-08', waeschen: 2 },
  ]);
});

test('Auswertung zählt nur Wäschen, nicht andere Vorgänge', () => {
  const ergebnis = auswertung(
    [teil({ id: 1, waschzaehler: 48 }), teil({ id: 2, waschzaehler: 12 }), teil({ id: 3, status: 'ausgesondert' })],
    [typ()],
    [
      vorgang({ id: 1, anlass: 'atemschutz' }),
      vorgang({ id: 2, anlass: 'uebung' }),
      vorgang({ id: 3, typ: 'pruefung', anlass: null }),
      vorgang({ id: 4, zeit: '2025-08-01T10:00:00.000Z', anlass: 'atemschutz' }),
    ],
    new Date(Date.UTC(2026, 7, 20)),
  );

  // Die Prüfung zählt nicht mit, die Wäsche aus dem Vorjahr nicht ins Jahr.
  assert.equal(ergebnis.jahresWaeschen, 2);
  assert.deepEqual(ergebnis.waeschenNachAnlass, [
    { anlass: 'atemschutz', anzahl: 2 },
    { anlass: 'uebung', anzahl: 1 },
  ]);
  assert.equal(ergebnis.ausgesondert, 1);
  assert.deepEqual(ergebnis.waeschenProTyp, [
    { typName: 'Überjacke HuPF Teil 1', waeschen: 60, teile: 2, schnitt: 30 },
  ]);
});

test('plusTage rechnet über Monats- und Jahresgrenzen', () => {
  assert.equal(plusTage('2026-08-20', 30), '2026-09-19');
  assert.equal(plusTage('2026-12-20', 30), '2027-01-19');
  assert.equal(plusTage('2028-02-28', 1), '2028-02-29');
});

test('nie eingetragene Prüfung ist ein eigener Zustand, nicht "in Ordnung"', () => {
  // Der Kern: Intervall am Typ hinterlegt, aber am Teil steht keine Prüfung.
  const nie = teil({ letztePruefung: null, naechstePruefung: null });
  assert.equal(pruefStatusVon(nie, typ(), '2026-08-20'), 'nie');

  const details = mitDetails(nie, nachschlag);
  assert.deepEqual(details.hinweise, ['Prüfung nie eingetragen']);
  assert.equal(brauchtAufmerksamkeit(details), true);
});

test('ohne Prüfintervall am Typ bleibt alles unauffällig', () => {
  const ohneIntervall = typ({ pruefIntervallMonate: null });
  assert.equal(pruefStatusVon(teil(), ohneIntervall, '2026-08-20'), 'ok');
});

test('Prüfung meldet sich mit Vorlauf, nicht erst nach Ablauf', () => {
  const heute = '2026-08-20';
  const stufe = (naechstePruefung: string) =>
    pruefStatusVon(teil({ letztePruefung: '2025-08-01', naechstePruefung }), typ(), heute);

  assert.equal(stufe('2026-08-19'), 'faellig');
  assert.equal(stufe('2026-08-20'), 'faellig');
  assert.equal(stufe('2026-08-21'), 'bald');
  assert.equal(stufe('2026-09-19'), 'bald', 'genau am Rand des Vorlaufs');
  assert.equal(stufe('2026-09-20'), 'ok', 'einen Tag später ist noch nichts zu tun');
});

test('ausgesondert wird nicht mehr zur Prüfung gemeldet', () => {
  const alt = teil({ status: 'ausgesondert', letztePruefung: null, naechstePruefung: null });
  assert.equal(pruefStatusVon(alt, typ(), '2026-08-20'), 'ok');
});

test('anstehende Prüfung nennt den Termin statt nur zu warnen', () => {
  const bald = mitDetails(
    teil({ letztePruefung: '2025-09-01', naechstePruefung: '2026-09-01' }),
    nachschlag,
  );
  assert.deepEqual(bald.hinweise, ['Prüfung fällig am 2026-09-01']);
  assert.equal(bald.pruefStatus, 'bald');
});

test('nie geprüft ist genauso dringend wie überfällig', () => {
  const liste = [
    mitDetails(teil({ id: 1, nummer: '0001-01/20', ...GEPRUEFT, waschzaehler: 45 }), nachschlag),
    mitDetails(teil({ id: 2, nummer: '0002-01/20', letztePruefung: null, naechstePruefung: null }), nachschlag),
    mitDetails(teil({ id: 3, nummer: '0003-01/20', ...GEPRUEFT, waschzaehler: 50 }), nachschlag),
  ].sort(nachDringlichkeit);

  // Grenze zuerst, dann die nie geprüfte, erst danach die blosse Warnung.
  assert.deepEqual(liste.map(t => t.id), [3, 2, 1]);
});

test('Stammdatendiff meldet nur nachweisrelevante Felder', () => {
  const alt = teil({ waschzaehler: 48, groesse: '52', standort: 'Spind 12', notiz: 'alt' });
  const neu = teil({ waschzaehler: 12, groesse: '54', standort: 'Spind 3', notiz: 'neu' });

  const diff = stammdatenDiff(alt, neu);

  // Standort und Notiz stehen bewusst nicht drin – sie sagen nichts über den
  // Zustand des Teils aus.
  assert.deepEqual(diff, [
    { feld: 'Größe', vorher: '52', nachher: '54' },
    { feld: 'Waschzähler', vorher: '48', nachher: '12' },
  ]);
});

test('Stammdatendiff ist leer, wenn sich nichts geändert hat', () => {
  assert.deepEqual(stammdatenDiff(teil(), teil()), []);
});

test('Stammdatendiff löst den Teiletyp über den Namen auf', () => {
  const diff = stammdatenDiff(teil({ typId: 1 }), teil({ typId: 2 }), id => `Typ ${id}`);
  assert.deepEqual(diff, [{ feld: 'Teiletyp', vorher: 'Typ 1', nachher: 'Typ 2' }]);
});

test('Stammdatendiff schreibt fehlende Werte als Gedankenstrich', () => {
  const diff = stammdatenDiff(teil({ letztePruefung: null }), teil({ letztePruefung: '2026-08-01' }));
  assert.deepEqual(diff, [{ feld: 'Letzte Prüfung', vorher: '–', nachher: '2026-08-01' }]);
});

test('Änderungstext liest sich als Einzeiler für den Verlauf', () => {
  const text = aenderungsText([
    { feld: 'Waschzähler', vorher: '48', nachher: '12' },
    { feld: 'Größe', vorher: '52', nachher: '54' },
  ]);
  assert.equal(text, 'Waschzähler 48 → 12, Größe 52 → 54');
});
