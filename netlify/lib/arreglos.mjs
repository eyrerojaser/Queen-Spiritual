// Arreglos personalizados: precio, depósito, saldo y registro del pedido.
import { deps, Fallo, texto, slug, ahoraLocal, minutos, fechaBonita } from "./comun.mjs";

export const idFlor = (f) => slug(f.nombre);
const centavos = (n) => Math.round(Number(n || 0) * 100);

export const precioArreglo = (a) => { const n = Number(String((a && a.precio) || "").replace(/[^\d.]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };
// Arreglos que se pueden personalizar en línea: florales, visibles y con precio.
export const arreglosPersonalizables = (doc) => ((doc && doc.arreglos) || []).filter((a) => a && a.visible !== false && texto(a.nombre) && (a.tipo || "Arreglo floral") === "Arreglo floral" && precioArreglo(a) > 0);

// Calcula el pedido SIEMPRE en el servidor: precio del arreglo + entrega. Las flores son preferencias (sin costo).
export function calcular(cfg, arreglosDoc, arregloId, seleccion, entrega, pago) {
  const arr = arreglosPersonalizables(arreglosDoc).find((a) => slug(a.nombre) === texto(arregloId, 120));
  if (!arr) throw new Fallo(409, "Elige uno de los arreglos disponibles.");
  const flores = new Map((cfg.flores || []).filter((f) => f && f.visible !== false && texto(f.nombre)).map((f) => [idFlor(f), f]));
  const lineas = [];
  for (const id of (Array.isArray(seleccion) ? seleccion : []).slice(0, 40)) {
    const f = flores.get(texto(typeof id === "object" && id ? id.id : id, 100));
    if (!f || f.agotada || lineas.some((l) => l.id === idFlor(f))) continue;
    lineas.push({ id: idFlor(f), nombre: f.nombre, foto: f.foto || "" });
  }
  const precio = centavos(precioArreglo(arr));
  const cEntrega = entrega === "entrega" ? centavos(cfg.entrega && cfg.entrega.costo) : 0;
  const total = precio + cEntrega;
  const pct = Math.min(100, Math.max(10, parseInt(cfg.depositoPorcentaje, 10) || 50));
  const pagarTodo = pago === "total" && cfg.permitirPagoTotal !== false;
  const cobrar = pagarTodo ? total : Math.round(total * pct / 100);
  return { arreglo: { nombre: arr.nombre, foto: arr.foto || "", ocasion: texto(arr.ocasion, 160), precio: precio / 100 }, lineas, precioArreglo: precio / 100, costoEntrega: cEntrega / 100, total: total / 100, pct, pagarTodo, cobrar: cobrar / 100, saldo: (total - cobrar) / 100 };
}

export function validarFecha(fecha, cfg, cerrados) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Fallo(400, "Elige la fecha de tu evento.");
  const dias = (minutos(fecha) - minutos(ahoraLocal().fecha)) / 1440, min = Math.max(0, parseInt(cfg.anticipacionDias, 10) || 0);
  if (dias < min) throw new Fallo(400, `Los arreglos personalizados se piden con mínimo ${min} días de anticipación. Elige una fecha a partir del ${fechaBonita(new Date((minutos(ahoraLocal().fecha) + min * 1440) * 60000).toISOString().slice(0, 10))}.`);
  if (dias > 365) throw new Fallo(400, "Elige una fecha dentro del próximo año.");
  if ((cerrados || []).some((c) => c && String(c.fecha).slice(0, 10) === fecha)) throw new Fallo(409, "Ese día no tengo disponibilidad. Elige otra fecha, por favor.");
}

// Pago del depósito (o del total) hecho: el pedido queda confirmado.
export async function confirmarArreglo(store, sesion) {
  const m = sesion.metadata || {};
  if (m.tipo !== "arreglo" || sesion.payment_status !== "paid") return null;
  const k = `arr/${sesion.id}`, a = await store.get(k, { type: "json" });
  if (!a) return null;
  if (a.estado !== "creado") return { ...a, clave: k };
  const pagado = (sesion.amount_total || 0) / 100;
  const listo = {
    ...a, estado: "confirmado", confirmado: deps.ahora().toISOString(),
    pagos: [{ tipo: a.pagarTodo ? "total" : "deposito", monto: pagado, metodo: "tarjeta", sesion: sesion.id, pago: typeof sesion.payment_intent === "string" ? sesion.payment_intent : "", en: deps.ahora().toISOString() }],
    pagado, saldo: Math.max(0, Math.round((a.total - pagado) * 100) / 100),
  };
  await store.setJSON(k, listo);
  return { ...listo, clave: k };
}

// Pago del saldo con el enlace que mandas desde el panel.
export async function confirmarSaldo(store, sesion) {
  const m = sesion.metadata || {};
  if (m.tipo !== "saldo" || sesion.payment_status !== "paid" || !/^arr\//.test(m.clave || "")) return null;
  const a = await store.get(m.clave, { type: "json" });
  if (!a || (a.pagos || []).some((p) => p.sesion === sesion.id)) return a ? { ...a, clave: m.clave, repetido: true } : null;
  const monto = (sesion.amount_total || 0) / 100;
  const listo = { ...a, pagos: [...(a.pagos || []), { tipo: "saldo", monto, metodo: "tarjeta", sesion: sesion.id, pago: typeof sesion.payment_intent === "string" ? sesion.payment_intent : "", en: deps.ahora().toISOString() }] };
  listo.pagado = Math.round(listo.pagos.reduce((t, p) => t + p.monto, 0) * 100) / 100;
  listo.saldo = Math.max(0, Math.round((a.total - listo.pagado) * 100) / 100);
  await store.setJSON(m.clave, listo);
  return { ...listo, clave: m.clave };
}
