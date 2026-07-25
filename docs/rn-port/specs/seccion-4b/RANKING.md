# Ola 4B — Ranking de unidades por severidad del delta

> Severidad = cuánta diferencia observable real hay hoy entre RN y la web V2 responsive del coach.
> Alcance fijado por `DECISIONES-OWNER.md`: V1 al olvido, recetas fuera, RN-extras retirar/gatear,
> catálogo canónico = `FoodCatalogBrowser` + `FoodDetailSheet` (V2 hub), NO `FoodLibrary` (V1).
> Restricción dura (ver INVENTARIO §5): las 4 unidades del builder editan el mismo
> `builder/[clientId].tsx`; SWAP y HUB comparten `nutrition-v2/index.tsx`; las 2 del detalle comparten
> `[clientId].tsx`; notas-permisos y quickedit-drafts comparten `QuickEditMode.tsx`; macros y editor+chrome
> comparten `meal-groups.tsx`. Nunca dos que compartan archivo en la misma wave.

| # | Unidad | Severidad | Alcance (1 línea) | Archivos RN | Tamaño | Wave |
|---|--------|-----------|-------------------|-------------|--------|------|
| 4B-01 | **Meal-groups macros (motor)** · *en ejecución* | **P0** | Reemplazar el cálculo de macros duplicado por `@eva/nutrition-engine` (`calculateFoodItemMacros`); corrige el factor `un` (usa `serving_size`) inflado en tarjetas y "Total estimado" | `app/coach/meal-groups.tsx`, `lib/meal-groups.ts`, test | S | 4B.1 |
| 4B-02 | **Foods scope org (buscador)** · *en ejecución* | **P1** (enterprise) | Espejar `foodWorkspaceFilter`: `searchFoods`/`listCoachFoods` RN filtran por `org_id` del workspace activo (hoy mezclan catálogos en enterprise) | `lib/nutrition-builder.ts` (+ helper puro + test) | S | 4B.1 |
| 4B-03 | **Quick-edit notas+permisos** · *en ejecución* | **P1** | Renderizar `visibleNotes` + `protocolNotes` + 3 pills de permisos read-only (hoy solo el hint); datos ya en el read-model | `components/nutrition-v2/quick-edit/QuickEditMode.tsx` | S | 4B.1 |
| 4B-04 | **SWAP tab→hub V2** | **P0** (ruteo) | Cablear el swap espejo del web: el tab "Nutrición" resuelve `nutritionV2Coach` (global+fallback) y monta el Centro V2 en vez del hub V1 cuando el gate está ON; OFF = V1 intacto (rollback). Cablea el hub huérfano | `app/coach/(tabs)/nutricion.tsx`, `app/coach/nutrition-v2/index.tsx`, posible resolver en `lib/` | M | 4B.2 |
| 4B-05 | **HUB paridad** | **P1 alto** | Header (backHref, desc, retirar eyebrow "Canary privado") + CTA global "Nuevo plan" (picker roster→builder, espejo `NewPlanPickerButton`) + búsqueda tolerante a acentos + orden del roster (espejo `SORT_OPTIONS`/`applyRosterFilters`); métricas ya en paridad | `app/coach/nutrition-v2/index.tsx` (+ `lib/nutrition-v2-hub.ts`) | L | 4B.3 (secuencial tras SWAP) |
| 4B-06 | **Catálogo V2 (FoodCatalogBrowser+FoodDetailSheet)** | **P1 alto** | Nueva pantalla: buscador read-only del catálogo V2 (nombre/marca, paginación por cursor, atribución OFF, estados con ilustraciones) + ficha `FoodDetailSheet` (GTIN, micros, porción casera, envase, verificación, foto/icono, fuente) al tocar fila. Read-only; el alta custom vive en curación | nuevo `app/coach/nutrition-v2/foods.tsx`, nuevo `components/coach/FoodDetailSheet.tsx`, `lib/nutrition-v2-catalog.api.ts` | L | 4B.3 (archivo propio, paralelo) |
| 4B-07 | **Curación (cola de scans sin match)** | **P1** | Nueva pantalla: `listMissingFoodCodes` paginada + resolver "Buscar existente" (picker→vincular) o "Crear nuevo" (form macros por 100 → crear+vincular). Aquí vive el alta de alimento custom V2 | nuevo `app/coach/nutrition-v2/curation.tsx`, `lib/nutrition-v2-catalog.api.ts` (acciones curación) | L | 4B.4 (depende de 4B-06) |
| 4B-08 | **Detalle: acciones asignar/archivar** | **P1** | Portar "Asignar a otros alumnos" (`AssignPlanToClientsDialog` + roster) y "Archivar plan vigente" (`ArchivePlanButton`); gaps funcionales reales del coach | `app/coach/nutrition-v2/[clientId].tsx`, `lib/nutrition-v2.api.ts` (actions assign/archive), nuevo sheet+confirm | L | 4B.3 (paralelo) |
| 4B-09 | **Detalle: copy+upsell+banner-convertido** | **P2 alto** | Alinear historial (layout/copy D-05), upsell Pro ruta+copy (D-06), copy nota privada (D-07), empty-state ilustración (D-09), jerarquía CTA edición (D-01/D-02) + banner "plan convertido" V1→V2 descartable (D-08) | `app/coach/nutrition-v2/[clientId].tsx`, `lib/nutrition-v2-pro.ts` (copy), `lib/nutrition-v2.api.ts` (conversion link) | M | 4B.4 (secuencial tras 4B-08) |
| 4B-10 | **Builder: F-02 reemplazos** | **P1 alto** | Editor de reemplazos por ítem (el `TODO F-02 P3`): agregar `substitutions` a `BuilderItem` + acciones `ADD/REMOVE_ITEM_SUBSTITUTION` + UI (reusa `FoodSearchModal`, tope 8, chips, solo structured/hybrid); write-path ya existe | `app/coach/nutrition-v2/builder/[clientId].tsx`, `lib/nutrition-v2-builder.ts` | L | 4B.3 (archivo propio) |
| 4B-11 | **Builder: porciones a elección** | **P1** | Capa "Porciones a elección" en el builder (sección por franja + derivar targets + subtotal combinado + chips de revisión); reusar `portions-state.ts` del quick-edit RN. Cierra la asimetría builder↔quick-edit | `app/coach/nutrition-v2/builder/[clientId].tsx` (+ posible lib de porciones del builder) | L | 4B.4 (secuencial tras 4B-10) |
| 4B-12 | **Builder: permisos + guardar-catálogo + archivar-y-reemplazar** | **P1** | (a) editor de permisos del alumno en `TargetsStep` (`SET_PERMISSION` existe, nunca se renderiza); (b) "Guardar en mi catálogo" + aviso de mismatch de macros en alimento libre; (c) rama "Archivar el actual y reemplazar" del conflicto de fecha | `app/coach/nutrition-v2/builder/[clientId].tsx`, `lib/nutrition-v2-builder.ts` | M | 4B.5 (secuencial tras 4B-11) |
| 4B-13 | **Builder: drafts** | **P2** | Autosave + banner Restaurar + guard de salida para el builder (hoy sin autosave; back de HW no advierte borrador). Requiere la nueva lib de drafts RN | `app/coach/nutrition-v2/builder/[clientId].tsx`, nueva `lib/nutrition-coach-draft-store` (AsyncStorage) | M | 4B.6 (secuencial tras 4B-12) |
| 4B-14 | **Quick-edit: drafts** | **P2** | Respaldo local (autosave + banner Restaurar) del quick-edit (`QuickEditMode.tsx:108` "F2" diferido); comparte la lib de drafts con 4B-13 | `components/nutrition-v2/quick-edit/QuickEditMode.tsx`, lib de drafts RN | M | 4B.4 (secuencial tras 4B-03, paralelo al builder) |
| 4B-15 | **Meal-groups: editor + chrome** | **P2** | Hint "1 un ≈ Xg", cantidad decimal, swap de unidad basado en `defaultQuantity(serving_size)`, validación qty>0, banner Info, subtítulo a paridad, feedback de éxito, formato de copy de macros | `app/coach/meal-groups.tsx` | M | 4B.3 (secuencial tras 4B-01) |
| 4B-16 | **Deuda: consolidar `nutrition-pro` puro en `@eva/nutrition-v2`** | **Deuda transversal** | Mover el subconjunto puro de gating Pro (`filterHistoryDaysToBaseWindow`, `subtractIsoDays`, constantes) a `@eva/nutrition-v2`; web `_lib/nutrition-pro.ts` y `lib/nutrition-v2-pro.ts` reexportan; mata el drift de copy del upsell. Toca web + packages | `packages/nutrition-v2/*`, `apps/web/.../_lib/nutrition-pro.ts`, `apps/mobile/lib/nutrition-v2-pro.ts` | S/M | rama web / unidad propia |

