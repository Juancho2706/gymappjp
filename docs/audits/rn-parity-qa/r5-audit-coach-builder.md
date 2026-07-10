# R5 — Auditoría pixel COACH · Workout Builder (RN vs web md<760)

Referencia = árbol web mobile (`isMobile`/`narrowLayout`/`compact`) de `apps/web/src/app/coach/builder/[clientId]/**` y `workout-programs/**`.
RN objetivo = `apps/mobile/app/coach/program-builder.tsx`, `(tabs)/builder.tsx`, `components/coach/BuilderBlockCard.tsx`, `BlockEditorSheet.tsx`.

Fonts DS (canónicas, `lib/theme.ts`): display=`Archivo_*`, body/sans=`theme.fontSans`=`HankenGrotesk_400Regular` (bold: `HankenGrotesk_600SemiBold/_700Bold/_800ExtraBold`), mono=`JetBrainsMono_*` **solo donde web usa `font-mono`**.
Regla copy: texto web, voseo neutralizado (Toca/Elige/Guarda, no Tocá/Elegí/Guardá).
Muscle colors: **1:1, no tocar.**

Clasif: **[PX]** DIFF-pixel · **[ES]** DIFF-ESTRUCTURAL.

---

## 0. DIVERGENCIAS ESTRUCTURALES RAÍZ (leer antes de tocar nada)

| # | Tema | Web (md<760) | RN actual | Clas |
|---|---|---|---|---|
| E0 | **Modelo de agrupación de bloques** | Bloques agrupados por **ÁREAS dinámicas** (`AreaDropZone`, `buildAreaVMs(areas)`, sistema+custom del coach). Header de área con badge de color + "· soltar"/conteo. `DayColumn.tsx:25-73,463-471` | Bloques agrupados por **SECCIONES fijas** (`warmup/main/cooldown` → CAL/PRI/ENF). `program-builder.tsx:43-44,549-576`, header `sectionHeader` con dot+título+conteo+botón `+`. | **ES** |
| E1 | **Editor de bloque: tipos de ejercicio** | Selector 4-col (Fuerza/Cardio/Movilidad/Roller) arriba + campos por tipo (pace/HR-zones/intervalos/hold/pasadas). `BlockEditSheet.tsx:599-1007` | Solo fuerza. Sin selector de tipo ni campos cardio/movilidad/roller. `BlockEditorSheet.tsx` completo. | **ES** |
| E2 | **Modo Simple/Normal** | NO existe en web. | RN agrega toggle Sparkles (FAB degradado púrpura), overlay de transición con logo, hints de swipe. `program-builder.tsx:1058-1092,1065-1072` | **ES** (RN-only; el CEO pidió 1:1 — evaluar si se retira o se documenta como extra permitido) |
| E3 | **Guardar + FAB catálogo (mobile)** | Stack fijo abajo-derecha: pill grande "Guardar" (Check+label, `h-14`, `#007AFF`) + FAB "+" redondo (`w-14 h-14`, Plus strokeWidth 3). `WeeklyPlanBuilder.tsx:1539-1579` | Guardar = ícono disquete 42×42 en top bar (`saveBtn` 1123). Sin pill grande. FAB "+" solo en Modo Simple. | **ES** |
| E4 | **Reordenar bloque** | Rail de chevrons ▲▼ 38px a la derecha de la card (`ExerciseBlock.tsx:472-493`) + drag secundario. | Solo long-press drag (`NestableDraggableFlatList`). Sin rail de chevrons. | **ES** |
| E5 | **Cambiar área/sección del bloque** | Popover selector de área (badge+ChevronDown) + botón ayuda `CircleHelp`. `ExerciseBlock.tsx:318-451` | 3 botones inline CAL/PRI/ENF + ayuda. `BuilderBlockCard.tsx:118-130` | **ES** (consecuencia de E0) |

---

## 1. Top bar del builder — `program-builder.tsx:804-845` vs `WeeklyPlanBuilder.tsx:934-1240`

