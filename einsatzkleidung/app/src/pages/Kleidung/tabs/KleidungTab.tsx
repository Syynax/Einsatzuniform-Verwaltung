import { useMemo, useState } from 'react';
import type { TeilMitDetails, TeilStatus, Teiletyp } from '../../../types/kleidung';
import { STATUS_TEXT, datum, monat } from '../../../constants/kleidung';
import { StatusBadge, TraegerBadge, WaschBalken, kachelKlasse } from '../hilfen';
import styles from '../Kleidung.module.css';

interface Props {
  teile: TeilMitDetails[];
  typen: Teiletyp[];
  onTeil: (id: number) => void;
  onNeu: () => void;
  onTypen: () => void;
  onImport: () => void;
}

const STATUS_FILTER: (TeilStatus | 'alle')[] = ['alle', 'dienst', 'waesche', 'reparatur', 'ausgesondert'];

export const KleidungTab: React.FC<Props> = ({ teile, typen, onTeil, onNeu, onTypen, onImport }) => {
  const [typFilter, setTypFilter] = useState<number | 'alle'>('alle');
  const [statusFilter, setStatusFilter] = useState<TeilStatus | 'alle'>('alle');
  const [nurOhneCode, setNurOhneCode] = useState(false);
  const [suche, setSuche] = useState('');

  const gefiltert = useMemo(() => {
    const begriff = suche.trim().toLowerCase();
    return teile.filter(teil => {
      if (typFilter !== 'alle' && teil.typId !== typFilter) return false;
      // Ausgesonderte sind Archiv – sie tauchen nur auf, wenn man sie sucht.
      if (statusFilter === 'alle' ? teil.status === 'ausgesondert' : teil.status !== statusFilter) return false;
      if (nurOhneCode && teil.matrixCode) return false;
      if (!begriff) return true;
      return teil.nummer.toLowerCase().includes(begriff)
        || teil.typName.toLowerCase().includes(begriff)
        || (teil.personName?.toLowerCase().includes(begriff) ?? false)
        || (teil.groesse?.toLowerCase().includes(begriff) ?? false);
    });
  }, [teile, typFilter, statusFilter, nurOhneCode, suche]);

  const anzahlJeTyp = useMemo(() => {
    const zaehler = new Map<number, number>();
    for (const teil of teile) {
      if (teil.status === 'ausgesondert') continue;
      zaehler.set(teil.typId, (zaehler.get(teil.typId) ?? 0) + 1);
    }
    return zaehler;
  }, [teile]);

  return (
    <>
      <div className={styles.filterLeiste}>
        <button
          className={`${styles.chip} ${typFilter === 'alle' ? styles.chipAktiv : ''}`}
          onClick={() => setTypFilter('alle')}
          type="button"
        >
          Alle <span className={styles.num}>{teile.filter(t => t.status !== 'ausgesondert').length}</span>
        </button>
        {typen.filter(typ => (anzahlJeTyp.get(typ.id) ?? 0) > 0).map(typ => (
          <button
            key={typ.id}
            className={`${styles.chip} ${typFilter === typ.id ? styles.chipAktiv : ''}`}
            onClick={() => setTypFilter(typ.id)}
            type="button"
          >
            {typ.name} <span className={styles.num}>{anzahlJeTyp.get(typ.id)}</span>
          </button>
        ))}

        <span className={styles.rasterEnde}>
          <input
            className={styles.suche}
            type="search"
            value={suche}
            onChange={e => setSuche(e.target.value)}
            placeholder="Nummer, Träger oder Typ"
            aria-label="Kleidungsstücke durchsuchen"
          />
          <button
            className={styles.btnSecondary}
            onClick={onImport}
            type="button"
            title="Kleidungsstücke aus einer CSV-Datei übernehmen"
          >
            <i className="fas fa-file-csv" aria-hidden="true"></i> CSV
          </button>
          <button className={styles.btnSecondary} onClick={onTypen} type="button">
            <i className="fas fa-sliders" aria-hidden="true"></i> Typen
          </button>
          <button className={styles.btnPrimary} onClick={onNeu} type="button">
            <i className="fas fa-plus" aria-hidden="true"></i> Teil anlegen
          </button>
        </span>
      </div>

      <div className={styles.filterLeiste}>
        <span className={styles.label} style={{ marginRight: '0.25rem' }}>Status</span>
        {STATUS_FILTER.map(status => (
          <button
            key={status}
            className={`${styles.chip} ${styles.chipKlein} ${statusFilter === status ? styles.chipAktiv : ''}`}
            onClick={() => setStatusFilter(status)}
            type="button"
          >
            {status === 'alle' ? 'Alle' : STATUS_TEXT[status]}
          </button>
        ))}
        <button
          className={`${styles.chip} ${styles.chipKlein} ${nurOhneCode ? styles.chipAktiv : ''}`}
          onClick={() => setNurOhneCode(v => !v)}
          type="button"
        >
          ohne Matrixcode
        </button>
      </div>

      {gefiltert.length === 0 ? (
        <div className={`${styles.card} ${styles.emptyState}`}>
          <i className="fas fa-shirt" aria-hidden="true"></i>
          <p>
            {teile.length === 0
              ? 'Noch kein Kleidungsstück erfasst.'
              : 'Kein Teil passt zu dieser Auswahl.'}
          </p>
          {teile.length === 0 && (
            <button className={styles.btnPrimary} onClick={onNeu} type="button">Erstes Teil anlegen</button>
          )}
        </div>
      ) : (
        <div className={styles.teileGrid}>
          {gefiltert.map(teil => (
            <button
              key={teil.id}
              className={`${styles.teilCard} ${kachelKlasse(teil)}`}
              onClick={() => onTeil(teil.id)}
              type="button"
            >
              <div className={styles.teilKopf}>
                <div>
                  <div className={styles.teilNummer}>{teil.nummer}</div>
                  <div className={styles.soft}>
                    {teil.typName}{teil.groesse ? ` · Gr. ${teil.groesse}` : ''}
                  </div>
                </div>
                <StatusBadge teil={teil} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                <i className="fas fa-user" aria-hidden="true" style={{ opacity: 0.6 }}></i>
                <TraegerBadge teil={teil} />
              </div>

              <WaschBalken teil={teil} />

              <div className={styles.teilFuss}>
                <span className={styles.soft}>
                  {teil.chargeNummer
                    ? `Charge ${teil.chargeNummer}`
                    : teil.pruefStatus === 'nie'
                      ? 'Prüfung nie eingetragen'
                      : teil.naechstePruefung
                        ? `Prüfung ${datum(teil.naechstePruefung)}`
                        : teil.beschaffung
                          ? `Beschafft ${monat(teil.beschaffung)}`
                          : 'Keine Frist hinterlegt'}
                </span>
                {!teil.matrixCode && (
                  <span className={`${styles.badge} ${styles.bPool}`}>
                    <i className="fas fa-qrcode" aria-hidden="true"></i> kein Code
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
};
