#!/usr/bin/env sh
# Publica a pasta web/ na branch gh-pages (GitHub Pages) sem precisar de GitHub Actions.
# Uso: sh ops/publicar-site.sh   (rode na raiz do repositório, com tudo commitado)
# Carimba uma versão nova nos ?v= do index.html para o navegador nunca usar scripts antigos do cache.
set -e
git diff --quiet -- web || { echo "Há alterações não commitadas em web/. Faça o commit antes."; exit 1; }
v=$(date +%Y%m%d%H%M%S)
sed -i -E "s/\?v=[0-9]+\"/?v=$v\"/g" web/index.html
git commit -q -m "Publicação $v" -- web/index.html
git branch -D gh-pages >/dev/null 2>&1 || true
git subtree split --prefix web -b gh-pages
git push -f origin gh-pages
echo "Publicado (versão $v). O GitHub Pages atualiza em 1–2 minutos: https://jaarvis.com.br/"
