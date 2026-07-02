# 5. Backend: persistencia, cola offline y adherencia

Esta es la seccion mas tecnica de la auditoria. Cubre, una por una, **todas las server actions** del plan alimenticio del alumno; el motor de **adherencia** (`computeNutritionAdherence`); la **cola offline** completa (encolado, persistencia, replay, idempotencia, conflictos); y el **modelo de tablas** que toca el alumno con sus invariantes.

Patron transversal (vale para casi todo lo de abajo, no se repite en cada accion salvo desviacion):

- Archivo `'use server'` → **solo async functions exportadas** (regla de CLAUDE.md). En `habits.actions.ts` hay un `export type { UpsertHabitsInput } from '@eva/schemas'` (re-export CON `from`, forma segura segun el gotcha de Turbopack).
- **Identidad por sesion, nunca del body.** Todas resuelven el usuario via `supabase.auth.getUser()` (la mayoria) o `supabase.auth.getClaims()` (intake helper y notes), y comparan contra el `clientId`/`client_id`. El `clientId` que viaja en el payload se usa solo para **filtrar/insertar explicitamente**, jamas como fuente de autorizacion — la autoridad es `auth.uid()` + RLS client-scoped.
- **Validacion Zod v4** server-side antes de tocar DB (schemas locales por archivo, o `@eva/schemas` para habitos).
- **`revalidatePath`** al exito: casi siempre `'/c/${coachSlug}/nutrition'`, y cuando el dato alimenta tiras/anillos del home tambien `'/c/${coachSlug}/dashboard'`.
- Cliente Supabase = `createClient()` de `@/lib/supabase/server` (cookies de sesion, **corre como el usuario**, RLS activa). Ningun action del alumno usa service-role.

---

