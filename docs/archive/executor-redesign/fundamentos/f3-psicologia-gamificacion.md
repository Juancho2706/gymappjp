# Psicologia y gamificacion aplicada al ejecutor de entrenamiento de EVA

Fundamento f3 para el rediseno del ejecutor (RN ExecutorV2 + PWA WorkoutExecutionClient). Este documento sintetiza evidencia academica y de diseno sobre motivacion, gamificacion, celebracion y sus riesgos, y la traduce en principios accionables para una app de entrenamiento **con coach humano real**, white-label, usada por alumnos con el telefono en la mano entre series.

## Resumen ejecutivo

- La Teoria de la Autodeterminacion (SDT) es el marco base: la motivacion sostenida en ejercicio depende de satisfacer tres necesidades psicologicas (autonomia, competencia, relacion). La motivacion autonoma predice la adherencia de largo plazo mucho mejor que la controlada (culpa, presion). ([SDT y ejercicio, PMC3441783](https://pmc.ncbi.nlm.nih.gov/articles/PMC3441783/))
- **Competencia es el predictor mas fuerte de la conducta de ejercicio** (92% de estudios correlacionales positivos). El ejecutor debe hacer *sentir progreso y dominio* en cada serie, no solo registrar datos. ([PMC3441783](https://pmc.ncbi.nlm.nih.gov/articles/PMC3441783/))
- En apps mHealth, autonomia (β=.312), competencia (β=.346) y relacion (β=.165) inducidas por gamificacion predicen la motivacion intrinseca, que a su vez predice la intencion de continuar usando la app. Sin esas tres necesidades, la gamificacion pierde efecto. ([PMC8391751](https://pmc.ncbi.nlm.nih.gov/articles/PMC8391751/))
- La celebracion tipo Duolingo funciona por refuerzo positivo inmediato: feedback en menos de ~2 segundos ata el "hit" de dopamina al esfuerzo y aumenta el engagement. La confeti/haptica/sonido son "juicy feedback" de bajo costo y alto retorno. ([Appfoster / dopamine loop](https://medium.com/appfoster/mastering-user-motivation-how-gamification-and-behavioral-psychology-enhance-mobile-app-design-68b49282141b))
- El efecto goal-gradient (Kivetz 2006): la motivacion sube al acercarse a la meta. Enmarcar el progreso como "te faltan 2 series" en vez de "llevas 2 de 8" acelera la conducta. ([Columbia Business School](https://business.columbia.edu/insights/chazen-global-insights/goal-gradient-hypothesis-resurrected))
- El endowed progress effect: mostrar progreso inicial (no arrancar en cero) motiva a completar. Aplica al arranque de la sesion y a cada ejercicio.
- Octalysis (Yu-kai Chou): disenar con drives "White Hat" (proposito, dominio, creatividad, propiedad) que dejan al usuario empoderado, y usar drives "Black Hat" (escasez, perdida, presion) con extrema moderacion porque "dejan mal sabor" y no son sostenibles. ([Octalysis](https://yukaichou.com/gamification-examples/octalysis-gamification-framework/))
- Las recompensas variables (Skinner / modelo Hooked) enganchan, pero perseguir la incertidumbre en lugar de la satisfaccion es exactamente el mecanismo de las tragamonedas: usar con cautela y nunca sobre la conducta central de entrenar bien. ([Variable reward, Bootcamp](https://medium.com/design-bootcamp/variable-ratio-reinforcement-beyond-the-skinner-box-191d3e86d86f))
- Riesgo del efecto de sobrejustificacion: premiar externamente algo que ya se disfruta puede reducir la motivacion intrinseca (Deci 1971). El ejercicio con coach ya tiene valor; la gamificacion debe amplificarlo, no sustituirlo. ([The Brink](https://www.thebrink.me/gamified-life-dark-psychology-app-addiction/))
- Las rachas (streaks) funcionan por aversion a la perdida, pero sin redes de seguridad (freezes, dias de gracia, metas semanales) generan ansiedad, sesiones huecas y abandono. Duolingo tuvo que agregar streak freezes justamente por esto. ([Just Another PM](https://www.justanotherpm.com/blog/the-psychology-behind-duolingos-streak-feature))
- Ley de Goodhart: cuando la metrica se vuelve el objetivo, deja de medir bien. Premiar XP por lecciones facilita el "grind" de lo facil. En entrenamiento: nunca premiar el numero por sobre la calidad de la ejecucion. ([NerdSip](https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point))
- Fatiga de gamificacion y efecto novedad: badges/leaderboards pierden efecto al desaparecer la novedad; los leaderboards desmotivan a ~90% de usuarios. Anclar cada mecanica a una conducta con valor real y capear elementos competitivos. ([Gamification fatigue](https://blog.brandmovers.com/gamification-in-loyalty-programs-beyond-points-and-badges))
- Flow (Csikszentmihalyi): el estado optimo requiere balance reto-habilidad. La app debe evitar sobrecargar (ansiedad) o subutilizar (aburrimiento); la progresion de cargas y el feedback claro sostienen el flow. ([Positive Psychology](https://positivepsychology.com/mihaly-csikszentmihalyi-father-of-flow/))
- Usuario avanzado: la celebracion no debe estorbar a quien solo quiere anotar rapido. Segmentar por experiencia, permitir saltar animaciones, y dar metas de horizonte largo a los veteranos. ([Digia](https://www.digia.tech/post/gamification-mobile-apps-streaks-rewards-retention/))
- Test etico simple: usuario en control real, la mecanica construye (no socava) motivacion intrinseca, y sirve al objetivo del alumno antes que a la metrica de la app. ([UX Magazine](https://uxmag.medium.com/gamification-or-manipulation-understanding-the-ethics-of-engagement-loops-920f2fa2b0eb))

## Hallazgos

### 1. Self-Determination Theory: el motor real de la adherencia al ejercicio

La revision sistematica de SDT en actividad fisica (66 estudios) concluye que las formas **autonomas** de motivacion (identificada e intrinseca) predicen la conducta de ejercicio, mientras que las formas **controladas** (introyectada: culpa, presion) muestran efectos nulos o negativos. Ademas hay un matiz temporal clave: la regulacion identificada ("hago ejercicio porque valoro estar sano") predice mejor la **adopcion inicial**, y la motivacion intrinseca ("disfruto entrenar") predice mejor la **adherencia de largo plazo** ([PMC3441783](https://pmc.ncbi.nlm.nih.gov/articles/PMC3441783/)).

De las tres necesidades, **competencia es el predictor mas robusto** (92% de estudios correlacionales positivos); autonomia da resultados mixtos y relacion muestra asociacion inconsistente con la conducta directa de ejercicio en analisis multivariados ([PMC3441783](https://pmc.ncbi.nlm.nih.gov/articles/PMC3441783/)). Implicacion para EVA: el ejecutor debe, ante todo, **hacer sentir competencia** (progreso visible, dominio de la tecnica, superacion de marcas) y **respetar autonomia** (opciones, control del ritmo). La relacion se cubre con el vinculo real con el coach, no con features sociales artificiales.

En apps de salud especificamente, el estudio de continuidad mHealth con modelo de ecuaciones estructurales muestra que la gamificacion satisface las tres necesidades y estas predicen la motivacion intrinseca (autonomia β=.312; competencia β=.346; relacion β=.165, todos significativos), la cual impulsa la intencion de continuar de forma directa y mediada por la satisfaccion (que media el 46.6% del efecto). La conclusion textual: sin experimentar estas necesidades, "la gamificacion pierde efectividad" ([PMC8391751](https://pmc.ncbi.nlm.nih.gov/articles/PMC8391751/)).

### 2. Celebracion, refuerzo positivo y por que la "vibra Duolingo" retiene

El refuerzo positivo funciona cuando el feedback es **inmediato** y **atado al esfuerzo**. Reportes de diseno indican que apps con feedback dentro de ~2 segundos de la accion ven engagement notablemente mayor que las que agrupan notificaciones, porque el "hit" de dopamina se ancla al esfuerzo recien hecho; confeti, haptica y sonido son "juicy feedback" barato que visualiza la victoria del usuario ([Appfoster](https://medium.com/appfoster/mastering-user-motivation-how-gamification-and-behavioral-psychology-enhance-mobile-app-design-68b49282141b)). El principio operativo: el usuario nunca debe adivinar si tuvo exito; el loop debe ser instantaneo.

Duolingo desplazo su foco de recompensas externas a la motivacion intrinseca celebrando "pequenas victorias" y progreso visual para dar sensacion de competencia; sus mensajes de bienvenida calidos mejoran la retencion de corto y medio plazo ([StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)). La leccion no es copiar la mascota (EVA es white-label y no puede depender de un personaje unico de marca) sino replicar el **patron**: micro-celebracion por serie completada, celebracion mayor al cerrar el ejercicio, y una pantalla de cierre de sesion que reconoce el logro del dia. La arquitectura mas efectiva combina **recompensa instantanea** (refuerzo de la accion) con **acumulacion diferida** (razon para volver la proxima sesion) ([StriveCloud, 10 ways](https://www.strivecloud.io/blog/10-ways-to-drive-engagement)).

### 3. Goal-gradient y endowed progress: como enmarcar el avance

Kivetz, Urminsky y Zheng (2006) resucitaron la hipotesis del goal-gradient: la motivacion para alcanzar una meta **aumenta al acercarse**. En el experimento del cafe "compra 10, uno gratis", los clientes compraban con mas frecuencia mientras se acercaban al premio; los usuarios que calificaban canciones aceleraban cerca del umbral ([Columbia](https://business.columbia.edu/insights/chazen-global-insights/goal-gradient-hypothesis-resurrected)). Complementariamente, el **endowed progress effect** muestra que dar avance inicial (aunque sea arbitrario) hace percibir la meta como parcialmente completa y dispara aceleracion temprana.

Aplicacion directa (efecto Zeigarnik incluido): enmarcar el progreso como **distancia a la meta** ("te faltan 2 series", "1 ejercicio para terminar") motiva mas que la distancia desde el inicio ([Digia](https://www.digia.tech/post/gamification-mobile-apps-streaks-rewards-retention/)). En el ejecutor: barra de progreso de sesion que nunca arranca visualmente en cero absoluto, contadores decrecientes de series/ejercicios restantes, y una recta final marcada ("ultimo ejercicio").

### 4. Octalysis y modelo Hooked: que drives usar y cuales moderar

Octalysis clasifica 8 core drives y los separa en **White Hat** (Epic Meaning, Development/Accomplishment, Empowerment/Creativity, Ownership) que dejan al usuario empoderado, y **Black Hat** (Scarcity, Unpredictability, Loss/Avoidance, Social Pressure) que generan urgencia y ansiedad y "dejan mal sabor" pese a ser potentes ([Octalysis](https://yukaichou.com/gamification-examples/octalysis-gamification-framework/)). Tambien separa drives extrinsecos (cerebro izquierdo) de intrinsecos (cerebro derecho): cuando la recompensa externa desaparece, la motivacion suele caer por debajo del punto inicial, por eso el diseno sostenible debe apoyarse en drives intrinsecos.

El modelo Hooked (Eyal) describe el loop trigger -> accion -> recompensa variable -> inversion. Es util para el habito de entrenar (el gatillo interno es "es mi hora de entrenar"; la inversion son los datos de kg/reps que personalizan la experiencia), pero el propio Yu-kai Chou advierte que mal aplicado crea adiccion, no habito saludable ([Hook Model vs Octalysis](https://yukaichou.com/gamification-analysis/hook-model-octalysis-habit-addiction/)). Para EVA: usar la **inversion** (historial de marcas, progresion visible) como el gancho legitimo, y evitar recompensas variables sobre la conducta central.

### 5. Recompensas variables y sus riesgos

Las recompensas de razon variable producen conducta mas persistente porque no se puede predecir cuando llega el premio; es el mecanismo de las tragamonedas y de las notificaciones sociales ([Bootcamp](https://medium.com/design-bootcamp/variable-ratio-reinforcement-beyond-the-skinner-box-191d3e86d86f)). El riesgo: "el cerebro aprende a perseguir la incertidumbre en vez de la satisfaccion", y se puede seguir interactuando aun cuando la recompensa pierde valor. En una app de entrenamiento con coach real, esto seria un dark pattern: **nunca** hacer variable la recompensa de completar bien una serie. La variabilidad, si se usa, debe ser cosmetica y de bajo impacto (por ejemplo, variar el mensaje de aliento del interstitial), no una maquina de azar.

### 6. Riesgos: dark patterns, rachas que queman, sobrejustificacion y fatiga

- **Rachas / loss aversion:** el dolor de perder una racha es mas fuerte que el placer de ganarla, y los disenadores lo explotan para forzar uso diario "a costa del bienestar" ([Medium, dark side](https://medium.com/@jgruver/the-dark-side-of-gamification-ethical-challenges-in-ux-ui-design-576965010dba)). Duolingo tuvo que introducir **streak freezes** porque los usuarios abrian la app "no para aprender sino para no perder la racha", generando sesiones huecas ([Just Another PM](https://www.justanotherpm.com/blog/the-psychology-behind-duolingos-streak-feature)). En fitness esto es especialmente peligroso: una racha diaria puede empujar a entrenar enfermo o lesionado. La descarga y los dias de descanso son parte del plan del coach, asi que la mecanica de consistencia debe ser **semanal** (adherencia al plan) y no diaria, con dias de gracia.
- **Sobrejustificacion:** premiar externamente algo que ya se disfruta reduce la motivacion intrinseca (experimento Deci 1971); al retirar el premio el interes cae bajo la linea base ([The Brink](https://www.thebrink.me/gamified-life-dark-psychology-app-addiction/); [NerdSip](https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point)).
- **Ley de Goodhart:** cuando la metrica es el objetivo deja de medir bien; premiar XP incentiva grindear lo facil. Un estudio 2022 hallo que estudiantes en cursos gamificados a veces tuvieron **menor motivacion y peores notas** pese a mas actividad ([NerdSip](https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point)).
- **Fatiga de gamificacion / efecto novedad:** las mecanicas que dependen solo de novedad caen al habituarse; entre las causas de fracaso estan premiar conductas triviales, reglas complejas y **leaderboards que desmotivan a la mayoria** (~90% de usuarios) ([Brandmovers](https://blog.brandmovers.com/gamification-in-loyalty-programs-beyond-points-and-badges)).
- **Usuario avanzado vs. celebracion:** el alumno experto que solo quiere anotar rapido entre series se irrita con animaciones invasivas. La solucion: celebraciones skippables, animaciones cortas y no bloqueantes, metas de horizonte largo para veteranos y wins rapidos para novatos ([Digia](https://www.digia.tech/post/gamification-mobile-apps-streaks-rewards-retention/)).

El criterio etico rector (UX Magazine): gamificacion etica = usuario en control real + construye motivacion intrinseca + sirve al objetivo del usuario antes que a la metrica; manipulacion = esconde sus mecanismos y prioriza DAU/screen time ([UX Magazine](https://uxmag.medium.com/gamification-or-manipulation-understanding-the-ethics-of-engagement-loops-920f2fa2b0eb)).

### 7. Flow durante el entrenamiento

El flow requiere balance reto-habilidad: si el reto excede la habilidad hay ansiedad; si la subutiliza hay aburrimiento ([Positive Psychology](https://positivepsychology.com/mihaly-csikszentmihalyi-father-of-flow/)). En el ejecutor esto se traduce en: cargas y progresiones bien calibradas por el coach, feedback claro e inmediato por serie, y **minima friccion de interfaz** (multimedia al centro sin tocar botones, teclado numerico rapido, cronometro automatico) para no romper la inmersion del alumno entre series.

## Aplicabilidad a EVA

### RN nativo (ExecutorV2 — la mejor experiencia)

- **Competencia primero:** cada serie registrada dispara micro-feedback inmediato (haptica + micro-animacion < 400ms). Al cerrar un ejercicio, celebracion mayor con progreso vs. sesion anterior ("+2.5 kg en press"). Usar `expo-haptics` y animaciones nativas (Reanimated) para que se sienta fluido.
- **Interstitials fullscreen entre ejercicios** (idea CEO) alineados con goal-gradient: mostrar "faltan 3 ejercicios", animar al alumno, y variar solo el mensaje de aliento (variabilidad cosmetica, no recompensa de azar). Deben ser **skippables** con un tap para el usuario avanzado.
- **Cronometro de descanso nativo:** usar capacidades del SO (notificaciones locales programadas, Live Activities / Dynamic Island en iOS, haptica al terminar) para que el alumno pueda bloquear el telefono y aun asi recibir el aviso. Esto respeta el flow y la autonomia.
- **Rachas seguras:** consistencia **semanal** de adherencia al plan (no diaria), con dias de gracia y respeto a los dias de descanso planificados por el coach. Nunca notificaciones de culpa.
- **Celebracion de cierre de sesion** tipo Duolingo: resumen de logros del dia, marcas superadas, progreso hacia la meta del mesociclo. Reconoce competencia sin depender de mascota (EVA es white-label: usar los colores/marca del coach).
- **Segmentacion por experiencia:** novato recibe mas celebracion y wins tempranos; avanzado recibe metas de horizonte largo y animaciones reducidas por defecto (ajuste en preferencias).
- **Experiencias por tipo de ejercicio** (competencia + flow): cardio con progreso animado hacia la meta (goal-gradient visual de tiempo/distancia) y BPM de Apple Watch; movilidad con holds por lado y transicion clara izquierda/derecha; roller contando pasadas con multimedia visible. Cada una refuerza dominio especifico sin RIR/RPE donde no aplica.

### PWA responsive (WorkoutExecutionClient — hereda todo lo posible)

- Heredar el **mismo lenguaje visual y de feedback**: micro-celebraciones, barras de progreso enmarcadas como "distancia a la meta", interstitials skippables. Confeti/animaciones via CSS/Web Animations API.
- Feedback inmediato (< ~2s) tambien en web; haptica limitada (Vibration API donde exista), compensar con animacion y sonido opcional.
- Cronometro de descanso: usar Notifications API + Service Worker para avisos con pantalla bloqueada; degradar con gracia donde iOS Safari limite (fallback a timer visible). Documentar el gap de paridad, no fingirlo.
- Sin acceso a Apple Watch nativo: el cardio en PWA muestra progreso y tiempo/distancia manual o de sensores web disponibles; BPM queda como feature exclusiva RN. Declarar la diferencia funcional honestamente.

### Compartido en packages (workout-engine y contratos)

- El **estado motivacional es logica pura**: colocar en `packages/workout-engine` el calculo de progreso de sesion (series/ejercicios restantes, % completado con endowed-progress no arrancando en cero), deteccion de marcas superadas (PRs), y elegibilidad de celebracion (que evento merece micro/mayor celebracion). RN y PWA solo renderizan.
- Definir un **contrato de "eventos de celebracion"** tipado (serie completada, ejercicio cerrado, PR logrado, sesion terminada, meta semanal cumplida) que ambos clientes consumen; asi la "vibra" es consistente y testeable.
- **Reglas de racha/adherencia semanal** y dias de gracia como funciones puras compartidas, evitando duplicar logica y garantizando que ninguna plataforma implemente un dark pattern por su cuenta.
- Mantener separada la capa de presentacion (animaciones, marca del coach white-label) de la capa de decision motivacional, para que el motor no dependa de assets de marca.

## Fuentes

- [Exercise, physical activity, and self-determination theory: A systematic review (PMC3441783)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3441783/)
- [The Impact of Gamification-Induced Users' Feelings on the Continued Use of mHealth Apps: SEM with SDT (PMC8391751)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8391751/)
- [The Psychology Behind Duolingo's Streak Feature — Just Another PM](https://www.justanotherpm.com/blog/the-psychology-behind-duolingos-streak-feature)
- [Gamification or Manipulation? Understanding the Ethics of Engagement Loops — UX Magazine](https://uxmag.medium.com/gamification-or-manipulation-understanding-the-ethics-of-engagement-loops-920f2fa2b0eb)
- [The Octalysis Framework: 8 Core Drives of Gamification — Yu-kai Chou](https://yukaichou.com/gamification-examples/octalysis-gamification-framework/)
- [Hook Model vs Octalysis: habit vs addiction — Yu-kai Chou](https://yukaichou.com/gamification-analysis/hook-model-octalysis-habit-addiction/)
- [Gamification Gone Wrong: When Streaks Become the Point — NerdSip](https://nerdsip.com/blog/gamification-gone-wrong-when-streaks-become-the-point)
- [Gamification in Mobile Apps: Streaks, Rewards & Retention — Digia](https://www.digia.tech/post/gamification-mobile-apps-streaks-rewards-retention/)
- [The Goal-Gradient Hypothesis Resurrected — Columbia Business School](https://business.columbia.edu/insights/chazen-global-insights/goal-gradient-hypothesis-resurrected)
- [Variable Ratio Reinforcement Beyond the Skinner Box — Bootcamp/Medium](https://medium.com/design-bootcamp/variable-ratio-reinforcement-beyond-the-skinner-box-191d3e86d86f)
- [Mastering User Motivation: Gamification and Behavioral Psychology — Appfoster/Medium](https://medium.com/appfoster/mastering-user-motivation-how-gamification-and-behavioral-psychology-enhance-mobile-app-design-68b49282141b)
- [The Dark Psychology Behind Your Everyday Apps — The Brink](https://www.thebrink.me/gamified-life-dark-psychology-app-addiction/)
- [The Dark Side of Gamification: Ethical Challenges — Medium (J. Gruver)](https://medium.com/@jgruver/the-dark-side-of-gamification-ethical-challenges-in-ux-ui-design-576965010dba)
- [Gamification in Loyalty Programs: Beyond Points and Badges (fatigue/novelty) — Brandmovers](https://blog.brandmovers.com/gamification-in-loyalty-programs-beyond-points-and-badges)
- [Duolingo gamification explained — StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)
- [Mihaly Csikszentmihalyi: The Father of Flow — Positive Psychology](https://positivepsychology.com/mihaly-csikszentmihalyi-father-of-flow/)
- [Gamification enhances intrinsic motivation, autonomy and relatedness, minimal on competence: meta-analysis — Springer](https://link.springer.com/article/10.1007/s11423-023-10337-7)
