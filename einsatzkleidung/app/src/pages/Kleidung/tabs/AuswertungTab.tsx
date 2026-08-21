import { useEffect, useState } from 'react';
import type { Auswertung, VorgangMitNamen } from '../../../types/kleidung';
import { getAuswertung, getVorgaenge } from '../../../services/api';
import { ANLASS_TEXT, VORGANG_ICON, VORGANG_TEXT, zeitpunkt } from '../../../constants/kleidung';
import styles from '../Kleidung.module.css';

/** Monatsschlüssel JJJJ-MM auf ein kurzes Label für die Balken. */
const monatsLabel = (monat: string): string => {
  const [jahr, m] = monat.split('-');
  return `${m}/${jahr.slice(2)}`;
};

export const AuswertungTab: React.FC = () => {
  const [auswertung, setAuswertung] = useState<Auswertung | null>(null);
  const [vorgaenge, setVorgaenge] = useState<VorgangMitNamen[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getAuswertung(controller.signal), getVorgaenge(60, controller.signal)])
      .then(([neueAuswertung, neueVorgaenge]) => {
        setAuswertung(neueAuswertung);
        setVorgaenge(neueVorgaenge);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setFehler(err instanceof Error ? err.message : 'Auswertung konnte nicht geladen werden.');
      });
    return () => controller.abort();
  }, []);

  if (fehler) return <div className={styles.fehlerText}>{fehler}</div>;
  if (!auswertung) return <div className={styles.ladeState}>Lade Auswertung …</div>;

  const hoechster = Math.max(1, ...auswertung.waeschenProMonat.map(m => m.waeschen));

  return (
    <>
      <div className={styles.statusBar}>
        <div className={styles.statusPill}>
          <i className="fas fa-soap" aria-hidden="true"></i>
          <span className={styles.statusPillText}>
            <span className={styles.statusPillValue}>{auswertung.jahresWaeschen}</span>
            <span className={styles.statusPillLabel}>Wäschen dieses Jahr</span>
          </span>
        </div>
        <div className={styles.statusPill}>
          <i className="fas fa-ban" aria-hidden="true"></i>
          <span className={styles.statusPillText}>
            <span className={styles.statusPillValue}>{auswertung.ausgesondert}</span>
            <span className={styles.statusPillLabel}>ausgesondert</span>
          </span>
        </div>
        {auswertung.waeschenNachAnlass.map(eintrag => (
          <div key={eintrag.anlass} className={styles.statusPill}>
            <i className="fas fa-fire-flame-curved" aria-hidden="true"></i>
            <span className={styles.statusPillText}>
              <span className={styles.statusPillValue}>{eintrag.anzahl}</span>
              <span className={styles.statusPillLabel}>{ANLASS_TEXT[eintrag.anlass]}</span>
            </span>
          </div>
        ))}
      </div>

      <div className={styles.zweiSpalten}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Wäschen pro Monat</h3>
            <span className={styles.soft}>letzte 12 Monate</span>
          </div>
          <div className={styles.balkenReihe}>
            {auswertung.waeschenProMonat.map(eintrag => (
              <div key={eintrag.monat} className={styles.balkenSpalte}>
                <span className={styles.balkenWert}>{eintrag.waeschen || ''}</span>
                <span
                  className={styles.balken}
                  style={{ height: `${Math.round((eintrag.waeschen / hoechster) * 120)}px` }}
                />
                <span className={styles.balkenLabel}>{monatsLabel(eintrag.monat)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Belastung je Typ</h3>
          </div>
          {auswertung.waeschenProTyp.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="fas fa-chart-simple" aria-hidden="true"></i>
              <p>Noch keine Wäschen gezählt.</p>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Typ</th><th>Teile</th><th>Wäschen</th><th>Schnitt</th></tr>
                </thead>
                <tbody>
                  {auswertung.waeschenProTyp.map(eintrag => (
                    <tr key={eintrag.typName}>
                      <td>{eintrag.typName}</td>
                      <td className={styles.num}>{eintrag.teile}</td>
                      <td className={styles.num}>{eintrag.waeschen}</td>
                      <td className={styles.num}>{eintrag.schnitt.toLocaleString('de-DE')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Verlauf</h3>
          <span className={styles.soft}>die letzten {vorgaenge.length} Vorgänge</span>
        </div>
        {vorgaenge.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fas fa-clock-rotate-left" aria-hidden="true"></i>
            <p>Noch nichts passiert.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr><th>Zeitpunkt</th><th>Kennung</th><th>Teil</th><th>Vorgang</th><th>Person</th><th>Zähler</th></tr>
              </thead>
              <tbody>
                {vorgaenge.map(vorgang => (
                  <tr key={vorgang.id}>
                    <td className={styles.num}>{zeitpunkt(vorgang.zeit)}</td>
                    <td className={styles.mono}>{vorgang.bezeichnung}</td>
                    <td>{vorgang.typName}</td>
                    <td>
                      <i className={`fas ${VORGANG_ICON[vorgang.typ]}`} aria-hidden="true" style={{ marginRight: '0.4rem', opacity: 0.7 }}></i>
                      {VORGANG_TEXT[vorgang.typ]}
                      {vorgang.detail && <span className={styles.soft}> · {vorgang.detail}</span>}
                    </td>
                    <td>{vorgang.personName ?? '–'}</td>
                    <td className={styles.num}>
                      {vorgang.zaehlerVorher !== null && vorgang.zaehlerNachher !== null
                        ? `${vorgang.zaehlerVorher} → ${vorgang.zaehlerNachher}`
                        : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
};
