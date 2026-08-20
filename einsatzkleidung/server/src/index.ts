import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import fs from 'fs/promises';
import path from 'path';
import kleidungRouter from './routes/kleidung';
import {
  withFileLock,
  loadJsonFile,
  saveJsonFile,
  DatenDefektError,
  laufendeSchreibvorgaenge,
  raeumeAbbruchReste,
} from './utils/fileStore';
import { starteSicherungsTakt, raeumeImportSicherungen, sicherungsOrdner } from './utils/sicherung';
import { STANDARD_TYPEN } from './constants/kleidung';
import type { KleidungData } from './types/kleidung';
import {
  DATA_FILE,
  PUBLIC_DIR,
  PORT,
  APP_TITEL,
  APP_UNTERTITEL,
  LOG_REQUESTS,
  ANMELDE_MODUS,
  BENUTZER,
  ANMELDUNG_WARNUNG,
  AUTOMATISCHE_SICHERUNG,
  SICHERUNGEN_BEHALTEN,
} from './config';
import {
  requireAuth,
  anmeldungNoetig,
  pruefeToken,
  pruefeAnmeldedaten,
  erzeugeToken,
  loginSperre,
  loginFehlgeschlagen,
  loginErfolgreich,
} from './auth';

const app = express();

// Hinter dem Home-Assistant-Ingress steckt ein Reverse-Proxy.
app.set('trust proxy', true);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'media-src': ["'self'", 'blob:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      // Ingress rendert das Add-on in einem iframe der Home-Assistant-Oberfläche
      // (gleiche Origin), 'self' reicht daher aus.
      'frame-ancestors': ["'self'"],
      // Add-on ist auch per http erreichbar – kein Zwangs-Upgrade.
      'upgrade-insecure-requests': null,
    },
  },
  // Kein HSTS: der Direktzugriff über den optionalen Port läuft über http.
  hsts: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(compression());
if (LOG_REQUESTS) {
  app.use(morgan('tiny'));
}
app.use(express.json({ limit: '8mb' }));

// --- Öffentliche Endpunkte (vor der Anmeldung erreichbar) ---

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (_req, res) => {
  res.json({ titel: APP_TITEL, untertitel: APP_UNTERTITEL });
});

app.get('/api/auth/status', (req, res) => {
  const noetig = anmeldungNoetig(req);
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  const benutzer = noetig ? pruefeToken(token) : null;

  res.json({
    anmeldungNoetig: noetig,
    angemeldet: !noetig || benutzer !== null,
    benutzer,
    warnung: ANMELDUNG_WARNUNG,
  });
});

app.post('/api/auth/login', (req, res) => {
  const sperre = loginSperre(req);
  if (sperre > 0) {
    const minuten = Math.ceil(sperre / 60);
    return res.status(429).json({
      error: `Zu viele Fehlversuche. Bitte in ${minuten} Minute${minuten === 1 ? '' : 'n'} erneut versuchen.`,
    });
  }

  const { name, passwort } = (req.body ?? {}) as { name?: unknown; passwort?: unknown };
  if (typeof name !== 'string' || typeof passwort !== 'string' || !name.trim() || !passwort) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind Pflicht.' });
  }

  const treffer = pruefeAnmeldedaten(name, passwort);
  if (!treffer) {
    loginFehlgeschlagen(req);
    return res.status(401).json({ error: 'Benutzername oder Passwort stimmt nicht.' });
  }

  loginErfolgreich(req);
  console.log(`Anmeldung: ${treffer}`);
  res.json({ token: erzeugeToken(treffer), benutzer: treffer });
});

// Die Sitzung steckt im Token selbst – Abmelden heisst, es zu verwerfen.
app.post('/api/auth/logout', (_req, res) => {
  res.json({ message: 'Abgemeldet' });
});

// --- Geschützte API ---

app.use('/api/kleidung', requireAuth, kleidungRouter);

const LISTEN = ['typen', 'personen', 'teile', 'chargen', 'vorgaenge'] as const;

