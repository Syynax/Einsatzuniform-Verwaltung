# Changelog

## 1.4.0

Die aufgedruckte Nummer war bisher Pflicht. Das trifft auf die Wirklichkeit
nicht zu: Manche Hersteller bringen nur noch einen Matrixcode auf, und ein Teil
mit Herstelleretikett liess sich deshalb gar nicht anlegen – der Knopf „Neues
Teil anlegen" im Scan-Tab öffnete den Dialog mit gefülltem Code und leerer
Nummer, und das Speichern wurde abgewiesen.

- **Nummer und Matrixcode sind beide optional – aber eines von beiden muss da
  sein.** Ein Teil ohne jede Kennung liesse sich weder scannen noch am Spind
  zuordnen; es wäre ein Datensatz ohne Kleidungsstück dahinter. Die Regel gilt
  am Dialog, beim Ändern, beim CSV-Import und am Matrixcode-Endpunkt
- **Der Matrixcode lässt sich nicht mehr von einem Teil entfernen, das keine
  Nummer hat.** Das war die stille Lücke: Der Endpunkt zum Anlernen darf den
  Code auch löschen, und bei einem nummernlosen Teil nahm das ihm die letzte
  Kennung – es blieb im Bestand stehen und war über keinen Scan mehr zu
  erreichen
- **Wo bisher die Nummer stand, steht jetzt eine Bezeichnung**: die Nummer,
  sonst der gekürzte Matrixcode. Gekürzt wird vorne, weil dort die
  Seriennummer steht – das Ende eines Herstellercodes sieht bei einer ganzen
  Lieferung gleich aus. Das betrifft Kacheln, Listen, Verlauf und alle
  Meldungen des Scanners; bereits gespeicherte Verlaufseinträge bleiben
  unverändert stehen
- **Die Suche greift zusätzlich auf den Matrixcode zu.** Ein Teil, das nur den
  Code des Herstellers trägt, war über die Nummernsuche sonst nicht auffindbar
- **Teile ohne Nummer stehen nicht auf dem Etikettenbogen.** Sie tragen
  zwingend einen Matrixcode und sind damit schon scannbar; ein zweites Etikett
  schüfe zwei gültige Codes am selben Kleidungsstück. Wie viele übergangen
  wurden, steht sichtbar über dem Bogen
- **Der CSV-Import kommt ohne Nummernspalte aus**, solange eine
  Matrixcode-Spalte dasteht, und erkennt ein Teil zuerst über seinen
  Matrixcode wieder – der ist eindeutig, die Nummer darf es nicht sein. Nennt
  die Datei zu einem Code einen anderen Teiletyp als der Bestand, ist das eine
  Fehlerzeile: Ein Typwechsel geht nur über den Dialog
- In der Teile-Liste sortieren Teile ohne Nummer ans **Ende**, damit die Liste
  nicht mit einem Block Matrixcodes aufgeht
- Ein Teil ohne Nummer liess sich im Detail nicht mehr einzeln aus der Wäsche
  zurückmelden – der Knopf schickte die leere Nummer los. Er weicht jetzt auf
  den Matrixcode aus

- **Aus einem unbekannten Matrixcode lässt sich ein neues Teil anlegen.** Auf
  der Karte im Scan-Tab steht der Knopf jetzt neben dem bisherigen „Anlernen":
  Der Dialog geht mit dem Matrixcode im Feld auf. Gedacht ist das für
  Kleidung, an der nur das Herstelleretikett klebt. Anlernen bleibt der
  naheliegende Weg, solange das Teil schon im Bestand steht; der Matrixcode
  bleibt dabei wie bisher im ganzen Bestand eindeutig
- **Hersteller, Herstellmonat und Größe werden aus dem Code vorgeschlagen.**
  Herstelleretiketten tragen mehr als die Seriennummer – aus
  `BO00297362TOTAL CARE21021892 / LION 20200228S/R 60602 163364` liest das
  Add-on Lion, 02/2020 und Größe S/R und belegt die Felder damit vor. Was
  erkannt wurde, steht schon auf der Karte, bevor der Dialog aufgeht, und ist
  dort überschreibbar
- Gelesen wird **positionsverankert und nur bei bekanntem Aufbau**: Ein Code
  fremder Bauart belegt gar nichts vor, statt halbe Treffer zu liefern. Auch
  bei passendem Aufbau bleibt jedes Feld leer, das sich nicht zweifelsfrei
  lesen lässt – geraten wird nie, und ein unlesbarer Code hält das Anlegen
  nicht auf. Die Datumsprüfung trägt dabei die Hauptlast: Im selben Code steht
  mit der Lectra-Nummer eine zweite achtstellige Zahl, aus der kein Datum
  werden darf
- **Der Herstellmonat wird als Beschaffung eingetragen.** Das ist streng
  genommen etwas anderes – im Code steht, wann das Teil gefertigt wurde, nicht
  wann es gekauft wurde. Ein eigenes Feld dafür gibt es nicht, und der
  Herstellmonat ist die beste vorhandene Näherung

