import { useState } from 'react';
import { useKleidung } from '../../hooks/useKleidung';
import { useScanKopplung } from '../../hooks/useScanKopplung';
import { useScannen } from '../../hooks/useScannen';
import type { ChargeMitTeilen, PersonMitAusstattung, TeilMitDetails } from '../../types/kleidung';
import { UebersichtTab } from './tabs/UebersichtTab';
import { KleidungTab } from './tabs/KleidungTab';
import { ScanTab } from './tabs/ScanTab';
import { WaescheTab } from './tabs/WaescheTab';
import { PersonenTab } from './tabs/PersonenTab';
import { AuswertungTab } from './tabs/AuswertungTab';
import { TeilDialog } from './dialoge/TeilDialog';
import { TeilDetail } from './dialoge/TeilDetail';
import { PersonDialog } from './dialoge/PersonDialog';
import { TypenDialog } from './dialoge/TypenDialog';
import { ChargeDialog } from './dialoge/ChargeDialog';
import styles from './Kleidung.module.css';

type Tab = 'uebersicht' | 'kleidung' | 'scannen' | 'waesche' | 'personen' | 'auswertung';

const TABS: { id: Tab; label: string }[] = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'kleidung', label: 'Kleidung' },
  { id: 'scannen', label: 'Scannen' },
  { id: 'waesche', label: 'Wäsche' },
  { id: 'personen', label: 'Personen' },
  { id: 'auswertung', label: 'Auswertung' },
];

export const Kleidung: React.FC = () => {
  const daten = useKleidung();
  const [tab, setTab] = useState<Tab>('uebersicht');

  // Beides hängt an der Seite, nicht am Scan-Tab: ein Wechsel auf „Wäsche"
  // soll das gekoppelte Handy nicht abhängen – und die Einstellung, was ein
  // Scan auslöst, soll den Tabwechsel überleben.
  const scannen = useScannen(daten.neuLaden);
  const kopplung = useScanKopplung(scannen.verarbeite);

  const [teilDialog, setTeilDialog] = useState<{ teil: TeilMitDetails | null; nummer?: string } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [personDialog, setPersonDialog] = useState<{ person: PersonMitAusstattung | null } | null>(null);
  const [typenOffen, setTypenOffen] = useState(false);
  const [chargeDialog, setChargeDialog] = useState<{ charge: ChargeMitTeilen | null } | null>(null);

  const { uebersicht } = daten;

  if (daten.laden) {
    return (
      <div className={styles.page}>
        <div className={styles.ladeState}>
          <i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Lade Bestand …
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {daten.fehler && (
        <div className={styles.fehlerText} role="alert">{daten.fehler}</div>
      )}

      <nav className={styles.subTabs}>
        {TABS.map(eintrag => {
          const zahl = eintrag.id === 'kleidung'
            ? daten.teile.filter(t => t.status !== 'ausgesondert').length
            : eintrag.id === 'waesche'
              ? daten.teile.filter(t => t.status === 'waesche').length
              : null;
          const alarm = eintrag.id === 'waesche' && (zahl ?? 0) > 0;

          return (
            <button
              key={eintrag.id}
              className={`${styles.subTab} ${tab === eintrag.id ? styles.subTabActive : ''}`}
              onClick={() => setTab(eintrag.id)}
              type="button"
            >
              {eintrag.label}
              {zahl !== null && zahl > 0 && (
                <span className={`${styles.subTabCount} ${alarm ? styles.subTabCountAlert : ''}`}>{zahl}</span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === 'uebersicht' && uebersicht && (
        <UebersichtTab
          uebersicht={uebersicht}
          onTeil={setDetailId}
          onScannen={() => setTab('scannen')}
          onWaesche={() => setTab('waesche')}
        />
      )}

      {tab === 'kleidung' && (
        <KleidungTab
          teile={daten.teile}
          typen={daten.typen}
          onTeil={setDetailId}
          onNeu={() => setTeilDialog({ teil: null })}
          onTypen={() => setTypenOffen(true)}
        />
      )}

      {tab === 'scannen' && (
        <ScanTab
          chargen={daten.chargen}
          personen={daten.personen}
          teile={daten.teile}
          kopplung={kopplung}
          scannen={scannen}
          onAenderung={daten.neuLaden}
          onTeil={setDetailId}
          onNeueCharge={() => setChargeDialog({ charge: null })}
          onNeuesTeil={nummer => setTeilDialog({ teil: null, nummer })}
        />
      )}

      {tab === 'waesche' && (
        <WaescheTab
          chargen={daten.chargen}
          onAenderung={daten.neuLaden}
          onTeil={setDetailId}
          onNeueCharge={() => setChargeDialog({ charge: null })}
          onBearbeiten={charge => setChargeDialog({ charge })}
          onScannen={() => setTab('scannen')}
        />
      )}

      {tab === 'personen' && (
        <PersonenTab
          personen={daten.personen}
          onNeu={() => setPersonDialog({ person: null })}
          onBearbeiten={person => setPersonDialog({ person })}
          onTeil={setDetailId}
          onAenderung={daten.neuLaden}
        />
      )}

      {tab === 'auswertung' && <AuswertungTab />}

      {teilDialog && (
        <TeilDialog
          teil={teilDialog.teil}
          nummerVorgabe={teilDialog.nummer}
          typen={daten.typen}
          personen={daten.personen}
          onClose={() => setTeilDialog(null)}
          onGespeichert={async () => {
            setTeilDialog(null);
            await daten.neuLaden();
          }}
        />
      )}

      {detailId !== null && (
        <TeilDetail
          teilId={detailId}
          personen={daten.personen}
          chargen={daten.chargen}
          onClose={() => setDetailId(null)}
          onBearbeiten={teil => {
            setDetailId(null);
            setTeilDialog({ teil });
          }}
          onAenderung={daten.neuLaden}
        />
      )}

      {personDialog && (
        <PersonDialog
          person={personDialog.person}
          onClose={() => setPersonDialog(null)}
          onGespeichert={async () => {
            setPersonDialog(null);
            await daten.neuLaden();
          }}
        />
      )}

      {typenOffen && (
        <TypenDialog
          typen={daten.typen}
          onClose={() => setTypenOffen(false)}
          onAenderung={daten.neuLaden}
        />
      )}

      {chargeDialog && (
        <ChargeDialog
          charge={chargeDialog.charge}
          onClose={() => setChargeDialog(null)}
          onGespeichert={async () => {
            setChargeDialog(null);
            await daten.neuLaden();
          }}
        />
      )}
    </div>
  );
};
