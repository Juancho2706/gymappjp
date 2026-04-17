# Baseline y presupuestos de performance (navegación)

Este documento acompaña la instrumentación en `src/lib/perf/measure-server.ts`.

## Activar logs en servidor

En `.env.local`:

```bash
PERF_NAV_SERVER=1
```

Reinicia `next dev`. En consola verás líneas `[perf:server] getDirectoryPulse …` y `getCoachDashboardData …` con duración en ms.

## Presupuestos orientativos (ajustar tras medición real)

| Ruta / operación | Objetivo p95 (ms) | Notas |
|------------------|-------------------|--------|
| `getDirectoryPulse` (coach con ~50 alumnos) | &lt; 800 | Antes: N+1 nutrición + N RPC racha |
| `getCoachDashboardData` (total) | &lt; 1200 | Incluye pulse + gráficos datos |
| Transición cliente (click → shell visible) | &lt; 400 percibido | `loading.tsx` + menos prefetch |

## Otras herramientas

- Bundle: `ANALYZE=true npm run build` (si configurás `@next/bundle-analyzer`).
- Lighthouse: rutas `/coach/dashboard`, `/coach/clients`, `/c/<slug>/dashboard`.
- Supabase: logs de queries lentas y tamaño de respuesta REST.
- Smoke Playwright (rutas públicas): `npm run test:e2e -- tests/navigation-perf-smoke.spec.ts` (requiere app en `PLAYWRIGHT_BASE_URL`).

## Migración SQL (pulse + índices)

Aplicar `supabase/migrations/20260417120000_perf_pulse_streaks_and_indexes.sql` en el proyecto Supabase. Define `get_coach_clients_streaks` (depende de `get_client_current_streak`) y añade índices en `workout_logs` y `daily_nutrition_logs`. Tras `EXPLAIN ANALYZE` en consultas críticas, ajustar presupuestos de la tabla superior.

Aplicar además `supabase/migrations/20260417131500_perf_dashboard_sessions_series.sql` para habilitar `get_coach_workout_sessions_30d`. El dashboard coach la usa para construir la serie de 30 días en SQL (con fallback en app si la función no está disponible).

## Smoke autenticado opcional

Para ejecutar navegación secuencial de coach en Playwright:

```bash
PERF_COACH_EMAIL=coach@example.com PERF_COACH_PASSWORD=secret npm run test:e2e -- tests/navigation-perf-smoke.spec.ts
```

## Tags de cache (pulse)

El pulse de directorio usa `unstable_cache` con `revalidate: 60` segundos. Tag: `directory-pulse` (`DIRECTORY_PULSE_CACHE_TAG` en `src/lib/coach/directory-pulse-cache.ts`). Tras mutaciones críticas se puede llamar `revalidateTag('directory-pulse')` desde server actions.
