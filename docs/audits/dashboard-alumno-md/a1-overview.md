# 1. Vision general, arquitectura, carga de datos y white-label

> Auditoria del DASHBOARD DEL ALUMNO de EVA. Ruta: `/c/[coach_slug]/dashboard`. Mismas pantallas para alumno standalone, de team (`/t/[team_slug]/*`) y enterprise (`/e/[org_slug]/*`); cambia solo la marca. Es el home diario del alumno = la superficie de RETENCION mas importante de la app.

---

## 1.1 Que es el dashboard del alumno y su rol

El dashboard es el **home diario** al que llega el alumno al abrir la PWA (o tras login). Es la primera pantalla post-autenticacion del arbol de cliente (`/c/[coach_slug]/*`), y su funcion de negocio es la **retencion**: muestra de un vistazo el estado del dia (entrenamiento, nutricion, check-in pendiente), el progreso (racha, peso, records, cumplimiento) y los accesos rapidos a registrar actividad. La racha (`StreakWidget`) y el saludo personalizado (`ClientGreeting`) son los ganchos emocionales; el cumplimiento/anillos y el grafico de peso son la evidencia de progreso.

La misma URL fisica (`/c/[coach_slug]/dashboard`) sirve a tres contextos, diferenciados solo por la marca que pinta el proxy:
- **Standalone**: alumno de un coach individual. Base path `/c/[coach_slug]`.
- **Team**: alumno de un pool plano de coaches. El proxy `/t/[team_slug]/*` reescribe internamente a `/c/[coach_slug]/*` y reenvia la marca del TEAM en headers. Base path `/t/[team_slug]`.
- **Enterprise**: alumno de una org. El proxy `/e/[org_slug]/*` reescribe a `/c/[coach_slug]/*` con la marca de la org. Base path `/e/[org_slug]`.

---

## 1.2 Arquitectura por capas (Clean Architecture + Module Pattern)

El dashboard respeta el data flow obligatorio del proyecto:

```
page.tsx (RSC)
  -> _data/dashboard.queries.ts (React.cache queries)
     -> infrastructure/db/*.repository.ts  (ej. findDashboardClientById)
     -> services/  (ej. movement/bodycomp/feature-prefs services para el nav)
     -> RPCs Supabase SECURITY DEFINER (ej. get_client_current_streak)
        -> Supabase (PostgreSQL + RLS)
```

Archivos clave:
- **`apps/web/src/app/c/[coach_slug]/dashboard/page.tsx`** — RSC orquestador. Resuelve auth/guards, carga el perfil del cliente, decide el contexto white-label/team, y compone las secciones en `Suspense`.
- **`apps/web/src/app/c/[coach_slug]/dashboard/_data/dashboard.queries.ts`** — todas las queries `React.cache` (deduplicadas por request). Es el unico modulo `_data/` del dashboard. Mezcla acceso directo a Supabase (la mayoria), una llamada al repository (`findDashboardClientById`) y RPCs.
- **`apps/web/src/app/c/[coach_slug]/dashboard/_components/*`** — componentes de presentacion (mezcla de RSC async que vuelven a llamar a `dashboard.queries` y de `'use client'`).
- **`apps/web/src/app/c/[coach_slug]/layout.tsx`** — layout de marca (`ClientBrandLayout`) que envuelve TODO el arbol de cliente: inyecta el tema white-label (variables CSS), el nav (`ClientNav`), banners (`AppDownloadBanner`), y los guards de modulo del nav. El dashboard hereda de aqui el chrome.

**Nota de patron:** varias `dashboard.queries` NO pasan por la capa repository — leen Supabase directo desde `_data/` (ej. `getDashboardStreak`, `getLastCheckIn`, `getActiveProgram`, `getActiveNutritionPlan`, etc.). El unico que delega a `infrastructure/db` es `getClientProfile` via `findDashboardClientById`. Esto es una desviacion parcial del pilar Clean Architecture documentado, a tener en cuenta en el rediseño.

---

## 1.3 Carga de datos del page.tsx (RSC) — flujo de arranque

