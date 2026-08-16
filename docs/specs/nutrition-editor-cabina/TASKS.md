# TASKS — T3.v Cabina (worker-ready)

Convenciones: cada tarea es autocontenida para un worker (política del dueño: **Sonnet** = mecánico
bien especificado; **Opus** = layout/transcripción guiada por mockup; **jefe** = juicio, no ejecuta).
Referencia visual = artifact «Cabina v2 · Agenda» (secciones 00 y A·1–A·5). Antes de marcar una tarea
DONE: su DoD + `pnpm lint && pnpm typecheck` locales del paquete tocado. Gates completos por wave
según [PLAN](PLAN.md). Regla de guardia backend-cero del PLAN aplica a TODAS.

## W0 — Fundaciones

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| V0.1 | Sonnet | `packages/nutrition-v2/src/macro-spark.ts` (nuevo) + export en el índice del paquete + `macro-spark.test.ts` | Implementar `macroCalorieShares(proteinG, carbsG, fatsG): {p,c,g}` según PLAN §1 (aportes 4/4/9, clamp ≥0, suma exacta 100 por resto mayor, todo-cero ⇒ {0,0,0}). | Tests: {31,38,31} para P51.8/C63/G23; {0,0,0} para nulls; {100,0,0} solo proteína; suma===100 en 20 casos fuzz. `pnpm --filter @eva/nutrition-v2 test` verde. |
| V0.2 | Opus | `apps/web/src/components/nutrition-v2/MacroSpark.tsx` (nuevo) | Componente presentacional según PLAN §2: kcal mono tabular + track redondeado con 3 segmentos; tamaños sm/md/lg (38/48/64 × 5/6/7 px); colores SOLO `var(--color-macro-*)`; track `bg-surface-sunken`; `aria-hidden` en la barra (el texto accesible lo pone V0.3). Sin estado, sin popover. | Renderiza los 3 tamaños en el harness V0.4; `check:tokens` verde; cero hex. |
| V0.3 | Opus | `apps/web/src/components/nutrition-v2/MacroSparkPopover.tsx` (nuevo) | Contrato D3 de la SPEC sobre primitivos existentes de `components/ui` (`popover.tsx`; hover-branch con `info-tooltip.tsx` si su API da hover+focus — decidir en código y comentarlo). Props: las de MacroSpark + `fiberG?`, `targetCalories?`. Contenido: gramos (+fibra si existe; +«{n}% de la meta» si `targetCalories`). Un solo popover abierto (coordinación module-level); cierre por scroll en captura; hit-area 44×28; `aria-label` completo en el trigger. | En harness: hover abre/cierra con delay; tap (emulación touch de Playwright) abre y tap-fuera cierra; Esc cierra; abrir B cierra A; axe/roles básicos OK. |
| V0.4 | Sonnet | `apps/web/src/app/dev-harness/nutrition-editor/` (**YA EXISTE** — `page.tsx` + `harness-client.tsx` con `?mode=edit\|create\|template`; extender, NO recrear) | Extender el harness existente: draft semilla con items con/sin foto, porciones, sustituciones y macros editadas; query `?w=` para anchos y toggle de tema si faltan. Script Playwright headless (correr desde la RAÍZ del repo — fuera del repo `playwright` no resuelve): capturas 390/768/1024/1280/1536 ×2 temas + humo del popover (hover, tap emulado, Esc, uno-a-la-vez). | Script sale 0 con capturas; el guard de no-prod del harness se conserva. |

