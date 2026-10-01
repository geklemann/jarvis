#!/bin/sh
# Abre um backup do Jarvis (jarvis-AAAA-MM-DD.tar.gz.enc): pede a frase, decifra e extrai numa pasta ao lado.
# Uso (Git Bash): sh ops/restaurar-backup.sh jarvis-2026-10-02.tar.gz.enc
set -eu
arq="${1:?Informe o arquivo .tar.gz.enc baixado do R2}"
[ -f "$arq" ] || { echo "Arquivo não encontrado: $arq"; exit 1; }
destino="${arq%.tar.gz.enc}"
printf 'Frase do backup: '; stty -echo 2>/dev/null || true; read -r BACKUP_PASSPHRASE; stty echo 2>/dev/null || true; echo
export BACKUP_PASSPHRASE
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$arq" -out "$destino.tar.gz" -pass env:BACKUP_PASSPHRASE || { echo "Frase errada ou arquivo corrompido."; rm -f "$destino.tar.gz"; exit 1; }
mkdir -p "$destino" && tar -C "$destino" -xzf "$destino.tar.gz" && rm -f "$destino.tar.gz"
echo "Pronto: $destino (banco/ e arquivos/)."
