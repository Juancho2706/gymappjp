# Referentes de loggers de FUERZA para el ejecutor de EVA

Teardown de la UX de anotar una serie, cronometro de descanso, plate calculator, historial visible, deteccion y celebracion de PRs, supersets y velocidad de captura en los principales loggers de fuerza del mercado (Strong, Hevy, Ladder, Fitbod, CoPilot/Trainwell, Gymshark). Foco en que hace que un logger se sienta "premium y con vibra" versus "utilitario", y como se traduce a EVA (RN nativo, PWA y packages compartidos).

## Resumen ejecutivo

- El benchmark de velocidad universal: anotar una serie debe tomar 10-15 segundos; si pasa de 30 segundos la interfaz "es demasiado lenta" (setgraph, hotelgyms). Todo el diseno del ejecutor debe optimizar taps por serie.
- El feature mas util para progresion no es un grafico: es la columna "Previous" (Anterior) que auto-rellena peso y reps de la ultima vez. Hevy y Strong la ponen justo bajo el campo de captura y la marcan como "el feature mas util para el sobrecarga progresiva" (repreturn, hotelgyms).
- Auto-rellenar los valores previos como valores por defecto reduce la captura a menudo a un solo tap (el check de "completar serie") cuando el alumno repite lo del plan.
- Strong se percibe como el mas pulido/rapido ("para quienes ya construyeron el habito"), Hevy como el mas accesible/limpio ("para quienes recien lo construyen"); misma velocidad real, distinta curva (repreturn).
- El rest timer estandar arranca automatico al marcar la serie completa, con ajuste en incrementos de 15 s y opcion de saltar; al llegar a cero, notifica con tono y/o vibracion (hevyapp, fitbod).
- Hevy lleva el rest timer a iOS Live Activity + Dynamic Island: muestra ejercicio actual, set, peso/reps y el timer en la pantalla bloqueada sin abrir la app; notifica al terminar (hevyapp).
- La celebracion de PR de Strong (animacion breve al superar un record, PR "flageado" automaticamente dentro de la serie) es citada como "un toque pequeno pero motivador" que Hevy no replica tan bien; Hevy en cambio detecta PRs de forma mas agresiva (repreturn).
- El plate calculator de Strong (ingresas peso objetivo y platos disponibles, calcula la configuracion exacta, "a un tap") es un diferenciador de piso de gimnasio que Hevy no iguala (repreturn, setgraph "Smart Plates").
- Los supersets de Hevy son de primera clase: tap para enlazar ejercicios en circuito y el rest timer se ajusta solo; en Strong (Premium) los drop-sets/myo-reps "se sienten pegados" (repreturn). ~50% de los entrenos de Fitbod incluyen supersets, auto-etiquetados (fitbod).
- Lo que hace a Ladder sentirse premium NO es la captura de datos: es la presencia del coach (voiceovers on/off, video demos, pep talks semanales), badges por hitos, muro de selfies post-entreno y "claps" en vivo de otros usuarios a mitad de sesion (outdoorsynomad, parade).
- CoPilot/Trainwell (Best Personal Trainer App 2025 de Forbes, 4.9 con 4.900+ reviews) usa ML sobre el Apple Watch para reconocer la "firma" de cada ejercicio por el movimiento de la muneca y dar feedback de forma/ritmo en tiempo real (virtualpersonaltrainers).
- El Apple Watch mide frecuencia cardiaca de forma continua durante el entreno via HealthKit; apps de terceros leen BPM en vivo abriendo la app en iPhone + Watch a la vez (Apple Support, apps de terceros como Workout Live).
- La "vibra" 2025 se construye con micro-animaciones y feedback sensorial: confetti, flashes de racha, tonos satisfactorios, hapticos por hito; los usuarios tienen 2.3x mas probabilidad de engagement diario tras una racha de 7+ dias (plotline, studiokrew).
- En Expo/RN las Live Activities son viables con librerias de config plugin (expo-live-activity, @bacons/apple-targets, react-native-widget-extension), iOS 16.2+ minimo, payload < 4 KB; requieren DevClient, no Expo Go (github software-mansion-labs).
- Ninguna app blanca-marca depende de una mascota unica: la celebracion se apoya en color de marca del coach, hapticos y tipografia, lo que encaja con el requisito white-label de EVA.

