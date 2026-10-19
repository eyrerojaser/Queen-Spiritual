import crypto from "node:crypto";
import { deps, json, manejar, origen, texto, slug, Fallo, ahoraLocal, reservasDesde, calcularDisponibilidad, clave, fechaBonita, horaBonita } from "../lib/comun.mjs";
import { porToken, lecturaDisponible, periodo, activa } from "../lib/suscripcion.mjs";
import { trasPagoReserva } from "../lib/avisos.mjs";

export default manejar(async (req) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  const o = origen(req);
  // Suscriptora: usa la lectura de su mes (entra con el enlace privado de su correo).
  const sus = b.t ? await porToken(texto(b.t, 60)) : null;
  if (b.t && !sus) throw new Fallo(404, "No encontré tu suscripción. Pide tu enlace otra vez con tu correo.");
  if (sus && !activa(sus.x)) throw new Fallo(409, "Tu suscripción no está activa. Puedes suscribirte otra vez o reservar pagando la lectura.");
  if (sus && !lecturaDisponible(sus.x)) throw new Fallo(409, "Ya reservaste tu lectura de este mes. Cuando se renueve tu suscripción tendrás otra.");
  if (sus) { b.nombre = b.nombre || sus.x.nombre; b.email = sus.x.email; b.whatsapp = b.whatsapp || sus.x.whatsapp; }
  const nombre = texto(b.nombre, 80), email = texto(b.email, 120), whatsapp = texto(b.whatsapp, 30).replace(/[^\d+]/g, ""), nota = texto(b.nota, 450);
  const fecha = texto(b.fecha, 10), hora = texto(b.hora, 5);
  if (!nombre) throw new Fallo(400, "Escribe tu nombre.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Fallo(400, "Escribe un correo válido.");
  if (whatsapp.replace(/\D/g, "").length < 10) throw new Fallo(400, "Escribe tu número de WhatsApp con código de área.");
  if (b.acepta !== true) throw new Fallo(400, "Para reservar, acepta la política de cancelación.");

  const { lecturas = [] } = await deps.contenido(o, "lecturas");
  const lectura = lecturas.find((l) => l && l.visible !== false && slug(l.nombre) === b.lectura);
  const precio = Math.round(Number(lectura && lectura.precio) * 100);
  if (!lectura || !(precio > 0)) throw new Fallo(400, "Esa lectura no está disponible.");
  if (sus) return reservarConSuscripcion({ sus, lectura, nombre, email, whatsapp, nota, fecha: texto(b.fecha, 10), hora: texto(b.hora, 5), o });

  const cfg = await deps.contenido(o, "horario");
  const ahora = ahoraLocal();
  const store = deps.store();
  const ocupadas = new Set((await reservasDesde(store, ahora.fecha)).map((r) => r.clave));
  const libre = calcularDisponibilidad(cfg, ocupadas, ahora).some((d) => d.fecha === fecha && d.horas.some((h) => h.hora === hora));
  if (!libre) throw new Fallo(409, "Ese horario ya no está disponible. Elige otro, por favor.");

  const stripe = deps.stripe(); // antes de apartar, por si los pagos no están configurados
  const k = clave(fecha, hora);
  const apartado = { estado: "pendiente", creada: deps.ahora().toISOString(), fecha, hora, lectura: lectura.nombre, nombre, email, whatsapp, nota };
  const r = await store.setJSON(k, apartado, { onlyIfNew: true });
  if (r && r.modified === false) throw new Fallo(409, "Alguien acaba de tomar ese horario. Elige otro, por favor.");

  try {
    const sesion = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "es",
      customer_email: email,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: precio, product_data: { name: `${lectura.nombre} · ${fechaBonita(fecha)}, ${horaBonita(hora)} (hora de Texas)` } } }],
      metadata: { tipo: "reserva", clave: k, fecha, hora, lectura: lectura.nombre, nombre, email, whatsapp, nota },
      expires_at: Math.floor(deps.ahora().getTime() / 1000) + 31 * 60,
      success_url: `${o}/gracias.html?s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${o}/lecturas.html?cancelado=1`,
    });
    await store.setJSON(k, { ...apartado, sesion: sesion.id });
    return json({ url: sesion.url, sesion: sesion.id });
  } catch (e) {
    await store.delete(k);
    throw e;
  }
});

async function reservarConSuscripcion({ sus, lectura, nombre, email, whatsapp, nota, fecha, hora, o }) {
  const cfg = await deps.contenido(o, "horario"), ahora = ahoraLocal(), store = deps.store();
  const ocupadas = new Set((await reservasDesde(store, ahora.fecha)).map((r) => r.clave));
  if (!calcularDisponibilidad(cfg, ocupadas, ahora).some((d) => d.fecha === fecha && d.horas.some((h) => h.hora === hora))) throw new Fallo(409, "Ese horario ya no está disponible. Elige otro, por favor.");
  const per = periodo(sus.x), lock = `sususo/${sus.clave.slice(4)}/${per}`;
  // Candado: una sola lectura por mes pagado, aunque toque el botón dos veces.
  const l = await store.setJSON(lock, { en: deps.ahora().toISOString() }, { onlyIfNew: true });
  if (l && l.modified === false) throw new Fallo(409, "Ya reservaste tu lectura de este mes.");
  const k = clave(fecha, hora), ahoraIso = deps.ahora().toISOString(), sesion = "sus_" + crypto.randomBytes(9).toString("base64url");
  const r = { estado: "pagada", sesion, pago: "", fecha, hora, lectura: lectura.nombre, nombre, whatsapp, email, nota, precio: 0, suscripcion: sus.clave, susPeriodo: per, pagada: ahoraIso, creada: ahoraIso, token: crypto.randomBytes(18).toString("base64url"), cambios: 0 };
  const w = await store.setJSON(k, r, { onlyIfNew: true });
  if (w && w.modified === false) { await store.delete(lock); throw new Fallo(409, "Alguien acaba de tomar ese horario. Elige otro, por favor."); }
  await store.setJSON(`ses/${sesion}`, { clave: k });
  await store.setJSON(`tok/${r.token}`, { clave: k });
  const x = await store.get(sus.clave, { type: "json" });
  await store.setJSON(sus.clave, { ...x, usos: { ...(x.usos || {}), [per]: { fecha, hora } } });
  await trasPagoReserva({ ...r, clave: k }, o);
  return json({ ok: true, suscripcion: true, fecha: fechaBonita(fecha), hora: horaBonita(hora), lectura: lectura.nombre, gestion: `/cita.html?t=${encodeURIComponent(r.token)}` });
}
export const config = { path: "/api/reservar" };
