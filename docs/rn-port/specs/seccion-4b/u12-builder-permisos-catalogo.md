# 4B-12 — Builder: permisos del alumno + "Guardar en mi catálogo" + "Archivar y reemplazar" (3 sub-deltas)

Archivos RN:
- **EDITAR** `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx` (monolito ~1672 líneas tras
  4B.3/4B.4): (a) sección de permisos en `TargetsStep` (`:593-671`); (b) aviso de mismatch + botón
  "Guardar en mi catálogo" en el bloque custom de `ItemEditor` (`:1116-1139`); (c) rama "Archivar y
  reemplazar" del conflicto de fecha en `ReviewStep` (`:1473-1490`) + `handlePublish`/`handleStartTomorrow`
  (`:304-359`). **UNIDAD SOLITARIA en su archivo** — el monolito lo comparten 4B-10/11/12/13 → secuenciales,
  nunca en la misma wave (INVENTARIO §4). Aterriza DESPUÉS de 4B-10 (F-02, commit `8f8161cb`) y 4B-11
  (porciones, commit `2cdc0c79`): **NO pisar** `SubstitutionsField`/`BuilderItem.substitutions` ni la sección
  de porciones (`PortionsSection`/`PortionsDeriveCard`/`PortionsReviewSection`); son estado y UI hermanos,
  disjuntos de esta unidad.
- **EDITAR** `apps/mobile/lib/nutrition-v2-builder.ts`: agregar la función de creación de alimento coach-scoped
  que devuelve un `BuilderFood` (hoy NO existe — ver sub-delta b) y los dos helpers puros del conflicto
  (`effectiveDateConflicts`, `canProceedToPublishAfterArchive`, espejo de `publish-conflict.ts`).
- **CONSUMIR sin modificar**: `apps/mobile/lib/nutrition-v2.api.ts` (`archiveNutritionPlan`, `:396-420`, ya
  espejo del web `archivePlanAction` — D-04, RLS-scoped e idempotente) para el paso "archivar" de (c); y
  `CoachFoodInputSchema`/`macroEnergyMismatch`/`customMacrosOf` (`nutrition-v2-builder.ts:356-393`, ya
  existentes) para (b).

Referencia web:
`apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PlanBuilderClient.tsx`
- (a) permisos: `TargetsStep` fieldset `:771-788`; estado/reducer en `_lib/draft-builder.ts:88-99,109-114,159,201-202,568-572`.
- (b) alimento libre: `FreeFoodFields` `:253-348` (aviso `macroEnergyMismatch` `:328-333`, "Guardar en mi catálogo"
  `:334-345`, `UPDATE_ITEM` al éxito `:293-305`); server action `_actions/builder.actions.ts:126-190`
  (`createCoachFoodAction` → `{ ok, food: BuilderFood }`).
- (c) conflicto de fecha: `runPublish` inModal `:1200-1246`, `handleStartTomorrow:1266-1271`,
  `handleReplaceToday:1288-1338`, `PublishConflictDialog.tsx` (modal 2 opciones + cancelar),
  `_lib/publish-conflict.ts` (`effectiveDateConflicts`, `canProceedToPublishAfterArchive`, `nextDayIso`),
  `_actions/nutrition-archive.actions.ts` (`archivePlanAction`), `existingPlan` server-provisto en `builder/page.tsx:44-53`.

---

## Hallazgo estructural (tres gaps de naturaleza distinta)

Las tres piezas comparten archivo pero difieren en cuánto falta:

- **(a) permisos = write-path VIVO, solo falta la UI.** A diferencia de F-02 (4B-10, write-path inerte), el
  estado de permisos RN ya fluye de punta a punta: `BuilderPermissions` (`nutrition-v2-builder.ts:108-110`),
  `defaultPermissionsFor` (`:129-134`), la acción `SET_PERMISSION` (`:179` unión, `:220-221` reducer),
  el reset al elegir estrategia (`:212`), la serialización en `assembleDraft` (`:588-592`) y el
  `student_permissions: draft.permissions` al publicar (`:1067`) — TODO existe y es espejo 1:1 del web.
  **Lo único que falta es renderizar los 3 controles**; hoy `TargetsStep` (`:593-671`) nunca los pinta, así
  que el coach publica SIEMPRE `defaultPermissionsFor(strategy)` sin poder ajustarlos. Cero cambios de estado,
  contrato ni servidor: puro UI + el `dispatch({ type: 'SET_PERMISSION', ... })` que ya está soportado.

