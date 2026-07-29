---
status: reference
owner: engineering
last_verified: 2026-07-28
canonical: false
---

# F1 — Fundamentos de motion destilados para la familia de entrada (splash · walkthrough · selector)

Destilación operativa, sin investigación nueva, de `docs/research/animaciones-apps-rn-2026-07-25.md`, `docs/research/executor-redesign/00-DIRECCION-DISENO.md` y `docs/research/executor-redesign/fundamentos/{f1-motion-design,f2-microinteracciones-feedback,f6-celebraciones-transiciones}.md`, aplicada solo a la "familia de entrada": splash nativo → walkthrough/onboarding 3 slides → selector de rol ("Soy alumno / Soy coach"). Dirección del owner: **Dark Premium Continuo** — una sola atmósfera oscura elegante, sin flash blanco, coherente con el ejecutor V3 dark. Cada punto es una regla accionable, no teoría; entre paréntesis, el doc fuente.

## 0. Regla de oro para esta familia

La entrada es la ventana de mayor riesgo de jank de toda la app: corre justo tras cold start, con Hermes/JS aún calentando y memoria bajo presión — es lo opuesto del contexto ideal para animar mucho. Traducción operativa: **menos nodos, springs baratos, medir en release en gama baja**, no en dev mode (animaciones-apps-rn-2026-07-25.md §Rendimiento, §Checklist QA).

## 1. Duraciones y easings concretos (reusar, no inventar)

| Pieza | Duración | Easing/spring | Fuente |
|---|---|---|---|
| Logo/mark del splash (si anima sobre el splash nativo) | ≤400 ms, debe resolver antes del handoff a JS | `effect spring` (opacity), sin rebote | f1-motion-design §5, DIRECCION §3.5 |
| Entrada de cada elemento del slide (walkthrough) | 200-300 ms por elemento | ease-out; `spring spatial` con rebote leve si es posición/tamaño | NNg 100-500 ms (f1-motion-design §3); DIRECCION §3.5 "100-450ms, entrada ease-out" |
| Salida de un slide (swipe hacia atrás/adelante) | 200-250 ms | ease-in, más corto que la entrada (timing asimétrico) | f1-motion-design §3 |
| Botón "Empezar"/CTA rol — estado pressed | 100-150 ms | scale 0.96-0.98 + color, `effect spring` | f1-motion-design §"RN nativo" (patrón ya usado en ejecutor V3: "pressed con scale ~0.96") |
| Transición selector → siguiente pantalla (rol elegido) | 200-300 ms | ease-out, morph de la card elegida (transformation), no corte duro | f1-motion-design §2 (UX in Motion: transformation) |
| Swipe entre slides (gesto activo) | sin duración fija — resuelve por velocidad al soltar | `withSpring` con velocidad heredada del dedo, rubber-banding en los extremos | f2-microinteracciones §8 |

Regla dura: nunca lineal (f1-motion-design §3). Nunca superar ~500 ms en una transición de esta familia — sobre ese umbral "se vuelve molesto y rompe el flujo" (NNg, f1-motion-design §3).

## 2. Tokens de motion del ejecutor V3 — REUSAR el mismo lenguaje, no crear uno nuevo

DIRECCION §7 ya define el contrato que packages/motion-tokens debe exponer; la familia de entrada consume el mismo lenguaje aunque el paquete formal esté pendiente de build (roadmap F1 del ejecutor):

- **`springStandard`** (spatial, stiffness alta, damping ~1, sin/casi sin rebote) → transiciones de trabajo: entrada de slide, swipe, transición selector→siguiente pantalla. **Es el default de toda esta familia.**
- **`springExpressive`** (más energía, ligero overshoot) → reservado para celebraciones/logros del ejecutor. **Decisión explícita: NO usar `springExpressive` en splash/walkthrough/selector.** La dirección "premium elegante" pide contención, no rebote juguetón; el overshoot se gana en momentos de logro real (fin de sesión, PR), no en onboarding (f6-celebraciones §5, principio anti-fatiga aplicado por analogía: lo épico se reserva).
- **Effect springs** (color/opacidad, sin rebote) para todo lo que no sea posición/tamaño: fade del logo, fade entre slides, dim del fondo al abrir el selector.
- **Flag `reducedMotion`** resuelta por plataforma (`useReducedMotion()` de Reanimated / `AccessibilityInfo.isReduceMotionEnabled()`) — mismo contrato que el ejecutor, ver §7.

## 3. Secuencia de entrada (stagger) — walkthrough

Principio "offset & delay": lo primario se mueve primero, el resto entra escalonado para comunicar jerarquía antes de que el usuario lo procese conscientemente (f1-motion-design §2, §6). Orden y delta recomendados por slide (derivados del rango 100-500 ms, timing asimétrico y stagger de UX in Motion — no hay un número único citado en la fuente, esto es la decisión operativa que respeta esos rangos):

