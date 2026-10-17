// Área de miembros: publicaciones, comentarios, preguntas y encuentros por Zoom.
// GET ?publico=1 → lo que ve cualquiera en la página de bienvenida (próximo encuentro sin enlace).
import crypto from "node:crypto";
import { deps, json, manejar, origen, texto, Fallo, ahoraLocal, fechaBonita, horaBonita } from "../lib/comun.mjs";
import { avisarme } from "../lib/avisos.mjs";
import { st, requireMiembro, leerMiembro, publico, leerDoc, estadoEncuentro, etiquetaEncuentro, limite } from "../lib/comunidad.mjs";

const nombreCorto = (m) => `${m.nombre} ${(m.apellido || "").slice(0, 1)}.`.trim();
const clave = () => `${deps.ahora().toISOString().replace(/[:.]/g, "-")}_${crypto.randomBytes(4).toString("hex")}`;

async function encuentros(conEnlace) {
  const doc = await leerDoc("encuentros", { recordar: true, lista: [] }), ahora = ahoraLocal();
  const lista = doc.lista.filter((e) => e.fecha).map((e) => ({ ...e, estado: estadoEncuentro(e, ahora), etiqueta: etiquetaEncuentro(e), fechaBonita: fechaBonita(e.fecha), horaBonita: horaBonita(e.hora) }))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const prox = lista.filter((e) => e.estado !== "pasado"), pasados = lista.filter((e) => e.estado === "pasado").reverse().slice(0, 12);
  const limpiar = (e) => conEnlace ? e : { fecha: e.fecha, hora: e.hora, etiqueta: e.etiqueta, tema: e.tema, estado: e.estado };
  return { proximos: prox.map(limpiar), pasados: conEnlace ? pasados.map((e) => ({ ...e, zoom: "", clave: "" })) : [] };
}

export default manejar(async (req, ctx) => {
  const s = st();
  if (req.method === "GET" && new URL(req.url).searchParams.get("publico")) {
    const e = await encuentros(false), m = await leerMiembro(req);
    return json({ miembro: m ? publico(m) : null, proximo: e.proximos[0] || null });
  }
  const m = await requireMiembro(req);

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ip = (ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip");
    if (b.accion === "comentar") {
      const pubs = await leerDoc("publicaciones", { lista: [] });
      const p = pubs.lista.find((x) => x.id === b.post && x.visible !== false);
      if (!p) throw new Fallo(404, "Esa publicación ya no existe.");
      const t = texto(b.texto, 1500);
      if (t.length < 2) throw new Fallo(400, "Escribe tu comentario.");
      await limite(ip, "com", 30);
      const c = { post: p.id, texto: t, autor: nombreCorto(m), miembro: m.clave, creado: deps.ahora().toISOString(), oculto: false, nuevo: true };
      await s.setJSON(`c/${p.id}/${clave()}`, c);
      await avisarme({ titulo: `💬 Comentario de ${c.autor}`, cuerpo: `En “${p.titulo || "tu publicación"}”: ${t.slice(0, 200)}`, url: "/admin/#/interaccion", origen: origen(req) });
      return json({ ok: true, comentario: { autor: c.autor, texto: c.texto, creado: c.creado, mio: true } });
    }
    if (b.accion === "preguntar") {
      const t = texto(b.texto, 2000);
      if (t.length < 5) throw new Fallo(400, "Escribe tu pregunta.");
      await limite(ip, "preg", 10);
      const q = { texto: t, autor: nombreCorto(m), miembro: m.clave, creada: deps.ahora().toISOString(), respuesta: "", respondida: "", publica: true, nueva: true };
      await s.setJSON(`q/${clave()}`, q);
      await avisarme({ titulo: `❓ Pregunta de ${q.autor}`, cuerpo: t.slice(0, 300), url: "/admin/#/interaccion", origen: origen(req) });
      return json({ ok: true });
    }
    if (b.accion === "avisos") {
      await s.setJSON(m.clave, { ...(await s.get(m.clave, { type: "json" })), avisos: b.avisos !== false });
      return json({ ok: true, avisos: b.avisos !== false });
    }
    throw new Fallo(400, "Acción no válida.");
  }

  // GET: todo lo del área de miembros
  const cfg = await deps.contenido(origen(req), "comunidad");
  const pubs = (await leerDoc("publicaciones", { lista: [] })).lista.filter((p) => p.visible !== false);
  const coms = new Map();
  for (const { key } of (await s.list({ prefix: "c/" })).blobs) {
    const c = await s.get(key, { type: "json" });
    if (!c || c.oculto) continue;
    if (!coms.has(c.post)) coms.set(c.post, []);
    coms.get(c.post).push({ autor: c.autor, texto: c.texto, creado: c.creado, queen: !!c.queen, mio: c.miembro === m.clave });
  }
  const posts = pubs.map((p) => ({ ...p, comentarios: (coms.get(p.id) || []).sort((a, b) => a.creado.localeCompare(b.creado)) }))
    .sort((a, b) => (b.fijado - a.fijado) || b.creado.localeCompare(a.creado));
  const preguntas = [];
  for (const { key } of (await s.list({ prefix: "q/" })).blobs) {
    const q = await s.get(key, { type: "json" });
    if (!q) continue;
    const mia = q.miembro === m.clave;
    if (mia || (q.respuesta && q.publica)) preguntas.push({ texto: q.texto, autor: mia ? "Tú" : q.autor, creada: q.creada, respuesta: q.respuesta, respondida: q.respondida, mia });
  }
  preguntas.sort((a, b) => (b.respondida || b.creada).localeCompare(a.respondida || a.creada));
  if (Date.now() - Date.parse(m.ultimo || 0) > 6 * 3600e3) await s.setJSON(m.clave, { ...(await s.get(m.clave, { type: "json" })), ultimo: deps.ahora().toISOString() });
  return json({ miembro: publico(m), mensaje: texto(cfg.mensajeMiembros, 1500), posts, encuentros: await encuentros(true), preguntas });
});
export const config = { path: "/api/comunidad" };