- **(b) "Guardar en mi catálogo" = falta la función de creación Y la UI.** El bloque custom de `ItemEditor`
  (`:1116-1139`) pinta solo los 4 inputs de macros por 100; NO muestra el aviso de mismatch ni el botón de
  guardar. Los helpers puros ya están (`macroEnergyMismatch:369`, `customMacrosOf:381`, `CoachFoodInputSchema:356`),
  pero **NO existe una función RN que cree el alimento coach-scoped y devuelva un `BuilderFood`**: la única
  create de RN es `createCoachFoodForCurationV2` (`nutrition-v2-curation.api.ts:285`), que es del flujo de
  curación (exige `missingCodeId`, vincula un código pendiente y devuelve `ResolveResult`, NO un `BuilderFood`)
  → no reutilizable aquí. Falta portar `createCoachFoodAction` (`builder.actions.ts:137-190`) como función de
  escritura client-side (`db`+`userId`) que inserta en `foods` y devuelve el `BuilderFood`, y luego la UI.

- **(c) "Archivar y reemplazar" = faltan el contexto del plan vigente Y la rama.** El primitivo de escritura ya
  existe (`archiveNutritionPlan`, `nutrition-v2.api.ts:396`, ya usado por la ficha `coach/nutrition-v2/[clientId].tsx:1206`),
  pero el builder RN (i) **no conoce el plan vigente**: `nutritionV2BuilderHref` (`nutrition-v2-hub.ts:246`)
  pasa SOLO `clientId` — `planId`/`versionNumber` nunca llegan, así que el builder no tiene `id`/`effectiveFrom`
  del plan activo para archivar ni para el reintento; (ii) solo ofrece **"Empezar mañana"** (`:1473-1490`); y
  (iii) `handlePublish` genera una idempotency key **FRESCA por intento** (`:318`), incompatible con el reintento
  seguro del reemplazo (que exige key ESTABLE + guard "archivado una sola vez"). El RPC `publish_nutrition_plan_v2`
  sigue siendo la barrera real (el CHECK `effective_date_must_follow_current_version` → `EFFECTIVE_DATE`,
  `nutrition-v2-builder.ts:907-908`); esta unidad solo evita el error crudo y ofrece la salida de datos-seguros.

Ninguna de las tres toca contrato, RPC ni servidor.

---

## Afirmaciones y deltas

### Sub-delta (a) — Editor de permisos del alumno en `TargetsStep`

1. **El fieldset web: 3 checkboxes, orden y copys EXACTOS.**
   Web `PlanBuilderClient.tsx:771-788`: `<fieldset>` con `<legend>` **"Permisos del alumno"**
   (`text-xs font-semibold uppercase tracking-wide text-muted`), y 3 labels con checkbox en este orden:
   - `canRegisterFreely` → **"Puede registrar alimentos libremente"**
   - `canAdjustPrescribedQuantity` → **"Puede ajustar la cantidad prescrita"**
   - `canSubstitute` → **"Puede sustituir alimentos"**
   Cada `<label>` es `flex min-h-11 items-center gap-2 text-sm text-body`; el checkbox es
   `h-4 w-4 accent-[var(--theme-primary)]`; `checked={state.permissions[field]}` y
   `onChange → dispatch({ type: 'SET_PERMISSION', field, value })`.
   RN `builder/[clientId].tsx:593-671`: `TargetsStep` renderiza `PortionsDeriveCard`, nombre del plan, "Metas
   diarias" y "Vigente desde". **NO existe ningún control de permisos.**
   **Delta:** el coach no puede fijar permisos → publica siempre `defaultPermissionsFor`.
   Cierre: agregar en `TargetsStep` (dentro de una `NutritionCard`, tras "Metas diarias" y antes/junto a
   "Vigente desde", espejo de la columna derecha web `:752`) una sección "Permisos del alumno" con overline
   `text-xs font-semibold uppercase tracking-wide text-text-muted` y 3 filas en el MISMO orden y con los
   MISMOS copys literales. Cada fila = `Pressable` (target táctil ≥44px, `min-h-11`) que hace
   `dispatch({ type: 'SET_PERMISSION', field, value: !state.permissions[field] })`.