## Hallazgos

### 1. Anotar una serie: metodos de captura y velocidad

El patron dominante en los loggers de fuerza es una fila por serie con columnas: numero de serie, "Previous" (lo que hiciste la vez pasada), peso (kg), reps, y opcionalmente RPE/RIR, terminando en un check de "completar serie". Al tocar el campo de peso o reps aparece un teclado numerico (number pad); MyFitnessPal, Track Your Lifts y la mayoria usan el number pad nativo para peso/reps/duracion (support.myfitnesspal.com, apps.apple.com Track Your Lifts).

El benchmark de velocidad es explicito: "anotar una serie individual deberia tomar 10-15 segundos, y si toma mas, la interfaz de la app es demasiado complicada" (hotelgyms.com/blog/hevy-workout-app-review). Otra fuente lo pone en un techo de 30 segundos (setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters). Esto empuja tres decisiones de diseno:

1. **Auto-rellenar valores previos como defaults**: Hevy y Strong pre-cargan el peso/reps de la sesion anterior, de modo que si el alumno replica el plan, la captura se reduce al check de completar. "Hevy auto-rellena tus pesos y reps previos para que siempre sepas que hiciste la ultima vez, el feature mas util para la sobrecarga progresiva" (repreturn.com/hevy-app-review).
2. **Steppers vs teclado**: hay dos escuelas. El teclado numerico es mas rapido para cambios grandes; los steppers (+/-) evitan abrir teclado para micro-ajustes (subir 2.5 kg). Track Your Lifts agrega navegacion con flechas que mueve entre campos de peso y reps, y un solo boton "Add Set" para logs consecutivos (apps.apple.com Track Your Lifts). El diseno optimo combina number pad para el valor + steppers para el ajuste fino.
3. **Recordar la ultima serie**: apps como Set & Rep Counter "recuerdan el ultimo peso y reps de cada ejercicio para que registrar sea rapido" (apps.apple.com Set & Rep Counter).

Diferencia de percepcion: "Hevy se siente disenada para quienes recien construyen el habito de registrar, Strong para quienes ya lo construyeron" (repreturn.com/strong-app-vs-hevy). Strong prioriza velocidad sobre todo: "todo esta disenado para minimizar el tiempo entre terminar una serie y registrar el dato".

### 2. RIR / RPE: solo aplica a fuerza

RPE/RIR se listan como campos importantes para Hevy y apps de bodybuilding (setgraph). En la practica es una columna opcional adicional en la fila de la serie, capturada con un selector rapido (0-10 para RPE, 0-5+ para RIR). Es clave que sea opcional y no bloquee el flujo: muchos alumnos no lo usan. Esto valida el requisito de EVA de que RIR/RPE solo aparezca en ejercicios de tipo fuerza, y como campo secundario que no compite por espacio con peso/reps.

### 3. Rest timer: automatico, ajustable, nativo

El patron estandar: al marcar la serie completa, el rest timer arranca solo con el descanso prescrito para ese ejercicio; se puede subir/bajar en incrementos de 15 s o saltar; al llegar a cero emite tono y/o vibracion (hevyapp.com/features/workout-rest-timer, fitbod.zendesk.com Rest Timer). Fitbod "muestra el periodo de descanso correcto entre series para cada ejercicio" y dispara tono/vibracion al terminar.

El salto premium es **iOS Live Activity + Dynamic Island**. Hevy muestra en el widget de Live Activity el ejercicio actual, el conteo de series, peso/reps prescritos, duracion del entreno y el rest timer que aparece al completar una serie; "aparece cuando deslizas desde arriba a la izquierda o al tocar con el telefono bloqueado, util al usar otras apps", y "cuando el timer llega a cero, Hevy notifica" (hevyapp.com/features/live-activity). Esto permite descansar mirando el reloj sin desbloquear ni abrir la app. Requiere que el usuario habilite Live Activities en ajustes.

