# SPEC — Timer fijo en lockscreen via Live Updates (Android 16 QPR1+)

## Problema
El cronometro vivo de descanso/cardio (notificacion ONGOING con chronometer, notify-kit) es una
notificacion comun: aun con el fix de canales v2 (importance DEFAULT, 2026-08-04) queda como una
tarjeta mas del stack, rankeada por el sistema, colapsable al shelf de iconos (Pixel 16 QPR1 vista
compacta, One UI 7 modo "Iconos") y sin conteo vivo en el AOD. El pedido del CEO es paridad con la
"tarjeta fija" de Spotify/YouTube Music.

## Diagnostico previo (2026-08-04, verificado contra AOSP — no re-litigar)
- La tarjeta de Spotify es MediaStyle + MediaSession: slot dedicado de media, fuera del stack de
  notificaciones. Replicarla sin audio real exige FGS `mediaPlayback` falso = violacion frontal de
  la policy de Play ("Don't declare invalid or inaccurate FGS types"). **Descartado, no volver.**
- El equivalente legitimo para un timer es **Android 16 QPR1 Live Updates** (promoted ongoing):
  tarjeta expandida NO colapsable en lockscreen, wireframe en AOD, chip con conteo en la status
  bar. Google lista workouts como caso de uso apropiado; media playback esta explicitamente NO
  elegible. Google Clock 9.0 (ago-2026) adopto exactamente esto para su timer.
- Ninguna lib RN/Flutter mainstream expone `setRequestPromotedOngoing` hoy (notify-kit 10.4.8 no
  tiene ProgressStyle/MetricStyle ni promoted ongoing).

## Objetivo
En devices Android 16 QPR1+ con la feature habilitada, el cronometro de descanso y cardio se
publica como Live Update (promoted ongoing). En el resto, degrada EXACTAMENTE a la notificacion
actual (canales v2) sin ninguna rama nueva de fallo.

## Requisitos tecnicos (checklist verificada en docs oficiales + AOSP)
- Manifest: `android.permission.POST_PROMOTED_NOTIFICATIONS` (no-runtime).
- Notificacion: `setRequestPromotedOngoing(true)` (o extra `EXTRA_REQUEST_PROMOTED_ONGOING`),
  `ongoing`, `contentTitle` seteado, estilo Standard/BigText/ProgressStyle/MetricStyle, SIN
  customContentView/RemoteViews, sin group summary, canal con importance > MIN (v2 DEFAULT ok).
- Chip de status bar: `setShortCriticalText()` y/o `setWhen()` + `setUsesChronometer(true)` +
  `setChronometerCountDown(true)` — mismo mecanismo que el chronometer actual.
- Gate runtime: `NotificationManager.canPostPromotedNotifications()` — cubre API < 36, feature
  deshabilitada (Android 16 estable la trae apagada), toggle per-app "Live updates" del usuario y
  criterios extra de OEM.
- ⚠️ Contrato `colorized` INVERTIDO entre ramas AOSP: `android16-release` exige
  `isColorizedRequested()`; `android16-qpr1-release` (flag `ui_rich_ongoing`) exige NO colorized.
  Decision: NO usar colorized y validar con `Notification.hasPromotableCharacteristics()` en
  device real QPR1; no dar soporte al gap del 16 estable (feature apagada ahi de todos modos).

## Decisiones de implementacion
- **Via preferida: patch a `react-native-notify-kit`** (pnpm patch + PR upstream): agregar
  `android.requestPromotedOngoing?: boolean` mapeado a `NotificationCompat.Builder
  .setRequestPromotedOngoing` (androidx core con soporte API 36) y el permiso via su config
  plugin. Razon: reusa TODO lo existente (chronometer, acciones Pausar/+15/Saltar, puente
  headless, canales v2); el diff nativo es de ~20 lineas.
- Plan B (solo si el patch resulta inviable): modulo Expo propio `eva-promoted-timer` que postee
  la notificacion promovida directamente. Costo: duplica el ruteo de acciones headless — evitarlo.
- JS: `live-timer-notification.ts` agrega el flag cuando la plataforma reporte soporte; cero
  cambios en los consumidores (`rest-live-notification` / `cardio-live-notification`).
- Cambio NATIVO (manifest + patch): exige build EAS Android nueva. NO viaja por OTA. iOS intacto.

## Fuera de alcance
- MediaStyle/MediaSession (prohibido por policy, ver arriba).
- `asForegroundService` (problema distinto: supervivencia del proceso, no lockscreen; hoy ademas
  abortaria en silencio con targetSdk 36 sin tipo declarado).
- MetricStyle de Android 17 (evaluar cuando notify-kit o androidx lo expongan estable).

## Riesgos / condiciones de arranque
- Cobertura real hoy: solo Android 16 QPR1+ (Pixel 6+ primero; OEMs pueden sumar criterios).
  **Gate de negocio: medir % de alumnos con Android 16 QPR1+ (PostHog `$os_version`) antes de
  invertir; arrancar cuando supere ~15-20% o cuando notify-kit lo soporte upstream.**
- El usuario puede apagar "Live updates" per-app: el fallback (notificacion v2) debe quedar
  indistinguible del comportamiento actual.
- Xiaomi/HyperOS: ademas del fix v2 existe el toggle per-app "Mostrar en pantalla de bloqueo";
  ningun Live Update lo puentea. Documentado en QA, no bloqueante.
