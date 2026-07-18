# R5 · Auditoría pixel 1:1 — COACH · Nutrición (RN vs web md<760)

Auditor pixel. Referencia = SOLO árbol web md<760 (móvil). Reglas: valores exactos
del web, prohibido heredar legacy, COPY neutralizado (sin voseo). Cada hallazgo:
**DIFF-pixel** (valor distinto) o **DIFF-ESTR** (elemento falta/sobra/otra forma).

Rutas RN (fixer edita acá):
- Hub: `apps/mobile/app/coach/(tabs)/nutricion.tsx`
- Builder: `apps/mobile/app/coach/nutrition-builder.tsx`
- Meal-groups: `apps/mobile/app/coach/meal-groups.tsx`
- ExchangeModePanel: `apps/mobile/components/coach/ExchangeModePanel.tsx`
- ExchangeTargetsEditor: `apps/mobile/components/coach/ExchangeTargetsEditor.tsx`
- Check-ins: `apps/mobile/app/coach/(tabs)/check-ins.tsx`

Web ref bajo `apps/web/src/app/coach/nutrition-plans/_components/` salvo indicado.

Fuentes RN (`lib/typography.ts`): `FONT.ui`=Hanken400, `uiSemibold`=600, `uiBold`=700,
`uiExtra`=800; `display`=Archivo700, `displayBold`=Archivo800, `displayBlack`=Archivo900;
`mono`=JetBrains400, `monoMedium`=500, `monoBold`=700. Clases NativeWind: `font-sans`=Hanken400,
`font-sans-semibold`=600, `font-sans-bold`=700, `font-display`=Archivo700, `font-display-bold`=Archivo800,
`font-mono`/`font-mono-medium`/`font-mono-bold`.

---

## HALLAZGO SISTÉMICO (aplica a TODO el dominio)

**S1 · Eyebrows/labels con peso equivocado.** El web usa para micro-labels (uppercase, ~10px)
la clase `text-[10px] font-black uppercase tracking-widest` (Hanken **900**, tracking 0.1em).
RN los rinde con `font-sans` (Hanken **400**, regular) o `TYPE.eyebrow`(uiBold 800). Revisar
CADA label uppercase: web=**font-black/uiExtra 900** siempre. Ocurrencias: builder `styles.label`,
`dayLabel`, `totalsLabel` (nutrition-builder.tsx:763/783/777 → `font-sans`); ExchangeModePanel
`eyebrow` (ExchangeModePanel.tsx:219 `font-sans`); ExchangeTargetsEditor `eyebrow`
(ExchangeTargetsEditor.tsx:199 `font-sans`). **DIFF-pixel** → cambiar a `uiExtra`/`font-sans-bold`.

**S2 · Notices Pro = ember en RN, warning en web.** Avisos "provisional"/"guardar plan primero"
usan en web tokens **warning** (`--warning-100/-500/-700`, ámbar). RN los pinta **ember**
(`bg-ember-100 border-ember-300 text-ember-700`). Ocurre en ExchangeModePanel (provisional
notice, ExchangeModePanel.tsx:100 vs web ExchangeModePanel.tsx:102), ExchangeTargetsEditor
(hint+badge, ExchangeTargetsEditor.tsx:76/93 vs web :76/103). **DIFF-pixel** → usar warning.

**S3 · Split de macros P/C/G — colores.** Web usa SIEMPRE ember-500(P) / sport-600(C) /
aqua-500(G) para las barras/dots de split (TemplateLibrary.tsx:409-411, FoodLibrary.tsx:554-556).
RN usa `MACRO_COLORS.protein/carbs/fats`. Verificar que MACRO_COLORS == {ember-500, sport-600,
aqua-500}; si difieren, alinear.

---

## 1. HUB · Header + Tabs (`NutritionHub.tsx`)

