# TASKS — Rediseño de flujos de Nutricion V2

Estado real por tanda. Convenciones: `[ ]` pendiente · `[~]` en curso · `[x]` hecho con gates verdes (se anota commit) · `[!]` bloqueado (se anota por que).

## Fase 0

- [x] F0.1 Ruido apartado: `app.json` raiz (basura `{"expo":{}}`) borrado; `.gitignore`/`skills-lock.json`/`.github/*` fuera de los commits del programa
- [x] F0.2 `rnmobiledenuevo` ff a master b2a0e341 + checkout (2026-08-06)
- [x] F0.3 SPEC/PLAN/TASKS creados
- [x] F0.4 Baseline PostHog → capturada en BASELINE.md (2026-08-06, via T1.0)
- [x] F0.5 Runbook Android en SPEC.md

## Ola 1

- [x] T1.0 Instrumentacion PostHog + baseline (2026-08-06). Eventos web: student_nutrition_intake (item_tap/bulk_slot/portion_chip/free_search), student_nutrition_correction (opened/saved/voided), coach_nutrition_builder_opened, coach_nutrition_plan_published (wizard/quick_edit + duration_ms), coach_nutrition_template_applied (definido, dispara en T1.5). Baseline pre-instrumentacion en BASELINE.md (solo pageviews existian). RN sin PostHog — instrumentacion RN queda fuera de O1 (decision pendiente aparte). Gates: eslint archivos tocados verde, typecheck web verde; tests no corridos (cambio analytics-only, hooks no-op sin consentimiento).
- [x] T1.1 Notificaciones V2 (2026-08-06, worker Opus + juicio Fable)
  - [x] Cron: candidatos = UNION V1 ∪ V2 dedupe por alumno (V2 gana); version vigente con el MISMO desempate del snapshot (helpers puros `v2-candidates.ts` + 11 tests); skip por superficie (`daily_nutrition_logs` vs `nutrition_intake_entries` sin voided); franjas V2 batcheadas para el copy meal-aware (no-bloqueante, fallback generico); UN cron, cero RPC, cero query por alumno
  - [x] Banner push movido a `components/PushNotificationBanner.tsx` (boundaries obligaba) + montado en V2 con `empty:hidden` (sin CLS); V1 sigue igual
  - [x] Deep-link web ramificado V2/V1; RN se QUEDA en `/alumno/(tabs)/nutricion` a proposito (el alias YA es V2 y los binarios viejos no tienen la ruta nueva — cambiarlo = Unmatched Route)
  - [x] RN ya pide permiso de push en `_layout.tsx:212` — cero UI nueva; `PushBanner.tsx` muerto queda para la poda T1.3
  - Gates: typecheck verde · lint 0 errores (2 warnings preexistentes verificados vs HEAD) · vitest full 5356 verde · boundaries 303 verde · tokens 86 verde · docs verde
  - PENDIENTE al push de ola: curl al cron con CRON_SECRET en preview (las tablas V2 van por cast `V2ReadClient` — `database.types.ts` desactualizado, deuda conocida; retirar cast al regenerar)
- [x] T1.2 Correccion sin interrogatorio (2026-08-06, Fable). Web (EditQuantityDialog/VoidEntryDialog) y RN (EntryCorrectionSheet) con paridad exacta: chips de razon con la primera preseleccionada ("Me equivoque de cantidad" / "Lo registre por error") + "Otro motivo" con campo libre (min 3), y stepper hibrido de cantidad (g/ml ±10, contadas ±0.5). El server NO cambia: el texto del chip ya cumple el minimo de 3 del RPC — razon opcional en UX, validacion intacta, append-only intacto. A11y: radiogroup/radio + accessibilityState. Muere el copy "Minimo 3 caracteres". Gates: eslint verde, typecheck web verde, tsc mobile verde. QA device: pendiente al cierre de ola.
- [x] T1.3 Paridad decisiones tomadas (2026-08-06, Sonnet barrido + Fable live search)
  - [x] Live search web: debounce 300ms + guard de secuencia (server actions sin AbortController), muere el boton "Buscar", indicador "Buscando…" aria-live
  - [x] Nota coach RN expandida por defecto (useState(true), sin numberOfLines — espejo exacto de web)
  - [x] Poda RN verificada contra los comentarios de auditoria web: chips a los 2 permisos reales (P1), parrafo estrategia fuera (P2), fila fibra fuera (P4), "Fuera del plan" vacio no renderiza (H4)
  - [x] Web: semana en curso excluida de groupHistoryDaysByWeek + caption con el copy real de RN; tests 19/19 (2 nuevos)
  - Gates: tsc mobile verde · typecheck web verde · vitest week-nav 19/19 · eslint verde. QA device: pendiente al cierre de ola.
