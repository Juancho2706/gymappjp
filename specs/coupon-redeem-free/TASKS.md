# TASKS — Canje de codigo de descuento para coach FREE

## T1 — Route `/api/payments/redeem-coupon`
- [x] T1.1 `isFreeActive` como unica excepcion del guard `NO_PAID_PLAN` (free en otros estados sigue en 422).
- [x] T1.2 `active_coupon_redemption_id` agregado al SELECT del coach.
- [x] T1.3 Rama free: `previewTier` obligatorio → 422 `PLAN_REQUIRED`; cascada de ciclo identica al route de signup.
- [x] T1.4 Rama free: chequeo de `active_coupon_redemption_id` → 409 `ALREADY_HAS_COUPON`.
- [x] T1.5 Rama free: `billable = []` (el descuento precia el plan a comprar, no add-ons no pagados) y sin lectura de add-ons.
- [x] T1.6 PUT al gateway excluido explicitamente en la rama free; path pago sin cambios.
- [x] T1.7 `ERROR_STATUS` extendido con `PLAN_REQUIRED` / `ALREADY_HAS_COUPON` (map exhaustivo).

## T2 — UI `/coach/subscription`
- [x] T2.1 `CouponRedeemCard`: props opcionales `selectedTier` / `selectedCycle` / `onRedeemed`.
- [x] T2.2 Gate del componente habilita free+active (ademas de pago activo/trialing).
- [x] T2.3 `previewTier`/`previewCycle` en el body SOLO para free (body del coach pago intacto).
- [x] T2.4 Sin plan elegido: boton "Aplicar" deshabilitado + hint, sin disparar el POST.
- [x] T2.5 Copy de exito propio para free y invalidacion del preview al cambiar plan/ciclo.
- [x] T2.6 `SubscriptionContent` pasa el plan elegido (filtrado a `starter|pro|elite`) y `refreshStatus`.

## T3 — Tests y gates
- [x] T3.1 free+active + `previewTier:'pro'` + `previewCycle:'annual'` → 200 con `tier:'pro'`/`cycle:'annual'` y sin PUT.
- [x] T3.2 free+active sin `previewTier` → 422 `PLAN_REQUIRED` y `redeemCoupon` no llamado.
- [x] T3.3 free+expired → 422 `NO_PAID_PLAN`.
- [x] T3.4 free+active con `active_coupon_redemption_id` → 409 `ALREADY_HAS_COUPON`.
- [x] T3.5 Los 2 tests del coach pago siguen en verde sin editarse; suite de `redeem-coupon-signup` sin regresion (22/22).
- [x] T3.6 `pnpm --filter @eva/web exec tsc --noEmit` limpio + eslint de los archivos tocados sin errores nuevos.

## T4 — Pendientes reales
- [ ] T4.1 QA manual en navegador con un coach free+active y `COUPON_REDEMPTION_ENABLED=true` (nadie lo abrio todavia).
- [ ] T4.2 Verificar en el checkout real que el primer cobro del free sale descontado (hoy solo esta probado con la siembra SQL de DIEGO25).
- [x] T4.3 Commiteado desde `dbd76e50` (2026-08-03) y `adc6f7f7` (2026-09-02), en producción; el gate
      `COUPON_REDEMPTION_ENABLED` sigue apagado (env), así que el endpoint no queda expuesto sin el flag.

> Superada en 2026-09-05 (`docs/specs/retiro-starter-y-enterprise`): el enum del server es free/pro/elite; starter ya no se acepta.
