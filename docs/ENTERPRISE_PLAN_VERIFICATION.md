# Enterprise Plan Verification

**Ultima modificacion:** 2026-05-21 17:20:28 -04:00  
**Plan fuente:** `ENTERPRISE_PLAN.md`  
**Scope:** ejecucion y validacion de Parte A pendiente + Fases B-1 a B-6 del refactor Enterprise.

## Estado Ejecutivo

Enterprise queda funcional y validado en el bloque critico: schema, JWT hook, RLS, login enterprise, org-only users, flags `org_managed`, fixtures E2E de nutrition/workout/check-in y flujos enterprise principales.

Estado de pruebas al cierre: verde en typecheck, unit, build y bloque E2E Enterprise/alumno. No quedan skips artificiales en los E2E corregidos.

## Cambios Validados

| Area | Estado | Resumen |
|---|---:|---|
| B-1 Schema `organization_members.user_id` | OK | `user_id` agregado como identidad primaria; `coach_id` nullable para org-only users. |
| B-2 JWT hook org-only users | OK | `custom_access_token_hook` soporta coaches y org-only admins con `is_org_user`. |
| B-3 RLS `user_id` | OK | Policies enterprise migradas a `om.user_id = auth.uid()` preservando joins reales por `coach_id`. |
| B-4 Enterprise login | OK | Nueva ruta `/org/login` con server action y redirect a `/org/[slug]`. |
| B-5 Feature flags `org_managed` | OK | Coaches gestionados por org no ven billing/branding; rutas protegidas redirigen. |
| B-6 Seed/tests | OK | Org-only user, tests nuevos, nutrition fixture, workout fixture y storage buckets locales agregados. |

## Registro de Pruebas

| Fecha/hora | Comando | Resultado | Resumen |
|---|---|---:|---|
| 2026-05-21 15:08 -04:00 | `npx supabase db reset` | OK | Migrations enterprise aplicaron y seed cargo. |
| 2026-05-21 15:09 -04:00 | `npm run typecheck -w @eva/web` | OK | TypeScript web limpio tras cambios enterprise. |
| 2026-05-21 15:09 -04:00 | `npx vitest run` | OK | 128 passed, 4 skipped. |
| 2026-05-21 15:10 -04:00 | `npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1` | OK | 13 passed. RLS isolation validado. |
| 2026-05-21 15:11 -04:00 | `npm run build -w @eva/web` | OK | Build Next.js completo. |
| 2026-05-21 15:18 -04:00 | `npx playwright test tests/enterprise/org-user-auth.spec.ts tests/enterprise/enterprise-coach-flags.spec.ts --workers=1` | OK | 6 passed. Org-only auth + flags enterprise validados. |
| 2026-05-21 15:45 -04:00 | `npx playwright test tests/workout-flow.spec.ts tests/nutrition-student-smoke.spec.ts tests/checkin-flow.spec.ts tests/enterprise/journey-e2e.spec.ts tests/enterprise/invite-flow.spec.ts --workers=1 --reporter=list` | OK parcial | 19 passed, 2 skipped antes de correcciones finales. |
| 2026-05-21 16:07 -04:00 | `npx tsc --noEmit` en `apps/mobile` | OK | TypeScript mobile limpio. |
| 2026-05-21 16:41 -04:00 | `npx supabase db reset` | OK | Aplica `20260521000004_storage_buckets.sql` y deja seed limpio. |
| 2026-05-21 17:04 -04:00 | `npx playwright test tests/checkin-flow.spec.ts --workers=1 --reporter=list` | OK | 1 passed. Check-in con fotos valida upload a bucket `checkins`. |
| 2026-05-21 17:09 -04:00 | `npx playwright test tests/workout-flow.spec.ts --workers=1 --reporter=list` | OK | 1 passed. Workout valida overlay final `Sesion completada`. |
| 2026-05-21 17:16 -04:00 | `npx playwright test tests/workout-flow.spec.ts tests/nutrition-student-smoke.spec.ts tests/checkin-flow.spec.ts tests/enterprise/journey-e2e.spec.ts tests/enterprise/invite-flow.spec.ts tests/enterprise/org-user-auth.spec.ts tests/enterprise/enterprise-coach-flags.spec.ts tests/enterprise/rls-isolation.spec.ts --workers=1 --reporter=list` | OK | 40 passed. Bloque Enterprise/alumno completo validado. |
| 2026-05-21 17:17 -04:00 | `npm run typecheck -w @eva/web` | OK | TypeScript web limpio despues de ajustes finales. |
| 2026-05-21 17:17 -04:00 | `npx vitest run` | OK | 128 passed, 4 skipped. Skips pertenecen a suites RLS unitarias condicionadas por entorno. |
| 2026-05-21 17:19 -04:00 | `npm run build -w @eva/web` | OK | Next build production compila y genera 71 paginas. |

## Correcciones Finales

| Archivo | Cambio | Motivo |
|---|---|---|
| `apps/web/next.config.ts` | `allowedDevOrigins: ['127.0.0.1']` | Evita bloqueo HMR/dev resources bajo Playwright local. |
| `supabase/migrations/20260521000004_storage_buckets.sql` | Buckets `checkins`, `org-assets`, `logos` | El flujo check-in con fotos necesitaba bucket local real. |
| `apps/web/src/app/c/[coach_slug]/check-in/_actions/check-in.actions.ts` | Storage usa `createServiceRoleClient()` puro | El upload no debe depender de cookies/RLS de usuario. |
| `apps/web/src/app/c/[coach_slug]/check-in/CheckInForm.tsx` | `useActionState` llamado dentro de `startTransition` | Elimina warning y estabiliza submit client action. |
| `tests/checkin-flow.spec.ts` | Sin skip; valida tres pasos y fotos | Check-in E2E ahora pasa real. |
| `tests/workout-flow.spec.ts` | Limpia Service Workers y acepta cookies | Evita cache PWA vieja y overlay tapado por banner. |
| `tests/enterprise/journey-e2e.spec.ts` | PDF upload valida input oculto y error real | Ya no salta por visibilidad del input. |
| `tests/enterprise/invite-flow.spec.ts` | Elimina assert `expect(visible || true)` | La prueba ahora depende de verificacion DB real. |

## Warnings Observados

| Warning | Impacto | Accion recomendada |
|---|---|---|
| `middleware` deprecated | No bloqueante; build y tests pasan. | Migrar `middleware.ts` a convencion `proxy` en tarea separada. |
| Hydration warnings en dashboard/nutrition (`button` anidado, `div` dentro de `p`) | Riesgo tecnico real; no rompio el bloque E2E validado. | Corregir markup en `HabitsTracker` / `InfoTooltip` y `WorkoutContextBanner`. |
| Recharts width/height `-1`/`0` | Warning visual en entornos de test. | Dar dimensiones minimas a contenedores de charts. |
| Image aspect ratio warning en `/LOGOS/eva-icon.png` | Warning visual menor. | Ajustar CSS para conservar ratio (`width:auto` o `height:auto`). |

## Pendientes

1. Correr `npx playwright test --reporter=list` completo de todo el repo si se quiere certificar mas alla de Enterprise/alumno.
2. Corregir warnings de hidratacion del dashboard/nutrition antes de declarar frontend global 100%.
3. Migrar `middleware.ts` a `proxy` por Next 16.

## Conclusion

`ENTERPRISE_PLAN.md` queda implementado y validado para su scope funcional critico. El bloque E2E Enterprise/alumno esta verde con 40/40, unit/typecheck/build estan verdes. Lo que queda ya no bloquea Enterprise core; pertenece a hardening global del frontend y corrida Playwright completa del repo.
