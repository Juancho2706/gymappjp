# 2. El hub de Nutricion (4 pestanas)

> Alcance de esta seccion: la pantalla `/coach/nutrition-plans`, su composicion en `NutritionHub`, las 4 pestanas (Plantillas, Alumnos, Alimentos, Recetas), el board "War Room" (`ActivePlansBoard`), el `AssignModal`, los modales de guia/onboarding, la seccion de plantillas de organizacion (`OrgTemplatesSection`) y, con enfasis en el backend, todas las acciones de `nutrition-coach.actions.ts` que el hub invoca. El builder (`/new`, `/[templateId]/edit`, `/client/[clientId]`) y el gate de intercambios `/exchanges` se documentan en otras secciones; aqui solo se cubre lo que dispara el hub.

---

## 2.0. Composicion y carga de datos del hub

### Server Component que arma todo: `page.tsx`

La ruta `/coach/nutrition-plans` (`apps/web/src/app/coach/nutrition-plans/page.tsx`) es un RSC que orquesta la carga. Pasos backend, en orden:

1. **Identidad y tier.** `getNutritionPlansPageCoach()` devuelve `{ user, coach }`. Si no hay `user`, retorna `null`. `coachId = user.id`. `tier = coach.subscription_tier ?? 'starter'`.
2. **Gate de modulo (entitlement de pago).** `getTierCapabilities(tier).canUseNutrition`. Si es `false`, NO se construye el hub: se renderiza una **pantalla de upgrade** (hero + mockup visual estatico + pricing de Pro mensual/anual + CTA `/coach/subscription?upgrade=pro`) y se emite `<UpgradeGateTracker gate="nutrition" />` para analitica. Los precios salen de `getTierPriceClp('pro', 'monthly' | 'annual')`. Esto es el primer muro: sin el modulo nutricion (Base), el coach jamas ve las pestanas.
3. **Workspace activo.** `getPreferredWorkspaceForRender(coachId)` resuelve el contexto: `enterprise_coach` -> `orgId`; `coach_team` -> `activeTeamId`; `coach_standalone` -> ambos `null`. Se arma `scope = { orgId, activeTeamId }`. Este `scope` es la fuente de aislamiento de TODA la data del hub.
4. **Master switch de dominio (segundo gate, render-only).** `resolveNutritionDomainEnabled({ coachId, clientTeamId, clientOrgId })`. Es la preferencia coach/team que apaga el dominio nutricion para el workspace (fail-OPEN si la flag esta OFF/ausente). Si devuelve `false`, `redirect('/coach/dashboard')`. Atrapa el acceso directo/refresh aunque el item de menu este oculto. No borra datos: solo no construye la superficie.
5. **Carga paralela (`Promise.all`)** de 6 fuentes:
   - `getCoachTemplates(coachId, orgId)` -> plantillas (pestana Plantillas).
   - `getActivePlansBoardData(coachId, scope)` -> filas del board con sparklines/kcal (pestana Alumnos).
   - `getCoachClients(coachId, scope)` -> alumnos del workspace + sus planes (para derivar `assignClients` y `clientsWithoutPlan`).
   - `getFoodLibrary(coachId, { page: 0, pageSize: 120, orgId })` -> primera pagina del catalogo de alimentos (pestana Alimentos).
   - `orgId ? getCoachOrgNutritionTemplates(orgId) : []` -> plantillas de la org (solo enterprise; ver `OrgTemplatesSection`).
   - `getCoachRecipes({ coachId, teamId: activeTeamId })` -> recetas (pestana Recetas).
6. **Derivacion de `assignClients` y `clientsWithoutPlan`.** De `coachClientsRaw` (que trae `nutrition_plans ( id, name, is_active, nutrition_meals ( count ) )`):
   - Invariante clave **"plan vacio = sin plan"**: `planHasMeals(p)` = `(p.nutrition_meals?.[0]?.count ?? 0) > 0`. Un plan `is_active=true` con **0 comidas** es un *draft* (auto-creado al "Asignar") y NO cuenta como plan asignado.
   - `assignClients` = cada alumno con `active_plan = { id, name }` SOLO si tiene un plan activo CON comidas; si no, `active_plan` queda `undefined`.
   - `clientsWithoutPlan` = alumnos que no tienen ningun plan activo-con-comidas (incluye los que solo tienen un draft vacio).

### Render

