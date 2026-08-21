import { Router, Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import type {
  Charge,
  ChargeMitTeilen,
  KleidungData,
  Kleidungsstueck,
  Person,
  PersonMitAusstattung,
  ScanErgebnis,
  TeilMitDetails,
  TeilStatus,
  Teiletyp,
  Uebersicht,
  Vorgang,
  VorgangMitNamen,
  VorgangTyp,
  WaescheAnlass,
} from '../types/kleidung';
import { CHARGE_STATI, KATEGORIEN, TEIL_STATI, WAESCHE_ANLAESSE } from '../constants/kleidung';
import { withFileLock, loadJsonFile, saveJsonFile } from '../utils/fileStore';
import { erzeugeBremse, sperrText } from '../utils/bremse';
import { erzeugeSitzung, koppele, scanMelden, warteAufScans, beende } from '../services/scanSessions';
import type { AuthRequest } from '../auth';
import { DATA_FILE } from '../config';
import {
  auswertung as berechneAuswertung,
  brauchtAufmerksamkeit,
  mitDetails,
  nachDringlichkeit,
  naechsteChargenNummer,
  naechstePruefungAus,
  normalisiereMatrixCode,
  normalisiereNummer,
  pruefungFaellig,
} from '../domain/kleidung';
import {
  aktualisierePerson,
  analysiereImport,
  neuePersonAus,
} from '../domain/personenImport';
import type { ImportModus } from '../domain/personenImport';

const router = Router();
const DATA_PATH = DATA_FILE;

const handleValidation = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0]?.msg ?? 'Validierungsfehler',
      details: errors.array().map(e => ({ field: e.type, message: e.msg })),
    });
  }
  next();
};

// --- Datenzugriff --------------------------------------------------------

async function loadData(): Promise<KleidungData> {
  const data = await loadJsonFile<Partial<KleidungData>>(DATA_PATH, {});
  return {
    typen: data.typen || [],
    personen: data.personen || [],
    teile: data.teile || [],
    chargen: data.chargen || [],
    vorgaenge: data.vorgaenge || [],
  };
}

async function saveData(data: KleidungData): Promise<void> {
  await saveJsonFile(DATA_PATH, data);
}

/** Angemeldeter Benutzer, sofern eine Anmeldung aktiv ist. */
const benutzerVon = (req: Request): string | null => (req as AuthRequest).benutzer ?? null;

function nextId(items: { id: number }[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map(i => i.id)) + 1;
}

const heute = (): string => new Date().toISOString().slice(0, 10);

const nachschlagVon = (data: KleidungData) => ({
  typen: data.typen,
  personen: data.personen,
  chargen: data.chargen,
  heute: heute(),
});

const alsDetail = (data: KleidungData) => {
  const nachschlag = nachschlagVon(data);
  return (teil: Kleidungsstueck): TeilMitDetails => mitDetails(teil, nachschlag);
};

/**
 * Jeder Vorgang wird protokolliert – die Historie eines Teils ist der
 * eigentliche Nachweis. Deshalb schreibt jede ändernde Route hierüber.
 */
type VorgangEingabe = Pick<Vorgang, 'teilId' | 'typ'> & Partial<Omit<Vorgang, 'id' | 'teilId' | 'typ'>>;

function protokolliere(data: KleidungData, eintrag: VorgangEingabe): Vorgang {
  const vorgang: Vorgang = {
    id: nextId(data.vorgaenge),
    zeit: eintrag.zeit ?? new Date().toISOString(),
    teilId: eintrag.teilId,
    typ: eintrag.typ,
    detail: eintrag.detail ?? null,
    anlass: eintrag.anlass ?? null,
    zaehlerVorher: eintrag.zaehlerVorher ?? null,
    zaehlerNachher: eintrag.zaehlerNachher ?? null,
    personId: eintrag.personId ?? null,
    chargeId: eintrag.chargeId ?? null,
    benutzer: eintrag.benutzer ?? null,
  };
  data.vorgaenge.push(vorgang);
  return vorgang;
}

const text = (wert: unknown): string | null => {
  if (typeof wert !== 'string') return null;
  const gekuerzt = wert.trim();
  return gekuerzt ? gekuerzt : null;
};

const zahlOderNull = (wert: unknown): number | null => {
  if (wert === null || wert === undefined || wert === '') return null;
  const zahl = Number(wert);
  return Number.isFinite(zahl) ? Math.trunc(zahl) : null;
};

/** Fehlerbehandlung einheitlich: eigene Fehler mit `status` durchreichen. */
function serverFehler(res: Response, err: unknown, was: string): void {
  const fehler = err as { status?: number; message?: string };
  if (fehler?.status && fehler.message) {
    res.status(fehler.status).json({ error: fehler.message });
    return;
  }
  console.error(`Fehler ${was}:`, err);
  res.status(500).json({ error: `Serverfehler ${was}` });
}

const fehler = (status: number, meldung: string): Error & { status: number } =>
  Object.assign(new Error(meldung), { status });

// ===========================
// TEILETYPEN
// ===========================

const typValidierung = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name ist Pflicht (2–80 Zeichen)'),
  body('kategorie').isIn(KATEGORIEN).withMessage('Unbekannte Kategorie'),
  body('waschbar').isBoolean().withMessage('waschbar muss true oder false sein'),
  body('waschgrenze').optional({ nullable: true }).isInt({ min: 1, max: 500 }).withMessage('Höchstzahl zwischen 1 und 500'),
  body('warnschwelle').optional({ nullable: true }).isInt({ min: 1, max: 500 }).withMessage('Warnschwelle zwischen 1 und 500'),
  body('pruefIntervallMonate').optional({ nullable: true }).isInt({ min: 1, max: 120 }).withMessage('Prüfintervall zwischen 1 und 120 Monaten'),
  handleValidation,
];

function typAusRequest(req: Request, id: number): Teiletyp {
  const waschbar = req.body.waschbar === true || req.body.waschbar === 'true';
  const waschgrenze = waschbar ? zahlOderNull(req.body.waschgrenze) : null;
  const warnschwelle = waschbar ? zahlOderNull(req.body.warnschwelle) : null;

  if (waschgrenze !== null && warnschwelle !== null && warnschwelle > waschgrenze) {
    throw fehler(400, 'Die Warnschwelle darf nicht über der Höchstzahl liegen.');
  }

  return {
    id,
    name: (req.body.name as string).trim(),
    kategorie: req.body.kategorie,
    waschbar,
    waschgrenze,
    warnschwelle,
    pruefIntervallMonate: zahlOderNull(req.body.pruefIntervallMonate),
    aktiv: req.body.aktiv === undefined ? true : req.body.aktiv !== false,
  };
}

router.get('/typen', async (_req: Request, res: Response) => {
  try {
    const data = await loadData();
    const mitAnzahl = data.typen.map(typ => ({
      ...typ,
      anzahlTeile: data.teile.filter(t => t.typId === typ.id && t.status !== 'ausgesondert').length,
    }));
    res.json(mitAnzahl.sort((a, b) => a.name.localeCompare(b.name)));
  } catch (err) {
    serverFehler(res, err, 'beim Laden der Teiletypen');
  }
});

