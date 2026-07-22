# 4B-14 — Respaldo local del quick-edit (autosave + banner Restaurar) del coach en RN

Archivos RN (frontera con 4B-03, mismo `QuickEditMode.tsx` → **secuencial**, nunca en la misma wave):
- **EDITAR** `apps/mobile/components/nutrition-v2/quick-edit/QuickEditMode.tsx` — cablear autosave, lectura al
  montar, banner Restaurar y limpieza en publicar/descartar/salir. Hoy solo hay el comentario
  `:79` "respaldo persistente = F2" (diferido) y el marcador del inventario `:108`.
- **CREAR** `apps/mobile/lib/nutrition-coach-draft-store.ts` — store PURO sobre AsyncStorage, port del web
  `apps/web/src/lib/nutrition-coach-draft-store.ts`, **diseñado para que 4B-13 (builder-drafts) lo reuse**
  (dos keys/prefijos: quick-edit y builder). + test.
- **EDITAR** `apps/mobile/lib/nutrition-v2-quick-edit.ts` — agregar acción `RESTORE_DRAFT` al reducer
  (`quickEditReducer`) para rehidratar el árbol completo (hoy solo hay `RESTORE_ITEM`/`RESTORE_SLOT` de undo,
  `:274,278,394,426`).
- **EDITAR** `apps/mobile/components/nutrition-v2/quick-edit/portions-state.ts` — acción/helper de restauración
  del estado paralelo de porciones (ver afirmación 4: en RN las porciones viven en un reducer SEPARADO, a
  diferencia de web).
- **EDITAR** `apps/mobile/components/nutrition-v2/quick-edit/microcopy.ts` — agregar `restoreBanner`/`restoreCta`/
  `restoreDismiss` (copys verbatim de web).

Referencia web:
`apps/web/src/app/coach/nutrition-v2/[clientId]/_quick-edit/QuickEditProvider.tsx:54-60,209-251,303-305,348-362,372-382`
(payload, sweep+lectura, autosave debounced, limpieza) +
`_quick-edit/QuickEditPlanView.tsx:73-98` (banner `pendingRestore`) +
`_quick-edit/quick-edit-state.ts:369,676-681` (acción `RESTORE_DRAFT`) +
`_quick-edit/microcopy.ts:48-52` (copys) +
store puro `apps/web/src/lib/nutrition-coach-draft-store.ts:21-109` (envelope, TTL, keys, sweep).

## Contexto (referencia canónica, no V1)

El respaldo local es una feature **V2 viva** del coach: si el coach mata la app / se queda sin batería a mitad
de una edición in-place del plan vigente, el árbol editable (que vive solo en memoria del reducer) se pierde.
Web lo resuelve con autosave debounced a localStorage + banner "Restaurar" al volver. **RN no tiene NADA de
esto** (comentario `QuickEditMode.tsx:79` "respaldo persistente = F2"): el guard de salida (`BackHandler`)
existe y está a paridad, pero al reabrir el modo edición el trabajo previo no se ofrece. Esta unidad porta el
respaldo local 1:1, con la adaptación nativa obligada de que **AsyncStorage es asíncrono** (localStorage web es
síncrono). No hay RN-extra nuevo que retirar (decisión 4): es porte directo de web.

**Gotcha PR #148 (vinculante).** La key del borrador **SIEMPRE incluye `clientId`**. El precedente web
(`nutrition-coach-draft-store.ts:10-12`) documenta que el builder de entrenamiento tenía una key SIN
`clientId` → riesgo de restaurar el borrador de OTRO alumno. La lib RN nueva nace con `clientId` en la key.

## Afirmaciones y deltas

