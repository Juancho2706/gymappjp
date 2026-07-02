# 3. Onboarding (checklist coach/alumno) y graficas

Esta seccion documenta el sistema de **onboarding del dashboard del coach** (`CoachOnboardingChecklist`), todas sus variantes de presentacion, la persistencia de estado (`onboarding-guide.actions`), la telemetria (`onboarding-telemetry.client` + ruta `/api/coach/onboarding-events`) y las **graficas del dashboard** (`DashboardCharts`). El enfasis esta en el **backend**: que datos llegan, como se calculan, de donde salen y como se guardan.

---

## 3.1 Vision general del flujo de datos

El dashboard es un RSC (`page.tsx` → `DashboardContent` → `DashboardShell`). Toda la data viaja **server-side primero**:

1. `CoachDashboardPage` (RSC, `apps/web/src/app/coach/dashboard/page.tsx`) llama a `getCoach()` y pasa al cliente: `coach.id`, `full_name`/`brand_name`, `slug`, `invite_code`, `onboarding_guide` (jsonb), `subscription_tier` (normalizado) y `hasCoachLogo = Boolean(coach.logo_url?.trim())`.
2. `DashboardContent` (RSC) llama a `getCoachDashboardDataV2(userId)` (`_data/dashboard.queries.ts`) y reenvia el resultado a `DashboardShell`.
3. `DashboardShell` (cliente) renderiza `CoachOnboardingChecklist` con las **senales de onboarding ya calculadas en el server**: `totalClients`, `activePlans`, `hasStudentSignal30d`, `subscriptionTier`, `hasCoachLogo`, `initialOnboardingGuide`.
4. `DashboardShell` tambien renderiza `DashboardCharts` con `areaData` y `barData` (calculados server-side en la misma query).

> Punto clave: el **estado "completo" de cada paso del onboarding se computa principalmente en el backend** (conteos y senales de actividad), y el cliente solo lo combina con flags manuales/dismiss persistidos en `coaches.onboarding_guide`.

---

## 3.2 `CoachOnboardingChecklist` — los 4 pasos y su deteccion backend

Archivo: `apps/web/src/app/coach/dashboard/CoachOnboardingChecklist.tsx`.

### 3.2.1 Los 4 pasos (`StepKey`)

El circuito de activacion tiene **exactamente 4 pasos** (tipo `StepKey`):

```
'profile_branding' | 'first_client' | 'first_plan' | 'first_checkin'
```

Titulos visibles:
1. **"1. Tu marca en la app del alumno"** (`profile_branding`)
2. **"2. Primer alumno"** (`first_client`)
3. **"3. Primer plan asignado"** (`first_plan`)
4. **"4. Tu alumno ya uso la app"** (`first_checkin`)

### 3.2.2 Como se detecta cada paso como completo (origen backend)

El checklist construye un objeto `autoCompleted` (auto-detectado por backend/cliente) y lo combina con `manualCompleted` (flags persistidos). Detalle de cada senal:

| Paso (`StepKey`) | Prop / senal | Origen backend exacto | Logica de "completo" |
|---|---|---|---|
| `profile_branding` | `hasCoachLogo` **o** `brandTourSeen` | `hasCoachLogo` viene de `page.tsx`: `Boolean(coach.logo_url?.trim())` (columna `coaches.logo_url`). `brandTourSeen` se lee de `localStorage` clave `eva:brand-settings-tour-seen:{coachId}` (ver 3.2.5) | `auto = hasCoachLogo || brandTourSeen`. Auto-completo si el coach **subio logo** o **vio el tour de Mi Marca** |
| `first_client` | `totalClients > 0` | `totalClients` = `data.kpi.totalClients`, que sale de `countCoachClients(supabase, userId, orgId)` en `getCoachDashboardDataInner` (cuenta filas de `clients` del coach, scoped por `org_id` cuando el coach es enterprise) | `auto = totalClients > 0` |
| `first_plan` | `activePlans > 0` | `activePlans` = `data.activePlans`, que sale de `supabase.from('workout_plans').select('*', { count: 'exact', head: true }).eq('coach_id', userId)`. **Solo scoped por `coach_id`** (la tabla `workout_plans` no tiene `org_id`) | `auto = activePlans > 0` |
| `first_checkin` | `hasStudentSignal30d` | `hasStudentSignal30d = hasCheckinLast30d \|\| hasWorkoutLast30d` calculado en `getCoachDashboardDataInner` (ver 3.2.3) | `auto = hasStudentSignal30d` |