router.post('/typen', typValidierung, async (req: Request, res: Response) => {
  try {
    const neu = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const typ = typAusRequest(req, nextId(data.typen));
      if (data.typen.some(t => t.name.toLowerCase() === typ.name.toLowerCase())) {
        throw fehler(409, `Ein Typ namens "${typ.name}" ist schon angelegt.`);
      }
      data.typen.push(typ);
      await saveData(data);
      return typ;
    });
    res.status(201).json(neu);
  } catch (err) {
    serverFehler(res, err, 'beim Anlegen des Teiletyps');
  }
});

router.put('/typen/:id', [param('id').isInt({ min: 1 }), ...typValidierung], async (req: Request, res: Response) => {
  try {
    const geaendert = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const id = Number(req.params.id);
      const index = data.typen.findIndex(t => t.id === id);
      if (index === -1) throw fehler(404, 'Teiletyp nicht gefunden');

      const typ = typAusRequest(req, id);
      if (data.typen.some(t => t.id !== id && t.name.toLowerCase() === typ.name.toLowerCase())) {
        throw fehler(409, `Ein Typ namens "${typ.name}" ist schon angelegt.`);
      }

      data.typen[index] = typ;

      // Prüftermine hängen am Intervall des Typs – ändert es sich, sind alle
      // Teile dieses Typs betroffen. Ohne Nachziehen stünden Fristen in der
      // Liste, die es nach der neuen Vorgabe gar nicht mehr gibt.
      for (const teil of data.teile) {
        if (teil.typId !== id) continue;
        teil.naechstePruefung = naechstePruefungAus(teil.letztePruefung, typ);
      }

      await saveData(data);
      return typ;
    });
    res.json(geaendert);
  } catch (err) {
    serverFehler(res, err, 'beim Ändern des Teiletyps');
  }
});

router.delete('/typen/:id', [param('id').isInt({ min: 1 }), handleValidation], async (req: Request, res: Response) => {
  try {
    await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const id = Number(req.params.id);
      const typ = data.typen.find(t => t.id === id);
      if (!typ) throw fehler(404, 'Teiletyp nicht gefunden');

      const belegt = data.teile.filter(t => t.typId === id).length;
      if (belegt > 0) {
        throw fehler(409, `Zu diesem Typ gehören noch ${belegt} Teile. Erst die Teile umtragen oder löschen.`);
      }

      data.typen = data.typen.filter(t => t.id !== id);
      await saveData(data);
    });
    res.json({ message: 'Teiletyp gelöscht' });
  } catch (err) {
    serverFehler(res, err, 'beim Löschen des Teiletyps');
  }
});

// ===========================
// PERSONEN
// ===========================

/**
 * Sollausstattung: Atemschutzgeräteträger brauchen alles, alle anderen alles
 * ausser dem reinen Atemschutz-Zubehör. Bewusst eine Regel statt einer
 * pflegbaren Liste – sonst müsste jede Wehr erst eine Tabelle füllen, bevor
 * die Ausstattung überhaupt etwas anzeigt.
 */
function sollTypen(typen: Teiletyp[], person: Person): Teiletyp[] {
  return typen.filter(typ => typ.aktiv && (person.atemschutz || typ.kategorie !== 'atemschutz'));
}

function personMitAusstattung(data: KleidungData, person: Person): PersonMitAusstattung {
  const detail = alsDetail(data);
  const teile = data.teile
    .filter(t => t.personId === person.id && t.status !== 'ausgesondert')
    .map(detail)
    .sort((a, b) => a.typName.localeCompare(b.typName));

  const vorhandeneTypen = new Set(teile.map(t => t.typId));
  const fehlend = sollTypen(data.typen, person)
    .filter(typ => !vorhandeneTypen.has(typ.id))
    .map(typ => typ.name);

  const hinweise: string[] = [];
  for (const teil of teile) {
    for (const hinweis of teil.hinweise) hinweise.push(`${teil.typName}: ${hinweis}`);
  }
  if (person.atemschutz && person.tauglichBis && person.tauglichBis < heute().slice(0, 7)) {
    hinweise.push(`Atemschutztauglichkeit abgelaufen (${person.tauglichBis})`);
  }

  return {
    ...person,
    teile,
    inWaesche: teile.filter(t => t.status === 'waesche').length,
    fehlend,
    hinweise,
  };
}

const personValidierung = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name ist Pflicht (2–80 Zeichen)'),
  body('atemschutz').optional().isBoolean(),
  body('tauglichBis').optional({ nullable: true }).matches(/^\d{4}-\d{2}$/).withMessage('Tauglichkeit als JJJJ-MM angeben'),
  body('notiz').optional({ nullable: true }).isLength({ max: 300 }),
  handleValidation,
];

router.get('/personen', async (_req: Request, res: Response) => {
  try {
    const data = await loadData();
    const personen = data.personen
      .map(person => personMitAusstattung(data, person))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(personen);
  } catch (err) {
    serverFehler(res, err, 'beim Laden der Personen');
  }
});

router.post('/personen', personValidierung, async (req: Request, res: Response) => {
  try {
    const person = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const name = (req.body.name as string).trim();
      if (data.personen.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        throw fehler(409, `"${name}" ist schon angelegt.`);
      }

      const neu: Person = {
        id: nextId(data.personen),
        name,
        atemschutz: req.body.atemschutz === true || req.body.atemschutz === 'true',
        tauglichBis: text(req.body.tauglichBis),
        aktiv: true,
        notiz: text(req.body.notiz),
      };
      data.personen.push(neu);
      await saveData(data);
      return neu;
    });
    res.status(201).json(person);
  } catch (err) {
    serverFehler(res, err, 'beim Anlegen der Person');
  }
});

router.put('/personen/:id', [param('id').isInt({ min: 1 }), ...personValidierung], async (req: Request, res: Response) => {
  try {
    const person = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const id = Number(req.params.id);
      const index = data.personen.findIndex(p => p.id === id);
      if (index === -1) throw fehler(404, 'Person nicht gefunden');

      const name = (req.body.name as string).trim();
      if (data.personen.some(p => p.id !== id && p.name.toLowerCase() === name.toLowerCase())) {
        throw fehler(409, `"${name}" ist schon angelegt.`);
      }

      const geaendert: Person = {
        ...data.personen[index],
        name,
        atemschutz: req.body.atemschutz === true || req.body.atemschutz === 'true',
        tauglichBis: text(req.body.tauglichBis),
        aktiv: req.body.aktiv === undefined ? data.personen[index].aktiv : req.body.aktiv !== false,
        notiz: text(req.body.notiz),
      };
      data.personen[index] = geaendert;
      await saveData(data);
      return geaendert;
    });
    res.json(person);
  } catch (err) {
    serverFehler(res, err, 'beim Ändern der Person');
  }
});

