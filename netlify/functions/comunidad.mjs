// Área de miembros: publicaciones, comentarios, preguntas y encuentros por Zoom.
// GET ?publico=1 → lo que ve cualquiera en la página de bienvenida (próximo encuentro sin enlace).
import crypto from "node:crypto";
import { deps, json, manejar, origen, texto, Fallo, ahoraLocal, fechaBonita, horaBonita } from "../lib/comun.mjs";
import { avisarme } from "../lib/avisos.mjs";
import { st, requireMiembro, leerMiembro, publico, leerDoc, estadoEncuentro, etiquetaEncuentro, limite, lugares, salio, fechaPublicada, guardarFotoMiembro, CATEGORIAS, huellaM, correoMiembro } from "../lib/comunidad.mjs";
import { esc } from "../lib/avisos.mjs";

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
    const l = await lugares(await deps.contenido(origen(req), "comunidad"));
    return json({ miembro: m ? publico(m) : null, proximo: e.proximos[0] || null, quedan: l.quedan, limite: l.limite });
  }
  const m = await requireMiembro(req);

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const ip = (ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip");
    if (["comentar", "tema-crear", "tema-responder"].includes(b.accion) && !m.normasAceptadas) throw new Fallo(403, "Para participar, primero lee y acepta las normas de la comunidad.");
    if (b.accion === "comentar") {
      const pubs = await leerDoc("publicaciones", { lista: [] });
      const p = pubs.lista.find((x) => x.id === b.post && x.visible !== false && salio(x));
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
    if (b.accion === "aceptar-normas") {
      await s.setJSON(m.clave, { ...(await s.get(m.clave, { type: "json" })), normasAceptadas: deps.ahora().toISOString() });
      return json({ ok: true });
    }
    // ── Conversaciones entre miembros ──
    if (b.accion === "tema-crear") {
      const cfg = await deps.contenido(origen(req), "comunidad");
      const t = texto(b.texto, 4000);
      if (t.length < 3) throw new Fallo(400, "Escribe lo que quieres compartir.");
      await limite(ip, "tema", 10);
      if (b.foto && cfg.fotosMiembros !== true) throw new Fallo(403, "En la comunidad las fotos las comparte solo Queen.");
      const foto = await guardarFotoMiembro(b.foto);
      const id = clave(), revisar = cfg.revisarTemas === true;
      const tema = { id, autor: nombreCorto(m), miembro: m.clave, fundador: m.fundador !== false, categoria: CATEGORIAS.includes(b.categoria) ? b.categoria : "General", titulo: texto(b.titulo, 140), texto: t, foto, creado: deps.ahora().toISOString(), oculto: false, fijado: false, pendiente: revisar, nuevo: true, reportes: 0 };
      await s.setJSON(`t/${id}`, tema);
      await avisarme({ titulo: revisar ? `📝 Publicación por aprobar de ${tema.autor}` : `🗣️ ${tema.autor} publicó en la Comunidad`, cuerpo: `${tema.titulo ? tema.titulo + ": " : ""}${t.slice(0, 220)}`, url: "/admin/#/conversaciones", origen: origen(req) });
      return json({ ok: true, pendiente: revisar });
    }
    if (b.accion === "tema-responder") {
      const tk = `t/${texto(b.tema, 80)}`, tema = await s.get(tk, { type: "json" });
      if (!tema || tema.oculto || (tema.pendiente && tema.miembro !== m.clave)) throw new Fallo(404, "Esa conversación ya no existe.");
      const t = texto(b.texto, 2000);
      if (t.length < 2) throw new Fallo(400, "Escribe tu respuesta.");
      await limite(ip, "resp", 40);
      const r = { tema: tema.id, autor: nombreCorto(m), miembro: m.clave, fundador: m.fundador !== false, texto: t, creado: deps.ahora().toISOString(), oculto: false };
      const rk = `tr/${tema.id}/${clave()}`;
      await s.setJSON(rk, r);
      // Aviso a quien empezó la conversación (máximo uno cada 6 horas por conversación).
      if (tema.miembro !== m.clave && Date.now() - Date.parse(tema.ultimoAviso || 0) > 6 * 3600e3) {
        const autor = await s.get(tema.miembro, { type: "json" });
        if (autor && autor.avisos !== false && !autor.bloqueado) await correoMiembro(autor, { asunto: `💬 ${r.autor} respondió en la Comunidad`, titulo: `Hola, ${autor.nombre}`, parrafos: [`<b>${esc(r.autor)}</b> respondió a lo que compartiste${tema.titulo ? ` en “${esc(tema.titulo)}”` : ""}:`, `<i>${esc(t.slice(0, 300))}</i>`], boton: { texto: "Ver la conversación", url: `${origen(req)}/comunidad.html#conversaciones` } });
        await s.setJSON(tk, { ...tema, ultimoAviso: deps.ahora().toISOString() });
      }
      return json({ ok: true, respuesta: { clave: rk, autor: r.autor, fundador: r.fundador, texto: r.texto, creado: r.creado, mia: true } });
    }
    if (b.accion === "tema-gracias") {
      const tema = await s.get(`t/${texto(b.tema, 80)}`, { type: "json" });
      if (!tema || tema.oculto) throw new Fallo(404, "Esa conversación ya no existe.");
      const gk = `g/${tema.id}/${huellaM(m.clave)}`;
      if (await s.get(gk, { type: "json" })) { await s.delete(gk); return json({ ok: true, dado: false }); }
      await s.setJSON(gk, { en: deps.ahora().toISOString() });
      return json({ ok: true, dado: true });
    }
    if (b.accion === "tema-borrar" || b.accion === "resp-borrar") {
      const k = b.accion === "tema-borrar" ? `t/${texto(b.tema, 80)}` : texto(b.clave, 160);
      if (!/^(t|tr)\//.test(k)) throw new Fallo(400, "No válido.");
      const x = await s.get(k, { type: "json" });
      if (!x || x.miembro !== m.clave) throw new Fallo(403, "Solo puedes borrar lo que tú escribiste.");
      await s.delete(k);
      if (b.accion === "tema-borrar") for (const pre of [`tr/${x.id}/`, `g/${x.id}/`]) for (const { key } of (await s.list({ prefix: pre })).blobs) await s.delete(key);
      return json({ ok: true });
    }
    if (b.accion === "reportar") {
      const k = texto(b.clave, 160);
      if (!/^(t|tr)\//.test(k)) throw new Fallo(400, "No válido.");
      const x = await s.get(k, { type: "json" });
      if (!x) throw new Fallo(404, "Ya no existe.");
      const rep = `rep/${huellaM(k)}/${huellaM(m.clave)}`;
      if (!(await s.get(rep, { type: "json" }))) {
        await s.setJSON(rep, { en: deps.ahora().toISOString() });
        await s.setJSON(k, { ...x, reportes: (x.reportes || 0) + 1 });
        await avisarme({ titulo: "⚠️ Reportaron algo en la Comunidad", cuerpo: `${nombreCorto(m)} reportó lo que escribió ${x.autor}: “${x.texto.slice(0, 200)}”`, url: "/admin/#/conversaciones", origen: origen(req) });
      }
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
  const ahoraTx = ahoraLocal();
  const pubs = (await leerDoc("publicaciones", { lista: [] })).lista.filter((p) => p.visible !== false && salio(p, ahoraTx))
    .map(({ avisar, avisado, programado, ...p }) => ({ ...p, creado: fechaPublicada({ ...p, programado }, ahoraTx) }));
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
  // Conversaciones
  const resps = new Map(), gracias = new Map(), mias = new Set(), yo = huellaM(m.clave);
  for (const { key } of (await s.list({ prefix: "tr/" })).blobs) {
    const r = await s.get(key, { type: "json" });
    if (!r || r.oculto) continue;
    if (!resps.has(r.tema)) resps.set(r.tema, []);
    resps.get(r.tema).push({ clave: key, autor: r.autor, fundador: !!r.fundador, queen: !!r.queen, texto: r.texto, creado: r.creado, mia: r.miembro === m.clave });
  }
  const deQueen = new Set();
  for (const { key } of (await s.list({ prefix: "g/" })).blobs) { const [, tid, quien] = key.split("/"); gracias.set(tid, (gracias.get(tid) || 0) + 1); if (quien === yo) mias.add(tid); if (quien === "queen") deQueen.add(tid); }
  const temas = [];
  for (const { key } of (await s.list({ prefix: "t/" })).blobs) {
    const t = await s.get(key, { type: "json" });
    if (!t || t.oculto || (t.pendiente && t.miembro !== m.clave)) continue;
    const rs = (resps.get(t.id) || []).sort((a, b) => a.creado.localeCompare(b.creado));
    temas.push({ id: t.id, clave: key, autor: t.autor, fundador: !!t.fundador, queen: !!t.queen, categoria: t.categoria, titulo: t.titulo, texto: t.texto, foto: t.foto, creado: t.creado, fijado: !!t.fijado, pendiente: !!t.pendiente, mio: t.miembro === m.clave,
      respuestas: rs, gracias: gracias.get(t.id) || 0, diGracias: mias.has(t.id), queenGracias: deQueen.has(t.id), actividad: rs.length ? rs[rs.length - 1].creado : t.creado });
  }
  temas.sort((a, b) => (b.fijado - a.fijado) || b.actividad.localeCompare(a.actividad));
  if (Date.now() - Date.parse(m.ultimo || 0) > 6 * 3600e3) await s.setJSON(m.clave, { ...(await s.get(m.clave, { type: "json" })), ultimo: deps.ahora().toISOString() });
  return json({ miembro: publico(m), mensaje: texto(cfg.mensajeMiembros, 1500), normas: texto(cfg.normas, 3000), fotosMiembros: cfg.fotosMiembros === true, categorias: CATEGORIAS, posts, encuentros: await encuentros(true), preguntas, temas });
});
export const config = { path: "/api/comunidad" };
