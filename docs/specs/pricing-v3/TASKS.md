---
status: draft
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# TASKS — Pricing v3

Borrador: nada ejecutado. Se activa cuando el owner responda D1–D6.

## F0 — Decisiones y emergencia
- [ ] F0.1 D1 cupo de los 5 conservados (A fila actual / B congelar en `ocupa` / C estricta).
- [ ] F0.2 D2 alcance del white-label en Free (A completo / B básico).
- [ ] F0.3 D3 diferenciador de Pro («Hecho con EVA» visible en Free / solo cupo).
- [ ] F0.4 D4 vuelta a Free desde pago (escalera por fecha / override persistente).
- [ ] F0.5 D5 aviso a los 27 (mismo día / 30 días para el cupo / sin aviso).
- [ ] F0.6 D6 timing (esta semana / post-veredicto campaña 25-08).
- [ ] F0.7 `robin-coach` sobre cupo hoy (5 alumnos, cupo 3): UPDATE `max_clients = 5` con OK del owner; verificar que entra.

## F1 — Catálogo (`packages/tiers/index.ts`)
- [ ] F1.1 `TIER_CONFIG.free.maxClients = 1`, label «1 alumno con tu marca», `features` + «Branding personalizado».
- [ ] F1.2 `TIER_CAPABILITIES.free.canUseBranding = true` (según D2; si B, nuevo `canUseAdvancedBranding`).
- [ ] F1.3 `PRICING_V3_CUTOVER` + `V2_TIER_MAX_CLIENTS` + `tierMaxClientsFor` de 3 peldaños; `getRecommendedTierFor` coherente.
- [ ] F1.4 Docblocks `:14-16`, `:73-75`, `:175` reescritos (documentan la reversión de «Pro+ entero»).
- [ ] F1.5 Tests: `pricing-v2.test.ts`, `constants.test.ts`, `register/actions.test.ts`, `nutrition-pdf-brand.test.ts`, `activate-free.service.test.ts` (caso post-v3).

## F2 — Backfill LIVE
- [ ] F2.1 SQL con respaldo `_bak_pricing_v3_free_limits_<fecha>` en la misma tx; `GREATEST(1, LEAST(max_clients, ocupa))` solo Free standalone.
- [ ] F2.2 tx-rollback de prueba con conteos antes/después; aplicar; advisors; query de verificación (0 Free con `ocupa > max_clients`).
- [ ] F2.3 Renombrar el archivo de migración a la versión que registre `schema_migrations` (gotcha del MCP).

## F3 — Write-paths y lectores
- [ ] F3.1 `activate-free.service.ts:64` y `cron/trial-expiry/route.ts:61`: si `subscription_tier` ya era `free`, preservar `max_clients`; tests.
- [ ] F3.2 `ReactivateClient.tsx:74` y `_data/reactivate.queries.ts:25-26`: cupo efectivo de la columna.
- [ ] F3.3 `OverLimitBanner.tsx:63`: columna.
- [ ] F3.4 `import.actions.ts:100,185` y `api/mobile/coach/clients/import/route.ts:251`: `?? tierMaxClientsFor(tier, created_at)`.

## F4 — White-label abierto
- [ ] F4.1 Quitar `BrandUpsell` del árbol de render (`coach/settings/brand/page.tsx:26-39`, `settings/page.tsx:284-288,378-397`); decidir si el componente muere o pasa a upsell de cupo.
- [ ] F4.2 RN `app/coach/settings/brand.tsx:434-459`: pantalla gate fuera; corregir comentario «starter+».
- [ ] F4.3 `settings.actions.ts:218,263,330`: mensajes de error para el caso real que quede.
- [ ] F4.4 Política «Hecho con EVA» según D3: `email-brand.ts`, `base-layout.ts`, `nutrition-pdf-brand.ts:99-125`, `c/[coach_slug]/layout.tsx`, manifest/splash.
- [ ] F4.5 Verificar que los 5 Free con marca guardada (`pauli-coach`, `robin-coach`, `dudu`, `coach-derek`, `anais-perez`) se ven bien (logos viejos, colores extremos como `#0000ff`).

## F5 — Copy de venta
- [ ] F5.1 `PreciosSection.tsx:281` («Hasta 2 alumnos, para siempre»), `:311-318` (✗ marca → ✓), `:399,418` (pitch Pro), `:12` comentario; plural `:93-98`.
- [ ] F5.2 `landing-v2/copy.ts:93-108` (EN).
- [ ] F5.3 `/pricing/page.tsx:145,154,223`.
- [ ] F5.4 i18n `es/en.json:29,86,108-111,138`.
- [ ] F5.5 `FreeWelcomeModal.tsx:115` (✗ hardcodeado), `verify-email/page.tsx:63`, `HelpCenter.tsx:68,125,152`, `FaqSection.tsx:63`.
- [ ] F5.6 Correos: `transactional-templates.ts:193`, `drip-templates.ts:127,133`; drip día 7/14 como upsell de cupo.
- [ ] F5.7 RN: `register.tsx`, `verify-email.tsx`, `subscription.tsx`, `perfil.tsx` (derivados; verificar plural).

## F6 — Analítica
- [ ] F6.1 `upgrade_gate_hit {gate:'client_limit'}` en `clients.actions.ts` (web) y alta RN; `pricing_version: 'v3'` en `coach_registered`.

## F7 — Comunicación y docs
- [ ] F7.1 Plantilla «Tu plan Free ahora incluye tu marca» + envío a los 27 (lista desde DB, excluir test).
- [ ] F7.2 SPEC v3 → `status: active`; `pricing-v2/SPEC.md` con nota de superación; CURRENT.md; `PRODUCT_OVERVIEW.md:92` (Starter stale).
- [ ] F7.3 Memoria del asistente.

## F8 — QA y OTA
- [ ] F8.1 Preview: Free nuevo ve Mi Marca, su alumno ve la marca, `/pricing` y landing dicen 1 + marca.
- [ ] F8.2 Device: RN Free ve Mi Marca; gate de cupo al 2º alumno; Pro sin cambios.
- [ ] F8.3 OTA android+ios a runtimes 1.1.0, 1.1.1 y 1.1.2 (tags `ota/<v>-<fecha>`).
- [ ] F8.4 Verificar los 5 conservados y `robin-coach` en LIVE tras el deploy.