| Elemento | Web (valor · archivo:línea) | RN (valor · archivo:línea) | DIFF |
|---|---|---|---|
| Título "Nutrición" | `font-display font-extrabold text-2xl(24px) leading-tight` · NutritionHub:105 | fontSize **25**, displayBold, ls -0.5 · nutricion:1116 | pixel: 24 vs 25 |
| Subtítulo | "Planes, alimentos y recetas" `text-[13px] text-muted mt-0.5` · :108 | igual, 13/mt2 FONT.ui · :199/1117 | OK |
| Icono meal-groups | **oculto en móvil** (`hidden … md:inline-flex`), icono **BookOpen** 17px · :78-80 | **visible** botón `Layers` 18px 40×40 · nutricion:202-209 | **DIFF-ESTR**: web NO muestra este botón en móvil. RN lo muestra. (Ojo: quitarlo deja meal-groups sin acceso móvil → decisión producto; mínimo cambiar icono a BookOpen y tamaño 17) |
| Botón guía | icono **CircleHelp** 17px, 36×36 (h-9 w-9), border-1.5, rounded-control · GuideDialog:26-28 | `HelpCircle` 18px, 40×40, border-1 · nutricion:210-217 | pixel: 36 vs 40, border 1.5 vs 1, icono 17 vs 18 |
| Botón "Plantilla" | h-9(36) px-3.5 gap-1.5 text-[13px] font-bold, Plus 16 · :88-94 | height **40** px14 gap **5** · nutricion:1120 | pixel: 36 vs 40, gap 6 vs 5 |
| TabsList | `bg-surface-sunken p-[3px] gap-1(4px) rounded-control` · :129 | bg-secondary, gap **3**, pad 3, radius **14** · nutricion:1124 | pixel: gap 4 vs 3 |
| Tab seg | h-[46px] rounded-[11px] px-1 gap-0.5 · :136 | 46 / radius11 / px4 · nutricion:1125 | OK |
| Tab label | text-[12.5px] leading-none, inactivo `font-semibold text-muted`, activo `font-extrabold text-strong` · :138 | 12.5, uiSemibold/uiExtra, muted/foreground · :251 | OK |
| Tab count | `font-mono text-[10.5px] font-bold`, inactivo **text-subtle**, activo theme-primary · :148 | monoBold 10.5, inactivo **mutedForeground** · :254 | pixel: inactivo subtle vs muted |
| **Label tab 0** | móvil (<sm 640) muestra **"Planes"** (shortLabel), no "Plantillas" · :66/141-143 | "Plantillas" fijo · nutricion:184 | **DIFF-pixel COPY**: en móvil web dice "Planes" |
| Banner recetas (hub) | "Vienen incluidas en el módulo. Son inspiración — no afectan macros ni adherencia." + TierBadge base · :202-204 | (RN sólo tiene banner de RecipeLibrary, ver §5) | COPY divergente |

---

## 2. TAB PLANTILLAS · card (`TemplateLibrary.tsx`)

La card RN diverge fuerte del web. Web card (TemplateLibrary:382-504):

