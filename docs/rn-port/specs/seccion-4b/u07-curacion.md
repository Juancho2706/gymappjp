# 4B-07 — Curación V2 del coach (cola de scans sin match + alta de alimento custom)

Archivos RN (frontera EXPLÍCITA):
- **CREAR** `apps/mobile/app/coach/nutrition-v2/curation.tsx` (pantalla nueva: cola de curación —
  lista paginada de GTIN sin match, hoja para resolver = vincular existente / crear+vincular).
- **CREAR** `apps/mobile/lib/nutrition-v2-curation.api.ts` (contrato de datos: `listMissingFoodCodesV2`,
  `resolveMissingFoodCodeV2`, `createCoachFoodForCurationV2`) + test del puro `formatRelativeDate`.
  Port 1:1 de la lógica de `apps/web/src/app/coach/nutrition-v2/_actions/curation.actions.ts`
  sobre el cliente `supabase` RN (mismo patrón de persistencia directa que el builder V2 —
  ver afirmación 2).
- **CONSUMIR sin modificar contrato** `apps/mobile/lib/nutrition-v2-catalog.api.ts`
  (`searchFoodCatalogV2`, ya existe) para el picker "Buscar existente".
- **REUSAR** primitivas ya portadas en 4B-06: `FoodThumbnail`, `MacroChipRow`,
  `NutritionStatePanel` (`components/nutrition-v2/NutritionV2Kit.tsx`), `Sheet`
  (`components/Sheet.tsx`), `NutritionHeader`. **NO** reusar `FoodSearchModal` del builder
  (300 ms + placeholder distinto — ver afirmación 5).
- **NO tocar** `apps/mobile/app/coach/nutrition-v2/index.tsx` (territorio del tablist del hub,
  4B-05; el cableado de la tab "Curación" lo decide el juez al integrar — ver §Frontera).

Referencia web (canónica, no V1):
`apps/web/src/app/coach/nutrition-v2/_components/CurationQueue.tsx:1-537` (cola + `ResolveDialog` +
`CatalogPicker` + `CreateFoodForm`) +
server actions `apps/web/src/app/coach/nutrition-v2/_actions/curation.actions.ts:96-283`
(`listMissingFoodCodesHubAction`, `resolveMissingFoodCodeHubAction`,
`createCoachFoodForCurationAction`).
`NutritionHubTabs.tsx:12-13,63-65` monta `<CurationQueue countryCode="CL" />` bajo la tab "Curación".

## Contexto (referencia canónica, no V1)

Aquí vive el **alta de alimento custom del coach en V2** (decisión owner 4 / 4B-06 §Contexto:
el catálogo `foods.tsx` es read-only; crear alimento vive **solo** en curación). La curación es la
cola de GTIN que los alumnos escanearon y que aún no existen en el catálogo local
(`food_catalog_missing_codes`, `resolved_at IS NULL`); el coach los resuelve **vinculando** una fila
del catálogo o **creando** un alimento coach-scoped y vinculándolo en un paso. La pantalla nace 1:1
con el `CurationQueue` web: **no hay RN-extra nuevo que retirar** (decisión owner 4).

## Frontera de servidor (P0 — leer antes de codificar)

**No existe endpoint móvil ni RPC de curación. Verificado.** Los únicos endpoints móviles de
nutrición V2 son `catalog` (GET search/gtin, POST report), `coach` (GET hub/client), `intake`, `read`
(`apps/web/src/app/api/mobile/nutrition-v2/{catalog,coach,intake,read}/route.ts`). Ninguno cubre
listar/resolver/crear códigos de curación (grep `missing_codes|curation` en `apps/web/src/app/api/mobile`
= 0 matches). Tampoco hay endpoint móvil para crear alimentos coach (grep `createCoachFood` en
`api/mobile` = 0).

