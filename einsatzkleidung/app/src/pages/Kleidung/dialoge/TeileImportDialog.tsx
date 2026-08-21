import { useState } from 'react';
import type {
  TeilImportBefund,
  TeileImportBericht,
  TeileImportModus,
  Teiletyp,
} from '../../../types/kleidung';
import { pruefeTeileImport, uebernehmeTeileImport } from '../../../services/api';
import styles from '../Kleidung.module.css';

interface Props {
  typen: Teiletyp[];
  onClose: () => void;
  onUebernommen: () => Promise<void>;
}

const BEFUND_TEXT: Record<TeilImportBefund, string> = {
  neu: 'neu',
  aktualisiert: 'wird geändert',
  unveraendert: 'unverändert',
  uebersprungen: 'übersprungen',
  fehler: 'Fehler',
};

const BEFUND_KLASSE: Record<TeilImportBefund, string> = {
  neu: styles.bOk,
  aktualisiert: styles.bWash,
  unveraendert: styles.bPool,
  uebersprungen: styles.bPool,
  fehler: styles.bStop,
};

const FELD_TEXT: Record<string, string> = {
  nummer: 'Nummer',
  typ: 'Typ',
  groesse: 'Größe',
  traeger: 'Träger',
  hersteller: 'Hersteller',
  beschaffung: 'Beschaffung',
  standort: 'Standort',
  waschzaehler: 'Waschzähler',
  letztePruefung: 'Letzte Prüfung',
  letzteWaesche: 'Letzte Wäsche',
  matrixCode: 'Matrixcode',
  notiz: 'Notiz',
};

/**
 * Excel schreibt CSV je nach Einstellung als Windows-1252 statt UTF-8. Erst
 * streng als UTF-8 lesen; scheitert das, ist es die alte Kodierung.
 */
async function leseText(datei: File): Promise<string> {
  const puffer = await datei.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(puffer);
  } catch {
    return new TextDecoder('windows-1252').decode(puffer);
  }
}