| Elemento | Web | RN (nutricion.tsx) | DIFF |
|---|---|---|---|
| Badge objetivo | `Badge neutral soft uppercase` "Déficit/Volumen/Mantenimiento" **arriba** del nombre · :390 | (no existe) muestra badge "N comidas" a la derecha · :428 | **DIFF-ESTR**: falta badge de objetivo; sobra badge de comidas |
| Nombre | `font-bold text-lg(18) truncate` (**Hanken** bold, NO display) · :394 | `displayBold(Archivo)` fontSize **16** · :427/1140 | **DIFF-pixel**: familia Hanken700 vs Archivo800; 18 vs 16 |
| Descripción | `text-sm text-muted line-clamp-2` · :396 | (no se muestra) | **DIFF-ESTR**: falta descripción |
| Kcal | arriba-derecha, `font-display font-black text-[19px] tabular-nums`, label "kcal" 10px semibold debajo · :400-403 | fila bajo nombre, `monoBold` **22px**, "kcal/día" inline 12px · :430/1141 | **DIFF-ESTR+pixel**: web=display-black 19 top-right "kcal"; RN=mono 22 inline "kcal/día" |
| Split bar | `h-1.5(6px) rounded-full`, ember-500/sport-600/aqua-500 · :407-412 | height **8**, radius4, MACRO_COLORS · :434/1142 | pixel: 6 vs 8; ver S3 |
| Macros | `font-mono text-[11px]` con ● color + "P {p}g · {pct}%" · :414-424 | `MacroPill` (label+valor, sin %) · :440-444 | **DIFF-ESTR**: web muestra gramos + % en mono con dots; RN pills sin % |
| Chips de comidas | slice(0,8) `text-[11px] font-semibold bg-sunken px-2 py-0.5 rounded-xs` + "+N" · :426-443 | (no existe) | **DIFF-ESTR**: faltan chips de nombres de comidas |
| Footer | Utensils + "N comidas" + Badge "N activos"; botones Editar/**Duplicar**/Eliminar (icon-sm) + "Asignar" (sport pill uppercase) · :448-502 | Editar/Asignar/Borrar (texto+icono inline) · :445-455 | **DIFF-ESTR**: falta Duplicar, falta "N activos", falta footer Utensils; orden/estilo distinto |
| Empty subtítulo | "Crea una plantilla de comidas reutilizable y asignala a tus alumnos en segundos." · :364 | "Crea tu primera plantilla para reutilizar planes de nutrición entre tus alumnos." · :411 | **DIFF COPY** |

**Filtros**: web sort recent/name/kcalDesc/kcalAsc + filtro objetivo (Todos/Déficit/Volumen/
Mantenimiento) + chips activos removibles (TemplateLibrary:222-266). RN sort igual pero **sin**
filtro objetivo ni chips activos. **DIFF-ESTR**: falta filtro por objetivo y chips.

---

## 3. TAB ALUMNOS · board (`ActivePlansBoard.tsx`)

RN cercano. Diffs:

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Sort opciones | name/plan/updated → "Alumno/Plan/**Actualizado**", default **name** · :81-86 | adherence/name/plan → "**Adherencia**/Alumno/Plan", default adherence · :467/555 | **DIFF-ESTR**: web tiene "Actualizado" (no Adherencia) y default Alumno |
| Avatar inicial | `charAt(0)` **sin uppercase**, `font-bold`(Hanken), bg `sport-100/ember-100` **sólido**, color `-600` · :136-140 | `.toUpperCase()`, displayBold, bg accent**+1A**(10%), color accent(500) · :590/596 | pixel: mayúscula, familia, bg sólido vs alpha, 600 vs 500 |
| "Últimos 7 días" | `text-[10px] font-black uppercase tracking-widest text-subtle` · :155 | eyebrow uiExtra 10, mutedForeground · :608/1135 | pixel: subtle vs muted, 900 vs 800 |
| "Hoy: X / Y kcal" | `text-[10px] text-muted tabular-nums` (**sans**), valor `font-bold text-strong` · :156 | fontSize **10.5** `FONT.mono`, valor monoBold · :609-611 | **DIFF-pixel**: web sans, RN mono; 10 vs 10.5 |
| Sparkline color | bg **accent** (sync=sport-500/custom=ember-500), gap-1(4), minH 6% · :169-180 | bg **adherenceColorFor(avg7d)** (verde/ámbar/rojo), gap 3, minH 8% · :613-616 | **DIFF-ESTR**: RN colorea por adherencia; web por sync/custom |
| Línea "Más detalle: perfil del alumno" | `text-[10px] text-subtle` · :182-184 | (no existe) | **DIFF-ESTR**: falta |
| Empty global | Users 48 + "No hay alumnos en tu cartera" (sin subtítulo) · :438-442 | + subtítulo "Cuando asignes planes…" · :526 | **DIFF-ESTR**: RN agrega subtítulo |
| Col título | `text-xs(12) font-extrabold uppercase`, count `text-[11px] font-bold` (sans) · :224-230 | colTitle 13 uiExtra, count monoBold 11 · :569-570/1150 | pixel: 12 vs 13, count sans vs mono |