router.delete('/personen/:id', [param('id').isInt({ min: 1 }), handleValidation], async (req: Request, res: Response) => {
  try {
    await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const id = Number(req.params.id);
      if (!data.personen.some(p => p.id === id)) throw fehler(404, 'Person nicht gefunden');

      const zugeordnet = data.teile.filter(t => t.personId === id && t.status !== 'ausgesondert').length;
      if (zugeordnet > 0) {
        throw fehler(409, `${zugeordnet} Teile sind noch zugeordnet. Erst zurücknehmen, dann löschen.`);
      }

      // Die Person verschwindet, ihre Vorgänge bleiben: sonst fehlte in der
      // Historie der Teile plötzlich, wer sie getragen hat.
      data.personen = data.personen.filter(p => p.id !== id);
      for (const teil of data.teile) {
        if (teil.personId === id) teil.personId = null;
      }
      await saveData(data);
    });
    res.json({ message: 'Person gelöscht' });
  } catch (err) {
    serverFehler(res, err, 'beim Löschen der Person');
  }
});

/**
 * Personen aus einer CSV übernehmen.
 *
 * Zwei Stufen über denselben Endpunkt: ohne `uebernehmen` wird nur geprüft und
 * der Befund zurückgegeben, damit die Oberfläche eine Vorschau zeigen kann.
 * Mit `uebernehmen` läuft die Analyse noch einmal – innerhalb der Sperre und
 * gegen den dann gültigen Bestand. Sonst schriebe eine Vorschau von vorhin
 * gegen Personen, die inzwischen jemand anders angelegt hat.
 */
router.post('/personen/import', [
  body('csv').isString().withMessage('Es wird der Inhalt einer CSV-Datei erwartet.')
    .bail()
    .isLength({ min: 1, max: 2_000_000 }).withMessage('Die Datei ist leer oder grösser als 2 MB.'),
  body('modus').optional().isIn(['ueberspringen', 'aktualisieren']).withMessage('Unbekannter Modus'),
  body('uebernehmen').optional().isBoolean(),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const csv = req.body.csv as string;
    const modus: ImportModus = req.body.modus === 'aktualisieren' ? 'aktualisieren' : 'ueberspringen';
    const uebernehmen = req.body.uebernehmen === true || req.body.uebernehmen === 'true';

    if (!uebernehmen) {
      const data = await loadData();
      const bericht = analysiereImport(csv, data.personen, modus);
      if (bericht.problem) return res.status(400).json({ error: bericht.problem });
      return res.json({ ...bericht, uebernommen: false });
    }

    const ergebnis = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const bericht = analysiereImport(csv, data.personen, modus);
      if (bericht.problem) throw fehler(400, bericht.problem);

      if (bericht.neu === 0 && bericht.aktualisiert === 0) {
        return { ...bericht, uebernommen: false };
      }

      for (const zeile of bericht.zeilen) {
        if (!zeile.werte) continue;

        if (zeile.befund === 'neu') {
          data.personen.push(neuePersonAus(zeile.werte, nextId(data.personen)));
          continue;
        }

        if (zeile.befund === 'aktualisiert' && zeile.personId !== null) {
          const index = data.personen.findIndex(p => p.id === zeile.personId);
          if (index !== -1) data.personen[index] = aktualisierePerson(data.personen[index], zeile.werte);
        }
      }

      await saveData(data);
      return { ...bericht, uebernommen: true };
    });

    res.json(ergebnis);
  } catch (err) {
    serverFehler(res, err, 'beim Import der Personen');
  }
});

// ===========================
// KLEIDUNGSSTÜCKE
// ===========================

const NUMMER_HINWEIS = 'Die Nummer muss dem Muster XXXX-XX/XX folgen.';

const teilValidierung = [
  body('nummer').trim().isLength({ min: 4, max: 20 }).withMessage(NUMMER_HINWEIS),
  body('typId').isInt({ min: 1 }).withMessage('Teiletyp ist Pflicht'),
  body('groesse').optional({ nullable: true }).isLength({ max: 20 }),
  body('hersteller').optional({ nullable: true }).isLength({ max: 60 }),
  body('beschaffung').optional({ nullable: true }).matches(/^\d{4}-\d{2}$/).withMessage('Beschaffung als JJJJ-MM angeben'),
  body('personId').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Unbekannte Person'),
  body('standort').optional({ nullable: true }).isLength({ max: 60 }),
  body('waschzaehler').optional({ nullable: true }).isInt({ min: 0, max: 999 }).withMessage('Waschzähler zwischen 0 und 999'),
  body('letztePruefung').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Prüfdatum als JJJJ-MM-TT angeben'),
  body('matrixCode').optional({ nullable: true }).isLength({ max: 200 }),
  body('notiz').optional({ nullable: true }).isLength({ max: 300 }),
  handleValidation,
];

/** Nummer und Matrixcode müssen im ganzen Bestand eindeutig sein. */
function pruefeCodesFrei(data: KleidungData, nummer: string, matrixCode: string | null, eigeneId: number | null): void {
  const doppelteNummer = data.teile.find(t => t.nummer === nummer && t.id !== eigeneId);
  if (doppelteNummer) {
    throw fehler(409, `Die Nummer ${nummer} gehört schon zu einem anderen Teil.`);
  }
  if (matrixCode) {
    const doppelterCode = data.teile.find(t => t.matrixCode === matrixCode && t.id !== eigeneId);
    if (doppelterCode) {
      throw fehler(409, `Dieser Matrixcode ist bereits ${doppelterCode.nummer} zugeordnet.`);
    }
  }
}

function typOderFehler(data: KleidungData, typId: number): Teiletyp {
  const typ = data.typen.find(t => t.id === typId);
  if (!typ) throw fehler(400, 'Der gewählte Teiletyp existiert nicht.');
  return typ;
}

function teilOderFehler(data: KleidungData, id: number): Kleidungsstueck {
  const teil = data.teile.find(t => t.id === id);
  if (!teil) throw fehler(404, 'Kleidungsstück nicht gefunden');
  return teil;
}

router.get('/teile', [
  query('status').optional().isIn(TEIL_STATI),
  query('typId').optional().isInt({ min: 1 }),
  query('personId').optional().isInt({ min: -1 }),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const detail = alsDetail(data);
    const suche = text(req.query.q)?.toLowerCase() ?? null;

    let teile = data.teile.map(detail);

    if (req.query.status) teile = teile.filter(t => t.status === req.query.status);
    if (req.query.typId) teile = teile.filter(t => t.typId === Number(req.query.typId));
    if (req.query.personId !== undefined) {
      const personId = Number(req.query.personId);
      // -1 steht für "im Pool" – ein leerer Parameter wäre in der URL nicht
      // von "egal" zu unterscheiden.
      teile = personId === -1 ? teile.filter(t => t.personId === null) : teile.filter(t => t.personId === personId);
    }
    if (suche) {
      teile = teile.filter(t =>
        t.nummer.toLowerCase().includes(suche)
        || t.typName.toLowerCase().includes(suche)
        || (t.personName?.toLowerCase().includes(suche) ?? false)
        || (t.groesse?.toLowerCase().includes(suche) ?? false));
    }

    res.json(teile.sort((a, b) => a.nummer.localeCompare(b.nummer)));
  } catch (err) {
    serverFehler(res, err, 'beim Laden der Kleidungsstücke');
  }
});

