# Flows and Component Map

Ultima modificacion: 2026-05-21 18:25 -04:00

## Zonas de producto

| Zona | Ruta | Actor | Proposito |
|---|---|---|---|
| Public | `/`, `/pricing`, `/legal`, `/privacidad` | Visitante | Landing, precios, legal. |
| Coach | `/coach/*` | Coach | Gestion de alumnos, programas, nutricion, marca y billing. |
| Client | `/c/[coach_slug]/*` | Alumno | App white-label para entrenar, nutricion y check-ins. |
| Org | `/org/[slug]/*` | Owner/admin enterprise | Gestion de gimnasio/academia, coaches y pool de clientes. |
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
| Onboarding org | `/org/[slug]/onboarding` | `OnboardingWizard`, `_actions/onboarding.actions.ts` |

## Flujo: admin interno

| Paso | Ruta/archivo principal | Componentes/actions |
|---|---|---|
| Login admin | `/admin/login` | `AdminLoginForm`, `_actions/login.actions.ts` |
| Panel | `/admin/(panel)/*` | `_data/*.queries.ts`, `_components/*` |
| CRUD global | `coaches`, `clients`, `novedades` | `_actions/*` por modulo |

## Como mantener este mapa

Actualizar este archivo cuando:

- Se cree una ruta nueva.
- Se mueva una action/query importante.
- Cambie el flujo de login/redirect.
- Se agregue un modulo de producto.
