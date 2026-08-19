# Teardown de Duolingo para el rediseño del ejecutor EVA

Referente r1. Objetivo: extraer patrones concretos y replicables del design system, el lenguaje de motion, la arquitectura de personajes en Rive, las celebraciones de fin de lección, el sonido/háptica y los "juicy buttons" de Duolingo, para aplicarlos al ejecutor de entrenamiento de EVA (RN nativo + PWA), respetando white-label (sin depender de una mascota única de marca).

## Resumen ejecutivo

- Duolingo trata la animación como **sistema, no como asset**: el motion reacciona al estado del producto (escuchando, esperando, acierto, error, progreso, sorpresa, recompensa), no decora. Este es el principio rector más portable a EVA. (uianimation.medium.com)
- El motor de personajes corre sobre **Rive con State Machines**: inputs en runtime (`isSpeaking`, `isCorrect`, `isWrong`, `mouthShape`, `isThinking`) que blendean estados idle/hablando/reacción simultáneamente. Archivos `.riv` compactos, mismos assets en iOS/Android/Web. (blog.duolingo.com/world-character-visemes, dev.to/uianimation)
- Duolingo creó un rol nuevo, **"creative technologist"**, que puentea animadores e ingenieros: el animador produce el asset real que va a la app, no un mockup con specs. Baja la fricción del handoff diseño→código. (rive.app/blog)
- La **secuencia de fin de lección** es escalonada y multisensorial: XP + celebración pequeña → tap Continuar → pantalla de racha con llama fullscreen y contador que sube (ticker) → tarjetas de estadística que entran con stagger, spring y números que cuentan, con SFX. (60fps.design, blog.duolingo.com)
- Las **celebraciones fullscreen custom (fénix, búho en llamas) se reservan para hitos** (7, 30, 100, 365 días). El resto de días usa feedback liviano. Esto evita fatiga de recompensa: la diferenciación visual es el premio. (duolingo.deconstructoroffun.com)
- Dato de impacto medible: rediseñar solo la animación del fénix movió la retención día-7 en **+1.7%**. El motion sí mueve métricas, pero en los momentos correctos. (duolingo.deconstructoroffun.com)
- **Timing lo es todo**: el equipo hace múltiples pasadas de animación "rough" para calibrar ritmo y energía antes de refinar. La energía celebratoria se diseña, no se improvisa. (blog.duolingo.com/streak-milestone-design-animation)
- Feedback **inmediato y con relación causa-efecto**: el confeti/chime aparece justo después de la acción disparadora para que el usuario entienda qué lo causó. (medium.com/@Bundu)
- **Sonido con roles semánticos**: acierto = chime/aplauso satisfactorio; error = "boing" juguetón; hito = SFX celebratorio especial. Siempre pareado con señal visual para accesibilidad (no depender solo del audio). (medium.com/@Bundu)
- **Háptica reservada para eventos con significado**: patrón del sistema (success/warning/error para resultados, tick de selección ligero para cambios de valor); nunca como único canal porque el usuario puede desactivarla. (vp0.com, developer.apple.com)
- Identidad visual "sticker": superficies planas, **bordes gruesos de 2px**, radio de esquina uniforme (~12px), sin gradientes ni glass. El famoso botón 3D usa una **sombra sólida inferior** que lo hace pulsable/táctil, contraste con la UI plana. (styles.refero.design, explainx.ai)
- Tipografía **Feather Bold**: display redondeada custom, sensación "libro infantil que creció", para titulares que gritan. Cuerpo en sans redondeada. (design.duolingo.com, styles.refero.design)
- **Barra de progreso viva** ("pulse bar") que se intensifica con cada acierto y llega a pico al completar; ajusta su ritmo según desempeño. Portable directo al progreso de un bloque/serie. (medium.com/@Bundu)
- El lenguaje ilustrativo usa **tres formas base** (rectángulo redondeado, círculo, triángulo redondeado); la personalidad no exige una mascota fija, se puede lograr con formas + color de marca. Clave para white-label. (medium.com/gdg-vit)
- **Críticas a internalizar**: notificaciones percibidas como coercitivas/guilt-tripping; sistema de vidas que trunca el aprendizaje; ligas que distraen del objetivo; aparece en deceptive.design por recordatorios pushy y anuncios disfrazados de pantalla de fin. La gamificación puede desplazar la motivación intrínseca. (uxdesign.cc, medium critiques)

## Hallazgos

### 1. Filosofía de motion: animación como sistema de estados

