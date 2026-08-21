import type {
  Ampel,
  Auswertung,
  Charge,
  Kleidungsstueck,
  Person,
  PruefStatus,
  TeilMitDetails,
  Teiletyp,
  Vorgang,
  WaescheAnlass,
} from '../types/kleidung';
import { ANLASS_TEXT, PRUEF_VORWARN_TAGE, WAESCHE_ANLAESSE } from '../constants/kleidung';

/**
 * Die Rechenregeln der Einsatzkleidung – bewusst ohne Express und ohne
 * Dateizugriff, damit sie sich einzeln testen lassen.
 */

// --- Codes ---------------------------------------------------------------

/**
 * Aufgedruckte Nummer: vier bis zehn Ziffern, Bindestrich, zwei Ziffern,
 * Schrägstrich, zwei Ziffern. Der vordere Block ist je nach Hersteller
 * unterschiedlich lang – `6072-10/23` steht genauso auf einem Etikett wie
 * `1234567890-04/25`.
 */
export const NUMMER_MUSTER = /^\d{4,10}-\d{2}\/\d{2}$/;

/** Kürzester und längster vorderer Block – gilt auch für die reine Ziffernfolge. */
export const NUMMER_VORNE_MIN = 4;
export const NUMMER_VORNE_MAX = 10;

/** Der hintere Teil ist immer `XX/XX`, also vier Ziffern. */
const NUMMER_HINTEN = 4;

export function istNummer(code: string): boolean {
  return NUMMER_MUSTER.test(code.trim());
}

/**
 * Bringt eine Eingabe auf das Nummernformat. Akzeptiert wird auch die reine
 * Ziffernfolge (10420719) und ein abweichender Trenner – am Etikett steht die
 * Nummer nicht immer sauber lesbar, und beim Tippen soll niemand auf
 * Sonderzeichen achten müssen.
 *
 * Die hinteren vier Ziffern sind immer `XX/XX`; alles davor ist der vordere
 * Block. Deshalb lässt sich auch eine reine Ziffernfolge eindeutig aufteilen,
 * egal wie lang sie vorne ist.
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
  const vorne = ziffern.length - NUMMER_HINTEN;
  if (vorne < NUMMER_VORNE_MIN || vorne > NUMMER_VORNE_MAX) return null;

  return `${ziffern.slice(0, vorne)}-${ziffern.slice(vorne, vorne + 2)}/${ziffern.slice(vorne + 2)}`;
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

// --- Benennung und Identifizierbarkeit -----------------------------------

/**
 * Woran ein Teil im Fliesstext benannt wird.
 *
 * Bewusst nicht `Pick<Kleidungsstueck, 'id' | 'nummer' | 'matrixCode'>`,
 * sondern dasselbe mit nullbarer Nummer: Ein echtes `Kleidungsstueck` passt
 * heute schon hinein (`string` ist auf `string | null` zuweisbar), und wenn
 * `Kleidungsstueck.nummer` später selbst nullbar wird, muss hier nichts
 * nachgezogen werden.
 */
export type TeilKennung = Pick<Kleidungsstueck, 'id' | 'matrixCode'> & { nummer: string | null };

/**
 * So viele Zeichen des Matrixcodes bleiben stehen, bevor gekürzt wird. Die
 * Zahl ist an den echten Etiketten gewählt: Nach zehn Zeichen Seriennummer
 * (`BO00297362`) sind noch ein paar Zeichen Luft, ohne dass die Zeile in der
 * Liste umbricht.
 */
const MATRIX_KURZ = 14;

/**
 * Wie ein Teil im Fliesstext heisst – für Meldungen, Verlauf und Listen.
 *
 * Die Reihenfolge folgt dem, was jemand am Kleidungsstück ablesen kann: Die
 * aufgedruckte Nummer ist die Bezeichnung, die alle benutzen; erst wenn es
 * keine gibt, tritt der Matrixcode an ihre Stelle.
 *
 * Gekürzt wird **vorne**, nicht hinten: In den echten Codes
 * (`BO00297362TOTAL CARE21021892 / LION …`) steht die Seriennummer am Anfang,
 * dahinter folgen Pflegeprogramm, Hersteller und Charge. `BO00297362TOTA…`
 * lässt sich am Etikett wiederfinden, das Ende des Codes nicht – es sieht bei
 * einer ganzen Lieferung gleich aus.
 *
 * `Teil #<id>` ist nur das Netz für Altdaten aus der Zeit, als die Nummer
 * Pflicht war und trotzdem leer sein konnte. Nach der neuen Regel („Nummer
 * oder Matrixcode") kann ein Teil ohne beides gar nicht mehr entstehen.
 */
