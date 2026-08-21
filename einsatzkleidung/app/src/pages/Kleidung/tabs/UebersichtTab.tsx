import type { Uebersicht } from '../../../types/kleidung';
import { ANLASS_TEXT, VORGANG_ICON, VORGANG_TEXT, zeitpunkt } from '../../../constants/kleidung';
import { ChargeBadge, TraegerBadge } from '../hilfen';
import styles from '../Kleidung.module.css';

interface Props {
  uebersicht: Uebersicht;
  onTeil: (id: number) => void;
  onScannen: () => void;
  onWaesche: () => void;
}

export const UebersichtTab: React.FC<Props> = ({ uebersicht, onTeil, onScannen, onWaesche }) => {
  // Nie eingetragen zählt zu den fälligen: In beiden Fällen steht eine Prüfung
  // aus, und eine getrennte Kachel dafür würde die Zahl kleiner aussehen lassen,
  // als sie ist.
  const pruefungOffen = uebersicht.pruefungFaellig + uebersicht.pruefungNie;

  return (
  <>
    <div className={styles.statusBar}>
      <div className={styles.statusPill}>
        <i className="fas fa-shirt" aria-hidden="true"></i>
        <span className={styles.statusPillText}>
          <span className={styles.statusPillValue}>{uebersicht.teileGesamt}</span>
          <span className={styles.statusPillLabel}>Teile erfasst</span>
        </span>
      </div>
      <div className={styles.statusPill}>
        <i className="fas fa-soap" aria-hidden="true"></i>
        <span className={styles.statusPillText}>
          <span className={styles.statusPillValue}>{uebersicht.inWaesche}</span>
          <span className={styles.statusPillLabel}>in der Wäsche</span>
        </span>
      </div>
      <div className={`${styles.statusPill} ${uebersicht.waschgrenzeNah > 0 ? styles.statusPillWarn : ''}`}>
        <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <span className={styles.statusPillText}>
          <span className={styles.statusPillValue}>{uebersicht.waschgrenzeNah}</span>
          <span className={styles.statusPillLabel}>an der Waschgrenze</span>
        </span>
      </div>
      <div className={`${styles.statusPill} ${pruefungOffen > 0 ? styles.statusPillStop : ''}`}>
        <i className="fas fa-clipboard-check" aria-hidden="true"></i>
        <span className={styles.statusPillText}>
          <span className={styles.statusPillValue}>{pruefungOffen}</span>
          <span className={styles.statusPillLabel}>Prüfung fällig</span>
        </span>
      </div>
      <div className={`${styles.statusPill} ${uebersicht.pruefungBald > 0 ? styles.statusPillWarn : ''}`}>
        <i className="fas fa-calendar-day" aria-hidden="true"></i>
        <span className={styles.statusPillText}>
          <span className={styles.statusPillValue}>{uebersicht.pruefungBald}</span>
          <span className={styles.statusPillLabel}>Prüfung in 30 Tagen</span>
        </span>
      </div>
      <div className={styles.statusPill}>
        <i className="fas fa-box-archive" aria-hidden="true"></i>
        <span className={styles.statusPillText}>
          <span className={styles.statusPillValue}>{uebersicht.imPool}</span>
          <span className={styles.statusPillLabel}>im Pool</span>
        </span>
      </div>
    </div>

    {uebersicht.pruefungNie > 0 && (
      <div className={styles.hinweisBox}>
        <i className="fas fa-circle-info" aria-hidden="true"></i>
        <span>
          Bei {uebersicht.pruefungNie} {uebersicht.pruefungNie === 1 ? 'Teil steht' : 'Teilen steht'} noch
          keine Prüfung – sie zählen als fällig, bis eine eingetragen ist. Nach dem Umstieg von einer
          Papierliste ist das normal: Alte Prüftermine im Teil nachtragen, dann verschwindet der Hinweis.
        </span>
      </div>
    )}

    <div className={styles.zweiSpalten}>
      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Handlungsbedarf</h3>
          <span className={styles.soft}>
            {uebersicht.handlungsbedarfGesamt === 0
              ? 'nichts offen'
              : uebersicht.handlungsbedarfGesamt > uebersicht.handlungsbedarf.length
                ? `${uebersicht.handlungsbedarf.length} von ${uebersicht.handlungsbedarfGesamt} Teilen`
                : `${uebersicht.handlungsbedarfGesamt} Teile`}
          </span>
        </div>

        {uebersicht.handlungsbedarf.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fas fa-circle-check" aria-hidden="true"></i>
            <p>Alle Teile im grünen Bereich.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nummer</th><th>Teil</th><th>Träger</th><th>Wäschen</th><th>Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {uebersicht.handlungsbedarf.map(teil => (
                  <tr key={teil.id} className={styles.klickbar} onClick={() => onTeil(teil.id)}>
                    <td className={styles.mono}>{teil.nummer}</td>
                    <td>{teil.typName}</td>
                    <td><TraegerBadge teil={teil} /></td>
                    <td className={styles.num}>
                      {teil.waschbar ? `${teil.waschzaehler}${teil.waschgrenze !== null ? ` / ${teil.waschgrenze}` : ''}` : '–'}
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          teil.ampel === 'grenze' || teil.pruefStatus === 'faellig' || teil.pruefStatus === 'nie'
                            ? styles.bStop
                            : styles.bWarn
                        }`}
                      >
                        {teil.hinweise[0]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Wäsche unterwegs</h3>
          <span className={`${styles.badge} ${styles.bWash}`}>
            {uebersicht.offeneChargen.length} {uebersicht.offeneChargen.length === 1 ? 'Charge' : 'Chargen'}
          </span>
        </div>

        {uebersicht.offeneChargen.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fas fa-soap" aria-hidden="true"></i>
            <p>Keine offene Wäsche.</p>
          </div>
        ) : (
          <div className={styles.chargeListe}>
            {uebersicht.offeneChargen.map(charge => (
              <button key={charge.id} className={styles.chargeEintrag} onClick={onWaesche} type="button">
                <span className={styles.chargeKopf}>
                  Charge {charge.nummer}
                  <ChargeBadge status={charge.status} />
                </span>
                <span className={styles.soft}>
                  {charge.ort} · {charge.teile.length} {charge.teile.length === 1 ? 'Teil' : 'Teile'}
                </span>
                <span className={styles.soft}>Anlass: {ANLASS_TEXT[charge.anlass]}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button className={styles.btnPrimary} onClick={onScannen} type="button">
            <i className="fas fa-barcode" aria-hidden="true"></i> Teile scannen
          </button>
          <button className={styles.btnSecondary} onClick={onWaesche} type="button">Wäsche</button>
        </div>
      </section>
    </div>

    <section className={styles.card}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>Letzte Vorgänge</h3>
      </div>

      {uebersicht.letzteVorgaenge.length === 0 ? (
        <div className={styles.emptyState}>
          <i className="fas fa-clock-rotate-left" aria-hidden="true"></i>
          <p>Noch nichts passiert. Erst Teile anlegen, dann scannen.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr><th>Zeitpunkt</th><th>Nummer</th><th>Teil</th><th>Vorgang</th><th>Person</th><th>Wäschen</th></tr>
            </thead>
            <tbody>
              {uebersicht.letzteVorgaenge.map(vorgang => (
                <tr key={vorgang.id} className={styles.klickbar} onClick={() => onTeil(vorgang.teilId)}>
                  <td className={styles.num}>{zeitpunkt(vorgang.zeit)}</td>
                  <td className={styles.mono}>{vorgang.nummer}</td>
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
