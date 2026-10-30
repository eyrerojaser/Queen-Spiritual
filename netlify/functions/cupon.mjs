// Para ver el descuento antes de pagar (el precio final siempre lo vuelve a calcular el servidor al reservar).
import { deps, json, manejar, origen, texto, slug, Fallo } from "../lib/comun.mjs";
import { aplicarCupon } from "../lib/cupones.mjs";
import { limite } from "../lib/comunidad.mjs";

export default manejar(async (req, ctx) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  await limite((ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip"), "cupon", 25);
  const b = await req.json().catch(() => ({})), o = origen(req);
  const { lecturas = [] } = await deps.contenido(o, "lecturas");
  const l = lecturas.find((x) => x && x.visible !== false && slug(x.nombre) === b.lectura);
  if (!l) throw new Fallo(400, "Esa lectura no está disponible.");
  const c = await aplicarCupon(o, texto(b.codigo, 40), texto(b.email, 120), Number(l.precio));
  if (!c) throw new Fallo(400, "Escribe el código del cupón.");
  return json(c);
});
export const config = { path: "/api/cupon" };