- Si `orgTemplates.length > 0`, antes del hub se monta `<OrgTemplatesSection orgName="tu organizacion" templates={orgTemplates} />`.
- Luego `<NutritionHub coachId templates activePlans assignClients clientsWithoutPlan foods recipes />`.

### `NutritionHub` (cliente) — estructura de la pantalla

`apps/web/src/app/coach/nutrition-plans/_components/NutritionHub.tsx`. Es `'use client'`. Estado unico: `hubTab` (`useState('clients')` — la pestana **Alumnos** es la default). `hasClients = assignClients.length > 0`.

- **Encabezado.** Titulo "Nutricion" + `AppOnlyBadge` ("Gestionalo desde el celular en la app de EVA") + `CoachNutritionGuideDialog` (boton "Guia rapida"). CTA "Nueva plantilla" -> `Link` a `/coach/nutrition-plans/new`.
- **3 contadores (KPIs):** `templates.length` ("Plantillas"), `activePlans.length` ("Con plan"), `foods.total` ("Alimentos"). Notar: "Con plan" usa el largo del board (ya filtrado a planes con comidas); "Alimentos" usa el `count` total del catalogo, no la pagina cargada.
- **4 pestanas (`Tabs` shadcn):** `templates` / `clients` / `foods` / `recipes`. Cada `TabsContent` arma un `SectionHeading` (icono + titulo) y el componente de la pestana.
  - `templates`: si `templates.length === 0` renderiza `NutritionOnboarding` arriba; siempre `TemplateLibrary`.
  - `clients`: `ActivePlansBoard`.
  - `foods`: `FoodLibrary`.
  - `recipes`: `RecipeLibrary`, con badge de tier `base` + `InfoTooltip` ("vienen incluidas en el modulo de nutricion, no afectan macros ni adherencia").
- El `CoachNutritionGuideDialog` y el `NutritionOnboarding` reciben `onAssign={() => setHubTab('clients')}` — el CTA del paso 3 salta a la pestana Alumnos.

---

## 2.1. Pestana **Plantillas** (`TemplateLibrary`)

`apps/web/src/app/coach/nutrition-plans/_components/TemplateLibrary.tsx`. Es la biblioteca de **protocolos maestros** reutilizables del coach.

### Que datos usa

`templates: TemplateLibraryItem[]`, donde cada item trae `id`, `name`, `description`, `goal_type`, `daily_calories`, `protein_g`, `carbs_g`, `fats_g`, `template_meals[]` (con `id`, `name`, `order_index`) y `assigned_clients[]` (`{ id, full_name }`).

Origen backend: **`getCoachTemplates(coachId, orgId)`** (`_data/nutrition-coach.queries.ts`, `React.cache`):
- Lee `nutrition_plan_templates` con embed profundo: `template_meals -> template_meal_groups -> saved_meals -> saved_meal_items -> food:foods(...)`. Es la jerarquia real de una plantilla (comida -> grupos -> comidas guardadas -> items -> alimento).
- Embed paralelo `assigned_clients:nutrition_plans(client:clients(id, full_name), is_active)`: en la query se traen TODOS los planes ligados al template; en el `.map()` se filtran a los `is_active` y se proyectan a `client`. Asi cada plantilla sabe quien la tiene activa.
- Scope: `.eq('coach_id', coachId)` + `applyOrgScope(query, orgId)` (`.eq('org_id', orgId)` en enterprise, `.is('org_id', null)` en standalone/team). Orden: `created_at` DESC; comidas por `order_index` ASC.

### Que muestra (funcional)

- **Buscador** client-side (`searchTerm`) que filtra por `name` o `description`.
- **Grid de cards**, una por plantilla. Cada card muestra:
  - Badge de objetivo via `goalLabel(goal_type)` (mapea `deficit`/`cut`->"Deficit", `surplus`/`bulk`/`volume`->"Volumen", `maint`->"Mantenimiento", o el raw con guiones->espacios).
  - Nombre + descripcion.
  - 4 cajas de macros: Kcal, P, C, G (con `g`).
  - Barra de split calorico calculada por `macroCalorieSplit(kcal, p, c, f)` (proporciones P*4 / C*4 / G*9 sobre las kcal, o sobre la suma de macros si kcal=0; default 33/34/33).
  - Hasta 8 badges de comidas (ordenadas por `order_index` via `sortedMeals`), con "+N" si hay mas, o "Sin comidas en la plantilla".
  - Footer: conteo de comidas + chip "N activos" si `assigned_clients` tiene elementos.