**El camino autoritativo NO es un RPC nuevo (nunca inventar RPC).** La `curation.actions.ts` web
**no usa ningún RPC**: son operaciones de tabla planas bajo RLS —
`.from('food_catalog_missing_codes').select(...).is('resolved_at', null).order(...).range(...)`
(`:107-113`), `.update({resolved_food_id, resolved_at}).eq('id',...).is('resolved_at', null)`
(`:156-162`), `.from('foods').insert({...}).select('id').single()` (`:230-250`). La **RLS es la
frontera real** (comentario del propio archivo `:16-18`; `curation.actions.ts:143` "RLS es la
frontera"). El camino autoritativo para RN es **el mismo que ya usa el builder V2**: el cliente
`supabase-js` RN autenticado (PostgREST) contra esas tablas, con RLS re-validando server-side; un
`42501` == `SCOPE_DENIED` (idéntico contrato que `nutrition-v2-builder.ts:1-17,211`, que persiste
planes directo por supabase-js espejando `plan-persistence.ts`). **Verificado que la RLS lo permite:**
- `GRANT SELECT, INSERT, UPDATE ON public.food_catalog_missing_codes TO authenticated`
  (`20260714073000_nutrition_catalog_cl_and_intake_v2.sql:181`).
- SELECT del coach: policy `food_catalog_missing_codes_coach_select` acota a los códigos de
  `clients` cuyo `coach_id = auth.uid()` (`:191-204`); `_team_select` al pool
  (`current_user_pool_client_ids()`, `:205-214`).
- UPDATE del coach: `food_catalog_missing_codes_coach_update` (`20260714151500_food_catalog_missing_codes_curation.sql:7-25`) + `_team_update` (`:29-33`).
- INSERT/DELETE de `foods`: policies `foods_insert_own` / `foods_delete_own`
  (`20260608180000_consolidate_foods_exercises_org_rls.sql:36,41`; el web insert exige
  `coach_id = auth.uid()`, `org_id NULL`, ver `curation.actions.ts:189-247`).

**Delta de gate app-layer (documentar, no bloquea):** la web re-verifica en cada acción
`isNutritionV2Enabled({surface:'webCoach'})` + `nutritionV2CoachScopeFromWorkspace(workspace)` +
`rateLimitNutritionCoachWrite` (`curation.actions.ts:40-77,49-54`). RN no tiene ese eco app-layer
(igual que el builder: el gate cliente es suave, la RLS es la barrera real). La pantalla RN sí
respeta el gate cliente de superficie (`entitlements.ready && isEnabled('nutritionV2Coach')` +
scope de workspace, mismo fail-closed que el hub `index.tsx:73-81`) para no montar la superficie
fuera del canary; **la autorización de datos la impone la RLS en cada operación**, no la UI (regla
no-negociable: la UI nunca autoriza).

> Si el owner prefiere endurecer con eco app-layer, el camino autoritativo alterno es **crear** un
> endpoint REST móvil `/api/mobile/nutrition-v2/curation` (GET list, POST resolve, POST create-link)
> que espeje `curation.actions.ts` con `gateNutritionV2Api({surface:'mobileCoach'})` +
> `NutritionV2CoachScopeSchema` + rate-limit, reusando las MISMAS tablas/RLS (sin RPC nuevo). Es
> **más trabajo** y **no** cambia la barrera real (RLS). Recomendación de esta spec: **camino
> directo por supabase-js** (paridad con el builder ya sancionado); dejar el endpoint como opción
> del owner si exige consistencia con el resto de superficies móviles read.

## Frontera de archivos con el hub (4B-05)

Web: el hub tiene `role="tablist"` (Alumnos / Alimentos / **Curación**). RN: `index.tsx` es
roster-only (o con el tablist que aterrice 4B-05). Igual que 4B-06, **esta unidad crea
`curation.tsx` como pantalla propia y NO edita `index.tsx`**. Entrega pantalla + api + test listos
para montar; el cableado (tab del hub o pantalla enlazada) es **decisión del juez** al integrar.

## Afirmaciones y deltas

1. **La cola de curación no existe en RN. FALTA COMPLETA.**
   Web `CurationQueue.tsx:30-165` es una superficie propia (lista paginada + hoja de resolución).
   RN no tiene ninguna pantalla, api ni referencia (`ls apps/mobile/app/coach/nutrition-v2/` =
   `index.tsx`, `[clientId].tsx`, `builder/`; grep `missing_codes|curation` en `apps/mobile` = 0).
   **Delta:** crear `curation.tsx` + `nutrition-v2-curation.api.ts` de cero.

2. **Persistencia directa por supabase-js (patrón sancionado del builder), NO endpoint/RPC.**
   Ver §Frontera de servidor. El nuevo `nutrition-v2-curation.api.ts` importa el `supabase` RN
   (mismo import que `builder/[clientId].tsx:41`) y expone tres funciones que **espejan 1:1**
   `curation.actions.ts`:
   - `listMissingFoodCodesV2({ offset })` → `.from('food_catalog_missing_codes')
     .select('id, barcode, country_code, sightings, first_seen_at, last_seen_at')
     .is('resolved_at', null).order('last_seen_at', { ascending:false }).range(from, from+20)`;
     `hasMore = rows.length > 20`, `nextOffset = hasMore ? from+20 : null` (`curation.actions.ts:105-134`).
     Mapea snake→camel (`countryCode`, `firstSeenAt`, `lastSeenAt`).
   - `resolveMissingFoodCodeV2({ missingCodeId, resolvedFoodId })` → `.update({ resolved_food_id,
     resolved_at: new Date().toISOString() }).eq('id', missingCodeId).is('resolved_at', null)`
     (`:155-162`).
   - `createCoachFoodForCurationV2({ missingCodeId, name, brand, unit, calories, proteinG, carbsG,
     fatsG })` → **replica el flujo no-atómico completo** (`:190-283`): idempotencia best-effort
     (buscar `foods` coach-scoped con nombre normalizado antes de insertar, `:208-226`), insert con
     los MISMOS campos (`serving_size:100`, `serving_unit:unit`, `is_liquid: unit==='ml'`,
     `category:'otro'`, `country_code:'CL'`, `catalog_source:'coach'`,
     `verification_status:'coach_verified'`, `coach_id:userId`, `org_id:null`, `:230-248`), luego
     update del código; compensación best-effort (borrar el food si el vínculo falla **y** lo
     creamos en esta llamada, `:275-277`). **`42501` → `SCOPE_DENIED`** en cada op (mismo mapeo que
     web `:115,165,253`). **Delta:** portar la lógica de idempotencia/compensación tal cual — es la
     mitigación del retry no-transaccional; omitirla dejaría huérfanos/duplicados.
   Los bounds de validación (Zod web `:173-182`) se replican como guardas del cliente antes de
   escribir: `name` 1..180, `brand` ≤180 nullable, `unit ∈ {g,ml}`, `calories` 0..2000, macros
   0..500. Cierre: api pura de datos, RLS como barrera, sin RPC nuevo.

3. **Estados loading / error / vacío — copys verbatim.**
   Web `CurationQueue.tsx:76-99`:
   - Loading: spinner en card (`Loader2` sobre `rounded-card border bg-surface-card`, `:76-82`).
     RN: spinner DS (`ActivityIndicator`/skeleton del kit) — adaptación visual, mismo rol.
   - Error: `NutritionStatePanel icon="error" tone="danger" illustration="error-amable"`
     título **"No se pudo cargar la cola"**, desc = mensaje de la acción (`:84-88`).
   - Vacío (0 filas): `NutritionStatePanel icon="empty" illustration="catalogo-vacio"` título
     **"Sin codigos por revisar"**, desc **"Cuando tus alumnos escaneen productos que aun no existen
     en el catalogo local, apareceran aqui para que los vincules."** (`:90-99`).
   `NutritionStatePanel` (RN kit) e ilustraciones `error-amable`/`catalogo-vacio` ya empaquetadas
   (verificado en 4B-06). **Delta:** wiring nuevo. Cierre: tres estados con copys verbatim.

4. **Banner "Codigos por revisar" + fila de código + paginación por offset — copys verbatim.**
   Web `CurationQueue.tsx:102-153`:
   - Banner ámbar (`:103-114`): título **"Codigos por revisar"**, desc **"Productos escaneados que
     aun no existen en el catalogo local. Vincular no inventa nutrientes: solo ensena a EVA que fila
     local corresponde a ese codigo."**, icono `Barcode`. RN: los acentos ámbar del banner son
     tono de dominio (no white-label; mapear a token de aviso del DS, criterio de `NutritionV2Kit`).
   - Fila (`:117-140`): `barcode` en **`eva-mono` tabular-nums** (mono del DS RN), meta
     **"{countryCode} · {sightings} {escaneo|escaneos} · {formatRelativeDate}"** (`:126-129`),
     botón **"Vincular alimento"** (icono `Link2`, min-h 44). `formatRelativeDate` (`:21-28`):
     `"Hoy"` (0 d) / `"Ayer"` (1 d) / **`"Hace {n} dias"`** — port puro + test.
   - Paginación (`:143-153`): botón **"Ver mas codigos"** / **"Cargando…"** (mientras `loadingMore`),
     visible solo si `nextOffset != null`; `loadMore` concatena `[...prev, ...res.items]` y avanza
     `nextOffset` (`:56-68`). **Delta:** RN usa el `FlashList` del hub con footer "Ver mas codigos"
     (offset, no cursor). Cierre: banner + filas + "Ver mas codigos"/"Cargando…" verbatim.

5. **Hoja de resolución (`ResolveDialog`) — DOS modos, copys verbatim.**
   Web `CurationQueue.tsx:169-293`: modal (bottom-sheet en móvil, `:230-241`) con título
   **"Vincular codigo"**, subtítulo = barcode mono, y un segmented de dos tabs
   (`:258-275`): **"Buscar existente"** (icono `Search`) / **"Crear nuevo"** (icono `Plus`).
   Pie fijo (`:285-289`, `CheckCircle2` emerald): **"Vincular no cambia el alimento ni inventa
   nutrientes: solo asocia ese codigo a una fila del catalogo."** RN: montar sobre `Sheet`
   (`side="bottom"`, `nativeModal` por el bug cold-start @gorhom/reanimated 4 documentado en
   `Sheet.tsx`, mismo criterio que `FoodDetailSheet` de 4B-06). Segmented con los dos tokens del DS.
   **Delta:** el `X`/Escape/overlay-close del modal web se adaptan al `onClose` del `Sheet`; el
   estado `busy` deshabilita el contenido (`pointer-events-none opacity-60`, `:277`) → en RN,
   `pointerEvents="none"` + opacidad. Cierre: hoja con segmented, dos modos y pie verbatim.

6. **Modo "Buscar existente" (`CatalogPicker`) — 400 ms / MIN 2, placeholder PROPIO, reusa
   `searchFoodCatalogV2`.**
   Web `CurationQueue.tsx:295-406`: constantes `MIN_QUERY = 2`, `DEBOUNCE_MS = 400` (`:295-296`),
   debounce (`:312-315`), corte bajo 2 chars que limpia lista (`:317-324`), input placeholder
   **"Buscar el producto exacto…"** (`:354`, **distinto** del catálogo "Buscar alimento por nombre
   o marca…") con `aria-label` **"Buscar alimento en el catalogo"** (`:355`), spinner inline
   (`:358-360`), guarda `latestQuery` para descartar respuestas viejas (`:330`). Estados:
   error (rose, `:363-366`), **"Escribe al menos 2 caracteres para buscar."** (`:368`),
   **"Sin resultados. Prueba con otro nombre o crea el alimento en la pestana Crear nuevo."**
   (`:370-371`), lista con filas nombre + brand + `MacroChipRow size="sm"
   per={\`/ ${food.servingSize} ${food.servingUnit}\`}` (`:388-395`, **nota:** `per` es la porción del
   item, NO "por 100 g") + `Link2` primary; tap → `onPick(food)` → `linkExisting` (`:193-206`).
   RN: **reusa `searchFoodCatalogV2({ query, countryCode:'CL', surface:'coach', signal })`** (contrato
   existente, `nutrition-v2-catalog.api.ts:21-43`) — sin paginar (web tampoco pagina el picker, solo
   `res.items`) y `AbortController` para descartar en vuelo. **NO reusar `FoodSearchModal` del builder**
   (300 ms + placeholder "Buscar alimento…", `builder/[clientId].tsx:970,987` — delta de 4B-06).
   **Delta:** placeholder verbatim, 400 ms + MIN 2, `per` = porción del item. Cierre: picker con
   debounce/copys verbatim reusando el contrato de catálogo.

7. **Modo "Crear nuevo" (`CreateFoodForm`) — alta de alimento custom, macros por 100.**
   Web `CurationQueue.tsx:408-536`: helper **"Ingresa las macros por 100 {unit}. Se crea como
   alimento tuyo (coach) y se vincula al codigo."** (`:486-488`); campos: **Nombre** (placeholder
   "Ej: Yogur natural"), **Marca (opcional)** ("Ej: Soprole"), **Unidad** (`select` **"Solido (g)"**
   / **"Liquido (ml)"**), **Calorias / 100{unit}**, **Proteina (g)**, **Carbohidratos (g)**,
   **Grasas (g)** (`:489-525`); submit **"Crear y vincular"** (icono `Plus`, `:526-533`). Validación
   (`:451-460`): nombre no vacío + 4 macros presentes; `toNumber` (`:428-432`) trim, coma→punto,
   `>= 0` finito. Submit → `createAndLink` → `createCoachFoodForCurationV2` (afirmación 2).
   RN: **es el ÚNICO alta de alimento custom del coach en V2** (decisión owner 4; el catálogo 4B-06
   es read-only). Campos con inputs DS (`keyboardType="decimal-pad"` para macros, `Picker`/segmented
   g|ml para unidad). **Delta:** form nuevo. Cierre: form con copys/validación verbatim; crea
   coach-food (`catalog_source='coach'`, `verification_status='coach_verified'`) y vincula.

8. **Resolución exitosa: quitar la fila + feedback (adaptación RN, sin `sonner`).**
   Web `CurationQueue.tsx:70-74,205,225`: al resolver, `handleResolved` **quita la fila** de la
   lista (`setRows(filter)`), cierra la hoja y `toast.success` con
   **"{barcode} vinculado con {food.name}"** (o `{input.name}` al crear). Errores → `toast.error`
   con el mensaje de la acción (`:201-203,221-223`). RN **no tiene toast** (`sonner` es web; el hub y
   el builder usan estado inline, `builder/[clientId].tsx:133 publishError`, sin toast). **Delta de
   adaptación:** en éxito, **quitar la fila resuelta** de la lista (paridad exacta con
   `setRows(filter)`) y mostrar confirmación ligera consistente con el patrón RN (banner/inline
   transitorio, no `sonner`); en error, texto/banner inline (paridad con `publishError`). El copy de
   éxito **"{barcode} vinculado con {nombre}"** se conserva verbatim en el feedback elegido. Cierre:
   fila desaparece al resolver + feedback inline (no toast).

9. **`countryCode` fijo 'CL' (paridad).** Web `NutritionHubTabs.tsx:63` monta
   `<CurationQueue countryCode="CL" />`; el picker y (en su caso) el insert usan `'CL'`
   (`curation.actions.ts:245` `country_code:'CL'`). RN pasa `'CL'` idéntico. En paridad
   (documentar; sin selector de país).

10. **Sin RN-extras nuevos (decisión owner 4).** La pantalla es 1:1 con `CurationQueue` web: sin
    afordancias sin contraparte (nada de editar/borrar el alimento propio, que sería V1). El alta de
    alimento custom del coach **es** contraparte web directa (`CreateFoodForm`). **Nada que retirar.**

## Cierre (qué debe quedar)

- `app/coach/nutrition-v2/curation.tsx`: pantalla nueva con `SafeAreaView` + `NutritionHeader`,
  gate cliente de superficie fail-closed (mismo patrón que el hub, RLS = barrera real), banner
  "Codigos por revisar", lista paginada por offset (`FlashList` + "Ver mas codigos"/"Cargando…"),
  tres estados (loading spinner, error `error-amable` "No se pudo cargar la cola", vacío
  `catalogo-vacio` "Sin codigos por revisar") con copys verbatim, y la hoja de resolución (`Sheet`
  bottom) con segmented "Buscar existente" / "Crear nuevo" + pie verbatim. Tokens EVA DS, dark mode
  y white-label (nada hardcodeado; `useTheme`).
- `lib/nutrition-v2-curation.api.ts` (nuevo): `listMissingFoodCodesV2` / `resolveMissingFoodCodeV2`
  / `createCoachFoodForCurationV2` sobre el `supabase` RN (PostgREST directo, RLS = barrera, 42501
  → SCOPE_DENIED), espejando `curation.actions.ts` 1:1 incluyendo idempotencia/compensación del
  create; guardas de bounds espejo del Zod web. Puro `formatRelativeDate` exportado + test.
- Picker "Buscar existente": reusa `searchFoodCatalogV2` (contrato intacto), debounce 400 ms /
  MIN 2, placeholder "Buscar el producto exacto…", `AbortController`, `MacroChipRow` per = porción.
- `app/coach/nutrition-v2/index.tsx`: **intacto** (frontera con 4B-05; el juez decide el cableado
  de la tab "Curación").

## Comprobación objetiva

Con flag ON y un GTIN reportado por un alumno del coach: abrir la pantalla de Curación → aparece el
banner "Codigos por revisar" y la fila con el código (mono), "{CL} · N escaneos · Hace N dias" y
botón "Vincular alimento". Tocar → hoja bottom con tabs "Buscar existente" / "Crear nuevo".
En "Buscar existente", escribir ≥2 chars → resultados del catálogo (nombre/marca/macros); tocar uno
→ la fila desaparece de la cola (vínculo persistido en `food_catalog_missing_codes.resolved_food_id`).
En "Crear nuevo", completar nombre + macros/100 + unidad → "Crear y vincular" crea un alimento
coach-scoped (`catalog_source='coach'`, `verification_status='coach_verified'`) y vincula el código
(la fila desaparece). Cola vacía → ilustración `catalogo-vacio` "Sin codigos por revisar"; error de
red → `error-amable` "No se pudo cargar la cola"; un coach ajeno al código recibe 42501 → SCOPE_DENIED
(RLS). Captura web móvil (tab Curación del Centro V2) vs RN: comparar banner, fila, hoja, ambos modos
y estados. Gates: `pnpm --filter @eva/mobile exec tsc --noEmit`, lint, `check:tokens`, y el test de
`nutrition-v2-curation.api` (`formatRelativeDate`: Hoy/Ayer/Hace N dias).

## Cierre (2026-07-22)

Entregado 1:1 con la referencia web. Archivos nuevos (propiedad de esta unidad):

- **`apps/mobile/lib/nutrition-v2-curation.api.ts`** (nuevo): `listMissingFoodCodesV2`,
  `resolveMissingFoodCodeV2`, `createCoachFoodForCurationV2` + `formatRelativeDate` puro. Persistencia
  DIRECTA por supabase-js (PostgREST) con el cliente inyectado (`db`), espejo 1:1 de
  `curation.actions.ts`: mismo `.select().is().order().range(from, from+20)` con `hasMore/nextOffset`;
  `.update({resolved_food_id, resolved_at}).eq().is('resolved_at', null)`; y el create NO atómico
  COMPLETO — idempotencia best-effort (ILIKE con `%`/`_` escapados + match por nombre normalizado
  antes de insertar), insert con los MISMOS campos (`serving_size:100`, `serving_unit:unit`,
  `is_liquid: unit==='ml'`, `category:'otro'`, `country_code:'CL'`, `catalog_source:'coach'`,
  `verification_status:'coach_verified'`, `coach_id:userId`, `org_id:null`), y compensación best-effort
  (borra el food SOLO si lo creamos en esta llamada). `42501 → SCOPE_DENIED` en cada op. Guardas de
  bounds espejo del Zod web (name 1..180, brand ≤180 nullable, unit g|ml, calorias 0..2000, macros
  0..500).
- **`apps/mobile/app/coach/nutrition-v2/curation.tsx`** (nuevo): pantalla con banner "Codigos por
  revisar" (tono `warning` del DS), `FlashList` paginado por offset ("Ver mas codigos"/"Cargando…"),
  tres estados (loading spinner card, error `error-amable` "No se pudo cargar la cola", vacío
  `catalogo-vacio` "Sin codigos por revisar") + gate cliente de superficie fail-closed (igual que el
  hub). Hoja de resolución sobre `Sheet` (`nativeModal` bottom) con segmented "Buscar existente" /
  "Crear nuevo", pie verbatim, y feedback inline (no toast) conservando "{barcode} vinculado con
  {nombre}". Picker reusa `searchFoodCatalogV2({surface:'coach'})` con debounce 400 ms / MIN 2,
  placeholder "Buscar el producto exacto…", `AbortController` + guard `latestQuery`, `MacroChipRow`
  `per = / {servingSize} {servingUnit}`. Form "Crear nuevo" con `keyboardType="decimal-pad"` +
  segmented g|ml. Tokens EVA DS, `useTheme`; blanco activo vía `theme.primaryForeground`/`text-white`
  (sancionado, white-label safe).
- **CONTRATO 4B-17:** además del default export de la ruta (`CurationRoute`), se exporta el cuerpo
  embebible **`export function CurationQueueScreen({ embedded }: { embedded?: boolean })`** — firma
  EXACTA del contrato §Frontera de u17. `embedded=true` omite `SafeAreaView` + `NutritionHeader onBack`
  (el hub aporta el chrome); la ruta standalone se conserva para deep-links.
- **`tests/mobile-nutrition-v2-curation.test.ts`** (nuevo): 20 casos — `formatRelativeDate`
  (Hoy/Ayer/Hace N dias/futuro/invalida), list (map snake→camel, hasMore/nextOffset con 21 filas,
  42501→SCOPE_DENIED, otros→CURATION_READ_FAILED), resolve (escribe resolved_food_id, INVALID_PAYLOAD,
  SCOPE_DENIED) y create (campos coach-scoped, is_liquid ml, **idempotencia** reusa por nombre,
  **compensación** borra el food recién creado si el link falla y NO borra si reusó preexistente,
  42501 insert, bounds/nombre vacío → INVALID_PAYLOAD) con un mock del cliente supabase-js.

`index.tsx` **intacto** (frontera con 4B-05/4B-17; el cableado de la tab lo hace 4B-17). NO se creó
endpoint REST ni RPC (camino directo supabase-js sancionado).

Gates propios verdes: `tsc --noEmit` (0 errores), `vitest` (20/20), `eslint` (0), `check:tokens` OK.
Nota: en el worktree coexisten cambios de coders paralelos (`builder/[clientId].tsx`, `QuickEditMode`,
etc.); NO los toqué. El `tsc` del módulo corrió limpio sobre el árbol completo al momento del cierre.