---

## 4. TAB ALIMENTOS (`FoodLibrary.tsx` + `FoodListCompact.tsx`)

| Elemento | Web | RN (FoodsTab) | DIFF |
|---|---|---|---|
| Entry-card meal-groups | card arriba: Layers en caja sport-100 34×34 + "Grupos de comidas"/"Combos de alimentos reutilizables" + Chevron · FoodLibrary:197-209 | (no existe; meal-groups vive en header hub) | **DIFF-ESTR**: falta entry-card |
| Scope | all/mine, default **all** "Catálogo"/"Mis alimentos", en **bottom-sheet** de filtros · :354-374 | mine/all, default **mine** "Míos"/"Catálogo", chips inline · :678-688 | **DIFF-ESTR**: default y ubicación distintos; label "Míos" vs "Mis alimentos" |
| Pills de categoría | fila scroll `Todas/Proteína/…` sport-500 activo · :285-303 | (no existe) | **DIFF-ESTR**: falta filtro categoría |
| Sort | name/calories/protein (Nombre/Kcal/Proteína) en sheet · :379-397 | (no existe) | **DIFF-ESTR**: falta sort |
| Línea conteo | `eva-mono text-[11px] text-subtle` "N visibles · total en catálogo" · :307-311 | (no existe) | **DIFF-ESTR**: falta |
| Botón Nuevo | h-8 px-2.5 text-[12.5px] Plus 3.5 · :313-318 | height 38 px14 Plus16 texto 13 · :689-692/1175 | pixel: 32 vs 38, 12.5 vs 13 |
| Fila alimento (móvil) | `font-semibold text-sm` nombre + Star(mine)/Globe **a la derecha del nombre** (ember-500 fill/30); dcha `text-xs font-bold tabular-nums` "{cal} kcal/100g"; macros `text-[11px]` "P{p}g · C{c}g · G{g}g" con P/C/G en color ember/sport/aqua-600; Badge categoría · FoodListCompact:61-99 | fila: mark Star/Globe **a la izquierda** (star EMBER fill); nombre uiBold 14; macros `FONT.mono` "{cal} kcal · P.. C.. G.. / {serving}{unit}"; Pencil+Trash acciones · nutricion:711-731 | **DIFF-ESTR**: web mark a la derecha, "kcal/100g", macros con dots de color y badge; RN mark izquierda, incluye porción, sin colores, con iconos edit/delete |
| Delete | swipe/undo 5s (toast) · :96-122 | Alert confirm inline · :664-673 | patrón nativo (aceptable) |

---

## 5. TAB RECETAS (`RecipeLibrary.tsx` + `CreateRecipeDialog.tsx`)

