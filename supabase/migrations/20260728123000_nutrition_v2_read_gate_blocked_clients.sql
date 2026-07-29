-- ============================================================================
-- EVA Nutricion V2 — NUT-029: espejo de LECTURA del candado de alumno bloqueado
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G4B): la API mobile SI corta al alumno
-- archivado/pausado (`apps/web/src/app/api/mobile/nutrition-v2/_shared.ts:99-106` con
-- `isBlockedClientRow`, `apps/web/src/lib/mobile-auth.ts:80-85`) y el proxy web tambien
-- (`apps/web/src/proxy.ts:1006-1010`), pero la DB no: `private.nutrition_v2_can_read_client`
-- (20260714190500:69-78) es `auth.uid() = p_client_id or can_manage_client(...)`, sin
-- ninguna referencia a `clients.is_archived` / `clients.is_active`. Ese helper es el UNICO
-- guard de lectura de todas las RPC V2 del alumno (get_nutrition_today_v2,
-- get_nutrition_plan_read_v2, get_nutrition_history_page_v2) y de las policies SELECT de
-- planes/versiones/snapshots. Archivar o pausar NO revoca la sesion del alumno
-- (`clients.actions.ts:450,579` solo hacen update de is_archived), asi que su JWT sigue
-- vivo y puede hablar PostgREST/RPC directo con la anon key.
--
-- Asimetria que cierra este fix: el repo YA cerro el lado de ESCRITURA en
-- 20260719190000 (`private.student_write_allowed` con
-- `cl.is_archived is not true and cl.is_active is not false`) y dejo el lado de lectura
-- abierto. Esto es el espejo exacto.
--
-- La rama `can_manage_client` queda INTACTA a proposito: el coach DEBE seguir viendo a
-- sus alumnos archivados (contrato explicito en `mobile-auth.ts:71-79` y en el comentario
-- de `_shared.ts:99-100`).
--
-- ADITIVA: `create or replace` con la MISMA firma => no se pierden grants ni hace falta
-- recrear policies. Sin DDL de tablas.
--
-- ANTES DE APLICAR (verificacion de producto, no de codigo): confirmar con el owner que
-- "alumno archivado / pausado" pierde tambien la LECTURA. Es la politica de facto que ya
-- aplica la API mobile hoy, y es distinta de la politica del coach moroso (que deja al
-- alumno en SOLO-LECTURA, 20260718120000:10-12) — esa se mantiene sin cambios.
--
-- RENDIMIENTO: `can_read_client` es hot path. El `exists` agregado es un index scan por
-- PK sobre `public.clients`. Medir con EXPLAIN (ANALYZE) en una copia antes de LIVE.
--
-- ROLLBACK (una pasada): re-aplicar 20260714190500:69-78.
-- ============================================================================

create or replace function private.nutrition_v2_can_read_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    (
      auth.uid() = p_client_id
      and exists (
        select 1
        from public.clients c
        where c.id = p_client_id
          and c.is_archived is not true
          and c.is_active is not false
      )
    )
    or private.nutrition_v2_can_manage_client(p_client_id);
$fn$;

revoke all on function private.nutrition_v2_can_read_client(uuid) from public, anon;
grant execute on function private.nutrition_v2_can_read_client(uuid) to authenticated;

comment on function private.nutrition_v2_can_read_client(uuid) is
  'Guard de lectura de Nutricion V2. El alumno solo se lee a si mismo si su ficha NO esta '
  'archivada ni pausada (espejo de private.student_write_allowed, 20260719190000). El coach '
  'que administra al alumno conserva la lectura aunque este archivado. NUT-029.';
