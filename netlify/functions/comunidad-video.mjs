// Videos grabados o subidos desde el panel: solo los ven los miembros de la Comunidad.
// Se sirven por pedazos (Range) para que se puedan adelantar y no pasen el límite de tamaño de respuesta.
import { deps, manejar, texto, origen, Fallo, ahoraLocal } from "../lib/comun.mjs";
import { requireMiembro, leerDoc, salio, abierta } from "../lib/comunidad.mjs";

export default manejar(async (req) => {
  const m = await requireMiembro(req);
  if (!m.previa && !abierta(await deps.contenido(origen(req), "comunidad"))) throw new Fallo(423, "La comunidad todavía no abre.");
  const id = texto(new URL(req.url).searchParams.get("p"), 40);
  const p = (await leerDoc("publicaciones", { lista: [] })).lista.find((x) => x.id === id);
  const g = p && p.visible !== false && salio(p, ahoraLocal()) && p.grabacion;
  if (!g) throw new Fallo(404, "No encontré ese video.");
  const st = deps.store("archivos"), meta = await st.get(`${g.ref}/meta`, { type: "json" });
  if (!meta) throw new Fallo(404, "No encontré ese video.");
  const total = meta.tamano, P = meta.parte;
  const r = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  let ini = r && r[1] !== "" ? Number(r[1]) : r && r[2] !== "" ? Math.max(0, total - Number(r[2])) : 0;
  if (ini >= total) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
  const i = Math.floor(ini / P), finParte = Math.min(total, (i + 1) * P) - 1;
  const fin = Math.min(finParte, r && r[1] !== "" && r[2] !== "" ? Number(r[2]) : finParte);
  const b = await st.get(`${g.ref}/${i}`, { type: "arrayBuffer" });
  if (!b) throw new Fallo(404, "Falta una parte del video.");
  const trozo = new Uint8Array(b).subarray(ini - i * P, fin - i * P + 1);
  return new Response(trozo, { status: 206, headers: {
    "content-type": meta.tipo, "content-length": String(trozo.length), "content-range": `bytes ${ini}-${fin}/${total}`,
    "accept-ranges": "bytes", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff",
  } });
});
export const config = { path: "/api/comunidad/video" };
