import { useState } from 'react';
import type { ChargeMitTeilen, WaescheAnlass } from '../../../types/kleidung';
import { createCharge, updateCharge } from '../../../services/api';
import { ANLAESSE, ANLASS_TEXT, WASCH_ORTE } from '../../../constants/kleidung';
import styles from '../Kleidung.module.css';

interface Props {
  charge: ChargeMitTeilen | null;
  onClose: () => void;
  onGespeichert: () => Promise<void>;
}

export const ChargeDialog: React.FC<Props> = ({ charge, onClose, onGespeichert }) => {
  const [anlass, setAnlass] = useState<WaescheAnlass>(charge?.anlass ?? 'atemschutz');
  const [ort, setOrt] = useState(charge?.ort ?? WASCH_ORTE[0]);
  const [notiz, setNotiz] = useState(charge?.notiz ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault();
    const daten = { anlass, ort: ort.trim(), notiz: notiz.trim() || null };

    setBusy(true);
    setFehler(null);
    try {
      if (charge) await updateCharge(charge.id, daten);
      else await createCharge(daten);
      await onGespeichert();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <form className={styles.modal} onClick={e => e.stopPropagation()} onSubmit={speichern}>
        <div className={styles.modalKopf}>
          <h2>{charge ? `Charge ${charge.nummer} ändern` : 'Wäsche-Charge anlegen'}</h2>
          <button className={styles.schliessen} onClick={onClose} type="button" aria-label="Schließen">
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {fehler && <div className={styles.fehlerText}>{fehler}</div>}

        <div className={styles.formGroup}>
          <label>Anlass</label>
          <div className={styles.filterLeiste} style={{ marginBottom: 0 }}>
            {ANLAESSE.map(eintrag => (
              <button
                key={eintrag}
                className={`${styles.chip} ${anlass === eintrag ? styles.chipAktiv : ''}`}
                onClick={() => setAnlass(eintrag)}
                type="button"
              >
                {ANLASS_TEXT[eintrag]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="charge-ort">Gewaschen bei *</label>
          <input
            id="charge-ort"
            list="wasch-orte"
            value={ort}
            onChange={e => setOrt(e.target.value)}
            required
          />
          <datalist id="wasch-orte">
            {WASCH_ORTE.map(eintrag => <option key={eintrag} value={eintrag} />)}
          </datalist>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="charge-notiz">Bemerkung</label>
          <textarea
            id="charge-notiz"
            rows={2}
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder="Einsatz vom 14.08., Kellerbrand"
          />
        </div>

        <p className={styles.formHinweis}>
          Die Waschzähler steigen erst, wenn die Charge zurückgemeldet wird – nicht beim Einsammeln.
        </p>

        <div className={styles.modalAktionen}>
          <button className={styles.btnSecondary} onClick={onClose} type="button">Abbrechen</button>
          <button className={styles.btnPrimary} type="submit" disabled={busy || ort.trim().length < 2}>
            {busy ? 'Speichert …' : charge ? 'Speichern' : 'Charge anlegen'}
          </button>
        </div>
      </form>
    </div>
  );
};
