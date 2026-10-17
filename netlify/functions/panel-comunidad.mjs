// Panel: todo lo de la Comunidad (miembros, publicaciones, comentarios, preguntas y encuentros).
import crypto from "node:crypto";
import { deps, json, manejar, origen, texto, Fallo, ahoraLocal, minutos, fechaBonita } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { esc } from "../lib/avisos.mjs";
import { st, leerDoc, guardarDoc, limpiarPost, limpiarEncuentro, estadoEncuentro, etiquetaEncuentro, correoATodos, correoMiembro } from "../lib/comunidad.mjs";

const sumarDias = (f, n) => new Date((minutos(f) + n * 1440) * 60000).toISOString().slice(0, 10);
async function todos(prefijo) {
  const s = st(), out = [];
  for (const { key } of (await s.list({ prefix: prefijo })).blobs) { const v = await s.get(key, { type: "json" }); if (v) out.push({ ...v, clave: key }); }
  return out;
}

export default manejar(async (req) => {
  await requireAdmin(req);
  const s = st(), o = origen(req);
  if (req.method === "GET") {
    const vista = new URL(req.url).searchParams.get("vista") || "resumen";
    if (vista === "resumen") {
      const ms = await todos("m/"), coms = await todos("c/"), qs = await todos("q/");
      const semana = Date.now() - 7 * 864e5;
      const enc = (await leerDoc("encuentros", { lista: [] })).lista.filter((e) => e.fecha && estadoEncuentro(e) !== "pasado").sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
      return json({ miembros: ms.filter((m) => !m.bloqueado).length, nuevos: ms.filter((m) => Date.parse(m.creado) > semana).length, comentariosNuevos: coms.filter((c) => c.nuevo).length, preguntasPendientes: qs.filter((q) => !q.respuesta).length, publicaciones: (await leerDoc("publicaciones", { lista: [] })).lista.length, proximo: enc[0] ? { ...enc[0], etiqueta: etiquetaEncuentro(enc[0]) } : null });
    }
    if (vista === "miembros") {
      const ms = (await todos("m/")).sort((a, b) => b.creado.localeCompare(a.creado));
      return json({ miembros: ms.map(({ nombre, apellido, email, telefono, creado, ultimo, bloqueado, avisos, clave }) => ({ nombre, apellido, email, telefono, creado, ultimo, bloqueado: !!bloqueado, avisos: avisos !== false, clave })) });
    }
    if (vista === "publicaciones") {
      const doc = await leerDoc("publicaciones", { lista: [] }), coms = await todos("c/");
      return json({ lista: doc.lista.map((p) => ({ ...p, nComentarios: coms.filter((c) => c.post === p.id && !c.queen).length })).sort((a, b) => (b.fijado - a.fijado) || b.creado.localeCompare(a.creado)) });
    }
    if (vista === "interaccion") {
      const pubs = (await leerDoc("publicaciones", { lista: [] })).lista, titulo = new Map(pubs.map((p) => [p.id, p.titulo || "Publicación"]));
      const coms = (await todos("c/")).sort((a, b) => b.creado.localeCompare(a.creado)).slice(0, 300);
      const qs = (await todos("q/")).sort((a, b) => (!!a.respuesta - !!b.respuesta) || b.creada.localeCompare(a.creada));
      const out = { comentarios: coms.map((c) => ({ ...c, postTitulo: titulo.get(c.post) || "(publicación borrada)" })), preguntas: qs };
      for (const c of coms) if (c.nuevo) await s.setJSON(c.clave, { ...c, clave: undefined, nuevo: false });
      for (const q of qs) if (q.nueva) await s.setJSON(q.clave, { ...q, clave: undefined, nueva: false });
      return json(out);
    }
    if (vista === "encuentros") {
      const doc = await leerDoc("encuentros", { recordar: true, lista: [] }), ahora = ahoraLocal();
      return json({ recordar: doc.recordar !== false, lista: doc.lista.map((e) => ({ ...e, estado: e.fecha ? estadoEncuentro(e, ahora) : "proximo", etiqueta: e.fecha ? etiquetaEncuentro(e) : "" })).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)) });
    }
    throw new Fallo(404, "No existe.");
  }
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  const k = texto(b.clave, 140);
  switch (b.accion) {
    case "post-guardar": {
      const doc = await leerDoc("publicaciones", { lista: [] });
      const i = doc.lista.findIndex((p) => p.id === (b.post && b.post.id));
      const p = limpiarPost(b.post || {}, i >= 0 ? doc.lista[i] : {});
      if (!p.titulo && !p.texto && !p.video && !p.fotos.length) throw new Fallo(400, "Escribe un título o agrega contenido.");
      if (p.tipo === "video" && !p.video) throw new Fallo(400, "Pega el enlace del video (YouTube, Vimeo, Instagram, TikTok o Google Drive).");
      if (p.tipo === "fotos" && !p.fotos.length) throw new Fallo(400, "Sube al menos una foto.");
      if (i >= 0) doc.lista[i] = p; else doc.lista.unshift(p);
      await guardarDoc("publicaciones", doc);
      let avisados = 0;
      if (i < 0 && b.avisar && p.visible) avisados = await correoATodos({ asunto: `✨ Nuevo en la Comunidad: ${p.titulo || "nueva publicación"}`, titulo: p.titulo || "Hay algo nuevo para ti", parrafos: [{ video: "Subí un video nuevo para la comunidad.", fotos: "Compartí fotos nuevas con la comunidad.", ensenanza: "Compartí una enseñanza nueva con la comunidad." }[p.tipo], p.texto ? esc(p.texto.slice(0, 280)) + (p.texto.length > 280 ? "…" : "") : ""].filter(Boolean), boton: { texto: "Verlo en la comunidad", url: `${o}/comunidad.html` } });
      return json({ ok: true, post: p, avisados });
    }
    case "post-borrar": {
      const doc = await leerDoc("publicaciones", { lista: [] });
      doc.lista = doc.lista.filter((p) => p.id !== b.id);
      await guardarDoc("publicaciones", doc);
      for (const { key } of (await s.list({ prefix: `c/${b.id}/` })).blobs) await s.delete(key);
      return json({ ok: true });
    }
    case "com-ocultar": case "com-borrar": {
      if (!/^c\//.test(k)) throw new Fallo(400, "Comentario no válido.");
      if (b.accion === "com-borrar") { await s.delete(k); return json({ ok: true }); }
      const c = await s.get(k, { type: "json" }); if (!c) throw new Fallo(404, "Ese comentario ya no existe.");
      await s.setJSON(k, { ...c, oculto: b.oculto !== false }); return json({ ok: true });
    }
    case "com-responder": {
      const t = texto(b.texto, 1500); if (!t) throw new Fallo(400, "Escribe tu respuesta.");
      const pubs = (await leerDoc("publicaciones", { lista: [] })).lista;
      if (!pubs.some((p) => p.id === b.post)) throw new Fallo(404, "Esa publicación ya no existe.");
      await s.setJSON(`c/${b.post}/${deps.ahora().toISOString().replace(/[:.]/g, "-")}_${crypto.randomBytes(4).toString("hex")}`, { post: b.post, texto: t, autor: "Queen", queen: true, creado: deps.ahora().toISOString(), oculto: false, nuevo: false });
      return json({ ok: true });
    }
    case "preg-responder": {
      if (!/^q\//.test(k)) throw new Fallo(400, "Pregunta no válida.");
      const q = await s.get(k, { type: "json" }); if (!q) throw new Fallo(404, "Esa pregunta ya no existe.");
      const r = texto(b.respuesta, 4000); if (!r) throw new Fallo(400, "Escribe tu respuesta.");
      const primera = !q.respuesta;
      await s.setJSON(k, { ...q, respuesta: r, respondida: deps.ahora().toISOString(), publica: b.publica !== false, nueva: false });
      if (primera) { const m = await s.get(q.miembro, { type: "json" }); if (m && m.avisos !== false) await correoMiembro(m, { asunto: "Respondí tu pregunta 🌙", titulo: `Hola, ${m.nombre}`, parrafos: [`Tu pregunta: <i>${esc(q.texto.slice(0, 300))}</i>`, `Mi respuesta: ${esc(r)}`], boton: { texto: "Ver en la comunidad", url: `${o}/comunidad.html#preguntas` } }); }
      return json({ ok: true });
    }
    case "preg-publica": {
      if (!/^q\//.test(k)) throw new Fallo(400, "Pregunta no válida.");
      const q = await s.get(k, { type: "json" }); if (!q) throw new Fallo(404, "Esa pregunta ya no existe.");
      await s.setJSON(k, { ...q, publica: b.publica !== false }); return json({ ok: true });
    }
    case "preg-borrar": { if (!/^q\//.test(k)) throw new Fallo(400, "Pregunta no válida."); await s.delete(k); return json({ ok: true }); }
    case "miembro-bloquear": case "miembro-borrar": {
      if (!/^m\//.test(k)) throw new Fallo(400, "Miembro no válido.");
      if (b.accion === "miembro-borrar") { await s.delete(k); return json({ ok: true }); }
      const m = await s.get(k, { type: "json" }); if (!m) throw new Fallo(404, "Ese miembro ya no existe.");
      await s.setJSON(k, { ...m, bloqueado: b.bloqueado !== false }); return json({ ok: true });
    }
    case "encuentros-guardar": {
      const antes = await leerDoc("encuentros", { recordar: true, lista: [] }), porId = new Map(antes.lista.map((e) => [e.id, e]));
      const lista = (Array.isArray(b.lista) ? b.lista : []).slice(0, 200).map((e) => limpiarEncuentro(e, porId.get(e.id) || {})).filter((e) => e.fecha);
      for (const e of lista) { const a = porId.get(e.id); if (a && (a.fecha !== e.fecha || a.hora !== e.hora)) e.recordado = ""; }
      await guardarDoc("encuentros", { recordar: b.recordar !== false, lista });
      return json({ ok: true });
    }
    case "encuentros-serie": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.desde || "")) throw new Fallo(400, "Elige la fecha del primer encuentro.");
      const n = Math.min(26, Math.max(1, parseInt(b.cantidad, 10) || 6)), cada = Math.min(60, Math.max(1, parseInt(b.cada, 10) || 15));
      const doc = await leerDoc("encuentros", { recordar: true, lista: [] });
      const nuevos = Array.from({ length: n }, (_, i) => limpiarEncuentro({ fecha: sumarDias(b.desde, i * cada), hora: b.hora, tema: b.tema, zoom: b.zoom, clave: b.clave }));
      doc.lista = [...doc.lista.filter((e) => !nuevos.some((x) => x.fecha === e.fecha)), ...nuevos];
      await guardarDoc("encuentros", doc);
      return json({ ok: true, creados: nuevos.map((e) => fechaBonita(e.fecha)) });
    }
  }
  throw new Fallo(400, "Acción no válida.");
});
export const config = { path: "/api/panel/comunidad" };
