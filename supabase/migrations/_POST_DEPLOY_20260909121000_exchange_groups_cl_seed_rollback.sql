-- ============================================================================
-- ROLLBACK de _POST_DEPLOY_20260909121000. DOS RAMAS (R-01 + S-02).
--
-- LO QUE NO HACE:
--   · NO toca coaches.portion_system: nadie fue backfilleado (R14-bis).
--   · NO borra los grupos: FK on delete restrict (20260718140000:36) + NO ACTION
--     desde foods (20260611093001:80), y los planes publicados leen snapshots.
--   · NO borra exchange_group_foods: son filas inertes si el grupo no se ofrece.
--   · NO pone deleted_at si algun target o borrador ya usa un grupo chileno: eso
--     deja el borrador IMPOSIBLE DE PUBLICAR (resolveExchangeGroupsForDraft falla
--     cerrado con EXCHANGE_GROUP_NOT_FOUND) y sin forma de sacarlo del plan.
-- ============================================================================

do $$
declare
  v_targets int;
  v_drafts  int;
begin
  select count(*) into v_targets
  from public.nutrition_slot_exchange_targets_v2 t
  join public.exchange_groups g on g.id = t.exchange_group_id
  where g.portion_system = 'cl';

  select count(distinct v.id) into v_drafts
  from public.nutrition_plan_versions_v2 v
  join public.nutrition_slot_exchange_targets_v2 t on t.version_id = v.id
  join public.exchange_groups g on g.id = t.exchange_group_id
  where g.portion_system = 'cl' and v.status <> 'published';

  if v_targets > 0 or v_drafts > 0 then
    -- ── RAMA (b) ──────────────────────────────────────────────────────────────
    raise exception
      'rollback cl: hay % targets chilenos vivos en % borradores. NO se apaga el set: dejaria esos borradores impublicables (S-02). El rollback de este estado es de CODIGO: revertir deploy + OTAs.',
      v_targets, v_drafts;
  end if;

  -- ── RAMA (a): nadie los usa ⇒ volver al estado apagado de W0 ───────────────
  update public.exchange_groups
     set deleted_at = now(), updated_at = now()
   where is_system and portion_system = 'cl' and deleted_at is null;

  raise notice 'rollback cl OK: set apagado (13 grupos con deleted_at), 0 targets afectados, equivalencias y coaches intactos';
end $$;

-- ASSERT final: el SMAE sigue completo y nadie se movio de set.
do $$
begin
  if (select count(*) from public.exchange_groups
      where is_system and deleted_at is null and portion_system = 'smae') <> 9 then
    raise exception 'rollback cl: el set SMAE dejo de tener 9 grupos vivos';
  end if;
  if (select count(*) from public.exchange_groups
      where is_system and deleted_at is null and portion_system = 'cl') > 0 then
    raise exception 'rollback cl: quedaron grupos chilenos vivos';
  end if;
  raise notice 'rollback cl: 9 SMAE vivos, 0 cl vivos, coaches sin tocar';
end $$;

-- ── RE-ENCENDIDO (comentado; es el mismo update de W6.8, §0) ────────────────
-- update public.exchange_groups
--    set deleted_at = null, updated_at = now()
--  where is_system and portion_system = 'cl' and deleted_at is not null;
-- select count(*) from public.exchange_groups where is_system and deleted_at is null;  -- 22

-- Rollback de 20260909120500 y 20260909120000 (referencia; NO se ejecuta desde acá)
-- 20260909120500: reversible sin datos.
-- drop index if exists public.exchange_groups_system_code_uq;
--
-- 20260909120000: NO se droppean las columnas. Son NOT NULL DEFAULT, nadie mas
-- las lee, y `drop column` sobre `coaches` en LIVE es DDL destructiva (prohibida
-- por AGENTS.md). El rollback funcional es dejar de filtrar por ellas en el codigo.
