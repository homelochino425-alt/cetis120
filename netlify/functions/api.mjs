// Marcador CETis 120 — servidor (Netlify Functions + Netlify Blobs)
// Rutas:
//   GET    /api/config              configuración pública (logos, franjas, música)
//   GET    /api/media/:id/:n        parte n de un archivo
//   POST   /api/login               { password } → { token }
//   GET    /api/check               ¿el token sigue vigente?           (admin)
//   PUT    /api/config              guarda la configuración             (admin)
//   PUT    /api/media/:id/:n        sube la parte n de un archivo       (admin)
//   DELETE /api/media/:id           borra un archivo completo           (admin)
//   POST   /api/password            { current, next } → { token }       (admin)
import { getStore } from "@netlify/blobs";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_PASSWORD = "Jaguares120";          // solo se usa la primera vez; cámbiala desde el admin
const TOKEN_HOURS = 12;
const MAX_PART = 4 * 1024 * 1024;                // el navegador manda partes de 3 MB
const MAX_PARTS = 40;                            // hasta ~120 MB por archivo

const DEFAULT_CONFIG = {
  version: 2,
  logos: [{ id: "dgeti", name: "DGETI en tu comunidad", type: "static", file: "media/logo-dgeti.png", default: true }],
  banners: [{ id: "cetis120", name: "Franja CETis 120 Morelia", type: "static", file: "media/franja-cetis120.png", default: true }],
  music: []
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
const fail = (status, message) => json({ error: message }, status);
const b64u = buf => Buffer.from(buf).toString("base64url");

const store = () => getStore({ name: "marcador", consistency: "strong" });
const media = () => getStore({ name: "marcador-media", consistency: "strong" });

/* ---------- contraseña y tokens ---------- */
function hashPassword(pw, salt){ return pbkdf2Sync(pw, salt, 120000, 32, "sha256").toString("hex"); }
async function getAuth(){
  const s = store();
  let auth = await s.get("auth", { type: "json" });
  if (!auth){
    const salt = randomBytes(16).toString("hex");
    auth = { salt, hash: hashPassword(DEFAULT_PASSWORD, salt), secret: randomBytes(32).toString("hex") };
    await s.setJSON("auth", auth);
  }
  return auth;
}
function sameHex(a, b){
  const x = Buffer.from(String(a), "hex"), y = Buffer.from(String(b), "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
function makeToken(secret){
  const payload = b64u(JSON.stringify({ exp: Date.now() + TOKEN_HOURS * 3600e3, n: randomBytes(6).toString("hex") }));
  const sig = b64u(createHmac("sha256", secret).update(payload).digest());
  return payload + "." + sig;
}
async function isAdmin(req){
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const auth = await getAuth();
  const good = b64u(createHmac("sha256", auth.secret).update(payload).digest());
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}

/* ---------- validación de la configuración ---------- */
const ID = /^[a-z0-9-]{2,40}$/i;
function cleanEntry(e, kind){
  if (!e || typeof e !== "object" || !ID.test(e.id || "")) return null;
  const out = { id: e.id, name: String(e.name || "").slice(0, 80) || e.id };
  if (e.type === "static"){
    if (!/^media\/[a-z0-9._-]+$/i.test(e.file || "")) return null;
    out.type = "static"; out.file = e.file;
  } else {
    const parts = Number(e.parts);
    if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) return null;
    out.type = "blob"; out.parts = parts;
    out.mime = String(e.mime || "").slice(0, 60);
    out.size = Number(e.size) || 0;
  }
  if (kind === "music") out.credit = String(e.credit || "").slice(0, 160);
  else out.default = !!e.default;
  return out;
}
function cleanConfig(c){
  if (!c || typeof c !== "object") return null;
  const out = { version: 2, updated: new Date().toISOString() };
  for (const kind of ["logos", "banners", "music"]){
    if (!Array.isArray(c[kind]) || c[kind].length > 60) return null;
    out[kind] = c[kind].map(e => cleanEntry(e, kind)).filter(Boolean);
    if (kind !== "music" && out[kind].length && !out[kind].some(e => e.default)) out[kind][0].default = true;
  }
  return out;
}

/* ---------- rutas ---------- */
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  const seg = path.split("/");
  const method = req.method.toUpperCase();

  try {
    // configuración pública
    if (path === "config" && method === "GET"){
      const cfg = await store().get("config", { type: "json" });
      return json(cfg || DEFAULT_CONFIG);
    }

    // archivos (públicos para leer)
    if (seg[0] === "media" && seg.length === 3 && method === "GET"){
      const [, id, n] = seg;
      if (!ID.test(id) || !/^\d{1,2}$/.test(n)) return fail(400, "Ruta inválida");
      const res = await media().getWithMetadata(`${id}/${n}`, { type: "arrayBuffer" });
      if (!res) return fail(404, "No existe");
      return new Response(res.data, { headers: {
        "content-type": (res.metadata && res.metadata.type) || "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable"
      }});
    }

    if (path === "login" && method === "POST"){
      const { password } = await req.json().catch(() => ({}));
      const auth = await getAuth();
      if (typeof password !== "string" || !sameHex(hashPassword(password, auth.salt), auth.hash)){
        await new Promise(r => setTimeout(r, 700));              // frena a quien intente adivinar
        return fail(401, "Contraseña incorrecta");
      }
      return json({ token: makeToken(auth.secret) });
    }

    // de aquí en adelante, solo admin
    if (!(await isAdmin(req))) return fail(401, "Tu sesión terminó. Vuelve a entrar.");

    if (path === "check" && method === "GET") return json({ ok: true });

    if (path === "config" && method === "PUT"){
      const cfg = cleanConfig(await req.json().catch(() => null));
      if (!cfg) return fail(400, "Configuración inválida");
      await store().setJSON("config", cfg);
      return json(cfg);
    }

    if (seg[0] === "media" && seg.length === 3 && method === "PUT"){
      const [, id, n] = seg;
      if (!ID.test(id) || !/^\d{1,2}$/.test(n) || Number(n) >= MAX_PARTS) return fail(400, "Ruta inválida");
      const body = await req.arrayBuffer();
      if (!body.byteLength || body.byteLength > MAX_PART) return fail(413, "Parte demasiado grande");
      const type = (req.headers.get("x-file-type") || "application/octet-stream").slice(0, 60);
      if (!/^(image\/(png|jpeg|webp)|audio\/[a-z0-9.+-]+|application\/octet-stream)$/i.test(type)) return fail(415, "Tipo de archivo no permitido");
      await media().set(`${id}/${n}`, body, { metadata: { type } });
      return json({ ok: true });
    }

    if (seg[0] === "media" && seg.length === 2 && method === "DELETE"){
      const id = seg[1];
      if (!ID.test(id)) return fail(400, "Ruta inválida");
      const m = media();
      const { blobs } = await m.list({ prefix: id + "/" });
      await Promise.all(blobs.map(b => m.delete(b.key)));
      return json({ ok: true, deleted: blobs.length });
    }

    if (path === "password" && method === "POST"){
      const { current, next } = await req.json().catch(() => ({}));
      const auth = await getAuth();
      if (typeof current !== "string" || !sameHex(hashPassword(current, auth.salt), auth.hash)) return fail(403, "La contraseña actual no es correcta");
      if (typeof next !== "string" || next.length < 8) return fail(400, "La nueva contraseña necesita al menos 8 caracteres");
      const salt = randomBytes(16).toString("hex");
      const fresh = { salt, hash: hashPassword(next, salt), secret: randomBytes(32).toString("hex") };   // cierra las demás sesiones
      await store().setJSON("auth", fresh);
      return json({ token: makeToken(fresh.secret) });
    }

    return fail(404, "No existe esa ruta");
  } catch (err){
    console.error(err);
    return fail(500, "Error del servidor");
  }
};

export const config = { path: "/api/*" };
