# 4B-08 — Detalle del coach: acciones "Asignar a otros alumnos" + "Archivar plan vigente"

Archivos RN: `apps/mobile/app/coach/nutrition-v2/[clientId].tsx` (montar los dos disparadores +
sus diálogos), `apps/mobile/lib/nutrition-v2.api.ts` (nuevas acciones de escritura `assign`/
`archive` espejo de las server actions web), + lógica PURA compartible (ver delta 9). Unidad
que **comparte archivo** con 4B-09 (`[clientId].tsx`) → nunca en la misma wave (INVENTARIO §5,
sugerido 4B-08 → 4B-09).
Referencia web: `apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx` +
`_components/AssignPlanToClientsDialog.tsx` + `_components/ArchivePlanButton.tsx` +
`_actions/nutrition-assign.actions.ts` + `_actions/nutrition-archive.actions.ts` +
`_lib/assign-plan.ts` + `_lib/archive-plan.ts`.

## 0. Camino autoritativo (la UI nunca autoriza — verificado)

- **RN escribe DIRECTO contra Supabase con el cliente RLS de la sesión**, no vía API móvil. El
  builder RN ya publica así: `builder/[clientId].tsx:210-211` pasa `supabase as unknown as
  NutritionV2WriteClient` a `publishDraftRN`, que termina en `db.rpc('publish_nutrition_plan_v2', …)`
  (`nutrition-v2-builder.ts:1056-1061`). La ruta móvil del coach (`/api/mobile/nutrition-v2/coach`)
  es **solo lectura** (`coach/route.ts:31` `GET`; vistas `'hub'`/`'client'`, `:62,89`). Por eso
  las acciones nuevas de 4B-08 son escrituras PostgREST/RPC RLS-scoped, NO endpoints nuevos.
- **La barrera real es server-side en ambos lados.** Web: `authorizeCoach` re-verifica rollout/
  webCoach + scope, y la RLS (`publish_nutrition_plan_v2` / `nutrition_plans_v2_update` con
  `can_manage_client` / trigger `nutrition_v2_guard_plan_identity`) niega 42501 fuera del pool
  (`nutrition-assign.actions.ts:66-72`, `nutrition-archive.actions.ts:48-70`). RN hereda la misma
  barrera porque escribe con el cliente RLS de la sesión; `mapWriteError`/`classifyArchiveWrite`
  solo HUMANIZAN el fallo, no autorizan. El chequeo cliente (gate Pro, `canAssign`) es fricción,
  jamás autorización.
- **Escritura RLS ya cubierta en RN:** `persistAndPublishDraft` (`nutrition-v2-builder.ts:886`)
  resuelve idempotencia por `publish_idempotency_key`, inserta plan/versión/variantes/franjas/
  items y publica vía RPC; `mapWriteError` (`:810-829`) ya mapea 42501→`SCOPE_DENIED`,
  `effective_date_must_follow_current_version`→`EFFECTIVE_DATE`, etc. Reusar, no reescribir.

## Afirmaciones y deltas

### A. Asignar plan a otros alumnos (D-03 — FALTA por completo)

1. **Elegibilidad del CTA (`canAssign`).**
   Web `page.tsx:71-75` calcula `canAssignSourcePlan({ vigentePlanStatus: detail.plan.plan?.status,
   hasPlanStructure: detail.plan.plan !== null, variantCount: detail.plan.dayVariants.length })`;
   la regla pura (`_lib/assign-plan.ts:50-56`) exige `status === 'published'` **y** cabecera de plan
   **y** `variantCount > 0`. Sin eso NO se monta el trigger ni se carga el roster (`page.tsx:92`).
   RN `[clientId].tsx`: **no existe** ninguna afordancia de asignar.
   **Delta:** portar la MISMA condición pura como guarda del disparador; un plan `superseded` o sin
   variantes no ofrece asignar.
   Cierre: trigger visible solo cuando `canAssignSourcePlan(...)` es `true` (misma señal en vivo
   `detail.plan.plan` que gobierna el empty-state).

