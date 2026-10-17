// Avisos: notificaciones al panel instalado (push) y correos (a ti y a tus clientes).
//
// Correo — usa lo que esté configurado en Netlify (variables de entorno):
//   Gmail (lo más fácil):  GMAIL_USER = tu correo de Gmail · GMAIL_APP_PASSWORD = "contraseña de aplicación" de Google
//   o Resend:              RESEND_API_KEY · CORREO_DESDE (ej. "Queen Spiritual <citas@tudominio.com>")
//   AVISOS_EMAIL = dónde te llegan los avisos (si no lo pones, se usa GMAIL_USER)
// Push — no necesita configuración: las llaves se crean solas la primera vez.
import crypto from "node:crypto";
import webpush from "web-push";
import nodemailer from "nodemailer";
import { deps, texto, fechaBonita, horaBonita } from "./comun.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Bitácora de los últimos correos (para la pantalla "Correos" del panel). Nunca rompe el envío.
async function anotarCorreo({ to, bcc, subject, ok, error, respuesta }) {
  try {
    const st = deps.store("panel"), log = (await st.get("correos-log", { type: "json" })) || [];
    log.unshift({ en: new Date().toISOString(), para: [to, ...(bcc && bcc.length ? [`+${bcc.length} en copia oculta`] : [])].filter(Boolean).join(" "), asunto: String(subject || "").slice(0, 120), ok, error: error ? String(error).slice(0, 300) : "", respuesta: respuesta ? String(respuesta).slice(0, 120) : "" });
    await st.setJSON("correos-log", log.slice(0, 25));
  } catch {}
}
export const avisosDeps = {
  async enviarCorreo({ to, bcc, subject, text, html, replyTo, nombre }) {
    const gu = process.env.GMAIL_USER, gp = process.env.GMAIL_APP_PASSWORD, rk = process.env.RESEND_API_KEY;
    if (gu && gp) {
      const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gu.trim(), pass: gp.replace(/\s+/g, "") }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000 });
      try { const info = await t.sendMail({ from: `"${(nombre || "Queen Spiritual").replace(/"/g, "")}" <${gu}>`, to, bcc, subject, text, html, replyTo }); await anotarCorreo({ to, bcc, subject, ok: true, respuesta: info && info.response }); }
      catch (e) { await anotarCorreo({ to, bcc, subject, ok: false, error: e && e.message }); throw e; }
      return true;
    }
    if (rk) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { authorization: `Bearer ${rk}`, "content-type": "application/json" },
        body: JSON.stringify({ from: process.env.CORREO_DESDE || process.env.AVISOS_DESDE || `${nombre || "Queen Spiritual"} <onboarding@resend.dev>`, to: [to], ...(bcc && bcc.length ? { bcc } : {}), subject, text, html, reply_to: replyTo }),
        signal: AbortSignal.timeout(8000),
      });
      return r.ok;
    }
    return false;
  },
  async enviarPush(sub, datos, llaves) {
    webpush.setVapidDetails("mailto:avisos@queenspiritual.app", llaves.publicKey, llaves.privateKey);
    return webpush.sendNotification(sub, JSON.stringify(datos), { TTL: 86400 });
  },
};

export async function llavesPush() {
  const st = deps.store("panel");
  let k = await st.get("vapid", { type: "json" });
  if (!k) {
    const nuevas = webpush.generateVAPIDKeys();
    const r = await st.setJSON("vapid", nuevas, { onlyIfNew: true });
    k = r && r.modified === false ? await st.get("vapid", { type: "json" }) : nuevas;
  }
  return k;
}
export const huellaSub = (endpoint) => crypto.createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 32);

async function pushATodos(datos) {
  const st = deps.store("panel");
  const { blobs } = await st.list({ prefix: "push/" });
  if (!blobs.length) return 0;
  const llaves = await llavesPush();
  let n = 0;
  await Promise.all(blobs.map(async ({ key }) => {
    const sub = await st.get(key, { type: "json" });
    if (!sub) return;
    try { await avisosDeps.enviarPush(sub, datos, llaves); n++; }
    catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await st.delete(key); else console.error("push", e && e.message); }
  }));
  return n;
}

