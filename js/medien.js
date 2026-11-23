'use strict';
// Suwar – Fotos und Videos: Liste, Kategorien, Personen, Filter und Abgleich mit der Nextcloud.
// Quelle der Wahrheit bleibt die Nextcloud (Dateien, Tags, JSON-Dateien in /Fotos/.fotoapp).
// Auf dem Gerät liegt nur eine Kopie als Zwischenspeicher (IndexedDB), damit die Galerie sofort da ist.
/* global NC */
/* exported Medien */
const Medien = (() => {
  const ORDNER = '/Fotos/.fotoapp';
  const BAUPLAN = ORDNER + '/kategorien.json';
  const PERSONEN = ORDNER + '/personen.json';
  const STATUS = ORDNER + '/status.json';
  const GETEILT = ORDNER + '/geteilt.json';
  const ARTEN = ['Foto', 'Video', 'Screenshot', 'WhatsApp'];
  const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Der Bauplan beschreibt, welche Kategorien es gibt. Neue Kategorien = neuer Eintrag, kein neuer Code.
  const bauplanLeer = () => ({
    version: 1,
    kategorien: [
      { id: 'bereich', name: 'Bereich', werte: ['Privat', 'Verein'], einzeln: true },
      { id: 'beleg', name: 'Beleg', werte: ['Beleg'], einzeln: true },
    ],
    orte: [], // { name, lat, lon, radius (m) }
    quellen: ['/Fotos', '/SofortUpload'], // SofortUpload bleibt Quelle, bis die Upload-Ziele umgestellt sind
  });
  const personenLeer = () => ({ version: 1, personen: [], fotos: {} });
  const statusLeer = () => ({ version: 1, geprueft: [] });
  const geteiltLeer = () => ({ version: 1, links: [] });

  const zustand = {
    liste: [], nachId: new Map(), bauplan: bauplanLeer(), personen: personenLeer(), geprueft: new Set(),
    tagIds: new Map(), // Tag-Name → Tag-ID
    tags: new Map(), // Datei-ID → Set von Tag-Namen ("bereich:Privat")
    letzterVoll: 0, laedt: false,
  };
  const hoerer = new Set();
  const melden = () => { for (const f of hoerer) f(); };

  /* ---------- Zwischenspeicher auf dem Gerät ---------- */
  let dbVersprechen = null;
  function db() {
    if (!dbVersprechen) dbVersprechen = new Promise((ok, fehler) => {
      const r = indexedDB.open('suwar', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fehler(r.error);
    });
    return dbVersprechen;
  }
  async function kvLesen(k) { const d = await db(); return new Promise((ok) => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ok(undefined); }); }
  async function kvSchreiben(k, v) { const d = await db(); return new Promise((ok) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = ok; }); }
  const schluessel = () => `medien2:${NC.konto.uid || NC.konto.user}@${NC.konto.server}`;
  let speicherTimer = 0;
  function cacheSpeichern() {
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(() => {
      const tags = {};
      for (const [id, s] of zustand.tags) if (s.size) tags[id] = [...s];
      kvSchreiben(schluessel(), { zeit: Date.now(), liste: zustand.liste, tags, bauplan: zustand.bauplan, personen: zustand.personen, geprueft: [...zustand.geprueft], letzterVoll: zustand.letzterVoll }).catch(() => {});
    }, 400);
  }
  async function cacheLaden() {
    try {
      const c = await kvLesen(schluessel());
      if (!c) return false;
      zustand.liste = c.liste || [];
      zustand.nachId = new Map(zustand.liste.map((m) => [m.id, m]));
      zustand.tags = new Map(Object.entries(c.tags || {}).map(([k, v]) => [k, new Set(v)]));
      zustand.bauplan = normBauplan(c.bauplan);
      zustand.personen = c.personen || personenLeer();
      zustand.geprueft = new Set(c.geprueft || []);
      zustand.letzterVoll = c.letzterVoll || 0;
      melden();
      return true;
    } catch { return false; }
  }

  /* ---------- Anreichern ---------- */
  function datumAusName(n) {
    const m = n.match(/(20\d{2})[-_]?([01]\d)[-_]?([0-3]\d)(?:[-_ ]?([0-2]\d)[-.]?([0-5]\d)[-.]?([0-5]\d))?/);
    if (!m) return 0;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d) || d.getMonth() !== +m[2] - 1 ? 0 : d.getTime();
  }
  function artVon(m) {
    const n = m.name.toLowerCase();
    if (/\/screenshots?\//i.test(m.pfad) || /^(screenshot|bildschirmfoto|screen_shot)/.test(n)) return 'Screenshot';
    if (/whatsapp/i.test(m.pfad) || /^(img|vid)-\d{8}-wa\d+/.test(n)) return 'WhatsApp';
    return m.mime.startsWith('video/') ? 'Video' : 'Foto';
  }
  function anreichern(m) {
    m.name = m.pfad.split('/').pop();
    m.ordner = m.pfad.slice(0, -m.name.length - 1) || '/';
    m.video = m.mime.startsWith('video/');
    m.art = artVon(m);
    m.datum = m.aufnahme || datumAusName(m.name) || m.geaendert;
    return m;
  }
  const ausgeschlossen = (p) => p.startsWith('/Fotos/Geteilt/') || p.startsWith(ORDNER + '/') || /\/\./.test(p);

  function normBauplan(b) {
    const d = b && typeof b === 'object' ? b : bauplanLeer();
    if (!Array.isArray(d.kategorien)) d.kategorien = bauplanLeer().kategorien;
    d.kategorien = d.kategorien.filter((k) => k && k.id && Array.isArray(k.werte)).map((k) => ({ id: String(k.id), name: k.name || k.id, werte: k.werte.map(String), einzeln: k.einzeln !== false }));
    if (!Array.isArray(d.orte)) d.orte = [];
    if (!Array.isArray(d.quellen) || !d.quellen.length) d.quellen = ['/Fotos'];
    d.version = 1;
    return d;
  }

  /* ---------- Abgleich mit der Nextcloud ---------- */
  function uebernehmen(neue, vollstaendig) {
    const vorher = zustand.liste.length;
    const karte = vollstaendig ? new Map() : new Map(zustand.nachId);
    for (const m of neue) if (!ausgeschlossen(m.pfad)) karte.set(m.id, anreichern(m));
    zustand.nachId = karte;
    zustand.liste = [...karte.values()].sort((a, b) => b.datum - a.datum);
    return vollstaendig || zustand.liste.length !== vorher || neue.length > 0;
  }
  async function metaLaden() {
    const [b, p, s] = await Promise.all([NC.jsonLesen(BAUPLAN, bauplanLeer), NC.jsonLesen(PERSONEN, personenLeer), NC.jsonLesen(STATUS, statusLeer)]);
    zustand.bauplan = normBauplan(b.daten);
    zustand.personen = p.daten && p.daten.personen ? p.daten : personenLeer();
    zustand.geprueft = new Set((s.daten && s.daten.geprueft) || []);
  }
  async function tagsAbgleichen() {
    const alle = await NC.tagsLesen();
    zustand.tagIds = new Map(alle.map((t) => [t.name, t.id]));
    const katIds = new Set(zustand.bauplan.kategorien.map((k) => k.id));
    const relevant = alle.filter((t) => katIds.has(t.name.split(':')[0]));
    const karte = new Map();
    let i = 0;
    async function arbeiter() {
      while (i < relevant.length) {
        const t = relevant[i++];
        for (const id of await NC.dateienMitTag(t.id)) { if (!karte.has(id)) karte.set(id, new Set()); karte.get(id).add(t.name); }
      }
    }
    await Promise.all([arbeiter(), arbeiter(), arbeiter()]);
    zustand.tags = karte;
  }
  async function vollAbgleich() {
    if (zustand.laedt) return;
    zustand.laedt = true; melden();
    try {
      await metaLaden();
      const alle = [];
      for (const q of zustand.bauplan.quellen) {
        for (let start = 0; ; start += 1000) {
          const teil = await NC.suchen(q, { start, anzahl: 1000 });
          alle.push(...teil);
          if (teil.length < 1000) break;
        }
      }
      uebernehmen(alle, true);
      await tagsAbgleichen();
      zustand.letzterVoll = Date.now();
      cacheSpeichern();
    } finally { zustand.laedt = false; melden(); }
  }
  // Nur neue Dateien seit dem letzten Stand holen (schnell, alle 20 Sekunden)
  async function neueAbgleichen() {
    if (zustand.laedt || !zustand.liste.length) return false;
    const neuste = zustand.liste.reduce((m, x) => Math.max(m, x.geaendert), 0);
    const neue = [];
    for (const q of zustand.bauplan.quellen) neue.push(...await NC.suchen(q, { seit: neuste - 120000, anzahl: 500 }));
    const frisch = neue.filter((m) => { const alt = zustand.nachId.get(m.id); return !alt || alt.etag !== m.etag || alt.pfad !== m.pfad; });
    if (!frisch.length) return false;
    uebernehmen(frisch, false);
    cacheSpeichern(); melden();
    return true;
  }
  function lokalHinzufuegen(m) { uebernehmen([m], false); cacheSpeichern(); melden(); }
  function lokalEntfernen(ids) {
    for (const id of ids) { zustand.nachId.delete(id); zustand.tags.delete(id); }
    zustand.liste = zustand.liste.filter((m) => zustand.nachId.has(m.id));
    cacheSpeichern(); melden();
  }

  /* ---------- Kategorien (Tags) ---------- */
  const tagsVon = (id) => zustand.tags.get(id) || new Set();
  const hatWert = (id, katId, wert) => tagsVon(id).has(`${katId}:${wert}`);
  const werteVon = (id, katId) => [...tagsVon(id)].filter((t) => t.startsWith(katId + ':')).map((t) => t.slice(katId.length + 1));
  async function tagId(name) {
    if (zustand.tagIds.has(name)) return zustand.tagIds.get(name);
    const t = await NC.tagAnlegen(name);
    zustand.tagIds.set(name, t.id);
    return t.id;
  }
  async function kategorieSetzen(ids, katId, wert, an) {
    const kat = zustand.bauplan.kategorien.find((k) => k.id === katId);
    const name = `${katId}:${wert}`;
    const tid = await tagId(name);
    for (const id of ids) {
      const s = tagsVon(id);
      if (an && kat && kat.einzeln) for (const andere of [...s]) if (andere.startsWith(katId + ':') && andere !== name) {
        await NC.tagSetzen(id, await tagId(andere), false); s.delete(andere);
      }
      await NC.tagSetzen(id, tid, an);
      if (an) s.add(name); else s.delete(name);
      zustand.tags.set(id, s);
    }
    cacheSpeichern(); melden();
  }
  async function bauplanAendern(fn) { zustand.bauplan = normBauplan(await NC.jsonAendern(BAUPLAN, bauplanLeer, (d) => fn(normBauplan(d)))); cacheSpeichern(); melden(); }

  /* ---------- Personen (Datei statt Tags: Namen sollen nicht bei allen Benutzern auftauchen) ---------- */
  const personenVon = (id) => (zustand.personen.fotos[id] || []).map((pid) => zustand.personen.personen.find((p) => p.id === pid)).filter(Boolean);
  async function personenAendern(fn) { zustand.personen = await NC.jsonAendern(PERSONEN, personenLeer, (d) => { if (!d.personen) d = personenLeer(); fn(d); return d; }); cacheSpeichern(); melden(); }
  async function personAnlegen(name) {
    let neu = null;
    await personenAendern((d) => {
      neu = d.personen.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (!neu) { neu = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name }; d.personen.push(neu); }
    });
    return neu;
  }
  const personSetzen = (ids, pid, an) => personenAendern((d) => {
    for (const id of ids) {
      const s = new Set(d.fotos[id] || []);
      if (an) s.add(pid); else s.delete(pid);
      if (s.size) d.fotos[id] = [...s]; else delete d.fotos[id];
    }
  });

  /* ---------- Aufräum-Status ---------- */
  let geprueftOffen = new Set();
  let geprueftTimer = 0;
  function geprueftMarkieren(ids) {
    for (const id of ids) { zustand.geprueft.add(id); geprueftOffen.add(id); }
    cacheSpeichern();
    clearTimeout(geprueftTimer);
    geprueftTimer = setTimeout(geprueftSchreiben, 1500);
  }
  async function geprueftSchreiben() {
    if (!geprueftOffen.size) return;
    const neu = geprueftOffen; geprueftOffen = new Set();
    try { await NC.jsonAendern(STATUS, statusLeer, (d) => { const s = new Set(d.geprueft || []); for (const id of neu) s.add(id); d.geprueft = [...s]; }); }
    catch { for (const id of neu) geprueftOffen.add(id); }
  }
  function geprueftZuruecknehmen(id) {
    zustand.geprueft.delete(id); geprueftOffen.delete(id); cacheSpeichern();
    NC.jsonAendern(STATUS, statusLeer, (d) => { d.geprueft = (d.geprueft || []).filter((x) => x !== id); }).catch(() => {});
  }

  /* ---------- Orte ---------- */
  function abstand(a, b) {
    const r = 6371000;
    const rad = (x) => (x * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(s));
  }
  const orteVon = (m) => (m.gps ? zustand.bauplan.orte.filter((o) => abstand(m.gps, o) <= (o.radius || 200)).map((o) => o.name) : []);

  /* ---------- Filtern ---------- */
  const filterLeer = () => ({ text: '', arten: new Set(), werte: {}, personen: new Set(), orte: new Set(), jahr: '', monat: '', screenshots: false });
  const filterAnzahl = (f) => f.arten.size + Object.values(f.werte).reduce((s, x) => s + x.size, 0) + f.personen.size + f.orte.size + (f.jahr ? 1 : 0) + (f.monat ? 1 : 0);
  function suchtext(m) {
    const d = new Date(m.datum);
    return [m.name, m.art, MONATE[d.getMonth()], String(d.getFullYear()), ...[...tagsVon(m.id)].map((t) => t.split(':')[1]), ...personenVon(m.id).map((p) => p.name), ...orteVon(m)].join(' ').toLowerCase();
  }
  function passt(m, f) {
    if (!f.screenshots && !f.arten.has('Screenshot') && m.art === 'Screenshot') return false;
    if (f.arten.size && !f.arten.has(m.art)) return false;
    for (const [katId, werte] of Object.entries(f.werte)) {
      if (!werte.size) continue;
      const hat = werteVon(m.id, katId);
      if (![...werte].some((w) => (w === '' ? !hat.length : hat.includes(w)))) return false;
    }
    if (f.personen.size && !personenVon(m.id).some((p) => f.personen.has(p.id))) return false;
    if (f.orte.size && !orteVon(m).some((o) => f.orte.has(o))) return false;
    const d = new Date(m.datum);
    if (f.jahr && String(d.getFullYear()) !== f.jahr) return false;
    if (f.monat && String(d.getMonth()) !== f.monat) return false;
    if (f.text) {
      const s = suchtext(m);
      if (!f.text.toLowerCase().split(/\s+/).filter(Boolean).every((w) => s.includes(w))) return false;
    }
    return true;
  }
  const filtern = (f) => zustand.liste.filter((m) => passt(m, f));

  return {
    zustand, ARTEN, MONATE, BAUPLAN, ORDNER, GETEILT, geteiltLeer, bauplanLeer,
    beobachten(f) { hoerer.add(f); return () => hoerer.delete(f); },
    cacheLaden, vollAbgleich, neueAbgleichen, lokalHinzufuegen, lokalEntfernen, anreichern,
    tagsVon, werteVon, hatWert, kategorieSetzen, bauplanAendern,
    personenVon, personAnlegen, personSetzen, personenAendern,
    geprueftMarkieren, geprueftZuruecknehmen, geprueftSchreiben,
    orteVon, filterLeer, filterAnzahl, filtern, passt, datumAusName, artVon,
    zuruecksetzen() { Object.assign(zustand, { liste: [], nachId: new Map(), tags: new Map(), tagIds: new Map(), geprueft: new Set(), letzterVoll: 0 }); },
  };
})();
