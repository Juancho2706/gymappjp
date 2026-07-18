# G04 — Gaps Alumno: Nutrición completa

Dominio: tab Nutrición del alumno (RN `apps/mobile`) vs web PWA (`apps/web/src/app/c/[coach_slug]/nutrition`).
Referencia visual = árbol mobile (`md:hidden`) de la web EVA DS. Solo lectura. Rutas archivo:línea reales.

## Fuentes verificadas en código
- Web pantalla: `apps/web/src/app/c/[coach_slug]/nutrition/page.tsx` (Promise.all masivo de 15 fuentes, lin. 71-118).
- Web cerebro: `apps/web/src/app/c/[coach_slug]/nutrition/_components/NutritionShell.tsx` (~1240 L; layout, motor, mutaciones).
- Web subcomponentes (dir `_components/`): `DayNavigator`, `MacroRingSummary`, `MealCard`, `AdherenceStrip`, `NutritionStreakBanner`, `ExchangeMealChips`, `ExchangeEquivalencesSheet`, `MicrosPanel`, `PlatePanel`, `OffPlanLogger`, `ShoppingListView`, `WeeklyRecapCard`, `RecipeIdeasSection`, `WorkoutContextBanner`, `PushNotificationBanner`, `NutritionNoPlanFromServer`, `NutritionDomainOff`; + `@/components/nutrition/NotesThread`, `ProportionPlate`.
- Mobile pantalla: `apps/mobile/app/alumno/(tabs)/nutricion.tsx` (563 L, patrón mixto: 7 className + StyleSheet + `theme.*` + Montserrat legacy).
- Mobile componentes: `apps/mobile/components/MealCardExpandable.tsx`, `FoodItemRow.tsx`, `MacroRingSummary.tsx`, `DayNavigator.tsx`, `AdherenceStrip.tsx`, `HabitsTracker.tsx`, `WorkoutContextBanner.tsx`.
- Mobile data: `apps/mobile/lib/nutrition.queries.ts`, `apps/mobile/lib/nutrition-utils.ts` (235 L, COPIA manual), `apps/mobile/lib/nutrition-offline-cache.ts`, `apps/mobile/lib/offline-cache.ts`, `apps/mobile/lib/habits.queries.ts`.
- Motor compartido: `packages/nutrition-engine/{index,macros,adherence,micros,tdee,bodycomp}.ts` — mobile NO lo importa (0 imports, sin path en `tsconfig.json`; confirmado en 06-mobile-inventory §D y 07-shared-seams §A.5/§D).

---

## 1. Gaps visuales (pantalla por pantalla)

Nota transversal: la pantalla mobile de nutrición está en **patrón mixto (B con toques A)**. Colores dinámicos vienen del objeto `theme.*` (imperativo), hay hex fijos (`EMBER_500 = '#FF6A3D'`, `nutricion.tsx:61`) y fuentes **Montserrat legacy** (`Montserrat_700Bold`/`Montserrat_800ExtraBold` en el banner de racha, `nutricion.tsx:460,464`). El DS canónico pide Archivo/Hanken/JetBrains. No es re-skin terminado.

1.1 **Header.** Web: header sticky con glow decorativo de marca (`page.tsx:134-155`), botón `ArrowLeft` → dashboard, título `Plan Nutricional`, subtítulo = nombre del plan, `InfoTooltip` explicativo. Mobile: `ScreenHeader title="Nutrición" subtitle={plan.name}` + botón Share circular (`nutricion.tsx:418-426`). Difieren: título ("Nutrición" vs "Plan Nutricional"), sin glow de marca, sin InfoTooltip, y el back no aplica (es tab). Re-skin: alinear título/subtítulo y agregar glow de marca detrás del header.

