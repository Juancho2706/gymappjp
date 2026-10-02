---
status: in-progress
owner: product-engineering
last_verified: "2026-10-02"
canonical: false
---

# SPEC — Pricing v4: Pro = 2–10 alumnos · Elite = 11–60 · grandfather por compra

**Estado: EN PRODUCCIÓN 2026-10-02 (migración LIVE + `master` = `5ecfefa1`, `dpl_DV5bcr6Z…`). Faltan el OTA de RN (solo textos) y la QA con compra real. Pasos en [TASKS](TASKS.md).**

## Origen

Propuesta del socio, traída por el owner el 2026-10-02 (textual): «pasemos pro a 2-10 alumnos y elite
de 11 a 60 alumnos y que los que ya tienen PRO o han comprado PRO actual o ELITE se quedan con los
límites actuales, son los nuevos PRO y ELITE».

Reemplaza parcialmente a [pricing-v3](../pricing-v3/SPEC.md): Free sigue en 1 alumno con marca propia y el
sello «Hecho con EVA»; cambia el cupo de venta de Pro (25 → 10) y el rango que se muestra de Elite
(26–60 → 11–60, el techo sigue en 60).

## Decisiones del owner (2026-10-02)

| # | Decisión | Elegida | Consecuencia |
|---|---|---|---|
| D1 | ¿A quién se le respeta el cupo viejo? | **A — por compra** | Solo quien tiene o tuvo un plan pago al corte. Un Free registrado antes que compra Pro después del corte recibe 10 (no 25/30 por fecha, como en v2/v3) |
| D2 | Etiqueta de Pro | **«2–10 alumnos»** | `TIER_STUDENT_RANGE_LABEL.pro`; landing, /pricing e i18n derivan el rango del catálogo |
| D3 | Precios | **Sin cambio** | Pro $29.990 · Elite $44.990 (planes Flow/MP intactos) |
| D4 | Fecha de corte | **El instante en que corre la migración (día del deploy)** | No hay constante de fecha en código: la marca `paid_caps_grandfathered` es el dato |

## Reglas de producto

1. **Catálogo de venta**: Free $0 · 1 alumno · Pro $29.990 · 2–10 · Elite $44.990 · 11–60.
2. **Grandfather por compra**: todo coach con plan pago (pro/elite/growth/scale, cualquier status) o con un
   cobro real de plan pago en `billing_snapshots` al momento del corte queda marcado
   `coaches.paid_caps_grandfathered = true` y conserva **para siempre** los cupos pagos previos al
   renovar, cambiar de plan o recomprar tras cancelar: pro 30 (alta antes del 2026-08-18) o 25; elite
   100 o 60.
3. **Todos los demás** (Free de hoy incluidos, sin importar su fecha de alta, y todo coach nuevo) compran
   con el catálogo v4: pro 10, elite 60.
4. **Free no cambia**: la escalera de fecha 3 / 2 / 1 de v2/v3 sigue igual, también para un ex-pagador que
   vuelve a Free.
5. **Ningún coach cambia de cupo por la migración**: no se toca `max_clients` de nadie.

## Modelo técnico

- Columna nueva `coaches.paid_caps_grandfathered boolean NOT NULL DEFAULT false`
  (`supabase/migrations/20261002120000_pricing_v4_paid_caps_grandfathered.sql`). `authenticated` la lee
  (SELECT a nivel tabla) y **no** la puede escribir (UPDATE solo por columna, lista blanca de marca):
  un coach no puede auto-marcarse.
- `tierMaxClientsFor(tier, createdAt, paidCapsGrandfathered)` (`packages/tiers/index.ts`): el tercer
  parámetro es **obligatorio** para que el compilador obligue a cada sitio a decidir.
  - tier pago + `false` ⇒ `TIER_CONFIG` (pro 10 / elite 60).
  - tier pago + `true` ⇒ escalera pagada previa (pre-v2 30/100 · desde v2 25/60).
  - `null`/`undefined` ⇒ como `true` (fail-safe generoso; solo lo usan fallbacks de lectura cuyo select
    ya trae `max_clients`, que es NOT NULL).
  - free ⇒ escalera de fecha sin cambios.
- `getRecommendedTierFor(count, createdAt, paidCapsGrandfathered)`: mismo criterio (banner de billing,
  correos de trial-expiry y envío admin).
- **Write-paths que leen la marca de la fila**: `lib/payments/webhook-pipeline.ts` (activación,
  renovación y upgrade one-shot), `api/payments/confirm-subscription`, `confirm-upgrade` (vía
  `fetchCoachBillingRow`), `flow/confirm-enrollment`, `create-preference` (escritura + guard
  OVER_CAPACITY de downgrade).
- **Lectores que proyectan otro tier** (necesitan la marca para no mentir): `/coach/subscription`
  (`subscription-status` → `SubscriptionContent`), `/coach/reactivate` (`reactivate.queries` →
  `ReactivateClient` → `effectiveTierLimit`), `OverLimitBanner` (vía `getCoach`), `BillingBanners`
  (antes usaba `getRecommendedTier` sin grandfather).
- Panel admin: casilla «Cupo antiguo (pricing v4)» en el panel del coach para marcar/desmarcar a mano (cortesías, casos de borde).
- Copy de venta derivado del catálogo: `PreciosSection.tsx`, `landing-v2/copy.ts`, `/pricing/page.tsx`,
  `i18n/es.json` + `en.json` (`landing.pricing.plan.pro|elite.desc`). Correos de drip/bienvenida y la
  página de nutrición ya leen `TIER_CONFIG.pro.maxClients` ⇒ dicen 10 solos.
- RN: lee el catálogo de `packages/tiers` (labels, cupo de registro) ⇒ OTA. Los gates reales de RN usan
  la columna `max_clients`; RN no tiene flujos de compra (guideline 3.1.1), así que no necesita la marca.
- `docs/legal` sin cambios: el §7 ya dice que una suscripción vigente conserva sus condiciones.

## Datos al 2026-10-02 (LIVE, solo lectura)

Pro 15 (7 con `max_clients 30`: josefit, jotap-coach, joaquinamr7, olympuswolf [canceled], movida-la2yw4,
diegostraubefit, evademo · 8 con 25: erikglift, gabriel, movens, roco-ads, qa-e2e-coach, felipe,
happy-training, jotap-team). Elite 1 (fraga-gym, 60). Ningún Free tiene cobros de plan pago
(s-v-coach, ljfitness y nexo-performance solo iniciaron checkouts). Backfill esperado: **16 filas**.

## Invariantes

- Ningún coach pierde cupo ni alumnos por el cambio.
- Ningún pagador al corte baja de cupo en una renovación posterior.
- Un solo catálogo (`packages/tiers`); el copy de venta deriva de él.

## Fuera de alcance

Precios, Free, Teams/Enterprise, fichas de tiendas, aviso por correo (no hay a quién avisar: a los
pagadores no les cambia nada y los Free no tenían precio comprometido).
