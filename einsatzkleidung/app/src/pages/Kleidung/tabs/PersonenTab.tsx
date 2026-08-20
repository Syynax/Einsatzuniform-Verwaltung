import { useState } from 'react';
import type { PersonMitAusstattung } from '../../../types/kleidung';
import { deletePerson } from '../../../services/api';
import { monat } from '../../../constants/kleidung';
import { WaschBalken } from '../hilfen';
import styles from '../Kleidung.module.css';

interface Props {
  personen: PersonMitAusstattung[];
  onNeu: () => void;
  onImport: () => void;
  onBearbeiten: (person: PersonMitAusstattung) => void;
  onTeil: (id: number) => void;
  onAenderung: () => Promise<void>;
}

export const PersonenTab: React.FC<Props> = ({ personen, onNeu, onImport, onBearbeiten, onTeil, onAenderung }) => {
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const [nurAgt, setNurAgt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const liste = nurAgt ? personen.filter(p => p.atemschutz) : personen;
  const person = personen.find(p => p.id === gewaehlt) ?? liste[0] ?? null;

  const loeschen = async (id: number, name: string) => {
    if (!confirm(`${name} löschen? Ausgegebene Teile müssen vorher zurückgenommen sein.`)) return;
    setFehler(null);
    try {
      await deletePerson(id);
      setGewaehlt(null);
      await onAenderung();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <div className={styles.zweiSpalten}>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Einsatzkräfte</h3>
          <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
            <button
              className={`${styles.chip} ${styles.chipKlein} ${!nurAgt ? styles.chipAktiv : ''}`}
              onClick={() => setNurAgt(false)}
              type="button"
            >
              Alle <span className={styles.num}>{personen.length}</span>
            </button>
            <button
              className={`${styles.chip} ${styles.chipKlein} ${nurAgt ? styles.chipAktiv : ''}`}
              onClick={() => setNurAgt(true)}
              type="button"
            >
              Atemschutz <span className={styles.num}>{personen.filter(p => p.atemschutz).length}</span>
            </button>
            <button
              className={`${styles.chip} ${styles.chipKlein}`}
              onClick={onImport}
              type="button"
              title="Personen aus einer CSV-Datei übernehmen"
            >
              <i className="fas fa-file-csv" aria-hidden="true"></i> CSV
            </button>
            <button className={styles.btnPrimary} onClick={onNeu} type="button">
              <i className="fas fa-plus" aria-hidden="true"></i> Person
            </button>
          </span>
        </div>

        {fehler && <div className={styles.fehlerText}>{fehler}</div>}

        {liste.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fas fa-users" aria-hidden="true"></i>
            <p>Noch keine Personen angelegt.</p>
            <button className={styles.btnPrimary} onClick={onNeu} type="button">Erste Person anlegen</button>
            <button className={`${styles.chip} ${styles.chipKlein}`} onClick={onImport} type="button">
              <i className="fas fa-file-csv" aria-hidden="true"></i> Oder aus CSV übernehmen
            </button>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr><th>Name</th><th>Atemschutz</th><th>Teile</th><th>In Wäsche</th><th>Hinweis</th></tr>
              </thead>
              <tbody>
                {liste.map(eintrag => (
                  <tr
                    key={eintrag.id}
                    className={styles.klickbar}
                    onClick={() => setGewaehlt(eintrag.id)}
                  >
                    <td style={{ fontWeight: 600 }}>{eintrag.name}</td>
                    <td>
                      {eintrag.atemschutz ? (
                        <span className={`${styles.badge} ${styles.bStop}`}>
                          AGT{eintrag.tauglichBis ? ` bis ${monat(eintrag.tauglichBis)}` : ''}
                        </span>
                      ) : (
                        <span className={`${styles.badge} ${styles.bPool}`}>kein AGT</span>
                      )}
                    </td>
                    <td className={styles.num}>{eintrag.teile.length}</td>
                    <td className={styles.num}>{eintrag.inWaesche}</td>
                    <td>
                      {eintrag.hinweise.length > 0
                        ? <span className={`${styles.badge} ${styles.bWarn}`}>{eintrag.hinweise[0]}</span>
                        : <span className={styles.soft}>–</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {person && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div>
              <h3 className={styles.cardTitle}>{person.name}</h3>
              <div className={styles.soft}>
                {person.atemschutz
                  ? `Atemschutzgeräteträger${person.tauglichBis ? ` · Tauglichkeit bis ${monat(person.tauglichBis)}` : ''}`
                  : 'Kein Atemschutz'}
              </div>
              {person.notiz && <div className={styles.soft}>{person.notiz}</div>}
            </div>
            <span style={{ display: 'flex', gap: '0.375rem' }}>
              <button className={`${styles.chip} ${styles.chipKlein}`} onClick={() => onBearbeiten(person)} type="button">
                <i className="fas fa-pen" aria-hidden="true"></i> Ändern
              </button>
              <button
                className={`${styles.chip} ${styles.chipKlein}`}
                onClick={() => void loeschen(person.id, person.name)}
                type="button"
              >
                <i className="fas fa-trash" aria-hidden="true"></i>
              </button>
            </span>
          </div>

          {person.teile.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="fas fa-shirt" aria-hidden="true"></i>
              <p>Kein Teil zugeordnet.</p>
            </div>
          ) : (
            <div className={styles.ausstattung}>
              {person.teile.map(teil => (
                <button
                  key={teil.id}
                  className={styles.ausstattungZeile}
                  onClick={() => onTeil(teil.id)}
                  type="button"
                >
                  <span style={{ minWidth: 0 }}>
                    <span className={styles.mono} style={{ fontWeight: 700, fontSize: '0.875rem' }}>{teil.nummer}</span>
                    <span className={styles.soft} style={{ display: 'block' }}>
                      {teil.typName}{teil.groesse ? ` · Gr. ${teil.groesse}` : ''}
                      {teil.status === 'waesche' ? ' · in Wäsche' : ''}
                    </span>
                  </span>
                  <span style={{ minWidth: '7rem' }}><WaschBalken teil={teil} /></span>
                </button>
              ))}
            </div>
          )}

          {person.fehlend.length > 0 && (
            <>
              <h4 className={styles.label} style={{ marginTop: '1.25rem' }}>Fehlt in der Ausstattung</h4>
              <div className={styles.hinweisBox}>
                <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <span>{person.fehlend.join(', ')} – nicht zugeordnet.</span>
              </div>
            </>
          )}

          {person.hinweise.length > 1 && (
            <ul className={styles.soft} style={{ marginTop: '1rem', paddingLeft: '1.1rem' }}>
              {person.hinweise.map(hinweis => <li key={hinweis}>{hinweis}</li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};