`ClientDashboardPage({ params })` ejecuta en este orden:

1. **`const { coach_slug } = await params`** — el slug de la ruta.
2. **`const base = await getClientBasePath(coach_slug)`** — resuelve el base path (ver §1.7). Se usa para los `redirect` de guard.
3. **`const user = await getClientDashboardUser()`** — root de auth (ver §1.6). Si `!user` → `redirect(`${base}/login`)`.
4. **`const { client } = await getClientProfile(user.id)`** — perfil del cliente + marca anidada del coach. Si `!client` → `redirect(`${base}/login`)`.
5. **`const announcements = client.org_id ? await getActiveOrgAnnouncements(client.org_id) : []`** — anuncios de org (solo si el alumno pertenece a una org).
6. Lee headers del proxy para resolver white-label/team (ver §1.8).
7. Compone `beforeSidebar`, `sidebarMobile`/`sidebarDesktop`, `afterSidebar` y renderiza `DashboardPullToRefresh > DashboardShell + WelcomeModal`.

> El page hace **dos cargas bloqueantes en serie** antes de renderizar nada: `getClientDashboardUser()` (auth) y `getClientProfile(user.id)` (perfil + marca). `getActiveOrgAnnouncements` es la tercera (condicional). El resto de los datos se cargan dentro de las secciones envueltas en `Suspense`, en paralelo via streaming.

---

## 1.4 Inventario completo de queries de `dashboard.queries.ts`

Todas son `cache()` de React (dedupe por request) salvo las funciones puras de transformacion. Enumeradas como aparecen en el codigo:

| Query / funcion | Tipo | Que carga / calcula | Tabla / RPC | Ventana |
|---|---|---|---|---|
| `getClientDashboardUser` | alias de `getClientRootUser` | id + email del alumno autenticado | `auth.getClaims()` (JWT local) | — |
| `getClientProfile(userId)` | cache | `{ client }`: id, full_name, coach_id, org_id + marca anidada `coaches` | repo `findDashboardClientById` → `clients` + join `coaches` | — |
| `getDashboardStreak(clientId)` | cache | racha de dias consecutivos (entero) | RPC `get_client_current_streak` | 730 dias |
| `getLastCheckIn(clientId)` | cache | ultimo check-in: id, weight, energy_level, date, created_at | `check_ins` | 1 fila, orden por `date` desc |
| `getCheckInHistory30Days(clientId)` | cache | check-ins de 30d (peso/energia) | `check_ins` | 30 dias sobre `date` |
| `getActiveProgram(clientId)` | cache | programa activo + planes + bloques + ejercicios anidados | `workout_programs` (is_active) | — |
| `getClientWorkoutPlans(clientId)` | cache | planes sueltos y de programa (lista) | `workout_plans` | todos, orden assigned_date desc |
| `getWorkoutPlanBlocksForHero(clientId, planId)` | cache | bloques de un plan especifico para el hero | `workout_plans` + `workout_blocks` | 1 plan |
| `getRecentWorkoutLogs(clientId)` | cache | logs de series (peso/reps) | `workout_logs` + `workout_blocks!inner` | 30 dias, limit 200 |
| `getWorkoutHistoryLogsFull(clientId)` | cache | logs crudos para historial completo | `workout_logs` | 365 dias, limit 8000 |
| `buildWorkoutLogDaySummaries(logs, opts)` | **funcion pura** | agrupa series por dia calendario (Santiago) | — | — |
| `getWorkoutHistoryDayCounts(clientId, daysBack)` | cache | conteo de series por dia agregado en DB | RPC `get_client_workout_day_counts` | `daysBack` |
| `getActiveNutritionPlan(clientId)` | cache | plan nutricional activo (cal + macros target) | `nutrition_plans` (is_active) | — |
| `getTodayNutritionBundle(clientId, planId, todayISO)` | cache | log diario de hoy + comidas + swaps + alimentos | `daily_nutrition_logs` + `nutrition_meals` (paralelo) | hoy |
| `getPersonalRecords(clientId)` | cache | hasta 5 records recientes (peso max nuevo) | `workout_logs` + `workout_blocks` + `exercises` | reciente 14d vs historico 3000 |
| `getActiveOrgAnnouncements(orgId)` | cache | anuncios activos de la org (max 5) | `org_announcements` | activos / vigentes |
| `getNutritionLogDays30(clientId)` | cache | nro de dias con al menos un log de nutricion (engagement) | `daily_nutrition_logs` | 30 dias |
| `getNutritionAdherenceInputs30d(clientId)` | cache | plan + logs 30d crudos para el motor `computeNutritionAdherence` (cumplimiento real) | `nutrition_plans` + `daily_nutrition_logs` | 30 dias |

