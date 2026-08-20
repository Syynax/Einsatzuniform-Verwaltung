import { useCallback, useEffect, useState } from 'react';
import { getChargen, getPersonen, getTeile, getTypen, getUebersicht } from '../services/api';
import type { ChargeMitTeilen, PersonMitAusstattung, TeilMitDetails, Teiletyp, Uebersicht } from '../types/kleidung';

/**
 * Lädt den kompletten Bestand in einem Rutsch.
 *
 * Die Datenmenge einer Feuerwehr passt bequem in den Speicher (ein paar
 * hundert Teile), und fast jeder Tab braucht mehrere Listen gleichzeitig.
 * Nachladen je Tab würde die Oberfläche nur flackern lassen.
 */
export interface KleidungDaten {
  typen: Teiletyp[];
  personen: PersonMitAusstattung[];
  teile: TeilMitDetails[];
  chargen: ChargeMitTeilen[];
  uebersicht: Uebersicht | null;
  laden: boolean;
  fehler: string | null;
  /** Nach jeder Änderung aufrufen – lädt alles neu, ohne die Ansicht zu leeren. */
  neuLaden: () => Promise<void>;
}

export const useKleidung = (): KleidungDaten => {
  const [typen, setTypen] = useState<Teiletyp[]>([]);
  const [personen, setPersonen] = useState<PersonMitAusstattung[]>([]);
  const [teile, setTeile] = useState<TeilMitDetails[]>([]);
  const [chargen, setChargen] = useState<ChargeMitTeilen[]>([]);
  const [uebersicht, setUebersicht] = useState<Uebersicht | null>(null);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  const lade = useCallback(async (signal?: AbortSignal) => {
    try {
      const [neueTypen, neuePersonen, neueTeile, neueChargen, neueUebersicht] = await Promise.all([
        getTypen(signal),
        getPersonen(signal),
        getTeile(signal),
        getChargen(undefined, signal),
        getUebersicht(signal),
      ]);
      setTypen(neueTypen);
      setPersonen(neuePersonen);
      setTeile(neueTeile);
      setChargen(neueChargen);
      setUebersicht(neueUebersicht);
      setFehler(null);
    } catch (err) {
      // Ein abgebrochener Request ist kein Fehler – das passiert beim Abmelden
      // und beim Verlassen der Seite.
      if (signal?.aborted) return;
      setFehler(err instanceof Error ? err.message : 'Daten konnten nicht geladen werden.');
    } finally {
      if (!signal?.aborted) setLaden(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void lade(controller.signal);
    return () => controller.abort();
  }, [lade]);

  const neuLaden = useCallback(async () => {
    await lade();
  }, [lade]);

  return { typen, personen, teile, chargen, uebersicht, laden, fehler, neuLaden };
};
