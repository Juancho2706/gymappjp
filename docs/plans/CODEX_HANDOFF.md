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

### Ordenes persistentes del owner

- Continuar Plan C sin tocar deploy/prod: NO `supabase db push`, NO merge a `master`, NO tareas de despliegue salvo pedido explicito.
- Priorizar el siguiente pendiente ejecutable no-deploy, con cambios pequenos y verificables.
- Si se agregan ideas, investigacion, decisiones o pendientes nuevos, registrarlos tambien en `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md`.
- Cada cosa hecha debe quedar reflejada en este handoff.
- Preferir soluciones sin costo: usar stack existente, Supabase local, Playwright/Vitest ya instalados, CSS/React propio; no agregar servicios pagos.
- Si se trabaja UI/UX o una feature existente y conviene actualizar criterio 2026, se puede investigar en internet, pero aterrizarlo en decisiones sin costo.

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
| `uncommitted 2026-05-31` | Assignments activity timeline desde `coach_client_assignments`; `_data -> repository -> Supabase`; typecheck passing |
| `uncommitted 2026-05-31` | Dashboard mobile compacto: 3 KPIs, acciones prioritarias y links de detalle en `<md`; typecheck passing |
| `uncommitted 2026-05-31` | Browser test coach suspendido: bloquea `/org/[slug]`, conserva `/coach/dashboard`; targeted Playwright passing |
| `uncommitted 2026-05-31` | Safe-area pass enterprise fixed overlays/bars: `pl-safe pr-safe`; typecheck passing |
| `uncommitted 2026-05-31` | Nutrition template usage: active clients/logs/adherence 7d via `nutrition_plans` + `daily_nutrition_logs`; typecheck passing |
| `uncommitted 2026-05-31` | Payments due dates + dashboard alerts: `payment_date + period_months`, excluye becados/pausados; typecheck passing |
| `uncommitted 2026-05-31` | Enterprise mobile visual audit: 12 menus en 390x844/430x932 + screenshots; Playwright passing |
| `uncommitted 2026-05-31` | Payments mobile bottom sheet: `PaymentRecordSheet` reemplaza `<details>` en `<md`; typecheck + Playwright passing |
| `uncommitted 2026-05-31` | Assignments mobile cards/sheet: `CoachAssignmentsMobile` con cards por coach y sheet de alumnos; typecheck + Playwright passing |
| `uncommitted 2026-05-31` | Export cross-tenant negative tests: audit/payments/reports org A vs org B; Playwright passing |
| `uncommitted 2026-05-31` | Workspace revocation stale cache tests: stale enterprise preference no autoriza coach suspendido; Playwright passing |
| `uncommitted 2026-05-31` | E2E happy path enterprise verificado: auth user + alumno temporal -> asignacion -> pago mobile sheet -> exports -> cleanup; Playwright passing |
| `uncommitted 2026-05-31` | Storage cross-tenant test: owner A no puede escribir/listar `org-assets` de Org B; Playwright passing |
| `uncommitted 2026-05-31` | Recharts dashboard warning mitigation: `DashboardCharts` usa `minWidth/minHeight/initialDimension` y wrapper con min size; typecheck passing |
| `uncommitted 2026-05-31` | Next scroll behavior warning mitigado: root `<html>` usa `data-scroll-behavior="smooth"`; warning no reaparece en Playwright |
| `uncommitted 2026-05-31` | Plan ejecutable multi-contexto alumno/auth: `clients.client_auth_id`, fases local-only, doble lectura/escritura, selector y rollback documentados |
| `uncommitted 2026-05-31` | Hydration warning caret-color resuelto en mobile visual audit: screenshots usan `caret: 'initial'`; Playwright passing |
| `uncommitted 2026-05-31` | Next 16 proxy migration: `src/middleware.ts` -> `src/proxy.ts`, export `proxy(request)`; route guard Playwright passing |
| `uncommitted 2026-05-31` | Sentry deprecated options fixed: `webpack.treeshake.removeDebugLogging`, `webpack.automaticVercelMonitors`, router transition hook exported; warnings gone in Playwright |
| `uncommitted 2026-05-31` | Student `/c` QA cleanup: `HabitsTracker` evita `button` anidado, `NutritionShell` evita mismatch online/offline SSR, charts de peso miden ancho con `ResizeObserver`, logos fijan dimensiones; nutrition smoke passing |
| `4d63686` | Commit de todo lo anterior: hardening Revenue MVP enterprise, tests y docs |
| `uncommitted 2026-05-31` | Nutrition usage por coach: breakdown de templates org por coach, alumnos, planes, logs 7d y adherencia; sin migracion |
| `uncommitted 2026-05-31` | Audit filters completos: URL params `action`, `actor_id`, `target_type`, `from`, `to`; export CSV respeta filtros/prefix; typecheck + Playwright passing |
| `uncommitted 2026-05-31` | Reports CSV verificado/cerrado: `org.reports.export`, `report.exported`, checksum SHA-256 header/metadata; typecheck passing |
| `uncommitted 2026-05-31` | Audit checksum manual: script `npm run audit:checksum:manual` reutiliza endpoint existente `/api/cron/audit-checksum` |
| `uncommitted 2026-05-31` | Detector statico de mutations enterprise sin audit: `npm run audit:org-sensitive-actions`; passing |
| `uncommitted 2026-05-31` | CI RLS isolation: script `npm run test:e2e:enterprise-rls` y step dedicado en `.github/workflows/ci.yml`; local 46/46 passing |
| `uncommitted 2026-05-31` | Trust Center Lite real: nueva ruta `/org/[slug]/trust`, nav Seguridad/Admin, exports controlados, posture y datos sensibles; mobile audit passing |
| `uncommitted 2026-05-31` | P1.5 flujos multi-contexto documentados: coach standalone -> enterprise, owner/staff tambien coach/alumno, runbook `client_auth_id` local/live |
| `uncommitted 2026-05-31` | Mobile parity matrix Web/PWA/RN/native-only documentada por menu; bottom nav/subnav/safe-area marcados done segun implementacion existente |
| `uncommitted 2026-05-31` | Gap creadores enterprise 1:1 documentado: faltan workout builder y nutrition builder completos dentro de `/org`; plan define rutas destino y guard/contexto |

