// Mapa del sitio para Google (tu-pagina/sitemap.xml).
import { manejar, origen } from "../lib/comun.mjs";
export const PAGINAS = [["/", "1.0"], ["/lecturas.html", "0.9"], ["/personaliza.html", "0.9"], ["/tienda.html", "0.8"], ["/politicas.html", "0.3"]];
export default manejar(async (req) => {
  const o = origen(req);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGINAS.map(([p, pr]) => `  <url><loc>${o}${p}</loc><changefreq>weekly</changefreq><priority>${pr}</priority></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
});
export const config = { path: "/sitemap.xml" };
