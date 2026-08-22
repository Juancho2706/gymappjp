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
- [x] F1.1 Migración aditiva `20260822002122_onboarding_v2_persona_demo.sql`: `coaches.persona` (CHECK) + `persona_also_other` + `persona_set_at`, `grant update` por columna a `authenticated`; `database.types.ts` a mano. Validada en tx-rollback contra LIVE (21-08 23:53Z) y **APLICADA en LIVE el 22-08 00:21Z** (versión `20260822002122`, archivo renombrado a esa versión).
- [x] F1.2 `clients.is_demo boolean not null default false` + índice parcial `clients_coach_demo_idx`; SIN grant de update + trigger `trg_clients_guard_is_demo` (solo `service_role` marca demo: cierra el hueco «insertar demos por PostgREST para esquivar el cupo» detectado en la revisión). Pendiente aparte: `get_admin_coaches_paginated` (panel admin) sigue contando demos.
- [x] F1.3 `is_demo = false` en 15 consumidores con test cada uno: `capacity.service.ts:36` (hub de cupo: banner, activate-free, get-coach, downgrade, subscription-status web+RN), `clients.actions.ts:120`, `import.actions.ts:95/201`, `api/mobile/coach/clients/route.ts:201`, `api/mobile/coach/clients/import/route.ts:264`, `join-capacity.ts:69/97`, `reactivate.queries.ts:45/57`, `client-archive.service.ts:265` (desarchivo), `coach.repository.ts:85` (KPI alumnos web+RN), `cap-nudge/route.ts:177`, `trial-expiry/route.ts:91/165`, `admin coach-actions.ts:438`, RPC `get_platform_clients_count` (migración). Decisión: la ACTIVIDAD del dashboard (check-ins, logs, adherencia) SÍ incluye al demo a propósito (trae contenido al día 1; etiquetado en W3 F3.7). `OverLimitBanner` y `effective-limit.ts` no necesitaron cambio (consumen la fila 1 / son puros).
- [x] F1.4 `coach_onboarding_events`: CHECK ampliado (12 tipos) + índice único parcial `coach_onboarding_events_step_completed_once (coach_id, step_key) where event_type='step_completed' and created_at >= 2026-08-22` (no toca las 2.293 filas históricas); route acepta pasos v2 + legacy y responde `{ ok, deduped }` ante 23505; 13 tests nuevos. El fin del re-emit del cliente queda para la reescritura del checklist (W2 F2.3).
- [x] F1.5 `@eva/feature-prefs`: `FEATURE_DOMAINS` = nutrition · training · cardio · movement · bodycomp (sección `core` por dominio nuevo), `resolvePersonaPrefs(persona, alsoOther)`, `disabledDomainsForPersona()`; matriz 5×2 testeada. Consumidores adaptados a `Partial<Record<…>>` sin cambio de comportamiento: web `settings/funciones/_data/funciones.queries.ts`, RN `lib/feature-prefs.queries.ts` (W2.6/W5.3 agregan los dominios nuevos a `DOMAIN_META`/`DOMAIN_LABELS`).
- [x] F1.6 `@eva/coach-nav`: `featureDomain` en `programs` (training), `cardio`, `movement`; composición entitlement × dominio testeada; no hay entrada de nav para bodycomp (vive en la ficha del alumno) — se gatea por dominio en W2/W5.
- [x] F1.7 `@eva/schemas/persona.ts`: `PERSONAS`, `PersonaSchema`, `PERSONA_COPY` (tiles, bajadas, noun, demo, segunda pregunta, WhatsApp), `personaNoun()`, `formatWhatsappInvite()`. Copy en latam neutro (tuteo; el voseo de la spec original se corrigió el 22-08).
- [x] F1.8 `@eva/onboarding`: `ONBOARDING_STEPS` (5 × 5), `DEMO_PROFILES`, `TEMPLATE_CATALOG`, `resolveAutoCompleted`, `nextStep`, `progress`, `resolveHref`, `resolveRnRoute`; alias en web/mobile tsconfig + vitest; dep `workspace:*` en web y mobile; lockfile +8 (`--frozen-lockfile` OK). Nota: la pauta apunta al editor único (`/coach/nutrition-v2/{id}/editor`; el builder redirige ahí).

