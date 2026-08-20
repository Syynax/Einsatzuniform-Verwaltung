/**
 * Personen aus einer CSV übernehmen.
 *
 * Der Weg ist zweistufig: erst prüfen, dann übernehmen. Beide Stufen laufen
 * durch dieselbe Analyse hier, damit die Vorschau in der Oberfläche genau das
 * zeigt, was hinterher passiert – und nicht eine zweite, leicht abweichende
 * Meinung darüber.
 *
 * Übernommen werden nur Felder, die die Datei auch mitbringt: Wer eine Liste
 * ohne Notiz-Spalte einliest, soll bestehende Notizen nicht verlieren.
 */

import type { Person } from '../types/kleidung';
import { parseCsv } from '../utils/csv';

export type ImportModus = 'ueberspringen' | 'aktualisieren';

export type ImportBefund = 'neu' | 'aktualisiert' | 'unveraendert' | 'uebersprungen' | 'fehler';

/** Nur die Felder, die in der Datei stehen. Fehlende bleiben unangetastet. */
export interface PersonWerte {
  name: string;
  atemschutz?: boolean;
  tauglichBis?: string | null;
  aktiv?: boolean;
  notiz?: string | null;
}

export interface ImportZeile {
  /** Zeilennummer in der Datei – so findet der Anwender die Stelle wieder. */
  zeile: number;
  name: string;
  befund: ImportBefund;
  /** Klartext, warum die Zeile so eingeordnet ist. Null, wenn nichts zu sagen ist. */
  meldung: string | null;
  /** Getroffene Person, wenn der Name schon vorhanden ist. */
  personId: number | null;
  werte: PersonWerte | null;
}

export interface ImportBericht {
  /** Gesetzt, wenn die Datei als Ganzes nicht taugt – dann ist `zeilen` leer. */
  problem: string | null;
  trenner: string;
  /** Kopfzeile im Original. */
  spalten: string[];
  /** Welche Spalte wofür genommen wurde – zum Gegenlesen in der Vorschau. */
  zuordnung: Record<string, string>;
  zeilen: ImportZeile[];
  neu: number;
  aktualisiert: number;
  unveraendert: number;
  uebersprungen: number;
  fehler: number;
}

/**
 * Schreibweisen, die in Mitgliederlisten vorkommen. Die Liste ist absichtlich
 * grosszügig – eine Wehr soll ihren Export nicht erst umbauen müssen.
 */
const ALIASSE = {
  name: ['name', 'person', 'einsatzkraft', 'mitglied', 'kamerad', 'nachnamevorname'],
  nachname: ['nachname', 'familienname', 'zuname'],
  vorname: ['vorname', 'rufname'],
  atemschutz: ['atemschutz', 'agt', 'atemschutzgeraetetraeger', 'atemschutztraeger', 'agtraeger'],
  tauglichBis: ['tauglichbis', 'tauglichkeit', 'tauglichkeitbis', 'g26', 'g263', 'atemschutztauglichkeit'],
  aktiv: ['aktiv', 'status'],
  notiz: ['notiz', 'bemerkung', 'bemerkungen', 'hinweis', 'kommentar'],
} as const;

type Feld = keyof typeof ALIASSE;

const JA = ['ja', 'j', 'true', 'wahr', 'x', '1', 'yes', 'y', 'agt', 'aktiv'];
const NEIN = ['nein', 'n', 'false', 'falsch', '0', 'no', '-', 'inaktiv', 'ausgetreten', 'passiv'];

function findeSpalte(spalten: string[], feld: Feld): string | null {
  for (const alias of ALIASSE[feld]) {
    if (spalten.includes(alias)) return alias;
  }
  return null;
}

/**
 * Null, wenn der Wert weder als Ja noch als Nein zu lesen ist. Die leere Zelle
 * gehört dazu – was sie bedeutet, hängt von der Spalte ab und entscheidet der
 * Aufrufer.
 */
export function jaNein(wert: string): boolean | null {
  const roh = wert.trim().toLowerCase();
  if (JA.includes(roh)) return true;
  if (NEIN.includes(roh)) return false;
  return null;
}

/**
 * Monatsangaben in den Formen, die aus Excel fallen. Rückgabe ist immer
 * JJJJ-MM; `undefined` heisst "steht da, ergibt aber keinen Monat".
 */
