# Estado del port 1:1 PWA → React Native (corrida nocturna)

> Documento vivo. Se actualiza y pushea en cada checkpoint. Si la sesión muere,
> retomar leyendo este archivo desde la sección "Dónde retomar".

**Branch de trabajo:** `rnmobiledenuevo` (absorbió a `claude/new-branch-rnmobile-x6qxw6` el 2026-07-11; aquella rama fue eliminada)
**Metodología:** olas por sección — inventario → spec con evidencia (citas de archivo:línea del código web) → implementación contra la spec → verificación adversarial hasta 2 rondas consecutivas en cero → typecheck/lint → commit+push.

## Orden de secciones

| # | Sección | Estado |
|---|---------|--------|
| 0 | Fundación: tokens no-color + paridad de componentes compartidos | ✅ parcial (ver nota) |
| 1 | Vista de workout del alumno (inputs kg/reps + barras RIR/RPE) | ⚠️ cerrada con residuos (ver Resultado Sección 1) |
| 2 | Dashboard del alumno completo | ⚠️ cerrada con residuos (ver Resultado Sección 2) |
| 3 | Dashboard del coach completo | 🔄 siguiente |
| 4 | Nutrición (coach y alumno) | ⏳ pendiente |
| 5 | Builder del coach | ⏳ pendiente |
| 6 | Resto de secciones descubiertas en inventario | ⏳ pendiente |

## Hechos establecidos (reconocimiento)

- Web fuente de verdad: `apps/web/src/app` — coach en `coach/*`, alumno en `c/[coach_slug]/*`.
- Mobile: `apps/mobile/app` (Expo Router), componentes en `apps/mobile/components`.
- Paridad de tokens de COLOR ya gobernada: `pnpm check:tokens` pasa (86 tokens, claro+oscuro). Contrato: `specs/redesign-eva-ds/token-contract.md`. La Ola 0 cubre lo NO gobernado: tipografía, tamaños, espaciados, radios, sombras.
- Superficies web sin contraparte mobile (fuera de alcance): landing, admin, enterprise, org, pricing.

## Resultado Ola 0 (cortada a propósito, no fallida)

- ✅ Tokens no-color corregidos y pusheados (radios, tipografía, sombras, motion — commit c193a68a). Gate `pnpm check:tokens` sigue pasando.
- ✅ Mapa de 132 componentes compartidos web→RN construido.
- ✅ 1,293 discrepancias de paridad documentadas con evidencia (archivo:líneas) en `docs/rn-port/ola0-hallazgos.json`.
- ⚠️ Los FIXES de componentes NO se aplicaron (la cola se saturó de auditorías y se cortó la ola para preservar cuota del modelo grande). Las olas por sección deben consumir `ola0-hallazgos.json` al tocar cada componente.

## Resultado Sección 1 — workout del alumno (cerrada con residuos)

11 unidades trabajadas, cada una hasta 6 rondas de verificación adversarial web→RN. **Ninguna alcanzó 2 rondas consecutivas en cero**: las 11 quedaron `no-convergió`. El grueso de lo que resta es P2 (deltas sub-pixel, divergencias idiomáticas de RN ya sancionadas en el propio código, o límites reales de plataforma/design-system). Los **3 residuos P1 funcionales** detectados durante la sección quedaron **✅ RESUELTOS** tras verificación adversarial de 6 agentes + mini-ola de cierre (2026-07-11) — detalle abajo.

El criterio para cerrar la sección igual: el flujo del ejecutor es usable y fiel en lo visible; no quedan P1 abiertos. Se prioriza avanzar a la Sección 2 (dashboard, con QA P0 del usuario ya en cola); la deuda restante de la Sección 1 es sólo residuos P2 (decidir en frío) más verificación QA visual en device real.

### P1 resueltos (verificados 2026-07-11 — deuda funcional cerrada)

> Se conserva la descripción técnica original de cada hallazgo como registro histórico de la unidad que lo detectó.

