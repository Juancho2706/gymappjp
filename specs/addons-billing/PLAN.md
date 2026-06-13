# PLAN — Billing de add-ons self-service

**Status:** DRAFT
**Owner:** Juan V.
**Last updated:** 2026-06-12
**Spec:** `specs/addons-billing/SPEC.md`
**Plan maestro:** `docs/plans/estrategia/05-PLAN-billing-addons-selfservice.md` (fuente de verdad de fases F0-F7, decisiones D1-D8 y matriz QA)

---

## Architecture

Capas según pilares (CLAUDE.md): `domain/` puro → `infrastructure/db/` (repository service-role)
→ `services/` (lógica de cobro) → `app/api/payments/*` (REST, no server actions — D7) y
`app/coach/subscription/*` (UI client). La fuente de verdad de entitlements pagados es la tabla
`coach_addons`; `coaches.enabled_modules` se SINCRONIZA desde ella por trigger de DB (D1, cero
drift por construcción). El monto compuesto (plan base + add-ons) vive en un único helper
(`getCompositeAmountClp`) que consumen create-preference, el PUT de monto, la UI y los tests.

```text
app/coach/subscription/_data | app/coach/reactivate/_data
  -> app/api/payments/{addons,addons/cancel,subscription-status,create-preference,webhook}
  -> services/billing/addons.service.ts
  -> infrastructure/db/coach-addons.repository.ts (service-role)
  -> Supabase (coach_addons + trigger sync_coach_enabled_modules + billing_snapshots)
```

Decisiones técnicas (juzgadas en el plan maestro; NO se re-litigan): D1 trigger de sync;
D2 override CEO como fila `admin_grant` write-through; D3 congela el mensual de lista, deriva
el ciclo con los descuentos del plan; D4 alta bifurcada por ciclo; D5 DB-primero + reversión
en el mismo request; D6 reconcile diario; D7 endpoints REST; D8 requisitos de compra (plan pago
activo, `nutrition_exchanges` exige tier con nutrición).

## Files

