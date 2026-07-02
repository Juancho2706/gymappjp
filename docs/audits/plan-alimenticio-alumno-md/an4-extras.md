# 4. Habitos, micros, lista de compras, recetas y notas

Estas son las **secciones secundarias** del plan alimenticio del alumno (`/c/[coach_slug]/nutrition`). Son perifericas al nucleo (comidas + anillos de macros + adherencia, que SIEMPRE se muestran) y casi todas estan **gateadas por feature-prefs**: el coach decide su visibilidad por seccion. Esta seccion documenta cada una con enfasis en backend: que datos llegan, como se calculan y como se persiste lo que registra el alumno.

---

## 4.0 Gating transversal por feature-prefs (contexto comun)

Antes de entrar a cada seccion conviene entender el mecanismo que las prende/apaga, porque **todas** pasan por el.

### Master switch de dominio + flags por seccion

En `page.tsx` (server component) se resuelven dos cosas dentro del `Promise.all` de carga:

1. **`domainEnabled`** via `resolveNutritionDomainEnabled({ coachId, clientId, clientTeamId, clientOrgId })`. Si el coach apago TODO el dominio de nutricion, la pagina entera retorna `<NutritionDomainOff coachSlug={coach_slug} />` (no se renderiza ninguna seccion, nunca pantalla en blanco).

2. **`sectionFlags`** via `resolveFeaturePrefs(prefsInput)`. Es un objeto `Record<NutritionSectionKey, boolean>` (`SectionFlags`) con una clave booleana por seccion opcional. El tipo `NutritionSectionKey` viene de `@eva/feature-prefs`. Las claves son:

   ```
   plan, macros, adherence, micros_base, plate, off_plan_log,
   notes, habits, recipes, shopping, micros_advanced, goals_bodycomp
   ```

### Fail-OPEN

El default es `ALL_SECTIONS_VISIBLE` (todo `true`) — definido en `NutritionShell.tsx` y aplicado tambien cuando el call site no pasa flags (call sites legacy, offline/cache). Es decir: **ausencia de flags = todo visible** (comportamiento historico). El gating solo **resta** visibilidad.

### Donde se renderiza cada seccion gateada

- `MicrosPanel` → `{(sectionFlags.micros_base || sectionFlags.micros_advanced) && ...}` (dentro de `NutritionShell`).
- `HabitsTracker` → `{sectionFlags.habits && ...}` (dentro de `NutritionShell`).
- Notas del dia (`NotesThread`) → `{sectionFlags.notes && ...}` (dentro de `NutritionShell`).
- `ShoppingListView` (dentro de un `<details>` colapsable) → `{sectionFlags.shopping && shoppingList && ...}` (dentro de `NutritionShell`).
- `RecipeIdeasSection` → `{sectionFlags.recipes && <RecipeIdeasSection recipes={recipes} />}` (en `page.tsx`, FUERA de `NutritionShell`, como ultima seccion del `<main>`).
- `PushNotificationBanner` → siempre montado al tope del `<main>` en `page.tsx` (NO gateado por feature-prefs; se autorregula por estado del permiso, ver 4.6).

> Gotcha: la mayoria de las secciones pasan props ya calculadas server-side (`dayMicros`, `microTargets`, `nutritionProEnabled`, `shoppingList`, `notes`, `recipes`). `HabitsTracker` es la excepcion: recibe solo `clientId`, `coachSlug`, `logDate`, `isToday` y **se carga a si mismo en cliente** (ver 4.1).

---

## 4.1 Habitos del dia — `HabitsTracker` + `habits.actions`

Componente `'use client'`. Tracker colapsable de habitos opcionales del dia: **agua, pasos, sueno, ayuno intermitente, suplementos**. Es contexto orientativo para el coach (no reemplaza valoracion clinica, dice su `InfoTooltip`).

### Que muestra (funcional)

