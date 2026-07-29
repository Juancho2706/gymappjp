---
status: reference
owner: engineering
last_verified: "2026-07-28"
canonical: false
---

# Referentes de primer arranque en apps fitness/wellness

Referente r1 de la familia de entrada de EVA (splash nativo → walkthrough/onboarding → selector de rol "Soy alumno / Soy coach"). Objetivo: extraer como resuelven el primer arranque las apps de fitness/wellness que definen la categoria en 2025-2026 (Whoop, Strava, Nike Run Club / Training Club, Peloton, Hevy, Fitbod, Cal AI, Headspace, Oura) mas Duolingo como referente transversal de onboarding, y traducirlo a decisiones concretas para la direccion elegida por el owner: **dark premium continuo**, una sola atmosfera oscura sin flash blanco, coherente con el ejecutor V3.

Para cada app se documenta: (a) splash y transicion a contenido, (b) estructura del onboarding, (c) tratamiento dark/atmosfera y uso de marca, (d) CTA y jerarquia, (e) que se siente premium y por que.

## Resumen ejecutivo

- **El splash no es una pantalla, es una costura.** La regla que repiten las guias 2025-2026: el usuario debe sentir que la app *aparece*, no que *carga*. Apple recomienda que el launch screen sea un placeholder estatico que espeja el layout de la primera pantalla real; en iOS el launch screen es un storyboard estatico y **no admite animacion**. (uxpin.com, mobbin.com/glossary/launch-screen)
- **Presupuesto de tiempo duro:** hay reportes de perdida de ~12% de usuarios cuando el splash pasa de ~1.5s; en Android 12+ la recomendacion es que la `AnimatedVectorDrawable` del splash no supere 1000ms y los splash mas rapidos no animan mas de ~200ms. (appypie.com, developer.android.com)
- **La atmosfera se continua en JS, no en el splash nativo.** La practica recomendada para RN es dejar el splash nativo **estatico** y mover el movimiento a la primera pantalla React, cruzando con un fade. `expo-splash-screen` ya expone duracion y fade de salida; no hace falta una dep nativa nueva. (docs.expo.dev/versions/latest/sdk/splash-screen, github.com/zoontek/react-native-bootsplash)
- **El carrusel pasivo de 3 slides es el patron con peor evidencia de todos.** Solo ~1% toca los indicadores del carrusel, 84% interactua una sola vez y rara vez pasa del primer slide; la mayoria son swipeados en menos de dos segundos. El fenomeno tiene nombre: **learned blindness** — el usuario no evalua tu carrusel, lo reconoce y lo salta por reflejo. (userpilot.com, designerup.co)
- NN/g es aun mas duro: los tutoriales tipo deck-of-cards **no mejoraron el desempeño en tareas**, y la promocion de features en el primer arranque sobra porque el usuario ya decidio descargar la app. Su recomendacion literal: "avoid creating app onboarding whenever possible and instead spend resources making the UI more usable". (nngroup.com)
- **Duolingo es el contraejemplo mas citado y el mas util:** mover la pantalla de registro **detras de la primera leccion** subio DAU **+20%**. La personalizacion (idioma, motivo) va antes de la leccion; la cuenta va despues del valor. Opera por *endowed progress effect*: abandonar despues de invertir esfuerzo se siente perdida. (goodux.appcues.com, junoschool.org)
- **Hevy es el benchmark de velocidad en fuerza:** descargar, crear cuenta y registrar la primera serie en **menos de 90 segundos**, sin paywall de entrada, sin evaluacion obligatoria, sin quiz de objetivos. Su propio teardown de UX, sin embargo, lo critica por pedir credenciales antes del valor y por un "AHA moment" que llega tarde. (repreturn.com, himanshuprodesign.medium.com)
- **Peloton es el mejor referente de dark premium en la entrada:** formularios de signup sobre un **blur oscuro por capas** con foto de instructor visible detras (marca presente, no distractora), **progressive disclosure campo por campo** (usuario, luego cumpleaños), y un **rojo neon saturado reservado exclusivamente** para los CTA criticos ("Continue", "Start Program"). (designrush.com)
- **Whoop demuestra que el dark se sostiene con vocabulario de color, no con negro:** fondo casi totalmente negro y **solo tres colores semanticos** (verde recovery, rojo strain, amarillo intermedio); "no arbitrary accent colors exist — every hue carries meaning". Metrica primaria a ~72pt para leerse a distancia de brazo, texto secundario deliberadamente chico. (925studios.co)
- **Los quiz largos funcionan cuando cada pregunta cambia el producto.** Fitbod abre con "cual es tu razon principal para entrar" en vez de edad/genero/altura, y su seleccion detallada de equipamiento hace que los entrenamientos sean realistas; el costo es la cantidad de pasos. Headspace cambia las rutinas recomendadas **en tiempo real** segun objetivo (estres, foco, sueño). (theappfuel.com, tearthemdown.medium.com)
- **Cal AI es el extremo comercial del patron:** onboarding tipo quiz de ~2:15 (00:15–02:30) que **abre con un video demo corto de la app**, lleno de animaciones e interacciones, con prompt de review a mitad de camino, genera un plan personalizado y recien ahi muestra un paywall suave. Drop-off alto y deliberado: quien lo termina convierte y retiene mucho mejor. (screensdesign.com, sebastianstef.com, superwall.com)
- **Nike es el caso de "la marca hace el trabajo":** el onboarding de NRC/NTC es basicamente crear cuenta / iniciar sesion, idioma y personalizacion de avisos, y adentro. La critica documentada es que **no orienta** hacia Guided Runs ni Plans: se gana velocidad, se pierde descubrimiento. (pageflows.com, designrush.com/best-designs/apps/nike-run-club)
- **Strava, cuando quiere emocionar, narra:** para el upgrade construyeron un onboarding animado con los tres features mas usados por dato (Leaderboard, Fitness, Relative Effort) contados como "una historia sobre vos", con el objetivo explicito de "create a great first impression". En el flujo gratuito la estrategia opuesta: ir rapido a la primera actividad grabada, salteando feed, clubes y desafios. (medium.com/strava-design, pageflows.com)
- **Revelacion progresiva como sustituto del tour:** Whoop desbloquea Strain Coach al dia 5 y Sleep Coach al dia 7 tras 4 dias de calibracion; Oura revela metricas nuevas (resilience) tras 2 semanas de baseline. El "tour" se reemplaza por descubrimiento en el tiempo. (everydayindustries.com x2)
- **Tendencia 2026 del dark premium:** dark-first (se diseña el oscuro primero), >80% de usuarios moviles con dark activado, y el reemplazo del negro plano por **"ambient mode"** — azules medianoche, verdes profundos, carbones — con gradientes sutiles, glow para jerarquia y traslucidez refinada con **grano/ruido, bordes con gradiente y sombras suaves**. (muz.li, abdulazizahwan.com, medium/dark-glassmorphism)
- **Advertencia de accesibilidad, con caso real:** Oura es dark-only y su propio case study lo critica porque el blanco puro sobre negro puro "can be tough to digest" e impacta legibilidad. Dark premium no es #FFF sobre #000. (somesaltwater.com)

