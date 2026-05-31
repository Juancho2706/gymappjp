# Handoff: EVA Enterprise Dashboard — v2/enterprise

**Fecha:** 2026-05-30  
**Rama activa:** `v2/enterprise`  
**DB:** Supabase local (Docker). `npx supabase start` para levantarla. NO tocar prod.  
**Stack:** Next.js 16 App Router, Supabase SSR, Tailwind v4, `apps/web/src/` es el workspace web.

---

## Qué somos / Qué hace esto

EVA es un SaaS B2B2C de entrenamiento fitness. Hay dos flujos paralelos que deben coexistir sin mezclar datos:

```
Flujo standalone:  coach_standalone → alumno_standalone
Flujo enterprise:  empresa (org) → coach_enterprise → alumno_enterprise
```

- **Standalone** = `org_id IS NULL` en clients/coaches
- **Enterprise** = `org_id = active_org_id`
- El dashboard enterprise vive en `/org/[slug]/*`
- Las acciones SIEMPRE validan workspace server-side, nunca solo por URL params
- RLS en Supabase es defensa adicional; server actions tienen su propio guard

---

## Estado actual del plan

Plan principal: `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md`

### Completado recientemente (no repetir)

| Commit | Qué |
|--------|-----|
| `2a76385` | Bottom tab nav mobile — reemplaza grid 3x2 |
| `c8ea406` | Activity feed en dashboard (últimos 8 audit_logs) |
| `e29d180` | Announcements audience targeting (coaches/clients/all) |
| `3b91260` | Plan cleanup — packages/, contracts marcados done |
| `a707d09` | Permisos granulares — 22 OrgPermissions, ops/analyst/brand_manager |
| `80f2f1a` | Tests branding workspace + revoke→standalone (46/46 passing) |
| `04542bc` | Mobile compact rows assignments+payments + seats/plan contact flow |
| `beaf7a6` | Activity feed persistente dashboard |
| `be0e3a2` | Brand Studio draft/published/rollback |
| `c8e5a74` | Reasignación individual desde /assignments |
| `b1ca26a` | Audit filters UI + bulkAssign RPC transaccional |
| `0184742` | check_ins RLS leak fix (health data) + 29 tests |
| `9eba46a` | MFA enforcement org_admin |
| `782e673` | Org health score fórmula real (adherencia 40%+asignación 25%+activos 20%+programas 15%) |
| `fb87cbd` | Workspace switcher in-app |

### Pendiente ejecutable ahora (en orden de impacto)

1. **`[ ]` Revisar cada menú en 390x844 y 430x932** — validar que el bottom nav y subnav chips se ven bien en los viewports más comunes. Playwright screenshot por página.

2. **`[ ]` Payments: filtros pagado/pendiente/vencido + vencimientos + export CSV auditado** — `/org/[slug]/payments` tiene registro de pagos pero faltan filtros por URL searchParams (igual a como se hizo en `/audit`). El export ya existe en `/payments/export/route.ts` pero falta UI.

3. **`[ ]` Assignments: historial de reasignaciones por alumno/coach** — agregar query que muestre últimas N reasignaciones de un coach o alumno desde `coach_client_assignments` con `assigned_at/assigned_by`.

4. **`[ ]` Dashboard mobile: resumen ejecutivo compacto** — en mobile 390px el dashboard muestra demasiadas secciones. Crear vista compacta: 3 KPIs top + action queue + link a detalles.

5. **`[ ]` Test: coach revocado no entra enterprise pero mantiene standalone** — agregar a `tests/enterprise/rls-isolation.spec.ts` un test que intenta acceder a `/org/[slug]` como `coach_susp` y verifica redirect, luego accede a `/coach/dashboard` y verifica que puede. Requiere Playwright con browser.

6. **`[ ]` Nutrición: tracking de uso por template** — en `/org/[slug]/nutrition`, agregar stats: cuántos clientes tienen activo cada template, adherencia de alumnos con ese template. Query desde `nutrition_plans` + `daily_nutrition_logs`.

7. **`[ ]` Validar pb-safe/pt-safe/min-h-dvh** — revisar que el layout enterprise no usa `h-screen`/`100vh`, usa `dvh`. El nuevo bottom nav ya tiene `pb-safe`.

---

