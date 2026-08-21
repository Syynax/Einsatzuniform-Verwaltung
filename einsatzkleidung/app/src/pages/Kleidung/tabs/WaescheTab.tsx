import { useState } from 'react';
import type { ChargeMitTeilen } from '../../../types/kleidung';
import { entferneAusCharge, gebeChargeAb, meldeChargeZurueck, verwerfeCharge } from '../../../services/api';
import { ANLASS_TEXT, zeitpunkt } from '../../../constants/kleidung';
import { ChargeBadge, TraegerBadge } from '../hilfen';
import styles from '../Kleidung.module.css';

interface Props {
  chargen: ChargeMitTeilen[];
  onAenderung: () => Promise<void>;
  onTeil: (id: number) => void;
  onNeueCharge: () => void;
  onBearbeiten: (charge: ChargeMitTeilen) => void;
  onScannen: () => void;
}

const SCHRITTE = ['Erfasst', 'Unterwegs / läuft', 'Zurück – Zähler +1'];

export const WaescheTab: React.FC<Props> = ({
  chargen,
  onAenderung,
  onTeil,
  onNeueCharge,
  onBearbeiten,
  onScannen,
}) => {
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [abgewaehlt, setAbgewaehlt] = useState<{ chargeId: number; ids: number[] } | null>(null);

  const offene = chargen.filter(c => c.status !== 'abgeschlossen');
  const charge = chargen.find(c => c.id === gewaehlt) ?? offene[0] ?? chargen[0] ?? null;

  const fuehreAus = async (was: () => Promise<unknown>, erfolg?: string) => {
    setBusy(true);
    setFehler(null);
    setMeldung(null);
    try {
      await was();
      if (erfolg) setMeldung(erfolg);
      await onAenderung();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  // Abgewählt statt ausgewählt: Der Normalfall ist, dass alles zurückkommt.
  // Ein Teil, das jemand später noch in die Charge legt, ist damit automatisch
  // dabei, ohne dass es erst angehakt werden muss.
  const abwahl = abgewaehlt?.chargeId === charge?.id ? abgewaehlt.ids : [];
  const zurueckIds = charge ? charge.teile.filter(t => !abwahl.includes(t.id)).map(t => t.id) : [];
  const alleZurueck = charge ? zurueckIds.length === charge.teile.length : true;

  const wechsleTeil = (teilId: number) => {
    if (!charge) return;
    const ids = abwahl.includes(teilId) ? abwahl.filter(i => i !== teilId) : [...abwahl, teilId];
    setAbgewaehlt({ chargeId: charge.id, ids });
  };

  const zurueckmelden = async (id: number) => {
    const frage = alleZurueck
      ? 'Charge zurückmelden? Bei allen Teilen wird der Waschzähler um 1 erhöht.'
      : `${zurueckIds.length} von ${charge?.teile.length} Teilen zurückmelden? `
        + 'Nur bei diesen wird der Waschzähler erhöht, die übrigen bleiben in der Charge.';
    if (!confirm(frage)) return;

    await fuehreAus(async () => {
      const ergebnis = await meldeChargeZurueck(id, alleZurueck ? undefined : zurueckIds);
      const rest = ergebnis.verbleibend > 0
        ? ` ${ergebnis.verbleibend} ${ergebnis.verbleibend === 1 ? 'Teil bleibt' : 'Teile bleiben'} in der Charge.`
        : '';
      setMeldung(
        ergebnis.ueberGrenze.length > 0
          ? `${ergebnis.gezaehlt} Teile gezählt. Über der Höchstzahl: ${ergebnis.ueberGrenze.join(', ')}.${rest}`
          : `${ergebnis.gezaehlt} Teile zurückgemeldet.${rest}`,
      );
      setAbgewaehlt(null);
    });
  };

  const stufe = charge
    ? charge.status === 'erfasst' ? 0 : charge.status === 'unterwegs' ? 1 : 2
    : 0;

  return (
    <div className={styles.zweiSpaltenBreit}>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle} style={{ fontSize: '1rem' }}>Chargen</h3>
          <button className={styles.btnSecondary} onClick={onNeueCharge} type="button">
            <i className="fas fa-plus" aria-hidden="true"></i> Neu
          </button>
        </div>

        {chargen.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fas fa-soap" aria-hidden="true"></i>
            <p>Noch keine Wäsche erfasst.</p>
          </div>
        ) : (
          <div className={styles.chargeListe}>
            {chargen.map(eintrag => (
              <button
                key={eintrag.id}
                className={`${styles.chargeEintrag} ${charge?.id === eintrag.id ? styles.chargeAktiv : ''}`}
                onClick={() => setGewaehlt(eintrag.id)}
                type="button"
              >
                <span className={styles.chargeKopf}>
                  {eintrag.nummer}
                  <ChargeBadge status={eintrag.status} />
                </span>
                <span className={styles.soft}>
                  {eintrag.ort} · {eintrag.teile.length} {eintrag.teile.length === 1 ? 'Teil' : 'Teile'}
                </span>
                <span className={styles.soft}>
                  {eintrag.zurueck
                    ? `zurück ${zeitpunkt(eintrag.zurueck)}`
                    : eintrag.abgegeben
                      ? `abgegeben ${zeitpunkt(eintrag.abgegeben)}`
                      : `angelegt ${zeitpunkt(eintrag.erstellt)}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {charge ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h3 className={styles.cardTitle}>Charge {charge.nummer}</h3>
              <div className={styles.soft}>
                {ANLASS_TEXT[charge.anlass]} · {charge.ort}
                {charge.benutzer ? ` · erfasst von ${charge.benutzer}` : ''}
              </div>
              {charge.notiz && <div className={styles.soft}>{charge.notiz}</div>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <ChargeBadge status={charge.status} />
              {charge.status !== 'abgeschlossen' && (
                <button className={`${styles.chip} ${styles.chipKlein}`} onClick={() => onBearbeiten(charge)} type="button">
                  <i className="fas fa-pen" aria-hidden="true"></i> Ändern
                </button>
              )}
            </div>
          </div>

          {fehler && <div className={styles.fehlerText}>{fehler}</div>}
          {meldung && (
            <div className={styles.scanFeedback + ' ' + styles.scanOk} style={{ marginBottom: '1rem' }}>
              <i className="fas fa-circle-check" aria-hidden="true"></i>
              <span>{meldung}</span>
            </div>
          )}

          <div className={styles.schritte}>
            {SCHRITTE.map((titel, index) => (
              <span key={titel} style={{ display: 'contents' }}>
                <span className={`${styles.schritt} ${index <= stufe ? styles.schrittAktiv : ''}`}>
                  <span className={styles.schrittZahl}>{index + 1}</span>
                  {titel}
                </span>
                {index < SCHRITTE.length - 1 && <span className={styles.schrittLinie} />}
              </span>
            ))}
          </div>

          {charge.teile.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="fas fa-barcode" aria-hidden="true"></i>
              <p>Noch keine Teile in dieser Charge. Teile scannen oder in der Kleidungsliste hinzufügen.</p>
              <button className={styles.btnPrimary} onClick={onScannen} type="button">Teile scannen</button>
            </div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {charge.status !== 'abgeschlossen' && <th title="Kommt zurück">zurück</th>}
                    <th>Kennung</th><th>Teil</th><th>Träger</th><th>Wäschen</th>
                    <th>{charge.status === 'abgeschlossen' ? '' : 'Nach Rückgabe'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {charge.teile.map(teil => {
                    const kommtZurueck = !abwahl.includes(teil.id);
                    const nachher = teil.waschzaehler + 1;
                    const reisst = teil.waschgrenze !== null && nachher > teil.waschgrenze;
                    return (
                      <tr key={teil.id} style={kommtZurueck ? undefined : { opacity: 0.5 }}>
                        {charge.status !== 'abgeschlossen' && (
                          <td>
                            <input
                              type="checkbox"
                              checked={kommtZurueck}
                              onChange={() => wechsleTeil(teil.id)}
                              disabled={busy}
                              aria-label={`${teil.bezeichnung} kommt zurück`}
                            />
                          </td>
                        )}
                        <td className={`${styles.mono} ${styles.klickbar}`} onClick={() => onTeil(teil.id)}>{teil.bezeichnung}</td>
                        <td>{teil.typName}</td>
                        <td><TraegerBadge teil={teil} /></td>
                        <td className={styles.num}>
                          {teil.waschzaehler}{teil.waschgrenze !== null ? ` / ${teil.waschgrenze}` : ''}
                        </td>
                        <td className={`${styles.num} ${reisst && kommtZurueck ? styles.stopText : ''}`}>
                          {charge.status === 'abgeschlossen' || !kommtZurueck
                            ? ''
                            : `${nachher}${teil.waschgrenze !== null ? ` / ${teil.waschgrenze}` : ''}${reisst ? ' · Grenze' : ''}`}
                        </td>
                        <td className={styles.rechts}>
                          {charge.status !== 'abgeschlossen' && (
                            <button
                              className={`${styles.chip} ${styles.chipKlein}`}
                              onClick={() => void fuehreAus(() => entferneAusCharge(charge.id, teil.id))}
                              type="button"
                              disabled={busy}
                            >
                              entfernen
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {charge.status !== 'abgeschlossen' && (
            <div className={styles.chargenFuss}>
              {charge.teile.some(t =>
                !abwahl.includes(t.id) && t.waschgrenze !== null && t.waschzaehler + 1 > t.waschgrenze,
              ) && (
                <div className={styles.hinweisBox}>
                  <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                  <span>Mindestens ein Teil überschreitet mit dieser Wäsche die Höchstzahl – Ersatz einplanen.</span>
                </div>
              )}

              {!alleZurueck && (
                <div className={styles.hinweisBox}>
                  <i className="fas fa-circle-info" aria-hidden="true"></i>
                  <span>
                    {charge.teile.length - zurueckIds.length} Teile sind abgehakt und bleiben in der Charge –
                    ihr Waschzähler wird nicht erhöht. Die Charge bleibt offen, bis auch sie zurück sind.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <button className={styles.btnSecondary} onClick={onScannen} type="button">Teile scannen</button>
                {charge.status === 'erfasst' && (
                  <button
                    className={styles.btnSecondary}
                    onClick={() => void fuehreAus(() => gebeChargeAb(charge.id), `Charge ${charge.nummer} ist unterwegs.`)}
                    type="button"
                    disabled={busy || charge.teile.length === 0}
                  >
                    Abgeben → unterwegs
                  </button>
                )}
                <button
                  className={styles.btnPrimary}
                  onClick={() => void zurueckmelden(charge.id)}
                  type="button"
                  disabled={busy || zurueckIds.length === 0}
                >
                  <i className="fas fa-rotate-left" aria-hidden="true"></i>{' '}
                  {alleZurueck
                    ? 'Zurück – Zähler +1'
                    : `${zurueckIds.length} von ${charge.teile.length} zurück – Zähler +1`}
                </button>
                <button
                  className={styles.btnDanger}
                  onClick={() => {
                    if (confirm(`Charge ${charge.nummer} verwerfen? Die Teile gehen zurück in den Dienst, ohne gezählt zu werden.`)) {
                      void fuehreAus(() => verwerfeCharge(charge.id));
                    }
                  }}
                  type="button"
                  disabled={busy}
                >
                  Verwerfen
                </button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className={`${styles.card} ${styles.emptyState}`}>
          <i className="fas fa-soap" aria-hidden="true"></i>
          <p>Keine Charge ausgewählt.</p>
          <button className={styles.btnPrimary} onClick={onNeueCharge} type="button">Charge anlegen</button>
        </section>
      )}
    </div>
  );
};
