// La página de gracias pregunta aquí qué se compró y si ya está pagado.
import { deps, json, manejar, texto, Fallo, confirmarReserva, confirmarOrden, fechaBonita, horaBonita } from "../lib/comun.mjs";

const direccion = (e) => {
  const a = e && e.address; if (!a) return "";
  return [e.name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", ") + (a.postal_code ? " " + a.postal_code : "")].filter(Boolean).join(" · ");
};

export default manejar(async (req) => {
  const id = texto(new URL(req.url).searchParams.get("s"), 200);
  if (!/^cs_/.test(id)) throw new Fallo(400, "Enlace no válido.");
  const s = await deps.stripe().checkout.sessions.retrieve(id);
  const m = s.metadata || {};
  if (s.payment_status !== "paid") return json({ pagado: false });
  if (m.tipo === "tienda") {
    const o = await confirmarOrden(deps.store(), s);
    if (!o) return json({ pagado: true, tipo: "tienda", items: [] });
    return json({
      pagado: true, tipo: "tienda", entrega: o.entrega, recogerTexto: o.recogerTexto || "", direccion: direccion(o.envio),
      items: o.items.map((it, i) => ({ titulo: it.titulo, cantidad: it.cantidad, digital: it.digital, descarga: it.digital ? `/api/descargar?s=${encodeURIComponent(id)}&i=${i}` : null })),
    });
  }
  if (m.tipo === "reserva") {
    const r = await confirmarReserva(deps.store(), s);
    return json({ pagado: true, tipo: "reserva", lectura: m.lectura, nombre: m.nombre, fecha: fechaBonita(m.fecha), hora: horaBonita(m.hora), conflicto: !!(r && r.conflicto) });
  }
  return json({ pagado: true });
});
export const config = { path: "/api/pedido" };
