# F2 — Microinteracciones y feedback multimodal para el ejecutor de entrenamiento

Investigación de fundamentos para el rediseño del ejecutor de EVA (ExecutorV2 en RN, WorkoutExecutionClient en web). El objetivo: definir cómo hacer que cada toque, cada serie registrada y cada descanso se sientan VIVOS, con "vibra" tipo Duolingo, sin depender de una mascota de marca (la app es white-label) y funcionando bien con el teléfono en la mano entre series.

## Resumen ejecutivo

- Una microinteracción, según Dan Saffer, tiene cuatro partes: **trigger** (qué la dispara, manual o del sistema), **rules** (la lógica), **feedback** (la señal que confirma al usuario) y **loops/modes** (duración y contexto). Todo botón del ejecutor debe diseñarse con estas cuatro piezas explícitas.
- El feedback es la parte donde vive la "vibra": puede ser visual, sonora o táctil, y lo mejor es combinar los tres canales de forma coordinada (multimodal).
- La "juiciness" (game feel) es feedback abundante y en cascada ante mínimo input del usuario: rebotes, escalas, sonido, partículas. La investigación muestra que la juiciness mejora la experiencia y satisface necesidades psicológicas (competencia, curiosidad, efectancia) incluso fuera de los juegos.
- Regla de oro de la juiciness: **puede excederse**. Demasiado "jugo" distrae y rompe la inmersión. Para un alumno cansado entre series, el exceso es fatiga, no diversión.
- Botones táctiles: mínimo tres estados (default, pressed, disabled), más loading y success. En touch NO hay hover, así que pressed y loading cargan todo el peso comunicativo. La respuesta visual al toque debe ocurrir en 100-200 ms.
- Target táctil mínimo 44x44 px (Apple) / 48 dp (Android). En un ejecutor de gimnasio los botones deben ser aún más grandes (mano sudada, movimiento, mirada rápida).
- Haptics de verdad: iOS ofrece `UIImpactFeedbackGenerator` (light/medium/heavy), `UISelectionFeedbackGenerator` (cambio de selección) y `UINotificationFeedbackGenerator` (success/warning/error). Cada uno tiene un significado semántico; usarlos por su intención, no de adorno.
- Android: preferir `HapticFeedbackConstants` (action-oriented, con fallback entre dispositivos) sobre `VibrationEffect` crudo. Evitar `createOneShot`/vibraciones largas legacy: se sienten "buzzy". Keyclick óptimo 10-20 ms.
- Cuándo NO usar haptics: si la opción es "buzzy o nada", elegir nada. No usar vibración como decoración ni para manipular. Correlacionar fuerza del haptic con importancia y frecuencia del evento.
- Sonido de UI: Duolingo lo usa para crear respuesta pavloviana (el "ping" de acierto). Funciona porque es corto, reconocible y consistente. Pero SIEMPRE debe ser opcional, muteble y acompañado de señal visual/táctil (accesibilidad y contexto de gimnasio ruidoso/silencioso).
- Un sonido de microinteracción no debe durar más de ~0.3 s por sobre su animación; la repetición genera fatiga ("a la vez 100, el usuario prefiere mutear").
- Number tickers (contadores animados tipo odómetro): cada dígito es un rodillo independiente con `translateY`, ancho fijo y numerales tabulares; suben si el valor crece, bajan si decrece. Solo animar `transform` para performance. Respetar reduce-motion (snap al valor final).
- Gestos con física: heredar la **velocidad** del dedo, usar springs (no duraciones fijas), aplicar rubber-banding (resistencia al pasar límites) e interrumpibilidad (poder agarrar y revertir en cualquier frame). Esto hace que arrastrar valores o descartar se sienta natural.
- Co-diseñar visual + audio + haptic: si están desincronizados se sienten "raros" y rompen la sensación de fisicalidad. La sincronización es lo que hace que un botón se sienta como un objeto real.
- Para EVA: definir una capa compartida de "tokens de feedback" (semántica: tap, éxito-serie, hito, error, tick-descanso) y que cada plataforma la implemente con su motor nativo. La lógica de cuándo disparar vive en el motor; la ejecución del efecto es por plataforma.

## Hallazgos

### 1. El modelo de microinteracción de Dan Saffer

