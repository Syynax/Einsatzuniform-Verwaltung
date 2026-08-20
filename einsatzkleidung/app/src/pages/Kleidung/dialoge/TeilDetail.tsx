import { useCallback, useEffect, useState } from 'react';
import type { ChargeMitTeilen, PersonMitAusstattung, TeilMitDetails, Vorgang } from '../../../types/kleidung';
import {
  ausgeben,
  aussondern,
  deleteTeil,
  eintragePruefung,
  getTeil,
  legeInCharge,
  meldeReparatur,
  setMatrixCode,
  setzeWaschzaehler,
  scanne,
} from '../../../services/api';
import { ANLASS_TEXT, VORGANG_ICON, VORGANG_TEXT, datum, monat, zeitpunkt } from '../../../constants/kleidung';
import { StatusBadge, WaschBalken } from '../hilfen';
import styles from '../Kleidung.module.css';

interface Props {
  teilId: number;
  personen: PersonMitAusstattung[];
  chargen: ChargeMitTeilen[];
  onClose: () => void;
  onBearbeiten: (teil: TeilMitDetails) => void;
  onAenderung: () => Promise<void>;
}

/** Welches Formular gerade unter den Aktionen aufgeklappt ist. */
type Aktion = 'waesche' | 'ausgabe' | 'reparatur' | 'pruefung' | 'aussondern' | 'zaehler' | null;

const heute = (): string => new Date().toISOString().slice(0, 10);