- [x] T1.4 Banda ±10% + dashboard sin RPC volatil
  - [x] Dashboard web (2026-08-06, Fable): la card ya NO llama `get_nutrition_today_v2` — lee la cabeza del historial (`get_nutrition_history_page_v2` pageSize 1, read-only; verificado en SQL que p_before null incluye hoy). Dia mas reciente = hoy → numeros con banda ±10% (zona success fija, fill theme.primary, barra escalada a 120% del target, copy "✓ en tu rango" / "faltan ~X" / "+X sobre tu rango" en ambar — nunca rojo); si no → card generica con CTA (paridad RN cache-first). Trade-off aceptado: el titulo pasa de nombre-del-plan a "Nutricion" (el history head no trae planName; el nombre vive en la pagina de nutricion). Gates: eslint verde, typecheck web verde.
  - [x] AuraHero web + RN (2026-08-06, Fable): linea de estado por tramo ("faltan ~X para tu rango" marca / "✓ en tu rango de hoy" success / "+X sobre tu rango" ambar — nunca rojo) + arco de zona [90%→100%] en el anillo (web: var(--color-success) al 35%; RN: prop zoneColor en AuraRing con el mismo success semantico fijo de global.css). Celebracion de meta intacta. Gates: eslint verde, typecheck web verde, tsc mobile verde, tokens 86/86.
