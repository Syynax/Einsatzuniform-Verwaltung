# Einsatzkleidung

Verwaltung der persönlichen Schutzausrüstung: welches Teil wem gehört, wie oft
es gewaschen wurde, wann es zur Prüfung muss und wann es ausgesondert gehört.
Gedacht vor allem für die Kleidung der Atemschutzgeräteträger – die nach jedem
Einsatz in die Wäsche geht und deren Waschzyklen begrenzt sind – funktioniert
aber genauso für die übrige Einsatzkleidung.

## Was das Add-on kann

| Tab | Inhalt |
| --- | --- |
| **Übersicht** | Was ansteht: Teile an der Waschgrenze, fällige Prüfungen, offene Reparaturen, laufende Wäsche und die letzten Vorgänge |
| **Kleidung** | Alle Teile als Kacheln mit Waschzähler-Ampel, Filter nach Typ und Status, Volltextsuche über Nummer, Typ und Träger. Erfassen einzeln, als CSV-Import oder mit gedruckten Etiketten |
| **Scannen** | Nummerncode (`XXXX-XX/XX`, vorne bis zu zehn Ziffern) und Matrixcode – wahlweise mit der Kamera, getippt oder über ein gekoppeltes Handy |
| **Wäsche** | Chargen: Teile einsammeln, abgeben, zurückmelden – ganz oder in Teilen. Erst die Rückmeldung zählt die Waschzähler hoch |
| **Personen** | Einsatzkräfte mit ihrer Ausstattung, Atemschutz-Kennzeichnung und dem, was in der Sollausstattung fehlt. Anlegen einzeln oder als CSV-Import |
| **Auswertung** | Wäschen pro Monat, nach Anlass, Belastung je Teiletyp und der komplette Verlauf |

Dazu:

- **Eigene Anmeldung** – Konten werden im Add-on-Store gepflegt, nicht in Dateien
- **Daten bleiben lokal** unter `/data/einsatzkleidung.json`, täglich eine
  automatische Sicherung, dazu Sichern und Import als JSON
- **Kein Internet nötig** – das Add-on baut keine ausgehende Verbindung auf,
  Font Awesome ist mitgebaut

## Installation

1. In Home Assistant: **Einstellungen → Add-ons → Add-on-Store**
2. Oben rechts **⋮ → Repositories**, diese URL hinzufügen:
   `https://github.com/Syynax/Einsatzuniform-Verwaltung`
3. Add-on **Einsatzkleidung** auswählen, **Installieren**, **Starten**

Der erste Start dauert ein paar Minuten – das Image wird lokal gebaut.

> **Direkt nach dem Start das Passwort ändern.** Ausgeliefert wird
> `admin` / `bitte-aendern`; solange das gesetzt ist, steht ein Warnbalken über
> der App.

## Konfiguration

```yaml
titel: FF Musterdorf – Einsatzkleidung
untertitel: PSA, Wäsche & Prüfung
anmeldung: immer
sitzungsdauer_tage: 30
benutzer:
  - name: cedric
    passwort: EinLangesPasswort
automatische_sicherung: true
sicherungen_behalten: 14
log_level: info
```

| Option | Bedeutung |
| --- | --- |
| `titel`, `untertitel` | Beschriftung der Kopfleiste |
| `anmeldung` | `immer`, `nur_direktzugriff` (im Ingress reicht der Home-Assistant-Login) oder `aus` |
| `sitzungsdauer_tage` | Wie lange eine Anmeldung gilt (1–365) |
| `benutzer` | Liste aus Name und Passwort. Ist die Anmeldung an, aber die Liste leer, läuft das Add-on offen weiter und warnt |
| `automatische_sicherung` | Legt täglich eine Kopie in `/data/sicherungen` ab |
| `sicherungen_behalten` | Wie viele Tagessicherungen aufgehoben werden |
| `log_level` | Ab `warning` wird kein Request-Log mehr geschrieben |

## Erste Schritte

Beim allerersten Start legt das Add-on sechs **Teiletypen** an: Überjacke und
Überhose (HuPF Teil 1 und 4), Flammschutzhaube, Feuerwehrhandschuhe, Helm und
Stiefel. Die Höchstzahlen darin sind Hausnummern – die tatsächlichen Werte
stehen in den Herstellerangeben eurer Kleidung.

Danach in dieser Reihenfolge:

1. **Kleidung → Typen**: Höchstzahl der Wäschen, Warnschwelle und Prüfintervall
   an die eigenen Vorgaben anpassen.
