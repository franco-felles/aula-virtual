/* ==========================================================
   PANEL AULA VIRTUAL  ·  Apps Script del "Panel Aula Virtual"

   Se pega en: Panel Aula Virtual → Extensiones → Apps Script.
   Requiere el servicio avanzado "Drive API" (Servicios → + → Drive API)
   para leer los PDF de la institución.

   Menú "Aula" (aparece al abrir la hoja):
     · Configurar panel ............ crea pestañas, listas desplegables y formato (1.ª vez)
     · Importar alumnos (PDF) ...... lee los PDF de <MES>/LISTAS
     · Importar alumnos (texto) .... lee lo pegado en la pestaña "Importar"
     · Nueva clase / EC ............ crea la carpeta y su fila en "Clases"
     · Generar copias .............. copia la semilla de cada clase para cada alumno
     · Actualizar laboratorio ...... recalcula "Comparte con" y el mapa de PCs
     · Limpiar copias borradas ..... quita de Entregas lo que mandaste a la papelera
     · Copiado automático .......... cada 15 min crea las copias que falten (solo clases PUBLICADAS)
     · Actualizar web ahora ........ borra la memoria de la web (lo nuevo se ve al instante)
     · Web rápida .................. el Panel escribe conexion/datos.json en GitHub: la web carga al instante
     · Publicar en la web ahora .... sube esos datos públicos en el momento
     · Contraseña docente .......... crea o repone tu clave de la web (api.gs)

   Estructura en Drive:
     AULA VIRTUAL/                 (carpeta donde está este Panel)
       BIBLIOTECA/                 semillas reutilizables
       NOV 2026/                   carpeta del mes (Config → MES)
         LISTAS/                   PDF de la institución
         U1/ C1 - Tema/            SEMILLA - profesor  +  ALUMNOS/ (copias)
         U1/ EC1 - Tema/           (igual que una clase)
         U2/ ...
   Orden de cada unidad: C1 · C2 · EC1 · C4 · C5 · EC2 · C7 · C8 · EC3
   IDs: u1c4 = clase 4 de la unidad 1 · ec2u1 = evaluación continua 2 de la unidad 1
   ========================================================== */

const HOJA = {
  config: "Config", alumnos: "Alumnos", clases: "Clases", entregas: "Entregas",
  enlaces: "Enlaces", lab: "Laboratorio", importar: "Importar"
};

const CABECERAS = {
  Alumnos:  ["CODIGO", "APELLIDOS Y NOMBRES", "N LISTA", "ESTADO", "GRUPO", "N", "PC", "COMPARTE CON", "ORIGEN", "NOTA"],
  Clases:   ["ID", "TIPO", "UNIDAD", "N", "TEMA", "CARPETA", "PUBLICADA", "COPIAS", "NOTA"],
  Entregas: ["CLASE", "CODIGO", "GRUPO", "N", "ALUMNO", "ENLACE", "ARCHIVO_ID", "CREADO", "SEMILLA", "TITULO", "TIPO"],
  Enlaces:  ["CLASE", "ORDEN", "TIPO", "TITULO", "URL", "PARA"]
};

const ESTADOS = ["Pendiente", "Activo", "No asiste", "Retirado"];
const TIPOS_ENLACE = ["enlace", "documento", "hoja", "presentacion", "encuesta", "video", "web", "juego"];
const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SET", "OCT", "NOV", "DIC"];
const MESES_LARGOS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
                      "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const LIMITE_MS = 5 * 60 * 1000;   // Apps Script corta a los 6 min; paramos antes

/* ======================= MENÚ ======================= */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Aula")
    .addItem("Configurar panel (primera vez)", "configurarPanel")
    .addSeparator()
    .addItem("Importar alumnos (PDF en LISTAS)", "importarAlumnosPDF")
    .addItem("Importar alumnos (texto pegado en «Importar»)", "importarAlumnosTexto")
    .addSeparator()
    .addItem("Asignar grupo a los seleccionados…", "asignarGrupoSeleccion")
    .addSeparator()
    .addItem("Nueva clase / EC…", "nuevaClase")
    .addItem("Generar copias", "generarCopias")
    .addItem("Limpiar copias borradas", "limpiarCopias")
    .addItem("Copiado automático (activar / desactivar)", "alternarCopiasAuto")
    .addItem("Actualizar web ahora", "refrescarWeb")
    .addItem("Web rápida (activar / desactivar)", "alternarWebRapida")
    .addItem("Publicar en la web ahora", "publicarWebAhora")
    .addSeparator()
    .addItem("Actualizar laboratorio", "actualizarLaboratorio")
    .addItem("Abrir carpeta del mes", "abrirCarpetaMes")
    .addSeparator()
    .addItem("Contraseña docente…", "contrasenaDocente")
    .addToUi();
}

/* ======================= CONFIGURACIÓN ======================= */

