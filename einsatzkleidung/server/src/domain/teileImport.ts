/**
 * Kleidungsstücke aus einer CSV übernehmen.
 *
 * Gleicher Zuschnitt wie der Personenimport: erst prüfen, dann übernehmen,
 * beides durch dieselbe Analyse.
 *
 * Wiedererkannt wird ein Teil auf zwei Wegen. Der bessere ist der Matrixcode:
 * Er ist bestandsweit eindeutig und benennt damit genau ein Stück. Nur wo er
 * fehlt, greift der alte Weg über Nummer, Typ und Träger zusammen – der darf
 * mehrdeutig sein und endet dann in „bitte im Dialog ändern".
 *
 * Typ und Träger werden über ihren Namen aufgelöst und niemals still angelegt.
 * Ein Tippfehler in der Typspalte soll eine Fehlerzeile ergeben und keinen
 * neuen Teiletyp „Überjacke HuPF Teil1" neben dem richtigen.
 */

import type { Kleidungsstueck, Person, Teiletyp } from '../types/kleidung';
import { parseCsv } from '../utils/csv';
import { datumAus, monatAus, namensSchluessel, zahlAus } from '../utils/eingaben';
import {
  IDENT_HINWEIS,
  istIdentifizierbar,
  naechstePruefungAus,
  normalisiereMatrixCode,
  normalisiereNummer,
  teilBezeichnung,
} from './kleidung';

export type TeileImportModus = 'ueberspringen' | 'aktualisieren';

export type TeilImportBefund = 'neu' | 'aktualisiert' | 'unveraendert' | 'uebersprungen' | 'fehler';

/** Nur die Felder, die in der Datei stehen. Fehlende bleiben unangetastet. */
export interface TeilWerte {
  /**
   * Die gelesene Nummer, oder null, wenn die Zeile keine nennt. Null heisst
   * hier „weiss ich nicht", nicht „hat keine" – siehe `aktualisiereTeil`.
   */
  nummer: string | null;
  typId: number;
  matrixCode?: string | null;
  groesse?: string | null;
  hersteller?: string | null;
  beschaffung?: string | null;
  personId?: number | null;
  standort?: string | null;
  waschzaehler?: number;
  letztePruefung?: string | null;
  letzteWaesche?: string | null;
  notiz?: string | null;
}

export interface TeilImportZeile {
  zeile: number;
  /** Die Nummer, wie sie in der Datei steht – auch wenn sie unbrauchbar ist. */
  nummer: string;
  typName: string | null;
  personName: string | null;
  befund: TeilImportBefund;
  meldung: string | null;
  teilId: number | null;
  werte: TeilWerte | null;
}

export interface TeileImportBericht {
  problem: string | null;
  trenner: string;
  spalten: string[];
  zuordnung: Record<string, string>;
  zeilen: TeilImportZeile[];
  neu: number;
  aktualisiert: number;
  unveraendert: number;
  uebersprungen: number;
  fehler: number;
}

const ALIASSE = {
  nummer: ['nummer', 'nr', 'teilnummer', 'kleidungsnummer', 'inventarnummer', 'kennzeichnung'],
  typ: ['typ', 'teiletyp', 'art', 'kleidungsstueck', 'bezeichnung', 'kategorie'],
  groesse: ['groesse', 'gr', 'konfektionsgroesse', 'size'],
  traeger: ['traeger', 'person', 'name', 'zugeordnet', 'besitzer', 'einsatzkraft', 'zugeordnetan'],
  hersteller: ['hersteller', 'marke', 'fabrikat'],
  beschaffung: ['beschaffung', 'beschafft', 'anschaffung', 'kaufdatum', 'angeschafft'],
  standort: ['standort', 'ort', 'spind', 'lagerort', 'platz', 'ablage'],
  waschzaehler: ['waschzaehler', 'waschzyklen', 'waeschen', 'waschungen', 'zaehler', 'anzahlwaeschen'],
  letztePruefung: ['letztepruefung', 'pruefung', 'geprueftam', 'pruefdatum', 'letztepruefungam'],
  letzteWaesche: ['letztewaesche', 'gewaschenam', 'waeschedatum', 'letztegewaschen'],
  matrixCode: ['matrixcode', 'code', 'barcode', 'qrcode', 'etikett', 'etikettcode'],
  notiz: ['notiz', 'bemerkung', 'bemerkungen', 'hinweis', 'kommentar'],
} as const;

