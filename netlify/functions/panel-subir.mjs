// Sube fotos (ya achicadas por el panel) y PDFs (en partes de hasta 4 MB, máximo 20 MB).
import crypto from "node:crypto";
import { deps, json, manejar, Fallo } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";

const MAX_PARTE = 4.5 * 1024 * 1024, MAX_PARTES = 5;
// Videos: partes de 4 MB exactos (la última más chica), hasta 125 partes = 500 MB
export const PARTE_VIDEO = 4 * 1024 * 1024; const MAX_PARTES_VIDEO = 125;
const FIRMAS = { "image/jpeg": [0xff, 0xd8, 0xff], "image/png": [0x89, 0x50, 0x4e, 0x47], "image/webp": [0x52, 0x49, 0x46, 0x46] };

export default manejar(async (req) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  await requireAdmin(req);
  const u = new URL(req.url), tipo = u.searchParams.get("tipo");
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) throw new Fallo(400, "El archivo está vacío.");
  if (buf.length > MAX_PARTE) throw new Fallo(413, "El archivo es demasiado grande.");
  const st = deps.store("archivos");

  if (tipo === "img") {
    const ct = (req.headers.get("content-type") || "").split(";")[0];
    const firma = FIRMAS[ct];
    if (!firma || !firma.every((b, i) => buf[i] === b)) throw new Fallo(415, "Esa imagen no se pudo leer. Usa una foto JPG o PNG.");
    const id = crypto.randomUUID();
    await st.set(`img/${id}`, buf, { metadata: { tipo: ct } });
    return json({ url: `/img/${id}` });
  }

  if (tipo === "pdf") {
    const id = u.searchParams.get("id") || "", parte = parseInt(u.searchParams.get("parte"), 10), total = parseInt(u.searchParams.get("total"), 10);
    if (!/^[0-9a-f-]{36}$/.test(id) || !(total >= 1 && total <= MAX_PARTES) || !(parte >= 0 && parte < total)) throw new Fallo(400, "El PDF es demasiado grande (máximo 20 MB) o la subida falló.");
    if (parte === 0 && buf.subarray(0, 5).toString() !== "%PDF-") throw new Fallo(415, "Ese archivo no es un PDF.");
    await st.set(`pdf/${id}/${parte}`, buf);
    if (parte < total - 1) return json({ ok: true });
    let tamano = 0;
    for (let i = 0; i < total; i++) {
      const b = await st.get(`pdf/${id}/${i}`, { type: "arrayBuffer" });
      if (!b) throw new Fallo(400, "Faltó una parte del PDF. Súbelo de nuevo.");
      tamano += b.byteLength;
    }
    const nombre = String(u.searchParams.get("nombre") || "archivo.pdf").slice(0, 200);
    await st.setJSON(`pdf/${id}/meta`, { partes: total, tamano, nombre, subido: new Date().toISOString() });
    return json({ ref: `pdf/${id}`, nombre, tamano });
  }
  if (tipo === "vid") {
    const id = u.searchParams.get("id") || "", parte = parseInt(u.searchParams.get("parte"), 10), total = parseInt(u.searchParams.get("total"), 10);
    if (!/^[0-9a-f-]{36}$/.test(id) || !(total >= 1 && total <= MAX_PARTES_VIDEO) || !(parte >= 0 && parte < total)) throw new Fallo(400, "El video es demasiado grande (máximo 500 MB) o la subida falló.");
    if (parte < total - 1 && buf.length !== PARTE_VIDEO) throw new Fallo(400, "La subida del video falló. Inténtalo de nuevo.");
    let ct = "";
    if (parte === 0) {
      if (buf.subarray(4, 8).toString() === "ftyp") ct = buf.subarray(8, 10).toString() === "qt" ? "video/quicktime" : "video/mp4";
      else if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) ct = "video/webm";
      else throw new Fallo(415, "Ese archivo no es un video que se pueda ver en la página. Usa MP4 o MOV.");
      await st.setJSON(`vid/${id}/tipo`, { tipo: ct });
    }
    await st.set(`vid/${id}/${parte}`, buf);
    if (parte < total - 1) return json({ ok: true });
    const t = await st.get(`vid/${id}/tipo`, { type: "json" });
    // Las partes se suben en orden, una tras otra: si llegó la última, llegaron todas.
    const tamano = (total - 1) * PARTE_VIDEO + buf.length;
    const meta = { partes: total, tamano, tipo: (t && t.tipo) || "video/mp4", parte: PARTE_VIDEO, subido: new Date().toISOString() };
    await st.setJSON(`vid/${id}/meta`, meta);
    return json({ ref: `vid/${id}`, tipo: meta.tipo, tamano });
  }
  throw new Fallo(400, "Tipo de archivo no válido.");
});
export const config = { path: "/api/panel/subir" };
