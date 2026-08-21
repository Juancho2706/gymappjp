---
status: draft
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# TASKS — Onboarding del coach v2

Borrador 2026-08-21. Nada ejecutado. Modelo sugerido entre paréntesis.

## W0 — Decisiones (owner)
- [ ] F0.1 D1 set de personas (recomendado A: strength / nutrition / rehab / endurance + other, con pregunta 2 binaria).
- [ ] F0.2 D2 alumno de ejemplo (recomendado A: sembrado automático, `is_demo` fuera del cupo).
- [ ] F0.3 D3 vocabulario (recomendado A: solo onboarding y correos en v1).
- [ ] F0.4 D4 autores del contenido de demos/plantillas por persona (fuerza/cardio: socio; nutrición: nutricionista; rehab: kine).
- [ ] F0.5 D5 checklist arriba del dashboard hasta 5/5 (recomendado A).
- [ ] F0.6 D6 correos por comportamiento (recomendado A) + D7 `coaches.persona` como columna (recomendado A).
- [ ] F0.7 Diagnóstico: por qué `coach_email_drip_events` no escribe desde 2026-04-23 (cron, condición, tabla). (Opus)
- [ ] F0.8 Aprobar esta spec → `status: active`.

## W1 — Datos y contratos (Opus ×2)
- [ ] F1.1 Migración aditiva `coaches.persona text null CHECK in (strength,nutrition,rehab,endurance,other)`, `persona_also_other boolean default false`, `persona_set_at timestamptz`; **column-level grants** para el coach (regla CLAUDE.md); tipos regenerados.
- [ ] F1.2 `clients.is_demo boolean not null default false` + índice parcial; grant.
- [ ] F1.3 Exclusión de `is_demo` del cupo y de KPIs en TODOS los consumidores: `coach/_lib/effective-limit.ts`, `clients.actions.ts` (alta), `import.actions.ts`, `api/mobile/coach/clients/*`, `api/mobile/coach/clients/import`, reactivate (web+RN), `OverLimitBanner`, `activate-free.service`, RPCs de cupo y MRR/finanzas (`*_exclude_test_coaches*`), dashboard KPIs, correos al alumno. Tests por cada consumidor.
- [ ] F1.4 `coach_onboarding_events`: CHECK de `event_type` ampliado (`guide_engagement`, `persona_selected`, `demo_seeded`, `demo_deleted`, `vive_tu_app_opened`, `invite_link_copied`, `invite_whatsapp_opened`, `onboarding_dismissed`); `step_key` ampliado; **dedupe server-side** (unique `(coach_id, event_type, step_key)` para `step_completed`) y fin del re-emit del `useEffect` (`CoachOnboardingChecklist.tsx:240-253`).
- [ ] F1.5 `@eva/feature-prefs`: `FEATURE_DOMAINS = nutrition | training | cardio | movement | bodycomp`; presets por persona (`resolvePersonaPrefs(persona, alsoOther)`); tests.
- [ ] F1.6 `@eva/coach-nav`: `featureDomain` en Programas/Builder/Ejercicios (`training`), Cardio (`cardio`), Movimiento (`movement`), Composición (`bodycomp`); `getVisibleNavItems` ya filtra por dominio; tests; RN consume el mismo paquete.
- [ ] F1.7 `@eva/schemas`: `PersonaSchema`, `personaCopy` (tiles, bajadas, vocabulario por persona) como fuente única web+RN+correos.

## W2 — Web (Opus ×2)
- [ ] F2.1 Ruta `/coach/onboarding/persona` (pantalla completa, 5 tiles + pregunta 2 inline, `RoleCards`-like); server action `setCoachPersonaAction` (persona + prefs + evento); gate en el layout del coach: `persona IS NULL && !orgManaged` ⇒ redirect una sola vez; excepción en `proxy.ts` (ya exenta `/coach/onboarding/*`).
- [ ] F2.2 Opciones › «Mi panel»: cambiar persona y dominios visibles (reusa `/coach/settings/funciones`).
- [ ] F2.3 Checklist v2 (`CoachOnboardingChecklist` reescrito): pasos por persona desde `@eva/schemas`, progreso, primero pre-tildado, posición ARRIBA (`DashboardShell.tsx:232` → cabecera) hasta 5/5 o «Ocultar» persistido; `autoCompleted` con señales nuevas (plan V2, `movement_assessments`, perfil cardio, `workout_logs`/`nutrition_intake_entries` del alumno real).
- [ ] F2.4 Tarjeta inline «Tu marca en 60 s» (nombre, presets de color, logo, preview del login con sello); comparte acción con Mi Marca; default de color a `#1462DC` en los 6 caminos de alta (cierra el drift verde).
- [ ] F2.5 «Vive tu app»: action que genera magic link (`auth.admin.generateLink`) del alumno demo y abre `/c/[slug]/login` en pestaña nueva; evento `vive_tu_app_opened`.
- [ ] F2.6 Paso 4 «Invitá a tu primer [alumno]»: link `/join` + código copiado, botón WhatsApp `wa.me` con mensaje por persona; eventos.
- [ ] F2.7 Unificar copys: `FreeWelcomeModal` (solo texto, coherente v3, «Recordármelo después»), HelpCenter «Primeros pasos», correo D+0 → todos leen `personaCopy`; borrar `OnboardingThreeSlot`, `ThreeRibbonInner`, `StepsVignetteCarousel`, `StepsJumpNav`, `CompactLoopStrip` (y three.js/Lottie si quedan sin uso).
- [ ] F2.8 `nextBestAction.rules.ts` por persona; link `/coach/programs` (404) → `/coach/workout-programs`.
- [ ] F2.9 Claves de localStorage por coach (`FreeWelcomeModal:12`, `WeeklyPlanBuilder:252-253`).
- [ ] F2.10 Tests: actions, resolver de pasos, smoke Playwright del primer login por persona (4 + other).

