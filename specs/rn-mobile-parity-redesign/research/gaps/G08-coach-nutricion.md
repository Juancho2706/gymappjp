# G08 — Gaps Coach: Nutrición + Check-ins

Dominio: nutrition builder coach, foods, plantillas + propagación (cascade-safety), board de
adherencia, recetas, meal-groups, alérgenos, medidas caseras, modo intercambios (Pro
per-alumno), check-ins coach (review + historial).

Fuente de verdad = comportamiento móvil/responsive de la web EVA DS. Referencias de web en
`05-web-coach-resto.md` §A/§B. Estado mobile en `06-mobile-inventory.md`. Costuras en
`07-shared-seams.md`.

Archivos mobile del dominio (verificados):
- `apps/mobile/app/coach/(tabs)/nutricion.tsx` (491 L, patrón B — objeto `theme` + StyleSheet)
- `apps/mobile/app/coach/nutrition-builder.tsx` (504 L, patrón B)
- `apps/mobile/app/coach/foods.tsx` (274 L, patrón B) — no leído a fondo, existe
- `apps/mobile/app/coach/(tabs)/check-ins.tsx` (246 L, patrón B — fuentes Montserrat legacy)
- `apps/mobile/lib/nutrition-builder.ts` (693 L), `apps/mobile/lib/nutrition-templates.ts` (293 L)
- `apps/mobile/lib/macro-calculator.ts` (51 L — duplicado desactualizado)
- `apps/mobile/lib/nutrition-utils.ts` (235 L — copia manual), `apps/mobile/lib/nutrition.queries.ts`
- Sheets: `apps/mobile/components/coach/FoodSearchSheet.tsx`, `FoodSwapSheet.tsx`,
  `TemplatePickerSheet.tsx`

Web de referencia:
- Hub `apps/web/src/app/coach/nutrition-plans/_components/NutritionHub.tsx` (+ `TemplateLibrary`,
  `ActivePlansBoard`, `NutritionRosterMasterDetail`, `FoodLibrary`, `recipes/RecipeLibrary`)
- Builder `.../_components/PlanBuilder/PlanBuilder.tsx` (897) + `PlanBuilderSidebar`, `MealCanvas`,
  `FoodSearchDrawer`, `ExchangeModePanel`, `ExchangeTargetsEditor`
- Meal-groups `apps/web/src/app/coach/meal-groups/*`
- Cascade-safety PURA `apps/web/src/services/nutrition-propagation.reconcile.ts` (`reconcileMeals`)
- Check-in `apps/web/src/app/coach/clients/[clientId]/ProfileCheckInSnapshot.tsx` (276) +
  `NutritionCheckinContextCard.tsx`

---

## 1. Gaps visuales (pantalla por pantalla)

### 1.1 Hub de Nutrición (`nutricion.tsx` mobile vs `NutritionHub` web)
Mobile está en **patrón B** (lee `useTheme().theme`, pinta con `style={{...theme.card}}` +
`StyleSheet.create`, fuentes literales `Archivo_*`/`HankenGrotesk_*`). No usa las primitivas DS
`Card`/`Badge`/`SegmentedTabs`/`TabBar`. Divergencias concretas:

- **Header:** usa `ScreenHeader` legacy ("Nutrición" / "Centro de protocolos y alimentos") en vez
  de la TopBar DS. Subtítulo distinto al web ("Planes, alimentos y recetas").
- **Tabs:** mobile tiene **3 tabs** (Plantillas / Alumnos / Alimentos). Web tiene **4**
  (Plantillas / Alumnos / **Recetas** / Alimentos) con conteos por tab y strip sticky
  backdrop-blur. Falta el tab Recetas por completo. La tab-bar mobile es un `View` custom con
  sombra literal, no el patrón DS de tabs.
- **Tab por defecto:** mobile abre `templates`; web abre `clients` (Alumnos) por defecto.
- **Stats row:** mobile pone una fila de 3 tiles custom (Plantillas/Con plan/Alimentos). Web no
  tiene esa fila; integra conteos en los tabs. Decisión de diseño a alinear.
- **Filtros/búsqueda:** el patrón DS "Filtros y orden" (input búsqueda + botón 44px con dot +
  bottom-sheet de pills + chips removibles + result-bar) está en TODAS las superficies web
  (Plantillas, Alumnos, Alimentos). Mobile **no tiene buscador ni filtros en el hub** — lista
  plana. Gap visual + funcional grande.
