// Suscripción mensual de lecturas: suscribirse, confirmar al volver de Stripe, ver mi suscripción, cancelar/reactivar
// y pedir otra vez el enlace de acceso por correo.
import crypto from "node:crypto";
import { deps, json, manejar, origen, texto, Fallo } from "../lib/comun.mjs";
import { limite } from "../lib/comunidad.mjs";
import { st, claveSus, cfgSus, activa, sesionSuscripcion, confirmarSus, actualizarSus, avisarSus, publicaSus, porToken, correoSus, enlaceSus } from "../lib/suscripcion.mjs";

const conToken = async (x, clave) => {
  if (x.token) return x;
  const token = crypto.randomBytes(18).toString("base64url"), n = { ...x, token };
  await st().setJSON(clave, n); await st().setJSON(`sustok/${token}`, { clave });
  return n;
};

export default manejar(async (req, ctx) => {
  const o = origen(req), u = new URL(req.url);
  if (req.method === "GET") {
    const sid = texto(u.searchParams.get("s"), 200);
    if (sid) {
      if (!/^cs_/.test(sid)) throw new Fallo(400, "Pago no válido.");
      const ses = await deps.stripe().checkout.sessions.retrieve(sid);
      if (!ses || (ses.metadata || {}).tipo !== "suscripcion-lectura") throw new Fallo(404, "No encontré ese pago.");
      const r = await confirmarSus(ses);
      if (!r) throw new Fallo(409, "Tu pago todavía se está procesando. Revisa tu correo en unos minutos.");
      await avisarSus(r, o);
      return json({ ok: true, token: r.sus.token, ...publicaSus(r.sus) });
    }
    const t = await porToken(texto(u.searchParams.get("t"), 60));
    if (!t) throw new Fallo(404, "Este enlace no es válido. Pide uno nuevo con tu correo.");
    return json(publicaSus(t.x));
  }
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  const ip = (ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip") || "";

  if (b.accion === "suscribir") {
    await limite(ip, "sus", 8);
    const L = await deps.contenido(o, "lecturas"), c = cfgSus(L);
    if (!c.activa) throw new Fallo(409, "La suscripción no está disponible por ahora.");
    const nombre = texto(b.nombre, 80), email = texto(b.email, 120).toLowerCase(), whatsapp = texto(b.whatsapp, 30).replace(/[^\d+]/g, "");
    if (!nombre) throw new Fallo(400, "Escribe tu nombre.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fallo(400, "Escribe un correo válido.");
    if (whatsapp.replace(/\D/g, "").length < 10) throw new Fallo(400, "Escribe tu número de WhatsApp con código de área.");
    if (b.acepta !== true) throw new Fallo(400, "Para suscribirte, acepta las condiciones.");
    const clave = claveSus(email), previo = await st().get(clave, { type: "json" });
    if (activa(previo)) {
      // Ya está suscrita: no se cobra dos veces; se le manda su enlace al correo.
      const x = await conToken(previo, clave);
      await correoSus(x, { asunto: "Tu acceso a tu suscripción de lecturas", titulo: `Hola, ${x.nombre}`, parrafos: ["Ya tienes una suscripción activa. Con este botón entras a reservar tu lectura del mes o a ver tu suscripción."], boton: { texto: "Entrar a mi suscripción", url: enlaceSus(x, o) } });
      return json({ yaActiva: true });
    }
    const x = await conToken({ ...(previo || {}), nombre, email, whatsapp, creada: (previo && previo.creada) || deps.ahora().toISOString() }, clave);
    await st().setJSON(clave, x);
    return json({ url: await sesionSuscripcion(x, clave, c.precio, o) });
  }

  if (b.accion === "enlace") {
    await limite(ip, "susenlace", 6);
    const email = texto(b.email, 120).toLowerCase(), clave = claveSus(email), x = await st().get(clave, { type: "json" });
    // Siempre la misma respuesta, para no revelar quién está suscrito.
    if (x && x.pago) { const y = await conToken(x, clave); await correoSus(y, { asunto: "Tu acceso a tu suscripción de lecturas", titulo: `Hola, ${y.nombre}`, parrafos: ["Aquí está tu acceso. Con este botón reservas tu lectura del mes o ves tu suscripción."], boton: { texto: "Entrar a mi suscripción", url: enlaceSus(y, o) } }); }
    return json({ ok: true });
  }

  if (b.accion === "cancelar" || b.accion === "reactivar") {
    const t = await porToken(texto(b.t, 60));
    if (!t) throw new Fallo(404, "Este enlace no es válido.");
    if (!t.x.pago || !t.x.pago.suscripcion) throw new Fallo(409, "No tienes una suscripción con pago.");
    const sub = await deps.stripe().subscriptions.update(t.x.pago.suscripcion, { cancel_at_period_end: b.accion === "cancelar" });
    const r = await actualizarSus(t.clave, sub);
    await avisarSus(r, o);
    return json({ ok: true, ...publicaSus(r.sus) });
  }
  throw new Fallo(400, "Acción no válida.");
});
export const config = { path: "/api/suscripcion" };
