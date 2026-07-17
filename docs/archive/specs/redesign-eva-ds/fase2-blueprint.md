# Fase 2 — Shell + Navegación · Blueprint

Decisiones bloqueadas (orquestador):
- **Tab bars = RESTYLE del bar docked actual a tokens DS** (NO el floating-capsule todavía; capsule = follow-up para no churnear offsets/safe-area). Los primitivos Fase 1 `tab-bar.tsx`/`TabBar.tsx` NO se consumen aún en Fase 2.
- **Breakpoint = Tailwind `md` (768px)** para desktop/mobile (NO exact-760). Todo desktop `hidden md:flex`, todo mobile bar `md:hidden` → `<md` byte-idéntico a RN.
- **`prefetch={false}` en CADA `<Link>` de nav** (web). NO tocar `apps/web/src/proxy.ts` (matcher `/(c|e|t)/*` sin prefetch-skip evita 404 de todo el árbol alumno por falta de `x-coach-id`).
- Solo tokens DS (`--surface-card`, `--sport-*`, `--ink-*`, `--border-subtle`, `rounded-card/control`, `font-display/ui`); dark via `.dark`. NO importar el CSS `.dt-*` del diseño (es referencia visual).

## Hechos load-bearing
- Coach nav IA YA medio-hecha: `apps/web/src/components/coach/coach-nav.ts` es la fuente única y ya codifica 10→5 (exercises plegado, brand+billing→`/coach/settings`, support propio, cardio/movement entitled). `CoachSidebar.tsx` ya renderiza core + divider MÓDULOS + bottom bar "4 primarios + Más". → Coach = restyle + topbar + reconcile RN, NO rebuild de IA.
- Alumno nav NO hecho: `ClientNav.tsx` es barra plana scroll-horizontal de hasta 6, SIN "Más". `apps/mobile/app/alumno/(tabs)/_layout.tsx` = 6 Tabs default. → 6→4+Más es net-new.
- Topbar desktop NO existe (net-new).

## Estructura de nav final (item → ruta existente, NO inventar rutas)

### Coach desktop sidebar (CoachSidebar)
Primary: Inicio `/coach/dashboard` · Alumnos `/coach/clients` · Programas `/coach/workout-programs` · Nutrición `/coach/nutrition-plans` · Opciones `/coach/settings`.
Secondary "Más"/footer: Soporte `/coach/support`. Módulos (entitled): Cardio `/coach/cardio` · Movimiento `/coach/movement`.
Team: Opciones→context-aware + Equipo `/coach/team`. Suscripción bloqueada → solo Reactivar `/coach/reactivate` (ya lo maneja `getVisibleNavItems`).

### Coach mobile tab bar (web <md AND RN — deben coincidir)
Primary 4: Inicio `/coach/dashboard` · Alumnos `/coach/clients` · Planes `/coach/workout-programs` · Nutri `/coach/nutrition-plans`. + **Más** (sheet): Opciones, Soporte, Equipo (team), Cardio/Movimiento (entitled).

### Alumno mobile tab bar (web <md AND RN) — NET NEW
Base 4: Inicio `${base}/dashboard` · Plan `${base}/nutrition` (si `showNutrition`) · Aprender `${base}/exercises` · Check-in `${base}/check-in`. + **Más** (sheet):
- Historial `${base}/workout-history`
- Módulos: Movimiento `${base}/movimiento` (si `showMovement`) · Composición `${base}/bodycomp` (si `showBodyComposition`)
- Acciones en sitio que ya viven en ClientNav (NO inventar rutas): Cerrar sesión (`handleSignOut`), Tema (`ThemeToggle`), Colores del coach (`toggleClientBrandColors`), Instalar app (`PwaNavButton`).
- NO existen rutas `/perfil`/`/notificaciones`/`/support` bajo `/c/[coach_slug]`. RN además tiene `perfil` (solo RN).
`${base}` = `basePath ?? /c/${coachSlug}` (sirve `/e`/`/t` rewrites). Si `showNutrition` off → base-3+Más.

## Topbar desktop (Fase 2 minimal)
`apps/web/src/components/coach/CoachTopBar.tsx` (CREATE, `'use client'`):
1. Breadcrumb/sección desde `usePathname()` (2do crumb solo en drill-down ej. `/coach/clients/[id]`).
2. Campana = **reusar `components/coach/NewsBellButton.tsx`** (consume `NewsFeedProvider`, cero data nueva). Quitar la campana duplicada del sidebar desktop foot (dejar la del mobile header).
3. Avatar cuenta → `/coach/settings` (inicial de coachName/coachBrand).
4. Búsqueda global = **stub/placeholder no funcional** (real necesita endpoint; follow-up al ⌘K del directorio). NO hacerla load-bearing.
- `hidden md:flex`; retorna `null` en builder (`pathname.startsWith('/coach/builder')` o `/coach/workout-programs/builder`).
- Props (serializables, del server layout): `{ coachName: string; coachBrand: string; primaryColor?: string }`.