| Elemento | Web (val · ref) | RN (val · ref) | Clas |
|---|---|---|---|
| Título programa | `font-display text-[17px] font-extrabold` **normal-case**, con `Pencil` w-3 h-3 = tap-to-edit; placeholder "Nombre del programa" · `WPB:966-984` | `progTitle` **UPPERCASE** `Archivo_700Bold` `fontSize:14 letterSpacing:1`, sin tap-to-edit · `pb:810-812,1113` | **PX**+**ES** (quitar `toUpperCase()`, size 17, agregar lápiz + edición inline) |
| Subtítulo | `text-[11.5px] text-[var(--text-muted)]/70`, cliente o "Plantilla" · `WPB:985` | `statusMuted fontSize:10 UPPERCASE` · `pb:817-819,1117` | **PX** (11.5px, sin uppercase) |
| Badge sin guardar | dot `bg-warning-500 animate-pulse` + "Sin guardar" `text-[var(--warning-600)]` **~normal** 11.5px · `WPB:987-991` | `statusDot` #F5A524 + "SIN GUARDAR" UPPERCASE 9px `letterSpacing:0.8` · `pb:813-817,1116` | **PX** (copy "Sin guardar", 11.5px, sin uppercase) |
| Orden acciones | (mobile) `⋮` overflow → `?` guía → `⚙ Configurar` (ping ámbar) → Guardar (en save-bar inferior) | `⋮` → `?` (ping azul) → `⚙` (ping ámbar) → 💾 Save · `pb:823-844` | **ES** (Save no va en top bar; ver E3) |
| Ping "?" guía | `bg-primary/25 animate-ping` (azul) `WPB:1161-1163` | ámbar (`theme.primary`) OK azul; correcto | OK |
| Botón Configurar | pill outline ámbar, en móvil icon-only `h-8 w-8`, icono `SlidersHorizontal` · `WPB:1183-1201` | `gearBtn` 34×34 icono `Settings` `#F5A524` · `pb:837-839` | **PX** (icono debe ser `SlidersHorizontal`, no `Settings`) |

---

## 2. Barra A/B — `program-builder.tsx:847-865` vs `WeeklyPlanBuilder.tsx:1322-1362`

| Elemento | Web | RN | Clas |
|---|---|---|---|
| Toggle A/B | `text-[10px] font-bold uppercase tracking-widest`, "A/B" (font-black) + "Activar semanas A/B" / "Semanas alternas activas" · `WPB:1323-1334` | `abTag` 11px + `abLabelTxt` 10px UPPERCASE; mismos textos · `pb:850-854,1126-1127` | **PX** (tag 10px) |
| Segmento Semana A/B | "Semana A"/"Semana B" `text-[11px] font-black uppercase` · `WPB:1348` | "Sem A"/"Sem B" `fontSize:11 Archivo_700Bold` · `pb:859` | **PX** (copy "Semana A/B" completo) |
| Resumen estructura | `ml-auto text-[11px] font-bold text-subtle` "Semanal · N sem" · `WPB:1354-1356` | ausente | **ES** (falta el resumen a la derecha) |

---

## 3. Selector de día (chips) — `program-builder.tsx:460-476,867-880` vs `WeeklyPlanBuilder.tsx:1388-1414`

