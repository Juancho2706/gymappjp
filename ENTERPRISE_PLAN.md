# EVA Enterprise Architecture Plan
**Rama:** `v2/enterprise` · **Fecha:** 2026-05-21 · **Status:** PLAN — pendiente aprobación

---

## Contexto y motivación

La arquitectura actual fusiona dos conceptos distintos en uno: el *coach enterprise* (quien entrena alumnos) y el *dueño/admin de la organización* (quien gestiona el gym). `organization_members.coach_id NOT NULL → coaches(id)` fuerza que todo admin sea coach. Esto es arquitecturalmente incorrecto:

- "Juanito" dueño de CrossFit Norte no es coach. No entrena alumnos, no tiene slug, no tiene billing propio.
- Los coaches del gym SÍ son coaches. Usan EVA Coach app normal con `subscription_status='org_managed'`.
- Hoy si Juanito quiere ver el dashboard de su gym, necesita una cuenta de coach — con sidebar de planificación que no le sirve.

**Solución**: separar identidades. `organization_members` acepta cualquier `auth.user`, no solo coaches. Juanito se crea una cuenta en `enterprise.eva-app.cl` (dominio ya rewired en middleware). El JWT hook la detecta como org-only user. El post-login redirect la lleva a `/org/[slug]`. Los coaches del gym no cambian — siguen entrando por `eva-app.cl`.

---

## Parte A — E2E Pendiente (ejecutar PRIMERO)

### Estado actual post-commit `27e954e`

Los siguientes fixes YA están commiteados pero NO verificados con Supabase local corriendo:

| Test | Fix en `27e954e` | Estado |
|------|-----------------|--------|
| `sprint3-register-pricing.spec.ts` — selector ambiguo `getByLabel('Email')` | ✅ cambiado a `input[name="email"]` | Sin verificar |
| `journey-e2e.spec.ts` — espera `/coach/dashboard` pero llega a `/org/slug` | ✅ regex `/\/(coach\/dashboard|org\/)/` | Sin verificar |
| `invite-flow.spec.ts` — endpoint Inbucket `/api/v1/status` | ✅ → `/api/v1/messages` | Sin verificar |
| `invite-flow.spec.ts` — `coach-standalone@eva-test.cl` no existe | ✅ → `coach-solo@eva-test.cl` | Sin verificar |
| `navigation-perf-smoke.spec.ts` — enterprise coach redirige a org | ✅ acepta regex | Sin verificar |
| Todos los clientes E2E — caen en `/onboarding` | ✅ `onboarding_completed=true` en seed | Sin verificar |

### Tests aún pendientes de seed/fixtures

Estos NO se fixearon en `27e954e` y requieren trabajo adicional:

**`tests/nutrition-student-smoke.spec.ts`** y **`tests/checkin-flow.spec.ts`**:
- `client-a1@eva-test.cl` necesita: `force_password_change=false` ✅, `onboarding_completed=true` ✅ (ya en seed), **plan nutricional activo asignado** ❌
- Agregar en seed: `nutrition_plans` + `nutrition_plan_assignments` para `client-a1`

**`tests/workout-flow.spec.ts`**:
- Necesita `E2E_WORKOUT_PLAN_ID` — un `workout_plans.id` real del seed
- Agregar en seed: `workout_programs` + `workout_plans` + `workout_plan_blocks` para `client-a1`
- El ID se expone via env var `E2E_WORKOUT_PLAN_ID` en `.env.local`

### Comando de verificación A

```bash
# 1. Reset con seed actualizado
npx supabase db reset

# 2. Dev server (terminal separada)
npm run dev

# 3. E2E suite completa
npx playwright test --reporter=list

# Variables de entorno requeridas en .env.local:
# E2E_COACH_SLUG=coach-a1-test
# E2E_CLIENT_EMAIL=client-a1@eva-test.cl
# E2E_CLIENT_PASSWORD=TestPass123!
# E2E_WORKOUT_PLAN_ID=<uuid del plan seed>
# PERF_COACH_EMAIL=coach-solo@eva-test.cl      ← standalone, NO enterprise
# PERF_COACH_PASSWORD=TestPass123!
```

---

## Parte B — Enterprise Architecture Refactor