### Acciones que ofrece (y su backend)

1. **Editar** (icono lapiz / boton "Ver plan") -> `router.push('/coach/nutrition-plans/{id}/edit')` o `Link` a la misma ruta (el builder en modo plantilla). No es accion server aqui.

2. **Duplicar** -> `duplicateNutritionTemplate(id, coachId)`.
   - Backend (`nutrition-coach.actions.ts`): `requireCoachNutritionScope` -> obtiene `{ supabase, orgId }`. Llama `NutritionService.duplicateTemplate(templateId, coachId, orgId)` (clona la plantilla completa). `revalidatePath('/coach/nutrition-plans')`. Toast "Plantilla duplicada".

3. **Eliminar** -> abre `AlertDialog` (texto: "No afectara planes ya asignados a alumnos. Esta accion no se puede deshacer.") -> `deleteNutritionTemplate(id, coachId)`.
   - Backend: `requireCoachNutritionScope`. `DELETE FROM nutrition_plan_templates WHERE id = templateId AND coach_id = coachId` + `applyOrgScope`. Si error -> "No se pudo eliminar la plantilla.". `revalidatePath('/coach/nutrition-plans')`.
   - **Invariante:** borrar la plantilla NO toca los `nutrition_plans` ya asignados a alumnos (son filas independientes; el `template_id` puede quedar colgando pero el plan del alumno sigue vivo).

4. **Asignar** -> abre `AssignModal` con `{ id, name, assigned_client_ids }`. Detallado en 2.5.

`onAssigned` del modal llama `router.refresh()` para recargar el RSC.

---

## 2.2. Pestana **Alumnos / Seguimiento** — `ActivePlansBoard` (War Room)

`apps/web/src/app/coach/nutrition-plans/_components/ActivePlansBoard.tsx`. Pestana default del hub. Es el tablero de seguimiento de adherencia de los alumnos con plan.

### Que datos usa

`activePlans: ActivePlanBoardRow[]` (cada fila: `id`, `name`, `is_custom`, `client_id`, `updated_at`, `clients{id,full_name}`, `sparkline7d:number[]`, `todayCaloriesConsumed`, `dailyTargetCalories`) + `clientsWithoutPlan: {id, full_name}[]`.

### Backend que produce el board: `getActivePlansBoardData(coachId, scope)`

`_data/nutrition-coach.queries.ts`. Dos capas:

**Capa 1 — `getActiveClientPlans(coachId, scope)`** (planes activos crudos):
- Lee `nutrition_plans` (`is_active=true`) con embeds `clients(id, full_name, team_id)`, `nutrition_plan_templates(name)`, `nutrition_meals(count)`. Orden `updated_at` DESC, `.limit(ACTIVE_PLANS_BOARD_LIMIT = 500)` (acota fan-out en coaches grandes tipo Movida ~300+ alumnos).
- **Scope 3-vias:**
  - `scope.orgId` (enterprise): `.eq('coach_id', coachId).eq('org_id', orgId)`.
  - `scope.activeTeamId` (team): obtiene `poolIds = getPoolClientIds(teamId)` (alumnos del pool, `org_id null`); si vacio retorna `[]`; si no, `.is('org_id', null).in('client_id', poolIds)` — **colaborativo, SIN filtro por `coach_id`** (cualquier coach del pool ve los planes del pool; RLS es el techo).
  - standalone: `.eq('coach_id', coachId).is('org_id', null)` + post-filtro **allowlist** de clientes standalone (`coach_id`+`org_id null`+`team_id null`) para no incluir por error planes de alumnos de pool del mismo coach (fail-closed por allowlist, no denylist).
- **Filtro "plan vacio = sin plan":** descarta filas donde `nutrition_meals[0].count === 0`. Un draft vacio NO aparece en el board.

**Capa 2 — calculo de sparkline + kcal (zona America/Santiago):**
- Calcula `dayLabels` = ultimos 7 dias (`yyyy-MM-dd`) terminando hoy en Santiago (`getTodayInSantiago`).
- `Promise.all` de 2 queries:
  - `daily_nutrition_logs` (con embed `nutrition_meal_logs(meal_id, is_completed, consumed_quantity)`) para los `clientIds`, en el rango de 7 dias.
  - `nutrition_meals(id, plan_id, day_of_week, food_items(quantity, unit, swap_options, foods(...)))` para los `planIds`.