Wiring en `coach/layout.tsx` (LO HACE EL ORQUESTADOR): envolver topbar+main en columna flex-col en el panel derecho:
```
<CoachSidebar .../>
<div className="flex min-w-0 flex-1 flex-col">
  <CoachTopBar coachName=... coachBrand=... primaryColor=... />
  <CoachMainWrapper> {glows} {children} </CoachMainWrapper>
</div>
```
Preserva: `md:flex-row`, props/children/glows de CoachMainWrapper, los selectores `has-[.coach-builder-shell]:*`, el `<style>` de tokens (white-label), NewsFeedProvider, redirect `/login`, force-dynamic.

## Partición de agentes (archivos disjuntos)
- **Agent A — Coach web sidebar + registry.** `apps/web/src/components/coach/CoachSidebar.tsx` + `apps/web/src/components/coach/coach-nav.ts`. Restyle DS + agrupar Soporte/Módulos en footer secundario. coach-nav: solo AGREGAR helper puro (ej. `splitForSidebar`), NO cambiar firmas de `getVisibleNavItems`/`splitNavItems` (unit-tested). MUST PRESERVE: cada `<Link prefetch={false}>`; nav desktop = `<a title={label}>` dentro de `<aside><nav>` (selector E2E) + `data-testid="nav-modules-divider"`; `MOBILE_PRIMARY_KEYS`/`mobileOverflow`/`isMoreActive`; `handleSignOut`→`/login`; WorkspaceSwitcher/NewsBellButton/ThemeToggle; `*-safe` + `--coach-mobile-content-top-offset`; `isBuilder` hide-nav; link "Panel empresa"; `localStorage('sidebar-collapsed')`; `activeColorStyle`/`activeBgStyle` white-label. Si la campana se mueve al topbar, quitar solo la duplicada del foot desktop, dejar la del mobile header.
- **Agent B — Coach web topbar (NEW).** Solo `apps/web/src/components/coach/CoachTopBar.tsx`. Implementar el contrato de props exacto de arriba. Reusa NewsBellButton.
- **Agent C — Alumno web nav.** `apps/web/src/components/client/ClientNav.tsx`. Restyle + 6→4+Más sheet (espejo del `AnimatePresence` sheet del CoachSidebar). MUST PRESERVE: todas las props (`coachSlug, basePath, coachBrand, coachLogoUrl, initialUseBrandColors, showMovement, showBodyComposition, showNutrition`); `base = basePath ?? /c/${coachSlug}`; `prefetch={false}`; `isWorkout` hide (`/workout/`→`hidden md:flex`) + `return null` en login/register/forgot/onboarding; `handleSignOut`→`${base}/login`; `handleToggleBrandColors`+`router.refresh()`; `toggleClientBrandColors`; PwaNavButton; safe-area; active `var(--theme-primary)`; special-cases `isActive` (`workout-history`,`/workout`); Plan tab condicional a `showNutrition`.
- **Agent D — Mobile coach chrome.** `apps/mobile/components/coach/CoachMobileChrome.tsx` + `apps/mobile/app/coach/(tabs)/_layout.tsx`. Restyle DS + reconciliar "Más" (Opciones/Soporte/Equipo/módulos, no labels legacy). MUST PRESERVE: `PRIMARY_TABS=['home','clientes','builder','nutricion']`; `HIDDEN_FROM_OVERFLOW=['ejercicios']`; `useSafeAreaInsets`; protocolo `tabPress`/`navigation.navigate`; `handleSignOut`→`router.replace('/')`; BlurView; todas las `Tabs.Screen` registradas; `headerShown:false`.
- **Agent E — Mobile alumno chrome.** `apps/mobile/app/alumno/(tabs)/_layout.tsx` + `apps/mobile/components/alumno/AlumnoMobileChrome.tsx` (NEW). 6→4+Más (espejo coach docked). MUST PRESERVE: gates `getClientProfile` (`blocked`→`/alumno/suspended`, `forcePasswordChange`→`/change-password`); efectos AppState offline-flush; `headerShown:false`; `workout` como `href:null`; tints theme.

**Orquestador (load-bearing, NO delegado):** `apps/web/src/app/coach/layout.tsx` (insertar columna flex-col + `<CoachTopBar/>`) + `apps/web/src/components/coach/CoachMainWrapper.tsx` (probable no-op; solo si el topbar necesita clearance).

## Riesgos
- Prefetch/proxy 404 (máximo): prefetch={false} siempre, no tocar proxy.ts.
- Header contract alumno: no cambiar `basePath`/`${base}` hrefs (dependen `/e`,`/t`).
- RSC: CoachTopBar `'use client'`, props serializables, dentro de NewsFeedProvider.
- login→dashboard: no alterar redirect/force-dynamic/`<style>` tokens; topbar tolera data mínima del coach.
- Builder/workout hide-nav: CoachTopBar `null` en builder; mantener guards `isBuilder`/`isWorkout`/`has-[.coach-builder-shell]`.
- Safe-area/offsets: restyle docked mantiene `pb-safe`/`--mobile-content-bottom-offset`/`--coach-mobile-content-top-offset`.
- E2E: `aside nav a[title]` + `data-testid="nav-modules-divider"`.
- coach-nav tests: agregar helpers, no mutar contratos.
- RN coach "Más" parity gap: alinear labels lo más posible; hub "Opciones" RN = fuera de scope (parity debt flagged).
