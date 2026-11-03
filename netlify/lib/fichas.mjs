// Fichas de clientes: datos, situación y notas de cada lectura (solo las ves tú en el panel).
import crypto from "node:crypto";
import { deps, texto } from "./comun.mjs";

export const stF = () => deps.store("fichas");
const t = (v, n) => texto(v, n);
export const ESTADOS_NOTA = ["pendiente", "cumplido", "no-cumplido", "en-proceso"];

export function limpiarFicha(b, antes = {}) {
  return {
    id: antes.id || crypto.randomBytes(8).toString("base64url"),
    nombre: t(b.nombre, 60), apellido: t(b.apellido, 60), telefono: t(b.telefono, 30).replace(/[^\d+() -]/g, ""), email: t(b.email, 120).toLowerCase(),
    ocupacion: t(b.ocupacion, 120), servicio: t(b.servicio, 120), situacion: t(b.situacion, 4000), etiquetas: t(b.etiquetas, 200),
    creada: antes.creada || deps.ahora().toISOString(), editada: deps.ahora().toISOString(), notas: antes.notas || [],
  };
}
export function limpiarNota(b, antes = {}) {
  return {
    id: antes.id || t(b.id, 40) || crypto.randomBytes(6).toString("base64url"),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || "") ? b.fecha : (antes.fecha || deps.ahora().toISOString().slice(0, 10)),
    servicio: t(b.servicio, 120), cartas: t(b.cartas, 6000), problemas: t(b.problemas, 4000), cumplido: t(b.cumplido, 3000), pendiente: t(b.pendiente, 3000),
    estado: ESTADOS_NOTA.includes(b.estado) ? b.estado : (antes.estado || "pendiente"), sala: t(b.sala, 40) || antes.sala || "",
    creada: antes.creada || deps.ahora().toISOString(), editada: deps.ahora().toISOString(),
  };
}
export async function leerFicha(id) { return /^[\w-]{6,40}$/.test(id || "") ? stF().get(`f/${id}`, { type: "json" }) : null; }
export async function guardarFicha(f) { await stF().setJSON(`f/${f.id}`, f); return f; }
export async function todasLasFichas() {
  const s = stF(), out = [];
  for (const { key } of (await s.list({ prefix: "f/" })).blobs) { const f = await s.get(key, { type: "json" }); if (f) out.push(f); }
  return out;
}
const soloNum = (x) => String(x || "").replace(/\D/g, "").slice(-10);
// Busca si ya existe la ficha (por correo o teléfono); si no, la crea.
export async function fichaPara(datos) {
  const email = t(datos.email, 120).toLowerCase(), tel = soloNum(datos.telefono);
  if (email || tel.length >= 7) {
    const f = (await todasLasFichas()).find((x) => (email && x.email === email) || (tel.length >= 7 && soloNum(x.telefono) === tel));
    if (f) return f;
  }
  return guardarFicha(limpiarFicha(datos));
}
export async function guardarNotaEnFicha(fichaId, nota) {
  const f = await leerFicha(fichaId);
  if (!f) return null;
  const i = f.notas.findIndex((n) => n.id === nota.id);
  const n = limpiarNota(nota, i >= 0 ? f.notas[i] : {});
  if (i >= 0) f.notas[i] = n; else f.notas.unshift(n);
  f.notas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creada.localeCompare(a.creada));
  f.editada = deps.ahora().toISOString();
  await guardarFicha(f);
  return n;
}
export const resumenFicha = (f) => ({ id: f.id, nombre: f.nombre, apellido: f.apellido, telefono: f.telefono, email: f.email, servicio: f.servicio, etiquetas: f.etiquetas, nNotas: f.notas.length, ultima: f.notas[0] ? f.notas[0].fecha : "", pendientes: f.notas.filter((n) => n.estado === "pendiente" || n.estado === "en-proceso").length, editada: f.editada, creada: f.creada });