1. Ilustración/ícono central — delay 0 ms, opacity+translateY(12→0), 250-300 ms, ease-out. Es el elemento primario, entra primero.
2. Título — delay ~60-80 ms tras el ícono, mismo tratamiento, 250 ms.
3. Subtítulo/copy — delay ~120-140 ms, 250 ms.
4. Dots/paginador + CTA — delay ~180-200 ms, 200 ms.

Cascada completa resuelta en **≤500 ms** desde que el slide se vuelve activo (techo NNg antes de sentirse "un lastre"). El splash, si anima algo sobre el mark nativo, usa como máximo 2 capas (mark + halo/gradiente) con el mismo principio: la marca primero, cualquier acento después.

## 4. Splash nativo: regla dura y no-flash

- **Android: la animación del splash no debe superar 1.000 ms** (regla explícita del ecosistema, animaciones-apps-rn-2026-07-25.md §Qué no hacer). Tratar 1.000 ms como techo duro de todo lo que ocurre entre el ícono nativo y el primer frame interactivo, no como presupuesto a agotar.
- Splash nativo (expo-splash-screen) debe ser **estático** — la animación, si existe, vive ya en JS/Reanimated tras el handoff, no en la capa nativa previa a que Hermes esté listo.
- **Cero flash blanco**: el color de fondo del splash nativo (`backgroundColor` en `app.json`/`expo-splash-screen`) debe ser exactamente el mismo tono dark que el fondo de la primera pantalla RN (walkthrough slide 1). Si no coinciden, el handoff nativo→JS produce un parpadeo — esto es la causa técnica más común de "flash" en Expo y rompe directamente la dirección "sin flash blanco, atmósfera continua".
- El crossfade del mark (si se anima) usa `effect spring`/opacity, nunca `scale` agresivo con rebote (mantiene el registro "elegante", ver §2).

## 5. transform/opacity sobre layout — sin excepciones en esta familia

Todo lo animado en splash/walkthrough/selector debe tocar únicamente `transform` (`translateX/Y`, `scale`) y `opacity`; nunca `width`/`height`/`top`/`left`/`margin` en el hot path de la animación (f1-motion-design §"RN nativo"; animaciones-apps-rn-2026-07-25.md §Qué hacer). Casos concretos:

- Entrada de ilustración/título/subtítulo del walkthrough → `translateY` + `opacity`, no `marginTop` animado.
- Dots del paginador → si el dot activo cambia de tamaño, usar `scale` sobre un contenedor de tamaño fijo, no `width` real del elemento (evita relayout de la fila).
- Botón CTA en pressed → `scale`, nunca `padding`/`height`.
- Único lugar donde un cambio de layout real es aceptable: la card del selector de rol expandiéndose hacia la siguiente pantalla (dimensionality genuina) — ahí sí hay cambio espacial real, así que se permite, pero acotado a esa única transición y con `LayoutAnimation`/Reanimated `layout` API, no a mano frame por frame.

## 6. Interrumpible si hay gesto

Aplica al swipe del walkthrough (y a cualquier drag que se agregue al selector, ej. bottom-sheet de detalle si existiera):

- El swipe entre slides corre en el **UI thread** (Gesture Handler + Reanimated worklets), nunca en el hilo JS (f2-microinteracciones §8; animaciones-apps-rn-2026-07-25.md §Qué hacer).
- Debe heredar la velocidad del dedo (`event.velocityX` en `onEnd`) para decidir a qué slide asienta, no una duración fija ni un umbral de distancia puro.
- Rubber-banding en los extremos (slide 1 y slide 3): resistencia elástica, no tope duro ni bloqueo del gesto.
- El usuario debe poder cambiar de dirección o soltar a mitad del swipe sin "pelear" contra la animación — ninguna transición de slide puede ser no-cancelable.
- Stiffness moderada (250-350) para el asentamiento del spring de swipe (f2-microinteracciones §8, dato concreto de la fuente).

## 7. Reduce-motion obligatorio — mapeo por pieza

Contrato: `reducedMotion` se resuelve una vez por plataforma y cada pieza tiene una variante fade/estática que preserva el significado, nunca solo "se apaga sin reemplazo" (f1-motion-design §8; DIRECCION §3.5 "línea roja").

| Pieza | Con motion | Con reduce-motion |
|---|---|---|
| Splash mark | fade+scale sutil | fade puro, sin scale |
| Entrada de slide (stagger) | cascada 4 pasos con translateY | todos los elementos aparecen juntos con opacity, sin stagger ni translateY |
| Swipe entre slides | spring con velocidad | cross-fade instantáneo al cambiar de slide (sin desplazamiento horizontal) |
| Botón CTA pressed | scale 0.96-0.98 | solo cambio de color/opacidad, sin scale |
| Selector → siguiente pantalla | morph de card | corte directo con fade corto |

