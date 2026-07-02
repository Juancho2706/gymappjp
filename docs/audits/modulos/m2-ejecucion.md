# 2. Donde se ejecuta cada modulo (los 4)

Los 4 modulos comparten el mismo gate central, las mismas claves y la misma regla
de resolucion de contexto. Eso va primero porque define el gating de TODOS.

## Cimientos comunes (gate compartido)

- **Claves de modulo** (`MODULE_KEYS` en `services/entitlements.service.ts`):
  `cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`.
- **Fuente de verdad del entitlement**: jsonb `enabled_modules`. Se resuelve por el
  **CONTEXTO DEL RECURSO** (regla LOCKED): si el recurso es de pool/team manda
  `teams.enabled_modules`; si es standalone manda `coaches.enabled_modules`. El team
  **no es union**: el pool gana, y los modulos del team NO se filtran a los alumnos
  standalone del coach. Default OFF (`{}`).
- **Helpers del gate**: `hasModule(db, key, ctx)` (bool), `assertModule(db, key, ctx)`
  (lanza). `ctx` = `{ teamId?, coachId? }`; con `teamId` lee teams, si no lee coaches.
- **Kill-switch de operador** (`isModuleKilledByOperator`): env `EVA_DISABLED_MODULES`
  (CSV de claves) apaga el modulo para TODOS por encima del entitlement; `hasModule`
  retorna `false` antes de mirar el tenant. Requiere redeploy.
- **Kill-switch de plataforma** (solo body_composition): `assertBodyCompositionEnabled()`
  lee `body_composition_kill_switch` de Vercel Edge Config; fail-OPEN si Edge Config
  no esta disponible.
- **Workspace activo**: el modulo coach-side resuelve `resolvePreferredWorkspace` /
  `resolvePreferredWorkspace` / `getPreferredWorkspaceForRender`. Tipos: `coach_team`
  (=> `activeTeamId`), `enterprise_coach` (=> los 4 modulos OFF en v1), standalone.
- **Aviso vs notFound**: con el modulo OFF las paginas de nav muestran
  `ModuleOffNotice` (aviso amable hacia el catalogo); las paginas sin nav que viven
  dentro de la ficha hacen `redirect`/`notFound`.

---

## Cardio (`cardio`)

- **Tipo**: por-alumno (perfil cardio por alumno) **+** hub con calculadoras
  transversales que no persisten.
- **Entrada actual**:
  - Nav top-level `/coach/cardio` (`page.tsx` -> `getCardioPageData()` ->
    `CardioToolsClient`).
  - Por-alumno `/coach/cardio/[clientId]` (`page.tsx` -> `getCardioClientData(clientId)`
    -> `CardioProfileForm` + render de zonas).
  - Tambien linkeado desde la ficha del alumno via `ModuleLinksRow`
    (`/coach/cardio/[clientId]`, label "Perfil cardio").
- **Como se elige el alumno**:
  - En el hub: `<select>` "Alumno" dentro de `CardioToolsClient` (opcion vacia =
    "Calculo manual"). La lista sale de `listCardioClients(supabase, scope)` ->
    `findCardioClients`: team => alumnos de ESE pool (`team_id = activeTeamId`,
    `org_id null`); standalone => propios (`coach_id`, `team_id null`, `org_id null`).
    Elegir un alumno carga su perfil y muestra un CTA "Editar perfil" a
    `/coach/cardio/[clientId]`.
  - En la pagina por-alumno: el `clientId` viene de la URL.
    `getCardioClientForCoach` valida que el alumno pertenezca al workspace activo
    (team del pool o standalone propio, `org_id` debe ser null) -> si no, `not_found`.
