# 1. Vision general, War Room (pulso) y carga de datos

> Alcance de esta seccion: SOLO el contenedor War Room del directorio de alumnos en `/coach/clients` — carga de datos al abrir, encabezado de pulso (stat cards), composicion de la pantalla y scoping por contexto. Las TARJETAS de alumno (`ClientCardV2`) y la FICHA (`/coach/clients/[clientId]`) tienen su propio documento: aqui solo se las referencia.

---

## 1.1 Que es el directorio / War Room y su rol

El directorio de alumnos (`/coach/clients`) es la **sala de triage diaria del coach**. El propio codigo se autodenomina "War Room": el componente raiz de la cabecera es `CoachWarRoom`, el titulo es **"Directorio de Alumnos"** y el subtitulo literal es:

> Gestion centralizada · panel operativo tipo War Room

El objetivo operativo es que el coach, al abrir la pantalla, vea de un vistazo el **pulso de toda su cartera** (cuantos alumnos hay, cuantos estan en riesgo, adherencia promedio, etc.) y pueda **filtrar la lista** tocando una metrica para atacar primero los casos urgentes. No es un CRUD pasivo: es un tablero de priorizacion.

La pantalla se compone de dos grandes bloques apilados:

1. **Encabezado de pulso + barra de accion** — `CoachWarRoom` (titulo, link al portal de alumnos, boton "Nuevo Alumno", stat cards de resumen, banners de alerta).
2. **La lista de alumnos** — `ClientsDirectoryClient` (filtros finos, busqueda, orden, toggle tabla/tarjetas, vista tabla, vista tarjetas, estados vacios). Documentada en sus propias secciones.

Ambos comparten **un solo estado de filtro de riesgo** elevado al shell (`CoachClientsShell`), de modo que tocar una stat card filtra la lista de abajo.

---

## 1.2 Carga de datos al abrir la pantalla (server)

La pagina es un Server Component: `apps/web/src/app/coach/clients/page.tsx` (`CoachClientsPage`).

Flujo de arranque:

1. **Sesion del coach.** `getCoach()` (`@/lib/coach/get-coach`). Si no hay sesion → `redirect('/login')`.
2. **Resolucion del workspace activo.** `getPreferredWorkspaceForRender(coachSession.id)` (`@/services/auth/workspace-render-cache`). Devuelve un `WorkspaceSummary | null`. De ahi se derivan dos ids de scope:
   - `orgId` = `workspace.orgId` **solo si** `workspace.type === 'enterprise_coach'`, si no `null`.
   - `activeTeamId` = `workspace.teamId` **solo si** `workspace.type === 'coach_team'`, si no `null`.
   - `getPreferredWorkspaceForRender` esta memoizado con `React.cache` keyeado por `userId` (dedup por request; ver §1.5).
3. **Tres cargas en paralelo** via `Promise.all`:
   - `getCoachClientsWithPrograms(coachSession.id, { orgId, activeTeamId })` → la **lista** de alumnos con su programa.
   - `headers()` → para construir `appUrl`.
   - `getCoachClientsPulse(coachSession.id, orgId)` → el **pulso** (array de `DirectoryPulseRow`).
4. **Construccion de `appUrl`.** Se lee el header `host` (fallback `'localhost:3000'`); protocolo `http` si contiene `localhost`, si no `https`. `appUrl = ${protocol}://${host}`. Se usa para armar el link del portal de alumnos.
5. **Objeto `coach` minimo.** `{ slug: coachSession.slug, invite_code: coachSession.invite_code }` — solo lo necesario para el identificador publico (link del portal).
6. **Render.** Un contenedor centrado (`max-w-[1600px]`) que monta `CoachClientsShell` con `clients`, `coach`, `appUrl`, `pulse`.

> Nota: la lista y el pulso se cargan por **dos caminos distintos** (dos queries separadas) y se cruzan en el cliente por `clientId` (ver §1.5). La lista trae el shape DB del alumno + su programa; el pulso trae las metricas calculadas. No vienen unidos del server.

### Metadata

`export const metadata = { title: 'Alumnos | EVA' }`.

---

## 1.3 Que datos llegan (shapes)

