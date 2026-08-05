# TASKS — Live Updates A16

Estado: BACKLOG (gate de negocio del SPEC sin cumplir a 2026-08-04).

## Fase 0 — Medicion
- [ ] Query PostHog: % alumnos Android por `$os_version` (target: Android 16 QPR1+).
- [ ] Registrar decision go/no-go en PLAN.md.

## Fase 1 — Patch nativo notify-kit
- [ ] `pnpm patch react-native-notify-kit@10.4.8` con `requestPromotedOngoing`.
- [ ] Permiso `POST_PROMOTED_NOTIFICATIONS` en manifest.
- [ ] Exponer `canPostPromotedNotifications()`.
- [ ] PR upstream abierto y linkeado aca.

## Fase 2 — JS
- [ ] Probe cacheado + flag en `showLiveTimer`.
- [ ] Evento de telemetria de cobertura.

## Fase 3 — QA device
- [ ] Pixel A16 QPR1: tarjeta fija + chip + AOD + acciones.
- [ ] `hasPromotableCharacteristics()` true.
- [ ] Regresion cero en device sin soporte.
- [ ] Toggle "Live updates" OFF degrada limpio.
- [ ] Xiaomi: fallback v2 + toggle lockscreen per-app.

## Fase 4 — Release
- [ ] Build EAS Android.
- [ ] MOBILE_PARITY.md + cabecera de `live-timer-notification.ts` actualizadas.
