# Suwar – Design-Regeln

Verbindlich für jede Änderung an der Oberfläche (`stil.css`, `gast.css`, `index.html`, `gast.html`, alles in `js/`, was
Elemente gestaltet). Bildschirm 7 passt zu Bildschirm 1, weil beide denselben Regeln folgen – nicht, weil sich jemand erinnert.

Stand: 25.11.2026 · Richtung **R1 „Stille Galerie“** (hell) mit **R2 „Nachthimmel“** als Darkmode.
Entwürfe: Leinwand „Suwar – Designentwürfe“, Tafeln R1a/R1b und R2a/R2b.
Maschinenlesbare Werte: `werkzeuge/pruefen/tokens.json` (gleiche Zahlen wie hier).

---

## 1. Stimmung

Hell, viel Luft, die Fotos sind die einzige Farbe auf dem Bildschirm. Die Oberfläche tritt zurück.
Nachts derselbe Aufbau auf tiefblauem Grund, die Fotos leuchten, Gold statt Blau als Akzent.

## 2. Schrift

| Rolle | Schrift | Schnitt | Wo |
|---|---|---|---|
| Überschrift | **Fraunces** | 600 | Seitentitel, Tages-/Monatsüberschriften, Titel in Blättern und in der Großansicht – nur ab 22 px |
| Text | **Inter** | 400 · 500 · 600 | alles andere |

- Beide liegen als Dateien in `fonts/` (Lizenz SIL OFL 1.1), es wird nichts von Google geladen.
- Schriftgrößen: **12 · 13 · 15 · 17 · 22 · 28 px**. Zahlen in Tabellen und Zeiten: `font-variant-numeric: tabular-nums`.
- Satzanfänge großgeschrieben, keine Versalien-Überschriften, keine Sperrung.

## 3. Farben – fünf Tokens

| Token | Hell (R1) | Dunkel (R2) | Wofür |
|---|---|---|---|
| `--grund` | `#FFFFFF` | `#0E1626` | Seitenhintergrund, auch Großansicht |
| `--flaeche` | `#F2F3F5` | `#18233A` | Suchfeld, Chips, Knöpfe, Karten, Platzhalter für Fotos |
| `--text` | `#16181D` | `#EEF1F6` | Schrift, Symbole, Hauptknopf |
| `--leise` | `#6B7079` | `#8C97AB` | Nebeninformation, inaktive Symbole |
| `--akzent` | `#2B5291` | `#E8B04B` | aktive Auswahl, Zähler, Fortschritt, Links, „Fotos hinzufügen“ |

- Darkmode folgt der Systemeinstellung (`prefers-color-scheme`).
- **Abgeleitet, keine neuen Farben:** Linien = `--text` mit 10 % (`color-mix`), zarter Akzentgrund = `--akzent` mit 14 % auf `--grund`,
  Schrift auf Akzent = `--grund`. Weitere Ableitungen nur nach diesem Muster.
- **Keine Warnfarbe.** Löschen und Fehler erkennt man an Wortlaut, Symbol und Rückfrage, nicht an Rot.
- **Ausnahmen (abschließend):**
  1. *Bildschleier* `rgba(0,0,0,.5)` mit Weiß – nur auf Fotos (Video-Marke, Auswahlkreis), weil das Foto jede Farbe haben kann.
  2. *Abdunklung* `rgba(0,0,0,.4)` – nur hinter Blättern und Dialogen.
  3. Das Logo (`js/logo.js`) und die Fotos selbst haben eigene Farben.
  4. Das **App-Symbol auf dem Startbildschirm** (`icons/bergstern-*.png`, ab 0.1.11) ist eine eigene Grafik mit Glanz, Verlauf und Schatten.
     Es erscheint nur außerhalb der App (Android, iPad, Desktop-Startmenü). In der App bleiben das flache Logo und das Favicon (`icons/stern-64.png`).

## 4. Abstände – 8-Pixel-Skala

**0 · 8 · 16 · 24 · 32 · 48 · 64 px.** Für `padding`, `margin`, `gap`.
- Halbschritt **4 px** nur zwischen Symbol und Beschriftung, in Zählern und Marken.
- **2 px** Fuge zwischen Fotos im Raster (Fotos sollen fast randlos wirken).
- Seitenrand am Handy 16 px, Karten innen 16 px, Abstand zwischen Karten 16 px.
- Klickflächen mindestens **48 × 48 px**, Höhe von Knöpfen, Feldern und Suchfeld 48 px, Chips 32 px.

## 5. Ecken – ein Radius

**12 px** für alles mit Ecken: Knöpfe, Felder, Suchfeld, Chips, Karten, Blätter (oben), Hinweise, Zähler.
Fotos im Galerie-Raster haben **keine** Ecken. Kein anderer Radius, keine Kreise.

## 6. Keine Farbverläufe oder Schatten, sofern sie hier nicht aufgeführt sind

Aufgeführt ist: **nichts.** Tiefe entsteht durch `--flaeche` auf `--grund` und durch Linien (`--text` 10 %).
Auch der Ladebalken ist ein einfarbiger Streifen, die Info in der Großansicht eine Fläche ohne Verlauf.

## 7. Bewegung

Werte aus Indibat übernommen (gleiche Begründung, siehe dort `DESIGN.md`):

| Token | Wert | Wofür |
|---|---|---|
| `--dauer-sofort` | 120 ms | Drücken, Farbwechsel |
| `--dauer-kurz` | 180 ms | Toast, Ausblenden, Info |
| `--dauer-mittel` | 240 ms | Großansicht, Blättern, Seitenwechsel |
| `--dauer-lang` | 360 ms | Blatt erscheint, Aufräum-Karte |
| `--kurve-standard` | `cubic-bezier(.23, 1, .32, 1)` | fast alles |
| `--kurve-blatt` | `cubic-bezier(.32, .72, 0, 1)` | Blatt von unten, Einrasten nach Wischen |

Regeln: nur `transform` und `opacity` animieren · Ausblenden eine Stufe kürzer als Einblenden · nie `ease-in` · nie `scale(0)`
· was erscheint, verschwindet auch animiert · bei „Bewegung reduzieren“ nur noch Überblenden.
Bilder springen nie: erst unscharf in voller Größe, dann nachschärfen.

## 8. Feinschliff-Checkliste (vor jeder Rückmeldung)

- Zustände: normal · gedrückt · Tastaturfokus sichtbar · deaktiviert · leer · lädt · Fehler
- Grenzfälle: langer Text, viele Fotos, keine Fotos, keine Verbindung
- **Hell und dunkel** angesehen
- Prüfstand ohne neue Funde, Bilder und Filmstreifen tatsächlich angesehen

## 9. Prüfstand

```sh
node werkzeuge/pruefen/css-pruefen.js     # Farben, Abstände, Radius, Schrift, Verläufe/Schatten, Bewegung gegen tokens.json
python3 werkzeuge/pruefen/bilder.py       # Bildschirme hell + dunkel und Filmstreifen nach werkzeuge/pruefen/ergebnis/
```

Neue Bildschirme oder Übergänge bekommen einen Eintrag in `bilder.py`.
