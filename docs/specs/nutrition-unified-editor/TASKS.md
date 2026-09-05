# TASKS — Editor unico de nutricion

Estado vivo de la ola. Deriva de [SPEC.md](SPEC.md) y [PLAN.md](PLAN.md).

## T3.1 — SPEC

- [x] Auditoria de las 4 superficies contra HEAD `71a829d5` (2026-08-15)
- [x] SPEC + PLAN + TASKS escritos; D1/D2 decididas por el owner (2026-08-15)
- [x] Matriz de acciones VERIFICADA celda por celda al abrir W1 (la tabla de abajo nace de los
  `case` de cada reducer; las celdas del quick-edit RN mezclan acciones con mapeo de errores y
  hay que confirmarlas leyendo `nutrition-v2-quick-edit.ts` completo) — CURRENT la da cerrada
  16-08 (cierre 2026-08-17)

## Matriz de acciones (borrador 2026-08-15)

Leyenda: WW = wizard web (`draft-builder.ts`), WR = wizard RN (`nutrition-v2-builder.ts`),
QW = quick-edit web (`quick-edit-state.ts`), QR = quick-edit RN (`nutrition-v2-quick-edit.ts`).

| Capacidad | WW | WR | QW | QR | Destino en editor unico |
|---|---|---|---|---|---|
| Alta de item (catalogo/custom) | `ADD_ITEM` | `ADD_ITEM` | `ADD_CATALOG_ITEM`+`ADD_CUSTOM_ITEM` | `ADD_ITEM` | Migra (forma QW: distingue catalogo/custom) |
| Editar item (nombre/cantidad/unidad) | `UPDATE_ITEM` | `UPDATE_ITEM` | `SET_ITEM_NAME/QUANTITY/UNIT`+`STEP_ITEM_QUANTITY` | `SET_ITEM_*` | Migra (forma QW granular + stepper) |
| Cambiar alimento conservando fila | — | — | `SWAP_ITEM_FOOD` | `SWAP_ITEM` | Migra |
| Quitar/deshacer item | `REMOVE_ITEM`+`RESTORE_ITEM` | `REMOVE_ITEM` (sin restore) | `REMOVE_ITEM`+`RESTORE_ITEM` | `REMOVE_ITEM`+`RESTORE_ITEM` | Migra; RN gana el restore en R1 |
| Reordenar item | `MOVE_ITEM` | — | `MOVE_ITEM` | — | Migra (drag + fallback menu); RN lo gana en R1 |
| Franjas (alta/edicion/quitar/deshacer) | `ADD/UPDATE/REMOVE/RESTORE_SLOT` | idem | idem | idem | Migra tal cual (gramatica T2.6/F1) |
| Copiar franja a variantes | `COPY_SLOT_TO_VARIANTS` | si | si | si | Migra |
| Copiar dia (quick-select prox N, anexar/reemplazar) | presets+quick-select T2.6/F2 | — | — | — | Migra desde WW; paridad RN en T3.3 |
| Variantes: alta | `ADD_VARIANTS` (multiple) | si | `ADD_VARIANT` (single) | `ADD_VARIANT` | Migra forma WW (multiple) |
| Variantes: quitar/deshacer | `REMOVE_VARIANT` | si | `REMOVE_VARIANT`+`RESTORE_VARIANT` | idem QW | Migra con restore (forma QW) |
| Variantes: dia/label/activa | `SET_VARIANT_DAY/LABEL`+`SET_ACTIVE_VARIANT` | si | `SET_VARIANT_DAY/LABEL` | si | Migra |
| Variantes: duplicar como / anexar franjas | `DUPLICATE_VARIANT_AS`+`APPEND_VARIANT_SLOTS_TO` | solo duplicar | ✅ W2 (`DUPLICATE_VARIANT_AS`, menu del dia) | — | Duplicar MIGRADO W2; anexar va con copy dia/semana (W3) |
| Targets por variante y modo | `SET_VARIANT_TARGETS`+`_MODE` | si | — | — | **MUERE** (decision W2 2026-08-15): la herencia inherit/custom es un artefacto PRE-publish del wizard; el read model materializa metas por dia y en el editor `SET_TARGET` ya edita las metas reales de cada dia. Un "usar metas del dia base" futuro seria un gesto de copia, no un modo |
| Targets globales | `SET_TARGET` | si | `SET_TARGET`+`STEP_TARGET` | `SET_TARGET` | Migra (con stepper QW) |
| Porciones prescritas | seccion aparte (`portions-state.ts`) | seccion aparte | `ADD/SET/STEP/REMOVE/RESTORE_PORTION_TARGET`+`APPLY_BASE_PORTIONS` | seccion aparte | Migra forma QW (integrada al reducer); las `portions-state` paralelas mueren en R1 |
| Sustituciones por item | `ADD/REMOVE_ITEM_SUBSTITUTION` | si | ✅ W2 (`ADD/REMOVE/RESTORE_ITEM_SUBSTITUTION`, sheet en el menu del item, solo editor) | — | MIGRADO W2 con undo; carry-over y bloqueo NUT-008 intactos; contador local `countItemSubstitutionChanges` (el paquete no compara subs) |
| Override de macros | `APPLY_FOOD_OVERRIDE` | si | ✅ W2 (menu del item, solo con `food` en mano — macroBase congelado intacto, criterio QE RN) | si | MIGRADO W2; cierra el hueco de QW; dialog del builder reusado (persiste solo) |
| Metadatos del plan (nombre/estrategia/permiso/vigencia) | `SET_PLAN_NAME/STRATEGY/PERMISSION/EFFECTIVE_FROM` | si | — | — | Migra a la cabecera |
| Notas visibles | `SET_VISIBLE_NOTES` | si | si | si | Migra; "Rehacer" jamas las resetea (PR #174) |
| Pasos del wizard | `NEXT/PREV/SET_STEP` | si | — | — | **Muere** (D1: documento vivo, sin pasos) |
| Reset/restore de draft | `RESTORE` | si | `RESET`+`RESTORE_DRAFT` | `RESTORE_DRAFT` | Se define en W1 (autosave/descartar del editor) |

## W1 — Esqueleto (modo edicion) — CERRADA 2026-08-15

- [x] Ruta nueva `/coach/nutrition-v2/[clientId]/editor` + page server (mismo perimetro fail-closed
  que la ficha: sesion + workspace no-enterprise + scope V2 + NUT-008 + food prefs; sin plan
  vigente redirige al wizard)
- [x] Reducer base: quick-edit web extendido con `meta` OPCIONAL (`QeMeta`: nombre, estrategia,
  permisos) + acciones `SET_PLAN_NAME`/`SET_STRATEGY`/`SET_PERMISSION`; sin `meta` el quick-edit
  clasico queda bit-identico (acciones no-op, proyeccion intacta). `RESET`/`RESTORE_DRAFT` no
  cruzan superficies (el clasico descarta meta ajeno; el editor conserva el suyo) y el respaldo
  local del editor usa prefijo propio (`unifiedEditorDraftKey`)
- [x] Cabecera `EditorMetaCard`: nombre editable (validacion 1-180 espejo del contrato), permisos
  Registro libre / Ajustar cantidades con switch (los chips read-only de la card de notas se
  ocultan en modo editor), estrategia read-only (badge) y vigencia informativa. Publish CAS
  intacto via `quickEditPublishAction`; `countDraftChanges` ya cuenta nombre/estrategia/permisos
- [x] Sin CTA publica (solo URL directa)
- [x] Harness local `dev-harness/nutrition-editor` (read model sintetico, sin auth) + verificacion
  Playwright headless: nombre hidratado, 1 cambio al renombrar, 2 con el toggle, publish cortado
  por validacion local con nombre vacio, 0 pageerrors (evidencia: screenshot 390px)
- [x] Gates: vitest 5691 verdes (incl. 8 tests nuevos `quick-edit-state.meta.test.ts`), eslint 0
  errores (archivos tocados 0 warnings), `tsc --noEmit` web verde, check:tokens verde,
  check:nutrition-v2-boundaries verde. `pnpm build` NO corrido (falla local por Node 24 — regla
  vigente: Vercel es la verdad)

Pendientes declarados que salen de W1: creacion `?from=` + `effectiveFrom` elegible (W1.5),
estrategia editable con su semantica (W1.5), `quantityAdjustmentPercent` y permisos finos (W1.5).

## W1.5 — Modo creacion — CERRADA 2026-08-15

- [x] `draftToEditState` (draft del contrato + foods por id + snapshots de grupos → arbol
  editable con meta; degradacion VISIBLE: alimento no resuelto = fila sin macros en vivo,
  grupo no resuelto = "Grupo no disponible")
- [x] Hidratacion `?from=` en la page: `template:` (draft de la plantilla + `fetchBuilderFoodsByIds`
  + catalogo de grupos + `markPlanTemplateUsed`), `plan:` (read model del alumno fuente —
  macros congeladas sin fetch de foods — + carry-over de reemplazos con NUT-008 si su lectura
  cae), blank (1 dia base vacio, nombre "Plan de {alumno}"). Origen caido degrada CON AVISO
  (toast; leccion JP 2026-08-11) y con plan vigente degrada a EDICION, jamas a un plan nuevo
  encima. `clientId`/`timezone` del destino SIEMPRE mandan; `planId` fuente jamas viaja
- [x] Publish creacion por `publishPlanAction` con `effectiveFrom` elegible (`QeMeta.effectiveFrom`,
  solo creacion; validacion local espejo de EFFECTIVE_DATE) y CAS solo si el alumno ya tenia
  plan (reemplazo). Baseline VACIO: todo el origen cuenta como alta y la barra aparece de
  entrada (publicar una plantilla sin tocarla es legitimo). Evento PostHog `editor`
- [x] Estrategia editable con regla segura (`qeAllowedStrategies`: flexible SOLO sin franjas;
  hybrid con candado sin Pro — gate real server) + permisos finos (4 switches + tope ±% con
  `OptionalClampedIntInput`; `canSubstitute` sigue oculto por D4 de T2.5)
- [x] Harness `?mode=create` + verificacion headless (nombre de plantilla hidratado, vigencia
  presente, Flexible ausente con franjas, barra visible de entrada, tope ±% aparece/desaparece
  con su switch; 0 pageerrors; screenshots 390px)
- [x] Gates: vitest 5696 verdes (12 tests meta/creacion), eslint 0 errores, tsc web verde,
  tokens y boundaries verdes; build local NO (Node 24)

Pendientes declarados que salen de W1.5: respaldo local (localStorage) en modo creacion;
selector de origen dentro del editor (hoy la puerta sigue siendo la URL `?from=`, el corte de
las CTAs es W4); copy del confirm sheet especifico de creacion.

## W2 — Capacidades wizard-only — CERRADA 2026-08-15

- [x] Sustituciones por item EDITABLES (solo editor, `state.meta`): sheet "Reemplazos
  autorizados" en el menu ⋮ del item — lista con nombres (snapshot congelado `read.name` /
  catalogo al agregar, display-only), quitar optimista + Deshacer al indice, alta via
  `FoodPickerSheet` con guardas del wizard (tope 8, sin duplicados, sin auto-reemplazo).
  Contador local `countItemSubstitutionChanges` (el paquete no compara subs; mismo precedente
  que `countVariantHeaderChanges`)