1.2 **Orden y composición del stack (kit móvil).** Web (columna única `<760`, `NutritionShell.tsx:1003-1222`): WorkoutContextBanner → banner histórico → banner "comidas filtradas" → **stats de un vistazo** (racha `NutritionStreakBanner` → anillos `MacroRingSummary` → micros `MicrosPanel` → plato `PlatePanel`) → título "Comidas de hoy" → `MealCard`s → OffPlanLogger → ExchangeEquivalencesSheet → NotesThread → export (3 botones) → ShoppingListView → AdherenceStrip. Mobile (`nutricion.tsx:434-530`): OfflineBanner → WorkoutContextBanner → DayNavigator → banner histórico → banner racha inline → MacroRingSummary → barra progreso comidas → Accordion indicaciones → MealCards → **HabitsTracker** → AdherenceStrip. Faltan visualmente micros/plato/notas/off-plan/shopping/recap/export-PDF; y aparece `HabitsTracker` dentro de nutrición (divergencia: en web los hábitos viven en el dashboard, no en `NutritionShell`).

1.3 **MealCard.** Web `MealCard` (referencia): círculo de completar 44px con check animado + haptic, kcal con % de porción parcial, macros P/C/G, **chips de intercambio** (módulo exchanges), ingredientes con **favoritos (estrella)** y **swaps de alimento interactivos**, selector porción `25/50/75/100% + "Plan completo"`, satisfacción 😕😐😋. Mobile `MealCardExpandable.tsx`: círculo 28px (`checkCircle`, lin. 191), macro line en JetBrains, chevron expandir, `FoodItemRow` (solo muestra badge de swap vía `hasActiveSwap`, NO interactivo), porción `25/50/75/100` (SIN "Plan completo", lin. 129), satisfacción emojis. Usa `theme.*` + `theme.success + '12'`. Re-skin: círculo 44px, tokens DS, quitar `theme.*` imperativo.

1.4 **Banner de racha.** Web: `NutritionStreakBanner` (componente dedicado, ember, mensajes sin culpa). Mobile: banner inline solo si `streak >= 2` (`nutricion.tsx:454-468`) con Montserrat legacy. Reemplazar por equivalente DS.

1.5 **DayNavigator.** Web: chevrons + **swipe horizontal** (framer drag) + dot ember por día con adherencia + "Volver a hoy", no permite futuro. Mobile: `DayNavigator.tsx` existe; verificar swipe/animación/paridad de dots contra web (no transcrito línea a línea).

1.6 **Banner "comidas filtradas".** Web muestra "Hoy ves X de Y comidas del plan…" cuando `mealsSorted.length > mealsVisible.length` (`NutritionShell.tsx:1018-1023`). Mobile no lo tiene.

1.7 **Export como bloque visual.** Web: grid de 3 botones (Copiar detalle / Resumen WhatsApp / Descargar PDF) con InfoTooltips (`NutritionShell.tsx:1143-1200`). Mobile: un solo icono Share en el header. Gap visual + funcional (ver 2.9).

1.8 **InfoTooltips / explicabilidad.** Web usa `InfoTooltip` en header, notas, export, shopping. Mobile: ninguno (los tooltips no se traducen 1:1 a touch; requiere patrón popover-on-tap del DS que hoy tampoco existe — ver 02-design-system §E P2.12).

1.9 **Sin plan / dominio OFF.** Web: `NutritionNoPlanFromServer` (intenta copia offline) y `NutritionDomainOff` (header + "no disponible", nunca blanco). Mobile: `EmptyState` "Sin plan activo" (`nutricion.tsx:404-412`); NO tiene estado "dominio apagado por el coach" (ver 2.13).

---

## 2. Gaps funcionales (features/datos que web tiene y mobile no, o divergen)

La web sufrió un **overhaul de nutrición completo** (base tier + Pro) que es casi todo posterior al 21-jun y **WEB-ONLY** (memoria `project_nutrition_overhaul_plan`; delta doc 01 §2.5). Mobile quedó en la versión previa (plan del día + toggle + macros + hábitos + adherencia simple).

2.1 **Exchanges / equivalencias — "Nutrición Pro" por-alumno (módulo `nutrition_exchanges`).** Web: `getStudentExchangeData` (`page.tsx:92`), chips de intercambio por comida (`ExchangeMealChips`), sheet de equivalencias por grupo (`ExchangeEquivalencesSheet`), badge de variante del día, macros derivados de targets (`macrosForTargets`), PDF de pauta de porciones branded (`handleDownloadExchangePdf`, `NutritionShell.tsx:906-940`). Mobile: **CERO**. Los endpoints `/api/mobile/nutrition/exchanges/*` (meal-variant, set-mode, targets, variants) EXISTEN en web pero NO se consumen (06-mobile-inventory §C). Es el gap funcional más grande de este dominio.

