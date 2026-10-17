// Limpia lo que llega del panel antes de guardarlo: solo los campos conocidos, con largo y tipo correctos.
const str = (max = 200) => (v) => (v == null ? "" : String(v)).trim().slice(0, max);
const num = (min = 0, max = 1e6, def = 0) => (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : def; };
const int = (min, max, def) => (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const bool = (def = false) => (v) => (typeof v === "boolean" ? v : def);
const uno = (ops, def) => (v) => (ops.includes(v) ? v : def);
const hora = (def = "") => (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : def);
const fecha = () => (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? String(v).slice(0, 10) : "");
const url = (max = 500) => (v) => { const s = str(max)(v); return /^(https?:\/\/|\/)/i.test(s) || s === "" ? s : ""; };
const foto = () => (v) => { const s = str(300)(v); return /^\/(img\/[0-9a-f-]{36}|images\/(uploads|flores)\/[\w.-]+)$/.test(s) ? s : ""; };
const obj = (campos) => (v) => { const o = v && typeof v === "object" && !Array.isArray(v) ? v : {}; return Object.fromEntries(Object.entries(campos).map(([k, f]) => [k, f(o[k])])); };
const lista = (item, max = 300, ok = () => true) => (v) => (Array.isArray(v) ? v.slice(0, max).map(item).filter(ok) : []);
const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];

export const ESQUEMAS = {
  negocio: obj({
    nombre: str(80), titulo: str(160), frase: str(600), fotoPrincipal: foto(),
    contacto: obj({ whatsapp: str(30), telefono: str(30), instagram: str(200), tiktok: str(200), facebook: str(300), mapa: url(600), zona: str(300), enlaceResenas: url(600) }),
  }),
  arreglos: obj({
    intro: str(600),
    arreglos: lista(obj({ tipo: uno(["Arreglo floral", "Centro de mesa", "Montaje de mesa"], "Arreglo floral"), nombre: str(100), ocasion: str(160), descripcion: str(800), flores: str(500), precio: str(20), foto: foto(), visible: bool(true) }), 300, (a) => a.nombre),
  }),
  lecturas: obj({
    intro: str(800), foto: foto(), enLinea: bool(true),
    lecturas: lista(obj({ nombre: str(100), duracion: str(40), descripcion: str(800), precio: num(1, 10000, 1), visible: bool(true) }), 20, (l) => l.nombre),
  }),
  horario: obj({
    reservasActivas: bool(true), duracion: int(15, 240, 60), anticipacionDias: int(1, 120, 30), avisoHoras: int(0, 168, 12),
    cancelarDias: int(0, 30, 1), cambiosMax: int(1, 10, 2), politicaTexto: str(2000),
    semana: lista(obj({ dia: uno(DIAS, "lunes"), desde: hora(), hasta: hora() }), 50, (b) => b.desde && b.hasta && b.desde < b.hasta),
    cerrados: lista(obj({ fecha: fecha(), motivo: str(120) }), 400, (c) => c.fecha),
    especiales: lista(obj({ fecha: fecha(), desde: hora(), hasta: hora() }), 400, (e) => e.fecha && e.desde && e.hasta && e.desde < e.hasta),
  }),
  tienda: obj({
    intro: str(600),
    productos: lista(obj({
      foto: foto(), titulo: str(120), categoria: str(80), descripcion: str(1500), precio: num(1, 100000, 1),
      entrega: uno(["digital", "fisico"], "digital"), archivo: (v) => { const s = str(200)(v); return /^pdf\/[0-9a-f-]{36}$/.test(s) || /^private\/pdfs\/[^/]+\.pdf$/i.test(s) ? s : ""; },
      archivoNombre: str(200), destacado: bool(false), agotado: bool(false), visible: bool(true),
    }), 500, (p) => p.titulo),
  }),
  "tienda-ajustes": obj({
    categorias: lista(obj({ nombre: str(60) }), 50, (c) => c.nombre),
    envio: obj({
      activo: bool(false), gratisDesde: num(0, 100000, 0),
      opciones: lista(obj({ transportista: uno(["USPS", "FedEx", "UPS", "DHL", ""], "USPS"), servicio: str(60), precio: num(0, 1000, 0), dias: str(40), activo: bool(true) }), 12, (o) => o.servicio),
    }),
    recoger: obj({ activo: bool(true), texto: str(400) }),
  }),
  flores: obj({
    activo: bool(true), intro: str(600), aviso: str(400), anticipacionDias: int(0, 60, 5),
    depositoPorcentaje: int(10, 100, 50), permitirPagoTotal: bool(true),
    entrega: obj({ activo: bool(true), costo: num(0, 1000, 0), texto: str(300) }),
    recoger: obj({ activo: bool(true), texto: str(300) }),
    flores: lista(obj({ nombre: str(80), foto: foto(), visible: bool(true), agotada: bool(false) }), 200, (f) => f.nombre),
  }),
  politicas: obj({ lecturas: str(3000), envios: str(3000), arreglos: str(3000), privacidad: str(3000) }),
  solicitudes: obj({
    activo: bool(true), anticipacionDias: int(0, 90, 3), intro: str(600),
    cerrados: lista(obj({ fecha: fecha(), motivo: str(120) }), 400, (c) => c.fecha),
  }),
  comunidad: obj({
    registroAbierto: bool(true), fundadores: int(0, 100000, 50), titulo: str(120), frase: str(400), intro: str(1500), beneficios: str(1500), foto: foto(),
    bienvenida: str(1200), mensajeMiembros: str(1500),
  }),
  resenas: obj({
    resenas: lista(obj({ nombre: str(80), estrellas: uno(["5", "4", "3", "2", "1"], "5"), texto: str(1200), tipo: uno(["Arreglos", "Lecturas"], "Arreglos"), foto: foto(), fecha: fecha(), visible: bool(true) }), 300, (r) => r.texto),
  }),
};