- [x] `APPLY_FOOD_OVERRIDE` en quick-edit web (cerraba el cruce 3-de-4): "Editar macros" en el
  menu del item cuando hay `food` en mano; `FoodMacrosOverrideDialog` del builder reusado
  (persiste `coach_food_overrides` solo); macroBase congelado intacto (criterio QE RN)
- [x] `DUPLICATE_VARIANT_AS`: "Duplicar como…" en el menu del dia (multi-dia) — clona metas y
  franjas del dia ELEGIDO (no solo el base como `ADD_VARIANT`), Deshacer elimina el dia nuevo
- [x] Decision de matriz: `SET_VARIANT_TARGETS`/`_MODE` MUEREN (artefacto pre-publish del
  wizard; el editor edita metas reales por dia); `APPEND_VARIANT_SLOTS_TO` va con el copy
  dia/semana de W3
- [x] Todo gateado a `state.meta`: el quick-edit clasico queda sin cambios de comportamiento
- [x] Harness headless ampliado: menu del item con reemplazos (vacio + CTA), duplicar dia base
  → Domingo con toast Deshacer; 0 pageerrors
- [x] Gates: vitest 5699 verdes (3 tests W2 nuevos), eslint 0 errores, tsc web verde, tokens y
  boundaries verdes; build local NO (Node 24)

