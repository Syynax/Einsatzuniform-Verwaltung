import axios from 'axios';
import type {
  AppConfig,
  AuthStatus,
  Auswertung,
  ChargeFormData,
  ChargeMitTeilen,
  ChargeStatus,
  ChargeZurueckAntwort,
  ImportErgebnis,
  KleidungExport,
  PersonFormData,
  PersonMitAusstattung,
  ScanEreignis,
  ScanErgebnis,
  ScanSitzung,
  ScanVorgang,
  ScanWarteErgebnis,
  TeilDetailAntwort,
  TeilFormData,
  TeilMitDetails,
  Teiletyp,
  TeiletypFormData,
  Uebersicht,
  VorgangMitNamen,
} from '../types/kleidung';

/**
 * Home Assistant liefert das Add-on über den Ingress unter
 * /api/hassio_ingress/<token>/ aus. Die API-Basis muss deshalb relativ zum
 * aktuellen Dokumentpfad gebildet werden – ein absolutes "/api" würde am
 * Home-Assistant-Core landen statt beim Add-on.
 */
function resolveApiBase(): string {
  const override = import.meta.env.VITE_API_URL;
  if (override) return override;

  const { pathname } = window.location;
  const dir = pathname.endsWith('/') ? pathname : pathname.replace(/[^/]*$/, '');
  return `${dir}api`;
}

const api = axios.create({
  baseURL: resolveApiBase(),
  headers: { 'Content-Type': 'application/json' },
});

// --- Sitzung ---
//
// Das Token liegt im localStorage statt in einem Cookie: unter dem Ingress
// wechselt der Pfad, ein Cookie-Path würde dadurch ins Leere laufen.

const TOKEN_KEY = 'einsatzkleidung.token';

/** Wird gefeuert, wenn das Backend 401 meldet – App zeigt dann die Anmeldemaske. */
export const ABGEMELDET_EVENT = 'einsatzkleidung:abgemeldet';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* privater Modus o.ä. – dann gilt die Anmeldung nur für diese Seite */
  }
}

api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Fehlermeldungen des Backends durchreichen statt "Request failed with status 400".
api.interceptors.response.use(
  response => response,
  error => {
    if (error?.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
      setToken(null);
      window.dispatchEvent(new CustomEvent(ABGEMELDET_EVENT));
    }
    const message = error?.response?.data?.error;
    if (typeof message === 'string' && message) {
      return Promise.reject(new Error(message));
    }
    return Promise.reject(error);
  },
);

// --- Rahmen ---

export const getConfig = async (signal?: AbortSignal): Promise<AppConfig> => {
  const response = await api.get<AppConfig>('/config', { signal });
  return response.data;
};

export const getAuthStatus = async (signal?: AbortSignal): Promise<AuthStatus> => {
  const response = await api.get<AuthStatus>('/auth/status', { signal });
  return response.data;
};

export const login = async (name: string, passwort: string): Promise<string> => {
  const response = await api.post<{ token: string; benutzer: string }>('/auth/login', { name, passwort });
  setToken(response.data.token);
  return response.data.benutzer;
};

export const logout = async (): Promise<void> => {
  try {
    await api.post('/auth/logout');
  } finally {
    setToken(null);
  }
};

export const exportDaten = async (): Promise<KleidungExport> => {
  const response = await api.get<KleidungExport>('/export');
  return response.data;
};

export const importDaten = async (daten: unknown): Promise<ImportErgebnis> => {
  const response = await api.post<ImportErgebnis>('/import', daten);
  return response.data;
};

// --- Übersicht & Auswertung ---

export const getUebersicht = async (signal?: AbortSignal): Promise<Uebersicht> => {
  const response = await api.get<Uebersicht>('/kleidung/uebersicht', { signal });
  return response.data;
};

export const getAuswertung = async (signal?: AbortSignal): Promise<Auswertung> => {
  const response = await api.get<Auswertung>('/kleidung/auswertung', { signal });
  return response.data;
};