2. **La afordancia de checkbox nativa (adaptación sancionada) — white-label safe.**
   RN no tiene `<input type=checkbox>`; el web usa `accent-[var(--theme-primary)]`.
   Cierre: casilla cuadrada (`h-5 w-5 rounded-control border`) con el icono `Check` (ya importado,
   `:15`) visible SOLO cuando el permiso está activo, tintada con `theme.primary` del `useTheme()`
   (nunca un hex hardcodeado — white-label). Estado off = borde `border-border-default`, fondo
   `bg-surface-card`; estado on = fondo `theme.primary` + `Check` `color={theme.primaryForeground}`.
   `accessibilityRole="checkbox"` + `accessibilityState={{ checked }}` + `accessibilityLabel={label}`.
   La UI **no autoriza**: los permisos son metadatos del plan; el enforcement real vive en el read-model del
   alumno y en el RPC. Esto solo captura la intención del coach.

3. **`SET_PERMISSION` ya está cableado — no tocar el reducer ni `assembleDraft`.**
   Verificado: `nutrition-v2-builder.ts:179` (unión), `:220-221` (`case 'SET_PERMISSION': { ...state,
   permissions: { ...state.permissions, [action.field]: action.value } }`), `:588-592` (`assembleDraft`
   emite `permissions.{canRegisterFreely,canAdjustPrescribedQuantity,canSubstitute}`), `:1067`
   (`student_permissions: draft.permissions`). Al elegir estrategia, `:212` resetea a `defaultPermissionsFor`
   (espejo web `draft-builder.ts:193`) — el coach ajusta DESPUÉS. **Efecto en `assembleDraft`:** cero cambios;
   el objeto de permisos ya se serializa. La sección nueva solo lo puebla con la elección del coach en vez del
   default. **No agregar lógica en la lib para (a).**

### Sub-delta (b) — "Guardar en mi catálogo" + aviso de mismatch de macros (alimento libre)

4. **Aviso de mismatch de energía (`macroEnergyMismatch`), copy exacto.**
   Web `FreeFoodFields:266-267,328-333`: `const macros = customMacrosOf(item); const showWarning =
   macroEnergyMismatch(macros)`. Si `showWarning`, banner ámbar con icono `AlertTriangle`:
   **"Las kcal no cuadran con las macros (4P + 4C + 9G). Puedes guardar igual, pero revisa los valores."**
   RN: `macroEnergyMismatch` (`nutrition-v2-builder.ts:369-379`) y `customMacrosOf` (`:381-393`) YA existen
   y son idénticas (Atwater 4/4/9, umbral 40%). El bloque custom de `ItemEditor` (`:1116-1139`) **no renderiza
   ningún aviso.**
   Cierre: bajo los 4 inputs custom, con `showWarning = macroEnergyMismatch(customMacrosOf(item))`, mostrar el
   aviso con icono `AlertTriangle` (importar de `lucide-react-native`), tono ámbar white-label
   (`text-warning-600`/`bg-warning-500/10` o el token de warning del DS RN — no inventar), copy LITERAL al web.
   Es advertencia, no bloqueo (se puede guardar igual).

5. **Función de creación RN faltante: portar `createCoachFoodAction` como escritura client-side.**
   Web `builder.actions.ts:137-190`: valida con `CreateCoachFoodInputSchema` (clientId/name/brand/unit/
   calories/proteinG/carbsG/fatsG), `authorizeCoach`, INSERT en `foods` con
   `{ coach_id: userId, org_id: null, serving_size: 100, serving_unit: unit, is_liquid: unit==='ml',
   category: 'otro', country_code: 'CL', catalog_source: 'coach', verification_status: 'coach_verified',
   calories, protein_g, carbs_g, fats_g }`, y devuelve `{ ok: true, food: BuilderFood }` (`:175-188`, con
   `fiberG: null, servingSize: 100, servingUnit: unit, media: null`).
   RN: `CoachFoodInputSchema` (`nutrition-v2-builder.ts:356-365`) es idéntico al web, pero **no hay función que
   inserte y devuelva un `BuilderFood`** (la de curación `createCoachFoodForCurationV2` exige `missingCodeId`
   y no aplica).
   Cierre: agregar en `nutrition-v2-builder.ts` una `async function createCoachFoodV2({ db: NutritionV2WriteClient;
   userId: string; input: CoachFoodInput }): Promise<{ ok: true; food: BuilderFood } | PublishFailure>` que
   valide con `CoachFoodInputSchema`, inserte en `foods` con EXACTAMENTE las mismas columnas del web
   (incluyendo `coach_id: userId`, `org_id: null` que exige la RLS `foods_insert_own`), y arme el `BuilderFood`
   de retorno igual que `:175-188`. Errores vía `mapWriteError` (ya existe, `:901`). Sin `revalidatePath`
   (no aplica en RN). La RLS es la barrera real; el cliente no autoriza.