function configurarPanel() {
  const ss = SpreadsheetApp.getActive();

  // Config
  const cfg = hoja(HOJA.config);
  if (cfg.getLastRow() < 2) {
    const raiz = DriveApp.getFileById(ss.getId()).getParents().next();
    const hoy = new Date();
    cfg.getRange(1, 1, 5, 3).setValues([
      ["CLAVE", "VALOR", "PARA QUÉ"],
      ["MES", MESES[hoy.getMonth()] + " " + hoy.getFullYear(), "Nombre de la carpeta del mes actual (ej. NOV 2026)"],
      ["GRUPOS", "G1,G2", "Grupos separados por coma"],
      ["PCS", 30, "Cantidad de PC de la sede (lo cambias al llegar)"],
      ["RAIZ_ID", raiz.getId(), "Carpeta AULA VIRTUAL (no tocar)"]
    ]);
    estiloCabecera(cfg, 3);
    cfg.setColumnWidth(2, 200); cfg.setColumnWidth(3, 380);
  }
  // Claves que se agregaron después (no pisa lo que ya escribiste)
  const existentes = cfg.getRange(1, 1, cfg.getLastRow(), 1).getValues().map(r => r[0]);
  [["DOCENTE", "Docente", "Tu nombre como aparece en la web"]].forEach(f => { if (existentes.indexOf(f[0]) < 0) cfg.appendRow(f); });

  // Tablas
  Object.keys(CABECERAS).forEach(n => {
    const sh = hoja(n);
    asegurarCabecera(sh, CABECERAS[n]);
    estiloCabecera(sh, CABECERAS[n].length);
  });

  const grupos = config().grupos;
  const al = hoja(HOJA.alumnos);
  validacionLista(al, colDe(al, "ESTADO"), ESTADOS);
  validacionLista(al, colDe(al, "GRUPO"), grupos);
  al.setColumnWidth(colDe(al, "APELLIDOS Y NOMBRES"), 320);
  al.setColumnWidth(colDe(al, "COMPARTE CON"), 260);
  al.getRange(2, colDe(al, "COMPARTE CON"), al.getMaxRows() - 1, 1).setFontColor("#9a3412");

  const cl = hoja(HOJA.clases);   // las casillas PUBLICADA se crean fila por fila (si no, appendRow escribe al final de la hoja)
  cl.setColumnWidth(colDe(cl, "TEMA"), 280);

  const en = hoja(HOJA.enlaces);
  validacionLista(en, colDe(en, "TIPO"), TIPOS_ENLACE);
  validacionLista(en, colDe(en, "PARA"), ["Todos"].concat(grupos));
  en.getRange(2, 1, en.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(cl.getRange("A2:A"), true).setAllowInvalid(false).build());
  en.setColumnWidth(colDe(en, "TITULO"), 260); en.setColumnWidth(colDe(en, "URL"), 320);

  const imp = hoja(HOJA.importar);
  if (imp.getLastRow() === 0) imp.getRange("A1").setValue("Pega aquí (desde la celda A2) el texto copiado del PDF de la institución y usa Aula → Importar alumnos (texto).");

  hoja(HOJA.lab);
  ["Hoja 1", "Sheet1", "Hoja1"].forEach(n => { const s = ss.getSheetByName(n); if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s); });

  carpetaMes(); // crea la carpeta del mes si no existe
  ss.setActiveSheet(al);
  aviso("Panel listo. Siguiente paso: deja los PDF de la institución en " + config().mes + "/LISTAS y usa Aula → Importar alumnos (PDF).");
}

/* ======================= IMPORTAR ALUMNOS ======================= */

function importarAlumnosPDF() {
  const listas = subcarpeta(carpetaMes(), "LISTAS");
  const it = listas.getFilesByType(MimeType.PDF);
  const lotes = [];
  while (it.hasNext()) {
    const f = it.next();
    lotes.push({ origen: "PDF " + f.getName(), texto: pdfATexto(f) });
  }
  if (!lotes.length) return aviso("No hay PDF en " + config().mes + "/LISTAS.");
  fusionarAlumnos(lotes);
}

function importarAlumnosTexto() {
  const imp = hoja(HOJA.importar);
  if (imp.getLastRow() < 2) return aviso("Pega el texto en la pestaña «Importar» desde la celda A2.");
  const texto = imp.getRange(2, 1, imp.getLastRow() - 1, Math.max(1, imp.getLastColumn()))
    .getDisplayValues().map(f => f.join(" ")).join("\n");
  fusionarAlumnos([{ origen: "Texto pegado", texto }]);
}

/** Convierte el PDF a Google Doc temporal (Drive lo lee), extrae el texto y lo borra. */
function pdfATexto(file) {
  const tmp = Drive.Files.copy({ name: "_tmp_" + file.getName(), mimeType: MimeType.GOOGLE_DOCS },
                               file.getId(), { ocrLanguage: "es" });
  try { return DocumentApp.openById(tmp.id).getBody().getText(); }
  finally { DriveApp.getFileById(tmp.id).setTrashed(true); }
}

/** Saca { mes, alumnos:[{n, codigo, nombre}] } del texto del "Registro de evaluación". */
function leerRegistro(texto) {
  const t = texto.toUpperCase().replace(/ /g, " ");
  const alumnos = [];
  const re = /(?:^|\s)(\d{1,3})\s+(\d{4}[A-Z]\d{4})\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'.\- ]*[A-ZÁÉÍÓÚÑÜ])/g;
  let m;
  while ((m = re.exec(t))) alumnos.push({ n: Number(m[1]), codigo: m[2], nombre: m[3].replace(/\s+/g, " ").trim() });
  const mm = /MES\s+([A-ZÁÉÍÓÚ]+)/.exec(t), aa = /AÑO\s+(\d{4})/.exec(t);
  let mes = "";
  if (mm && aa) { const i = MESES_LARGOS.indexOf(mm[1].replace("SEPTIEMBRE", "SETIEMBRE")); if (i >= 0) mes = MESES[i] + " " + aa[1]; }
  return { mes, alumnos };
}

