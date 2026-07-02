# 6. Alimentos, Grupos de comidas y Recetas

Esta sección cubre los tres catálogos auxiliares que alimentan al builder de nutrición: **Alimentos** (food DB), **Grupos de comidas** (`saved_meals`) y **Recetas**. El énfasis es backend: qué datos llegan, qué se calcula, dónde se persiste, qué servicio/acción/RPC/tabla toca y las invariantes de seguridad de datos (scoping, RLS, GRANT de columnas).

> Aviso de arquitectura crítico: existen **DOS sistemas de "recetas"** en el código. El sistema **VIVO** es el feature L (`nutrition_recipes` + `nutrition_recipe_assignments`), que vive como pestaña dentro del hub `/coach/nutrition-plans`. El sistema **LEGACY MUERTO** (tablas `recipes` + `recipe_ingredients`, componentes `RecipeLibraryClient`, `RecipeModal`, `RecipeSearch`, acción `saveRecipe`) está enrutado a `/coach/recipes`, pero **`/coach/recipes/page.tsx` solo hace `redirect('/coach/foods')`** — es inalcanzable por navegación normal. Ambos se documentan, pero el rediseño debe basarse en el sistema vivo.

---

## 6.0 Mapa de rutas y tablas (resumen)

| Catálogo | Ruta UI | Tabla(s) principal(es) | Acción/servicio backend |
|---|---|---|---|
| Alimentos (página) | `/coach/foods` | `foods` | `saveCustomFood` (crear) · `getFoodLibrary` / `searchCoachFoodLibrary` (leer) |
| Alimentos (búsqueda en modales) | embebido | `foods` | `FoodSearch` (query directa client-side) |
| Grupos de comidas | `/coach/meal-groups` | `saved_meals` + `saved_meal_items` | `saveMealGroup` / `deleteMealGroup` · `getMealGroups` |
| Recetas (VIVO, feature L) | tab "Recetas" en `/coach/nutrition-plans` | `nutrition_recipes` + `nutrition_recipe_assignments` | `recipes.actions.ts` → `nutrition-recipes.service.ts` |
| Recetas (LEGACY MUERTO) | `/coach/recipes` (redirect) | `recipes` + `recipe_ingredients` | `saveRecipe` / `deleteRecipe` (en `recipes/_actions`) |

---

## 6.1 ALIMENTOS (`/coach/foods`)

### 6.1.1 Modelo de datos: tabla `foods`

Una fila de `foods` representa un alimento del catálogo. Columnas leídas por el menú: `id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit, category, coach_id, is_liquid, brand`, más `household_grams`, `household_label`, `name_search`, `org_id`.

Semántica clave de macros (definida en `AddFoodSheet` y respetada por todos los cálculos): **`calories/protein_g/carbs_g/fats_g` son SIEMPRE por 100 g** (estilo tabla nutricional), independientemente de `serving_unit`.

- `serving_unit ∈ {'g','un','ml'}`. Para `'un'` (contable: huevo, manzana), `serving_size` = gramos que pesa **1 unidad** (ej. huevo ≈ 60). Para `'g'`/`'ml'`, `serving_size` es solo una porción de referencia (default 100).
- `is_liquid` se deriva: `true` solo si `serving_unit === 'ml'`.
- `household_grams` + `household_label` (solo para `'g'`): medida casera opcional ("1 taza = 120 g"). Es **display sobre gramos, no reemplaza la masa ni cambia macros** (comentario explícito en el schema).
- `coach_id`: `NULL` ⇒ alimento **global del sistema EVA**; set ⇒ **custom del coach**. Discrimina "Propio" (estrella) vs "Global" (globo) en `FoodListCompact` por `food.coach_id === coachId`.
- `org_id`: scoping enterprise (alimento de una organización).

### 6.1.2 Distinción de scope (workspace-aware) — Fase 2C

