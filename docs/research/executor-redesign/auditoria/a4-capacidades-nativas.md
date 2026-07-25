# A4 · Auditoría de capacidades nativas del ejecutor (RN + PWA)

Investigación de rediseño del ejecutor de entrenamiento. Objetivo: mapear qué capacidades nativas del dispositivo están **hoy en uso**, cuáles son **posibles** (con qué módulo y si exigen build nativa nueva) y cuáles son **imposibles** en cada plataforma, para que el rediseño de la experiencia (interstitials, cronómetro de descanso, multimedia del ejercicio, cardio con Apple Watch, celebraciones tipo Duolingo) se apoye en lo que el stack realmente permite. Todo lo afirmado está anclado a `archivo:línea` del repo. Sólo lectura.

## Resumen ejecutivo

1. **Haptics ricos ya existen y están bien diseñados en RN**: `apps/mobile/lib/haptics.ts:11-47` expone un vocabulario semántico (`tap`, `select`, `setDone`, `success`, `pr`, `alarm`) sobre `expo-haptics`, ya instalado (`apps/mobile/package.json:60`). Es una base sólida para reacciones "con vibra" sin costo de build.
2. **Keep-awake (wake lock) ya cubre toda la sesión en RN**: `ExecutorV2.tsx:5,124` usa `useKeepAwake()` para mantener la pantalla encendida durante todo el entreno; `IntervalTimer.tsx:6,131-150` lo hace granular por fase. En web el equivalente vive en `use-screen-wake-lock.ts` y se invoca en `WorkoutExecutionClient.tsx:1143`.
3. **El cronómetro de descanso es la pieza más madura y sofisticada del stack**: combina notificación local de fin (`rest-notification.ts`), cronómetro **vivo** en la bandeja/lockscreen (`rest-live-notification.ts`) y háptica/audio in-app (`RestTimerBar.tsx`). Es el caso de estudio de cómo hacer bien lo nativo aquí.
4. **El cronómetro vivo de descanso (countdown en notificación ongoing) EXIGE build nativa nueva y hoy es NO-OP**: `rest-live-notification.ts:34-36` documenta que depende de `react-native-notify-kit` (fork mantenido de Notifee) como dependencia nativa; hasta que un build EAS la incluya "el cronómetro vivo simplemente no aparece". Es **Android-only** (`rest-live-notification.ts:126`).
5. **`react-native-notify-kit` YA está declarada y con plugin** (`package.json:87`, `app.json:114`), lo que sienta el precedente exacto del CEO: capacidades de bandeja/notificación viva requieren un build nativo nuevo (igual que notify-kit ya lo requirió).
6. **El audio de los timers está codificado pero DORMIDO**: `sound.ts` tiene los 4 timbres y el tick bundleados y registrados (`sound.ts:149-157`), pero `expo-audio` se carga con `require` guardado y es no-op hasta `expo install expo-audio` + build nativo (`sound.ts:42-48`, `:87-93`). En web el audio ya funciona vía Web Audio (`playTimerSound`).
7. **NO existe ninguna integración con Apple Watch, HealthKit ni sensores de ritmo cardíaco**: cero coincidencias de `HealthKit`, `heart rate`, `expo-sensors`, `pedometer` en todo `apps/mobile`. El cardio con BPM/distancia del CEO es **construcción desde cero** y exige módulo nativo + build.
8. **Hay una intención latente de conteo de pasos/movimiento**: `app.json:24` declara `NSMotionUsageDescription` ("Para contar tus pasos durante el entrenamiento"), pero no hay `expo-sensors`/`Pedometer` en las deps ni en el código — el permiso está declarado sin implementación.
9. **La app corre New Architecture** (`app.json:9` `newArchEnabled: true`) con RN 0.81.5 + Expo SDK 54, lo que condiciona la elección de librerías nativas (Notifee archivado → fork TurboModules; `rest-live-notification.ts:22-30`).
10. **Video del ejercicio: infra existe pero `expo-video` está sin instalar**: `VideoPlayer.tsx:26-62` carga `expo-video` con `require` guardado y cae a WebView + `<video>` HTML5 mientras tanto (`VideoPlayer.tsx:199`). La multimedia "al centro sin tocar botones" es viable hoy vía WebView, y óptima tras instalar `expo-video`.
11. **En PWA el wake lock, la vibración y las notificaciones locales/push ya operan**: Wake Lock API (`use-screen-wake-lock.ts:19-27`), Vibration API con truco de háptica iOS 18+ (`haptics.ts:40-55`), y `registration.showNotification` en background (`RestTimer.tsx:132-148`).
12. **PWA tiene Media Session (controles de lockscreen/audífonos) que RN NO replica**: web publica `MediaMetadata` y handlers play/pause (`lib/media-session.ts`, usado en `RestTimer.tsx`), pero el port RN lo omite explícitamente por falta de módulo nativo de "now playing" (`RestTimerBar.tsx:44-54`). Es una **regresión de paridad** que RN debería recuperar.
13. **Web Push (PWA) ya existe end-to-end**: `sw.js:194-213` maneja `push`/`notificationclick` con white-label, y `push.ts` envía tanto a suscripciones web (`web-push`) como a tokens Expo. Base lista para recordatorios/celebraciones remotas.
14. **Las celebraciones ya usan confetti nativo**: `react-native-fast-confetti` (`package.json:85`) se usa en `WorkoutSummaryOverlay.tsx:327` y `LegacyExecutor.tsx:504`. La "vibra tipo Duolingo" ya tiene su primitiva visual; falta orquestarla como sistema.
15. **Imposibles reales**: Live Activities / Dynamic Island de iOS (ningún módulo en deps, exige extensión nativa Swift + build); cronómetro vivo iOS (Notifee chronometer es Android-only); background timers reales en PWA iOS (el JS se congela, sólo la notif programada sobrevive).
16. **Quick-wins de mayor impacto sin build o con build ya planeado**: activar `expo-audio`, instalar `expo-video`, encender el cronómetro vivo en el próximo build EAS, añadir `expo-sensors` para pasos/cadencia, y recuperar Media Session en RN.

