import type { ScanVorschlag } from '../types/kleidung';

/**
 * Was in einem Herstellercode über die Seriennummer hinaus steht – und was
 * sich davon sicher herauslesen lässt.
 *
 * Vier echte Etiketten aus dem Bestand, so wie der Scanner sie liefert:
 *
 * ```
 * BO00063544TOTAL CAREECV133366 / LION 20141107M/R 19989 112812
 * BO00297306TOTAL CARE21021892 / LION 20200228S/S 60602 163364
 * BO00297349TOTAL CARE21021892 / LION 20200228S/S 60602 163364
 * BO00297362TOTAL CARE21021892 / LION 20200228S/R 60602 163364
 * ```
 *
 * Daran hängt der ganze Aufbau:
 *
 * - Die **Seriennummer** (`[A-Z]{2}` und acht Ziffern) steht am Anfang und ist
 *   das einzige Feld, das die Stücke unterscheidet – die mittleren beiden
 *   Codes sind sonst Zeichen für Zeichen gleich. Sie macht den rohen
 *   Gesamtstring stückgenau eindeutig; genau darum taugt er als Zuordnung.
 * - **Der Teiletyp geht aus dem Code nicht hervor, und zwar grundsätzlich.**
 *   `BO00297306` ist eine Jacke, `BO00297349` eine Hose – die beiden Codes
 *   sind bis auf die Seriennummer zeichengleich. Ein Feld für Jacke oder Hose
 *   gibt es nicht, und selbst die Lectra-Nummer trennt sie nicht: Sie gilt für
 *   Jacke und Hose desselben Modells gemeinsam. Größe, Hersteller und Datum
 *   gelten deshalb für beide Teile eines Satzes gleichermassen, der Typ aber
 *   ist daraus nicht abzuleiten. Er bleibt die Wahl des Anwenders und ist im
 *   Dialog ohnehin Pflichtfeld – hier wird er nie vorgeschlagen.
 * - `TOTAL CARE` ist die Kennung des LHD-Pflegeprogramms, kein allgemeiner
 *   Bestandteil. Sie enthält selbst ein Leerzeichen – an Leerzeichen zerlegen
 *   lässt sich der Code also nicht.
 * - Das **Lectra-Feld** dahinter ist nicht immer numerisch (`ECV133366`) und
 *   endet erst am Schrägstrich. Es wird nur überlesen, nicht beschrieben.
 * - Zwischen **Herstelldatum und Größe steht kein Trenner** (`20141107M/R`).
 *   Auseinander hält beide nur ihre Position, nicht ein Leerzeichen.
 * - Die beiden Zahlen am Schluss sind semantisch nicht belegt. Sie bleiben
 *   unangetastet und werden in kein Feld geschrieben.
 *
 * Gelesen wird deshalb **positionsverankert**: Der Code wird von vorn
 * abgetragen, und nur wenn der ganze Aufbau passt, kommt überhaupt etwas
 * heraus. Ein Code fremder Bauart liefert nichts statt halber Treffer.
 *
 * Das Ergebnis ist **eine Hilfe beim Erfassen und kein Wahrheitsbeweis**: Was
 * sich nicht zweifelsfrei lesen lässt, bleibt leer, geraten wird nie, und ein
 * unbekannter Code ist kein Fehler. Alles, was hier herauskommt, ist im Dialog
 * frei überschreibbar – es soll Tipparbeit sparen, nicht die Angabe des
 * Anwenders ersetzen.
 */

/**
 * Ein bekannter Codeaufbau.
 *
 * Das Muster trägt den Code von vorn ab und benennt die Felder, die uns
 * interessieren – `hersteller`, `datum`, `groesse`, jedes für sich optional.
 * Was ein Aufbau nicht hergibt, lässt er weg.
 *
 * Weitere Bauarten kommen als weiterer Eintrag dazu, ohne die vorhandenen
 * anzufassen: `TOTAL CARE` steht nur auf Kleidung, die über das Pflegeprogramm
 * der LHD Group läuft.
 */
interface Bauart {
  name: string;
  muster: RegExp;
}

