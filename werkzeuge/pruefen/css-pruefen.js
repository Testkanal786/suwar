'use strict';
// Statische Prüfung der Stylesheets gegen tokens.json und DESIGN.md.
// Findet Farben außerhalb der Tokens, Verläufe, Schatten, fremde Radien, Abstände, Schriftgrößen, Dauern und Kurven.
// Aufruf: node werkzeuge/pruefen/css-pruefen.js [datei.css …]   (Standard: stil.css und gast.css)
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..', '..');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, 'tokens.json'), 'utf8'));
const dateien = process.argv.slice(2).length ? process.argv.slice(2) : ['stil.css', 'gast.css'];

const norm = (x) => x.toLowerCase().replace(/\s+/g, '').replace(/(\D)0\./g, '$1.');
const TOKENFARBEN = new Set(Object.values(T.farben).flatMap((m) => Object.values(m)).map(norm));
const AUSNAHMEN = new Set(Object.entries(T.ausnahmeFarben).filter(([k]) => !k.startsWith('_')).map(([, v]) => norm(v)));
const ABSTAENDE = new Set([...T.abstaende, 2]); // 2 px nur als Fuge im Foto-Raster (DESIGN.md 4)
const SCHRIFT = new Set(T.schriftgroessen);
const DAUERN = new Set(Object.values(T.dauern));
const KURVEN = new Set(Object.values(T.kurven).map(norm));
const ms = (x) => (x.endsWith('ms') ? parseFloat(x) : parseFloat(x) * 1000);
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

let gesamt = 0;
for (const rel of dateien) {
  const text = ohneKommentare(fs.readFileSync(path.resolve(WURZEL, rel), 'utf8'));
  const zeilen = text.split(/\r?\n/);
  const funde = [];
  let inRootTokens = false;
  zeilen.forEach((zeile, i) => {
    const nr = i + 1;
    // Die Token-Blöcke (:root und die Darkmode-Fassung) dürfen die Tokenfarben definieren
    if (/^\s*:root\s*\{|^\s*@media\s*\(prefers-color-scheme/.test(zeile)) inRootTokens = true;
    const fund = (art, was) => funde.push({ nr, art, was });

    // Farben
    for (const f of zeile.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || []) {
      const n = norm(f);
      if (AUSNAHMEN.has(n)) continue;
      if (inRootTokens && TOKENFARBEN.has(n)) continue;
      fund('FARBE', f);
    }
    if (/gradient\(/.test(zeile)) fund('VERLAUF', zeile.trim().slice(0, 60));
    if (/(box-shadow|text-shadow)\s*:(?!\s*none)|drop-shadow\(/.test(zeile)) fund('SCHATTEN', zeile.trim().slice(0, 60));

    for (const m of zeile.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
      const [, eig, wert] = m;
      const px = (wert.match(/-?\d*\.?\d+px/g) || []).map((x) => Math.abs(parseFloat(x)));
      if (eig === 'border-radius' || /^border-.*-radius$/.test(eig)) {
        for (const teil of wert.trim().split(/\s+/)) if (!['0', '12px', 'var(--radius)'].includes(teil)) fund('RADIUS', `${eig}: ${wert.trim()}`);
      }
      if (/^(padding|margin|gap|row-gap|column-gap)(-|$)/.test(eig)) for (const v of px) if (!ABSTAENDE.has(v)) fund('ABSTAND', `${eig}: ${wert.trim()}`);
      if (eig === 'font-size') for (const v of px) if (!SCHRIFT.has(v)) fund('SCHRIFTGROESSE', `${v}px`);
      if (eig === 'font') for (const v of (wert.match(/(\d+)px/g) || [])) if (!SCHRIFT.has(parseFloat(v))) fund('SCHRIFTGROESSE', v);
      if (eig === 'font-family' && !/var\(--schrift-|inherit/.test(wert) && !/@font-face/.test(zeilen.slice(Math.max(0, i - 3), i + 1).join(' '))) fund('SCHRIFT', wert.trim());
    }

    // Bewegung
    const langErlaubt = T.erlaubtLang.some((x) => zeile.includes(x));
    for (const m of zeile.matchAll(/(transition|animation)(-duration|-timing-function)?\s*:\s*([^;}]+)/g)) {
      const wert = m[3];
      if (m[1] === 'transition' && !m[2]) {
        for (const teil of wert.split(/,(?![^(]*\))/)) {
          const eig = teil.trim().split(/\s+/)[0];
          if (T.layoutEigenschaften.includes(eig)) fund('RUCKELGEFAHR', `transition auf ${eig}`);
        }
      }
      for (const d of wert.replace(/var\([^)]*\)/g, '').match(/(?<![\w.-])\d*\.?\d+m?s\b/g) || []) {
        const v = Math.round(ms(d));
        if (!DAUERN.has(v) && v !== 0 && !langErlaubt) fund('DAUER', `${v} ms`);
      }
      for (const k of wert.replace(/var\([^)]*\)/g, '').match(/cubic-bezier\([^)]*\)|\b(ease-in-out|ease-in|ease-out|ease|linear)\b/g) || []) {
        if (!KURVEN.has(norm(k))) fund('KURVE', k + (k === 'ease-in' ? ' (wirkt träge)' : ''));
      }
    }
    if (/^\s*}\s*$/.test(zeile) && inRootTokens && !/^\s{2,}}/.test(zeile)) inRootTokens = false;
  });
  // @keyframes dürfen nur transform und opacity ändern
  for (const kf of text.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    for (const p of T.layoutEigenschaften) if (p !== 'all' && new RegExp(`[{;\\s]${p}\\s*:`).test(kf[2])) {
      funde.push({ nr: text.slice(0, kf.index).split('\n').length, art: 'RUCKELGEFAHR', was: `@keyframes ${kf[1]} animiert ${p}` });
    }
  }
  gesamt += funde.length;
  console.log(`\n## ${rel}: ${funde.length} Funde`);
  for (const f of funde) console.log(`- Zeile ${f.nr}: ${f.art} ${f.was}`);
}
console.log(`\nRegeln: DESIGN.md · Werte: werkzeuge/pruefen/tokens.json`);
process.exitCode = gesamt ? 1 : 0;
