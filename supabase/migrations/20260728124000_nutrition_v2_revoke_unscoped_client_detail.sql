-- ============================================================================
-- EVA Nutricion V2 — NUT-030: cerrar la RPC de coach SIN scope de workspace
-- ----------------------------------------------------------------------------
-- Problema (auditoria 2026-07-28, verificacion G4B): 20260714211000 introdujo los
-- wrappers "scoped" y revoco de `authenticated` SOLO el hub
-- (20260714211000:264-266). `public.get_nutrition_client_detail_v2(uuid, date, text)`
-- quedo con su grant original de 20260714210500:400 y sigue siendo invocable directo.
-- La funcion no es una puerta de datos abierta (valida `can_manage_client`,
-- 20260714210500:354), pero se salta lo UNICO que agrega el wrapper: la validacion
-- `private.nutrition_v2_client_matches_workspace(...)` (20260714211000:237-255). Un coach
-- que pertenece a varios workspaces (standalone + team + org) puede leer la ficha
-- completa de un alumno que si administra saltandose el aislamiento de workspace.
--
-- Consumidores: CERO. `grep -rn "get_nutrition_client_detail_v2" apps packages` devuelve
-- solo dos COMENTARIOS (`apps/web/src/services/nutrition-v2-read.service.ts:133,210`,
-- ambos diciendo que la version unscoped ya no se usa) y ninguna llamada en apps/mobile.
--
-- El wrapper `get_nutrition_client_detail_scoped_v2` es SECURITY DEFINER
-- (20260714211000:234), asi que su llamada interna corre con los privilegios del owner:
-- revocar el grant externo NO lo rompe.
--
-- ADITIVA: un solo REVOKE de privilegio. Sin drops, sin cambios de cuerpo, sin RLS.
--
-- ANTES DE APLICAR: revisar `pg_stat_statements` en prod filtrando por
-- `get_nutrition_client_detail_v2` para confirmar 0 llamadas (el unico riesgo real es un
-- consumidor fuera del repo: n8n, script manual, query guardada en el SQL editor).
--
-- ROLLBACK (una pasada):
--   grant execute on function public.get_nutrition_client_detail_v2(uuid, date, text)
--     to authenticated;
-- ============================================================================

revoke all on function public.get_nutrition_client_detail_v2(uuid, date, text)
  from public, anon, authenticated;

comment on function public.get_nutrition_client_detail_v2(uuid, date, text) is
  'DEPRECADA para clientes: sin validacion de workspace. Solo se invoca desde '
  'public.get_nutrition_client_detail_scoped_v2 (SECURITY DEFINER). Revocada de '
  'authenticated en 20260728124000 — NUT-030.';
