---
status: active
owner: product-engineering
last_verified: "2026-08-23"
canonical: false
---

# TASKS — Onboarding del coach v2 (megaplan)

Modelo sugerido entre paréntesis. Estado al 2026-08-22: W1–W4.7 y W5 F5.1/F5.2 en `master` (último `8cf7b886`, OTA 1.1.2 `17fa6905`/`93834df2`); W5 F5.3–F5.7, W6 y W7 pendientes; **W8 (auditoría 22-08) abajo** reúne los huecos confirmados que ninguna wave declaraba. Informe: artifact «Qué falta del onboarding v2» `821a05d0`; hallazgos crudos en `D:/tmp/audit-onb-20260822/`.

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
- [x] F1.3 `is_demo = false` en 15 consumidores con test cada uno: `capacity.service.ts:36` (hub de cupo: banner, activate-free, get-coach, downgrade, subscription-status web+RN), `clients.actions.ts:120`, `import.actions.ts:95/201`, `api/mobile/coach/clients/route.ts:201`, `api/mobile/coach/clients/import/route.ts:264`, `join-capacity.ts:69/97`, `reactivate.queries.ts:45/57`, `client-archive.service.ts:265` (desarchivo), `coach.repository.ts:87` (KPI alumnos web+RN), `cap-nudge/route.ts:177`, `trial-expiry/route.ts:91/165`, `admin coach-actions.ts:438`, RPC `get_platform_clients_count` (migración). Decisión: la ACTIVIDAD del dashboard (check-ins, logs, adherencia) SÍ incluye al demo a propósito (trae contenido al día 1; etiquetado en W3 F3.7). `OverLimitBanner` y `effective-limit.ts` no necesitaron cambio (consumen la fila 1 / son puros).
- [x] F1.4 `coach_onboarding_events`: CHECK ampliado (12 tipos) + índice único parcial `coach_onboarding_events_step_completed_once (coach_id, step_key) where event_type='step_completed' and created_at >= 2026-08-22` (no toca las 2.293 filas históricas); route acepta pasos v2 + legacy y responde `{ ok, deduped }` ante 23505; 13 tests nuevos. El fin del re-emit del cliente queda para la reescritura del checklist (W2 F2.3).
- [x] F1.5 `@eva/feature-prefs`: `FEATURE_DOMAINS` = nutrition · training · cardio · movement · bodycomp (sección `core` por dominio nuevo), `resolvePersonaPrefs(persona, alsoOther)`, `disabledDomainsForPersona()`; matriz 5×2 testeada. Consumidores adaptados a `Partial<Record<…>>` sin cambio de comportamiento: web `settings/funciones/_data/funciones.queries.ts`, RN `lib/feature-prefs.queries.ts` (W2.6/W5.3 agregan los dominios nuevos a `DOMAIN_META`/`DOMAIN_LABELS`).
- [x] F1.6 `@eva/coach-nav`: `featureDomain` en `programs` (training), `cardio`, `movement`; composición entitlement × dominio testeada; no hay entrada de nav para bodycomp (vive en la ficha del alumno) — se gatea por dominio en W2/W5.
- [x] F1.7 `@eva/schemas/persona.ts`: `PERSONAS`, `PersonaSchema`, `PERSONA_COPY` (tiles, bajadas, noun, demo, segunda pregunta, WhatsApp), `personaNoun()`, `formatWhatsappInvite()`. Copy en latam neutro (tuteo; el voseo de la spec original se corrigió el 22-08).
- [x] F1.8 `@eva/onboarding`: `ONBOARDING_STEPS` (5 × 5), `DEMO_PROFILES`, `TEMPLATE_CATALOG`, `resolveAutoCompleted`, `nextStep`, `progress`, `resolveHref`, `resolveRnRoute`; alias en web/mobile tsconfig + vitest; dep `workspace:*` en web y mobile; lockfile +8 (`--frozen-lockfile` OK). Nota: la pauta apunta al editor único (`/coach/nutrition-v2/{id}/editor`; el builder redirige ahí).