router.get('/teile/:id', [param('id').isInt({ min: 1 }), handleValidation], async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const id = Number(req.params.id);
    const teil = data.teile.find(t => t.id === id);
    if (!teil) return res.status(404).json({ error: 'Kleidungsstück nicht gefunden' });

    const vorgaenge = data.vorgaenge
      .filter(v => v.teilId === id)
      .sort((a, b) => b.zeit.localeCompare(a.zeit))
      .map(v => ({
        ...v,
        personName: data.personen.find(p => p.id === v.personId)?.name ?? null,
        chargeNummer: data.chargen.find(c => c.id === v.chargeId)?.nummer ?? null,
      }));

    res.json({ teil: alsDetail(data)(teil), vorgaenge });
  } catch (err) {
    serverFehler(res, err, 'beim Laden des Kleidungsstücks');
  }
});

router.post('/teile', teilValidierung, async (req: Request, res: Response) => {
  try {
    const teil = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();

      const nummer = normalisiereNummer(req.body.nummer as string);
      if (!nummer) throw fehler(400, NUMMER_HINWEIS);

      const matrixCode = req.body.matrixCode ? normalisiereMatrixCode(req.body.matrixCode as string) : null;
      pruefeCodesFrei(data, nummer, matrixCode, null);

      const typ = typOderFehler(data, Number(req.body.typId));
      const personId = zahlOderNull(req.body.personId);
      if (personId !== null && !data.personen.some(p => p.id === personId)) {
        throw fehler(400, 'Die gewählte Person existiert nicht.');
      }

      const letztePruefung = text(req.body.letztePruefung);
      const neu: Kleidungsstueck = {
        id: nextId(data.teile),
        nummer,
        matrixCode,
        typId: typ.id,
        groesse: text(req.body.groesse),
        hersteller: text(req.body.hersteller),
        beschaffung: text(req.body.beschaffung),
        personId,
        standort: text(req.body.standort),
        status: 'dienst',
        waschzaehler: typ.waschbar ? (zahlOderNull(req.body.waschzaehler) ?? 0) : 0,
        letzteWaesche: null,
        letztePruefung,
        naechstePruefung: naechstePruefungAus(letztePruefung, typ),
        chargeId: null,
        notiz: text(req.body.notiz),
        angelegt: new Date().toISOString(),
      };

      data.teile.push(neu);
      protokolliere(data, {
        teilId: neu.id,
        typ: 'anlage',
        detail: `${typ.name} ${neu.nummer} angelegt`,
        personId,
        benutzer: benutzerVon(req),
        zaehlerNachher: neu.waschzaehler,
      });

      await saveData(data);
      return alsDetail(data)(neu);
    });
    res.status(201).json(teil);
  } catch (err) {
    serverFehler(res, err, 'beim Anlegen des Kleidungsstücks');
  }
});

router.put('/teile/:id', [param('id').isInt({ min: 1 }), ...teilValidierung], async (req: Request, res: Response) => {
  try {
    const geaendert = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const id = Number(req.params.id);
      const teil = teilOderFehler(data, id);

      const nummer = normalisiereNummer(req.body.nummer as string);
      if (!nummer) throw fehler(400, NUMMER_HINWEIS);
      const matrixCode = req.body.matrixCode ? normalisiereMatrixCode(req.body.matrixCode as string) : null;
      pruefeCodesFrei(data, nummer, matrixCode, id);

      const typ = typOderFehler(data, Number(req.body.typId));
      const personId = zahlOderNull(req.body.personId);
      if (personId !== null && !data.personen.some(p => p.id === personId)) {
        throw fehler(400, 'Die gewählte Person existiert nicht.');
      }

      if (personId !== teil.personId) {
        protokolliere(data, {
          teilId: id,
          typ: personId === null ? 'ruecknahme' : 'ausgabe',
          detail: personId === null
            ? 'In den Pool zurückgenommen'
            : `Ausgegeben an ${data.personen.find(p => p.id === personId)?.name ?? 'unbekannt'}`,
          personId,
          benutzer: benutzerVon(req),
        });
      }

      const letztePruefung = text(req.body.letztePruefung);
      Object.assign(teil, {
        nummer,
        matrixCode,
        typId: typ.id,
        groesse: text(req.body.groesse),
        hersteller: text(req.body.hersteller),
        beschaffung: text(req.body.beschaffung),
        personId,
        standort: text(req.body.standort),
        waschzaehler: typ.waschbar ? (zahlOderNull(req.body.waschzaehler) ?? teil.waschzaehler) : 0,
        letztePruefung,
        naechstePruefung: naechstePruefungAus(letztePruefung, typ),
        notiz: text(req.body.notiz),
      } satisfies Partial<Kleidungsstueck>);

      await saveData(data);
      return alsDetail(data)(teil);
    });
    res.json(geaendert);
  } catch (err) {
    serverFehler(res, err, 'beim Ändern des Kleidungsstücks');
  }
});

router.delete('/teile/:id', [param('id').isInt({ min: 1 }), handleValidation], async (req: Request, res: Response) => {
  try {
    await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const id = Number(req.params.id);
      const teil = teilOderFehler(data, id);
      if (teil.chargeId !== null) {
        throw fehler(409, 'Das Teil steckt noch in einer Wäsche-Charge.');
      }

      data.teile = data.teile.filter(t => t.id !== id);
      data.vorgaenge = data.vorgaenge.filter(v => v.teilId !== id);
      await saveData(data);
    });
    res.json({ message: 'Kleidungsstück gelöscht' });
  } catch (err) {
    serverFehler(res, err, 'beim Löschen des Kleidungsstücks');
  }
});

/** Matrixcode anlernen oder austauschen. */
router.post('/teile/:id/matrixcode', [
  param('id').isInt({ min: 1 }),
  body('code').optional({ nullable: true }).isLength({ max: 200 }),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const teil = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const id = Number(req.params.id);
      const eintrag = teilOderFehler(data, id);

      const roh = text(req.body.code);
      const code = roh ? normalisiereMatrixCode(roh) : null;
      if (roh && !code) throw fehler(400, 'Der Matrixcode ist zu kurz oder zu lang.');
      pruefeCodesFrei(data, eintrag.nummer, code, id);

      eintrag.matrixCode = code;
      protokolliere(data, {
        teilId: id,
        typ: 'korrektur',
        detail: code ? 'Matrixcode zugeordnet' : 'Matrixcode entfernt',
        benutzer: benutzerVon(req),
      });

      await saveData(data);
      return alsDetail(data)(eintrag);
    });
    res.json(teil);
  } catch (err) {
    serverFehler(res, err, 'beim Zuordnen des Matrixcodes');
  }
});