1. **✅ RESUELTO — Ejecutor · badge "Semana A/B"** (`apps/mobile/lib/workout-session.ts:459`): setea `activeWeekVariant` desde `plan.week_variant` crudo, sin gate por `ab_mode`. Web (`queries.ts:136-138`, `WEC:1807-1811`) sólo muestra el badge si el programa está en `ab_mode` y usa la variante ACTIVA por rotación (`resolveActiveWeekVariantForDisplay`). Efecto histórico: badge "Semana A" aparecía en programas no-A/B donde web no muestra nada, y en A/B pintaba la variante del plan en vez de la activa. El helper ya estaba portado (`program-week-variant.ts:27`) pero el ejecutor no lo usaba. **Verificado 2026-07-11:** el fix ya estaba en código desde el commit `8725b033` — precede al cierre de este documento por ~25 min; lo que había quedado desactualizado era el doc, no el código.
2. **✅ RESUELTO — Ejecutor · historial previo + detección de PR** (`apps/mobile/lib/workout-session.ts:325-332`): el JOIN `workout_blocks!inner(exercise_id)` + `.not('block_id','in',...)` + límite 160 reproducía el anti-patrón que web YA corrigió (`queries.ts:186-200,289-298`: match por snapshot `exercise_id`, sólo filtro por fecha, límite 500/5000). En programas semanales reusados (mismos `block_id` cada semana) `previousHistory` quedaba VACÍO ⇒ sin "Última vez"/"Sesión anterior", el prefill "= última vez" no autollenaba y `prevMax=0` ⇒ el PR nunca se detectaba (`workout-session.ts:689`). **Verificado 2026-07-11:** mismo caso que #1 — ya resuelto en código desde el commit `8725b033`, el doc había quedado desactualizado.
3. **✅ RESUELTO — Timers · audio** (`apps/mobile/lib/sound.ts:38-44`): se había detectado `expo-audio` declarado en `package.json:38` pero aparentemente no instalado en `node_modules`, con el `require` guardado lanzando y `playTimerCue` como no-op permanente (ni beep 3-2-1, ni alarma final, ni previews sonaban). **Verificado 2026-07-11:** MUERTO — el paquete está resuelto en `pnpm-lock.yaml` (1.0.16) e instalado; en build CI fresco el audio funciona (`sound.ts` ya era correcto en lógica). El gap era del entorno local de verificación, no del build real.

### Bugs de lógica encontrados por verificación adversarial externa (mini-ola 2026-07-11)

Una pasada adicional con **lente de lógica** (no de paridad pixel) sobre unidades ya cerradas encontró y arregló 3 bugs de estado/lógica que la verificación por paridad visual no había cazado:

1. **Race del auto-avance en modo Pasos (ExecutorV2)** — fix del race del auto-avance del stepper en `apps/mobile/components/alumno/workout/ExecutorV2.tsx` (effect ~1000-1017). Opción (a) aplicada: mover `autoAdvancedRef.current.add(active.key)` de síncrono a DENTRO del callback del `setTimeout(350)`. Antes: el mark síncrono + un 2do update de `sessionLogs` (optimista→reconciliado en <350ms) disparaba el cleanup (mataba el timer) y el re-run salía por el guard `has(active.key)` sin reprogramar ⇒ paso atascado. Ahora sólo marca al DISPARAR: un timer cancelado se reprograma en el re-run. Preserva el delay de 350ms, `target=firstIncompleteStepIndex`, no-op si todo está completo, y el guard de nav manual `i===stepIndex?target:i`. Se descartó la opción (b) [imperativo en `handleCommit` L538-585]: `handleCommit` no tiene `stepIndex` en deps (L587); portarlo ensanchaba las deps y cascadeaba el `renderGroup` memoizado, con riesgo de romper el guard. Web fuente: `WorkoutExecutionClient.tsx:1416-1418` y `1494-1500`. Sin commit.
2. **Doble-commit por el botón "Listo" del keypad sin guarda, y `syncError`/"Reintentar" inalcanzable en series tipadas** — único archivo: `apps/mobile/components/alumno/workout/SetRow.tsx`. FIX A (doble-commit): `onDone` del keypad (~L849) ahora llama `handleConfirm()` en vez de `commit()` directo, heredando la guarda `committing` (~L585) que evita el doble-encolado por doble-tap; `setOpenKey(null)` sigue cerrando el Modal primero. FIX B (syncError inalcanzable): (1) se extrajo la fila de error strength a un componente compartido `SyncErrorRow` (mensaje danger-500 + Editar + Reintentar) antes de `SetRow`; (2) el path strength (~L334) usa `<SyncErrorRow>`; (3) el early-return tipado (~L107, gated por `onRpeUpdate`) recolorea el contenedor rojo si hay `syncError` (mirror del chip strength L198-201) y renderiza `<SyncErrorRow>` tras la escala RPE — así cardio/movilidad/roller logueadas con `syncError` muestran chip rojo + Reintentar (antes inalcanzable). Verificado vs `apps/web/.../LogSetForm.tsx:1098-1108` y `:738-748`.

