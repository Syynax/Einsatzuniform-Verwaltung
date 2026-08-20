import { useState } from 'react';
import type {
  PersonImportBefund,
  PersonImportBericht,
  PersonImportModus,
} from '../../../types/kleidung';
import { pruefePersonenImport, uebernehmePersonenImport } from '../../../services/api';
import styles from '../Kleidung.module.css';

interface Props {
  onClose: () => void;
  onUebernommen: () => Promise<void>;
}

const BEFUND_TEXT: Record<PersonImportBefund, string> = {
  neu: 'neu',
  aktualisiert: 'wird geändert',
  unveraendert: 'unverändert',
  uebersprungen: 'übersprungen',
  fehler: 'Fehler',
};

const BEFUND_KLASSE: Record<PersonImportBefund, string> = {
  neu: styles.bOk,
  aktualisiert: styles.bWash,
  unveraendert: styles.bPool,
  uebersprungen: styles.bPool,
  fehler: styles.bStop,
};

const FELD_TEXT: Record<string, string> = {
  name: 'Name',
  nachname: 'Nachname',
  vorname: 'Vorname',
  atemschutz: 'Atemschutz',
  tauglichBis: 'Tauglichkeit',
  aktiv: 'Status',
  notiz: 'Notiz',
};

const MUSTER = [
  'Name;Atemschutz;Tauglich bis;Notiz',
  'Müller, Anna;ja;2027-03;Spind 12',
  'Schmidt, Ben;nein;;',
  'Weber, Clara;ja;2026-11;Fährt RW',
].join('\r\n');

/**
 * Excel schreibt CSV je nach Einstellung als Windows-1252 statt UTF-8. Erst
 * streng als UTF-8 lesen; scheitert das, ist es die alte Kodierung – sonst
 * kämen die Umlaute als Fragezeichen an.
 */
async function leseText(datei: File): Promise<string> {
  const puffer = await datei.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(puffer);
  } catch {
    return new TextDecoder('windows-1252').decode(puffer);
  }
}

