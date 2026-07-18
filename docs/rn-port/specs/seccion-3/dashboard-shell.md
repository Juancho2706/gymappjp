# SPEC — Unidad `dashboard-shell` (Seccion 3, Dashboard COACH)

> PORT 1:1. Web = fuente de verdad. Cada afirmacion cita `archivo:linea`.
> Alcance: el **armazon** de la pantalla de dashboard del coach (fetch, orquestacion de secciones, wrapper de scroll/refresh, estados loading/error/vacio). El **look de cada widget** lo posee `dashboard-sections` (read-only aqui).
> Archivos PROPIOS: `apps/mobile/app/coach/(tabs)/home.tsx`, `apps/mobile/components/coach/CoachMainWrapper.tsx`.

---

## 0. Arquitectura del armazon (web vs RN)

| Aspecto | Web (verdad) | RN actual |
|---|---|---|
| Punto de entrada | `page.tsx:23` `CoachDashboardPage` (RSC) → `Suspense fallback={<BrandCoachLoadingShell/>}` `page.tsx:30` → `DashboardContent` (RSC) `DashboardContent.tsx:7` | `home.tsx:23` `CoachHomeScreen` (client, expo-router tab) |
| Fetch de datos | Server-side en RSC: `Promise.all([getCoachDashboardDataV2(userId), listUserWorkspacesForRender(userId)])` `DashboardContent.tsx:28-31` | Client-side: `getCoachDashboardDataMobile()` `home.tsx:38` (endpoint `/api/mobile/coach/dashboard` + fallback local `coach-dashboard.ts:766-780`) |
| Render | `DashboardShell` (`'use client'`) recibe `data` ya resuelta como prop `DashboardShell.tsx:43-54` | `CoachHomeScreen` orquesta widgets `Mobile*` de `CoachDashboardSections` `home.tsx:6-19` |
| Layout wrapper | `CoachMainWrapper` (web) `components/coach/CoachMainWrapper.tsx:14` monta `<main>` con scroll interno desktop / window movil | `CoachMainWrapper` (RN) `CoachMainWrapper.tsx:15` monta `ScrollView` + `RefreshControl` |

**Nota de arquitectura (inherente a RN, documentada — no es divergencia a corregir):** la web resuelve datos en el servidor (RSC) y el shell solo pinta; RN debe fetchear en cliente. Por eso RN tiene `loading/refreshing/error` locales (`home.tsx:26-29`) que la web delega a `Suspense`/`error.tsx`.

---

## 1. Orden y montaje de secciones (lo que ESTA unidad posee)

### 1.1 Orden web movil (`DashboardShell.tsx:107-204`, bloque `md:hidden`)
1. `BillingBanners` (funcional) + `FreeTierBanner`/`TeamsBridgeBanner` — en bloque `mb-4 empty:hidden` `DashboardShell.tsx:91-104`.
2. `<header>` fecha + "Hola, {firstName}" + acciones `DashboardShell.tsx:108-157`.
3. `PulseHero` `DashboardShell.tsx:159`.
4. `PriorityCard` (wrap `mb-[22px]`) `DashboardShell.tsx:161-171`.
5. `AgendaCard` (wrap `mb-6`) `DashboardShell.tsx:173-175`.
6. `NewsFeed` (wrap `mb-[18px]`) `DashboardShell.tsx:177-183`.
7. `CoachOnboardingChecklist` (wrap `mt-5`, fuera del bloque movil, compartido con desktop) `DashboardShell.tsx:192-204`.
8. `DashboardFab` (FAB fijo, movil-only) `DashboardShell.tsx:207`.
9. `ClientStatsSheet` `DashboardShell.tsx:209-214` + `WorkspaceSwitchSheet` (solo multi-workspace) `DashboardShell.tsx:216-222`.
   `FreeWelcomeModal` (dentro de `Suspense`) `DashboardShell.tsx:66-68`.