## Hallazgos por app

### 1. Whoop — el dark funcional y la confianza por personalizacion

**(a) Splash y transicion.** No hay documentacion publica del splash; lo relevante y verificable es su tratamiento de transiciones internas: "transitions between tiers use smooth animations that maintain spatial context". La continuidad espacial es el mecanismo que evita la sensacion de pantalla muerta entre capas. (925studios.co)

**(b) Estructura.** Descarga → conexion Bluetooth → creacion de perfil → walkthrough educativo largo. El perfil pregunta con marco de vida, no de formulario: "How can WHOOP best guide you?" con opciones tipo "Focus on Wellness", y luego objetivos preset ("Improve sleep", "Build muscle", "Increase lifespan"). Despues, features escalonados: dias 1-4 calibracion, dia 5 Strain Coach, dia 7 Sleep Coach. (everydayindustries.com)

**(c) Dark y marca.** Fondo casi totalmente negro por tres razones funcionales declaradas: contraste de datos, menos fatiga visual en chequeos de madrugada, y que los elementos de coaching de color "feel like the primary content rather than decoration". Vocabulario cerrado de tres colores (verde/rojo/amarillo) que se aprende una vez y aplica en todas las pantallas. (925studios.co)

**(d) CTA y jerarquia.** La jerarquia la fija la tipografia: metrica primaria a ~72pt equivalente ("readable from arm's length"), secundario chico a proposito. El color de accion es escaso porque el color esta reservado a significado.

