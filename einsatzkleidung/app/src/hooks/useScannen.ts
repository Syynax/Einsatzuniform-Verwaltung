import { useCallback, useEffect, useRef, useState } from 'react';
import { scanne } from '../services/api';
import type { ScanCodeArt, ScanErgebnis, ScanVorgang } from '../types/kleidung';

/**
 * Der Scan-Vorgang lebt bewusst über dem Scan-Tab.
 *
 * Ein gekoppeltes Handy schickt Codes weiter, auch wenn am Rechner gerade die
 * Wäscheliste offen ist – die Einstellung „was passiert beim Scan" muss diesen
 * Tabwechsel deshalb überleben.
 */
export interface Scannen {
  vorgang: ScanVorgang;
  setVorgang: (vorgang: ScanVorgang) => void;
  /** Was vor der Kamera liegt – Nummerncode, Matrixcode oder raten lassen. */
  codeArt: ScanCodeArt;
  setCodeArt: (art: ScanCodeArt) => void;
  /** Ziel-Charge für „In die Wäsche". */
  chargeId: number | null;
  setChargeId: (id: number | null) => void;
  /** Empfänger für „Ausgabe". */
  personId: number | null;
  setPersonId: (id: number | null) => void;
  /** Die letzten Scans, neueste zuerst. */
  ergebnisse: ScanErgebnis[];
  /** Codes ohne zugeordnetes Teil – bleiben stehen, bis sie erledigt sind. */
  offeneCodes: ScanErgebnis[];
  /**
   * Codes, zu denen mehrere Teile passen. Gebucht ist noch nichts – sie
   * bleiben stehen, bis eines gewählt oder der Scan verworfen wurde.
   */
  offeneAuswahl: ScanErgebnis[];
  busy: boolean;
  verarbeite: (code: string) => Promise<void>;
  /** Buchung nachholen, nachdem aus mehreren Teilen eines gewählt wurde. */
  waehleTeil: (code: string, teilId: number) => Promise<void>;
  verwerfeOffenen: (code: string) => void;
  verwerfeAuswahl: (code: string) => void;
  leeren: () => void;
}

export const useScannen = (nachAenderung: () => Promise<void>): Scannen => {
  const [vorgang, setVorgang] = useState<ScanVorgang>('waesche');
  const [codeArt, setCodeArt] = useState<ScanCodeArt>('auto');
  const [chargeId, setChargeId] = useState<number | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [ergebnisse, setErgebnisse] = useState<ScanErgebnis[]>([]);
  const [offeneCodes, setOffeneCodes] = useState<ScanErgebnis[]>([]);
  const [offeneAuswahl, setOffeneAuswahl] = useState<ScanErgebnis[]>([]);
  const [busy, setBusy] = useState(false);

  // Der Scan kommt aus einem Callback, der beim Koppeln festgehalten wurde –
  // ohne Refs würde er mit veralteten Einstellungen buchen.
  const einstellungen = useRef({ vorgang, chargeId, personId, codeArt });
  useEffect(() => {
    einstellungen.current = { vorgang, chargeId, personId, codeArt };
  }, [vorgang, chargeId, personId, codeArt]);

  const nachAenderungRef = useRef(nachAenderung);
  useEffect(() => { nachAenderungRef.current = nachAenderung; });

  const verarbeite = useCallback(async (code: string) => {
    const roh = code.trim();
    if (!roh) return;

    const { vorgang: aktuellerVorgang, chargeId: ziel, personId: empfaenger, codeArt: art } = einstellungen.current;
    setBusy(true);
    try {
      const ergebnis = await scanne(roh, aktuellerVorgang, { chargeId: ziel, personId: empfaenger, codeArt: art });
      setErgebnisse(prev => [ergebnis, ...prev].slice(0, 25));

      if (ergebnis.status === 'unbekannt') {
        // Ein schnell scannendes Handy liefert mehrere unbekannte Codes
        // hintereinander – jeder einzelne soll zuordenbar bleiben.
        setOffeneCodes(prev => (prev.some(o => o.code === ergebnis.code) ? prev : [...prev, ergebnis]));
      } else if (ergebnis.status === 'mehrdeutig') {
        // Nichts gebucht: Der Code steht als Auswahl an, bis geklärt ist,
        // welches der gleichnamigen Teile gemeint war.
        setOffeneAuswahl(prev => (prev.some(o => o.code === ergebnis.code) ? prev : [...prev, ergebnis]));
      } else if (aktuellerVorgang !== 'lookup') {
        await nachAenderungRef.current();
      }
    } catch (err) {
      // Auch ein abgelehnter Scan gehört in die Liste – sonst bleibt beim
      // schnellen Scannen unbemerkt, dass ein Teil nicht gebucht wurde.
      const gescheitert: ScanErgebnis = {
        status: 'unbekannt',
        meldung: err instanceof Error ? err.message : 'Scan fehlgeschlagen.',
        codeArt: 'nummer',
        code: roh,
        teil: null,
        kandidaten: [],
      };
      setErgebnisse(prev => [gescheitert, ...prev].slice(0, 25));
    } finally {
      setBusy(false);
    }
  }, []);

  const waehleTeil = useCallback(async (code: string, teilId: number) => {
    const { vorgang: aktuellerVorgang, chargeId: ziel, personId: empfaenger, codeArt: art } = einstellungen.current;
    setBusy(true);
    try {
      const ergebnis = await scanne(code, aktuellerVorgang, {
        chargeId: ziel, personId: empfaenger, teilId, codeArt: art,
      });
      setErgebnisse(prev => [ergebnis, ...prev].slice(0, 25));
      // Erst nach der geglückten Buchung verschwindet die Auswahl – bleibt sie
      // stehen, kann derselbe Scan ohne erneutes Scannen wiederholt werden.
      setOffeneAuswahl(prev => prev.filter(o => o.code !== code));
      if (aktuellerVorgang !== 'lookup') await nachAenderungRef.current();
    } catch (err) {
      const gescheitert: ScanErgebnis = {
        status: 'unbekannt',
        meldung: err instanceof Error ? err.message : 'Buchung fehlgeschlagen.',
        codeArt: 'nummer',
        code,
        teil: null,
        kandidaten: [],
      };
      setErgebnisse(prev => [gescheitert, ...prev].slice(0, 25));
    } finally {
      setBusy(false);
    }
  }, []);

  const verwerfeOffenen = useCallback((code: string) => {
    setOffeneCodes(prev => prev.filter(o => o.code !== code));
  }, []);

  const verwerfeAuswahl = useCallback((code: string) => {
    setOffeneAuswahl(prev => prev.filter(o => o.code !== code));
  }, []);

  const leeren = useCallback(() => {
    setErgebnisse([]);
    setOffeneCodes([]);
    setOffeneAuswahl([]);
  }, []);

  return {
    vorgang,
    setVorgang,
    codeArt,
    setCodeArt,
    chargeId,
    setChargeId,
    personId,
    setPersonId,
    ergebnisse,
    offeneCodes,
    offeneAuswahl,
    busy,
    verarbeite,
    waehleTeil,
    verwerfeOffenen,
    verwerfeAuswahl,
    leeren,
  };
};
