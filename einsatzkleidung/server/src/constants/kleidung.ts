import type { TeileKategorie, TeilStatus, VorgangTyp, WaescheAnlass, ChargeStatus, Teiletyp } from '../types/kleidung';

export const KATEGORIEN: TeileKategorie[] = ['einsatzkleidung', 'atemschutz', 'ausruestung'];
export const TEIL_STATI: TeilStatus[] = ['dienst', 'waesche', 'reparatur', 'ausgesondert'];
export const WAESCHE_ANLAESSE: WaescheAnlass[] = ['atemschutz', 'uebung', 'verschmutzung', 'turnus'];
export const CHARGE_STATI: ChargeStatus[] = ['erfasst', 'unterwegs', 'abgeschlossen'];
export const VORGANG_TYPEN: VorgangTyp[] = [
  'anlage', 'waesche', 'reparatur', 'pruefung', 'ausgabe', 'ruecknahme', 'aussonderung', 'korrektur',
];

/**
 * Startbestückung beim allerersten Start. Die Höchstzahlen sind die üblichen
 * Hausnummern – jede Wehr hat andere Herstellerangaben und ändert sie in der
 * Oberfläche.
 */
export const STANDARD_TYPEN: Omit<Teiletyp, 'id'>[] = [
  { name: 'Überjacke HuPF Teil 1', kategorie: 'einsatzkleidung', waschbar: true, waschgrenze: 50, warnschwelle: 40, pruefIntervallMonate: 12, aktiv: true },
  { name: 'Überhose HuPF Teil 4', kategorie: 'einsatzkleidung', waschbar: true, waschgrenze: 50, warnschwelle: 40, pruefIntervallMonate: 12, aktiv: true },
  { name: 'Flammschutzhaube', kategorie: 'atemschutz', waschbar: true, waschgrenze: 60, warnschwelle: 50, pruefIntervallMonate: null, aktiv: true },
  { name: 'Feuerwehrhandschuhe', kategorie: 'atemschutz', waschbar: true, waschgrenze: 40, warnschwelle: 32, pruefIntervallMonate: null, aktiv: true },
  { name: 'Feuerwehrhelm', kategorie: 'ausruestung', waschbar: false, waschgrenze: null, warnschwelle: null, pruefIntervallMonate: 12, aktiv: true },
  { name: 'Feuerwehrstiefel', kategorie: 'ausruestung', waschbar: false, waschgrenze: null, warnschwelle: null, pruefIntervallMonate: 12, aktiv: true },
];

/** Klartext für Meldungen und Listen. */
export const ANLASS_TEXT: Record<WaescheAnlass, string> = {
  atemschutz: 'Atemschutzeinsatz',
  uebung: 'Übung',
  verschmutzung: 'Verschmutzung',
  turnus: 'Turnus',
};

export const STATUS_TEXT: Record<TeilStatus, string> = {
  dienst: 'Im Dienst',
  waesche: 'In Wäsche',
  reparatur: 'Reparatur',
  ausgesondert: 'Ausgesondert',
};
