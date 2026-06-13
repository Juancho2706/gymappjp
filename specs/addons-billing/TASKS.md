# TASKS — Billing de add-ons self-service

**Status:** DRAFT
**Owner:** Juan V.
**Last updated:** 2026-06-12
**Spec:** `specs/addons-billing/SPEC.md`
**Plan:** `specs/addons-billing/PLAN.md`
**Plan maestro:** `docs/plans/estrategia/05-PLAN-billing-addons-selfservice.md`

---

## Tasks (por fase del plan maestro)

### F0 — SDD + constantes congeladas (ESTE BRANCH)
- [x] T0.1 — `ADDON_CONFIG` en `constants.ts`: `Record<ModuleKey, {priceClpMensual: 9990, label, description}>`, $9.990 uniforme, CERO IVA.
  - Verificación: `pnpm typecheck` verde.
- [x] T0.2 — `ADDON_PAYMENT_RULES` en `constants.ts`: 5 reglas como texto, `terms_version: 'v1-2026-06'`, variante mensual vs trim/anual bajo la misma versión + `getAddonPaymentRulesForCycle`.
  - Verificación: cobertura de las 5 reglas con su mecánica del plan §2.3; latam neutro; sin IVA.
- [x] T0.3 — Specs SDD `SPEC.md` / `PLAN.md` / `TASKS.md` (este archivo).
- [x] T0.4 — `SANDBOX-CHECKLIST.md` con los 9 ítems del plan F3 (NO ejecutar).

### F1 — DB
- [ ] T1.1 — Migración `coach_addons` (tabla + índice único parcial por `coach_id,module_key,source` + índice por coach).
- [ ] T1.2 — RLS: `enable` + ÚNICA policy SELECT propio; CERO INSERT/UPDATE/DELETE para `authenticated`.
- [ ] T1.3 — Trigger `sync_coach_enabled_modules` (`SECURITY DEFINER`, `coalesce('{}')`, `AFTER INSERT OR UPDATE OR DELETE`).
- [ ] T1.4 — Tabla `billing_snapshots` + RLS SELECT propio + unique por `provider_payment_id`.
- [ ] T1.5 — Extender `database.types.ts` a mano (regenerar es tarea del gate).
- [ ] T1.6 — Suite SQL `tests/billing/coach-addons-rls.sql` (escrita, NO ejecutada).
  - Verificación: `pnpm typecheck` verde con los tipos a mano.

### F2 — Dominio + servicios
- [ ] T2.1 — `domain/billing/types.ts` (puros).
- [ ] T2.2 — `infrastructure/db/coach-addons.repository.ts` (+barrel).
- [ ] T2.3 — `services/billing/addons.service.ts` (catálogo, `getAddonCycleAmountClp`, `getAddonProrationClp`, `isAddonBillable`, `getCompositeAmountClp`, `activateAddonForCoach`, `materializeAddonFromOneShot`, `requestAddonCancellation`, `canPurchaseAddon`).
- [ ] T2.4 — Extender `parseCheckoutExternalReference` + `buildExternalReference` (4ª parte add-ons, backward-compatible).
- [ ] T2.5 — Unit vitest `addons.service.test.ts` + `checkout-external-reference.test.ts`.
  - Verificación: `pnpm typecheck && pnpm test` verdes.

### F3 — Integración MercadoPago
- [ ] T3.1 — `updateCheckoutAmount` + `createOneShotPayment` en provider.
- [ ] T3.2 — Monto compuesto en `create-preference` + add-ons del signup validados (espejo D8).
- [ ] T3.3 — Webhook: materialización (preapproval + one-shot), `markFirstCharged`, evento `updated`, snapshots, terminal.
- [ ] T3.4 — `mp-reconcile` diario + pasada add-ons (expiry, drift, kill-switch, paused) + `vercel.json`.
- [ ] T3.5 — Unit vitest del webhook + reconcile.
  - Verificación: `pnpm typecheck && pnpm test`; SANDBOX-CHECKLIST escrito (NO corrido).

### F4 — API + reglas visibles
- [ ] T4.1 — `POST /api/payments/addons` (alta, bifurcada por ciclo).
- [ ] T4.2 — `POST /api/payments/addons/cancel` (baja, fecha efectiva).
- [ ] T4.3 — `subscription-status` ampliado (`addons` + `billing`).
- [ ] T4.4 — Rate-limit en ambos endpoints + recibos email (alta/baja, fire-and-forget, sin IVA).
- [ ] T4.5 — Unit vitest (Zod, guards, respuesta bifurcada, snapshot del recibo).
  - Verificación: `pnpm typecheck && pnpm test`.

### F5 — UI
- [ ] T5.1 — Sección Add-ons en `/coach/subscription` + modales (alta checkbox/desglose en vivo; baja fecha efectiva).
- [ ] T5.2 — "Plan actual" + "Cambiar plan" muestran el compuesto.
- [ ] T5.3 — Paso opcional de add-ons en signup + forward del CSV en `processing/page.tsx`.
- [ ] T5.4 — `/coach/reactivate` pre-marca ex-add-ons (precio re-congelado a lista vigente).
- [ ] T5.5 — `ModuleOffNotice` en las 4 páginas de módulo.
- [ ] T5.6 — Funnel PostHog + i18n + dark mode.
- [ ] T5.7 — Spec E2E `tests/billing/addons-flow.spec.ts` (escrito, NO ejecutado; 9na persona e2e).
  - Verificación: `pnpm typecheck && pnpm test`; grep anti-hostigamiento verde.

