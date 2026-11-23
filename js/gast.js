'use strict';
// Suwar – Gästeseite. Die Liste der Dateien steckt im Link selbst (nach dem #), die Bilder kommen direkt aus der
// öffentlichen Nextcloud-Freigabe. Diese Seite schickt nichts an einen Server und braucht keine Anmeldung.
(async () => {
  const wurzel = document.getElementById('gast');
  // Inhalt ersetzen; leere Einträge (null, false) werden übersprungen, verschachtelte Listen geglättet.
  const fuelle = (el, ...kinder) => el.replaceChildren(...kinder.flat(Infinity).filter((k) => k != null && k !== false && k !== ''));
  const h = (tag, attrs, ...kinder) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kind of kinder.flat()) if (kind != null && kind !== false) el.append(kind.nodeType ? kind : document.createTextNode(String(kind)));
    return el;
  };
  function svg(d, groesse = 20, voll = false) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [k, v] of Object.entries({ width: groesse, height: groesse, viewBox: '0 0 24 24', fill: voll ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) s.setAttribute(k, v);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); s.append(p);
    return s;
  }
  const LADEN = 'M12 4v11M7 10l5 5 5-5M5 20h14';
  const fehlerZeigen = (text, link) => fuelle(wurzel, h('div', { class: 'leer' }, h('h2', null, 'Fotos nicht verfügbar'), text, link ? h('p', null, h('a', { href: link, rel: 'noopener' }, 'Zur Nextcloud-Freigabe')) : null));

  async function entpacken(s) {
    const roh = atob(s.slice(1).replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(roh, (c) => c.charCodeAt(0));
    if (s[0] === 'j') return JSON.parse(new TextDecoder().decode(bytes));
    const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(strom).text());
  }
  let d;
  try { d = await entpacken(location.hash.slice(1)); } catch { fehlerZeigen('Dieser Link ist unvollständig. Bitte den ganzen Link noch einmal öffnen.'); return; }
  if (!d || !/^https?:\/\//.test(d.h) || !/^[A-Za-z0-9]+$/.test(d.t) || !Array.isArray(d.f)) { fehlerZeigen('Dieser Link ist ungültig.'); return; }
  const basis = d.h.replace(/\/+$/, '');
  const freigabe = `${basis}/s/${d.t}`;
  const vorschau = (name, px) => `${basis}/index.php/apps/files_sharing/publicpreview/${d.t}?file=${encodeURIComponent('/' + name)}&x=${px}&y=${px}&a=1`;
  const datei = (name) => `${freigabe}/download?path=${encodeURIComponent('/')}&files=${encodeURIComponent(name)}`;
  document.title = d.n || 'Geteilte Fotos';
  const fotos = d.f.filter((x) => !x[1]).length;
  const videos = d.f.length - fotos;

  function gross(i) {
    let pos = i;
    const buehne = h('div', { class: 'buehne' });
    const titel = h('div', { class: 'ansicht-titel' });
    const laden = h('a', { class: 'rund', 'aria-label': 'Herunterladen', rel: 'noopener' }, svg(LADEN));
    const el = h('div', { class: 'ansicht', role: 'dialog', 'aria-label': 'Großansicht', tabindex: '-1' },
      h('div', { class: 'ansicht-kopf' }, h('button', { class: 'rund', 'aria-label': 'Schließen', onclick: () => el.remove() }, svg('M6 6l12 12M18 6 6 18')), titel, laden),
      buehne);
    function zeigen() {
      const [name, video] = d.f[pos];
      fuelle(titel, h('b', null, name), h('span', null, `${pos + 1} von ${d.f.length}`));
      laden.setAttribute('href', datei(name));
      fuelle(buehne, video ? h('video', { src: datei(name), controls: true, playsinline: true, autoplay: true }) : h('img', { src: vorschau(name, 2048), alt: name }));
    }
    let x0 = null;
    buehne.addEventListener('pointerdown', (e) => { if (e.target.tagName !== 'VIDEO') x0 = e.clientX; });
    buehne.addEventListener('pointerup', (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 60) { pos = Math.min(d.f.length - 1, Math.max(0, pos + (dx < 0 ? 1 : -1))); zeigen(); } });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') el.remove();
      if (e.key === 'ArrowRight' && pos < d.f.length - 1) { pos++; zeigen(); }
      if (e.key === 'ArrowLeft' && pos > 0) { pos--; zeigen(); }
    });
    document.body.append(el); el.focus(); zeigen();
  }

  let fehlgeschlagen = 0;
  const mauer = h('div', { class: 'mauer' }, d.f.map(([name, video], i) => {
    const img = h('img', { src: vorschau(name, 800), alt: video ? `Video ${name}` : name, loading: 'lazy' });
    img.addEventListener('error', () => { if (++fehlgeschlagen === Math.min(3, d.f.length)) fehlerZeigen('Die Freigabe ist abgelaufen, gelöscht oder durch ein Passwort geschützt.', freigabe); });
    return h('button', { 'aria-label': video ? `Video ${name} abspielen` : `${name} groß anzeigen`, onclick: () => gross(i) }, img, video ? h('span', { class: 'marke' }, svg('M8 5l11 7-11 7z', 10, true), 'Video') : null);
  }));
  const anzahl = [fotos ? `${fotos} ${fotos === 1 ? 'Foto' : 'Fotos'}` : '', videos ? `${videos} ${videos === 1 ? 'Video' : 'Videos'}` : ''].filter(Boolean).join(' · ');
  fuelle(wurzel, 
    h('header', { class: 'g-kopf' },
      h('span', { class: 'klein' }, 'Geteilt über Suwar'),
      h('h1', null, d.n || 'Geteilte Fotos'),
      h('span', { class: 'klein' }, anzahl + (d.d ? ' · ' + new Date(d.d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '')),
      h('a', { class: 'knopf haupt', href: `${freigabe}/download`, rel: 'noopener' }, svg(LADEN, 18), 'Alle herunterladen')),
    mauer,
    h('footer', { class: 'g-fuss' }, svg('M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 16), 'Originalgröße · Standortdaten wurden vor dem Teilen entfernt'));
})();
