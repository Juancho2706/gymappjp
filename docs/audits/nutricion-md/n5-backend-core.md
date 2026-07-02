# 5. Backend core: guardado, propagacion, adherencia y cascade-safety

Esta es la seccion mas tecnica del documento. Cubre el motor de datos del menu Nutricion del coach: como se guarda una plantilla, como se guarda un plan de alumno (modo gramos y modo intercambios/Pro), como una plantilla se propaga a los alumnos sin destruir su historial de adherencia, como se calcula la adherencia (motor unico), y los servicios satelite (intake/peso, notas, lista de compras). El enfasis esta en datos: que llega, que se valida, que se persiste, en que tabla, con que invariante de seguridad de datos.

Mapa de archivos de esta seccion:

- `apps/web/src/services/nutrition.service.ts` — clase `NutritionService` (plantillas + propagacion).
- `apps/web/src/services/nutrition-propagation.reconcile.ts` — funcion PURA `reconcileMeals` (diff log-aware).
- `supabase/migrations/20260619140000_nutrition_propagation_rpc.sql` — RPC `apply_nutrition_template_to_client` (aplica el diff ATOMICO por alumno).
- `packages/nutrition-engine/adherence.ts` — `computeNutritionAdherence` (motor canonico de adherencia).
- `packages/nutrition-engine/macros.ts` — calculo de macros por item (dependencia del motor de adherencia).
- `apps/web/src/services/nutrition-intake.service.ts` — registro fuera de plan del alumno.
- `apps/web/src/services/nutrition-notes.service.ts` — comentarios bidireccionales + notas privadas del coach.
- `apps/web/src/services/nutrition-shopping.service.ts` — lista de compras (pura + estado de check).
- `apps/web/src/infrastructure/db/nutrition.repository.ts` — lecturas planas (repository layer).
- `apps/web/src/app/coach/nutrition-plans/_actions/nutrition-coach.actions.ts` — server actions que orquestan todo lo anterior.

---

## 5.1 Vocabulario de tablas (lo que toca este menu)

| Tabla | Rol |
|---|---|
| `nutrition_plan_templates` | plantilla reutilizable del coach (no pertenece a un alumno). Macros objetivo + instrucciones + `goal_type`/`tags`/`is_favorite`. |
| `template_meals` | comidas de una plantilla (`template_id`, `name`, `description`, `order_index`, `day_of_week`). |
| `template_meal_groups` | une `template_meals` con `saved_meals` (capa intermedia heredada). |
| `saved_meals` / `saved_meal_items` | "comida guardada" interna que materializa los alimentos de una comida de plantilla. Cada comida de plantilla crea un `saved_meals` con nombre `Internal_<comida>_<timestamp>` y sus `saved_meal_items`. |
| `nutrition_plans` | plan concreto de un alumno (`client_id`, `coach_id`, `org_id`, `template_id`, `is_active`, `is_custom`, `plan_mode`, `last_edited_by_coach_id`). |
| `nutrition_meals` | comidas de un plan de alumno (`plan_id`, `name`, `description`, `order_index`, `day_of_week`, `day_variant_id`). |
| `food_items` | alimentos de una comida de plan (`meal_id`, `food_id`, `quantity`, `unit`, `swap_options` jsonb). |
| `nutrition_meal_logs` | adherencia del alumno: marca comida cumplida (`meal_id`, `is_completed`, `consumed_quantity`). **`meal_id -> nutrition_meals(id)` ON DELETE CASCADE**. |
| `nutrition_plan_history` | snapshots del plan de alumno antes de cada guardado (rollback). |
| `nutrition_plan_cycles` | ciclos de nutricion (bloques con fecha, p. ej. A/B) por alumno. |
| `foods` | catalogo de alimentos (globales con `coach_id` NULL + custom del coach). |
| `client_intake` | datos del alumno: `weight_kg`, `height_cm` (alimentan body-composition y objetivos). |
| `nutrition_intake_entries` | registro de comidas fuera de plan del alumno (off-plan). |
| `nutrition_meal_comments` | hilo bidireccional coach <-> alumno por dia/comida. |
| `nutrition_private_notes` | notas internas del coach sobre el alumno (el alumno nunca las ve). |
| `shopping_list_items` | estado de check / items manuales de la lista de compras (NO guarda cantidades). |
| `client_food_preferences` | favoritos + restricciones (dislike/allergy/intolerance) del alumno. |

> Invariante de scope transversal: cada query lleva `org_id` aplicado explicitamente via `applyOrgScope` (NULL = standalone; valor = enterprise). En modo team (pool plano) el gate cambia a `team_id` con `org_id IS NULL`. Esto se repite en CADA accion y en CADA service helper — nunca se confia en `org_id` del body.

---

## 5.2 `nutrition.service.ts` — funciones de aplicacion

Clase `NutritionService` construida con el cliente Supabase de la sesion (`new NutritionService(supabase)`). **Corre como el usuario (RLS-scoped), NO service-role** — el aislamiento por coach/org lo sigue imponiendo la policy de RLS. Las acciones de `nutrition-coach.actions.ts` la instancian tras validar la sesion.

