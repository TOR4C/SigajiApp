// Cloudflare Worker (static assets + API). Stateless: refresh token disimpan terenkripsi
// (AES-GCM) di cookie HttpOnly; data user ada di Google Drive (appDataFolder) miliknya sendiri.
const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
const FILE = 'sigaji-db.json';
const DRIVE = 'https://www.googleapis.com';
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const json = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...h } });

async function key(env) {
  return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(env.SESSION_SECRET)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(JSON.stringify(obj))));
  return b64(new Uint8Array([...iv, ...ct]));
}
export async function unseal(env, tok) {
  try {
    const u = unb64(tok);
    return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, await key(env), u.slice(12))));
  } catch { return null; }
}
const getCookie = (req, n) => (req.headers.get('cookie') || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === n)?.[1];
const cookie = (n, v, age) => `${n}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

async function accessToken(env, rt) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: rt, grant_type: 'refresh_token' }) });
  return r.ok ? (await r.json()).access_token : null;
}
async function findFile(at) {
  const r = await fetch(`${DRIVE}/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${FILE}'`)}&fields=files(id,version)`, { headers: { authorization: `Bearer ${at}` } });
  if (!r.ok) throw new Error('drive list ' + r.status);
  return (await r.json()).files[0] || null;
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, '');
  const redirect = `${url.origin}/api/auth/callback`;

  if (route === 'auth/login') {
    const state = b64(crypto.getRandomValues(new Uint8Array(16)));
    const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state });
    return new Response(null, { status: 302, headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, 'set-cookie': cookie('sg_o', state, 600) } });
  }
  if (route === 'auth/callback') {
    if (!url.searchParams.get('code') || url.searchParams.get('state') !== getCookie(request, 'sg_o')) return new Response('State tidak valid', { status: 400 });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirect, grant_type: 'authorization_code' }) });
    const t = await r.json();
    if (!t.refresh_token) return new Response('Login gagal atau izin Drive tidak diberikan', { status: 400 });
    const p = JSON.parse(dec.decode(unb64(t.id_token.split('.')[1]))); // diterima langsung dari Google via TLS
    const h = new Headers({ location: '/#/backup' });
    h.append('set-cookie', cookie('sg_s', await seal(env, { rt: t.refresh_token, email: p.email, name: p.name || p.email }), 60 * 60 * 24 * 180));
    h.append('set-cookie', cookie('sg_o', '', 0));
    return new Response(null, { status: 302, headers: h });
  }
  if (route === 'auth/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookie('sg_s', '', 0) });

  // ---- endpoint terproteksi ----
  const tok = getCookie(request, 'sg_s');
  const sess = tok && (await unseal(env, tok));
  if (!sess) return json({ error: 'unauthorized' }, 401);
  if (route === 'me') return json({ email: sess.email, name: sess.name });
  if (route !== 'db') return json({ error: 'not found' }, 404);
  if (request.method !== 'GET' && request.headers.get('x-requested-with') !== 'sigaji') return json({ error: 'forbidden' }, 403); // anti-CSRF

  const at = await accessToken(env, sess.rt);
  if (!at) return json({ error: 'unauthorized' }, 401, { 'set-cookie': cookie('sg_s', '', 0) });
  const auth = { authorization: `Bearer ${at}` };
  try {
    const f = await findFile(at);
    if (request.method === 'GET') {
      if (!f) return json({ rev: null, data: null });
      const r = await fetch(`${DRIVE}/drive/v3/files/${f.id}?alt=media`, { headers: auth });
      return json({ rev: f.version, data: await r.json() });
    }
    if (request.method === 'PUT') {
      const body = await request.text();
      if (body.length > 5_000_000) return json({ error: 'too large' }, 413);
      const { rev, data } = JSON.parse(body);
      if (f && String(f.version) !== String(rev)) return json({ error: 'conflict', rev: f.version }, 409);
      let r;
      if (f) r = await fetch(`${DRIVE}/upload/drive/v3/files/${f.id}?uploadType=media&fields=version`, { method: 'PATCH', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(data) });
      else {
        const bd = 'sgb';
        const mp = `--${bd}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: FILE, parents: ['appDataFolder'] })}\r\n--${bd}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${bd}--`;
        r = await fetch(`${DRIVE}/upload/drive/v3/files?uploadType=multipart&fields=version`, { method: 'POST', headers: { ...auth, 'content-type': `multipart/related; boundary=${bd}` }, body: mp });
      }
      if (!r.ok) return json({ error: 'drive write ' + r.status }, 502);
      return json({ rev: (await r.json()).version });
    }
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
  return json({ error: 'method not allowed' }, 405);
}

export default { fetch: (request, env) => onRequest({ request, env }) };