- **Tab Plantillas:** mobile = lista simple de cards (nombre, "kcal · N comidas", 3 botones
  texto Editar/Asignar/Borrar). Web `TemplateLibrary` = grid de cards ricas (badge objetivo
  Déficit/Volumen/Mantención, barra split de macros P/C/G ember/sport/aqua, chips de macros %,
  chips de comidas máx 8, footer "N activos", Duplicar). Falta casi todo el contenido visual.
- **Tab Alumnos:** mobile = fila horizontal de chips de alumno + board de adherencia (cards con
  sparkline + %). Web (móvil) = `ActivePlansBoard` con dos columnas Sincronizados (sport) /
  Personalizados (ember), badge SYNCED/CUSTOM, sparkline 7d, kcal hoy/objetivo, sección "Sin plan
  activo". El board mobile existe (`getNutritionBoard`) pero sin la separación sync/custom ni la
  sección "sin plan" visual (solo marca con dot warning en el chip).
- **Tab Alimentos:** mobile = una sola CTA que navega a `/coach/foods`. Web = `FoodLibrary`
  embebido (pills de categoría scrollable, buscador con debounce, infinite scroll, crear alimento
  custom, delete con undo). Mobile lo delega a otra pantalla legacy.
- **Diálogos:** copiar plan / asignar plantilla usan `NativeDialog` (aceptable) pero con estilo
  patrón B. El aviso de reemplazo usa emoji `⚠` en texto en vez del patrón de banner DS.

### 1.2 Builder de plan (`nutrition-builder.tsx` mobile vs `PlanBuilder` web)
Patrón B. Un solo `ScrollView` (header + meta + comidas), no el split **sidebar + canvas** de web.
- **Layout:** web = `PlanBuilderSidebar` (objetivos, auto-sync toggle, hint de perfil del alumno,
  panel Pro composición corporal `goals_bodycomp`) + `MealCanvas` (drag-and-drop @dnd-kit). Mobile
  = scroll lineal; reordena con chevrons ↑/↓ (aceptable en touch, pero sin DnD ni el layout de dos
  zonas). No hay panel de composición corporal.
- **Header:** custom (Volver / título / Guardar) en vez de TopBar DS. Save es botón custom.
- **Calculadora de metas:** mobile la tiene en `NativeDialog` (Mifflin-St Jeor) — bien, pero ver
  gap funcional 2.1 (fórmula divergente).
- **Fuentes/tokens:** usa `Archivo_*`/`HankenGrotesk_*`/`JetBrainsMono_*` (DS) pero todo el color
  viene del objeto `theme`, no de clases. Colores de estado hardcodeados (`#F97316` en warnBox,
  `EMBER='#FF6A3D'`).
- **FoodSearchSheet / FoodSwapSheet:** son bottom-sheets propios; verificar que usen tokens DS y no
  Montserrat. La marca de favoritos existe; alérgenos NO (ver 2.4).