### Estado por unidad (11 de 11 no-convergió; residuos por prioridad de unidad)

**Prioridad 1**

- **Card de registro de set (KG/Reps + RPE/RIR)** — 6 rondas. Residuos P2: borde SAVED del chip a 30% vs 25% web (`SetRow.tsx:206,124`); readout RPE/RIR sin `tabular-nums` (`TypedKeypad.tsx:650-655`); ayuda inline RPE/RIR renderiza a 13px (TYPE.caption) con `text-[11px]` muerto por precedencia de style inline — mismo bug ya arreglado en el toggle de nota (`SetRow.tsx:182,662,676`, `TypedKeypad.tsx:706`); series PRÓXIMAS no muestran dots RPE/RIR inline (adaptación idiomática: una fila expandida + chips tocables); íconos chip/submit 1-2px por debajo del web. Todos visuales/idiomáticos.
- **Teclado numérico custom (NumericKeypad)** — 6 rondas. Residuos P2, todos compromisos de design-system o split de arquitectura documentados: eyebrow RPE/RIR +16% (DS no tiene 9,5px, piso '3xs'=11px); CTAs a 14px vs 15px web (DS no tiene 15px); "Nota rápida" AÑADIDA en la fase effort del KeypadHost (el modal tapa la fila donde web muestra la nota — adición, no eliminación); la ruta primaria SetRow→TypedKeypad capta el esfuerzo en la fila (EffortScale inline) en vez de una fase dentro del teclado. Funcionalidad preservada.
- **Pantalla de sesión activa (orquestador)** — 6 rondas. Contenía los **P1 #1 y #2** de arriba (✅ resueltos, ver "P1 resueltos"). Residuos P2: banner offline no reactivo a NetInfo (sólo se togglea dentro de `logSet`; `useOnline` existe pero no se cablea); sin refetch al recuperar foco/foreground (falta `useFocusEffect` + `AppState 'active'`; `router.refresh` es no-portable, reconocido en SPEC §12).

**Prioridad 2**

- **Card de ejercicio + superserie** — 6 rondas. Residuos P2: `SupersetGroupCard` marca "Sigue"/fila expandida de forma persistente (`firstIncompleteInRounds`) vs el hint TRANSITORIO del web que sólo aparece tras loguear (adaptación probablemente intencional); botón timer usa `active:opacity` en vez de `active:scale-95`; `TypedTargetGrid` usa `flexBasis:47%` sin grow (no estira a ancho completo; web `grid-cols-2`/`md:grid-cols-5`).
- **Timer de descanso + sistema de timers** — 6 rondas. Contenía el **P1 #3** (audio, ✅ resuelto — ver "P1 resueltos"). Residuos P2: M:SS grande en monoespaciada (`FONT.monoBold`) vs Archivo ExtraBold del web (`.eva-metric`, `FONT.displayBold` sería el match); sin Media Session API (lock-screen/auriculares — límite de plataforma, deuda conocida); sin `backdrop-blur` (RN no tiene backdrop-filter nativo); eyebrow del panel dice "Alarma de descanso" vs "Alarma" (card compartido del Perfil reutilizado).
- **Overlay de resumen / finalizar** — 6 rondas. Residuos P2: `MuscleMapSvg` neutrales fijos-dark vs theme-aware del web (canvas siempre oscuro — defendible); check/hero usan `theme.primary` (clamped) vs `--sport-500` verbatim; pill de PR oculta `· +0%` cuando pct redondea a 0 (web canvas lo muestra siempre); "Compartir logro" en BOLD vs `font-semibold`; gaps internos de la sección músculos 10px vs 12/16px; separación check→título 14 vs 16px; acciones finales en barra fija vs footer in-scroll `mt-auto` (idiomático sancionado).
- **Sheet de sustitución de ejercicio** — 6 rondas. Residuos P2 heredados del primitivo Sheet compartido: pad inferior safe+24 vs safe+20; centerState +8px horizontal extra; skeleton radio 6 vs 4px; ausencia del wash de gradiente primary (omitido deliberado en `Sheet.tsx:38-40`); deltas de tipografía por type-scale DS (22/15/10.5px inexistentes).