| Elemento | Web (`WPB:1395-1412`) | RN (`renderDayTab` 460-476 / styles 1137-1140) | Clas |
|---|---|---|---|
| Contenedor | scroll horizontal `px-4 pt-3.5 pb-1`, chips centrados `w-max gap-2`, sin barra de fondo | `dayTabBar` con `backgroundColor: theme.secondary` `borderRadius:14 padding:4` (barra sólida) · `pb:870` | **ES** (web no envuelve en barra secondary; son chips sueltos) |
| Chip | `min-w-[52px] h-[60px] px-2.5 rounded-xl`; activo `bg-foreground`, inactivo `bg-surface-card shadow-sm` · `WPB:1398-1400` | `dayTab` `paddingVertical:7 borderRadius:10`, activo `bg=theme.background` · `pb:465` | **PX** (h fijo 60, minW 52, rounded-xl 12→usar radius mayor; activo debe ser `theme.foreground`, texto `theme.background`) |
| Label día | `font-display text-[13px] font-extrabold`, `name.slice(0,3)`; activo `text-background` inactivo `text-strong` · `WPB:1402-1404` | `dayTabLabel fontSize:10 Archivo_700Bold UPPERCASE` · `pb:466,1139` | **PX** (13px, extrabold=800, sin uppercase forzado extra) |
| Estado día | rest→`Moon` w-3 h-3; con ejercicios→dot `bg-primary`/`bg-sport-400`; vacío→dot tenue · `WPB:1405-1409` | rest→texto "ZZZ"; con→número count; vacío→"·" · `pb:467-473` | **ES** (web usa Moon+dot, NO "ZZZ"/número/·) |

---

## 4. Card de día (título + volumen) — `program-builder.tsx:919-955` vs `DayColumn.tsx:196-353`

| Elemento | Web narrowLayout | RN | Clas |
|---|---|---|---|
| Layout header | label día 11px uppercase + input título **grande** `font-display text-[22px] font-black`, botón rest 44px, botón copiar 44px · `DayColumn:203-240` | `dayCard` con `TextInput` `dayTitleInput` `fontSize:14 theme.fontSans` en caja bordeada + restBtn + copyBtn 44px · `pb:919-937,1191` | **PX**+**ES** (título debe ser input `Archivo` ~22px font-black sin borde; falta el label "Lun/Día N" 11px arriba) |
| Día descanso (título) | input reemplazado por texto `font-display text-[22px] font-black` "Descanso" · `DayColumn:216-218` | caja `restTitleBox` con Moon + "DÍA DE DESCANSO" UPPERCASE 11px · `pb:921-925` | **PX** (copy "Descanso", 22px display, no uppercase) |
| Chips volumen | "Ej." + count, "Series" + count `text-[9px]`/`text-[10px]`; dots músculo `w-2.5` · `DayColumn:338-352` | `volChip` "EJ."/"SERIES" `volLbl 9px` + `volVal 12px`; `muscleDot 9px` · `pb:940-952,1200-1205` | **PX** (menor; labels "Ej."/"Series" no uppercase forzado, valor 10px) |
| Botón rest | web: `p-1.5 rounded-lg`, activo `text-primary bg-primary/10` (narrow: 44px `rounded-control`, activo fondo `--theme-primary`) · `DayColumn:220-230,303-314` | `restBtn` 44×44 borde, activo `theme.primary+1A` · `pb:930-933,1192` | **PX** (activo narrow = fondo sólido primary, ícono blanco) |

---

## 5. Panel día de descanso (vacío) — `program-builder.tsx:958-968` vs `DayColumn.tsx:415-428`

| Elemento | Web | RN | Clas |
|---|---|---|---|
| Ícono | Moon `h-6 w-6` en caja `h-[52px] w-[52px] rounded-xl bg-surface-sunken text-subtle` · `DayColumn:417-419` | Moon 26 en `restIconBox 56×56 radius18 bg=secondary` · `pb:960-962,1144` | **PX** (52px, radius-xl, icono 24) |
| Título | "Día de descanso" `font-display text-[15px] font-extrabold` **normal** · `DayColumn:420` | "DÍA DE DESCANSO" UPPERCASE `Archivo_800 12px letterSpacing:2` · `pb:963,1145` | **PX** (copy normal-case, 15px extrabold) |
| Subtítulo | "No se programa entrenamiento." `text-[13px] text-muted` · `DayColumn:421` | "Recuperación activa y descanso" 12px · `pb:964` | **PX** (copy web exacto) |
| Botón | "Añadir ejercicios" `rounded-control border px-3.5 py-2 text-xs font-bold` · `DayColumn:422-427` | "Añadir ejercicios" `HankenGrotesk_700Bold 11px UPPERCASE` · `pb:965-967,1148` | **PX** (sin uppercase, 12px) |