- **Que hace la pantalla**:
  - **Hub** (`CardioToolsClient`, todo client-side, sin persistencia): 3 calculadoras
    transversales. (1) Zonas FC: por alumno seleccionado o por edad/FC reposo manual.
    (2) Pace/tiempo/velocidad: `formatPace`, `paceToTimeSec`, `kmhFromPace`,
    `paceKmToMile` de `domain/cardio/pace`. (3) Plantillas system de intervalos:
    `INTERVAL_TEMPLATES` de `lib/workout-interval` (read-only; se aplican en el builder
    al prescribir un bloque cardio).
  - **Por-alumno**: edita y **persiste** el perfil cardio del alumno (los unicos datos
    que cardio guarda) y muestra las zonas resultantes Z1-Z5.
- **Datos que llegan / se guardan**: el perfil cardio son **columnas de `clients`**:
  `birth_date`, `resting_hr`, `max_hr_override`, `ref_5k_time_sec`. Action
  `updateCardioProfileAction` (`cardio.actions.ts`): `getUser` -> resuelve workspace
  -> rechaza enterprise -> `assertModule('cardio', ctx)` -> Zod `CardioProfileUpdateSchema`
  -> `saveCardioProfile` -> `getCardioClientForCoach` (revalida scope) ->
  `updateClientCardioProfile` (`UPDATE clients SET ...`). `revalidatePath` de
  `/coach/cardio`, `/coach/cardio/[id]`, `/coach/clients/[id]`.
- **Calculo (dominio puro `domain/cardio/zones.ts`)**: `resolveMaxHr` = override manual >
  Tanaka (`208 - 0.7*edad`); `resolveClientZones` = Karvonen si hay FC reposo valida
  (`reposo < FCmax`), si no %FCmax; 5 zonas con bandas `[0.5-0.6 ... 0.9-1.0]`. El
  perfil guarda solo el dato base; **los bpm se derivan por alumno al renderizar**
  (mismo dominio lo usa el bloque cardio del alumno via `hrRangeForZone`). Sin edad ni
  FCmax medida => no hay bpm (la UI cae a "Z4" sin rango).
- **El gate**: server-side en `_data` (`getCardioPageData` / `getCardioClientData`):
  `getClaims()` -> `resolvePreferredWorkspace` -> enterprise = `module_off` ->
  `assertModule('cardio', { teamId: activeTeamId, coachId: activeTeamId? null : user.id })`.
  La action repite el gate (no confia en el render). OFF => `ModuleOffNotice` (hub) o
  `redirect('/coach/cardio')` (por-alumno). Repo via service; entitlement por
  `findClientCardioProfile.team_id ?? coach_id`.

---

## Movimiento (`movement_assessment`)

