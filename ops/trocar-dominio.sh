#!/usr/bin/env sh
# Troca o domínio do site para jaarvis.com.br. Rode SÓ depois que o DNS no registro.br estiver apontado para o
# GitHub Pages (senão o site fica fora do ar):
#   jaarvis.com.br      A     185.199.108.153 · 185.199.109.153 · 185.199.110.153 · 185.199.111.153
#   www.jaarvis.com.br  CNAME geklemann.github.io
# Confira antes:  nslookup jaarvis.com.br   (tem de responder 185.199.x.153)
# Depois de publicar: GitHub › geklemann/jarvis › Settings › Pages › marque "Enforce HTTPS" quando o certificado sair,
# e rode "supabase config push" (site_url novo para os e-mails de login).
set -e
cd "$(dirname "$0")/.."
NOVO=jaarvis.com.br
if ! nslookup "$NOVO" 2>/dev/null | grep -q "185.199.1"; then
  echo "O DNS de $NOVO ainda não aponta para o GitHub Pages (185.199.x.153). Nada foi alterado."; exit 1
fi
printf '%s\n' "$NOVO" > web/CNAME
sed -i "s#^site_url = \".*\"#site_url = \"https://$NOVO/\"#" supabase/config.toml
sed -i "s#ecombalance\.com\.br#$NOVO#g" ops/publicar-site.sh
sed -i "s#^\*\*Site:\*\* .*#**Site:** https://$NOVO/ (antes ecombalance.com.br)#" README.md
git add web/CNAME supabase/config.toml ops/publicar-site.sh README.md
git commit -m "Domínio novo: $NOVO"
sh ops/publicar-site.sh
git push origin main
echo "Pronto. Falta: Enforce HTTPS no GitHub Pages e 'supabase config push'."
