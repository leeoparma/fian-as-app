-- ============================================================================
-- Bucket de fotos de NF + RLS
--
-- RODAR NO SQL EDITOR DO SUPABASE (Claude não tem acesso ao painel).
-- Depois de rodar, confirmar em Storage → Buckets que `nf` aparece como
-- "Private". Se aparecer "Public", PARE: notas fiscais são documento
-- financeiro e um bucket público é URL adivinhável sem autenticação.
--
-- Contexto: até 08/08/2026 a foto era base64 dentro de `profiles.data`, e
-- `supa.load()` (select=data) baixava tudo a cada boot. Em 28-29/06/2026 uma
-- única foto de 2,82MB era 99,2% do payload — causa raiz do estouro de egress
-- de 29/06-11/07. Agora a imagem vive aqui e o perfil guarda só o caminho.
--
-- Layout do path: <user_id>/<perfil>/<transacao_id>.jpg
-- O primeiro segmento é o uid — é ele que as policies comparam com auth.uid(),
-- então um usuário nunca alcança o arquivo de outro.
-- ============================================================================

-- 1) Bucket privado, com teto de tamanho e tipos restritos.
--    file_size_limit corta na origem o cenário que causou o incidente: sem
--    teto, um PNG de câmera moderna passa fácil dos 10MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nf', 'nf', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Policies: cada usuário só enxerga e escreve dentro da própria pasta.
--    storage.foldername(name) devolve os segmentos do path; [1] é o uid.
drop policy if exists "nf_ler_proprio"      on storage.objects;
drop policy if exists "nf_inserir_proprio"  on storage.objects;
drop policy if exists "nf_atualizar_proprio" on storage.objects;
drop policy if exists "nf_apagar_proprio"   on storage.objects;

create policy "nf_ler_proprio" on storage.objects
  for select to authenticated
  using (bucket_id = 'nf' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "nf_inserir_proprio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'nf' and (storage.foldername(name))[1] = auth.uid()::text);

-- update é necessário porque o upload usa x-upsert (trocar a foto da mesma
-- transação regrava o mesmo path em vez de acumular lixo)
create policy "nf_atualizar_proprio" on storage.objects
  for update to authenticated
  using (bucket_id = 'nf' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'nf' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "nf_apagar_proprio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'nf' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- VERIFICAÇÃO — rodar depois e conferir o resultado
-- ============================================================================
-- Deve devolver public=false e o limite de 5MB:
--   select id, public, file_size_limit, allowed_mime_types
--   from storage.buckets where id = 'nf';
--
-- Devem aparecer as 4 policies:
--   select policyname, cmd from pg_policies
--   where schemaname='storage' and tablename='objects' and policyname like 'nf_%';
--
-- ============================================================================
-- PENDENTE, NÃO RESOLVIDO POR ESTE ARQUIVO
-- ============================================================================
-- Trigger de updated_at em `profiles`: se existir um que use now() do servidor,
-- cada save passa a ser seguido de um download completo pelo puxar() (25s),
-- porque cloudTs ficaria > localTs. Conferir:
--   select tgname from pg_trigger
--   where tgrelid = 'profiles'::regclass and not tgisinternal;
-- Se aparecer algum, avaliar removê-lo — o app já carimba updated_at no cliente.
--
-- Órfãos: apagar a transação NÃO apaga o arquivo no Storage hoje. Enquanto o
-- volume for baixo isso é storage barato, não egress. Se virar problema, a
-- limpeza é uma listagem por prefixo <uid>/ cruzada com os ids em uso.
