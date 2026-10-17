// Estadísticas propias (sin Google Analytics ni cookies): cada visita se guarda anónima y,
// al abrir el panel, los días anteriores se resumen en un solo registro por día.
import { deps, ahoraLocal, minutos } from "./comun.mjs";

export const est = () => deps.store("estadisticas");
export const fechaDe = (iso) => ahoraLocal(new Date(iso)).fecha;
export const sumarDias = (f, n) => new Date((minutos(f) + n * 1440) * 60000).toISOString().slice(0, 10);

export function fuente(ref, utm) {
  const u = String(utm || "").toLowerCase(), r = String(ref || "").toLowerCase();
  const x = u || r;
  if (!x) return "Directo";
  if (/google/.test(x)) return "Google";
  if (/instagram|ig\b/.test(x)) return "Instagram";
  if (/facebook|fb\b|m\.facebook|l\.facebook/.test(x)) return "Facebook";
  if (/tiktok/.test(x)) return "TikTok";
  if (/whatsapp|wa\.me/.test(x)) return "WhatsApp";
  if (/bing|yahoo|duckduckgo/.test(x)) return "Otros buscadores";
  if (/youtube/.test(x)) return "YouTube";
  return "Otros sitios";
}

export const nombrePagina = (p) => ({ "/": "Portada", "/index.html": "Portada", "/lecturas.html": "Lecturas", "/personaliza.html": "Personaliza tu arreglo", "/tienda.html": "Queen Shop", "/politicas.html": "Políticas", "/comunidad.html": "Comunidad", "/gracias.html": "Gracias (pago hecho)", "/cita.html": "Mi cita" }[p] || p);

const vacio = (fecha) => ({ fecha, visitas: 0, visitantes: [], paginas: {}, fuentes: {}, disp: {}, productos: {}, eventos: {} });
function sumar(r, h) {
  const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  if (h.e === "vista") {
    r.visitas++;
    if (h.v && !r.visitantes.includes(h.v) && r.visitantes.length < 20000) r.visitantes.push(h.v);
    inc(r.paginas, h.p); if (h.f) inc(r.fuentes, h.f); inc(r.disp, h.d === "m" ? "Celular" : "Computadora");
  } else {
    inc(r.eventos, h.e);
    if (h.x && (h.e === "producto" || h.e === "carrito")) { const pr = r.productos[h.x] ||= { vistas: 0, carrito: 0 }; pr[h.e === "producto" ? "vistas" : "carrito"]++; }
  }
  return r;
}

// Resume en d/<fecha> los días ya terminados y borra sus visitas sueltas.
export async function compactar(hoy = ahoraLocal().fecha) {
  const s = est(), dias = new Map();
  for (const { key } of (await s.list({ prefix: "h/" })).blobs) {
    const f = key.slice(2, 12);
    if (f >= hoy) continue;
    if (!dias.has(f)) dias.set(f, []);
    dias.get(f).push(key);
  }
  for (const [f, keys] of dias) {
    const r = (await s.get(`d/${f}`, { type: "json" })) || vacio(f);
    for (const k of keys) { const h = await s.get(k, { type: "json" }); if (h) sumar(r, h); }
    await s.setJSON(`d/${f}`, r);
    for (const k of keys) await s.delete(k);
  }
}

export async function delDia(fecha, hoy = ahoraLocal().fecha) {
  const s = est();
  if (fecha < hoy) return (await s.get(`d/${fecha}`, { type: "json" })) || vacio(fecha);
  const r = vacio(fecha);
  for (const { key } of (await s.list({ prefix: `h/${fecha}/` })).blobs) { const h = await s.get(key, { type: "json" }); if (h) sumar(r, h); }
  return r;
}
