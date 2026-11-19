/* Kamera Tamu · service worker (19 Nov 2026)
 *
 * Kenapa ada: sinyal di gedung resepsi (lantai 8) jelek dan tidak ada Wi-Fi. File ini membuat:
 *  1. Halaman kamera tetap bisa DIBUKA tanpa sinyal, asal HP itu pernah membukanya sekali saat ada sinyal
 *     (link di undangan WA). Halaman: coba internet dulu maks. 4 detik, lalu salinan tersimpan.
 *     Gambar & LUT filter & huruf: salinan tersimpan dulu.
 *  2. Foto yang belum terkirim dikirim di belakang layar saat sinyal kembali walau halamannya sudah ditutup
 *     (Background Sync: Chrome/Android. iPhone tidak mendukung → foto terkirim saat linknya dibuka lagi).
 *
 * Yang TIDAK disentuh: permintaan ke server kamera (script.google.com) dan foto album (googleusercontent):
 * selalu langsung ke internet, tidak pernah disimpan di sini.
 *
 * DARURAT (halaman rusak di HP tamu karena file ini): ubah MATI = true lalu push. Begitu HP tamu dapat sinyal,
 * file ini menghapus dirinya sendiri + semua salinan, dan halaman dimuat ulang dari internet seperti biasa.
 * Ubah gambar di aset/ atau lut/? Naikkan VERSI (salinan lama tidak diperbarui sendiri).
 */
const VERSI = 'kt-2026-11-19a';
const MATI = false;
const API = 'https://script.google.com/macros/s/AKfycbz8z5HBpc8z-E1PzBBujwInBFF6iZ6FPbsHrvVoWa65LIX_yu15v4Tu_eW8foVn1haWqg/exec';
const SIMPAN = 'kt-inti-' + VERSI;      // halaman & aset situs ini
const HURUF = 'kt-huruf-1';             // Google Fonts (jarang berubah, tidak ikut VERSI)
const ASET = ['aset/kecil_afiq.jpg', 'aset/kecil_puteri.jpg', 'aset/afiq_sticker.png', 'aset/puteri_sticker.png',
  'lut/natural-glow-up_33.png', 'lut/potrait-tone_33.png'];
const HALAMAN = ['index.html', 'test.html', 'sinyal.html'];

const dasar = () => self.registration.scope;                     // https://puteriinafiqtion.github.io/
const kunciHalaman = url => {                                     // '/', '/index.html', '/?k=..' → .../index.html
  const u = new URL(url);
  let nama = u.pathname.slice(new URL(dasar()).pathname.length);
  if (nama === '') nama = 'index.html';
  return HALAMAN.indexOf(nama) >= 0 ? dasar() + nama : null;
};

self.addEventListener('install', e => {
  self.skipWaiting();
  if (MATI) return;
  // Satu file gagal (mis. sinyal putus di tengah) tidak menggagalkan semuanya: yang berhasil tetap tersimpan.
  e.waitUntil(caches.open(SIMPAN).then(c => Promise.all(['index.html'].concat(ASET).map(p =>
    fetch(new Request(dasar() + p, { cache: 'reload' })).then(r => { if (r.ok) return c.put(dasar() + p, r); }).catch(() => {})))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const nama = await caches.keys();
    if (MATI) {
      await Promise.all(nama.filter(n => n.indexOf('kt-') === 0).map(n => caches.delete(n)));
      await self.registration.unregister();
      (await self.clients.matchAll({ type: 'window' })).forEach(w => { try { w.navigate(w.url); } catch (err) {} });
      return;
    }
    await Promise.all(nama.filter(n => n.indexOf('kt-inti-') === 0 && n !== SIMPAN).map(n => caches.delete(n)));
    await self.clients.claim();
    // Halaman yang sedang terbuka saat file ini pertama kali terpasang (mis. test.html, sinyal.html) ikut disimpan,
    // karena permintaan halamannya terjadi sebelum file ini aktif.
    const c = await caches.open(SIMPAN);
    const w = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(w.map(async x => {
      const k = kunciHalaman(x.url);
      if (!k || await c.match(k)) return;
      try { const r = await fetch(k, { cache: 'reload' }); if (r.ok) await c.put(k, r); } catch (err) {}
    }));
  })());
});