const BAUARTEN: Bauart[] = [
  {
    name: 'LHD „TOTAL CARE"',
    // Seriennummer, Kennung, Lectra-Feld bis zum Schrägstrich, Hersteller,
    // Herstelldatum, unmittelbar anschliessend die Größe, dahinter die beiden
    // unbelegten Zahlen. Das Muster ist bis ans Ende verankert: Steht dort
    // etwas anderes, ist es diese Bauart nicht.
    muster: /^[A-Z]{2}\d{8}TOTAL CARE.+?\s*\/\s*(?<hersteller>\S+)\s+(?<datum>\d{8})(?<groesse>\S+)(?:\s+\d+)*$/,
  },
];

/**
 * Erkannte Hersteller. Bewusst eine kurze Liste, die sich um eine Zeile
 * erweitern lässt: Erkannt wird nur, wer hier steht – lieber ein leeres Feld
 * als ein falscher Name im Nachweis.
 *
 * Links steht der Name, wie er im Code auftaucht (Versalien), rechts die
 * übliche Schreibweise, wie sie im Bestand stehen soll.
 */
const HERSTELLER: { imCode: string; name: string }[] = [
  { imCode: 'LION', name: 'Lion' },
  { imCode: 'LHD', name: 'LHD Group' },
  { imCode: 'NOVOTEX', name: 'Novotex' },
  { imCode: 'TEXPORT', name: 'Texport' },
  { imCode: 'S-GARD', name: 'S-Gard' },
  { imCode: 'ROSENBAUER', name: 'Rosenbauer' },
];

/** Frühestes Jahr, das noch als Herstelldatum durchgeht. */
const JAHR_AB = 1990;

/**
 * Weite und Länge nach der Größentabelle im LHD-Katalog Fire & Rescue 2021.
 * `T` steht für „tall", die Längen sind also `XS`, `S`, `R`, `T`, `XT`, `XXT`.
 *
 * Beide Listen werden **getrennt** geprüft: `L` und `XL` sind Weiten und keine
 * Längen, `S` dagegen ist beides – `S/S` steht so auf zwei der vier Etiketten.
 * Die Reihenfolge ist Teil der Regel: Die längeren Schreibweisen stehen vorn,
 * sonst griffe in `XXL` das kürzere `XL` und in `XT` das kürzere `T`.
 *
 * **Es gibt weitere Größensysteme.** Beim selben Vertrieb kommen deutsche
 * Konfektionsgrößen (`52` an HuPF-Jacken), Längenbuchstabe plus Zahl (`L52`)
 * und in der US-Linie Zoll-Paare (`44/32`) vor. Ob sie an derselben Stelle im
 * Code stehen, ist nicht belegt – sie werden deshalb bewusst **nicht** erkannt.
 * Wer eines davon nachrüstet, erweitert diese Konstanten und das Muster
 * darunter, ohne den übrigen Parser anzufassen.
 */
const WEITEN = ['XXS', 'XXL', '3XL', 'XS', 'XL', 'S', 'M', 'L'];
const LAENGEN = ['XXT', 'XT', 'XS', 'S', 'R', 'T'];

/**
 * Das Größenfeld als Ganzes: Weite, Schrägstrich, Länge und sonst nichts.
 *
 * Die Leerzeichen sind erlaubt, weil der Katalog die Größe so schreibt
 * (`S / R`); in den Codes steht sie ohne.
 */
const GROESSE_MUSTER = new RegExp(`^(${WEITEN.join('|')}) ?/ ?(${LAENGEN.join('|')})$`);

const zweistellig = (zahl: number): string => String(zahl).padStart(2, '0');

/**
 * Acht Ziffern als Herstellmonat `JJJJ-MM`, oder null.
 *
 * **Diese Prüfung trägt die Datumserkennung**, sie ist keine Kosmetik: Im
 * selben Code steht mit der Lectra-Nummer `21021892` eine zweite Zahl aus acht
 * Ziffern. Auseinander hält beide neben der Position einzig die Plausibilität –
 * `21021892` wäre Monat 18 und Tag 92, und selbst mit gültigem Monat läge das
 * Jahr 2102 in der Zukunft. Beide Grenzen sind deshalb tragend: der echte
 * Kalendertag und das „nicht nach heute".
 *
 * `Date` rollt einen 31. Februar stillschweigend in den März weiter – deshalb
 * gilt der Tag erst als echt, wenn alle drei Teile unverändert wieder
 * herauskommen.
 */
