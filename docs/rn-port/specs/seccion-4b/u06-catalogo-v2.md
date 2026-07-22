# 4B-06 — Catálogo V2 del coach (buscador read-only + ficha de alimento)

Archivos RN (frontera EXPLÍCITA, ver §Frontera de archivos):
- **CREAR** `apps/mobile/app/coach/nutrition-v2/foods.tsx` (pantalla nueva: buscador del catálogo V2).
- **CREAR** `apps/mobile/components/coach/FoodDetailSheet.tsx` (bottom-sheet read-only de la ficha).
- **CREAR** helper puro RN de fuente/verificación/código de barras (p.ej.
  `apps/mobile/lib/food-detail.ts`) + test — port de `apps/web/src/lib/food-detail.ts`
  (RN hoy NO tiene `getFoodSourceAttribution`/`getFoodVerificationLabel`/`formatBarcode`).
- **CONSUMIR sin modificar contrato** `apps/mobile/lib/nutrition-v2-catalog.api.ts`
  (`searchFoodCatalogV2`, ya existe con paginación por cursor).
- **NO tocar** `apps/mobile/app/coach/nutrition-v2/index.tsx` (territorio de 4B-05: tablist del hub).

Referencia web:
`apps/web/src/app/coach/nutrition-v2/_components/FoodCatalogBrowser.tsx:37-257` +
`apps/web/src/components/coach/FoodDetailSheet.tsx:58-287` +
helpers puros `apps/web/src/app/coach/nutrition-v2/_lib/food-catalog-card.ts:77-143`,
`apps/web/src/lib/food-detail.ts:70-175`, server action
`apps/web/src/app/coach/nutrition-v2/_actions/food-catalog.actions.ts:88-131`.

## Contexto (referencia canónica, no V1)

El informe `foods.md` ancló fidelidad en `FoodLibrary.tsx` (hub V1, que **muere** por decisión owner 1).
La referencia canónica de esta unidad es el catálogo V2 vivo: `FoodCatalogBrowser` + `FoodDetailSheet`,
que `NutritionHubTabs.tsx:5,10-14,60-62` monta bajo la tab "Alimentos" del Centro V2. **Verificado en
código**: `FoodCatalogBrowser` es un **buscador read-only** — NO tiene alta de alimento custom, pills de
categoría, selector de scope (Catálogo/Mis) ni orden (esas afordancias eran de la V1). El alta de alimento
custom del coach en V2 vive en **curación** (4B-07). Esta unidad porta EXCLUSIVAMENTE el buscador+ficha
read-only. **No hay RN-extra nuevo que retirar** (decisión 4): la pantalla nace 1:1 con web.

## Frontera de archivos con 4B-05 (HUB)

Web: el hub V2 tiene un `role="tablist"` (`NutritionHubTabs.tsx:10-14`, Alumnos / **Alimentos** / Curación).
RN: el hub `index.tsx:225-345` es **roster-only, sin tablist**. Para permitir paralelismo (INVENTARIO §5),
**esta unidad crea `foods.tsx` como archivo/pantalla propia y NO edita `index.tsx`**. El cableado del
tablist (montar `foods` como tab dentro del hub y navegar a ella) es **decisión del juez** al integrar
4B-05↔4B-06: puede resolverse como tab del hub o como pantalla enlazada. Esta unidad entrega
pantalla + sheet + helper listos para montar; NO asume la forma de la navegación.

## Afirmaciones y deltas

1. **La pantalla de catálogo V2 no existe en RN. FALTA COMPLETA.**
   Web `FoodCatalogBrowser.tsx:37` es una superficie propia (buscador + lista + ficha). RN solo tiene el
   buscador embebido del **builder** (`FoodSearchModal`, `builder/[clientId].tsx:917-1043`), que es un
   **picker** para agregar ítems a una franja (`onSelect(food)`), no un catálogo read-only con ficha.
   No hay pantalla del hub. **Delta:** crear `foods.tsx` de cero.
   Cierre: pantalla nueva con buscador debounced, lista paginada, estados con ilustración y ficha al tocar.

