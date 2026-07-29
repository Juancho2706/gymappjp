-- ============================================================================
-- PENDIENTE DE AUDITORIA — NO ES UNA MIGRACION. NO SE APLICA SOLO.
-- El prefijo `_PENDING_AUDIT_` lo excluye del orden de migraciones (mismo patron que
-- _PENDING_AUDIT_nutrition_v2_prescribed_intent_once.sql y
-- _PENDING_AUDIT_nutrition_v2_single_active_plan_root.sql).
--
-- NUT-010 — Backfill de los correctores de contribucion CERO historicos
-- ----------------------------------------------------------------------------
-- CONTEXTO
-- Hasta 20260728130500, "Retirar registro" se modelaba como una CORRECCION de contribucion
-- cero: el original quedaba `corrected` y nacia un reemplazo ACTIVO con los 5 macros en 0
-- que HEREDABA `prescription_item_id`. Desde esa migracion el retiro es terminal
-- (`entry_status = 'voided'`, sin insertar nada), pero los correctores YA ESCRITOS en
-- produccion siguen activos y siguen produciendo los sintomas del hallazgo sobre los dias
-- historicos:
--   · el item prescrito sigue contando como "consumido" (sin boton "Lo comi");
--   · el medidor de la franja sigue "completo";
--   · la cobertura de porciones DERIVADA no bajo con el retiro;
--   · `entryCount` sigue inflado para el coach.
--
-- DECISION REQUERIDA DEL OWNER (no es una decision de ingenieria)
-- Marcar esos correctores como `voided` CAMBIA RETROACTIVAMENTE numeros de dias CERRADOS:
-- `private.nutrition_v2_intake_totals` cuenta `entry_status = 'active'`, y los read models
-- de historial (20260714210500, 20260716210000, 20260716230000) y
-- `computeNutritionAdherence` se apoyan en el. Los graficos del coach se van a mover hacia
-- atras. Hay que ANUNCIARLO antes de correrlo.
--   Opcion 1 — Correr el backfill: el historial pasa a reflejar la semantica correcta
--              ("lo retirado no existe"). Los macros del dia NO cambian (el corrector
--              aportaba 0), pero SI cambian `entryCount`, la cobertura derivada y la
--              adherencia por item.
--   Opcion 2 — No correrlo: la deuda persiste SOLO para los dias historicos; todo lo
--              nuevo ya nace correcto. Decision explicita, no olvido.
--
-- SIN GO EXPLICITO DEL OWNER, NO SE EJECUTA NADA DE ESTE ARCHIVO.
-- ============================================================================

-- ── PASO 1 — DRY RUN (solo lectura, seguro de correr cuando sea) ─────────────
-- Cuantos correctores de retiro hay, sobre cuantos alumnos y en que ventana de fechas.
-- El criterio de identificacion es CONSERVADOR y exige las TRES condiciones a la vez:
--   (a) es un corrector (`corrects_entry_id is not null`);
--   (b) su original quedo `corrected` por EL (cadena consistente);
--   (c) sus 5 macros congelados son 0 o nulos.
-- (c) por si sola confundiria una correccion legitima a 0 kcal (agua, edulcorante) con un
-- retiro; por eso NO se usa sola. Se reporta aparte cuantas filas traen ademas la nota
-- 'Registro retirado', que era la que escribian buildVoidPayload / buildVoidIntakeCorrection.
with candidates as (
  select
    e.id,
    e.client_id,
    e.log_date,
    e.prescription_item_id,
    e.note,
    e.unit,
    e.quantity,
    e.food_id
  from public.nutrition_intake_entries e
  join public.nutrition_intake_entries orig
    on orig.id = e.corrects_entry_id
   and orig.corrected_by_entry_id = e.id
   and orig.entry_status = 'corrected'
  where e.idempotency_key is not null
    and e.entry_status = 'active'
    and e.corrects_entry_id is not null
    and coalesce(e.snapshot_calories, 0) = 0
    and coalesce(e.snapshot_protein_g, 0) = 0
    and coalesce(e.snapshot_carbs_g, 0) = 0
    and coalesce(e.snapshot_fats_g, 0) = 0
    and coalesce(e.snapshot_fiber_g, 0) = 0
)
select
  count(*)                                                        as correctores_cero,
  count(*) filter (where note = 'Registro retirado')               as con_nota_de_retiro,
  count(distinct client_id)                                        as alumnos_afectados,
  count(*) filter (where prescription_item_id is not null)         as ligados_a_item_prescrito,
  count(*) filter (where lower(unit) in ('g', 'ml') and food_id is not null)
                                                                   as posibles_cobertura_derivada,
  min(log_date)                                                    as desde,
  max(log_date)                                                    as hasta
from candidates;

-- Muestra de 25 filas para revisar a ojo antes de decidir.
-- select id, client_id, log_date, note, quantity, unit, prescription_item_id
-- from candidates order by log_date desc limit 25;

-- ── PASO 2 — ENSAYO EN TRANSACCION ABORTADA (NO deja rastro) ─────────────────
-- Corre esto ANTES del paso 3 y compara el conteo de filas afectadas con el dry-run.
-- begin;
--   update public.nutrition_intake_entries e
--   set entry_status = 'voided',
--       updated_at = now()
--   from public.nutrition_intake_entries orig
--   where orig.id = e.corrects_entry_id
--     and orig.corrected_by_entry_id = e.id
--     and orig.entry_status = 'corrected'
--     and e.idempotency_key is not null
--     and e.entry_status = 'active'
--     and e.corrects_entry_id is not null
--     and coalesce(e.snapshot_calories, 0) = 0
--     and coalesce(e.snapshot_protein_g, 0) = 0
--     and coalesce(e.snapshot_carbs_g, 0) = 0
--     and coalesce(e.snapshot_fats_g, 0) = 0
--     and coalesce(e.snapshot_fiber_g, 0) = 0;
--   -- Revisar el row count aqui y contra el dry-run.
-- rollback;

-- ── PASO 3 — EJECUCION REAL (solo con GO explicito del owner) ────────────────
-- OJO: el trigger `private.nutrition_v2_guard_intake_mutation` (20260714190000:334-367)
-- hace INMUTABLES las filas V2 para cualquier rol que no sea postgres/service_role/
-- supabase_admin. Este UPDATE hay que correrlo con un rol privilegiado (psql como
-- `postgres`), no desde la app.
-- Requisitos previos: snapshot de la base + anuncio de que los graficos historicos del
-- coach se mueven + ventana de baja actividad.
--
-- begin;
--   <mismo UPDATE del paso 2>
--   -- Rastro de auditoria del propio backfill (una fila por entry tocada):
--   insert into public.nutrition_v2_audit_log (
--     client_id, intake_entry_id, actor_user_id, actor_role, action, entity_type, entity_id,
--     idempotency_key, metadata
--   )
--   select e.client_id, e.id, null, 'system', 'intake.voided', 'nutrition_intake_entry', e.id,
--          'backfill-void-' || e.id::text,
--          jsonb_build_object('reason', 'Backfill NUT-010: corrector de contribucion cero')
--   from public.nutrition_intake_entries e
--   where e.entry_status = 'voided'
--     and e.corrects_entry_id is not null
--     and e.updated_at >= now() - interval '5 minutes';
-- commit;
--
-- ROLLBACK del backfill (si hiciera falta): las filas afectadas son exactamente las que
-- quedaron `voided` con `corrects_entry_id is not null`; volverlas a `active` restaura el
-- estado previo (los macros nunca se tocaron).
