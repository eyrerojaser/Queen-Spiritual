// Recibe cada visita de la página (anónima: sin nombre, sin correo, sin cookies).
import crypto from "node:crypto";
import { deps, texto } from "../lib/comun.mjs";
import { est, fuente } from "../lib/estadisticas.mjs";
import { ahoraLocal } from "../lib/comun.mjs";

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor/i;
const EVENTOS = ["vista", "producto", "carrito", "reservar", "registro"];
const ok = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export default async (req) => {
  try {
    if (req.method !== "POST") return ok();
    if (BOTS.test(req.headers.get("user-agent") || "")) return ok();
    const b = JSON.parse((await req.text()).slice(0, 2000) || "{}");
    const e = EVENTOS.includes(b.e) ? b.e : "vista";
    const p = texto(b.p, 80);
    if (!/^\/[\w\-./]*$/.test(p) || p.startsWith("/admin") || p.startsWith("/api")) return ok();
    let ref = ""; try { const u = new URL(String(b.r || "")); if (u.host !== new URL(req.url).host) ref = u.host; } catch {}
    const h = { e, p, v: texto(b.v, 24).replace(/[^\w-]/g, ""), d: b.d === "m" ? "m" : "d", x: texto(b.x, 120) };
    if (e === "vista" && b.n) h.f = fuente(ref, b.u); // solo la primera página de la visita cuenta la fuente
    const ahora = deps.ahora();
    await est().setJSON(`h/${ahoraLocal(ahora).fecha}/${ahora.toISOString().replace(/[:.]/g, "-")}_${crypto.randomBytes(3).toString("hex")}`, h);
  } catch (e) { console.error("visita", e.message); }
  return ok();
};
export const config = { path: "/api/v" };