### 1.3 Check-ins coach (`check-ins.tsx` mobile)
Patrón B + **fuentes Montserrat legacy** (`Montserrat_700Bold` en nombre/peso/energía) — deuda
visual directa (el DS canónico es Archivo/Hanken). Divergencias vs `ProfileCheckInSnapshot` web:
- Card custom StyleSheet, no `Card` DS.
- Energía: badge numérico `N/10` + barra de progreso coloreada. Web usa **estrellas** de energía.
- Fecha: `toLocaleDateString('es-CL')` absoluta. Web usa fecha **relativa** (date-fns/es "hace N
  días").
- Visor de foto: `Modal` transparente básico (overlay negro + X). Web usa Dialog (desktop) /
  bottom-sheet (móvil) del DS con front/side/back etiquetados y ampliables.
- Colores de energía hardcodeados (`#EF4444`/`#F59E0B`/`#10B981`) en vez de tokens status DS.

### 1.4 Pantallas que NO existen en mobile (gaps visuales totales)
- **Grupos de comidas** (`/coach/meal-groups`) — sin pantalla RN.
- **Recetas** (tab Recetas + `RecipeLibrary`, `CreateRecipeDialog`, `AssignRecipeModal`) — sin
  pantalla RN.
- **Modo intercambios / Porciones** (`ExchangeModePanel` + `ExchangeTargetsEditor`) — sin UI RN.
- **`FoodLibrary` embebido** con custom-food-form, medidas caseras, categorías — el `foods.tsx`
  mobile es una pantalla legacy separada (patrón B), no el tab del hub.

---

## 2. Gaps funcionales (incluye delta post-21-jun)

### 2.1 [CORRECTNESS/DINERO] Cálculo de metas divergente — DRIFT CONFIRMADO
`apps/mobile/lib/macro-calculator.ts` es un port **desactualizado** del web. Web migró a
`@eva/nutrition-engine/tdee.ts` (multiplicadores %). Mobile sigue con deltas absolutos:
- `GOAL_ADJUSTMENTS`: mobile `cut:-400 / bulk:+300` kcal absolutos vs paquete `lose:0.85 /
  gain:1.1` (multiplicador % sobre TDEE).
- `proteinMultiplier` bulk 2.0 (mobile) vs `gain:1.6` (paquete).
- grasa: mobile `weight*0.9` g/kg fijo vs paquete `GOAL_FAT_KCAL_FRACTION` (% de kcal).
- **Resultado:** para el mismo alumno/objetivo, la calculadora del coach en mobile y en web
  devuelven kcal/macros DISTINTOS. Ver `07-shared-seams.md` C.1. Prioridad alta, arreglo barato
  (adoptar el paquete).

### 2.2 [CORRECTNESS — DATA LOSS] Cascade-safety ausente en mobile (2 rutas)
La invariante crítica de web (`reconcileMeals`): una comida cuyo `order_index` ya no está en la
plantilla/plan **solo se borra si NO tiene `nutrition_meal_logs`**; si tiene historial se CONSERVA
(porque `nutrition_meal_logs.meal_id → nutrition_meals` es ON DELETE CASCADE). Mobile **no aplica
esta protección** en ninguna de sus dos rutas de escritura:
- `nutrition-builder.ts` `saveClientPlan` (líneas 533-537): `toDelete` = comidas con `order_index`
  fuera del nuevo set → borra `food_items` + `nutrition_meals` **incondicionalmente** (sin chequear
  logs). Reducir/eliminar comidas al editar un plan de alumno **borra el historial de adherencia**.
- `nutrition-templates.ts` `propagateTemplate` (líneas 285-290): `surplus` (comidas sobrantes
  cuando la plantilla tiene menos comidas que el plan) se borra **incondicionalmente**. Misma
  pérdida de logs al propagar una plantilla más corta.

Nota: ambas rutas SÍ preservan el `meal_id` de las comidas **emparejadas** por `order_index`
(update in-place + delete/re-insert de `food_items`), así que ese sub-caso está bien. El agujero es
solo el borrado de huérfanas/sobrantes con logs. Web centraliza esto en `reconcileMeals` (puro,
testeado). Mobile debe consumir esa misma lógica. Prioridad ALTA (money/trust: SERNAC-adjacent,
adherencia del alumno).

### 2.3 [FUNCIONAL] Modo intercambios (nutrition_exchanges, Pro per-alumno) — 0% en mobile
Web: en `client-plan` + módulo ON + sección `micros_advanced`, `ExchangeModePanel` (toggle
gramos↔porciones, variantes de día, totales por variante, PDF de equivalencias) +
`ExchangeTargetsEditor` (grupos de intercambio, porciones, notas, autosave 700ms). Mobile no tiene
nada. Endpoints `/api/mobile/nutrition/exchanges/*` (meal-variant, set-mode, targets, variants)
**existen en web pero mobile no los consume** (`06-mobile-inventory.md` C, `07-shared-seams.md`
C.4). Bloqueado por: gating de módulos ausente en mobile (ver 2.8) + esquema
`@eva/schemas/nutrition-exchanges` no consumido.

### 2.4 [CORRECTNESS/SEGURIDAD] Alérgenos e intolerancias no se muestran en el builder
Web `FoodSearchDrawer` marca en el buscador los **favoritos + alergias + intolerancias +
disgustos** del alumno (`getClientFoodRestrictions`: allergy/intolerance/dislike). Mobile
(`nutrition-builder.tsx` + `getClientFoodFavorites`) **solo marca favoritos** (tabla
`client_food_preferences`, `preference_type='favorite'`). No advierte alergias/intolerancias al
armar el plan — riesgo de que el coach prescriba un alimento alérgeno sin señal. Gap funcional +
de seguridad.

### 2.5 [FUNCIONAL] Medidas caseras — soporte parcial
Web `CustomFoodForm` captura unidad `un` + gramos-por-unidad (household). El paquete
`@eva/nutrition-engine/macros.ts` tiene `household_grams`/`household_label` en `FoodMacrosRow`. La
copia manual `apps/mobile/lib/nutrition-utils.ts` **omite esos campos** (`07-shared-seams.md` C.2).
El builder mobile soporta unidad `un` con `serving_size` como factor, pero no hay etiqueta de
medida casera ni el campo household completo. Verificar paridad de cálculo `un` y del form de
alimento custom (mobile `createCustomFood` no captura household label).

### 2.6 [FUNCIONAL] Check-ins: "Marcar como revisado" ausente — delta post-audit
Web (`ProfileCheckInSnapshot` + delta `46bb111b` "cola de revisados"): toggle **Marcar/Desmarcar
como revisado** optimista (`markCheckInReviewed`/`unmarkCheckInReviewed`, guarda `reviewed_at/by`),
badge de revisado y filtro. Alimenta la cola del coach y el response-time enterprise. Mobile
`check-ins.tsx` **no tiene** ni el toggle ni `reviewed_at` — solo lista los últimos 40. Gap
funcional (nuevo desde el audit).

### 2.7 [CORRECTNESS] Check-ins: falta la foto lateral (side)
Mobile selecciona/muestra solo `front_photo_url` + `back_photo_url` (líneas 73, 87-88 y render). El
check-in tiene **front/side/back** (web muestra las tres). La foto lateral se pierde en la vista del
coach mobile. También firma solo esas dos vía `signCheckinPhotos`.

### 2.8 [FUNCIONAL — BLOQUEANTE] Gating de módulos ausente
Mobile no tiene `MODULE_KEYS`/`enabled_modules`/kill-switch (`07-shared-seams.md` C.4). El modo
intercambios (2.3) y cualquier sección Pro de nutrición requieren replicar el gate server-side
(`assertModule`) + el mirror `@eva/feature-prefs`/`@eva/module-catalog`. Sin esto no se puede
construir el modo intercambios sin abrir un agujero (un coach sin el módulo podría escribir vía
PostgREST directo).

### 2.9 [FUNCIONAL] Feature-prefs (Funciones de nutrición) — ausente
Web modela `visible = ENTITLED AND ENABLED`; el coach ajusta secciones/preset (Básico/Intermedio/
Profesional) en `/coach/settings/funciones` (`FeaturePrefsPanel`). Mobile no consume
`@eva/feature-prefs` (0 imports). Las secciones de nutrición no se pueden ocultar/mostrar por
preferencia en mobile. (Solapa con dominio de settings, pero impacta qué ve el builder de
nutrición.)

### 2.10 [FUNCIONAL] Guardar comida como grupo — ausente
Web `MealCanvas` permite "guardar comida como grupo" (`saveMealGroup`) reutilizable, y los grupos se
insertan en el builder. Mobile no tiene la acción ni la pantalla de grupos (2.1.4 visual). El board
de adherencia mobile (`getNutritionBoard`) es un espejo simplificado — OK funcionalmente.

### 2.11 Paridad OK / a favor de mobile (no romper)
- `getNutritionBoard` (adherencia 7d, peor-primero) — cubre el board web razonablemente.
- Asignar plantilla a N alumnos, copiar plan a otro alumno, activar/eliminar plan, badges
  SYNCED/CUSTOM — presentes y correctos.
- Fórmula de macros por ítem (`draftItemMacros`, g/ml → qty/100; un → qty·serving/100) coincide
  con `calculateFoodItemMacros` del paquete. (Pero ver 2.1: la CALCULADORA DE METAS es la que
  diverge, no el cálculo por ítem.)
- Propagación in-place por `order_index` preservando `meal_id` (correcto salvo el borrado de
  sobrantes, 2.2).

---

## 3. Costuras (compartir vía packages/ o API, no duplicar)

Todo referenciado a `07-shared-seams.md`:

1. **`@eva/nutrition-engine` (tdee.ts + macros.ts)** — adoptar en mobile; borrar
   `lib/macro-calculator.ts` (C.1) y reemplazar `lib/nutrition-utils.ts` por
   `export * from '@eva/nutrition-engine'` (C.2). Resuelve 2.1 y 2.5 (household). Riesgo: revisar
   que `mode==='template'` etc. no dependan de la firma vieja sin `household_grams`. Añadir path en
   `apps/mobile/tsconfig.json` (hoy solo declara schemas/brand-kit/tiers).
2. **`reconcileMeals`** (`apps/web/src/services/nutrition-propagation.reconcile.ts`) — es una
   función PURA (sin Supabase). NO está en `packages/` (vive en `services/`). Candidato a mover a
   `@eva/nutrition-engine` (o un `@eva/nutrition-sync`) para que mobile `saveClientPlan` y
   `propagateTemplate` la usen y respeten la cascade-safety (2.2). El fetch de `loggedMealIds`
   (qué `nutrition_meals` tienen logs) se reimplementa en mobile con PostgREST directo antes de
   llamar a la fn pura.
3. **`@eva/module-catalog` + gate `entitlements`** (C.4) — para 2.3/2.8. Solo el mirror puro
   (`MODULE_KEYS`/`ModuleKey`/kill-switch) es extraíble; el `assertModule` server-side se replica
   en el endpoint mobile-api (ya existen `/api/mobile/nutrition/exchanges/*`).
4. **`@eva/feature-prefs`** (C, A.3) — para 2.9 (resolver `visible = ENTITLED AND ENABLED`).
5. **`@eva/schemas/nutrition-exchanges`** — Zod del modo intercambios (hoy marcado "SERVER-ONLY"
   en el index; revisar si es apto para mobile o si se consume solo vía API).
6. **API en vez de PostgREST para intercambios:** el modo intercambios ya tiene endpoints
   dedicados (`meal-variant`, `set-mode`, `targets`, `variants`) — usar esos (gating server-side),
   no PostgREST directo.

---

## 4. Tareas propuestas

### Ola A — Re-skin visual (patrón A / EVA DS, sin cambiar comportamiento)
- **A1 [VISUAL][M]** Re-skin hub de Nutrición (`nutricion.tsx`) a primitivas DS: TopBar, tabs DS
  con conteos, cards de plantilla ricas (badge objetivo, barra split macros, chips), board Alumnos
  con columnas Sync/Custom + sección "sin plan". Añadir buscador+filtros DS (sheet de pills). Dep:
  primitivas DS de overlay (Toast/Select) si se usan. — grande por la densidad visual.
- **A2 [VISUAL][M]** Re-skin builder (`nutrition-builder.tsx`): header→TopBar DS, comidas como
  `Card` DS, chips de día/unidad con tokens, warnBox como banner DS, purgar colores hardcodeados.
  Mantener chevrons de reorden (no DnD).
- **A3 [VISUAL][S]** Re-skin check-ins (`check-ins.tsx`): `Card` DS, **quitar Montserrat legacy**
  (→ Archivo/Hanken), energía en estrellas, fecha relativa, visor de foto = bottom-sheet DS con
  front/side/back etiquetados, colores de energía a tokens status.
- **A4 [VISUAL][S]** Re-skin `foods.tsx` a DS o (mejor) fusionarlo como tab embebido del hub
  (paridad con `FoodLibrary`), con pills de categoría, buscador debounce, custom-food-form.
  (Decisión de arquitectura: replicar el patrón web de tab embebido vs pantalla aparte.)

### Ola B — Costuras / correctness (habilitadores, previo a lo funcional grande)
- **B1 [SEAM][S]** Adoptar `@eva/nutrition-engine`: borrar `lib/macro-calculator.ts`, reemplazar
  `lib/nutrition-utils.ts` por re-export; añadir path en tsconfig. Resuelve 2.1. Dep: revisar
  consumidores de la firma vieja.
- **B2 [SEAM/FUNCIONAL][M]** Extraer/compartir `reconcileMeals` y cablearlo en `saveClientPlan` +
  `propagateTemplate` de mobile (fetch de `loggedMealIds` + fn pura). Resuelve 2.2 (data-loss).
  Dep: B1 opcional. Añadir test de orfandad en mobile.
- **B3 [FUNCIONAL][S]** Check-ins: firmar/mostrar `side_photo_url` (2.7) + "Marcar como revisado"
  (`markCheckInReviewed`/`unmark`, `reviewed_at/by`) con toggle optimista + badge/filtro (2.6).
  Puede ir con A3.
- **B4 [FUNCIONAL][S]** Builder: surface de alérgenos/intolerancias/disgustos en FoodSearchSheet
  (`getClientFoodRestrictions`, no solo favoritos). Resuelve 2.4.

### Ola C — Funcional grande (módulos gated / paridad completa)
- **C1 [FUNCIONAL/SEAM][M]** Gating de módulos en mobile (`@eva/module-catalog` + mirror
  entitlements + gate en endpoints). Bloqueante para C2. Resuelve 2.8. (Probable dominio
  compartido con el subagente de módulos de pago — coordinar.)
- **C2 [FUNCIONAL][L]** Modo intercambios (nutrition_exchanges) en el builder mobile:
  `ExchangeModePanel` (toggle gramos↔porciones, variantes de día, totales) + `ExchangeTargetsEditor`
  (autosave), consumiendo `/api/mobile/nutrition/exchanges/*`. PDF de equivalencias (expo-print).
  Dep: C1, esquemas. Resuelve 2.3.
- **C3 [FUNCIONAL][M]** Pantalla Grupos de comidas + acción "guardar comida como grupo" en el
  builder (`saveMealGroup`, `template_meal_groups`/`saved_meals`). Resuelve 2.10 + gap visual
  1.4.
- **C4 [FUNCIONAL][M]** Tab/pantalla Recetas (`RecipeLibrary`, crear/asignar/editar receta, fotos
  vía endpoint firmado). Resuelve gap visual 1.4. Media prioridad (banner "Base", no afecta
  macros).
- **C5 [FUNCIONAL][S]** Feature-prefs de nutrición (`@eva/feature-prefs`) para ocultar/mostrar
  secciones por preferencia. Resuelve 2.9. (Solapa con dominio settings.)
- **C6 [FUNCIONAL][S]** Panel Pro "objetivos por composición corporal" (`goals_bodycomp`) en el
  sidebar/meta del builder. Dep: C1.
- **C7 [FUNCIONAL][S]** Medidas caseras completas (household_grams/label) en custom-food-form +
  cálculo. Dep: B1. Resuelve resto de 2.5.

Esfuerzo total: 2 S + 3 M + 1 L en Ola A/B visibles arriba (recuento exacto en el bloque
estructurado).

---

## 5. Riesgos

- **Data-loss silenciosa (2.2):** hasta arreglar B2, cualquier edición/propagación que reduzca
  comidas en mobile borra historial de adherencia del alumno (cascade). Es un bug activo hoy en la
  app RN, no solo un gap de paridad.
- **Drift de fórmulas (2.1):** mientras coexistan `macro-calculator.ts` (mobile) y
  `@eva/nutrition-engine` (web), el coach ve metas distintas según el dispositivo — confusión y
  desconfianza. Riesgo de re-divergencia si se "arregla a mano" en vez de adoptar el paquete.
- **Seguridad de gating (2.8/C1):** construir el modo intercambios sin replicar `assertModule`
  server-side deja escritura vía PostgREST directo a coaches sin el módulo. El gate DEBE ser
  server-side (endpoint), no solo UI.
- **Doble sistema de theming:** el re-skin (Ola A) debe migrar de objeto `theme` a clases DS; si se
  mezcla mal (className + `theme.*` para lo mismo) se pierde el white-label runtime (ver
  `02-design-system.md` C). Riesgo de tokens hardcodeados que no flipean en dark.
- **Alérgenos (2.4):** riesgo clínico/reputacional bajo pero real — un coach prescribiendo un
  alérgeno sin señal en mobile. Priorizar B4.
- **Copia manual `nutrition-utils.ts` (2.5):** al reemplazar por el paquete, verificar que ningún
  consumidor mobile dependa de la firma sin `household_*` (romper el build silenciosamente en
  runtime PostgREST).
- **`checkins` vs `check_ins`:** el inventario nota dos nombres de tabla tocados en mobile
  (`06-mobile-inventory.md` C). Verificar que check-ins coach lea la tabla correcta (`check_ins`);
  posible fuente de filas faltantes.
