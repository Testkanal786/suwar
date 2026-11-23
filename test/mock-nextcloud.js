// Nachgebaute Nextcloud für Tests: WebDAV (PROPFIND, SEARCH, PUT, GET, MKCOL, MOVE, DELETE, REPORT),
// Systemtags, WebAppPassword-Vorschau und -Freigaben, öffentliche Freigaben – mit CORS wie WebAppPassword.
// Start: node test/mock-nextcloud.js [port] [seed-ordner]
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +(process.argv[2] || 8090);
const SEED = process.argv[3] || path.join(__dirname, 'daten', 'seed');
const USER = 'elias';
const PASS = 'test-app-passwort';
let naechsteId = 100;
const dateien = new Map(); // pfad → { id, ordner, daten, mime, mtime, etag, gps }
const tags = new Map(); // id → name
const relationen = new Map(); // fileid → Set(tagId)
const freigaben = new Map(); // token → pfad
const protokoll = [];

const etag = (d, t) => '"' + crypto.createHash('md5').update(d || '').update(String(t)).digest('hex').slice(0, 16) + '"';
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4', json: 'application/json', heic: 'image/heic' };
function anlegen(p, daten, mtime, extra = {}) {
  const ordner = daten == null;
  const alt = dateien.get(p);
  const e = { id: alt ? alt.id : String(naechsteId++), ordner, daten: ordner ? null : daten, mime: ordner ? 'httpd/unix-directory' : (extra.mime || MIME[p.split('.').pop().toLowerCase()] || 'application/octet-stream'), mtime: mtime || Date.now(), gps: extra.gps || null };
  e.etag = etag(e.daten, e.mtime);
  dateien.set(p, e);
  return e;
}
function elternAnlegen(p) { const teile = p.split('/').filter(Boolean); for (let i = 1; i < teile.length; i++) { const q = '/' + teile.slice(0, i).join('/'); if (!dateien.has(q)) anlegen(q, null); } }
anlegen('/', null);
// Testdaten einlesen: seed/<Pfad in der Cloud>
function seedLesen(dir, basis = '') {
  if (!fs.existsSync(dir)) return;
  for (const n of fs.readdirSync(dir)) {
    const voll = path.join(dir, n);
    const p = basis + '/' + n;
    if (fs.statSync(voll).isDirectory()) { anlegen(p, null); seedLesen(voll, p); continue; }
    if (n.endsWith('.meta.json')) continue;
    let meta = {};
    if (fs.existsSync(voll + '.meta.json')) meta = JSON.parse(fs.readFileSync(voll + '.meta.json', 'utf8'));
    elternAnlegen(p);
    anlegen(p, fs.readFileSync(voll), meta.mtime || fs.statSync(voll).mtimeMs, meta);
  }
}
seedLesen(SEED);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const href = (p) => '/remote.php/dav/files/' + USER + p.split('/').map(encodeURIComponent).join('/') + (dateien.get(p) && dateien.get(p).ordner && p !== '/' ? '/' : '');
function eintragXml(p, e) {
  return `<d:response><d:href>${esc(href(p))}</d:href><d:propstat><d:prop>
<d:getlastmodified>${new Date(e.mtime).toUTCString()}</d:getlastmodified><d:getetag>${esc(e.etag)}</d:getetag>
<d:resourcetype>${e.ordner ? '<d:collection/>' : ''}</d:resourcetype>${e.ordner ? '' : `<d:getcontenttype>${e.mime}</d:getcontenttype><d:getcontentlength>${e.daten.length}</d:getcontentlength>`}
<oc:fileid>${e.id}</oc:fileid><oc:favorite>0</oc:favorite><nc:has-preview>${/^image\//.test(e.mime)}</nc:has-preview>
${e.gps ? `<nc:metadata-photos-gps><nc:latitude>${e.gps.lat}</nc:latitude><nc:longitude>${e.gps.lon}</nc:longitude><nc:altitude>0</nc:altitude></nc:metadata-photos-gps>` : ''}
</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
}
const multi = (inhalt) => `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">${inhalt}</d:multistatus>`;
const kinder = (p) => [...dateien.keys()].filter((q) => q !== p && q.startsWith(p === '/' ? '/' : p + '/') && !q.slice(p === '/' ? 1 : p.length + 1).includes('/'));

function cors(req, res) {
  const o = req.headers.origin;
  if (!o) return;
  res.setHeader('access-control-allow-origin', o);
  res.setHeader('access-control-allow-methods', req.headers['access-control-request-method'] || 'GET,PUT,POST,DELETE,PROPFIND,SEARCH,MKCOL,MOVE,REPORT');
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || '*');
  res.setHeader('access-control-expose-headers', 'etag, dav');
  res.setHeader('access-control-allow-credentials', 'true');
}
const ende = (res, status, text = '', typ = 'text/plain') => { res.writeHead(status, { 'Content-Type': typ }); res.end(text); };
const angemeldet = (req) => req.headers.authorization === 'Basic ' + Buffer.from(USER + ':' + PASS).toString('base64');
const davPfad = (url) => { const m = url.match(/^\/remote\.php\/dav\/files\/[^/]+(\/.*)?$/); if (!m) return null; const p = decodeURIComponent((m[1] || '/').replace(/\/+$/, '')) || '/'; return p; };