El catálogo que ve el coach depende del **workspace activo**, resuelto server-side, nunca del cliente. La página resuelve el scope con `resolveCoachScope(supabase, coachId)` y pasa `orgId = scope.ok ? scope.orgId : null`. El filtro real lo construye `foodWorkspaceFilter(coachId, orgId)` en `nutrition-coach.queries.ts`:

- **Enterprise** (`orgId` set): `and(coach_id.is.null,org_id.is.null)` (system EVA) **OR** `org_id.eq.${orgId}` (alimentos de la org).
- **Standalone** (`orgId` null): system EVA **OR** `and(coach_id.eq.${coachId},org_id.is.null)` (los customs propios).

RLS refuerza el límite en DB; este filtro solo elige el catálogo del workspace correcto. Espejo del `getExerciseCatalog`.

### 6.1.3 Lectura: `getFoodLibrary` (RSC + server action)

`getFoodLibrary(coachId, options)` (en `nutrition-coach.queries.ts`, envuelto en `React.cache`) es la query canónica:

- `SELECT` de columnas específicas con `{ count: 'exact' }` (paginado real).
- `options`: `search`, `category`, `maxCalories`, `page`, `pageSize` (default 50; la página inicial pide 120), `orgId`, `mine`.
- **`mine === true`** ⇒ filtra `eq('coach_id', coachId)` (SOLO los customs del coach). **`mine === false`** ⇒ `or(foodWorkspaceFilter(...))`.
  - Nota backend (bug fix histórico): "Mis alimentos" se filtra **server-side**. Antes se filtraba client-side sobre una página parcial del catálogo global → la lista quedaba vacía y el infinite-scroll disparaba en loop.
- Orden: `order('coach_id', desc)` (customs primero) luego `order('name')`. `.range(page*pageSize, ...)`.
- **Búsqueda**: usa la columna generada **`name_search`** (normalizada, accent-insensitive). El término se normaliza en JS: NFD + strip de diacríticos (`[̀-ͯ]`) + lowercase + escape de `%`, y se aplica con `ilike('name_search', '%term%')`. Esto permite buscar "platano" y encontrar "Plátano".
- `category` filtra `eq('category', cat)` salvo `'todos'`. `maxCalories` aplica `lte('calories', n)`.
- Devuelve `{ foods, total }`.

Server action `searchCoachFoodLibrary(coachId, options)` (en `food-library.actions.ts`): re-resuelve `orgId` server-side con `resolveCoachScope` (nunca confía en el cliente) y delega a `getFoodLibrary`. Es lo que llama el `FoodBrowser` desde el cliente al cambiar búsqueda/categoría/scope.

`getCoachFoodsCatalog(coachId, orgId)` es una variante sin paginar (lista completa con el mismo `foodWorkspaceFilter`), usada por el editor legacy.

### 6.1.4 Página y auth

`page.tsx`: obtiene el user con `getCoachFoodsUser()` (lee `getClaims()` — verificación local del JWT ES256, sin round-trip a `/user`; el proxy ya validó la sesión); si no hay user, `redirect('/login')`. Resuelve scope, hace la carga inicial (`page:0, pageSize:120`) y renderiza `<AddFoodSheet>` + `<FoodBrowser>`.

### 6.1.5 Frontend funcional

**`FoodBrowser`** (cliente): estado de `foods`/`total` hidratado con los iniciales del RSC.
- Buscador con **debounce 300 ms** → `searchCoachFoodLibrary` dentro de `useTransition` (spinner `pending`), `pageSize: 150`.
- Controles: **Orden** (`name`/`calories`/`protein` — ordena en cliente sobre la lista cargada, descendente para kcal/prot, alfabético para nombre); **Alcance** (toggle "Solo mis alimentos" ⇒ `mine:true` / "Catálogo completo" ⇒ `mine:false`, dispara refetch server-side); **Categorías** (chips derivados de las categorías presentes en la lista cargada). Muestra "N visibles · T en catálogo".
- Renderiza `FoodListCompact` con los items ordenados.