Helpers internos:

- `applyOrgScope(query, orgId)` — `orgId ? query.eq('org_id', orgId) : query.is('org_id', null)`. Aplicado en todas las queries de plantilla/plan.
- `getTemplateMealItems(templateMeal)` — aplana la cadena `template_meal_groups -> saved_meals -> saved_meal_items` a una lista plana de `{ food_id, quantity, unit, swap_options }`. Esta es la forma real de leer los alimentos de una comida de plantilla.
- `foodRowsFor(mealId, items)` / `opFoodItemsFor(templateMeal)` — mapean los items de plantilla a filas `food_items` (con `meal_id`) o a payload para el RPC (sin `meal_id`; el RPC asigna el id).
- `insertMealsForPlan(planId, templateMeals)` — inserta comidas de un plan BATCHEADO: 1 INSERT para todas las `nutrition_meals` + 1 INSERT para todos los `food_items`, mapeando food_items->meal por `order_index` (unico dentro de un plan). Evita el N+1 (2 queries por comida).
- `assertTemplateMealsAreComplete(templateMeals)` — **guard de integridad**: lanza si alguna comida de la plantilla tiene 0 alimentos (`La plantilla tiene comidas sin alimentos: ...`). Se invoca antes de propagar y antes de duplicar (no se propagan comidas vacias en modo gramos).

### 5.2.1 `createOrUpdateTemplateFromJson(templateId, templateData, meals): Promise<string>`

Crea o actualiza una plantilla desde un payload JSON tipado (NO FormData indexado — elimina la perdida silenciosa de comidas del esquema legacy).

Recibe:
- `templateData`: `{ name, daily_calories, protein_g, carbs_g, fats_g, instructions, coach_id, org_id?, goal_type?, tags?, is_favorite? }`.
- `meals`: `MealInput[]` = `{ name, notes?, order_index, day_of_week?, foodItems: [{food_id, quantity, unit, swap_options?}] }`.

Persiste (estrategia delete-and-reinsert de comidas):
1. Si `templateId` existe: `UPDATE nutrition_plan_templates` filtrado por `id` + `coach_id` + org-scope; luego `DELETE FROM template_meals WHERE template_id = ...` (borra TODAS las comidas de la plantilla y sus cadenas hijas via cascade). Si no existe: `INSERT` y captura el `id` nuevo.
2. Ordena `meals` por `order_index` y, por cada comida: `INSERT template_meals` (con `name`, `description = notes ?? ''`, `order_index`, `day_of_week`). Si tiene `foodItems`: `INSERT saved_meals` (nombre `Internal_<name>_<Date.now()>`), `INSERT saved_meal_items[]`, y `INSERT template_meal_groups` que une `template_meal_id` con `saved_meal_id`.
3. Devuelve `currentTemplateId`.

Invariante: las plantillas son delete-and-reinsert (no hay logs colgando de `template_meals`, asi que borrarlas y recrearlas es seguro). El historial de adherencia NO vive en plantillas — vive en `nutrition_meals`/`nutrition_meal_logs` del plan del alumno; por eso la plantilla puede recrearse libremente y la cascade-safety solo aplica a la PROPAGACION (5.3).

### 5.2.2 `propagateTemplateChanges(...)` — ver 5.3 (es el corazon de la cascade-safety)

### 5.2.3 `duplicateTemplate(templateId, coachId, orgId)`

Lee la plantilla completa (con la cadena `template_meals -> template_meal_groups -> saved_meals -> saved_meal_items`), corre `assertTemplateMealsAreComplete`, e inserta una plantilla nueva con nombre `<name> (Copia)`, recreando comidas + `saved_meals`/`saved_meal_items`/`template_meal_groups`. No toca planes de alumnos.

---

## 5.3 PROPAGACION plantilla -> alumno (el nucleo de cascade-safety)

Esta es la pieza mas delicada del menu. Cuando el coach guarda una plantilla con clientes seleccionados, o asigna una plantilla a alumnos, sus cambios deben llegar a los planes activos de esos alumnos **sin borrar el historial de adherencia** (`nutrition_meal_logs`).

### 5.3.1 El peligro (por que existe la invariante)

`nutrition_meal_logs.meal_id -> nutrition_meals(id)` es **ON DELETE CASCADE**. Borrar una comida (`nutrition_meals`) borra automaticamente todos sus logs de adherencia. Si la propagacion regenerara el plan desde cero (delete-all + reinsert), perderia toda la bitacora del alumno cada vez que el coach edita la plantilla. La propagacion NO puede hacer eso.

### 5.3.2 Algoritmo de `propagateTemplateChanges(templateId, coachId, selectedClientsStr, orgId)`

