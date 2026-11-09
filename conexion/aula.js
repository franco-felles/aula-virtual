/* ==========================================================
   AULA.JS · sesión y conexión con el Panel (Google Apps Script)

   Toda página la carga así (ajusta ../ según la carpeta):
     <script src="conexion/aula.js" data-proteger></script>                 index.html (raíz)
     <script src="../conexion/aula.js" data-proteger></script>              clases/, eecc/, docente/
     <script src="../../../conexion/aula.js" data-proteger></script>        material: clases/u1c1/material/m1c1.html
     data-docente     → solo el docente
     data-sin-barra   → no pone la barrita flotante (Inicio / Salir)

   La URL del Panel está en conexion/config.js (window.AULA_API). Se carga sola.
   Sesión en sessionStorage (solo esa pestaña y las que abra). Se cierra sola
   tras INACTIVO_MIN minutos sin uso, porque las PC del laboratorio se comparten.
   ========================================================== */
(function () {
  "use strict";
  const script = document.currentScript;
  const RAIZ = new URL("../", script.src);
  const url = r => new URL(r, RAIZ).href;
  const CLAVE = "aula-sesion-v2";
  const INACTIVO_MIN = 20;

  /* ---------- utilidades ---------- */
  const strip = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const norm = s => strip(s).toLowerCase().trim();
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  /** "BASTERES HUAMAN YASMIN NICOL" -> "Basteres Huaman Yasmin Nicol" */
  const nombreBonito = s => String(s || "").toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

  /* ---------- configuración ---------- */
  const cfgListo = new Promise(res => {
    if (window.AULA_API) return res();
    const s = document.createElement("script");
    s.src = url("conexion/config.js"); s.onload = s.onerror = () => res();
    document.head.appendChild(s);
  });

  /* ---------- sesión ---------- */
  function sesion() {
    try {
      const s = JSON.parse(sessionStorage.getItem(CLAVE));
      if (s && Date.now() - (s.uso || 0) > INACTIVO_MIN * 60000) { sessionStorage.removeItem(CLAVE); return null; }
      return s;
    } catch { return null; }
  }
  function guardar(s) { s.uso = Date.now(); sessionStorage.setItem(CLAVE, JSON.stringify(s)); }
  function salir(motivo) {
    sessionStorage.removeItem(CLAVE);
    borrarMemoria();
    location.replace(url("conexion/acceso.html") + (motivo ? "?m=" + encodeURIComponent(motivo) : ""));
  }
  function irALogin() {
    const actual = location.href.startsWith(RAIZ.href) ? location.href.slice(RAIZ.href.length) : "";
    location.replace(url("conexion/acceso.html") + (actual && !/^conexion\/acceso\.html/.test(actual) ? "?volver=" + encodeURIComponent(actual) : ""));
  }
  function destinoTrasLogin() {
    const v = new URLSearchParams(location.search).get("volver");
    if (v) { try { const u = new URL(v, RAIZ); if (u.href.startsWith(RAIZ.href)) return u.href; } catch {} }
    return url("index.html");
  }
  // Marca actividad (como mucho una vez cada 20 s) y revisa la inactividad cada 30 s
  let ultimaMarca = 0;
  function marcarUso() {
    const now = Date.now(); if (now - ultimaMarca < 20000) return; ultimaMarca = now;
    const s = sesion(); if (s) guardar(s);
  }
  ["pointerdown", "keydown", "scroll", "touchstart"].forEach(ev => addEventListener(ev, marcarUso, { passive: true }));
  setInterval(() => { if (proteger && !sesion()) salir("inactivo"); }, 30000);

  /* ---------- API ---------- */
  async function api(accion, datos) {
    await cfgListo;
    const API_URL = String(window.AULA_API || "").trim();
    if (!API_URL) throw new Error("Falta configurar la dirección del Panel en config.js.");
    const s = sesion();
    let r;
    try {
      r = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },     // text/plain evita el preflight de CORS
        body: JSON.stringify(Object.assign({ accion, token: s && s.token }, datos || {}))
      });
    } catch { throw new Error("Sin conexión con el Panel. Revisa internet e inténtalo de nuevo."); }
    let j;
    try { j = await r.json(); } catch { throw new Error("El Panel respondió algo inesperado. ¿Está publicada la aplicación web?"); }
    if (!j.ok) {
      if (j.error === "SESION") { salir("expirada"); throw new Error("Tu sesión expiró."); }
      throw new Error(j.error || "Error desconocido");
    }
    if (s) guardar(s);
    return j;
  }

  /* ---------- memoria en el navegador (solo esta pestaña; se borra al Salir) ----------
     apiRapida muestra al instante lo último que se cargó y luego lo reemplaza por lo fresco.
     precargar pide los datos de antemano (ej. al pasar el mouse por una clase). */
  const MEM = "aula-mem:";
  const claveMem = (accion, datos) => MEM + accion + ":" + JSON.stringify(datos || {});
  const leerMem = k => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } };
  const escribirMem = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
  function borrarMemoria() {
    try { Object.keys(sessionStorage).filter(k => k.startsWith(MEM)).forEach(k => sessionStorage.removeItem(k)); } catch {}
  }
  /** Olvida lo guardado de ciertas acciones (ej. tras guardar un quiz): Aula.olvidar("quizLista", "portal") */
  function olvidar(...acciones) {
    try { Object.keys(sessionStorage).filter(k => acciones.some(a => k.startsWith(MEM + a + ":"))).forEach(k => sessionStorage.removeItem(k)); } catch {}
  }
  const enCamino = {};
  function pedir(accion, datos) {
    const k = claveMem(accion, datos);
    if (!enCamino[k]) enCamino[k] = api(accion, datos)
      .then(r => { escribirMem(k, r); return r; })
      .finally(() => setTimeout(() => delete enCamino[k], 0));
    return enCamino[k];
  }
  /** alRecibir(datos, desdeMemoria) se llama 1 o 2 veces. Si no hay memoria y falla, lanza el error. */
  async function apiRapida(accion, datos, alRecibir) {
    const viejo = leerMem(claveMem(accion, datos));
    if (viejo) alRecibir(viejo, true);
    try {
      const nuevo = await pedir(accion, datos);
      if (!viejo || JSON.stringify(viejo) !== JSON.stringify(nuevo)) alRecibir(nuevo, false);
    } catch (e) { if (!viejo) throw e; }
  }
  function precargar(accion, datos) {
    if (!leerMem(claveMem(accion, datos))) pedir(accion, datos).catch(() => {});
  }

  /* ---------- datos públicos (Web rápida) ----------
     conexion/datos.json lo escribe el Panel en GitHub: clases publicadas, enlaces, materiales y quizzes visibles.
     Se lee como un archivo más (instantáneo) para pintar la página mientras el Panel responde lo personal.
     Si no existe o falla, devuelve null y todo funciona como antes. */
  let pPublico = null;
  function publico() {
    if (!pPublico) pPublico = fetch(url("conexion/datos.json"), { cache: "no-cache" })
      .then(r => r.ok ? r.json() : null).then(d => d && d.v === 1 && Array.isArray(d.clases) ? d : null).catch(() => null);
    return pPublico;
  }
  const idNorm = s => String(s || "").toLowerCase().trim().replace(/([a-z])0+(\d)/g, "$1$2");

  /* ---------- interfaz compartida ---------- */
  function toast(titulo, texto, tipo) {
    let caja = document.getElementById("toasts");
    if (!caja) { caja = el("div", "toasts"); caja.id = "toasts"; caja.setAttribute("aria-live", "polite"); document.body.appendChild(caja); }
    const t = el("div", "toast" + (tipo ? " " + tipo : ""));
    const ico = el("span", "t-ico");
    ico.innerHTML = tipo === "warn"
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
    const cuerpo = el("div"); cuerpo.append(el("b", "", titulo)); if (texto) cuerpo.append(el("p", "", texto));
    const x = el("button", "t-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Cerrar");
    const quitar = () => { t.classList.add("sale"); setTimeout(() => t.remove(), 300); };
    x.onclick = quitar;
    t.append(ico, cuerpo, x);
    while (caja.children.length >= 3) caja.firstChild.remove();
    caja.appendChild(t);
    setTimeout(quitar, 6000);
  }

  function estilosBarra() {
    if (document.getElementById("aula-css")) return;
    const st = document.createElement("style"); st.id = "aula-css";
    st.textContent = `
      .aula-bar{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99999;display:flex;align-items:center;gap:6px;
        background:#10231c;color:#f6f4ee;border-radius:12px;padding:6px 6px 6px 14px;font:500 .78rem 'IBM Plex Mono',ui-monospace,monospace;box-shadow:0 6px 20px rgba(16,35,28,.3);max-width:calc(100vw - 24px)}
      .aula-bar span{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .aula-bar a,.aula-bar button{font:inherit;color:#f6f4ee;background:rgba(246,244,238,.14);border:0;border-radius:8px;padding:6px 11px;cursor:pointer;text-decoration:none}
      .aula-bar a:hover,.aula-bar button:hover{background:rgba(246,244,238,.28)}`;
    document.head.appendChild(st);
  }
  /** Texto corto de quién está conectado: "Docente" o "Aguilar M. + Ari T." */
  function quien(s) {
    s = s || sesion(); if (!s) return "";
    if (s.rol === "docente") return s.nombre || "Docente";
    return (s.alumnos || []).map(a => { const p = nombreBonito(a.nombre).split(" "); return p[0] + (p[2] ? " " + p[2] : ""); }).join(" + ");
  }
  function barra() {
    const s = sesion(); if (!s || document.querySelector(".aula-bar")) return;
    estilosBarra();
    const b = el("div", "aula-bar");
    const q = el("span", "", (s.rol === "docente" ? "👨‍🏫 " : "👤 ") + quien(s)); q.title = quien(s);
    const a = el("a", "", "Inicio"); a.href = url("index.html");
    const x = el("button", "", "Salir"); x.type = "button"; x.onclick = () => salir();
    b.append(q, a, x); document.body.appendChild(b);
  }

  /** Abre una página del sitio en pestaña nueva conservando la sesión (window.open copia sessionStorage). */
  function abrirInterna(ruta) { window.open(url(ruta), "_blank"); }

  /** En un material (clases/u1c1/material/m1c1.html o eecc/ec1u1/material/…) devuelve "u1c1" / "ec1u1". */
  function claseActual() {
    const m = /\/(?:clases|eecc)\/([^/]+)\/material\/[^/]*$/.exec(location.pathname);
    return m ? decodeURIComponent(m[1]).toLowerCase() : "";
  }
  /** Para botones "Ir a mi documento" dentro de un material:
   *  devuelve [{codigo, nombre, url|null}] de quienes están en la sesión (docente: todos). */
  async function miDocumento(id) {
    const r = await api("clase", { id: id || claseActual() });
    return r.docs;
  }

  /* ---------- guardia ---------- */
  const proteger = script.hasAttribute("data-proteger") || script.hasAttribute("data-docente");
  const API = { RAIZ, url, api, apiRapida, precargar, borrarMemoria, olvidar, publico, idNorm, sesion, guardar, salir, irALogin, destinoTrasLogin, el, norm, nombreBonito, toast, barra, quien, abrirInterna, claseActual, miDocumento,
    esDocente: () => (sesion() || {}).rol === "docente" };

  if (proteger) {
    const s = sesion();
    if (!s) { document.documentElement.style.visibility = "hidden"; API.listo = new Promise(() => {}); irALogin(); }
    else if (script.hasAttribute("data-docente") && s.rol !== "docente") {
      document.documentElement.style.visibility = "hidden"; API.listo = new Promise(() => {}); location.replace(url("index.html"));
    } else {
      guardar(s);
      API.listo = new Promise(res => {
        const fin = () => { if (!script.hasAttribute("data-sin-barra")) barra(); res(s); };
        document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fin) : fin();
      });
    }
  }
  window.Aula = API;
})();
