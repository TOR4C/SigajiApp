// Sinkronisasi offline-first: localStorage <-> Google Drive user (lewat /api/db).
// Merge per-item (last-write-wins pakai _u) + tombstone untuk data terhapus.
(function (root) {
  const COLS = ['positions', 'employees', 'holidays', 'kasbon', 'bonuses', 'attendance'];
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; };
  const sig = (it) => { const { _u, ...r } = it; return hash(JSON.stringify(r)); };

  function merge(a, b) {
    const out = { _tomb: {} };
    for (const c of COLS) {
      const m = new Map();
      const put = (it) => { const o = m.get(it.id); if (!o || (it._u || 0) > (o._u || 0)) m.set(it.id, it); };
      for (const s of [a, b]) {
        (s[c] || []).forEach(put);
        ((s._tomb || {})[c] || []).forEach((t) => put({ id: t.id, _u: t._u, _d: 1 }));
      }
      const all = [...m.values()];
      out[c] = all.filter((x) => !x._d);
      out._tomb[c] = all.filter((x) => x._d).map((x) => ({ id: x.id, _u: x._u }));
    }
    out.profile = ((b.profile || {})._u || 0) > ((a.profile || {})._u || 0) ? b.profile : a.profile;
    return out;
  }
  // beri cap waktu pada item yang berubah & catat tombstone item yang hilang
  function stamp(db, snap, now = Date.now()) {
    db._tomb = db._tomb || {};
    const next = {};
    for (const c of COLS) {
      next[c] = {};
      const ids = new Set(db[c].map((i) => i.id));
      db[c].forEach((it) => { const s = sig(it); if (snap[c] && snap[c][it.id] !== s) it._u = now; else if (!snap[c]) it._u = it._u || now; next[c][it.id] = s; });
      db._tomb[c] = (db._tomb[c] || []).filter((t) => !ids.has(t.id));
      for (const id in snap[c] || {}) if (!ids.has(id) && !db._tomb[c].some((t) => t.id === id)) db._tomb[c].push({ id, _u: now });
    }
    const ps = sig(db.profile || {});
    if (snap.profile !== ps) db.profile._u = now;
    next.profile = ps;
    return next;
  }

  const ls = () => root.localStorage;
  const Cloud = {
    merge, stamp, user: null, timer: null,
    get rev() { return ls().getItem('sg_rev'); }, set rev(v) { v == null ? ls().removeItem('sg_rev') : ls().setItem('sg_rev', v); },
    stampDb(db) { ls().setItem('sg_snap', JSON.stringify(stamp(db, JSON.parse(ls().getItem('sg_snap') || '{}')))); ls().setItem('sg_dirty', '1'); },
    snapshot(db) { const s = {}; for (const c of COLS) { s[c] = {}; db[c].forEach((i) => (s[c][i.id] = sig(i))); } s.profile = sig(db.profile || {}); ls().setItem('sg_snap', JSON.stringify(s)); },
    schedule() { if (!this.user) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.sync(), 1500); },

    async init() {
      try { const r = await fetch('/api/me'); if (r.ok) this.user = await r.json(); } catch {}
      this.ui(); if (this.user) await this.sync();
    },
    async pull() {
      const r = await fetch('/api/db');
      if (r.status === 401) { this.user = null; this.ui(); throw new Error('sesi berakhir'); }
      if (!r.ok) throw new Error('gagal ambil data');
      const { rev, data } = await r.json();
      this.rev = rev;
      if (data) { root.applyDb(merge(root.getDb(), data)); }
      return !!data;
    },
    async push(retry = true) {
      const r = await fetch('/api/db', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-requested-with': 'sigaji' }, body: JSON.stringify({ rev: this.rev, data: root.getDb() }) });
      if (r.status === 409 && retry) { await this.pull(); return this.push(false); }
      if (!r.ok) throw new Error('gagal simpan');
      this.rev = (await r.json()).rev; ls().removeItem('sg_dirty');
    },
    async sync() {
      if (!this.user) return;
      if (!navigator.onLine) return this.ui('Offline — akan disinkron nanti');
      this.ui('Menyinkronkan…'); const d = root.document; if (d) { d.body.classList.add('syncing'); root.skeletonLists && root.skeletonLists(); }
      try {
        const had = await this.pull();
        if (!had || ls().getItem('sg_dirty')) await this.push();
        this.ui('Tersinkron ' + new Date().toLocaleTimeString('id-ID'));
      } catch (e) { this.ui('Gagal: ' + e.message); }
      finally { if (root.document) { root.document.body.classList.remove('syncing'); root.refreshView && root.refreshView(); } }
    },
    async logout() { await fetch('/api/auth/logout', { method: 'POST', headers: { 'x-requested-with': 'sigaji' } }); this.user = null; this.rev = null; this.ui(); },
    ui(msg = '') {
      const el = root.document && root.document.getElementById('cloud-box'); if (!el) return;
      const esc = root.esc || ((s) => s);
      el.innerHTML = this.user
        ? `<div class="flex items-center gap-3 mb-3"><i class="fa-brands fa-google-drive text-2xl text-primary"></i><div class="text-left"><div class="font-bold text-sm">${esc(this.user.name)}</div><div class="text-xs text-gray-400">${esc(this.user.email)}</div></div></div><div class="text-xs text-gray-500 mb-3">${msg.startsWith('Meny') ? '<i class="fa-solid fa-circle-notch spin"></i> ' : ''}${esc(msg)}</div><div class="flex gap-2"><button onclick="Cloud.sync()" class="flex-1 bg-primary text-white py-2 rounded-xl text-sm font-medium">Sinkron</button><button onclick="Cloud.logout()" class="px-4 py-2 rounded-xl text-sm bg-gray-100 text-gray-600">Keluar</button></div>`
        : `<div class="font-bold mb-1">Google Drive</div><p class="text-xs text-gray-500 mb-3">Data tersimpan di Drive Anda, bisa dibuka di banyak perangkat.</p><a href="/api/auth/login" class="block text-center bg-primary text-white py-2 rounded-xl text-sm font-medium">Masuk Google</a>`;
    },
  };
  root.Cloud = Cloud;
  if (root.addEventListener) root.addEventListener('online', () => Cloud.sync());
})(typeof window !== 'undefined' ? window : globalThis);
