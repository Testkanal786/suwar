# Prüfstand: macht unsichtbar Bilder der wichtigsten Bildschirme – hell und dunkel – und Filmstreifen der Übergänge.
# Gegen die Nextcloud-Attrappe aus test/, ändert nichts an echten Daten.
# Aufruf: python3 werkzeuge/pruefen/bilder.py      Ergebnis: werkzeuge/pruefen/ergebnis/ (Bilder + bericht.md)
# Danach die Bilder tatsächlich ansehen (DESIGN.md 8). Neue Bildschirme/Übergänge hier ergänzen.
import os, shutil, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(os.path.dirname(HIER))
ZIEL = os.path.join(HIER, 'ergebnis')
NC, APP = 'http://localhost:8091', 'http://localhost:8081/'
BREITE, HOEHE = 390, 844

shutil.rmtree(ZIEL, ignore_errors=True)
os.makedirs(ZIEL)
saat = tempfile.mkdtemp()
shutil.copytree(os.path.join(WURZEL, 'test', 'daten', 'seed'), os.path.join(saat, 'seed'))
mock = subprocess.Popen(['node', os.path.join(WURZEL, 'test', 'mock-nextcloud.js'), '8091', os.path.join(saat, 'seed')], stdout=subprocess.DEVNULL)
web = subprocess.Popen([sys.executable, '-m', 'http.server', '8081', '-d', WURZEL], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
bericht, fehler = [], []


def anmelden(seite):
    seite.goto(APP)
    seite.wait_for_selector('input[type=url]')
    seite.fill('input[type=url]', NC)
    seite.fill('input[autocomplete=username]', 'elias')
    seite.fill('input[type=password]', 'test-app-passwort')
    seite.click('button[type=submit]')
    seite.wait_for_selector('h1:has-text("Einrichtung"), .kachel', timeout=20000)
    if seite.get_by_role('button', name='Einrichten').count():  # nur beim ersten Durchlauf
        seite.get_by_role('button', name='Einrichten').click()
        seite.wait_for_selector('text=Fertig.', timeout=20000)
        seite.get_by_role('button', name='Zur Galerie').click()
    seite.wait_for_selector('.kachel img.da', timeout=20000)
    seite.wait_for_timeout(600)


def bild(seite, name):
    seite.wait_for_timeout(350)
    datei = os.path.join(ZIEL, f'{name}.png')
    seite.screenshot(path=datei)
    bericht.append(f'- {name}.png')


def filmstreifen(seite, name, ausloesen, bilder=8, abstand=45):
    # Bewegungen auf ein Zehntel verlangsamen und Einzelbilder nebeneinander legen
    cdp = seite.context.new_cdp_session(seite)
    cdp.send('Animation.enable')
    cdp.send('Animation.setPlaybackRate', {'playbackRate': 0.1})
    ausloesen()
    dateien = []
    for i in range(bilder):
        d = os.path.join(ZIEL, f'_{name}_{i}.png')
        seite.screenshot(path=d)
        dateien.append(d)
        seite.wait_for_timeout(abstand * 10 // 2)
    cdp.send('Animation.setPlaybackRate', {'playbackRate': 1})
    ziel = os.path.join(ZIEL, f'film-{name}.png')
    subprocess.run(['convert', *dateien, '-resize', '50%', '+append', ziel], check=True)
    for d in dateien: os.remove(d)
    bericht.append(f'- film-{name}.png ({bilder} Bilder)')


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for thema in ('hell', 'dunkel'):
            bericht.append(f'\n## {thema}')
            ctx = browser.new_context(viewport={'width': BREITE, 'height': HOEHE}, device_scale_factor=2,
                                      color_scheme='light' if thema == 'hell' else 'dark', timezone_id='Europe/Berlin')
            seite = ctx.new_page()
            seite.on('pageerror', lambda e: fehler.append(f'{thema}: {e}'))
            seite.goto(APP)
            seite.wait_for_selector('input[type=url]')
            bild(seite, f'{thema}-1-anmeldung')
            anmelden(seite)
            bild(seite, f'{thema}-2-galerie')
            seite.locator('.kachel').first.click()
            seite.wait_for_selector('.buehne img.voll')
            seite.wait_for_timeout(800)
            bild(seite, f'{thema}-3-grossansicht')
            seite.get_by_role('button', name='Info').click()
            bild(seite, f'{thema}-4-grossansicht-info')
            seite.keyboard.press('Escape')
            seite.wait_for_timeout(500)
            seite.get_by_role('button', name='Filter').first.click()
            bild(seite, f'{thema}-5-filter')
            seite.keyboard.press('Escape')
            seite.wait_for_timeout(500)
            seite.get_by_role('link', name='Aufräumen').or_(seite.get_by_role('button', name='Aufräumen')).first.click()
            seite.wait_for_timeout(800)
            bild(seite, f'{thema}-6-aufraeumen')
            seite.get_by_role('link', name='Galerie').or_(seite.get_by_role('button', name='Galerie')).first.click()
            seite.wait_for_timeout(500)
            seite.get_by_role('button', name='Einstellungen').click()
            seite.wait_for_timeout(600)
            bild(seite, f'{thema}-7-einstellungen')
            if thema == 'hell':
                seite.get_by_role('link', name='Galerie').or_(seite.get_by_role('button', name='Galerie')).first.click()
                seite.wait_for_timeout(500)
                filmstreifen(seite, 'grossansicht-oeffnen', lambda: seite.locator('.kachel').nth(1).click())
                seite.wait_for_timeout(800)
                def herunterziehen():
                    bx = seite.locator('.buehne').bounding_box()
                    x, y = bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 3
                    seite.mouse.move(x, y); seite.mouse.down()
                    for d in range(1, 9): seite.mouse.move(x, y + d * 24); seite.wait_for_timeout(16)
                    seite.mouse.up()
                seite.keyboard.press('ArrowRight'); seite.wait_for_timeout(800)  # Foto 3, damit die Galerie scrollen muss
                filmstreifen(seite, 'herunterziehen-schliessen', herunterziehen)
                seite.wait_for_timeout(600)
                filmstreifen(seite, 'filter-blatt', lambda: seite.get_by_role('button', name='Filter').first.click())
            ctx.close()
        browser.close()
finally:
    mock.terminate(); web.terminate()
    shutil.rmtree(saat, ignore_errors=True)

with open(os.path.join(ZIEL, 'bericht.md'), 'w') as f:
    f.write('# Prüfstand Suwar\n' + '\n'.join(bericht) + '\n\n## Seitenfehler\n' + ('\n'.join(fehler) or 'keine') + '\n')
print('\n'.join(bericht))
print('Seitenfehler:', fehler or 'keine')