Tecnicamente, una Live Activity es una vista SwiftUI event-scoped declarada en una Widget Extension y manejada por ActivityKit, disponible desde iOS 16.1+, con cuatro estados en Dynamic Island (compact leading, compact trailing, minimal, expanded) y un limite duro de 4 KB de payload por update (medium.com/@navinkumar7582, newly.app/guides/ios-live-activities). Se pueden incluir botones interactivos (App Intents) para pausar/saltar el descanso desde el widget.

### 4. Plate calculator (calculadora de discos)

Diferenciador de piso de gimnasio. Strong tiene un plate calculator "a un tap": ingresas el peso objetivo y los platos disponibles y calcula la configuracion exacta de discos por lado; es "una funcion genuinamente util que Hevy no tiene" tan desarrollada (repreturn.com/strong-app-vs-hevy). Setgraph lo llama "Smart Plates" (setgraph). Para EVA aplica solo a fuerza con barra; debe ser accesible sin salir del flujo de captura y respetar unidades (kg en Chile) y la barra/discos disponibles del gimnasio.

### 5. Deteccion y celebracion de PRs

Dos modelos:

- **Strong**: PR flageado automaticamente dentro de la serie, con "una animacion breve cuando superas un record personal", citada como "un toque pequeno pero motivador" (repreturn.com/strong-app-vs-hevy). Es sobrio pero satisfactorio.
- **Hevy**: deteccion mas agresiva; "los PRs se rastrean automaticamente y la app los celebra dentro del entreno con una pequena notificacion" (repreturn.com/hevy-app-review).

El PR estimado mas usado es el 1RM estimado por serie; ambos apps grafican su tendencia en el tiempo como "la metrica individual mas util para el desarrollo de fuerza" (repreturn). La celebracion inmediata (en el momento de completar la serie que rompe el record) es lo que genera la "vibra": micro-animacion + haptico, no un modal que interrumpa.

### 6. Supersets y estructuras compuestas

Hevy trata los supersets como ciudadanos de primera clase: "tap para enlazar ejercicios en un circuito y la app maneja el rest timer en consecuencia"; soporta supersets, drop sets y rest-pause nativamente en el flujo (repreturn.com/strong-app-vs-hevy). Strong soporta supersets solo en Premium y sus drop-set/myo-rep "se sienten pegados". Fitbod incluye supersets nativos: "~50% de los entrenos semanales de Fitbod incluyen supersets, auto-etiquetados y registrados como circuitos" (fitbod.me/blog). Implicacion para EVA: el modelo de datos y el timer deben entender el agrupamiento (dos o mas ejercicios enlazados con descanso solo al final del circuito).

### 7. Que hace a Ladder "premium" vs Strong "utilitaria"

Ladder fue finalista al App of the Year 2025 de la App Store (no gano el Apple Design Award de "Delight and Fun" 2025; ese fue para CapWords y Balatro segun el anuncio oficial de Apple, apple.com/newsroom 2025/06). Lo que hace premium a Ladder no es la captura de datos (registra peso, reps, tiempo de descanso y % de esfuerzo, similar a todos), sino **capas de motivacion humana y social**:

- **Presencia del coach**: voiceovers de coaching togglables on/off ("apoyo total en los momentos dificiles, o silencio para sufrir en silencio"), video demos de cada ejercicio, y "pep talks en video al inicio de cada semana" (outdoorsynomad.com/ladder-fitness-app-review).
- **Badges por hitos**: seccion de badges que premia logros como entrenos en feriados o alcanzar "5.000 minutos totales de entreno" (outdoorsynomad).
- **Social en vivo**: "muro de selfies post-entreno", chat de equipo, y "claps aleatorios a mitad de entreno" de otros usuarios; los companeros de equipo que hacen el mismo entreno el mismo dia postean resultados y celebran los PRs de los demas (outdoorsynomad, parade.com/health/ladder-app-review).

Strong, en cambio, gana en pulido de interfaz y velocidad pero es deliberadamente utilitaria: minimizar el tiempo de registro, sin capa social ni coach. La leccion para EVA (coach-alumno, white-label): la "vibra" premium se construye con **presencia del coach + celebracion + progreso visible**, no con mas campos de captura.

