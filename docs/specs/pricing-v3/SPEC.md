---
status: draft
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# SPEC — Pricing v3: Free = 1 alumno con white-label · Pro = 25 + todo

**Estado: BORRADOR. Nada ejecutado. Requiere las decisiones D1–D6 del owner antes de código.**

## Origen

Propuesta del socio (Jean Pierre), traída por el owner el 2026-08-21 (textual): «dejemos el free a 1
persona y con whitelabel, el pro solo tendría todo y alumnos claro como siempre (…) los que están free
ahora con más de 1 déjalos con ese límite, o sea los que tienen límite de 3 o 2 y tengan esos alumnos,
déjalos así, pero si hay gente free con 0 o 1 alumno dejarlos con el nuevo free».

Reemplaza parcialmente a [pricing-v2](../pricing-v2/SPEC.md) (17-08): mantiene Pro 25 / Elite 60 y el
grandfather de los pagadores; cambia Free (2 → 1) y **revierte la regla «branding = Pro+ entero»**
(decisión CEO 2026-06-21, escrita en `packages/tiers/index.ts:73,175`, `pricing-v2/SPEC.md:21,48` y
`docs/archive/specs/whitelabel-v2/PLAN.md:5`). Esta SPEC es la documentación explícita de esa reversión.

## Problema que ataca

- 32 coaches Free reales al 21-08: **16 nunca cargaron un alumno, 11 tienen exactamente 1, 5 tienen ≥2**.
- **0 de 32 Free inició jamás un checkout** (`subscription_events` solo tiene filas de los 4 pagadores
  self-serve). El tope de 2/3 nunca convirtió: el cuello es activación, no cupo.
- El anuncio activo `AD_CoachingEvoluciono_21s` vende «con tu propia marca»; el registro Free hoy no la
  entrega (overclaim).

La apuesta: el coach Free siente que ya tiene «su app» (marca propia) y el paywall llega en el 2º alumno,
que en los datos históricos aparece en horas, no en días, cuando aparece.

## Reglas de producto (propuestas)

1. **Catálogo de venta**: Free $0 · 1 alumno · todo EVA · white-label · Pro $29.990 · 25 alumnos · todo
   · Elite $44.990 · 60. Starter sigue fuera de venta.
2. **Grandfather por USO, no por fecha**: todo coach Free existente con **≥2 alumnos no archivados**
   conserva su cupo (D1 decide si el de su fila o el congelado en lo que tiene); todo Free con 0–1
   pasa a cupo 1. Ningún coach pierde un alumno ya cargado.
3. **Pagadores intactos**: los 5 Pro tienen `max_clients = 30` grabado y no se tocan. Elite sin cambios.
4. **White-label en Free** (alcance según D2): se abre `TIER_CAPABILITIES.free.canUseBranding`; las
   columnas de marca ya tienen `GRANT UPDATE` a `authenticated` (migración 20260612140000) ⇒ cero DDL.
5. **Diferenciador de Pro** (D3): cupo 25 + «sin rastro de EVA» (Free muestra «Hecho con EVA» visible en
   app del alumno, PDF y correos).
6. **Vuelta a Free desde un plan pago** (D4): cupo por escalera de fecha (1 post-v3); si tiene más
   activos, la pantalla de reactivación exige archivar (comportamiento ya vigente).
7. **Aviso** (D5): correo a los 27 Free afectados el día del cambio; los ToS (`docs/legal/tos.md:42-47`)
   hablan de 30 días de aviso para cambios de límites — nadie pierde alumnos, pero 11 pierden holgura.

## Modelo técnico

- `coaches.max_clients` es `integer NOT NULL DEFAULT 10` y **gana en todos los gates reales** (alta
  manual, invite, desarchivar, import, proxy duro, RN). `tierMaxClientsFor(tier, created_at)` solo
  decide qué se ESCRIBE en activaciones/bajadas y es fallback si el select omite la columna.