## W3a — Copy semana + porcion pegajosa — CERRADA 2026-08-15

Gates acumulados a pedido del owner y corridos en una pasada el mismo dia: vitest completo
5701 ✓ · tsc web ✓ · tokens ✓ · boundaries ✓ · harness headless ✓ (incluye el flujo de copia:
menu → sheet con modos y presets → copiar base a Lunes → toast + dia en la pila).

- [x] `COPY_VARIANT_TO_DAYS` (accion ATOMICA; el wizard necesitaba cola de dispatches + store
  de porciones aparte — aca el arbol lleva porciones/reemplazos adentro): `replace` conserva
  la IDENTIDAD del destino (key/id/etiqueta del coach) y clona el contenido del origen;
  `append` suma franjas; dia libre se crea clonando el ORIGEN elegido. Self/dow invalido/
  repetido se ignoran. Deshacer = `RESTORE_DRAFT` del arbol previo
- [x] Sheet "Copiar a otros días…" en el menu del dia (solo editor, con franjas): modo
  Reemplazar/Sumar (SegmentedControl), presets Lu-Vi/Finde/Todos + "Próximos 1/2/4" (modulos
  PUROS del wizard `copy-presets`/`copy-plan` reusados tal cual), DayPicker multi con el
  origen bloqueado, y AVISO previo exacto (`copyPlanWarning`: que se pisa, que se suma, que
  nombres quedan duplicados)
- [x] Porcion pegajosa T2.6/F4 en el editor: read (page resuelve `fetchRememberedQuantities`,
  `RememberedQuantitiesContext` del builder montado por EditorClient, `ADD_CATALOG_ITEM`
  gana `prefill` opcional) + write (commit de cantidad en EditableItemRow →
  `rememberFoodQuantityAction`, con el guard de firma del wizard; SOLO editor — el quick-edit
  clasico ni lee ni escribe memoria, contexto vacio = prefill undefined)
- [x] Gates completos de la tanda + harness headless del copy (2026-08-15, ver arriba)

## W3b — Layout final — CODIGO LISTO 2026-08-15, queda QA VISUAL del owner en preview

- [x] Capsula de DIA ACTIVO (solo editor): un dia a la vez; los chips del indice pasan de
  scrollear a CAMBIAR el dia en edicion (fallback en cadena: eleccion → dia de HOY → primero).
  El encabezado del dia vive siempre en el editor (acceso al menu); clasico intacto
- [x] Totales del dia fijos abajo: `PublishBar` gana `dayTotals` (items + porciones en vivo via
  `qeVariantTotalWithPortions`, con la meta kcal si existe); en el editor la barra vive SIEMPRE
  (los botones solo con cambios). Clasico sin prop = comportamiento historico
- [x] Paleta lateral desktop (`lg+`, solo editor): `FoodPicker` compartido en modo inline
  (patron del panel del wizard) apuntando a una franja elegida del dia activo, con porcion
  pegajosa; grid 2 columnas `lg:max-w-6xl`. En movil no existe (el alta sigue por franja)
- [x] Reorden dentro de la franja: `REORDER_ITEM` (clamp, no-op sin movimiento) + Subir/Bajar
  en el menu del item (touch) + drag HTML5 con manija (desktop; mismo slot = reorden, otra
  franja del mismo dia = mover con indice). Contador local `countItemOrderChanges` (el paquete
  no compara orden a proposito — tercer contador local, mismo precedente)
- [x] Harness headless verde ANTES de preview: capsula activa el dia base, totales
  "300 / 2200 kcal" visibles, paleta presente en 1440px con selector de franja, flujo completo
  W1→W3 sin pageerrors (screenshots 390px + desktop)
- [x] Gates: vitest 5702 ✓ · tsc web ✓ · tokens ✓ · boundaries ✓ · eslint 0 err ✓ · build NO (Node 24)
- [x] **QA VISUAL del owner en preview** (drag real con mouse, responsive, dark mode, white-label)
  — el corte de CTAs (W4) no arranca sin este OK; W4 registra el OK explicito del owner, CURRENT
  la da cerrada 16-08 (cierre 2026-08-17)

## W4 — Corte 1 — CERRADA 2026-08-15

- [x] Preview con OK explicito del owner ("todo bien sin problemas", QA de la guia completa
  sobre el deploy `df21fb27`)
- [x] CTAs → editor: ficha (Crear plan ×2 y el lapiz de editar), `+` del Centro V2
  (`NewPlanPickerButton`, conserva `?from=`), roster del hub (`HubRoster` ×2), tab nutricion
  del cliente (`nutritionTabV2.logic`), "Aplicar plantilla" (`PlanTemplatesLibrary`,
  `?from=template:`). Par viejo a secundario: menu "..." de la ficha gana "Edición rápida
  (clásica)" (quick-edit in-place) y conserva "Rehacer con el asistente" (wizard). El builder
  sigue aceptando URL directa; el builder de PLANTILLAS no se toca (D2: migra en T3.2b)
- [x] `MOBILE_PARITY.md` declara el gap RN en el mismo commit (editor unico web-only hasta T3.3)
- [x] `docs/status/CURRENT.md` actualizado; **arranca la ventana de 2 semanas de observacion**
  (retiro del par exige ademas plantillas migradas — D2)
- [x] Gates + registro (fila abajo)

Decision del owner (2026-08-15): pasada visual UI/UX del editor = tanda propia DESPUES del
corte, con su QA.

## V1 — Pasada visual UI/UX — CODIGO LISTO 2026-08-16, queda QA del owner

