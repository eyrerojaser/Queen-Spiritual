// La clienta entra a su sala con su enlace único (solo ve la videollamada).
import { json, manejar, texto, Fallo } from "../lib/comun.mjs";
import { st, tokenDaily, igual, estadoSala, asegurarRoom } from "../lib/sala.mjs";
import { limite } from "../lib/comunidad.mjs";

export default manejar(async (req, ctx) => {
  if (req.method !== "GET") throw new Fallo(405, "Método no permitido.");
  await limite((ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip"), "sala", 40);
  const u = new URL(req.url), id = texto(u.searchParams.get("s"), 40), k = texto(u.searchParams.get("k"), 60);
  const s = /^[\w-]{6,40}$/.test(id) ? await st().get(`s/${id}`, { type: "json" }) : null;
  if (!s || !k || !igual(k, s.llave)) throw new Fallo(404, "Este enlace no es válido. Revisa que lo copiaste completo.");
  const estado = estadoSala(s);
  if (estado !== "activa") throw new Fallo(410, estado === "terminada" ? "Esta sesión ya terminó. ¡Gracias por tu visita! 💛" : "Este enlace ya venció. Escríbeme para darte uno nuevo.");
  const grupo = s.tipo === "grupo";
  const base = { nombre: s.nombre, servicio: s.servicio, fecha: s.fecha, hora: s.hora, grupo };
  if (!u.searchParams.get("entrar")) return json(base);
  const quien = grupo ? texto(u.searchParams.get("nombre"), 60) : `${s.nombre} ${s.apellido || ""}`.trim();
  if (grupo && !quien) throw new Fallo(400, "Escribe tu nombre para entrar.");
  await asegurarRoom(s);
  return json({ ...base, url: s.url, token: await tokenDaily(s, { duena: false, nombre: quien }) });
});
export const config = { path: "/api/sala" };
