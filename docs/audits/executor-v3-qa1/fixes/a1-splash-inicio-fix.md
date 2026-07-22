# Cierre de fixes — Unidad A1: Splash/Entrada + Inicio de sesión

Rama: `fix/executor-v3-qa1`. Sin commits (por instrucción).

## Deltas cerrados

### Informe 01 — Splash/Entrada
- **[BLOCKER] Fondo radial splash web des-verdecido** → restaurada la fórmula del mockup: núcleo marca 52% sobre base oscura DERIVADA DE MARCA `color-mix(marca 18%, #05070a)`, stop 44% al 22%, piso `#0a0a0f`. White-label safe (nada de verde literal). `globals.css .exec-v3-splash`.
- **[BLOCKER] Fondo splash RN con superficie clara #16161d** → piso ahora `appBgSplash #0a0a0f` (nuevo token en `exec-theme.ts`, solo la línea del piso); wash de marca del tope subido 0.38→0.52 y stops a `[0, 0.44, 1]`.
- **[MAYOR] Falta glow superior `::after` web** → agregado `.exec-v3-splash::after` idéntico al mockup + `overflow:hidden` en `.exec-v3-splash`.
- **[MAYOR] Falta anillo cónico giratorio RN** → arco de acento (`react-native-svg` Circle, dasharray 68/32) dentro de un `MotiView` rotando 360° en 6s lineal (`Easing.linear`); solo con motion.
- **[MAYOR] Inicial avatar web #fff** → `var(--exec-brand-ink)` (token pre-existente).
- **[MAYOR] "Preparando tu sesión" RN en acento saturado** → mezcla casi-blanca `mixAccentWhite(accent, 0.34)` (34% marca + 66% blanco) en etiqueta y los 3 puntos.
- **[MENOR]** prep web 30%→34%; RN gap 26→24; inicial 46→42; skip bottom 34→30; título del día RN `#f4f4f6`→`#ffffff`.

### Informe 02 — Inicio de sesión
- **[BLOCKER] Nota del coach ausente** → globo `.exec-v3-note` (+ flechita `::after`, avatar, nombre, mensaje) creado en CSS y renderizado CONDICIONAL en `SessionStart` web; props `coachNote`/`coachName` añadidas al componente y al `execV3StartVM`. RN ya tenía el componente; se le agregó la flechita (cola rotada 45°) y el avatar con gradiente. **Cableado condicional (se muestra si llega el dato).** Ver pendientes por la fuente.
- **[MAYOR] Flechita del globo** → web `::after` rotada 45° con bordes de marca; RN View rotada 45° a `left:26 bottom:-7`.
- **[MAYOR] 2ª tarjeta "Duración"** → fila `.exec-v3-ctxrow` con tarjeta Duración (duración estimada `~{estimatedMin} min`) junto a "La última vez"; web y RN. `estimatedMin` expuesto en `startData` (RN) y ya presente en el VM web.
- **[MAYOR] Racha vertical anchor web** → spacer `flex-1` antes de la racha; `mt-auto` retirado del CTA → racha+CTA bajan juntos.
- **[MAYOR] CTA color blanco + text-shadow web** → `.exec-v3-juicy` ahora `color: var(--exec-brand-ink)` sin `text-shadow`; triángulo `.exec-v3-play` a `var(--exec-brand-ink)`. (RN ya usa `accentText`.)
- **[MAYOR] RN fondo plano** → LinearGradient vertical aprox. `#1c1c24→#16161d→#121218` (radial fake), base `appBgDeep`.
- **[MAYOR] RN summary sin resaltar "N ejercicios"** → primer segmento en `exec.accent`.
- **[MAYOR] Web summary monoespaciada** → quitado `font-mono`; queda `font-extrabold tabular-nums` color `#cfcfd8`.
- **[MENOR]** CTA 64→66 (web + RN); breathe web 1.02→1.035; RN título line-height 36→34; ctx bg `#17171f`, valor 15px, label `#7f7f8c`; pname `#e8e8ee`; plan paddingVertical 4→6; avatar de la nota RN con gradiente 135°.

### Informe 12
- **[delta 2] Safe-area del botón EMPEZAR (web)** → `pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]` en el contenedor de `SessionStart`.

## Ya resuelto por otra unidad (verificado, no re-tocado)
- Racha estilo mockup (16px + borde + glow, layout etiqueta-izq/dots-der): `WeeklyStreakDots.tsx` (web) y `WeekStreakDots.tsx` (RN) ya venían actualizados por el worker de la Final V3 (componente compartido). Coincide con la decisión del jefe (7 dots semanal, estilo mockup).
- Informe 12 delta 1 (background-attachment:fixed): ya migrado a capa `[data-exec-v3]::before` fija — no era de mi wave.

## Pendientes (no cerrados)
- **Fuente de la nota del coach**: NO existe campo de nota a nivel plan/día en el payload. `workout_plans` solo trae `id/title/assigned_date/day_of_week/week_variant/program_id/coach_id`; `workout_blocks.notes` es POR-EJERCICIO y ya se muestra en el chip "Nota del coach" del ejercicio. El globo queda cableado condicional (`coachNote={null}`). Fuente futura: nueva columna de nota de sesión (p. ej. `workout_plans.coach_note`) → requiere cambio DB, fuera de scope de esta wave.
- **MENORES internos de `JuicyButton.tsx` (RN)**: radio 15→16, letterSpacing 0.3→~0.8px, ciclo del breathe 2.6s→2.4s. Es componente COMPARTIDO por varias pantallas V3 (no es archivo de mi unidad). La altura del CTA sí se cerró vía prop (`height={66}`). Debe cerrarlo la unidad dueña de JuicyButton.
- **Contenido del "día" del splash** (`plan.title` vs "Día N · Foco"): observación de datos, no de CSS; depende de cómo el coach nombra el plan. Sin acción de código.

## Archivos tocados
- `apps/web/src/app/globals.css` (bloques `[data-exec-v3]`: splash bg/::after/overflow, avatar ink, prep 34%, juicy ink sin text-shadow, startcta 66, play ink, ctxrow, ctx flex-1, note).
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SessionStart.tsx`
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` (VM: coachNote/coachName)
- `apps/mobile/components/alumno/workout/v3/SessionIntro.tsx`
- `apps/mobile/components/alumno/workout/v3/SessionStart.tsx`
- `apps/mobile/components/alumno/workout/v3/exec-theme.ts` (solo `appBgSplash`)
- `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx` (solo `estimatedMin` en startData + prop)