2.2 **Micros (sodio/fibra + avanzados Pro azúcar/grasa sat./insat.).** Web: `getPlanDayMicros` + `getMicroTargetsForClient` (`page.tsx:105-106`), `MicrosPanel` con topes del coach y `proEnabled` gating (`NutritionShell.tsx:962-977`). Mobile: **CERO**. `packages/nutrition-engine/micros.ts` sin usar. Endpoint mobile inexistente.

2.3 **Plato visual (proporción).** Web: `platePropFromMacros` (`page.tsx:126`), `PlatePanel`/`ProportionPlate`. Mobile: **CERO**.

2.4 **Off-plan logger (registro fuera de plan).** Web: `getRecentIntakeFoods(10)` (`page.tsx:104`), `OffPlanLogger` (quick-add, recientes) solo día de hoy (`NutritionShell.tsx:1109-1117`), servicio `nutrition-intake.service`. Mobile: **CERO**.

2.5 **Notas coach ⇄ alumno.** Web: `getClientMealComments` + `addClientMealComment` (`page.tsx:103`, `NutritionShell.tsx:890-896`), `NotesThread` bidireccional por día. Mobile: **CERO**.

2.6 **Recetas-idea asignadas.** Web: `getAssignedRecipesForClient` (`page.tsx:99`), `RecipeIdeasSection` gated por `sectionFlags.recipes` (`page.tsx:196`). Mobile: **CERO**.

2.7 **Lista de compras.** Web: `getShoppingList` (`page.tsx:103`), `ShoppingListView` (agrupada por pasillo, marcar lo que tienes, agregar ítems, compartir WhatsApp), colapsable, gated `sectionFlags.shopping`. Mobile: **CERO**.

2.8 **Recap semanal motivacional.** Web: `getNutritionWeeklyRecap` (`page.tsx:117`), `WeeklyRecapCard` (tono adaptativo). Mobile: **CERO**.

2.9 **Export día (PDF + WhatsApp rico).** Web: 3 acciones — `handleCopyDayDetail` (detalle con macros por comida y subtotales), `handleCopyDayShort` (resumen), `downloadNutritionDayPdf` branded (o `downloadNutritionExchangePdf` si exchanges ON) (`NutritionShell.tsx:767-876`). Mobile: solo `Share.share` de texto plano con nombres de comidas (`buildShareText`, `nutricion.tsx:133-147`) — sin macros, sin PDF, sin marca del coach. RN tiene `expo-print` (usado en coach `lib/program-pdf`/`progress-pdf`) reutilizable.

2.10 **Swaps de alimento interactivos.** Web: `applyMealFoodSwap` por ingrediente con `swap_options`, reconciliación de macros con el swap (`mealsVisibleWithSwaps`, `NutritionShell.tsx:368-422`, `handleApplySwap:725-750`). Mobile: solo MUESTRA badge de swap activo (`FoodItemRow hasActiveSwap`); NO permite aplicar swaps. Falta la mutación + el recálculo.

2.11 **Favoritos de alimentos.** Web: `toggleClientFoodPreference` + `getClientFoodFavoritesForClient` (estrella por ingrediente, `NutritionShell.tsx:680-708`). Mobile: **CERO** (`client_food_preferences` casi no tocada, ver 06 §C conteo=2).

2.12 **Porción "Plan completo".** Web: selector incluye 25/50/75/100% **y "Plan completo"**. Mobile: solo 25/50/75/100 (`MealCardExpandable.tsx:129`).

2.13 **Gating por sección + master switch + gating de nav.** Web: `resolveFeaturePrefs` → `sectionFlags` (12 secciones, `@eva/feature-prefs`) gatea el RENDER de secciones opcionales (`NutritionShell.tsx:57-71`); `resolveNutritionDomainEnabled` apaga TODO el dominio → `NutritionDomainOff` (`page.tsx:121-123`); `getStudentNutritionNavEnabled` oculta el tab (layout alumno). Mobile: **CERO gating** — muestra todo lo que tiene sin consultar entitlements ni preferencias del coach. `@eva/feature-prefs` y `@eva/module-catalog` sin usar (06 §D). Riesgo de mostrar Pro/exchanges sin derecho (ver Riesgos).

