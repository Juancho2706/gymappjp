# F1 — Fundamentos de Motion Design para el ejecutor de entrenamiento de EVA

Investigacion de bases cientificas y de industria sobre motion design aplicado a interfaces, orientada al rediseno del ejecutor de entrenamiento del alumno (RN nativo ExecutorV2 + PWA WorkoutExecutionClient, motor compartido `packages/workout-engine`). El objetivo es sustentar una experiencia "con vibra" tipo Duolingo, dinamica pero funcional, white-label y accesible.

## Resumen ejecutivo

- El movimiento en UI no es decoracion: su funcion primaria es soportar usabilidad reduciendo la brecha entre lo que el usuario espera y lo que ocurre (continuidad, narrativa, relacion, expectativa), segun el manifiesto UX in Motion.
- Los 12 principios de Disney (1981, "The Illusion of Life") siguen vigentes como base, pero solo algunos aplican bien a UI; el mas universal es "Slow In and Slow Out" (easing), que deberia usarse en practicamente el 100% de las animaciones de interfaz.
- Existe un marco especifico para interfaces —los 12 principios de UX in Motion de Issara Willenskomer (2017)— que reemplaza el enfoque "organico" de Disney por principios de continuidad y jerarquia (easing, offset & delay, parenting, transformation, value change, masking, overlay, cloning, obscuration, parallax, dimensionality, dolly & zoom).
- Rango de duracion recomendado por Nielsen Norman Group: 100-500 ms. Bajo 100 ms se percibe instantaneo; sobre 500 ms se vuelve molesto y rompe el flujo.
- Micro-feedback (checkbox, toggle, tap de serie completada) ~100 ms; cambios sustanciales de pantalla (modal, transicion entre ejercicios) 200-300 ms; movimientos grandes cross-screen hasta 400 ms.
- Umbral perceptual: en promedio una persona tarda ~230 ms en percibir visualmente algo; animaciones bajo ~200 ms pueden pasar desapercibidas, por eso el rango util practico suele ser 200-500 ms para transiciones con contenido.
- Timing asimetrico: lo que aparece debe durar un poco mas que lo que desaparece (ej. 300 ms entrada / 200-250 ms salida); entrada con ease-out, salida con ease-in; evitar movimiento lineal.
- La animacion basada en fisica (springs) se siente mas natural que las curvas bezier porque modela masa, rigidez (stiffness/tension) y amortiguacion (damping/friction) reales, generando desaceleracion y overshoot organicos que una cubica de 4 puntos de control no puede replicar.
- Material 3 Expressive (Google, mayo 2025) reemplaza el sistema duracion+easing por un motor de resortes con dos esquemas (Standard y Expressive) y dos tipos de resorte: spatial springs (posicion/tamano, pueden rebotar) y effect springs (color/opacidad, sin rebote); respaldado por 46 estudios y >18.000 participantes que prefirieron y encontraron mas usables los disenos expresivos.
- Coreografia y jerarquia: offset & delay (stagger) comunica relaciones y orden de lectura antes de que el usuario lo procese conscientemente; lo primario se mueve primero.
- Continuidad espacial: shared element transitions / View Transitions convierten navegaciones en morphs continuos, reduciendo carga cognitiva y haciendo que la app se sienta como un espacio fisico coherente.
- Gamificacion (Duolingo): micro-recompensas (XP, rachas, animaciones de celebracion) disparan dopamina via refuerzo positivo; celebrar "pequenas victorias" y progreso visual sostiene motivacion intrinseca y retencion.
- Accesibilidad no negociable: respetar Reduce Motion / `prefers-reduced-motion`, reemplazando movimiento por cross-fades o cambios estaticos; evitar oscilaciones de gran amplitud (~0.2 Hz) que provocan mareo vestibular.
- Haptica: el feedback tactil debe coincidir con el evento visual con latencia sub-10 ms; co-disenar intensidad visual + sonido + haptica (tap corto = haptico ligero; interaccion pesada = haptico medio/fuerte); el exceso resta calidad percibida.
- Web hereda casi todo: View Transitions API (baseline 2025, cross-document en Chrome 126+/Safari 18+) permite transiciones nativas sin librerias; springs en web requieren JS (o soporte propietario de Safari en CSS).