**Prioridad 3**

- **Timers tipados (hold/intervalos/cronómetro)** — 6 rondas. Residuos P2: hold/interval cues silenciados por `isRestTimerMuted()` (RN gatea; web los reproduce independientes del mute — verificar si es mejora deliberada); botones util sin feedback de press (falta `active:scale-[0.97]`); wake-lock usa `accessibilityState.selected` vs `aria-pressed` (debería ser `togglebutton`/`checked`); animación de cierre RN sí corre (MotiView exit) vs web que hace pop instantáneo — divergencia favorable y documentada.
- **Modo stepper (paso a paso)** — 6 rondas. Residuos P2, ambos límites de plataforma RN (sin API de `aria-roledescription` de texto libre): pierde "carrusel de ejercicios" y "ejercicio"; impacto SR menor porque el cambio de paso ya se anuncia vía `announceForAccessibility`.
- **Modal de técnica / video** — 6 rondas. Residuo P2: botón "Entendido" a 14px vs 16px heredado del web (usar `textStyle('base')`).
- **Historial de entrenos (periférica)** — 6 rondas. Bug **sistémico** detectado: borde del botón "Ver últimos 6 meses" (y del Card, Input, etc.) resolvía blanco OPACO en dark porque `border-default` sin modificador de alpha compilaba `<alpha-value>=1`; web es blanco@13%. **✅ FIX APLICADO (mini-ola 2026-07-11), por la vía web (alpha horneado en el token, no theme imperativo):** (1) `tailwind.config.js` `borderColor.{subtle,default,strong}` → `var(--color-border-*)` SIN `ch()`/`<alpha-value>` (`inverse` queda `ch()`, se usa con `border-inverse/10..50`); (2) `global.css` LIGHT (~107-110): subtle/default/strong → `#E6E9ED`/`#CDD3DB`/`#A8B1BD` (ink-100/200/300 sólidos); (3) `global.css` DARK (~208-210): `rgba(255,255,255,0.07|0.13|0.22)`, espejo 1:1 de web `globals.css:600-602`; (4) `lib/theme.ts` `LIGHT_SCHEME_VARS` (~389-391): mismos 3 tokens a hex (`ForceLightTheme`). Normalizados los usos con modificador `/[x]` a clase bare: `TechniqueSheet.tsx:58,116` (`border-subtle/50`→`border-subtle`, +comentarios :55,:113) y `ExchangeTargetsEditor.tsx:108` (`border-subtle/60`→`border-subtle`); sin usos `/[x]` restantes en `.tsx` de subtle/default/strong. Nota: `border-subtle` y `border-strong` tenían el mismo defecto y se corrigieron junto con `border-default`.

### Decisiones tomadas en Sección 1

1. **Cerrar sin convergencia a cero.** Tras 6 rondas por unidad los residuos se estabilizaron en P2 (visual/idiomático/límite de DS o plataforma) + 3 P1 de datos/plataforma acotados (✅ resueltos, ver "P1 resueltos"). Seguir iterando daba rendimientos marginales; se cierra la sección con los residuos rastreados aquí y se avanza a la Sección 2.
2. **P1 de workout = deuda funcional rastreada, no bloqueante del avance.** Eran de datos (badge A/B, historial/PR) y de build (expo-audio), no de layout; no impedían usar el ejecutor. **✅ Resueltos en la mini-ola de cierre 2026-07-11** (ver "P1 resueltos" arriba).
3. **Adaptaciones idiomáticas RN sancionadas como paridad válida** cuando preservan lo que el usuario ve y puede hacer: fila activa expandida + chips tocables (vs N teclados inline), "Nota rápida" en el KeypadHost modal (tapa la fila web), footer de resumen fijo vs in-scroll, animación de cierre de timers, esfuerzo capturado en la fila vs fase dentro del teclado. Documentadas en el código y aquí.
4. **Deltas de design-system aceptados como compromiso** (9,5px→11px, 15px→14px, 22/15/10.5px→escala DS, lh no mapeado): la regla "usa tokens, no px crudos" gana sobre la paridad exacta al pixel. Sólo se ampliaría el type-scale si un gate visual lo exige.
5. **El borde blanco-opaco en dark era un bug sistémico de token**, no de la pantalla de historial. **✅ Resuelto en la mini-ola 2026-07-11** por la vía web (alpha horneado en el token: `tailwind.config.js` + `global.css` claro/oscuro + `lib/theme.ts`), no vía theme imperativo como se había previsto originalmente — arregla Card/Input/etc. de una vez. Detalle en "Historial de entrenos" arriba.

