# Auditoría de fidelidad visual — Nutrición (coach) · 2026-07-01

Comparación kit Claude Design (eva-app/screens/coach-nutrition*.jsx + eva-desktop) vs implementación
(`apps/web/src/app/coach/nutrition-plans/**` + `foods/` + `recipes/` + `meal-groups/`).

Nota de método: los tokens shadcn legacy (`bg-card`, `border-border`, `text-muted-foreground`, `bg-muted`)
están **bridgeados** a superficies EVA en `globals.css` (`--card: var(--surface-card)`, `--border: var(--border-subtle)`,
`--muted: var(--surface-sunken)`, `--primary: var(--theme-primary)`) — NO se reportan como gap por sí solos.
Los gaps reales son paletas **hardcodeadas** (zinc/slate/white, violet/indigo, blue/emerald/purple/amber/rose/orange)
que bypasean el sistema, y patrones/jerarquías que no matchean el kit.

---

## [P0] "Grupos de comidas" inalcanzable — pantalla del kit huérfana

- **Kit:** `coach-nutrition.jsx` `FoodLibraryTab` líneas 494-501 — la pestaña Alimentos abre con un
  entry-card "Grupos de comidas · Combos de alimentos reutilizables" (tile layers sport-100 + chevron)
  que navega a `MealGroupsScreen` (`coach-nutrition-extras.jsx:17-75`). En desktop, el maestro-detalle
  de Nutrición expone la acción `book-open` "Grupos de alimentos" en el title-bar (`eva-desktop/index.html:1270`).
- **App:** `apps/web/src/app/coach/meal-groups/page.tsx` existe (skin pre-DS: `border-border`+`text-primary`,
  back a `/coach/dashboard`) pero **ningún componente de la app la linkea** (grep `/coach/meal-groups` en
  `apps/web/src` → solo la propia página y sus actions). La pestaña Alimentos (`_components/FoodLibrary.tsx`)
  no tiene la entrada; el hub (`NutritionHub.tsx`) tampoco; el builder no permite insertar un grupo en una comida.
- **Diferencia visual/estructural:** una sección completa del kit (grupos reutilizables) quedó sin puerta de
  entrada — el coach no puede llegar a ella navegando.
- **Fix:** agregar el entry-card del kit al tope de la pestaña Alimentos (y/o acción en el TopBar del hub),
  y re-skinear `meal-groups/page.tsx` + `MealGroupModal` al DS (hoy legacy). Ideal: permitir insertar grupo
  desde el FoodSearchDrawer como en el kit ("insertarlos de una en cualquier comida").
- **Verdict:** CONFIRMED — grep `meal-groups` en `apps/web/src` (y en `master` vía `git grep`): CERO links
  entrantes fuera de la propia página; `getCoachSavedMeals` (nutrition-coach.queries.ts:517) es dead code
  (0 consumidores); el builder solo LEE `template_meal_groups` ya existentes (mappers), sin UI de inserción.
  Kit verificado: entry-card en `FoodLibraryTab` (coach-nutrition.jsx:494-501) + acción `book-open`
  "Grupos de alimentos" en el title-bar desktop (eva-desktop/index.html:1270). No hay decisión documentada
  de deprecar la superficie (docs/audits/nutricion-md/n6 la trata como feature viva; el audit de menú previo
  ya flagueaba la falta de affordance como gap). Orphan pre-existe al rediseño (también en master), pero el
  kit ES la fuente del rediseño y define la puerta — el gap de fidelidad es real y visible en la pestaña.

## [P1] FoodSearchDrawer del builder — paleta zinc hardcodeada de punta a punta (~56 hits)

- **Kit:** `coach-nutrition-builder.jsx` `FoodSearchDrawer` 478-526 y `NewFoodSheet` 530-608 — sheet
  `surface-card` con `radius-sheet`, handle `ink-200`, título `font-display` 800 normal-case, buscador
  `surface-sunken`, pills de categoría con inversión `text-strong`, filas con macros `eva-mono`, filas de
  alergia `danger-100`/`danger-300`, corazón ember para favoritos, CTA dashed sport "Crear alimento nuevo".
