'use strict';
// Suwar – lebendiges Logo. Der Blick im Stern zeigt den Himmel wie gerade draußen:
// Morgengrauen, Tag, Nachmittag, Abend, Nacht. Der Stern selbst bleibt immer Suwar-Blau.
// Die Tageszeiten werden aus dem Sonnenstand berechnet (Fajr 18°, Isha 17° unter dem Horizont,
// Asr bei Schattenlänge = Gegenstand + Mittagsschatten). Sonne und Mond sind nie gleichzeitig zu sehen:
// Die Sonne geht hinter dem Berg unter, erst danach gehen Mond und Sterne auf – morgens umgekehrt.
// Die Rechnung läuft auch in Node (für Tests), die Zeichnung nur im Browser.
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
  const RAD = Math.PI / 180;
  const STUNDE = 3600000;
  const klemme = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const weich = (x) => x * x * (3 - 2 * x);

  /* ---------- Ort ---------- */
  const ORT_SCHLUESSEL = 'suwar-himmel-ort';
  function ort() {
    try {
      const o = JSON.parse(global.localStorage.getItem(ORT_SCHLUESSEL));
      if (o && Number.isFinite(o.lat) && Number.isFinite(o.lon)) return o;
    } catch { /* Voreinstellung */ }
    let zone = '';
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* egal */ }
    if (/^Europe\/(Berlin|Vienna|Zurich|Busingen)$/.test(zone)) return { lat: 51.31, lon: 9.48, name: 'Kassel', voreinstellung: true };
    return { lat: 45, lon: -new Date().getTimezoneOffset() / 4, name: 'deine Zeitzone (geschätzt)', voreinstellung: true };
  }

  /* ---------- Sonnenstand (Näherung des US Naval Observatory, genau auf etwa 1–2 Minuten) ---------- */
  function sonne(ms) {
    const n = ms / 86400000 + 2440587.5 - 2451545.0;
    const L = (((280.46 + 0.9856474 * n) % 360) + 360) % 360;
    const g = ((((357.528 + 0.9856003 * n) % 360) + 360) % 360) * RAD;
    const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const eps = (23.439 - 0.0000004 * n) * RAD;
    const dekl = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / RAD;
    const zgl = ((((L - ra) % 360) + 540) % 360) - 180; // Zeitgleichung in Grad (1° = 4 Minuten)
    return { dekl, zgl };
  }

  // Zeiten des Kalendertags, in dem ms liegt (Ortszeit des Geräts)
  function zeiten(ms, o = ort()) {
    const d = new Date(ms);
    const mitternacht = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const s = sonne(mitternacht + 12 * STUNDE - (o.lon / 15) * STUNDE);
    const mittag = mitternacht + (720 - 4 * o.lon - 4 * s.zgl) * 60000;
    const phi = o.lat * RAD;
    const abstand = (hoehe) => {
      const c = (Math.sin(hoehe * RAD) - Math.sin(phi) * Math.sin(s.dekl)) / (Math.cos(phi) * Math.cos(s.dekl));
      return c > 1 || c < -1 ? null : (Math.acos(c) / RAD / 15) * STUNDE;
    };
    const sa = abstand(-0.833) ?? (Math.sin(phi) * Math.sin(s.dekl) > 0 ? 11.9 : 0.1) * STUNDE; // Mitternachtssonne bzw. Polarnacht
    const aufgang = mittag - sa, untergang = mittag + sa;
    // Wo die Sonne nicht tief genug sinkt (Sommer in Deutschland), gilt die Siebtel-Regel der Nacht
    const nacht = 24 * STUNDE - 2 * sa;
    const fa = abstand(-18), ia = abstand(-17);
    const fajr = fa != null ? mittag - fa : aufgang - nacht / 7;
    const isha = ia != null ? mittag + ia : untergang + nacht / 7;
    const asrHoehe = Math.atan(1 / (1 + Math.tan(Math.abs(phi - s.dekl)))) / RAD;
    const aa = abstand(asrHoehe);
    const asr = aa != null ? mittag + aa : mittag + (untergang - mittag) / 2;
    return { fajr, aufgang, mittag, asr, untergang, isha, dekl: s.dekl, hoechste: 90 - Math.abs(o.lat - s.dekl / RAD) };
  }

  function hoehe(ms, o, z) {
    const H = ((ms - z.mittag) / STUNDE) * 15 * RAD;
    const phi = o.lat * RAD;
    return Math.asin(Math.sin(phi) * Math.sin(z.dekl) + Math.cos(phi) * Math.cos(z.dekl) * Math.cos(H)) / RAD;
  }

  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mischen = (a, b, t) => '#' + hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * t).toString(16).padStart(2, '0')).join('');

  // Alles, was das Logo zu einem Zeitpunkt zeigt
  function zustand(ms = Date.now(), o = ort()) {
    const z = zeiten(ms, o);
    const { fajr, aufgang: a, mittag: m, asr, untergang: u, isha } = z;
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
    // Sonne: steigt hinter dem Berg auf, mittags am höchsten, im Winter etwas tiefer als im Sommer
    const h = hoehe(ms, o, z);
    const spitze = Math.max(z.hoechste, 1);
    const sonneY = h >= 0 ? 55 - 13 * Math.min(1, h / spitze) * (0.75 + 0.25 * Math.min(1, spitze / 60)) : 55 + Math.min(10, -h * 1.6);
    const sonneSicht = klemme((h + 3) / 1.5);
    // Mond und Sterne: erst, wenn die Sonne ganz weg ist; morgens gehen sie, bevor die Sonne kommt
    let nacht;
    if (ms < fajr || ms >= isha) nacht = 1;
    else if (ms < a) nacht = 1 - weich(klemme((ms - fajr) / (0.5 * (a - fajr))));
    else if (ms > u) nacht = weich(klemme((ms - (u + 0.55 * (isha - u))) / (0.45 * (isha - u))));
    else nacht = 0;
    nacht *= 1 - sonneSicht;
    const phase = ms < fajr || ms >= isha ? 'Nacht · Isha' : ms < a ? 'Morgengrauen · Fajr' : ms < m ? 'Vormittag'
      : ms < asr ? 'Mittag · Dhuhr' : ms < u ? 'Nachmittag · Asr' : 'Abend · Maghrib';
    return { ...farben, sonneY, sonneSicht, nacht, phase, hoehe: h, zeiten: z };
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
    const r = Object.fromEntries(['himmel', 'berg', 'sonne', 'nacht', 'mond'].map((k) => [k, el.querySelector(`[data-r="${k}"]`)]));
    let spielt = null;
    const logo = {
      el,
      zeichne(ms = Date.now()) {
        const z = zustand(ms);
        anwenden(r, z);
        if (!schmuck) el.setAttribute('aria-label', `Suwar – Himmel jetzt: ${z.phase}`);
        return z;
      },
      // Einen ganzen Tag ablaufen lassen (von jetzt bis jetzt), danach wieder die echte Tageszeit
      abspielen(dauer = 8000) {
        if (ruhig() || spielt) return;
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

  // Browser-Tab: dasselbe Logo als Favicon (nur der Stern), alle paar Minuten aktualisiert
  function favicon() {
    const n = ++zaehler;
    const doc = new global.DOMParser().parseFromString(svgText(n, { groesse: 64, kachel: false, schmuck: true, funkeln: false }), 'image/svg+xml');
    const el = doc.documentElement;
    anwenden(Object.fromEntries(['himmel', 'berg', 'sonne', 'nacht', 'mond'].map((k) => [k, el.querySelector(`[data-r="${k}"]`)])), zustand());
    let link = global.document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (!link) { link = global.document.createElement('link'); link.rel = 'icon'; link.type = 'image/svg+xml'; global.document.head.append(link); }
    link.href = 'data:image/svg+xml,' + encodeURIComponent(new global.XMLSerializer().serializeToString(el));
  }

  function alleNeu() {
    for (const l of lebende) if (!l.el.isConnected) lebende.delete(l); else l.zeichne();
    favicon();
  }

  function ortSetzen(o) {
    if (o) global.localStorage.setItem(ORT_SCHLUESSEL, JSON.stringify(o)); else global.localStorage.removeItem(ORT_SCHLUESSEL);
    alleNeu();
  }

  if (global.document) {
    favicon();
    setInterval(() => { if (global.document.visibilityState !== 'hidden') alleNeu(); }, 60000);
    global.document.addEventListener('visibilitychange', () => { if (global.document.visibilityState === 'visible') alleNeu(); });
  }

  global.SuwarLogo = { erstellen, zustand, zeiten, ort, ortSetzen, FARBEN };
})(typeof window !== 'undefined' ? window : globalThis);