Evidencia: harness `dev-harness/nutrition-editor` (edit / create / template) capturado con
Playwright a 390 px y 1440 px, claro y oscuro, 0 pageerrors y 0 errores de consola. Los cinco
arreglos salen de mirar esas capturas, no de una lista teorica:

- [x] **La cabecera de metadatos dejaba al coach sin ver una sola comida**: ocupaba el primer
  pantallazo entero (390 px) y toda la primera pantalla en desktop. Ahora nace COLAPSADA cuando
  se edita un plan que YA existe (sus metadatos ya estan decididos) y resume
  `nombre · estrategia · permisos activos`; en CREACION y en PLANTILLA sigue abierta, porque ahi
  definirlos es el primer paso. Un error de validacion en un campo escondido la abre sola
- [x] **"Notas y permisos" mentia en el editor**: los permisos viven en la cabecera desde W1 y
  el titulo mandaba a buscar controles que no estan. Pasa a "Notas para tu alumno" (y muere el
  label repetido debajo, que decia la misma frase dos veces)
- [x] **Creacion hablaba como edicion**: el eyebrow decia "Editar plan" y la barra "Publicar
  cambios" sobre un plan que todavia no existe. Ahora dicen "Nuevo plan" / "Publicar plan", con
  su confirm propio (cierra el pendiente declarado de W1.5)
- [x] **Contador truncado en 390 px** ("3 cambios sin p…"): en movil el contador toma su propia
  linea y los dos botones reparten el ancho — mismo criterio que la barra RN (H-18/QW-12)
- [x] **Tope de ajuste (±%)**: era una caja vacia sin explicacion; ahora dice "Sin tope"
- [x] Espejo RN de los cinco (cabecera colapsable, titulo de notas, vocabulario de creacion,
  placeholder del tope; la barra RN ya apilaba el contador)
- [x] Gates: vitest editor+paquete 1036 ✓ · tsc web ✓ · tsc mobile ✓ · eslint 0 err en tocados ✓
  · tokens 86/86 ✓ · boundaries ✓ · expo export android ✓ · harness headless ✓
- [x] **QA visual del owner** (web preview + device Android): dark mode, white-label, 390 px —
  CURRENT la da cerrada 16-08 (cierre 2026-08-17)

## T3.2b — Plantillas

- [x] Importadores del wizard de plantillas VERIFICADOS antes de tocar nada (2026-08-15):
  la puerta V2 real es `/coach/nutrition-v2/plantillas/builder?template=<id>` (los
  `nutrition-plans/new`/`[templateId]/edit` legacy solo redirigen con el swap V2); la linkean
  SOLO `PlanTemplatesLibrary` (2 CTAs "Nueva plantilla" + `editHref`) y el redirect legacy.
  RN consume plantillas via `/api/mobile/nutrition-v2/plan-templates` (payload intacto) y su
  adaptador ya degrada plantillas SIN `builder` (rama b de `nutrition-v2-builder-template.ts`)
- [x] MODO PLANTILLA del editor (2026-08-15): ruta `/coach/nutrition-v2/plantillas/editor`
  (`?template=<id>` = editar; sin id = nueva; SIN CTA publica hasta el corte 2). Provider gana
  `template` (`EditorTemplateInput`): guardar via `updatePlanTemplateDraftAction` /
  `savePlanTemplateAction` (sin CAS ni idempotencia — paridad wizard), vocabulario completo
  "guardar" (barra, sheet, guard de salida), descripcion de la fila editable en la cabecera
  (fuera del reducer, cuenta +1 propio), banner permanente "esto es una plantilla" (leccion
  JP 11-08), degradacion de plantilla ilegible = blanco CON aviso y `templateId` null (jamas
  pisa a ciegas). Sin vigencia: `draftToEditState` ahora solo pone `meta.effectiveFrom` si la
  opcion viene (ausente = la card no pinta el campo). Coach-scoped: grupos de porciones por
  `loadExchangeGroupsForCoachAction`, picker sin alumno, porcion pegajosa NI lee NI escribe.
  El `builder` payload del wizard se cae al guardar desde el editor (a proposito: el draft es
  el canonico; wizard y RN ya reconstruyen desde el draft)
- [x] Hallazgo de la tanda: los contadores aparean por `id` y `stripDraftIdentity` los quito
  al guardar ⇒ una plantilla intacta abria "con 2 cambios". Fix `withSyntheticDraftIds`
  (ids de sesion, el guardado los re-strippea) + regresion en vitest. Gotcha harness: ids
  random en componente SSR+cliente = hydration mismatch (familia EVA-NEXTJS-18) — generador
  determinista inyectable
- [x] Harness `?mode=template` + verificacion headless (Playwright): hidratacion
  nombre/descripcion, 0 cambios de entrada, +1 por descripcion, sheet "Guardar la plantilla",
  sin "Vigente desde", paleta desktop, y regresiones create (vigencia+publicar) y edit; 0
  pageerrors, 0 errores de consola (screenshots 390 + 1440)
- [x] Gates + registro (fila abajo)
- [x] **Corte 2 — HECHO 2026-08-16 con QA del owner en preview OK**: las 2 CTAs "Nueva plantilla"
  de `PlanTemplatesLibrary` (cabecera y estado vacio) y el lapiz de cada fila apuntan a
  `plantillas/editor`; el redirect legacy `nutrition-plans/new` (swap V2) tambien. El wizard de
  plantillas queda vivo SOLO por URL directa (cero CTAs lo linkean) hasta el retiro del par
  viejo; docblocks del servicio de plantillas alineados en el mismo commit

## R1 — Extraccion de reducers — CERRADA 2026-08-16