---

## 6. Card de ejercicio — `BuilderBlockCard.tsx` vs `ExerciseBlock.tsx` (narrowLayout)

| Elemento | Web (narrow) | RN | Clas |
|---|---|---|---|
| Nombre ejercicio | `font-bold text-[14.5px] leading-snug` **sans (HankenGrotesk), normal-case** · `ExerciseBlock:201-203` | `name Archivo_700Bold fontSize:12.5 letterSpacing:0.3` **UPPERCASE** · `BBC:73,173` | **PX** (font `HankenGrotesk_700Bold`, size 14.5, **quitar uppercase**, quitar Archivo) |
| Miniatura | `w-10 h-10 rounded-md`, bg `color-mix muscle 15%` · `ExerciseBlock:181-195` | `thumb 40×40 radius8` bg `hexToRgba(muscle,0.15)` · `BBC:63-69,171` | OK (radius 8≈rounded-md; validar) |
| Borde izq músculo | `border-l-4` color músculo · `ExerciseBlock:162,171` | `borderLeftWidth:4 borderLeftColor:muscle` · `BBC:58,169` | OK |
| Badge área/sección | `text-[8px] font-black uppercase tracking-tight`, `shortLabel` de área · `ExerciseBlock:246-254` | `badgeT 9px HankenGrotesk_700Bold uppercase`, `SECTION_SHORT` · `BBC:77-78,176` | **PX**+**ES** (8px font-black=900; contenido = área no sección → ver E0) |
| Badge sets×reps | `text-[10px] font-bold` **sans** `bg-black/5` · `ExerciseBlock:266-275` | `badgeT` con **`JetBrainsMono_700Bold`** (mono) · `BBC:96-99` | **PX** (web NO usa mono aquí → `HankenGrotesk_700Bold`, size 10) |
| Badge descanso ⏱ | `text-[10px] font-bold` sans · `ExerciseBlock:284-288` | `JetBrainsMono_700Bold` · `BBC:106-108` | **PX** (mono→sans) |
| Badge "Incompleto" | copy "Incompleto" (Mayúscula inicial), `bg-danger-100 text-danger-600` · `ExerciseBlock:277-282` | "INCOMPLETO" UPPERCASE · `BBC:100-103` | **PX** (copy "Incompleto") |
| Badge músculo | `text-[9px] font-bold uppercase tracking-widest text-white` bg músculo · `ExerciseBlock:311-317` | `badgeT 9px` color #fff bg músculo · `BBC:115` | OK |
| Badge SS·letra | color `--theme-primary` borde/bg color-mix · `ExerciseBlock:289-302` | `theme.primary` 0.1/0.3 · `BBC:109-111` | OK |
| Badge progresión | `↑Nkg`/`↑Nr` `text-[10px]` · `ExerciseBlock:303-310` | idem 9px · `BBC:112-114` | **PX** (10px) |
| Selector área/sección | Popover badge+ChevronDown + ayuda (ver E5) · `ExerciseBlock:318-451` | fila 3 botones CAL/PRI/ENF `fontSize:8` + ayuda `CircleHelp` · `BBC:118-130,182-184` | **ES** (ver E0/E5) |
| Eliminar | narrow: en mini-fila inferior `Trash2` (X arriba oculto) · `ExerciseBlock:496-524` | `X 18` arriba-derecha `del` · `BBC:147-149,185` | **ES** (web narrow mueve delete a fila inferior con SS/Base) |
| Rail chevrons ▲▼ | 38px lado derecho · `ExerciseBlock:472-493` | ausente (drag) · ver E4 | **ES** |
| Mini-fila acciones | SS (Link2+"SS") · Base/Modif · spacer · Trash2 · `ExerciseBlock:497-524` | ausente (SS vive en conector entre cards; override solo badge) | **ES** |