- **App:** `_components/PlanBuilder/FoodSearchDrawer.tsx:495-816` — todo el drawer usa
  `bg-white dark:bg-zinc-900`, `border-zinc-200 dark:border-white/10`, `text-zinc-400/500/700/900`,
  `bg-zinc-100`, pills `bg-zinc-100 text-zinc-500`; título `uppercase tracking-widest text-zinc-800`
  (no font-display); el form "Nuevo alimento" (630-720) y el paso de cantidad (727-816) enteros en zinc;
  el confirm de alergia usa `bg-white ... dark:bg-zinc-900` (839). La estructura sí espeja el kit
  (sheet móvil/modal desktop, pills, alergia danger, favorito Heart, crear alimento) — lo roto es el skin.
- **Fix:** swap mecánico zinc→tokens (`bg-surface-card`, `border-subtle`, `text-muted/subtle/strong`,
  `bg-surface-sunken`, `rounded-t-sheet`) + título en `font-display font-extrabold` normal-case.
  Es la superficie más usada del builder; quedó fuera del re-tokenizado de 25c77d62.
- **Verdict:** CONFIRMED — `grep -c zinc` = exactamente 56 hits; verificado línea a línea: panel
  `bg-white dark:bg-zinc-900` (504), header/inputs/pills/create/quantity/allergy-confirm todos zinc
  (511, 527, 552, 569, 630-720, 727-822, 839); título `font-black uppercase tracking-widest text-zinc-800`
  (527-529) vs kit `font-display` 800 normal-case (builder.jsx:491). Los macros SÍ usan ember/sport/aqua
  (736-738, 797-805) — consistente con lo reportado (skin roto, estructura OK). Nit menor de cita: el
  handle `ink-200` es del `NewFoodSheet` del kit (570); el `FoodSearchDrawer` del kit usa `border-default` (490).

## [P1] Modales Asignar plantilla / Compartir receta / Crear alimento / Nueva receta — skin legacy slate/zinc

- **Kit:** `AssignModal` (`coach-nutrition.jsx:575-630`) y `AssignRecipeModal` (`extras.jsx:144-180`) son
  bottom-sheets EVA: eyebrow uppercase subtle + nombre en `font-display` 800, filas con `Avatar` y estado
  contextual ("Ya tiene esta plantilla · reasignar actualiza" en sport-600 / "se reemplaza" en warning-700),
  selección con borde+fondo sport-100 (ember para receta), check circle 22px, CTA sport "Asignar (N)".
  `NewFoodSheet` ídem con hint-card sunken "Cómo cargar los datos".
- **App:**
  - `_components/AssignModal.tsx:92-241` — Dialog centrado `bg-white dark:bg-zinc-950 border-slate-200`,
    título "**Asignar protocolo**" `font-black uppercase tracking-tight` (copy y tipografía legacy),
    filas `bg-white dark:bg-zinc-900 border-slate-100`, labels `text-slate-400`, warning `bg-amber-500/10
    text-amber-700`, sin Avatar. Los sub-textos de estado sí usan sport-600/warning-700 (parcial).
  - `_components/recipes/AssignRecipeModal.tsx:61-166` — mismo patrón slate/zinc (aunque la selección sí
    usa ember-100/ember-500 ✓).
  - `_components/FoodLibrary.tsx:200-206` (dialog "Crear alimento custom") y
    `_components/recipes/CreateRecipeDialog.tsx:122-128` — `bg-white dark:bg-zinc-950`, títulos
    `font-black uppercase tracking-tighter`.
- **Fix:** en móvil render como bottom-sheet DS (patrón ya existente en ActivePlansBoard); tokens
  surface/border/text; títulos font-display normal-case con eyebrow; Avatar en filas; copy "Asignar plantilla".
- **Verdict:** CONFIRMED — todas las citas exactas: AssignModal.tsx:92 `bg-white dark:bg-zinc-950
  border-slate-200`, 96-98 "Asignar protocolo" `font-black uppercase tracking-tight`, filas 174
  `bg-white dark:bg-zinc-900 border-slate-100`, label 118 `text-slate-400`, warning 219 amber, sin Avatar
  (kit sí: coach-nutrition.jsx:612); estados parciales sport-600/warning-700 en 203/207 ✓.
  AssignRecipeModal.tsx:61 mismo patrón con selección ember ✓ (132/140). FoodLibrary.tsx:200-202 y
  CreateRecipeDialog.tsx:122-124 `bg-white dark:bg-zinc-950` + títulos `font-black uppercase tracking-tighter`.

## [P1] Pestañas Alimentos/Plantillas/Recetas sin el patrón unificado buscador + "Filtros y orden"