> Detalle de los algoritmos (racha, records, cumplimiento, peso, conteos) se documenta en las secciones de paneles y backend; aqui solo el inventario y de donde sale cada dato.

**Helper interno `parseISOAnchor(iso)`:** convierte `YYYY-MM-DD` a un `Date` anclado al **mediodia local** (`12:00:00`) para que las restas con `subDays` no salten de dia por DST/UTC. Lo usan casi todas las ventanas de tiempo.

---

## 1.5 Composicion del render — `DashboardShell` (orden de secciones, layout, Suspense/streaming)

El page arma cuatro slots y los pasa a `DashboardShell`:

**`beforeSidebar`** (orden de aparicion, columna principal arriba):
1. `OrgAnnouncementBanner` (solo si `announcements.length > 0`, NO en Suspense — ya viene resuelto del page).
2. `<Suspense fallback={DashboardHeaderSkeleton}>` → `DashboardHeader` (saludo + racha + ajustes).
3. `<Suspense fallback={CalendarSkeleton}>` → `WeekCalendar`.
4. `<Suspense fallback={CheckInSkeleton}>` → `CheckInBanner`.
5. `<Suspense fallback={HeroAndComplianceSkeleton}>` → `HeroAndComplianceGroup` (hero del entrenamiento de hoy + anillos de cumplimiento).

**`sidebarMobile` / `sidebarDesktop`** — ambos son el MISMO componente `DashboardSidebarBlocks userId coachSlug`. Se renderiza dos veces (una visible en `< md` debajo del hero, otra en `aside` sticky en `>= md`); los datos se deduplican por `cache()` (mismo request, misma identidad de funcion → una sola query por bloque).

**`afterSidebar`** (columna principal, debajo del sidebar mobile):
1. `<Suspense fallback={ProgramSkeleton}>` → `ActiveProgramSection`.
2. `<Suspense fallback={HistorySkeleton}>` → `RecentWorkoutsSection`.
3. `<Suspense fallback={WeightChartSkeleton}>` → `WeightFullChartSection`.

**Layout de `DashboardShell` (solo funcional, sin estilos):**
- Contenedor `min-h-dvh` (respeta viewport movil), ancho maximo centrado.
- Grid de **una columna en movil**; en `>= md` pasa a **dos columnas**: columna principal (`minmax(0,1fr)`) + sidebar fija (`280px` en md, `300px` en lg).
- Estructura del DOM dentro del grid:
  - Columna principal (`min-w-0 space-y-4`): `{beforeSidebar}` → bloque `md:hidden` con `{sidebarMobile}` → `{afterSidebar}`.
  - `<aside>` (`hidden md:flex`, sticky en `md:top-6`): `{sidebarDesktop}`.

> Patron de streaming: cada seccion del dashboard es un RSC async envuelto en su propio `Suspense` con un skeleton dedicado (importados de `_components/dashboard-skeletons`). El shell se pinta de inmediato con los skeletons; cada seccion resuelve su query y se hidrata cuando esta lista. Esto es clave para retencion percibida (no hay pantalla blanca). El `DashboardHeader`/perfil tambien tiene Suspense aunque el page ya cargo `getClientProfile` — la dedupe por `cache()` evita la doble query.

---

## 1.6 Root de autenticacion y guards de acceso

