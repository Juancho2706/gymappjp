# 4A-10 — Registro de alimento (buscador, favoritos, cantidad/unidad/franja)

Archivo RN: `apps/mobile/app/alumno/nutrition-v2/add-food-v2.tsx`. Disjunto.
Referencia web: `TodayExperience.tsx:645-938` (`RegisterFoodDialog`, `CatalogPickRow`,
`FavoriteStarButton`, `FoodResultThumb`).

Adaptación de forma sancionable: web = modal (`TodayModal`); RN = pantalla pusheada. Se acepta como
adaptación nativa ESCRITA (patrón ya usado por el repo), siempre que contenido/estados sean 1:1.

## Afirmaciones y deltas

1. **Selector de franja (FALTA).**
   Web `TodayExperience.tsx:851-865`: select "Franja (opcional)" con "Sin franja" + TODAS las franjas
   (`mealSlotOptions`, `nutrition-today.logic.ts:50-52`), preseleccionable desde el sheet de
   equivalencias (`initialMealSlot`, 67-68, 330).
   RN: solo un toggle "Asignar a {slotName}" si llegó con param `slot` (`add-food-v2.tsx:457-470`);
   el registro libre ("+ Registrar alimento") NO permite elegir franja jamás.
   **Delta funcional mayor.** Cierre: selector con todas las franjas + "Sin franja", preselección por param.

2. **Unidades (FALTAN opciones).**
   Web `TodayExperience.tsx:758-761`: `[servingUnit, 'g', 'ml', 'porción', 'unidad']` únicas.
   RN `add-food-v2.tsx:57-59`: `['g','un']` o `['ml','un']`. **Delta funcional** (además "un" no es
   copy web). Cierre: mismas opciones que web (UI segmentada o picker nativo, contenido idéntico).

3. **Aviso anti-duplicado de porciones (FALTA).**
   Web `TodayExperience.tsx:769-772,866-873`: si el alimento pertenece a un grupo con porciones ya
   marcadas en la franja elegida → caja ámbar `aria-live=polite` con `dupWarningFor` (no bloquea).
   RN: no existe. Cierre: portar (necesita el estado de porciones — exponer helper desde
   `lib/nutrition-v2-portions.ts` o pasar por params/estado global; diseñar en implementación sin
   duplicar lógica).

4. **Búsqueda.**
   Web: submit explícito con botón "Buscar" (form `onSubmit`, 877-894), mínimo 2 chars con error
   "Escribe al menos 2 caracteres." (735-737), sin resultados → "Sin resultados en el catálogo local."
   (748), placeholder "Ej: pechuga de pollo" (888).
   RN: debounce 300ms auto (115-144), placeholder "Buscar pollo, arroz, yogur…" (342), panel
   "Sin resultados para "{term}"" (387-392), estado "Buscando…" propio.
   **Deltas de copy y forma.** El live-search es adaptación defendible, pero los COPYS deben ser los
   web ("Ej: pechuga de pollo"; "Sin resultados en el catálogo local."); el hint de 2 caracteres se
   conserva como estado (RN ya lo insinúa con su panel "Busca en el catálogo de EVA" — copy no-web,
   reemplazar o documentar). Decisión default: live-search se queda (escrito), copys se igualan.

5. **Favoritos.**
   Web: header "Tus favoritos" con estrella ámbar (899-918), orden favoritos-primero en resultados
   (`sortFoodsByFavoriteFirst`, 726), toggle optimista con rollback + toast de error (694-723),
   estrella `fill-amber-400 text-amber-400` (476).
   RN 146-207, 357-377: paridad de flujo (incl. limpieza <2 chars ↔ web 727-731). Delta fino: fallo
   del toggle RN es silencioso (sin toast, 190-201) — agregar aviso (snackbar/Alert) con copy
   humanizado. Estrella `#FBBF24` = amber-400: canvas fijo web, documentar el literal o mapear a token.

6. **Fila de resultado.**
   Web `CatalogPickRow` 488-529: miniatura (foto o icono categoría sobre `bg-primary/10`), nombre,
   meta "{brand} · {category}", `MacroChipRow per="/ 100 g|ml"`.
   RN `CatalogPickRow` 524-576: usa FoodRow del kit con `quantityLabel="{servingSize} {servingUnit}"`,
   SIN categoría, SIN sufijo "/ 100 …". **Delta de contenido** (la base de macros del catálogo es por
   100 g/ml — el label RN es engañoso). Cierre: meta y per-label web.

7. **Panel del alimento elegido.**
   Web 802-825: card sunken con thumb + nombre + "{brand} · {category} | Sin marca" +
   `MacroChipRow per="por {servingSize} {servingUnit}"`; botones pie [Cambiar alimento neutral]
   [Registrar primary] (781-798); cantidad default = servingSize (753-756).
   RN 415-483: card tone nutrition (web: sunken neutro), sin categoría, muestra PREVIEW de totales
   calculados (472-482) que web no tiene (**RN-extra**, retirar o elevar), botones "Volver" /
   "Agregar al día" (copys web: "Cambiar alimento" / "Registrar"). Cierre: composición y copys web.

8. **Errores de guardado.** Web: `DialogError` humanizado dentro del modal (801, 119).
   RN: `SyncOfflineState error "No se pudo registrar"` (485). Delta: copy humanizado
   (`humanizeStudentWriteError` equivalente RN) y no perder el formulario.

9. **Celebración meal-logged + auto-back** (RN 255-271): no existe en web (web solo confetti de meta
   de energía en el hero). **RN-extra** — retirar o excepción escrita del owner (ver 4A-12).

10. **Atribución ODbL** (RN 408-410, 421-423): línea legal de Open Food Facts sin contraparte web.
    Conservar como adaptación LEGAL escrita (también aplica al scanner); no es delta de paridad a arreglar.

## Comprobación objetiva

Flujo completo en ambos lados: buscar ("po"), elegir, cambiar unidad a "porción", elegir franja,
provocar dup-warning con porciones marcadas, registrar, verificar aparición en "Consumido hoy".
Copys y estados idénticos según lista.