| Elemento | Web | RN (RecipesTab) | DIFF |
|---|---|---|---|
| Banner base | TierBadge base + InfoTooltip + "Ideas de recetas — inspiración para tus alumnos. No afectan macros ni adherencia." · RecipeLibrary:52-61 | Badge `aqua` "Base" + mismo texto · nutricion:859-864 | COPY ok; badge tone aqua vs TierBadge |
| Card layout | **vertical**: imagen aspect-16/9 arriba, contenido debajo · :126-156 | **horizontal**: thumb 84×84 a la izquierda · :895-921/1199-1201 | **DIFF-ESTR**: layout distinto (vertical vs horizontal) |
| Nombre | `font-black text-base(16) leading-tight tracking-tight line-clamp-2` (**Hanken 900**) · :148 | `displayBold`(Archivo) 15.5 · :904/1201 | **DIFF-pixel**: Hanken900 vs Archivo800, 16 vs 15.5 |
| Ingredientes | `text-xs line-clamp-3 whitespace-pre-line` · :152-156 | 12/lh17 `numberOfLines={2}` · :906 | pixel: 3 vs 2 líneas |
| Botón Compartir | icono **Users** 3.5, `flex-1 h-9 gap-1.5 font-bold uppercase tracking-widest text-[10px]` primary · :159-167 | icono **Share2** 14, height 34 radius10, "Compartir" 12 uiBold (no uppercase) · :909-912/1203 | **DIFF-ESTR+pixel**: icono Users vs Share2; uppercase 10px vs normal 12px; h36 vs 34 |
| Edit/Delete | h-9 w-9 rounded-xl border, Pencil/Trash 3.5 · :168-192 | 34×34 radius10 · :913-918/1204 | pixel: 36 vs 34 |
| Empty | ChefHat en caja ember-100 12×12; "Todavía no tienes recetas"; "Crea ideas… 30 segundos." · :106-114 | EmptyState ChefHat mismo copy + botón "Nueva receta" · :877-881 | OK (RN agrega botón, web usa CreateRecipeDialog default) |

**Dialog "Nueva/Editar receta"** (CreateRecipeDialog vs RecipeForm nutricion:939-1016):
- Web título con caja ember-100 + ChefHat 4×4 + `font-display text-[19px] font-extrabold` (:125-130). RN `NativeDialog title` plano. **DIFF-ESTR**: falta ícono en título.
- Web banner interno "Ideas de recetas…" surface-sunken (:133-137). RN no lo tiene dentro del form. **DIFF-ESTR** menor.
- Web labels campos `text-[10px] font-black uppercase tracking-widest` (:141 etc). RN usa `Input label`/`Textarea label` DS. Verificar peso (ver S1).
- Web nota imagen: "Se optimiza a **WebP** … JPG, PNG, WebP o HEIC, hasta **8 MB**." (:242). RN: "Se optimiza a **JPEG** … Hasta **2 MB**." (:1003). **DIFF COPY**.
- Web tiene opción "o pega una URL" (Link2) (:245-266). RN no. **DIFF-ESTR** menor.

---

## 6. DIALOG GUÍA (`CoachNutritionGuideDialog.tsx`)

**DIFF-ESTR grande.** Web = "Guía rápida — Nutrición" (`font-display text-xl font-extrabold`,
:34) + "Tres pasos para sacar provecho al módulo. Puedes volver aquí cuando quieras." + 3 pasos
onboarding (icono/CTA, COACH_NUTRITION_ONBOARDING_STEPS) + sección "Qué incluye nutrición" con
TierBadges (NUTRITION_SURFACES). RN = "Cómo funciona" + 3 GuideRow de lógica sync/custom
(nutricion:323-329). Contenido totalmente distinto. Fixer: transcribir estructura web (3 pasos +
lista de superficies) o dejar constancia de divergencia deliberada.

---

## 7. MEAL-GROUPS (`meal-groups.tsx` vs `MealGroupLibraryClient.tsx` + `MealGroupModal.tsx`)

**Lista:**

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Header | sin back/título propio (lo pone page.tsx) | back-btn 40×40 + "Grupos de comidas"/"Conjuntos de alimentos reutilizables" · meal-groups:174-191 | RN agrega header nativo (aceptable); verificar subtítulo vs page |
| Botón "Grupo" | h-11(44) px-3.5 text-[13px] Plus4 · MGLibrary:81-92 | height **48** px16 · meal-groups:386 | pixel: 44 vs 48 |
| Nombre grupo | `text-[15.5px] font-bold` (**Hanken**) · :118 | `displayBold`(Archivo) 16 · :310/391 | **DIFF-pixel**: familia + 15.5 vs 16 |
| Meta | `eva-mono text-[11.5px]` "N ingredientes · ~X kcal · Yg P" · :119-121 | `font-mono` 11.5 "N ingrediente(s) · ~X kcal" · :311-313 | **DIFF-ESTR+COPY**: web incluye "· Yg P"; web siempre plural |
| MacroPills P/C/G | (no existe en web) | macrosRow con 3 MacroPill · :325-329 | **DIFF-ESTR**: RN agrega pills |
| Edit/Delete | 34×34 rounded-[10px] border-1.5, ambos neutral (hover danger) · :124-142 | 36×36 border1; delete con bg destructive+14 fijo · :316-321/394 | pixel: 34 vs 36; RN delete tinte rojo permanente |
| Empty subtítulo | "Crea tu primer grupo de alimentos para **usarlo** en tus planes." · :103-107 | "…para **reutilizarlo** en tus planes." + botón "Nuevo grupo" · :299-301 | **DIFF COPY**; RN agrega botón |