- [x] Gramatica superset en `packages/nutrition-v2` (modulo puro, sin React): el reducer del
  editor unico (ex `quick-edit-state.ts` web, 2.400 LOC) movido VERBATIM a
  `packages/nutrition-v2/editor-state.ts` — solo cambiaron los imports (internos del paquete
  + `@eva/nutrition-engine`, dependencia workspace nueva declarada; precedente:
  plan-builder→workout-engine, que el movil ya bundlea). Con el vinieron las piezas puras del
  wizard que necesitaba y un paquete no puede importar de apps/web: `editor-food.ts`
  (`BuilderFood`, `computeItemMacros` — congela planes, byte-identico —, `slotMergeName`,
  `MAX_ITEM_SUBSTITUTIONS`) y `editor-portions.ts` (`portionsKey`, `daysMissingBasePortions`
  B4). `draft-builder.ts` y `portions-state.ts` las RE-EXPORTAN desde sus rutas historicas
  (los importadores del wizard no cambian)
- [x] Paridad (alcance real declarado): el movimiento fue VERBATIM y la suite completa del
  reducer (quick-edit-state{,.item-actions,.meta}.test.ts + publish-guards, cientos de
  asserts) corre ahora CONTRA el paquete — 5705 verdes. Paridad wizard: cada capacidad
  migrada en W2/W3 llevo test propio (matriz). Paridad RN quick-edit: se escribe en T3.3 al
  swapear RN (sus tests golden comparan contra su reducer vivo; un test raiz que importe
  `apps/mobile` rompe CI — gotcha conocido)
- [x] Web consume el paquete: los 16 importadores (componentes del quick-edit/editor, pages,
  actions, harness, tests) apuntan a `@eva/nutrition-v2`; `quick-edit-state.ts` web BORRADO.
  El reducer del wizard web (`draft-builder.ts`) sigue vivo a proposito: muere CON el wizard
  en el retiro del par (D2), no en R1
- [x] Gates: vitest 5705 ✓ · tsc web ✓ · **tsc mobile ✓** · eslint 0 err/0 warn en tocados ✓ ·
  tokens ✓ · boundaries ✓ · harness headless ✓ (template+create+edit, 0 pageerrors) ·
  `expo export --platform android` ✓ (Metro resuelve el import nuevo del engine desde el
  paquete) · build web NO (Node 24) + registro

## T3.3 — Editor RN Android

- [x] **T3.3a — convergencia del quick-edit RN a la gramatica compartida (2026-08-16, SIN QA
  device)**: `QuickEditMode` + componentes consumen `@eva/nutrition-v2` (`readModelToEditState`,
  `quickEditReducer`, `applyQuickEditToDraft`, contadores por id, `validateQuickEdit`). Muertos:
  el reducer RN (`nutrition-v2-quick-edit.ts` queda en 240 LOC de carry-over F-02 + transporte)
  y el reducer paralelo de porciones (`quick-edit/portions-state.ts` BORRADO — porciones en el
  arbol). Publish RN = draft proyectado + `injectSubstitutionsIntoDraft` + endpoint movil de
  siempre (CAS/idempotencia/delta-gate intactos). El paquete gana `SET_PORTION_NOTES`
  (capacidad RN absorbida; proyeccion normaliza trim/''→null, con test). Convergencias de
  comportamiento DECLARADAS en MOBILE_PARITY (lapiz T2.2 solo con food hidratado — criterio W2;
  diff id-based; respaldos locales v1 descartados con `schema: 2`). Tests RN del reducer
  muerto (4 suites raiz) retirados — la conducta vive en la suite del paquete (override, copy
  con porciones, ADD_VARIANT clone, notas) — y el test de frontera de mutaciones actualizado
- [x] Gates T3.3a: vitest 5669 ✓ (−37 superseded, +1 notas) · tsc web ✓ · tsc mobile ✓ ·
  eslint 0 err (1 warning PREEXISTENTE en builder RN, verificado con stash) · tokens ✓ ·
  boundaries ✓ · expo export android ✓ · build web NO (Node 24)
- [x] **QA device Android del owner: OK (2026-08-16)** — flujo quick-edit completo verificado
  (cantidades/steppers, franjas, dias, porciones +notas, copia de franja, override tras swap,
  restaurar borrador, publicar). El OTA NO sale todavia: decision del owner de ACUMULAR hasta
  cerrar T3.3b + pasada visual + retiro del par
- [x] **T3.3b — editor unico RN completo: CODIGO LISTO 2026-08-16 (SIN QA device)**, en 5 olas:
  - **W1** ruta `/coach/nutrition-v2/editor/[clientId]` + `QuickEditMode` con prop `editor`:
    `state.meta` hidratado (nombre, estrategia, permisos, vigencia en creacion), cabecera
    `EditorMetaCard` RN, key de respaldo propia (`unifiedEditorDraftKey`). Creacion
    `?from=template:|plan:|blanco` con `loadEditorSession` (espejo del server component web:
    clientId/timezone del destino mandan, planId de la fuente jamas viaja, degradacion CON
    aviso y caida a EDICION con plan vigente). Publish de creacion por `publishDraftRN` con
    CAS solo si ya habia plan. Reemplazos F-02 ahora HIDRATADOS en el arbol
    (`loadItemSubstitutionReads`), NUT-008 intacto. Picker de porciones suma el catalogo vivo
  - **W2** capacidades del wizard: menu ⋮ del item con reemplazos EDITABLES (lista, quitar con
    Deshacer al indice, alta por buscador en modo `substitution`, guardas enunciadas), reorden
    Subir/Bajar (`REORDER_ITEM`), "Duplicar como…" y "Copiar a otros días…" (Reemplazar/Sumar,
    presets Lu-Vi/Finde/Todos + próximos N, aviso previo `copyPlanWarning`, Deshacer del arbol).
    Para no duplicar logica, `copy-presets`/`copy-plan` del wizard web se MUEVEN al paquete
    (`editor-copy-presets`/`editor-copy-plan`) con sus tests; las rutas web quedan re-export
  - **W3** capsula de DIA ACTIVO (chips que cambian el dia), totales del dia fijos en la barra
    (`dayTotals`, la barra vive siempre en el editor) y **porcion pegajosa RN** sobre las dos
    RPC ya en LIVE (`nutrition-v2-last-quantity.ts`): prefill en el alta + commit al blur con
    guard de firma. Cierra la deuda declarada de T2.6 F4 en MOBILE_PARITY
  - **W4** modo PLANTILLA (`plantillas/editor`, `?template=`): vocabulario de guardar, banner
    permanente, descripcion editable, ids sinteticos, sin porcion pegajosa. Camino de escritura
    movil NUEVO: accion `saveTemplate` del endpoint de mutaciones reusando el servicio web
    (4 tests) + `purpose=edit` en el GET de plantillas (abrir para editar no cuenta como uso)
  - **W5 corte RN**: ficha (Crear plan / Editar plan), `+` del hub, CTA por fila del roster y
    picker de plantillas (Nueva plantilla + lapiz por fila) apuntan al editor; el par viejo
    queda secundario ("Edición rápida (clásica)"; wizard por URL directa)
