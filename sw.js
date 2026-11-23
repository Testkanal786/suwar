// Suwar: hält nur die Programmdateien vor, damit die App auch ohne Netz startet.
// Fotos und Zugangsdaten laufen nie hierüber; sie gehen direkt vom Gerät an deine Nextcloud.
const VERSION = 'suwar-4';
const DATEIEN = ['./', 'index.html', 'stil.css', 'js/standort.js', 'js/nc.js', 'js/medien.js', 'js/app.js', 'manifest.webmanifest', 'icons/suwar-64.png', 'icons/suwar-192.png', 'gast.html', 'gast.css', 'js/gast.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(DATEIEN.map((d) => new Request(d, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  const behalten = new Set([VERSION, 'suwar-geteilt', 'suwar-vorschau']);
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((n) => !behalten.has(n)).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});
// Teilen-Menü von Android → Suwar: Dateien zwischenspeichern, die Seite lädt sie in die Nextcloud hoch.
async function geteiltAnnehmen(request) {
  const f = await request.formData();
  const c = await caches.open('suwar-geteilt');
  let i = 0;
  for (const datei of f.getAll('dateien')) {
    if (!datei || typeof datei === 'string' || !datei.name) continue;
    await c.put(new Request('./geteilt/' + Date.now() + '-' + i++), new Response(datei, { headers: { 'X-Name': encodeURIComponent(datei.name), 'X-Zeit': String(datei.lastModified || Date.now()), 'Content-Type': datei.type || 'application/octet-stream' } }));
  }
  return Response.redirect('./#galerie', 303);
}
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.origin === self.location.origin && u.pathname.endsWith('/teilen')) { e.respondWith(geteiltAnnehmen(e.request)); return; }
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return; // Nextcloud-Zugriffe nicht anfassen
  if (u.pathname.includes('/v/')) return; // Vorschaubilder kommen aus dem eigenen Zwischenspeicher der Seite
  // Erst das Netz (am Browser-Zwischenspeicher vorbei, damit Updates sofort ankommen), ohne Netz die gespeicherte Fassung.
  e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then((r) => {
    if (r.ok) { const kopie = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, kopie)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
});