2.14 **Motor de adherencia/racha `computeNutritionAdherence`.** Web: racha/adherencia vía `@eva/nutrition-engine` (`adherence.ts`) dentro de `NutritionStreakBanner`/`AdherenceStrip`. Mobile: reimplementa la racha con un loop inline propio (`nutricion.tsx:377-390`, umbral 0.5 completadas, ventana 60 días) — **drift confirmado**: dos fuentes de verdad para la misma métrica.

2.15 **Cálculo de macros = copia manual (drift latente).** Mobile `lib/nutrition-utils.ts` (235 L) es copia de `packages/nutrition-engine/macros.ts`, NO import (07-shared-seams §C.2). La copia **omite `household_grams`/`household_label`** (medidas caseras) del tipo `FoodMacrosRow` → mobile no puede mostrar medidas caseras (2.16). Cualquier fix del motor en web no llega a mobile.

2.16 **Medidas caseras (household).** Dependen de `household_grams`/`household_label` (presentes en el engine, ausentes en la copia mobile). Mobile no las muestra en ingredientes.

2.17 **PushNotificationBanner** (recordatorios de nutrición): presente en web (`page.tsx:158`), ausente en mobile (mobile tiene push nativo pero sin este banner in-screen).

2.18 **Confetti "día completo".** Web dispara confetti al completar la última comida del día (`NutritionShell.tsx:565-576`, 1×/fecha, reduce-motion aware). Mobile: sin confetti en nutrición (sí lo tiene el ejecutor de rutina).

2.19 **Scope team/org para prefs.** Web resuelve `getClientScope` (team/org) para alimentar el resolver de feature-prefs (`page.tsx:62-70`). Mobile lo ignora.

### Delta post-21-jun (todo web-only, mobile no lo tiene)
El cluster completo 2.1–2.13 (exchanges por-alumno, micros, plato, off-plan, notas, recetas, shopping, recap, export PDF/WhatsApp rico, favoritos, swaps interactivos, gating por sección) es el "overhaul base tier + Pro" que aterrizó en web después de la auditoría del 21-jun. Mobile quedó en la versión previa. Paridad offline/cola: mobile SÍ tiene cola offline de toggles (`enqueueNutritionToggle`/`flushNutritionQueue`) y cache del plan (`nutrition-offline-cache.ts`) — aproximadamente a la par con el read-model local de web para el toggle; pero mobile no encola porción/satisfacción/swap (web tampoco encola esos, solo toggle → paridad razonable en ese punto).

---

## 3. Costuras (packages/ o API a compartir en vez de duplicar)

Fuente: 07-shared-seams.md §A/§C/§D.

