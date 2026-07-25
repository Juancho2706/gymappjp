# 4B-13 — Respaldo local del builder (autosave + banner Restaurar + guard de salida) del coach en RN

Archivos RN (frontera con 4B-10/11/12 — el monolito `builder/[clientId].tsx` es **compartido** → esta unidad
es **SOLITARIA en su archivo**, secuencial, nunca en la misma wave que otra unidad del builder; INVENTARIO §4):
- **EDITAR** `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx` (monolito ~2057 líneas tras
  4B.3/4B.4/4B.5): cablear el respaldo local — `draftKey`, efecto de montar (`sweep` + `read` + banner),
  autosave debounced, guard de salida (hardware back), handlers Restaurar/Descartar, limpieza en publish OK
  (AMBAS ramas), banner Restaurar y el método `restoreBySlot` del controlador de porciones. Hoy el builder RN
  **no tiene NADA de esto** (grep de `draft-store`/`readNutritionDraft`/`BackHandler` en el archivo = 0
  matches). El inventario lo confirma: "builder RN no advierte al salir con borrador" y "sin autosave ni
  restauración".
- **EDITAR** `apps/mobile/lib/nutrition-v2-builder.ts`: agregar la acción `RESTORE` al union `BuilderAction`
  (`:171-187`) + su `case` en `builderReducer` (`:197`), y la función pura `builderHasSignificantContent(state)`
  (hoy no existe en RN; en web vive inline en el componente).
- **CONSUMIR sin modificar** `apps/mobile/lib/nutrition-coach-draft-store.ts` — store PURO async que YA existe
  (nació en 4B-14, la unidad hermana quick-edit). Esta unidad es la **CONSUMIDORA** de la primitiva
  (INVENTARIO §5: "una unidad dueña, la otra consumidora"; la dueña es 4B-14). Se usan tal cual:
  `builderDraftKey(clientId, planId)` (`:43-45`, `?? 'new'`), `readNutritionDraft` (`:51-75`),
  `writeNutritionDraft` (`:83-101`), `clearNutritionDraft` (`:103-109`), `sweepStaleNutritionDrafts`
  (`:112-130`) — todas `Promise`-based, best-effort try/catch, envelope `{ v: 1, savedAt, payload }`,
  `NUTRITION_DRAFT_MAX_AGE_MS = 7d`, tope `MAX_SERIALIZED_CHARS = 450_000`. **El prefijo del builder ya está
  presente** (`BUILDER_PREFIX = 'eva:nutrition-builder-draft:'`, `:23`): 4B-14 lo creó a propósito para que esta
  unidad lo reuse sin re-crear la lib. **NO re-crear ni tocar el store.**

Referencia web:
`apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PlanBuilderClient.tsx`
- Payload `BuilderDraftPayload = { clientId, planId, state, portionsBySlot }` (`:1024-1029`).
- Helper `builderHasSignificantContent(state)` (`:1033-1038`) + `LEAVE_GUARD_COPY` (`:1040`).
- `draftKey = builderDraftKey(clientId, existingPlan?.id ?? null)` (`:1081`), refs de banner/payload/isFirstRender
  (`:1082-1084`).
- Efecto de montar: `sweep` + `read` + validar `payload.clientId === clientId` → banner (`:1088-1095`).
- Autosave debounced **2000 ms** con guard de primer render (`:1100-1117`).
- Guard de salida `beforeunload` gateado por contenido significativo (`:1122-1130`).
- `goToPublished` (clear + navegar), usado por AMBAS ramas de publicación (`:1159-1162`).
- `handleRestoreDraft` (`:1165-1176`) / `handleDiscardDraft` (`:1178-1182`).
- Banner Restaurar (copys) (`:1344-1364`).
- Acción `RESTORE` del reducer: `_lib/draft-builder.ts:168` (union) + `:252-261` (case, guarda
  `Array.isArray(next.slots)` + re-clamp de `step`).

## Contexto (referencia canónica, no V1)

