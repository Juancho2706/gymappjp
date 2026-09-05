---
status: draft
owner: product-engineering
last_verified: "2026-09-05"
canonical: false
---

# SPEC — Retiro de Starter «como tal» y demolición gradual de Enterprise

> **PLAN, no código.** Escrito el 2026-09-05 (rama `rnmobiledenuevo`, HEAD `4e3f139b`) a partir de 9
> informes de lectura del repo (`packages/tiers`, billing, UI/admin/emails/mobile, DB/scripts/tests/docs,
> `apps/enterprise`+CI, superficies web `/org` `/e` `/enterprise`, workspace kinds, huella DB, mobile+packages)
> y de lecturas SOLO-SELECT en LIVE. Cero commits de producto, cero gates corridos (orden del owner: los
> gates se acumulan en [TASKS § Gates acumulados](TASKS.md)). Toda ruta/símbolo citada fue verificada con
> Grep/Read en la sesión; el SQL/TS de los bloques es **propuesto**, no aplicado.

## 0. Pedido del owner (2026-09-05, textual)

«quitáramos starter como tal del proyecto, estúdialo y también quitar enterprise poco a poco».

Dos frentes distintos, un solo SDD porque comparten el mismo modo de trabajo (retirar código muerto
sin tocar a ningún coach real) y una frontera común: `apps/web/src/domain/org/types.ts:5` define
`OrgPlan = 'starter' | 'pro' | 'enterprise'`, un tercer «starter» que **no es el tier del coach** y que
muere con Enterprise, no con Starter.

## 1. Estado de partida (evidencia)

### 1.1 Starter

| Hecho | Evidencia |
|---|---|
| Starter salió de la VENTA el 17-08 (pricing v2) pero sigue en el tipo, el catálogo y la DB | `packages/tiers/index.ts:43,51,81,167-173,227-233` (union, `SaleTier`, `SALE_TIERS` sin starter, `TIER_CONFIG.starter`, `TIER_CAPABILITIES.starter`) |
| La «wave D» de pricing v2 que iba a limpiar las superficies nunca corrió | `packages/tiers/index.ts:47-49` lo declara como pendiente |
| Ningún camino de venta acepta starter hoy | `api/payments/create-preference/route.ts:45` (`z.enum(['pro','elite'])`), `flow/confirm-enrollment/route.ts:232,251` (409), `register.actions.ts:56` (`VALID_TIERS = SALE_TIERS`), `packages/schemas/coupon.ts:18` (`COUPON_TIERS = ['pro','elite']`) |
| **LIVE 05-09: 1 sola fila starter** = `qa-e2e-coach` (persona QA de CI, 0 alumnos, 0 cobros, `payment_provider='admin'`) | SELECT sobre `coaches`; nació starter por el `z.enum` admin que aún lo acepta (`packages/schemas/coach.ts:121`) |
| **`coaches.subscription_tier` tiene `DEFAULT 'starter'` en LIVE** | `supabase/migrations/00000000000001_baseline.sql:903`; ningún INSERT del código lo omite, pero un INSERT por SQL/seed nace starter |
| El precio 19.990 vive en SQL en UNA función vigente | `admin_tier_monthly_price_clp` (`20260805211332:17-27`); los `CASE` de baseline y de `20260612130000`/`20260614130000` están sobrescritos |
| `billing_snapshots` tiene 1 cobro histórico starter (Flow 19.990, 09-07, coach hoy Pro) | historia contable; ninguna UI de finanzas lee `billing_snapshots.tier` (`finanzas.queries.ts:94-97,377`) |
| 0 cupones con scope starter en LIVE | SELECT sobre `coupons` (`applies_to_scope`) |
| Los 5 fallbacks `?? 'starter'` del informe del 06-08 ya no existen | verificados uno a uno: `proxy.ts:1143`, `mobile/lib/coach.ts:35`, `confirm-subscription:117`, `confirm-upgrade:157`, `api/pr-card:142`, `register/page.tsx:248` usan `'free'` |
| **Bug vivo hoy (VISIBLE)**: la vuelta estándar de MercadoPago llega sin `?tier` y la pantalla de confirmación pinta «Starter · Mensual» a un coach que paga Pro/Elite | `coach/subscription/processing/page.tsx:126` y `flow-processing/page.tsx:63` (fallback literal `'starter'`); el propio archivo lo confiesa en `processing:159` |
| 7 helpers de `@eva/tiers` indexan el Record SIN `?.` y revientan con un tier fuera del catálogo | `getTierPriceClp:273`, `getTierCapabilities:378`, `getTierAllowedBillingCycles:471`, `isBillingCycleAllowedForTier:477`, `getDefaultBillingCycleForTier:481`, `getTierBillingCycleSummary:486`, `getTierRank:551` — sus vecinos (`getTierMaxClients:288`, `tierMaxClientsFor`, `isBrandingAllowed:394`, `showsEvaBadge:405`) sí tienen red |
| 5 copias idénticas del parser de tier | `coach/dashboard/page.tsx:20`, `coach/guia/page.tsx:34`, `coach/layout.tsx:54`, `api/mobile/coach/dashboard/route.ts:54`, `apps/mobile/lib/coach.ts:39` |
| Código muerto colateral | `coach/subscription/_lib/tier-display.ts` (solo lo importa su test), `isMostAffordable` (`packages/tiers/index.ts:58,171`, cero lectores), `LEGACY_TIERS` (cero consumidores) |
| Starter es el ÚNICO tier con `canUseNutrition:false` y `canUseBranding:false` | al retirarlo, esas dos capabilities quedan `true` en los 5 tiers vivos ⇒ 8 gates de producción se vuelven código muerto (§4.2) |