### a) Lista de alumnos — `getCoachClientsWithPrograms` (`_data/clients.queries.ts`)

Query memoizada con `React.cache`. Selecciona de `clients`:

```
.select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')
.order('created_at', { ascending: false })
```

Tipo de retorno `ClientWithProgram[]`:

- `ClientWithProgram extends Tables<'clients'>` — **todas** las columnas del alumno (`select('*')`).
- `workout_programs: Pick<WorkoutProgram, 'name' | 'start_date' | 'weeks_to_repeat' | 'is_active'>[]` — array de programas embebidos (solo esas 4 columnas).

Orden: por `created_at` descendente (mas recientes primero). Este es el **orden base** antes de cualquier orden cliente.

> El parametro `scope` (`CoachClientScope = { orgId: string | null; activeTeamId: string | null }`) define el filtrado por contexto — ver §1.6.

### b) Pulso — `getCoachClientsPulse` → `getCachedDirectoryPulse` → `DashboardService.getDirectoryPulse`

`getCoachClientsPulse(coachId, orgId)` delega en `getCachedDirectoryPulse(coachId, orgId)` (`@/lib/coach/directory-pulse-cache`), tambien `React.cache` (una sola carga de pulse por request, compartida con las stats del dashboard). Internamente instancia `DashboardService` y llama `getDirectoryPulse(coachId, orgId)`.

> Importante: el pulso recibe **`orgId`** pero **NO** `activeTeamId`. El scope de pulso es distinto del scope de la lista (ver §1.6, divergencia conocida).

El pulso es `DirectoryPulseRow[]`. Shape de `DirectoryPulseRow` (`@/services/dashboard.service`):

| Campo | Tipo | Significado |
|---|---|---|
| `clientId` | `string` | id del alumno (clave de cruce con la lista) |
| `clientName` | `string` | `full_name` del alumno |
| `percentage` | `number` | adherencia de entrenamiento de la **ultima semana** (0–100) |
| `lastPlan` | `string` | nombre del ultimo plan registrado, o `'Sin actividad reciente'` |
| `completedSets` | `number` | sets logueados en la ultima semana |
| `totalSets` | `number` | sets planificados del programa activo |
| `consumed` | `{ cal, prot, carb, fat }` | macros consumidos (motor de nutricion) |
| `target` | `{ cal, prot, carb, fat }` | macros objetivo |
| `nutritionPercentage` | `number` | cumplimiento nutricional (0–100) |
| `lastWorkoutDate` | `string \| null` | fecha del ultimo entrenamiento (MAX server-side) |
| `lastCheckinDate` | `string \| null` | fecha del ultimo check-in |
| `currentWeight` | `number \| null` | ultimo peso registrado en check-in |
| `weightDelta7d` | `number \| null` | delta de peso vs hace ≥7 dias |
| `weightHistory30d` | `{ date, value }[]` | historial de peso ultimos 30 dias |
| `adherenceHistory4w` | `number[]` | adherencia por semana (4 ventanas) |
| `oneRMDelta` | `number \| null` | variacion % de 1RM (Epley) semana vs semana previa |
| `planDaysRemaining` | `number \| null` | dias restantes del programa activo |
| `planCurrentWeek` | `number \| null` | semana actual del programa |
| `planTotalWeeks` | `number \| null` | total de semanas del programa |
| `attentionScore` | `number` | score de atencion (0–100, ver §1.4.1) |
| `attentionFlags` | `AttentionFlag[]` | banderas de atencion (ver §1.4.1) |
| `streak` | `number` | racha de dias |
| `latestEnergyLevel` | `number \| null` | nivel de energia del ultimo check-in |

### c) Tipos del directorio — `directory-types.ts`

Define los enums que gobiernan filtros/orden de la lista. Relevantes al contenedor:

- `DirectoryRiskFilter` = `'all' | 'urgent' | 'review' | 'on_track' | 'expired_program' | 'password_reset' | 'nutrition_low'` — el estado de filtro que comparten las stat cards, los banners y la lista.
- `DirectorySortKey`, `StatusDirectoryFilter`, `ProgramDirectoryFilter`, `SORT_OPTIONS` — usados por la barra de accion de la lista (documentados en su seccion).

