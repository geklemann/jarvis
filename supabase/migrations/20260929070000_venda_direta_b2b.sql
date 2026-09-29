-- Venda direta B2B: tabela de preço aplicada, representante e percentual de comissão da venda.
alter table public.vendas_diretas
  add column if not exists tabela_preco text,
  add column if not exists representante text,
  add column if not exists comissao_pct numeric(5,2);
