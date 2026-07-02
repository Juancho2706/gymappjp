# Auditoría de fidelidad visual — Programas (biblioteca del coach)

Fecha: 2026-07-01
Kit fuente: `docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx` (DesktopPrograms, L196-248) + CSS `.dt-*` en `docs/design-source/ui_kits/eva-desktop/index.html` (L261-325) · `docs/design-source/ui_kits/eva-app/screens/coach-programs.jsx` (ProgramasHome L85-281, ProgramPreviewSheet L285-342, AssignProgramDialog L346-390) + `shared.jsx` (TopBar L42-58)
App: `apps/web/src/app/coach/workout-programs/` (WorkoutProgramsClient.tsx, components/ProgramRow.tsx, components/ProgramPreviewPanel.tsx)

Resumen: P0 = 0 · P1 = 5 · P2 = 7. La grilla desktop y la lista móvil están notablemente fieles al kit (tokens, radios, spacing, tipografía display). Los gaps se concentran en tres superficies secundarias: el cuerpo del diálogo **Asignar** (shadcn genérico vs patrones del kit), el **empty state** (sin re-skin EVA) y el **header del preview** (genérico vs identity header + stat-tiles del kit).

---

## [P1] Asignar — selector de alumnos como combobox Popover genérico, sin avatares ni check circular

- **Kit:** eva-app `coach-programs.jsx` · AssignProgramDialog L360-374 — lista INLINE de alumnos dentro del sheet: fila por alumno con `Avatar` (ring de estado), nombre 14/600, badge warning "Con plan", y toggle circular de 22px (borde 2px → sport-500 con check al seleccionar); fila seleccionada con borde sport-500 + fondo sport-100.
- **App:** `apps/web/src/app/coach/workout-programs/WorkoutProgramsClient.tsx:461-539` — un `PopoverTrigger` "Seleccionar alumnos…" que abre un dropdown con búsqueda y checkboxes cuadrados de 16px; sin avatares, sin estado seleccionado en la fila (solo el checkbox), el badge "Plan: {nombre}" sí existe.
- **Diferencia visual:** el kit muestra a los alumnos como ciudadanos de primera clase del sheet (se ven caras/iniciales y quién está elegido de un vistazo); la app los esconde tras un combobox utilitario de shadcn — la superficie se ve genérica y menos EVA.
- **Fix:** reemplazar el Popover por la lista inline (scrolleable con búsqueda arriba si hay muchos alumnos): fila con Avatar + nombre + badge "Con plan" + check circular 22px, estados borde/fondo sport como el kit. Bonus microcopy del CTA: kit deshabilitado dice "Seleccioná alumnos" y lleva icono arrow-right; app dice "Asignar a 0 alumnos" sin icono.
- **Verdict:** CONFIRMED — verificado en ambas fuentes (kit L360-374 lista inline con Avatar/check 22px/fila sport-100; app L463-538 Popover con checkbox `size-4`). El `assignBody` es compartido entre el Dialog desktop y el Sheet móvil (L987-1025) → no existe variante md:/hermana que implemente el patrón del kit. Sin decisión intencional documentada (c45e3d09 rediseñó solo el shell a bottom-sheet, no el cuerpo).

## [P1] Asignar — "Inicio" como Select dropdown en vez del segmented de 3 botones del kit

- **Kit:** eva-app `coach-programs.jsx` · AssignProgramDialog L376-381 — sección "INICIO" (label uppercase 12/700) con 3 botones en fila (`Hoy` / `Fecha` / `Flexible`), flex 1, radius-md, activo = fondo `ink-950` texto blanco, inactivo = borde 1.5px default.
- **App:** `WorkoutProgramsClient.tsx:553-573` — `<Select>` shadcn con las mismas 3 opciones dentro de un dropdown.
- **Diferencia visual:** el kit expone las 3 opciones siempre visibles como segmented control de alto contraste; la app requiere abrir un dropdown y se ve como formulario genérico.
- **Fix:** render de 3 botones segmented (activo ink-950/blanco) en la fila "Inicio"; el input de fecha condicional (`custom`) ya existe y se mantiene. La "Duración (semanas)" y "Días a copiar" son adds reales de la app (más ricas que el kit) — se mantienen.
- **Verdict:** CONFIRMED — kit L376-381 = segmented 3 botones activo ink-950/blanco; app L553-573 = `<Select>` shadcn, en ambos viewports (cuerpo compartido). El segmented ink-950 es patrón firma del kit (también el day-selector de WorkoutPlanner L27-38), no una riqueza extra de la app. Nit de fix: en la app "Inicio" vive en grid 2-col junto a "Duración" — el segmented puede necesitar fila propia.