---

## 1.4 El encabezado de pulso de `CoachWarRoom`

`CoachWarRoom` (`apps/web/src/app/coach/clients/CoachWarRoom.tsx`, `'use client'`) recibe:

- `coachSlug?` (el identificador publico ya resuelto), `appUrl?`
- `clients: Array<{ id; force_password_change?; is_active? }>` — la **lista completa** (solo lee esos 3 campos aqui).
- `pulse: DirectoryPulseRow[]`
- `activeFilter: DirectoryRiskFilter` + `onFilterChange(f)` — controlado desde el shell.

El encabezado contiene, en orden:

1. Titulo "Directorio de Alumnos" + `InfoTooltip` (`t('section.coachClients')`).
2. Subtitulo "Gestion centralizada · panel operativo tipo War Room".
3. Linea "Actualizado al cargar la pagina" + boton **sync**.
4. (Condicional) chip **Portal alumnos** con el `loginUrl` y copiar al portapapeles.
5. Boton **"Nuevo Alumno"** (abre `CreateClientModal`).
6. El grid de **stat cards** (pulso).
7. Banners de alerta (condicionales).

> El boton "Nuevo Alumno" abre `CreateClientModal` (estado local `open`). El modal en si es una accion a nivel de lista — documentado en la seccion de modales.

### Boton "sync"

`handleSync()`: `setSyncing(true)` → `router.refresh()` → `setTimeout(() => setSyncing(false), 800)`. Es un **refetch del Server Component** (no una mutacion); recarga lista + pulso. La leyenda dice explicitamente que los datos son del momento de carga (no hay live polling).

### Chip "Portal alumnos"

`loginUrl = coachSlug && appUrl ? ${appUrl}/c/${coachSlug}/login : ''`. Solo se muestra si hay `loginUrl`. `handleCopy()` copia al portapapeles (`navigator.clipboard.writeText`) y muestra estado "copiado" por 2 s. Soporta teclado (Enter/Espacio). El `coachSlug` proviene de `getCoachPublicIdentifier(coach)` = `invite_code` (preferido) o `slug` (fallback) — ver `@/lib/coach/public-identifier`.

### 1.4.1 Las stat cards de resumen (array `statCards`)

Son **6 tarjetas** clickeables. Cada una muestra una metrica agregada sobre la cartera y, al tocarla, llama `onFilterChange(stat.filter)` (controla el filtro compartido). Tambien responden a teclado (Enter/Espacio). El valor numerico se anima con `AnimatedNumber` (spring de framer-motion que cuenta desde 0). El grid es responsive (2 → 3 → 6 columnas). La tarjeta "seleccionada" se resalta segun el filtro activo (ver §1.4.3).

Calculos **sobre toda la cartera** (sobre `clients` y/o `pulse`, en el cliente):

| # | `key` | label | Metrica / formula | `filter` al clic |
|---|---|---|---|---|
| 1 | `total` | **Total** | `clients.length` (total de alumnos en el scope) | `all` |
| 2 | `active` | **Activos** | `clients.filter(c => !c.force_password_change && c.is_active !== false).length` (activos = NO requieren cambio de password Y `is_active` distinto de `false`) | `all` |
| 3 | `review` | **Atencion** (⚠️) | `pulse.filter(p => p.attentionScore >= 25 && p.attentionScore < 50).length` | `review` |
| 4 | `urgent` | **Riesgo** (🔴) | `pulse.filter(p => p.attentionScore >= 50).length` | `urgent` |
| 5 | `avg` | **Avg Adher.** (`%`) | `pulse.length > 0 ? round(sum(p.percentage) / pulse.length) : 0` (promedio de adherencia de entrenamiento) | `all` |
| 6 | `nutrition_low` | **Nutri. baja** (🥗) | `pulse.filter(p => p.attentionFlags.includes('NUTRICION_RIESGO')).length` | `nutrition_low` |

Notas sobre las stat cards:

- Cards 1, 2 y 5 tienen `filter: 'all'` → tocarlas **resetea** el filtro (no filtran a un subconjunto). Card 5 es porcentaje (`isPercent`, sufijo `%`).
- Cards 3 (`review`), 4 (`urgent`) y 6 (`nutrition_low`) son las que **filtran** la lista a un subconjunto real.
- Total y Activos salen de `clients` (lista DB); Atencion/Riesgo/AvgAdher/Nutri salen de `pulse`. Como son dos fuentes con scopes distintos, en contexto team pueden no coincidir (ver §1.6).

### 1.4.2 Como se calculan los umbrales de atencion (backend)

El `attentionScore` y los `attentionFlags` que alimentan las cards 3, 4 y 6 (y los banners) se calculan **server-side** en `calculateAttentionScore` (`dashboard.service.ts`). Es una suma de penalizaciones (score 0 = sin alertas; mas alto = mas urgente):

| Condicion | Suma al score | Flag |
|---|---|---|
| Ultimo check-in hace > 30 dias (`CHECKIN_OVERDUE_AFTER_DAYS`), **solo si ya hubo algun check-in** | +25 | `SIN_CHECKIN_1M` |
| Tiene programa activo y **sin** `lastWorkoutDate`, o ultimo workout hace ≥ 7 dias (`WORKOUT_INACTIVE_AFTER_DAYS`) | +25 | `SIN_EJERCICIO_7D` |
| `nutritionCompliance < 60` | +20 | `NUTRICION_RIESGO` |
| `planDaysRemaining <= 0` | +15 | `PROGRAMA_VENCIDO` |
| `planDaysRemaining <= 3` (y > 0) | +8 | `PROGRAMA_POR_VENCER` |
| `oneRMDelta < -5` (1RM cayendo > 5%) | +15 | `FUERZA_CAYENDO` |

Buckets de severidad usados por la UI:
- **Riesgo (urgent):** `attentionScore >= 50`.
- **Atencion (review):** `25 <= attentionScore < 50`.
- (`on_track` = bajo 25, usado por la lista, no por una stat card.)

Estos umbrales viven en `dashboard.service.ts` (`CHECKIN_OVERDUE_AFTER_DAYS = 30`, `WORKOUT_INACTIVE_AFTER_DAYS = 7`, nutricion < 60, etc.), no en el cliente. El cliente solo agrega/cuenta sobre los resultados.

### 1.4.3 Resaltado de la card seleccionada

```
selected = activeFilter === 'all'
    ? stat.key === 'total'
    : stat.filter !== 'all' && stat.filter === activeFilter
```

Es decir: con filtro `all` se resalta **Total**; con cualquier otro filtro se resalta la card cuyo `stat.filter` coincide (solo las cards filtrantes pueden resaltarse). Filtros que no tienen stat card propia (p. ej. `expired_program`, `password_reset` activados por banners) no resaltan ninguna card.

### 1.4.4 Banners de alerta (debajo de las stat cards)

Son llamados a la accion condicionales. Cada uno muestra un conteo y un boton "Ver" que llama `onFilterChange(...)`. Conteos calculados en el cliente sobre `pulse`/`clients`:

| Banner | Condicion de aparicion | Conteo | Filtro del boton "Ver" |
|---|---|---|---|
| Atencion urgente | `urgentCount > 0` | `urgentCount` (score ≥ 50) | `urgent` |
| Programas vencidos | `expiredProgramsCount > 0` | `pulse.filter(p => p.planDaysRemaining !== null && p.planDaysRemaining <= 0).length` | `expired_program` |
| Cambio de password pendiente | `pendingPassword > 0` | `clients.filter(c => c.force_password_change).length` | `password_reset` |
| Nutricion baja | `nutritionLowCount > 0` | alumnos con flag `NUTRICION_RIESGO` (< 60%) | `nutrition_low` |
| Sin check-in 1 mes | `noCheckin1m > 0` **y** `urgentCount === 0` | alumnos con flag `SIN_CHECKIN_1M` | `urgent` |

- El banner "sin check-in 1 mes" es secundario: solo aparece cuando **no** hay urgentes (para no duplicar la senal, ya que `SIN_CHECKIN_1M` aporta +25 y suele estar dentro de los urgentes).
- Los filtros `expired_program` y `password_reset` se disparan **solo desde banners** (no tienen stat card).

