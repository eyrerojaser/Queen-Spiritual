// Registro gratis a la Comunidad Queen Spiritual: nombre, apellido, correo y teléfono.
import { deps, json, manejar, origen, texto, Fallo } from "../lib/comun.mjs";
import { avisarme } from "../lib/avisos.mjs";
import { st, claveMiembro, correoValido, correoListo, cookieMiembro, enlaceEntrada, correoMiembro, limite, publico } from "../lib/comunidad.mjs";

export default manejar(async (req, ctx) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const o = origen(req);
  const cfg = await deps.contenido(o, "comunidad");
  if (cfg.registroAbierto === false) throw new Fallo(409, "Por ahora el registro está cerrado. Vuelve pronto.");
  const b = await req.json().catch(() => ({}));
  if (texto(b.web, 50)) return json({ ok: true });
  const m = {
    nombre: texto(b.nombre, 60), apellido: texto(b.apellido, 60), email: texto(b.email, 120).toLowerCase(),
    telefono: texto(b.telefono, 30).replace(/[^\d+]/g, ""),
  };
  if (!m.nombre || !m.apellido) throw new Fallo(400, "Escribe tu nombre y apellido.");
  if (!correoValido(m.email)) throw new Fallo(400, "Escribe un correo válido.");
  if (m.telefono.replace(/\D/g, "").length < 10) throw new Fallo(400, "Escribe tu teléfono con código de área.");
  if (b.acepta !== true) throw new Fallo(400, "Para unirte, marca que aceptas recibir los correos de la comunidad.");
  await limite((ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip"), "reg", 5);

  const clave = claveMiembro(m.email), s = st();
  const ahora = deps.ahora().toISOString();
  const r = await s.setJSON(clave, { ...m, creado: ahora, ultimo: ahora, avisos: true, bloqueado: false }, { onlyIfNew: true });
  if (r && r.modified === false) {
    const ya = await s.get(clave, { type: "json" });
    if (ya && ya.bloqueado) throw new Fallo(403, "Ese correo no puede entrar a la comunidad. Escríbeme si crees que es un error.");
    if (!correoListo()) throw new Fallo(409, "Ese correo ya es miembro. Toca “Entrar” para entrar a la comunidad.");
    const link = await enlaceEntrada(clave, o);
    await correoMiembro(ya, { asunto: "Tu enlace para entrar a la Comunidad", titulo: `Hola, ${ya.nombre}`, parrafos: ["Ya eras parte de la Comunidad Queen Spiritual. Toca el botón para entrar (el enlace dura 30 minutos)."], boton: { texto: "Entrar a la comunidad", url: link } });
    throw new Fallo(409, "Ese correo ya es miembro. Te mandé un enlace a tu correo para entrar.");
  }
  await correoMiembro(m, {
    asunto: "¡Bienvenida a la Comunidad Queen Spiritual! 🌙", titulo: `¡Bienvenida, ${m.nombre}!`,
    parrafos: [texto(cfg.bienvenida, 1200) || "Gracias por unirte. Aquí vas a encontrar videos, fotos y enseñanzas, y nos vemos en los encuentros por Zoom cada 15 días.", "Para entrar desde otro teléfono o computadora, solo escribe tu correo en la página de la comunidad y te llega un enlace."],
    boton: { texto: "Ir a la comunidad", url: `${o}/comunidad.html` },
  });
  await avisarme({ titulo: "🌙 Nuevo miembro en la Comunidad", cuerpo: `${m.nombre} ${m.apellido} · ${m.email} · ${m.telefono}`, url: "/admin/#/miembros", origen: o });
  return new Response(JSON.stringify({ ok: true, miembro: publico(m) }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": await cookieMiembro(clave) } });
});
export const config = { path: "/api/comunidad/registro" };
