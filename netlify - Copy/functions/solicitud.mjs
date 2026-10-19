// Formulario "Solicitar un arreglo": guarda la solicitud para verla en el panel (cuadro Solicitudes).
import crypto from "node:crypto";
import { deps, json, manejar, origen, texto, Fallo, ahoraLocal, minutos, fechaBonita } from "../lib/comun.mjs";
import { avisarme } from "../lib/avisos.mjs";

export const TIPOS = ["Arreglo floral", "Centro de mesa", "Montaje de mesa", "Otra consulta"];
const CONTACTO = ["Llamada", "Mensaje de texto", "Correo", "WhatsApp"];

export default manejar(async (req, ctx) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const o = origen(req);
  const cfg = await deps.contenido(o, "solicitudes");
  if (cfg.activo === false) throw new Fallo(409, "Por ahora no estoy tomando solicitudes. Vuelve pronto.");
  const b = await req.json().catch(() => ({}));
  if (texto(b.web, 50)) return json({ ok: true }); // casilla trampa para robots

  // Máximo 6 solicitudes por hora desde la misma conexión.
  const ip = (ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip") || "?";
  const st = deps.store("reservas"), kIp = "limite/" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
  const lim = (await st.get(kIp, { type: "json" })) || { n: 0, desde: Date.now() };
  const vigente = Date.now() - lim.desde < 3600e3;
  if (vigente && lim.n >= 6) throw new Fallo(429, "Ya enviaste varias solicitudes. Intenta de nuevo en una hora.");

  const sol = {
    tipo: TIPOS.includes(b.tipo) ? b.tipo : "Arreglo floral",
    referencia: texto(b.referencia, 120), ocasion: texto(b.ocasion, 160), fecha: texto(b.fecha, 10),
    cantidad: Math.min(500, Math.max(0, parseInt(b.cantidad, 10) || 0)), detalles: texto(b.detalles, 1500), presupuesto: texto(b.presupuesto, 60),
    entrega: b.entrega === "entrega" ? "entrega" : "recoger", lugar: texto(b.lugar, 300),
    nombre: texto(b.nombre, 60), apellido: texto(b.apellido, 60), email: texto(b.email, 120).toLowerCase(),
    telefono: texto(b.telefono, 30).replace(/[^\d+]/g, ""), contacto: CONTACTO.includes(b.contacto) ? b.contacto : "Llamada",
  };
  if (!sol.nombre || !sol.apellido) throw new Fallo(400, "Escribe tu nombre y apellido.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sol.email)) throw new Fallo(400, "Escribe un correo válido.");
  if (sol.telefono.replace(/\D/g, "").length < 10) throw new Fallo(400, "Escribe tu teléfono con código de área.");
  if (sol.tipo === "Otra consulta") { if (!sol.detalles) throw new Fallo(400, "Cuéntame tu consulta."); }
  else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sol.fecha)) throw new Fallo(400, "Elige la fecha de tu evento.");
    const hoy = ahoraLocal(), dias = (minutos(sol.fecha) - minutos(hoy.fecha)) / 1440;
    const min = Math.max(0, parseInt(cfg.anticipacionDias, 10) || 0);
    if (dias < min) throw new Fallo(400, min ? `Necesito al menos ${min} día${min === 1 ? "" : "s"} para preparar tu pedido. Elige una fecha más adelante.` : "Elige una fecha de hoy en adelante.");
    if (dias > 730) throw new Fallo(400, "Elige una fecha dentro de los próximos dos años.");
    if ((cfg.cerrados || []).some((c) => c && String(c.fecha).slice(0, 10) === sol.fecha)) throw new Fallo(409, "Ese día no tengo disponibilidad. Elige otra fecha, por favor.");
    if (sol.entrega === "entrega" && !sol.lugar) throw new Fallo(400, "Escribe la dirección o el lugar del evento.");
  }
  if (sol.tipo === "Otra consulta") { sol.fecha = ""; sol.entrega = ""; }

  const creada = deps.ahora().toISOString();
  const clave = `sol/${creada.replace(/[:.]/g, "-")}_${crypto.randomBytes(4).toString("hex")}`;
  await st.setJSON(clave, { ...sol, estado: "nueva", creada, nota: "" });
  await st.setJSON(kIp, vigente ? { n: lim.n + 1, desde: lim.desde } : { n: 1, desde: Date.now() });
  await avisarme({ titulo: `🌻 Nueva solicitud: ${sol.tipo}`, cuerpo: `${sol.nombre} ${sol.apellido}${sol.fecha ? " · para el " + fechaBonita(sol.fecha) : ""}${sol.ocasion ? " · " + sol.ocasion : ""}${sol.detalles ? "\n" + sol.detalles.slice(0, 200) : ""}`, url: "/admin/#/solicitudes", origen: o });
  return json({ ok: true, fecha: sol.fecha ? fechaBonita(sol.fecha) : "" });
});
export const config = { path: "/api/solicitud" };
