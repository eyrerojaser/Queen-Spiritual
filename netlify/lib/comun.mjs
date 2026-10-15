// Código compartido por las funciones (reservas, pagos y descargas).
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import Stripe from "stripe";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class Fallo extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

// Busca un archivo que viaja junto con las funciones (contenido inicial y PDFs antiguos).
const aqui = path.dirname(fileURLToPath(import.meta.url));
export function leerLocal(rel) {
  const limpio = String(rel || "").replace(/^\/+/, "");
  if (limpio.includes("..")) return null;
  const raices = [process.cwd(), process.env.LAMBDA_TASK_ROOT, aqui, path.resolve(aqui, ".."), path.resolve(aqui, "../.."), path.resolve(aqui, "../../..")].filter(Boolean);
  for (const r of raices) {
    const f = path.join(r, limpio);
    if (fs.existsSync(f)) return fs.readFileSync(f);
  }
  return null;
}

export const NOMBRES_CONTENIDO = ["negocio", "arreglos", "lecturas", "horario", "tienda", "tienda-ajustes", "resenas", "solicitudes", "politicas", "flores"];
const esPdfSubido = (ref) => /^pdf\/[0-9a-f-]{36}$/.test(String(ref || ""));
const esPdfLocal = (ref) => /^private\/pdfs\/[^/]+\.pdf$/i.test(String(ref || "").replace(/^\/+/, ""));

// Dependencias externas en un solo lugar (las pruebas las reemplazan).
export const deps = {
  // Almacenes: "reservas" (citas y pedidos), "contenido" (lo que editas en el panel), "archivos" (fotos y PDFs), "panel" (contraseña).
  store: (nombre = "reservas") => getStore({ name: nombre, consistency: "strong" }),
  stripe: () => {
    const k = process.env.STRIPE_SECRET_KEY;
    if (!k) throw new Fallo(503, "Los pagos todavía no están configurados. Escríbeme por WhatsApp para reservar.");
    return new Stripe(k);
  },
  // Lo guardado desde el panel; si todavía no se ha guardado nada, el contenido inicial del sitio.
  contenido: async (_origen, nombre) => {
    if (!NOMBRES_CONTENIDO.includes(nombre)) throw new Fallo(404, "No existe.");
    const v = await deps.store("contenido").get(`c/${nombre}`, { type: "json" });
    if (v) return v;
    const f = leerLocal(`site/content/${nombre}.json`);
    if (!f) throw new Fallo(500, "No se pudo leer la información del sitio.");
    return JSON.parse(f.toString("utf8"));
  },
  existeArchivo: async (ref) => {
    if (esPdfSubido(ref)) return !!(await deps.store("archivos").get(`${ref}/meta`, { type: "json" }));
    return esPdfLocal(ref) && !!leerLocal(String(ref).replace(/^\/+/, ""));
  },
  // Devuelve { tamano, cuerpo } listo para enviarse; los PDFs grandes se envían por partes.
  abrirArchivo: async (ref) => {
    if (esPdfSubido(ref)) {
      const st = deps.store("archivos"), meta = await st.get(`${ref}/meta`, { type: "json" });
      if (!meta) return null;
      let i = 0;
      const cuerpo = new ReadableStream({
        async pull(c) {
          if (i >= meta.partes) return c.close();
          const b = await st.get(`${ref}/${i++}`, { type: "arrayBuffer" });
          if (!b) return c.error(new Error("parte faltante"));
          c.enqueue(new Uint8Array(b));
        },
      });
      return { tamano: meta.tamano, cuerpo };
    }
    if (!esPdfLocal(ref)) return null;
    const b = leerLocal(String(ref).replace(/^\/+/, ""));
    return b ? { tamano: b.length, cuerpo: b } : null;
  },
  ahora: () => new Date(),
};

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export const manejar = (fn) => async (req, ctx) => {
  try { return await fn(req, ctx); }
  catch (e) {
    if (e instanceof Fallo) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Ocurrió un error. Intenta de nuevo en un momento." }, 500);
  }
};

export const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const origen = (req) => new URL(req.url).origin;
export const texto = (v, max = 200) => String(v ?? "").trim().slice(0, max);

