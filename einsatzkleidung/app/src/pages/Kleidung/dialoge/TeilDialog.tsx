import { useState } from 'react';
import type { PersonMitAusstattung, TeilFormData, TeilMitDetails, Teiletyp } from '../../../types/kleidung';
import { createTeil, updateTeil } from '../../../services/api';
import { IDENT_HINWEIS, NUMMER_HINWEIS, NUMMER_MUSTER, formatiereNummer } from '../../../constants/kleidung';
import styles from '../Kleidung.module.css';

/**
 * Vorbelegung für ein neues Teil. Jedes Feld ist einzeln optional: Aus einem
 * Scan kommt mal die Nummer, mal der Matrixcode, mal beides und dazu, was sich
 * aus dem Herstellercode lesen liess.
 */
export interface TeilVorgabe {
  nummer?: string;
  matrixCode?: string;
  groesse?: string;
  hersteller?: string;
  beschaffung?: string;
}

interface Props {
  teil: TeilMitDetails | null;
  /** Vorbelegung – kommt aus einem Scan, zu dem es noch kein Teil gibt. */
  vorgabe?: TeilVorgabe;
  typen: Teiletyp[];
  personen: PersonMitAusstattung[];
  onClose: () => void;
  onGespeichert: () => Promise<void>;
}

