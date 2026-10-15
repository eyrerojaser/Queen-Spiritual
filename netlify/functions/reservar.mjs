import { deps, json, manejar, origen, texto, slug, Fallo, ahoraLocal, reservasDesde, calcularDisponibilidad, clave, fechaBonita, horaBonita } from "../lib/comun.mjs";

export default manejar(async (req) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  const o = origen(req);
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
      cancel_url: `${o}/?cancelado=1#lecturas`,
    });
    await store.setJSON(k, { ...apartado, sesion: sesion.id });
    return json({ url: sesion.url, sesion: sesion.id });
  } catch (e) {
    await store.delete(k);
    throw e;
  }
});
export const config = { path: "/api/reservar" };
