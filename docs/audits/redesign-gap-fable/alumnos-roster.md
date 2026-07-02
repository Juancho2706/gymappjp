# Auditoría de fidelidad visual — Área: Alumnos / Roster (coach)

Fecha: 2026-07-01
Kit fuente: `docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx` (DesktopRoster L23-84, DesktopRosterTable L251-348, DesktopEmpty L9-18) + CSS `.dt-md-*`/`.dt-tbl-*`/`.dt-bulk*` en `docs/design-source/ui_kits/eva-desktop/index.html` (L224-365, L823-846). Mobile: `docs/design-source/ui_kits/eva-app/screens/coach-directory.jsx` (StudentList L176-404, DirRowCard L407-464, DirTable L496-579, DirFiltersMenu L130-173, DirSheet L679-689, ClientActionsSheet L586-676, empties L467-494).
App: `apps/web/src/app/coach/clients/*` + `apps/web/src/components/coach/{CoachTopBar,RosterViewContext,CoachMainWrapper,ClientCardV2}.tsx`.

Resultado global: los DOS patrones estructurales de desktop (maestro-detalle con rail progresivo y tabla densa con bulkbar) están transcritos con altísima fidelidad, y el núcleo del War Room móvil (TopBar, Resumen colapsable, pulse cards, metric chips, row cards) también. Los gaps se concentran en la **periferia móvil**: vista alternativa, action bar, sheets, acciones de fila, empty states y CTA primaria — casi todos componentes que quedaron en el estilo legacy pre-rediseño (uppercase tracking-widest + tokens shadcn).

---

## [P1] Vista alternativa móvil = ClientCardV2 legacy en lugar de la DirTable densa del kit

- **Kit:** `coach-directory.jsx` · `DirTable` L496-579 — el toggle de vista alterna tarjetas ↔ **tabla densa de 9 columnas** (Alumno sticky, Estado, Score, Adh. con barra, Peso con delta 7d, Último con dot, Programa, Días, acciones), scroll horizontal, filas 52px, headers uppercase 10.5/700 ordenables.
- **App:** `ClientsDirectoryClient.tsx:290-335` + `components/coach/ClientCardV2.tsx` — el segundo estado del toggle (`view='grid'`) renderiza el **ClientCardV2 legacy**: tarjetas grandes con sparklines recharts, ~20 usos de `uppercase tracking-widest` 8-10px, botón WhatsApp verde crudo `#25D366`, botones `rounded-control` con texto black uppercase — estética pre-rediseño, no el kit.
- **Diferencia visual:** el usuario que toca el icono de vista en móvil cae en una pantalla que no pertenece al DS nuevo; además la tabla densa móvil del kit no existe en ninguna parte.
- **Fix:** transcribir `DirTable` (9 cols, primera columna sticky, `min-content` + scroll-x) como la vista `table` del toggle móvil y retirar `ClientCardV2` del flujo (o re-skinearlo si se decide conservarlo como vista extra).
- **Verdict:** CONFIRMED — `ClientsDirectoryClient.tsx:290-335` (dentro del wrapper `md:hidden`, línea 239) renderiza `ClientCardV2` cuando `view='grid'`; `ClientCardV2.tsx` tiene 20+ usos de `uppercase tracking-widest`, sparklines recharts y WhatsApp `#25D366` (L510). La DirTable densa móvil del kit (L496-579) no existe en ningún branch: existe un `ClientsDirectoryTable.tsx` de 9 columnas pero está huérfano (cero imports en `src/`) y no está cableado al toggle. No es decisión documentada — pantalla entera legacy a un tap.

## [P1] Action bar móvil sin re-skin: triggers con texto uppercase + contenedor glass vs botones cuadrados icon-only del kit

