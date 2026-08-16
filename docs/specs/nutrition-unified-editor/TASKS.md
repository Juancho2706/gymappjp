# TASKS — Editor unico de nutricion

Estado vivo de la ola. Deriva de [SPEC.md](SPEC.md) y [PLAN.md](PLAN.md).

## T3.1 — SPEC

- [x] Auditoria de las 4 superficies contra HEAD `71a829d5` (2026-08-15)
- [x] SPEC + PLAN + TASKS escritos; D1/D2 decididas por el owner (2026-08-15)
- [ ] Matriz de acciones VERIFICADA celda por celda al abrir W1 (la tabla de abajo nace de los
  `case` de cada reducer; las celdas del quick-edit RN mezclan acciones con mapeo de errores y
  hay que confirmarlas leyendo `nutrition-v2-quick-edit.ts` completo)

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
- [ ] **QA VISUAL del owner en preview** (drag real con mouse, responsive, dark mode, white-label)
  — el corte de CTAs (W4) no arranca sin este OK

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
- [ ] **Corte 2** (espera QA del owner en preview): CTAs de `PlanTemplatesLibrary` y redirect
  legacy `nutrition-plans/new` → editor de plantillas; wizard de plantillas queda por URL
  directa como camino secundario; docs canonicos en el mismo commit

## R1 — Extraccion de reducers

- [ ] Gramatica superset en `packages/nutrition-v2` (modulo puro, sin React)
- [ ] Tests golden de paridad contra los 4 reducers vivos ANTES del swap
- [ ] Web consume el paquete; los reducers web viejos mueren
- [ ] Gates (incluye `tsc` mobile por tocar `packages/*`) + registro

## T3.3 — Editor RN Android

- [ ] Editor RN sobre los reducers de R1 (misma gramatica, layout sheet)
- [ ] `MOBILE_PARITY.md` al dia; QA device Android del owner
- [ ] OTA android al cierre (solo por GH Actions `mobile-ota.yml`, `--platform android`)
- [ ] iOS: OTA `--platform ios` solo post-aprobacion Apple
- [ ] Gates + registro

## Retiro del par viejo

- [ ] 2 semanas estable post-corte 2 + importadores verificados (tarea del programa padre)

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
