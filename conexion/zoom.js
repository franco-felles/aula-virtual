/* ============================================================
   ZOOM DE IMÁGENES para los materiales del aula
   Uso (en el <head> del material):
     <script src="../../../conexion/zoom.js" defer></script>

   - Clic o toque en cualquier imagen dentro de una .diapo (o dentro de
     un elemento con el atributo data-zoom) la abre en grande.
   - Dentro del visor: rueda del mouse o pellizcar para acercar,
     clic para acercar/alejar, arrastrar para mover, Esc para cerrar.
   - Alta resolución: si la imagen tiene data-hd="ruta.jpg" se carga esa
     versión al ampliar. También se puede definir para toda la página:
       window.ZOOM_HD = src => src.replace("/recursos/", "/recursos/hd/");
   - Para que una imagen NO se amplíe: data-sin-zoom en ella o en un contenedor.
   ============================================================ */
(() => {
  const AREA = ".diapo img, [data-zoom] img";
  const estilo = document.createElement("style");
  estilo.textContent = `
    .diapo img, [data-zoom] img { cursor: zoom-in; }
    [data-sin-zoom] img, img[data-sin-zoom] { cursor: inherit; }
    .zoom-capa { position: fixed; inset: 0; z-index: 9999; background: rgba(8,14,12,.94); display: none; touch-action: none; user-select: none; -webkit-user-select: none; }
    .zoom-capa.on { display: block; animation: zoomEntra .2s ease both; }
    @keyframes zoomEntra { from { opacity: 0; } to { opacity: 1; } }
    .zoom-capa img { position: absolute; left: 0; top: 0; transform-origin: 0 0; cursor: zoom-in; background: #fff; border-radius: 6px; box-shadow: 0 20px 60px rgba(0,0,0,.5); will-change: transform; max-width: none; max-height: none; mix-blend-mode: normal !important; }
    .zoom-capa.cerca img { cursor: grab; }
    .zoom-capa.arrastra img { cursor: grabbing; }
    .zoom-cerrar { position: absolute; top: 14px; right: 14px; width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255,255,255,.16); color: #fff; font: 700 1.3rem system-ui, sans-serif; cursor: pointer; z-index: 2; }
    .zoom-cerrar:hover { background: rgba(255,255,255,.3); }
    .zoom-pie { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; color: #e8eee9; font: 600 .95rem system-ui, sans-serif; pointer-events: none; padding: 0 16px; }
    .zoom-pie small { display: block; font-weight: 400; opacity: .65; font-size: .78rem; margin-top: 3px; }
  `;
  document.head.append(estilo);

  let capa, foto, pie, abierto = false, vez = 0;
  let s = 1, tx = 0, ty = 0, bw = 0, bh = 0;
  const punteros = new Map();
  let ini = null, pellizco = null;

  function crear() {
    capa = document.createElement("div");
    capa.className = "zoom-capa";
    capa.innerHTML = '<button class="zoom-cerrar" type="button" aria-label="Cerrar">✕</button><img alt=""><p class="zoom-pie"></p>';
    document.body.append(capa);
    foto = capa.querySelector("img");
    pie = capa.querySelector(".zoom-pie");
    capa.querySelector(".zoom-cerrar").onclick = cerrar;
    capa.addEventListener("pointerdown", bajar);
    capa.addEventListener("pointermove", mover);
    capa.addEventListener("pointerup", subir);
    capa.addEventListener("pointercancel", subir);
    capa.addEventListener("wheel", e => { e.preventDefault(); acercar(e.clientX, e.clientY, s * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); }, { passive: false });
    ["touchstart", "touchend", "touchmove", "click"].forEach(ev => capa.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
    addEventListener("resize", () => abierto && encajar());
  }

  function aplicar() {
    foto.style.width = bw + "px"; foto.style.height = bh + "px";
    foto.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    capa.classList.toggle("cerca", s > 1.01);
  }
  function encajar() {
    const W = innerWidth, H = innerHeight, nw = foto.naturalWidth || 4, nh = foto.naturalHeight || 3;
    const f = Math.min(W * .92 / nw, (H - 110) / nh);
    bw = nw * f; bh = nh * f; s = 1;
    tx = (W - bw) / 2; ty = (H - bh) / 2 - 20;
    aplicar();
  }
  function acercar(px, py, ns) {
    ns = Math.max(1, Math.min(6, ns));
    if (ns === 1) { encajar(); return; }
    tx = px - (px - tx) * (ns / s); ty = py - (py - ty) * (ns / s); s = ns;
    aplicar();
  }

  function abrir(img) {
    if (!capa) crear();
    const hd = img.dataset.hd || (typeof window.ZOOM_HD === "function" && window.ZOOM_HD(img.src)) || "";
    pie.innerHTML = (img.alt ? img.alt : "") + "<small>Rueda o pellizca para acercar · arrastra para mover · Esc para cerrar</small>";
    foto.alt = img.alt || "";
    bw = 0;
    foto.onload = encajar;
    foto.onerror = null;
    foto.src = img.currentSrc || img.src;
    if (foto.complete) encajar();
    const turno = ++vez;
    if (hd && hd !== foto.src) {
      const alta = new Image();
      alta.onload = () => {
        if (!abierto || turno !== vez) return;
        foto.onload = bw ? null : encajar;   // misma proporción: se mantiene el tamaño y el zoom actual
        foto.src = hd;
      };
      alta.src = hd;
    }
    capa.classList.add("on"); abierto = true;
  }
  function cerrar() { if (!capa) return; capa.classList.remove("on"); abierto = false; punteros.clear(); }

  function bajar(e) {
    if (e.target.closest(".zoom-cerrar")) return;
    try { capa.setPointerCapture(e.pointerId); } catch (_) {}
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 1) ini = { x: e.clientX, y: e.clientY, tx, ty, t: Date.now(), sobre: e.target === foto, movio: false };
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y), s0: s, tx0: tx, ty0: ty, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (ini) ini.movio = true;
    }
  }
  function mover(e) {
    if (!punteros.has(e.pointerId)) return;
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.size === 2 && pellizco) {
      const [a, b] = [...punteros.values()];
      const ns = Math.max(1, Math.min(6, pellizco.s0 * Math.hypot(a.x - b.x, a.y - b.y) / pellizco.d));
      tx = pellizco.mx - (pellizco.mx - pellizco.tx0) * (ns / pellizco.s0);
      ty = pellizco.my - (pellizco.my - pellizco.ty0) * (ns / pellizco.s0);
      s = ns; aplicar(); return;
    }
    if (ini) {
      const dx = e.clientX - ini.x, dy = e.clientY - ini.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) ini.movio = true;
      if (s > 1.01 && ini.movio) { capa.classList.add("arrastra"); tx = ini.tx + dx; ty = ini.ty + dy; aplicar(); }
    }
  }
  function subir(e) {
    punteros.delete(e.pointerId);
    capa.classList.remove("arrastra");
    if (punteros.size < 2) pellizco = null;
    if (punteros.size === 0 && ini) {
      if (!ini.movio && e.type === "pointerup") {
        if (ini.sobre) { if (s > 1.01) encajar(); else acercar(e.clientX, e.clientY, 2.5); }
        else cerrar();
      } else if (s <= 1.01) encajar();
      ini = null;
    }
  }

  // abrir: se captura antes que cualquier otro clic (por ejemplo, tarjetas que se voltean)
  document.addEventListener("click", e => {
    const img = e.target.closest && e.target.closest("img");
    if (!img || !img.matches(AREA) || img.closest("[data-sin-zoom]") || img.hasAttribute("data-sin-zoom") || (capa && capa.contains(img))) return;
    if (img.naturalWidth && img.naturalWidth < 40) return;
    e.preventDefault(); e.stopImmediatePropagation();
    abrir(img);
  }, true);

  // mientras el visor está abierto, el teclado no mueve las diapositivas
  addEventListener("keydown", e => {
    if (!abierto) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.key === "Escape") cerrar();
    if (e.key === "+" || e.key === "=") acercar(innerWidth / 2, innerHeight / 2, s * 1.3);
    if (e.key === "-") acercar(innerWidth / 2, innerHeight / 2, s / 1.3);
  }, true);
})();
