import test from 'node:test';
import assert from 'node:assert/strict';
import { erkenneTrenner, normalisiereSpalte, parseCsv } from './csv';

test('erkennt das Semikolon aus dem deutschen Excel', () => {
  assert.equal(erkenneTrenner('Name;Atemschutz;Notiz\nMüller;ja;\n'), ';');
});

test('erkennt das Komma, wenn kein Semikolon vorkommt', () => {
  assert.equal(erkenneTrenner('Name,Atemschutz\nMüller,ja\n'), ',');
});

test('zählt Trenner in Anführungszeichen nicht mit', () => {
  // Das Komma steckt im Feld, der echte Trenner ist das Semikolon.
  assert.equal(erkenneTrenner('"Müller, Anna";Atemschutz\n'), ';');
});

test('normalisiert Spaltennamen über Schreibweisen hinweg', () => {
  assert.equal(normalisiereSpalte('Tauglich bis'), 'tauglichbis');
  assert.equal(normalisiereSpalte('TAUGLICH_BIS'), 'tauglichbis');
  assert.equal(normalisiereSpalte('Atemschutzgeräteträger'), 'atemschutzgeraetetraeger');
  assert.equal(normalisiereSpalte('  Name  '), 'name');
});

test('liest Kopfzeile und Werte', () => {
  const tabelle = parseCsv('Name;Atemschutz\nMüller, Anna;ja\nSchmidt, Ben;nein\n');
  assert.deepEqual(tabelle.spalten, ['name', 'atemschutz']);
  assert.deepEqual(tabelle.spaltenOriginal, ['Name', 'Atemschutz']);
  assert.equal(tabelle.zeilen.length, 2);
  assert.deepEqual(tabelle.zeilen[0].werte, { name: 'Müller, Anna', atemschutz: 'ja' });
  assert.equal(tabelle.zeilen[0].nummer, 2);
  assert.equal(tabelle.zeilen[1].nummer, 3);
});

test('behandelt Felder in Anführungszeichen samt Trenner darin', () => {
  const tabelle = parseCsv('Name;Notiz\n"Müller, Anna";"Spind 12; Schlüssel fehlt"\n');
  assert.equal(tabelle.zeilen[0].werte.name, 'Müller, Anna');
  assert.equal(tabelle.zeilen[0].werte.notiz, 'Spind 12; Schlüssel fehlt');
});

test('liest verdoppelte Anführungszeichen als Zeichen', () => {
  const tabelle = parseCsv('Name;Notiz\nMüller;"sagt ""passt schon"""\n');
  assert.equal(tabelle.zeilen[0].werte.notiz, 'sagt "passt schon"');
});

test('behält Zeilenumbrüche innerhalb eines Feldes', () => {
  const tabelle = parseCsv('Name;Notiz\nMüller;"erste\nzweite"\n');
  assert.equal(tabelle.zeilen.length, 1);
  assert.equal(tabelle.zeilen[0].werte.notiz, 'erste\nzweite');
});

test('kommt mit CRLF und BOM zurecht', () => {
  const tabelle = parseCsv('﻿Name;Atemschutz\r\nMüller;ja\r\n');
  assert.deepEqual(tabelle.spalten, ['name', 'atemschutz']);
  assert.equal(tabelle.zeilen[0].werte.name, 'Müller');
});

test('überspringt leere Zeilen', () => {
  const tabelle = parseCsv('Name\n\nMüller\n\n\nSchmidt\n');
  assert.deepEqual(tabelle.zeilen.map(z => z.werte.name), ['Müller', 'Schmidt']);
});

test('füllt fehlende Felder am Zeilenende als leer', () => {
  const tabelle = parseCsv('Name;Atemschutz;Notiz\nMüller;ja\n');
  assert.equal(tabelle.zeilen[0].werte.notiz, '');
});

test('liefert bei leerer Datei keine Spalten', () => {
  const tabelle = parseCsv('');
  assert.deepEqual(tabelle.spalten, []);
  assert.deepEqual(tabelle.zeilen, []);
});
