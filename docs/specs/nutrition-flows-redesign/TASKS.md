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
- [ ] T1.3 Paridad decisiones tomadas
  - [ ] Live search web (debounce 300ms, AbortController; muere boton "Buscar")
  - [ ] Nota coach RN: expandida por defecto (paridad web)
  - [ ] Poda RN: chips permisos falsos, fila fibra, parrafo estrategia, empty-state eco
  - [ ] Web: semana actual fuera del historial (paridad RN) + caption
- [ ] T1.4 Banda ±10% web+RN (zona semantica fija, fill theme.primary, copy "faltan ~X"; nunca rojo) + dashboard web 1 sola llamada RPC hoy (patron cache/props, NO segunda llamada)
- [ ] T1.5 Plantillas "Aplicar": boton en fila → selector alumno (reusa picker de NewPlanPickerButton) → builder `?from=template:` precargado
- [ ] T1.6 Sustituciones puente: tap pill → prefill registro libre con alimento+cantidad sugerida (solo si canRegisterFreely; explainer si no)
- [ ] Cierre O1: checklist preservacion + QA emulador eva_pixel + device fisico + Sentry limpio → proponer push (D1)

## Ola 2

- [ ] T2.1 Overrides datos (SPEC `nutrition-food-overrides/` primero)
  - [ ] SPEC/PLAN/TASKS sub-feature
  - [ ] Migracion `coach_food_overrides` (unique coach+food, macros_basis, grants por columna, RLS clon egf_*, indice food_id) — tx-rollback + EXPLAIN en LIVE antes, advisors despues
  - [ ] Merge choke point `food_catalog_v2_item_json` (+ `search_food_catalog_v2`, `lookup_food_by_gtin_v2`, `get_coach_food_suggestions_v2` pasan coach 1 vez) — drop+create misma tx
  - [ ] Merge freeze publicacion (`plan-persistence.ts`) + rehidratacion (`plan-foods.data.ts`) + fix N+1 (`.in()` batch)
  - [ ] Regen database.types + boundaries + service/repository capa limpia
- [ ] T2.2 Overrides UI: sheet editar (kcal/P/C/G + medida casera + validacion suave), badge ✎ + original tachado, filtro "Editados por mi", aviso republicar con lista alumnos, restaurar original
- [ ] T2.3 Hub Alimentos casa unica
  - [ ] Crear alimento + clasificar porciones + grupos dentro del tab (formulario UNICO de grupo)
  - [ ] Retirar `/coach/foods` (redirect al tab) — verificar 0 importadores
  - [ ] Retirar `/coach/meal-groups` y `/coach/recipes` (orden owner; DB intacta) — verificar 0 importadores
- [ ] T2.4 Sustituciones FULL (SPEC `nutrition-substitution-intake/` primero): RPC/action server-validado contra substitutions del item o membership de grupo; sin requerir canRegisterFreely; estado "sustituido" en read models + adherencia; idempotencia por intencion; review adversarial pre-aplicacion
- [ ] T2.5 Swipe ⇄ + sheet 2 bloques (autorizados / grupo) + candado items fijos; undo 6s; PWA + RN Android; cero deps nativas
- [ ] T2.6 Velocidad autoria: porcion pegajosa (ultima cantidad por coach+food y por alumno+food) + copy semana (quick-select prox 1/2/4 + toggle reemplazar) + gramatica destructiva unificada (undo en todo, muere el confirm del wizard-delete-slot) + campo notas visibles en wizard
- [ ] Cierre O2: overrides W2 (ficha detalle web, RN builder/quick-edit) + regresion + push + **OTA android O1+O2** (runbook SPEC; proponer al owner)

## Ola 3

- [ ] T3.1 SPEC editor unico (puede arrancar durante O2)
- [ ] T3.2 Editor unico web desktop + responsive/PWA (Fable)
- [ ] T3.3 Editor RN Android
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
