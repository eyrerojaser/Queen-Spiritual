// Entrar a la comunidad sin contraseña: escribes tu correo y te llega un enlace.
// Si el correo de la página todavía no está configurado, se entra con correo + teléfono.
import { deps, json, manejar, origen, texto, Fallo } from "../lib/comun.mjs";
import { st, claveMiembro, correoValido, correoListo, cookieMiembro, cookieSalir, enlaceEntrada, usarEnlace, correoMiembro, limite } from "../lib/comunidad.mjs";

const conCookie = (cuerpo, cookie, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": cookie } });

export default manejar(async (req, ctx) => {
  const o = origen(req), s = st();
  if (req.method === "GET") {
    const clave = await usarEnlace(new URL(req.url).searchParams.get("t"));
    const m = clave && await s.get(clave, { type: "json" });
    if (!m || m.bloqueado) return new Response(null, { status: 302, headers: { location: "/comunidad.html?enlace=vencido", "cache-control": "no-store" } });
    await s.setJSON(clave, { ...m, ultimo: deps.ahora().toISOString() });
    return new Response(null, { status: 302, headers: { location: "/comunidad.html", "set-cookie": await cookieMiembro(clave), "cache-control": "no-store" } });
  }
  if (req.method === "DELETE") return conCookie({ ok: true }, cookieSalir());
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  const email = texto(b.email, 120).toLowerCase();
  if (!correoValido(email)) throw new Fallo(400, "Escribe tu correo.");
  await limite((ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip"), "entrar", 8, 30);
  const clave = claveMiembro(email), m = await s.get(clave, { type: "json" });
  if (!m) throw new Fallo(404, "No encontré ese correo en la comunidad. Revisa cómo lo escribiste o regístrate gratis.");
  if (m.bloqueado) throw new Fallo(403, "Ese correo no puede entrar a la comunidad. Escríbeme si crees que es un error.");
  if (correoListo()) {
    const link = await enlaceEntrada(clave, o);
    const ok = await correoMiembro(m, { asunto: "Tu enlace para entrar a la Comunidad", titulo: `Hola, ${m.nombre}`, parrafos: ["Toca el botón para entrar a la Comunidad Queen Spiritual. El enlace dura 30 minutos y sirve una sola vez."], boton: { texto: "Entrar a la comunidad", url: link }, pie: "Si no pediste este enlace, ignora este correo." });
    if (ok) return json({ enviado: true });
  }
  // Sin correo configurado: se confirma con el teléfono del registro.
  const tel = texto(b.telefono, 30).replace(/\D/g, "").slice(-10);
  if (!tel) return json({ pedirTelefono: true });
  if (tel.length < 10 || tel !== String(m.telefono).replace(/\D/g, "").slice(-10)) throw new Fallo(400, "Ese teléfono no coincide con el de tu registro.");
  await s.setJSON(clave, { ...m, ultimo: deps.ahora().toISOString() });
  return conCookie({ ok: true }, await cookieMiembro(clave));
});
export const config = { path: "/api/comunidad/entrar" };
