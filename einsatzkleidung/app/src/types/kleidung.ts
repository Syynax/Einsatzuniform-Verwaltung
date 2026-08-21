/**
 * Gegenstück zu den Servertypen (server/src/types/kleidung.ts). Bewusst als
 * eigene Datei statt eines gemeinsamen Pakets – zwei kleine Projekte, ein
 * Build-Schritt weniger.
 */

export type TeileKategorie = 'einsatzkleidung' | 'atemschutz' | 'ausruestung';
export type TeilStatus = 'dienst' | 'waesche' | 'reparatur' | 'ausgesondert';
export type WaescheAnlass = 'atemschutz' | 'uebung' | 'verschmutzung' | 'turnus';
export type ChargeStatus = 'erfasst' | 'unterwegs' | 'abgeschlossen';
export type Ampel = 'ok' | 'warnung' | 'grenze';

/** Prüfzustand. `nie`: Intervall am Typ hinterlegt, aber nie eine Prüfung eingetragen. */
export type PruefStatus = 'ok' | 'bald' | 'faellig' | 'nie';

export type VorgangTyp =
  | 'anlage'
  | 'waesche'
  | 'reparatur'
  | 'pruefung'
  | 'ausgabe'
  | 'ruecknahme'
  | 'aussonderung'
  | 'korrektur';

export interface Teiletyp {
  id: number;
  name: string;
  kategorie: TeileKategorie;
  waschbar: boolean;
  waschgrenze: number | null;
  warnschwelle: number | null;
  pruefIntervallMonate: number | null;
  aktiv: boolean;
  /** Wie viele Teile diesen Typ nutzen – nur lesend vom Server. */
  anzahlTeile?: number;
}

export interface TeiletypFormData {
  name: string;
  kategorie: TeileKategorie;
  waschbar: boolean;
  waschgrenze: number | null;
  warnschwelle: number | null;
  pruefIntervallMonate: number | null;
}

export interface Person {
  id: number;
  name: string;
  atemschutz: boolean;
  tauglichBis: string | null;
  aktiv: boolean;
  notiz: string | null;
}

export interface PersonFormData {
  name: string;
  atemschutz: boolean;
  tauglichBis: string | null;
  notiz: string | null;
}

export interface Kleidungsstueck {
  id: number;
  nummer: string;
  matrixCode: string | null;
  typId: number;
  groesse: string | null;
  hersteller: string | null;
  beschaffung: string | null;
  personId: number | null;
  standort: string | null;
  status: TeilStatus;
  waschzaehler: number;
  letzteWaesche: string | null;
  letztePruefung: string | null;
  naechstePruefung: string | null;
  chargeId: number | null;
  notiz: string | null;
  angelegt: string;
}

export interface TeilMitDetails extends Kleidungsstueck {
  typName: string;
  kategorie: TeileKategorie;
  waschbar: boolean;
  waschgrenze: number | null;
  verbleibend: number | null;
  ampel: Ampel;
  personName: string | null;
  atemschutz: boolean;
  chargeNummer: string | null;
  hinweise: string[];
  pruefungFaellig: boolean;
  pruefStatus: PruefStatus;
}

export interface TeilFormData {
  nummer: string;
  matrixCode: string | null;
  typId: number;
  groesse: string | null;
  hersteller: string | null;
  beschaffung: string | null;
  personId: number | null;
  standort: string | null;
  waschzaehler: number;
  letztePruefung: string | null;
  notiz: string | null;
}

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
  personName?: string | null;
  chargeNummer?: string | null;
}

export interface VorgangMitNamen extends Vorgang {
  nummer: string;
  typName: string;
  personName: string | null;
  chargeNummer: string | null;
}

export interface Charge {
  id: number;
  nummer: string;
  anlass: WaescheAnlass;
  ort: string;
  status: ChargeStatus;
  notiz: string | null;
  erstellt: string;
  abgegeben: string | null;
  zurueck: string | null;
  benutzer: string | null;
}

export interface ChargeMitTeilen extends Charge {
  teile: TeilMitDetails[];
}

export interface ChargeFormData {
  anlass: WaescheAnlass;
  ort: string;
  notiz: string | null;
}

export interface PersonMitAusstattung extends Person {
  teile: TeilMitDetails[];
  inWaesche: number;
  fehlend: string[];
  hinweise: string[];
}

export interface Uebersicht {
  teileGesamt: number;
  inWaesche: number;
  waschgrenzeNah: number;
  pruefungFaellig: number;
  pruefungBald: number;
  pruefungNie: number;
  imPool: number;
  handlungsbedarf: TeilMitDetails[];
  handlungsbedarfGesamt: number;
  offeneChargen: ChargeMitTeilen[];
  letzteVorgaenge: VorgangMitNamen[];
}