## 1.3.1

Nachbesserung an 1.3.0: Der längere vordere Block hat die Codeerkennung
gefräßig gemacht.

- **Nummerncode und Matrixcode sind getrennte Scanner.** Über dem Scanner
  steht jetzt, was gelesen werden soll: Beides, Nummerncode oder Matrixcode.
  Je Einstellung sucht die Kamera nur nach den Formaten, die dort vorkommen,
  und ein gelesener Code wird nicht mehr umgedeutet
- **Kein erfundener Nummerncode mehr.** Seit 1.3.0 galt jede Ziffernfolge von
  acht bis vierzehn Stellen als Nummer – eine EAN, eine Lectra-Nummer oder
  eine numerische Seriennummer passte damit mechanisch auf das Muster, ohne je
  eine Nummer zu sein. Aus `4056677123456` wurde `405667712-34/56` und der
  Scan meldete „kein Teil angelegt". In **Beides** zählt jetzt nur noch die
  fertig formatierte Schreibweise, wie sie der eigene Etikettenbogen druckt;
  die tolerante Umsetzung einer reinen Ziffernfolge bleibt der Einstellung
  **Nummerncode** vorbehalten
- **Ein Matrixcode lässt sich von Hand eintippen.** Das Eingabefeld hat bisher
  alles ausser Ziffern verworfen, ein Herstellercode war darüber nicht
  einzugeben

## 1.3.0

Die aufgedruckte Nummer ist jetzt das Kennzeichen des Teils, auch wenn sie
nicht eindeutig ist. Damit lässt sich Bestand erfassen, auf dem nur das
Herstelleretikett klebt.

- **Der vordere Block der Nummer darf vier bis zehn Ziffern lang sein** –
  bisher waren genau vier vorgeschrieben. Damit passen auch `842298-01/30`
  und `1234567890-04/25` ins Feld. Die hinteren vier Ziffern bleiben `XX/XX`;
  daran teilt der Server eine reine Ziffernfolge auf, egal wie lang sie ist
- **Dieselbe Nummer darf mehreren Teilen gehören.** Auf vielen Etiketten steht
  die Nummer der Fertigung, nicht die des einzelnen Stücks – alle Jacken einer
  Lieferung tragen dann dieselbe. Das Anlegen weist sie nicht mehr ab
- **Der Scan fragt nach, statt zu raten.** Passen mehrere Teile zu einem Code,
  wird nichts gebucht: Sie stehen mit Typ, Träger, Größe und Standort zur
  Auswahl, erst der Klick auf das richtige Teil bucht. Passt nur eines, ändert
  sich nichts am bisherigen Ablauf
- **Der CSV-Import erkennt Teile an Nummer, Typ und Träger** statt an der
  Nummer allein. Zwei Zeilen, die sich daran nicht unterscheiden, ergeben eine
  Fehlerzeile – und wo im Bestand mehrere Teile gleich aussehen, greift der
  Import keines heraus, sondern meldet die Zeile
- Der Matrixcode bleibt eindeutig. Er ist der einzige Code, der ein einzelnes
  Stück sicher benennt
- **Die Kamera liest jetzt auch PDF417 und Aztec.** Herstelleretiketten – etwa
  die der LHD Group auf Schutzjacken – tragen die stückgenaue Seriennummer in
  einem PDF417, nach dem der Scanner bisher gar nicht gesucht hat. Welche
  Formate wirklich gelesen werden, fragt die Anwendung vorher beim Browser ab,
  damit ein Format, das die Plattform nicht kennt, nicht den ganzen Scanner
  lahmlegt

## 1.2.0

Vier Änderungen: eine Korrektur an der Prüflogik, zwei Stellen, die falsche
Daten erzeugt haben, und zwei neue Wege, Kleidung zu erfassen.

- **Prüfung nie eingetragen ist nicht mehr „in Ordnung"** – ein Teil, dessen
  Typ ein Prüfintervall hat, das aber nie geprüft wurde, war bisher grün und
  tauchte in keiner Kennzahl auf. Nach einem Import meldete die Übersicht
  „0 Prüfungen fällig" für lauter ungeprüfte Teile. Solche Teile zählen jetzt
  gleich schwer wie überfällige
- **Prüftermine melden sich 30 Tage vorher**, statt erst nach Ablauf. Damit
  lassen sich Prüfungen bündeln, statt sie einzeln nachzuholen
- **CSV-Import für Kleidungsstücke** (Kleidung → CSV) – derselbe zweistufige
  Weg wie bei den Personen: erst die Vorschau Zeile für Zeile, dann
  übernehmen. Typ und Träger werden über den Namen gesucht und nie still
  angelegt; ein Tippfehler ergibt eine Fehlerzeile statt eines zweiten
  Teiletyps neben dem richtigen