**`FoodListCompact`** (multi-domain, en `components/coach/`): tabla compacta. Marca "Propio" (estrella) vs "Global" (globo) por `coach_id === coachId`. Muestra `unitHint` ("1 un ≈ 60g") cuando `serving_unit` no es g/ml. Acepta un prop opcional `onDelete(foodId)` que pinta un botón de basurero **solo en filas propias** — pero **la página `/coach/foods` NO pasa `onDelete`**, así que desde esta página no hay borrado ni edición de customs (solo lectura + alta).

**`FoodSearch`** (cliente, usado en modales como `MealGroupModal`): query **directa a Supabase desde el cliente** (`createClient()` de `lib/supabase/client`), no pasa por server action. Requiere ≥3 chars o una categoría para disparar (debounce 300 ms, `limit(40)`, `ilike('name_search', ...)`). Tiene su propia lista fija de categorías en español. Devuelve el food vía `onFoodSelected`. Como la lectura va por RLS del cliente authenticated, el coach ve system + sus customs + (según RLS) lo de su workspace.

### 6.1.6 Crear alimento custom — `saveCustomFood`

UI: `AddFoodSheet` (sheet inferior) con `useActionState(saveCustomFood.bind(null, coachId), ...)`. Al `success`: cierra, toast "Alimento creado", `router.refresh()`.

Campos del form (multipart): `name`, `calories`, `protein`, `carbs`, `fats` (los 4 macros **por 100 g**), `category` (opcional), `unit` (hidden, `'g'`/`'un'`), `serving_size` (default 60 si `un`, 100 si `g`), y para `g`: `household_label` + `household_grams`. El sheet muestra un preview de **% de calorías** por macro (`macroPreviewPct`: P·4, C·4, G·9 sobre kcal o sobre la suma calórica si kcal=0) — puramente visual.

Backend `saveCustomFood(coachId, prevState, formData)` (`nutrition-coach.actions.ts`):
1. `requireCoachSession(coachId)` — valida sesión y devuelve supabase request-scoped.
2. Parseo y coerción: `calories/protein/carbs/fats` con `Math.round(parseFloat(...))` (se persisten **enteros**). `serving_unit` se normaliza a `'g'|'un'|'ml'`; `is_liquid = serving_unit === 'ml'`. `serving_size`: usa el parseado si `>0`, si no 100. Medida casera solo aplica si `unit==='g'` y label+grams válidos.
3. **Validación Zod server-side** con `CustomFoodSchema` (de `@eva/schemas`): `name` 1–120, `calories` int 0–9000, macros 0–500, `serving_size` >0 ≤10000, `serving_unit` enum, `category` enum `VALID_FOOD_CATEGORIES`, `household_grams` >0 ≤10000 opcional, `household_label` ≤30 opcional. Si falla ⇒ `{ error, success:false }` (mensaje del primer issue Zod).
4. `INSERT` en `foods` con `coach_id: coachId` (⇒ siempre custom del coach). `category` default `'otro'` si vacío.
5. `revalidatePath('/coach/nutrition-plans')` + `revalidatePath('/coach/foods')`.

> Invariante de seguridad: el `INSERT` setea `coach_id` desde el `coachId` validado por sesión, no del body. **No setea `org_id`** explícitamente (queda NULL por default), por lo que un custom creado acá es del scope standalone del coach. RLS de `foods` permite al `authenticated` insertar filas con su propio `coach_id`.

> No hay acción de **editar** ni **borrar** alimento custom desde el menú de Alimentos (la página no cablea `onDelete`, y no existe `updateCustomFood`/`deleteCustomFood`). Es alta + lectura. El rediseño con feature parity debe replicar exactamente: crear y listar; no inventar edición que hoy no existe.

---

## 6.2 GRUPOS DE COMIDAS (`/coach/meal-groups`)

