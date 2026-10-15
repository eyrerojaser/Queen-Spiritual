// Opcional pero recomendado: confirma la reserva aunque la persona cierre la página antes de volver.
import { deps, json, manejar, Fallo, confirmarReserva } from "../lib/comun.mjs";

export default manejar(async (req) => {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) throw new Fallo(503, "Webhook sin configurar.");
  const stripe = deps.stripe(), cuerpo = await req.text();
  let ev;
  try { ev = stripe.webhooks.constructEvent(cuerpo, req.headers.get("stripe-signature") || "", secreto); }
  catch { throw new Fallo(400, "Firma no válida."); }
  const s = ev.data.object, store = deps.store();
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") await confirmarReserva(store, s);
  if (ev.type === "checkout.session.expired" && s.metadata && s.metadata.clave) {
    const r = await store.get(s.metadata.clave, { type: "json" });
    if (r && r.sesion === s.id && r.estado === "pendiente") await store.delete(s.metadata.clave);
  }
  return json({ recibido: true });
});
export const config = { path: "/api/stripe-webhook" };