1. Parsea `selectedClientsStr` (JSON) a `selectedClients[]`.
2. Calcula el universo de alumnos a tocar: union de `selectedClients` + alumnos que YA tienen un plan SYNCED de esta plantilla (`nutrition_plans` con `template_id` = el de la plantilla, `is_active=true`, `is_custom=false`, org-scoped). Esto garantiza que editar la plantilla re-propaga a TODOS los que ya la tenian, no solo a los recien seleccionados. Si el set queda vacio, retorna.
3. Lee la plantilla completa (con su cadena de comidas/items) y corre `assertTemplateMealsAreComplete` (no propaga comidas vacias).
4. **Guard anti-IDOR de alumnos**: consulta `clients` por `coach_id` + `in(allClientIds)` + org-scope; si la cantidad de alumnos permitidos no coincide con la pedida, lanza `Uno o mas alumnos no pertenecen al workspace activo.`. Asi un `client_id` ajeno en el payload no puede recibir el plan.
5. Pre-fetch BATCHEADO de los planes SYNCED existentes de TODOS los alumnos (1 query en vez de 1 por alumno) -> `existingPlanByClient: Map<clientId, planId>`. RLS-scoped.
6. Ordena las comidas de la plantilla por `order_index` y arma `templateByIndex: Map<order_index, comida>` (la plantilla es la misma para todos -> se calcula 1 vez). Arma `planFields` (name + macros + instructions).
7. Para cada alumno decide modo:
   - **Sin plan SYNCED previo (cliente nuevo para la plantilla):** modo `create`. No hay logs historicos -> un `plan_id` fresco es seguro. El op lleva `meals_insert` = todas las comidas de la plantilla.
   - **Con plan SYNCED previo (mismo `template_id`):** modo `update` IN-PLACE (mismo `plan_id`) -> preserva los logs que apuntan a ese plan. Aca entra la reconciliacion (5.3.3).
8. Cada op se aplica ATOMICAMENTE via RPC `apply_nutrition_template_to_client(p_op, p_coach)` (5.4). Si un alumno falla, su plan NO queda a medias (rollback del RPC) y NO aborta a los demas: se acumula en `failures[]` y, al final, si hay fallas, lanza un error con el detalle (`Propagacion incompleta: N de M alumno(s) fallaron. Motivo(s): ...`). Re-correr es idempotente por `order_index`.

> Decision E1 (preservacion de plan_id): para alumnos que YA tenian un plan SYNCED de esta plantilla, el plan se actualiza IN-PLACE (mismo `plan_id`). Esto preserva los logs historicos que apuntan a ese `plan_id`. Solo se crea un `plan_id` nuevo para alumnos que reciben la plantilla por primera vez.

### 5.3.3 Reconciliacion log-aware (modo update): `reconcileMeals`

Antes de llamar al RPC en modo update, el service:

1. Lee las comidas existentes del plan del alumno (`nutrition_meals` por `plan_id`, ordenadas por `order_index`).
2. Calcula los `removalCandidates`: comidas existentes cuyo `order_index` ya NO esta en la plantilla nueva.
3. **Consulta `nutrition_meal_logs` por esos `removalCandidates`** para saber cuales tienen historial -> `loggedMealIds: Set`.
4. Llama a la funcion PURA `reconcileMeals(existingMeals, templateMeals, loggedMealIds)`.

`reconcileMeals` (`nutrition-propagation.reconcile.ts`) — funcion PURA, sin DB, unit-tested. Match por `order_index`. Devuelve `{ toDelete, preservedWithLogs, toUpdate, toInsert }`:

- Para cada comida existente:
  - si su `order_index` sigue en la plantilla -> NO se borra (ira en `toUpdate`, conserva el `id`).
  - si su `order_index` ya NO esta en la plantilla (huerfana):
    - si tiene logs (`loggedMealIds.has(id)`) -> `preservedWithLogs` (se **conserva**, NO se borra: protege el historial).
    - si NO tiene logs -> `toDelete` (seguro borrarla).
- Para cada comida de la plantilla:
  - si existe una comida con ese `order_index` -> `toUpdate` (UPDATE in-place con el `id` existente -> los logs sobreviven).
  - si no existe -> `toInsert`.

Esta es la INVARIANTE CRITICA: una comida con logs NUNCA se borra durante la propagacion. Las que se borran son solo las huerfanas sin historial.

**Limitacion conocida (decision de producto pendiente):** el match es por `order_index`. Si el coach REORDENA comidas, una comida con logs en el indice N puede terminar con el contenido de OTRA comida (el UPDATE in-place sobreescribe nombre/items aunque los logs apunten al contenido viejo). El reorden no BORRA la comida con logs (eso se garantiza), pero puede barajar su contenido. Resolverlo del todo exige una clave estable (`template_meal_id` en `nutrition_meals`) — fuera de alcance. Ver el test "reorden: comida con logs no se borra". (Nota: el modo intercambios/Pro del plan custom SI resuelve esto matcheando por ID de comida — ver 5.6.3.)

El op de update lleva: `meals_delete` = `recon.toDelete`, `meals_update` = `recon.toUpdate` (cada uno con `food_items` recalculados desde la plantilla por su `order_index`), `meals_insert` = `recon.toInsert` (idem).

---

## 5.4 RPC de propagacion: `apply_nutrition_template_to_client` (migracion 20260619140000)