type Feld = keyof typeof ALIASSE;

function findeSpalte(spalten: string[], feld: Feld): string | null {
  for (const alias of ALIASSE[feld]) {
    if (spalten.includes(alias)) return alias;
  }
  return null;
}

/**
 * Vergleich für Typnamen: „Überjacke HuPF Teil 1" soll auch als
 * „ueberjacke hupf teil1" gefunden werden.
 */
/**
 * Der Rückfall-Schlüssel, wenn kein Matrixcode da ist. Die Nummer allein
 * reicht nicht: Auf vielen Etiketten steht die Nummer der Lieferung, nicht die
 * des Stücks. Typ und Träger kommen dazu – dieselben Merkmale, an denen auch
 * am Spind zwei gleiche Jacken auseinandergehalten werden.
 *
 * Die Nummer darf null sein, damit die Signatur den kommenden Typwechsel
 * überlebt. Aufgerufen wird die Funktion dann trotzdem nicht: Ohne Nummer
 * trägt dieser Schlüssel nichts, was ein Teil benennt, und der Aufrufer
 * überspringt ihn.
 */
export const teilSchluessel = (nummer: string | null, typId: number, personId: number | null): string =>
  `${nummer ?? ''}|${typId}|${personId ?? ''}`;

const typSchluessel = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .split('ä').join('ae')
    .split('ö').join('oe')
    .split('ü').join('ue')
    .split('ß').join('ss')
    .replace(/[^a-z0-9]/g, '');

/** Gleichstand prüfen: Nur was die Datei mitbringt, zählt. */
function istUnveraendert(teil: Kleidungsstueck, werte: TeilWerte): boolean {
  // Eine fehlende Nummer ist kein Unterschied, sondern eine Auslassung – die
  // Datei sagt nichts über sie, also kann sie auch nichts ändern.
  if (werte.nummer !== null && teil.nummer !== werte.nummer) return false;
  if (teil.typId !== werte.typId) return false;

  const felder = [
    'matrixCode', 'groesse', 'hersteller', 'beschaffung', 'personId',
    'standort', 'waschzaehler', 'letztePruefung', 'letzteWaesche', 'notiz',
  ] as const;

  for (const feld of felder) {
    if (werte[feld] !== undefined && teil[feld] !== werte[feld]) return false;
  }
  return true;
}

export function neuesTeilAus(werte: TeilWerte, id: number, typ: Teiletyp, jetzt: string): Kleidungsstueck {
  const letztePruefung = werte.letztePruefung ?? null;
  return {
    id,
    // Nennt die Zeile keine Nummer, bekommt das Teil keine – dass es dann
    // zwingend einen Matrixcode trägt, hat die Analyse schon sichergestellt.
    nummer: werte.nummer ?? null,
    matrixCode: werte.matrixCode ?? null,
    typId: typ.id,
    groesse: werte.groesse ?? null,
    hersteller: werte.hersteller ?? null,
    beschaffung: werte.beschaffung ?? null,
    personId: werte.personId ?? null,
    standort: werte.standort ?? null,
    status: 'dienst',
    // Ein nicht waschbarer Typ führt keinen Zähler – dieselbe Regel wie beim
    // Anlegen über den Dialog.
    waschzaehler: typ.waschbar ? (werte.waschzaehler ?? 0) : 0,
    letzteWaesche: werte.letzteWaesche ?? null,
    letztePruefung,
    naechstePruefung: naechstePruefungAus(letztePruefung, typ),
    chargeId: null,
    notiz: werte.notiz ?? null,
    angelegt: jetzt,
  };
}

