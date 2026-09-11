-- proof-cvs storage RLS policies. Run in the Supabase dashboard SQL editor
-- (or via the Management API) because storage.objects is owned by the
-- storage_admin role and cannot be altered from migrations.
--
-- Folder layout: proof-cvs/{rep_id}/{uuid}.{ext}

do $$
begin
  create policy storage_cv_select on storage.objects for select
    to authenticated
    using (
      bucket_id = 'proof-cvs'
      and (
        (storage.foldername(name))[1] = public.current_rep_id()::text
        or public.is_admin()
      )
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy storage_cv_insert on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'proof-cvs'
      and (storage.foldername(name))[1] = public.current_rep_id()::text
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy storage_cv_delete on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'proof-cvs'
      and (storage.foldername(name))[1] = public.current_rep_id()::text
    );
exception when duplicate_object then null;
end $$;