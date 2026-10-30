// Panel: cuántas veces se ha usado cada cupón.
import { deps, json, manejar } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";

export default manejar(async (req) => {
  await requireAdmin(req);
  const st = deps.store(), usos = {};
  for (const { key } of (await st.list({ prefix: "cuponuso/" })).blobs) { const u = await st.get(key, { type: "json" }); if (u) usos[key.slice(9)] = u.n || 0; }
  return json({ usos });
});
export const config = { path: "/api/panel/cupones" };
