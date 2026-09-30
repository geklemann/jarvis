# Configurar a nuvem (Supabase + IA)

O site já está publicado no GitHub Pages (https://jaarvis.com.br/) em **modo local**. Estes passos ligam o modo nuvem: login, dados compartilhados entre computadores, integrações automáticas e o assistente de IA. Tudo é gratuito, exceto o consumo da IA (pago por uso na Anthropic).

> Nenhum destes passos pode ser feito pela IA por você: envolvem criar contas e copiar chaves secretas. Leva cerca de 15 minutos.

## 1. Criar o projeto no Supabase

1. Acesse https://supabase.com e entre (pode usar a conta do GitHub).
2. **New project** → nome `concil-ia`, região **South America (São Paulo)**, defina uma senha forte do banco e **guarde-a**.
3. Quando o projeto abrir, anote:
   - **Project ref**: o código na URL do painel (`https://supabase.com/dashboard/project/<REF>`).
   - Em **Project Settings › API**: a **Project URL** (`https://<REF>.supabase.co`) e a chave **anon / publishable** (pública).
4. Em **Account › Access Tokens** (https://supabase.com/dashboard/account/tokens), gere um token para o GitHub publicar o banco.

## 2. Chave da IA (Anthropic)

1. Acesse https://console.anthropic.com, crie a conta/organização e adicione créditos.
2. **API Keys › Create Key**. Copie a chave (`sk-ant-...`).
3. Recomendado: defina um limite mensal de gasto em **Limits** no console da Anthropic.

## 3. Publicação automática do Supabase

Já ativada: `.github/workflows/supabase.yml` aplica migrações, envia segredos e publica as funções a cada push em `supabase/` (ou manualmente em **Actions › Publicar banco e funções (Supabase) › Run workflow**).

## 4. Cadastrar segredos e variáveis no GitHub

No repositório: **Settings › Secrets and variables › Actions**.

**Variables** (aba *Variables*):

| Nome | Valor |
|---|---|
| `SUPABASE_PROJECT_REF` | `<REF>` |
| `AI_MODEL` *(opcional)* | padrão `claude-opus-5` |
| `AI_EFFORT` *(opcional)* | `low`, `medium` (padrão) ou `high` |
| `AI_DAILY_LIMIT` *(opcional)* | chamadas de IA por dia por workspace (padrão 400) |

**Secrets** (aba *Secrets*):

| Nome | Valor |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token do passo 1.4 |
| `SUPABASE_DB_PASSWORD` | senha do banco do passo 1.2 |
| `ANTHROPIC_API_KEY` | chave do passo 2 |
| `OAUTH_STATE_SECRET` | qualquer texto aleatório longo |
| `CRON_SECRET` *(opcional)* | texto aleatório, só para a sincronização agendada (passo 7) |

As credenciais das plataformas (Bling, Mercado Livre, Shopee, Magalu) entram aqui também — veja [INTEGRACOES.md](INTEGRACOES.md).

Depois: **Actions › Publicar banco e funções (Supabase) › Run workflow**. Ele cria as tabelas, envia os segredos e publica as funções.

> Sem GitHub Actions, dá para publicar do seu computador com o Supabase CLI: `supabase link --project-ref <REF>`, `supabase db push`, `supabase secrets set --env-file .env` e `supabase functions deploy`.

## 5. Ligar o site ao Supabase

Edite `web/config.js` com a **Project URL** e a chave **anon/publishable** (ambas públicas por natureza; a proteção dos dados vem do login e do RLS), faça o commit e publique o site:

```bash
sh ops/publicar-site.sh
```

Ou simplesmente peça ao Claude: **"ligue o site ao Supabase: URL … chave anon …"**.

## 6. Ajustar o login no Supabase

Em **Authentication › URL Configuration**:
- **Site URL**: `https://jaarvis.com.br/`
- **Redirect URLs**: adicione `https://jaarvis.com.br/**` e `http://127.0.0.1:3000/**`

Abra o site, clique em **Criar conta**, confirme pelo e-mail e entre. Se você tinha dados no modo local deste navegador, o sistema oferece copiá-los para a nuvem.
Para a equipe: cada pessoa cria a conta e o dono adiciona o e-mail em **Integrações › Equipe**.

> Recomendado depois que a equipe estiver cadastrada: **Authentication › Providers › Email › desative "Allow new users to sign up"**, para ninguém de fora criar contas.

## 7. Sincronização automática (opcional)

Para buscar os últimos 7 dias de todas as integrações de hora em hora, rode no **SQL Editor** do Supabase (troque `<REF>` e `<CRON_SECRET>`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('concilia-sync', '0 * * * *', $$
  select net.http_post(
    url := 'https://<REF>.supabase.co/functions/v1/integrations',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
    body := '{"action":"cron"}'::jsonb,
    timeout_milliseconds := 150000
  );
$$);
```

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Tela de login diz "Não foi possível abrir o workspace" | Migrações não aplicadas: rode o workflow do Supabase (passo 4) |
| "Funções do servidor indisponíveis" em Integrações | Edge Functions não publicadas ou `SUPABASE_ACCESS_TOKEN` inválido |
| Assistente responde "Chave da Anthropic inválida" | `ANTHROPIC_API_KEY` errada; corrija o secret e rode o workflow do Supabase |
| Link de confirmação de e-mail abre página errada | Passo 6 (URL Configuration) |
| Site continua em "MODO LOCAL" | `web/config.js` vazio ou site não republicado (passo 5) |