**(e) Premium.** Viene de la disciplina: sistema de visualizacion construido por un diseñador de informacion (Bureau Oberhaeuser, BMW/Airbnb) bajo la premisa "design must serve data rather than aesthetics". Y del efecto psicologico reportado por el evaluador: cuando el producto demuestra que aprendio, "the WHOOP was smart and knew me, which helped me trust the product more". **Friccion documentada:** el walkthrough es "helpful but long".

### 2. Strava — narrativa animada donde importa, velocidad donde no

**(a) Splash y transicion.** Sin dato publico. Lo documentado es el onboarding animado de suscripcion, con objetivo explicito de "make our athletes more excited when they upgrade" y "create a great first impression". (medium.com/strava-design)

**(b) Estructura.** Dos regimenes distintos. Gratuito: llevar al usuario a **la primera actividad grabada** lo antes posible, salteando feed social, clubes y desafios, para cerrar el loop core (grabar → verlo → compartirlo). Suscripcion: historia guiada sobre los tres features mas usados **elegidos por dato** (Leaderboard, Fitness, Relative Effort), narrados como "una historia sobre vos". (pageflows.com, medium.com/strava-design)

**(c) Dark y marca.** Strava no es dark-first; su equity es el naranja y el mapa. Lo portable no es la paleta sino el criterio: **el contenido del onboarding se elige con datos de uso**, no con lo que el equipo quiere mostrar.

**(d) CTA.** Un unico camino por pantalla hacia el core loop.

**(e) Premium.** El movimiento aparece exactamente donde hay que justificar valor (upgrade) y desaparece donde hay que ir rapido (primer registro). Esa asimetria es la leccion.

### 3. Nike Run Club / Training Club — marca fuerte, onboarding casi inexistente

**(a) Splash y transicion.** Arranque limpio y minimalista, marca-primero (swoosh, tipografia grande). "Smart, fun and easy to use from the second you launch the app for the first time" es el objetivo declarado del equipo. (designrush.com/best-designs/apps/nike-run-club)

**(b) Estructura.** Practicamente solo cuenta: crear cuenta / iniciar sesion → confirmacion → seleccion de idioma (NRC) o personalizacion de avisos (NTC) → contenido principal. Sin quiz, sin carrusel de valor. (pageflows.com)

**(c) Dark y marca.** La atmosfera la da la fotografia deportiva a sangre y el bloque tipografico; la marca sustituye a la explicacion.

**(d) CTA.** Jerarquia binaria y clasica: accion primaria solida (crear cuenta) + secundaria textual (ya tengo cuenta).

**(e) Premium.** Confianza: la app no siente necesidad de venderse. **Costo documentado:** al centrarse solo en la cuenta, pierde la oportunidad de orientar hacia Guided Runs y Plans; se sugiere un tour corto y opcional post-signup.

### 4. Peloton — el referente mas directo de "dark premium con formulario"

**(a) Splash y transicion.** Sin dato publico del splash; el logro esta en que **el signup ya es la atmosfera**: no hay corte entre "pantalla bonita" y "formulario feo".

**(b) Estructura.** Onboarding progresivo: el formulario revela **un campo por vez** (usuario, luego cumpleaños, etc.), y despues recomienda programas para principiantes que funcionan como recorrido inicial y presentan instructores. (designrush.com)

**(c) Dark y marca.** "Layered dark blur effect behind the sign-up forms": la foto del instructor queda visible para marca pero difuminada para no competir. Es exactamente el mecanismo de **continuidad de atmosfera** que EVA busca: una sola imagen/ambiente que persiste y se atenua mientras cambia el contenido encima.