## W2 — Web: primer login y dashboard día 1 (Opus ×2)
- [x] F2.1 Ruta `/coach/onboarding/persona` (`_components/PersonaPicker.tsx`: 5 tiles + pregunta 2 inline, radiogroup accesible, sin «saltar»); action `setCoachPersonaAction` (persona + 5 prefs por dominio + evento `persona_selected` + `seedDemoStudent` + PostHog). El gate vive en `proxy.ts` (no en el layout: un layout de Next no conoce el pathname y loopearía) con resolvers puros en `services/coach/persona.service.ts`: `persona IS NULL && !managed && ruta no exenta && (created_at ≥ 2026-08-22 || 0 alumnos reales)`; `/coach/onboarding/persona` sumada a `COACH_LOGIN_DEFAULT_PATHS` (safe-next). Pendiente: la pantalla renderiza como overlay `fixed inset-0` sobre el shell (Next no deja saltar el layout padre); alternativa = route group `(fullscreen)`.
- [x] F2.2 Interstitial «Armando tu panel» (`_components/BuildingPanel.tsx`: 3 líneas que se tildan + skeleton de los 3 bloques, mínimo 1,2 s, sin spinner, respeta `prefers-reduced-motion`).
- [x] F2.3 Guía v2 (`CoachOnboardingChecklist` reescrito + `OnboardingGuideFooterStrip`): pasos desde `@eva/onboarding`, progreso n/5, señales en `getCoachOnboardingV2Data` (marca, `vive_tu_app_opened`, artefacto por persona, alumno real, actividad real) en un solo `Promise.all`; ARRIBA del dashboard (primer bloque del contenido, antes del saludo) hasta 5/5 u «Ocultar», tira al pie después; estado único en `_lib/use-onboarding-guide.ts` (server gana, `emitted` evita re-emitir eventos). Confeti solo en el aha.
- [~] F2.4 Tarjeta «Tu marca en 60 s» (`_components/BrandQuickCard.tsx`: nombre, 5 presets de `@eva/brand-kit` + picker, logo vía `createLogoUploadUrlAction`/`updateLogoAction`, vista previa del login con sello; guarda con `updateBrandSettingsAction`; si el color es el verde sembrado preselecciona `#1462DC` sin guardarlo). **Pendiente:** default `#1462DC` en los 6 caminos de alta (archivos de la sesión embudo: `register.actions`, `complete.actions`, `register-coach-free`) — después de su W4.
- [x] F2.5 «Vive tu app»: `openViveTuAppAction` genera el magic link del demo (`generateLink` → `hashed_token`) hacia la ruta propia `GET /vive-tu-app?t=&c=` (verifica con `verifyOtp`, exige `clients.is_demo`, cae en `/c/<id>/dashboard`; NO usa `/auth/confirm`, que manda al alta del coach) + evento `vive_tu_app_opened`. UI = hoja con QR primero (las cookies de Supabase son del host: abrirlo en el mismo navegador reemplaza la sesión del panel) + «Copiar» + «Abrir en este navegador» con aviso.
- [x] F2.6 Nav por dominio: `coach/layout.tsx` lee los 5 dominios en una query (`readCoachDomainPrefs`) y los pasa a `getVisibleNavItems` (sin pasar por el flag `FEATURE_PREFS_ENABLED`: 1 coach en LIVE tenía nutrición apagada desde «Funciones» y ahora la ve oculta de verdad). `Opciones › Mi panel` (`settings/funciones`, `MiPanelPane`): persona + pregunta 2, 5 switches por dominio, «Ordenar mi panel según mi especialidad», re-sembrar/borrar demo; rail desktop y card móvil renombrados.
- [~] F2.7 `FreeWelcomeModal` solo texto + «Recordármelo después» (24 h, clave por coach); HelpCenter «Primeros pasos» desde `ONBOARDING_STEPS[persona]` (cableado en `/coach/support` y en `SupportPane`); los 5 componentes muertos borrados (entraron en el commit `0e42d480` de la sesión embudo por un `git rm` staged). **Pendiente:** correo D+0 por persona (W6, vía `scheduleCoachEmail`); deps huérfanas de `package.json` sin revisar.
- [~] F2.8 `nextBestAction.rules.ts` por persona; `/coach/programs` → `/coach/workout-programs`; claves de localStorage por coach en la guía y en `FreeWelcomeModal`. **Pendiente:** `WeeklyPlanBuilder.tsx:252` (clave global del builder) — entra con F4.2.
- [~] F2.9 Tests unitarios: `persona.service.test` (gate D8 + prefs + nav), `persona.actions.test`, `onboarding-signals.test`, `onboarding-guide-state.test`, `use-onboarding-guide.test`, `nextBestAction.rules.test`, `vive-tu-app.actions.test` + `vive-tu-app/route.test`, `demo-student.actions.test`, `CoachOnboardingChecklist.test`, `HelpCenter.test`, `safe-next.test`. **Pendiente:** Playwright smoke × 5 personas; `tests/coach-onboarding-dashboard.spec.ts` quedó obsoleto (referencia `OnboardingThreeSlot`) — reescribir en W7.