export const TeilDetail: React.FC<Props> = ({ teilId, personen, chargen, onClose, onBearbeiten, onAenderung }) => {
  const [teil, setTeil] = useState<TeilMitDetails | null>(null);
  const [vorgaenge, setVorgaenge] = useState<Vorgang[]>([]);
  const [aktion, setAktion] = useState<Aktion>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Eingaben der aufgeklappten Formulare
  const [chargeId, setChargeId] = useState<number | ''>('');
  const [personId, setPersonId] = useState<number | ''>('');
  const [text, setText] = useState('');
  const [pruefDatum, setPruefDatum] = useState(heute());
  const [zaehlerWert, setZaehlerWert] = useState('0');

  const laden = useCallback(async (signal?: AbortSignal) => {
    try {
      const antwort = await getTeil(teilId, signal);
      setTeil(antwort.teil);
      setVorgaenge(antwort.vorgaenge);
      setZaehlerWert(String(antwort.teil.waschzaehler));
      setPersonId(antwort.teil.personId ?? '');
    } catch (err) {
      if (signal?.aborted) return;
      setFehler(err instanceof Error ? err.message : 'Teil konnte nicht geladen werden.');
    }
  }, [teilId]);

  useEffect(() => {
    const controller = new AbortController();
    void laden(controller.signal);
    return () => controller.abort();
  }, [laden]);

  const offeneChargen = chargen.filter(c => c.status === 'erfasst');

  useEffect(() => {
    if (chargeId === '' && offeneChargen.length > 0) setChargeId(offeneChargen[0].id);
  }, [chargeId, offeneChargen]);

  const fuehreAus = async (was: () => Promise<unknown>) => {
    setBusy(true);
    setFehler(null);
    try {
      await was();
      setAktion(null);
      setText('');
      await laden();
      await onAenderung();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  const loeschen = async () => {
    if (!teil) return;
    if (!confirm(`${teil.nummer} endgültig löschen? Die Historie geht mit verloren – zum Ausmustern besser „Aussondern".`)) return;
    await fuehreAus(async () => {
      await deleteTeil(teil.id);
      onClose();
    });
  };

  if (!teil) {
    return (
      <div className={styles.modalOverlay} onClick={onClose}>
        <div className={`${styles.modal} ${styles.modalGross}`} onClick={e => e.stopPropagation()}>
          {fehler ? <div className={styles.fehlerText}>{fehler}</div> : <div className={styles.ladeState}>Lade …</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalGross}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalKopf}>
          <div>
            <h2>{teil.typName}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
              <span className={styles.mono} style={{ fontWeight: 700, color: 'var(--accent)' }}>{teil.nummer}</span>
              <StatusBadge teil={teil} />
              {teil.hinweise.map(hinweis => (
                <span key={hinweis} className={`${styles.badge} ${teil.ampel === 'grenze' ? styles.bStop : styles.bWarn}`}>
                  {hinweis}
                </span>
              ))}
            </div>
          </div>
          <button className={styles.schliessen} onClick={onClose} type="button" aria-label="Schließen">
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {fehler && <div className={styles.fehlerText}>{fehler}</div>}

        <div className={styles.zweiSpalten}>
          <div>
            <section className={styles.card} style={{ marginBottom: '1.5rem' }}>
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle} style={{ fontSize: '1rem' }}>Waschzähler</h3>
                {teil.verbleibend !== null && (
                  <span className={styles.soft}>
                    {teil.verbleibend > 0 ? `${teil.verbleibend} verbleibend` : 'Höchstzahl erreicht'}
                  </span>
                )}
              </div>
              <WaschBalken teil={teil} gross />
              <div className={styles.soft} style={{ marginTop: '0.75rem' }}>
                Letzte Wäsche: {zeitpunkt(teil.letzteWaesche)}
                {teil.chargeNummer ? ` · aktuell in Charge ${teil.chargeNummer}` : ''}
              </div>
            </section>

            <section className={styles.card} style={{ marginBottom: '1.5rem' }}>
              <h3 className={styles.cardTitle} style={{ fontSize: '1rem', marginBottom: '1rem' }}>Stammdaten</h3>
              <div className={styles.detailRaster}>
                <div><div className={styles.label}>Nummer</div><div className={styles.mono}>{teil.nummer}</div></div>
                <div><div className={styles.label}>Größe</div><div>{teil.groesse ?? '–'}</div></div>
                <div><div className={styles.label}>Hersteller</div><div>{teil.hersteller ?? '–'}</div></div>
                <div><div className={styles.label}>Beschaffung</div><div>{monat(teil.beschaffung)}</div></div>
                <div><div className={styles.label}>Träger</div><div>{teil.personName ?? 'Pool'}</div></div>
                <div><div className={styles.label}>Standort</div><div>{teil.standort ?? '–'}</div></div>
                <div><div className={styles.label}>Letzte Prüfung</div><div>{datum(teil.letztePruefung)}</div></div>
                <div>
                  <div className={styles.label}>Nächste Prüfung</div>
                  <div className={teil.pruefungFaellig ? styles.stopText : ''}>{datum(teil.naechstePruefung)}</div>
                </div>
                <div>
                  <div className={styles.label}>Matrixcode</div>
                  <div className={styles.mono} style={{ fontSize: '0.8125rem', wordBreak: 'break-all' }}>
                    {teil.matrixCode ?? 'nicht angelernt'}
                  </div>
                </div>
              </div>
              {teil.notiz && <p className={styles.soft} style={{ margin: 0 }}>{teil.notiz}</p>}
            </section>

            <section className={styles.card}>
              <h3 className={styles.cardTitle} style={{ fontSize: '1rem', marginBottom: '1rem' }}>Verlauf</h3>
              {vorgaenge.length === 0 ? (
                <p className={styles.soft}>Noch keine Vorgänge.</p>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr><th>Datum</th><th>Vorgang</th><th>Detail</th><th>Zähler</th><th>Erfasst von</th></tr>
                    </thead>
                    <tbody>
                      {vorgaenge.map(vorgang => (
                        <tr key={vorgang.id}>
                          <td className={styles.num}>{zeitpunkt(vorgang.zeit)}</td>
                          <td>
                            <i className={`fas ${VORGANG_ICON[vorgang.typ]}`} aria-hidden="true" style={{ marginRight: '0.4rem', opacity: 0.7 }}></i>
                            {VORGANG_TEXT[vorgang.typ]}
                          </td>
                          <td className={styles.soft}>
                            {vorgang.detail ?? '–'}
                            {vorgang.anlass ? ` · ${ANLASS_TEXT[vorgang.anlass]}` : ''}
                          </td>
                          <td className={styles.num}>
                            {vorgang.zaehlerVorher !== null && vorgang.zaehlerNachher !== null
                              ? `${vorgang.zaehlerVorher} → ${vorgang.zaehlerNachher}`
                              : '–'}
                          </td>
                          <td className={styles.soft}>{vorgang.benutzer ?? '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <section className={styles.card}>
            <h3 className={styles.cardTitle} style={{ fontSize: '1rem', marginBottom: '1rem' }}>Aktionen</h3>

            <div className={styles.aktionenSpalte}>
              {teil.status === 'waesche' ? (
                <button
                  className={`${styles.btnPrimary} ${styles.btnBlock}`}
                  onClick={() => void fuehreAus(() => scanne(teil.nummer, 'zurueck'))}
                  type="button"
                  disabled={busy}
                >
                  Einzeln zurückmelden (+1)
                </button>
              ) : (
                <button
                  className={`${styles.btnPrimary} ${styles.btnBlock}`}
                  onClick={() => setAktion(aktion === 'waesche' ? null : 'waesche')}
                  type="button"
                  disabled={busy || !teil.waschbar || teil.status === 'ausgesondert'}
                >
                  In die Wäsche geben
                </button>
              )}

              {aktion === 'waesche' && (
                <div className={styles.formGroup}>
                  {offeneChargen.length === 0 ? (
                    <p className={styles.soft}>Keine offene Charge – erst im Tab „Wäsche" eine anlegen.</p>
                  ) : (
                    <>
                      <label htmlFor="detail-charge">Charge</label>
                      <select id="detail-charge" value={chargeId} onChange={e => setChargeId(Number(e.target.value))}>
                        {offeneChargen.map(charge => (
                          <option key={charge.id} value={charge.id}>
                            {charge.nummer} · {ANLASS_TEXT[charge.anlass]}
                          </option>
                        ))}
                      </select>
                      <button
                        className={`${styles.btnSecondary} ${styles.btnBlock}`}
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => typeof chargeId === 'number' && void fuehreAus(() => legeInCharge(chargeId, teil.id))}
                        type="button"
                        disabled={busy}
                      >
                        Aufnehmen
                      </button>
                    </>
                  )}
                </div>
              )}

              <button
                className={`${styles.btnSecondary} ${styles.btnBlock}`}
                onClick={() => setAktion(aktion === 'ausgabe' ? null : 'ausgabe')}
                type="button"
                disabled={busy || teil.status === 'ausgesondert'}
              >
                Ausgeben / zurücknehmen
              </button>

              {aktion === 'ausgabe' && (
                <div className={styles.formGroup}>
                  <label htmlFor="detail-person">Träger</label>
                  <select
                    id="detail-person"
                    value={personId}
                    onChange={e => setPersonId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">Pool / kein fester Träger</option>
                    {personen.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                  <button
                    className={`${styles.btnSecondary} ${styles.btnBlock}`}
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => void fuehreAus(() => ausgeben(teil.id, typeof personId === 'number' ? personId : null))}
                    type="button"
                    disabled={busy}
                  >
                    Übernehmen
                  </button>
                </div>
              )}

              <button
                className={`${styles.btnSecondary} ${styles.btnBlock}`}
                onClick={() => setAktion(aktion === 'reparatur' ? null : 'reparatur')}
                type="button"
                disabled={busy || teil.status === 'ausgesondert'}
              >
                {teil.status === 'reparatur' ? 'Reparatur erledigt' : 'Reparatur melden'}
              </button>

              {aktion === 'reparatur' && (
                <div className={styles.formGroup}>
                  <label htmlFor="detail-reparatur">Was ist / war defekt?</label>
                  <input id="detail-reparatur" value={text} onChange={e => setText(e.target.value)} placeholder="Reißverschluss" />
                  <button
                    className={`${styles.btnSecondary} ${styles.btnBlock}`}
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => void fuehreAus(() => meldeReparatur(teil.id, text, teil.status === 'reparatur'))}
                    type="button"
                    disabled={busy || text.trim().length < 2}
                  >
                    Eintragen
                  </button>
                </div>
              )}

              <button
                className={`${styles.btnSecondary} ${styles.btnBlock}`}
                onClick={() => setAktion(aktion === 'pruefung' ? null : 'pruefung')}
                type="button"
                disabled={busy || teil.status === 'ausgesondert'}
              >
                Prüfung eintragen
              </button>

              {aktion === 'pruefung' && (
                <div className={styles.formGroup}>
                  <label htmlFor="detail-pruefung">Prüfdatum</label>
                  <input id="detail-pruefung" type="date" value={pruefDatum} onChange={e => setPruefDatum(e.target.value)} />
                  <input
                    style={{ marginTop: '0.5rem' }}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Bemerkung (optional)"
                    aria-label="Bemerkung zur Prüfung"
                  />
                  <button
                    className={`${styles.btnSecondary} ${styles.btnBlock}`}
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => void fuehreAus(() => eintragePruefung(teil.id, pruefDatum, text.trim() || null))}
                    type="button"
                    disabled={busy}
                  >
                    Eintragen
                  </button>
                </div>
              )}

              <button
                className={`${styles.btnSecondary} ${styles.btnBlock}`}
                onClick={() => setAktion(aktion === 'zaehler' ? null : 'zaehler')}
                type="button"
                disabled={busy || !teil.waschbar}
              >
                Waschzähler korrigieren
              </button>

              {aktion === 'zaehler' && (
                <div className={styles.formGroup}>
                  <label htmlFor="detail-zaehler">Neuer Stand</label>
                  <input
                    id="detail-zaehler"
                    type="number"
                    min={0}
                    max={999}
                    value={zaehlerWert}
                    onChange={e => setZaehlerWert(e.target.value)}
                  />
                  <input
                    style={{ marginTop: '0.5rem' }}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="Grund (optional)"
                    aria-label="Grund der Korrektur"
                  />
                  <button
                    className={`${styles.btnSecondary} ${styles.btnBlock}`}
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => void fuehreAus(() => setzeWaschzaehler(teil.id, Number(zaehlerWert), text.trim() || null))}
                    type="button"
                    disabled={busy}
                  >
                    Übernehmen
                  </button>
                </div>
              )}

              {teil.matrixCode && (
                <button
                  className={`${styles.btnSecondary} ${styles.btnBlock}`}
                  onClick={() => void fuehreAus(() => setMatrixCode(teil.id, null))}
                  type="button"
                  disabled={busy}
                >
                  Matrixcode entfernen
                </button>
              )}

              <button
                className={`${styles.btnSecondary} ${styles.btnBlock}`}
                onClick={() => onBearbeiten(teil)}
                type="button"
                disabled={busy}
              >
                Stammdaten ändern
              </button>

              {teil.status !== 'ausgesondert' && (
                <>
                  <button
                    className={`${styles.btnDanger} ${styles.btnBlock}`}
                    onClick={() => setAktion(aktion === 'aussondern' ? null : 'aussondern')}
                    type="button"
                    disabled={busy}
                  >
                    Aussondern
                  </button>

                  {aktion === 'aussondern' && (
                    <div className={styles.formGroup}>
                      <label htmlFor="detail-grund">Grund</label>
                      <input
                        id="detail-grund"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Waschgrenze erreicht"
                      />
                      <button
                        className={`${styles.btnDanger} ${styles.btnBlock}`}
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => void fuehreAus(() => aussondern(teil.id, text.trim() || null))}
                        type="button"
                        disabled={busy}
                      >
                        Endgültig aussondern
                      </button>
                    </div>
                  )}
                </>
              )}

              <button
                className={`${styles.btnDanger} ${styles.btnBlock}`}
                onClick={() => void loeschen()}
                type="button"
                disabled={busy}
              >
                Löschen
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
