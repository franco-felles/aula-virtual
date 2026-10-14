# aula-virtual

Portal sencillo para que los alumnos entren a las clases y evaluaciones de *Herramientas Informáticas*. Algunos documentos son abiertos y otros están bloqueados con el código de alumno.

## Cómo funciona

- `clases.js` → lista de archivos publicados (lo único que editas al subir algo).
- `index.html` → el portal. Lee cada archivo de la lista, interpreta su **nombre** y sus **etiquetas `<meta>`**, y arma las tarjetas por unidad.
- `claseXuY.html` → cada clase.
- `evaluaciones.html` → único HTML de las evaluaciones continuas; lee la carpeta `eecc/`.
- `eecc/ecXuY.csv` → datos de los alumnos de cada evaluación continua.

## Estándar de nombres

| Archivo | Se muestra como | Color |
|---|---|---|
| `clase1u1.html` | Clase 1 · Unidad 1 | azul |
| `clase4u2.html` | Clase 4 · Unidad 2 | azul |

Regla: `clase` + número + `u` + número de unidad. Todo en minúsculas, sin espacios ni guiones. Hoy el portal muestra las unidades 1 y 2.


## Estándar de etiquetas dentro de cada HTML

Se colocan dentro del `<head>`. El portal deja de descargar cada archivo al llegar a `</head>`, así que conviene mantener el `<head>` liviano (lo pesado, como imágenes en base64, va en el `<body>`):

```html
<meta name="session-title" content="Título corto de la clase">
<meta name="session-desc" content="Una o dos líneas que explican de qué trata.">
<meta name="session-access" content="locked">   <!-- opcional -->
```

| Etiqueta | Obligatoria | Qué hace |
|---|---|---|
| `session-title` | Sí | Título de la tarjeta |
| `session-desc` | Sí | Descripción de la tarjeta |
| `session-access` | No | `locked` si el documento pide código de alumno (muestra 🔒). Si falta, se considera abierto. |

La etiqueta ("Clase 2 · Unidad 1", etc.) **ya no se escribe a mano**: sale del nombre del archivo, así nunca se desincroniza.

## Para subir una clase nueva

1. Nombra el archivo con el estándar (`clase3u1.html`).
2. Agrega las etiquetas `session-title` y `session-desc` en su `<head>`.
3. Agrega el nombre en `clases.js` (**con coma al final**).

Si un archivo no cumple el estándar o no se puede leer, el portal lo omite y deja un aviso en la consola del navegador (F12).

## Probar en local

`index.html` usa `fetch`, que no funciona abriendo el archivo con doble clic. Desde la carpeta del proyecto:

```
python3 -m http.server 8000
```

y abre `http://localhost:8000`.

## Evaluaciones continuas (carpeta `eecc/`)

Ya no se registran en `clases.js`. Para publicar una:

1. Sube `eecc/ec1u1.csv` (o `ec2u2.csv`, etc.: `ec` + número + `u` + unidad).
2. Listo: aparece sola una tarjeta **verde** "Evaluación continua 1 · Unidad 1" en el portal.

`index.html` carga `evaluaciones.html?detectar=1` en un iframe invisible; este revisa `eecc/` y le avisa al portal qué CSV existen. Busca hasta `MAX_EC` (6) evaluaciones por unidad; si necesitas más, cambia esa constante en `evaluaciones.html`.

Columnas del CSV (primera fila = encabezados; coma o punto y coma):

| Columna | Obligatoria | Uso |
|---|---|---|
| `NOMBRE` | Sí | Lo que busca el alumno |
| `LINK` | Sí | Su documento |
| `CODIGO` | No | Si existe, se pide como contraseña |
| `GRUPO` / `MAQUINA` | No | Etiqueta / búsqueda extra |

Ver `eecc/ejemplo_formato.csv` (no se detecta por no llamarse `ec#u#`).

⚠️ El CSV es público: quien conozca su URL puede leer nombres, códigos y links. El código solo evita curiosos, no es seguridad real.
