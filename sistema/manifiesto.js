/* ==========================================================
   Genera conexion/materiales.json: qué materiales tiene cada clase y cada EC.
   (La web no puede "listar" carpetas; por eso existe este índice.)

   Dónde:   clases/u1c1/material/m1c1.html      (material 1 de la clase 1, unidad 1)
            eecc/ec1u1/material/m1ec1.html     (material 1 de la EC 1, unidad 1)
   Solo cuentan los .html que están directamente en material/. Imágenes, .js o .css
   de apoyo van en material/recursos/ (no aparecen como tarjeta).

   Ficha de cada material (dentro del <head> del HTML):
     <meta name="material-titulo" content="Partes de la computadora">
     <meta name="material-tipo" content="interactivo">
     <meta name="material-descripcion" content="Explora en 3D cada componente.">
   Tipos: presentacion · interactivo · juego · lectura · video · practica
   Si falta la ficha se usa el <title>; si tampoco hay, el nombre del archivo.
   Orden: el número después de la "m" (m1, m2, m3…).

   Lo ejecuta GitHub Actions al subir cambios. A mano: node sistema/manifiesto.js
   ========================================================== */
const fs = require("fs"), path = require("path");
const RAIZ = path.join(__dirname, "..");
const TIPOS = ["presentacion", "interactivo", "juego", "lectura", "video", "practica"];

const meta = (html, n) => {
  const m = new RegExp(`<meta\\s+name=["']${n}["']\\s+content=["']([^"']*)["']`, "i").exec(html)
         || new RegExp(`<meta\\s+content=["']([^"']*)["']\\s+name=["']${n}["']`, "i").exec(html);
  return m ? m[1].trim() : "";
};

const salida = {};
for (const base of ["clases", "eecc"]) {
  const dirBase = path.join(RAIZ, base);
  if (!fs.existsSync(dirBase)) continue;
  for (const d of fs.readdirSync(dirBase, { withFileTypes: true })) {
    const dirMat = path.join(dirBase, d.name, "material");
    if (!d.isDirectory() || !fs.existsSync(dirMat)) continue;
    const lista = fs.readdirSync(dirMat).filter(f => /\.html?$/i.test(f)).map(f => {
      const html = fs.readFileSync(path.join(dirMat, f), "utf8").slice(0, 8000);
      const titulo = meta(html, "material-titulo") || meta(html, "session-title") || ((/<title>([^<]+)<\/title>/i.exec(html) || [])[1] || "").trim() || f.replace(/\.html?$/i, "");
      let tipo = meta(html, "material-tipo").toLowerCase();
      if (TIPOS.indexOf(tipo) < 0) tipo = "interactivo";
      return { archivo: f, ruta: `${base}/${d.name}/material/${f}`, titulo, tipo,
               descripcion: meta(html, "material-descripcion") || meta(html, "session-desc"),
               orden: Number((/^m(\d+)/i.exec(f) || [])[1]) || 99 };
    }).sort((a, b) => a.orden - b.orden || a.archivo.localeCompare(b.archivo));
    if (lista.length) salida[d.name.toLowerCase()] = lista;
  }
}

const texto = JSON.stringify(salida, null, 2) + "\n";
const destino = path.join(RAIZ, "conexion", "materiales.json");
const antes = fs.existsSync(destino) ? fs.readFileSync(destino, "utf8") : "";
if (antes !== texto) { fs.writeFileSync(destino, texto); console.log("materiales.json actualizado"); }
else console.log("materiales.json sin cambios");
