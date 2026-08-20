import type {
  Ampel,
  Auswertung,
  Charge,
  Kleidungsstueck,
  Person,
  TeilMitDetails,
  Teiletyp,
  Vorgang,
  WaescheAnlass,
} from '../types/kleidung';
import { ANLASS_TEXT, WAESCHE_ANLAESSE } from '../constants/kleidung';

/**
 * Die Rechenregeln der Einsatzkleidung – bewusst ohne Express und ohne
 * Dateizugriff, damit sie sich einzeln testen lassen.
 */

// --- Codes ---------------------------------------------------------------

/** Aufgedruckte Nummer: vier Ziffern, Bindestrich, zwei Ziffern, Schrägstrich, zwei Ziffern. */
export const NUMMER_MUSTER = /^\d{4}-\d{2}\/\d{2}$/;

export function istNummer(code: string): boolean {
  return NUMMER_MUSTER.test(code.trim());
}

/**
 * Bringt eine Eingabe auf das Nummernformat. Akzeptiert wird auch die reine
 * Ziffernfolge (10420719) und ein abweichender Trenner – am Etikett steht die
 * Nummer nicht immer sauber lesbar, und beim Tippen soll niemand auf
 * Sonderzeichen achten müssen.
 *
 * Gibt null zurück, wenn daraus keine gültige Nummer wird.
 */
export function normalisiereNummer(eingabe: string): string | null {
  const roh = eingabe.trim();
  if (NUMMER_MUSTER.test(roh)) return roh;

  // Nur Ziffern und übliche Trenner dürfen zur Nummer werden. Sonst würde ein
  // Matrixcode wie "0F3A-77C1B905" als Nummer durchgehen, bloss weil acht
  // Ziffern darin stecken – und der Scan suchte im falschen Feld.
  if (!/^[0-9 ./-]+$/.test(roh)) return null;

  const ziffern = roh.replace(/[^0-9]/g, '');
  if (ziffern.length !== 8) return null;
  return `${ziffern.slice(0, 4)}-${ziffern.slice(4, 6)}/${ziffern.slice(6, 8)}`;
}

/**
 * Der Matrixcode wird nicht ausgewertet: Was der Hersteller hineingeschrieben
 * hat, ist uns egal – der rohe Wert dient nur als Zuordnung zu einem Teil.
 * Gesäubert wird trotzdem, damit ein Zeilenumbruch aus dem Scanner nicht zu
 * zwei verschiedenen Codes für dasselbe Etikett führt.
 */
export function normalisiereMatrixCode(eingabe: string): string | null {
  const wert = eingabe.replace(/\s+/g, ' ').trim();
  if (wert.length < 3 || wert.length > 200) return null;
  return wert;
}

// --- Waschzähler ---------------------------------------------------------

/** Ohne eigene Angabe wird ab 80 Prozent der Höchstzahl gewarnt. */
export function warnschwelleVon(typ: Teiletyp): number | null {
  if (!typ.waschbar) return null;
  if (typ.warnschwelle !== null) return typ.warnschwelle;
  if (typ.waschgrenze === null) return null;
  return Math.ceil(typ.waschgrenze * 0.8);
}

export function verbleibendeWaeschen(teil: Kleidungsstueck, typ: Teiletyp): number | null {
  if (!typ.waschbar || typ.waschgrenze === null) return null;
  return typ.waschgrenze - teil.waschzaehler;
}

export function ampelVon(teil: Kleidungsstueck, typ: Teiletyp): Ampel {
  if (!typ.waschbar || typ.waschgrenze === null) return 'ok';
  if (teil.waschzaehler >= typ.waschgrenze) return 'grenze';

  const schwelle = warnschwelleVon(typ);
  if (schwelle !== null && teil.waschzaehler >= schwelle) return 'warnung';
  return 'ok';
}

// --- Prüfung -------------------------------------------------------------