export interface Auswertung {
  waeschenProMonat: { monat: string; waeschen: number }[];
  waeschenNachAnlass: { anlass: WaescheAnlass; anzahl: number }[];
  waeschenProTyp: { typName: string; waeschen: number; teile: number; schnitt: number }[];
  jahresWaeschen: number;
  ausgesondert: number;
}

/** Was der Scan auslösen soll – wird vor dem Scannen gewählt. */
export type ScanVorgang = 'waesche' | 'zurueck' | 'ausgabe' | 'ruecknahme' | 'lookup';

export interface ScanErgebnis {
  status: 'ok' | 'unbekannt' | 'hinweis' | 'mehrdeutig';
  meldung: string;
  codeArt: 'nummer' | 'matrix';
  code: string;
  teil: TeilMitDetails | null;
  /**
   * Bei `mehrdeutig` alle Teile mit dieser Nummer – gebucht wurde noch nichts.
   * Die Wahl kommt als `teilId` zurück. Sonst leer.
   */
  kandidaten: TeilMitDetails[];
}

export interface TeilDetailAntwort {
  teil: TeilMitDetails;
  vorgaenge: Vorgang[];
}

export interface ChargeZurueckAntwort {
  charge: ChargeMitTeilen;
  gezaehlt: number;
  /** Wie viele Teile noch in der Charge liegen. Über 0 heisst: Charge bleibt offen. */
  verbleibend: number;
  ueberGrenze: string[];
}

// --- Rahmen (Anmeldung, Kopplung, Sicherung) ---

export interface AppConfig {
  titel: string;
  untertitel: string;
}

export interface AuthStatus {
  anmeldungNoetig: boolean;
  angemeldet: boolean;
  benutzer: string | null;
  warnung: string | null;
}

export interface ScanSitzung {
  id: string;
  koppelCode: string;
}

export interface ScanEreignis {
  id: number;
  code: string;
  zeit: string;
}

export interface ScanWarteErgebnis {
  aktiv: boolean;
  gekoppelt: boolean;
  letzteId: number;
  ereignisse: ScanEreignis[];
}

export interface KleidungExport {
  typen: Teiletyp[];
  personen: Person[];
  teile: Kleidungsstueck[];
  chargen: Charge[];
  vorgaenge: Vorgang[];
}

export interface ImportErgebnis {
  message: string;
  teile: number;
  personen: number;
  vorgaenge: number;
}

// --- Personenimport aus CSV ---

export type PersonImportModus = 'ueberspringen' | 'aktualisieren';

export type PersonImportBefund = 'neu' | 'aktualisiert' | 'unveraendert' | 'uebersprungen' | 'fehler';

/** Nur die Felder, die die Datei mitbringt. */
export interface PersonImportWerte {
  name: string;
  atemschutz?: boolean;
  tauglichBis?: string | null;
  aktiv?: boolean;
  notiz?: string | null;
}

export interface PersonImportZeile {
  zeile: number;
  name: string;
  befund: PersonImportBefund;
  meldung: string | null;
  personId: number | null;
  werte: PersonImportWerte | null;
}

export interface PersonImportBericht {
  problem: string | null;
  trenner: string;
  spalten: string[];
  /** Feld der Person -> Spaltenname aus der Datei. */
  zuordnung: Record<string, string>;
  zeilen: PersonImportZeile[];
  neu: number;
  aktualisiert: number;
  unveraendert: number;
  uebersprungen: number;
  fehler: number;
  /** Falsch, solange nur geprüft wurde. */
  uebernommen: boolean;
}

// --- Teileimport aus CSV ---

export type TeileImportModus = 'ueberspringen' | 'aktualisieren';

export type TeilImportBefund = 'neu' | 'aktualisiert' | 'unveraendert' | 'uebersprungen' | 'fehler';

/** Nur die Felder, die die Datei mitbringt. */
export interface TeilImportWerte {
  nummer: string;
  typId: number;
  matrixCode?: string | null;
  groesse?: string | null;
  hersteller?: string | null;
  beschaffung?: string | null;
  personId?: number | null;
  standort?: string | null;
  waschzaehler?: number;
  letztePruefung?: string | null;
  letzteWaesche?: string | null;
  notiz?: string | null;
}

export interface TeilImportZeile {
  zeile: number;
  nummer: string;
  typName: string | null;
  personName: string | null;
  befund: TeilImportBefund;
  meldung: string | null;
  teilId: number | null;
  werte: TeilImportWerte | null;
}

export interface TeileImportBericht {
  problem: string | null;
  trenner: string;
  spalten: string[];
  zuordnung: Record<string, string>;
  zeilen: TeilImportZeile[];
  neu: number;
  aktualisiert: number;
  unveraendert: number;
  uebersprungen: number;
  fehler: number;
  uebernommen: boolean;
}