- **Kit:** las 4 pestañas comparten `searchBox` (42px, clear-btn) + `nutriFiltersBtn` (badge dot activo) +
  `NutriActiveChips` + `NutriFilterSheet` + result-bar (`coach-nutrition.jsx:90-135, 197-212`).
  Alimentos suma pills de categoría estilo `nutriSelPill` (sport-500 activo) + línea de conteo mono +
  botón "Nuevo" sport chico, y la lista es una Card única con separadores, estrella **ember** para propios,
  macros `eva-mono`, badge categoría, y **editar**+eliminar para propios (516-553).
- **App:** solo el board Alumnos recibió el patrón (✓ `ActivePlansBoard.tsx:269-398`).
  - `FoodLibrary.tsx:180-271`: buscador `h-12 rounded-2xl bg-muted/30` distinto, filas de botones
    "ORDEN"/"ALCANCE" uppercase `variant=default/outline` (no sheet, no chips), categorías como `Badge`
    default/outline (no pills sport), sin entry de grupos (ver P0).
  - `components/coach/FoodListCompact.tsx`: tabla con header "LISTA COMPACTA" uppercase, estrella en
    `text-primary` (kit: ember), **sin acción editar** para alimentos propios (kit sí, 548).
  - `TemplateLibrary.tsx:135-145`: solo buscador — faltan filtro por objetivo y orden (kit 426-429).
  - `recipes/RecipeLibrary.tsx`: **sin buscador ni filtro por momento** (kit 391-394, 430-432).
- **Fix:** reutilizar el trío searchbox/filter-sheet/chips del board en las otras 3 pestañas; re-skinear
  FoodLibrary con pills sport y lista tipo Card del kit; agregar editar-alimento-propio.
- **Verdict:** CONFIRMED — verificado por pestaña: ActivePlansBoard SÍ tiene el patrón (269-398:
  "Filtros y orden" + SlidersHorizontal + "Ver resultados"); FoodLibrary usa filas de Buttons
  ORDEN (209-229) / ALCANCE (231-251) uppercase y categorías `Badge` (253-271), sin sheet/chips/entry-grupos;
  TemplateLibrary 135-145 = solo buscador (kit 426-429 tiene Objetivo+Orden); RecipeLibrary = 0 hits de
  search/filter/momento (grep); FoodListCompact sin acción editar para propios (solo Trash2, 75-84/125-134;
  kit 548 tiene pencil-line) y estrella `text-primary` (66/107) vs ember-500 del kit (542).

## [P1] Paleta de macros NO canónica en lista de alimentos y gate

- **Kit (canónico, repetido en template card, builder y drawer):** P = `--ember-500`, C = `--sport-600`,
  G = `--aqua-500` (`coach-nutrition.jsx:345-354`).
- **App:**
  - `components/coach/FoodListCompact.tsx:89-91` y `120-122` — P=`blue-600`, C=`emerald-600`, G=`purple-600`.
  - `nutrition-plans/page.tsx:92` (mockup del gate) — P=blue, C=amber, G=rose.
  - En cambio `TemplateLibrary.tsx:197-211`, `NutritionRosterMasterDetail.tsx:307-311` y
    `FoodItemRow.tsx:247-259` SÍ usan la canónica ✓.
- **Diferencia visual:** el mismo dato (macros) cambia de color según pantalla — rompe el lenguaje del DS.
- **Fix:** unificar a ember/sport/aqua en FoodListCompact y el gate.
- **Verdict:** CONFIRMED — citas exactas: FoodListCompact 89-91 y 120-122 = `text-blue-600/90`,
  `text-emerald-600/90`, `text-purple-600/90`; gate page.tsx:92 = blue/amber/rose. Canónica verificada en
  kit (coach-nutrition.jsx:346-353) y en TemplateLibrary 196-211 ✓, NutritionRosterMasterDetail 307-311 ✓
  e incluso CustomFoodForm de FoodLibrary (419-421) ✓ — la inconsistencia intra-app es real, misma pestaña
  Alimentos mezcla ambas paletas (form canónico, lista blue/emerald/purple).

## [P1] Sidebar del builder: paneles violet/indigo (hues fuera del DS) + falta el hero inverse "Objetivo diario"

- **Kit:** `coach-nutrition-builder.jsx:152-168` — "Objetivo diario" es una Card **inverse** (fondo ink)
  con eyebrow sport-500, métrica display 30px de kcal y trio de macros en ember-400/sport-400/aqua-400;
  el panel "Macros sugeridos" (171-221) es una Card con tile `aqua-100/aqua-700` (icono calculator) y
  segmentos `nbSeg` en sport-100/sport-700.
