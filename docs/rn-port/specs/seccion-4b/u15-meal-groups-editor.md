# 4B-15 — Grupos de comidas: editor + chrome (paridad fina)

Archivo RN (único editable): `apps/mobile/app/coach/meal-groups.tsx`.
Referencia web: `apps/web/src/app/coach/meal-groups/page.tsx` (chrome del hub),
`MealGroupLibraryClient.tsx` (lista + feedback de borrado) y `MealGroupModal.tsx`
(editor). Los tres se sirven bajo el mismo layout responsive del coach.

> **P0 ya aplicado — NO re-especificar.** El cálculo de macros duplicado y divergente
> (`un` ignoraba `serving_size`) se cerró en **4B-01 @ `bce2eb3b`**: ambas superficies RN
> consumen `mealGroupItemMacros`/`mealGroupTotals` de `lib/meal-groups.ts` (motor
> `@eva/nutrition-engine`). Esta unidad asume esos números correctos y solo ataca el
> **formato de presentación** y las **interacciones del editor + el chrome del hub**.

> **Restricción de wave (RANKING §Wave 4B.3):** esta unidad y 4B-01 comparten
> `meal-groups.tsx` → nunca en la misma wave. 4B-01 ya cerró; esta corre después.
> El único archivo a tocar es `apps/mobile/app/coach/meal-groups.tsx`. Ver el **Riesgo
> de la cantidad decimal** más abajo: cerrarla del todo exige una línea en
> `lib/meal-groups.ts`, que está FUERA del archivo de esta unidad.

## Afirmaciones y deltas

Cada delta con evidencia `archivo:línea` de ambos lados, verificada contra el código
actual (no de memoria).

1. **Banner explicativo "Info" — FALTA en RN.**
   Web `page.tsx:35-40`: bajo el header y sobre la barra buscar+botón, caja
   `flex items-start gap-2.5 rounded-card bg-surface-sunken px-3.5 py-2.5` con icono
   `Info` (`mt-0.5 h-[15px] w-[15px] shrink-0 text-muted`) + texto `text-xs
   leading-relaxed text-muted`, copy exacto:
   **"Un grupo agrupa varios alimentos para insertarlos de una en cualquier comida del plan."**
   RN `meal-groups.tsx`: no existe; tras el header (`:161-178`) se salta directo al
   loader/edit/list (`:180`). El `Info` de `lucide-react-native` NO está importado
   (`:6` importa `ChevronLeft, Layers, PencilLine, Plus, Search, Trash2`).
   **Delta:** banner ausente.

2. **Subtítulo del header — copy divergente.**
   Web `page.tsx:31`: `<p className="truncate text-[13px] text-muted">`**Combos de
   alimentos reutilizables**`</p>`.
   RN `meal-groups.tsx:174-176`: `Conjuntos de alimentos reutilizables`.
   **Delta:** "Conjuntos" vs "Combos" (cosmético, copy).

3. **Hint "1 un ≈ Xg" bajo el ítem — FALTA en RN.**
   Web `MealGroupModal.tsx:243-247`: cuando `item.unit === 'un'`, bajo la línea de
   macros del ítem, `<p className="mt-1 text-[10.5px] font-medium text-subtle">`
   **`1 un ≈ {Number(item.food.serving_size) || 100} g`**`</p>`.
   RN `meal-groups.tsx:210-218`: la columna del ítem pinta nombre (`:212-214`) +
   macros (`:215-217`) y nada más; no hay hint por unidad.
   **Delta:** hint ausente (el coach no ve a cuántos gramos equivale 1 unidad).

4. **Cantidad: solo enteros en RN vs decimal en web.**
   Web `MealGroupModal.tsx:262-270`: `<Input type="number" min="0.01" step="any"
   value={item.quantity || ''} onChange={(e) => handleUpdateQuantity(index,
   Number(e.target.value))}>` → admite fracciones (0.5 un, 12.5 g). Persiste crudo:
   `handleSave` mapea `quantity: item.quantity` sin redondear (`:160-164`).
   RN `meal-groups.tsx:237-244`: `<TextInput keyboardType="number-pad"
   onChangeText={(t) => updateQty(index, Number(t.replace(/[^0-9]/g, '')) || 0)}>` →
   **strippea todo lo no-dígito**, solo enteros.
   **Delta:** RN no permite cantidades fraccionarias. Ver **Riesgo** al final: además
   `saveMealGroup` (`lib/meal-groups.ts:117`) hace `Math.round(it.quantity) || 0`, así
   que aunque el input aceptara decimales, la escritura los perdería — cerrar del todo
   la paridad requiere tocar esa línea, fuera del archivo de esta unidad.