### 1.2 Orden RN actual (`home.tsx:77-155`) — **PARIDAD DE ORDEN OK**
1. `MobileBillingBanners` `home.tsx:89`.
2. `MobileTierUsageBanners` (condicional `showTierBanners`) `home.tsx:90-92`.
3. `MobileGreetingHeader` `home.tsx:95-102`.
4. `MobilePulseHero` `home.tsx:105-110`.
5. `MobileFocusList` (= PriorityCard) `home.tsx:113-119`.
6. `MobileTodayAgenda` (= AgendaCard) `home.tsx:122`.
7. `MobileNovedades` (= NewsFeed) `home.tsx:125`.
8. `MobileOnboardingGuideChip` (= OnboardingChecklist) `home.tsx:128-133`.
9. `MobileClientStatsSheet` `home.tsx:136-140` + `MobileFreeWelcomeModal` `home.tsx:141` + `MobilePublicCodeRequiredModal` `home.tsx:142-146`.
10. `MobileQuickActionsFab` (= DashboardFab), montado FUERA del `CoachMainWrapper` dentro de `<View style={{flex:1}}>` `home.tsx:78,149-154`.

**Veredicto orden:** el orden vertical banners→header→pulse→prioridad→agenda→novedades→onboarding y el FAB fuera del scroll son 1:1 con la web. **No requiere cambio de orden.**

---

## 2. Gating de banners de tier — DIVERGENCIA P1 (umbral)

### Web (`DashboardShell.tsx:98-103`)
```
{subscriptionTier === 'free' && <FreeTierBanner totalClients={data.kpi.totalClients} />}
{subscriptionTier === 'elite' && data.kpi.totalClients >= 80 && <TeamsBridgeBanner totalClients={...} />}
```
- `FreeTierBanner`: barra progreso `used/max` (max = `TIER_CONFIG.free.maxClients`), copy `"{used}/{max} alumnos · Plan gratuito"` `DashboardShell.tsx:262-264`, link `/coach/subscription` texto `"Ver planes →"` / `"Expandir límite →"` (si `full`) `DashboardShell.tsx:275-280`.
- `TeamsBridgeBanner`: umbral **>= 80**, copy `"{totalClients}/{max} alumnos · {pct}% de tu plan Elite"` + `"¿Más de 100 alumnos…? Conoce EVA Teams"` `DashboardShell.tsx:292-297`, CTA `mailto:contacto@eva-app.cl?subject=Quiero%20conocer%20EVA%20Teams` texto `"Conversemos →"` `DashboardShell.tsx:299-303`.

### RN (`home.tsx:73-92`)
```
const showTierBanners = data.coach.subscriptionTier === 'free' ||
  (data.coach.subscriptionTier === 'elite' && data.kpi.totalClients >= 48)
...
{showTierBanners ? <MobileTierUsageBanners coach={data.coach} totalClients={data.kpi.totalClients} /> : null}
```

**DIVERGENCIA P1:** umbral Elite RN **>= 48** (`home.tsx:75`) vs web **>= 80** (`DashboardShell.tsx:101`). Con 48–79 alumnos el coach Elite ve el banner Teams en movil pero NO en web. **Fix:** alinear a `>= 80`. (El copy interno lo posee `MobileTierUsageBanners` en `dashboard-sections`; esta unidad solo controla el `showTierBanners` que decide el montaje → el umbral es propiedad del shell.)

**Nota de forma:** la web separa `FreeTierBanner` y `TeamsBridgeBanner` en dos condicionales; RN los pliega en `MobileTierUsageBanners` con una sola bandera booleana `showTierBanners`. Verificar en `dashboard-sections` que el componente reproduce ambos copies VERBATIM y elige free vs elite internamente. Para free el shell RN siempre monta el banner (bandera true si `subscriptionTier === 'free'`) — paridad con web (free siempre muestra).

---

## 3. Estados: loading / error / vacio