---

## 1.5 Como se compone la pantalla (`CoachClientsShell` / `CoachWarRoom`)

`CoachClientsShell` (`'use client'`) es el orquestador del estado compartido. Recibe `clients`, `coach`, `appUrl`, `pulse` del Server Component y:

1. Mantiene `riskFilter` (`useState<DirectoryRiskFilter>('all')`) — **estado unico de filtro de riesgo**, compartido por cabecera y lista.
2. Resuelve `publicIdentifier = getCoachPublicIdentifier(coach)` (invite_code → slug).
3. Construye `pulseByClientId` (`useMemo`): un `Record<clientId, DirectoryPulseRow>` para que la lista cruce cada alumno con su pulso por id en O(1).
4. Renderiza en orden:
   - `CoachWarRoom` (cabecera + pulso) → recibe `activeFilter={riskFilter}` y `onFilterChange={setRiskFilter}`.
   - `ClientsDirectoryClient` (la lista) → recibe `clients`, `coach`, `publicIdentifier`, `appUrl`, `riskFilter`, `onRiskFilterChange={setRiskFilter}`, `pulseByClientId`.

Consecuencia de diseno clave: **el filtro vive arriba**. Tocar una stat card o un banner en la cabecera (`onFilterChange`) cambia `riskFilter` en el shell, que lo baja a la lista; y la lista tambien puede cambiarlo (`onRiskFilterChange`), manteniendo cabecera y lista sincronizadas. La cabecera y la lista consumen el mismo `pulse`, pero la lista lo recibe indexado (`pulseByClientId`) y la cabecera lo recibe como array (para agregar).

### Memoizacion / dedup (rendimiento)

- `getCoachClientsWithPrograms` y `getCachedDirectoryPulse` son `React.cache` → una sola ejecucion por request aunque se invoquen desde varios puntos del arbol RSC.
- `getPreferredWorkspaceForRender` tambien es `React.cache` keyeado por `userId`: en un render de `/coach/*` el workspace lo resuelven layout + page + `_data` (2–4 veces); esto dedupea a una. Es **RSC-only** (prohibido en proxy/Edge y en `/api/mobile/*`).
- El pulse del directorio comparte cache con las stats del dashboard (`DIRECTORY_PULSE_CACHE_TAG` reservado para futuras invalidaciones con `revalidateTag`; **no** se usa `unstable_cache` porque depende de `cookies()` via Supabase SSR y rompe el RSC en prod).

---

## 1.6 Scoping por contexto (standalone / team / org)

El directorio esta **scopeado por el workspace activo, sin cruzar contextos**. RLS es el techo; los filtros explicitos solo pueden sub-mostrar, nunca traer de otro tenant.

`WorkspaceSummary` (de `getPreferredWorkspaceForRender`) puede ser, entre otros:
- `coach_standalone` (`coachId`)
- `enterprise_coach` (`orgId`, `coachId`, `memberId`)
- `coach_team` (`coachId`, `teamId`)

La page deriva `orgId` (solo si `enterprise_coach`) y `activeTeamId` (solo si `coach_team`).

### a) Scope de la LISTA — `getCoachClientsWithPrograms(coachId, { orgId, activeTeamId })`

Tres ramas mutuamente excluyentes (segun el comentario del archivo y el codigo):

- **Enterprise** (`orgId` presente): `clients.eq('coach_id', coachId).eq('org_id', orgId)` — solo clientes de esa org asignados al coach.
- **Team** (`activeTeamId` presente, sin org): `clients.is('org_id', null).eq('team_id', activeTeamId)` — todos los alumnos de **ese pool** (no filtra por `coach_id`; el pool es plano, RLS es el techo).
- **Standalone** (sin org ni team): `clients.eq('coach_id', coachId).is('org_id', null).is('team_id', null)` — solo clientes propios que NO son de pool ni de enterprise.

### b) Scope del PULSO — `getCoachClientsPulse(coachId, orgId)` → `getDirectoryPulse(coachId, orgId)`