/** Ausgabe an eine Person oder Rücknahme in den Pool (personId = null). */
router.post('/teile/:id/ausgabe', [
  param('id').isInt({ min: 1 }),
  body('personId').optional({ nullable: true }).isInt({ min: 1 }),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const teil = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = teilOderFehler(data, Number(req.params.id));
      const ergebnis = gebeAus(data, eintrag, zahlOderNull(req.body.personId), benutzerVon(req));
      await saveData(data);
      return ergebnis;
    });
    res.json(teil);
  } catch (err) {
    serverFehler(res, err, 'bei der Ausgabe');
  }
});

/** Gemeinsame Logik für Ausgabe und Rücknahme – auch der Scan nutzt sie. */
function gebeAus(
  data: KleidungData,
  teil: Kleidungsstueck,
  personId: number | null,
  benutzer: string | null,
): TeilMitDetails {
  if (teil.status === 'ausgesondert') {
    throw fehler(409, 'Das Teil ist ausgesondert und kann nicht ausgegeben werden.');
  }
  if (teil.status === 'waesche') {
    throw fehler(409, 'Das Teil ist gerade in der Wäsche.');
  }

  const person = personId !== null ? data.personen.find(p => p.id === personId) : null;
  if (personId !== null && !person) throw fehler(400, 'Die gewählte Person existiert nicht.');

  teil.personId = personId;
  protokolliere(data, {
    teilId: teil.id,
    typ: personId === null ? 'ruecknahme' : 'ausgabe',
    detail: person ? `Ausgegeben an ${person.name}` : 'In den Pool zurückgenommen',
    personId,
    benutzer,
  });

  return alsDetail(data)(teil);
}

router.post('/teile/:id/reparatur', [
  param('id').isInt({ min: 1 }),
  body('detail').trim().isLength({ min: 2, max: 200 }).withMessage('Bitte kurz beschreiben, was defekt ist'),
  body('erledigt').optional().isBoolean(),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const teil = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = teilOderFehler(data, Number(req.params.id));
      const erledigt = req.body.erledigt === true || req.body.erledigt === 'true';

      if (!erledigt && eintrag.status === 'waesche') {
        throw fehler(409, 'Das Teil ist in der Wäsche – erst zurückmelden, dann zur Reparatur.');
      }

      eintrag.status = erledigt ? 'dienst' : 'reparatur';
      protokolliere(data, {
        teilId: eintrag.id,
        typ: 'reparatur',
        detail: `${erledigt ? 'Repariert' : 'Gemeldet'}: ${(req.body.detail as string).trim()}`,
        personId: eintrag.personId,
        benutzer: benutzerVon(req),
      });

      await saveData(data);
      return alsDetail(data)(eintrag);
    });
    res.json(teil);
  } catch (err) {
    serverFehler(res, err, 'beim Erfassen der Reparatur');
  }
});

router.post('/teile/:id/pruefung', [
  param('id').isInt({ min: 1 }),
  body('datum').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Prüfdatum als JJJJ-MM-TT angeben'),
  body('detail').optional({ nullable: true }).isLength({ max: 200 }),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const teil = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = teilOderFehler(data, Number(req.params.id));
      const typ = typOderFehler(data, eintrag.typId);

      eintrag.letztePruefung = req.body.datum as string;
      eintrag.naechstePruefung = naechstePruefungAus(eintrag.letztePruefung, typ);

      protokolliere(data, {
        teilId: eintrag.id,
        typ: 'pruefung',
        detail: text(req.body.detail) ?? 'Prüfung eingetragen',
        personId: eintrag.personId,
        benutzer: benutzerVon(req),
      });

      await saveData(data);
      return alsDetail(data)(eintrag);
    });
    res.json(teil);
  } catch (err) {
    serverFehler(res, err, 'beim Eintragen der Prüfung');
  }
});

router.post('/teile/:id/aussondern', [
  param('id').isInt({ min: 1 }),
  body('grund').optional({ nullable: true }).isLength({ max: 200 }),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const teil = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = teilOderFehler(data, Number(req.params.id));
      if (eintrag.chargeId !== null) {
        throw fehler(409, 'Das Teil steckt in einer Wäsche-Charge – erst dort entfernen.');
      }

      eintrag.status = 'ausgesondert';
      eintrag.personId = null;
      eintrag.naechstePruefung = null;

      protokolliere(data, {
        teilId: eintrag.id,
        typ: 'aussonderung',
        detail: text(req.body.grund) ?? 'Ausgesondert',
        zaehlerNachher: eintrag.waschzaehler,
        benutzer: benutzerVon(req),
      });

      await saveData(data);
      return alsDetail(data)(eintrag);
    });
    res.json(teil);
  } catch (err) {
    serverFehler(res, err, 'beim Aussondern');
  }
});

/**
 * Waschzähler von Hand setzen. Nötig beim Umstieg aus der Papierliste und
 * wenn eine Wäsche versehentlich doppelt gebucht wurde – jede Korrektur
 * landet mit altem und neuem Stand in der Historie.
 */
router.post('/teile/:id/waschzaehler', [
  param('id').isInt({ min: 1 }),
  body('wert').isInt({ min: 0, max: 999 }).withMessage('Waschzähler zwischen 0 und 999'),
  body('grund').optional({ nullable: true }).isLength({ max: 200 }),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const teil = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = teilOderFehler(data, Number(req.params.id));
      const typ = typOderFehler(data, eintrag.typId);
      if (!typ.waschbar) throw fehler(409, `${typ.name} führt keinen Waschzähler.`);

      const vorher = eintrag.waschzaehler;
      eintrag.waschzaehler = Number(req.body.wert);

      protokolliere(data, {
        teilId: eintrag.id,
        typ: 'korrektur',
        detail: text(req.body.grund) ?? 'Waschzähler korrigiert',
        zaehlerVorher: vorher,
        zaehlerNachher: eintrag.waschzaehler,
        benutzer: benutzerVon(req),
      });

      await saveData(data);
      return alsDetail(data)(eintrag);
    });
    res.json(teil);
  } catch (err) {
    serverFehler(res, err, 'beim Korrigieren des Waschzählers');
  }
});

// ===========================
// WÄSCHE-CHARGEN
// ===========================

function chargeMitTeilen(data: KleidungData, charge: Charge): ChargeMitTeilen {
  const detail = alsDetail(data);
  return {
    ...charge,
    teile: data.teile.filter(t => t.chargeId === charge.id).map(detail),
  };
}

function chargeOderFehler(data: KleidungData, id: number): Charge {
  const charge = data.chargen.find(c => c.id === id);
  if (!charge) throw fehler(404, 'Charge nicht gefunden');
  return charge;
}