### 1.2 Enterprise

| Hecho | Evidencia |
|---|---|
| Decisión vigente del owner: **ELIMINADO** (01-09), demolición = backlog B15 «ola propia» | `docs/status/CURRENT.md` fila Enterprise; `docs/specs/ola-de-orden/TASKS.md:68` |
| **LIVE 05-09**: 1 org (`org-prueba`, 2026-06-08), 1 `organization_members` (owner NO coach), 23 `org_audit_logs`, 12 `audit_log_checksums`, 0 filas con `org_id` en clients/exercises/foods/programs/planes, 0 coaches `org_managed`, 0 `active_org_id`, **1 `workspace_preferences` tipo `enterprise_staff` con `last_org_id`** | SELECTs de hoy |
| `apps/enterprise` (26 archivos, 1.606 LOC) es 100 % aislable: cero imports cruzados en ambos sentidos; placeholders de EAS/ASC ⇒ nunca se publicó | grep `@eva/enterprise` = solo `ci.yml:132,145` y su propio `package.json`; `app.json:36`, `eas.json:26` |
| El único amarre bloqueante de la app es `pnpm-lock.yaml` (importer `apps/enterprise:` L246-303 + subárbol `expo@54.0.36` exclusivo) | CI ×4 y **Vercel** instalan con `--frozen-lockfile` |
| Superficies web enterprise = islas de import (nadie fuera las importa) | `app/org/**` 98 archivos / 16.734 LOC · `app/enterprise/**` 30 · `app/e/**` 5 · `app/admin/(panel)/orgs/**` 5 · `api/org/**` 2 · 5 crons |
| Solo 3 símbolos compartidos bloquean borrar `services/org/org.service.ts`: `generateTempPassword`, `generateUniqueCoachSlug`, `slugify` (los usa Teams) | `admin/(panel)/teams/_actions/teams.actions.ts:7,79`, `coach/team/_actions/team.actions.ts:6,63,78` |
| Producción hoy: `enterprise.eva-app.cl` → 308 a `www` (redirect en el panel de Vercel, fuera del repo); `/org/*` → 307 `/login`; `/enterprise` → 308 `/pricing`; **`/e/org-prueba/login` → 200** (puerta abierta, sin alumnos posibles); `/legal/contrato-enterprise` → 200 (noindex) | curl 05-09 |
| Cron `audit-checksum` **programado** (`vercel.json`, domingos 02:00) sobre `org_audit_logs`: 12 checksums y un correo semanal por un producto muerto | `api/cron/audit-checksum/route.ts:24-60` |
| Retención documentada de `org_audit_logs` es falsa: `purge-data` llama al RPC `purge_old_audit_logs`, que no existe | `purge-data/route.ts:226-231`; `docs/operations/RUNBOOK.md:115` |
| El scoping «3 vías» no está centralizado: 7 resolvers duplicados + 10 copias de `applyOrgScope` (la compartida es export muerto) | ver informe E3 §2.2-2.3 |
| `enterprise_coach` en 69 archivos web (65 en `app/coach/**`), `org_managed` en 47 web / 4 mobile / 3 packages; mobile tiene 19 comparaciones `kind === 'enterprise'` en 15 archivos + 6 unions literales duplicados | conteos con `git grep` |
| Frontera compartida web↔mobile = **un archivo**: `packages/coach-nav/nav.ts` (`CoachWorkspaceType:41`, `CoachWorkspaceKind:47`) | debe cambiar en el mismo commit que la fase web de tipos |
| Nutrición V1 (congelada, NO se borra — owner 03-08) **no muere con Enterprise**: el coach standalone sigue usándola vía `apply_nutrition_template_to_client` y el cron `nutrition-cycles` | `services/nutrition.service.ts:454`, `lib/nutrition-cycle-automation.ts:71` |
| Huella DB: 12 tablas solo-org, 28 columnas de tenant (26 `org_id` + `coaches.active_org_id` + `workspace_preferences.last_org_id`), 77 policies (42 solo-org, 35 MIXTAS a reescribir), 27 funciones (12 solo-org, 15 compartidas con rama org), trigger `coaches_org_managed_guard`, JWT hook con 3 ramas org | informe E4 |
| Colateral con olor a incidente: `apps/web/scripts/enterprise-isolation-test.mjs` crea usuarios reales contra Supabase remoto con el id de Jose Fit hardcodeado (prohibido por `tests/e2e-accounts.ts:72`); nadie lo invoca | borrarlo es ganancia neta |

