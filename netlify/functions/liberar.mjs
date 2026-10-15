// Si la persona cancela en la página de pago, el horario se libera enseguida.
import { deps, json, manejar, texto, Fallo } from "../lib/comun.mjs";

export default manejar(async (req) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const { sesion } = await req.json().catch(() => ({}));
  const id = texto(sesion, 200);
  if (!/^cs_/.test(id)) return json({ ok: true });
  const stripe = deps.stripe();
  const s = await stripe.checkout.sessions.retrieve(id);
  if (s.status === "open") await stripe.checkout.sessions.expire(id);
  if (s.payment_status !== "paid" && s.metadata && s.metadata.clave) {
    const store = deps.store(), r = await store.get(s.metadata.clave, { type: "json" });
    if (r && r.sesion === id && r.estado === "pendiente") await store.delete(s.metadata.clave);
  }
  return json({ ok: true });
});
export const config = { path: "/api/liberar" };