### 8. IA, Apple Watch y feedback en tiempo real

CoPilot/Trainwell (nombrada Best Personal Trainer App of 2025 por Forbes; 4.9/5 con 4.900+ reviews en App Store) usa ML para entender la "firma" de cada ejercicio: "sabe la diferencia entre una sentadilla y una estocada por como se mueve tu muneca en el espacio", con integracion profunda al Apple Watch para feedback de forma y ritmo en tiempo real (virtualpersonaltrainers.org/is-copilot-fitness-worth-it). Es coaching AI + humano combinado.

Sobre BPM: el Apple Watch mide frecuencia cardiaca de forma continua durante el entreno (y 3 minutos despues para la tasa de recuperacion), leible por terceros via HealthKit; apps como Workout Live muestran heart rate, calorias y distancia en vivo abriendo la app en iPhone y Watch a la vez (support.apple.com/en-us/120277, apps.apple.com Workout Live). Esto es exactamente lo que EVA necesita para la experiencia de cardio con BPM.

### 9. Gamificacion y "vibra" tipo Duolingo

La tendencia 2025 de gamificacion se apoya en feedback sensorial: "micro-animaciones y feedback visual como explosiones de confetti, flashes de racha o tonos de audio satisfactorios que premian las acciones del usuario en tiempo real", extendiendose a "vibraciones hapticas por hitos y efectos de power-up sensoriales" (studiokrew.com/blog/app-gamification-strategies-2025). Las rachas funcionan: "los usuarios tienen 2.3x mas probabilidad de engancharse a diario tras construir una racha de 7+ dias" (plotline.so/blog/streaks-for-gamification-in-mobile-apps). Duolingo, el estandar de oro, cruzo 50 millones de DAU en Q3 2025 (+36% YoY) "impulsado casi enteramente por mejoras de gamificacion" (youngurbanproject.com, strivecloud.io). Clave: la celebracion debe ser inmediata, sensorial y no interrumpir el flujo de captura.

## Aplicabilidad a EVA

### RN nativo (ExecutorV2 — debe ser LA mejor)

- **Fila de serie con auto-fill del anterior**: replicar la columna "Anterior" + defaults pre-cargados del plan/ultima sesion, de modo que la serie tipica se cierre con un solo tap (check). Number pad grande + steppers (+/- 2.5 kg / +/-1 rep) para ajuste fino; botones grandes como pidio el CEO.
- **Rest timer con Live Activity + Dynamic Island**: usar expo-live-activity o @bacons/apple-targets / react-native-widget-extension (config plugin, iOS 16.2+, payload < 4 KB, requiere DevClient, no Expo Go). Timer circular con countdown, boton de +15 s y saltar via App Intent en el widget. Notificacion + haptico al terminar. En Android, notificacion foreground con chronometer.
- **Celebracion de PR inmediata**: al completar la serie que rompe el 1RM estimado o record de reps, disparar micro-animacion + haptico (expo-haptics) tenida con el color de marca del coach (white-label), sin modal que corte. Confetti sutil, tono corto.
- **Plate calculator (solo fuerza con barra)**: sheet accesible a un tap desde la fila, en kg, configurable por barra/discos.
- **Supersets**: agrupamiento visual de ejercicios enlazados con descanso solo al cierre del circuito.
- **Multimedia central**: gif/video del ejercicio visible al centro sin tocar botones y sin ser invasivo (loop silencioso, tap para ampliar).
- **Cardio con Apple Watch**: HealthKit para BPM/distancia/tiempo en vivo, con progreso animado de cuanto falta; requiere companion watchOS o lectura via app abierta en Watch.
- **Interstitials fullscreen entre ejercicios**: pantalla de transicion animada (proximo ejercicio + demo + pep del coach si existe), estilo Ladder pep talks, saltable.

### PWA responsive (hereda diseno + todo lo funcionalmente posible)

