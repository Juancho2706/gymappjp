# Estado del port 1:1 PWA → React Native (corrida nocturna)

> Documento vivo. Se actualiza y pushea en cada checkpoint. Si la sesión muere,
> retomar leyendo este archivo desde la sección "Dónde retomar".

**Branch de trabajo:** `claude/new-branch-rnmobile-x6qxw6`
**Metodología:** olas por sección — inventario → spec con evidencia (citas de archivo:línea del código web) → implementación contra la spec → verificación adversarial hasta 2 rondas consecutivas en cero → typecheck/lint → commit+push.

## Orden de secciones

| # | Sección | Estado |
|---|---------|--------|
| 0 | Fundación: tokens no-color + paridad de componentes compartidos | ✅ parcial (ver nota) |
| 1 | Vista de workout del alumno (inputs kg/reps + barras RIR/RPE) | ⚠️ cerrada con residuos (ver Resultado Sección 1) |
| 2 | Dashboard del alumno completo | 🔄 siguiente |
| 3 | Dashboard del coach completo | ⏳ pendiente |
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

11 unidades trabajadas, cada una hasta 6 rondas de verificación adversarial web→RN. **Ninguna alcanzó 2 rondas consecutivas en cero**: las 11 quedaron `no-convergió`. El grueso de lo que resta es P2 (deltas sub-pixel, divergencias idiomáticas de RN ya sancionadas en el propio código, o límites reales de plataforma/design-system); hay **3 residuos P1 funcionales** que sí importan y quedan abiertos.

El criterio para cerrar la sección igual: el flujo del ejecutor es usable y fiel en lo visible; los P1 restantes son de datos/plataforma (no de layout) y están acotados y documentados. Se prioriza avanzar a la Sección 2 (dashboard, con QA P0 del usuario ya en cola) y volver a los P1 de workout como deuda rastreada.

### Residuos P1 (abiertos — deuda funcional rastreada)

1. **Ejecutor · badge "Semana A/B"** (`apps/mobile/lib/workout-session.ts:459`): setea `activeWeekVariant` desde `plan.week_variant` crudo, sin gate por `ab_mode`. Web (`queries.ts:136-138`, `WEC:1807-1811`) sólo muestra el badge si el programa está en `ab_mode` y usa la variante ACTIVA por rotación (`resolveActiveWeekVariantForDisplay`). Efecto: badge "Semana A" aparece en programas no-A/B donde web no muestra nada, y en A/B pinta la variante del plan en vez de la activa. El helper ya está portado (`program-week-variant.ts:27`) pero el ejecutor no lo usa. **Fix:** añadir `ab_mode` al select (`workout-session.ts:472`) y setear `activeWeekVariant = prog.ab_mode ? resolveActiveWeekVariantForDisplay(prog) : null`.
2. **Ejecutor · historial previo + detección de PR** (`apps/mobile/lib/workout-session.ts:325-332`): el JOIN `workout_blocks!inner(exercise_id)` + `.not('block_id','in',...)` + límite 160 reproduce el anti-patrón que web YA corrigió (`queries.ts:186-200,289-298`: match por snapshot `exercise_id`, sólo filtro por fecha, límite 500/5000). En programas semanales reusados (mismos `block_id` cada semana) `previousHistory` queda VACÍO ⇒ no hay "Última vez"/"Sesión anterior", el prefill "= última vez" no autollena y `prevMax=0` ⇒ **el PR nunca se detecta** (`workout-session.ts:689`). **Fix:** quitar el `.not(block_id in ...)`, matchear por snapshot `exercise_id`, subir límite a 500, y query de máximos independiente para el PR.
3. **Timers · audio inexistente en el build actual** (`apps/mobile/lib/sound.ts:38-44`): `expo-audio` está declarado en `package.json:38` pero NO instalado en `node_modules`; el `require` guardado lanza y `playTimerCue` es un no-op PERMANENTE. Ni beep 3-2-1, ni alarma final, ni previews del panel/perfil suenan — sólo háptica. El código de `sound.ts` ya es correcto: es gap de instalación/build, no de lógica. **Fix:** `expo install expo-audio` + verificar que Metro empaqueta los `.wav` en build nativo.

### Estado por unidad (11 de 11 no-convergió; residuos por prioridad de unidad)

**Prioridad 1**

