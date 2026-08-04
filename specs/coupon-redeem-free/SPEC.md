# SPEC — Canje de codigo de descuento para coach FREE

Fecha: 2026-08-03 · Origen: hueco detectado al aplicar el cupon DIEGO25 (25% forever) a un coach free+active — hubo que sembrarlo por SQL porque **ninguna ruta de la UI lo aceptaba**. Precedente: `specs/discount-codes` (F1-F5 del motor de cupones).

## Problema

Un coach en plan **gratuito con cuenta activa** (`subscription_tier='free'`, `subscription_status='active'`) no tiene ninguna puerta de canje:

- `/api/payments/redeem-coupon` lo rechaza: `if (tier === 'free' || !PAID_ACTIVE.has(status)) → 422 NO_PAID_PLAN`. El gate asume que el descuento solo se puede aplicar a un preapproval vivo.
- `/api/payments/redeem-coupon-signup` tambien lo rechaza: solo acepta estados **pre-checkout** (`pending_payment`, `expired`, `canceled`); `active` cae en 422 `NO_PENDING_SIGNUP`.
- `/coach/reactivate` (que si monta una tarjeta de canje) es **inalcanzable** para un free+active: `coach-subscription-gate.ts` lo redirige antes de renderizar.

Consecuencia comercial: un deal (20%, 25%) ofrecido a un coach que todavia no paga **no opera por UI**; alguien tiene que escribir la redencion a mano en la base.

El threading aguas abajo **ya funciona**: `create-preference` resuelve `resolveActiveDiscountSpec(admin, user.id)` sin gate de tier/status y precia el `tier/cycle` del checkout, y `subscription-status` ya devuelve `activeCoupon` para un free. Lo unico que falta es la puerta de entrada.

## Decision

1. **Relajar `/api/payments/redeem-coupon` SOLO en la combinacion `free` + `active`**. Cualquier otro free (`expired` / `canceled` / `pending_payment`) sigue en 422 `NO_PAID_PLAN`: ese hueco ya es de `/redeem-coupon-signup` y no se toca.
2. **Preciar sobre el plan ELEGIDO**, no sobre el persistido: el plan free vale $0 ⇒ el composite daria neto no cobrable y el canje moriria en `NET_NOT_CHARGEABLE`. La rama free exige `previewTier` (`starter|pro|elite`) y aplica la misma cascada de ciclo del route de signup. Sin plan elegido → 422 `PLAN_REQUIRED`.
3. **Un canje a la vez**: la rama free chequea `coaches.active_coupon_redemption_id` → 409 `ALREADY_HAS_COUPON` (espejo del route de signup). El indice unico parcial igual lo bloquearia, pero con un error peor (23505 → `ALREADY_REDEEMED`).
4. **La tarjeta de canje de `/coach/subscription` se habilita para free+active** y manda el tier/ciclo seleccionados en la pantalla.
5. **`/redeem-coupon-signup` queda INTACTO** (guard, tests y contrato). **`/coach/reactivate` no se toca** (inalcanzable para este caso).

## Fail-closed / reglas de dinero

- Coach pago (tier no-free): **cero cambios**. Mismo guard, mismo pricing persistido, mismo PUT al gateway, mismo body desde la UI.
- La rama free **nunca** hace PUT al gateway. No basta con que `subscription_mp_id` venga NULL: se excluye explicitamente, porque un id sobreviviente de una suscripcion vieja haria que el PUT moviera el monto de una suscripcion que **no** es el plan que se acaba de preciar.
- Add-ons fuera del pricing del cupon en la rama free: el descuento aplica al **plan que va a comprar**, no a modulos que todavia no paga. El monto real lo recalcula `create-preference` con el composite verdadero.
- El flag de dinero `COUPON_REDEMPTION_ENABLED` y el rate limit fail-closed quedan igual, delante de todo.

## Disclosure SERNAC

Los terminos los sigue armando el server (`formatCouponTermsText`) con los montos del composite. Al preciar con `previewTier`/`previewCycle`, el texto muestra el precio del plan elegido — **mismo trade-off ya aceptado** en el path de registro/reactivacion. Si el coach cambia de plan con un preview abierto, el preview se invalida y debe re-aplicar.

## Fuera de alcance

Nutricion · `/api/payments/redeem-coupon-signup` · `/coach/reactivate` · canje desde RN · permitir canje a free en estados no-`active` · cambiar el motor `redeemCoupon` · paridad de la tarjeta en el pane embebido de Opciones (usa el mismo componente, sale gratis).