`subscriptionTier` modifica la **presentacion** del paso 1 (free no puede personalizar marca → CTA de upgrade + boton "Marcar como visto"), pero no la deteccion.

### 3.2.3 Deteccion del paso 4 (senal de uso real) — el calculo backend mas importante

En `getCoachDashboardDataInner` (`_data/dashboard.queries.ts`):

- `thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString()` (ventana movil de 30 dias).
- **`hasCheckinLast30d`**: query `check_ins` con join `clients!inner(coach_id, org_id)`, filtrada por `clients.coach_id = userId`, scope org via `applyOrgScope(..., 'clients.org_id', orgId)`, `.gte('created_at', thirtyDaysAgo).limit(1)`. Es `true` si devuelve >= 1 fila.
- **`hasWorkoutLast30d`**: deriva de `workoutLogs30d` (query `workout_logs` con join `clients!inner(coach_id, org_id)`, `clients.coach_id = userId`, `.gte('logged_at', thirtyDaysAgo)`). Es `true` si `workoutLogs30d.length > 0`.
- **`hasStudentSignal30d = hasCheckinLast30d || hasWorkoutLast30d`**.

La descripcion del paso 4 lo dice explicito: *"Se marca listo si en los ultimos 30 dias hay al menos un check-in o un registro de entreno de tus alumnos (misma ventana que el dashboard)."* La ventana de 30d coincide con la del AreaChart (3.6).

### 3.2.4 Combinacion auto + manual (`completed`)

El estado final por paso (`completed: Record<StepKey, boolean>`) se calcula con `useMemo`:

- **`profile_branding`**: caso especial. Si `manualCompleted.profile_branding === false` (el coach hizo "Desmarcar paso" explicito) → `false` **aunque tenga logo/tour**. Si no, `auto.profile_branding || manualCompleted.profile_branding === true`.
- **`first_client`** / **`first_plan`** / **`first_checkin`**: `auto.X || Boolean(manualCompleted.X)`.

Derivados:
- `completedCount` = numero de pasos en `true`.
- `progressPct = Math.round((completedCount / 4) * 100)` (0, 25, 50, 75, 100).
- `allDone = completedCount === 4`.

### 3.2.5 Paso 1: integracion con el tour de "Mi Marca" (`brandTourSeen`)

Helpers en `apps/web/src/lib/coach-brand-tour.ts`:
- `brandTourSeenStorageKey(coachId)` → `eva:brand-settings-tour-seen:{coachId}` (localStorage). Misma clave que `BrandSettingsTourClient` usa al cerrar el tour.
- `BRAND_TOUR_SEEN_CHANGED_EVENT = 'eva:brand-tour-seen-changed'` (CustomEvent misma pestana).

El checklist escucha tanto el evento `storage` (otra pestana) como `BRAND_TOUR_SEEN_CHANGED_EVENT` (misma pestana) para re-leer el flag y actualizar el paso 1 **sin recargar**. Cuando el coach va a `/coach/settings?tour=1` (CTA "Ir a Mi Marca y guia") y cierra el tour, el flag se setea y el paso 1 pasa a completo.

> Nota backend: el flag `brand_tour_seen` tambien se persiste en `coaches.onboarding_guide` via `markBrandTourSeenAction` (ver 3.4.2), pero el checklist del dashboard lee la **version localStorage** para el calculo del paso 1, no el jsonb.

### 3.2.6 Boton de toggle manual del paso 1

`toggleProfileStep()` alterna `manualCompleted.profile_branding`:
- Si esta "done" (auto o manual) → setea `false` (Desmarcar paso).
- Si no → setea `true` (Marcar como visto / Ya lo deje listo).

Es el unico paso con toggle manual; los pasos 2-4 solo se completan por senal backend.

### 3.2.7 Cuando desaparece el checklist

