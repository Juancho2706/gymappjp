# Discount Codes (Cupones) - PLAN

**Status:** DRAFT
**Owner:** CEO (Juan / JP)
**Last updated:** 2026-06-19
**Spec:** `specs/discount-codes/SPEC.md`

---

## Architecture

Modelo canónico de 2 niveles + ledger (Stripe / Recurly / Voucherify convergen en esto):

- **`coupons`** — la DEFINICIÓN del descuento (qué descuento, duración, alcance, cap global).
- **`coupon_codes`** — el STRING canjeable (un cupón puede tener N códigos; restricciones por código).
- **`coupon_redemptions`** — LEDGER inmutable append-only (quién canjeó qué, términos congelados = evidencia SERNAC + fuente de verdad del "ya canjeó").

**Hecho clave (fintech):** MercadoPago pre-approvals **no tienen cupón nativo**. El único knob es `auto_recurring.transaction_amount` (CLP absoluto). EVA ya computa el precio server-side y lo manda ahí (`MercadoPagoProvider.createCheckout` / `updateCheckoutAmount`). Por lo tanto el sistema de cupones es un **motor de precio interno puro**: calcula el neto y lo inyecta en el path de checkout/PUT existente. El gateway nunca ve el cupón.

Data flow (respeta capas EVA):

```text
app/coach/subscription/_components (input código)
  -> POST /api/payments/create-preference | /addons (valida código server-side)
  -> services/billing/coupons.service.ts (valida + registra redención + calcula neto)
  -> services/billing/addons.service.ts (getCompositeAmountClp aplica descuento activo)
  -> infrastructure/db (coupons / coupon_codes / coupon_redemptions, service-role)
  -> Supabase + MercadoPagoProvider (transaction_amount = neto)
```

CEO panel:

```text
app/admin/(panel)/codigos/page.tsx (RSC)
  -> _data/codigos.queries.ts (React.cache, service-role read)
  -> _actions/codigos.actions.ts ('use server', Zod, service-role write)
  -> services/billing/coupons.service.ts (mint / revoke)
```

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `supabase/migrations/<ts>_discount_codes.sql` | 3 tablas + extend `billing_snapshots` + col `coaches.active_coupon_redemption_id` + RLS + grants + trigger |
| CREATE | `apps/web/src/services/billing/coupons.service.ts` | validar / mintear / canjear / revocar; cálculo de neto (función pura `applyCoupon`) |
| CREATE | `apps/web/src/services/billing/coupons.pricing.ts` | función PURA `computeDiscountedClp(base, addons, coupon)` con tests (sin Supabase) |
| UPDATE | `apps/web/src/services/billing/addons.service.ts` | `getCompositeAmountClp` lee descuento activo y aplica neto (drift-safe) |
| UPDATE | `packages/tiers/index.ts` | exponer base por tier para el cálculo (ya existe `getTierPriceClp`) |
| UPDATE | `apps/web/src/app/api/payments/create-preference/route.ts` | Zod `discountCode?`; validar+canjear; net amount al preapproval |
| UPDATE | `apps/web/src/app/api/payments/addons/route.ts` | descuento sobre alta de add-on (si aplica al `module_key`) |
| UPDATE | `apps/web/src/app/api/payments/confirm-addon/route.ts` | preservar precio descontado en row + snapshot |
| UPDATE | `apps/web/src/app/api/payments/webhook/route.ts` | `expectedClp` con descuento; snapshot con `discount_clp`/`coupon_code`; decremento de ciclos |
| UPDATE | `apps/web/src/services/billing/addon-webhook.service.ts` | `buildAddonBreakdown` + `insertBillingSnapshot` incluyen descuento |
| UPDATE | `apps/web/src/app/api/payments/subscription-status/route.ts` | exponer descuento activo + neto a la UI |
| CREATE | `apps/web/src/app/admin/(panel)/codigos/page.tsx` + `_data` + `_actions` + `_components` | CEO CRUD + listado de redenciones |
| UPDATE | `apps/web/src/app/admin/(panel)/AdminSidebar.tsx` | entrada de nav "Códigos de descuento" (`/admin/codigos`) |
| UPDATE | `apps/web/src/app/coach/subscription/page.tsx` + `_components` | input código, apply/clear, línea de descuento en el breakdown, disclosure |
| UPDATE | `apps/web/src/app/(auth)/register/_actions/register.actions.ts` | aceptar código en el primer checkout (opcional v1) |
| UPDATE | `apps/web/src/lib/database.types.ts` | regenerar tras migración |
| UPDATE | finanzas/MRR RPCs + `lib/test-accounts.ts` callers | reflejar ingreso descontado |

## Data Model

**DB changes: migración aditiva forward-only requerida.** (branching Supabase Pro mientras dure; si no, aditivo-en-LIVE: snapshot + data sintética + advisors.)