2. **Buscador: debounce 400 ms, mínimo 2 caracteres, placeholder exacto.**
   Web `FoodCatalogBrowser.tsx:22-23` (`MIN_QUERY = 2`, `DEBOUNCE_MS = 400`), `:52-55` debounce,
   `:84-95` corta bajo 2 caracteres (limpia lista), input `:135` placeholder
   `"Buscar alimento por nombre o marca…"`, `aria-label` `"Buscar alimento en el catalogo"` (`:136`),
   spinner inline mientras `loading` (`:139-140`) y botón "X" limpiar cuando hay query (`:141-150`).
   RN `FoodSearchModal` usa **300 ms** y placeholder `"Buscar alimento…"` (`builder/[clientId].tsx:970,987`)
   — NO reusar ese componente. **Delta:** la pantalla nueva debe usar **400 ms + MIN 2** y el placeholder
   verbatim de web. `AbortController` + `signal` para descartar respuestas viejas (`searchFoodCatalogV2`
   ya acepta `signal`).
   Cierre: debounce 400 ms, MIN 2 con limpieza de lista bajo el umbral, placeholder verbatim, cancelación
   de vuelo con `AbortController`, spinner inline + botón limpiar.

3. **Búsqueda gated fail-closed vía `searchFoodCatalogV2` (contrato ya existente).**
   Web server action `food-catalog.actions.ts:88-131` re-verifica el gate `isNutritionV2Enabled({surface:
   'webCoach'})` (`:63-70`) + `nutritionV2CoachScopeFromWorkspace` (`:72-76`) + rate-limit (`:54-57`) en
   CADA búsqueda; pagina por keyset (`PAGE_SIZE = 20`, `:23`). RN `nutrition-v2-catalog.api.ts:21-43`
   (`searchFoodCatalogV2`, `surface:'coach'`) llama `/api/mobile/nutrition-v2/catalog` autenticado; el
   endpoint móvil re-aplica gate/scope server-side (misma barrera). **Delta de página:** el default RN es
   `pageSize: 25` (`:38`); web pagina de a **20**. Pasar `pageSize: 20` explícito para que el ritmo de
   cursor sea idéntico. La UI **nunca** autoriza (paridad con 4B-04): el hub RN ya está gated
   (`index.tsx:81`), y la búsqueda además la niega el servidor.
   Cierre: `searchFoodCatalogV2({ query, countryCode: 'CL', surface: 'coach', pageSize: 20, cursor, signal })`;
   sin lógica de gate en cliente.

4. **Fila del listado: miniatura, badge de verificación, nombre/marca/envase/fuente, macros por 100.**
   Web `FoodCatalogBrowser.tsx:170-231` + card model `food-catalog-card.ts:77-105`:
   - Miniatura `model.thumbnailUrl` (foto de producto) o `model.categoryIconUrl` (icono estático de
     categoría, `bg-primary/10`) — `:178-199`.
   - Badge de verificación inline junto al nombre (`:203-211`), texto+tono de
     `getFoodVerificationLabel` (`food-detail.ts:153-167`).
   - Línea meta `[brand, packageLabel, sourceLabel].filter(Boolean).join(" · ")` (`:213-215`); `packageLabel`
     `= "{qty} {unit}"` y `sourceLabel` de `getFoodSourceAttribution().label` (`food-catalog-card.ts:84-94`).
   - `MacroChipRow` `size="sm"` con `per = basisLabel` (`"por 100 g"` / `"por 100 ml"`, `:83`), macros
     crudas del item (`:216-225`).
   RN debe replicar con `FoodThumbnail` (`NutritionV2Kit.tsx:474`, usar `src = foodMediaThumbnailUrl(food.media)`
   + `fallbackCategory = food.category` para el icono estático 1:1 — **no** `fallbackEmoji`, que es legado) y
   `MacroChipRow` (`components/nutrition-v2/MacroChipRow.tsx`, props `calories/proteinG/carbsG/fatsG/per/size`).
   El badge de verificación y la línea meta se arman con el helper portado (afirmación 7). **Delta:** el
   badge de verificación y la línea `marca · envase · fuente` no existen en la fila del builder RN (esa solo
   muestra `brand + "N kcal / Xun"`, `builder/[clientId].tsx:1027-1034`) → construir la fila nueva.
   Cierre: fila con miniatura (foto o icono de categoría), badge de verificación, meta
   `marca · envase · fuente`, `MacroChipRow size="sm" per="por 100 g|ml"`.

