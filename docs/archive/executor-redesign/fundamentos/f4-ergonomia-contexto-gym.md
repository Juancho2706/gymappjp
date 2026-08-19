# F4 - Ergonomia e interaccion en contexto de gimnasio

Fundamento de investigacion para el rediseno del ejecutor de entrenamiento de EVA (ExecutorV2 en RN, WorkoutExecutionClient en web). El contexto de uso es unico: un alumno de gimnasio con el telefono en la mano entre series, mirandolo 5 a 10 segundos, con las manos sudadas o con guantes, la atencion fragmentada y con fatiga fisica. Este documento reune evidencia real de ergonomia, ley de Fitts, thumb zones, diseno glanceable, tipografia de numeros grandes, captura rapida y patrones anti-error, y la traduce a decisiones concretas para EVA.

## Resumen ejecutivo

- El minimo fisico defendible para un touch target no es 44 pt sino ~1 cm x 1 cm (0.4 in), porque la yema promedio mide 1.6-2 cm y el area de impacto del pulgar llega a 2.5 cm; el objeto tapado suele ser mas chico que el dedo que lo toca (NN/G, MIT Touch Lab).
- Los minimos de plataforma (iOS 44 pt, Android 48 dp Material, WCAG 2.5.5 AAA 44 px, WCAG 2.5.8 AA 24 px) son pisos de accesibilidad, no objetivos; apuntar a 48 px o mas cumple con todos los sistemas de diseno a la vez (LogRocket).
- La ley de Fitts sigue vigente en movil: objetivos mas grandes y mas cercanos se tocan mas rapido y con menos error; en gimnasio, con fatiga y sudor, conviene sobredimensionar los controles primarios (registrar serie, siguiente).
- El espaciado entre targets es un minimo separado del tamano: Material pide 8 dp entre objetivos y recomienda 16 pt+ para controles de uso frecuente; un boton de 48 dp pegado a otro sigue fallando en la practica.
- El 49% de las personas usa el telefono con una sola mano y el 75% de las interacciones moviles son con el pulgar (Hoober, 1.333 observaciones; Josh Clark); en gimnasio la otra mano suele estar ocupada (mancuerna, barra, apoyo), reforzando el diseno a una mano.
- El thumb zone divide la pantalla en verde (alcance comodo, abajo y centro), amarillo (estirar) y rojo (esquinas superiores): las acciones primarias del ejecutor deben vivir en la franja inferior verde, nunca arriba.
- El uso de trackers de actividad es 70%+ "glances" de ~5 segundos sin interaccion posterior; el ejecutor debe ser legible de un vistazo (< 2 s) porque el alumno lo mira brevemente entre series (investigacion de wearables).
- Durante movimiento de alta intensidad la comprension de datos en pantalla se degrada ~38% (2.61 s estatico vs 3.59 s corriendo); hay que simplificar jerarquia visual y reducir densidad cuando el cuerpo esta activo (Nature/PMC 2025).
- Graficos simples baten al texto y a los graficos complejos para lectura rapida: barras y donas se leen en < 300 ms, las barras radiales tardan ~1780 ms; preferir barras/donas para progreso de cardio, evitar medidores radiales barrocos.
- El modo oscuro superó al claro en satisfaccion y percepcion durante movimiento; los usuarios describieron el modo claro como un "efecto de temblor" al moverse: el ejecutor por defecto oscuro tiene respaldo empirico.
- La animacion gradual se ve linda pero cuesta cognitivamente: presentaciones sin animar dieron mejor rendimiento (2.69 s vs 3.71 s) aunque los usuarios prefieren las animadas; separar celebracion (animada, en descanso) de lectura de datos (estable, durante esfuerzo).
- Menos taps es directamente retencion: si registrar se siente pesado, los usuarios abandonan 40% mas; el logging debe caber en 3 pasos o menos y priorizar one-tap (Stormotion).
- Los steppers +/- ganan solo para rangos chicos (0 a ~10-20); para pesos y reps grandes conviene teclado numerico grande (inputmode numeric) o un patron hibrido tipo-o-toca (NN/G steppers).
- Para acciones reversibles y rutinarias, el undo (toast temporal) es mejor que el dialogo de confirmacion: no interrumpe el flujo; los dialogos se reservan solo para lo destructivo e irreversible (NN/G, UX Movement).
- La interaccion "eyes-free" con feedback auditivo/haptico permite ejecutar ejercicio sin mirar la pantalla y guiar holds por lado; el cronometro de descanso y los holds de movilidad deben cerrar el ciclo con sonido/vibracion, no solo visual (Eyes-Free Yoga; exertion HCI).
- La celebracion inmediata al terminar (recompensa acoplada a la accion, XP/animacion) y la aversion a la perdida (rachas) elevan la retencion de forma medible (Duolingo: rachas +48% de dias, logro dia 1 pasa retencion de 20% a 33%), pero deben vivir en momentos de reposo, no tapar la captura de datos.

