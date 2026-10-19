// Panel: pedidos de arreglos personalizados (flores, fecha, depósito, saldo, estado).
import { deps, json, manejar, origen, texto, Fallo, fechaBonita, ahoraLocal } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { correoArreglo } from "../lib/avisos.mjs";

const ESTADOS = ["confirmado", "preparando", "listo", "entregado", "cancelado"];
const r2 = (n) => Math.round(n * 100) / 100;
export default manejar(async (req) => {
  await requireAdmin(req);
  const st = deps.store("reservas"), o = origen(req);
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const k = texto(b.clave, 120);
    if (!/^arr\//.test(k)) throw new Fallo(400, "Pedido no válido.");
    const a = await st.get(k, { type: "json" });
    if (!a || a.estado === "creado") throw new Fallo(404, "Ese pedido no existe.");
    if (b.accion === "estado" && ESTADOS.includes(b.estado) && b.estado !== "cancelado") a.estado = b.estado;
    else if (b.accion === "nota") a.nota = texto(b.nota, 1500);
    else if (b.accion === "pagoManual") {
      const monto = r2(Math.min(Number(b.monto) || 0, a.saldo));
      if (!(monto > 0)) throw new Fallo(400, "Escribe cuánto te pagaron.");
      a.pagos = [...(a.pagos || []), { tipo: "saldo", monto, metodo: texto(b.metodo, 30) || "efectivo", en: deps.ahora().toISOString() }];
      a.pagado = r2(a.pagos.reduce((t, p) => t + p.monto, 0)); a.saldo = Math.max(0, r2(a.total - a.pagado));
    } else if (b.accion === "cobrarSaldo") {
      if (!(a.saldo > 0)) throw new Fallo(400, "Este pedido no tiene saldo pendiente.");
      const s = await deps.stripe().checkout.sessions.create({
        mode: "payment", locale: "es", customer_email: a.cliente.email,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(a.saldo * 100), product_data: { name: `Saldo · Arreglo para el ${fechaBonita(a.fecha)} (pedido ${a.numero})` } } }],
        metadata: { tipo: "saldo", clave: k }, success_url: `${o}/gracias.html?s={CHECKOUT_SESSION_ID}`, cancel_url: `${o}/`,
      });
      a.enlaceSaldo = s.url;
      await st.setJSON(k, a);
      const enviado = await correoArreglo("enlaceSaldo", a, { origen: o });
      return json({ ok: true, url: s.url, enviado });
    } else if (b.accion === "cancelar") {
      let reembolso = 0;
      if (b.reembolsar) for (const p of a.pagos || []) if (p.metodo === "tarjeta" && p.pago) { await deps.stripe().refunds.create({ payment_intent: p.pago }); reembolso = r2(reembolso + p.monto); }
      a.estado = "cancelado"; a.cancelado = deps.ahora().toISOString(); a.reembolso = reembolso;
    } else throw new Fallo(400, "Acción no válida.");
    await st.setJSON(k, a);
    return json({ ok: true });
  }
  const hoy = ahoraLocal().fecha, out = [], ahora = deps.ahora().getTime();
  for (const { key } of (await st.list({ prefix: "arr/" })).blobs) {
    const a = await st.get(key, { type: "json" });
    if (!a) continue;
    if (a.estado === "creado") { if (ahora - Date.parse(a.creado) > 2 * 864e5) await st.delete(key); continue; }
    out.push({ ...a, clave: key, fechaBonita: fechaBonita(a.fecha), pasado: a.fecha < hoy });
  }
  out.sort((x, y) => x.fecha.localeCompare(y.fecha));
  return json({ encargos: out, hoy });
});
export const config = { path: "/api/panel/encargos" };