## 2. Decisión de diseño (jefe)

### 2.1 Starter → **OPCIÓN A: retiro total del código, con precondición de datos**

`'starter'` desaparece de `SubscriptionTier`, `SaleTier`, `TIER_CONFIG`, `TIER_CAPABILITIES`, labels,
ranks, ciclos, enums Zod de admin y scripts. **Antes** de tocar código, LIVE queda sin ninguna fila
starter (la única es la persona QA) y la columna deja de nacer starter. Así el parser tolerante que
reemplaza a las 5 copias es puro fail-safe, no una decisión de negocio.

Por qué A y no B («legacy solo-DB», como growth/scale):
- B es literalmente el estado de hoy: pricing v2 ya lo declaró y la limpieza nunca ocurrió; no hay
  presión del compilador y el grep ya falló una vez.
- A cumple el pedido («como tal») y deja que `tsc` señale los 7 sitios + 11 `Record` que hay que
  limpiar. Lista corta y cerrada.
- **growth/scale NO reciben el mismo trato**: los escribe el sistema hoy como placeholder de
  `team_managed` (`team.actions.ts:91`, `teams.actions.ts:85`) y sus capabilities son idénticas a pro/elite.
  Starter no lo escribe nadie salvo `scripts/qa-seed-team-movida.mjs:274` y el DEFAULT de la columna.

Lo que **NO** se toca (historia y DDL destructiva):
- El CHECK `coaches_subscription_tier_check` (baseline:938): `DROP CONSTRAINT` es DDL destructiva sobre
  un guard permisivo que no gatea nada (el gate real es `SALE_TIERS` + los `z.enum` de compra).
- `admin_tier_monthly_price_clp('starter') → 19990`: alimenta el MRR histórico de 12 meses.
- La fila starter de `billing_snapshots`.
- Migraciones aplicadas (incluido su texto).

### 2.2 Enterprise → demolición en **5 fases** con criterio duro por fase

Criterio de cada fase: **`typecheck` verde y producción idéntica para standalone y teams**; cada fase
es un tren propio con sus gates acumulados; ninguna fase mezcla borrado con refactor.

