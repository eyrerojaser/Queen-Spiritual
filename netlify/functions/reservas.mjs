// Solo para ti: lista y cancela reservas. Pide haber iniciado sesión en el panel.
import { deps, json, manejar, origen, texto, Fallo, ahoraLocal, reservasDesde, fechaBonita, horaBonita } from "../lib/comun.mjs";

export const autorizar = async (req) => {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Fallo(401, "Inicia sesión.");
  const r = await fetch(`${origen(req)}/.netlify/identity/user`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Fallo(401, "Tu sesión venció. Inicia sesión de nuevo.");
};
deps.autorizar = deps.autorizar || autorizar;

export default manejar(async (req) => {
  await deps.autorizar(req);
  const store = deps.store();
  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const k = texto(b.clave, 80);
    if (b.accion === "cancelar" && /^r\//.test(k)) {
      const r = await store.get(k, { type: "json" });
      if (r) { await store.setJSON(`cancelada/${Date.now()}_${k.slice(2)}`, { ...r, estado: "cancelada", cancelada: deps.ahora().toISOString() }); await store.delete(k); }
      return json({ ok: true });
    }
    if (b.accion === "resolver" && /^conflicto\//.test(k)) { await store.delete(k); return json({ ok: true }); }
    throw new Fallo(400, "Acción no válida.");
  }
  const hoy = ahoraLocal();
  const lista = (await reservasDesde(store, hoy.fecha)).filter((r) => r.estado === "pagada")
    .map((r) => ({ ...r, fechaBonita: fechaBonita(r.fecha), horaBonita: horaBonita(r.hora) }))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  const { blobs } = await store.list({ prefix: "conflicto/" });
  const conflictos = [];
  for (const b of blobs) { const r = await store.get(b.key, { type: "json" }); if (r) conflictos.push({ ...r, clave: b.key, fechaBonita: fechaBonita(r.fecha), horaBonita: horaBonita(r.hora) }); }
  return json({ reservas: lista, conflictos });
});
export const config = { path: "/api/reservas" };
