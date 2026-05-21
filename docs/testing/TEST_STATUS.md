# Test Status

Ultima modificacion: 2026-05-21 18:25 -04:00

## Regla

Las carpetas `test-results*`, `playwright-report/` y artefactos locales son generados. No se versionan. El estado valido de pruebas se registra aqui y en documentos de verificacion especificos.

## Ultima matriz validada

| Fecha/hora | Suite | Comando | Resultado |
|---|---|---|---|
| 2026-05-21 17:16 -04:00 | Enterprise + alumno E2E | `npx playwright test tests/workout-flow.spec.ts tests/nutrition-student-smoke.spec.ts tests/checkin-flow.spec.ts tests/enterprise/journey-e2e.spec.ts tests/enterprise/invite-flow.spec.ts tests/enterprise/org-user-auth.spec.ts tests/enterprise/enterprise-coach-flags.spec.ts tests/enterprise/rls-isolation.spec.ts --workers=1 --reporter=list` | OK, 40 passed |
| 2026-05-21 17:17 -04:00 | Web typecheck | `npm run typecheck -w @eva/web` | OK |
| 2026-05-21 17:17 -04:00 | Unit tests | `npx vitest run` | OK, 128 passed, 4 skipped |
| 2026-05-21 17:19 -04:00 | Web build | `npm run build -w @eva/web` | OK, 71 pages |
| 2026-05-21 17:45 -04:00 | Mobile typecheck | `npx tsc --noEmit -p apps/mobile/tsconfig.json` | OK |
| 2026-05-21 17:45 -04:00 | Circular deps | `npx madge --circular --extensions ts,tsx apps/web/src/components` | OK, 0 circular deps |

## Warnings conocidos

| Warning | Estado |
|---|---|
| Next 16 `middleware` convention deprecated | No bloqueante. Migrar a `proxy` luego. |
| Hydration warnings por HTML invalido en dashboard/nutrition | Pendiente de hardening frontend. |
| Recharts dimensions warning en test | Pendiente visual/test environment. |
| Image aspect ratio warning | Pendiente menor. |

## Pendiente de pruebas

1. Correr `npx playwright test --reporter=list` completo.
2. Validar smoke manual de rutas principales con Supabase local:
   - `/login`
   - `/coach/dashboard`
   - `/c/[coach_slug]/login`
   - `/org/login`
   - `/admin/login`
3. Antes de Live/prod:
   - Repetir migraciones en entorno remoto controlado.
   - Configurar env vars/secrets.
   - Smoke test contra deploy Preview o staging.