export function teilBezeichnung(teil: TeilKennung): string {
  if (teil.nummer) return teil.nummer;

  if (teil.matrixCode) {
    return teil.matrixCode.length > MATRIX_KURZ
      ? `${teil.matrixCode.slice(0, MATRIX_KURZ)}…`
      : teil.matrixCode;
  }

  return `Teil #${teil.id}`;
}

/**
 * Meldung, wenn ein Teil weder Nummer noch Matrixcode hätte. Sie steht hier
 * und nicht an der Prüfstelle, damit Formular, Import und Scan denselben Satz
 * zeigen – es ist dieselbe Regel, also soll sie auch gleich klingen.
 */
export const IDENT_HINWEIS =
  'Ein Teil braucht eine Nummer oder einen Matrixcode – ohne beides ist es nicht wiederzufinden.';

/**
 * Ob ein Teil überhaupt wiederauffindbar ist.
 *
 * Bisher war die Nummer Pflicht; künftig genügt eines von beidem, weil manche
 * Hersteller nur noch den Matrixcode aufbringen. Was nicht mehr genügt, ist
 * gar nichts: Ein Teil ohne jede Kennung liesse sich weder scannen noch am
 * Spind zuordnen – es wäre ein Datensatz ohne Kleidungsstück dahinter.
 *
 * Beide Parameter sind schon jetzt nullbar, obwohl `Kleidungsstueck.nummer`
 * noch `string` ist. Das ist Absicht: Diese Funktion ist das Fundament für den
 * späteren Typwechsel und soll dann nicht angefasst werden müssen.
 */
export function istIdentifizierbar(nummer: string | null, matrixCode: string | null): boolean {
  return Boolean(nummer) || Boolean(matrixCode);
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

/** Datum plus n Tage, als YYYY-MM-DD. */
export function plusTage(datum: string, tage: number): string {
  const [jahr, monat, tag] = datum.split('-').map(Number);
  return new Date(Date.UTC(jahr, monat - 1, tag + tage)).toISOString().slice(0, 10);
}

/** Nächster Prüftermin aus letzter Prüfung und Intervall. Null ohne Intervall. */
export function naechstePruefungAus(letztePruefung: string | null, typ: Teiletyp): string | null {
  if (!letztePruefung || typ.pruefIntervallMonate === null) return null;
  return plusMonate(letztePruefung, typ.pruefIntervallMonate);
}

/**
 * Prüfzustand eines Teils.
 *
 * `nie` ist der Grund, warum es diese Funktion überhaupt gibt: Ein Teil, für
 * dessen Typ ein Prüfintervall hinterlegt ist, das aber noch nie geprüft wurde,
 * hat kein `naechstePruefung` – und galt damit früher als unauffällig. Das ist
 * bei Schutzausrüstung die gefährlichste Auskunft von allen, weil sie
 * Entwarnung gibt, wo nie jemand hingesehen hat.
 */
export function pruefStatusVon(teil: Kleidungsstueck, typ: Teiletyp, heute: string): PruefStatus {
  if (teil.status === 'ausgesondert') return 'ok';
  // Ohne Intervall am Typ wird das Teil nicht wiederkehrend geprüft – Helme
  // und Stiefel einer Wehr, die das nicht hinterlegt hat, sollen nicht
  // dauerhaft rot leuchten.
  if (typ.pruefIntervallMonate === null) return 'ok';

  // Kein Termin trotz Intervall heisst: Es wurde nie eine Prüfung eingetragen.
  // `naechstePruefung` entsteht ausschliesslich aus `letztePruefung`.
  if (teil.naechstePruefung === null) return 'nie';

  if (teil.naechstePruefung <= heute) return 'faellig';
  if (teil.naechstePruefung <= plusTage(heute, PRUEF_VORWARN_TAGE)) return 'bald';
  return 'ok';
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
  const pruefStatus = pruefStatusVon(teil, ersatzTyp, nach.heute);
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
    if (pruefStatus === 'nie') {
      hinweise.push('Prüfung nie eingetragen');
    } else if (pruefStatus === 'faellig') {
      hinweise.push(`Prüfung fällig seit ${teil.naechstePruefung}`);
    } else if (pruefStatus === 'bald') {
      hinweise.push(`Prüfung fällig am ${teil.naechstePruefung}`);
    }
    if (teil.status === 'reparatur') hinweise.push('In Reparatur');
  }

  return {
    ...teil,
    bezeichnung: teilBezeichnung(teil),
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
    pruefStatus,
  };
}