export const TeileImportDialog: React.FC<Props> = ({ typen, onClose, onUebernommen }) => {
  const [dateiName, setDateiName] = useState<string | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [modus, setModus] = useState<TeileImportModus>('ueberspringen');
  const [bericht, setBericht] = useState<TeileImportBericht | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fertig, setFertig] = useState<string | null>(null);
  const [nurProbleme, setNurProbleme] = useState(false);

  const pruefe = async (inhalt: string, gewaehlterModus: TeileImportModus) => {
    setBusy(true);
    setFehler(null);
    try {
      setBericht(await pruefeTeileImport(inhalt, gewaehlterModus));
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
    setNurProbleme(false);
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

  const wechsleModus = async (neuerModus: TeileImportModus) => {
    setModus(neuerModus);
    if (csv) await pruefe(csv, neuerModus);
  };

  const uebernehmen = async () => {
    if (!csv || !bericht) return;
    setBusy(true);
    setFehler(null);
    try {
      const ergebnis = await uebernehmeTeileImport(csv, modus);
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
    // Mustertypen aus dem eigenen Bestand, damit die Datei ohne Nacharbeit
    // durchläuft – ein erfundener Typname wäre sofort eine Fehlerzeile.
    const beispielTyp = typen.find(t => t.waschbar)?.name ?? 'Überjacke HuPF Teil 1';
    const zweiterTyp = typen.find(t => !t.waschbar)?.name ?? 'Feuerwehrhelm';
    const zeilen = [
      'Nummer;Typ;Größe;Träger;Hersteller;Beschaffung;Standort;Waschzähler;Letzte Prüfung;Matrixcode;Notiz',
      `1042-07/19;${beispielTyp};52;Müller, Anna;Novotex;2019-07;Spind 12;14;2026-03-15;;`,
      `1042-08/19;${zweiterTyp};;Müller, Anna;Schuberth;2019-08;Spind 12;;2026-03-15;;`,
      `1043-01/22;${beispielTyp};54;;Novotex;2022-01;Lager;0;;;Reserve`,
    ];
    const blob = new Blob([`﻿${zeilen.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kleidung-muster.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const uebernehmbar = (bericht?.neu ?? 0) + (bericht?.aktualisiert ?? 0);
  const trennerText = bericht?.trenner === '\t' ? 'Tabulator' : bericht?.trenner ?? '';
  const zeilen = bericht
    ? (nurProbleme ? bericht.zeilen.filter(z => z.befund === 'fehler') : bericht.zeilen)
    : [];

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalGross}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalKopf}>
          <h2>Kleidungsstücke aus CSV</h2>
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
          <label htmlFor="teile-import-datei">Datei</label>
          <input
            id="teile-import-datei"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            onChange={e => void waehleDatei(e.target.files?.[0])}
          />
          <p className={styles.formHinweis}>
            Pflicht sind <strong>Nummer</strong> und <strong>Typ</strong>. Dazu erkannt werden Größe,
            Träger, Hersteller, Beschaffung, Standort, Waschzähler, Letzte Prüfung, Letzte Wäsche,
            Matrixcode und Notiz. Die Nummer muss dem Muster <span className={styles.mono}>XXXX-XX/XX</span> folgen,
            vorne mit vier bis zehn Ziffern; eine reine Ziffernfolge wie <span className={styles.mono}>10420719</span> wird
            umgesetzt.
          </p>
          <p className={styles.formHinweis}>
            <strong>Wiedererkannt wird ein Teil an Nummer, Typ und Träger zusammen.</strong> Dieselbe Nummer darf
            mehrfach vorkommen – steht auf dem Etikett die Nummer der Lieferung, tragen alle Stücke daraus dieselbe.
            Wer solche Teile per Datei pflegt, braucht deshalb die Trägerspalte.
          </p>
          <p className={styles.formHinweis}>
            <strong>Typ und Träger werden über den Namen gesucht und nie neu angelegt.</strong> Ein
            unbekannter Name ergibt eine Fehlerzeile – so entsteht aus einem Tippfehler kein zweiter
            Teiletyp neben dem richtigen. Teiletypen also vorher unter Kleidung → Typen anlegen,
            Personen über den Personen-Import.
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
          <label>Wenn die Nummer schon erfasst ist</label>
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
            Geändert wird nur, was in der Datei steht – eine Liste ohne Standortspalte lässt den
            Standort stehen. Waschzähler und Prüfdatum werden beim Ändern im Verlauf des Teils
            protokolliert. Status, laufende Wäsche und Historie fasst der Import nicht an.
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
                <i className="fas fa-plus" aria-hidden="true"></i>
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

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={styles.soft} style={{ minWidth: 0 }}>
                {dateiName} · Trenner „{trennerText}" · gelesen als{' '}
                {Object.entries(bericht.zuordnung)
                  .map(([feld, spalte]) => `${spalte} → ${FELD_TEXT[feld] ?? feld}`)
                  .join(', ')}
              </span>
              {bericht.fehler > 0 && (
                <button
                  className={`${styles.chip} ${styles.chipKlein} ${nurProbleme ? styles.chipAktiv : ''}`}
                  onClick={() => setNurProbleme(!nurProbleme)}
                  type="button"
                  style={{ marginLeft: 'auto' }}
                >
                  nur Fehler
                </button>
              )}
            </div>

            <div className={styles.tableWrapper} style={{ maxHeight: '22rem', overflowY: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Zeile</th><th>Nummer</th><th>Typ</th><th>Träger</th>
                    <th>Wäschen</th><th>Was passiert</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map(zeile => (
                    <tr key={zeile.zeile}>
                      <td className={styles.num}>{zeile.zeile}</td>
                      <td className={styles.mono}>{zeile.nummer || <span className={styles.soft}>–</span>}</td>
                      <td>{zeile.typName ?? <span className={styles.soft}>–</span>}</td>
                      <td>{zeile.personName ?? <span className={styles.soft}>Pool</span>}</td>
                      <td className={styles.num}>
                        {zeile.werte?.waschzaehler ?? <span className={styles.soft}>–</span>}
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