### Pendiente ejecutable ahora (en orden de impacto)

1. **`[x]` Revisar cada menú en 390x844 y 430x932** — Completado 2026-05-31 con `tests/enterprise/mobile-visual-audit.spec.ts`. Recorre 12 menus enterprise, valida bottom nav visible, sin overflow horizontal y genera screenshots por viewport en `test-results/`.

2. **`[x]` Payments: filtros, export CSV, vencimientos y alertas dashboard** — Verificado/completado 2026-05-31. `/org/[slug]/payments` usa `searchParams.status`, UI de export hacia `/payments/export?status=...`, calcula proximo pago como `payment_date + period_months`, excluye `scholarship/paused` de vencimientos y muestra vencidos/proximos 7d. `/org/[slug]` agrega pagos al `riskCount` y a la action queue.

3. **`[x]` Assignments: actividad reciente de asignaciones por alumno/coach** — Completado 2026-05-31. `/org/[slug]/assignments` muestra ultimos registros desde `coach_client_assignments` con `assigned_at/assigned_by`, alumno, coach y link a Audit Log filtrado. Nota tecnica: la tabla hace upsert por `org_id + client_id`, asi que no es historial append-only real; queda pendiente decidir si el historial canonico vive en `org_audit_logs` o en nueva tabla append-only.

4. **`[x]` Dashboard mobile: resumen ejecutivo compacto** — Completado 2026-05-31. En `<md`, `/org/[slug]` muestra 3 KPIs top, action queue priorizada y links a detalles; las secciones densas quedan desde `md` para reducir ruido en 390px.

5. **`[x]` Test: coach revocado no entra enterprise pero mantiene standalone** — Completado 2026-05-31 en `tests/enterprise/journey-e2e.spec.ts` porque requiere navegador. Verifica login de `coach-suspended@eva-test.cl`, redirect/bloqueo al visitar `/org/${ORG_B_SLUG}` y acceso conservado a `/coach/dashboard`. Verificado con `npx playwright test tests/enterprise/journey-e2e.spec.ts -g "coach suspendido" --workers=1`.