router.get('/chargen', [query('status').optional().isIn(CHARGE_STATI), handleValidation], async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    let chargen = data.chargen;
    if (req.query.status) chargen = chargen.filter(c => c.status === req.query.status);

    res.json(chargen
      .map(charge => chargeMitTeilen(data, charge))
      .sort((a, b) => b.erstellt.localeCompare(a.erstellt)));
  } catch (err) {
    serverFehler(res, err, 'beim Laden der Chargen');
  }
});

const chargeValidierung = [
  body('anlass').isIn(WAESCHE_ANLAESSE).withMessage('Unbekannter Anlass'),
  body('ort').trim().isLength({ min: 2, max: 80 }).withMessage('Bitte angeben, wo gewaschen wird'),
  body('notiz').optional({ nullable: true }).isLength({ max: 300 }),
  handleValidation,
];

router.post('/chargen', chargeValidierung, async (req: Request, res: Response) => {
  try {
    const charge = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const neu: Charge = {
        id: nextId(data.chargen),
        nummer: naechsteChargenNummer(data.chargen),
        anlass: req.body.anlass as WaescheAnlass,
        ort: (req.body.ort as string).trim(),
        status: 'erfasst',
        notiz: text(req.body.notiz),
        erstellt: new Date().toISOString(),
        abgegeben: null,
        zurueck: null,
        benutzer: benutzerVon(req),
      };
      data.chargen.push(neu);
      await saveData(data);
      return chargeMitTeilen(data, neu);
    });
    res.status(201).json(charge);
  } catch (err) {
    serverFehler(res, err, 'beim Anlegen der Charge');
  }
});

router.put('/chargen/:id', [param('id').isInt({ min: 1 }), ...chargeValidierung], async (req: Request, res: Response) => {
  try {
    const charge = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = chargeOderFehler(data, Number(req.params.id));
      if (eintrag.status === 'abgeschlossen') throw fehler(409, 'Abgeschlossene Chargen lassen sich nicht mehr ändern.');

      eintrag.anlass = req.body.anlass as WaescheAnlass;
      eintrag.ort = (req.body.ort as string).trim();
      eintrag.notiz = text(req.body.notiz);

      await saveData(data);
      return chargeMitTeilen(data, eintrag);
    });
    res.json(charge);
  } catch (err) {
    serverFehler(res, err, 'beim Ändern der Charge');
  }
});

/** Teil in eine Charge legen – der Weg, den auch der Scanner nimmt. */
function legeInCharge(
  data: KleidungData,
  charge: Charge,
  teil: Kleidungsstueck,
  benutzer: string | null,
): void {
  if (charge.status === 'abgeschlossen') throw fehler(409, `Charge ${charge.nummer} ist abgeschlossen.`);
  if (teil.status === 'ausgesondert') throw fehler(409, `${teil.nummer} ist ausgesondert.`);
  if (teil.chargeId === charge.id) throw fehler(409, `${teil.nummer} liegt schon in ${charge.nummer}.`);
  if (teil.chargeId !== null) {
    const andere = data.chargen.find(c => c.id === teil.chargeId);
    throw fehler(409, `${teil.nummer} liegt schon in Charge ${andere?.nummer ?? '?'}.`);
  }

  const typ = typOderFehler(data, teil.typId);
  if (!typ.waschbar) throw fehler(409, `${typ.name} wird nicht gewaschen, sondern nur gereinigt.`);

  teil.chargeId = charge.id;
  teil.status = 'waesche';
  protokolliere(data, {
    teilId: teil.id,
    typ: 'korrektur',
    detail: `In Charge ${charge.nummer} aufgenommen`,
    anlass: charge.anlass,
    chargeId: charge.id,
    personId: teil.personId,
    benutzer,
  });
}

router.post('/chargen/:id/teile', [
  param('id').isInt({ min: 1 }),
  body('teilId').isInt({ min: 1 }).withMessage('Kleidungsstück fehlt'),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const charge = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = chargeOderFehler(data, Number(req.params.id));
      const teil = teilOderFehler(data, Number(req.body.teilId));
      legeInCharge(data, eintrag, teil, benutzerVon(req));
      await saveData(data);
      return chargeMitTeilen(data, eintrag);
    });
    res.json(charge);
  } catch (err) {
    serverFehler(res, err, 'beim Aufnehmen in die Charge');
  }
});

router.delete('/chargen/:id/teile/:teilId', [
  param('id').isInt({ min: 1 }),
  param('teilId').isInt({ min: 1 }),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const charge = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = chargeOderFehler(data, Number(req.params.id));
      if (eintrag.status === 'abgeschlossen') throw fehler(409, 'Abgeschlossene Chargen lassen sich nicht mehr ändern.');

      const teil = teilOderFehler(data, Number(req.params.teilId));
      if (teil.chargeId !== eintrag.id) throw fehler(409, `${teil.nummer} liegt nicht in dieser Charge.`);

      teil.chargeId = null;
      teil.status = 'dienst';
      protokolliere(data, {
        teilId: teil.id,
        typ: 'korrektur',
        detail: `Aus Charge ${eintrag.nummer} entfernt`,
        chargeId: eintrag.id,
        personId: teil.personId,
        benutzer: benutzerVon(req),
      });

      await saveData(data);
      return chargeMitTeilen(data, eintrag);
    });
    res.json(charge);
  } catch (err) {
    serverFehler(res, err, 'beim Entfernen aus der Charge');
  }
});

router.post('/chargen/:id/abgeben', [param('id').isInt({ min: 1 }), handleValidation], async (req: Request, res: Response) => {
  try {
    const charge = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const eintrag = chargeOderFehler(data, Number(req.params.id));
      if (eintrag.status !== 'erfasst') throw fehler(409, `Charge ${eintrag.nummer} ist nicht mehr im Erfassen.`);
      if (!data.teile.some(t => t.chargeId === eintrag.id)) throw fehler(409, 'Die Charge ist leer.');

      eintrag.status = 'unterwegs';
      eintrag.abgegeben = new Date().toISOString();
      await saveData(data);
      return chargeMitTeilen(data, eintrag);
    });
    res.json(charge);
  } catch (err) {
    serverFehler(res, err, 'beim Abgeben der Charge');
  }
});

/**
 * Rückmeldung der Charge: erst hier zählen die Wäschen hoch. Vorher wäre der
 * Zähler falsch, sobald eine Charge doch nicht gewaschen wird.
 */
