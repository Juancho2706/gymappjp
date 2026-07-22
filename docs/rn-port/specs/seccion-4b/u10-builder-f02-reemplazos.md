# 4B-10 — Builder: editor de reemplazos autorizados F-02 (el `TODO(F-02 P3)`)

Archivos RN: `apps/mobile/lib/nutrition-v2-builder.ts` (tipo `BuilderItem`, `BuilderAction`,
`builderReducer`, `assembleDraft`, constante de tope) + `apps/mobile/app/coach/nutrition-v2/builder/[clientId].tsx`
(`ItemEditor`, target del `FoodSearchModal`). Unidad SOLITARIA en su archivo (el monolito
`builder/[clientId].tsx` lo comparten 4B-10/11/12/13 → secuenciales, nunca en la misma wave; ver
INVENTARIO §4).
Referencia web: `apps/web/src/app/coach/nutrition-v2/[clientId]/builder/_components/PlanBuilderClient.tsx:350-436`
(`SubstitutionsField`), montado en `ItemRow:511`; estado/reducer en
`_lib/draft-builder.ts:52-70,143,151-167,229-251,506-548`; tope en `_lib/draft-builder.ts:29`.

## Hallazgo estructural (por qué esto es un write-path muerto, no un feature ausente)

El editor F-02 (PR #159, tabla `nutrition_item_substitutions_v2`) vive en web **solo en el BUILDER**
(`SubstitutionsField` dentro de `ItemRow`, que solo existe en `SlotEditor` → structured/hybrid). El
**quick-edit web NO edita reemplazos**: los trata como carry-over read-only (INVENTARIO §0). Por eso
esta unidad aterriza en el builder RN, **no** en el quick-edit. El `TODO(F-02 P3)` de
`QuickEditMode.tsx:129-130` es solo un puntero cruzado: dice literalmente "editor coach RN — afordancia
por item… reusar FoodSearchSheet, max 8, solo structured/hybrid"; el quick-edit RN ya está a paridad
web (ambos carry-over puro, no editan). **El quick-edit NO se toca en esta unidad.** Un editor de
reemplazos en quick-edit no existe en la web y por lo tanto queda FUERA de alcance (decisión owner 4 =
RN-extras retirar/gatear); llegaría solo si el owner lo pide como excepción escrita futura.

El write-path RN de persistencia YA existe y es espejo 1:1 del web, PERO nunca se ejecuta:

- `buildItemSubstitutionInsertRow` / `collectSubstitutionFoodIds` (`nutrition-v2-builder.ts:621-664`)
  y la inserción a `nutrition_item_substitutions_v2` dentro de `publishDraftRN`
  (`nutrition-v2-builder.ts:1035-1051`) leen `item.substitutions ?? []` del **draft**.
- Pero `assembleDraft` (`nutrition-v2-builder.ts:464-476`) mapea cada `BuilderItem` →
  `DraftPrescriptionItem` y **NUNCA emite la clave `substitutions`** (a diferencia del web,
  `draft-builder.ts:534-545`, que hace `...(substitutions.length > 0 ? { substitutions } : {})`).
- La causa raíz: el `BuilderItem` RN (`nutrition-v2-builder.ts:56-68`) **no tiene campo
  `substitutions`**, y `BuilderAction` (`:147-161`) **no tiene** `ADD_ITEM_SUBSTITUTION` /
  `REMOVE_ITEM_SUBSTITUTION`. La UI jamás puebla nada → `collectSubstitutionFoodIds` y la inserción
  siempre iteran `[]`. Es un stub inerte.

Falta puramente: **campo de estado + 2 acciones del reducer + cableo en `assembleDraft` + UI (afordancia
por ítem que reusa `FoodSearchModal`)**. Cero cambios de contrato, de RPC ni de servidor.

## Afirmaciones y deltas

1. **Campo `substitutions` en `BuilderItem`.**
   Web `draft-builder.ts:52-70`: interfaz `BuilderItemSubstitution { key: string; food: BuilderFood }`
   y `BuilderItem.substitutions: BuilderItemSubstitution[]` (comentario: "Vacío = item sin capa de
   reemplazos"). `createEmptyItem` inicializa `substitutions: []` (`:143`).
   RN `nutrition-v2-builder.ts:56-68`: `BuilderItem` **sin** el campo; `createEmptyItem:127-141` no lo
   inicializa. **Delta: falta el tipo y el default.**
   Cierre: agregar `interface BuilderItemSubstitution { key: string; food: BuilderFood }` +
   `BuilderItem.substitutions: BuilderItemSubstitution[]`, con `createEmptyItem` → `substitutions: []`.
   (El `key` es la key estable de UI del chip; el `food` siempre viene del catálogo — la afordancia solo
   agrega alimentos del buscador, nunca libres, espejo web `draft-builder.ts:46-55`.)

2. **Constante de tope `MAX_ITEM_SUBSTITUTIONS = 8`.**
   Web `draft-builder.ts:29`: `export const MAX_ITEM_SUBSTITUTIONS = 8` (comentario "límite legado
   V1 = 8"). El contrato lo refuerza: `NutritionItemSubstitutionSchema` array `.max(8)`
   (`packages/nutrition-v2/contracts.ts:87`).
   RN: **no existe la constante** (grep `MAX_ITEM_SUB` → 0 hits en mobile).
   Cierre: exportar `MAX_ITEM_SUBSTITUTIONS = 8` en `nutrition-v2-builder.ts` y usarla en reducer + UI.
   No hardcodear el 8 en la UI.

3. **Acciones `ADD_ITEM_SUBSTITUTION` / `REMOVE_ITEM_SUBSTITUTION`.**
   Web `draft-builder.ts:166-167` (unión de acciones) + `:229-251` (reducer). Semántica exacta a
   replicar del reducer web:
   - `ADD_ITEM_SUBSTITUTION { slotKey, itemKey, key, food }`: cinturón triple ANTES de agregar —
     (a) si `subs.length >= MAX_ITEM_SUBSTITUTIONS` → no-op; (b) si ya existe un sub con
     `sub.food.id === food.id` → no-op (no duplicar); (c) si `item.food && item.food.id === food.id` →
     no-op (no ofrecer el propio prescrito como reemplazo). Si pasa, `substitutions: [...subs, { key, food }]`
     (`draft-builder.ts:234-240`).
   - `REMOVE_ITEM_SUBSTITUTION { slotKey, itemKey, subKey }`: filtra `sub.key !== subKey`
     (`draft-builder.ts:243-251`).
   RN `nutrition-v2-builder.ts:147-161` (unión) + `:171-224` (reducer, con `default: return state`):
   **ninguna de las dos acciones existe.**
   Cierre: agregar ambas al `BuilderAction` y al `switch`, con el cinturón triple idéntico. Reusar
   `mapSlot` (`:167`). (Nota: el reducer RN tiene `default: return state` en `:222`, el web no; mantener
   el default RN.)

4. **Cableo en `assembleDraft` (lo que hace fluir el write-path muerto).**
   Web `draft-builder.ts:517-547`: al mapear cada item a `DraftPrescriptionItem`, spreadea
   condicionalmente `...(substitutions.length > 0 ? { substitutions: substitutions.map((sub, subIndex) =>
   ({ foodId: sub.food.id, recipeId: null, customName: null, quantity: null, unit: null, orderIndex: subIndex })) } : {})`
   (`:534-545`). `quantity/unit null` = "misma porción que el prescrito"; el server congela el snapshot.
   RN `nutrition-v2-builder.ts:464-476`: el objeto `DraftPrescriptionItem` **omite `substitutions`**.
   **Delta: la clave nunca se emite → el draft siempre llega sin reemplazos aunque la UI los pueble.**
   Cierre: en `assembleDraft`, tras `orderIndex: itemIndex`, agregar el mismo spread condicional
   mapeando `item.substitutions ?? []` a la forma `NutritionItemSubstitution`
   (`foodId: sub.food.id, recipeId: null, customName: null, quantity: null, unit: null, orderIndex`).
   Esto activa `collectSubstitutionFoodIds:652-664` y la inserción `publishDraftRN:1035-1051` que YA
   existen. `assembleAndValidateDraft:512-513` valida contra `NutritionPlanDraftSchema` (array `.max(8)`,
   `packages/nutrition-v2/contracts.ts:87`) — el tope de la UI y el del schema coinciden, no debe
   dispararse el error de validación.

5. **UI: afordancia de reemplazos por ítem (dentro de `ItemEditor`).**
   Web `PlanBuilderClient.tsx:355-436` (`SubstitutionsField`), montado incondicionalmente en
   `ItemRow:511` (y `ItemRow` solo vive en `SlotEditor` → structured/hybrid). Estructura y copys EXACTOS
   a portar:
   - Contenedor: separador superior (`mt-2 border-t border-border-subtle pt-2`, `:372`).
   - Overline con icono `Repeat` (lucide) + texto **"Reemplazos autorizados"**
     (`text-[11px] font-semibold uppercase tracking-wide text-muted`, `:374-377`).
   - Contador `{subs.length}/{MAX_ITEM_SUBSTITUTIONS}` en `font-mono tabular-nums text-subtle`, solo si
     hay ≥1 (`:378-382`).
   - Con reemplazos: lista de chips removibles (`rounded-pill border bg-surface-sunken`, `:385-403`);
     cada chip = `sub.food.name` truncado + botón X (icono lucide `X`) con
     `accessibilityLabel="Quitar reemplazo {sub.food.name}"` → dispatch `REMOVE_ITEM_SUBSTITUTION`
     (`:393-400`).
   - Sin reemplazos: hint **"Alimentos que el alumno puede usar en lugar de {prescribedName}."** donde
     `prescribedName = item.food ? item.food.name : (item.customName?.trim() || 'este alimento')`
     (`:369,404-408`).
   - En tope (`subs.length >= MAX`): texto **"Alcanzaste el maximo de 8 reemplazos."**
     (usar la constante, no el literal; `:410-411`). En tope NO se muestra el botón de agregar.
   - Bajo tope: botón secundario con icono `Plus` + label **"Reemplazo"** (`:424-432`) que abre el
     buscador; en web es un `FoodSearch` inline + botón **"Listo"** (`:412-422`).
   RN `builder/[clientId].tsx:569-667` (`ItemEditor`): renderiza thumbnail, nombre/custom, cantidad,
   `UnitToggle`, campos custom y `MacroChipRow`. **NO existe ninguna sección de reemplazos.**
   Cierre: agregar la sección de reemplazos al final de `ItemEditor` (después del `MacroChipRow` de
   `:662-664`), replicando overline/contador/chips/hint/tope con los MISMOS copys. Icono `Repeat` a
   importar de `lucide-react-native`. Tokens NativeWind equivalentes (`text-text-muted`,
   `border-border-subtle`, `bg-surface-sunken`, `rounded-pill`, `text-text-subtle`) — no inventar tokens.
   Los chips deben respetar target táctil ≥44px en el botón X (min-h/min-w) y truncar nombres largos
   (`numberOfLines={1}`).

6. **Reuso del buscador de catálogo (adaptación nativa sancionada).**
   Web: la afordancia abre el MISMO `FoodSearch` del builder inline dentro de la card del ítem
   (`:414`, buscador con grid multi-columna). RN ya tiene ese buscador como `FoodSearchModal`
   full-screen (`builder/[clientId].tsx:917-1043`, adaptación nativa ya aceptada en INVENTARIO §1),
   invocado hoy con un único target `searchSlotKey: string | null` (`:136,248-260,366-369`) que solo
   sabe "agregar ítem a franja". **Delta de wiring:** ese target es demasiado estrecho para distinguir
   "agregar ítem" de "agregar reemplazo a un ítem".
   Cierre: generalizar el target del modal a un discriminado
   `{ mode: 'item'; slotKey } | { mode: 'substitution'; slotKey; itemKey }` (o equivalente) y bifurcar
   `handleSelectFood` (`:248-260`): `'item'` → `ADD_ITEM` (comportamiento actual); `'substitution'` →
   `ADD_ITEM_SUBSTITUTION` con `key: genKey('sub')` (`genKey` en `:74`) y
   `food: mapFoodCatalogItemToBuilderFood(food)` (`:51,698`). Espejo del patrón YA sancionado en el
   quick-edit RN, que reusa un solo sheet con `SearchTarget { mode: 'add' | 'swap'; …; itemKey }`
   (`QuickEditMode.tsx:62,138,517,538`). No crear un segundo modal.

7. **Gating structured/hybrid (implícito, verificar que se preserve).**
   Web: `SubstitutionsField` solo se monta porque `ItemRow`→`SlotEditor` solo existen en structured/hybrid.
   RN: `ItemEditor` se monta desde `SlotEditor`→`ConstructionStep`, que hace early-return "Plan flexible"
   cuando `!strategyUsesSlots(state.strategy)` (`builder/[clientId].tsx:770-780`;
   `strategyUsesSlots` = structured|hybrid, `nutrition-v2-builder.ts:102-104`). Por lo tanto la sección
   de reemplazos hereda el gate correcto sin lógica extra. **En paridad de intención** — no agregar
   guardas redundantes, pero confirmar que la sección vive dentro de `ItemEditor` (no se filtra a flexible).

## Cierre (qué debe quedar)

1. `nutrition-v2-builder.ts`: tipo `BuilderItemSubstitution`, campo `BuilderItem.substitutions`
   (default `[]` en `createEmptyItem`), constante `MAX_ITEM_SUBSTITUTIONS = 8`, acciones
   `ADD_ITEM_SUBSTITUTION`/`REMOVE_ITEM_SUBSTITUTION` con el cinturón triple del reducer web, y el
   spread condicional de `substitutions` en `assembleDraft`. Con esto el write-path preexistente
   (`:652-664,1035-1051`) deja de ser inerte.
2. `builder/[clientId].tsx`: sección "Reemplazos autorizados" en `ItemEditor` con overline+icono
   `Repeat`, contador `N/8`, chips removibles, hint contextual con `prescribedName`, mensaje de tope, y
   botón "Reemplazo" que abre el `FoodSearchModal` reusado; target del modal generalizado a
   item|substitution; `handleSelectFood` bifurcado. Copys, tope (8), estados y gate structured/hybrid a
   paridad literal con el web.
3. Quick-edit **intocado** (paridad web = carry-over read-only). El `TODO(F-02 P3)` de
   `QuickEditMode.tsx:129-130` puede reescribirse a un puntero que diga "editor vive en el builder
   (4B-10)", pero NO se agrega editor al quick-edit (sería RN-extra sin contraparte web).
4. Test unitario del reducer (nuevo o extendido) que cubra: agregar hasta 8, rechazo en el 9º, rechazo
   de duplicado por `food.id`, rechazo del propio prescrito, remoción por `subKey`, y que `assembleDraft`
   emita la clave `substitutions` solo cuando hay ≥1 (y ausente cuando 0 → byte-idéntico a hoy).
5. Gates de módulo: `pnpm --filter @eva/mobile exec tsc --noEmit` 0 errores, lint 0 nuevos, tokens.

## Comprobación objetiva

Plan structured/hybrid en el builder RN: en un ítem prescrito del catálogo, tocar "Reemplazo" abre el
buscador full-screen; elegir un alimento lo agrega como chip; el contador marca "1/8"; agregar 8
distintos deshabilita/oculta el botón y muestra "Alcanzaste el maximo de 8 reemplazos."; intentar
agregar el mismo alimento dos veces o el propio prescrito no crea chip; la X de un chip lo quita.
Publicar y verificar en `nutrition_item_substitutions_v2` (o en la vista del alumno RN, que ya renderiza
`ItemSubstitutionsHint`, `alumno/(tabs)/nutrition-v2/index.tsx:1685`) que los reemplazos quedaron
congelados. Un ítem sin reemplazos publica exactamente como hoy (sin filas nuevas). Capturas web móvil
(`SubstitutionsField`) vs RN: overline "Reemplazos autorizados", contador, chips, hint y mensaje de tope
idénticos en copy. El quick-edit no ofrece editor de reemplazos (igual que la web).