### 6.2.1 Modelo de datos: `saved_meals` + `saved_meal_items`

Un "grupo de alimentos" / "comida guardada" es una plantilla reutilizable de comida: una cabecera `saved_meals` (`id, name, coach_id, org_id`) con N filas hijas `saved_meal_items` (`id, saved_meal_id, food_id, quantity, unit`). Los `saved_meals` se enganchan luego dentro de las plantillas de plan vía `template_meal_groups` (ver builder), y `saved_meal_items` tiene también `swap_options` que el builder usa para intercambios.

### 6.2.2 Página y scoping

`page.tsx`: `getCoach()`; si no, `redirect('/login')`. Resuelve `getPreferredWorkspaceForRender(coach.id)`; `orgId = workspace.type === 'enterprise_coach' ? workspace.orgId : null`. Carga `getMealGroups(coach.id, orgId)` y renderiza `MealGroupLibraryClient`.

`getMealGroups(coachId, orgId)` (`React.cache`): `SELECT *, items:saved_meal_items(id, quantity, unit, food:foods(*))` con `eq('coach_id', coachId)`, `order('name')`, y filtro de org: `orgId ? eq('org_id', orgId) : is('org_id', null)`. ⇒ Librería **personal del coach** en standalone/team; scopeada a la org en enterprise.

### 6.2.3 Cálculo de totales (cliente)

Tanto `MealGroupLibraryClient.calculateTotals` como `MealGroupModal.totals` computan los macros del grupo en el cliente, sumando por ingrediente:
```
factor = (unit === 'g' || unit === 'ml') ? quantity / 100 : quantity
cal += food.calories * factor ; protein += food.protein_g * factor ; ... (carbs, fats)
```
Es decir: para gramos/ml escala por `qty/100` (porque los macros del food son por 100 g); para unidades multiplica por la cantidad (asume macros "por unidad" en ese modo). **No se persiste el total** — se recalcula siempre desde los items.

### 6.2.4 CRUD — `saveMealGroup` / `deleteMealGroup`

UI: `MealGroupLibraryClient` lista tarjetas (nombre, nº ingredientes, totales redondeados, chips de los primeros 3 ingredientes), con botones Editar/Eliminar y "Nuevo Grupo" que abren `MealGroupModal`. El modal: nombre + lista de ingredientes (agregar vía `FoodSearch`, toggle G/U por ítem, input de cantidad — al cambiar G↔U resetea defaults 100↔1, quitar ítem), totales en vivo, y "Guardar Grupo".

**`saveMealGroup(groupData, coachId)`** (`meal-groups.actions.ts`):
- `groupData = { id?, name, items: [{ food_id, quantity, unit? }] }`. Validación de cliente: nombre no vacío y ≥1 ingrediente (toasts).
- **Editar** (`id` presente): `UPDATE saved_meals SET name` con `eq('id', groupId).eq('coach_id', coachId)`; luego `DELETE FROM saved_meal_items WHERE saved_meal_id = groupId` (borra todos los items y reinserta — estrategia delete-all-reinsert).
- **Crear** (sin `id`): deriva `org_id` del **workspace activo server-side** (`resolvePreferredWorkspace`; `enterprise_coach ⇒ workspace.orgId`, si no `null`) — **nunca del body**. `INSERT saved_meals { name, coach_id, org_id }`, recupera `id`.
- Si hay items: `INSERT saved_meal_items` mapeando `{ saved_meal_id, food_id, quantity, unit: unit||'g' }`.
- Recupera el grupo completo (`*, items:saved_meal_items(id, food_id, quantity, unit, food:foods(*))`) y lo devuelve para refrescar la UI optimista. `revalidatePath('/coach/meal-groups')`.
- Errores ⇒ `{ error: 'Error al guardar el grupo de alimentos.', details }`.