La idea central de Duolingo, repetida en análisis de su enfoque, es que "animación estilo Duolingo" **no significa decoración**: el motion está atado al estado del producto y a la intención (escuchando, esperando, éxito, fallo, progreso, sorpresa, aliento, recompensa). La animación se trata como un sistema que alinea diseño, animación y desarrollo alrededor de estado e intención compartidos. (https://uianimation.medium.com/duolingo-style-animation-in-mobile-apps-2026-how-it-works-and-what-a-rive-animator-brings-to-53f21ab79cbc)

Para EVA esto es la brújula: cada estado del ejecutor (serie en curso, serie completada, descanso corriendo, descanso por vencer, ejercicio terminado, bloque terminado, sesión terminada, PR/récord logrado) debe tener una respuesta de motion definida, no una sola animación genérica pegada al final.

### 2. Arquitectura de personajes en Rive (State Machines)

Duolingo migró sus personajes a **Rive** por tres razones concretas que ellos mismos citan: los archivos son compactos, el handoff animador→ingeniero es fluido, y la State Machine hace factible animación de personajes interactiva a gran escala dentro de la arquitectura de la app en Android, iOS y Web. (https://rive.app/blog/creative-technologists-duolingo-s-solution-to-the-designer-to-developer-handoff)

El sistema funciona con **inputs en runtime** que la State Machine recibe y blendea: `isSpeaking`, `mouthShape`, `isCorrect`, `isWrong`, `isThinking`. Corren simultáneamente capas de idle (respiración, parpadeo, micro-movimientos de ceja/cabeza), estados de habla y estados de reacción, con manejo de interrupción (si el usuario termina antes, la animación se corta a mitad). (https://blog.duolingo.com/world-character-visemes/, https://dev.to/uianimation/how-duolingo-uses-rive-for-their-character-animation-and-how-you-can-build-a-similar-rive-mascot-5d19)

El pipeline de lip-sync (texto→audio TTS→reconocimiento de fonemas→timing→visemas, con 20+ formas de boca por personaje) es específico de aprendizaje de idiomas y **no aplica a EVA**. Lo que sí aplica es el patrón State Machine: un asset vectorial ligero con inputs booleanos/numéricos que reacciona en tiempo real y comparte el mismo archivo entre plataformas. (https://blog.duolingo.com/world-character-visemes/)

Duolingo empezó Rive por lo simple: **animaciones de recompensa** (un cofre que se agita y gemas que saltan) antes de meterse con personajes. Ese es exactamente el punto de entrada recomendable para EVA. (https://rive.app/blog/creative-technologists-duolingo-s-solution-to-the-designer-to-developer-handoff)

### 3. El handoff: rol "creative technologist"

Duolingo creó una disciplina intermedia entre animadores e ingenieros. Jeff Masters, su primer creative technologist: antes los animadores entregaban un mockup con specs técnicas; ahora Rive deja que animadores y creative technologists **creen el asset real que se usa en la app**. Alex Chopjian (ACD): "En Rive la brecha entre diseño y producto terminado es mucho menor. Podés animar algo y verlo en el browser sin tocar código." (https://rive.app/blog/creative-technologists-duolingo-s-solution-to-the-designer-to-developer-handoff)

Implicación operativa para EVA: si se adopta Rive, el valor no es solo técnico sino de proceso: un asset editable por diseño reduce las rondas de QA de motion. Con equipo chico, esto puede replicarse con Lottie (ver §8) si Rive es demasiado.

### 4. Secuencia exacta de fin de lección

En la primera lección del día, la secuencia post-lección es: **XP ganado + una celebración pequeña** → al tocar Continuar aparece la **pantalla de incremento de racha con llama fullscreen y contador que sube** (ticker). (search: 60fps.design / androidauthority)

En una **lección perfecta (cero errores)**: Duo se desliza hacia arriba, su cabeza se expande, se pone roja y explota en un hongo estilizado con chispas, revelando un cerebro rosado. Debajo, **tres tarjetas de estadística entran hacia arriba con fade escalonado (stagger)**, con números que cuentan (tickers), física de spring y SFX juguetones. (https://60fps.design/shots/duolingo-lesson-complete-head-explode-animation)

Los ingredientes replicables de esta secuencia, sin la mascota: **stagger** (elementos entran en cascada, no todos juntos), **spring** (entrada con rebote físico), **ticker** (números que cuentan hacia arriba en vez de aparecer), y **capas separadas** (celebración → transición por tap → resumen de stats). EVA puede armar su resumen de sesión (volumen total, series, PRs, tiempo) con exactamente estos cuatro recursos.

### 5. Hitos vs. días normales: evitar fatiga de recompensa

Las **celebraciones fullscreen custom se reservan para hitos** (7, 30, 100, 365 días): fénix volando y prendiéndose fuego, búho en llamas, secuencias fullscreen. Los días no-hito usan feedback liviano. La diferenciación visual reservada para hitos **previene la fatiga de recompensa**. (https://duolingo.deconstructoroffun.com/mechanics/streaks)

Dato duro: rediseñar solo la animación del fénix movió la retención día-7 **+1.7%**. Y el streak se introduce en el onboarding, antes de crear cuenta, como algo fundacional, y aparece dentro del loop de fin de lección donde el usuario naturalmente lo ve. (https://duolingo.deconstructoroffun.com/mechanics/streaks)

Para EVA: no toda serie/ejercicio merece confeti fullscreen. Escala de intensidad: micro-feedback por serie → celebración media por ejercicio/bloque → celebración fullscreen por sesión completa o PR real. Los momentos "grandes" deben ser escasos para conservar su valor.

### 6. Timing y diseño de la energía celebratoria

El equipo de milestones cuenta que "el timing lo es todo en animación" y que hacen **múltiples pasadas de animación rough** para experimentar ritmo y variaciones de energía. El diseño original de globo se descartó por ser "lindo pero no lo suficientemente celebratorio a nivel de energía"; migraron al fénix por ser una imagen reconocible entre culturas. También agregaron una **tarjeta para compartir** el logro sin salir de la app. (https://blog.duolingo.com/streak-milestone-design-animation)

Lecciones: (a) la energía se calibra iterando el timing, no eligiendo un asset bonito; (b) los símbolos deben ser culturalmente universales (relevante para EVA en LatAm y white-label); (c) el share-card de logro es un gancho de crecimiento barato.

### 7. Micro-interacciones, sonido y háptica

**Feedback inmediato con causa-efecto**: el confeti/chime aparece inmediatamente después de la acción disparadora para que el usuario entienda la relación causa-efecto. (https://medium.com/@Bundu/little-touches-big-impact-the-micro-interactions-on-duolingo-d8377876f682)

**Barra de progreso viva (pulse bar)**: se intensifica con cada acierto y llega a "pico de intensidad" al completar la tarea, ajustando su pulsación según desempeño. (mismo)

**Roles de sonido semánticos**: acierto = chime/aplauso satisfactorio; error = "boing" juguetón; hito = SFX celebratorio; tocar la mascota = chirridos con personalidad. Siempre pareado con **señales visuales claras junto al sonido** para accesibilidad (usuarios con distinta audición). Restricción explícita: feedback "notable pero manejable" que realza sin robar protagonismo a la función central. (mismo)

**Háptica (guía iOS)**: `UINotificationFeedbackGenerator` da tres tipos (success, warning, error) para comunicar resultados; para celebración se puede combinar un success con un impact adicional retardado (efecto "doble tap"). Regla de diseño: reservar háptica para eventos con significado, hacer coincidir el patrón del sistema con el evento (success/error/warning para resultados, tick de selección ligero para cambios de valor), usarla con moderación y **nunca como único canal** porque el usuario puede desactivarla. (https://vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios, https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator)

Mapa directo para el ejecutor EVA: serie completada = impact medio + tick; descanso terminado = notification success + sonido; PR = success + impact retardado + celebración visual; error de input = warning suave.

### 8. Design system: "juicy buttons", color, tipografía, formas

**Botón 3D / juicy**: el detalle de firma es un botón con **sombra sólida inferior** que lo hace táctil y pulsable, en contraste con la UI plana. Al presionar, el botón "baja" hacia la sombra. Superficies físicamente sustanciales: sombras gruesas en elementos interactivos, bordes marcados en tarjetas y botones. (https://explainx.ai/designs/whyashthakker-design-md-templates-skills/duolingo/design-md)

Nota: distintas fuentes describen el sistema como plano-con-bordes-gruesos (2px) más que con sombra 3D; en la práctica coexisten el borde grueso "sticker" y la sombra inferior dura en el CTA principal. Radio de esquina uniforme (~12px), base de espaciado 4px (8/12/16/24/32/48), sin gradientes ni glass. (https://styles.refero.design/style/7088d695-362b-4e09-b325-fa8136d4f350)

**Color**: núcleo sobre Duo Green (#58CC02) para acciones primarias, blanco de superficie, y acentos vibrantes: amarillo #FFC800, rojo #FF4B4B, azul #1CB0F6. En EVA esto se **parametriza por marca del coach** (white-label): el verde se reemplaza por `--theme-primary` del coach; la estructura (CTA saturado + acentos + superficie blanca/oscura) se mantiene.

**Tipografía**: Feather Bold, display redondeada custom para titulares "que gritan"; lee como fun y ligeramente educativo, "libro infantil que creció". Cuerpo en sans redondeada. (https://styles.refero.design/style/7088d695-362b-4e09-b325-fa8136d4f350)

**Formas**: el lenguaje ilustrativo usa tres formas fundamentales — rectángulo redondeado, círculo y triángulo redondeado. La personalidad emerge de formas + color, no obliga a una mascota. (https://medium.com/gdg-vit/decoding-duolingo-how-technology-design-can-shape-learning-journeys-8a37f48138fc)

### 9. Críticas: qué evitar (ruido, dark patterns, fatiga)

Duolingo aparece en **deceptive.design** por recordatorios excesivamente pushy, anuncios disfrazados de pantallas de fin de lección, y presión de monetización del sistema de energía/vidas. Las notificaciones se perciben como frecuentes y molestas, e incluso como guilt-tripping/shaming a quien no cumple. (search: uxdesign.cc, medium critiques, papers.ssrn.com)

Ciertas mecánicas generan ansiedad, presión y frustración: el **sistema de vidas hace que el aprendizaje se sienta truncado**, y la **competencia de ligas distrae del objetivo principal**. En contexto de aprendizaje, estos patrones pueden distorsionar la relación del usuario con el objetivo real: interactuar para evitar penalidad, no por motivación interna; hay quien lo compara con adicción. (https://uxdesign.cc/the-good-the-bad-and-the-ugly-of-duolingo-gamification-3a12f0e80dc7 [vía redirect Medium], https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6846283)

Traducción a reglas de guardarraíl para EVA: (a) el motion nunca debe **retrasar** al alumno entre series (skippable, corto, o solo en momentos naturales de pausa como el descanso); (b) nada de penalizar/culpar por sesiones perdidas — el público está entrenando, no jugando; (c) cero "vidas" o mecánicas que bloqueen la ejecución; (d) celebración fullscreen solo en momentos escasos y merecidos; (e) haptics/sonido con opción de apagar y nunca como único canal.

## Aplicabilidad a EVA

### RN nativo (la experiencia debe ser la mejor)

- **Máquina de estados de motion del ejecutor**: definir estados explícitos (serie activa, serie ok, descanso corriendo, descanso por vencer, ejercicio terminado, bloque terminado, sesión terminada, PR) cada uno con su respuesta visual + sonido + háptica. Es el principio §1 llevado a código.
- **Motor de reacción tipo Rive/Lottie ligero**: para las celebraciones y micro-reacciones, un asset vectorial con inputs (para Rive: State Machine con `isPR`, `intensity`; para Lottie: JSON < 300KB reproducido por props). Empezar por recompensas (cofre/estrella/anillo que se llena), no por personaje, igual que Duolingo empezó por el cofre.
- **Interstitial fullscreen entre ejercicios** (idea del CEO): usar el patrón de fin de lección — entra con spring, stat de lo recién hecho con ticker, SFX corto, **skippable** y con auto-dismiss para no frenar. Reservar el fullscreen "grande" (§5) para fin de sesión y PR.
- **Cronómetro de descanso nativo**: notificación local + `UINotificationFeedbackGenerator` success al terminar (§7). Countdown con la barra viva (§7 pulse bar) que se intensifica al acercarse a cero. Live Activity / Dynamic Island en iOS como extensión nativa aspiracional.
- **Háptica por evento** (§7): impact medio al confirmar serie, tick de selección al ajustar kg/reps en el teclado numérico, success al cerrar descanso, success+impact retardado en PR.
- **Botón juicy** (§8): CTA principal (Registrar serie / Siguiente) con sombra inferior dura y micro-desplazamiento al presionar; ejecuta el "táctil pulsable" sin depender de marca. Botones grandes para pulgar entre series.
- **Cardio/movilidad/roller** heredan la máquina de estados con reacciones propias: cardio = barra/anillo de progreso vivo hacia meta (tiempo/distancia) con celebración al 100%; movilidad = ticker de hold por lado con háptica de cambio de lado; roller = contador de pasadas con tick por pasada.

### PWA responsive (hereda diseño y todo lo funcionalmente posible)

- **Design system idéntico** (§8): mismos tokens de color parametrizados por coach, Feather-equivalente redondeada, botón con sombra dura, radios 12px, base 4px. Ya vive en tokens compartidos.
- **Celebraciones en web**: usar librerías del ecosistema — `react-rewards` (hook `useReward`, burst efímero anclado a elemento, ideal para cada serie/día) para momentos chicos, y `react-confetti` (fullscreen sostenido) para hitos. Lottie-web para las secuencias vectoriales. (https://commt.co/blog/gamification-in-react-native, https://trophy.so/blog/gamification-ui-libraries)
- **Háptica limitada**: `navigator.vibrate` donde exista (Android/Chrome); iOS Safari no lo soporta, así que la señal visual + sonido debe bastar (regla §7: nunca único canal).
- **Ticker, stagger, spring**: replicables con CSS/Web Animations o Framer-Motion-equivalente; el resumen de sesión web usa el mismo patrón de tarjetas escalonadas con números que cuentan.
- **Degradación honesta**: lo que no exista en web (Live Activity, Taptic fino, Apple Watch BPM) se omite sin romper; la PWA nunca debe fingir capacidades nativas.

### Compartido en packages

- **packages/workout-engine**: extender el motor puro para emitir **eventos de estado semánticos** (serie_ok, bloque_completado, sesion_completada, record_detectado, descanso_terminado) que ambas UIs consumen. La detección de PR (comparar contra histórico) vive acá, no en la UI — es el disparador de la celebración grande.
- **Tabla de mapeo evento→feedback** compartida (tokens): cada evento define intensidad (micro/media/fullscreen), sonido, y patrón háptico. RN y web leen la misma tabla; cada plataforma implementa el canal que puede. Así la "vibra" es consistente y no se duplica lógica (regla del repo).
- **Escala de intensidad y guardarraíles** (§5, §9) como constantes compartidas: qué eventos permiten fullscreen, cuáles son skippable, cooldowns para no repetir la misma celebración seguido (anti-fatiga).
- **Tokens de marca** (white-label): el sistema de color/forma se parametriza una vez; ninguna celebración depende de una mascota fija. Si a futuro se quiere una mascota liviana opcional, entra como asset Rive/Lottie intercambiable por coach, no como dependencia dura.

## Fuentes

- [Duolingo-Style Animation in Mobile Apps 2026 (uianimation, Medium)](https://uianimation.medium.com/duolingo-style-animation-in-mobile-apps-2026-how-it-works-and-what-a-rive-animator-brings-to-53f21ab79cbc)
- [Creative Technologists: Duolingo's solution to the designer-to-developer handoff (Rive)](https://rive.app/blog/creative-technologists-duolingo-s-solution-to-the-designer-to-developer-handoff)
- [How Duolingo Animates Its World Characters (blog.duolingo.com)](https://blog.duolingo.com/world-character-visemes/)
- [How Duolingo Uses Rive for Character Animation — build a similar mascot system (DEV Community)](https://dev.to/uianimation/how-duolingo-uses-rive-for-their-character-animation-and-how-you-can-build-a-similar-rive-mascot-5d19)
- [Duolingo Streaks: How the Mechanic Drives 2x Daily Retention (Deconstructor of Fun)](https://duolingo.deconstructoroffun.com/mechanics/streaks)
- [Streak milestone design & animation (blog.duolingo.com)](https://blog.duolingo.com/streak-milestone-design-animation)
- [Duolingo Lesson Complete Head Explode Animation (60fps.design)](https://60fps.design/shots/duolingo-lesson-complete-head-explode-animation)
- [Little touches, big impact: the micro-interactions on Duolingo (Bundu, Medium)](https://medium.com/@Bundu/little-touches-big-impact-the-micro-interactions-on-duolingo-d8377876f682)
- [Duolingo design system — Refero Styles](https://styles.refero.design/style/7088d695-362b-4e09-b325-fa8136d4f350)
- [Duolingo — DESIGN.md (explainx.ai)](https://explainx.ai/designs/whyashthakker-design-md-templates-skills/duolingo/design-md)
- [Decoding Duolingo: How Technology & Design Shape Learning Journeys (GDG VIT, Medium)](https://medium.com/gdg-vit/decoding-duolingo-how-technology-design-can-shape-learning-journeys-8a37f48138fc)
- [Haptic Feedback UI Guidelines for iOS (VP0 Journal)](https://vp0.com/blogs/haptic-feedback-ui-design-guidelines-ios)
- [UINotificationFeedbackGenerator (Apple Developer)](https://developer.apple.com/documentation/uikit/uinotificationfeedbackgenerator)
- [The good, the bad and the ugly of Duolingo gamification (UX Collective)](https://uxdesign.cc/the-good-the-bad-and-the-ugly-of-duolingo-gamification-3a12f0e80dc7)
- [A Critical Analysis of Duolingo (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6846283)
- [Gamification in React Native (commt.co)](https://commt.co/blog/gamification-in-react-native)
- [The Best Gamification UI Libraries 2026 (Trophy)](https://trophy.so/blog/gamification-ui-libraries)