2. **Disparador secundario + placement.**
   Web: botón compacto `AssignPlanToClientsDialog.tsx:127-134` — icono `UserPlus` +
   copy **"Asignar a otros alumnos"** (`text-xs font-semibold`, borde `border-border-subtle`,
   `bg-surface-card`, `min-h-10`), montado en la **fila de estado del plan** a la derecha
   (`page.tsx:228-238`, contenedor `ml-auto`, junto a `StrategyBadge`/`PlanVersionBadge`), NO en el
   header (allí manda la CTA primaria de edición).
   RN: la fila de badges existe (`[clientId].tsx:280-289`) pero **sin acción a la derecha**.
   **Delta:** añadir el botón secundario en esa fila (tokens RN `border-border-subtle`/
   `bg-surface-card`/`text-text-body`, alto ≥44px, `accessibilityRole="button"` +
   `accessibilityLabel="Asignar a otros alumnos"`), gateado por delta 1.
   Cierre: botón "Asignar a otros alumnos" con icono candado/persona, secundario, en la fila de
   badges; nunca en el header.

3. **Carga del roster de destino.**
   Web `page.tsx:91-114`: solo si `canAssign`; pagina el hub scoped por keyset (`updatedAt`+
   `clientId`) hasta **8 páginas × 50**, **excluye al alumno fuente** (`item.clientId === clientId`),
   y marca `hasPlan = item.planStatus === 'published'`. Resultado `AssignRosterEntry[]`
   (`{ clientId, clientName, hasPlan }`, `AssignPlanToClientsDialog.tsx:21-25`).
   RN: `getNutritionCoachHubV2({ scope, cursorUpdatedAt, cursorClientId, pageSize })`
   (`nutrition-v2.api.ts:84-104`) **ya existe** y devuelve `items` con `clientId`/`clientName`/
   `planStatus` y `nextCursor`/`hasMore` (mismo read-model). El `scope` ya está resuelto en la
   pantalla (`[clientId].tsx:85-91`, fail-closed).
   **Delta:** portar el bucle de paginación (tope 8×50, excluir fuente, mapear `hasPlan`) usando el
   helper existente; cargar bajo demanda (al abrir el diálogo) o al montar si `canAssign`.
   Cierre: roster completo del workspace (paginado keyset, sin la fuente, badge "ya tiene plan"),
   misma fuente que el web.

4. **Contenido del diálogo de selección.**
   Web `AssignPlanToClientsDialog.tsx`: título **"Asignar plan a otros alumnos"** (`:139`);
   descripción "Se copiara la estructura de **{sourcePlanName}** a los alumnos que elijas. A quienes
   ya tengan un plan se les creara una nueva version vigente." (`:140-143`); buscador tolerante a
   acentos (`normalize` NFD, `:32-38,70-74`) con placeholder **"Buscar alumno…"** (`:219`); contador
   "N seleccionado(s)" + acciones **"Seleccionar visibles"** / **"Limpiar"** (`:224-238`); lista de
   filas con checkbox, nombre y, si `hasPlan`, insignia ámbar `AlertTriangle` **"Ya tiene plan"**
   (`:263-268`); sin coincidencias → "Sin coincidencias." (`:275`); roster vacío → bloque `Users`
   + **"No hay otros alumnos en tu espacio para asignar este plan."** (`:201-205`); campo **"Vigente
   desde"** (`:280-289`) + hint "Para quienes ya tienen plan, la fecha debe ser posterior a la de su
   version vigente." (`:290-292`); botón confirmar con label dinámico (`:308-312`):
   `"Asignando…"` (pending) / `"Selecciona alumnos"` (0) / **"Asignar a N alumno(s)"**; `disabled`
   con 0 seleccionados o pending; doble-submit bloqueado por `useTransition` (`:100-118`).
   RN: inexistente.
   **Delta:** portar el diálogo con TODOS esos copys y estados. Primitiva nativa: **`Sheet` con
   `nativeModal`** (patrón sancionado de `QuickEditSheets.tsx:32-61` — gorhom vetado) para el cuerpo;
   si el roster es largo, un `Modal animationType="slide"` a pantalla completa (patrón
   `FoodSearchModal`, `builder/[clientId].tsx:978`) es adaptación legítima. El buscador debe usar
   `normalize` tolerante a acentos (misma pieza pura). El campo "Vigente desde" reusa el patrón RN
   del builder: `LabeledInput` texto `YYYY-MM-DD` con hint (`builder/[clientId].tsx:536-542`) — RN no
   usa `<input type=date>`; esto es adaptación nativa ya sancionada, NO un delta.
   Cierre: diálogo con buscador acento-insensible, seleccionar-visibles/limpiar, badge "Ya tiene
   plan", campo "Vigente desde" YYYY-MM-DD + hint, y confirmar con label dinámico y anti-doble-submit.

