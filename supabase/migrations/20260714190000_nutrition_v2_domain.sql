-- EVA Nutrition V2 — additive domain foundation.
-- This migration creates parallel versioned prescription tables and extends the
-- existing canonical intake table without removing or reinterpreting legacy data.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;

create table public.nutrition_plans_v2 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete restrict,
  org_id uuid references public.organizations(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 180),
  strategy text not null check (strategy in ('structured', 'flexible', 'hybrid')),
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active', 'archived')),
  current_published_version_id uuid,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint nutrition_plans_v2_archive_state_check check (
    (lifecycle_status = 'archived' and archived_at is not null)
    or (lifecycle_status = 'active' and archived_at is null)
  )
);

create table public.nutrition_plan_versions_v2 (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.nutrition_plans_v2(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'superseded', 'archived')),
  strategy text not null check (strategy in ('structured', 'flexible', 'hybrid')),
  effective_from date,
  effective_to date,
  timezone text not null default 'America/Santiago' check (char_length(timezone) between 1 and 80),
  student_permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(student_permissions) = 'object'),
  visible_notes text,
  private_notes text,
  protocol_notes text,
  parent_version_id uuid references public.nutrition_plan_versions_v2(id) on delete set null,
  published_at timestamptz,
  published_by uuid,
  publish_idempotency_key text,
  lock_version integer not null default 1 check (lock_version > 0),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_plan_versions_v2_effective_range_check check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  ),
  constraint nutrition_plan_versions_v2_publish_state_check check (
    (status in ('published', 'superseded') and published_at is not null and published_by is not null and effective_from is not null)
    or status in ('draft', 'archived')
  ),
  unique (plan_id, version_number)
);

alter table public.nutrition_plans_v2
  add constraint nutrition_plans_v2_current_version_fkey
  foreign key (current_published_version_id)
  references public.nutrition_plan_versions_v2(id)
  on delete set null
  deferrable initially deferred;

create table public.nutrition_day_variants_v2 (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.nutrition_plan_versions_v2(id) on delete cascade,
  variant_key text not null check (char_length(btrim(variant_key)) between 1 and 64),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  day_of_week smallint check (day_of_week between 0 and 6),
  is_default boolean not null default false,
  target_calories numeric check (target_calories is null or target_calories >= 0),
  target_protein_g numeric check (target_protein_g is null or target_protein_g >= 0),
  target_carbs_g numeric check (target_carbs_g is null or target_carbs_g >= 0),
  target_fats_g numeric check (target_fats_g is null or target_fats_g >= 0),
  target_fiber_g numeric check (target_fiber_g is null or target_fiber_g >= 0),
  target_sodium_mg numeric check (target_sodium_mg is null or target_sodium_mg >= 0),
  target_water_ml numeric check (target_water_ml is null or target_water_ml >= 0),
  order_index integer not null default 0 check (order_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version_id, variant_key),
  unique (id, version_id)
);