/** Datum plus n Monate, als YYYY-MM-DD. Ein 31. wird auf den Monatsletzten gezogen. */
export function plusMonate(datum: string, monate: number): string {
  const [jahr, monat, tag] = datum.split('-').map(Number);
  const ziel = new Date(Date.UTC(jahr, monat - 1 + monate, 1));
  const letzterTag = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(tag, letzterTag));
  return ziel.toISOString().slice(0, 10);
}

/** Nächster Prüftermin aus letzter Prüfung und Intervall. Null ohne Intervall. */
export function naechstePruefungAus(letztePruefung: string | null, typ: Teiletyp): string | null {
  if (!letztePruefung || typ.pruefIntervallMonate === null) return null;
  return plusMonate(letztePruefung, typ.pruefIntervallMonate);
}

export function pruefungFaellig(teil: Kleidungsstueck, heute: string): boolean {
  if (teil.status === 'ausgesondert') return false;
  return teil.naechstePruefung !== null && teil.naechstePruefung <= heute;
}

// --- Anreicherung --------------------------------------------------------

export interface Nachschlag {
  typen: Teiletyp[];
  personen: Person[];
  chargen: Charge[];
  heute: string;
}

/**
 * Ergänzt ein Teil um alles, was die Oberfläche zum Anzeigen braucht.
 * Fehlt der Typ (gelöscht), bleibt das Teil sichtbar – lieber ein Eintrag
 * ohne Typnamen als ein verschwundenes Kleidungsstück.
 */
export function mitDetails(teil: Kleidungsstueck, nach: Nachschlag): TeilMitDetails {
  const typ = nach.typen.find(t => t.id === teil.typId);
  const person = teil.personId !== null ? nach.personen.find(p => p.id === teil.personId) : undefined;
  const charge = teil.chargeId !== null ? nach.chargen.find(c => c.id === teil.chargeId) : undefined;

  const ersatzTyp: Teiletyp = typ ?? {
    id: teil.typId,
    name: 'Unbekannter Typ',
    kategorie: 'ausruestung',
    waschbar: false,
    waschgrenze: null,
    warnschwelle: null,
    pruefIntervallMonate: null,
    aktiv: false,
  };

  const ampel = ampelVon(teil, ersatzTyp);
  const faellig = pruefungFaellig(teil, nach.heute);
  const verbleibend = verbleibendeWaeschen(teil, ersatzTyp);

  const hinweise: string[] = [];
  if (teil.status === 'ausgesondert') {
    hinweise.push('Ausgesondert');
  } else {
    if (ampel === 'grenze') {
      hinweise.push('Waschgrenze erreicht – Ersatz beschaffen');
    } else if (ampel === 'warnung' && verbleibend !== null) {
      hinweise.push(`Noch ${verbleibend} Wäsche${verbleibend === 1 ? '' : 'n'} bis zur Grenze`);
    }
    if (faellig) hinweise.push(`Prüfung fällig seit ${teil.naechstePruefung}`);
    if (teil.status === 'reparatur') hinweise.push('In Reparatur');
  }

  return {
    ...teil,
    typName: ersatzTyp.name,
    kategorie: ersatzTyp.kategorie,
    waschbar: ersatzTyp.waschbar,
    waschgrenze: ersatzTyp.waschgrenze,
    verbleibend,
    ampel,
    personName: person?.name ?? null,
    atemschutz: person?.atemschutz ?? false,
    chargeNummer: charge?.nummer ?? null,
    hinweise,
    pruefungFaellig: faellig,
  };
}

/**
 * Reihenfolge der Liste Handlungsbedarf: erst was die Grenze gerissen hat,
 * dann fällige Prüfungen, dann alles mit Warnung.
 */
export function nachDringlichkeit(a: TeilMitDetails, b: TeilMitDetails): number {
  const rang = (t: TeilMitDetails): number => {
    if (t.ampel === 'grenze') return 0;
    if (t.pruefungFaellig) return 1;
    if (t.ampel === 'warnung') return 2;
    if (t.status === 'reparatur') return 3;
    return 4;
  };
  return rang(a) - rang(b) || a.nummer.localeCompare(b.nummer);
}

