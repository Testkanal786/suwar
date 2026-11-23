'use strict';
// Suwar – Standort aus Fotos und Videos entfernen.
// Alles geschieht an Ort und Stelle: Die Datei behält Länge und Aufbau, nur die Standortwerte werden genullt.
// Die Bildpunkte bleiben unverändert (keine neue Komprimierung). Läuft im Browser und in Node (für Tests).
(function (global) {
  const GROESSE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  // GPS-Verzeichnis eines TIFF-Blocks leeren (steckt in JPEG und HEIC im "Exif"-Teil).
  function tiffGpsNullen(b, tiff) {
    const le = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
    const be = b[tiff] === 0x4d && b[tiff + 1] === 0x4d;
    if (!le && !be) return false;
    const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
    const u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])) >>> 0;
    if (u16(tiff + 2) !== 42) return false;
    const ifd0 = tiff + u32(tiff + 4);
    if (ifd0 + 2 > b.length) return false;
    const n = u16(ifd0);
    let gefunden = false;
    for (let i = 0; i < n; i++) {
      const e = ifd0 + 2 + i * 12;
      if (e + 12 > b.length) break;
      if (u16(e) !== 0x8825) continue; // Verweis auf das GPS-Verzeichnis
      const gps = tiff + u32(e + 8);
      if (gps + 2 > b.length) break;
      const m = u16(gps);
      for (let j = 0; j < m; j++) {
        const ge = gps + 2 + j * 12;
        if (ge + 12 > b.length) break;
        const len = (GROESSE[u16(ge + 2)] || 1) * u32(ge + 4);
        if (len > 4) { // Werte, die nicht in den Eintrag passen, liegen woanders – auch dort nullen
          const off = tiff + u32(ge + 8);
          if (off + len <= b.length) b.fill(0, off, off + len);
        }
        b.fill(0, ge, ge + 12);
      }
      b[gps] = 0; b[gps + 1] = 0; // leeres Verzeichnis (0 Einträge, kein Folgeverzeichnis)
      gefunden = m > 0;
    }
    return gefunden;
  }

  function suchen(b, muster, ab, bis) {
    const erstes = muster[0];
    const ende = Math.min(bis, b.length) - muster.length;
    outer: for (let i = ab; i <= ende; i++) {
      if (b[i] !== erstes) continue;
      for (let k = 1; k < muster.length; k++) if (b[i + k] !== muster[k]) continue outer;
      return i;
    }
    return -1;
  }
  const latin1 = (b, ab, bis) => { let s = ''; for (let i = ab; i < bis; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, Math.min(bis, i + 8192))); return s; };
  // Ziffern im gefundenen Text durch 0 ersetzen (gleiche Länge, gleiches Format).
  function ziffernNullen(b, start, text) { let n = 0; for (let i = 0; i < text.length; i++) if (/[1-9]/.test(text[i])) { b[start + i] = 0x30; n++; } return n; }

  // XMP-Block (Text im Bild): GPS-Angaben auf 0 setzen.
  function xmpNullen(b) {
    let treffer = 0;
    let ab = 0;
    for (;;) {
      const a = suchen(b, [0x3c, 0x78, 0x3a, 0x78, 0x6d, 0x70, 0x6d, 0x65, 0x74, 0x61], ab, b.length); // <x:xmpmeta
      if (a < 0) break;
      let z = suchen(b, [0x3c, 0x2f, 0x78, 0x3a, 0x78, 0x6d, 0x70, 0x6d, 0x65, 0x74, 0x61], a, Math.min(b.length, a + 4e6)); // </x:xmpmeta
      if (z < 0) z = Math.min(b.length, a + 65536);
      const s = latin1(b, a, z);
      const re = /(GPS(?:Latitude|Longitude|Altitude|DestLatitude|DestLongitude|Coordinates)[^=>]*=\s*")([^"]*)"|<([\w-]+:GPS(?:Latitude|Longitude|Altitude|DestLatitude|DestLongitude))>([^<]*)</g;
      let m;
      while ((m = re.exec(s))) {
        const wert = m[2] !== undefined ? m[2] : m[4];
        const start = a + m.index + (m[2] !== undefined ? m[1].length : m[3].length + 2);
        if (ziffernNullen(b, start, wert)) treffer++;
      }
      ab = z + 1;
    }
    return treffer;
  }

  // Videos (MP4/MOV/3GP): Ortsangaben im ISO-6709-Format (z. B. "+51.3127+009.4797/") im moov-Kasten nullen.
  function videoNullen(b) {
    let treffer = 0;
    let o = 0;
    const u32 = (p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
    while (o + 8 <= b.length) {
      let groesse = u32(o);
      const typ = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
      let kopf = 8;
      if (groesse === 1) { groesse = u32(o + 8) * 4294967296 + u32(o + 12); kopf = 16; } else if (groesse === 0) groesse = b.length - o;
      if (groesse < kopf) break;
      if (typ === 'moov') {
        const ende = Math.min(b.length, o + groesse);
        const s = latin1(b, o, ende);
        const re = /[+-]\d{1,2}\.\d+[+-]\d{1,3}\.\d+(?:[+-]\d+(?:\.\d+)?)?(?:CRS[\w:]+)?\/?/g;
        let m;
        while ((m = re.exec(s))) if (ziffernNullen(b, o + m.index, m[0])) treffer++;
      }
      o += groesse;
    }
    return treffer;
  }

  // Haupteinstieg: daten = Uint8Array (wird verändert), typ = MIME-Typ. Gibt die Zahl der entfernten Angaben zurück.
  function entfernen(daten, typ) {
    const b = daten;
    let n = 0;
    if (/^video\//.test(typ) || /\.(mp4|mov|m4v|3gp)$/i.test(typ)) return videoNullen(b);
    if (/png|gif|webp/.test(typ)) return 0; // enthalten in der Praxis keine Standortdaten von Kameras
    // Alle Exif-Blöcke ("Exif\0\0" + TIFF-Kopf) finden – bei JPEG am Anfang, bei HEIC irgendwo im Container.
    let ab = 0;
    for (;;) {
      const i = suchen(b, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00], ab, b.length);
      if (i < 0) break;
      if (tiffGpsNullen(b, i + 6)) n++;
      ab = i + 6;
    }
    n += xmpNullen(b);
    return n;
  }

  const api = { entfernen, tiffGpsNullen };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SuwarStandort = api;
})(typeof self !== 'undefined' ? self : this);
