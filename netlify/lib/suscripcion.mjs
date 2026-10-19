// Suscripción mensual de lecturas: el cliente paga cada mes con Stripe y cada mes pagado le da 1 lectura
// que reserva en el calendario sin volver a pagar.
import crypto from "node:crypto";
import { deps, fechaBonita, horaBonita } from "./comun.mjs";
import { avisosDeps, plantilla, nombreNegocio, avisarme } from "./avisos.mjs";

export const st = () => deps.store("reservas");
export const claveSus = (email) => "sus/" + crypto.createHash("sha256").update("suscripcion|" + String(email).toLowerCase().trim()).digest("hex").slice(0, 32);
export const ACTIVOS = ["active", "trialing", "past_due"];
export const activa = (x) => !!(x && x.pago && ACTIVOS.includes(x.pago.estado));
const soloNum = (t) => String(t || "").replace(/\D/g, "").slice(-10);
export const mismoTel = (a, b) => soloNum(a).length >= 7 && soloNum(a) === soloNum(b);

// Configuración que se ve en la página (con valores por defecto si todavía no la tocas en el panel).
export function cfgSus(L) {
  const c = (L && L.suscripcion) || {};
  return {
    activa: c.activa !== false,
    precio: Number(c.precio) > 0 ? Number(c.precio) : 35,
    titulo: (c.titulo || "").trim() || "Tu lectura de cada mes",
    texto: (c.texto || "").trim() || "Cada mes trae su propia energía. Suscríbete y recibe una lectura de cartas españolas todos los meses, para caminar acompañada por los mensajes de tus guías espirituales y ancestros. Tú eliges el día y la hora en mi calendario.",
    beneficios: (c.beneficios || "").trim() || "1 lectura completa cada mes, por videollamada\nTú eliges el día y la hora en mi calendario\nSin pagar cada vez: tu lectura ya está cubierta\nCancelas cuando quieras, sin compromiso",
  };
}

// Periodo pagado actual: cada periodo da derecho a una lectura.
export const periodo = (x) => (x && x.pago && x.pago.hasta ? x.pago.hasta.slice(0, 10) : new Date().toISOString().slice(0, 7));
export const lecturaDisponible = (x) => activa(x) && !(x.usos || {})[periodo(x)];

export async function sesionSuscripcion(x, clave, precio, origen) {
  const s = await deps.stripe().checkout.sessions.create({
    mode: "subscription", locale: "es", customer_email: x.email, client_reference_id: clave,
    line_items: [{ price_data: { currency: "usd", unit_amount: Math.round(precio * 100), recurring: { interval: "month" }, product_data: { name: "Suscripción mensual · 1 lectura de cartas al mes" } }, quantity: 1 }],
    metadata: { tipo: "suscripcion-lectura", clave }, subscription_data: { metadata: { tipo: "suscripcion-lectura", clave } },
    success_url: `${origen}/lecturas.html?sus={CHECKOUT_SESSION_ID}`, cancel_url: `${origen}/lecturas.html?sus=cancelado`,
  });
  return s.url;
}

