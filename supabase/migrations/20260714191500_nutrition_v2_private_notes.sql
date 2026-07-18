-- Keep professional-only notes outside rows readable by students.

create table public.nutrition_plan_private_notes_v2 (
  version_id uuid primary key references public.nutrition_plan_versions_v2(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  note text not null default '',
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nutrition_plan_private_notes_v2_client_idx
  on public.nutrition_plan_private_notes_v2(client_id, updated_at desc);

create or replace function private.nutrition_v2_private_note_scope_matches(
  p_version_id uuid,
  p_client_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nutrition_plan_versions_v2 v
    join public.nutrition_plans_v2 p on p.id = v.plan_id
    where v.id = p_version_id
      and p.client_id = p_client_id
      and private.nutrition_v2_can_manage_client(p.client_id)
  );
$$;

create trigger nutrition_plan_private_notes_v2_set_updated_at
before update on public.nutrition_plan_private_notes_v2
for each row execute function private.nutrition_v2_set_updated_at();

alter table public.nutrition_plan_private_notes_v2 enable row level security;

create policy nutrition_plan_private_notes_v2_select
on public.nutrition_plan_private_notes_v2
for select
to authenticated
using (
  private.nutrition_v2_private_note_scope_matches(version_id, client_id)
);

create policy nutrition_plan_private_notes_v2_insert
on public.nutrition_plan_private_notes_v2
for insert
to authenticated
with check (
  private.nutrition_v2_private_note_scope_matches(version_id, client_id)
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy nutrition_plan_private_notes_v2_update
on public.nutrition_plan_private_notes_v2
for update
to authenticated
using (
  private.nutrition_v2_private_note_scope_matches(version_id, client_id)
)
with check (
  private.nutrition_v2_private_note_scope_matches(version_id, client_id)
  and updated_by = auth.uid()
);

revoke all on public.nutrition_plan_private_notes_v2 from public, anon, authenticated;
grant select, insert, update on public.nutrition_plan_private_notes_v2 to authenticated;

-- Do not expose the deprecated same-row private_notes column to authenticated
-- clients. New V2 queries must select explicit safe columns.
revoke select, update on public.nutrition_plan_versions_v2 from authenticated;

grant select (
  id,
  plan_id,
  version_number,
  status,
  strategy,
  effective_from,
  effective_to,
  timezone,
  student_permissions,
  visible_notes,
  protocol_notes,
  parent_version_id,
  published_at,
  published_by,
  publish_idempotency_key,
  lock_version,
  created_by,
  updated_by,
  created_at,
  updated_at
) on public.nutrition_plan_versions_v2 to authenticated;

grant update (
  strategy,
  effective_from,
  effective_to,
  timezone,
  student_permissions,
  visible_notes,
  protocol_notes,
  parent_version_id,
  updated_by,
  lock_version
) on public.nutrition_plan_versions_v2 to authenticated;

create or replace function private.nutrition_v2_guard_version_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if new.id is distinct from old.id
      or new.plan_id is distinct from old.plan_id
      or new.version_number is distinct from old.version_number
      or new.created_by is distinct from old.created_by
      or new.status is distinct from old.status
      or new.published_at is distinct from old.published_at
      or new.published_by is distinct from old.published_by
      or new.publish_idempotency_key is distinct from old.publish_idempotency_key
      or new.private_notes is not null then
      raise exception 'nutrition_v2_version_publication_requires_rpc' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.nutrition_v2_private_note_scope_matches(uuid, uuid) from public, anon;
grant execute on function private.nutrition_v2_private_note_scope_matches(uuid, uuid) to authenticated;
revoke all on function private.nutrition_v2_guard_version_identity() from public, anon, authenticated;

comment on table public.nutrition_plan_private_notes_v2 is 'Professional-only notes isolated from student-readable plan version rows.';
comment on column public.nutrition_plan_versions_v2.private_notes is 'Deprecated before rollout; authenticated roles cannot select it. Use nutrition_plan_private_notes_v2.';
