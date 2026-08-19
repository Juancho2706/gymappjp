# Unidad B2 — Sheet "Máquina ocupada" V3 (componentes NUEVOS)

Informe base: `09-estados-momentos.md` (BLOCKER sustitución) · mockup `concepto-a-v32-estados.html` (pantalla 2, L621-668 + CSS L262-350).

## Qué se creó (sin integrar)
1. **WEB** `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/SubstituteSheetV3.tsx` — bottom sheet dark V3.
2. **RN** `apps/mobile/components/alumno/workout/v3/SubstituteSheetV3.tsx` — espejo sobre el Sheet nativo (`nativeModal`).
3. **CSS** bloque `[data-exec-v3] .exec-v3-subst*` en `apps/web/src/app/globals.css` (insertado ANTES de `/* ---- Zona objetivo ---- */`, ~L4304), edición quirúrgica con Edit.

NO se tocó `WorkoutExecutionClient` / `ExecutorV3`. NO se tocó el legacy `SubstituteExerciseSheet` (web/RN). La integración (swap del import) la hace la unidad siguiente.

## Contrato de props (EXACTO)

### Web — `SubstituteSheetV3`
```ts
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  blockId: string | null            // fuente del candidate set (server)
  prescribedName: string            // header/aria
  muscleGroup: string               // estado vacío
  onConfirm: (option: SubstituteCandidate) => void  // MISMO handler del legacy
}
```
Idéntico al legacy `_components/SubstituteExerciseSheet` → swap 1:1 del import. Mismo data-layer interno (`getExerciseSubstitutionsAction`, lazy al abrir), mismos 4 estados (cargando/error/vacío/lista). `SubstituteCandidate` de `../_data/substitution.queries`.

### RN — `SubstituteSheetV3`
```ts
interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  blockId: string | null
  prescribedName: string
  muscleGroup: string
  onConfirm: (option: SubstituteCandidate) => void
  exec: ExecTheme        // AÑADIDO V3 (acento marca + superficies dark)
  reducedMotion?: boolean // AÑADIDO V3, default false
}
```
Núcleo idéntico al legacy RN `SubstituteExerciseSheet`; `exec`/`reducedMotion` son adiciones V3 (el integrador V3 ya dispone del tema — se pasa desde `ExecutorV3`). Mismo data-layer (`fetchSubstituteCandidates`, top-5). `SubstituteCandidate` de `lib/workout/substitution`.

## Resiliencia / motor de log
INTACTO. La lógica de sustitución (fetch de candidatos + `onConfirm`) es la del legacy, byte-idéntica; sólo se re-pieló el render y se añadió el patrón de confirmación en 2 pasos (elegir tarjeta → CTA). `onConfirm` recibe el mismo `SubstituteCandidate` que antes: no se toca payload, keys de log ni Zod.

## Fidelidad al mockup
- Sheet: `#1d1d26`, radius 22 arriba (brief), handle 40×5 `#45454f` (reusa `.exec-v3-handle`), sin blur en backdrop (reusa `.exec-v3-sheet-scrim`, `rgba(6,6,10,.55)`).
- Título "Máquina ocupada" (20/900/-.02em) + badge "?" ámbar `#f5b04a` (= `--amber-a3d`, bg amber 18%, borde amber 40%).
- Subtítulo "Cambia solo por hoy — mismo músculo".
- Tarjetas `#17171f` / borde 2px `#2a2a34` / radius 16; seleccionada = borde marca + glow `0 0 0 3px` + tinte 10% + check circular relleno de marca con check en `--exec-brand-ink` (web) / `exec.accentText` (RN). Primera preseleccionada.
- CTA juicy "Cambiar por hoy" 60px (brief; mockup 58), icono swap (`Repeat`), tinta on-brand (reusa `.exec-v3-juicy`). Deshabilitado si no hay selección.
- Nota "Tu coach lo verá en el registro" 11px atenuada (brief) con icono info.
- White-label: acento por `var(--exec-brand)` / `exec.accent`; tinta on-brand por `--exec-brand-ink` / `exec.accentText`. Cero hex `#072100` hardcodeado. Ámbar de la zona/badge es fijo (no re-teñido por marca), correcto.
- Curva `cubic-bezier(.4,0,.2,1)` en transiciones de tarjeta (web); animación de entrada = spring framer-motion con `useReducedMotion` (web) / `reducedMotion` a JuicyButton (RN).

## Verificación
- Iconos lucide confirmados en ambos paquetes (web `lucide-react@0.577`, RN `lucide-react-native`): Repeat, Info, Check, AlertTriangle/TriangleAlert, Dumbbell, RotateCw.
- Rutas de import verificadas contra vecinos del mismo dir (`SensorSheetV3`, `ConnectSensorSheet`).
- No se corrió la suite completa (regla del brief). tsc global queda para el gate del orquestador.

## Pendientes (para la unidad de integración)
- Web: swap del import en `WorkoutExecutionClient` (`SubstituteExerciseSheet` → `SubstituteSheetV3`) — props idénticas.
- RN: swap en `ExecutorV3` pasando además `exec` y `reducedMotion`.
- (BLOCKER separado del informe) exponer el disparador "Cambiar" en `ExerciseStepV3` web — NO es de esta unidad.