6. **`[x]` Nutricion usage implementado** — Completado 2026-05-31. `/org/[slug]/nutrition` muestra templates en uso, alumnos activos por template, logs 7d y adherencia 7d. Query nueva en repository/cache usa `nutrition_plans` + `daily_nutrition_logs`. Nota tecnica: como no existe `org_template_id` persistido cuando el coach usa un template org, el MVP matchea por nombre + macros; queda pendiente vinculo canonico o breakdown por coach.

7. **`[x]` Validar pb-safe/pt-safe/min-h-dvh** — Completado 2026-05-31. Audit por `rg`: no hay `h-screen`, `min-h-screen`, `100vh` ni `overflow-x-hidden` en `/org/[slug]`; layout usa `min-h-dvh`. Se agrego `pl-safe pr-safe` a overlays/barras fixed enterprise (`CoachQRButton`, nutrition template modal, import modal, clients bulk bar/modal/toast, remove coach dialog, revoke staff dialog, bottom nav).

8. **`[x]` Payments mobile sheet** — Completado 2026-05-31. `PaymentRecordSheet` abre bottom sheet en `<md`, usa server action existente `recordEnterpriseClientPaymentAction`, muestra errores inline y deja el formulario inline solo en `md+`.

9. **`[x]` `/assignments` mobile cards + sheet de alumnos** — Completado 2026-05-31. `CoachAssignmentsMobile` muestra cards por coach en `<md`, abre bottom sheet con alumnos asignados y permite reasignar desde el sheet usando `ReassignClientSelect`. Desktop conserva la grilla actual desde `md+`.

11. **`[x]` Negative tests exports cross-tenant** — Completado 2026-05-31. `tests/enterprise/export-cross-tenant.spec.ts` valida que owner A exporta audit/payments/reports de org A y que slug swap hacia org B no entrega CSV ni attachment. Usa `maxRedirects: 0` porque middleware puede redirigir antes del handler.

12. **`[x]` Workspace revocado por cache/session** — Completado 2026-05-31. `tests/enterprise/workspace-revocation-cache.spec.ts` fuerza `workspace_preferences` stale hacia Org B para `coach-suspended`, valida que `/api/mobile/coach/dashboard` resuelve `coach_standalone` con `orgId=null`, y que `/org/box-test-sur` no queda accesible.

13. **Nota QA** — El spec cross-tenant puede imprimir `ECONNRESET` en dev server al abortar redirects con `maxRedirects: 0`; el test pasa y el objetivo es confirmar que no hay CSV/attachment cross-tenant.

14. **`[x]` E2E happy path enterprise** — Completado 2026-05-31 en `tests/enterprise/happy-path-enterprise.spec.ts`. Flujo no destructivo: crea auth user + alumno temporal Org A, login owner, visita dashboard, asigna a coach A1, registra pago via `PaymentRecordSheet`, valida exports payments/reports y limpia `client_payments`, `coach_client_assignments`, audit logs relacionados, `clients` y auth user. Verificado con `npx playwright test tests/enterprise/happy-path-enterprise.spec.ts --workers=1`. Nota tecnica: `clients.id` tiene FK a `auth.users.id`; el test debe crear auth user primero. Se cambio validacion enterprise de asignacion/pagos a `z.guid()` para aceptar IDs deterministas del seed local.

15. **`[x]` Storage cross-tenant** — Completado 2026-05-31 en `tests/enterprise/storage-cross-tenant.spec.ts`. Owner A puede escribir `org-assets/orgs/{ORG_A_ID}` y no puede escribir/listar `org-assets/orgs/{ORG_B_ID}`. Inventario local: buckets `checkins`, `exercise-media`, `logos`, `org-assets`; 16 policies en `storage.objects`. Nota nueva: `checkins` esta `public=true`; aunque RLS bloquea list/select por path, fotos sensibles deberian migrar a bucket privado + signed URLs antes de vender salud/progreso enterprise avanzado.

16. **`[x]` Nota QA Recharts + scroll behavior** — Recharts mitigado en `apps/web/src/components/coach/dashboard/DashboardCharts.tsx` con min size e `initialDimension`; Next warning `missing-data-scroll-behavior` mitigado en `apps/web/src/app/layout.tsx` con `data-scroll-behavior="smooth"`. `npm run typecheck` pasa.