**(d) CTA y jerarquia.** Rojo neon saturado **reservado exclusivamente** a los elementos interactivos criticos ("Continue", "Start Program"). En un fondo oscuro, un unico color saturado hace el CTA imposible de no ver sin ensuciar la pantalla. Copy directo, verbal, sin adornos.

**(e) Premium.** Sans-serif limpia, tarjetas modulares con headers claros y aire, iconos como puntos de anclaje de datos, y disciplina cromatica. Se lee caro porque **se restringe**, no porque se decore.

### 5. Hevy — velocidad como propuesta de valor

**(a) Splash y transicion.** Minimo; todo el diseño esta orientado a acortar el camino.

**(b) Estructura.** El benchmark de la categoria fuerza: descargar, crear cuenta y **registrar la primera serie en menos de 90 segundos**. Sin paywall de entrada, sin evaluacion obligatoria, sin algoritmo pidiendo objetivos antes de mostrar la app. (repreturn.com)

**(c) Dark y marca.** Fondo oscuro con acentos azules "for energy without eye strain"; cuatro pilares declarados: claridad, motivacion, simplicidad, energia.

**(d) CTA.** Un solo camino, sin bifurcaciones decorativas.

**(e) Premium.** Se siente premium por competencia, no por lujo: la app respeta el tiempo del usuario. **Critica de su propio teardown de UX:** pide credenciales antes de entregar valor, el "AHA moment" llega tarde, el viaje es "disparate and not intuitive enough", y hay desalineacion web/mobile. Recomendaciones: valor primero y credenciales despues, onboarding contextual en vez de todo-junto, y **empty states tratados como oportunidad de activacion**. (himanshuprodesign.medium.com)

### 6. Fitbod — quiz largo justificado por consecuencia

**(a) Splash y transicion.** Sin dato relevante.

**(b) Estructura.** Quiz multi-paso donde **cada pregunta suma personalizacion real**: objetivo (musculo, fuerza, resistencia), nivel de experiencia, equipamiento en detalle (barras, banco, kettlebells, bandas), split y estructura de sesion preferida. Abre con "cual es la razon principal por la que te sumas" en lugar de edad/genero/altura. Post-ejercicio pide un "Exertion Rating" que retroalimenta recomendaciones. (theappfuel.com, autonomous.ai)

**(c)/(d)** Sin aporte distintivo para EVA mas alla del contenido.

**(e) Premium.** La sensacion de que el producto **no puede funcionar sin esa respuesta**: al elegir equipamiento, cada entrenamiento resulta ejecutable. **Friccion documentada:** la cantidad de pasos es en si misma un punto de abandono.

### 7. Cal AI — el quiz funnel llevado al limite comercial

**(a) Splash y transicion.** Arranca con **un video demo corto de la app**: en vez de prometer, muestra el producto en movimiento en los primeros segundos. (screensdesign.com, x.com/cesaralvarezll)

**(b) Estructura.** ~00:15 a 02:30 de onboarding tipo quiz con personalizacion profunda, "full of animations and cool interactions", prompt de review a mitad de flujo, generacion de un plan personalizado y **paywall suave** al final. El drop-off es alto y asumido: quien completa convierte y retiene mucho mas. (sebastianstef.com)

**(c) Dark y marca.** No es su fuerte; el valor esta en el ritmo.

**(d) CTA.** Un CTA por pantalla, avance constante, sin navegacion lateral. El paywall usa anclaje de precio ("No payment now, try for $0", mensual como ancla contra anual).

**(e) Premium.** Ritmo y densidad de animacion: nunca hay una pantalla quieta. **Lo que NO se copia:** el anclaje agresivo de precio y la oferta one-time post-rechazo son tacticas de conversion, no de calidad percibida; el equipo trata el paywall como superficie de experimentacion continua (Superwall, 3x revenue mensual en 10 meses).

### 8. Headspace — personalizacion que cambia el producto en tiempo real

**(a) Splash y transicion.** Sin dato publico relevante.

**(b) Estructura.** Etapas: creacion de cuenta + permisos de notificaciones → pantalla de personalizacion → pantalla de beneficios → paywall. La auto-segmentacion pide nivel de experiencia y caso de uso. Login social Google/Apple para bajar friccion de tipeo y codigos. (tearthemdown.medium.com, appagent.com)