**`getClientDashboardUser = getClientRootUser`** (alias literal en `dashboard.queries.ts`). Definido en `apps/web/src/app/c/[coach_slug]/_data/client-root.queries.ts`:

```ts
export const getClientRootUser = cache(async () => {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()   // verificacion LOCAL del JWT (ES256 + JWKS)
    const c = data?.claims
    if (!c?.sub) return null
    return { id: c.sub, email: typeof c.email === 'string' ? c.email : null }
})
```

- Usa `getClaims()` (verificacion local del JWT, sin round-trip a GoTrue `/user`). El proxy ya valido/refresco la sesion antes del render. Es la **raiz de auth de LECTURA** del nav y los guards del alumno; `getUser` se reserva para mutaciones (check-in, etc.).
- Es el **mismo identity** de funcion que el nav usa → comparte la entrada `React.cache` → un solo round-trip por render (optimizacion DB-perf 2026-06-16, documentada en el codigo).

**Guards de acceso en capas:**
1. **Proxy (`proxy.ts`, defensa primaria):** para rutas `/c/*` que no son login, si `!user` → redirect a `/c/[slug]/login`. Luego verifica que el `user` sea un `client` de ESE coach (match `coach_id === coach.id`) **o** miembro activo de la org del coach (`isCoachActiveOrgMember`). Si no es cliente → redirect a login. Inyecta `x-coach-id` y los headers de marca.
2. **Layout (`ClientBrandLayout`):** si `!coachId` (header `x-coach-id` ausente) → `redirect('/not-found')`. Resuelve los gates de modulo del nav (movimiento, bodycomp, nutricion).
3. **Page (`ClientDashboardPage`):** doble guard — `if (!user) redirect(login)` y `if (!client) redirect(login)`. Defensa en profundidad por si el proxy no corrio (el page no asume que el proxy ya filtro).

> El acceso cross-tenant a datos sensibles del propio dashboard tambien esta endurecido a nivel DB: la RPC `get_client_current_streak` (racha) tiene **IDOR guard** — solo devuelve datos si `p_client_id` es el propio `auth.uid()`, un alumno del coach que llama, o un alumno del pool; service-role (auth.uid() NULL) bypasea para el path mobile/admin. Mismo guard en `get_clients_last_workout_date`.

---

## 1.7 Base path (`getClientBasePath`) — links y redirects multi-contexto

`apps/web/src/lib/client/base-path.ts`:

```ts
export async function getClientBasePath(coachSlug: string): Promise<string> {
    const h = await headers()
    return h.get('x-client-base-path') || `/c/${coachSlug}`
}
```

- Espejo server-side del hook cliente `useBasePath` (provisto via `BasePathProvider` en el layout).
- Devuelve el header `x-client-base-path` que setea el proxy cuando el arbol se sirve bajo `/e/[org_slug]` (enterprise) o `/t/[team_slug]` (team) — el proxy reescribe a `/c/[coach_slug]` pero conserva el prefijo visible. Standalone → cae al default `/c/${coachSlug}` (byte-identico).
- El page lo usa para construir los `redirect(`${base}/login`)`: asi un alumno de team rebota a `/t/[slug]/login`, no a `/c/[slug]/login`. Las secciones del dashboard que generan links internos reciben `coachSlug` y/o leen el base path para mantener el prefijo correcto.

---

## 1.8 White-label / team — marca, supresion de WelcomeModal, colores

El page resuelve el contexto leyendo headers del proxy:

```ts
const useBrandColorsStr = headersList.get('x-client-use-brand-colors')
const initialUseBrandColors = useBrandColorsStr ? useBrandColorsStr === 'true' : true

const basePath = headersList.get('x-client-base-path') ?? ''
const isTeamContext = headersList.get('x-workspace-brand-source') === 'organization' || basePath.startsWith('/t')
const headerTeamBrandName = headersList.get('x-coach-brand-name')

const greetingBrandName    = isTeamContext ? headerTeamBrandName : coachBranding?.brand_name
const greetingWelcomeMessage = isTeamContext ? null : coachBranding?.welcome_message
const welcomeModalEnabled  = isTeamContext ? false : (coachBranding?.welcome_modal_enabled ?? false)
```

