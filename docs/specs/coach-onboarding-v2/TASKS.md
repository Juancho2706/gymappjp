---
status: active
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# TASKS — Onboarding del coach v2 (megaplan)

Borrador 2026-08-21. Modelo sugerido entre paréntesis. Nada de W1+ ejecutado; lo marcado [x] salió el 21-08 en `5c160158`.

## Ya hecho (21-08, fuera de wave)
- [x] Checklist web y RN: el Free ya no va a suscripción; modal Free RN dice «Marca personalizada ✓».
- [x] Sello «Hecho con EVA»: sin flash a alumnos Pro (login/perfil RN).
- [x] Sentry antes del grafo (`lib/sentry-boot.ts`), tags `ota.*`, uid; PostHog lifecycle con versión real.
- [x] Cuentas QA: `qa-free-v3@evatest.cl` + alumna.

## W0 — Decisiones y contenido (owner)
- [x] F0.1 D1–D8 confirmadas como default (owner, 21-08).
- [x] F0.2 Revisores: fuerza/running = socio (JP); pautas y rehab = esqueleto provisional por agentes, revisor pendiente.
- [x] F0.3 Solapes acordados con BROCITO el 21-08 (ver PLAN §Coordinación).
- [x] F0.4 `status: active` en SPEC/PLAN/TASKS (21-08).

## W1 — Contratos y datos (Opus ×2)
- [ ] F1.1 Migración aditiva: `coaches.persona text null CHECK (persona in ('strength','nutrition','rehab','endurance','other'))`, `persona_also_other boolean not null default false`, `persona_set_at timestamptz`; grants al coach; tipos regenerados. Protocolo tx-rollback + advisors.
- [ ] F1.2 `clients.is_demo boolean not null default false` + índice parcial `where is_demo`; grant.
- [ ] F1.3 Exclusión de `is_demo` en TODOS los conteos de cupo y KPIs: `coach/_lib/effective-limit.ts`, `clients.actions.ts`, `import.actions.ts`, `api/mobile/coach/clients/route.ts`, `api/mobile/coach/clients/import/route.ts`, reactivate web+RN, `OverLimitBanner`, `activate-free.service`, RPCs de cupo y finanzas (`*_exclude_test_coaches*`), KPIs del dashboard (web+RN), correos al alumno, `api/cron/cap-nudge/route.ts` (`countActiveClients` + `route.test.ts`, acordado con BROCITO). Un test por consumidor. **OK de BROCITO recibido para los 4 call sites de clients/import (ya en master).**
- [ ] F1.4 `coach_onboarding_events`: CHECK ampliado (`guide_engagement`, `persona_selected`, `demo_seeded`, `demo_deleted`, `vive_tu_app_opened`, `invite_link_copied`, `invite_whatsapp_opened`, `onboarding_dismissed`, `first_module_opened`); UNIQUE `(coach_id, event_type, step_key)` para `step_completed`; fin del re-emit (`CoachOnboardingChecklist.tsx:240-253`).
- [ ] F1.5 `@eva/feature-prefs`: `FEATURE_DOMAINS` = nutrition · training · cardio · movement · bodycomp; `resolvePersonaPrefs(persona, alsoOther)`; tests.
- [ ] F1.6 `@eva/coach-nav`: `featureDomain` en Programas/Builder/Ejercicios (`training`), Cardio, Movimiento, Composición; tests; RN consume el mismo registro.
- [ ] F1.7 `@eva/schemas`: `PersonaSchema`; `personaCopy` (tiles, bajadas, sustantivo «alumno/paciente/atleta», mensaje de WhatsApp por persona, nombre del demo).
- [ ] F1.8 Nuevo `@eva/onboarding` (puro, testeado): `ONBOARDING_STEPS[persona]` (5 verbos + href web + ruta RN), `autoCompleteSignals`, `TEMPLATE_CATALOG[persona]`, `DEMO_PROFILE[persona]`.