function alsMonat(ziffern: string, heute: Date): string | null {
  const jahr = Number(ziffern.slice(0, 4));
  const monat = Number(ziffern.slice(4, 6));
  const tag = Number(ziffern.slice(6, 8));

  if (jahr < JAHR_AB || monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;

  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  if (
    datum.getUTCFullYear() !== jahr
    || datum.getUTCMonth() !== monat - 1
    || datum.getUTCDate() !== tag
  ) return null;

  if (datum.getTime() > heute.getTime()) return null;

  return `${jahr}-${zweistellig(monat)}`;
}

/** Der Name in üblicher Schreibweise, wenn der Hersteller bekannt ist. */
function alsHersteller(feld: string): string | null {
  return HERSTELLER.find(eintrag => eintrag.imCode === feld)?.name ?? null;
}

/** Weite und Länge in einheitlicher Schreibweise, wenn beide in der Tabelle stehen. */
function alsGroesse(feld: string): string | null {
  const treffer = GROESSE_MUSTER.exec(feld);
  return treffer ? `${treffer[1]}/${treffer[2]}` : null;
}

/** Die Rohfelder des ersten Aufbaus, auf den der Code passt. */
function felderAus(text: string): { hersteller?: string; datum?: string; groesse?: string } | null {
  for (const bauart of BAUARTEN) {
    const treffer = bauart.muster.exec(text);
    if (treffer) return treffer.groups ?? {};
  }
  return null;
}

/**
 * Liest aus einem rohen Matrixcode heraus, was sich sicher erkennen lässt.
 *
 * Gibt null zurück, wenn der Code auf keinen bekannten Aufbau passt oder sich
 * aus keinem seiner Felder etwas Gültiges lesen liess – der Aufrufer muss dann
 * kein leeres Objekt weiterreichen und die Oberfläche zeigt keinen Vorschlag.
 *
 * Passt der Aufbau, wird jedes Feld einzeln geprüft: Ein unbekannter
 * Herstellername oder ein unplausibles Datum lässt nur dieses eine Feld
 * ausfallen, nicht die übrigen.
 *
 * Das Herstelldatum landet als **Beschaffung** im Vorschlag, obwohl es das
 * Datum der Herstellung und nicht das der Beschaffung ist. Ein eigenes Feld
 * dafür gibt es nicht, und der Herstellmonat ist die beste vorhandene
 * Näherung: Zwischen Fertigung und Auslieferung an die Wehr liegen selten mehr
 * als ein paar Monate. Wer es genauer weiss, überschreibt das Feld.
 *
 * `heute` ist ein Parameter, damit sich die Plausibilitätsgrenze testen lässt,
 * ohne auf die Systemuhr angewiesen zu sein.
 */
export function leseMatrixCode(roh: string, heute: Date = new Date()): ScanVorschlag | null {
  try {
    if (!roh) return null;

    const felder = felderAus(roh.trim().toUpperCase());
    if (!felder) return null;

    const vorschlag: ScanVorschlag = {};

    const groesse = felder.groesse ? alsGroesse(felder.groesse) : null;
    if (groesse) vorschlag.groesse = groesse;

    const hersteller = felder.hersteller ? alsHersteller(felder.hersteller) : null;
    if (hersteller) vorschlag.hersteller = hersteller;

    const beschaffung = felder.datum ? alsMonat(felder.datum, heute) : null;
    if (beschaffung) vorschlag.beschaffung = beschaffung;

    return Object.keys(vorschlag).length > 0 ? vorschlag : null;
  } catch {
    // Ein Code, an dem sich der Parser verschluckt, darf das Anlegen eines
    // Teils nicht verhindern. Er ist eine Zugabe – fällt sie aus, bleibt der
    // Weg über das leere Formular.
    return null;
  }
}