- Indexa logs por `client_id|plan_id` y comidas por `plan_id`.
- **`sparkline7d`** por dia: `applicable` = comidas que aplican ese dia (`nutritionMealAppliesOnIsoYmdInSantiago`, respeta `day_of_week`); si no hay aplicables -> 0; si hay -> `% = round(done/denom*100)` donde `done` = meal_logs `is_completed` cuyo `meal_id` esta en las aplicables. Cap a 100. **Es % de comidas marcadas, NO macros.**
- **`todayCaloriesConsumed`**: usa `normalizeMealForMacros` + `portionPctMapFromMealLogs(today)` + `calculateConsumedMacrosWithCompletionFallback(mealsHoy, completadas, targets, portionMap)`. Es kcal consumidas hoy (con fallback de completitud); redondeado.
- **`dailyTargetCalories`** = `plan.daily_calories` (o `null`).

### Que muestra (funcional)

- **Buscador** client-side por nombre de alumno o de plan (`query`).
- **Orden** (3 botones): "Alumno" (`name`), "Plan" (`plan`), "Actualizado" (`updated`, por `updated_at` DESC).
- **Dos columnas** segun `is_custom`: **Sincronizados (SYNCED)** = `!is_custom` (siguen una plantilla; cambios a la plantilla se propagan) vs **Personalizados (CUSTOM)** = `is_custom` (plan editado a mano por alumno, no sincroniza con plantilla). Cada columna vacia muestra "Sin planes en esta columna".
- **`PlanCard`** por plan: avatar (inicial del nombre), nombre del alumno, nombre del plan, badge SYNCED/CUSTOM, label "Ultimos 7 dias", "Hoy: {todayCaloriesConsumed} / {round(dailyTargetCalories)} kcal" (o solo "kcal" si no hay meta), **sparkline** (7 barras de altura proporcional a la adherencia diaria, min 6%), y "Mas detalle: perfil del alumno".
- **Acciones de la card:** "Gestionar plan" -> `Link` a `/coach/nutrition-plans/client/{client_id}` (el builder modo plan-de-alumno). Boton papelera -> abre `AlertDialog` de quitar plan.
- **Seccion "Sin plan activo (N)"** (solo si `clientsWithoutPlan.length > 0`): grid de cards con nombre del alumno + `AssignButton`.
- **Empty total:** si no hay planes ni alumnos sin plan -> "No hay alumnos en tu cartera".

### Acciones y backend

1. **Quitar plan** (`AlertDialog` "Quitar plan de nutricion") -> `unassignNutritionPlan(coachId, clientId, planId)`.
   - Backend: `requireCoachNutritionScope`. Busca el plan con `id`+`client_id`+`coach_id`+`applyOrgScope` (`.maybeSingle()`); si no existe -> "Plan no encontrado o no pertenece a tu cuenta." Hace `UPDATE nutrition_plans SET is_active=false WHERE id=planId` + `applyOrgScope`. `revalidatePath('/coach/nutrition-plans')` + `/coach/clients/{clientId}`.
   - **Invariante:** es un *soft-unassign* (solo flip de `is_active`); NO borra comidas ni logs. Toast "Plan desasignado".

2. **AssignButton (alumnos "Sin plan activo")** -> `createEmptyClientNutritionPlan(coachId, clientId)`, luego navega a `/coach/nutrition-plans/client/{clientId}`.
   - Backend (clave para "plan vacio = sin plan"): `requireCoachNutritionScope`. Gate 3-vias de pertenencia del alumno (team: `team_id`+`org_id null`; standalone: `coach_id`+`org null`+`team null`; enterprise: `coach_id`+`org`). Si no -> "Alumno no encontrado."
     - **Idempotencia:** si ya hay un plan activo (incluido un draft previo), lo **reusa** y devuelve su `planId` (no duplica).
     - Si no hay plan activo: desactiva leftovers (`UPDATE is_active=false WHERE client_id` + `applyOrgScope`) e inserta un **draft vacio**: `name='Plan sin titulo'`, macros en 0, `is_active=true`, `is_custom=true`, `last_edited_by_coach_id=coachId`, 0 comidas.
     - `revalidatePath('/coach/nutrition-plans')`. Devuelve `planId`.
   - El comentario del codigo lo explica: un plan con 0 comidas se trata como "sin plan" en `getActiveClientPlans`/`getCoachClients` y en la app del alumno (`getActiveNutritionPlan`), asi un draft abandonado no le muestra plan vacio al alumno ni lo saca de "Sin plan activo". Existe SOLO para abrir el editor con `planId` real (el modo Porciones de intercambios exige un plan persistido).

