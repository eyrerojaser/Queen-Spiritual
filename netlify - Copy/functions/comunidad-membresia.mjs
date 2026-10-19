// Membresía mensual: pagar, confirmar el pago al volver de Stripe, cancelar o reactivar.
import { deps, json, manejar, origen, texto, Fallo } from "../lib/comun.mjs";
import { avisarme } from "../lib/avisos.mjs";
import { st, requireMiembro, publico, sesionMembresia, confirmarMembresia, actualizarPago, lugares, tieneAcceso, correoMiembro } from "../lib/comunidad.mjs";

export async function avisarCambio(r, o) {
  if (!r) return;
  const { antes, despues, miembro: m } = r, nombre = `${m.nombre} ${m.apellido}`;
  const activaAhora = ["active", "trialing"].includes(despues.estado), activaAntes = antes && ["active", "trialing", "past_due"].includes(antes.estado);
  // Candado para no mandar la bienvenida dos veces (llegan el regreso de Stripe y el webhook casi a la vez).
  const primeraVez = activaAhora && !activaAntes && (await st().setJSON(`bienv/${despues.suscripcion}`, { en: new Date().toISOString() }, { onlyIfNew: true })).modified !== false;
  if (primeraVez) {
    await avisarme({ titulo: `💛 Nueva membresía: ${nombre}`, cuerpo: `${m.email} · $${despues.precio}/mes`, url: "/admin/#/miembros", origen: o });
    await correoMiembro(m, { asunto: "¡Bienvenida a la Comunidad Queen Spiritual! 🌙", titulo: `¡Bienvenida, ${m.nombre}!`, parrafos: ["Tu membresía está activa. Ya puedes entrar a las conversaciones, las enseñanzas y los encuentros por Zoom.", "Puedes cancelar cuando quieras desde tu área de miembros."], boton: o ? { texto: "Ir a la comunidad", url: `${o}/comunidad.html` } : null });
  }
  if (despues.cancelaAlFinal && !(antes && antes.cancelaAlFinal)) await avisarme({ titulo: `Membresía cancelada: ${nombre}`, cuerpo: `Sigue entrando hasta el ${despues.hasta ? new Date(despues.hasta).toLocaleDateString("es-US", { timeZone: "America/Chicago" }) : "fin de su mes"}.`, url: "/admin/#/miembros", origen: o });
  if (despues.estado === "canceled" && antes && antes.estado !== "canceled") await avisarme({ titulo: `Membresía terminada: ${nombre}`, cuerpo: `${m.email} ya no tiene membresía activa.`, url: "/admin/#/miembros", origen: o });
}

export default manejar(async (req) => {
  const o = origen(req), m = await requireMiembro(req, { sinAcceso: true });
  if (req.method === "GET") {
    const id = texto(new URL(req.url).searchParams.get("s"), 200);
    if (!/^cs_/.test(id)) throw new Fallo(400, "Pago no válido.");
    const ses = await deps.stripe().checkout.sessions.retrieve(id);
    if (!ses || (ses.metadata || {}).clave !== m.clave) throw new Fallo(403, "Ese pago no es de tu cuenta.");
    const r = await confirmarMembresia(ses);
    await avisarCambio(r, o);
    const nuevo = await st().get(m.clave, { type: "json" });
    return json({ ok: true, miembro: publico(nuevo) });
  }
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  if (b.accion === "pagar") {
    if (tieneAcceso(m)) return json({ ok: true, yaActiva: true });
    const l = await lugares(await deps.contenido(o, "comunidad"));
    if (!l.precio) throw new Fallo(409, "Por ahora la comunidad es gratis. Recarga la página.");
    if (!l.abierta) throw new Fallo(409, "La comunidad todavía no abre. Te aviso por correo el día de la apertura.");
    return json({ url: await sesionMembresia(m, m.clave, l.precio, o) });
  }
  if (b.accion === "cancelar" || b.accion === "reactivar") {
    if (!m.pago || !m.pago.suscripcion) throw new Fallo(409, "No tienes una membresía con pago.");
    const sub = await deps.stripe().subscriptions.update(m.pago.suscripcion, { cancel_at_period_end: b.accion === "cancelar" });
    const r = await actualizarPago(m.clave, sub);
    await avisarCambio(r, o);
    return json({ ok: true, miembro: publico(await st().get(m.clave, { type: "json" })) });
  }
  throw new Fallo(400, "Acción no válida.");
});
export const config = { path: "/api/comunidad/membresia" };
