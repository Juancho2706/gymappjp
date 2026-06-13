# Flows and Component Map

Ultima modificacion: 2026-05-21 18:25 -04:00

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
| CTA por contexto | `ModulesForm` | standalone → mailto `contacto@eva-app.cl` mientras `SELF_SERVICE_ADDONS_ENABLED=false` (plan 05 lo prende → `/coach/subscription#modulos`); team gestor → "Conversemos" mailto; team no-gestor → "pidelo al owner"; telemetria `module_interest_cta_clicked` |
| Activacion HOY (override CEO) | `/admin/(panel)/coaches` → `CoachEditSheet` | bloque "Modulos habilitados"; `getCoachModulesAction` (on-open) + `updateCoachAction` (hidden `modules_present`) → escribe `coaches.enabled_modules` (service-role) + audit log. Teams: `/admin/teams` → `TeamEditSheet` (`teams.enabled_modules`) |
| Activacion MAÑANA (self-service) | plan 05 billing add-ons | preapproval MercadoPago + `coach_addons` + trigger de sync (write-through); el override CEO se re-modela como `source='admin_grant'` |
| Resolucion del entitlement (server-side) | `apps/web/src/services/entitlements.service.ts` | `assertModule(db, key, {teamId\|coachId})` — pool manda; kill-switch de operador `EVA_DISABLED_MODULES` por encima del entitlement |
| Nav agrupado | `components/coach/coach-nav.ts`, `CoachSidebar.tsx` | `splitNavItems` → modulos ON bajo divisor "MODULOS" (desktop), al final del scroll (mobile); sin modulos el nav es identico al actual |

## Como mantener este mapa

Actualizar este archivo cuando:

- Se cree una ruta nueva.
- Se mueva una action/query importante.
- Cambie el flujo de login/redirect.
- Se agregue un modulo de producto.