## Resultado Sección 2 — dashboard del alumno (cerrada con residuos)

**Metodología:** 13 unidades (specs en `docs/rn-port/specs/seccion-2/`), 4 rondas de verificación adversarial cada una contra el web fuente de verdad (`apps/web/src/app/c/[coach_slug]/dashboard/*`, `perfil`, `check-in`), más una pasada extra con **lente de lógica** (races, estado stale, guards de doble-tap) sobre las mismas unidades, ejecutada 2026-07-11.

**Los 3 P0 del QA humano del 10-jul — los tres RESUELTOS**, verificados contra código HEAD real en esta pasada:

1. **Barra blanca en tab bar (dark)** — resuelto en `AlumnoMobileChrome.tsx:221-229`: se eliminó el 2do velo opaco (`<View bg-surface-card/70>`) que se apilaba sobre el `BlurView`; queda una sola superficie translúcida (espejo del `backdropFilter` único web `ClientNav.tsx:479-482`). Confirmado leyendo el archivo (comentario in-line documenta el fix). `_layout.tsx:63-66` además pone `sceneStyle.backgroundColor='transparent'` + root `bg-surface-app` para edge-to-edge.
2. **Overlay "Entrenamiento completado" sin scrim** — resuelto en `HeroSection.tsx:139-173` (`components/alumno/home/HeroSection.tsx`, no `components/alumno/HeroSection.tsx` como decía la nota original): fondo OPACO scheme-aware (`completedOverlayBg`, mezcla success+surface-inverse) cubriendo `top/left/right/bottom:0`, ya no se lee el contenido detrás. Confirmado por lectura directa.
3. **Header "Buenas tardes, {nombre}" duplicado** — resuelto en `home.tsx:270-289`: el saludo sólo se pinta en la rama ya-cargada; la rama `loading` usa `DashboardHeaderSkeleton` sin texto de saludo, así el swap "cargando → saludo" ya no duplica/parpadea. Comentario in-line confirma la intención (evita el swap "Hola/Buenas tardes" → "..., Nombre").

**Ola de remate (2026-07-11, misma sesión):** todos los P1 vivos listados abajo se cerraron en una ola dedicada (6 fixers + verificador adversarial c/u, todos PASS) + 1 worker de cierre: race de `load()` (guard `loadIdRef`), off-by-one Santiago del check-in banner, gate de `CoachPresenceCard`, datos del programa (día completo, variante A/B efectiva, `currentWeek` vía `programWeekIndex1Based`, `done` por `plan_id` como `weekPendingWorkouts.ts:142-156`, card "Sin programa activo" 1:1), doble-tap de `WeightQuickLog` (ref síncrono), flash de PR viejo en `PRDetailSheet` (reset durante render), race del prefill de check-in (dirty-flag), anti-patrón Fabric en `Textarea.tsx` (árbol estable, patrón `Input.tsx`), luna RestDayCard vía accesor `theme.aqua700`, título "Actividad reciente" dentro de `RecentWorkouts` (oculto en vacío). **momentum-card** (cuya cadena de verificación había muerto) quedó verificada: paridad PASS y lógica PASS (+ keys estables en los anillos). Los párrafos por unidad siguientes describen los hallazgos COMO SE ENCONTRARON; el estado final es el de este párrafo.

**Estado por unidad** (13/13; P0/P1 dentro de la unidad = `ninguno` salvo lo listado; los "P1 vivos" de abajo quedaron RESUELTOS en el remate salvo los 2 diferidos explícitos):