- **Etiketten drucken** (Kleidung → Etiketten) – ein Bogen mit QR-Code je
  Teil, für Helme, Stiefel und Altbestand ohne Herstelleretikett. Der Code
  enthält nur die aufgedruckte Nummer, also liest ihn der vorhandene Scanner
  sofort. **Der Scanner bleibt unverändert: Nummer und Matrixcode
  funktionieren weiter nebeneinander**
- **Chargen lassen sich in Teilen zurückmelden** – kommen zehn von zwölf
  Teilen vom Dienstleister zurück, zählte der Rückmelde-Knopf bisher zwei
  Wäschen mit, die nie stattgefunden haben. Jetzt wird abgehakt, was da ist;
  die Charge bleibt offen, bis der Rest folgt
- **Änderungen an Waschzähler, Prüfdatum und Stammdaten stehen im Verlauf** –
  über den Bearbeiten-Dialog ließen sie sich bisher spurlos überschreiben,
  obwohl direkt daneben ein Endpunkt existiert, der genau das protokolliert
- **Löschen entfernt keine Belege mehr** – ein Teil mit Historie wird
  ausgesondert statt gelöscht. Löschen bleibt für die Fehlanlage möglich

## 1.1.0

- **Personen aus einer CSV übernehmen** – neuer Knopf „CSV" im Tab *Personen*.
  Gedacht für den Umstieg: Wer eine Mitgliederliste hat, tippt die Namen nicht
  ab
- **Erst prüfen, dann übernehmen**: Nach dem Auswählen der Datei zeigt der
  Dialog Zeile für Zeile, was passieren würde und warum. Geschrieben wird nichts,
  bevor der Import bestätigt ist
- **Genügsam beim Format**: Semikolon, Komma und Tabulator als Trenner werden
  erkannt, UTF-8 und Windows-1252 als Kodierung, Felder in Anführungszeichen
  dürfen Trenner und Zeilenumbrüche enthalten. Spaltennamen sind in mehreren
  Schreibweisen zugelassen, der Name darf auch als Nachname und Vorname
  getrennt kommen
- **Bestehende Personen** werden über den Namen erkannt und wahlweise
  übersprungen oder aktualisiert. Aktualisiert werden nur die Felder, die in der
  Datei stehen – eine Liste ohne Notiz-Spalte löscht keine Notizen. Ausgegebene
  Teile, Waschzähler und Historie fasst der Import nicht an
- **Fehlerhafte Zeilen** halten den Import nicht auf: Sie stehen mit
  Zeilennummer und Grund in der Vorschau, der Rest läuft durch

## 1.0.0

Erste Fassung – Verwaltung der Einsatzkleidung, getrennt von der
Getränkeverwaltung, aber im selben Add-on-Repository und mit demselben
Design-System.

- **Kleidungsstücke** mit Nummer im Muster `XXXX-XX/XX`, Typ, Größe,
  Hersteller, Beschaffung, Standort und Notiz
- **Waschzähler je Teil** mit Höchstzahl und Warnschwelle aus dem Teiletyp,
  Ampel in allen Listen; Helme und Stiefel führen bewusst keinen Zähler
- **Wäsche in Chargen**: erfassen → abgeben → zurückmelden. Erst die
  Rückmeldung zählt hoch, damit eine nicht gewaschene Charge keine Zyklen
  verbraucht. Einzelne Teile lassen sich vorab zurückmelden
- **Reparatur, Prüfung und Aussonderung** je Teil, Prüftermine werden aus
  Intervall und letzter Prüfung berechnet und beim Ändern des Intervalls
  nachgezogen
- **Personen** mit Atemschutz-Kennzeichnung und Tauglichkeitsdatum; feste
  Zuordnung und Pool, Ausgabe und Rücknahme werden protokolliert. Die
  Sollausstattung ergibt sich aus einer Regel: Atemschutzträger brauchen alles,
  alle anderen alles außer Atemschutz-Zubehör
- **Scannen** von Nummerncode und Matrixcode. Der Matrixcode wird nicht
  entschlüsselt – der rohe Wert dient als Zuordnung und lässt sich einem
  vorhandenen Teil anlernen. Vor dem Scan wird gewählt, was er auslöst: Wäsche,
  Rückmeldung, Ausgabe, Rückgabe oder Nachschlagen
- **Handy als Scanner** über eine sechsstellige Kopplung, wie in der
  Getränkeverwaltung: das Handy scannt, gebucht wird am anderen Gerät
- **Vollständige Historie** je Teil und über alles, dazu Auswertung nach Monat,
  Anlass und Teiletyp
- **Rahmen wie beim Schwester-Add-on**: eigene Anmeldung aus den Add-on-Optionen,
  atomare Dateiablage mit Defekterkennung, tägliche Sicherung, Sichern und
  Import als JSON, sauberes Herunterfahren bei SIGTERM
- Tests über den eingebauten Node-Runner: Nummernformat, Waschzähler-Ampel,
  Prüffristen, Sortierung des Handlungsbedarfs, Chargennummern und Auswertung –
  dazu die übernommenen Tests für Anmeldung, Dateiablage, Bremse, Sicherung und
  Scan-Kopplung