5. **Swap de unidad: RN usa 100↔1 fijo; web recalcula por `serving_size`.**
   Web `MealGroupModal.tsx:50-54` define
   `defaultQuantity(unit, food) = unit==='un' ? 1 : (serving_size finito>0 ? serving_size : 100)`.
   `handleUpdateUnit` (`:129-140`): `previousDefault = defaultQuantity(previousUnit,
   food)`, `shouldReplaceQuantity = quantity === previousDefault`; cambia la unidad y,
   solo si la cantidad era la default anterior, la reemplaza por `defaultQuantity(unit,
   food)`. Con `serving_size = 60`, cambiar g→un deja 1 (no 60).
   RN `meal-groups.tsx:112-123`: swap fijo — `if (unit==='un' && quantity===100)
   quantity=1; else if ((unit==='g'||'ml') && quantity===1) quantity=100`. Con
   `serving_size ≠ 100`, la comparación contra 100/1 nunca acierta y deja cantidades
   absurdas (ej. queda "60 un" o "1 g").
   **Delta:** lógica de swap divergente; agrava el caso `serving_size ≠ 100`.

6. **Alta de alimento (`addFood`): unidad/cantidad iniciales sin normalizar.**
   Web `MealGroupModal.tsx:105-117` (`handleAddFood`): `unit =
   normalizeUnit(food.serving_unit, food)` (`:35-43`, mapea a `g|ml|un`) y `quantity =
   defaultQuantity(unit, food)`. Un alimento con `serving_unit='un', serving_size=60`
   entra como **1 un**.
   RN `meal-groups.tsx:95-105` (`addFood`): `quantity: food.serving_size || 100`,
   `unit: food.serving_unit || 'g'` — crudo, sin `normalizeUnit` ni `defaultQuantity`.
   El mismo alimento entra como **60 un** (absurdo).
   **Delta:** el alta no normaliza; misma raíz que el #5 (falta el par
   `normalizeUnit`/`defaultQuantity`).

7. **Validación `quantity > 0` al guardar — FALTA en RN.**
   Web `MealGroupModal.tsx:151-154`: `if (items.some((item) => !Number.isFinite(
   item.quantity) || item.quantity <= 0)) toast.error('Todas las cantidades deben ser
   mayores a cero')` y aborta.
   RN `meal-groups.tsx:125-127`: `handleSave` valida nombre (`:126`) e ítems
   no vacíos (`:127`) pero **no** valida la cantidad; `saveMealGroup`
   (`lib/meal-groups.ts:117`) hace `Math.round(it.quantity) || 0` → una cantidad 0 o
   negativa se guarda como `0` sin avisar.
   **Delta:** falta la guarda de cantidad; RN persiste ceros/negativos en silencio.

8. **Formato de copy de macros del EDITOR — divergente.**
   Web `MealGroupModal.tsx:241` (fila de ítem):
   `{Math.round(macros.calories)} kcal · P {Math.round(macros.protein)}g · C
   {Math.round(macros.carbs)}g · G {Math.round(macros.fats)}g`.
   Web `MealGroupModal.tsx:291` (totales):
   `~{Math.round(totals.calories)} kcal · P {…protein}g · C {…carbs}g · G {…fats}g`.
   RN `meal-groups.tsx:215-217` (fila de ítem):
   `{Math.round(m.calories)} kcal · P{Math.round(m.protein)} C{Math.round(m.carbs)}
   G{Math.round(m.fats)}` — **sin ` · `, sin `g`, sin espacio tras P/C/G**.
   RN `meal-groups.tsx:254-256` (totales): mismo formato comprimido `~… kcal ·
   P… C… G…`.
   **Delta:** separador y sufijo `g` ausentes en el editor RN. (El redondeo a entero
   ya está en paridad — ambos `Math.round` de display, ver 4B-01.)

9. **Feedback de éxito — FALTA en RN.**
   Web: al guardar `toast.success('Grupo guardado correctamente')` (`MealGroupModal.tsx:170`);
   al borrar `toast.success('Grupo eliminado correctamente')` (`MealGroupLibraryClient.tsx:80`).
   RN `meal-groups.tsx`: `handleSave` (`:125-142`) al éxito solo actualiza la lista y
   `cancelEdit()`; `performDelete` (`:144-153`) solo filtra la lista y cierra el diálogo.
   Ningún feedback positivo (los `Alert.alert` son solo para error, `:135,150`).
   **Delta:** sin confirmación visible de éxito. RN **ya tiene** el singleton
   `toast` (`apps/mobile/components/Toast.tsx`, API 1:1 con sonner: `toast.success(msg)`,
   `<Toaster/>` montado en `app/_layout.tsx`) — es la adaptación nativa correcta, no un
   invento.