5. **Paginación por cursor con botón "Cargar mas".**
   Web `FoodCatalogBrowser.tsx:41-42,97-111` (`cursor`/`hasMore`, `loadMore` acumula
   `[...prev, ...res.items]`), botón `:233-243` texto `"Cargar mas"` / `"Cargando…"` mientras `loadingMore`,
   visible solo `hasMore && !loading`. RN `searchFoodCatalogV2` ya devuelve `nextCursor` + `hasMore`
   (`catalog.ts:74-82`); la primera página resetea, "Cargar mas" concatena pasando `cursor`. **Delta:** RN
   hoy no pagina el catálogo en ningún lado (el builder trae solo la 1ª página).
   Cierre: estado `items`/`cursor`/`hasMore`, "Cargar mas" que concatena y avanza cursor, deshabilitado
   mientras carga; copy `"Cargar mas"` / `"Cargando…"`.

6. **Estados invite / vacío / error con ilustración (los 3 webp ya empaquetados).**
   Web `FoodCatalogBrowser.tsx:123-168`:
   - Invite (`debounced < 2`): `NutritionStatePanel illustration="catalogo-vacio"` título
     `"Busca en el catalogo"`, desc `"Escribe al menos 2 caracteres para encontrar alimentos por nombre o marca."`
   - Vacío (query ≥2, 0 resultados): `illustration="sin-resultados"` título `"Sin resultados"`, desc
     `"No encontramos alimentos para esa busqueda. Prueba con otro nombre o marca."`
   - Error: `illustration="error-amable"` `tone="danger"` `icon="error"` título `"No se pudo buscar"`,
     desc = mensaje de la acción.
   RN `NutritionStatePanel` (`NutritionV2Kit.tsx:647-703`) ya acepta `illustration`; los assets
   `catalogo-vacio.webp` / `sin-resultados.webp` / `error-amable.webp` **están en el bundle**
   (`apps/mobile/assets/illustrations/`, verificado). **Delta:** solo el wiring (nunca existió).
   Cierre: los tres estados con ilustración, títulos y descripciones verbatim de web.

