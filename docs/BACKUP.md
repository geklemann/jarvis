# Backup do Jarvis (Supabase → Cloudflare R2)

Todo dia às 03:17 (Brasília), o GitHub copia **o banco inteiro** (papéis, estrutura e dados, incluindo os logins) e
**todos os arquivos do Storage** (`contabil`, `produtos`, `documentos`, `ponto`), compacta, **cifra** (AES-256) com a
frase do backup e envia ao balde **`jarvis-backups`** no Cloudflare R2. Fluxo: `.github/workflows/backup.yml`.
Primeiro backup completo e restauração conferida em 01/10/2026 (102 tabelas, 67.487 linhas, 234 arquivos, 42 MB).

| Onde | Guarda | Proteção |
|---|---|---|
| `diario/AAAA-MM-DD/` | os backups do dia (nome com a hora) | ninguém apaga antes de 30 dias; somem sozinhos com 35 |
| `mensal/AAAA-MM/` | o do dia 1 de cada mês | ninguém apaga antes de 1 ano; some sozinho com 400 dias |

- **Conferência diária:** depois de enviar, o fluxo baixa o arquivo de volta, decifra e compara a soma de verificação.
- **Teste de restauração:** no dia 1 de cada mês (e sempre que rodar à mão), o backup é restaurado num banco vazio
  (Postgres 17, só a base do Supabase) e as linhas de cada tabela são comparadas com o original
  (`ops/backup-contagem.mjs`).
- **Se falhar:** o GitHub manda e-mail para o dono do repositório.
- **Cópia 3:** uma vez por mês, vale baixar o backup mensal para um HD seu (regra 3-2-1).

## Como funciona (sem chave do R2 e sem token pessoal do Supabase)

- **Receptor** (`ops/receptor-backup`, worker `jarvis-backup` na Cloudflare): recebe os arquivos do GitHub e grava no
  balde pela ligação interna da Cloudflare. Só aceita o `RECEPTOR_TOKEN`, só grava em `diario/` e `mensal/` e não
  tem como apagar nada.
- **Banco:** `supabase db dump` direto no endereço do banco (pooler `aws-0-sa-east-1`), com a senha que o repositório já
  guardava (`SUPABASE_DB_PASSWORD`).
- **Arquivos:** `ops/backup-storage.mjs` baixa tudo pela API do Storage com a chave de serviço do projeto.
- **Segredos** (todos gerados e gravados por `node ops/ativar-backup.mjs`, sem aparecer na tela):
  `RECEPTOR_TOKEN` (também no receptor), `SUPABASE_SERVICE_KEY_BACKUP` (lida do Supabase CLI) e `BACKUP_PASSPHRASE`
  (aleatória; uma cópia fica em `Documents\Backups\jarvis-backup-FRASE.txt` para você guardar no gerenciador de senhas
  e depois apagar o arquivo). Variáveis: `BACKUP_RECEPTOR_URL` e `SUPABASE_POOLER_HOST`.
- **Renovar** (ex.: trocou a chave do Supabase): rode `node ops/ativar-backup.mjs` de novo; a frase só muda com
  `--nova-frase`. Atualizou o receptor: `npx wrangler deploy` dentro de `ops/receptor-backup`.

## Restaurar

Baixe o arquivo `.tar.gz.enc` do balde (painel da Cloudflare → R2 → `jarvis-backups`) e, no Git Bash:

```sh
sh ops/restaurar-backup.sh jarvis-2026-10-02-0617.tar.gz.enc
```

O script pede a frase, decifra e abre numa pasta: `banco/` (`roles.sql`, `schema.sql`, `data.sql`) e `arquivos/`.
Para restaurar num projeto Supabase novo (com a conexão do projeto novo):

```sh
psql "$NOVO_DB_URL" -f banco/roles.sql
psql "$NOVO_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -f banco/schema.sql -c 'SET session_replication_role = replica' -f banco/data.sql
```

e envie os arquivos de `arquivos/<balde>/` para os baldes de mesmo nome.
