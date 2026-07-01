# Auditoría de fidelidad visual — Builder (coach) · 2026-07-01

Kit fuente:
- Mobile (<760, 1:1 verbatim): `docs/design-source/ui_kits/eva-app/screens/coach-builder.jsx` + `coach-builder-extras.jsx` (+ CSS/data en `eva-app/index.html` y `eva-app/data.js`).
- Desktop (≥760, solo tokens/estilo — multi-día de la app es decisión CEO, NO gap): `docs/design-source/ui_kits/eva-desktop/desktop-builder.jsx` + CSS `.dt-*` en `eva-desktop/index.html`.

App: `apps/web/src/app/coach/builder/[clientId]/` (WeeklyPlanBuilder + DayColumn + ExerciseBlock + BlockEditSheet + ProgramConfigSheet + DraggableExerciseCatalog).

Nota metodológica: los nombres shadcn (`bg-muted`, `border-border`, `text-muted-foreground`, `bg-card`, `bg-secondary`…) están **remapeados por valor** a los aliases EVA DS en `globals.css:200-320` (`--muted: var(--surface-sunken)`, `--border: var(--border-subtle)`, etc.), así que usar esos nombres NO es gap de color por sí mismo. Los gaps reales de abajo son de tipografía, patrón/estructura y colores raw de Tailwind que NO pasan por el remapeo.

---

## [P0] Mobile: falta la save-bar inferior fija + FAB de agregar del kit (jerarquía del CTA primario distinta)

- Kit: `coach-builder.jsx:317-325` — FAB circular 56px `--sport-500` con `--glow-sport` (abre catálogo) + save bar fija abajo (`position:fixed bottom:0`, blur `color-mix(surface-card 88%)`, borde superior, `Button variant="sport" size="lg" fullWidth` "Guardar y enviar"/"Guardar plantilla" con check).
- App: `WeeklyPlanBuilder.tsx:1282-1292` — Guardar es un **ícono de disquete 40px en el header superior** (`hidden md:inline` para el label); el borde inferior mobile lo ocupa el handle del sheet de catálogo (`WeeklyPlanBuilder.tsx:1568-1594`, barra "Añadir ejercicio" 12vh). El FAB verde solo existe en Modo Simple (`:1703-1712`).
- Diferencia visual: en el kit el CTA primario domina el pie de pantalla en todo momento y el "+" es un FAB flotante; en la app el CTA primario es un ícono secundario arriba a la derecha y el pie es un drawer-handle. Jerarquía de página distinta en la superficie declarada verbatim.
- Fix: en `<md` renderizar save-bar fija (blur + `pb-safe`) con botón full-width `bg-primary` ("Guardar y enviar" / "Guardar plantilla"), y FAB `bg-primary` con glow que abra el catálogo a 80vh (reemplaza el handle colapsado de 12vh); subir el stack de FABs existente encima de la barra.
- **Verdict:** CONFIRMED — verificado en ambas fuentes: kit `coach-builder.jsx:317-325` (FAB sport 56px + save bar fixed bottom con blur y Button sport lg fullWidth) vs app donde Guardar es ícono `h-10 w-10` en el header con label `hidden md:inline` (`WeeklyPlanBuilder.tsx:1282-1292`) y el pie mobile es el handle del sheet de catálogo (`:1568-1594`); no existe ninguna save-bar en todo el archivo (grep `fixed bottom-0` solo matchea el sheet de catálogo :1569/:1660) y el FAB verde es solo Modo Simple (`:1703-1712`). La propia app lo autodocumenta en el tour (`:752` "En móvil, Guardar se muestra como ícono de disquete arriba a la derecha"). No está en la lista de decisiones CEO intencionales; superficie <760 declarada verbatim → inversión real de jerarquía del CTA primario. P0 sostenido.

## [P1] Tipografía del builder no matchea el kit — uppercase-tracking micro en vez de display sentence-case