### RN-extras sin contraparte web (decisión 4 del owner: RETIRAR salvo excepción escrita)

10. **Botón "Nuevo grupo" en el empty state — RETIRAR.**
    RN `meal-groups.tsx:287`: el `EmptyState` sin búsqueda añade
    `action={<Button label="Nuevo grupo" leftIcon={Plus} variant="sport"
    onPress={openCreate} />}`. Web `MealGroupLibraryClient.tsx:133-146`: el empty state
    es **solo texto** (icono + título + copy), sin CTA.
    **Veredicto:** RN-extra sin contraparte web. Por `DECISIONES-OWNER.md` decisión 4
    (RN-extras = fuera salvo excepción escrita por ítem; sin excepción registrada para
    este) y por el precedente 4A (los RN-extras se eliminan, p. ej. u03 item 6) →
    **RETIRAR** el `action`. Si el owner lo quiere conservar como affordance nativa,
    requiere excepción escrita en `DECISIONES-OWNER.md` ANTES de codificar (no la
    dé por sentada).

### Adaptaciones nativas legítimas (NO tocar — no son deltas)

- **Editor INLINE** en vez de `Dialog` modal (evita conflicto de portales con el
  `FoodSearchSheet` bottom-sheet) — documentado en `meal-groups.tsx:28-32`. Mantener.
- **`FoodSearchSheet`** (bottom-sheet, `:354`) en vez del panel `FoodSearch`
  colapsable de la web. Mantener.
- **`Dialog` de confirmación de borrado** con nombre del grupo + "no se puede
  deshacer" (`meal-groups.tsx:331-352`) en vez de `window.confirm`
  (`MealGroupLibraryClient.tsx:75`). El `confirm` del browser no tiene equivalente RN;
  el `Dialog` es la adaptación correcta. Mantener.
