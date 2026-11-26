# Gesten: Galerie-Zoom (Kachelgröße) und Großansicht per Herunterziehen schließen – zurück an die Stelle des Fotos.
# Aufruf: python3 test/gesten.py   (gegen die Nextcloud-Attrappe, wie e2e.py)
import os, shutil, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright, expect

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
saat = tempfile.mkdtemp()
shutil.copytree(os.path.join(HIER, 'daten', 'seed'), os.path.join(saat, 'seed'))
mock = subprocess.Popen(['node', os.path.join(HIER, 'mock-nextcloud.js'), '8092', os.path.join(saat, 'seed')], stdout=subprocess.DEVNULL)
web = subprocess.Popen([sys.executable, '-m', 'http.server', '8082', '-d', WURZEL], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
fehler = []

def schritt(t): print('•', t)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        seite = b.new_page(viewport={'width': 390, 'height': 520})
        seite.on('pageerror', lambda e: fehler.append(str(e)))
        seite.goto('http://localhost:8082/')
        seite.fill('input[type=url]', 'http://localhost:8092')
        seite.fill('input[autocomplete=username]', 'elias')
        seite.fill('input[type=password]', 'test-app-passwort')
        seite.click('button[type=submit]')
        seite.get_by_role('button', name='Einrichten').click()
        seite.wait_for_selector('text=Fertig.', timeout=20000)
        seite.get_by_role('button', name='Zur Galerie').click()
        seite.wait_for_selector('.kachel img.da', timeout=20000)
        spalten = lambda: seite.evaluate("getComputedStyle(document.querySelector('.raster')).gridTemplateColumns.split(' ').length")

        schritt('Galerie-Zoom: Strg + Mausrad ändert die Zahl der Spalten, nicht die Seite')
        assert spalten() == 4, spalten()
        k = seite.locator('.kachel').first.bounding_box()
        seite.mouse.move(k['x'] + 20, k['y'] + 20)
        seite.keyboard.down('Control')
        for _ in range(3): seite.mouse.wheel(0, -40)
        seite.keyboard.up('Control')
        seite.wait_for_timeout(400)
        assert spalten() == 3, spalten()
        seite.keyboard.down('Control')
        for _ in range(6): seite.mouse.wheel(0, -40)
        seite.keyboard.up('Control')
        seite.wait_for_timeout(400)
        assert spalten() == 2, spalten()
        assert seite.evaluate('visualViewport.scale') == 1
        seite.reload()
        seite.wait_for_selector('.kachel img.da', timeout=20000)
        assert spalten() == 2, 'Spaltenzahl nicht gemerkt'

        schritt('Herunterziehen schließt die Großansicht und die Galerie steht beim Foto')
        assert seite.evaluate('document.documentElement.scrollHeight > innerHeight'), 'Seite zu kurz für den Test'
        # erstes Foto öffnen, zum dritten blättern (das zweite ist ein Video), dann herunterziehen
        seite.locator('.kachel').first.click()
        seite.wait_for_selector('.buehne img.voll')
        for _ in range(2): seite.keyboard.press('ArrowRight'); seite.wait_for_timeout(500)
        seite.wait_for_selector('.buehne img.voll')
        ziel_id = seite.evaluate("document.querySelector('.ansicht-titel span').textContent")
        seite.evaluate('window.scrollTo(0, 0)')  # Galerie absichtlich verschoben
        bx = seite.locator('.buehne').bounding_box()
        x, y = bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 3
        seite.mouse.move(x, y); seite.mouse.down()
        for d in range(1, 11): seite.mouse.move(x, y + d * 22); seite.wait_for_timeout(16)
        seite.mouse.up()
        expect(seite.locator('.ansicht')).to_have_count(0, timeout=3000)
        assert '3 von 3' in ziel_id, ziel_id
        assert seite.evaluate('scrollY') > 0, 'Galerie steht noch oben'
        dritte = seite.locator('.kachel').nth(2).bounding_box()
        assert 0 <= dritte['y'] and dritte['y'] + dritte['height'] <= 520, f'Foto nicht im Blick: {dritte}'

        schritt('Kurzes Ziehen schnappt zurück, die Großansicht bleibt offen')
        seite.locator('.kachel').first.click()
        seite.wait_for_selector('.buehne img.voll')
        seite.wait_for_timeout(500)
        bx = seite.locator('.buehne').bounding_box()
        x, y = bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 3
        seite.mouse.move(x, y); seite.mouse.down()
        for d in range(1, 4): seite.mouse.move(x, y + d * 15); seite.wait_for_timeout(60)
        seite.mouse.up()
        seite.wait_for_timeout(500)
        expect(seite.locator('.ansicht')).to_have_count(1)
        assert seite.evaluate("getComputedStyle(document.querySelector('.ansicht')).getPropertyValue('--deckung').trim()") == '1'
        b.close()
finally:
    mock.terminate(); web.terminate(); shutil.rmtree(saat, ignore_errors=True)

assert not fehler, fehler
print('GESTEN OK')