Funcion `SECURITY DEFINER`, `SET search_path = ''`, firma `(p_op jsonb, p_coach uuid DEFAULT NULL) RETURNS jsonb`. **Aplica un diff PRECOMPUTADO de forma ATOMICA por alumno** (el cuerpo corre en una sola transaccion). NO recomputa el matching — eso vive en la pure-fn `reconcileMeals`. Es la red de seguridad que faltaba cuando la propagacion eran llamadas PostgREST autocommit (un fallo a mitad dejaba el plan a medias).

### 5.4.1 Resolucion de coach (anti-impersonacion)

```
v_coach := COALESCE(auth.uid(), CASE WHEN auth.role() = 'service_role' THEN p_coach END)
```

- Sesion de coach: gana `auth.uid()` -> `p_coach` se IGNORA (un coach autenticado nunca puede impersonar a otro).
- Cron de ciclos (corre como `service_role`, sin sesion -> `auth.uid()` NULL): se acepta `p_coach`, pero SOLO si el caller es `service_role`.
- Si `v_coach` queda NULL -> excepcion.

### 5.4.2 Guards de ownership (anti-IDOR server-side, defensa en profundidad)

- **Alumno:** debe existir en `clients` con `coach_id = v_coach` y org-scope coincidente (NULL org = standalone). Si no -> excepcion `alumno % no pertenece al coach`.
- **Plan (modo update):** debe existir en `nutrition_plans` con ese `id`, `client_id`, `coach_id` y `is_custom IS NOT TRUE` (los planes custom NO se sobreescriben al propagar). Si no -> excepcion `plan % no pertenece o es custom`.

### 5.4.3 Modo `create`

1. **Invariante "un plan activo por alumno":** `UPDATE nutrition_plans SET is_active=false` para cualquier plan activo previo del alumno (incluido custom o de otra plantilla), org-scoped.
2. `INSERT nutrition_plans` con `template_id`, macros de `plan_fields`, `is_active=true`, `is_custom=false`.
3. Por cada comida en `meals_insert`: `INSERT nutrition_meals` + `INSERT food_items` (desde `food_items` del payload). Devuelve `{ mode:'create', inserted }`.

### 5.4.4 Modo `update` (in-place, preserva `plan_id`)

1. `UPDATE nutrition_plans` (name + macros + instructions) del `plan_id`.
2. **Borrado log-aware RE-GUARDADO en SQL (defensa en profundidad):** borra solo las comidas listadas en `meals_delete` que ademas (a) pertenecen al `plan_id` y (b) **NO tienen filas en `nutrition_meal_logs`** (`AND NOT EXISTS (SELECT 1 FROM nutrition_meal_logs l WHERE l.meal_id = m.id)`). Aunque el payload listara por error una comida con logs en `meals_delete`, el RPC NO la borra. Esto duplica la garantia de la pure-fn a nivel DB, donde DEFINER salta la RLS. Primero `DELETE food_items WHERE meal_id = ANY(...)`, luego `DELETE nutrition_meals`.
3. Por cada comida en `meals_update`: `UPDATE nutrition_meals` (name/description/order_index/day_of_week) por `id` + `plan_id`; **reemplazo PLAN-SCOPED de sus food_items** (`DELETE food_items USING nutrition_meals m WHERE fi.meal_id=m.id AND m.id=v_meal_id AND m.plan_id=v_plan_id` — un id de otro plan no puede nukear sus items, fix P2-3), luego `INSERT food_items` (con `EXISTS` que vuelve a verificar plan_id).
4. Por cada comida en `meals_insert`: `INSERT nutrition_meals` + `INSERT food_items`.
5. Devuelve `{ mode:'update', deleted, updated, inserted }`.

### 5.4.5 Grants

```
REVOKE ALL ON FUNCTION ... FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ... TO authenticated;
```

DEFINER + grant a `authenticated`: el coach lo ejecuta dentro de su sesion; los guards de ownership reemplazan a la RLS (que el DEFINER salta).

---

## 5.5 ADHERENCIA: `computeNutritionAdherence` (motor canonico)

`packages/nutrition-engine/adherence.ts` — **fuente de verdad UNICA de adherencia de nutricion**, reutilizada por web + mobile. PURA: sin Next.js / Supabase / React / RN, y sin importar date-utils (la convencion dia-de-semana 1=Lun..7=Dom se inyecta via `dayOfWeekResolver`). Esto evita el calculo divergente que tenia `dashboard.service` (que calculaba macros mal).

### 5.5.1 Entrada `ComputeNutritionAdherenceInput`

- `meals: AdherenceMeal[]` — comidas del plan con `food_items` ya normalizados via `normalizeMealForMacros` (5.7) + `day_of_week` opcional.
- `logsByDate: Map<isoYmd, MealLogRow[]>` — filas de `nutrition_meal_logs` (`meal_id`, `is_completed`, `consumed_quantity`) agrupadas por fecha ISO.
- `targetByDate?: Map<isoYmd, MacroTarget>` — snapshot de objetivos por fecha (si falta una fecha, se usa `liveTarget`).
- `liveTarget: MacroTarget` — objetivo vigente (fallback).
- `range: { startIso, endIso }` — rango inclusivo a evaluar.
- `dayOfWeekResolver(isoYmd) -> number` — convencion 1=Lun..7=Dom inyectada.
- `mealAppliesOn?` — predicado opcional; default: `day_of_week == null` aplica todos los dias, si no aplica solo cuando `day_of_week === dayOfWeekResolver(date)`.

