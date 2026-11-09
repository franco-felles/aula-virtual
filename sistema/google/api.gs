/* ==========================================================
   API WEB  ·  lo que la página (Vercel) le pide al Panel

   Va en el MISMO proyecto de Apps Script que panel.gs, como un segundo archivo
   (Archivos → + → Secuencia de comandos → "api").
   Se publica: Implementar → Nueva implementación → Aplicación web
               Ejecutar como: Yo · Quién tiene acceso: Cualquier persona
   La URL (/exec) va en config.js de la web.

   La web siempre hace POST con JSON {accion, token, ...} y recibe {ok, ...} o {ok:false, error}.
   Seguridad:
     · Alumno: entra con su código; solo si está "Activo" y con grupo en la pestaña Alumnos.
     · Docente: contraseña guardada cifrada (SHA-256 + sal) en Propiedades del script,
       nunca en la hoja ni en la web. Se cambia desde la web o desde Aula → Contraseña docente.
     · Cada login recibe un token que dura 6 h; la web solo ve los datos de quien inició sesión.
   ========================================================== */

const TOKEN_SEG = 6 * 60 * 60;
const CAB_QUIZ = ["ID", "TITULO", "CLASE", "MOSTRAR", "ABIERTO", "NPREG", "PREGUNTAS", "ACTUALIZADO", "OCULTO", "REPETIR", "PUNTAJE", "ERRORES", "PENALIZAR"];
const CAB_RES = ["QUIZ", "CODIGO", "ALUMNO", "GRUPO", "ACIERTOS", "TOTAL", "NOTA", "CORRECCION", "INCIDENTES", "HORA", "DETALLE", "INTENTOS", "DESCUENTO"];

function doGet() { return salida({ ok: true, app: "Aula Virtual" }); }

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || "{}"); }
  catch (_) { return salida({ ok: false, error: "Solicitud inválida" }); }
  const fn = ACCIONES[req.accion];
  if (!fn) return salida({ ok: false, error: "Acción desconocida" });
  try { return salida(Object.assign({ ok: true }, fn(req) || {})); }
  catch (err) { return salida({ ok: false, error: err && err.message ? err.message : String(err) }); }
}

const ACCIONES = {
  login: apiLogin, loginDocente: apiLoginDocente, companero: apiCompanero, cambiarClave: apiCambiarClave,
  portal: apiPortal, clase: apiClase,
  quizLista: apiQuizLista, quizVer: apiQuizVer, quizGuardar: apiQuizGuardar, quizOpciones: apiQuizOpciones, quizBorrar: apiQuizBorrar,
  quizRendir: apiQuizRendir, quizEnviar: apiQuizEnviar, quizCorregir: apiQuizCorregir, quizReiniciar: apiQuizReiniciar
};

/* ======================= SESIÓN ======================= */

/** "U1C01" → "u1c1", "EC2U1" → "ec2u1": tolera ceros y mayúsculas en los IDs escritos a mano. */
const normId = s => String(s || "").toLowerCase().trim().replace(/([a-z])0+(\d)/g, "$1$2");
const normCodigo = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const cache = () => CacheService.getScriptCache();

/* ---------- memoria de datos ----------
   Cada pestaña se lee una vez y se guarda ya procesada DS_SEG segundos, así la web no abre la hoja en cada visita.
   Se borra sola cuando editas el Panel (onEdit) o cuando el script cambia algo (invalidarCache). */
const DS_SEG = 300;
const DS = ["alumnos", "clases", "enlaces", "entregas", "quiz", "res"];
function datos(nombre, leer) {
  const k = "ds_" + nombre, hit = cache().get(k);
  if (hit) { try { return JSON.parse(hit); } catch (_) {} }
  const v = leer();
  try { cache().put(k, JSON.stringify(v), DS_SEG); } catch (_) {}     // si pasa de 100 KB simplemente no se guarda
  return v;
}
function invalidarCache(nombres) { cache().removeAll((nombres || DS).map(n => "ds_" + n)); }

