# Fuente de guia-google-docs.pdf

`guia.html` es la fuente del PDF (páginas A4; las "capturas" de Google Docs son recreaciones en HTML/CSS).
Para regenerar el PDF después de editarla (desde la carpeta `m1c5/`, en Git Bash):

```sh
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=15000 --print-to-pdf="$(cygpath -w "$PWD")\\guia-google-docs.pdf" \
  "file:///$(cygpath -m "$PWD")/fuente/guia.html"
```

Necesita internet (fuentes de Google Fonts e íconos Material Symbols).