- [x] OTA android al cierre (solo por GH Actions `mobile-ota.yml`, `--platform android`) —
  **ACUMULADO por decision del owner (2026-08-16)**: no sale con T3.3a; junta T3.3a + T3.3b +
  pasada visual y se propone al cerrar el retiro del par viejo — publicado 2026-08-17 (grupo
  `aca6fc76` / android `01a00d3d`, ver CURRENT)
- [x] iOS: OTA `--platform ios` solo post-aprobacion Apple — desde el 18-08 los OTA del canal
  `production` salen android + ios sobre el mismo commit (ver CURRENT)

- [x] **QA device del EDITOR RN** (acumulado con el OTA): editar el plan vigente con
  metadatos, crear desde plantilla / desde otro alumno / en blanco, reemplazos autorizados,
  duplicar y copiar dia, reorden, porcion pegajosa, y crear/editar una plantilla — **QA del owner VERDE 05-09** (sesión única, artifact `6bd32370`, Android 1.1.2 build 86 / iOS 1.1.2 build 59 con OTA del 04-09 android `d8220490` / ios `54487ddd`, web `f9ba8a3f`). La **demolicion del par viejo** sigue abierta: es codigo, no QA

## Retiro del par viejo

- [x] **Importadores VERIFICADOS (2026-08-16)** — la mitad del gate que si se podia cerrar hoy.
  Hallazgo principal: retirar el par NO es borrar carpetas. Cero CTAs de navegacion apuntan ya
  al wizard (web y RN), pero el EDITOR depende de modulos que viven DENTRO de `builder/`, asi
  que el retiro es 2 movimientos: mover lo compartido y recien despues borrar lo del wizard.

  **Web — MUDANZA COMPLETA (2026-08-16)**: ya NADA fuera del wizard importa de
  `[clientId]/builder/`, salvo una excepcion declarada abajo. Salieron, sin un solo cambio de
  logica (`git mv` + imports):

  | Que se mudo | A donde | Por que no era del wizard |
  |---|---|---|
  | capa "draft → filas de la base" (`buildVariantInsertRow`, `buildSlotInsertRow`, `buildItemInsertRow`, `buildItemSubstitutionInsertRow`, `buildExchangeTargetInsertRow`, `collect*`, `ExchangeGroupSnapshotError`, `BuilderExchangeGroup`) | `_lib/plan-draft-rows.ts` | la usa `_actions/plan-persistence`: el camino de escritura que comparten editor, quick-edit, asignacion y el endpoint MOVIL |
  | `publishPlanAction` + `createCoachFoodAction` | `_actions/plan-publish.actions.ts` | publican la creacion del editor y el alta de alimento libre |
  | `rememberFoodQuantityAction` | `_actions/last-quantity.actions.ts` | porcion pegajosa del editor |
  | `mapCatalogItemToFood` | `_lib/food-catalog-mapping.ts` | traduccion del picker (editor y paleta) |
  | `quantity-format`, `builder-ui-classes` | `_lib/` | fila del item del editor |
  | `FoodImage`, `food-card-presentation`, `ItemQuantityField`, `FoodMacrosOverrideDialog`, `AddDayPopover` (+`useIsDesktopMd`) | `_components/` | UI que el editor pinta |
  | `template-mode`, `plan-foods.data`, `last-quantity.data`, `RememberedQuantitiesContext`, `PortionsGroupsAction` | `_lib/`, `_data/`, `_components/`, `_actions/` | mudados en la primera tanda del dia |
  | `BUILDER_UNITS`, `MAX_DAY_VARIANTS`, `collectTemplateFoodIds` | `@eva/nutrition-v2` | reglas de dominio que web y RN comparten (mata la duplicacion con el builder RN) |

  **Unica dependencia viva que queda**: `_actions/plan-templates-from-plan.actions.ts` (guardar
  el plan de un alumno como plantilla) usa `rehydrate` + `assembleDraft` + `portions-state` del
  wizard. No es una mudanza: hay que REESCRIBIRLA sobre la gramatica del editor
  (`readModelToEditState` + `applyQuickEditToDraft`), con sus tests. Es el primer paso del
  retiro propiamente dicho.

  **Web — muere con el wizard**: `builder/page.tsx` + `plantillas/builder/page.tsx`, el cliente
  del wizard y sus pasos, el reducer (`draft-builder` sin la capa ya mudada), `rehydrate`,
  `portions-state`, `builder-view-model` y el par secundario del menu de la ficha.

  **RN — muere**: `app/coach/nutrition-v2/builder/[clientId].tsx` (3.760 LOC) y la parte de
  ESTADO de `lib/nutrition-v2-builder.ts` (1.876 LOC). **Sobrevive** lo que el editor usa
  (`BuilderFood`, `mapFoodCatalogItemToBuilderFood`, `strategyUsesSlots`, `MAX_DAY_VARIANTS`,
  `NutritionV2WriteClient`, `BuilderFoodMacrosPatch` y los tipos de publicacion).