Logica de visibilidad al final del componente:
- Si `!ready` → muestra skeleton (placeholder pulsante).
- **`dismissed && allDone`** → retorna `null` (desaparece por completo).
- **`dismissed && !allDone`** → muestra una **barra resumida** ("Seguis con pasos pendientes en tu guia de inicio") con boton "Continuar guia" (`resumeGuide()` setea `dismissed=false`).
- En cualquier otro caso → muestra el checklist completo.

O sea: el checklist **nunca se oculta solo por estar completo**; requiere que el coach lo "salte" (dismiss). Combinado con `allDone`, recien entonces desaparece sin dejar barra.

### 3.2.8 Boton "Saltar guia" (dismiss) y "aha moment" / confetti

- **Dismiss**: el boton "Saltar guia" llama `dismiss()`, que: (1) emite telemetria `postGuideEngagement('profile_branding', { widget:'onboarding_checklist', action:'dismiss_confirm', progress_pct, all_done })`, (2) setea `dismissed=true`, (3) muestra toast "Guia ocultada. Podes retomarla desde el dashboard."
- **Aha moment (100%)**: cuando `allDone` pasa a `true` por primera vez (`!ahaRef.current`):
  - Si el sistema **no** pide `prefers-reduced-motion: reduce` y no se disparo ya en esta sesion (`sessionStorage` clave `eva:coach-onboarding-100-confetti-fired:{coachId}`), lanza **confetti** (`canvas-confetti`, 130 particulas, colores marca EVA `#10B981`/`#007AFF`/`#22c55e`/`#38bdf8`/`#34d399`).
  - Emite evento backend `aha_moment` (ver 3.3) con `metadata.progressPct = 100`.
  - Setea `ahaRef.current = true` (y se persiste como `ahaMomentSent` en el jsonb).

### 3.2.9 Eventos de cambio de paso (step_completed / step_reopened)

En el `useEffect` que vigila `completed`: compara el estado actual contra `previousStateRef`. Por cada paso:
- `!before && now` → emite `emitOnboardingEvent(key, 'step_completed', { progressPct })`.
- `before && !now` → emite `emitOnboardingEvent(key, 'step_reopened', { progressPct })`.

`emitOnboardingEvent` hace `POST /api/coach/onboarding-events` (ver 3.3).

### 3.2.10 Bloques adicionales del checklist (no son de los 4 pasos)

- **Banner plan Free** (`isFree`): lista lo incluido en Free (3 alumnos, entrenos ilimitados, app, check-ins) y lo bloqueado (marca Starter+, nutricion Pro+) + link "Ver planes".
- **Tarjetas gemelas "Tu panel" / "Tu alumno"** (`OnboardingGemelliCoachCard` / `OnboardingGemelliStudentCard`): explican el circuito coach↔alumno. La del alumno incluye CTA "Vista previa alumno" (`/coach/settings/preview`) y "Abrir app alumno" (`studentAppPath`, construido con `buildCoachStudentPath({ slug, invite_code })`).
- **`NutritionTierBlock`**: bloque de nutricion **gateado por tier**. Usa `getTierCapabilities(subscriptionTier).canUseNutrition`:
  - Si **no** puede usar nutricion → bloque de upsell (Free/Starter) con CTA "Ver planes y upgrade".
  - Si **si** puede → muestra los 3 pasos de `COACH_NUTRITION_ONBOARDING_STEPS` (ver 3.5), marcados como "independientes del circuito principal".
- **Bloque "Activacion lista"** (`allDone`): mensaje de exito cuando los 4 pasos estan completos.

---

## 3.3 Telemetria de eventos — `/api/coach/onboarding-events` y tabla `coach_onboarding_events`

Ruta: `apps/web/src/app/api/coach/onboarding-events/route.ts`. Cliente: `_lib/onboarding-telemetry.client.ts` + `emitOnboardingEvent` (interno al checklist).

### 3.3.1 Que eventos se registran

El schema Zod del POST acepta:
- **`stepKey`**: `'profile_branding' | 'first_client' | 'first_plan' | 'first_checkin'`.
- **`eventType`**: `'step_completed' | 'step_reopened' | 'aha_moment' | 'guide_engagement'`.
- **`metadata`** (opcional): record de `string | number | boolean`.

Mapeo de quien emite cada tipo:
- `step_completed` / `step_reopened`: `emitOnboardingEvent` desde el `useEffect` del checklist (metadata `{ progressPct }`).
- `aha_moment`: `emitOnboardingEvent('first_checkin', 'aha_moment', { progressPct: 100 })` al llegar al 100%.
- `guide_engagement`: `postGuideEngagement(stepKey, metadata)` (en `onboarding-telemetry.client.ts`), emitido por interacciones de exploracion (viñetas, carousel, Three, dismiss). Metadata tipica: `{ widget, action/target, ... }`.

### 3.3.2 Backend de la ruta (calculo y guardado)

1. Autenticacion: `supabase.auth.getUser()`; sin user → 401.
2. **Rate limit**: `rateLimitCoachOnboardingEvents(user.id)`; si excede → `jsonRateLimited(retryAfter)` (429).
3. Parseo del body (texto crudo, JSON manual; vacio o no-objeto → 400) + validacion Zod.
4. Usa **service-role** (`createServiceRoleClient()`) para insertar (el coach no necesita policy de insert directa).
5. **Dedupe por ventana** (`DEDUPE_WINDOW_MS = 5000`): para `eventType != 'guide_engagement'`, consulta el ultimo evento del mismo triple `(coach_id, step_key, event_type)`; si ocurrio hace menos de 5s, retorna `{ ok:true, deduped:true }` **sin insertar** (evita duplicados por re-renders / React Strict Mode). `guide_engagement` **no** se dedupe (es analitica de frecuencia).
6. Insert en tabla **`coach_onboarding_events`** con columnas: `coach_id`, `step_key`, `event_type`, `metadata` (jsonb o null).
7. Manejo de errores: FK violation (`23503`, coach_id inexistente) → 404 "Coach not found"; otro error → 500.

### 3.3.3 `postGuideEngagement` (cliente)

`_lib/onboarding-telemetry.client.ts` exporta `postGuideEngagement(stepKey, metadata)`: hace `POST` con `eventType: 'guide_engagement'` y **traga cualquier error** (`try/catch` vacio) para no bloquear la UI. Tipo `OnboardingGuideStepKey` = los 4 step keys.

---

## 3.4 Persistencia del estado — `onboarding-guide.actions` y `coaches.onboarding_guide`

Archivo: `apps/web/src/app/coach/dashboard/_actions/onboarding-guide.actions.ts`. La fuente de verdad persistente es la columna **`coaches.onboarding_guide`** (jsonb).

### 3.4.1 `persistOnboardingGuideAction(payload)` — que persiste

Schema Zod `onboardingGuideSchema`:
```
{
  dismissed?: boolean
  completed?: { profile_branding?, first_client?, first_plan?, first_checkin? }  (.strict())
  ahaMomentSent?: boolean
}
```

Logica backend:
1. `supabase.auth.getUser()`; sin user → `{ ok:false, error:'No autenticado' }`.
2. **Merge, no replace**: lee `coaches.onboarding_guide` actual, lo trata como objeto y hace `merged = { ...existing, ...parsed.data }`. Esto preserva **otras keys del mismo jsonb** (ej. `invite_code_confirmed`, `brand_tour_seen`) que antes un replace total pisaba (bug: reaparecia el modal de "codigo corto" en cada carga).
3. `UPDATE coaches SET onboarding_guide = merged, updated_at = now() WHERE id = user.id`.
4. `revalidatePath('/coach/dashboard')`.

Por lo tanto, lo que se guarda del onboarding es: **flags de pasos completados manualmente, flag `dismissed`, flag `ahaMomentSent`**. El **auto-completado NO se guarda** (se recalcula cada carga desde conteos backend).

### 3.4.2 `markBrandTourSeenAction()` — paso 1 via jsonb

Tambien merge-only: lee `onboarding_guide`, agrega `brand_tour_seen: true`, hace UPDATE y `revalidatePath('/coach/settings')`. Es la cara server-side del flag de tour de marca (el checklist usa la version localStorage para el render inmediato).

