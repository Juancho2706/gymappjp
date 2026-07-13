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
| Card de ejercicio | `SingleExerciseCard.tsx` | Card 1:1 del bloque suelto (extraída del render inline, prerequisito del stepper); componente puro (sin hooks) que consume `LogSetForm` por serie |
| Log set | `LogSetForm.tsx` | `_actions/workout-log.actions.ts` |
| Teclado numérico | `WorkoutKeypadProvider.tsx` + `NumericKeypadSheet.tsx` | Teclado in-app (solo fuerza) gate `pointer: coarse` (`lib/client/useCoarsePointer.ts`); muta `ref.value` del `<input>` uncontrolled — el objetivo prescrito viaja en el header (`--keypad-h`, `body[data-exec-keypad-open]`) |
| Modo paso a paso | `StepperExecution.tsx` + `lib/workout-stepper.ts` | Pager opt-in "un ejercicio a la vez"; toggle "Lista / Paso a paso" en el header, device-scoped en `localStorage['omni_stepper']` (espejo de `omni_autotimer`) |
| Sustitución máquina ocupada | `_components/SubstituteExerciseSheet.tsx` + `_data/substitution.queries.ts` + `_actions/substitution.actions.ts` + `services/workout/exercise-substitution.ts` | Bottom-sheet con 3-5 alternativas del mismo grupo muscular rankeadas (`rankSubstitutes`, puro/testeado: filtro duro `muscle_group` + `equipment` normalizado por tiers, des-prioriza la máquina ocupada). Swap in-place SOLO de la sesión (el plan NO se toca); persiste `substituted_exercise_id/name/reason` en `workout_logs` (`SUBSTITUTION_REASON='machine_busy'`) — `exercise_id` y las 4 RPCs de progreso intactas |
| Cierre | `WorkoutSummaryOverlay.tsx` | PRs, volumen, resumen |

**Presentación de la exec (`WorkoutExecutionClient`).** El orquestador calcula `sectioned` (secciones → grupos) y renderiza el MISMO card en ambos modos vía `renderGroup(group, { allowCollapse })` — una sola fuente de verdad, cero divergencia:

- **Lista (default):** todos los grupos a la vez; los completados colapsan a `CollapsedExerciseBar`.
- **Paso a paso (opt-in):** `StepperExecution` muestra UN paso a la vez. `lib/workout-stepper.ts` (puro, testeado) aplana `sectioned` en pasos — una **superserie = un paso** (rondas A1→B1 intactas dentro de su `SupersetGroupCard`). Navegación: swipe (framer-motion drag + `touch-action: pan-y`), botones prev/next, rail de progreso navegable; auto-avance suave al completar (reusa `scrollToNextIncomplete`, que en stepper hace `setCurrentStepIndex(stepIndexOfBlock(...))`). A11y: `aria-roledescription="carrusel de ejercicios"`, `aria-label="Ejercicio X de Y"`, `aria-live="polite"`, `useReducedMotion` → crossfade.
- **Fuera del pager** (compartido, no se desmonta al cambiar de paso): `WorkoutTimerProvider`/`RestTimer`, `WorkoutKeypadProvider`, header de progreso y barra fija `.exec-finish-bar`. El motor (logging optimista, cola offline write-through, dedupe, descanso, progresión) vive en `LogSetForm` + handlers del padre — el stepper/keypad son 100% presentación/navegación.
- **Sustitución de máquina ocupada (Fase L · C):** botón "Cambiar" en `SingleExerciseCard` (solo fuerza, ANTES del 1er set logueado del bloque) → `SubstituteExerciseSheet`. Al confirmar, el padre guarda `substitutionByBlock[blockId]` y hace override de `exercise` (id/nombre/gif/técnica pasan al sustituto); el badge "Sustituido · máquina ocupada" + deshacer viven mientras `doneCount === 0`. Guard anti-PR-falso: el `id` override vacía `previousHistory`/`exerciseMaxes` (no "Última vez", no PR inline) y `WorkoutSummaryOverlay` excluye el bloque del máx/1RM (`substitutedBlockIds`). Cada serie logueada agrega los 3 campos al `FormData`/cola offline (opcionales; legacy sigue parseando). Rehidrata desde los logs de HOY tras reload. La ficha del coach lo muestra en `TrainingTabB4Panels` ("Hizo X · sustituyó Y").

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