- [x] **WEB: puertas retiradas (2026-08-17)** — el owner declaro cumplida la ventana de QA
  (workflow nutrition-unified-editor, fila R1) y autorizo el retiro de ACCESOS web:
  - Ficha del alumno: el menu "..." (Edición rápida clásica + Rehacer con el asistente) se
    elimino de `QuickEditEntry`; queda solo el lapiz al editor unico. La maquinaria del
    overlay clasico sigue en el archivo SIN puerta (nada pone `editing=true`).
  - `[clientId]/builder` redirige a `[clientId]/editor` conservando `?from=`; el resto de la
    page queda inalcanzable pero VIVO (la demolicion es otra tanda).
  - `plantillas/builder` redirige a `plantillas/editor` conservando `?template=`.
  - Cero CTAs al par viejo (grep final en el registro); V1 (`nutrition-plans` Enterprise) intacta.
- [ ] **Ejecutar la demolicion (web) + retiro RN** — sigue bloqueado: QA device del editor RN +
  su OTA, y la reescritura de "guardar como plantilla" sobre la gramatica del editor. Recien
  entonces se borran wizard/clasico (web y RN) segun el inventario de arriba. **EN EJECUCIÓN
  (workflow 17-08)** — nota de higiene documental 2026-08-17.

## Fixes post-cierre

### 2026-09-02 — Errores de días NO activos (reporte del coach jotap-coach / alumno Alan)

Síntoma: «Revisa los campos marcados antes de publicar» sin nada marcado. Causa: el editor único
pinta UN día (`visibleVariants = [activeVariant]`) pero `validateQuickEdit` revisa todos; con plan
híbrido y días agregados «Empezar vacío», el error `variant.<key>.slots` vivía en un día que no
estaba en pantalla. En RN ese error nunca se pintaba (solo el builder viejo lo hacía) y los chips
no recibían errores; en web solo lo pintaba el día activo y la cápsula (<1024) no marcaba nada.

Mockup aprobado por el owner (artifact `e42ae84b`): todo «reco» (ámbar en chips, botones inline
en el aviso, aviso bajo «Empezar vacío», RN + web en el mismo tren).

- [x] **Paquete** — `qeDayErrorSummaries` / `qeErrorDayKeys` / `qeFirstErrorDayKey` /
  `qePublishBlockedBar` en `packages/nutrition-v2/editor-state.ts` (+ `editor-state.day-errors.test.ts`,
  16 tests): mapean cada clave de error a su día en orden de lectura, deciden el salto y redactan el
  mensaje de la barra («Martes y Miércoles no tienen ninguna comida.» + «Ir a Martes»). Mismas
  respuestas en RN y web.
- [x] **Fix 1 — chips/rail/cápsula con alarma + salto** — punto ámbar (`warning-500`) en los días
  vacíos (estrategias con franjas, siempre) y en los días con error (desde el primer intento de
  publicar); al cortar el publish, el editor salta al primer día con error salvo que el activo ya
  los tenga. RN: `DayAnchorRow.attentionKeys`; web: `EditorDayCapsule`/`EditorDayRail.attentionKeys`
  + `blockedAttempt` en el provider. Sufijo «Necesita atención» en el nombre accesible.
- [x] **Fix 2 — el día vacío se pinta** — bloque de error en el lienzo del día con «Agregar franja»
  (mismo `ADD_SLOT`) y «Eliminar día» (mismo flujo con Deshacer; oculto en el día base). RN lo
  estrena; web extrae `useRemoveDayVariant` para no duplicar la baja del menú ⋮. `plan.dayVariants`
  también se pinta ahora en ambas.
- [x] **Fix 3 — la barra nombra el día** — mensaje derivado (`qePublishBlockedBar`) en vez del
  genérico guardado en estado: se apaga solo al corregir. Botón «Ir a {día}» reemplaza a
  «Reintentar» para errores de validación (RN `PublishBar.errorAction`; web
  `PublishBar.validationMessage/validationAction`). Genérico solo cuando las marcas ya están a la vista.
- [x] **Fix 4 — aviso bajo «Empezar vacío»** — «El día nace sin comidas. Agrégale al menos una
  franja antes de publicar.» solo en estrategias con franjas (RN hoja de alta; web `AddDayPopover.emptyHint`,
  prop opcional: el builder no cambia).
- [x] **QA** — device Android/iOS (light/dark, marca propia) + web móvil/desktop contra desplegado:
  crear plan híbrido con un día «Empezar vacío», tocar Publicar → chip ámbar + salto + aviso con
  botones + barra con nombre del día; corregir → la barra se apaga sola. **QA del owner VERDE
  02-09** (device + web) — este fix puntual de días no activos queda cerrado con ese QA.

Gates (02-09): vitest paquete 16/16 ✓ · vitest `_quick-edit` web 106/106 ✓ · eslint 0 ✓ ·
tsc mobile ✓ · tsc web ✓ · tokens ✓ · boundaries ✓ · docs:check ✓.

**En producción (02-09 18:55Z):** commit `ee6766ae` (master = rnmobiledenuevo) → deploy Vercel
`dpl_BWKwbJ8B` READY (eva-app.cl) · OTA runtime 1.1.2: android `0e96143d` (run 33669999912) /
ios `61605963` (run 33670003993). El coach que lo reportó (jotap-coach) ya había resuelto su caso a
mano. Lo que sigue pendiente NO es este fix puntual (QA verde arriba), sino el QA device del
**editor RN completo**, ya listado en [`docs/testing/QA_DEVICE_PENDIENTE.md`](../../testing/QA_DEVICE_PENDIENTE.md)
y en § T3.3 más arriba de este mismo archivo.

## Registro de cierres