## W1 — Swaps web (superficies)

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| V1.1 | Opus | `_quick-edit/EditableItemRow.tsx` | Fila v2 del mockup A·1: grid `34px 1fr auto auto 26px`; col 1 = foto producto (`FoodThumb`/`resolveFoodImageUrl` con fallback ícono categoría, 34×34 fijo) — item libre usa el tile punteado; col 2 = nombre (badges ⇄n / «macros editadas» / «libre» inline) + subtítulo `marca · kcal/100 {unidad}` (+ « · la sueles usar aquí» si hay porción pegajosa); col 3 = `ItemQuantityField` intacto; col 4 = `MacroSparkPopover` sm; col 5 = ⋮ intacto. Filas separadas por `border-t border-border-subtle`, SIN card por fila. No tocar ningún handler/dispatch. | Menú ⋮ completo funciona igual (smoke en harness); fila con item sin macros muestra track vacío + popover «Sin macros registrados»; tests del archivo actualizados sin perder aserciones de datos. |
| V1.2 | Opus | `_quick-edit/EditableSlotCard.tsx` | Header v2: nombre input + hora + spark md del subtotal (`qeCombineSubtotals` ya calculado) con popover (incluye «{n}% de la meta» si hay `targets.calories`); contraída: además stack de hasta 4 fotos de items (`.ph` 22px solapadas, «+n» si hay más) — franja solo-porciones muestra pills de grupos como hoy. Sección porciones y foot: strip v2 del mockup (dashed top, pills con dot de color de grupo + «≈ n kcal»). Cero cambios de sheets/acciones. | Contraer/expandir conserva estado y aria; copy-franja y eliminar intactos; nota de porciones intacta. |
| V1.3 | Sonnet | `_quick-edit/PublishBar.tsx` | Totales v2: `dayTotals` renderiza kcal `x / meta` + spark md del día + tres micro-metas `P/C/G actual/meta` con barra por macro (`bg` = token de macro; SIN semántica ok/warn nueva — el color semántico solo en el anillo de la cinta W2). Estructura de acciones/errores intacta (upgrade, NUT-008, retry, contador). | 390 px: contador en línea propia (regla H-18/QW-12) se conserva; textos de error idénticos. |
| V1.4 | Sonnet | `_components/food-picker/FoodPickerRow.tsx` + `EditorPalette.tsx` | Row v2: foto (ya existe `FoodThumb`) + nombre/marca + `MacroSparkPopover` sm con macros por 100 g (popover dice «por 100 g»); pill de porción pegajosa y señal dietaria quedan como están. Paleta: caps mono (`Sueles usar…`, `Favoritos…`) estilo mockup. | Multi-add, barra viva y «Crear “{q}”» intactos; teclado ↑↓↵ intacto. |
| V1.5 | Sonnet | `_quick-edit/microcopy.ts` | Agregar claves nuevas: `sparkAria(p,c,g)`, `sparkNoMacros`, `sparkPer100`, `sparkPctOfTarget(n)`, `metasPopover` («Metas del día»), `railApplyBase` («sin porciones · Aplicar del base»), `legendLabel` («P · C · G»). Español latam con tildes, estilo tabla existente. | Todas las superficies nuevas consumen QE_COPY (grep sin literales sueltos). |

## W2 — Cinta + rail + responsive (web)

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| V2.1 | Opus | `_quick-edit/QuickEditPlanView.tsx` (+ nuevo `_quick-edit/EditorRibbon.tsx`) | Cinta v2 SOLO ≥1024 en modo editor: PLAN §4 (identidad · anillo % + 3 micro-barras con token de macro · Metas ▾ / Descartar / Publicar + contador `aria-live`). Datos del día activo ya existentes (`dayTotals`). En <1024 queda el header actual. PublishBar sigue montada (móvil) pero en ≥1024 sus acciones se ocultan (la cinta manda) dejando solo totales — sin duplicar CTAs. | Publicar/descartar operan desde la cinta; anillo semántico (verde en banda, ámbar >100 %); sin doble CTA en ningún ancho. |
| V2.2 | Opus | `EditorRibbon.tsx` + `_quick-edit/TargetsEditorCard.tsx` | «Metas ▾»: popover (primitivo ui) que HOSPEDA `TargetsEditorCard` del día activo (misma instancia de lógica; solo cambia el host). El canvas deja de renderizarla en modo editor ≥1024; en <1024 y en quick-edit clásico se pinta como hoy (cero regresión). Errores de validación de targets fuerzan popover abierto (espejo del patrón forcedOpen de EditorMetaCard). | Steppers, fibra·sodio·agua y errores operan idénticos dentro del popover; flexible-sin-franjas sigue mostrando su card targets-only en canvas <1024. |
| V2.3 | Opus | `QuickEditPlanView.tsx` (+ nuevo `_quick-edit/EditorDayRail.tsx`) | Rail v2 ≥1024 según PLAN §4 (estados verde/ámbar, kcal por día vía `qeVariantTotalWithPortions` por variante, activo con borde sport, «＋ Agregar día» = `AddDayPopover`, enlace B4 → `APPLY_BASE_PORTIONS` + toast existente). `EditorDayCapsule` queda para <1024. `PortionsDayGapNotice` solo <1024. | Cambiar de día por rail = mismo comportamiento que cápsula; B4 desde rail aplica y el día pasa a verde; menú ⋮ del día intacto en el encabezado del canvas. |
| V2.4 | Sonnet | `QuickEditPlanView.tsx` | Leyenda P·C·G una vez junto al título del día (dots con token de macro, mono 9px) + limpieza de densidad del canvas según mockup (espaciados; `EditorMetaCard` header slim 1 línea colapsada — solo estilos). | Ninguna card/CTA desaparece; snapshot harness 1280 coincide con dirección del mockup (juicio del jefe). |
| V2.5 | Sonnet | archivos W1/W2 | Pasada responsive: aplicar tabla de la SPEC (anchos de columnas por breakpoint, cinta compacta 768–1023, canvas max-w 2xl, targets ≥44px coarse). | Script V0.4 en 5 anchos: sin overflow-x, cinta 1 línea, popover usable con touch en 390. |

