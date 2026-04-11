# BIZ-004 - MercadoPago Produccion Runbook

## Objetivo
Operar pagos productivos con trazabilidad y respuesta rapida ante incidentes.

## Variables requeridas
- `PAYMENT_PROVIDER=mercadopago`
- `MERCADOPAGO_ACCESS_TOKEN` (PROD)
- `MERCADOPAGO_WEBHOOK_TOKEN`
- `NEXT_PUBLIC_SITE_URL`

## Rutas criticas
- `POST /api/payments/create-preference`
- `POST /api/payments/confirm-subscription`
- `POST /api/payments/webhook`
- `GET /api/payments/subscription-status`
- `POST /api/payments/cancel-subscription`

## Prueba de humo productiva (3/3)
1. **Alta nueva suscripcion**
   - registro coach nuevo -> checkout -> confirmacion.
   - validar `coaches.subscription_status` y `subscription_events`.
2. **Cambio de plan/ciclo**
   - `coach/subscription` -> cambio -> confirmacion.
   - validar `max_clients`, `billing_cycle`, evento.
3. **Cancelacion y reactivacion**
   - cancelar desde app y reactivar con nuevo checkout.
   - validar consistencia de estado final.

## Query de verificacion sugerida (Supabase SQL)
```sql
select coach_id, provider, provider_status, provider_event_id, created_at
from subscription_events
order by created_at desc
limit 20;
```

## Mapa de incidentes

### Caso A - Webhook 401 Unauthorized
- Causa probable: token incorrecto/no enviado.
- Accion:
  1. revisar `MERCADOPAGO_WEBHOOK_TOKEN` en Vercel.
  2. confirmar query param `token` en webhook URL generada.
  3. reintentar evento desde panel provider.

### Caso B - Evento duplicado
- Mitigacion actual: upsert por `provider_event_id`.
- Accion:
  1. revisar logs de `provider_event_id`.
  2. confirmar que no haya mutaciones no idempotentes externas.

### Caso C - Estado proveedor distinto a DB
- Accion:
  1. ejecutar `confirm-subscription` manual para coach afectado.
  2. revisar `mapProviderStatus`.
  3. registrar incidente y RCA.

## Escalamiento
- P0 pagos caidos: respuesta < 15 min.
- P1 inconsistencia parcial: respuesta < 60 min.
- Canal recomendado: incidente interno + issue enlazada a evento.