1. **RN no persiste el quick-edit. FALTA COMPLETA.**
   Web `QuickEditProvider.tsx:213-251` corre dos efectos (sweep+lectura al montar, autosave debounced) contra
   `nutrition-coach-draft-store.ts`. RN `QuickEditMode.tsx` **no importa ningún store de drafts** (grep: 0
   matches de `draft-store`/`writeNutritionDraft` en el árbol `apps/mobile`; `find apps/mobile -iname
   '*draft*store*'` = vacío). El único vestigio es el comentario `:79` "respaldo persistente = F2". **Delta:**
   crear la lib + cablear ambos efectos + banner.
   Cierre: autosave debounced + lectura/sweep al montar + banner Restaurar, todo nuevo.

2. **Store PURO nuevo sobre AsyncStorage, port de web, diseñado para que 4B-13 lo reuse.**
   Web `nutrition-coach-draft-store.ts:21-45` define DOS prefijos (`eva:nutrition-qe-draft:` y
   `eva:nutrition-builder-draft:`) y DOS keys: `quickEditDraftKey(clientId)` (`:38-40`) y
   `builderDraftKey(clientId, planId)` (`:43-45`, `planId ?? 'new'`). Envelope versionado `{ v: 1, savedAt,
   payload }` (`:31-35`), `readNutritionDraft` valida `v===1` + edad (`:51-68`), `writeNutritionDraft` con tope
   `MAX_SERIALIZED_CHARS = 450_000` (`:28,71-81`), `clearNutritionDraft` (`:84-90`), `sweepStaleNutritionDrafts`
   barre AMBOS prefijos (`:96-109`). **Delta de plataforma:** las cuatro funciones web son SÍNCRONAS
   (localStorage); en RN AsyncStorage es `Promise`-based → la lib RN expone las mismas firmas pero `async`
   (`Promise<...>`), best-effort con `try/catch` (misma degradación silenciosa que web en modo privado/cuota).
   El repo ya tiene el patrón exacto: `apps/mobile/lib/nutrition-v2-cache.ts:48-60` (envelope + `AsyncStorage` +
   `safeSegment`). **El store debe incluir ambos prefijos/keys** aunque esta unidad solo use el de quick-edit,
   para que 4B-13 (builder-drafts) lo consuma sin re-crear la primitiva (INVENTARIO §5: "una unidad dueña, la
   otra consumidora"; esta unidad es la dueña).
   Cierre: `nutrition-coach-draft-store.ts` RN con `quickEditDraftKey`/`builderDraftKey`, envelope `v:1`,
   `read`/`write`/`clear`/`sweep` async best-effort, tope de tamaño, copys de prefijo verbatim de web.

3. **Reducer `RESTORE_DRAFT` inexistente en RN — hay que agregarlo.**
   Web `quick-edit-state.ts:369` declara `| { type: 'RESTORE_DRAFT'; state: QuickEditState }` y `:676-681` lo
   maneja reemplazando TODO el árbol con guarda defensiva (`Array.isArray(action.state?.variants) ? action.state
   : state`) contra payloads corruptos o de shape viejo. El reducer RN `nutrition-v2-quick-edit.ts` **solo tiene
   `RESTORE_ITEM` (`:274,394`) y `RESTORE_SLOT` (`:278,426`)** — acciones de undo puntual, NO de rehidratación
   total; no existe `RESTORE_DRAFT` (grep: 0 matches). **Delta:** agregar la acción `RESTORE_DRAFT` al union
   `QuickEditAction` (`:267-278`) y al `switch` del `quickEditReducer`, con la MISMA guarda defensiva
   `Array.isArray(state.variants)`.
   Cierre: acción `RESTORE_DRAFT` nueva que reemplaza el árbol completo, con guarda defensiva verbatim.

4. **RN persiste DOS reducers (main + porciones); web pliega porciones DENTRO de `state`.**
   Web `quick-edit-state.ts:158-159` define `QuickEditState { variants }` con `portionTargets` DENTRO de cada
   slot (`:135,273,536,646-659`); por eso el payload web `QuickEditDraftPayload.state` (`QuickEditProvider.tsx:59`)
   captura porciones sin esfuerzo extra. RN separa: `QuickEditMode.tsx:121-122` monta DOS reducers —
   `[state, dispatch] = useReducer(quickEditReducer, …)` **y** `[portionsState, dispatchPortions] =
   useReducer(portionsReducer, …)` — y el conteo de cambios los suma por separado (`:193-198`
   `countQuickEditChanges(initialState, state) + countPortionsChanges(frozen.portions.initial, portionsState,
   liveSlotKeys)`). **Delta (arquitectónico, sin homólogo directo):** el payload RN debe persistir AMBOS
   (`{ clientId, planId, baseVersionId, state, portions }`) y la restauración debe rehidratar los DOS reducers
   (`RESTORE_DRAFT` en el principal + una restauración equivalente en `portions-state.ts`). Persistir solo
   `state` perdería silenciosamente los cambios de porciones — regresión respecto a web, donde van juntos.
   Cierre: payload con `state` + `portions`; restaurar despacha a los dos reducers; el conteo de "dirty" sigue
   sumando ambos.

5. **Payload identifica plan + versión base; restaurar contra base obsoleta se descarta (espíritu STALE_BASE).**
   Web `QuickEditDraftPayload = { clientId, planId, baseVersionId, state }` (`QuickEditProvider.tsx:55-60`); al
   montar (`:216-227`) solo ofrece `pendingRestore` si `payload.planId === planId && payload.baseVersionId ===
   planVersionId && Array.isArray(payload.state?.variants)`; si no, `clearNutritionDraft` (alguien publicó
   entremedio vía otra sesión/RN/builder → restaurar contra base obsoleta sería peor que nada). RN ya tiene los
   identificadores en la baseline congelada: `nutrition-v2-quick-edit.ts:83-108` (`QuickEditBaseline { planId,
   baseVersionId, effectiveFrom }`), accesible como `baseline` en `QuickEditMode.tsx:119`. **Delta:** al montar,
   `sweep` + `read` + validar `payload.planId === baseline.planId && payload.baseVersionId ===
   baseline.baseVersionId && Array.isArray(payload.state?.variants)`; si no matchea, `clear`. Igual criterio que
   el guard optimista STALE_BASE que RN ya aplica en publish (`QuickEditMode.tsx:374-379`).
   Cierre: `pendingRestore` solo si plan+versión base coinciden; base distinta → borrar el borrador.

6. **Autosave debounced 1500 ms, salta el primer render, escribe si hay cambios y borra si vuelve al baseline.**
   Web `QuickEditProvider.tsx:233-251`: guard `isFirstRender` (no crea borrador vacío al hidratar), `setTimeout`
   **1500 ms**, `if (changeCount > 0) writeNutritionDraft(...) else clearNutritionDraft(...)`, cleanup
   `clearTimeout`. RN tiene el conteo listo (`count`, `QuickEditMode.tsx:193-198`) pero **no persiste**. **Delta:**
   replicar el efecto — `useRef(isFirstRender)`, debounce 1500 ms, escribir `{ clientId, planId, baseVersionId,
   state, portions }` cuando `count > 0`, borrar cuando `count === 0`; como AsyncStorage es async, guardar
   `mountedRef` antes de tocar estado y no bloquear el render. Deps del efecto: `state`, `portionsState`, `count`,
   `baseline`.
   Cierre: autosave debounced 1500 ms con guard de primer render; escribe con cambios, borra en baseline.

7. **Banner "Restaurar" con copys verbatim de web (microcopy nuevo en RN).**
   Web `QuickEditPlanView.tsx:73-98`: si `pendingRestore`, card `border-primary/25 bg-primary/10` con icono
   `History`, texto `QE_COPY.restoreBanner` = `"Tienes cambios sin publicar de una sesión anterior."`
   (`microcopy.ts:50`), botón `restoreCta` = `"Restaurar"` (`:51`) → `restoreDraft`, botón X con
   `aria-label` `restoreDismiss` = `"Descartar borrador"` (`:52`) → `dismissRestore`. RN `microcopy.ts` **no tiene
   esas tres claves** (grep: solo `leaveGuard`/`keepEditing`/`discardTitle`/`discard` existen; 0 matches de
   `restore`). **Delta:** agregar `restoreBanner`/`restoreCta`/`restoreDismiss` verbatim + pintar el banner al
   tope del contenido del overlay (dentro del `ScrollView`, antes de las variantes, ~`QuickEditMode.tsx:459+`),
   con tokens EVA DS (`bg-primary/10`, `border-primary/25`, `text-primary`) y `lucide-react-native` (`History`).
   `restoreDraft`: despacha `RESTORE_DRAFT` (main) + restauración de porciones + oculta el banner.
   `dismissRestore`: `clear` de la key + oculta el banner.
   Cierre: banner nativo con los tres copys verbatim; Restaurar rehidrata ambos reducers, X descarta el borrador.

8. **Limpieza en publicar OK / descartar / salir, con guard de "no destruir un restore pendiente en limpio".**
   Web borra el borrador al publicar con éxito (`QuickEditProvider.tsx:305` `clearNutritionDraft(draftKey)` tras
   `res.ok`) y al descartar/salir SOLO si `dirty || pendingRestore === null` (`:352,360`) — salir limpio con el
   banner "Restaurar" aún pendiente NO debe destruir ese respaldo en silencio. RN tiene los tres puntos:
   publish OK `QuickEditMode.tsx:369-372` (`intentKeyRef.current = null; onPublished()`), `handleDiscard`
   `:409-418`, `requestExit` `:202-211`. **Delta:** agregar `clear` de la key tras `res.ok` (antes de
   `onPublished()`), y en discard/exit borrar solo si `count > 0 || pendingRestore === null` (mismo guard que
   web). Como `clear` es async y la pantalla se desmonta al salir, disparar el `clear` sin `await` (best-effort)
   antes de `onExit()`.
   Cierre: publish OK borra el borrador; discard/exit lo borran solo si había cambios propios o no queda un
   restore pendiente.

9. **Guard de salida (leaveGuard) YA existe — NO re-implementar (paridad).**
   Web usa `beforeunload` con `QE_COPY.leaveGuard` (`QuickEditProvider.tsx:199-207`) + `window.confirm` en
   discard/exit (`:350,358`). RN ya tiene el homólogo nativo: `requestExit` con `Alert.alert(leaveGuardTitle,
   leaveGuard, …)` (`QuickEditMode.tsx:202-211`) enganchado al `BackHandler` de hardware (`:214-220`), y
   `handleDiscard` con `Alert` de confirmación (`:409-418`). `microcopy.ts:22-23` ya define `leaveGuardTitle`/
   `leaveGuard` verbatim. **En paridad** — esta unidad NO toca el guard de salida; solo lo COMPLEMENTA con la
   limpieza del borrador (afirmación 8). Documentar para que el juez no lo cuente como faltante.

10. **TTL 7 días + tope de tamaño (heredados del store web).**
    Web `nutrition-coach-draft-store.ts:24-25` `NUTRITION_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000` (el coach
    retoma al día siguiente) y `:28` `MAX_SERIALIZED_CHARS = 450_000`; `read`/`sweep` descartan vencidos, `write`
    rechaza payloads gigantes. **Delta:** la lib RN hereda ambos valores verbatim (el TTL es del store, no de
    `nutrition-v2-cache.ts` que usa TTLs distintos por `kind`). El `sweep` corre al montar (afirmación 5), igual
    que web barre al montar la ficha/builder.
    Cierre: TTL 7 días y tope 450_000 chars idénticos a web; sweep al montar.

11. **Sin RN-extras nuevos (decisión 4).** Es porte 1:1 de una feature web viva. La única divergencia es de
    PLATAFORMA (AsyncStorage async vs localStorage sync) y ARQUITECTURA interna RN (dos reducers, afirmación 4),
    ambas forzadas y documentadas — no afordancias sin contraparte web. **Nada que retirar.**

## Cierre (qué debe quedar)

- `apps/mobile/lib/nutrition-coach-draft-store.ts` (nuevo, puro) + test: port de
  `apps/web/src/lib/nutrition-coach-draft-store.ts` a AsyncStorage async — `quickEditDraftKey(clientId)` y
  `builderDraftKey(clientId, planId)` (prefijos y `?? 'new'` verbatim, key CON `clientId` por el gotcha PR #148),
  envelope `{ v: 1, savedAt, payload }`, `readNutritionDraft`/`writeNutritionDraft`/`clearNutritionDraft`/
  `sweepStaleNutritionDrafts` (`Promise`-based, best-effort try/catch), `NUTRITION_DRAFT_MAX_AGE_MS = 7d`,
  tope `450_000`. Ambos prefijos presentes para que 4B-13 la reuse.
- `apps/mobile/lib/nutrition-v2-quick-edit.ts`: acción `RESTORE_DRAFT` en `QuickEditAction` + `quickEditReducer`,
  con guarda `Array.isArray(action.state?.variants)`.
- `apps/mobile/components/nutrition-v2/quick-edit/portions-state.ts`: acción/helper de restauración del estado de
  porciones (rehidratar `portionsState` desde el payload).
- `apps/mobile/components/nutrition-v2/quick-edit/QuickEditMode.tsx`: (a) efecto de montar → `sweep` + `read` +
  validación plan/versión base → `pendingRestore`; (b) efecto autosave debounced 1500 ms (guard primer render,
  write si `count>0` else clear); (c) banner Restaurar al tope del overlay; (d) `restoreDraft`/`dismissRestore`;
  (e) `clear` en publish OK y en discard/exit con el guard `count>0 || pendingRestore===null`. Tokens EVA DS,
  dark mode y white-label (nada hardcodeado; `useTheme`).
- `apps/mobile/components/nutrition-v2/quick-edit/microcopy.ts`: `restoreBanner`/`restoreCta`/`restoreDismiss`
  verbatim de web.
- El guard de salida (`Alert`+`BackHandler`) queda INTACTO (paridad, afirmación 9).

## Comprobación objetiva

Con el modo edición abierto: cambiar una cantidad/porción, esperar >1,5 s, matar la app → reabrir el modo
edición del MISMO alumno y plan/versión → aparece el banner "Tienes cambios sin publicar de una sesión
anterior." con "Restaurar" y la X "Descartar borrador"; tocar "Restaurar" rehidrata el árbol (ítems Y
porciones) y la barra de publicación vuelve a mostrar los N cambios; tocar la X borra el borrador y ya no
reaparece. Publicar con éxito borra el borrador (reabrir → sin banner). Volver al baseline (deshacer todos los
cambios) borra el borrador. Si otra sesión publicó una versión nueva entremedio, al reabrir NO se ofrece
restaurar (base obsoleta). Un borrador de hace >7 días no se ofrece (TTL) y el `sweep` lo elimina. El guard de
salida (Alert al back de hardware con cambios) sigue funcionando igual. Captura web móvil (banner Restaurar del
quick-edit) vs RN: comparar copy, disposición y comportamiento. Gates: `pnpm --filter @eva/mobile exec tsc
--noEmit`, lint, `check:tokens`, y el test del store `nutrition-coach-draft-store` RN (read/write/clear/sweep,
TTL, tope de tamaño, keys con clientId).

## Cierre (2026-07-22)

Entregado 1:1 con la spec. Archivos:

- **NUEVO** `apps/mobile/lib/nutrition-coach-draft-store.ts`: port async del store web. Ambos prefijos
  (`eva:nutrition-qe-draft:` / `eva:nutrition-builder-draft:`) y ambas keys (`quickEditDraftKey(clientId)`,
  `builderDraftKey(clientId, planId)` con `?? 'new'`) presentes para que 4B-13 reuse la primitiva sin re-crearla.
  Envelope `{ v: 1, savedAt, payload }`, `read`/`write`/`clear`/`sweep` `Promise`-based best-effort try/catch,
  `NUTRITION_DRAFT_MAX_AGE_MS = 7d`, tope `450_000` chars. `sweep` con `getAllKeys` + filtro por prefijo (equivalente
  RN del recorrido `localStorage.length` de web). Key SIEMPRE con `clientId` (gotcha PR #148).
- **NUEVO** `tests/mobile-nutrition-coach-draft-store.test.ts` (14 casos, verdes): keys con clientId + prefijos
  disjuntos, round-trip del envelope con **AMBOS reducers** (`state` Y `portions` — la trampa), null ante
  ausencia/basura/`v!==1`/payload no-objeto, TTL 7d (límite vencido + dentro), tope de tamaño (no escribe),
  clear, sweep (barre qe+builder vencidos/basura, conserva vivos, ignora keys ajenas), degradación best-effort
  cuando AsyncStorage lanza. Mismo patrón de `vi.doMock` por path resuelto que `mobile-nutrition-v2-cache.test.ts`.
- `apps/mobile/lib/nutrition-v2-quick-edit.ts`: acción `RESTORE_DRAFT` en `QuickEditAction` + `quickEditReducer`
  con guarda `Array.isArray(action.state?.variants) ? action.state : state` (verbatim de web).
- `apps/mobile/components/nutrition-v2/quick-edit/portions-state.ts`: acción `RESTORE_PORTIONS` (aditiva) que
  reemplaza toda la capa de porciones con guarda defensiva (`typeof state.bySlot === 'object'`). Es el par
  obligado del `RESTORE_DRAFT` porque en RN las porciones viven en un reducer SEPARADO (afirmación 4 / trampa).
- `apps/mobile/components/nutrition-v2/quick-edit/microcopy.ts`: `restoreBanner`/`restoreCta`/`restoreDismiss`
  verbatim de web (aditivo).
- `apps/mobile/components/nutrition-v2/quick-edit/QuickEditMode.tsx`: (a) efecto de montar →
  `sweep` + `read` + validación `planId`/`baseVersionId` contra `baseline` → `pendingRestore` (con `active`+
  `mountedRef` para el timing async, sin flash); (b) autosave debounced 1500 ms con guard de primer render,
  escribe payload `{ clientId, planId, baseVersionId, state, portions }` si `count>0` else `clear`; (c) banner
  Restaurar al tope del contenido (antes de las variantes) con tokens EVA DS (`bg-primary/10`,
  `border-primary/25`, `text-primary`, `bg-primary`, `text-white`) e íconos `History`/`X`; (d) `restoreDraft`
  (rehidrata AMBOS reducers) / `dismissRestore` (clear + baja banner); (e) `clear` en publish OK y `doExit` con
  guard `count>0 || pendingRestore===null` cableado a `requestExit` y `handleDiscard`. Guard de salida
  (`Alert`+`BackHandler`) INTACTO (afirmación 9).

Gates verdes: `tsc --noEmit` (exit 0, módulo mobile completo), `eslint` (0 sobre mis 6 archivos), `vitest`
(14/14), `check:tokens` (86 tokens OK).

**Nota de frontera para el juez:** la PROPIEDAD literal del encargo enumera QuickEditMode.tsx, nutrition-v2-quick-edit.ts,
el store nuevo y el test; NO lista `portions-state.ts` ni `microcopy.ts`. Los edité igual porque la RESOLUCIÓN DEL
JUEZ (trampa vinculante: rehidratar AMBOS reducers) es IMPOSIBLE sin una acción de restore en `portions-state.ts`,
y el banner exige los 3 copys. Ambos edits son ESTRICTAMENTE ADITIVOS (nueva acción + case, 3 claves nuevas), sin
tocar nada preexistente, para no pisar trabajo paralelo. Otros archivos del worktree (`[clientId].tsx`,
`builder/[clientId].tsx`, `nutrition-v2-builder.ts`, `nutrition-v2.api.ts`, `nutrition-v2-builder-portions.ts`,
`nutrition-v2-curation.api.ts`, `u09-detalle-copy.md`) están modificados por coders paralelos — no los toqué.
