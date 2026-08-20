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
| **Kleidung** | Alle Teile als Kacheln mit Waschzähler-Ampel, Filter nach Typ und Status, Volltextsuche über Nummer, Typ und Träger |
| **Scannen** | Nummerncode (`XXXX-XX/XX`) und Matrixcode – wahlweise mit der Kamera, getippt oder über ein gekoppeltes Handy |
| **Wäsche** | Chargen: Teile einsammeln, abgeben, zurückmelden. Erst die Rückmeldung zählt die Waschzähler hoch |
| **Personen** | Einsatzkräfte mit ihrer Ausstattung, Atemschutz-Kennzeichnung und dem, was in der Sollausstattung fehlt |
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
   `https://github.com/Syynax/getraenkeverwaltung`
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
   Haken setzen.
3. **Kleidung → Teil anlegen**: Nummer, Typ, Größe und Träger erfassen. Beim
   Umstieg von der Papierliste den bisherigen Zählerstand gleich mit eintragen.

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
erreicht oder Prüfung fällig oder in Reparatur, rot heißt Höchstzahl erreicht.

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

- **Nummerncode** im Muster `XXXX-XX/XX` – die aufgedruckte Nummer. Sie ist die
  Identität des Teils und muss eindeutig sein.
- **Matrixcode** am Etikett. Sein Inhalt wird **nicht** ausgewertet: Was der
  Hersteller hineingeschrieben hat, ist egal – der rohe Wert dient nur als
  zweiter Weg zur Zuordnung. Ein unbekannter Matrixcode lässt sich im Scan-Tab
  einem vorhandenen Teil zuordnen („anlernen").

**Vor dem Scannen wird gewählt, was passieren soll:** in die Wäsche (mit
Ziel-Charge), Wäsche zurück, Ausgabe an eine Person, Rückgabe in den Pool oder
nur nachschlagen. Ohne diese Wahl wüsste ein Scan nicht, was er auslösen soll.

Die Kamera nutzt die `BarcodeDetector`-API mit den Formaten Data Matrix, QR,
Code 128, Code 39 und EAN-13. Damit das funktioniert, müssen zwei Dinge stimmen:

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
die Formatierung `XXXX-XX/XX` setzt das Feld selbst.

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
| Matrixcode wird nicht erkannt | Er ist noch keinem Teil zugeordnet. Im Scan-Tab unter „Unbekannter Code" anlernen |
| „Für die Wäsche fehlt die Charge" | Im Scan-Tab oben eine offene Charge wählen oder anlegen |
| Teiletyp lässt sich nicht löschen | Es hängen noch Teile daran. Erst umtragen oder löschen |
| Person lässt sich nicht löschen | Es sind noch Teile ausgegeben. Erst zurücknehmen |
| Add-on startet nicht | Log ansehen: bei beschädigter Datendatei steht dort der Weg zur Sicherung |
