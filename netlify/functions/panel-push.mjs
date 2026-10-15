// Activa o quita las notificaciones en el teléfono o computadora donde tienes el panel.
import { deps, json, manejar, Fallo } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { llavesPush, huellaSub, avisarme } from "../lib/avisos.mjs";

export default manejar(async (req) => {
  await requireAdmin(req);
  const st = deps.store("panel");
  if (req.method === "GET") return json({ clave: (await llavesPush()).publicKey });
  const b = await req.json().catch(() => ({}));
  const sub = b && b.sub;
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Fallo(400, "No se pudo activar en este equipo.");
  const k = "push/" + huellaSub(sub.endpoint);
  if (req.method === "DELETE") { await st.delete(k); return json({ ok: true }); }
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  await st.setJSON(k, { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } });
  if (b.probar) await avisarme({ titulo: "🔔 Notificaciones activadas", cuerpo: "Así te van a llegar los avisos de nuevas citas, cambios, cancelaciones, compras y solicitudes.", url: "/admin/" });
  return json({ ok: true });
});
export const config = { path: "/api/panel/push" };