function nuevoToken(datos) {
  const t = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  cache().put("t_" + t, JSON.stringify(datos), TOKEN_SEG);
  return t;
}
function guardarSesion(token, datos) { cache().put("t_" + token, JSON.stringify(datos), TOKEN_SEG); }

/** Devuelve la sesión del token o lanza "SESION" (la web entonces vuelve al login). */
function sesionDe(req, rol) {
  const raw = req.token && cache().get("t_" + req.token);
  if (!raw) throw new Error("SESION");
  const s = JSON.parse(raw);
  guardarSesion(req.token, s);                     // renueva las 6 h con cada uso
  if (rol && s.rol !== rol) throw new Error("No tienes permiso para esto.");
  return s;
}

function alumnosTodos() { return datos("alumnos", () => leerTabla(hoja(HOJA.alumnos)).filas.filter(f => f.CODIGO)); }
const esActivo = a => a.ESTADO === "Activo" && a.GRUPO;
const pub = a => ({ codigo: a.CODIGO, nombre: a["APELLIDOS Y NOMBRES"], grupo: a.GRUPO, n: a.N, pc: a.PC });

function buscarAlumno(codigo) {
  const c = normCodigo(codigo);
  if (!c) throw new Error("Escribe tu código.");
  const a = alumnosTodos().find(x => normCodigo(x.CODIGO) === c);
  if (!a) throw new Error("No encontramos ese código. Revísalo o avisa a tu docente.");
  if (!esActivo(a)) throw new Error("Tu docente aún no te habilitó (falta asignarte grupo). Avísale.");
  return a;
}

function apiLogin(req) {
  const a = buscarAlumno(req.codigo);
  const token = nuevoToken({ rol: "alumno", codigos: [a.CODIGO] });
  return { token, rol: "alumno", alumnos: [pub(a)] };
}

function apiCompanero(req) {
  const s = sesionDe(req, "alumno");
  const a = buscarAlumno(req.codigo);
  if (s.codigos.indexOf(a.CODIGO) >= 0) throw new Error("Ese alumno ya está en esta sesión.");
  if (s.codigos.length >= 3) throw new Error("Máximo 3 alumnos por computadora.");
  s.codigos.push(a.CODIGO);
  guardarSesion(req.token, s);
  const todos = alumnosTodos();
  return { alumnos: s.codigos.map(c => pub(todos.find(x => x.CODIGO === c))) };
}

/* ---------- contraseña del docente ---------- */