### 3.4.3 Hidratacion en el cliente — server jsonb vs localStorage

En el `useEffect` de carga del checklist:
- Lee `fromServer = normalizeGuideFromJson(initialOnboardingGuide)` (parsea el jsonb a `PersistedState`).
- Lee `ls = readPersistedState(coachId)` (localStorage clave `eva:coach-onboarding:v1:{coachId}`, **por coach** para no cruzar cuentas en el mismo browser).
- **Si el server tiene actividad** (`persistedStateHasActivity`: `dismissed` o `ahaMomentSent` o algun `completed`): el server gana. Mergea `dismissed = server.dismissed || ls.dismissed`, usa `completed`/`ahaMomentSent` del server, escribe el merge a localStorage.
- **Si el server no tiene actividad**: usa el localStorage como fuente y, si **el localStorage tiene actividad**, lo **sube al server** via `persistOnboardingGuideAction` (migracion de estado local → cuenta).

### 3.4.4 Escritura con debounce

`schedulePersistToServer(snapshot)`: escribe **inmediato a localStorage** y agenda el `persistOnboardingGuideAction` con **debounce de 450ms** (cancelando timers previos). El snapshot que se persiste es `{ completed: manualCompleted, ahaMomentSent: ahaRef.current, dismissed }`. Se dispara desde el `useEffect` que vigila `completed`/`dismissed`/`manualCompleted`.

---

## 3.5 Variantes de presentacion del onboarding (cuando se usa cada una)

El checklist monta **varias variantes visuales simultaneas** (no es A/B; son secciones distintas dentro de la misma tarjeta). Todas son UI esquematica/ficticia, no datos reales de alumnos, salvo el estado `completed` por paso.

### 3.5.1 `OnboardingCompactLoopStrip` (V1 — franja compacta)

Archivo: `_components/onboarding/OnboardingCompactLoopStrip.tsx`. Se renderiza **solo si `!allDone`**. Muestra el circuito "Panel → app del alumno" como mockup esquematico. Acento de motion: si el sistema **no** pide reduced motion, carga un **Lottie** (`LOTTIE_CLIPBOARD_LIST_URL`, via `@lottiefiles/react-lottie-player` con `dynamic ssr:false`); si pide reduced motion, muestra un icono `Sparkles` estatico. No consume datos backend.

### 3.5.2 Tarjetas gemelas en tabs/grid (V3 — "Tu panel" / "Tu alumno")

Dentro de `CoachOnboardingChecklist`: en movil se presentan como **Tabs** (`coach` / `student`); desde `md` se muestran en **grid de 2 columnas** simultaneas. Contienen `OnboardingGemelliCoachCard` y `OnboardingGemelliStudentCard`.

### 3.5.3 `OnboardingStepsVignetteCarousel` (V2 — carousel de viñetas/"Capitulos")

Archivo: `_components/onboarding/OnboardingStepsVignetteCarousel.tsx`. Se renderiza **solo si `!allDone`**. Recibe `completed: Record<StepKey, boolean>`. Cuatro viñetas (`VIGNETTES`), una por paso, con label/title/blurb/icono. Cada viñeta muestra badge **"Listo"** si `completed[stepKey]`. Comportamiento:
- Click en viñeta: `scrollToStepAnchor` → emite `postGuideEngagement(stepKey, { widget:'vignette_card', target:id })` y hace scroll suave al ancla del paso (`#coach-onboarding-step-N`), salvo reduced-motion.
- Flechas prev/next: emiten `postGuideEngagement('profile_branding', { widget:'vignette_carousel', action:'arrow_prev'/'arrow_next' })`.

### 3.5.4 `OnboardingStepsJumpNav` (V2 ligero — jump-nav "Saltar a")

Archivo: `_components/onboarding/OnboardingStepsJumpNav.tsx`. Se renderiza **siempre** (no condicionado a `allDone`). Barra de anclas horizontales scroll-snap con 4 chips: **Marca / Alumno / Plan / Uso** (ids `coach-onboarding-step-1..4`). El **paso activo** se calcula con un `IntersectionObserver` (rootMargin `-10% 0px -36% 0px`, thresholds varios; elige la entrada con mayor `intersectionRatio`). Click hace scroll suave al ancla salvo reduced-motion. No emite telemetria.

