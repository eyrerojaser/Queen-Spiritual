// Muestra las fotos que subes desde el panel.
import { deps, manejar, Fallo } from "../lib/comun.mjs";

export default manejar(async (req, ctx) => {
  const id = (ctx && ctx.params && ctx.params.id) || new URL(req.url).pathname.split("/").pop();
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Fallo(404, "No existe.");
  const r = await deps.store("archivos").getWithMetadata(`img/${id}`, { type: "arrayBuffer" });
  if (!r || !r.data) throw new Fallo(404, "No existe.");
  return new Response(r.data, { headers: { "content-type": (r.metadata && r.metadata.tipo) || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
});
export const config = { path: "/img/:id" };