**Editor** (RN inline vs web `MealGroupModal` — **no auditado en profundidad**, requiere pasada
dedicada). RN: `meal-groups.tsx:196-277`. Transcribir valores exactos del MealGroupModal.

---

## 8. BUILDER (`nutrition-builder.tsx` vs `PlanBuilder/*`)

Web = 2 columnas (sidebar + canvas) que apila en móvil (`lg:flex-row`, PlanBuilder:726). RN = 1
columna: meta+objetivos arriba, comidas abajo. Estructura OK; diffs de contenido:

### 8a. TopBar
| Elemento | Web (sidebar no tiene topbar; save en sidebar) | RN | DIFF |
|---|---|---|---|
| Header | — (web guarda desde botón sidebar full-width) | back "Volver" + título centrado 15 + "Guardar" 84×36 · builder:424-438/755-760 | patrón móvil (aceptable) |

### 8b. Objetivos (web `PlanBuilderSidebar` vs RN)
| Elemento | Web | RN | DIFF |
|---|---|---|---|
| **Hero "Objetivo diario"** | card `surface-inverse` p-5: eyebrow sport-500 + kcal `font-display text-[30px] font-black` + PenLine edit; fila P/C/G `font-display text-[18px] font-black` color ember-400/sport-400/aqua-400 · Sidebar:226-264 | (no existe) sólo Label "Objetivos diarios" + 4 inputs planos · builder:449-464 | **DIFF-ESTR grande**: falta la hero card inverse |
| Toggle auto | `Zap` + "Auto" + Switch + InfoTooltip; box verde "Calculando metas en tiempo real…" · :266-295 | chip texto "Auto desde alimentos ✓" / "↺ Auto desde alimentos" · :451-457 | **DIFF-ESTR**: web Switch+box; RN chip texto |
| Suma real | box con Progress bar + "X / Y kcal" + grid P/C/G · :327-340 | box "Suma de alimentos" label + `mono-medium` "X kcal · P.. C.. G.." (sin barra ni target) · :488-493 | **DIFF-ESTR**: falta Progress + comparación vs meta |
| Macros sugeridos | colapsable inline usa peso/altura de perfil, pide edad/género/actividad/objetivo · :356-487 | botón "Calcular metas (Mifflin-St Jeor)" → NativeDialog pide peso/altura/edad/… · :466/686-705 | **DIFF-ESTR**: inline collapsible vs dialog; web usa perfil |
| Mismatch >5% | AlertTriangle warning "Los macros reales difieren más de un 5% de la meta." + botón sync · :342-354 | (no existe) | **DIFF-ESTR**: falta aviso de mismatch |
| Objetivos por comp. corporal | panel inline sport, Katch/Cunningham + %grasa/LBM · :490-677 | botón → BodyCompGoalsSheet (Pro badge sport) · :469-485 | **DIFF-ESTR**: inline vs sheet (verificar sheet aparte) |