### 5.5.2 Calculo por dia (`AdherenceDay`)

Para cada fecha del rango (`enumerateDates` ancla a mediodia UTC para evitar saltos por DST):

- `applicable` = comidas que aplican ese dia (filtradas por `appliesOn`).
- `logs` = `logsByDate.get(date)`; `hasLog = logs.length > 0`.
- `completedMealIds` = set de `meal_id` con `is_completed`; `portionPctByMealId` = `consumed_quantity` (% 0-100) de las comidas con ajuste parcial.
- `mealsDone` = comidas APLICABLES ese dia que estan completadas (interseccion de `completedMealIds` con los ids aplicables). Una comida marcada que NO aplica ese dia NO cuenta.
- `targetMacros` = `targetByDate.get(date) ?? liveTarget`.
- `consumedMacros` = `calculateConsumedMacrosWithCompletionFallback(applicable, completedMealIds, targetMacros, portionPctByMealId)` (5.7).
- `compliancePct` DIARIO = `applicableMeals > 0 ? (mealsDone / applicableMeals) * 100 : 0`.

### 5.5.3 Resumen de rango (`summary`)

Invariantes:
- `compliancePct` de RANGO = `sum(mealsDone) / sum(applicableMeals)` — **NUNCA el promedio de los % diarios** (un dia con 1 comida aplicable no pesa igual que uno con 5).
- `consumedMacros` / `targetMacros` del resumen = SUMA de los diarios.
- `loggingEngagementPct` = `daysWithLog / rangeDays * 100` — campo SEPARADO, jamas fusionado dentro de `compliancePct` (registrar != cumplir).
- `streak` via `computeStreak` (5.5.4).

### 5.5.4 `computeStreak(perDay)`

Un dia "cuenta" para la racha si tiene comidas aplicables y TODAS fueron completadas (`mealsDone >= applicableMeals`). Dias sin comidas aplicables son NEUTROS (no rompen ni extienden). Devuelve:
- `longest`: racha maxima en cualquier ventana.
- `current`: racha que termina en el ultimo dia del rango (cuenta desde el final hacia atras, saltando neutros, hasta el primer dia incompleto).

---

## 5.6 Guardado del plan de ALUMNO (custom) — `upsertClientNutritionPlanJson`

Vive en `nutrition-coach.actions.ts` (no en el service); es la otra mitad del guardado, distinta de la propagacion de plantillas. Es la accion del builder en modo plan-de-alumno (`/coach/nutrition-plans/client/[clientId]`). Recibe `(coachId, clientId, data: CoachClientPlanUpsertPayload)` donde el payload trae `{ id?, name, daily_calories, protein_g, carbs_g, fats_g, instructions?, meals, plan_mode? }`.

### 5.6.1 Auth + scope + validacion

1. `requireCoachNutritionScope(coachId)` -> resuelve workspace activo via `resolvePreferredWorkspace`: `coach_standalone` (orgId null, teamId null), `coach_team` (activeTeamId), `enterprise_coach` (orgId).
2. **Gate de modo intercambios:** si `plan_mode === 'exchanges'` y hay `id`, consulta `nutrition_plans.plan_mode` en DB; solo si la DB confirma `'exchanges'` se relaja el validador (`allowEmptyMeals = true`). El `plan_mode` es client-controlled en el payload pero VERIFICADO contra DB — el coach no puede saltarse el validador de gramos mintiendo el modo.
3. Validacion Zod: `ExchangesClientPlanSchema` (permite comidas sin alimentos, porque se prescriben por porciones) si `allowEmptyMeals`, si no `ClientPlanSchema` (modo gramos: comidas deben tener alimentos). Doble validacion (cliente RHF + servidor).
4. **Gate 3-vias de pertenencia del alumno:** team -> `team_id = activeTeamId AND org_id IS NULL`; standalone -> `coach_id = coachId AND org_id IS NULL AND team_id IS NULL`; enterprise -> `coach_id = coachId AND org_id = orgId`. Si no aparece -> `Alumno no encontrado.`.

### 5.6.2 Datos del plan

`planData` = `{ client_id, coach_id, org_id, name, daily_calories, protein_g, carbs_g, fats_g, instructions, is_active:true, is_custom:true, last_edited_by_coach_id: coachId }`. El plan custom siempre `is_custom=true` (no se sobreescribe por propagacion de plantilla — el RPC lo excluye). `last_edited_by_coach_id` da awareness del pool (quien edito ultimo, visible para el resto del team).

### 5.6.3 Update de un plan existente (preserva logs)