- **Tipo**: por-alumno (evaluacion por alumno) **+** hub como lista de alumnos.
- **Entrada actual**:
  - Nav top-level `/coach/movement` (`page.tsx` -> `getMovementHub()` ->
    `MovementHubList`). El hub **es la lista** de alumnos del workspace.
  - Reporte `/coach/movement/[clientId]` (`getMovementClientReport` ->
    `ClientMovementReport`).
  - Wizard `/coach/movement/[clientId]/new` (`getMovementWizard` -> `MovementWizard`,
    7 patrones + revision).
  - Pagina print `/coach/movement/[clientId]/.../print` (`getMovementPrint`).
  - Tambien linkeado desde la ficha via `ModuleLinksRow` (label "Screening de
    movimiento").
- **Como se elige el alumno**: en el hub (`MovementHubList`) cada fila es un alumno con
  su ultimo semaforo (`PriorityBadge` + `composite/21` + fecha) y badge de borrador
  pendiente. La lista sale de `getMovementHubData` -> `findScopedClientsBasic` (scope
  3-vias del workspace). Cada fila linkea a `/coach/movement/[clientId]` (reporte) y a
  `/coach/movement/[clientId]/new` (evaluar/retomar). En reporte y wizard el `clientId`
  viene de la URL.
- **Que hace la pantalla**:
  - **Hub**: lista + semaforo + CTA evaluar (o "retomar" si hay borrador).
  - **Wizard**: captura los 7 patrones (autosave por paso), muestra awareness si otro
    coach del pool edito el borrador, y finaliza.
  - **Reporte**: ultimo final + historial + evolucion; registra `view` en bitacora team.
- **Datos que llegan / se guardan** (tablas `movement_assessments` +
  `movement_assessment_items`, via `movement-assessment.repository`):
  - **Borrador unico por alumno** (indice parcial): `upsertDraftItem` crea el borrador
    si no existe e inserta/actualiza UN item con `final_score` recalculado server-side.
  - **Finalizar** (`finalizeMovementAssessment`): recalculo server completo
    (`summarizeAssessment`) + persiste `composite_score`, `has_pain`, `has_asymmetry`,
    `risk_band`, `consent_confirmed_at`, `assessed_at`, `notes`. El CHECK
    `movement_assessments_final_complete` exige `consent_confirmed_at` NOT NULL para
    `status='final'`.
  - **Eliminar** (`deleteMovementAssessment`): el final es inmutable; corregir = borrar
    (queda `delete` en bitacora) y re-evaluar. Cruza assessment <-> alumno antes de
    borrar (evita borrar evaluaciones de alumnos standalone con un client_id del pool).
  - `last_edited_by = userId` en cada write (awareness en service, no trigger).
- **Calculo (`@eva/calc` -> `packages/calc/src/movement.ts`, puro)**: 7 patrones
  ordinal 0-3; `finalItemScore` = dolor o clearing positivo fuerzan 0, por-lado toma
  `min(L,R)`, puntaje unico pasa directo; `compositeScore` = suma /21 (exige los 7
  patrones); `hasAsymmetry` = algun par L/R con `|L-R| >= 1`; banda de **prioridad de
  trabajo correctivo** (nunca "riesgo de lesion"): high si dolor || `<=14`, moderate si
  `15-16` || asimetria, low si `>=17` limpio. `MOVEMENT_PROTOCOL_VERSION = 'v1'`.
- **Consentimiento (Ley 21.719)**: en contexto **team** el consentimiento
  `health_data_processing` activo (`client_consents`) es **bloqueante** para finalizar;
  en **standalone** el coach atesta explicitamente (`consent_attested`) y se crea el
  registro si falta.
- **Bitacora team** (`team_access_logs` via `logTeamClientAccess`, best-effort): `view`,
  `create`/`update`, `delete`, `pdf_generate` — solo cuando `viaTeam`.
- **El gate**: `resolveMovementClientContext` (orden estricto): kill-switch operador ->
  `assertCoachClientReadAccess` (scope 3-vias) -> rechazo enterprise (org => excepcion,
  v1) -> `assertModule('movement_assessment', ctx)`. El hub usa
  `resolveMovementWorkspaceContext`. Actions delgadas (`movement.actions.ts`) hacen Zod
  (`@eva/schemas/screening`) + delegan TODO al service. OFF => `ModuleOffNotice` (hub) o
  `notFound()` (reporte/wizard).

---

## Composicion corporal (`body_composition`)

- **Tipo**: por-alumno. **SIN nav top-level** — vive dentro de la ficha del alumno.
- **Entrada actual**: se entra desde la ficha (`ModuleLinksRow` en
  `coach/clients/[clientId]/page.tsx`, label "Composicion corporal") hacia
  `/coach/clients/[clientId]/bodycomp` (`page.tsx` -> `getClientBodyComposition(clientId)`
  -> `BodyCompositionTabB6b`). Ruta NUEVA propia (no toca la pestana de progreso). Hay
  ademas endpoints mobile (`/api/mobile/bodycomp/isak|bia|[id]`).
- **Como se elige el alumno**: implicito — el `clientId` ya esta fijado por la ficha
  desde la que se entro (URL `/coach/clients/[clientId]/bodycomp`). No hay selector.
  `assertCoachClientWriteAccess` valida que el coach puede escribir mediciones de ESE
  alumno bajo el workspace activo (team del pool o cliente propio standalone, `org_id`
  null en standalone).
- **Que hace la pantalla**: captura mediciones BIA e ISAK del alumno, muestra
  tendencias (`BiaTrendPanel`, `IsakTrendPanel`) y permite soft-delete. Dos metodos
  separados (`bia` / `isak`).
- **Datos que llegan / se guardan** (tabla `body_composition` via
  `body-composition.repository`): action `saveBodyCompositionAction` (objeto ya
  estructurado, no FormData) -> `saveBodyComposition`. Comun a ambos: `client_id`,
  `coach_id`, `team_id`, `measured_at`, `device_brand/model`, `measurement_conditions`,
  `notes`, `source='manual'`, `consent_confirmed_at`, `created_by`, `is_validated=false`
  (label "preliminar"). `deleteBodyComposition` = soft-delete (`deleted_at`).
- **Calculo**:
  - **ISAK** (`domain/bodycomp` puro -> `computeIsak`): fraccionamiento 5 componentes
    (Kerr, `fractionate5C`) + somatotipo (Heath-Carter, `heathCarter`) + % grasa
    (`bodyFatPct`, ecuacion seleccionable, default `durnin_womersley`). Persiste
    `metrics` (derivados), `raw_input`, `equation_used`
    (`kerr5c+heath_carter+<ecuacion>`), `weight_kg`, `height_cm`. El MISMO codigo corre
    en el preview en vivo del cliente y server-side (paridad garantizada).
  - **BIA**: metrics capturados directo del aparato (no se derivan); `equation_used null`,
    `raw_input {}`.
- **Consentimiento (Ley 21.719)**: en contexto **team** `assertHealthConsent`
  (`client_consents`, purpose `health_data_processing`, no revocado) es bloqueante para
  **guardar Y leer**. La lectura sin consentimiento falla server-side y deja `view` en
  `team_access_logs`. Standalone no exige consentimiento de tercero.
- **El gate** (en `getClientBodyComposition`, orden estricto): `getClaims()` ->
  `assertBodyCompositionEnabled()` (kill-switch plataforma Edge Config; fallo =>
  `module_off`) -> `assertCoachClientWriteAccess` (fallo => `not_found` seco) ->
  `assertModule('body_composition', ctx)` (fallo => `module_off`) ->
  `listClientMeasurements` (consentimiento team + bitacora `view`). El service repite el
  gate en cada save/delete. OFF => `ModuleOffNotice`; alumno inexistente/sin acceso/sin
  consentimiento => `notFound()`.

---

## Intercambios / "Nutricion Pro" (`nutrition_exchanges`)

- **Tipo**: **CAPA del plan**, no es por-alumno con pantalla propia. Es un modo del
  builder de nutricion (`PlanBuilder` en modo `client-plan`). NO tiene nav ni hub.
- **Entrada actual**:
  - **No** se entra por una pantalla del modulo. La capa vive DENTRO del builder del
    plan de cada alumno: `/coach/nutrition-plans/client/[clientId]` (`page.tsx` ->
    `PlanBuilder mode="client-plan"` con prop `exchange`).
  - `/coach/nutrition-plans/exchanges` (`exchanges/page.tsx`) es **solo landing/redirect**:
    con el modulo OFF muestra `ModuleOffNotice`; con el modulo ON hace
    `redirect('/coach/nutrition-plans')`. No edita nada.
  - En la ficha del alumno, el panel de micros avanzados (Zona C) tambien hornea este
    modulo via `resolveNutritionProEnabled`.
- **Como se elige el alumno**: igual que cualquier plan de nutricion — se entra al
  builder del plan de un alumno especifico (`/coach/nutrition-plans/client/[clientId]`,
  `clientId` de la URL). La capa de intercambios solo aparece DENTRO de ese builder; no
  hay seleccion de alumno propia.
- **Que hace la capa** (`ExchangeModePanel` dentro de `PlanBuilder`, solo si el modulo
  esta ON para el contexto y `mode='client-plan'`):
  - **Toggle Gramos <-> Porciones** (`planMode` `grams`/`exchanges`). Switch NO
    destructivo: conserva food_items y targets. Requiere plan ya guardado (`planId`).
  - **Targets de intercambio por comida**: porciones por grupo de intercambio
    (`meal_exchange_targets`); totales derivados Sigma(porciones x ref) vs objetivo.
  - **Variantes de dia** (max 6 por pauta; presets "Descanso/Entreno AM/Entreno PM").
  - **PDF branded** (compact / equivalences) con la marca del tenant resuelta
    server-side.
- **Datos que llegan / se guardan** (via `exchange.actions.ts` ->
  `nutrition-exchanges.service.ts` -> `exchanges.repository`):
  - `setPlanModeAction` -> `setNutritionPlanMode` (columna `plan_mode` del plan).
  - `saveMealExchangeTargetsAction` -> `saveMealExchangeTargets` (replace de targets de
    la comida; `verifyGroupsVisibleToActor` rechaza `exchangeGroupId` que no resuelva
    contra los grupos VISIBLES — el FK no valida visibilidad).
  - `createDayVariantAction` / `renameDayVariantAction` / `deleteDayVariantAction`
    (delete => comidas a "todas", ON DELETE SET NULL) / `assignMealVariantAction`.
  - `logNutritionPdfGeneratedAction` -> bitacora `pdf_generate` SOLO en contexto team
    (fire-and-forget; el flujo del ALUMNO NO importa este archivo).
  - Cada write del builder marca `last_edited_by_coach_id` (awareness en el pool).
  - El plan se guarda con `plan_mode = exchangeActive ? 'exchanges' : 'grams'` en
    `upsertClientNutritionPlanJson` (en modo porciones, payload incluye `id` de comida
    para que targets/variante viajen con su comida al reordenar).
- **Calculo**: totales derivados de porciones via `dayTotalsByVariant` y
  `hasUnconfirmedMacros` (`services/nutrition-exchanges/exchange-calc`). El PDF se arma
  client-side (`lib/nutrition-exchange-pdf`).
- **El gate**: por el CONTEXTO DEL RECURSO del plan (`moduleCtxForPlan`: alumno de pool
  => `teams.enabled_modules`; si no => `coaches.enabled_modules` del coach dueno del
  plan). `assertExchangesModuleForPlan` carga el contexto del plan y `assertModule` es
  el techo de TODA action. En el render, el client-plan page pre-resuelve
  `getHasExchangesModule` + `sectionFlags` (entitlement AND preferencia `micros_advanced`)
  y solo pasa `exchange` si esta ON; `exchangeEnabled = !!exchange && mode==='client-plan'
  && microsAdvancedVisible`. Vista del alumno gateada aparte por
  `getStudentExchangeBundle` (fail-closed, doble verificacion de tenant).

---

## Cierre: por-alumno vs capa-del-plan

- **Por-alumno** (los tres viven o se linkean desde `ModuleLinksRow` en la ficha del
  alumno, `coach/clients/[clientId]/page.tsx`):
  - **cardio** -> `/coach/cardio/[clientId]` (perfil cardio; ademas tiene hub propio con
    calculadoras transversales).
  - **movement_assessment** -> `/coach/movement/[clientId]` (reporte) y `/new` (wizard);
    ademas tiene hub propio que ES la lista de alumnos.
  - **body_composition** -> `/coach/clients/[clientId]/bodycomp` (sin nav; SOLO se entra
    desde la ficha).
- **Capa-del-plan**:
  - **nutrition_exchanges** ("Nutricion Pro") NO es por-alumno con pantalla propia ni
    tiene nav: es un MODO del `PlanBuilder` en `mode='client-plan'`
    (`/coach/nutrition-plans/client/[clientId]`). La ruta `/coach/nutrition-plans/exchanges`
    es solo landing/redirect.