- **`@eva/nutrition-engine`** (07 §A.5, §C.2, prioridad máxima/bajo costo): reemplazar `apps/mobile/lib/nutrition-utils.ts` (copia 235 L) por `export * from '@eva/nutrition-engine'` (patrón que ya usa web en `apps/web/src/lib/nutrition-utils.ts`, shim de 11 L). Agrega path en `apps/mobile/tsconfig.json` (hoy solo declara schemas/brand-kit/tiers). Trae `macros` (con `household_grams`), `adherence` (`computeNutritionAdherence` → mata el drift de 2.14), `micros` (habilita 2.2), `tdee`, `bodycomp`. Nota: `computeNutritionAdherence` requiere inyectar el resolver de día-de-semana (`dayOfWeekResolver`/`mealAppliesOn`) — mobile ya tiene `nutritionMealApplies` en `lib/date-utils` para adaptarlo.
- **`@eva/feature-prefs`** (07 §A.3, §C.4): `NutritionSectionKey` + `PRESETS` + resolver puro `visible = ENTITLED AND ENABLED`. Habilita el gating por sección (2.13) con la MISMA lógica que web. Hoy 0 imports en mobile.
- **`@eva/module-catalog`** (07 §A.4): `MODULE_CATALOG_KEYS` incluye `nutrition_exchanges` — fuente de verdad del módulo Pro. Necesario para el gate de exchanges/micros_advanced.
- **`@eva/schemas`** (`nutrition.ts`, `nutrition-exchanges.ts`): mobile ya consume la porción auth; `nutrition-exchanges` está marcado "SERVER-ONLY" en el index (07 §A.6) — **revisar** si esa etiqueta aplica al alumno RN (estructuralmente es Zod puro; el arquitecto debe validar antes de importarlo).
- **API bridge**: (a) exchanges — los endpoints `/api/mobile/nutrition/exchanges/*` YA existen (01 §6, 06 §C), solo falta el cliente RN. (b) config/prefs + kill-switch: endpoint `/api/mobile/config` YA existe (01 §6 commit `6c273f32`) para el gating. (c) `assertModule` para escrituras de módulos pagos: endpoints YA existen (01 §6 `ce8456e6`). (d) **SIN endpoint mobile hoy**: notas, shopping, off-plan/intake, micros, recap, recetas — el arquitecto debe decidir PostgREST directo (con RLS que ya protege esas tablas) vs crear `/api/mobile/nutrition/*`. Los servicios web viven en `nutrition-notes.service`, `nutrition-intake.service`, y queries `shopping.queries`/`recap.queries`/`sections.queries` (server-only, no portables tal cual).
- **PDF**: no es package; `expo-print` ya se usa en coach (`lib/program-pdf`/`progress-pdf`). Reusar patrón para el PDF de día/pauta (2.9), replicando el diseño branded de `nutrition-day-pdf`/`nutrition-exchange-pdf` de web.

---

## 4. Tareas propuestas

### Ola A — Re-skin visual (traer la nutrición mobile ACTUAL a EVA DS, sin features nuevas)
- **A1 [VISUAL] S** — Header nutrición: título "Plan Nutricional" + subtítulo plan + glow de marca; purgar `theme.*` imperativo del shell. Dep: ninguna.
- **A2 [VISUAL] S** — Purgar Montserrat legacy + hex fijos en `nutricion.tsx` (banner racha) y migrar a tokens/fuentes DS (Archivo/Hanken/JetBrains). Dep: A1.
- **A3 [VISUAL] M** — Re-skin `MealCardExpandable` a fidelidad `MealCard`: círculo 44px, tokens DS (quitar `theme.success + '12'`), macro line, estilos de porción/satisfacción. (Solo visual; swaps/favoritos van en Ola B.) Dep: A2.
- **A4 [VISUAL] S** — DayNavigator (verificar swipe + dots ember) + banners (histórico, offline) DS + agregar banner "comidas filtradas" (2.6/1.6). Dep: A1.
- **A5 [VISUAL] S** — Verificar/re-skin `MacroRingSummary` + `AdherenceStrip` + `NutritionStreakBanner` contra web. Dep: A2.