- **`Alert.alert`** para errores de validación/guardado (`:126,127,135,150`) en vez de
  `toast.error`. Mantener para errores; el éxito sí va por `toast` (delta #9).
- **Meta de la tarjeta de grupo YA en paridad** — `meal-groups.tsx:298-300`
  (`{n} ingredientes · ~{kcal} kcal · {p}g P`) == web `MealGroupLibraryClient.tsx:158`.
  NO tocar (el delta de formato #8 es SOLO del editor, no de la tarjeta de lista).

## Cierre (qué debe quedar)

1. **Banner Info** (delta #1): en el modo lista (`mode !== 'edit'`), entre el header
   (`:178`) y `listHead` (`:267`), una fila `flexDirection:'row'`,
   `alignItems:'flex-start'`, `gap:10`, `paddingHorizontal:14`, `paddingVertical:10`,
   `borderRadius: theme.radius.lg`, `backgroundColor: theme.secondary` (equivalente
   sunken), con `Info` de `lucide-react-native` (size 15, `color:
   theme.mutedForeground`, `marginTop:2`) y `Text` `fontSize:12`, `lineHeight:17`,
   `color: theme.mutedForeground`, `fontFamily: FONT.ui`, copy **exacto**:
   "Un grupo agrupa varios alimentos para insertarlos de una en cualquier comida del
   plan." (No mostrar en modo edición: la web lo tiene en la página, no en el modal.)

2. **Subtítulo** (delta #2): `meal-groups.tsx:175` → **"Combos de alimentos
   reutilizables"**.

3. **Hint "1 un ≈ Xg"** (delta #3): en la columna del ítem, inmediatamente bajo el
   `Text` de macros (`:217`), condicional `item.unit === 'un'`, un `Text`
   `fontSize:10.5`, `marginTop:4`, `color: theme.mutedForeground`, `fontFamily:
   FONT.ui` (o `FONT.uiMedium` si existe; web usa `font-medium`), copy
   `` `1 un ≈ ${Number(item.food?.serving_size) || 100} g` ``.

4. **Cantidad decimal** (delta #4): el input de cantidad acepta fracciones. Portar el
   patrón del repo (`add-food-v2.tsx:573-575`): `keyboardType="decimal-pad"` +
   `inputMode="decimal"`; `onChangeText` conserva la entrada parcial, normaliza `,`→`.`
   y admite un solo separador (no `replace(/[^0-9]/g,'')`). El estado de cantidad debe
   poder representar el decimal (mantener texto crudo mientras se escribe y parsear a
   `Number` al validar/guardar, o parsear tolerante). Valor mostrado: sin forzar
   entero. **VER RIESGO**: para que el decimal SOBREVIVA al guardado hay que relajar el
   `Math.round(it.quantity)` de `lib/meal-groups.ts:117` (web persiste `item.quantity`
   crudo, `MealGroupModal.tsx:163`) — decisión del juez, ver abajo.

5. **Swap de unidad + alta normalizados** (deltas #5 y #6): portar `defaultQuantity(
   unit, food)` (1:1 con `MealGroupModal.tsx:50-54`) y la lógica
   `previousDefault`/`shouldReplaceQuantity` (`:129-140`) a `updateUnit`
   (`:112-123`), reemplazando el swap fijo 100↔1. Portar también `normalizeUnit`
   (`MealGroupModal.tsx:35-43`) y aplicarlo en `addFood` (`:95-105`):
   `unit = normalizeUnit(food.serving_unit, food)`, `quantity = defaultQuantity(unit,
   food)`. (Las unidades ofrecidas — `unitsForItem`, `:36-40` — ya cubren `g|ml|un`;
   confirmar que siguen coincidiendo con `allowedUnits` web, `MealGroupModal.tsx:45-48`.)

6. **Validación `quantity > 0`** (delta #7): en `handleSave`, tras la guarda de ítems
   no vacíos (`:127`), agregar `if (items.some((it) => !Number.isFinite(it.quantity)
   || it.quantity <= 0)) { Alert.alert('Cantidad inválida', 'Todas las cantidades
   deben ser mayores a cero.'); return }`. Mensaje = copy web
   (`MealGroupModal.tsx:152`), adaptado al patrón título+mensaje del `Alert.alert`
   nativo (mismos títulos cortos que las otras validaciones RN, `:126-127`).

7. **Formato de copy del editor** (delta #8): fila de ítem (`:215-217`) y totales
   (`:254-256`) a
   `` `${Math.round(x.calories)} kcal · P ${Math.round(x.protein)}g · C
   ${Math.round(x.carbs)}g · G ${Math.round(x.fats)}g` `` (totales con `~` de prefijo,
   1:1 con `MealGroupModal.tsx:241,291`). Mantener `FONT.mono`/`FONT.monoBold` ya
   presentes.

8. **Feedback de éxito** (delta #9): `import { toast } from '../../components/Toast'`;
   en `handleSave` tras el éxito → `toast.success('Grupo guardado correctamente')`; en
   `performDelete` tras el éxito → `toast.success('Grupo eliminado correctamente')`
   (copys exactos de `MealGroupModal.tsx:170` y `MealGroupLibraryClient.tsx:80`).

9. **Retirar el RN-extra** (delta #10): quitar el prop `action` del `EmptyState`
   (`:287`), dejando el empty state solo icono+título+copy como la web. (El botón
   "Grupo" del `listHead`, `:269-272`, sí tiene contraparte web —
   `MealGroupLibraryClient.tsx:119-130` — y se conserva.)

## Riesgo bloqueante — decisión del juez (cantidad decimal cruza de archivo)

El delta #4 no se puede cerrar de punta a punta editando SOLO `meal-groups.tsx`:
`saveMealGroup` en `lib/meal-groups.ts:117` hace `quantity: Math.round(it.quantity) ||
0`, mientras la web persiste el valor crudo (`MealGroupModal.tsx:163`,
`saveMealGroup` action sin redondeo). Si se porta el input decimal pero NO se relaja
ese `Math.round`, el coach escribe "0.5 un", ve 0.5 en pantalla y al reabrir el grupo
lee "1" (o "0" para <0.5) — regresión silenciosa peor que el estado actual.
Opciones para el juez ANTES de codificar:
- **(a)** Ampliar el alcance de esta unidad a esa única línea de `lib/meal-groups.ts`
  (ningún otro trabajo de la wave 4B.3 toca ese archivo — 4B-01 ya cerró — así que no
  hay colisión), persistiendo `it.quantity` crudo como la web. Recomendado.
- **(b)** Dejar el input decimal fuera de esta unidad (cerrar solo #1-3,5-10) y abrir
  #4 como unidad propia que toque `lib/meal-groups.ts`.
No codificar el input decimal sin resolver esto: media implementación corrompe datos.

## Comprobación objetiva

Con un alimento de `serving_size = 60`, `serving_unit = 'un'`, macros conocidos
(p. ej. huevo 13 g P/100 g), en `meal-groups.tsx` vs la web responsive del coach:

1. **Alta:** agregar el alimento entra como **1 un** (no 60 un) — captura RN == web.
2. **Swap:** en un ítem con "60 g" (la default), cambiar a `un` deja **1 un**; volver a
   `g` deja **60 g** (paridad `defaultQuantity`).
3. **Hint:** con unidad `un`, bajo el ítem se lee **"1 un ≈ 60 g"**.
4. **Decimal:** escribir **"0.5"** un se acepta, se muestra 0.5 y —tras cerrar el
   riesgo bloqueante— sobrevive a guardar+reabrir (paridad web). Los macros del ítem
   escalan por 0.5 (motor de 4B-01).
5. **Validación:** con un ítem en 0, "Guardar grupo" bloquea con
   "Todas las cantidades deben ser mayores a cero." y no persiste.
6. **Formato editor:** la fila del ítem y el total leen
   `… kcal · P …g · C …g · G …g` (con ` · ` y `g`), idéntico a la web.
7. **Chrome:** el banner Info con el copy exacto aparece en la lista; el subtítulo dice
   "Combos de alimentos reutilizables"; el empty state (sin búsqueda) es solo texto,
   sin botón.
8. **Éxito:** guardar y borrar disparan el `toast.success` con los copys web; los
   errores siguen por `Alert.alert`.

## Cierre (2026-07-21)

Cerrados los 9 deltas + el riesgo bloqueante, según las resoluciones del juez.

- **#1 Banner Info:** fila `infoBanner` (row / flex-start / gap 10 / mh 16 / pv 10,
  ph 14 / `borderRadius: theme.radius.lg` / `bg: theme.secondary`) con `Info` (size 15,
  `mutedForeground`, `marginTop:2`) + `Text` (fontSize 12, lineHeight 17, `FONT.ui`),
  copy exacto. Solo en modo lista, entre header y `listHead`.
- **#2 Subtítulo:** "Combos de alimentos reutilizables".
- **#3 Hint `1 un ≈ Xg`:** `Text` `itemHint` (fontSize 10.5, marginTop 4, `FONT.uiMedium`
  — **existe** en `lib/typography`, no hizo falta el fallback a `FONT.ui`), condicional
  `item.unit === 'un'`, bajo la línea de macros.
- **#4 Cantidad decimal:** `keyboardType="decimal-pad"` + `inputMode="decimal"`;
  `sanitizeDecimal` (dígitos + 1 separador, `,`→`.`); estado `qtyDraft {index,text}`
  conserva la entrada parcial ("0.") mientras el input tiene foco y se limpia en
  `onBlur`/`updateUnit`/`removeItem`. **Riesgo bloqueante resuelto opción (a):**
  `lib/meal-groups.ts` ahora persiste `Number(it.quantity) || 0` (sin `Math.round`),
  crudo como la web.
- **#5/#6 Swap + alta normalizados:** portados `normalizeUnit` (1:1 `MealGroupModal:35-43`)
  y `defaultQuantity` (`:50-54`); `addFood` normaliza unidad+cantidad; `updateUnit` usa
  `previousDefault`/`shouldReplaceQuantity` (`:129-140`), respetando `serving_size`.
- **#7 Validación `quantity > 0`:** `Alert.alert('Cantidad inválida', …)` tras la guarda
  de ítems no vacíos.
- **#8 Formato editor:** fila de ítem y total a `… kcal · P …g · C …g · G …g`.
- **#9 Éxito:** `toast.success` (singleton `components/Toast`) al guardar y borrar;
  errores siguen por `Alert.alert`.
- **#10 RN-extra retirado:** quitado el `action` "Nuevo grupo" del `EmptyState`.

**Gates:** `tsc --noEmit` 0 errores · `vitest run tests/mobile-meal-groups-macros.test.ts`
8/8 (nuevo caso: 0.5 persiste como 0.5, no 1) · `eslint` de los 3 archivos 0 errores.

**Concern fuera de alcance (no en los deltas listados):** `openEdit` no normaliza las
unidades legacy `'u'` al abrir un grupo existente (la web sí lo hace en el constructor
del modal, `MealGroupModal:82`). Un ítem guardado con `'u'` no mostraría el hint ni
entraría en la comparación `defaultQuantity` hasta el primer swap. Comportamiento
preexistente; los macros ya normalizan `'u'→'un'` en `lib`. No se tocó por no figurar en
las resoluciones del juez.
