-- Alertas por e-mail e WhatsApp e o relatório semanal da diretoria.
-- alertas_destinos: quem recebe, por qual canal e quais avisos. Só o dono cadastra; os membros veem a lista.
-- alertas_envios: registro de cada envio (ou falha), gravado só pelo servidor — serve para conferir o que saiu.
-- Os canais só enviam depois que as chaves forem gravadas no servidor (RESEND_API_KEY para e-mail;
-- WHATSAPP_TOKEN e WHATSAPP_PHONE_ID para WhatsApp). Sem elas, nada sai e a tela avisa.
create table if not exists public.alertas_destinos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  canal text not null check (canal in ('email', 'whatsapp')),
  destino text not null,
  nome text,
  -- nfe | atendimento | ruptura | venc | venc_amanha | repasse | aprov | semanal
  tipos text[] not null default array['nfe','atendimento','ruptura','venc','venc_amanha','repasse','aprov','semanal'],
  ativo boolean not null default true,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (workspace_id, canal, destino)
);
alter table public.alertas_destinos enable row level security;
drop policy if exists alertas_destinos_ler on public.alertas_destinos;
drop policy if exists alertas_destinos_dono on public.alertas_destinos;
create policy alertas_destinos_ler on public.alertas_destinos for select using (public.is_member(workspace_id));
create policy alertas_destinos_dono on public.alertas_destinos for all using (public.is_owner(workspace_id)) with check (public.is_owner(workspace_id));

create table if not exists public.alertas_envios (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  canal text not null,
  destino text not null,
  tipo text not null,
  assunto text,
  status text not null check (status in ('enviado', 'falhou', 'sem_canal')),
  erro text,
  enviado_em timestamptz not null default now()
);
create index if not exists alertas_envios_ws_em on public.alertas_envios (workspace_id, enviado_em desc);
alter table public.alertas_envios enable row level security;
drop policy if exists alertas_envios_ler on public.alertas_envios;
create policy alertas_envios_ler on public.alertas_envios for select using (public.is_member(workspace_id));
