// Panel: tus suscriptoras de lecturas mensuales.
import { deps, json, manejar, fechaBonita, horaBonita } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { activa, periodo } from "../lib/suscripcion.mjs";

export default manejar(async (req) => {
  await requireAdmin(req);
  const st = deps.store("reservas"), lista = [];
  for (const { key } of (await st.list({ prefix: "sus/" })).blobs) {
    const x = await st.get(key, { type: "json" });
    if (!x || !x.pago) continue; // empezó pero nunca pagó
    const u = activa(x) && (x.usos || {})[periodo(x)];
    lista.push({ nombre: x.nombre, email: x.email, whatsapp: x.whatsapp, creada: x.creada, activa: activa(x), estado: x.pago.estado, cancelaAlFinal: !!x.pago.cancelaAlFinal, hasta: x.pago.hasta, precio: x.pago.precio, lecturas: Object.keys(x.usos || {}).length, esteMes: u ? `${fechaBonita(u.fecha)}, ${horaBonita(u.hora)}` : "" });
  }
  lista.sort((a, b) => (b.activa - a.activa) || String(b.creada).localeCompare(String(a.creada)));
  return json({ suscripciones: lista });
});
export const config = { path: "/api/panel/suscripciones" };
