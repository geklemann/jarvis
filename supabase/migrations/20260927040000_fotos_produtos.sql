-- Fotos dos produtos com endereço permanente. O link de imagem do Bling expira em 30 minutos e a sincronização
-- roda de hora em hora, então as fotos sumiam metade do tempo. A sincronização copia cada foto uma vez para este
-- bucket (público: são as mesmas fotos dos anúncios nos marketplaces) e grava a vitrine usada na tela de login.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 5242880, array['image/jpeg','image/png','image/webp','application/json'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