router.post('/chargen/:id/zurueck', [param('id').isInt({ min: 1 }), handleValidation], async (req: Request, res: Response) => {
  try {
    const ergebnis = await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const charge = chargeOderFehler(data, Number(req.params.id));
      if (charge.status === 'abgeschlossen') throw fehler(409, `Charge ${charge.nummer} ist schon zurückgemeldet.`);

      const teile = data.teile.filter(t => t.chargeId === charge.id);
      if (teile.length === 0) throw fehler(409, 'Die Charge ist leer.');

      const zeit = new Date().toISOString();
      const benutzer = benutzerVon(req);
      const ueberGrenze: string[] = [];

      for (const teil of teile) {
        const typ = data.typen.find(t => t.id === teil.typId);
        const vorher = teil.waschzaehler;
        teil.waschzaehler = vorher + 1;
        teil.letzteWaesche = zeit;
        teil.chargeId = null;
        teil.status = 'dienst';

        protokolliere(data, {
          teilId: teil.id,
          typ: 'waesche',
          zeit,
          detail: `Charge ${charge.nummer} zurück (${charge.ort})`,
          anlass: charge.anlass,
          zaehlerVorher: vorher,
          zaehlerNachher: teil.waschzaehler,
          personId: teil.personId,
          chargeId: charge.id,
          benutzer,
        });

        if (typ?.waschgrenze !== null && typ?.waschgrenze !== undefined && teil.waschzaehler >= typ.waschgrenze) {
          ueberGrenze.push(teil.nummer);
        }
      }

      charge.status = 'abgeschlossen';
      charge.zurueck = zeit;

      await saveData(data);
      return { charge: chargeMitTeilen(data, charge), gezaehlt: teile.length, ueberGrenze };
    });
    res.json(ergebnis);
  } catch (err) {
    serverFehler(res, err, 'beim Zurückmelden der Charge');
  }
});

router.delete('/chargen/:id', [param('id').isInt({ min: 1 }), handleValidation], async (req: Request, res: Response) => {
  try {
    await withFileLock(DATA_PATH, async () => {
      const data = await loadData();
      const charge = chargeOderFehler(data, Number(req.params.id));
      if (charge.status === 'abgeschlossen') {
        throw fehler(409, 'Abgeschlossene Chargen bleiben als Nachweis stehen.');
      }

      for (const teil of data.teile) {
        if (teil.chargeId !== charge.id) continue;
        teil.chargeId = null;
        teil.status = 'dienst';
      }

      data.chargen = data.chargen.filter(c => c.id !== charge.id);
      await saveData(data);
    });
    res.json({ message: 'Charge verworfen' });
  } catch (err) {
    serverFehler(res, err, 'beim Verwerfen der Charge');
  }
});

// ===========================
// SCANNEN
// ===========================

/**
 * Unbekannte Codes durchprobieren bringt zwar keine Daten zutage, kostet aber
 * Rechenzeit – dieselbe Bremse wie beim Kopplungscode.
 */
const scanBremse = erzeugeBremse(60, 5 * 60 * 1000);

type ScanVorgang = 'waesche' | 'zurueck' | 'ausgabe' | 'ruecknahme' | 'lookup';
const SCAN_VORGAENGE: ScanVorgang[] = ['waesche', 'zurueck', 'ausgabe', 'ruecknahme', 'lookup'];

/**
 * Ein gescannter Code kann beides sein: die aufgedruckte Nummer oder der
 * Matrixcode am Etikett. Erst die Nummer versuchen – sie ist das Muster, das
 * wir kennen; alles andere gilt als Matrixcode und wird nur nachgeschlagen.
 */
function findeTeilZuCode(data: KleidungData, roh: string): {
  codeArt: 'nummer' | 'matrix';
  code: string;
  teil: Kleidungsstueck | null;
} {
  const nummer = normalisiereNummer(roh);
  if (nummer) {
    return { codeArt: 'nummer', code: nummer, teil: data.teile.find(t => t.nummer === nummer) ?? null };
  }

  const matrix = normalisiereMatrixCode(roh) ?? roh.trim();
  return { codeArt: 'matrix', code: matrix, teil: data.teile.find(t => t.matrixCode === matrix) ?? null };
}

router.post('/scan', [
  body('code').trim().isLength({ min: 3, max: 200 }).withMessage('Der Code ist zu kurz oder zu lang'),
  body('vorgang').isIn(SCAN_VORGAENGE).withMessage('Unbekannter Vorgang'),
  body('chargeId').optional({ nullable: true }).isInt({ min: 1 }),
  body('personId').optional({ nullable: true }).isInt({ min: 1 }),
  handleValidation,
], async (req: Request, res: Response) => {
  const sperre = scanBremse.sperre(req);
  if (sperre > 0) {
    return res.status(429).json({ error: `Zu viele unbekannte Codes. Bitte in ${sperrText(sperre)} erneut versuchen.` });
  }

  try {
    const ergebnis = await withFileLock(DATA_PATH, async (): Promise<ScanErgebnis> => {
      const data = await loadData();
      const treffer = findeTeilZuCode(data, req.body.code as string);
      const vorgang = req.body.vorgang as ScanVorgang;

      if (!treffer.teil) {
        scanBremse.fehlschlag(req);
        return {
          status: 'unbekannt',
          meldung: treffer.codeArt === 'nummer'
            ? `Zur Nummer ${treffer.code} ist kein Teil angelegt.`
            : 'Dieser Matrixcode ist keinem Teil zugeordnet.',
          codeArt: treffer.codeArt,
          code: treffer.code,
          teil: null,
        };
      }

      scanBremse.zuruecksetzen(req);
      const teil = treffer.teil;
      const benutzer = benutzerVon(req);
      let meldung: string;

      switch (vorgang) {
        case 'waesche': {
          const chargeId = zahlOderNull(req.body.chargeId);
          if (chargeId === null) throw fehler(400, 'Für die Wäsche fehlt die Charge.');
          const charge = chargeOderFehler(data, chargeId);
          legeInCharge(data, charge, teil, benutzer);
          meldung = `${teil.nummer} in Charge ${charge.nummer} aufgenommen.`;
          break;
        }

        case 'zurueck': {
          // Einzelne Rückmeldung, ohne die ganze Charge abzuschliessen –
          // praktisch, wenn ein Teil früher zurückkommt als der Rest.
          if (teil.chargeId === null) throw fehler(409, `${teil.nummer} ist gar nicht in der Wäsche.`);
          const charge = chargeOderFehler(data, teil.chargeId);
          const vorher = teil.waschzaehler;
          teil.waschzaehler = vorher + 1;
          teil.letzteWaesche = new Date().toISOString();
          teil.chargeId = null;
          teil.status = 'dienst';

          protokolliere(data, {
            teilId: teil.id,
            typ: 'waesche',
            detail: `Einzeln aus Charge ${charge.nummer} zurück`,
            anlass: charge.anlass,
            zaehlerVorher: vorher,
            zaehlerNachher: teil.waschzaehler,
            personId: teil.personId,
            chargeId: charge.id,
            benutzer,
          });
          meldung = `${teil.nummer} zurück – Wäsche ${vorher} auf ${teil.waschzaehler}.`;
          break;
        }

        case 'ausgabe': {
          const personId = zahlOderNull(req.body.personId);
          if (personId === null) throw fehler(400, 'Für die Ausgabe fehlt die Person.');
          gebeAus(data, teil, personId, benutzer);
          meldung = `${teil.nummer} ausgegeben an ${data.personen.find(p => p.id === personId)?.name ?? 'unbekannt'}.`;
          break;
        }

        case 'ruecknahme': {
          gebeAus(data, teil, null, benutzer);
          meldung = `${teil.nummer} in den Pool zurückgenommen.`;
          break;
        }

        case 'lookup':
        default:
          meldung = `${teil.nummer} gefunden.`;
          break;
      }

      if (vorgang !== 'lookup') await saveData(data);

      const detail = alsDetail(data)(teil);
      const warnung = detail.hinweise[0];
      return {
        status: warnung && vorgang !== 'lookup' ? 'hinweis' : 'ok',
        meldung: warnung && vorgang !== 'lookup' ? `${meldung} ${warnung}.` : meldung,
        codeArt: treffer.codeArt,
        code: treffer.code,
        teil: detail,
      };
    });

    res.json(ergebnis);
  } catch (err) {
    serverFehler(res, err, 'beim Scannen');
  }
});