**`deleteMealGroup(groupId, coachId)`**: `DELETE FROM saved_meals WHERE id = groupId AND coach_id = coachId`. Los `saved_meal_items` caen por FK (cascade). `revalidatePath`.

> Invariantes de seguridad: todos los WHERE de escritura están acotados a `coach_id = coachId` además de RLS. El `org_id` en alta se deriva server-side del workspace activo, garantizando aislamiento standalone/team vs enterprise. Al editar, el `DELETE` de items no filtra por coach pero la cabecera ya está validada por `coach_id` (y RLS sobre `saved_meal_items` se ancla por el FK al `saved_meal` del coach).

> Reuso en planes: estos grupos se consumen como bloques (`template_meal_groups → saved_meals → saved_meal_items`) dentro del builder de plantillas — ahí sí impactan macros y se propagan al alumno (ver sección del builder).

---

## 6.3 RECETAS — sistema VIVO (feature L, `nutrition_recipes`)

> Nivel del módulo: **Base** (incluido en el módulo de nutrición, sin add-on; disponible en tier Pro+). La UI lo marca con `TierBadge tier="base"`. Una receta aquí es una **idea inspiracional**: `name` + `ingredients_text` (texto libre) + `instructions` + `image_url` opcional. **NO tiene macros, NO computa adherencia, NO reemplaza nada del plan.** El alumno la ve como inspiración de solo lectura.

### 6.3.1 Modelo de datos

Migración `20260618180005_nutrition_recipes_and_assignments.sql`:

- **`nutrition_recipes`**: `id, coach_id (FK coaches ON DELETE CASCADE), team_id (FK teams ON DELETE CASCADE), name (NOT NULL), ingredients_text, instructions, image_url, created_at, updated_at`. **Constraint XOR**: `CHECK (num_nonnulls(coach_id, team_id) = 1)` — una receta es de un coach **XOR** de un team, nunca ambas ni ninguna (no hay recetas globales de EVA). Trigger `trg_nutrition_recipes_updated` setea `updated_at` en cada UPDATE. Índices por `coach_id` y `team_id`.
- **`nutrition_recipe_assignments`**: `id, recipe_id (FK nutrition_recipes ON DELETE CASCADE), client_id (FK clients ON DELETE CASCADE), assigned_by (uuid, audit), created_at`. **UNIQUE (recipe_id, client_id)** — base de la asignación idempotente. Índices por `client_id` y `recipe_id`.

### 6.3.2 RLS (invariantes de aislamiento)

`nutrition_recipes` (RLS ON, GRANT SELECT/INSERT/UPDATE/DELETE a `authenticated`):
- `nutrition_recipes_coach_all` (ALL): `coach_id = auth.uid()` (USING + WITH CHECK).
- `nutrition_recipes_team_all` (ALL): `team_id IS NOT NULL AND team_id IN (current_user_team_ids())`.
- `nutrition_recipes_client_select` (SELECT): el alumno la ve **solo si existe una asignación** suya (`EXISTS … assignments WHERE recipe_id = … AND client_id = auth.uid()`).

`nutrition_recipe_assignments` (RLS ON):
- `_coach_all`: el coach gestiona asignaciones de **sus** alumnos (`EXISTS clients c WHERE c.id = client_id AND c.coach_id = auth.uid()`).
- `_team_all`: pool del team (`client_id IN current_user_pool_client_ids()`).
- `_client_select`: el alumno lee las suyas (`client_id = auth.uid()`).

### 6.3.3 Capa de servicio — `nutrition-recipes.service.ts`

Recibe el supabase request-scoped del caller (flujo `_data`/`_actions` → service → Supabase). Aplica el scope coach XOR team **explícito** además del RLS.

