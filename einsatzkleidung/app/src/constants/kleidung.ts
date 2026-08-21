import type { Ampel, ChargeStatus, TeileKategorie, TeilStatus, VorgangTyp, WaescheAnlass } from '../types/kleidung';

/** Klartexte an einer Stelle – die Oberfläche zeigt nirgends die internen Kürzel. */

export const STATUS_TEXT: Record<TeilStatus, string> = {
  dienst: 'Im Dienst',
  waesche: 'In Wäsche',
  reparatur: 'Reparatur',
  ausgesondert: 'Ausgesondert',
};

export const ANLASS_TEXT: Record<WaescheAnlass, string> = {
  atemschutz: 'Atemschutzeinsatz',
  uebung: 'Übung',
  verschmutzung: 'Verschmutzung',
  turnus: 'Turnus',
};

export const KATEGORIE_TEXT: Record<TeileKategorie, string> = {
  einsatzkleidung: 'Einsatzkleidung',
  atemschutz: 'Atemschutz-Zubehör',
  ausruestung: 'Ausrüstung',
};

export const CHARGE_STATUS_TEXT: Record<ChargeStatus, string> = {
  erfasst: 'wird erfasst',
  unterwegs: 'unterwegs',
  abgeschlossen: 'abgeschlossen',
};

export const VORGANG_TEXT: Record<VorgangTyp, string> = {
  anlage: 'Angelegt',
  waesche: 'Wäsche',
  reparatur: 'Reparatur',
  pruefung: 'Prüfung',
  ausgabe: 'Ausgabe',
  ruecknahme: 'Rücknahme',
  aussonderung: 'Aussonderung',
  korrektur: 'Korrektur',
};

export const ANLAESSE: WaescheAnlass[] = ['atemschutz', 'uebung', 'verschmutzung', 'turnus'];
export const KATEGORIEN: TeileKategorie[] = ['einsatzkleidung', 'atemschutz', 'ausruestung'];
export const STATI: TeilStatus[] = ['dienst', 'waesche', 'reparatur', 'ausgesondert'];

/** Die Orte, die in fast jeder Wehr vorkommen – frei überschreibbar. */
export const WASCH_ORTE = ['Eigene Waschmaschine', 'Textilpflege / Dienstleister', 'Nachbarwehr'];

/** Symbol je Vorgang, damit die Historie auf einen Blick lesbar bleibt. */
export const VORGANG_ICON: Record<VorgangTyp, string> = {
  anlage: 'fa-plus',
  waesche: 'fa-soap',
  reparatur: 'fa-screwdriver-wrench',
  pruefung: 'fa-clipboard-check',
  ausgabe: 'fa-user-check',
  ruecknahme: 'fa-box-archive',
  aussonderung: 'fa-ban',
  korrektur: 'fa-pen',
};

/** Farbklasse zur Ampel – die Klassen selbst stehen im Modul-CSS. */
export const AMPEL_KLASSE: Record<Ampel, 'ok' | 'warn' | 'stop'> = {
  ok: 'ok',
  warnung: 'warn',
  grenze: 'stop',
};

/** JJJJ-MM-TT auf TT.MM.JJJJ. Leere Werte bleiben leer. */
export const datum = (wert: string | null): string => {
  if (!wert) return '–';
  const [jahr, monat, tag] = wert.slice(0, 10).split('-');
  return tag ? `${tag}.${monat}.${jahr}` : wert;
};

/** ISO-Zeitstempel auf TT.MM. HH:MM. */
export const zeitpunkt = (wert: string | null): string => {
  if (!wert) return '–';
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return wert;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}. `
    + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** JJJJ-MM auf MM/JJJJ – so steht es auf den Etiketten. */
export const monat = (wert: string | null): string => {
  if (!wert) return '–';
  const [jahr, m] = wert.split('-');
  return m ? `${m}/${jahr}` : wert;
};

// --- Nummerncode ---------------------------------------------------------

/**
 * Aufgedruckte Nummer: vier bis zehn Ziffern, Bindestrich, zwei Ziffern,
 * Schrägstrich, zwei Ziffern. Muss zum Muster im Server passen
 * (`server/src/domain/kleidung.ts`).
 */
export const NUMMER_MUSTER = /^\d{4,10}-\d{2}\/\d{2}$/;

/** Zum Anzeigen in Hinweisen und Platzhaltern. */
export const NUMMER_HINWEIS = 'XXXX-XX/XX, vorne bis zu zehn Ziffern';

/**
 * Setzt die Trenner selbst, damit niemand `-` und `/` tippen muss.
 *
 * Gerechnet wird nur mit den Ziffern; getippte Trenner werden verworfen und
 * neu gesetzt. Das muss so sein: Der Formatierer schreibt seinen eigenen
 * Bindestrich ins Feld und bekommt ihn beim nächsten Tastendruck zurück –
 * würde er dessen Stelle als Grenze nehmen, bliebe der vordere Block für
 * immer vierstellig und lange Nummern würden abgeschnitten.
 *
 * Die hinteren vier Ziffern sind immer `XX/XX`, alles davor ist der vordere
 * Block. Bis acht Ziffern ist der Block vierstellig, danach wächst er mit –
 * die Anzeige rutscht dabei einmal, steht am Ende aber richtig.
 */
export const formatiereNummer = (eingabe: string): string => {
  const ziffern = eingabe.replace(/[^0-9]/g, '').slice(0, 14);

  if (ziffern.length <= 4) return ziffern;
  if (ziffern.length <= 6) return `${ziffern.slice(0, 4)}-${ziffern.slice(4)}`;

  const vorne = Math.max(4, ziffern.length - 4);
  return `${ziffern.slice(0, vorne)}-${ziffern.slice(vorne, vorne + 2)}/${ziffern.slice(vorne + 2)}`;
};