self.addEventListener('fetch', e => {
  if (MATI) return;
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (req.mode === 'navigate' && u.origin === self.location.origin) {
    const k = kunciHalaman(req.url);
    if (k) e.respondWith(halaman(req, k));
    return;
  }
  if (u.origin === self.location.origin) {
    // Aset tanpa query (?x=… dipakai halaman tes sinyal untuk mengukur unduhan: harus ke internet)
    if (!u.search && /\/(aset|lut)\//.test(u.pathname)) e.respondWith(simpananDulu(req, SIMPAN));
    return;
  }
  if (u.hostname === 'fonts.gstatic.com') return e.respondWith(simpananDulu(req, HURUF));
  if (u.hostname === 'fonts.googleapis.com') return e.respondWith(simpananLaluSegarkan(req, HURUF));
  // selain itu (server kamera, foto album, library QR): tidak disentuh
});

/** Halaman: internet dulu (maks. 4 dtk, supaya perbaikan halaman sampai ke tamu), lalu salinan tersimpan. */
async function halaman(req, kunci) {
  const c = await caches.open(SIMPAN);
  const jaringan = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(r => {
    if (r.ok && r.type === 'basic') c.put(kunci, r.clone());
    return r;
  });
  const simpanan = await c.match(kunci);
  if (!simpanan) return jaringan.catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:sans-serif;padding:24px;line-height:1.5"><h2>Belum ada sinyal</h2>' +
    '<p>Halaman kamera belum tersimpan di HP ini. Cari tempat dengan sinyal (dekat jendela / lobi), lalu buka lagi linknya.</p>' +
    '<button onclick="location.reload()" style="font-size:18px;padding:12px 20px">Coba lagi</button></body>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  return Promise.race([
    jaringan.then(r => (r.ok ? r : simpanan)).catch(() => simpanan),
    new Promise(res => setTimeout(() => res(simpanan), 4000)),
  ]);
}

async function simpananDulu(req, nama) {
  const c = await caches.open(nama);
  const ada = await c.match(req);
  if (ada) return ada;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
}
async function simpananLaluSegarkan(req, nama) {
  const c = await caches.open(nama);
  const ada = await c.match(req);
  const baru = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; });
  if (ada) { baru.catch(() => {}); return ada; }
  return baru;
}

/* ---------- Kirim di belakang layar ----------
 * Antrean = IndexedDB 'kamera_tamu' / 'antrian' yang juga dipakai halaman. Satu catatan per foto:
 *   { uid, dataUrl, source, gid, name, k, diambil, tolak?, simpan? }
 * Hasil di sini ditulis balik ke catatan yang sama supaya halaman tahu begitu dibuka lagi:
 *   terkirim → { uid, terkirim: true, id, used, max, t, source }  (foto dibuang dari HP: sudah di album)
 *   ditolak (jatah habis / kamera tutup / bukan foto) → catatan + tolak & simpan (tetap bisa disimpan ke HP)
 */
self.addEventListener('sync', e => { if (e.tag === 'kirim-foto') e.waitUntil(kirimAntrean(false)); });
self.addEventListener('message', e => {
  if (e.data && e.data.t === 'kirim') e.waitUntil(kirimAntrean(!!e.data.paksa).then(n => e.source && e.source.postMessage({ t: 'kirim-selesai', n }), () => {}));
});

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('kamera_tamu', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('antrian', { keyPath: 'uid' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function ubah(fn) {
  const d = await db();
  return new Promise((res, rej) => { const tx = d.transaction('antrian', 'readwrite'); const st = tx.objectStore('antrian'); const out = fn(st); tx.oncomplete = () => res(out && out.result); tx.onerror = () => rej(tx.error); });
}
async function bacaSemua() {
  const d = await db();
  return new Promise((res, rej) => { const q = d.transaction('antrian').objectStore('antrian').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); });
}

/** Kirim satu per satu (sinyal lemah: kiriman paralel saling memperlambat). Error dilempar → browser mengulang nanti. */
async function kirimAntrean(paksa) {
  // Halaman yang sedang terbuka & terlihat sudah mengirim sendiri: jangan kirim dobel.
  if (!paksa) {
    const w = await self.clients.matchAll({ type: 'window' });
    if (w.some(x => x.visibilityState === 'visible')) return 0;
  }
  let n = 0;
  const daftar = (await bacaSemua()).filter(r => r && r.dataUrl && r.gid && !r.tolak && !r.terkirim);
  for (const r of daftar) {
    let j = null;
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), Math.min(300000, 60000 + r.dataUrl.length / 3));
      const body = { action: 'upload', guestId: r.gid, name: r.name || '', source: r.source || 'kamera', dataUrl: r.dataUrl, uploadId: r.uid, diambil: r.diambil || 0 };
      if (r.k) body.k = r.k;
      try {
        const resp = await fetch(API, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl.signal });
        j = await resp.json();
      } finally { clearTimeout(t); }
    } catch (err) { throw new Error('jaringan'); }
    if (j && j.ok) {
      await ubah(st => st.put({ uid: r.uid, terkirim: true, id: j.id, used: j.used || 0, max: j.max || 0, t: Date.now(), source: r.source || 'kamera' }));
      n++;
    } else if (j && (j.reason === 'habis' || j.reason === 'tutup' || j.reason === 'invalid')) {
      await ubah(st => st.put(Object.assign({}, r, { tolak: true, simpan: true, alasan: j.reason })));
    } else {
      throw new Error('server ' + ((j && j.reason) || 'sibuk'));   // ramai / penuh / kunci / sibuk → coba lagi nanti
    }
  }
  return n;
}
