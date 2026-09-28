-- Mudança de contrato programada (ex.: pró-labore até 30/09, CLT a partir de 01/10). A folha usa o contrato novo
-- a partir da competência de "proximo_em"; a data vira a admissão do novo vínculo.
alter table public.ponto_colaboradores
  add column if not exists proximo_em date,
  add column if not exists proximo_vinculo text check (proximo_vinculo in ('clt','prolabore','estagio')),
  add column if not exists proximo_salario numeric(12,2);