- **Header colapsable** (rol `button`, `aria-expanded`, abre/cierra con click o Enter/Espacio). Muestra el titulo "Habitos del dia" con un `InfoTooltip`, y cuando hay al menos un campo lleno, un resumen de una linea (`L agua · pasos · h sueno · h ayuno · N supl.`) + un contador `filled/total` (`total = 5`).
- **`filled`** se computa client-side: cuenta cuantos de `[waterMl, steps, sleepHours, fastingHours, hasSupplements]` no son `null` (suplementos cuenta como "lleno" si `supplements.length > 0`).
- **Body desplegable** (animado con framer-motion, bifurca en `useReducedMotion`) con 5 sub-secciones:
  1. **Agua**: chips de opcion fija `WATER_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 2500, 3000]` (ml). Toggle: re-tap del valor activo lo deselecciona (vuelve a `null`).
  2. **Pasos**: input numerico libre (`inputMode="numeric"`, filtra no-digitos). Persiste en `onBlur`. Muestra un badge cualitativo segun umbrales: `>=10000` "Meta!", `>=8000` "Buen dia", `>=5000` "En progreso", else "Poco activo".
  3. **Sueno**: chips `SLEEP_OPTIONS = [5, 5.5, ... 10]` (horas, paso 0.5). Toggle igual que agua.
  4. **Ayuno**: chips `FASTING_OPTIONS = [12, 14, 16, 18, 20, 24]` (horas). Toggle.
  5. **Suplementos**: chips multi-seleccion `SUPPLEMENT_OPTIONS = ['Creatina','Proteina','Omega-3','Vitamina D','Multivit.','Magnesio','Zinc','Cafeina','BCAA']`. Cada uno toggle independiente (arma/desarma un array de strings).
- Si NO es hoy (`!isToday`): todos los controles quedan `disabled` y aparece "Solo se puede editar el dia de hoy".
- Mientras guarda (`isPending` de `useTransition`): indicador "Guardando…".

### Que datos llegan / de donde

- Props desde `NutritionShell`: `clientId={userId}`, `coachSlug`, `logDate={selectedDate}` (la fecha activa del `DayNavigator`), `isToday`. **No** recibe `initialData` desde el server en este call site (el prop existe pero NutritionShell no lo pasa).
- **Auto-carga client-side**: un `useEffect([clientId, logDate])` llama a la server action `getDailyHabits(clientId, logDate)` y rellena todo el estado local (`waterMl`, `steps`, `sleepHours`, `fastingHours`, `supplements`, `stepsInput`, y `data` para conservar `notes`). Es decir, **cada cambio de dia en el navegador dispara una nueva lectura** de los habitos de ese dia.

`getDailyHabits` (en `habits.actions.ts`, `'use server'`):
- `supabase.auth.getUser()` y verifica `user.id === clientId` (si no, retorna `null`).
- `SELECT water_ml, steps, sleep_hours, fasting_hours, supplements, notes FROM daily_habits WHERE client_id = ? AND log_date = ?` con `.maybeSingle()`.

### Como se guarda (persistencia)

Cada interaccion (chip de agua/sueno/ayuno, blur de pasos, toggle de suplemento) llama a `save(patch)`:

- **Guarda solo si `isToday`** (si no, `save` retorna early — no hay escritura para dias historicos).
- Construye un objeto `next` mergeando el patch con el estado actual de los 5 campos + `notes` (preservado de `data?.notes`). Es un **upsert de la fila completa del dia**, no un patch parcial a nivel DB.
- Corre dentro de `startTransition` → llama a la server action `upsertDailyHabits({ clientId, logDate, coachSlug, waterMl, steps, sleepHours, fastingHours, supplements, notes })`.
- Si falla: `toast.error(error ?? 'Error al guardar habitos')`. NO hay rollback optimista del estado local (el estado ya cambio; solo se notifica el error).

`upsertDailyHabits` (server action):
- Valida con **`UpsertHabitsSchema`** (de `@eva/schemas`, Zod). El tipo `UpsertHabitsInput` se re-exporta desde el mismo paquete (re-export CON `from`, forma segura para `'use server'`).
- `getUser()` + chequeo `user.id === clientId` → si no, `{ success: false, error: 'No autorizado' }`.
- **UPSERT sobre `daily_habits`** con `onConflict: 'client_id,log_date'`:
  ```
  { client_id, log_date, water_ml, steps, sleep_hours, fasting_hours,
    supplements: supplements ?? null, notes, updated_at: now() }
  ```