El respaldo local del wizard es la **misma feature V2 viva** que 4B-14 portó para el quick-edit, pero en la otra
superficie del coach: el **builder de 4 pasos**. Si el coach mata la app / se queda sin batería a mitad de
construir un plan, el árbol del wizard (reducer `BuilderState`) **y** el mapa de porciones (`portions.bySlot`)
viven solo en memoria y se pierden. Web lo resuelve con autosave debounced a localStorage + banner "Restaurar"
al volver + un aviso nativo al cerrar la pestaña. RN ya tiene la **primitiva** (`nutrition-coach-draft-store.ts`,
async, ambos prefijos) y ya tiene el precedente de wiring en el quick-edit (4B-14): esta unidad es el **espejo
del wiring web del builder** consumiendo esa primitiva. La única divergencia es de PLATAFORMA (AsyncStorage
`async` vs localStorage síncrono) y de ARQUITECTURA RN (dos estados hermanos: reducer + porciones en `useState`,
igual que la trampa "dos reducers" de 4B-14). No hay RN-extra nuevo que retirar: porte directo.

**Gotcha PR #148 (heredado del store):** la key SIEMPRE incluye `clientId` — ya garantizado por
`builderDraftKey`; esta unidad no lo re-implementa, solo lo consume.

## Hallazgo estructural (qué falta y qué NO)

- **La primitiva ya existe (4B-14) — esto NO es como el quick-edit que la creó.** 4B-14 fue la unidad DUEÑA:
  creó `nutrition-coach-draft-store.ts` con AMBOS prefijos + los 14 tests. 4B-13 es la CONSUMIDORA: solo
  importa `builderDraftKey`/`read`/`write`/`clear`/`sweep` y las cablea. **Cero cambios en el store.** Si al
  codificar aparece la tentación de tocar el store = está fuera de alcance (rompería a 4B-14).
- **El reducer del builder NO tiene `RESTORE` (a diferencia del quick-edit, que en 4B-14 ganó `RESTORE_DRAFT`).**
  `BuilderAction` (`nutrition-v2-builder.ts:171-187`) enumera `SET_STEP`…`REMOVE_ITEM_SUBSTITUTION` pero **no**
  `RESTORE` (grep: 0 matches). Es rehidratación TOTAL del árbol, no un undo puntual. Hay que agregarla, espejo
  literal del web `draft-builder.ts:252-261`.
- **Las porciones del builder RN son un `useState`, no un reducer.** A diferencia del quick-edit (reducer
  `portionsReducer` separado + `RESTORE_PORTIONS`), el builder usa el controlador `usePortionsBuilder`
  (`builder/[clientId].tsx:184-234`) con `const [bySlot, setBySlot] = useState<PortionsBySlot>({})`. **No expone
  ningún método de restauración** (`addGroup`/`removeGroup`/`step`/`ensureGroupsLoaded`/`retryGroups`, sin
  `restoreBySlot`). La restauración se agrega como un `setBySlot(map)` expuesto — más simple que la acción de
  reducer que necesitó el quick-edit, pero es el par OBLIGADO del `RESTORE` (persistir/restaurar solo `state`
  perdería silenciosamente las porciones a elección — misma trampa de 4B-14).
- **El builder RN no tiene guard de salida (0 de `BackHandler`).** El quick-edit SÍ (4B-14 lo dejó intacto,
  `Alert`+`BackHandler`). El builder no advierte al salir. Hay que agregarlo — pero **con un rol distinto** al
  guard del quick-edit (ver afirmación 6).
- **`existingPlan` en RN es ASÍNCRONO** (`builder/[clientId].tsx:301-318`), mientras que en web es
  server-provisto SÍNCRONO. Como la key del borrador depende de él, esto introduce una **trampa de timing** que
  el web no tiene (afirmación 3). Es el delta arquitectónico central de esta unidad.

## Afirmaciones y deltas

