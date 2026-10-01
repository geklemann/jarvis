-- GNRE: o que o Portal/SEFAZ respondeu na última consulta de cada guia (situação do lote e da guia, motivos, quando).
alter table public.gnre_guias add column if not exists retorno jsonb;
