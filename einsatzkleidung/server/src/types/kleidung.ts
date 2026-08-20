/**
 * Datenmodell der Einsatzkleidung.
 *
 * Alles liegt in einer JSON-Datei (/data/einsatzkleidung.json). Referenzen
 * laufen über numerische IDs, damit ein Umbenennen von Typen oder Personen
 * die Historie nicht zerreisst.
 */

/** Grobe Einordnung – bestimmt nur die Gruppierung in der Oberfläche. */
export type TeileKategorie = 'einsatzkleidung' | 'atemschutz' | 'ausruestung';

export interface Teiletyp {
  id: number;
  name: string;
  kategorie: TeileKategorie;
  /** Helme und Stiefel werden gereinigt, aber nicht gezählt. */
  waschbar: boolean;
  /** Höchstzahl an Wäschen laut Hersteller. Null = kein Limit hinterlegt. */
  waschgrenze: number | null;
  /** Ab diesem Zählerstand wird gewarnt. Null = 80 % der Höchstzahl. */
  warnschwelle: number | null;
  /** Abstand der wiederkehrenden Prüfung in Monaten. Null = keine Prüfung. */
  pruefIntervallMonate: number | null;
  aktiv: boolean;
}

export interface Person {
  id: number;
  name: string;
  /** Atemschutzgeräteträger – deren Kleidung geht nach jedem Einsatz in die Wäsche. */
  atemschutz: boolean;
  /** Ende der Atemschutztauglichkeit als YYYY-MM. */
  tauglichBis: string | null;
  aktiv: boolean;
  notiz: string | null;
}

export type TeilStatus = 'dienst' | 'waesche' | 'reparatur' | 'ausgesondert';

export interface Kleidungsstueck {
  id: number;
  /** Aufgedruckte Nummer im Format XXXX-XX/XX. Eindeutig. */
  nummer: string;
  /**
   * Roher Inhalt des Matrixcodes am Teil. Wird nicht ausgewertet – er dient
   * nur als zweiter Weg zur Zuordnung. Eindeutig, wenn gesetzt.
   */
  matrixCode: string | null;
  typId: number;
  groesse: string | null;
  hersteller: string | null;
  /** Beschaffung als YYYY-MM. */
  beschaffung: string | null;
  /** Null bedeutet: liegt im Pool. */
  personId: number | null;
  standort: string | null;
  status: TeilStatus;
  waschzaehler: number;
  letzteWaesche: string | null;
  letztePruefung: string | null;
  naechstePruefung: string | null;
  /** Gesetzt, solange das Teil in einer Charge steckt. */
  chargeId: number | null;
  notiz: string | null;
  angelegt: string;
}

export type WaescheAnlass = 'atemschutz' | 'uebung' | 'verschmutzung' | 'turnus';
export type ChargeStatus = 'erfasst' | 'unterwegs' | 'abgeschlossen';

export interface Charge {
  id: number;
  /** Sprechende Nummer für den Alltag, z.B. „W-25". */
  nummer: string;
  anlass: WaescheAnlass;
  /** Wo gewaschen wird – eigene Maschine oder Dienstleister. */
  ort: string;
  status: ChargeStatus;
  notiz: string | null;
  erstellt: string;
  abgegeben: string | null;
  zurueck: string | null;
  benutzer: string | null;
}

export type VorgangTyp =
  | 'anlage'
  | 'waesche'
  | 'reparatur'
  | 'pruefung'
  | 'ausgabe'
  | 'ruecknahme'
  | 'aussonderung'
  | 'korrektur';

export interface Vorgang {
  id: number;
  teilId: number;
  typ: VorgangTyp;
  zeit: string;
  detail: string | null;
  anlass: WaescheAnlass | null;
  zaehlerVorher: number | null;
  zaehlerNachher: number | null;
  personId: number | null;
  chargeId: number | null;
  benutzer: string | null;
}

export interface KleidungData {
  typen: Teiletyp[];
  personen: Person[];
  teile: Kleidungsstueck[];
  chargen: Charge[];
  vorgaenge: Vorgang[];
}

// --- Angereicherte Formen für die Oberfläche -----------------------------

/** Wie dringend das Teil Aufmerksamkeit braucht. */
export type Ampel = 'ok' | 'warnung' | 'grenze';

export interface TeilMitDetails extends Kleidungsstueck {
  typName: string;
  kategorie: TeileKategorie;
  waschbar: boolean;
  waschgrenze: number | null;
  /** Verbleibende Wäschen bis zur Höchstzahl. Null ohne Höchstzahl. */
  verbleibend: number | null;
  ampel: Ampel;
  personName: string | null;
  atemschutz: boolean;
  chargeNummer: string | null;
  /** Klartext, warum das Teil auffällt – leer, wenn alles in Ordnung ist. */
  hinweise: string[];
  pruefungFaellig: boolean;
}

export interface ChargeMitTeilen extends Charge {
  teile: TeilMitDetails[];
}

export interface Uebersicht {
  teileGesamt: number;
  inWaesche: number;
  waschgrenzeNah: number;
  pruefungFaellig: number;
  imPool: number;
  handlungsbedarf: TeilMitDetails[];
  offeneChargen: ChargeMitTeilen[];
  letzteVorgaenge: VorgangMitNamen[];
}

export interface VorgangMitNamen extends Vorgang {
  nummer: string;
  typName: string;
  personName: string | null;
  chargeNummer: string | null;
}

export interface PersonMitAusstattung extends Person {
  teile: TeilMitDetails[];
  inWaesche: number;
  /** Typen der Sollausstattung, zu denen kein Teil zugeordnet ist. */
  fehlend: string[];
  hinweise: string[];
}

export interface AuswertungMonat {
  monat: string;
  waeschen: number;
}

export interface Auswertung {
  waeschenProMonat: AuswertungMonat[];
  waeschenNachAnlass: { anlass: WaescheAnlass; anzahl: number }[];
  waeschenProTyp: { typName: string; waeschen: number; teile: number; schnitt: number }[];
  jahresWaeschen: number;
  ausgesondert: number;
}

/** Ergebnis eines Scans – dieselbe Form für Nummerncode und Matrixcode. */
export interface ScanErgebnis {
  status: 'ok' | 'unbekannt' | 'hinweis';
  meldung: string;
  codeArt: 'nummer' | 'matrix';
  code: string;
  teil: TeilMitDetails | null;
}