- Reproducir la misma fila de serie, auto-fill, steppers/teclado, plate calculator, supersets, historial "Anterior" y celebracion de PR (confetti/haptico via Vibration API donde exista) con el mismo lenguaje visual.
- Rest timer sin Live Activities nativas: usar Notifications API + Service Worker + Wake Lock para mantener el conteo visible; degradar con gracia (fail-closed) donde el navegador no lo soporte.
- Cardio/BPM: sin acceso directo al Apple Watch desde web; degradar a entrada manual o timer/distancia, marcando la experiencia nativa como superior.

### Compartido en packages (packages/workout-engine)

- **Motor puro**: calculo de 1RM estimado, deteccion de PR (record de peso, reps y 1RM), volumen por ejercicio/sesion, y logica de progresion viven en el engine, agnostico de plataforma. RN y PWA solo renderizan.
- **Logica del plate calculator**: dado peso objetivo, barra y discos disponibles -> configuracion por lado, como funcion pura reutilizable.
- **Modelo de supersets/circuitos**: representacion del agrupamiento y de cuando corre el descanso, compartida.
- **Reglas por tipo de ejercicio**: fuerza (peso/reps/RIR/RPE), cardio (tiempo/distancia/BPM), movilidad (holds por lado), roller (pasadas) definidas en el contrato compartido para que ambas UIs consuman el mismo esquema.
- **Eventos de celebracion**: el engine emite eventos semanticos (PR_ROTO, SERIE_COMPLETA, ENTRENO_TERMINADO) que cada plataforma traduce a su animacion/haptico con el color de marca, sin acoplar la vibra a una mascota.

## Fuentes

- [Hevy Workout App Review 2026 — HotelGyms](https://www.hotelgyms.com/blog/hevy-workout-app-review-the-up-and-comer-taking-the-fitness-world-by-storm)
- [Strong App vs Hevy — RepReturn](https://repreturn.com/strong-app-vs-hevy/)
- [Hevy App Review — RepReturn](https://repreturn.com/hevy-app-review/)
- [Best App to Log Workout (2025), tested by lifters — Setgraph](https://setgraph.app/ai-blog/best-app-to-log-workout-tested-by-lifters)
- [Workout Rest Timer — Hevy](https://www.hevyapp.com/features/workout-rest-timer/)
- [Live Activity — Hevy](https://www.hevyapp.com/features/live-activity/)
- [Apple unveils winners and finalists of the 2025 Apple Design Awards — Apple Newsroom](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/)
- [Ladder Fitness App Review 2026 — Outdoors Nomad](https://www.outdoorsynomad.com/ladder-fitness-app-review/)
- [I Tried the Ladder Fitness App for 30 Days — Parade](https://parade.com/health/ladder-app-review)
- [Fitbod features most reviews overlook — Fitbod](https://fitbod.me/blog/5-fitbod-features-most-reviews-overlook-but-real-users-love/)
- [Rest Timer — Fitbod Help Center](https://fitbod.zendesk.com/hc/en-us/articles/360006340194-Rest-Timer)
- [Is Copilot Fitness Worth It? — Virtual Personal Trainers](https://virtualpersonaltrainers.org/is-copilot-fitness-worth-it/)
- [Monitor your heart rate with Apple Watch — Apple Support](https://support.apple.com/en-us/120277)
- [Live Timer Updates with Dynamic Island & Lock Screen — Medium (Navinkumar)](https://medium.com/@navinkumar7582/live-timer-updates-with-dynamic-island-lock-screen-a-step-by-step-guide-22fa0a293df9)
- [iOS Live Activities: ActivityKit, Dynamic Island & Lock Screen Guide — Newly](https://newly.app/guides/ios-live-activities)
- [expo-live-activity — GitHub (Software Mansion Labs)](https://github.com/software-mansion-labs/expo-live-activity)
- [Streaks and Milestones for Gamification — Plotline](https://www.plotline.so/blog/streaks-for-gamification-in-mobile-apps)
- [Top Gamification Trends of 2025 — StudioKrew](https://studiokrew.com/blog/app-gamification-strategies-2025/)
- [Duolingo Case Study 2025 — Young Urban Project](https://www.youngurbanproject.com/duolingo-case-study/)
- [Track Your Lifts — App Store](https://apps.apple.com/us/app/track-your-lifts/id6759879187)
