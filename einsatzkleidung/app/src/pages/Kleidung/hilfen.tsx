import type { ChargeStatus, TeilMitDetails } from '../../types/kleidung';
import { CHARGE_STATUS_TEXT, STATUS_TEXT } from '../../constants/kleidung';
import styles from './Kleidung.module.css';

/** Kleine Bausteine, die in mehreren Tabs gleich aussehen sollen. */

export const StatusBadge: React.FC<{ teil: TeilMitDetails }> = ({ teil }) => {
  const klasse = teil.status === 'dienst'
    ? styles.bOk
    : teil.status === 'waesche'
      ? styles.bWash
      : teil.status === 'reparatur'
        ? styles.bWarn
        : styles.bStop;

  return <span className={`${styles.badge} ${klasse}`}>{STATUS_TEXT[teil.status]}</span>;
};

export const ChargeBadge: React.FC<{ status: ChargeStatus }> = ({ status }) => {
  const klasse = status === 'erfasst' ? styles.bOk : status === 'unterwegs' ? styles.bWash : styles.bPool;
  return <span className={`${styles.badge} ${klasse}`}>{CHARGE_STATUS_TEXT[status]}</span>;
};

export const TraegerBadge: React.FC<{ teil: TeilMitDetails }> = ({ teil }) => {
  if (!teil.personName) return <span className={`${styles.badge} ${styles.bPool}`}>Pool</span>;
  return (
    <>
      {teil.personName}
      {teil.atemschutz && <span className={`${styles.badge} ${styles.bStop}`} style={{ marginLeft: '0.35rem' }}>AGT</span>}
    </>
  );
};

/** Waschzähler mit Balken. Teile ohne Zähler bekommen einen ehrlichen Hinweis. */
export const WaschBalken: React.FC<{ teil: TeilMitDetails; gross?: boolean }> = ({ teil, gross }) => {
  if (!teil.waschbar) {
    return (
      <div>
        <div className={styles.label}>Wäschen</div>
        <span className={styles.soft}>kein Waschzähler</span>
      </div>
    );
  }

  const grenze = teil.waschgrenze;
  const anteil = grenze ? Math.min(100, Math.round((teil.waschzaehler / grenze) * 100)) : 0;
  const fuellKlasse = teil.ampel === 'grenze'
    ? styles.washFillStop
    : teil.ampel === 'warnung' ? styles.washFillWarn : '';
  const zahlKlasse = teil.ampel === 'grenze' ? styles.stopText : teil.ampel === 'warnung' ? styles.warnText : '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
        <span className={styles.label}>Wäschen</span>
        <span className={`${styles.washZahl} ${zahlKlasse}`}>
          {teil.waschzaehler}{grenze !== null ? ` / ${grenze}` : ''}
        </span>
      </div>
      <span className={`${styles.washBar} ${gross ? styles.washBarGross : ''}`}>
        <span className={`${styles.washFill} ${fuellKlasse}`} style={{ width: `${anteil}%` }} />
      </span>
    </div>
  );
};

/** Randfarbe einer Teilekachel nach Dringlichkeit. */
export const kachelKlasse = (teil: TeilMitDetails): string => {
  if (teil.status === 'ausgesondert') return styles.teilCardAus;
  // Überfällig und nie eingetragen sind gleich ernst: In beiden Fällen ist am
  // Teil eine Prüfung offen.
  if (teil.ampel === 'grenze' || teil.pruefStatus === 'faellig' || teil.pruefStatus === 'nie') {
    return styles.teilCardStop;
  }
  if (teil.ampel === 'warnung' || teil.pruefStatus === 'bald' || teil.status === 'reparatur') {
    return styles.teilCardWarn;
  }
  return '';
};
