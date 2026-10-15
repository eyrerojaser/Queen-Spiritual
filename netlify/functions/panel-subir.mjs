// Sube fotos (ya achicadas por el panel) y PDFs (en partes de hasta 4 MB, máximo 20 MB).
import crypto from "node:crypto";
import { deps, json, manejar, Fallo } from "../lib/comun.mjs";
import { requireAdmin } from "../lib/panel.mjs";

const MAX_PARTE = 4.5 * 1024 * 1024, MAX_PARTES = 5;
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
  throw new Fallo(400, "Tipo de archivo no válido.");
});
export const config = { path: "/api/panel/subir" };
