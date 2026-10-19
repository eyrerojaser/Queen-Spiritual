import { deps, json, manejar, origen, Fallo, NOMBRES_CONTENIDO } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { ESQUEMAS } from "../lib/esquemas.mjs";

export default manejar(async (req) => {
  await requireAdmin(req);
  const n = new URL(req.url).searchParams.get("n");
  if (!NOMBRES_CONTENIDO.includes(n)) throw new Fallo(404, "No existe.");
  if (req.method === "GET") return json(await deps.contenido(origen(req), n));
  if (req.method !== "PUT") throw new Fallo(405, "Método no permitido.");
  const cuerpo = await req.json().catch(() => null);
  if (!cuerpo || typeof cuerpo !== "object") throw new Fallo(400, "No se pudo leer lo que enviaste.");
  const limpio = ESQUEMAS[n](cuerpo);
  await deps.store("contenido").setJSON(`c/${n}`, limpio);
  return json(limpio);
});
export const config = { path: "/api/panel/contenido" };
