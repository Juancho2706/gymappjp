# Lenguaje visual + sistema de motion — Alumno RN mobile

_2026-06-06 · Investigación de diseño/motion 2026 (Whoop, Hevy, Strava, Gentler Streak, Fitbod) + factibilidad real en Expo SDK 54 (Reanimated 4 / Moti / Skia / expo-haptics, todos ya cableados)._

> **Objetivo (textual del usuario):** "el alumno va a ver mucho la app y debe ser MUY bonita, profesional, deportiva y animada". Este documento define **cómo se ve** y **cómo se mueve**, respetando el **color de marca dinámico** del coach (white-label, vía `@eva/brand-kit`).
> **Tesis central:** EVA ya tiene los cimientos correctos; casi todo es **estático**. El salto a "deportivo y animado" NO requiere reescribir — requiere (1) animar cada número y anillo al revelarse, (2) volver física cada acción (registrar serie, marcar comida) con haptic + microanimación, y (3) elevar 3-4 momentos cumbre (workout completado, PR, racha) a celebraciones memorables. **Motion al servicio de la acción, no decoración.**

---

## 1. Lenguaje visual (principios)

1. **Dark-first como superficie primaria, no inversión.** Las top apps (Whoop casi 100% negro, Strava/Hevy dark nativo) tratan el dark como lienzo y dejan que el dato coloreado sea el protagonista. Subir el `bg` base a un near-black más profundo (oklch L~0.13-0.15) para que el acento "salte".
2. **El color de marca dinámico es el ÚNICO acento energético** y se reserva para **energía/acción/progreso** (botón primario, relleno de anillos, valor actual de una barra, glow del CTA del workout activo). Nunca pintar de marca texto secundario, iconos inactivos ni chrome. Ya lo resuelve `@eva/brand-kit` (`clampAccent` garantiza AA); la disciplina es de **uso**.
3. **Escala semántica FIJA e independiente de la marca para estados:** verde = on-track/cumplido, ámbar = parcial/en zona, rojo = fallado/bajo. El alumno lee su estado de un vistazo sin chocar con el color del coach. Coexiste con el acento porque ocupan roles distintos (**estado vs acción**).
4. **Jerarquía por escala extrema ("Hero Number"):** el número clave de cada pantalla (% adherencia, kg movidos, racha, kcal restantes) a **56-80pt** display extra-bold; todo lo demás chico y atenuado. Whoop renderiza el Recovery score a ~72pt.
5. **Tipografía atlética de dos voces:** display condensada/tight para títulos y números (evaluar Saira/Oswald/Archivo solo para títulos y números hero), sans legible (Inter) para cuerpo. Montserrat ExtraBold ya está; sumar una condensed da carácter sin perder legibilidad.
6. **Profundidad por capas + glow de marca, no sombras grises pesadas.** En dark, la elevación se comunica con superficie más clara + halo sutil del acento (`cornerGlow` ya existe en `GlassCard`). Glass real (`expo-blur`) solo en superficies clave (header, tab bar, hero, modales) — NUNCA en filas de `FlashList` (caro en Android).
7. **Data-viz narrativa en 3 niveles (patrón Whoop):** glanceable (anillo/número) → tendencia (sparkline 7-30d) → detalle (gráfico completo al tap). EVA ya tiene Sparkline + victory-native + Skia; falta orquestar la jerarquía.
8. **Densidad con aire:** spacing generoso, ritmo de 8pt, esquinas grandes (radius 2xl/3xl ya en theme) para el look premium 2026 de "tarjetas suaves flotantes".

---

## 2. Sistema de motion

