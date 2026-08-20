# Einsatzkleidung – Home-Assistant-Add-on

Verwaltung der persönlichen Schutzausrüstung: wem gehört welches Teil, wie oft
wurde es gewaschen, wann muss es zur Prüfung. Gedacht vor allem für die Kleidung
der Atemschutzgeräteträger – die nach jedem Einsatz in die Wäsche geht und deren
Waschzyklen begrenzt sind –, taugt aber genauso für die übrige Einsatzkleidung.

Läuft als Add-on in Home Assistant und erscheint als eigener Punkt
„Einsatzkleidung" in der Seitenleiste. Gleiche Bauweise und Optik wie die
[Getränkeverwaltung](https://github.com/Syynax/getraenkeverwaltung).

## Was drin ist

| Tab | Inhalt |
| --- | --- |
| **Übersicht** | Teile an der Waschgrenze, fällige Prüfungen, offene Reparaturen, laufende Wäsche, letzte Vorgänge |
| **Kleidung** | Alle Teile als Kacheln mit Waschzähler-Ampel, Filter nach Typ und Status, Suche über Nummer, Typ und Träger |
| **Scannen** | Nummerncode `XXXX-XX/XX` und Matrixcode – mit der Kamera, getippt oder über ein gekoppeltes Handy |
| **Wäsche** | Chargen: einsammeln, abgeben, zurückmelden. Erst die Rückmeldung zählt die Waschzähler hoch |
| **Personen** | Einsatzkräfte mit Ausstattung, Atemschutz-Kennzeichnung und dem, was in der Sollausstattung fehlt |
| **Auswertung** | Wäschen pro Monat, nach Anlass, Belastung je Teiletyp, kompletter Verlauf |

Dazu:

- **Eigene Anmeldung** – Konten werden im Add-on-Store gepflegt, nicht in Dateien
- **Daten bleiben lokal** unter `/data/einsatzkleidung.json` und überstehen Stopp,
  Neustart und Update. Täglich eine automatische Sicherung, dazu Sichern und
  Import als JSON
- **Atomare Dateiablage**: geschrieben wird über eine Nebendatei. Ist der
  Datenbestand beschädigt, startet das Add-on bewusst nicht, statt ihn zu
  überschreiben
- **Kein Internet nötig** – das Add-on baut keine ausgehende Verbindung auf,
  Font Awesome ist mitgebaut

## Installation

1. In Home Assistant: **Einstellungen → Add-ons → Add-on-Store**
2. Oben rechts **⋮ → Repositories**
3. Diese URL eintragen und hinzufügen:

   ```
   https://github.com/Syynax/einsatzkleidung
   ```

4. Add-on **Einsatzkleidung** auswählen, **Installieren**, **Starten**

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

Die vollständige Beschreibung aller Optionen, der Teiletypen, Waschgrenzen,
Chargen und des Scanners steht in **[einsatzkleidung/DOCS.md](einsatzkleidung/DOCS.md)** –
das ist auch der Text, den Home Assistant im Add-on unter „Dokumentation" anzeigt.

## Aufbau

```
repository.yaml        Add-on-Repository für Home Assistant
einsatzkleidung/
├── config.yaml        Add-on-Metadaten (Ingress, Optionen, Ports)
├── build.yaml         Basis-Images je Architektur
├── Dockerfile         Zweistufiger Build: kompilieren → schlankes Runtime-Image
├── run.sh             Startskript, liest die Optionen über bashio
├── app/               Frontend (React + Vite)
└── server/            Backend (Express + TypeScript), Ablage als JSON-Datei
```

Zur Laufzeit bedient ein einziger Node-Prozess auf Port 8098 sowohl die API unter
`/api` als auch das gebaute Frontend.

## Lokal entwickeln

Alle Befehle vom Wurzelverzeichnis des Repositories aus. Erst beides bauen:

```bash
cd einsatzkleidung/server && npm install && npm run build && cd ../app && npm install && npm run build
```

Dann das Backend starten – es liefert die gebaute App gleich mit:

```bash
cd einsatzkleidung/server && DATA_FILE=../../data/einsatzkleidung.json PUBLIC_DIR=../app/dist PORT=8098 npm start
```

Danach läuft die komplette App unter http://localhost:8098. `DATA_FILE` bestimmt,
wo die Daten liegen; das Verzeichnis `data/` ist von Git ausgenommen.

Die Add-on-Optionen kommen im Container aus `/data/options.json`. Lokal legt man
sich dafür eine eigene Datei an und zeigt mit `OPTIONS_FILE` darauf – ohne die
gelten die Defaults, also unter anderem Anmeldung aus:

```bash
cd einsatzkleidung/server && OPTIONS_FILE=../../options.local.json DATA_FILE=../../data/einsatzkleidung.json PUBLIC_DIR=../app/dist npm start
```

Tests laufen ohne zusätzliche Abhängigkeit über den eingebauten Node-Runner:

```bash
cd einsatzkleidung/server && npm test
```

Abgedeckt sind die Regeln aus `src/domain/kleidung.ts` – Nummernformat und
Abgrenzung zum Matrixcode, Waschzähler-Ampel und Warnschwellen, Prüffristen, die
Sortierung des Handlungsbedarfs, Chargennummern und die Auswertung – dazu
Anmeldung und Tokenprüfung, die Bremse gegen Raten, die Sicherungsrotation, die
Scan-Kopplung und die Dateiablage samt Sperre, Zwischenspeicher und
Defekterkennung.

Für Frontend-Entwicklung mit Hot-Reload zusätzlich im Ordner `einsatzkleidung/app`:

```bash
cd einsatzkleidung/app && npm run dev
```

Läuft dann auf Port 5175 und leitet `/api` auf 8098 weiter.

## Warum die Pfade relativ sind

Home Assistant liefert Add-ons über den Ingress unter
`/api/hassio_ingress/<token>/` aus. Deshalb baut Vite mit `base: './'` und die
API-Basis wird zur Laufzeit aus `window.location.pathname` abgeleitet
(`app/src/services/api.ts`). Ein absolutes `/api` würde beim Home-Assistant-Core
landen statt beim Add-on.

Aus demselben Grund steckt die Sitzung in einem Token im `localStorage` und nicht
in einem Cookie – der Ingress-Pfad wechselt, ein Cookie-Path liefe ins Leere.

## Änderungen

Siehe **[einsatzkleidung/CHANGELOG.md](einsatzkleidung/CHANGELOG.md)**. Aktuell: **1.0.0**.
