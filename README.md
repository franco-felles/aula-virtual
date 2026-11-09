# aula-virtual

Portal de *Herramientas Informáticas*. Los datos (alumnos, clases, copias, enlaces, quizzes y notas) viven en el **Panel Aula Virtual** (Google Sheets + Apps Script, en tu Drive). La web solo muestra lo que el Panel le permite ver a quien inició sesión.

## Estructura

```
index.html                  portal (única página en la raíz)
clases/
  clase.html                visor de carpeta (sirve para clases y EC: ?id=u1c1 · ?id=ec1u1)
  u1c1/material/m1c1.html   material 1 de la clase 1 (unidad 1)
  u1c2/  u1c4/  u1c5/  u1c7/  u1c8/   u2c1/ … u2c8/
eecc/
  quiz.html                 evaluación virtual (alumno rinde · docente ve resultados)
  ec1u1/material/  ec2u1/  ec3u1/   ec1u2/  ec2u2/  ec3u2/
docente/
  quizzes.html              crear y editar quizzes
conexion/
  acceso.html               login (alumno: código · docente: contraseña)
  aula.js                   sesión, conexión con el Panel, cierre por inactividad
  config.js                 URL del Panel publicado (/exec)
  estilo.css  img/          diseño, logo, icono, ilustración del login
  materiales.json           índice de materiales (automático)
sistema/                    no se publica en la web
  google/panel.gs  api.gs   código del Panel (Apps Script)
  manifiesto.js             genera conexion/materiales.json
  plantillas/presentacion.html
  LEEME.md                  instalación y uso del Panel
```

## Orden de cada unidad

`C1 · C2 · EC1 · C4 · C5 · EC2 · C7 · C8 · EC3`: la 3, la 6 y la 9 son evaluaciones continuas.

| Sesión | ID | Carpeta del repo | Carpeta de Drive |
|---|---|---|---|
| Clase 4, unidad 1 | `u1c4` | `clases/u1c4/material/` | `NOV 2026/U1/C4 - Tema/` |
| EC 2, unidad 1 | `ec2u1` | `eecc/ec2u1/material/` | `NOV 2026/U1/EC2 - Tema/` |

En el Panel se crean con **Aula → Nueva clase / EC**: `u1 4` o `u1 ec2`.

## Qué va dónde

**Material de clase** es todo lo que no es un enlace:

| Tengo… | Va en… |
|---|---|
| HTML propio: presentación, interactivo, juego, lectura… | `clases/<id>/material/m<#>c<#>.html` (EC: `eecc/<id>/material/m<#>ec<#>.html`) |
| Imágenes / .js / .css de esos HTML | `…/material/recursos/` |
| PPT, PDF, video o Form ya hecho | Carpeta de la clase en Drive |
| Documento que **cada alumno trabaja** (aunque esté vacío) | Drive, archivo que empieza por `SEMILLA` o `profesor` → **Aula → Generar copias**. Puede haber varias semillas (un Doc y un Sheet): el alumno ve una por una con su nombre (`SEMILLA - Práctica Excel` → «Práctica Excel»). Se pueden agregar después de crear la clase; Generar copias solo crea lo que falta |

**Enlaces** (Doc o Sheet compartido, YouTube, una web, Kahoot…) van en el Panel, pestaña **Enlaces**.

**Quizzes** se crean en la web: **Mis quizzes**, vinculados a la clase o EC.

### Ficha de cada material

El alumno no ve `m1c1`: ve lo que diga la ficha del `<head>`:

```html
<meta name="material-titulo" content="Partes de la computadora">
<meta name="material-tipo" content="interactivo">
<meta name="material-descripcion" content="Explora en 3D cada componente.">
<script src="../../../conexion/aula.js" data-proteger></script>
```

- **Tipos**: `presentacion` · `interactivo` · `juego` · `lectura` · `video` · `practica`.
- **Orden**: el número después de la `m` (m1, m2, m3…).
- **Presentaciones en HTML**: copia `sistema/plantillas/presentacion.html`. Se navega con flechas o deslizando, y la tecla F pone pantalla completa.
- **Botón "Ir a mi documento"** dentro de un material:
  ```js
  const docs = await Aula.miDocumento();     // la clase sale de la carpeta del archivo
  docs.filter(d => d.url).forEach(d => window.open(d.url, "_blank", "noopener"));
  ```

`conexion/materiales.json` se regenera solo con GitHub Actions al subir cambios a `clases/` o `eecc/`. A mano: `node sistema/manifiesto.js`.

## Accesos

- **Alumno**: escribe su código. Solo entra si en el Panel está **Activo y con grupo**. Si comparte PC, su compañero se agrega desde el portal y cada uno ve su propio documento.
- **Docente**: contraseña cifrada en Apps Script. Se cambia desde el portal o, si la olvidas, en el Panel con **Aula → Contraseña docente**.
- La sesión vive solo en esa pestaña y se cierra tras **20 minutos sin uso**.

## Quizzes

- Cada quiz es una **EC virtual** (EC1–EC3 de una unidad, sale dentro de la carpeta de esa EC) o un **quiz de clase** (sale dentro de la carpeta de la clase). Sin clase, sale en el inicio.
- Estado: **Oculto** (no lo ven) · **Cerrado** (lo ven, no pueden rendirlo, sí ven su nota) · **Abierto**. Se cambia desde la lista, sin entrar al editor.
- Opciones por quiz: **repetir** (se queda la nota más alta), **ver su puntaje** al terminar (por defecto sí), **ver sus errores** con la respuesta correcta (por defecto no).
- Preguntas de 2 a 5 alternativas. Cada alumno recibe **10 al azar por defecto** (editable); preguntas y alternativas salen en orden aleatorio.
- **Puntos por pregunta** (opcional): las que no tienen puntos se reparten lo que falta para 20. El editor avisa si faltan o sobran. Si al alumno le tocan solo algunas, su nota se ajusta a 20.
- **Descuento por salir**: −1 punto por cada vez que cambia de pestaña o minimiza (activado por defecto). Se le advierte al empezar y se le avisa en el momento.
- **Importar desde .txt**: botón «Subir archivo .txt» (o arrastrar). «Descargar plantilla» trae el formato explicado: `1.` pregunta, `a)` alternativas, `*` la correcta, `[2]` puntos, `TEMA:`, `TITULO:`, `MOSTRAR:`. También acepta el CSV del quiz antiguo.
- El alumno **nunca recibe las respuestas correctas** mientras rinde: corrige el Panel. Se detecta el cambio de pestaña.
- Las notas quedan en la pestaña **Resultados** del Panel y se pueden **descargar en CSV (Excel)** desde la página de resultados. La corrección de nota y el reinicio se hacen desde la web.

Instalación del Panel: [`sistema/LEEME.md`](sistema/LEEME.md).