7. **Ficha de alimento (`FoodDetailSheet`) — FALTA COMPLETA; requiere port de helpers puros.**
   Web `FoodDetailSheet.tsx:58-287`, alcanzada al tocar cualquier fila sin segundo fetch
   (`FoodCatalogBrowser.tsx:118-121,254` construye `FoodDetailData` con `foodCatalogItemToDetail`,
   `food-catalog-card.ts:115-143`). RN debe crear `components/coach/FoodDetailSheet.tsx` montado sobre
   `Sheet` (`components/Sheet.tsx`, `open`/`onClose`/`title`/`side="bottom"`). Secciones, en orden:
   - **Header visual** (`:144-180`): foto de producto ampliable (lightbox) o icono de categoría. RN: foto
     vía `foodMediaThumbnailUrl(item.media)`; lightbox con `PhotoLightbox` (`components/PhotoLightbox.tsx`,
     `photos`/`visible`/`onClose`). Fallback = icono de categoría (`FoodThumbnail fallbackCategory`).
   - **Badge de verificación** (`:182-193`): `getFoodVerificationLabel` (helper portado).
   - **`"Por {basis}"` + `MacroChipRow size="md"`** (`:195-206`); `basis = "100 ml"` si líquido
     (`servingUnit === 'ml'`), si no `"100 g"` (`:41-43`).
   - **Micros** `"Detalle (por {basis})"` (`:208-219`): filas presentes solo si non-null — `Fibra` (g),
     `Azúcares` (g), `Grasa saturada` (g), `Sodio` (mg, 0 decimales) (`:75-82`). Cifras `eva-mono tabular-nums`.
   - **Porción casera / Envase** (`:221-236`): grid 2-col. `householdLabel`/`householdGrams` viajan **null**
     en el read model del catálogo (`food-catalog-card.ts:132-133`) → la porción casera se **oculta**
     casi siempre (paridad exacta con web). Envase `"{qty} {unit}"` de `packageQuantity`/`packageUnit`.
   - **Código de barras** (`:238-250`): solo si `barcode` (`item.gtin`, `food-catalog-card.ts:136`),
     `formatBarcode` agrupa dígitos de a 4 (`food-detail.ts:170-175`), mono `tabular-nums`.
   - **Fuente** (`:252-270`): `getFoodSourceAttribution().label` + `attributionLine`; si hay `href` (OFF),
     enlace externo; si no, texto plano.
   RN **carece** de `getFoodSourceAttribution`/`getFoodVerificationLabel`/`formatBarcode`
   (`nutrition-v2-food-media.ts` solo tiene la línea ODbL genérica). **Port obligatorio** de esos tres
   helpers puros a `lib/food-detail.ts` (RN) con test, copys verbatim de `food-detail.ts:88-175`.
   Cierre: sheet con las 6 secciones, orden y copys de web; helpers puros portados y testeados.

8. **Atribución Open Food Facts (obligación ODbL) — copy verbatim de web.**
   Web `FoodCatalogBrowser.tsx:245-252`: pie visible **siempre que** `!showInvite && cards.length > 0`
   (NO condicionado a que haya un item OFF) con
   `OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION` = `"Parte de los datos de productos proviene de Open Food Facts,
   disponible bajo licencia ODbL."` (`food-detail.ts:70-71`) + enlace `"Ver Open Food Facts"` a
   `OPEN_FOOD_FACTS_URL`. RN `nutrition-v2-food-media.ts:91-92` tiene `CATALOG_ODBL_GENERIC_LINE` =
   `"Parte de los datos proviene de Open Food Facts (ODbL)."` — **COPY DELTA** (texto distinto) y
   `catalogHasOpenFoodFactsSource` condiciona a fuente OFF, cuando **web lo muestra incondicional**.
   **Delta:** usar el copy exacto de web + enlace "Ver Open Food Facts", mostrado cuando hay ≥1 resultado
   (no condicionar a OFF). En la **ficha**, la línea de fuente per-item ya cubre la atribución OFF concreta
   (afirmación 7).
   Cierre: pie con copy verbatim de web + enlace, visible con ≥1 resultado; sin condicionar a OFF en el pie.

9. **`countryCode` fijo 'CL' (paridad con web).** Web `NutritionHubTabs.tsx:61` monta
   `<FoodCatalogBrowser countryCode="CL" />` y la prop default es `'CL'` (`FoodCatalogBrowser.tsx:37`).
   RN pasa `countryCode: 'CL'` a `searchFoodCatalogV2`. **En paridad** (documentar; sin selector de país
   en ninguno de los dos lados).

10. **Sin RN-extras nuevos (decisión 4).** La pantalla es read-only 1:1 con web: sin alta de alimento
    (vive en curación 4B-07), sin editar/borrar (eso era V1, muere), sin pills/scope/orden (no existen en
    el catálogo V2 web). No se introduce ninguna afordancia sin contraparte web. **Nada que retirar.**

## Cierre (qué debe quedar)

- `app/coach/nutrition-v2/foods.tsx`: pantalla nueva con `SafeAreaView`, buscador (400 ms, MIN 2,
  placeholder verbatim, `AbortController`), lista de filas (miniatura + badge verificación +
  `marca · envase · fuente` + `MacroChipRow size="sm" per`), "Cargar mas" por cursor, tres estados con
  ilustración, pie ODbL con copy de web, y apertura de la ficha al tocar fila (sin segundo fetch: mapear el
  `FoodCatalogItem` ya cargado). Tokens EVA DS, dark mode y white-label (nada hardcodeado; usar `useTheme`).
