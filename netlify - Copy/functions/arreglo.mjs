// "Personaliza tu arreglo": crea el pago del depósito (o del total) y guarda el pedido.
import crypto from "node:crypto";
import { deps, json, manejar, origen, texto, Fallo, fechaBonita } from "../lib/comun.mjs";
import { calcular, validarFecha } from "../lib/arreglos.mjs";
import { validarCliente } from "../lib/envio.mjs";

export default manejar(async (req) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const o = origen(req), b = await req.json().catch(() => ({}));
  const [cfg, sol, arreglos] = await Promise.all([deps.contenido(o, "flores"), deps.contenido(o, "solicitudes"), deps.contenido(o, "arreglos")]);
  if (cfg.activo === false) throw new Fallo(409, "Por ahora no estoy tomando arreglos personalizados. Vuelve pronto.");
  const entrega = b.entrega === "entrega" && cfg.entrega && cfg.entrega.activo !== false ? "entrega" : "recoger";
  if (entrega === "recoger" && cfg.recoger && cfg.recoger.activo === false) throw new Fallo(400, "Elige entrega en tu evento.");
  const fecha = texto(b.fecha, 10);
  validarFecha(fecha, cfg, sol.cerrados);
  const calc = calcular(cfg, arreglos, b.arreglo, b.flores, entrega, b.pago);
  // Datos del cliente: nombre completo, teléfono, correo y dirección de entrega.
  const c = b.cliente || {}, partes = texto(c.nombreCompleto, 120).split(/\s+/).filter(Boolean);
  if (partes.length < 2) throw new Fallo(400, "Escribe tu nombre completo (nombre y apellido).");
  const cliente = validarCliente({ ...c, nombre: partes[0], apellido: partes.slice(1).join(" ") }, entrega === "entrega");
  if (b.acepta !== true) throw new Fallo(400, "Para confirmar, acepta la política de arreglos.");
  const detalles = { ocasion: texto(b.ocasion, 160) || calc.arreglo.ocasion, colores: texto(b.colores, 600), referencia: calc.arreglo.nombre };

  const nombreProducto = `${calc.pagarTodo ? "Pago total" : `Depósito (${calc.pct}%)`} · ${calc.arreglo.nombre} para el ${fechaBonita(fecha)}`;
  const s = await deps.stripe().checkout.sessions.create({
    mode: "payment", locale: "es", customer_email: cliente.email,
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(calc.cobrar * 100), product_data: { name: nombreProducto, description: `Total $${calc.total.toFixed(2)}${calc.saldo ? ` · Saldo pendiente $${calc.saldo.toFixed(2)}` : ""}${calc.lineas.length ? ` · Flores favoritas: ${calc.lineas.map((l) => l.nombre).join(", ")}` : ""}`.slice(0, 480) } } }],
    metadata: { tipo: "arreglo", fecha },
    success_url: `${o}/gracias.html?s={CHECKOUT_SESSION_ID}`,
    cancel_url: `${o}/personaliza.html?cancelado=1`,
  });
  await deps.store("reservas").setJSON(`arr/${s.id}`, {
    estado: "creado", creado: deps.ahora().toISOString(), numero: crypto.randomBytes(3).toString("hex").toUpperCase(),
    fecha, entrega, lugar: entrega === "entrega" ? [cliente.direccion1, cliente.direccion2, `${cliente.ciudad}, ${cliente.estado} ${cliente.zip}`].filter(Boolean).join(", ") : "",
    cliente, ...detalles, ...calc, nota: "", recordatorios: {},
  });
  return json({ url: s.url });
});
export const config = { path: "/api/arreglo" };
