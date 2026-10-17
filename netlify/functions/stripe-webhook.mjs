// Opcional pero recomendado: confirma reservas y pedidos aunque la persona cierre la página antes de volver.
import { deps, json, manejar, origen, Fallo, confirmarReserva, confirmarOrden } from "../lib/comun.mjs";
import { trasPagoReserva, trasPagoOrden, trasPagoArreglo, trasPagoSaldo } from "../lib/avisos.mjs";
import { confirmarArreglo, confirmarSaldo } from "../lib/arreglos.mjs";
import { confirmarMembresia, actualizarPago } from "../lib/comunidad.mjs";
import { avisarCambio } from "./comunidad-membresia.mjs";

export default manejar(async (req) => {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) throw new Fallo(503, "Webhook sin configurar.");
  const stripe = deps.stripe(), cuerpo = await req.text();
  let ev;
  try { ev = stripe.webhooks.constructEvent(cuerpo, req.headers.get("stripe-signature") || "", secreto); }
  catch { throw new Fallo(400, "Firma no válida."); }
  const s = ev.data.object, store = deps.store();
  if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") { const r = await confirmarReserva(store, s); if (r) await trasPagoReserva(r, origen(req)); const o = await confirmarOrden(store, s); if (o) await trasPagoOrden(o, s.id, origen(req)); const ar = await confirmarArreglo(store, s); if (ar) await trasPagoArreglo(ar, s.id, origen(req)); const sa = await confirmarSaldo(store, s); if (sa) await trasPagoSaldo(sa, origen(req)); }
  // Membresía de la Comunidad: alta, cambios, pagos fallidos y cancelaciones.
  if (ev.type === "checkout.session.completed" && (s.metadata || {}).tipo === "membresia") await avisarCambio(await confirmarMembresia(s), origen(req));
  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(ev.type) && (s.metadata || {}).tipo === "membresia") await avisarCambio(await actualizarPago(s.metadata.clave, s), origen(req));
  if (ev.type === "checkout.session.expired" && s.metadata && s.metadata.clave && s.metadata.tipo !== "membresia") {
    const r = await store.get(s.metadata.clave, { type: "json" });
    if (r && r.sesion === s.id && r.estado === "pendiente") await store.delete(s.metadata.clave);
  }
  return json({ recibido: true });
});
export const config = { path: "/api/stripe-webhook" };