Dan Saffer descompone cada microinteracción en cuatro componentes ([blog.prototypr.io](https://blog.prototypr.io/the-4-components-of-a-microinteraction-836732173c7c)):

- **Trigger**: el evento que inicia la interacción. Puede ser *manual* (el usuario presiona un botón, activa un switch) o *del sistema* (una condición se cumple: el timer de descanso llega a cero, el plan detecta que terminaste el último set).
- **Rules**: la lógica que determina qué pasa una vez disparado el trigger. Define qué puede y qué no puede hacer el usuario, y en qué orden.
- **Feedback**: la verificación. Es la señal (visual, sonora, vibración, movimiento) que le dice al usuario que su acción fue reconocida. Aquí es donde la microinteracción "cobra vida".
- **Loops & Modes**: los meta-parámetros. El *loop* define la duración y si la interacción se repite o cambia con el tiempo (ej. un contador de descanso que se acelera al final). El *mode* define contextos alternos (ej. modo "editar valores" vs modo "ejecutar").

Implicación para EVA: cada acción del ejecutor (registrar un set, iniciar descanso, saltar ejercicio, terminar workout) debe modelarse con estas cuatro piezas. El "feedback" es la palanca de diseño más importante para lograr la "vibra" pedida por el CEO.

### 2. Juiciness y game feel aplicados a apps no-juego

La "juiciness" fue acuñada por diseñadores de juegos como *feedback constante y abundante*: "un elemento jugoso rebota, se mueve, chisporrotea y hace un ruidito cuando lo tocas" ([gamedeveloper.com](https://www.gamedeveloper.com/design/juicy-a-useful-game-design-term-)). Un juego jugoso se siente vivo y responde a todo lo que haces: mucha acción y respuesta en cascada por un input mínimo.

La evidencia empírica es relevante para EVA: la investigación de CHI 2024 sobre feedback jugoso concluye que la juiciness mejora la experiencia y que, en contextos no-juego, es la que satisface las necesidades psicológicas básicas que facilitan la motivación intrínseca —competencia, curiosidad y efectancia (la sensación de que tus acciones tienen efecto en el mundo) ([dl.acm.org, CHI 2024](https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642656)). Es decir: la sensación de "logro" que quiere el CEO tiene base científica, no es solo estética.

Cómo se ve en la práctica en apps serias: escalas suaves, cambios sutiles de color, transiciones de ~200 ms; ejemplos como las imágenes de producto de Apple que crecen al hover o Spotify mostrando el botón play sobre la portada ([medium.com/Mezo Istvan](https://medium.com/@mezoistvan/juicy-ui-why-the-smallest-interactions-make-the-biggest-difference-5cb5a5ffc752)).

**Advertencia crítica**: el exceso de juiciness es contraproducente. Demasiado "jugo" distrae y abruma, rompiendo la inmersión en vez de profundizarla ([mismo artículo](https://medium.com/@mezoistvan/juicy-ui-why-the-smallest-interactions-make-the-biggest-difference-5cb5a5ffc752)). Para un alumno de gimnasio, cansado, con el teléfono en la mano entre series, el punto justo es "reactivo y satisfactorio", no "carnaval". Las celebraciones grandes se reservan para hitos (terminar ejercicio, terminar workout, PR); el feedback por-set debe ser ligero.

### 3. Estados de botón y feedback táctil en targets grandes

Todo botón necesita mínimo tres estados: **default, pressed y disabled**; y en apps modernas se suman **loading** (spinner en vez de texto) y **success** (confirmación por color, ej. verde) ([figma.com](https://www.figma.com/resource-library/button-states/), [uxpin.com](https://www.uxpin.com/studio/blog/button-states/)).

Claves para el ejecutor:

- El estado *pressed* debe imitar la sensación física de presionar algo: cambio de color, ligera reducción de escala o cambio de sombra, en **100-200 ms** ([uxpin.com](https://www.uxpin.com/studio/blog/button-states/)). Duolingo usa botones con efecto 3D de presión que simulan feedback físico ([blakecrosley.com](https://blakecrosley.com/guides/design/duolingo)).
- En touch NO existe hover, así que *pressed* y *loading* cargan más peso comunicativo que en web ([logrocket](https://blog.logrocket.com/ux-design/designing-button-states/)). La PWA de EVA debe asumir que el usuario está en un teléfono.
- Target táctil mínimo 44x44 px según Apple, 48 dp Android ([capiproduct.com](https://www.capiproduct.com/post/10-best-practices-for-designing-effective-touch-targets-in-mobile-ui)). En un ejecutor de gimnasio conviene ir por encima: mano sudada, en movimiento, mirada de un segundo entre repeticiones. Botones grandes de "+/-" para kg/reps y un teclado numérico con teclas amplias.
- El estado *disabled* se atenúa para indicar inactividad, pero cuidado: un botón deshabilitado sin explicación frustra. Preferir habilitado-con-validación cuando sea posible.

### 4. Haptics de verdad: iOS

iOS expone tres subclases concretas de `UIFeedbackGenerator`, cada una con significado semántico ([medium/Cracking Swift](https://medium.com/cracking-swift/how-and-when-to-use-haptic-feedback-for-a-better-ios-app-9bcfcc97393a)):

- **`UIImpactFeedbackGenerator`** (light / medium / heavy): simula el impacto físico de materiales. Úsalo cuando un objeto de UI colisiona o "encaja en su lugar" (snap). Ideal para: incrementar un valor con +/-, encajar un set completado.
- **`UISelectionFeedbackGenerator`**: el "tick" al cambiar una selección, como girar un picker. Ideal para: rueda de selección de peso/reps, cambiar de ejercicio.
- **`UINotificationFeedbackGenerator`** (success / warning / error): success al completar algo (set guardado, workout terminado), warning para validación (campo requerido vacío), error para fallo. 

Buenas prácticas: llamar `prepare()` antes de disparar reduce la latencia (el Taptic Engine se "arma"); el estado preparado dura solo segundos ([mismo artículo](https://medium.com/cracking-swift/how-and-when-to-use-haptic-feedback-for-a-better-ios-app-9bcfcc97393a)).

Para efectos ricos personalizados (celebración de PR, patrón único del cronómetro), Core Haptics permite eventos *transient* (golpe puntual) y *continuous* (vibración sostenida modulable) con parámetros de **intensity** y **sharpness**. Detalles clave ([danielbuettner.medium.com](https://danielbuettner.medium.com/10-things-you-should-know-about-designing-for-apple-core-haptics-9219fdebdcaa)): la intensidad escala de forma cuadrática (no lineal); sharpness mapea a frecuencia (~80 Hz a 230 Hz en iPhone 8); Core Haptics interpola linealmente entre breakpoints (rampas suaves); el audio embebido en un AHAP NO suena si el teléfono está en mute (relevante para gimnasio). Co-diseñar audio y haptic juntos evita cancelación de fase y desincronización.

### 5. Haptics de verdad: Android

Android recomienda usar **constantes orientadas a la acción** (`HapticFeedbackConstants`) por sobre `VibrationEffect` crudo, porque la plataforma provee fallback si el dispositivo no soporta un efecto complejo ([developer.android.com](https://developer.android.com/develop/ui/views/haptics/haptics-principles)).

Clasificación de haptics de Android:

- **Clear** (nítidos, para eventos discretos como botones): usar efectos predefinidos, consistentes con fallback.
- **Rich** (expresivos, mayor ancho de banda: texturas, aleteos): soportados por menos dispositivos → requieren estrategia de fallback.
- **Buzzy** (ruidosos, ásperos, con zumbido residual): **evitar** para feedback de toque; solo como fallback en notificaciones críticas (llamada, alarma).

Reglas concretas ([mismo doc](https://developer.android.com/develop/ui/views/haptics/haptics-principles)):

- **"Ante la disyuntiva entre haptics buzzy o ningún haptic para feedback de toque, elige ninguno."**
- Evitar vibraciones legacy (`createOneShot`, `vibrate(long)`): se sienten buzzy en actuadores baratos.
- Correlacionar fuerza con importancia y frecuencia: eventos muy frecuentes (scroll) → sutil; importantes (envío de formulario, refresh) → fuerte; interacciones progresivas (arrastrar/snap) → amplitud creciente.
- Keyclick óptimo 10-20 ms; el actuador puede "resonar" 20-50 ms extra.
- Ser consistente: mismo haptic para la misma acción en toda la app, para que el usuario asocie significado.
- Co-diseñar visual + audio + haptic sincronizados; si están desalineados "se siente inquietante y rompe la fisicalidad percibida".

`VibrationEffect.Composition` permite primitivas cortas (<20 ms) con `addPrimitive(id, scale, delay)`, pero OJO: si el dispositivo no soporta una primitiva, **toda la composición no vibra** → verificar soporte ([source.android.com](https://source.android.com/docs/core/interaction/haptics/haptics-constants-primitives)).

### 6. Sound design de UI: por qué Duolingo (y los juegos) usan sonido

Duolingo diseña sonidos cortos, pegajosos y reconocibles: el "ping" agradable al acertar da refuerzo positivo inmediato; el chime de streak celebra la constancia ([soundcy.com](https://soundcy.com/article/what-does-duolingo-sound-like)). El efecto es **pavloviano**: los usuarios reportan "escuchar" el chime en su cabeza al pensar en la app, lo que impulsa el engagement diario ([blakecrosley.com](https://blakecrosley.com/guides/design/duolingo)). Duolingo usa estímulos multimodales (visual + audio + haptic) para reforzar sus mensajes, y siempre acompaña el sonido con señal visual clara para usuarios con distintas preferencias auditivas.

Guías de sound UX ([toptal.com](https://www.toptal.com/designers/ux/ux-sounds-guide), [uxmatters.com](https://www.uxmatters.com/mt/archives/2024/08/the-role-of-sound-design-in-ux-design-beyond-notifications-and-alerts.php)):

- Usar sonido cuando **reduce incertidumbre**, confirma un resultado significativo, llama la atención sobre un cambio relevante o hace más perceptible un proceso en curso. Las acciones rutinarias/obvias suelen beneficiarse del silencio.
- Un sonido de microinteracción **no debe durar más de ~0.3 s por sobre su animación**.
- La repetición genera fatiga: "a la vez 100, el usuario prefiere una alternativa" → los sonidos frecuentes deben ser sutiles y cálidos, o mejor no existir.
- **Siempre** dar control de volumen y mute. Probar la UI muteada y sin mutear: ambas experiencias deben ser igual de coherentes.
- El sonido complementa, no reemplaza: usuarios que no pueden oír (o están en un gimnasio ruidoso, o con audífonos ajenos) deben poder usar todo sin audio → pareja visual/haptic obligatoria.

Para EVA: sonido OFF por defecto o claramente togglable, dado el contexto de gimnasio. Reservar audio para hitos (fin de descanso, PR, fin de workout), no por-set.

### 7. Number tickers y contadores animados

Para valores que cambian (peso total levantado, volumen, tiempo/distancia de cardio, contador de pasadas de roller), el patrón odómetro se siente vivo: cada dígito es un rodillo independiente que cicla como un contador mecánico ([framer.com](https://www.framer.com/marketplace/components/odometer-counter-fx/), [medium/Weiming Wu](https://medium.com/geekculture/recreating-animated-numerical-counters-in-react-from-scratch-better-than-existing-libraries-2fa6d3056b33)).

Buenas prácticas técnicas ([animationpatterns.art](https://animationpatterns.art/animations/number-counter-odometer-transition/)):

- Animar **solo `transform`** (translateY) — es el tipo de repintado menos costoso; no manipular el DOM directo.
- **Columnas de ancho fijo** con numerales tabulares, para que cambiar de valor no reajuste el layout de la fila.
- Dirección: si el número **sube**, los dígitos suben; si **baja**, bajan.
- Curvas: spring (overshoot + settle) para sensación jugosa; empezar rápido y desacelerar al acercarse al valor final.
- **Accesibilidad / reduce-motion**: hacer *snap* al valor final estable preservando el layout, y anunciar el valor final una sola vez (screen readers).

### 8. Gestos con física: swipe, drag y "sentirse natural"

Un interfaz se siente vivo cuando el movimiento **arranca desde el valor actual en pantalla, hereda la velocidad del usuario, proyecta el momentum hacia adelante y puede agarrarse y revertirse en cualquier instante** ([karlkoch.me / resumen de búsqueda], [developer.android.com/spring-animation](https://developer.android.com/develop/ui/views/animations/spring-animation)).

Técnicas concretas de Shopify Engineering para React Native ([shopify.engineering](https://shopify.engineering/making-react-native-gestures-feel-natural)):

- **Incorporar velocidad**: usar `event.velocityY` de `onEnd` y sumarla a la posición para decidir si abrir/cerrar (ej. descartar una tarjeta de ejercicio con flick).
- **Springs en vez de duraciones fijas**: `withSpring()` toma en cuenta distancia y velocidad para animar de forma físicamente realista.
- **Rubber-banding / elasticidad**: al llegar a un límite, dividir la distancia arrastrada para que el elemento se mueva solo una fracción del dedo → da sensación de resistencia (ej. un sheet que se resiste al tope).
- Correr los gestos en el **UI thread** (Reanimated worklets) para 60/120 fps sin saltar al hilo JS.

Stiffness moderada (250-350) da un asentamiento natural del spring ([medium, resumen]). Para EVA: arrastrar para ajustar peso/reps, swipe para pasar de ejercicio, pull para revelar detalle — todos deben heredar velocidad y ser interrumpibles.

### 9. Qué hace que un botón se sienta VIVO (síntesis)

Combinando lo anterior, un botón "vivo" en el ejecutor es aquel donde, en un solo toque, se disparan **de forma sincronizada**: (a) respuesta visual inmediata <100-200 ms (scale-down + color), (b) haptic semántico correcto (impact al encajar, success al completar), (c) opcionalmente un sonido corto (si audio activo), y (d) al soltar, un spring de retorno con leve overshoot. La sincronización de los tres canales es lo que produce la sensación de fisicalidad; la desincronización la destruye ([developer.android.com](https://developer.android.com/develop/ui/views/haptics/haptics-principles)). Sobre esto se montan las celebraciones de hito (juiciness alta, reservada) para dar la "vibra Duolingo" sin fatigar el uso repetitivo por-set.

## Aplicabilidad a EVA

### RN nativo (ExecutorV2 — LA mejor experiencia)

- Implementar haptics con `expo-haptics` (mapea a `UIImpactFeedbackGenerator`/`UINotificationFeedbackGenerator` en iOS y a constantes en Android). Mapear semántica: `+/- valor` → impact light; `set completado` → notification success; `cambio de selección en picker de peso` → selection; `error de validación` → notification error; `fin de descanso` → patrón fuerte (impact heavy o composición). Llamar `prepare` antes de secuencias.
- Para celebraciones de hito (fin de ejercicio, PR, fin de workout) usar Core Haptics / patrones custom + animación Reanimated + sonido opcional, todo sincronizado. Reservar la juiciness alta solo para hitos.
- Gestos con `react-native-gesture-handler` + `react-native-reanimated`: heredar velocidad, springs, rubber-banding, worklets en UI thread para arrastrar valores y swipes entre ejercicios.
- Number tickers con Reanimated (translateY, numerales tabulares) para volumen/tiempo/distancia/pasadas; respetar `AccessibilityInfo.isReduceMotionEnabled`.
- Botones grandes (>56 dp), estado pressed con scale ~0.96 y color, cronómetro de descanso usando capacidades nativas (notificación local + haptic al terminar aunque la pantalla esté bloqueada).
- Sonido OFF por defecto, toggle en settings; nunca depender de audio para funcionar.

### PWA responsive (WorkoutExecutionClient — hereda lo funcionalmente posible)

- Diseño visual y de motion 1:1 con RN: mismos estados de botón, mismos tiempos (100-200 ms), mismo lenguaje de celebraciones.
- Haptics: usar `navigator.vibrate()` donde exista (Android/Chrome); en iOS Safari NO hay API de vibración web → degradar a solo visual+sonido. No prometer paridad háptica en iOS PWA; documentarlo como límite de plataforma.
- Number tickers con CSS `transform`/`translateY` y `font-variant-numeric: tabular-nums`; respetar `prefers-reduced-motion`.
- Gestos con Pointer Events + una lib de spring (o Web Animations API); heredar velocidad del pointer. Menos fino que Reanimated, pero suficiente.
- Sonido con Web Audio, muteble, mismo diseño que RN.

### Compartido en packages (packages/workout-engine y un posible packages/feedback-tokens)

- El **motor** decide CUÁNDO disparar cada feedback (qué evento es un hito, cuándo un set cierra, cuándo arranca/termina el descanso) — lógica pura, testeable, sin dependencias de plataforma.
- Definir una **capa semántica de tokens de feedback** compartida: un enum/mapa de intenciones (`tap`, `value-step`, `set-complete`, `exercise-complete`, `pr`, `rest-tick`, `rest-end`, `error`, `selection-change`) que ambas plataformas resuelven a su implementación nativa (expo-haptics vs navigator.vibrate; expo-av vs Web Audio; Reanimated vs CSS). Así la "vibra" es consistente entre web y RN y white-label-safe (no depende de mascota; la marca aporta color/logo, el feedback es estructural).
- Mantener en el motor las curvas de animación y umbrales (duración de descanso, cuándo acelerar el tick) como datos, no como código de UI, para reusar entre plataformas.

## Fuentes

- [The 4 Components of a Microinteraction — Prototypr/ZURB](https://blog.prototypr.io/the-4-components-of-a-microinteraction-836732173c7c)
- [Juicy: a useful game design term? — Game Developer](https://www.gamedeveloper.com/design/juicy-a-useful-game-design-term-)
- [How does Juicy Game Feedback Motivate? Testing Curiosity, Competence, and Effectance — CHI 2024, ACM](https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642656)
- [Juicy UI: Why the Smallest Interactions Make the Biggest Difference — Mezo Istvan, Medium](https://medium.com/@mezoistvan/juicy-ui-why-the-smallest-interactions-make-the-biggest-difference-5cb5a5ffc752)
- [Understanding Button States in UI Design — Figma](https://www.figma.com/resource-library/button-states/)
- [Button States Explained: The Complete Design Guide — UXPin](https://www.uxpin.com/studio/blog/button-states/)
- [Designing button states: Tutorial and best practices — LogRocket](https://blog.logrocket.com/ux-design/designing-button-states/)
- [Best Practices for Designing Effective Touch Targets in Mobile UI — Capiproduct](https://www.capiproduct.com/post/10-best-practices-for-designing-effective-touch-targets-in-mobile-ui)
- [How (and When) to use Haptic Feedback for a better iOS App — Cracking Swift, Medium](https://medium.com/cracking-swift/how-and-when-to-use-haptic-feedback-for-a-better-ios-app-9bcfcc97393a)
- [10 Things You Should Know About Designing for Apple Core Haptics — Daniel Büttner, Medium](https://danielbuettner.medium.com/10-things-you-should-know-about-designing-for-apple-core-haptics-9219fdebdcaa)
- [Haptics design principles — Android Developers](https://developer.android.com/develop/ui/views/haptics/haptics-principles)
- [Implement constants and primitives — Android Open Source Project](https://source.android.com/docs/core/interaction/haptics/haptics-constants-primitives)
- [What Does Duolingo Sound Like? — SoundCy](https://soundcy.com/article/what-does-duolingo-sound-like)
- [Duolingo: Gamification as Design Language — Blake Crosley](https://blakecrosley.com/guides/design/duolingo)
- [A Quick Guide to Designing UX Sounds — Toptal](https://www.toptal.com/designers/ux/ux-sounds-guide)
- [The Role of Sound Design in UX Design — UXmatters](https://www.uxmatters.com/mt/archives/2024/08/the-role-of-sound-design-in-ux-design-beyond-notifications-and-alerts.php)
- [Odometer-style animated number counter — Framer](https://www.framer.com/marketplace/components/odometer-counter-fx/)
- [Recreating animated numerical counters in React from scratch — Weiming Wu, Medium](https://medium.com/geekculture/recreating-animated-numerical-counters-in-react-from-scratch-better-than-existing-libraries-2fa6d3056b33)
- [CSS Number Counter Odometer Transition — Animation Patterns](https://animationpatterns.art/animations/number-counter-odometer-transition/)
- [Making React Native Gestures Feel Natural — Shopify Engineering](https://shopify.engineering/making-react-native-gestures-feel-natural)
- [Animate movement using spring physics — Android Developers](https://developer.android.com/develop/ui/views/animations/spring-animation)