- En exito: `revalidatePath('/c/{coachSlug}/nutrition')` + `{ success: true }`.

### Tabla / modelo de datos

- **`daily_habits`** — una fila por `(client_id, log_date)` (constraint unique implicada por el `onConflict`). Columnas escritas: `water_ml` (int, ml), `steps` (int), `sleep_hours` (numeric, horas), `fasting_hours` (numeric, horas), `supplements` (text[] de nombres curados), `notes` (text, no editable desde esta UI pero preservado), `updated_at`.
- RLS: client-scoped (el alumno solo lee/escribe sus filas; reforzado tambien por el check `user.id === clientId` en ambas actions).

### Notas / cola offline

- **NO hay cola offline para habitos.** El guardado es directo via server action. Si el dispositivo esta offline, el `startTransition` fallara y caera en `toast.error`; el estado local visual queda cambiado pero sin persistir (no se reintenta ni se encola). Es la unica de las acciones de registro del alumno que NO participa del esquema de cola offline (a diferencia de las marcas de comida del nucleo).

---

## 4.2 Micronutrientes — `MicrosPanel`

Componente `'use client'` **presentacional puro** (props in, sin IO). Acordeon colapsable "Micronutrientes" (cerrado por defecto, progressive disclosure). Renderiza barras de rango por nutriente para el **plan del dia** (no lo consumido off-plan, ver matiz abajo).

### Que muestra (funcional)

- Boton header "Micronutrientes" + `InfoTooltip` ("Micros — base. Tu coach puede fijar topes (ej. sodio) y metas (ej. fibra)."), con chevron animado.
- Filas base (siempre): **Sodio** (`intent: 'cap'`, unidad mg) y **Fibra** (`intent: 'aimup'`, unidad g).
- Filas avanzadas (solo si `proEnabled`): **Azucar** (`cap`, g), **Grasa saturada** (`cap`, g), **Grasa insaturada** (`aimup`, g).
- Render por fila segun datos:
  - `value == null && sin bound del coach` → muestra "— {unidad}" + "sin meta definida".
  - `value presente && sin bound` → muestra el numero plano (`roundish`) + "sin meta definida".
  - `tiene bound` → renderiza `<NutrientRangeBar>` con `floor/target/ceiling` del coach e `intent`.
- Si `!proEnabled`: linea promocional "Nutricion Pro desbloquea mas micros (azucar, grasas)."

### Que datos llegan / de donde (BACKEND)

Todas las props se calculan **server-side** en `page.tsx` (via `sections.queries.ts`) y bajan por `NutritionShell`:

- **`dayMicros`** ← `getPlanDayMicros(user.id, plan.id, today)` (React.cache). Da `{ sodiumMg, fiberG, sugarG, saturatedFatG, unsaturatedFatG }`, cada uno `null` si ningun alimento del dia aporta el dato.
  - Lee `nutrition_plans → nutrition_meals (day_of_week) → food_items (quantity, unit) → foods (serving_size, fiber_g, sodium_mg, sugar_g, saturated_fat_g, unsaturated_fat_g)`.
  - Filtra las comidas que **aplican al dia** via `nutritionMealAppliesOnIsoYmdInSantiago({ day_of_week }, isoDate)`.
  - Suma con **`sumMealMicros`** (motor puro de `@eva/nutrition-engine`), escalando por `quantity/serving_size`. Las columnas de macros se pasan en 0 (el motor solo usa `serving_size` + columnas de micros).
  - `anyData` se marca `true` si cualquier `foods` aporta al menos un micro no-null; si no, todos los retornos son `null`.
  - Redondeo: sodio a entero (`Math.round`), el resto a 1 decimal (`round1`).

  > Matiz clave: `MicrosPanel` muestra los micros **DEL PLAN del dia**, no lo efectivamente consumido por el alumno. Es la referencia de cuanto sodio/fibra/etc trae la pauta para esa fecha.