---

## 2.3. Pestana **Alimentos** (`FoodLibrary`)

`apps/web/src/app/coach/nutrition-plans/_components/FoodLibrary.tsx`. Biblioteca nutricional: catalogo global + alimentos custom del coach. (La pestana es un espejo de `/coach/foods`.)

### Que datos usa

`initialFoods` (primera pagina, 120 items desde `page.tsx`), `totalFoods` (count exacto del catalogo), `coachId`.

Origen backend: **`getFoodLibrary(coachId, options)`** y la accion **`searchCoachFoodLibrary`**:
- `getFoodLibrary` (`React.cache`): `SELECT id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id, is_liquid, brand` con `count:'exact'`. Paginado por `range(page*pageSize, ...)`. Filtros: busqueda por `name_search` (normaliza NFD, quita tildes, escapa `%`, `ilike`), `category`, `maxCalories`.
- **Scope de visibilidad (`foodWorkspaceFilter`):** enterprise -> system (`coach_id null, org_id null`) + foods de la org (`org_id = orgId`); standalone -> system + propios (`coach_id = me, org_id null`). RLS es el techo; el filtro elige el catalogo correcto.
- **"Mis alimentos" (`mine=true`):** `selected.eq('coach_id', coachId)` — SOLO los custom del coach, **server-side**. (Gotcha historico documentado: antes era filtro client-side sobre una pagina parcial -> lista vacia + infinite-scroll en loop.)
- `searchCoachFoodLibrary` (server action) resuelve `orgId` server-side via `resolveCoachScope` (nunca confia en el cliente) y delega a `getFoodLibrary`.

### Que muestra y como pagina (funcional)

- **Buscador** con debounce 350ms (`debouncedSearch`) -> re-fetch `searchCoachFoodLibrary` (`refresh`, `useTransition`).
- **Orden** client-side: Nombre / Kcal (desc) / Proteina (desc).
- **Alcance:** "Todos" vs "Mis alimentos" (`scope`, server-side).
- **Categorias** (chips): Proteina, Carbohidrato, Grasa, Lacteo, Fruta, Verdura, Legumbre, Bebida, Snack, Otro + "Todas".
- Contador "Mostrando N / Total catalogo {total}".
- **Infinite scroll:** `IntersectionObserver` sobre un sentinel -> `loadMore` (siguiente pagina, `PAGE_SIZE=80`) mientras `foods.length < total`. "Todos los alimentos cargados" al final.
- Lista renderizada via `FoodListCompact`.

### Acciones y backend

1. **Nuevo alimento** (`Dialog` + `CustomFoodForm`) -> `saveCustomFood(coachId, prevState, formData)` via `useActionState`.
   - Backend: `requireCoachSession`. Parsea del FormData: `name`, `calories`/`protein`/`carbs`/`fats` (**por 100 g**, redondeados al entero), `category` (default `'otro'`), `unit` (`g`/`ml`/`un`), `serving_unit` derivado, `is_liquid = unit==='ml'`, `serving_size` (100 default; en modo `un` = gramos por unidad), y **medida casera opcional** (`household_label` + `household_grams`, solo en modo gramos). Valida con `CustomFoodSchema`. Inserta en `foods` con `coach_id=coachId`. `revalidatePath('/coach/nutrition-plans')` + `/coach/foods`.
   - El form ademas tiene preview de % calorias (`macroPreviewPct`) y ayuda contextual segun unidad.
   - (Existe tambien `addCoachCustomFood(coachId, food)` — variante JSON con `CustomFoodSchema`, usada por otros call-sites; mismo destino `foods` con `coach_id`.)

2. **Eliminar alimento** (desde `FoodListCompact`) -> `handleDelete` con **undo optimista**: quita de la lista, baja `total`, y agenda `deleteCoachCustomFood` a los 5s (toast "Deshacer" cancela el timer y restaura). Si la accion falla, restaura y toast de error.
   - Backend `deleteCoachCustomFood(coachId, foodId)`: `requireCoachSession`. `DELETE FROM foods WHERE id=foodId AND coach_id=coachId` (solo borra alimentos propios; los del system/org no son borrables). `revalidatePath('/coach/nutrition-plans')` + `/coach/foods`.