## W2 — Web: primer login y dashboard día 1 (Opus ×2)
- [ ] F2.1 Ruta `/coach/onboarding/persona` (5 tiles + pregunta 2 inline; sin «saltar» arriba; tile 5 = escape); action `setCoachPersonaAction` (persona + prefs + evento `persona_selected`); gate en el layout del coach: `persona IS NULL && !orgManaged && (created_at ≥ launch || clientes = 0)` ⇒ redirect una vez; exención en `proxy.ts`.
- [ ] F2.2 Interstitial «Armando tu panel» (2-4 s: dispara `seedDemoStudent` + prefs; skeleton del dashboard; sin spinner genérico).
- [ ] F2.3 Guía v2 (`CoachOnboardingChecklist` reescrito): pasos desde `@eva/onboarding`, progreso, primero pre-tildado, posición ARRIBA (`DashboardShell.tsx:232` → cabecera) hasta 5/5 u «Ocultar»; tira al pie después; `autoCompleted` con señales nuevas (plan V2, `movement_assessments`, perfil cardio, `workout_logs`/`nutrition_intake_entries` del alumno real).
- [ ] F2.4 Tarjeta «Tu marca en 60 s» inline (nombre, presets de color, logo, vista previa del login con sello); misma action que Mi Marca; default de color `#1462DC` en los 6 caminos de alta.
- [ ] F2.5 «Vive tu app»: action que genera magic link del alumno demo (`auth.admin.generateLink`) y abre `/c/[slug]/login`; evento.
- [ ] F2.6 Nav por dominio: `getVisibleNavItems` con prefs de persona; `Opciones › Mi panel` (cambiar persona, ver/activar dominios, re-sembrar o borrar demo).
- [ ] F2.7 Copys unificados: `FreeWelcomeModal` (solo texto, «Recordármelo después»), HelpCenter «Primeros pasos», correo D+0 leen `personaCopy`; borrar `OnboardingThreeSlot`, `ThreeRibbonInner`, `StepsVignetteCarousel`, `StepsJumpNav`, `CompactLoopStrip` (+ deps huérfanas).
- [ ] F2.8 `nextBestAction.rules.ts` por persona; `/coach/programs` (404) → `/coach/workout-programs`; claves de localStorage por coach.
- [ ] F2.9 Tests: actions; resolver de pasos; Playwright smoke del primer login × 5 personas; dashboard día 1 vs normal.

## W3 — Demos, plantillas y estados vacíos (Opus ×2 + revisores D4)
- [ ] F3.1 `seedDemoStudent(coachId, persona)`: alumno `is_demo`, intake, contenido por persona (programa / pauta **V2** / screening 7 patrones + pauta domiciliaria en 3 áreas custom / perfil cardio + semana), inventario de ids en `onboarding_guide.demo`; `deleteDemoStudent`; idempotente; tests en tx-rollback.
- [ ] F3.2 Contenido (esqueleto agentes → revisión D4): Matías (fuerza), Ana (nutrición), Pedro (rehab), Javiera (running).
- [ ] F3.3 Plantillas clonables por persona: Full body 3 d · Torso/Pierna · PPL; 1800 porciones · 2200 híbrida; Lumbalgia f1 · Post-op rodilla · Hombro; Base 10K · Media maratón · Retorno.
- [ ] F3.4 `scripts/seed-rehab-exercises.mjs` (catálogo del sistema: movilidad, control motor, propiocepción, core) — espejo de `seed-cardio-exercises.mjs`.
- [ ] F3.5 Áreas del builder presembradas por persona (rehab: Movilidad/Control motor/Fortalecimiento; running: Rodaje/Series/Fondo).
- [ ] F3.6 Empty states template-first (web) en builder, nutrición V2, movimiento, cardio: nombrar el valor + forma del éxito + una acción + demo.
- [ ] F3.7 Etiqueta «Alumno de ejemplo» en directorio/ficha/app del alumno + «Borrar ejemplo»; excluido de correos y KPIs.

