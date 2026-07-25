# Fix QA2-B — Carrera al saltar descanso + splash fuera de secuencia + panel esfuerzo colapsado con (?)

Rama `fix/executor-v3-qa1`. Sin commits. tsc web + mobile LIMPIOS tras los cambios.

## Regla de motor: cumplida
Cero cambios a payloads/keys/Zod/flujo de submit/drafts/cola/reconciliación. Todo es: props aditivas
default-legacy, timing de commit de un estado optimista que igual se seteaba, y ramas de render/CSS scoped.

---

## HALLAZGO 1 — Carrera al saltar el descanso (grave) · WEB

### Causa raíz
En el hero de fuerza, `LogSetForm.handleSubmit` es la **form-action** de `<form action={handleSubmit}>`.
React 19 corre las form-actions como **transición**. Dentro de ella:
- el colapso de la serie recién enviada usa `useOptimistic` → se ve **inmediato**;
- pero el avance del hero depende de `sessionLogs` del PADRE, que se setea vía `onLogged → handleLogged →
  setSessionLogs`, un `setState` NORMAL invocado DENTRO de esa transición → queda a prioridad baja y **no
  commitea hasta que la server action (`formAction`) resuelve**.

Con red lenta, si el alumno salta el descanso ANTES de la confirmación del server, `firstUnlogged` no
avanza: la serie 1 se ve colapsada en el slot activo y la serie 2 (is-future, oculta) no aparece →
"la app espera a que se guarde la serie 1". Timing-dependiente (por eso "si lo salto RÁPIDO" y "a veces";
en localhost el server responde en ms y es imperceptible).

### Fix
`WorkoutExecutionClient.handleLogged`: el `setSessionLogs` optimista se envuelve en **`flushSync`**. Se
invoca ANTES de que el hijo llame `formAction` (aún no hay async pendiente), así que fuerza el commit del
optimismo del padre en el acto → `firstUnlogged` avanza YA, independiente del server. `flushSync` en un
callback de evento/acción (no en render) es seguro y no lanza.

Resultado: (a) el hero avanza al confirmar sin esperar al server; (c) saltar el descanso en cualquier
momento (incluso <1s) muestra la serie correcta. (b) **verificado sin bug**: cada serie es un `LogSetForm`
independiente (`key=block-set`) con su propio ref/draft (keyeado por setNumber) → la serie 2 arranca con
`suggestedWeightKg`, jamás con el valor/draft de la serie 1. El fix (a) elimina además la ventana en que el
slot activo mostraba la serie 1 colapsada (posible fuente de "mezcla" percibida). Reconciliación posterior
del server (`handleResult`) intacta.

### RN — verificado SIN cambio
RN no usa form-actions/`useActionState`. `useWorkoutSession.logSet` hace `setSessionLogs(next)`
**síncrono, ANTES del `await` de persistencia** (`workout-session.ts:686-697`), con estado plano (sin
transición). El hero (`firstUnlogged` en `ExerciseScreenV3`) avanza en el acto. No comparte el bug.

---

## HALLAZGO 2 — Splash fuera de secuencia (aparece tras Inicio y se corta) · WEB

### Causa raíz
`execV3Active` arranca `false` y `execV3Phase='session'` (SSR-safe). La resolución (flag server + override
localStorage + gate "entered") corría en un **`useEffect`** = POST-paint. El navegador alcanzaba a pintar
el shell/Inicio y RECIÉN después montaba el splash → "aparece luego de la segunda pantalla y se corta".

### Fix
Convertido ese efecto de montaje a **`useLayoutEffect`**: commitea `execV3Active` + `phase='intro'`
sincrónicamente tras la hidratación y ANTES del primer paint → el splash (z-70) cubre desde el primer paint,
nunca detrás del Inicio. Hidratación-safe (el render inicial SSR/cliente sigue con los defaults, sin
mismatch; el layout-effect sólo re-commitea). Once-per-sesión (gate `execV3EnteredKey`) y "si se perdió la
ventana no mostrarlo" (entered → 'session') intactos. `useLayoutEffect` ya es patrón usado en el mismo dir
v3 (DualWheelPicker) y en landing.