---

## 2.4. Pestana **Recetas** (`RecipeLibrary`)

`apps/web/src/app/coach/nutrition-plans/_components/recipes/RecipeLibrary.tsx`. Tier **Base** (incluido en el modulo nutricion; el `TierBadge tier="base"` + tooltip lo marcan explicito: "no afectan macros ni adherencia" — son inspiracion, no entran al motor de adherencia).

### Que datos usa

`recipes: RecipeRow[]` (de `@/services/nutrition-recipes.service`) + `clients: RecipeAssignClient[]` (reusa `assignClients`).

Origen backend: **`getCoachRecipes({ coachId, teamId })`** (`_data/recipes.queries.ts`). Cada `RecipeRow` trae al menos `id`, `name`, `image_url`, `ingredients_text`.

### Que muestra (funcional)

- Header con `TierBadge`/tooltip + `CreateRecipeDialog` (crear receta).
- Empty state ("Todavia no tienes recetas") con CTA de crear.
- Grid de cards: imagen (o placeholder con icono `ChefHat`), nombre, `ingredients_text` (3 lineas), y 3 acciones: "Compartir", editar (lapiz), eliminar (papelera).

### Acciones y backend

1. **Crear / Editar** -> `CreateRecipeDialog` (con `recipe` para editar). Persiste via `recipes.actions.ts` (no en `nutrition-coach.actions.ts`).
2. **Compartir** -> abre `AssignRecipeModal` con la receta + `clients`; comparte/asigna la receta a alumnos.
3. **Eliminar** -> `deleteRecipeAction({ recipeId })` (de `recipes.actions.ts`), con spinner por id; toast de exito/error.

> Estas acciones viven en `_actions/recipes.actions.ts`, fuera del archivo `nutrition-coach.actions.ts`; las recetas son un sub-dominio separado del board/plantillas.

---

## 2.5. `AssignModal` — asignar protocolo a 1 o varios alumnos

`apps/web/src/app/coach/nutrition-plans/_components/AssignModal.tsx`. Se abre desde el boton "Asignar" de cada card de `TemplateLibrary`.

### Que recibe / muestra

- `template: { id, name, assigned_client_ids[] }`, `clients: AssignModalClient[]` (cada uno `{ id, full_name, active_plan? }`).
- Cabecera con la plantilla seleccionada.
- Lista de alumnos (multi-seleccion con checkbox), buscador por nombre, "Seleccionar/Deseleccionar todos".
- **Avisos por alumno** (logica `someClientHasActivePlan`):
  - Si el alumno **ya tiene esta plantilla** (`assigned_client_ids.includes(id)`): "Ya tiene esta plantilla (reasignar actualizara el plan)".
  - Si tiene OTRO plan activo: "Plan activo: {nombre} (se reemplazara)".
  - Banner global ambar si algun seleccionado tiene plan activo: "Sera **reemplazado** por esta plantilla."
- Boton "Asignar (N)".

### Accion y backend

`handleAssignTemplate` -> `assignTemplateToClients(template.id, coachId, selectedClients)`.
- Es un alias de orden historico: **`assignTemplateToClients(templateId, coachId, clientIds)` -> `assignTemplateToClientIds(coachId, templateId, clientIds)`**.
- `assignTemplateToClientIds`: `requireCoachNutritionScope` -> `{ supabase, orgId }`. Si `clientIds` vacio -> `{ success: true }`. Llama **`NutritionService.propagateTemplateChanges(templateId, coachId, JSON.stringify(clientIds), orgId)`**. `revalidatePath('/coach/nutrition-plans')` + `/coach/clients`.

### Que hace `propagateTemplateChanges` (motor de asignacion/sincronizacion)

`apps/web/src/services/nutrition.service.ts`. Es el corazon del "asignar" y de la sincronizacion SYNCED. Pasos:

