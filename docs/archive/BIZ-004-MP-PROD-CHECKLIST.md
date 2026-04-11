# BIZ-004 - Checklist de Produccion MercadoPago

## Pre-flight
- [ ] `MERCADOPAGO_ACCESS_TOKEN` configurado (produccion).
- [ ] `MERCADOPAGO_WEBHOOK_TOKEN` configurado.
- [ ] `NEXT_PUBLIC_SITE_URL` correcto en entorno prod.
- [ ] Webhook URL registrada en proveedor con token.
- [ ] CI verde (`quality` + `e2e`) en rama a desplegar.

## Validaciones funcionales
- [ ] Alta nueva suscripcion completada.
- [ ] Cambio de plan/ciclo completado.
- [ ] Cancelacion + reactivacion completada.
- [ ] Estado en `coaches` consistente con proveedor.
- [ ] Eventos en `subscription_events` registrados.

## Evidencia obligatoria
- [ ] Captura checkout completado.
- [ ] Captura estado final en UI `coach/subscription`.
- [ ] IDs de eventos registrados (tabla o export).
- [ ] Fecha/hora de ejecucion y operador.

## Criterio de pase
- 3/3 flujos en verde.
- 0 inconsistencias abiertas.
- Runbook validado por una segunda revision.