### 3.5.5 `OnboardingThreeSlot` + `OnboardingThreeRibbonInner` (V6 — pieza WebGL Three.js)

Archivos: `_components/onboarding/OnboardingThreeSlot.tsx` y `OnboardingThreeRibbonInner.tsx`.
- `OnboardingThreeSlot`: gate de capacidad. Monta la pieza WebGL **solo en `md+` (>=768px) y sin `prefers-reduced-motion: reduce`**; en movil o reduced motion muestra un gradiente estatico (`StaticRibbonFallback`). Usa `dynamic ssr:false` para cargar el inner.
- `OnboardingThreeRibbonInner`: renderiza un **icosaedro wireframe** (Three.js) que toma el color de la variable CSS `--theme-primary` (fallback `#007AFF`). Al montar emite **una vez** `postGuideEngagement('profile_branding', { widget:'three_ribbon', variant:'webgl' })`.

> Nota de estado actual del codigo: `OnboardingThreeSlot` / `OnboardingThreeRibbonInner` **existen pero NO estan importados** por `CoachOnboardingChecklist.tsx` en su version actual (el checklist importa `OnboardingCompactLoopStrip`, `OnboardingStepsJumpNav` y `OnboardingStepsVignetteCarousel`). La pieza Three es una variante disponible/legacy no montada hoy; documentarla para parity, pero el render activo no la incluye.

### 3.5.6 Resumen de condiciones de render

| Variante | Componente | Condicion de render |
|---|---|---|
| Franja compacta (loop) | `OnboardingCompactLoopStrip` | `!allDone` |
| Tabs/grid gemelas | inline (`OnboardingGemelli*Card`) | siempre (tabs en `<md`, grid en `md+`) |
| Carousel de viñetas | `OnboardingStepsVignetteCarousel` | `!allDone` |
| Jump-nav | `OnboardingStepsJumpNav` | siempre |
| Three ribbon (WebGL) | `OnboardingThreeSlot` | `md+` y sin reduced-motion; **no montado en el checklist actual** |
| Bloque nutricion | `NutritionTierBlock` | siempre (contenido varia por tier) |
| Bloque "Activacion lista" | inline | `allDone` |

---

## 3.6 Pasos de onboarding de nutricion (`COACH_NUTRITION_ONBOARDING_STEPS`)

Archivo: `apps/web/src/app/coach/nutrition-plans/_components/nutrition-onboarding-shared.ts`. Constante reutilizada por el `NutritionTierBlock`. **No** son parte del progreso del checklist principal (son guia independiente). Tres pasos fijos:
1. **Agrega tus alimentos** → `/coach/foods` (catalogo ~250 alimentos chilenos/globales o crear propios).
2. **Crea tu primera plantilla** → `/coach/nutrition-plans/new`.
3. **Asigna el plan a un alumno** → `href: null` (CTA sin destino directo).

No tienen deteccion de "completo" — son links estaticos visibles solo si el tier puede usar nutricion (`canUseNutrition`).

---

## 3.7 `DashboardCharts` — las dos graficas del dashboard

Archivo: `apps/web/src/components/coach/dashboard/DashboardCharts.tsx`. Cargado en `DashboardShell` via `dynamic ssr:false` (skeleton mientras monta). Recibe `areaData` y `barData` (ya calculados server-side). Usa **Recharts**. Hay un gate `mounted` (espera `useEffect`) para evitar mismatch SSR/CSR; mientras tanto muestra dos placeholders.

Son **dos graficas**:

### 3.7.1 AreaChart — "Sesiones 30 Dias"

- **Que mide**: numero de **sesiones de entreno unicas por dia** en los ultimos 30 dias (deduplicadas por alumno+dia).
- **Datos** (`areaData`): array de `{ name, fullName, sesiones }` donde `name`/`fullName` es la fecha `DD/MM` y `sesiones` el conteo del dia.
- **Empty state**: si `areaData.length === 0` → muestra "Sin sesiones registradas en los ultimos 30 dias" (icono `TrendingUp`). El array **solo incluye dias con `sesiones > 0`** (se filtran los ceros para limpiar el grafico).
- **Tooltip**: formatea `"{n} sesion(es)"`; `labelFormatter` usa `payload[0].payload.fullName`.