- `coupons`: `id`, `code_kind` (`single`|`unique_batch`), `discount_type` (`percent`|`fixed_clp`|`free_period`), `percent_value` (1..100), `amount_off_clp`, `free_period_cycles`, **CHECK exactamente uno de los 3**, `duration` (`once`|`repeating`|`forever`), `duration_in_cycles` (NOT NULL si `repeating`), `applies_to_scope` jsonb (`{tiers:[], module_keys:[]}`, null=base), `max_redemptions`, `redeem_by`, `currency` default `CLP`, `stackable` default false, `created_by`, timestamps.
- `coupon_codes`: `id`, `coupon_id` fk, `code_normalized` (UPPER, **UNIQUE where active**), `code_display`, `active`, `expires_at` (≤ `coupon.redeem_by`), `max_redemptions` (≤ coupon), `per_account_limit` default 1, `first_time_only` default false, `min_amount_clp`, `restricted_to_coach_id`, `created_at`.
- `coupon_redemptions` (append-only): `id`, `coupon_id` fk, `coupon_code_id` fk, `coach_id` fk, `redeemed_at`, `status` (`active`|`expired`|`reverted`), `discount_type` (snapshot), `discount_value_snapshot` jsonb (términos congelados), `applied_cycles_remaining`, `billing_snapshot_id`, `source_ip`, `created_at`. **UNIQUE partial `(coupon_id, coach_id) WHERE status='active'`** (espejo de `coach_addons_one_live_per_module`). Sin UPDATE/DELETE para `authenticated`.
- `coaches`: **+ `active_coupon_redemption_id` uuid NULL fk** → el recompute lee el descuento vivo. Service-role write (REVOKE UPDATE tabla + GRANT UPDATE de allowlist sin esta col — es compra-only).
- `billing_snapshots`: **+ `coupon_code` text, `discount_clp` int, `base_before_discount_clp` int**.
- **Trigger** (espejo `trg_coach_addons_sync`): en insert/update/status-change de `coupon_redemptions`, recomputa `coaches.active_coupon_redemption_id` y deja la verdad del descuento en un solo lugar.
- **Índices:** `coupon_codes(lower(code_normalized)) unique where active`; `coupon_redemptions(coach_id)`, `(coupon_id)`, `(status)`.

**RLS impact:** todas las tablas RLS ON. `coupons`/`coupon_codes`/`coupon_redemptions` = **escritura service-role only**; SELECT: el coach ve solo sus propias redenciones; los códigos públicos validables vía RPC SECURITY DEFINER acotada (no exponer el catálogo completo). Tests de aislamiento como `authenticated` + claims (nunca service_role).

**Generated types impact:** regenerar `database.types.ts` tras merge.

## Server Actions

- `mintCouponAction` (admin) — Zod (tipo/valor/duración/scope/caps/expiry); service-role insert en `coupons`+`coupon_codes`; audit log. `revalidatePath('/admin/codigos')`.
- `revokeCouponCodeAction` (admin) — desactiva código; no toca redenciones vivas (sus términos están congelados). `revalidatePath('/admin/codigos')`.
- `redeemCouponAction` / o validación en `/api/payments/create-preference` — Zod `{ code }`; valida (activo, no expirado, cap, per-account, first_time, scope, min_amount), escribe redención atómica, setea `active_coupon_redemption_id`, recomputa neto. Rate-limited (Upstash). **Money gate server-side.**

Todas las escrituras de dinero/entitlement = service-role. El cliente solo manda el string.

## UI/UX

- **Coach (`/coach/subscription`):** input "¿Tenés un código?", botón Aplicar/Quitar, estados (válido / inválido / expirado / ya usado / no elegible), línea de descuento en el breakdown (`base → descuento → total`), y **disclosure SERNAC** (duración, precio al que revierte, auto-renovación) antes de confirmar. Mobile: `dvh`, safe areas, touch targets ≥44px. Dark mode.
- **CEO (`/admin/codigos`):** tabla de cupones (tipo, valor, duración, scope, usos/cap, estado), crear (sheet/modal con Zod), revocar, y drill-down de redenciones por código (coach, fecha, descuento aplicado, snapshot). Reusa el patrón de `/admin/teams` y `module-form` (pure builders + server action service-role).
- Componentes route-local primero; atomic solo si se reusan en 3+ domains.

## Phases

1. **F0 — Specs** (este doc). Definir open questions con el CEO + Legal.
2. **F1 — DB**: migración aditiva (3 tablas + extends + trigger + RLS + grants) validada con snapshot + tx-rollback + advisors; regenerar types.
3. **F2 — Motor de precio**: `coupons.pricing.ts` (función pura + tests) e integración en `getCompositeAmountClp` (drift-safe en webhook/PUT). **Sin UI todavía** — testeable con vitest.
4. **F3 — CEO panel**: `/admin/codigos` (crear/listar/revocar + redenciones) + nav.
5. **F4 — Canje coach**: input + preview + disclosure SERNAC en `/coach/subscription`; validación server-side en create-preference/addons; (opcional) código en registro.
6. **F5 — Abuse + reporting + QA**: rate-limit, bloqueo de alias, audit; ajustar MRR/finanzas; QA en sandbox MP (Simulador de Notificaciones; modo test no auto-entrega webhooks). Flag de lanzamiento.

## Test Plan

- **Unit:** `coupons.pricing.ts` — matriz percent/fixed/free_period × once/repeating/forever × base/add-ons; redondeo CLP entero; cap/expiry/first_time.
- **Integration:** redención atómica (cap, per-account, carrera); recompute drift-safe (mismo neto en checkout y en webhook reconcile); decremento de ciclos y restauración de precio al expirar.
- **RLS isolation:** coach no puede escribir cupones/redenciones; no ve redenciones ajenas; no puede setear `active_coupon_redemption_id` (PostgREST 42501).
- **E2E (al cierre, con OK):** canje en `/coach/subscription` + disclosure visible; CEO crea y revoca código.
- **Manual sandbox MP:** aplicar descuento, simular cobro recurrente, confirmar `transaction_amount` neto y snapshot con `discount_clp`.

## Rollback Plan

- Lanzamiento detrás de flag (estilo `NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED`, fail-closed): apagar = no se puede canjear; las redenciones vivas mantienen su precio (términos congelados) hasta expirar.
- La migración es aditiva forward-only: revertir = dejar de leer las tablas (no DROP). Si un descuento causa problema en un coach, `revoke` + el trigger restaura precio lleno en la próxima renovación (PUT).
- Sin riesgo a data de clientes (no toca `nutrition_*`, `workout_*`, ni el cascade de plantillas).