function hashClave(clave, sal) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + "|" + clave, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join("");
}
function fijarClave(clave) {
  clave = String(clave || "").trim();
  if (clave.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
  const sal = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty("DOCENTE_CLAVE", sal + ":" + hashClave(clave, sal));
}
function claveCorrecta(clave) {
  const guardada = PropertiesService.getScriptProperties().getProperty("DOCENTE_CLAVE");
  if (!guardada) throw new Error("Aún no hay contraseña de docente. Créala en el Panel: Aula → Contraseña docente.");
  const [sal, h] = guardada.split(":");
  return hashClave(String(clave || "").trim(), sal) === h;
}

function apiLoginDocente(req) {
  const c = cache(), fallos = Number(c.get("fallos_docente") || 0);
  if (fallos >= 8) throw new Error("Demasiados intentos. Espera 10 minutos.");
  if (!claveCorrecta(req.clave)) {
    c.put("fallos_docente", String(fallos + 1), 600);
    throw new Error("Contraseña incorrecta.");
  }
  c.remove("fallos_docente");
  const nombre = String(valorConfig("DOCENTE") || "Docente");
  return { token: nuevoToken({ rol: "docente" }), rol: "docente", nombre };
}

function apiCambiarClave(req) {
  sesionDe(req, "docente");
  if (!claveCorrecta(req.actual)) throw new Error("La contraseña actual no es correcta.");
  fijarClave(req.nueva);
  return {};
}

/** Menú del Panel: crear o reponer la contraseña (sirve si la olvidas). */
function contrasenaDocente() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt("Contraseña docente", "Escribe la NUEVA contraseña (mínimo 6 caracteres):", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt("Contraseña docente", "Repítela:", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  if (r1.getResponseText() !== r2.getResponseText()) return aviso("No coinciden. No se cambió nada.");
  try { fijarClave(r1.getResponseText()); aviso("Contraseña guardada."); } catch (e) { aviso(e.message); }
}

/* ======================= PORTAL Y CLASES ======================= */

function clasesTodas() {
  return datos("clases", () => leerTabla(hoja(HOJA.clases), ["CARPETA"]).filas.filter(f => f.ID).map(f => ({
    id: normId(f.ID), tipo: f.TIPO, unidad: f.UNIDAD, n: f.N, tema: f.TEMA, publicada: f.PUBLICADA === true,
    carpeta: (/\/folders\/([\w-]+)/.exec(f._formulas.CARPETA || "") || [])[1] || ""
  })));
}
const clasePublica = c => ({ id: c.id, tipo: c.tipo, unidad: c.unidad, n: c.n, tema: c.tema, publicada: c.publicada });

function apiPortal(req) {
  const s = sesionDe(req);
  const docente = s.rol === "docente";
  const clases = clasesTodas().filter(c => docente || c.publicada).map(clasePublica);
  const res = docente ? [] : resultadosTodos();
  const out = { clases, quizzes: quizzesTodos().filter(q => docente || !q.oculto).map(q => quizParaLista(q, s, res)) };
  if (docente) out.panel = SpreadsheetApp.getActive().getUrl();
  else { const todos = alumnosTodos(); out.alumnos = s.codigos.map(c => pub(todos.find(x => x.CODIGO === c))); }
  return out;
}

/** Quiz tal como sale en el portal o en una clase. Al alumno: quiénes de la sesión ya lo rindieron. */
const quizParaLista = (q, s, res) => ({
  id: q.id, titulo: q.titulo, clase: q.clase, abierto: q.abierto, oculto: q.oculto, repetir: q.repetir, npreg: q.npreg,
  rendidos: s.rol === "docente" ? undefined : s.codigos.filter(c => res.some(r => r.QUIZ === q.id && r.CODIGO === c))
});

const TIPO_MIME = {
  "application/vnd.google-apps.presentation": "presentacion", "application/vnd.google-apps.document": "documento",
  "application/vnd.google-apps.spreadsheet": "hoja", "application/vnd.google-apps.form": "encuesta",
  "application/pdf": "pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentacion",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "documento",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "hoja"
};
function tipoDeMime(m) {
  if (TIPO_MIME[m]) return TIPO_MIME[m];
  if (/^video\//.test(m)) return "video";
  if (/^image\//.test(m)) return "imagen";
  return "archivo";
}

/** Archivos "para ver" de la carpeta de la clase (no la semilla, no ALUMNOS/, no los que empiezan con _). */
function materialesDe(c) {
  const clave = "mat_" + c.id, enCache = cache().get(clave);
  if (enCache) return JSON.parse(enCache);
  let carpeta = null;
  try { carpeta = c.carpeta ? DriveApp.getFolderById(c.carpeta) : null; } catch (_) {}
  const lista = [];
  if (carpeta) {
    const it = carpeta.getFiles();
    while (it.hasNext()) {
      const f = it.next(), n = f.getName(), nl = n.toLowerCase();
      if (nl.indexOf("semilla") === 0 || nl.indexOf("profesor") === 0 || n.charAt(0) === "_") continue;
      try { if (f.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (_) {}
      lista.push({ titulo: n.replace(/\.[a-z0-9]{2,5}$/i, ""), url: f.getUrl(), tipo: tipoDeMime(f.getMimeType()) });
    }
  }
  lista.sort((a, b) => a.titulo.localeCompare(b.titulo, "es", { numeric: true }));
  cache().put(clave, JSON.stringify(lista), 300);    // archivos nuevos en Drive aparecen en ≤ 5 min (o Aula → Actualizar web ahora)
  return lista;
}

function apiClase(req) {
  const s = sesionDe(req);
  const docente = s.rol === "docente";
  const c = clasesTodas().find(x => x.id === normId(req.id));
  if (!c || (!docente && !c.publicada)) throw new Error("Esta clase no está disponible.");

  const todos = alumnosTodos();
  const misAlumnos = docente ? [] : s.codigos.map(cod => todos.find(x => x.CODIGO === cod)).filter(Boolean);
  const grupos = misAlumnos.map(a => a.GRUPO);

  const enlaces = datos("enlaces", () => leerTabla(hoja(HOJA.enlaces)).filas)
    .filter(f => normId(f.CLASE) === c.id && f.URL)
    .filter(f => docente || !f.PARA || f.PARA === "Todos" || grupos.indexOf(f.PARA) >= 0)
    .sort((a, b) => (Number(a.ORDEN) || 99) - (Number(b.ORDEN) || 99))
    .map(f => ({ titulo: f.TITULO || f.URL, url: f.URL, tipo: f.TIPO || "enlace", para: f.PARA || "Todos" }));

  // Cada alumno puede tener varias copias (una por semilla: un Doc y un Sheet, etc.). `url` = la primera, por compatibilidad.
  const entregas = datos("entregas", () => leerTabla(hoja(HOJA.entregas)).filas).filter(f => normId(f.CLASE) === c.id && f.ENLACE);
  const conArchivos = a => {
    const archivos = entregas.filter(x => x.CODIGO === a.CODIGO)
      .map(x => ({ titulo: x.TITULO || "Mi documento", tipo: x.TIPO || "documento", url: x.ENLACE }))
      .sort((p, q) => p.titulo.localeCompare(q.titulo));
    return Object.assign(pub(a), { archivos, url: archivos.length ? archivos[0].url : null });
  };
  const docs = (docente ? todos.filter(esActivo) : misAlumnos).map(conArchivos);

  const res = docente ? [] : resultadosTodos();
  const quizzes = quizzesTodos().filter(q => q.clase === c.id && (docente || !q.oculto)).map(q => quizParaLista(q, s, res));

  return { clase: clasePublica(c), materiales: materialesDe(c), enlaces, docs, quizzes, haySemilla: entregas.length > 0 };
}

/* ======================= QUIZ =======================
   Opciones de cada quiz (columnas de la pestaña Quiz):
     CLASE    u1c2 = quiz de esa clase · ec1u1 = EC virtual 1 de la unidad 1 · vacío = suelto (sale en el portal)
     OCULTO   los alumnos no lo ven en ningún lado
     ABIERTO  acepta respuestas (visible + cerrado = lo ven pero no pueden rendirlo; sí ven su nota)
     REPETIR  puede rendirlo otra vez (se queda la nota más alta)
     PUNTAJE  al terminar ve su nota
     ERRORES  al terminar ve qué respondió bien y mal, y la respuesta correcta
     PENALIZAR  descuenta 1 punto por cada vez que sale de la pestaña o minimiza
   Puntos: cada pregunta puede tener "puntos"; las que no tienen se reparten lo que falta para 20.
   Si al alumno le tocan solo algunas (MOSTRAR), sus preguntas se escalan para que siempre sumen 20. */

const SI_NO = (v, def) => v === "" || v === undefined || v === null ? def : (v === true || String(v).toUpperCase() === "TRUE");

function tablaFija(nombre, cab) {
  const sh = hoja(nombre), nueva = sh.getLastRow() === 0;
  asegurarCabecera(sh, cab);                       // agrega solas las columnas nuevas a hojas ya existentes
  if (nueva) estiloCabecera(sh, cab.length);
  return sh;
}
function quizzesTodos(fresco) {
  const leer = () => leerTabla(tablaFija("Quiz", CAB_QUIZ)).filas.filter(f => f.ID).map(f => {
    let preguntas = []; try { preguntas = JSON.parse(f.PREGUNTAS || "[]"); } catch (_) {}
    const abierto = SI_NO(f.ABIERTO, false);
    return { id: String(f.ID), titulo: f.TITULO, clase: normId(f.CLASE), mostrar: Number(f.MOSTRAR) || 0, abierto,
             oculto: SI_NO(f.OCULTO, !abierto),    // quizzes antiguos: cerrado = oculto, como antes
             repetir: SI_NO(f.REPETIR, false), puntaje: SI_NO(f.PUNTAJE, true), errores: SI_NO(f.ERRORES, false),
             penalizar: SI_NO(f.PENALIZAR, true),
             npreg: preguntas.length, preguntas, _fila: f._fila };
  });
  return fresco ? leer() : datos("quiz", leer);
}
const quizResumen = q => ({ id: q.id, titulo: q.titulo, clase: q.clase, mostrar: q.mostrar, npreg: q.npreg,
  abierto: q.abierto, oculto: q.oculto, repetir: q.repetir, puntaje: q.puntaje, errores: q.errores, penalizar: q.penalizar });

const redondear = (x, d) => { const f = Math.pow(10, d === undefined ? 2 : d); return Math.round(x * f) / f; };
/** Puntos de cada pregunta del banco: las fijas conservan los suyos; las vacías se reparten lo que falta para 20. */
function puntosBase(preguntas) {
  const fijas = preguntas.filter(p => p.puntos > 0), libres = preguntas.length - fijas.length;
  const suma = fijas.reduce((t, p) => t + p.puntos, 0);
  const cada = libres ? Math.max(0, 20 - suma) / libres : 0;
  const out = {}; preguntas.forEach(p => out[p.id] = p.puntos > 0 ? p.puntos : cada);
  return out;
}
/** Lo que vale cada pregunta para ESTE alumno: sus preguntas siempre suman 20. */
function puntosDe(q, ids) {
  const base = puntosBase(q.preguntas);
  const posible = ids.reduce((t, id) => t + (base[id] || 0), 0);
  const out = {}; ids.forEach(id => out[id] = posible > 0 ? (base[id] || 0) * 20 / posible : 20 / ids.length);
  return out;
}

function quizDe(id, fresco) {
  const q = quizzesTodos(fresco).find(x => x.id === String(id || ""));
  if (!q) throw new Error("No existe ese quiz.");
  return q;
}
function resultadosTodos(fresco) {
  const leer = () => leerTabla(tablaFija("Resultados", CAB_RES)).filas.filter(f => f.QUIZ);
  return fresco ? leer() : datos("res", leer);
}
const leerDetalle = r => { try { return JSON.parse(r.DETALLE || "[]"); } catch (_) { return []; } };
const resPublico = r => ({ codigo: r.CODIGO, alumno: r.ALUMNO, grupo: r.GRUPO, aciertos: r.ACIERTOS, total: r.TOTAL, nota: r.NOTA,
  correccion: r.CORRECCION === "" ? null : r.CORRECCION, incidentes: r.INCIDENTES, hora: r.HORA,
  intentos: Number(r.INTENTOS) || 1, descuento: Number(r.DESCUENTO) || 0, detalle: leerDetalle(r) });

/** Lo que el ALUMNO puede ver de un intento, según las opciones del quiz. */
function revisionDe(detalle, q) {
  const porId = {}; q.preguntas.forEach(p => porId[p.id] = p);
  return detalle.map(d => {
    const p = porId[d.id]; if (!p) return null;
    const orden = (d.orden && d.orden.length ? d.orden : p.alts.map((_, k) => k)).filter(k => p.alts[k] !== undefined);
    return { texto: p.texto, tema: p.tema, ok: d.ok,
             opciones: orden.map(k => ({ texto: p.alts[k], correcta: k === p.correcta, elegida: k === d.elegida })) };
  }).filter(Boolean);
}
function paraAlumno(q, intento) {
  const out = { intentos: intento.intentos || 1, puntaje: q.puntaje, errores: q.errores, descuento: intento.descuento || 0 };
  if (q.puntaje) Object.assign(out, { aciertos: intento.aciertos, total: intento.total,
    nota: intento.correccion != null && intento.correccion !== "" ? intento.correccion : intento.nota });
  if (q.errores) out.revision = revisionDe(intento.detalle || [], q);
  return out;
}

/** Escribe una fila entera de una sola vez (mucho más rápido que celda por celda). Conserva las columnas no indicadas. */
function escribirFila(sh, t, nFila, cambios) {
  const orig = t.filas.find(f => f._fila === nFila) || {};
  const fila = t.cab.map(c => c in cambios ? cambios[c] : (orig[c] === undefined ? "" : orig[c]));
  sh.getRange(nFila, 1, 1, t.cab.length).setValues([fila]);
}

function apiQuizLista(req) {
  sesionDe(req, "docente");
  const res = resultadosTodos();
  return { quizzes: quizzesTodos().map(q => Object.assign(quizResumen(q), { rindieron: res.filter(r => r.QUIZ === q.id).length })),
           clases: clasesTodas().map(clasePublica) };
}

function apiQuizVer(req) {
  sesionDe(req, "docente");
  const q = quizDe(req.id);
  return { quiz: Object.assign(quizResumen(q), { preguntas: q.preguntas }),
           resultados: resultadosTodos().filter(r => r.QUIZ === q.id).map(resPublico),
           alumnos: alumnosTodos().filter(esActivo).map(pub) };
}

function filaQuiz(d, id, preguntas) {
  return { ID: id, TITULO: String(d.titulo || "").trim(), CLASE: normId(d.clase), MOSTRAR: Math.max(0, Number(d.mostrar) || 0),
           ABIERTO: !!d.abierto && !d.oculto, OCULTO: !!d.oculto, REPETIR: !!d.repetir, PUNTAJE: d.puntaje !== false, ERRORES: !!d.errores,
           PENALIZAR: d.penalizar !== false, NPREG: preguntas.length, PREGUNTAS: JSON.stringify(preguntas), ACTUALIZADO: new Date() };
}

function apiQuizGuardar(req) {
  sesionDe(req, "docente");
  const d = req.quiz || {};
  if (!String(d.titulo || "").trim()) throw new Error("Ponle un título al quiz.");
  const preguntas = (d.preguntas || []).map((p, i) => {
    const alts = (p.alts || []).map(a => String(a || "").trim()).filter(Boolean);
    const texto = String(p.texto || "").trim();
    if (!texto) throw new Error(`La pregunta ${i + 1} está vacía.`);
    if (alts.length < 2) throw new Error(`La pregunta ${i + 1} necesita al menos 2 alternativas.`);
    const correcta = Number(p.correcta);
    if (!(correcta >= 0 && correcta < alts.length)) throw new Error(`Marca la respuesta correcta de la pregunta ${i + 1}.`);
    const pts = p.puntos === "" || p.puntos === null || p.puntos === undefined ? 0 : Number(String(p.puntos).replace(",", "."));
    if (!(pts >= 0)) throw new Error(`Los puntos de la pregunta ${i + 1} no son un número.`);
    return { id: p.id || "p" + Utilities.getUuid().slice(0, 8), tema: String(p.tema || "").trim(), texto, alts, correcta,
             puntos: pts > 0 ? redondear(pts) : null };
  });
  if (!preguntas.length) throw new Error("El quiz no tiene preguntas.");

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = tablaFija("Quiz", CAB_QUIZ), t = leerTabla(sh);
    const id = d.id || "qz" + Date.now().toString(36) + Utilities.getUuid().slice(0, 4);
    const fila = filaQuiz(d, id, preguntas);
    const existente = t.filas.find(f => String(f.ID) === id);
    if (existente) escribirFila(sh, t, existente._fila, fila);
    else sh.appendRow(filaDesde(t.cab, fila));
    invalidarCache(["quiz"]);
    return { id };
  } finally { lock.releaseLock(); }
}

/** Cambia solo las opciones (oculto/abierto/repetir/puntaje/errores) sin reenviar las preguntas: 1 llamada. */
function apiQuizOpciones(req) {
  sesionDe(req, "docente");
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = tablaFija("Quiz", CAB_QUIZ), t = leerTabla(sh);
    const f = t.filas.find(x => String(x.ID) === String(req.id || ""));
    if (!f) throw new Error("No existe ese quiz.");
    const o = req.opciones || {}, cambios = { ACTUALIZADO: new Date() };
    if ("oculto" in o) { cambios.OCULTO = !!o.oculto; if (o.oculto) cambios.ABIERTO = false; }
    if ("abierto" in o) { cambios.ABIERTO = !!o.abierto; if (o.abierto) cambios.OCULTO = false; }
    ["repetir", "puntaje", "errores", "penalizar"].forEach(k => { if (k in o) cambios[k.toUpperCase()] = !!o[k]; });
    escribirFila(sh, t, f._fila, cambios);
    invalidarCache(["quiz"]);
  } finally { lock.releaseLock(); }
  return { quiz: quizResumen(quizDe(req.id, true)) };
}

function apiQuizBorrar(req) {
  sesionDe(req, "docente");
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const q = quizDe(req.id, true);
    tablaFija("Quiz", CAB_QUIZ).deleteRow(q._fila);
    if (req.conResultados) {
      const sh = tablaFija("Resultados", CAB_RES);
      leerTabla(sh).filas.filter(r => r.QUIZ === q.id).map(r => r._fila).sort((a, b) => b - a).forEach(n => sh.deleteRow(n));
    }
    invalidarCache(["quiz", "res"]);
  } finally { lock.releaseLock(); }
  return {};
}

const barajar = a => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = x[i]; x[i] = x[j]; x[j] = t; } return x; };

function alumnoDeSesion(s, codigo) {
  if (s.rol !== "alumno" || s.codigos.indexOf(codigo) < 0) throw new Error("Ese alumno no está en esta sesión.");
  return alumnosTodos().find(x => x.CODIGO === codigo);
}

/** Entrega las preguntas SIN la respuesta correcta. Guarda cuáles le tocaron para corregir después. */
function apiQuizRendir(req) {
  const s = sesionDe(req, "alumno");
  const a = alumnoDeSesion(s, req.codigo);
  const q = quizDe(req.id);
  if (q.oculto) throw new Error("Este quiz no está disponible.");
  const info = { titulo: q.titulo, repetir: q.repetir, puntaje: q.puntaje, errores: q.errores, penalizar: q.penalizar };
  const previo = resultadosTodos().find(r => r.QUIZ === q.id && r.CODIGO === a.CODIGO);
  const prev = previo ? paraAlumno(q, resPublico(previo)) : null;
  if (prev && (!q.repetir || !q.abierto)) return Object.assign(info, { yaRendido: prev, abierto: q.abierto });
  if (!q.abierto) throw new Error("Este quiz está cerrado.");
  const total = q.mostrar > 0 ? Math.min(q.mostrar, q.preguntas.length) : q.preguntas.length;
  const elegidas = barajar(q.preguntas).slice(0, total);
  const ids = elegidas.map(p => p.id), pts = puntosDe(q, ids);
  cache().put(`ex_${req.token}_${q.id}_${a.CODIGO}`, JSON.stringify(ids), TOKEN_SEG);
  return Object.assign(info, { previo: prev, preguntas: elegidas.map(p => ({
    id: p.id, tema: p.tema, texto: p.texto, puntos: redondear(pts[p.id]), opciones: barajar(p.alts.map((t, i) => ({ i, texto: t })))
  })) });
}

function apiQuizEnviar(req) {
  const s = sesionDe(req, "alumno");
  const a = alumnoDeSesion(s, req.codigo);
  const q = quizDe(req.id);
  const clave = `ex_${req.token}_${q.id}_${a.CODIGO}`, raw = cache().get(clave);
  if (!raw) throw new Error("El intento expiró. Vuelve a abrir el quiz.");
  const ids = JSON.parse(raw);
  const porId = {}; q.preguntas.forEach(p => porId[p.id] = p);
  const resp = {}; (req.respuestas || []).forEach(r => resp[r.id] = r);
  const pts = puntosDe(q, ids);
  const detalle = ids.map(id => {
    const r = resp[id] || {}, p = porId[id];
    return { id, orden: r.orden || [], elegida: r.elegida === undefined ? null : Number(r.elegida), ok: !!p && Number(r.elegida) === p.correcta,
             pts: redondear(pts[id]) };
  });
  const aciertos = detalle.filter(d => d.ok).length, total = ids.length;
  const incidentes = Math.max(0, Number(req.incidentes) || 0);
  const bruta = redondear(ids.reduce((t, id, k) => t + (detalle[k].ok ? pts[id] : 0), 0), 1);
  const descuento = q.penalizar ? incidentes : 0;                        // 1 punto por cada salida de la pestaña
  const nota = Math.max(0, redondear(bruta - descuento, 1));
  let intentos = 1, mejor = null;

  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = tablaFija("Resultados", CAB_RES), t = leerTabla(sh);
    const previo = t.filas.find(r => r.QUIZ === q.id && r.CODIGO === a.CODIGO);
    const intento = { ACIERTOS: aciertos, TOTAL: total, NOTA: nota, DESCUENTO: descuento, HORA: new Date(), DETALLE: JSON.stringify(detalle) };
    if (previo) {
      if (!q.repetir) throw new Error("Ya rendiste este quiz.");
      intentos = (Number(previo.INTENTOS) || 1) + 1;
      const cambios = { INTENTOS: intentos, INCIDENTES: (Number(previo.INCIDENTES) || 0) + incidentes };
      if (nota >= Number(previo.NOTA)) Object.assign(cambios, intento);          // se queda la nota más alta
      else mejor = Number(previo.NOTA);
      escribirFila(sh, t, previo._fila, cambios);
    } else {
      sh.appendRow(filaDesde(t.cab, Object.assign({ QUIZ: q.id, CODIGO: a.CODIGO, ALUMNO: a["APELLIDOS Y NOMBRES"], GRUPO: a.GRUPO,
        CORRECCION: "", INCIDENTES: incidentes, INTENTOS: 1 }, intento)));
    }
    invalidarCache(["res"]);
  } finally { lock.releaseLock(); }
  cache().remove(clave);
  const out = paraAlumno(q, { aciertos, total, nota, intentos, detalle, descuento });
  if (q.puntaje && mejor != null) out.mejor = mejor;
  return Object.assign(out, { repetir: q.repetir && q.abierto });
}