## [P1] Empty state sin re-skin EVA DS (sin tile de icono, sin título display, sin CTA contextual)

- **Kit:** eva-app `coach-programs.jsx` L128-135 (config contextual: 4 variantes con icono + título + sub + CTA — "Limpiar filtros", "Ver plantillas", "Crear plantilla") y L219-225 (render: tile 60×60 radius-lg fondo sport-100 icono sport-600 27px, título font-display 800 17px, sub 13.5 muted max-width 252, Button sport md con icono).
- **App:** `WorkoutProgramsClient.tsx:81-145` (`LibraryEmptyState`) — card plana con `text-sm font-medium` + `text-xs text-muted`; sin icono, sin tipografía display, y CTA solo en el caso "0 programas" (los casos búsqueda-vacía / tab-vacío no ofrecen acción).
- **Diferencia visual:** el empty del kit es una pieza diseñada (tile de color, jerarquía display, salida accionable); el de la app es un párrafo gris. Se usa en AMBOS viewports (móvil y desktop reutilizan el mismo componente).
- **Fix:** portar el patrón del kit a `LibraryEmptyState`: tile 60px sport-100 con icono contextual (`search-x`/`calendar-clock`/`layout-template`/`dumbbell`), título `font-display font-extrabold text-[17px]`, y CTA contextual (limpiar búsqueda / ir a Plantillas / crear plantilla).
- **Verdict:** CONFIRMED — código verificado 1:1 con lo descrito (kit L129-135 config 4 variantes + L219-225 render tile/display/CTA; app L91-145 texto plano, CTA solo en el caso 0-programas). Ambos viewports usan el mismo componente (L879-885 móvil, L965-971 desktop) → no hay variante re-skineada oculta. Superficie de first-run de todo coach nuevo → P1 se sostiene.

## [P1] Preview — header genérico "Vista previa" y falta el strip de stats del kit

- **Kit:** eva-app `coach-programs.jsx` · ProgramPreviewSheet L303-331 — header de identidad: tile 52×52 radius-lg con glifo/color por foco + nombre en display 800 19px + badge de estado (Plantilla/Activo/Inactivo) + subline "focus · cliente"; debajo, fila de 3 stat-tiles sunken (`días/sem`, `semanas`, `alumnos` o `sem. actual`) con número `eva-metric` 18; para asignados, barra "Progreso del plan" con %; para plantillas, callout sport-100 "Usada por N alumnos ahora mismo".
- **App:** `apps/web/src/app/coach/workout-programs/components/ProgramPreviewPanel.tsx:412-421` — header con tile 40px de icono **Eye** genérico + eyebrow "Vista previa" + nombre; sin badge de estado, sin cliente, sin stat-tiles, sin barra de progreso ni callout. El cuerpo (detalle día-a-día con secciones/superseries) es MÁS rico que el kit y se mantiene.
- **Diferencia visual:** al abrir un programa, el kit responde primero "qué es y cómo va" (identidad + números grandes); la app abre directo en el detalle con un header anónimo de lupa.
- **Fix:** en el header usar el tile con Dumbbell sport (o glifo del área) + badge de estado + cliente, y agregar el strip de 3 stat-tiles (días con trabajo · semanas · bloques/sem. actual) + barra de progreso para asignados encima del cuerpo detallado.
- **Verdict:** CONFIRMED — app L412-422: tile Eye + eyebrow "Vista previa", sin badge/cliente/stats; el `header` es compartido entre Dialog desktop y Sheet móvil (L446, L461) → genérico en ambos. No es deuda de data: `getProgramStats` (libraryStats.ts:58-91) ya deriva `daysWithWork`/`weeksLabel` y el badge/cliente están en el modelo; solo "alumnos" (plantillas) es la deuda P2 aparte. El glifo por foco es imposible sin `p.focus` (nit conocido) pero el resto del header de identidad es portable hoy.

## [P1] Header móvil invertido: falta el eyebrow uppercase y el título queda más chico que el kit