export async function nombreNegocio() {
  try { return texto((await deps.contenido("", "negocio")).nombre, 80) || "Queen Spiritual"; } catch { return "Queen Spiritual"; }
}

// Aviso para ti: notificación al panel + correo (si está configurado). Nunca rompe lo que lo llamó.
export async function avisarme({ titulo, cuerpo, url = "/admin/" , origen = "" }) {
  try { await pushATodos({ titulo, cuerpo, url }); } catch (e) { console.error("push", e.message); }
  const para = process.env.AVISOS_EMAIL || process.env.GMAIL_USER;
  if (para) {
    try { await avisosDeps.enviarCorreo({ to: para, subject: titulo, text: `${cuerpo}\n\nAbrir el panel: ${origen}${url}`, nombre: await nombreNegocio() }); }
    catch (e) { console.error("correo aviso", e.message); }
  }
}

export function plantilla({ negocio, titulo, parrafos, boton, pie }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f2ec;font-family:Helvetica,Arial,sans-serif;color:#23262d">
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
<p style="font-family:Georgia,serif;font-size:22px;font-weight:bold;margin:0 0 18px;color:#1a2340">${esc(negocio)}</p>
<div style="background:#fff;border-radius:14px;padding:26px 22px;border:1px solid #e3e1da">
<h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 14px;color:#1a2340">${esc(titulo)}</h1>
${parrafos.map((p) => `<p style="font-size:16px;line-height:1.55;margin:0 0 12px">${p}</p>`).join("")}
${boton ? `<p style="margin:22px 0 6px"><a href="${esc(boton.url)}" style="display:inline-block;background:#24407f;color:#fff;text-decoration:none;font-weight:bold;padding:13px 22px;border-radius:999px">${esc(boton.texto)}</a></p>` : ""}
</div>
${pie ? `<p style="font-size:13px;line-height:1.5;color:#5e6470;margin:16px 4px 0">${pie}</p>` : ""}
</div></body></html>`;
}

// Correo al cliente sobre su cita (confirmada, cambiada o cancelada).
export async function correoCita(tipo, r, { origen, politicaTexto, reembolso } = {}) {
  if (!r || !r.email) return false;
  const negocio = await nombreNegocio();
  const cuando = `${fechaBonita(r.fecha)} a las ${horaBonita(r.hora)} (hora de Texas)`;
  const enlace = `${origen}/cita.html?t=${encodeURIComponent(r.token || "")}`;
  let asunto, titulo, parrafos, boton = { texto: "Administrar mi cita", url: enlace };
  if (tipo === "confirmada") {
    asunto = `Tu cita está reservada: ${fechaBonita(r.fecha)}, ${horaBonita(r.hora)}`;
    titulo = `¡Tu cita está reservada, ${r.nombre}!`;
    parrafos = [`<b>${esc(r.lectura)}</b><br>${esc(cuando)}<br>Por videollamada · $${esc(r.precio)} pagado`,
      "Antes de tu cita te escribo con el enlace de la videollamada.",
      `<b>Política de cancelación:</b> ${esc(politicaTexto)}`,
      "Si necesitas cancelar o cambiar el día, usa el botón de abajo."];
  } else if (tipo === "cambiada") {
    asunto = `Tu cita cambió: ${fechaBonita(r.fecha)}, ${horaBonita(r.hora)}`;
    titulo = "Tu cita quedó cambiada";
    parrafos = [`<b>${esc(r.lectura)}</b><br>Nueva fecha: ${esc(cuando)}`, "Te escribo antes de tu cita con el enlace de la videollamada."];
  } else {
    asunto = "Tu cita fue cancelada";
    titulo = "Tu cita fue cancelada";
    parrafos = [`<b>${esc(r.lectura)}</b> del ${esc(cuando)}.`,
      reembolso ? `Te devolví <b>$${esc(reembolso)}</b> a tu tarjeta. Puede tardar de 5 a 10 días en verse en tu estado de cuenta.` : r.canceladaPor === "negocio" ? "Si tienes alguna duda sobre tu pago, respóndeme a este correo." : "Como la cancelación fue fuera del plazo de la política, el pago no es reembolsable.",
      "Cuando quieras, puedes reservar otra cita en mi página."];
    boton = { texto: "Reservar otra cita", url: `${origen}/lecturas.html` };
  }
  const html = plantilla({ negocio, titulo, parrafos, boton, pie: "Guarda este correo: el botón es tu acceso privado a tu cita." });
  const text = `${titulo}\n\n${parrafos.map((p) => p.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "")).join("\n\n")}\n\n${boton.texto}: ${boton.url}`;
  try { return await avisosDeps.enviarCorreo({ to: r.email, subject: asunto, text, html, nombre: negocio, replyTo: process.env.AVISOS_EMAIL || process.env.GMAIL_USER }); }
  catch (e) { console.error("correo cliente", e.message); return false; }
}

// Después de un pago de lectura: avisa a ti y al cliente una sola vez (aunque lleguen gracias + webhook a la vez).
export async function trasPagoReserva(r, origen) {
  if (!r || r.conflicto || !r.sesion) {
    if (r && r.conflicto) await avisarme({ titulo: "⚠️ Revisa una reserva", cuerpo: `${r.nombre} pagó el ${fechaBonita(r.fecha)} a las ${horaBonita(r.hora)}, pero esa hora ya estaba tomada.`, url: "/admin/#/reservas", origen });
    return;
  }
  const lock = await deps.store("reservas").setJSON(`aviso/${r.sesion}`, { en: deps.ahora().toISOString() }, { onlyIfNew: true });
  if (lock && lock.modified === false) return;
  const cfg = await deps.contenido(origen, "horario").catch(() => ({}));
  const { textoPolitica } = await import("./comun.mjs");
  await Promise.all([
    avisarme({ titulo: "📅 Nueva cita reservada", cuerpo: `${r.nombre} reservó ${r.lectura} para el ${fechaBonita(r.fecha)} a las ${horaBonita(r.hora)}. Pagó $${r.precio}.`, url: "/admin/#/reservas", origen }),
    correoCita("confirmada", r, { origen, politicaTexto: textoPolitica(cfg) }),
  ]);
}

// Después de una compra en Queen Shop: aviso para ti (una sola vez).
export async function trasPagoOrden(o, sesionId, origen) {
  if (!o || o.estado === "creada") return;
  const lock = await deps.store("reservas").setJSON(`aviso/${sesionId}`, { en: deps.ahora().toISOString() }, { onlyIfNew: true });
  if (lock && lock.modified === false) return;
  const fisico = (o.items || []).some((i) => !i.digital);
  const lista = (o.items || []).map((i) => `${i.cantidad} × ${i.titulo}`).join(", ");
  await avisarme({ titulo: fisico ? "📦 Nueva compra para enviar" : "🛍️ Nueva compra en Queen Shop", cuerpo: `${o.nombre || o.email || "Un cliente"} compró ${lista} · $${o.total}.`, url: fisico ? "/admin/#/pedidos" : "/admin/", origen });
}

// ───────── Arreglos personalizados ─────────
const listaFlores = (a) => `${(a.arreglo && a.arreglo.nombre) || "Arreglo"}${(a.lineas || []).length ? " con " + a.lineas.map((l) => l.nombre).join(", ") : ""}`;
const dinero = (n) => "$" + Number(n || 0).toFixed(2).replace(/\.00$/, "");

export async function correoArreglo(tipo, a, { origen } = {}) {
  if (!a || !a.cliente || !a.cliente.email) return false;
  const negocio = await nombreNegocio(), c = a.cliente;
  const filas = (a.lineas || []).map((l) => esc(l.nombre)).join(", ");
  const cuando = fechaBonita(a.fecha);
  let asunto, titulo, parrafos;
  if (tipo === "confirmado") {
    asunto = `Tu arreglo está confirmado para el ${cuando}`;
    titulo = `¡Gracias, ${c.nombre}! Tu arreglo está confirmado`;
    parrafos = [
      `<b>Fecha del evento:</b> ${esc(cuando)}${a.ocasion ? `<br><b>Para:</b> ${esc(a.ocasion)}` : ""}<br><b>${a.entrega === "entrega" ? "Entrega en" : "Recoges"}:</b> ${esc(a.entrega === "entrega" ? a.lugar : "conmigo (te escribo para coordinar la hora)")}`,
      `<b>Tu arreglo:</b> ${esc((a.arreglo && a.arreglo.nombre) || "Arreglo personalizado")}${filas ? `<br><b>Tus flores favoritas:</b> ${filas}` : ""}${a.colores ? `<br><i>${esc(a.colores)}</i>` : ""}`,
      `<b>Total del arreglo:</b> ${dinero(a.total)}<br><b>Pagaste:</b> ${dinero(a.pagado)}<br><b>Saldo pendiente:</b> ${dinero(a.saldo)}${a.saldo ? " (se paga antes de la entrega)" : ""}`,
      `Número de pedido: <b>${esc(a.numero)}</b>. Si necesitas algo, responde a este correo.`,
    ];
  } else if (tipo === "recordatorio") {
    asunto = `Tu arreglo para el ${cuando} ya casi está listo`;
    titulo = "Tu arreglo ya casi está listo";
    parrafos = [`Estoy preparando tu arreglo para el <b>${esc(cuando)}</b>.`, a.saldo ? `Tienes un saldo pendiente de <b>${dinero(a.saldo)}</b>. Te escribo para cobrarlo antes de la entrega.` : "Tu pedido está pagado por completo. ¡Gracias!", `Número de pedido: <b>${esc(a.numero)}</b>.`];
  } else if (tipo === "saldo") {
    asunto = `Recibí tu pago · arreglo para el ${cuando}`;
    titulo = "¡Recibí tu pago!";
    parrafos = [`Pagaste ${dinero(a.pagado)} de ${dinero(a.total)}.`, a.saldo ? `Saldo pendiente: <b>${dinero(a.saldo)}</b>.` : "Tu arreglo está pagado por completo."];
  } else if (tipo === "enlaceSaldo") {
    asunto = `Pago del saldo · arreglo para el ${cuando}`;
    titulo = "Pago del saldo de tu arreglo";
    parrafos = [`Tu arreglo para el <b>${esc(cuando)}</b> tiene un saldo pendiente de <b>${dinero(a.saldo)}</b>.`, "Puedes pagarlo con tarjeta con el botón de abajo."];
  }
  const boton = tipo === "enlaceSaldo" && a.enlaceSaldo ? { texto: `Pagar ${dinero(a.saldo)}`, url: a.enlaceSaldo } : null;
  const html = plantilla({ negocio, titulo, parrafos, boton });
  const text = `${titulo}\n\n${parrafos.map((p) => p.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "")).join("\n\n")}${boton ? `\n\n${boton.texto}: ${boton.url}` : ""}`;
  try { return await avisosDeps.enviarCorreo({ to: c.email, subject: asunto, text, html, nombre: negocio, replyTo: process.env.AVISOS_EMAIL || process.env.GMAIL_USER }); }
  catch (e) { console.error("correo arreglo", e.message); return false; }
}

export async function trasPagoArreglo(a, sesionId, origen) {
  if (!a || a.estado === "creado") return;
  const lock = await deps.store("reservas").setJSON(`aviso/${sesionId}`, { en: deps.ahora().toISOString() }, { onlyIfNew: true });
  if (lock && lock.modified === false) return;
  await Promise.all([
    avisarme({ titulo: "💐 Nuevo arreglo confirmado", cuerpo: `${a.cliente.nombre} ${a.cliente.apellido} · ${fechaBonita(a.fecha)} · ${listaFlores(a)}. Pagó ${dinero(a.pagado)}, saldo ${dinero(a.saldo)}.`, url: "/admin/#/encargos", origen }),
    correoArreglo("confirmado", a, { origen }),
  ]);
}

export async function trasPagoSaldo(a, origen) {
  if (!a || a.repetido) return;
  await Promise.all([
    avisarme({ titulo: "💵 Saldo pagado", cuerpo: `${a.cliente.nombre} ${a.cliente.apellido} pagó su saldo. Arreglo del ${fechaBonita(a.fecha)}: ${a.saldo ? `queda ${dinero(a.saldo)}` : "pagado completo"}.`, url: "/admin/#/encargos", origen }),
    correoArreglo("saldo", a, { origen }),
  ]);
}