- `components/coach/FoodDetailSheet.tsx` (RN): las 6 secciones (header foto/icono + lightbox, badge,
  `Por {basis}` + macros md, micros, porción casera/envase, código de barras, fuente) con orden y copys de
  `FoodDetailSheet.tsx` web.
- `lib/food-detail.ts` (RN, nuevo) + test: port puro de `getFoodSourceAttribution`,
  `getFoodVerificationLabel`, `formatBarcode` y las constantes de atribución/URL, copys verbatim de web.
- `lib/nutrition-v2-catalog.api.ts`: consumido **sin cambios de contrato** (`searchFoodCatalogV2`,
  `pageSize: 20` explícito).
- `app/coach/nutrition-v2/index.tsx`: **intacto** (frontera con 4B-05; el juez decide el cableado del tablist).

## Comprobación objetiva

Con flag ON y catálogo CL: abrir la pantalla de Alimentos, escribir "leche" → aparecen filas con miniatura,
badge de verificación, `marca · envase · fuente` y `MacroChipRow` por 100 g/ml; "Cargar mas" trae la
siguiente página (cursor). Tocar una fila abre la ficha con `Por 100 g/ml`, micros (Fibra/Azúcares/Grasa
saturada/Sodio) solo para valores presentes, código de barras agrupado, foto ampliable (o icono de
categoría) y línea de fuente; en un producto OFF, la fuente enlaza a Open Food Facts. Bajo 2 caracteres →
ilustración `catalogo-vacio` "Busca en el catalogo"; búsqueda sin match → `sin-resultados` "Sin resultados";
error de red → `error-amable` "No se pudo buscar". El pie ODbL con el copy verbatim de web aparece con ≥1
resultado. Captura web móvil (tab Alimentos del Centro V2) vs RN: comparar fila, ficha, estados y pie.
Gates: `pnpm --filter @eva/mobile exec tsc --noEmit`, lint, `check:tokens`, y el test del helper `food-detail`
RN (fuente/verificación/barcode).

## Cierre (2026-07-21)

Entregado 1:1 con la referencia web, sin tocar `index.tsx` (frontera con 4B-05: la pantalla es
alcanzable por ruta directa; el cableado del tablist lo decide el juez en 4B.4).

- **`apps/mobile/app/coach/nutrition-v2/foods.tsx` (nuevo).** Pantalla propia con `SafeAreaView`
  (`edges top/bottom`, `bg-surface-app`) + `NutritionHeader onBack` + buscador (input DS con lupa,
  spinner inline y botón "X" limpiar, placeholder verbatim `"Buscar alimento por nombre o marca…"`,
  `accessibilityLabel="Buscar alimento en el catalogo"`). Debounce **400 ms**, **MIN 2** con limpieza de
  lista bajo el umbral, `AbortController` + `signal` para descartar respuestas viejas (más guarda
  `latestQuery` en el `loadMore`). Lista con `FlashList`: fila = `FoodThumbnail` (`src =
  foodMediaThumbnailUrl(item.media)` + `fallbackCategory = item.category`, **no** `fallbackEmoji`),
  badge de verificación inline, meta `marca · envase · fuente` y `MacroChipRow size="sm" per="por 100 g|ml"`.
  Paginación por cursor con "Cargar mas"/"Cargando…" (visible `hasMore && !loading`, deshabilitado
  mientras carga; concatena `[...prev, ...res.items]`). Tres estados con ilustración (invite
  `catalogo-vacio` "Busca en el catalogo", vacío `sin-resultados` "Sin resultados", error `error-amable`
  `tone="danger"` "No se pudo buscar" con el mensaje de la acción) — copys verbatim. Pie ODbL con el copy
  EXACTO e incondicional de web + enlace "Ver Open Food Facts" (`Linking.openURL`), visible con ≥1
  resultado (no condicionado a OFF). Toca una fila → abre la ficha con el `FoodCatalogItem` ya cargado
  (sin segundo fetch).