- `RecipeScope = { coachId, teamId: string|null }`. `scopeColumns(scope)` ⇒ `{ coach_id: scope.coachId, team_id: scope.teamId }` (en team, `coach_id` también se setea como audit del autor).
- `createRecipe(supabase, scope, input)`: `INSERT` con `...scopeColumns(scope)` + `name/ingredients_text/instructions/image_url` (defaults `null`), `select(RECIPE_COLUMNS).single()`.
- `updateRecipe(supabase, scope, recipeId, input)`: arma un patch solo con los campos definidos (si vacío ⇒ "Nada que actualizar"). WHERE acotado por scope: team ⇒ `eq('team_id', scope.teamId)`; standalone ⇒ `eq('coach_id', scope.coachId).is('team_id', null)` (para que un coach de dos teams no edite recetas del otro). `maybeSingle()` ⇒ "Receta no encontrada" si no matcheó.
- `deleteRecipe(supabase, scope, recipeId)`: `DELETE` con el mismo acotado por scope. Las asignaciones caen por FK CASCADE.
- `listCoachRecipes(supabase, scope)`: `SELECT RECIPE_COLUMNS` acotado por scope, `order('created_at', desc)`.
- `assignRecipeToClients(supabase, recipeId, clientIds, assignedBy)`: si `clientIds` vacío ⇒ no-op `{success:true}`. **`upsert`** de filas `{recipe_id, client_id, assigned_by}` con `onConflict: 'recipe_id,client_id', ignoreDuplicates: true` ⇒ **idempotente** (re-asignar no duplica).
- `unassignRecipe(supabase, recipeId, clientId)`: `DELETE` por `(recipe_id, client_id)`.
- `listAssignedRecipesForClient(supabase, clientId)`: lee `nutrition_recipe_assignments` con join `recipe:nutrition_recipes(...)` filtrado por `client_id`, mapea a `RecipeRow[]` (filtra nulls).

`RECIPE_COLUMNS = 'id, coach_id, team_id, name, ingredients_text, instructions, image_url, created_at, updated_at'`.

### 6.3.4 Server actions — `nutrition-plans/_actions/recipes.actions.ts`

`'use server'`: **solo async functions** (schemas Zod inline, no exportados — exportar un valor desde `'use server'` rompe en runtime; ver gotcha del proyecto).

`requireCoachScope()` (helper): `supabase.auth.getUser()`; si no user ⇒ "No autorizado". Resuelve `resolvePreferredWorkspace(supabase, user.id)`; `teamId = workspace.type === 'coach_team' ? workspace.teamId : null`. Devuelve `{ supabase, coachId: user.id, scope }`. **El scope sale de `auth.uid()`, nunca del body.**

Schemas Zod v4 (server):
- `CreateRecipeSchema`: `name` 1–160 (trim), `ingredients_text` ≤8000 nullish, `instructions` ≤8000 nullish, `image_url` URL válida ≤2048 nullish.
- `UpdateRecipeSchema`: `recipeId` guid + los mismos campos opcionales.
- `DeleteRecipeSchema`: `{ recipeId: guid }`.
- `AssignRecipeSchema`: `recipeId` guid + `clientIds` array de guid, min 1 ("Seleccioná al menos un alumno"), max 500.
- `UnassignRecipeSchema`: `{ recipeId, clientId }` ambos guid.

Acciones (todas: `requireCoachScope` → `safeParse` → llaman al service → `revalidatePath('/coach/nutrition-plans')` vía `revalidateCoachRecipePaths`):
- `createRecipeAction(input)` → `createRecipe`.
- `updateRecipeAction(input)` → `updateRecipe` (separa `recipeId` del patch).
- `deleteRecipeAction(input)` → `deleteRecipe`.
- `assignRecipeAction(input)` → `assignRecipeToClients(..., ctx.coachId)` (el `assigned_by` es el coach de sesión).
- `unassignRecipeAction(input)` → `unassignRecipe`.

### 6.3.5 Subida de foto — `recipe-photo.actions.ts` (`uploadRecipePhotoAction`)

Pipeline espejo del de fotos de check-in. Bucket **público** `recipe-media` (food pics = baja sensibilidad).