- **`microTargets`** ← `getMicroTargetsForClient(plan.coach_id, user.id)` (React.cache). Da `{ sodium?, fiber?, sugar?, saturatedFat?, unsaturatedFat? }`, cada uno un `MicroTarget = { floor?, target?, ceiling? }`.
  - Usa `NutrientTargetsService.listNutrientTargets(coachId, clientId)`.
  - **Precedencia**: el target especifico del alumno (`client_id === clientId`) gana sobre el default del coach (`client_id == null`).
  - Mapea por `nutrient_key`: `sodium_mg`, `fiber_g`, `sugar_g`, `saturated_fat_g`, `unsaturated_fat_g`. Lee `floor_value`, `target_value`, `ceiling_value`; descarta el target si los tres son null.
  - Si `coachId` es null → retorna `{}`.

- **`proEnabled`** (prop del panel) = `nutritionProEnabled && sectionFlags.micros_advanced`.
  - `nutritionProEnabled` ← `getNutritionProEnabledForClient(plan.id)`: resuelve el modulo **`nutrition_exchanges`** ("Nutricion Pro") por el CONTEXTO DEL RECURSO via `findPlanModuleContext(supabase, planId)` + `hasExchangesModuleForClientContext(...)`. **Fail-closed** (si no hay contexto → `false`). Importante: gobierna los micros avanzados aunque la pauta este en gramos (no depende del modo de la pauta).

### Persistencia

- **Ninguna.** El panel es solo-lectura. El alumno no edita micros ni targets aqui (los targets los define el coach). No hay actions asociadas.

### Tablas implicadas (lectura)

- `nutrition_plans`, `nutrition_meals`, `food_items`, `foods` (columnas de micros).
- **`nutrient_targets`** (via `NutrientTargetsService`) — bounds por coach (default) o por alumno.

---

## 4.3 Lista de compras — `ShoppingListView` + `shopping.actions` + `shopping.queries`

Componente `'use client'`. Lista de compras del alumno **derivada del plan activo**, agrupada por pasillo (categoria de supermercado), con check-off optimista, alta/baja de items manuales, y compartir por WhatsApp / copiar.

> **Invariante central**: la lista solo persiste **estado de check** y **items manuales**. NUNCA persiste cantidades — la fuente de verdad de las cantidades es el plan, y las lineas derivadas se recomputan en cada request.

### Que muestra (funcional)

- Header "Lista de compras" + contador `checkedCount/totalCount` (client-side, considerando el override optimista) + `InfoTooltip`.
- Acciones de compartir:
  - **Compartir por WhatsApp**: abre `https://wa.me/?text=...` con `buildShareText(list)` (texto plano agrupado por pasillo, **solo items pendientes** — los checkeados se omiten).
  - **Copiar**: `navigator.clipboard.writeText(buildShareText(list))` + toast.
  - Ambos `disabled` si la lista esta vacia.
- **Alta manual**: input + boton "+". Submit llama `addManualShoppingItemAction`.
- Listado por pasillo: cada item es un checkbox accesible (`role="checkbox"`, `aria-checked`, target >=44px). Muestra nombre + cantidad agregada (`quantityLabel`, ej "200 g + 1 un") cuando existe. Items checkeados van tachados.
- Items manuales muestran un boton de eliminar (`Trash2`) — solo los manuales (`item.isManual && item.stateId`).
- Empty state: "Tu lista esta vacia. Agrega items o activa un plan de nutricion."

### Derivacion del `clientId` (gotcha)

Las props NO traen el `clientId`, pero las actions lo exigen y lo validan server-side. El componente lo deriva del JWT en cliente: `createClient().auth.getClaims()` → `data.claims.sub` (en un `useEffect`). Hasta tenerlo, los handlers hacen early-return.

### Que datos llegan / de donde (BACKEND)

`list` ← `getShoppingList(user.id)` (`shopping.queries.ts`, React.cache). Retorna `{ planId, aisles[] }`. La construccion fusiona dos mitades:

1. **Lineas DERIVADAS (puras)** — `buildShoppingList(plan)` (en `nutrition-shopping.service.ts`, funcion pura sin DB/Next):
   - Lee el plan activo: `nutrition_plans (is_active=true) → nutrition_meals → food_items (quantity, unit) → foods (id, name, category, serving_unit)`.
   - Agrega los `food_items` de **TODAS** las comidas del plan por alimento, sumando cantidad **por unidad** (distintas unidades del mismo alimento se listan separadas; NO convierte g↔un↔ml).
   - Agrupa por `foods.category` en pasillos; null/vacio → `UNCATEGORIZED_AISLE = 'Otros'`.
   - `key` de cada linea = `shoppingItemKey(name)` = `name.trim().toLowerCase()` (clave estable para casar con el estado).
   - Orden: pasillos alfabeticos ("Otros" al final), lineas por nombre. Cantidades redondeadas a 1 decimal.

2. **Estado persistido** — `listShoppingState(supabase, clientId, planId)`:
   - `SELECT id, client_id, plan_id, label, category, is_checked, is_manual, created_at FROM shopping_list_items WHERE client_id = ?` y `plan_id = ?` (o `IS NULL` si `planId` es null), `ORDER BY created_at ASC`.
   - Se indexa por `shoppingItemKey(row.label)`.

3. **Fusion** (en `getShoppingList`):
   - Cada linea derivada toma `isChecked` y `stateId` de la fila de estado que casa por key (si existe); si no, `isChecked=false`, `stateId=null`, `isManual=false`.
   - Los items con `is_manual=true` que NO casan con una linea derivada se agregan aparte (dedupe por key), con `category` propia (o "Manuales"), `quantities: []`, su `is_checked` y `stateId`. Se fusionan en su pasillo (o crean uno nuevo).

### Como se guarda (persistencia)

Tres server actions en `shopping.actions.ts`. Las tres: validan Zod, hacen `getUser()` + chequeo `user.id === clientId`, delegan al service, y en exito `revalidatePath('/c/{coachSlug}/nutrition')`.

- **Marcar/desmarcar** → `toggleShoppingItemAction({ clientId, planId, label, category, isChecked, coachSlug })` → `toggleShoppingItem(supabase, ...)`:
  - **Materializacion on-demand**: una linea derivada no tiene fila en DB hasta que se marca. Si no existe fila para ese `(client_id, label, plan_id)` → INSERT con `is_manual=false` y el `is_checked` deseado. Si existe → UPDATE de `is_checked`.
  - `isChecked` es el estado **deseado** (no toggle ciego) → idempotente ante doble-click/reintentos.
  - **Lo que persiste = solo el estado de check** (`is_checked`), nunca la cantidad.
  - UI: optimista via `useOptimistic` (`checkedOverrides` Map por key), dentro de `startTransition`; en error, `toast.error`.

- **Agregar manual** → `addManualShoppingItemAction({ clientId, planId, label, category: null, coachSlug })` → `addManualItem(supabase, ...)`:
  - Idempotente por `(client, plan, label, is_manual=true)`: si ya existe un manual con ese label, retorna su id sin duplicar.
  - INSERT `{ client_id, plan_id, label, category, is_checked: false, is_manual: true }`, retorna `id`.
  - UI: estado `addingManual`, limpia el input y toast en exito.

- **Eliminar manual** → `removeManualShoppingItemAction({ clientId, itemId, coachSlug })` → `removeManualItem(supabase, clientId, itemId)`:
  - DELETE acotado a `id = itemId AND client_id = ? AND is_manual = true`. **Solo borra manuales** (las lineas derivadas no se borran: dependen del plan).
  - UI: estado `removingId`.

### Tabla / modelo

- **`shopping_list_items`** — `(id, client_id, plan_id, label, category, is_checked, is_manual, created_at)`.
  - Una fila existe solo cuando hay estado que recordar (un check materializado o un item manual). Las lineas derivadas no-checkeadas NO tienen fila.
  - `plan_id` puede ser `null` (items manuales sin plan activo).
  - RLS: client-scoped (+ chequeo explicito `user.id === clientId` en cada action).

### Cola offline

