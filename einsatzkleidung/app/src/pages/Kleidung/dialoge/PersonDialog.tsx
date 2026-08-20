import { useState } from 'react';
import type { PersonMitAusstattung } from '../../../types/kleidung';
import { createPerson, updatePerson } from '../../../services/api';
import styles from '../Kleidung.module.css';

interface Props {
  person: PersonMitAusstattung | null;
  onClose: () => void;
  onGespeichert: () => Promise<void>;
}

export const PersonDialog: React.FC<Props> = ({ person, onClose, onGespeichert }) => {
  const [name, setName] = useState(person?.name ?? '');
  const [atemschutz, setAtemschutz] = useState(person?.atemschutz ?? false);
  const [tauglichBis, setTauglichBis] = useState(person?.tauglichBis ?? '');
  const [notiz, setNotiz] = useState(person?.notiz ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault();
    const daten = {
      name: name.trim(),
      atemschutz,
      tauglichBis: atemschutz && tauglichBis ? tauglichBis : null,
      notiz: notiz.trim() || null,
    };

    setBusy(true);
    setFehler(null);
    try {
      if (person) await updatePerson(person.id, daten);
      else await createPerson(daten);
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
          <h2>{person ? `${person.name} ändern` : 'Person anlegen'}</h2>
          <button className={styles.schliessen} onClick={onClose} type="button" aria-label="Schließen">
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {fehler && <div className={styles.fehlerText}>{fehler}</div>}

        <div className={styles.formGroup}>
          <label htmlFor="person-name">Name *</label>
          <input
            id="person-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nachname, Vorname"
            required
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="person-agt">
            <input
              id="person-agt"
              type="checkbox"
              checked={atemschutz}
              onChange={e => setAtemschutz(e.target.checked)}
            />
            Atemschutzgeräteträger
          </label>
          <p className={styles.formHinweis}>
            Bestimmt die Sollausstattung: Atemschutzträger brauchen zusätzlich Haube und Handschuhe.
          </p>
        </div>

        {atemschutz && (
          <div className={styles.formGroup}>
            <label htmlFor="person-tauglich">Tauglichkeit bis</label>
            <input
              id="person-tauglich"
              type="month"
              value={tauglichBis}
              onChange={e => setTauglichBis(e.target.value)}
            />
            <p className={styles.formHinweis}>Läuft der Termin ab, steht es als Hinweis bei der Person.</p>
          </div>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="person-notiz">Notiz</label>
          <textarea id="person-notiz" rows={2} value={notiz} onChange={e => setNotiz(e.target.value)} />
        </div>

        <div className={styles.modalAktionen}>
          <button className={styles.btnSecondary} onClick={onClose} type="button">Abbrechen</button>
          <button className={styles.btnPrimary} type="submit" disabled={busy || name.trim().length < 2}>
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  );
};