| Action | Path | Notes |
|---|---|---|
| UPDATE | `apps/web/src/lib/constants.ts` | **F0 (este branch):** `ADDON_CONFIG` ($9.990 uniforme) + `ADDON_PAYMENT_RULES` (`v1-2026-06`, variantes por ciclo) + `getAddonPaymentRulesForCycle`. Hecho. |
| CREATE | `supabase/migrations/<ts>_coach_addons_selfservice_billing.sql` | F1. Tablas `coach_addons` + `billing_snapshots` + RLS solo-SELECT propio + trigger `sync_coach_enabled_modules`. Aditiva/idempotente, timestamp posterior al gate Movida. NO se aplica en esta tanda. |
| UPDATE | `apps/web/src/lib/database.types.ts` | F1. Tipos de `coach_addons`/`billing_snapshots` extendidos A MANO (patrón gate Movida) — regenerar es tarea del gate post-merge. |
| CREATE | `apps/web/src/domain/billing/types.ts` | F2. `CoachAddon`, `AddonStatus`, `AddonSource` (puros). |
| CREATE | `apps/web/src/infrastructure/db/coach-addons.repository.ts` (+barrel) | F2. CRUD service-role. |
| CREATE | `apps/web/src/services/billing/addons.service.ts` | F2. Catálogo, `getAddonCycleAmountClp`, `getAddonProrationClp`, `isAddonBillable`, `getCompositeAmountClp`, `activateAddonForCoach`, `materializeAddonFromOneShot`, `requestAddonCancellation`, `canPurchaseAddon`. |
| UPDATE | `apps/web/src/lib/payments/checkout-external-reference.ts` | F2. 4ª parte opcional `addon1+addon2` (backward-compatible). |
| UPDATE | `apps/web/src/lib/payments/{types.ts,providers/mercadopago.ts}` | F3. `updateCheckoutAmount`, `createOneShotPayment`. |
| UPDATE | `apps/web/src/app/api/payments/create-preference/route.ts` | F3. Monto compuesto + add-ons del signup validados (espejo D8). |
| UPDATE | `apps/web/src/app/api/payments/webhook/route.ts` | F3. Materialización (preapproval+one-shot), `markFirstCharged`, evento `updated`, snapshots, terminal. |
| UPDATE | `apps/web/src/app/api/payments/{cancel-subscription,subscription-status}/route.ts` | F3/F4. cancel-subscription → `cancel_pending` add-ons; subscription-status → `addons` + `billing`. |
| CREATE | `apps/web/src/app/api/payments/addons/{route.ts,cancel/route.ts}` | F4. Alta/baja (Zod + rate-limit + guards + email). |
| UPDATE | `apps/web/src/app/api/cron/mp-reconcile/route.ts` + `vercel.json` | F3. Diario + pasada add-ons (expiry, drift, kill-switch, paused). |
| UPDATE | `apps/web/src/lib/email/send-email.ts` (recibos) · `apps/web/src/lib/posthog/events.ts` (funnel) | F4/F5. |
| UPDATE | `app/coach/subscription/{page.tsx,processing/page.tsx}` · `app/coach/reactivate/*` · `app/(auth)/register/*` · `ModuleOffNotice` + 4 páginas de módulo · `app/admin/(panel)/coaches/_actions/coach-actions.ts` · /admin métricas | F5/F6. |
| CREATE | `tests/billing/{coach-addons-rls.sql,addons-flow.spec.ts}` · `apps/web/src/services/billing/addons.service.test.ts` · `checkout-external-reference.test.ts` | F1/F2/F5. |
| CREATE | `specs/addons-billing/{SPEC.md,PLAN.md,TASKS.md,SANDBOX-CHECKLIST.md}` | **F0 (este branch).** |

## Data Model

- **DB changes:** migración aditiva (F1). `coach_addons` (fuente de verdad de entitlements
  pagados) + `billing_snapshots` (evidencia SERNAC del desglose por cobro). NO se aplica en
  esta tanda — se ejecuta en el gate, branch efímero (Director Movida §3).
- **RLS impact:** ambas tablas con ÚNICA policy SELECT propio (initplan `(select auth.uid())`);
  CERO escritura para `authenticated` (solo service-role). Trigger `SECURITY DEFINER`
  `sync_coach_enabled_modules` recomputa `enabled_modules` (con `coalesce('{}')` obligatorio).
- **Generated types impact:** extender `database.types.ts` a mano ahora (la migración no se
  aplica); regenerar tras el merge del gate.

## Server Actions

- N/A para alta/baja de add-ons: van por **endpoints REST** bajo `/api/payments/` (D7 —
  `/coach/subscription` ya consume `fetch('/api/payments/...')` y ahí vive el guard
  `canViewBilling`). El override CEO (F6) sí adapta el server action admin existente
  (`coach-actions.ts`) para escribir filas `admin_grant` en vez del jsonb.
- Validación: Zod en los endpoints (`moduleKey` ∈ `MODULE_KEYS`, `acceptedTermsVersion ===
  ADDON_PAYMENT_RULES.version`); coherencia D8 contra el tier solicitado.

## UI/UX

- **2 superficies de venta exactas:** catálogo Settings > Módulos (plan 03) + sección Add-ons de
  `/coach/subscription`. CERO banners en dashboard, builder, clientes o app del alumno.
- Mobile: `dvh`/safe-area; sin `h-screen` fuera de `md:`.
- Dark mode: sección Add-ons, modales (alta con checkbox + desglose en vivo; baja con fecha
  efectiva), `ModuleOffNotice`, paso de add-ons del signup, pre-marcado de reactivate.
