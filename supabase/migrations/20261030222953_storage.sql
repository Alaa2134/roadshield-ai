-- RoadShield AI — private storage buckets and object policies.
-- Images are never public URLs: the app requests short-lived signed URLs, which only work
-- when these policies let the caller read the object.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('hazard-images', 'hazard-images', false, 8388608, array['image/jpeg']),
  ('avatars', 'avatars', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- hazard-images: <uid>/<draft-or-task-id>/<file>.jpg
create policy "hazard images: upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'hazard-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "hazard images: overwrite own unattached" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'hazard-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.hazard_images hi where hi.storage_path = name)
  )
  with check (
    bucket_id = 'hazard-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "hazard images: remove own unattached" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'hazard-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.hazard_images hi where hi.storage_path = name)
  );

create policy "hazard images: read permitted" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'hazard-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_staff())
      or exists (
        select 1
        from public.hazard_images hi
        join public.hazards h on h.id = hi.hazard_id
        where hi.storage_path = name
          and hi.privacy_approved
          and hi.kind in ('report', 'additional')
          and h.status in ('verified', 'assigned', 'in_progress', 'resolved')
      )
    )
  );

-- avatars: <uid>/avatar.jpg — visible to the owner and administrators only.
create policy "avatars: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner or admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );
