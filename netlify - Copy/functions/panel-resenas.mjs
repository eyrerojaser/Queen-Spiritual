// Panel: reseñas que mandaron tus clientes, esperando aprobación.
import { deps, json, manejar, origen, texto, Fallo } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { ESQUEMAS } from "../lib/esquemas.mjs";

export default manejar(async (req) => {
  await requireAdmin(req);
  const st = deps.store("reservas");
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const k = texto(b.clave, 120);
    if (!/^res\//.test(k)) throw new Fallo(400, "Reseña no válida.");
    const r = await st.get(k, { type: "json" });
    if (!r) throw new Fallo(404, "Esa reseña ya no existe.");
    if (b.accion === "publicar") {
      const doc = await deps.contenido(origen(req), "resenas");
      const nueva = { nombre: r.nombre, estrellas: r.estrellas, texto: r.texto, tipo: r.tipo, foto: r.foto, fecha: r.creada.slice(0, 10) };
      const limpio = ESQUEMAS.resenas({ ...doc, resenas: [nueva, ...(doc.resenas || [])] });
      await deps.store("contenido").setJSON("c/resenas", limpio);
      await st.delete(k);
      return json({ ok: true, resenas: limpio });
    }
    if (b.accion === "borrar") {
      if (/^\/img\/[0-9a-f-]{36}$/.test(r.foto || "")) await deps.store("archivos").delete("img/" + r.foto.slice(5));
      await st.delete(k);
      return json({ ok: true });
    }
    throw new Fallo(400, "Acción no válida.");
  }
  const out = [];
  for (const { key } of (await st.list({ prefix: "res/" })).blobs) {
    const r = await st.get(key, { type: "json" });
    if (r) out.push({ ...r, clave: key });
  }
  out.sort((a, b) => b.creada.localeCompare(a.creada));
  return json({ pendientes: out });
});
export const config = { path: "/api/panel/resenas" };