1. **RN no persiste el builder. FALTA COMPLETA.**
   Web `PlanBuilderClient.tsx:1088-1130` corre TRES piezas contra el store: efecto de montar (sweep+read+banner),
   autosave debounced 2000 ms y guard `beforeunload`. El builder RN **no importa ningún store de drafts** y no
   tiene `BackHandler` (grep en `builder/[clientId].tsx`: 0 de `draft-store`/`readNutritionDraft`/`BackHandler`).
   **Delta:** cablear las tres piezas (adaptando `beforeunload` → guard nativo, afirmación 6) reusando el store
   async ya existente.
   Cierre: efecto de montar + autosave debounced + guard de salida, todo nuevo, sobre la primitiva de 4B-14.

2. **Payload = `state` + porciones, espejo del web (la trampa "dos estados").**
   Web `BuilderDraftPayload = { clientId, planId, state, portionsBySlot }` (`:1024-1029`); el comentario
   `:1021-1023` advierte que sin `portionsBySlot` "un plan structured/hybrid restauraría incompleto (las
   porciones a elección se perderían)". RN tiene los dos estados SEPARADOS: `state` (reducer, `:260`) y
   `portions.bySlot` (`useState` en `usePortionsBuilder`, `:185`). **Delta:** el payload RN persiste AMBOS
   (`{ clientId, planId, state, portionsBySlot: portions.bySlot }`) y la restauración rehidrata los DOS
   (`dispatch({ type: 'RESTORE', … })` + `portions.restoreBySlot(…)`). Persistir solo `state` sería una
   regresión respecto a web.
   Cierre: payload con `state` + `portionsBySlot`; restaurar despacha al reducer Y al controlador de porciones.

3. **Key del borrador: `builderDraftKey(clientId, existingPlan?.id ?? null)` — con la trampa de timing async (RN-only).**
   Web `:1081`: `draftKey = builderDraftKey(clientId, existingPlan?.id ?? null)`. Para un plan **NUEVO**
   (`existingPlan == null`) → `planId` = null → key `eva:nutrition-builder-draft:<clientId>:new`; para una nueva
   versión de un plan vigente → key `…:<existingPlan.id>`. El builder RN publica plan NUEVO con
   `planId = first(params.planId) ?? null` (`:241`) y el `href` del hub pasa SOLO `clientId` (u12, hallazgo c) →
   en la práctica `planId` de params es SIEMPRE null. El plan vigente REAL se conoce por `existingPlan`, que RN
   **fetchea localmente** (`getNutritionClientDetailV2`, `:301-318`) — igual que la fuente que web recibe
   server-side. **Delta de plataforma (sin homólogo web):** como `existingPlan` resuelve ASÍNCRONO (arranca en
   `null` y se setea en el `.then`/`.catch`), keyear con `existingPlan?.id ?? null` haría que la key transicione
   de `…:new` a `…:<id>` a mitad de sesión → el autosave escribiría primero bajo `…:new` y luego bajo `…:<id>`,
   **orfanando** un borrador, y el read de montar podría leer la key equivocada y **no ofrecer** el borrador
   correcto. Solución: agregar un flag `existingPlanResolved` (seteado en el `.then` Y el `.catch` del fetch,
   `:305-314`); **gatear** tanto el efecto de montar (read+banner) como el autosave detrás de
   `existingPlanResolved` para que la key sea ESTABLE antes de cualquier lectura/escritura. Mientras no resuelve:
   el `sweep` de higiene puede correr igual (no depende de la key), pero NO se lee/ofrece ni se escribe.
   Espejar la validación web `record.payload.clientId === clientId` (`:1091`) al ofrecer el banner.
   Cierre: `draftKey = builderDraftKey(clientId, existingPlan?.id ?? null)` (mismo criterio que web) + flag
   `existingPlanResolved` que gatea read y autosave, para neutralizar la inestabilidad de key que el fetch async
   introduce. Documentar la trampa para el juez (el web no la tiene).