export function monatAus(wert: string): string | null | undefined {
  const roh = wert.trim();
  if (!roh) return null;

  const gueltig = (jahr: number, monat: number): string | undefined =>
    monat >= 1 && monat <= 12 && jahr >= 1900 && jahr <= 2999
      ? `${jahr}-${String(monat).padStart(2, '0')}`
      : undefined;

  // 2027-03 und 2027-03-15
  const iso = roh.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (iso) return gueltig(Number(iso[1]), Number(iso[2]));

  // 03/2027, 03.2027, 3-2027
  const monatJahr = roh.match(/^(\d{1,2})[./-](\d{4})$/);
  if (monatJahr) return gueltig(Number(monatJahr[2]), Number(monatJahr[1]));

  // 15.03.2027 und 15/03/2027
  const tagMonatJahr = roh.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (tagMonatJahr) return gueltig(Number(tagMonatJahr[3]), Number(tagMonatJahr[2]));

  return undefined;
}

/** Vergleichsform für Namen – Gross-/Kleinschreibung und Doppelleerzeichen egal. */
const namensSchluessel = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

function nameAus(werte: Record<string, string>, spalten: Partial<Record<Feld, string>>): string {
  const direkt = spalten.name ? (werte[spalten.name] ?? '').trim() : '';
  if (direkt) return direkt.replace(/\s+/g, ' ');

  const nachname = spalten.nachname ? (werte[spalten.nachname] ?? '').trim() : '';
  const vorname = spalten.vorname ? (werte[spalten.vorname] ?? '').trim() : '';
  if (nachname && vorname) return `${nachname}, ${vorname}`;
  return (nachname || vorname).replace(/\s+/g, ' ');
}

/** Gleichstand prüfen: Nur was die Datei mitbringt, zählt. */
function istUnveraendert(person: Person, werte: PersonWerte): boolean {
  if (person.name !== werte.name) return false;
  if (werte.atemschutz !== undefined && person.atemschutz !== werte.atemschutz) return false;
  if (werte.aktiv !== undefined && person.aktiv !== werte.aktiv) return false;
  if (werte.notiz !== undefined && person.notiz !== werte.notiz) return false;

  // Ohne Atemschutz wird die Tauglichkeit ohnehin geleert – dann zählt sie
  // hier auch nicht als Unterschied.
  const atemschutz = werte.atemschutz ?? person.atemschutz;
  if (atemschutz && werte.tauglichBis !== undefined && person.tauglichBis !== werte.tauglichBis) return false;
  if (!atemschutz && person.tauglichBis !== null) return false;

  return true;
}

export function neuePersonAus(werte: PersonWerte, id: number): Person {
  const atemschutz = werte.atemschutz ?? false;
  return {
    id,
    name: werte.name,
    atemschutz,
    tauglichBis: atemschutz ? (werte.tauglichBis ?? null) : null,
    aktiv: werte.aktiv ?? true,
    notiz: werte.notiz ?? null,
  };
}

export function aktualisierePerson(person: Person, werte: PersonWerte): Person {
  const atemschutz = werte.atemschutz ?? person.atemschutz;
  const tauglichBis = werte.tauglichBis !== undefined ? werte.tauglichBis : person.tauglichBis;
  return {
    ...person,
    name: werte.name,
    atemschutz,
    // Ohne Atemschutz ergibt eine Tauglichkeit keinen Sinn – dieselbe Regel
    // wie im Personendialog.
    tauglichBis: atemschutz ? tauglichBis : null,
    aktiv: werte.aktiv ?? person.aktiv,
    notiz: werte.notiz !== undefined ? werte.notiz : person.notiz,
  };
}