## 5.1 `nutrition.actions.ts` — el nucleo del registro del plan

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_actions/nutrition.actions.ts`. Es el corazon: marca de comida, porcion parcial, satisfaccion, swap de alimento, preferencias y lecturas de dia.

### Helper compartido: `getOrCreateDailyNutritionLogId(supabase, clientId, planId, targetDate)`

Privado (no exportado). Garantiza que exista la fila "cabecera del dia" en `daily_nutrition_logs` antes de insertar logs de comida.

- Busca por `(client_id, plan_id, log_date)` con `.maybeSingle()`. Si existe, devuelve su `id`.
- Si no, lee del `nutrition_plans` los targets vigentes (`name, daily_calories, protein_g, carbs_g, fats_g`) y hace **`upsert` idempotente** sobre `daily_nutrition_logs` con `onConflict: 'client_id,plan_id,log_date'`, **snapshoteando** esos targets en columnas `*_at_log` (`plan_name_at_log`, `target_calories_at_log`, `target_protein_at_log`, `target_carbs_at_log`, `target_fats_at_log`).
- **Por que upsert y no insert:** dos toggles casi simultaneos en un dia nuevo leen ambos `null`, ambos insertan; sin `onConflict` el segundo recibe `23505` (viola el UNIQUE `client_id,plan_id,log_date`) y devolveria `null`. El upsert resuelve a la fila existente. Esta es la invariante anti-doble-toggle.
- Devuelve `string | null` (null = no se pudo preparar el dia → la accion aborta con `success:false`).

> El snapshot de targets `*_at_log` es lo que el motor de adherencia usa como `targetByDate` cuando esta presente; si falta, cae a `liveTarget`. Es la inmutabilidad historica: cambiar el plan despues no reescribe la adherencia ya registrada.

### `toggleMealCompletion(clientId, planId, mealId, isCompleted, existingLogId, coachSlug, targetDate)`

La accion mas usada del modulo (marcar/desmarcar una comida del plan). **Firma posicional** (no recibe objeto Zod — es la unica que valida a mano, no por schema; sus args vienen tipados pero sin `safeParse`).

- **Auth:** `getUser()`; si `!user || user.id !== clientId` → `{ success:false }`.
- Resuelve `dailyLogId`: usa `existingLogId` si vino; si no, llama `getOrCreateDailyNutritionLogId`. Si falla → `{ success:false }`.
- Busca el `nutrition_meal_logs` por `(daily_log_id, meal_id)` con `.maybeSingle()`.
  - **Si existe:** `UPDATE`. Marcar → `{ is_completed: true }`. **Desmarcar → `{ is_completed: false, consumed_quantity: null }`** (resetea la porcion parcial al desmarcar — invariante: una comida no completada no puede tener % consumido residual).
  - **Si no existe:** `INSERT { daily_log_id, meal_id, is_completed }`.
- **Revalidate:** `/c/${coachSlug}/nutrition` **y** `/c/${coachSlug}/dashboard`.
- **Retorna:** `{ success, logId }` — el `logId` (daily_log_id) se devuelve al cliente para que reuse el log del dia en llamadas siguientes sin re-resolverlo, y para encolar offline con `logId` ya conocido.

> Esta es **la unica accion que se reproduce desde la cola offline** (ver 5.6). Por eso su firma posicional importa: `OfflineNutritionQueueSync` la invoca con los 7 args en orden.

### `updateMealConsumedPortion(raw)` — porcion parcial (Nutricion Pro)

Schema `updateConsumedPortionSchema`: `{ clientId, planId, mealId, dailyLogId, coachSlug, targetDate (YYYY-MM-DD regex), consumedPct }`. `consumedPct` = `null` (modo binario, 100% del plan) **o** numero `0–100` (% de macros del plan).

- `safeParse` → si falla `{ success:false }`.
- **Auth:** `getUser()` vs `clientId`.
- **Verificacion de propiedad del log de dia:** lee `daily_nutrition_logs` por `id = dailyLogId` y exige que `client_id`, `plan_id` y `log_date` coincidan **exactamente** con el payload. Si no, aborta. (Defiende contra un `dailyLogId` de otro alumno/plan/dia.)
- **Precondicion:** lee `nutrition_meal_logs` por `(daily_log_id, meal_id)`; si **no esta `is_completed`** → `{ success:false }`. No se puede ajustar porcion de una comida no marcada.
- `UPDATE nutrition_meal_logs SET consumed_quantity = (consumedPct == null ? null : consumedPct)`.
- Revalidate `nutrition` + `dashboard`.

### `updateMealSatisfaction(raw)` — satisfaccion 1/2/3

Schema `updateSatisfactionSchema`: `{ clientId, dailyLogId, mealId, score }`, con `score ∈ {1, 2, 3, null}` (literales). **No recibe `coachSlug` ni `targetDate`** y **no revalida ninguna ruta** — es un dato secundario que no alimenta tiras/anillos.

- `safeParse`; auth `getUser()` vs `clientId`.
- Precondicion identica: la comida debe existir y estar `is_completed` (lee `nutrition_meal_logs` por `daily_log_id, meal_id`); si no → `{ success:false }`.
- `UPDATE nutrition_meal_logs SET satisfaction_score = score`.
- Retorna `{ success: !error }`. (Notar: NO verifica que `dailyLogId` pertenezca al alumno mas alla de RLS — confia en RLS client-scoped sobre `nutrition_meal_logs` via su `daily_log_id`.)

### `applyMealFoodSwap(raw)` — intercambio de alimento (swap configurado por coach)

Schema `applyFoodSwapSchema`: `{ clientId, planId, dailyLogId? (opcional), mealId, originalFoodId, swappedFoodId, coachSlug, targetDate }`.

- `safeParse`; rechaza `originalFoodId === swappedFoodId` ("El alimento alternativo debe ser distinto.").
- **Auth:** `getUser()` vs `clientId`.
- **Resolucion de `dailyLogId`** (swap puede ocurrir sin haber marcado comida): si vino `dailyLogId`, verifica propiedad (`client_id/plan_id/log_date` deben casar; si no, lo descarta y lo recrea). Si no hay, `getOrCreateDailyNutritionLogId`.
- **Autorizacion del swap contra el plan del coach:** lee `food_items` por `(meal_id, food_id = originalFoodId)`; si no existe → "El alimento original no pertenece a esta comida". Luego comprueba que `swappedFoodId` este en `food_items.swap_options` (JSON allowlist del coach); si no → **"Swap no permitido por tu coach"**. El alumno solo puede elegir entre las alternativas que el coach definio.
- **Porcion del swap:** `resolveCoachSwapPortionFromSwapOptions(swap_options, swappedFoodId)` (de `@/lib/nutrition-utils`) saca `{ quantity, unit }` que dejo el coach. Si no hay porcion → "No hay porcion definida... pide a tu coach que la configure." (la porcion la fija el coach, el alumno no la elige).
- **Persistencia:** `upsert` en `nutrition_meal_food_swaps` con `onConflict: 'daily_log_id,meal_id,original_food_id'` (un swap por alimento-original por dia). Campos: `client_id, daily_log_id, meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit, updated_at`.
- Revalidate `nutrition` + `dashboard`. Retorna `{ success, error? }`.

### `fetchLogForDate(userId, planId, date)` — lectura del dia (RPC de re-hidratacion)

No persiste; el cliente la llama tras togglear para re-sincronizar estado optimista.

- Auth `getUser()` vs `userId` (si no, `{ dailyLog:null, mealCompletions:{} }`).
- `SELECT` de `daily_nutrition_logs` por `(client_id, plan_id, log_date)` con **joins anidados**: `nutrition_meal_logs(meal_id, is_completed, consumed_quantity, satisfaction_score)` y `nutrition_meal_food_swaps(meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit)`.
- Devuelve `{ dailyLog, mealCompletions }` donde `mealCompletions` es un mapa `meal_id → is_completed`.

### `toggleClientFoodPreference(raw)` — favorito / dislike

Schema `toggleFoodPrefSchema`: `{ clientId, foodId, preferenceType ∈ {'favorite','dislike'}, clientProfileRevalidateId? }`. Tabla `client_food_preferences` (PK `(client_id, food_id)`).

- Auth `getUser()` vs `clientId`.
- Lee fila existente `(client_id, food_id)`.
- **Safety A2 (invariante critica):** si la fila existente es `'allergy'` o `'intolerance'` (marcadores que pone el **coach**), el toggle del alumno es **no-op** (`{ success:false, active:false }`). Razon: la fila es compartida por PK; si el alumno pudiera pisarla favoriteando un alergeno, el **hard-block del builder del coach** dejaria de dispararse. El alumno nunca puede borrar/sobrescribir una alergia.
- Si existe y es del **mismo** `preferenceType` → `DELETE` (toggle off, `active:false`).
- Si existe y es **distinto** (favorite↔dislike) → `UPDATE preference_type` (`active:true`).
- Si no existe → `INSERT { client_id, food_id, preference_type }` (`active:true`).
- Si vino `clientProfileRevalidateId`, ademas revalida `'/coach/clients/${id}'` (para que el coach vea el cambio).

### `getClientFoodFavoritesForClient(clientId)` — lectura

Auth `getUser()` vs `clientId`; `SELECT food_id FROM client_food_preferences WHERE client_id = … AND preference_type = 'favorite'`. Devuelve `string[]`.

---

## 5.2 `intake.actions.ts` — registro fuera de plan (off-plan intake)

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_actions/intake.actions.ts`. Lo que el alumno comio que **no estaba en el plan**. Delega en `NutritionIntakeService` (`@/services/nutrition-intake.service`).

