// Panel: manda un correo de prueba y explica en palabras sencillas por qué falla (si falla).
import { deps, json, manejar, Fallo, texto } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";
import { avisosDeps, plantilla, nombreNegocio } from "../lib/avisos.mjs";

function explicar(msg) {
  const m = String(msg || "");
  if (/535|BadCredentials|Username and Password not accepted|Invalid login/i.test(m)) return "Google no aceptó el correo o la contraseña de aplicación. Revisa que GMAIL_USER sea exactamente tu Gmail y que GMAIL_APP_PASSWORD sea el código de 16 letras de “Contraseñas de aplicaciones” (no tu contraseña normal). Si no estás segura, crea un código nuevo y reemplázalo.";
  if (/534|Application-specific password required|WebLoginRequired/i.test(m)) return "Google pide una contraseña de aplicación. Activa la verificación en 2 pasos y crea el código en myaccount.google.com/apppasswords.";
  if (/ETIMEDOUT|ECONNECTION|ESOCKET|ENOTFOUND|EAI_AGAIN|timeout/i.test(m)) return "No se pudo conectar con Gmail en ese momento. Espera un minuto y vuelve a probar.";
  if (/Invalid recipient|recipient/i.test(m)) return "El correo de destino no es válido. Revisa AVISOS_EMAIL o GMAIL_USER.";
  return "Gmail respondió con un error. Mándale a Claude este mensaje para revisarlo.";
}

export default manejar(async (req) => {
  await requireAdmin(req);
  if (req.method === "GET") return json({ log: (await deps.store("panel").get("correos-log", { type: "json" })) || [] });
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const gu = process.env.GMAIL_USER || "", gp = process.env.GMAIL_APP_PASSWORD || "", rk = process.env.RESEND_API_KEY || "", aviso = process.env.AVISOS_EMAIL || "";
  const estado = {
    GMAIL_USER: gu ? gu.replace(/^(.{3}).*(@.*)$/, "$1…$2") : "", GMAIL_APP_PASSWORD: gp ? `${gp.replace(/\s+/g, "").length} letras` : "",
    AVISOS_EMAIL: aviso || "", RESEND_API_KEY: rk ? "sí" : "",
  };
  if (!(gu && gp) && !rk) return json({ ok: false, estado, mensaje: !gu && !gp ? "Netlify no tiene las variables GMAIL_USER ni GMAIL_APP_PASSWORD. Agrégalas en Site configuration → Environment variables y haz Trigger deploy." : `Falta ${!gu ? "GMAIL_USER" : "GMAIL_APP_PASSWORD"} en Netlify. Agrégala y haz Trigger deploy.` });
  if (gp && gp.replace(/\s+/g, "").length !== 16) estado.aviso = "La contraseña de aplicación de Google tiene 16 letras. La que pusiste tiene otro largo: revisa que hayas copiado el código completo.";
  if (gu && !/^[^@\s]+@(gmail|googlemail)\.com$/i.test(gu.trim()) && !rk) estado.aviso = (estado.aviso ? estado.aviso + " " : "") + "GMAIL_USER debe ser una dirección @gmail.com completa.";
  const b = await req.json().catch(() => ({})), otro = texto(b.para, 120).toLowerCase();
  if (otro && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(otro)) return json({ ok: false, estado, mensaje: "Escribe un correo válido para la prueba." });
  const para = otro || aviso || gu;
  const negocio = await nombreNegocio();
  try {
    const ok = await avisosDeps.enviarCorreo({ to: para, subject: "✅ Prueba de correo de tu página", text: "¡Funciona! Tu página ya puede mandar correos.", html: plantilla({ negocio, titulo: "¡Funciona! ✅", parrafos: ["Tu página ya puede mandar correos: bienvenidas, reservas, compras, recordatorios y avisos de la comunidad."] }), nombre: negocio });
    if (!ok) return json({ ok: false, estado, mensaje: "El servicio de correo no aceptó el envío. Revisa las variables." });
    return json({ ok: true, estado, para, mensaje: `Correo de prueba enviado a ${para}. Revisa también Spam y Promociones.` });
  } catch (e) {
    return json({ ok: false, estado, mensaje: explicar(e && e.message), tecnico: String((e && e.message) || "").slice(0, 300) });
  }
});
export const config = { path: "/api/panel/probar-correo" };
