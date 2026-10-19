// La página de gracias pregunta aquí qué se compró y si ya está pagado.
import { deps, json, manejar, texto, Fallo, confirmarReserva, confirmarOrden, fechaBonita, horaBonita } from "../lib/comun.mjs";
import { direccionTexto, etiquetaEnvio } from "../lib/envio.mjs";
import { trasPagoReserva, trasPagoOrden, trasPagoArreglo, trasPagoSaldo } from "../lib/avisos.mjs";
import { confirmarArreglo, confirmarSaldo } from "../lib/arreglos.mjs";
import { origen } from "../lib/comun.mjs";

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
    if (o) await trasPagoOrden(o, s.id, origen(req));
    if (!o) return json({ pagado: true, tipo: "tienda", items: [] });
    return json({
      pagado: true, tipo: "tienda", entrega: o.entrega, recogerTexto: o.recogerTexto || "", direccion: direccionTexto(o.cliente) || direccion(o.envio), paqueteria: o.envioOpcion ? etiquetaEnvio(o.envioOpcion) : "",
      items: o.items.map((it, i) => ({ titulo: it.titulo, cantidad: it.cantidad, digital: it.digital, descarga: it.digital ? `/api/descargar?s=${encodeURIComponent(id)}&i=${i}` : null })),
    });
  }
  if (m.tipo === "arreglo") {
    const a = await confirmarArreglo(deps.store(), s);
    if (!a) return json({ pagado: true });
    await trasPagoArreglo(a, s.id, origen(req));
    return json({ pagado: true, tipo: "arreglo", numero: a.numero, nombre: a.cliente.nombre, fecha: fechaBonita(a.fecha), arreglo: a.arreglo && a.arreglo.nombre, flores: a.lineas.map((l) => l.nombre), total: a.total, pagado: a.pagado, saldo: a.saldo, entrega: a.entrega, lugar: a.lugar, email: a.cliente.email });
  }
  if (m.tipo === "saldo") {
    const a = await confirmarSaldo(deps.store(), s);
    if (a) await trasPagoSaldo(a, origen(req));
    return json({ pagado: true, tipo: "saldo", fecha: a ? fechaBonita(a.fecha) : "", saldo: a ? a.saldo : 0, total: a ? a.total : 0, pagadoTotal: a ? a.pagado : 0 });
  }
  if (m.tipo === "reserva") {
    const r = await confirmarReserva(deps.store(), s);
    await trasPagoReserva(r, origen(req));
    return json({ pagado: true, tipo: "reserva", lectura: m.lectura, nombre: m.nombre, fecha: fechaBonita(r && !r.conflicto ? r.fecha : m.fecha), hora: horaBonita(r && !r.conflicto ? r.hora : m.hora), conflicto: !!(r && r.conflicto), email: (r && r.email) || "", gestion: r && r.token ? `/cita.html?t=${encodeURIComponent(r.token)}` : "" });
  }
  return json({ pagado: true });
});
export const config = { path: "/api/pedido" };