/** Kompletter Datenbestand als JSON – für Sicherung und Umzug. */
app.get('/api/export', requireAuth, async (_req, res) => {
  try {
    const data = await loadJsonFile<Partial<KleidungData>>(DATA_FILE, {});
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="einsatzkleidung-${stamp}.json"`);
    res.json({
      typen: data.typen || [],
      personen: data.personen || [],
      teile: data.teile || [],
      chargen: data.chargen || [],
      vorgaenge: data.vorgaenge || [],
    });
  } catch (err) {
    console.error('Fehler beim Export:', err);
    res.status(500).json({ error: 'Serverfehler beim Export' });
  }
});

/**
 * Import einer einsatzkleidung.json. Überschreibt den kompletten Bestand;
 * vorher wird eine Sicherung neben der Datei abgelegt.
 */
app.post('/api/import', requireAuth, async (req, res) => {
  const payload = req.body as Partial<KleidungData> | undefined;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Ungültige Datei: Es wird ein JSON-Objekt erwartet.' });
  }

  for (const feld of LISTEN) {
    const wert = payload[feld];
    if (wert !== undefined && !Array.isArray(wert)) {
      return res.status(400).json({ error: `Ungültige Datei: "${feld}" muss eine Liste sein.` });
    }
  }

  if (LISTEN.every(feld => payload[feld] === undefined)) {
    return res.status(400).json({ error: 'Ungültige Datei: keine Kleidungsdaten gefunden.' });
  }

  const daten: KleidungData = {
    typen: payload.typen || [],
    personen: payload.personen || [],
    teile: payload.teile || [],
    chargen: payload.chargen || [],
    vorgaenge: payload.vorgaenge || [],
  };

  try {
    await withFileLock(DATA_FILE, async () => {
      const bisher = await loadJsonFile<Partial<KleidungData> | null>(DATA_FILE, null);
      if (bisher) {
        const backup = `${DATA_FILE}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        await saveJsonFile(backup, bisher);
      }
      await saveJsonFile(DATA_FILE, daten);
    });

    res.json({
      message: 'Import erfolgreich',
      teile: daten.teile.length,
      personen: daten.personen.length,
      vorgaenge: daten.vorgaenge.length,
    });
  } catch (err) {
    console.error('Fehler beim Import:', err);
    res.status(500).json({ error: 'Serverfehler beim Import' });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unbekannter Endpunkt' });
});

// --- Frontend ---

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

// Single-Page-App: alle übrigen Pfade auf die index.html.
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

/**
 * Beim Start einmal nachsehen, ob die Datendatei lesbar ist – und wie viel
 * drinsteht. Ist sie beschädigt, wird hier abgebrochen, bevor irgendetwas
 * geschrieben werden kann: eine kaputte Datei lässt sich reparieren, eine
 * überschriebene nicht.
 */
async function pruefeDatenbestand(): Promise<void> {
  try {
    const daten = await loadJsonFile<Partial<KleidungData> | null>(DATA_FILE, null);
    if (!daten) {
      console.log('📄 Noch keine Daten vorhanden – wird beim ersten Speichern angelegt.');
      return;
    }
    console.log(
      `📄 Datenbestand: ${daten.teile?.length ?? 0} Kleidungsstücke, ` +
      `${daten.personen?.length ?? 0} Personen, ${daten.typen?.length ?? 0} Teiletypen, ` +
      `${daten.chargen?.length ?? 0} Chargen, ${daten.vorgaenge?.length ?? 0} Vorgänge`,
    );
  } catch (err) {
    if (err instanceof DatenDefektError) {
      console.error('❌ Der Datenbestand ist beschädigt. Das Add-on startet bewusst NICHT,');
      console.error('   damit die Datei nicht überschrieben wird.');
      console.error(`   Datei:       ${err.datei}`);
      console.error(`   Grund:       ${err.ursache instanceof Error ? err.ursache.message : err.ursache}`);
      console.error(`   Sicherungen: ${sicherungsOrdner(DATA_FILE)}`);
      console.error('   Zum Wiederherstellen die jüngste Sicherung über die Datei kopieren und neu starten.');
    }
    throw err;
  }
}

