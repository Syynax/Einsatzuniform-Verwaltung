/**
 * Werte lesen, wie sie aus Excel und LibreOffice fallen.
 *
 * Gemeinsame Grundlage der beiden CSV-Importe. Dieselbe Datei wird einmal für
 * Personen und einmal für Kleidungsstücke eingelesen – die Schreibweisen für
 * „ja", für einen Monat und für ein Datum sind dabei dieselben, und sie sollen
 * an einer Stelle stehen statt an zweien, die auseinanderlaufen.
 */

const JA = ['ja', 'j', 'true', 'wahr', 'x', '1', 'yes', 'y', 'agt', 'aktiv'];
const NEIN = ['nein', 'n', 'false', 'falsch', '0', 'no', '-', 'inaktiv', 'ausgetreten', 'passiv'];

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

const imBereich = (jahr: number): boolean => jahr >= 1900 && jahr <= 2999;

/**
 * Monatsangaben in den Formen, die aus Excel fallen. Rückgabe ist immer
 * JJJJ-MM; `undefined` heisst "steht da, ergibt aber keinen Monat".
 */
export function monatAus(wert: string): string | null | undefined {
  const roh = wert.trim();
  if (!roh) return null;

  const gueltig = (jahr: number, monat: number): string | undefined =>
    monat >= 1 && monat <= 12 && imBereich(jahr)
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

/**
 * Tagesgenaue Datumsangabe als JJJJ-MM-TT. `undefined` heisst wie oben:
 * Es steht etwas da, aber kein Datum.
 *
 * Der Tag wird gegen den echten Kalender geprüft – ein 31.02. ist kein Datum,
 * sondern ein Tippfehler, und der soll in der Vorschau auffallen statt still
 * auf den 03.03. zu rutschen.
 */
export function datumAus(wert: string): string | null | undefined {
  const roh = wert.trim();
  if (!roh) return null;

  const teile =
    roh.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)?.slice(1).map(Number)
    ?? roh.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)?.slice(1).map(Number).reverse();

  if (!teile) return undefined;

  const [jahr, monat, tag] = teile;
  if (!imBereich(jahr) || monat < 1 || monat > 12 || tag < 1 || tag > 31) return undefined;

  const geprueft = new Date(Date.UTC(jahr, monat - 1, tag));
  if (geprueft.getUTCMonth() !== monat - 1 || geprueft.getUTCDate() !== tag) return undefined;

  return geprueft.toISOString().slice(0, 10);
}

/** Ganze Zahl aus einer Zelle. `undefined`, wenn dort keine steht. */
export function zahlAus(wert: string): number | null | undefined {
  const roh = wert.trim();
  if (!roh) return null;
  if (!/^-?\d+$/.test(roh)) return undefined;
  return Number(roh);
}

/** Vergleichsform für Namen – Gross-/Kleinschreibung und Doppelleerzeichen egal. */
export const namensSchluessel = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');