5. **Acción de asignación (lógica de escritura + reporte parcial).**
   Web `nutrition-assign.actions.ts:53-147`: (a) `validateAssignTargets` (no vacío/duplicados/no la
   fuente/tope `MAX_ASSIGN_TARGETS=30`, `_lib/assign-plan.ts:80-98`); (b) `authorizeCoach`
   (re-gate); (c) carga la estructura FUENTE scoped (`getNutritionClientDetailV2ForWeb`, en RN el
   equivalente es `getNutritionClientDetailV2` que ya tiene el `detail` en pantalla); (d) guarda
   anti-stale por `sourcePlanVersion` (`:80-82`); (e) **gate Pro UNA vez** sobre el draft resultante
   (`requiredNutritionProFeature(probe.draft)`, `:86-99`) → `UPGRADE_REQUIRED` si hay estrategia
   híbrida/multi-variante sin addon; (f) **bucle por destino**: `resolveActiveClientPlanId`
   (`plan-persistence.ts:329-343`: plan `lifecycle_status='active'` más reciente → append versión, o
   `null` → plan nuevo) → `buildDraftForTarget` (`_lib/assign-plan.ts:172-233`) →
   `NutritionPlanDraftSchema.safeParse` → `persistAndPublishDraft` con clave idempotente
   `assignmentKeyForClient({ operationId, targetClientId })` (`:106-116`); reporte PARCIAL (sigue si
   uno falla). Qué se COPIA vs qué NO (`_lib/assign-plan.ts:12-19,200-231`): copia nombre/estrategia/
   timezone/permisos/metas/variantes/franjas/items/`visibleNotes`; **nulifica** `privateNotes`,
   `protocolNotes` y `substitutionGroupId` (ids opacos por-versión).
   RN: `persistAndPublishDraft` (`nutrition-v2-builder.ts:886`), `mapWriteError`,
   `NutritionV2WriteClient` y `buildPublishIdempotencyKey` **ya existen** y son el mismo camino.
   Falta: (i) el equivalente RN de `resolveActiveClientPlanId` (query `nutrition_plans_v2` `id`
   where `client_id`+`lifecycle_status='active'` order `created_at` desc limit 1) — no existe hoy en
   RN; (ii) el gate Pro (reusar `requiredNutritionProFeature`, `:745`, ya exportado) contra el draft;
   (iii) el bucle de reporte parcial y la clave idempotente por destino.
   **Delta:** portar la acción `assignNutritionPlanToClients` en `lib/nutrition-v2.api.ts` (o
   `lib/nutrition-v2-builder.ts`) espejo exacto: validar → gate Pro una vez → loop
   resolvePlanId/buildDraft/validate/persist con idempotencia estable → `AssignSummary` parcial.
   Cierre: asignación 1:1 con la web, incl. append-versión a quien ya tiene plan, gate Pro
   fail-closed, idempotencia por (operación, destino) y reporte parcial (no aborta al primer fallo).

6. **Vista de resultados / reporte por alumno.**
   Web `AssignPlanToClientsDialog.tsx:146-198`: tras confirmar, resumen "**N** asignado(s) · **M**
   con problemas de **T**." (`:148-157`); lista por alumno con `CheckCircle2` verde / `XCircle` rojo,
   nombre y, si falla, el `item.error` humanizado (si ok: "Nueva version publicada.", `:164-177`);
   pie con **"Asignar a otros"** (reset, `:183-189`) y **"Listo"** (cierra, `:190-196`).
   RN: inexistente.
   **Delta:** portar la vista de reporte con el mismo resumen y desglose ok/fallo por alumno, y los
   dos botones de pie. Errores por alumno = los que devuelve `mapWriteError`/`persistAndPublishDraft`
   (ya humanizados en español sin tildes).
   Cierre: reporte parcial visible (resumen + fila por alumno con motivo) y acciones "Asignar a
   otros" / "Listo".

