'use strict';
// Prüft das lebendige Logo: Sonnenzeiten gegen eine Referenz (Python-Paket astral 3.2)
// und dass Sonne und Mond im ganzen Jahr nie gleichzeitig zu sehen sind.
// Aufruf: node test/logo.test.js
const assert = require('assert');
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
require('../js/logo.js');
const L = globalThis.SuwarLogo;

const REFERENZ = [
  {"ort": "Kassel", "lat": 51.31, "lon": 9.48, "tz": "Europe/Berlin", "datum": "2026-01-15", "aufgang": "08:20", "mittag": "12:31", "untergang": "16:42", "fajr": "06:20", "isha": "18:36"},
  {"ort": "Kassel", "lat": 51.31, "lon": 9.48, "tz": "Europe/Berlin", "datum": "2026-03-20", "aufgang": "06:25", "mittag": "12:29", "untergang": "18:34", "fajr": "04:32", "isha": "20:21"},
  {"ort": "Kassel", "lat": 51.31, "lon": 9.48, "tz": "Europe/Berlin", "datum": "2026-06-21", "aufgang": "05:06", "mittag": "13:23", "untergang": "21:41", "fajr": null, "isha": null},
  {"ort": "Kassel", "lat": 51.31, "lon": 9.48, "tz": "Europe/Berlin", "datum": "2026-09-23", "aufgang": "07:09", "mittag": "13:14", "untergang": "19:18", "fajr": "05:16", "isha": "21:04"},
  {"ort": "Kassel", "lat": 51.31, "lon": 9.48, "tz": "Europe/Berlin", "datum": "2026-11-23", "aufgang": "07:52", "mittag": "12:08", "untergang": "16:23", "fajr": "05:53", "isha": "18:16"},
  {"ort": "Kassel", "lat": 51.31, "lon": 9.48, "tz": "Europe/Berlin", "datum": "2026-12-21", "aufgang": "08:24", "mittag": "12:19", "untergang": "16:15", "fajr": "06:20", "isha": "18:13"},
  {"ort": "Mekka", "lat": 21.42, "lon": 39.83, "tz": "Asia/Riyadh", "datum": "2026-01-15", "aufgang": "07:01", "mittag": "12:29", "untergang": "17:59", "fajr": "05:42", "isha": "19:13"},
  {"ort": "Mekka", "lat": 21.42, "lon": 39.83, "tz": "Asia/Riyadh", "datum": "2026-03-20", "aufgang": "06:25", "mittag": "12:28", "untergang": "18:31", "fajr": "05:10", "isha": "19:41"},
  {"ort": "Mekka", "lat": 21.42, "lon": 39.83, "tz": "Asia/Riyadh", "datum": "2026-06-21", "aufgang": "05:39", "mittag": "12:22", "untergang": "19:05", "fajr": "04:13", "isha": "20:25"},
  {"ort": "Mekka", "lat": 21.42, "lon": 39.83, "tz": "Asia/Riyadh", "datum": "2026-09-23", "aufgang": "06:09", "mittag": "12:13", "untergang": "18:16", "fajr": "04:55", "isha": "19:25"},
  {"ort": "Mekka", "lat": 21.42, "lon": 39.83, "tz": "Asia/Riyadh", "datum": "2026-11-23", "aufgang": "06:36", "mittag": "12:06", "untergang": "17:37", "fajr": "05:18", "isha": "18:50"},
  {"ort": "Mekka", "lat": 21.42, "lon": 39.83, "tz": "Asia/Riyadh", "datum": "2026-12-21", "aufgang": "06:54", "mittag": "12:18", "untergang": "17:43", "fajr": "05:34", "isha": "18:58"}
];
const uhr = (ms) => new Date(ms).toTimeString().slice(0, 5);
const minuten = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
let groessteAbweichung = 0;
for (const e of REFERENZ) {
  process.env.TZ = e.tz;
  const o = { lat: e.lat, lon: e.lon, name: e.ort };
  const z = L.zeiten(new Date(e.datum + 'T12:00:00').getTime(), o);
  for (const k of ['aufgang', 'mittag', 'untergang', 'fajr', 'isha']) {
    if (e[k] === null) {
      // Sonne sinkt nicht tief genug: Siebtel-Regel, Fajr muss vor Sonnenaufgang liegen
      assert.ok(k === 'fajr' ? z.fajr < z.aufgang : z.isha > z.untergang, `${e.ort} ${e.datum} ${k} Ersatzregel`);
      continue;
    }
    const d = Math.abs(minuten(uhr(z[k])) - minuten(e[k]));
    groessteAbweichung = Math.max(groessteAbweichung, d);
    assert.ok(d <= 2, `${e.ort} ${e.datum} ${k}: ${uhr(z[k])} statt ${e[k]}`);
  }
  assert.ok(z.mittag < z.asr && z.asr < z.untergang, `${e.ort} ${e.datum} Asr zwischen Mittag und Sonnenuntergang`);
}

// Ein ganzes Jahr in Kassel, alle 2 Minuten: nie Sonne und Mond zugleich, mittags Sonne, um Mitternacht Mond
process.env.TZ = 'Europe/Berlin';
const kassel = { lat: 51.31, lon: 9.48, name: 'Kassel' };
let ueberschneidung = 0, phasen = new Set();
for (let t = Date.parse('2026-01-01T00:00:00'); t < Date.parse('2027-01-01T00:00:00'); t += 120000) {
  const s = L.zustand(t, kassel);
  if (s.sonneSicht > 0.01 && s.nacht > 0.01) ueberschneidung++;
  phasen.add(s.phase);
  for (const f of [s.himmel, s.sonne, s.berg]) assert.match(f, /^#[0-9a-f]{6}$/i);
}
assert.strictEqual(ueberschneidung, 0, 'Sonne und Mond gleichzeitig sichtbar');
assert.strictEqual(phasen.size, 6, 'alle sechs Tageszeiten kommen vor');
for (const d of ['2026-03-20', '2026-06-21', '2026-12-21']) {
  const z = L.zeiten(Date.parse(d + 'T12:00:00'), kassel);
  const mittag = L.zustand(z.mittag, kassel), nacht = L.zustand(Date.parse(d + 'T00:30:00'), kassel);
  assert.ok(mittag.sonneSicht === 1 && mittag.nacht === 0 && mittag.sonneY < 47, `${d} mittags Sonne oben`);
  assert.ok(nacht.sonneSicht === 0 && nacht.nacht === 1, `${d} nachts Mond und Sterne`);
  assert.strictEqual(mittag.himmel.toLowerCase(), '#e6ecf5', 'mittags wie das App-Symbol');
}
console.log(`logo: ok (größte Abweichung zur Referenz ${groessteAbweichung} min)`);