export function analysiereImport(
  csvText: string,
  bestehende: Person[],
  modus: ImportModus,
): ImportBericht {
  const tabelle = parseCsv(csvText);
  const leer: ImportBericht = {
    problem: null,
    trenner: tabelle.trenner,
    spalten: tabelle.spaltenOriginal,
    zuordnung: {},
    zeilen: [],
    neu: 0,
    aktualisiert: 0,
    unveraendert: 0,
    uebersprungen: 0,
    fehler: 0,
  };

  if (tabelle.spalten.length === 0) {
    return { ...leer, problem: 'Die Datei ist leer.' };
  }

  const spalten: Partial<Record<Feld, string>> = {};
  for (const feld of Object.keys(ALIASSE) as Feld[]) {
    const treffer = findeSpalte(tabelle.spalten, feld);
    if (treffer) spalten[feld] = treffer;
  }

  if (!spalten.name && !spalten.nachname) {
    return {
      ...leer,
      problem: 'Keine Namensspalte gefunden. Die Kopfzeile braucht "Name" – oder "Nachname" und "Vorname".',
    };
  }

  const zuordnung: Record<string, string> = {};
  for (const [feld, spalte] of Object.entries(spalten) as [Feld, string][]) {
    zuordnung[feld] = tabelle.spaltenOriginal[tabelle.spalten.indexOf(spalte)] ?? spalte;
  }

  if (tabelle.zeilen.length === 0) {
    return { ...leer, zuordnung, problem: 'Die Datei enthält ausser der Kopfzeile keine Zeilen.' };
  }

  const nachName = new Map(bestehende.map(p => [namensSchluessel(p.name), p]));
  const inDatei = new Map<string, number>();
  const zeilen: ImportZeile[] = [];

  for (const zeile of tabelle.zeilen) {
    const name = nameAus(zeile.werte, spalten);

    const fehlerZeile = (meldung: string): ImportZeile => ({
      zeile: zeile.nummer,
      name,
      befund: 'fehler',
      meldung,
      personId: null,
      werte: null,
    });

    if (name.length < 2) {
      zeilen.push(fehlerZeile(name ? 'Name ist zu kurz (mindestens 2 Zeichen).' : 'Kein Name in der Zeile.'));
      continue;
    }
    if (name.length > 80) {
      zeilen.push(fehlerZeile('Name ist länger als 80 Zeichen.'));
      continue;
    }

    const schluessel = namensSchluessel(name);
    const schonInDatei = inDatei.get(schluessel);
    if (schonInDatei !== undefined) {
      zeilen.push(fehlerZeile(`Name steht schon in Zeile ${schonInDatei}.`));
      continue;
    }

    const werte: PersonWerte = { name };
    let abgebrochen = false;

    if (spalten.atemschutz) {
      const roh = zeile.werte[spalten.atemschutz] ?? '';
      if (!roh.trim()) {
        // Leere Zelle heisst "nicht angekreuzt": Viele Listen markieren nur die
        // Träger und lassen den Rest frei.
        werte.atemschutz = false;
      } else {
        const gelesen = jaNein(roh);
        if (gelesen === null) {
          zeilen.push(fehlerZeile(`"${roh}" ist als Atemschutz nicht zu lesen. Erwartet: ja oder nein.`));
          abgebrochen = true;
        } else {
          werte.atemschutz = gelesen;
        }
      }
    }

    if (!abgebrochen && spalten.tauglichBis) {
      const roh = zeile.werte[spalten.tauglichBis] ?? '';
      const gelesen = monatAus(roh);
      if (gelesen === undefined) {
        zeilen.push(fehlerZeile(`"${roh}" ist als Tauglichkeit nicht zu lesen. Erwartet: JJJJ-MM.`));
        abgebrochen = true;
      } else {
        werte.tauglichBis = gelesen;
      }
    }

    // Anders als beim Atemschutz bleibt die leere Zelle hier ohne Wirkung:
    // Ein leeres Statusfeld soll niemanden stilllegen.
    if (!abgebrochen && spalten.aktiv && (zeile.werte[spalten.aktiv] ?? '').trim()) {
      const roh = zeile.werte[spalten.aktiv] ?? '';
      const gelesen = jaNein(roh);
      if (gelesen === null) {
        zeilen.push(fehlerZeile(`"${roh}" ist als Status nicht zu lesen. Erwartet: aktiv oder inaktiv.`));
        abgebrochen = true;
      } else {
        werte.aktiv = gelesen;
      }
    }

    if (!abgebrochen && spalten.notiz) {
      const roh = (zeile.werte[spalten.notiz] ?? '').trim();
      if (roh.length > 300) {
        zeilen.push(fehlerZeile('Notiz ist länger als 300 Zeichen.'));
        abgebrochen = true;
      } else {
        werte.notiz = roh || null;
      }
    }

    if (abgebrochen) continue;

    // Erst hier vormerken: Eine fehlerhafte Zeile soll den Namen nicht für
    // eine spätere, saubere Zeile blockieren.
    inDatei.set(schluessel, zeile.nummer);
    const treffer = nachName.get(schluessel);

    if (!treffer) {
      zeilen.push({ zeile: zeile.nummer, name, befund: 'neu', meldung: null, personId: null, werte });
      continue;
    }

    if (modus === 'ueberspringen') {
      zeilen.push({
        zeile: zeile.nummer,
        name,
        befund: 'uebersprungen',
        meldung: 'Ist schon angelegt.',
        personId: treffer.id,
        werte,
      });
      continue;
    }

    const unveraendert = istUnveraendert(treffer, werte);
    zeilen.push({
      zeile: zeile.nummer,
      name,
      befund: unveraendert ? 'unveraendert' : 'aktualisiert',
      meldung: unveraendert ? 'Steht schon genau so da.' : null,
      personId: treffer.id,
      werte,
    });
  }

  const zaehle = (befund: ImportBefund): number => zeilen.filter(z => z.befund === befund).length;

  return {
    problem: null,
    trenner: tabelle.trenner,
    spalten: tabelle.spaltenOriginal,
    zuordnung,
    zeilen,
    neu: zaehle('neu'),
    aktualisiert: zaehle('aktualisiert'),
    unveraendert: zaehle('unveraendert'),
    uebersprungen: zaehle('uebersprungen'),
    fehler: zaehle('fehler'),
  };
}
