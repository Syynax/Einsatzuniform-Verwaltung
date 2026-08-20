import { useState } from 'react';
import type { TeileKategorie, Teiletyp, TeiletypFormData } from '../../../types/kleidung';
import { createTyp, deleteTyp, updateTyp } from '../../../services/api';
import { KATEGORIEN, KATEGORIE_TEXT } from '../../../constants/kleidung';
import styles from '../Kleidung.module.css';

interface Props {
  typen: Teiletyp[];
  onClose: () => void;
  onAenderung: () => Promise<void>;
}

const LEER: TeiletypFormData = {
  name: '',
  kategorie: 'einsatzkleidung',
  waschbar: true,
  waschgrenze: 50,
  warnschwelle: null,
  pruefIntervallMonate: 12,
};

export const TypenDialog: React.FC<Props> = ({ typen, onClose, onAenderung }) => {
  const [bearbeitet, setBearbeitet] = useState<number | 'neu' | null>(null);
  const [form, setForm] = useState<TeiletypFormData>(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const starteNeu = () => {
    setForm(LEER);
    setBearbeitet('neu');
    setFehler(null);
  };

  const starteBearbeiten = (typ: Teiletyp) => {
    setForm({
      name: typ.name,
      kategorie: typ.kategorie,
      waschbar: typ.waschbar,
      waschgrenze: typ.waschgrenze,
      warnschwelle: typ.warnschwelle,
      pruefIntervallMonate: typ.pruefIntervallMonate,
    });
    setBearbeitet(typ.id);
    setFehler(null);
  };

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFehler(null);
    try {
      if (bearbeitet === 'neu') await createTyp(form);
      else if (typeof bearbeitet === 'number') await updateTyp(bearbeitet, form);
      setBearbeitet(null);
      await onAenderung();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const loeschen = async (typ: Teiletyp) => {
    if (!confirm(`Teiletyp "${typ.name}" löschen?`)) return;
    setBusy(true);
    setFehler(null);
    try {
      await deleteTyp(typ.id);
      await onAenderung();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalGross}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalKopf}>
          <div>
            <h2>Teiletypen</h2>
            <p className={styles.soft} style={{ margin: '0.25rem 0 0' }}>
              Höchstzahl und Prüfintervall gelten für alle Teile dieses Typs.
            </p>
          </div>
          <button className={styles.schliessen} onClick={onClose} type="button" aria-label="Schließen">
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {fehler && <div className={styles.fehlerText}>{fehler}</div>}

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr><th>Typ</th><th>Kategorie</th><th>Höchstzahl</th><th>Warnung ab</th><th>Prüfung</th><th>Teile</th><th></th></tr>
            </thead>
            <tbody>
              {typen.map(typ => (
                <tr key={typ.id}>
                  <td style={{ fontWeight: 600 }}>{typ.name}</td>
                  <td className={styles.soft}>{KATEGORIE_TEXT[typ.kategorie]}</td>
                  <td className={styles.num}>{typ.waschbar ? (typ.waschgrenze ?? 'ohne') : '–'}</td>
                  <td className={styles.num}>
                    {typ.waschbar
                      ? typ.warnschwelle ?? (typ.waschgrenze ? `${Math.ceil(typ.waschgrenze * 0.8)} (80 %)` : '–')
                      : '–'}
                  </td>
                  <td className={styles.num}>
                    {typ.pruefIntervallMonate ? `alle ${typ.pruefIntervallMonate} Mon.` : '–'}
                  </td>
                  <td className={styles.num}>{typ.anzahlTeile ?? 0}</td>
                  <td className={styles.rechts}>
                    <button
                      className={`${styles.chip} ${styles.chipKlein}`}
                      onClick={() => starteBearbeiten(typ)}
                      type="button"
                      disabled={busy}
                    >
                      <i className="fas fa-pen" aria-hidden="true"></i>
                    </button>{' '}
                    <button
                      className={`${styles.chip} ${styles.chipKlein}`}
                      onClick={() => void loeschen(typ)}
                      type="button"
                      disabled={busy || (typ.anzahlTeile ?? 0) > 0}
                      title={(typ.anzahlTeile ?? 0) > 0 ? 'Es hängen noch Teile an diesem Typ' : 'Löschen'}
                    >
                      <i className="fas fa-trash" aria-hidden="true"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {bearbeitet === null ? (
          <div className={styles.modalAktionen}>
            <button className={styles.btnSecondary} onClick={onClose} type="button">Schließen</button>
            <button className={styles.btnPrimary} onClick={starteNeu} type="button">
              <i className="fas fa-plus" aria-hidden="true"></i> Typ anlegen
            </button>
          </div>
        ) : (
          <form onSubmit={speichern} style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
            <div className={styles.formReihe}>
              <div className={styles.formGroup}>
                <label htmlFor="typ-name">Name *</label>
                <input
                  id="typ-name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Überjacke HuPF Teil 1"
                  required
                  autoFocus
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="typ-kategorie">Kategorie</label>
                <select
                  id="typ-kategorie"
                  value={form.kategorie}
                  onChange={e => setForm({ ...form, kategorie: e.target.value as TeileKategorie })}
                >
                  {KATEGORIEN.map(kategorie => (
                    <option key={kategorie} value={kategorie}>{KATEGORIE_TEXT[kategorie]}</option>
                  ))}
                </select>
                <p className={styles.formHinweis}>
                  „Atemschutz-Zubehör" zählt nur bei Atemschutzträgern zur Sollausstattung.
                </p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="typ-waschbar">
                <input
                  id="typ-waschbar"
                  type="checkbox"
                  checked={form.waschbar}
                  onChange={e => setForm({ ...form, waschbar: e.target.checked })}
                />
                Wird gewaschen (Waschzähler führen)
              </label>
            </div>

            <div className={styles.formReiheDrei}>
              <div className={styles.formGroup}>
                <label htmlFor="typ-grenze">Höchstzahl Wäschen</label>
                <input
                  id="typ-grenze"
                  type="number"
                  min={1}
                  max={500}
                  value={form.waschgrenze ?? ''}
                  onChange={e => setForm({ ...form, waschgrenze: e.target.value ? Number(e.target.value) : null })}
                  disabled={!form.waschbar}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="typ-warn">Warnung ab</label>
                <input
                  id="typ-warn"
                  type="number"
                  min={1}
                  max={500}
                  value={form.warnschwelle ?? ''}
                  onChange={e => setForm({ ...form, warnschwelle: e.target.value ? Number(e.target.value) : null })}
                  disabled={!form.waschbar}
                  placeholder="80 % der Höchstzahl"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="typ-pruefung">Prüfintervall (Monate)</label>
                <input
                  id="typ-pruefung"
                  type="number"
                  min={1}
                  max={120}
                  value={form.pruefIntervallMonate ?? ''}
                  onChange={e => setForm({ ...form, pruefIntervallMonate: e.target.value ? Number(e.target.value) : null })}
                  placeholder="keine"
                />
              </div>
            </div>

            <div className={styles.modalAktionen}>
              <button className={styles.btnSecondary} onClick={() => setBearbeitet(null)} type="button">Abbrechen</button>
              <button className={styles.btnPrimary} type="submit" disabled={busy || form.name.trim().length < 2}>
                {busy ? 'Speichert …' : 'Speichern'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
