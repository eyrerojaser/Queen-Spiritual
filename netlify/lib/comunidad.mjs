// Comunidad Queen Spiritual: miembros, sesión sin contraseña (enlace por correo), publicaciones, comentarios,
// preguntas y encuentros por Zoom. Todo vive en el almacén "comunidad" de Netlify Blobs.
import crypto from "node:crypto";
import { deps, Fallo, texto, ahoraLocal, minutos, fechaBonita, horaBonita } from "./comun.mjs";
import { avisosDeps, plantilla, esc, nombreNegocio } from "./avisos.mjs";

export const st = () => deps.store("comunidad");
const COOKIE = "qs_miembro";
export const DIAS_SESION = 180;
export const claveMiembro = (email) => "m/" + crypto.createHash("sha256").update("miembro|" + String(email).toLowerCase().trim()).digest("hex").slice(0, 32);
export const id = () => crypto.randomBytes(9).toString("base64url");
export const correoValido = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e);
export const correoListo = () => !!((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || process.env.RESEND_API_KEY);
const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Llave secreta para firmar las sesiones (se crea sola la primera vez).
async function llave() {
  const s = st();
  let k = await s.get("secreto", { type: "json" });
  if (!k) { await s.setJSON("secreto", { v: crypto.randomBytes(32).toString("hex") }, { onlyIfNew: true }); k = await s.get("secreto", { type: "json" }); }
  return Buffer.from(k.v, "hex");
}
export async function cookieMiembro(clave) {
  const p = Buffer.from(JSON.stringify({ k: clave, exp: Date.now() + DIAS_SESION * 864e5 })).toString("base64url");
  const v = p + "." + crypto.createHmac("sha256", await llave()).update(p).digest("base64url");
  return `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DIAS_SESION * 86400}`;
}
export const cookieSalir = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function leerMiembro(req) {
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [p, f] = m[1].split(".");
  if (!p || !f || !igual(f, crypto.createHmac("sha256", await llave()).update(p).digest("base64url"))) return null;
  let d; try { d = JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
  if (!(d.exp > Date.now()) || !/^m\//.test(d.k || "")) return null;
  const mi = await st().get(d.k, { type: "json" });
  if (!mi || mi.bloqueado) return null;
  return { ...mi, clave: d.k };
}
export async function requireMiembro(req, { sinAcceso = false } = {}) {
  const m = await leerMiembro(req);
  if (!m) throw new Fallo(401, "Entra a la comunidad con tu correo.");
  if (req.method !== "GET" && req.headers.get("x-comunidad") !== "1") throw new Fallo(403, "Solicitud no permitida.");
  if (!sinAcceso && !tieneAcceso(m) && !m.previa) throw new Fallo(402, "Tu membresía no está activa.");
  return m;
}
// Entran gratis los fundadores y a quien tú le des cortesía; los demás, con su membresía al día.
export const ESTADOS_ACTIVOS = ["active", "trialing", "past_due"];
export const tieneAcceso = (m) => m.fundador !== false || !!m.cortesia || ESTADOS_ACTIVOS.includes(m.pago && m.pago.estado);
export const resumenPago = (m) => m.pago && m.pago.suscripcion ? { estado: m.pago.estado, cancelaAlFinal: !!m.pago.cancelaAlFinal, hasta: m.pago.hasta || "", precio: m.pago.precio || 0 } : null;
export const publico = (m) => ({ nombre: m.nombre, apellido: m.apellido, email: m.email, avisos: m.avisos !== false, creado: m.creado, fundador: m.fundador !== false, cortesia: !!m.cortesia, normas: !!m.normasAceptadas, acceso: tieneAcceso(m), pago: resumenPago(m) });

// Antes de la fecha de apertura, la comunidad funciona como lista de espera.
export const abierta = (cfg) => !(cfg && /^\d{4}-\d{2}-\d{2}$/.test(cfg.apertura || "")) || ahoraLocal().fecha >= cfg.apertura;

// Correo a todos el día que abre la comunidad (una sola vez).
export async function avisarApertura(origen = "") {
  const cfg = await deps.contenido(origen, "comunidad");
  if (!cfg.apertura || ahoraLocal().fecha < cfg.apertura) return [];
  const r = await st().setJSON(`abierta/${cfg.apertura}`, { en: deps.ahora().toISOString() }, { onlyIfNew: true });
  if (r && r.modified === false) return [];
  const sitio = origen || process.env.URL || "";
  const n = await correoATodos({ asunto: "🌙 ¡La Comunidad Queen Spiritual ya está abierta!", titulo: "¡Ya abrimos!", parrafos: ["Llegó el día: la Comunidad Queen Spiritual ya está abierta. Entra, preséntate y comparte con los demás.", "Te espero adentro. 💛"], boton: sitio ? { texto: "Entrar a la comunidad", url: `${sitio}/comunidad.html` } : null });
  return [`apertura (${n} correos)`];
}

// ───────── Membresía mensual (Stripe) ─────────
export async function sesionMembresia(m, clave, precio, origen) {
  const s = await deps.stripe().checkout.sessions.create({
    mode: "subscription", customer_email: m.email, client_reference_id: clave,
    line_items: [{ price_data: { currency: "usd", unit_amount: Math.round(precio * 100), recurring: { interval: "month" }, product_data: { name: "Membresía Comunidad Queen Spiritual" } }, quantity: 1 }],
    metadata: { tipo: "membresia", clave }, subscription_data: { metadata: { tipo: "membresia", clave } },
    success_url: `${origen}/comunidad.html?pago={CHECKOUT_SESSION_ID}`, cancel_url: `${origen}/comunidad.html?pago=cancelado`,
  });
  return s.url;
}
const finPeriodo = (sub) => { const t = sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end); return t ? new Date(t * 1000).toISOString() : ""; };
// Guarda en el miembro cómo va su suscripción. Devuelve { antes, despues } para avisar de cambios.
export async function actualizarPago(clave, sub) {
  if (!/^m\//.test(clave || "")) return null;
  const s = st(), m = await s.get(clave, { type: "json" });
  if (!m) return null;
  const precio = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price ? (sub.items.data[0].price.unit_amount || 0) / 100 : (m.pago && m.pago.precio) || 0;
  const pago = { suscripcion: sub.id, cliente: typeof sub.customer === "string" ? sub.customer : (sub.customer && sub.customer.id) || "", estado: sub.status, cancelaAlFinal: !!sub.cancel_at_period_end, hasta: finPeriodo(sub), precio, desde: (m.pago && m.pago.desde) || deps.ahora().toISOString() };
  await s.setJSON(clave, { ...m, pago });
  return { antes: m.pago || null, despues: pago, miembro: m };
}
export async function confirmarMembresia(sesion) {
  const md = sesion.metadata || {};
  if (md.tipo !== "membresia" || sesion.status !== "complete" || !sesion.subscription) return null;
  const sub = typeof sesion.subscription === "string" ? await deps.stripe().subscriptions.retrieve(sesion.subscription) : sesion.subscription;
  return actualizarPago(md.clave, sub);
}

// Cuántos miembros hay y cuántos lugares de miembro fundador quedan.
export async function lugares(cfg) {
  const s = st(); let n = 0;
  for (const { key } of (await s.list({ prefix: "m/" })).blobs) { const m = await s.get(key, { type: "json" }); if (m && m.fundador !== false) n++; }
  const total = Math.max(0, parseInt(cfg && cfg.fundadores, 10) || 0), quedan = total ? Math.max(0, total - n) : 0;
  const precio = Math.max(0, Number(cfg && cfg.precioMensual) || 0);
  const ab = abierta(cfg);
  return { fundadores: n, limite: total, quedan, precio, cobrar: precio > 0 && quedan === 0 && ab, abierta: ab, apertura: (cfg && cfg.apertura) || "" };
}

// Foto que manda un miembro (ya achicada en su teléfono).
export async function guardarFotoMiembro(dataUrl) {
  if (!dataUrl) return "";
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new Fallo(415, "Esa foto no se pudo leer. Prueba con otra.");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > 3 * 1024 * 1024) throw new Fallo(413, "La foto es demasiado grande.");
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Fallo(415, "Esa foto no se pudo leer. Prueba con otra.");
  const id = crypto.randomUUID();
  await deps.store("archivos").set(`img/${id}`, buf, { metadata: { tipo: "image/jpeg" } });
  return `/img/${id}`;
}
export const CATEGORIAS = ["General", "Experiencias", "Conocimientos", "Ofrendas y altares", "Pido consejo"];
export const huellaM = (clave) => crypto.createHash("sha256").update(String(clave)).digest("hex").slice(0, 20);

// Límite simple por conexión (registros, enlaces, comentarios).
export async function limite(ip, tipo, max, minutosVentana = 60) {
  const s = st(), k = `limite/${tipo}-` + crypto.createHash("sha256").update(ip || "?").digest("hex").slice(0, 24);
  const r = (await s.get(k, { type: "json" })) || { n: 0, desde: Date.now() };
  const vigente = Date.now() - r.desde < minutosVentana * 60000;
  if (vigente && r.n >= max) throw new Fallo(429, "Hiciste muchos intentos seguidos. Espera un rato e inténtalo de nuevo.");
  await s.setJSON(k, vigente ? { n: r.n + 1, desde: r.desde } : { n: 1, desde: Date.now() });
}

// Enlace para entrar sin contraseña (válido 30 minutos, se usa una sola vez).
export async function enlaceEntrada(clave, origen) {
  const t = crypto.randomBytes(24).toString("base64url");
  await st().setJSON(`tok/${t}`, { k: clave, exp: Date.now() + 30 * 60000 });
  return `${origen}/api/comunidad/entrar?t=${t}`;
}
export async function usarEnlace(t) {
  if (!/^[\w-]{20,60}$/.test(t || "")) return null;
  const s = st(), r = await s.get(`tok/${t}`, { type: "json" });
  if (!r) return null;
  await s.delete(`tok/${t}`);
  return r.exp > Date.now() ? r.k : null;
}

export async function correoMiembro(m, { asunto, titulo, parrafos, boton, pie }) {
  const negocio = await nombreNegocio();
  const html = plantilla({ negocio, titulo, parrafos, boton, pie: pie || "Recibes este correo porque eres parte de la Comunidad Queen Spiritual. Para no perderte nada, agrega este correo a tus contactos." });
  const text = [titulo, ...parrafos.map((p) => p.replace(/<[^>]+>/g, "")), boton ? `${boton.texto}: ${boton.url}` : ""].filter(Boolean).join("\n\n");
  try { return await avisosDeps.enviarCorreo({ to: m.email, subject: asunto, text, html, nombre: negocio, replyTo: process.env.AVISOS_EMAIL || process.env.GMAIL_USER }); }
  catch (e) { console.error("correo comunidad", e.message); return false; }
}

// Correo a todos los miembros que aceptan avisos: en copia oculta (nadie ve los correos de los demás), de a 45 por envío.
export async function correoATodos({ asunto, titulo, parrafos, boton }) {
  const s = st(), para = [];
  for (const { key } of (await s.list({ prefix: "m/" })).blobs) {
    const m = await s.get(key, { type: "json" });
    if (m && !m.bloqueado && m.avisos !== false && correoValido(m.email)) para.push(m.email);
  }
  if (!para.length) return 0;
  const negocio = await nombreNegocio();
  const html = plantilla({ negocio, titulo, parrafos, boton, pie: "Recibes este correo porque eres parte de la Comunidad Queen Spiritual. Para dejar de recibir avisos, desactívalos en tu área de miembros." });
  const text = [titulo, ...parrafos.map((p) => p.replace(/<[^>]+>/g, "")), boton ? `${boton.texto}: ${boton.url}` : ""].filter(Boolean).join("\n\n");
  const yo = process.env.GMAIL_USER || process.env.AVISOS_EMAIL || para[0];
  let n = 0;
  for (let i = 0; i < para.length; i += 45) {
    const grupo = para.slice(i, i + 45);
    try { if (await avisosDeps.enviarCorreo({ to: yo, bcc: grupo, subject: asunto, text, html, nombre: negocio, replyTo: process.env.AVISOS_EMAIL || process.env.GMAIL_USER })) n += grupo.length; }
    catch (e) { console.error("correo a todos", e.message); }
  }
  return n;
}

// ───────── Documentos que manejas desde el panel ─────────
export async function leerDoc(nombre, def) { return (await st().get(`doc/${nombre}`, { type: "json" })) || def; }
export const guardarDoc = (nombre, v) => st().setJSON(`doc/${nombre}`, v);

export const TIPOS_POST = ["video", "fotos", "ensenanza"];
const url = (v) => { const s = texto(v, 600); return /^https:\/\//i.test(s) ? s : ""; };
const foto = (v) => { const s = texto(v, 300); return /^\/(img\/[0-9a-f-]{36}|images\/(uploads|flores)\/[\w.-]+)$/.test(s) ? s : ""; };
export function limpiarPost(p, antes = {}) {
  return {
    id: antes.id || texto(p.id, 20) || id(),
    tipo: TIPOS_POST.includes(p.tipo) ? p.tipo : "ensenanza",
    titulo: texto(p.titulo, 160), texto: texto(p.texto, 8000), video: url(p.video),
    fotos: (Array.isArray(p.fotos) ? p.fotos : []).map(foto).filter(Boolean).slice(0, 12),
    fijado: p.fijado === true, visible: p.visible !== false,
    programado: limpiarProgramado(p.programar === false ? null : p.programado),
    avisar: p.avisar === true, avisado: antes.avisado || "",
    creado: antes.creado || deps.ahora().toISOString(), editado: antes.creado ? deps.ahora().toISOString() : "",
  };
}
function limpiarProgramado(x) {
  if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.fecha || "")) return null;
  return { fecha: x.fecha, hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(x.hora || "") ? x.hora : "09:00" };
}
// ¿Ya salió la publicación? (las programadas salen solas a su fecha y hora de Texas)
export function salio(p, ahora = ahoraLocal()) { return !p.programado || minutos(p.programado.fecha, p.programado.hora) <= ahora.min; }
// Fecha real en que salió (para "hace 2 días" y para ordenar).
export function fechaPublicada(p, ahora = ahoraLocal()) {
  if (!p.programado) return p.creado;
  const desfase = ahora.min - Math.round(deps.ahora().getTime() / 60000);
  return new Date((minutos(p.programado.fecha, p.programado.hora) - desfase) * 60000).toISOString();
}
export function correoPublicacion(p, origen) {
  return correoATodos({ asunto: `✨ Nuevo en la Comunidad: ${p.titulo || "nueva publicación"}`, titulo: p.titulo || "Hay algo nuevo para ti",
    parrafos: [{ video: "Subí un video nuevo para la comunidad.", fotos: "Compartí fotos nuevas con la comunidad.", ensenanza: "Compartí una enseñanza nueva con la comunidad." }[p.tipo], p.texto ? esc(p.texto.slice(0, 280)) + (p.texto.length > 280 ? "…" : "") : ""].filter(Boolean),
    boton: { texto: "Verlo en la comunidad", url: `${origen || process.env.URL || ""}/comunidad.html` } });
}
// Cada hora: avisa por correo de las publicaciones programadas que ya salieron.
export async function avisarProgramadas(origen = "") {
  const doc = await leerDoc("publicaciones", { lista: [] }), ahora = ahoraLocal(), hechos = [];
  for (const p of doc.lista) {
    if (!p.programado || !p.avisar || p.avisado || p.visible === false || !salio(p, ahora)) continue;
    const n = await correoPublicacion(p, origen);
    p.avisado = deps.ahora().toISOString(); hechos.push(`${p.titulo || p.id} (${n} correos)`);
  }
  if (hechos.length) await guardarDoc("publicaciones", doc);
  return hechos;
}
export function limpiarEncuentro(e, antes = {}) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(e.fecha || "") ? e.fecha : "";
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(e.hora || "") ? e.hora : "19:00";
  return { id: antes.id || texto(e.id, 20) || id(), fecha, hora, tema: texto(e.tema, 160), zoom: url(e.zoom), clave: texto(e.clave, 60), notas: texto(e.notas, 1500), grabacion: url(e.grabacion), recordado: antes.recordado || "" };
}
export const DURACION_ENCUENTRO = 90; // minutos que se muestra "en vivo"
export function estadoEncuentro(e, ahora = ahoraLocal()) {
  const ini = minutos(e.fecha, e.hora);
  if (ahora.min < ini - 30) return "proximo";
  if (ahora.min <= ini + DURACION_ENCUENTRO) return "envivo";
  return "pasado";
}
export const etiquetaEncuentro = (e) => `${fechaBonita(e.fecha)} a las ${horaBonita(e.hora)}`;

