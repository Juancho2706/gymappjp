-- =============================================================================
-- Scoping de clients a service-role (plan estrategia 03, F2.1b — migracion hermana de F2.1).
-- Cierra el hueco #5: un coach mueve alumnos de scope por PATCH (las policies
-- clients_standalone_coach_manage y team_clients_member_all tienen WITH CHECK incompleto y dejan
-- reescribir team_id/org_id/coach_id). Solucion: revocar UPDATE a nivel tabla y re-grantear por
-- columna TODAS las columnas de perfil, dejando FUERA las 4 de scoping (id/org_id/team_id/coach_id).
--
-- Aditiva / idempotente / replay-safe (REVOKE/GRANT re-ejecutan limpio en el merge del branch).
-- INSERT/DELETE de clients NO cambian: el RLS ya los scopea y el INSERT necesita escribir
-- coach_id/org_id/team_id (los ata el alta legitima).
--
-- REGLA DE MANTENIMIENTO (OBLIGATORIA): toda columna NUEVA user-editable de public.clients exige
-- un GRANT UPDATE(<col>) en la MISMA migracion que la crea. Default-deny: columna sin grant ->
-- protegida (solo service-role la escribe).
--
-- ⚠️ NO APLICAR AHORA. Solo se ejecuta en el branch efimero del gate Movida (junto a F2.1).
--
-- PRERREQUISITO DURO (patron F1.1): el refactor F1.4 (escritores user-scoped de coach_id de
-- clients pasados a service-role: apps/enterprise/lib/org-admin.ts:172-173 reasignacion de alumno
-- por org admin, y app/org/[slug]/_actions/org.actions.ts:603-606 desasignacion) debe estar
-- DESPLEGADO en master/prod ANTES de mergear esta migracion. Si no, la reasignacion de alumnos por
-- org admin muere con 42501 al instante del merge_branch.
--
-- Va hermana (archivo separado, NO fusionada con F2.1): rollback y biseccion independientes si un
-- flujo de alumnos no auditado falla.
-- =============================================================================

-- Allowlist DERIVADA del schema vivo de public.clients (apps/web/src/lib/database.types.ts,
-- Tables<'clients'>['Row'], regenerado contra prod). Columnas actuales (21):
--   age_confirmed_at, birth_date, coach_id, created_at, email, force_password_change, full_name,
--   goal_weight_kg, id, is_active, is_archived, max_hr_override, onboarding_completed, org_id,
--   phone, ref_5k_time_sec, resting_hr, subscription_start_date, team_id, updated_at,
--   use_coach_brand_colors.
-- El allowlist = TODAS esas columnas MENOS las 4 de scoping: id, org_id, team_id, coach_id.
-- => 17 columnas grantadas. Si el schema vivo difiere al sellar, RE-DERIVAR la lista (no congelar).
REVOKE UPDATE ON public.clients FROM authenticated, anon;
GRANT UPDATE (
  age_confirmed_at,        -- mobile onboarding (apps/mobile/lib/alumno-onboarding.ts)
  birth_date,
  created_at,
  email,
  force_password_change,   -- apps/mobile/app/change-password.tsx
  full_name,
  goal_weight_kg,          -- services/client/client.service.ts
  is_active,
  is_archived,             -- archive de alumno (apps/mobile/lib/coach-client-detail.ts)
  max_hr_override,         -- perfil cardio (infrastructure/db/cardio-profile.repository.ts)
  onboarding_completed,    -- mobile onboarding
  phone,
  ref_5k_time_sec,
  resting_hr,
  subscription_start_date,
  updated_at,
  use_coach_brand_colors
) ON public.clients TO authenticated;
-- Quedan SOLO service-role: id, org_id, team_id, coach_id (las 4 columnas de scoping). La
-- reasignacion org/team de alumnos pasa por service-role con guard de membership (F1.4).
