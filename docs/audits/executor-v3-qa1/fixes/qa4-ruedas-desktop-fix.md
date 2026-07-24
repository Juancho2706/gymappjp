# QA4 — Ruedas full-range + sheet "Ya hiciste este entrenamiento" en desktop

Rama `fix/executor-v3-qa1` (worktree executor-redesign). Sin commits.

## Hallazgo 1 — Ruedas rango COMPLETO (web + RN)

Antes: la rueda generaba una ventana ±20 kg / ±10 reps alrededor del anterior.
Ahora (decision CEO QA4): catalogo COMPLETO, abre CENTRADA en el anterior via posicion inicial.
- PESO: 0 a 400 kg en pasos de 2,5 → **161 topes**.
- REPS: 0 a 100 en pasos de 1 → **101 topes**.

### Web
- `wheel-range.ts`: `buildWheelRange` ahora produce el rango completo `min..max` (ignora el anterior
  para la lista); el anterior solo fija la posicion inicial via `nearestWheelIndex` (sin cambios).
  Specs nuevos `WHEEL_KG_SPEC = {step:2.5,min:0,max:400}`, `WHEEL_REPS_SPEC = {step:1,min:0,max:100}`.
  Interface `WheelRangeSpec`: `center` pasa a opcional/ignorado, `radius`/`fallback` eliminados,
  `max` requerido. `round3` intacto → formateo es-CL (57,5) sin drift de punto flotante.
- `DualWheelPicker.tsx` (v3): los `useMemo` de rango pasan a deps `[]` (rango fijo, se construye una
  sola vez); `nearestWheelIndex(range, initialWeight/Reps)` sigue fijando `kgStart`/`repsStart` →
  `initialIndex` + remonte por `key` recentran igual que antes. Nada del motor de guardado/draft/cola
  tocado (la rueda solo PRODUCE valores via `onDone`).
- `wheel-range.test.ts`: reescrito al contrato nuevo. **12/12 verde** (vitest).

### RN
- `DualWheelPicker.tsx`: `buildWheelValues(anchor, step, max)` genera `0..max` completo; el ancla se
  redondea al grid y clampa a `[0,max]` solo para el `initialIndex` (tope inicial bajo la capsula).
  Constantes `KG_MAX=400`, `REPS_MAX=100` (reemplazan `KG_SPREAD`/`REPS_SPREAD`). Reanimated
  interpolation, snap, tick haptico, `contentOffset` inicial: intactos. `formatWeightEsCl` intacto.

### Perf (161 topes) — verificado, sin virtualizar
- **Web**: los items se renderizan UNA vez (memo por `[range,...]` con range ahora estable) y el
  resaltado va por manipulacion directa del DOM (`paint()` recorre ~161 nodos por columna dentro de un
  rAF ya throttled). 161 `<button>` por columna es un DOM plano y barato; no se re-renderiza el arbol
  al girar. No degrada → NO se virtualiza (seria no-trivial con scroll-snap + cap central).
- **RN**: `Animated.ScrollView` con 161 `Animated.View`, cada uno con su `useAnimatedStyle` en el hilo
  UI. Es mas pesado que la ventana corta anterior (≈41/21 items), pero virtualizar un selector con
  snap + interpolacion por distancia NO es trivial (FlatList rompe el `contentOffset`/snap y la
  interpolacion continua). Se deja SIN virtualizar y se ANOTA como riesgo a validar en device de gama
  baja; si apareciera jank, la mitigacion natural es reducir el rango o memoizar mas agresivo, no
  virtualizar. Instruccion cumplida (medir/anotar, virtualizar solo si trivial).

## Hallazgo 2 — "Ya hiciste este entrenamiento" MODAL centrado en desktop (solo web)

`WorkoutDoneSheet.tsx` (zona dashboard, claro/oscuro — NO dark-only del ejecutor; se respeta su tema
actual). En PC salia como bottom sheet angosto pegado al borde inferior-izquierdo (roto).

Fix: overrides `md+` en el `className` del `SheetContent` (Base UI ancla el `side=bottom` con
selectores de atributo de mayor especificidad → los overrides van con `!` important de Tailwind v4):
`md:inset-0! md:m-auto! md:h-max! md:w-full! md:max-w-md! md:rounded-2xl! md:border!`. Centrado robusto
SIN transform (inset-0 + margin auto + alto intrinseco) para no chocar con la `translate-y` de entrada
del sheet. El backdrop dim oscuro (`bg-black/60`) ya lo aporta el overlay del DS. El asa de arrastre se
oculta en `md+` (`md:hidden`). Debajo de `md`: bottom sheet actual byte-identico (los overrides `md:`
no aplican). Se quito `sm:max-w-md` (era parte del anclado angosto) → bottom sheet full-width en todo
`<md`; telefonos `<sm` inalterados. RN no aplica (no hay desktop).

## tsc (0 errores)
- `pnpm --filter web exec tsc --noEmit` → **0**.
- `pnpm --filter @eva/mobile exec tsc --noEmit` → **0**.
- `wheel-range.test.ts` → **12/12 verde**.

## Archivos tocados
- apps/web/.../workout/[planId]/v3/wheel-range.ts
- apps/web/.../workout/[planId]/v3/wheel-range.test.ts
- apps/web/.../workout/[planId]/v3/DualWheelPicker.tsx
- apps/web/.../dashboard/_components/program/WorkoutDoneSheet.tsx
- apps/mobile/components/alumno/workout/v3/DualWheelPicker.tsx