- Kit desktop: `.dt-build-title-input` 18px `--font-display` 800 sentence case editable (`eva-desktop/index.html:448`), `.dt-day-title` 20px display 800 (`:417`), `.dt-ex-name > span` 13.5px/700 sentence case (`:432`), botones `.dt-build-cfg`/`.dt-day-rest` 13.5px/12.5px weight 700 sentence case (`:451`, `:420`). Kit mobile: nombre de bloque 14.5px/700 sentence case (`coach-builder.jsx:276`), título del día 22px display 900 (`:228`).
- App: h1 desktop `text-sm font-display uppercase tracking-[0.2em]` estático (`WeeklyPlanBuilder.tsx:1028`), subtítulo `uppercase tracking-widest` (`:1043`); botones toolbar `text-xs font-bold uppercase tracking-widest` (`:1095,1107,1132,1144`); GUARDAR `tracking-[0.2em]` (`:1287`); nombre de bloque `text-xs uppercase tracking-widest` (`ExerciseBlock.tsx:160`); título del día input `text-[10px] uppercase tracking-widest` en caja sunken (`DayColumn.tsx:224`); labels del sheet `text-[10px] tracking-[0.2em]` (`BlockEditSheet.tsx:35`).
- Diferencia visual: la app conserva el estilo "shouty" legacy (todo mayúsculas microscópicas con tracking ancho); el kit es Archivo display bold sentence case con jerarquía por tamaño. Es la divergencia visual más grande del builder en ambos viewports.
- Fix: re-tipografiar top bar (nombre = input display 18px editable inline en desktop), título del día (display 20-22px borderless), nombres de bloque (13.5-14.5px/700 sentence case) y botones de toolbar (13.5px/700 sentence case, altura 38px, `border-default` + `surface-card`).
- **Verdict:** CONFIRMED — todas las citas verificadas 1:1: kit desktop `eva-desktop/index.html:448` (`.dt-build-title-input` 18px display 800), `:417` (`.dt-day-title` 20px), `:430` (`.dt-ex-name` 13.5px/700), `:451`/`:420` (botones 13.5/12.5px 700); kit mobile `coach-builder.jsx:276` (nombre bloque 14.5px/700 sentence case) y `:228` (título día display 900 22px). App verificada: `WeeklyPlanBuilder.tsx:1028` (`text-sm uppercase tracking-[0.2em]`), `:1043`, `:1095/1107/1132/1144` (uppercase tracking-widest), `:1287` (tracking-[0.2em]), `ExerciseBlock.tsx:160` (`text-xs uppercase tracking-widest`), `DayColumn.tsx:224` (`text-[10px] uppercase tracking-widest` boxed), `BlockEditSheet.tsx:35` (FIELD_LABEL_CLASS `text-[10px] tracking-[0.2em]`). No hay @utility ni remapeo que convierta esas clases; tipografía no figura en las decisiones CEO intencionales. Aplica a ambos viewports (desktop = "solo tokens/estilo" e incluye tipografía).

## [P1] Colores de estado raw de Tailwind en vez de los tokens de status del DS

