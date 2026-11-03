// Panel: fichas de clientes (solo tú).
import { json, manejar, texto, Fallo } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { stF, limpiarFicha, leerFicha, guardarFicha, todasLasFichas, guardarNotaEnFicha, resumenFicha } from "../lib/fichas.mjs";
import { st as stS } from "../lib/sala.mjs";

export default manejar(async (req) => {
  await requireAdmin(req);
  if (req.method === "GET") {
    const id = new URL(req.url).searchParams.get("id");
    if (id) {
      const f = await leerFicha(id);
      if (!f) throw new Fallo(404, "No encontré esa ficha.");
      const salas = [];
      for (const { key } of (await stS().list({ prefix: "s/" })).blobs) { const s = await stS().get(key, { type: "json" }); if (s && s.ficha === f.id) salas.push({ id: s.id, fecha: s.fecha, hora: s.hora, servicio: s.servicio, terminada: !!s.terminada, creada: s.creada }); }
      return json({ ficha: f, salas: salas.sort((a, b) => b.creada.localeCompare(a.creada)) });
    }
    const lista = (await todasLasFichas()).map(resumenFicha).sort((a, b) => (b.ultima || b.creada).localeCompare(a.ultima || a.creada));
    return json({ fichas: lista });
  }
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  if (b.accion === "guardar") {
    const antes = b.id ? await leerFicha(b.id) : null;
    if (b.id && !antes) throw new Fallo(404, "No encontré esa ficha.");
    const f = limpiarFicha(b.ficha || {}, antes || {});
    if (!f.nombre) throw new Fallo(400, "Escribe el nombre de la clienta.");
    return json({ ficha: await guardarFicha(f) });
  }
  if (b.accion === "nota") {
    const n = await guardarNotaEnFicha(texto(b.id, 40), b.nota || {});
    if (!n) throw new Fallo(404, "No encontré esa ficha.");
    return json({ nota: n, ficha: await leerFicha(b.id) });
  }
  if (b.accion === "nota-borrar") {
    const f = await leerFicha(texto(b.id, 40));
    if (!f) throw new Fallo(404, "No encontré esa ficha.");
    f.notas = f.notas.filter((n) => n.id !== b.nota);
    return json({ ficha: await guardarFicha(f) });
  }
  if (b.accion === "borrar") { await stF().delete(`f/${texto(b.id, 40)}`); return json({ ok: true }); }
  throw new Fallo(400, "Acción no válida.");
});
export const config = { path: "/api/panel/fichas" };
