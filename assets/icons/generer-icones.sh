#!/bin/sh
# Génère les icônes PNG de l'app (180, 192 et 512 px) à partir de icone.html.
# Outils utilisés : Google Chrome (capture d'écran) et sips (inclus dans macOS). Aucune dépendance à installer.
# Lancer depuis n'importe où : sh maztrix/assets/icons/generer-icones.sh
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFIL="$(mktemp -d)" # profil Chrome jetable, pour ne pas toucher à mon Chrome ouvert

# Capture en 1024 px puis réduction : Chrome sur Mac refuse les fenêtres plus petites que ~500 px.
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --user-data-dir="$PROFIL" --window-size=1024,1024 --virtual-time-budget=3000 \
  --screenshot="$PWD/icone-1024.png" "file://$PWD/icone.html" 2>/dev/null

for taille in 512 192 180; do
  sips -z $taille $taille icone-1024.png --out icon-$taille.png >/dev/null
done
rm -rf icone-1024.png "$PROFIL"
echo "Icônes créées : icon-512.png, icon-192.png, icon-180.png"