### B. Archivar plan vigente (D-04 — FALTA por completo)

7. **Disparador + zona inferior + copy.**
   Web `page.tsx:397-410`: sección discreta separada por `border-t`, con texto "Archivar retira el
   plan de la vista del alumno. El historial registrado se conserva." (`:401-403`) y el botón
   `ArchivePlanButton.tsx:57-64` — icono `Archive` + copy **"Archivar plan"** (`text-muted`,
   `bg-surface-card`, `min-h-11`), **aislado del CTA primario** para evitar clicks accidentales.
   RN `[clientId].tsx`: **no existe**; el scroll termina en el botón "Rehacer con el asistente"
   (`:502-508`).
   **Delta:** añadir la zona inferior (separador + microcopy + botón "Archivar plan") DESPUÉS del
   historial y del botón "Rehacer con el asistente", solo con plan vigente (`activePlan`).
   Cierre: zona "Archivar plan vigente" discreta al final, con microcopy y botón secundario aislado.

8. **Diálogo de confirmación.**
   Web `ArchivePlanButton.tsx:66-105`: título **"Archivar plan vigente"** (`:69`); descripción "El
   alumno dejara de ver **{planName}**. El historial registrado se conserva. Puedes crear uno nuevo
   cuando quieras." (`:70-74`); zona de error `role="alert"` (`:77-84`); botones **"Cancelar"**
   (`:87-94`) + **"Archivar plan"** con pending **"Archivando…"** (`:95-104`); `onOpenChange`
   bloqueado mientras corre (`:35-39`).
   RN: inexistente.
   **Delta:** portar el confirm en `Sheet nativeModal` (patrón `PublishConfirmSheet`,
   `QuickEditSheets.tsx:32-61`) con los mismos copys, botón destructivo + Cancelar, bloqueo durante
   la escritura y zona de error humanizada.
   Cierre: confirmación clara y no tóxica ("el alumno deja de verlo, el historial se conserva")
   antes de archivar; sin cierre accidental mientras corre.

9. **Acción de archivado (UPDATE RLS + clasificación).**
   Web `nutrition-archive.actions.ts:41-81`: `authorizeCoach` → `UPDATE nutrition_plans_v2` set
   `lifecycle_status='archived'`, `archived_at`, `updated_by` con WHERE `id`+`client_id`+
   `lifecycle_status='active'` y `.select('id')`; **idempotente** (2ª vez → 0 filas → `PLAN_NOT_FOUND`,
   no error); solo toca columnas no congeladas por el trigger de identidad; `classifyArchiveWrite`
   (`_lib/archive-plan.ts:30-45`) mapea 42501→`SCOPE_DENIED`, otro error→`WRITE_FAILED`, 0 filas→
   `PLAN_NOT_FOUND`, ≥1→`OK`; al `OK` → `router.refresh()` y la ficha pasa a "Sin plan vigente"
   (`detail.plan.plan` vuelve `null`).
   RN: `[clientId].tsx` ya tiene `reloadNonce` + `setReloadNonce((n)=>n+1)` (`:82,246-250`) que
   re-lee el read-model; el empty-state "Sin plan vigente" ya está montado (`:298-310`).
   **Delta:** portar `archiveNutritionPlan({ db, clientId, planId })` en `lib/nutrition-v2.api.ts`
   como UPDATE PostgREST RLS-scoped (mismo WHERE + `.select('id')`), clasificado con
   `classifyArchiveWrite` (pieza pura, ver delta 10), y al `OK` cerrar el sheet + `setReloadNonce`
   (NO `router.push`: la re-lectura degrada sola a empty-state). El `ArchiveInputSchema`
   (`_lib/archive-plan.ts:9-13`) valida `clientId`/`planId` uuid antes de tocar la red.
   Cierre: archivar = UPDATE RLS-scoped idempotente (nunca borra ni service-role), clasificación
   humanizada, y la ficha se colapsa sola a "Sin plan vigente" tras el `reloadNonce`.

