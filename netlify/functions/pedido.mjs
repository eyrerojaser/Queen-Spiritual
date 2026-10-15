// La página de gracias pregunta aquí qué se compró y si ya está pagado.
import { deps, json, manejar, texto, Fallo, confirmarReserva, fechaBonita, horaBonita } from "../lib/comun.mjs";

export default manejar(async (req) => {
  const id = texto(new URL(req.url).searchParams.get("s"), 200);
  if (!/^cs_/.test(id)) throw new Fallo(400, "Enlace no válido.");
  const s = await deps.stripe().checkout.sessions.retrieve(id);
  const m = s.metadata || {};
  if (s.payment_status !== "paid") return json({ pagado: false });
  if (m.tipo === "pdf") return json({ pagado: true, tipo: "pdf", titulo: m.titulo, descarga: `/api/descargar?s=${encodeURIComponent(id)}` });
  if (m.tipo === "reserva") {
    const r = await confirmarReserva(deps.store(), s);
    return json({ pagado: true, tipo: "reserva", lectura: m.lectura, nombre: m.nombre, fecha: fechaBonita(m.fecha), hora: horaBonita(m.hora), conflicto: !!(r && r.conflicto) });
  }
  return json({ pagado: true });
});
export const config = { path: "/api/pedido" };