1. Valida que llegó un `File` no vacío; tamaño ≤ **8 MB** (`MAX_BYTES`); mime en `ALLOWED_MIME` (jpeg/png/webp/heic/heif).
2. `coachUid` desde `getClaims()` (verificación local del JWT, sin `/user`); si no ⇒ "No autorizado".
3. Compresión **best-effort** a WebP con `compressImageToWebp` (1080px); si falla (HEIC/corrupto/OOM) sube el **archivo original** (jamás aborta).
4. **Path = `{coachUid}/{uuid}.{ext}`** — la carpeta raíz es el `auth.uid()` de la sesión, **nunca del body** (scoping de escritura).
5. Sube con `createServiceRoleClient()` (admin) al bucket, `upsert:false`, **`contentType` explícito obligatorio** (sin él un Buffer se guarda como `application/json` y rompe el render).
6. Devuelve `getPublicUrl(path).publicUrl` para guardar en `image_url`.

Migración `20260618190000_recipe_media_bucket.sql`: bucket `recipe-media` público, límite **2 MB** y mimes jpeg/png/webp **a nivel de bucket** (nota: la acción valida 8 MB y acepta HEIC en su capa, pero la policy del bucket es más estricta — 2 MB y sin HEIC; la compresión a WebP normalmente deja el archivo bajo el límite). Policies: INSERT/UPDATE/DELETE solo si `(storage.foldername(name))[1] = auth.uid()::text` (dueño por carpeta); SELECT público.

### 6.3.6 Queries de datos

- Coach: `getCoachRecipes(scope)` → `listCoachRecipes` (lista del scope activo). `getRecipesAssignedToClient(clientId)` → `listAssignedRecipesForClient` (para pintar el estado de toggles al asignar).
- Alumno: `getAssignedRecipesForClient(clientId)` → `listAssignedRecipesForClient`. El `clientId` es el `auth.uid()` del alumno (`clients.id === user.id`); RLS limita a las asignaciones propias.

### 6.3.7 Frontend funcional

Montado como `<RecipeLibrary recipes={recipes} clients={assignClients} />` dentro de `NutritionHub` (`/coach/nutrition-plans`).

**`RecipeLibrary`**: header con `TierBadge base` + `InfoTooltip` + texto "Ideas de recetas… No afectan macros ni adherencia" + `CreateRecipeDialog`. Empty-state si no hay recetas. Grid de tarjetas: imagen (o placeholder `ChefHat`), nombre, preview de `ingredients_text`, y acciones **Compartir** (abre `AssignRecipeModal`), **Editar** (`CreateRecipeDialog` con `recipe`), **Eliminar** (`deleteRecipeAction` con spinner por id).

**`CreateRecipeDialog`**: crea o edita. Campos: nombre (req, ≤160), ingredientes (textarea ≤8000), instrucciones (textarea ≤8000), imagen. La imagen se sube con `uploadRecipePhotoAction` (preview, quitar, spinner "Subiendo…"); alternativa "o pega una URL". Submit ⇒ `createRecipeAction`/`updateRecipeAction` con `useTransition`, toast, cierra. Aclaración persistente en UI: "no afectan macros ni adherencia".

**`AssignRecipeModal`**: muestra la receta seleccionada, buscador de alumnos por nombre, checkboxes multi-select (seleccionar/deseleccionar todos), botón "Compartir (N)" ⇒ `assignRecipeAction({ recipeId, clientIds })`. Toast "Receta compartida con N alumno(s)".

**Alumno — `RecipeIdeasSection`** (`/c/[coach_slug]/nutrition`): sección SEPARADA del plan, solo lectura, sin macros ni "marcar completada". Lista de tarjetas (badge "Idea"); tap abre bottom-sheet con `ingredients_text` + `instructions` + imagen.

---

## 6.4 RECETAS — sistema LEGACY MUERTO (`/coach/recipes`, tablas `recipes`)

