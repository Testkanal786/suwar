// Prüft die Standort-Entfernung an einem JPEG mit GPS und einem Video mit Ortsangabe.
const fs = require('fs');
const assert = require('assert');
const S = require('../js/standort.js');
const jpg = new Uint8Array(fs.readFileSync(__dirname + '/daten/mit-gps.jpg'));
const laenge = jpg.length;
const n = S.entfernen(jpg, 'image/jpeg');
assert.ok(n >= 1, 'GPS im JPEG nicht gefunden');
assert.strictEqual(jpg.length, laenge, 'Länge verändert');
fs.writeFileSync(__dirname + '/daten/ohne-gps.jpg', jpg);
const mp4 = new Uint8Array(fs.readFileSync(__dirname + '/daten/mit-gps.mp4'));
const m = S.entfernen(mp4, 'video/mp4');
assert.strictEqual(m, 1, 'Ortsangabe im Video nicht gefunden');
assert.ok(!Buffer.from(mp4).toString('latin1').includes('51.3127'), 'Koordinate im Video noch vorhanden');
assert.ok(Buffer.from(mp4).toString('latin1').includes('+00.0000+000.0000/'), 'Format nicht erhalten');
// Zweiter Durchlauf findet nichts mehr
assert.strictEqual(S.entfernen(jpg, 'image/jpeg'), 0);
console.log('standort: ok');
