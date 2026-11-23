'use strict';
// Suwar – lebendiges Logo. Der Blick im Stern zeigt den Himmel zur Tageszeit:
// Nacht → Morgengrauen (Fajr) → Vormittag → Mittag (Dhuhr) → Nachmittag (Asr) → Abend (Maghrib) → Nacht (Isha).
// Der Stern selbst bleibt immer Suwar-Blau.
// Die Zeiten kommen wie in Indibat aus der Nextcloud-Aufgabenliste „Gebete“ (app.js lädt sie, gebeteSetzen()).
// Suwar rechnet keine Gebetszeiten selbst. Nur der Sonnenaufgang wird aus der Liste abgeleitet:
// Dhuhr liegt in der Mitte zwischen Sonnenaufgang und Maghrib, also Sonnenaufgang = Dhuhr − (Maghrib − Dhuhr).
// Sonne und Mond sind nie gleichzeitig zu sehen: Die Sonne geht hinter dem Berg unter,
// erst danach kommen Mond und Sterne – morgens umgekehrt.
// Die Zeitlogik läuft auch in Node (für Tests), die Zeichnung nur im Browser.
(function (global) {
  const BLAU = '#2B5291';
  const BERG = 'M35 65 L35 57.25 L44.75 49.25 L52.25 56.75 L56.3 52.7 L65 60.5 L65 65 Z';
  const STERNE = [[41, 41, 0.8], [47, 38, 0.6], [62, 52, 0.6], [60, 39, 0.5], [39, 49, 0.5]];
  const FARBEN = {
    nacht: { himmel: '#1B2540', sonne: '#F6A96B', berg: '#0C1426' },
    daemmerung: { himmel: '#5E5A8C', sonne: '#F6A96B', berg: '#1E2340' },
    morgen: { himmel: '#F4C7B5', sonne: '#EE8A45', berg: '#2E3B55' },
    tag: { himmel: '#E6ECF5', sonne: '#E8B04B', berg: '#214071' }, // = App-Symbol
    nachmittag: { himmel: '#EBD9B4', sonne: '#E8A33D', berg: '#2B3556' },
    abend: { himmel: '#F2A07B', sonne: '#F6D365', berg: '#3A2433' },
  };
  const GEBETE = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  const MIN = 60000;
  const STUNDE = 60 * MIN;
  const klemme = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const weich = (x) => x * x * (3 - 2 * x);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /* ---------- Gebetszeiten aus Indibat ---------- */
  const SCHLUESSEL = 'suwar-gebete';
  let speicher = null;
  function gebete() {
    if (speicher) return speicher;
    try { speicher = JSON.parse(global.localStorage.getItem(SCHLUESSEL)); } catch { /* leer */ }
    if (!speicher || typeof speicher.tage !== 'object' || !speicher.tage) speicher = { quelle: null, stand: 0, tage: {} };
    return speicher;
  }
  const vollstaendig = (t) => !!t && GEBETE.every((k) => /^\d{1,2}:\d{2}$/.test(t[k] || ''));

  // Zeiten für den Kalendertag von ms. Fehlt der Tag in der Liste, gelten die Uhrzeiten des nächstgelegenen
  // Tags innerhalb einer Woche (sie ändern sich nur um ein bis zwei Minuten am Tag). Sonst null.
  function tagZeiten(ms, tage = gebete().tage) {
    const d = new Date(ms);
    let eintrag = null, von = null;
    for (let i = 0; i <= 7 && !eintrag; i++) {
      for (const s of i ? [-i, i] : [0]) {
        const k = ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + s));
        if (tage && vollstaendig(tage[k])) { eintrag = tage[k]; von = k; break; }
      }
    }
    if (!eintrag) return null;
    const um = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime(); };
    const z = Object.fromEntries(GEBETE.map((k) => [k, um(eintrag[k])]));
    if (z.isha < z.maghrib) z.isha += 24 * STUNDE; // Isha nach Mitternacht (Sommer)
    if (!(z.fajr < z.dhuhr && z.dhuhr < z.asr && z.asr < z.maghrib && z.maghrib < z.isha)) return null;
    z.aufgang = klemme(2 * z.dhuhr - z.maghrib, z.fajr + 20 * MIN, z.dhuhr - STUNDE);
    z.untergang = z.maghrib;
    z.tag = von;
    z.genau = von === ymd(d);
    return z;
  }

  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mischen = (a, b, t) => '#' + hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t).toString(16).padStart(2, '0')).join('');

  // Alles, was das Logo zu einem Zeitpunkt zeigt. Ohne Zeiten: der Mittagshimmel wie im App-Symbol.
  function zustand(ms = Date.now(), tage) {
    const z = tagZeiten(ms, tage);
    if (!z) return { ...FARBEN.tag, sonneY: 44, sonneSicht: 1, nacht: 0, phase: null, zeiten: null };
    const { fajr, aufgang: a, dhuhr: m, asr, untergang: u, isha } = z;
    const marken = [
      [fajr, 'nacht'], [fajr + 0.55 * (a - fajr), 'daemmerung'], [a, 'morgen'], [a + 0.4 * (m - a), 'tag'],
      [asr, 'tag'], [asr + 0.5 * (u - asr), 'nachmittag'], [u - 0.15 * (u - asr), 'abend'], [u, 'abend'],
      [u + 0.45 * (isha - u), 'daemmerung'], [isha, 'nacht'],
    ];
    let farben = FARBEN.nacht;
    for (let i = 0; i < marken.length - 1; i++) {
      const [t0, f0] = marken[i], [t1, f1] = marken[i + 1];
      if (ms >= t0 && ms < t1) {
        const t = weich(klemme((ms - t0) / (t1 - t0)));
        farben = { himmel: mischen(FARBEN[f0].himmel, FARBEN[f1].himmel, t), sonne: mischen(FARBEN[f0].sonne, FARBEN[f1].sonne, t), berg: mischen(FARBEN[f0].berg, FARBEN[f1].berg, t) };
        break;
      }
    }
    // Sonne: Bogen von Sonnenaufgang bis Maghrib, mittags oben; davor und danach sinkt sie hinter den Berg
    const hoehe = ms >= a && ms <= u ? 13 * Math.sin(Math.PI * (ms - a) / (u - a)) : -0.4 * (Math.min(Math.abs(ms - a), Math.abs(ms - u)) / MIN);
    const sonneY = 55 - klemme(hoehe, -8, 13);
    const sonneSicht = klemme((hoehe + 3) / 1.5); // nach etwa 7 Minuten ganz hinter dem Berg
    // Mond und Sterne: erst, wenn die Sonne weg ist (frühestens 8 min nach Maghrib), voll zu Isha;
    // morgens ab Fajr verblassend, weg spätestens 8 min bevor die Sonne auftaucht
    const abendAb = Math.max(u + 8 * MIN, u + 0.55 * (isha - u)), abendVoll = Math.max(isha, abendAb + MIN);
    const morgenBis = Math.max(fajr + MIN, Math.min(fajr + 0.5 * (a - fajr), a - 8 * MIN));
    let nacht;
    if (ms < fajr || ms >= abendVoll) nacht = 1;
    else if (ms < a) nacht = 1 - weich(klemme((ms - fajr) / (morgenBis - fajr)));
    else if (ms > u) nacht = weich(klemme((ms - abendAb) / (abendVoll - abendAb)));
    else nacht = 0;
    nacht *= 1 - sonneSicht;
    const phase = ms < fajr || ms >= isha ? 'Nacht · Isha' : ms < a ? 'Morgengrauen · Fajr' : ms < m ? 'Vormittag'
      : ms < asr ? 'Mittag · Dhuhr' : ms < u ? 'Nachmittag · Asr' : 'Abend · Maghrib';
    return { ...farben, sonneY, sonneSicht, nacht, phase, zeiten: z };
  }

  /* ---------- Zeichnung (nur im Browser) ---------- */
  const ruhig = () => !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let zaehler = 0;
  const lebende = new Set();

  function svgText(n, { groesse, kachel, schmuck, funkeln }) {
    const blink = (r, i) => funkeln ? `<animate attributeName="r" values="${r};${(r * 1.6).toFixed(2)};${r}" dur="${(1.6 + i * 0.35).toFixed(2)}s" repeatCount="indefinite"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${kachel ? '0 0 100 100' : '13.5 13.5 73 73'}" width="${groesse}" height="${groesse}" ${schmuck ? 'aria-hidden="true"' : 'role="img" aria-label="Suwar"'}>`
      + (kachel ? '<rect x="1.25" y="1.25" width="97.5" height="97.5" rx="22.5" fill="#FFFFFF" stroke="#D9D9D4" stroke-width="2.5"/>' : '')
      + `<g fill="${BLAU}"><rect x="25" y="25" width="50" height="50" rx="4"/><rect x="25" y="25" width="50" height="50" rx="4" transform="rotate(45 50 50)"/></g>`
      + `<clipPath id="suwar-blick-${n}"><circle cx="50" cy="50" r="15"/></clipPath>`
      + `<mask id="suwar-mond-${n}"><circle cx="56" cy="44" r="4.2" fill="#fff"/><circle cx="58" cy="42.6" r="3.61" fill="#000"/></mask>`
      + `<g clip-path="url(#suwar-blick-${n})"><rect data-r="himmel" x="35" y="35" width="30" height="30"/>`
      + `<g data-r="nacht">${STERNE.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#F5EFE3">${blink(r, i)}</circle>`).join('')}`
      + `<g data-r="mond"><circle cx="56" cy="44" r="4.2" fill="#F5EFE3" mask="url(#suwar-mond-${n})"/></g></g>`
      + `<circle data-r="sonne" cx="56" cy="44" r="3.6"/><path data-r="berg" d="${BERG}"/></g></svg>`;
  }
  const teile = (el) => Object.fromEntries(['himmel', 'berg', 'sonne', 'nacht', 'mond'].map((k) => [k, el.querySelector(`[data-r="${k}"]`)]));

  function anwenden(r, z) {
    r.himmel.setAttribute('fill', z.himmel);
    r.berg.setAttribute('fill', z.berg);
    r.sonne.setAttribute('fill', z.sonne);
    r.sonne.setAttribute('cy', z.sonneY.toFixed(2));
    r.sonne.setAttribute('opacity', z.sonneSicht.toFixed(3));
    r.nacht.setAttribute('opacity', z.nacht.toFixed(3));
    r.mond.setAttribute('transform', `translate(0 ${((1 - z.nacht) * 7).toFixed(2)})`);
  }

  // Ein Logo erstellen. groesse in Pixeln; kachel = mit weißer Kachel wie das App-Symbol; schmuck = für Vorlesehilfen ausblenden
  function erstellen({ groesse = 32, kachel = false, schmuck = false } = {}) {
    const n = ++zaehler;
    const doc = new global.DOMParser().parseFromString(svgText(n, { groesse, kachel, schmuck, funkeln: !ruhig() }), 'image/svg+xml');
    const el = global.document.importNode(doc.documentElement, true);
    const r = teile(el);
    let spielt = null;
    const logo = {
      el,
      zeichne(ms = Date.now()) {
        const z = zustand(ms);
        anwenden(r, z);
        if (!schmuck) el.setAttribute('aria-label', z.phase ? `Suwar – Himmel jetzt: ${z.phase}` : 'Suwar');
        return z;
      },
      // Einen ganzen Tag ablaufen lassen (von jetzt bis jetzt), danach wieder die echte Tageszeit
      abspielen(dauer = 8000) {
        if (ruhig() || spielt || !zustand().zeiten) return;
        const start = performance.now(), jetzt = Date.now();
        const schritt = (t) => {
          const x = klemme((t - start) / dauer);
          anwenden(r, zustand(jetzt + (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2) * 24 * STUNDE));
          if (x < 1 && el.isConnected) spielt = requestAnimationFrame(schritt);
          else { spielt = null; logo.zeichne(); }
        };
        spielt = requestAnimationFrame(schritt);
      },
    };
    logo.zeichne();
    lebende.add(logo);
    return logo;
  }

  // Browser-Tab: dasselbe Logo als Favicon (nur der Stern)
  function favicon() {
    const doc = new global.DOMParser().parseFromString(svgText(++zaehler, { groesse: 64, kachel: false, schmuck: true, funkeln: false }), 'image/svg+xml');
    const el = doc.documentElement;
    anwenden(teile(el), zustand());
    let link = global.document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (!link) { link = global.document.createElement('link'); link.rel = 'icon'; link.type = 'image/svg+xml'; global.document.head.append(link); }
    link.href = 'data:image/svg+xml,' + encodeURIComponent(new global.XMLSerializer().serializeToString(el));
  }

  function alleNeu() {
    if (!global.document) return;
    for (const l of lebende) if (!l.el.isConnected) lebende.delete(l); else l.zeichne();
    favicon();
  }

  // Gebetszeiten übernehmen (null = löschen). Behalten werden 10 Tage zurück bis 60 Tage voraus.
  function gebeteSetzen(tage, quelle = 'Indibat') {
    if (!tage) {
      speicher = { quelle: null, stand: 0, tage: {} };
      try { global.localStorage.removeItem(SCHLUESSEL); } catch { /* egal */ }
      alleNeu();
      return;
    }
    const heute = Date.now(), neu = {};
    for (const [k, v] of Object.entries({ ...gebete().tage, ...tage })) {
      const t = Date.parse(k + 'T12:00:00');
      if (vollstaendig(v) && t > heute - 10 * 24 * STUNDE && t < heute + 60 * 24 * STUNDE) neu[k] = v;
    }
    speicher = { quelle, stand: heute, tage: neu };
    try { global.localStorage.setItem(SCHLUESSEL, JSON.stringify(speicher)); } catch { /* egal */ }
    alleNeu();
  }

  if (global.document) {
    favicon();
    setInterval(() => { if (global.document.visibilityState !== 'hidden') alleNeu(); }, 60000);
    global.document.addEventListener('visibilitychange', () => { if (global.document.visibilityState === 'visible') alleNeu(); });
  }

  global.SuwarLogo = { erstellen, zustand, tagZeiten, gebete, gebeteSetzen, FARBEN };
})(typeof window !== 'undefined' ? window : globalThis);