## Hallazgos

### 1. Inventario de dependencias y permisos relevantes (RN)

`apps/mobile/package.json` declara el stack nativo disponible. Relevantes para el ejecutor:

- `expo-haptics` (`:60`) — **instalada y en uso**.
- `expo-keep-awake` (`:64`) — **instalada y en uso**.
- `expo-notifications` (`:68`) — **instalada y en uso** (notificación de fin de descanso).
- `expo-audio` (`:49`) — **declarada, instalación diferida** (no-op hasta `expo install`).
- `expo-video` (`:76`) — **declarada, instalación diferida**.
- `react-native-notify-kit` (`:87`) — fork mantenido de Notifee para cronómetro vivo; **plugin registrado** en `app.json:114`.
- `react-native-fast-confetti` (`:85`) — celebraciones, **instalada y en uso**.
- `expo-camera` (`:52`), `expo-image` (`:61`), `moti` (`:78`), `react-native-reanimated` (`:89`), `@shopify/react-native-skia` (`:44`) — motor de animación disponible para interstitials y progreso animado.
- **NO existen**: `expo-sensors`, `react-native-health`, ningún módulo HealthKit/Watch (grep sin resultados en todo `apps/mobile`).

Permisos declarados en `apps/mobile/app.json`:

- Android (`:39-47`): `CAMERA`, `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `USE_BIOMETRIC`, `RECORD_AUDIO`, `POST_NOTIFICATIONS`.
- iOS (`:21-30`): `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSMotionUsageDescription` ("Para contar tus pasos durante el entrenamiento"), `NSFaceIDUsageDescription`.
- **`NSMotionUsageDescription` está declarado sin código que lo consuma** (`app.json:24`): hay intención de conteo de pasos pero no implementación — un gancho listo para `expo-sensors`.
- `newArchEnabled: true` (`app.json:9`) — condiciona librerías nativas a soporte de New Architecture.

### 2. El cronómetro de descanso: tres canales coordinados

Es la referencia de cómo el repo hace "nativo bien hecho". Tres capas:

**(a) Notificación local de fin** — `rest-notification.ts`. Usa `expo-notifications` para programar un aviso que cae al terminar el descanso en background (`:167-196`). Pide permiso una sola vez, lazy y cacheado (`ensureRestNotifPermission`, `:136-150`), divergiendo a propósito de la web que nunca promptea (`:14-16`). Usa identificador estable `eva-rest-end` y una **cola serializadora** de operaciones (`:64-72`) para evitar el spam de notificaciones apiladas en MIUI/Xiaomi documentado en `:19-39`.

**(b) Cronómetro VIVO en bandeja/lockscreen** — `rest-live-notification.ts`. Notificación `ongoing` con countdown que la dibuja y avanza el **propio Android (SystemClock)**, viva con la pantalla apagada y el JS congelado, sin foreground service (`:13-20`, `:143-153`). **Android-only** (`:126`) y **requiere build EAS nuevo**: "REQUIERE UN BUILD EAS NUEVO: es una dependencia NATIVA. Hasta que un build la incluya, el cronómetro vivo simplemente no aparece" (`:34-36`). Con `require` guardado que prueba `react-native-notify-kit` y cae a `@notifee/react-native` (`:71-91`); sin ninguno → NO-OP seguro.

**(c) Háptica + audio in-app** — `RestTimerBar.tsx`. Cuenta desde `endTimeRef` (timestamp absoluto), resistente a throttling de background (`:236-268`), re-computa al volver de background vía `AppState` (`:291-310`), y al llegar a 0 dispara `timerHaptics.restAlarm()` (patrón `[200,100,200,100,400]` en Android) + `playTimerCue('alarm')` en loop cada 3s hasta 5 veces (`:166-196`). El wake-lock lo maneja el núcleo del ejecutor, no la barra (`:42`).

### 3. Audio de timers: bundleado pero dormido

`sound.ts` es un subsistema completo pero inerte. Los 4 timbres (`digital`/`bell`/`classic`/`boxing`) y el tick de countdown ya están **bundleados y registrados al cargar el módulo** (`sound.ts:149-157`, `.wav` en `assets/audio/`). Pero `expo-audio` se importa con `require` guardado (`:42-48`) y todo es **no-op seguro hasta `expo install expo-audio` + build nativo** (`:22-23`, `:87-93`). Decisión de diseño clave ya tomada: `playsInSilentMode: true` (`:87-92`) para que el beep suene con el iPhone en silencio físico (paridad Strong/Hevy), con `duckOthers` para bajar (no cortar) la música del usuario. En web el audio ya suena vía `playTimerSound` (Web Audio, `RestTimer.tsx:120`).

### 4. Keep-awake / Wake lock: resuelto en ambas plataformas

- **RN sesión completa**: `ExecutorV2.tsx:124` `useKeepAwake()` con comentario "Wake-lock de TODA la sesión".
- **RN por fase**: `IntervalTimer.tsx:131-150` activa/desactiva `activateKeepAwakeAsync`/`deactivateKeepAwake` con tag y re-adquiere en foreground.
- **RN legacy**: `LegacyExecutor.tsx:123`.
- **Web**: `use-screen-wake-lock.ts:16-48` pide `navigator.wakeLock.request('screen')` al montar, re-adquiere en `visibilitychange` y degrada en silencio si no hay soporte; se invoca en `WorkoutExecutionClient.tsx:1143`. `RestTimer.tsx:155-169` refuerza durante el descanso.

Sin trabajo pendiente aquí; el rediseño hereda wake-lock gratis.

### 5. Multimedia del ejercicio (gif/video)

`VideoPlayer.tsx` ya resuelve la reproducción con degradación:

- YouTube nocookie vía IFrame API + mp4 vía `expo-video` (`VideoPlayer.tsx:26-27`).
- `expo-video` **no instalado todavía** → carga guardada con `require` (`:39-62`); mientras tanto reproduce **inline vía WebView + `<video>` HTML5** (`:199`).
- Tras `expo install expo-video` + build, usa el player nativo con `useVideoPlayer`/`VideoView` (`:238-283`).

Conclusión: la idea del CEO de "multimedia al centro sin tocar botones, sin ser invasivo" es **viable hoy** (WebView/gif) y **óptima tras instalar `expo-video`** (autoplay silencioso, loop, sin chrome de controles). `expo-image` (`package.json:61`) ya soporta gifs/webp animados nativos como alternativa ligera.

### 6. Apple Watch / HealthKit / BPM: inexistente

Cero coincidencias de `HealthKit`, `Apple Watch`, `heart rate`, `expo-health`, `react-native-health`, `Pedometer`, `expo-sensors` en `apps/mobile`. La visión de "cardio conectado a Apple Watch (BPM, distancia, tiempo)" es **greenfield total**:

- BPM/distancia en tiempo real desde el Watch → requiere `react-native-health` (HealthKit, iOS) o un companion watchOS app; ambos exigen **build nativo + capacidades/entitlements de Apple** y no existen en el proyecto.
- Distancia/pasos vía teléfono → `expo-sensors` (`Pedometer`) cubriría un MVP sin Watch, aprovechando el `NSMotionUsageDescription` **ya declarado** (`app.json:24`). Exige instalar el módulo + build.
- El progreso animado (tiempo/distancia) del cardio se puede construir ya con Reanimated/Skia (deps presentes) alimentado por el motor o por el pedómetro.

### 7. Celebraciones "tipo Duolingo": primitivas presentes, orquestación ausente

- Confetti nativo: `react-native-fast-confetti` en `WorkoutSummaryOverlay.tsx:327` (con colores de marca white-label) y `LegacyExecutor.tsx:504`.
- Haptic de récord: `haptics.pr()` (`haptics.ts:25-32`, Heavy + Success).
- Motor de animación para interstitials: `moti` + `reanimated` + `skia` (deps presentes), ya usados en la barra de descanso (`RestTimerBar.tsx` MotiView/anillo animado).
- Respeto a reduce-motion: patrón `motion.reduced` presente en toda la barra (`RestTimerBar.tsx:412-441`) — el rediseño debe conservarlo.
- **Falta**: un sistema de interstitials fullscreen entre ejercicios y celebraciones reactivas orquestadas; las piezas existen sueltas.
- White-label: los colores de confetti se toman de `theme.primary` (`WorkoutSummaryOverlay.tsx`, `LegacyExecutor.tsx:504`) — la "vibra" ya es marca-agnóstica, alineado con el requisito de no depender de una mascota única.

### 8. Capacidades PWA (web)

- **Wake Lock API**: `use-screen-wake-lock.ts:19-27` (`navigator.wakeLock`), con re-adquisición en `visibilitychange`.
- **Vibration API + háptica iOS 18+**: `haptics.ts:40-55` — `navigator.vibrate(pattern)` en Android/Chromium; en iOS 18+ usa el truco del `<input type=checkbox switch>` oculto (`:16-34`), que **sólo funciona dentro de un gesto real del usuario**, no en callbacks de timer (`:9-12`).
- **Notificaciones locales en background**: `RestTimer.tsx:132-148` — `registration.showNotification` sólo si hay permiso y la pestaña no está visible.
- **Media Session** (controles lockscreen/audífonos): `lib/media-session.ts` + `RestTimer.tsx` publican `MediaMetadata` y handlers play/pause.
- **Web Push**: `sw.js:194-213` (`push`/`notificationclick`, white-label) + `push.ts` (envío dual web-push + Expo).
- **Manifest PWA**: servido dinámicamente por coach en `/api/manifest/[coach_slug]/route.ts` con `display: standalone`, `orientation: portrait`, `theme_color`/`background_color` white-label (`:76-79`); default en `/api/manifest/default/route.ts:14-17`.
- **Service Worker offline-first** para `/c/` y `/t/`, con precache de la navegación del workout para sobrevivir modo avión (`sw.js:155-192`).
- **Fullscreen API**: sin uso actual (grep de `requestFullscreen` sin resultados en el ejecutor) — disponible pero no cableado.

### 9. Paridad y regresión conocida: Media Session en RN

`RestTimerBar.tsx:44-54` documenta la omisión: la web publica metadata "now playing" y handlers play/pause para lockscreen y botones de audífonos, pero **el port RN NO lo replica** porque no hay módulo nativo (`react-native-track-player` / `expo-music-control` no están en deps). Consecuencia: el descanso no se puede pausar/reanudar desde lockscreen ni audífonos en RN. Recuperarlo exige añadir un módulo nativo + config de build.

## Tabla de capacidades

Columnas: **RN hoy** / **RN posible** (módulo · ¿build nativa?) / **PWA hoy** / **PWA posible** / **Imposible**.

| Capacidad | RN hoy | RN posible (módulo · build) | PWA hoy | PWA posible | Imposible |
|---|---|---|---|---|---|
| Rest timer notif de fin (background) | Sí · `rest-notification.ts` (expo-notifications) | — | Sí · `RestTimer.tsx:132-148` | — | — |
| Cronómetro vivo (countdown en bandeja) | **No** (NO-OP) | Sí · `notify-kit`/Notifee · **BUILD NATIVA** (`rest-live-notification.ts:34-36`) · **Android-only** | No | Parcial (notif estática programada; no countdown vivo iOS) | Countdown vivo iOS PWA |
| Live Activities / Dynamic Island | No | Sí · extensión Swift + módulo · **BUILD NATIVA + entitlements** | No | No | PWA (imposible) |
| HealthKit / Watch BPM | **No** (inexistente) | Sí · `react-native-health` / companion watchOS · **BUILD NATIVA + entitlements Apple** | No | No | PWA sin acceso a HealthKit |
| Distancia / pasos (pedómetro) | **No** (permiso declarado, sin código · `app.json:24`) | Sí · `expo-sensors` (Pedometer) · **BUILD NATIVA** | No | Parcial · Geolocation API (GPS, no pasos) | Conteo de pasos fiable en PWA iOS |
| Haptics semánticos | Sí · `haptics.ts` (expo-haptics) | — | Sí · `haptics.ts` (Vibration + switch iOS 18+) | — | Patrones ms exactos en iOS (`haptics.ts:54-56`) |
| Audio de timers (beep/timbres) | **No** (dormido) | Sí · `expo-audio` · **BUILD NATIVA** (assets ya bundleados, `sound.ts:149-157`) | Sí · `playTimerSound` (Web Audio) | — | — |
| Keep-awake / Wake lock | Sí · `ExecutorV2.tsx:124`, `IntervalTimer.tsx` | — | Sí · `use-screen-wake-lock.ts` | — | Wake Lock en navegadores muy viejos (degrada) |
| Timers en background (JS vivo) | Parcial · cálculo por timestamp + notif; JS se congela | Foreground service (Android) · **BUILD NATIVA** | Parcial · timestamp + notif; JS se congela | — | JS ejecutándose en background (ambas) |
| Vibración | Sí · Android exacto, iOS fallback (`haptics.ts:58-65`) | — | Sí · `navigator.vibrate` (`haptics.ts:42`) | — | Vibración en iOS Safari fuera de gesto |
| Media Session (lockscreen/audífonos) | **No** (omitido · `RestTimerBar.tsx:44-54`) | Sí · `react-native-track-player` · **BUILD NATIVA** | Sí · `lib/media-session.ts` | — | — |
| Web Push | Sí · tokens Expo (`push.ts:24-42`) | — | Sí · `sw.js:194-213` + `push.ts` | — | Push en iOS PWA no instalada en Home Screen |
| Fullscreen | N/A (app siempre fullscreen) | — | **No cableado** | Sí · Fullscreen API (interstitials) | — |
| Video/gif del ejercicio | Sí · WebView `<video>` (`VideoPlayer.tsx:199`) | Óptimo · `expo-video` · **BUILD NATIVA** (`:238-283`); gifs vía `expo-image` | Sí · `<video>`/`<img>` | — | — |
| Confetti / celebraciones | Sí · `react-native-fast-confetti` | — | Sí (CSS/canvas) | Sí | — |

**Marcado explícito de BUILD NATIVA nueva** (precedente del repo: notify-kit ya la exigió): cronómetro vivo, Live Activities/Dynamic Island, HealthKit/Watch, pedómetro (`expo-sensors`), audio de timers (`expo-audio`), Media Session RN (`track-player`), video nativo (`expo-video`), foreground service.

## Recomendaciones para el rediseño (priorizadas)

**P0 — Encender lo que ya está codificado y sólo espera un build**

1. **Activar `expo-audio`** (`expo install expo-audio` + build EAS). Los 4 timbres y el tick 3-2-1 ya están bundleados y registrados (`sound.ts:149-157`); hoy son no-op. Bajo costo, alto impacto sensorial. Decisión de sonido-en-silencio ya tomada (`sound.ts:87-92`).
2. **Encender el cronómetro vivo de descanso en el próximo build EAS** (Android). `react-native-notify-kit` ya está en deps y con plugin (`package.json:87`, `app.json:114`); sólo falta que un build lo enlace (`rest-live-notification.ts:34-36`). Da el cronómetro nativo en lockscreen que el CEO pidió.
3. **Instalar `expo-video`** para la multimedia central del ejercicio (autoplay silencioso, loop, sin controles) — hoy cae a WebView (`VideoPlayer.tsx:199`). Para gifs ligeros, usar `expo-image` (ya presente). Esto habilita "multimedia al centro sin tocar botones".

**P1 — Recuperar paridad y construir la "vibra"**

4. **Recuperar Media Session en RN** (`react-native-track-player`) para pausar/reanudar el descanso desde lockscreen y audífonos, cerrando la regresión documentada en `RestTimerBar.tsx:44-54`. Requiere build nativa.
5. **Orquestar un sistema de interstitials + celebraciones** sobre las primitivas presentes (`moti`, `reanimated`, `skia`, `react-native-fast-confetti`, `haptics.pr`), respetando `motion.reduced` (`RestTimerBar.tsx:412-441`) y tomando color de `theme.primary` (white-label, no mascota). Fullscreen entre ejercicios en RN es gratis; en PWA usar Fullscreen API (aún no cableada).
6. **Extender los haptics semánticos** de `haptics.ts` con eventos del rediseño (inicio de serie, cambio de lado en movilidad, pasada completa en roller) reutilizando el vocabulario existente — sin costo de build.

**P2 — Cardio y sensores (greenfield, build nativa)**

7. **MVP de cardio con `expo-sensors` (Pedometer)** para pasos/cadencia/distancia estimada usando el `NSMotionUsageDescription` **ya declarado** (`app.json:24`), antes de abordar el Watch. Alimenta el progreso animado con Reanimated/Skia.
8. **Apple Watch / HealthKit BPM como fase posterior**: exige `react-native-health` o companion watchOS + entitlements de Apple + build; es el ítem de mayor esfuerzo. Diseñar el cardio para **degradar** (sin BPM muestra tiempo/distancia) igual que el stack degrada `expo-audio`/`expo-video`/`notify-kit` con `require` guardado.

**P3 — PWA hereda lo funcionalmente posible**

9. La PWA debe heredar el diseño y: wake-lock (ya), vibración con truco iOS 18+ dentro de gesto (`haptics.ts:49-54`), notif de fin en background (ya), y **cablear la Fullscreen API** para los interstitials. Aceptar como límites duros: sin cronómetro vivo iOS, sin HealthKit, sin JS en background, sin Live Activities. El SW offline-first ya protege la sesión (`sw.js:155-192`) y no debe romperse.

**Regla transversal**: seguir el patrón `require`-guardado + no-op seguro que ya usan `sound.ts`, `VideoPlayer.tsx` y `rest-live-notification.ts` para toda capacidad nativa nueva, de modo que el código compile y degrade sin crash cuando el módulo no esté enlazado, y la funcionalidad "aparezca" al llegar el build EAS que lo incluya.