## Waves sugeridas (archivos disjuntos por wave; P0 primero, luego SWAP→HUB secuencial)

- **Wave 4B.1** (*en ejecución*): **4B-01** (`meal-groups.tsx`/`lib`) ∥ **4B-02** (`nutrition-builder.ts`) ∥
  **4B-03** (`QuickEditMode.tsx`). Archivos disjuntos, quick-wins P0/P1 de datos visibles (decisión 5).
- **Wave 4B.2**: **4B-04 SWAP** solo (toca `(tabs)/nutricion.tsx` + `nutrition-v2/index.tsx`; P0 de ruteo
  que desbloquea todo lo demás). Debe cerrar antes de tocar el hub.
- **Wave 4B.3**: **4B-05 HUB** (`index.tsx`) ∥ **4B-06 Catálogo** (`foods.tsx` nuevo) ∥ **4B-08
  Detalle-acciones** (`[clientId].tsx`) ∥ **4B-10 Builder-F02** (`builder/[clientId].tsx`) ∥ **4B-15
  Meal-groups editor** (`meal-groups.tsx`). Todos disjuntos.
- **Wave 4B.4**: **4B-07 Curación** (`curation.tsx`, depende de 4B-06) ∥ **4B-09 Detalle-copy**
  (`[clientId].tsx`, tras 4B-08) ∥ **4B-11 Builder-porciones** (`builder/[clientId].tsx`, tras 4B-10) ∥
  **4B-14 Quick-edit drafts** (`QuickEditMode.tsx`, tras 4B-03).