| Fase | Qué | Riesgo | Gate distintivo |
|---|---|---|---|
| **E0 · Regalos + congelamiento** | código muerto sin consumidores (`EnterpriseCoachLoginSchema`, `domain/org/types.ts`, `TrustStrip`, script `enterprise-isolation-test.mjs`), crons org sin scheduler (+ `package.json:41,44,45`, `scripts/run-audit-checksum-manual.mjs`), `audit-checksum` fuera de `vercel.json`, RUNBOOK corregido (`:91`, `:115`); DB **reversible sin DROP**: revoke EXECUTE de las 2 RPC sin llamador desplegado + `DISABLE TRIGGER coaches_org_managed_guard` (D5) | ~0 | vitest puntual + docs:check; en DB, tx-rollback + advisors |
| **E1 · Demolición sin runtime** | borrar `apps/enterprise` (26), `tests/enterprise` (11) + 2 specs, `seed-enterprise-demo-local.mjs`; editar `package.json` (3 scripts), `ci.yml` (sherif `-p`, comentarios), `mobile-build.yml`, `check-qa-test-lint.mjs:37`, AASA + `applinks-claims.test.ts`, 6 docs canónicos, `AGENTS.md`/`CLAUDE.md` locales. **Exige `pnpm install --lockfile-only`** (permiso del owner) | bajo | lock regenerado y revisado; sherif/actionlint; vitest `applinks-claims` |
| **E2 · Islas web** | mover 3 símbolos compartidos a `services/coach/coach-identity.service.ts` y borrar `writeWorkspaceAuditEvent` (`workspace.service.ts:267-291`, único otro importador de `org.service`); borrar `app/org`, `app/e`, `app/enterprise` (conservando los redirects de `next.config.ts:45-46`), `admin/orgs` (+ `AdminSidebar`), `api/org`, `services/org`, `org.repository` (+ barrel), `lib/enterprise`, bloques de `proxy.ts` (subdominio, guard y protección `/org`, área `/e`, `resolveOrgRouteWorkspace`), `check-org-sensitive-actions-audit.mjs`, bloque enterprise de `seed-e2e-personas.mjs` + `e2e-accounts.ts` + `E2E_PERSONAS.md`, podas en `purge-data` (3 bloques org), `mp-reconcile`, `fail-counter`, `transactional-templates`, `admin-action-catalog`, `robots.ts`, `CoachSidebar` (prop `enterpriseContext` + link a `/org`, la razón del gate de typed routes), `workspace-home.ts:4` / `workspace-route-guard.service.ts:48` (rama `enterprise_staff`), y D15. **E2.pre (LIVE, antes del deploy)**: borrar con respaldo la única fila `workspace_preferences` tipo `enterprise_staff`. **E2-bis (DB, después del deploy)**: podar el JWT hook (conservar `coach_id`), reescribir `private.student_readable_client_ids` y `private.nutrition_v2_manageable_client_ids` borrando SOLO las ramas UNION solo-org (las ramas standalone conservan `c.org_id IS NULL`) con equivalencia en tx-rollback y el fixture org cargado, revocar `get_enterprise_alumno_context` + las 2 `bulk_*` con llamador en `org.actions`; purga de `org-prueba` con respaldo `_bak_*` (D8). `get_org_branding` e `is_coach_active_org_member` se revocan recién en E3-bis (el proxy las sigue llamando bajo `clients.org_id`) | medio (proxy + hot path) | typecheck + build web (typed routes) + vitest listado + `prod-suave` al cierre |
| **E3 · Colapso de tipos** | E3-a: unificar los 7 resolvers y las 10 copias de `applyOrgScope` en `coach-scope.service.ts` (sin cambio de comportamiento). E3-b: quitar `enterprise_coach`/`enterprise_staff`/`student_enterprise` de `WorkspaceType`, `enterprise_coach` de `CoachWorkspaceType` y `enterprise` de `CoachWorkspaceKind`/`WorkspaceKind` (**web + `packages/coach-nav` en el mismo commit; mobile M1 en su tren OTA**), constant-fold de `orgId`, retiro de `org_managed` del código (sin migración), 12 puntos de riesgo Teams con edición textual exacta, 12+14 invariantes verificables. Mobile M2: borrar `enterprise-profile-analytics`, `lib/org.ts`, `org-announcements` + banner, gates `orgScoped` del alumno | alto para Teams (Movens en prod) | typecheck web + tsc mobile (GitHub) + ~33 suites + QA de device del owner |
| **E4 · DROP en DB** | reescribir 35 policies mixtas + 5 CHECK + 2 índices compuestos; drop de 42 policies, 12 funciones, trigger, 28 columnas, 12 tablas; regen `database.types.ts` (arrastra la prioridad 10 de CURRENT: 13 errores V1) | alto y **bloqueado por el código**: 186 archivos leen `org_id` (`.is('org_id', null)` es parte de la identidad de standalone/team) | **Recomendación: postergar indefinidamente**; las columnas `org_id` quedan como NULL muertos |

