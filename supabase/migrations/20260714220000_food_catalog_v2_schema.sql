-- EVA Nutrition V2 — local food catalog media and import staging.
-- Additive only. No external catalog calls and no V1 data rewrite.

create table public.food_media (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  kind text not null
    check (kind in ('product_photo', 'eva_illustration', 'category_fallback')),
  bucket text not null default 'food-media'
    check (bucket = 'food-media'),
  object_path text not null
    check (char_length(btrim(object_path)) between 1 and 500),
  version integer not null default 1 check (version > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  mime_type text,
  blurhash text,
  license text not null default 'unknown'
    check (license in (
      'eva_owned',
      'supplier_authorized',
      'public_domain',
      'cc_by',
      'cc_by_sa',
      'unknown'
    )),
  source_url text,
  attribution text,
  is_primary boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (food_id, object_path)
);

create unique index food_media_primary_unique_idx
  on public.food_media(food_id)
  where is_primary;

create index food_media_food_kind_idx
  on public.food_media(food_id, kind, is_primary desc, updated_at desc);

create table public.food_catalog_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null
    check (char_length(btrim(source)) between 1 and 80),
  country_code text not null default 'CL'
    check (country_code ~ '^[A-Z]{2}$'),
  file_name text,
  checksum text,
  status text not null default 'staging'
    check (status in (
      'staging',
      'validating',
      'ready',
      'imported',
      'failed',
      'cancelled'
    )),
  total_rows integer not null default 0 check (total_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.food_catalog_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null
    references public.food_catalog_import_batches(id) on delete cascade,
  source_row integer not null check (source_row > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  normalized_gtin text,
  normalized_catalog_key text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'duplicate')),
  rejection_reason text,
  resolved_food_id uuid references public.foods(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (batch_id, source_row)
);

create index food_catalog_import_rows_batch_status_idx
  on public.food_catalog_import_rows(batch_id, status, source_row);

create index food_catalog_import_rows_gtin_idx
  on public.food_catalog_import_rows(normalized_gtin)
  where normalized_gtin is not null;

alter table public.food_catalog_missing_codes
  add column if not exists captured_name text,
  add column if not exists captured_brand text,
  add column if not exists package_photo_path text,
  add column if not exists report_source text not null default 'manual',
  add column if not exists last_idempotency_key text,
  add column if not exists status text not null default 'open',
  add column if not exists updated_at timestamptz not null default now();

alter table public.food_catalog_missing_codes
  add constraint food_catalog_missing_codes_report_source_check
    check (report_source in ('pwa_scanner', 'rn_scanner', 'manual')),
  add constraint food_catalog_missing_codes_status_check
    check (status in ('open', 'resolved', 'rejected')),
  add constraint food_catalog_missing_codes_photo_path_check
    check (
      package_photo_path is null
      or char_length(package_photo_path) between 1 and 500
    );

create unique index food_catalog_missing_codes_idempotency_idx
  on public.food_catalog_missing_codes(client_id, last_idempotency_key)
  where last_idempotency_key is not null;

create index foods_search_aliases_gin_idx
  on public.foods using gin(search_aliases);

create index foods_catalog_search_cover_idx
  on public.foods(country_code, verification_status, name)
  where verification_status <> 'rejected';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'food-media',
  'food-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'food-submissions',
  'food-submissions',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy food_media_public_read
on storage.objects
for select
to public
using (bucket_id = 'food-media');

create policy food_submissions_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'food-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy food_submissions_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'food-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy food_submissions_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'food-submissions'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function private.food_catalog_v2_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger food_media_set_updated_at
before update on public.food_media
for each row execute function private.food_catalog_v2_set_updated_at();

create trigger food_catalog_missing_codes_set_updated_at
before update on public.food_catalog_missing_codes
for each row execute function private.food_catalog_v2_set_updated_at();

alter table public.food_media enable row level security;
alter table public.food_catalog_import_batches enable row level security;
alter table public.food_catalog_import_rows enable row level security;

revoke all on public.food_media from public, anon, authenticated;
revoke all on public.food_catalog_import_batches from public, anon, authenticated;
revoke all on public.food_catalog_import_rows from public, anon, authenticated;

revoke all on function private.food_catalog_v2_set_updated_at()
  from public, anon, authenticated;

comment on table public.food_media is
  'Versioned metadata for curated local food images stored in food-media.';
comment on table public.food_catalog_import_batches is
  'Service-only local import batches. Staging never makes a product visible.';
comment on table public.food_catalog_import_rows is
  'Service-only normalized staging rows with explicit acceptance or rejection.';