- **NO usa la cola offline.** El check optimista de `useOptimistic` da feedback inmediato, pero la persistencia es via server action directa. Sin red, la action falla y se revierte al revalidar (el override optimista se descarta al re-render desde server). No hay encolado ni reintento; el banner offline del shell advierte que solo las marcas de COMIDA quedan en cola.

---

## 4.4 Ideas de recetas — `RecipeIdeasSection` + `recipes.queries`

Componente `'use client'` (Feature L). Recetas-idea que el coach asigna como **inspiracion** (solo lectura, SIN macros, SIN "marcar completada"). Visualmente distintas de las comidas del plan (tarjetas tipo dashed + badge "Idea"). Se renderiza FUERA de `NutritionShell`, al final del `<main>`, gateada por `sectionFlags.recipes`.

### Que muestra (funcional)

- Titulo "Ideas de recetas" (icono lampara).
- Empty state: "Tu coach aun no te compartio recetas. Cuando lo haga, apareceran aqui como inspiracion."
- Lista de tarjetas (animadas con stagger): miniatura (`image_url` via `next/image unoptimized`, o icono fallback), nombre, primera linea de `ingredients_text` truncada, badge "Idea".
- Tap en una tarjeta abre un **bottom-sheet** (`role="dialog"`, `aria-modal`, animado, drag handle, overlay clickeable para cerrar) con: imagen (si hay), badge "Idea", nombre, seccion **Ingredientes** (`ingredients_text`, `whitespace-pre-wrap`) y seccion **Preparacion** (`instructions`). Si no hay ninguno de los dos: "Esta receta no tiene detalles adicionales."

### Que datos llegan / de donde (BACKEND)

`recipes` ← `getAssignedRecipesForClient(user.id)` (`recipes.queries.ts`, React.cache) → `listAssignedRecipesForClient(supabase, clientId)` (en `nutrition-recipes.service.ts`):
- `SELECT recipe:nutrition_recipes(<RECIPE_COLUMNS>) FROM nutrition_recipe_assignments WHERE client_id = ? ORDER BY created_at DESC`.
- `RECIPE_COLUMNS = id, coach_id, team_id, name, ingredients_text, instructions, image_url, created_at, updated_at`.
- Mapea el join y filtra `recipe !== null`. RLS limita a las asignaciones del propio `client_id`.

Tipo `RecipeRow`: `{ id, coach_id, team_id, name, ingredients_text, instructions, image_url, created_at, updated_at }`. Una receta es una **idea inspiracional**: nombre + texto de ingredientes + instrucciones (+ imagen opcional). NO tiene macros ni computa adherencia.

### Persistencia (desde el lado alumno)

- **Ninguna.** El alumno no crea, edita, asigna ni "completa" recetas. Toda la escritura es del lado COACH (`createRecipe`, `updateRecipe`, `deleteRecipe`, `assignRecipeToClients`, `unassignRecipe` en el service, con scope coach XOR team). El alumno es read-only.

### Tablas (lectura)

- **`nutrition_recipes`** — catalogo de recetas del coach/team (scope coach XOR team).
- **`nutrition_recipe_assignments`** — `(recipe_id, client_id, assigned_by, created_at)`, una asignacion por par `(recipe_id, client_id)` (upsert idempotente por el coach). FK a `nutrition_recipes` con ON DELETE CASCADE.

---

## 4.5 Notas del dia — `nutrition-notes.actions` + `nutrition-notes.queries` (+ `NotesThread`)

Hilo **bidireccional coach ⇄ alumno** por dia, sobre la bitacora del alumno. Gateado por `sectionFlags.notes`. Se renderiza dentro de `NutritionShell` como seccion "Notas del dia" usando el componente `NotesThread` (con `currentRole="client"`).

### Que muestra (funcional)

- Seccion "Notas del dia" + `InfoTooltip` ("Deja una nota para tu coach sobre la nutricion de hoy. Tu coach tambien puede responderte aqui.").
- `<NotesThread>` recibe:
  - `comments` = `notesComments`: derivado de la prop `notes` (mapea cada `MealCommentRow` a `{ id, author_role: 'coach'|'client', body, created_at }`).
  - `onSubmit` = `handleAddNote` (ver abajo).
  - `currentRole="client"`.
  - `emptyHint="Escribe una nota a tu coach sobre tu dia (antojos, como te sentiste, dudas)."`
