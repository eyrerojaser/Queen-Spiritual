/* Reseñas: tarjetas con foto y el formulario "Deja tu reseña" (lo usan la portada y la página de lecturas). */
(function () {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const s = v => (typeof v === "string" ? v.trim() : "");

  function tarjetas(lista, { max = 6 } = {}) {
    const box = el("div"), g = el("div", "reviews");
    const crear = r => {
      const n = Math.max(1, Math.min(5, parseInt(r.estrellas, 10) || 5));
      const c = el("figure", "review" + (s(r.foto) ? " con-foto" : ""));
      if (s(r.foto)) {
        const b = el("button", "rv-foto"); b.type = "button"; b.setAttribute("aria-label", "Ver foto completa");
        const im = el("img"); im.src = r.foto; im.alt = `Foto de ${s(r.nombre) || "un cliente"}`; im.loading = "lazy"; b.append(im);
        b.onclick = () => verFoto(r.foto, im.alt); c.append(b);
      }
      const cu = el("div", "rv-cuerpo");
      const st = el("div", "stars", "★".repeat(n) + "☆".repeat(5 - n)); st.setAttribute("aria-label", `${n} de 5 estrellas`);
      cu.append(st, el("blockquote", null, r.texto));
      const pie = el("figcaption"); pie.append(el("cite", null, s(r.nombre) || "Cliente"));
      if (s(r.tipo)) pie.append(el("span", "rv-tipo", r.tipo === "Lecturas" ? "Lectura de cartas" : "Arreglo"));
      cu.append(pie); c.append(cu); return c;
    };
    lista.slice(0, max).forEach(r => g.append(crear(r)));
    box.append(g);
    if (lista.length > max) {
      const mas = el("button", "btn btn-line", `Ver las ${lista.length} reseñas`); mas.type = "button"; mas.style.marginTop = "20px";
      mas.onclick = () => { lista.slice(max).forEach(r => g.append(crear(r))); mas.remove(); };
      box.append(mas);
    }
    return box;
  }

  function verFoto(src, alt) {
    const d = el("dialog", "rv-ver"); const im = el("img"); im.src = src; im.alt = alt;
    const x = el("button", "rv-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Cerrar"); x.onclick = () => d.close();
    d.append(x, im); d.addEventListener("click", e => { if (e.target === d || e.target === im) d.close(); });
    d.addEventListener("close", () => d.remove()); document.body.append(d); d.showModal();
  }

  // Achica la foto en el teléfono antes de mandarla (rápido aunque la señal sea lenta).
  async function achicar(file) {
    if (!/^image\//.test(file.type)) throw new Error("Elige una foto (JPG o PNG).");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("Esa foto no se pudo abrir. Prueba con otra.")); i.src = url; });
      const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", .82);
    } finally { URL.revokeObjectURL(url); }
  }

  function formulario({ tipo = "Arreglos", alTerminar } = {}) {
    const f = el("form", "form rv-form"); f.noValidate = true;
    const v = { tipo, estrellas: "5", foto: "" };
    const grupo = (lab, ops, clave, cls) => {
      const box = el("div"), g = el("div", cls || "seg"); g.setAttribute("role", "group"); g.setAttribute("aria-label", lab);
      ops.forEach(([val, txt, aria]) => { const b = el("button", null, txt); b.type = "button"; if (aria) b.setAttribute("aria-label", aria); b.setAttribute("aria-pressed", String(v[clave] === val)); b.onclick = () => { v[clave] = val; g.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); if (clave === "estrellas") pintarEstrellas(); }; g.append(b); });
      box.append(el("div", "lab", lab), g); return { box, g };
    };
    const t = grupo("¿Sobre qué es tu reseña?", [["Arreglos", "Un arreglo o mesa"], ["Lecturas", "Una lectura de cartas"]], "tipo");
    const e = grupo("¿Cuántas estrellas?", [["1", "★", "1 estrella"], ["2", "★", "2 estrellas"], ["3", "★", "3 estrellas"], ["4", "★", "4 estrellas"], ["5", "★", "5 estrellas"]], "estrellas", "rv-estrellas");
    const pintarEstrellas = () => e.g.querySelectorAll("button").forEach((b, i) => b.classList.toggle("llena", i < +v.estrellas));
    pintarEstrellas();
    const campo = (lab, name, tag, extra = {}) => { const L = el("label", null, lab), i = el(tag); i.name = name; Object.assign(i, extra); L.append(i); return L; };
    const nom = campo("Tu nombre", "nombre", "input", { type: "text", autocomplete: "given-name", maxLength: 80, placeholder: "Ej: María G." });
    const txt = campo("Cuéntanos tu experiencia", "texto", "textarea", { rows: 4, maxLength: 1200 });
    // foto opcional
    const fbox = el("div", "rv-subir"), inp = el("input"); inp.type = "file"; inp.accept = "image/*"; inp.hidden = true;
    const pv = el("div", "rv-pv"), bf = el("button", "btn btn-line btn-sm"); bf.type = "button";
    const quitar = el("button", "lnk-q", "Quitar foto"); quitar.type = "button";
    const pintarFoto = () => { pv.replaceChildren(); if (v.foto) { const im = el("img"); im.src = v.foto; im.alt = "Tu foto"; pv.append(im); } pv.hidden = !v.foto; quitar.hidden = !v.foto; bf.textContent = v.foto ? "Cambiar foto" : "📷 Agregar una foto (opcional)"; };
    bf.onclick = () => inp.click(); quitar.onclick = () => { v.foto = ""; pintarFoto(); };
    inp.onchange = async () => { const file = inp.files[0]; inp.value = ""; if (!file) return; bf.disabled = true; bf.textContent = "Preparando la foto…"; try { v.foto = await achicar(file); } catch (er) { err.textContent = er.message; err.hidden = false; } bf.disabled = false; pintarFoto(); };
    fbox.append(el("div", "lab", "Foto de tu arreglo o de tu altar (opcional)"), pv, el("div", "rv-fbtns"), inp); fbox.lastChild.previousSibling.append(bf, quitar); pintarFoto();
    const trampa = el("label", "trampa", "No llenes esto"); const ti = el("input"); ti.name = "web"; ti.tabIndex = -1; ti.autocomplete = "off"; trampa.append(ti);
    const err = el("p", "note err"); err.hidden = true;
    const go = el("button", "btn btn-solid", "Enviar reseña"); go.type = "submit";
    f.append(t.box, e.box, nom, txt, fbox, trampa, err, go);
    f.onsubmit = async ev => {
      ev.preventDefault(); err.hidden = true;
      const datos = { ...v, nombre: f.nombre.value, texto: f.texto.value, web: ti.value };
      if (!s(datos.nombre)) { err.textContent = "Escribe tu nombre."; err.hidden = false; return; }
      if (s(datos.texto).length < 5) { err.textContent = "Cuéntanos un poquito de tu experiencia."; err.hidden = false; return; }
      go.disabled = true; go.textContent = "Enviando…";
      try {
        const r = await fetch("/api/resena", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(datos) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "No se pudo enviar. Intenta de nuevo.");
        const ok = el("div", "done"); ok.append(el("h4", null, "¡Gracias por tu reseña! 💛"), el("p", null, "La voy a revisar y muy pronto aparecerá en la página."));
        f.replaceWith(ok); alTerminar && alTerminar(ok);
      } catch (er) { err.textContent = er.message; err.hidden = false; go.disabled = false; go.textContent = "Enviar reseña"; }
    };
    return f;
  }

  // Abre el formulario en una ventana.
  function abrir(tipo) {
    const d = el("dialog", "rv-dlg"); d.setAttribute("aria-labelledby", "rvTit");
    const caja = el("div", "dlg"), cab = el("div", "dlg-head"), tt = el("div");
    const h = el("h3", null, "Deja tu reseña"); h.id = "rvTit"; tt.append(h, el("div", "muted", "Tu opinión ayuda a otras personas a conocerme."));
    const x = el("button", "x", "×"); x.type = "button"; x.setAttribute("aria-label", "Cerrar"); x.onclick = () => d.close();
    cab.append(tt, x);
    const f = formulario({ tipo, alTerminar: ok => { const c = el("button", "btn btn-line", "Cerrar"); c.type = "button"; c.onclick = () => d.close(); ok.append(c); } });
    caja.append(cab, f); d.append(caja);
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    d.addEventListener("close", () => d.remove());
    document.body.append(d); d.showModal();
  }

  window.Resenas = { tarjetas, formulario, abrir };
})();
