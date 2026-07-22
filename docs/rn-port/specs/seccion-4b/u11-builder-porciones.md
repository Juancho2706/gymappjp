# 4B-11 — Builder: capa "Porciones a elección" (sección por franja + derivar targets + subtotal combinado + chips de revisión)

Archivos RN:
- **CREAR** `apps/mobile/lib/nutrition-v2-builder-portions.ts` (lógica PURA del estado de
  porciones del builder — el mapa `slotKey → targets`, operaciones y derivación de macros;
  port del web `_components/portions-state.ts`) + test.
- **EDITAR** `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx` (montar la sección en
  `SlotEditor`, la card "Usar como objetivos" en `TargetsStep`, los chips read-only en
  `ReviewStep`, el subtotal combinado, y threadear el controlador de porciones por el árbol).
  **UNIDAD SOLITARIA en su archivo** (el monolito lo comparten 4B-10/11/12/13 → secuenciales;
  aterriza tras 4B-10, ver RANKING/INVENTARIO §4).
- **EDITAR** `apps/mobile/lib/nutrition-v2-builder.ts`: `assembleDraft` debe colgar
  `exchangeTargets` en los slots del draft, y `persistAndPublishDraft` debe **insertar** las filas
  de `nutrition_slot_exchange_targets_v2` con snapshot congelado (hoy NO existe — ver Hallazgo).
- **CONSUMIR sin modificar** `apps/mobile/lib/nutrition-exchanges.coach.ts`
  (`fetchCoachExchangeGroups` ya existe, catálogo system+propios coach-scoped) y
  `apps/mobile/lib/nutrition-v2-quick-edit.ts` (`buildPortionTargetInsertRows` /
  `DraftExchangeTarget` / `PortionGroupRef`, ya exportados) para no duplicar el insert congelado.
- **NO tocar** `components/nutrition-v2/quick-edit/**` (territorio del quick-edit; su
  `portions-state.ts` es de OTRA forma, ver afirmación 1).

Referencia web:
`apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/portions-state.ts:28-228`
(lógica pura) +
`_components/PortionsSection.tsx:67-296` (`usePortionsBuilder` + `PortionsSection`) +
`_components/PortionsDeriveCard.tsx:20-68` +
`_components/PortionsReviewChips.tsx:18-60` (`PortionsReviewSection`) +
`_components/PortionsGroupsAction.ts` (server action del catálogo) +
montaje en `_components/PlanBuilderClient.tsx:52-55,535-537,602,613-619,935,1064,1215,1297,1391-1400,1405,1407` +
copys `apps/web/src/lib/nutrition-portions-copy.ts:12-37` (`PORTIONS_COPY.builder`).
Motor puro compartido: `packages/nutrition-engine/exchange-calc.ts:85,126,154,171,195`
(`macrosForTargets`, `dayTotalsByVariant`, `portionsSummaryLabel`, `hasUnconfirmedMacros`,
`exchangeGroupColor`), tipos `exchange-types.ts:12,73` (`ExchangeGroup`, `ExchangeMacroTotals`).

## Contexto y decisión de alcance

Porciones a elección es una **capa opcional** del builder SOLO sobre estrategias structured/hybrid
(las que usan franjas): el coach declara, por franja, cuántas porciones de cada grupo de
intercambio (ej. "2 Cereales · 1,5 Verduras") puede elegir el alumno. El motor deriva macros de
esas porciones para (a) precargar las metas del plan, (b) sumar al subtotal de la franja y (c)
mostrarse read-only en Revisión. El quick-edit RN **ya tiene** esta capa
(`components/nutrition-v2/quick-edit/EditablePortionsSection.tsx` + `quick-edit/portions-state.ts`),
pero el **builder RN NO** — esa es la asimetría que cierra esta unidad (INVENTARIO §1, fila
"Porciones a elección en builder"). No hay RN-extra que retirar: la capa nace 1:1 con web.

**No pisar 4B-10 (F-02):** los reemplazos autorizados viven en `ItemEditor.SubstitutionsField`
(`builder/[clientId].tsx:693-767`) y son un campo **disjunto** de `exchangeTargets` (item-level vs
slot-level). Esta unidad NO toca `SubstitutionsField`, `BuilderItem.substitutions`, ni el reducer de
reemplazos; solo agrega estado hermano de porciones y el insert de su tabla.

## Hallazgo estructural (por qué el write-path de porciones NO existe — al revés que F-02)