function fusionarAlumnos(lotes) {
  const sh = hoja(HOJA.alumnos);
  const tabla = leerTabla(sh);
  const porCodigo = {};
  tabla.filas.forEach(f => porCodigo[f.CODIGO] = f);

  let nuevos = 0, total = 0;
  const vistos = {}, avisos = [];
  const mesCfg = config().mes;
  lotes.forEach(l => {
    const r = leerRegistro(l.texto);
    if (r.mes && r.mes !== mesCfg) avisos.push(`«${l.origen}» es de ${r.mes} y el Panel está en ${mesCfg}.`);
    if (!r.alumnos.length) avisos.push(`No encontré alumnos en «${l.origen}».`);
    r.alumnos.forEach(a => {
      total++; vistos[a.codigo] = true;
      const f = porCodigo[a.codigo];
      if (f) {
        escribir(sh, tabla, f._fila, { "N LISTA": a.n, NOTA: f.NOTA === "Ya no figura en la lista" ? "" : f.NOTA });
      } else {
        sh.appendRow(filaDesde(tabla.cab, { CODIGO: a.codigo, "APELLIDOS Y NOMBRES": a.nombre, "N LISTA": a.n,
                                            ESTADO: "Pendiente", ORIGEN: l.origen }));
        porCodigo[a.codigo] = { _fila: sh.getLastRow() }; nuevos++;
      }
    });
  });

  // Quien vino de un PDF y ya no aparece en ninguno
  if (lotes.every(l => l.origen.indexOf("PDF") === 0)) {
    tabla.filas.forEach(f => {
      if (String(f.ORIGEN).indexOf("PDF") === 0 && !vistos[f.CODIGO])
        escribir(sh, tabla, f._fila, { NOTA: "Ya no figura en la lista" });
    });
  }
  ordenarAlumnos();
  actualizarLaboratorio();
  invalidarCache();
  aviso(`Leídos ${total} alumnos · ${nuevos} nuevos.` + (avisos.length ? "\n\n⚠ " + avisos.join("\n⚠ ") : "") +
        "\n\nAhora asigna GRUPO (y PC) en la pestaña Alumnos cuando los conozcas.");
}

function ordenarAlumnos() {
  const sh = hoja(HOJA.alumnos);
  SpreadsheetApp.flush();   // asegura que las filas recién agregadas entren al orden
  if (sh.getLastRow() > 2)
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).sort({ column: colDe(sh, "APELLIDOS Y NOMBRES"), ascending: true });
}

/* ======================= GRUPOS, PCs Y LABORATORIO ======================= */

/** Al editar Alumnos: asignar grupo activa al alumno y renumera; cambios de PC refrescan el mapa. */
function onEdit(e) {
  const sh = e.range.getSheet();
  const MEM = { Alumnos: "alumnos", Clases: "clases", Enlaces: "enlaces", Entregas: "entregas", Quiz: "quiz", Resultados: "res" };
  if (MEM[sh.getName()]) { try { invalidarCache([MEM[sh.getName()]]); } catch (_) {} }   // la web ve el cambio al instante
  if (sh.getName() !== HOJA.alumnos || e.range.getRow() < 2) return;
  const cGrupo = colDe(sh, "GRUPO"), cPC = colDe(sh, "PC"), cEstado = colDe(sh, "ESTADO");
  const c = e.range.getColumn();
  if (c <= cGrupo && cGrupo <= e.range.getLastColumn()) {
    const unaCelda = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1;
    for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
      const grupo = sh.getRange(r, cGrupo).getValue();
      const est = sh.getRange(r, cEstado);
      if (grupo && est.getValue() !== "Retirado") est.setValue("Activo");    // si le das grupo, asistió
      // Cambió de grupo (o lo quitaste): pierde su número y se renumera en el grupo nuevo
      const cambio = unaCelda ? String(e.oldValue || "") !== String(e.value || "") : !grupo;
      if (cambio) sh.getRange(r, colDe(sh, "N")).clearContent();
    }
    numerarGrupos();
  }
  if ([cGrupo, cPC, cEstado].some(x => e.range.getColumn() <= x && x <= e.range.getLastColumn())) actualizarLaboratorio();
  try { invalidarCache(["alumnos"]); } catch (_) {}      // número de orden / PC recién calculados
}

/** Menú: selecciona alumnos (cualquier celda de sus filas, puedes usar Ctrl o Shift para varias) y asígnales un grupo de una vez.
 *  Quedan Activos, reciben su número dentro del grupo y el Laboratorio se actualiza. Vacío = quitar el grupo. */