- **chrome-tabbar** — P0 tab bar resuelto (ver arriba). P1 vivo NO en archivos propios (`cambiosShell`): la cápsula de tabs desaparece dentro de `/movement` y `/bodycomp` porque esas pantallas viven fuera del navigator `(tabs)` (`_layout.tsx:69-76`); web sí la muestra siempre que "Más" esté activo. P2: detalles de iconografía del tab activo/perfil/historial/logout, documentados.
- **home-shell-header** — sin P0/P1 de paridad. P2: falta animación stagger del saludo, sin `tintColor` en RefreshControl (ambos opcionales por spec). **Lógica: P1 vivo** — race sin cancelación en `home.tsx:75-184` (`Promise.all` sin request-id/AbortController): un guardado de peso durante un pull-to-refresh puede ser pisado por la respuesta más lenta del refresh, ocultando temporalmente el peso recién guardado.
- **hero-section** — P0 overlay resuelto (ver arriba); P1 contador/luna de descanso también resueltos (tokens `sport-500`/`aqua-100`). P2: falta tooltip "Hoy entrenas", tamaños de ícono levemente distintos. Sin hallazgo de lógica.
- **streak-checkin-banners** — sin P0. **P1 vivo, fuera de la unidad (`cambiosShell`)**: `home.tsx:255` pasa el `date` crudo (timestamptz UTC) de `check_ins` a `computeCheckInReminder` sin mapear a día calendario Santiago, mientras que el mismo archivo SÍ hace ese mapeo para workouts (`home.tsx:11,149,153`); cerca de medianoche chilena esto corre el conteo de días un día y puede ocultar el banner que el web muestra. P2: detalles de gradiente/sheen de la barra.
- **coach-org-banners** — sin P0/P1 dentro de la unidad. **P1 vivo, fuera de la unidad (`cambiosShell`)**: `home.tsx:332` gatea `CoachPresenceCard` por `coachName`; web siempre la renderiza con fallback `'Tu coach'`. P2: tamaño del badge pill (primitivo DS compartido).
- **active-program** — sin P0. **4 P1 vivos, todos fuera de la unidad (`cambiosShell`)**, la unidad renderiza bien pero recibe datos imprecisos de `home.tsx`: día corto en vez de completo (`DAY_SHORT` vs `DAY_NAMES_FULL`), variante A/B nunca se pasa (badge sin sufijo "· Sem X"), `done` se marca por cualquier entreno del día en vez de exigir el `plan_id` correcto, `currentWeek` aproximado en vez de `programWeekIndex1Based`. P2 interno: `Calendar` con `theme.primary` crudo en vez de token `sport-500` (misma clase de bug ya corregida en `ProgramPhaseBar`).
- **weight-widget** — sin P0/P1 de paridad (Ola0 ya resuelta). P2: deltas de `Sparkline` (primitivo compartido, `cambiosShell`), signo "+" ausente. **Lógica: P1 vivo** — doble-tap en "Guardar" puede insertar 2 filas `check_ins`: el guard `pending` en `WeightQuickLog.tsx:24-32` lee del closure del render, no de un `useRef` seteado sync antes del `await`, así que 2 taps antes del primer re-render pasan ambos el guard.
- **personal-records** — sin P0/P1 de paridad atribuible a la unidad (el único error de `tsc` cae en `HeroSection.tsx`, otra unidad). P2: falta ícono Trophy en el título del sheet (slot de `Sheet.tsx`, `cambiosShell`). **Lógica: P1 vivo** — al cambiar de tile (ej. Press banca → Curl) el reset de `detail` corre DENTRO de un `useEffect` post-paint (`PRDetailSheet.tsx:80`); hay un frame garantizado donde el sheet muestra peso/1RM/hitos del ejercicio ANTERIOR bajo el título del nuevo.
- **recent-habits** — sin P0/P1 dentro de los 2 archivos propios (Ola0 resuelta). **P1 vivo, fuera de la unidad (`cambiosShell`)**: el título "Actividad reciente" + link Historial en `home.tsx:386-391` se renderiza incondicional aunque `RecentWorkouts` retorne `null` (0 registros/carga/error); web esconde la sección completa. P2 menores en `HabitsCard.tsx` (placeholder, strokeWidth crudo).
- **nutrition-daily-summary** — sin P0. **P1 documentado y aceptado por decisión de producto** (no rechazo): las filas de comida son solo-lectura en RN (`onPress={onSeeAll}` navega, no completa in-place); web permite toggle directo con cola offline. Requiere server-action nueva, fuera de alcance de la unidad (regla 8). Sin hallazgos de lógica (race de `clientId` y setState post-unmount verificados y descartados).
- **perfil-share-cards** — sin P0/P1 ni hallazgos de lógica; verificado 1:1 contra el web (mensajes de share, contenido de las 3 cards, hero, módulos). P2: card mensual sin línea de fecha (las otras 2 sí la traen).
- **check-in-flow** — sin P0/P1 de paridad (Ola0 resuelta: TopBar, transición, error inline, gate por perfil preservado). P2: color de marca crudo en vez de token en stepper/slider, estados de foto simplificados a `Alert`. **Lógica: P1 vivo** — `check-in.tsx:84-115` prellena peso/energía de forma async tras montar; si el alumno edita el campo ANTES de que resuelva el `await`, el prefill llega después y pisa en silencio la edición del usuario (el guard `prefilledRef` sólo evita un 2do load, no la carrera con la 1ª edición).