Identidad: helper `resolveAuthedClientId(supabase)` → `getUser()`, luego verifica que exista fila en `clients` por `id = user.id` y devuelve `clientRow.id` (defensa extra: el uid debe ser un alumno real). En el header dice "via getClaims" pero el codigo real usa `getUser()`.

### `addIntakeEntryAction(raw)`

Schema `addIntakeEntrySchema`:
- `coachSlug` (min 1), `logDate` (YYYY-MM-DD regex), `foodId` (uuid, nullable/opt), `customName` (trim 1–120, nullable/opt), `quantity` (positivo, max 100000), `unit ∈ {'g','ml','un'}`, `source ∈ {'manual','recipe','plan'}` (opt).
- **`.refine`**: debe venir `foodId` **o** `customName` ("Debes indicar un alimento del catalogo o un nombre libre.").

Flujo:
- `safeParse` → error message del primer issue.
- `resolveAuthedClientId`; si null → "No autorizado".
- **Si `foodId`:** valida que el alimento sea **visible para el alumno** (RLS de `foods`): `SELECT id FROM foods WHERE id = foodId`. Si no → "Alimento no encontrado". Evita `food_id` colgante.
- `service.insertIntakeEntry({ clientId, logDate, foodId, customName, quantity, unit, source ?? 'manual' })`. El service inserta en `nutrition_intake_entries` y devuelve la fila con el `food` del catalogo resuelto (`food:foods(...)`).
- Revalidate `nutrition` + `dashboard`.

