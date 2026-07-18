# Resultado port — unidad `dashboard-shell` (Seccion 3, Dashboard COACH)

GATE `npx tsc --noEmit` en `apps/mobile`: **LIMPIO (exit 0)**.

Archivos PROPIOS tocados:
- `apps/mobile/app/coach/(tabs)/home.tsx`
- `apps/mobile/components/coach/CoachMainWrapper.tsx` — **NO tocado** (ver D7).

## Contexto: estado del repo vs la SPEC
La SPEC describe un estado RN previo. El commit `27d94c3c ("revision 1:1 coach completa…")` ya habia
resuelto D2 y D6 y agregado un boton de error. Verifique cada divergencia contra el codigo real antes
de tocar. Cambios efectivos de esta pasada: D1 (central), D5 (refuerzo) y VERBATIM del titulo de error.

## Cambios aplicados

### D1 — Congelamiento de datos (P1, reparacion central) — FIX
Gotcha 6b. `home.tsx` vivia en un tab de expo-router que no se desmonta y hacia `useEffect(() => { load() }, [load])`
de un disparo (KPIs/agenda congelados al volver de otra tab).
- `useEffect` → `useFocusEffect(useCallback(() => { void load(dataRef.current ? 'refresh' : 'initial') }, [load]))`
  (`home.tsx:57-61`), patron recomendado por la SPEC §7.2.
- Nuevo `dataRef = useRef<MobileDashboardData | null>(null)` (`home.tsx:34`) sincronizado dentro de `load`
  (`home.tsx:44`, `dataRef.current = next`) para decidir initial vs refresh sin re-disparar en loop.
- Primer foco / tras error (`data` null) → `load('initial')` = `EvaLoaderScreen` full-screen.
- Focos siguientes (ya hay data) → `load('refresh')` = barra `RefreshControl`, no reemplaza contenido.
- `RefreshControl` manual y flags `refreshing`/`loading` intactos. Import: se elimino `useEffect`, se agrego
  `useRef` (react) y `useFocusEffect` (expo-router). Patron espejo del sibling `nutricion.tsx:173-176`.

### D5 — Error sin reintento ni refresh (P1) — FIX
- El `CoachMainWrapper` de la rama error ahora recibe `refreshControl` (pull-to-refresh, `home.tsx:65-73`).
- Boton "Reintentar" ahora llama `load('initial')` (antes `'refresh'`) → feedback de loader full-screen que
  espeja el `reset()`→Suspense de la web (`error.tsx:24-32`). `home.tsx:101`.
- Agregado `leftIcon={RotateCcw}` al boton para paridad con `error.tsx:30` (web usa `RotateCcw`). El icono
  `AlertTriangle` del card ya existia (`home.tsx:82`, espejo de `error.tsx:18`).

### Rule 5 — Copy VERBATIM del titulo de error — FIX
- Titulo `"No pudimos cargar tu panel"` → **`"Algo fallo al cargar el dashboard"`** (`home.tsx:93`),
  VERBATIM de `apps/web/.../error.tsx:19`. El cuerpo fallback ya era VERBATIM
  (`'Error desconocido. Intenta recargar en un momento.'`, web `error.tsx:22`).

## Verificado ya-correcto (sin cambio, ya en el commit previo)
- **D2** Insights abre el sheet: `onInsights={() => setStatsOpen(true)}` (`home.tsx:116`). Espejo de
  `DashboardShell.tsx:58,118`. OK.
- **D6** Umbral banner Teams `>= 80`: `subscriptionTier === 'elite' && data.kpi.totalClients >= 80`
  (`home.tsx:78-80`). Alineado con `DashboardShell.tsx:101`. OK.
- **Orden de secciones** banners→header→pulse→prioridad→agenda→novedades→onboarding + sheets + FAB fuera del
  scroll: 1:1 con la web (SPEC §1.2). OK.
- **Aditivos RN preservados (NO eliminados):** `MobilePublicCodeRequiredModal` (`home.tsx:180-184`),
  `onPaymentCreated` del FAB (`home.tsx:191`), fallback local degradado de datos
  (`getCoachDashboardDataMobile` → `coach-dashboard.ts`). Intactos.

## PENDIENTE-DECISION-CEO (gesto/flujo cambia — NO auto-sancionado)
- **D3 — Campana/Notificaciones:** web abre un Sheet de Novedades no-leidas (`NewsBellButton`,
  `DashboardShell.tsx:126-131`); el shell RN actual **ya no cablea `onNotifications`** (el header
  `MobileGreetingHeader` es READ-ONLY de `dashboard-sections`). El badge RN se alimenta de
  `topRiskClients + expiringPrograms + pendingCheckinsCount` (`home.tsx:118`), no de novedades no-leidas.
  El gesto (navegar/sheet distinto) sigue divergente. Decidir destino y fuente del badge.
- **D4 — Avatar sin switcher de workspace:** web multi-workspace abre `WorkspaceSwitchSheet` con caret
  `ChevronDown`; single va a `/coach/settings` (`DashboardShell.tsx:135-154`). RN va a
  `/coach/(tabs)/perfil` (`home.tsx:117`), sin switcher ni caret. Restaurar el switcher requiere que la
  capa de datos exponga `workspaces` (hoy no lo hace) + montar `WorkspaceSwitchSheet` + el caret visual en
  `MobileGreetingHeader` (READ-ONLY). NO implementado. Decidir destino single y si se restaura el switcher.

## cambiosShell (archivos ajenos — NO tocados)
- `apps/mobile/lib/coach-dashboard.ts` (READ-ONLY): (a) gotcha 6d — claves de dia por `slice(0,10)` sobre
  ISO UTC y `startOfDay(new Date())` device-local en vez de `getSantiagoIsoYmdForUtcInstant`
  (`date-utils.ts:25-28`) — D8 capa datos; (b) para D4 tendria que exponer `workspaces` al shell.
- `apps/mobile/components/coach/CoachDashboardSections.tsx` (posee `dashboard-sections`, READ-ONLY):
  greeting/fecha en TZ device (`Intl…format(new Date())` ~L1753-1757, D8); caret/switcher visual del avatar
  (D4 visual, ~L1823-1830); Sheet de Novedades de la campana (D3).

## P2 diferido (no bloqueante)
- **D7 — Gutter horizontal 16 vs 20px:** `CoachMainWrapper.tsx:63` usa `paddingHorizontal:16`; web movil
  `px-5` (20px). NO cambiado: `CoachMainWrapper` es compartido por TODAS las pantallas coach (blast radius
  amplio) y la SPEC §5.2/D7 lo marca opcional/no-bloqueante. Si se quiere paridad exacta, es un cambio
  transversal a coordinar, no de esta unidad.

## Gotchas de clase
- 6a (@gorhom -999 → nativeModal): **N/A** — no hay sheets @gorhom en el shell (SPEC §7.3). Sin migracion.
- 6b (fetch congelado → useFocusEffect): **APLICADO** (D1).
- 6c (estilos por focus en wrapper de TextInput): N/A — no hay TextInput en el shell.
- 6d (claves de dia Santiago): fuera del shell (capa datos + greeting header) → cambiosShell, anotado.
- 6e (identifier estable de notificaciones locales): N/A.
