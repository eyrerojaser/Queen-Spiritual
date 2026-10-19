import { deps, json, manejar, origen, ahoraLocal, reservasDesde, calcularDisponibilidad } from "../lib/comun.mjs";

export default manejar(async (req) => {
  const cfg = await deps.contenido(origen(req), "horario");
  if (cfg.reservasActivas === false) return json({ activas: false, dias: [] });
  const ahora = ahoraLocal();
  const ocupadas = new Set((await reservasDesde(deps.store(), ahora.fecha)).map((r) => r.clave));
  return json({ activas: true, zona: "hora de Texas", dias: calcularDisponibilidad(cfg, ocupadas, ahora) });
});
export const config = { path: "/api/disponibilidad" };