### `deleteIntakeEntryAction(raw)`

Schema `deleteIntakeEntrySchema`: `{ coachSlug, entryId (uuid) }`.
- `safeParse`; `resolveAuthedClientId`.
- `service.deleteIntakeEntry(clientId, entryId)` → `DELETE FROM nutrition_intake_entries WHERE id = entryId AND client_id = clientId` (doble candado: id + ownership, ademas de RLS).
- Revalidate `nutrition` + `dashboard`.

### Service `NutritionIntakeService` (capa de datos)

- `insertIntakeEntry` → INSERT con `select(INTAKE_SELECT)` (`*, food:foods(id,name,brand,calories,protein_g,carbs_g,fats_g,serving_size,serving_unit,household_grams,household_label,is_liquid)`).
- `listIntakeEntriesForDate(clientId, isoDate)` → entradas del dia ordenadas por `created_at asc`.
- `listRecentIntakeFoods(clientId, limit=10)` → alimentos del catalogo usados recientemente (solo `food_id` no nulo), dedupe por `food_id`, orden por `created_at desc`, lee `limit*4` y corta a `limit` tras dedupe. Para sugerencias "volver a registrar".
- `deleteIntakeEntry` → como arriba.

---

## 5.3 `habits.actions.ts` — habitos diarios (agua/pasos/sueno/ayuno/suplementos/notas)

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_actions/habits.actions.ts`. Schema **importado** de `@eva/schemas` (`UpsertHabitsSchema`), compartido con mobile.

`UpsertHabitsSchema` (`packages/schemas/client.ts`):
- `clientId` (uuid), `logDate` (YYYY-MM-DD regex), `coachSlug` (min 1).
- `waterMl` (int 0–10000, nullable), `steps` (int 0–100000, nullable), `sleepHours` (0–24, nullable), `fastingHours` (int 0–72, nullable), `supplements` (array de strings max 50 c/u, max 20, nullable), `notes` (string max 500, nullable).

### `upsertDailyHabits(raw)`

- `safeParse`; **auth `getUser()` vs `clientId`** ("No autorizado").
- **`upsert` en `daily_habits`** con `onConflict: 'client_id,log_date'` (una fila por alumno por dia). Campos: `client_id, log_date, water_ml, steps, sleep_hours, fasting_hours, supplements (?? null), notes, updated_at`.
- Revalidate **solo `/c/${coachSlug}/nutrition`** (no dashboard).

### `getDailyHabits(clientId, logDate)`

- Auth `getUser()` vs `clientId`.
- `SELECT water_ml, steps, sleep_hours, fasting_hours, supplements, notes FROM daily_habits WHERE client_id = … AND log_date = …` (`.maybeSingle()`). Devuelve la fila o `null`.

---

## 5.4 `shopping.actions.ts` — lista de compras

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_actions/shopping.actions.ts`. Delega en `@/services/nutrition-shopping.service`. Modelo de dos mitades:

1. **Lineas DERIVADAS** (`buildShoppingList`, pura, sin DB): agrega los `food_items` de TODAS las comidas del plan activo por `(alimento, unidad)`, agrupa por `foods.category` en "pasillos". **Nunca se persisten** — la fuente de verdad de las cantidades es el plan.
2. **Estado de check + items manuales**: tabla `shopping_list_items`, que guarda **solo** el estado marcado/manual por alumno+plan, no las cantidades.

`key` de casamiento = `shoppingItemKey(name)` = `name.trim().toLowerCase()`. Asi se casa la linea derivada con el `label` persistido y con items manuales.

### `toggleShoppingItemAction(raw)`

Schema `toggleSchema`: `{ clientId, planId (uuid **nullable**), label (1–200), category (≤120, nullable/opt), isChecked (bool), coachSlug }`.
- Auth `getUser()` vs `clientId`.
- `toggleShoppingItem(supabase, { clientId, planId, label, category, isChecked })`:
  - Busca fila por `(client_id, label, plan_id)` (o `plan_id IS NULL`). **`isChecked` es estado DESEADO, no toggle ciego** → idempotente ante doble click/reintentos.
  - Si existe → `UPDATE is_checked = isChecked`. Si no → `INSERT { client_id, plan_id, label, category, is_checked, is_manual:false }` (materializa on-demand la linea derivada para guardar su check).
