---
status: in-progress
owner: product-engineering
last_verified: "2026-10-02"
canonical: false
---

# TASKS — Pricing v4

Decisiones cerradas el 2026-10-02: **D1=A (grandfather por compra) · D2 «2–10 alumnos» · D3 precios
sin cambio · D4 corte = migración del día D**. Ver [SPEC](SPEC.md).

## W1 — Catálogo (`packages/tiers/index.ts`)
- [x] `TIER_CONFIG.pro.maxClients = 10`; `TIER_STUDENT_RANGE_LABEL` pro «2–10 alumnos», elite «11–60 alumnos».
- [x] `tierMaxClientsFor(tier, createdAt, paidCapsGrandfathered)` con tercer parámetro obligatorio; `getRecommendedTierFor` igual.
- [x] Tests: `pricing-v4.test.ts` (nuevo), `pricing-v2/v3.test.ts` y `constants.test.ts` ajustados.

## W2 — DB
- [x] Migración `20261002120000_pricing_v4_paid_caps_grandfathered.sql` (columna + backfill). Simulada con SELECT en LIVE: 16 filas (15 pro + 1 elite).
- [x] `database.types.ts` con la columna.

## W3 — Write-paths y lectores (web)
- [x] Webhook pipeline (activación, renovación, upgrade), `confirm-subscription`, `confirm-upgrade`, `flow/confirm-enrollment`, `create-preference` leen la marca de la fila.
- [x] `/coach/subscription`, `/coach/reactivate`, `OverLimitBanner`, `BillingBanners`, correos de trial-expiry y envío admin proyectan con la marca.
- [x] Fallbacks de lectura (`max_clients ?? …`) y sitios solo-Free pasan `null` explícito.
- [x] Tests del webhook: renovación de pro marcado ⇒ 25; pro sin marca ⇒ 10; Free viejo sin marca que compra ⇒ 10.

## W3b — Panel admin
- [x] Coaches › panel del coach: casilla «Cupo antiguo (pricing v4)» en Editar (lee la marca al abrir con `getCoachPaidCapsGrandfatheredAction`; el form solo la envía si se pudo leer) + fila en Info. El selector de tier y la casilla sugieren el «Max alumnos» que el write-path le grabaría a ESE coach. Queda en `admin_audit_logs` vía `coach.update`.

## W4 — Copy
- [x] Landing v2 (`PreciosSection.tsx`, `copy.ts` EN), `/pricing`, i18n ES/EN: rangos derivados del catálogo.

## W5 — Día D (en este orden)
- [ ] **D.1** Aplicar la migración en LIVE (`apply_migration`) **antes** del deploy web: el código nuevo selecciona la columna. Verificar con las queries del pie del archivo (elite/true 1 · pro/true 15).
- [ ] **D.2** Merge + deploy web (landing, /pricing, panel y pagos en el mismo deploy).
- [ ] **D.3** Re-run de seguridad post-deploy, por si alguien compró Pro con el código viejo entre D.1 y D.2:
  ```sql
  update public.coaches set paid_caps_grandfathered = true
   where paid_caps_grandfathered = false and subscription_tier = 'pro' and max_clients > 10;
  ```
- [ ] **D.4** OTA a los runtimes vivos de RN (labels y cupo de registro salen de `packages/tiers`).
- [ ] **D.5** QA en prod: `/pricing` y la landing muestran Pro «2–10» y Elite «11–60»; un coach Free de prueba que compra Pro queda con `max_clients = 10`; la fila de un Pro existente sigue en 25/30 tras su próxima renovación.
