# PLAN — Sobre-límite free

## Arquitectura

Dos PRs:
- **PR web → master**: banner + bulk archive + gates API mobile + proxy/suspended + migración (ya aplicada en prod vía MCP; el .sql viaja en el PR para historial).
- **PR RN → rnmobiledenuevo**: hardening login/resume/suspended (llega con la próxima build nativa u OTA JS).

## Capas (respeta pilares)

- DB: solo redefinición de `private.student_write_allowed` (SECURITY DEFINER, search_path=''). Las policies RESTRICTIVE existentes (PR #128) la consumen sin cambios.
- Server: `bulkArchiveClientsAction` en `_actions/clients.actions.ts` espejando `archiveClientAction` (scope + applyClientScope + RLS techo). Conteo activo vía `services/billing/capacity.service.ts` (fuente canónica, `is_archived=false`).
- UI: `OverLimitBanner` client component montado desde el RSC `coach/layout.tsx` (1 query extra React.cache solo standalone). Barra bulk desktop ya existente; modo selección móvil nuevo.
- API mobile: gate central de cliente bloqueado en los `_shared`/`mobile-auth`, 403 `CLIENT_BLOCKED`, sin tocar endpoints coach ni config.

## Decisiones

1. Banner global en layout (no solo dashboard): la presión debe verse en todas las páginas.
2. Recomendación de plan = tier pago más barato de `SALE_TIERS` con `maxClients >= activos` (Starter para 4-10, Pro para 11-30, Elite 31-100).
3. Emails de archivado masivo: fan-out `Promise.allSettled` fire-and-forget (mismo contrato que el individual; no bloquea la UX).
4. Migración aplicada de inmediato (aditiva, guardada, validada tx-rollback): el candado no depende del deploy web.
5. Lecturas RN directas del archivado NO se candan por RLS en esta fase (no-goal): escrituras bloqueadas + re-check en resume + login cierran el hoyo práctico.

## Fases

1. Wave workers (paralela): W1 banner, W2 bulk action+desktop, W3 selección móvil, W4 gates API, W5 proxy+suspended+docs, W6 RN.
2. Juicio del orquestador: diff review por área contra este spec.
3. Gates: `pnpm lint && pnpm typecheck && npx vitest run` (web wt) + `pnpm --filter @eva/mobile exec tsc --noEmit` (RN wt).
4. Commits + push + 2 draft PRs.
