// Cada hora: cuando una publicación programada sale, avisa por correo a los miembros (si lo pediste).
// Las publicaciones aparecen solas en la comunidad a su hora; esta función solo manda los avisos.
import { avisarProgramadas } from "../lib/comunidad.mjs";
export default async () => { const h = await avisarProgramadas(); if (h.length) console.log("avisos de publicaciones:", h.join(", ")); };
export const config = { schedule: "5 * * * *" };
