-- Patch de seguridad de get_coach_food_suggestions_v2 (auditoria adversarial 06-08):
--
-- 1) La rama coachTop NO aplicaba private.food_catalog_v2_can_read_food mientras
--    clientRecent y clientFavorites SI: food_catalog_v2_item_json es SECURITY DEFINER
--    y volcaba la fila completa de foods (incl. coachId/orgId) para cualquier food_id
--    presente en prescripciones propias, saltando la tenencia del catalogo.
-- 2) p_slot_name viajaba del cliente directo a un ILIKE: un patron LIKE arbitrario
--    ('%_%_%_...') es un vector de CPU. La semantica real siempre fue "misma franja",
--    asi que pasa a igualdad case-insensitive con tope de 120 chars.
--
-- Sin cambios de firma ni de shape del JSON: los callers (web picker) no se tocan.
-- Semantica Team del coachTop (pl.coach_id = auth.uid() ignora workspaces) queda
-- documentada como pendiente para la ola del picker mobile (W2) — cambiarla aqui
-- alteraria resultados de la web sin QA.
-- Validado en LIVE via tx-rollback con claims reales (coach jp): top_all=8 y
-- 'desayuno'=4 identicos pre/post; smoke aplicado registrado abajo.

create or replace function public.get_coach_food_suggestions_v2(
  p_client_id uuid default null,
  p_slot_name text default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $FN$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 24);
  -- Igualdad case-insensitive con tope de largo, NO ilike: el nombre de franja venia del
  -- cliente directo a un ILIKE (patron LIKE arbitrario = vector de CPU); la semantica real
  -- siempre fue "misma franja", nunca "patron".
  v_slot text := left(nullif(btrim(coalesce(p_slot_name, '')), ''), 120);
  v_coach_top jsonb;
  v_client_recent jsonb := '[]'::jsonb;
  v_client_favorites jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'nutrition_v2_food_suggestions_auth_required' using errcode = '42501';
  end if;

  -- Frecuentes del coach: lo que mas prescribe en sus planes V2 (opcionalmente por franja).
  -- can_read_food es OBLIGATORIO aqui igual que en las otras dos ramas: sin el, item_json
  -- (definer) volcaba la fila completa de foods saltando la tenencia del catalogo.
  select coalesce(jsonb_agg(item order by uses desc, last_used desc), '[]'::jsonb)
  into v_coach_top
  from (
    select
      private.food_catalog_v2_item_json(i.food_id)
        || jsonb_build_object('usageCount', count(*)::integer) as item,
      count(*) as uses,
      max(i.created_at) as last_used
    from public.nutrition_prescription_items_v2 i
    join public.nutrition_plan_versions_v2 v on v.id = i.version_id
    join public.nutrition_plans_v2 pl on pl.id = v.plan_id
    left join public.nutrition_meal_slots_v2 s on s.id = i.meal_slot_id
    where pl.coach_id = auth.uid()
      and i.food_id is not null
      and private.food_catalog_v2_can_read_food(i.food_id)
      and (v_slot is null or lower(s.name) = lower(v_slot))
    group by i.food_id
    order by uses desc, last_used desc
    limit v_limit
  ) top;

  if p_client_id is not null and private.nutrition_v2_can_read_client(p_client_id) then
    -- Recientes del alumno: ultimo consumo real por alimento (90 dias).
    select coalesce(jsonb_agg(item order by last_at desc), '[]'::jsonb)
    into v_client_recent
    from (
      select
        private.food_catalog_v2_item_json(e.food_id) as item,
        max(coalesce(e.occurred_at, e.created_at)) as last_at
      from public.nutrition_intake_entries e
      where e.client_id = p_client_id
        and e.food_id is not null
        and e.idempotency_key is not null
        and e.entry_status = 'active'
        and e.log_date >= current_date - 90
        and private.food_catalog_v2_can_read_food(e.food_id)
      group by e.food_id
      order by last_at desc
      limit v_limit
    ) recents;

    -- Favoritos declarados por el alumno.
    select coalesce(jsonb_agg(private.food_catalog_v2_item_json(p.food_id) order by p.created_at desc), '[]'::jsonb)
    into v_client_favorites
    from (
      select cfp.food_id, cfp.created_at
      from public.client_food_preferences cfp
      where cfp.client_id = p_client_id
        and cfp.preference_type = 'favorite'
        and private.food_catalog_v2_can_read_food(cfp.food_id)
      order by cfp.created_at desc
      limit v_limit
    ) p;
  end if;

  return jsonb_build_object(
    'schemaVersion', 1,
    'generatedAt', now(),
    'coachTop', coalesce(v_coach_top, '[]'::jsonb),
    'clientRecent', v_client_recent,
    'clientFavorites', v_client_favorites
  );
end;
$FN$;

-- Grants identicos a la version anterior (create or replace los conserva, se re-afirman
-- por claridad y por la regla del repo: RPC = revoke anon explicito).
revoke all on function public.get_coach_food_suggestions_v2(uuid, text, integer) from public, anon;
grant execute on function public.get_coach_food_suggestions_v2(uuid, text, integer) to authenticated;