- Revalidate `nutrition` (solo si exito).

### `addManualShoppingItemAction(raw)`

Schema `addManualSchema`: `{ clientId, planId (nullable), label (1–200), category (opt), coachSlug }`.
- Auth `getUser()` vs `clientId`.
- `addManualItem`: idempotente por `(client, plan, label, is_manual=true)` — si ya existe devuelve su `id` sin duplicar; si no, `INSERT { …, is_checked:false, is_manual:true }` y devuelve el `id`.
- Revalidate `nutrition`.

### `removeManualShoppingItemAction(raw)`

Schema `removeManualSchema`: `{ clientId, itemId (uuid), coachSlug }`.
- Auth `getUser()` vs `clientId`.
- `removeManualItem`: `DELETE WHERE id = itemId AND client_id = clientId AND is_manual = true`. **Solo borra manuales** — las lineas derivadas no se borran (su existencia depende del plan).
- Revalidate `nutrition`.

`listShoppingState(supabase, clientId, planId)` (lectura, en el service) selecciona `id, client_id, plan_id, label, category, is_checked, is_manual, created_at` filtrado por alumno + plan (o `plan_id IS NULL`), orden `created_at asc`.

---

## 5.5 `nutrition-notes.actions.ts` — comentarios bidireccionales (bitacora)

Archivo: `apps/web/src/app/c/[coach_slug]/nutrition/_actions/nutrition-notes.actions.ts`. Solo expone la accion del **alumno** (`author_role='client'`). Delega en `NutritionNotesService`.

### `addClientMealComment(input)`

Schema `ClientMealCommentSchema`: `{ coachSlug (min 1), mealLogId? (nullish), logDate? (YYYY-MM-DD nullish), body (trim 1–2000) }` con `.refine` "se requiere `mealLogId` o `logDate`".

- `safeParse`.
- **Identidad por `getClaims()`** (no `getUser()`): `clientId = claims.sub`. Si null → "No autorizado".
- `service.addMealComment({ clientId, mealLogId, logDate, body, authorRole:'client' })`:
  - El service vuelve a sacar `author_id` de su propio `getClaims()` (no del input).
  - `INSERT nutrition_meal_comments { client_id, meal_log_id, log_date, body, author_id, author_role:'client' }`, devuelve la fila.
- Revalidate `nutrition`. Retorna `{ ok:true, data }` o `{ ok:false, error }` (forma de resultado distinta al resto: `ok` en vez de `success`).

El service tambien tiene lecturas (`listMealComments` por dia, `listMealCommentsByLog` por log) y la mitad **coach-only** (`upsertPrivateNote`/`listPrivateNotes` sobre `nutrition_private_notes`) que el alumno **nunca** ve ni toca.

---

## 5.6 COLA OFFLINE — el mecanismo completo

Pieza clave del backend del alumno. Dos archivos: `apps/web/src/lib/nutrition-offline-queue.ts` (cola) y `apps/web/src/app/c/[coach_slug]/_components/OfflineNutritionQueueSync.tsx` (drenaje).

### Que se encola (alcance)

**Solo el toggle de completado de comida** (`toggleMealCompletion`). NO se encolan: porcion parcial, satisfaccion, swaps, intake, habitos, lista de compras ni comentarios — esos fallan en seco si no hay red. La cola cubre la unica accion de altisima frecuencia y critica para la racha.

### Donde se guarda

**`localStorage`**, clave `eva_offline_toggle_queue` (`NUTRITION_OFFLINE_TOGGLE_QUEUE_KEY`). **No IndexedDB.** Serializa un `NutritionOfflineToggleItem[]` con JSON. Cada item:

```
{ userId, planId, mealId, completed, logId?, coachSlug, date }
```

(Es exactamente el conjunto de args posicionales de `toggleMealCompletion`, mas `completed` que mapea a `isCompleted` y `date` a `targetDate`.)