export const getVorgaenge = async (limit = 100, signal?: AbortSignal): Promise<VorgangMitNamen[]> => {
  const response = await api.get<VorgangMitNamen[]>('/kleidung/vorgaenge', { params: { limit }, signal });
  return response.data;
};

// --- Teiletypen ---

export const getTypen = async (signal?: AbortSignal): Promise<Teiletyp[]> => {
  const response = await api.get<Teiletyp[]>('/kleidung/typen', { signal });
  return response.data;
};

export const createTyp = async (data: TeiletypFormData): Promise<Teiletyp> => {
  const response = await api.post<Teiletyp>('/kleidung/typen', data);
  return response.data;
};

export const updateTyp = async (id: number, data: TeiletypFormData): Promise<Teiletyp> => {
  const response = await api.put<Teiletyp>(`/kleidung/typen/${id}`, data);
  return response.data;
};

export const deleteTyp = async (id: number): Promise<void> => {
  await api.delete(`/kleidung/typen/${id}`);
};

// --- Personen ---

export const getPersonen = async (signal?: AbortSignal): Promise<PersonMitAusstattung[]> => {
  const response = await api.get<PersonMitAusstattung[]>('/kleidung/personen', { signal });
  return response.data;
};

export const createPerson = async (data: PersonFormData): Promise<PersonMitAusstattung> => {
  const response = await api.post<PersonMitAusstattung>('/kleidung/personen', data);
  return response.data;
};

export const updatePerson = async (id: number, data: PersonFormData): Promise<PersonMitAusstattung> => {
  const response = await api.put<PersonMitAusstattung>(`/kleidung/personen/${id}`, data);
  return response.data;
};

export const deletePerson = async (id: number): Promise<void> => {
  await api.delete(`/kleidung/personen/${id}`);
};

// --- Kleidungsstücke ---

export const getTeile = async (signal?: AbortSignal): Promise<TeilMitDetails[]> => {
  const response = await api.get<TeilMitDetails[]>('/kleidung/teile', { signal });
  return response.data;
};

export const getTeil = async (id: number, signal?: AbortSignal): Promise<TeilDetailAntwort> => {
  const response = await api.get<TeilDetailAntwort>(`/kleidung/teile/${id}`, { signal });
  return response.data;
};

export const createTeil = async (data: TeilFormData): Promise<TeilMitDetails> => {
  const response = await api.post<TeilMitDetails>('/kleidung/teile', data);
  return response.data;
};

export const updateTeil = async (id: number, data: TeilFormData): Promise<TeilMitDetails> => {
  const response = await api.put<TeilMitDetails>(`/kleidung/teile/${id}`, data);
  return response.data;
};

export const deleteTeil = async (id: number): Promise<void> => {
  await api.delete(`/kleidung/teile/${id}`);
};

export const setMatrixCode = async (id: number, code: string | null): Promise<TeilMitDetails> => {
  const response = await api.post<TeilMitDetails>(`/kleidung/teile/${id}/matrixcode`, { code });
  return response.data;
};

export const ausgeben = async (id: number, personId: number | null): Promise<TeilMitDetails> => {
  const response = await api.post<TeilMitDetails>(`/kleidung/teile/${id}/ausgabe`, { personId });
  return response.data;
};

export const meldeReparatur = async (id: number, detail: string, erledigt = false): Promise<TeilMitDetails> => {
  const response = await api.post<TeilMitDetails>(`/kleidung/teile/${id}/reparatur`, { detail, erledigt });
  return response.data;
};

export const eintragePruefung = async (id: number, datum: string, detail: string | null): Promise<TeilMitDetails> => {
  const response = await api.post<TeilMitDetails>(`/kleidung/teile/${id}/pruefung`, { datum, detail });
  return response.data;
};

export const aussondern = async (id: number, grund: string | null): Promise<TeilMitDetails> => {
  const response = await api.post<TeilMitDetails>(`/kleidung/teile/${id}/aussondern`, { grund });
  return response.data;
};

