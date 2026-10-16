// Pone la dirección real de tu página en las etiquetas para Google y para compartir (WhatsApp, Facebook),
// y agrega el código de Google Search Console si lo guardaste en Netlify (variable GOOGLE_VERIFICACION).
export function ajustarHtml(html, origen, verificacion) {
  let out = html.replaceAll("https://SITIO", origen);
  const v = String(verificacion || "").trim();
  const codigo = (/content\s*=\s*["']([^"']+)["']/i.exec(v) || [null, v])[1].replace(/[^A-Za-z0-9_\-]/g, "");
  if (codigo && !out.includes("google-site-verification")) out = out.replace("</head>", `<meta name="google-site-verification" content="${codigo}">\n</head>`);
  return out;
}

export default async (req, context) => {
  const res = await context.next();
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const html = await res.text();
  const h = new Headers(res.headers); h.delete("content-length");
  const v = globalThis.Netlify ? Netlify.env.get("GOOGLE_VERIFICACION") : "";
  return new Response(ajustarHtml(html, new URL(req.url).origin, v), { status: res.status, headers: h });
};

export const config = { path: ["/", "/index.html", "/lecturas.html", "/personaliza.html", "/tienda.html", "/politicas.html"] };