- **Kit:** `coach-directory.jsx` L321-348 + `dirBarBtn` L581-583 — fila SIN contenedor: Input DS (48px) + 3 botones **cuadrados 48×48 icon-only** (`sliders-horizontal` con **badge contador** sport-500 flotante, `arrow-up-down`, toggle de vista de un solo icono), borde 1.5px `border-default`, `radius-control`, estado activo = relleno `text-strong` con icono blanco.
- **App:** `DirectoryActionBar.tsx:180-215, 275-328` — contenedor `sticky rounded-card border bg-surface-app/80 backdrop-blur-xl`; triggers = `buttonVariants(secondary)` h-12 **con texto "FILTROS"/label de orden en uppercase 10px font-black tracking-widest** (tipografía legacy); vista = `SegmentedControl` de 2 iconos; **sin badge de conteo de filtros activos** en el trigger.
- **Diferencia visual:** barra más ancha, ruidosa y de tipografía vieja; el kit es una fila limpia de iconos cuadrados con badge.
- **Fix:** replicar `dirBarBtn` (48px icon-only, borde 1.5, activo relleno ink), badge de conteo en Filtros, quitar el wrapper glass/card.
- **Verdict:** CONFIRMED — verificado en `DirectoryActionBar.tsx`: wrapper `sticky ... rounded-card border border-subtle bg-surface-app/80 backdrop-blur-xl` (L188), `triggerClass` con `text-[10px] font-black tracking-widest uppercase` (L182), trigger "Filtros" con texto (L209-212), SegmentedControl de 2 iconos (L304-327), sin badge de conteo. El kit (`dirBarBtn` L581-583 + L327-330) es fila sin contenedor con botones 48×48 icon-only y badge sport-500. Diferencia real y visible en `<760`.

## [P1] Filtros y Orden abren DropdownMenu shadcn en móvil en lugar del bottom-sheet DirSheet del kit

