# PLAN — Canje de codigo de descuento para coach FREE

## Orden de ejecucion

1. **Route** (`apps/web/src/app/api/payments/redeem-coupon/route.ts`): `isFreeActive = tier === 'free' && status === 'active'` como unica excepcion del guard `NO_PAID_PLAN`; `active_coupon_redemption_id` al SELECT; rama free con `PLAN_REQUIRED` + cascada de ciclo + `ALREADY_HAS_COUPON`; `billable = []` en free; PUT al gateway excluido explicitamente en free. Sin cambios de shape de respuesta (`{ ok, redemptionId, preview }`).
2. **UI** (`_components/CouponRedeemCard.tsx`): props opcionales `selectedTier`/`selectedCycle`/`onRedeemed`; gate que suma free+active; `previewTier`/`previewCycle` en el body **solo** para free; boton deshabilitado con hint si no hay plan elegido; copy de exito propio; invalidacion del preview al cambiar plan/ciclo; refresco del padre tras commit.
3. **Cableado** (`_components/SubscriptionContent.tsx`): pasa `selectedTier` (filtrado con `isSaleTier` + `!== 'free'`, porque el server solo acepta `starter|pro|elite`), `selectedCycle` y `refreshStatus`.
4. **Tests** (`redeem-coupon/route.test.ts`): 4 casos nuevos sobre el fixture existente, sin editar los 2 tests de coach pago. Se corre tambien la suite del route de signup como prueba de no-regresion.
5. **Gates**: `tsc --noEmit` de web, vitest de ambos routes, eslint de los archivos tocados.

## Sin cambios de DB

No hay migracion: `coupon_redemptions`, el trigger que apunta `coaches.active_coupon_redemption_id` y el indice unico parcial ya existen y ya soportan a un coach free (fue exactamente lo que se sembro a mano para DIEGO25).

## Riesgos y como se cubren

| Riesgo | Cobertura |
|---|---|
| Tocar el precio de un coach pago | La rama free vive detras de `isFreeActive`; los 2 tests del path pago (Flow y MP) quedan sin editar y en verde |
| PUT del monto a un preapproval que no corresponde | El bloque del gateway se salta explicitamente cuando `isFreeActive`, no por confiar en que `subscription_mp_id` sea NULL. Test: `updateCheckoutAmount` NO llamado |
| Canje que muere en `NET_NOT_CHARGEABLE` (plan free = $0) | Se precia sobre `previewTier`; sin el, 422 `PLAN_REQUIRED` antes de tocar el motor |
| Apilar redenciones | Chequeo de `active_coupon_redemption_id` en la rama free → 409 explicito |
| Abrir el canje a free en estados que son del route de signup | El guard exige `active` exacto; test de `free + expired` → 422 `NO_PAID_PLAN` |
| Disclosure que muestra un precio distinto al cobrado | El preview se invalida al cambiar plan/ciclo; el composite lo recalcula el server en el checkout |