API del modulo:
- `readNutritionOfflineToggleQueue()` — parse defensivo (catch → `[]`), SSR-safe (`window === undefined` → `[]`).
- `writeNutritionOfflineToggleQueue(q)` — persiste.
- `enqueueNutritionOfflineToggle(item)` — **dedupe por `(mealId, date)`: si ya hay un item para esa comida-dia lo REEMPLAZA (last-write-wins), si no, lo agrega.** Esta es la idempotencia de encolado: marcar→desmarcar offline deja **una** entrada con el estado final, no dos.
- `isLikelyOfflineError(err)` — `true` si `navigator.onLine === false`, **o** si el mensaje matchea `/failed to fetch|networkerror|network request failed|load failed|fetch/i`. Es el discriminador entre "sin red" (encolar) y "error real" (mostrar error).

### Cuando se encola (deteccion)

En `NutritionShell` el `onToggle` corre `toggleMealCompletion` dentro de un `startToggleTransition` con estado **optimista** (`setOptimisticCompletion`). En el `catch`:
- Si `isLikelyOfflineError(e)` → `enqueueNutritionOfflineToggle({...})`, dispara analytics `nutrition_meal_toggle_queued`, y toast "Sin conexion — se sincronizara automaticamente". **El estado optimista se mantiene** (la UI ya muestra la comida marcada).
- Si NO es offline → `toast.error('Error al registrar comida')` y re-hidrata desde `fetchLogForDate` (revierte el optimismo).

### Como se reproduce al reconectar (drenaje)

`OfflineNutritionQueueSync` se monta en `layout.tsx` de `/c/[coach_slug]` → **drena en cualquier ruta del alumno** (dashboard + nutricion), no solo en la pantalla de nutricion.

- En `useEffect`: corre `flushQueue()` una vez al montar, y registra listener `window.addEventListener('online', flushQueue)` (se dispara al recuperar conexion). Limpia el listener al desmontar.
- `flushQueue()`:
  - **Lock de reentrada** `flushing.current` (ref): si ya esta drenando, sale. Evita carreras entre el flush inicial y el evento `online`.
  - Lee la cola; si vacia, sale.
  - Itera **en orden de insercion** (FIFO del array). Por cada item llama `toggleMealCompletion(userId, planId, mealId, completed, logId, coachSlug, date)`:
    - Si `res.success` → cuenta `flushed++` (se descarta del array).
    - Si no o si throw → se empuja a `remaining[]` (se reintenta en el proximo flush).
  - Reescribe la cola con `remaining` (solo lo fallido sobrevive).
  - Si `flushed > 0` → toast "N accion(es) sincronizada(s)" + `router.refresh()` (re-fetch RSC para reflejar lo persistido).
  - `finally` libera el lock.

### Idempotencia, orden y conflictos

- **Idempotencia de replay:** `toggleMealCompletion` es naturalmente idempotente — escribe estado deseado absoluto (`is_completed: true/false`), no un delta. Reproducir el mismo item dos veces deja el mismo resultado. El `getOrCreateDailyNutritionLogId` con `upsert onConflict` evita duplicar la cabecera del dia.
- **Orden:** FIFO del array; el dedupe por `(mealId,date)` colapsa multiples toggles de la misma comida-dia en el ultimo estado, asi que el orden entre comidas distintas es irrelevante para la correctitud.
- **Conflictos / errores:** no hay merge ni resolucion de conflictos sofisticada — un item que falla simplemente **permanece encolado** y se reintenta. No hay limite de reintentos ni backoff ni TTL: un item con un `planId` ya invalido (p. ej. plan cambiado) podria reintentarse indefinidamente y nunca dar `success` (queda atascado en `remaining`, sin descartarse). **No hay garantia transaccional** entre items: si 3 de 5 pasan y 2 fallan, los 3 quedan persistidos y los 2 reintentan.
- **Persistencia entre sesiones:** al vivir en `localStorage`, la cola sobrevive a recargas y cierres de pestana del mismo dispositivo/navegador (no cross-device).

Tests (`nutrition-offline-queue.test.ts`) cubren: dedupe last-write-wins por `(mealId,date)`, comidas distintas mismo dia se mantienen separadas, deteccion de errores de red tipicos, `navigator.onLine=false` como offline, roundtrip write/read.

---

