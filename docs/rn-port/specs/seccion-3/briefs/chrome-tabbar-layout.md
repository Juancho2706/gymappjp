# Unidad: chrome-tabbar-layout (key: `chrome-tabbar-layout`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = el CHROME de navegacion del coach en mobile: la barra de tabs inferior (espejo del sidebar/topbar web) + el layout de grupo `(tabs)` + el sheet de overflow "Mas". El sidebar/topbar web es desktop; en mobile se colapsa a esta tab bar + hub "Opciones".

## Alcance exacto
- `CoachMobileTabBar` — barra inferior custom (deriva items visibles de `getVisibleNavItems` de `@eva/coach-nav`), hub "Opciones", Reactivar, y sheet "Mas" — `apps/mobile/components/coach/CoachMobileChrome.tsx:101-...`; sheet "Mas" en L266 (`<Sheet ... snapPoints={['55%']}>`).
- Layout del grupo `(tabs)`: set fijo de `Tabs.Screen`, `screenOptions` (headerShown:false, sceneStyle), gate de suscripcion (`resolveReactivateRequired` → `/coach/reactivate`) — `apps/mobile/app/coach/(tabs)/_layout.tsx:8-...` (gate L18-30; Tabs L37+).

## webFiles (verdad web, paths verificados)
- `apps/web/src/components/coach/CoachSidebar.tsx` (432 L) — nav lateral desktop (items, orden, gating por modulo).
- `apps/web/src/components/coach/CoachTopBar.tsx` (291 L) — barra superior (busqueda, campana, workspace).
- `apps/web/src/components/coach/CoachMainWrapper.tsx` (81 L) — compositor sidebar+topbar+content.
- Nav compartido: paquete `@eva/coach-nav` (`getVisibleNavItems`) — fuente unica de que items se muestran (gating modulos/workspace/suscripcion). **Logica compartida: no reimplementar.**

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/CoachMobileChrome.tsx` (409 L; `CoachMobileTabBar` + sheet "Mas")
- `apps/mobile/app/coach/(tabs)/_layout.tsx` (layout de tabs + gate suscripcion)

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/CoachSearchPalette.tsx` → posee `chrome-global-search` (la campana/busqueda pueden invocarlo; solo consumir).
- `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx` → posee `chrome-workspace-switcher`.
- `apps/mobile/components/coach/CoachDashboardSections.tsx` (`CoachNewsBell` L1985) → posee `dashboard-sections`.
- `apps/mobile/components/coach/CoachMainWrapper.tsx` → posee `dashboard-shell` (NO confundir con el web homonimo).

## P0 / riesgos conocidos
- **Bomba -999 (gotcha 6a):** el sheet "Mas" usa `<Sheet ... snapPoints={['55%']}>` (CoachMobileChrome.tsx:266) — snapPoint fijo `'55%'`, sin `dynamicSizing`. Es el wrapper `components/Sheet.tsx`. El sheet "Mas" es **CRITICO para el flujo** (unica via a Suscripcion/Check-ins/Mi cuenta/Soporte en mobile). Si falla con containerHeight -999 en el primer present → migrar a `nativeModal`. Verificar en device; si no falla con snapPoint fijo (55% no depende de medir contenido), anotar el riesgo pero puede quedar. **Prioridad: probar el primer present.**
- **Parity debt anotada (regla 2):** el orden del overflow "Mas" NO es 1:1 con web (web pliega Suscripcion dentro de Opciones; RN la deja como screen legacy al final — comentario `_layout.tsx:50-55`). Conservar, es divergencia documentada.
- Gate de suscripcion (`_layout.tsx:18-30`) es funcionalidad RN critica (espejo del middleware web `resolveCoachSubscriptionRedirect`). NO eliminar; respeta gracia y nunca gatea managed (org/team).

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"CoachSidebar"` (1 hit), `"CoachTopBar"` (1 hit) — referencia de como el chrome desktop mapea al mobile. `"CoachGlobalSearch"` (2 hits, L~10079) pertenece a la unidad de busqueda, pero el punto de entrada (icono en la tab bar/topbar) se decide aqui.

## Notas de datos (queries/RPC, claves de dia)
- `getVisibleNavItems` (`@eva/coach-nav`) — deriva items de: modulos habilitados (`enabled_modules`), workspace activo, `subscriptionStatus`. No hay claves de dia.
- `getCoachProfile()` (`lib/coach`) en el gate del layout — devuelve `subscriptionStatus`, `currentPeriodEnd`; `resolveReactivateRequired` (`lib/workspace`) decide el redirect. Ambos compartidos (read-only).