**Por que el doble origen de marca (`coaches` anidado vs header):**
- `getClientProfile` trae la marca PERSONAL del coach asignado anidada en `client.coaches` (brand_name, primary_color, logo_url, welcome_message, welcome_modal_*).
- En **pool/team** (y enterprise), el proxy reescribe `/t` o `/e` → `/c` y reenvia la marca del TEAM/ORG en `x-coach-brand-name` con `x-workspace-brand-source='organization'`. La fila `coaches` anidada trae la marca PERSONAL del coach asignado, que **no debe filtrarse** al alumno de pool (la gestiona el dueño del team, no el coach).
- Por eso, en contexto team:
  - **Saludo/marca** usa `headerTeamBrandName` (header del proxy), no `coachBranding.brand_name`.
  - **welcome_message** se anula (`null`) — no se muestra el mensaje personal del coach.
  - **WelcomeModal** se suprime (`welcomeModalEnabled = false`) — el modal de bienvenida PERSONAL del coach no aplica a alumnos de pool.

**Deteccion de team context:** `x-workspace-brand-source === 'organization'` (lo setea el proxy en branches `/e`, `/t` y enterprise) **OR** `basePath.startsWith('/t')`. Standalone → ambos false → usa la marca anidada del coach sin cambios.

**`x-client-use-brand-colors` (`initialUseBrandColors`):**
- Preferencia per-alumno (`clients.use_coach_brand_colors`, default `true`) de pintar con los colores del coach o con el sistema EVA. El proxy la lee de la fila `clients` y la propaga en `x-client-use-brand-colors`.
- El page la pasa a `DashboardHeader` → `ClientSettingsModal` como `initialUseBrandColors`, para que el alumno pueda togglearla desde ajustes. Si la columna falta → default `true`.
- A nivel de tema visual, el layout (`ClientBrandLayout`) ya resolvio las variables CSS (`--theme-primary`, etc.) desde los headers de marca gateados por tier (white-label v2: branding visual es **Pro+ entero**; free/starter → sistema EVA completo, conservando solo la identidad/nombre del coach).

**Tier gating (recordatorio del layout):** el proxy solo setea color/logo/loader/accent/font si `isBrandingAllowed(tier)` (Pro+). Para `< Pro` fuerza defaults EVA (`BRAND_PRIMARY_COLOR`, `BRAND_APP_ICON`). El layout repite el gate (defense-in-depth) y, si `isFreeTier`, muestra el footer "Potenciado por EVA".

---

## 1.9 Cabecera — `DashboardHeader` + `ClientGreeting` + `StreakWidget`

**`DashboardHeader` (RSC async, `_components/DashboardHeader.tsx`):**
- Recibe `userId, coachSlug, initialUseBrandColors, brandName, welcomeMessage`.
- Vuelve a cargar `getClientProfile(userId)` (deduplicado por cache) para sacar `firstName = full_name.split(' ')[0] ?? 'Atleta'`.
- Carga `getDashboardStreak(userId)`.
- Calcula, todo en zona **America/Santiago** (`@/lib/date-utils`):
  - `greet = timeGreetingSantiago()` → `'Buenos días'` (5–11h), `'Buenas tardes'` (12–18h), `'Buenas noches'` (resto).
  - `dateLabel = formatLongDateSantiago()` → ej. "lunes, 23 de junio" (`es-CL`, weekday + day + month).
  - `iso = getTodayInSantiago().iso` → usado como `key` del `ClientGreeting` para forzar remount al cambiar de dia.
  - `greeting = `${greet}, ${firstName}``.
- Render (funcional): header sticky arriba en movil, estatico en desktop. Muestra:
  - `brandName` (si existe) como eyebrow en mayusculas.
  - `<ClientGreeting greeting dateLabel key={iso} />`.
  - `welcomeMessage` (si existe y no es team) como linea secundaria.
  - A la derecha: `<StreakWidget streak={streak} />` y `<ClientSettingsModal coachSlug initialUseBrandColors />`.