4. **Acción `RESTORE` inexistente en el reducer del builder — agregarla, espejo literal del web.**
   Web `draft-builder.ts:168` declara `| { type: 'RESTORE'; state: BuilderState }` y `:252-261` la maneja
   reemplazando TODO el árbol con guarda defensiva: `if (next == null || typeof next !== 'object' ||
   !Array.isArray(next.slots)) return state` y re-clamp de `step` (`Number.isFinite(next.step) ?
   clampStep(next.step) : 0`) contra JSON persistido con índice fuera de rango. RN `BuilderAction`
   (`nutrition-v2-builder.ts:171-187`) **no tiene `RESTORE`** (solo `SET_STEP`/`NEXT_STEP`/`PREV_STEP` y las de
   contenido). `clampStep` (`:189-190`, rango `[0, BUILDER_STEP_COUNT-1]` con `BUILDER_STEP_COUNT = 4`, `:123`)
   YA existe. **Delta:** agregar `| { type: 'RESTORE'; state: BuilderState }` al union y el `case 'RESTORE'` al
   `builderReducer` con la MISMA guarda defensiva (`Array.isArray(next.slots)` + re-clamp de `step`), verbatim
   del web.
   Cierre: acción `RESTORE` nueva que reemplaza el árbol completo, con guarda `Array.isArray` y re-clamp de step.

5. **`restoreBySlot` en el controlador de porciones + precarga de grupos al restaurar.**
   Web `handleRestoreDraft:1165-1176`: `dispatch({ type: 'RESTORE', state: payload.state })` +
   `portions.restoreBySlot(payload.portionsBySlot ?? {})` + `if (strategyUsesSlots(payload.state.strategy))
   portions.ensureGroupsLoaded()` (el catálogo de grupos NO se persiste; se precarga para que las filas de
   porciones muestren nombre/color en vez del fallback). RN `usePortionsBuilder` (`:170-234`) expone
   `addGroup`/`removeGroup`/`step`/`ensureGroupsLoaded`/`retryGroups` pero **NO** `restoreBySlot`.
   `ensureGroupsLoaded` (`:215-217`) y `strategyUsesSlots` (`nutrition-v2-builder.ts:125-127`) YA existen.
   **Delta:** agregar `restoreBySlot: (map: PortionsBySlot) => void` al controlador (`setBySlot(map)`) y a la
   interfaz `PortionsController` (`:170-182`); en el handler Restaurar, tras el `dispatch({ type: 'RESTORE' })`,
   llamar `portions.restoreBySlot(payload.portionsBySlot ?? {})` y, si `strategyUsesSlots(payload.state.strategy)`,
   `portions.ensureGroupsLoaded()`.
   Cierre: `restoreBySlot` nuevo en `usePortionsBuilder`; el handler Restaurar rehidrata las porciones y precarga
   el catálogo de grupos si el plan usa franjas.

6. **Guard de salida NUEVO — pero warn-only, sin destruir el borrador (rol distinto al del quick-edit).**
   Web `:1122-1130`: `beforeunload` gateado por `builderHasSignificantContent(state)`; el comentario `:1120-1121`
   aclara "solo el aviso nativo; el respaldo real lo hace el autosave". **Punto clave verificado:** el guard del
   builder web **NO borra el borrador** — las ÚNICAS limpiezas son `goToPublished` (`:1160`, publish OK) y
   `handleDiscardDraft` (`:1179`, X del banner). Salir/navegar deja el borrador vivo para ofrecer "Restaurar" la
   próxima vez. Esto **difiere** del quick-edit (4B-14 afirmación 8), que SÍ limpia en discard/exit bajo un
   guard. RN builder hoy no tiene guard (grep `BackHandler` = 0). **Delta:** agregar un guard nativo
   (`BackHandler.addEventListener('hardwareBackPress', …)` en un `useEffect`, patrón ya sancionado en el
   quick-edit) que, solo si `builderHasSignificantContent(state)`, muestre `Alert.alert` con el copy LITERAL web
   `LEAVE_GUARD_COPY = 'Tienes un borrador sin publicar. ¿Salir y descartarlo?'` (`:1040`) y botones "Seguir
   editando" (cancel, retorna `true` = intercepta el back) / "Salir" (deja pasar el back). **"Salir" NO llama
   `clearNutritionDraft`** — el autosave ya persistió el borrador y el banner lo ofrecerá al volver, exactamente
   como en web (donde `beforeunload` tampoco borra nada de localStorage). El copy dice "¿descartarlo?" por
   fidelidad literal, pero el comportamiento real (autosave persiste) es idéntico web↔RN: el borrador sobrevive.
   Cierre: guard `BackHandler`+`Alert` warn-only con el copy verbatim; salir NO borra el borrador (solo publish
   OK / X del banner lo borran).