- Escalera de fecha nueva: `PRICING_V2_CUTOVER` (2026-08-18) y `PRICING_V3_CUTOVER` (fecha del deploy):
  pre-v2 ⇒ 3 · entre ⇒ 2 · post-v3 ⇒ 1. Se usa en write-paths y como fallback; **no** expresa el
  grandfather por uso — ese vive en la columna vía backfill.
- Backfill (una vez, service_role, con protocolo tx-rollback → aplicar → advisors):
  `UPDATE coaches SET max_clients = GREATEST(1, LEAST(max_clients, ocupa))` para Free standalone, donde
  `ocupa` = alumnos `is_archived = false` sin `org_id`/`team_id` (`capacity.service.ts:15,30`). Con D1=B,
  los 5 conservados quedan en `ocupa` (robin 5, dudu 3, gabriel 2, jesus 2, kut 2).
- Write-paths que recalculan por fecha y pueden pisar el grandfather: `activate-free.service.ts:64`,
  `api/cron/trial-expiry/route.ts:61` ⇒ si el coach ya era Free, preservar la columna.
- Lectores que miran la fecha en vez de la columna y hay que corregir: `ReactivateClient.tsx:74`,
  `OverLimitBanner.tsx:63`; drift previo `import.actions.ts:100` (`?? 10`), `:185` y
  `api/mobile/coach/clients/import/route.ts:251` (catálogo sin grandfather).
- White-label: ~30 consumidores de `isBrandingAllowed` se apagan solos; a mano: `BrandUpsell`, badge
  «Pro» del hub (`coach/settings/page.tsx:284-288,378-397`), pantalla gate RN
  (`app/coach/settings/brand.tsx:434-459`), 3 errores de servidor en `settings.actions.ts:218,263,330`,
  ~14 textos «desde el plan Pro», política «Hecho con EVA» (`email-brand.ts`, `nutrition-pdf-brand.ts`,
  layout `/c`, manifest).
- Copy de venta: `PreciosSection.tsx:281,311-318,399,418`, `landing-v2/copy.ts:93-108`,
  `pricing/page.tsx:145,154,223`, i18n `es/en.json:29,86,108-111`, `FreeWelcomeModal.tsx:115`,
  `HelpCenter.tsx:68,125,152`, `transactional-templates.ts:193`, `drip-templates.ts:127,133`, plural
  «1 alumnos» en `PreciosSection:93-98`, `FaqSection:63`, `HelpCenter:152`, `verify-email:63`.
- Analítica: emitir `upgrade_gate_hit {gate:'client_limit'}` (hoy sin call-site) + prop `pricing_version`.
- RN: lee capacidades de `packages/tiers` ⇒ OTA a los tres runtimes (1.1.0 / 1.1.1 / 1.1.2).

## Invariantes

- Ningún coach pierde un alumno ya cargado ni queda sobre cupo por el cambio (el backfill nunca baja
  por debajo de `ocupa`).
- Ningún pagador cambia de cupo ni de features.
- Un solo interruptor de branding; un solo catálogo (`packages/tiers`); copy derivado donde ya lo era.
- Landing, `/pricing`, i18n, app y correos cambian en el MISMO deploy.

## Fuera de alcance

Precios, Elite, Teams/Enterprise, Starter, el flujo de solicitudes de `/join` (spec coach-leads),
fichas de tiendas (no mencionan cupos).

## Datos de respaldo (21-08, LIVE, excluidos evademo/josefit)

37 coaches: 5 Pro (todos `max_clients 30`), 32 Free (19 con 3, 13 con 2, 0 null, 0 trial). Free con
≥2 alumnos: 5. Con 1: 11. Con 0: 16. Free con marca ya guardada: 5. `robin-coach` está sobre cupo hoy
(5 alumnos, cupo 3). Altas Free semana del 17-08: 14 (vs 6 en las 7 semanas previas). ~6% de las altas
históricas llegaron al 2º alumno en 2 semanas.
