// Panel: estadísticas de toda la página (visitas, páginas, Queen Shop, comunidad y ventas).
import { deps, json, manejar, ahoraLocal } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { compactar, delDia, sumarDias, fechaDe, nombrePagina } from "../lib/estadisticas.mjs";

const r2 = (n) => Math.round(n * 100) / 100;
const orden = (o) => Object.entries(o).map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v);

export default manejar(async (req) => {
  await requireAdmin(req);
  const dias = [1, 7, 30, 90, 365].includes(+new URL(req.url).searchParams.get("dias")) ? +new URL(req.url).searchParams.get("dias") : 30;
  const hoy = ahoraLocal().fecha, desde = sumarDias(hoy, -(dias - 1)), antesDesde = sumarDias(desde, -dias);
  await compactar(hoy);
  const enRango = (f) => f >= desde && f <= hoy, enAntes = (f) => f >= antesDesde && f < desde;

  // Visitas
  const porDia = [], visitantes = new Set(), paginas = {}, fuentes = {}, disp = {}, productos = {}, eventos = {};
  let visitas = 0, visitasAntes = 0;
  for (let i = 0; i < dias; i++) {
    const f = sumarDias(desde, i), d = await delDia(f, hoy);
    visitas += d.visitas; d.visitantes.forEach((v) => visitantes.add(v));
    porDia.push({ fecha: f, visitas: d.visitas, visitantes: d.visitantes.length });
    for (const [k, v] of Object.entries(d.paginas)) paginas[k] = (paginas[k] || 0) + v;
    for (const [k, v] of Object.entries(d.fuentes)) fuentes[k] = (fuentes[k] || 0) + v;
    for (const [k, v] of Object.entries(d.disp)) disp[k] = (disp[k] || 0) + v;
    for (const [k, v] of Object.entries(d.eventos)) eventos[k] = (eventos[k] || 0) + v;
    for (const [k, v] of Object.entries(d.productos)) { const p = productos[k] ||= { vistas: 0, carrito: 0, vendidos: 0, ingresos: 0 }; p.vistas += v.vistas; p.carrito += v.carrito; }
  }
  for (let i = 0; i < dias; i++) visitasAntes += (await delDia(sumarDias(antesDesde, i), hoy)).visitas;

  // Ventas (de lo que ya guardan las reservas, Queen Shop y los arreglos)
  const st = deps.store("reservas"), ventas = { lecturas: 0, tienda: 0, arreglos: 0, nLecturas: 0, nOrdenes: 0, nArreglos: 0 };
  let ventasAntes = 0;
  const leer = async (prefijo, fn) => { for (const { key } of (await st.list({ prefix: prefijo })).blobs) { const v = await st.get(key, { type: "json" }); if (v) fn(v); } };
  await leer("r/", (r) => { if (r.estado !== "pagada" || !r.pagada) return; const f = fechaDe(r.pagada); if (enRango(f)) { ventas.lecturas += r.precio || 0; ventas.nLecturas++; } else if (enAntes(f)) ventasAntes += r.precio || 0; });
  await leer("cancelada/", (r) => { if (!r.pagada) return; const f = fechaDe(r.pagada), neto = (r.precio || 0) - (r.reembolso || 0); if (enRango(f)) { ventas.lecturas += neto; if (neto > 0) ventas.nLecturas++; } else if (enAntes(f)) ventasAntes += neto; });
  await leer("orden/", (o) => {
    if (!["pagada", "entregada"].includes(o.estado) || !o.pagada) return;
    const f = fechaDe(o.pagada);
    if (enAntes(f)) { ventasAntes += o.total || 0; return; }
    if (!enRango(f)) return;
    ventas.tienda += o.total || 0; ventas.nOrdenes++;
    for (const it of o.items || []) { const p = productos[it.titulo] ||= { vistas: 0, carrito: 0, vendidos: 0, ingresos: 0 }; p.vendidos += it.cantidad || 1; p.ingresos += (it.precio || 0) * (it.cantidad || 1); }
  });
  await leer("arr/", (a) => {
    let cuenta = false;
    for (const p of a.pagos || []) { const f = fechaDe(p.en); if (enRango(f)) { ventas.arreglos += p.monto || 0; cuenta = true; } else if (enAntes(f)) ventasAntes += p.monto || 0; }
    if (a.reembolso && a.cancelado && enRango(fechaDe(a.cancelado))) ventas.arreglos -= a.reembolso;
    if (cuenta) ventas.nArreglos++;
  });
  for (const k of ["lecturas", "tienda", "arreglos"]) ventas[k] = r2(ventas[k]);
  ventas.total = r2(ventas.lecturas + ventas.tienda + ventas.arreglos);

  // Comunidad
  const cs = deps.store("comunidad"); let miembros = 0, registros = 0, registrosAntes = 0;
  for (const { key } of (await cs.list({ prefix: "m/" })).blobs) {
    const m = await cs.get(key, { type: "json" }); if (!m) continue;
    if (!m.bloqueado) miembros++;
    const f = fechaDe(m.creado); if (enRango(f)) registros++; else if (enAntes(f)) registrosAntes++;
  }

  return json({
    dias, desde, hasta: hoy,
    totales: { visitas, visitasAntes, visitantes: visitantes.size, tienda: paginas["/tienda.html"] || 0, registros, registrosAntes, miembros, ventas: ventas.total, ventasAntes: r2(ventasAntes) },
    porDia, ventas,
    paginas: orden(paginas).map(({ k, v }) => ({ p: k, nombre: nombrePagina(k), visitas: v })),
    fuentes: orden(fuentes), dispositivos: orden(disp), eventos,
    productos: Object.entries(productos).map(([titulo, v]) => ({ titulo, ...v, ingresos: r2(v.ingresos) })).sort((a, b) => (b.vendidos - a.vendidos) || (b.vistas + b.carrito) - (a.vistas + a.carrito)),
  });
});
export const config = { path: "/api/panel/estadisticas" };
