#!/bin/sh
# Cloudflare Pages の「ビルド」で動かす。アプリに必要なファイルだけを public/ に集める
# (gen/ scripts/ や説明の .md などはネットに出さない)
set -e
rm -rf public
mkdir -p public
cp -r index.html manifest.webmanifest sw.js css js fonts icons data public/
printf '/*\n  X-Robots-Tag: noindex, nofollow\n' > public/_headers
echo "public/ を作りました"
