# Sprint 5 - Bug Triage Board

## Objetivo
Cerrar backlog QA residual de Sprint 4 antes de escalar beta.

## Estados
- `new`
- `triaged`
- `fixing`
- `qa`
- `done`

## Severidad
- **P0:** bloquea login/registro/pagos.
- **P1:** bloquea activacion coach en primeras 24h.
- **P2:** UX/performance no bloqueante.

## Backlog inicial

| ID | Severidad | Estado | Area | Hallazgo | Evidencia |
|---|---|---|---|---|---|
| S5-BUG-001 | P1 | triaged | Performance | `/pricing` reporto `NO_LCP` en una corrida Lighthouse. | `docs/ENG-119-LIGHTHOUSE.md` |
| S5-BUG-002 | P1 | triaged | Performance | `/c/[slug]/dashboard` performance 56 (<90 target maestro). | `docs/ENG-119-LIGHTHOUSE.md` |
| S5-BUG-003 | P2 | triaged | Accessibility | `/` con A11y 88 (<90 target maestro). | `docs/ENG-119-LIGHTHOUSE.md` |
| S5-BUG-004 | P2 | triaged | Ops | Warnings de lint en job `quality` (sin error) a limpiar por lotes. | GitHub Actions `quality` annotations |

## Cadencia diaria de cierre
1. Triage 09:00.
2. Fixes de P0/P1 en bloques.
3. QA 16:00 (lint/typecheck/vitest/playwright).
4. Actualizacion de estado en este documento y en PRs.

## Checklist de validacion por bug
- `npm run lint`
- `npm run typecheck`
- `npx vitest run`
- `npx playwright test`
- Re-test manual de flujo afectado.