### F6 — Integración plan 03 + docs
- [ ] T6.1 — Override CEO write-through (`coach-actions.ts` → filas `admin_grant`).
- [ ] T6.2 — CTA del catálogo Settings > Módulos → `/coach/subscription#addons`.
- [ ] T6.3 — Métricas de adopción de add-ons en `/admin` (junto al fix de RPCs del plan 04).
- [ ] T6.4 — Docs canónicos: `FLOWS_AND_COMPONENTS.md`, `RUNBOOK.md` (dunning, kill-switch), `MANUAL_TASKS.md` (boleta/IVA), CLAUDE.md (tablas), `TEST_STATUS.md`.

### GATE (con OK explícito del usuario)
- [ ] T7.1 — Branch efímero + migración + suite SQL + advisors → merge + regen types.
- [ ] T7.2 — vitest completo → Playwright `tests/billing/` → sandbox MP (9 ítems) → smoke matriz QA con cuenta standalone.
- [ ] T7.3 — Lanzamiento: prender `SELF_SERVICE_ADDONS_ENABLED` SOLO con sandbox verde + hardening RLS del plan 03 confirmado en prod.

---

## DoD — Matriz QA del gate (plan maestro §"Matriz QA")

Cada caso debe pasar en el gate (suites + smoke manual). Es el Definition of Done funcional del plan.

| Caso | Ciclos | Resultado esperado |
|---|---|---|
| Alta in-app suscriptor activo MENSUAL | M | ON inmediato; PUT compuesto; cortesía hasta el corte; cobro siguiente = compuesto; snapshot al cobro |
| Alta in-app suscriptor activo TRIM/ANUAL | T/A | one-shot prorrateado cobrado YA (alineado al corte); fila + módulo ON recién al aprobarse el pago; `first_charged_at` = fecha del one-shot; PUT suma el add-on a la renovación; snapshot `addon_proration` |
| One-shot abandonado (alta T/A) | T/A | cero filas, cero módulos, cero PUT |
| Baja después del 1er cobro | M/T/A | PUT inmediato; ON hasta `expires_at`; cobro siguiente sin add-on; sin refund |
| Baja ANTES del 1er cobro (compromiso) | M | sin PUT; el corte cobra el add-on; recién ahí PUT + `expires_at`; luego cancelled |
| Baja temprana en T/A | T/A | compromiso YA cubierto por el one-shot → va directo por regla 4 (PUT ya; ON hasta `expires_at`) |
| Upgrade/downgrade de tier con add-ons | M→M, M→A | supersede con compuesto; add-ons sobreviven; preapproval viejo cancelado; sin one-shot (ciclo completo nuevo) |
| Cambio de ciclo con add-ons | M→T/A | compuesto re-derivado del mensual congelado con el descuento nuevo; sin one-shot |
| Cancelación total de suscripción | — | add-ons cancelled al expirar; reactivación NO los revive sola |
| Signup con add-ons / checkout abandonado | M/T/A | filas SOLO tras webhook authorized; abandono = cero filas, cero módulos; sin one-shot |
| Reactivación con ex-add-ons pre-marcados | M/T/A | toggles pre-marcados deseleccionables; precio re-congelado a lista VIGENTE; viajan en external_reference |
| Admin grant + add-on pago coexistiendo | — | grant no factura; baja del pago no apaga el grant |
| Re-activación de un módulo tras cancelled | M | fila nueva, precio re-congelado a lista vigente |
| Evento preapproval `updated` tras PUT | M/T/A | webhook lo registra como confirmación; monto distinto al esperado → alerta drift |

## Universal Definition of Done

- [ ] `pnpm typecheck`
- [ ] Targeted tests for touched domain (`pnpm test` por tanda; Playwright/SQL/sandbox SOLO en el gate con OK del usuario)
- [ ] No direct feature-data Supabase calls in `_data` (flujo `_data` → services → repository service-role)
- [ ] Server actions / endpoints validate with Zod (alta/baja: `moduleKey` ∈ MODULE_KEYS + `acceptedTermsVersion`)
- [ ] Mutations revalidate / refresh state where needed
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Fixed edge UI uses safe-area utilities
- [ ] Dark mode checked when UI changes (sección Add-ons, modales, ModuleOffNotice, paso signup)
- [ ] Docs updated when routes, flows, DB, tests, or priorities change (F6.4)
- [ ] Grep final: cero superficies de venta fuera de las 2 permitidas (anti-hostigamiento)
- [ ] CERO mención de IVA en el copy de precios (hasta EVAapp SpA — tarea en MANUAL_TASKS)
- [ ] `SELF_SERVICE_ADDONS_ENABLED` permanece en `false` hasta el lanzamiento manual (post-gate + sandbox verde + RLS plan 03 en prod)

## Notes

- Reglas del dueño (NO re-litigar): $9.990 uniforme; descuento por ciclo (trim −10%, anual −20%);
  cortesía-hasta-corte SOLO mensual; trim/anual one-shot prorrateado inmediato + PUT desde renovación;
  compromiso mínimo 1 ciclo; starter NO compra `nutrition_exchanges` (Pro+); bundle post-v1; sin IVA en copy.
- Migración: timestamp posterior a `20260611*`, branch efímero, se ejecuta SOLO tras sellar el gate Movida.
- Preserve existing behavior unless el spec explícitamente lo cambia.
