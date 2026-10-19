// Le dice a Google qué páginas mirar y dónde está el mapa del sitio.
import { manejar, origen } from "../lib/comun.mjs";
export default manejar(async (req) => new Response(
  `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nDisallow: /gracias.html\nDisallow: /cita.html\n\nSitemap: ${origen(req)}/sitemap.xml\n`,
  { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } }));
export const config = { path: "/robots.txt" };
