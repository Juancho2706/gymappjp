# F5 — Accesibilidad y performance de animacion + stack tecnico 2026

Investigacion de fundamentos para el rediseno del ejecutor de entrenamiento de EVA (RN nativo + PWA responsive, motor compartido `packages/workout-engine`). Foco: como lograr la "vibra" tipo Duolingo que pide el CEO sin marear a nadie, sin quemar bateria, sin jank, y compartiendo el maximo de diseno entre nativo y web.

## Resumen ejecutivo

- La animacion "movida" es un requisito de producto, pero WCAG 2.2 la trata como un riesgo de salud real: entre el 35% y mas de los adultos experimentan disfuncion vestibular hacia los 40 anos, y el movimiento mal usado provoca vertigo, nauseas y migrana ([web.dev](https://web.dev/learn/accessibility/motion)). El rediseno debe nacer con `prefers-reduced-motion` de primera clase, no como parche.
- Tres criterios WCAG mandan aqui: 2.2.2 (poder pausar/detener movimiento que dura mas de 5s), 2.3.1 (no mas de 3 destellos por segundo, riesgo de epilepsia fotosensible) y 2.3.3 AAA (poder desactivar animacion disparada por interaccion) ([web.dev](https://web.dev/learn/accessibility/motion)).
- Regla de oro operativa: usar `prefers-reduced-motion` para degradar a cross-fades/opacidad, nunca eliminar el feedback funcional. Las celebraciones (confetti, interstitials) son "no esenciales" y deben poder apagarse; el cronometro, el conteo de series y el progreso de cardio son "esenciales" y se conservan aunque simplificados.
- Duolingo migro de Lottie a Rive porque Lottie no reacciona a estado en tiempo real: para transiciones dependientes de la respuesta de la app hay que hacer cortes duros entre archivos. Rive resuelve esto con state machines y logro ~15x menos peso de archivo manteniendo el personaje bajo 1MB ([rive.app](https://rive.app/blog/rive-as-a-lottie-alternative), busqueda Rive/Duolingo).
- Rive corre en GPU (Metal/WebGL) a ~60fps y su binario `.riv` pesa 10-15x menos que el JSON de Lottie equivalente (ej. 240KB Lottie -> 16KB Rive). En pruebas Lottie rindio ~17fps vs ~60fps de Rive ([callstack](https://www.callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation), [unicornicons](https://unicornicons.com/learn/rive-vs-lottie)).
- Costo de Rive: su runtime web trae WASM y pesa ~200KB gzip vs ~60KB de lottie-web. Para la PWA esto es un trade-off real; conviene cargar Rive de forma diferida (solo en celebraciones) o degradar a CSS/Lottie ([unicornicons](https://unicornicons.com/learn/rive-vs-lottie)).
- La "vibra" no debe depender de una mascota unica de marca (EVA es white-label). Rive habilita esto: se puede parametrizar color/tema via inputs y data binding del state machine, reusando un mismo `.riv` neutro con la paleta del coach.
- En RN el stack 2026 es Reanimated 4 (worklets en UI thread, API de animaciones estilo CSS), React Native Skia (graficos GPU: confetti, aros de progreso, medidores de cardio) y `react-native-fast-confetti` (Skia Atlas API, batching de particulas) ([swmansion](https://swmansion.com/blog/reanimated-4-stable-release-the-future-of-react-native-animations-ba68210c3713), [github fast-confetti](https://github.com/AlirezaHadjar/react-native-fast-confetti)).
- Reanimated 4 exige la New Architecture (Fabric, RN >= 0.76). El proyecto ya esta en RN 0.81.5, asi que es viable; su nueva API "CSS animations" acerca la sintaxis a la web y facilita compartir tokens de movimiento ([swmansion](https://swmansion.com/blog/reanimated-4-stable-release-the-future-of-react-native-animations-ba68210c3713)).
- En web el estado del arte para springs sin JS es la funcion `linear()` de CSS (disponible desde dic-2023, ~88% de soporte global a oct-2025). Permite muelles/rebotes reales muestreando la fisica en puntos; impacto de performance despreciable y ~1.3KB por tres springs ([joshwcomeau](https://www.joshwcomeau.com/animation/linear-timing-function/)).
- Regla de performance transversal: animar solo `transform` y `opacity` (compositor/GPU, sin recalcular layout). WAAPI puede correr en el compositor inmune a un main thread ocupado; a 60fps solo hay 16.7ms por frame ([motion.dev](https://motion.dev/docs/performance)).
- Bateria y termica: las animaciones despiertan la GPU de su estado de ahorro; las continuas (loops de fondo, particulas infinitas) drenan; 120Hz consume mas que 60Hz con ganancia marginal. Preferir animaciones cortas, con settle/parada, y evitar loops perpetuos entre series (busqueda bateria/jank).
- Haptica nativa via `expo-haptics`: impact (Light/Medium/Heavy/Rigid/Soft), notification (Success/Warning/Error) y selection. iOS usa Taptic Engine (se anula en Low Power Mode); Android usa `performAndroidHapticsAsync()` sin permiso VIBRATE ([expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/haptics/)).
- El cronometro de descanso "nativo" que pide el CEO se resuelve con iOS Live Activities / Dynamic Island (ActivityKit, libs `expo-live-activity` / `expo-apple-targets`) y Android 16 Live Updates, mostrando el timer en lock screen sin desbloquear (busqueda Live Activities).
- Botones grandes y teclado numerico: WCAG 2.5.8 AA (WCAG 2.2) exige objetivos de >= 24x24 CSS px o 24px de separacion; las guias de plataforma recomiendan 44x44 (Apple) / 48dp (Material). Para un alumno con el telefono en la mano entre series, apuntar a 44-48 y usar teclado numerico dedicado ([testparty 2.5.8](https://testparty.ai/blog/wcag-target-size-guide)).
- Lo que SI se comparte entre web y RN: tokens de diseno de movimiento (duraciones, curvas, jerarquia), la logica del motor (`packages/workout-engine`), y assets Rive `.riv` (runtime unico C++/WASM multiplataforma). Lo que NO se comparte 1:1: la implementacion de particulas (Skia en RN vs canvas/WebGL en web), Live Activities (solo iOS), y HealthKit/Apple Watch (solo iOS nativo).

## Hallazgos

### 1. Marco de accesibilidad del movimiento (WCAG 2.2 y trastornos vestibulares)

El movimiento no es cosmetico: es un vector de dano para una fraccion grande de usuarios. web.dev documenta que mas del 35% de los adultos presentan disfuncion vestibular hacia los 40 anos y que el movimiento puede causar vertigo, mareo, migrana y distraccion (especialmente en TDAH) ([web.dev](https://web.dev/learn/accessibility/motion)). Los criterios relevantes:

- **2.2.2 Pause, Stop, Hide**: cualquier contenido que se mueve/parpadea/desplaza automaticamente y dura mas de 5 segundos debe ofrecer un control para pausar/detener/ocultar, salvo que el movimiento sea esencial ([web.dev](https://web.dev/learn/accessibility/motion)). Un interstitial fullscreen animado entre ejercicios cae aqui: debe poder saltarse.
- **2.3.1 Three Flashes**: no mas de 3 destellos por segundo; afecta a ~3% de las personas con epilepsia que son fotosensibles ([web.dev](https://web.dev/learn/accessibility/motion)). Confetti y celebraciones no deben producir flasheo de pantalla completa.
- **2.3.3 Animation from Interactions (AAA)**: permitir desactivar animaciones disparadas por interaccion cuando no son esenciales ([dequeuniversity](https://dequeuniversity.com/resources/wcag2.1/2.3.3-animations-from-interactions), busqueda WCAG).

La primitiva tecnica es la media query `prefers-reduced-motion`, soportada en Chrome 74+, Edge 79+, Firefox 63+, Safari 10.1+ ([web.dev](https://web.dev/learn/accessibility/motion)). La recomendacion fuerte es tratar la reduccion de movimiento como default y las animaciones grandes como opt-in, o al menos mapear la preferencia del SO a cross-fades por opacidad. En RN existe `AccessibilityInfo.isReduceMotionEnabled()` y `react-native-fast-confetti` ya expone una prop `reduceMotion` ([github fast-confetti](https://github.com/AlirezaHadjar/react-native-fast-confetti)).

Implicancia de diseno: separar cada animacion en "esencial" (progreso de cardio, cuenta regresiva de descanso, avance de serie) vs "decorativa" (confetti, interstitial de animo, rebotes de boton). Bajo reduced-motion, las decorativas se apagan o se vuelven un fade estatico; las esenciales conservan la informacion pero sin overshoot ni parallax.

### 2. Por que Duolingo migro a Rive (y que ensena para EVA)

Lottie es un formato de reproduccion: sabe play/pause/seek pero no reacciona a estado. Para que un personaje responda instantaneamente a la respuesta de una API, Lottie obliga a workarounds torpes: cortar duro entre archivos o reproducir segmentos de timeline por codigo ([rive.app](https://rive.app/blog/rive-as-a-lottie-alternative)). Rive introduce **state machines**: la animacion es una maquina de estados con inputs (booleans, numbers, triggers) que el runtime avanza cada frame en GPU y que puede "settlear" (quedarse quieta) cuando nada cambia, ahorrando energia ([rive.app](https://rive.app/blog/rive-as-a-lottie-alternative), busqueda Rive/Duolingo).

Numeros de la migracion: Duolingo combino 8 animaciones de cabeza y 8 de cuerpo para generar 64+ variaciones neutras, manteniendo el archivo final bajo 1MB y logrando ~15x de reduccion de peso frente a Lottie, con mejor performance e interactividad ([rive.app](https://rive.app/blog/rive-as-a-lottie-alternative), busqueda Duolingo).

Lo aplicable a EVA: la "vibra" tipo Duolingo no requiere una mascota especifica de marca. Como EVA es white-label, conviene un elemento neutro (aros de energia, chispas, un icono abstracto de "logro") animado con Rive, cuyos colores se inyectan por inputs/data binding desde el tema del coach. Un mismo `.riv` sirve para todos los coaches.

### 3. Rive vs Lottie: numeros de peso, runtime y degradacion

- **Peso de archivo**: `.riv` binario es tipicamente 10-15x mas chico que el JSON de Lottie (ej. 240KB -> 16KB; otra medicion 24.37KB -> 2KB). En 2026 se estima 50-80% mas chico para iconos; dotLottie comprimido recorta la brecha pero `.riv` sigue ganando en microanimaciones ([callstack](https://www.callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation), [unicornicons](https://unicornicons.com/learn/rive-vs-lottie)).
- **Runtime performance**: Rive usa GPU (Metal iOS, WebGL/Vulkan web/Android) y en pruebas rindio ~60fps vs ~17fps de Lottie sobre JS y UI thread ([callstack](https://www.callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation)).
- **Costo web**: el runtime web de Rive incluye WASM y pesa ~200KB gzip vs ~60KB de lottie-web ([unicornicons](https://unicornicons.com/learn/rive-vs-lottie)). Este es el trade-off clave para la PWA: Rive gana en peso de asset pero suma peso de runtime. Mitigacion: cargar Rive con import dinamico/diferido, solo cuando se dispara una celebracion, y no en el critical path del ejecutor.
- **Cuando usar cada uno**: Rive para iconos/microinteracciones con estados (loading, success, hover) y para reaccionar a estado de app; Lottie para reproduccion decorativa pura o flujos ya montados en After Effects ([unicornicons](https://unicornicons.com/learn/rive-vs-lottie)). Degradacion elegante en PWA: si no hay WebGL/WASM o el usuario pidio reduced-motion, mostrar un estado final estatico (SVG/PNG) del logro.

### 4. Stack de animacion en RN nativo (Reanimated 4 + Skia + haptics)

- **Reanimated 4** (estable 2025) corre worklets en el UI thread e introduce una API de animaciones/transiciones al estilo CSS, ademas de mantener worklets+shared values para gestos y transiciones complejas. Requiere la New Architecture (Fabric, RN >= 0.76); los worklets se extrajeron al paquete `react-native-worklets` ([swmansion](https://swmansion.com/blog/reanimated-4-stable-release-the-future-of-react-native-animations-ba68210c3713), busqueda Reanimated 4). EVA (RN 0.81.5) es compatible. La API CSS es "mas facil de optimizar" porque el runtime conoce explicitamente que atributos se animan.
- **React Native Skia** dibuja 2D con GPU y es la herramienta correcta para confetti, aros de progreso de cardio, medidores de BPM y explosiones de particulas donde el enfoque basado en `<View>` colapsaria ([medium Skia], busqueda Skia). Para confetti especifico, `react-native-fast-confetti` usa **Skia Atlas API** para batchear particulas y reducir draw calls; depende de Reanimated (>=3.15/4), Skia (>=1.4/2.0) y worklets, y ofrece modos rain/blast/cannon con `count`, `gravity`, `colors`, `fadeOutOnEnd` y `reduceMotion` ([github fast-confetti](https://github.com/AlirezaHadjar/react-native-fast-confetti)).
- **Haptica** via `expo-haptics`: impact (Light/Medium/Heavy/Rigid/Soft), notification (Success/Warning/Error) y selection. iOS usa el Taptic Engine (se desactiva en Low Power Mode, camara o dictado activos); Android usa el Vibrator o `performAndroidHapticsAsync()` con 21+ tipos y sin permiso VIBRATE. Buenas practicas: centralizar todas las llamadas en un wrapper, respetar el ajuste del SO, ofrecer On/Minimal/Off y no vibrar en pantallas de cold-start ([expo docs](https://docs.expo.dev/versions/v54.0.0/sdk/haptics/), busqueda haptics 2025). Para el ejecutor: haptic Success al cerrar una serie, selection al cambiar valor con el teclado, notification al terminar el descanso.
- **Rive RN**: `rive-react-native` da state machines nativas en GPU; ideal para el icono de celebracion white-label.

### 5. Cronometro de descanso con capacidades nativas

El CEO pide un cronometro "usando capacidades nativas del celular". La respuesta 2026 es **iOS Live Activities / Dynamic Island** (ActivityKit): el timer de descanso aparece en lock screen y Dynamic Island sin desbloquear, con estilos circular o digital. En Expo/RN se implementa con Swift nativo o con libs como `expo-live-activity` y `expo-apple-targets`; Android 16 trae Live Updates equivalentes (busqueda Live Activities). Esto resuelve el caso "alumno deja el telefono, descansa 90s, ve la cuenta sin abrir la app". Complementar con notificacion local + haptic al terminar. En web/PWA esto no existe; degrada a un timer en pantalla + Notification API + wake lock cuando sea posible.

### 6. Stack de animacion en web/PWA

- **Springs sin JS con `linear()`**: se muestrea una ecuacion de muelle (masa, rigidez, amortiguacion) en decenas de puntos y se pasa a `linear()` como curva de easing, logrando muelles/rebotes reales en CSS puro sin runtime JS. Disponible desde dic-2023, ~88% de soporte global a oct-2025; impacto de performance despreciable incluso con 100+ puntos y ~1.3KB por tres springs ([joshwcomeau](https://www.joshwcomeau.com/animation/linear-timing-function/)). Limitacion: la interrupcion a mitad de animacion revierte de golpe (CSS aplica un factor de acortamiento), sin la desaceleracion natural de una libreria fisica. Patron recomendado: guardar las curvas en variables CSS con fallback `@supports`.
- **WAAPI / Motion**: la Web Animations API puede offload al compositor GPU, quedando inmune a un main thread janky; Motion compila springs a `linear()` y calcula duracion, y expone `animateView()` sobre la View Transitions API ([motion.dev](https://motion.dev/docs/improvements-to-the-web-animations-api-dx), [motion.dev perf](https://motion.dev/docs/performance)).
- **Confetti web**: canvas/WebGL (ej. canvas-confetti) para particulas; degradar a estado estatico bajo reduced-motion.
- **Regla de oro de performance**: animar solo `transform` y `opacity` (compositor, sin layout/paint). El pipeline del navegador es layout -> paint -> composite; animar height/padding/position es caro porque cascada layout. A 60fps solo hay 16.7ms por frame y los re-renders suelen exceder 100ms; usar `will-change: transform` con moderacion ([motion.dev perf](https://motion.dev/docs/performance)).

### 7. Bateria, termica y frame budget

Las animaciones despiertan la GPU de su estado de ahorro; las complejas (3D, particulas) piden mucho mas, y las continuas drenan bateria de forma sostenida (busqueda bateria/jank). Correr rAF a 120Hz aporta poca ganancia perceptible frente al costo de bateria y riesgo de compat; el uso de GPU no escala lineal con FPS (overhead de driver, uploads de textura, compilacion de shaders son casi constantes). Consecuencia para el ejecutor: preferir animaciones cortas con settle, evitar loops perpetuos de fondo mientras el alumno descansa, y dejar que Rive "settlee" cuando el personaje esta neutro ([rive.app](https://rive.app/blog/rive-as-a-lottie-alternative), busqueda bateria).

### 8. Botones grandes y teclado numerico (ergonomia + a11y)

El publico es un alumno con el telefono en la mano, sudado, entre series. WCAG 2.5.8 (AA, parte de WCAG 2.2) exige objetivos tactiles de >= 24x24 CSS px o 24px de separacion; 2.5.5 (AAA) pide 44x44. Las guias de plataforma recomiendan 44x44 (Apple HIG) / 48dp (Material). El dedo promedio mide 16-20mm y en usuarios con temblor el error sube hasta 75% en objetivos chicos ([testparty 2.5.8](https://testparty.ai/blog/wcag-target-size-guide), busqueda 2.5.5). Para anotar kg/reps: teclado numerico dedicado (`keyboardType="decimal-pad"` en RN, `inputmode="decimal"` en web), botones +/- grandes de al menos 48px, y feedback haptico selection en cada cambio.

## Aplicabilidad a EVA

### RN nativo (la mejor version)

- **Motion stack**: Reanimated 4 (transiciones de pantalla e interstitials, gestos) + React Native Skia (confetti, aros de cardio, medidor de BPM) + Rive (`rive-react-native`) para el icono de celebracion white-label parametrizado por tema del coach.
- **Confetti**: `react-native-fast-confetti` (Skia Atlas), disparado al cerrar el ultimo set o el entrenamiento, con `reduceMotion` cableado a `AccessibilityInfo.isReduceMotionEnabled()`.
- **Haptica**: wrapper central sobre `expo-haptics` — Success al cerrar serie, Selection al ajustar valor, Notification(Success) al terminar descanso; respetar Low Power Mode y ajuste del usuario (On/Minimal/Off).
- **Cronometro de descanso**: Live Activities/Dynamic Island (iOS) + Android Live Updates + notificacion local + haptic. Wake lock para pantalla encendida durante el set.
- **Cardio/Apple Watch**: HealthKit via modulo nativo (`@kingstinct/react-native-healthkit` o el binding de Expo) para BPM/distancia/tiempo en vivo; requiere dev-client + prebuild (no Expo Go). Aro de progreso animado en Skia mostrando cuanto falta.
- **Movilidad/roller**: no necesitan Rive complejo; holds por lado se resuelven con un aro/temporizador Skia por lado (izq/der) y haptic de cambio de lado; roller cuenta pasadas con un contador grande y tick haptico por pasada.

### PWA responsive (hereda todo lo posible)

- **Springs**: `linear()` en CSS puro (con fallback `@supports` a cubic-bezier), o Motion/WAAPI compilando springs; animar solo transform/opacity para correr en compositor.
- **Confetti**: canvas-confetti/WebGL, cargado diferido, apagado bajo `prefers-reduced-motion`.
- **Rive en web**: opcional y diferido — el runtime WASM pesa ~200KB gzip, asi que solo cargarlo al disparar la celebracion; si no, degradar a un SVG/PNG de estado final. Nunca en el critical path del ejecutor.
- **Timer nativo**: no hay Live Activities; degradar a timer en pantalla + Notification API + Screen Wake Lock API donde este disponible.
- **Apple Watch/BPM**: no disponible en PWA; ocultar la seccion de BPM o mostrar entrada manual. Esta es una brecha aceptada (RN nativo es superior aqui).
- **Degradacion transversal**: toda animacion decorativa detras de `@media (prefers-reduced-motion: no-preference)`; el feedback esencial (progreso, timer, avance de serie) siempre visible.

### Compartido en `packages/*`

- **Tokens de movimiento**: crear un paquete tipo `packages/motion-tokens` con duraciones, curvas (parametros de spring: masa/rigidez/amortiguacion) y jerarquia de feedback. En RN se consumen via la API CSS de Reanimated 4; en web se compilan a `linear()`. Misma fuente de verdad de "sensacion".
- **Motor**: `packages/workout-engine` sigue siendo puro y agnostico de UI; expone eventos ("set cerrado", "descanso iniciado/terminado", "ejercicio completado", "sesion completada") que ambas UIs mapean a sus celebraciones y haptics. La logica de que dispara una celebracion vive en el motor, no duplicada.
- **Assets Rive `.riv`**: un solo binario multiplataforma (runtime C++/WASM comun a iOS/Android/Web) para el icono de logro neutro; los colores entran por inputs/data binding del state machine con el tema del coach. Se versiona como asset compartido.
- **No compartible 1:1**: implementacion de particulas (Skia RN vs canvas/WebGL web), Live Activities (solo iOS), HealthKit/Apple Watch (solo iOS nativo), y APIs de wake lock/notificacion (distintas por plataforma). Estos se abstraen detras de interfaces por plataforma, no de codigo compartido.

## Fuentes

- [Animation and motion — web.dev (Accessibility)](https://web.dev/learn/accessibility/motion)
- [Rive as a Lottie alternative — rive.app](https://rive.app/blog/rive-as-a-lottie-alternative)
- [Lottie vs. Rive: Optimizing Mobile App Animation — Callstack](https://www.callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation)
- [Rive vs Lottie: Complete Comparison for 2026 — Unicorn Icons](https://unicornicons.com/learn/rive-vs-lottie)
- [Reanimated 4 Stable Release — Software Mansion](https://swmansion.com/blog/reanimated-4-stable-release-the-future-of-react-native-animations-ba68210c3713)
- [Springs and Bounces in Native CSS (linear() timing function) — Josh W. Comeau](https://www.joshwcomeau.com/animation/linear-timing-function/)
- [Animation performance guide — Motion.dev](https://motion.dev/docs/performance)
- [react-native-fast-confetti — GitHub (AlirezaHadjar)](https://github.com/AlirezaHadjar/react-native-fast-confetti)
- [Haptics — Expo SDK v54 docs](https://docs.expo.dev/versions/v54.0.0/sdk/haptics/)
- [WCAG 2.5.8 Target Size (Minimum) guide — TestParty](https://testparty.ai/blog/wcag-target-size-guide)
- [2.3.3 Animations from Interactions — Deque University](https://dequeuniversity.com/resources/wcag2.1/2.3.3-animations-from-interactions)
- [Improvements to the Web Animations API — Motion.dev](https://motion.dev/docs/improvements-to-the-web-animations-api-dx)
