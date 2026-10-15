// La página pública lee aquí su información (lo que guardas en el panel).
import { deps, json, manejar, origen, Fallo, NOMBRES_CONTENIDO } from "../lib/comun.mjs";

export default manejar(async (req) => {
  const n = new URL(req.url).searchParams.get("n");
  if (!NOMBRES_CONTENIDO.includes(n)) throw new Fallo(404, "No existe.");
  return json(await deps.contenido(origen(req), n));
});
export const config = { path: "/api/contenido" };
