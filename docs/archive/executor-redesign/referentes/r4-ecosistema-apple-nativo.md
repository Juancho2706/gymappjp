# R4 — Ecosistema Apple/Android nativo para el ejecutor de EVA (Expo 54 / RN 0.81)

Investigacion sobre capacidades nativas de fitness en 2026 y como llegar a ellas desde
Expo 54 / React Native 0.81: HealthKit y frecuencia cardiaca en vivo, conexion con Apple
Watch (WatchConnectivity, WorkoutKit, sesiones espejo), Live Activities + Dynamic Island
para el cronometro de descanso, notificaciones con cuenta regresiva, keep-awake, hapticos
avanzados, celebraciones "tipo Duolingo" y el equivalente Android (Health Connect, Wear OS,
notificaciones ongoing). Todo cruzado con el requisito de build nativa (dev client) frente a
lo que funciona sin ella, con esfuerzo estimado y estado de mantenimiento de cada libreria.

## Resumen ejecutivo

- **Casi todo lo "nativo bueno" exige un dev client de EAS (build custom), no Expo Go.** HealthKit,
  Health Connect, Live Activities, WatchConnectivity y hapticos AHAP requieren prebuild y modulos
  nativos. Esto encaja con que EVA ya distribuye builds nativas desde `rnmobiledenuevo`.
- **Leer HR "guardado" es facil; leer HR "en vivo" durante la serie es caro.** Las librerias de
  HealthKit devuelven muestras historicas con latencia; el BPM latido-a-latido exige una app
  companion de watchOS con `HKWorkoutSession` que transmita por WatchConnectivity.
- **`react-native-health` (agencyenterprise)** lee `getHeartRateSamples`, workouts y distancia, pero
  NO hace streaming en vivo ni `HKWorkoutSession`; ultima release v1.19.0 (oct 2024), con reescritura
  en Swift pausada. Sirve como fuente post-hoc, no en tiempo real.
- **Open Wearables RN SDK (the-momentum)** salio 0.4 el 20-mar-2026: sincroniza HealthKit / Health
  Connect / Samsung Health en background hacia un backend propio. Es sync historico, NO streaming en vivo.
- **Apple Watch en vivo = app companion de watchOS.** `expo-watch-connectivity` (v0.1.0, muy verde)
  envuelve WatchConnectivity pero obliga a crear un target watchOS via `@bacons/expo-apple-targets`.
  Es el camino real para BPM en tiempo real, y es el de mayor esfuerzo de todo el informe.
- **`react-native-workouts` (Janjiran, WorkoutKit, iOS 17+, v0.2.3 ene-2026)** crea/previsualiza y
  envia rutinas al Apple Watch, pero NO da HR en vivo ni sesiones espejo. Util para "empujar el
  workout de cardio al reloj", no para leerlo.
- **`expo-live-activity` (software-mansion-labs) quedo DEPRECADA y archivada el 1-jun-2026.** El camino
  vigente es un modulo Expo propio con ActivityKit (iOS) + Live Updates de Android 16.
- **El cronometro de descanso en Live Activity / Dynamic Island cuenta SOLO en el lado del OS.** Usa el
  timer nativo de ActivityKit, asi que sigue corriendo con la app suspendida; no depende de un timer JS.
- **El JS de RN NO corre en background.** Cualquier cuenta regresiva basada en `setInterval` se congela
  al bloquear el telefono; hay que apoyarse en Live Activities + una notificacion local programada al
  segundo exacto del fin del descanso.
- **`expo-haptics` (SDK 57) solo trae presets** (impact/notification/selection + 18 tipos Android). Para
  patrones custom / AHAP con curvas de intensidad hacen falta modulos como `expo-ahap` o
  `candlefinance/haptics`.
- **Android: `react-native-health-connect` (matinzd, v3.5.3 may-2026, New Architecture OK)** es la
  contraparte de HealthKit; `minSdk 26`, requiere la app Health Connect (nativa en Android 14+).
- **Celebraciones Duolingo sin mascota de marca:** confeti y animaciones GPU con
  `react-native-fast-confetti` (Skia, v2.0.2 jul-2026, activo) y Lottie acelerado por Skia con
  `react-native-skottie`. La "vibra" se logra con color de marca + movimiento, no con un personaje.