function apiQuizCorregir(req) {
  sesionDe(req, "docente");
  const sh = tablaFija("Resultados", CAB_RES), t = leerTabla(sh);
  const f = t.filas.find(r => r.QUIZ === req.id && r.CODIGO === req.codigo);
  if (!f) throw new Error("No hay resultado para ese alumno.");
  const v = req.correccion === null || req.correccion === "" ? "" : Math.max(0, Math.min(20, Number(req.correccion)));
  escribir(sh, t, f._fila, { CORRECCION: v });
  invalidarCache(["res"]);
  return {};
}

function apiQuizReiniciar(req) {
  sesionDe(req, "docente");
  const codigos = req.codigos || [];
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = tablaFija("Resultados", CAB_RES), t = leerTabla(sh);
    t.filas.filter(r => r.QUIZ === req.id && codigos.indexOf(r.CODIGO) >= 0)
      .map(r => r._fila).sort((a, b) => b - a).forEach(n => sh.deleteRow(n));
    invalidarCache(["res"]);
  } finally { lock.releaseLock(); }
  return {};
}

/* ======================= UTILIDADES ======================= */

function valorConfig(clave) {
  const sh = hoja(HOJA.config);
  if (sh.getLastRow() < 2) return "";
  const fila = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().find(r => r[0] === clave);
  return fila ? fila[1] : "";
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