### 3.1 Loading
- **Web:** `loading.tsx:3` → `DashboardPageSkeletonWithShell` → `BrandCoachLoadingShell` (`DashboardPageSkeleton.tsx:3-5`). Ademas `page.tsx:30` envuelve el contenido en `Suspense fallback={<BrandCoachLoadingShell/>}`.
- **RN:** `home.tsx:53-55` `if (loading) return <EvaLoaderScreen subtitle="Cargando tu panel…" />`.
- **Divergencia aceptada:** ambos son loaders brandeados full-screen; distinto componente (skeleton web vs loader RN). No requiere cambio salvo verificar que el subtitle "Cargando tu panel…" no tenga espejo textual en web (web no muestra texto → adaptacion RN admisible, `home.tsx:54`).

### 3.2 Error — DIVERGENCIA P1 (falta accion de reintento)
- **Web (`error.tsx:6-37`, error boundary):**
  - Titulo `"Algo fallo al cargar el dashboard"` `error.tsx:19`.
  - Cuerpo `{error.message || 'Error desconocido. Intenta recargar en un momento.'}` `error.tsx:21-22`.
  - **Boton `"Reintentar"`** con icono `RotateCcw` → `onClick={reset}` `error.tsx:24-32` (rehace el render del segmento).
  - Icono `AlertTriangle` en `text-rose-500` `error.tsx:17-18`.
- **RN (`home.tsx:57-70`):**
  - Rama `if (!data || error)` renderiza `CoachMainWrapper` con una card de error.
  - Titulo VERBATIM `"Algo fallo al cargar el dashboard"` `home.tsx:62`. **OK.**
  - Cuerpo `{error ?? 'Error desconocido. Intenta recargar en un momento.'}` `home.tsx:65`. **Copy fallback VERBATIM OK.**
  - **FALTA el boton "Reintentar".** Ademas el `CoachMainWrapper` de la rama error se monta **sin `refreshControl`** (`home.tsx:59`) → el usuario **no puede recargar** (ni por boton ni por pull-to-refresh). **Fix P1:** agregar accion de recarga (boton "Reintentar" que llame `load('initial')`, y/o pasar un `RefreshControl` a este `CoachMainWrapper`). Sin icono `AlertTriangle`/`RotateCcw` (lucide-react-native) el estado no tiene affordance de recuperacion.
  - **Divergencia menor:** mensajes de origen del error difieren de la web. RN setea `"No se pudo cargar tu perfil de coach."` cuando `next == null` (`home.tsx:40`) y `"No se pudo cargar el dashboard."` en catch (`home.tsx:42`); la web muestra `error.message` crudo. Aceptable (RN no expone mensajes crudos de red).

### 3.3 Vacio
- No hay un estado "vacio" propio del shell (coach sin alumnos): el dashboard siempre renderiza; los widgets manejan su propio empty-state. La web no tiene rama vacia en `DashboardShell`. Paridad: RN tampoco. **Sin cambio.**

---

## 4. Mapa de interacciones (TODOS los tocables — el lente de cableado verifica contra esto)

> Los widgets internos (PulseHero KPIs, filas de agenda/novedades, FAB acciones) exponen sus propios tocables en `dashboard-sections`; aqui se listan **los handlers que el SHELL cablea** (props que `home.tsx` pasa) + los tocables directos del header web que el shell define.