- **La PWA hereda un subconjunto:** Wake Lock, Web Notifications, confeti canvas y Lottie web SI;
  HealthKit, Apple Watch, Live Activities y (en iOS Safari) la Vibration API NO.
- **Recomendacion de fases:** F1 sin dev client extra (hapticos preset, keep-awake, animaciones);
  F2 Live Activities + notificacion de descanso; F3 Health Connect + HealthKit historico; F4 (opcional,
  caro) companion watchOS para BPM en vivo.

## Hallazgos

### 1. HealthKit y frecuencia cardiaca (iOS): lo historico es barato, lo "en vivo" no

La libreria mas usada es `react-native-health` de agencyenterprise. Expone `getHeartRateSamples`,
`saveHeartRateSample`, `saveWorkout`, `getWorkoutRouteSamples` y distancias
(`getDistanceCycling`, `getDailyDistanceWalkingRunningSamples`), pero la documentacion no menciona
observacion en vivo ni `HKWorkoutSession`: esta orientada a leer muestras ya guardadas, no a hacer
streaming. Su ultima release es v1.19.0 (15-oct-2024) y los mantenedores declararon que estan
"conteniendo nuevas features" mientras preparan una reescritura en Swift, aceptando solo bugfixes
criticos; no confirma soporte de New Architecture (Fabric/TurboModules). No funciona en Expo Go, pero
trae `app.plugin.js` (config plugin) para dev client
(https://github.com/agencyenterprise/react-native-health).

Como alternativa "Expo-first" aparece `@kayzmann/expo-healthkit`, que se promociona como integracion
moderna con cero configuracion nativa y 50+ metricas de salud
(https://www.npmjs.com/package/@kayzmann/expo-healthkit) — util evaluarla, aunque es menos veterana.

Para agregacion multi-wearable esta Open Wearables RN SDK (the-momentum). Su version 0.4 salio el
20-mar-2026 y su documentacion es explicita: hace "sincronizacion en background de datos de salud desde
Apple HealthKit (iOS), Samsung Health y Health Connect (Android)" hacia una plataforma/backend propio,
con 40+ tipos de dato (pasos, distancia, HR, workouts, sueno). No hay soporte de streaming en vivo ni de
workout activo: es sync periodico de datos historicos
(https://openwearables.io/docs/sdk/react-native, https://www.themomentum.ai/blog/open-wearables-0-4-release).

Conclusion clave para el ejecutor de cardio: leer "cuanto corriste / que HR tuviste" DESPUES de la sesion
es viable con cualquiera de estas librerias. Mostrar el BPM latido-a-latido MIENTRAS el alumno pedalea
NO lo resuelve HealthKit desde el telefono: las observer queries de HealthKit llegan con retraso y la
unica via de baja latencia es una `HKWorkoutSession` corriendo en el Apple Watch.

### 2. Conexion con Apple Watch: BPM en vivo = app companion de watchOS

El BPM en tiempo real durante el cardio exige un target watchOS que inicie `HKWorkoutSession`, capture
HR con `HKLiveWorkoutBuilder` y lo transmita al iPhone. El puente RN <-> reloj se hace con
`expo-watch-connectivity` (ixacik), que envuelve WatchConnectivity con mensajeria en tiempo real
(requiere reachability), application context (ultimo-gana), user info transfers, file transfers y datos de
complication. Es iOS-only y esta muy verde: v0.1.0, 26 stars, y confirma que hay que construir una app
companion de watchOS via `@bacons/expo-apple-targets`
(https://github.com/ixacik/expo-watch-connectivity). Otro recurso concreto muestra el patron
bidireccional con TurboModules y `WCSession`, pero pasando datos genericos (peso, digital crown), no
biometria — es decir, el transporte existe, el streaming de HR hay que escribirlo
(https://keiver.dev/lab/apple-watch-app-with-react-native-bidirectional-communication).

Complementario pero distinto: `react-native-workouts` (Janjiran) usa WorkoutKit (iOS 17+, v0.2.3,
12-ene-2026) para crear, previsualizar y sincronizar rutinas al Apple Watch (intervalos, pacer,
multisport) con la UI de sistema "Add/Send to Watch". Es explicito en que NO ofrece HR en vivo ni
sesiones espejo: sirve para "empujar" el workout de cardio al reloj para que el alumno lo ejecute alli,
no para leerlo en la app (https://github.com/Janjiran/react-native-workouts). Las sesiones espejo
(mirrored workout sessions, iOS 17 / watchOS 10) permiten mantener reloj e iPhone sincronizados sin
WatchConnectivity, pero igual requieren la app de reloj.

Esfuerzo: esta es la capacidad mas cara del informe (target watchOS nuevo, entitlements, HealthKit en
reloj, QA en hardware fisico, review de App Store del target). Recomendacion: tratarla como F4 opcional,
para el subconjunto de alumnos con Apple Watch, y NO bloquear el rediseno del ejecutor con ella.

### 3. Live Activities + Dynamic Island para el cronometro de descanso

`expo-live-activity` de software-mansion-labs soportaba Live Activities, imagenes en Dynamic Island y
timers/progress bars (iOS 16.2+, push-to-start 17.2+, dev client obligatorio), pero **quedo deprecada y el
repo fue archivado el 1-jun-2026**, recomendando migrar a otras soluciones como `expo-widgets`
(https://github.com/software-mansion-labs/expo-live-activity). Por eso el camino vigente en 2026 es
construir un modulo Expo propio, segun documenta el handbook de freeCodeCamp: una API TypeScript unica
con dos implementaciones nativas. En iOS se usa ActivityKit (`Activity.request()` con `pushType: .token`
para tokens APNs por actividad), separando `ActivityAttributes` inmutables de `ContentState` dinamico. Un
detalle critico de firma: el JWT ES256 con la `.p8` debe usar `dsaEncoding: "ieee-p1363"` o falla en
silencio con `403 InvalidProviderToken` (https://www.freecodecamp.org/news/react-native-live-activities-handbook/).

Punto decisivo para el rest timer: la cuenta regresiva de una Live Activity se renderiza con el timer
nativo del sistema (por ejemplo `Text(timerInterval:)`), asi que **cuenta sola en el lado del OS aunque la
app este suspendida** — es exactamente el comportamiento que se quiere para "descansa 90s con el telefono
bloqueado en el bolsillo". Requiere entitlement `aps-environment` y app groups compartidos, mas prebuild.

### 4. El JS no corre en background: notificaciones y keep-awake

Limitacion dura: en background la app RN se suspende y no ejecuta codigo, incluidos los timers JS, por lo
que una cuenta regresiva basada en `setInterval` se congela al bloquear la pantalla. Las notificaciones de
background tampoco garantizan entrega (Doze en Android; Apple recomienda no mas de 2-3 por hora). Por eso
el patron correcto del cronometro de descanso es doble: (a) la Live Activity nativa muestra la cuenta en
lock screen / Dynamic Island, y (b) una **notificacion local programada** (con `expo-notifications`) al
segundo exacto del fin avisa aunque la Live Activity no este. Mientras la pantalla del ejecutor esta
activa, `expo-keep-awake` evita que se apague entre series (util cuando el alumno deja el telefono apoyado
mirando el gif del ejercicio).

En Android el equivalente de la Live Activity son las notificaciones ongoing: con `setUsesChronometer` /
`setWhen` se obtiene un cronometro que cuenta en la propia notificacion, y desde API 36 (Android 16)
`ProgressStyle` permite barras de progreso segmentadas con puntos de hito; las "promoted ongoing"
(API 36.1) requieren `setRequestPromotedOngoing(true)` y `canPostPromotedNotifications()` para detectar
soporte real del dispositivo (https://www.freecodecamp.org/news/react-native-live-activities-handbook/).

### 5. Hapticos: presets faciles, patrones custom con modulo aparte

`expo-haptics` (documentado en SDK 57) cubre impact (light/medium/heavy/rigid/soft), notification
(success/warning/error), selection y 18+ tipos `AndroidHaptics` que no requieren permiso VIBRATE. Pero
**no soporta patrones Core Haptics custom ni archivos AHAP**: solo los presets. Ademas el Taptic Engine se
inactiva en Low Power Mode, con la camara o el dictado activos
(https://docs.expo.dev/versions/latest/sdk/haptics/). Para hapticos ricos (curvas de intensidad/sharpness,
sincronizados con audio, celebracion "movida" al terminar la serie) hacen falta modulos como `expo-ahap`
(implementa la API de Apple para AHAP con `ParameterCurve`), `candlefinance/haptics` (UIImpact + CoreHaptics
+ AHAP) o `expo-better-haptics`. La practica recomendada es disenar el `.ahap` para iOS y dar un `pattern()`
de fallback en Android. Esto exige otro modulo nativo en el dev client, pero el impacto de "vibra" por poco
costo es alto: un patron de exito al cerrar el ultimo set es de los detalles que mas suben la sensacion
premium.

### 6. Android: Health Connect como contraparte de HealthKit

`react-native-health-connect` (matinzd) es la libreria de referencia: v3.5.3 (15-may-2026, 40 releases),
soporta New Architecture y old, TypeScript completo, con config plugin `expo-health-connect` para prebuild
+ EAS. Requiere `minSdkVersion 26` (Android 8) y, en Android 14+, Health Connect vive dentro del framework
del SO; en Android 13 hay que instalar la app Health Connect. Lee y escribe pasos, HR, distancia, calorias,
sesiones de ejercicio y sueno con filtros por rango de tiempo, es decir agregado/historico, no streaming
en vivo (https://github.com/matinzd/react-native-health-connect). El equivalente al streaming en vivo de
Apple Watch seria Wear OS con una app companion + Health Services, analogo (y tan caro) como el camino
watchOS.

### 7. Celebraciones "tipo Duolingo" sin mascota de marca

Como EVA es white-label, la vibra no puede colgar de un personaje unico: se logra con color de marca +
movimiento GPU. `react-native-fast-confetti` (AlirezaHadjar) es confeti Skia de alto rendimiento con
variantes `Confetti`, `ContinuousConfetti`, `PIConfetti` (burst) y `CannonConfetti`; activo, v2.0.2
(jul-2026), depende de `@shopify/react-native-skia` 2.x, `react-native-reanimated` 3.15.5+ y
`react-native-worklets` (https://github.com/AlirezaHadjar/react-native-fast-confetti). El confeti puede
teñirse con el color primario del coach. Para animaciones vectoriales (interstitials fullscreen entre
ejercicios, badges de logro) `react-native-skottie` (margelo) renderiza Lottie con Skia y midio +63% de
FPS frente a `lottie-react-native` en Android gama baja, con menor CPU; soporta `.json` y `.lottie`
(https://github.com/margelo/react-native-skottie). Nota: su ultima release visible es v2.1.4 (may-2024),
asi que conviene validar compatibilidad con Skia 2.x antes de adoptarlo, o quedarse con
`lottie-react-native` si se prioriza mantenimiento. Con Skia + Reanimated se arman los interstitials
animados, la barra de progreso del cardio y los numeros grandes con transicion, todo a 60fps.

## Aplicabilidad a EVA

### RN nativo (apps/mobile, ExecutorV2) — la mejor experiencia

- **Cronometro de descanso (alta prioridad, esfuerzo medio):** modulo Expo propio de Live Activity con timer
  nativo de ActivityKit (iOS) + notificacion local al fin del descanso; en Android, notificacion ongoing con
  `setUsesChronometer` y `ProgressStyle` (API 36). Nunca depender de `setInterval` JS para el fin en background.
- **Hapticos (alta prioridad, esfuerzo bajo-medio):** empezar con `expo-haptics` (feedback de tap en botones
  grandes, success al completar set). En F2, `expo-ahap`/`candlefinance` para un patron de celebracion custom
  al cerrar el ejercicio.
- **Multimedia del ejercicio (media prioridad):** gif/video al centro sin botones se resuelve con `expo-video`
  / `expo-image` (gif->webp por cuota Supabase, ya conocido) + `expo-keep-awake` para no apagar pantalla.
- **Celebraciones (media prioridad, esfuerzo bajo):** `react-native-fast-confetti` teñido con color de marca +
  Lottie (skottie o lottie-react-native) para interstitials entre ejercicios y al terminar la rutina.
- **Cardio con BPM en vivo (baja prioridad, esfuerzo ALTO):** solo con app companion watchOS + WatchConnectivity;
  tratar como F4 opt-in. Mientras tanto, mostrar tiempo/distancia con progreso animado local y leer HR/distancia
  post-sesion via HealthKit / Health Connect.
- **Movilidad y roller:** no requieren nativo especial; son UX (holds por lado con haptico de cambio de lado,
  contador de pasadas con tap grande + haptico). El haptico marca el ritmo sin mirar la pantalla.
- **Requisito transversal:** TODO esto necesita dev client de EAS (ya en uso). Nada de esto corre en Expo Go.

### PWA responsive (apps/web, WorkoutExecutionClient) — hereda el subconjunto posible

- **Si hereda:** diseño visual identico (numeros grandes, gif central, teclado numerico), Wake Lock API
  (keep-awake), Web Notifications para el fin del descanso, confeti con `canvas-confetti` y Lottie web
  (`@lottiefiles/dotlottie-web`), y animaciones con Web Animations API / CSS.
- **No hereda:** Live Activities / Dynamic Island, HealthKit, Health Connect, Apple Watch, y en iOS Safari la
  Vibration API (Safari no la implementa; Android Chrome si). El rest timer en PWA cuenta bien solo con la
  pestana activa; en background hay que apoyarse en Web Notifications programadas y aceptar menor fiabilidad.
- **Estrategia:** que la PWA degrade con gracia — misma UI y celebraciones visuales, sin prometer BPM en vivo
  ni cronometro garantizado con pantalla apagada.

### Compartido en packages/*

- **`packages/workout-engine` sigue puro:** logica de series/reps/RIR, progresion y estado del ejecutor sin
  dependencias de plataforma. Los 4 tipos de ejercicio (fuerza, cardio, movilidad, roller) se modelan aqui,
  incluida la maquina de estados de holds por lado y conteo de pasadas.
- **Capa de capacidades (nueva, recomendada):** una interfaz `ExecutorCapabilities` en un package compartido
  (`haptic()`, `startRestTimer()`, `keepAwake()`, `celebrate()`, `readHeartRate()`), con implementacion nativa
  (Live Activity, expo-haptics/ahap, HealthKit) e implementacion web (Wake Lock, canvas-confetti, no-op para
  HR). Asi el ejecutor consume una sola API y cada plataforma resuelve lo que puede — fail-closed cuando la
  capacidad no existe.
- **No duplicar:** formato de datos de la sesion (sets loggeados, tiempos de descanso, resultado de cardio)
  vive en contratos compartidos para que web y RN escriban lo mismo a Supabase.

## Fuentes

- [react-native-health (agencyenterprise) — GitHub](https://github.com/agencyenterprise/react-native-health)
- [react-native-health-connect (matinzd) — GitHub](https://github.com/matinzd/react-native-health-connect)
- [Open Wearables React Native SDK — Docs](https://openwearables.io/docs/sdk/react-native)
- [react-native-workouts (WorkoutKit, Janjiran) — GitHub](https://github.com/Janjiran/react-native-workouts)
- [expo-watch-connectivity (ixacik) — GitHub](https://github.com/ixacik/expo-watch-connectivity)
- [Bidirectional Apple Watch <-> React Native (keiver.dev)](https://keiver.dev/lab/apple-watch-app-with-react-native-bidirectional-communication)
- [expo-live-activity (software-mansion-labs, deprecada) — GitHub](https://github.com/software-mansion-labs/expo-live-activity)
- [The React Native Live Activities Handbook — freeCodeCamp](https://www.freecodecamp.org/news/react-native-live-activities-handbook/)
- [Haptics — Expo Documentation](https://docs.expo.dev/versions/latest/sdk/haptics/)
- [react-native-fast-confetti (AlirezaHadjar) — GitHub](https://github.com/AlirezaHadjar/react-native-fast-confetti)
- [react-native-skottie (margelo) — GitHub](https://github.com/margelo/react-native-skottie)
