// Cada hora: cuando una publicación programada sale, avisa por correo a los miembros (si lo pediste).
// Las publicaciones aparecen solas en la comunidad a su hora; esta función solo manda los avisos.
import { avisarProgramadas, recordarHoraAntes } from "../lib/comunidad.mjs";
export default async () => {
  const h = await avisarProgramadas();
  try { h.push(...(await recordarHoraAntes())); } catch (e) { console.error("encuentros 1 hora", e.message); }
  if (h.length) console.log("avisos:", h.join(", "));
};
export const config = { schedule: "5 * * * *" };
