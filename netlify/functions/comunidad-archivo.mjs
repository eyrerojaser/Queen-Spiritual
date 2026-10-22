// Descarga de los PDF de las enseñanzas: solo para miembros con acceso.
import { deps, manejar, texto, origen, Fallo, ahoraLocal } from "../lib/comun.mjs";
import { requireMiembro, leerDoc, salio, abierta } from "../lib/comunidad.mjs";

export default manejar(async (req) => {
  const m = await requireMiembro(req);
  if (!m.previa && !abierta(await deps.contenido(origen(req), "comunidad"))) throw new Fallo(423, "La comunidad todavía no abre.");
  const u = new URL(req.url), id = texto(u.searchParams.get("p"), 40), i = parseInt(u.searchParams.get("i"), 10);
  const p = (await leerDoc("publicaciones", { lista: [] })).lista.find((x) => x.id === id);
  const a = p && p.visible !== false && salio(p, ahoraLocal()) && (p.archivos || [])[i];
  if (!a) throw new Fallo(404, "No encontré ese archivo.");
  const f = await deps.abrirArchivo(a.ref);
  if (!f) throw new Fallo(404, "No encontré ese archivo.");
  const nombre = String(a.nombre || "archivo.pdf").normalize("NFD").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "-") || "archivo.pdf";
  return new Response(f.cuerpo, { headers: { "content-type": "application/pdf", "content-length": String(f.tamano), "content-disposition": `attachment; filename="${/\.pdf$/i.test(nombre) ? nombre : nombre + ".pdf"}"`, "cache-control": "private, no-store" } });
});
export const config = { path: "/api/comunidad/archivo" };