### Perspectiva: Software Architect

**Decisión central:** `organization_members.user_id uuid NOT NULL REFERENCES auth.users(id)` reemplaza `coach_id` como columna de identidad primaria. `coach_id` se vuelve nullable (solo setea cuando el miembro ES un coach).

Ventajas:
- Una sola tabla para toda membresía (coaches y org-only admins)
- JWT hook usa la misma columna para todos los tipos de usuario
- RLS policies unificadas (`user_id = auth.uid()`)
- Retrocompatible: para coaches existentes `user_id = coach_id = auth.uid()` (mismo UUID)

```
auth.users
    │
    ├── coaches (id = auth.uid())  ← EVA Coach users
    │       └── organization_members.coach_id (nullable FK)
    │
    └── org-only users (auth.uid() sin fila en coaches)
            └── organization_members.user_id (NOT NULL FK)
                   role ∈ { org_owner, org_admin }   ← nunca 'coach' sin coach_id
```

**Invariante:** si `coach_id IS NULL` → `role ∈ ('org_owner', 'org_admin')`. Un miembro con rol `'coach'` DEBE tener `coach_id`.

---

### Perspectiva: Backend Engineer

#### Fase B-1: Schema migration

**`supabase/migrations/20260521000001_org_members_user_id.sql`**

```sql
-- Paso 1: agregar user_id
ALTER TABLE organization_members
  ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- Paso 2: backfill (coaches.id = auth.uid(), misma UUID)
UPDATE organization_members SET user_id = coach_id;

-- Paso 3: NOT NULL constraint
ALTER TABLE organization_members
  ALTER COLUMN user_id SET NOT NULL;

-- Paso 4: coach_id nullable
ALTER TABLE organization_members
  ALTER COLUMN coach_id DROP NOT NULL;

-- Paso 5: reemplazar unique index
DROP INDEX IF EXISTS org_members_unique_active;
CREATE UNIQUE INDEX org_members_unique_active
  ON organization_members(user_id, org_id)
  WHERE deleted_at IS NULL;

-- Paso 6: índice secundario para joins a coaches table
CREATE INDEX IF NOT EXISTS idx_org_members_coach_id
  ON organization_members(coach_id)
  WHERE coach_id IS NOT NULL;

-- Paso 7: constraint — si role='coach' entonces coach_id NOT NULL
ALTER TABLE organization_members
  ADD CONSTRAINT org_members_coach_role_requires_coach_id
  CHECK (
    role != 'coach' OR coach_id IS NOT NULL
  );
```

**Archivos de código afectados:**

| Archivo | Cambio |
|---------|--------|
| `apps/web/src/infrastructure/db/org.repository.ts` | `findOrgBySlug`: `.eq('coach_id', userId)` → `.eq('user_id', userId)` |
| `apps/web/src/infrastructure/db/org.repository.ts` | `OrgMember` type: `user_id` en lugar de `coach_id` como campo principal |
| `apps/web/src/app/org/[slug]/_actions/org.actions.ts` | `inviteCoachAction`: insert usa `user_id` + `coach_id` |
| `apps/web/src/app/org/[slug]/_actions/org.actions.ts` | `createEnterpriseCoachAction`: igual |
| `apps/web/src/lib/coach-context.ts` | Fallback DB query: `.eq('coach_id', coach.id)` → `.eq('user_id', coach.id)` |

#### Fase B-2: JWT Hook — soporte org-only users

**`supabase/migrations/20260521000002_auth_hook_org_users.sql`**

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  uid       uuid := (event->>'user_id')::uuid;
  is_coach  boolean;
  org_rec   record;
  claims    jsonb;
