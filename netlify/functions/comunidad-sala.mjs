// Encuentros de la Comunidad en tu sala propia: solo entran los miembros con acceso.
import { deps, json, manejar, origen, texto, Fallo, ahoraLocal } from "../lib/comun.mjs";
import { requireMiembro, leerDoc, abierta, estadoEncuentro, etiquetaEncuentro, lugarDe } from "../lib/comunidad.mjs";
import { salaDeEncuentro, asegurarRoom, tokenDaily, estadoSala } from "../lib/sala.mjs";

export default manejar(async (req) => {
  const m = await requireMiembro(req);
  if (!m.previa && !abierta(await deps.contenido(origen(req), "comunidad"))) throw new Fallo(423, "La comunidad todavía no abre.");
  const u = new URL(req.url), id = texto(u.searchParams.get("e"), 40);
  const e = (await leerDoc("encuentros", { lista: [] })).lista.find((x) => x.id === id);
  if (!e || lugarDe(e) !== "sala") throw new Fallo(404, "No encontré ese encuentro.");
  const estado = estadoEncuentro(e, ahoraLocal());
  const base = { nombre: m.nombre, tema: e.tema || "Encuentro de la Comunidad", etiqueta: etiquetaEncuentro(e), estado };
  if (!u.searchParams.get("entrar")) return json(base);
  if (estado === "proximo") throw new Fallo(409, `La sala se abre 30 minutos antes del encuentro (${etiquetaEncuentro(e)}, hora de Texas).`);
  if (estado === "pasado") throw new Fallo(410, "Este encuentro ya terminó. ¡Gracias por acompañarnos! 💛");
  const s = await salaDeEncuentro(e);
  if (estadoSala(s) === "terminada") throw new Fallo(410, "Este encuentro ya terminó. ¡Gracias por acompañarnos! 💛");
  await asegurarRoom(s);
  return json({ ...base, url: s.url, token: await tokenDaily(s, { duena: false, nombre: `${m.nombre} ${m.apellido || ""}`.trim() }) });
});
export const config = { path: "/api/comunidad/sala" };