**Reglas (un solo sistema, sin números mágicos por archivo):**
- **Animar solo en los 3 momentos emocionales** (registrar, progresar, celebrar); el resto del UI calmo. "Animada" ≠ "recargada".
- **Tokens centralizados en `@eva/brand-kit/motion.ts`** (fuente única, igual que el color): `DURATION {instant:90, fast:160, base:220, slow:320, expressive:480}`, `EASING {standard, decelerate, accelerate}`, `SPRING {ui: damping18/stiff220, bouncy: damping12}`. Web y RN consumen lo mismo.
- **Solo `transform` + `opacity`** en animaciones (scale/translate/rotate). **NUNCA** animar `width/height/backgroundColor/top/left/borderRadius` en loops (rompen el budget de 16.6ms / 8.3ms a 120Hz). Para "crecer" una barra: `scaleX` con `transformOrigin`, no `width`.
- **Todo corre en UI thread** (Reanimated 4 worklets / Moti). Prohibido `Animated` de react-native y `setState` en loops. Las transiciones siguen a 60fps aunque el JS thread esté ocupado con fetch/listas.
- **Haptic SIEMPRE acoplado al frame visual** (no suelto): `light` en tap, `selection` al cambiar peso/reps, `notification.Success` en el instante en que el check se pinta o el anillo cierra.
- **Color de animación = `theme.primary`** (acento clampeado AA), nunca hardcoded. Confetti, glow del PR, fill del anillo usan el acento del coach → el deleite refuerza la marca. Única excepción: naranja de racha (#F59E0B, "fuego").
- **Reduce-motion global y declarativo:** `<ReducedMotionConfig mode={System}/>` en el root + hook `useEvaMotion()` que colapsa duraciones a ~0 y desactiva loops, manteniendo cross-fades de opacidad (la UI no se siente rota). Reemplaza el patrón ad-hoc actual (EvaLoader).
- **Ningún loop infinito "porque queda lindo":** pulse/shimmer/partículas solo mientras la pantalla está visible y la acción pendiente; parar on blur / fuera de viewport.
- **Celebraciones offline-first:** disparan al confirmar el log **localmente** (optimistic), no al responder el server → energía instantánea aunque la red esté lenta.
- **Skia/Lottie solo para "hero moments" contados** (confetti PR, celebración). La UI cotidiana (tabs, cards, listas, botones) con Moti/Reanimated puro (no inflar bundle ni batería).

**Tecnología por efecto (todo factible en SDK 54):**
| Efecto | Tech |
|--------|------|
| Anillo que se llena + sweep gradient | `@shopify/react-native-skia` (Canvas+Path+SweepGradient) o `react-native-svg` AnimatedCircle + Reanimated `withTiming` strokeDashoffset |
| Números que suben (odometer) | `number-flow-react-native` o `useSharedValue`+`useAnimatedProps` |
| Confetti del acento | `react-native-fast-confetti` (Skia Atlas, el más rápido) |
| Pop/spring de acción | Reanimated `withSequence(withSpring(SPRING.ui))` (patrón de `HapticPressable` ya existente) |
| Skeleton shimmer | Moti `<Skeleton>` / MotiView loop sobre `translateX` de gradiente |
| Transiciones de pantalla | expo-router `Stack.Screen` animation (react-native-screens) |
| Haptics | `expo-haptics` centralizado en `lib/haptics.ts` (`haptics.setDone()`, `.pr()`, `.mealLogged()`) |

---

## 3. Mapa de deleite por pantalla (qué animar y cuándo)

**Home / dashboard:**
- 3 `ComplianceRing` se **dibujan de 0 a su valor** al entrar (sweep ~700ms) con el % contando en sincronía + glow del acento al llegar a 100%; tap → micro-pulse + haptic. *(El `MacroRingSummary` ya tiene el patrón exacto — copiarlo a `ComplianceRing`.)*
- "Hero Number" del día (adherencia/peso) con **count-up**.
- Skeleton → contenido con crossfade (no parpadeo).

**Ejecución de workout (la pantalla que más mira el alumno):**
- Al **registrar serie**: row hace spring pop (scale 1→1.04→1), el check se **dibuja** con stroke animado, sincronizado con haptic; stepper de peso/reps → `selection` haptic por cambio. *(Gesto más repetido — si se siente vivo, toda la app se siente premium.)*
- **Rest timer = actor protagonista:** anillo que "respira", últimos 3s con countdown grande + haptic escalonado, glow de marca al completar. (En v2: Live Activity en Dynamic Island.)
- Al **completar workout**: `WorkoutSummaryModal` con trofeo entrando en spring overshoot + **confetti del acento del coach** (~1.2s) + `notification.Success` + contadores (sets/reps/volumen) en roll-up.
- **PR batido (v2):** glow del acento en el row + badge "PR" con pop + micro-confetti localizado + haptic medium — inline, sin interrumpir.

**Nutrición:**
- Marcar comida = mismo check animado + las barras/anillos de macros del día **suben** al nuevo valor + haptic. Une feedback de tap con progreso del día.

**Check-in:** slider de energía con feedback; foto con cámara nativa (ver native-advantages); celebración sutil al enviar.

**Progreso/historial:** charts animados (Skia) con scrub táctil + haptic al cruzar un PR; heatmap de actividad anual; racha como llama que "late" (pulse loop sutil, respeta reduce-motion) + chispas al subir.

---

## 4. Performance y accesibilidad (para que "animado" no sea "lento ni inaccesible")

- **UI-thread-only**, solo `transform`/`opacity`, tokens de motion únicos (§2).
- **Reduce-motion** global (`useEvaMotion()`), loops que se autodetienen fuera de viewport/foco.
- **FlashList 2.0** (ya instalado) para listas del alumno con entrada *staggered* acotada a ~8 items + `LinearTransition` + `maintainVisibleContentPosition` (para que al togglear un set la lista no salte).
- **Accesibilidad estructural:** `accessibilityRole`/`Label` en todo interactivo animado, touch target ≥44pt con `hitSlop`, haptics como **refuerzo** no sustituto del feedback visual.
- **Bundle/batería:** Skia (~+4-6MB ya asumidos) solo para hero moments; Lottie/Skottie solo si un asset de diseño lo exige; el chrome diario con Moti/Reanimated puro.
- **Checklist de PR de UI:** grep de props layout-driven animados y `loop:true` sin guard; mantener `tsc` + `expo export` verdes.

---

## 5. Lo primero a construir (cimiento del deleite)

Antes de dispersar animaciones, **hacer estos 3 (todos S, v1)** — abaratan y dan consistencia a todo lo demás:
1. **`@eva/brand-kit/motion.ts`** — tokens de duración/easing/spring (fuente única web↔RN).
2. **`useEvaMotion()` + `<ReducedMotionConfig System/>`** en el root — accesibilidad de una vez.
3. **`lib/haptics.ts`** — helper semántico (`setDone`/`pr`/`mealLogged`) sobre `expo-haptics`.

Luego los v1 de alto impacto/bajo riesgo: `ComplianceRing` animado, count-up de números, check de serie animado + haptic, skeleton→contenido, confetti de workout completado, Pressable de marca con press-scale + haptic.

**Deps nuevas de UI:** `react-native-fast-confetti` (Skia, celebraciones), `number-flow-react-native` (odometer). Skia/Moti/Reanimated/haptics/svg/flash-list ya están.

> **Aspiracional / NO bloquear v1:** shared element transitions reales (`sharedTransitionTag` experimental tras feature flag en RN New Arch, bugs iOS) → emular con transición "hero" falsa; AppBackground con mesh animado (medir en gama baja Android primero).

La secuencia integrada con el resto del trabajo está en [mobile-roadmap.md](mobile-roadmap.md).