Si hay `id`:
1. **Snapshot a history:** `fetchClientPlanSnapshotPayload(supabase, planId, coachId)` y `INSERT nutrition_plan_history` con `snapshot` (jsonb), `label` (fecha-hora), `source='auto_before_save'`. Fallo de history se logea pero no aborta el guardado.
2. `UPDATE nutrition_plans` (org/team-scoped).
3. Lee comidas existentes (`nutrition_meals` por `plan_id`, ordenadas).
4. Reconciliacion segun modo:
   - **Modo gramos (byte-identical, AC1):** match por `order_index`. Borra comidas cuyo `order_index` ya no esta (delete `food_items` + `nutrition_meals`); para cada comida nueva: si existe ese `order_index` -> UPDATE in-place (preserva `id` -> logs sobreviven) + delete/reinsert de sus `food_items`; si no -> INSERT comida + food_items.
   - **Modo intercambios/Pro (R1):** match por **ID de comida**, NUNCA por posicion. Usa `reconcileMealsById` (`services/nutrition-exchanges/meal-reconcile.ts`, pura + unit-tested). Motivo: `meal_exchange_targets` y `nutrition_meals.day_variant_id` estan pegados al ROW ID; el match por posicion barajaba la prescripcion de porciones tras reordenar/borrar (corrupcion silenciosa). El builder envia el `id` de DB de cada comida persistida; `toDelete`/`toUpdate` (UPDATE por ID, los targets/variante/logs viajan con SU comida)/`toInsert`.

> Cascade-safety en el plan custom: igual que la propagacion, el guardado del plan custom solo BORRA comidas que cambiaron de posicion (gramos) o que el coach quito (intercambios). Pero ojo: en modo gramos, borrar una comida por cambio de `order_index` SI cascadea sus logs (no hay chequeo log-aware aca como si lo hay en la propagacion — el plan custom asume que el coach es dueno del plan de SU alumno y edita conscientemente). El modo intercambios mitiga esto matcheando por ID.

### 5.6.4 Creacion de un plan nuevo

Si no hay `id`: `UPDATE nutrition_plans SET is_active=false` para los planes activos previos del alumno (org-scoped), luego `INSERT nutrition_plans` (custom, activo) y por cada comida `INSERT nutrition_meals` + `INSERT food_items`.

### 5.6.5 Revalidacion

`revalidateClientNutritionPaths(coachId, clientId)` -> `revalidatePath('/coach/clients/{clientId}')` + `revalidatePath('/c/{slug}/nutrition')` (resuelve slug del coach). Mas `revalidatePath('/coach/nutrition-plans')`.

### 5.6.6 Acciones hermanas en `nutrition-coach.actions.ts`

- `upsertCoachNutritionTemplate(coachId, data)` — valida con `TemplateUpsertSchema`, llama `createOrUpdateTemplateFromJson` y luego `propagateTemplateChanges` con `propagateClientIds`. Revalida `/coach/nutrition-plans` + `/coach/clients`.
- `assignTemplateToClientIds(coachId, templateId, clientIds)` — solo propagacion (sin re-guardar la plantilla). Atajo `assignTemplateToClients(templateId, coachId, clientIds)` (orden de args historico) y `assignTemplateToClients` delegan aqui.
- `createEmptyClientNutritionPlan(coachId, clientId)` — crea (o reusa, idempotente) un plan draft VACIO activo. Necesario porque el modo Porciones exige un `plan_id` persistido. Un plan con 0 comidas se trata como "sin plan" en el board del coach y en la app del alumno (no le muestra un plan vacio).
- `unassignNutritionPlan(coachId, clientId, planId)` — `UPDATE is_active=false` del plan (no borra -> logs intactos), tras verificar ownership.
- `deleteNutritionTemplate` / `duplicateNutritionTemplate(templateId, coachId)` — borra/duplica plantilla (delega en `NutritionService.duplicateTemplate`).
- `duplicatePlanToClient(coachId, sourcePlanId, targetClientId)` — clona un plan activo (synced o custom) a otro alumno como CUSTOM nuevo; desactiva el plan previo del destino (logs del destino intactos), copia comidas + food_items + swap_options. No toca el origen.
- `restoreClientNutritionPlanFromHistory(coachId, clientId, historyId)` — lee el snapshot de `nutrition_plan_history`, lo valida con `ClientPlanSchema` y reaplica via `upsertClientNutritionPlanJson` (que a su vez vuelve a snapshotear -> rollback de rollback).
- `upsertNutritionPlanCycle(coachId, clientId, data)` — upsert de un ciclo (`nutrition_plan_cycles`): si `is_active`, desactiva los otros ciclos del alumno; persiste `blocks` (jsonb). Valida con `nutritionPlanCycleUpsertSchema`.
- `addCoachCustomFood` / `saveCustomFood` (FormData legacy) / `deleteCoachCustomFood` — CRUD del catalogo `foods` del coach (incluye `serving_unit` g/un/ml, `is_liquid`, medida casera `household_grams`/`household_label`). Valida con `CustomFoodSchema`.
- `getClientFoodFavorites` / `getClientFoodRestrictions` / `setClientFoodRestriction` — favoritos y restricciones (`client_food_preferences`, tipos `favorite`/`dislike`/`allergy`/`intolerance`), upsert por `(client_id, food_id)`; null limpia. `coachOwnsClient` valida pertenencia 3-vias (en team, CUALQUIER coach del pool gestiona a CUALQUIER alumno del pool — espeja la RLS, evita que la alerta de alergia falle OPEN para alumnos de otro coach del pool).