17. **`[x]` Plan multi-contexto alumno/auth** — Completado 2026-05-31 en `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md` P1.5. Decision: mantener `clients` como perfil operativo y agregar futuro `clients.client_auth_id`; fases: SPEC/PLAN/TASKS, migracion aditiva local, doble lectura/escritura, selector contexto alumno, corte de FK vieja y rollback/testing. No se ejecuto SQL.

10. **`[x]` Deuda hydration Playwright mobile** — Resuelta 2026-05-31. Causa: `page.screenshot()` ocultaba carets por defecto y mutaba inputs con `style={{caret-color:"transparent"}}`; `tests/enterprise/mobile-visual-audit.spec.ts` usa `caret: 'initial'`. Verificado con `npx playwright test tests/enterprise/mobile-visual-audit.spec.ts --workers=1` (4/4 passing, sin mismatch caret-color).

18. **`[x]` Next 16 proxy + Sentry warnings** — Completado 2026-05-31. `apps/web/src/middleware.ts` fue renombrado a `apps/web/src/proxy.ts`, con `export async function proxy(request)`. Sentry usa opciones nuevas en `apps/web/next.config.ts` y `apps/web/instrumentation-client.ts` exporta `onRouterTransitionStart`. Verificado con `npm run typecheck`, `npx playwright test tests/enterprise/storage-cross-tenant.spec.ts --workers=1` y `npx playwright test tests/enterprise/journey-e2e.spec.ts -g "coach suspendido" --workers=1`. Nota: primer run del test de browser timed out por compilacion inicial; reintento con servidor caliente paso. Puede aparecer `ECONNRESET` al abortar navegaciones/redirections en dev, no fallo de test.

19. **`[x]` Student `/c` warnings QA** — Completado 2026-05-31. `HabitsTracker` ya no renderiza `button` dentro de `button`; `InfoTooltip` corta propagacion de click; `NutritionShell` inicializa online como SSR-safe y lee `navigator.onLine` post-mount; `WeightSparkline`/`WeightProgressChart` reemplazan `ResponsiveContainer` por medicion con `ResizeObserver`; `EvaRouteLoader`, `InstallPrompt` y transicion del builder fijan dimensiones de logo. Verificado con `npm run typecheck` y `npx playwright test tests/nutrition-student-smoke.spec.ts --workers=1` (2/2 passing, sin warnings de hydration/Recharts/image). Nota: sigue apareciendo `ECONNRESET` al abortar requests durante navegacion/offline en dev, sin fallo de test.

---

20. **`[x]` Nutricion usage por coach** — Completado 2026-05-31. `findOrgNutritionTemplateUsage()` ahora agrega `coach_usage` por template org usando planes activos matcheados por nombre+macros: coach, alumnos activos, planes activos, logs 7d y adherencia. `/org/[slug]/nutrition` muestra top coaches y badges por template. Sin migracion.

21. **`[x]` Audit filters accionables** — Completado 2026-05-31. `/org/[slug]/audit` agrega filtros por actor y target type ademas de categoria/fecha, todos via URL search params. `/audit/export` acepta `action_prefix`, `actor_id`, `target_type`, `from`, `to` y registra esos filtros en `audit.exported`. Verificado con `npm run typecheck`, `npx playwright test tests/enterprise/export-cross-tenant.spec.ts --workers=1`, `npx playwright test tests/enterprise/happy-path-enterprise.spec.ts --workers=1` y `npx playwright test tests/enterprise/mobile-visual-audit.spec.ts --workers=1`. Nota: primer intento paralelo de Playwright fallo por doble `next dev`; re-run serial paso.

22. **`[x]` Reports CSV permission + audit** — Verificado/cerrado 2026-05-31. `/org/[slug]/reports/export` ya existia; se ajusto a permiso granular `org.reports.export`, roles permitidos por RBAC (`owner/admin/ops/analyst` segun `orgRoleCan`), audit fail-closed `report.exported` y checksum SHA-256 en header `X-Content-SHA256` + metadata.

23. **`[x]` Audit checksum manual/local** — Completado 2026-05-31. El endpoint existente `/api/cron/audit-checksum` ya genera e inserta checksum semanal en `audit_log_checksums`; se agrego `scripts/run-audit-checksum-manual.mjs` y script `npm run audit:checksum:manual` para ejecutarlo contra local/staging sin servicio pago. No se ejecuto contra prod.