**`ClientGreeting` (`'use client'`, `_components/header/ClientGreeting.tsx`):**
- Recibe `greeting` y `dateLabel`. Animacion de entrada (framer-motion): la fecha hace fade-in y el saludo se anima palabra por palabra (stagger). Respeta `useReducedMotion()` (sin animacion si el usuario lo pide). No tiene logica de datos — puramente presentacional.

**`StreakWidget` (`'use client'`, `_components/streak/StreakWidget.tsx`):**
- Recibe `streak: number`.
- Si `streak === 0` → texto "Empieza tu racha".
- Si `>= 1` → chip con icono llama + numero + "días". `streak >= 3` pulsa (animacion de escala en loop); `streak >= 7` agrega glow ("big").
- Si `streak >= 30` → dispara `canvas-confetti` UNA vez por valor de racha (guard por `sessionStorage` key `streak-confetti-${streak}`), respetando reduced-motion. Es un gancho de recompensa/retencion.

**`ClientSettingsModal`** (`@/components/client/ClientSettingsModal`, multi-domain) — boton de ajustes en la cabecera; recibe `coachSlug` y `initialUseBrandColors` (toggle de colores de marca). Es el acceso a configuracion del alumno desde el home (no detallado en este archivo; vive en `components/client/`).

---

## 1.10 Pull-to-refresh — `DashboardPullToRefresh`

`'use client'`, envuelve TODO el contenido del dashboard (`DashboardShell` + `WelcomeModal`).

- Gesto tactil: solo se arma si `window.scrollY === 0` (en el tope). Mide el arrastre vertical (`onTouchStart`/`onTouchMove`/`onTouchEnd`), clamp `[0, 140)` px, y previene el scroll nativo mientras se tira.
- Umbral de disparo: `dist >= 60` px. Al soltar por encima del umbral y si no esta ya refrescando:
  - `setRefreshing(true)` → **`router.refresh()`** → tras 800 ms resetea estado.
- **Que recarga:** `router.refresh()` de Next.js re-ejecuta el RSC del dashboard en el servidor — vuelve a correr `page.tsx` y todas las queries `cache()` (racha, programa, nutricion, peso, etc.) con datos frescos, manteniendo el estado de cliente. NO es un full reload; refresca el arbol de Server Components.
- Feedback visual: spinner (`Loader2`) fijo arriba, con opacidad/escala proporcional al arrastre, animado mientras `refreshing`. Pintado con el color de marca (`--theme-primary`). Respeta safe-area-inset-top.

---

## 1.11 `OrgAnnouncementBanner` — anuncios de organizacion

**Carga (`getActiveOrgAnnouncements(orgId)` en `dashboard.queries.ts`):** solo se invoca si `client.org_id` no es null (alumno enterprise/org). Query a `org_announcements`:
- `org_id = orgId`
- `is_active = true`
- `audience IN ('all', 'clients')` (excluye anuncios solo para coaches/staff)
- vigencia: `active_until IS NULL OR active_until > now()`
- publicacion: `published_at IS NULL` (legacy) `OR published_at <= now()` (anuncios programados que ya salieron)
- orden `created_at` desc, **limit 5**.
- Devuelve `OrgAnnouncement[]`: `{ id, title, body, active_until, created_at }` (selecciona tambien `audience` en la query pero no lo expone en el tipo).

**Render (`OrgAnnouncementBanner`, RSC puro):** si la lista esta vacia → `null`. Si hay anuncios, lista cada uno con `title` (negrita) y `body`. Se monta arriba de todo en `beforeSidebar`, fuera de Suspense (ya viene resuelto del page). Es el canal del dueño de la org para comunicar a sus alumnos (avisos, cierres, campañas).

> En contexto standalone (sin `org_id`) el banner nunca aparece. En team el `org_id` puede o no estar seteado segun el modelo; el page solo pregunta por `client.org_id`.

---

## 1.12 `WelcomeModal` — bienvenida del coach (texto/video)