**P1 abiertos totales al cierre de Sección 2 (post-remate): 2, ambos diferidos por decisión explícita.** (1) La cápsula de tabs desaparece dentro de `/movement` y `/bodycomp` — estructural: exige mover esas pantallas dentro del navigator `(tabs)` con `href:null` (riesgo de deep links/navegación; hacer como mini-tarea dedicada con QA propio). (2) Filas de comida del widget nutrición solo-lectura vs toggle in-place del web — requiere server-action nueva + cola offline (regla 8: endpoints de la rama = 404 en prod hasta el merge); decisión de producto documentada. TODO el resto de P1s (lógica y `cambiosShell`) quedó RESUELTO en la ola de remate (ver arriba). Residuos P2 por unidad anotados con archivo:línea en las specs de `docs/rn-port/specs/seccion-2/`.

## Checkpoint parcial Sección 3 — port recuperado (2026-07-11)

- Recuperado desde `stash@{0}` el port parcial que acompañaba las 14 specs del checkpoint `c49439a6`: 23 archivos RN del coach (chrome, dashboard, directorio y ficha), sin tocar alumno/ejecutor.
- `ImportClientsForm.tsx` recuperado con el wizard completo y corrección de fecha: si la fila no trae `subscriptionStartDate`, se omite; nunca se inventa el día UTC.
- `NutricionTab.tsx` estaba revertido a medias (imports nuevos con cuerpo anterior). Se reparó el baseline para compilar; su paridad sustantiva sigue pendiente y debe rehacerse contra `ficha-nutricion-facturacion.md`.
- Tanda nutrición 1 aplicada: dominio OFF con escape de preferencias; carga propia migrada a `useFocusEffect`; card Hoy sin fallback a otro día; barras P/C/G; delta semanal; heatmap de 30 días calendario y umbrales 80/60; `null` mensual como `—`; favoritos neutrales sin truncar; contexto de check-in y hábitos completos (agua L/ml, suplementos, nota, Timer). Permanecen los P1 que exigen ampliar datos/acciones RN: duplicar plan, restricciones, ciclos e historial denso del día.
- Tanda dashboard principal aplicada/verificada: shell refresca por foco, error recuperable, umbral Elite 80, Insights abre stats, campana usa novedades reales con rollback, workspace multi abre switcher; saludo y fecha ahora usan Santiago; single-workspace abre Ajustes como web; agenda alineada al `AgendaCard` realmente montado (horas 09:00/10:30…, iconos Lucide, `0 de N hechas`, copy verbatim). Gates completos verdes.
- Gates del checkpoint: `pnpm exec tsc --noEmit` limpio; tokens `86/86`; `pnpm exec expo export --platform android` limpio.
- Este checkpoint NO cierra unidades: falta verificación adversarial elemento-por-elemento, lente runtime/cableado/frescura y completar los P0/P1 de cada spec. Doble-FAB sigue sin implementar por decisión CEO pendiente.

## Dónde retomar

**Siguiente: Sección 3 — Dashboard del coach completo**, más **QA visual humano en device real de la Sección 2** (requiere build nueva desde `rnmobiledenuevo`, ya que los 3 P0 del QA del 10-jul están resueltos en código pero no re-verificados visualmente en dispositivo). Metodología igual: inventario → spec con evidencia web → implementación → verificación adversarial + lente de lógica. Consumir `docs/rn-port/ola0-hallazgos.json` al tocar cada compartido.

