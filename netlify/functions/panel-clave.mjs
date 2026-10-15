import { json, manejar, Fallo } from "../lib/comun.mjs";
import { requireAdmin, verificarClave, guardarClave, token, cookie, DIAS_SESION } from "../lib/panel.mjs";

export default manejar(async (req) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  await requireAdmin(req);
  const { actual, nueva } = await req.json().catch(() => ({}));
  if (!(await verificarClave(String(actual || ""))).ok) throw new Fallo(400, "La contraseña actual no es correcta.");
  if (String(nueva || "").length < 8) throw new Fallo(400, "La contraseña nueva debe tener al menos 8 caracteres.");
  await guardarClave(String(nueva));
  const { llave } = await verificarClave(String(nueva));
  const r = json({ ok: true });
  r.headers.append("set-cookie", cookie(token(llave), DIAS_SESION * 86400)); // sigue dentro en este equipo
  return r;
});
export const config = { path: "/api/panel/clave" };
