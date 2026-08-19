# PLAN — T3.v Cabina (pasada visual del editor único)

Referencia normativa: [SPEC](SPEC.md) + artifacts aprobados 2026-08-16 («Cabina, Recetario, Vitrina»
ronda 1 y «Cabina v2 · Agenda» ronda 2, sección A). Este plan está escrito para ejecutarse en sesión
nueva con esfuerzo estándar y workers (política del dueño: Fable orquesta/juzga; Sonnet = swaps
mecánicos bien especificados; Opus = transcripción de layout guiada por mockup). El detalle
tarea-por-tarea con DoD vive en [TASKS](TASKS.md).

## Arquitectura de la solución

### 1. Una sola fuente para los porcentajes

`packages/nutrition-v2/src/macro-spark.ts` (nuevo, puro):

```ts
export interface MacroShares { p: number; c: number; g: number } // enteros, suman 100 o 0
export function macroCalorieShares(proteinG: number|null, carbsG: number|null, fatsG: number|null): MacroShares
```

Reglas: aportes = P×4, C×4, G×9 sobre valores `max(0, x ?? 0)`; suma 0 ⇒ `{0,0,0}` (la barra pinta
solo el track); redondeo por resto mayor para que la suma dé exactamente 100. Tests golden en el
paquete (suman-100, cero, solo-un-macro, valores con decimales). Web y RN consumen ESTA función;
prohibido recalcular porcentajes en componentes.

### 2. Componentes de presentación

- **Web** `apps/web/src/components/nutrition-v2/MacroSpark.tsx`: props
  `{ calories, proteinG, carbsG, fatsG, fiberG?, size?: 'sm'|'md'|'lg', targetCalories?: number|null,
  ariaContext?: string }`. Pinta `kcal` (mono, tabular) + track 48×6 (38/64 en sm/lg) con tres
  segmentos por `macroCalorieShares`, colores EXCLUSIVAMENTE vía
  `var(--color-macro-protein|carbs|fats)`. Sin popover propio.
- **Web** `apps/web/src/components/nutrition-v2/MacroSparkPopover.tsx`: envuelve un `MacroSpark` y
  monta el contrato D3. Implementación: los primitivos existentes de `components/ui`
  (`popover.tsx` para tap/click; hover por rama `(hover:hover) and (pointer:fine)` — si
  `info-tooltip.tsx` ya da hover+focus accesible, reusarlo para esa rama en vez de inventar). Un solo
  popover abierto: coordinación por contexto liviano en el propio módulo. Cierre en scroll: listener
  en captura sobre el overlay del editor.
- **RN** `apps/mobile/components/nutrition-v2/MacroSpark.tsx` (+ popover): misma API; popover =
  `Modal transparent` con posición medida del ancla (`ref.measureInWindow`), backdrop presionable
  que cierra, flip si no cabe abajo. Pressable SIEMPRE con style estático (gotcha css-interop).
  Colores desde el espejo RN de los tokens de macro (mismo módulo que ya usa el `MacroChipRow` RN).

### 3. Dónde se enchufa (mapa de swaps)

| Superficie | Hoy | v2 |
|---|---|---|
| Fila de item (web `_quick-edit/EditableItemRow`, RN quick-edit) | `MacroChipRow` sm | foto/ícono 34px + nombre+marca + `MacroSparkPopover` sm |
| Header de franja + contraída (`EditableSlotCard` web/RN) | chips en header | spark md; contraída además stack de fotos (máx 4 + «+n») |
| Subtotal de franja | `MacroChipRow` | spark md con `% de la meta` en popover |
| PublishBar / mini-cinta móvil | texto `P 150 C 198 G 58` | kcal + barras por macro con token de color + spark del día |
| Paleta desktop (`EditorPalette`) y picker (`FoodPickerRow` web, `FoodSearchSheet` RN) | `MacroChipRow` por 100 g | foto + spark sm por 100 g (popover con gramos/100 g) |
| Cinta: targets | `TargetsEditorCard` en canvas | popover «Metas ▾» (mismo contenido, mismos dispatches `SET_TARGET`/steppers) |

Las filas del **builder** (`builder/_components/ItemRow`, `FoodResultCard`, `DayTotalsBar`,
`SlotEditor`) y TODO el árbol del alumno **no se tocan** (D2).

### 4. Layout Cabina v2 (web)

`QuickEditPlanView` en modo editor (`state.meta` presente):

- **Cinta** (reemplaza el header compacto actual solo en desktop ≥1024): identidad (✕, eyebrow,
  nombre alumno · nombre plan, StrategyBadge) · centro (anillo % kcal + 3 micro-barras P/C/G con
  token de macro, datos de `qeVariantTotalWithPortions` — ya calculado hoy para PublishBar) ·
  acciones («Metas ▾», «Descartar», «Publicar cambios» + contador aria-live). El popover «Metas ▾»
  monta el contenido actual de `TargetsEditorCard` (misma card, nuevo host) para no duplicar lógica.