En 4B-10 el write-path de reemplazos YA existía inerte y solo faltaba poblarlo. **Aquí es
distinto: el write-path de porciones del builder NO existe.** Verificado:

- `assembleDraft` (`nutrition-v2-builder.ts:497-542`) emite cada `DraftMealSlot` con `targets: {}`
  (`:505`) y **nunca** una clave `exchangeTargets`. El draft del builder jamás lleva porciones.
- `persistAndPublishDraft` (`nutrition-v2-builder.ts:1058-1118`) inserta variantes → slots → items →
  reemplazos F-02, pero **no hay ninguna inserción a `nutrition_slot_exchange_targets_v2`**
  (grep `exchangeTargets`/`meal_exchange_targets` en `nutrition-v2-builder.ts` → 0 hits). El
  `publish_nutrition_plan_v2` RPC (`:1120`) publica lo ya insertado; no materializa porciones.
- En contraste, el **quick-edit** RN sí persiste porciones: `injectExchangeTargetsIntoDraft`
  (`nutrition-v2-quick-edit.ts:930`) cuelga `exchangeTargets` en el draft y el loop
  `:1396-1401` inserta con `buildPortionTargetInsertRows` (`:995`, snapshot congelado del
  grupo). El schema del draft **sí** admite `exchangeTargets` en el slot
  (`DraftExchangeTarget = NonNullable<PortionDraftSlot['exchangeTargets']>[number]`,
  `nutrition-v2-quick-edit.ts:861`) — la barrera es solo que el builder no lo emite ni lo escribe.

Por lo tanto esta unidad debe: (1) construir el estado + UI de porciones del builder; (2) inyectar
`exchangeTargets` al draft; y (3) **agregar el insert congelado** en `persistAndPublishDraft`,
reusando `buildPortionTargetInsertRows` de la lib del quick-edit (no duplicarlo). Cero cambios de
contrato, de RPC ni de servidor.

## Afirmaciones y deltas

