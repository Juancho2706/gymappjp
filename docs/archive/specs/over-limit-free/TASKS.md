# TASKS — Sobre-límite free

## Web (PR → master)

- [x] Migración `20260719190000_student_write_gate_blocked_clients.sql` — escrita, APLICADA en prod (2026-07-19) y validada (pausado/archivado-sim=false; activos/sin-fila=true; advisors 0 nuevos).
- [ ] W1: `get-coach.ts` +max_clients · `coach/layout.tsx` conteo standalone + `OverLimitBanner` · fix `FreeTierBanner` conteo real.
- [ ] W2: `bulkArchiveClientsAction(ids[])` + botón "Archivar" en barra bulk `DesktopRosterTable`.
- [ ] W3: modo selección móvil (`ClientsDirectoryClient` + `DirectoryActionBar` + `DirRowCard` + `DirTableMobile`) + barra flotante + confirmación.
- [ ] W4: gate `CLIENT_BLOCKED` en API mobile superficie alumno (`nutrition/_shared`, `nutrition-v2/_shared`, endpoints con `verifyMobileBearer`).
- [ ] W5: proxy `reason=archived|paused` + copy en `suspended/page.tsx` + nota `FLOWS_AND_COMPONENTS.md`.

## RN (PR → rnmobiledenuevo)

- [ ] W6: login rechaza `is_archived` · re-check gate en AppState resume · línea datos-a-salvo en `suspended.tsx`.

## DoD

- [ ] Juicio de diffs contra SPEC (orquestador).
- [ ] `pnpm lint` + `pnpm typecheck` + `npx vitest run` verdes (web wt).
- [ ] `pnpm --filter @eva/mobile exec tsc --noEmit` verde (RN wt).
- [ ] 2 draft PRs abiertos; docs actualizadas; memoria de sesión escrita.
