import { deps, manejar, texto, Fallo } from "../lib/comun.mjs";

const DIAS_VALIDO = 30;
export default manejar(async (req) => {
  const u = new URL(req.url);
  const id = texto(u.searchParams.get("s"), 200), i = parseInt(u.searchParams.get("i"), 10);
  if (!/^cs_/.test(id) || !(i >= 0)) throw new Fallo(400, "Enlace no válido.");
  const s = await deps.stripe().checkout.sessions.retrieve(id);
  if (!s || s.payment_status !== "paid" || (s.metadata || {}).tipo !== "tienda") throw new Fallo(403, "Este enlace de descarga no es válido.");
  if (deps.ahora().getTime() / 1000 - s.created > DIAS_VALIDO * 86400) throw new Fallo(410, "Este enlace ya venció. Escríbeme y te lo envío de nuevo.");
  const o = await deps.store().get(`orden/${id}`, { type: "json" });
  const it = o && o.items && o.items[i];
  if (!it || !it.digital) throw new Fallo(404, "No encontré ese archivo en tu compra.");
  const archivo = deps.leerArchivo(it.archivo);
  if (!archivo) throw new Fallo(404, "No encontré el archivo. Escríbeme y te lo envío.");
  const nombre = (it.titulo || "guia").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "guia";
  return new Response(archivo, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${nombre}.pdf"`, "cache-control": "private, no-store" } });
});
export const config = { path: "/api/descargar" };