Orden: E0 → E1 → E2 → E2-bis → E3 → (E4 solo si el owner lo pide con costo aceptado). Starter puede ir
en paralelo a E0/E1 (archivos disjuntos) y conviene que vaya **primero**: es más chico y cierra un
bug visible de checkout.

## 3. Alcance de ESTA ola (lo que se ejecuta cuando el owner apruebe)

1. **Starter completo** (S0 DB aditivo → S1 blindaje → S2 retiro del tipo → S3 superficies/tests/docs → OTA).
2. **Enterprise E0 + E1** (regalos, congelamiento reversible, demolición sin runtime).
3. **Enterprise E2** queda planificado en TASKS con archivo:línea, pero se ejecuta como tren aparte
   después del push de S+E0+E1 (toca `proxy.ts` y el hot path del alumno).
4. E3 y E4: planificados a nivel de fase e invariantes; su TASKS fino se escribe al abrir su tren.

## 4. Fuera de alcance (explícito)

### 4.1 No se hace nunca en este SDD
- Borrar nutrición V1 (decisión owner 03-08). `NutricionTabV1` en RN (~790 líneas) queda inalcanzable
  tras E3/M2: **decisión del owner** conservarlo o borrarlo.
- Editar migraciones aplicadas, `DROP CONSTRAINT` del CHECK de tiers, borrar filas de `billing_snapshots`.
- Tocar `growth`/`scale`.
- Tocar `docs/archive/**`, `docs/audits/**`, specs cerradas (solo notas de superación).
- `docs/legal/tos.md` §3.2/§12 (texto legal publicado, LEGAL-01 pendiente de revisión jurídica).

### 4.2 Ola aparte con mockup (VISIBLE): «solo cupo + sello»
Con Starter fuera, `canUseNutrition` y `canUseBranding` son `true` en los 5 tiers ⇒ quedan muertos:
`nutrition-plans/page.tsx:45`, `create-preference/route.ts:171,447` (`NUTRITION_ADDON_ON_DOWNGRADE`),
`flow/confirm-enrollment/route.ts:270`, `SubscriptionContent.tsx:831`, `register.actions.ts:423,430`,
`mobile settings.tsx:320`, y las filas «Branding: Incluida / No incluida» de `PlanStep.tsx:171`,
`SummaryStep.tsx:69` y `apps/mobile/app/(auth)/register.tsx:449`. Además `canCreateCustomExercises` y
`canImportClients` **ya son `true` en los 6 tiers hoy** ⇒ `UpsellGate.tsx:64-75` y los 6 gates de
exercises/import no gatean nada. Es exactamente la regla del owner del 31-08 («TODO en todos los
planes; solo se cobra cupo»), pero cambia lo que ve el coach en el alta ⇒ **mockup antes**. En esta ola
solo se deja `TIER_CAPABILITIES` consistente y se anota la deuda.

## 5. Decisiones que necesita el owner (antes de ejecutar)

> Los críticos del 05-09 (3 lentes, 30 hallazgos, 27 sobrevivieron a la refutación) ya están
> incorporados: el juicio del jefe está en [TASKS § Juicio del jefe](TASKS.md).

