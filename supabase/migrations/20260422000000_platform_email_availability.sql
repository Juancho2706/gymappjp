-- Global email availability for coach registration and client creation.
-- Callable only by service_role (PostgREST / server actions with service key).

create or replace function public.check_platform_email_availability(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_norm text := lower(trim(both from coalesce(p_email, '')));
  v_user_id uuid;
begin
  if v_norm = '' then
    return jsonb_build_object(
      'exists_in_auth', false,
      'is_coach', false,
      'is_client', false,
      'orphan_client_email', false
    );
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(trim(both from coalesce(u.email, ''))) = v_norm
  limit 1;

  if v_user_id is not null then
    return jsonb_build_object(
      'exists_in_auth', true,
      'is_coach', exists (select 1 from public.coaches c where c.id = v_user_id),
      'is_client', exists (select 1 from public.clients cl where cl.id = v_user_id),
      'orphan_client_email', false
    );
  end if;

  if exists (
    select 1 from public.clients cl
    where lower(trim(both from coalesce(cl.email, ''))) = v_norm
  ) then
    return jsonb_build_object(
      'exists_in_auth', false,
      'is_coach', false,
      'is_client', true,
      'orphan_client_email', true
    );
  end if;

  return jsonb_build_object(
    'exists_in_auth', false,
    'is_coach', false,
    'is_client', false,
    'orphan_client_email', false
  );
end;
$$;

comment on function public.check_platform_email_availability(text) is
  'Returns whether normalized email exists in auth.users and coach/client flags; orphan_client_email when clients.email matches without auth row.';

revoke all on function public.check_platform_email_availability(text) from public;
grant execute on function public.check_platform_email_availability(text) to service_role;

-- One student email per platform (normalized). Fails if duplicates exist — clean data first.
create unique index if not exists clients_email_norm_uidx
  on public.clients (lower(trim(both from email)));