/**
 * Reihenfolge der Liste Handlungsbedarf: erst was die Grenze gerissen hat,
 * dann fällige und nie eingetragene Prüfungen, dann alles mit Warnung.
 *
 * `nie` steht gleichauf mit `faellig`: Beides heisst, dass an dem Teil eine
 * Prüfung aussteht – im einen Fall seit einem bekannten Termin, im anderen
 * seit jeher.
 */
export function nachDringlichkeit(a: TeilMitDetails, b: TeilMitDetails): number {
  const rang = (t: TeilMitDetails): number => {
    if (t.ampel === 'grenze') return 0;
    if (t.pruefungFaellig || t.pruefStatus === 'nie') return 1;
    if (t.ampel === 'warnung') return 2;
    if (t.pruefStatus === 'bald') return 3;
    if (t.status === 'reparatur') return 4;
    return 5;
  };
  return rang(a) - rang(b) || a.bezeichnung.localeCompare(b.bezeichnung);
}

export function brauchtAufmerksamkeit(teil: TeilMitDetails): boolean {
  return teil.status !== 'ausgesondert' && teil.hinweise.length > 0;
}

// --- Nachweis ------------------------------------------------------------

export interface Stammdatenaenderung {
  feld: string;
  vorher: string;
  nachher: string;
}

/**
 * Felder, deren Änderung im Verlauf stehen muss.
 *
 * Standort und Notiz fehlen bewusst: Sie sagen nichts über den Zustand des
 * Teils aus und würden den Verlauf mit Umräumaktionen zumüllen.
 */
const NACHWEIS_FELDER = [
  { schluessel: 'nummer', text: 'Nummer' },
  { schluessel: 'matrixCode', text: 'Matrixcode' },
  { schluessel: 'groesse', text: 'Größe' },
  { schluessel: 'hersteller', text: 'Hersteller' },
  { schluessel: 'beschaffung', text: 'Beschaffung' },
  { schluessel: 'waschzaehler', text: 'Waschzähler' },
  { schluessel: 'letztePruefung', text: 'Letzte Prüfung' },
] as const;

const alsText = (wert: unknown): string =>
  wert === null || wert === undefined || wert === '' ? '–' : String(wert);

/**
 * Was sich an den nachweisrelevanten Stammdaten geändert hat.
 *
 * Der Waschzähler und das Prüfdatum liessen sich früher über den
 * Bearbeiten-Dialog spurlos überschreiben, während der eigene Endpunkt für den
 * Waschzähler dieselbe Änderung sorgfältig protokollierte. Damit stand hinter
 * jedem Nachweis ein Fragezeichen.
 */
export function stammdatenDiff(
  alt: Kleidungsstueck,
  neu: Kleidungsstueck,
  typName: (id: number) => string = String,
): Stammdatenaenderung[] {
  const aenderungen: Stammdatenaenderung[] = [];

  if (alt.typId !== neu.typId) {
    aenderungen.push({ feld: 'Teiletyp', vorher: typName(alt.typId), nachher: typName(neu.typId) });
  }

  for (const { schluessel, text } of NACHWEIS_FELDER) {
    if (alt[schluessel] !== neu[schluessel]) {
      aenderungen.push({ feld: text, vorher: alsText(alt[schluessel]), nachher: alsText(neu[schluessel]) });
    }
  }

  return aenderungen;
}

/** Einzeiler für den Verlauf: „Waschzähler 48 → 12, Größe 52 → 54". */
export function aenderungsText(aenderungen: Stammdatenaenderung[]): string {
  return aenderungen.map(a => `${a.feld} ${a.vorher} → ${a.nachher}`).join(', ');
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