function asignarGrupoSeleccion() {
  const ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActive(), sh = ss.getActiveSheet();
  if (sh.getName() !== HOJA.alumnos) return aviso("Primero ve a la pestaña Alumnos y selecciona las filas de los alumnos.");
  const filas = [];
  (ss.getActiveRangeList() ? ss.getActiveRangeList().getRanges() : [sh.getActiveRange()]).forEach(r => {
    for (let f = r.getRow(); f <= r.getLastRow(); f++) if (f >= 2 && f <= sh.getLastRow() && filas.indexOf(f) < 0) filas.push(f);
  });
  if (!filas.length) return aviso("Selecciona una o varias filas de alumnos (desde la fila 2).");

  const grupos = config().grupos;
  const resp = ui.prompt("Asignar grupo", `${filas.length} alumno(s) seleccionado(s).\n\nEscribe el grupo (${grupos.join(", ")}).\nDéjalo vacío para QUITAR el grupo.`, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const t = resp.getResponseText().trim().toUpperCase();
  const g = grupos.find(x => x.toUpperCase() === t || x.toUpperCase() === "G" + t) || "";
  if (t && !g) return aviso(`«${t}» no es un grupo. Grupos válidos: ${grupos.join(", ")} (se cambian en Config → GRUPOS).`);

  const cG = colDe(sh, "GRUPO"), cE = colDe(sh, "ESTADO"), cN = colDe(sh, "N");
  let cambiados = 0;
  filas.forEach(f => {
    if (String(sh.getRange(f, cG).getValue()) === g) return;                 // ya estaba en ese grupo: conserva su número
    sh.getRange(f, cG).setValue(g);
    sh.getRange(f, cN).clearContent();                                       // se renumera dentro del grupo nuevo
    const est = sh.getRange(f, cE).getValue();
    if (g && est !== "Retirado") sh.getRange(f, cE).setValue("Activo");          // si le das grupo, asistió
    if (!g && est === "Activo") sh.getRange(f, cE).setValue("Pendiente");
    cambiados++;
  });
  numerarGrupos();
  actualizarLaboratorio();
  invalidarCache(["alumnos"]);
  aviso(g ? `${cambiados} alumno(s) pasaron a ${g} (Activos y numerados).` + (filas.length > cambiados ? `\n${filas.length - cambiados} ya estaban en ${g}.` : "")
          : `Se quitó el grupo a ${cambiados} alumno(s) (vuelven a Pendiente).`);
}

/** Da número de orden dentro de cada grupo (1, 2, 3…) a los activos que aún no tienen. Nunca cambia uno ya dado. */
function numerarGrupos() {
  const sh = hoja(HOJA.alumnos);
  const tabla = leerTabla(sh);
  const max = {};
  tabla.filas.forEach(f => { if (f.GRUPO && f.N) max[f.GRUPO] = Math.max(max[f.GRUPO] || 0, Number(f.N)); });
  tabla.filas.filter(f => f.GRUPO && !f.N && f.ESTADO === "Activo")
    .sort((a, b) => String(a["APELLIDOS Y NOMBRES"]).localeCompare(String(b["APELLIDOS Y NOMBRES"])))
    .forEach(f => { max[f.GRUPO] = (max[f.GRUPO] || 0) + 1; escribir(sh, tabla, f._fila, { N: max[f.GRUPO] }); });
}

const numPC = v => { const m = /\d+/.exec(String(v || "")); return m ? Number(m[0]) : null; };

function actualizarLaboratorio() {
  const cfg = config();
  const sh = hoja(HOJA.alumnos);
  const tabla = leerTabla(sh);
  const mapa = {};   // grupo -> pc -> [nombres]
  const activos = tabla.filas.filter(f => f.GRUPO && numPC(f.PC) && f.ESTADO === "Activo");
  activos.forEach(f => {
    const g = mapa[f.GRUPO] = mapa[f.GRUPO] || {};
    (g[numPC(f.PC)] = g[numPC(f.PC)] || []).push(f["APELLIDOS Y NOMBRES"]);
  });

  // Columna COMPARTE CON + color
  const cComp = colDe(sh, "COMPARTE CON");
  tabla.filas.forEach(f => {
    const lista = (f.GRUPO && numPC(f.PC) && f.ESTADO === "Activo") ? mapa[f.GRUPO][numPC(f.PC)] : [];
    const otros = (lista || []).filter(n => n !== f["APELLIDOS Y NOMBRES"]);
    sh.getRange(f._fila, cComp).setValue(otros.join(" + "));
    sh.getRange(f._fila, 1, 1, tabla.cab.length).setBackground(otros.length ? "#fef3c7" : null);
  });

  // Mapa del laboratorio
  const lab = hoja(HOJA.lab);
  lab.clear();
  const grupos = cfg.grupos;
  const usadas = activos.map(f => numPC(f.PC));
  const total = Math.max(Number(cfg.pcs) || 0, usadas.length ? Math.max.apply(null, usadas) : 0);
  const filas = [["PC"].concat(grupos)];
  const fondos = [Array(grupos.length + 1).fill(null)];
  for (let p = 1; p <= total; p++) {
    const fila = ["PC " + String(p).padStart(2, "0")], fondo = [null];
    grupos.forEach(g => {
      const n = (mapa[g] && mapa[g][p]) || [];
      fila.push(n.length ? (n.length > 1 ? "⚠ " : "") + n.join(" + ") : "— libre");
      fondo.push(n.length > 1 ? "#fde68a" : n.length ? null : "#f3f4f6");
    });
    filas.push(fila); fondos.push(fondo);
  }
  lab.getRange(1, 1, filas.length, filas[0].length).setValues(filas).setBackgrounds(fondos);
  estiloCabecera(lab, filas[0].length);
  grupos.forEach((g, i) => lab.setColumnWidth(i + 2, 360));
}

/* ======================= CLASES ======================= */

function nuevaClase() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt("Nueva clase o EC",
    "Escribe:\n  u1 4      → clase 4 de la unidad 1\n  u1 ec2    → evaluación continua 2 de la unidad 1\n\n" +
    "Clases: 1, 2, 4, 5, 7, 8 · EC: 1, 2, 3 (van en el lugar de la 3, 6 y 9)", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const t = r1.getResponseText().toLowerCase().replace(/\s+/g, "");
  let m, info;
  if ((m = /^u(\d)c?(\d{1,2})$/.exec(t))) info = { tipo: "Clase", unidad: Number(m[1]), n: Number(m[2]) };
  else if ((m = /^u(\d)ec(\d)$/.exec(t))) info = { tipo: "EC", unidad: Number(m[1]), n: Number(m[2]) };
  else if ((m = /^ec(\d)u(\d)$/.exec(t))) info = { tipo: "EC", unidad: Number(m[2]), n: Number(m[1]) };
  else return aviso("No entendí «" + r1.getResponseText() + "». Ejemplos: u1 4  ·  u1 ec2");
  if (info.tipo === "Clase" && (info.n % 3 === 0 || info.n < 1 || info.n > 8))
    return aviso(info.n % 3 === 0 ? `La «clase ${info.n}» es la EC${info.n / 3}. Escribe: u${info.unidad} ec${info.n / 3}` : "Las clases van de la 1 a la 8 (sin 3 ni 6).");
  if (info.tipo === "EC" && (info.n < 1 || info.n > 3)) return aviso("Las EC van de la 1 a la 3.");
  info.id = info.tipo === "EC" ? `ec${info.n}u${info.unidad}` : `u${info.unidad}c${info.n}`;

  const cl = hoja(HOJA.clases), tabla = leerTabla(cl);
  if (tabla.filas.some(f => f.ID === info.id)) return aviso(info.id + " ya existe en la pestaña Clases.");

  const r2 = ui.prompt("Tema", "Tema de " + info.id + " (puedes dejarlo vacío):", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  info.tema = r2.getResponseText().trim();

  const r3 = ui.prompt("Semilla",
    "¿Creo una semilla vacía para editar?\n  doc · hoja · presentacion\nDéjalo vacío si vas a subir/copiar tu propio archivo " +
    "(llámalo «SEMILLA …» o «profesor»).", ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;

  const mes = carpetaMes();
  const carpeta = subcarpeta(subcarpeta(mes, "U" + info.unidad), (info.tipo === "EC" ? "EC" : "C") + info.n + (info.tema ? " - " + info.tema : ""));
  subcarpeta(carpeta, "ALUMNOS");

  const tipoSemilla = r3.getResponseText().trim().toLowerCase();
  const nombreSemilla = "SEMILLA - profesor - " + info.id + (info.tema ? " - " + info.tema : "");
  let semilla = null;
  if (/^doc/.test(tipoSemilla)) semilla = DocumentApp.create(nombreSemilla).getId();
  else if (/^hoja|^sheet|^excel/.test(tipoSemilla)) semilla = SpreadsheetApp.create(nombreSemilla).getId();
  else if (/^pres|^diap|^slide/.test(tipoSemilla)) semilla = SlidesApp.create(nombreSemilla).getId();
  if (semilla) DriveApp.getFileById(semilla).moveTo(carpeta);

  cl.appendRow(filaDesde(tabla.cab, {
    ID: info.id, TIPO: info.tipo, UNIDAD: info.unidad, N: info.n, TEMA: info.tema,
    CARPETA: `=HYPERLINK("${carpeta.getUrl()}","abrir carpeta")`, PUBLICADA: false, COPIAS: 0
  }));
  cl.getRange(cl.getLastRow(), colDe(cl, "PUBLICADA")).insertCheckboxes();
  invalidarCache(["clases"]);
  aviso(`Creada ${info.id}.\n\n` + (semilla ? "Edita la semilla en su carpeta" : "Pon tu archivo semilla en su carpeta") +
        " y luego usa Aula → Generar copias.");
}

/** Todas las semillas de la carpeta: archivos cuyo nombre empieza con «SEMILLA» o «profesor» (puede haber varias: un Doc y un Sheet…). */
function semillasDe(carpeta) {
  const out = [], it = carpeta.getFiles();
  while (it.hasNext()) {
    const f = it.next(), n = f.getName().toLowerCase();
    if (n.indexOf("semilla") === 0 || n.indexOf("profesor") === 0) out.push(f);
  }
  return out.sort((a, b) => a.getName().localeCompare(b.getName()));
}

/** Nombre que verá el alumno: «SEMILLA - Práctica Excel» → «Práctica Excel». Sin texto extra → el tipo de archivo. */
function etiquetaSemilla(f, idClase) {
  let t = f.getName().replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/^(semilla|profesor)\b[\s\-–_:]*/i, "").replace(/^(profesor)\b[\s\-–_:]*/i, "");
  if (idClase) t = t.replace(new RegExp("^" + idClase + "\\b[\\s\\-–_:]*", "i"), "");
  t = t.trim();
  const tipo = tipoDeMime(f.getMimeType());
  return t || ({ documento: "Documento", hoja: "Hoja de cálculo", presentacion: "Presentación" })[tipo] || "Mi documento";
}

function carpetaDeClase(fila) {
  const m = /HYPERLINK\("[^"]*\/folders\/([\w-]+)/.exec(fila._formulas.CARPETA || "");
  return m ? DriveApp.getFolderById(m[1]) : null;
}

/* ======================= COPIAS ======================= */

/** Crea las copias que falten (una por semilla y alumno activo). soloPublicadas: usado por el copiado automático.
 *  No muestra ventanas (lo usa también el activador); devuelve un resumen. */
function generarCopiasNucleo(soloPublicadas) {
  const inicio = Date.now();
  numerarGrupos();
  const alumnos = leerTabla(hoja(HOJA.alumnos)).filas
    .filter(f => f.ESTADO === "Activo" && f.GRUPO && f.N)
    .sort((a, b) => (a.GRUPO + String(a.N).padStart(3, "0")).localeCompare(b.GRUPO + String(b.N).padStart(3, "0")));
  const r = { creadas: 0, cortado: false, sinSemilla: [], resumen: [], sinAlumnos: !alumnos.length };
  if (!alumnos.length) return r;

  const shE = hoja(HOJA.entregas);
  asegurarCabecera(shE, CABECERAS.Entregas);
  const tE = leerTabla(shE);
  const hechas = {};   // clase|código|semilla  (filas antiguas sin SEMILLA cuentan como la única semilla)
  tE.filas.forEach(f => hechas[f.CLASE + "|" + f.CODIGO + "|" + (f.SEMILLA || "*")] = true);
  const yaTiene = (clase, cod, sem, unica) => hechas[clase + "|" + cod + "|" + sem] || (unica && hechas[clase + "|" + cod + "|*"]);

  const shC = hoja(HOJA.clases), tC = leerTabla(shC, ["CARPETA"]);
  for (const clase of tC.filas) {
    if (soloPublicadas && clase.PUBLICADA !== true) continue;
    const carpeta = carpetaDeClase(clase);
    if (!carpeta) { r.sinSemilla.push(clase.ID + " (sin carpeta)"); continue; }
    const semillas = semillasDe(carpeta);
    if (!semillas.length) { r.sinSemilla.push(clase.ID); continue; }
    const destino = subcarpeta(carpeta, "ALUMNOS");
    let n = 0;
    for (const semilla of semillas) {
      const sid = semilla.getId(), titulo = etiquetaSemilla(semilla, clase.ID), tipo = tipoDeMime(semilla.getMimeType());
      for (const a of alumnos) {
        if (yaTiene(clase.ID, a.CODIGO, sid, semillas.length === 1)) continue;
        if (Date.now() - inicio > LIMITE_MS) { r.cortado = true; break; }
        const nombre = `${a.GRUPO}-${String(a.N).padStart(2, "0")} - ${a["APELLIDOS Y NOMBRES"]} - ${clase.ID}` + (semillas.length > 1 ? " - " + titulo : "");
        const copia = semilla.makeCopy(nombre, destino);
        copia.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
        shE.appendRow(filaDesde(tE.cab, { CLASE: clase.ID, CODIGO: a.CODIGO, GRUPO: a.GRUPO, N: a.N,
          ALUMNO: a["APELLIDOS Y NOMBRES"], ENLACE: copia.getUrl(), ARCHIVO_ID: copia.getId(), CREADO: new Date(),
          SEMILLA: sid, TITULO: titulo, TIPO: tipo }));
        hechas[clase.ID + "|" + a.CODIGO + "|" + sid] = true; n++; r.creadas++;
      }
      if (r.cortado) break;
    }
    if (n) r.resumen.push(`${clase.ID}: ${n}`);
    if (r.cortado) break;
  }
  if (r.creadas) contarCopias();
  invalidarCache();
  return r;
}

function generarCopias() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return aviso("Ya se están generando copias (quizá el copiado automático). Intenta en un minuto.");
  let r;
  try { r = generarCopiasNucleo(false); } finally { lock.releaseLock(); }
  if (r.sinAlumnos) return aviso("No hay alumnos Activos con GRUPO asignado.");
  aviso(`Copias creadas: ${r.creadas}` + (r.resumen.length ? "\n" + r.resumen.join(" · ") : "") +
        (r.sinSemilla.length ? "\n\nSin semilla (no se copiaron): " + r.sinSemilla.join(", ") : "") +
        (r.cortado ? "\n\n⏱ Se alcanzó el tiempo máximo. Vuelve a pulsar «Generar copias» para continuar." : ""));
}

/** Lo ejecuta el activador cada 15 min: copias que falten, SOLO en clases PUBLICADAS
 *  (así no se copian semillas que aún estás preparando). Deja el resultado en Config → AUTO_COPIAS. */
function copiasAutomaticas() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const r = generarCopiasNucleo(true);
    const hora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm");
    fijarConfig("AUTO_COPIAS", `${hora} · ${r.creadas} copia(s)` + (r.resumen.length ? " (" + r.resumen.join(", ") + ")" : "") + (r.cortado ? " · continúa en la próxima vuelta" : ""),
                "Último copiado automático (cada 15 min, solo clases PUBLICADAS)");
  } finally { lock.releaseLock(); }
}