- Kit: incompleto = `--danger-100`/`--danger-600` (`coach-builder.jsx:281`); "Modif." = Badge tone **warning** (`:278`; desktop `.dt-ex-ovr[data-on] color: --warning-600`, `eva-desktop/index.html` builder block); progresión = `--sport-600` (`:283`; `.dt-chip-prog`); historial "Última vez" = `--success-100/700` (`:550-553`); descanso = neutro ink/sunken (`:243-249`, `.dt-weekday[data-rest] opacity .65`).
- App: INCOMPLETO `orange-500` (`ExerciseBlock.tsx:233`); Modif. `sky-500` (`ExerciseBlock.tsx:413`); progresión `emerald-500` (`ExerciseBlock.tsx:260`); historial `emerald-500/400` (`BlockEditSheet.tsx:535-537`); descanso `indigo-400/500` en chip, toggle, empty-state y preview (`DayColumn.tsx:149,200,307-312`, `ProgramPreviewDialog.tsx:102,148-149`); asteriscos `red-500` (`BlockEditSheet.tsx:581,596,823`); contadores `amber-500` (`BlockEditSheet.tsx:430`, `ProgramConfigForm.tsx:116,374`); Sync plantilla `--aqua-600` (`WeeklyPlanBuilder.tsx:1261` — aqua sí es token DS, ok).
- Diferencia visual: naranja/celeste/índigo/esmeralda genéricos donde el kit usa el ramp danger (rosa-rojo #F4365A), warning (ámbar #F5A524), sport (azul) y success (#1FB877); además esos raw colors no flipean con el theme dark del DS.
- Fix: mapear a `var(--danger-*)`, `var(--warning-*)`, `text-primary`/sport, `var(--success-*)` y neutros ink para descanso (ya expuestos en `globals.css` @theme).
- **Verdict:** CONFIRMED — cada cita verificada en código: `ExerciseBlock.tsx:233` (orange-500 INCOMPLETO), `:413` (sky-500 Modif.), `:260` (emerald-500 progresión), `BlockEditSheet.tsx:535-537` (emerald historial), `:581/:596/:823` (red-500), `:430` (amber-500), `DayColumn.tsx:149/200-201/307-312` (indigo descanso), `ProgramPreviewDialog.tsx:102/148-149` (indigo), `ProgramConfigForm.tsx:116/374` (amber). Kit verificado: danger-100/600 (`coach-builder.jsx:281`), Badge warning (`:278`, `.dt-ex-ovr[data-on]` warning-600 en `eva-desktop/index.html:519`), sport-600 (`:283`, `.dt-chip-prog:482`), success-100/700 (`:550-553`), descanso neutro sunken (`:243-249`). Chequeo adversarial clave: `globals.css` remapea los alias shadcn (`--muted`, `--border`…) pero NO redefine las escalas raw de Tailwind (cero matches de `--color-orange/sky/emerald/indigo/red/amber-*`) → los raw colors son reales y no flipean con el dark del DS (los ramps danger/warning/success sí flipean, `globals.css:612-626`).

## [P1] BlockEditSheet en mobile es un panel lateral derecho, no el bottom-sheet del kit

- Kit: `coach-builder.jsx:496-668` — bottom sheet (`sheetOverlay/sheetBody`: overlay `--surface-overlay`, top corners `--radius-sheet` 28px, grabber, `maxHeight 92%`), header con tile ink-950 + nombre display 18, steppers circulares 44px para Series con numeral `eva-metric` 24px, CTA final `Button sport lg fullWidth` "Guardar bloque"/"Datos incompletos".
- App: `BlockEditSheet.tsx:502` — `SheetContent side="right"` full-width en mobile (desliza desde la derecha, sin grabber ni radius-sheet); Series = input `ClampedIntInput` (`:583`); CTA "SINCRONIZAR BLOQUE"/"DATA INCOMPLETA" uppercase con glow (`:1021-1033`).
- Diferencia visual: en <760 el kit es un sheet inferior con anatomía táctil (grabber, steppers grandes, CTA sport sentence case); la app muestra un panel desktop a pantalla completa. En desktop el panel lateral SÍ matchea el kit (`.dt-build-edit`), el gap es solo mobile + copy del CTA.
- Fix: `side={isMobile ? 'bottom' : 'right'}` (patrón ya usado por ProgramConfigSheet), grabber + `rounded-t-[28px]`, steppers para Series en mobile, y copy "Guardar bloque"/"Datos incompletos".
- **Verdict:** CONFIRMED — `BlockEditSheet.tsx:502` es `SheetContent side="right"` fijo con `w-full max-w-full` (en <760 desliza desde la derecha a pantalla completa, sin grabber); no hay rama responsive. Kit verificado: `coach-builder.jsx:525-535` bottom sheet (sheetOverlay/sheetBody radius-sheet, grabber, maxHeight 92%, tile ink-950 + nombre display 18) y steppers 44px con numeral `eva-metric` 24 (`:517-523`). El chequeo adversarial refuerza el finding: `ProgramConfigSheet.tsx:19` ya usa exactamente `side={isMobile ? 'bottom' : 'right'}` con grabber — el patrón existe en el componente hermano y BlockEditSheet no lo adoptó. Correcto también que en desktop el panel derecho matchea `.dt-build-edit` (`eva-desktop/index.html:484`).

## [P1] Superficies secundarias mobile como Dialog centrado / DropdownMenu en vez de bottom-sheets

- Kit: overflow "Más" (`coach-builder.jsx:337-349`, sheet con filas ícono-tile 38px), Balance (`:787-845`), Vista previa (`:855-895`), Plantillas (`:903-933`), Print (`coach-builder-extras.jsx:54-79`), copiar día (`:352-360`) — TODOS bottom-sheets con grabber sobre `--surface-overlay`.
- App: overflow = `DropdownMenu` popover (`WeeklyPlanBuilder.tsx:1178-1212`); Balance/Preview/Plantillas/Assign/Print = `Dialog` centrado (`MuscleBalancePanel.tsx:67`, `ProgramPreviewDialog.tsx`, `TemplatePickerDialog.tsx`, `AssignToClientsDialog.tsx`); copiar día = `Popover` (`DayColumn.tsx:154-190`).
- Diferencia visual: en <760 los modales centrados y el dropdown rompen el lenguaje de sheets inferiores del kit. En desktop los Dialog centrados SÍ matchean el kit (`.dt-modal`) — el gap es solo mobile.
- Fix: en <760 renderizar estas superficies como bottom-sheet (Sheet side=bottom con grabber + radius-sheet); el menú overflow con filas ícono-en-tile + label 15px como el kit.
- **Verdict:** CONFIRMED — verificado que `components/ui/dialog.tsx:56` centra el DialogContent (`top-1/2 left-1/2 -translate-x/y-1/2`) en TODOS los viewports, sin adaptación mobile-a-sheet; lo usan MuscleBalancePanel (`:67`), ProgramPreviewDialog (`:81`), TemplatePickerDialog (`:181`) y AssignToClientsDialog (`:89`). Overflow = DropdownMenu popover (`WeeklyPlanBuilder.tsx:1178-1212`) y copiar día = Popover (`DayColumn.tsx:154-190`), ambos verificados. Kit verificado: overflow (`coach-builder.jsx:337-349`), copy-day (`:352-361`) y Balance (`:787-795`) usan sheetOverlay/sheetBody con grabber (mismo patrón Preview/Templates/Print). Correcta la acotación de que en desktop los Dialog centrados sí matchean `.dt-modal` — gap solo <760.

## [P1] Día mobile conserva el chrome de card desktop en vez del lienzo plano del kit

- Kit: `coach-builder.jsx:222-315` — el día vive directo sobre `--surface-app`: label del día 11px uppercase + input título display 22, IconButtons descanso/copiar a la derecha, stats "N ej · M series" + dots musculares; los bloques agrupados por área con header dot-color 9px + nombre uppercase 11px + conteo (sin bordes punteados).
- App: `DayColumn.tsx:132-292` — en el carrusel mobile se reusa la card desktop completa: contenedor `border rounded-card shadow-sm`, header con fondo `bg-muted/30`, badge outline "N UNITS" (inglés), chips "Ej./Series" en cajitas, título en input boxed, y headers de área como zonas punteadas `border-dashed` (`AreaDropZone`, `:36-51`) aun cuando `narrowLayout` no dropea.
- Diferencia visual: el mobile se ve como una columna desktop encajonada, no como la pantalla nativa del kit; "UNITS" además queda en inglés.
- Fix: rama `narrowLayout`: quitar borde/fondo del contenedor y del header, título display grande, stats "N ej · M series", headers de área sólidos (dot + label + conteo) reservando el dashed para drop-targets desktop.
- **Verdict:** CONFIRMED — `DayColumn.tsx:132-139` aplica el contenedor `border border-border rounded-card shadow-sm` + header `bg-muted/30` (`:141-144`) sin ninguna rama que lo quite cuando `narrowLayout=true` (la prop solo cambia microcopys y `showDropHint`); badge "N UNITS" en inglés (`:208`), chips Ej./Series en cajitas (`:230-238`), título en input boxed uppercase (`:224`) y AreaDropZone `border-dashed` se renderiza igual en mobile (`:40`, `:334-339` — solo se suprime el hint "· soltar", no el chrome punteado). Kit verificado: día directo sobre `--surface-app` con título display 22 borderless (`coach-builder.jsx:222-239`) y headers de área dot+label+conteo sin bordes (`:256-262`). Superficie verbatim <760 → gap real.

## [P1] Bloque mobile: faltan el rail de reordenar (chevrons) y la mini-fila de acciones del kit

- Kit: `coach-builder.jsx:286-307` — cada card tiene columna derecha con chevron-up/down (38px, borde izquierdo) para reordenar por tap, y una fila inferior de mini-botones: área (folder + short), SS (link), Base/Modif. (shield) y eliminar (trash) — más menú de áreas inline como chips pill.
- App: `ExerciseBlock.tsx:134-443` — reordenar = long-press drag (grip, TouchSensor 300ms), eliminar = X grande a la derecha, área = popover con chevron, SS = conector entre bloques (`DayColumn.tsx:369-419`), Modif. = badge inline.
- Diferencia visual/afford.: las acciones del kit son visibles y tap-first; en la app quedan detrás de gestos (long-press) y popovers. Todas las funciones existen (no falta feature), pero la anatomía táctil del bloque no es la del kit.
- Fix: en `narrowLayout` añadir el rail chevron-up/down y una mini-fila de acciones bajo el contenido (área · SS · Base/Modif. · eliminar), manteniendo el drag como vía secundaria.
- **Verdict:** CONFIRMED — kit verificado: rail chevron-up/down 38px con borde izquierdo (`coach-builder.jsx:286-290`) + mini-fila área/SS/Base-Modif./trash (`:292-298`) + chips de área inline (`:299-307`). App verificada: reordenar solo por drag con grip (`ExerciseBlock.tsx:135-138`) sobre TouchSensor delay 300ms (`WeeklyPlanBuilder.tsx:454`), sin chevrons ni mini-fila; X grande a la derecha (`:434-442`), área en Popover (`:282-345`). Matiz adversarial que NO refuta: en mobile varias acciones SÍ son visibles y tap-first (área/ayuda `opacity-100 md:opacity-0` `:277`, Base/Modif. botón inline `:407-427`, conector SS `max-md:opacity-100` en DayColumn) — el gap duro es el reordenamiento (solo long-press 300ms, sin afordancia visible) y la anatomía del card (rail + mini-fila ausentes) en el elemento más repetido de la superficie verbatim. Se sostiene P1 por eso, no por "todas las acciones ocultas".

## [P2] Dot de "día con contenido" verde en vez de sport

- Kit: `coach-builder.jsx:216` — dot `--sport-500` (azul por defecto). App: `WeeklyPlanBuilder.tsx:1448` — `bg-[var(--success-500)]` (verde). El chip en sí (52×60, rounded-xl, activo ink) está 1:1. Fix: `bg-primary`.

## [P2] Barra de fases mobile: 22px con labels (patrón desktop) vs 8px thin del kit mobile

- Kit mobile: `coach-builder.jsx:187-193` — barra 8px `border-radius 999` sin texto. App: `ProgramPhasesBar.tsx` (única variante, calcada de `.dt-phasebar` desktop con label "Nombre · Nsem") se renderiza igual en <760 (`WeeklyPlanBuilder.tsx:1312`). Fix: variante mobile de 8px sin labels.

## [P2] Draft banner mobile fijo abajo; kit lo pone arriba bajo el header

- Kit: `coach-builder.jsx:197-204` — card in-flow tras el top bar (sport-100). App: `WeeklyPlanBuilder.tsx:989` — `fixed inset-x-3 bottom-*` en mobile (desktop sí queda arriba in-flow ✓). Fix: in-flow bajo el header también en mobile.

## [P2] Sub-bar mobile: falta el resumen de estructura y undo/redo visibles

- Kit: `coach-builder.jsx:165-185` — undo/redo como íconos del top bar + resumen "Semanal · 4 sem" al final de la sub-bar Configurar/AB. App: undo/redo solo dentro del dropdown overflow (`WeeklyPlanBuilder.tsx:1205-1210`) y sin chip de resumen de estructura en mobile. Fix: chip de resumen a la derecha de la barra A/B y, si cabe, undo/redo como íconos.

## [P2] Catálogo expandido mobile: filtro Select y sin preview de técnica en modo tap-add

- Kit: `coach-builder.jsx:393-421` — chips horizontales de grupo muscular + botón ojo por fila que abre `ExercisePreview` (media 16:10 + claves de ejecución) con "Agregar al día". App: en el sheet 80vh el filtro es un `Select` dropdown (`DraggableExerciseCatalog.tsx:216-232`) y con `onTapAdd` el ojo/preview se suprime (`:276`, `onPreview={onTapAdd ? undefined : …}`). Los chips solo existen en el estado compacto 40vh (`WeeklyPlanBuilder.tsx:1608-1624`). Fix: chips también en 80vh y mantener el botón de preview junto al "+".

## [P2] FAB "Modo Simple" con gradiente púrpura hardcodeado fuera del DS

- App: `WeeklyPlanBuilder.tsx:1727-1730` — `linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)` + glow rgba hardcodeado, y FAB de agregar `--success-500` con sombra rgba verde (`:1708-1709`). Feature extra (no está en el kit — la riqueza se mantiene), pero los colores deberían salir de tokens (sport/primary o ink) para no introducir un acento violeta ajeno a la paleta. Fix: tokens DS para fondo/sombra.

## [P2] Copys del CTA fuera de tono: "GUARDAR", "SINCRONIZAR BLOQUE", "DATA INCOMPLETA"

- Kit: "Guardar y enviar" / "Guardar plantilla" (`desktop-builder.jsx:261-263`, `coach-builder.jsx:324`), "Guardar bloque" / "Datos incompletos" (`coach-builder.jsx:664`). App: "GUARDAR" (`WeeklyPlanBuilder.tsx:1291`), "SINCRONIZAR BLOQUE"/"DATA INCOMPLETA" (`BlockEditSheet.tsx:1030-1032`) — anglicismo "DATA" incluido. Fix: adoptar los copys del kit.

## [P2] Nits desktop de dimensiones/estilo de paneles

- Catálogo 350px (`WeeklyPlanBuilder.tsx:1324`) vs 300px kit (`.dt-build-cat`); panel edición 540px (`BlockEditSheet.tsx:502`) y config 420px (`ProgramConfigSheet.tsx:23`) vs 360px kit (`.dt-build-edit/.dt-cfg`) — la app es más ancha porque su editor es más rico (aceptable); inputs del sheet sobre `bg-secondary` (=sunken) vs kit `--surface-app` con `border-default`; toast del kit (píldora ink-950 centrada abajo) vs sonner. Ninguno amerita más que ajuste oportunista.

---

## Verificado 1:1 (sí matchea)

- **Day selector mobile**: chips 52×60 `rounded-xl`, activo fondo ink (bg-foreground), Archivo 13px extrabold, luna para descanso, dot de estado (`WeeklyPlanBuilder.tsx:1430-1453`) — solo el color del dot (P2 arriba).
- **Nombre de programa mobile tap-to-edit**: input display 17px extrabold + lápiz + subtítulo cliente + "· Sin guardar" con dot warning pulsante (`WeeklyPlanBuilder.tsx:1048-1075`) ≡ kit `:150-163`.
- **Pill "Configurar" warning-tinted** en el top (borde/fondo/texto warning) ≡ kit sub-bar (`WeeklyPlanBuilder.tsx:1237-1254` vs kit `:171-173`); el ping extra es riqueza aceptada.
- **ProgramConfigSheet mobile** = bottom sheet con grabber + footer "Ocultar configuración" (copy exacto del kit `:761`); desktop = slide-in derecho ≡ `.dt-cfg`.
- **ProgramPhasesBar desktop** ≡ `.dt-phasebar/.dt-phase` (flex por semanas, label sobre color).
- **Draft banner desktop** in-flow con Restaurar + X, tinte primary(=sport) ≡ `.dt-draft`.
- **A/B**: toggle + segmented "Semana A/B" sobre sunken con hint "alterna A→B" ≡ kit `dt-abrow` / mobile `:174-183`.
- **Spine muscular** 4px izquierda por color de músculo en el bloque (`ExerciseBlock.tsx:122,131`) ≡ kit `:272`.
- **Badge SS·letra** con tinte primary y superserie por par contiguo de misma área ≡ kit (el conector visual entre bloques es riqueza extra).
- **Agrupación por áreas** con headers por área y colores amber/sport/sky ≈ los `builderAreas` del kit mobile (#F5A524/#2680FF/#18ABD4) — el desktop kit usa aqua/sport/ember, inconsistencia interna del kit; la app sigue al mobile kit.
- **Catálogo desktop**: panel izquierdo con título, búsqueda, filas icon-tile + nombre/músculo + hover sunken (`.dt-catitem`, comentario explícito en `DraggableExerciseCatalog.tsx:47`), recents "Usados Recientemente" ≡ kit.
- **Undo/redo desktop** en top bar con atajos Ctrl+Z/Ctrl+Shift+Z ≡ kit.
- **BlockEditSheet contenido**: selector de 4 tipos con nota "Tipo modificado solo en este bloque", historial "Última vez …" para fuerza+cliente, campos por tipo (cardio con zonas FC + bpm por perfil del alumno, intervalos con plantillas; movilidad hold/respiraciones; roller pasadas/duración), Lado normal/por-lado/alternado, instrucciones al alumno en no-fuerza, notas, progresión automática (+peso/+reps con incremento; el modo doble-progresión es riqueza extra) ≡ kit mobile `:496-668` feature por feature.
- **Copiar día** con selección multi-día y toast "Día copiado a N día(s)" ≡ kit; desktop popover ≡ `dt-pop`.
- **Balance muscular**: dialog desktop ≡ `dt-modal` del kit desktop; radar + barras por músculo + warning push/pull (app además con radar en desktop = riqueza).
- **Modales desktop** (preview/assign/balance) centrados ≡ `.dt-modal-scrim/.dt-modal`.
- **Sync plantilla** (traer cambios sin pisar Modif.) presente en ambos ≡ kit SyncSheet/`dt`-flujo.

---

## Fix log (2026-07-01)

- **[P0] Save-bar inferior fija + FAB de agregar (mobile)** → FIXED — `WeeklyPlanBuilder.tsx`: save-bar `fixed bottom-0 z-[45]` con blur `color-mix(surface-card 88%)`, borde superior, `pb` safe-area y CTA full-width `--theme-primary` ("Guardar y enviar" / "Guardar plantilla", check icon, `data-tour-id="save-button"` en mobile); FAB 56px `--theme-primary` con glow que abre el catálogo a 80vh (oculto en día de descanso, kit `:318`); el drawer-handle del catálogo CONVIVE: su `bottom` sube 72px+safe para asentarse sobre la barra (stack vertical resuelto), carousel/FABs/overlay Simple re-offseteados; Guardar del header pasa a `hidden md:flex` con copy kit y el hint del tour se actualizó.
- **[P1] Tipografía uppercase-tracking micro → display sentence-case** → FIXED — h1 desktop 18px display 800 (`WeeklyPlanBuilder.tsx`, estático: la edición inline desktop queda vía Configurar/mobile tap-edit), subtítulo 12px muted sin uppercase, botones toolbar/Configurar/Sync/Guardar a 13px/700 sentence-case (chrome pill existente se mantiene), "Cambios sin guardar" sentence-case; título del día = input display borderless 20px desktop / 22px mobile con focus sunken (`DayColumn.tsx`, kit `.dt-day-title`/`:228`); nombre de bloque 13.5/14.5px 700 sentence-case (`ExerciseBlock.tsx`); labels del sheet `FIELD_LABEL_CLASS` → 12.5px/600 text-strong y título del sheet display extrabold normal-case (`BlockEditSheet.tsx`).
- **[P1] Colores de estado raw → tokens DS** → FIXED — Incompleto `danger-100/600` (`ExerciseBlock.tsx`), Modif. `warning-500/600` (botón extraído `overrideButton`), progresión `primary` (=sport white-label), historial "Última vez" `success-100/700/600` + bpm zona `success-600` (`BlockEditSheet.tsx`), asteriscos `danger-500`, contadores `warning-600` (`BlockEditSheet.tsx`, `ProgramConfigForm.tsx` ×3 incl. nota de fases), descanso indigo → ink/sunken + primary en toggle (`DayColumn.tsx`, `ProgramPreviewDialog.tsx`), warn push/pull amber/emerald → warning/success (`MuscleBalancePanel.tsx`).
- **[P1] BlockEditSheet mobile = bottom-sheet** → FIXED — `side={isMobile ? 'bottom' : 'right'}` (patrón ProgramConfigSheet), `rounded-t-sheet` 28px + grabber + `max-h-[92dvh]`, steppers circulares 44px con numeral `eva-metric` para Series (fuerza/cardio/movilidad, solo mobile), CTA "Guardar bloque" / "Datos incompletos" sentence-case; desktop intacto (540px).
- **[P1] Superficies secundarias mobile → bottom-sheets** → FIXED — overflow "Más" = Sheet inferior con filas ícono-tile 38px sunken + label 15px (reemplaza DropdownMenu; undo/redo viven ahí); Balance/Preview/Plantillas/Asignar = `useIsDesktopMd()` (hook local `components/useIsDesktopMd.ts`, patrón Asignar de workout-programs) → Dialog en md+ / Sheet inferior con grabber en <768; Print = overlay propio convertido a bottom-sheet por clases (`items-end` + `rounded-t-sheet` + grabber `md:hidden`); copiar día = Sheet inferior con chips sport + CTA (desktop conserva popover) (`DayColumn.tsx`).
- **[P1] Día mobile = lienzo plano** → FIXED — `DayColumn.tsx` rama `narrowLayout`: sin borde/card/shadow/fondo de header, label día 11px + título display 22 borderless, toggles descanso/copiar como icon-tiles sunken 44px, stats "N ej · M series" + dots musculares; headers de área sólidos (dot cuadrado tintado + nombre + conteo, droppable conservado) reservando el dashed para desktop; empty-state "Día vacío" del kit; badge UNITS queda desktop-only y en español ("N ej").
- **[P1] Bloque mobile: rail de chevrons + mini-fila** → FIXED — `ExerciseBlock.tsx` en `narrowLayout`: rail derecho chevron-up/down 38px con borde (reusa `MOVE_BLOCK` del reducer vía `handleMoveBlock`/`onMoveBlock`, un undo por tap), mini-fila SS (link/unlink reusa `toggleSuperset` con intent) · Base/Modif. · eliminar (trash danger, reemplaza la X grande); drag long-press se mantiene como vía secundaria; área sigue tap-first en la fila de chips (picker existente).
- **[P2] Dot de día verde → sport** → FIXED — `bg-primary` (sport-400 en chip activo).
- **[P2] Barra de fases mobile 8px** → FIXED — variante `max-md`: 8px, pill clipped, sin labels; desktop 22px con labels intacto.
- **[P2] Draft banner mobile arriba** → FIXED — movido in-flow bajo el header (ambos viewports), sin fixed bottom.
- **[P2] Sub-bar mobile: resumen estructura** → FIXED (chip "Semanal/Ciclo Nd · N sem" al final de la barra A/B); undo/redo como íconos del top bar → SKIPPED (sin espacio en el header mobile; quedan en el sheet de overflow).
- **[P2] Catálogo 80vh: preview en modo tap-add** → FIXED — ojo de técnica visible junto al "+" (`DraggableExerciseCatalog.tsx`); chips de músculo en 80vh en vez de Select → SKIPPED (estructural, el Select comparte layout con el sidebar desktop).
- **[P2] FAB Modo Simple gradiente púrpura** → FIXED — gradiente `surface-inverse → surface-inverse-2` + `--shadow-lg`; FAB de agregar verde → `--theme-primary` con glow tokenizado.
- **[P2] Copys CTA** → FIXED — "Guardar y enviar"/"Guardar plantilla" (header + save-bar), "Guardar bloque"/"Datos incompletos".
- **[P2] Nits desktop de dimensiones** → SKIPPED (el propio informe los marca como ajuste oportunista; los anchos extra responden a un editor más rico).