**Calculo backend** (`getCoachDashboardDataInner`):
1. Inicializa `sessionsByDay` con 30 claves `DD/MM` (de hace 29 dias a hoy) en 0.
2. **Fuente primaria**: RPC `get_coach_workout_sessions_30d(p_coach_id)` → filas `{ day: 'YYYY-MM-DD', sessions }` (agregacion **server-side en Postgres**, sesiones unicas por dia en zona Santiago). Se parsea `day` manualmente para evitar shifts de timezone y se asigna a `sessionsByDay[dayKey]`.
3. **Fallback JS**: si la RPC da error o vacio, agrega sobre `workoutLogs30d` (query `workout_logs` filtrada por `clients.coach_id`, `.gte('logged_at', thirtyDaysAgo)`), **deduplicando por `client_id|dia`** (un alumno cuenta como 1 sesion por dia).
4. `areaData` = entries de `sessionsByDay` filtrando `sesiones > 0`.

### 3.7.2 BarChart — "Crecimiento de Alumnos"

- **Que mide**: **nuevos alumnos por mes** en los ultimos 6 meses moviles.
- **Datos** (`barData`): array de `{ name, alumnos }` donde `name` es el nombre corto del mes (Ene..Dic) y `alumnos` el conteo de altas.
- **Sin empty state propio**: siempre renderiza el `BarChart` (con 6 barras, posiblemente en 0).
- **Tooltip**: serie "Nuevos alumnos".

**Calculo backend** (`getCoachDashboardDataInner`):
1. **Fuente primaria**: RPC `get_coach_client_signups_last_6_months(p_coach_id)` → filas `{ ym: 'YYYY-MM', client_count }`.
2. **Fallback**: si la RPC falla/vacia, `findCoachClientSignupDates(supabase, userId, orgId)` (fechas `created_at` de `clients`) y se agrega en JS por `YYYY-MM`.
3. Construye `signupMap` (`ym → count`). Luego arma `growthMap` recorriendo los **6 meses moviles** (de hace 5 meses a hoy), tomando `signupMap.get(ym) ?? 0`. `barData` = entries.

> Ambas graficas dependen de RPCs Postgres con **fallback JS** sobre las tablas crudas (`workout_logs`, `clients`), de modo que nunca quedan vacias por error de RPC. La ventana de 30d del AreaChart es la **misma** que la senal `hasStudentSignal30d` del paso 4 del onboarding (consistencia intencional documentada en la descripcion del paso 4).

---

## 3.8 Notas de backend para parity (resumen)

- **Senales de onboarding = conteos/queries server-side**, recalculadas en cada carga; no se cachean en el jsonb. El jsonb (`coaches.onboarding_guide`) solo guarda overrides manuales (`completed`), `dismissed` y `ahaMomentSent`, **merge-only** (preserva `invite_code_confirmed`, `brand_tour_seen`, etc.).
- **Scope enterprise**: casi todas las queries de senales aplican `applyOrgScope(..., orgId)` (org del coach via `resolvePreferredWorkspace`); excepcion: el conteo de `workout_plans` (paso 3) es solo `coach_id` porque la tabla no tiene `org_id`.
- **Telemetria**: tabla `coach_onboarding_events` (`coach_id`, `step_key`, `event_type`, `metadata`), insert via service-role con rate-limit + dedupe de 5s (excepto `guide_engagement`).
- **Confetti del 100%** deduplicado por `sessionStorage` y respeta `prefers-reduced-motion`.
- **localStorage por coach**: clave `eva:coach-onboarding:v1:{coachId}` (estado guia) y `eva:brand-settings-tour-seen:{coachId}` (tour marca) + sessionStorage `eva:coach-onboarding-100-confetti-fired:{coachId}`.
- **Graficas**: RPCs `get_coach_workout_sessions_30d` (AreaChart) y `get_coach_client_signups_last_6_months` (BarChart), ambas con fallback JS sobre tablas crudas.