function alternarCopiasAuto() {
  const activos = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "copiasAutomaticas");
  if (activos.length) {
    activos.forEach(t => ScriptApp.deleteTrigger(t));
    fijarConfig("AUTO_COPIAS", "desactivado", "Último copiado automático (cada 15 min, solo clases PUBLICADAS)");
    return aviso("Copiado automático DESACTIVADO. Las copias solo se crean con Aula → Generar copias.");
  }
  ScriptApp.newTrigger("copiasAutomaticas").timeBased().everyMinutes(15).create();
  fijarConfig("AUTO_COPIAS", "activado, esperando la primera vuelta", "Último copiado automático (cada 15 min, solo clases PUBLICADAS)");
  aviso("Copiado automático ACTIVADO.\n\nCada 15 minutos se crean solas las copias que falten en las clases PUBLICADAS " +
        "(semillas nuevas o alumnos que activaste). Lo último que hizo queda en Config → AUTO_COPIAS.\n\n" +
        "Las clases sin publicar no se tocan: prepara la semilla tranquilo y publícala cuando esté lista.");
}

/** Recalcula la columna COPIAS de la pestaña Clases. */
function contarCopias() {
  const shC = hoja(HOJA.clases), tC = leerTabla(shC), conteo = {};
  leerTabla(hoja(HOJA.entregas)).filas.forEach(f => conteo[f.CLASE] = (conteo[f.CLASE] || 0) + 1);
  tC.filas.forEach(c => escribir(shC, tC, c._fila, { COPIAS: conteo[c.ID] || 0 }));
}

