# TASKS — Pricing v2 (worker-ready)

Convenciones de la casa. Prerrequisito: Sello v2 commiteado (adyacencia en layouts).
Referencia de sitios exactos (file:line): informe del worker repo en el artifact
«Precios EVA v2» — el worker DEBE re-verificar cada línea contra el árbol actual.

## Wave A — catálogo + grandfather

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| A1 | Opus | `packages/tiers/index.ts` + tests | `PRICING_V2_CUTOVER` (fecha del deploy, ISO) + `tierMaxClientsFor(tier, coachCreatedAt)` (viejo 3/10/30/100, nuevo 2/10/25/60 — starter conserva 10 en ambos, no se vende); `TIER_CONFIG.maxClients` pasa a los NUEVOS (free 2, pro 25, elite 60); free capabilities: `canCreateCustomExercises`, `canImportClients` a true (`canUseNutrition` de free: true — revisar los 3 usos de venta para que el copy no mienta); `SALE_TIERS` sin starter. Tests: helper × fechas antes/después × 4 tiers; snapshot de capabilities. | vitest paquete verde; tsc web+mobile verdes. |
| A2 | Opus | `services/entitlements.service.ts` + tests | `hasPaidModuleAccess` deja de exigir `tier != 'free'` (standalone activo ⇒ módulos ON); `deriveModulesForPaidAccess` aplica a free; compra del addon `nutrition_exchanges` se retira de la UI de addons (las cortesías admin_grant intactas). | vitest verde; `assertModule` sigue negando a coach INACTIVO. |

## Wave B — escritores/lectores de límite + cerco

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| B1 | Opus | `activate-free.service.ts`, `api/cron/trial-expiry`, `services/billing/capacity.service.ts`, confirms/webhooks que escriban `max_clients`, `CoachCommandPanel`/coach-actions admin | TODO write/read de límite pasa por `tierMaxClientsFor(tier, coach.created_at)`; muere el 3 hardcodeado de trial-expiry y el `freeLimit` plano de activate-free. Tests: coach creado 2026-01 reactivando a free ⇒ 3; coach nuevo ⇒ 2; pro viejo en OVER_CAPACITY con 28 alumnos ⇒ NO over (límite 30). | vitest verde. |
| B2 | Opus | `clients.actions.ts`, `api/mobile/coach/clients/route.ts`, `client-archive.service.ts` | El fallback de lectura `coach.max_clients ?? getTierMaxClients(tier)` pasa al helper con `created_at` (la columna sigue ganando). | vitest + tsc mobile verdes. |
| B3 | Opus | `join.actions.ts` + tests | P7: el join por invite cuenta activos vs límite ANTES del insert (scope team/enterprise incluido — el tope del coach vale también ahí; si team maneja su propio cupo, documentarlo y gatear por el que aplique). | test rojo→verde del hueco. |

## Wave C — starter fuera (mecánico)

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| C1 | Sonnet | ~35 sitios `?? 'starter'` (lista del informe; re-grep `\?\? .starter.` COMPLETO) | Todos a `?? 'free'`. NO tocar lógica adyacente. | grep final `\?\? .starter.` = 0 hits; tsc web+mobile verdes. |
| C2 | Sonnet | `api/payments/create-preference` (z.enum), `api/payments/flow/confirm-enrollment` (guard), `packages/schemas/coupon.ts` | Compras y cupones nuevos sin starter (enum `['pro','elite']`); canje de cupón starter EXISTENTE: rechazar con mensaje claro (decisión pendiente #4 anotada — si el dueño luego quiere migrar a pro, es un cambio local). Tests de rechazo. | vitest verde. |

## Wave D — superficies

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| D1 | Opus | `app/pricing/page.tsx`, `LandingPricingPreview.tsx`, register web | 3 planes; el agrupado (starter+pro) de /pricing muere; copy free = «Todo EVA · 2 alumnos · sin marca propia» (bullets por plan revisados: nutrición/módulos aparecen incluidos en TODOS); JSON-LD verificado sin starter. Capturas 390/1280 light+dark. | tsc + capturas. |
| D2 | Opus | `/coach/reactivate` web + espejo RN, `SubscriptionContent` | Estructura nueva; la salida «plan gratuito» muestra EL límite del coach (helper con created_at: viejo ve 3, nuevo 2); sin starter como destino de cambio. | tsc web+mobile. |
| D3 | Sonnet | upsell/upgrade (`upgradeRequired` mail + CTAs) | Copy apunta a Pro; sin menciones de starter en textos de venta (grep starter en es-CL strings). | grep de copy limpio. |

## Wave E — medición

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| E1 | Sonnet | `/pricing`, flujo checkout web | PostHog `pricing_viewed`, `pricing_plan_clicked(tier)`, `checkout_started`, `checkout_confirmed` — mismo gate de consentimiento del patrón existente (mirar MetaPixel/PostHog consent). | eventos visibles en dev; tsc. |

## Cierre (jefe + dueño)

| ID | Quién | Qué |
|---|---|---|
| F1 | jefe | Gates completos + juicio + capturas + `CURRENT.md` + docs:check + commit/push |
| F2 | dueño | QA: landing//pricing/register 3 planes · reactivate grandfather · un free nuevo ve módulos · decisiones pendientes 1-7 de la SPEC |