- **Card de registro de set (KG/Reps + RPE/RIR)** — 6 rondas. Residuos P2: borde SAVED del chip a 30% vs 25% web (`SetRow.tsx:206,124`); readout RPE/RIR sin `tabular-nums` (`TypedKeypad.tsx:650-655`); ayuda inline RPE/RIR renderiza a 13px (TYPE.caption) con `text-[11px]` muerto por precedencia de style inline — mismo bug ya arreglado en el toggle de nota (`SetRow.tsx:182,662,676`, `TypedKeypad.tsx:706`); series PRÓXIMAS no muestran dots RPE/RIR inline (adaptación idiomática: una fila expandida + chips tocables); íconos chip/submit 1-2px por debajo del web. Todos visuales/idiomáticos.
- **Teclado numérico custom (NumericKeypad)** — 6 rondas. Residuos P2, todos compromisos de design-system o split de arquitectura documentados: eyebrow RPE/RIR +16% (DS no tiene 9,5px, piso '3xs'=11px); CTAs a 14px vs 15px web (DS no tiene 15px); "Nota rápida" AÑADIDA en la fase effort del KeypadHost (el modal tapa la fila donde web muestra la nota — adición, no eliminación); la ruta primaria SetRow→TypedKeypad capta el esfuerzo en la fila (EffortScale inline) en vez de una fase dentro del teclado. Funcionalidad preservada.
- **Pantalla de sesión activa (orquestador)** — 6 rondas. Contiene los **P1 #1 y #2** de arriba. Residuos P2: banner offline no reactivo a NetInfo (sólo se togglea dentro de `logSet`; `useOnline` existe pero no se cablea); sin refetch al recuperar foco/foreground (falta `useFocusEffect` + `AppState 'active'`; `router.refresh` es no-portable, reconocido en SPEC §12).

**Prioridad 2**

- **Card de ejercicio + superserie** — 6 rondas. Residuos P2: `SupersetGroupCard` marca "Sigue"/fila expandida de forma persistente (`firstIncompleteInRounds`) vs el hint TRANSITORIO del web que sólo aparece tras loguear (adaptación probablemente intencional); botón timer usa `active:opacity` en vez de `active:scale-95`; `TypedTargetGrid` usa `flexBasis:47%` sin grow (no estira a ancho completo; web `grid-cols-2`/`md:grid-cols-5`).
- **Timer de descanso + sistema de timers** — 6 rondas. Contiene el **P1 #3** (audio). Residuos P2: M:SS grande en monoespaciada (`FONT.monoBold`) vs Archivo ExtraBold del web (`.eva-metric`, `FONT.displayBold` sería el match); sin Media Session API (lock-screen/auriculares — límite de plataforma, deuda conocida); sin `backdrop-blur` (RN no tiene backdrop-filter nativo); eyebrow del panel dice "Alarma de descanso" vs "Alarma" (card compartido del Perfil reutilizado).
- **Overlay de resumen / finalizar** — 6 rondas. Residuos P2: `MuscleMapSvg` neutrales fijos-dark vs theme-aware del web (canvas siempre oscuro — defendible); check/hero usan `theme.primary` (clamped) vs `--sport-500` verbatim; pill de PR oculta `· +0%` cuando pct redondea a 0 (web canvas lo muestra siempre); "Compartir logro" en BOLD vs `font-semibold`; gaps internos de la sección músculos 10px vs 12/16px; separación check→título 14 vs 16px; acciones finales en barra fija vs footer in-scroll `mt-auto` (idiomático sancionado).
- **Sheet de sustitución de ejercicio** — 6 rondas. Residuos P2 heredados del primitivo Sheet compartido: pad inferior safe+24 vs safe+20; centerState +8px horizontal extra; skeleton radio 6 vs 4px; ausencia del wash de gradiente primary (omitido deliberado en `Sheet.tsx:38-40`); deltas de tipografía por type-scale DS (22/15/10.5px inexistentes).

**Prioridad 3**

- **Timers tipados (hold/intervalos/cronómetro)** — 6 rondas. Residuos P2: hold/interval cues silenciados por `isRestTimerMuted()` (RN gatea; web los reproduce independientes del mute — verificar si es mejora deliberada); botones util sin feedback de press (falta `active:scale-[0.97]`); wake-lock usa `accessibilityState.selected` vs `aria-pressed` (debería ser `togglebutton`/`checked`); animación de cierre RN sí corre (MotiView exit) vs web que hace pop instantáneo — divergencia favorable y documentada.
- **Modo stepper (paso a paso)** — 6 rondas. Residuos P2, ambos límites de plataforma RN (sin API de `aria-roledescription` de texto libre): pierde "carrusel de ejercicios" y "ejercicio"; impacto SR menor porque el cambio de paso ya se anuncia vía `announceForAccessibility`.
- **Modal de técnica / video** — 6 rondas. Residuo P2: botón "Entendido" a 14px vs 16px heredado del web (usar `textStyle('base')`).
- **Historial de entrenos (periférica)** — 6 rondas. Residuo P2 **sistémico**: borde del botón "Ver últimos 6 meses" (y del Card, Input, etc.) resuelve blanco OPACO en dark porque `border-default` sin modificador de alpha compila `<alpha-value>=1`; web es blanco@13%. El fix correcto vive en el token/theme imperativo (exponer `theme.borderDefault`), no sólo en esta pantalla — afecta Card, Input y otros en toda la app.