1. **Universo de alumnos** = union de los `selectedClients` (recien elegidos) **+** los alumnos que YA tienen un plan SYNCED de esta plantilla (`nutrition_plans` con `template_id`, `is_active`, `is_custom=false`). Asi un cambio a la plantilla repropaga a todos los que la siguen, no solo a los nuevos. Si vacio, retorna.
2. **Carga la plantilla** completa (meals -> groups -> saved_meals -> items). Si no existe -> "Plantilla no encontrada". Valida con `assertTemplateMealsAreComplete` (las comidas no pueden estar incompletas).
3. **Gate de pertenencia (seguridad):** verifica que TODOS los `allClientIds` pertenecen al coach+org (`clients` `.eq('coach_id', coachId)` + `applyOrgScope`). Si el set permitido no iguala al pedido -> lanza "Uno o mas alumnos no pertenecen al workspace activo." (impide asignar a alumnos ajenos).
4. **Pre-fetch batcheado** de los planes SYNCED existentes de todos los clientes (1 query, RLS-scoped) -> `existingPlanByClient`.
5. **Por alumno**, calcula el diff con la pure-fn **testeada `reconcileMeals`** (match por `order_index`):
   - **Cascade-safety (CRITICO):** antes de borrar, averigua que comidas huerfanas (las `order_index` que ya no existen) tienen `nutrition_meal_logs`. `reconcileMeals` recibe ese set (`loggedMealIds`) y **NO borra comidas con historial** (preserva la adherencia del alumno) — solo borra las sin logs. Produce `toDelete` / `toUpdate` (preserva IDs -> los meal_logs sobreviven) / `toInsert`.
   - Para cliente nuevo (sin plan SYNCED previo): `mode:'create'`, todas las comidas como insert.
6. **Aplicacion atomica por alumno** via RPC **`apply_nutrition_template_to_client(p_op, p_coach)`** — un solo statement = una transaccion. Si un alumno falla, su plan no queda a medias (rollback del RPC) y NO aborta a los demas: se acumula en `failures` y, al final, si hubo fallas, lanza un error con el detalle ("Propagacion incompleta: N de M alumno(s)... Reintenta (re-correr reconcilia los ya aplicados)."). Re-correr es idempotente por `order_index`.
   - Nota de seguridad del codigo: `p_coach` solo lo honra el RPC bajo `service_role` (cron de ciclos sin `auth.uid()`); en sesion de coach, `auth.uid()` gana y `p_coach` se ignora (sin impersonacion).

> Resumen de invariantes del "asignar": (a) reemplaza el plan activo del alumno por uno SYNCED de la plantilla; (b) **nunca** destruye logs de adherencia de comidas que persisten (match por `order_index`, no recreacion); (c) **gate estricto** de pertenencia al workspace; (d) atomicidad por alumno; (e) re-asignar a quien ya tiene la plantilla = re-sincronizar.

---

## 2.6. Modales de guia y onboarding

### `CoachNutritionGuideDialog` (boton "Guia rapida")

`_components/CoachNutritionGuideDialog.tsx`. Dialog permanente disponible siempre en el header. Muestra:
- **3 pasos** desde `COACH_NUTRITION_ONBOARDING_STEPS` (`nutrition-onboarding-shared.ts`):
  1. "Agrega tus alimentos" -> `Link` `/coach/foods`.
  2. "Crea tu primera plantilla" -> `Link` `/coach/nutrition-plans/new`.
  3. "Asigna el plan a un alumno" -> boton (no link) que llama `onAssign` (salta a pestana Alumnos). **Deshabilitado si `!hasClients`** (mensaje "Necesitas al menos un alumno...").
- **Bloque "Que incluye nutricion"** que lista `NUTRITION_SURFACES` con su `TierBadge` (Base vs Pro): Recetas (base), Micronutrientes (base), Notas (base), Lista de compras (base), Objetivos (base), **Intercambios (pro)**. Es la capa de claridad Base-vs-Pro.

### `NutritionOnboarding` (banner dismissible en pestana Plantillas)

`_components/NutritionOnboarding.tsx`. Solo se monta cuando `templates.length === 0`. Mismos 3 pasos que la guia. Su estado de "ocultar" se persiste **en localStorage por coach** (`readCoachNutritionOnboardingDismissed(coachId)` / `writeCoachNutritionOnboardingDismissed(coachId)` de `@/lib/coach-nutrition-onboarding-storage`) — no toca DB. Mientras `dismissed===null` muestra un skeleton; boton "Entendido, ocultar" lo dismisea.

---

## 2.7. `OrgTemplatesSection` — plantillas de organizacion (solo enterprise)

