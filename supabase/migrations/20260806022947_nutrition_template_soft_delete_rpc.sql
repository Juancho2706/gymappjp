-- Borrar plantillas NUNCA funciono via PostgREST: el soft-delete (UPDATE deleted_at) con
-- RETURNING/count exige que la fila NUEVA pase las policies de SELECT, y todas filtran
-- deleted_at IS NULL — la fila se auto-invisibiliza y Postgres corta con "new row violates
-- row-level security policy". Verificado en LIVE dos veces (QA owner 05-08, rondas 1 y 2,
-- incluso con { count: 'exact' } sin .select()). Un RPC definer es la salida limpia: la
-- autorizacion espeja las policies de UPDATE (own / team gestionado / org admin).
-- Aplicada en LIVE via MCP (version 20260806022947); smoke con claims reales del owner: true.

create or replace function public.soft_delete_nutrition_plan_template_v2(p_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.nutrition_plan_templates_v2 t
  set deleted_at = now()
  where t.id = p_id
    and t.deleted_at is null
    and (
      t.coach_id = (select auth.uid())
      or (t.team_id is not null and t.team_id in (select public.current_user_managed_team_ids()))
      or (t.org_id is not null and public.is_org_admin_member(t.org_id))
    )
  returning true;
$$;

revoke all on function public.soft_delete_nutrition_plan_template_v2(uuid) from public, anon;
grant execute on function public.soft_delete_nutrition_plan_template_v2(uuid) to authenticated;

comment on function public.soft_delete_nutrition_plan_template_v2(uuid) is
  'Soft-delete de plantillas de plan V2. Existe porque UPDATE deleted_at via PostgREST es imposible con RETURNING (las policies de SELECT excluyen filas borradas). Devuelve true si borro; null si la fila no existe, ya estaba borrada o el caller no es dueño/manager/admin.';
