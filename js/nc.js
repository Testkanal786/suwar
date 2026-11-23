'use strict';
// Suwar – Verbindung zur Nextcloud.
// Alle Zugriffe gehen direkt vom Gerät an die Nextcloud (WebDAV), mit dem App-Passwort des Kontos.
// Die erlaubte Herkunft (CORS) stellt die Nextcloud-App „WebAppPassword“ bereit:
//   Feld „WebDAV/CalDAV“ für Dateien und Tags, „Files sharing API“ für Links, „Preview“ für Vorschaubilder.
/* exported NC */
const NC = (() => {
  const DAV = 'DAV:';
  const OC = 'http://owncloud.org/ns';
  const NCNS = 'http://nextcloud.org/ns';
  let konto = null; // { server, user, pass }

  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const auth = () => 'Basic ' + b64(konto.user + ':' + konto.pass);
  const kodieren = (pfad) => pfad.split('/').map(encodeURIComponent).join('/');
  const davBasis = () => konto.server + '/remote.php/dav';
  const dateiUrl = (pfad) => `${davBasis()}/files/${encodeURIComponent(konto.user)}${kodieren(pfad)}`;
  const etagSauber = (e) => (e || '').replace(/^W\//, '');

  class NcFehler extends Error { constructor(text, status) { super(text); this.status = status; } }

  async function anfrage(method, url, { headers = {}, body, signal } = {}) {
    let r;
    try {
      r = await fetch(url, { method, body, signal, credentials: 'omit', cache: 'no-store', headers: { Authorization: auth(), ...headers } });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new NcFehler('Keine Verbindung zur Nextcloud', 0);
    }
    if (r.status === 401) throw new NcFehler('Anmeldung abgelehnt – App-Passwort prüfen', 401);
    return r;
  }

  /* ---------- XML lesen ---------- */
  function antworten(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return [...doc.getElementsByTagNameNS(DAV, 'response')].map((r) => {
      const hrefEl = r.getElementsByTagNameNS(DAV, 'href')[0];
      const props = {};
      for (const ps of r.getElementsByTagNameNS(DAV, 'propstat')) {
        const st = ps.getElementsByTagNameNS(DAV, 'status')[0];
        if (st && !/\s2\d\d\s/.test(st.textContent)) continue;
        const prop = ps.getElementsByTagNameNS(DAV, 'prop')[0];
        if (prop) for (const el of prop.children) props[el.localName] = el;
      }
      return { href: decodeURIComponent(hrefEl ? hrefEl.textContent : ''), props };
    });
  }
  const txt = (p, n) => (p[n] ? p[n].textContent : '');
  // Pfad relativ zum Dateibereich des Kontos aus dem href ermitteln
  function pfadAus(href) {
    const marke = `/files/${konto.user}`;
    const i = href.indexOf(marke);
    let p = i >= 0 ? href.slice(i + marke.length) : href;
    if (!p.startsWith('/')) p = '/' + p;
    return p.length > 1 ? p.replace(/\/$/, '') : p;
  }

  /* ---------- Dateien ---------- */
  async function propfind(pfad, depth = 1, props = '<d:getlastmodified/><d:getetag/><d:getcontenttype/><d:getcontentlength/><d:resourcetype/><oc:fileid/>') {
    const body = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="${OC}" xmlns:nc="${NCNS}"><d:prop>${props}</d:prop></d:propfind>`;
    const r = await anfrage('PROPFIND', dateiUrl(pfad), { headers: { Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8' }, body });
    if (r.status === 404) return null;
    if (r.status >= 400) throw new NcFehler(`Ordner ${pfad} nicht lesbar (Fehler ${r.status})`, r.status);
    return antworten(await r.text()).map((a) => ({
      pfad: pfadAus(a.href),
      ordner: !!(a.props.resourcetype && a.props.resourcetype.getElementsByTagNameNS(DAV, 'collection').length),
      etag: etagSauber(txt(a.props, 'getetag')),
      id: txt(a.props, 'fileid'),
      typ: txt(a.props, 'getcontenttype'),
      groesse: parseInt(txt(a.props, 'getcontentlength') || '0', 10),
      geaendert: Date.parse(txt(a.props, 'getlastmodified')) || 0,
    }));
  }
  const existiert = async (pfad) => !!(await propfind(pfad, 0));
  async function ordnerAnlegen(pfad) {
    const r = await anfrage('MKCOL', dateiUrl(pfad));
    if (r.status === 201 || r.status === 405) return true; // 405 = gibt es schon
    if (r.status === 409) { // Elternordner fehlt
      await ordnerAnlegen(pfad.split('/').slice(0, -1).join('/') || '/');
      return ordnerAnlegen(pfad);
    }
    throw new NcFehler(`Ordner ${pfad} nicht angelegt (Fehler ${r.status})`, r.status);
  }
  async function hochladen(pfad, daten, { typ, mtime, ueberschreiben = false } = {}) {
    const headers = { 'Content-Type': typ || 'application/octet-stream' };
    if (mtime) headers['X-OC-MTime'] = String(Math.floor(mtime / 1000));
    if (!ueberschreiben) headers['If-None-Match'] = '*';
    const r = await anfrage('PUT', dateiUrl(pfad), { headers, body: daten });
    if (r.status === 412) throw new NcFehler('Datei gibt es schon', 412);
    if (r.status >= 400) throw new NcFehler(`Hochladen fehlgeschlagen (Fehler ${r.status})`, r.status);
    return { etag: etagSauber(r.headers.get('etag')) };
  }
  // Freien Namen finden: "Bild.jpg" → "Bild (2).jpg"
  async function freierName(ordner, name) {
    const punkt = name.lastIndexOf('.');
    const stamm = punkt > 0 ? name.slice(0, punkt) : name;
    const ext = punkt > 0 ? name.slice(punkt) : '';
    let n = name;
    for (let i = 2; i < 200; i++) {
      if (!(await existiert(`${ordner}/${n}`))) return n;
      n = `${stamm} (${i})${ext}`;
    }
    return `${stamm} (${Date.now()})${ext}`;
  }
  async function holen(pfad, { signal, fortschritt } = {}) {
    const r = await anfrage('GET', dateiUrl(pfad), { signal });
    if (!r.ok) throw new NcFehler(`Datei nicht geladen (Fehler ${r.status})`, r.status);
    const gesamt = parseInt(r.headers.get('content-length') || '0', 10);
    if (!fortschritt || !r.body || !gesamt) return r.blob();
    const teile = [];
    let geladen = 0;
    const leser = r.body.getReader();
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      teile.push(value); geladen += value.length; fortschritt(geladen / gesamt);
    }
    return new Blob(teile, { type: r.headers.get('content-type') || '' });
  }
  async function verschieben(von, nach, ueberschreiben = false) {
    const r = await anfrage('MOVE', dateiUrl(von), { headers: { Destination: dateiUrl(nach), Overwrite: ueberschreiben ? 'T' : 'F' } });
    if (r.status >= 400) throw new NcFehler(`Verschieben fehlgeschlagen (Fehler ${r.status})`, r.status);
  }
  async function loeschen(pfad) {
    const r = await anfrage('DELETE', dateiUrl(pfad));
    if (r.status >= 400 && r.status !== 404) throw new NcFehler(`Löschen fehlgeschlagen (Fehler ${r.status})`, r.status);
  }

  /* ---------- JSON-Dateien sicher ändern (lesen → ändern → mit If-Match zurückschreiben) ---------- */
  async function jsonLesen(pfad, leer) {
    const r = await anfrage('GET', dateiUrl(pfad));
    if (r.status === 404) return { daten: leer(), etag: null };
    if (!r.ok) throw new NcFehler(`${pfad} nicht lesbar (Fehler ${r.status})`, r.status);
    let daten;
    try { daten = JSON.parse(await r.text()); } catch { daten = leer(); }
    return { daten, etag: etagSauber(r.headers.get('etag')) };
  }
  async function jsonAendern(pfad, leer, aendern) {
    for (let versuch = 0; versuch < 5; versuch++) {
      const { daten, etag } = await jsonLesen(pfad, leer);
      const neu = aendern(daten) || daten;
      const headers = { 'Content-Type': 'application/json; charset=utf-8' };
      if (etag) headers['If-Match'] = etag; else headers['If-None-Match'] = '*';
      const r = await anfrage('PUT', dateiUrl(pfad), { headers, body: JSON.stringify(neu, null, 1) });
      if (r.status === 412) continue; // anderes Gerät war schneller → neu lesen
      if (r.status >= 400) throw new NcFehler(`${pfad} nicht gespeichert (Fehler ${r.status})`, r.status);
      return neu;
    }
    throw new NcFehler(`${pfad}: zu viele gleichzeitige Änderungen`, 412);
  }

  /* ---------- Fotos und Videos suchen (WebDAV SEARCH, ganze Ordnerbäume in einer Anfrage) ---------- */
  const SUCH_PROPS = '<d:getcontenttype/><d:getlastmodified/><d:getetag/><d:getcontentlength/><oc:fileid/><oc:favorite/><nc:has-preview/><nc:metadata-photos-original_date_time/><nc:metadata-photos-gps/><nc:metadata-photos-size/>';
  async function suchen(ordner, { seit = 0, start = 0, anzahl = 1000 } = {}) {
    const neuer = seit ? `<d:gt><d:prop><d:getlastmodified/></d:prop><d:literal>${Math.floor(seit / 1000)}</d:literal></d:gt>` : '';
    const medien = '<d:or><d:like><d:prop><d:getcontenttype/></d:prop><d:literal>image/%</d:literal></d:like><d:like><d:prop><d:getcontenttype/></d:prop><d:literal>video/%</d:literal></d:like></d:or>';
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:searchrequest xmlns:d="DAV:" xmlns:oc="${OC}" xmlns:nc="${NCNS}" xmlns:ns="https://github.com/icewind1991/SearchDAV/ns">
 <d:basicsearch>
  <d:select><d:prop>${SUCH_PROPS}</d:prop></d:select>
  <d:from><d:scope><d:href>/files/${konto.user}${ordner}</d:href><d:depth>infinity</d:depth></d:scope></d:from>
  <d:where>${neuer ? `<d:and>${medien}${neuer}</d:and>` : medien}</d:where>
  <d:orderby><d:order><d:prop><d:getlastmodified/></d:prop><d:descending/></d:order></d:orderby>
  <d:limit><d:nresults>${anzahl}</d:nresults><ns:firstresult>${start}</ns:firstresult></d:limit>
 </d:basicsearch>
</d:searchrequest>`;
    const r = await anfrage('SEARCH', davBasis() + '/', { headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body });
    if (r.status === 404 || r.status === 400) return [];
    if (r.status >= 400) throw new NcFehler(`Suche fehlgeschlagen (Fehler ${r.status})`, r.status);
    return antworten(await r.text()).map((a) => {
      const p = a.props;
      let gps = null;
      if (p['metadata-photos-gps']) {
        const el = p['metadata-photos-gps'];
        const lat = el.getElementsByTagNameNS('*', 'latitude')[0];
        const lon = el.getElementsByTagNameNS('*', 'longitude')[0];
        if (lat && lon) gps = { lat: parseFloat(lat.textContent), lon: parseFloat(lon.textContent) };
        else try { const j = JSON.parse(el.textContent); if (j && j.latitude != null) gps = { lat: +j.latitude, lon: +j.longitude }; } catch { /* kein GPS */ }
        if (gps && (!isFinite(gps.lat) || !isFinite(gps.lon) || (gps.lat === 0 && gps.lon === 0))) gps = null;
      }
      const original = parseInt(txt(p, 'metadata-photos-original_date_time') || '0', 10);
      return {
        id: txt(p, 'fileid'),
        pfad: pfadAus(a.href),
        mime: txt(p, 'getcontenttype'),
        groesse: parseInt(txt(p, 'getcontentlength') || '0', 10),
        geaendert: Date.parse(txt(p, 'getlastmodified')) || 0,
        aufnahme: original > 0 ? original * 1000 : 0,
        etag: etagSauber(txt(p, 'getetag')),
        favorit: txt(p, 'favorite') === '1',
        vorschau: txt(p, 'has-preview') !== 'false',
        gps,
      };
    }).filter((m) => m.id && m.mime);
  }

  /* ---------- Tags (Nextcloud-Schlagworte; Namen sind für alle Benutzer sichtbar) ---------- */
  async function tagsLesen() {
    const body = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="${OC}"><d:prop><oc:id/><oc:display-name/><oc:user-visible/><oc:user-assignable/></d:prop></d:propfind>`;
    const r = await anfrage('PROPFIND', davBasis() + '/systemtags/', { headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' }, body });
    if (r.status >= 400) throw new NcFehler(`Tags nicht lesbar (Fehler ${r.status})`, r.status);
    return antworten(await r.text()).map((a) => ({ id: txt(a.props, 'id'), name: txt(a.props, 'display-name') })).filter((t) => t.id);
  }
  async function tagAnlegen(name) {
    const r = await anfrage('POST', davBasis() + '/systemtags/', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, userVisible: true, userAssignable: true, canAssign: true }) });
    if (r.status >= 400 && r.status !== 409) throw new NcFehler(`Tag ${name} nicht angelegt (Fehler ${r.status})`, r.status);
    const t = (await tagsLesen()).find((x) => x.name === name);
    if (!t) throw new NcFehler(`Tag ${name} nicht gefunden`, 404);
    return t;
  }
  async function tagSetzen(dateiId, tagId, an) {
    const r = await anfrage(an ? 'PUT' : 'DELETE', `${davBasis()}/systemtags-relations/files/${dateiId}/${tagId}`);
    if (r.status >= 400 && r.status !== 409 && r.status !== 404) throw new NcFehler(`Tag nicht ${an ? 'gesetzt' : 'entfernt'} (Fehler ${r.status})`, r.status);
  }
  async function dateienMitTag(tagId) {
    const body = `<?xml version="1.0"?><oc:filter-files xmlns:d="DAV:" xmlns:oc="${OC}"><d:prop><oc:fileid/></d:prop><oc:filter-rules><oc:systemtag>${tagId}</oc:systemtag></oc:filter-rules></oc:filter-files>`;
    const r = await anfrage('REPORT', dateiUrl('/'), { headers: { 'Content-Type': 'application/xml; charset=utf-8' }, body });
    if (r.status >= 400) throw new NcFehler(`Tag-Abfrage fehlgeschlagen (Fehler ${r.status})`, r.status);
    return antworten(await r.text()).map((a) => txt(a.props, 'fileid')).filter(Boolean);
  }

  /* ---------- Vorschaubilder (über WebAppPassword, Feld „Preview“) ---------- */
  async function vorschau(dateiId, px, signal) {
    const url = `${konto.server}/index.php/apps/webapppassword/core/preview?fileId=${dateiId}&x=${px}&y=${px}&a=${px > 400 ? 1 : 0}&forceIcon=0&mode=cover`;
    const r = await anfrage('GET', url, { signal });
    if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) throw new NcFehler('Keine Vorschau', r.status);
    return r.blob();
  }

  /* ---------- Freigabe-Links (über WebAppPassword, Feld „Files sharing API“) ---------- */
  async function linkErstellen(pfad, passwort) {
    const body = JSON.stringify({ path: pfad, shareType: 3, permissions: 1, ...(passwort ? { password: passwort } : {}) });
    const r = await anfrage('POST', `${konto.server}/index.php/apps/webapppassword/api/v1/shares?format=json`, {
      headers: { 'OCS-APIRequest': 'true', Accept: 'application/json', 'Content-Type': 'application/json' }, body,
    });
    let j = null;
    try { j = await r.json(); } catch { /* keine JSON-Antwort */ }
    const d = j && (j.ocs ? j.ocs.data : j);
    if (!r.ok || !d || !d.token) {
      const meldung = j && j.ocs && j.ocs.meta && j.ocs.meta.message;
      throw new NcFehler(meldung || `Link nicht erstellt (Fehler ${r.status})`, r.status);
    }
    return { id: d.id, token: d.token, url: d.url || `${konto.server}/s/${d.token}` };
  }

  return {
    setze(k) { konto = k ? { ...k, server: k.server.replace(/\/+$/, '') } : null; },
    get konto() { return konto; },
    NcFehler, propfind, existiert, ordnerAnlegen, hochladen, freierName, holen, verschieben, loeschen,
    jsonLesen, jsonAendern, suchen, tagsLesen, tagAnlegen, tagSetzen, dateienMitTag, vorschau, linkErstellen,
    webUrl: (ordner) => `${konto.server}/apps/files/?dir=${encodeURIComponent(ordner)}`,
    papierkorbUrl: () => `${konto.server}/apps/files/trashbin`,
  };
})();
