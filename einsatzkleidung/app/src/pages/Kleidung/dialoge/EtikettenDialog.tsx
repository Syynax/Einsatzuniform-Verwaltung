import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import qrcode from 'qrcode-generator';
import type { TeilMitDetails } from '../../../types/kleidung';
import styles from '../Kleidung.module.css';

interface Props {
  teile: TeilMitDetails[];
  onClose: () => void;
}

/** Zeichen, die der Alphanumeric-Modus kann – damit wird der Code kleiner. */
const ALPHANUMERISCH = /^[0-9A-Z $%*+\-./:]*$/;

/**
 * QR-Code als SVG, in einem einzigen Pfad.
 *
 * Ein Rechteck je dunklem Modul wären bei 300 Etiketten schnell
 * hunderttausend Elemente. `shapeRendering="crispEdges"` verhindert, dass der
 * Drucker die Modulkanten weichzeichnet – ein weichgezeichneter QR-Code wird
 * von manchen Scannern nicht mehr gelesen.
 */
const QrCode: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const { pfad, module } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text, ALPHANUMERISCH.test(text) ? 'Alphanumeric' : 'Byte');
    qr.make();

    const anzahl = qr.getModuleCount();
    let d = '';
    for (let zeile = 0; zeile < anzahl; zeile++) {
      for (let spalte = 0; spalte < anzahl; spalte++) {
        if (qr.isDark(zeile, spalte)) d += `M${spalte},${zeile}h1v1h-1z`;
      }
    }
    return { pfad: d, module: anzahl };
  }, [text]);

  // Ein Modul Rand ringsum: Ohne Ruhezone findet der Scanner den Code nicht.
  const rand = 1;
  const kante = module + rand * 2;

  return (
    <svg
      className={className}
      viewBox={`${-rand} ${-rand} ${kante} ${kante}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR-Code ${text}`}
    >
      <rect x={-rand} y={-rand} width={kante} height={kante} fill="#ffffff" />
      <path d={pfad} fill="#000000" />
    </svg>
  );
};

export const EtikettenDialog: React.FC<Props> = ({ teile, onClose }) => {
  const [spalten, setSpalten] = useState(3);
  const [mitTraeger, setMitTraeger] = useState(true);
  const [nurOhneCode, setNurOhneCode] = useState(false);
  const [entfernt, setEntfernt] = useState<number[]>([]);

  const auswahl = useMemo(
    () => teile.filter(t =>
      t.status !== 'ausgesondert'
      && !entfernt.includes(t.id)
      && (!nurOhneCode || !t.matrixCode),
    ),
    [teile, entfernt, nurOhneCode],
  );

  const ohneCode = teile.filter(t => t.status !== 'ausgesondert' && !t.matrixCode).length;

  // Der Dialog hängt an `body` statt im App-Baum: Beim Drucken wird schlicht
  // `#root` ausgeblendet, und der Bogen bleibt als Einziges übrig. Innerhalb
  // des Baums müsste stattdessen jede Ebene einzeln versteckt werden – und der
  // Overlay ist `position: fixed` mit eigenem Scrollbereich, der den Bogen
  // nach der ersten Seite abschneiden würde.
  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={`${styles.modal} ${styles.modalGross}`} onClick={e => e.stopPropagation()}>
        <div className={styles.modalKopf}>
          <h2>Etiketten drucken</h2>
          <button className={styles.schliessen} onClick={onClose} type="button" aria-label="Schließen">
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div className={styles.hinweisBox}>
          <i className="fas fa-circle-info" aria-hidden="true"></i>
          <span>
            Der QR-Code enthält die aufgedruckte Nummer – nichts sonst. Damit liest der vorhandene
            Scanner ihn sofort, ohne dass etwas angelernt werden muss. Für Teile mit
            Hersteller-Matrixcode ändert sich nichts; beide Wege funktionieren weiter nebeneinander.
          </span>
        </div>

        <div className={styles.filterLeiste}>
          <span className={styles.label} style={{ marginRight: '0.25rem' }}>Pro Zeile</span>
          {[2, 3, 4, 5].map(anzahl => (
            <button
              key={anzahl}
              className={`${styles.chip} ${styles.chipKlein} ${spalten === anzahl ? styles.chipAktiv : ''}`}
              onClick={() => setSpalten(anzahl)}
              type="button"
            >
              {anzahl}
            </button>
          ))}

          <button
            className={`${styles.chip} ${styles.chipKlein} ${mitTraeger ? styles.chipAktiv : ''}`}
            onClick={() => setMitTraeger(!mitTraeger)}
            type="button"
          >
            Träger aufdrucken
          </button>
          <button
            className={`${styles.chip} ${styles.chipKlein} ${nurOhneCode ? styles.chipAktiv : ''}`}
            onClick={() => setNurOhneCode(!nurOhneCode)}
            type="button"
            title="Teile, die noch keinen Hersteller-Matrixcode haben"
          >
            nur ohne Code <span className={styles.num}>{ohneCode}</span>
          </button>
          {entfernt.length > 0 && (
            <button
              className={`${styles.chip} ${styles.chipKlein}`}
              onClick={() => setEntfernt([])}
              type="button"
            >
              {entfernt.length} wieder aufnehmen
            </button>
          )}
        </div>

        <p className={styles.soft}>
          {auswahl.length} {auswahl.length === 1 ? 'Etikett' : 'Etiketten'} auf dem Bogen.
          Ein Klick auf das ✕ nimmt eines heraus. Gedruckt wird genau das, was hier steht.
        </p>

        {auswahl.length === 0 ? (
          <div className={styles.emptyState}>
            <i className="fas fa-tag" aria-hidden="true"></i>
            <p>Kein Etikett ausgewählt.</p>
          </div>
        ) : (
          <div className={styles.bogenRahmen}>
            <div
              className={styles.etikettenBogen}
              style={{ gridTemplateColumns: `repeat(${spalten}, 1fr)` }}
            >
              {auswahl.map(teil => (
                <div key={teil.id} className={styles.etikett}>
                  <QrCode text={teil.nummer} className={styles.etikettQr} />
                  <div className={styles.etikettText}>
                    <div className={styles.etikettNummer}>{teil.nummer}</div>
                    <div className={styles.etikettZeile}>
                      {teil.typName}{teil.groesse ? ` · ${teil.groesse}` : ''}
                    </div>
                    {mitTraeger && (
                      <div className={styles.etikettZeile}>{teil.personName ?? 'Pool'}</div>
                    )}
                  </div>
                  <button
                    className={styles.etikettWeg}
                    onClick={() => setEntfernt([...entfernt, teil.id])}
                    type="button"
                    aria-label={`${teil.nummer} vom Bogen nehmen`}
                  >
                    <i className="fas fa-xmark" aria-hidden="true"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className={styles.formHinweis}>
          Vor dem Drucken im Dialog des Browsers <strong>Hintergrundgrafiken</strong> einschalten und
          die Skalierung auf 100 % stellen – sonst schrumpfen die Codes. Ein Probebogen auf Papier
          und ein Testscan lohnen sich, bevor teures Textiletikett durch den Drucker geht. Das
          Etikett muss Waschmaschine und Trockner überstehen: Thermotransfer- oder Textiletiketten
          nehmen, kein normales Papier.
        </p>

        <div className={styles.modalAktionen}>
          <button className={styles.btnSecondary} onClick={onClose} type="button">Schließen</button>
          <button
            className={styles.btnPrimary}
            onClick={() => window.print()}
            type="button"
            disabled={auswahl.length === 0}
          >
            <i className="fas fa-print" aria-hidden="true"></i> Drucken
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
