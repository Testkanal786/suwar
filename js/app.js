'use strict';
// Suwar – Oberfläche. Galerie, Großansicht, Aufräumen, Teilen, Hochladen, Einstellungen.
/* global NC, Medien, SuwarStandort */
(() => {
  const VERSION = '0.1.5';
  const app = document.getElementById('app');
  const pad = (n) => String(n).padStart(2, '0');
  const istAndroid = /Android/i.test(navigator.userAgent);
  const GAST_BASIS = new URL('gast.html', location.href).href.split('#')[0];

  /* ---------- Bausteine ---------- */
  // Inhalt ersetzen; leere Einträge (null, false) werden übersprungen, verschachtelte Listen geglättet.
  const fuelle = (el, ...kinder) => el.replaceChildren(...kinder.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
  function h(tag, attrs, ...kinder) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kind of kinder.flat(Infinity)) if (kind != null && kind !== false) el.append(kind.nodeType ? kind : document.createTextNode(String(kind)));
    return el;
  }
  const PFADE = {
    suche: 'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm11 4-6-6', filter: 'M4 6h16M7 12h10M10 18h4', plus: 'M12 5v14M5 12h14',
    galerie: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', gemeinsam: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6',
    aufraeumen: 'M7 12h10M13 8l4 4-4 4M4 5v14M20 5v14', geteilt: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    x: 'M6 6l12 12M18 6 6 18', haken: 'M5 12l5 5 9-10', zurueck: 'M15 5l-7 7 7 7', rueckgaengig: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    laden: 'M12 4v11M7 10l5 5 5-5M5 20h14', hoch: 'M12 20V9M7 14l5-5 5 5M5 4h14', abspielen: 'M8 5l11 7-11 7z', tag: 'M3 12V4h8l10 10-8 8L3 12ZM7.5 7.5h.01',
    papierkorb: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01', kamera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    teilen: 'M12 3v12M7 8l5-5 5 5M5 13v7h14v-7', kopieren: 'M9 9h11v11H9zM5 15V4h11', ordner: 'M3 6h6l2 2h10v11H3z', schloss: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
    standort: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', neu: 'M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0 0 12 3M19 9A7 7 0 0 0 7 6',
  };
  function ic(name, groesse = 22, farbe = 'currentColor') {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ width: groesse, height: groesse, viewBox: '0 0 24 24', fill: name === 'abspielen' ? farbe : 'none', stroke: farbe, 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', PFADE[name] || '');
    s.append(p);
    return s;
  }
  let toastTimer = 0;
  function toast(text, aktion) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = h('div', { class: 'toast', role: 'status' }, h('span', null, text), aktion && h('button', { onclick: () => { el.remove(); aktion.fn(); } }, aktion.text));
    document.body.append(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.add('zu'); setTimeout(() => el.remove(), 200); }, aktion ? 7000 : 3500);
  }
  const fehler = (e) => { console.error(e); toast(e && e.message ? e.message : 'Unbekannter Fehler'); };
  const datumLang = (t) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const datumKurz = (t) => new Date(t).toLocaleString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const groesseText = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
  const dauerText = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;

  /* ---------- Ebenen (Blätter, Großansicht) mit Zurück-Taste ---------- */
  const ebenen = [];
  function ebeneOeffnen(el, beimSchliessen) {
    document.body.append(el);
    ebenen.push({ el, beimSchliessen });
    history.pushState({ ebene: ebenen.length }, '');
    return () => { if (ebenen.some((e) => e.el === el)) history.back(); };
  }
  const wenigBewegung = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function obersteSchliessen() {
    const e = ebenen.pop();
    if (!e) return false;
    // erst ausblenden, dann entfernen – nichts verschwindet schlagartig
    if (wenigBewegung()) e.el.remove();
    else { e.el.classList.add('zu'); setTimeout(() => e.el.remove(), 200); }
    if (e.beimSchliessen) e.beimSchliessen();
    return true;
  }
  window.addEventListener('popstate', () => { if (!obersteSchliessen()) zeichne(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ebenen.length && !ebenen[ebenen.length - 1].el.classList.contains('ansicht')) history.back(); });
  function blatt(titel, inhalt, beimSchliessen) {
    let zu;
    const el = h('div', { class: 'schleier', onclick: (e) => { if (e.target === el) zu(); } },
      h('div', { class: 'blatt', role: 'dialog', 'aria-label': titel }, h('div', { class: 'griff' }), h('h2', null, titel), inhalt));
    zu = ebeneOeffnen(el, beimSchliessen);
    return zu;
  }

  /* ---------- Konto ---------- */
  const kontoLesen = () => { try { return JSON.parse(localStorage.getItem('suwar-konto') || 'null'); } catch { return null; } };
  const kontoSpeichern = (k) => (k ? localStorage.setItem('suwar-konto', JSON.stringify(k)) : localStorage.removeItem('suwar-konto'));

  /* ---------- Zustand ---------- */
  const S = {
    sicht: (location.hash || '#galerie').slice(1),
    filter: Medien.filterLeer(),
    auswahl: null, // Set von IDs im Auswahlmodus
    sichtbar: 240,
    aufr: { menge: 'screenshots', warte: [], index: 0, verlauf: [] },
  };
  const loeschWarte = new Map(); // Datei-ID → Timer (Löschen wird kurz verzögert, damit „Rückgängig“ greift)

  /* ---------- Vorschaubilder ---------- */
  let vorschauGeht = null; // null = noch unbekannt, false = Vorschau-Schnittstelle nicht erreichbar → selbst verkleinern
  const urlCache = new Map();
  let laufend = 0;
  const schlange = [];
  function begrenzt(fn) {
    return new Promise((ok, nein) => {
      schlange.push(async () => { try { ok(await fn()); } catch (e) { nein(e); } finally { laufend--; weiter(); } });
      weiter();
    });
  }
  function weiter() { while (laufend < 6 && schlange.length) { laufend++; schlange.shift()(); } }
  async function verkleinern(blob, px, quadrat) {
    const bmp = await createImageBitmap(blob);
    const s = quadrat ? px / Math.min(bmp.width, bmp.height) : Math.min(1, px / Math.max(bmp.width, bmp.height));
    const w = quadrat ? px : Math.round(bmp.width * s);
    const hh = quadrat ? px : Math.round(bmp.height * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = hh;
    const g = c.getContext('2d');
    g.drawImage(bmp, (w - bmp.width * s) / 2, (hh - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    bmp.close && bmp.close();
    return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.84));
  }
  async function vorschauErzeugen(m, px) {
    if (vorschauGeht !== false && m.vorschau !== false) {
      try { const b = await NC.vorschau(m.id, px); vorschauGeht = true; return b; }
      catch (e) { if (vorschauGeht === null && !e.status) vorschauGeht = false; }
    }
    if (m.video || m.groesse > 30e6) return null;
    try { return await verkleinern(await NC.holen(m.pfad), px, px <= 400); } catch { return null; }
  }
  async function vorschauUrl(m, px) {
    const key = `${m.id}-${m.etag}-${px}`;
    if (urlCache.has(key)) return urlCache.get(key);
    let blob = null;
    let c = null;
    try { c = await caches.open('suwar-vorschau'); const r = await c.match(`./v/${key}`); if (r) blob = await r.blob(); } catch { /* ohne Zwischenspeicher */ }
    if (!blob) {
      blob = await begrenzt(() => vorschauErzeugen(m, px));
      if (blob && c) c.put(`./v/${key}`, new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })).catch(() => {});
    }
    const u = blob ? URL.createObjectURL(blob) : null;
    urlCache.set(key, u);
    return u;
  }
  const sichtbarBeobachter = new IntersectionObserver((eintraege) => {
    for (const e of eintraege) {
      if (!e.isIntersecting) continue;
      sichtbarBeobachter.unobserve(e.target);
      const m = Medien.zustand.nachId.get(e.target.dataset.id);
      if (!m) continue;
      vorschauUrl(m, 256).then((u) => { const img = e.target.querySelector('img'); if (u && img) { img.onload = () => img.classList.add('da'); img.src = u; } }).catch(() => {});
    }
  }, { rootMargin: '600px 0px' });

  /* ---------- Hilfen für Dateien ---------- */
  async function dateiAlsMedium(pfad) {
    const r = await NC.propfind(pfad, 0);
    if (!r || !r[0]) return null;
    const d = r[0];
    return { id: d.id, pfad, mime: d.typ, groesse: d.groesse, geaendert: d.geaendert, aufnahme: 0, etag: d.etag, favorit: false, vorschau: true, gps: null };
  }
  async function dateienHochladen(dateien, zielOrdner) {
    const liste = [...dateien].filter((f) => f && f.size);
    if (!liste.length) return;
    let fertig = 0;
    toast(liste.length === 1 ? 'Wird hochgeladen …' : `${liste.length} Dateien werden hochgeladen …`);
    for (const f of liste) {
      try {
        const d = new Date(f.lastModified || Date.now());
        const ordner = zielOrdner || `/Fotos/Kamera/${d.getFullYear()}/${pad(d.getMonth() + 1)}`;
        await NC.ordnerAnlegen(ordner);
        const name = await NC.freierName(ordner, f.name || `Foto ${Date.now()}.jpg`);
        await NC.hochladen(`${ordner}/${name}`, f, { typ: f.type, mtime: f.lastModified });
        const m = await dateiAlsMedium(`${ordner}/${name}`);
        if (m) Medien.lokalHinzufuegen(m);
        fertig++;
      } catch (e) { fehler(e); }
    }
    toast(fertig === liste.length ? (fertig === 1 ? 'Hochgeladen' : `${fertig} Dateien hochgeladen`) : `${fertig} von ${liste.length} hochgeladen`);
  }
  // Über das Teilen-Menü von Android empfangene Dateien (der Service-Worker hat sie zwischengespeichert)
  async function geteiltAbholen() {
    if (!('caches' in window)) return;
    const c = await caches.open('suwar-geteilt');
    const keys = await c.keys();
    if (!keys.length) return;
    const dateien = [];
    for (const k of keys) {
      const r = await c.match(k);
      const b = await r.blob();
      dateien.push(new File([b], decodeURIComponent(r.headers.get('X-Name') || 'Foto.jpg'), { type: b.type, lastModified: parseInt(r.headers.get('X-Zeit') || '0', 10) || Date.now() }));
      await c.delete(k);
    }
    await dateienHochladen(dateien);
  }

  /* ---------- Ansichten ---------- */
  function wechseln(sicht) {
    if (S.sicht === sicht) return;
    S.sicht = sicht; S.auswahl = null; S.einblenden = true;
    history.replaceState(null, '', '#' + sicht);
    window.scrollTo(0, 0);
    if (sicht === 'aufraeumen') aufrStarten();
    zeichne();
  }
  function leiste() {
    const punkte = [['galerie', 'Galerie'], ['gemeinsam', 'Gemeinsam'], ['aufraeumen', 'Aufräumen'], ['geteilt', 'Geteilt']];
    return h('nav', { class: 'leiste', 'aria-label': 'Hauptmenü' }, punkte.map(([id, text]) =>
      h('button', { class: S.sicht === id ? 'an' : '', 'aria-current': S.sicht === id ? 'page' : null, onclick: () => wechseln(id) }, ic(id), text)));
  }
  function zeichne() {
    const k = NC.konto;
    if (!k) return zeigeAnmeldung();
    const ansichten = { galerie: galerieSeite, gemeinsam: gemeinsamSeite, aufraeumen: aufrSeite, geteilt: geteiltSeite, einstellungen: einstellungenSeite, einrichtung: einrichtungSeite };
    const fn = ansichten[S.sicht] || galerieSeite;
    const teile = fn();
    // Nur beim Wechsel der Ansicht sanft einblenden, nicht bei jeder Aktualisierung
    if (S.einblenden) { S.einblenden = false; for (const t of teile) if (t && t.tagName === 'MAIN') t.classList.add('einblenden'); }
    fuelle(app, ...teile);
  }

  /* ----- Galerie ----- */
  let rasterEl = null;
  let chipsEl = null;
  let filterKnopf = null;
  function galerieSeite() {
    const suche = h('input', { type: 'search', placeholder: 'Fotos durchsuchen', 'aria-label': 'Fotos durchsuchen', value: S.filter.text, oninput: (e) => { S.filter.text = e.target.value; clearTimeout(suche._t); suche._t = setTimeout(rasterNeu, 180); } });
    filterKnopf = h('button', { class: 'rund', 'aria-label': 'Filter', onclick: filterBlatt }, ic('filter', 20));
    const kopf = h('header', { class: 'kopf' },
      h('div', { class: 'kopf-zeile' },
        h('label', { class: 'suche' }, ic('suche', 20, '#6B6B66'), suche, h('button', { class: 'konto-knopf', 'aria-label': 'Einstellungen', onclick: () => wechseln('einstellungen') }, ((NC.konto.uid || NC.konto.user)[0] || '?').toUpperCase())),
        filterKnopf,
        h('button', { class: 'rund dunkel', 'aria-label': 'Fotos hinzufügen', onclick: plusBlatt }, ic('plus', 20))));
    chipsEl = h('div', { class: 'chips' });
    kopf.append(chipsEl);
    rasterEl = h('main', { class: 'inhalt' });
    rasterNeu();
    return [kopf, rasterEl, S.auswahl ? auswahlLeiste() : leiste()];
  }
  function chipsNeu(anzahlTreffer) {
    if (!chipsEl) return;
    const f = S.filter;
    const n = Medien.filterAnzahl(f);
    fuelle(filterKnopf, ic('filter', 20), n ? h('span', { class: 'zaehler' }, n) : null);
    const chips = [];
    if (S.auswahl) chips.push(h('span', { class: 'chip an' }, `${S.auswahl.size} ausgewählt`), h('button', { class: 'chip text', onclick: () => { S.auswahl = new Set(Medien.filtern(S.filter).map((m) => m.id)); zeichne(); } }, 'Alle'), h('button', { class: 'chip text', onclick: () => { S.auswahl = null; zeichne(); } }, 'Fertig'));
    else chips.push(h('button', { class: 'chip text', onclick: () => { S.auswahl = new Set(); zeichne(); } }, 'Auswählen'));
    chips.push(h('button', { class: 'chip' + (f.screenshots ? ' an' : ''), 'aria-pressed': String(f.screenshots), onclick: () => { f.screenshots = !f.screenshots; rasterNeu(); } }, 'Screenshots'));
    const weg = (fn) => () => { fn(); rasterNeu(); };
    for (const a of f.arten) chips.push(h('button', { class: 'chip filter', onclick: weg(() => f.arten.delete(a)) }, a, ' ✕'));
    for (const [kat, werte] of Object.entries(f.werte)) for (const w of werte) chips.push(h('button', { class: 'chip filter', onclick: weg(() => werte.delete(w)) }, w || `ohne ${kat}`, ' ✕'));
    for (const pid of f.personen) { const p = Medien.zustand.personen.personen.find((x) => x.id === pid); chips.push(h('button', { class: 'chip filter', onclick: weg(() => f.personen.delete(pid)) }, p ? p.name : 'Person', ' ✕')); }
    for (const o of f.orte) chips.push(h('button', { class: 'chip filter', onclick: weg(() => f.orte.delete(o)) }, o, ' ✕'));
    if (f.jahr) chips.push(h('button', { class: 'chip filter', onclick: weg(() => { f.jahr = ''; }) }, f.jahr, ' ✕'));
    if (f.monat) chips.push(h('button', { class: 'chip filter', onclick: weg(() => { f.monat = ''; }) }, Medien.MONATE[+f.monat], ' ✕'));
    if (anzahlTreffer != null && (n || f.text)) chips.push(h('span', { class: 'chip text' }, `${anzahlTreffer} Treffer`));
    fuelle(chipsEl, ...chips);
  }
  let aktuelleListe = [];
  // Wie viele Treffer gäbe es mit eingeblendeten Screenshots? (für die Leer-Meldung)
  const ausgeblendeteScreenshots = () => (S.filter.screenshots ? 0 : Medien.filtern({ ...S.filter, screenshots: true }).length);
  function rasterNeu() {
    if (!rasterEl) return;
    const z = Medien.zustand;
    aktuelleListe = Medien.filtern(S.filter);
    chipsNeu(aktuelleListe.length);
    const teile = [];
    if (z.laedt) teile.push(h('div', { class: 'ladestreifen', role: 'progressbar', 'aria-label': 'Wird abgeglichen' }));
    if (!aktuelleListe.length) {
      teile.push(z.laedt && !z.liste.length ? h('div', { class: 'leer' }, 'Fotos werden geladen …')
        : !z.liste.length ? h('div', { class: 'leer' }, h('h2', null, 'Noch keine Fotos'), 'Suwar zeigt Fotos und Videos aus ', h('code', null, z.bauplan.quellen.join(', ')), '. Lade mit ', h('b', null, '+'), ' welche hoch oder aktiviere den automatischen Upload in der Nextcloud-App.')
          : ausgeblendeteScreenshots() ? h('div', { class: 'leer' }, h('h2', null, `${ausgeblendeteScreenshots()} Screenshots ausgeblendet`),
            z.liste.every((m) => m.art === 'Screenshot') ? 'Bisher liegen nur Screenshots in deinen Quellordnern. Kamera-Fotos erscheinen, sobald der automatische Upload der Nextcloud-App läuft (Ziel /Fotos/Kamera).' : 'Zu Suche und Filtern passen nur Screenshots.',
            h('div', { class: 'zeile' }, h('button', { class: 'knopf haupt', onclick: () => { S.filter.screenshots = true; rasterNeu(); } }, 'Screenshots anzeigen')))
            : h('div', { class: 'leer' }, h('h2', null, 'Nichts gefunden'), 'Kein Foto passt zu Suche und Filtern.'));
      fuelle(rasterEl, ...teile);
      return;
    }
    const heute = new Date().toDateString();
    let tag = '';
    let raster = null;
    const n = Math.min(S.sichtbar, aktuelleListe.length);
    for (let i = 0; i < n; i++) {
      const m = aktuelleListe[i];
      const d = new Date(m.datum);
      const t = d.toDateString();
      if (t !== tag) {
        tag = t;
        const orte = Medien.orteVon(m);
        teile.push(h('h2', { class: 'tag-kopf' }, h('span', null, t === heute ? 'Heute' : datumLang(m.datum)), orte.length ? h('span', null, orte[0]) : null));
        raster = h('div', { class: 'raster' });
        teile.push(raster);
      }
      raster.append(kachel(m, i));
    }
    if (n < aktuelleListe.length) {
      const mehr = h('div', { class: 'leer' }, 'Weitere werden geladen …');
      new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); S.sichtbar += 240; rasterNeu(); } }, { rootMargin: '800px' }).observe(mehr);
      teile.push(mehr);
    }
    fuelle(rasterEl, ...teile);
  }
  function kachel(m, index) {
    const gewaehlt = S.auswahl && S.auswahl.has(m.id);
    const el = h('button', { class: 'kachel' + (gewaehlt ? ' gewaehlt' : ''), 'data-id': m.id, 'aria-label': `${m.art} vom ${datumKurz(m.datum)}`, 'aria-pressed': S.auswahl ? String(!!gewaehlt) : null },
      h('img', { alt: '', decoding: 'async' }),
      m.video ? h('span', { class: 'marke' }, ic('abspielen', 10, '#fff'), 'Video') : null,
      S.auswahl ? h('span', { class: 'auswahl' }) : null);
    let druck = 0;
    let lang = false;
    el.addEventListener('pointerdown', () => { lang = false; druck = setTimeout(() => { lang = true; if (!S.auswahl) S.auswahl = new Set(); S.auswahl.add(m.id); zeichne(); }, 520); });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(t, () => clearTimeout(druck));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', () => {
      if (lang) return;
      if (S.auswahl) { if (S.auswahl.has(m.id)) S.auswahl.delete(m.id); else S.auswahl.add(m.id); el.classList.toggle('gewaehlt'); el.setAttribute('aria-pressed', String(S.auswahl.has(m.id))); chipsNeu(); return; }
      ansichtOeffnen(aktuelleListe, index);
    });
    sichtbarBeobachter.observe(el);
    const k = `${m.id}-${m.etag}-256`;
    if (urlCache.get(k)) { const img = el.querySelector('img'); img.src = urlCache.get(k); img.classList.add('da'); }
    return el;
  }
  function auswahlLeiste() {
    const ids = () => [...S.auswahl];
    const leer = () => { if (!S.auswahl.size) { toast('Erst Fotos antippen'); return true; } return false; };
    return h('nav', { class: 'leiste aktionen', 'aria-label': 'Auswahl' },
      h('button', { onclick: () => { if (!leer()) teilenBlatt(ids()); } }, ic('geteilt'), 'Link'),
      h('button', { onclick: () => { if (!leer()) zuordnenBlatt(ids()); } }, ic('tag'), 'Zuordnen'),
      h('button', { onclick: () => { if (!leer()) herunterladen(ids()); } }, ic('laden'), 'Laden'),
      h('button', { class: 'gefahr', onclick: () => { if (!leer()) loeschenFragen(ids(), () => { S.auswahl = null; zeichne(); }); } }, ic('papierkorb'), 'Löschen'));
  }

  /* ----- Filter ----- */
  function filterBlatt() {
    const f = S.filter;
    const z = Medien.zustand;
    const umschalter = (set, wert, text) => h('button', { class: 'chip' + (set.has(wert) ? ' an' : ''), 'aria-pressed': String(set.has(wert)), onclick: (e) => { if (set.has(wert)) set.delete(wert); else set.add(wert); e.currentTarget.classList.toggle('an'); e.currentTarget.setAttribute('aria-pressed', String(set.has(wert))); rasterNeu(); } }, text);
    const jahre = [...new Set(z.liste.map((m) => String(new Date(m.datum).getFullYear())))].sort().reverse();
    const inhalt = [
      h('h3', null, 'Art'), h('div', { class: 'chips' }, Medien.ARTEN.map((a) => umschalter(f.arten, a, a))),
      z.bauplan.kategorien.map((k) => { f.werte[k.id] = f.werte[k.id] || new Set(); return [h('h3', null, k.name), h('div', { class: 'chips' }, k.werte.map((w) => umschalter(f.werte[k.id], w, w)), umschalter(f.werte[k.id], '', 'Ohne'))]; }),
      z.personen.personen.length ? [h('h3', null, 'Personen'), h('div', { class: 'chips' }, z.personen.personen.map((p) => umschalter(f.personen, p.id, p.name)))] : null,
      z.bauplan.orte.length ? [h('h3', null, 'Orte'), h('div', { class: 'chips' }, z.bauplan.orte.map((o) => umschalter(f.orte, o.name, o.name)))] : null,
      h('h3', null, 'Zeitraum'),
      h('div', { class: 'zeile' },
        h('label', { class: 'feld' }, 'Jahr', h('select', { onchange: (e) => { f.jahr = e.target.value; rasterNeu(); } }, h('option', { value: '' }, 'Alle'), jahre.map((j) => h('option', { value: j, selected: f.jahr === j ? true : null }, j)))),
        h('label', { class: 'feld' }, 'Monat', h('select', { onchange: (e) => { f.monat = e.target.value; rasterNeu(); } }, h('option', { value: '' }, 'Alle'), Medien.MONATE.map((mo, i) => h('option', { value: String(i), selected: f.monat === String(i) ? true : null }, mo))))),
      h('div', { class: 'zeile' },
        h('button', { class: 'knopf', onclick: () => { const t = f.text; S.filter = Medien.filterLeer(); S.filter.text = t; zu(); rasterNeu(); } }, 'Zurücksetzen'),
        h('button', { class: 'knopf haupt', onclick: () => zu() }, 'Anzeigen')),
    ];
    const zu = blatt('Filter', inhalt);
  }

  /* ----- Plus: Hochladen ----- */
  function plusBlatt() {
    const eingabe = h('input', { type: 'file', multiple: true, accept: 'image/*,video/*', class: 'versteckt', onchange: (e) => { zu(); dateienHochladen(e.target.files); } });
    const zu = blatt('Hinzufügen', [
      eingabe,
      h('button', { class: 'knopf haupt', onclick: () => eingabe.click() }, ic('hoch', 20), 'Fotos und Videos auswählen'),
      h('p', { class: 'hinweis' }, ic('info', 16), h('span', null, istAndroid
        ? 'Am schnellsten: in der Galerie deines Handys Fotos auswählen → Teilen → Suwar. Der automatische Upload der Nextcloud-App läuft etwa alle 15 Minuten; öffnest du die Nextcloud-App kurz, lädt sie sofort hoch. (Direkt aus Suwar starten lässt sie sich nicht – Chrome erlaubt Webseiten das aus Sicherheitsgründen nicht.)'
        : 'Neue Fotos landen in /Fotos/Kamera/Jahr/Monat. Der automatische Upload der Nextcloud-App läuft am zuverlässigsten, wenn die App geöffnet ist.')),
    ]);
  }

  /* ----- Großansicht ----- */
  function ansichtOeffnen(liste, start) {
    let i = start;
    let videoUrl = null;
    let abbruch = null;
    const titel = h('div', { class: 'ansicht-titel' });
    const buehne = h('div', { class: 'buehne' });
    const info = h('div', { class: 'info', 'aria-hidden': 'true' });
    const fuss = h('div', { class: 'ansicht-fuss' });
    const infoKnopf = h('button', { class: 'rund', 'aria-label': 'Informationen', 'aria-pressed': 'false', onclick: () => {
      const offen = info.classList.toggle('offen'); // legt sich über das Bild, verschiebt nichts
      info.setAttribute('aria-hidden', String(!offen)); infoKnopf.setAttribute('aria-pressed', String(offen)); infoKnopf.classList.toggle('an', offen);
    } }, ic('info', 20));
    const el = h('div', { class: 'ansicht', role: 'dialog', 'aria-label': 'Großansicht', tabindex: '-1' },
      h('div', { class: 'ansicht-kopf' }, h('button', { class: 'rund', 'aria-label': 'Schließen', onclick: () => zu() }, ic('zurueck', 20)), titel, infoKnopf),
      h('div', { class: 'ansicht-mitte' }, buehne, info), fuss);
    function aufraeumen() { if (abbruch) abbruch.abort(); if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; } }
    async function zeigen(richtung = 0) {
      aufraeumen();
      const rein = richtung > 0 ? ' rein-rechts' : richtung < 0 ? ' rein-links' : '';
      Object.assign(zoom, { s: 1, tx: 0, ty: 0 });
      const m = liste[i];
      if (!m) { zu(); return; }
      fuelle(titel, h('b', null, datumKurz(m.datum)), h('span', null, `${i + 1} von ${liste.length} · ${m.art}`));
      const orte = Medien.orteVon(m);
      const werte = [...Medien.tagsVon(m.id)].map((t) => t.split(':')[1]);
      fuelle(info, h('span', null, m.name), h('span', null, groesseText(m.groesse)), h('span', null, m.ordner), orte.length ? h('span', null, 'Ort: ' + orte.join(', ')) : null, werte.length ? h('span', null, werte.join(', ')) : null, Medien.personenVon(m.id).map((p) => h('span', null, p.name)));
      fuelle(fuss, 
        h('button', { onclick: () => teilenBlatt([m.id]) }, ic('geteilt'), 'Link'),
        h('button', { onclick: () => zuordnenBlatt([m.id], zeigen) }, ic('tag'), 'Zuordnen'),
        m.video ? h('button', { id: 'standbild', disabled: true, onclick: () => standbild(m) }, ic('kamera'), 'Standbild') : null,
        h('button', { onclick: () => herunterladen([m.id]) }, ic('laden'), 'Laden'),
        h('button', { onclick: () => loeschenFragen([m.id], () => { liste.splice(i, 1); if (i >= liste.length) i = liste.length - 1; zeigen(); }) }, ic('papierkorb'), 'Löschen'));
      if (m.video) {
        const klein = await vorschauUrl(m, 512).catch(() => null);
        if (liste[i] !== m) return;
        const lade = h('div', { class: 'lade' }, 'Video wird geladen …');
        fuelle(buehne, klein ? h('img', { class: 'voll' + rein, src: klein, alt: '' }) : '', lade);
        abbruch = new AbortController();
        try {
          const blob = await NC.holen(m.pfad, { signal: abbruch.signal, fortschritt: (p) => { lade.textContent = `Video wird geladen … ${Math.round(p * 100)} %`; } });
          if (liste[i] !== m) return;
          videoUrl = URL.createObjectURL(blob);
          const v = h('video', { class: 'weich', src: videoUrl, controls: true, playsinline: true, autoplay: true });
          fuelle(buehne, v);
          v.addEventListener('loadeddata', () => { const k = fuss.querySelector('#standbild'); if (k) k.disabled = false; });
        } catch (e) { if (e.name !== 'AbortError') lade.textContent = 'Video nicht geladen: ' + e.message; }
        return;
      }
      // Erst ein kleines Bild mit echtem Seitenverhältnis in voller Anzeigegröße (unscharf), dann dasselbe scharf:
      // Größe und Form bleiben gleich, das Bild wird nur „nachgeschärft“.
      const mittel = await vorschauUrl(m, 512).catch(() => null);
      if (liste[i] !== m) return;
      const img = h('img', { class: 'voll' + rein, alt: m.name, src: mittel || null });
      fuelle(buehne, img);
      for (const n of [liste[i + 1], liste[i - 1]]) if (n && !n.video) vorschauUrl(n, 512).catch(() => {});
      try {
        let gross = null;
        if (vorschauGeht !== false) gross = await NC.vorschau(m.id, 2048).catch(() => null);
        if (!gross) gross = await NC.holen(m.pfad);
        if (liste[i] !== m) return;
        const u = URL.createObjectURL(gross);
        const neu = new Image();
        neu.src = u;
        await neu.decode().catch(() => {}); // erst fertig entschlüsseln, dann tauschen – kein Flackern
        if (liste[i] !== m) { URL.revokeObjectURL(u); return; }
        img.src = u;
        setTimeout(() => URL.revokeObjectURL(u), 60000);
      } catch (e) { if (!mittel) fuelle(buehne, h('div', { class: 'lade' }, 'Bild nicht geladen: ' + e.message)); }
    }
    function blaettern(r) {
      const n = i + r;
      const b = bild();
      if (n < 0 || n >= liste.length) { if (b) { b.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)'; b.style.transform = ''; } return; }
      i = n;
      zeigen(r);
    }
    /* Zoomen: zwei Finger, Doppeltippen, Mausrad. Wischen zum Blättern nur, wenn nicht vergrößert. */
    const zoom = { s: 1, tx: 0, ty: 0 };
    const finger = new Map();
    let geste = null;
    let letzterTipp = null;
    const bild = () => buehne.querySelector('img.voll');
    function zoomSetzen(s, tx, ty, weich) {
      const b = bild();
      if (!b) return;
      s = Math.min(6, Math.max(1, s));
      const r = buehne.getBoundingClientRect();
      const mx = (r.width * (s - 1)) / 2;
      const my = (r.height * (s - 1)) / 2;
      Object.assign(zoom, { s, tx: s === 1 ? 0 : Math.min(mx, Math.max(-mx, tx)), ty: s === 1 ? 0 : Math.min(my, Math.max(-my, ty)) });
      b.style.transition = weich ? 'transform .2s ease-out' : 'none';
      b.style.transform = zoom.s === 1 ? '' : `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.s})`;
      if (zoom.s > 1.8) originalNachladen();
    }
    // Punkt (Bildschirm) → relativ zur Mitte der Bühne
    const relativ = (x, y) => { const r = buehne.getBoundingClientRect(); return { x: x - r.left - r.width / 2, y: y - r.top - r.height / 2 }; };
    // Um einen Punkt herum zoomen: dieser Punkt bleibt unter dem Finger
    function zoomUm(p, s2, s1 = zoom.s, t1 = { x: zoom.tx, y: zoom.ty }, weich = false) {
      zoomSetzen(s2, p.x - (s2 * (p.x - t1.x)) / s1, p.y - (s2 * (p.y - t1.y)) / s1, weich);
    }
    let originalFuer = null;
    async function originalNachladen() {
      const m = liste[i];
      if (!m || m.video || originalFuer === m.id || m.groesse > 40e6 || vorschauGeht === false) return;
      originalFuer = m.id;
      try {
        const blob = await NC.holen(m.pfad);
        const u = URL.createObjectURL(blob);
        const neu = new Image(); neu.src = u; await neu.decode().catch(() => {});
        const b = bild();
        if (liste[i] === m && b) { b.src = u; setTimeout(() => URL.revokeObjectURL(u), 60000); } else URL.revokeObjectURL(u);
      } catch { /* bleibt bei der großen Vorschau */ }
    }
    buehne.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'VIDEO') return;
      buehne.setPointerCapture(e.pointerId);
      finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pkt = [...finger.values()];
      if (pkt.length === 2) {
        const mitte = relativ((pkt[0].x + pkt[1].x) / 2, (pkt[0].y + pkt[1].y) / 2);
        geste = { art: 'pinch', d0: Math.hypot(pkt[0].x - pkt[1].x, pkt[0].y - pkt[1].y), s0: zoom.s, t0: { x: zoom.tx, y: zoom.ty }, m0: mitte };
      } else if (pkt.length === 1) geste = { art: zoom.s > 1 ? 'schieben' : 'wischen', x0: e.clientX, y0: e.clientY, tx0: zoom.tx, ty0: zoom.ty, bewegt: false };
    });
    buehne.addEventListener('pointermove', (e) => {
      if (!finger.has(e.pointerId) || !geste) return;
      finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pkt = [...finger.values()];
      if (geste.art === 'pinch' && pkt.length === 2) {
        const d = Math.hypot(pkt[0].x - pkt[1].x, pkt[0].y - pkt[1].y);
        const mitte = relativ((pkt[0].x + pkt[1].x) / 2, (pkt[0].y + pkt[1].y) / 2);
        const s2 = Math.min(6, Math.max(1, (geste.s0 * d) / geste.d0));
        // Zoom um den Startmittelpunkt, dazu Verschiebung um die Bewegung der Fingermitte
        zoomSetzen(s2, mitte.x - (s2 * (geste.m0.x - geste.t0.x)) / geste.s0, mitte.y - (s2 * (geste.m0.y - geste.t0.y)) / geste.s0);
      } else if (geste.art === 'schieben') {
        zoomSetzen(zoom.s, geste.tx0 + e.clientX - geste.x0, geste.ty0 + e.clientY - geste.y0);
      } else if (geste.art === 'wischen') {
        const b = bild();
        const dx = e.clientX - geste.x0;
        if (b && Math.abs(dx) > Math.abs(e.clientY - geste.y0)) { b.style.transition = 'none'; b.style.transform = `translateX(${dx}px)`; b.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 800)); }
      }
      if (Math.hypot(e.clientX - (geste.x0 || 0), e.clientY - (geste.y0 || 0)) > 10) geste.bewegt = true;
    });
    function loslassen(e) {
      if (!finger.has(e.pointerId)) return;
      finger.delete(e.pointerId);
      if (!geste) return;
      if (geste.art === 'wischen' && finger.size === 0) {
        const dx = e.clientX - geste.x0;
        const dy = e.clientY - geste.y0;
        const b = bild();
        const ziel = i + (dx < 0 ? 1 : -1);
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) && ziel >= 0 && ziel < liste.length) {
          letzterTipp = null;
          if (b) { b.style.transition = 'transform .18s ease-in, opacity .18s ease-in'; b.style.transform = `translateX(${dx < 0 ? -45 : 45}%)`; b.style.opacity = '0'; }
          blaettern(dx < 0 ? 1 : -1);
        } else {
          if (b) { b.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s'; b.style.transform = ''; b.style.opacity = ''; }
          if (!geste.bewegt) doppeltipp(e);
        }
      } else if (geste.art === 'schieben' && finger.size === 0 && !geste.bewegt) doppeltipp(e);
      if (geste.art === 'pinch' && zoom.s < 1.05) zoomSetzen(1, 0, 0, true);
      if (finger.size === 0) geste = null;
      else if (finger.size === 1) { const [p0] = [...finger.values()]; geste = { art: zoom.s > 1 ? 'schieben' : 'wischen', x0: p0.x, y0: p0.y, tx0: zoom.tx, ty0: zoom.ty, bewegt: true }; }
    }
    function doppeltipp(e) {
      const jetzt = Date.now();
      if (letzterTipp && jetzt - letzterTipp.t < 320 && Math.hypot(e.clientX - letzterTipp.x, e.clientY - letzterTipp.y) < 40) {
        letzterTipp = null;
        if (zoom.s > 1) zoomSetzen(1, 0, 0, true); else zoomUm(relativ(e.clientX, e.clientY), 2.5, 1, { x: 0, y: 0 }, true);
      } else letzterTipp = { t: jetzt, x: e.clientX, y: e.clientY };
    }
    buehne.addEventListener('pointerup', loslassen);
    buehne.addEventListener('pointercancel', loslassen);
    buehne.addEventListener('wheel', (e) => {
      if (!bild()) return;
      e.preventDefault();
      zoomUm(relativ(e.clientX, e.clientY), zoom.s * Math.exp(-e.deltaY * 0.0018));
    }, { passive: false });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') blaettern(1);
      if (e.key === 'ArrowLeft') blaettern(-1);
      if (e.key === 'Escape') zu();
      if (e.key === 'i') infoKnopf.click();
      if (e.key === '+' || e.key === '=') zoomUm({ x: 0, y: 0 }, zoom.s * 1.5, zoom.s, { x: zoom.tx, y: zoom.ty }, true);
      if (e.key === '-') zoomUm({ x: 0, y: 0 }, zoom.s / 1.5, zoom.s, { x: zoom.tx, y: zoom.ty }, true);
      if (e.key === '0') zoomSetzen(1, 0, 0, true);
    });
    async function standbild(m) {
      const v = buehne.querySelector('video');
      if (!v || !v.videoWidth) return;
      v.pause();
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
      const stamm = m.name.replace(/\.[^.]+$/, '');
      const zeit = Math.floor(v.currentTime);
      try {
        const name = await NC.freierName(m.ordner, `${stamm}_standbild_${pad(Math.floor(zeit / 60))}-${pad(zeit % 60)}.jpg`);
        await NC.hochladen(`${m.ordner}/${name}`, blob, { typ: 'image/jpeg', mtime: m.datum + zeit * 1000 });
        const neu = await dateiAlsMedium(`${m.ordner}/${name}`);
        if (neu) Medien.lokalHinzufuegen(neu);
        toast('Standbild gespeichert: ' + name);
      } catch (e) { fehler(e); }
    }
    const zu = ebeneOeffnen(el, () => { aufraeumen(); rasterNeu(); });
    el.focus();
    zeigen();
  }

  /* ----- Zuordnen (Kategorien und Personen) ----- */
  function zuordnenBlatt(ids, danach) {
    const z = Medien.zustand;
    const alle = (pruef) => ids.every(pruef);
    const kats = h('div');
    function neu() {
      fuelle(kats, 
        z.bauplan.kategorien.map((k) => [h('h3', null, k.name), h('div', { class: 'chips' }, k.werte.map((w) => {
          const an = alle((id) => Medien.hatWert(id, k.id, w));
          return h('button', { class: 'chip' + (an ? ' an' : ''), 'aria-pressed': String(an), onclick: async () => { try { await Medien.kategorieSetzen(ids, k.id, w, !an); neu(); } catch (e) { fehler(e); } } }, w);
        }))]),
        h('h3', null, 'Personen'),
        h('div', { class: 'chips' }, z.personen.personen.map((p) => {
          const an = alle((id) => (z.personen.fotos[id] || []).includes(p.id));
          return h('button', { class: 'chip' + (an ? ' an' : ''), 'aria-pressed': String(an), onclick: async () => { try { await Medien.personSetzen(ids, p.id, !an); neu(); } catch (e) { fehler(e); } } }, p.name);
        }), h('button', { class: 'chip text', onclick: async () => {
          const name = (prompt('Name der Person') || '').trim();
          if (!name) return;
          try { const p = await Medien.personAnlegen(name); await Medien.personSetzen(ids, p.id, true); neu(); } catch (e) { fehler(e); }
        } }, '+ Person')));
    }
    neu();
    const zu = blatt(ids.length === 1 ? 'Zuordnen' : `${ids.length} Fotos zuordnen`, [kats, h('button', { class: 'knopf haupt', onclick: () => zu() }, 'Fertig')], () => { if (danach) danach(); rasterNeu(); });
  }

  /* ----- Löschen ----- */
  function loeschenFragen(ids, danach) {
    const zu = blatt(ids.length === 1 ? 'Foto löschen?' : `${ids.length} Fotos löschen?`, [
      h('p', { class: 'hinweis' }, ic('papierkorb', 16), h('span', null, 'Sie landen im Papierkorb der Nextcloud und lassen sich dort wiederherstellen. Auf dem Handy selbst bleiben sie erhalten.')),
      h('div', { class: 'zeile' }, h('button', { class: 'knopf', onclick: () => zu() }, 'Abbrechen'), h('button', { class: 'knopf gefahr', onclick: async () => {
        zu();
        let ok = 0;
        for (const id of ids) { const m = Medien.zustand.nachId.get(id); if (!m) continue; try { await NC.loeschen(m.pfad); ok++; Medien.lokalEntfernen([id]); } catch (e) { fehler(e); } }
        toast(`${ok} gelöscht`, { text: 'Papierkorb', fn: () => window.open(NC.papierkorbUrl(), '_blank') });
        if (danach) danach();
      } }, 'Löschen')),
    ]);
  }
  async function herunterladen(ids) {
    for (const id of ids.slice(0, 30)) {
      const m = Medien.zustand.nachId.get(id);
      if (!m) continue;
      try {
        const blob = await NC.holen(m.pfad);
        const u = URL.createObjectURL(blob);
        const a = h('a', { href: u, download: m.name });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 20000);
      } catch (e) { fehler(e); }
    }
    if (ids.length > 30) toast('Die ersten 30 wurden geladen – für mehr einen Link erstellen.');
  }

  /* ----- Teilen per Link ----- */
  const b64url = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  async function packen(obj) {
    const json = new TextEncoder().encode(JSON.stringify(obj));
    if ('CompressionStream' in window) {
      const strom = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return 'z' + b64url(new Uint8Array(await new Response(strom).arrayBuffer()));
    }
    return 'j' + b64url(json);
  }
  const sichererName = (s) => s.replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Fotos';
  function teilenBlatt(ids) {
    const medien = ids.map((id) => Medien.zustand.nachId.get(id)).filter(Boolean);
    const heute = new Date();
    const name = h('input', { value: `Fotos ${heute.getDate()}.${heute.getMonth() + 1}.${heute.getFullYear()}`, 'aria-label': 'Name' });
    const passwort = h('input', { type: 'text', placeholder: 'leer = ohne Passwort', autocomplete: 'off' });
    const standort = h('input', { type: 'checkbox' });
    const balken = h('div');
    const status = h('div', { class: 'klein' });
    const ergebnis = h('div', { class: 'versteckt' });
    const los = h('button', { class: 'knopf haupt', onclick: erstellen }, ic('geteilt', 20), 'Link erstellen');
    const formular = h('div', { class: 'karte' },
      h('label', { class: 'feld' }, 'Name für Ordner und Gästeseite', name),
      h('label', { class: 'feld' }, 'Passwort (optional)', passwort),
      h('label', { class: 'haken' }, standort, 'Standort mitgeben'),
      h('p', { class: 'hinweis' }, ic('standort', 16), h('span', null, 'Ohne Häkchen entfernt Suwar den Standort aus Kopien in /Fotos/Geteilt. Deine Originale bleiben unverändert. Gäste laden Originalgröße.')),
      los);
    let fertig = false;
    const zu = blatt(medien.length === 1 ? 'Link für 1 Foto' : `Link für ${medien.length} Fotos`, [formular, h('div', { class: 'fortschritt' }, balken), status, ergebnis], () => { if (fertig && S.auswahl) { S.auswahl = null; zeichne(); } });
    async function erstellen() {
      los.disabled = true;
      const titel = sichererName(name.value);
      try {
        await NC.ordnerAnlegen('/Fotos/Geteilt');
        let ordnerName = titel;
        for (let n = 2; await NC.existiert(`/Fotos/Geteilt/${ordnerName}`); n++) ordnerName = `${titel} (${n})`;
        const ordner = `/Fotos/Geteilt/${ordnerName}`;
        await NC.ordnerAnlegen(ordner);
        const dateien = [];
        const vergeben = new Set();
        let ohneStandort = 0;
        for (let k = 0; k < medien.length; k++) {
          const m = medien[k];
          status.textContent = `${k + 1} von ${medien.length}: ${m.name}`;
          balken.style.width = `${Math.round((k / medien.length) * 100)}%`;
          const blob = await NC.holen(m.pfad);
          let daten = blob;
          if (!standort.checked && blob.size < 450e6) {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            if (SuwarStandort.entfernen(bytes, m.mime)) ohneStandort++;
            daten = new Blob([bytes], { type: m.mime });
          }
          let dn = m.name;
          for (let n = 2; vergeben.has(dn); n++) dn = m.name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
          vergeben.add(dn);
          await NC.hochladen(`${ordner}/${dn}`, daten, { typ: m.mime, mtime: m.datum, ueberschreiben: true });
          dateien.push([dn, m.video ? 1 : 0]);
        }
        balken.style.width = '100%';
        status.textContent = 'Link wird erstellt …';
        const pw = passwort.value.trim();
        let link = null;
        let linkFehler = null;
        try { link = await NC.linkErstellen(ordner, pw); } catch (e) { linkFehler = e; }
        let gast = null;
        if (link && !pw) gast = `${GAST_BASIS}#${await packen({ v: 1, h: NC.konto.server, t: link.token, n: titel, f: dateien, d: Date.now() })}`;
        const eintrag = { name: titel, ordner, url: link ? link.url : null, gast, passwort: !!pw, anzahl: dateien.length, erstellt: Date.now() };
        await NC.jsonAendern(Medien.GETEILT, Medien.geteiltLeer, (d) => { d.links = (d.links || []).concat(eintrag); });
        fertig = true;
        formular.classList.add('versteckt');
        status.textContent = standort.checked ? '' : `Standort entfernt aus ${ohneStandort} von ${dateien.length} Dateien${ohneStandort < dateien.length ? ' (die übrigen hatten keinen)' : ''}.`;
        ergebnis.classList.remove('versteckt');
        fuelle(ergebnis, linkFehler
          ? h('div', { class: 'karte' }, h('h2', null, 'Ordner ist fertig, Link fehlt noch'), h('p', null, `Die Freigabe-Schnittstelle hat abgelehnt (${linkFehler.message}). Trage in der Nextcloud unter Verwaltung → WebAppPassword die Adresse ${location.origin} auch im Feld „Files sharing API“ ein. Bis dahin kannst du den Link in der Nextcloud selbst erstellen.`),
            h('a', { class: 'knopf haupt', href: NC.webUrl(ordner), target: '_blank', rel: 'noopener' }, ic('ordner', 20), 'Ordner in der Nextcloud öffnen'))
          : linkKarte(eintrag));
      } catch (e) { fehler(e); los.disabled = false; status.textContent = ''; }
    }
    return zu;
  }
  function linkKarte(e) {
    const haupt = e.gast || e.url;
    const kopieren = async (text) => { try { await navigator.clipboard.writeText(text); toast('Link kopiert'); } catch { prompt('Link kopieren:', text); } };
    return h('div', { class: 'karte' },
      h('h2', null, e.name),
      h('p', null, `${e.anzahl} Dateien · ${e.passwort ? 'mit Passwort (Gäste sehen die Nextcloud-Seite)' : 'ohne Passwort'} · ${datumKurz(e.erstellt)}`),
      haupt ? h('div', { class: 'zeile' },
        h('button', { class: 'knopf haupt', onclick: () => kopieren(haupt) }, ic('kopieren', 18), 'Link kopieren'),
        navigator.share ? h('button', { class: 'knopf', onclick: () => navigator.share({ title: e.name, url: haupt }).catch(() => {}) }, ic('teilen', 18), 'Teilen') : null)
        : h('p', { class: 'fehler' }, 'Noch kein Link – in der Nextcloud erstellen.'),
      e.gast && e.url ? h('button', { class: 'chip text', onclick: () => kopieren(e.url) }, 'Nextcloud-Link kopieren') : null);
  }

  /* ----- Geteilt ----- */
  function geteiltSeite() {
    const liste = h('div', { class: 'seite' }, h('div', { class: 'leer' }, 'Wird geladen …'));
    NC.jsonLesen(Medien.GETEILT, Medien.geteiltLeer).then(({ daten }) => {
      const links = (daten.links || []).slice().sort((a, b) => b.erstellt - a.erstellt);
      if (!links.length) { fuelle(liste, h('div', { class: 'leer' }, h('h2', null, 'Noch nichts geteilt'), 'In der Galerie auf „Auswählen“ tippen, Fotos markieren und „Link“ wählen.')); return; }
      fuelle(liste, ...links.map((e) => {
        const karte = linkKarte(e);
        karte.append(h('div', { class: 'zeile' },
          h('a', { class: 'knopf', href: NC.webUrl(e.ordner), target: '_blank', rel: 'noopener' }, ic('ordner', 18), 'In Nextcloud'),
          h('button', { class: 'knopf gefahr', onclick: () => {
            const zu = blatt('Link löschen?', [h('p', { class: 'hinweis' }, h('span', null, `Der Ordner „${e.name}“ mit den Kopien wird gelöscht. Der Link funktioniert danach nicht mehr. Deine Originale bleiben.`)),
              h('div', { class: 'zeile' }, h('button', { class: 'knopf', onclick: () => zu() }, 'Abbrechen'), h('button', { class: 'knopf gefahr', onclick: async () => {
                zu();
                try {
                  await NC.loeschen(e.ordner);
                  await NC.jsonAendern(Medien.GETEILT, Medien.geteiltLeer, (d) => { d.links = (d.links || []).filter((x) => x.ordner !== e.ordner); });
                  toast('Link gelöscht'); zeichne();
                } catch (err) { fehler(err); }
              } }, 'Löschen'))]);
          } }, ic('papierkorb', 18), 'Löschen')));
        return karte;
      }));
    }).catch((e) => fuelle(liste, h('div', { class: 'leer' }, 'Nicht geladen: ' + e.message)));
    return [h('header', { class: 'kopf' }, h('div', { class: 'kopf-zeile' }, h('h1', null, 'Geteilt'))), h('main', { class: 'inhalt' }, liste), leiste()];
  }

  /* ----- Gemeinsam (kommt mit Baustein 7) ----- */
  function gemeinsamSeite() {
    return [h('header', { class: 'kopf' }, h('div', { class: 'kopf-zeile' }, h('h1', null, 'Gemeinsam'))),
      h('main', { class: 'inhalt' }, h('div', { class: 'seite' }, h('div', { class: 'karte' }, h('h2', null, 'Gemeinsame Ordner kommen als Nächstes'),
        h('p', null, 'Hier erscheinen Ordner, die du mit anderen Nextcloud-Benutzern teilst oder die andere mit dir teilen. Dieser Bereich wird im nächsten Bauabschnitt (Baustein 7) gebaut.')))), leiste()];
  }

  /* ----- Aufräumen ----- */
  const MENGEN = { screenshots: ['Screenshots', (m) => m.art === 'Screenshot'], whatsapp: ['WhatsApp', (m) => m.art === 'WhatsApp'], fotos: ['Fotos und Videos', (m) => m.art === 'Foto' || m.art === 'Video'], alle: ['Alles', () => true] };
  function aufrStarten() {
    const z = Medien.zustand;
    const passt = MENGEN[S.aufr.menge][1];
    S.aufr.warte = z.liste.filter((m) => passt(m) && !z.geprueft.has(m.id) && !loeschWarte.has(m.id));
    S.aufr.index = 0; S.aufr.verlauf = [];
  }
  function aufrSeite() {
    const a = S.aufr;
    if (!a.warte.length && !a.verlauf.length) aufrStarten();
    const gesamt = a.warte.length;
    const m = a.warte[a.index];
    const kopf = h('header', { class: 'kopf' },
      h('div', { class: 'kopf-zeile' }, h('h1', null, 'Aufräumen'), h('span', { class: 'klein' }, gesamt ? `${Math.min(a.index + 1, gesamt)} / ${gesamt}` : '')),
      h('div', { class: 'chips' }, Object.entries(MENGEN).map(([id, [text]]) => h('button', { class: 'chip' + (a.menge === id ? ' an' : ''), 'aria-pressed': String(a.menge === id), onclick: () => { a.menge = id; aufrStarten(); zeichne(); } }, text))),
      h('div', { class: 'fortschritt', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(gesamt), 'aria-valuenow': String(a.index) }, (() => { const d = h('div'); d.style.width = gesamt ? `${(a.index / gesamt) * 100}%` : '0'; return d; })()));
    if (!m) {
      return [kopf, h('main', { class: 'aufraeumen' }, h('div', { class: 'leer' }, h('h2', null, gesamt ? 'Fertig für heute' : 'Hier ist alles geprüft'),
        gesamt ? `${a.verlauf.filter((v) => v.aktion === 'weg').length} gelöscht, ${a.verlauf.filter((v) => v.aktion === 'bleibt').length} behalten.` : `In „${MENGEN[a.menge][0]}“ gibt es nichts Ungeprüftes.`,
        h('div', { class: 'zeile' }, a.verlauf.length ? h('button', { class: 'knopf', onclick: rueckgaengig }, ic('rueckgaengig', 18), 'Rückgängig') : null, h('button', { class: 'knopf haupt', onclick: () => wechseln('galerie') }, 'Zur Galerie')))), leiste()];
    }
    const img = h('img', { alt: m.name });
    let scharf = false;
    vorschauUrl(m, 512).then((u) => { if (u && !scharf) img.src = u; }).catch(() => {});
    vorschauUrl(m, 1024).then(async (u) => {
      if (!u) return;
      const neu = new Image(); neu.src = u; await neu.decode().catch(() => {});
      scharf = true; img.src = u;
    }).catch(() => {});
    for (const n of a.warte.slice(a.index + 1, a.index + 3)) { vorschauUrl(n, 512).catch(() => {}); vorschauUrl(n, 1024).catch(() => {}); }
    const weg = h('div', { class: 'stempel weg' }, 'LÖSCHEN');
    const bleibt = h('div', { class: 'stempel bleibt' }, 'BEHALTEN');
    const karte = h('div', { class: 'foto-karte' + (S.aufr.frisch ? ' neu' : ''), role: 'group', 'aria-label': 'Aktuelles Foto' },
      h('div', { class: 'bild' }, img), weg, bleibt,
      h('div', { class: 'unter' }, h('div', null, h('div', null, datumKurz(m.datum)), h('div', { class: 'klein' }, `${m.art} · ${groesseText(m.groesse)}`)),
        m.video ? h('span', { class: 'marke-rot' }, 'Video') : null));
    let x0 = null;
    let dx = 0;
    karte.addEventListener('pointerdown', (e) => { x0 = e.clientX; dx = 0; karte.setPointerCapture(e.pointerId); karte.style.transition = 'none'; });
    karte.addEventListener('pointermove', (e) => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      karte.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
      weg.style.opacity = String(Math.min(1, Math.max(0, -dx / 100)));
      bleibt.style.opacity = String(Math.min(1, Math.max(0, dx / 100)));
    });
    const loslassen = () => {
      if (x0 == null) return;
      x0 = null;
      karte.style.transition = '';
      if (Math.abs(dx) > 100) { karte.style.transform = `translateX(${dx > 0 ? 600 : -600}px) rotate(${dx / 10}deg)`; karte.style.opacity = '0'; setTimeout(() => entscheiden(dx > 0 ? 'bleibt' : 'weg'), 180); }
      else { karte.style.transform = ''; weg.style.opacity = '0'; bleibt.style.opacity = '0'; }
    };
    karte.addEventListener('pointerup', loslassen);
    karte.addEventListener('pointercancel', loslassen);
    const z = Medien.zustand;
    const schnell = h('div', { class: 'chips' },
      z.bauplan.kategorien.flatMap((k) => k.werte.map((w) => {
        const an = Medien.hatWert(m.id, k.id, w);
        return h('button', { class: 'chip' + (an ? ' an' : ''), 'aria-pressed': String(an), onclick: async () => { try { await Medien.kategorieSetzen([m.id], k.id, w, !an); zeichne(); } catch (e) { fehler(e); } } }, w);
      })),
      Medien.personenVon(m.id).map((p) => h('span', { class: 'chip an' }, p.name)),
      h('button', { class: 'chip', onclick: () => zuordnenBlatt([m.id], zeichne) }, '+ Person'));
    return [kopf,
      h('main', { class: 'aufraeumen' },
        h('div', { class: 'stapel' }, h('div', { class: 'hinten' }), karte, h('div', { class: 'wisch-hinweis' }, h('span', null, '← wischen: löschen'), h('span', null, 'behalten: wischen →'))),
        h('div', null, h('div', { class: 'klein' }, 'Schnell zuordnen'), schnell),
        h('div', { class: 'entscheiden' },
          h('button', { class: 'rund gross', 'aria-label': 'Löschen', onclick: () => hinaus(karte, -1) }, ic('x', 28, '#B42318')),
          h('button', { class: 'rund', 'aria-label': 'Rückgängig', disabled: !a.verlauf.length || null, onclick: rueckgaengig }, ic('rueckgaengig', 22, '#6B6B66')),
          h('button', { class: 'rund gross', 'aria-label': 'Behalten', onclick: () => hinaus(karte, 1) }, ic('haken', 28, '#1F7A4D')))),
      leiste()];
  }
  // Karte in Wischrichtung hinausgleiten lassen, dann entscheiden (bei Knopfdruck wie beim Wischen)
  function hinaus(karte, r) {
    if (wenigBewegung() || !karte.isConnected) { entscheiden(r > 0 ? 'bleibt' : 'weg'); return; }
    karte.style.transition = 'transform .22s ease-in, opacity .22s ease-in';
    karte.style.transform = `translateX(${r * 110}%) rotate(${r * 8}deg)`;
    karte.style.opacity = '0';
    setTimeout(() => entscheiden(r > 0 ? 'bleibt' : 'weg'), 200);
  }
  function entscheiden(aktion) {
    const a = S.aufr;
    const m = a.warte[a.index];
    if (!m) return;
    if (aktion === 'weg') {
      loeschWarte.set(m.id, setTimeout(async () => {
        loeschWarte.delete(m.id);
        try { await NC.loeschen(m.pfad); Medien.lokalEntfernen([m.id]); } catch (e) { fehler(e); }
      }, 6000));
    } else Medien.geprueftMarkieren([m.id]);
    a.verlauf.push({ m, aktion, index: a.index });
    a.index++;
    S.aufr.frisch = true;
    zeichne();
    S.aufr.frisch = false;
    if (aktion === 'weg') toast('Gelöscht', { text: 'Rückgängig', fn: rueckgaengig });
  }
  function rueckgaengig() {
    const a = S.aufr;
    const v = a.verlauf.pop();
    if (!v) return;
    if (v.aktion === 'weg') {
      if (loeschWarte.has(v.m.id)) { clearTimeout(loeschWarte.get(v.m.id)); loeschWarte.delete(v.m.id); }
      else toast('Schon im Papierkorb – dort wiederherstellen', { text: 'Öffnen', fn: () => window.open(NC.papierkorbUrl(), '_blank') });
    } else Medien.geprueftZuruecknehmen(v.m.id);
    a.index = v.index;
    zeichne();
  }
  document.addEventListener('keydown', (e) => {
    if (S.sicht !== 'aufraeumen' || ebenen.length || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const karte = document.querySelector('.foto-karte');
    if (e.key === 'ArrowLeft') { if (karte) hinaus(karte, -1); else entscheiden('weg'); }
    if (e.key === 'ArrowRight') { if (karte) hinaus(karte, 1); else entscheiden('bleibt'); }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) rueckgaengig();
  });
  // Beim Verlassen der App ausstehende Löschungen sofort ausführen
  window.addEventListener('pagehide', () => { for (const [id, t] of loeschWarte) { clearTimeout(t); const m = Medien.zustand.nachId.get(id); if (m) NC.loeschen(m.pfad).catch(() => {}); } loeschWarte.clear(); Medien.geprueftSchreiben(); });

  /* ----- Einstellungen ----- */
  function einstellungenSeite() {
    const z = Medien.zustand;
    const b = z.bauplan;
    const speichern = (fn) => Medien.bauplanAendern(fn).then(zeichne).catch(fehler);
    const neueKat = h('input', { placeholder: 'z. B. Anlass' });
    const neueWerte = h('input', { placeholder: 'Feier, Reise, Alltag' });
    const ortName = h('input', { placeholder: 'z. B. Zuhause' });
    const ortRadius = h('input', { type: 'number', value: '200', min: '20', step: '10' });
    const quelle = h('input', { placeholder: '/Ordner' });
    const personName = h('input', { placeholder: 'Name' });
    return [
      h('header', { class: 'kopf' }, h('div', { class: 'kopf-zeile' }, h('button', { class: 'rund klein', 'aria-label': 'Zurück', onclick: () => wechseln('galerie') }, ic('zurueck', 22)), h('h1', null, 'Einstellungen'))),
      h('main', { class: 'inhalt' }, h('div', { class: 'seite' },
        h('section', { class: 'karte' }, h('h2', null, 'Kategorien'),
          h('p', null, 'Der Bauplan liegt in /Fotos/.fotoapp/kategorien.json. Neue Kategorien erscheinen sofort in Filter und Aufräum-Modus.'),
          h('div', { class: 'liste' }, b.kategorien.map((k) => h('div', null,
            h('div', { class: 'wachsen' }, h('b', null, k.name), h('div', { class: 'chips' }, k.werte.map((w) => h('button', { class: 'chip', 'aria-label': `${w} entfernen`, onclick: () => speichern((d) => { const x = d.kategorien.find((y) => y.id === k.id); x.werte = x.werte.filter((v) => v !== w); }) }, w, ' ✕')),
              h('button', { class: 'chip text', onclick: () => { const w = (prompt(`Neuer Wert für ${k.name}`) || '').trim(); if (w) speichern((d) => { const x = d.kategorien.find((y) => y.id === k.id); if (!x.werte.includes(w)) x.werte.push(w); }); } }, '+ Wert'))),
            h('button', { class: 'rund klein', 'aria-label': `Kategorie ${k.name} entfernen`, onclick: () => { if (confirm(`Kategorie „${k.name}“ entfernen? Vorhandene Tags bleiben in der Nextcloud.`)) speichern((d) => { d.kategorien = d.kategorien.filter((y) => y.id !== k.id); }); } }, ic('x', 18))))),
          h('label', { class: 'feld' }, 'Neue Kategorie', neueKat), h('label', { class: 'feld' }, 'Werte (mit Komma getrennt)', neueWerte),
          h('button', { class: 'knopf', onclick: () => {
            const name = neueKat.value.trim();
            const werte = neueWerte.value.split(',').map((s) => s.trim()).filter(Boolean);
            if (!name || !werte.length) { toast('Name und mindestens einen Wert angeben'); return; }
            const id = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kategorie';
            speichern((d) => { if (!d.kategorien.some((y) => y.id === id)) d.kategorien.push({ id, name, werte, einzeln: true }); });
          } }, 'Kategorie hinzufügen')),
        h('section', { class: 'karte' }, h('h2', null, 'Personen'),
          h('p', null, 'Namen stehen in /Fotos/.fotoapp/personen.json – nicht als Nextcloud-Tags, damit andere Benutzer sie nicht sehen. Automatische Gesichtserkennung folgt in Baustein 8.'),
          h('div', { class: 'chips' }, z.personen.personen.map((p) => h('button', { class: 'chip', onclick: () => {
            const neu = prompt('Name ändern (leer = löschen)', p.name);
            if (neu === null) return;
            Medien.personenAendern((d) => { if (neu.trim()) { const x = d.personen.find((y) => y.id === p.id); if (x) x.name = neu.trim(); } else { d.personen = d.personen.filter((y) => y.id !== p.id); for (const k of Object.keys(d.fotos)) { d.fotos[k] = d.fotos[k].filter((v) => v !== p.id); if (!d.fotos[k].length) delete d.fotos[k]; } } }).then(zeichne).catch(fehler);
          } }, p.name))),
          h('div', { class: 'zeile' }, h('label', { class: 'feld' }, 'Neue Person', personName), h('button', { class: 'knopf', onclick: () => { const n = personName.value.trim(); if (n) Medien.personAnlegen(n).then(zeichne).catch(fehler); } }, 'Hinzufügen'))),
        h('section', { class: 'karte' }, h('h2', null, 'Eigene Orte'),
          h('p', null, 'Fotos mit GPS-Daten im Umkreis eines Ortes bekommen dessen Namen – für Filter und Suche. Den Ort legst du am besten fest, während du dort bist.'),
          h('div', { class: 'liste' }, b.orte.map((o) => h('div', null, h('div', { class: 'wachsen' }, h('b', null, o.name), h('span', { class: 'klein' }, `${o.lat.toFixed(4)}, ${o.lon.toFixed(4)} · ${o.radius} m`)),
            h('button', { class: 'rund klein', 'aria-label': `${o.name} entfernen`, onclick: () => speichern((d) => { d.orte = d.orte.filter((x) => x.name !== o.name); }) }, ic('x', 18))))),
          h('div', { class: 'zeile' }, h('label', { class: 'feld' }, 'Name', ortName), h('label', { class: 'feld' }, 'Umkreis (m)', ortRadius)),
          h('button', { class: 'knopf', onclick: () => {
            const name = ortName.value.trim();
            if (!name) { toast('Erst einen Namen eingeben'); return; }
            if (!navigator.geolocation) { toast('Standort ist auf diesem Gerät nicht verfügbar'); return; }
            navigator.geolocation.getCurrentPosition((p) => speichern((d) => { d.orte = d.orte.filter((x) => x.name !== name).concat({ name, lat: p.coords.latitude, lon: p.coords.longitude, radius: Math.max(20, parseInt(ortRadius.value, 10) || 200) }); }), () => toast('Standort nicht freigegeben'), { enableHighAccuracy: true, timeout: 15000 });
          } }, ic('standort', 18), 'Aktuellen Standort speichern')),
        h('section', { class: 'karte' }, h('h2', null, 'Quellordner'),
          h('p', null, 'Aus diesen Ordnern (mit Unterordnern) zeigt Suwar Fotos und Videos. /SofortUpload kannst du entfernen, sobald die Upload-Ziele in der Nextcloud-App auf /Fotos umgestellt sind.'),
          h('div', { class: 'liste' }, b.quellen.map((q) => h('div', null, h('div', { class: 'wachsen' }, h('code', null, q)), b.quellen.length > 1 ? h('button', { class: 'rund klein', 'aria-label': `${q} entfernen`, onclick: () => speichern((d) => { d.quellen = d.quellen.filter((x) => x !== q); }).then(() => Medien.vollAbgleich()) }, ic('x', 18)) : null))),
          h('div', { class: 'zeile' }, h('label', { class: 'feld' }, 'Ordner hinzufügen', quelle), h('button', { class: 'knopf', onclick: () => {
            let q = quelle.value.trim().replace(/\/+$/, '');
            if (!q) return;
            if (!q.startsWith('/')) q = '/' + q;
            speichern((d) => { if (!d.quellen.includes(q)) d.quellen.push(q); }).then(() => Medien.vollAbgleich().catch(fehler));
          } }, 'Hinzufügen'))),
        h('section', { class: 'karte' }, h('h2', null, 'Upload-Ziele umstellen'),
          h('p', null, 'Android (Nextcloud-App): Menü → Einstellungen → Automatischer Upload. Beim Ordner „Camera“ auf ⋮ → Konfigurieren → Zielordner /Fotos/Kamera, „Unterordner nach Datum“ an, „Original behalten“. Bei „Screenshots“ Zielordner /Fotos/Screenshots.'),
          h('p', null, 'iPad (Nextcloud-App): Mehr → Einstellungen → Automatisches Hochladen → Ordner wählen: /Fotos/iPad, „Unterordner nach Datum“ an.')),
        h('section', { class: 'karte' }, h('h2', null, 'Werkzeuge'),
          h('div', { class: 'zeile' }, h('button', { class: 'knopf', onclick: () => Medien.vollAbgleich().then(() => toast('Alles neu geladen')).catch(fehler) }, ic('neu', 18), 'Neu laden'),
            h('button', { class: 'knopf', onclick: async () => { await caches.delete('suwar-vorschau'); urlCache.clear(); toast('Vorschaubilder gelöscht'); } }, 'Vorschau leeren')),
          h('button', { class: 'knopf', onclick: () => wechseln('einrichtung') }, 'Einrichtung erneut ausführen')),
        h('section', { class: 'karte' }, h('h2', null, 'Konto'),
          h('p', null, `${NC.konto.uid || NC.konto.user} auf ${NC.konto.server}`),
          h('button', { class: 'knopf gefahr', onclick: async () => {
            if (!confirm('Abmelden? Zugangsdaten und Zwischenspeicher auf diesem Gerät werden gelöscht.')) return;
            kontoSpeichern(null); NC.setze(null); Medien.zuruecksetzen();
            try { await caches.delete('suwar-vorschau'); indexedDB.deleteDatabase('suwar'); } catch { /* egal */ }
            location.hash = ''; location.reload();
          } }, 'Abmelden'),
          h('p', null, `Suwar ${VERSION} · `, h('a', { href: 'https://github.com/Testkanal786/suwar', target: '_blank', rel: 'noopener' }, 'Quelltext'))))),
      leiste()];
  }

  /* ----- Einrichtung ----- */
  function einrichtungSeite() {
    const protokoll = h('div', { class: 'protokoll versteckt' });
    const balken = h('div');
    const log = (t) => { protokoll.classList.remove('versteckt'); protokoll.textContent += t + '\n'; protokoll.scrollTop = 1e9; };
    const los = h('button', { class: 'knopf haupt', onclick: einrichten }, 'Einrichten');
    const weiter = h('button', { class: 'knopf haupt versteckt', onclick: () => { wechseln('galerie'); Medien.vollAbgleich().catch(fehler); } }, 'Zur Galerie');
    async function einrichten() {
      los.disabled = true;
      try {
        for (const o of ['/Fotos', '/Fotos/Kamera', '/Fotos/Screenshots', '/Fotos/iPad', '/Fotos/Geteilt', Medien.ORDNER]) { await NC.ordnerAnlegen(o); log('Ordner bereit: ' + o); }
        await NC.jsonAendern(Medien.BAUPLAN, Medien.bauplanLeer, (d) => d);
        log('Bauplan bereit: kategorien.json');
        const alt = await NC.propfind('/SofortUpload/Screenshots', 1);
        const dateien = (alt || []).filter((x) => !x.ordner);
        if (dateien.length) {
          log(`${dateien.length} Screenshots ziehen nach /Fotos/Screenshots um …`);
          let n = 0;
          for (const d of dateien) {
            const name = d.pfad.split('/').pop();
            try {
              const ziel = await NC.freierName('/Fotos/Screenshots', name);
              await NC.verschieben(d.pfad, `/Fotos/Screenshots/${ziel}`);
              n++;
            } catch (e) { log(`  ${name}: ${e.message}`); }
            balken.style.width = `${Math.round(((n + 1) / dateien.length) * 100)}%`;
          }
          log(`${n} von ${dateien.length} verschoben.`);
        } else log('Keine Screenshots in /SofortUpload/Screenshots zum Verschieben.');
        log('Fertig. Stelle jetzt die Upload-Ziele in der Nextcloud-App um (siehe unten).');
        los.classList.add('versteckt'); weiter.classList.remove('versteckt');
      } catch (e) { log('Fehler: ' + e.message); los.disabled = false; }
    }
    return [h('header', { class: 'kopf' }, h('div', { class: 'kopf-zeile' }, h('h1', null, 'Einrichtung'))),
      h('main', { class: 'inhalt' }, h('div', { class: 'seite' },
        h('div', { class: 'karte' }, h('h2', null, 'Was jetzt passiert'),
          h('p', null, '1. Ordner anlegen: /Fotos mit Kamera, Screenshots, iPad, Geteilt und .fotoapp (Einstellungen von Suwar).'),
          h('p', null, '2. Die vorhandenen Screenshots aus /SofortUpload/Screenshots nach /Fotos/Screenshots verschieben. Es wird nichts verändert oder gelöscht.'),
          h('p', null, '3. Den Bauplan der Kategorien anlegen (Bereich: Privat/Verein, Beleg).'),
          h('div', { class: 'fortschritt' }, balken), protokoll, los, weiter),
        h('div', { class: 'karte' }, h('h2', null, 'Danach: Upload-Ziele umstellen'),
          h('p', null, 'Android: Nextcloud-App → Einstellungen → Automatischer Upload → bei „Camera“ ⋮ → Konfigurieren → Zielordner /Fotos/Kamera (Unterordner nach Datum an, Original behalten). Bei „Screenshots“: /Fotos/Screenshots.'),
          h('p', null, 'iPad: Nextcloud-App → Mehr → Einstellungen → Automatisches Hochladen → Ordner /Fotos/iPad.'),
          h('p', null, 'Bis dahin liest Suwar /SofortUpload weiter mit, damit nichts fehlt.')))),
    ];
  }

  /* ----- Anmeldung ----- */
  function zeigeAnmeldung() {
    const server = h('input', { type: 'url', placeholder: 'https://deine-cloud.example.de', autocomplete: 'url', value: (kontoLesen() || {}).server || '' });
    const user = h('input', { autocomplete: 'username', autocapitalize: 'none' });
    const pass = h('input', { type: 'password', autocomplete: 'current-password' });
    const meldung = h('div', { class: 'fehler', role: 'alert' });
    const knopf = h('button', { class: 'knopf haupt', type: 'submit' }, 'Anmelden');
    const form = h('form', { class: 'anmeldung', onsubmit: async (e) => {
      e.preventDefault();
      meldung.textContent = '';
      let s = server.value.trim().replace(/\/+$/, '').replace(/\/index\.php.*$/, '');
      if (s && !/^https?:\/\//.test(s)) s = 'https://' + s;
      if (!s || !user.value.trim() || !pass.value) { meldung.textContent = 'Bitte alle drei Felder ausfüllen.'; return; }
      knopf.disabled = true;
      const k = { server: s, user: user.value.trim(), pass: pass.value.trim() };
      NC.setze(k);
      try {
        k.uid = await NC.benutzerId();
        NC.setze(k);
        const r = await NC.propfind('/', 0);
        if (!r) throw new NC.NcFehler('Benutzer nicht gefunden', 404);
        kontoSpeichern(k);
        await starteMitKonto();
      } catch (err) {
        NC.setze(null);
        meldung.textContent = err.status === 401 ? 'Benutzername oder App-Passwort stimmt nicht.'
          : err.status === 0 ? `Keine Verbindung. Stimmt die Adresse? Ist ${location.origin} in der Nextcloud unter Verwaltung → WebAppPassword im Feld „WebDAV/CalDAV“ eingetragen?` : err.message;
        knopf.disabled = false;
      }
    } },
    h('img', { class: 'logo', src: 'icons/suwar-192.png', alt: '' }),
    h('h1', null, 'Suwar'),
    h('p', { class: 'hinweis' }, h('span', null, 'Deine Fotos und Videos aus der eigenen Nextcloud. Die Verbindung geht direkt von diesem Gerät an deine Nextcloud.')),
    h('label', { class: 'feld' }, 'Adresse der Nextcloud', server),
    h('label', { class: 'feld' }, 'Benutzername', user),
    h('label', { class: 'feld' }, 'App-Passwort', pass),
    h('p', { class: 'hinweis' }, ic('schloss', 16), h('span', null, 'Ein eigenes App-Passwort für Suwar erstellst du in der Nextcloud unter Persönliche Einstellungen → Sicherheit → „Neues App-Passwort erstellen“ (Name: Suwar). So kannst du Suwar jederzeit einzeln sperren.')),
    meldung, knopf);
    fuelle(app, form);
  }

  /* ---------- Start ---------- */
  let abgleichTimer = 0;
  function abgleichPlanen() {
    clearInterval(abgleichTimer);
    abgleichTimer = setInterval(() => {
      if (document.visibilityState !== 'visible' || !NC.konto) return;
      if (Date.now() - Medien.zustand.letzterVoll > 10 * 60000) Medien.vollAbgleich().catch(() => {});
      else Medien.neueAbgleichen().catch(() => {});
    }, 20000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && NC.konto) { Medien.neueAbgleichen().catch(() => {}); geteiltAbholen().catch(fehler); } });
  let malen = 0;
  Medien.beobachten(() => { cancelAnimationFrame(malen); malen = requestAnimationFrame(() => { if (S.sicht === 'galerie' && !ebenen.length) rasterNeu(); }); });

  async function starteMitKonto() {
    const k = kontoLesen();
    if (k && !k.uid) {
      try { k.uid = await NC.benutzerId(); kontoSpeichern(k); NC.setze(k); } catch (e) { fehler(e); }
    }
    await Medien.cacheLaden();
    let eingerichtet = true;
    try { eingerichtet = await NC.existiert(Medien.BAUPLAN); } catch (e) { fehler(e); }
    if (!eingerichtet) S.sicht = 'einrichtung';
    else if (S.sicht === 'einrichtung') S.sicht = 'galerie';
    history.replaceState(null, '', '#' + S.sicht);
    if (S.sicht === 'aufraeumen') aufrStarten();
    zeichne();
    if (eingerichtet) Medien.vollAbgleich().then(() => { if (S.sicht === 'aufraeumen' && !S.aufr.verlauf.length) { aufrStarten(); zeichne(); } }).catch(fehler);
    geteiltAbholen().catch(fehler);
    abgleichPlanen();
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const k = kontoLesen();
  if (k) { NC.setze(k); starteMitKonto(); } else zeigeAnmeldung();
})();
