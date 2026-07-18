# Unidad: dashboard-shell (key: `dashboard-shell`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = el ARMAZON de la pantalla de dashboard del coach: fetch, orquestacion de secciones, wrapper de scroll/refresh, estados loading/error/vacio. NO el contenido de las secciones (ese es `dashboard-sections`).

## Alcance exacto
- El componente pantalla `CoachHomeScreen` (fetch `getCoachDashboardDataMobile`, `useState` loading/refreshing/data/error/statsOpen, `RefreshControl`, ramas de error) — `apps/mobile/app/coach/(tabs)/home.tsx:24-...` (imports L1-24; `load` cb L36-50; `useEffect` L52-54; ramas loading/error L56+).
- El wrapper de layout de scroll `CoachMainWrapper` (ScrollView + refreshControl + padding) — `apps/mobile/components/coach/CoachMainWrapper.tsx:15-53`.
- **Orden y montaje** de las secciones dentro de home.tsx (que widget va primero, gating por estado del coach). El look de cada widget lo posee `dashboard-sections`.

## webFiles (verdad web, paths verificados)
- Shell/orquestacion: `apps/web/src/app/coach/dashboard/_components/DashboardShell.tsx` (307 L), `DashboardContent.tsx` (46 L), `DesktopBento.tsx`, `DashboardFab.tsx`.
- Pagina RSC + datos: `apps/web/src/app/coach/dashboard/page.tsx` (43 L), `_data/dashboard.queries.ts`, `_data/types.ts`.
- Hooks/lib de layout: `_hooks/useTimeOfDayGreeting.ts`, `_lib/dashboard-design.ts`, `_lib/nextBestAction.rules.ts`.
- Skeleton: `apps/web/src/app/coach/dashboard/DashboardPageSkeleton.tsx`, `loading.tsx`, `error.tsx`.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/app/coach/(tabs)/home.tsx` (pantalla + orquestacion)
- `apps/mobile/components/coach/CoachMainWrapper.tsx` (wrapper scroll/refresh, 71 L)

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/CoachDashboardSections.tsx` → **posee `dashboard-sections`**. home.tsx importa de aqui (`Mobile*` widgets, home.tsx:8-22); consumir, no editar.
- `apps/mobile/lib/coach-dashboard.ts` (`getCoachDashboardDataMobile`, tipo `MobileDashboardData`, home.tsx:23) — capa de datos compartida; si requiere cambio → `cambiosShell`.

## P0 / riesgos conocidos
- **Congelamiento de datos (gotcha 6b):** `CoachHomeScreen` hace fetch propio (`getCoachDashboardDataMobile`) con `useEffect(() => { load() }, [load])` de UN disparo (home.tsx:52-54). Vive en un tab de expo-router (no se desmonta) → al volver de otra tab los KPIs/agenda quedan **CONGELADOS**. **Fix obligatorio:** migrar a `useFocusEffect` (o disparar `load('refresh')` on focus). Verificar que no rompa el `RefreshControl` manual. Esta es la reparacion central de la unidad.
- NO hay sheets @gorhom en esta unidad (los sheets del dashboard —RevenueSheet/ClientStatsSheet— viven en `dashboard-sections`). Sin bomba -999 aqui.
- Estado vacio/error: home.tsx L56-... ya tiene `EvaLoaderScreen` + rama error con `Button`. Verificar copy VERBATIM contra el error/empty web (`DashboardShell.tsx`).

## Componentes a grepear en ola0-hallazgos.json
- `docs/rn-port/ola0-hallazgos.json`: buscar `"CoachSidebar"` (1), `"CoachTopBar"` (1) para el chrome desktop-vs-mobile (referencia de que el shell mobile NO replica sidebar). El grueso del contenido esta en `dashboard-sections`.

## Notas de datos (queries/RPC, claves de dia)
- Fetch unico: `getCoachDashboardDataMobile()` (`lib/coach-dashboard.ts`) — espejo mobile de `dashboard.queries.ts`. Devuelve `MobileDashboardData` (perfil coach, KPIs, focus, agenda, novedades).
- **Claves de dia (gotcha 6d):** cualquier "hoy" (agenda, greeting fecha) DEBE derivarse via `getSantiagoIsoYmdForUtcInstant`, nunca TZ del device ni prefijo UTC. Verificar en la capa de datos.
- El greeting por hora-del-dia (Buenos dias/tardes/noches) lo consume `MobileGreetingHeader` (dashboard-sections) — home.tsx solo pasa `data`.
