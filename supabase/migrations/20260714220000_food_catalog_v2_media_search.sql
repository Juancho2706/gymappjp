-- EVA Nutrition V2 — local food catalog, media metadata, import staging,
-- optimized search, GTIN lookup and missing-product reporting.
-- No external catalog call is introduced.

create table public.food_media (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  kind text not null check (kind in ('product_photo', 'eva_illustration', 'category_fallback')),
  bucket text not null default 'food-media' check (bucket = 'food-media'),
  object_path text not null check (char_length(btrim(object_path)) between 1 and 500),
  version integer not null default 1 check (version > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  mime_type text,
  blurhash text,
  license text not null default 'unknown'
    check (license in ('eva_owned', 'supplier_authorized', 'public_domain', 'cc_by', 'cc_by_sa', 'unknown')),
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
  source text not null check (char_length(btrim(source)) between 1 and 80),
  country_code text not null default 'CL' check (country_code ~ '^[A-Z]{2}$'),
  file_name text,
  checksum text,
  status text not null default 'staging'
    check (status in ('staging', 'validating', 'ready', 'imported', 'failed', 'cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.food_catalog_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_catalog_import_batches(id) on delete cascade,
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
    check (package_photo_path is null or char_length(package_photo_path) between 1 and 500);

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

create or replace function private.food_catalog_v2_normalize_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    lower(public.unaccent(coalesce(p_value, ''))),
    '[^a-z0-9]+',
    ' ',
    'g'
  ));
$$;

create or replace function private.food_catalog_v2_is_valid_gtin(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_gtin text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  v_body text;
  v_sum integer := 0;
  v_weight integer := 3;
  v_index integer;
  v_expected integer;
begin
  if char_length(v_gtin) not in (8, 12, 13, 14) then return false; end if;
  v_body := left(v_gtin, char_length(v_gtin) - 1);
  for v_index in reverse char_length(v_body)..1 loop
    v_sum := v_sum + substring(v_body from v_index for 1)::integer * v_weight;
    v_weight := case when v_weight = 3 then 1 else 3 end;
  end loop;
  v_expected := (10 - (v_sum % 10)) % 10;
  return v_expected = right(v_gtin, 1)::integer;
end;
$$;

create or replace function private.food_catalog_v2_can_read_food(p_food_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.foods f
    where f.id = p_food_id
      and (
        (f.coach_id is null and f.org_id is null)
        or (f.coach_id = auth.uid() and f.org_id is null)
        or (f.org_id is not null and public.is_active_org_member(f.org_id))
        or exists (
          select 1
          from public.clients c
          where c.id = auth.uid()
            and (
              (f.coach_id is not null and f.org_id is null and c.coach_id = f.coach_id)
              or (f.org_id is not null and c.org_id = f.org_id)
            )
        )
      )
  );
$$;

create or replace function private.food_catalog_v2_media_json(p_food_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', fm.id,
    'kind', fm.kind,
    'bucket', fm.bucket,
    'objectPath', fm.object_path,
    'version', fm.version,
    'width', fm.width,
    'height', fm.height,
    'mimeType', fm.mime_type,
    'blurhash', fm.blurhash,
    'license', fm.license,
    'sourceUrl', fm.source_url,
    'attribution', fm.attribution,
    'updatedAt', fm.updated_at
  )
  from public.food_media fm
  where fm.food_id = p_food_id
  order by fm.is_primary desc,
    case fm.kind when 'product_photo' then 0 when 'eva_illustration' then 1 else 2 end,
    fm.updated_at desc
  limit 1;
$$;

create or replace function private.food_catalog_v2_item_json(p_food public.foods)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_food.id,
    'catalogKey', p_food.catalog_key,
    'gtin', p_food.barcode,
    'name', p_food.name,
    'brand', p_food.brand,
    'category', p_food.category,
    'countryCode', p_food.country_code,
    'servingSize', p_food.serving_size,
    'servingUnit', coalesce(p_food.serving_unit, 'g'),
    'calories', p_food.calories,
    'proteinG', p_food.protein_g,
    'carbsG', p_food.carbs_g,
    'fatsG', p_food.fats_g,
    'fiberG', p_food.fiber_g,
    'sodiumMg', p_food.sodium_mg,
    'sugarG', p_food.sugar_g,
    'saturatedFatG', p_food.saturated_fat_g,
    'packageQuantity', p_food.package_quantity,
    'packageUnit', p_food.package_unit,
    'source', p_food.catalog_source,
    'sourceRef', p_food.source_ref,
    'verificationStatus', p_food.verification_status,
    'media', private.food_catalog_v2_media_json(p_food.id)
  );
$$;

create or replace function public.search_food_catalog_v2(
  p_query text,
  p_country_code text default 'CL',
  p_cursor_score numeric default null,
  p_cursor_name text default null,
  p_cursor_id uuid default null,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := private.food_catalog_v2_normalize_text(p_query);
  v_country text := upper(coalesce(p_country_code, 'CL'));
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next jsonb := null;
begin
  if auth.uid() is null then
    raise exception 'food_catalog_v2_auth_required' using errcode = '42501';
  end if;
  if char_length(v_query) < 2 then
    return jsonb_build_object(
      'schemaVersion', 1,
      'generatedAt', now(),
      'query', v_query,
      'countryCode', v_country,
      'items', '[]'::jsonb,
      'nextCursor', null,
      'hasMore', false
    );
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'food_catalog_v2_invalid_country' using errcode = '22023';
  end if;

  with scored as (
    select
      f.*,
      greatest(
        public.similarity(coalesce(f.name_search, ''), v_query),
        case when coalesce(f.name_search, '') like '%' || v_query || '%' then 0.75 else 0 end,
        case when exists (
          select 1 from unnest(coalesce(f.search_aliases, '{}'::text[])) alias
          where alias like '%' || v_query || '%'
        ) then 0.7 else 0 end
      )::numeric as search_score
    from public.foods f
    where f.verification_status <> 'rejected'
      and (f.country_code is null or f.country_code = v_country)
      and private.food_catalog_v2_can_read_food(f.id)
      and (
        coalesce(f.name_search, '') like '%' || v_query || '%'
        or public.similarity(coalesce(f.name_search, ''), v_query) >= 0.18
        or exists (
          select 1 from unnest(coalesce(f.search_aliases, '{}'::text[])) alias
          where alias like '%' || v_query || '%'
        )
      )
  ), cursor_filtered as (
    select *
    from scored
    where p_cursor_score is null
      or search_score < p_cursor_score
      or (search_score = p_cursor_score and f_name_after(name, id, p_cursor_name, p_cursor_id))
    order by search_score desc, name asc, id asc
    limit v_page_size + 1
  ), page as (
    select * from cursor_filtered
    order by search_score desc, name asc, id asc
    limit v_page_size
  )
  select
    coalesce(jsonb_agg(private.food_catalog_v2_item_json(page) order by search_score desc, name asc, id asc), '[]'::jsonb),
    (select count(*) from cursor_filtered) > v_page_size,
    case when (select count(*) from cursor_filtered) > v_page_size then (
      select jsonb_build_object('score', search_score, 'name', name, 'id', id)
      from page order by search_score asc, name desc, id desc limit 1
    ) else null end
  into v_items, v_has_more, v_next
  from page;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'query', v_query,
    'countryCode', v_country,
    'items', v_items,
    'nextCursor', v_next,
    'hasMore', coalesce(v_has_more, false)
  );
end;
$$;

create or replace function public.lookup_food_by_gtin_v2(
  p_gtin text,
  p_country_code text default 'CL'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gtin text := regexp_replace(coalesce(p_gtin, ''), '[^0-9]', '', 'g');
  v_country text := upper(coalesce(p_country_code, 'CL'));
  v_food public.foods%rowtype;
begin
  if auth.uid() is null then
    raise exception 'food_catalog_v2_auth_required' using errcode = '42501';
  end if;
  if not private.food_catalog_v2_is_valid_gtin(v_gtin) then
    return jsonb_build_object('schemaVersion', 1, 'generatedAt', now(), 'status', 'invalid', 'gtin', v_gtin);
  end if;

  select f.* into v_food
  from public.foods f
  where f.barcode = v_gtin
    and f.verification_status <> 'rejected'
    and (f.country_code is null or f.country_code = v_country)
    and private.food_catalog_v2_can_read_food(f.id)
  order by
    case f.verification_status when 'eva_verified' then 0 when 'coach_verified' then 1 when 'community' then 2 else 3 end,
    f.updated_at desc nulls last
  limit 1;

  if v_food.id is null then
    return jsonb_build_object(
      'schemaVersion', 1,
      'generatedAt', now(),
      'status', 'not_found',
      'gtin', v_gtin,
      'missingReportId', null
    );
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'status', case when v_food.verification_status in ('eva_verified', 'coach_verified') then 'found' else 'pending_verification' end,
    'gtin', v_gtin,
    'food', private.food_catalog_v2_item_json(v_food)
  );
end;
$$;

create or replace function public.report_missing_food_gtin_v2(
  p_client_id uuid,
  p_gtin text,
  p_country_code text,
  p_captured_name text,
  p_captured_brand text,
  p_package_photo_path text,
  p_source text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gtin text := regexp_replace(coalesce(p_gtin, ''), '[^0-9]', '', 'g');
  v_country text := upper(coalesce(p_country_code, 'CL'));
  v_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_client_id then
    raise exception 'food_catalog_v2_report_scope_denied' using errcode = '42501';
  end if;
  if not private.food_catalog_v2_is_valid_gtin(v_gtin) then
    raise exception 'food_catalog_v2_invalid_gtin' using errcode = '22023';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'food_catalog_v2_invalid_country' using errcode = '22023';
  end if;
  if p_source not in ('pwa_scanner', 'rn_scanner', 'manual') then
    raise exception 'food_catalog_v2_invalid_report_source' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 200 then
    raise exception 'food_catalog_v2_invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_package_photo_path is not null
    and split_part(p_package_photo_path, '/', 1) <> auth.uid()::text then
    raise exception 'food_catalog_v2_photo_scope_denied' using errcode = '42501';
  end if;

  select m.id into v_id
  from public.food_catalog_missing_codes m
  where m.client_id = p_client_id
    and m.last_idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  insert into public.food_catalog_missing_codes (
    client_id,
    barcode,
    country_code,
    captured_name,
    captured_brand,
    package_photo_path,
    report_source,
    last_idempotency_key,
    status,
    sightings,
    first_seen_at,
    last_seen_at,
    updated_at
  ) values (
    p_client_id,
    v_gtin,
    v_country,
    nullif(btrim(p_captured_name), ''),
    nullif(btrim(p_captured_brand), ''),
    nullif(btrim(p_package_photo_path), ''),
    p_source,
    p_idempotency_key,
    'open',
    1,
    now(),
    now(),
    now()
  )
  on conflict (client_id, barcode) do update set
    sightings = public.food_catalog_missing_codes.sightings + 1,
    last_seen_at = now(),
    captured_name = coalesce(excluded.captured_name, public.food_catalog_missing_codes.captured_name),
    captured_brand = coalesce(excluded.captured_brand, public.food_catalog_missing_codes.captured_brand),
    package_photo_path = coalesce(excluded.package_photo_path, public.food_catalog_missing_codes.package_photo_path),
    report_source = excluded.report_source,
    last_idempotency_key = excluded.last_idempotency_key,
    status = case when public.food_catalog_missing_codes.resolved_at is null then 'open' else 'resolved' end,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- Helper used by the keyset cursor; explicit function avoids nullable tuple surprises.
create or replace function public.f_name_after(
  p_name text,
  p_id uuid,
  p_cursor_name text,
  p_cursor_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_cursor_name is null
    or p_name > p_cursor_name
    or (p_name = p_cursor_name and (p_cursor_id is null or p_id > p_cursor_id));
$$;

alter table public.food_media enable row level security;
alter table public.food_catalog_import_batches enable row level security;
alter table public.food_catalog_import_rows enable row level security;

create policy food_media_visible_select
on public.food_media
for select
to authenticated
using (private.food_catalog_v2_can_read_food(food_id));

revoke all on public.food_media from public, anon, authenticated;
grant select on public.food_media to authenticated;
revoke all on public.food_catalog_import_batches from public, anon, authenticated;
revoke all on public.food_catalog_import_rows from public, anon, authenticated;

revoke all on function private.food_catalog_v2_set_updated_at() from public, anon, authenticated;
revoke all on function private.food_catalog_v2_normalize_text(text) from public, anon, authenticated;
revoke all on function private.food_catalog_v2_is_valid_gtin(text) from public, anon, authenticated;
revoke all on function private.food_catalog_v2_can_read_food(uuid) from public, anon, authenticated;
revoke all on function private.food_catalog_v2_media_json(uuid) from public, anon, authenticated;
revoke all on function private.food_catalog_v2_item_json(public.foods) from public, anon, authenticated;
revoke all on function public.f_name_after(text, uuid, text, uuid) from public, anon, authenticated;

revoke all on function public.search_food_catalog_v2(text, text, numeric, text, uuid, integer) from public, anon;
revoke all on function public.lookup_food_by_gtin_v2(text, text) from public, anon;
revoke all on function public.report_missing_food_gtin_v2(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.search_food_catalog_v2(text, text, numeric, text, uuid, integer) to authenticated;
grant execute on function public.lookup_food_by_gtin_v2(text, text) to authenticated;
grant execute on function public.report_missing_food_gtin_v2(uuid, text, text, text, text, text, text, text) to authenticated;

comment on table public.food_media is 'Versioned media metadata for local food catalog items. Curated assets live in food-media.';
comment on table public.food_catalog_import_rows is 'Service-only staging rows; no catalog item becomes visible merely by staging it.';
comment on function public.search_food_catalog_v2(text, text, numeric, text, uuid, integer) is 'Token-scoped local catalog search with keyset pagination and no external API call.';
comment on function public.lookup_food_by_gtin_v2(text, text) is 'Local GTIN lookup with checksum validation and verification state.';
comment on function public.report_missing_food_gtin_v2(uuid, text, text, text, text, text, text, text) is 'Idempotent queue for missing local GTINs and optional private package-photo path.';
