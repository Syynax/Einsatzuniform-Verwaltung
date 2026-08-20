# Changelog

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