## Reglas que NO debes romper

### Datos
- Standalone = `org_id IS NULL`. Enterprise = `org_id != NULL`. NUNCA mezclar.
- Toda mutation server-side pasa por `resolveOrgAdminContext(orgSlug)` o `getOrgAdminContext()`.
- Service role solo en server actions, nunca en client components.
- RLS es defensa adicional, no reemplazo de guards de app.

### Arquitectura
- Clean Architecture: `_data/` → `services/` → `infrastructure/db/` → Supabase
- Feature-first: cada feature en su ruta con `_data/`, `_actions/`, `_components/`
- No `SELECT *` — columnas explícitas siempre
- `React.cache` en `_data/`, no `unstable_cache`
- `revalidatePath()` tras mutations

### UI/Mobile
- No `h-screen`, `min-h-screen`, `100vh` → usar `dvh`
- `pb-safe`, `pt-safe` para safe areas iOS
- No usar skill `frontend-design` (el usuario dijo que es mala para este flujo)
- Bottom nav enterprise ya en `OrgEnterpriseNav.tsx` — NO agregar más nav layers

### Git
- Commits separados por slice lógico
- Migrations en `supabase/migrations/` aplicadas con `npx supabase db reset` (local)
- NO `npx supabase db push` a prod — solo local hasta que el usuario haga merge
- Marcar completados en `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md` con fecha

---

## Archivos clave

```
apps/web/src/
  app/org/[slug]/
    _actions/org.actions.ts         ← mutations enterprise (resolveOrgAdminContext)
    _components/
      OrgEnterpriseNav.tsx          ← sidebar desktop + bottom nav mobile
      dashboard/
        EnterpriseDashboardHome.tsx ← dashboard RSC component
        OrgHealthScoreRefresher.tsx ← health score client component
    _data/org.queries.ts            ← queries con React.cache
  domain/org/permissions.ts        ← OrgPermission, orgRoleCan(), ROLE_PERMISSIONS
  infrastructure/db/org.repository.ts ← types + findOrg* functions
  services/org/org.service.ts      ← getOrgAdminContext, writeOrgAuditEvent
  lib/database.types.ts            ← tipos DB (actualizar cuando hay migración nueva)

supabase/migrations/               ← todas locales, aplica con db reset
tests/enterprise/rls-isolation.spec.ts ← 46 tests de aislamiento RLS
```

---

## Flujo de permissions

```typescript
// Guard en server action:
const context = await resolveOrgAdminContext(orgSlug) // default: owner+admin+ops
// Para acciones sensibles pasar roles explícitos:
const context = await resolveOrgAdminContext(orgSlug, ['org_owner', 'org_admin'])

// Guard en página RSC:
const isAdmin = orgRoleCan(org.myRole, 'org.clients.assign') // ops también puede
const isOwner = org.myRole === 'org_owner'
```

Matrix de roles completa: `domain/org/permissions.ts`

---

## Tests

```bash
# RLS isolation (requiere supabase start)
npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1

# Typecheck
npm run typecheck

# Lint
npm run lint
```

---

## Migraciones pendientes de aplicar a prod (cuando el usuario haga merge)

```
20260527120000_exercises_add_columns_safe.sql
20260527120100_exercises_enable_rls.sql
20260527120200_client_imports_table.sql
20260527130000_exercises_add_image_url.sql
20260527130100_exercise_media_bucket.sql
20260530100000_exercises_drop_conflicting_policies.sql
20260530170000_fix_checkins_rls_leak.sql
20260530200000_organizations_brand_draft.sql
20260530210000_bulk_assign_selected_clients_rpc.sql
20260530220000_announcements_audience.sql
```

Orden: aplicar en orden cronológico con `npx supabase db push` al hacer merge.

---

## Qué NO hacer

- NO mergear a `master` — el usuario lo hace manualmente cuando esté satisfecho
- NO ejecutar `npx supabase db push` — solo local
- NO usar `git reset --hard` ni comandos destructivos sin confirmación explícita
- NO agregar `apps/` a `.git/info/exclude` (ya fue removido intencionalmente)
- NO revertir cambios existentes sin pedirlo
- NO usar `fetch()` client-side para mutations — usar server actions
- NO confiar en URL params para determinar tenant/org — siempre validar server-side
