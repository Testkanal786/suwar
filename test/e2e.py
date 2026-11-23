# Durchlauf im echten Browser gegen die Nextcloud-Attrappe:
# Anmelden → Einrichten → Galerie/Filter → Großansicht/Video/Standbild → Zuordnen → Link + Gästeseite → Aufräumen → Hochladen → Kategorie anlegen.
# Start: python3 test/e2e.py  (startet Attrappe und Webserver selbst)
import json, os, subprocess, sys, time, urllib.request, io
from playwright.sync_api import sync_playwright, expect

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
NC = 'http://localhost:8090'
APP = 'http://localhost:8080/'
fehler = []

def get(pfad):
    return urllib.request.urlopen(NC + pfad).read()
def liste():
    return json.loads(get('/__test/liste'))
def schritt(t):
    print('•', t, flush=True)

mock = subprocess.Popen(['node', os.path.join(HIER, 'mock-nextcloud.js'), '8090', os.path.join(HIER, 'daten', 'seed')], stdout=subprocess.DEVNULL)
web = subprocess.Popen([sys.executable, '-m', 'http.server', '8080', '-d', WURZEL], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        ctx = browser.new_context(viewport={'width': 412, 'height': 900}, accept_downloads=True)
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://localhost:8080')
        page = ctx.new_page()
        page.on('console', lambda m: fehler.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: fehler.append('Seitenfehler: ' + str(e)))
        page.goto(APP)

        schritt('Anmelden mit falschem Passwort zeigt Fehler')
        page.fill('input[type=url]', NC)
        page.fill('input[autocomplete=username]', 'elias')
        page.fill('input[type=password]', 'falsch')
        page.click('button[type=submit]')
        expect(page.locator('.fehler')).to_contain_text('stimmt nicht')
        fehler.clear()  # 401 im Browserprotokoll ist hier erwartet

        schritt('Anmelden richtig → Einrichtung')
        page.fill('input[type=password]', 'test-app-passwort')
        page.click('button[type=submit]')
        expect(page.get_by_role('heading', name='Einrichtung')).to_be_visible()
        page.get_by_role('button', name='Einrichten').click()
        expect(page.locator('.protokoll')).to_contain_text('Fertig', timeout=15000)
        l = liste()
        assert '/Fotos/Screenshots/Screenshot_20261120_090000.jpg' in l, l
        assert not any(x.startswith('/SofortUpload/Screenshots/') for x in l), 'Screenshots nicht verschoben'
        assert '/Fotos/.fotoapp/kategorien.json' in l
        page.get_by_role('button', name='Zur Galerie').click()

        schritt('Galerie: 3 Kacheln (Screenshots ausgeblendet, Vereinsordner nicht dabei)')
        expect(page.locator('.kachel')).to_have_count(3, timeout=10000)
        expect(page.locator('.kachel img.da').first).to_be_visible(timeout=10000)
        page.get_by_role('button', name='Screenshots').click()
        expect(page.locator('.kachel')).to_have_count(6)
        page.get_by_role('button', name='Screenshots').click()
        expect(page.locator('.kachel')).to_have_count(3)

        schritt('Suche und Filter')
        page.fill('input[type=search]', 'november')
        expect(page.locator('.kachel')).to_have_count(3)
        page.fill('input[type=search]', 'whatsapp')
        expect(page.locator('.kachel')).to_have_count(1)
        page.fill('input[type=search]', '')
        page.get_by_role('button', name='Filter').click()
        page.locator('.blatt').get_by_role('button', name='Video', exact=True).click()
        page.get_by_role('button', name='Anzeigen').click()
        expect(page.locator('.kachel')).to_have_count(1)
        page.locator('.chip.filter').click()
        expect(page.locator('.kachel')).to_have_count(3)

        schritt('Großansicht Foto, dann Video mit Standbild')
        page.locator('.kachel').first.click()
        expect(page.locator('.ansicht .buehne img')).to_be_visible()
        page.keyboard.press('ArrowRight')
        expect(page.locator('.ansicht video')).to_be_visible(timeout=10000)
        page.wait_for_function("() => { const v = document.querySelector('.ansicht video'); return v && v.readyState >= 2; }", timeout=10000)
        expect(page.locator('#standbild')).to_be_enabled()
        page.locator('#standbild').click()
        expect(page.locator('.toast')).to_contain_text('Standbild gespeichert', timeout=10000)
        assert any('_standbild_' in x for x in liste()), 'Standbild fehlt'
        page.get_by_role('button', name='Schließen').click()
        expect(page.locator('.ansicht')).to_have_count(0)
        expect(page.locator('.kachel')).to_have_count(4)

        schritt('Zuordnen per Auswahl: zwei Fotos → Privat')
        page.get_by_role('button', name='Auswählen').click()
        page.locator('.kachel').nth(0).click()
        page.locator('.kachel').nth(1).click()
        page.locator('.leiste').get_by_role('button', name='Zuordnen').click()
        page.locator('.blatt').get_by_role('button', name='Privat').click()
        expect(page.locator('.blatt').get_by_role('button', name='Privat')).to_have_attribute('aria-pressed', 'true')
        page.locator('.blatt').get_by_role('button', name='Verein').click()  # „einzeln“: Privat wird ersetzt
        expect(page.locator('.blatt').get_by_role('button', name='Privat')).to_have_attribute('aria-pressed', 'false')
        page.locator('.blatt').get_by_role('button', name='Privat').click()
        page.locator('.blatt').get_by_role('button', name='Fertig').click()
        page.locator('.chips').get_by_role('button', name='Fertig').click()
        t = json.loads(get('/__test/tags'))
        namen = dict(t['tags'])
        privat = [k for k, v in namen.items() if v == 'bereich:Privat'][0]
        mit_privat = [f for f, s in t['relationen'] if privat in s]
        assert len(mit_privat) == 2, t
        assert all(len([x for x in s if namen[x].startswith('bereich:')]) == 1 for f, s in t['relationen']), 'mehrere Bereiche an einer Datei'

        schritt('Link teilen: Foto mit GPS, Standort wird entfernt, Gästeseite zeigt es')
        page.get_by_role('button', name='Auswählen').click()
        foto = page.locator('.kachel[aria-label^="Foto vom 14."]')
        foto.click()
        page.locator('.leiste').get_by_role('button', name='Link').click()
        page.locator('.blatt input[aria-label=Name]').fill('Kassel Test')
        page.get_by_role('button', name='Link erstellen').click()
        expect(page.get_by_role('button', name='Link kopieren', exact=True)).to_be_visible(timeout=15000)
        expect(page.locator('.blatt')).to_contain_text('Standort entfernt aus 1 von 1')
        kopie = get('/__test/datei?p=' + urllib.parse.quote('/Fotos/Geteilt/Kassel Test/IMG_20261114_184200.jpg'))
        import piexif
        ex = piexif.load(kopie)
        assert ex['GPS'] == {}, ex['GPS']
        orig = get('/__test/datei?p=' + urllib.parse.quote('/SofortUpload/Camera/IMG_20261114_184200.jpg'))
        assert piexif.load(orig)['GPS'] != {}, 'Original wurde verändert'
        page.get_by_role('button', name='Link kopieren', exact=True).click()
        gast = page.evaluate('navigator.clipboard.readText()')
        assert 'gast.html#z' in gast, gast
        page.keyboard.press('Escape')
        expect(page.locator('.blatt')).to_have_count(0)
        expect(page.locator('.leiste').get_by_role('button', name='Geteilt')).to_be_visible()
        gp = ctx.new_page()
        gp.on('pageerror', lambda e: fehler.append('Gast: ' + str(e)))
        gp.goto(gast)
        expect(gp.get_by_role('heading', name='Kassel Test')).to_be_visible()
        gp.wait_for_function("() => { const i = document.querySelector('.mauer img'); return i && i.complete && i.naturalWidth > 0; }", timeout=10000)
        gp.locator('.mauer button').first.click()
        expect(gp.locator('.ansicht img')).to_be_visible()
        gp.close()

        schritt('Geteilt-Liste zeigt den Link')
        page.locator('.leiste').get_by_role('button', name='Geteilt').click()
        expect(page.get_by_role('heading', name='Kassel Test')).to_be_visible()

        schritt('Aufräumen: Screenshots – behalten, löschen, Rückgängig, löschen')
        page.locator('.leiste').get_by_role('button', name='Aufräumen').click()
        expect(page.locator('.kopf .klein')).to_have_text('1 / 3')
        page.get_by_role('button', name='Behalten').click()
        expect(page.locator('.kopf .klein')).to_have_text('2 / 3')
        page.get_by_role('button', name='Löschen').click()
        page.locator('.toast').get_by_role('button', name='Rückgängig').click()
        expect(page.locator('.kopf .klein')).to_have_text('2 / 3')
        page.get_by_role('button', name='Löschen').click()
        vorher = len([x for x in liste() if x.startswith('/Fotos/Screenshots/') and x.endswith('.jpg')])
        time.sleep(6.8)
        nachher = len([x for x in liste() if x.startswith('/Fotos/Screenshots/') and x.endswith('.jpg')])
        assert vorher == 3 and nachher == 2, (vorher, nachher)
        page.get_by_role('button', name='Behalten').click()
        expect(page.get_by_role('heading', name='Fertig für heute')).to_be_visible()
        time.sleep(1.8)
        status = json.loads(get('/__test/datei?p=' + urllib.parse.quote('/Fotos/.fotoapp/status.json')))
        assert len(status['geprueft']) == 2, status

        schritt('Hochladen über +')
        page.locator('.leiste').get_by_role('button', name='Galerie').click()
        page.get_by_role('button', name='Fotos hinzufügen').click()
        with page.expect_file_chooser() as fc:
            page.get_by_role('button', name='Fotos und Videos auswählen').click()
        fc.value.set_files(os.path.join(HIER, 'daten', 'mit-gps.jpg'))
        expect(page.locator('.toast')).to_contain_text('Hochgeladen', timeout=10000)
        assert any(x.startswith('/Fotos/Kamera/') and x.endswith('mit-gps.jpg') for x in liste()), liste()
        expect(page.locator('.kachel')).to_have_count(5)

        schritt('Einstellungen: Logo zeigt die Gebetszeiten aus der Liste „Gebete“, neue Kategorie erscheint im Filter')
        page.get_by_role('button', name='Einstellungen').click()
        himmel = page.locator('section').filter(has_text='Himmel im Logo')
        expect(himmel.locator('.gebetszeiten')).to_contain_text('05:41')
        expect(himmel.locator('.gebetszeiten')).to_contain_text('18:05')
        expect(himmel).to_contain_text('dieselben wie in Indibat')
        page.get_by_placeholder('z. B. Anlass').fill('Anlass')
        page.get_by_placeholder('Feier, Reise, Alltag').fill('Feier, Reise')
        page.get_by_role('button', name='Kategorie hinzufügen').click()
        expect(page.locator('section').filter(has_text='Kategorien').get_by_text('Anlass')).to_be_visible()
        bp = json.loads(get('/__test/datei?p=' + urllib.parse.quote('/Fotos/.fotoapp/kategorien.json')))
        assert any(k['id'] == 'anlass' for k in bp['kategorien']), bp
        page.get_by_role('button', name='Zurück').click()
        page.get_by_role('button', name='Filter').click()
        expect(page.locator('.blatt').get_by_role('button', name='Reise')).to_be_visible()
        page.get_by_role('button', name='Anzeigen').click()

        schritt('Neu laden: Galerie kommt aus dem Zwischenspeicher sofort')
        page.reload()
        expect(page.locator('.kachel')).to_have_count(5, timeout=5000)
        page.screenshot(path=os.path.join(HIER, 'galerie.png'))
        browser.close()
    # 404/405/409 sind gewollt: Existenzprüfungen (PROPFIND), schon vorhandene Ordner (MKCOL), fehlende Videovorschau
    erwartet = [f for f in fehler if not any(c in f for c in ('401', '404', '405', '409', 'favicon'))]
    if erwartet:
        print('Browser-Fehler:', *erwartet, sep='\n  ')
        sys.exit(1)
    print('ALLES OK')
finally:
    mock.terminate(); web.terminate()
