// "Administrar mi cita": el cliente ve, cancela o cambia su cita con el enlace privado de su correo.
import { deps, json, manejar, origen, texto, Fallo, ahoraLocal, reservasDesde, calcularDisponibilidad, clave, fechaBonita, horaBonita, diasParaCita, politica, textoPolitica } from "../lib/comun.mjs";
import { avisarme, correoCita } from "../lib/avisos.mjs";

async function buscar(st, token) {
  if (!/^[\w-]{20,40}$/.test(token)) throw new Fallo(404, "Este enlace no es válido.");
  const idx = await st.get(`tok/${token}`, { type: "json" });
  const r = idx && (await st.get(idx.clave, { type: "json" }));
  if (!r || r.token !== token) throw new Fallo(404, "No encontré tu cita. Si crees que es un error, contáctame.");
  return { r, k: idx.clave };
}
function estadoDe(r, cfg) {
  const { dias, cambiosMax } = politica(cfg);
  const faltan = diasParaCita(r.fecha);
  const activa = r.estado === "pagada" && faltan >= 0;
  return {
    activa, faltan,
    reembolsable: activa && faltan >= dias,
    puedeCambiar: activa && faltan >= dias && (r.cambios || 0) < cambiosMax,
    cambiosRestantes: Math.max(0, cambiosMax - (r.cambios || 0)),
  };
}
const publica = (r, e, cfg) => ({
  nombre: r.nombre, lectura: r.lectura, fecha: r.fecha, hora: r.hora, fechaBonita: fechaBonita(r.fecha), horaBonita: horaBonita(r.hora),
  precio: r.precio, estado: r.estado, reembolso: r.reembolso || 0, politica: textoPolitica(cfg), ...e,
});

export default manejar(async (req) => {
  const o = origen(req), st = deps.store("reservas"), cfg = await deps.contenido(o, "horario");
  if (req.method === "GET") {
    const u = new URL(req.url), { r } = await buscar(st, texto(u.searchParams.get("t"), 60));
    const e = estadoDe(r, cfg);
    const out = publica(r, e, cfg);
    if (e.puedeCambiar) {
      const ahora = ahoraLocal(), ocupadas = new Set((await reservasDesde(st, ahora.fecha)).map((x) => x.clave));
      out.dias = calcularDisponibilidad(cfg, ocupadas, ahora);
    }
    return json(out);
  }
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  const { r, k } = await buscar(st, texto(b.t, 60));
  const e = estadoDe(r, cfg);
  if (!e.activa) throw new Fallo(409, r.estado === "cancelada" ? "Esta cita ya está cancelada." : "Esta cita ya pasó.");

  if (b.accion === "cancelar") {
    let reembolso = 0;
    if (e.reembolsable && r.pago && r.precio > 0) {
      await deps.stripe().refunds.create({ payment_intent: r.pago, reason: "requested_by_customer" });
      reembolso = r.precio;
    }
    const kc = `cancelada/${Date.now()}_${k.slice(2)}`;
    const final = { ...r, estado: "cancelada", cancelada: deps.ahora().toISOString(), canceladaPor: "cliente", reembolso };
    await st.setJSON(kc, final);
    await st.setJSON(`tok/${r.token}`, { clave: kc });
    await st.setJSON(`ses/${r.sesion}`, { clave: kc });
    await st.delete(k);
    await Promise.all([
      avisarme({ titulo: "❌ Cita cancelada", cuerpo: `${r.nombre} canceló su cita del ${fechaBonita(r.fecha)} a las ${horaBonita(r.hora)}. ${reembolso ? `Se le devolvieron $${reembolso}.` : "Sin reembolso (mismo día)."}`, url: "/admin/#/reservas", origen: o }),
      correoCita("cancelada", final, { origen: o, reembolso }),
    ]);
    return json({ ok: true, estado: "cancelada", reembolso });
  }

  if (b.accion === "cambiar") {
    if (!e.puedeCambiar) throw new Fallo(409, e.cambiosRestantes ? "Ya no se puede cambiar esta cita en línea. Contáctame, por favor." : "Ya cambiaste esta cita las veces permitidas. Contáctame, por favor.");
    const fecha = texto(b.fecha, 10), hora = texto(b.hora, 5);
    const ahora = ahoraLocal(), ocupadas = new Set((await reservasDesde(st, ahora.fecha)).map((x) => x.clave));
    if (!calcularDisponibilidad(cfg, ocupadas, ahora).some((d) => d.fecha === fecha && d.horas.some((h) => h.hora === hora))) throw new Fallo(409, "Ese horario ya no está disponible. Elige otro, por favor.");
    const nk = clave(fecha, hora);
    const nueva = { ...r, fecha, hora, cambios: (r.cambios || 0) + 1, historial: [...(r.historial || []), { de: `${r.fecha} ${r.hora}`, en: deps.ahora().toISOString() }] };
    const w = await st.setJSON(nk, nueva, { onlyIfNew: true });
    if (w && w.modified === false) throw new Fallo(409, "Alguien acaba de tomar ese horario. Elige otro, por favor.");
    await st.setJSON(`tok/${r.token}`, { clave: nk });
    await st.setJSON(`ses/${r.sesion}`, { clave: nk });
    await st.delete(k);
    await Promise.all([
      avisarme({ titulo: "🔁 Cita cambiada", cuerpo: `${r.nombre} cambió su cita del ${fechaBonita(r.fecha)} ${horaBonita(r.hora)} al ${fechaBonita(fecha)} a las ${horaBonita(hora)}.`, url: "/admin/#/reservas", origen: o }),
      correoCita("cambiada", nueva, { origen: o }),
    ]);
    return json({ ok: true, ...publica(nueva, estadoDe(nueva, cfg), cfg) });
  }
  throw new Fallo(400, "Acción no válida.");
});
export const config = { path: "/api/cita" };