**(c) Dark y marca.** Atmosfera calma por color e ilustracion; la marca es el tono, no el logo.

**(d) CTA.** Progresion lineal con un CTA dominante por paso.

**(e) Premium.** La personalizacion es **funcional, no cosmetica**: al declarar objetivo (estres, foco, sueño) las rutinas recomendadas cambian en tiempo real. Ese es el unico criterio valido para justificar una pregunta en el onboarding.

### 9. Oura — dark-only, con las cicatrices que hay que evitar

**(a)/(b)** Onboarding repartido en muchos toques (compra, kit de talla, confirmacion, entrega, app). Revelacion progresiva bien lograda: metricas nuevas (resilience) se desbloquean tras ~2 semanas de baseline, premiando consistencia. (everydayindustries.com)

**(c) Dark.** App **solo en modo oscuro**. Su propio case study lo señala como problema: el texto blanco sobre fondo negro "can be tough to digest" y afecta accesibilidad y legibilidad. (somesaltwater.com)

**(d)/(e)** Tono de copy tipo "amigo que apoya" y no entrenador exigente ("It's better to take small steps towards a more consistent routine"). **Lo que mata el entusiasmo, documentado:** pasos de setup que interrumpen, momentos de hito celebrados debilmente ("a weak handshake") y una activacion desconectada. Recomendaciones: reducir pasos, mantener la emocion y **entregar el "aha" rapido**.

### 10. Duolingo — el patron transversal: valor antes que cuenta

**(a) Splash y transicion.** Bienvenida con mascota que da continuidad emocional inmediata.

**(b) Estructura.** *Gradual engagement*: se posterga el registro lo mas posible. Antes de la primera leccion se pide idioma, objetivo y motivo ("Why are you learning a language?"). **Mover el signup detras de la primera leccion aumento DAU +20%** — no era practica estandar, fue resultado de experimento. Despues, prompts de cuenta periodicos y opcionales, cada vez mas convincentes porque hay progreso que perder (endowed progress effect). El streak se introduce en el onboarding, antes de crear cuenta. (goodux.appcues.com, junoschool.org, tasu.ai)

**(c) Dark y marca.** No aplica (light, sticker style), pero el mecanismo si.

**(d) CTA.** Un CTA por pantalla, siempre abajo, siempre la misma posicion — el pulgar aprende donde esta.

**(e) Premium.** No busca sentirse caro; busca sentirse **inevitable**. Para EVA la traduccion es: la entrada premium no es "mas pantallas bonitas", es menos pasos entre abrir y hacer.

### 11. Baseline tecnico de splash (Android/iOS/RN)

- iOS: el launch screen es un **storyboard estatico**, no admite animacion; Apple recomienda un placeholder que espeje el layout de la primera pantalla real para que la app "aparezca". (mobbin.com/glossary/launch-screen, uxpin.com)
- Android 12+: usar la **SplashScreen API** (`androidx.core:splashscreen`), eliminar Activities de splash propias por duplicacion/latencia; si se anima, mantener bajo 1000ms, y los splash mas rapidos no superan ~200ms. (developer.android.com, medium/manishkumar)
- Percepcion: mostrar algo intencional durante la carga hace que se perciba mas corta; una animacion de logo bien calibrada hace que 1.5s se sienta instantaneo mientras que un blanco vacio se siente atasco. Reportes de industria asocian pasar de ~1.5s con perdida de ~12% de usuarios. (uxpin.com, appypie.com)
- React Native: la practica recomendada es **mantener el splash nativo estatico y mover el movimiento a la primera pantalla React**, cruzando con fade. `expo-splash-screen` soporta configurar duracion y fade de salida; `react-native-bootsplash` ofrece un hook para animar el hide con Reanimated (referencia conceptual: **seria una dep nativa nueva, prohibida en EVA**). (docs.expo.dev, github.com/zoontek/react-native-bootsplash)

## Patrones accionables para EVA (dark premium, 3 superficies)

