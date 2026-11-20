-- JobMatch 004: private storage buckets for résumés and employer verification documents.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resumes', 'resumes', false, 5242880, array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('verification-docs', 'verification-docs', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- résumés: the owner manages them; an employer can read one only after shortlisting that applicant
create policy "resumes owner all" on storage.objects for all to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resumes shortlisted employer read" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
    where a.user_id::text = (storage.foldername(name))[1] and j.employer_id = auth.uid() and a.status in ('shortlisted', 'hired')));

-- verification documents: employer uploads and reads its own; admins read all
create policy "verification owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "verification owner read" on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "verification owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