## W4 — Tareas guiadas (Opus ×2)
- [ ] F4.1 «Sumar un alumno en 3 pasos» (web): stepper inline Datos → Invitación → Lo que ve (nombre + correo mínimos; WhatsApp con mensaje por persona; correo con acceso; QR/código → solicitud `/join`); vista previa del alumno con marca; evento por canal; reemplaza el modal actual en el primer alta.
- [ ] F4.2 «Primera rutina» (builder web): entrada template-first desde la guía (plantilla ya aplicada al demo), 3 tarjetas embebidas (cambiar ejercicio · reordenar · A/B después) con memoria por coach, vista del alumno en vivo, CTA «Asignar y ver como [demo]»; `BuilderOnboardingTour` se retira o se reduce a «?».
- [ ] F4.3 Equivalentes: pauta desde plantilla con vista del alumno (nutrición V2); screening de 7 patrones → pauta domiciliaria (movimiento); perfil cardio → zonas → semana base (cardio).
- [ ] F4.4 Tests: Playwright smoke de las 4 tareas; tsc; lint.

## W5 — RN paridad (Opus)
- [ ] F5.1 Pantalla de persona (`RoleCards`) + gate en `app/coach/_layout.tsx`; persona vía `api/mobile/coach/dashboard` (merge) o endpoint propio; «Armando tu panel».
- [ ] F5.2 Home día 1: guía v2 arriba (`home.tsx:186-191` → cabecera), persistida (`data.onboardingGuide`), `dismissed` cruzado con web; tarjeta marca compacta; demo con «Ver como…».
- [ ] F5.3 Nav móvil por dominio (mismo paquete); dashboard vacío deja de felicitar; copy interno («scope/pools») fuera.
- [ ] F5.4 Alta: stepper compacto + share sheet + `wa.me`; `QuickCreateClientForm` maneja `UPGRADE_REQUIRED` y emite `upgrade_gate_hit`.
- [ ] F5.5 Tarjetas embebidas del builder RN (molde `BuilderOnboardingTour` → tarjetas); vista del alumno.
- [ ] F5.6 `captureAppEvent` de los eventos nuevos; borrar `MobileOnboardingChecklist` y bloques (`:708-1143`) o reciclarlos.
- [ ] F5.7 QA visual en emulador por persona (light/dark, white-label, safe areas); confirmar OTA-able (sin assets/módulos nuevos). Coordinar con BROCITO W6 antes de tocar `CoachDashboardSections.tsx`.

## W6 — Correos por comportamiento (Opus; tras ledger de BROCITO)
- [ ] F6.1 Motor de triggers sobre el ledger del embudo: +2 h sin alumno real · +24 h sin volver · +48 h alumno invitado no entró · aha · +7 d (ayuda humana) · corte 90 d; dedupe; exclusión de cuentas de prueba; cron.
- [ ] F6.2 Plantillas por persona (`personaCopy`), con el link `/join` y el mensaje de WhatsApp para reenviar al alumno.
- [ ] F6.3 Tests de templates y servicio; envío real a `qa-free-v3@evatest.cl`.

## W7 — Medición, QA y salida (jefe + owner + Opus)
- [ ] F7.1 Insights PostHog: setup ≤24 h, aha ≤7 d, volvió >6 h, tocó marca, por cohorte semanal y por persona; dashboard «Activación coaches».
- [ ] F7.2 Docs: `CURRENT.md`, `PRODUCT_OVERVIEW`, `MOBILE_PARITY`, `MANUAL_TASKS` (contenido D4 pendiente si aplica); SPEC/PLAN/TASKS a `active`/cierre.
- [ ] F7.3 QA del owner: web desktop + PWA + app (Xiaomi/iPhone) × 5 personas con `qa-free-v3` (cambio de persona desde Mi panel); evidencia.
- [ ] F7.4 Backfill D8: coaches existentes con `persona IS NULL` — 0 alumnos ⇒ pantalla completa una vez; ≥1 ⇒ tarjeta «Elegí tu especialidad».
- [ ] F7.5 Gates completos; merge a master; Vercel; OTA a 3 runtimes por `mobile-ota.yml`; aviso opcional a los Free sin alumno.

## Deuda declarada (fuera de v1)
- [ ] Vocabulario global por persona (`personaNoun()` en nav y fichas, web+RN).
- [ ] PDF de la pauta V2 en web (objeción #1 de nutricionistas).
- [ ] Programación grupal (persona «preparador de equipo / box»); integraciones Strava/Garmin; ficha clínica.
- [ ] `register_submitted` en Google OAuth (BROCITO W7).