Deuda que arrastra la Sección 1 (retomar aparte, sólo si se decide en frío): residuos P2 por unidad (ver "Resultado Sección 1" arriba) más verificación QA visual en device real. Los 3 P1 de workout (badge A/B, historial/PR, expo-audio) y el bug sistémico de `border-default` en dark **ya están resueltos** (ver "P1 resueltos" e "Historial de entrenos" arriba).

Deuda que arrastra la Sección 2 (post-remate): solo los 2 P1 diferidos (cápsula en movement/bodycomp — estructural; toggle de comidas del widget — necesita server-action + cola offline) + residuos P2 por unidad. Los demás P1 de lógica y `cambiosShell` quedaron resueltos en la ola de remate del mismo día.

QA Ronda 6 lote A del CEO (Xiaomi, dark, 2026-07-11, `docs/audits/rn-parity-qa/ronda-6-ceo-20260711.md`) aplicada sobre la rama post-Sección 2: 3 unidades PASS (`gear-settings`, `rest-timer-background`, `lista-rows-tecnica`), 2 unidades pendientes de resultado (`serie-edit-save` QA-1, `share-pr` QA-4/QA-5).

QA Ronda 7 del CEO (Xiaomi, dark, 2026-07-11 madrugada+mañana, `docs/audits/rn-parity-qa/ronda-7-ceo-20260711.md`) sobre build release con ronda 6 lote A pero SIN lote B (`96bc9bd0`): `rest-notif-spam-live` FAIL→fixeado (identifier determinístico en `scheduleNotificationAsync`, cambiosShell pendiente: `pnpm install` raíz con `react-native-notify-kit` + posible `@notifee` = build NATIVA nueva); `lista-scroll-perf` PASS (causa real = tick de 1s de `elapsedSec` en `useWorkoutSession` re-renderiza el árbol completo, no el countdown del descanso). QA-12 (tuerca/Técnica/"Más" — pista clave: "Más" solo abre tras visitar otra tab, apunta a montaje/focus del sheet host, NO repetir el fix dynamicSizing que ya falló en device) y QA-13 (texto cortado en sub-header) quedan PENDIENTES sin asignar.
Pendiente: build nueva (nativa si se agregó notifee) + re-test QA-10/QA-14 + smoke lote B (QA-8 banda negra, QA-9 widget nutrición, no probados en ronda 7) + unidad dedicada QA-12/QA-13.

## Decisiones tomadas (globales / metodología)

1. Ola 0 recortada de 123→41 componentes y luego cortada tras las auditorías: el valor (tokens + hallazgos) ya estaba capturado y la cuota de Fable estaba por agotarse.
2. Desde la Sección 1 en adelante, TODOS los agentes corren en Opus; Fable solo orquesta.
3. Los componentes compartidos sin fix se corrigen dentro de la sección que los usa, consumiendo los hallazgos de la Ola 0.

## QA visual reportado por el usuario (build del 10-jul, dashboard alumno) — entrada P0 para Sección 2

**Los 3 — ✅ RESUELTOS en código, verificado 2026-07-11 (ver "Resultado Sección 2"). Pendiente: re-confirmar en device con build nueva.**

1. ~~**Barra blanca fea en el navbar**~~ — ✅ resuelto, `AlumnoMobileChrome.tsx:221-229` (2do velo opaco eliminado, sólo BlurView).
2. ~~**Overlay "Entrenamiento completado" sin scrim**~~ — ✅ resuelto, `components/alumno/home/HeroSection.tsx:139-173` (fondo opaco scheme-aware).
3. ~~**Header duplicado/marquee**~~ — ✅ resuelto, `home.tsx:270-289` (saludo sólo se pinta post-loading, sin swap).

## Hallazgos pendientes / bloqueos

- ~1,293 discrepancias de componentes compartidos pendientes de aplicar (ver `docs/rn-port/ola0-hallazgos.json`).
- Sección 1 cerrada con residuos: sólo residuos P2 por unidad + verificación QA visual en device pendiente. Los 3 P1 funcionales (badge Semana A/B, historial previo + detección de PR, `expo-audio`) y el bug sistémico de `border-default` en dark **ya están resueltos** (ver "Resultado Sección 1").
- Sección 2 cerrada con residuos: ver "Resultado Sección 2" — 5 `cambiosShell` sin aplicar, 4 P1 de lógica dentro de unidad, residuos P2, QA visual en device pendiente de re-confirmar tras fix de los 3 P0.
