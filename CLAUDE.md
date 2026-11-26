# Suwar – Hinweise für Claude

- **Vor jeder Änderung an der Oberfläche `DESIGN.md` lesen und befolgen.** Nur Werte aus `werkzeuge/pruefen/tokens.json`
  verwenden, keine neuen Farben, Abstände, Radien, Schriftgrößen, Dauern oder Kurven erfinden.
- Danach den Prüfstand laufen lassen (`node werkzeuge/pruefen/css-pruefen.js`, `python3 werkzeuge/pruefen/bilder.py`)
  und die Bilder hell und dunkel tatsächlich ansehen.
- Tests vor jeder Veröffentlichung: `node test/standort.test.js`, `node test/logo.test.js`, `python3 test/e2e.py`, `python3 test/gesten.py`.
- Bei jeder Veröffentlichung `VERSION` in `js/app.js` und `sw.js` erhöhen. Neue Dateien in `sw.js` unter `DATEIEN` eintragen.
- Öffentliches Repo: keine persönlichen Adressen, Passwörter oder Schlüssel.
- Sprache in Oberfläche, Code-Kommentaren und Commits: Deutsch.