// ───────── Fechas: todo se maneja en hora de Texas (America/Chicago) ─────────
export const TZ = "America/Chicago";
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_BONITOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// minutos "de reloj" (sin zona) para comparar fechas y horas locales
export const minutos = (fecha, hora = "00:00") => {
  const [y, m, d] = fecha.split("-").map(Number), [h, mi] = hora.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) / 60000;
};
export function ahoraLocal(d = deps.ahora()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const fecha = `${p.year}-${p.month}-${p.day}`, hora = `${p.hour}:${p.minute}`;
  return { fecha, hora, min: minutos(fecha, hora) };
}
const sumarDias = (fecha, n) => new Date(minutos(fecha) * 60000 + n * 864e5).toISOString().slice(0, 10);
const diaSemana = (fecha) => DIAS[new Date(minutos(fecha) * 60000).getUTCDay()];
export const fechaBonita = (fecha) => { const dt = new Date(minutos(fecha) * 60000); return `${DIAS_BONITOS[dt.getUTCDay()]} ${dt.getUTCDate()} de ${MESES[dt.getUTCMonth()]}`; };
export const horaBonita = (hora) => { const [h, m] = hora.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
const esHora = (h) => /^\d{2}:\d{2}$/.test(String(h || ""));
const soloFecha = (f) => String(f || "").slice(0, 10);

function horasEntre(desde, hasta, dur) {
  if (!esHora(desde) || !esHora(hasta)) return [];
  const out = [], [a, b] = [desde, hasta].map((h) => { const [x, y] = h.split(":").map(Number); return x * 60 + y; });
  for (let t = a; t + dur <= b; t += dur) out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  return out;
}

export function horasDelDia(cfg, fecha) {
  const dur = Math.max(15, parseInt(cfg.duracion, 10) || 60);
  if ((cfg.cerrados || []).some((c) => soloFecha(c && c.fecha) === fecha)) return [];
  const esp = (cfg.especiales || []).filter((e) => e && soloFecha(e.fecha) === fecha);
  const bloques = esp.length ? esp : (cfg.semana || []).filter((s) => s && s.dia === diaSemana(fecha));
  return [...new Set(bloques.flatMap((b) => horasEntre(b.desde, b.hasta, dur)))].sort();
}

export function calcularDisponibilidad(cfg, ocupadas, ahora = ahoraLocal()) {
  if (!cfg || cfg.reservasActivas === false) return [];
  const dias = Math.min(120, Math.max(1, parseInt(cfg.anticipacionDias, 10) || 30));
  const limite = ahora.min + Math.max(0, Number(cfg.avisoHoras) || 0) * 60;
  const out = [];
  for (let i = 0; i <= dias; i++) {
    const fecha = sumarDias(ahora.fecha, i);
    const horas = horasDelDia(cfg, fecha).filter((h) => minutos(fecha, h) >= limite && !ocupadas.has(clave(fecha, h)));
    if (horas.length) out.push({ fecha, etiqueta: fechaBonita(fecha), horas: horas.map((h) => ({ hora: h, etiqueta: horaBonita(h) })) });
  }
  return out;
}

// ───────── Reservas guardadas (Netlify Blobs) ─────────
export const clave = (fecha, hora) => `r/${fecha}_${hora.replace(":", "")}`;
export const RETENCION_MIN = 35; // lo que se aparta un horario mientras la persona paga

export async function reservasDesde(store, fechaMin, ahora = deps.ahora()) {
  const { blobs } = await store.list({ prefix: "r/" });
  const out = [];
  for (const b of blobs) {
    if (b.key.slice(2, 12) < fechaMin) continue;
    const r = await store.get(b.key, { type: "json" });
    if (!r) continue;
    if (r.estado === "pendiente" && ahora.getTime() - Date.parse(r.creada) > RETENCION_MIN * 60000) {
      await store.delete(b.key);
      continue;
    }
    out.push({ ...r, clave: b.key });
  }
  return out;
}

// Marca la reserva como pagada. Se llama desde la página de gracias y desde el webhook (lo que llegue primero).
// Guarda "ses/<sesión>" apuntando a la cita, para encontrarla aunque luego se cambie de día o se cancele.
export async function confirmarReserva(store, sesion) {
  const m = sesion.metadata || {};
  if (m.tipo !== "reserva" || sesion.payment_status !== "paid") return null;
  const ya = await store.get(`ses/${sesion.id}`, { type: "json" });
  if (ya && ya.clave) {
    const r = await store.get(ya.clave, { type: "json" });
    if (r) return { ...r, clave: ya.clave };
  }
  const k = m.clave;
  const datos = {
    estado: "pagada", sesion: sesion.id, pago: typeof sesion.payment_intent === "string" ? sesion.payment_intent : (sesion.payment_intent && sesion.payment_intent.id) || "",
    fecha: m.fecha, hora: m.hora, lectura: m.lectura,
    nombre: m.nombre, whatsapp: m.whatsapp, email: (sesion.customer_details && sesion.customer_details.email) || m.email || "",
    nota: m.nota || "", precio: (sesion.amount_total || 0) / 100, pagada: deps.ahora().toISOString(),
    token: crypto.randomBytes(18).toString("base64url"), cambios: 0,
  };
  let final = null;
  const actual = await store.get(k, { type: "json" });
  if (actual && actual.sesion === sesion.id) {
    final = actual.estado === "pagada" && actual.token ? actual : { ...actual, ...datos, creada: actual.creada };
    if (final !== actual) await store.setJSON(k, final);
  } else if (!actual) {
    const r = await store.setJSON(k, { ...datos, creada: datos.pagada }, { onlyIfNew: true });
    if (!r || r.modified !== false) final = { ...datos, creada: datos.pagada };
  }
  if (final) {
    await store.setJSON(`ses/${sesion.id}`, { clave: k });
    await store.setJSON(`tok/${final.token}`, { clave: k });
    return { ...final, clave: k };
  }
  // El horario lo tomó otra persona mientras esta pagaba: se guarda aparte para devolver el dinero o mover la cita.
  await store.setJSON(`conflicto/${sesion.id}`, { ...datos, creada: datos.pagada });
  return { ...datos, clave: k, conflicto: true };
}

// Cuántos días de calendario faltan para la cita (hora de Texas). 0 = es hoy.
export const diasParaCita = (fecha, ahora = ahoraLocal()) => Math.round((minutos(fecha) - minutos(ahora.fecha)) / 1440);
export function politica(cfg) {
  const dias = Math.max(0, parseInt(cfg && cfg.cancelarDias, 10));
  return { dias: Number.isFinite(dias) ? dias : 1, cambiosMax: Math.max(0, parseInt(cfg && cfg.cambiosMax, 10) || 0) || 2 };
}
export function textoPolitica(cfg) {
  if (cfg && texto(cfg.politicaTexto, 2000)) return texto(cfg.politicaTexto, 2000);
  const { dias } = politica(cfg);
  const antes = dias <= 1 ? "hasta el día anterior a tu cita" : `hasta ${dias} días antes de tu cita`;
  return `Puedes cancelar o cambiar tu cita ${antes} y se te devuelve el pago completo. Si cancelas ${dias <= 1 ? "el mismo día de la cita" : "después de ese plazo"}, el pago no es reembolsable.`;
}

// ───────── Queen Shop ─────────
export async function cargarTienda(o) {
  const [t, a] = await Promise.all([deps.contenido(o, "tienda"), deps.contenido(o, "tienda-ajustes")]);
  const productos = (t.productos || []).filter((p) => p && p.visible !== false && texto(p.titulo) && Number(p.precio) > 0);
  return { productos, ajustes: a || {} };
}

// Marca la orden como pagada (desde la página de gracias o el webhook) y guarda a quién y dónde entregar.
export async function confirmarOrden(store, sesion) {
  const m = sesion.metadata || {};
  if (m.tipo !== "tienda" || sesion.payment_status !== "paid") return null;
  const k = `orden/${sesion.id}`;
  const o = await store.get(k, { type: "json" });
  if (!o) return null;
  if (o.estado !== "creada") return o;
  const cd = sesion.customer_details || {};
  const envio = (sesion.collected_information && sesion.collected_information.shipping_details) || sesion.shipping_details || null;
  const c = o.cliente || {};
  const listo = { ...o, estado: "pagada", pagada: deps.ahora().toISOString(), email: c.email || cd.email || "", nombre: c.nombre ? `${c.nombre} ${c.apellido}` : cd.name || "", telefono: c.telefono || cd.phone || "", envio, total: (sesion.amount_total || 0) / 100 };
  await store.setJSON(k, listo);
  return listo;
}