export const TeilDialog: React.FC<Props> = ({ teil, vorgabe, typen, personen, onClose, onGespeichert }) => {
  // Beim Bearbeiten gewinnen die Werte des Teils immer – auch dort, wo sie
  // leer sind. Ein Vorschlag aus einem Scan darf ein bewusst leer gelassenes
  // Feld eines vorhandenen Teils nicht hinterrücks wieder füllen.
  const vor = teil ? undefined : vorgabe;

  const [nummer, setNummer] = useState(teil?.nummer ?? vor?.nummer ?? '');
  const [typId, setTypId] = useState<number | ''>(teil?.typId ?? (typen[0]?.id ?? ''));
  const [groesse, setGroesse] = useState(teil?.groesse ?? vor?.groesse ?? '');
  const [hersteller, setHersteller] = useState(teil?.hersteller ?? vor?.hersteller ?? '');
  const [beschaffung, setBeschaffung] = useState(teil?.beschaffung ?? vor?.beschaffung ?? '');
  const [personId, setPersonId] = useState<number | ''>(teil?.personId ?? '');
  const [standort, setStandort] = useState(teil?.standort ?? '');
  const [waschzaehler, setWaschzaehler] = useState(String(teil?.waschzaehler ?? 0));
  const [letztePruefung, setLetztePruefung] = useState(teil?.letztePruefung ?? '');
  const [matrixCode, setMatrixCode] = useState(teil?.matrixCode ?? vor?.matrixCode ?? '');
  const [notiz, setNotiz] = useState(teil?.notiz ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gewaehlterTyp = typen.find(t => t.id === typId) ?? null;

  const speichern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof typId !== 'number') {
      setFehler('Bitte einen Teiletyp wählen.');
      return;
    }
    // Eine Nummer, die dasteht, muss stimmen – eine, die fehlt, ist erlaubt.
    // Das ist der ganze Unterschied zu früher: Beanstandet wird nur noch die
    // unlesbare Nummer, nicht mehr die fehlende.
    const gesetzteNummer = nummer.trim() || null;
    if (gesetzteNummer !== null && !NUMMER_MUSTER.test(gesetzteNummer)) {
      setFehler(`Die Nummer muss dem Muster ${NUMMER_HINWEIS} folgen.`);
      return;
    }

    // Dieselbe Regel, die der Server durchsetzt – hier nur früher, damit der
    // Dialog nicht erst über eine abgewiesene Anfrage antwortet.
    const gesetzterCode = matrixCode.trim() || null;
    if (gesetzteNummer === null && gesetzterCode === null) {
      setFehler(IDENT_HINWEIS);
      return;
    }

    const daten: TeilFormData = {
      nummer: gesetzteNummer,
      matrixCode: gesetzterCode,
      typId,
      groesse: groesse.trim() || null,
      hersteller: hersteller.trim() || null,
      beschaffung: beschaffung || null,
      personId: typeof personId === 'number' ? personId : null,
      standort: standort.trim() || null,
      waschzaehler: Number(waschzaehler) || 0,
      letztePruefung: letztePruefung || null,
      notiz: notiz.trim() || null,
    };

    setBusy(true);
    setFehler(null);
    try {
      if (teil) await updateTeil(teil.id, daten);
      else await createTeil(daten);
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
          <h2>{teil ? `Teil ${teil.bezeichnung} ändern` : 'Kleidungsstück anlegen'}</h2>
          <button className={styles.schliessen} onClick={onClose} type="button" aria-label="Schließen">
            <i className="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {fehler && <div className={styles.fehlerText}>{fehler}</div>}

        {typen.length === 0 && (
          <div className={styles.hinweisBox} style={{ marginBottom: '1rem' }}>
            <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
            <span>Es ist kein Teiletyp angelegt. Erst unter „Typen" einen anlegen.</span>
          </div>
        )}

        <div className={styles.formReihe}>
          <div className={styles.formGroup}>
            <label htmlFor="teil-nummer">Nummer</label>
            <input
              id="teil-nummer"
              value={nummer}
              onChange={e => setNummer(formatiereNummer(e.target.value))}
              placeholder="1042-07/19"
              autoFocus
            />
            <p className={styles.formHinweis}>
              Die aufgedruckte Nummer, Muster {NUMMER_HINWEIS}. Sie darf mehrfach vorkommen –
              steht auf dem Etikett die Nummer der Lieferung, unterscheiden Typ und Träger die Teile.
              Trägt das Teil keine, bleibt das Feld leer und der Matrixcode weiter unten führt es.
            </p>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="teil-typ">Teiletyp *</label>
            <select id="teil-typ" value={typId} onChange={e => setTypId(Number(e.target.value))} required>
              {typen.map(typ => <option key={typ.id} value={typ.id}>{typ.name}</option>)}
            </select>
          </div>
        </div>

        <div className={styles.formReiheDrei}>
          <div className={styles.formGroup}>
            <label htmlFor="teil-groesse">Größe</label>
            <input id="teil-groesse" value={groesse} onChange={e => setGroesse(e.target.value)} placeholder="52" />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="teil-hersteller">Hersteller</label>
            <input id="teil-hersteller" value={hersteller} onChange={e => setHersteller(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="teil-beschaffung">Beschaffung</label>
            <input id="teil-beschaffung" type="month" value={beschaffung} onChange={e => setBeschaffung(e.target.value)} />
          </div>
        </div>

        <div className={styles.formReihe}>
          <div className={styles.formGroup}>
            <label htmlFor="teil-person">Träger</label>
            <select
              id="teil-person"
              value={personId}
              onChange={e => setPersonId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Pool / kein fester Träger</option>
              {personen.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="teil-standort">Standort</label>
            <input id="teil-standort" value={standort} onChange={e => setStandort(e.target.value)} placeholder="Spind 14" />
          </div>
        </div>

        <div className={styles.formReihe}>
          <div className={styles.formGroup}>
            <label htmlFor="teil-zaehler">Waschzähler</label>
            <input
              id="teil-zaehler"
              type="number"
              min={0}
              max={999}
              value={waschzaehler}
              onChange={e => setWaschzaehler(e.target.value)}
              disabled={gewaehlterTyp !== null && !gewaehlterTyp.waschbar}
            />
            <p className={styles.formHinweis}>
              {gewaehlterTyp && !gewaehlterTyp.waschbar
                ? 'Dieser Typ führt keinen Waschzähler.'
                : 'Beim Umstieg von der Papierliste den bisherigen Stand eintragen.'}
            </p>
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="teil-pruefung">Letzte Prüfung</label>
            <input id="teil-pruefung" type="date" value={letztePruefung} onChange={e => setLetztePruefung(e.target.value)} />
            <p className={styles.formHinweis}>
              {gewaehlterTyp?.pruefIntervallMonate
                ? `Nächster Termin wird daraus berechnet (+${gewaehlterTyp.pruefIntervallMonate} Monate).`
                : 'Für diesen Typ ist keine wiederkehrende Prüfung hinterlegt.'}
            </p>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="teil-matrix">Matrixcode</label>
          <input
            id="teil-matrix"
            value={matrixCode}
            onChange={e => setMatrixCode(e.target.value)}
            placeholder="wird beim Scannen angelernt"
          />
          <p className={styles.formHinweis}>
            Roher Inhalt des Codes am Etikett. Für die Zuordnung zählt er als Ganzes; beim Anlegen aus
            einem Scan werden Größe, Hersteller und Herstellmonat daraus vorgeschlagen, soweit sie
            erkennbar sind. Vorgeschlagene Felder lassen sich hier überschreiben.
          </p>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="teil-notiz">Notiz</label>
          <textarea id="teil-notiz" rows={2} value={notiz} onChange={e => setNotiz(e.target.value)} />
        </div>

        <div className={styles.modalAktionen}>
          <button className={styles.btnSecondary} onClick={onClose} type="button">Abbrechen</button>
          <button className={styles.btnPrimary} type="submit" disabled={busy || typen.length === 0}>
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      </form>
    </div>
  );
};