2. **Personen**: Einsatzkräfte anlegen und bei den Atemschutzgeräteträgern den
   Haken setzen. Wer schon eine Mitgliederliste hat, nimmt den CSV-Import –
   siehe [Personen aus einer CSV übernehmen](#personen-aus-einer-csv-übernehmen).
3. **Kleidung → Teil anlegen**: Nummer, Typ, Größe und Träger erfassen. Beim
   Umstieg von der Papierliste den bisherigen Zählerstand gleich mit eintragen.

## Personen aus einer CSV übernehmen

Wer schon eine Mitgliederliste hat, muss die Namen nicht abtippen:
**Personen → CSV** liest eine Tabelle ein. Der Knopf sitzt neben „Person".

Der Import läuft in zwei Schritten. Nach dem Auswählen der Datei zeigt das
Add-on erst eine **Vorschau**: Zeile für Zeile, was passieren würde – und
warum. Geschrieben wird nichts, bevor unten „… übernehmen" gedrückt ist.

### Wie die Datei aussehen muss

Die erste Zeile ist die Kopfzeile. Nur der Name ist Pflicht, alles andere
darf fehlen:

| Spalte | Auch erkannt als | Inhalt |
| --- | --- | --- |
| `Name` | Person, Einsatzkraft, Mitglied, Kamerad | „Nachname, Vorname" |
| `Nachname` + `Vorname` | Familienname, Zuname / Rufname | Ersatz für `Name` – wird zu „Nachname, Vorname" zusammengesetzt |
| `Atemschutz` | AGT, Atemschutzgeräteträger | ja/nein, x, 1/0, wahr/falsch |
| `Tauglich bis` | Tauglichkeit, G26 | `2027-03`, `03/2027`, `15.03.2027` |
| `Status` | aktiv | aktiv/inaktiv, ja/nein |
| `Notiz` | Bemerkung, Hinweis, Kommentar | freier Text, höchstens 300 Zeichen |

Gross- und Kleinschreibung, Leerzeichen und Unterstriche in der Kopfzeile
sind egal: `Tauglich bis`, `tauglich_bis` und `TAUGLICHBIS` sind dieselbe
Spalte.

Über **Muster herunterladen** im Dialog gibt es eine Beispieldatei mit den
richtigen Spalten zum Ausfüllen.

Um Trenner und Kodierung muss sich niemand kümmern:

- **Trenner**: Semikolon, Komma, Tabulator oder senkrechter Strich – das
  Add-on erkennt ihn an der Kopfzeile. Das deutsche Excel schreibt Semikolon.
- **Kodierung**: UTF-8 und Windows-1252. Excel schreibt je nach Einstellung
  das eine oder das andere; die Umlaute kommen in beiden Fällen richtig an.
- **Anführungszeichen**: Felder in `"…"` dürfen Trenner und Zeilenumbrüche
  enthalten, ein `""` darin ist ein echtes Anführungszeichen.

### Wenn der Name schon angelegt ist

Verglichen wird über den Namen, Gross- und Kleinschreibung egal. Zwei Wege
stehen zur Wahl:

- **Überspringen** – der bestehende Eintrag bleibt, wie er ist. Das ist die
  Voreinstellung und der richtige Weg, um eine Liste nachzuziehen, in der ein
  paar Neue dazugekommen sind.
- **Aktualisieren** – die Felder aus der Datei werden übernommen.

Auch beim Aktualisieren gilt: **Geändert wird nur, was in der Datei steht.**
Eine Liste ohne Notiz-Spalte lässt bestehende Notizen unangetastet. Ausgegebene
Kleidungsstücke, Waschzähler und die Historie fasst der Import ohnehin nie an –
er legt Personen an und ändert deren Stammdaten, mehr nicht.

### Was der Import ablehnt

Fehlerhafte Zeilen werden übersprungen, nicht der ganze Import. In der Vorschau
stehen sie mit Zeilennummer und Grund:

- Name fehlt oder ist kürzer als zwei Zeichen
- derselbe Name steht in der Datei mehrfach – die spätere Zeile fällt raus
- ein Wert ist nicht zu lesen, etwa `vielleicht` in der Atemschutz-Spalte oder
  `irgendwann` bei der Tauglichkeit

Nur wenn die Datei als Ganzes nicht taugt – keine Namensspalte, leer, grösser
als 2 MB – bricht der Import ab, bevor er anfängt.

Zwei Feinheiten am Rande: Eine **leere Zelle in der Atemschutz-Spalte** gilt als
„nein" – so lassen sich Listen einlesen, in denen nur die Träger ein Kreuz
haben. Eine **leere Zelle in der Status-Spalte** bedeutet dagegen „nichts
gesagt" und legt niemanden still. Und wie im Personendialog gilt: Ohne
Atemschutz wird die Tauglichkeit verworfen, auch wenn eine in der Datei steht.

## Kleidungsstücke aus einer CSV übernehmen

Der Weg für den Umstieg: **Kleidung → CSV** liest eine ganze Bestandsliste ein,
statt jedes Teil einzeln über den Dialog anzulegen. Ablauf und Bedienung sind
dieselben wie beim Personenimport – erst eine Vorschau Zeile für Zeile,
geschrieben wird nichts, bevor unten „… übernehmen" gedrückt ist.

**Vorher anlegen:** Der Import legt weder Teiletypen noch Personen an. Beides
wird über den Namen gesucht, und ein unbekannter Name ergibt eine Fehlerzeile.
Das ist Absicht: Aus einem Tippfehler in der Typspalte soll kein zweiter
Teiletyp neben dem richtigen entstehen. Also zuerst die Typen unter
**Kleidung → Typen** anlegen und die Personen importieren.

### Spalten

Pflicht sind **Nummer** und **Typ**, alles andere darf fehlen:

| Spalte | Auch erkannt als | Inhalt |
| --- | --- | --- |
| `Nummer` | Nr, Teilenummer, Inventarnummer | `XXXX-XX/XX`, vorne vier bis zehn Ziffern; eine reine Ziffernfolge wie `10420719` wird umgesetzt |
| `Typ` | Teiletyp, Art, Bezeichnung | Name eines angelegten Teiletyps |
| `Größe` | Gr, Konfektionsgröße | freier Text |
| `Träger` | Person, Zugeordnet, Besitzer | Name einer angelegten Person; leer heißt Pool |
| `Hersteller` | Marke, Fabrikat | freier Text |
| `Beschaffung` | Beschafft, Anschaffung | `2019-07`, `07/2019`, `15.07.2019` |
| `Standort` | Spind, Lagerort, Ablage | freier Text |
| `Waschzähler` | Waschzyklen, Wäschen | Zahl; beim Umstieg der bisherige Stand |
| `Letzte Prüfung` | Prüfdatum, Geprüft am | `2026-03-15` oder `15.03.2026` |
| `Letzte Wäsche` | Gewaschen am | wie oben |
| `Matrixcode` | Code, Barcode, Etikett | Herstellercode, falls schon bekannt |
| `Notiz` | Bemerkung, Hinweis | höchstens 300 Zeichen |

Trenner, Kodierung und Anführungszeichen behandelt der Import wie beim
Personenimport – Semikolon aus dem deutschen Excel, Windows-1252 und UTF-8.
Über **Muster herunterladen** gibt es eine Beispieldatei, in der die Typnamen
schon aus dem eigenen Bestand stehen.

**Den bisherigen Waschzählerstand gleich mit eintragen.** Er ist die Grundlage
für Ampel und Aussonderung; wer bei null anfängt, verschenkt die Historie aus
der Papierliste.

### Was der Import ablehnt

Fehlerhafte Zeilen werden übersprungen, nicht der ganze Import. In der Vorschau
stehen sie mit Zeilennummer und Grund; ein Filter **nur Fehler** blendet den
Rest aus:

- Nummer fehlt oder passt nicht auf `XXXX-XX/XX`
- Nummer, Typ und Träger stehen in der Datei zweimal genau gleich – die
  Zeilen wären nicht auseinanderzuhalten. Dieselbe Nummer mit verschiedenen
  Trägern ist dagegen in Ordnung
- zu Nummer, Typ und Träger gibt es im Bestand schon mehrere Teile; welches
  gemeint ist, steht nicht in der Datei
- Teiletyp oder Träger ist nicht angelegt
- ein Datum ergibt keinen Kalendertag – ein `31.02.2026` ist ein Tippfehler und
  wird nicht stillschweigend auf den 3. März geschoben
- ein Matrixcode gehört schon zu einem anderen Teil
- ein Waschzähler steht bei einem Typ, der keinen führt (Helm, Stiefel)

### Wenn das Teil schon erfasst ist

Wiedererkannt wird ein Teil an **Nummer, Typ und Träger zusammen** – die
Nummer allein genügt nicht, weil mehrere Teile dieselbe tragen dürfen. Wer
gleichnamige Teile per Datei pflegt, braucht deshalb die Trägerspalte.

**Überspringen** lässt das vorhandene Teil unangetastet, **Aktualisieren**
übernimmt die Felder aus der Datei. Auch dann gilt: Geändert wird nur, was in
der Datei steht – eine Liste ohne Standortspalte lässt den Standort stehen.

Status, laufende Wäsche und die Historie fasst der Import nie an. Ändert er
einen Waschzähler oder ein Prüfdatum, steht das anschließend im Verlauf des
Teils, genau wie eine Änderung über den Dialog.

## Etiketten drucken

Scannen setzt voraus, dass am Teil etwas Maschinenlesbares klebt. Bei Helmen,
Stiefeln und älterer Kleidung ist das oft nicht der Fall. **Kleidung →
Etiketten** druckt dafür einen Bogen: je Teil ein QR-Code, daneben Nummer, Typ,
Größe und Träger im Klartext.

Der QR-Code enthält **nur die aufgedruckte Nummer**. Damit liest ihn der
vorhandene Scanner sofort – es muss nichts angelernt werden. Für Teile mit
Hersteller-Matrixcode ändert sich nichts; **beide Wege funktionieren
unverändert nebeneinander**, der Scanner erkennt weiterhin Nummer *und*
Matrixcode.

Gedruckt wird, was im Dialog steht: Der Bogen übernimmt die Filter des
Kleidung-Tabs, ein Klick auf das ✕ nimmt ein Etikett heraus, und **nur ohne
Code** beschränkt ihn auf die Teile, die noch nicht scannbar sind. Zwei bis
fünf Etiketten pro Zeile sind einstellbar.

Vor dem Drucken im Dialog des Browsers **Hintergrundgrafiken einschalten** und
die Skalierung auf 100 % stellen, sonst schrumpfen die Codes. Ein Etikett ist
rund 65 × 21 mm groß, der Code darin 17 mm.

> **Das Etikett muss die Wäsche überstehen.** Thermotransfer- oder
> Textiletiketten nehmen, kein normales Papier – die Kleidung geht bei 60 °C in
> die Maschine und danach in den Trockner. Erst einen Bogen auf Papier probe
> drucken und einen Testscan machen, bevor teures Material durch den Drucker
> geht.

## Teiletypen, Waschgrenze und Ampel

Alles, was für mehrere Teile gleich gilt, hängt am Typ:

- **Wird gewaschen** – Helme und Stiefel führen keinen Waschzähler. Sie tauchen
  trotzdem in der Ausstattung auf und haben Prüffristen.
- **Höchstzahl Wäschen** – die Zahl aus den Herstellerangaben. Erreicht ein Teil
  sie, steht es rot in der Übersicht.
- **Warnung ab** – ohne eigenen Wert wird bei 80 % der Höchstzahl gewarnt.
- **Prüfintervall** – aus letzter Prüfung plus Intervall wird der nächste Termin
  berechnet. Ändert ihr das Intervall, werden die Termine aller Teile dieses
  Typs nachgezogen.

Die Ampel an jeder Kachel: grün heißt unauffällig, gelb heißt Warnschwelle
erreicht, Prüfung steht in den nächsten 30 Tagen an oder das Teil ist in
Reparatur; rot heißt Höchstzahl erreicht, Prüfung überfällig oder nie
eingetragen.

### Prüfungen melden sich mit Vorlauf

Ein Prüftermin wird nicht erst gemeldet, wenn er verstrichen ist: **30 Tage
vorher** steht das Teil mit seinem Datum in der Übersicht, unter „Prüfung in
30 Tagen". So lassen sich Prüfungen bündeln, statt sie einzeln nachzuholen.

Ein eigener Fall ist **„Prüfung nie eingetragen"**. Hat der Teiletyp ein
Prüfintervall, am Teil steht aber kein Prüfdatum, dann gilt das Teil als
fällig – nicht als in Ordnung. Bei persönlicher Schutzausrüstung wäre eine
Entwarnung an einer Stelle, an der nie jemand hingesehen hat, die
gefährlichste Auskunft von allen.

Nach dem Umstieg von einer Papierliste trifft das zunächst auf viele Teile
zu. Die Übersicht sagt das ausdrücklich dazu; der Hinweis verschwindet,
sobald die alten Prüftermine nachgetragen sind.

## Zuordnung: fester Träger oder Pool

Jedes Teil gehört entweder einer Person oder liegt im **Pool**. Ausgabe und
Rücknahme werden protokolliert, damit später nachvollziehbar ist, wer ein Teil
wann getragen hat. Wird eine Person gelöscht, bleiben ihre Vorgänge in der
Historie der Teile stehen – nur die Zuordnung fällt weg.

Die **Sollausstattung** ergibt sich aus einer Regel statt aus einer Liste:
Atemschutzgeräteträger brauchen alle aktiven Typen, alle anderen alles außer der
Kategorie „Atemschutz-Zubehör". Was fehlt, steht bei der Person.

## Wäsche in Chargen

Der Ablauf ist bewusst dreistufig:

1. **Erfasst** – Charge anlegen (Anlass und Waschort), dann Teile hineinlegen,
   per Scan oder aus dem Teile-Detail. Die Teile stehen ab jetzt auf „In Wäsche".
2. **Unterwegs** – bei Abgabe an einen Dienstleister oder wenn die Maschine
   läuft. Reine Statusinformation.
3. **Zurück** – erst hier steigt bei jedem Teil der Waschzähler um 1, es bekommt
   das Datum der letzten Wäsche und geht zurück in den Dienst.

Kommt eine Charge **nicht vollständig** zurück – beim Dienstleister bleiben
einzelne Teile gern eine Woche länger –, dann werden in der Teileliste der
Charge nur die abgehakt, die tatsächlich da sind. Der Waschzähler steigt nur
bei diesen, und die Charge bleibt offen, bis auch der Rest zurückgemeldet ist.
Vorangehakt ist alles: Der Normalfall bleibt ein Klick.

Warum erst am Ende gezählt wird: Eine Charge, die doch nicht gewaschen wurde,
soll keine Zähler verbrauchen. Vor dem Zurückmelden zeigt die Tabelle bereits,
welcher Zählerstand danach steht und wer damit über die Höchstzahl geht.

Kommt ein einzelnes Teil früher zurück als der Rest, geht das über den Scan
(**Wäsche zurück**) oder im Teile-Detail – dann wird nur dieses eine Teil
gezählt, die Charge bleibt offen.

Eine Charge **verwerfen** setzt alle Teile zurück in den Dienst, ohne zu zählen.
Abgeschlossene Chargen bleiben als Nachweis stehen.

## Scannen

Gescannt werden zwei Dinge:

- **Nummerncode** im Muster `XXXX-XX/XX` – die aufgedruckte Nummer. Der
  vordere Block ist vier bis zehn Ziffern lang, je nachdem, was der
  Hersteller aufs Etikett schreibt; die hinteren vier sind immer `XX/XX`.

  Sie **muss nicht eindeutig sein**. Auf vielen Etiketten steht die Nummer
  der Fertigung, nicht die des einzelnen Stücks – alle Jacken einer
  Lieferung tragen dann dieselbe. Passen mehrere Teile zu einem Scan, bucht
  das Add-on nichts, sondern legt sie mit Typ, Träger, Größe und Standort
  zur Auswahl vor. Erst der Klick auf das richtige Teil bucht.
- **Matrixcode** am Etikett. Sein Inhalt wird **nicht** ausgewertet: Was der
  Hersteller hineingeschrieben hat, ist egal – der rohe Wert dient nur als
  zweiter Weg zur Zuordnung. Ein unbekannter Matrixcode lässt sich im Scan-Tab
  einem vorhandenen Teil zuordnen („anlernen").

**Vor dem Scannen wird gewählt, was passieren soll:** in die Wäsche (mit
Ziel-Charge), Wäsche zurück, Ausgabe an eine Person, Rückgabe in den Pool oder
nur nachschlagen. Ohne diese Wahl wüsste ein Scan nicht, was er auslösen soll.

Die Kamera nutzt die `BarcodeDetector`-API mit den Formaten Data Matrix, QR,
Code 128, Code 39, EAN-13, PDF417 und Aztec. Welche davon tatsächlich gelesen
werden, entscheidet der Browser: Die Anwendung fragt die unterstützten Formate
ab und sucht nur nach denen, die die Plattform mitbringt. Damit das funktioniert,
müssen zwei Dinge stimmen:

- **Sicherer Kontext:** Kamerazugriff gibt es nur über `https://` oder direkt
  über `localhost`. Wer Home Assistant über `http://homeassistant.local:8123`
  aufruft, bekommt keine Kamera.
- **Browser-Unterstützung:** Chrome/Edge/Android ja, Safari und iOS derzeit
  nicht.

Wird Home Assistant über einen Cloudflare Tunnel per `https://` erreicht, läuft
der Scanner direkt im Ingress-Panel. Der optionale Port 8098 ist über den Tunnel
**nicht** erreichbar und wird auch nicht gebraucht – ihn zusätzlich zu
veröffentlichen hieße ungeschützter Vollzugriff aus dem Internet.

Unabhängig davon funktioniert immer die **Eingabe von Hand**: Ziffern tippen,
die Formatierung `XXXX-XX/XX` setzt das Feld selbst. Gerechnet wird dabei nur
mit den Ziffern: Die letzten vier sind `XX/XX`, alles davor ist der vordere
Block. Bei mehr als acht Ziffern rutscht die Anzeige beim Tippen einmal –
am Ende steht die Nummer richtig da.

### Handy als Scanner koppeln

Wer am Rechner bucht, dort aber keine Kamera hat:

1. Am Rechner **Scannen → Handy koppeln → Kopplung starten**. Es erscheint ein
   sechsstelliger Code.
2. Am Handy dasselbe Add-on öffnen, **Scannen → Als Scanner**, Code eingeben.
3. Ab jetzt scannt das Handy, gebucht wird am Rechner – mit der dort gewählten
   Vorgangsart.

Die Kopplung lebt nur im Arbeitsspeicher, läuft nach 30 Minuten ohne Aktivität
ab und übersteht keinen Neustart des Add-ons. Ein Reload am Handy schadet
dagegen nicht. Die Einstellung „was passiert beim Scan" bleibt auch dann
bestehen, wenn am Rechner ein anderer Tab offen ist.

## Wo die Daten liegen

Alles steht in `/data/einsatzkleidung.json` – dem persistenten Volume des
Add-ons. Es übersteht Stopp, Neustart und Update; nur eine Deinstallation
löscht es mit.

- Geschrieben wird **atomar**: erst in eine Nebendatei, dann umbenannt. Ein
  Absturz mitten im Schreiben lässt immer die alte, vollständige Datei zurück.
- Ist die Datei vorhanden, aber beschädigt, **startet das Add-on bewusst
  nicht** – eine kaputte Datei lässt sich reparieren, eine überschriebene nicht.
  Im Log steht dann, wo die Sicherungen liegen.
- **Tägliche Sicherung** in `/data/sicherungen/einsatzkleidung-JJJJ-MM-TT.json`,
  Anzahl über `sicherungen_behalten`.
- **Sichern/Import** in der Kopfleiste: Export lädt den kompletten Bestand als
  JSON herunter, Import ersetzt ihn (und legt vorher eine Sicherung an).

### Kaputte Datei wiederherstellen

Über die Home-Assistant-Dateiverwaltung oder SSH die jüngste Datei aus
`/data/sicherungen/` über `/data/einsatzkleidung.json` kopieren und das Add-on
neu starten.

## Sicherheit

- Die Anmeldung steckt in einem signierten Token im `localStorage` – unter dem
  Ingress wechselt der Pfad, ein Cookie liefe ins Leere. Der Schlüssel dafür
  liegt in `/data/.session-secret` und überlebt Neustarts.
- Nach zehn Fehlversuchen ist die Anmeldung 15 Minuten gesperrt, ebenso der
  Kopplungscode nach zehn Versuchen für 5 Minuten.
- Der optionale Port 8098 ist für das lokale Netz gedacht. Er gehört nicht ins
  Internet.

## Fehlersuche

| Symptom | Ursache |
| --- | --- |
| „Kamera nicht verfügbar" | Kein `https://` oder ein Browser ohne `BarcodeDetector`. Nummer tippen oder Handy koppeln |
| Scan meldet „kein Teil angelegt" | Die Nummer gibt es noch nicht – erst das Teil anlegen |
| Scan fragt „Welches Teil?" | Mehrere Teile tragen diese Nummer. Am Träger erkennen, welches gemeint ist, und auswählen – gebucht ist noch nichts |
| Matrixcode wird nicht erkannt | Er ist noch keinem Teil zugeordnet. Im Scan-Tab unter „Unbekannter Code" anlernen |
| „Für die Wäsche fehlt die Charge" | Im Scan-Tab oben eine offene Charge wählen oder anlegen |
| Teiletyp lässt sich nicht löschen | Es hängen noch Teile daran. Erst umtragen oder löschen |
| Person lässt sich nicht löschen | Es sind noch Teile ausgegeben. Erst zurücknehmen |
| Add-on startet nicht | Log ansehen: bei beschädigter Datendatei steht dort der Weg zur Sicherung |
