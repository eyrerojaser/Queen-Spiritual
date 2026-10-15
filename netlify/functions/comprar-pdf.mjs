import { deps, json, manejar, origen, texto, slug, Fallo } from "../lib/comun.mjs";

export default manejar(async (req) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  const o = origen(req);
  const { pdfs = [] } = await deps.contenido(o, "pdfs");
  const pdf = pdfs.find((p) => p && p.visible !== false && slug(p.titulo) === texto(b.pdf, 120));
  const precio = Math.round(Number(pdf && pdf.precio) * 100);
  if (!pdf || !(precio > 0)) throw new Fallo(400, "Ese PDF no está disponible.");
  if (!deps.leerArchivo(pdf.archivo)) throw new Fallo(503, "Este PDF todavía no está listo para descargar. Intenta más tarde.");
  const sesion = await deps.stripe().checkout.sessions.create({
    mode: "payment",
    locale: "es",
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: precio, product_data: { name: `${pdf.titulo} (PDF)` } } }],
    metadata: { tipo: "pdf", titulo: pdf.titulo, archivo: String(pdf.archivo).replace(/^\/+/, "") },
    success_url: `${o}/gracias.html?s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${o}/#tienda`,
  });
  return json({ url: sesion.url });
});
export const config = { path: "/api/comprar-pdf" };