| # | Decisión | Opciones (la 1.ª es la recomendada) |
|---|---|---|
| D1 | Destino de `qa-e2e-coach` (única fila starter) | **A** `pro` / `max_clients 25` (los smokes abren paneles; un smoke futuro que cree 1 alumno no choca con cupo 1) · B `free` / 1 |
| D2 | `processing` / `flow-processing` sin `?tier` válido (bug visible hoy; desde A5 el `back_url` de MP ya trae `tier\|cycle`, `create-preference/route.ts:531-537`, así que solo afecta preapprovals viejos y URLs manuales) | **A** sin tier ⇒ sin chip; si además `from=register` no se inventa plan para el POST: error honesto con salida a `/pricing` · B fallback visual `'pro'` (miente) · C leer la fila del coach después de que el poll confirme (descartada por los críticos: durante el poll la fila aún trae el plan anterior) |
| D3 | CHECK `coaches_subscription_tier_check` | **A** dejarlo permisivo · B reescribirlo en ola posterior con `NOT VALID` + `VALIDATE` |
| D4 | Ola «solo cupo + sello» (§4.2) | **A** ola aparte con mockup · B incluirla ahora · C no hacerla |
| D5 | Congelamiento DB de E0 | **A** revoke EXECUTE de las 2 RPC sin llamador desplegado (`assign_org_client_to_coach`, `bulk_reassign_clients`) + `DISABLE TRIGGER coaches_org_managed_guard` (todo reversible, cero DROP) · B solo revoke · C nada de DB hasta E2. Los 6 índices `org_id` NO se tocan: son cobertura de FK (`20260617031230`) y mueren con las columnas en E4 |
| D6 | `pnpm install --lockfile-only` para E1 | **A** autorizado, una sola corrida, diff del lock revisado · B no (E1 se posterga) |
| D7 | Cron `audit-checksum` (correo semanal al owner) | **A** desprogramar y borrar en E0 · B dejar hasta E2 |
| D8 | `org-prueba` + 23 `org_audit_logs` + 12 checksums + 1 `workspace_preferences` | **A** respaldo `_bak_*` con RLS + purga en E2-bis · B conservar hasta E4 · C exportar JSON y purgar |
| D9 | `/legal/contrato-enterprise` (200, noindex, sin enlaces vivos) | **A** dejarla dormida · B borrar la página (el template `.md` queda como insumo de LEGAL-03) |
| D10 | E3 (colapso de tipos) | **A** tren propio después de E2 con QA de device · B junto con E2 |
| D11 | E4 (DROP columnas/tablas) | **A** postergar indefinidamente · B planificar tras E3 aceptando 186 archivos + regen de tipos |
| D12 | `NutricionTabV1` en RN tras M2 | **A** conservar (V1 no se borra) · B borrar |
| D13 | AASA: quitar el appID `cl.evaapp.eva-enterprise` | **A** en E1 (no hay binario en tiendas) · B dejar |
| D14 | Copy del switcher de espacios (`ws.type.replace(/_/g,' ')` ⇒ «coach standalone») | **A** mockup en E3 con copy humano · B dejar |
| D15 | `app_metadata.requires_password_change` que Teams estampa al crear coaches (`teams.actions.ts:72`, `team.actions.ts:69`) y cuyo único lector (`proxy.ts:463-473`, bloque `/org`) y limpiador (`api/org/clear-password-requirement`) mueren en E2 — hoy ya es una bandera muerta e imborrable | **A** dejar de estamparla en E2 y limpiar las existentes en E2-bis (ARREGLA) · B reimplementar el forzado de cambio de clave en `/coach/*` (AGREGA, extra a estudiar) |

## 6. Reglas de ejecución (heredadas, no negociables)

- Solo pnpm; nunca `db push` ciego; migraciones nuevas aditivas/idempotentes/forward-only con bloque
  `ROLLBACK:` en el encabezado (patrón `20260905190100`); protocolo tx-rollback → aplicar → advisors → verificación.
- Ningún gate se corre en la sesión de escritura; se acumulan en TASKS y corren una vez, antes del push.
- Cambios VISIBLES para coach/alumno/admin ⇒ mockup del jefe y aprobación; INVISIBLES se declaran.
  Cada tren abre con una tarea «Mockup-lote» (S2.0, E2.pre-mockup, E3.0) que fija la lista cerrada de
  superficies visibles; lo que solo sería visible con filas que LIVE no tiene (0 starter tras S0, 0 coaches
  `org_managed`) se etiqueta «VISIBLE en teoría, declarada» y no exige mockup.
- Workers: Sonnet para swaps textuales con lista cerrada (comentarios, constant-folds), Opus para lo
  guiado por informe; el jefe juzga cada wave.
- `docs/status/CURRENT.md` ≤ 16 KB (hoy 13.249 B): la crónica va a este SDD, no ahí.
