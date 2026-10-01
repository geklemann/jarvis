#!/usr/bin/env sh
# Publica o site no GitHub Pages (branch gh-pages) sem precisar de GitHub Actions.
# Uso: sh ops/publicar-site.sh   (rode na raiz do repositório, com tudo commitado)
# 1. roda os testes (não publica se algum falhar);
# 2. carimba uma versão nova nos ?v= do index.html (o navegador nunca usa script antigo do cache);
# 3. monta _site/ (cópia de web/ com .js e .css compactados) e roda os testes de novo sobre ela;
# 4. publica só o retrato atual de _site/ como um commit novo em gh-pages (segundos, sem refazer o histórico).
set -e
NODE=node; command -v node >/dev/null 2>&1 || NODE="$USERPROFILE/.tools/node-v24.21.0-win-x64/node.exe"
git diff --quiet -- web || { echo "Há alterações não commitadas em web/. Faça o commit antes."; exit 1; }
echo "Testando…"; "$NODE" --test "testes/*.test.mjs" >/tmp/jarvis-testes.log 2>&1 || { tail -40 /tmp/jarvis-testes.log; echo "Testes falharam: nada foi publicado."; exit 1; }
v=$(date +%Y%m%d%H%M%S)
sed -i -E "s/\?v=[0-9]+\"/?v=$v\"/g" web/index.html
git commit -q -m "Publicação $v" -- web/index.html
"$NODE" ops/montar-site.mjs
JARVIS_WEB=_site "$NODE" --test "testes/*.test.mjs" >/tmp/jarvis-testes.log 2>&1 || { tail -40 /tmp/jarvis-testes.log; echo "Testes falharam na versão compactada: nada foi publicado."; exit 1; }
git fetch -q origin gh-pages 2>/dev/null || true
IDX=$(mktemp); rm -f "$IDX"
(cd _site && GIT_DIR="$(git -C .. rev-parse --absolute-git-dir)" GIT_WORK_TREE=. GIT_INDEX_FILE="$IDX" git -c core.autocrlf=false -c core.safecrlf=false add -A .)
arvore=$(GIT_INDEX_FILE="$IDX" git write-tree); rm -f "$IDX"
pai=$(git rev-parse -q --verify origin/gh-pages || true)
commit=$(git commit-tree "$arvore" ${pai:+-p "$pai"} -m "Publicação $v")
git push -q origin "$commit:refs/heads/gh-pages"
echo "Publicado (versão $v). O GitHub Pages atualiza em 1–2 minutos: https://jaarvis.com.br/"