- **Kit:** eva-app `shared.jsx` · TopBar L52-55 (usado por ProgramasHome L141-143) — subtitle "Biblioteca" como eyebrow ARRIBA del título: uppercase 12/700 tracking 0.08em muted; título "Programas" font-display **900 · 26px** tracking -0.03em.
- **App:** `WorkoutProgramsClient.tsx:734-751` — h1 "Programas" `text-2xl` (24px) `font-extrabold` (800) tracking -0.02em, y "Biblioteca" DEBAJO como `text-sm text-muted` sentence-case.
- **Diferencia visual:** jerarquía invertida (el kit marca sección con eyebrow arriba, patrón que la propia app SÍ respeta en desktop en L906-911) + título un punto más liviano y chico.
- **Fix:** mover "Biblioteca" arriba como eyebrow uppercase 12/700 tracking wide y subir el h1 a 26px/900 tracking -0.03em (espejo del TopBar del kit).
- **Verdict:** CONFIRMED — kit TopBar (shared.jsx L52-55) verificado: subtitle uppercase 12/700 0.08em ARRIBA + título 26px/900 -0.03em; app L734-751 lo invierte (h1 24px/800 -0.02em + "Biblioteca" abajo sentence-case). NO es patrón intencional de la app: la pantalla hermana rediseñada `CoachWarRoom.tsx:316-319` (Alumnos móvil) usa el patrón del kit EXACTO (eyebrow arriba, 26px/900/-0.03em), y el desktop de este mismo archivo también (L904-911) → desviación local, inconsistente con la propia app.

---

## [P2] Contador de tabs-stats móvil en `font-mono` en vez de `.eva-metric`

- **Kit:** `coach-programs.jsx` L180 — número del tab con clase `eva-metric` (font-display 800, tabular, tracking -0.01em), 17px; alto del tab 46px.
- **App:** `WorkoutProgramsClient.tsx:846-853` — número en `font-mono text-[17px] font-bold`; tab `h-11` (44px). La utility `.eva-metric` YA existe en `apps/web/src/app/globals.css:1253`.
- **Fix:** cambiar `font-mono` → `eva-metric` en el número y `h-11` → `h-[46px]`.

## [P2] Tercer stat de tarjeta = "bloques" en vez de "alumnos asignados" (deuda de data)

- **Kit:** desktop `.dt-progcard-meta` (desktop-coach.jsx L236-240) y fila móvil (coach-programs.jsx L253) muestran `users {assigned}` — cuántos alumnos usan la plantilla.
- **App:** `components/ProgramRow.tsx:99-109` y `169-179` — muestra `{blockCount}` con icono Dumbbell/label "bloques". `ProgramListModel` no expone assigned-count por plantilla (`libraryStats.ts:6-45`).
- **Fix (data + UI):** derivar assigned por plantilla (count de programas con `source_template_id = id` activos, o desde `availableClients`) y mostrar `users N` como en el kit; mantener bloques como cuarto stat si se quiere.

## [P2] Menú "Ordenar" sin la opción "Más usados"

- **Kit:** `coach-programs.jsx` L165 — 3 opciones: Recientes / Nombre / Más usados (ordena por `assigned`).
- **App:** `WorkoutProgramsClient.tsx:808` — solo Recientes / Nombre. Misma deuda de data que el finding anterior (sin assigned-count no hay "más usados").
- **Fix:** al exponer assigned-count, agregar la tercera opción.

## [P2] Preview sheet móvil sin drag-handle

- **Kit:** ProgramPreviewSheet L306 — handle 38×4 ink-200 centrado arriba (y el AssignProgramDialog también, L356 — la app SÍ lo tiene en su sheet de asignar, `WorkoutProgramsClient.tsx:1006-1009`).
- **App:** `ProgramPreviewPanel.tsx:457-458` — SheetContent con `showCloseButton` (X) y sin handle.
- **Fix:** agregar el mismo handle del sheet de asignar y evaluar ocultar la X en móvil.

## [P2] Padding horizontal móvil 16px vs 20px del kit

- **Kit:** ProgramasHome L140 — `padding: '0 20px 24px'`.
- **App:** `WorkoutProgramsClient.tsx:674` — `max-md:pl/pr-[max(1rem,safe-area)]` = 16px.
- **Fix:** subir a `max(1.25rem, env(safe-area-inset-*))` si el shell del coach móvil no lo estandariza distinto en otras pantallas (revisar consistencia global antes de tocar).

