# F6 — Celebraciones, transiciones e interstitials de pantalla completa

Investigacion de fundamentos para el rediseno del ejecutor de entrenamiento de EVA. Foco: como celebrar logros, encadenar pasos con interstitials que animan sin frenar el ritmo, y construir un arco narrativo de sesion (inicio energizante, medio enfocado, final celebratorio con resumen compartible). Referencias: pantalla fin-de-leccion de Duolingo, cierre de anillos de Apple, milestones de Nike Run Club, PR cards de Strava, motores de confetti y patrones de haptics/motion nativos.

## Resumen ejecutivo

- La pantalla fin-de-leccion de Duolingo es una secuencia coreografiada, no un solo evento: personaje que sube, clima de particulas (explosion), y luego tres stat cards que entran con stagger, numeros que cuentan (tickers) y sonidos puntuales. La celebracion "grande" y el "resumen de datos" son dos momentos distintos, no uno solo ([60fps.design](https://60fps.design/shots/duolingo-lesson-complete-head-explode-animation)).
- Duolingo trata el motion como capacidad estrategica: adquirio dos estudios de animacion (Gunner 2022, Hobbes 2024) para crear un equipo interno de motion design. La leccion para EVA: el motion no es decoracion, es un sistema con dosificacion propia ([blog.duolingo via search](https://blog.duolingo.com/world-character-visemes/); [tipranks](https://www.tipranks.com/news/press-releases/duolingo-doubles-down-on-design-and-animation-with-acquisition-of-hobbes)).
- El confetti de calidad usa ~100 particulas, corre en el hilo nativo (Reanimated worklets, no JS), aplica velocidad por segundo con delta-time, rotacion en 3 ejes y emision en oleadas (stagger). Menos de 100 particulas mantiene 60fps en la mayoria de dispositivos ([Shopify Engineering](https://shopify.engineering/building-arrives-confetti-in-react-native-with-reanimated); [pkgpulse](https://www.pkgpulse.com/guides/canvas-confetti-vs-tsparticles-vs-party-js-celebration-2026)).
- La celebracion debe dosificarse en jerarquia chica/media/epica. Repetir la celebracion epica cansa (reward fatigue); el marco Octalysis recomienda cambiar QUE core drive carga la motivacion segun la fase, no subir siempre la intensidad ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/habit-formation-gamification-octalysis-design/)).
- Nike Run Club celebra sobre todo el PROGRESO propio (personal best), no el ranking social: cada vez que superas tu marca la app "lo dice explicitamente". Esto convierte cada serie/sesion en un evento con desenlace medible contra uno mismo ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)).
- Las metricas de retencion de NRC muestran que quienes completan logros de tier dificil retienen 74% vs 32% en tier facil: el arco de dificultad creciente y celebrado importa mas que el premio individual ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)).
- Los milestones se estructuran en umbrales claros (5K, 10K, etc.) mas acumulados de por vida. En EVA los equivalentes son: primera serie, mitad del bloque, PR de peso/reps, sesion completa, y acumulados (sesiones totales, semanas seguidas) ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)).
- Strava genera PR cards pre-estilizadas y compartibles con distancia, ritmo, tiempo y mini-mapa, listas para Instagram Stories. El resumen final debe ser una imagen exportable, no solo una pantalla efimera ([runflick](https://runflick.com/blog/share-strava-on-instagram); [Strava stories](https://stories.strava.com/articles/track-your-run-prs)).
- El cierre de anillos de Apple combina animacion (fuegos artificiales) con haptics: el feedback tactil confirma "lo lograste" sin obligar a mirar la pantalla. En EVA, cada set completado y el fin de sesion deben tener firma haptica ([AppleMagazine](https://applemagazine.com/apple-haptics/); [Apple Community](https://discussions.apple.com/thread/252009834)).
- Los haptics de workout deben ser DISTINGUIBLES por el tacto: patron de inicio y de fin no pueden sentirse iguales o el usuario tiene que mirar. Fin de descanso = 3 taps descendentes (campana), aviso 10s = pulso suave, sesion completa = patron largo de exito ([dev.to](https://dev.to/lalo132/haptic-feedback-design-for-workout-apps-48h5)).
- Preparar el motor haptico con `.prepare()` antes de disparar evita latencia perceptible; hay que "calentar" el proximo evento al comenzar la fase actual, clave para sincronizar haptic con sonido/animacion ([dev.to](https://dev.to/lalo132/haptic-feedback-design-for-workout-apps-48h5); [Apple Developer](https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator)).
- Accesibilidad no negociable: respetar `prefers-reduced-motion`, nunca superar 3 destellos por segundo (WCAG 2.3.1), y ofrecer una version reducida de cada celebracion (fade + haptic en vez de confetti) ([web.dev](https://web.dev/learn/accessibility/motion); [a11y-collective](https://www.a11y-collective.com/blog/wcag-animation/)).
- El timer de descanso debe arrancar solo al marcar la serie, correr en background con notificacion al terminar, y usar digitos extra-grandes legibles a distancia y de reojo ([Medium/design-bootcamp](https://medium.com/design-bootcamp/the-ux-of-going-to-the-gym-b3ce99d5dd1d); [Medium/penguinchilli](https://medium.com/@penguinchilli/ui-design-time2rest-app-66321d75ff55)).
- El cronometro conectado a Apple Watch (BPM en vivo, distancia, tiempo) se alimenta de HKLiveWorkoutBuilder / HKWorkoutSession, que emite muestras de heart rate de alta frecuencia durante el estado activo ([Apple Developer](https://developer.apple.com/documentation/HealthKit/running-workout-sessions); [WWDC22](https://developer.apple.com/videos/play/wwdc2022/10005/)).
- El interstitial entre ejercicios debe animar sin frenar: transiciones cortas, personaje/marca que reacciona, barra de progreso que avanza. Duolingo usa "animated progress bars and simple transitions" entre pasos para comunicar avance sin cortar el flujo ([60fpsdesign](https://60fpsdesign.substack.com/p/fun-in-every-frame)).
- El arco narrativo tiene tres actos: activacion energizante al inicio, foco sin friccion en el medio (haptics y multimedia guian, no la vista), y clima celebratorio + ritual de progreso al final (resumen, PR card, streak).

## Hallazgos

### 1. Anatomia de la pantalla fin-de-leccion de Duolingo

La secuencia de "lesson complete" con cero errores no es un unico efecto sino una coreografia en fases: el mascota Duo se desliza hacia arriba, su cabeza se expande y explota en una nube estilizada con chispas (el "momento espectaculo"), y despues de que se disipa el humo entran **tres stat cards que suben y aparecen con secuencia escalonada (stagger), con numeros que cuentan (tickers) y efectos de sonido juguetones** ([60fps.design](https://60fps.design/shots/duolingo-lesson-complete-head-explode-animation)). Los patrones de interaccion catalogados son concretos y reutilizables: bounce, morphing, particle systems, staggered sequencing, sliding transitions, sonic cues, spring physics, ticker counters y success-state confirmation ([60fps.design](https://60fps.design/shots/duolingo-lesson-complete-head-explode-animation)).

La leccion de arquitectura: **separar el "clima" (celebracion emocional) del "resumen" (datos)**. Primero la recompensa sensorial, luego los numeros que suben con tickers. Cada card entra con delay incremental (stagger) para crear ritmo en vez de aparecer todo de golpe. El compromiso organizacional de Duolingo con el motion (dos adquisiciones de estudios de animacion para formar equipo interno) confirma que esto es un sistema mantenido, no un adorno puntual ([tipranks](https://www.tipranks.com/news/press-releases/duolingo-doubles-down-on-design-and-animation-with-acquisition-of-hobbes)).

### 2. Micro-celebraciones continuas vs celebracion final (Duolingo)

Ademas del gran final, Duolingo salpica micro-motion durante toda la experiencia: "subtle wing flap when you ace a quiz" y "triumphant spin when you cross a milestone"; personajes que dan feedback expresivo (un slow-clap de Lily como cue visual "unmissable") ([60fpsdesign](https://60fpsdesign.substack.com/p/fun-in-every-frame)). Entre pasos usa "animated progress bars and simple transitions" para comunicar avance ([60fpsdesign](https://60fpsdesign.substack.com/p/fun-in-every-frame)). El principio: **celebracion inmediata y frecuente en dosis chicas** transforma la repeticion en juego, reservando el espectaculo para hitos. Para EVA white-label, el "personaje" no puede ser una mascota unica de marca; la reaccion debe venir del sistema de motion en si (particulas neutras, tipografia expresiva, la barra de progreso que "celebra") tintado con los colores del coach.

### 3. Fisica y performance del confetti (Shopify Arrive)

Implementacion de referencia: **100 particulas**, cada una con velocidades direccionales donde "each velocity expresses how much a value will be changing for each full second of animation", rotacion en los tres ejes para comportamiento de papel realista, calculo con delta-time (`dt` multiplica velocidades por frame) y rebote horizontal con multiplicadores de elasticidad ([Shopify Engineering](https://shopify.engineering/building-arrives-confetti-in-react-native-with-reanimated)). Clave de rendimiento: **corre en el hilo nativo (Reanimated), no en JS**, porque mantener 60fps exige recalcular cada propiedad en menos de 16ms por frame, imposible garantizar en el hilo unico de JavaScript. El confetti emerge en oleadas con delays escalonados (stagger) ([Shopify Engineering](https://shopify.engineering/building-arrives-confetti-in-react-native-with-reanimated)).

Guias generales de confetti: mantener bajo ~100 particulas para 60fps, usar requestAnimationFrame, limpiar cuando las particulas se asientan; parametros de fisica tipicos: damping ~0.9 (caida de velocidad tras el disparo), gravity (velocidad de caida), drag (1 = sin arrastre, 0.1 = mucho), time-to-live ~2000ms; duracion comun de emision ~5s ([Konfetti/GitHub](https://github.com/DanielMartinus/Konfetti); [pkgpulse](https://www.pkgpulse.com/guides/canvas-confetti-vs-tsparticles-vs-party-js-celebration-2026)).

### 4. Comparativa de motores para la PWA

Para web: **canvas-confetti** es el default (~6kB, cero dependencias, canvas + requestAnimationFrame, usado en produccion por GitHub/Linear); **tsparticles** para efectos ambientales complejos con presets/fisica (~20-100kB); **party.js** ancla efectos a elementos DOM sin canvas ([pkgpulse](https://www.pkgpulse.com/guides/canvas-confetti-vs-tsparticles-vs-party-js-celebration-2026)). Los tres deben chequear `prefers-reduced-motion` antes de disparar, y en Next.js App Router requieren ejecucion client-side (useEffect / dynamic import) para evitar errores de SSR ([pkgpulse](https://www.pkgpulse.com/guides/canvas-confetti-vs-tsparticles-vs-party-js-celebration-2026)). Recomendacion para EVA: canvas-confetti en la PWA por peso y madurez; en RN, confetti propio en Reanimated (o react-native-fast-confetti + Skia) para paridad de fisica ([animatereactnative](https://www.animatereactnative.com/post/confetti-animation-reanimated)).

### 5. Dosificacion: jerarquia chica/media/epica y fatiga

El marco Octalysis advierte que las recompensas variables deben ser **especificas por fase**: efectivas en los dias 30-60 pero problematicas si se mantienen indefinidamente porque crean dependencia en vez de habito ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/habit-formation-gamification-octalysis-design/)). El "graduation principle" dice reducir la presion extrinseca a medida que la conducta se vuelve automatica; mantener alta intensidad pasado el umbral de habito causa burnout ([Yu-kai Chou](https://yukaichou.com/gamification-analysis/habit-formation-gamification-octalysis-design/)). La investigacion de habitos cita ~66 dias de promedio para formar uno (rango 18-254) ([gearbrain/search](https://www.gearbrain.com/gamified-productivity-task-habit-apps-2671686076.html)).

Traduccion a jerarquia de celebracion para el ejecutor:
- **Chica (por serie):** haptic tick + micro-animacion del boton + numero que sube. Sin sonido invasivo. Ocurre docenas de veces, debe ser barata y no cansar.
- **Media (fin de ejercicio/bloque):** interstitial corto con progreso, quiza un burst pequeno de particulas, haptic de exito suave.
- **Epica (fin de sesion o PR real):** confetti completo, sonido, resumen con tickers, PR card compartible, haptic largo de celebracion.

La regla anti-fatiga: la epica se gana, no se regala en cada serie. Un PR genuino (mas peso/reps que la marca previa) merece epica; una serie normal, solo chica.

### 6. Nike Run Club: progreso propio, streaks calibradas, tiers

NRC estructura milestones por umbrales (5K, 10K, media maraton, maraton) mas badges acumulados de por vida, disenados para mover al usuario entre tiers de dificultad en vez de estancarse ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)). Enfatiza **auto-competencia sobre ranking social**: "every time a user sets a new record on a distance they have run before, the app calls it out explicitly" ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)). Usa streaks **semanales, no diarias**, porque un dia de descanso rompiendo una racha diaria seria injusto y desmotivante para una actividad fisica ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)). Los guided runs con coach de voz crean una "obligacion social leve dentro de la sesion" que reduce el abandono a mitad de ejercicio ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)). Dato de retencion: 74.17% en tier dificil vs 32.26% en tier facil ([trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)).

Para EVA: celebrar PRs propios explicitamente ("nuevo record en press banca: 82.5kg"), streaks semanales de asistencia (no diarias, respetando descansos), y un coach de voz/texto opcional en cardio/movilidad como ancla anti-abandono.

### 7. Strava: la PR card compartible como ritual de cierre

Strava genera imagenes pre-estilizadas con distancia, ritmo, tiempo y mini-mapa, listas para postear en Instagram Stories ([runflick](https://runflick.com/blog/share-strava-on-instagram)). Mantiene una seccion Best Efforts con los top PRs por distancia y otorga "medals" (medalla PR) cuando marcas un record en un segmento ([Strava Support](https://support.strava.com/hc/en-us/articles/216918487-All-Time-PRs)). El resumen no es efimero: es un **artefacto exportable** que el usuario puede compartir, lo que amplifica motivacion y actua como marketing organico. Para EVA (white-label), la PR card debe llevar la marca del coach (logo, colores) y datos de la sesion: volumen total, PRs, tiempo, tal vez frecuencia cardiaca del cardio.

### 8. Apple: anillos, haptics y el momento de cierre

El cierre de anillos combina animacion (fuegos artificiales reportados por la comunidad) con haptics tactiles que confirman el logro sin obligar a mirar ([Apple Community](https://discussions.apple.com/thread/252009834); [AppleMagazine](https://applemagazine.com/apple-haptics/)). Apple trata el haptic como una forma de feedback junto a sonido, color, texto y animacion, usada en fitness rings, timers y breathing sessions para guiar atencion sin forzar la vista ([AppleMagazine](https://applemagazine.com/apple-haptics/)). El aniversario de 10 anos de los anillos sumo award limitado + stickers animados, evidencia de que Apple ritualiza los milestones con recompensas coleccionables ([gsmarena](https://m.gsmarena.com/apple_celebrates_ten_years_of_apple_watch_activity_rings_with_limitededition_award-news-67385.php)).

### 9. Haptics de workout: patrones distinguibles y `.prepare()`

`UINotificationFeedbackGenerator` produce tres eventos: success, error, warning ([Apple Developer](https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator)). Los patrones deben ser **distinguibles solo por el tacto**: si inicio y fin se sienten iguales, el usuario tiene que mirar y se pierde el proposito ([dev.to](https://dev.to/lalo132/haptic-feedback-design-for-workout-apps-48h5)). Patrones concretos de referencia: inicio de round = dos taps agudos; fin = tres taps descendentes imitando campana (intensidad 1.0 → 0.8 → 0.6); aviso 10s = un pulso suave; workout complete = patron largo de exito ([dev.to](https://dev.to/lalo132/haptic-feedback-design-for-workout-apps-48h5)). Critico: el motor tiene latencia de arranque, hay que llamar `.prepare()` antes y "calentar" el proximo evento al empezar la fase actual, especialmente para sincronizar haptic con sonido/animacion ([dev.to](https://dev.to/lalo132/haptic-feedback-design-for-workout-apps-48h5)). Chequear `supportsHaptics` y degradar con gracia en devices sin Core Haptics.

### 10. Timer de descanso y cronometro nativo

Buenas practicas: arrancar el timer automaticamente al marcar la serie como completa (flujo sin friccion); permitir que corra en background y notifique al terminar para que el usuario pueda usar otras apps; digitos extra-grandes legibles desde cualquier angulo y de reojo entre series ([Medium/design-bootcamp](https://medium.com/design-bootcamp/the-ux-of-going-to-the-gym-b3ce99d5dd1d); [stormotion](https://stormotion.io/blog/fitness-app-ux/)). El descanso es tiempo muerto que puede llenarse con el interstitial del proximo ejercicio (ver seccion 11). Combinar countdown con haptics: aviso a 10s (pulso suave) y fin (tres taps) para no exigir mirar la pantalla.

### 11. Interstitials entre pasos que animan sin frenar el ritmo

Duolingo usa transiciones simples + barras de progreso animadas entre pasos ([60fpsdesign](https://60fpsdesign.substack.com/p/fun-in-every-frame)). El interstitial fullscreen entre ejercicios (idea del CEO) puede coincidir con el descanso: mientras corre el cronometro, la pantalla muestra el proximo ejercicio (nombre, gif/video al centro sin botones), la barra de progreso de la sesion avanzando, y un micro-mensaje de animo tintado con la marca. La transicion debe ser corta (deslizamiento + fade, no una pausa larga) para que el atleta sienta impulso, no espera. El multimedia del ejercicio (gif/video en loop) debe verse sin tocar nada y no ser invasivo: centro, auto-play silencioso, controlable pero no obligatorio.

### 12. Cardio conectado a Apple Watch (BPM, distancia, tiempo)

`HKLiveWorkoutBuilder` sobre `HKWorkoutSession` genera muestras de heart rate de alta frecuencia durante el estado activo; la app puede mostrar frecuencia cardiaca actual, distancia y otras estadisticas cuando el usuario levanta la muneca ([Apple Developer](https://developer.apple.com/documentation/HealthKit/running-workout-sessions)). Tras el workout se guarda automaticamente una muestra de heart rate recovery con su contexto ([WWDC22](https://developer.apple.com/videos/play/wwdc2022/10005/)); iOS 26/27 suma workout zones de heart rate al HealthKit ([WWDC26](https://developer.apple.com/videos/play/wwdc2026/207/)). Para EVA cardio: progreso animado de cuanto falta (tiempo/distancia) alimentado por estas muestras, BPM en vivo con zona de color, y celebracion al cerrar el objetivo (equivalente a cerrar un anillo). Requiere companion app watchOS o iPhone como host de la sesion.

## Aplicabilidad a EVA

### RN nativo (ExecutorV2)

- **Motor de confetti propio en Reanimated** (worklets en hilo UI, ~80-100 particulas, rotacion 3 ejes, delta-time, stagger en oleadas). Alternativa: react-native-fast-confetti + Skia. Nunca animar particulas en JS.
- **Jerarquia de celebracion en 3 niveles** como servicio central (`celebrationService`): chica (serie), media (bloque), epica (sesion/PR). Cada nivel define animacion + haptic + sonido + duracion. La epica se dispara solo con PR real o sesion completa para evitar fatiga.
- **Haptics con `expo-haptics` / Core Haptics**: patrones distinguibles (serie completa = success tick; aviso 10s = pulso suave; fin descanso = 3 taps descendentes; sesion = patron largo). Llamar `prepare()` al iniciar cada fase. Degradar si el device no soporta.
- **Interstitial fullscreen durante el descanso**: proximo ejercicio con gif/video centrado en auto-loop silencioso, barra de progreso de sesion animada, cronometro grande, mensaje de animo tintado con marca del coach. Transicion slide+fade corta.
- **Cardio con HealthKit**: sesion via HKWorkoutSession/HKLiveWorkoutBuilder, BPM en vivo con zona de color, progreso animado (tiempo/distancia), celebracion al cerrar objetivo.
- **PR card compartible** generada nativamente (react-native-view-shot o Skia) con marca del coach, exportable a Stories.
- **Movilidad/roller**: usar la misma maquinaria de timer + haptic pero con semantica por lado (hold pierna izq → haptic de cambio → pierna der) y conteo de pasadas para roller, con micro-celebracion por lado completado.

### PWA responsive (WorkoutExecutionClient)

- **canvas-confetti** (~6kB) para la celebracion epica; disparar solo client-side (useEffect/dynamic import en App Router). tsparticles solo si se quiere ambiente; party.js opcional.
- **Web Vibration API** como sustituto parcial de haptics (limitado en iOS Safari; degradar a solo visual). El fin de descanso puede usar notificacion + sonido.
- **Heredar la misma jerarquia y arco narrativo** que RN: micro-animacion por serie (CSS transitions/Web Animations), interstitial de descanso, resumen final con tickers.
- **Sin Apple Watch nativo**: cardio en PWA usa timer/distancia manual o del sensor del navegador; BPM solo si hay device Bluetooth (fuera de alcance tipico). Degradar con gracia.
- **Respetar `prefers-reduced-motion`**: version alternativa fade+estatica de cada celebracion; nunca >3 destellos/seg (WCAG 2.3.1); permitir pausar/ocultar movimiento no esencial (SC 2.2.2).

### Compartido en packages (workout-engine y afines)

- **Maquina de estados del ejecutor y deteccion de logros son platform-agnostic**: `packages/workout-engine` debe exponer los eventos que disparan celebracion (serie completa, PR detectado comparando contra marca previa, bloque completo, sesion completa, streak) sin acoplar animacion.
- **Definir el contrato de "celebration tier"** (chica/media/epica) y el payload del resumen de sesion (volumen, PRs, tiempo, BPM) en el paquete compartido; cada app lo renderiza con su propia tecnologia de motion.
- **Logica de deteccion de PR** (mas peso/reps que el historico) y de streak semanal centralizada, para que web y RN celebren exactamente los mismos hitos.
- **Tokens de dosificacion** (duraciones, umbrales anti-fatiga, mapa evento→tier) como constantes compartidas, no hardcodeadas en cada app.
- **Respeto white-label**: el contrato de celebracion recibe los tokens de marca del coach (color primario, logo) como parametro; la "vibra" (particulas, tipografia expresiva, progreso) es neutral y se tinta, nunca depende de una mascota fija.

## Fuentes

- [Duolingo Lesson Complete Head Explode Animation — 60fps.design](https://60fps.design/shots/duolingo-lesson-complete-head-explode-animation)
- [Fun in Every Frame — 60fps Design (Substack)](https://60fpsdesign.substack.com/p/fun-in-every-frame)
- [Duolingo doubles down on design and animation with acquisition of Hobbes — TipRanks](https://www.tipranks.com/news/press-releases/duolingo-doubles-down-on-design-and-animation-with-acquisition-of-hobbes)
- [Building Arrive's Confetti in React Native with Reanimated — Shopify Engineering](https://shopify.engineering/building-arrives-confetti-in-react-native-with-reanimated)
- [Konfetti confetti particle system — GitHub (DanielMartinus)](https://github.com/DanielMartinus/Konfetti)
- [canvas-confetti vs tsparticles vs party.js 2026 — PkgPulse](https://www.pkgpulse.com/guides/canvas-confetti-vs-tsparticles-vs-party-js-celebration-2026)
- [Confetti animation — Reanimated — animatereactnative](https://www.animatereactnative.com/post/confetti-animation-reanimated)
- [Gamified Habit Formation That Actually Sticks (Octalysis) — Yu-kai Chou](https://yukaichou.com/gamification-analysis/habit-formation-gamification-octalysis-design/)
- [Nike Run Club Gamification case study — trophy.so](https://trophy.so/blog/nike-run-club-gamification-case-study)
- [5 Ways to Share Your Strava Activity on Instagram — Runflick](https://runflick.com/blog/share-strava-on-instagram)
- [All-Time PRs — Strava Support](https://support.strava.com/hc/en-us/articles/216918487-All-Time-PRs)
- [Track Your Run PRs on Strava — Strava Stories](https://stories.strava.com/articles/track-your-run-prs)
- [Apple Haptics Shape the Feel of Every Tap — AppleMagazine](https://applemagazine.com/apple-haptics/)
- [Activity rings fireworks — Apple Community](https://discussions.apple.com/thread/252009834)
- [Apple celebrates ten years of Activity rings — GSMArena](https://m.gsmarena.com/apple_celebrates_ten_years_of_apple_watch_activity_rings_with_limitededition_award-news-67385.php)
- [Haptic Feedback Design for Workout Apps — DEV Community](https://dev.to/lalo132/haptic-feedback-design-for-workout-apps-48h5)
- [UINotificationFeedbackGenerator — Apple Developer](https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator)
- [Running workout sessions — Apple Developer Documentation](https://developer.apple.com/documentation/HealthKit/running-workout-sessions)
- [What's new in HealthKit — WWDC22](https://developer.apple.com/videos/play/wwdc2022/10005/)
- [Deliver workout insights with HealthKit workout zones — WWDC26](https://developer.apple.com/videos/play/wwdc2026/207/)
- [Animation and motion — web.dev](https://web.dev/learn/accessibility/motion)
- [How to Create Engaging and Accessible WCAG-Compliant Animations — The A11Y Collective](https://www.a11y-collective.com/blog/wcag-animation/)
- [The UX of going to the gym — Medium (Bootcamp)](https://medium.com/design-bootcamp/the-ux-of-going-to-the-gym-b3ce99d5dd1d)
- [UI Design: Time2Rest App — Medium (penguinchilli)](https://medium.com/@penguinchilli/ui-design-time2rest-app-66321d75ff55)
- [Fitness App UX design principles — Stormotion](https://stormotion.io/blog/fitness-app-ux/)
