import { useEffect, useRef, useState } from 'react';
import type { ChargeMitTeilen, PersonMitAusstattung, ScanVorgang, TeilMitDetails } from '../../../types/kleidung';
import type { ScanKopplung } from '../../../hooks/useScanKopplung';
import type { Scannen } from '../../../hooks/useScannen';
import { setMatrixCode, tritteScanSitzungBei, meldeScan } from '../../../services/api';
import { ANLASS_TEXT, zeitpunkt } from '../../../constants/kleidung';
import styles from '../Kleidung.module.css';

/**
 * `direkt`    – dieses Gerät scannt und bucht
 * `empfangen` – dieses Gerät bucht, gescannt wird auf einem gekoppelten Handy
 * `senden`    – dieses Gerät ist nur Scanner für ein gekoppeltes Gerät
 */
type ScanModus = 'direkt' | 'empfangen' | 'senden';

const MODI: { id: ScanModus; label: string; icon: string }[] = [
  { id: 'direkt', label: 'Hier scannen', icon: 'fa-barcode' },
  { id: 'empfangen', label: 'Handy koppeln', icon: 'fa-laptop' },
  { id: 'senden', label: 'Als Scanner', icon: 'fa-mobile-screen-button' },
];

const VORGAENGE: { id: ScanVorgang; label: string }[] = [
  { id: 'waesche', label: 'In die Wäsche' },
  { id: 'zurueck', label: 'Wäsche zurück' },
  { id: 'ausgabe', label: 'Ausgabe an Person' },
  { id: 'ruecknahme', label: 'Rückgabe in den Pool' },
  { id: 'lookup', label: 'Nur nachschlagen' },
];

/** Damit ein Reload am Handy nicht die Verbindung kostet. */
const SENDER_SCHLUESSEL = 'einsatzkleidung.scanSender';

const ladeSender = (): string | null => {
  try {
    return sessionStorage.getItem(SENDER_SCHLUESSEL);
  } catch {
    return null;
  }
};

const merkeSender = (id: string | null): void => {
  try {
    if (id) sessionStorage.setItem(SENDER_SCHLUESSEL, id);
    else sessionStorage.removeItem(SENDER_SCHLUESSEL);
  } catch {
    /* privater Modus o.ä. */
  }
};

// Minimale Typen für die native BarcodeDetector-API (noch nicht in lib.dom).
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
interface BarcodeDetectorCtor { new (options?: { formats?: string[] }): BarcodeDetectorLike }

