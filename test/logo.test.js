'use strict';
// Prüft das lebendige Logo: Tageszeiten kommen nur aus der Gebete-Liste (wie Indibat), ohne eigene Rechnung,
// und Sonne und Mond sind ein ganzes Jahr lang nie gleichzeitig zu sehen.
// Aufruf: node test/logo.test.js
const assert = require('assert');
process.env.TZ = 'Europe/Berlin';
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
require('../js/logo.js');
const L = globalThis.SuwarLogo;

const uhr = (ms) => new Date(ms).toTimeString().slice(0, 5);
const um = (tag, hhmm) => Date.parse(`${tag}T${hhmm}:00`);
const tag = '2026-11-23';
const liste = { [tag]: { fajr: '05:53', dhuhr: '12:08', asr: '14:10', maghrib: '16:23', isha: '18:16' } };

// 1. Zeiten des Tages, Sonnenaufgang aus der Liste abgeleitet (Dhuhr in der Mitte zwischen Aufgang und Maghrib)
const z = L.tagZeiten(um(tag, '12:00'), liste);
assert.ok(z && z.genau && z.tag === tag);
assert.deepStrictEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((k) => uhr(z[k])), ['05:53', '12:08', '14:10', '16:23', '18:16']);
assert.strictEqual(uhr(z.aufgang), '07:53');

// 2. Tageszeiten wechseln genau zu den Zeiten der Liste
const phase = (hhmm, t = liste) => L.zustand(um(tag, hhmm), t).phase;
const erwartet = [['05:52', 'Nacht · Isha'], ['05:54', 'Morgengrauen · Fajr'], ['07:54', 'Vormittag'], ['12:09', 'Mittag · Dhuhr'],
  ['14:11', 'Nachmittag · Asr'], ['16:24', 'Abend · Maghrib'], ['18:17', 'Nacht · Isha']];
for (const [t, p] of erwartet) assert.strictEqual(phase(t), p, t);
const mittag = L.zustand(um(tag, '12:08'), liste);
assert.strictEqual(mittag.himmel, '#e6ecf5', 'mittags wie das App-Symbol');
assert.ok(mittag.sonneSicht === 1 && mittag.nacht === 0 && mittag.sonneY < 43);
const nacht = L.zustand(um(tag, '23:00'), liste);
assert.ok(nacht.sonneSicht === 0 && nacht.nacht === 1);

// 3. Fehlt der Tag, gelten die Uhrzeiten des nächsten Tags innerhalb einer Woche; sonst Mittagshimmel ohne Phase
const morgen = '2026-11-24';
const zm = L.tagZeiten(um(morgen, '12:00'), liste);
assert.ok(zm && !zm.genau && zm.tag === tag && uhr(zm.fajr) === '05:53');
const leer = L.zustand(um('2026-12-20', '12:00'), liste);
assert.ok(leer.phase === null && leer.zeiten === null && leer.himmel === L.FARBEN.tag.himmel);
assert.strictEqual(L.zustand(um(tag, '12:00'), {}).phase, null, 'ohne Liste keine eigene Rechnung');

// 4. Unvollständige oder unsinnige Einträge werden nicht verwendet
assert.strictEqual(L.tagZeiten(um(tag, '12:00'), { [tag]: { fajr: '05:53', dhuhr: '12:08' } }), null);
assert.strictEqual(L.tagZeiten(um(tag, '12:00'), { [tag]: { fajr: '13:00', dhuhr: '12:08', asr: '14:10', maghrib: '16:23', isha: '18:16' } }), null);
// Isha nach Mitternacht (Sommer) ist erlaubt
assert.ok(L.tagZeiten(um('2026-06-21', '12:00'), { '2026-06-21': { fajr: '03:05', dhuhr: '13:26', asr: '17:47', maghrib: '21:48', isha: '00:15' } }));

// 5. Ein ganzes Jahr mit Testzeiten im Stil der Liste (auch sehr kurze Abende): nie Sonne und Mond zugleich,
//    alle sechs Tageszeiten kommen vor. Die Testzeiten sind nur Testdaten, keine Rechnung der App.
const jahr = {};
const p2 = (n) => String(n).padStart(2, '0');
const hm = (min) => `${p2(Math.floor(min / 60) % 24)}:${p2(Math.round(min % 60))}`;
for (let t = Date.parse('2026-01-01T12:00:00'); t < Date.parse('2027-01-01T12:00:00'); t += 86400000) {
  const d = new Date(t), j = Math.floor((t - Date.parse('2026-01-01T12:00:00')) / 86400000);
  const halb = 6 * 60 + 250 * Math.sin((2 * Math.PI * (j - 80)) / 365); // halbe Tageslänge in Minuten
  const mitte = 12 * 60 + 20 + (d.getTimezoneOffset() === -120 ? 60 : 0);
  const abend = j % 7 === 0 ? 12 : 60 + 40 * Math.sin((2 * Math.PI * (j - 80)) / 365); // jeder 7. Tag: Isha nur 12 min nach Maghrib
  jahr[`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`] = {
    fajr: hm(mitte - halb - abend - 10), dhuhr: hm(mitte), asr: hm(mitte + halb * 0.45), maghrib: hm(mitte + halb), isha: hm(mitte + halb + abend),
  };
}
let zugleich = 0;
const phasen = new Set();
for (let t = Date.parse('2026-01-01T00:00:00'); t < Date.parse('2027-01-01T00:00:00'); t += 120000) {
  const s = L.zustand(t, jahr);
  if (s.sonneSicht > 0.01 && s.nacht > 0.01) zugleich++;
  phasen.add(s.phase);
  for (const f of [s.himmel, s.sonne, s.berg]) assert.match(f, /^#[0-9a-f]{6}$/i);
}
assert.strictEqual(zugleich, 0, 'Sonne und Mond gleichzeitig sichtbar');
assert.strictEqual(phasen.size, 6, [...phasen].join(', '));

// 6. Speicher: nur vollständige Tage im Zeitfenster, löschbar
const heute = new Date(), k = `${heute.getFullYear()}-${p2(heute.getMonth() + 1)}-${p2(heute.getDate())}`;
L.gebeteSetzen({ [k]: liste[tag], '2020-01-01': liste[tag], [`${heute.getFullYear() + 1}-01-01`]: { fajr: '06:00' } });
assert.ok(L.gebete().tage[k] && !L.gebete().tage['2020-01-01'] && Object.keys(L.gebete().tage).length === 1);
assert.strictEqual(L.gebete().quelle, 'Indibat');
L.gebeteSetzen(null);
assert.deepStrictEqual(L.gebete().tage, {});
console.log('logo: ok');