// Recordatorio por correo el día antes de cada encuentro.
export async function recordarEncuentros(origen = "") {
  const doc = await leerDoc("encuentros", { recordar: true, lista: [] });
  if (doc.recordar === false) return [];
  const hoy = ahoraLocal().fecha, hechos = [];
  for (const e of doc.lista) {
    if (!e.fecha || e.recordado) continue;
    const dias = Math.round((minutos(e.fecha) - minutos(hoy)) / 1440);
    if (dias !== 1) continue;
    const sitio = origen || process.env.URL || "";
    const n = await correoATodos({
      asunto: `🌙 Mañana: encuentro de la Comunidad${e.tema ? " · " + e.tema : ""}`,
      titulo: "Te espero mañana en nuestro encuentro",
      parrafos: [`Nuestro encuentro por Zoom es el <b>${esc(etiquetaEncuentro(e))}</b> (hora de Texas).`, e.tema ? `Tema: <b>${esc(e.tema)}</b>` : "", "El enlace para entrar está en tu área de miembros."].filter(Boolean),
      boton: sitio ? { texto: "Ir a la comunidad", url: `${sitio}/comunidad.html` } : null,
    });
    e.recordado = hoy; hechos.push(`encuentro ${e.fecha} (${n} correos)`);
  }
  if (hechos.length) await guardarDoc("encuentros", doc);
  return hechos;
}