## W3 — Demos, plantillas y estados vacíos (Opus ×2 + revisores D4)
- [x] F3.1 `seedDemoStudent(coachId, persona)` implementado en `apps/web/src/services/onboarding/` (service + `demo-writers.ts`): alumno `is_demo` con auth user `demo-<coachId>@evatest.cl`, cuenta, membresía standalone e intake; contenido por persona; inventario de ids en `onboarding_guide.demo` (MERGE del jsonb, nunca replace); `deleteDemoStudent` reversible e idempotente; `applyTemplate`. Escribe nutrición **V2** DIRECTO con el cliente admin —no por `persist_and_publish_nutrition_plan_v2`, que exige `auth.uid()` y aborta bajo `service_role`— con la misma forma de filas y los `snapshot_*` congelados por `computeItemMacros`. Validado contra LIVE con `qa-free-v3@evatest.cl` en las 4 personas (seed → verificación de filas → delete → 0 filas, `onboarding_guide` conservado); la cuenta QA quedó limpia. Pendiente: pruebas en tx-rollback SQL (la validación fue por ciclo real seed→delete).
- [x] F3.2 Contenido en `services/onboarding/demo-content/{strength,nutrition,rehab,endurance}.ts` (datos PUROS, sin ids de catálogo literales: todo se resuelve por NOMBRE contra el catálogo del sistema). Matías: Full body 3 d + 2 semanas de logs con récord de press + 2 check-ins. Ana: pauta V2 por porciones publicada (4 franjas, 16 items, 14 targets) + BIA + ISAK calculado con `computeIsak` + 24 registros de ingesta. Pedro: screening de 7 patrones (compuesto 7/21, dolor y asimetría, banda alta derivados por `@eva/calc`) + pauta domiciliaria. Javiera: perfil cardio (58 ppm / 5K en 25') + semana Z2/8×400/fondo + 2 sesiones con curva de FC (`metadata.hr` v1). **Esqueleto provisional: falta la revisión D4** (socio para fuerza/running; nutricionista para pautas; kine sin revisor asignado).
- [x] F3.3 Plantillas clonables por persona en `services/onboarding/templates.ts` (11 ids con contenido real), con test CRUZADO contra `TEMPLATE_CATALOG`: una plantilla del catálogo sin contenido rompe el test, no el botón del panel.
- [x] F3.4 `scripts/seed-rehab-exercises.mjs` — 24 ejercicios del SISTEMA (Movilidad 6 · Control motor 7 · Propiocepción 5 · Fortalecimiento 6), `muscle_group = 'Rehabilitación'`, sin media, idempotente por id (namespace `0f81`), doble gate + `--dry-run` propio. **APLICADO en LIVE el 22-08** (24/24 verificados con `coach_id NULL`).
- [x] F3.5 Áreas del builder presembradas por persona: rehab (Movilidad/Control motor/Fortalecimiento) y endurance (Rodaje/Series/Fondo), con slugs estables y creación idempotente — si el coach ya tiene un área con ese slug se REUSA y el borrado no la toca.
- [x] F3.6 Empty states template-first (web): `coach/_components/TemplatePicker.tsx` (+ `TemplateFirstEmptyState`) y `coach/_actions/templates.actions.ts` (`applyTemplateAction` → `applyTemplate`, allowlist `TEMPLATE_CATALOG`, acceso al alumno verificado); vacíos en programas (`ProgramsFirstRunEmpty`), nutrición V2 (`NutritionFirstRunEmpty`), movimiento (`MovementFirstRunEmpty`) y cardio (`CardioFirstRunEmpty`); contexto en `coach/_data/onboarding-empty.queries.ts` (persona + demo, `React.cache`). El builder por alumno no tiene estado vacío (siempre abre un lienzo): la entrada template-first vive en `/coach/workout-programs` (destino del paso 3 de fuerza). `applyTemplate` de nutrición falla con plan activo (índice `nutrition_plans_v2_active_root_per_client_uniq`) → copy amable pendiente en W4.
- [~] F3.7 Etiqueta «{noun} de ejemplo» (`clients/DemoClientBadge.tsx`) en directorio (demo al final, `withDemoLast`), ficha (`DemoStudentBanner` + «Borrar ejemplo» → `clients/_actions/demo.actions.ts`), diálogo de asignación de programas, selector de cardio, hub de movimiento y picker de pauta del vacío. No hay selector de destinatarios de correo en `coach/**` (el único contacto es `wa.me` de a uno; el demo no tiene teléfono). **Pendiente:** rótulo en `nutrition-plans/AssignModal` y `AssignRecipeModal` (V1 legacy), `QuickAddPaymentModal`, y `NewPlanPickerButton`/`AssignPlanToClientsDialog` (exige `isDemo` en el read model de `packages/nutrition-v2`); etiqueta en la app del alumno (W5).

## W4 — Tareas guiadas (Opus ×2)
- [x] F4.1 «Sumar un alumno en 3 pasos» (web): `clients/_components/AddStudentStepper.tsx` (3 columnas desktop / apilado móvil; nombre + correo, opcionales plegados, contraseña temporal generada; canales WhatsApp por persona vía `formatWhatsappInvite` / correo con acceso / QR-código; vista previa del login con marca + sello) + `AddStudentFlowProvider` (primer alta real ⇒ stepper; siguientes ⇒ modal, con escape «Hazlo paso a paso»); entra por `/coach/clients?invite=1` (paso 4 de la guía). Escribe por `createClientAction`. Evento: `step_completed/first_client {channel, persona}` + PostHog `invite_sent` (no existe `invite_sent` en el CHECK de la tabla). `LeadsInbox` conserva su modal.
- [x] F4.2 «Primera rutina» (builder web): `workout-programs/components/FirstRoutinePicker.tsx` (plantilla → `applyTemplateAction` → builder `?programId=&primera=1`; error ⇒ lienzo vacío avisado), `builder/[clientId]/components/FirstRoutineCards.tsx` (3 tarjetas oscuras en el lienzo, memoria `eva.builder.primera-rutina.v1:{coachId}`), `StudentLivePreview.tsx` (panel derecho ≥1024 / plegable móvil, forma del ejecutor vía helpers compartidos), CTA «Asignar y ver como {demo}» → barra de éxito con `ViveTuAppButton autoOpen`; `BuilderOnboardingTour` ya no se abre solo (solo «?»); clave de memoria del tour por coach. Evento `step_completed/first_artifact {surface:'builder'}`. **Pendiente:** unificar `FirstRoutinePicker` con `TemplatePicker` (`onApplied`).
- [x] F4.3 Equivalentes con `?primera=1` y tarjetas embebidas (`coach/_components/guided/GuidedTaskCards.tsx`, memoria por coach y superficie): nutrición (`resolveNutritionPrimeraEntry`: pauta vigente ⇒ editarla con aviso; sin pauta ⇒ nueva; CTA «Publicar y ver como {demo}» → `PrimeraPautaPublicada` con `ViveTuAppButton autoOpen`), movimiento (`resolvePrimerScreeningEntry`: sin screening ⇒ wizard guiado; con screening ⇒ semáforo + «Armar pauta domiciliaria» → `applyTemplateAction('lumbalgia-f1')` → builder), cardio (`resolvePrimerasZonasEntry`: qué falta del perfil → zonas → «Armar semana base» → `base-10k-4` → builder). `applyTemplate` deja UN programa activo por alumno (desactiva los anteriores). Eventos `step_completed/first_artifact` solo en modo guiado. **Pendiente:** el tilde de «cambié un alimento / ajusté una porción» usa `changeCount` como proxy.
- [~] F4.4 Unit: `add-student-invite.test` (23), `AddStudentStepper.test` (14), `AddStudentFlowProvider.test` (5), `first-routine.test`, `StudentLivePreview.test`, `FirstRoutinePicker.test`, `guided-cards-memory.test`, `GuidedTaskCards.test`, `primera-pauta.test`, `primer-screening.test`, `primeras-zonas.test`, `templates.test`; tsc y lint verdes. **Pendiente:** Playwright smoke de las 4 tareas (W7) y QA visual del owner.

## W4.5 — La guía se muda: pantalla propia + píldora (Opus; decisión del owner 22-08)

Cambio de diseño del owner que MANDA sobre SPEC §3, §6 y la decisión D5=A: el dashboard del día 1
se ve LLENO, así que la guía sale de ahí. Ver SPEC § «Cambio 22-08».

- [x] F4.5.1 `/coach/guia` («Tus primeros pasos»): `page.tsx` server que reusa
  `getCoachOnboardingV2Data` (sin duplicar señales) + `loading.tsx` con la geometría real;
  `_components/GuideScreen.tsx` (cabecera con anillo n/5 + chip de persona a `Opciones › Mi panel`,
  5 tarjetas grandes, riel del alumno de ejemplo a la derecha / debajo en móvil, banda de
  bienvenida con `?bienvenida=1`, cierre 5/5 con «Ir a mi panel» y «Borrar ejemplo»),
  `GuideStepCard.tsx` (estados hecho/siguiente/pendiente) y `GuideProgressRing.tsx`. Reusa
  `useOnboardingGuide`, `BrandQuickCard`, `DemoStudentCard`, `PersonaNudgeCard` y `ViveTuAppButton`
  tal cual: la guía sigue siendo UNA sola.
- [x] F4.5.2 Primera entrada = la guía para TODOS los planes: `persona.actions` redirige a
  `/coach/guia?bienvenida=1`; `coach/dashboard/page.tsx` aplica el resolver puro
  `shouldRedirectToGuide` (`guia/_lib/guide-first-entry.ts`). Una sola vez: `GuideScreen` estampa
  `onboarding_guide.guide_seen_at` al montar (clave nueva en el parser y en el schema del action,
  ambos con test). Persona `null` ⇒ no se redirige; managed ⇒ nunca.
- [x] F4.5.3 Dashboard limpio: `DashboardShell` deja de montar checklist, marca inline, demo, nudge
  y tira del pie; `DashboardContent` deja de pedir `getCoachOnboardingV2Data` (ahorro real en cada
  carga del panel). `FreeWelcomeModal` queda solo para el `?welcome=free` legado y recibe la persona
  desde el RSC. `CoachOnboardingChecklist.tsx` + su test quedaron SIN importadores y se borraron;
  `withPrimeraFlag` se mudó a `guia/_lib/guide-view.ts` (con su test).
- [x] F4.5.4 `components/coach/GuidePill.tsx`: círculo de 48 px con `eva-icon-white.png` sobre
  `--sport-500` + anillo de progreso; maximizada «Tu guía · n/5» + «Siguiente: {paso}» + «Abrir» +
  «–»; `localStorage` por coach (`eva.guide-pill.v1:{coachId}`), `aria-expanded` + `aria-label`
  «Guía de inicio, n de 5», Escape minimiza, `motion-safe` 220 ms. Posición: `fixed` abajo a la
  izquierda, sobre la cápsula del nav en móvil (safe-area + 97 px) y midiendo `#coach-main` en
  desktop (sin hardcodear el ancho del sidebar). Montada en `coach/layout.tsx`, que lee la persona
  con `getPersonaScreenContext` (`React.cache`, compartida con el dashboard).
- [x] F4.5.5 Tests: `guide-first-entry.test.ts` (redirect ×6 casos + visibilidad de la píldora),
  `guide-view.test.ts`, `GuideScreen.test.tsx`, `GuidePill.test.tsx`, `persona.actions.test`
  actualizado, `onboarding-guide-state.test` con `guide_seen_at`. **NO ejecutados: el owner pidió
  no correr gates pesados (CPU ocupada) — quedan para la pasada de gates de W7.**
- [ ] F4.5.6 Pendiente: QA visual del owner (desktop, PWA 390 px, dark, white-label) y decidir si
  RN copia esta casa en W5 (la SPEC ya lo pide).

## W4.6 — Fixes del QA del owner + responsividad (22-08)
- [x] F4.6.1 «Otro color» fuera de la tarjeta de marca de la guía (sin editores HEX; el picker completo sigue en Opciones › Mi Marca).
- [x] F4.6.2 Movimiento y cardio abrían el builder EN BLANCO tras aplicar la plantilla (faltaba `?programId=`): ahora abren sobre el programa recién creado con `&primera=1`.
- [x] F4.6.3 Builder móvil: el toggle «Así lo ve {nombre}» pasa a un botón ojo en la barra superior (`aria-controls`), el panel trae su «✕» y el lienzo reserva `safe-area + 96px` para Guardar/«+».
- [x] F4.6.4 `DemoStudentBanner` apilado en móvil (chip → texto → botón a ancho completo), fila en ≥ md.
- [x] F4.6.5 Volver a la guía siempre: «Ver mi guía de inicio» en Opciones › Mi panel, «Abrir la guía» en el Centro de ayuda, `/coach/guia` idéntica con `hidden`/`dismissed` + «Volver a mostrar la píldora» (limpia server + localStorage).
- [x] F4.6.6 Responsividad: chip de persona con `flex-wrap`, grid de la guía `xl:`, KPIs del demo con `minmax(0,1fr)`, píldora con ancho acotado a `min(280px, 100vw − 104px)` y tap targets ≥ 44 px.
- [x] F4.6.7 Gate visual reproducible: `apps/web/src/app/dev-harness/guia` (fixtures, solo `NODE_ENV=development`) + `scripts/guia-visual-check.mjs` (Playwright headless, 5 anchos × light/dark × 2 personas; asserts bloqueantes: sin scroll-x, sin texto recortado, píldora ⊆ viewport y sin intersectar la cápsula del nav, tap targets). Corrido: **159 aserciones, 0 fallidas**.
- [x] F4.6.8 Bug preexistente (QA de BROCITO en Android): el modal «Tu link de alumnos cambió» salía a TODO coach nuevo. `needsPublicCodeConfirmation` + `PUBLIC_CODE_CUTOVER = 2026-05-23` en `lib/coach/invite-code.ts`, usado por `coach/layout.tsx` y por `api/mobile/coach/dashboard` (`created_at` sumado al repositorio del coach). 8 tests.
- [ ] F4.6.9 Pendiente: el fix del builder (F4.6.3) no tiene gate visual propio (sin harness del builder); QA del owner en 390/430 px.

## W4.7 — Un solo onboarding por área (Opus; decisión del owner 22-08)

Regla del owner: «no podemos tener varios onboardings en una sola área». Ver SPEC § «Un solo
onboarding por área».

- [x] F4.7.1 Helper puro compartido web/RN `packages/onboarding/guide-mode.ts` (`isGuideActive({
  completed, dismissed, hidden, managed })`, misma semántica que `shouldShowGuidePill` sin la parte
  de rutas), re-exportado desde el barrel del paquete. Test propio (`guide-mode.test.ts`, 7 casos).
- [x] F4.7.2 Web: `components/coach/OnboardingModeContext.tsx` (`OnboardingModeProvider` +
  `useOnboardingMode() → { guideActive }`, default `false` fuera del provider). `coach/layout.tsx`
  resuelve `guideActive` en el servidor con los MISMOS datos que le pasa a `GuidePill` y envuelve el
  shell.
- [x] F4.7.3 Tours que dejan de auto-arrancar con la guía activa: `nutrition-v2/tour/tour-engine.tsx`
  (`useTourController` — cubre hub y editor de una, así que `HubTourGuide` y `QuickEditPlanView` no
  se tocaron) y `settings/_components/BrandSettingsTourClient.tsx` (el `?tour=1` y el temporizador de
  600 ms; el param se limpia igual). En los dos casos el «?» sigue abriendo el tour y **no** se marca
  la memoria de «visto». `WeeklyPlanBuilder` ya no auto-arrancaba desde F4.2 (verificado: el único
  `openTour(` cuelga del «?», no de un `useEffect` de montaje).
- [x] F4.7.4 Muere el onboarding viejo del dashboard: `FreeWelcomeModal.tsx` borrado (la guía es la
  bienvenida). La conversión NO se pierde: el aterrizaje legado `/coach/dashboard?welcome=free&eid=`
  monta `RegistrationMirror` desde `DashboardShell` (Meta `CompleteRegistration` + PostHog
  `coach_registered`, con la misma validación del `eid` que `/coach/guia`).
- [x] F4.7.5 `@eva/onboarding` WEB.brand pasa de `/coach/settings?tour=1` a `/coach/settings/brand`:
  el `tour=1` no abría nada en el hub (`BrandSettingsTourClient` se monta en `/brand`, no en
  `/coach/settings`) y ese tour ya no auto-arranca. Test del paquete ajustado.
- [x] F4.7.6 Tests: `guide-mode.test.ts`, `OnboardingModeContext.test.tsx` (default/provider),
  `tour-engine.test.tsx` (no auto-arranca con guía activa · el «?» lo abre igual · la memoria queda
  intacta). Verde también `hub-tour-mount.test.tsx` (fuera del provider ⇒ auto-arranca como antes).
- [ ] F4.7.7 Pendiente: espejo RN de la regla (W5 — la pantalla de guía RN y sus tours/modales de
  módulo consumen el mismo `isGuideActive`) y QA visual del owner.

## W5 — RN paridad (Opus)
- [x] F5.1 Pantalla de persona RN `app/coach/onboarding/persona.tsx` (molde RoleCards, 5 tiles, pregunta 2, «Armar mi panel», interstitial ≥ 1,2 s) + gate en `app/coach/_layout.tsx` (`needsPersona` fail-open, caché por sesión) vía `lib/coach-persona.ts`; API: `api/mobile/coach/persona` (GET/POST) sobre el núcleo compartido `applyCoachPersona` de `services/coach/persona.service.ts` (la action web lo usa también); `api/mobile/coach/dashboard` devuelve `onboardingV2` (persona, needsPersona, demo, guide, señales) desde `services/onboarding/onboarding-v2.queries.ts`; `/api/coach/onboarding-events` acepta `stepKey: 'persona'`. Tests: 16 + 8 + 18.
- [x] F5.2 Guía RN en pantalla propia `app/coach/guia.tsx` (anillo n/5, 5 tarjetas desde `ONBOARDING_STEPS` + `resolveRnRoute`, marca compacta, alumno de ejemplo con «Ver como…» / «Borrar ejemplo», bienvenida, cierre 5/5, «No mostrar la guía», `guide_seen_at` al montar) + píldora flotante `components/coach/GuidePill.tsx` (Reanimated, anillo SVG, sobre la tab bar, AsyncStorage por coach) montada en `(tabs)/_layout.tsx`; home sin el slot viejo; parser `onboardingV2` + store en `lib/coach-dashboard.ts`. «Ver como…» abre `/vive-tu-app` en el navegador del sistema (`Linking.openURL`; `expo-web-browser` no está instalado ⇒ sin binario nuevo) vía `api/mobile/coach/vive-tu-app` sobre `services/onboarding/vive-tu-app.service.ts`; `api/mobile/coach/demo-student` DELETE. OTA-able (`expo export` verde).
- [ ] F5.3 Nav móvil por dominio (mismo paquete); dashboard vacío deja de felicitar; copy interno («scope/pools») fuera. **Pendiente.**
- [ ] F5.4 Alta: stepper compacto + share sheet + `wa.me`; `QuickCreateClientForm` maneja `UPGRADE_REQUIRED` y emite `upgrade_gate_hit`.
- [ ] F5.5 Tarjetas embebidas del builder RN (molde `BuilderOnboardingTour` → tarjetas); vista del alumno.
- [~] F5.6 `MobileOnboardingChecklist`, `MobileFreeWelcomeModal` y bloques viejos BORRADOS (W4.7-rn, −1.348 líneas). **Pendiente:** RN emite solo `guide_engagement` (con `stepKey` fijo `profile_branding` + `metadata.step`); `step_completed`/`aha_moment` desde RN y `captureAppEvent` de los eventos nuevos.
- [ ] F5.7 QA visual en device/emulador por persona (light/dark, white-label, safe areas, back de hardware en la pantalla de persona, píldora vs cápsula). OTA-able confirmado (`expo export` verde, sin deps nativas nuevas). **Pendiente del owner.**

## W6 — Correos por comportamiento (Opus; tras ledger de BROCITO)
- [ ] F6.1 Motor de triggers sobre el ledger del embudo: +2 h sin alumno real · +24 h sin volver · +48 h alumno invitado no entró · aha · +7 d (ayuda humana) · corte 90 d; dedupe; exclusión de cuentas de prueba; cron.
- [ ] F6.2 Plantillas por persona (`personaCopy`), con el link `/join` y el mensaje de WhatsApp para reenviar al alumno.
- [ ] F6.3 Tests de templates y servicio; envío real a `qa-free-v3@evatest.cl`.

## W7 — Medición, QA y salida (jefe + owner + Opus)
- [ ] F7.1 Insights PostHog: setup ≤24 h, aha ≤7 d, volvió >6 h, tocó marca, por cohorte semanal y por persona; dashboard «Activación coaches».
- [ ] F7.2 Docs: `CURRENT.md`, `PRODUCT_OVERVIEW`, `MOBILE_PARITY`, `MANUAL_TASKS` (contenido D4 pendiente si aplica); SPEC/PLAN/TASKS a `active`/cierre.
- [ ] F7.3 QA del owner: web desktop + PWA + app (Xiaomi/iPhone) × 5 personas con `qa-free-v3` (cambio de persona desde Mi panel); evidencia.
- [ ] F7.4 Backfill D8: coaches existentes con `persona IS NULL` — 0 alumnos ⇒ pantalla completa una vez; ≥1 ⇒ tarjeta «Elige tu especialidad».
- [ ] F7.5 Gates completos; merge a master; Vercel; OTA a 3 runtimes por `mobile-ota.yml`; aviso opcional a los Free sin alumno.

## Deuda declarada (fuera de v1)
- [ ] Vocabulario global por persona (`personaNoun()` en nav y fichas, web+RN).
- [ ] PDF de la pauta V2 en web (objeción #1 de nutricionistas).
- [ ] Programación grupal (persona «preparador de equipo / box»); integraciones Strava/Garmin; ficha clínica.
- [ ] `register_submitted` en Google OAuth (BROCITO W7).
