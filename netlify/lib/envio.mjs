// Envíos de Queen Shop: paqueterías con tarifas que pones en el panel, y los datos de quien recibe.
import { Fallo, texto, slug } from "./comun.mjs";

export const TRANSPORTISTAS = ["USPS", "FedEx", "UPS", "DHL"];
export const ESTADOS = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","PR","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

// Las opciones activas, cada una con su id. (Si solo existe el costo único de antes, se usa como "Envío".)
export function opcionesEnvio(env = {}) {
  let ops = Array.isArray(env.opciones) ? env.opciones : [];
  if (!ops.length && Number(env.costo) >= 0 && env.costo !== undefined) ops = [{ transportista: "", servicio: "Envío", precio: Number(env.costo) || 0, dias: "", activo: true }];
  return ops.filter((o) => o && o.activo !== false && texto(o.servicio || o.transportista))
    .map((o) => ({ id: slug(`${o.transportista} ${o.servicio}`) || "envio", transportista: texto(o.transportista, 20), servicio: texto(o.servicio, 60), precio: Math.max(0, Number(o.precio) || 0), dias: texto(o.dias, 40) }));
}
export const etiquetaEnvio = (o) => [o.transportista, o.servicio].filter(Boolean).join(" ") + (o.dias ? ` (${o.dias})` : "");

export function validarCliente(c, conDireccion) {
  c = c && typeof c === "object" ? c : {};
  const d = {
    nombre: texto(c.nombre, 60), apellido: texto(c.apellido, 60), email: texto(c.email, 120).toLowerCase(),
    telefono: texto(c.telefono, 30).replace(/[^\d+]/g, ""),
    direccion1: texto(c.direccion1, 120), direccion2: texto(c.direccion2, 120), ciudad: texto(c.ciudad, 60),
    estado: texto(c.estado, 2).toUpperCase(), zip: texto(c.zip, 10),
  };
  if (!d.nombre || !d.apellido) throw new Fallo(400, "Escribe tu nombre y apellido.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new Fallo(400, "Escribe un correo válido.");
  if (d.telefono.replace(/\D/g, "").length < 10) throw new Fallo(400, "Escribe tu teléfono con código de área.");
  if (conDireccion) {
    if (!d.direccion1 || !d.ciudad) throw new Fallo(400, "Escribe tu dirección y ciudad.");
    if (!ESTADOS.includes(d.estado)) throw new Fallo(400, "Elige tu estado.");
    if (!/^\d{5}(-\d{4})?$/.test(d.zip)) throw new Fallo(400, "Escribe un código postal válido (5 números).");
  } else { d.direccion1 = d.direccion2 = d.ciudad = d.estado = d.zip = ""; }
  return d;
}
export const direccionTexto = (c) => !c || !c.direccion1 ? "" :
  [`${c.nombre} ${c.apellido}`, c.direccion1, c.direccion2, `${c.ciudad}, ${c.estado} ${c.zip}`].filter(Boolean).join(" · ");
