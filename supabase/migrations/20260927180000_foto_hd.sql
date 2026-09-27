-- Foto em alta resolução dos produtos: marca quando a foto original (não a miniatura da listagem) foi copiada.
alter table public.produtos add column if not exists foto_hd_em timestamptz;