/** Quita de Entregas las filas cuyo archivo está en la papelera o ya no existe (la web deja de mostrarlos). */
function limpiarCopias() {
  const sh = hoja(HOJA.entregas), t = leerTabla(sh);
  const borrar = t.filas.filter(f => {
    if (!f.ARCHIVO_ID) return !f.ENLACE;
    try { return DriveApp.getFileById(String(f.ARCHIVO_ID)).isTrashed(); }
    catch (_) { return true; }                      // no existe o no hay acceso
  }).map(f => f._fila).sort((a, b) => b - a);
  borrar.forEach(n => sh.deleteRow(n));
  contarCopias();
  invalidarCache();
  aviso(borrar.length ? `Se quitaron ${borrar.length} copia(s) borradas de Entregas.` : "No hay copias borradas: todo está en orden.");
}

/** Borra la memoria del Panel (datos y listas de archivos de Drive). */
function refrescarMemoria() {
  invalidarCache();
  const ids = leerTabla(hoja(HOJA.clases)).filas.filter(f => f.ID).map(f => "mat_" + normId(f.ID));
  if (ids.length) CacheService.getScriptCache().removeAll(ids);
}

/** Menú: lo nuevo se ve al instante. Si la Web rápida está conectada, también sube los datos públicos. */
function refrescarWeb() {
  refrescarMemoria();
  if (!PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN")) return aviso("Listo: la web ya muestra lo último del Panel y de las carpetas de Drive.");
  try { anotarPublicacion(publicarWebNucleo(false)); aviso("Listo: la web ya muestra lo último del Panel y de Drive (la carga instantánea se actualiza en 1 minuto aprox.)."); }
  catch (e) { aviso("La memoria se borró, pero no se pudo actualizar la Web rápida:\n" + e.message); }
}

/* ======================= WEB RÁPIDA (datos públicos en GitHub) =======================
   La web muestra al instante lo que NO es privado, leyendo conexion/datos.json como un archivo más
   (igual que un sistema local), y luego completa lo personal (mi documento, mis notas) con el Panel.

   datos.json lo escribe este Panel en el repositorio de GitHub (Config → GITHUB_REPO) y Vercel lo publica.
   Solo lleva: clases PUBLICADAS (tema, unidad), sus enlaces, los archivos de sus carpetas de Drive y los
   títulos de los quizzes visibles. NUNCA alumnos, códigos, copias, notas ni preguntas.

   · Aula → Web rápida (activar / desactivar): pide el token la primera vez y revisa cada 10 min (de 6:00 a 23:00).
     Solo sube algo si cambió (si no hay cambios no hace commit ni redeploy).
   · Aula → Publicar en la web ahora: lo sube en el momento.
   El token se guarda en Propiedades del script (no en la hoja). Usa un token "fine-grained" con permiso
   Contents: Read and write SOLO para los repositorios de la web. */

const PUB_RUTA = "conexion/datos.json";
const PUB_DESC = "Web rápida: última publicación de datos públicos en GitHub";

function datosPublicos() {
  const clases = clasesTodas().filter(c => c.publicada);
  const ids = clases.map(c => c.id);
  const conCopias = {};
  datos("entregas", () => leerTabla(hoja(HOJA.entregas)).filas).forEach(f => { if (f.ENLACE) conCopias[normId(f.CLASE)] = true; });
  const enlaces = {}, materiales = {};
  datos("enlaces", () => leerTabla(hoja(HOJA.enlaces)).filas)
    .filter(f => f.URL && ids.indexOf(normId(f.CLASE)) >= 0)
    .sort((a, b) => (Number(a.ORDEN) || 99) - (Number(b.ORDEN) || 99))
    .forEach(f => (enlaces[normId(f.CLASE)] = enlaces[normId(f.CLASE)] || [])
      .push({ titulo: f.TITULO || f.URL, url: f.URL, tipo: f.TIPO || "enlace", para: f.PARA || "Todos" }));
  clases.forEach(c => { const m = materialesDe(c); if (m.length) materiales[c.id] = m; });
  return {
    v: 1,
    clases: clases.map(c => Object.assign(clasePublica(c), { conCopias: !!conCopias[c.id] })),
    enlaces, materiales,
    quizzes: quizzesTodos().filter(q => !q.oculto).map(q => ({ id: q.id, titulo: q.titulo, clase: q.clase, abierto: q.abierto,
      repetir: q.repetir, npreg: q.npreg }))
  };
}

const huella = texto => Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto, Utilities.Charset.UTF_8));

