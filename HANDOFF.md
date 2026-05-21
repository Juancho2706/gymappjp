# Enterprise Plan Handoff — 2026-05-21

## Estado del plan: Parte A completada, B-phases pendientes

---

## Lo que se hizo

### Parte A — Infraestructura E2E (COMPLETADA)

**Problema:** Dev server de Playwright usaba prod Supabase. Tests fallaban por auth o datos incorrectos.

**Fix 1 — `.env.e2e.local`** (CREADO, ya existe en repo):
- Fuerza Supabase local (`http://127.0.0.1:54321`) con JWT keys correctas
- Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `E2E_COACH_SLUG`, `E2E_CLIENT_EMAIL/PASSWORD`, `PERF_COACH_EMAIL/PASSWORD`

**Fix 2 — `playwright.config.ts`** (MODIFICADO):
- Carga `.env.e2e.local` con `override: true` ANTES de `.env.local`
- Agrega `webServer.env` que inyecta las vars al dev server spawneado por Playwright
- Resultado: dev server ya no lee `.env.local` con claves de prod

**Fix 3 — `supabase/seed.sql`** (MODIFICADO):
- Agrega `nutrition_plans` para `client-a1` (UUID `00000000-0000-0000-0006-000000000001`)
- Sin esto, `NutritionNoPlanFromServer` quedaba en loading state infinito en E2E

**Fix 4 — `tests/enterprise/journey-e2e.spec.ts`** (MODIFICADO):
- Locator `[data-testid="coach-row"], tr` → `text=Activos` (la página usa `div` rows, no `<tr>`)

**Resultado:** Suite pasó de 26 → 40 tests. 

### Tests aún fallando (documentados, no bloqueantes)

| Test | Falla | Causa |
|------|-------|-------|
| `sprint3-register-pricing.spec.ts` — "register multi-step" | Step no avanza tras fill | React 19 controlled inputs + Playwright: `fill()`, `pressSequentially()`, `evaluate(native setter + input event)` — todos fallan. El `onChange` del input no se dispara. |
| `tests/checkin-flow.spec.ts` | Botón Continuar disabled | Mismo problema: `weight` state no se actualiza vía Playwright |
| `tests/navigation-perf-smoke.spec.ts` — nutrition offline | `ERR_INTERNET_DISCONNECTED` en reload | `page.reload()` tras `context.setOffline(true)` falla en Next.js dev (RSC payload requiere network) |
| `tests/enterprise/invite-flow.spec.ts` | UI test pendiente | No investigado |

---

## Lo que FALTA (B-phases del plan)

### Fase B-1 — Schema: `organization_members.user_id` (NO HECHA)

Crear: `supabase/migrations/20260521000001_org_members_user_id.sql`

```sql
ALTER TABLE organization_members
  ADD COLUMN user_id uuid REFERENCES auth.users(id);

UPDATE organization_members SET user_id = coach_id WHERE coach_id IS NOT NULL;

ALTER TABLE organization_members ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE organization_members ALTER COLUMN coach_id DROP NOT NULL;

DROP INDEX IF EXISTS org_members_unique_active;
CREATE UNIQUE INDEX org_members_unique_active
  ON organization_members(user_id, org_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_org_members_coach_id 
  ON organization_members(coach_id) WHERE coach_id IS NOT NULL;

ALTER TABLE organization_members 
  ADD CONSTRAINT org_members_coach_role_requires_coach_id 
  CHECK (role != 'coach' OR coach_id IS NOT NULL);
```

Modificar `apps/web/src/infrastructure/db/org.repository.ts`:
- Línea 70: `.eq('coach_id', userId)` → `.eq('user_id', userId)`
- Tipo `OrgMember`: agregar `user_id: string`

Modificar `apps/web/src/app/org/[slug]/_actions/org.actions.ts` (múltiples lugares):
- Líneas 55, 104, 256, 336: `.eq('coach_id', user.id)` → `.eq('user_id', user.id)` (membership lookups del usuario actual)
- Líneas 289, 383, 414: esos son lookups de `targetCoach.id` → **mantener `coach_id`** (buscan un coach específico, no el usuario actual)
- Línea 470: INSERT `coach_id: user.id` → agregar también `user_id: user.id`
- Línea 194-199 (createEnterpriseCoach): INSERT → agregar `user_id: authData.user.id`
- Línea 296-302 (inviteCoach): INSERT → agregar `user_id: targetCoach.id`

### Fase B-2 — JWT Hook (NO HECHA)

Crear: `supabase/migrations/20260521000002_auth_hook_org_users.sql`

El hook actual (20260517130012) solo maneja coaches. Debe agregar path para org-only users:
- Si `NOT is_coach`: busca en `organization_members WHERE user_id = uid AND coach_id IS NULL AND role IN ('org_owner','org_admin')`
- Si encuentra: agrega `org_id`, `org_role`, `is_org_user: true` al JWT
- El join interno del coach path también debe cambiar: `om.coach_id = uid` → `om.user_id = uid`