## W2 — Web: primer login y dashboard día 1 (Opus ×2)
- [x] F2.1 Ruta `/coach/onboarding/persona` (`_components/PersonaPicker.tsx`: 5 tiles + pregunta 2 inline, radiogroup accesible, sin «saltar»); action `setCoachPersonaAction` (persona + 5 prefs por dominio + evento `persona_selected` + `seedDemoStudent` + PostHog). El gate vive en `proxy.ts` (no en el layout: un layout de Next no conoce el pathname y loopearía) con resolvers puros en `services/coach/persona.service.ts`: `persona IS NULL && !managed && ruta no exenta && (created_at ≥ 2026-08-22 || 0 alumnos reales)`; `/coach/onboarding/persona` sumada a `COACH_LOGIN_DEFAULT_PATHS` (safe-next). Pendiente: la pantalla renderiza como overlay `fixed inset-0` sobre el shell (Next no deja saltar el layout padre); alternativa = route group `(fullscreen)`.
- [x] F2.2 Interstitial «Armando tu panel» (`_components/BuildingPanel.tsx`: 3 líneas que se tildan + skeleton de los 3 bloques, mínimo 1,2 s, sin spinner, respeta `prefers-reduced-motion`).
- [x] F2.3 **(superado por W4.5: `CoachOnboardingChecklist` y `OnboardingGuideFooterStrip` se borraron; la guía vive en `/coach/guia`)** Guía v2 (`CoachOnboardingChecklist` reescrito + `OnboardingGuideFooterStrip`): pasos desde `@eva/onboarding`, progreso n/5, señales en `getCoachOnboardingV2Data` (marca, `vive_tu_app_opened`, artefacto por persona, alumno real, actividad real) en un solo `Promise.all`; ARRIBA del dashboard (primer bloque del contenido, antes del saludo) hasta 5/5 u «Ocultar», tira al pie después; estado único en `_lib/use-onboarding-guide.ts` (server gana, `emitted` evita re-emitir eventos). Confeti solo en el aha.
- [x] F2.4 Tarjeta «Tu marca en 60 s» (`_components/BrandQuickCard.tsx`: nombre, 5 presets de `@eva/brand-kit` + picker, logo vía `createLogoUploadUrlAction`/`updateLogoAction`, vista previa del login con sello; guarda con `updateBrandSettingsAction`; si el color es el verde sembrado preselecciona `#1462DC` sin guardarlo). Default `#1462DC` en los 6 caminos de alta HECHO en `b58b2b74` (21-08).
- [x] F2.5 «Vive tu app»: `openViveTuAppAction` genera el magic link del demo (`generateLink` → `hashed_token`) hacia la ruta propia `GET /vive-tu-app?t=&c=` (verifica con `verifyOtp`, exige `clients.is_demo`, cae en `/c/<id>/dashboard`; NO usa `/auth/confirm`, que manda al alta del coach) + evento `vive_tu_app_opened`. UI = hoja con QR primero (las cookies de Supabase son del host: abrirlo en el mismo navegador reemplaza la sesión del panel) + «Copiar» + «Abrir en este navegador» con aviso.
- [x] F2.6 Nav por dominio: `coach/layout.tsx` lee los 5 dominios en una query (`readCoachDomainPrefs`) y los pasa a `getVisibleNavItems` (sin pasar por el flag `FEATURE_PREFS_ENABLED`: 1 coach en LIVE tenía nutrición apagada desde «Funciones» y ahora la ve oculta de verdad). `Opciones › Mi panel` (`settings/funciones`, `MiPanelPane`): persona + pregunta 2, 5 switches por dominio, «Ordenar mi panel según mi especialidad», re-sembrar/borrar demo; rail desktop y card móvil renombrados.
- [~] F2.7 **(`FreeWelcomeModal` se borró en W4.7: la guía es la bienvenida)** `FreeWelcomeModal` solo texto + «Recordármelo después» (24 h, clave por coach); HelpCenter «Primeros pasos» desde `ONBOARDING_STEPS[persona]` (cableado en `/coach/support` y en `SupportPane`); los 5 componentes muertos borrados (entraron en el commit `0e42d480` de la sesión embudo por un `git rm` staged). **Pendiente:** correo D+0 por persona (W6, vía `scheduleCoachEmail`); deps huérfanas de `package.json` sin revisar.
- [x] F2.8 `nextBestAction.rules.ts` por persona; `/coach/programs` → `/coach/workout-programs`; claves de localStorage por coach en la guía y en `FreeWelcomeModal`. Las claves del tour del builder ya son por coach (`builderTourStorageKey`, F4.2). Quedan para W8: `builder_draft_new`/`builder_recent_exercises` globales y el fallback `/coach/programs` de `ExpiringPrograms.tsx:32`.
- [~] F2.9 Tests unitarios: `persona.service.test` (gate D8 + prefs + nav), `persona.actions.test`, `onboarding-signals.test`, `onboarding-guide-state.test`, `use-onboarding-guide.test`, `nextBestAction.rules.test`, `vive-tu-app.actions.test` + `vive-tu-app/route.test`, `demo-student.actions.test`, `HelpCenter.test`, `safe-next.test` (`CoachOnboardingChecklist.test` murió con el componente en W4.5). **Pendiente:** Playwright smoke × 5 personas; `tests/coach-onboarding-dashboard.spec.ts` quedó obsoleto (referencia `OnboardingThreeSlot`) — reescribir en W7.