6. **UI del botón + `UPDATE_ITEM` al éxito (espejo del web).**
   Web `FreeFoodFields:270-306,334-345`: botón secundario **"Guardar en mi catálogo"** con icono `Plus`
   (spinner `Loader2` mientras `saving`), estados `saving`/`saveError`; al OK despacha `UPDATE_ITEM` con
   `patch: { food: res.food, customName: null, customCalories: '', customProteinG: '', customCarbsG: '',
   customFatsG: '' }` (el item deja de ser libre y pasa a referenciar el alimento del catálogo). Error de
   validación local: **"Completa el nombre y macros válidas (no negativas) antes de guardar."**
   RN `ItemEditor` (`:1046-1147`) recibe `slotKey, item, dispatch, errors, onSearch` — **NO** `clientId`/`userId`.
   Cierre: renderizar en el bloque custom un botón "Guardar en mi catálogo" (`Plus`, `ActivityIndicator` mientras
   guarda) que llame `createCoachFoodV2` (con `supabase`/`userId` threadeados) y al OK despache el MISMO
   `UPDATE_ITEM`. **Wiring:** `ItemEditor` (y `SlotEditor`/`ConstructionStep`) hoy no reciben `clientId`/`userId`;
   agregar un callback `onSaveCustomFood?: (item: BuilderItem, slotKey: string) => Promise<{ ok; error? }>`
   creado en `CoachNutritionV2BuilderScreen` (que ya tiene `clientId`/`userId`/`supabase`) y threadeado por el
   árbol — así el componente profundo no toca la red directo (patrón ya usado para `onSearch`). El item custom
   requiere `customName.trim()` no vacío antes de guardar (el web lo valida vía `CoachFoodInputSchema`). Copys
   literales al web. Botón solo visible en el bloque custom (`isCustom`), igual que el web.

### Sub-delta (c) — Rama "Archivar el actual y reemplazar" del conflicto de fecha

7. **Hoy el RN solo ofrece "Empezar mañana" ante `EFFECTIVE_DATE`.**
   Verificado: `handlePublish` mapea `res.code === 'EFFECTIVE_DATE'` → `setDateConflict(true)` (`:342-344`);
   la UI de `ReviewStep` (`:1473-1490`) muestra una card con título **"Ya hay un plan vigente desde hoy"** y
   un único botón **"Empezar mañana"** que llama `onStartTomorrow` → `handleStartTomorrow` (`:354-359`), el cual
   avanza `effectiveFrom` con `nextDayIso` (inline `:123`) y reintenta. **NO existe la rama "Archivar y reemplazar".**
   Web `PublishConflictDialog.tsx`: modal con DOS opciones (Empezar mañana / Archivar el actual y reemplazar,
   esta última solo si `canReplace`) + Cancelar; `handleReplaceToday` (`PlanBuilderClient.tsx:1288-1338`) archiva
   PRIMERO y publica DESPUÉS.
   **Delta:** falta la rama de datos-seguros. El comentario RN (`:351-353`) admite que "el plan vigente no está
   disponible en esta pantalla".

8. **Conocer el plan vigente (bloqueante para la rama): fetch en el builder, no llega por params.**
   Web recibe `existingPlan` server-provisto (`builder/page.tsx:44-53`: `{ id, versionNumber, strategy,
   effectiveFrom, name }`) desde `getNutritionClientDetailV2ForWeb`. RN `nutritionV2BuilderHref`
   (`nutrition-v2-hub.ts:246`) pasa **solo `clientId`** → el builder no tiene el plan activo.
   Cierre: en `CoachNutritionV2BuilderScreen`, tras resolver `userId`/scope, leer el plan vigente del alumno con
   el read coach ya existente `getNutritionClientDetailV2` (`nutrition-v2.api.ts:127`, scope-aware) y guardar un
   `existingPlan: { id; effectiveFrom; versionNumber; name } | null` (de `detail.plan.plan`, igual que la ficha
   `coach/nutrition-v2/[clientId].tsx:351`). `canReplace = existingPlan != null`, espejo del web
   (`PlanBuilderClient.tsx:1439`). (Alternativa no elegida: extender `nutritionV2BuilderHref` + la ficha para
   propagar el plan por params — toca 2 archivos extra, uno de ellos editado por unidades de quick-edit; el fetch
   local mantiene el file-scope de esta unidad. Documentar la elección en el Cierre.) BONUS de paridad: hoy el
   eyebrow/versión del builder (`:425-429`) usan `planId`/`versionNumber` de params que nunca llegan, así que
   siempre dice "Nuevo plan"/v1; con `existingPlan` disponible pueden mostrar "Nueva versión"/vN+1 como el web
   (`:1377`) — mejora derivada, no forzar si sale de alcance.