/** Sube datos.json si cambió. Devuelve un texto con lo que pasó. forzar = subir aunque sea igual. */
function publicarWebNucleo(forzar) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("GITHUB_TOKEN");
  const repo = String(valorConfig("GITHUB_REPO") || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!token) throw new Error("Falta conectar con GitHub (Aula → Web rápida).");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Config → GITHUB_REPO debe ser usuario/repositorio, por ejemplo franco-felles/aula-virtual.");
  const contenido = datosPublicos();
  const cuerpo = JSON.stringify(contenido);
  const h = huella(repo + "|" + cuerpo);
  if (!forzar && props.getProperty("PUB_HUELLA") === h) return "sin cambios";

  const texto = JSON.stringify(Object.assign({ generado: new Date().toISOString() }, contenido), null, 1) + "\n";
  const url = `https://api.github.com/repos/${repo}/contents/${PUB_RUTA}`;
  const cab = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const actual = UrlFetchApp.fetch(url, { headers: cab, muteHttpExceptions: true });
  let sha;
  if (actual.getResponseCode() === 200) sha = JSON.parse(actual.getContentText()).sha;
  else if (actual.getResponseCode() !== 404) throw new Error(errorGitHub(actual));
  const r = UrlFetchApp.fetch(url, { method: "put", headers: cab, contentType: "application/json", muteHttpExceptions: true,
    payload: JSON.stringify({ message: "Panel: actualizar datos públicos de la web", content: Utilities.base64Encode(texto, Utilities.Charset.UTF_8), sha }) });
  if (r.getResponseCode() !== 200 && r.getResponseCode() !== 201) throw new Error(errorGitHub(r));
  props.setProperty("PUB_HUELLA", h);
  return "publicado";
}
function errorGitHub(r) {
  const c = r.getResponseCode();
  if (c === 401) return "GitHub rechazó el token (vencido o mal copiado). Vuelve a conectarlo: Aula → Web rápida.";
  if (c === 403 || c === 404) return "El token no tiene permiso sobre ese repositorio. Revisa Config → GITHUB_REPO y que el token tenga Contents: Read and write.";
  return "GitHub respondió " + c + ": " + r.getContentText().slice(0, 200);
}
function anotarPublicacion(txt) {
  fijarConfig("WEB_PUBLICA", Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM HH:mm") + " · " + txt, PUB_DESC);
}

/** Lo ejecuta el activador cada 10 min. De noche no hace nada (ahorra la cuota diaria de Apps Script). */
function publicarWebAuto() {
  const hora = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "H"));
  if (hora < 6 || hora >= 23) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const r = publicarWebNucleo(false);
    if (r !== "sin cambios") anotarPublicacion(r);
  } catch (e) { anotarPublicacion("ERROR: " + e.message); }
  finally { lock.releaseLock(); }
}

/** Menú: subir ahora (borra antes la memoria, para tomar lo último de Drive). */
function publicarWebAhora() {
  try {
    refrescarMemoria();
    const r = publicarWebNucleo(true);
    anotarPublicacion(r);
    aviso("Listo: datos públicos subidos a GitHub. La web los muestra en 1 minuto aprox. (lo que tarda Vercel en publicar).");
  } catch (e) { aviso(e.message); }
}