### 8c. Meal card (web `MealBlock` vs RN)
| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Handle orden | `GripVertical` drag h-5 · MealBlock:117-124 | botones ChevronUp/Down move · builder:535-540 | patrón móvil (aceptable) |
| Badge comida | ember-100 h-9(36) rounded-control, Utensils 18px ember-700 · :125-130 | 36×36 bg-ember-100, Utensils 18 EMBER_ICON · :531-533/781 | OK |
| Menú "…" | DropdownMenu MoreVertical con **"Guardar como grupo"** (Layers) · :137-157 | (no existe) | **DIFF-ESTR**: falta acción "Guardar como grupo" |
| Día del plan | **Select** dropdown (Todos los días/Lunes…Domingo) + InfoTooltip + helper "Todos los días: … (1=lun … 7=dom, zona Santiago)." · :163-191 | fila de **chips** horizontales DAY_OF_WEEK, label sin tooltip ni helper · :547-558 | **DIFF-ESTR**: web Select+helper+tooltip; RN chips |
| Empty meal warn | **siempre** visible cuando 0 items, "…para conservar consistencia del plan." · :219-223 | sólo tras intento de guardar (`showEmptyWarn`), texto truncado "…agrega al menos 1 alimento." · :638-642 | **DIFF-ESTR+COPY** |
| Botón add food | `variant outline border-dashed` neutral · :242-247 | border-primary/40 + texto primary · :646-650 | pixel: web neutral, RN primary |

### 8d. Food item (web `FoodItemRow` vs RN item row builder:561-621)
| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Línea macros por item | **no existe** (web sólo nombre+cantidad+unidad en la base) · :120-165 | `font-mono` "{cal} kcal · P.. C.. G.." bajo el nombre · :569-571 | **DIFF-ESTR**: RN agrega macro-line no presente en web |
| Nombre | `text-sm(14) font-semibold` + marca `text-[10px]` · :120-125 | `font-sans-semibold` 13, sin marca · :568/788 | pixel: 14 vs 13; falta marca |
| Cantidad | Input `h-9 w-20 font-mono` · :126-143 | TextInput w62 h44 mono · :579-588/791 | pixel: 80 vs 62 |
| Unidad | **Select** dropdown h-9 w-20 + InfoTooltip · :144-161 | chips g/un toggle · :589-599 | **DIFF-ESTR**: Select vs chips |
| Quitar | `Trash2` ghost h-9 w-9 · :162-164 | icono **X** 16 · :600-602 | **DIFF-pixel**: icono Trash vs X |
| Swaps | **inline** bajo el item: card aqua con nombre/porción/qty/unit + chips macro P/C/G/kcal · :181-267 | en **FoodSwapSheet** aparte (botón "N alternativas"/"Configurar cambios") · :604-611 | **DIFF-ESTR**: web inline, RN bottom-sheet (verificar FoodSwapSheet aparte) |
| Botón "Configurar cambios" | outline h-8 + InfoTooltip, label fijo · :167-179 | tinte ember si hay swaps, label cambia a "N alternativas", flex-1 · :605-611/797 | **DIFF-ESTR**: RN cambia label/color |

### 8e. Add meal
Web: MealCanvas botón (no leído a fondo). RN: `UtensilsCrossed 17 + "Agregar comida" font-display 14`
(builder:655-658). Verificar contra MealCanvas.

---

## 9. ExchangeModePanel (RN vs web `PlanBuilder/ExchangeModePanel.tsx`)

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Tile ember título | (no existe) | badge ember 32×32 ArrowLeftRight · ExMode(RN):72-74 | **DIFF-ESTR**: RN agrega tile |
| Título | `text-sm font-black tracking-tight` (Hanken900) + InfoTooltip · web:66-69 | `display-bold`(Archivo) 14 + subtítulo (tooltip como texto fijo 2 líneas) · RN:76-78 | **DIFF-ESTR+pixel**: familia; tooltip→subtítulo |
| Control modo | **Switch** con "Gramos"/"Porciones" flanqueando · web:71-90 | **SegmentedTabs** full-width abajo · RN:81-91 | **DIFF-ESTR**: Switch vs Segmented |
| Provisional notice | warning tokens · web:102 | ember tokens · RN:100 | ver S2 |
| Totales vs goal | `text-[11px] font-bold tabular-nums` (sans) · web:121 | `mono-medium` 10.5 · RN:110-112 | **DIFF-pixel**: sans vs mono |
| Selector PDF | pill buttons radiogroup · web:197-219 | SegmentedTabs · RN:177-184 | **DIFF-ESTR**: pills vs segmented |
| Botón PDF | h-11 w-full FileDown · web:221-229 | height 46 · RN:185-201/236 | pixel: 44 vs 46 |