> Documentado para que el rediseño NO lo reviva por error. `/coach/recipes/page.tsx` = `redirect('/coach/foods')` ⇒ inalcanzable. La UI `RecipeLibraryClient` (grid con categorías Desayuno/Almuerzo/…, badges Externa/Manual, filtros, link "Ver detalles") y `RecipeModal` (form react-hook-form + Zod con macros, prep_time, categoría, URL de imagen) existen pero no se llegan a renderizar.

Backend legacy `recipes/_actions/recipes.actions.ts`:
- **`saveRecipe(recipeData, coachId)`**: `INSERT`/`UPDATE` en tabla **`recipes`** (campos `name, description, instructions, prep_time_minutes, calories, protein_g, carbs_g, fats_g, category, source_api ('edamam'|'manual'|null), source_api_id, image_url, coach_id`). Maneja ingredientes en `recipe_ingredients` (delete-all + reinsert). **Side-effect notable**: además crea/actualiza un alimento espejo en `foods` con nombre `[Receta] <name>`, `serving_size:100`, copiando los macros — para que la receta sea seleccionable como "alimento" en planes. WHERE de escritura acotado a `coach_id`.
- **`deleteRecipe(recipeId, coachId)`**: `DELETE FROM recipes WHERE id AND coach_id`.
- Detalle: `recipes/[recipeId]/page.tsx` + `recipe-detail.queries.ts` (`getClaims` + `SELECT *, recipe_ingredients(*) FROM recipes`). Esta página de detalle SÍ es alcanzable por URL directa, pero los enlaces que llevan a ella (`RecipeLibraryClient`) nunca se renderizan.

Diferencias clave legacy vs vivo:
- Legacy: receta **CON macros** + ingredientes estructurados + espejo en `foods` (sí podía impactar planes vía el food espejo) + soporte Edamam (`source_api`). Vivo: receta **SIN macros**, ingredientes como texto libre, scope coach XOR team, asignación directa por alumno, nivel Base.
- Tablas distintas (`recipes`/`recipe_ingredients` vs `nutrition_recipes`/`nutrition_recipe_assignments`).

---

## 6.5 Resumen de invariantes de seguridad de datos (los 3 catálogos)

1. **Scope server-side, nunca del body**: `org_id` (foods customs vía workspace, meal-groups vía `resolvePreferredWorkspace`) y `team_id`/`coach_id` (recetas vivas vía `requireCoachScope`/`getUser`) se derivan de `auth.uid()`/JWT. La foto de receta usa `coachUid` de la sesión como carpeta de escritura.
2. **WHERE de escritura siempre acotado** a `coach_id`/scope además del RLS (defensa en profundidad). Recetas vivas: el service repite el filtro coach XOR team incluso bajo RLS, para coaches en múltiples teams.
3. **Macros de `foods` son por 100 g**; todos los cálculos (meal-groups totals, builder) escalan por `qty/100` para g/ml y por `qty` para unidades. Persistencia entera (Math.round) en `saveCustomFood`.
4. **`nutrition_recipes` XOR**: `CHECK (num_nonnulls(coach_id, team_id) = 1)` — sin recetas globales ni huérfanas.
5. **Asignación de receta idempotente**: `UNIQUE(recipe_id, client_id)` + `upsert ignoreDuplicates`.
6. **Cascades**: borrar grupo ⇒ items caen (FK); borrar receta ⇒ asignaciones caen (FK CASCADE); borrar coach/team/cliente ⇒ recetas/asignaciones caen.
7. **Foto**: bucket público pero escritura solo en la carpeta `auth.uid()`; `contentType` explícito obligatorio; compresión best-effort que nunca aborta el alta.
8. **Validación dual** (cliente + server): Zod server-side en `saveCustomFood` (`CustomFoodSchema`) y en las acciones de recetas vivas; meal-groups valida en cliente y confía en RLS en server.