// ===========================
// SCAN-KOPPLUNG (Handy scannt, anderes Gerät bucht)
// ===========================

const sitzungIdValidation = param('id')
  .trim()
  .isLength({ min: 32, max: 32 }).withMessage('Unbekannte Kopplung')
  .isHexadecimal().withMessage('Unbekannte Kopplung');

router.post('/scan-sitzung', (_req: Request, res: Response) => {
  try {
    res.status(201).json(erzeugeSitzung());
  } catch (err: unknown) {
    const error = err as { status?: number; message?: string };
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Fehler beim Starten der Kopplung:', err);
    res.status(500).json({ error: 'Serverfehler beim Starten der Kopplung' });
  }
});

/** Der Kopplungscode hat nur sechs Ziffern – ohne Bremse wäre er durchprobiert. */
const koppelBremse = erzeugeBremse(10, 5 * 60 * 1000);

router.post('/scan-sitzung/beitreten', [
  body('koppelCode').trim().matches(/^\d{6}$/).withMessage('Der Code besteht aus sechs Ziffern'),
  handleValidation,
], (req: Request, res: Response) => {
  const sperre = koppelBremse.sperre(req);
  if (sperre > 0) {
    return res.status(429).json({ error: `Zu viele Fehlversuche. Bitte in ${sperrText(sperre)} erneut versuchen.` });
  }

  const treffer = koppele(req.body.koppelCode);
  if (!treffer) {
    koppelBremse.fehlschlag(req);
    return res.status(404).json({ error: 'Kein Gerät mit diesem Code. Läuft die Kopplung noch?' });
  }

  koppelBremse.zuruecksetzen(req);
  res.json(treffer);
});

router.post('/scan-sitzung/:id/scan', [
  sitzungIdValidation,
  body('code').trim().isLength({ min: 3, max: 200 }).withMessage('Ungültiger Code'),
  handleValidation,
], (req: Request, res: Response) => {
  const ereignis = scanMelden(req.params.id, req.body.code);
  if (!ereignis) {
    return res.status(404).json({ error: 'Die Kopplung ist beendet oder abgelaufen.' });
  }
  res.status(201).json(ereignis);
});

router.get('/scan-sitzung/:id/warten', [
  sitzungIdValidation,
  query('seit').optional().isInt({ min: 0 }).withMessage('Ungültiger Stand'),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const seit = req.query.seit ? parseInt(req.query.seit as string, 10) : 0;
    res.json(await warteAufScans(req.params.id, seit));
  } catch (err) {
    console.error('Fehler beim Warten auf Scans:', err);
    res.status(500).json({ error: 'Serverfehler beim Warten auf Scans' });
  }
});

router.delete('/scan-sitzung/:id', [sitzungIdValidation, handleValidation], (req: Request, res: Response) => {
  beende(req.params.id);
  res.json({ message: 'Kopplung beendet' });
});

// ===========================
// ÜBERSICHT & AUSWERTUNG
// ===========================

function vorgangMitNamen(data: KleidungData, vorgang: Vorgang): VorgangMitNamen {
  const teil = data.teile.find(t => t.id === vorgang.teilId);
  const typ = teil ? data.typen.find(t => t.id === teil.typId) : undefined;
  return {
    ...vorgang,
    nummer: teil?.nummer ?? '?',
    typName: typ?.name ?? 'Unbekannter Typ',
    personName: data.personen.find(p => p.id === vorgang.personId)?.name ?? null,
    chargeNummer: data.chargen.find(c => c.id === vorgang.chargeId)?.nummer ?? null,
  };
}

router.get('/uebersicht', async (_req: Request, res: Response) => {
  try {
    const data = await loadData();
    const detail = alsDetail(data);
    const alle = data.teile.map(detail);
    const aktiv = alle.filter(t => t.status !== 'ausgesondert');
    const tag = heute();

    const uebersicht: Uebersicht = {
      teileGesamt: aktiv.length,
      inWaesche: aktiv.filter(t => t.status === 'waesche').length,
      waschgrenzeNah: aktiv.filter(t => t.ampel !== 'ok').length,
      pruefungFaellig: aktiv.filter(t => t.pruefStatus === 'faellig').length,
      pruefungBald: aktiv.filter(t => t.pruefStatus === 'bald').length,
      pruefungNie: aktiv.filter(t => t.pruefStatus === 'nie').length,
      imPool: aktiv.filter(t => t.personId === null).length,
      handlungsbedarf: aktiv.filter(brauchtAufmerksamkeit).sort(nachDringlichkeit).slice(0, 12),
      handlungsbedarfGesamt: aktiv.filter(brauchtAufmerksamkeit).length,
      offeneChargen: data.chargen
        .filter(c => c.status !== 'abgeschlossen')
        .map(charge => chargeMitTeilen(data, charge))
        .sort((a, b) => a.erstellt.localeCompare(b.erstellt)),
      letzteVorgaenge: [...data.vorgaenge]
        .sort((a, b) => b.zeit.localeCompare(a.zeit))
        .slice(0, 15)
        .map(vorgang => vorgangMitNamen(data, vorgang)),
    };

    res.json(uebersicht);
  } catch (err) {
    serverFehler(res, err, 'beim Laden der Übersicht');
  }
});

router.get('/auswertung', async (_req: Request, res: Response) => {
  try {
    const data = await loadData();
    res.json(berechneAuswertung(data.teile, data.typen, data.vorgaenge, new Date()));
  } catch (err) {
    serverFehler(res, err, 'beim Berechnen der Auswertung');
  }
});

/** Die letzten Vorgänge über alle Teile – der Verlauf im Auswertungs-Tab. */
router.get('/vorgaenge', [
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('typ').optional().isString(),
  handleValidation,
], async (req: Request, res: Response) => {
  try {
    const data = await loadData();
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const typFilter = text(req.query.typ) as VorgangTyp | null;

    const vorgaenge = data.vorgaenge
      .filter(v => !typFilter || v.typ === typFilter)
      .sort((a, b) => b.zeit.localeCompare(a.zeit))
      .slice(0, limit)
      .map(vorgang => vorgangMitNamen(data, vorgang));

    res.json(vorgaenge);
  } catch (err) {
    serverFehler(res, err, 'beim Laden der Vorgänge');
  }
});

export default router;
export type { TeilStatus };
