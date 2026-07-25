# r6 — Delight fuera de fitness: patrones reutilizables para el ejecutor EVA

Investigación de referentes de "delight" (detalle de UI, motion, haptics, celebración) en productos premiados fuera del mundo fitness, con foco en extraer patrones concretos y reutilizables para el rediseño del ejecutor de entrenamiento de EVA (RN nativo ExecutorV2 + PWA WorkoutExecutionClient, motor compartido `packages/workout-engine`). El público objetivo es un alumno de gimnasio con el teléfono en la mano, entre series, muchas veces con una sola mano y a veces sin desbloquear la pantalla.

## Resumen ejecutivo

- **La celebración se reserva, no se reparte.** Duolingo movió la retención de día 7 en +1.7% solo rediseñando una animación, porque celebra hitos (fin de sesión, racha) y no cada acierto: repetir la misma celebración en todo la vuelve invisible ([Duolingo streak breakdown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)). Para EVA: celebración épica al terminar el entreno; celebración sutil al cerrar cada ejercicio; feedback micro al cerrar cada serie.
- **La intensidad de la celebración escala con el logro.** En Duolingo la cantidad y vivacidad del confeti dependen del nivel del hito ([Raw.Studio](https://raw.studio/blog/how-duolingo-utilises-gamification/)). Un PR (record personal) debe verse y sentirse distinto a "una serie más".
- **Haptics siempre acoplados a lo visual y al sonido, nunca solos.** El haptic debe dispararse exactamente en el pico de la animación; incluso pequeños desfases se sienten falsos ([Play/createwithplay](https://createwithplay.com/blog/using-haptics-in-your-ios-prototypes)). La intensidad del tap háptico debe igualar la del gesto visual.
- **La celebración también sirve para esconder latencia.** Duolingo muestra "Session Complete!" de inmediato mientras termina el trabajo en background, reduciendo la espera percibida en >60% ([Duolingo micro-interactions](https://medium.com/@Bundu/little-touches-big-impact-the-micro-interactions-on-duolingo-d8377876f682)). El "Entreno completado" de EVA puede mostrarse optimista mientras sincroniza al servidor.
- **Optimistic UI: actualizar de inmediato, reconciliar después, ofrecer Undo si falla.** Es el estándar Vercel/SWR para que la interfaz se sienta instantánea ([Vercel Web Interface Guidelines](https://vercel.com/design/guidelines)). Anotar kg/reps debe reflejarse al instante, sin spinner bloqueante.
- **Number tickers (dígitos que ruedan) para todo valor que cambia.** Existen libs RN maduras (`number-flow-react-native`, `react-native-animated-rolling-numbers`) que corren en el hilo de UI a 60fps ([number-flow-react-native](https://github.com/Rednegniw/number-flow-react-native)). Ideal para volumen total, kg, series restantes.
- **Spring physics para transiciones de estado, no easing lineal.** El resorte que "golpea el borde y se asienta" se percibe natural y premium; `transition: all` está prohibido por jank ([ICS Media](https://ics.media/en/entry/260402/), [Vercel](https://vercel.com/design/guidelines)).
- **Native Live Activity / Dynamic Island es la mejor jugada para el cronómetro de descanso.** Cuenta regresiva en Lock Screen sin desbloquear, con botones -15s / +15s / Saltar vía App Intents; la ventana expandida ronda 160pt y el payload APNs tope 4KB ([AppMakers](https://appmakersla.com/blog/app-development/building-for-dynamic-island-and-live-activities-with-practical-use-cases/), [Musklr](https://musklr.com/blog/2026/iphone-lock-screen-workout-tracking-live-activity/)).
- **BPM solo cuando el Apple Watch lo entrega; nunca inventar.** Musklr omite el ritmo cardíaco si no hay Watch en vez de adivinar ([Musklr](https://musklr.com/blog/2026/iphone-lock-screen-workout-tracking-live-activity/)). Regla directa para el modo cardio de EVA.
- **Estados inteligentes que cambian solos según el momento.** Flighty diseñó 15 estados que muestran lo justo en cada instante sin que el usuario abra la app ([Behind the Design: Flighty](https://developer.apple.com/news/?id=970ncww4)). El ejecutor debería cambiar de "durante la serie" a "descanso" a "siguiente ejercicio" con estados atómicos claros.
- **Diseñar el estado offline como ciudadano de primera.** Flighty precachea datos mínimos porque asume que perderá conexión en vuelo ([Flighty](https://developer.apple.com/news/?id=970ncww4)). El alumno entrena en subterráneos de gimnasio sin señal: el ejecutor debe funcionar y celebrar igual offline.
- **Iconos/multimedia con motion "vivo" pero no invasivo.** Airbnb Lava = micro-video 3D con transparencia y playback de alto rendimiento; el gif/video del ejercicio puede vivir al centro, en loop suave, sin exigir toques ([Airbnb Lava](https://medium.com/@waldobear002/airbnbs-new-lava-icon-format-a-technical-deep-dive-b2604626c7e0)).
- **Skeletons que calcan la UI real, no rectángulos genéricos.** Deben igualar tipografía, padding y densidad para evitar CLS y el "salto" ([LogRocket](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/)).
- **Empty states con voz de marca, no vacíos tristes.** Fórmula: titular breve con personalidad + subtexto útil que dice qué hacer ([LogRocket empty states](https://blog.logrocket.com/ux-design/empty-states-ux-examples/)). "Sin entreno hoy" puede tener vibra sin depender de una mascota.
- **Pull-to-refresh de marca, no el spinner default.** Vale construir uno propio cuando el default no se siente production-grade ([Fitlane/SwiftUI](https://medium.com/@kunal_yelne/building-a-beautiful-custom-pull-to-refresh-for-fitlane-swiftui-53ebdeccf8ae)).
- **Respetar `prefers-reduced-motion` y accesibilidad como base.** Toda animación debe tener variante reducida y ser interrumpible por input ([Vercel](https://vercel.com/design/guidelines)).

## Hallazgos

### 1. Celebración: reservada, escalada y como analgésico de latencia (Duolingo)

Duolingo es el caso más citado y medido de "delight con vibra". Tres aprendizajes duros:

1. **Reservar la celebración para hitos.** "La mayoría de las apps celebran cada acción con la misma animación; reservarla para los hitos la mantiene poderosa." Rediseñar solo la animación del fénix movió la retención de día 7 en +1.7% ([Duolingo streak breakdown](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)).
2. **Escalar la intensidad con el logro.** La cantidad y vivacidad del confeti se relacionan con el nivel del hito, haciendo que los milestones grandes se sientan más especiales ([Raw.Studio](https://raw.studio/blog/how-duolingo-utilises-gamification/)).
3. **Usar la celebración para tapar latencia.** Muestran "Session Complete!" de inmediato mientras terminan el trabajo en background: >60% de reducción en la espera percibida y lift de DAU ([Duolingo micro-interactions](https://medium.com/@Bundu/little-touches-big-impact-the-micro-interactions-on-duolingo-d8377876f682)).

Micro-interacciones concretas de Duolingo: barra de progreso que **pulsa** con cada ejercicio completado y llega a "pico de intensidad" al terminar; sonidos distintos por evento ("chirp" alegre en acierto, "boing" juguetón en error, chime/aplauso al completar); confeti inmediato tras la acción para dejar clara la relación causa-efecto; y siempre pistas visuales que acompañan al sonido por accesibilidad ([Duolingo micro-interactions](https://medium.com/@Bundu/little-touches-big-impact-the-micro-interactions-on-duolingo-d8377876f682)).

Nota crítica para EVA white-label: la vibra de Duolingo se apoya mucho en su mascota Duo. EVA no puede depender de una mascota única de marca. La personalidad debe venir del **motion, el sonido, el haptic y el copy**, no de un personaje. Esto es una restricción de diseño, no un impedimento: el confeti, los tickers, la coreografía háptica y los milestones funcionan sin mascota.

### 2. Haptics acoplados a la animación (Core Haptics / guías de haptic UX)

El principio central: los haptics no son una función aislada; deben combinarse con animación y sonido. La animación muestra visualmente el resultado, el haptic lo comunica físicamente; juntos informan mejor y confunden menos ([Play/createwithplay](https://createwithplay.com/blog/using-haptics-in-your-ios-prototypes)).

Dos reglas técnicas:

- **Sincronización de timing:** disparar el haptic exactamente cuando ocurre el evento visual (pico de animación, botón que se hunde) o el efecto de sonido. Incluso desfases pequeños se sienten antinaturales.
- **Igualar la intensidad:** una animación visual rápida y filosa combina con un tap háptico "Light" crujiente y un sonido corto y agudo; una celebración larga pide un patrón háptico continuo de varios segundos ([Core Haptics events continuos](https://developer.apple.com/documentation/corehaptics)).

Para EVA: definir una **paleta de haptics semántica** (tap ligero al anotar serie; tap medio de confirmación al cerrar ejercicio; patrón continuo/celebratorio al cerrar el entreno o marcar un PR; tick sutil en los últimos 3 segundos del cronómetro de descanso). En RN esto es `expo-haptics` para lo básico y patrones Core Haptics para lo continuo; en PWA la Vibration API es un fallback pobre, así que la PWA hereda lo visual pero degrada elegante en háptico.

### 3. Live Activities / Dynamic Island como cronómetro de descanso nativo (Flighty, Musklr)

El cronómetro de descanso es el candidato #1 a "capacidad nativa del celular". Referentes:

**Flighty** ganó reputación con Live Activities que imitan los tableros de aeropuerto (una línea por vuelo, 50 años de convención). Puntos reutilizables ([Behind the Design: Flighty](https://developer.apple.com/news/?id=970ncww4)):
- **15 estados inteligentes** que muestran lo justo en cada momento sin abrir la app.
- **Diseño offline-first:** al despegar precachean datos mínimos porque asumen pérdida de conexión.
- **Proceso de ideación:** 20 conceptos en papel para no reciclar; empujar más allá de las primeras 6-7 ideas.

**Musklr** (workout tracker) muestra el patrón exacto para gimnasio ([Musklr](https://musklr.com/blog/2026/iphone-lock-screen-workout-tracking-live-activity/)):
- La tarjeta muestra ejercicio, peso/reps objetivo y un **chip "Last"** con el desempeño de la sesión anterior; contador de series.
- En descanso: cuenta regresiva con barra de progreso que corre en Lock Screen **sin desbloquear**.
- Tres botones inline durante el descanso: **-15s / +15s / Saltar**, vía App Intents, sin navegar.
- Dynamic Island: modo compacto (ejercicio a la izquierda, series a la derecha), expandido con touch-and-hold (tarjeta completa).
- **BPM solo si el Apple Watch lo entrega; si no hay Watch, omite el dato en vez de adivinar.**

Restricciones técnicas: Live Activities son para tareas de hasta 8 horas; región expandida ~160pt; payload APNs tope 4KB; Apple recomienda actualizar como máximo una vez por segundo ([AppMakers](https://appmakersla.com/blog/app-development/building-for-dynamic-island-and-live-activities-with-practical-use-cases/)). En Expo/RN esto requiere un módulo nativo (existen guías de Live Activity Timer en Expo, [Level Up Coding](https://levelup.gitconnected.com/building-a-live-activity-timer-in-expo-626b162f3e8d)).

### 4. Number tickers y motion de valores (libs RN + Family)

Todo número que cambia es una oportunidad de delight y de claridad. Existen librerías RN maduras que ruedan dígitos a 60fps en el hilo de UI vía worklets de Reanimated: `number-flow-react-native` (renderer View y renderer Skia, soporte `Intl.NumberFormat`), `react-native-ticker` y `react-native-animated-rolling-numbers` (signos +/-, agrupación, notación compacta) ([number-flow-react-native](https://github.com/Rednegniw/number-flow-react-native), [react-native-ticker](https://github.com/browniefed/react-native-ticker)).

**Family wallet** enseña el porqué: una animación simple donde las direcciones "se organizan solas en su lugar" mejora enormemente la comprensión; sin ella la acción se siente como "whiplash digital" ([Family launch](https://family.co/blog/launch)). El motion no es decoración: comunica qué pasó.

Aplicación EVA: volumen total del entreno subiendo con ticker al cerrar cada serie; kg y reps rodando al ajustar valores; contador de "series restantes" bajando con animación; XP/racha del alumno rodando en la pantalla de cierre.

### 5. Transiciones líquidas: spring physics + optimistic UI (Linear, Vercel, Phantom)

- **Spring en vez de lineal:** el resorte que golpea el borde y se asienta da una sensación suave, natural y premium; se puede lograr incluso en CSS con `linear()` ([ICS Media](https://ics.media/en/entry/260402/)). Linear.app usa micro-animaciones sutiles que suben el engagement sin abrumar ([linear-ui](https://github.com/Mvishal123/linear-ui)).
- **Reglas de motion de Vercel** (altamente reutilizables) ([Vercel Web Interface Guidelines](https://vercel.com/design/guidelines)): honrar `prefers-reduced-motion`; preferir CSS sobre JS; solo animar propiedades GPU (`transform`, `opacity`); animar solo para aclarar causa-efecto o delight intencional; animaciones interrumpibles por input; **nunca `transition: all`**, listar propiedades explícitas; fijar `transform-origin` correcto.
- **Optimistic UI:** actualizar la UI apenas el éxito es probable y reconciliar con la respuesta del servidor; en fallo, mostrar error y ofrecer rollback/Undo ([Vercel](https://vercel.com/design/guidelines)).
- **Phantom** demuestra que el delight también es **restraint**: espaciado calmo, jerarquía clara, avatares amistosos, moderación con color y densidad; previews de transacción legibles en vez de hex ([Phantom breakdown](https://www.925studios.co/blog/phantom-wallet-design-breakdown)). Para un ejecutor donde el alumno está cansado y con una mano, la calma y los targets generosos importan tanto como el confeti.

### 6. Multimedia del ejercicio viva pero no invasiva (Airbnb Lava)

El CEO quiere el gif/video del ejercicio al centro, sin tocar botones y sin ser invasivo. Airbnb resolvió algo análogo con **Lava**, un formato micro-video propietario para iconos 3D animados con transparencia y playback de alto rendimiento, integración multiplataforma ([Airbnb Lava deep dive](https://medium.com/@waldobear002/airbnbs-new-lava-icon-format-a-technical-deep-dive-b2604626c7e0)). El rediseño 2025 usa iconos "tipo juguete" con texturas de arcilla y micro-animaciones al tocar (la casa abre su puerta, la campana vibra) que hacen la interfaz sentirse viva pero sin estorbar ([Airbnb summer 2025](https://medium.com/design-bootcamp/airbnb-summer-2025-update-heres-what-s-new-and-why-it-matters-0ced2338b921)).

Aplicación EVA: el demo del ejercicio (gif/video) en loop suave al centro de la pantalla de serie, autoplay silenciado, con degradación a imagen estática si el asset pesa o la red es mala (recordar el gotcha de cuota de Image Transformations del proyecto: gifs a webp estático). El motion del media nunca debe competir con el número que el alumno tiene que leer.

### 7. Skeletons, pull-to-refresh y empty states con vida

- **Skeletons que calcan la UI real:** deben igualar tamaño de fuente, padding y densidad; shimmer sutil de izquierda a derecha; preservan el espacio y evitan CLS y saltos ([LogRocket skeletons](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/)). No usar en cargas <1s. En RN hay libs de shimmer placeholders ([Andrew Chester](https://medium.com/@andrew.chester/react-native-skeleton-loaders-elevate-your-apps-ux-with-shimmering-placeholders-5003b9507117)).
- **Pull-to-refresh de marca:** cuando el default no se siente production-grade, vale construir uno propio con lock de scroll seguro y modificador reutilizable ([Fitlane SwiftUI](https://medium.com/@kunal_yelne/building-a-beautiful-custom-pull-to-refresh-for-fitlane-swiftui-53ebdeccf8ae)); debe respetar la estética de la app (si es minimal, la animación también) ([Justinmind](https://www.justinmind.com/ui-design/mobile-app-animations)).
- **Empty states con personalidad:** fórmula titular breve con voz + subtexto útil que dice el siguiente paso; GitHub muestra su mascota paseando por el bosque tras completar todo, invitando a descansar ([LogRocket empty states](https://blog.logrocket.com/ux-design/empty-states-ux-examples/)). Balance: personalidad sin ocultar el significado.

### 8. Loading/feedback y accesibilidad (reglas Vercel)

Reglas concretas de feedback ([Vercel Web Interface Guidelines](https://vercel.com/design/guidelines)): spinners/skeletons con delay corto (~150-300ms) y tiempo mínimo visible (~300-500ms) para evitar parpadeos; mantener el label original del botón junto al indicador de carga; targets táctiles mínimos 44px en móvil, sin zonas muertas; `touch-action: manipulation` para evitar zoom por doble-tap; fuente de input ≥16px para evitar el auto-zoom de iOS; usar `aria-live` polite para toasts; confirmación o Undo en acciones destructivas.

## Aplicabilidad a EVA

### RN nativo (ExecutorV2 — LA mejor experiencia)

- **Cronómetro de descanso como Live Activity + Dynamic Island** (módulo nativo Expo): cuenta regresiva en Lock Screen, botones -15s/+15s/Saltar vía App Intents, chip "Última vez" con el peso/reps de la sesión previa, y tick háptico sutil en los últimos 3s. Es la funcionalidad estrella que la PWA no podrá igualar.
- **Coreografía háptica semántica** con `expo-haptics` + patrones Core Haptics continuos para celebraciones, siempre sincronizada al pico visual y al sonido.
- **Number tickers con Reanimated** (`number-flow-react-native` u equivalente) para volumen total, kg/reps y series restantes; corren en el hilo UI a 60fps.
- **Celebraciones escaladas:** micro (haptic + tick de sonido) al cerrar serie; media (barra que pulsa a pico + confeti corto) al cerrar ejercicio; épica (confeti pleno + haptic continuo + resumen con tickers) al terminar el entreno; variante especial y más intensa para un PR.
- **Interstitials fullscreen entre ejercicios** con spring physics y el demo (gif/video) del próximo ejercicio en loop; interrumpibles por tap; con "Siguiente: [ejercicio]" y motivación breve sin mascota de marca.
- **BPM cardio solo con Apple Watch** vía HealthKit; si no hay Watch, mostrar tiempo/distancia con progreso animado y omitir BPM, nunca inventarlo.
- **Offline-first:** el ejecutor debe anotar, avanzar y celebrar sin señal (gimnasios sin cobertura), reconciliando al recuperar red — encaja con la resiliencia ya trabajada en el proyecto.

### PWA responsive (WorkoutExecutionClient — hereda todo lo posible)

- **Mismo lenguaje visual y de motion**, con spring vía CSS `linear()`/Motion, respetando `prefers-reduced-motion` y sin `transition: all`.
- **Number tickers web** (equivalente NumberFlow web) para los mismos valores.
- **Optimistic UI** para anotar series: reflejar al instante, reconciliar con el servidor, Undo en fallo.
- **Confeti/celebración web** (canvas ligero) escalada igual que en nativo; la celebración también cubre la latencia de guardado.
- **Degradación elegante de capacidades nativas:** sin Live Activity, el cronómetro vive in-app con Wake Lock API para no apagar pantalla; háptico vía Vibration API como fallback pobre (no crítico); sin Apple Watch, cardio manual.
- **Skeletons que calcan la UI real** y pull-to-refresh coherente con la marca del coach.

### Compartido en packages/*

- **`packages/workout-engine`** (motor puro) debe emitir **eventos semánticos** que ambas UIs consuman para disparar delight de forma idéntica: `serie_cerrada`, `ejercicio_completado`, `entreno_completado`, `record_personal`, `descanso_iniciado`, `descanso_ultimos_3s`, `descanso_terminado`. Así la coreografía (qué se celebra y con qué intensidad) vive en el contrato compartido y no se duplica.
- **Tabla de intensidad de celebración** (milestone → nivel) compartida, para que RN y PWA escalen igual (serie < ejercicio < entreno < PR).
- **Paleta háptica/sonora semántica** como tokens compartidos (nombres de eventos → intensidad), con implementación específica por plataforma pero contrato único.
- **Contrato de estados del ejecutor** (durante-serie / descanso / transición / cierre) tipo "estados inteligentes" de Flighty, definido una vez y renderizado por cada plataforma.
- Respetar white-label: los colores del confeti, acentos y branding salen del brand-kit del coach; la personalidad viene del motion/haptic/copy, nunca de una mascota fija.

## Fuentes

- [Behind the Design: Flighty — Apple Developer](https://developer.apple.com/news/?id=970ncww4)
- [Apple unveils winners and finalists of the 2025 Apple Design Awards](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/)
- [Airbnb's New "Lava" Icon Format — technical deep dive (Medium)](https://medium.com/@waldobear002/airbnbs-new-lava-icon-format-a-technical-deep-dive-b2604626c7e0)
- [Airbnb Summer 2025 update — why it matters (Design Bootcamp / Medium)](https://medium.com/design-bootcamp/airbnb-summer-2025-update-heres-what-s-new-and-why-it-matters-0ced2338b921)
- [Duolingo — Streak System Detailed Breakdown & Design (Medium)](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)
- [Little Touches, Big Impact — Micro-interactions on Duolingo (Medium)](https://medium.com/@Bundu/little-touches-big-impact-the-micro-interactions-on-duolingo-d8377876f682)
- [How Duolingo Utilises Gamification — Raw.Studio](https://raw.studio/blog/how-duolingo-utilises-gamification/)
- [Using Haptics in your iOS Prototypes — Play (createwithplay)](https://createwithplay.com/blog/using-haptics-in-your-ios-prototypes)
- [Core Haptics — Apple Developer Documentation](https://developer.apple.com/documentation/corehaptics)
- [Building for Dynamic Island and Live Activities — AppMakers USA](https://appmakersla.com/blog/app-development/building-for-dynamic-island-and-live-activities-with-practical-use-cases/)
- [Workout Live Activity on iPhone — Musklr Blog](https://musklr.com/blog/2026/iphone-lock-screen-workout-tracking-live-activity/)
- [Building a Live Activity Timer in Expo React Native (Level Up Coding)](https://levelup.gitconnected.com/building-a-live-activity-timer-in-expo-626b162f3e8d)
- [number-flow-react-native — GitHub](https://github.com/Rednegniw/number-flow-react-native)
- [react-native-ticker — GitHub](https://github.com/browniefed/react-native-ticker)
- [Family — Avara Launches Family wallet (blog)](https://family.co/blog/launch)
- [Phantom Wallet Design Breakdown — 925 Studios](https://www.925studios.co/blog/phantom-wallet-design-breakdown)
- [Using CSS linear() for spring animations in UI — ICS Media](https://ics.media/en/entry/260402/)
- [linear-ui — GitHub (animaciones del sitio de Linear)](https://github.com/Mvishal123/linear-ui)
- [Web Interface Guidelines — Vercel](https://vercel.com/design/guidelines)
- [Skeleton loading screen design — LogRocket Blog](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/)
- [React Native Skeleton Loaders — Andrew Chester (Medium)](https://medium.com/@andrew.chester/react-native-skeleton-loaders-elevate-your-apps-ux-with-shimmering-placeholders-5003b9507117)
- [Building a Beautiful Custom Pull-to-Refresh for Fitlane (SwiftUI) — Medium](https://medium.com/@kunal_yelne/building-a-beautiful-custom-pull-to-refresh-for-fitlane-swiftui-53ebdeccf8ae)
- [The ultimate guide to mobile app animations — Justinmind](https://www.justinmind.com/ui-design/mobile-app-animations)
- [Empty states in UX done right — LogRocket Blog](https://blog.logrocket.com/ux-design/empty-states-ux-examples/)
