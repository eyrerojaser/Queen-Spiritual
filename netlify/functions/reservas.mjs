// Solo para ti (pide la contraseña del panel): reservas de lecturas y pedidos de Queen Shop.
import { deps, json, manejar, texto, Fallo, ahoraLocal, reservasDesde, fechaBonita, horaBonita } from "../lib/comun.mjs";

import { requireAdmin } from "../lib/panel.mjs";
import { correoCita } from "../lib/avisos.mjs";
import { devolverLectura } from "../lib/suscripcion.mjs";
import { origen } from "../lib/comun.mjs";
deps.autorizar = deps.autorizar || requireAdmin;

export default manejar(async (req) => {
  await deps.autorizar(req);
  const store = deps.store();
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const k = texto(b.clave, 80);
    if (b.accion === "cancelar" && /^r\//.test(k)) {
      const r = await store.get(k, { type: "json" });
      if (!r) return json({ ok: true });
      let reembolso = 0;
      if (b.reembolsar && r.pago && r.precio > 0) { await deps.stripe().refunds.create({ payment_intent: r.pago }); reembolso = r.precio; }
      const lecturaDevuelta = await devolverLectura(r);
      const kc = `cancelada/${Date.now()}_${k.slice(2)}`, final = { ...r, estado: "cancelada", cancelada: deps.ahora().toISOString(), canceladaPor: "negocio", reembolso, lecturaDevuelta };
      await store.setJSON(kc, final);
      if (r.token) await store.setJSON(`tok/${r.token}`, { clave: kc });
      if (r.sesion) await store.setJSON(`ses/${r.sesion}`, { clave: kc });
      await store.delete(k);
      if (b.avisarCliente !== false) await correoCita("cancelada", final, { origen: origen(req), reembolso });
      return json({ ok: true, reembolso });
    }
    if (b.accion === "resolver" && /^conflicto\//.test(k)) { await store.delete(k); return json({ ok: true }); }
    if (b.accion === "entregado" && /^orden\//.test(k)) {
      const o = await store.get(k, { type: "json" });
      if (o && o.estado === "pagada") await store.setJSON(k, { ...o, estado: "entregada", entregada: deps.ahora().toISOString() });
      return json({ ok: true });
    }
    throw new Fallo(400, "Acción no válida.");
  }
  const hoy = ahoraLocal();
  const lista = (await reservasDesde(store, hoy.fecha)).filter((r) => r.estado === "pagada")
    .map(({ token, ...r }) => ({ ...r, fechaBonita: fechaBonita(r.fecha), horaBonita: horaBonita(r.hora) }))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const { blobs } = await store.list({ prefix: "conflicto/" });
  const conflictos = [];
  for (const b of blobs) { const r = await store.get(b.key, { type: "json" }); if (r) conflictos.push({ ...r, clave: b.key, fechaBonita: fechaBonita(r.fecha), horaBonita: horaBonita(r.hora) }); }
  // Pedidos con productos físicos que falta entregar (los digitales se descargan solos).
  const pedidos = [], ahora = deps.ahora().getTime();
  for (const b of (await store.list({ prefix: "orden/" })).blobs) {
    const o = await store.get(b.key, { type: "json" });
    if (!o) continue;
    if (o.estado === "creada" && ahora - Date.parse(o.creada) > 2 * 864e5) { await store.delete(b.key); continue; }
    if (o.estado === "pagada" && o.items.some((i) => !i.digital)) pedidos.push({ ...o, clave: b.key });
  }
  pedidos.sort((a, b) => a.pagada.localeCompare(b.pagada));
  return json({ reservas: lista, conflictos, pedidos });
});
export const config = { path: "/api/reservas" };