7. **Autosave debounced 2000 ms (no 1500) + guard de primer render + limpieza si se vacía.**
   Web `:1100-1117`: guard `isFirstRender` (no crea borrador vacío al hidratar), `setTimeout` **2000 ms**,
   `if (builderHasSignificantContent(state)) writeNutritionDraft({ clientId, planId: existingPlan?.id ?? null,
   state, portionsBySlot: portions.bySlot }, Date.now()) else clearNutritionDraft(draftKey)`, cleanup
   `clearTimeout`. Deps: `[state, portions.bySlot, draftKey, clientId, existingPlan?.id]`. **Delta de valor
   verificado:** el builder usa **2000 ms**, distinto de los **1500 ms** del quick-edit (4B-14 afirmación 6) —
   no confundir. RN: replicar con `useRef(true)` para el primer render, debounce 2000 ms, escribir el payload de
   afirmación 2 si `builderHasSignificantContent(state)` (afirmación 8) else `clear`; como AsyncStorage es async,
   disparar `void write/clear` sin bloquear el render; gatear todo el efecto detrás de `existingPlanResolved`
   (afirmación 3). Deps del efecto: `state`, `portions.bySlot`, `draftKey`, `existingPlanResolved`.
   Cierre: autosave debounced 2000 ms con guard de primer render; escribe con contenido, borra si se vacía.

8. **`builderHasSignificantContent` — portar la función pura (hoy inline en el componente web).**
   Web `:1033-1038`: `true` si `state.strategy !== null`, o `state.planName.trim() !== ''`, o `state.slots.length
   > 0`, o alguna de las 4 metas (`calories`/`proteinG`/`carbsG`/`fatsG`) `.trim() !== ''`. Evita autosave (y
   aviso de salida) por un wizard recién abierto o vaciado. RN: **no existe** (grep 0). `BuilderState`
   (`nutrition-v2-builder.ts:113-121`) tiene `strategy`/`planName`/`slots`/`targets` con las mismas claves →
   port directo. **Delta:** agregar `builderHasSignificantContent(state: BuilderState): boolean` a
   `nutrition-v2-builder.ts` (pura, testeable), verbatim del web; consumirla en el autosave (afirmación 7) y en
   el guard de salida (afirmación 6). (Web la tiene inline; en RN va a la lib por reuso + test — misma decisión
   que otras helpers puras del builder.)
   Cierre: `builderHasSignificantContent` en la lib, idéntica al web; usada por autosave y guard.