## 5.7 ADHERENCIA — `computeNutritionAdherence`

Archivo: `packages/nutrition-engine/adherence.ts`. **Motor canonico unico, PURE** (sin Next.js/Supabase/React/RN; no importa date-utils — la convencion dia-de-semana 1=Lun…7=Dom se **inyecta** via `dayOfWeekResolver`/`mealAppliesOn`). Reutilizado por web + mobile. Alimenta tiras (`AdherenceStrip`), anillos (`MacroRingSummary`), banner de racha y recap.

### Entrada (`ComputeNutritionAdherenceInput`)

- `meals: AdherenceMeal[]` — comidas del plan con `food_items` ya normalizados (`normalizeMealForMacros`) y `day_of_week?` (NULL = aplica todos los dias).
- `logsByDate: Map<string, MealLogRow[]>` — logs agrupados por fecha ISO. `MealLogRow = { meal_id, is_completed, consumed_quantity? }`.
- `targetByDate?: Map<string, MacroTarget>` — snapshot de target por fecha (de los `*_at_log`). Si falta una fecha, se usa `liveTarget`.
- `liveTarget: MacroTarget` — target vigente (fallback).
- `range: { startIso, endIso }` — rango inclusivo a evaluar.
- `dayOfWeekResolver(isoYmd) → 1..7`. En web se inyecta con zona Santiago via `nutritionMealAppliesOnIsoYmdInSantiago` (de `@/lib/date-utils`).
- `mealAppliesOn?` — predicado opcional; default: `day_of_week == null` → aplica todos los dias; si no, `day_of_week === dayOfWeekResolver(fecha)`.

### Calculo (por dia)

`enumerateDates` itera el rango anclando a **mediodia UTC** (`T12:00:00Z`) para evitar saltos por DST; guard de rango invertido → solo el primer dia. Por cada fecha:

1. `applicable` = comidas que `appliesOn` ese dia; `applicableMeals = applicable.length`.
2. `logs = logsByDate.get(date) ?? []`; `hasLog = logs.length > 0`.
3. Recorre logs: `completedMealIds` = set de `meal_id` con `is_completed`; `portionPctByMealId` = mapa `meal_id → consumed_quantity` (solo completadas con `consumed_quantity != null`).
4. `mealsDone` = cuantas de las `completedMealIds` estan en el set de **aplicables** ese dia (una comida marcada que ya no aplica al dia no cuenta).
5. `targetMacros = targetByDate?.get(date) ?? liveTarget`.
6. `consumedMacros = calculateConsumedMacrosWithCompletionFallback(applicable, completedMealIds, targetMacros, portionPctByMealId)` — suma macros de las comidas completadas escalando por % parcial (`mealConsumedPortionMultiplier`); **si el plan no tiene macros por alimento** (`hasAnyMealMacroData=false`), cae a fallback proporcional: `target × (suma de multiplicadores de completadas / total comidas)`.
7. `compliancePct DIARIO = applicableMeals > 0 ? mealsDone/applicableMeals × 100 : 0`.

Empuja `AdherenceDay { date, applicableMeals, mealsDone, mealsTotal, compliancePct, consumedMacros, targetMacros, hasLog }`.

### Salida (`summary`) — invariantes

- **`compliancePct` de RANGO = `sum(mealsDone)/sum(applicableMeals) × 100`** — NUNCA el promedio de los % diarios (invariante explicita). Acumula `sumMealsDone`/`sumApplicable` a lo largo del rango.
- `consumedMacros` / `targetMacros` = **suma** de los diarios (todos los macros).
- **`loggingEngagementPct = daysWithLog/rangeDays × 100`** — campo SEPARADO, jamas fusionado dentro de `compliancePct` (engagement de registro ≠ cumplimiento).
- `streak = { current, longest }` (`computeStreak`): un dia "cuenta" si tiene comidas aplicables y `mealsDone >= applicableMeals` (100%). Dias **sin comidas aplicables son neutros** (no rompen ni extienden). `longest` = maxima ventana; `current` = racha que termina en el ultimo dia del rango (cola), contando hacia atras y saltando neutros, cortando al primer dia incumplido.

---

## 5.8 Modelo de tablas que toca el alumno (e invariantes)