/** Menú: activa o desactiva la revisión automática. La primera vez pide el token y el repositorio. */
function alternarWebRapida() {
  const ui = SpreadsheetApp.getUi();
  const activos = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === "publicarWebAuto");
  if (activos.length) {
    const r = ui.alert("Web rápida", "Está ACTIVADA. ¿Desactivarla? (la web seguirá funcionando, solo que sin la carga instantánea)", ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
    activos.forEach(t => ScriptApp.deleteTrigger(t));
    anotarPublicacion("desactivada");
    return aviso("Web rápida DESACTIVADA.");
  }
  const props = PropertiesService.getScriptProperties();
  if (!valorConfig("GITHUB_REPO")) fijarConfig("GITHUB_REPO", "franco-felles/Prueba-web", "Repositorio de la web (usuario/repo) donde el Panel escribe conexion/datos.json");
  if (!props.getProperty("GITHUB_TOKEN") || ui.alert("Web rápida", "¿Cambiar el token de GitHub guardado?", ui.ButtonSet.YES_NO) === ui.Button.YES) {
    const t = ui.prompt("Conectar con GitHub", "Pega tu token de GitHub (empieza con github_pat_…).\nSe guarda en las Propiedades del script, no en la hoja.", ui.ButtonSet.OK_CANCEL);
    if (t.getSelectedButton() !== ui.Button.OK || !t.getResponseText().trim()) return;
    props.setProperty("GITHUB_TOKEN", t.getResponseText().trim());
    props.deleteProperty("PUB_HUELLA");
  }
  try {
    const r = publicarWebNucleo(true);
    anotarPublicacion(r);
  } catch (e) { return aviso("No se pudo publicar, así que no se activó.\n\n" + e.message); }
  ScriptApp.newTrigger("publicarWebAuto").timeBased().everyMinutes(10).create();
  aviso("Web rápida ACTIVADA.\n\nRepositorio: " + valorConfig("GITHUB_REPO") + "\nCada 10 minutos (de 6:00 a 23:00) el Panel revisa si cambiaron clases, enlaces, " +
        "archivos de Drive o quizzes, y solo entonces actualiza la web. Para que sea inmediato: Aula → Publicar en la web ahora.\n\n" +
        "Lo último que hizo queda en Config → WEB_PUBLICA.");
}


/** Escribe (o crea) una fila CLAVE/VALOR en Config. */
function fijarConfig(clave, valor, desc) {
  const sh = hoja(HOJA.config);
  const claves = sh.getLastRow() ? sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => r[0]) : [];
  const i = claves.indexOf(clave);
  if (i >= 0) sh.getRange(i + 1, 2).setValue(valor);
  else sh.appendRow([clave, valor, desc || ""]);
}

/* ======================= CARPETAS ======================= */

function carpetaMes() {
  const cfg = config();
  const raiz = DriveApp.getFolderById(cfg.raiz);
  const it = raiz.getFoldersByName(cfg.mes);
  if (it.hasNext()) return it.next();
  const mes = raiz.createFolder(cfg.mes);
  ["LISTAS", "U1", "U2"].forEach(n => mes.createFolder(n));
  return mes;
}

function subcarpeta(padre, nombre) {
  const it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

function abrirCarpetaMes() {
  const url = carpetaMes().getUrl();
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(`<p><a href="${url}" target="_blank">Abrir ${config().mes}</a></p>`).setHeight(80), "Carpeta del mes");
}

/* ======================= UTILIDADES DE HOJA ======================= */

function hoja(nombre) {
  const ss = SpreadsheetApp.getActive();
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
}

function config() {
  const v = {};
  const sh = hoja(HOJA.config);
  if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(([k, val]) => v[k] = val);
  return {
    mes: String(v.MES || "").trim().toUpperCase(),
    grupos: String(v.GRUPOS || "G1,G2").split(",").map(s => s.trim()).filter(Boolean),
    pcs: v.PCS,
    raiz: v.RAIZ_ID || DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents().next().getId()
  };
}

function colDe(sh, nombre) {
  const cab = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  const i = cab.indexOf(nombre);
  if (i < 0) throw new Error(`Falta la columna «${nombre}» en ${sh.getName()}. Usa Aula → Configurar panel.`);
  return i + 1;
}

/** Lee la hoja como objetos {COLUMNA: valor, _fila}. `conFormulas` guarda también las fórmulas de esas columnas. */
function leerTabla(sh, conFormulas) {
  const ultCol = Math.max(1, sh.getLastColumn()), ultFila = sh.getLastRow();
  const cab = sh.getRange(1, 1, 1, ultCol).getValues()[0].map(String);
  if (ultFila < 2) return { cab, filas: [] };
  const rango = sh.getRange(2, 1, ultFila - 1, ultCol);
  const vals = rango.getValues();
  const forms = conFormulas ? rango.getFormulas() : null;
  const filas = [];
  vals.forEach((fila, i) => {
    if (fila.every(x => x === "" || x === false)) return;
    const o = { _fila: i + 2, _formulas: {} };
    cab.forEach((c, j) => { o[c] = fila[j]; if (forms && conFormulas.indexOf(c) >= 0) o._formulas[c] = forms[i][j]; });
    filas.push(o);
  });
  return { cab, filas };
}

function escribir(sh, tabla, fila, cambios) {
  Object.keys(cambios).forEach(k => {
    const j = tabla.cab.indexOf(k);
    if (j >= 0) sh.getRange(fila, j + 1).setValue(cambios[k]);
  });
}

/** Escribe la cabecera si la hoja está vacía, o agrega al final las columnas nuevas que falten (no mueve las existentes). */
function asegurarCabecera(sh, cab) {
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, cab.length).setValues([cab]); return; }
  const actual = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  const faltan = cab.filter(c => actual.indexOf(c) < 0);
  if (faltan.length) sh.getRange(1, actual.length + 1, 1, faltan.length).setValues([faltan]);
}

function filaDesde(cab, obj) { return cab.map(c => obj[c] === undefined ? "" : obj[c]); }

function validacionLista(sh, col, valores) {
  sh.getRange(2, col, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(valores, true).setAllowInvalid(false).build());
}

function estiloCabecera(sh, n) {
  sh.getRange(1, 1, 1, n).setFontWeight("bold").setBackground("#1e3a8a").setFontColor("#ffffff");
  sh.setFrozenRows(1);
}

function aviso(msg) { SpreadsheetApp.getUi().alert(msg); }
