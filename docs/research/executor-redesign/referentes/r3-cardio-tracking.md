# Teardown de apps de cardio: metricas en vivo, Apple Watch y celebraciones aplicadas al ejecutor cardio de EVA

Investigacion de referentes (r3-cardio) para el rediseno del ejecutor de entrenamiento de EVA. Foco en los ejercicios de tipo **cardio**: barras y anillos de progreso animados, BPM con zonas de color, pace/distancia/tiempo en vivo, integracion con Apple Watch, audio coaching, splits/laps, celebraciones de milestones, y el caso especial del **cardio indoor de gimnasio** (cinta, bici, remo) sin GPS, con countdown animado de cuanto falta por tiempo o distancia.

## Resumen ejecutivo

- El cardio se vive mirando poco la pantalla: las apps top (Nike Run Club, Runna) apuestan por **audio y haptics context-aware** para que el alumno reciba la info en el momento justo sin tener que mirar el celular ([Nike, about.nike.com](https://about.nike.com/en/newsroom/releases/nike-run-club-app-new-features)).
- La convencion de color de zonas de frecuencia cardiaca es casi universal y transversal a la industria: **Zona 1 azul (50-60% FCmax), Zona 2 verde (60-70%), Zona 3 amarillo (70-80%), Zona 4 naranja (80-90%), Zona 5 rojo (90-100%)** ([Ultrahuman](https://ultrahuman.com/blog/what-are-heart-rate-zone-colours/)).
- Apple presenta la FC en **5 segmentos** de esfuerzo estimado (de facil a maximo), calculados y personalizados automaticamente desde los datos de salud del usuario ([Apple Support](https://support.apple.com/guide/watch/view-heart-rate-zones-apd897dccddf/watchos)).
- Fitness+ muestra las zonas de FC **en vivo** en el iPhone/Apple TV durante el workout, pero NO como metrica en vivo en la muñeca del reloj ([techsolutions.support.com](https://www.techsolutions.support.com/how-to/use-heart-rate-zones-on-apple-watch)).
- Peloton usa una **barra segmentada** (7 zonas en bici, 7 segmentos de pace en cinta) con una **caja blanca** que marca la zona objetivo que el coach acaba de cantar, encima de tu posicion actual: el patron "estas aqui vs deberias estar aqui" ([Peloton Buddy](https://www.pelobuddy.com/power-zone-indicator-bike/)).
- Peloton da **feedback visual inmediato con triangulos verde/rojo** que indican si tu output promedio esta subiendo o bajando ([Peloton Support](https://support.onepeloton.com/hc/en-us/articles/203325985-Understanding-your-metrics)).
- Los anillos/barras de progreso animados cambian de color segun avanza el tiempo (verde -> ambar -> rojo) y se implementan con SVG dash-offset o conic-gradient sin librerias pesadas ([CSS-Tricks](https://css-tricks.com/how-to-create-an-animated-countdown-timer-with-html-css-and-javascript/)).
- Nike Run Club premia milestones concretos: badges por 5K/10K/media/maraton, umbrales de km acumulados (100, 500, 1000 millas) y records personales que la app **anuncia explicitamente** en el resumen post-run ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)).
- NRC compite contra tu **yo del pasado**, no contra otros: el foco esta en lo que lograste, no en lo que te falto; esto sube la retencion a 14 dias de 20% a 34% cuando se completa un logro el dia 1 ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study), [Medium](https://medium.com/design-bootcamp/how-the-nike-run-club-app-got-runners-hooked-2850c7654fc5)).
- NRC usa **confetti digital y feedback haptico** para celebrar pequeñas victorias mid-run, mas cheers de audio enviables entre amigos ([StriveCloud](https://www.strivecloud.io/blog/gamification-examples-nike-run-club), [Nike](https://about.nike.com/en/newsroom/releases/nike-run-club-app-new-features)).
- En iOS, HealthKit expone la FC en tiempo real via `HKLiveWorkoutBuilder` con `mostRecentQuantity()`; distancia y calorias via `sumQuantity()`; el reloj sigue siendo el dispositivo maestro y el iPhone **espeja** la sesion ([Apple Developer](https://developer.apple.com/documentation/HealthKit/running-workout-sessions), [createwithswift](https://www.createwithswift.com/tracking-workouts-with-healthkit-in-ios-apps/)).
- Desde iOS 26 las APIs de workout antes exclusivas del Apple Watch estan disponibles en iPhone/iPad, habilitando tracking consistente sin reloj ([createwithswift](https://www.createwithswift.com/tracking-workouts-with-healthkit-in-ios-apps/)).
- El iPhone no tiene sensor de FC propio: sin Apple Watch la FC requiere monitor Bluetooth externo; distancia y calorias si salen de los sensores de movimiento ([createwithswift](https://www.createwithswift.com/tracking-workouts-with-healthkit-in-ios-apps/)).
- Runna conecta con cintas via Bluetooth FTMS y ajusta pace/inclinacion automaticamente; si la cinta no es smart ofrece modo **manual**, cubriendo el caso indoor sin GPS ([Runna Support](https://support.runna.com/en/articles/13616950-how-to-record-a-treadmill-workout), [Running Industry Alliance](https://www.runningindustryalliance.com/runna-introduces-first-of-its-kind-treadmill-connectivity-feature/)).
- Runna entrega **audio cues por parlante del celular o reloj** que guian intervalo por intervalo, incluyendo descansos y recuperaciones ([Runna Support](https://support.runna.com/en/articles/8159780-setting-up-and-managing-your-audio-cues)).
- Strava muestra en vivo el **pace promedio del split** al correr y velocidad actual al pedalear; un halo alrededor de la ubicacion indica fuerza de senal GPS ([Strava Support](https://support.strava.com/en-us/articles/15402137-recording-an-activity)).

## Hallazgos

### 1. La pantalla de cardio se disena para NO mirarla

Nike Run Club fue construida sobre una idea clave: durante el cardio el usuario no puede (ni quiere) estar mirando la pantalla. Por eso invirtieron en "smart, context-aware audio and haptic feedback" que entrega la guia "at the exact moment they need it, without having to look at their smartwatch or phone screens" ([Nike](https://about.nike.com/en/newsroom/releases/nike-run-club-app-new-features)). Durante la corrida la app puede leer en voz alta distancia, pace, tiempo transcurrido y actualizaciones de split segun la configuracion; cuando entra la voz del coach, la musica baja de volumen automaticamente ([Wareable](https://www.wareable.com/running/nike-plus-run-club-guide-how-to-use-running-430)).

Implicancia de diseno: la pantalla de cardio debe tener **una sola cifra protagonista gigante** (el tiempo o la distancia restante), legible de reojo a un brazo de distancia, y delegar el resto a audio/haptics. Todo lo secundario (BPM, calorias, splits) va en tamaño reducido alrededor.

### 2. Convencion universal de zonas de FC por color

La investigacion confirma que existe una convencion casi universal, transversal a Apple, Ultrahuman, Myzone, Garmin y BitGym. Ultrahuman la documenta explicitamente: Zona 1 azul (50-60% FCmax, warm-up/recuperacion), Zona 2 verde (60-70%, base de resistencia), Zona 3 amarillo (70-80%, umbral aerobico), Zona 4 naranja (80-90%, umbral anaerobico, 10-15 min max), Zona 5 rojo (90-100%, maxima intensidad, solo 30s a 2 min) ([Ultrahuman](https://ultrahuman.com/blog/what-are-heart-rate-zone-colours/)).

Apple presenta la FC en **5 segmentos** "ranging from easier to harder", personalizados automaticamente con los datos de salud del usuario ([Apple Support](https://support.apple.com/guide/watch/view-heart-rate-zones-apd897dccddf/watchos)). La psicologia del color respalda la convencion: azul calma, verde comunica salud/equilibrio (ideal para trackers), rojo energiza (ideal para alta intensidad) ([UXmatters](https://www.uxmatters.com/mt/archives/2024/07/leveraging-the-psychology-of-color-in-ux-design-for-health-and-wellness-apps.php)).

Implicancia de white-label para EVA: la **paleta de zonas de FC es semantica, no de marca**. Los 5 colores azul/verde/amarillo/naranja/rojo deben ser tokens semanticos fijos (como los colores de exito/error) que NO se re-tinten con la marca del coach, porque comunican fisiologia universal. Solo el chrome (fondos, acentos de UI, botones) hereda la marca.

### 3. El patron Peloton: "estas aqui" vs "deberias estar aqui"

Peloton muestra tres metricas primarias: cadencia (RPM), resistencia (% de 0-100) y output (watts), mas output total acumulado en kilojoules ([Peloton Support](https://support.onepeloton.com/hc/en-us/articles/203325985-Understanding-your-metrics)). Lo interesante para EVA es la **barra segmentada de zonas**: durante clases Power Zone aparece una barra de 7 segmentos y una **caja blanca** que resalta la zona objetivo que el coach acaba de cantar, sobre tu posicion actual ([Peloton Buddy](https://www.pelobuddy.com/power-zone-indicator-bike/)). En cinta el mismo patron aplica a 7 segmentos de pace ([Peloton Buddy](https://www.pelobuddy.com/pace-target-classes-tread/)).

Ademas, Peloton da **feedback visual instantaneo con triangulos verde/rojo** que indican si tu output promedio esta subiendo o bajando en el corto plazo ([Peloton Support](https://support.onepeloton.com/hc/en-us/articles/203325985-Understanding-your-metrics)). Post-clase muestra graficos de "Time in Zone" con rangos coloreados (purpura, azul, verde, naranja, rojo) mapeados detras de tu rendimiento real ([Peloton Buddy](https://www.pelobuddy.com/target-power-zone-graph/)).

Implicancia: si el coach de EVA define una zona objetivo de FC para un bloque de cardio, la UI debe mostrar simultaneamente el objetivo (marco/caja) y tu valor actual (relleno), con un microindicador de tendencia (flecha arriba/abajo, verde/rojo). Es la forma mas rica de comunicar "vas bien / apura / baja" sin texto.

### 4. Barras y anillos de progreso animados para el countdown indoor

Para el cardio indoor de gimnasio (cinta, bici, remo, sin GPS) el heroe visual es el **countdown animado de cuanto falta** por tiempo o por distancia. El patron de la industria: un anillo circular que empieza lleno y se vacia, o una barra que se consume, con **cambio de color progresivo verde -> ambar -> rojo** a medida que el tiempo se agota ([CSS-Tricks](https://css-tricks.com/how-to-create-an-animated-countdown-timer-with-html-css-and-javascript/)). Tecnicamente se logra con SVG `stroke-dashoffset`, `conic-gradient` en CSS puro, o `requestAnimationFrame`, sin librerias externas; en React/RN existe `react-countdown-circle-timer` que hace exactamente esto con animacion de color y progreso basada en SVG ([GitHub](https://github.com/vydimitrov/react-countdown-circle-timer)).

Un principio de diseno relevante (Time2Rest, app de descanso para gym-goers): usar **un unico timer activo destacado** y representar el grupo de intervalos como medidas de progreso, manteniendo todas las pantallas dentro de la misma familia visual ([Medium/penguinchilli](https://medium.com/@penguinchilli/ui-design-time2rest-app-66321d75ff55)).

Implicancia: el cardio indoor de EVA se resuelve con un anillo/barra grande de progreso (tiempo o distancia objetivo), animado a 60fps, que domina la pantalla. Si el bloque es por distancia y no hay GPS, el progreso se alimenta de: (a) cinta smart via Bluetooth FTMS, (b) entrada manual del alumno, o (c) estimacion por tiempo x pace objetivo. El anillo debe reaccionar con celebracion al llegar a 100%.

### 5. Cardio indoor sin GPS: como lo resuelve Runna

Runna fue "first of its kind" en conectividad con cintas: via Bluetooth FTMS ajusta paces e inclinaciones automaticamente segun los movimientos del usuario, entregando un workout inmersivo ([Running Industry Alliance](https://www.runningindustryalliance.com/runna-introduces-first-of-its-kind-treadmill-connectivity-feature/)). Al iniciar un treadmill workout el usuario elige entre **cinta smart (Bluetooth FTMS)** o **cinta manual** ([Runna Support](https://support.runna.com/en/articles/13616950-how-to-record-a-treadmill-workout)). Para cualquier workout con targets de pace, Runna entrega **audio cues en vivo** por parlante del celular o reloj compatible, guiando paso a paso cada intervalo incluyendo descansos y recuperaciones ([Runna Support](https://support.runna.com/en/articles/8159780-setting-up-and-managing-your-audio-cues)).

Implicancia: EVA no necesita GPS para un buen cardio indoor. El plan del coach define bloques (tiempo/distancia/pace), y la app los reproduce con countdown visual + audio cues. La conexion FTMS con cinta es un plus futuro; el modo manual con entrada del alumno cubre el 100% de los casos desde el dia 1.

### 6. Integracion Apple Watch: el reloj es el maestro, el iPhone espeja

Arquitectura HealthKit para cardio en vivo: `HKWorkoutConfiguration` (tipo + indoor/outdoor), `HKWorkoutSession` (ciclo de vida), `HKLiveWorkoutBuilder` (recoleccion y guardado en tiempo real) y `HKLiveWorkoutDataSource` (jala datos de sensores sin gestion manual) ([createwithswift](https://www.createwithswift.com/tracking-workouts-with-healthkit-in-ios-apps/)). La FC se obtiene con `mostRecentQuantity()`; calorias y distancia con `sumQuantity()` ([createwithswift](https://www.createwithswift.com/tracking-workouts-with-healthkit-in-ios-apps/)).

Limitacion clave: las **live workout sessions solo existen en watchOS, no en iOS**; el iPhone puede espejar la sesion del reloj pero **el reloj sigue siendo el dispositivo principal** ([Apple Developer forums](https://developer.apple.com/forums/thread/740630)). Apple introdujo nuevas Workout APIs para controlar y espejar sesiones activas entre reloj e iPhone (WWDC23 "Build a multi-device workout app"), y desde **iOS 26** las APIs de workout antes exclusivas del reloj estan en iPhone/iPad ([Apple Developer](https://developer.apple.com/videos/play/wwdc2025/322/), [createwithswift](https://www.createwithswift.com/tracking-workouts-with-healthkit-in-ios-apps/)). Sin reloj, el iPhone no tiene sensor de FC: requiere monitor Bluetooth externo; distancia y calorias si salen de los sensores de movimiento ([createwithswift](https://www.createwithswift.com/tracking-workouts-with-healthkit-in-ios-apps/)).

Implicancia: EVA debe diseñar el cardio con **degradacion elegante**: (1) con Apple Watch -> BPM en vivo con zonas de color, distancia y calorias espejadas; (2) sin reloj pero con monitor BT -> BPM; (3) solo iPhone -> tiempo, distancia estimada, pace, calorias por movimiento, sin BPM. La UI debe ocultar limpiamente el modulo de BPM cuando no hay fuente, no mostrar "--".

### 7. Celebraciones de milestones al estilo Duolingo/NRC

Nike Run Club es famosa por sus celebraciones. Premia milestones concretos: badges de primera 5K (incluso en la primera sesion), 10K, media, maraton, y umbrales de distancia acumulada (100, 500, 1000 millas), mas streaks semanales (al menos una corrida por semana, no diarias, para acomodar dias de descanso) ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)). Cada vez que fijas un nuevo record en una distancia ya corrida, "the app calls it out explicitly" ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)). Usa **confetti digital + haptics** para celebrar victorias mid-run ([StriveCloud](https://www.strivecloud.io/blog/gamification-examples-nike-run-club)).

El impacto en retencion esta medido: completar cualquier logro el dia 1 sube la retencion a 14 dias de 20.46% a 33.96%; los usuarios que completan logros de tier mas dificil retienen 74% vs 32% del tier facil ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)). La filosofia: compites contra tu yo del pasado, "the design of the app very much focuses on what you have achieved, instead of what you have missed" ([Medium](https://medium.com/design-bootcamp/how-the-nike-run-club-app-got-runners-hooked-2850c7654fc5)). Post-run, el usuario califica con thumbs up/down y elige descriptores como "Good Coaching", lo que le permite "label positive emotions" e intensificar la conexion emocional ([Medium](https://medium.com/design-bootcamp/how-the-nike-run-club-app-got-runners-hooked-2850c7654fc5)).

Implicancia: el cardio de EVA debe celebrar milestones intra-sesion (mitad del bloque, ultimo minuto, meta alcanzada) con confetti + haptics + microcopys del coach, y en el resumen post-cardio anunciar records personales explicitamente ("nuevo record de distancia", "mejor pace en 5 min"). Todo esto debe ser **white-label-safe**: sin mascota unica, usando confetti con los colores de la marca del coach y un lenguaje de celebracion neutro.

### 8. Metricas en vivo: que mostrar y como jerarquizar

Strava muestra en vivo el **pace promedio del split** al correr, velocidad actual al pedalear (y promedio al pausar), elevacion actual + ganancia total, y un halo alrededor de la ubicacion cuya circunferencia indica la fuerza de senal GPS ([Strava Support](https://support.strava.com/en-us/articles/15402137-recording-an-activity)). Strava reconoce que el espacio es limitado: si tiempo y distancia ocupan mucho, algunas metricas (elevacion o pace) no se muestran por falta de espacio ([Strava Support](https://support.strava.com/hc/en-us/articles/15422373796493-Activity-Stats-in-the-Feed)). Peloton comunica cadencia, resistencia y output multiples veces por segundo ([Peloton Support](https://support.onepeloton.com/hc/en-us/articles/203325985-Understanding-your-metrics)).

Implicancia: jerarquia clara para EVA cardio. Nivel 1 (gigante, centro): progreso restante (anillo/barra tiempo o distancia). Nivel 2 (grande, debajo): la metrica objetivo del bloque (pace o BPM zona). Nivel 3 (chips pequeños): tiempo transcurrido, calorias, distancia. Ocultar lo que no aplica en vez de mostrar placeholders.

## Aplicabilidad a EVA

### RN nativo (la mejor experiencia)

- **Anillo de countdown protagonista** para cardio indoor: SVG animado a 60fps con `react-native-svg` + Reanimated (ya en el stack), color progresivo verde->ambar->rojo. Alimentado por tiempo objetivo, o distancia si hay fuente (cinta FTMS futura, manual, o estimacion pace x tiempo).
- **BPM con zonas de color via Apple Watch**: implementar sesion espejo con HealthKit (`HKWorkoutSession` en el reloj, `HKLiveWorkoutBuilder`, mirroring al iPhone). Mostrar BPM en vivo con la paleta semantica de 5 zonas azul/verde/amarillo/naranja/rojo. Degradacion elegante: sin reloj -> monitor BT -> solo iPhone (sin BPM). Requiere modulo nativo / config plugin de Expo; validar contra Expo 54 / RN 0.81.
- **Patron Peloton objetivo-vs-actual**: si el bloque tiene zona de FC o pace objetivo, mostrar caja/marco de objetivo + relleno actual + microflecha de tendencia (verde sube / rojo baja).
- **Audio cues + haptics context-aware**: leer en voz (TTS o clips) hitos del intervalo, transiciones y cuenta regresiva final; usar `expo-haptics` para pulsos en cambios de bloque, meta y celebracion. La info primaria llega sin mirar la pantalla.
- **Cronometro de descanso con capacidades nativas**: notificaciones locales + Live Activity (iOS Dynamic Island) para que el countdown de descanso siga visible con la pantalla bloqueada; haptico al terminar.
- **Celebraciones**: confetti (Reanimated/Skia) con colores de la marca del coach al 50%, ultimo minuto y meta; anuncio explicito de records personales en el resumen post-cardio. Sin mascota de marca.
- **Multimedia central**: gif/video del ejercicio de cardio (o del bloque) reproducido en loop al centro, sin controles invasivos, detras/junto al anillo de progreso.

### PWA responsive (hereda todo lo funcionalmente posible)

- **Countdown animado** con SVG `stroke-dashoffset` o `conic-gradient` (CSS puro) y `requestAnimationFrame`; identico lenguaje visual que RN.
- **BPM**: en web no hay HealthKit. Ofrecer entrada manual o, donde el navegador lo permita, Web Bluetooth para monitores de FC compatibles (soporte limitado, tratar como progresivo/opcional). Si no hay fuente, ocultar el modulo BPM.
- **Zonas de color, jerarquia de metricas, patron objetivo-vs-actual y celebraciones (confetti CSS/canvas + microcopys)** se replican 1:1; las celebraciones fullscreen entre ejercicios funcionan igual.
- **Audio cues** via Web Speech API o clips de audio; **haptics** via `navigator.vibrate` (Android; iOS Safari no soporta, degradar a solo visual/audio).
- **Descanso**: Notifications API + fallback visual; sin Live Activity.

### Compartido en packages/*

- **`packages/workout-engine`**: extender el motor puro con logica de cardio agnostica de plataforma: calculo de progreso restante (por tiempo y por distancia), estado del bloque/intervalo, deteccion de milestones (mitad, ultimo minuto, meta, record personal), y clasificacion de zona de FC dado BPM + FCmax del alumno. Todo sin dependencias de UI ni de sensores.
- **Tokens semanticos de zonas de FC**: definir en el paquete de design tokens los 5 colores de zona como tokens **fijos, no white-label** (analogos a success/error), consumidos por RN y web por igual, para que la fisiologia no dependa de la marca.
- **Contratos de tipos** compartidos para el bloque de cardio (objetivo tiempo/distancia/pace/zona, fuentes de datos disponibles, eventos de milestone) de modo que RN y PWA rendericen desde el mismo modelo y solo difieran en la capa de sensores/animacion.

## Fuentes

- [Nike Run Club App Delivers New Features (Nike, Inc.)](https://about.nike.com/en/newsroom/releases/nike-run-club-app-new-features)
- [Nike Run Club Gamification Case Study (trophy.so)](https://trophy.so/blog/nike-run-club-gamification-case-study)
- [Nike Run Club | Gamification examples (StriveCloud)](https://www.strivecloud.io/blog/gamification-examples-nike-run-club)
- [How the Nike Run Club app got runners hooked (Medium / Design Bootcamp)](https://medium.com/design-bootcamp/how-the-nike-run-club-app-got-runners-hooked-2850c7654fc5)
- [Nike Run Club guide (Wareable)](https://www.wareable.com/running/nike-plus-run-club-guide-how-to-use-running-430)
- [What Are Heart Rate Zone Colours? (Ultrahuman)](https://ultrahuman.com/blog/what-are-heart-rate-zone-colours/)
- [View Heart Rate Zones on Apple Watch (Apple Support)](https://support.apple.com/guide/watch/view-heart-rate-zones-apd897dccddf/watchos)
- [How to Use Heart Rate Zones on Apple Watch (techsolutions.support.com)](https://www.techsolutions.support.com/how-to/use-heart-rate-zones-on-apple-watch)
- [Leveraging the Psychology of Color in UX Design for Health and Wellness Apps (UXmatters)](https://www.uxmatters.com/mt/archives/2024/07/leveraging-the-psychology-of-color-in-ux-design-for-health-and-wellness-apps.php)
- [Understanding your metrics (Peloton Support)](https://support.onepeloton.com/hc/en-us/articles/203325985-Understanding-your-metrics)
- [Target Power Zone indicator added to Peloton Bike (Peloton Buddy)](https://www.pelobuddy.com/power-zone-indicator-bike/)
- [Peloton Pace Target Classes for Tread (Peloton Buddy)](https://www.pelobuddy.com/pace-target-classes-tread/)
- [Power Zone Compliance Graph / Time in Zone (Peloton Buddy)](https://www.pelobuddy.com/target-power-zone-graph/)
- [How to Record a Treadmill Workout (Runna Support)](https://support.runna.com/en/articles/13616950-how-to-record-a-treadmill-workout)
- [Setting Up and Managing Your Audio Cues (Runna Support)](https://support.runna.com/en/articles/8159780-setting-up-and-managing-your-audio-cues)
- [Runna introduces treadmill connectivity feature (Running Industry Alliance)](https://www.runningindustryalliance.com/runna-introduces-first-of-its-kind-treadmill-connectivity-feature/)
- [Recording an Activity (Strava Help Center)](https://support.strava.com/en-us/articles/15402137-recording-an-activity)
- [Activity Stats in the Feed (Strava Support)](https://support.strava.com/hc/en-us/articles/15422373796493-Activity-Stats-in-the-Feed)
- [Tracking workouts with HealthKit in iOS apps (createwithswift)](https://www.createwithswift.com/tracking-workouts-with-healthkit-in-ios-apps/)
- [Running workout sessions (Apple Developer Documentation)](https://developer.apple.com/documentation/HealthKit/running-workout-sessions)
- [Track workouts with HealthKit on iOS - WWDC25 (Apple Developer)](https://developer.apple.com/videos/play/wwdc2025/322/)
- [Record HKWorkoutSession on iPhone, mirror on Watch (Apple Developer Forums)](https://developer.apple.com/forums/thread/740630)
- [How to Create an Animated Countdown Timer with HTML, CSS and JavaScript (CSS-Tricks)](https://css-tricks.com/how-to-create-an-animated-countdown-timer-with-html-css-and-javascript/)
- [react-countdown-circle-timer (GitHub)](https://github.com/vydimitrov/react-countdown-circle-timer)
- [UI Design: Time2Rest App (Medium / penguinchilli)](https://medium.com/@penguinchilli/ui-design-time2rest-app-66321d75ff55)