- [x] T1.5 Plantillas "Aplicar" (2026-08-06, Fable): boton primario en cada fila legible → ApplyTemplateDialog (busqueda server de alumnos, badge "ya tiene plan" en ambar — el conflicto real lo resuelve el flujo de publicacion existente) → builder por LA MISMA puerta canonica `?from=template:` (cero caminos nuevos; docblock del archivo actualizado con la decision). Dispara `coach_nutrition_template_applied('library')`. 5 pasos → 2. Gates: eslint verde, typecheck web verde.
- [x] T1.6 Sustituciones puente (2026-08-06, Fable). Las pills de "Puedes reemplazar por" dejan de ser decorativas en web Y RN: tap → registro libre con la BUSQUEDA precargada (el live search de T1.3 corre solo; cero fabricacion de datos — el alumno elige el item real del catalogo) + franja preseleccionada. Sin canRegisterFreely → explainer (toast web / Alert RN) que dice que pedirle al coach. RN: onRegister acepta `q`, add-food-v2 lo lee y siembra el term. Reemplazado por el camino server-validado T2.4. Gates: eslint verde, typecheck web verde, tsc mobile verde.
- [x] Cierre O1 (2026-08-06/07) — codigo + QA verdes; queda la decision de merge web→master (owner) y el checklist formal diferido a O2:
  - [x] Gates: suite completa vitest **5358/0** + typecheck web + tsc mobile + eslint + tokens 86/86
  - [x] Push a preview autorizado por owner → `gymappjp-git-rnmobiledenuevo` READY
  - [x] **QA Playwright en preview (alumna qa-cat-rojas + coach josefit), TODO VERDE con evidencia** (screenshots en .playwright-mcp/qa-web-0*.png): T1.1 banner push visible en V2 · T1.2 dialogo correccion (stepper "Restar/Sumar 10 ml" + radiogroup opcional preseleccionado, guardado OK) · T1.3 live search (resultados sin boton Buscar) + historial arranca en semana cerrada + caption · T1.4a card dashboard fallback sin RPC volatil · T1.4b "faltan ~2.655 kcal para tu rango" (90% de 2.950 ✓) · T1.5 boton Aplicar → dialog 3 alumnas con badge "ya tiene plan" → builder precargado "Partiendo de Plancito 2" (2 pasos) · T1.6 pill Espinaca → registro con query precargada + franja POLLO preseleccionada + registrado. Hallazgo menor corregido en el acto: copy viejo del tab plantillas ("desde Nuevo plan → Reutilizar") → apunta al boton Aplicar.
  - [x] Smoke RN en emulador: bundle de la ola arranca SIN crash (dev client + Metro). Red del emulador sigue rota a nivel app (bug host 07-29, re-verificado) → flujos RN con datos = device fisico.
  - [x] Curl al cron (2026-08-06 ~21:00, owner rota CRON_SECRET nuevo + redeploys y ejecuta): `{"ok":true,"date":"2026-08-06","notified":4,"skipped":2}` — guard 401 sin secret ✓, fecha Santiago ✓, skipped incluye a Catalina (registro V2 del QA ⇒ filtro `nutrition_intake_entries` vivo), notified = alumnos que antes no recibian nada. CAVEAT anotado: el cron no dedupea entre corridas (solo skip-si-registro + dedupe de destinos por corrida) ⇒ el curl duplico el push nocturno a los V1 ya notificados por prod — one-off aceptado. NOTA OPS: CRON_SECRET ROTADO (valor nuevo en Vercel, Sensitive; el viejo muerto).
  - [x] QA device fisico Android (ronda 1: 2026-08-06 noche; ronda 2 de re-verificacion: 2026-08-07, celular del owner via Metro+USB, sesion Catalina con datos reales):
    - 🔴 ROOT CAUSE HISTORICO RESUELTO: el "bug de red del emulador desde 07-29" era `apps/mobile/.env` apuntando a un Supabase LOCAL muerto (`http://10.93.54.116:54321`). Corregido a prod (backup en `apps/mobile/.env.bak-20260806`). El emulador deberia volver a tener red app-level.
    - Ronda 1 (06-08): (A) items prescritos consumidos SIN lapiz/retirar en RN (gap NUT-009) → chip Registrado + lapiz + retirar en 9fbe9bcd; (B) "Otro motivo" del sheet de correccion tras el teclado → snapPoints 85/78 en 9fbe9bcd.
    - Ronda 2 (07-08, TODO VERDE con capturas): fix A ✓ (chip Registrado + lapiz + tacho; bulk CTA recalcula "Comer lo que falta (2) · 560 kcal"). Fix B: el snap 85/78 resulto INERTE (en el path nativeModal los snapPoints son solo techo del content-hug y el KAV era iOS-only; el Modal lleva statusBarTranslucent ⇒ Android NUNCA hace ADJUST_RESIZE — bug RN conocido) → fix real `behavior="padding"` siempre en `Sheet.tsx` (**139fe69b**), re-verificado: campo libre + footer visibles sobre el teclado, correccion 100→90ml guardada end-to-end (anillo pasa a 21 kcal y "faltan ~2.634" exacto; sheet de retiro muestra "90 ml"). Puntos checklist: 1 ✓ arco de zona + "faltan ~2.655 kcal para tu rango" (90% de 2.950); 4 ✓ pill Espinaca → "A POLLO · hoy" + query precargada + live search solo; 5 ✓ Plan podado (2 chips permisos reales, sin parrafo estrategia, sin fila fibra); 6 ✓ Historial arranca en semana cerrada (27 jul–2 ago) + caption "la semana en curso vive en el tab Hoy"; 7 ✓ dia sin registros libres NO renderiza seccion "Fuera del plan". Retiro (void) verificado append-only: item vuelve a "Lo comi", 0/3.
    - Hallazgos menores NUEVOS — triage 2026-08-07 (device del owner, Metro+USB):
      - [x] (a) mini-anillo P sin denominador. **NO era dato**: la query read-only a LIVE confirmo `target_protein_g = 290` en los 5 snapshots desde el 03-08, y un log por CDP confirmo que al componente le llegaba `{consumed:42,target:290}`. Causa real = `miniTarget` con `lineHeight: 10` IGUAL al fontSize: con la fuente custom Android arma una caja de UNA linea y el wrap pierde la segunda ("/ 290" queda en "/"). Fix `lineHeight: 13` + `numberOfLines={1}` (**a6aac228**).
      - [x] (b) chip "No lo comi" truncado a "No lo" — MISMO patron de wrap + caja de una linea. Fix `shrink-0` en el chip + `numberOfLines={1}` en el texto; cubre tambien los chips de correccion (mismo componente) (**a6aac228**).
      - [ ] (c) paleta de macros. El hallazgo estaba MAL anotado: web y RN de V2 comparten la MISMA paleta (`@eva/nutrition-v2/design.ts` → P ember / C sport / G aqua) y `MACRO_COLORS` RN son esos mismos hex; los `--color-macro-*` de `globals.css` (#5E9FD6 / #FFB74D / #81C784) son de nutricion **V1** (`MealCard`, `MealIngredientRow`, card V1 del dashboard). Tocar solo RN habria ROTO la paridad. **DECISION OWNER 2026-08-07: opcion 2** — llevar web + RN de V2 al trio fijo #5E9FD6 / #FFB74D / #81C784 (mata el teñido white-label de los carbos), **agendado al re-skin de cierre de O2** para que cara nueva y paleta entren en el mismo OTA con una sola re-QA.
      - [ ] (d) 3 errores `react-hooks/refs` preexistentes en Sheet.tsx (patron onCloseRef/PanResponder de 9fbe9bcd) — deuda lint.
    - Ajuste de UI pedido por el owner en la misma sesion (**a6aac228**): fila de CTAs en UNA sola linea con el primario al centro (Escanear · Registrar · Compartir); los neutros a ancho natural y solo el primario `fill`, para que ninguno trunque.
    - Gotcha operativo ronda 2: Metro crashea al primer arranque en Node 24 (watcher timeout → getSha1, gotcha conocido) — segundo intento paso; el fix llego al device por Fast Refresh con el sheet abierto.
  - [ ] Checklist de preservacion completa (SPEC) — pasada parcial implicita en QA web Playwright + QA device (flujos core alumno + plantillas/builder coach); formal COMPLETA pendiente → propuesta: correrla al cierre de O2 junto a la regresion

## Ola 2

- [x] T2.1 Overrides datos — CERRADA 2026-08-07 (detalle y evidencia en [`nutrition-food-overrides/TASKS.md`](../nutrition-food-overrides/TASKS.md))
  - [x] SPEC/PLAN/TASKS sub-feature + OK del owner
  - [x] F1 contrato puro + `computeItemMacros` respeta `macrosBasis` (golden tests web y RN) — `c0062c83`
  - [x] F2 migracion `coach_food_overrides` en LIVE, tx-rollback con JWT reales antes, advisors sin hallazgos despues — `7af82c28`
  - [x] F3 merge en `food_catalog_v2_item_json` (drop+create) + las 3 RPC pasan el coach 1 vez. **Eran 3, no 4: `get_food_by_id_v2` no existe** — `6edecffd`
  - [x] F5 repository → service → actions, sin service-role — `0502ef07`
  - [x] F4 merge en freeze y rehidratacion (4 superficies, un helper) + N+1 muerto + **auditoria de `foods.macros_basis`**: 50 filas mal etiquetadas volvieron a `per_100`, 10 son `per_serving` de verdad — `660e1ef4`
  - [ ] Regen COMPLETO de `database.types.ts` (deja 13 errores en 7 archivos V1) + retirar el cast `V2ReadClient` de T1.1 — tanda propia. **Este es el registro ÚNICO de esta deuda** (nota 2026-08-17: se retiró el duplicado en [`nutrition-food-overrides/TASKS.md`](../nutrition-food-overrides/TASKS.md), que apunta aquí)
  - [ ] QA manual en preview (requiere push de la rama)
- [x] T2.2 Overrides UI — hecha 2026-08-07 en **web y RN**: sheet de edicion (5 macros + medida casera + aviso suave de Atwater), badge ✎ con el catalogo tachado, restaurar original, aviso de republicar. La base declarada NO se pregunta: se hereda del alimento y se enuncia. Pendiente: filtro "Editados por mi" (va con el hub de alimentos, T2.3) y la lista de alumnos afectados en el aviso
- [x] T2.3 Hub Alimentos casa unica — CERRADA 2026-08-09 (detalle y evidencia en [`nutrition-food-hub/TASKS.md`](../nutrition-food-hub/TASKS.md); revision de Fable previa al codigo, aprobada con correcciones)
  - [x] Crear alimento (`940e3875`) + clasificar porciones + grupos en formulario UNICO (`34f8e0ec`, `ClassifyFoodFlow` + `planFoodClassification` con 29 tests) dentro del tab
  - [x] Rescate del filtro "Editados por mi" huerfano de T2.2 — `8290287b` (data path propio por offset + badge ✎)
  - [x] `/coach/foods` retirada — `1eaea68c`: redirect 307 al tab + carpeta borrada salvo `page.tsx` y `FoodSearch.tsx` (2 importadores V1). Paridad minima previa en `b91458d7` (browse sin buscar + "Solo míos", decision owner). QA en preview con evidencia: redirect, 3 modos, alta con guard kcal/P/C/G, clasificacion end-to-end verificada en DB, 390px
  - [x] ~~Retirar `/coach/meal-groups` y `/coach/recipes`~~ → **RE-ALCANCE 2026-08-09**: esas rutas ya NO existen como paginas; lo que queda (`meal-groups/_actions`, `_data`, recetas) lo consume SOLO V1, y V1 no se borra. Verificado y documentado en F4 (`462869b1`): importadores reales = 2 archivos de PlanBuilder
- [x] T2.4 Sustituciones FULL — **CERRADA 2026-08-10, en produccion** (detalle y actas en [`nutrition-substitution-intake/`](../nutrition-substitution-intake/TASKS.md)). Web en master `dbb0c383` + OTA android `52a37d18`; 2 migraciones en LIVE (`20260809222811` lectura, `20260809230833` guard). QA web y device verdes, cada caso verificado en DB. Reparo abierto: sin señal visible al encolar offline ⇒ va con T2.5
  - [x] Auditoria contra HEAD y LIVE + decisiones del owner D1-D4 + SPEC/PLAN/TASKS + revision adversarial con las 5 correcciones aplicadas (2026-08-09)
  - **Re-alcance con evidencia:** `substitution_group_id` tiene 0 filas en LIVE ⇒ el "membership de grupo" del enunciado no existe como dato; el camino por grupos de intercambio se movio a T2.5, que es donde vive su UI
  - **El estado "sustituido" no toca `get_nutrition_today_v2`**: el read model ya emite `source` desde `intake_source_v2` y `'substitution'` ya es valor valido; la adherencia sale sola por `prescription_item_id`
  - [ ] F0 contrato puro · F1 RPC de opciones · F2 guard SQL + fix del tope de cantidad en `correct_` · F3 boundary web+movil · F4 UI web · F5 paridad RN · F6 QA
- [x] T2.5 Swipe ⇄ + sheet 2 bloques (autorizados / grupo) — **CERRADA 2026-08-10, en produccion** (detalle y actas en [`nutrition-exchange-swap/`](../nutrition-exchange-swap/TASKS.md)). Web en master `654efd33` + **OTA android `7a9b3877`** (runtime 1.1.0, solo android); 2 migraciones en LIVE (`20260810161604`, `20260810171529`); cierra el reparo offline de T2.4 (chip "En cola" verificado con modo avion en device fisico). Extra: fix de UI optimista del Hoy web (`5139b29e`)
  - [x] **F8 — decisiones abiertas del QA cerradas (2026-08-11)**: H1 arreglado por el lado del catalogo (migracion `20260811020826` en LIVE: `foods.name_search` pasa a la MISMA normalizacion que el query; asimetria 0/4.649; 4 `ilike` de la web alineados a `normalizeFoodSearchText`) y D5 implementada (micro-animacion one-shot del swipe, decision pura en `packages/nutrition-v2/swipe-hint.ts`, web + RN). Falta despliegue (web + OTA android)
### Hallazgo del coach JP (2026-08-11) — investigado a fondo: **NO es bug de carga de plantillas**

Reporte: "me asigne un plan estructurado pero no se me ve la dieta" + "al guardar la plantilla no me
devuelve a ningun lado" + "solo se me ven 2 alimentos de todos los que me hice".

Reconstruccion desde LIVE (cuenta de alumno propia `da857bc2`, hora Chile del 10-08): **22:52**
publica la v4 desde `web-builder` con `strategy = flexible`, **0 items y 0 franjas**, targets
1806/185/165/41; **23:01**, nueve minutos DESPUES, guarda la plantilla "Dieta Jp" (structured, 4
franjas, 12 items, los MISMOS targets). O sea: lo estructurado que el ve es la **plantilla**, y lo
que le llego a su alumno es un plan **flexible vacio**. Las plantillas no llegan a ningun alumno;
hace falta publicar una version. Los 2 alimentos que ve son sus registros libres.

Verificado que el camino plantilla→builder **funciona**, incluida la clase exacta de sus plantillas
(las 15 suyas son `source = import_v1` sin payload de builder, 0 borradas):
- Repro determinista con el JSON real de LIVE sobre `builderStateFromTemplateDraft`, en el peor caso
  (ningun alimento resuelto): conserva `structured`, 2 franjas y los 6 items.
- End-to-end en el preview con la cuenta de josefit y la plantilla viva "Stuff" (`import_v1`, sin
  builder): "Partiendo de «Stuff»", **Plan estructurado**, metas 370/49/28/6 exactas, y el paso 2
  trae los alimentos resueltos con sus macros y subtotales.
- El diálogo "Cambiar a flexible elimina las N franjas de tus días" **existe y funciona**, asi que
  llegar a flexible con contenido exige aceptarlo.

**Falso positivo propio, anotado para que nadie lo repita:** el primer intento uso "Comida Fit", que
esta **soft-deleted**; el builder cayo al plan vigente del alumno y parecia el bug. Que una plantilla
borrada no cargue es correcto — lo que NO es correcto es que caiga en silencio al plan del alumno sin
decir una palabra.

Tres arreglos reales que salen de esto — **HECHOS y EN PRODUCCION 2026-08-11** (`31fa0631`),
verificados en preview con la sesion de josefit:
- [x] El builder de plantillas avisa en pantalla que eso NO le llega a ningun alumno hasta
      aplicarla, con enlace directo a la biblioteca (donde vive "Aplicar") — verificado
- [x] Guardar plantilla vuelve a la biblioteca, igual que publicar un plan navega. Verificado
      end-to-end: toast "Plantilla actualizada", URL en `?tab=plantillas`, fila "Stuff · 2 franjas ·
      usada 1x" con su boton Aplicar, y en DB `updated_at` nuevo + payload de builder escrito
- [x] Un origen `?from=…` ilegible ya no degrada MUDO: avisa en ambar. Se corrigio ademas el bug
      que lo hacia peor — el borrador de la plantilla se escribia DIRECTO sobre `initialDraft`, asi
      que un fallo dejaba cargado el plan VIGENTE del alumno rotulado con el nombre de la plantilla.
      Verificado con la plantilla soft-deleted: sale el aviso y ya no dice "Partiendo de…"

- [x] T2.6 Velocidad autoria: porcion pegajosa (ultima cantidad por coach+food y por alumno+food) + copy semana (quick-select prox 1/2/4 + toggle reemplazar) + gramatica destructiva unificada (undo en todo, muere el confirm del wizard-delete-slot) + campo notas visibles en wizard — CERRADA (registro en [`nutrition-authoring-speed/TASKS.md`](../nutrition-authoring-speed/TASKS.md), cierre 2026-08-17 segun CURRENT)
- [x] T2.7 Re-skin del alumno (catalogo de pantallas, decision owner 06-08: va AL CIERRE de O2, antes del OTA unico) + **paleta de macros al trio fijo** (decision owner 07-08, opcion 2): `@eva/nutrition-v2/design.ts` pasa a P #5E9FD6 / C #FFB74D / G #81C784 en web Y RN, los carbos dejan de seguir la rampa sport white-label (`resolveNutritionMacroColors` deja de recibir brandColor), y las superficies V1 quedan alineadas con los mismos `--color-macro-*`. Toca anillos, chips y barras ya QA-eadas en O1 ⇒ exige re-QA visual completa en el mismo corte. — CERRADA (registro en [`nutrition-student-reskin/TASKS.md`](../nutrition-student-reskin/TASKS.md), cierre 2026-08-17 segun CURRENT)
- [ ] Cierre O2: overrides W2 (ficha detalle web, RN builder/quick-edit) + regresion + push + **OTA android O1+O2** (runbook SPEC; proponer al owner)

## Ola 3

- [x] T3.1 SPEC editor unico (2026-08-15, Fable): [SPEC/PLAN/TASKS en `nutrition-unified-editor/`](../nutrition-unified-editor/SPEC.md). Auditoria contra HEAD: 4 reducers / 2 gramaticas (wizard web 32 acciones, wizard RN 29, quick-edit web 31, quick-edit RN subconjunto), publish ya convergido en `persistAndPublishDraft` → RPC. Decisiones owner: D1 un solo editor para crear+editar (wizard muere en el retiro, puerta `?from=` vive), D2 plantillas en tanda propia T3.2b post-corte (el retiro espera a plantillas). Plan: W1-W4 (UI sobre reducer quick-edit web extendido) → T3.2b plantillas → R1 extraccion a `packages/nutrition-v2` con golden tests → T3.3 RN
- [x] T3.2 Editor unico web desktop + responsive/PWA (Fable) — CERRADA (registro en [`nutrition-unified-editor/TASKS.md`](../nutrition-unified-editor/TASKS.md), cierre segun CURRENT)
- [x] T3.3 Editor RN Android — CERRADA (registro en [`nutrition-unified-editor/TASKS.md`](../nutrition-unified-editor/TASKS.md), cierre segun CURRENT)
- [ ] T3.4 Plantillas auto-escaladas (SPEC + solver puro + golden tests + preview + pineados + piso kcal)
- [ ] T3.5 Registro inteligente texto (SPEC + parser server + revision siempre + memoria por alumno)
- [ ] T3.6 Presupuesto semanal + libres presupuestadas + franja flexible A/B/C (SPECs)
- [ ] T3.7 Offline web
- [ ] Retiro del par wizard/quick-edit tras 2 semanas estable (verificar importadores)
- [ ] Cierre O3: regresion completa + push + OTA android + propuesta merge a master

## Registro de cierres

| Fecha | Tanda | Commit | Gates | Notas |
|-------|-------|--------|-------|-------|
| 2026-08-06 | F0.1-F0.3, F0.5 | (este commit) | docs:check pendiente en gates de primera tanda | Fase 0 abierta y cerrada salvo F0.4→T1.0 |
| 2026-08-10 | T2.4 completa (F0-F6 + QA web y device) | f1da66fa..dbb0c383 | suite 5568 ✓ · typecheck web y mobile ✓ · boundaries 327 ✓ · tokens 86/86 ✓ · docs ✓ · QA web con evidencia en DB ✓ · QA device via OTA ✓ | En produccion: web `dbb0c383` (merge fast-forward) + OTA android `52a37d18`. 2 migraciones en LIVE. El QA cazo 3 bugs, el mas grave: `get_nutrition_today_v2` no devuelve las entries retiradas, asi que deshacer y volver a registrar reusaba la clave y dejaba el item inconsumible el resto del dia. Reparo abierto: sin señal al encolar offline (va con T2.5). |
| 2026-08-09 | T2.3 completa (F1-F5 + F4.5) | 8290287b..1eaea68c | boundaries 324/8 ✓ · tsc web ✓ · vitest web full 2857 ✓ · suite completa 5488 ✓ · docs:check ✓ · QA preview navegador ✓ (redirect, 3 modos, alta, clasificacion verificada en DB, 390px) | Hub = unica casa del catalogo. /coach/foods → redirect 307; FoodSearch.tsx sobrevive (V1). Deudas anotadas: paridad RN del tab, 3 revalidatePath muertos en V1, FoodListCompact con 1 solo consumidor V1. QA owner en device: pendiente. |
| 2026-08-07 | Cierre O1 (T1.0-T1.6 + QA) | 139fe69b | suite full 5358 ✓ · typecheck web ✓ · tsc mobile ✓ · eslint ✓ (3 refs preexistentes anotados) · tokens 86/86 ✓ · QA Playwright preview ✓ · QA device fisico ✓ · curl cron ✓ | O1 CERRADA. Fix extra 139fe69b (teclado sheets Android). Pendientes reales: decision merge web→master, checklist preservacion formal (→O2), triage hallazgos menores a/b/c/d, OTA android = cierre O2 |
