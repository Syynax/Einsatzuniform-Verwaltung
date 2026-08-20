# Changelog

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