`'use client'`, montado al final de `DashboardPullToRefresh`. Es el mensaje de bienvenida que el coach standalone configura para sus alumnos.

**Props (resueltas en el page, gateadas por team):**
- `brandName`: nombre de marca (team → `headerTeamBrandName`; standalone → `coachBranding.brand_name`; fallback "Tu Coach").
- `welcomeModalEnabled`: en team **siempre `false`** (suprimido); standalone → `coachBranding.welcome_modal_enabled ?? false`.
- `welcomeModalContent`: en team `null`; standalone → `coachBranding.welcome_modal_content`.
- `welcomeModalType`: `'text'` o `'video'` (default `'text'`).
- `welcomeModalVersion`: entero; controla el "no mostrar de nuevo".

**Logica (cliente):**
- Solo abre si `welcomeModalEnabled` y `welcomeModalContent` no vacio.
- Versionado via `localStorage` key `eva:welcome-dismissed-version`: abre solo si `dismissedVersion < welcomeModalVersion` (tras 800 ms de delay para que el dashboard pinte). Asi el coach puede re-mostrar el modal subiendo la version.
- Tipo `video`: extrae ID de YouTube o Vimeo del `welcomeModalContent` (regex), embebe el iframe con autoplay muted + toggle de sonido. URL invalida → placeholder. Tipo `text`: renderiza el contenido como texto (preserva saltos de linea).
- Footer: checkbox "No mostrar de nuevo hasta que haya un mensaje nuevo" (persiste la version en localStorage) + boton "Entendido".

---

## 1.13 Resumen de dependencias externas del page

| Import | Origen | Rol |
|---|---|---|
| `getClientBasePath` | `@/lib/client/base-path` | base path multi-contexto |
| `getClientDashboardUser` (= `getClientRootUser`) | `_data/dashboard.queries` → `_data/client-root.queries` | auth root (getClaims) |
| `getClientProfile` | `_data/dashboard.queries` → repo `findDashboardClientById` | perfil + marca anidada |
| `getActiveOrgAnnouncements` | `_data/dashboard.queries` | anuncios org |
| `getDashboardStreak` | `_data/dashboard.queries` → RPC `get_client_current_streak` | racha |
| `formatLongDateSantiago`, `timeGreetingSantiago`, `getTodayInSantiago` | `@/lib/date-utils` | fecha/saludo en TZ Santiago |
| headers `x-*` | proxy `apps/web/src/proxy.ts` | white-label / team / colores / base path |
| Secciones (`WeekCalendar`, `CheckInBanner`, `HeroAndComplianceGroup`, `ActiveProgramSection`, `RecentWorkoutsSection`, `WeightFullChartSection`, `DashboardSidebarBlocks`) | `_components/*` | paneles (detallados en otras secciones de la auditoria) |

---

## 1.14 Notas para el rediseño (parity)

- **Doble carga serial al arranque** (auth → perfil) antes de pintar; el resto es streaming por seccion. Mantener el patron Suspense-por-seccion es critico para retencion percibida.
- **TZ America/Santiago es transversal**: racha, ventanas de 14/30/365 dias, saludo, fecha, agrupacion por dia. Todo deriva de `getTodayInSantiago` + `parseISOAnchor` (ancla mediodia). Cualquier rediseño debe conservar esta convencion para no romper conteos.
- **Marca tiene dos fuentes** (fila `coaches` anidada vs headers del proxy); team/enterprise SIEMPRE manda por header y suprime marca personal del coach (welcome_message + WelcomeModal). No mezclar.
- **`use_coach_brand_colors`** es un toggle per-alumno editable desde la cabecera (`ClientSettingsModal`); el tema visual ya lo aplica el layout.
- **Guards en tres capas** (proxy → layout → page); el page no confia en que el proxy filtro.
- **IDOR guards a nivel DB** en las RPC de racha/last-workout; un rediseño que cambie como se piden estos datos debe preservar el guard (`auth.uid()` ownership + bypass service-role).
- **`router.refresh()`** (pull-to-refresh) re-corre el RSC entero — es la unica via de recarga del home sin full reload.
