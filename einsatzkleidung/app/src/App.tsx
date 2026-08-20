import { useCallback, useEffect, useRef, useState } from 'react';
import { Kleidung } from './pages/Kleidung';
import { Login } from './components/Login';
import { useTheme } from './hooks/useTheme';
import {
  getConfig,
  getAuthStatus,
  logout,
  exportDaten,
  importDaten,
  ABGEMELDET_EVENT,
} from './services/api';
import type { AuthStatus } from './types/kleidung';

type Notice = { type: 'ok' | 'error'; message: string } | null;

function App() {
  const { toggleTheme, isDark } = useTheme();
  const [titel, setTitel] = useState('Einsatzkleidung');
  const [untertitel, setUntertitel] = useState('Persönliche Schutzausrüstung, Wäsche & Prüfung');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Nach einem Import muss die komplette Ansicht neu laden.
  const [reloadKey, setReloadKey] = useState(0);

  // null = Status noch nicht geladen; bis dahin wird nichts gerendert.
  const [auth, setAuth] = useState<AuthStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getConfig(controller.signal)
      .then(config => {
        if (config.titel) setTitel(config.titel);
        setUntertitel(config.untertitel ?? '');
        document.title = config.titel || 'Einsatzkleidung';
      })
      .catch(() => { /* Beschriftung ist optional – Defaults bleiben stehen. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getAuthStatus(controller.signal)
      .then(setAuth)
      .catch(() => {
        // Backend nicht erreichbar: lieber die Anmeldemaske als eine leere Seite.
        setAuth({ anmeldungNoetig: true, angemeldet: false, benutzer: null, warnung: null });
      });
    return () => controller.abort();
  }, []);

  // Läuft das Token ab, meldet der Interceptor das – dann zurück zur Anmeldung.
  useEffect(() => {
    const handler = () => {
      setAuth(vorher => (vorher ? { ...vorher, angemeldet: false, benutzer: null } : vorher));
      setNotice({ type: 'error', message: 'Die Sitzung ist abgelaufen. Bitte neu anmelden.' });
    };
    window.addEventListener(ABGEMELDET_EVENT, handler);
    return () => window.removeEventListener(ABGEMELDET_EVENT, handler);
  }, []);

  const handleAngemeldet = useCallback((benutzer: string) => {
    setAuth(vorher => ({
      anmeldungNoetig: true,
      angemeldet: true,
      benutzer,
      warnung: vorher?.warnung ?? null,
    }));
    setNotice(null);
    setReloadKey(key => key + 1);
  }, []);

  const handleAbmelden = async () => {
    await logout();
    setAuth(vorher => (vorher ? { ...vorher, angemeldet: false, benutzer: null } : vorher));
    setNotice(null);
  };

  const handleExport = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const daten = await exportDaten();
      const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `einsatzkleidung-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({ type: 'ok', message: 'Sicherung heruntergeladen.' });
    } catch (err) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Export fehlgeschlagen' });
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    if (!confirm(`"${file.name}" importieren?\n\nDer aktuelle Datenbestand wird ersetzt. Eine Sicherung der bisherigen Daten wird automatisch im Add-on abgelegt.`)) {
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const text = await file.text();
      const daten = JSON.parse(text);
      const result = await importDaten(daten);
      setNotice({
        type: 'ok',
        message: `${result.message}: ${result.teile} Kleidungsstücke, ${result.personen} Personen, ${result.vorgaenge} Vorgänge.`,
      });
      setReloadKey(key => key + 1);
    } catch (err) {
      const message = err instanceof SyntaxError
        ? 'Die Datei ist kein gültiges JSON.'
        : err instanceof Error ? err.message : 'Import fehlgeschlagen';
      setNotice({ type: 'error', message });
    } finally {
      setBusy(false);
    }
  };

  // Solange der Anmeldestatus unbekannt ist, nichts rendern – sonst blitzt die
  // Kleiderliste kurz auf, bevor die Anmeldemaske sie ersetzt.
  if (!auth) return null;

  if (auth.anmeldungNoetig && !auth.angemeldet) {
    return <Login titel={titel} untertitel={untertitel} onAngemeldet={handleAngemeldet} />;
  }

  return (
    <div className="appShell">
      <header className="appBar">
        <div className="appBarBrand">
          <i className="fas fa-shirt" aria-hidden="true"></i>
          <div style={{ minWidth: 0 }}>
            <div className="appBarTitle">{titel}</div>
            {untertitel && <div className="appBarSubtitle">{untertitel}</div>}
          </div>
        </div>

        <div className="appBarActions">
          <button className="appBarBtn" onClick={handleExport} disabled={busy} title="Daten als JSON sichern">
            <i className="fas fa-download" aria-hidden="true"></i>
            <span className="appBarBtnLabel">Sichern</span>
          </button>
          <button
            className="appBarBtn"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            title="einsatzkleidung.json importieren (ersetzt den Bestand)"
          >
            <i className="fas fa-upload" aria-hidden="true"></i>
            <span className="appBarBtnLabel">Import</span>
          </button>
          <button
            className="appBarBtn"
            onClick={toggleTheme}
            title={isDark ? 'Helles Design' : 'Dunkles Design'}
            aria-label={isDark ? 'Helles Design' : 'Dunkles Design'}
          >
            <i className={`fas ${isDark ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true"></i>
          </button>
          {auth.benutzer && (
            <button
              className="appBarBtn"
              onClick={handleAbmelden}
              title={`Angemeldet als ${auth.benutzer} – abmelden`}
            >
              <i className="fas fa-right-from-bracket" aria-hidden="true"></i>
              <span className="appBarBtnLabel">{auth.benutzer}</span>
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleImportFile(file);
          }}
        />
      </header>

      {auth.warnung && (
        <p className="appNotice appNoticeWarn">
          <i className="fas fa-triangle-exclamation" style={{ marginRight: '0.5rem' }}></i>
          {auth.warnung}
        </p>
      )}

      {notice && (
        <p className={`appNotice ${notice.type === 'ok' ? 'appNoticeOk' : 'appNoticeError'}`}>
          <i className={`fas ${notice.type === 'ok' ? 'fa-circle-check' : 'fa-circle-exclamation'}`} style={{ marginRight: '0.5rem' }}></i>
          {notice.message}
        </p>
      )}

      <main className="appContent">
        <Kleidung key={reloadKey} />
      </main>
    </div>
  );
}

export default App;
