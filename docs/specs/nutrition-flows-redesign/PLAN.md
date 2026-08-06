# PLAN — Rediseño de flujos de Nutricion V2

Fases con dependencias, dueños y salidas. Detalle vivo en `TASKS.md`. Version canonica visual: [plan de ejecucion](https://claude.ai/code/artifact/31345761-2036-493d-9be6-1e1ff01f60b6).

## Fase 0 — Preparacion (hecha al abrir el programa)

| # | Tarea | Estado |
|---|-------|--------|
| F0.1 | Apartar ruido del working tree (`app.json` raiz basura → borrado; skills-lock/.github fuera de commits del programa) | hecho 2026-08-06 |
| F0.2 | `rnmobiledenuevo` ff a master (b2a0e341) + checkout | hecho 2026-08-06 |
| F0.3 | SPEC/PLAN/TASKS de este programa | hecho 2026-08-06 |
| F0.4 | Baseline PostHog (taps/dia, tiempo-crear-plan, % plantilla, % correcciones) | pendiente — requiere instrumentar eventos minimos; se hace al abrir O1 (T1.0) |
| F0.5 | Runbook release Android | hecho (en SPEC.md) |

## Ola 1 — Quick wins (1-2 semanas, 0 DDL, 0 RPC nuevos)

Solo codigo. Web + RN Android por tanda. Commit por tanda; push al cierre de ola (D1); OTA se junta con O2 (D2).

| Tanda | Contenido | Dueño |
|-------|-----------|-------|
| T1.0 | Instrumentacion PostHog minima + captura baseline (cierra F0.4) | Fable |
| T1.1 | Notificaciones V2: cron `nutrition-reminder` a tablas V2, banner push en V2, deep-links V2 (web + RN). Mismo cron, cero IO extra | Opus por informe |
| T1.2 | Correccion sin interrogatorio: sheet stepper + chips razon opcional; RPCs intactos | Fable |
| T1.3 | Paridad de decisiones tomadas: live search web, nota coach RN expandida, poda 4 regresiones RN, semana actual fuera del historial web | Sonnet (barrido) + Fable (live search) |
| T1.4 | Banda ±10% en barra de energia + dashboard web una sola llamada al RPC de hoy | Fable |
| T1.5 | Plantillas boton "Aplicar" (5 pasos → 2; sin auto-escala) | Fable |
| T1.6 | Sustituciones puente: tap en pill autorizada prefillea registro libre (si hay permiso). Reemplazada por T2.4 | Fable |

Cierre O1: checklist de preservacion + QA emulador + device Android + push con OK del owner.

## Ola 2 — Overrides, hub de alimentos, gesto (2-4 semanas, 1 migracion aditiva, 1 RPC extendido)

| Tanda | Contenido | Dueño |
|-------|-----------|-------|
| T2.1 | Overrides datos: SPEC propia (`docs/specs/nutrition-food-overrides/`) + migracion `coach_food_overrides` + merge en `food_catalog_v2_item_json` + freeze publicacion + rehidratacion + fix N+1 del publish loop. Gotchas: macros_basis viaja; firma RPC = drop+create misma tx; coach resuelto 1 vez en el RPC llamador; grants por columna; sin archive_gate | Opus por informe, juicio Fable |
| T2.2 | Overrides UI: sheet "Editar informacion", badge ✎ + original tachado, filtro "Editados por mi", aviso republicar, restaurar | Fable |
| T2.3 | Hub Alimentos casa unica: crear + porciones + curacion en el tab; retirar `/coach/foods`, `/coach/meal-groups`, `/coach/recipes` (orden owner 08-05; DB intacta; redirects; verificacion 0 importadores por superficie). Un solo formulario de grupo | Fable + Sonnet retiros |
| T2.4 | Sustituciones FULL: SPEC propia (`docs/specs/nutrition-substitution-intake/`) + camino de escritura server-validado (registrar sustituto autorizado sin canRegisterFreely; estado "sustituido" en read models y adherencia). Review adversarial multi-agente pre-aplicacion | Opus por informe, juicio Fable |
| T2.5 | Swipe ⇄ + sheet intercambio alumno (PWA + RN Android) sobre T2.4. Sin deps nativas nuevas | Fable |
| T2.6 | Porcion pegajosa + copy semana con quick-select y toggle reemplazar/anexar + gramatica destructiva unificada + notas visibles en wizard (puente a O3) | Fable |

Cierre O2: overrides W2 (lectores secundarios: ficha web, builder/quick-edit RN) + regresion completa + push + **OTA android unico O1+O2** con OK del owner.

## Ola 3 — Obra gruesa (4-8 semanas, SPEC por pieza)

T3.1 puede arrancar durante O2.

| Tanda | Contenido | Notas |
|-------|-----------|-------|
| T3.1 | SPEC editor unico (`docs/specs/nutrition-unified-editor/`): convergencia wizard+quick-edit; UI converge primero, reducers testeados se unifican al final | Sin kill-switch (D3): corte directo, rollback = revert; el par viejo NO se borra hasta 2 semanas estable en prod |
| T3.2 | Editor unico web: desktop (paleta lateral, drag reorden, cabecera con metas/permisos/vigente/notas, copiar dia/semana) + responsive/PWA (paleta sheet, totales+publicar fijos abajo, una solucion de capsula) | Fable, pieza mayor. Publish CAS/idempotencia/drafts intactos |
| T3.3 | Editor RN Android: misma gramatica sobre reducers compartidos | Android-first; iOS via OTA post-Apple |
| T3.4 | Plantillas auto-escaladas: solver puro en `packages/nutrition-v2` (estructura + % kcal → gramos, pineados, redondeo real, porciones) con golden tests ANTES de UI; preview por alumno; sin metas = bloquea; piso duro kcal | SPEC `nutrition-template-scaling/` |
| T3.5 | Registro inteligente por texto: parser server (LLM) + revision siempre + matching con overrides + memoria correcciones por alumno + no-match → curacion. Cache y fallback | SPEC `nutrition-smart-text-log/` |
| T3.6 | Presupuesto semanal ligado a entrenamiento + comidas libres presupuestadas + franja flexible A/B/C | SPEC por pieza |
| T3.7 | Offline web (SW cache + cola, espejo RN; no interceptar cross-origin) | Ultima pieza |

## Riesgos y mitigaciones

1. **OTA generico pisa iOS en review** → runbook obligatorio (SPEC), OTA siempre propuesto antes.
2. **Convergencia rompe publish/idempotencia/drafts** → reducers no se reescriben, UI primero, par viejo vivo 2 semanas, regresion como gate. Sin kill-switch por D3: ventana de doble-editor minimizada, corte en un solo deploy, revert ensayado.
3. **RPC sustituciones = superficie de permisos** → guard en RPC, review adversarial, matriz JWTs reales.
4. **Auto-escala absurda/peligrosa** → solver puro + golden tests + piso kcal + preview.
5. **Scope creep** → overrides v1 = macros + medida casera; retiros con verificacion de importadores.
6. **Supabase Micro** → cero crons nuevos, override = 1 probe por fila, parser con cache fuera del hot path.

## Cadencia y evidencia

Por tanda: implementar → gates (SPEC §7) → juicio Fable → commit en `rnmobiledenuevo` → actualizar TASKS.md con estado real. Por ola: checklist preservacion + QA Android + push (OK owner). Sentry post-tanda como gate blando. Playwright/SQL contra prod solo con OK explicito.