## [P2] Títulos de Dialog desktop heredan base shadcn uppercase (`text-lg font-bold uppercase`)

- **Kit:** los títulos de sheet/diálogo son font-display 900, 21px, sentence-case, tracking -0.02em (AssignProgramDialog L357).
- **App:** `components/ui/dialog.tsx:126` — base `text-lg font-bold text-foreground uppercase tracking-tighter`; afecta "Asignar programa" (desktop, `WorkoutProgramsClient.tsx:991`) y "Duplicar programa" (L1036). El sheet móvil de asignar SÍ re-skinea a mano su h2 (L1015) → inconsistencia entre viewports de la misma superficie.
- **Fix:** en estos DialogTitle pasar `className="font-display text-[21px] font-black normal-case tracking-[-0.02em] text-strong"` (o ajustar la base de dialog.tsx si es deuda transversal — verificar impacto en otros usos).

## [P2] Lista móvil sin stagger de entrada (evaRowIn 45ms por fila)

- **Kit:** ProgramasHome L232 — cada Card entra con `evaRowIn 320ms` y delay `i*45ms`.
- **App:** `WorkoutProgramsClient.tsx:887-897` — fade único del contenedor (opacity 0.6→1, 200ms).
- **Fix:** stagger por item con framer-motion (`variants` + `staggerChildren: 0.045`), respetando `useReducedMotion` como ya hace.

---

## Observación (no visual, no cuenta)

`components/LibraryHeader.tsx`, `LibraryToolbar.tsx` y `LibraryHeroBackdrop.tsx` no tienen referencias fuera de sí mismos (diseño pre-rediseño) — candidatos a borrar en la limpieza.

## Verificado 1:1 (matchea el kit)

- **Desktop header:** eyebrow "Biblioteca" + h1 30px/900 tracking -0.03 display + acciones Ejercicios/Áreas (secondary) y Nueva plantilla (sport), gap 10px — espejo exacto de `.dt-dash-head`.
- **Chips desktop:** 34px pill, borde default, activo sport-500 con contador opacity 0.7 (`.dt-chip`/`.dt-chip-n`); semántica adaptada a vistas (Todos/Plantillas/En curso) porque `p.focus` no existe en data — nit conocido no accionable.
- **Grid + tarjeta desktop:** `repeat(auto-fill,minmax(240px,1fr))` gap 16; card radius 20 (=`--radius-lg` kit), p16, shadow-sm, hover -2px + shadow-md + eva-press; ico 40px sport-100 radius 14; badge pill 10px/800 uppercase (enriquecido con estado real); nombre display 800 16px; meta con border-t, pt-12, gap-12, iconos 14, `text-subtle` 12/600.
- **Móvil:** botones Ejercicios/Áreas (1.5px border, 13/700), search 42px con clear-circle 24px, botón sort 42px con estado activo sport-100/sport-300, contador de resultados + "Limpiar" sport-600, tabs-stats en sunken p3 con card activa + shadow.
- **Filas móviles:** tile 44px (radius 14) + nombre 15/700 + badge estado (Plantilla sport / Activo success dot / Inactivo neutral) + "· cliente"; asignados con `Sem x/y` mono + barra 5px success/ink-300; plantillas con stats mono `<b>` strong; chevron ink-300 — calco del kit (color/glifo por foco imposible sin `p.focus`).
- **Preview acciones:** CTA sport lg full-width (Asignar a alumnos / Editar plan) + grid de 3 tiles verticales icono+label (Editar|Sincronizar / Duplicar / Eliminar danger) — mismo patrón del kit, con Sincronizar correctamente condicionado a `source_template_id`.
- **Asignar responsive:** bottom-sheet móvil con handle + título display + botonera column-reverse; Dialog en desktop (add reciente c45e3d09). Warning de sobreescritura y confirmaciones (eliminar / sincronizar / duplicar con validación de nombre) presentes como AlertDialog/Dialog.
- **Tokens:** radius-md 14 / radius-card 20 / rounded-pill / rounded-sheet, `text-strong/muted/subtle/body`, `font-display` (Archivo), `eva-press` — todos existentes en `globals.css` y usados correctamente.

## Fix log wave 2 (2026-07-01)

