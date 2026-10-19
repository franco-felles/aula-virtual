/* ==========================================================
   ACCESS.JS  ·  Validación y sesión del Aula Virtual

   Lo usan TODAS las páginas:
     acceso.html            -> login (lee access/access.csv)
     index.html             -> portal (exige sesión; crea los botones solo)
     access/sesion.html     -> ÚNICA página de sesión:
                               alumno  -> lo manda directo a SU enlace
                               docente -> lista de alumnos y enlaces de esa clase/EC
     clases/class1u1.html   -> única página de contenido (modelo 3D de la PC)

   Nomenclatura de sesiones:   class#u#   (clase # de la unidad #)   ej. class4u1
                               ec#u#      (evaluación continua)      ej. ec1u1
   Cada CSV se llama igual que la sesión y su primera fila repite ese nombre.

   Cómo se protege una página (en su <head>):
     <script src="access/access.js" data-proteger></script>                 (portal)
     <script src="../access/access.js" data-sesion="class1u1"></script>     (contenido)
     añade  data-sin-barra  si la página ya trae su propia cabecera.

   Sesión: se guarda en sessionStorage (se borra al cerrar la pestaña/navegador),
   porque en el laboratorio las PC se comparten.

   access.csv:  ROL,GRUPO,CODIGO,NOMBRE      (ROL = alumno | docente)
     La contraseña del docente puede escribirse tal cual (fer1999) o como hash:
     abre la consola (F12) en cualquier página y ejecuta   await Acceso.hash("tu clave")
     y pega el resultado ("sha256:...") en la columna CODIGO.
   ========================================================== */
