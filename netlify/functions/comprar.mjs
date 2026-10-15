// Queen Shop: crea el pago de todo el carrito.
import { deps, json, manejar, origen, texto, slug, Fallo, cargarTienda } from "../lib/comun.mjs";

export default manejar(async (req) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  const o = origen(req);
  const { productos, ajustes } = await cargarTienda(o);
  const mapa = new Map(productos.map((p) => [slug(p.titulo), p]));
  const items = new Map();
  for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 30)) {
    const id = texto(it && it.id, 120), p = mapa.get(id);
    if (!p) throw new Fallo(409, "Uno de los productos de tu carrito ya no está disponible. Revisa tu carrito.");
    if (p.agotado) throw new Fallo(409, `"${p.titulo}" está agotado. Quítalo del carrito para continuar.`);
    const digital = p.entrega !== "fisico";
    if (digital && !deps.leerArchivo(p.archivo)) throw new Fallo(503, `"${p.titulo}" todavía no está listo para descargar. Quítalo del carrito o intenta más tarde.`);
    const previo = items.get(id);
    const cantidad = digital ? 1 : Math.min(20, Math.max(1, parseInt(it.cantidad, 10) || 1) + (previo ? previo.cantidad : 0));
    items.set(id, { id, titulo: p.titulo, cantidad, digital, archivo: digital ? String(p.archivo).replace(/^\/+/, "") : "", centavos: Math.round(Number(p.precio) * 100), foto: texto(p.foto, 300) });
  }
  const lista = [...items.values()];
  if (!lista.length) throw new Fallo(400, "Tu carrito está vacío.");

  const env = ajustes.envio || {}, rec = ajustes.recoger || {};
  let entrega = "digital";
  if (lista.some((i) => !i.digital)) {
    entrega = b.entrega;
    if (!((entrega === "envio" && env.activo) || (entrega === "recoger" && rec.activo))) throw new Fallo(400, "Elige cómo quieres recibir tu pedido.");
  }
  const subtotal = lista.reduce((t, i) => t + i.centavos * i.cantidad, 0);
  const params = {
    mode: "payment",
    locale: "es",
    line_items: lista.map((i) => ({
      quantity: i.cantidad,
      price_data: { currency: "usd", unit_amount: i.centavos, product_data: { name: i.titulo + (i.digital ? " (descarga)" : ""), ...(i.foto.startsWith("/") && o.startsWith("https") ? { images: [o + encodeURI(i.foto)] } : {}) } },
    })),
    metadata: { tipo: "tienda", entrega },
    success_url: `${o}/gracias.html?s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${o}/tienda.html?cancelado=1`,
  };
  if (entrega !== "digital") params.phone_number_collection = { enabled: true };
  if (entrega === "envio") {
    const gratis = Number(env.gratisDesde) > 0 && subtotal >= Math.round(Number(env.gratisDesde) * 100);
    const costo = gratis ? 0 : Math.max(0, Math.round(Number(env.costo || 0) * 100));
    params.shipping_address_collection = { allowed_countries: ["US"] };
    params.shipping_options = [{ shipping_rate_data: { type: "fixed_amount", display_name: costo ? "Envío" : "Envío gratis", fixed_amount: { amount: costo, currency: "usd" } } }];
  }
  const s = await deps.stripe().checkout.sessions.create(params);
  await deps.store().setJSON(`orden/${s.id}`, {
    estado: "creada", creada: deps.ahora().toISOString(), entrega,
    recogerTexto: entrega === "recoger" ? texto(rec.texto, 400) : "",
    items: lista.map(({ titulo, cantidad, digital, archivo, centavos }) => ({ titulo, cantidad, digital, archivo, precio: centavos / 100 })),
  });
  return json({ url: s.url });
});
export const config = { path: "/api/comprar" };