create table public.nutrition_meal_slots_v2 (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  day_variant_id uuid not null,
  slot_code text not null check (char_length(btrim(slot_code)) between 1 and 64),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  start_time time,
  end_time time,
  slot_mode text not null default 'anchor' check (slot_mode in ('anchor', 'flexible')),
  is_required boolean not null default false,
  target_calories numeric check (target_calories is null or target_calories >= 0),
  target_protein_g numeric check (target_protein_g is null or target_protein_g >= 0),
  target_carbs_g numeric check (target_carbs_g is null or target_carbs_g >= 0),
  target_fats_g numeric check (target_fats_g is null or target_fats_g >= 0),
  instructions text,
  order_index integer not null default 0 check (order_index >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_meal_slots_v2_variant_version_fkey
    foreign key (day_variant_id, version_id)
    references public.nutrition_day_variants_v2(id, version_id)
    on delete cascade,
  unique (day_variant_id, slot_code),
  unique (id, version_id)
);

create table public.nutrition_prescription_items_v2 (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null,
  meal_slot_id uuid not null,
  food_id uuid references public.foods(id) on delete set null,
  recipe_id uuid references public.nutrition_recipes(id) on delete set null,
  custom_name text,
  quantity numeric not null check (quantity > 0),
  unit text not null check (char_length(btrim(unit)) between 1 and 32),
  minimum_quantity numeric check (minimum_quantity is null or minimum_quantity >= 0),
  maximum_quantity numeric check (maximum_quantity is null or maximum_quantity > 0),
  is_optional boolean not null default false,
  substitution_group_id uuid,
  notes text,
  order_index integer not null default 0 check (order_index >= 0),
  snapshot_name text,
  snapshot_brand text,
  snapshot_calories numeric check (snapshot_calories is null or snapshot_calories >= 0),
  snapshot_protein_g numeric check (snapshot_protein_g is null or snapshot_protein_g >= 0),
  snapshot_carbs_g numeric check (snapshot_carbs_g is null or snapshot_carbs_g >= 0),
  snapshot_fats_g numeric check (snapshot_fats_g is null or snapshot_fats_g >= 0),
  snapshot_fiber_g numeric check (snapshot_fiber_g is null or snapshot_fiber_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nutrition_prescription_items_v2_slot_version_fkey
    foreign key (meal_slot_id, version_id)
    references public.nutrition_meal_slots_v2(id, version_id)
    on delete cascade,
  constraint nutrition_prescription_items_v2_source_check check (
    num_nonnulls(food_id, recipe_id, nullif(btrim(custom_name), '')) >= 1
  ),
  constraint nutrition_prescription_items_v2_quantity_range_check check (
    maximum_quantity is null or minimum_quantity is null or maximum_quantity >= minimum_quantity
  )
);

create table public.nutrition_day_snapshots_v2 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  local_date date not null,
  timezone text not null check (char_length(timezone) between 1 and 80),
  plan_id uuid references public.nutrition_plans_v2(id) on delete set null,
  version_id uuid references public.nutrition_plan_versions_v2(id) on delete set null,
  day_variant_id uuid references public.nutrition_day_variants_v2(id) on delete set null,
  strategy text check (strategy is null or strategy in ('structured', 'flexible', 'hybrid')),
  target_calories numeric check (target_calories is null or target_calories >= 0),
  target_protein_g numeric check (target_protein_g is null or target_protein_g >= 0),
  target_carbs_g numeric check (target_carbs_g is null or target_carbs_g >= 0),
  target_fats_g numeric check (target_fats_g is null or target_fats_g >= 0),
  target_fiber_g numeric check (target_fiber_g is null or target_fiber_g >= 0),
  target_sodium_mg numeric check (target_sodium_mg is null or target_sodium_mg >= 0),
  target_water_ml numeric check (target_water_ml is null or target_water_ml >= 0),
  student_permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(student_permissions) = 'object'),
  prescription_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(prescription_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (client_id, local_date)
);

create table public.nutrition_v2_audit_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  plan_id uuid references public.nutrition_plans_v2(id) on delete set null,
  version_id uuid references public.nutrition_plan_versions_v2(id) on delete set null,
  intake_entry_id uuid references public.nutrition_intake_entries(id) on delete set null,
  actor_user_id uuid,
  actor_role text not null check (actor_role in ('student', 'coach', 'org_admin', 'team_member', 'system')),
  action text not null check (char_length(btrim(action)) between 1 and 120),
  entity_type text not null check (char_length(btrim(entity_type)) between 1 and 80),
  entity_id uuid,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

-- Additive extensions of the existing canonical intake table. Legacy columns and
-- constraints remain unchanged. V2 stores richer values in parallel columns.
alter table public.nutrition_intake_entries
  add column if not exists idempotency_key text,
  add column if not exists actor_user_id uuid,
  add column if not exists actor_role text,
  add column if not exists entry_status text not null default 'active',
  add column if not exists corrects_entry_id uuid,
  add column if not exists corrected_by_entry_id uuid,
  add column if not exists correction_reason text,
  add column if not exists occurred_at timestamptz,
  add column if not exists timezone text,
  add column if not exists plan_version_id uuid,
  add column if not exists day_snapshot_id uuid,
  add column if not exists prescription_item_id uuid,
  add column if not exists intake_source_v2 text,
  add column if not exists capture_method_v2 text,
  add column if not exists meal_slot_v2 text,
  add column if not exists revision integer not null default 1;

alter table public.nutrition_intake_entries
  add constraint nutrition_intake_entries_v2_actor_role_check
    check (actor_role is null or actor_role in ('student', 'coach', 'org_admin', 'team_member', 'system')),
  add constraint nutrition_intake_entries_v2_status_check
    check (entry_status in ('active', 'corrected', 'voided')),
  add constraint nutrition_intake_entries_v2_source_check
    check (intake_source_v2 is null or intake_source_v2 in ('offplan', 'prescription', 'substitution', 'recipe', 'manual', 'legacy')),
  add constraint nutrition_intake_entries_v2_capture_check
    check (capture_method_v2 is null or capture_method_v2 in ('search', 'barcode', 'recent', 'favorite', 'recipe', 'prescription', 'manual', 'legacy')),
  add constraint nutrition_intake_entries_v2_revision_check
    check (revision > 0),
  add constraint nutrition_intake_entries_v2_occurred_timezone_check
    check (
      (idempotency_key is null)
      or (occurred_at is not null and timezone is not null and char_length(timezone) between 1 and 80)
    ),
  add constraint nutrition_intake_entries_v2_corrects_fkey
    foreign key (corrects_entry_id) references public.nutrition_intake_entries(id) on delete restrict,
  add constraint nutrition_intake_entries_v2_corrected_by_fkey
    foreign key (corrected_by_entry_id) references public.nutrition_intake_entries(id) on delete restrict,
  add constraint nutrition_intake_entries_v2_plan_version_fkey
    foreign key (plan_version_id) references public.nutrition_plan_versions_v2(id) on delete set null,
  add constraint nutrition_intake_entries_v2_day_snapshot_fkey
    foreign key (day_snapshot_id) references public.nutrition_day_snapshots_v2(id) on delete set null,
  add constraint nutrition_intake_entries_v2_prescription_item_fkey
    foreign key (prescription_item_id) references public.nutrition_prescription_items_v2(id) on delete set null;

create unique index nutrition_plan_versions_v2_current_unique
  on public.nutrition_plan_versions_v2(plan_id)
  where status = 'published' and effective_to is null;

create unique index nutrition_plan_versions_v2_publish_idempotency_unique
  on public.nutrition_plan_versions_v2(publish_idempotency_key)
  where publish_idempotency_key is not null;

create unique index nutrition_day_variants_v2_default_unique
  on public.nutrition_day_variants_v2(version_id)
  where is_default;

create unique index nutrition_intake_entries_v2_idempotency_unique
  on public.nutrition_intake_entries(client_id, idempotency_key)
  where idempotency_key is not null;

create index nutrition_plans_v2_client_active_idx
  on public.nutrition_plans_v2(client_id, lifecycle_status, updated_at desc);
create index nutrition_plans_v2_coach_client_idx
  on public.nutrition_plans_v2(coach_id, client_id);
create index nutrition_plans_v2_org_client_idx
  on public.nutrition_plans_v2(org_id, client_id)
  where org_id is not null;
create index nutrition_plans_v2_team_client_idx
  on public.nutrition_plans_v2(team_id, client_id)
  where team_id is not null;

create index nutrition_plan_versions_v2_effective_idx
  on public.nutrition_plan_versions_v2(plan_id, status, effective_from desc, version_number desc);
create index nutrition_day_variants_v2_day_idx
  on public.nutrition_day_variants_v2(version_id, day_of_week, is_default, order_index);
create index nutrition_meal_slots_v2_variant_order_idx
  on public.nutrition_meal_slots_v2(day_variant_id, order_index);
create index nutrition_prescription_items_v2_slot_order_idx
  on public.nutrition_prescription_items_v2(meal_slot_id, order_index);
create index nutrition_prescription_items_v2_food_idx
  on public.nutrition_prescription_items_v2(food_id)
  where food_id is not null;
create index nutrition_prescription_items_v2_recipe_idx
  on public.nutrition_prescription_items_v2(recipe_id)
  where recipe_id is not null;
create index nutrition_day_snapshots_v2_version_date_idx
  on public.nutrition_day_snapshots_v2(version_id, local_date desc)
  where version_id is not null;
create index nutrition_v2_audit_log_client_time_idx
  on public.nutrition_v2_audit_log(client_id, occurred_at desc);
create index nutrition_v2_audit_log_version_time_idx
  on public.nutrition_v2_audit_log(version_id, occurred_at desc)
  where version_id is not null;

create index nutrition_intake_entries_v2_client_date_status_idx
  on public.nutrition_intake_entries(client_id, log_date desc, entry_status, created_at desc);
create index nutrition_intake_entries_v2_plan_version_idx
  on public.nutrition_intake_entries(plan_version_id, log_date desc)
  where plan_version_id is not null;
create index nutrition_intake_entries_v2_snapshot_idx
  on public.nutrition_intake_entries(day_snapshot_id, created_at)
  where day_snapshot_id is not null;
create index nutrition_intake_entries_v2_prescription_idx
  on public.nutrition_intake_entries(prescription_item_id)
  where prescription_item_id is not null;
create index nutrition_intake_entries_v2_correction_idx
  on public.nutrition_intake_entries(corrects_entry_id)
  where corrects_entry_id is not null;

create or replace function private.nutrition_v2_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger nutrition_plans_v2_set_updated_at
before update on public.nutrition_plans_v2
for each row execute function private.nutrition_v2_set_updated_at();

create trigger nutrition_plan_versions_v2_set_updated_at
before update on public.nutrition_plan_versions_v2
for each row execute function private.nutrition_v2_set_updated_at();

create trigger nutrition_day_variants_v2_set_updated_at
before update on public.nutrition_day_variants_v2
for each row execute function private.nutrition_v2_set_updated_at();

create trigger nutrition_meal_slots_v2_set_updated_at
before update on public.nutrition_meal_slots_v2
for each row execute function private.nutrition_v2_set_updated_at();

create trigger nutrition_prescription_items_v2_set_updated_at
before update on public.nutrition_prescription_items_v2
for each row execute function private.nutrition_v2_set_updated_at();

-- V1 rows have no idempotency key and retain their current direct-write behavior.
-- V2 rows must be written/corrected through the audited SECURITY DEFINER RPCs.
create or replace function private.nutrition_v2_guard_intake_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.idempotency_key is not null
       and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception 'nutrition_v2_intake_requires_rpc' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.idempotency_key is not null
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'nutrition_v2_intake_is_immutable' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger nutrition_intake_entries_v2_guard_insert
before insert on public.nutrition_intake_entries
for each row execute function private.nutrition_v2_guard_intake_mutation();

create trigger nutrition_intake_entries_v2_guard_update_delete
before update or delete on public.nutrition_intake_entries
for each row execute function private.nutrition_v2_guard_intake_mutation();

alter table public.nutrition_plans_v2 enable row level security;
alter table public.nutrition_plan_versions_v2 enable row level security;
alter table public.nutrition_day_variants_v2 enable row level security;
alter table public.nutrition_meal_slots_v2 enable row level security;
alter table public.nutrition_prescription_items_v2 enable row level security;
alter table public.nutrition_day_snapshots_v2 enable row level security;
alter table public.nutrition_v2_audit_log enable row level security;

revoke all on public.nutrition_plans_v2 from public, anon, authenticated;
revoke all on public.nutrition_plan_versions_v2 from public, anon, authenticated;
revoke all on public.nutrition_day_variants_v2 from public, anon, authenticated;
revoke all on public.nutrition_meal_slots_v2 from public, anon, authenticated;
revoke all on public.nutrition_prescription_items_v2 from public, anon, authenticated;
revoke all on public.nutrition_day_snapshots_v2 from public, anon, authenticated;
revoke all on public.nutrition_v2_audit_log from public, anon, authenticated;

revoke all on function private.nutrition_v2_set_updated_at() from public, anon, authenticated;
revoke all on function private.nutrition_v2_guard_intake_mutation() from public, anon, authenticated;

comment on table public.nutrition_plans_v2 is 'Logical Nutrition V2 plans. Legacy nutrition_plans remains intact.';
comment on table public.nutrition_plan_versions_v2 is 'Immutable-after-publish prescription versions for Nutrition V2.';
comment on table public.nutrition_day_snapshots_v2 is 'Immutable daily target/prescription snapshots used by canonical intake.';
comment on column public.nutrition_intake_entries.intake_source_v2 is 'Detailed V2 source; legacy source column remains populated with compatible values.';
comment on column public.nutrition_intake_entries.capture_method_v2 is 'Detailed V2 capture method; legacy capture_method remains populated with compatible values.';