- El hilo muestra los comentarios en orden cronologico, diferenciando autor (coach vs alumno) por `author_role`.

### Que datos llegan / de donde (BACKEND)

`notes` ← `getClientMealComments(today)` (`nutrition-notes.queries.ts`, React.cache):
- Deriva el `clientId` de la sesion: `supabase.auth.getClaims()` → `claims.sub` (verificacion local del JWT, sin `/user`). Si no hay → `[]`.
- `NutritionNotesService.listMealComments(clientId, logDate)`:
  - `SELECT * FROM nutrition_meal_comments WHERE client_id = ? AND log_date = ? ORDER BY created_at ASC`.
  - Incluye los comentarios anclados al `log_date` del dia (los de ese dia tienen `log_date` poblado).

> Nota: el query del alumno carga las notas de `today` (el dia actual de la pagina). El `NotesThread` usa esa data inicial; al cambiar de dia en el navegador, las nuevas notas del dia se envian con `logDate: selectedDate` pero la recarga de las notas historicas depende del revalidate/re-render server.

Tipo `MealCommentRow = Database['public']['Tables']['nutrition_meal_comments']['Row']`.

### Como se envia y guarda (persistencia)

UI → `handleAddNote(body)` en `NutritionShell`:
```
const res = await addClientMealComment({ coachSlug, logDate: selectedDate, body })
if (!res.ok) toast.error(res.error)
```

`addClientMealComment` (server action del ALUMNO, `'use server'`):
- Valida con **`ClientMealCommentSchema`** (Zod v4): `coachSlug` (>=1), `mealLogId` (opcional), `logDate` (regex `YYYY-MM-DD`, opcional), `body` (trim, 1..2000). `.refine`: requiere `mealLogId` O `logDate`.
- **`clientId` = uid de la sesion** (`getClaims().claims.sub`), NUNCA del body. Si no hay → `{ ok: false, error: 'No autorizado.' }`.
- Delega a `NutritionNotesService.addMealComment({ clientId, mealLogId, logDate, body, authorRole: 'client' })`:
  - Trim del body (vacio → throw). Requiere `mealLogId` o `logDate`.
  - **`author_id` = uid de la sesion** (re-derivado en el service via `sessionUserId()` → `getClaims().sub`). `author_role = 'client'`.
  - INSERT en `nutrition_meal_comments`: `{ client_id, meal_log_id, log_date, body, author_id, author_role }`, `.select('*').single()`.
- En exito: `revalidatePath('/c/{coachSlug}/nutrition')` + `{ ok: true, data }`. En error: `{ ok: false, error }`.

> Seguridad: el `author_id` SIEMPRE sale de la sesion (doble derivacion: action + service), nunca del body. RLS refuerza que el alumno solo escriba en su propio hilo. El alumno escribe con `author_role='client'`; el coach (otro action no en este scope) escribe `author_role='coach'`. Es el mismo `client_id` el que ancla ambos lados del hilo.

### Tabla / modelo

- **`nutrition_meal_comments`** — `(id, client_id, meal_log_id, log_date, body, author_id, author_role, created_at)`.
  - El comentario se ancla a un **dia** (`log_date`, lo que usa el alumno aqui) o a un **log de comida concreto** (`meal_log_id`, hilo por comida — `listMealCommentsByLog`).
  - RLS: el alumno ve/escribe solo su `client_id`; ambos roles (coach y alumno) participan del mismo hilo.

> Aparte (NO visible para el alumno): `nutrition_private_notes` son notas internas del coach sobre el alumno (`upsertPrivateNote`/`listPrivateNotes`), coach-scoped por RLS. El alumno nunca las ve. No tienen UI en el plan del alumno.

### Cola offline

- **NO usa cola offline.** Envio directo via server action; offline → `toast.error`. Las notas no se encolan.

---

## 4.6 Prompt de notificaciones push — `PushNotificationBanner`