- **Rail** (columna izquierda, solo ≥1024): lista de variantes ordenadas con punto de estado
  (verde = tiene comidas y no acusa B4; ámbar = `qeDaysMissingBasePortions` lo nombra o día vacío),
  dow mono, label truncable, kcal actual; activo = fondo `sport-soft` + borde izquierdo 2px;
  «＋ Agregar día» reusa `AddDayPopover`; bajo el día ámbar, línea-enlace «sin porciones · Aplicar del
  base →» que dispara `APPLY_BASE_PORTIONS` (mismo dispatch del aviso actual). En <1024 el rail no
  existe y vuelve la cápsula horizontal actual (`EditorDayCapsule`) — cero código nuevo ahí.
- **Canvas**: leyenda P·C·G (una vez, junto al título del día), cards de franja v2, «＋ Agregar
  franja», card de notas. `PortionsDayGapNotice` desaparece del canvas SOLO cuando el rail está
  visible (≥1024): su acción vive en el rail; en <1024 sigue pintándose como hoy.
- **Paleta**: sin cambios estructurales (W3b); solo rows v2 con foto+spark y caps mono.

RN espeja la mini-cinta (kcal + 3 % con dot) sobre el editor T3.3b y el popover «Metas» en el header;
la estructura de pantalla RN no cambia.

### 5. Responsive

Contrato de la SPEC implementado con utilidades Tailwind estándar (`lg:` `xl:` `2xl:`) — sin
container queries. Gate local: captura Playwright headless en 390/768/1024/1280/1536 sobre el
harness (abajo) con presupuesto: sin overflow-x en `body`, cinta de 1 línea siempre, targets táctiles
≥44 en 390/768.

## Backend

Ninguno (SPEC «Backend: cero»). Checklist de guardia para el ejecutor: si un diff toca
`_actions/`, `_data/`, `services/`, `packages/*/quick-edit` (lógica), SQL o `app/api/` ⇒ fuera de
alcance, abortar la tarea y reportar.

## Verificación

- **Harness local primero (regla del owner):** extender el patrón `dev-harness/nutrition-tabs` con
  una página `dev-harness/nutrition-editor` que monte `QuickEditPlanView` en modo editor con un draft
  semilla (2 días, 4 franjas, items con y sin foto, porciones, sustituciones, macros editadas) SIN
  auth. Script Playwright headless: snapshots 5 anchos × light/dark + aserciones de humo (popover
  abre por hover y por tap emulado, un solo popover, Metas ▾ edita kcal, publish visible).
- **Gates por tanda:** `pnpm lint`, `typecheck`, `test`, `build`, `check:tokens`,
  `check:nutrition-v2-boundaries`, `pnpm --filter @eva/mobile exec tsc --noEmit`,
  `pnpm --filter @eva/mobile exec expo export --platform android`, `pnpm docs:check`.
- **QA humano:** preview Vercel (owner, pase visual) → QA device Android del owner (se funde con el
  QA pendiente del editor RN T3.3b: un solo pase cubre ambos).

## Orden de ejecución (waves) y cierre del programa

| Wave | Contenido | Gate de salida |
|---|---|---|
| W0 | Helper `macroCalorieShares` + tests; componentes `MacroSpark`/`MacroSparkPopover` web con stories en el harness | test paquete + harness renderiza los 3 tamaños y el popover |
| W1 | Web: swaps de superficie (items, franjas, subtotales, paleta, picker, PublishBar) + fotos en filas | harness + gates web verdes; builder con diff cero |
| W2 | Web: cinta v2 («Metas ▾» hospeda TargetsEditorCard), rail v2 + B4-enlace, leyenda, responsive 5 anchos | Playwright 5×2 capturas verdes; sin overflow-x |
| W3 | RN: MacroSpark+popover, swaps quick-edit, fotos, mini-cinta, Metas en header | tsc + expo export; paridad declarada en MOBILE_PARITY |
| W4 | QA: preview owner (web) + device Android owner (visual + pendiente T3.3b) | OK explícito del owner |
| W5 | **OTA android ACUMULADO** (T3.3a+T3.3b+T3.v) vía GH Actions `mobile-ota.yml`, SIEMPRE `--platform android`; luego `eas update:insights`; `CURRENT.md`/`MOBILE_PARITY.md` al día | OTA publicado + insights sin crashes — **cumplido**: corrida del 2026-08-19 sobre los 5 grupos, tabla en [TASKS §V5.1](TASKS.md) |
| — | **Retiro del par viejo: agendado 2026-08-30** (fuera de esta tanda; inventario y mudanzas listos) | — |

W0→W1→W2 son secuenciales; W3 puede arrancar tras W0 (helper listo) en paralelo con W2 si hay
workers. W4/W5 son del owner + orquestador, no de workers.

## Qué NO hacer (anti-alcance para workers)

- No tocar `builder/**`, área alumno, V1, enterprise, ni reducers/publish.
- No inventar componentes de popover nuevos si los primitivos de `components/ui` alcanzan.
- No hex de colores de macro inline; no `style`-función en Pressable RN; no `SafeAreaView` de RN core.
- No borrar `MacroChipRow` (lo usan builder y otras superficies): solo dejar de importarlo donde se
  hace swap.
- No OTA sin `--platform android`; no tocar nada de iOS mientras dure el App Review.
