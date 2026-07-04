# Flows and Component Map

Ultima modificacion: 2026-06-15 (media de ejercicios — mirror de thumbnails + recorte de video + player ExerciseVideo)

## Zonas de producto

| Zona | Ruta | Actor | Proposito |
|---|---|---|---|
| Public | `/`, `/pricing`, `/legal`, `/privacidad` | Visitante | Landing, precios, legal. |
| Coach | `/coach/*` | Coach | Gestion de alumnos, programas, nutricion, marca y billing. |
| Client | `/c/[coach_slug]/*` | Alumno | App white-label para entrenar, nutricion y check-ins. |
| Org | `/org/[slug]/*` | Owner/admin enterprise | Gestion de gimnasio/academia, coaches, alumnos, marca, reportes y operacion. |
| Admin | `/admin/*` | EVA interno | Operaciones internas, finanzas, auditoria, sistema. |

## Flujo: coach crea alumno

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Abrir directorio | `apps/web/src/app/coach/clients/page.tsx` | `_data/clients.queries.ts`, `CoachClientsShell`, `ClientsDirectoryClient` |
| Crear alumno | `CreateClientModal.tsx` | `_actions/clients.actions.ts`, `CreateClientSchema` |
| Login inicial alumno | `/c/[coach_slug]/login` | `ClientLoginForm`, `_actions/login.actions.ts` |
| Forzar password/intake | `/change-password`, `/onboarding` | `OnboardingForm`, client login actions |

## Flujo: coach crea/asigna programa

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Abrir builder | `/coach/builder/[clientId]` | `_data/builder.queries.ts`, `WeeklyPlanBuilder` |
| Editar bloques | `components/DayColumn.tsx`, `BlockEditSheet.tsx` | `usePlanBuilder`, `ExerciseBlock` |
| Guardar programa | `_actions/builder.actions.ts` | delega a `services/workout/workout.service.ts` |
| Asignar template | `AssignToClientsDialog.tsx` | `assignProgramToClientsAction` |

## Flujo: alumno entrena

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Dashboard alumno | `/c/[coach_slug]/dashboard` | `WorkoutHeroCard`, `ActiveProgramSection` |
| Ejecutar rutina | `/c/[coach_slug]/workout/[planId]` | `_data/workout-execution.queries.ts`, `WorkoutExecutionClient` |
| Log set | `LogSetForm.tsx` | `_actions/workout-log.actions.ts` |
| Cierre | `WorkoutSummaryOverlay.tsx` | PRs, volumen, resumen |

## Flujo: nutricion alumno

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Ver plan | `/c/[coach_slug]/nutrition` | `_data/nutrition.queries.ts`, `NutritionShell` |
| Marcar comida | `MealCard.tsx`, `MealIngredientRow.tsx` | `_actions/nutrition.actions.ts` |
| Habitos | `HabitsTracker.tsx` | `_actions/habits.actions.ts` |
| Offline sync | `OfflineNutritionQueueSync.tsx` | cola local + server action |

## Flujo: check-in

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Abrir wizard | `/c/[coach_slug]/check-in` | `_data/check-in.queries.ts`, `CheckInForm` |
| Subir fotos | `CheckInForm.tsx` | `_actions/check-in.actions.ts`, bucket `checkins` |
| Coach revisa | `/coach/clients/[clientId]` | `ProfileCheckInSnapshot`, `ProgressBodyCompositionB6` |

## Flujo: enterprise org

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Login org-only | `/org/login` | `OrgLoginForm`, `_actions/login.actions.ts` |
| Dashboard org | `/org/[slug]` | `_data/org.queries.ts` |
| Invitar coach | `/org/[slug]/coaches` | `InviteCoachForm`, `CreateEnterpriseCoachForm`, `_actions/org.actions.ts` |
| Gestionar pool | `/org/[slug]/clients` | `AssignClientSelect`, `AddClientForm`, `_actions/clients.actions.ts` |
| Brand Center | `/org/[slug]/brand` | `EnterpriseComingSoonPage` placeholder, white-label enterprise |
| Asignaciones | `/org/[slug]/assignments` | `EnterpriseComingSoonPage` placeholder |
| Reportes | `/org/[slug]/reports` | `EnterpriseComingSoonPage` placeholder |
| Pagos alumnos | `/org/[slug]/payments` | `EnterpriseComingSoonPage` placeholder, sin cobro in-app |
| Team & Access | `/org/[slug]/team` | `EnterpriseComingSoonPage` placeholder, cuentas enterprise separadas |
| Audit Log | `/org/[slug]/audit` | `EnterpriseComingSoonPage` placeholder |
| Onboarding org | `/org/[slug]/onboarding` | `OnboardingWizard`, `_actions/onboarding.actions.ts` |

