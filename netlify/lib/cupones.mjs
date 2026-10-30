// Cupones de descuento para las lecturas (los creas en el panel > Cupones).
import crypto from "node:crypto";
import { deps, Fallo, ahoraLocal } from "./comun.mjs";

export const normCodigo = (c) => String(c || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
const huella = (email) => crypto.createHash("sha256").update("cupon|" + String(email || "").toLowerCase().trim()).digest("hex").slice(0, 24);
const r2 = (n) => Math.round(n * 100) / 100;
export const textoCupon = (c) => (c.tipo === "porcentaje" ? `${c.valor}% de descuento` : `$${Number(c.valor) % 1 ? Number(c.valor).toFixed(2) : c.valor} de descuento`);

export async function leerUsos(codigo) { return (await deps.store().get(`cuponuso/${codigo}`, { type: "json" })) || { n: 0, emails: [] }; }

// Revisa el cupón y calcula el precio final. Lanza un error claro si no sirve.
export async function aplicarCupon(o, codigoCrudo, email, precio) {
  const codigo = normCodigo(codigoCrudo);
  if (!codigo) return null;
  const { cupones = [] } = await deps.contenido(o, "cupones");
  const c = cupones.find((x) => x && x.visible !== false && x.codigo === codigo);
  if (!c) throw new Fallo(400, "Ese cupón no existe o ya no está activo. Revisa cómo lo escribiste.");
  if (c.vence && ahoraLocal().fecha > c.vence) throw new Fallo(400, "Ese cupón ya venció.");
  const u = await leerUsos(codigo);
  if (c.usosMax > 0 && u.n >= c.usosMax) throw new Fallo(400, "Ese cupón ya se usó todas las veces permitidas.");
  if (c.unoPorPersona !== false && email && u.emails.includes(huella(email))) throw new Fallo(400, "Ya usaste este cupón antes. Es de un solo uso por persona.");
  const descuento = r2(Math.min(precio, c.tipo === "porcentaje" ? (precio * c.valor) / 100 : c.valor));
  return { codigo, descuento, final: r2(precio - descuento), texto: textoCupon(c) };
}

// Se cuenta cuando la cita ya está pagada (o reservada gratis con el cupón).
export async function registrarUso(codigo, email) {
  codigo = normCodigo(codigo);
  if (!codigo) return;
  const st = deps.store(), u = await leerUsos(codigo), h = huella(email);
  await st.setJSON(`cuponuso/${codigo}`, { n: u.n + 1, emails: email && !u.emails.includes(h) ? [...u.emails, h].slice(-5000) : u.emails, ultimo: deps.ahora().toISOString() });
}