BEGIN
  claims := event->'claims';

  SELECT EXISTS(SELECT 1 FROM coaches WHERE id = uid) INTO is_coach;

  IF is_coach THEN
    -- Path coach: igual que antes, solo cambia user_id en WHERE
    claims := jsonb_set(claims, '{coach_id}', to_jsonb(uid));
    SELECT om.org_id, om.role INTO org_rec
    FROM organization_members om
    WHERE om.user_id = uid        -- ← antes: coach_id
      AND om.org_id = COALESCE(
        (SELECT active_org_id FROM coaches WHERE id = uid),
        (SELECT org_id FROM organization_members
          WHERE user_id = uid AND status='active' AND deleted_at IS NULL
          ORDER BY joined_at DESC NULLS LAST LIMIT 1)
      )
      AND om.status = 'active' AND om.deleted_at IS NULL
    LIMIT 1;

    IF org_rec.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}', to_jsonb(org_rec.org_id));
      claims := jsonb_set(claims, '{org_role}', to_jsonb(org_rec.role));
    END IF;

  ELSE
    -- Path org-only user: sin fila en coaches
    SELECT om.org_id, om.role INTO org_rec
    FROM organization_members om
    WHERE om.user_id = uid
      AND om.coach_id IS NULL               -- org-only: no tiene coach row
      AND om.status = 'active'
      AND om.deleted_at IS NULL
      AND om.role IN ('org_owner', 'org_admin')
    ORDER BY om.joined_at DESC NULLS LAST
    LIMIT 1;

    IF org_rec.org_id IS NOT NULL THEN
      claims := jsonb_set(claims, '{org_id}', to_jsonb(org_rec.org_id));
      claims := jsonb_set(claims, '{org_role}', to_jsonb(org_rec.role));
      claims := jsonb_set(claims, '{is_org_user}', 'true'::jsonb);
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

**`apps/web/src/lib/coach-context.ts`**: agregar `isOrgUser: boolean` al tipo y leer claim `is_org_user`.

**`apps/web/src/lib/auth/post-login-redirect.ts`**: `isOrgUser` redirige a `/org/[slug]` sin requerir `isCoach`.

#### Fase B-3: RLS policies — usar `user_id`

**`supabase/migrations/20260521000003_rls_user_id.sql`**

Reemplazar todos los `om.coach_id = auth.uid()` por `om.user_id = auth.uid()` en:
- `organizations` — `org_members_see_own_org`
- `organization_members` — `org_members_see_peers`
- `organization_invites` — `org_admin_see_invites`
- `coach_client_assignments` — `org_admin_see_assignments`
- `clients` — `org_admin_see_pool`, `org_coach_see_assigned`
- `org_audit_logs` — `org_members_insert_audit`, `org_admin_read_audit`
- `org_invoices` — `org_admin_see_own_invoices`
- `payment_exceptions` — `org_admin_see_exceptions`

**Función `is_active_org_member()`** (SECURITY DEFINER en migration `20260517150000`): también actualizar a `user_id`.

**CRÍTICO:** `org_coach_see_assigned` tiene un JOIN `organization_members om ON om.coach_id = cca.coach_id` — este join PERMANECE por `coach_id` porque `coach_client_assignments.coach_id` sigue apuntando al coach. El cambio es solo en el WHERE de identidad del usuario autenticado.

---

### Perspectiva: Frontend Engineer

#### Fase B-4: Enterprise login pages

**Archivos a crear:**

**`apps/web/src/app/org/login/page.tsx`**
- Form simple: email + password
- `<form action={loginOrgAction}>`
- Sin tabs coach/alumno
- Texto: "Panel Empresa — acceso restringido a administradores"
- Link "¿Eres coach? → eva-app.cl/login"
- Dark mode compliant, `h-dvh`