### 4.1 Header (acciones) — 3 DIVERGENCIAS de destino
| Tocable | Web (verdad) | RN actual | Veredicto |
|---|---|---|---|
| Boton **Insights** (icono `Sparkles`) | `onClick={openInsights}` → `setStatsSheetOpen(true)` abre **`ClientStatsSheet`** (bottom-sheet de estadisticas) `DashboardShell.tsx:58,118-125,209-214` | `onInsights={() => router.push('/coach/(tabs)/settings')}` `home.tsx:99` → **navega a Settings** | **DIVERGENCIA P1.** Debe abrir el sheet de stats (`setStatsOpen(true)`), no navegar. En RN el sheet ya existe (`MobileClientStatsSheet` `home.tsx:136`, abierto por `statsOpen`). El header Insights debe hacer `onInsights={() => setStatsOpen(true)}`. |
| Boton **Notificaciones/Campana** (icono `Bell`) | `NewsBellButton` con su **propio Sheet de Novedades** + badge de no-leidos `DashboardShell.tsx:126-131` | `onNotifications={() => router.push('/coach/(tabs)/check-ins')}` `home.tsx:100` → navega a Check-ins | **DIVERGENCIA P1.** Web abre el feed de Novedades (news); RN navega a otra pantalla (Check-ins) — destino distinto. Ademas el "punto rojo" RN (`hasNotifications`) se alimenta de `pendingCount = agenda.length + topRiskClients.length` (`home.tsx:72,98`), mientras que el badge web es el conteo de **novedades no leidas** de `NewsBellButton`. **PENDIENTE-DECISION-CEO:** el gesto RN cambia (navegar vs abrir sheet de novedades). Anotar; no auto-sancionar. |
| **Avatar / workspace** (tile de marca) | Multi-workspace (`workspaces.length > 1`): boton con caret `ChevronDown` → `setWsSheetOpen(true)` abre **`WorkspaceSwitchSheet`** `DashboardShell.tsx:62,135-146,216-222`. Single: `Link href="/coach/settings"` (sin caret) `DashboardShell.tsx:147-154` | `onAvatar={() => router.push('/coach/(tabs)/perfil')}` `home.tsx:101` | **DIVERGENCIA P1.** (a) No hay switcher de workspace ni caret `ChevronDown` (ola0 #9061-9065 lo confirma P2). (b) Single-workspace web va a `/coach/settings`; RN va a `/coach/(tabs)/perfil`. **PENDIENTE-DECISION-CEO** para el destino single. El switcher multi-workspace debe restaurarse si `workspaces.length > 1` (el shell RN hoy ni recibe `workspaces`). |

### 4.2 PulseHero (props que el shell cablea)
| Tocable | Web | RN | Veredicto |
|---|---|---|---|
| KPI **Adherencia** | `onAdherence={openInsights}` → abre `ClientStatsSheet` `DashboardShell.tsx:159` | `onAdherencePress={() => setStatsOpen(true)}` `home.tsx:109` | **OK** (mismo efecto: abre sheet de stats). |
| KPI **Activos** | (el `PulseHero` web define su propio onClick interno; el shell solo pasa `onAdherence`) `DashboardShell.tsx:159` | `onActivosPress={() => router.push('/coach/(tabs)/clientes')}` `home.tsx:107` | Verificar en `dashboard-sections`/web `PulseHero` si Activos navega a clientes en web. RN navega a `/coach/(tabs)/clientes`. Anotado para el lente de `dashboard-sections`. |
| KPI **En riesgo** | idem | `onRiesgoPress={() => router.push('/coach/(tabs)/clientes')}` `home.tsx:108` | idem — verificar destino web en `dashboard-sections`. |

### 4.3 FocusList / PriorityCard (props del shell)
- RN pasa `items=topRiskClients`, `kpi`, `agenda`, `expiringPrograms`, `onAdherencePress={() => setStatsOpen(true)}` `home.tsx:113-119`.
- Web pasa a `PriorityCard`: `items=topRiskClients`, `showNextStep`, `agendaPending=data.agenda.length`, `expiringOverdue=data.expiringPrograms.filter(p => p.daysLeft <= 0).length`, `avgAdherence=data.kpi.avgAdherence` `DashboardShell.tsx:162-170`.
- **Nota para el lente de wiring:** el conteo `expiringOverdue` web se deriva con `filter(daysLeft <= 0)` en el shell (`DashboardShell.tsx:166-168`); RN delega el calculo al widget pasandole `expiringPrograms` completo (`home.tsx:117`). El resultado visible debe coincidir. Propiedad de logica interna del widget (`dashboard-sections`) pero el shell debe pasar los mismos insumos. **OK** (RN pasa `expiringPrograms` + `agenda`, suficiente).

### 4.4 Sheets / modales (cableados por el shell)
| Elemento | Web | RN | Veredicto |
|---|---|---|---|
| `ClientStatsSheet` | `open={statsSheetOpen}` `onOpenChange` + `adherenceStats`/`nutritionStats` `DashboardShell.tsx:209-214` | `MobileClientStatsSheet open={statsOpen} onClose={() => setStatsOpen(false)} clientStats={data.clientStats}` `home.tsx:136-140` | Estructura equivalente. RN pasa `clientStats` unificado (`coach-dashboard.ts:322-348`) en vez de dos arrays. Verificar sheet en `dashboard-sections`. |
| `FreeWelcomeModal` | dentro de `Suspense` `DashboardShell.tsx:66-68` | `MobileFreeWelcomeModal enabled={data.coach.subscriptionTier === 'free'}` `home.tsx:141` | Gating RN por `subscriptionTier === 'free'`; web lo maneja dentro del modal. **OK** — verificar copy en `dashboard-sections`. |
| `WorkspaceSwitchSheet` | solo si `hasMultiWorkspace` `DashboardShell.tsx:216-222` | **AUSENTE** en `home.tsx` | **DIVERGENCIA P1** (ver 4.1 avatar). No hay sheet de workspace en el shell RN. |
| `PublicCodeRequiredModal` | **no existe en web** (feature RN-nativo) | `MobilePublicCodeRequiredModal visible={Boolean(data.publicCode?.shouldConfirm && data.publicCode.inviteCode)} onConfirmed={() => load('refresh')}` `home.tsx:142-146` | **ADITIVO RN** — no eliminar. Documentado como funcionalidad RN existente. |

### 4.5 FAB (`DashboardFab` / `MobileQuickActionsFab`)
- Web `DashboardFab.tsx:27-31`: 3 acciones — `Crear alumno` → `CreateClientModal`; `Importar` → `router.push('/coach/clients')`; `Programa` → `router.push('/coach/workout-programs')`. Sheet titulo `"Acción rápida"` `DashboardFab.tsx:60-62`.
- RN monta `MobileQuickActionsFab clients={data.clientList} onClientCreated={() => load('refresh')} onPaymentCreated={() => load('refresh')}` `home.tsx:150-154`.
- **Nota:** el look/acciones del FAB los posee `dashboard-sections`. El shell RN cablea callbacks de recarga (`load('refresh')`). El FAB RN parece exponer tambien "pago" (`onPaymentCreated`) que el web NO tiene — verificar en `dashboard-sections` (posible aditivo RN). Anotado.

---

## 5. `CoachMainWrapper` (RN) — archivo propio

### 5.1 Estado RN actual (`CoachMainWrapper.tsx:15-52`)
- Props: `children`, `scroll = true`, `refreshControl?` `CoachMainWrapper.tsx:9-15`.
- `bottomPad = insets.bottom + 84` (limpia la capsula de tabs + home indicator) `CoachMainWrapper.tsx:19`.
- `topPad = insets.top + 6` (paga el notch, sin header global) `CoachMainWrapper.tsx:21`.
- Contenido envuelto en `MotiView` fade+translateY (`opacity 0→1`, `translateY 10→0`, `timing 260ms`) `CoachMainWrapper.tsx:24-32`.
- Shell `View flex:1 overflow:hidden` + `AppBackground` `CoachMainWrapper.tsx:35-36,55-58`.
- `ScrollView`: `contentContainerStyle` con `paddingTop=topPad`, `paddingBottom=bottomPad`; `showsVerticalScrollIndicator={false}`, `keyboardShouldPersistTaps="handled"`, `refreshControl` pasado `CoachMainWrapper.tsx:38-45`.
- `styles.scrollContent`: `paddingHorizontal:16` `CoachMainWrapper.tsx:62-66`. `styles.content`: `gap:16` `CoachMainWrapper.tsx:67-70`.

### 5.2 Equivalencia con web `CoachMainWrapper` (`components/coach/CoachMainWrapper.tsx`)
- Web gutter movil: `px-5 py-6` (`web CoachMainWrapper.tsx:64,72`) = 20px horizontal. RN usa `paddingHorizontal:16` (`CoachMainWrapper.tsx:63`). **Divergencia menor de gutter (16 vs 20px).** La web ademas neutraliza su `py-6`/pt-offset con `-mt-6` en el `DashboardShell` (`DashboardShell.tsx:70-86,86`). RN maneja el aire con `topPad = insets.top + 6`. Registrar como P2 (gutter 16→20 para paridad exacta), no bloqueante.
- El `MotiView` fade RN es el espejo del `animate-fade-in` web (`web CoachMainWrapper.tsx:60`). **OK.**
- **Sin header global** en ambos (web comentario `CoachMainWrapper.tsx:7-11`; RN `CoachMainWrapper.tsx:20-21`). **Paridad de decision OK.**
- **PROHIBIDO tocar `global.css`/`tailwind.config`** — `CoachMainWrapper.tsx` RN usa `theme.background` (`CoachMainWrapper.tsx:35`) via token; sin valores crudos nuevos. **OK.**

---

## 6. Queries / datos / claves de dia (gotcha 6d)

- **Fetch unico:** `getCoachDashboardDataMobile()` `coach-dashboard.ts:766` — intenta endpoint `/api/mobile/coach/dashboard` 2 veces (`coach-dashboard.ts:768-778`), y si falla degrada a `getCoachDashboardDataMobileLocal()` (calculo client-side sobre Supabase directo) `coach-dashboard.ts:420-764,779`.
- Espejo mobile de `getCoachDashboardDataV2` (`dashboard.queries.ts:138`). Tipos: `MobileDashboardData` (`coach-dashboard.ts:86-104`).
- **Tablas tocadas (fallback local, `coach-dashboard.ts:440-477`):** `clients` (filtro `coach_id`, `is_archived=false`, `is_active=true`), `workout_plans` (count `coach_id`), `check_ins` (30d), `workout_logs` (30d, limit 500), `workout_programs` (activos, `end_date` en `[hoy-14d, hoy+30d]`, limit 100), `client_payments` (lookback 13 meses), `daily_nutrition_logs`+`nutrition_meal_logs` (7d, `coach-dashboard.ts:537-539`).
- **Limites/ventanas:** riesgo top 5 (`coach-dashboard.ts:584`); expiring `daysLeft <= 3` slice 8 (`coach-dashboard.ts:609-610`); agenda slice 8 (`coach-dashboard.ts:627`); actividades slice 8 (`coach-dashboard.ts:761`); areaData 30d (`coach-dashboard.ts:383`); barData 6 meses (`coach-dashboard.ts:405`). Espejo de web (`dashboard.queries.ts:257,528,534,505,545,584`).

### 6.1 GOTCHA 6d — claves de dia NO usan Santiago (DIVERGENCIA, mayormente fuera del shell)
- El **greeting/fecha** del header lo computa `MobileGreetingHeader` con `new Intl.DateTimeFormat('es-ES', {...}).format(new Date())` `CoachDashboardSections.tsx:1753-1757` → **TZ del device**, no Santiago. La web usa exactamente lo mismo device-local (`todayLabel()` con `new Date().toLocaleDateString('es-ES', ...)` `dashboard-design.ts:37-44`, y `MobileGreetingHeader` es 1:1). **Paridad web↔RN OK**, pero **incumple gotcha 6d** (device TZ). Como `MobileGreetingHeader` es de `dashboard-sections` (read-only), se anota como **riesgo cross-unidad** para ese lente, no se toca aqui.
- La capa de datos `coach-dashboard.ts` deriva dias con `slice(0,10)` sobre ISO UTC (`coach-dashboard.ts:719,387,411`, `logged_at.slice(0,10)`, `created_at.slice(0,7)`) y `startOfDay(new Date())` device-local (`coach-dashboard.ts:136-140,425`) — **NO** usa `getSantiagoIsoYmdForUtcInstant` (que ya existe en `apps/mobile/lib/date-utils.ts:25-28`). El shell (`home.tsx`) no computa dias directamente; consume `data`. **Fix de datos = cambiosShell** (la capa `coach-dashboard.ts` es compartida, listada READ-ONLY en el brief: si se toca → `cambiosShell`). Anotado; no bloquea la reparacion central del shell.

---

## 7. Reparacion central de la unidad — GOTCHA 6b (congelamiento de datos)

### 7.1 Sintoma (confirmado)
`CoachHomeScreen` hace fetch propio con **`useEffect(() => { load() }, [load])` de UN disparo** `home.tsx:49-51`. La pantalla vive en un tab de expo-router (`app/coach/(tabs)/home.tsx`) que **no se desmonta** al cambiar de tab → al volver, KPIs/agenda/novedades quedan **CONGELADOS** con los datos del primer montaje.

### 7.2 Fix obligatorio
Migrar de `useEffect` a **`useFocusEffect`** (patron ya usado en el arbol coach: `app/coach/(tabs)/nutricion.tsx:87-89`, `useFocusEffect(useCallback(() => {...}, [deps]))`).
- **Primer foco:** debe hacer `load('initial')` (muestra `EvaLoaderScreen`, `home.tsx:53-55`).
- **Focos siguientes (ya hay `data`):** debe hacer `load('refresh')` para **no** reemplazar el contenido por el loader full-screen (usa la barra de `RefreshControl` en vez del `EvaLoaderScreen`).
- Patron recomendado:
  ```
  useFocusEffect(useCallback(() => {
    load(dataRef.current ? 'refresh' : 'initial')
  }, [load]))
  ```
  (con un `useRef` que espeje `data`, para no reintroducir `data` como dep y re-disparar en loop).
- **No romper el `RefreshControl` manual** (`home.tsx:80-87`): el `onRefresh={() => load('refresh')}` y los flags `refreshing`/`loading` (`home.tsx:33-34,44-45`) deben seguir intactos. `load` ya distingue `mode` (`home.tsx:32-34`).

### 7.3 Sin bomba `-999` de @gorhom aqui
El brief confirma: NO hay sheets `@gorhom` en esta unidad (los sheets del dashboard —`ClientStatsSheet`/`RevenueSheet`— viven en `dashboard-sections`). El shell solo cablea `open`/`onClose`. **Sin migracion `nativeModal` en esta unidad.** (Gotcha 6a no aplica aqui; si el fallo del `ClientStatsSheet` bloqueara el flujo, es responsabilidad de `dashboard-sections`.)

---

## 8. Hallazgos Ola 0 (grep segun brief)

Grep de `ola0-hallazgos.json` por `CoachSidebar` (1) y `CoachTopBar` (1) — confirman que el **chrome desktop web (sidebar/topbar) NO se replica como tal en el shell mobile**; RN lo traduce a `CoachMobileChrome.tsx` (capsula de tabs), fuera de esta unidad:
- `CoachSidebar` (`ola0` line 10055-10060): `webPath apps/web/src/components/coach/CoachSidebar.tsx` → `mobilePath apps/mobile/components/coach/CoachMobileChrome.tsx`. Montado en `coach/layout.tsx:2` (todas las pantallas). **No es parte de `home.tsx`.**
- `CoachTopBar` (`ola0` line 10063-10068): `webPath apps/web/src/components/coach/CoachTopBar.tsx` → `mobilePath CoachMobileChrome.tsx`; monta `CoachGlobalSearch` (`CoachTopBar.tsx:243`). En movil el header/acciones viven **en cada screen** (aqui: `MobileGreetingHeader`), no en un topbar global.
- Hallazgo P2 relevante al header del shell (`ola0` line 9061-9065): "**Affordance visual de multi-workspace en el avatar (ChevronsUpDown ↕)**" — web `CoachTopBar.tsx:200-202,281-286` + `DashboardShell.tsx:143-145` (chevron `ChevronDown`); RN `CoachDashboardSections.tsx:1823-1830` implementa la logica de `hasMultipleWorkspaces` pero **sin indicador visual ni switcher cableado**. Refuerza la DIVERGENCIA 4.1 (avatar/workspace).

**Conclusion Ola 0:** el shell mobile correctamente NO replica sidebar/topbar; la deuda de multi-workspace del avatar es real y coincide con la seccion 4.1.

## 9. Hallazgos ronda 5
El brief de esta unidad **no** cita tablas r5 especificas para `dashboard-shell`. Sin hallazgos r5 asignados. (Las tablas r5 del dashboard pertenecen a widgets → `dashboard-sections`.)

---

## 10. Estado RN actual — resumen de divergencias (con citas)

| # | Severidad | Divergencia | Web | RN | Accion |
|---|---|---|---|---|---|
| D1 | **P1** | Congelamiento de datos (fetch de un disparo) | RSC re-fetch por request | `useEffect([load])` `home.tsx:49-51` | Migrar a `useFocusEffect` (§7) — **reparacion central** |
| D2 | **P1** | Insights navega en vez de abrir sheet | abre `ClientStatsSheet` `DashboardShell.tsx:58,118` | `router.push('/coach/(tabs)/settings')` `home.tsx:99` | `onInsights={() => setStatsOpen(true)}` |
| D3 | **P1** | Campana: destino distinto | `NewsBellButton` (sheet Novedades) `DashboardShell.tsx:126-131` | `router.push('/coach/(tabs)/check-ins')` `home.tsx:100` | **PENDIENTE-DECISION-CEO** (gesto cambia) |
| D4 | **P1** | Avatar sin switcher de workspace | multi→`WorkspaceSwitchSheet`+caret; single→`/coach/settings` `DashboardShell.tsx:135-154` | `router.push('/coach/(tabs)/perfil')` `home.tsx:101`; sin `workspaces` | Restaurar switcher si `>1`; **PENDIENTE-DECISION-CEO** destino single |
| D5 | **P1** | Error sin reintento ni refresh | boton "Reintentar"+`reset()` `error.tsx:24-32` | card sin boton, wrapper sin `refreshControl` `home.tsx:57-70` | Agregar boton/refresh |
| D6 | **P1** | Umbral banner Teams | `>= 80` `DashboardShell.tsx:101` | `>= 48` `home.tsx:75` | Alinear a `>= 80` |
| D7 | P2 | Gutter horizontal | `px-5` (20px) `web CoachMainWrapper.tsx:64` | `paddingHorizontal:16` `CoachMainWrapper.tsx:63` | 16→20 (opcional paridad) |
| D8 | P2 | Fecha/greeting en TZ device (gotcha 6d) | device-local (paridad) | `Intl…format(new Date())` `CoachDashboardSections.tsx:1753-1757` | cross-unidad (`dashboard-sections`) / capa datos = cambiosShell |

**Aditivos RN a preservar (NO eliminar):** `MobilePublicCodeRequiredModal` (`home.tsx:142-146`), `onPaymentCreated` del FAB (`home.tsx:153`), fallback degradado local de datos (`coach-dashboard.ts:779`).

---

## 11. cambiosShell (archivos ajenos que un fix tocaria)
- `apps/mobile/lib/coach-dashboard.ts` (READ-ONLY del brief): si se corrige gotcha 6d (claves de dia via `getSantiagoIsoYmdForUtcInstant`) → **cambiosShell**, no en esta unidad.
- `apps/mobile/components/coach/CoachDashboardSections.tsx` (posee `dashboard-sections`): la fecha/greeting device-TZ (D8) y el chevron/switcher visual del avatar (D4 visual) se corrigen alli → **cambiosShell / lente dashboard-sections**. El shell aqui solo cablea el `onAvatar`/`onInsights`/`onNotifications` y (nuevo) el estado de `WorkspaceSwitchSheet`.

## 12. GATE
`npx tsc --noEmit` en `apps/mobile` limpio tras cualquier cambio derivado de esta spec (esta unidad = SPEC, sin edicion de codigo).