9. **Banner Restaurar con copys VERBATIM del builder web (distintos de los del quick-edit).**
   Web `:1344-1364`: si `showDraftBanner`, card `border-primary/25 bg-primary/10` con icono `History`, texto
   **"Tienes un borrador sin guardar de esta sesión."** (`:1348`), botón **"Restaurar"** (`:1351`) →
   `handleRestoreDraft`, y botón X con `aria-label` **"Descartar borrador"** (`:1356`) → `handleDiscardDraft`.
   **Ojo:** estos copys son DISTINTOS de los del quick-edit (4B-14: "Tienes cambios sin publicar de una sesión
   anterior." / "Restaurar" / "Descartar borrador") — el primer texto difiere; usar el del BUILDER. RN importa
   `X` de `lucide-react-native` (`:15`) pero **NO `History`** → agregarlo al import. **Delta:** pintar el banner
   al tope del contenido del wizard (dentro del `ScrollView`, antes del stepper/pasos), con tokens EVA DS
   (`bg-primary/10`, `border-primary/25`, `text-primary`) e íconos `History`/`X`, `useTheme()` (nada
   hardcodeado — white-label). Botón X = target ≥44px, `accessibilityLabel="Descartar borrador"`.
   Cierre: banner nativo con el copy del builder verbatim; Restaurar rehidrata ambos estados, X descarta el
   borrador.

10. **Limpieza en publish OK — en AMBAS ramas (normal y "Archivar y reemplazar").**
    Web centraliza la limpieza en `goToPublished` (`:1159-1162`): `clearNutritionDraft(draftKey)` y luego
    `router.push(.../${clientId}?published=1)`; lo llaman las DOS ramas de éxito (publish normal y
    `handleReplaceToday`). RN tiene DOS navegaciones de éxito que hoy **NO limpian**: `handlePublish` (`:401`
    `router.replace(.../${clientId}?published=1)`) y `handleReplaceToday` (`:488`, misma navegación). **Delta:**
    crear un helper `goToPublished()` que dispare `void clearNutritionDraft(draftKey)` (best-effort, sin `await`
    — la pantalla se desmonta al navegar) y luego `router.replace(.../${clientId}?published=1)`, y usarlo en
    AMBOS puntos. El plan ya está en el servidor → el borrador local sobra.
    Cierre: `goToPublished` limpia el borrador antes de navegar; usado por publish normal y por
    archivar-y-reemplazar.

11. **`handleDiscardDraft` — X del banner borra el borrador (único borrado explícito, aparte de publish OK).**
    Web `:1178-1182`: `clearNutritionDraft(draftKey)` + `draftPayloadRef.current = null` + `setShowDraftBanner(false)`.
    RN: espejar — `void clearNutritionDraft(draftKey)`, limpiar el ref del payload, ocultar el banner. Junto con
    `goToPublished` (afirmación 10) son los DOS únicos borrados; el guard de salida NO borra (afirmación 6).
    Cierre: X del banner borra la key y baja el banner.

12. **TTL 7 días + tope de tamaño + sweep al montar — heredados del store (sin re-implementar).**
    El store (`nutrition-coach-draft-store.ts`, ya existente) fija `NUTRITION_DRAFT_MAX_AGE_MS = 7d` (`:25`) y
    `MAX_SERIALIZED_CHARS = 450_000` (`:28`); `read`/`sweep` descartan vencidos, `write` rechaza payloads
    gigantes. **Delta:** cero cambios en el store; esta unidad solo llama `sweepStaleNutritionDrafts(Date.now())`
    al montar (higiene global de AMBOS prefijos, `:112-130`) — igual que web `:1089` y que 4B-14 en el
    quick-edit.
    Cierre: sweep al montar; TTL y tope vienen del store, intocados.

13. **Sin RN-extras nuevos (decisión owner 4).** Porte 1:1 del wiring web del builder. Las únicas divergencias
    son de PLATAFORMA (AsyncStorage async, afirmación 1/7) y ARQUITECTURA RN (dos estados: reducer + porciones
    en `useState`, afirmaciones 2/5; `existingPlan` async, afirmación 3), todas forzadas y documentadas. **Nada
    que retirar.** El store NO se re-crea (es de 4B-14).

## Cierre (qué debe quedar)

1. `apps/mobile/lib/nutrition-v2-builder.ts`:
   - Acción `| { type: 'RESTORE'; state: BuilderState }` en `BuilderAction` + `case 'RESTORE'` en
     `builderReducer` con guarda `Array.isArray(next.slots)` + re-clamp de `step` (`clampStep`), verbatim del web
     `draft-builder.ts:252-261`.
   - Función pura `builderHasSignificantContent(state: BuilderState): boolean` (espejo de
     `PlanBuilderClient.tsx:1033-1038`).
2. `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx`:
   - `usePortionsBuilder`: nuevo `restoreBySlot(map: PortionsBySlot)` (`setBySlot(map)`) en la interfaz
     `PortionsController` y el `return`.
   - `existingPlanResolved` (flag seteado en el `.then` Y el `.catch` del fetch de `existingPlan`).
   - `draftKey = useMemo(() => builderDraftKey(clientId, existingPlan?.id ?? null), [clientId, existingPlan?.id])`
     + refs `showDraftBanner`/`draftPayloadRef`/`isFirstRender`.
   - Efecto de montar: `void sweepStaleNutritionDrafts(Date.now())`; **gateado por `existingPlanResolved`**:
     `read` + validar `payload.clientId === clientId` → guarda el payload en el ref + `setShowDraftBanner(true)`
     (con `mountedRef` para el timing async, sin flash).
   - Autosave debounced **2000 ms** con guard de primer render, **gateado por `existingPlanResolved`**: si
     `builderHasSignificantContent(state)` → `void writeNutritionDraft({ clientId, planId: existingPlan?.id ??
     null, state, portionsBySlot: portions.bySlot }, Date.now())`; si no → `void clearNutritionDraft(draftKey)`.
   - Guard de salida `BackHandler`+`Alert` warn-only (copy `LEAVE_GUARD_COPY` verbatim), solo si
     `builderHasSignificantContent(state)`; "Salir" NO borra el borrador.
   - `handleRestoreDraft` (dispatch `RESTORE` + `portions.restoreBySlot` + `ensureGroupsLoaded` si el plan usa
     franjas) / `handleDiscardDraft` (clear + baja banner + limpia ref).
   - `goToPublished` (clear + `router.replace`) usado en `handlePublish` (`:401`) y `handleReplaceToday` (`:488`).
   - Banner Restaurar al tope del contenido (icono `History` — agregar al import de `lucide-react-native`; `X` ya
     importado), tokens EVA DS + `useTheme`, botón X ≥44px con `accessibilityLabel="Descartar borrador"`.
   - `BackHandler` agregado al import de `react-native` (`:2-12`).
3. `apps/mobile/lib/nutrition-coach-draft-store.ts`: **INTOCADO** (primitiva de 4B-14; solo se consume).
4. F-02 (4B-10), porciones (4B-11) y permisos/catálogo/archivar (4B-12) **intocados**: sin diffs en
   `SubstitutionsField`/`BuilderItem.substitutions`, `PortionsSection`/`PortionsDeriveCard`/`PortionsReviewSection`,
   ni en el editor de permisos / `createCoachFoodV2` / `handleReplaceToday` (salvo el punto `goToPublished` que se
   inyecta en su navegación de éxito).
5. Tests: unitario del `case 'RESTORE'` del reducer (payload válido reemplaza el árbol y re-clampa step; payload
   sin `slots` array → devuelve `state` intacto; step no-finito → 0) y de `builderHasSignificantContent` (vacío
   → false; con strategy/planName/slots/alguna meta → true). El store ya está cubierto por los 14 tests de 4B-14.
6. Gates de módulo: `pnpm --filter @eva/mobile exec tsc --noEmit` 0 errores, `pnpm exec eslint` 0 nuevos,
   `pnpm check:tokens` OK, y los tests nuevos verdes.

Regla RN-extras (decisión owner 4): esta unidad NO introduce extras sin contraparte web. Cualquier afordancia RN
adicional que aparezca al codificar = RETIRAR salvo excepción escrita.

## Comprobación objetiva

Con el builder abierto para un alumno: elegir estrategia, poner nombre y agregar una franja con porciones;
esperar >2 s; matar la app → reabrir el builder del MISMO alumno → aparece el banner **"Tienes un borrador sin
guardar de esta sesión."** con **"Restaurar"** y la X **"Descartar borrador"**; tocar "Restaurar" rehidrata el
árbol del wizard (paso, estrategia, nombre, franjas, ítems) Y las porciones a elección (nombre/color de grupos
visibles, no fallback), y el resumen del día vuelve a reflejar los totales; tocar la X borra el borrador y ya no
reaparece. Vaciar todo (quitar estrategia/nombre/franjas) borra el borrador (autosave limpia). Publicar con éxito
—rama normal Y rama "Archivar y reemplazar"— borra el borrador (reabrir → sin banner). Con contenido
significativo, el back de hardware muestra el `Alert` "Tienes un borrador sin publicar. ¿Salir y descartarlo?"
con "Seguir editando"/"Salir"; "Salir" deja la pantalla pero el borrador SOBREVIVE (reabrir → banner presente,
mismo comportamiento que el `beforeunload` web). Un borrador de >7 días no se ofrece (TTL) y el `sweep` lo
elimina. La key del borrador de "plan nuevo" vs "nueva versión del plan X" no se pisan (prefijo + `clientId` +
`planId`/`new`). Captura web móvil (banner Restaurar del builder) vs RN: comparar copy, disposición y
comportamiento. Gates: `pnpm --filter @eva/mobile exec tsc --noEmit`, `pnpm exec eslint`, `pnpm check:tokens`, y
los tests nuevos del reducer + `builderHasSignificantContent`.

## Cierre (2026-07-22)

Portado 1:1 el respaldo local del builder RN sobre la primitiva de 4B-14 (store INTOCADO). Entregado:

- **`apps/mobile/lib/nutrition-v2-builder.ts`**: acción `| { type: 'RESTORE'; state: BuilderState }` en
  `BuilderAction` + `case 'RESTORE'` en `builderReducer` con la guarda defensiva verbatim del web
  (`Array.isArray(next.slots)` + re-clamp de `step` vía `clampStep`, `NaN`→0). Función pura
  `builderHasSignificantContent(state)` (espejo de `PlanBuilderClient.tsx:1033-1038`), exportada y testeada.
- **`apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx`**:
  - `usePortionsBuilder`: nuevo `restoreBySlot(map)` (`setBySlot(map)`) en la interfaz `PortionsController` y el
    `return` — par obligado del `RESTORE` para no perder las porciones a elección.
  - **Trampa async neutralizada**: flag `existingPlanResolved` (seteado en el `.then` Y el `.catch` del fetch de
    `existingPlan`); `draftKey = useMemo(builderDraftKey(clientId, existingPlan?.id ?? null))`; el efecto de lectura
    (read+banner) y el autosave están GATEADOS por `existingPlanResolved` → la key nunca muta `…:new`→`…:<id>` a
    mitad de sesión. El `sweep` de higiene corre al montar sin gate (no depende de la key).
  - Autosave debounced **2000 ms** (no 1500) con guard de primer render; escribe el payload
    `{ clientId, planId, state, portionsBySlot }` si hay contenido significativo, si no `clearNutritionDraft`.
  - Guard de salida `BackHandler`+`Alert` **warn-only** con `LEAVE_GUARD_COPY` verbatim (`:1040`); "Salir" hace
    `router.back()` y **NO** borra el borrador (sobrevive para el banner de la próxima sesión).
  - `handleRestoreDraft` (dispatch `RESTORE` + `portions.restoreBySlot` + `ensureGroupsLoaded` si usa franjas) /
    `handleDiscardDraft` (clear + baja banner + limpia ref).
  - `goToPublished` (clear + `router.replace`) inyectado en **AMBAS** ramas de éxito (`handlePublish` y
    `handleReplaceToday`).
  - Banner Restaurar al tope del `ScrollView` con tokens EVA DS (`bg-primary/10`, `border-primary/25`,
    `text-primary`), iconos `History`/`X` coloreados con `theme.primary` (white-label), X con target 44px y
    `accessibilityLabel="Descartar borrador"`.
- **Tests** (`tests/mobile-nutrition-v2-builder.test.ts`): 11 nuevos — `RESTORE` (reemplazo total + re-clamp,
  round-trip JSON del payload con `portionsBySlot`, payload sin `slots` array → `state` intacto, step no-finito→0,
  step fuera de rango→3) y `builderHasSignificantContent` (vacío→false, strategy/planName/slots/meta→true,
  planName solo-espacios→false).

Store `nutrition-coach-draft-store.ts` INTOCADO (propiedad de 4B-14). Ningún RN-extra nuevo.

**Gates (verdes):** `tsc --noEmit` 0 errores; `vitest run` builder + draft-store = 55/55; `eslint` de los 3
archivos = 3 problemas baseline (`ChevronLeft`/`ChevronRight` unused + `useMemo(todayInSantiago)`), **0 nuevos**;
`check:tokens` OK (86 tokens). Pendiente NO-código: build nativa + device QA del CEO (autosave/restore/back real).