---

## 5.7 Calculo de macros (dependencia del motor de adherencia): `macros.ts`

`packages/nutrition-engine/macros.ts` — PURA, movida VERBATIM desde `lib/nutrition-utils.ts` (motor canonico web+mobile, no cambiar firmas).

- `calculateFoodItemMacros(item)` — los valores en BD son por 100g/ml. Factor segun unidad:
  - `g` / `ml`: proporcion directa -> `factor = quantity / 100`.
  - `un` (contables): usa `serving_size` -> `factor = (quantity * serving_size) / 100`.
  Devuelve calorias/proteina/carbs/grasas redondeados a 1 decimal. (Fix historico: `ml` ya no multiplica por serving_size -> 15 ml de aceite = 15g grasa, no 210g.)
- `sumMealMacros(meal)` — suma los macros de los `food_items` de una comida.
- `normalizeMealForMacros(meal)` — convierte `nutrition_meals` + `food_items` anidados de Supabase al shape de macros (normaliza `swap_options` con `normalizeSwapOptions`, coerciona unidades, infiere `is_liquid` desde `serving_unit==='ml'`). Lo usa el motor de adherencia para alimentar `meals`.
- `calculateConsumedMacros(meals, completedMealIds, portionPctByMealId?)` — suma macros solo de comidas completadas, escalando por `consumed_quantity` (% parcial) si esta presente (ausencia de clave = 100%, modo binario).
- `calculateConsumedMacrosWithCompletionFallback(meals, completedMealIds, goals, portionPctByMealId?)` — si el plan tiene datos de macros por alimento, usa el calculo real; si NO (plan sin alimentos, p. ej. plan por porciones/intercambios), cae a un prorrateo: `goals * (peso de comidas completadas / total de comidas)`. Asi un plan sin gramos sigue dando adherencia razonable.
- Helpers de swap: `swapOptionIsLiquid`, `swapOptionAllowedUnits` (`ml|un` liquido vs `g|un` solido), `coerceSwapOptionUnit`, `resolveCoachSwapPortionFromSwapOptions`, `applyMealFoodSwaps` (aplica los swaps elegidos por el alumno antes de calcular macros).

---

## 5.8 `nutrition-intake.service.ts` — registro fuera de plan (peso/altura via otra tabla)

> Aclaracion: el peso/altura del alumno NO viven aca; viven en `client_intake` (`weight_kg`, `height_cm`), leidos por `getClientNutritionPlanPageAuthData` (`client-plan-page.queries.ts`) en paralelo al alumno, y alimentan body-composition + objetivos. Este servicio es el registro de comidas OFF-PLAN del alumno (`nutrition_intake_entries`).

`NutritionIntakeService` (cliente RLS-scoped). Tabla `nutrition_intake_entries` es client-scoped por RLS (`client_id = auth.uid()`); `clientId` se pasa para filtrar/insertar pero NUNCA es la fuente de autorizacion (eso es sesion + RLS).

- `insertIntakeEntry({ clientId, logDate, foodId?, customName?, quantity, unit, source? })` — `INSERT nutrition_intake_entries`; `source` = `manual` | `recipe` | `plan` (default `manual`); devuelve la entrada con el alimento del catalogo resuelto (`food:foods(...)`).
- `listIntakeEntriesForDate(clientId, isoDate)` — entradas de un dia, orden cronologico.
- `listRecentIntakeFoods(clientId, limit)` — alimentos del catalogo usados recientemente (solo `food_id` no nulo), deduplicados por uso mas reciente, para sugerencias de "volver a registrar".
- `deleteIntakeEntry(clientId, entryId)` — borra (RLS exige propiedad).

---

## 5.9 `nutrition-notes.service.ts` — comentarios + notas privadas

`NutritionNotesService`. Dos features separadas. `author_id`/`coachId` SIEMPRE de la sesion (`getClaims` -> `claims.sub`), nunca del body.

Meal comments (BIDIRECCIONAL coach <-> alumno), tabla `nutrition_meal_comments`:
- `addMealComment({ clientId, mealLogId?, logDate?, body, authorRole })` — valida `body` no vacio y que haya `mealLogId` O `logDate`; `INSERT` con `author_id` de la sesion + `author_role` (`coach`|`client`). Ambos roles leen y escriben.
- `listMealComments(clientId, logDate)` — comentarios de un dia, cronologico.
- `listMealCommentsByLog(clientId, mealLogId)` — hilo de un log de comida concreto.

Private notes (SOLO coach), tabla `nutrition_private_notes` (RLS coach-scoped, el alumno nunca las ve):
- `upsertPrivateNote(coachId, clientId, body)` — no hay UNIQUE(coach,client) -> find-then-update/insert (una por par).
- `listPrivateNotes(clientId)` — notas del coach sobre el alumno.

---