Componente `'use client'`. Banner que invita a "Activa recordatorios de comidas". Montado SIEMPRE al tope del `<main>` en `page.tsx` (NO gateado por feature-prefs), pero **se auto-oculta** segun el estado del permiso de notificaciones.

### Cuando aparece (logica de visibilidad)

Retorna `null` (no renderiza) si:
- `!isPushSupported()` — falta `Notification`, `serviceWorker` o `PushManager` en el navegador (ej. iOS sin PWA instalada, navegadores sin soporte).
- `permission === null` — aun no se determino el estado (durante el primer render antes del `useEffect`).
- `permission === 'granted'` — ya activado.
- `permission === 'denied'` — el usuario ya rechazo a nivel navegador.
- `dismissed` — el alumno pulso "No, gracias" (persistido en `localStorage` key `eva:push-dismissed = 'true'`).

Es decir, **solo aparece** cuando: push soportado + permiso aun en `'default'` + no descartado localmente.

### Que muestra / acciones

- Icono campana + texto "Activa recordatorios de comidas".
- Boton **"No, gracias"** → `handleDismiss`: setea `localStorage['eva:push-dismissed'] = 'true'` y oculta (no vuelve a aparecer en ese dispositivo).
- Boton **"Activar"** (muestra "Activando…" mientras `loading`) → `handleActivate`.

### Flujo de activacion (BACKEND de la suscripcion)

`handleActivate`:
1. `Notification.requestPermission()`. Si el resultado no es `'granted'` → early-return (actualiza `permission`).
2. Lee `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` (build-time inlined). Si falta → warn + return.
3. `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) })`.
4. Toma `subscription.toJSON()` y hace **`POST /api/push/subscribe`** con `{ endpoint, keys: { p256dh, auth } }`.
5. Errores capturados a `console.error`; `finally` apaga `loading`.

### Persistencia

- **Cliente**: `localStorage['eva:push-dismissed']` para recordar el descarte (por dispositivo/navegador).
- **Servidor**: el endpoint `/api/push/subscribe` persiste la suscripcion (endpoint + claves p256dh/auth) en la tabla **`push_subscriptions`** (Web Push API; `web-push` + VAPID, `src/lib/push.ts`). Desde ahi el backend puede enviar recordatorios de comidas.

### Cola offline

- No aplica (requiere red para `Notification.requestPermission` flow util y para el POST; si el POST falla, solo se loguea — no se reintenta).

---

## Resumen backend por seccion (tabla)

| Seccion | Componente | Origen de datos (server) | Escritura del alumno | Tabla(s) | Cola offline |
|---|---|---|---|---|---|
| Habitos | `HabitsTracker` | `getDailyHabits` (auto-carga client) | `upsertDailyHabits` (upsert dia completo, solo hoy) | `daily_habits` | No |
| Micros | `MicrosPanel` | `getPlanDayMicros` + `getMicroTargetsForClient` + `getNutritionProEnabledForClient` | Ninguna (solo lectura) | `nutrition_plans/meals/food_items/foods`, `nutrient_targets` | No |
| Lista compras | `ShoppingListView` | `getShoppingList` (derivado puro + estado) | toggle/add/remove (solo check + manuales) | `shopping_list_items` | No |
| Recetas | `RecipeIdeasSection` | `getAssignedRecipesForClient` | Ninguna (solo lectura) | `nutrition_recipes`, `nutrition_recipe_assignments` | No |
| Notas | `NotesThread` | `getClientMealComments(today)` | `addClientMealComment` (author de sesion) | `nutrition_meal_comments` | No |
| Push | `PushNotificationBanner` | estado del navegador | `POST /api/push/subscribe` + localStorage dismiss | `push_subscriptions` | No |

> Conclusion transversal: de todas las secciones secundarias, **ninguna usa la cola offline** — esa pertenece exclusivamente al nucleo (marcas de comida). Toda escritura aqui es via server action / fetch directo, con derivacion del `clientId`/`author_id` desde la sesion (JWT) y validacion Zod server-side, reforzado por RLS client-scoped.