Ver plan completo en `C:\Users\juanm\.claude\plans\como-veras-se-hizo-crystalline-sunbeam.md` sección FASE 2.

Modificar `apps/web/src/lib/coach-context.ts`:
- Agregar tipo `OrgUserContext`
- `getCoachOrgContext()` debe leer `is_org_user` del JWT y retornar sin buscar en `coaches` table

Modificar `apps/web/src/lib/auth/post-login-redirect.ts`:
- Antes del check `isCoach`: si `profile.isOrgUser && profile.activeOrgSlug` → redirect `/org/${slug}`

### Fase B-3 — RLS Policies (NO HECHA)

Crear: `supabase/migrations/20260521000003_rls_user_id.sql`

Patrón: en TODAS las policies enterprise, cambiar `om.coach_id = auth.uid()` → `om.user_id = auth.uid()`.

Tablas afectadas: `organizations`, `organization_members`, `organization_invites`, `coach_client_assignments`, `clients` (org_admin_see_pool + org_coach_see_assigned), `org_audit_logs`, `org_invoices`, `payment_exceptions`.

También actualizar la función SECURITY DEFINER `is_active_org_member()` (migration 20260517150000):
```sql
-- Cambiar coach_id = auth.uid() → user_id = auth.uid()
```

### Fase B-4 — Enterprise Login (NO HECHA)

Crear:
- `apps/web/src/app/org/login/page.tsx` — form login para org-only users
- `apps/web/src/app/org/login/actions.ts` — server action con `supabase.auth.signInWithPassword`

El middleware ya hace rewrite de `enterprise.eva-app.cl/login` → `/org/login`. No tocar middleware.

### Fase B-5 — Feature Flags sidebar (NO HECHA)

Modificar `apps/web/src/components/coach/CoachSidebar.tsx`:
- Agregar `isOrgManaged: boolean` prop (derivado de `coach.subscription_status === 'org_managed'`)
- Condicionar billing/branding sections

Agregar redirect guard en `/coach/subscription` y `/coach/settings/branding` para coaches `org_managed`.

### Fase B-6 — Seed org-only user + tests (NO HECHA)

Crear script `supabase/seed-org-users.ts` (tsx) que usa service role para crear auth user sin fila en `coaches`.

Crear test files:
- `tests/enterprise/org-user-auth.spec.ts`
- `tests/enterprise/org-user-permissions.spec.ts`
- `tests/enterprise/enterprise-coach-flags.spec.ts`

---

## Orden de ejecución recomendado

```
B-1 → npx supabase db reset → npm run typecheck -w @eva/web
B-2 → npx supabase db reset → npm run typecheck
B-3 → npx supabase db reset → npm run typecheck
npx supabase gen types typescript --local > apps/web/src/lib/database.types.ts
B-4 → typecheck + npm run build -w @eva/web
B-5 → typecheck
Parte A-bis → npx playwright test (verificar no regresiones)
B-6 → npx supabase db reset → npx playwright test tests/enterprise/
```

---

## Archivos clave — estado actual

| Archivo | Estado |
|---------|--------|
| `.env.e2e.local` | ✅ Creado |
| `playwright.config.ts` | ✅ Modificado (env override + webServer.env) |
| `supabase/seed.sql` | ✅ Modificado (nutrition_plan para client-a1) |
| `tests/enterprise/journey-e2e.spec.ts` | ✅ Modificado (locator fix) |
| `supabase/migrations/20260521000001_org_members_user_id.sql` | ❌ Falta crear |
| `supabase/migrations/20260521000002_auth_hook_org_users.sql` | ❌ Falta crear |
| `supabase/migrations/20260521000003_rls_user_id.sql` | ❌ Falta crear |
| `apps/web/src/infrastructure/db/org.repository.ts` | ❌ Falta modificar (línea 70) |
| `apps/web/src/app/org/[slug]/_actions/org.actions.ts` | ❌ Falta modificar (múltiples líneas) |
| `apps/web/src/lib/coach-context.ts` | ❌ Falta modificar |
| `apps/web/src/lib/auth/post-login-redirect.ts` | ❌ Falta modificar |
| `apps/web/src/app/org/login/page.tsx` | ❌ Falta crear |
| `apps/web/src/app/org/login/actions.ts` | ❌ Falta crear |
| `apps/web/src/components/coach/CoachSidebar.tsx` | ❌ Falta modificar |
| `tests/enterprise/org-user-auth.spec.ts` | ❌ Falta crear |
| `tests/enterprise/enterprise-coach-flags.spec.ts` | ❌ Falta crear |

## Referencias

- Plan completo: `C:\Users\juanm\.claude\plans\como-veras-se-hizo-crystalline-sunbeam.md`
- Reglas de trabajo: `apps/web/CURRENT_PHASE.md`
- Seed actual: `supabase/seed.sql`
- Auth hook actual: `supabase/migrations/20260517130012_enterprise_auth_hook.sql`
- RLS actual: `supabase/migrations/20260517130011_enterprise_rls.sql` + `20260517150000_fix_rls_recursion.sql`
