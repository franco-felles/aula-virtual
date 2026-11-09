# Panel Aula Virtual (Google Sheets + Apps Script)

Dos archivos en el **mismo** proyecto de Apps Script del Panel:

- `panel.gs` → menú **Aula** (importar alumnos, grupos, PCs, clases, copias).
- `api.gs` → lo que la web le pide al Panel (login, clases, quizzes).

## Instalar / actualizar el código

1. Panel Aula Virtual → **Extensiones → Apps Script**.
2. Archivo `Código.gs`: borra todo y pega `panel.gs`.
3. **Archivos → + → Secuencia de comandos**, llámalo `api` y pega `api.gs`.
4. Guarda (💾). Debe estar el servicio **Drive** (Servicios → + → Drive API).
5. Recarga la hoja → **Aula → Configurar panel** (actualiza listas desplegables; no borra datos).
6. **Aula → Contraseña docente…** → crea tu contraseña de la web.

## Publicar para la web (una vez)

1. En Apps Script: **Implementar → Nueva implementación** → ⚙ → **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
2. **Implementar** → autoriza → copia la **URL de la aplicación web** (termina en `/exec`).
3. Pégala en `conexion/config.js` de la web: `window.AULA_API = "https://script.google.com/macros/s/…/exec";`

### Cuando cambie el código de `api.gs` o `panel.gs`

Pega el código nuevo y luego: **Implementar → Gestionar implementaciones → ✏ (editar) → Versión: Nueva versión → Implementar**. Así la URL no cambia. (Si haces "Nueva implementación" se crea otra URL distinta.)

## Uso mensual

| Momento | Qué haces |
|---|---|
| Inicio de mes | `Config → MES` (ej. `DIC 2026`) → se crea la carpeta. PDF de la institución en `<MES>/LISTAS` → **Aula → Importar alumnos (PDF)** |
| Primera clase | `Config → PCS` con las PC de la sede. En `Alumnos`, selecciona a los que llegaron (Shift/Ctrl para varios) → **Aula → Asignar grupo a los seleccionados** (quedan *Activos* y numerados). Luego la **PC** de cada uno (solo el número) |
| Nueva clase | **Aula → Nueva clase / EC** (`u1 4` o `u1 ec2`) → edita la semilla en su carpeta |
| Antes de clase | Pon una o varias semillas en la carpeta de la clase (`SEMILLA - Práctica Excel`, `SEMILLA - Informe`…) → **Aula → Generar copias** (solo crea las que faltan; cubre tardíos y semillas nuevas) → marca **PUBLICADA** en `Clases` |
| Quiero que las copias se hagan solas | **Aula → Copiado automático** (una vez). Cada 15 min crea las copias que falten en las clases **PUBLICADAS**. Lo último que hizo: `Config → AUTO_COPIAS` |
| Subí un archivo a Drive y no aparece | La web guarda la lista de archivos 5 min. Para verlo ya: **Aula → Actualizar web ahora** |
| Borré copias o semillas en Drive | **Aula → Limpiar copias borradas** (quita de Entregas lo que está en la papelera; la web deja de mostrarlo) |
| Alumno tardío | Fila nueva en `Alumnos` (código, nombre, grupo) → **Generar copias** |

## Pestañas

- **Config**: `MES`, `GRUPOS`, `PCS`, `RAIZ_ID`, `DOCENTE` (tu nombre en la web).
- **Alumnos**: `CODIGO, APELLIDOS Y NOMBRES, N LISTA, ESTADO, GRUPO, N, PC, COMPARTE CON, ORIGEN, NOTA`.
- **Laboratorio**: mapa PC × grupo (automático; amarillo = PC compartida).
- **Clases**: `ID, TIPO, UNIDAD, N, TEMA, CARPETA, PUBLICADA, COPIAS`. Solo las PUBLICADAS se ven en la web.
- **Entregas**: enlace de la copia de cada alumno en cada clase (automático).
- **Enlaces**: `CLASE, ORDEN, TIPO, TITULO, URL, PARA` (Todos / G1 / G2).
- **Quiz** y **Resultados**: los llena la web (Mis quizzes). En Resultados ves todas las notas.
- **Importar**: plan B si el PDF no se lee (pega el texto).

## Velocidad (memoria)

La web no abre la hoja en cada visita: Google guarda los datos ya preparados por 5 minutos y el navegador del alumno guarda lo último que vio (se muestra al instante y se actualiza solo).
- Lo que **editas a mano en el Panel** (publicar, enlaces, grupos) se ve al instante: al editar se borra la memoria de esa pestaña.
- Lo que hace el menú (importar, nueva clase, generar copias, limpiar) también se ve al instante.
- Lo único que puede tardar hasta 5 min son los **archivos nuevos en carpetas de Drive**. Para forzarlo: **Aula → Actualizar web ahora**.

## Web rápida (datos públicos como archivo)

El Panel escribe `conexion/datos.json` en el repositorio de GitHub de la web; Vercel lo publica y la web lo lee como un archivo más. Así el portal y las clases **aparecen al instante** y lo personal (mi documento, mis quizzes rendidos) llega después desde el Panel.

- Solo lleva lo que no es privado: clases **PUBLICADAS** (tema, unidad), sus enlaces, los archivos de sus carpetas de Drive y los títulos de los quizzes visibles. **Nunca** alumnos, códigos, copias, notas ni preguntas. Cualquiera puede abrir ese archivo.
- Si el archivo no existe o está viejo no pasa nada: el Panel siempre corrige lo que se muestra.

**Activarla (una vez):**
1. En GitHub: foto de perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - *Repository access*: **Only select repositories** → `Prueba-web` y `aula-virtual`.
   - *Permissions → Repository permissions → Contents*: **Read and write**.
   - Copia el token (`github_pat_…`). GitHub no lo vuelve a mostrar.
2. En el Panel: **Aula → Web rápida (activar / desactivar)** → pega el token. Google pedirá permiso para "conectarse a un servicio externo": acéptalo.
3. Listo. Cada 10 min (6:00–23:00) revisa si algo cambió y solo entonces sube el archivo. Para que sea inmediato: **Aula → Publicar en la web ahora**. Lo último que hizo: `Config → WEB_PUBLICA`.

**Al cambiar de repositorio** (por ejemplo, al pasar todo a `aula-virtual`): cambia `Config → GITHUB_REPO` y usa **Aula → Publicar en la web ahora**.

Como el Panel hace sus propios commits, antes de subir cambios desde tu PC haz `git pull`.