---

## 7. Conector superserie — `program-builder.tsx:526-543` vs `DayColumn.tsx:519-576`

| Elemento | Web | RN | Clas |
|---|---|---|---|
| Enlazado (pill) | "SS · X" `text-[9px] font-bold uppercase tracking-widest text-primary/70 bg-primary/10 border` + líneas + botón Unlink en hover · `DayColumn:520-539` | `ssPill` "SS · X" `9px letterSpacing:0.6 uppercase` + 2 líneas · `pb:528-534,1133-1134` | **PX** (falta botón desagrupar `Unlink` explícito; RN desagrupa tocando el pill — aceptable, pero web muestra ícono) |
| No enlazado (link) | botón dashed pill `Link2 + "Superserie"` `text-[9px] uppercase` · `DayColumn:552-573` | `ssLinkBtn` `Link2 + "Superserie"` dashed `9px` · `pb:536-541,1135-1136` | OK (validar tracking) |

---

## 8. Editor de bloque — `BlockEditorSheet.tsx` vs `BlockEditSheet.tsx`

| Elemento | Web (mobile) | RN | Clas |
|---|---|---|---|
| Header nombre | `SheetTitle text-lg font-display font-extrabold normal-case tracking-[-0.02em]` · `BES:570-572` | `name Montserrat_700Bold fontSize:17` · `BEditor:123,266` | **PX** (font legacy Montserrat → `Archivo`, normal-case OK) |
| Header músculo | dot `bg-primary animate-pulse` + `muscle_group` `text-xs` · `BES:573-576` | `mDot` color músculo + `muscle 13px theme.fontSans` · `BEditor:124-127,269` | **PX** (menor; web dot=primary pulsante) |
| Selector tipo ejercicio | grid 4-col Fuerza/Cardio/Movilidad/Roller · `BES:599-636` | ausente | **ES** (ver E1) |
| Sección (segmented) | **NO existe en web** (web usa áreas en la card) · — | Segmented "Calent./Principal/Enfri." `Inter_600SemiBold` · `BEditor:143-145,40-44` | **ES** (RN-only; consecuencia E0) |
| Series (mobile) | `SeriesStepper`: botones circulares 44px + numeral `eva-metric text-2xl` · `BES:193-225,646-647` | `Field` input numérico plano · `BEditor:149` | **ES**+**PX** (portar stepper) |
| Label Series | "Series *" (asterisco danger) · `BES:642-645` | "Series" · `BEditor:149` | **PX** (agregar `*`) |
| Label Reps | "Repeticiones *" · `BES:661-664` | "Reps" · `BEditor:150` | **PX** (copy "Repeticiones", `*`) |
| Label Peso | "Peso Objetivo (kg)" + tooltip · `BES:679-682` | "Peso (kg)" · `BEditor:153` | **PX** (copy) |
| Label RIR | "RIR / RPE" + tooltip · `BES:694-697` | "RIR" · `BEditor:158` | **PX** (copy "RIR / RPE") |
| Label Recuperación | "Recuperación" · `BES:727-730` | "Descanso" · `BEditor:154` | **PX** (copy "Recuperación") |
| Descanso calentamiento | campo extra `warmup_rest_time` · `BES:745-758` | ausente | **ES** |
| Ejes adicionales (dist/carga/lado) | bloque completo · `BES:760-808` | ausente | **ES** |
| Progresión | toggle switch + segmented +Peso/+Reps + valor + modo (Cada semana / Al completar reps) · `BES:1026-1110` | Segmented Ninguna/Peso/Reps + valor + modo · `BEditor:162-180` | **PX** (layout: web = switch on/off, no opción "Ninguna"; modos "Cada semana"/"Al completar las reps") |
| Notas | label "Instrucciones de Protocolo" + tooltip + contador /1000 · `BES:454-473` | label "Notas", sin contador · `BEditor:183` | **PX** (copy + contador) |
| Toggle override | fila con label "Excluir al sincronizar (override)" + Switch · `BEditor:195-198` | (web: badge Base/Modif en card, no en sheet) | **ES** (ubicación distinta; aceptable) |
| Mover a día | chips `Inter_600SemiBold` · `BEditor:200-213` | web: se hace por drag, no en sheet | **ES** (RN-only, ventaja nativa; conservar pero fuente→HankenGrotesk) |
| Botón guardar | full-width primary "Guardar bloque"/"Datos incompletos" `text-[15px]` sombra glow · `BES:1113-1125` | ausente (patch live) + "Quitar ejercicio" destructive `Montserrat_700Bold` · `BEditor:215-218` | **ES**+**PX** (agregar botón Guardar bloque; remove font Montserrat→Archivo) |
| Fuentes segmented/chips | — | `Inter_600SemiBold` (legacy) `BEditor:208,246` | **PX** (→ `HankenGrotesk_600SemiBold`) |

