// Panel: ver y organizar las solicitudes.
import { deps, json, manejar, texto, Fallo, fechaBonita } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";

const ESTADOS = ["nueva", "proceso", "confirmada", "terminada"];
export default manejar(async (req) => {
  await requireAdmin(req);
  const st = deps.store("reservas");
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const k = texto(b.clave, 120);
    if (!/^sol\//.test(k)) throw new Fallo(400, "Solicitud no válida.");
    if (b.accion === "eliminar") { await st.delete(k); return json({ ok: true }); }
    const s = await st.get(k, { type: "json" });
    if (!s) throw new Fallo(404, "Esa solicitud ya no existe.");
    if (b.estado !== undefined && ESTADOS.includes(b.estado)) s.estado = b.estado;
    if (b.nota !== undefined) s.nota = texto(b.nota, 1500);
    await st.setJSON(k, s);
    return json({ ok: true });
  }
  const out = [];
  for (const { key } of (await st.list({ prefix: "sol/" })).blobs) {
    const s = await st.get(key, { type: "json" });
    if (s) out.push({ ...s, clave: key, fechaBonita: s.fecha ? fechaBonita(s.fecha) : "" });
  }
  out.sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999") || a.creada.localeCompare(b.creada));
  return json({ solicitudes: out });
});
export const config = { path: "/api/panel/solicitudes" };