### Decisiones tomadas en Sección 1

1. **Cerrar sin convergencia a cero.** Tras 6 rondas por unidad los residuos se estabilizaron en P2 (visual/idiomático/límite de DS o plataforma) + 3 P1 de datos/plataforma acotados. Seguir iterando daba rendimientos marginales; se cierra la sección con los residuos rastreados aquí y se avanza a la Sección 2.
2. **P1 de workout = deuda funcional rastreada, no bloqueante del avance.** Son de datos (badge A/B, historial/PR) y de build (expo-audio), no de layout; no impiden usar el ejecutor. Se corrigen cuando se retome la Sección 1 o en una pasada de deuda dedicada.
3. **Adaptaciones idiomáticas RN sancionadas como paridad válida** cuando preservan lo que el usuario ve y puede hacer: fila activa expandida + chips tocables (vs N teclados inline), "Nota rápida" en el KeypadHost modal (tapa la fila web), footer de resumen fijo vs in-scroll, animación de cierre de timers, esfuerzo capturado en la fila vs fase dentro del teclado. Documentadas en el código y aquí.
4. **Deltas de design-system aceptados como compromiso** (9,5px→11px, 15px→14px, 22/15/10.5px→escala DS, lh no mapeado): la regla "usa tokens, no px crudos" gana sobre la paridad exacta al pixel. Sólo se ampliaría el type-scale si un gate visual lo exige.
5. **El borde blanco-opaco en dark es un bug sistémico de token**, no de la pantalla de historial: la corrección debe vivir en el theme imperativo (`theme.borderDefault`) para arreglar Card/Input/etc. de una vez. Se registra como deuda de fundación, no se parchea aislado.

## Dónde retomar

**Siguiente: Sección 2 — Dashboard del alumno completo.** Arranca con el QA visual P0 del usuario (build del 10-jul) ya en cola más abajo: (1) barra blanca en la tab bar inferior en dark/Android, (2) overlay "Entrenamiento completado" sin scrim (contenido se lee detrás), (3) header "Buenas tardes, {nombre}" con texto duplicado/marquee. Metodología igual: inventario → spec con evidencia web (`apps/web/src/app/c/[coach_slug]/dashboard/*` y `perfil`, `check-in`) → implementación → verificación adversarial. Consumir `docs/rn-port/ola0-hallazgos.json` (grep por nombre de componente) al tocar cada compartido.

Deuda abierta que arrastra la Sección 1 (retomar aparte): los 3 P1 de workout (badge A/B, historial/PR, expo-audio) y el bug sistémico de `border-default` en dark. Detalle en "Resultado Sección 1" arriba.

## Decisiones tomadas (globales / metodología)

1. Ola 0 recortada de 123→41 componentes y luego cortada tras las auditorías: el valor (tokens + hallazgos) ya estaba capturado y la cuota de Fable estaba por agotarse.
2. Desde la Sección 1 en adelante, TODOS los agentes corren en Opus; Fable solo orquesta.
3. Los componentes compartidos sin fix se corrigen dentro de la sección que los usa, consumiendo los hallazgos de la Ola 0.

## QA visual reportado por el usuario (build del 10-jul, dashboard alumno) — entrada P0 para Sección 2

1. **Barra blanca fea en el navbar** (tab bar inferior): franja blanca visible alrededor/detrás de la tab bar flotante en dark mode. Revisar fondo del contenedor de tabs / safe area / edge-to-edge en Android.
2. **Overlay "Entrenamiento completado"** (toast/badge verde con check): NO tapa el contenido de atrás — el texto de la card se lee a través/alrededor. Debe llevar backdrop/scrim u opacidad plena como en web (verificar contra el equivalente web).
3. **Header "Buenas tardes, Catalina" superpuesto con otro texto** (se ve texto duplicado/marquee detrás del saludo). Posible doble render del header o animación de entrada rota.

## Hallazgos pendientes / bloqueos

- ~1,293 discrepancias de componentes compartidos pendientes de aplicar (ver `docs/rn-port/ola0-hallazgos.json`).
- Sección 1 cerrada con residuos: 3 P1 funcionales abiertos (badge Semana A/B, historial previo + detección de PR, `expo-audio` sin instalar) + residuos P2 por unidad + bug sistémico de `border-default` en dark. Detalle completo en "Resultado Sección 1".