export function aktualisiereTeil(teil: Kleidungsstueck, werte: TeilWerte, typ: Teiletyp): Kleidungsstueck {
  const uebernimm = <T>(neu: T | undefined, alt: T): T => (neu !== undefined ? neu : alt);
  const letztePruefung = uebernimm(werte.letztePruefung, teil.letztePruefung);

  return {
    ...teil,
    // Hier weicht die Nummer bewusst von allen anderen Spalten ab: Eine leere
    // Zelle löscht sie nicht. Bei `matrixCode` und `standort` heisst leer
    // „entfernen", denn beides ist etwas, das wir vergeben und wieder
    // zurücknehmen. Die Nummer ist aufgedruckt – sie verschwindet nicht vom
    // Kleidungsstück, bloss weil sie in einer Tabelle nicht mitgeliefert
    // wurde. Eine leere Zelle heisst deshalb „weiss ich nicht".
    nummer: werte.nummer ?? teil.nummer,
    typId: typ.id,
    matrixCode: uebernimm(werte.matrixCode, teil.matrixCode),
    groesse: uebernimm(werte.groesse, teil.groesse),
    hersteller: uebernimm(werte.hersteller, teil.hersteller),
    beschaffung: uebernimm(werte.beschaffung, teil.beschaffung),
    personId: uebernimm(werte.personId, teil.personId),
    standort: uebernimm(werte.standort, teil.standort),
    waschzaehler: typ.waschbar ? uebernimm(werte.waschzaehler, teil.waschzaehler) : 0,
    letzteWaesche: uebernimm(werte.letzteWaesche, teil.letzteWaesche),
    letztePruefung,
    naechstePruefung: naechstePruefungAus(letztePruefung, typ),
    notiz: uebernimm(werte.notiz, teil.notiz),
  };
}