1. **La lógica pura del builder NO es la misma que la del quick-edit RN — hay que portar la del web.**
   Web builder `portions-state.ts:28-34`: el estado es un mapa `PortionsBySlot = Record<slotKey,
   { exchangeGroupId; portions }[]>` (`PortionTargetDraft`, **sin notes en F1** — comentario `:27`),
   estado hermano del reducer del wizard, inyectado al draft antes de publicar. El catálogo de grupos
   es el **completo** (system + custom del coach) cargado por `PortionsGroupsAction`.
   RN quick-edit `quick-edit/portions-state.ts:85-143`: el estado se **hidrata desde el read model**
   (`QuickEditPortionTarget` con `id`/`groupCode`/`groupName`/`color`/`ref`/`macrosConfirmed`/**notes**
   congelados), y el catálogo elegible son SOLO los grupos que el plan YA usa (comentario `:19-21`:
   "grupos nuevos al plan se agregan en el builder"). **Delta:** la forma, la fuente del catálogo y
   la presencia de notes difieren → el estado del quick-edit **no es reutilizable** para el builder.
   Cierre: crear `lib/nutrition-v2-builder-portions.ts` como port 1:1 de `portions-state.ts:28-228`
   (mapa `PortionsBySlot`, sin notes), reusando el motor `@eva/nutrition-engine` — NO reciclar el
   estado del quick-edit. (Sí se reusan las PIEZAS DE PERSISTENCIA del quick-edit, afirmación 8.)

2. **Constantes de paso/rango y snap (0,5 / mín 0,5 / máx 99).**
   Web `portions-state.ts:36-44`: `PORTIONS_STEP = 0.5`, `PORTIONS_MIN = 0.5`, `PORTIONS_MAX = 99`,
   `snapPortions` (redondea al 0,5 más cercano, clamp `[0,5; 99]`). Espejo del CHECK y de
   `NutritionExchangeTargetSchema`.
   RN quick-edit ya tiene equivalentes (`PORTION_STEP`/`PORTION_MIN`/`PORTION_MAX`,
   `quick-edit/portions-state.ts:64-74`) pero con `stepPortions(current, dir)` de firma distinta.
   Cierre: exportar en la lib nueva `PORTIONS_STEP/MIN/MAX` + `snapPortions`, con la misma
   matemática del web. No hardcodear 0,5/99 en la UI.

3. **Operaciones del mapa (add/remove/step/set) — puras, mismas reglas que web.**
   Web `portions-state.ts:71-115`: `slotPortionTargets`, `addPortionGroup` (1 porción por defecto,
   no-op si el grupo ya está — UNIQUE franja+grupo, `:76-80`), `removePortionGroup` (`:82-87`),
   `setPortionValue` (snap, `:90-103`), `stepPortionValue` (±0,5 con clamp, `:106-115`).
   RN: no existen (la lib es nueva).
   Cierre: portar las cinco funciones idénticas. El alta arranca en `portions: 1` (espejo `:79`).

4. **Derivación de macros (subtotal de franja, totales del día) — vía motor compartido, jamás NaN.**
   Web `portions-state.ts:136-192`: `derivePortionTotals` (Σ de TODO el plan vía
   `dayTotalsByVariant`, `:136-145`), `slotPortionTotals` (Σ de UNA franja vía `macrosForTargets`;
   devuelve `null` si el catálogo aún no cargó o la franja no tiene porciones → el subtotal muestra
   solo items, nunca NaN, `:154-163`), `combineSubtotals` (items fijos + derivado, redondeo a 1
   decimal; sin porciones devuelve **la misma referencia** de items, `:179-192`).
   RN builder `nutrition-v2-builder.ts:343-349`: `slotSubtotal`/`dayTotals` suman SOLO items.
   `SlotEditor` (`builder/[clientId].tsx:785,851-856`) pinta `slotSubtotal(slot)` sin porciones;
   `ConstructionStep` (`:884,900-905`) pinta `dayTotals(state)` ("Total del día") sin porciones.
   **Delta:** los subtotales ignoran las porciones.
   Cierre: portar `derivePortionTotals`/`slotPortionTotals`/`combineSubtotals` en la lib nueva
   (usando `dayTotalsByVariant`/`macrosForTargets` de `exchange-calc.ts:85,126`); en `SlotEditor`
   combinar `slotSubtotal(slot)` con `slotPortionTotals(bySlot, slot.key, groups)` y renderizar la
   nota `subtotalPortionsNote` bajo el subtotal cuando haya porciones (espejo web
   `PlanBuilderClient.tsx:535-537,613-619`).

5. **Catálogo de grupos: `fetchCoachExchangeGroups` (RN ya lo tiene), NO un server action nuevo.**
   Web carga el catálogo con `loadExchangeGroupsForBuilderAction` (server action que reusa el
   servicio V1 `getExchangeGroupsForCoach`, scope 3-vías) con estados loading/error/reintento
   (`PortionsSection.tsx:67-131`, `PORTIONS_COPY.builder.pickerLoading/pickerError/pickerRetry`).
   RN `nutrition-exchanges.coach.ts:92-103` ya expone `fetchCoachExchangeGroups()`: lee
   `exchange_groups` (system + `coach_id`, `deleted_at null`, orden `sort_order`,`code`) vía
   PostgREST coach-scoped (RLS `xg_select`) y mapea a `ExchangeGroup` (`mapGroupRow:65-83`, incluye
   `refCalories/refProteinG/refCarbsG/refFatsG`, `composedOf`, `macrosConfirmed`, `sortOrder`,
   `isSystem`). **Delta:** la carga perezosa/estado del picker no existe en el builder RN.
   Cierre: crear un controlador (hook `usePortionsBuilder` RN, espejo de `PortionsSection.tsx:67`)
   que llame `fetchCoachExchangeGroups` con carga perezosa + `groupsLoading`/`groupsError`/reintento,
   ordenando con `sortGroupsForPicker` (`portions-state.ts:123`, system primero por `isSystem`,
   `sortOrder`, `code`). Sin server action nuevo: la lectura es coach-scoped por RLS. La UI **no
   autoriza** — porciones viene con todo plan pago (sin gate de módulo propio; el publish lo re-valida
   el RPC igual que el resto del builder).

6. **UI: sección "Porciones a elección" por franja (en `SlotEditor`, bajo el buscador).**
   Web `PortionsSection.tsx:229-295`: separador `mt-3 border-t border-border-subtle pt-3`, título
   `PORTIONS_COPY.builder.sectionTitle` ("Porciones a elección"), hint `sectionHint` ("El alumno
   elige qué comer dentro de cada grupo."), lista de filas [circulito de color del grupo (identidad,
   letra blanca) + nombre truncado + stepper 0,5 + eliminar], y el picker "Agregar grupo".
   RN: el patrón visual **ya existe casi idéntico** en el quick-edit
   (`EditablePortionsSection.tsx:248-322`: mismo separador, mismos `sectionTitle`/`sectionHint`,
   `GroupDot` con `exchangeGroupColor`, `PortionsStepper` de botones, `GroupPickerSheet`). Es la
   plantilla de UI a adaptar, con TRES diferencias obligatorias respecto del quick-edit:
   - **Sin notes:** el builder `PortionTargetDraft` no tiene notes (afirmación 1) → **omitir** la
     afordancia `StickyNote` + `TextInput` de notas (`EditablePortionsSection.tsx:143-152,164-175`).
   - **Picker del catálogo completo:** el `GroupPickerSheet` del quick-edit
     (`:184-246`) lista los grupos del plan; aquí debe listar `controller.groups`
     (catálogo completo cargado en la afirmación 5), con estados loading/error/reintento (copys
     `pickerLoading`/`pickerError`/`pickerRetry`).
   - **Estado hermano por `slotKey`, no read-model:** las filas leen
     `slotPortionTargets(controller.bySlot, slotKey)`; add/remove/step despachan al controlador nuevo.
   Cierre: montar `<PortionsSection>` RN al final de `SlotEditor`
   (`builder/[clientId].tsx:771-859`, tras el bloque "Buscar/Libre" y antes o junto al subtotal,
   espejo de la posición web `PlanBuilderClient.tsx:602`), reusando `GroupDot`/`PortionsStepper` del
   patrón del quick-edit pero SIN notes y con el picker del catálogo completo. Copys literales de
   `PORTIONS_COPY.builder`. Target táctil ≥44px, nombre `numberOfLines={1}`, stepper de ancho fijo.
   El circulito usa `exchangeGroupColor` SOLO como identidad (nunca colorea texto sobre superficie;
   white-label safe).

7. **Stepper: adaptación nativa de botones ±0,5 (sin teclado numérico) — decisión ya sancionada.**
   Web `PortionsSection.tsx:141-226`: stepper tap-to-edit con **input de texto libre** ("1,5",
   `parsePortionsInput`/`formatPortionsEs`, `inputMode="decimal"`). RN quick-edit
   (`EditablePortionsSection.tsx:48-95`) usa **solo botones** ±0,5 (comentario `:20-23` y `:49-50`:
   "jamás teclado numérico, hallazgo M4"), con el valor como `Text` y clamp por construcción.
   **Delta/decisión:** replicar el patrón de **botones** del quick-edit (adaptación nativa YA
   sancionada en M4), no el input libre del web. Con paso 0,5 + clamp el valor siempre es múltiplo
   válido, así que `parsePortionsInput`/`commitValue` del web **no se portan** a la UI (quedan fuera
   de alcance por adaptación). Documentar en el Cierre como divergencia sancionada (no es un
   RN-extra: es la MISMA capacidad con affordance nativa).

8. **Persistencia: inyectar `exchangeTargets` + insertar la tabla con snapshot congelado (reusar quick-edit).**
   Web: `attachPortionsAndValidate` (`portions-state.ts:201-228`) inyecta `exchangeTargets` al draft
   ya ensamblado (franjas sin porciones quedan byte-idénticas, `:206,214`) y el publish server-side
   congela el snapshot del grupo.
   RN: el builder escribe client-side vía PostgREST (afirmación del Hallazgo), así que debe congelar
   el snapshot DESDE el catálogo `ExchangeGroup[]` ya cargado — exactamente lo que hace el quick-edit
   con `buildPortionTargetInsertRows` (`nutrition-v2-quick-edit.ts:995-1028`, requiere un dict
   `groupsById` con `ref`/`composedOf`/`macrosConfirmed`; corta el publish si un grupo no resuelve).
   Cierre:
   - En `assembleDraft` (`nutrition-v2-builder.ts:497-542`), tras armar `mealSlots`, colgar
     condicionalmente `exchangeTargets` por slot desde el mapa de porciones (espejo del injector web),
     mapeando a `DraftExchangeTarget` (`{ exchangeGroupId, portions, notes: null, orderIndex }`).
     Franja sin porciones = sin la clave = byte-idéntico a hoy. `assembleAndValidateDraft:576-578`
     re-valida contra `NutritionPlanDraftSchema` (paso/rango los refuerza el schema).
   - En `persistAndPublishDraft` (`nutrition-v2-builder.ts:1058-1118`), tras insertar items/reemplazos
     de cada slot, agregar el loop de `nutrition_slot_exchange_targets_v2` gateado por
     `slot.exchangeTargets?.length`, construyendo las filas con `buildPortionTargetInsertRows`
     (importado de la lib del quick-edit) alimentado por el dict congelado del catálogo. Espejo del
     loop `nutrition-v2-quick-edit.ts:1396-1401`. Un draft sin porciones no toca la tabla.
   - `publishDraftRN` recibe el catálogo de grupos (o el mapa de porciones) como parámetro opcional
     para poder congelar; sin porciones el flujo es idéntico al actual. NO duplicar
     `buildPortionTargetInsertRows` — reusar el export existente.

9. **Card "Usar como objetivos" en el paso Objetivos (derivar targets).**
   Web `PortionsDeriveCard.tsx:20-68` montada en `PlanBuilderClient.tsx:1387-1402` ANTES de
   `TargetsStep`: si el draft tiene porciones y el catálogo cargó, muestra
   `PORTIONS_COPY.builder.deriveCard(kcal,p,c,g)` (totales de `derivePortionTotals`, enteros) con
   icono `Sparkles` y botón `deriveCta` ("Usar como objetivos") que despacha 4× `SET_TARGET` con los
   totales redondeados. NUNCA sobrescribe sin tap; los targets quedan editables (R6).
   RN: `TargetsStep` (`builder/[clientId].tsx:484-563`) no tiene nada de esto.
   Cierre: montar una card equivalente ANTES de los campos de metas en `TargetsStep`, con el mismo
   copy/gate (`hasAnyPortions` + `groups != null`) e icono `Sparkles`, cuyo botón despacha
   `SET_TARGET` de `calories/proteinG/carbsG/fatsG` con `String(Math.round(...))` (espejo
   `PlanBuilderClient.tsx:1394-1398`). Tokens `tone="nutrition"` (primary/10, white-label).

10. **Chips read-only + banner de macros referenciales en Revisión.**
    Web `PortionsReviewChips.tsx:18-60` (`PortionsReviewSection`) montado en
    `PlanBuilderClient.tsx:935` (solo `usesSlots`): por cada franja con porciones, un chip
    `portionsSummaryLabel(targets, groups)` ("2C · 1,5V", coma decimal es-CL vía `esDecimal`,
    `portions-state.ts:67`) en pill mono `tabular-nums`; arriba, banner `warning` con
    `PORTIONS_COPY.builder.unconfirmedBanner` si algún grupo usado tiene `macros_confirmed=false`
    (`hasUnconfirmedMacros`, `exchange-calc.ts:171`). No duplica totales.
    RN `ReviewStep` (`builder/[clientId].tsx:914-965`) no tiene chips de porciones.
    Cierre: agregar en `ReviewStep` (solo structured/hybrid) la sección de chips espejo, con
    `portionsSummaryLabel` + `esDecimal` (portar `esDecimal` a la lib nueva) y el banner referencial
    con `hasUnconfirmedMacros`. Copys literales. Convive con `StudentPreview` sin pisarlo.

11. **El controlador de porciones se threadea por el árbol (paridad de wiring).**
    Web crea `const portions = usePortionsBuilder(clientId)` en `PlanBuilderClient.tsx:1064` y lo baja
    por props a `TargetsStep`(vía `PortionsDeriveCard`), `ConstructionStep`→`SlotEditor`→`PortionsSection`
    y `ReviewStep`→`PortionsReviewSection` (`:1391,1405,1407,602,935`).
    RN: hoy `ConstructionStep`/`SlotEditor`/`ItemEditor` reciben `dispatch`/`onSearch`; hay que sumar
    el controlador de porciones (bySlot/groups/estado/operaciones) por la misma cadena.
    Cierre: instanciar el controlador RN en `CoachNutritionV2BuilderScreen` (junto a `useReducer`,
    `builder/[clientId].tsx:138`) y pasarlo a `TargetsStep`, `ConstructionStep`(→`SlotEditor`) y
    `ReviewStep`. En `handlePublish` (`:201-254`), pasar el mapa/catálogo a `publishDraftRN` para la
    inyección+insert (afirmación 8). NO alterar la firma de `onSearch`/F-02.

12. **Gating structured/hybrid heredado (verificar que se preserve).**
    Web: las tres superficies solo se montan bajo `usesSlots`/franjas (SlotEditor no existe en
    flexible; `PortionsReviewSection`/`PortionsDeriveCard` chequean `hasAnyPortions`).
    RN: `ConstructionStep` hace early-return "Plan flexible" cuando `!strategyUsesSlots(state.strategy)`
    (`builder/[clientId].tsx:872-882`), así que `SlotEditor`→`PortionsSection` heredan el gate; la card
    de derivar y los chips deben chequear `hasAnyPortions`/`usesSlots` igual que el web
    (`strategyUsesSlots`, `nutrition-v2-builder.ts:120`). **Paridad de intención** — no agregar
    guardas redundantes; confirmar que en un plan flexible no aparece ninguna UI de porciones y el
    draft publica byte-idéntico a hoy.

## Cierre (qué debe quedar)

1. `lib/nutrition-v2-builder-portions.ts` (nuevo, puro) + test: port de `portions-state.ts`
   (`PortionsBySlot`/`PortionTargetDraft` **sin notes**, `PORTIONS_STEP/MIN/MAX`, `snapPortions`,
   `slotPortionTargets`, `addPortionGroup`, `removePortionGroup`, `setPortionValue`,
   `stepPortionValue`, `hasAnyPortions`, `sortGroupsForPicker`, `derivePortionTotals`,
   `slotPortionTotals`, `combineSubtotals`, `esDecimal`, `formatPortionsEs`), sobre
   `@eva/nutrition-engine`. Sin `parsePortionsInput`/`commitValue` (stepper de botones, afirmación 7).
2. `lib/nutrition-v2-builder.ts`: `assembleDraft` cuelga `exchangeTargets` condicional por slot;
   `persistAndPublishDraft` inserta `nutrition_slot_exchange_targets_v2` con snapshot congelado
   reusando `buildPortionTargetInsertRows` del quick-edit; `publishDraftRN` recibe el catálogo/mapa
   opcional. Draft sin porciones = byte-idéntico a hoy.
3. `builder/[clientId].tsx`: controlador de porciones instanciado y threadeado; sección
   "Porciones a elección" en `SlotEditor` (patrón del quick-edit sin notes, picker del catálogo
   completo con loading/error/reintento); subtotal de franja combinado + nota `subtotalPortionsNote`;
   card "Usar como objetivos" en `TargetsStep`; chips read-only + banner referencial en `ReviewStep`.
   Copys literales de `PORTIONS_COPY.builder`; gate structured/hybrid heredado; F-02 (afirmación
   4B-10) intocado.
4. Consumir `fetchCoachExchangeGroups` (`nutrition-exchanges.coach.ts`) sin cambios; sin server
   action nuevo (lectura coach-scoped por RLS). Ninguna lógica de autorización en cliente.
5. Test: reducer/operaciones del mapa (add 1×1, no-op duplicado, remove, step ±0,5 con clamp),
   derivación (`slotPortionTotals`/`combineSubtotals` = suma esperada; `null`/misma-referencia sin
   porciones), y `assembleDraft` emite `exchangeTargets` solo con ≥1 porción (ausente con 0 →
   byte-idéntico), validando contra el schema.
6. Gates de módulo: `pnpm --filter @eva/mobile exec tsc --noEmit` 0 errores, lint 0 nuevos,
   `check:tokens`, y el test nuevo verde.

## Comprobación objetiva

Plan structured/hybrid en el builder RN: en una franja, "Agregar grupo" abre el picker con el
catálogo completo del coach (system + propios); elegir "Cereales" agrega una fila con circulito de
color, nombre y stepper en "1"; ±0,5 mueve entre 0,5 y 99; el subtotal de la franja crece y aparece
la nota "Incluye ~N kcal de porciones a elección"; el "Total del día" incluye las porciones. En el
paso Objetivos aparece la card "Tus porciones suman ~… kcal · … P · … C · … G" con "Usar como
objetivos" que precarga las 4 metas (editables). En Revisión, por cada franja con porciones se ve el
chip "2C · 1,5V" (coma decimal) y, si algún grupo es referencial, el banner "Algunos grupos tienen
macros referenciales…". Publicar y verificar en `nutrition_slot_exchange_targets_v2` que quedaron las
filas con snapshot congelado (o en la vista del alumno RN de porciones, que ya renderiza cobertura).
Un plan sin porciones (o flexible) publica exactamente como hoy — sin filas nuevas, draft
byte-idéntico. F-02 (reemplazos) sigue funcionando sin cambios. Capturas web móvil (SlotEditor +
DeriveCard + ReviewSection) vs RN: sección, card y chips idénticos en copy. Gates:
`pnpm --filter @eva/mobile exec tsc --noEmit`, lint, `check:tokens`, y el test del reducer/derivación.