- **Wave 4B.5**: **4B-12 Builder permisos+catálogo+reemplazar** (`builder/[clientId].tsx`, tras 4B-11).
- **Wave 4B.6**: **4B-13 Builder drafts** (`builder/[clientId].tsx`, tras 4B-12; introduce la lib de drafts
  que 4B-14 consume — si 4B-14 va antes, 4B-14 es la dueña de la lib).
- **4B-16** (deuda): fuera del tren de waves RN; se abre como unidad propia / rama web. Si corre en paralelo
  a 4B-09 (ambas tocan `nutrition-v2-pro.ts`), el fix de copy D-06 se mueve dentro de 4B-16.

Notas para el orquestador:
- El **builder** es el cuello de botella: 4B-10/11/12/13 son 4 waves secuenciales sobre el mismo archivo.
  Si el owner quiere acelerar, evaluar separar el monolito `builder/[clientId].tsx` a subcomponentes por
  archivo (fuera del alcance de estas unidades; sería una unidad de refactor previa).
- **4B-06 antes de 4B-07** (la curación reusa el picker/creación de food del catálogo).
- **4B-08 antes de 4B-09** y **4B-03 antes de 4B-14** por compartir archivo.
- Gates completos (tokens, `pnpm --filter @eva/mobile exec tsc --noEmit`, lint, QA device light/dark ×
  marca) los corre el orquestador al cierre de cada wave, según DoD del plan.
- Decisiones de owner ya tomadas (DECISIONES-OWNER 4B): V1 al olvido, recetas fuera, RN-extras retirar,
  hub V2 = cockpit destino. Pendiente de decisión por-ítem: cualquier RN-extra nuevo detectado en las waves
  (§3 del INVENTARIO) necesita excepción escrita ANTES de codificarse.