export function brauchtAufmerksamkeit(teil: TeilMitDetails): boolean {
  return teil.status !== 'ausgesondert' && teil.hinweise.length > 0;
}

// --- Chargen -------------------------------------------------------------

/** Nächste freie Chargennummer im Format W-1, W-2 und so weiter. */
export function naechsteChargenNummer(chargen: Charge[]): string {
  const zahlen = chargen
    .map(c => /^W-(\d+)$/.exec(c.nummer))
    .filter((treffer): treffer is RegExpExecArray => treffer !== null)
    .map(treffer => Number(treffer[1]));
  const hoechste = zahlen.length > 0 ? Math.max(...zahlen) : 0;
  return `W-${hoechste + 1}`;
}

// --- Auswertung ----------------------------------------------------------

const monatVon = (iso: string): string => iso.slice(0, 7);

/**
 * Zählt zurückgemeldete Wäschen je Monat, die letzten `monate` Monate
 * einschliesslich des laufenden. Monate ohne Wäsche stehen mit 0 drin, sonst
 * hätte das Diagramm Lücken.
 */
export function waeschenProMonat(vorgaenge: Vorgang[], bis: Date, monate = 12): { monat: string; waeschen: number }[] {
  const reihe: { monat: string; waeschen: number }[] = [];
  const zaehler = new Map<string, number>();

  for (const vorgang of vorgaenge) {
    if (vorgang.typ !== 'waesche') continue;
    const monat = monatVon(vorgang.zeit);
    zaehler.set(monat, (zaehler.get(monat) ?? 0) + 1);
  }

  for (let i = monate - 1; i >= 0; i--) {
    const zeitpunkt = new Date(Date.UTC(bis.getUTCFullYear(), bis.getUTCMonth() - i, 1));
    const monat = zeitpunkt.toISOString().slice(0, 7);
    reihe.push({ monat, waeschen: zaehler.get(monat) ?? 0 });
  }

  return reihe;
}

export function auswertung(
  teile: Kleidungsstueck[],
  typen: Teiletyp[],
  vorgaenge: Vorgang[],
  bis: Date,
): Auswertung {
  const jahr = String(bis.getUTCFullYear());

  const nachAnlass = WAESCHE_ANLAESSE.map(anlass => ({
    anlass,
    anzahl: vorgaenge.filter(v => v.typ === 'waesche' && v.anlass === anlass).length,
  })).filter(eintrag => eintrag.anzahl > 0);

  const proTyp = typen
    .filter(typ => typ.waschbar)
    .map(typ => {
      const teileDesTyps = teile.filter(t => t.typId === typ.id && t.status !== 'ausgesondert');
      const waeschen = teileDesTyps.reduce((summe, t) => summe + t.waschzaehler, 0);
      return {
        typName: typ.name,
        waeschen,
        teile: teileDesTyps.length,
        schnitt: teileDesTyps.length > 0 ? Math.round((waeschen / teileDesTyps.length) * 10) / 10 : 0,
      };
    })
    .filter(eintrag => eintrag.teile > 0)
    .sort((a, b) => b.schnitt - a.schnitt);

  return {
    waeschenProMonat: waeschenProMonat(vorgaenge, bis),
    waeschenNachAnlass: nachAnlass,
    waeschenProTyp: proTyp,
    jahresWaeschen: vorgaenge.filter(v => v.typ === 'waesche' && v.zeit.startsWith(jahr)).length,
    ausgesondert: teile.filter(t => t.status === 'ausgesondert').length,
  };
}

/** Klartext eines Anlasses. */
export function anlassText(anlass: WaescheAnlass | null): string | null {
  if (!anlass) return null;
  return ANLASS_TEXT[anlass] ?? anlass;
}