1. **Costura invisible splash → app: el "splash continuation layer".** El splash nativo (estatico, obligatorio por iOS) debe ser **pixel-identico** al estado inicial de la primera pantalla React: mismo color de fondo `--surface` oscuro, mismo logo, misma posicion y tamaño. Al montar, la pantalla React dibuja ese mismo frame y recien despues empieza el movimiento. El fade de `expo-splash-screen` cruza entre dos frames identicos: no hay flash blanco ni salto. Presupuesto: **fade ≤300ms, movimiento de entrada ≤600ms, total percibido <1.5s**.
2. **Atmosfera unica persistente (patron Peloton).** Un solo fondo — gradiente/ambient oscuro con grano sutil, dibujado una vez con **Skia** y montado por encima del router — que **nunca se desmonta** entre splash, walkthrough y selector de rol. Lo que cambia es el contenido encima y la intensidad del blur/vignette. Esto elimina por construccion el flash blanco entre rutas de Expo Router y es lo que produce la sensacion de "una sola sesion" en vez de "tres pantallas".
3. **Ambient, no negro plano.** Alinear con la tendencia 2026: base carbon/azul-medianoche con gradiente sutil y glow contenido en vez de `#000`, y **nunca `#FFF` puro sobre negro puro** (leccion Oura: legibilidad). Definir en tokens semanticos NativeWind un `surface-entry`, `ink-entry-strong` (blanco ~90%) e `ink-entry-muted`, sin inventar hex sueltos.
4. **Vocabulario cromatico cerrado en la entrada (patron Whoop/Peloton).** Un unico color saturado en toda la familia de entrada, reservado **exclusivamente al CTA primario**. Todo lo demas es escala de grises sobre la atmosfera. Es el mecanismo mas barato y mas efectivo para que un dark se lea caro. Si el deep link ya trae coach (`/c/{slug}`), ese color es `--theme-primary` del coach; si no, es el de EVA.
5. **Tres slides SI, pero value-first y con movimiento propio, nunca carrusel pasivo.** La evidencia contra el carrusel es contundente (1% toca indicadores, 84% una sola interaccion, swipe en <2s, learned blindness). Mitigacion obligatoria: cada slide **muestra el producto real de EVA en movimiento** (una serie registrandose, un plan de nutricion armandose, un alumno cumpliendo) al estilo del video demo de Cal AI, con transicion continua entre slides (elementos que se transforman, no que se reemplazan) via Moti/Reanimated 4. **Y CTA visible desde el slide 1**: quien ya sabe entra sin swipear.
6. **El selector de rol es una bifurcacion, no una encuesta (patron self-segmentation).** Dos icon cards grandes "Soy alumno" / "Soy coach", con jerarquia asimetrica: alumno es el volumen (pre-seleccion visual dominante), coach es el segundo camino claramente accesible. La regla documentada: usar icon cards de persona **solo si de verdad vas a adaptar la primera experiencia** — en EVA si (rutas, permisos y home divergen), asi que el patron esta justificado. Maximo una pregunta en esta etapa.
7. **Nunca pedir el rol si el contexto ya lo sabe.** Deep link `/c/{slug}`, invitacion de coach, o sesion previa en `AsyncStorage` deben **saltar el selector** y aterrizar directo en el login del alumno con la marca del coach ya aplicada. Cada pregunta que el sistema puede responder solo es friccion pura (leccion Oura: reducir pasos para mantener la emocion). Nota operativa: el hallazgo F1 P0 de QA device (slug `/c/josefit` que no resuelve y deja `coachId` null) toca exactamente este camino y debe cerrarse junto con este rediseño.
8. **Valor antes que credenciales, en la medida que el modelo lo permita (Duolingo +20% DAU, critica a Hevy).** EVA no puede entrenar sin cuenta, pero si puede: mostrar el producto real en los slides, dejar el CTA "Ya tengo cuenta" siempre presente, y **no anteponer ningun quiz, permiso ni paywall al login**. Permisos (notificaciones, HealthKit) van contextuales, en el momento en que se necesitan, no en la entrada.
9. **Copy de coach que apoya, no que exige (patron Oura/Headspace), en espanol latam neutro.** Titulares cortos orientados a resultado, verbo en el CTA ("Empezar", "Entrar", "Soy alumno"), sin jerga de producto. Un CTA por pantalla, **siempre en la misma posicion inferior** para que el pulgar aprenda (patron Duolingo).
10. **Jerarquia tipografica agresiva (patron Whoop).** Un solo elemento dominante por pantalla — titular grande, respiracion generosa alrededor, secundario deliberadamente chico. En dark, el aire y el contraste tipografico hacen mas por la sensacion premium que cualquier efecto.
11. **Delight con presupuesto y sin deps nuevas.** Todo el movimiento con Moti + Reanimated 4 (spring, stagger) y Skia para gradiente/grano/glow; **haptica con expo-haptics solo en el commit del rol** (selection tick) y en el exito de login, nunca como unico canal. Prohibido Lottie y cualquier dep nativa nueva; nada de esto lo requiere.
12. **Respetar reduce-motion y safe areas desde el dia 1.** Si `AccessibilityInfo.isReduceMotionEnabled`, la familia de entrada degrada a fades planos manteniendo la misma atmosfera. Safe areas y dark obligatorio segun reglas del repo; QA en Android e iOS antes de declarar nada verde.

