/* Cuenta las visitas de forma anónima para las estadísticas de tu panel (sin cookies ni datos personales). */
(function () {
  var no = false; try { no = localStorage.getItem("qsNoContar") === "1"; } catch (e) {}
  function id() {
    try { var v = localStorage.getItem("qsVisitante"); if (!v) { v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4); localStorage.setItem("qsVisitante", v); } return v; } catch (e) { return ""; }
  }
  function enviar(datos) {
    if (no) return;
    var cuerpo = JSON.stringify(datos);
    try { if (navigator.sendBeacon && navigator.sendBeacon("/api/v", new Blob([cuerpo], { type: "text/plain" }))) return; } catch (e) {}
    try { fetch("/api/v", { method: "POST", body: cuerpo, keepalive: true, headers: { "content-type": "text/plain" } }); } catch (e) {}
  }
  var movil = (window.matchMedia && matchMedia("(pointer:coarse)").matches) || innerWidth < 820;
  var base = function (e, x) { return { e: e, p: location.pathname, v: id(), d: movil ? "m" : "d", x: x || "" }; };
  window.qsEvento = function (e, x) { enviar(base(e, x)); };
  var primera = false; try { primera = !sessionStorage.getItem("qsSesion"); sessionStorage.setItem("qsSesion", "1"); } catch (e) {}
  var d = base("vista"); d.n = primera ? 1 : 0; d.r = document.referrer || ""; d.u = new URLSearchParams(location.search).get("utm_source") || "";
  enviar(d);
})();