24. **`[x]` Detector de mutations sensibles sin audit** — Completado 2026-05-31. `scripts/check-org-sensitive-actions-audit.mjs` revisa acciones/rutas enterprise con `insert/update/upsert/delete/rpc/updateUserById` y falla si falta `writeOrgAuditEvent`, con allowlist explicita para MFA setup. Verificado con `npm run audit:org-sensitive-actions`.

25. **`[x]` CI RLS isolation por PR** — Completado 2026-05-31. `package.json` agrega `test:e2e:enterprise-rls`; `.github/workflows/ci.yml` agrega step dedicado `Enterprise RLS isolation` antes del Playwright completo. Verificado local con `npm run test:e2e:enterprise-rls` (46/46 passing).

26. **`[x]` Trust Center Lite** — Completado 2026-05-31. Nueva ruta `/org/[slug]/trust`, agregada al nav Seguridad/Admin. Consolida permisos/export controlado, posture, datos sensibles, audit y billing manual usando queries existentes. Verificado con `npm run typecheck` y `npx playwright test tests/enterprise/mobile-visual-audit.spec.ts --workers=1` incluyendo `/trust`.

27. **`[x]` P1.5 multi-contexto documentado** — Completado 2026-05-31. Plan documenta coach standalone que entra a enterprise sin duplicar correo, owner/staff que tambien es coach/alumno y runbook live obligatorio para `clients.client_auth_id`. No se ejecuto SQL.

28. **`[x]` Mobile parity matrix** — Completado 2026-05-31. Plan agrega matriz por menu Web/PWA -> RN -> native-only -> contrato compartible. Tambien se marcaron bottom nav, subnav, workspace/signout y safe-area como done porque ya existen y fueron verificados.

31. **`[x]` Migración npm → pnpm** — Completado 2026-05-31. `pnpm import` convirtió `package-lock.json` → `pnpm-lock.yaml`. `pnpm-workspace.yaml` con `allowBuilds` explícito (supply chain defense). `.npmrc` con `shamefully-hoist=false`. CI actualizado: `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile --ignore-scripts`. `package.json` scripts usan `pnpm --filter`. CLAUDE.md regla: usar pnpm, nunca npm. Typecheck pasa.

30. **`[x]` P2.5-A bugs + Team CRUD completo** — Completado 2026-05-31. Tres bug fixes en builders (template-builder org scope, edit nutrition page workspace, getClientFoodFavorites ownership). Team page ahora tiene CRUD completo: `CreateStaffDialog` (crea ops/analyst/brand_manager/org_admin con contraseña temporal visible), `ChangeStaffRoleButton` (dialog radio, llama `updateStaffRoleAction`), `ResetStaffPasswordButton` (llama `resetStaffPasswordAction` por memberId). `CreateEnterpriseCoachSchema` acepta todos los roles. `npm run typecheck` pasa.

29. **`[ ]` Fase P2.5 — Programas y Nutricion Enterprise** — Auditoria 2026-05-31 revelo que los builders en `/coach/*` YA soportan `org_id` via `resolvePreferredWorkspace()`. El gap real no era duplicar builders sino tres cosas distintas:
    - **3 bugs en builders existentes** (template-builder sin org scope, edit nutrition page sin workspace resolution, `getClientFoodFavorites` sin coach validation) — Fase P2.5-A.
    - **Nueva ruta `/org/[slug]/programs`** para oversight de programas org + creator de org templates (requiere migration `workout_programs.coach_id` nullable) — Fase P2.5-B/C.
    - **Full nutrition creator en `/org/[slug]/nutrition/new`** con PlanBuilder real (requiere migration `nutrition_plan_templates.coach_id` nullable) — Fase P2.5-D.
    - Enterprise coach YA usa builders en `/coach/*`; lo que falta son links desde org dashboard hacia esos builders.
    - Ver secciones `Fase P2.5-A/B/C/D` en plan principal para tasks detalladas.

## Reglas que NO debes romper

### Package Manager
- Usar **pnpm** siempre. Nunca `npm install`, `npm run`, `yarn`.
- Comandos: `pnpm install`, `pnpm dev`, `pnpm typecheck`, `pnpm build`
- Si un paquete nuevo necesita postinstall scripts, agregarlo a `allowBuilds` en `pnpm-workspace.yaml` con comentario.

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