- **`apps/mobile/components/coach/FoodDetailSheet.tsx` (nuevo).** Ficha read-only sobre el `Sheet` DS
  (`nativeModal` por el bug cold-start de @gorhom bajo reanimated 4 documentado en `Sheet.tsx`). Seis
  secciones en orden: header foto ampliable (`expo-image` `contentFit="contain"` + `PhotoLightbox`, con
  fallback al icono de categoría vía `FoodThumbnail fallbackCategory` cuando no hay foto o falla la carga),
  badge de verificación, `Por {basis}` + `MacroChipRow size="md"` (`basis = "100 ml"` si `servingUnit ===
  'ml'`, si no `"100 g"`), micros `Detalle (por {basis})` (solo `Fibra`/`Azúcares`/`Grasa saturada`
  presentes + `Sodio` a 0 decimales, `tabular-nums`), porción casera/envase (la **porción casera queda
  oculta**: `householdLabel`/`householdGrams` viajan null en el read model — paridad exacta), código de
  barras (`item.gtin` + `formatBarcode`, `tabular-nums`), y fuente (`getFoodSourceAttribution().label` +
  `attributionLine`; enlace externo si hay `href` (OFF/USDA), texto plano si no).
- **`apps/mobile/lib/food-detail.ts` (nuevo, puro).** Port 1:1 de `getFoodSourceAttribution`,
  `getFoodVerificationLabel`, `formatBarcode` y las constantes `OPEN_FOOD_FACTS_URL` / `USDA_FDC_URL` /
  `OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION`, copys verbatim de `apps/web/src/lib/food-detail.ts:62-175`. **Solo
  helpers puros**: sin resolución de imagen web (la foto usa `foodMediaThumbnailUrl` existente) y sin el
  tipo `FoodDetailData` (la ficha RN consume el `FoodCatalogItem` directo).
- **`tests/mobile-food-detail.test.ts` (nuevo).** 11 casos: cada `source`/`verification_status` con su
  copy exacto (incluye el fallback "Otra fuente"/"Sin verificar" y null/undefined que nunca lanzan),
  agrupado de `formatBarcode` (EAN-8/13, descarte de no-dígitos, guion en vacío) y el copy verbatim del pie
  ODbL.

**Decisiones y notas:**
- **`pageSize: 20` explícito.** El contrato RN (`nutrition-v2-catalog.api.ts:38`) tiene default 25; se pasa
  20 para igualar el ritmo de cursor de web (`PAGE_SIZE = 20`). **Verificado en el endpoint**
  `apps/web/src/app/api/mobile/nutrition-v2/catalog/route.ts:52-75`: lee `pageSize` de la query (default
  25), lo clamps a `[1,50]` y lo reenvía como `p_page_size` al RPC — el `pageSize` enviado se respeta.
- **Badge de verificación:** los raw `emerald/sky/rose` del web se mapean a los tokens semánticos del DS RN
  (`success/info/danger` + neutral sunken), mismo criterio que `NutritionV2Kit.tsx` — white-label safe, sin
  valores crudos nuevos.
- **Gate:** ninguna lógica de autorización en cliente (paridad con 4B-04); el servidor niega la búsqueda en
  cada llamada. La pantalla no se auto-gatea.
- **Adaptación nativa menor:** el `PhotoLightbox` RN no expone footer, así que el crédito "Ver original" del
  lightbox web se omite (la línea de fuente per-item de la ficha ya cubre la atribución OFF). El campo
  `imageSourceUrl`/"Ver original" no aplica.
- **Gates verdes:** `tsc --noEmit` (0 errores), `eslint` de los 4 archivos (0 errores/0 warnings tras usar
  `alt` en `expo-image`, convención del repo), `vitest run tests/mobile-food-detail.test.ts` (11/11) y
  `check:tokens` (parity OK). `index.tsx` intacto.