9. **Helpers puros del conflicto: portar `effectiveDateConflicts` + `canProceedToPublishAfterArchive`.**
   Web `_lib/publish-conflict.ts`: `effectiveDateConflicts(chosen, current)` = `chosen <= current` (fechas ISO,
   no bloquea si falta alguna); `canProceedToPublishAfterArchive(result)` = `result.ok || result.code ===
   'PLAN_NOT_FOUND'` (archivar es idempotente: 2ª vez = 0 filas = `PLAN_NOT_FOUND`, y ese caso ya cumple el
   objetivo). `nextDayIso` ya está inline en el builder RN (`:123`).
   RN: ninguno de los dos existe.
   Cierre: portar ambos como funciones puras en `nutrition-v2-builder.ts` (o inline en la pantalla, junto a
   `nextDayIso`), idénticos al web. `effectiveDateConflicts` habilita el pre-chequeo del modal SIN gastar un
   round-trip fallido (el RPC sigue siendo la red de seguridad); `canProceedToPublishAfterArchive` clasifica el
   resultado de `archiveNutritionPlan`. Verificar que `archiveNutritionPlan` devuelve `code: 'PLAN_NOT_FOUND'`
   cuando 0 filas (sí: `classifyArchiveWrite` en `nutrition-v2.api.ts`).

10. **`handleReplaceToday` RN: archivar → publicar, orden y recuperación EXACTOS al web.**
    Web `handleReplaceToday:1288-1338`, semántica a replicar literal:
    - Validar el draft del plan NUEVO ANTES de tocar nada (`assembleAndValidateDraft`, **planId null** = plan
      nuevo); si incompleto, `setConflictError('El plan tiene datos incompletos. Revisa los pasos marcados y
      vuelve a intentar.')` y no archivar.
    - Idempotency key **ESTABLE** por operación de reemplazo (ref fijado una sola vez, reusado en reintentos):
      re-publicar con la misma clave devuelve el mismo plan/versión, nunca un duplicado. (RN hoy usa key FRESCA
      por intento en `handlePublish:318` → NO reutilizar ese flujo; el reemplazo necesita su propio `replaceKeyRef`
      + `buildPublishIdempotencyKey`.)
    - **PASO 1 — archivar** el plan vigente (`archiveNutritionPlan({ db: supabase, userId, clientId,
      planId: existingPlan.id })`), gateado por un `replaceArchivedRef` para saltarlo en reintentos; si
      `!ok && !canProceedToPublishAfterArchive(res)` → `setConflictError(res.error)` y cortar.
    - **PASO 2 — publicar** el draft como plan nuevo (`publishDraftRN` con planId null + la key estable +
      `effectiveFrom` = la fecha elegida, hoy). Al OK → `router.replace(.../${clientId}?published=1)`. Al fallar:
      copy honesto LITERAL: **'Archivamos el plan anterior, pero no pudimos publicar el nuevo, así que el alumno
      quedó sin plan vigente. Vuelve a tocar "Archivar el actual y reemplazar" para reintentar solo la
      publicación (no se archivará de nuevo).'**
    - **ORDEN archivar-primero (no invertir):** el RPC re-deriva el snapshot del día recorriendo TODOS los planes
      activos y desempata por `(effective_from desc, version_number desc)`; como el reemplazo usa la MISMA fecha
      (hoy), publicar primero dejaría dos activos empatados y el viejo podría ganar. Portar el comentario que
      explica esto (web `:1276-1287`).
    Cierre: implementar `handleReplaceToday` en RN con esa secuencia, reusando `archiveNutritionPlan` (ya import
    disponible desde `nutrition-v2.api`) y `publishDraftRN`. Compartir el `publishing` (pending) entre ambos pasos.