## Anti-patrones a evitar

1. **El carrusel de 3 slides pasivos con ilustraciones genericas y "Saltar" arriba a la derecha.** Es el patron que la evidencia castiga mas: swipeado en menos de 2 segundos, victima de learned blindness, y segun NN/g los tutoriales tipo deck-of-cards no mejoran el desempeño. Si los 3 slides no muestran producto real ni permiten entrar desde el primero, no justifican existir; conviene menos pantallas y mejor UI.
2. **Splash "de marca" propio como pantalla extra, animado y largo.** Sumar un splash JS por encima del nativo duplica el arranque, agrega latencia y produce el doble flash exacto que el owner quiere eliminar. En Android la guia es eliminar Activities de splash custom y usar la SplashScreen API; en iOS el launch screen ni siquiera admite animacion. Cualquier logo que "respira" 2 segundos es tiempo robado, no marca construida.
3. **Anteponer quiz, permisos o paywall al valor.** Fitbod paga con abandono su cantidad de pasos y Cal AI acepta drop-off alto porque monetiza al final del funnel; EVA no tiene ese modelo — su alumno llega invitado por un coach que ya pago la relacion. Pedir objetivos, notificaciones o datos de salud antes de entrar es friccion sin retorno. Cualquier pregunta que no cambie el producto en la pantalla siguiente (criterio Headspace/Fitbod) no va en la entrada.

## Fuentes

