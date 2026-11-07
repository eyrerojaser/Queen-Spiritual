// Muestra cada horario en la hora de quien visita la página (Florida, Texas, California…).
// Los horarios se guardan en la hora de Queen (centro, America/Chicago).
(function () {
  var BASE = "America/Chicago";
  var MI = ""; try { MI = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  var DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function off(z, ms) {
    try {
      var p = {}; new Intl.DateTimeFormat("en-US", { timeZone: z, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
      return (Date.UTC(+p.year, p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000;
    } catch (e) { return 0; }
  }
  // fecha "2026-11-14" + hora "15:00" (hora de Queen) → misma cita en la hora de quien mira
  function convertir(fecha, hora) {
    var f = String(fecha).split("-").map(Number), h = String(hora).split(":").map(Number);
    var base = Date.UTC(f[0], f[1] - 1, f[2], h[0], h[1]);
    var utc = base - off(BASE, base) * 60000; utc = base - off(BASE, utc) * 60000;
    var loc = new Date(utc + (MI ? off(MI, utc) : off(BASE, utc)) * 60000);
    return { fecha: loc.toISOString().slice(0, 10), hora: loc.toISOString().slice(11, 16), d: loc };
  }
  function bonitaHora(hhmm) { var p = hhmm.split(":").map(Number); return (p[0] % 12 || 12) + ":" + String(p[1]).padStart(2, "0") + " " + (p[0] < 12 ? "am" : "pm"); }
  function bonitaFecha(d) { return DIAS[d.getUTCDay()] + " " + d.getUTCDate() + " de " + MESES[d.getUTCMonth()]; }
  window.Hora = {
    zona: MI,
    // ¿la persona está en otra zona que Queen?
    otra: function (fecha, hora) { var x = convertir(fecha || "2026-01-15", hora || "12:00"); return x.hora !== String(hora || "12:00").slice(0, 5) || x.fecha !== (fecha || "2026-01-15"); },
    hora: function (fecha, hora) { return bonitaHora(convertir(fecha, hora).hora); },
    fecha: function (fecha, hora) { return bonitaFecha(convertir(fecha, hora).d); },
    cuando: function (fecha, hora) { var x = convertir(fecha, hora); return bonitaFecha(x.d) + " a las " + bonitaHora(x.hora); },
    // Nombre corto de la zona de quien mira: "hora de Florida", "hora del centro"…
    nombre: function () {
      var z = MI || BASE;
      var mapa = { "America/New_York": "hora del este, Florida", "America/Detroit": "hora del este", "America/Indiana/Indianapolis": "hora del este", "America/Kentucky/Louisville": "hora del este", "America/Chicago": "hora del centro", "America/Denver": "hora de la montaña", "America/Phoenix": "hora de Arizona", "America/Los_Angeles": "hora del Pacífico", "America/Puerto_Rico": "hora de Puerto Rico" };
      return mapa[z] || "tu hora";
    },
  };
})();