---

## 10. ExchangeTargetsEditor (RN vs web `PlanBuilder/ExchangeTargetsEditor.tsx`)

Mirror cercano. Diffs:

| Elemento | Web | RN | DIFF |
|---|---|---|---|
| Wrap bg | `bg-surface-sunken/20` · web:69 | `bg-surface-sunken/40` · RN:71 | pixel: opacidad 20 vs 40 |
| Grid grupos | `grid-cols-1 sm:grid-cols-2` · web:108 | columna única · RN:98/205 | OK en móvil (<640 web=1col) |
| Group dot | h-7 w-7(28) text-[10px] font-black · web:120-126 | 28×28, texto 9.5 w900 · RN:110-111/207-208 | pixel: 10 vs 9.5 |
| Group name | `text-xs(12) font-bold` · web:128 | `font-sans-semibold` 12.5 · RN:114/209 | pixel: 700→600, 12→12.5 |
| Group ref | `text-[10px] text-muted` (sans) · web:129 | `font-mono` 10 · RN:115/210 | **DIFF-pixel**: sans vs mono |
| Stepper btn | h-11 w-11(44) rounded-xl · web:140-143 | 40×40 rounded-control · RN:127/212 | pixel: 44 vs 40 |
| Valor porción | `w-8 text-sm font-black tabular-nums` (sans) · web:144 | w32 14 `mono-bold` · RN:132/213 | **DIFF-pixel**: sans-black vs mono |
| Summary label | `text-xs font-black` (Hanken900) · web:163 | `font-display`(Archivo) 12.5 · RN:152/215 | **DIFF-pixel**: familia |
| Hint/badge | warning tokens · web:76/103 | ember tokens · RN:76/93 | ver S2 |
| Eyebrows | `font-black uppercase` · web:71/174 | `font-sans` · RN:73/199 | ver S1 |
| Variant chips | `min-h-9 rounded-lg px-2.5 py-1 text-[11px] font-bold`, activo theme-primary · web:181-205 | `minHeight 34 rounded-pill px12` semibold 11.5 · RN:167-186/219 | pixel: rounded-lg vs pill, font-bold vs semibold |

---

## 11. CHECK-INS (`(tabs)/check-ins.tsx`)

**Sin pantalla web 1:1** (en web los check-ins viven per-alumno en `ProfileCheckInSnapshot.tsx`
bajo `coach/clients/[clientId]/`). El RN es un feed agregado móvil. Ya usa primitivas DS correctas
(`TYPE`, `textStyle`, `FONT`, ScreenHeader, Card). Recomendación: auditar la **card** contra
`ProfileCheckInSnapshot.tsx` en una pasada dedicada (peso/energía-estrellas/notas/toggle revisado).
No se detectó uso de mono legacy. Prioridad baja vs el resto del dominio.

---

## PENDIENTE (no auditado a fondo — requieren pasada dedicada)
- `FoodSearchSheet.tsx` / `FoodSwapSheet.tsx` (RN) vs `PlanBuilder/FoodSearchDrawer.tsx` (web).
- `MealGroupModal.tsx` (web) vs editor inline meal-groups (RN).
- `MealCanvas.tsx` (web) botón "Agregar comida" y wrapper de meal.
- `BodyCompGoalsSheet.tsx` (RN) vs panel body-comp del sidebar web.
- Verificar tokens `MACRO_COLORS` == {ember-500, sport-600, aqua-500} (S3).