const finPeriodo = (sub) => { const t = sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end); return t ? new Date(t * 1000).toISOString() : ""; };
export async function actualizarSus(clave, sub) {
  if (!/^sus\//.test(clave || "")) return null;
  const s = st(), x = await s.get(clave, { type: "json" });
  if (!x) return null;
  const precio = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price ? (sub.items.data[0].price.unit_amount || 0) / 100 : (x.pago && x.pago.precio) || 0;
  const pago = { suscripcion: sub.id, cliente: typeof sub.customer === "string" ? sub.customer : (sub.customer && sub.customer.id) || "", estado: sub.status, cancelaAlFinal: !!sub.cancel_at_period_end, hasta: finPeriodo(sub), precio, desde: (x.pago && x.pago.desde) || deps.ahora().toISOString() };
  const nuevo = { ...x, pago };
  await s.setJSON(clave, nuevo);
  return { antes: x.pago || null, despues: pago, sus: nuevo };
}
export async function confirmarSus(sesion) {
  const md = sesion.metadata || {};
  if (md.tipo !== "suscripcion-lectura" || sesion.status !== "complete" || !sesion.subscription) return null;
  const sub = typeof sesion.subscription === "string" ? await deps.stripe().subscriptions.retrieve(sesion.subscription) : sesion.subscription;
  return actualizarSus(md.clave, sub);
}

export async function correoSus(x, { asunto, titulo, parrafos, boton }) {
  if (!x || !x.email) return false;
  const negocio = await nombreNegocio();
  const html = plantilla({ negocio, titulo, parrafos, boton, pie: "Guarda este correo: el botón es tu acceso privado a tu suscripción." });
  const text = `${titulo}\n\n${parrafos.map((p) => p.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "")).join("\n\n")}${boton ? `\n\n${boton.texto}: ${boton.url}` : ""}`;
  try { return await avisosDeps.enviarCorreo({ to: x.email, subject: asunto, text, html, nombre: negocio, replyTo: process.env.AVISOS_EMAIL || process.env.GMAIL_USER }); }
  catch (e) { console.error("correo suscripción", e.message); return false; }
}
export const enlaceSus = (x, o) => `${o}/lecturas.html?mi=${encodeURIComponent(x.token)}`;
const dia = (iso) => (iso ? new Date(iso).toLocaleDateString("es-US", { timeZone: "America/Chicago", day: "numeric", month: "long" }) : "");

// Avisos cuando cambia la suscripción (alta, renovación, cancelación). Con candados para no repetir correos.
export async function avisarSus(r, o) {
  if (!r) return;
  const { antes, despues, sus: x } = r;
  const activaAhora = ["active", "trialing"].includes(despues.estado), activaAntes = antes && ACTIVOS.includes(antes.estado);
  const boton = o ? { texto: "Reservar mi lectura", url: enlaceSus(x, o) } : null;
  if (activaAhora && !activaAntes && (await st().setJSON(`susbienv/${despues.suscripcion}`, { en: deps.ahora().toISOString() }, { onlyIfNew: true })).modified !== false) {
    await avisarme({ titulo: `🔮 Nueva suscripción de lecturas: ${x.nombre}`, cuerpo: `${x.email} · $${despues.precio}/mes`, url: "/admin/#/suscripciones", origen: o });
    await correoSus(x, { asunto: "¡Tu suscripción de lecturas está activa! 🔮", titulo: `¡Bienvenida, ${x.nombre}!`, parrafos: [
      "Tu suscripción mensual está activa. <b>Tu lectura de este mes ya está lista</b>: entra con el botón y elige el día y la hora en mi calendario.",
      "Cada mes que se renueve tu suscripción tendrás una lectura nueva para reservar. Te aviso por correo.",
      "Puedes cancelar cuando quieras desde ese mismo botón."], boton });
    return;
  }
  // Se renovó: nuevo periodo = nueva lectura.
  if (activaAhora && activaAntes && antes.hasta && despues.hasta && despues.hasta > antes.hasta && (await st().setJSON(`susrenov/${despues.suscripcion}/${despues.hasta.slice(0, 10)}`, { en: deps.ahora().toISOString() }, { onlyIfNew: true })).modified !== false) {
    await correoSus(x, { asunto: "Tu lectura de este mes ya está lista 🔮", titulo: `${x.nombre}, ya puedes reservar tu lectura`, parrafos: ["Se renovó tu suscripción y ya tienes tu lectura de este mes. Elige el día y la hora que mejor te queden."], boton });
  }
  if (despues.cancelaAlFinal && !(antes && antes.cancelaAlFinal)) await avisarme({ titulo: `Suscripción de lecturas cancelada: ${x.nombre}`, cuerpo: `Termina el ${dia(despues.hasta) || "fin de su mes"}.`, url: "/admin/#/suscripciones", origen: o });
  if (despues.estado === "canceled" && antes && antes.estado !== "canceled") await avisarme({ titulo: `Suscripción de lecturas terminada: ${x.nombre}`, cuerpo: `${x.email} ya no tiene suscripción activa.`, url: "/admin/#/suscripciones", origen: o });
}

// Lo que el cliente ve de su suscripción.
export function publicaSus(x) {
  const usada = activa(x) && (x.usos || {})[periodo(x)];
  return {
    nombre: x.nombre, email: x.email, activa: activa(x), estado: (x.pago && x.pago.estado) || "pendiente",
    cancelaAlFinal: !!(x.pago && x.pago.cancelaAlFinal), hasta: (x.pago && x.pago.hasta) || "", hastaBonita: dia(x.pago && x.pago.hasta),
    precio: (x.pago && x.pago.precio) || 0, disponible: lecturaDisponible(x),
    usada: usada ? { fecha: usada.fecha, hora: usada.hora, fechaBonita: fechaBonita(usada.fecha), horaBonita: horaBonita(usada.hora) } : null,
  };
}


// Si se cancela una cita de suscripción a tiempo (o la cancelas tú), la lectura del mes vuelve a quedar disponible.
export async function devolverLectura(r) {
  if (!r || !r.suscripcion || !r.susPeriodo) return false;
  const s = st(), x = await s.get(r.suscripcion, { type: "json" });
  if (!x) return false;
  const usos = { ...(x.usos || {}) };
  delete usos[r.susPeriodo];
  await s.setJSON(r.suscripcion, { ...x, usos });
  await s.delete(`sususo/${r.suscripcion.slice(4)}/${r.susPeriodo}`);
  return true;
}
export async function moverUso(r) {
  if (!r || !r.suscripcion || !r.susPeriodo) return;
  const s = st(), x = await s.get(r.suscripcion, { type: "json" });
  if (!x || !(x.usos || {})[r.susPeriodo]) return;
  await s.setJSON(r.suscripcion, { ...x, usos: { ...x.usos, [r.susPeriodo]: { fecha: r.fecha, hora: r.hora } } });
}
export async function porToken(token) {
  if (!/^[\w-]{20,40}$/.test(token || "")) return null;
  const s = st(), i = await s.get(`sustok/${token}`, { type: "json" });
  const x = i && (await s.get(i.clave, { type: "json" }));
  return x && x.token === token ? { x, clave: i.clave } : null;
}