## Flujo: admin interno

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Login admin | `/admin/login` | `AdminLoginForm`, `_actions/login.actions.ts` |
| Panel | `/admin/(panel)/*` | `_data/*.queries.ts`, `_components/*` |
| CRUD global | `coaches`, `clients`, `novedades` | `_actions/*` por modulo |

## Flujo: modulos add-on (compra-only — plan estrategia 03)

Los 4 modulos (`cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`) son **add-ons de pago, no self-toggle gratis**. La escritura de `enabled_modules` es **service-role only** (column-level grants; ver CLAUDE.md §Database).

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Ver catalogo (coach) | `/coach/settings/modules` | `_data/modules.queries.ts` (`getModulesContext` — `isTeamManager` solo discrimina el CTA, ya NO habilita edicion), `ModulesForm` **read-only** |
| Copy canonico de modulos | `packages/module-catalog/` | constante pura por `ModuleKey` (`label`/`pitch`/`surfaces`); la RN futura reusa el MISMO paquete (anti-drift) |
| CTA por contexto | `ModulesForm` | standalone → mailto `contacto@eva-app.cl` mientras `SELF_SERVICE_ADDONS_ENABLED=false` (plan 05 lo prende → `/coach/subscription#addons`); team gestor → "Conversemos" mailto; team no-gestor → "pidelo al owner"; telemetria `module_interest_cta_clicked` |
| Activacion override CEO (standalone — WRITE-THROUGH, plan 05 F6.1 / D2) | `/admin/(panel)/coaches` → `CoachEditSheet` | bloque "Modulos habilitados"; `getCoachModulesAction` (on-open) + `updateCoachAction` (hidden `modules_present`) → `syncAdminGrants` crea/cancela filas `coach_addons` `source='admin_grant'` `price_clp=0` (service-role) → el trigger D1 recomputa `coaches.enabled_modules`. **Ya NO escribe el jsonb directo** (lo pisaria el trigger). Audit log `coach.modules_grant`. Teams: `/admin/teams` → `TeamEditSheet` (`teams.enabled_modules`, toggle directo — NO cambia) |
| Activacion self-service (plan 05 billing add-ons) | `coach_addons` + trigger de sync (D1) | preapproval MercadoPago unico cuyo monto = `getCompositeAmountClp(tier, cycle, addons facturables)`; alta mensual = INSERT + PUT del monto; alta trim/anual = pago one-shot prorrateado inmediato (Checkout Pro) + el webhook materializa la fila + PUT desde la renovacion; `billing_snapshots` congela el desglose por cobro (evidencia SERNAC) |
| Resolucion del entitlement (server-side) | `apps/web/src/services/entitlements.service.ts` | `assertModule(db, key, {teamId\|coachId})` — pool manda; kill-switch de operador `EVA_DISABLED_MODULES` por encima del entitlement |
| Nav agrupado | `components/coach/coach-nav.ts`, `CoachSidebar.tsx` | `splitNavItems` → modulos ON bajo divisor "MODULOS" (desktop), al final del scroll (mobile); sin modulos el nav es identico al actual |
| Metricas de add-ons (admin) | `/admin/(panel)/finanzas` → `AddonMetricsSection` | `getAddonMetrics` (service-role): MRR mensualizado (Σ `price_clp` de filas pagas facturables), adopcion por modulo (pagos + cortesias), churn 12 meses. Las cortesias `admin_grant` se reportan aparte (NO entran al MRR) |

## Flujo: cobro compuesto de add-ons (plan estrategia 05)

El coach standalone tiene **un solo preapproval MercadoPago** cuyo monto = base del tier + add-ons facturables. `getCompositeAmountClp` (`services/billing/addons.service.ts`) es el UNICO calculo del monto compuesto (lo consumen create-preference, el PUT, la UI y los tests).