El pulso filtra **siempre por `coach_id = coachId`** y ademas:
- Si `orgId` se pasa (no `undefined`): `org_id = orgId` (si truthy) o `org_id IS NULL` (si null).
- **No** recibe `activeTeamId`.

```
clientsQuery = clients.select('id, full_name').eq('coach_id', coachId)
if (orgId !== undefined) clientsQuery = orgId ? .eq('org_id', orgId) : .is('org_id', null)
```

### Divergencia conocida lista vs pulso (relevante para rediseno)

En contexto **team**, la lista trae el pool completo por `team_id` (alumnos de varios coaches del equipo), pero el pulso filtra por `coach_id = coachId`. Resultado: las stat cards basadas en **pulso** (Atencion, Riesgo, Avg Adher., Nutri. baja) pueden contar **menos** alumnos que las basadas en la **lista** (Total, Activos), porque un alumno del pool sin pulso del coach actual no aparecera en `pulseByClientId`. Total/Activos cuentan el pool entero; las metricas de pulso cuentan solo los alumnos cuyo `coach_id` es el del coach que mira. Cualquier rediseno que prometa paridad de conteos en team debe alinear el scope del pulso con el de la lista (pasar `activeTeamId` a `getDirectoryPulse`, hoy no se hace).

En **standalone** y **enterprise** ambos scopes coinciden (mismo `coach_id` [+ `org_id`]), salvo el matiz de que la lista exige `team_id IS NULL` en standalone y el pulso no menciona `team_id`.

---

## 1.7 Detalles backend del pulso (resumen de queries y limites)

`getDirectoryPulseInner` (medido con `measureServer`) ejecuta, por chunks de clientes, varias cargas en paralelo y arma cada `DirectoryPulseRow`:

- **Clientes:** `clients.select('id, full_name')` scopeado (§1.6.b).
- **Chunking:** `CLIENT_ID_IN_CHUNK = 120` (limite de UUID por `.in()`), `PROGRAM_ID_RPC_CHUNK = 80`. Pensado para el War Room real (deal Movida, ~300+ alumnos por coach).
- **Workout logs:** `workout_logs` ultimos 35 dias, `.limit(WORKOUT_LOGS_ROW_CAP = 2000)` por chunk (tope anti-runaway; NO afecta `lastWorkoutDate`).
- **Ultimo workout (exacto):** RPC `get_clients_last_workout_date` (MAX server-side por GROUP BY) — evita la truncacion por el cap de filas. Fallback a `reduce` en memoria solo si la RPC no devolvio nada.
- **Check-ins:** `check_ins` ultimos 35 dias (`client_id, created_at, date, weight, energy_level`).
- **Programas:** `workout_programs` activos (`is_active = true`), orden `created_at` desc; se toma el mas reciente por cliente.
- **Sets planificados:** RPC `get_workout_program_planned_set_totals` por chunk de program ids; fallback `plannedSetsFromProgram` (suma de `sets` de los bloques).
- **Nutricion:** `daily_nutrition_logs` desde el corte de la ultima semana, con `nutrition_meal_logs` → `nutrition_meals` → `food_items` → `foods` anidados (denormalizado). La adherencia/macros se calcula con el motor canonico `computeNutritionAdherence` (`@eva/nutrition-engine`), respetando unidades g/ml/un.
- **Streak:** RPC batch `get_coach_clients_streaks` (requiere `auth.uid() = coach`, solo sesion `authenticated`/web). Fallback batch-by-ids `get_clients_streaks_by_ids` para los no cubiertos (ruta mobile/service_role).

Calculos derivados por cliente: `percentage` (adherencia 7d = `min(round(logsCount/totalPlannedSets*100),100)`), `adherenceHistory4w` (4 ventanas de 7 dias), `oneRMDelta` (Epley, semana vs semana previa), `planMeta` (`planDaysRemaining`/`planCurrentWeek`/`planTotalWeeks` desde `start_date`+`end_date`/`weeks_to_repeat`/`duration_days`), `weightDelta7d`, `weightHistory30d`, y finalmente `calculateAttentionScore`.

> Toda la logica de scoring/umbral vive en el server (`dashboard.service.ts`). El cliente (`CoachWarRoom`) solo cuenta/agrega los resultados para las stat cards y banners.
