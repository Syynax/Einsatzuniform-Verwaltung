import { useCallback, useEffect, useRef, useState } from 'react';
import { scanne } from '../services/api';
import type { ScanErgebnis, ScanVorgang } from '../types/kleidung';

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
  busy: boolean;
  verarbeite: (code: string) => Promise<void>;
  verwerfeOffenen: (code: string) => void;
  leeren: () => void;
}

export const useScannen = (nachAenderung: () => Promise<void>): Scannen => {
  const [vorgang, setVorgang] = useState<ScanVorgang>('waesche');
  const [chargeId, setChargeId] = useState<number | null>(null);
  const [personId, setPersonId] = useState<number | null>(null);
  const [ergebnisse, setErgebnisse] = useState<ScanErgebnis[]>([]);
  const [offeneCodes, setOffeneCodes] = useState<ScanErgebnis[]>([]);
  const [busy, setBusy] = useState(false);

  // Der Scan kommt aus einem Callback, der beim Koppeln festgehalten wurde –
  // ohne Refs würde er mit veralteten Einstellungen buchen.
  const einstellungen = useRef({ vorgang, chargeId, personId });
  useEffect(() => { einstellungen.current = { vorgang, chargeId, personId }; }, [vorgang, chargeId, personId]);

  const nachAenderungRef = useRef(nachAenderung);
  useEffect(() => { nachAenderungRef.current = nachAenderung; });

  const verarbeite = useCallback(async (code: string) => {
    const roh = code.trim();
    if (!roh) return;

    const { vorgang: aktuellerVorgang, chargeId: ziel, personId: empfaenger } = einstellungen.current;
    setBusy(true);
    try {
      const ergebnis = await scanne(roh, aktuellerVorgang, { chargeId: ziel, personId: empfaenger });
      setErgebnisse(prev => [ergebnis, ...prev].slice(0, 25));

      if (ergebnis.status === 'unbekannt') {
        // Ein schnell scannendes Handy liefert mehrere unbekannte Codes
        // hintereinander – jeder einzelne soll zuordenbar bleiben.
        setOffeneCodes(prev => (prev.some(o => o.code === ergebnis.code) ? prev : [...prev, ergebnis]));
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
      };
      setErgebnisse(prev => [gescheitert, ...prev].slice(0, 25));
    } finally {
      setBusy(false);
    }
  }, []);

  const verwerfeOffenen = useCallback((code: string) => {
    setOffeneCodes(prev => prev.filter(o => o.code !== code));
  }, []);

  const leeren = useCallback(() => {
    setErgebnisse([]);
    setOffeneCodes([]);
  }, []);

  return {
    vorgang,
    setVorgang,
    chargeId,
    setChargeId,
    personId,
    setPersonId,
    ergebnisse,
    offeneCodes,
    busy,
    verarbeite,
    verwerfeOffenen,
    leeren,
  };
};
