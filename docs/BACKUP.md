# Backup do Jarvis (Supabase → Cloudflare R2)

Todo dia às 03:17 (Brasília), o GitHub copia **o banco inteiro** (papéis, estrutura e dados, incluindo os logins) e
**todos os arquivos do Storage** (`contabil`, `produtos`, `documentos`, `ponto`), compacta, **cifra** com uma frase
que só você conhece e envia ao balde **`jarvis-backups`** no Cloudflare R2. Fluxo: `.github/workflows/backup.yml`.

| Onde | Guarda | Proteção |
|---|---|---|
| `diario/AAAA-MM-DD/` | um backup por dia | ninguém apaga antes de 30 dias; some sozinho com 35 |
| `mensal/AAAA-MM/` | o do dia 1 de cada mês | ninguém apaga antes de 1 ano; some sozinho com 400 dias |

- **Conferência diária:** depois de enviar, o fluxo baixa o arquivo de volta, decifra e compara a soma de verificação.
- **Teste de restauração:** no dia 1 de cada mês (e sempre que você rodar à mão), o backup é restaurado num banco
  descartável (mesma versão, Postgres 17) e as linhas de cada tabela são comparadas com o original
  (`ops/backup-contagem.mjs`).
- **Se falhar:** o GitHub manda e-mail para o dono do repositório.
- **Cópia 3:** o Supabase já guarda os próprios backups (no plano Pro, 7 dias). Uma vez por mês, vale baixar o backup
  mensal para um HD seu (regra 3-2-1: três cópias, dois lugares, uma fora do provedor principal).

## Ativar (uma vez, uns 10 minutos, feito por você)

1. **Chave do R2:** no painel da Cloudflare → **R2** → **Manage API tokens** (ou "Gerenciar tokens da API") →
   **Create Account API token**: nome `jarvis-backups`, permissão **Object Read & Write**, só o balde
   **`jarvis-backups`**, sem data de expiração → **Create**. A tela mostra o **Access Key ID** e o **Secret Access Key**
   (só desta vez): deixe a tela aberta.
2. **Frase do backup:** invente uma frase longa (ex.: quatro palavras aleatórias e um número) e guarde no seu
   gerenciador de senhas. **Sem ela, ninguém (nem você) abre os backups.**
3. Dê dois cliques em `ops\cadastrar-segredos-backup.cmd` e cole, quando pedir, o Access Key ID, o Secret Access Key
   e a frase. Nada aparece na tela; tudo vai direto para os segredos do GitHub.
4. Pronto: o próximo backup já sobe para o R2. Para testar na hora: GitHub → **Actions** → **Backup (Supabase →
   Cloudflare R2)** → **Run workflow**.

A variável `R2_ACCOUNT_ID` (número da conta, não é segredo) já está cadastrada no repositório.

## Restaurar

Para abrir um backup no seu computador (Git Bash, que já vem com o `openssl`):

```sh
sh ops/restaurar-backup.sh jarvis-2026-10-02.tar.gz.enc
```

O script pede a frase, decifra e abre numa pasta: `banco/` (`roles.sql`, `schema.sql`, `data.sql`) e `arquivos/`.
Para restaurar num projeto Supabase novo, em ordem (com a conexão do projeto novo):

```sh
psql "$NOVO_DB_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -f banco/roles.sql -f banco/schema.sql -c 'SET session_replication_role = replica' -f banco/data.sql
```

e envie os arquivos de `arquivos/<balde>/` para os baldes de mesmo nome (`supabase storage cp -r`).