| Fecha | Tanda | Commit | Gates | Notas |
|-------|-------|--------|-------|-------|
| 2026-08-15 | T3.1 SPEC | `8d931280` | docs:check | SPEC/PLAN/TASKS; D1/D2 del owner |
| 2026-08-15 | W1 esqueleto (edicion) | `5c61d283` | vitest 5691 ✓ · eslint 0 err ✓ · tsc web ✓ · tokens ✓ · boundaries ✓ · harness headless ✓ · build NO (Node 24) | Ruta `/editor` sin CTA; meta opcional en el reducer; creacion `?from=` movida a W1.5 |
| 2026-08-15 | W1.5 modo creacion | `8054e980` | vitest 5696 ✓ · eslint 0 err ✓ · tsc web ✓ · tokens ✓ · boundaries ✓ · harness headless ✓ (edit+create) · build NO (Node 24) | `?from=` template/plan/blank; vigencia elegible; estrategia segura; permisos finos; degradacion de origen CON aviso |
| 2026-08-15 | W2 capacidades wizard-only | `d0aaa12d` | vitest 5699 ✓ · eslint 0 err ✓ · tsc web ✓ · tokens ✓ · boundaries ✓ · harness headless ✓ · build NO (Node 24) | Sustituciones editables + override + duplicar dia, gateado a editor; SET_VARIANT_TARGETS/_MODE muere; APPEND → W3 |
| 2026-08-15 | W3a copy semana + pegajosa | `a6570234` | vitest 5701 ✓ · tsc web ✓ · tokens ✓ · boundaries ✓ · harness headless ✓ · eslint 0 err ✓ · build NO (Node 24) — gates corridos en pasada diferida el mismo dia | Split W3a/W3b; W3b (layout) espera QA del owner |
| 2026-08-15 | W3b layout final | `93c94014` | vitest 5702 ✓ · tsc web ✓ · tokens ✓ · boundaries ✓ · harness headless ✓ (movil+desktop) · eslint 0 err ✓ · build NO (Node 24) | Capsula dia activo + totales fijos + paleta lateral lg+ + reorden (accion, Subir/Bajar, drag). QA visual del owner en preview: OK (2026-08-15) |
| 2026-08-15 | W4 corte 1 | `ef4a0ff0` | vitest 5702 ✓ (1 test actualizado al contrato nuevo) · tsc web ✓ · tokens ✓ · boundaries ✓ · eslint 0 err ✓ · docs:check ✓ · build NO (Node 24) | CTAs web → editor; par viejo a menu "..."; MOBILE_PARITY declara gap RN; ventana de 2 semanas ARRANCA |
| 2026-08-15 | T3.2b modo plantilla (sin corte) | `8908e38b` | vitest 5705 ✓ (3 tests T3.2b nuevos) · tsc web ✓ · tokens ✓ · boundaries ✓ · eslint 0 err ✓ · harness headless ✓ (plantilla + regresiones create/edit, 0 pageerrors) · build NO (Node 24) | Ruta `plantillas/editor` sin CTA; `withSyntheticDraftIds` (contadores aparean por id); corte 2 espera QA del owner en preview |
| 2026-08-16 | R1 extraccion de reducers | `f83a2fe7` | vitest 5705 ✓ (suite del reducer contra el paquete) · tsc web ✓ · tsc mobile ✓ · eslint 0 ✓ · tokens ✓ · boundaries ✓ · harness headless ✓ · expo export android ✓ (bundle 18,6 MB) · build web NO (Node 24) | `editor-state`/`editor-food`/`editor-portions` en el paquete; QE web borrado (16 importadores); wizard re-exporta; dep workspace `@eva/nutrition-engine` |
| 2026-08-16 | T3.3a convergencia QE RN | `b76370ae` | vitest 5669 ✓ (−37 superseded, +1 notas porciones) · tsc web ✓ · tsc mobile ✓ · eslint 0 err (1 warn preexistente builder RN) · tokens ✓ · boundaries ✓ · expo export android ✓ (18,5 MB) · build web NO (Node 24) · **QA device PENDIENTE (acumulado)** | QE RN sobre la gramatica compartida; mueren reducer RN + porciones paralelas; `SET_PORTION_NOTES` al paquete; convergencias declaradas en MOBILE_PARITY |
| 2026-08-16 | T3.2b corte 2 (plantillas) | `a3d27645` | tsc web ✓ · eslint ✓ · vitest plan-templates 12 ✓ · docs:check ✓ · build NO (Node 24) | CTAs de la biblioteca + redirect legacy → editor de plantillas; wizard solo por URL directa. QA del owner en preview: OK |
| 2026-08-16 | T3.3b W1 editor RN (edicion + creacion) | `ccb88e52` | tsc mobile ✓ · eslint 0 ✓ · expo export android ✓ (18,6 MB) | Ruta `/editor/[clientId]`, `state.meta` en RN, `?from=` con degradacion avisada, reemplazos hidratados, catalogo vivo en el picker |
| 2026-08-16 | T3.3b W2 capacidades del editor en RN | `8da005d5` | vitest paquete 451 ✓ · tsc web ✓ · tsc mobile ✓ · eslint 0 ✓ · expo export ✓ | Reemplazos editables, reorden, duplicar y copiar dia; `copy-presets`/`copy-plan` mudados al paquete con sus tests |
| 2026-08-16 | T3.3b W3 layout + porcion pegajosa RN | `a95f1811` | tsc mobile ✓ · eslint 0 ✓ · expo export ✓ | Capsula de dia activo, totales fijos y las 2 RPC de porcion pegajosa cableadas (cierra deuda T2.6 F4) |
| 2026-08-16 | T3.3b W4 modo plantilla RN | `fc725c6a` | vitest route mutate 29 ✓ (4 nuevos) · tsc web ✓ · tsc mobile ✓ · expo export ✓ | Ruta `plantillas/editor` + accion `saveTemplate` del endpoint movil + `purpose=edit` en el GET |
| 2026-08-16 | T3.3b W5 corte RN | `b4590047` | tsc mobile ✓ · expo export ✓ · docs:check ✓ | Ficha, hub, roster y picker de plantillas → editor; par viejo secundario; MOBILE_PARITY cierra el gap |
| 2026-08-16 | V1 pasada visual del editor | `bb593680` | vitest 1036 ✓ · tsc web+mobile ✓ · tokens ✓ · boundaries ✓ · harness headless ✓ | Cabecera colapsable, titulo de notas honesto, vocabulario de creacion, barra sin truncar, tope ±% legible |
| 2026-08-16 | Retiro: inventario + 1ra mudanza | `d21a2aec` + `d5eff83d` | vitest 1184 ✓ · tsc web ✓ · boundaries ✓ · docs:check ✓ | 5 modulos fuera de `builder/`; el resto inventariado. Ejecucion del retiro sigue bloqueada por el gate del owner |