- Componentes route-local primero; `ModuleOffNotice` estandarizado para las 4 páginas de módulo.
- Funnel PostHog (analítica pasiva, no venta): `addon_catalog_viewed` → `addon_modal_opened` →
  `addon_terms_accepted` → `addon_confirmed` (+ `addon_oneshot_redirected` en trim/anual).

## Phases

1. **F0 — SDD + constantes congeladas (ESTE BRANCH):** `ADDON_CONFIG` + `ADDON_PAYMENT_RULES`
   en `constants.ts`; specs SDD; `SANDBOX-CHECKLIST.md`. `pnpm typecheck` verde.
2. **F1 — DB:** migración (tablas + RLS + trigger) escrita; tipos a mano; suite SQL escrita.
3. **F2 — Dominio + servicios:** types puros, repository service-role, addons.service (incl.
   `getAddonProrationClp`, máquina de estados, monto compuesto); unit vitest.
4. **F3 — Integración MP:** PUT de monto, one-shot prorrateado, monto compuesto en
   create-preference, webhook (materialización/snapshot/`updated`/terminal), reconcile diario;
   unit vitest + SANDBOX-CHECKLIST escrito (NO ejecutado).
5. **F4 — API + reglas visibles:** endpoints `/api/payments/addons{,/cancel}`,
   subscription-status ampliado, rate-limit, recibos email; unit vitest.
6. **F5 — UI:** sección Add-ons, modales, paso signup, reactivate pre-marcado, `ModuleOffNotice`,
   PostHog; specs E2E escritos (NO ejecutados).
7. **F6 — Integración plan 03 + docs:** override CEO write-through, CTA del catálogo, métricas
   /admin, docs canónicos.
8. **GATE:** con OK del usuario — branch efímero + migración + suites SQL + advisors → merge +
   regen types → vitest → Playwright `tests/billing/` → sandbox MP (9 ítems) → smoke matriz QA.

## Test Plan

- **Unit (vitest, por tanda — permitido):** `addons.service.test.ts` (cálculo compuesto x3 ciclos,
  `getAddonProrationClp` con bordes, `isAddonBillable` x4, date-math del compromiso mensual,
  bifurcación de `activateAddonForCoach`, `canPurchaseAddon`); `checkout-external-reference.test.ts`
  (round-trip con/sin add-ons, legacy 3 partes, claves inválidas); hooks del webhook con provider
  mockeado; pasada de reconcile; validación Zod de endpoints; plantilla de recibo (snapshot).
- **Integration:** suite SQL `tests/billing/coach-addons-rls.sql` (RLS solo-SELECT propio, escritura
  authenticated denegada, trigger de sync, índice único por `source`, `billing_snapshots`).
- **E2E (Playwright, escrito en F5, ejecutado SOLO en el gate):** `tests/billing/addons-flow.spec.ts`
  con mock MP (alta+checkbox, total en vivo, modal trim/anual one-shot, baja con fecha efectiva,
  estado "Comprometido" mensual, ModuleOffNotice, paso signup, reactivate pre-marcado, admin-grant).
  ⚠️ Reusar la 9na persona e2e con módulos ON; NO tocar las 8 de la matriz de separación.
- **Manual / sandbox MP (SOLO en el gate, token TEST):** `SANDBOX-CHECKLIST.md` (9 ítems).

## Rollback Plan

- F0 (este branch): revertir el bloque de `ADDON_CONFIG`/`ADDON_PAYMENT_RULES` en `constants.ts`
  y borrar `specs/addons-billing/` — cero impacto en runtime (las constantes aún no se consumen y
  `SELF_SERVICE_ADDONS_ENABLED` sigue en `false`).
- Migración (F1+): aditiva e idempotente; el rollback funcional es dejar
  `SELF_SERVICE_ADDONS_ENABLED = false` (la UI/endpoints no se exponen). NUNCA DROP destructivo
  de `coach_addons`/`billing_snapshots` en prod (protocolo forward-only del Director Movida §3).