const getDetectorCtor = (): BarcodeDetectorCtor | undefined =>
  (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

/** Tippen soll ohne Sonderzeichen gehen: aus Ziffern wird XXXX-XX/XX. */
const formatiereNummer = (eingabe: string): string => {
  const ziffern = eingabe.replace(/[^0-9]/g, '').slice(0, 8);
  if (ziffern.length <= 4) return ziffern;
  if (ziffern.length <= 6) return `${ziffern.slice(0, 4)}-${ziffern.slice(4)}`;
  return `${ziffern.slice(0, 4)}-${ziffern.slice(4, 6)}/${ziffern.slice(6)}`;
};

interface Props {
  chargen: ChargeMitTeilen[];
  personen: PersonMitAusstattung[];
  teile: TeilMitDetails[];
  kopplung: ScanKopplung;
  scannen: Scannen;
  onAenderung: () => Promise<void>;
  onTeil: (id: number) => void;
  onNeueCharge: () => void;
  /** Unbekannte Nummer direkt anlegen – Nummer wird im Formular vorbelegt. */
  onNeuesTeil: (nummer: string) => void;
}

export const ScanTab: React.FC<Props> = ({
  chargen,
  personen,
  teile,
  kopplung,
  scannen,
  onAenderung,
  onTeil,
  onNeueCharge,
  onNeuesTeil,
}) => {
  const supported = typeof getDetectorCtor() === 'function';
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef<{ code: string; t: number }>({ code: '', t: 0 });
  const [scanning, setScanning] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [handEingabe, setHandEingabe] = useState('');
  /** Zuordnung je offenem Code – eine Auswahl pro Zeile. */
  const [zuordnung, setZuordnung] = useState<Record<string, number | ''>>({});

  const [modus, setModus] = useState<ScanModus>(() => {
    if (ladeSender()) return 'senden';
    return kopplung.sitzung ? 'empfangen' : 'direkt';
  });

  // Sender-Seite (Handy)
  const [koppelEingabe, setKoppelEingabe] = useState('');
  const [sendeSitzungId, setSendeSitzungId] = useState<string | null>(() => ladeSender());
  const [gesendet, setGesendet] = useState<{ code: string; fehler: boolean }[]>([]);
  const [koppelFehler, setKoppelFehler] = useState<string | null>(null);

  const offeneChargen = chargen.filter(c => c.status === 'erfasst');
  const zielCharge = offeneChargen.find(c => c.id === scannen.chargeId) ?? null;

  // Ohne gewählte Charge landet der erste Scan im Nichts – deshalb die erste
  // offene Charge vorbelegen, sobald es eine gibt.
  useEffect(() => {
    if (scannen.vorgang !== 'waesche') return;
    if (zielCharge || offeneChargen.length === 0) return;
    scannen.setChargeId(offeneChargen[0].id);
  }, [scannen, zielCharge, offeneChargen]);

  const stop = () => {
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // Kamera beim Verlassen der Ansicht freigeben.
  useEffect(() => () => stop(), []);
  // Beim Moduswechsel ebenfalls – sonst leuchtet sie im Hintergrund weiter.
  useEffect(() => { stop(); }, [modus]);

  // --- Sender: Codes ans gekoppelte Gerät schicken ---

  const verbinden = async () => {
    const code = koppelEingabe.trim();
    if (!/^\d{6}$/.test(code)) {
      setKoppelFehler('Bitte den sechsstelligen Code vom anderen Gerät eingeben.');
      return;
    }
    try {
      const { id } = await tritteScanSitzungBei(code);
      merkeSender(id);
      setSendeSitzungId(id);
      setKoppelFehler(null);
      setGesendet([]);
    } catch (err) {
      setKoppelFehler(err instanceof Error ? err.message : 'Kopplung fehlgeschlagen.');
    }
  };

  const trennen = () => {
    stop();
    merkeSender(null);
    setSendeSitzungId(null);
    setKoppelEingabe('');
    setKoppelFehler(null);
    setGesendet([]);
  };

  const sendeCode = async (code: string) => {
    if (!sendeSitzungId) return;
    try {
      await meldeScan(sendeSitzungId, code);
      // Kurzes Rütteln als Rückmeldung – man schaut beim Scannen nicht aufs Display.
      navigator.vibrate?.(60);
      setKoppelFehler(null);
      setGesendet(prev => [{ code, fehler: false }, ...prev].slice(0, 10));
    } catch (err) {
      setGesendet(prev => [{ code, fehler: true }, ...prev].slice(0, 10));
      setKoppelFehler(err instanceof Error ? err.message : 'Code konnte nicht gesendet werden.');
    }
  };

  // --- Gemeinsamer Einstieg für Kamera und Tippen ---

  const verarbeiteCode = (code: string) => {
    const c = code.trim();
    if (!c) return;
    if (modus === 'senden') {
      void sendeCode(c);
      return;
    }
    // Über die Warteschlange der Kopplung, damit lokale und empfangene Codes
    // in derselben Reihenfolge gebucht werden.
    kopplung.verarbeite(c);
  };

  const verarbeiteRef = useRef(verarbeiteCode);
  useEffect(() => { verarbeiteRef.current = verarbeiteCode; });

  const start = async () => {
    const Ctor = getDetectorCtor();
    if (!Ctor) return;
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      // Data Matrix ist das Format am Etikett; die übrigen sind mitgenommen,
      // damit auch aufgeklebte Barcodes funktionieren.
      const detector = new Ctor({
        formats: ['data_matrix', 'qr_code', 'code_128', 'code_39', 'ean_13'],
      });
      const tick = async () => {
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              const now = Date.now();
              // Gleichen Code nicht mehrfach in 2,5 s feuern (Doppelbuchung vermeiden).
              if (value !== lastRef.current.code || now - lastRef.current.t > 2500) {
                lastRef.current = { code: value, t: now };
                verarbeiteRef.current(value);
              }
            }
          } catch { /* einzelne Frames ignorieren */ }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setCamError('Kamera nicht verfügbar oder Zugriff abgelehnt.');
      stop();
    }
  };

  const uebernehmen = () => {
    const wert = handEingabe.trim();
    if (!wert) return;
    verarbeiteCode(wert);
    setHandEingabe('');
  };

  const ordneZu = async (code: string) => {
    const teilId = zuordnung[code];
    if (typeof teilId !== 'number') return;
    try {
      await setMatrixCode(teilId, code);
      scannen.verwerfeOffenen(code);
      setZuordnung(prev => {
        const rest = { ...prev };
        delete rest[code];
        return rest;
      });
      await onAenderung();
    } catch (err) {
      setKoppelFehler(err instanceof Error ? err.message : 'Zuordnung fehlgeschlagen.');
    }
  };

  const letztes = scannen.ergebnisse[0] ?? null;
  const zielFehlt = (scannen.vorgang === 'waesche' && !zielCharge)
    || (scannen.vorgang === 'ausgabe' && scannen.personId === null);

  return (
    <>
      <div className={styles.scanKopf}>
        {MODI.map(eintrag => (
          <button
            key={eintrag.id}
            className={`${styles.chip} ${modus === eintrag.id ? styles.chipAktiv : ''}`}
            onClick={() => setModus(eintrag.id)}
            type="button"
          >
            <i className={`fas ${eintrag.icon}`} aria-hidden="true"></i> {eintrag.label}
          </button>
        ))}
      </div>

      {modus !== 'senden' && (
        <div className={styles.scanZiel}>
          <span className={styles.label} style={{ marginRight: '0.25rem' }}>Was passiert beim Scan</span>
          {VORGAENGE.map(eintrag => (
            <button
              key={eintrag.id}
              className={`${styles.chip} ${scannen.vorgang === eintrag.id ? styles.chipAktiv : ''}`}
              onClick={() => scannen.setVorgang(eintrag.id)}
              type="button"
            >
              {eintrag.label}
            </button>
          ))}

          {scannen.vorgang === 'waesche' && (
            offeneChargen.length === 0 ? (
              <button className={styles.btnSecondary} onClick={onNeueCharge} type="button">
                <i className="fas fa-plus" aria-hidden="true"></i> Charge anlegen
              </button>
            ) : (
              <select
                className={styles.suche}
                value={scannen.chargeId ?? ''}
                onChange={e => scannen.setChargeId(e.target.value ? Number(e.target.value) : null)}
                aria-label="Ziel-Charge"
              >
                {offeneChargen.map(charge => (
                  <option key={charge.id} value={charge.id}>
                    {charge.nummer} · {ANLASS_TEXT[charge.anlass]} ({charge.teile.length})
                  </option>
                ))}
              </select>
            )
          )}

          {scannen.vorgang === 'ausgabe' && (
            <select
              className={styles.suche}
              value={scannen.personId ?? ''}
              onChange={e => scannen.setPersonId(e.target.value ? Number(e.target.value) : null)}
              aria-label="Empfänger"
            >
              <option value="">Person wählen …</option>
              {personen.map(person => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {modus === 'empfangen' && (
        <div className={styles.koppelBox}>
          {kopplung.fehler && <div className={styles.fehlerText}>{kopplung.fehler}</div>}

          {!kopplung.sitzung ? (
            <>
              <p className={styles.soft} style={{ margin: 0 }}>
                Ein Handy scannt, gebucht wird hier. Praktisch, wenn dieses Gerät keine Kamera hat.
              </p>
              <button className={styles.btnPrimary} onClick={kopplung.starten} type="button">
                <i className="fas fa-link" aria-hidden="true"></i> Kopplung starten
              </button>
            </>
          ) : (
            <>
              <div className={styles.koppelCode}>
                <span className={styles.label}>Code am Handy eingeben</span>
                <strong>{kopplung.sitzung.koppelCode}</strong>
              </div>
              <div className={styles.soft}>
                <i
                  className={`fas ${kopplung.gekoppelt ? 'fa-circle-check' : 'fa-spinner fa-spin'}`}
                  aria-hidden="true"
                ></i>{' '}
                {kopplung.gekoppelt ? 'Handy verbunden – Scans kommen hier an.' : 'Warte auf das Handy …'}
              </div>
              <button className={styles.btnSecondary} onClick={kopplung.beenden} type="button">Kopplung beenden</button>
            </>
          )}
        </div>
      )}

      {modus === 'senden' && (
        <div className={styles.koppelBox}>
          {koppelFehler && <div className={styles.fehlerText}>{koppelFehler}</div>}

          {!sendeSitzungId ? (
            <>
              <p className={styles.soft} style={{ margin: 0 }}>
                Dieses Gerät scannt nur und schickt die Codes weiter – gebucht wird auf dem gekoppelten Gerät.
              </p>
              <div className={styles.handEingabe}>
                <input
                  className={styles.handFeld}
                  inputMode="numeric"
                  value={koppelEingabe}
                  onChange={e => setKoppelEingabe(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="123456"
                  aria-label="Kopplungscode"
                />
                <button className={styles.btnPrimary} onClick={verbinden} type="button">Verbinden</button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.soft}>
                <i className="fas fa-circle-check" aria-hidden="true"></i> Verbunden – gescannte Codes gehen ans andere Gerät.
              </div>
              {gesendet.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {gesendet.map((eintrag, i) => (
                    <li key={`${eintrag.code}-${i}`} className={eintrag.fehler ? styles.stopText : styles.soft}>
                      <span className={styles.mono}>{eintrag.code}</span> {eintrag.fehler ? '– nicht angekommen' : '– gesendet'}
                    </li>
                  ))}
                </ul>
              )}
              <button className={styles.btnSecondary} onClick={trennen} type="button">Trennen</button>
            </>
          )}
        </div>
      )}

      <div className={styles.scanRaster}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Kamera</h3>
            <span className={`${styles.badge} ${styles.bOk}`}>Nummerncode + Matrixcode</span>
          </div>

          <div className={styles.kamera}>
            {supported ? (
              <>
                <video ref={videoRef} muted playsInline />
                {scanning && <span className={styles.kameraRahmen} />}
                <div className={styles.kameraHinweis}>
                  {scanning
                    ? 'Etikett ins Feld halten – Nummerncode XXXX-XX/XX oder Matrixcode.'
                    : 'Kamera ist aus.'}
                </div>
              </>
            ) : (
              <p className={styles.kameraAus}>
                Dieser Browser kann keine Codes lesen. Die Nummer lässt sich unten eintippen,
                oder ein Handy übernimmt das Scannen („Handy koppeln").
              </p>
            )}
          </div>

          {camError && <div className={styles.fehlerText} style={{ marginTop: '1rem' }}>{camError}</div>}

          {supported && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              {scanning ? (
                <button className={styles.btnSecondary} onClick={stop} type="button">
                  <i className="fas fa-stop" aria-hidden="true"></i> Kamera aus
                </button>
              ) : (
                <button className={styles.btnPrimary} onClick={start} type="button" disabled={zielFehlt && modus !== 'senden'}>
                  <i className="fas fa-camera" aria-hidden="true"></i> Kamera an
                </button>
              )}
            </div>
          )}

          <div className={styles.handEingabe}>
            <span className={styles.label} style={{ whiteSpace: 'nowrap' }}>Ohne Kamera</span>
            <input
              className={styles.handFeld}
              value={handEingabe}
              onChange={e => setHandEingabe(formatiereNummer(e.target.value))}
              onKeyDown={e => { if (e.key === 'Enter') uebernehmen(); }}
              placeholder="1042-07/19"
              aria-label="Nummerncode eintippen"
            />
            <button
              className={styles.btnSecondary}
              onClick={uebernehmen}
              type="button"
              disabled={!handEingabe.trim() || (zielFehlt && modus !== 'senden')}
            >
              Übernehmen
            </button>
          </div>
          <p className={styles.formHinweis}>
            Vier Ziffern, Bindestrich, zwei Ziffern, Schrägstrich, zwei Ziffern – die Eingabe wird beim Tippen formatiert.
          </p>
        </section>

        <div className={styles.scanSpalte}>
          {zielFehlt && modus !== 'senden' && (
            <div className={styles.hinweisBox}>
              <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
              <span>
                {scannen.vorgang === 'waesche'
                  ? 'Erst eine Charge wählen oder anlegen – sonst weiß der Scan nicht, wohin.'
                  : 'Erst die Person wählen, die das Teil bekommt.'}
              </span>
            </div>
          )}

          {letztes && (
            <div
              className={`${styles.scanFeedback} ${
                letztes.status === 'ok' ? styles.scanOk : letztes.status === 'hinweis' ? styles.scanWarn : styles.scanFehler
              }`}
            >
              <i
                className={`fas ${letztes.status === 'unbekannt' ? 'fa-circle-question' : 'fa-circle-check'}`}
                aria-hidden="true"
              ></i>
              <div>
                <div style={{ fontWeight: 700 }}>
                  <span className={styles.mono}>{letztes.code}</span>
                  {letztes.teil && ` · ${letztes.teil.typName}`}
                </div>
                <div>{letztes.meldung}</div>
              </div>
            </div>
          )}

          {scannen.ergebnisse.length > 0 && (
            <section className={styles.card}>
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle} style={{ fontSize: '1rem' }}>Zuletzt gescannt</h3>
                <button className={`${styles.chip} ${styles.chipKlein}`} onClick={scannen.leeren} type="button">
                  Liste leeren
                </button>
              </div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <tbody>
                    {scannen.ergebnisse.map((ergebnis, i) => (
                      <tr
                        key={`${ergebnis.code}-${i}`}
                        className={ergebnis.teil ? styles.klickbar : ''}
                        onClick={() => ergebnis.teil && onTeil(ergebnis.teil.id)}
                      >
                        <td className={styles.mono}>{ergebnis.code}</td>
                        <td>{ergebnis.teil?.typName ?? <span className={styles.soft}>unbekannt</span>}</td>
                        <td>
                          <span className={`${styles.badge} ${ergebnis.codeArt === 'nummer' ? styles.bPool : styles.bWash}`}>
                            {ergebnis.codeArt === 'nummer' ? 'Nummer' : 'Matrix'}
                          </span>
                        </td>
                        <td className={styles.soft}>{ergebnis.teil ? zeitpunkt(ergebnis.teil.letzteWaesche) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {scannen.offeneCodes.map(offen => (
            <section key={offen.code} className={`${styles.card} ${styles.scanUnbekannt}`}>
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle} style={{ fontSize: '1rem' }}>Unbekannter Code</h3>
                <span className={`${styles.badge} ${styles.bWarn}`}>
                  {offen.codeArt === 'nummer' ? 'Nummer' : 'Matrixcode'}
                </span>
              </div>
              <div className={styles.mono} style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{offen.code}</div>
              <p className={styles.soft} style={{ marginTop: 0 }}>
                {offen.codeArt === 'matrix'
                  ? 'Der Inhalt wird nicht ausgewertet – der Code dient nur als Zuordnung zu einem Teil.'
                  : 'Zu dieser Nummer ist noch kein Teil angelegt.'}
              </p>

              {offen.codeArt === 'matrix' ? (
                <div className={styles.handEingabe}>
                  <select
                    className={styles.suche}
                    style={{ flex: 1 }}
                    value={zuordnung[offen.code] ?? ''}
                    onChange={e => setZuordnung(prev => ({
                      ...prev,
                      [offen.code]: e.target.value ? Number(e.target.value) : '',
                    }))}
                    aria-label="Teil zuordnen"
                  >
                    <option value="">Vorhandenem Teil zuordnen …</option>
                    {teile
                      .filter(teil => teil.status !== 'ausgesondert' && !teil.matrixCode)
                      .map(teil => (
                        <option key={teil.id} value={teil.id}>
                          {teil.nummer} · {teil.typName}{teil.personName ? ` · ${teil.personName}` : ''}
                        </option>
                      ))}
                  </select>
                  <button
                    className={styles.btnPrimary}
                    onClick={() => void ordneZu(offen.code)}
                    type="button"
                    disabled={typeof zuordnung[offen.code] !== 'number'}
                  >
                    Anlernen
                  </button>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => scannen.verwerfeOffenen(offen.code)}
                    type="button"
                  >
                    Verwerfen
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className={styles.btnPrimary}
                    onClick={() => {
                      scannen.verwerfeOffenen(offen.code);
                      onNeuesTeil(offen.code);
                    }}
                    type="button"
                  >
                    Neues Teil anlegen
                  </button>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => scannen.verwerfeOffenen(offen.code)}
                    type="button"
                  >
                    Verwerfen
                  </button>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </>
  );
};