---

## 9. Onboarding tour — copy voseo (regla CEO: neutralizar) — `program-builder.tsx:594-603`

| id | RN actual (voseo) | Debe decir (neutro) | Clas |
|---|---|---|---|
| top-config-button | "Empezá en Configurar" / "Definí estructura..." | "Empieza en Configurar" / "Define estructura..." | **PX** |
| ab-toggle | "Activá rutinas alternas" | "Activa rutinas alternas" | **PX** |
| days-board | "Armá cada día", "Tocá un día", "deslizá" | "Arma cada día", "Toca un día", "desliza" | **PX** |
| save-button | "Guardá al terminar" | "Guarda al terminar" | **PX** |
| Alert save | "Revisá \"X\"" · `pb:771` | "Revisa \"X\"" | **PX** |
| Help card | "Si cambiás la sección..." · `BBC:141` | "Si cambias la sección..." | **PX** |

(Nota: web `BuilderOnboardingTour` usa "Toca el botón +", "Elige", "Comprueba" — ya neutro. RN introdujo voseo → corregir.)

---

## 10. Lista de programas — `(tabs)/builder.tsx` vs `WorkoutProgramsClient.tsx` (md:hidden) + `ProgramRow.tsx`

**Divergencia estructural global:** el web mobile es minimalista (header + nav + búsqueda + tabs-stats + `ProgramRow` simple → tap abre `ProgramPreviewPanel` con acciones). El RN reimplementa un diseño pesado propio (LibraryHero + stat grid + filter pills + `ProgramCard` con acciones inline). **[ES]**

