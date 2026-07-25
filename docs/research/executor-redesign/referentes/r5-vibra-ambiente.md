# r5 — Vibra y ambiente: como construir "vibra" sin mascota de marca

Investigacion de referentes para el rediseno del ejecutor de entrenamiento de EVA (RN nativo + PWA). Objetivo: extraer las palancas concretas con las que apps premium construyen identidad emocional y "vibra" sin depender de una mascota unica de marca, y traducir cada palanca a EVA considerando white-label (colores del coach via tokens, nunca hardcode).

## Resumen ejecutivo

- La "vibra" premium casi nunca vive en un personaje: vive en **motion, color, tipografia cinetica, profundidad y sonido**. Headspace, Whoop, Oura, Peloton y Gentler Streak construyen identidad con estos sistemas, no con un logo. Esto es exactamente lo que EVA necesita para no violar white-label.
- **Motion como branding** (Headspace): las transiciones lentas, suaves y respiradas SON la marca; el ritmo del movimiento comunica la intencion mas que cualquier ilustracion. El boton de play "cobra vida" durante la sesion. [standards.site](https://standards.site/case-studies/headspace/)
- **Data visualization como identidad premium** (Whoop): vocabulario de color ultra-restringido (3 colores semanticos), numeros gigantes (~72pt) legibles a la distancia del brazo, dark mode como escenario neutro que hace que el dato "brille". [925studios](https://www.925studios.co/blog/whoop-design-breakdown)
- **Jerarquia por tamano, no por adorno**: el numero primario domina; todo lo demas es secundario y pequeno. Esto reemplaza estructuralmente al "progressive disclosure". Aplica directo al kg/reps del ejecutor. [925studios](https://www.925studios.co/blog/whoop-design-breakdown)
- **Celebracion escasa = celebracion que importa** (Duolingo): las animaciones dramaticas se reservan SOLO para hitos (dia 7, 30, 100). Un dia normal recibe un tick; el hito recibe una secuencia fullscreen. Rediseñar una sola animacion movio retencion D7 +1.7%. [deconstructoroffun](https://duolingo.deconstructoroffun.com/mechanics/streaks)
- **Micro-interacciones con sonido y haptica** reducen la latencia percibida y refuerzan cada acierto (el "ding", los fuegos artificiales). Duolingo reporta ~60% de reduccion en espera percibida. Traducible a: confirmar una serie completada. [strivecloud via busqueda](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)
- **Tono amable, no punitivo** (Gentler Streak, Apple Design Award 2024): reencuadra el descanso como esencial, no como fallo; copy sin juicio; "si un paseo de 15 min es lo que tu cuerpo puede hoy, esta perfecto". Clave para movilidad/roller/descanso en EVA. [developer.apple.com](https://developer.apple.com/news/?id=3m0ht22s)
- **Narrativa/audio inmersivo** (Zombies, Run!): el audio de una via (te habla, no le hablas) genera compromiso porque quieres saber que pasa despues. Palanca aplicable a coaching por voz en cardio. [fastcompany](https://www.fastcompany.com/1680933/how-one-developer-brought-narrative-and-zombies-to-fitness-apps)
- **Capacidades nativas del telefono** para el cronometro: iOS Live Activities + Dynamic Island permiten mostrar el cuenta-regresivo de descanso en pantalla bloqueada sin desbloquear; Android usa ongoing notifications / foreground service. [newly.app](https://newly.app/guides/ios-live-activities)
- **Apple Watch / HealthKit** entrega BPM en vivo para cardio via modulos Expo (dev-client, no Expo Go; iOS-only). WorkoutKit permite zonas de FC. [npm @kayzmann/expo-healthkit](https://www.npmjs.com/package/@kayzmann/expo-healthkit)
- **Gradientes animados / mesh / aurora + glow** son el lenguaje de fondo 2026: radiales posicionados crean "spotlight" de atencion; mantener bajo 4 capas en gama baja. Perfecto para tintar el escenario con el color del coach. [learnui.design](https://www.learnui.design/blog/mesh-gradients.html)
- **Tipografia cinetica / numeros que cuentan**: numeros que animan de 0 al valor ("count-up") convierten un dato frio en momento; Spotify Wrapped y Strava demuestran su poder de compartir. Debe resolver rapido y respetar accesibilidad. [digitalsilk](https://www.digitalsilk.com/digital-trends/kinetic-typography/)
- **Color con significado, no decorativo** (Whoop verde/amarillo/rojo; Peloton rojo neon solo para el CTA critico): reservar acentos para estados y acciones criticas hace que la energia se sienta intencional. [925studios](https://www.925studios.co/blog/whoop-design-breakdown)
- **Dark mode como escenario** es la eleccion premium transversal: fondo oscuro que amplifica el dato y el color del coach en vez de competir con el.
- **Loss aversion y accountability social** (Duolingo streaks, Friend Streaks +22% de completar): la mecanica de "no perder progreso" retiene mas que la de "ganar premio". Traducible a rachas de entrenamiento respetando el tono amable de Gentler.
- Sintesis para EVA: la vibra se logra combinando **escenario oscuro + color del coach animado + numero cinetico gigante + micro-celebracion haptica/sonora + celebracion fullscreen escasa en hitos + tono amable**. Ninguna pieza depende de una mascota.

## Hallazgos

### 1. Headspace — motion y pacing COMO branding (no la ilustracion)

Aunque Headspace es famoso por su ilustracion, su sistema de marca describe el motion como pilar de primer nivel junto a color, tipografia y tono de voz, "balanceando claridad con calidez" ([standards.site](https://standards.site/case-studies/headspace/)). Lo importante para un caso white-label es que **el ritmo del movimiento comunica la intencion**, no el personaje: transiciones suaves, texturas blandas, composiciones abiertas y un pacing "lento y constante que espeja la experiencia meditativa" ([itsnicethat](https://www.itsnicethat.com/articles/italic-studio-headspace-graphic-design-project-250424)). El gesto emblematico: al iniciar una meditacion, el boton de play "cobra vida", se transforma y se mueve mientras la sesion progresa y llena la barra de carga ([busqueda motion Headspace](https://www.todaymade.com/blog/motion-graphic-examples)).

Palanca extraible: **la personalidad puede vivir enteramente en las curvas de animacion (easing), la duracion y la respiracion de los elementos**. Un elemento que "respira" (escala suave 0.98↔1.02 en loop lento) transmite calma sin ningun asset de marca.

### 2. Whoop / Oura — data visualization como identidad premium

Whoop construye lujo con restriccion brutal: un vocabulario de **solo tres colores semanticos** (verde = recuperacion/readiness, rojo = strain/riesgo, amarillo = intermedio) que se repite en cada pantalla, de modo que el usuario aprende el lenguaje una vez y aplica en todos lados; "no hay colores de acento arbitrarios, cada tono carga significado" ([925studios](https://www.925studios.co/blog/whoop-design-breakdown)). La tipografia es limpia y **sobredimensionada para la metrica principal (~72pt equivalente)** para leerse a la distancia del brazo, con todo lo demas deliberadamente pequeno y secundario. El dark mode cumple funcion real: fondos negros hacen que los puntos de dato de alto contraste "salten", reducen fatiga ocular a primera hora, y hacen que los elementos de coaching con color se sientan primarios, no decorativos. Las transiciones entre niveles de dato "mantienen contexto espacial" para que nunca pierdas donde estas en la jerarquia.

El concepto de rediseno de Oura reafirma el patron: reutilizar tipografia y paleta de marca centrando accesibilidad, disponibilidad del dato y navegacion intuitiva ([crausser](https://www.crausser.com/oura-redesign)).

Palanca extraible: **numero gigante + fondo oscuro + acentos reservados para estado**. Es la formula que hace que un dato se sienta caro.

### 3. Duolingo — celebracion escasa, micro-interacciones densas, loss aversion

Duolingo llama a las rachas "la palanca de retencion mas efectiva del producto". El diseno clave es **gatear las celebraciones dramaticas a hitos** (7, 30, 100, 365): un dia normal recibe solo el incremento del contador; un hito detiene el flujo y dispara una animacion fullscreen custom (fenix que vuela y se incendia, buho en llamas). Esto crea rareza percibida y evita la fatiga de celebracion. Dato duro: **rediseñar solo la animacion del fenix movio retencion D7 +1.7%** ([deconstructoroffun](https://duolingo.deconstructoroffun.com/mechanics/streaks)). Las micro-interacciones (un "ding" alegre, fuegos artificiales, el saludo de Duo) refuerzan cada acierto y **reducen la latencia percibida ~60%** ([strivecloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)). La mecanica de racha explota **loss aversion**: la gente se mueve mas por no perder progreso que por ganar premio, y el "streak freeze" evita la desmotivacion por un dia fallado ([medium/salamprem](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)). Friend Streaks: usuarios 22% mas propensos a completar la leccion diaria.

Palanca extraible para EVA: **micro-celebracion barata por serie completada** (haptica + tick sonoro + numero que cuenta) y **celebracion fullscreen reservada** para terminar el entrenamiento o batir un PR. El personaje de Duo es reemplazable por motion + el color del coach.

### 4. Gentler Streak — vibra amable, no punitiva (Apple Design Award 2024)

Gentler Streak (Apple Design Award de Impacto Social 2024, Apple Watch App of the Year 2022) demuestra que **el tono es una palanca de vibra tan fuerte como el motion**. Reencuadra el fitness como estilo de vida: el descanso es esencial, no un fallo; el copy es compasivo y sin juicio ("si un paseo de 15 minutos es lo que tu cuerpo puede hoy, esta perfecto") ([developer.apple.com](https://developer.apple.com/news/?id=3m0ht22s)). Paleta suave (azules y verdes) que calma; numeros grandes y bold; datos convertidos en "insights accionables" y presentados como un viaje visual (Activity Path) en vez de una racha punitiva ([pixso](https://pixso.net/articles/gentler/)). Nota white-label: su mascota "Yorhart" es abstracta (representa tu corazon), no un personaje de marca comercial — el equivalente EVA no debe ser una mascota, pero SI puede ser un elemento abstracto (un pulso, un anillo) que reacciona.

Palanca extraible: **microcopy amable + reencuadre del descanso** para las pantallas de rest timer, movilidad y roller, donde la vibra correcta es calma y respeto, no adrenalina.

### 5. Peloton — energia y color reservado para la accion critica

Peloton usa interfaz oscura con **rojo neon saturado reservado exclusivamente para los elementos interactivos criticos** ("Continue", "Start Program"), dando un golpe de energia justo donde importa ([designrush](https://www.designrush.com/best-designs/apps/peloton-app-design)). Durante cada clase muestra **data en tiempo real** (cadencia, resistencia, output) creando feedback visual dinamico, y suma mecanicas de celebracion/comunidad (leaderboard, niveles Bronce→Legend en Club Peloton) para premiar aparecer ([designrush](https://www.designrush.com/best-designs/apps/peloton-app-design)).

Palanca extraible: **energia = color reservado + metricas vivas en pantalla**. En cardio de EVA, el output en vivo (BPM, distancia, tiempo restante) ES la energia; no hace falta ruido visual extra.

### 6. Zombies, Run! — narrativa/audio inmersivo de una via

Zombies, Run! es "un juego de correr ultra-inmersivo" que funciona mas como audiodrama que como app fitness: el corredor (Runner 5) se compromete porque **quiere saber que pasa despues** ([fastcompany](https://www.fastcompany.com/1680933/how-one-developer-brought-narrative-and-zombies-to-fitness-apps)). Truco de inmersion: la comunicacion es de una sola via (te hablan, no puedes responder), lo que se siente natural y envolvente ([android.appstorm](https://android.appstorm.net/reviews/lifestyle/zombies-run/)).

Palanca extraible: en cardio/movilidad, **coaching por voz de una via** (audio del coach o TTS animando: "vas 60%, mantene el ritmo") crea vibra sin nada visual, ideal cuando el telefono esta en el bolsillo o el brazo.

### 7. Cronometro con capacidades nativas — Live Activities, Dynamic Island, haptica

El rest timer no tiene que vivir dentro de la app. **iOS Live Activities (ActivityKit)** muestran cuenta-regresivo, ejercicio actual e info de serie en la pantalla bloqueada y el **Dynamic Island** sin desbloquear; se actualizan via `Activity.update()` local o push APNs (~4KB), incluso con la app suspendida, hasta 8h activas ([newly.app](https://newly.app/guides/ios-live-activities)). Apps reales ya lo hacen para rest timers (Rest, Liftin', Musklr, Bolt) ([macworld/apps](https://www.macworld.com/article/1360554/ios-16-1-live-activities-dynamic-island-apps.html)). En Expo hay guias para Live Activity timers ([levelup](https://levelup.gitconnected.com/building-a-live-activity-timer-in-expo-626b162f3e8d)). Android no tiene equivalente directo: se usa **ongoing notification / foreground service**. La haptica del descanso (avisar fin de serie con un patron nativo) se maneja aparte (expo-haptics en RN; Web Vibration API en PWA, con soporte parcial en iOS Safari).

### 8. Apple Watch / HealthKit para BPM en cardio

El BPM en vivo de Apple Watch llega via HealthKit. Modulos Expo como `@kayzmann/expo-healthkit` exponen 50+ metricas con config Swift/TS; `react-native-workouts` (WorkoutKit) permite crear/sincronizar workouts al Watch con alertas de zona de FC (min/max BPM) ([github/Janjiran](https://github.com/Janjiran/react-native-workouts)). Restricciones duras: **no funciona en Expo Go** (requiere dev-client + `expo prebuild`), es **iOS-only**, y exige descripciones de permiso en Info.plist ([npm @kayzmann/expo-healthkit](https://www.npmjs.com/package/@kayzmann/expo-healthkit), [wellally](https://www.wellally.tech/blog/react-native-apple-healthkit-integration-guide)). En PWA no hay acceso a HealthKit; el fallback es Web Bluetooth a bandas compatibles (soporte limitado) o entrada manual.

### 9. Tipografia cinetica y numeros que cuentan

La tipografia cinetica reemplaza el hero estatico como gancho de atencion; **funciona solo cuando clarifica jerarquia y resuelve rapido**, respetando accesibilidad y "reduce motion" ([digitalsilk](https://www.digitalsilk.com/digital-trends/kinetic-typography/)). Los "count-up" (numero que anima de 0 al valor) convierten un dato frio en momento; Strava genero 20 escenas data-driven que produjeron 2M+ videos compartidos, y Spotify Wrapped 2023 logro 4B+ interacciones ([svgator](https://www.svgator.com/blog/50-kinetic-typography-examples/)). En fitness dark-mode 2026, micro-interacciones y animaciones de progreso elevan el engagement de los dashboards ([canvasbuilder](https://canvasbuilder.co/blog/fitness-website-design-trends-2026)).

### 10. Gradientes animados / mesh / aurora + glow como escenario

El lenguaje de fondo 2026 combina **mesh gradients, aurora, glassmorphism y glow**; radiales posicionados estrategicamente crean un efecto spotlight que dirige la atencion ([colorshunter](https://colorshunter.com/blog/gradient-design-trends), [css-zone](https://css-zone.com/blog/css-gradient-trends-2026)). Los mesh son "faciles de animar como blobs amorfos de color" y sirven de branding por sub-seccion ([learnui.design](https://www.learnui.design/blog/mesh-gradients.html)). Nota de rendimiento: **mantener bajo ~4 capas en gama baja**, porque 6+ capas dañan el paint. En RN se logra con expo-linear-gradient + Reanimated o shaders (Skia); en PWA con multiples radiales CSS animados.

## Aplicabilidad a EVA

### RN nativo (la mejor experiencia)

- **Escenario oscuro + color del coach animado**: fondo dark-mode como stage; un mesh/aurora sutil (2-3 capas, Skia o expo-linear-gradient + Reanimated) tintado con `--theme-primary` del coach que respira o se desplaza lento. Es la "vibra" central y es 100% white-label porque el color entra por token.
- **Numero cinetico gigante**: kg/reps/tiempo como metrica dominante (equivalente ~64-72pt) con count-up al confirmar. Reanimated `withTiming` sobre un shared value; respetar `AccessibilityInfo.isReduceMotionEnabled`.
- **Micro-celebracion por serie**: al marcar serie completada, combinar expo-haptics (notificationSuccess) + tick sonoro corto + pulso del anillo/numero. Barato y frecuente.
- **Celebracion fullscreen escasa**: interstitial fullscreen SOLO al terminar el ejercicio/entrenamiento o batir PR (patron Duolingo). Confetti/particulas teñidas con el color del coach, texto cinetico. Nunca en cada serie.
- **Rest timer nativo**: Live Activity + Dynamic Island (iOS, via config plugin + dev-client) mostrando cuenta-regresivo y siguiente serie sin desbloquear; foreground service + ongoing notification en Android; haptica al terminar.
- **Cardio**: HealthKit/WorkoutKit para BPM en vivo y zonas de FC (iOS, dev-client), arco/anillo de progreso animado de "cuanto falta" (tiempo/distancia), coaching por voz de una via (TTS o audio del coach) estilo Zombies Run.
- **Movilidad**: holds por lado con temporizador grande, cambio de lado con haptica distinta y microcopy amable estilo Gentler ("cambia de pierna, sin apuro").
- **Roller**: multimedia (gif/video) al centro sin tocar botones, contador de pasadas grande, tono calmo.
- **Tono**: microcopy amable y sin juicio en descanso/movilidad/roller; energetico y con color reservado al CTA critico en fuerza/cardio.
- **RIR/RPE solo en fuerza**: teclado numerico nativo grande para valores; los otros tres tipos nunca muestran RIR/RPE.

### PWA responsive (hereda el diseno y todo lo funcionalmente posible)

- **Hereda**: escenario oscuro, mesh/aurora con radiales CSS animados (bajo 4 capas), numero gigante con count-up (requestAnimationFrame o Web Animations API), micro-celebracion visual, celebracion fullscreen en hitos, microcopy amable — todo con los mismos tokens del coach.
- **Degradaciones honestas**: sin Live Activities/Dynamic Island → cronometro con Web Notifications + Wake Lock API para no apagar pantalla; haptica via Web Vibration API (soporte parcial, ausente en iOS Safari) con fallback visual/sonoro. Sin HealthKit → BPM por Web Bluetooth (soporte limitado) o entrada manual. Respetar `prefers-reduced-motion`.
- Documentar cada capacidad no disponible como fallback explicito, sin fingir paridad.

### Compartido en packages/*

- **`packages/workout-engine` (motor puro)**: mantener la logica de series, descansos, holds por lado, pasadas y progreso (tiempo/distancia) libre de UI; exponer el estado que ambas capas animan.
- **Tokens de vibra en packages compartidos**: nombres semanticos de color de estado (exito/atencion/riesgo estilo Whoop) que se resuelven contra `--theme-primary` del coach — nunca hardcode; asi la "vibra" es white-label por construccion.
- **Contratos de celebracion**: definir en shared los eventos que disparan micro vs macro celebracion (serie completada, ejercicio terminado, PR, entrenamiento terminado, hito de racha) para que RN y PWA reaccionen igual con distinto render.
- **Curvas de motion y duraciones** como constantes compartidas (easing "respirado" tipo Headspace) para consistencia de marca-de-movimiento entre plataformas.

## Fuentes

- [WHOOP Design Breakdown: Data-Dense UI That Feels Simple — 925 Studios](https://www.925studios.co/blog/whoop-design-breakdown)
- [Standards Case Study: Headspace — Calm, Expressive System](https://standards.site/case-studies/headspace/)
- [Headspace overhauls visual identity — It's Nice That](https://www.itsnicethat.com/articles/italic-studio-headspace-graphic-design-project-250424)
- [Duolingo Streaks: How the Mechanic Drives 2x Daily Retention — Deconstructor of Fun](https://duolingo.deconstructoroffun.com/mechanics/streaks)
- [Duolingo — Streak System Detailed Breakdown — Medium (Premjit Singha)](https://medium.com/@salamprem49/duolingo-streak-system-detailed-breakdown-design-flow-886f591c953f)
- [Duolingo gamification examples — StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)
- [Behind the Design: How Gentler Streak approaches fitness with "humanity" — Apple Developer](https://developer.apple.com/news/?id=3m0ht22s)
- [Gentler Streak's Design: The Hidden UX Gems — Pixso](https://pixso.net/articles/gentler/)
- [Peloton App Design Analysis — DesignRush](https://www.designrush.com/best-designs/apps/peloton-app-design)
- [Mobile App Teardown: Peloton — Fueled](https://fueled.com/blog/mobile-app-teardown-peloton/)
- [How One Developer Brought Narrative--And Zombies--To Fitness Apps — Fast Company](https://www.fastcompany.com/1680933/how-one-developer-brought-narrative-and-zombies-to-fitness-apps)
- [Zombies, Run! review — Android.AppStorm](https://android.appstorm.net/reviews/lifestyle/zombies-run/)
- [iOS Live Activities: ActivityKit, Dynamic Island & Lock Screen Guide (2026) — Newly](https://newly.app/guides/ios-live-activities)
- [Building a Live Activity Timer in Expo React Native — Level Up Coding](https://levelup.gitconnected.com/building-a-live-activity-timer-in-expo-626b162f3e8d)
- [34 apps using Live Activities and Dynamic Island — Macworld](https://www.macworld.com/article/1360554/ios-16-1-live-activities-dynamic-island-apps.html)
- [@kayzmann/expo-healthkit — npm](https://www.npmjs.com/package/@kayzmann/expo-healthkit)
- [react-native-workouts (Apple WorkoutKit) — GitHub](https://github.com/Janjiran/react-native-workouts)
- [React Native HealthKit Integration Guide — WellAlly](https://www.wellally.tech/blog/react-native-apple-healthkit-integration-guide)
- [Kinetic Typography in 2026: Examples, Patterns & UX Risk — Digital Silk](https://www.digitalsilk.com/digital-trends/kinetic-typography/)
- [50 kinetic typography examples — SVGator](https://www.svgator.com/blog/50-kinetic-typography-examples/)
- [Mesh Gradients: A UI Technique Deep Dive — Learn UI Design](https://www.learnui.design/blog/mesh-gradients.html)
- [CSS Gradient Trends in 2026: From Subtle to Bold — Colors Hunter](https://colorshunter.com/blog/gradient-design-trends)
- [Latest CSS Gradient Features and Trends for 2026 — CSS-Zone](https://css-zone.com/blog/css-gradient-trends-2026)
- [Best Dark Mode Fitness App & Dashboard Designs for 2026 — Canvas Builder](https://canvasbuilder.co/blog/fitness-website-design-trends-2026)
- [Oura Redesign — Claire Rausser Portfolio](https://www.crausser.com/oura-redesign)