## W3 — Demos, plantillas y estados vacíos (Opus ×2 + revisores D4)
- [x] F3.1 `seedDemoStudent(coachId, persona)` implementado en `apps/web/src/services/onboarding/` (service + `demo-writers.ts`): alumno `is_demo` con auth user `demo-<coachId>@evatest.cl`, cuenta, membresía standalone e intake; contenido por persona; inventario de ids en `onboarding_guide.demo` (MERGE del jsonb, nunca replace); `deleteDemoStudent` reversible e idempotente; `applyTemplate`. Escribe nutrición **V2** DIRECTO con el cliente admin —no por `persist_and_publish_nutrition_plan_v2`, que exige `auth.uid()` y aborta bajo `service_role`— con la misma forma de filas y los `snapshot_*` congelados por `computeItemMacros`. Validado contra LIVE con `qa-free-v3@evatest.cl` en las 4 personas (seed → verificación de filas → delete → 0 filas, `onboarding_guide` conservado); la cuenta QA quedó limpia. Pendiente: pruebas en tx-rollback SQL (la validación fue por ciclo real seed→delete).
- [x] F3.2 Contenido en `services/onboarding/demo-content/{strength,nutrition,rehab,endurance}.ts` (datos PUROS, sin ids de catálogo literales: todo se resuelve por NOMBRE contra el catálogo del sistema). Matías: Full body 3 d + 2 semanas de logs con récord de press + 2 check-ins. Ana: pauta V2 por porciones publicada (4 franjas, 16 items, 14 targets) + BIA + ISAK calculado con `computeIsak` + 24 registros de ingesta. Pedro: screening de 7 patrones (compuesto 14/21, dolor y asimetría, banda alta derivados por `@eva/calc`) + pauta domiciliaria. Javiera: perfil cardio (58 ppm / 5K en 25') + semana Z2/8×400/fondo + 2 sesiones con curva de FC (`metadata.hr` v1). **Esqueleto provisional: falta la revisión D4** (socio para fuerza/running; nutricionista para pautas; kine sin revisor asignado). (22-08: recalibrado a 14/21 según canvas; sigue pendiente la revisión D4 del kine).
- [x] F3.3 Plantillas clonables por persona en `services/onboarding/templates.ts` (11 ids con contenido real), con test CRUZADO contra `TEMPLATE_CATALOG`: una plantilla del catálogo sin contenido rompe el test, no el botón del panel.
- [x] F3.4 `scripts/seed-rehab-exercises.mjs` — 24 ejercicios del SISTEMA (Movilidad 6 · Control motor 7 · Propiocepción 5 · Fortalecimiento 6), `muscle_group = 'Rehabilitación'`, sin media, idempotente por id (namespace `0f81`), doble gate + `--dry-run` propio. **APLICADO en LIVE el 22-08** (24/24 verificados con `coach_id NULL`).
- [x] F3.5 Áreas del builder presembradas por persona: rehab (Movilidad/Control motor/Fortalecimiento) y endurance (Rodaje/Series/Fondo), con slugs estables y creación idempotente — si el coach ya tiene un área con ese slug se REUSA y el borrado no la toca.
- [x] F3.6 Empty states template-first (web): `coach/_components/TemplatePicker.tsx` (+ `TemplateFirstEmptyState`) y `coach/_actions/templates.actions.ts` (`applyTemplateAction` → `applyTemplate`, allowlist `TEMPLATE_CATALOG`, acceso al alumno verificado); vacíos en programas (`ProgramsFirstRunEmpty`), nutrición V2 (`NutritionFirstRunEmpty`), movimiento (`MovementFirstRunEmpty`) y cardio (`CardioFirstRunEmpty`); contexto en `coach/_data/onboarding-empty.queries.ts` (persona + demo, `React.cache`). El builder por alumno no tiene estado vacío (siempre abre un lienzo): la entrada template-first vive en `/coach/workout-programs` (destino del paso 3 de fuerza). `applyTemplate` de nutrición falla con plan activo (índice `nutrition_plans_v2_active_root_per_client_uniq`) → copy amable pendiente en W4.
- [~] F3.7 Etiqueta «{noun} de ejemplo» (`clients/DemoClientBadge.tsx`) en directorio (demo al final, `withDemoLast`), ficha (`DemoStudentBanner` + «Borrar ejemplo» → `clients/_actions/demo.actions.ts`), diálogo de asignación de programas, selector de cardio, hub de movimiento y picker de pauta del vacío. No hay selector de destinatarios de correo en `coach/**` (el único contacto es `wa.me` de a uno; el demo no tiene teléfono). **Pendiente:** rótulo en `nutrition-plans/AssignModal` y `AssignRecipeModal` (V1 legacy), `QuickAddPaymentModal`, y `NewPlanPickerButton`/`AssignPlanToClientsDialog` (exige `isDemo` en el read model de `packages/nutrition-v2`); etiqueta en la app del alumno (W5).

## W4 — Tareas guiadas (Opus ×2)
- [x] F4.1 «Sumar un alumno en 3 pasos» (web): `clients/_components/AddStudentStepper.tsx` (3 columnas desktop / apilado móvil; nombre + correo, opcionales plegados, contraseña temporal generada; canales WhatsApp por persona vía `formatWhatsappInvite` / correo con acceso / QR-código; vista previa del login con marca + sello) + `AddStudentFlowProvider` (primer alta real ⇒ stepper; siguientes ⇒ modal, con escape «Hazlo paso a paso»); entra por `/coach/clients?invite=1` (paso 4 de la guía). Escribe por `createClientAction`. Evento: `step_completed/first_client {channel, persona}` + PostHog `invite_sent` (no existe `invite_sent` en el CHECK de la tabla). `LeadsInbox` conserva su modal.
- [x] F4.2 «Primera rutina» (builder web): `workout-programs/components/FirstRoutinePicker.tsx` (plantilla → `applyTemplateAction` → builder `?programId=&primera=1`; error ⇒ lienzo vacío avisado), `builder/[clientId]/components/FirstRoutineCards.tsx` (3 tarjetas oscuras en el lienzo, memoria `eva.builder.primera-rutina.v1:{coachId}`), `StudentLivePreview.tsx` (panel derecho ≥1024 / plegable móvil, forma del ejecutor vía helpers compartidos), CTA «Asignar y ver como {demo}» → barra de éxito con `ViveTuAppButton autoOpen`; `BuilderOnboardingTour` ya no se abre solo (solo «?»); clave de memoria del tour por coach. Evento `step_completed/first_artifact {surface:'builder'}`. **Pendiente:** unificar `FirstRoutinePicker` con `TemplatePicker` (`onApplied`). **Ajuste 2026-09-01 (`9b283488`, reporte de un coach con captura: «esta ventana no puedo cerrarla»):** el panel derecho de ≥1024 px ya no es fijo — el ojo de la cabecera (antes `lg:hidden`) lo pliega/abre en los tres anchos, el panel pinta su «✕» (`onClose`) también en desktop, abierto por defecto y la decisión se recuerda en `localStorage` (`eva.builder.livePreviewDesktop.v1`). Sin componentes ni copys nuevos.
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
- [~] F4.7.7 Espejo RN de la regla HECHO en W5 (`lib/onboarding-mode.tsx` + `OnboardingModeProvider` en
  `app/coach/_layout.tsx`, consumido por el tour de nutrición). **Pendiente:** el tour del builder RN
  (`program-builder.tsx:1429-1436`) sigue auto-arrancando y marcando «visto» → W8.2; QA visual del owner.

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

## W8 — Auditoría 22-08: huecos confirmados que ninguna wave declaraba

Auditoría del megaplan (22-08, 8 auditores + 8 verificadores adversariales, 101 hallazgos confirmados / 27
parciales / 4 refutados; informe artifact `821a05d0`, crudos en `D:/tmp/audit-onb-20260822/`). Cada ítem
lleva el id del hallazgo. Orden = daño al objetivo (que el coach nuevo llegue al aha). Las decisiones
del owner D9–D13 están al final; sin ellas no arranca lo que las cita.

### W8.0 — Hotfix del QA del owner (22-08, HECHO)
- [x] W8.0.1 Píldora RN: quedaba abierta tapando el panel y el FAB «+», y no seguía a la cápsula del nav.
  Ahora: teaser abierto ~3,2 s → se desliza HACIA el círculo azul y queda solo el botón (una vez por
  sesión y por coach; minimizada a mano ⇒ arranca cerrada); se esconde junto con la cápsula al
  scrollear (`useCoachTabbarMinimized`); reserva el espacio del FAB. Espejo web (`GuidePill.tsx` +
  `use-tabbar-minimized.ts`, compartido con `CoachSidebar`). Tests web 20/20; tsc ×2; expo export.

- [x] W8.0.2 QA del owner en device (tarde del 22-08, Android + OTA f), 5 hallazgos de la guía + «Cambiar en
  Opciones» sin destino — HECHO web + RN: tras «Armar mi panel» la guía aterriza en el paso siguiente (botón
  «Empezar: {paso}» en la bienvenida + scroll a la tarjeta «Empieza por aquí»); banda de bienvenida legible en
  dark (superficie de tarjeta + filete de marca, tokens de texto); iconos de los pasos = marca EVA (figura blanca
  sobre el color de marca; hecho = check); «Ver mi app» en RN explica una vez (Alert: se abre en el navegador con
  tu marca, tu sesión sigue en la app) antes de abrir; pasos 3 y 4 con tarea guiada en RN (W8.2.7 / W8.2.4);
  «Mi panel» en RN (W8.2.2); ⋮ de la fila del alumno visible en dark (`DirRowCard` token `text-muted`). Voseo
  residual del paquete corregido. Pendiente de QA del owner en device (dark + marca custom).

### W8.1 — Web: lo roto hoy (1 Opus, 1,0 d)
- [x] W8.1.1 🔴 **Paso 3 nace tildado** — HECHO 22-08: `resolveFirstArtifact` lee `onboarding_guide.demo.seededAt`
  (`readDemoSeededAt`) y solo cuenta filas con `updated_at > seededAt + 2 min` (`artifactCutoff`): un
  artefacto NUEVO (incluido uno para el propio demo, que es lo que crea la tarea guiada) o el sembrado
  EDITADO (las 3 tablas tienen trigger `set_updated_at` en LIVE, verificado). Sin inventario (other, demo
  borrado, coach viejo) cuenta todo como antes. (Al 22-08 W8.1.3 endureció esto: cada rama mira SOLO su
  tabla —rehab ya no acepta la pauta domiciliaria, resistencia ya no acepta programas— y el corte incluye
  `persona_set_at`.) 9 tests nuevos
  (`onboarding-v2.queries.test.ts`) + 46 de consumidores verdes. LIVE limpiado tras el deploy: los 2 coaches
  con `completed.first_artifact = true` y 0 artefactos propios (`00109d66`, `7b1345a6` QA) vuelven a
  pendiente y se borra su `step_completed/first_artifact` del 22-08 (el índice único lo bloquearía al
  completarlo de verdad). [EDGE-01/spec-rn-01]
- [ ] W8.1.2 🔴 **Sin demo no hay paso 2 ni paso 3** *(relacionada: [vive-tu-app-directo](../vive-tu-app-directo/SPEC.md) arregla el paso 2 para quien SÍ tiene demo; el «sin demo» sigue dependiendo de D10)*: `other` (`DEMO_PROFILES.other = null`), los 48 coaches
  con persona NULL y quien tocó «Borrar ejemplo» no pueden tildar «Ver mi app» (`vive-tu-app.service.ts:70-77`
  → `sin_demo`, solo toast) ni, para nutrition/rehab/endurance, abrir el paso 3 (`resolveTarget` → `null`).
  Depende de **D10**. Mientras: botón deshabilitado con explicación + «Volver a sembrar» en la misma tarjeta.
  [spec-web-01/EDGE-02/canvas-missed/EDGE-missed]
- [x] W8.1.3 🔴 **Cambiar de persona: memoria de la guía + demo de la rama nueva** — HECHO 22-08 (QA del
  owner: hizo la guía como fuerza, se pasó a rehabilitación y le quedó tildado «Haz el screening de 7
  patrones de Pedro» sin haberlo hecho, apuntando a un Pedro que no existía). Tres piezas:
  1. **Memoria por especialidad**: `onboarding_guide.progress[persona] = { vive_tu_app, first_artifact }`
     (`packages/onboarding/persona-progress.ts`, puro y compartido web↔RN). Al cambiar de rama,
     `archivePersonaGuideProgress` (`services/onboarding/persona-switch.service.ts`) archiva lo hecho en la
     vieja —unión de la señal VIVA y del `completed` ya persistido, por el debounce de 450 ms del
     checklist— y restaura lo de la nueva en `completed` con `false` EXPLÍCITO (es lo único que le gana al
     `localStorage`). Corre ANTES de `saveCoachPersona`: después, `persona_set_at` ya sería el nuevo.
     Pasos 1, 4 y 5 siguen globales.
  2. **Señal viva por rama**: `loadPersonaArtifactScope` corta por el MÁS TARDÍO entre `demo.seededAt + 2 min`
     y `coaches.persona_set_at`, y `resolveFirstArtifact` mira SOLO la tabla de la rama (rehab dejó de
     aceptar `workout_programs`; endurance dejó de aceptarlos y cuenta el perfil cardio de un alumno real o
     el del demo TOCADO tras el corte, que es la tarea guiada «revisa las zonas de Javiera»).
     `resolveViveTuAppOpened` filtra el evento por `created_at >= persona_set_at` y el evento se emite con
     `metadata.persona`.
  3. **Alumno de ejemplo**: `saveMiPanelPersonaAction` y `POST /api/mobile/coach/persona` (rama Mi panel)
     llaman a `reseedDemoForPersonaChange` → borrar + sembrar con aviso («Cambiamos tu alumno de ejemplo:
     ahora es Pedro»); `other` solo borra; sin demo no se resucita nada; si el sembrado falla la persona
     queda guardada igual y el error dice «Volver a sembrar». RN recibe `demo` + `notice` en el POST y
     `onboardingV2.personaProgress` en el dashboard. 30 tests nuevos (`persona-progress`,
     `onboarding-v2.queries`, `persona-switch.service`, `mi-panel.actions`). Falta: aviso en la UI de Mi
     panel web (hoy va dentro de `message`) y QA en device. [EDGE-03]
- [ ] W8.1.4 El demo no se archiva ni se borra por el camino normal: la ficha bloquea archivar/borrar y
  ofrece solo «Borrar ejemplo»; `deleteClientHard` con rama `is_demo` → `deleteDemoStudent` (inventario +
  áreas). Archivarlo hoy dispara `deactivate_archived_client_assignments` sin inverso y deja «Borrar»
  deshabilitado y el re-seed chocando con el auth user. [EDGE-07/EDGE-08/EDGE-missed]
- [ ] W8.1.5 `bodycomp` no gatea nada: o entra en la nav/ficha por dominio (matriz SPEC §2) o se quita el
  switch de Mi panel. Hoy `featureDomain 'bodycomp'` no existe en `@eva/coach-nav` y la ficha decide por
  `enabled_modules.body_composition`. [spec-web-02/canvas-03]
- [ ] W8.1.6 Actividad del demo etiquetada en feed, AreaChart y pulso del dashboard
  (`dashboard.queries.ts:416-433` sin `is_demo`; F1.3 lo delegó a F3.7 y no se hizo). [spec-web-04]
- [ ] W8.1.7 Riel de plantillas por persona con entrada PROPIA (no solo en el vacío first-run, que el demo
  apaga) y Movimiento/Cardio pintando sus 3 plantillas (hoy `templatesForSurface(...)[0]`). [canvas-01/02]
- [x] W8.1.8 HECHO 22-08: `program-assignment-notification.repository.ts` (el demo no entra en la lista de
  destinatarios ⇒ el servicio salta el programa como `program_not_eligible`, sin correo ni push) y los
  crons `checkin-reminder` / `nutrition-reminder` (3 consultas de `clients`) filtran `is_demo = false`.
  Tests del servicio, de la ruta móvil y de candidatos V2 verdes (22). [spec-web-05/db-live-09]
- [ ] W8.1.9 **(absorbida por [vive-tu-app-directo](../vive-tu-app-directo/TASKS.md) W4 — se ejecuta allá)** Panel admin: `admin/(panel)/clients/_actions/client-actions.ts:82-89`, `coach-detail.queries.ts:143-148`,
  `sistema.queries.ts:91` con `is_demo = false` + migración aditiva que reescribe `get_admin_coaches_paginated`
  (`cl.is_demo = false`). Caso LIVE `00109d66`: Free con demo = cupo 1/1, 0 reales. [db-live-01/02, tasks-truth-06]
- [x] W8.1.10 **(26-08 — ejecutada como W3.7 de [flujo-coach-nuevo](../flujo-coach-nuevo/TASKS.md): la bienvenida Free apunta a `/coach/guia`. El D+1 quedó en `/coach/clients?invite=1` por decisión POSTERIOR de FCN W2.5 —la puerta de solicitudes deja de recomendarse—, y el copy por persona + el hook de cancelación al primer alumno real NO se hicieron: viven en W6 de esta misma spec)** Bienvenida Free y D+1 apuntan a `/coach/guia` con copy por persona (`PERSONA_COPY`) y sin
  pitch de nutrición a quien la apagó; cancelar `day2_pro`/`day14_last_call` al primer alumno real (hook
  declarado en embudo W2.10). Acordado con BROCITO: mismas `template_key`. [w6-w7-03/04/19]
- [ ] W8.1.11 Bajos con evidencia: buscador global sin etiqueta demo (`coach-search.service.ts:74`) · FAB del
  dashboard ignora dominios (`DashboardFab.tsx:28-30`) · azul `#1462DC` elegido a mano no tilda el paso 1
  (`hasCustomBrand`) · el gate descarta `?next=` (`proxy.ts:628-641`) · `/vive-tu-app` no ata `c=` al coach ·
  4 escritores read-modify-write de `onboarding_guide` sin lock · voseo en `packages/onboarding/index.ts:201,253` ·
  `alsoOther` (tabla) vs `also_other` (PostHog) · `persona_selected` desde Mi panel sin `changed` en PostHog ·
  `ExpiringPrograms.tsx:32` → `/coach/programs` (404) · `builder_draft_new`/`builder_recent_exercises` globales ·
  `PersonaNudgeCard` solo en la guía (el comentario D8 de `persona.service.ts:38-41` promete dashboard).

### W8.2 — App: W5 es más grande de lo declarado (1 Opus, 1,0 d, OTA)
- [ ] W8.2.1 Tour del builder RN gateado con `tourAutoStartEligible` + clave por coach
  (`program-builder.tsx:1422-1436`, `builder_onboarding_seen_short_v1` sin coachId). [tasks-truth-01/spec-rn-04/17]
- [x] W8.2.2 HECHO 22-08 (QA del owner en device): pantalla `/coach/settings/mi-panel` (especialidad + pregunta 2 +
  «Ordenar mi panel», 5 switches por dominio, «Ver mi guía de inicio» + «Volver a mostrar la guía», «Borrar» /
  «Volver a sembrar» el alumno de ejemplo), entrada «Mi panel» en el hub de Opciones (solo standalone), el chip de
  la guía apunta ahí; `POST api/mobile/coach/demo-student` (re-seed) y `reorderPanel` en `POST …/persona`.
  Pendiente: «Abrir la guía» en Soporte RN. ⚠ El copy de los switches dice la verdad de hoy («por ahora también
  lo oculta en la app de tus alumnos»): D9 = No sigue sin implementar (clave aparte). [spec-rn-03/08/13]
- [ ] W8.2.3 = F5.3 Nav RN por dominio con los 5 dominios sin pasar por `FEATURE_PREFS_ENABLED`
  (`CoachMobileChrome.tsx:95-104`, `api/mobile/config/route.ts:112-113`); dashboard sin «Todo al día. Buen
  trabajo.» con 0 alumnos (`CoachDashboardSections.tsx:1749-1761`); copy «pool» fuera. [spec-rn-02/12/19]
- [x] W8.2.4 HECHO 22-08: BROCITO (`443aa350`) muro de cupo en el alta corta + WhatsApp por persona sin «EVA»;
  onboarding v2: **alta guiada de 3 pasos en RN** (`(tabs)/clientes?invite=1` → `CreateClientModal guided`:
  datos → cómo le llega (WhatsApp/Compartir/Copiar link) → «Así la ve {nombre}» con logo/color/sello;
  `step_completed/first_client` + `invite_sent`), paridad con `AddStudentStepper` web salvo QR (sin dep nativa) y
  correo (lo manda el servidor). [spec-rn-07/tasks-truth-07, QA owner 22-08 hallazgo 5]
- [~] W8.2.5 Telemetría RN — PARCIAL 22-08: `postCoachOnboardingEvent` manda el `stepKey` REAL (parámetro o
  `metadata.step`/`stepKey`, `resolveOnboardingEventStepKey`); RN emite `step_completed/first_artifact` (plantilla
  aplicada) y `first_client` (alta guiada) + `invite_sent`. **Pendiente:** `aha_moment` desde RN; endpoint móvil
  traduce 23505 → `{ok, deduped}`, rate limit y schema `.strict()` para `persist_onboarding_guide`.
  [spec-rn-09/10, db-live-03/missed]
- [ ] W8.2.6 Etiqueta del demo en directorio, ficha y selectores RN (`isDemo` ya viaja en
  `clients-directory.ts:220`); redirect de primera entrada a la guía (`guideSeenAt` sin consumidor de ruta);
  píldora RN mira `isManaged` como el provider. [spec-rn-06/11/missed]
- [~] W8.2.7 = F5.5 + plantillas — PARCIAL 22-08: `GET/POST api/mobile/coach/templates` (catálogo por persona y
  superficie + `applyTemplate`), las rutas RN del paso 3 llevan `?primera=1`, el tab del builder abre
  `FirstTemplateSheet` («Tu primera rutina para {demo}» → aplica → `program-builder` con `GuidedTaskBanner` «en 3
  toques» + «Ver como {demo}»), banners equivalentes en el editor de nutrición V2, movimiento (reporte) y cardio.
  **Pendiente:** vacíos template-first fuera del flujo guiado, tarjetas embebidas en el lienzo del builder,
  DemoCard con KPIs, y sin demo (`other`/borrado) el tab no ofrece nada. [spec-rn-05/canvas-08/09]
- [ ] W8.2.8 QA device F5.7 incluye: back de hardware en persona, rebote del 302 de `/vive-tu-app` a `/c/*`
  (app-link `autoVerify`), píldora vs cápsula minimizada, white-label. [spec-rn-14/18, EDGE-12]

### W8.3 — Datos y backfill D8 (jefe + SQL, 0,3 d)
- [ ] W8.3.1 Backfill D8 vía `applyCoachPersona` (nunca `UPDATE coaches SET persona`): el coach `0c7e265b`
  (qa-embudo, persona por SQL) quedó sin prefs, sin demo y sin evento. Hoy 48/51 sin persona (24 con 0
  alumnos activos ⇒ gate; 24 con alumnos ⇒ píldora; 5 con guía cerrada ⇒ solo Mi panel). Depende de **D9**.
  [db-live-04/05, w6-w7-18]
- [ ] W8.3.2 Los demos comparten dominio `@evatest.cl` con las cuentas QA: documentar en `MANUAL_TASKS` que
  la purga de QA va por lista de correos, nunca por dominio. [EDGE-13]

### W8.4 — Precondiciones de W6 (decisiones + 0,5 d)
- [ ] W8.4.1 **D11** drip por calendario: apagar `scheduleFreeCoachDripSequence` (D6 decía reemplazar) o
  definir convivencia; hoy el D+1 y el trigger «+2 h sin alumno» son el mismo correo con keys distintas.
  [w6-w7-05]
- [ ] W8.4.2 **D12** reloj: cron horario (`vercel.json` solo tiene diarios/semanales ⇒ «+2 h» = «hasta +26 h»)
  + trigger de DB para el aha (hoy solo se calcula cuando el coach abre la guía). [w6-w7-08/10]
- [ ] W8.4.3 Señal de login del alumno (`clients` no tiene ninguna; solo `auth.users.last_sign_in_at`):
  columna aditiva `clients.last_login_at` escrita por el login del alumno, o lectura con service_role en el
  barrido. Sin esto no existe «+48 h el alumno no entró». [w6-w7-09]
  **Nota 26-08 ([flujo-coach-nuevo W0.6](../flujo-coach-nuevo/TASKS.md)): la señal CAMBIA DE NOMBRE — es
  `clients.first_login_at` (PRIMER login, escrito una sola vez con `WHERE first_login_at IS NULL`), no
  `last_login_at`.** Una columna de último login no puede responder «activado dentro de 72 h» ni «+48 h el
  alumno no entró» (el alumno que entró el día 1 y volvió el día 5 desaparecería de la ventana). La columna,
  el servicio y los call sites los implementa FCN W1 (W1.1–W1.4, con [SPEC §5 reglas 1–3](../flujo-coach-nuevo/SPEC.md));
  esta tarea queda en consumir esa columna en el barrido, no en crear una propia.
- [ ] W8.4.4 Rama «sin persona» en todas las plantillas (48/51), exclusión de cuentas de prueba con bypass
  explícito para `qa-free-v3` (F6.3), criterio del corte a 90 d (`created_at` vs `persona_set_at`), WhatsApp
  del owner (**D13**). [w6-w7-12/13/20]

### W8.5 — Precondiciones de W7 (medición, 0,5 d)
- [ ] W8.5.1 Tabla de equivalencias SPEC §10 ↔ código (`onboarding_step_completed`→`step_completed`,
  `demo_student_seeded`→`demo_seeded`, `student_first_workout|intake`→`student_workout_completed`/
  `student_nutrition_intake`, aha viejo `aha_moment/first_checkin` vs nuevo `step_completed/aha`). [w6-w7-16/22]
- [~] W8.5.2 Espejo a PostHog desde `recordOnboardingEvent` (un punto, web y app) + `$set { persona }` en el
  identify: hoy PostHog solo conoce `persona_selected`, no existe ningún insight de activación y nada se
  desglosa por especialidad. [w6-w7-01/02/07]
  **Ejecutada 26-08 como [W0.5 de flujo-coach-nuevo](../flujo-coach-nuevo/TASKS.md)** (el id no se
  renombra): el espejo vive en `persona.service.ts` (`mirrorOnboardingEventToPostHog`, `$set { persona }`
  desde el metadata; `persona_selected` excluido a propósito — sus captures explícitos ya existen y
  ganaron el `$set`). **Pendiente:** «un punto» aún no es verdad — `api/coach/onboarding-events/route.ts:106`
  y `api/mobile/coach/dashboard/route.ts:261` insertan directo sin espejo (los rutea el jefe de VTA
  post-merge de VTA W1, acordado 26-08) + verificación de un evento real en PostHog desde preview.
- [ ] W8.5.3 Cablear o quitar los tipos sin emisor (`invite_link_copied`, `first_module_opened`,
  `invite_whatsapp_opened` → tabla); contrato de `guide_engagement` (0 filas en toda la historia; server
  «sin dedupe» vs cliente «1 por sesión»; `step_key` distinto web/RN). [db-live-06, w6-w7-14/15/23, missed]
- [ ] W8.5.4 Todo insight sobre `coach_onboarding_events` con `created_at >= 2026-08-22` (8.124 filas
  históricas de `step_completed`). [db-live-08, w6-w7-17]

### W8.6 — Docs, deuda y QA automática (0,5 d)
- [ ] W8.6.1 `RESEARCH.md`: archivar los 6 informes del job (`audit-web`, `audit-rn`, `data`, `research-saas`,
  `research-competitors`, `research-personas`) en `docs/research/onboarding-coach-v2-2026-08-21/` + índice de
  `docs/research/README.md` al día; `check-docs.mjs` valida rutas entre backticks. [debt-docs-05/16]
- [~] W8.6.2 **(§5: absorbido por [vive-tu-app-directo](../vive-tu-app-directo/SPEC.md), bloque «Cambio 23-08» ya en la SPEC; quedan §9 y tabla §2)** SPEC §5 (RN abre `/vive-tu-app` en el navegador, no `eva://`), §9 (guía en pantalla propia +
  píldora, no «arriba del home»), tabla §2 (nutrición `also_other` también para rehab/endurance); PLAN con
  el cambio 22-08 y las waves W4.6/W4.7/W8. [debt-docs-03/04, spec-rn-16, spec-web-12]
- [ ] W8.6.3 Canónicos: `PRODUCT_OVERVIEW` (persona, guía, demo, `is_demo` fuera del cupo), `MANUAL_TASKS`
  (D4, QA ×5, D8, purga), `FLOWS_AND_COMPONENTS` (`/coach/guia`, gate, `/vive-tu-app`), `TEST_STATUS` +
  alias `check:guia-visual` en `package.json`, `REDESIGN_FEATURE_MATRIX` y pricing-v3 F4.5 (citan archivos
  borrados). [debt-docs-02/08/09/10/13/15]
- [ ] W8.6.4 E2E: retirar/reescribir `tests/coach-onboarding-dashboard.spec.ts`; Playwright ×5 personas + 4
  tareas guiadas; Maestro base de coach (`testID` en persona/guía/píldora). [debt-docs-01/06, tasks-truth-05]
- [ ] W8.6.5 Deuda: la guía sigue en `dashboard/_lib` (5 imports `../../dashboard`); clave de localStorage
  duplicada en `guide-pill-restore.ts` sin test de contrato; `PERSONA_CHIP_LABEL` duplicado web/RN →
  `@eva/schemas`. [debt-docs-14/missed, spec-rn-20]

### Decisiones del owner que destraban W8 — **decididas el 2026-08-22** («confío en tus decisiones» para el resto)
| # | Decisión | Opciones | Decisión |
|---|---|---|---|
| D9 | ¿La persona apaga módulos también para los alumnos? (`nutrition._enabled` gobierna la app del alumno vía `resolveNutritionDomainEnabled`; latente mientras `FEATURE_PREFS_ENABLED` esté OFF; «reordenar mi panel» en coaches con alumnos los deja sin Nutrición) | A) No: clave aparte solo para el panel del coach · B) Sí, con aviso | **A — No** (owner 22-08) |
| D10 | ¿Qué ve `other` (y el coach sin persona) en el paso 2? | A) demo neutro · B) vista previa del login con su marca, tilde al abrirla · C) guía de 4 pasos | **B** (owner 22-08) |
| D11 | ¿El drip por calendario muere o convive con los triggers? | A) muere (D6) · B) convive con cancelación cruzada | **A — muere** (owner 22-08; D+14 como último toque queda a criterio del jefe) |
| D12 | Reloj de W6 | A) cron horario · B) disparo en línea | **A + B** (owner 22-08) |
| D13 | Insumos humanos: WhatsApp del owner (+7 d), revisión D4 (socio), revisor de pautas/rehab | — | a criterio del jefe; el número se pide cuando la plantilla 5 esté lista |

## Deuda declarada (fuera de v1)
- [ ] Vocabulario global por persona (`personaNoun()` en nav y fichas, web+RN).
- [ ] PDF de la pauta V2 en web (objeción #1 de nutricionistas).
- [ ] Programación grupal (persona «preparador de equipo / box»); integraciones Strava/Garmin; ficha clínica.
- [ ] `register_submitted` en Google OAuth (BROCITO W7).
