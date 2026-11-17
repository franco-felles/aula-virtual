# Fuente de boleta-modelo.pdf y boleta-modelo.png

`boleta.html` es la boleta ficticia (A4, Arial, márgenes de 2,54 cm como Google Docs). Para regenerar (desde `m1c7/`, en Git Bash):

```sh
E="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"; U="file:///$(cygpath -m "$PWD")/fuente/boleta.html"
"$E" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$(cygpath -w "$PWD")\boleta-modelo.pdf" "$U"
U2="$U#png"
"$E" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=663,620 --screenshot="$(cygpath -w "$PWD")\boleta-modelo.png" "$U2"
```