export const setzeWaschzaehler = async (id: number, wert: number, grund: string | null): Promise<TeilMitDetails> => {
  const response = await api.post<TeilMitDetails>(`/kleidung/teile/${id}/waschzaehler`, { wert, grund });
  return response.data;
};

// --- Wäsche-Chargen ---

export const getChargen = async (status?: ChargeStatus, signal?: AbortSignal): Promise<ChargeMitTeilen[]> => {
  const response = await api.get<ChargeMitTeilen[]>('/kleidung/chargen', {
    params: status ? { status } : undefined,
    signal,
  });
  return response.data;
};

export const createCharge = async (data: ChargeFormData): Promise<ChargeMitTeilen> => {
  const response = await api.post<ChargeMitTeilen>('/kleidung/chargen', data);
  return response.data;
};

export const updateCharge = async (id: number, data: ChargeFormData): Promise<ChargeMitTeilen> => {
  const response = await api.put<ChargeMitTeilen>(`/kleidung/chargen/${id}`, data);
  return response.data;
};

export const legeInCharge = async (id: number, teilId: number): Promise<ChargeMitTeilen> => {
  const response = await api.post<ChargeMitTeilen>(`/kleidung/chargen/${id}/teile`, { teilId });
  return response.data;
};

export const entferneAusCharge = async (id: number, teilId: number): Promise<ChargeMitTeilen> => {
  const response = await api.delete<ChargeMitTeilen>(`/kleidung/chargen/${id}/teile/${teilId}`);
  return response.data;
};

export const gebeChargeAb = async (id: number): Promise<ChargeMitTeilen> => {
  const response = await api.post<ChargeMitTeilen>(`/kleidung/chargen/${id}/abgeben`);
  return response.data;
};

export const meldeChargeZurueck = async (id: number): Promise<ChargeZurueckAntwort> => {
  const response = await api.post<ChargeZurueckAntwort>(`/kleidung/chargen/${id}/zurueck`);
  return response.data;
};

export const verwerfeCharge = async (id: number): Promise<void> => {
  await api.delete(`/kleidung/chargen/${id}`);
};

// --- Scannen ---

export const scanne = async (
  code: string,
  vorgang: ScanVorgang,
  ziel: { chargeId?: number | null; personId?: number | null } = {},
): Promise<ScanErgebnis> => {
  const response = await api.post<ScanErgebnis>('/kleidung/scan', {
    code,
    vorgang,
    chargeId: ziel.chargeId ?? null,
    personId: ziel.personId ?? null,
  });
  return response.data;
};

// --- Scan-Kopplung (Handy scannt, anderes Gerät bucht) ---

export const starteScanSitzung = async (): Promise<ScanSitzung> => {
  const response = await api.post<ScanSitzung>('/kleidung/scan-sitzung');
  return response.data;
};

export const tritteScanSitzungBei = async (koppelCode: string): Promise<{ id: string }> => {
  const response = await api.post<{ id: string }>('/kleidung/scan-sitzung/beitreten', { koppelCode });
  return response.data;
};

export const meldeScan = async (id: string, code: string): Promise<ScanEreignis> => {
  const response = await api.post<ScanEreignis>(`/kleidung/scan-sitzung/${id}/scan`, { code });
  return response.data;
};

/**
 * Long-Poll: Die Anfrage bleibt bis zu 25 Sekunden offen und kommt beim ersten
 * Scan sofort zurück. Deshalb hier bewusst kein Timeout – axios wartet.
 */
export const warteAufScans = async (id: string, seit: number, signal?: AbortSignal): Promise<ScanWarteErgebnis> => {
  const response = await api.get<ScanWarteErgebnis>(`/kleidung/scan-sitzung/${id}/warten`, {
    params: { seit },
    signal,
  });
  return response.data;
};

export const beendeScanSitzung = async (id: string): Promise<void> => {
  await api.delete(`/kleidung/scan-sitzung/${id}`);
};