/**
 * Ohne Teiletypen lässt sich kein einziges Kleidungsstück anlegen. Beim ersten
 * Start kommen deshalb die üblichen Typen mit – Höchstzahlen und Prüfintervalle
 * ändert man danach in der Oberfläche. Angelegt wird nur, solange noch gar
 * nichts da ist: wer alle Typen löscht, bekommt sie nicht beim Neustart zurück.
 */
async function legeStandardTypenAn(): Promise<void> {
  await withFileLock(DATA_FILE, async () => {
    const daten = await loadJsonFile<Partial<KleidungData> | null>(DATA_FILE, null);
    if (daten) return;

    const start: KleidungData = {
      typen: STANDARD_TYPEN.map((typ, index) => ({ ...typ, id: index + 1 })),
      personen: [],
      teile: [],
      chargen: [],
      vorgaenge: [],
    };
    await saveJsonFile(DATA_FILE, start);
    console.log(`🧰 ${start.typen.length} Teiletypen als Startbestückung angelegt.`);
  });
}

async function start() {
  // Datenverzeichnis sicherstellen (im Add-on ist das /data).
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });

  // Ein abgebrochener Schreibvorgang hinterlässt eine .tmp-Datei. Die echte
  // Datei ist dann unversehrt – die Nebendatei kann weg.
  if (await raeumeAbbruchReste(DATA_FILE)) {
    console.log('🧹 Reste eines abgebrochenen Schreibvorgangs entfernt.');
  }

  await pruefeDatenbestand();
  await legeStandardTypenAn();

  let stoppeSicherung: (() => void) | null = null;
  if (AUTOMATISCHE_SICHERUNG) {
    stoppeSicherung = starteSicherungsTakt(DATA_FILE, SICHERUNGEN_BEHALTEN);
    const geloescht = await raeumeImportSicherungen(DATA_FILE, SICHERUNGEN_BEHALTEN);
    if (geloescht > 0) console.log(`🧹 ${geloescht} alte Import-Sicherungen entfernt`);
  }

  if (ANMELDUNG_WARNUNG) {
    console.warn(`⚠️  ${ANMELDUNG_WARNUNG}`);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🧥 Einsatzkleidung läuft auf Port ${PORT}`);
    console.log(`📁 Daten: ${DATA_FILE}`);
    console.log(`🖥️  Frontend: ${PUBLIC_DIR}`);
    console.log(`🔐 Anmeldung: ${ANMELDE_MODUS} (${BENUTZER.length} Benutzer konfiguriert)`);
    console.log(`💾 Automatische Sicherung: ${AUTOMATISCHE_SICHERUNG ? `täglich, ${SICHERUNGEN_BEHALTEN} Stück` : 'aus'}`);
  });

  /**
   * Home Assistant stoppt das Add-on mit SIGTERM. Ohne Zutun würde der Prozess
   * sofort sterben – auch mitten in einer Buchung. Deshalb: keine neuen
   * Verbindungen mehr annehmen, laufende Schreibvorgänge zu Ende bringen, dann
   * erst beenden.
   */
  let faehrtHerunter = false;
  const herunterfahren = (signal: string) => {
    if (faehrtHerunter) return;
    faehrtHerunter = true;
    console.log(`⏹️  ${signal} empfangen – fahre herunter …`);

    stoppeSicherung?.();
    server.close(() => console.log('   Keine offenen Verbindungen mehr.'));

    const wartenBisFertig = (versuche = 0) => {
      const offen = laufendeSchreibvorgaenge();
      if (offen === 0) {
        console.log('   Alle Daten geschrieben. Tschüss.');
        process.exit(0);
      }
      if (versuche >= 100) {
        console.warn(`   ${offen} Schreibvorgang/-vorgänge hängen – beende trotzdem.`);
        process.exit(0);
      }
      console.log(`   Warte auf ${offen} Schreibvorgang/-vorgänge …`);
      setTimeout(() => wartenBisFertig(versuche + 1), 100);
    };
    wartenBisFertig();
  };

  process.on('SIGTERM', () => herunterfahren('SIGTERM'));
  process.on('SIGINT', () => herunterfahren('SIGINT'));
}

start().catch(err => {
  if (!(err instanceof DatenDefektError)) {
    console.error('Start fehlgeschlagen:', err);
  }
  process.exit(1);
});
