import { deps, manejar, texto, Fallo } from "../lib/comun.mjs";

const DIAS_VALIDO = 30;
export default manejar(async (req) => {
  const id = texto(new URL(req.url).searchParams.get("s"), 200);
  if (!/^cs_/.test(id)) throw new Fallo(400, "Enlace no válido.");
  const s = await deps.stripe().checkout.sessions.retrieve(id);
  const m = s.metadata || {};
  if (s.payment_status !== "paid" || m.tipo !== "pdf") throw new Fallo(403, "Este enlace de descarga no es válido.");
  if (deps.ahora().getTime() / 1000 - s.created > DIAS_VALIDO * 86400) throw new Fallo(410, "Este enlace ya venció. Escríbeme y te lo envío de nuevo.");
  const archivo = deps.leerArchivo(m.archivo);
  if (!archivo) throw new Fallo(404, "No encontré el archivo. Escríbeme y te lo envío.");
  const nombre = (m.titulo || "guia").normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "guia";
  return new Response(archivo, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${nombre}.pdf"`, "cache-control": "private, no-store" } });
});
export const config = { path: "/api/descargar" };
