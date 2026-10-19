// Entrada al panel con contraseña.
// La contraseña inicial es la variable ADMIN_PASSWORD de Netlify. Desde el panel se puede cambiar;
// si algún día la olvidas, cambia ADMIN_PASSWORD en Netlify y esa vuelve a ser la contraseña.
import crypto from "node:crypto";
import { deps, Fallo } from "./comun.mjs";

const COOKIE = "qs_panel";
export const DIAS_SESION = 30;
const huella = (s) => crypto.createHash("sha256").update("queen|" + s).digest("hex");
const scrypt = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString("hex");
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function credencial() {
  const env = process.env.ADMIN_PASSWORD || "";
  if (!env) throw new Fallo(503, "Falta crear la contraseña del panel en Netlify (variable ADMIN_PASSWORD). Los pasos están en el LEEME.");
  const g = await deps.store("panel").get("clave", { type: "json" });
  const propia = g && g.huellaEnv === huella(env) ? g : null;
  const llave = crypto.createHash("sha256").update("sesion|" + env + "|" + (propia ? propia.hash : "")).digest();
  return { env, propia, llave };
}

export async function verificarClave(pw) {
  const c = await credencial();
  const ok = c.propia ? igual(scrypt(pw, c.propia.salt), c.propia.hash) : igual(huella(pw), huella(c.env));
  return { ok, llave: c.llave };
}

export function token(llave) {
  const p = Buffer.from(JSON.stringify({ exp: Date.now() + DIAS_SESION * 864e5 })).toString("base64url");
  return p + "." + crypto.createHmac("sha256", llave).update(p).digest("base64url");
}
export const cookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

export async function requireAdmin(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) throw new Fallo(401, "Entra con tu contraseña.");
  const [p, f] = m[1].split(".");
  const { llave } = await credencial();
  if (!p || !f || !igual(f, crypto.createHmac("sha256", llave).update(p).digest("base64url"))) throw new Fallo(401, "Tu sesión venció. Entra de nuevo.");
  let d; try { d = JSON.parse(Buffer.from(p, "base64url").toString()); } catch { throw new Fallo(401, "Entra con tu contraseña."); }
  if (!(d.exp > Date.now())) throw new Fallo(401, "Tu sesión venció. Entra de nuevo.");
  // Protección extra: las acciones que cambian algo solo se aceptan desde el panel.
  if (req.method !== "GET" && req.headers.get("x-panel") !== "1") throw new Fallo(403, "Solicitud no permitida.");
}

export async function guardarClave(nueva) {
  const salt = crypto.randomBytes(16).toString("hex");
  await deps.store("panel").setJSON("clave", { salt, hash: scrypt(nueva, salt), huellaEnv: huella(process.env.ADMIN_PASSWORD || "") });
}

// Máximo 8 intentos fallidos cada 15 minutos por conexión.
export async function intentos(ip, accion) {
  const st = deps.store("panel"), k = "intentos/" + huella(ip || "?").slice(0, 32), ahora = Date.now();
  const r = (await st.get(k, { type: "json" })) || { n: 0, desde: ahora };
  const vigente = ahora - r.desde < 15 * 60000;
  if (accion === "revisar") { if (vigente && r.n >= 8) throw new Fallo(429, "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo."); return; }
  if (accion === "fallo") return st.setJSON(k, vigente ? { n: r.n + 1, desde: r.desde } : { n: 1, desde: ahora });
  if (accion === "limpiar") return st.delete(k);
}
