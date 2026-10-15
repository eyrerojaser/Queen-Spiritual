/* Calendario de mes completo (página pública y panel).
   Mes({ min, max, mesInicial, tipo(fecha) -> "libre" | "lleno" | "bloqueado" | "fuera" | "normal" | "extra",
         seleccion(fecha) -> bool, alTocar(fecha), nota(fecha) -> texto corto opcional })
   Devuelve { el, pintar() }. Las fechas son "AAAA-MM-DD". La semana empieza en lunes. */
(function () {
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
  const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const mk = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  window.Mes = function (o) {
    const hoy = new Date();
    const ini = (o.mesInicial || o.min || iso(hoy.getFullYear(), hoy.getMonth(), 1)).split("-").map(Number);
    let y = ini[0], m = ini[1] - 1;
    const tope = (f) => f ? f.slice(0, 7) : null;
    const el = mk("div", "mes");
    function pintar() {
      el.replaceChildren();
      const cab = mk("div", "mes-cab");
      const ant = mk("button", "mes-flecha", "‹"), sig = mk("button", "mes-flecha", "›");
      ant.type = sig.type = "button"; ant.setAttribute("aria-label", "Mes anterior"); sig.setAttribute("aria-label", "Mes siguiente");
      const actual = iso(y, m, 1).slice(0, 7);
      ant.disabled = !!(o.min && actual <= tope(o.min)); sig.disabled = !!(o.max && actual >= tope(o.max));
      ant.onclick = () => { m--; if (m < 0) { m = 11; y--; } pintar(); };
      sig.onclick = () => { m++; if (m > 11) { m = 0; y++; } pintar(); };
      const tit = mk("div", "mes-tit", `${MESES[m]} ${y}`); tit.setAttribute("aria-live", "polite");
      cab.append(ant, tit, sig);
      const grid = mk("div", "mes-grid"); grid.setAttribute("role", "grid");
      DIAS.forEach((d) => grid.append(mk("div", "mes-dsem", d)));
      const primero = (new Date(y, m, 1).getDay() + 6) % 7, total = new Date(y, m + 1, 0).getDate();
      for (let i = 0; i < primero; i++) grid.append(mk("div", "mes-vacio"));
      const hoyIso = iso(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
      for (let d = 1; d <= total; d++) {
        const f = iso(y, m, d), fuera = (o.min && f < o.min) || (o.max && f > o.max);
        const tipo = fuera ? "fuera" : (o.tipo ? o.tipo(f) : "libre");
        const b = mk("button", "mes-dia t-" + tipo);
        b.type = "button";
        b.append(mk("span", "n", d));
        const nota = o.nota && !fuera ? o.nota(f) : "";
        if (nota) b.append(mk("span", "pt", nota));
        if (f === hoyIso) b.classList.add("hoy");
        const sel = o.seleccion ? o.seleccion(f) : false;
        b.setAttribute("aria-pressed", String(!!sel));
        const ds = (new Date(y, m, d).getDay() + 6) % 7;
        b.setAttribute("aria-label", `${DIAS_LARGOS[ds]} ${d} de ${MESES[m].toLowerCase()}` + ({ lleno: ", sin espacios", bloqueado: ", no disponible", fuera: ", no disponible" }[tipo] || ""));
        const tocable = o.todosTocables ? !fuera : (tipo === "libre" || tipo === "extra" || tipo === "normal");
        if (!tocable) b.disabled = true; else b.onclick = () => { o.alTocar && o.alTocar(f); pintar(); };
        grid.append(b);
      }
      el.append(cab, grid);
      if (o.leyenda) el.append(o.leyenda);
    }
    pintar();
    return { el, pintar, ir: (f) => { const p = f.split("-").map(Number); y = p[0]; m = p[1] - 1; pintar(); } };
  };
})();
