# SiGaji App — PWA + Cloudflare Pages/Workers + Google Drive

```
public/                 SPA + PWA (di-host Cloudflare Pages, statis)
  index.html, js/app.js (UI), js/cloud.js (sync offline-first), sw.js, manifest.json
functions/api/[[path]].js   Worker backend: login Google + proxy ke Drive user
test/                   tes unit (merge, tombstone, enkripsi sesi)
```

Data tiap user disimpan di **Google Drive miliknya** (`appDataFolder`, file `sigaji-db.json`). Server tidak punya database dan tidak menyimpan data user.

## Setup (semua gratis)

1. **Google Cloud Console** → buat project → *APIs & Services*:
   - Enable **Google Drive API**.
   - *OAuth consent screen*: External, isi nama app, scope `drive.appdata`, `email`, `profile`; lalu **Publish app** (status *In production*, kalau tetap *Testing* login kedaluwarsa tiap 7 hari).
   - *Credentials* → **OAuth client ID** tipe *Web application*. Authorized redirect URI:
     `https://NAMA-PROJECT.pages.dev/api/auth/callback` dan `http://localhost:8788/api/auth/callback`
2. **GitHub**: push folder ini ke repo.
3. **Cloudflare** → Workers & Pages → Create → Pages → Connect to Git. Build command: *(kosong)*, output directory: `public`.
4. Pages → Settings → Variables: tambahkan `GOOGLE_CLIENT_ID` (plain), serta `GOOGLE_CLIENT_SECRET` dan `SESSION_SECRET` (secret, string acak ≥32 karakter: `openssl rand -base64 32`). Redeploy.
5. Buka `https://NAMA-PROJECT.pages.dev` → Menu → Backup → **Masuk dengan Google**.

## Lokal
```
npm install && cp .dev.vars.example .dev.vars   # isi nilainya
npm run dev -- --binding GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
npm test
```
(Safari menolak cookie `Secure` di http://localhost; pakai Chrome/Firefox untuk dev.)

## Catatan
- Offline-first: semua perubahan masuk localStorage dulu, lalu disinkron ke Drive (debounce 1,5 dtk, otomatis saat kembali online). Konflik antar-perangkat digabung per-item (terbaru menang).
- Batas gratis Cloudflare Workers: 100.000 request/hari — cukup untuk ratusan user aktif.
- Tailwind/Font Awesome/jsPDF masih dari CDN (di-cache SW setelah pemakaian pertama).