const server = http.createServer((req, res) => {
  const teile = [];
  req.on('data', (c) => teile.push(c));
  req.on('end', () => {
    const body = Buffer.concat(teile);
    const u = new URL(req.url, 'http://x');
    cors(req, res);
    protokoll.push(`${req.method} ${u.pathname}${u.search}`);
    if (req.method === 'OPTIONS') return ende(res, 200);
    // Test-Hilfen (nur in der Attrappe)
    if (u.pathname === '/__test/datei') { const e = dateien.get(u.searchParams.get('p')); return e && !e.ordner ? (res.writeHead(200, { 'Content-Type': e.mime }), res.end(e.daten)) : ende(res, 404); }
    if (u.pathname === '/__test/liste') return ende(res, 200, JSON.stringify([...dateien.keys()].sort()), 'application/json');
    if (u.pathname === '/__test/tags') return ende(res, 200, JSON.stringify({ tags: [...tags], relationen: [...relationen].map(([k, v]) => [k, [...v]]) }), 'application/json');
    if (u.pathname === '/__test/protokoll') return ende(res, 200, JSON.stringify(protokoll), 'application/json');
    // Öffentliche Freigaben (ohne Anmeldung)
    let m = u.pathname.match(/^\/index\.php\/apps\/files_sharing\/publicpreview\/(\w+)$/) || u.pathname.match(/^\/s\/(\w+)\/download$/);
    if (m) {
      const basis = freigaben.get(m[1]);
      if (!basis) return ende(res, 404);
      const name = u.searchParams.get('file') || (u.searchParams.get('files') ? '/' + u.searchParams.get('files') : null);
      if (!name) return ende(res, 200, 'ZIP-Attrappe');
      const e = dateien.get(basis + name);
      if (!e) return ende(res, 404);
      res.writeHead(200, { 'Content-Type': e.mime }); return res.end(e.daten);
    }
    if (!angemeldet(req)) { res.setHeader('WWW-Authenticate', 'Basic realm="Nextcloud"'); return ende(res, 401); }
    // Vorschau (WebAppPassword)
    if (u.pathname === '/index.php/apps/webapppassword/core/preview') {
      const e = [...dateien.values()].find((x) => x.id === u.searchParams.get('fileId'));
      if (!e || !/^image\/(jpeg|png)/.test(e.mime)) return ende(res, 404);
      res.writeHead(200, { 'Content-Type': e.mime }); return res.end(e.daten);
    }
    // Freigabe-API (WebAppPassword)
    if (u.pathname === '/index.php/apps/webapppassword/api/v1/shares' && req.method === 'POST') {
      if (req.headers['ocs-apirequest'] !== 'true') return ende(res, 412, 'CSRF check failed');
      const j = JSON.parse(body.toString() || '{}');
      if (!dateien.has(j.path)) return ende(res, 404, JSON.stringify({ ocs: { meta: { status: 'failure', message: 'Wrong path' } } }), 'application/json');
      const token = crypto.randomBytes(8).toString('hex').replace(/[^a-zA-Z0-9]/g, '');
      freigaben.set(token, j.path);
      return ende(res, 200, JSON.stringify({ ocs: { meta: { status: 'ok', statuscode: 200 }, data: { id: String(freigaben.size), token, url: `http://localhost:${PORT}/s/${token}`, path: j.path, password: j.password ? '***' : null } } }), 'application/json');
    }
    // Systemtags
    if (u.pathname === '/remote.php/dav/systemtags/' || u.pathname === '/remote.php/dav/systemtags') {
      if (req.method === 'PROPFIND') return ende(res, 207, multi([...tags].map(([id, name]) => `<d:response><d:href>/remote.php/dav/systemtags/${id}</d:href><d:propstat><d:prop><oc:id>${id}</oc:id><oc:display-name>${esc(name)}</oc:display-name><oc:user-visible>true</oc:user-visible><oc:user-assignable>true</oc:user-assignable></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')), 'application/xml');
      if (req.method === 'POST') {
        const j = JSON.parse(body.toString());
        if ([...tags.values()].includes(j.name)) return ende(res, 409);
        const id = String(tags.size + 1); tags.set(id, j.name);
        res.setHeader('Content-Location', '/remote.php/dav/systemtags/' + id); return ende(res, 201);
      }
    }
    m = u.pathname.match(/^\/remote\.php\/dav\/systemtags-relations\/files\/(\d+)\/(\d+)$/);
    if (m) {
      if (!tags.has(m[2])) return ende(res, 404);
      const s = relationen.get(m[1]) || new Set();
      if (req.method === 'PUT') { if (s.has(m[2])) return ende(res, 409); s.add(m[2]); relationen.set(m[1], s); return ende(res, 201); }
      if (req.method === 'DELETE') { if (!s.delete(m[2])) return ende(res, 404); return ende(res, 204); }
    }
    // Suche
    if (req.method === 'SEARCH' && u.pathname.replace(/\/$/, '') === '/remote.php/dav') {
      const b = body.toString();
      const scope = decodeURIComponent((b.match(/<d:href>\/files\/[^/<]+(\/[^<]*)?<\/d:href>/) || [])[1] || '/');
      const seit = (b.match(/<d:gt>[\s\S]*?<d:literal>(\d+)<\/d:literal>/) || [])[1];
      const anzahl = +((b.match(/<d:nresults>(\d+)/) || [])[1] || 1000);
      const start = +((b.match(/firstresult>(\d+)/) || [])[1] || 0);
      if (!dateien.has(scope)) return ende(res, 404);
      const treffer = [...dateien].filter(([p, e]) => !e.ordner && (scope === '/' || p.startsWith(scope + '/')) && /^(image|video)\//.test(e.mime) && (!seit || e.mtime / 1000 > +seit))
        .sort((a, b2) => b2[1].mtime - a[1].mtime).slice(start, start + anzahl);
      return ende(res, 207, multi(treffer.map(([p, e]) => eintragXml(p, e)).join('')), 'application/xml');
    }
    // Dateien
    const p = davPfad(u.pathname);
    if (p == null) return ende(res, 404);
    const e = dateien.get(p);
    switch (req.method) {
      case 'PROPFIND': {
        if (!e) return ende(res, 404);
        const liste = [p, ...(req.headers.depth === '1' && e.ordner ? kinder(p) : [])];
        return ende(res, 207, multi(liste.map((q) => eintragXml(q, dateien.get(q))).join('')), 'application/xml');
      }
      case 'REPORT': {
        const tagId = (body.toString().match(/<oc:systemtag>(\d+)<\/oc:systemtag>/) || [])[1];
        const ids = new Set([...relationen].filter(([, s]) => s.has(tagId)).map(([id]) => id));
        return ende(res, 207, multi([...dateien].filter(([, x]) => ids.has(x.id)).map(([q, x]) => eintragXml(q, x)).join('')), 'application/xml');
      }
      case 'GET':
        if (!e || e.ordner) return ende(res, 404);
        res.writeHead(200, { 'Content-Type': e.mime, 'Content-Length': e.daten.length, ETag: e.etag }); return res.end(e.daten);
      case 'PUT': {
        const elter = p.split('/').slice(0, -1).join('/') || '/';
        if (!dateien.has(elter)) return ende(res, 409);
        if (req.headers['if-none-match'] === '*' && e) return ende(res, 412);
        if (req.headers['if-match'] && (!e || req.headers['if-match'] !== e.etag)) return ende(res, 412);
        const mt = req.headers['x-oc-mtime'] ? +req.headers['x-oc-mtime'] * 1000 : Date.now();
        const neu = anlegen(p, body, mt, { mime: (req.headers['content-type'] || '').split(';')[0] || undefined });
        res.setHeader('ETag', neu.etag); return ende(res, e ? 204 : 201);
      }
      case 'MKCOL': {
        if (e) return ende(res, 405);
        const elter = p.split('/').slice(0, -1).join('/') || '/';
        if (!dateien.has(elter)) return ende(res, 409);
        anlegen(p, null); return ende(res, 201);
      }
      case 'MOVE': {
        if (!e) return ende(res, 404);
        const ziel = davPfad(new URL(req.headers.destination).pathname);
        if (dateien.has(ziel) && req.headers.overwrite === 'F') return ende(res, 412);
        for (const [q, x] of [...dateien]) if (q === p || q.startsWith(p + '/')) { dateien.delete(q); dateien.set(ziel + q.slice(p.length), x); }
        return ende(res, 201);
      }
      case 'DELETE': {
        if (!e) return ende(res, 404);
        for (const q of [...dateien.keys()]) if (q === p || q.startsWith(p + '/')) dateien.delete(q);
        return ende(res, 204);
      }
      default: return ende(res, 405);
    }
  });
});
server.listen(PORT, () => console.log(`Nextcloud-Attrappe auf http://localhost:${PORT} (Benutzer ${USER})`));
