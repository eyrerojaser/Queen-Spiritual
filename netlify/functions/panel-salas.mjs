// Panel: Private Reading Room (crear salas, entrar como anfitriona, notas, terminar).
import { deps, json, manejar, origen, texto, Fallo, fechaBonita, horaBonita } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { st, nuevoId, nuevaLlave, crearSalaDaily, tokenDaily, borrarSalaDaily, enlaceClienta, estadoSala } from "../lib/sala.mjs";
import { fichaPara, leerFicha, guardarNotaEnFicha } from "../lib/fichas.mjs";
import { avisosDeps, plantilla, nombreNegocio, esc } from "../lib/avisos.mjs";

const leer = async (id) => { const s = /^[\w-]{6,40}$/.test(id || "") ? await st().get(`s/${id}`, { type: "json" }) : null; if (!s) throw new Fallo(404, "No encontré esa sala."); return s; };
const publica = (s, o) => ({ ...s, llave: undefined, enlace: enlaceClienta(s, o), estado: estadoSala(s), cuando: s.fecha ? `${fechaBonita(s.fecha)}${s.hora ? ", " + horaBonita(s.hora) : ""}` : "" });

async function correoEnlace(s, o) {
  if (!s.email) throw new Fallo(400, "Esta clienta no tiene correo. Copia el enlace y mándaselo por mensaje.");
  const negocio = await nombreNegocio(), url = enlaceClienta(s, o);
  const parrafos = [
    `Hola ${esc(s.nombre)}, este es el enlace privado para tu ${esc(s.servicio || "lectura")}${s.fecha ? ` del <b>${esc(fechaBonita(s.fecha))}${s.hora ? " a las " + esc(horaBonita(s.hora)) : ""}</b> (hora de Texas)` : ""}.`,
    "A la hora de tu cita, toca el botón y permite el uso de la cámara y el micrófono. Funciona desde tu teléfono o tu computadora, sin instalar nada.",
    "Busca un lugar tranquilo, con buena señal de internet, y llega con el corazón abierto. 💛",
  ];
  const html = plantilla({ negocio, titulo: "Tu sala privada de lectura", parrafos, boton: { texto: "Entrar a mi sala", url }, pie: "Este enlace es solo para ti. No lo compartas." });
  await avisosDeps.enviarCorreo({ to: s.email, subject: `Tu sala privada con ${negocio}${s.fecha ? " · " + fechaBonita(s.fecha) : ""}`, text: `Tu sala privada de lectura\n\nEntra aquí a la hora de tu cita: ${url}`, html, nombre: negocio, replyTo: process.env.AVISOS_EMAIL || process.env.GMAIL_USER });
}

export default manejar(async (req) => {
  await requireAdmin(req);
  const o = origen(req), u = new URL(req.url);
  if (req.method === "GET") {
    const id = u.searchParams.get("id");
    if (id) {
      const s = await leer(id);
      const ficha = s.ficha ? await leerFicha(s.ficha) : null;
      const out = { sala: publica(s, o), ficha: ficha ? { id: ficha.id, nombre: ficha.nombre, apellido: ficha.apellido, situacion: ficha.situacion, notas: ficha.notas.slice(0, 5) } : null };
      if (u.searchParams.get("entrar") && estadoSala(s) === "activa") out.token = await tokenDaily(s, { duena: true, nombre: "Queen" });
      return json(out);
    }
    const lista = [];
    for (const { key } of (await st().list({ prefix: "s/" })).blobs) { const s = await st().get(key, { type: "json" }); if (s) lista.push(publica(s, o)); }
    lista.sort((a, b) => (a.estado === "activa" ? 0 : 1) - (b.estado === "activa" ? 0 : 1) || `${a.fecha || "9"}${a.hora || ""}`.localeCompare(`${b.fecha || "9"}${b.hora || ""}`) || b.creada.localeCompare(a.creada));
    return json({ salas: lista });
  }
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));

  if (b.accion === "crear") {
    const d = b.datos || {};
    const nombre = texto(d.nombre, 60);
    if (!nombre) throw new Fallo(400, "Escribe el nombre de la clienta.");
    const ficha = d.ficha ? await leerFicha(texto(d.ficha, 40)) : await fichaPara({ nombre, apellido: d.apellido, email: d.email, telefono: d.telefono, servicio: d.servicio });
    const s = {
      id: nuevoId(), llave: nuevaLlave(), ficha: ficha ? ficha.id : "",
      nombre, apellido: texto(d.apellido, 60), email: texto(d.email, 120).toLowerCase(), telefono: texto(d.telefono, 30), servicio: texto(d.servicio, 120) || "Lectura de cartas",
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(d.fecha || "") ? d.fecha : "", hora: /^\d{2}:\d{2}$/.test(d.hora || "") ? d.hora : "",
      duracion: Math.min(240, Math.max(5, parseInt(d.duracion, 10) || 45)), reserva: texto(d.reserva, 80), notas: "", creada: deps.ahora().toISOString(),
    };
    Object.assign(s, await crearSalaDaily(s));
    await st().setJSON(`s/${s.id}`, s);
    let correo = false;
    if (b.enviarCorreo && s.email) { try { await correoEnlace(s, o); correo = true; } catch (e) { console.error("correo sala", e.message); } }
    return json({ sala: publica(s, o), correo });
  }
  const s = await leer(texto(b.id, 40));
  if (b.accion === "notas") {
    s.notas = texto(b.notas, 6000); await st().setJSON(`s/${s.id}`, s);
    if (s.ficha) await guardarNotaEnFicha(s.ficha, { id: "sala-" + s.id, sala: s.id, fecha: s.fecha || s.creada.slice(0, 10), servicio: s.servicio, cartas: s.notas });
    return json({ ok: true, guardado: deps.ahora().toISOString() });
  }
  if (b.accion === "duracion") { s.duracion = Math.min(240, Math.max(5, parseInt(b.duracion, 10) || 45)); await st().setJSON(`s/${s.id}`, s); return json({ ok: true }); }
  if (b.accion === "enviar") { await correoEnlace(s, o); return json({ ok: true }); }
  if (b.accion === "terminar") { await borrarSalaDaily(s); s.terminada = deps.ahora().toISOString(); await st().setJSON(`s/${s.id}`, s); return json({ sala: publica(s, o) }); }
  if (b.accion === "borrar") { await borrarSalaDaily(s); await st().delete(`s/${s.id}`); return json({ ok: true }); }
  throw new Fallo(400, "Acción no válida.");
});
export const config = { path: "/api/panel/salas" };