export const PersonenImportDialog: React.FC<Props> = ({ onClose, onUebernommen }) => {
  const [dateiName, setDateiName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [modus, setModus] = useState<PersonImportModus>('ueberspringen');
  const [bericht, setBericht] = useState<PersonImportBericht | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fertig, setFertig] = useState<string | null>(null);

  const pruefe = async (inhalt: string, gewaehlterModus: PersonImportModus) => {
    setBusy(true);
    setFehler(null);
    try {
      setBericht(await pruefePersonenImport(inhalt, gewaehlterModus));
    } catch (err) {
      setBericht(null);
      setFehler(err instanceof Error ? err.message : 'Die Datei konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
    }
  };

  const waehleDatei = async (datei: File | undefined) => {
    if (!datei) return;
    setFertig(null);
    setDateiName(datei.name);
    try {
      const inhalt = await leseText(datei);
      setCsv(inhalt);
      await pruefe(inhalt, modus);
    } catch {
      setCsv(null);
      setBericht(null);
      setFehler('Die Datei konnte nicht gelesen werden.');
    }
  };

  const wechsleModus = async (neuerModus: PersonImportModus) => {
    setModus(neuerModus);
    if (csv) await pruefe(csv, neuerModus);
  };

  const uebernehmen = async () => {
    if (!csv || !bericht) return;
    setBusy(true);
    setFehler(null);
    try {
      const ergebnis = await uebernehmePersonenImport(csv, modus);
      setBericht(ergebnis);
      setFertig(
        `${ergebnis.neu} angelegt, ${ergebnis.aktualisiert} geändert.`
        + (ergebnis.fehler > 0 ? ` ${ergebnis.fehler} Zeilen blieben liegen.` : ''),
      );
      await onUebernommen();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Übernehmen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const ladeMuster = () => {
    // Mit BOM, damit Excel die Umlaute beim Doppelklick richtig anzeigt.
    const blob = new Blob([`﻿${MUSTER}\r\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'personen-muster.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const uebernehmbar = (bericht?.neu ?? 0) + (bericht?.aktualisiert ?? 0);
  const trennerText = bericht?.trenner === '\t' ? 'Tabulator' : bericht?.trenner ?? '';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalGross}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalKopf}>
          <h2>Personen aus CSV</h2>
          <button className={styles.schliessen} onClick={onClose} type="button" aria-label="Schließen">
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {fehler && <div className={styles.fehlerText}>{fehler}</div>}
        {fertig && (
          <div className={styles.hinweisBox}>
            <i className="fas fa-check" aria-hidden="true"></i>
            <span>{fertig}</span>
          </div>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="import-datei">Datei</label>
          <input
            id="import-datei"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={e => void waehleDatei(e.target.files?.[0])}
          />
          <p className={styles.formHinweis}>
            Die erste Zeile ist die Kopfzeile. Erkannt werden <strong>Name</strong> – oder
            <strong> Nachname</strong> und <strong>Vorname</strong> – sowie <strong>Atemschutz</strong>,
            <strong> Tauglich bis</strong>, <strong>Status</strong> und <strong>Notiz</strong>.
            Semikolon, Komma und Tabulator als Trenner; Umlaute in beiden gängigen Kodierungen.
          </p>
          <button
            className={`${styles.chip} ${styles.chipKlein}`}
            onClick={ladeMuster}
            type="button"
            style={{ alignSelf: 'flex-start' }}
          >
            <i className="fas fa-download" aria-hidden="true"></i> Muster herunterladen
          </button>
        </div>

        <div className={styles.formGroup}>
          <label>Wenn der Name schon angelegt ist</label>
          <span style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            <button
              className={`${styles.chip} ${modus === 'ueberspringen' ? styles.chipAktiv : ''}`}
              onClick={() => void wechsleModus('ueberspringen')}
              type="button"
              disabled={busy}
            >
              Überspringen
            </button>
            <button
              className={`${styles.chip} ${modus === 'aktualisieren' ? styles.chipAktiv : ''}`}
              onClick={() => void wechsleModus('aktualisieren')}
              type="button"
              disabled={busy}
            >
              Aktualisieren
            </button>
          </span>
          <p className={styles.formHinweis}>
            Verglichen wird über den Namen, Gross- und Kleinschreibung egal. Ausgegebene Teile und
            die Historie bleiben in beiden Fällen unangetastet – geändert werden nur die Felder,
            die in der Datei stehen.
          </p>
        </div>

        {busy && !bericht && (
          <div className={styles.ladeState}>
            <i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Datei wird geprüft …
          </div>
        )}

        {bericht && (
          <>
            <div className={styles.statusBar}>
              <div className={styles.statusPill}>
                <i className="fas fa-user-plus" aria-hidden="true"></i>
                <span className={styles.statusPillText}>
                  <span className={styles.statusPillValue}>{bericht.neu}</span>
                  <span className={styles.statusPillLabel}>neu</span>
                </span>
              </div>
              <div className={styles.statusPill}>
                <i className="fas fa-pen" aria-hidden="true"></i>
                <span className={styles.statusPillText}>
                  <span className={styles.statusPillValue}>{bericht.aktualisiert}</span>
                  <span className={styles.statusPillLabel}>zu ändern</span>
                </span>
              </div>
              <div className={styles.statusPill}>
                <i className="fas fa-equals" aria-hidden="true"></i>
                <span className={styles.statusPillText}>
                  <span className={styles.statusPillValue}>
                    {bericht.unveraendert + bericht.uebersprungen}
                  </span>
                  <span className={styles.statusPillLabel}>bleibt, wie es ist</span>
                </span>
              </div>
              <div className={`${styles.statusPill} ${bericht.fehler > 0 ? styles.statusPillStop : ''}`}>
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <span className={styles.statusPillText}>
                  <span className={styles.statusPillValue}>{bericht.fehler}</span>
                  <span className={styles.statusPillLabel}>Fehler</span>
                </span>
              </div>
            </div>

            <p className={styles.soft}>
              {dateiName} · Trenner „{trennerText}" · gelesen als{' '}
              {Object.entries(bericht.zuordnung)
                .map(([feld, spalte]) => `${spalte} → ${FELD_TEXT[feld] ?? feld}`)
                .join(', ')}
            </p>

            <div className={styles.tableWrapper} style={{ maxHeight: '22rem', overflowY: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Zeile</th><th>Name</th><th>Atemschutz</th><th>Was passiert</th></tr>
                </thead>
                <tbody>
                  {bericht.zeilen.map(zeile => (
                    <tr key={zeile.zeile}>
                      <td className={styles.num}>{zeile.zeile}</td>
                      <td style={{ fontWeight: zeile.befund === 'fehler' ? 400 : 600 }}>
                        {zeile.name || <span className={styles.soft}>–</span>}
                      </td>
                      <td>
                        {zeile.werte?.atemschutz === true && (
                          <span className={`${styles.badge} ${styles.bStop}`}>
                            AGT{zeile.werte.tauglichBis ? ` bis ${zeile.werte.tauglichBis}` : ''}
                          </span>
                        )}
                        {zeile.werte?.atemschutz === false && <span className={styles.soft}>nein</span>}
                        {zeile.werte?.atemschutz === undefined && <span className={styles.soft}>–</span>}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${BEFUND_KLASSE[zeile.befund]}`}>
                          {BEFUND_TEXT[zeile.befund]}
                        </span>
                        {zeile.meldung && <span className={styles.soft}> {zeile.meldung}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className={styles.modalAktionen}>
          <button className={styles.btnSecondary} onClick={onClose} type="button">
            {bericht?.uebernommen ? 'Schließen' : 'Abbrechen'}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => void uebernehmen()}
            type="button"
            disabled={busy || !bericht || uebernehmbar === 0 || bericht.uebernommen}
          >
            {busy
              ? 'Arbeitet …'
              : uebernehmbar === 0
                ? 'Nichts zu übernehmen'
                : `${uebernehmbar} übernehmen`}
          </button>
        </div>
      </div>
    </div>
  );
};
