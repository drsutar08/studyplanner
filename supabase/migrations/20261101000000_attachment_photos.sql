-- Study Planner: task photos in Supabase Storage.
-- A photo on a task is a file at attachments/<user id>/<attachment id>.jpg; the task's row only keeps its path.
-- Private: each user can read, add, replace and remove files in their own folder only.
-- Apply in the Supabase dashboard (SQL Editor -> paste -> Run), after 20261031000000_cloud_sync.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "attachments: read own" on storage.objects;
create policy "attachments: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments: add own" on storage.objects;
create policy "attachments: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments: replace own" on storage.objects;
create policy "attachments: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "attachments: remove own" on storage.objects;
create policy "attachments: remove own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
