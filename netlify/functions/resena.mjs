// Formulario público "Deja tu reseña": la reseña (y su foto, si la mandan) queda esperando que la apruebes en el panel.
import crypto from "node:crypto";
import { deps, json, manejar, origen, texto, Fallo } from "../lib/comun.mjs";
import { avisarme } from "../lib/avisos.mjs";

export const TIPOS_RESENA = ["Arreglos", "Lecturas"];
const MAX_FOTO = 3 * 1024 * 1024;

export default manejar(async (req, ctx) => {
  if (req.method !== "POST") throw new Fallo(405, "Método no permitido.");
  const b = await req.json().catch(() => ({}));
  if (texto(b.web, 50)) return json({ ok: true }); // casilla trampa para robots

  // Máximo 4 reseñas por hora desde la misma conexión.
  const ip = (ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip") || "?";
  const st = deps.store("reservas"), kIp = "limite/res-" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
  const lim = (await st.get(kIp, { type: "json" })) || { n: 0, desde: Date.now() };
  const vigente = Date.now() - lim.desde < 3600e3;
  if (vigente && lim.n >= 4) throw new Fallo(429, "Ya enviaste varias reseñas. Intenta de nuevo en una hora.");

  const r = {
    nombre: texto(b.nombre, 80), tipo: TIPOS_RESENA.includes(b.tipo) ? b.tipo : "Arreglos",
    estrellas: ["5", "4", "3", "2", "1"].includes(String(b.estrellas)) ? String(b.estrellas) : "5",
    texto: texto(b.texto, 1200), foto: "",
  };
  if (!r.nombre) throw new Fallo(400, "Escribe tu nombre.");
  if (r.texto.length < 5) throw new Fallo(400, "Cuéntame un poquito de tu experiencia.");

  if (b.foto) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.foto));
    if (!m) throw new Fallo(415, "Esa foto no se pudo leer. Prueba con otra.");
    const buf = Buffer.from(m[1], "base64");
    if (buf.length > MAX_FOTO) throw new Fallo(413, "La foto es demasiado grande.");
    if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Fallo(415, "Esa foto no se pudo leer. Prueba con otra.");
    const id = crypto.randomUUID();
    await deps.store("archivos").set(`img/${id}`, buf, { metadata: { tipo: "image/jpeg" } });
    r.foto = `/img/${id}`;
  }

  const creada = deps.ahora().toISOString();
  await st.setJSON(`res/${creada.replace(/[:.]/g, "-")}_${crypto.randomBytes(4).toString("hex")}`, { ...r, creada });
  await st.setJSON(kIp, vigente ? { n: lim.n + 1, desde: lim.desde } : { n: 1, desde: Date.now() });
  await avisarme({ titulo: `⭐ Nueva reseña (${r.tipo})`, cuerpo: `${r.nombre} · ${"★".repeat(+r.estrellas)}${r.foto ? " · con foto" : ""}\n${r.texto.slice(0, 200)}\nApruébala en tu panel para que salga en la página.`, url: "/admin/#/resenas", origen: origen(req) });
  return json({ ok: true });
});
export const config = { path: "/api/resena" };
