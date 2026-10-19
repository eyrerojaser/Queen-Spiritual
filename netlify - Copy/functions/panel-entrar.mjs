import { json, manejar, Fallo } from "../lib/comun.mjs";
import { verificarClave, token, cookie, requireAdmin, intentos, DIAS_SESION } from "../lib/panel.mjs";

export default manejar(async (req, ctx) => {
  if (req.method === "GET") {
    try { await requireAdmin(req); return json({ sesion: true }); }
    catch (e) { if (e.status === 503) throw e; return json({ sesion: false }); }
  }
  if (req.method === "DELETE") {
    const r = json({ ok: true }); r.headers.append("set-cookie", cookie("", 0)); return r;
  }
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const ip = (ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip") || "";
  await intentos(ip, "revisar");
  const { clave } = await req.json().catch(() => ({}));
  const { ok, llave } = await verificarClave(String(clave || ""));
  if (!ok) { await intentos(ip, "fallo"); throw new Fallo(401, "Contraseña incorrecta."); }
  await intentos(ip, "limpiar");
  const r = json({ ok: true });
  r.headers.append("set-cookie", cookie(token(llave), DIAS_SESION * 86400));
  return r;
});
export const config = { path: "/api/panel/entrar" };