Ninguna animación de esta familia debe superar 3 destellos/segundo bajo ninguna variante (WCAG 2.3.1, citado en f6-celebraciones §Accesibilidad) — no debería aplicar aquí porque no hay parpadeo intencional, pero descarta cualquier "pulso" rápido en el halo del splash o los dots.

## 8. Presupuesto de nodos animados

Techo duro del ecosistema: no más de 100 componentes animados simultáneos en Android gama baja, no más de 500 en iOS — pasado eso, mejor Skia que más componentes React (animaciones-apps-rn-2026-07-25.md §Qué no hacer). La familia de entrada debe operar muy por debajo de ese techo:

- Splash: ≤2 nodos animados (mark + halo opcional).
- Cada slide del walkthrough: ≤6-8 nodos animados simultáneos en el stagger de entrada (ilustración, título, subtítulo, 3 dots, CTA cuentan como conjunto, no cada dot suelto si se implementan como un solo `Animated.View` con hijos estáticos).
- Slides no activos (prev/next en el pager) **no deben animar** — solo el slide que entra corre su stagger; los otros dos están en reposo. Si se usa `FlatList`/pager con varias páginas montadas, limitar `windowSize` para no mantener animaciones fantasma fuera de pantalla.
- Selector de rol: 2 cards, cada una con su propio estado pressed — nunca animar ambas a la vez salvo la transición de salida de la elegida.

## 9. Cuándo Skia vs Moti — decisión para esta familia

Regla del stack: Moti/Reanimated para transform/opacity sobre componentes React; Skia solo cuando la escena es intrínsecamente gráfica (partículas, shaders, dibujo custom) (animaciones-apps-rn-2026-07-25.md §Marco conceptual, tabla). Para splash/walkthrough/selector:

- **Default: Moti + Reanimated 4** para el 100% de esta familia — stagger, springs, botones, swipe. No hay partículas, no hay confetti, no hay celebración épica en la entrada (eso es del ejecutor, no de onboarding).
- **Skia: NO usar aquí salvo una única excepción deliberada** — si diseño decide un fondo ambient con gradiente animado/shader sutil (coherente con "atmósfera oscura elegante"), ahí sí Skia (`@shopify/react-native-skia`, ya en el stack) es la herramienta correcta porque es dibujo de composición, no componentes React. Si el fondo alcanza con `expo-linear-gradient` estático o con una animación de opacidad simple, **no gastar presupuesto Skia** en esta familia — se reserva para el ejecutor (confetti, celebración épica).
- Nunca Rive/Lottie: Lottie está prohibido en el repo; Rive está roadmapeado para el ejecutor (F2, celebración épica) y no está instalado — no traerlo como dependencia nueva solo para onboarding.

## 10. Haptics y sonido — alcance mínimo, reservar lo grande

La familia de entrada no tiene "logros" que celebrar (eso es del ejecutor); el feedback debe ser discreto y semánticamente correcto, no un anticipo de la celebración épica:

- Botón CTA / selector de rol (tap) → `expo-haptics` `selectionAsync` o `impactAsync(Light)`, no `notificationAsync(Success)` — no hay éxito que confirmar todavía, solo una selección (f2-microinteracciones §4, mapeo semántico de `UISelectionFeedbackGenerator` vs `UINotificationFeedbackGenerator`).
- Cambio de slide por swipe → opcional, si se agrega, un tick de selección muy sutil al asentar, nunca en cada frame del gesto.
- Sonido: OFF por defecto, sin excepción — la política del ejecutor ya es "todo OFF salvo el cronómetro de descanso" (DIRECCION §11.3); onboarding no tiene ni siquiera esa excepción, así que no lleva sonido.

## 11. QA / medición (aplicar antes de dar por cerrada la familia)

- Medir en **release build**, nunca en dev mode — el cold start y el splash son exactamente donde dev mode más miente sobre rendimiento real (animaciones-apps-rn-2026-07-25.md §Checklist QA).
- Verificar el techo de 1.000 ms del splash en Android gama baja real, no en emulador de gama alta.
- Verificar Reduce Motion activado/desactivado en iOS y Android para las 3 piezas (splash, walkthrough, selector) — no solo en el ejecutor.
- Confirmar que no hay flash blanco en el handoff nativo→JS (color de `expo-splash-screen` == color de fondo del primer frame RN) en cold start y en warm start.
- Confirmar que el swipe del walkthrough es interrumpible en ambas direcciones sin "salto" ni animación no cancelable.
