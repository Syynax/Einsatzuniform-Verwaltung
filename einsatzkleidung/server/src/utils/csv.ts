/**
 * Genügsamer CSV-Leser für Listen aus Excel, LibreOffice und Mitgliederverwaltung.
 *
 * Bewusst ohne Abhängigkeit: Was hier hereinkommt, ist eine handverlesene
 * Namensliste, kein Datenstrom. Dafür lohnt keine Bibliothek – wohl aber die
 * drei Eigenheiten, an denen ein selbstgebauter Split sonst scheitert:
 * das Semikolon als Trenner im deutschen Excel, die BOM am Dateianfang und
 * Felder in Anführungszeichen, die Trenner oder Zeilenumbrüche enthalten.
 */

const BOM = '\uFEFF';

/** Reihenfolge ist zugleich die Rangfolge bei Gleichstand – Semikolon zuerst. */
const TRENNER_KANDIDATEN = [';', ',', '\t', '|'];

export interface CsvZeile {
  /** Zeilennummer in der Datei, die Kopfzeile ist 1. Für Fehlermeldungen. */
  nummer: number;
  /** Werte nach normalisiertem Spaltennamen. */
  werte: Record<string, string>;
}

export interface CsvTabelle {
  /** Kopfzeile, normalisiert. */
  spalten: string[];
  /** Kopfzeile im Original – für Meldungen, die der Anwender wiedererkennt. */
  spaltenOriginal: string[];
  zeilen: CsvZeile[];
  trenner: string;
}

/**
 * Spaltennamen werden auf Kleinbuchstaben und Ziffern eingedampft, damit
 * "Tauglich bis", "tauglich_bis" und "TAUGLICHBIS" dieselbe Spalte sind.
 */
export function normalisiereSpalte(name: string): string {
  return name
    .split(BOM).join('')
    .trim()
    .toLowerCase()
    .split('ä').join('ae')
    .split('ö').join('oe')
    .split('ü').join('ue')
    .split('ß').join('ss')
    .replace(/[^a-z0-9]/g, '');
}

/** Zerlegt den Text in Felder – Anführungszeichen und Zeilenumbrüche beachtet. */
function zerlege(text: string, trenner: string): string[][] {
  const zeilen: string[][] = [];
  let aktuelle: string[] = [];
  let feld = '';
  let inAnfuehrung = false;

  for (let i = 0; i < text.length; i++) {
    const zeichen = text[i];

    if (inAnfuehrung) {
      if (zeichen === '"') {
        // Verdoppeltes Anführungszeichen ist ein echtes Zeichen im Feld.
        if (text[i + 1] === '"') {
          feld += '"';
          i++;
        } else {
          inAnfuehrung = false;
        }
      } else {
        feld += zeichen;
      }
      continue;
    }

    if (zeichen === '"') {
      inAnfuehrung = true;
    } else if (zeichen === trenner) {
      aktuelle.push(feld);
      feld = '';
    } else if (zeichen === '\n') {
      aktuelle.push(feld);
      zeilen.push(aktuelle);
      aktuelle = [];
      feld = '';
    } else if (zeichen !== '\r') {
      feld += zeichen;
    }
  }

  aktuelle.push(feld);
  zeilen.push(aktuelle);
  return zeilen;
}

/** Zählt die Trennerkandidaten in der ersten Zeile, ausserhalb von Anführungszeichen. */
export function erkenneTrenner(text: string): string {
  const zaehler = new Map<string, number>(TRENNER_KANDIDATEN.map(t => [t, 0]));
  let inAnfuehrung = false;

  for (let i = 0; i < text.length; i++) {
    const zeichen = text[i];
    if (zeichen === '"') {
      if (inAnfuehrung && text[i + 1] === '"') i++;
      else inAnfuehrung = !inAnfuehrung;
      continue;
    }
    if (!inAnfuehrung) {
      if (zeichen === '\n') break;
      const bisher = zaehler.get(zeichen);
      if (bisher !== undefined) zaehler.set(zeichen, bisher + 1);
    }
  }

  let bester = TRENNER_KANDIDATEN[0];
  for (const kandidat of TRENNER_KANDIDATEN) {
    if ((zaehler.get(kandidat) ?? 0) > (zaehler.get(bester) ?? 0)) bester = kandidat;
  }
  return bester;
}

/**
 * Liest den Dateiinhalt. Die erste nicht leere Zeile gilt als Kopfzeile;
 * eine Datei ohne Kopfzeile lässt sich nicht sinnvoll zuordnen und wird
 * weiter oben abgelehnt.
 */
export function parseCsv(text: string, trennerVorgabe?: string): CsvTabelle {
  const roh = text.startsWith(BOM) ? text.slice(BOM.length) : text;
  const trenner = trennerVorgabe ?? erkenneTrenner(roh);
  const alle = zerlege(roh, trenner);

  const leer = (felder: string[]): boolean => felder.every(f => f.trim() === '');

  const kopfIndex = alle.findIndex(felder => !leer(felder));
  if (kopfIndex === -1) {
    return { spalten: [], spaltenOriginal: [], zeilen: [], trenner };
  }

  const spaltenOriginal = alle[kopfIndex].map(f => f.trim());
  const spalten = spaltenOriginal.map(normalisiereSpalte);

  const zeilen: CsvZeile[] = [];
  for (let i = kopfIndex + 1; i < alle.length; i++) {
    const felder = alle[i];
    if (leer(felder)) continue;

    const werte: Record<string, string> = {};
    spalten.forEach((spalte, index) => {
      if (!spalte) return;
      // Erste Spalte gleichen Namens gewinnt – doppelte Köpfe kommen vor.
      if (werte[spalte] === undefined) werte[spalte] = (felder[index] ?? '').trim();
    });

    zeilen.push({ nummer: i + 1, werte });
  }

  return { spalten, spaltenOriginal, zeilen, trenner };
}