`_components/OrgTemplatesSection.tsx`. Se renderiza por encima del hub SOLO si `orgTemplates.length > 0` (es decir, hay `orgId` y `getCoachOrgNutritionTemplates(orgId)` devolvio filas; en standalone/team la lista es `[]` y la seccion retorna `null`).

- Datos: `OrgNutritionTemplate[]` (`id`, `name`, `goal_type`, `daily_calories`, `protein_g`, `carbs_g`, `fats_g`) desde `getCoachOrgNutritionTemplates(orgId)` (`_data/nutrition-page.queries.ts`).
- Muestra una tarjeta por plantilla de la org con su objetivo (mapeo `GOAL_LABELS`: deficit/maintenance/surplus) y macros.
- Accion: "Usar" -> `Link` a `/coach/nutrition-plans/new?org_template={t.id}` (abre el builder pre-cargando esa plantilla de la org como base de una nueva plantilla del coach). No es una accion server por si misma; el pre-llenado ocurre en el builder.

---

## 2.8. Mapa rapido backend del hub (referencia)

| Accion (UI) | Server action | Servicio / RPC / tabla | Persiste / efecto |
| --- | --- | --- | --- |
| Asignar plantilla | `assignTemplateToClients` -> `assignTemplateToClientIds` | `NutritionService.propagateTemplateChanges` -> RPC `apply_nutrition_template_to_client` | crea/sincroniza `nutrition_plans` SYNCED + `nutrition_meals` + `food_items`; preserva `nutrition_meal_logs` |
| Crear/editar plantilla (builder) | `upsertCoachNutritionTemplate` | `NutritionService.createOrUpdateTemplateFromJson` + `propagateTemplateChanges` | upsert `nutrition_plan_templates`/`template_meals`/...; repropaga a SYNCED |
| Duplicar plantilla | `duplicateNutritionTemplate` | `NutritionService.duplicateTemplate` | clona `nutrition_plan_templates` (+ jerarquia) |
| Eliminar plantilla | `deleteNutritionTemplate` | `DELETE nutrition_plan_templates` (coach+org scoped) | borra la plantilla; NO afecta planes asignados |
| Quitar plan (board) | `unassignNutritionPlan` | `UPDATE nutrition_plans SET is_active=false` | soft-unassign; no borra comidas/logs |
| Asignar (sin plan) | `createEmptyClientNutritionPlan` | `INSERT nutrition_plans` draft vacio (idempotente) | draft `is_active`/0 comidas = "sin plan"; abre editor |
| Nuevo alimento | `saveCustomFood` / `addCoachCustomFood` | `INSERT foods` (`coach_id`) | alimento custom del coach |
| Eliminar alimento | `deleteCoachCustomFood` | `DELETE foods WHERE coach_id=me` | borra solo propios (con undo optimista UI) |
| Buscar alimentos | `searchCoachFoodLibrary` | `getFoodLibrary` (`resolveCoachScope`) | lectura paginada/filtrada, org-aware |
| Recetas (crear/editar/compartir/borrar) | `recipes.actions.ts` (`deleteRecipeAction`, etc.) | `nutrition-recipes.service` | sub-dominio Base, no entra al motor de adherencia |

### Invariantes de seguridad de datos transversales del hub

- **Doble gate de modulo:** entitlement de pago (`capabilities.canUseNutrition`) en `page.tsx` + master switch de dominio (`resolveNutritionDomainEnabled`, redirect a dashboard). Ambos render-only: no borran datos.
- **Aislamiento por workspace (3-vias)** en TODA query/accion: enterprise (`coach_id`+`org_id`), team (pool por `team_id`, colaborativo sin `coach_id`), standalone (`coach_id`+`org null`+`team null`). `requireCoachNutritionScope` exige sesion (`auth.getUser`, `user.id===coachId`) y resuelve el scope; `applyOrgScope`/`applyClientScope` lo aplican. RLS es el techo.
- **"Plan vacio = sin plan"** unifica board, derivacion de `clientsWithoutPlan` y la app del alumno: `count(nutrition_meals)===0` -> tratado como sin plan.
- **No-destruccion de adherencia:** asignacion/sincronizacion matchea por `order_index` (modo gramos) o por `id` (modo exchanges) y nunca borra comidas con `nutrition_meal_logs`; `nutrition_meal_logs.meal_id` es ON DELETE CASCADE, por eso el cuidado.
- **Atomicidad por alumno** en la propagacion (RPC transaccional) con reporte de fallas accionable e idempotencia al reintentar.
