# aula-virtual

Portal sencillo para que los alumnos entren a las clases y evaluaciones de *Herramientas Informáticas*. Algunos documentos son abiertos y otros están bloqueados con el código de alumno.

## Cómo funciona

- `clases.js` → lista de archivos publicados (lo único que editas al subir algo).
- `index.html` → el portal. Lee cada archivo de la lista, interpreta su **nombre** y sus **etiquetas `<meta>`**, y arma las tarjetas por unidad.
- `claseXuY.html` / `ecXuY.html` → cada clase o evaluación.

## Estándar de nombres

| Archivo | Se muestra como | Color |
|---|---|---|
| `clase1u1.html` | Clase 1 · Unidad 1 | azul |
| `clase4u2.html` | Clase 4 · Unidad 2 | azul |
| `ec1u1.html` | Evaluación continua 1 · Unidad 1 | **verde** |

Regla: `clase` o `ec` + número de clase/evaluación + `u` + número de unidad. Todo en minúsculas, sin espacios ni guiones. Hoy el portal muestra las unidades 1 y 2.

Para agregar otro tipo (por ejemplo `ef` = examen final) hay una sola tabla `TIPOS` al inicio del script de `index.html`.

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