- **Kit:** `DirFiltersMenu` L130-173 + `DirSheet` L679-689 + sheet de orden L336-345 — bottom sheet con handle (38×4 ink-200), esquinas `radius-sheet` (28px), título display 800 18px + botón X circular, grupos Estado/Riesgo/Programa con filas de check `sport-600` y fondo `surface-sunken` en la opción activa.
- **App:** `DirectoryActionBar.tsx:208-302` — `DropdownMenu` shadcn anclado al trigger, labels 10px uppercase; sin indicación de check en la opción activa de filtros (solo el sort resalta con `bg-sport-500/10`).
- **Diferencia visual:** popover flotante pequeño vs sheet de pantalla del kit; patrón ya migrado en Nutrición (filter-sheet del quick-win P1 #2) — el directorio quedó atrás.
- **Fix:** reutilizar el patrón bottom-sheet de Nutrición para Filtros/Orden en `<760`, con check sport-600 en la opción activa.
- **Verdict:** CONFIRMED — `DirectoryActionBar.tsx:208-302` usa `DropdownMenu` shadcn (popover anclado) para Filtros y Orden dentro de la región `md:hidden`; labels `text-[10px] font-black uppercase tracking-widest` (L218/241/259/288); los items de filtro no marcan la opción activa (solo sort resalta con `bg-sport-500/10`, L295). El kit usa `DirSheet` bottom-sheet (L679-689) con handle 38×4, radius-sheet, título display 18/800 + X circular y check sport-600 en fila activa (DirFiltersMenu L137-141). Real y visible.

## [P1] Acciones de fila: 4 botones inline + AlertDialogs con tokens legacy vs ellipsis → ClientActionsSheet del kit

- **Kit:** `DirRowCard` L459 (un solo `IconButton ghost ellipsis-vertical`) → `ClientActionsSheet` L586-676: sheet con header avatar+nombre y 8 acciones tonalizadas (ficha, WhatsApp success-600, asignar sport-600, editar, reset clave info-600, pausar warning-600, archivar ink-600, eliminar danger-600), confirmaciones `DirConfirmBody` (icono 48px tonal, título display 19, botones DS, confirm-by-name para eliminar). Además swipe izquierda/derecha = WhatsApp/Archivar (L412-440).
- **App:** `DirRowCard.tsx:166-197` — **4 controles inline** por fila: pill "WA" verde crudo `#25D366` uppercase 10px, lápiz, `ArchiveClientButton`, `DeleteClientButton`. Los diálogos (`ArchiveClientButton.tsx:41-79`, `DeleteClientButton.tsx:37-60`) usan tokens **legacy shadcn**: `text-muted-foreground`, `hover:text-amber-600 bg-amber-500/10`, `bg-card border-border rounded-2xl`, `bg-amber-500`, `rounded-xl` — nada del DS (`warning-*`, `danger-*`, `radius-card`, tipografía display). Sin swipe. Eliminar no exige escribir el nombre.
- **Diferencia visual:** filas más cargadas que el kit y diálogos que se ven de otra app (ámbar Tailwind + radios shadcn).
- **Fix:** consolidar en un IconButton ellipsis → sheet de acciones DS; retokenizar los AlertDialogs (warning-100/700, danger-*, radius-card, font-display) o migrarlos a `DirConfirmBody`-like.
- **Verdict:** CONFIRMED — `DirRowCard.tsx:166-197`: 4 controles inline verificados (WA `bg-[#25D366] text-[10px] font-black uppercase` L177, Pencil L183-190, Archive, Delete). `ArchiveClientButton.tsx:41-78` usa `text-muted-foreground / hover:text-amber-600 bg-amber-500/10 / bg-card border-border rounded-2xl / bg-amber-500 / rounded-xl` (tokens Tailwind/shadcn crudos, cero rampa `warning-*` del DS); `DeleteClientButton.tsx` ídem con `destructive` y sin confirm-by-name (kit L617 `confirmType: true`). Sin swipe (kit L412-440) ni ellipsis→ClientActionsSheet (kit L459 + L586-676). Real y visible.

## [P1] CTA primaria móvil "Nuevo alumno": falta el FAB pill sticky del kit; falta "Importar" en el header

- **Kit:** L391-396 — botón pill sticky bottom-right (50px, sport-500, icono user-plus + label, shadow-lg) en la zona del pulgar, sobre el TabBar; el trailing del TopBar (L273-278) = copiar portal + **Importar** (`file-up`).
- **App:** `CoachWarRoom.tsx:323-340` — crear alumno es un `IconButton` sport pequeño en el header; **no hay FAB sticky** y **no hay entrada a importar** desde Alumnos (el wizard `/coach/clients/import` solo se alcanza desde Settings desktop — `CoachSettingsDesktop.tsx`).
- **Fix:** FAB pill sticky (posición y estilos del kit) para crear; devolver el icono `file-up` al trailing del header móvil.
- **Verdict:** CONFIRMED — `CoachWarRoom.tsx:323-340`: trailing móvil = copiar portal + `IconButton sport` UserPlus; cero FAB sticky en `page.tsx`/`CoachClientsShell`/`ClientsDirectoryClient` (el único sticky-bottom del área es `[clientId]/ProfileFloatingActions`, otra pantalla). Kit L391-396 (FAB pill 50px sport-500 sticky) y L273-278 (trailing con `file-up`) verificados. Agravante encontrado: `DashboardFab.tsx:22` ("Importar") rutea a `/coach/clients` donde NO hay entrada de importar → dead-end; el wizard solo se linkea desde `CoachSettingsDesktop.tsx:57`. El patrón FAB ya existe en Dashboard móvil, así que no es decisión anti-FAB.

## [P1] Empty states en estilo legacy (uppercase) y sin las CTAs del kit

- **Kit:** `DirEmptyNoStudents` L467-480 — tile 72px `radius-lg` sport-100 con icono users, h2 display 900 22px "Sumá tu primer alumno" (SIN uppercase), 2 botones apilados full-width: "Crear alumno" (sport) + "Importar cartera" (secondary). `DirEmptyNoResults` L484-493 — card `border dashed` sobre sunken, círculo 52px, título display 800 16 y botón "Limpiar filtros" relleno ink.
- **App:** `ClientsDirectoryEmpty.tsx:32-51` — Lottie + h3 `uppercase tracking-tighter` "Tu equipo te espera" + 1 botón `uppercase tracking-widest`; **sin CTA de importar**. Sin-resultados (`ClientsDirectoryClient.tsx:257-272`) — Card normal, h3 uppercase, **sin botón "Limpiar filtros"**.
- **Diferencia visual:** el uppercase condensado es la voz tipográfica vieja de EVA; el kit usa display 800/900 con tracking negativo, nunca uppercase. Falta la acción de recuperación (limpiar/importar) en ambos.
- **Fix:** retipografiar ambos empties al patrón del kit y agregar "Importar cartera" + "Limpiar filtros".
- **Verdict:** CONFIRMED — `ClientsDirectoryEmpty.tsx:36-50`: h3 `font-display font-black uppercase tracking-tighter` "Tu equipo te espera" + 1 solo Button `uppercase tracking-widest`, sin importar (kit L467-480: display 900/22 SIN uppercase + 2 CTAs apiladas). Sin-resultados en `ClientsDirectoryClient.tsx:256-272`: h3 uppercase, sin botón "Limpiar filtros" (kit L484-493 lo tiene relleno ink). Los shorthands `text-strong`/`text-muted` del DS están, pero la voz tipográfica (uppercase condensado) es la legacy — real y visible.

## [P1] Falta la entrada "Herramientas" (módulos) sobre el directorio móvil

- **Kit:** L284-294 — card tocable arriba del Resumen: tile 38px sport-100 `layout-grid`, "Herramientas" 14/700 + sub "Cardio · Movimiento · Composición", chevron.
- **App:** no existe en `/coach/clients` móvil; los módulos solo aparecen como items de nav con entitlement (`coach-nav.ts:72-73`, empujados al final para el bottom bar). El copy de `/coach/subscription/page.tsx:780` aún promete "usalo desde Alumnos › Herramientas" (stale respecto de la UI real).
- **Fix:** card Herramientas condicional (algún módulo ON) sobre el Resumen móvil, ruteando al hub/módulos; o corregir el copy de subscription.
- **Verdict:** DOWNGRADED→P2 — el gap es real (la card L284-294 no existe en `/coach/clients` móvil y el copy de `subscription/page.tsx:780` "Alumnos › Herramientas" está stale), pero: (a) el kit renderiza la card CONDICIONAL a `onOpenModules &&` — no es estructura obligatoria de la pantalla; (b) el acceso a módulos SÍ existe en móvil vía bottom bar (`coach-nav.ts:72-73`, entitlement-gated al final del scroll) — el mismo razonamiento con que este informe clasificó P2 el caso espejo del rail desktop ("el acceso a módulos existe en el sidebar"). Lo load-bearing que queda es un fix de copy, no un gap visual P1.

## [P2] Rail desktop: el botón `layout-grid` se re-propuso como "Vista tabla" (kit: Herramientas)

- **Kit:** `desktop-coach.jsx:49` — acciones default del header del rail = `layout-grid`→onModules ("Herramientas") + `plus` primario.
- **App:** `CoachRosterMasterDetail.tsx:170-189` — mismo par de botones pero `layout-grid` cambia a la vista tabla, duplicando el toggle que ya vive en el topbar (`.dt-viewtoggle`). Semántica distinta con el mismo icono; menor porque el kit permite `actions` custom y el acceso a módulos existe en el sidebar.

## [P2] Falta la línea de conteo de resultados y el "Limpiar" global de chips (móvil)

- **Kit:** L358-365 — bajo los chips: "N alumnos · {orden activo}" (12px muted) y botón texto "Limpiar" subrayado al final de la fila de chips.
- **App:** `DirectoryActionBar.tsx:331-337` — chips removibles OK (pill ink-950 verbatim) pero sin "Limpiar" global; no se muestra el conteo de resultados en móvil.

## [P2] DirMetricChip "Activos" no es botón-filtro

- **Kit:** L313 — chip Activos filtra `status='active'` al tocar (selected fill).
- **App:** `CoachWarRoom.tsx:406-410` — chip sin `onClick` (Total y Nutri. sí filtran). Nit funcional-visual (no muestra estado seleccionado nunca).

## [P2] Nits menores

- Empty del detalle desktop: app usa tile cuadrado `rounded-card` con borde (`CoachRosterMasterDetail.tsx:314`) vs círculo 64px sin borde del kit (`.dt-empty-ico`).
- Padding horizontal móvil de la página: `px-4` (16px, `CoachMainWrapper.tsx:49`) vs `0 20px` del kit (StudentList L272).
- Placeholder búsqueda móvil "Buscar alumno... (⌘K)" + kbd ⌘K: afordancia desktop dentro de la vista móvil (kit: "Buscar alumno…" limpio).

---

## Verificado 1:1 (sin gap)

- **Maestro-detalle desktop** (`CoachRosterMasterDetail.tsx` vs `.dt-md-*`): anchos progresivos del rail 340→280→240 con sub oculto en angosto (breakpoints 1000/860 espejados con `min-[…]`), header del rail (título display 18/800, count pill sunken, botones 30px radius-sm=10px, primario `--cta-fill`), search 36px sunken con focus sport-500, filas p-10/gap-11 con barra activa sport-500 + `bg-sport-100`, avatar DS con anillo de estado, StatusBadge soft verbatim, adherencia mono con rojo `<60`, orden riesgo-first + adherencia + nombre, auto-select del primero (solo desktop real), textos del empty verbatim.
- **Tabla desktop** (`DesktopRosterTable.tsx` vs `.dt-tbl-*`): barra búsqueda (max 340) + "N alumnos", headers sticky uppercase 11/800 con chevron de orden, checkboxes `accent-sport-500` (16px, col 44px), fila = avatar+programa / StatusBadge / barra 72×6 + mono 12.5 (danger `<60`) / "Sem N" mono muted / última sesión muted / chevron ink-300, active `bg-sport-100`, navegación teclado role=grid ↑/↓/Enter, **bulkbar ink-950** con las 3 acciones (34px, `white/12`) + botón limpiar — todo con acciones reales (CSV/WA/asignar).
- **Toggle Tabla/Ficha del topbar** (`CoachTopBar.tsx:74-111`): transcripción exacta de `.dt-viewtoggle` (container sunken p-3px radius-md, botones 30px 13/700, activo card+sport-600+shadow-xs), visible solo con `/coach/clients` montado.
- **Mobile War Room** (`CoachWarRoom.tsx`): TopBar verbatim (subtítulo uppercase 12/700 + h1 26/900 -0.03em), Resumen · hoy colapsable con persistencia `eva.dir.resumenOpen` y resumen inline al colapsar, `DirPulseCard` y `DirMetricChip` transcritos (30px metric, selected fill, hints exactos), grilla de 4 chips, `DirBanner` fiel al componente del kit (los banners son riqueza extra: el kit los define pero no los monta).
- **DirRowCard móvil** (`DirRowCard.tsx`): ring 50px stroke 5 con inicial display, dot de última actividad 13px, badge de severidad (Riesgo/Atención/On track) con iconos y tonos exactos, meta mono + separadores + ember nutrición + pill de estado no-activo.
- **Lógica/estructura compartida:** filtros Estado/Riesgo/Programa con badge de archivados, 6 opciones de orden 1:1 con `SORTS` del kit, chips activos pill ink-950, severidad/status/lastDot con los mismos umbrales y colores, exclusión de archivados en vistas default.
- **Tokens:** `--radius-control`=14px=`--radius-md` del kit, `--radius-sm` 10px en hd-btns, Input DS h-12 borde 1.5px, `--track`, `--cta-fill`, rampas info/ember presentes en `globals.css`.

---

## Fix log wave 2 (2026-07-01)

Estado al llegar: un intento previo abortado había ya escrito casi todo el scope. Esta wave verificó cableado (imports + render, no huérfanos), tokens (todos resuelven en `globals.css`), y tipos (`DirectoryPulseRow` expone `currentWeight`/`weightDelta7d`/`planDaysRemaining`/`nutritionPercentage`), corrigiendo lo que faltara. Resultado: los 6 P1 quedaron implementados y cableados; no hubo estado roto ni a-medio que corregir.

- **[P1] Vista alternativa móvil → DirTable densa (9 cols)** → FIXED `DirTableMobile.tsx` (nuevo, transcripción DirTable L496-579: Alumno sticky + 8 cols, scroll-x, filas 52px, headers uppercase 10.5/700 ordenables) cableado en `ClientsDirectoryClient.tsx:281-293` (`view==='table'`). `ClientCardV2` retirado del flujo (cero render en `src/`; sigue exportado pero muerto). El `ClientsDirectoryTable.tsx` legacy queda huérfano (no se toca).
- **[P1] Action bar móvil botones cuadrados 48px + badge** → FIXED `DirectoryActionBar.tsx`: `BarButton` `size-12` borde 1.5, activo relleno `text-strong`; badge sport-500 de conteo en Filtros; wrapper glass/card eliminado (fila `flex gap-2` sin contenedor); toggle de vista de 1 icono.
- **[P1] Filtros/Orden → bottom-sheet** → FIXED `DirectoryActionBar.tsx`: dos `Sheet side="bottom"` `rounded-t-sheet`, `SheetCheckRow` con check sport-600 + `bg-surface-sunken` en la fila activa (patrón filter-sheet de Nutrición), footer "Ver resultados".
- **[P1] Acciones de fila → ellipsis → ClientActionsSheet** → FIXED `DirRowCard.tsx` (un solo `IconButton ghost` MoreVertical → `onActions`) + `DirTableMobile.tsx` (col acciones ellipsis) → `ClientActionsSheet.tsx` (nuevo): sheet DS con header avatar+nombre, 7 acciones tonalizadas (ficha/WhatsApp success-600/editar/reset info-600/pausar warning-600/archivar ink-600/eliminar danger-600), `ConfirmBody` DS (icono 48px tonal, título display 19, confirm-by-name en eliminar), reusa los server actions existentes. Pill WhatsApp `#25D366` cruda eliminada. `ArchiveClientButton.tsx`/`DeleteClientButton.tsx` retokenizados a rampa `warning-*`/`danger-*` + `radius-card`/`radius-control`/`font-display` (quedan solo referenciados por el `ClientsDirectoryTable` huérfano).
- **[P1] FAB pill sticky + Importar en header** → FIXED FAB pill sticky (`ClientsDirectoryClient.tsx:310-318`: 50px sport-500, UserPlus, `shadow-lg`, zona del pulgar sobre el TabBar) + icono `FileUp` "Importar" en el trailing del header móvil (`CoachWarRoom.tsx:337-343` → `/coach/clients/import`). Empty sin-resultados con CTA "Limpiar filtros" (`ClientsDirectoryClient.tsx:262-280`). Con esto `/coach/clients` ya tiene entrada de importar (el dead-end de `DashboardFab` queda resuelto sin tocar ese archivo externo).
- **[P1] Empty states re-skin + Herramientas card** → FIXED `ClientsDirectoryEmpty.tsx` (tile 72px sport-100, h2 display 900/22 sin uppercase, CTAs apiladas Crear + Importar cartera). Card "Herramientas" → `/coach/tools` sobre el Resumen móvil (`CoachWarRoom.tsx:347-362`, tile 38px sport-100 layout-grid + sub + chevron).
- **[DOWNGRADED→P2] Herramientas** → FIXED en su parte visual (card montada, siempre visible → `/coach/tools`; gatearla por entitlement exigiría data nueva, fuera de presentación-only). El copy stale de `subscription/page.tsx:780` queda como **requiere wiring externo** (fuera del área; además hoy ya existe "Alumnos › Herramientas").
- **[P2] Conteo de resultados + Limpiar global (móvil)** → FIXED `DirectoryActionBar.tsx`: línea "N alumnos · {orden}" (L257-263) + botón "Limpiar" al final de los chips (L247-253).
- **[P2] Empty del detalle desktop (círculo 64px)** → FIXED (ya aplicado por el intento previo): `CoachRosterMasterDetail.tsx:314` usa `h-16 w-16 rounded-full bg-surface-sunken` sin borde.
- **[P2] DirMetricChip "Activos" como filtro** → SKIPPED: estructural — exige elevar `statusFilter` al shell y pasarlo a `CoachWarRoom` (hoy solo recibe el risk-filter); no es swap barato de clases.
- **[P2] Rail desktop `layout-grid` = Vista tabla vs Herramientas** → SKIPPED: cambio semántico/discutible (el kit permite `actions` custom y el acceso a módulos ya vive en el sidebar).
- **[P2] nits px-4 vs 20px (`CoachMainWrapper.tsx`) y placeholder ⌘K (`CoachTopBar.tsx`)** → SKIPPED: archivos fuera del área (**requiere wiring externo**); los placeholders de búsqueda dentro del área ya son "Buscar alumno…" limpios.