export function analysiereTeileImport(
  csvText: string,
  bestand: { teile: Kleidungsstueck[]; typen: Teiletyp[]; personen: Person[] },
  modus: TeileImportModus,
): TeileImportBericht {
  const tabelle = parseCsv(csvText);
  const leer: TeileImportBericht = {
    problem: null,
    trenner: tabelle.trenner,
    spalten: tabelle.spaltenOriginal,
    zuordnung: {},
    zeilen: [],
    neu: 0,
    aktualisiert: 0,
    unveraendert: 0,
    uebersprungen: 0,
    fehler: 0,
  };

  if (tabelle.spalten.length === 0) return { ...leer, problem: 'Die Datei ist leer.' };

  const spalten: Partial<Record<Feld, string>> = {};
  for (const feld of Object.keys(ALIASSE) as Feld[]) {
    const treffer = findeSpalte(tabelle.spalten, feld);
    if (treffer) spalten[feld] = treffer;
  }

  // Eine der beiden Kennungsspalten muss da sein, welche ist egal: Ohne
  // Nummer und ohne Matrixcode enthält die Datei keine Spalte, an der sich ein
  // Teil festmachen liesse – dann ist nicht die einzelne Zeile falsch, sondern
  // die ganze Datei die falsche.
  if (!spalten.nummer && !spalten.matrixCode) {
    return {
      ...leer,
      problem: 'Keine Nummernspalte und keine Matrixcode-Spalte gefunden.'
        + ' Die Kopfzeile braucht "Nummer" oder "Matrixcode".',
    };
  }
  if (!spalten.typ) {
    return { ...leer, problem: 'Keine Typspalte gefunden. Die Kopfzeile braucht "Typ".' };
  }

  const zuordnung: Record<string, string> = {};
  for (const [feld, spalte] of Object.entries(spalten) as [Feld, string][]) {
    zuordnung[feld] = tabelle.spaltenOriginal[tabelle.spalten.indexOf(spalte)] ?? spalte;
  }

  if (tabelle.zeilen.length === 0) {
    return { ...leer, zuordnung, problem: 'Die Datei enthält ausser der Kopfzeile keine Zeilen.' };
  }

  const nachTyp = new Map(bestand.typen.map(t => [typSchluessel(t.name), t]));
  const nachPerson = new Map(bestand.personen.map(p => [namensSchluessel(p.name), p]));
  // Die Nummer allein benennt kein Teil mehr: Steht auf dem Etikett die Nummer
  // der Lieferung, tragen alle Stücke daraus dieselbe. Wiedererkannt wird
  // deshalb über Nummer, Typ und Träger zusammen – dieselbe Unterscheidung,
  // die auch der Scan dem Anwender vorlegt.
  const nachSchluessel = new Map<string, Kleidungsstueck[]>();
  for (const teil of bestand.teile) {
    // Teile ohne Nummer gehören nicht in diesen Index: Ihr Schlüssel wäre
    // „|1|" und würde alle nummernlosen Teile desselben Typs im Pool zu einem
    // Haufen zusammenwerfen, aus dem der Import nur noch raten könnte. Sie
    // werden ausschliesslich über den Matrixcode gefunden.
    if (!teil.nummer) continue;
    const schluessel = teilSchluessel(teil.nummer, teil.typId, teil.personId);
    const bisher = nachSchluessel.get(schluessel);
    if (bisher) bisher.push(teil);
    else nachSchluessel.set(schluessel, [teil]);
  }
  const matrixBelegt = new Map(
    bestand.teile.filter(t => t.matrixCode).map(t => [t.matrixCode as string, t]),
  );

  const inDatei = new Map<string, number>();
  const matrixInDatei = new Map<string, number>();
  const zeilen: TeilImportZeile[] = [];

  for (const zeile of tabelle.zeilen) {
    const zelle = (feld: Feld): string =>
      spalten[feld] ? (zeile.werte[spalten[feld] as string] ?? '').trim() : '';

    const rohNummer = zelle('nummer');
    const rohTyp = zelle('typ');
    const rohTraeger = zelle('traeger');

    const fehlerZeile = (meldung: string): TeilImportZeile => ({
      zeile: zeile.nummer,
      nummer: rohNummer,
      typName: rohTyp || null,
      personName: rohTraeger || null,
      befund: 'fehler',
      meldung,
      teilId: null,
      werte: null,
    });

    // Nur noch eine Formprüfung, keine Pflichtprüfung: Beanstandet wird eine
    // Nummer, die dasteht und unlesbar ist. Ob überhaupt eine Kennung in der
    // Zeile steht, entscheidet sich erst nach dem Matrixcode-Block – vorher
    // wüssten wir es gar nicht.
    let nummer: string | null = null;
    if (rohNummer) {
      nummer = normalisiereNummer(rohNummer);
      if (!nummer) {
        zeilen.push(fehlerZeile(
          `"${rohNummer}" ist keine gültige Nummer. Erwartet wird das Muster XXXX-XX/XX, vorne mit vier bis zehn Ziffern.`,
        ));
        continue;
      }
    }

    const typ = nachTyp.get(typSchluessel(rohTyp));
    if (!typ) {
      zeilen.push(fehlerZeile(
        rohTyp
          ? `Teiletyp "${rohTyp}" ist nicht angelegt. Erst unter Kleidung → Typen anlegen.`
          : 'Kein Teiletyp in der Zeile.',
      ));
      continue;
    }

    const werte: TeilWerte = { nummer, typId: typ.id };
    let fehlerhaft: string | null = null;

    if (spalten.traeger) {
      if (!rohTraeger) {
        werte.personId = null;
      } else {
        const person = nachPerson.get(namensSchluessel(rohTraeger));
        if (!person) {
          fehlerhaft = `Träger "${rohTraeger}" ist nicht angelegt. Erst die Personen importieren.`;
        } else {
          werte.personId = person.id;
        }
      }
    }

    if (!fehlerhaft && spalten.matrixCode) {
      const roh = zelle('matrixCode');
      if (!roh) {
        werte.matrixCode = null;
      } else {
        const code = normalisiereMatrixCode(roh);
        if (!code) {
          fehlerhaft = `"${roh}" taugt nicht als Matrixcode (3 bis 200 Zeichen).`;
        } else {
          const belegt = matrixBelegt.get(code);
          const inDateiZeile = matrixInDatei.get(code);
          if (inDateiZeile !== undefined) {
            fehlerhaft = `Matrixcode steht schon in Zeile ${inDateiZeile}.`;
          } else if (belegt && belegt.nummer && nummer && belegt.nummer !== nummer) {
            // Ein Widerspruch ist es nur, wenn beide Seiten eine Nummer nennen
            // und die nicht dieselbe ist – dann klebt der Code offenbar am
            // falschen Teil. Fehlt sie auf einer Seite, widerspricht nichts:
            // Das ist der Fall „wir kennen jetzt die Nummer" (Bestandsteil
            // ohne Nummer) beziehungsweise „die Datei nennt sie nicht".
            fehlerhaft = `Matrixcode gehört schon zu ${teilBezeichnung(belegt)}.`;
          } else {
            werte.matrixCode = code;
          }
        }
      }
    }

    // Jetzt erst steht fest, ob die Zeile überhaupt ein Teil benennt. Früher
    // war das die Nummernprüfung; seit „Nummer oder Matrixcode" muss es beides
    // zusammen sein.
    if (!fehlerhaft && !istIdentifizierbar(nummer, werte.matrixCode ?? null)) {
      zeilen.push(fehlerZeile(IDENT_HINWEIS));
      continue;
    }

    // Der Matrixcode ist bestandsweit eindeutig und trifft deshalb genau ein
    // Teil – auch dann noch, wenn Träger oder Typ in der Datei anders stehen
    // als im Bestand. Beim Träger ist das erwünscht: Die Datei bringt den
    // neuen Stand, und der neue Stand ist eben der Unterschied.
    const ueberMatrix = werte.matrixCode ? matrixBelegt.get(werte.matrixCode) : undefined;

    // Beim Typ ist es das nicht. Ein Teiletyp bestimmt Prüffrist, Waschgrenze
    // und Ampel; ihn zu wechseln heisst, dass ein anderes Kleidungsstück
    // gemeint ist, und nicht, dass sich dasselbe geändert hat. Über den
    // Rückfall-Schlüssel konnte das nie passieren, weil der Typ dort im
    // Schlüssel steckt und ein abweichender Typ gar nicht erst trifft. Der
    // Matrixcode trifft trotzdem – diese Prüfung ersetzt die Sicherung, die
    // dabei wegfällt.
    //
    // Stillschweigend übernehmen wäre hier besonders teuer: `aktualisiereTeil`
    // setzt den Waschzähler eines nicht waschbaren Typs auf 0, ein Vertipper
    // in der Typspalte löschte also den Nachweis eines Teils mit Waschgrenze.
    // Aus demselben Grund legt der Import auch Typen und Träger nie still an.
    if (!fehlerhaft && ueberMatrix && ueberMatrix.typId !== typ.id) {
      const bisher = bestand.typen.find(t => t.id === ueberMatrix.typId)?.name ?? `Typ ${ueberMatrix.typId}`;
      zeilen.push(fehlerZeile(
        `Der Matrixcode gehört zu ${teilBezeichnung(ueberMatrix)} vom Typ "${bisher}",`
        + ` die Datei nennt "${typ.name}". Ein Typwechsel geht nur über den Dialog.`,
      ));
      continue;
    }

    if (!fehlerhaft && spalten.beschaffung) {
      const roh = zelle('beschaffung');
      const monat = monatAus(roh);
      if (monat === undefined) fehlerhaft = `"${roh}" ist als Beschaffung nicht zu lesen. Erwartet: JJJJ-MM.`;
      else werte.beschaffung = monat;
    }

    if (!fehlerhaft && spalten.letztePruefung) {
      const roh = zelle('letztePruefung');
      const datum = datumAus(roh);
      if (datum === undefined) fehlerhaft = `"${roh}" ist als Prüfdatum nicht zu lesen. Erwartet: JJJJ-MM-TT.`;
      else werte.letztePruefung = datum;
    }

    if (!fehlerhaft && spalten.letzteWaesche) {
      const roh = zelle('letzteWaesche');
      const datum = datumAus(roh);
      if (datum === undefined) fehlerhaft = `"${roh}" ist als Waschdatum nicht zu lesen. Erwartet: JJJJ-MM-TT.`;
      else werte.letzteWaesche = datum === null ? null : `${datum}T00:00:00.000Z`;
    }

    if (!fehlerhaft && spalten.waschzaehler) {
      const roh = zelle('waschzaehler');
      const zahl = zahlAus(roh);
      if (zahl === undefined) {
        fehlerhaft = `"${roh}" ist als Waschzähler keine Zahl.`;
      } else if (zahl !== null && (zahl < 0 || zahl > 999)) {
        fehlerhaft = 'Waschzähler muss zwischen 0 und 999 liegen.';
      } else if (zahl !== null) {
        if (!typ.waschbar && zahl > 0) {
          fehlerhaft = `${typ.name} führt keinen Waschzähler – die Spalte muss hier leer oder 0 sein.`;
        } else {
          werte.waschzaehler = zahl;
        }
      }
    }

    for (const [feld, grenze] of [['groesse', 20], ['hersteller', 60], ['standort', 60], ['notiz', 300]] as const) {
      if (fehlerhaft || !spalten[feld]) continue;
      const roh = zelle(feld);
      if (roh.length > grenze) fehlerhaft = `${zuordnung[feld]} ist länger als ${grenze} Zeichen.`;
      else werte[feld] = roh || null;
    }

    if (fehlerhaft) {
      zeilen.push(fehlerZeile(fehlerhaft));
      continue;
    }

    // Zwei Zeilen, die auf dasselbe Teil zeigen, kann der Import nicht
    // auseinanderhalten – er wüsste nicht, welche gilt.
    const schluessel = nummer !== null ? teilSchluessel(nummer, typ.id, werte.personId ?? null) : null;
    if (schluessel !== null) {
      const schonInDatei = inDatei.get(schluessel);
      if (schonInDatei !== undefined) {
        zeilen.push(fehlerZeile(
          `Nummer, Typ und Träger stehen genauso schon in Zeile ${schonInDatei}.`
          + ' Mehrere gleiche Teile brauchen unterschiedliche Träger.',
        ));
        continue;
      }

      // Erst hier vormerken: Eine fehlerhafte Zeile soll die Nummer nicht für
      // eine spätere, saubere Zeile blockieren.
      inDatei.set(schluessel, zeile.nummer);
    }
    // Ohne Nummer wird hier nichts geprüft und nichts vorgemerkt: Der
    // Schlüssel bestünde nur aus Typ und Träger und hielte zwei verschiedene
    // Jacken derselben Person für eine Dublette. Dass sich zwei nummernlose
    // Zeilen nicht doppeln, sichert die Matrixcode-Prüfung weiter oben – und
    // ohne Nummer hat die Zeile zwingend einen Code.
    if (werte.matrixCode) matrixInDatei.set(werte.matrixCode, zeile.nummer);

    const personName = werte.personId
      ? bestand.personen.find(p => p.id === werte.personId)?.name ?? null
      : null;

    // Der Treffer über den Matrixcode gilt, sonst der Rückfall über den
    // Dreier-Schlüssel. Der Code benennt immer genau ein Teil, der
    // Dreier-Schlüssel darf mehrdeutig sein – deshalb landet nur der zweite
    // Weg unten in der „bitte im Dialog ändern"-Bremse. Ein abweichender Typ
    // ist an dieser Stelle schon ausgeschlossen.
    const passende = ueberMatrix
      ? [ueberMatrix]
      : (schluessel !== null ? nachSchluessel.get(schluessel) ?? [] : []);
    const grund = { zeile: zeile.nummer, nummer: nummer ?? rohNummer, typName: typ.name, personName, werte };

    if (passende.length === 0) {
      zeilen.push({ ...grund, befund: 'neu', meldung: null, teilId: null });
      continue;
    }

    if (passende.length > 1) {
      zeilen.push(fehlerZeile(
        `Zu Nummer, Typ und Träger gibt es ${passende.length} Teile im Bestand.`
        + ' Welches gemeint ist, lässt sich aus der Datei nicht ablesen – bitte im Dialog ändern.',
      ));
      continue;
    }

    const treffer = passende[0];

    if (modus === 'ueberspringen') {
      zeilen.push({ ...grund, befund: 'uebersprungen', meldung: 'Ist schon erfasst.', teilId: treffer.id });
      continue;
    }

    const unveraendert = istUnveraendert(treffer, werte);
    zeilen.push({
      ...grund,
      befund: unveraendert ? 'unveraendert' : 'aktualisiert',
      meldung: unveraendert ? 'Steht schon genau so da.' : null,
      teilId: treffer.id,
    });
  }

  const zaehle = (befund: TeilImportBefund): number => zeilen.filter(z => z.befund === befund).length;

  return {
    problem: null,
    trenner: tabelle.trenner,
    spalten: tabelle.spaltenOriginal,
    zuordnung,
    zeilen,
    neu: zaehle('neu'),
    aktualisiert: zaehle('aktualisiert'),
    unveraendert: zaehle('unveraendert'),
    uebersprungen: zaehle('uebersprungen'),
    fehler: zaehle('fehler'),
  };
}