### Ola B — Paridad funcional (features del overhaul). Costuras primero.
- **B1 [SEAM] S** — Adoptar `@eva/nutrition-engine`: path en tsconfig + borrar `lib/nutrition-utils.ts` (→ re-export) + verificar consumidores (mobile nutrición, MealCardExpandable, coach nutrition-builder). Trae `household_grams`. Dep: ninguna. Desbloquea B2/B4/B6.
- **B2 [SEAM] S** — Reemplazar el loop de racha/adherencia inline (`nutricion.tsx:377-390`) por `computeNutritionAdherence` del engine (inyectando resolver de día). Mata drift 2.14. Dep: B1.
- **B3 [SEAM] M** — Adoptar `@eva/feature-prefs` + `@eva/module-catalog` + endpoint `/api/mobile/config`: gating por sección (`sectionFlags`), master switch dominio (estado "Nutrición no disponible") y gating del tab (nav). Fail-open igual que web. Dep: endpoints ya existen.
- **B4 [FUNCIONAL] L** — Módulo exchanges/equivalencias (Nutrición Pro por-alumno): chips de intercambio, sheet de equivalencias, badge de variante, macros por targets, PDF de pauta; cablear `/api/mobile/nutrition/exchanges/*`. Dep: B1, B3, module-catalog.
- **B5 [FUNCIONAL] M** — Swaps de alimento interactivos (`applyMealFoodSwap`) + favoritos (`toggleClientFoodPreference`) en `FoodItemRow`/`MealCardExpandable`, con recálculo de macros. Dep: B1, A3.
- **B6 [FUNCIONAL] M** — Panel de micros (base + avanzados Pro) con topes del coach. Dep: B1 (engine micros), B3, API micros.
- **B7 [FUNCIONAL] S** — Plato visual (`PlatePanel`/proporción). Dep: B1.
- **B8 [FUNCIONAL] M** — Off-plan logger (quick-add + recientes), día de hoy. Dep: API intake (PostgREST o `/api/mobile/nutrition`).
- **B9 [FUNCIONAL] M** — Notas coach ⇄ alumno (`NotesThread`). Dep: API notas.
- **B10 [FUNCIONAL] M** — Lista de compras (por pasillo, marcar, agregar, compartir), colapsable. Dep: API shopping.
- **B11 [FUNCIONAL] S** — Weekly recap card. Dep: recap engine/endpoint.
- **B12 [FUNCIONAL] S** — Recetas-idea asignadas. Dep: query recetas.
- **B13 [FUNCIONAL] M** — Export día: PDF branded (`expo-print`) + Copiar detalle/Resumen WhatsApp con macros (reemplaza el Share plano actual). Dep: B1.
- **B14 [FUNCIONAL] S** — Pulido: porción "Plan completo" (2.12), confetti día-completo (2.18), PushNotificationBanner (2.17), medidas caseras en ingredientes (2.16, viene con B1), decidir HabitsTracker dentro/fuera de nutrición (divergencia 1.2). Dep: A3, B1.

Ruta crítica: B1 → B2/B3 → (B4…B13 en paralelo según API). B4 es el ítem más pesado y con dependencia de entitlement server-side.

---

## 5. Riesgos

- **Seguridad de entitlements (crítico).** Mobile habla PostgREST directo (anon key + JWT, RLS-scoped). Si se construye exchanges/micros_advanced sin replicar el gate server-side (`assertModule`), un alumno/coach sin el módulo Pro podría invocar la funcionalidad por PostgREST. El gate NO debe ser solo UI; usar los endpoints `assertModule` (01 §6) o RLS/RPC equivalente (07 §C.4 nota de seguridad).
- **Drift ya materializado.** `lib/nutrition-utils.ts` (macros) y el loop de racha son copias que ya divergen del engine (medidas caseras ausentes; posible divergencia numérica de adherencia). Adoptar el engine (B1/B2) es prerequisito para no acumular más drift.
- **Superficie de API faltante.** Notas, shopping, off-plan, micros, recap NO tienen endpoint `/api/mobile` hoy; sus queries web son server-only. Decisión de arquitectura (PostgREST+RLS vs nuevos endpoints) que puede volverse el cuello de botella de la Ola B; requiere confirmar RLS de esas tablas para acceso client-scoped.
- **`nutrition-exchanges` marcado server-only en `@eva/schemas`.** Importarlo en RN sin revisar la etiqueta puede arrastrar deps server. Validar antes de B4.
- **Aditividad del engine.** Agregar `household_grams` a la copia/consumo no debe alterar el output de macros existente (es campo de display); confirmar que el motor compartido ya lo contempla (lo hace) y que web no se rompe.
- **Offline.** La adopción del engine + secciones nuevas no debe romper la cola offline de toggles ni el read-model cache (`nutrition-offline-cache.ts`). Secciones nuevas (notas, shopping, off-plan) deben degradar limpio sin red.
- **Divergencia de composición (hábitos).** Mobile mete `HabitsTracker` en nutrición; web lo tiene en dashboard. Alinear para no duplicar el widget en dos tabs.
- **Fail-open del gating.** El resolver de secciones es fail-OPEN en web (flag OFF = visible). Replicar exactamente esa semántica en mobile o se ocultarán secciones que deberían verse (o viceversa).
