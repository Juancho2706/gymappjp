-- SECURITY FIX: check_ins tenía una policy SELECT con qual=true para rol
-- `authenticated`, permitiendo que CUALQUIER usuario logueado leyera TODOS los
-- check-ins de la plataforma (fotos de progreso, peso, notas — datos de salud
-- sensibles Ley 19.628 / 21.719). PERMISSIVE policies se evalúan con OR, así que
-- esta anulaba el aislamiento de las demás.
--
-- Tras este fix, check_ins queda con acceso scoped:
--   - check_ins_client : el alumno gestiona los suyos (client_id = auth.uid())
--   - check_ins_coach  : el coach dueño del alumno (clients.coach_id = auth.uid())
--
-- Nota enterprise: org_admin (member sin coach_id) NO ve check-ins individuales
-- por diseño de privacidad. Si a futuro se necesita, agregar policy explícita
-- con is_org_admin_member(org_id) vía join a clients.

-- 1. EL LEAK — eliminar
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.check_ins;

-- 2. Duplicados redundantes (cubiertos por check_ins_client / check_ins_coach)
DROP POLICY IF EXISTS "Client can manage their own check-ins" ON public.check_ins;
DROP POLICY IF EXISTS "client_manage_checkins" ON public.check_ins;
DROP POLICY IF EXISTS "Coach can view their clients' check-ins" ON public.check_ins;
DROP POLICY IF EXISTS "coaches_read_checkins" ON public.check_ins;

-- Canonical policies (check_ins_client, check_ins_coach) ya existen de
-- migración previa. No se recrean para evitar duplicar.