- [WHOOP Design Breakdown: Data-Dense UI That Feels Simple (925 Studios)](https://www.925studios.co/blog/whoop-design-breakdown)
- [WHOOP Health & Fitness Wearable User Experience Evaluation (Everyday Industries)](https://everydayindustries.com/whoop-wearable-health-fitness-user-experience-evaluation/)
- [Creating an Animated Onboarding Experience (Strava Design, Medium)](https://medium.com/strava-design/creating-an-animated-onboarding-experience-19b0363a1326)
- [Strava iOS — User Flow Recordings (Page Flows)](https://pageflows.com/ios/products/strava/)
- [Nike Run Club Onboarding Flow (Page Flows)](https://pageflows.com/post/ios/onboarding/nike-run-club/)
- [Stunning App Design Inspiration: Nike+ Run Club (DesignRush)](https://www.designrush.com/best-designs/apps/nike-run-club)
- [Peloton App Design Analysis (DesignRush)](https://www.designrush.com/best-designs/apps/peloton-app-design)
- [Hevy App Review 2026: What's Free, What's Pro (RepReturn)](https://repreturn.com/hevy-app-review/)
- [Case Study: Hevy's New User Onboarding UX (HSProdesign, Medium)](https://himanshuprodesign.medium.com/new-user-onboarding-ux-hevys-activity-tracker-teardown-7b796b912636)
- [Fitbod — Onboarding flow (App Fuel)](https://www.theappfuel.com/examples/fitbod_onboarding)
- [Fitbod App Review 2026 (Autonomous)](https://www.autonomous.ai/ourblog/fitbod-app-review)
- [Cal AI — Calorie Tracker UI Breakdown (ScreensDesign)](https://screensdesign.com/showcase/cal-ai-calorie-tracker)
- [How Cal AI scaled paywall experimentation and grew monthly revenue 3x+ (Superwall)](https://superwall.com/case-studies/cal-ai)
- [How Cal AI Scaled to $2M/Month in 12 Months (Sebastian Stef)](https://sebastianstef.com/resources/cal-ai-case-study)
- [Product Teardown — Headspace: User onboarding personalisation (Tear Them Down, Medium)](https://tearthemdown.medium.com/product-teardown-headspace-user-onboarding-personalisation-b6effd0df1d7)
- [Mobile App Onboarding: 4 Examples of Successful New User Flows (AppAgent)](https://appagent.com/blog/new-user-flow-types/)
- [First Impressions Matter: A Deep Dive into the Onboarding of the Oura Ring (Everyday Industries)](https://everydayindustries.com/oura-ring-onboarding-user-experience-evaluation/)
- [Oura Ring Case Study (Some Saltwater)](https://somesaltwater.com/oura-case-study)
- [Duolingo's delightful user onboarding experience (Appcues GoodUX)](https://goodux.appcues.com/blog/duolingo-user-onboarding)
- [The Duolingo Onboarding Experience: A 5-Minute Masterclass in User Value (Juno School)](https://www.junoschool.org/article/duolingo-onboarding-experience/)
- [Duolingo's Onboarding Flow: 38 Screens (Tasu.ai)](https://tasu.ai/library/duolingo)
- [Mobile-App Onboarding: An Analysis of Components and Techniques (NN/g)](https://www.nngroup.com/articles/mobile-app-onboarding/)
- [Mobile Carousels Beyond Onboarding: How to Use Them to Avoid User Fatigue (Userpilot)](https://userpilot.com/blog/mobile-carousels/)
- [The 14 Types of Onboarding UX/UI Used by Top Apps (DesignerUp)](https://designerup.co/blog/the-14-types-of-onboarding-ux-ui-used-by-top-apps-and-how-to-copy-them/)
- [Onboarding UX Patterns: A Data-Backed Guide (Chameleon)](https://www.chameleon.io/blog/onboarding-ux-patterns)
- [Onboarding UX: 10 patterns, best practices, and real examples (Appcues)](https://www.appcues.com/blog/user-onboarding-ui-ux-patterns)
- [Splash Screen Design: Best Practices, Examples, and Guidelines (UXPin)](https://www.uxpin.com/studio/blog/splash-screen/)
- [App Splash Screen Best Practices: Cut It to 1.5s or Lose 12% of Users (Appy Pie)](https://www.appypie.com/blog/app-splash-screen-best-practices)
- [Launch Screen UI Design: Best practices (Mobbin Glossary)](https://mobbin.com/glossary/launch-screen)
- [Migrate your splash screen implementation to Android 12 and later (Android Developers)](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate)
- [Building a Splash Screen in Android the Right Way, 2025 Edition (Manish Kumar, Medium)](https://medium.com/@manishkumar_75473/building-a-splash-screen-in-android-the-right-way-2025-edition-084683381283)
- [SplashScreen (Expo Documentation)](https://docs.expo.dev/versions/latest/sdk/splash-screen/)
- [react-native-bootsplash (GitHub, zoontek)](https://github.com/zoontek/react-native-bootsplash)
- [Mobile App Design Trends 2026: UI Patterns (Muzli)](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/)
- [Beyond the Glass: 7 Mobile UI Trends Defining 2026 (Abdul Aziz Ahwan)](https://www.abdulazizahwan.com/2026/02/beyond-the-glass-7-mobile-ui-trends-defining-2026.html)
- [Dark Glassmorphism: The Aesthetic That Will Define UI in 2026 (Medium)](https://medium.com/@developer_89726/dark-glassmorphism-the-aesthetic-that-will-define-ui-in-2026-93aa4153088f)