| Paso | Ruta/archivo principal | Detalle |
|---|---|---|
| Alta MENSUAL | `POST /api/payments/addons` → `activateAddonForCoach` | INSERT `coach_addons` (service-role) + PUT del monto compuesto al preapproval; reversion D5 si el PUT falla (borra la fila, el trigger apaga el modulo). Cortesia hasta el corte (`first_charged_at` NULL hasta el 1er cobro) |
| Alta TRIM/ANUAL | `POST /api/payments/addons` → `activateAddonForCoach` | pago one-shot prorrateado INMEDIATO (Checkout Pro clasico, `external_reference = addon_oneshot\|coachId\|moduleKey\|termsVersion`); devuelve `checkoutUrl` SIN crear fila. El webhook del pago aprobado → `materializeAddonFromOneShot` (fila con `first_charged_at` = fecha del pago + PUT desde la renovacion). Abandono = cero filas |
| Baja | `POST /api/payments/addons/cancel` → `requestAddonCancellation` | regla 4 (ya cobrado) → `cancel_pending` + PUT que baja el monto YA + `expires_at` al corte; regla 3 (mensual sin cobrar, compromiso minimo) → `cancel_pending` SIN PUT (el corte lo cobra igual), `expires_at` diferido al 1er cobro |
| Webhook | `app/api/payments/webhook/route.ts` | materializa filas del `external_reference` (preapproval `authorized` + one-shot aprobado); `markFirstCharged` (set-once, mensual); snapshot `billing_snapshots` por cada cobro; evento `updated` = confirmacion del PUT (alerta drift si difiere); rama `expire` → `cancelAllForCoach` |
| Reconcile diario | `app/api/cron/mp-reconcile/route.ts` (`0 10 * * *`) | expira `cancel_pending` vencidos; alerta drift de monto, kill-switch prolongado (`EVA_DISABLED_MODULES` > N dias sobre add-on facturable) y `paused` prolongado (dunning > N dias) |

## Flujo: media de ejercicios (thumbnails durables + recorte de video)

El video de un ejercicio (YouTube) se reproduce en modo "GIF" (silencioso, sin controles, en loop) y honra un recorte opcional `[start, end]`. El thumbnail de la biblioteca se espeja a Storage para durabilidad. Columnas en `exercises`: `thumbnail_url`/`thumbnail_checked_at` (mirror, service-role) + `video_start_time`/`video_end_time` (recorte, user-editable).

| Paso | Ruta/archivo principal | Detalle |
|---|---|---|
| Reproducir video | `components/exercise/ExerciseVideo.tsx` | API JS de YouTube (`youtube-nocookie`); loop del tramo `[start, end]` con `seekTo(start)`. UNICA superficie de reproduccion — reemplaza el iframe a mano en `WorkoutExecutionClient`, `ClientExerciseCatalog`, `ExerciseCatalogClient`, `DraggableExerciseCatalog`. CSP (`vercel.json`): `www.youtube.com` en `script-src` + `youtube-nocookie`/`youtube` en `frame-src` |
| Editar recorte | `app/coach/exercises/_components/ExerciseFormModal.tsx` | campo start/end (m:ss) visible solo si la media es YouTube; cableado a `createExerciseAction`/`updateExerciseAction` (`video_start_time`/`video_end_time`) |
| Render del thumbnail | `lib/youtube.ts` → `exerciseThumbnailUrl` | prioriza `thumbnail_url` (espejo en Storage) sobre el hotlink `img.youtube.com` |
| Mirror del thumbnail | `lib/exercises/thumbnail-mirror.ts` (service-role, best-effort) | descarga `mqdefault.jpg` → `sharp` → webp → bucket `exercise-media` (path `yt/<id>.webp`, dedup por video). Corre sincronico al crear/editar el ejercicio. Evita la degradacion invisible (404 = JPEG gris decodable) si el video upstream se borra/privatiza |
| Backfill / reintento | `app/api/cron/mirror-exercise-thumbnails/route.ts` (`0 4 * * *`, `maxDuration=60`) | espeja existentes y reintenta los que fallaron; cursor `thumbnail_url IS NULL`, reintento cada 7d via `thumbnail_checked_at`. DOS batches: YouTube (poster) + GIF de Storage (`video_url` con `/storage/v1/object/public/`, `.gif` → webp animado estatico a `gifthumb/` via `mirrorAndSaveStorageGifThumbnail`; path derivado por `lib/exercises/storage-gif-thumb.ts`, reusa idempotentemente los objetos del backfill one-time `scripts/mirror-catalog-gif-thumbs.mjs`). Sin el espejo del gif el grid caeria al endpoint render/image de Supabase (cobra por imagen de origen unica/mes) |
| Catalogo | `lib/constants.ts` (`MUSCLE_GROUPS`) | categoria "Movilidad" agregada (13 ejercicios de movilidad/roller reclasificados); 8 ejercicios de cardio globales seedeados (`scripts/seed-cardio-exercises.mjs`) para el modulo cardio out-of-the-box |

## Como mantener este mapa

Actualizar este archivo cuando:

- Se cree una ruta nueva.
- Se mueva una action/query importante.
- Cambie el flujo de login/redirect.
- Se agregue un modulo de producto.