## Hallazgos

### 1. Los 12 principios de Disney como base (y sus limites en UI)

Los 12 principios fueron formalizados por Ollie Johnston y Frank Thomas en "The Illusion of Life: Disney Animation" (1981) y siguen siendo el fundamento del motion design 3D, motion graphics y UI ([Uxcel](https://uxcel.com/blog/12-principles-of-animation-a-guide-to-motion-design-133)). Los que trasladan bien a interfaz:

- **Slow In / Slow Out (easing):** cuando un movimiento se detiene, lo hace desacelerando para verse suave y agradable. Es el principio mas transversal en UI.
- **Squash and Stretch:** crea ilusion de peso, masa y flexibilidad; en interfaces da sensacion tactil y refuerza affordances (ej. un boton que "cede" al presionar).
- **Overlapping Action / Follow Through:** los elementos pueden sobrepasar (overshoot) su posicion final antes de asentarse, lo que se siente natural.
- **Exaggeration:** en UI se usa para jerarquizar y comunicar lo mas importante de una pantalla ([Uxcel](https://uxcel.com/blog/12-principles-of-animation-a-guide-to-motion-design-133)).

Sin embargo, Issara Willenskomer ("UI Animation Principles: Disney is Dead") argumenta que "la animacion de UI no obedece las mismas reglas ni tiene los mismos principios que cuerpos organicos moviendose en el espacio fisico". Su analisis: el easing aplica al 100%; anticipation y secondary action tienen uso limitado; y squash/stretch, arc, exaggeration, appeal, solid drawing, staging, straight-ahead vs pose-to-pose son en gran medida irrelevantes para el comportamiento de interfaces ([Disney is Dead](https://medium.com/ux-in-motion/ui-animation-principles-disney-is-dead-8bf6c66207f9)). Conclusion practica: usar Disney como vocabulario de "sensacion" (peso, overshoot, easing) pero no como framework de diseno de interaccion.

### 2. Los 12 principios de UX in Motion (marco especifico para interfaces)

Willenskomer propone en su manifiesto (2017) un marco propio de 12 principios, agrupados por funcion ([UX in Motion Manifesto](https://medium.com/ux-in-motion/creating-usability-with-motion-the-ux-in-motion-manifesto-a87a4584ddc); [IxD Pratt](https://ixd.prattsi.org/2017/04/creating-usability-with-motion-the-ux-in-motion-manifest/)):

- **Timing** — *Easing* (todo objeto con comportamiento temporal debe suavizar) y *Offset & Delay* (el stagger establece jerarquia y relaciones antes de que el usuario registre conscientemente los elementos).
- **Object relationship** — *Parenting* (propiedades hijas responden a propiedades padres, creando jerarquia espacial/temporal).
- **Object continuity** — *Transformation* (un objeto muta de estado funcional a otro contando una historia continua: boton -> spinner -> check), *Value Change* (animar numeros/textos para mostrar un sistema dinamico), *Masking*, *Overlay* (capas para comunicar profundidad en 2D) y *Cloning* (nuevos objetos que nacen de uno existente, con causa-efecto clara).
- **Temporal hierarchy** — *Parallax* (elementos a distinta velocidad separan lo primario de lo secundario).
- **Spatial continuity** — *Obscuration*, *Dimensionality* (marcos espaciales: cards flotantes, pliegues, capas 3D) y *Dolly & Zoom* (navegacion cinematica entrando/saliendo o escalando contenido anidado).

El manifiesto sostiene que el proposito del movimiento es soportar usabilidad via cuatro pilares: **Expectativa** (minimizar la brecha entre lo anticipado y lo experimentado), **Continuidad**, **Narrativa** y **Relacion**; no es "hacerlo mas bonito".

### 3. Duracion y easing: rangos y por que

La guia de Nielsen Norman Group establece que la mayoria de las animaciones deben durar **100-500 ms** ([NN/g Animation Duration](https://www.nngroup.com/articles/animation-duration/)):

- **~100 ms** para feedback simple (checkbox, toggle): se siente inmediato y da la ilusion de manipular fisicamente el objeto.
- **200-300 ms** para cambios sustanciales de pantalla (un modal que entra, un cambio de ejercicio).
- **>500 ms** empieza a sentirse "un lastre", cargante y molesto.
- **Timing asimetrico:** lo que desaparece necesita menos tiempo que lo que aparece (ej. 300 ms de entrada vs 200-250 ms de salida).
- **Easing por direccion:** *ease-out* para entradas (arranca rapido, desacelera; responsivo pero deja enfocar la vista), *ease-in* para salidas; **evitar lineal** porque se ve antinatural.

Val Head complementa con la base perceptual: en promedio una persona tarda ~230 ms en percibir visualmente algo, por lo que animaciones bajo ~200 ms pueden pasar inadvertidas; recomienda 200-500 ms, con 200-300 ms para elementos pequenos y 400-500 ms para movimientos mas complejos o con rebote ([Val Head](https://valhead.com/2016/05/05/how-fast-should-your-ui-animations-be/)). Referencias psicologicas clasicas: 100 ms se percibe como instantaneo y 1 segundo es el limite superior del flujo de pensamiento; 500 ms (medio segundo) es un techo prudente para mantener las transiciones agiles pero perceptibles.

### 4. Animacion basada en fisica: por que los springs se sienten naturales

Un spring se define por tres propiedades fisicas: **masa** (peso del objeto; mayor masa = mas lento y mas inercia), **tension/stiffness** (que tan tenso esta el resorte; mayor tension = mas energico y "snappy") y **friction/damping** (resistencia que amortigua; sin friccion el resorte oscilaria para siempre; mayor friccion = movimiento suave sin rebote) ([Josh W. Comeau](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/)). Un dato util: la mayoria de los springs bien ajustados **no rebotan**; el rebote es opcional, no un requisito.

La diferencia clave con bezier: una curva cubica solo tiene 4 puntos de control y describe una curva fija; un spring calcula el movimiento en tiempo real a partir de fuerzas acumuladas, produciendo desaceleracion y overshoot organicos que "las transiciones CSS no pueden replicar" ([Comeau](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/); busqueda de industria confirma que "spring systems produce more organic motion compared to cubic-bezier easing"). Limitacion tecnica: en web los springs requieren JavaScript (salvo la implementacion propietaria de Safari en CSS); en RN se resuelven nativamente con Reanimated. El tradeoff vale sobre todo para movimiento espacial (posicion/tamano), menos para color/opacidad.

### 5. Material 3 Expressive: sistema de fisica y evidencia de investigacion

Google lanzo Material 3 Expressive el 13 de mayo de 2025, respaldado por **46 estudios y >18.000 participantes**; el hallazgo central fue que la gente **prefiere** los disenos expresivos y los encuentra **mas usables**, en todos los grupos etarios ([Supercharge](https://supercharge.design/blog/material-3-expressive); [Android Authority](https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-supported-devices-3556392/)). Su Motion physics system reemplaza el enfoque duracion+easing por resortes, con dos esquemas —**Standard** (funcional, contenido) y **Expressive** (con caracter, para momentos destacados)— y dos tipos de resorte: **spatial springs** (reflejan el movimiento fisico real de posicion/tamano, pueden rebotar, hacen la animacion clara y predecible) y **effect springs** (expresan cambios de color/opacidad sin rebote). Un spring se parametriza con **stiffness** (que tan rapido resuelve al estado final; mayor = mas energico) y **damping ratio** (que tan rapido decae la oscilacion; ratio = 1 es criticamente amortiguado, sin rebote) ([note.com / How many designs](https://note.com/howmanydesigns/n/n96268f08966d?hl=en)). Implicacion para EVA: definir tokens de resorte reutilizables (uno "standard" para transiciones de trabajo y uno "expressive" para celebraciones/logros).

### 6. Coreografia, jerarquia y continuidad espacial

El movimiento debe tener orquestacion: **offset & delay** (stagger) hace que los elementos entren escalonados, lo que comunica orden de lectura y relaciones; lo primario se mueve primero. Las **shared element transitions** dejan de ser un lujo y pasan a ser esenciales en jerarquias de datos para comunicar contexto espacial, guiar la mirada y hacer que la app se sienta como un espacio fisico cohesivo (busqueda de industria sobre spatial continuity). En web esto se logra hoy con la **View Transitions API**: mismo-documento es Baseline en 2025 (Firefox 144 lo suma el 14-oct-2025, junto a Chrome/Edge/Safari 18+), y cross-document funciona en Chrome 126+ (Safari aun no lo enviaba); basta con nombrar dos elementos con el mismo `view-transition-name` para que el navegador haga el morph al navegar ([Chrome for Developers](https://developer.chrome.com/blog/view-transitions-in-2025); [MDN View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)). Novedades 2025: `view-transition-name: match-element` (auto-naming para listas), grupos anidados (Chrome 140+) y scoped transitions sobre subarboles del DOM.

### 7. Gamificacion y celebracion: la "vibra" tipo Duolingo

Duolingo diseno cada interaccion para que se sienta recompensante: colores vibrantes, sonidos de celebracion y animaciones fluidas que convierten recompensas en mini-celebraciones ([StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)). El mecanismo es la Teoria del Refuerzo Positivo: las micro-recompensas (XP, incremento de racha, animaciones de felicitacion, ligas) disparan dopamina y hacen la tarea menos "chore" ([Medium/Sohail](https://medium.com/@sohail_saifii/how-duolingos-gamification-actually-manipulates-dopamine-receptors-d36ece32d79c)). Datos de engagement citados: usuarios con racha de 7 dias son 3,6x mas propensos a seguir comprometidos; las rachas aumentan el compromiso ~60% ([Orizon](https://www.orizon.co/blog/duolingos-gamification-secrets)). Clave estrategica: para retencion a largo plazo, Duolingo migro de recompensas externas a **motivacion intrinseca**, celebrando "pequenas victorias" y progreso visual para dar sensacion de competencia. Para EVA (white-label), la celebracion debe apoyarse en el progreso real del alumno (serie/ejercicio/sesion completada, PRs) y en colores/marca del coach, no en una mascota unica.

### 8. Accesibilidad del movimiento (linea roja)

Apple exige hacer el movimiento **opcional**: con Reduce Motion activo hay que minimizar o eliminar animaciones, reemplazandolas por cross-fades o transiciones estaticas, respetando `UIAccessibility.isReduceMotionEnabled` (en web, `prefers-reduced-motion`). Reduce Motion lo usan personas con trastornos vestibulares, migranas, sindrome post-conmocional y diferencias de procesamiento sensorial; Apple senala como problematicas las oscilaciones de gran amplitud y frecuencias cercanas a **0.2 Hz** (una oscilacion cada ~5 s) ([Apple HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion); [useyourloaf](https://useyourloaf.com/blog/reducing-motion-of-animations/)). Regla para EVA: toda celebracion y todo interstitial deben tener variante reducida (fade/estatico) que preserve la informacion (que completaste, tu progreso) sin movimiento agresivo.

### 9. Haptica y multisensorialidad coordinada

El feedback haptico debe dispararse exactamente cuando ocurre el evento visual (pico de animacion, presion del boton) con latencia sub-10 ms; investigaciones reportan round-trip de gesto a haptico de ~4,8 ms como aporte clave a la responsividad percibida. Se recomienda **co-disenar** visual + sonido + haptica para que sean congruentes: una animacion corta y nitida va con un haptico Light y sonido corto agudo; una interaccion pesada justifica un haptico Medium/Heavy mas largo y grave. El exceso o la incongruencia restan calidad percibida y pueden hacer sentir que el actuador "esta roto" ([Android Haptics](https://developer.android.com/develop/ui/views/haptics/haptics-principles); busqueda de industria iOS/Android). iOS ofrece `UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator` y `UISelectionFeedbackGenerator`; Android usa `VibrationEffect`/`HapticGenerator`.

## Aplicabilidad a EVA

### RN nativo (ExecutorV2 — la mejor version)

- **Motor de springs con Reanimated:** definir 2-3 tokens de resorte compartidos: `springStandard` (stiffness alta, damping ~1, sin rebote) para transiciones de trabajo entre series/ejercicios, y `springExpressive` (mas energia, ligero overshoot) reservado para celebraciones y logros. Alinear con el modelo M3 Expressive de spatial vs effect springs: posicion/tamano con springs; color/opacidad con effect springs sin rebote.
- **Duraciones/feel por interaccion:** tap "serie completada" ~100 ms con squash/overshoot sutil + haptico Light sincronizado (<10 ms); transicion entre ejercicios 200-300 ms con ease-out de entrada y stagger (offset & delay) de los elementos de la nueva tarjeta.
- **Interstitials fullscreen entre ejercicios:** usar dimensionality (card que crece a pantalla completa) + value change para mostrar "Ejercicio 3/8"; siempre con variante Reduce Motion (fade). Deben ser skippables y no bloquear al alumno apurado.
- **Celebraciones tipo Duolingo:** al cerrar serie/ejercicio/sesion y en PRs, celebracion breve (spring expressive + haptico Notification success + sonido opcional), basada en progreso real y colores del coach (white-label), nunca en una mascota unica.
- **Cronometro de descanso nativo:** aprovechar capacidades del SO (Live Activities/Dynamic Island en iOS, notificacion persistente/foreground en Android) para que el conteo siga fuera de la app; animar el progreso con value change y un anillo con easing.
- **Multimedia central (gif/video del ejercicio):** visible al centro sin tocar botones, con transformation/masking para no ser invasivo; loop suave, respetando Reduce Motion (mostrar frame estatico si esta activo).
- **Experiencias por tipo de ejercicio:** cardio con progreso animado (tiempo/distancia via value change + anillo) y BPM de Apple Watch; movilidad con holds por lado (transicion clara izquierda/derecha, offset & delay); roller contando pasadas con clonado/incremento visible. RIR/RPE solo en fuerza.
- **Haptica:** mapear intensidad al peso de la accion (Light en tap de serie, Medium al terminar ejercicio, Success al cerrar sesion); jamas sobre-usar.

### PWA responsive (WorkoutExecutionClient — hereda todo lo posible)

- **View Transitions API** para transiciones entre ejercicios/pantallas (mismo `view-transition-name` en el elemento compartido: tarjeta de ejercicio, media). Baseline mismo-documento en 2025; degradar con gracia donde no haya soporte (cross-fade simple).
- **Springs en web:** implementarlos via JS (la libreria de animacion ya presente) para el movimiento espacial clave; usar CSS bezier (ease-out/ease-in) donde el spring no aporte (color/opacidad) para no cargar el hilo principal.
- **`prefers-reduced-motion`** obligatorio: variante estatica/fade para interstitials y celebraciones; mismo contrato semantico que RN.
- **Duraciones identicas** a RN (100-500 ms) para consistencia de marca entre app y PWA; evitar lineal.
- **Haptica limitada:** en web solo `navigator.vibrate` (Android/Chrome; iOS Safari no lo soporta), asi que la PWA no debe depender de haptica para comunicar estado; usar visual + sonido como canal primario.
- **Cronometro:** usar Web Notifications + timestamps absolutos para resistir throttling de pestana en background; animar con `requestAnimationFrame` respetando Reduce Motion.

### Compartido en packages

- **`packages/workout-engine` (motor puro):** mantener libre de UI, pero puede exponer los *eventos semanticos* que disparan motion (serie-completada, ejercicio-completado, sesion-completada, PR-detectado, descanso-iniciado/terminado, hold-lado-cambiado, pasada-contada). Asi RN y web reaccionan al mismo evento con su propia capa de animacion.
- **Tokens de motion compartidos:** un paquete de design tokens con duraciones (100/200/300/400 ms), curvas (ease-out/ease-in), y parametros de spring (stiffness/damping por token standard/expressive) para paridad web/RN; consumidos por Reanimated en RN y por CSS/JS en web.
- **Contrato de accesibilidad:** una bandera `reducedMotion` resuelta por plataforma (`isReduceMotionEnabled` / `prefers-reduced-motion`) que ambas apps leen para elegir la variante estatica; definir en el paquete el "significado" que cada celebracion debe preservar sin movimiento.
- **Catalogo de celebraciones/interstitials** parametrizable por marca del coach (colores, logo) para cumplir white-label sin duplicar logica entre las tres apps.

## Fuentes

- [12 Principles of Animation: A Guide to Motion Design — Uxcel](https://uxcel.com/blog/12-principles-of-animation-a-guide-to-motion-design-133)
- [UI Animation Principles: Disney is Dead — Issara Willenskomer (Medium)](https://medium.com/ux-in-motion/ui-animation-principles-disney-is-dead-8bf6c66207f9)
- [Creating Usability with Motion: The UX in Motion Manifesto — Issara Willenskomer (Medium)](https://medium.com/ux-in-motion/creating-usability-with-motion-the-ux-in-motion-manifesto-a87a4584ddc)
- [Creating Usability with Motion: The UX in Motion Manifest — IxD@Pratt](https://ixd.prattsi.org/2017/04/creating-usability-with-motion-the-ux-in-motion-manifest/)
- [Executing UX Animations: Duration and Motion Characteristics — Nielsen Norman Group](https://www.nngroup.com/articles/animation-duration/)
- [How fast should your UI animations be? — Val Head](https://valhead.com/2016/05/05/how-fast-should-your-ui-animations-be/)
- [A Friendly Introduction to Spring Physics Animation in JavaScript — Josh W. Comeau](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/)
- [Material 3 Expressive: New Components, Motion, Shapes, and More — Supercharge](https://supercharge.design/blog/material-3-expressive)
- [Material 3 Expressive deep dive — Android Authority](https://www.androidauthority.com/google-material-3-expressive-features-changes-availability-supported-devices-3556392/)
- [Implementing Material 3 Expressive UI Animations (Motion physics system) — note.com / How many designs](https://note.com/howmanydesigns/n/n96268f08966d?hl=en)
- [Motion — Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Reducing Motion of Animations — useyourloaf](https://useyourloaf.com/blog/reducing-motion-of-animations/)
- [What's new in view transitions (2025 update) — Chrome for Developers](https://developer.chrome.com/blog/view-transitions-in-2025)
- [View Transition API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [Duolingo gamification explained — StriveCloud](https://www.strivecloud.io/blog/gamification-examples-boost-user-retention-duolingo)
- [How Duolingo's Gamification Actually Manipulates Dopamine Receptors — Medium](https://medium.com/@sohail_saifii/how-duolingos-gamification-actually-manipulates-dopamine-receptors-d36ece32d79c)
- [Duolingo's Gamification Secrets — Orizon](https://www.orizon.co/blog/duolingos-gamification-secrets)
- [Haptics design principles — Android Developers](https://developer.android.com/develop/ui/views/haptics/haptics-principles)
