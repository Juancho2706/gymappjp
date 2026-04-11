# Sprint 3 Go/No-Go

## Estado
- Go técnico: **sí**
- Go funcional (sandbox): **sí**
- Riesgo residual: webhook productivo + monitoreo en producción

## Evidencia ejecutada
- Build producción: `npm run build` ✅
- Unit tests Sprint 3:
  - `src/app/(auth)/register/actions.test.ts` ✅
  - `src/lib/constants.test.ts` ✅
  - `src/app/coach/clients/actions.test.ts` ✅
- E2E Sprint 3:
  - `tests/sprint3-register-pricing.spec.ts` ✅

## Cobertura de Definition of Done
- Registro multi-step con plan/ciclo y redirección a pago: ✅
- Landing/pricing alineados en CLP + CTA con query tier/cycle: ✅
- Gating por tier (`max_clients` + capacidades): ✅
- Gestión de suscripción in-app (`/coach/subscription`): ✅
- Legal/privacidad actualizados para embudo de suscripción: ✅
- Middleware de bloqueo por suscripción se mantiene operativo: ✅

## Checklist final antes Sprint 4
- [ ] Validar webhook token en entorno productivo (`MERCADOPAGO_WEBHOOK_TOKEN`)
- [ ] Confirmar 3 pagos reales sandbox seguidos sin intervención manual
- [ ] Verificar alertas sobre `subscription_events` fallidos
- [ ] Guardar capturas del flujo completo y IDs de eventos en bitácora