## W3 — Demos y plantillas (Opus ×2 + contenido D4)
- [ ] F3.1 `seedDemoStudent(coachId, persona)` server action: crea alumno `is_demo`, intake, contenido por persona (programa / pauta **V2** / screening / perfil cardio + semana), inventario de ids en `coaches.onboarding_guide.demo` para `deleteDemoStudent`; idempotente; tests en tx-rollback.
- [ ] F3.2 Contenido por persona según D4 (esqueleto en SPEC §4); revisión del owner/socios.
- [ ] F3.3 Plantillas clonables por persona (programas, pautas V2, áreas custom presembradas para rehab/endurance).
- [ ] F3.4 `scripts/seed-rehab-exercises.mjs` (catálogo del sistema: movilidad, control motor, propiocepción, core) — espejo de `seed-cardio-exercises.mjs`.
- [ ] F3.5 Empty states template-first en builder, nutrición V2, movimiento, cardio (web + RN): nombrar el valor + forma del éxito + una acción + demo.
- [ ] F3.6 Etiqueta «Alumno de ejemplo» en directorio/ficha/app del alumno + «Borrar ejemplo» (web + RN); excluido de correos al alumno y de KPIs.

## W4 — RN (Opus)
- [ ] F4.1 Pantalla de persona (`components/entry/RoleCards.tsx`), gate en `app/coach/_layout.tsx` por `persona IS NULL`; `setCoachPersona` vía `api/mobile/coach/dashboard` (merge de `onboarding_guide`) o endpoint nuevo.
- [ ] F4.2 Checklist v2 arriba del home (`home.tsx:186-191` → cabecera), persistido (`data.onboardingGuide` → chip), `dismissed` cruzado con web.
- [ ] F4.3 Nav móvil por `featureDomain` (mismo paquete); modal Free corregido (`CoachDashboardSections.tsx:556,571,1320`); dashboard vacío deja de felicitar (`:2571`, `:2751`); copy interno «scope/pools» fuera (`nutrition-v2/index.tsx:727`).
- [ ] F4.4 Invitación: share sheet nativo + `wa.me`; `QuickCreateClientForm` maneja `UPGRADE_REQUIRED` y emite `upgrade_gate_hit`.
- [ ] F4.5 `captureAppEvent` de los eventos nuevos; borrar `MobileOnboardingChecklist` y bloques muertos (`:708-1143`) o reciclarlos como bloques por persona.
- [ ] F4.6 QA visual en emulador por persona (light/dark, safe areas, white-label); confirmar OTA-able.

## W5 — Correos (Opus)
- [ ] F5.1 Arreglar bienvenida/drip: `auth/confirm/route.ts:49` con `await` + causa del drip muerto (F0.7).
- [ ] F5.2 Motor de triggers por comportamiento (tabla SPEC §8) sobre `coach_email_drip_events` + cron; dedupe; corte a 90 d; exclusión de cuentas de prueba.
- [ ] F5.3 Plantillas por persona (`sales-templates`/`free-coach-onboarding`): +2 h sin alumno, +24 h sin volver, +48 h alumno no entró (con texto para WhatsApp), aha, +7 d con ayuda humana.
- [ ] F5.4 Tests de templates y servicio; envío de prueba a `qa-free-v3@evatest.cl` (cuenta QA 21-08).

## W6 — Medición, QA y salida (jefe + owner)
- [ ] F6.1 Insights PostHog: setup ≤24 h, aha ≤7 d, volvió >6 h, tocó marca — por cohorte semanal y por persona; dashboard «Activación coaches».
- [ ] F6.2 Docs canónicos: `CURRENT.md`, `PRODUCT_OVERVIEW`, `MOBILE_PARITY`, `MANUAL_TASKS` (contenido D4 pendiente si aplica).
- [ ] F6.3 QA del owner con `qa-free-v3@evatest.cl` (web + iOS + Android) por las 4 personas + other; evidencia.
- [ ] F6.4 Gates completos pre-push; merge a master; Vercel; OTA a 3 runtimes por `mobile-ota.yml`.
- [ ] F6.5 Backfill: coaches existentes con `persona = NULL` ven la pregunta una vez en su próximo login (sin demo automático para los que ya tienen alumnos).

## Deuda declarada (fuera de v1)
- [ ] Vocabulario global por persona (`personaNoun()` web+RN).
- [ ] PDF de la pauta V2 en web (prerrequisito de negocio de la rama nutrición).
- [ ] Programación grupal; integraciones Strava/Garmin; ficha clínica.
- [ ] `register_submitted {method: google}` se pierde en OAuth (29 % de altas sin evento PostHog).