11. **UI de las dos opciones (adaptación de la card inline, no un Dialog).**
    Web usa un `Dialog` (`PublishConflictDialog.tsx`) con 2 botones-opción + Cancelar. RN ya resuelve el conflicto
    con una **card inline** en `ReviewStep` (`:1473-1490`) — adaptación nativa ya sancionada para "Empezar mañana".
    Cierre: extender esa card con la SEGUNDA opción (solo si `canReplace`), replicando los copys del Dialog web:
    - Título (ya presente): **"Ya hay un plan vigente desde hoy"**. Descripción con nombre:
      **"{existingPlan.name} empieza a regir hoy. Elige cómo seguir con el plan nuevo."** (sin nombre: "El plan
      actual empieza a regir hoy. Elige cómo seguir con el plan nuevo.").
    - Opción 1 (icono `CalendarClock`): **"Empezar mañana"** / sub **"El plan nuevo entra en vigencia mañana;
      el de hoy sigue activo hasta entonces."** → `onStartTomorrow`.
    - Opción 2 (icono `RefreshCw`), solo si `canReplace`: **"Archivar el actual y reemplazar"** / sub **"El plan
      de hoy se archiva ahora y este pasa a regir desde hoy. El historial del alumno se conserva."** →
      `onReplaceToday`.
    - Mientras `publishing`: **"Procesando…"** (con `ActivityIndicator`). Error del reemplazo (paso 2) inline en
      la card. Botón **"Cancelar"** que cierra la card (`setDateConflict(false)`).
    Importar `CalendarClock` y `RefreshCw` de `lucide-react-native` (RN ya importa `Repeat`, `:15`). Cada botón-
    opción = `Pressable` ≥44px, `disabled` durante `publishing`, tokens `border-border-default bg-surface-card`
    (hint `text-text-muted`), icono en `theme.primary` (white-label). NO crear un modal nuevo — extender la card.

12. **Gating heredado (verificar que se preserve).**
    (a) permisos y (c) conflicto viven en `TargetsStep`/`ReviewStep`, que se montan en todas las estrategias — el
    editor de permisos aplica igual (el default cambia por estrategia vía `:212`). (b) alimento libre solo aparece
    en el bloque `isCustom` de `ItemEditor`, que solo existe en structured/hybrid (SlotEditor). **Paridad de
    intención** — no agregar guardas redundantes; confirmar que un plan flexible publica byte-idéntico a hoy.

---

## Cierre (qué debe quedar)

1. `builder/[clientId].tsx` — `TargetsStep`: sección "Permisos del alumno" con 3 filas-checkbox (orden y copys
   literales del web `:773-776`) que despachan `SET_PERMISSION`; afordancia de casilla nativa (`Check` +
   `theme.primary`, ≥44px, `accessibilityRole="checkbox"`), white-label. Sin cambios en reducer/`assembleDraft`
   (ya cableados).
2. `builder/[clientId].tsx` — bloque custom de `ItemEditor`: aviso `macroEnergyMismatch` (copy literal, tono
   warning) + botón "Guardar en mi catálogo" (`Plus`/spinner, estados saving/error) que llama la nueva
   `createCoachFoodV2` y al OK despacha `UPDATE_ITEM` (food + limpiar customName/custom*). Callback
   `onSaveCustomFood` threadeado desde la pantalla (que tiene `clientId`/`userId`/`supabase`).
3. `nutrition-v2-builder.ts` — `createCoachFoodV2({ db, userId, input })` (espejo de `createCoachFoodAction`,
   INSERT en `foods` coach-scoped → `BuilderFood`) + helpers puros `effectiveDateConflicts` /
   `canProceedToPublishAfterArchive` (espejo de `publish-conflict.ts`).
4. `builder/[clientId].tsx` — conflicto de fecha: fetch del plan vigente en la pantalla (`getNutritionClientDetailV2`
   → `existingPlan`), `canReplace = existingPlan != null`; `handleReplaceToday` (archivar→publicar, key ESTABLE,
   guard archivado-una-vez, orden y copys literales del web) reusando `archiveNutritionPlan` + `publishDraftRN`;
   card inline de `ReviewStep` extendida a 2 opciones + Cancelar (copys de `PublishConflictDialog`). Reusar
   `nextDayIso` (ya inline).
5. F-02 (4B-10) y porciones (4B-11) **intocados**: sin diffs en `SubstitutionsField`/`BuilderItem.substitutions`
   ni en `PortionsSection`/`PortionsDeriveCard`/`PortionsReviewSection`.
6. Tests: unitario de `createCoachFoodV2` (INSERT correcto + `BuilderFood` de retorno; error mapeado) y de los 2
   helpers puros (`effectiveDateConflicts` límites igual/anterior/posterior/faltante; `canProceedToPublishAfterArchive`
   ok/PLAN_NOT_FOUND/otro). Permisos: extender el test del reducer si aplica (SET_PERMISSION ya cubierto por
   `assembleDraft`).
7. Gates de módulo: `pnpm --filter @eva/mobile exec tsc --noEmit` 0 errores, `pnpm exec eslint` 0 nuevos,
   `pnpm check:tokens` OK, y los tests nuevos verdes.

Regla RN-extras (decisión owner 4): esta unidad NO introduce extras sin contraparte web; las 3 piezas espejo del
web ya existen allí. Cualquier afordancia RN adicional que aparezca al codificar = RETIRAR salvo excepción escrita.

---

## Comprobación objetiva

- **(a) Permisos:** en el paso Objetivos aparece "Permisos del alumno" con 3 casillas en el orden y copy del web;
  al elegir "estructurado" arrancan en su default (registrar OFF, ajustar ON, sustituir OFF) y al elegir "flexible"
  cambian (registrar ON); tocar una casilla la conmuta; publicar y verificar que `student_permissions` guardó la
  elección del coach (no el default) — comparar contra el mismo plan creado en la web responsive.
- **(b) Catálogo:** en un ítem con "alimento libre", cargar macros que no cuadran (ej. 100 kcal con 20 P) muestra
  el aviso ámbar "Las kcal no cuadran…"; tocar "Guardar en mi catálogo" con nombre vacío muestra el error de
  validación; con nombre válido crea el alimento coach-scoped, el ítem pasa a referenciarlo (deja de ser libre) y
  el alimento aparece luego en el buscador del catálogo. Idéntico al web `FreeFoodFields`.
- **(c) Archivar y reemplazar:** con un alumno que YA tiene plan vigente desde hoy, publicar uno nuevo con vigencia
  hoy dispara la card "Ya hay un plan vigente desde hoy" con DOS opciones; "Empezar mañana" avanza la fecha y
  publica; "Archivar el actual y reemplazar" archiva el vigente y publica el nuevo desde hoy (el historial del
  alumno se conserva); si el publish falla tras archivar, aparece el mensaje honesto y reintentar NO vuelve a
  archivar ni duplica (key estable). Un alumno SIN plan vigente no ve la segunda opción (`canReplace` false). Un
  plan sin conflicto publica exactamente como hoy. Capturas web móvil (fieldset de permisos, `FreeFoodFields`,
  `PublishConflictDialog`) vs RN: copys idénticos. F-02 y porciones siguen operando sin cambios.
- Gates: `pnpm --filter @eva/mobile exec tsc --noEmit`, `pnpm exec eslint`, `pnpm check:tokens`, tests nuevos.

---

## Cierre (2026-07-22)

Las tres sub-deltas aterrizaron 1:1 con el web. Archivos tocados: `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx`,
`apps/mobile/lib/nutrition-v2-builder.ts`, `tests/mobile-nutrition-v2-builder.test.ts`.

**(a) Editor de permisos del alumno.** Nueva sección "Permisos del alumno" en `TargetsStep` (dentro de una `NutritionCard`,
tras "Metas diarias" y antes de "Vigente desde"), con overline `text-xs font-semibold uppercase tracking-wide text-text-muted`
y 3 filas en el orden y con los copys LITERALES del web (`canRegisterFreely`/`canAdjustPrescribedQuantity`/`canSubstitute`).
Cada fila = componente `PermissionRow` (`Pressable` ≥44px, `accessibilityRole="checkbox"` + `accessibilityState={{ checked }}` +
`accessibilityLabel`) que despacha `SET_PERMISSION` con el valor negado. Afordancia de casilla nativa (`h-5 w-5 rounded-control
border`) con `Check` visible SOLO al estar activo, tintada con `theme.primary` + `Check color={theme.primaryForeground}` (nunca
un hex — white-label). Reusé el patrón de checkbox ya sancionado (AssignClientsSheet / modal de asignar 4B-08), como pidió el
juez. CERO cambios en reducer/`assembleDraft` (ya cableados). Efecto colateral positivo: al usarse `<Check>` desaparece uno de los
warnings eslint sancionados (`Check` unused) → el archivo baja de 4 a 3 problemas preexistentes.

**(b) "Guardar en mi catálogo" + aviso de mismatch.** Nueva `createCoachFoodV2({ db, userId, input })` en la lib, espejo 1:1 de
`createCoachFoodAction`: valida con `CoachFoodInputSchema`, inserta en `foods` con EXACTAMENTE las mismas columnas (`coach_id:
userId`, `org_id: null`, `serving_size: 100`, `catalog_source: 'coach'`, `verification_status: 'coach_verified'`, `is_liquid:
unit==='ml'`), arma el `BuilderFood` de retorno y mapea errores vía `mapWriteError` (42501 → SCOPE_DENIED). Sin `revalidatePath`.
En `ItemEditor`, el bloque custom pinta ahora: el aviso `macroEnergyMismatch(customMacrosOf(item))` con icono `AlertTriangle`
(tono `text-warning-700`, copy literal al web, advertencia no bloqueo) + botón "Guardar en mi catálogo" (`Plus`/`ActivityIndicator`,
estados `saving`/`saveError`) que llama un callback `onSaveCustomFood` creado en la pantalla (que tiene `clientId`/`userId`/
`supabase`) y threadeado por `ConstructionStep → SlotEditor → ItemEditor` (patrón de `onSearch`; el componente profundo no toca la
red). Al OK despacha el MISMO `UPDATE_ITEM` (food + limpiar customName/custom*). Validación local: nombre vacío → "Completa el
nombre y macros validas (no negativas) antes de guardar." Botón solo en el bloque `isCustom`, igual que el web.

**(c) "Archivar el actual y reemplazar".** Se lee el plan vigente LOCAL con `getNutritionClientDetailV2` (de `detail.plan.plan`),
guardándolo en `existingPlan: { id; effectiveFrom; versionNumber; name } | null` — **decisión del juez** para no propagar por nav
params (tocaría la ficha/href de otras unidades); documentada como en la spec. `canReplace = existingPlan != null`. Nuevos helpers
puros en la lib: `effectiveDateConflicts` (idéntico al web) y `canProceedToPublishAfterArchive` (adaptado: el `ArchiveWriteOutcome`
RN usa `code: 'OK'`, no `ok: true`; acepto ambas formas). `handlePublish` gana el pre-chequeo sin round-trip
(`effectiveDateConflicts` + `existingPlan`) que abre la card directo; el RPC sigue siendo la red de seguridad (`EFFECTIVE_DATE`).
`handleReplaceToday` replica la secuencia web literal: valida el draft NUEVO (planId null) ANTES de archivar; clave de idempotencia
ESTABLE por operación (`replaceKeyRef`, fijada una sola vez); PASO 1 archivar (`archiveNutritionPlan`, gateado por
`replaceArchivedRef` para saltarlo en reintentos; si `!OK && !canProceed` corta); PASO 2 publicar como plan nuevo con la misma
fecha; copys honestos literales al fallar. Orden archivar-primero con el comentario portado. `handleCancelConflict` resetea ambos
refs (nueva operación limpia). La card inline de `ReviewStep` se extendió a DOS opciones (`ConflictOptionButton` con `CalendarClock`
/`RefreshCw` en `theme.primary`; la 2ª solo si `canReplace`) + "Procesando…" + error inline + "Cancelar", con los copys de
`PublishConflictDialog`. **Idempotencia verificada por diseño:** un reintento tras archivar reusa la key estable (mismo plan/versión,
sin duplicar) y salta el archivado (`replaceArchivedRef`) — sin re-archivar.

**F-02 (4B-10) y porciones (4B-11) intocados:** el `git diff` no toca `SubstitutionsField`/`BuilderItem.substitutions` ni
`PortionsSection`/`PortionsDeriveCard`/`PortionsReviewSection`/`BuilderPortionsSection` (grep verificado, vacío).

**Tests (nuevos, 7):** `createCoachFoodV2` (INSERT correcto + `BuilderFood`; `ml`→`is_liquid`; nombre vacío→INVALID_PAYLOAD sin
tocar BD; 42501→SCOPE_DENIED); `effectiveDateConflicts` (igual/anterior/posterior/faltante); `canProceedToPublishAfterArchive`
(OK/PLAN_NOT_FOUND/ok:true/otros); `SET_PERMISSION` (conmuta + `assembleDraft` emite la elección del coach).

**Gates (todos desde el worktree):** `pnpm --filter @eva/mobile exec tsc --noEmit` → 0 errores; `pnpm vitest run
tests/mobile-nutrition-v2-builder.test.ts` → 30/30 verdes; `pnpm exec eslint [clientId].tsx` → 3 problemas (baseline HEAD = 4;
0 nuevos; se eliminó el warning `Check` unused); `pnpm exec eslint` lib + test → 0 problemas; `pnpm check:tokens` → OK.

**Pendiente CEO:** build nativa + QA en device (fieldset de permisos vs web responsive; `FreeFoodFields`; card de conflicto con
las 2 opciones y el reintento seguro tras archivar).