(function () {
  "use strict";

  const script = document.currentScript;
  const RAIZ = new URL("../", script.src);            // raíz del sitio (access/ está un nivel abajo)
  const CLAVE = "aula-sesion";
  const url = ruta => new URL(ruta, RAIZ).href;

  /* ---------- utilidades de texto ---------- */
  const strip = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const norm = s => strip(s).toLowerCase().trim();
  const normH = s => norm(s).replace(/[^a-z0-9]+/g, " ").trim();              // encabezados
  const normCodigo = s => strip(s).toUpperCase().replace(/[^A-Z0-9]/g, "");   // códigos / claves

  async function hash(texto) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normCodigo(texto)));
    return "sha256:" + [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------- CSV ---------- */
  /** Parser: comillas, BOM y separador coma o punto y coma (autodetectado). */
  function parseCSV(texto) {
    texto = texto.replace(/^\uFEFF/, "");
    const primera = texto.split(/\r?\n/).slice(0, 6).join("\n");
    const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ";" : ",";
    const filas = []; let fila = [], campo = "", q = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (q) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') q = false;
        else campo += c;
      } else if (c === '"') q = true;
      else if (c === sep) { fila.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        fila.push(campo); campo = "";
        if (fila.some(x => x.trim())) filas.push(fila);
        fila = [];
      } else campo += c;
    }
    fila.push(campo);
    if (fila.some(x => x.trim())) filas.push(fila);
    return filas;
  }

  const COLUMNAS = {
    rol:    ["rol", "perfil"],
    n:      ["n orden", "orden", "n"],
    grupo:  ["grupo"],
    codigo: ["codigo", "cod alum", "codigo de alumno", "clave"],
    nombre: ["nombre", "alumno", "alumnos", "datos", "apellidos y nombres"],
    link:   ["link", "enlace", "url"]
  };

  /** CSV -> { titulo, filas:[{rol,n,grupo,codigo,nombre,link}] }
   *  La primera fila puede ser el "nombre de la sesión" (una sola celda, ej. class2). */
  function leerTabla(texto) {
    const filas = parseCSV(texto);
    let titulo = "", ini = 0;
    if (filas.length && filas[0].filter(x => x.trim()).length === 1) {
      titulo = filas[0].find(x => x.trim()).trim(); ini = 1;
    }
    const cab = (filas[ini] || []).map(normH);
    const col = k => cab.findIndex(x => COLUMNAS[k].includes(x));
    const idx = {}; Object.keys(COLUMNAS).forEach(k => idx[k] = col(k));
    const get = (f, k) => idx[k] >= 0 ? (f[idx[k]] || "").trim() : "";
    const datos = filas.slice(ini + 1).map(f => ({
      rol: get(f, "rol").toLowerCase(), n: get(f, "n"), grupo: get(f, "grupo"),
      codigo: get(f, "codigo"), nombre: get(f, "nombre"), link: get(f, "link")
    })).filter(f => f.nombre || f.codigo);
    return { titulo, filas: datos };
  }

  /** ¿Existe el archivo? (descarta las páginas HTML de error que algunos hostings devuelven con 200) */
  async function textoCSV(ruta) {
    try {
      const r = await fetch(url(ruta), { cache: "no-store" });
      if (!r.ok) return null;
      if ((r.headers.get("content-type") || "").includes("text/html")) return null;
      const t = await r.text();
      return t.trim() ? t : null;
    } catch { return null; }
  }
  async function existeHTML(id) {
    try { return (await fetch(url(`clases/${id}.html`), { method: "HEAD", cache: "no-store" })).ok; }
    catch { return false; }
  }

  /* ---------- nombres de sesión ---------- */
  /** "class4u1" -> Clase 4 · Unidad 1 | "ec1u2" -> Evaluación continua 1 · Unidad 2 | otra cosa -> null */
  function idSesion(id) {
    const m = /^(class|ec)(\d+)u(\d+)$/i.exec(String(id || "").trim());
    if (!m) return null;
    const tipo = m[1].toLowerCase(), num = Number(m[2]), unidad = Number(m[3]);
    const nombre = (tipo === "class" ? "Clase " : "Evaluación continua ") + num;
    return {
      id: String(id).trim().toLowerCase(), tipo, num, unidad,
      carpeta: tipo === "class" ? "clases/" : "eecc/",
      nombre, etiqueta: `${nombre} · Unidad ${unidad}`
    };
  }

  /** Descarga y lee el CSV de una sesión -> { info, titulo, tituloOk, filas } | null */
  async function cargarSesion(id) {
    const info = idSesion(id);
    if (!info) return null;
    const t = await textoCSV(info.carpeta + info.id + ".csv");
    if (!t) return null;
    const tab = leerTabla(t);
    return { info, titulo: tab.titulo, tituloOk: !tab.titulo || norm(tab.titulo) === info.id, filas: tab.filas };
  }

  /** ¿el código de la sesión guardada está en esa sesión? -> fila | null */
  const buscarFila = (filas, codigo) => filas.find(f => f.codigo && normCodigo(f.codigo) === normCodigo(codigo)) || null;

  /* ---------- sesión (la "llave") ---------- */
  const sesion = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE)); } catch { return null; } };
  function iniciar(p) {
    sessionStorage.setItem(CLAVE, JSON.stringify({ rol: p.rol === "docente" ? "docente" : "alumno", codigo: p.codigo, nombre: p.nombre, grupo: p.grupo || "" }));
  }
  const salir = () => { sessionStorage.removeItem(CLAVE); location.replace(url("acceso.html")); };

  /* ---------- login ---------- */
  async function cargarAccess() {
    const t = await textoCSV("access/access.csv");
    if (!t) return null;
    return leerTabla(t).filas
      .filter(f => f.codigo && f.nombre)
      .map(f => ({ ...f, rol: f.rol === "docente" || f.rol === "profesor" ? "docente" : "alumno" }));
  }
  async function validar(persona, ingresado) {
    const a = normCodigo(ingresado);
    if (!a) return false;
    const esperado = (persona.codigo || "").trim();
    if (/^sha256:/i.test(esperado)) return (await hash(a)) === esperado.slice(7).toLowerCase();
    return a === normCodigo(esperado);
  }
  /** Adónde ir tras el login: ?volver=<ruta dentro del sitio> o el portal. */
  function destinoTrasLogin() {
    const v = new URLSearchParams(location.search).get("volver");
    if (v) { try { const u = new URL(v, RAIZ); if (u.href.startsWith(RAIZ.href)) return u.href; } catch {} }
    return url("index.html");
  }
  function irALogin() {
    const actual = location.href.startsWith(RAIZ.href) ? location.href.slice(RAIZ.href.length) : "";
    location.replace(url("acceso.html") + (actual ? "?volver=" + encodeURIComponent(actual) : ""));
  }

  /* ---------- verificación de una sesión para el usuario guardado ---------- */
  /** -> { ok, motivo?, sesion, fila, hayCSV } */
  async function verificar(id) {
    const s = sesion();
    if (!s) return { ok: false, motivo: "sin-sesion" };
    const datos = await cargarSesion(id);
    if (!datos) return { ok: true, sesion: s, fila: null, hayCSV: false };      // sin CSV: contenido libre con sesión
    if (!datos.tituloOk) return { ok: false, motivo: "titulo", sesion: s, datos };
    if (s.rol === "docente") return { ok: true, sesion: s, fila: null, hayCSV: true, datos };
    const fila = buscarFila(datos.filas, s.codigo);
    if (!fila) return { ok: false, motivo: "no-registrado", sesion: s, datos };
    return { ok: true, sesion: s, fila, hayCSV: true, datos };
  }

  const MENSAJES = {
    "no-registrado": "Tu código no figura en esta sesión. Avisa a tu docente.",
    "titulo": "El archivo de esta sesión no coincide con su nombre. Avisa a tu docente.",
    "sin-sesion": "Primero debes iniciar sesión."
  };

  /* ---------- piezas de interfaz compartidas ---------- */
  function estilosBarra() {
    if (document.getElementById("acc-css")) return;
    const st = document.createElement("style"); st.id = "acc-css";
    st.textContent = `
      .acc-bar{position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:99999;display:flex;align-items:center;gap:6px;
        background:#10231c;color:#f6f4ee;border-radius:12px;padding:6px 6px 6px 14px;font:500 .78rem 'IBM Plex Mono',ui-monospace,monospace;box-shadow:0 6px 20px rgba(16,35,28,.3);max-width:calc(100vw - 24px)}
      .acc-bar span{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .acc-bar a,.acc-bar button{font:inherit;color:#f6f4ee;background:rgba(246,244,238,.14);border:0;border-radius:8px;padding:6px 11px;cursor:pointer;text-decoration:none}
      .acc-bar a:hover,.acc-bar button:hover{background:rgba(246,244,238,.28)}
      .acc-msg{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:24px;background:#f6f4ee;color:#10231c;font-family:'IBM Plex Sans',system-ui,sans-serif;text-align:center}
      .acc-msg div{max-width:420px;background:#fff;border:1px solid #d8d3c4;border-radius:14px;padding:26px;box-shadow:0 10px 30px rgba(16,35,28,.08)}
      .acc-msg a{display:inline-block;margin-top:12px;background:#35513f;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600}`;
    document.head.appendChild(st);
  }
  function barra(opciones = {}) {
    const s = sesion(); if (!s || document.querySelector(".acc-bar")) return;
    estilosBarra();
    const b = document.createElement("div"); b.className = "acc-bar";
    const quien = document.createElement("span");
    quien.textContent = (s.rol === "docente" ? "👨‍🏫 " : "👤 ") + s.nombre;
    quien.title = s.nombre;
    b.appendChild(quien);
    if (opciones.inicio !== false) {
      const a = document.createElement("a"); a.href = url("index.html"); a.textContent = "Inicio"; b.appendChild(a);
    }
    const x = document.createElement("button"); x.type = "button"; x.textContent = "Salir"; x.onclick = salir; b.appendChild(x);
    document.body.appendChild(b);
  }
  function mensajePantalla(texto) {
    estilosBarra();
    const m = document.createElement("div"); m.className = "acc-msg";
    const c = document.createElement("div");
    const p = document.createElement("p"); p.textContent = texto;
    const a = document.createElement("a"); a.href = url("index.html"); a.textContent = "← Volver al inicio";
    c.append(p, a); m.appendChild(c); document.body.appendChild(m);
    document.documentElement.style.visibility = "";
  }

  /* ---------- guardia automática de la página ---------- */
  const API = { RAIZ, url, norm, normCodigo, hash, parseCSV, leerTabla, textoCSV, existeHTML, idSesion, cargarSesion,
    buscarFila, sesion, iniciar, salir, cargarAccess, validar, destinoTrasLogin, irALogin, verificar, barra,
    mensajePantalla, MENSAJES };

  const idPagina = script.dataset.sesion;
  const proteger = script.hasAttribute("data-proteger") || !!idPagina;
  if (proteger) {
    if (!sesion()) { document.documentElement.style.visibility = "hidden"; API.listo = new Promise(() => {}); irALogin(); }
    else {
      document.documentElement.style.visibility = "hidden";
      const listoDOM = new Promise(res => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", res) : res());
      API.listo = (async () => {
        const r = idPagina ? await verificar(idPagina) : { ok: true, sesion: sesion() };
        await listoDOM;
        if (!r.ok) { mensajePantalla(MENSAJES[r.motivo] || "No tienes acceso a esta sesión."); return new Promise(() => {}); }
        document.documentElement.style.visibility = "";
        if (!script.hasAttribute("data-sin-barra")) barra();
        return r;
      })();
    }
  }
  window.Acceso = API;
})();