| Elemento | Web mobile (`WPC:770-942`) | RN (`builder.tsx`) | Clas |
|---|---|---|---|
| Header | eyebrow "Biblioteca" `text-[12px] font-bold uppercase tracking-[0.08em] text-muted` + h1 "Programas" `font-display text-[26px] font-black leading-[1.1] tracking-[-0.03em]` + botón "Nueva" (sport, Plus) · `WPC:773-792` | `ScreenHeader "Programas"` + `LibraryHero` (eyebrow "BIBLIOTECA" Sparkles, título "Programas reutilizables" 22px, subtítulo, stat grid 4) · `builder.tsx:326,467-505` | **ES** (RN sobredimensiona: web es header simple, sin hero ni stat grid) |
| Nav catálogo | 2 botones "Ejercicios"(List) + "Áreas"(LayoutGrid) `border-[1.5px] text-[13px] font-bold` · `WPC:795-810` | 1 botón "Lista de ejercicios" verde success · `builder.tsx:487-496` | **ES** (falta botón "Áreas"; copy "Ejercicios") |
| Búsqueda + orden | search `h-[42px]` + popover orden Recientes/Nombre (ArrowUpDown) · `WPC:813-870` | search + `SegmentedTabs` + `FilterPill` row (Activos/Inactivos/Semanal/Ciclo/Con fases) + toggle Compacta/Comoda · `builder.tsx:343-386` | **ES** (web NO tiene filter pills ni toggle densidad en móvil; usa orden) |
| Tabs-stats | 3 botones en pill `bg-surface-sunken`, cada uno count `eva-metric 17px` + label (Todos/Plantillas/En curso) `h-[46px]` · `WPC:873-901` | `SegmentedTabs` Todos/Plantillas/En curso (sin count grande) · `builder.tsx:355-363` | **PX**+**ES** (agregar contadores tipo eva-metric) |
| Card programa | `ProgramRow`: icono `size-11 rounded-md bg-sport-100` + Dumbbell, nombre `text-[15px] font-bold`, StatusBadge + cliente, meta `font-mono text-[11.5px]` o barra progreso, ChevronRight · `ProgramRow:48-116` | `ProgramCard`: accent bar + título `Archivo_800` + StatusBadge + meta + client line + badge row + day rail + exercise badges + fila acciones (Preview/Editar/Asignar/Duplicar/Sync/Eliminar) · `builder.tsx:518-608` | **ES** (web card = fila simple tap→preview; RN = card compleja con acciones inline) |
| Meta card | `font-mono text-[11.5px]` "N días · N sem · N bloques" (**web SÍ usa mono acá**) · `ProgramRow:99-110` | `cardMeta theme.fontSans 12px` · `builder.tsx:557-559,1221` | **PX** (web usa `font-mono` → `JetBrainsMono` en RN) |
| StatusBadge | Badge DS tone sport/success/neutral, "Plantilla/Activo/Inactivo" · `ProgramRow:27-45` | `statusBadge HankenGrotesk_800 9px UPPERCASE` · `builder.tsx:610-620,1223` | **PX** (validar contra Badge DS: size sm, no uppercase forzado) |
| Acciones programa | en `ProgramPreviewPanel` (sheet al tap), no en card · | fila inline en card · `builder.tsx:597-604` | **ES** |
| Empty state | tile 60px sport + título display 17px + CTA contextual (4 variantes) · `WPC:108-176` | `EmptyState` genérico Dumbbell · `builder.tsx:389-395` | **ES** (portar variantes contextuales + tile sport) |
| FAB | web mobile: sin FAB (botón "Nueva" en header) | `fab` Plus 56px abajo-derecha · `builder.tsx:418-420` | **ES** (web no tiene FAB en lista) |

---

## Resumen de acción para el fixer (prioridad CEO = builder)

**Quick wins pixel (alto impacto, bajo riesgo):**
1. `BuilderBlockCard` nombre: `HankenGrotesk_700Bold`, 14.5px, **sin uppercase** (`BBC:73,173`).
2. `BuilderBlockCard` sets×reps + ⏱: quitar `JetBrainsMono`, usar `HankenGrotesk_700Bold` 10px (`BBC:98,107`).
3. Top bar título: quitar `.toUpperCase()`, 17px, agregar lápiz + edición (`pb:810-812`).
4. "INCOMPLETO"→"Incompleto"; "DÍA DE DESCANSO"→"Descanso"/"Día de descanso"; badges sin uppercase forzado.
5. Neutralizar voseo del tour + alerts (§9).
6. `BlockEditorSheet`: Montserrat/Inter → Archivo/HankenGrotesk; labels "Repeticiones"/"Peso Objetivo (kg)"/"RIR / RPE"/"Recuperación" + `*`.
7. Icono Configurar `Settings`→`SlidersHorizontal`.
8. Day chip: Moon/dot en vez de "ZZZ"/count/"·"; label 13px display normal-case.

**Estructurales (decisión de arquitectura — confirmar con jefe antes):**
- E0 áreas-vs-secciones, E1 tipos de ejercicio, E3 save-bar/FAB, E4 rail chevrons, E5 selector área, §8 stepper+guardar-bloque, §10 rediseño lista.