- [P1] Asignar — selector combobox → **FIXED** `WorkoutProgramsClient.tsx`: lista inline en el cuerpo compartido (Dialog+Sheet) con Avatar DS (iniciales, surface-inverse/sport-400, espejo CoachRosterMasterDetail — sin ring de estado: el modelo `Client` del assign no trae pulse), nombre 14/600, badge `Con plan` (warning soft sm), check circular 22px (border-2 border-strong → sport-500 + Check), fila activa border sport-500 + bg sport-100; búsqueda arriba solo con >5 alumnos + clear-circle; bonus microcopy CTA "Selecciona alumnos" (tuteo, consistente con el resto del archivo) + icono ArrowRight. Popover/ChevronsUpDown removidos; `openPopover` state eliminado (close resetea `clientSearch`).
- [P1] Asignar — Inicio Select → **FIXED** `WorkoutProgramsClient.tsx`: segmented 3 botones (Hoy/Fecha/Flexible) flex-1 rounded-control, activo `bg-[var(--ink-950)] text-white` (mismo patrón IsakTrendPanel/BiaTrendPanel), inactivo border 1.5px default; fila propia (nit del verdict) con el date-input condicional debajo; Duración pasa a fila aparte full-width. Import de Select eliminado.
- [P1] Empty state → **FIXED** `WorkoutProgramsClient.tsx`: `LibraryEmptyState` re-hecho config-driven (4 variantes del kit): tile 60px rounded-card sport-100/sport-600 con icono contextual (SearchX/CalendarClock/LayoutTemplate/Dumbbell size 27), título font-display 800 17px, sub 13.5 muted max-w-252, CTA sport contextual (Limpiar búsqueda / Ver plantillas / Crear plantilla) — nuevos props presentacionales `onClearSearch`/`onShowTemplates` cableados a setSearch('')/setFilterType('templates') en ambos viewports.
- [P1] Preview header + stats → **FIXED** `ProgramPreviewPanel.tsx` (+ export de `StatusBadge`/`assignedProgress` en `ProgramRow.tsx`): header de identidad con tile 52px rounded-card sport + nombre display 800 19px + StatusBadge (Plantilla/Activo/Inactivo) + "· cliente"; strip 3 stat-tiles sunken con `eva-metric` 18 (días · semanas · sem. actual|bloques) + barra "Progreso del plan" 7px success/ink-300 con % eva-mono para asignados con start_date. Tercer stat de plantilla = bloques (el "alumnos" del kit sigue siendo la deuda de data P2). Compartido Dialog+Sheet. Label "días" (no "días/sem") porque el dato real es días-con-trabajo (coincide con la fila móvil).
- [P1] Header móvil eyebrow → **FIXED** `WorkoutProgramsClient.tsx`: "Biblioteca" arriba como eyebrow uppercase 12/700 tracking 0.08em muted + h1 26px/900 tracking -0.03em leading 1.1 (calco exacto del patrón CoachWarRoom:316-319).
- [P2] tabs-stats font-mono → **FIXED**: número con `eva-metric text-[17px] leading-[1.1]`, tab `h-11` → `h-[46px]`.
- [P2] Tercer stat tarjeta "alumnos" → **SKIPPED**: deuda de data (derivar assigned-count por plantilla), no es swap de clases.
- [P2] Ordenar "Más usados" → **SKIPPED**: misma deuda de data que el anterior.
- [P2] Preview sheet sin drag-handle → **FIXED** `ProgramPreviewPanel.tsx`: handle 36×4 border-strong (mismo del sheet de asignar) + `showCloseButton={false}` en móvil (patrón del Asignar sheet; overlay/Escape siguen cerrando); selectores muertos de sheet-close removidos de `shellSheetClass`.
- [P2] Padding móvil 16→20px → **SKIPPED**: el propio informe condiciona a revisar consistencia global del shell coach móvil antes de tocar (discutible).
- [P2] Dialog titles uppercase → **FIXED** `WorkoutProgramsClient.tsx`: className override `font-display text-[21px] font-black normal-case tracking-[-0.02em] text-strong` en "Asignar programa" (Dialog desktop) y "Duplicar programa"; no se tocó la base `components/ui/dialog.tsx` (deuda transversal, requiere wiring externo).
- [P2] Stagger evaRowIn por fila → **SKIPPED**: estructural (variants + wrapper motion por item en 2 listas), fuera del presupuesto 1-5 líneas.