**`apps/web/src/app/org/login/actions.ts`**
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function loginOrgAction(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }

  const { data: { user } } = await supabase.auth.getUser()
  const claims = user?.app_metadata as { org_role?: string; is_org_user?: boolean }

  if (!claims?.org_role) {
    return { error: 'No tienes acceso a ninguna organización.' }
  }

  redirect('/org/dashboard')  // middleware + getOrgBySlug maneja el slug
}
```

**Flujo de redirect enterprise:**
El middleware de `enterprise.eva-app.cl` ya hace rewrite `/login` → `/org/login`. No hay que tocarlo.

Post-login: `post-login-redirect.ts` detecta `isOrgUser=true` + `activeOrgSlug` → redirige a `/org/[slug]`.

Para que funcione: agregar `isOrgUser` al type `PostLoginProfile` en `apps/web/src/domain/auth/types.ts` y leerlo desde los claims JWT.

#### Fase B-5: Feature flags para enterprise coaches

Los coaches con `subscription_status = 'org_managed'` no ven:
- Sidebar: link de Billing / Suscripción
- Sidebar: link de Branding / Personalización
- Rutas: `/coach/subscription`, `/coach/settings/branding` → redirect a dashboard

**`apps/web/src/components/coach/CoachSidebar.tsx`**:
Condición existente `enterpriseContext` ya maneja partes de esto. Agregar prop `isOrgManaged: boolean`.

```tsx
{!isOrgManaged && (
  <SidebarItem href="/coach/subscription" icon={CreditCard} label="Suscripción" />
)}
{!isOrgManaged && (
  <SidebarItem href="/coach/settings/branding" icon={Palette} label="Marca" />
)}
```

**`apps/web/src/app/coach/layout.tsx`**: ya fetcha el coach profile. Agregar:
```typescript
const isOrgManaged = coach.subscription_status === 'org_managed'
// pasar a CoachSidebar
```

**Rutas protegidas** (`apps/web/src/app/coach/subscription/page.tsx`, `/settings/branding/page.tsx`):
```typescript
if (coach.subscription_status === 'org_managed') redirect('/coach/dashboard')
```

---

### Perspectiva: Mobile Engineer (iOS / Android)

**EVA Coach App (`apps/mobile`):** Sin cambios en Parte B. Enterprise coaches (`org_managed`) YA tienen sección org en `coach/perfil.tsx` (Sem 8, commit `f6fb827`). `getCoachOrgContext()` en `apps/mobile/lib/org.ts` lee `org_id`/`org_role` del JWT — sin cambios.

**EVA Enterprise App (`apps/enterprise`):** Fuera de scope v2. Documentado para v3:
- Dashboard org nativo (stats, seat usage, coaches list)
- Gestión básica de invites
- Branding configuration
- Bundle ID: `cl.evaapp.eva-enterprise`

**Bloqueantes móvil pre-existentes (no generados por este plan):**
- `.well-known/apple-app-site-association` tiene `PLACEHOLDER_APPLE_TEAM_ID` → reemplazar por `5GKWMMZ46Q` (Guimel)
- `.well-known/assetlinks.json` tiene `PLACEHOLDER_SHA256` → reemplazar con SHA256 del keystore después del primer build Android

---

### Perspectiva: DevOps Engineer

**Migrations:** siempre en `supabase/migrations/` con timestamp ISO. Aplicar con `npx supabase db reset`. **NO** `supabase db push` hasta plan completo.

**Regenerar tipos después de cada schema change:**
```bash
npx supabase gen types typescript --local > apps/web/src/lib/database.types.ts
```

**CI/CD:** `.github/workflows/ci.yml` ya existe. E2E con Supabase local queda para runner con Docker (v3 infra).

**Vercel env vars:** No hay vars nuevas para este plan. `ENTERPRISE_DOMAIN=enterprise.eva-app.cl` ya configurado.

**Supabase Auth Hook post-migration:** Verificar en Supabase Dashboard → Authentication → Hooks que `custom_access_token_hook` sigue activo y apunta a la función correcta. La migration `CREATE OR REPLACE FUNCTION` no cambia el binding del hook, pero conviene verificar.

**Monitoring:** `/api/health` endpoint ya existe. Agregar alert en UptimeRobot si `organization_members` query falla (señal de schema migration rota en prod).

---

### Perspectiva: QA Automation Engineer (Web & Mobile)

#### Suite E2E post-implementación

**`tests/enterprise/org-user-auth.spec.ts`** — nuevo:
```
Escenario 1: org-only user puede hacer login en /org/login
  - goto /org/login → fill email/password → submit
  - espera: URL /org/[slug] (NO /coach/dashboard)
  - espera: sidebar org visible (h1 con nombre de la org)

Escenario 2: JWT claims de org-only user
  - post-login: verificar via supabase.auth.getSession()
  - app_metadata.is_org_user = true
  - app_metadata.org_role ∈ ['org_owner', 'org_admin']
  - app_metadata.coach_id = undefined (sin valor)

Escenario 3: org-only user NO puede acceder a /coach/dashboard
  - goto /coach/dashboard → espera: redirect fuera de /coach/

