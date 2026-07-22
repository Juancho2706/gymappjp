# Fix — Unidad A0: Shell global + fondo + responsive

Rama: fix/executor-v3-qa1. Sin commits (gate global).

## Deltas cerrados

### Informe 12 (responsive-pwa)
- **[MAYOR] 1 — Fondo `background-attachment: fixed`** → CERRADO. `globals.css` [data-exec-v3]: quitado el keyword `fixed`, fondo del root ahora `#121218` sólido de respaldo + capa fija dedicada `[data-exec-v3]::before { position:fixed; inset:0; z-index:-1; pointer-events:none; background: radial-gradient(120% 80% at 50% -8%, #1c1c24 0%, #16161d 42%, #121218 100%); }`. z-index:-1 pinta el gradiente sobre el #121218 del root y bajo los hijos; header/pager no lo tapan (header semi-transparente, pager sin bg).
- **[MENOR] 4 — max-w inconsistente** → CERRADO. Header `ExecHeaderV3.tsx` y barra Finalizar `WorkoutExecutionClient.tsx` pasan de `max-w-5xl` a `max-w-3xl`; el pager ya era `max-w-3xl`. Los tres del flujo guiado quedan alineados a 768px. (La vista lista "Ver todo" no-stepper se dejó en max-w-5xl: es otro layout, no parte del chrome del pager.)
- **[MENOR] 5 — pb-32 del pager no safe-area-aware** → CERRADO. `StepperExecution.tsx` section: `pb-32` → `pb-[calc(env(safe-area-inset-bottom,0px)+8rem)]`.

### Informe 03 (fuerza)
- **[MENOR] Fondo `…fixed` + `bg-[var(--ink-950)]` compitiendo en el nodo raíz** → CERRADO. `fixed` resuelto en el punto anterior. El `bg-[var(--ink-950)]` del nodo raíz de `WorkoutExecutionClient.tsx` ahora es condicional (`cn(...)`): sólo se aplica cuando `!execV3Active`. V3 usa el fondo cálido de `[data-exec-v3]` + capa `::before`; V2 conserva `bg-[var(--ink-950)]` byte-idéntico.

### Informe 09 (estados-momentos)
- **[MAYOR] Banner offline: barra ámbar de alarma legacy** → CERRADO en ambas plataformas.
  - Web `WorkoutExecutionClient.tsx`: en modo V3 la barra `bg-amber-500/90` se reemplaza por la píldora calmada (bg #1b1b23, borde 1.5px #2f2f3a, radius 999, punto ámbar chico, texto #c1c1cc con "guardando en tu teléfono" en #e8e8ee/800). Copy: "Sin señal — guardando en tu teléfono" (decisión del jefe en el brief; difiere del literal del mockup "Sin conexión" y del radius 12 → se aplicó la variante del brief tal cual). La barra ámbar legacy se conserva intacta para V2.
  - RN `OfflineBanner.tsx`: prop aditiva `variant="calm"` (default preserva `prominent`/tarjeta suave sin regresión). Píldora equivalente: #1b1b23 / borde 1.5px #2f2f3a / radius 999 / punto ámbar #FBBF24 / copy idéntica con bold. `ExecutorV3.tsx` pasa `variant="calm"` (antes `prominent` + copy legacy).

### Token compartido
- **Tarea 6 — `--exec-brand-ink`** → HECHO. Añadido a `[data-exec-v3]` en `globals.css`: `--exec-brand-ink: color-mix(in srgb, var(--exec-brand) 30%, #000);` (derivado de la marca, no del verde placeholder). Lo consumirán otras unidades para tinta on-brand.

## Pendientes / no aplicables
- **RN espejo de tarea 1 (fondo)**: N/A — RN pinta `exec.surface.appBg` plano por pantalla (no hay `background-attachment`).
- **RN espejo de tarea 2 (bg competidor)**: N/A — no existe nodo raíz compartido V2/V3 con bg en conflicto en RN.
- **RN espejo de tarea 4 (max-w)**: N/A — max-w es responsive web-ancho; RN es phone-first con safe-areas ya correctas (informe 12 §Paridad RN).
- **RN espejo de tarea 6 (brand-ink)**: ya cubierto — `exec-theme.ts` ya expone `accentText` (equivalente on-brand ink); no requiere token nuevo.
- **Informe 12 deltas 3, 6, 7 / informe 03 otros deltas / informe 09 BLOCKERs de sustitución**: fuera de la unidad A0 (asignados a otras unidades / waves).

## Archivos tocados
- `apps/web/src/app/globals.css` (bloque base [data-exec-v3]: token brand-ink, fondo sólido + capa ::before)
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx` (bg condicional raíz, banner offline V3, max-w finish 3xl)
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/StepperExecution.tsx` (pb safe-area)
- `apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/ExecHeaderV3.tsx` (max-w 3xl)
- `apps/mobile/components/OfflineBanner.tsx` (prop aditiva variant="calm")
- `apps/mobile/components/alumno/workout/v3/ExecutorV3.tsx` (usa variant="calm")
