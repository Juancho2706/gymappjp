# Sprint 5 - Monitoreo y Soporte Beta

## Canal de soporte
- Canal primario: email de soporte beta (definir alias operativo).
- SLA:
  - P0 (login/pagos caidos): <= 15 min
  - P1 (impacto fuerte sin caida total): <= 60 min
  - P2 (UX/mejora): <= 24h

## Endpoint de salud beta
- `GET /api/ops/beta-health`
- Header requerido: `Authorization: Bearer $BETA_MONITOR_TOKEN`
- Respuesta esperada:
  - `paymentEvents24h`
  - `paymentFailures24h`
  - `dripFailures24h`
  - `onboardingEvents24h`

## Rutina diaria
1. Revisar estado de pagos (`subscription_events`) y fallos webhook.
2. Revisar corrida de drip (`coach_email_drip_events`).
3. Revisar eventos onboarding (`coach_onboarding_events`).
4. Registrar incidentes y acciones.

## Template de incidente
- Fecha/hora:
- Tipo (P0/P1/P2):
- Sintoma:
- Impacto:
- Causa raiz:
- Mitigacion:
- Accion preventiva:
