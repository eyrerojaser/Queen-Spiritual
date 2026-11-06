// Private Reading Room: videollamadas privadas con Daily.co (cada sesión = una sala privada con enlace único).
// Necesita la variable DAILY_API_KEY en Netlify (cuenta gratis en daily.co).
import crypto from "node:crypto";
import { deps, Fallo, texto } from "./comun.mjs";

export const st = () => deps.store("salas");
const API = "https://api.daily.co/v1";

// Llamada a la API de Daily (las pruebas la reemplazan con deps.daily).
export async function daily(metodo, ruta, cuerpo) {
  if (deps.daily) return deps.daily(metodo, ruta, cuerpo);
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Fallo(503, "Falta conectar el servicio de videollamadas. Pon tu clave DAILY_API_KEY en Netlify (ver LEEME).");
  const r = await fetch(API + ruta, { method: metodo, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok && !(metodo === "DELETE" && r.status === 404)) { console.error("daily", r.status, d); throw new Fallo(502, "El servicio de videollamadas no respondió. Intenta de nuevo en un momento."); }
  return d;
}

const ahoraS = () => Math.floor(deps.ahora().getTime() / 1000);
export const nuevoId = () => crypto.randomBytes(9).toString("base64url");
export const nuevaLlave = () => crypto.randomBytes(18).toString("base64url");
export const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// La sala vale desde que la creas hasta 1 día después de la fecha de la cita (o 2 días si no tiene fecha).
export function vencimiento(s) {
  const base = s.fecha ? Math.floor(new Date(`${s.fecha}T${s.hora || "23:00"}:00-06:00`).getTime() / 1000) : ahoraS();
  return Math.max(ahoraS() + 3600, base + (s.fecha ? 86400 : 2 * 86400));
}

export async function crearSalaDaily(s) {
  const exp = vencimiento(s);
  const room = await daily("POST", "/rooms", {
    name: `qs-${s.id.toLowerCase().replace(/[^a-z0-9-]/g, "")}-${crypto.randomBytes(3).toString("hex")}`,
    privacy: "private",
    properties: { exp, eject_at_room_exp: true, max_participants: Math.min(200, Math.max(2, s.max || 4)), enable_prejoin_ui: true, enable_chat: true, enable_screenshare: false, enable_knocking: false, lang: "es" },
  });
  return { room: room.name, url: room.url, exp };
}

export async function tokenDaily(s, { duena, nombre }) {
  const exp = Math.min(s.exp || vencimiento(s), ahoraS() + 6 * 3600);
  const d = await daily("POST", "/meeting-tokens", { properties: { room_name: s.room, user_name: texto(nombre, 60) || (duena ? "Queen" : "Clienta"), is_owner: !!duena, exp, start_video_off: false, start_audio_off: false } });
  if (!d.token) throw new Fallo(502, "No se pudo abrir la videollamada. Intenta de nuevo.");
  return d.token;
}

export async function borrarSalaDaily(s) { if (s && s.room) await daily("DELETE", `/rooms/${encodeURIComponent(s.room)}`).catch(() => {}); }

export const enlaceClienta = (s, o) => `${o}/sala.html?s=${encodeURIComponent(s.id)}&k=${encodeURIComponent(s.llave)}`;
export const estadoSala = (s) => s.terminada ? "terminada" : (s.exp && s.exp < ahoraS() ? "vencida" : "activa");

// La videollamada se crea en Daily cuando alguien entra por primera vez (así sirve aunque cambies la fecha).
export async function asegurarRoom(s) {
  if (s.room && (!s.exp || s.exp > ahoraS() + 600)) return s;
  Object.assign(s, await crearSalaDaily(s));
  await st().setJSON(`s/${s.id}`, s);
  return s;
}
// Sala de grupo de un encuentro de la Comunidad (una por encuentro).
export async function salaDeEncuentro(e) {
  const id = "enc-" + String(e.id).replace(/[^\w-]/g, "").slice(0, 30);
  let s = await st().get(`s/${id}`, { type: "json" });
  const datos = { nombre: e.tema || "Encuentro de la Comunidad", servicio: "Encuentro de la Comunidad", fecha: e.fecha, hora: e.hora };
  if (!s) s = { id, llave: nuevaLlave(), tipo: "grupo", encuentro: e.id, apellido: "", email: "", telefono: "", ficha: "", duracion: 40, max: 50, notas: "", creada: deps.ahora().toISOString(), ...datos };
  else if (s.fecha !== e.fecha || s.hora !== e.hora || s.nombre !== datos.nombre) { if (s.room && s.fecha !== e.fecha) { await borrarSalaDaily(s); s.room = ""; s.url = ""; s.exp = 0; } Object.assign(s, datos); delete s.terminada; }
  await st().setJSON(`s/${s.id}`, s);
  return s;
}
