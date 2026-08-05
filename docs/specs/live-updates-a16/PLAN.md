# PLAN — Live Updates A16 para el cronometro vivo

Precondicion: gate de negocio del SPEC cumplido (% Android 16 QPR1+ en alumnos, o soporte
upstream en notify-kit). Hasta entonces este plan queda en backlog.

## Fase 0 — Medicion (sin codigo)
Query PostHog sobre alumnos activos RN: distribucion `$os` = Android por `$os_version`/API level.
Decision go/no-go documentada al pie de este archivo.

## Fase 1 — Patch notify-kit (nativo, ~20 lineas)
1. `pnpm patch react-native-notify-kit@10.4.8`.
2. `NotificationAndroidModel.java`: leer `requestPromotedOngoing` (boolean, default false).
3. `NotificationManager.java` (de la lib): si el flag esta y `Build.VERSION.SDK_INT >= 36`,
   `builder.setRequestPromotedOngoing(true)`. Verificar version de androidx core que lo expone;
   si hace falta, extra directo `EXTRA_REQUEST_PROMOTED_ONGOING`.
4. Config plugin (o `AndroidManifest` propio via `app.json` -> `android.permissions`):
   `android.permission.POST_PROMOTED_NOTIFICATIONS`.
5. Modulo JS de la lib: exponer `canPostPromotedNotifications()` (wrapper del
   `NotificationManager` de plataforma) — si el patch se vuelve grande, resolverlo con un
   `TurboModule` minimo propio SOLO para esa consulta.
6. Abrir PR upstream (marcocrupi/react-native-notify-kit) con el mismo diff; el patch local vive
   mientras el PR no llegue a release.

## Fase 2 — JS (OTA-able una vez exista la build con el patch)
1. `live-timer-notification.ts`: probe cacheado de `canPostPromotedNotifications()`; si true,
   `android.requestPromotedOngoing = true` en `showLiveTimer` (aplica a descanso y cardio sin
   tocar los wrappers).
2. Sin colorized. Sin estilos nuevos (Standard style ya es elegible). `contentTitle` ya se manda.
3. Telemetria: evento una vez por sesion con el resultado del probe (medir cobertura real).

## Fase 3 — QA device (bloqueante para release)
1. Pixel con Android 16 QPR1+: tarjeta fija no colapsable en lockscreen, chip en status bar con
   conteo, wireframe en AOD; acciones Pausar/+15/Saltar siguen funcionando desde la tarjeta
   promovida (headless bridge intacto).
2. `Notification.hasPromotableCharacteristics()` true en dump; si false, revisar checklist del
   SPEC (colorized/customContentView/groupSummary).
3. Device sin soporte (Android <16 o feature off): comportamiento identico al actual — cero
   regresion visual o de acciones.
4. Toggle per-app "Live updates" OFF: degrada a notificacion v2 sin errores.
5. Xiaomi: verificar que el fallback respeta el fix v2 + toggle per-app de lockscreen.

## Fase 4 — Release
Build EAS Android (el patch y el permiso son nativos). Respetar la regla vigente de releases
(iOS en revision: nativo se acumula, no subir version iOS por esto). Actualizar
`docs/status/MOBILE_PARITY.md` y la cabecera de `live-timer-notification.ts` (quitar el
"DIFERIDO" de la seccion 7A).