Escenario 4: coach enterprise (org_managed) accede a /coach/dashboard
  - Login coach-member-a1@eva-test.cl
  - espera: /coach/dashboard visible
  - espera: NO hay link de "Suscripción" en sidebar
```

**`tests/enterprise/enterprise-coach-flags.spec.ts`** — nuevo:
```
Escenario 1: coach_managed no ve billing en sidebar
Escenario 2: coach standalone SÍ ve billing en sidebar
Escenario 3: /coach/subscription redirige si org_managed
```

**Seed requerido para nuevos tests:**
`org-owner-nocoach@eva-test.cl` — auth user SIN fila en coaches, con membresía activa en Org A.
La inserción en `auth.users` no puede hacerse en `seed.sql` directamente → usar helper TypeScript en `beforeAll` del spec.

**Matriz de escenarios QA:**

| Usuario | `coaches` row? | org_managed? | Login destino | Sidebar billing | `/org/[slug]` acceso |
|---------|----------------|--------------|---------------|-----------------|---------------------|
| `coach-solo@eva-test.cl` | ✅ | ❌ | `/coach/dashboard` | ✅ | ❌ redirect |
| `coach-owner-a@eva-test.cl` | ✅ | ❌* | `/org/crossfit-test-norte` | ✅ | ✅ |
| `coach-member-a1@eva-test.cl` | ✅ | ❌* | `/org/crossfit-test-norte` | ✅ | ✅ |
| `org-owner-nocoach@eva-test.cl` | ❌ | N/A | `/org/crossfit-test-norte` | N/A | ✅ |
| `client-a1@eva-test.cl` | ❌ | N/A | `/c/coach-a1-test/dashboard` | N/A | ❌ |

*Coaches del seed actual son standalone que también son org admins (modelo viejo). Coaches creados por org vía `createEnterpriseCoachAction` tendrán `org_managed`.

**Regresión obligatoria después de cada fase:**
```bash
npm run typecheck -w @eva/web
npx vitest run   # mínimo 128 tests
npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1   # 13/13
```

---

### Perspectiva: Security Engineer

**RLS impact análisis:**

El cambio `coach_id → user_id` en policies NO reduce seguridad — amplía qué auth users acceden, bajo las mismas condiciones (membresía activa + rol correcto). Los checks `role IN ('org_owner','org_admin')` se mantienen intactos.

**Invariante crítica post-migración:**
- Org-only user NO puede acceder a `/coach/*` — guard en `coach/layout.tsx` redirige si no hay fila en `coaches`
- Coach de Org A NO puede ver datos de Org B — `rls-isolation.spec.ts` verifica esto (13/13)
- `org_audit_logs` sigue siendo append-only — sin policies UPDATE/DELETE

**Guard nuevo en `apps/web/src/app/coach/layout.tsx`:**
```typescript
const coach = await getCoachProfile()
if (!coach) {
  // Auth user sin fila en coaches = org-only user que llegó a ruta incorrecta
  redirect('/org/dashboard')
}
```

**Tokens de invite:** Pendiente pre-existente — `accept_org_invite` usa UUID, plan pide `gen_random_bytes(32)` hex. No bloqueante para este plan.

**SUPABASE_SERVICE_ROLE_KEY:** Solo en Vercel Production Environment (no Preview). Verificar antes de deploy.

---

### Perspectiva: Product Manager

**Scope v2 (este plan):**
- ✅ Org-only admins (sin coach account)
- ✅ Login enterprise separado en `enterprise.eva-app.cl`
- ✅ Feature flags para enterprise coaches (sin billing/branding)
- ✅ E2E tests cubriendo nueva arquitectura
- ✅ E2E fixtures pendientes (nutrition plan + workout plan en seed)

**Scope v3 (no ahora):**
- EVA Enterprise App nativa (Expo)
- Self-service org registration
- Multi-org switching
- Billing enterprise automatizado
- Crons payment-reminder / audit-checksum / mp-reconcile
- Web APIs §2.8 (media session, fullscreen, speech, badge, web share)

**Decisión de producto — cuentas separadas:**
Juanito tiene DOS cuentas independientes:
1. Cuenta org-only en `enterprise.eva-app.cl` → gestiona gym
2. Si también quiere entrenar alumnos → crea cuenta coach en `eva-app.cl` (standalone)

No hay context-switching. No hay "modo empresa / modo coach". Cuentas completamente independientes. Simplifica el modelo mental y la seguridad.

---

### Perspectiva: UX/UI Designer (Web & Mobile)

#### `/org/login` — diseño

```
┌────────────────────────────────────────────────┐
│  [EVA Logo]   Panel Empresa                    │
│                                                │
│  Acceso para administradores y dueños de gym   │
│                                                │
│  Email organizacional                          │
│  [ juan@crossfitnorte.cl                    ]  │
│                                                │
│  Contraseña                                    │
│  [ ••••••••••••                             ]  │
│                                                │
│  [  Ingresar al panel  ]  ← botón primario     │
│                                                │
│  ¿Eres coach? Ingresa en eva-app.cl/login      │
└────────────────────────────────────────────────┘
```

- Sin tabs "SOY COACH / SOY ALUMNO" (no aplica para org admins)
- Header destaca "Panel Empresa" — diferencia del login de coach
- Link explícito a coach login — reduce tickets de soporte confusos
- Mobile: `h-dvh`, safe area padding (`pt-safe pb-safe`)

#### Sidebar org — limpieza post-feature-flags

El sidebar `/org/[slug]` nunca muestra links de coach (workouts, nutrición, planificación). Solo:
- Dashboard (stats, seats)
- Coaches (gestión)
- Clientes (pool)
- Configuración (branding, billing info)

Los coaches enterprise en `/coach/dashboard` ven sidebar de coaching SIN billing/branding — más limpio y enfocado en su trabajo.

---

### Perspectiva: Head of Sales (B2B Enterprise)

**Lo que esto desbloquea:**

1. **Demo más limpia:** Juanito ve Panel Empresa desde `enterprise.eva-app.cl` sin opciones de coach que no le aplican. Primera impresión más profesional.

2. **Pitch deck:** "Dos productos en uno: EVA Coach para tus entrenadores, EVA Enterprise para ti como dueño. Cada uno accede con su cuenta."

3. **Modelo de facturación separado:** Org owner paga por seats. Sin confusión con billing personal de coach.

4. **Argumento de privacidad:** "El dueño del gym no tiene acceso a los programas privados de los alumnos de cada coach. El admin solo ve estadísticas agregadas."

---

### Perspectiva: SDR (Sales Development Representative)

**Secuencia de prospección post-implementación:**

1. Outreach: "¿Tu gym tiene más de 2 entrenadores? EVA Enterprise: panel unificado para gestionar todo tu equipo."
2. Demo request → usar `enterprise.eva-app.cl`
3. Trial setup: admin crea org vía `/admin` panel → invite link para prospect
4. Onboarding D0: org owner recibe link → crea cuenta en `enterprise.eva-app.cl` → wizard 5 pasos
5. D7: verificar health score (coach logins, clientes creados)

**Template email:**
```
Asunto: [Nombre del gym] — panel de gestión para tu equipo de coaches

Veo que tienen [N] entrenadores. EVA Enterprise les da:
- Un panel donde TÚ ves todos tus coaches y sus clientes
- Cada coach tiene su app propia sin mezclar tus datos
- Trial 30 días, sin tarjeta de crédito

Demo 20 min: calendly.com/contacto-eva-app/eva-enterprise
```

---

### Perspectiva: Customer Success Manager (CSM)

**Playbook activación org-only admin (D0 → D30):**

| Día | Acción CSM | Señal éxito |
|-----|-----------|-------------|
| D0 | Admin crea cuenta → completa wizard 5 pasos | `onboarding_step = 5` |
| D1 | Email: "Crea tu primer coach enterprise" | Primer coach activo |
| D3 | Check: coaches logueados ≥1x | `last_login_at` en coaches |
| D7 | Revisión health score (target ≥ 60) | `last_health_score ≥ 60` |
| D14 | Llamada check-in | NPS ≥ 8 |
| D30 | Revisión seats: ¿más? | Upsell si 4/5 seats usados |

**Soporte escalado:**
- Admin ve coaches pero no crea más → verificar `seats_included` vs. activos
- Coach no ve sus clientes → verificar `coach_client_assignments` activo
- Admin no recibe invite email → verificar Resend API key + Mailpit en local

---

### Perspectiva: Legal & Compliance (Chile — Ley 19.628 + Ley 21.719)

**Impacto de este plan:**

1. **Separación de datos:** Org-only admins solo ven datos del pool de su org (RLS garantiza aislamiento). No ven datos de otras orgs. Cumple principio de finalidad (Ley 19.628 art. 9).

2. **Datos de org admins:** `auth.users` almacena solo email/nombre del admin. Sin datos sensibles de salud. Menor riesgo que datos de alumnos.

3. **Responsable de tratamiento:** Coach/gym es responsable de datos de sus alumnos. EVA es encargado. No cambia con esta arquitectura.

4. **ARCO:** Canal `privacidad@eva-app.cl` ya existe en footer. Org admins pueden solicitar eliminación → `deleted_at` en `organization_members` + eliminación de `auth.users` vía service role.

5. **DPA:** Vercel y Supabase ya tienen DPA firmados. No requiere nueva firma.

**Pendiente pre-existente:**
- ToS y Privacy Policy existen en `docs/legal/` pero no están publicadas en `/legal` route — falta antes de launch.

---

### Perspectiva: Fintech / Integrations Specialist

**Billing enterprise — sin cambios en este plan:**
- Manual: admin recibe link de transferencia mensual (MP o banco)
- `org_invoices` ya existe para tracking
- Org owner ve facturas en `/org/[slug]/settings` → sección billing

**Separación billing post-refactor:**
- Factura del gym → `org_invoices` → pagada por org owner (nueva cuenta enterprise)
- Suscripción de coaches standalone → `coaches.subscription_status` + MP pre-approval → pagada por cada coach
- Sin confusión entre ambas: cuentas y tablas completamente separadas

**MP / Stripe — sin cambios:** Automatización billing enterprise queda para v3.

---

## Fases de implementación — Orden de ejecución

```
Parte A: Verificar E2E existente
  ├── Fix seed: nutrition_plan + workout_plan para client-a1
  ├── npx supabase db reset
  └── npx playwright test → objetivo: suite verde (salvo tests que aún faltan seed)

Fase B-1: Schema (user_id en organization_members)
  ├── Crear migration 20260521000001
  ├── Actualizar org.repository.ts
  ├── Actualizar org.actions.ts
  └── npx supabase db reset && npm run typecheck && npx vitest run

Fase B-2: JWT Hook (org-only users)
  ├── Crear migration 20260521000002
  ├── Extender CoachOrgContext type + isOrgUser
  ├── Actualizar coach-context.ts (fallback + claim)
  ├── Actualizar post-login-redirect.ts
  └── Actualizar domain/auth/types.ts

Fase B-3: RLS (coach_id → user_id en todas las policies)
  ├── Crear migration 20260521000003
  ├── Actualizar is_active_org_member() SECURITY DEFINER
  └── npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1 → 13/13

Fase B-4: Enterprise login
  ├── apps/web/src/app/org/login/page.tsx
  ├── apps/web/src/app/org/login/actions.ts
  ├── Guard en coach/layout.tsx (org-only → redirect)
  └── npm run typecheck && npm run build

Fase B-5: Feature flags coach org_managed
  ├── CoachSidebar.tsx: condicional billing/branding
  ├── coach/layout.tsx: isOrgManaged prop
  └── Redirect guard en /coach/subscription + /coach/settings/branding

Parte A-bis: Re-verificar E2E (no regresiones)
  └── npx playwright test → mantener o mejorar resultado anterior

Fase B-6: Seed + nuevos tests
  ├── seed.sql: nutrition + workout para client-a1 + E2E_WORKOUT_PLAN_ID uuid fijo
  ├── tests/enterprise/org-user-auth.spec.ts (nuevo)
  └── tests/enterprise/enterprise-coach-flags.spec.ts (nuevo)
```

---

## Archivos — Mapa completo de cambios

### Nuevos archivos

| Archivo | Descripción |
|---------|-------------|
| `supabase/migrations/20260521000001_org_members_user_id.sql` | Schema: user_id column |
| `supabase/migrations/20260521000002_auth_hook_org_users.sql` | JWT hook: org-only users |
| `supabase/migrations/20260521000003_rls_user_id.sql` | RLS: coach_id → user_id |
| `apps/web/src/app/org/login/page.tsx` | Enterprise login UI |
| `apps/web/src/app/org/login/actions.ts` | Enterprise login server action |
| `tests/enterprise/org-user-auth.spec.ts` | E2E org-only user auth |
| `tests/enterprise/enterprise-coach-flags.spec.ts` | E2E coach feature flags |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `apps/web/src/infrastructure/db/org.repository.ts` | user_id en queries + OrgMember type |
| `apps/web/src/app/org/[slug]/_actions/org.actions.ts` | user_id en inserts |
| `apps/web/src/lib/coach-context.ts` | isOrgUser claim + fallback DB usa user_id |
| `apps/web/src/lib/auth/post-login-redirect.ts` | isOrgUser path a /org/[slug] |
| `apps/web/src/domain/auth/types.ts` | isOrgUser en PostLoginProfile |
| `apps/web/src/app/coach/layout.tsx` | isOrgManaged prop + guard redirect |
| `apps/web/src/components/coach/CoachSidebar.tsx` | isOrgManaged condicional |
| `apps/web/src/app/coach/subscription/page.tsx` | redirect si org_managed |
| `apps/web/src/app/coach/settings/branding/page.tsx` | redirect si org_managed |
| `supabase/seed.sql` | nutrition + workout plan para client-a1 |

### Archivos NUNCA tocar

`middleware.ts` · `lib/utils.ts` · `lib/supabase/server.ts` · `lib/database.types.ts` (regenerar con supabase gen types, no editar a mano)

---

## Verificación final

```bash
# 1. Reset completo con todas las migrations nuevas
npx supabase db reset

# 2. Regenerar tipos
npx supabase gen types typescript --local > apps/web/src/lib/database.types.ts

# 3. Typecheck
npm run typecheck -w @eva/web
npx tsc --noEmit   # apps/mobile

# 4. Unit tests (mínimo 128)
npx vitest run

# 5. Build
npm run build -w @eva/web

# 6. E2E
npx playwright test tests/auth.spec.ts
npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1
npx playwright test tests/enterprise/journey-e2e.spec.ts
npx playwright test tests/enterprise/invite-flow.spec.ts
npx playwright test tests/enterprise/org-user-auth.spec.ts
npx playwright test tests/enterprise/enterprise-coach-flags.spec.ts
npx playwright test tests/nutrition-student-smoke.spec.ts
npx playwright test tests/checkin-flow.spec.ts
npx playwright test tests/workout-flow.spec.ts

# 7. Manual smoke
# a. localhost:3000/org/login
#    → login org-owner-nocoach@eva-test.cl / TestPass123!
#    → llega a /org/crossfit-test-norte
#    → sidebar org (no sidebar coach)
#    → ir a /coach/dashboard → redirige
# b. localhost:3000/login
#    → login coach-member-a1@eva-test.cl / TestPass123!
#    → llega a /org/crossfit-test-norte (es org admin)
#    → puede navegar a /coach/dashboard (es coach Y admin)
#    → NO ve link "Suscripción" si subscription_status=org_managed
# c. localhost:3000/login
#    → login coach-solo@eva-test.cl / TestPass123!
#    → llega a /coach/dashboard
#    → SÍ ve link "Suscripción"
```

---

## Fuera de scope v2 (documentado para v3)

| Feature | Justificación |
|---------|---------------|
| EVA Enterprise App (Expo nativo) | Apps/mobile primero; enterprise app requiere SDK separado |
| Self-service org registration | Requiere billing automático (MP/Stripe) |
| Multi-org switching | Raro caso de uso; `active_org_id` lo cubre parcialmente |
| Billing enterprise automatizado | Manual funciona para primeros 10-20 clientes |
| Crons payment-reminder / audit-checksum / mp-reconcile | No críticos para launch |
| Web APIs §2.8 | P1 post-launch |
| `.well-known` SHA256 / Apple Team ID placeholders | Depende de primer build nativo |

---

*Generado: 2026-05-21 · v2/enterprise · NO commitear este archivo hasta terminar implementación*