### C. Transversales

10. **No duplicar la lógica pura (CLAUDE.md: "No duplicar lógica compartible").**
    `_lib/assign-plan.ts` y `_lib/archive-plan.ts` importan SOLO `@eva/nutrition-v2` + `zod` (sin
    React/Next/Supabase; `assign-plan.ts:21-27`, `archive-plan.ts:1`): son lógica pura portable.
    **Delta:** en vez de copiar/pegar a RN (que reintroduce la clase de drift del P0-G nutrition-pro),
    mover `canAssignSourcePlan`, `validateAssignTargets`, `assignmentKeyForClient`,
    `buildDraftForTarget`, `aggregateAssignResults`, `MAX_ASSIGN_TARGETS`, `ArchivePlanInputSchema` y
    `classifyArchiveWrite` a `@eva/nutrition-v2` y reexportarlas desde el `_lib` web + consumirlas en
    RN. Si el owner considera fuera de alcance tocar `packages/*` en esta unidad, la alternativa
    aceptable es un módulo RN-free en `apps/mobile/lib/` con test que espeje 1:1 (documentar la deuda
    de consolidación, análoga a 4B-16).
    Cierre: una sola fuente de la lógica pura de assign/archive; RN no copia constantes/mensajes.

11. **Offline (fail-closed, sin cola).**
    Estas son mutaciones one-shot del coach; ni web ni el patrón RN tienen cola offline para ellas.
    RN ya bloquea publicaciones sin red con `NetInfo.fetch()` antes de escribir y muestra
    `QUICK_EDIT_COPY.offline` (`QuickEditMode.tsx:343-348`).
    **Delta:** aplicar el MISMO guard a assign y archive: si `net.isConnected === false`, no tocar la
    red y mostrar el copy offline en la zona de error del diálogo (no encolar). Documentado como
    adaptación nativa, no delta de paridad.
    Cierre: assign/archive fallan-cerrado sin red con mensaje claro; nunca escriben a ciegas.

12. **RN-extras (decisión 4).** Esta unidad es net-new (ports de web); no introduce afordancias sin
    contraparte web. No hay extras a retirar aquí. Cualquier control nativo nuevo (date por texto
    YYYY-MM-DD, `Sheet nativeModal`, `Modal` full-screen para el roster) es adaptación de plataforma
    ya sancionada, no extra.

## Comprobación objetiva

1. **Asignar (append-versión):** alumno FUENTE con plan publicado + ≥1 variante → aparece "Asignar a
   otros alumnos" en la fila de badges; abrir → roster del workspace SIN el fuente, con badge "Ya
   tiene plan" en quienes correspondan; buscar con acentos ("josé" matchea "Jose"); seleccionar 2
   (uno con plan, uno sin), fijar "Vigente desde" válida, confirmar → reporte "2 asignados de 2";
   verificar que al de-con-plan se le creó **nueva versión** (no plan duplicado) y al de-sin-plan un
   plan nuevo; ambos SIN notas privadas/protocolo copiadas.
2. **Asignar (reporte parcial + gate Pro):** con una fecha anterior a la versión vigente de un
   destino, ese alumno falla con "La fecha de vigencia debe ser posterior…" y los demás pasan
   (reporte parcial). Sin addon Nutrición Pro y plan fuente híbrido/multi-variante → `UPGRADE_REQUIRED`
   antes de escribir. Reintentar la MISMA operación no duplica versiones (idempotencia).
3. **Archivar:** con plan vigente → zona inferior "Archivar plan"; confirmar → la ficha se colapsa a
   "Sin plan vigente" (mismo empty-state) sin recargar la app; el historial de días previos sigue
   visible; el alumno deja de ver el plan. Archivar dos veces (o sin scope) → mensaje humanizado
   (`PLAN_NOT_FOUND`/`SCOPE_DENIED`), nunca un crash.
4. **Camino autoritativo:** con un `clientId` fuera del pool del workspace, tanto assign como archive
   devuelven `SCOPE_DENIED` (42501 de RLS), probando que la barrera es server-side y la UI solo
   espeja.
5. **Offline:** en modo avión, confirmar assign o archive muestra el copy offline y NO escribe.
