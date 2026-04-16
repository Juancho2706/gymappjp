# P1.7 — Smoke test manual: pagos Mercado Pago (coach)

Checklist reproducible antes de producción. Ejecutar en **sandbox** con token `TEST-` y `MERCADOPAGO_TEST_PAYER_EMAIL` configurado.

## Preparación

1. Cuenta coach nueva o de prueba en estado `pending_payment` / `canceled` según el escenario.
2. Variables: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_TOKEN`, URL pública accesible para webhooks (ngrok o deploy preview).

## Flujo A — Registro → pago → activación

1. Registrar coach con plan y ciclo válidos; debe redirigir a `/coach/subscription/processing`.
2. Completar checkout en Mercado Pago hasta autorizar la tarjeta.
3. Verificar redirección automática o manual a `/coach/dashboard?subscription=active`.
4. En Supabase: fila `coaches` con `subscription_status = active`, `subscription_mp_id` no nulo, `current_period_end` coherente con el plan.

## Flujo B — Cancelar suscripción y grace

1. Desde la app (o API) cancelar la suscripción activa del coach.
2. Confirmar en MP que el preapproval queda cancelado o en estado esperado.
3. Verificar que el coach sigue con acceso hasta `current_period_end` si aplica (`canceled` con periodo vigente).
4. Tras vencer el periodo, confirmar bloqueo o redirección a `/coach/reactivate` según reglas de `coach-subscription-gate`.

## Flujo C — Upgrade / nuevo preapproval (P2.4)

1. Coach **activo** inicia cambio de plan desde la UI (crea nuevo preapproval).
2. Completar pago del nuevo plan.
3. Verificar webhook: preapproval anterior cancelado en MP; `coaches.subscription_tier`, `billing_cycle`, `max_clients`, `subscription_mp_id` alineados con el nuevo plan; `superseded_mp_preapproval_id` limpio tras `authorized`.

## Flujo D — Reactivación desde `canceled` (P2.6)

1. Coach en `canceled` sin periodo vigente abre `/coach/reactivate` y elige plan.
2. En MP (API o panel), confirmar que el preapproval creado tiene `auto_recurring.start_date` cercano a **ahora + ~60s**, no una fecha heredada de una suscripción antigua.

## Regresión webhook

1. Disparar notificación de preapproval **no actual** (id distinto de `subscription_mp_id` del coach): no debe pisar estado de suscripción; puede registrarse evento `stale` en `subscription_events`.

Marcar P1.7 como OK solo si todos los flujos relevantes al release pasan sin errores en logs ni inconsistencias en DB.