## 5.10 `nutrition-shopping.service.ts` — lista de compras

Dos mitades deliberadamente separadas.

**Mitad PURA (derivada, NUNCA se persiste):** `buildShoppingList(plan)` agrega los `food_items` de TODAS las comidas del plan activo por alimento, sumando `quantity` por unidad (distintas unidades del mismo alimento se listan por separado; no convierte g<->un<->ml), y agrupa por `foods.category` en "pasillos" (null/vacio -> `Otros`, siempre al final; resto alfabetico). La clave estable de una linea es `shoppingItemKey(name)` = nombre trim+lowercase. Devuelve `ShoppingAisle[]`. **Las cantidades nunca se guardan** — la fuente de verdad es el plan; solo el estado de check se persiste.

**Mitad CHECK-STATE (CRUD), tabla `shopping_list_items`** (guarda SOLO check/manual por alumno+plan, no cantidades):
- `listShoppingState(supabase, clientId, planId)` — lee `label`, `category`, `is_checked`, `is_manual` para el alumno+plan (o `plan_id IS NULL`). La capa `_data` casa estas filas con las lineas derivadas via `label`/`key`.
- `toggleShoppingItem(...)` — marca/desmarca una linea. Materializa on-demand: si no existe fila para ese `label`, la crea con `is_manual=false`; si existe, setea `is_checked` al estado DESEADO (idempotente ante doble click).
- `addManualItem(...)` — agrega item manual (`is_manual=true`); idempotente por `(client, plan, label)`.
- `removeManualItem(...)` — borra SOLO filas `is_manual=true` (las derivadas no se borran: su existencia depende del plan).

---

## 5.11 `nutrition.repository.ts` — capa de infraestructura (lecturas planas)

`infrastructure/db/nutrition.repository.ts` — funciones puras de lectura (reciben el cliente Supabase), respetan el data flow `_data -> services/repository -> Supabase`. SELECT de columnas explicitas (no `SELECT *`):

- `findNutritionPlansByCoach(db, coachId)` — planes del coach (`id`, scopes, `template_id`, `template_version_id`, macros, `is_active`, `is_custom`, fechas), orden por `created_at` desc.
- `findNutritionTemplatesByCoach(db, coachId)` — plantillas del coach (incluye `goal_type`, `tags`, `is_favorite`), orden por `updated_at` desc.
- `findNutritionMealsByPlan(db, planId)` — comidas de un plan, orden por `order_index`.
- `findFoods(db, coachId, limit=100)` — catalogo visible al coach: `coach_id IS NULL OR coach_id = coachId` (globales + custom), orden alfabetico, limit.
- `findRecipeById(db, recipeId)` — receta por id (`recipes`).

---

## 5.12 Invariantes de seguridad de datos (resumen para no perder nada)

1. **Cascade-safety (la mas critica):** `nutrition_meal_logs.meal_id -> nutrition_meals` es ON DELETE CASCADE. La PROPAGACION nunca borra una comida con logs (doble guardia: `reconcileMeals` en TS + `NOT EXISTS nutrition_meal_logs` en el RPC SQL). Una comida con historial se CONSERVA aunque salga de la plantilla.
2. **Preservacion de `plan_id` (E1):** alumnos con plan SYNCED previo se actualizan in-place (mismo `plan_id`) -> los logs que apuntan a ese plan sobreviven. Solo alumnos nuevos para la plantilla reciben `plan_id` fresco.
3. **Preservacion de `meal_id`:** match por `order_index` (gramos/propagacion) o por ID (intercambios) -> las comidas que siguen existiendo se UPDATEan in-place, nunca delete+reinsert -> los logs no cascadean.
4. **Atomicidad por alumno:** el RPC corre el diff de cada alumno en una transaccion; un alumno que falla no queda a medias ni aborta a los demas (las fallas se acumulan y se reportan para reintento idempotente).
5. **Anti-IDOR / anti-impersonacion:** ownership de alumno + plan revalidado server-side (en el service Y en el RPC); el coach se resuelve de `auth.uid()` (sesion) y `p_coach` solo lo honra `service_role`. El `plan_mode` y los `client_id` del payload se verifican contra DB, nunca se confian.
6. **Grants compra-only / service-role:** `coaches.enabled_modules` (entitlement del modulo Pro de intercambios) es compra-only (escritura solo service-role, via trigger D1 desde `coach_addons`). El RPC de propagacion es DEFINER con grant a `authenticated` pero con guards de ownership que reemplazan la RLS saltada.
7. **History antes de cada save del plan custom:** `nutrition_plan_history` snapshotea (`auto_before_save`) antes de sobreescribir -> rollback disponible.
8. **Estado de compras desacoplado:** `shopping_list_items` guarda solo check/manual; las cantidades son derivadas puras del plan (jamas persistidas) -> editar el plan recalcula la lista sin migrar datos.
9. **Adherencia = motor unico:** `computeNutritionAdherence` es la unica fuente de verdad (compliance por suma/suma, engagement separado, macros via fallback). `dashboard.service` historicamente calculaba mal -> se converge a este motor.