- **App:** `PlanBuilderSidebar.tsx` —
  - 313-443 "Macros sugeridos (Mifflin-St Jeor)": `border-violet-500/25 bg-violet-500/5 text-violet-700`,
    icono Sparkles violet. **Violet no existe en los tokens EVA.**
  - 447-633 "Objetivos por composición corporal": ídem con **indigo** (tampoco existe en el DS).
  - 255-280: el objetivo diario es una grilla plana de 4 inputs — no existe el hero inverse con la kcal
    en tipografía display (la pieza más distintiva del builder del kit). El hero inverse sí se construyó
    para el detalle del maestro-detalle (`NutritionRosterMasterDetail.tsx:334-366`) — falta portarlo/
    adaptarlo al builder (p. ej. hero inverse arriba + inputs al expandir).
- **Fix:** violet→aqua (sugeridos) e indigo→aqua o sport (body-comp, diferenciar con badge Pro sport);
  agregar hero inverse de objetivo diario con métrica display.
- **Verdict:** CONFIRMED — PlanBuilderSidebar 313 `border-violet-500/25 bg-violet-500/5` + violet en
  329/330/341/415/418/430; 447 `border-indigo-500/25 bg-indigo-500/5` + indigo en 462/466/469; grep
  `violet|indigo` en globals.css = 0 matches (no son tokens EVA; sport-500=#2680FF confirmado). Objetivo
  diario = grilla plana de 4 inputs (255-280); grep `inverse|Objetivo diario` en PlanBuilder/ = 0 hits
  (el hero no vive en ningún hermano/breakpoint). Kit verificado: hero inverse builder.jsx:152-168 y
  panel sugeridos con tile aqua-100/aqua-700 + nbSeg sport-100/sport-700 (633-635) ✓. Nota atenuante:
  el resultado sugerido SÍ pinta P/C/G en ember/sport/aqua (420-424) — el hue off-DS es el contenedor.

## [P1] Detalle del maestro-detalle sin "Comidas del plan"

- **Kit:** `NutritionPlanCoach` (`coach-nutrition.jsx:671-684`) — tras el hero y los macros lista las
  comidas del plan en una Card con separadores (tile utensils ember-100, nombre, items, kcal mono).
  Además trae "Nota privada del coach" (686-691) y "Comentarios con {alumno}" (693-707).
- **App:** `NutritionRosterMasterDetail.tsx` `PlanDetail` (313-435) — hero ✓, macros ✓, sparkline ✓,
  pero salta directo al CTA "Gestionar plan": el coach no ve las comidas sin entrar al editor, y el
  dato está disponible (el plan tiene `nutrition_meals`).
- **Fix:** agregar la Card "Comidas del plan" (lista read-only con kcal por comida) entre macros y CTA.
  Nota privada y thread de comentarios son features que hoy no existen en el producto — quedan anotadas
  como deuda del kit (ver P2).
- **Verdict:** CONFIRMED — PlanDetail (313-435) va hero inverse → macros → sparkline 7d → CTA, sin Card
  de comidas; el propio código se declara "espejo de NutritionPlanCoach" (comentario línea 289) y el kit
  espejado SÍ la tiene (coach-nutrition.jsx:671-684, ListRow tile utensils ember-100 + kcal mono); en el
  desktop del kit el detalle ES NutritionPlanCoach (index.html:1272). El board query trae
  `nutrition_meals(count)` y hay query hermana de meals — dato alcanzable. Split correcto del audit:
  nota privada/comentarios (features inexistentes) relegados a P2.

## [P1] Upgrade gate de Nutrición — sin re-skin EVA DS

- **Kit:** `NutritionUpgradeGate` (`coach-nutrition-extras.jsx:183-228`) — TopBar "Nutrición · Módulo Pro",
  Card inverse hero con tile sport-500 y display 24px, feature-tiles `sport-100/sport-600`, pricing cards
  con borde sport y badge -20%, CTA sport "Mejorar a Pro".
- **App:** `nutrition-plans/page.tsx:40-137` — hero `border-emerald-500/20 bg-gradient emerald`, mockup con
  emerald/blue/amber/rose hardcodeado, CTA `bg-emerald-500`. Emerald no es token del DS (sport = azul #2680FF).
- **Fix:** re-skin con la receta del kit (inverse hero + tiles sport + pricing cards DS).
- **Verdict:** CONFIRMED — page.tsx 44-54 hero emerald gradient, 61-98 mockup emerald + macros blue/amber/rose
  (92), CTA 130 `bg-emerald-500`; kit gate verificado (extras.jsx:183-228: Card inverse + tile sport-500 +
  feature-tiles sport-100/sport-600 + pricing con borde sport y badge -20% + CTA sport). Chequeada la
  hipótesis "emerald = decisión de marca intencional": NO — es skin legacy pre-DS (UpsellGate.tsx usa los
  mismos accents violet/emerald hardcodeados y ningún gate fue re-skineado aún); el kit del rediseño define
  explícitamente este gate en sport. sport-500=#2680FF confirmado en globals.css:350.

---

## [P2] MealBlock sin resumen kcal por comida ni acordeón

- Kit (`builder.jsx:277-291`): header de comida con "N alimentos · X kcal · día" clickeable que colapsa/expande
  el detalle. App (`MealBlock.tsx`): siempre expandido y **no muestra kcal por comida en ningún lado**;
  el select "Día del plan" ocupa lugar prominente arriba (kit lo pone chico al fondo del detalle).
  Fix: línea resumen mono bajo el nombre (+ opcional colapso).

## [P2] Modo Porciones: totales derivados sin barras de progreso + tiles de grupo distintos

- Kit (`builder.jsx:363-379`): "Totales derivados" con 4 barras por macro (sport/ember/sport-600/aqua) vs
  objetivo. App (`ExchangeModePanel.tsx:107-127`): filas de texto "2100/2200 kcal · P …" sin barras.
- Kit: tiles de grupo rectangulares 30×24 con tinte soft (`toneSoft/toneHex`); app
  (`ExchangeTargetsEditor.tsx:120-126`): círculos con color sólido y texto blanco. Tokens OK — es nit de forma.

## [P2] Sin visor "Equivalencias por grupo" ni "Historial de versiones" en el builder

- Kit: `EquivalencesSheet` (extras.jsx:242-272, entry-button builder.jsx:438-445) y `VersionHistorySheet`
  (extras.jsx:275-305, footer builder.jsx:459-461). App: las equivalencias solo salen en el PDF; los snapshots
  (`nutrition_plan_history`) existen server-side pero no hay UI de restauración. Deuda de superficie.

## [P2] NutritionOnboarding + CoachNutritionGuideDialog con estilo pre-DS

- `NutritionOnboarding.tsx:38-48`: heading `uppercase tracking-tighter` + emoji 🥗; `CoachNutritionGuideDialog`
  ídem (elementos extra al kit — la riqueza se mantiene, el skin debería ser DS: font-display, tiles token).
  Además el paso 2 linkea a `/coach/foods` (página legacy fuera del hub) en vez de la pestaña Alimentos.

## [P2] Recetas: sin momento del día ni contador de asignados

- Kit (`coach-nutrition.jsx:385-421`): filas con tile por tag (sunrise/salad/moon/cookie en ember/sport/aqua),
  badge de momento, "N asignados". App (`RecipeLibrary.tsx`): cards con foto 16:9 (más rico ✓) pero sin
  clasificación por momento ni asignados. Complemento, no reemplazo.

## [P2] Confirm "Quitar plan" genérico

- Kit (`coach-nutrition.jsx:435-447`): modal con tile triangle-alert danger-100 y copy "se marcará inactivo.
  No se borran comidas ni el historial de adherencia". App (`ActivePlansBoard.tsx:250-268` y
  `NutritionRosterMasterDetail.tsx:266-284`): AlertDialog shadcn sin icono y copy más seco. Tokens OK (bridge).

## [P2] Rutas hermanas legacy con skin pre-DS

- `/coach/foods` (linkeada desde el onboarding), `/coach/recipes` (redirect a foods), `/coach/meal-groups`
  (ver P0) y `/coach/nutrition-builder/[clientId]` conservan skin viejo (`border-border`, `text-primary`,
  headings uppercase). Consolidar en el hub o re-skinear.

## [P2] Hub 4-tabs vs roster-first del kit — pre-evaluado

- Decisión arguable ya cerrada (máximo P2, según brief). El desktop del kit es roster-first con acciones en
  title-bar; la app mantiene el hub 4-tabs con maestro-detalle DENTRO de la pestaña Alumnos. Documentado, sin acción.

---

## Verificado 1:1 (matchea el kit)

- **NutriTabs** — `NutritionHub.tsx:96-121`: track sunken p-3px, tab 46px con label + contador mono
  (sport en activo), shadow-sm en activo. Clavado.
- **TopBar del hub** — título `font-display` extrabold + subtitle "Planes, alimentos y recetas" + botón guía
  + CTA "Plantilla" sport contextual (solo Alumnos/Plantillas, igual que `topCreate` del kit).
- **Board Alumnos móvil** — buscador + botón filtros con dot + chips removibles + result-bar + bottom-sheet
  "Filtros y orden" con pills y CTA "Ver resultados" (`ActivePlansBoard.tsx:269-398`) — espejo de
  `NutriFilterSheet`/`nutriFiltersBtn`/`NutriActiveChips`.
- **Columnas SYNCED/CUSTOM** — headers uppercase sport-600/ember-600 con contador, subtítulos explicativos
  verbatim, badges tone soft, sparkline 7d con la MISMA fórmula de opacidad del kit (0.4 + v/200).
- **Card de plantilla** — badge objetivo, kcal en display metric, barra tricolor canónica + leyenda mono
  ●P/●C/●G, chips de comidas sunken, footer con icon-buttons + Asignar (`TemplateLibrary.tsx:169-287`).
- **Maestro-detalle desktop** (`NutritionRosterMasterDetail.tsx`) — rail con ring de estado, pill de estado
  espejo verbatim del Badge DS, % adherencia mono (danger si <60), hero inverse con ProgressRing ember 78px
  + "Objetivo diario" display 30px, macros con barras canónicas, empty state "Selecciona un alumno" con el
  copy exacto del shell del kit (index.html:1272).
- **ExchangeModePanel / ExchangeTargetsEditor** — tokens EVA, steppers 44px, chips de variantes, radio PDF
  Compacto/Equivalencias (espejo del kit `pdfKind`), preview de marca.
- **MealBlock / FoodItemRow / MealCanvas** — re-tokenizados (25c77d62): tile utensils ember-100/700,
  aviso comida vacía ember, swap-options en aqua con chips de macros canónicos, botón dashed "Agregar alimento".
- **Banner "Base" de Recetas** — TierBadge + copy "no afectan macros ni adherencia" (kit 387-390).
- **Empty state de Plantillas** — tile 58px + font-display + copy exacto del kit (nit: tile en ember-100;
  el kit usa sport-100).

---

## Fix log (2026-07-01) — área nutricion-builder (PlanBuilder: drawer, lista compacta, sidebar, gate)

- **[P1] FoodSearchDrawer zinc hardcodeado (~56 hits)** → FIXED
  `_components/PlanBuilder/FoodSearchDrawer.tsx`: panel `bg-surface-card border-subtle` +
  `rounded-t-sheet` (desktop `sm:rounded-card`); header/back/close en `text-muted hover:bg-surface-sunken`;
  título `font-display text-[17px] font-extrabold text-strong` normal-case (antes uppercase tracking-widest);
  buscador `bg-surface-sunken border-default placeholder:text-subtle`; pills de categoría con inversión
  `bg-[var(--text-strong)] text-[var(--surface-card)]` (activo) / `bg-surface-sunken text-muted` (inactivo);
  filas `border-subtle bg-surface-card hover:border-default hover:bg-surface-sunken`; corazón favorito
  danger→**ember-500** (kit 510); badge dislike `bg-[var(--ink-100)] text-muted`; CTAs dashed "Crear alimento"
  en `border-default text-sport-600`; form crear alimento (labels `text-subtle`, inputs `bg-surface-card
  border-default`, hint-card `bg-surface-sunken` sin borde estilo kit); paso cantidad (summary/preview
  `border-subtle bg-surface-sunken`, textos strong/body/muted/subtle); confirm de alergia `bg-surface-card`
  + `text-body`. 0 hits zinc/slate restantes.
- **[P1] Paleta de macros NO canónica** → FIXED
  `components/coach/FoodListCompact.tsx` (móvil 89-91 y desktop 120-122): blue/emerald/purple →
  `text-[var(--ember-600)]` (P) / `text-[var(--sport-600)]` (C) / `text-[var(--aqua-600)]` (G), mismo mapping
  que FoodItemRow/TemplateLibrary. Estrella de alimento propio `text-primary` → `text-ember-500
  fill-ember-500/30` (kit 542). Bonus token-swap: hover del trash rose-500 → `var(--danger-500)`.
  `nutrition-plans/page.tsx:92` (mockup del gate de nutrición/intercambios): blue/amber/rose →
  `ember-500/10 · sport-500/10 · aqua-500/10` con texto -600. (Solo la línea de macros — el re-skin
  completo del gate [P1 Upgrade gate] es de la pasada del hub, página compartida.)
- **[P1] Sidebar del builder: violet/indigo + falta hero inverse "Objetivo diario"** → FIXED
  `_components/PlanBuilder/PlanBuilderSidebar.tsx`: (1) hero inverse nuevo arriba de Metas —
  `rounded-card` con `background: var(--surface-inverse)`, eyebrow sport-500 "Objetivo diario", kcal en
  `font-display text-[30px] font-black` + trio P/C/G en ember-400/sport-400/aqua-400 (espejo del hero ya
  migrado de NutritionRosterMasterDetail y del kit builder.jsx:152-168); pencil-button `bg-white/10
  text-on-dark` colapsa/expande la grilla de 4 inputs (`goalsOpen`, default colapsada — "inputs al expandir"
  del fix); handlers existentes reutilizados tal cual. (2) Panel Mifflin: violet → **aqua**
  (border/bg/íconos/result-box/CTA en aqua-500/25·5·10·20·40 + textos aqua-600/700, ramp flipea en .dark).
  (3) Panel body-comp: indigo → **sport** con badge Pro `bg-sport-500/15 text-sport-600` (diferenciación
  sugerida por el fix). 0 hits violet/indigo restantes.
- **[P2] MealBlock resumen kcal + acordeón** → SKIPPED (estructural: exige computar kcal por comida y
  reordenar el header — no es swap de clases).
- **[P2] Modo Porciones barras de progreso + tiles rectangulares** → SKIPPED (estructural, nit de forma).
- **[P2] Visor Equivalencias / Historial de versiones** → SKIPPED (superficies nuevas, deuda de superficie).

---

## Fix log (2026-07-01) — área nutricion-hub (hub, pestañas, modales, meal-groups, gate)

- **[P0] Grupos de comidas inalcanzable** — FIXED: entry-card del kit al tope de la pestaña Alimentos (`FoodLibrary.tsx` → Link a `/coach/meal-groups` con tile layers sport-100 + chevron), acción book-open "Grupos de comidas" en el TopBar del hub para desktop (`NutritionHub.tsx`, `hidden md:inline-flex`), y re-skin EVA DS completo de `/coach/meal-groups`: `page.tsx` (header display + back a `/coach/nutrition-plans` + info-card sunken del kit), `MealGroupLibraryClient.tsx` (buscador DS + botón Grupo theme-primary + empty-state kit + cards con meta `eva-mono` "N ingredientes · ~kcal · g P" + icon-buttons bordered + chips sunken +N) y `MealGroupModal.tsx` (título font-display, ingredientes con macros mono, G/U tokens, "Total estimado" mono, CTA sport). Inserción de grupo desde el FoodSearchDrawer NO tocada (archivo del agente builder — requiere wiring externo).
- **[P1] FoodSearchDrawer zinc** — SKIPPED: fuera de mi área (lo trabaja el agente builder en paralelo).
- **[P1] Modales Asignar plantilla / Compartir receta / Crear alimento / Nueva receta** — FIXED: `AssignModal.tsx` y `recipes/AssignRecipeModal.tsx` reescritos al patrón del kit — bottom-sheet DS en móvil (Sheet side=bottom, mismo split matchMedia md que WorkoutProgramsClient) + Dialog en desktop; tile 36px (sport-100 clipboard-list / ember-100 chef-hat) + eyebrow uppercase subtle + nombre en font-display 800; filas con avatar (inverse + sport-400) y estado contextual "Ya tiene esta plantilla · reasignar actualiza" (sport-600) / "se reemplaza" (warning-700); selección borde+fondo sport-100 (ember para receta); check-circle 22px; warning en tokens warning-100/warning-700; CTA `variant=sport` "Asignar (N)" / `primary` "Compartir (N)"; copy "Asignar protocolo" → "Asignar plantilla". Diálogo "Crear alimento custom" (`FoodLibrary.tsx`) y `CreateRecipeDialog.tsx`: `bg-surface-card border-subtle`, títulos font-display extrabold normal-case, hint-cards sunken, CTAs sport, trigger "Nueva receta" re-tokenizado.
- **[P1] Pestañas Alimentos/Plantillas/Recetas sin patrón buscador + Filtros** — FIXED: `FoodLibrary.tsx` con searchbox 44px + clear-btn + nutriFiltersBtn con dot + chips removibles + NutriFilterSheet (Mostrar: Catálogo/Mis alimentos · Ordenar: Nombre/Kcal/Proteína, CTA "Ver resultados") + pills de categoría sport-500 activo + línea de conteo mono "N visibles · M en catálogo" + botón "Nuevo" chico; `TemplateLibrary.tsx` con filtro Objetivo + Orden (Recientes/Nombre/Kcal ↓/↑) en sheet + chips + result-bar + clear-btn + empty diferenciado búsqueda/filtro (tile pasa a sport-100 como el kit); `recipes/RecipeLibrary.tsx` con buscador (nombre + ingredientes) + result-bar + empty de búsqueda. Las filas de la lista de alimentos viven en `components/coach/FoodListCompact.tsx` (fuera de mi área — la re-skinea el agente builder; el editar-alimento-propio vive ahí → requiere wiring externo).
- **[P1] Paleta de macros NO canónica (gate)** — FIXED: mockup del gate en `page.tsx` con P/C/G = ember/sport/aqua (la línea ya la había corregido una edición concurrente durante la sesión; integrada). `FoodListCompact` fuera de área (agente builder).
- **[P1] Sidebar del builder violet/indigo + hero inverse** — SKIPPED: fuera de mi área (`PlanBuilder*`, agente builder).
- **[P1] Detalle master-detail sin "Comidas del plan"** — SKIPPED: requiere ampliar el select del data-loader (`getActivePlansBoardData` no trae nombre/kcal por comida) — regla presentación-only lo prohíbe; **requiere wiring externo** en `_data/nutrition-coach.queries.ts` (agregar `name, order_index` al select de meals + card read-only en `NutritionRosterMasterDetail`).
- **[P1] Upgrade gate sin re-skin** — FIXED (`nutrition-plans/page.tsx`): TopBar "Nutrición / Módulo Pro", Card inverse hero centrado con tile sport-500 + "Desbloqueá Nutrición" display 24, mockup re-tokenizado (sport/sunken/subtle), feature-tiles sport-100/sport-600, pricing cards Mensual/Anual con borde sport-500 + badge -20%, CTA sport "Mejorar a Pro" con glow. Emerald eliminado por completo.
- **[P2] MealBlock resumen kcal/acordeón** — SKIPPED (builder, otra área).
- **[P2] Porciones: barras de totales derivados** — SKIPPED (builder, otra área).
- **[P2] Equivalencias por grupo / Historial de versiones** — SKIPPED (estructural, deuda de superficie).
- **[P2] NutritionOnboarding + CoachNutritionGuideDialog pre-DS** — FIXED: heading font-display extrabold sin emoji, paleta de pasos emerald/violet/sky → sport/ember/aqua (`nutrition-onboarding-shared.ts`, alimenta ambos), links de pasos en tokens; paso 1 ahora abre la pestaña Alimentos del hub (prop `onFoods` cableada desde `NutritionHub`) en vez de `/coach/foods`; título de la guía font-display normal-case (el link del guide dialog conserva href por cerrar-dialog — deuda menor).
- **[P2] Recetas: momento del día + contador de asignados** — SKIPPED (estructural: el modelo de recetas no tiene campo momento ni contador; complemento futuro).
- **[P2] Confirm "Quitar plan" genérico** — FIXED (`ActivePlansBoard.tsx` + `NutritionRosterMasterDetail.tsx`): tile triangle-alert danger-100/danger-600 + título "Quitar plan" font-display + copy del kit "se marcará inactivo. No se borran comidas ni el historial de adherencia".
- **[P2] Rutas hermanas legacy** — PARTIAL: `/coach/meal-groups` re-skineada (parte del P0); `/coach/foods`, `/coach/recipes` y `/coach/nutrition-builder/[clientId]` SKIPPED (re-skin estructural de páginas enteras; el onboarding ya no linkea a `/coach/foods`).
- **[P2] Hub 4-tabs vs roster-first** — sin acción (pre-evaluado, documentado).
- Nota: `OrgTemplatesSection.tsx` conserva violet/zinc pero NO está citado en ningún finding del informe — no tocado.