### RN — verificado SIN cambio
`ExecutorV3` ya inicializa `phase='intro'` y lo renderiza como PRIMERA rama de retorno
(`ExecutorV3.tsx:177,1137`) → el splash cubre el primer render siempre; no hay ventana perdida.

---

## HALLAZGO 3 — Panel de esfuerzo RPE/RIR colapsado + botón (?)

### (a) Colapsado por default, memoria por-ejercicio
- **Web** (`LogSetForm` rama hero + `ExerciseStepV3` + `globals.css`): el panel arranca COLAPSADO — fila
  "Esfuerzo · Opcional" + chevron + (?) + pills (sólo si ya hay valores). Tap en la fila expande la escala
  de ticks con animación chica (height/opacity, `cubic-bezier(.4,0,.2,1)`, ~0.2s; reduced-motion la apaga).
  El estado expandido se **levanta a `ExerciseStepV3`** (state `effortExpanded`, prop aditiva a `LogSetForm`
  con fallback a estado local) → persiste entre series del mismo ejercicio y se colapsa al cambiar
  (`ExerciseStepV3` se remonta por `key={block.id}`). Tocar una pill expande + fija el eje.
- **RN** (`EffortTicksV3` + `ActiveSetRow` + `ExerciseScreenV3`): mismo comportamiento — header clickeable
  (chevron rota), pills condicionales, ticks bajo `AnimatePresence` (entrada opacity/translateY, idioma RN).
  Estado `effortExpanded` levantado a `ExerciseScreenV3` (remonta por `key={block.id}`) y pasado por
  `ActiveSetRow → EffortTicksV3` (props aditivas con fallback local).

### (b) Botón (?) 18px → mini-sheet oscura V3
Fila del panel lleva un (?) de 18px que abre una mini-sheet oscura V3 (overlay + sheet inferior) con:
- **RPE** — Esfuerzo percibido: qué tan dura se sintió la serie, del 1 al 10 (10 = no podías más).
- **RIR** — Reps en reserva: cuántas repeticiones te quedaban en el tanque (0 = llegaste al fallo).
Web = overlay `motion` + CSS `[data-exec-v3] .exec-v3-effhelp-*`. RN = `Modal` + `MotiView`. Copy es-latam
con tildes, idéntica en ambas. El guardado de rpe/rir NO se toca (siguen `setRpe/setRir` / `patch`). La
clase `exec-v3-effort` se conserva → el gear-hide E3.7 sigue ocultando el panel completo.

---

## Archivos tocados
Web:
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` (import flushSync/useLayoutEffect; flushSync en handleLogged; efecto de fase → useLayoutEffect)
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx` (props effortExpanded/onEffortExpandedChange; estado colapso + help; panel hero reescrito; mini-sheet)
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExerciseStepV3.tsx` (state effortExpanded + props al hero)
- `apps/web/src/app/globals.css` (bloque `[data-exec-v3]`: colapso panel + chevron + (?) + mini-sheet)
RN:
- `apps/mobile/components/alumno/workout/v3/EffortTicksV3.tsx` (colapso + chevron + (?) + EffortHelpSheet)
- `apps/mobile/components/alumno/workout/SetRow.tsx` (ActiveSetRow: props effortExpanded/onEffortExpandedChange → EffortTicksV3)
- `apps/mobile/components/alumno/workout/v3/ExerciseScreenV3.tsx` (state effortExpanded + paso al hero)

## Pendientes / notas
- Ninguno bloqueante. RN hallazgos 1 y 2: verificados sin bug (no requieren cambio); documentado arriba.

## Verificación
`npx tsc --noEmit` en `apps/web` y `apps/mobile` del worktree: 0 errores.
