# aula-virtual

Portal de *Herramientas Informáticas*. Cada persona entra con su código; el portal arma **solo** los botones de clases y evaluaciones según los CSV que existan. Para publicar algo nuevo **solo se sube un CSV** con el nombre correcto.

## Estructura

```
index.html             portal (crea los botones solos). Sin sesión te manda al login
acceso.html            login
access/
  access.csv           quién puede entrar (alumnos + docente)
  access.js            validación, sesión y guardia de páginas
  estilo.css           diseño compartido
  icono.png / favicon.png / login.jpg   logo, icono de pestaña e ilustración del login
  sesion.html          ÚNICA página de sesión (ver abajo)
clases/
  class1u1.html        única clase que es página (modelo 3D de la PC); no lleva CSV
  class2u1.csv         código + enlace de cada alumno en esa clase
  class4u1.csv
  class5u1.csv
eecc/
  ec1u1.csv            evaluación continua (mismo formato que los CSV de clase)
```

## Nomenclatura

| Tipo | Nombre | Carpeta | Ejemplo |
|---|---|---|---|
| Clase | `class#u#` (clase # de la unidad #) | `clases/` | `class4u1.csv`, `class2u2.csv` |
| Evaluación continua | `ec#u#` | `eecc/` | `ec1u1.csv`, `ec2u1.csv` |

La **primera fila** del CSV repite el nombre de la sesión (`class4u1`) y debe coincidir con el nombre del archivo. Segunda fila (encabezados): `N_ORDEN,GRUPO,CODIGO,ALUMNO,ENLACE`. Si el enlace no empieza con `http` (ej. `NO_DISPONIBLE`) se avisa que el documento aún no está disponible.

`access.csv`: `ROL,GRUPO,CODIGO,NOMBRE` (ROL = `alumno` o `docente`).

## Cómo funciona

1. El alumno busca su nombre, escribe su código y entra. El código queda como llave **solo en esa pestaña** (`sessionStorage`; en el laboratorio las PC se comparten). Hay botón **Salir**.
2. El portal detecta los CSV de `clases/` y `eecc/` y crea un botón por cada uno (agrupados por unidad).
3. **Alumno**: el portal busca su código en cada CSV y convierte cada botón en un enlace a **su documento**. Al presionarlo, el documento se abre en una **pestaña nueva**, el portal sigue abierto y aparece una **notificación** en pantalla. Si no tiene enlace o no figura en ese CSV, el botón sale deshabilitado ("Aún no disponible" / "No figuras aquí").
   **Docente**: el botón abre `access/sesion.html?s=<sesión>`:
   - ve la lista de todos los alumnos de esa clase/evaluación con su enlace (buscador y filtro por grupo; cada nombre abre su documento en pestaña nueva).

`sesion.html` es el único modelo: sirve para cualquier clase o evaluación, no hay que crear HTML por sesión. (Si un alumno entra a `sesion.html?s=...` directamente, lo redirige a su enlace.)

Imágenes: `access/icono.png` (logo de las cabeceras), `access/favicon.png` (icono de pestaña) y `access/login.jpg` (ilustración del login). Se cambian reemplazando el archivo.

## Agregar cosas

| Quiero… | Hago |
|---|---|
| Publicar una clase | Subo `clases/class6u1.csv`. El botón aparece solo. |
| Publicar una EC | Subo `eecc/ec2u1.csv` |
| Clase de otra unidad | `class1u2.csv` |
| Agregar/quitar un alumno | Edito `access/access.csv` (y los CSV de cada sesión) |
| Cambiar mi clave de docente | Última fila de `access/access.csv` (`docente`, columna CODIGO) |

Búsqueda automática (en `index.html`): se prueban las unidades de `UNIDADES = [1,2,3,4]` y, en cada una, los números 1, 2, 3… hasta que falten 3 seguidos (`HUECOS`). Si en la consola (F12) ves errores 404, son normales: el portal prueba nombres que aún no existen.

## ⚠️ Seguridad

Es un sitio estático: **todos los CSV son públicos** para quien conozca su dirección (nombres, códigos y enlaces, incluida la clave del docente). El login evita curiosos, no es seguridad real. Para ocultar la clave del docente, ejecuta en la consola `await Acceso.hash("tu clave")` y pega el resultado (`sha256:...`) en `access.csv`. Si los documentos de Google están como "cualquiera con el enlace: editor", quien consiga un CSV puede abrirlos.

## Probar en local

`fetch` no funciona con doble clic. Desde la carpeta del proyecto: `python3 -m http.server 8000` y abre `http://localhost:8000`.