Todas son **client-scoped por RLS** (el alumno solo lee/escribe `client_id = auth.uid()`). El alumno **nunca usa service-role**.

| Tabla | Escrita por | Columnas clave | Invariantes |
|---|---|---|---|
| `daily_nutrition_logs` | `getOrCreateDailyNutritionLogId` (upsert) | `client_id, plan_id, log_date`, snapshots `plan_name_at_log`, `target_*_at_log` | UNIQUE `(client_id, plan_id, log_date)` → upsert idempotente; snapshot de targets inmutable (alimenta `targetByDate`) |
| `nutrition_meal_logs` | `toggleMealCompletion`, `updateMealConsumedPortion`, `updateMealSatisfaction` | `daily_log_id, meal_id, is_completed, consumed_quantity, satisfaction_score` | Una fila por `(daily_log_id, meal_id)`; **desmarcar resetea `consumed_quantity = null`**; porcion/satisfaccion exigen `is_completed`; `meal_id → nutrition_meals` es **ON DELETE CASCADE** (borrar una comida del plan borra el historial — ver gotcha de propagacion en CLAUDE.md) |
| `nutrition_meal_food_swaps` | `applyMealFoodSwap` (upsert) | `client_id, daily_log_id, meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit, updated_at` | UNIQUE/onConflict `(daily_log_id, meal_id, original_food_id)`; el `swapped_food_id` debe estar en `food_items.swap_options` del coach; porcion la fija el coach |
| `nutrition_intake_entries` | `addIntakeEntryAction`/`deleteIntakeEntryAction` (service) | `client_id, log_date, food_id?, custom_name?, quantity, unit, source` | `food_id` o `custom_name` (refine); si `food_id` debe ser visible via RLS de `foods`; delete con doble candado `id + client_id` |
| `daily_habits` | `upsertDailyHabits` (upsert) | `client_id, log_date, water_ml, steps, sleep_hours, fasting_hours, supplements (jsonb/array), notes, updated_at` | UNIQUE `(client_id, log_date)` → una fila por dia; todos los valores nullable |
| `shopping_list_items` | `toggle/add/removeManual` (service) | `client_id, plan_id?, label, category?, is_checked, is_manual` | `label` casa por `key` normalizado; `is_manual=false` se materializa on-demand al checkear linea derivada; solo `is_manual=true` se borra; `isChecked` = estado deseado (idempotente); cantidades NO se persisten (derivadas del plan) |
| `client_food_preferences` | `toggleClientFoodPreference` | PK `(client_id, food_id)`, `preference_type ∈ {favorite, dislike, allergy, intolerance}` | **Safety A2**: el alumno NO puede pisar/borrar `allergy`/`intolerance` (los pone el coach; fila compartida por PK) — protege el hard-block del builder |
| `nutrition_meal_comments` | `addClientMealComment` (service) | `client_id, meal_log_id?, log_date?, body, author_id, author_role` | `author_id` siempre de sesion (`getClaims`); ancla a `meal_log_id` o `log_date` (al menos uno); bidireccional coach⇄alumno |

Tabla coach-only que el alumno **no** toca: `nutrition_private_notes` (notas internas del coach; RLS coach-scoped).

### Notas de seguridad / consistencia transversales

- **Identidad:** `getUser()` en `nutrition.actions`, `habits.actions`, `shopping.actions` y el helper `resolveAuthedClientId` de intake; `getClaims()` en `nutrition-notes.actions` y el service de notas. Nunca se toma el id del body como autoridad.
- **Defensa en profundidad:** ademas de RLS, las acciones verifican ownership a mano (`user.id !== clientId`), propiedad del `dailyLogId` (`client_id/plan_id/log_date` deben casar), y allowlists (swap_options, foods visibles). Hay redundancia intencional con RLS.
- **`revalidatePath` selectivo:** acciones que alimentan home (toggle, porcion, swap, intake) revalidan `nutrition` + `dashboard`; las secundarias (satisfaccion no revalida nada; habitos/compras/comentarios solo `nutrition`).
- **Sin race-safety transaccional fina** mas alla de los `upsert onConflict` (daily log, swaps, habitos, daily_habits) y los UPDATE idempotentes por estado-deseado (meal logs, shopping check). No hay locks de fila ni transacciones multi-tabla.