## W3 — RN (espejo sobre editor T3.3b)

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| V3.1 | Opus | `apps/mobile/components/nutrition-v2/MacroSpark.tsx` + `MacroSparkPopover.tsx` (nuevos) | Espejo de V0.2/V0.3 consumiendo `macroCalorieShares` del paquete y los colores de macro del módulo RN existente. Popover: `Modal transparent` + `measureInWindow`, flip si no cabe, backdrop cierra, back cierra; UNO abierto. Pressable con style estático. | Render en ambas pantallas del editor; tap abre pegado al ancla en item arriba y abajo de la lista; dark/light/white-label OK. |
| V3.2 | Opus | `apps/mobile/components/nutrition-v2/quick-edit/EditableItemRow.tsx`, `EditableSlotCard.tsx`, `FoodSearchSheet.tsx` | Swaps espejo de V1.1/V1.2/V1.4 usando `nutrition-v2-food-media.ts` para fotos (34px, fallback categoría). Sin tocar acciones/sheets. | `tsc` mobile + `expo export --platform android` verdes; menú de item y multi-add intactos en smoke manual de emulador (AVD eva_pixel). |
| V3.3 | Sonnet | `quick-edit/PublishBar.tsx` RN + pantallas `app/coach/nutrition-v2/editor/[clientId].tsx`, `plantillas/editor.tsx` | Mini-cinta 1 línea (kcal x/meta + 3 % con dot de macro) sticky bajo el header + «Metas» al popover del header (espejo V2.2, mismo TargetsEditorCard RN re-hospedado); PublishBar conserva contador/CTAs/errores. | Paridad declarada en `MOBILE_PARITY.md` (tarea V5.2); safe areas respetadas. |

## W4–W5 — QA y cierre (owner + jefe; no workers)

| ID | Quién | Qué | DoD |
|---|---|---|---|
| V4.1 | jefe | Gates completos del PLAN + harness 5×2 + diff-guard: `git diff --stat` NO toca `builder/**`, alumno, `_actions`, `_data`, `services`, SQL | Todo verde; evidencia en el PR/commit |
| V4.2 | owner | QA visual preview web + QA device Android (incluye el pendiente T3.3b del editor RN: un solo pase) | OK explícito |
| V5.1 | jefe | OTA android ACUMULADO vía GH Actions `mobile-ota.yml` con `--platform android` (jamás sin plataforma; iOS intacto en App Review); luego `eas update:insights` | Update publicado + insights sin crashes/failed installs |
| V5.2 | jefe | Actualizar `CURRENT.md` (T3.v cerrada; programa queda solo con retiro agendado 30-08) + `MOBILE_PARITY.md` + índice de specs si aplica | `pnpm docs:check` verde |

## Opcional W-B (solo si sobra tiempo, mismo patrón, NO bloquea cierre)

| ID | Modelo | Qué |
|---|---|---|
| VB.1 | Opus | Ficha coach `[clientId]/SelectedDayPanel.tsx`: filas del «Hoy» con stack de fotos + spark (mockup A·3) |
| VB.2 | Opus | Roster hub `HubRoster.tsx`: columna «Hoy» con stack de fotos (mockup A·4) |

## Presupuesto de juicio del jefe (por wave)

Tras cada wave: revisar diffs contra mockups + esta tabla, correr harness, devolver al MISMO worker
lo deficiente con feedback concreto (política de orquestación del dueño). Nada se declara verde sin
ejecución real de gates.
