// Todos los días a las 8 de la mañana (Texas): recordatorios de arreglos por preparar.
// A ti: 3 días antes ("compra las flores") y 1 día antes ("prepara el arreglo").
// Al cliente: 2 días antes (con su saldo pendiente, si tiene).
import { deps, ahoraLocal, minutos, fechaBonita } from "../lib/comun.mjs";
import { avisarme, correoArreglo } from "../lib/avisos.mjs";
import { recordarEncuentros, avisarApertura } from "../lib/comunidad.mjs";

export async function enviarRecordatorios() {
  const st = deps.store("reservas"), hoy = ahoraLocal().fecha, hechos = [];
  for (const { key } of (await st.list({ prefix: "arr/" })).blobs) {
    const a = await st.get(key, { type: "json" });
    if (!a || !["confirmado", "preparando", "listo"].includes(a.estado)) continue;
    const dias = Math.round((minutos(a.fecha) - minutos(hoy)) / 1440);
    const antes = a.recordatorios || {}, r = { ...antes };
    const flores = `${(a.arreglo && a.arreglo.nombre) || "Arreglo"}${(a.lineas || []).length ? " · flores favoritas: " + a.lineas.map((l) => l.nombre).join(", ") : ""}`;
    const quien = `${a.cliente.nombre} ${a.cliente.apellido}`;
    if (dias <= 3 && dias >= 2 && !r.compra) {
      await avisarme({ titulo: `🌸 En ${dias} días: arreglo de ${quien}`, cuerpo: `Para el ${fechaBonita(a.fecha)}. Compra las flores: ${flores}.${a.saldo ? ` Saldo pendiente: $${a.saldo}.` : ""}`, url: "/admin/#/encargos" });
      r.compra = hoy; hechos.push(`compra ${key}`);
    }
    if (dias <= 2 && dias >= 1 && !r.cliente) {
      await correoArreglo("recordatorio", a, {});
      r.cliente = hoy; hechos.push(`cliente ${key}`);
    }
    if (dias === 1 && !r.prepara) {
      await avisarme({ titulo: `💐 Mañana: arreglo de ${quien}`, cuerpo: `${a.entrega === "entrega" ? `Entrega en ${a.lugar}` : "Lo recoge contigo"}. ${flores}.${a.saldo ? ` Cobra el saldo: $${a.saldo}.` : ""}`, url: "/admin/#/encargos" });
      r.prepara = hoy; hechos.push(`prepara ${key}`);
    }
    if (Object.keys(r).length !== Object.keys(antes).length) await st.setJSON(key, { ...a, recordatorios: r });
  }
  return hechos;
}

export default async () => {
  const h = await enviarRecordatorios();
  try { h.push(...(await recordarEncuentros())); } catch (e) { console.error("encuentros", e.message); }
  try { h.push(...(await avisarApertura())); } catch (e) { console.error("apertura", e.message); }
  console.log("recordatorios:", h.length ? h.join(", ") : "ninguno");
};
export const config = { schedule: "0 13 * * *" }; // 13:00 UTC = 8:00 am en Texas (horario de verano)
