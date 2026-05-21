-- Storage buckets required by branding and client check-in flows.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('checkins', 'checkins', true, 5242880, array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
  ('org-assets', 'org-assets', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('logos', 'logos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