## Hallazgos

### 1. Tamano de touch target: el minimo real es fisico, no de plataforma

La regla operativa mas solida no es "44 pt" sino el minimo fisico de ~1 cm x 1 cm (0.4 in x 0.4 in) para seleccion tactil rapida y precisa, derivado de la investigacion de Parhi, Karlson y Bederson y sintetizado por Nielsen Norman Group (https://www.nngroup.com/articles/touch-target-size/). La razon es anatomica: la yema promedio mide 1.6-2 cm y el area de impacto del pulgar llega a 2.5 cm segun el MIT Touch Lab, de modo que "la parte del dedo que toca es mas ancha que el objeto tocado". Los ejemplos de fallo documentados (botones de 2 mm en Instagram, swatches de 1 mm) requerian ~10 intentos para acertar.

Los numeros de plataforma son pisos de accesibilidad, no metas de diseno: iOS 44 pt (~7 mm, ~59 px), Android/Material 48 dp, WCAG 2.5.5 (AAA) 44 px CSS, WCAG 2.5.8 (AA) 24 px, Fluent 40 epx, visionOS 60 pt (https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/). El consejo pragmatico de LogRocket es apuntar a 48 px minimo porque "cumple con todos los sistemas de diseno a la vez". Para el ejecutor de EVA, donde el alumno tiene fatiga, sudor y guantes, los controles primarios (registrar serie, siguiente ejercicio) deben superar holgadamente ese piso: 56-64 px o mas.

### 2. Ley de Fitts en gimnasio: sobredimensionar lo primario, alejar lo destructivo

La ley de Fitts sostiene que el tiempo para alcanzar un objetivo depende de la distancia y el tamano; objetivos mas chicos exigen mas precision y tardan mas (https://www.nngroup.com/articles/touch-target-size/). En movil el nucleo se mantiene ("mas grande y mas cerca = mas rapido"), aunque los habitos de escritorio se invierten cuando el dedo reemplaza al cursor. En contexto de esfuerzo fisico la precision motora fina cae, asi que la palanca de Fitts (agrandar el objetivo, acercarlo al pulgar) es la mas rentable: el boton de accion mas frecuente debe ser el mas grande y estar en la zona de descanso natural del pulgar. El corolario anti-error, tambien de Fitts, es alejar y achicar lo peligroso: eliminar/descartar debe estar lejos del flujo primario para no tocarlo por accidente.

### 3. Espaciado: minimo independiente del tamano

Agrandar targets no basta si estan pegados. Material Design define 8 dp entre objetivos como minimo separado, y recomienda 16 pt+ para controles de uso frecuente; un target de 48 dp con cero separacion sigue fallando en la practica (resultados de busqueda NN/G y Material citados en https://www.nngroup.com/articles/touch-target-size/). NN/G lo formula asi: "los objetivos primero tienen que ser suficientemente grandes" antes de que el espaciado ayude. Para EVA esto significa: entre el boton de registrar serie y cualquier control secundario (editar, deshacer, saltar) debe haber colchon generoso, especialmente porque una mano sudada tiende a resbalar.

### 4. Uso a una mano y thumb zones: primario abajo, nunca arriba

El estudio de campo de Steven Hoober (1.333 observaciones en la calle, aeropuertos, cafes y transporte, nov 2012-ene 2013) encontro que 49% sostiene el telefono con una mano, 36% lo acuna usando el dedo de la otra mano y 15% usa ambas; de 780 usuarios interactuando, el 75% de las interacciones son con el pulgar (https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/). El mapa de thumb zone divide la pantalla en verde (alcance comodo sin tension, tipicamente la franja inferior y central), amarillo (requiere estirar) y rojo (esquinas superiores, casi imposibles sin recolocar la mano). En gimnasio la restriccion es aun mas fuerte: la otra mano suele estar ocupada con mancuerna, barra o apoyo, asi que el diseno debe asumir uso a una mano por defecto. Implicacion directa: registrar serie, avanzar y descansar viven en la franja inferior verde; los cierres (X) y acciones raras no deben ocupar la esquina superior donde obligan a recolocar el agarre. El area minima de swipe para no disparar vecinos accidentales es ~45 px.

### 5. Diseno glanceable: legible en menos de 2 segundos

La investigacion de wearables muestra que 70%+ del uso de trackers de actividad son "glances" (vistazos de ~5 segundos sin interaccion posterior) donde la persona chequea su nivel de actividad en curso. La lectura glanceable ocurre en periodos extremadamente cortos, a menudo < 1 segundo, y en promedio se leen ~4 palabras por segundo (resultados de investigacion de smartwatches). El ejecutor de EVA hereda esta condicion: el alumno mira el telefono 5-10 s entre series, no lo estudia. La informacion critica de la serie actual (que ejercicio, cuantas reps toca, peso objetivo, cuanto queda de descanso) debe leerse de un vistazo, con jerarquia visual brutal: un solo dato dominante por pantalla y todo lo demas subordinado.

### 6. Movimiento degrada la comprension: simplificar cuando el cuerpo esta activo

Un estudio 2025 de visualizacion de informacion de salud en smartwatch bajo distintos escenarios de movimiento (estatico, caminata de baja intensidad, carrera de alta intensidad) midio tiempos de comprension de 2.61 s estatico, 2.51 s baja intensidad y 3.59 s alta intensidad: una degradacion de ~38% en alta intensidad frente a reposo (https://pmc.ncbi.nlm.nih.gov/articles/PMC12284058/). Traduccion para EVA: la fase de esfuerzo (mientras el alumno se mueve o esta agitado) exige menos densidad de datos y elementos mas grandes que la fase de descanso, donde puede tolerar mas detalle. El ejecutor puede modular su UI por fase: minimalista durante la serie, mas informativo durante el rest.

### 7. Graficos simples ganan: barras y donas para progreso de cardio

El mismo cuerpo de investigacion comparo tipos de grafico en smartwatch: las tareas se resolvieron en ~300 ms con barras, ~220 ms con donas y ~1780 ms con barras radiales; barras y donas se deben preferir cuando se requieren comparaciones rapidas (resultados de investigacion de smartwatches; https://pmc.ncbi.nlm.nih.gov/articles/PMC12284058/). Los graficos explotan la "superioridad visual" frente al texto plano, clave cuando la atencion se reparte entre el dispositivo y el entorno. Para el progreso animado de cardio de EVA (cuanto falta en tiempo/distancia), esto recomienda una barra de progreso o un anillo/dona simple, no un medidor radial recargado. El BPM del Apple Watch se muestra como numero grande dominante mas un indicador de zona por color, no como grafico complejo.

### 8. Modo oscuro y animacion: separar celebracion de lectura

En movimiento, el modo oscuro supero consistentemente al claro en facilidad percibida y satisfaccion; los usuarios describieron el modo claro como un "efecto de temblor" al moverse (https://pmc.ncbi.nlm.nih.gov/articles/PMC12284058/). El ejecutor por defecto oscuro tiene asi respaldo empirico, ademas de encajar con el uso en gimnasios de luz variable. Sobre animacion, el hallazgo es matizado: las presentaciones sin animar dieron mejor rendimiento cognitivo (2.69 s vs 3.71 s con animacion gradual) aunque los usuarios prefirieron subjetivamente las animadas. Conclusion de diseno: la vibra animada (celebraciones, interstitials) debe vivir en momentos de reposo entre ejercicios, no encima de los datos que el alumno necesita leer para ejecutar la serie. Datos estables durante el esfuerzo; espectaculo durante el descanso.

### 9. Menos taps = menos abandono: captura rapida y one-tap

La friccion de logging es directamente un problema de retencion: si registrar se siente pesado, los usuarios abandonan 40% mas, y el tracking deberia limitarse a 3 pasos como maximo (https://stormotion.io/blog/fitness-app-ux/). El patron ganador es "one-tap, distraction-free logging" pensado para alguien a mitad de serie, con plantillas inteligentes que precargan el valor esperado. Para EVA: precargar peso y reps del target o de la ultima sesion, de modo que confirmar una serie que salio como estaba prescrita sea un solo toque; la edicion detallada (cambiar kg/reps/RIR) es la excepcion, no el flujo obligatorio. El principio general de reduccion de "interaction cost" incluye podar taps extra y exponer siempre la "siguiente mejor accion" (avanzar).

### 10. Entrada numerica: teclado grande para valores altos, stepper solo para rangos chicos

Los steppers +/- requieren menos interacciones para ajustes pequenos alrededor de un valor por defecto, pero se vuelven laboriosos fuera del rango ~0-10/20: pasar de 1 a 50 exige demasiados toques (https://www.nngroup.com/articles/input-steppers/). Para pesos (que pueden ir de 5 a 200 kg) y reps altas conviene el teclado numerico grande del sistema: usar type=text con inputmode="numeric" y pattern muestra un keypad de botones extra grandes, mas rapido y preciso al dedo (https://css-tricks.com/finger-friendly-numerical-inputs-with-inputmode/). El patron optimo es hibrido: mostrar el valor precargado como boton grande que abre teclado numerico al tocar, con micro-ajuste +/- opcional para subir/bajar una unidad sin abrir teclado. Los botones de stepper tambien deben respetar el minimo de 1 cm y preferir disposicion horizontal para evitar toques accidentales.

### 11. Anti-error: undo en vez de confirmacion para lo rutinario

Con manos sudadas y atencion fragmentada, los toques accidentales son la norma. La respuesta correcta no es sembrar dialogos de confirmacion: interrumpen el flujo y, si se abusa, la gente los cierra sin leer ("si gritas lobo muchas veces, dejan de prestar atencion") (https://www.nngroup.com/articles/confirmation-dialog/). Para acciones reversibles y rutinarias (registrar, saltar, deshacer una serie) el patron es el undo: un toast temporal que aparece unos segundos y se desvanece, permitiendo recuperar sin exigir atencion extra (https://blog.logrocket.com/ux-design/double-check-user-actions-confirmation-dialog/; https://www.nngroup.com/articles/confirmation-dialog/). Los dialogos se reservan solo para lo verdaderamente destructivo e irreversible (abandonar/borrar toda la sesion), con texto especifico y etiquetas descriptivas ("Descartar entrenamiento", no "Si"). Las acciones destructivas deben ir subestimadas fuera de las pantallas de confirmacion (solo texto rojo, nunca boton rojo grande junto al CTA primario) para no invitar el toque distraido (https://uxmovement.com/buttons/how-to-design-destructive-actions-that-prevent-data-loss/).

### 12. Interaccion eyes-free: cerrar el ciclo con sonido y vibracion

Durante el ejercicio la vista esta en el cuerpo, el espejo o la barra, no en la pantalla. La investigacion de "exertion interfaces" y sistemas eyes-free muestra que el feedback auditivo y haptico permite ejecutar y corregir movimiento sin mirar: en Eyes-Free Yoga, guia verbal jerarquica (core, luego piernas, luego brazos, una correccion por vez) permitio practicar sin interfaz visual, con 13 de 16 participantes prefiriendo el feedback enriquecido y 16 horas de practica en 24 dias (https://pmc.ncbi.nlm.nih.gov/articles/PMC5667683/). El sonido es "inherentemente ritmico, minimamente intrusivo y se sincroniza naturalmente con el movimiento", frente a las senales visuales que desvian la atencion. Para EVA: el cronometro de descanso debe avisar el fin con vibracion/sonido nativo (no exigir mirar), los holds de movilidad por lado deben marcar el cambio de lado con haptico, y el conteo de pasadas de roller puede confirmarse con un tick tactil. Esto usa capacidades nativas del celular (Haptics/notificaciones locales) y sostiene el "eyes-free" que el gimnasio demanda.

### 13. La vibra Duolingo: celebracion inmediata y aversion a la perdida, en el momento correcto

La motivacion tipo Duolingo se apoya en recompensa inmediata acoplada a la accion (XP/animacion apenas se termina, "mini-celebracion" al reclamar) y en aversion a la perdida via rachas: los usuarios con racha >7 dias y "streak freeze" promedian 17.19 dias vs 11.62 sin el (48% mas), y quienes completan un logro el primer dia retienen 33.42% vs 20.36% (https://trophy.so/blog/duolingo-gamification-case-study). El haz de mecanicas (recompensa variable, urgencia, hitos) eleva engagement, y en fitness los streaks/badges/leaderboards se asocian a +30% de engagement (https://stormotion.io/blog/fitness-app-ux/). La restriccion critica, cruzando con el hallazgo 8, es de momento: la celebracion va al terminar el ejercicio o la sesion (interstitial fullscreen en el descanso, animacion de cierre), nunca encima de los datos de la serie en curso. Como EVA es white-label, la "vibra" no puede depender de una mascota unica: debe construirse con motion, haptica, color de marca del coach y microcopys, no con un personaje propietario.

## Aplicabilidad a EVA

### RN nativo (ExecutorV2) - debe ser la mejor experiencia

- Controles primarios (registrar serie, siguiente) sobredimensionados a 56-64 px+ en la franja inferior verde del thumb zone; separacion generosa (16 dp+) frente a controles secundarios. Asumir uso a una mano por defecto.
- Cronometro de descanso con capacidades nativas: notificacion local + Haptics (vibracion al terminar) para cerrar el ciclo eyes-free; nunca depender de que el alumno este mirando la pantalla.
- Holds de movilidad por lado y conteo de pasadas de roller con feedback haptico en cada cambio de lado/pasada; guia opcional por audio corta y jerarquica.
- Cardio: numero grande dominante de BPM (Apple Watch via HealthKit) con color de zona; progreso de tiempo/distancia como barra o anillo simple (no medidor radial). Degradar densidad de UI durante alta intensidad.
- Entrada de kg/reps: valor precargado como boton grande que abre teclado numerico nativo; micro-stepper +/- para ajuste de una unidad; confirmar serie prescrita = un toque.
- Celebraciones e interstitials fullscreen SOLO en descanso/cierre, con animacion; datos de la serie en curso siempre estables y sin animar. Vibra construida con motion + haptica + color de marca, no mascota.
- Undo por toast para registrar/saltar/deshacer; dialogo de confirmacion reservado a "descartar entrenamiento".
- Modo oscuro por defecto (respaldo empirico bajo movimiento y luz de gimnasio variable), respetando white-label y safe areas.

### PWA responsive (WorkoutExecutionClient) - hereda todo lo posible

- Mismo layout thumb-first y misma jerarquia glanceable; targets 48 px+ minimo (cumple iOS/Android/WCAG).
- Entrada numerica con inputmode="numeric" + pattern para invocar el keypad grande del sistema en iOS/Android; mismo patron precargar-y-confirmar.
- Undo por toast identico; confirmacion solo para destructivo.
- Cronometro de descanso: usar Web Notifications/Vibration API donde exista, con degradacion elegante (fallback visual+audio) donde el navegador no soporte haptica; documentar limitaciones frente a RN.
- BPM/Apple Watch no disponibles en PWA: mostrar entrada manual o estado "no conectado" sin romper el layout; el resto de cardio (tiempo/distancia manual, barra de progreso) se hereda.
- Celebraciones con CSS/Web Animations en descanso; mismo principio de no animar datos en esfuerzo.

### Compartido en packages (workout-engine y afines)

- El motor puro no dibuja UI, pero puede exponer: valores precargados (target/ultima sesion) para el patron one-tap, estado de fase (esfuerzo vs descanso) para que cada front module densidad, y los umbrales de progreso de cardio (porcentaje completado) para alimentar barras/anillos identicos en RN y web.
- Definir en el paquete los contratos de tipos de ejercicio (fuerza, cardio, movilidad, roller) y sus parametros de captura (RIR/RPE solo fuerza; holds por lado en movilidad; pasadas en roller; tiempo/distancia/BPM en cardio) para que ambas UIs compartan logica y no dupliquen reglas.
- Centralizar la logica de undo (buffer de ultima accion reversible) y de conteo/temporizacion para paridad de comportamiento; los efectos nativos (haptica, notificaciones) se inyectan por front.
- Tokens de diseno (tamanos minimos de target, tipografia de numero dominante, escala de jerarquia glanceable) definidos una vez y consumidos por RN y web, respetando el color de marca white-label del coach.

## Fuentes

- [Touch Targets on Touchscreens - Nielsen Norman Group](https://www.nngroup.com/articles/touch-target-size/)
- [All accessible touch target sizes - LogRocket Blog](https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/)
- [The Thumb Zone: Designing For Mobile Users - Smashing Magazine](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users/)
- [Research on the design of smartwatch health information visualization presentation under different motion scenarios - PMC (Scientific Reports 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12284058/)
- [Design Guidelines for Input Steppers - Nielsen Norman Group](https://www.nngroup.com/articles/input-steppers/)
- [Finger-friendly numerical inputs with inputmode - CSS-Tricks](https://css-tricks.com/finger-friendly-numerical-inputs-with-inputmode/)
- [Confirmation Dialogs Can Prevent User Errors (If Not Overused) - Nielsen Norman Group](https://www.nngroup.com/articles/confirmation-dialog/)
- [Double-check user actions: All about warning message UI - LogRocket Blog](https://blog.logrocket.com/ux-design/double-check-user-actions-confirmation-dialog/)
- [How to Design Destructive Actions That Prevent Data Loss - UX Movement](https://uxmovement.com/buttons/how-to-design-destructive-actions-that-prevent-data-loss/)
- [Design and Real-World Evaluation of Eyes-Free Yoga: An Exergame for Blind and Low-Vision Exercise - PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5667683/)
- [Fitness App UI Design: Key Principles for Engaging Workout Apps - Stormotion](https://stormotion.io/blog/fitness-app-ux/)
- [Duolingo Gamification Strategy: A Full Case Study - Trophy](https://trophy.so/blog/duolingo-gamification-case-study)
