# Suwar

Fotos und Videos aus der eigenen Nextcloud – als Web-App (PWA) für Android, iPad und Windows.
Suwar spricht direkt vom Gerät mit der Nextcloud. Es gibt keinen eigenen Server, und im Code stehen keine Zugangsdaten.

## Was Suwar kann (Stand 0.1.8 – Stufe 1, Bausteine 1–6)

- **Galerie** im Stil C: randloses Raster nach Tagen, Suche, Filter (Art, Bereich, Beleg, Personen, eigene Orte, Jahr, Monat), Schalter für Screenshots
- **Kategorien** über einen Bauplan (`/Fotos/.fotoapp/kategorien.json`), in den Einstellungen erweiterbar, ohne neuen Code. Werte werden als Nextcloud-Tags gespeichert (`bereich:Privat`)
- **Personen** von Hand zuordnen. Die Namen stehen in `/Fotos/.fotoapp/personen.json`, nicht in Tags, damit andere Benutzer sie nicht sehen
- **Aufräum-Modus**: wischen (links löschen, rechts behalten), Rückgängig, schnell zuordnen. Gelöschtes landet im Nextcloud-Papierkorb
- **Teilen per Link**: Auswahl → Kopie in `/Fotos/Geteilt/<Name>` → öffentlicher Link, optional mit Passwort. Der Standort wird aus den Kopien entfernt (Häkchen „Standort mitgeben“ für Ausnahmen), die Originale bleiben unverändert. Ohne Passwort bekommen Gäste eine gestaltete Seite (`gast.html`)
- **Hochladen**: Plus-Knopf, unter Android Teilen-Ziel (Galerie → Teilen → Suwar)
- **Video**: abspielen und ein Standbild als Foto speichern
- **Lebendiges Logo**: Der Blick im Stern zeigt den Himmel zur jetzigen Tageszeit (Morgengrauen, Tag, Nachmittag, Abend, Nacht mit Mond und Sternen). Die Zeiten kommen wie in Indibat aus der Aufgabenliste „Gebete“ in der Nextcloud – Suwar rechnet keine Gebetszeiten selbst. Oben rechts in der Galerie, auf der Anmeldeseite und im Browser-Tab. Antippen in den Einstellungen lässt einen ganzen Tag ablaufen
- **Einrichtung** beim ersten Start: legt `/Fotos/…` an und verschiebt die Screenshots aus `/SofortUpload/Screenshots`

Kommt noch: Baustein 7 (gemeinsame Ordner mit anderen Benutzern) und Baustein 8 (Gesichtserkennung, lokal auf dem Laptop).

## Einmalig in der Nextcloud einstellen

1. **WebAppPassword** (Verwaltung → WebAppPassword): `https://testkanal786.github.io` in **alle drei** Felder eintragen:
   - „WebDAV/CalDAV“: Dateien, Suche, Tags (bei Indibat schon erledigt)
   - „Files sharing API“: Links erstellen
   - „Preview“: Vorschaubilder vom Server (ohne den Eintrag verkleinert Suwar die Bilder selbst, das ist langsamer)
2. **App-Passwort** für Suwar: Persönliche Einstellungen → Sicherheit → „Neues App-Passwort erstellen“, Name „Suwar“.
3. **Upload-Ziele** in der Nextcloud-App umstellen (nach der Einrichtung in Suwar):
   - Android: Einstellungen → Automatischer Upload → „Camera“ ⋮ → Konfigurieren → `/Fotos/Kamera`, Unterordner nach Datum an, Original behalten. „Screenshots“ → `/Fotos/Screenshots`
   - iPad: Mehr → Einstellungen → Automatisches Hochladen → `/Fotos/iPad`

## Veröffentlichen (GitHub Pages)

Auf github.com mit dem Konto Testkanal786 ein öffentliches, leeres Repository `suwar` anlegen, dann:

```
git remote add origin https://github.com/Testkanal786/suwar.git
git push -u origin main
```

Danach unter Settings → Pages: „Deploy from a branch“, Branch `main`, Ordner `/ (root)`.
Adresse: https://testkanal786.github.io/suwar/

Update: Änderungen committen, `VERSION` in `sw.js` hochzählen, `git push`.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `js/nc.js` | Nextcloud: WebDAV, Suche (SEARCH), Tags, JSON-Dateien mit If-Match, Vorschau und Freigaben über WebAppPassword |
| `js/medien.js` | Liste, Zwischenspeicher (IndexedDB), Kategorien, Personen, Orte, Filter, Abgleich (voll alle 10 min, neue Dateien alle 20 s) |
| `js/logo.js` | lebendiges Logo: Tageszeiten aus der Gebete-Liste, Farben je Tageszeit, Sonne und Mond nie zugleich, Favicon |
| `js/standort.js` | entfernt GPS aus JPEG/HEIC (Exif, XMP) und Videos (ISO 6709), ohne die Bilddaten anzufassen |
| `js/app.js` | Oberfläche |
| `gast.html`, `js/gast.js` | Gästeseite. Die Dateiliste steckt komprimiert im Link (nach `#`), die Bilder kommen aus der öffentlichen Freigabe |
| `sw.js` | Offline-Start und Teilen-Ziel |

Daten in der Nextcloud: `/Fotos/.fotoapp/kategorien.json` (Bauplan), `personen.json`, `status.json` (geprüft im Aufräum-Modus), `geteilt.json` (Links).

## Testen

```
node test/standort.test.js      # Standort-Entfernung
node test/logo.test.js          # Logo: Zeiten nur aus der Gebete-Liste, nie Sonne und Mond zugleich
python3 test/e2e.py             # ganzer Durchlauf im Browser gegen eine nachgebaute Nextcloud (test/mock-nextcloud.js)
```