## Flujo RN: coach revisa ficha y progreso

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Abrir ficha | `apps/mobile/app/coach/cliente/[clientId].tsx` | carga por `useFocusEffect`, scope standalone/team/enterprise explícito |
| Resumen | `OverviewTab.tsx` | cumplimiento, KPI, programa, hábitos, check-in, fotos y biometría |
| Progreso | `ProgresoTab.tsx` | peso/IMC/energía, fotos, historial y bodycomp BIA/ISAK |
| Mutar ficha | `/api/mobile/coach/clients/[clientId]/*` | bearer autoritativo + workspace + ownership/asignación activa |
| Leer/escribir bodycomp | endpoints `bodycomp` mobile + `body-composition.service.ts` | RLS token-scoped, entitlement, consentimiento team, tenant filter y access log |

El workspace elegido se persiste localmente en RN y se adjunta a cada operación.
No existe sincronización server-side del team activo mientras el esquema no
tenga un identificador de team en `workspace_preferences`.

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

## Flujo: busqueda global del topbar coach

Input del topbar (`hidden md:flex`, desktop-only) convertido de cascara a combobox funcional. Dropdown de resultados AGRUPADOS (Alumnos / Programas / Ejercicios / Recetas, cap 5/grupo) que compone las 4 busquedas server-side existentes con el MISMO scope 3-vias vigente (enterprise / team-pool / standalone) — cero politica nueva. El scope se deriva SIEMPRE server-side de la sesion/JWT, jamas del query string.

| Paso | Ruta/archivo principal | Detalle |
|---|---|---|
| UI (combobox APG) | `components/coach/CoachGlobalSearch.tsx` | montado en `CoachTopBar.tsx` (preserva el atajo `"/"` via `inputRef`); ARIA combobox+listbox, teclado ↓/↑/Enter/Escape con `aria-activedescendant` + `scrollIntoView` manual; debounce ~250ms + `AbortController` (cancela el fetch anterior); estados idle/loading/empty/results; resalta el match; dark mode con tokens `--sport-*`/`--surface-*`/`--text-*` |
| Endpoint | `app/api/coach/search/route.ts` (GET `?q=`) | route handler (NO server action — bug Next #76936 con debounce+nav); rate-limit por IP (`rateLimitCoachSearch`, fail-open); identidad+scope server-side (`getCoach` + `getPreferredWorkspaceForRender`); Zod (`q` trim, min 2, max 100) → `q` corto = resultados vacios sin golpear DB |
| Agregador | `services/search/coach-search.service.ts` | `searchCoachWorkspace(supabase, { coachId, scope, query, limitPerGroup=5 })` → `Promise.all` de 4 sub-busquedas con columnas minimas + `LIMIT`; reusa `buildExerciseSearchOr` (ejercicios) y `searchCoachRecipes` (recetas); `href` canonico por grupo. Tests con mock: scope 3-vias, cap, no-fuga cross-workspace, short-circuit |
| Destinos (href) | — | alumno → `/coach/clients/{id}`; programa → `/coach/workout-programs/builder?programId={id}` (plantilla) o `/coach/builder/{clientId}?programId={id}` (asignado); ejercicio → `/coach/exercises?q={name}` (el catalogo pre-carga el filtro via `useSearchParams`); receta → `/coach/nutrition-plans?tab=recipes` (el hub abre la pestana via `useSearchParams`) |

## Como mantener este mapa

Actualizar este archivo cuando:

- Se cree una ruta nueva.
- Se mueva una action/query importante.
- Cambie el flujo de login/redirect.
- Se agregue un modulo de producto.

## Pagos dual-gateway (MercadoPago + Flow/Webpay) — feat/pagos-flow-mercadopago

Puerto `PaymentsProvider` (lib/payments/types.ts) con dos implementaciones: `MercadoPagoProvider` (preapproval, una fase) y `FlowProvider` (DOS fases: enrolar tarjeta por redirect Webpay → crear plan+sub server-side). Seleccion por request via `gateway` (Zod) en create-preference, y por `coaches.subscription_provider` persistido para operar subs vivas (`getPaymentsProviderForCoach`). UI: dos botones detras de `NEXT_PUBLIC_FLOW_ENABLED`. Flujo Flow: `create-preference(gateway=flow)` → enrolamiento Webpay → `/coach/subscription/flow-processing` (poll) → `/api/payments/flow/confirm-enrollment` (Fase 2: crea la sub, Flow cobra la 1ra invoice) → activo. Webhook Flow separado (`/api/payments/flow/webhook`, re-fetch firmado + pipeline agnostico `runWebhookPipeline` compartido con MP). Cambios de monto en Flow = `changePlan` a plan deterministico `eva_<tier>_<cycle>_<montoCLP>` (el monto viaja horneado en el planId). Backstops: cron `flow-reconcile` (alert-only: estado, periodo, drift de monto) + expiry de add-ons multi-gateway en `mp-reconcile`. Detalle completo: `specs/pagos-multigateway-flow/PLAN.md` y RUNBOOK §Pagos Flow.
