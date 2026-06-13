# TASKS — movida-team

> Tareas atómicas + DoD. Ver [PLAN](PLAN.md).

## Tareas

- [ ] T1 — Autorear migración 1 (tablas `teams`/`team_members`/`team_audit_logs`, `clients.team_id`, `client_memberships.team_id` + scope `team`, helpers, RLS `team_*`). *(workflow autorear+revisar — en curso)*
- [ ] T2 — Revisión adversarial multi-lente (RLS/recursión/aislamiento, aditivo-safety, postgres-correctness, advisors-hygiene) + síntesis a versión final. *(en curso)*
- [ ] T3 — Guardar migración final como `supabase/migrations/<ts>_team_foundation.sql` (draft hasta aplicar) + seed sintético + `tests/team/team-isolation` SQL.
- [ ] T4 — Decidir vía de aplicación: branch Pro (habilitar branching MCP) **vs** directo-en-prod-aditivo con snapshot. *(decisión usuario)*
- [ ] T5 — Aplicar migración (en branch o prod) vía `apply_migration`.
- [ ] T6 — Seed sintético (`execute_sql`) + correr tests de aislamiento (AC1-AC5).
- [ ] T7 — `get_advisors` security+performance verde (AC6); arreglar lo que aparezca.
- [ ] T8 — **PARAR**: reportar resultados + pedir OK antes de `merge_branch`/prod.
- [ ] T9 — (post-OK) merge/aplicar a prod + snapshot previo + `supabase db pull` + regenerar `database.types.ts`.
- [ ] T10 — `pnpm typecheck`/`test`/`build` verdes; actualizar bitácora del Director.

## Definition of Done

- AC1-AC8 de [SPEC](SPEC.md) verdes (tests de aislamiento + advisors + no-regresión standalone/enterprise).
- Migración aplicada a prod sin tocar data de clientes reales (snapshot tomado).
- `database.types.ts` regenerado y commiteado; repo sin drift vs prod.
- Branch borrado (si se usó); bitácora del Director actualizada.
- `team_id` disponible en `clients`/`client_memberships` + helpers + RLS listos para las specs siguientes (consent, entitlements, áreas).
