# 2. Barra de accion, vistas (tabla/tarjetas), filtros, orden y estados vacios

> Alcance: este documento cubre el CONTENEDOR del War Room (`/coach/clients`): cableado de datos, encabezado de pulso, barra de accion, vista tabla, toggle tabla/tarjetas, paginacion, orden, estados vacios, modales y acciones a NIVEL DE LISTA, e importador. Las TARJETAS (`ClientCardV2`) y la FICHA (`/coach/clients/[clientId]`) tienen su propio documento — aqui solo se las referencia.

---

## 2.0 Mapa de componentes y cableado de datos (backend → UI)

### Cadena de render

`page.tsx` (RSC) → `CoachClientsShell` (cliente, estado raiz) → `CoachWarRoom` (encabezado de pulso) + `ClientsDirectoryClient` (lista) → `DirectoryActionBar` / `ClientsDirectoryTable` / grid de `ClientCardV2` / `ClientsDirectoryEmpty`.

### Carga de datos en el servidor (`page.tsx`)

`CoachClientsPage` es un RSC `async`. Pasos backend:

1. `getCoach()` → si no hay sesion, `redirect('/login')`.
2. `getPreferredWorkspaceForRender(coachSession.id)` → resuelve el workspace activo. De ahi deriva:
   - `orgId` = `workspace.orgId` solo si `workspace.type === 'enterprise_coach'`, si no `null`.
   - `activeTeamId` = `workspace.teamId` solo si `workspace.type === 'coach_team'`, si no `null`.
3. `Promise.all` de tres cosas en paralelo:
   - `getCoachClientsWithPrograms(coachSession.id, { orgId, activeTeamId })`
   - `headers()` (para derivar `host` → `appUrl`)
   - `getCoachClientsPulse(coachSession.id, orgId)`
4. `appUrl` se arma desde el header `host`: protocolo `http` si `host` incluye `localhost`, si no `https`.
5. Render: `<CoachClientsShell clients={clients} coach={coach} appUrl={appUrl} pulse={pulse} />` dentro de un contenedor `max-w-[1600px]`.

> `coach` que se pasa al shell es solo `{ slug, invite_code }` (fuente del identificador publico).

### Query del listado: `getCoachClientsWithPrograms` (`_data/clients.queries.ts`)

- `React.cache`. Tabla `clients`, `select('*, workout_programs(name, start_date, weeks_to_repeat, is_active)')`, `order('created_at', { ascending: false })`.
- **Scoping del directorio por workspace activo** (RLS es el techo; este filtro solo puede sub-mostrar):
  - enterprise (`orgId`): `.eq('coach_id', coachId).eq('org_id', orgId)`.
  - team (`activeTeamId`): `.is('org_id', null).eq('team_id', activeTeamId)` (todo el pool del team, no solo lo propio).
  - standalone: `.eq('coach_id', coachId).is('org_id', null).is('team_id', null)`.
- Devuelve `ClientWithProgram[]` (= `Tables<'clients'>` + array `workout_programs` parcial).
- El `select('*')` trae TODAS las columnas de `clients`, por eso el componente cliente puede leer `full_name`, `email`, `phone`, `is_active`, `is_archived`, `force_password_change`, `subscription_start_date`, etc. directamente del objeto `client`.

### Query del pulso: `getCoachClientsPulse` → `getCachedDirectoryPulse` → `DashboardService.getDirectoryPulse`

- `getCachedDirectoryPulse(coachId, orgId)` es `React.cache` (una sola carga de pulse por request; compartida con stats del dashboard). NO usa `unstable_cache` porque el pulse depende de `cookies()` via Supabase SSR.
- Existe un tag `DIRECTORY_PULSE_CACHE_TAG = 'directory-pulse'` reservado para futuras invalidaciones con `revalidateTag` (hoy no se usa para invalidar).
- Devuelve `DirectoryPulseRow[]`. Cada fila se calcula por alumno en `getDirectoryPulseInner` (ver 2.1).

### Estado raiz: `CoachClientsShell`

- `useState<DirectoryRiskFilter>('all')` → `riskFilter`. Es el UNICO estado que vive en el shell, porque lo COMPARTEN el encabezado de pulso (las stat cards lo setean) y la lista (la barra de filtros lo lee/escribe).
- `publicIdentifier = getCoachPublicIdentifier(coach)` (codigo/slug publico del coach).
- `pulseByClientId`: `useMemo` que indexa el array `pulse` por `p.clientId` → `Record<string, DirectoryPulseRow>`. Es la estructura que consumen tanto la tabla como las tarjetas para mirar el pulso de cada fila en O(1).
- Renderiza `CoachWarRoom` (encabezado) + `ClientsDirectoryClient` (lista), ambos recibiendo `riskFilter`/`onFilterChange`.

---

## 2.1 Como se calculan las metricas de pulso (backend)

Todas las metricas de pulso vienen de `DirectoryPulseRow` (`services/dashboard.service.ts`). Campos relevantes para el contenedor:

| Campo `DirectoryPulseRow` | Significado | Uso en el contenedor |
|---|---|---|
| `clientId` | id del alumno | clave de `pulseByClientId` |
| `attentionScore` | score 0+ de urgencia (suma de penalizaciones) | stat cards, badge tabla, filtros de riesgo, orden |
| `attentionFlags` | array de flags (`AttentionFlag[]`) | alertas, filtro nutricion, icono nutri tabla |
| `percentage` | adherencia de ENTRENAMIENTO ultima semana (0-100) | stat "Avg Adher.", barra tabla, orden adherencia |
| `nutritionPercentage` | cumplimiento nutricional (0-100) | base del flag `NUTRICION_RIESGO` |
| `lastWorkoutDate` | fecha del ultimo log de entreno (`string\|null`) | columna "Ultimo", orden ultima actividad |
| `currentWeight` | ultimo peso de check-in (`number\|null`) | columna "Peso" |
| `weightDelta7d` | delta de peso vs check-in de hace >=7d (`number\|null`) | columna "Peso (7d)", orden por mayor cambio |
| `planDaysRemaining` | dias restantes del programa activo (`number\|null`) | columna "Dias", filtros vencido, stat programas vencidos |

### `attentionScore` y `attentionFlags` — `calculateAttentionScore`

Suma de penalizaciones (no esta acotado a 100; con todas las condiciones puede pasar de 50):

- **+25** y flag `SIN_CHECKIN_1M` si HAY al menos un check-in y pasaron `> 30` dias (`CHECKIN_OVERDUE_AFTER_DAYS`) desde el ultimo. (Si nunca hubo check-in, NO penaliza.)
- Si el alumno tiene programa activo (`hasActiveWorkoutProgram`):
  - **+25** y flag `SIN_EJERCICIO_7D` si no hay `lastWorkoutDate`, o si pasaron `>= 7` dias (`WORKOUT_INACTIVE_AFTER_DAYS`) desde el ultimo entreno.
- **+20** y flag `NUTRICION_RIESGO` si `nutritionCompliance < 60`.
- Programa: **+15** y flag `PROGRAMA_VENCIDO` si `planDaysRemaining !== null && <= 0`; si no, **+8** y `PROGRAMA_POR_VENCER` si `<= 3`.
- **+15** y flag `FUERZA_CAYENDO` si `oneRMDelta < -5` (caida de fuerza estimada por Epley).

> Umbrales de severidad usados por toda la UI: **score >= 50 = urgente/Riesgo**, **25 <= score < 50 = revision/Atencion**, **score < 25 = on track**.

### `percentage` (adherencia de entreno)

- `totalPlannedSets` = sets planificados del programa activo (de `plannedSetTotals` por programa, o derivado del programa).
- `logsCount` = logs de la ultima semana.
- `percentage = min(round(logsCount / totalPlannedSets * 100), 100)`; si `totalPlannedSets === 0` → `0`.

### `nutritionPercentage`

- Se calcula con el motor canonico `computeNutritionAdherence` (`@eva/nutrition-engine`) sobre logs nutricionales denormalizados; `round(summary.compliancePct)`. Es la base de `NUTRICION_RIESGO` (< 60).

### `weightDelta7d`

- `currentWeight` = peso del check-in mas reciente con `weight != null`.
- `weightDelta7d` = `round((currentWeight - ref.weight) * 10) / 10` donde `ref` es el primer check-in con `>= 7` dias de antiguedad. `null` si no hay referencia.

### `planDaysRemaining`

- Derivado en `planMeta(activeProgram, now)` (`differenceInDays(endDate, now)`). `null` si no hay programa activo o no se puede calcular.

---

## 2.2 Encabezado de pulso — `CoachWarRoom` (stat cards + alertas)

> Componente cliente. Recibe `coachSlug`, `appUrl`, `clients` (solo `id`, `force_password_change`, `is_active`), `pulse: DirectoryPulseRow[]`, `activeFilter`, `onFilterChange`.

### Bloque de cabecera

- Titulo "Directorio de Alumnos" + `InfoTooltip` con `t('section.coachClients')`.
- Subtitulo: "Gestion centralizada · panel operativo tipo War Room".
- Linea "Actualizado al cargar la pagina" con boton **sync**: `handleSync` activa `syncing`, llama `router.refresh()` y resetea el spinner a los 800 ms. NO hay polling ni realtime — el pulse se recalcula solo al recargar/refrescar.
- **Portal alumnos** (solo si hay `loginUrl`): chip clickeable con el URL `${appUrl}/c/${coachSlug}/login`; `handleCopy` lo escribe al clipboard (`navigator.clipboard.writeText`) y muestra "copiado" por 2000 ms. Tambien accesible por teclado (Enter/Espacio).
- Boton **Nuevo Alumno** (icono `UserPlus`): abre `CreateClientModal` (estado local `open`). Hay un segundo `CreateClientModal` montado al final del componente.

### Metricas calculadas en cliente (sobre `clients` + `pulse`)

| Var | Calculo |
|---|---|
| `total` | `clients.length` |
| `active` | `clients.filter(c => !c.force_password_change && c.is_active !== false).length` |
| `urgentCount` | `pulse.filter(p => p.attentionScore >= 50).length` |
| `reviewCount` | `pulse.filter(p => p.attentionScore >= 25 && < 50).length` |
| `avgAdherence` | promedio de `p.percentage` redondeado; `0` si no hay pulse |
| `expiredProgramsCount` | `pulse.filter(p => p.planDaysRemaining !== null && <= 0).length` |
| `noCheckin1m` | `pulse.filter(p => flags incluye 'SIN_CHECKIN_1M').length` |
| `pendingPassword` | `clients.filter(c => c.force_password_change).length` |
| `nutritionLowCount` | `pulse.filter(p => flags incluye 'NUTRICION_RIESGO').length` |

> `total`/`active`/`pendingPassword` se calculan sobre `clients` (que el scope de pagina pudo restringir, pero NO excluye archivados — `clients.length` cuenta archivados tambien). Las metricas de pulso vienen de `pulse` (filas que el servicio devolvio).

### Stat cards (6, son botones-filtro)

Cada card al hacer click llama `onFilterChange(stat.filter)`. Una card se marca seleccionada si: con `activeFilter === 'all'` solo la de `total`; si no, la card cuyo `filter` (no `'all'`) coincide con `activeFilter`. Valores que aparecen con `AnimatedNumber` (spring).

| key | label | valor | filtro al click |
|---|---|---|---|
| `total` | Total | `total` | `'all'` |
| `active` | Activos | `active` | `'all'` |
| `review` | Atencion (sub ⚠️) | `reviewCount` | `'review'` |
| `urgent` | Riesgo (sub 🔴) | `urgentCount` | `'urgent'` |
| `avg` | Avg Adher. (sufijo %) | `avgAdherence` | `'all'` |
| `nutrition_low` | Nutri. baja (sub 🥗) | `nutritionLowCount` | `'nutrition_low'` |

### Banners de alerta condicionales (cada uno con boton "Ver" que setea el filtro)

1. `urgentCount > 0`: "N cliente(s) con atencion urgente (score >= 50)" → filtro `'urgent'`.
2. `expiredProgramsCount > 0`: "N programa(s) vencido(s)" → filtro `'expired_program'`.
3. `pendingPassword > 0`: "N alumno(s) con cambio de contrasena pendiente" → filtro `'password_reset'`.
4. `nutritionLowCount > 0`: "🥗 N alumno(s) con cumplimiento nutricional bajo (<60%)" → filtro `'nutrition_low'`.
5. `noCheckin1m > 0 && urgentCount === 0`: "ALERTA: N cliente(s) llevan mas de 1 mes sin check-in" → filtro `'urgent'` (este banner se oculta si ya hay urgentes, para no duplicar ruido).

> NOTA backend: los filtros `'expired_program'` y `'password_reset'` que setean estos banners SI los aplica `ClientsDirectoryClient.matchesRiskFilter`, pero NO tienen card propia en el encabezado ni opcion en el dropdown de la barra (ver 2.4). Solo se alcanzan via banner.

---

## 2.3 Toggle de vista (tabla/tarjetas) y paginacion — `ClientsDirectoryClient`

> Componente cliente. Recibe `clients`, `coach`, `publicIdentifier`, `appUrl`, `riskFilter`, `onRiskFilterChange`, `pulseByClientId`.

### Estados locales

- `search: string` (default `''`).
- `sortKey: DirectorySortKey` (default `'attention_score'`).
- `sortDir: 'asc' | 'desc'` (default `defaultSortDir('attention_score')` = `'desc'`).
- `view: 'grid' | 'table'` (**default `'table'`**).
- `statusFilter: StatusDirectoryFilter` (default `'any'`).
- `programFilter: ProgramDirectoryFilter` (default `'any'`).
- `gridVisibleCount: number` (default `48`) — limite de tarjetas visibles en modo grid.

> El `riskFilter` NO es estado local de este componente: vive en `CoachClientsShell` y se controla por props (compartido con el encabezado).

### Reset de paginacion

`useEffect` que resetea `gridVisibleCount = 48` cada vez que cambia `search`, `riskFilter`, `statusFilter`, `programFilter`, `sortKey`, `sortDir` o `view`.

### Pipeline de datos (todo client-side, en memoria)

1. `filteredClients` (`useMemo`): por cada `client`, combina con AND:
   - `matchesSearch`: `client.full_name` o `client.email` (lowercased) incluye `search.toLowerCase()`.
   - `matchesRiskFilter(client, pulse, riskFilter)`.
   - `matchesStatusFilter(client, statusFilter)`.
   - `matchesProgramFilter(client, pulse, programFilter)`.
2. `sortedClients` (`useMemo`): `sortClientsByKey(filteredClients, pulseByClientId, sortKey, sortDir)`.
3. `gridClients` (`useMemo`): `sortedClients.slice(0, gridVisibleCount)` (solo afecta al modo grid).

> Toda la busqueda/filtro/orden/paginacion es CLIENT-SIDE sobre el array ya cargado. No hay queries adicionales al cambiar filtros. La RLS y el scope de pagina ya acotaron el universo.

### Conteo de archivados y short-circuit de vacio

- `archivedCount = clients.filter(c => c.is_archived === true).length`.
- `nonArchivedCount = clients.length - archivedCount`.
- Si `nonArchivedCount === 0 && archivedCount === 0` → retorna `<ClientsDirectoryEmpty />` ANTES de renderizar barra/lista (estado "sin alumnos", ver 2.6).

### Render condicional del cuerpo

- Si `sortedClients.length === 0` → tarjeta inline "Sin resultados" (ver 2.6).
- Si `view === 'table'` → `<ClientsDirectoryTable clients={sortedClients} ... />` (la tabla recibe ya filtrado/ordenado, y ademas re-ordena internamente, ver 2.5).
- Si no (grid) → `motion.div` con grid de `ClientCardV2` (ver doc de cards) + boton **"Cargar mas"**.

### Paginacion "Cargar mas" (solo grid)

- Visible si `sortedClients.length > gridVisibleCount`.
- Texto: `Cargar mas (${sortedClients.length - gridVisibleCount} restantes)`.
- Click: `setGridVisibleCount(n => Math.min(n + 48, sortedClients.length))` → suma de a **48**.

### Construccion de links por tarjeta (en el grid)

Por cada `client` en `gridClients` el contenedor calcula y pasa a `ClientCardV2`:
- `loginUrl = coach && appUrl ? ${appUrl}/c/${publicIdentifier}/login : ''`.
- `whatsappLink`: si `client.phone`, `https://wa.me/<phone sin no-digitos>?text=<encoded "Hola <nombre>, aqui tienes tu link...">`; si no, `'#'`.
- `subscriptionDaysRemaining`: si hay `subscription_start_date`, dias hasta `start + 1 mes` (`Math.ceil(diff/dia)`); si no `null`.
- `activeProgramName = client.workout_programs.find(p => p.is_active)?.name || null`.
- `remainingDays = pulse?.planDaysRemaining ?? null`.

---

## 2.4 Barra de accion — `DirectoryActionBar`

> Componente cliente sticky. Recibe `search`, `sortKey`, `view`, `statusFilter`, `programFilter`, `riskFilter` y sus handlers + `archivedCount`.

### Busqueda

- `Input` con placeholder "Buscar alumno... (⌘K)", `onChange` → `onSearchChange`.
- Atajo de teclado: `useEffect` registra listener global; `Cmd/Ctrl + K` hace `preventDefault` y enfoca el input (hay un `<kbd>⌘K</kbd>` visible en sm+).
- La busqueda matchea por **nombre completo o email** (no por telefono).

### Dropdown "Filtros" (`DropdownMenu`, 3 grupos)

| Grupo | Item | Accion |
|---|---|---|
| **Estado** | Activo | `onStatusFilterChange('active')` |
| | Pausado | `onStatusFilterChange('paused')` |
| | Pendiente Sync | `onStatusFilterChange('pending_sync')` |
| | Archivados (badge `archivedCount` si > 0) | `onStatusFilterChange('archived')` |
| **Riesgo** | Atencion Urgente | `onRiskFilterChange('urgent')` |
| | En Riesgo | `onRiskFilterChange('review')` |
| | On Track | `onRiskFilterChange('on_track')` |
| | Nutricion baja (<60%) | `onRiskFilterChange('nutrition_low')` |
| **Programa** | Con Programa | `onProgramFilterChange('with_program')` |
| | Sin Programa | `onProgramFilterChange('no_program')` |
| | Vencido | `onProgramFilterChange('expired')` |

> El dropdown NO expone opciones para `riskFilter` `'expired_program'` ni `'password_reset'` (esos solo se setean desde banners/cards del encabezado), aunque el motor de filtro los soporta.

### Dropdown "Ordenar"

- Trigger muestra el label del `sortKey` actual (de `SORT_OPTIONS`).
- Lista `SORT_OPTIONS`; click → `onSortChange(opt.value)` (que en el contenedor resetea `sortDir` al default de la key). El item activo se resalta.

### Toggle de vista

- Dos botones: cuadricula (`LayoutGrid`) → `onViewChange('grid')`; tabla (`Table2`) → `onViewChange('table')`. El activo se marca.

### Chips de filtros activos

Se construye un array `chips` y se renderizan bajo la barra (con separador) si hay alguno. Cada chip es un boton que al click ejecuta `onRemove` (resetea ese filtro). Mapeo:

- Risk: `urgent`→"Atencion urgente", `review`→"En revision", `on_track`→"On track", `expired_program`→"Programa vencido", `password_reset`→"Pendiente sync", `nutrition_low`→"Nutricion baja" (todos `onRiskFilterChange('all')`).
- Status: `active`→"Activo", `paused`→"Pausado", `pending_sync`→"Pendiente sync", `archived`→"Archivados" (todos `onStatusFilterChange('any')`).
- Program: `with_program`→"Con programa", `no_program`→"Sin programa", `expired`→"Programa vencido" (todos `onProgramFilterChange('any')`).

> Los tres ejes de filtro (risk, status, program) + busqueda son INDEPENDIENTES y se combinan con AND. No hay boton "limpiar todo"; se quitan chip por chip.

> NO existe en esta barra un boton "Importar" ni "Nuevo alumno". El alta esta en el encabezado (`CoachWarRoom`); el importador es una ruta aparte (ver 2.8).

---

## 2.5 Logica de filtros (motor, en `ClientsDirectoryClient`)

### `matchesRiskFilter(client, pulse, filter: DirectoryRiskFilter)`

| filter | condicion |
|---|---|
| `all` | siempre `true` |
| `urgent` | `pulse && attentionScore >= 50` |
| `review` | `pulse && 25 <= attentionScore < 50` |
| `on_track` | `pulse && attentionScore < 25` |
| `expired_program` | `pulse && planDaysRemaining !== null && <= 0` |
| `password_reset` | `client.force_password_change` |
| `nutrition_low` | `pulse && flags incluye 'NUTRICION_RIESGO'` |

> Si un alumno no tiene fila de pulse, los filtros que dependen de pulse lo excluyen (excepto `all` y `password_reset`, que miran el `client`).

### `matchesStatusFilter(client, filter: StatusDirectoryFilter)`

- `archived` → `client.is_archived === true` (UNICA vista que muestra archivados).
- En cualquier otra vista, si `client.is_archived === true` → `false` (los archivados se ocultan por defecto).
- `any` → `true`.
- `active` → `client.is_active !== false && !client.force_password_change`.
- `paused` → `client.is_active === false`.
- `pending_sync` → `client.force_password_change` truthy.

### `matchesProgramFilter(client, pulse, filter: ProgramDirectoryFilter)`

- `any` → `true`.
- `hasProgram = client.workout_programs.some(p => p.is_active)`.
- `with_program` → `hasProgram`; `no_program` → `!hasProgram`.
- `expired` → `pulse && planDaysRemaining !== null && <= 0`.

---

## 2.6 Orden — `clientsDirectorySort.ts` y `directory-types.ts`

### `DirectorySortKey` y `SORT_OPTIONS` (labels del dropdown)

| value | label en dropdown | default dir |
|---|---|---|
| `attention_score` | "Urgencia (default)" | `desc` |
| `name_asc` | "Nombre A→Z" | `asc` |
| `last_activity` | "Ultima actividad" | `desc` |
| `adherence_desc` | "Adherencia ↓" | `desc` |
| `weight_delta` | "Peso: mayor cambio" | `desc` |
| `plan_days` | "Dias programa" | `asc` |

### `defaultSortDir(key)`

- `name_asc` y `plan_days` → `'asc'`; todo lo demas → `'desc'`.

### `sortClientsByKey(clients, pulseByClientId, sortKey, dir)`

Hace `[...clients].sort(...)` (copia, no muta). Comparador por key:

- `attention_score`: `(p(a).attentionScore ?? 0) - (p(b).attentionScore ?? 0)`.
- `name_asc`: `a.full_name.localeCompare(b.full_name, 'es')`.
- `last_activity`: compara timestamps de `lastWorkoutDate` (0 si null).
- `adherence_desc`: `(p(a).percentage ?? 0) - (p(b).percentage ?? 0)`.
- `weight_delta`: `Math.abs(p(a).weightDelta7d ?? 0) - Math.abs(p(b).weightDelta7d ?? 0)` (ordena por MAGNITUD del cambio, sube/baja).
- `plan_days`: `planDaysRemaining` con `null` mapeado a `99999` (los sin programa quedan al final en asc).
- default: `0`.

Al final, si `dir === 'desc'` invierte (`cmp = -cmp`).

> Doble orden: `ClientsDirectoryClient` ya ordena (`sortedClients`) y `ClientsDirectoryTable` vuelve a llamar `sortClientsByKey` internamente sobre las props recibidas. Misma funcion → resultado idempotente.

---

## 2.7 Vista TABLA — `ClientsDirectoryTable`

> Componente cliente. Recibe `clients` (ya filtrado/ordenado), `pulseByClientId`, `sortKey`, `sortDir`, `onSortChange`, `coachSlug`, `appUrl`.

### Virtualizacion

- `useVirtual = sorted.length > 20`. Con `@tanstack/react-virtual` (`useVirtualizer`): `estimateSize 56`, `overscan 8`, `enabled: useVirtual`. Con <= 20 filas renderiza todas sin virtualizar.
- Contenedor de scroll vertical con `max-h-[70vh]` solo cuando virtualiza. Scroll horizontal unico (encabezado + filas comparten `min-w-[920px]`); hay un aviso "Desliza horizontalmente en movil" en mobile.

### Columnas (9 columnas; grid fija)

| # | Header | Dato mostrado | Fuente |
|---|---|---|---|
| 1 | **Alumno** (sort `name`) | inicial + `full_name` + `email` | `client` |
| 2 | **Estado** (no sort) | badge via `StatusCell` | `client` |
| 3 | **Score** (sort `score`) | badge numerico via `ScoreBadge` | `pulse.attentionScore ?? 0` |
| 4 | **Adh.** (sort `adherence`) | icono nutri (si flag) + barra + `%` | `pulse.attentionFlags`, `pulse.percentage ?? 0` |
| 5 | **Peso** (sort `weight`) | `currentWeight kg` + `weightDelta7d (7d)` | `pulse` |
| 6 | **Ultimo** (sort `last`) | dot de color + "Hoy/Ayer/Hace Nd/—" | `pulse.lastWorkoutDate` |
| 7 | **Programa** (no sort, solo lg+) | nombre del programa activo o "—" | `client.workout_programs.find(is_active).name` |
| 8 | **Dias** (sort `days`) | `planDaysRemaining` o "—" | `pulse` |
| 9 | **Acc.** (no sort) | botones de accion por fila | — |

### Detalle de celdas

- **Estado** (`StatusCell`, prioridad): `is_archived === true`→"Archivado"; `is_active === false`→"Pausado"; `force_password_change`→"Pend. sync"; si no → "Activo".
- **Score** (`ScoreBadge`): >= 50, >= 25, o menor (tres severidades). Muestra el numero.
- **Adh.**: si `attentionFlags` incluye `NUTRICION_RIESGO`, muestra icono `Apple` con `title="Adherencia nutricional baja (menos del 60%)"`. Barra de progreso ancho `percentage%` (color `var(--theme-primary, #007AFF)`) + `%` numerico.
- **Ultimo**: `daysSince = differenceInDays(now, lastWorkoutDate)` (o `999` si no hay). Dot: `< 3` verde, `< 7` ambar, else rojo. Texto: 0→"Hoy", 1→"Ayer", else "Hace Nd"; "—" si sin fecha.
- **Peso**: `currentWeight kg` o "—"; segunda linea `±weightDelta7d (7d)` si no es null.
- **Dias**: `planDaysRemaining` numerico o "—".

### Encabezados ordenables — `HeaderBtn` y `COL_TO_SORT`

Mapa columna→sortKey: `name`→`name_asc`, `score`→`attention_score`, `adherence`→`adherence_desc`, `weight`→`weight_delta`, `last`→`last_activity`, `days`→`plan_days`. Las columnas `status`, `program`, `acc` NO son ordenables (render como label plano).

Click en header ordenable: si ya esta activo, toggle de direccion (`asc`↔`desc`); si no, setea esa key con `defaultSortDir(sk)`. Indicador `ArrowUpDown` + flecha `↑/↓` cuando activo. Llama `onSortChange(key, dir)` → `handleSortFromTable` en el contenedor (setea ambos `sortKey` y `sortDir`).

### Interaccion de fila

- Toda la fila es clickeable/teclado: `onClick`/Enter → `router.push('/coach/clients/<id>')` (a la FICHA, ver su doc).
- Las acciones de la columna **Acc.** estan en un contenedor con `stopPropagation` (no navegan). Botones:
  1. **Ver perfil** (`Eye`): `Link` a `/coach/clients/<id>`.
  2. **WhatsApp** ("WA"): solo si `client.phone && loginUrl`; abre `https://wa.me/<phone sin no-digitos>?text=<encoded "Hola <nombre>! 👋 Soy tu coach. Aqui esta tu link...">` en pestana nueva. `loginUrl = coachSlug && appUrl ? ${appUrl}/c/${coachSlug}/login : ''`.
  3. **Editar datos** (`Pencil`): setea `editingClient = { id, name }` → abre `EditClientDataModal` (ver 2.8).
  4. **`ArchiveClientButton`** (archivar/reactivar).
  5. **`DeleteClientButton`** (eliminar).

> Las acciones de fila aqui son las MISMAS acciones a nivel de lista descritas en 2.8 (mismos componentes).

---

## 2.8 Estados vacios

### `ClientsDirectoryEmpty` (cero alumnos, ni archivados)

Mostrado por `ClientsDirectoryClient` cuando `nonArchivedCount === 0 && archivedCount === 0`.
- Animacion Lottie (`LOTTIE_CLIPBOARD_LIST_URL`) con fallback `ClipboardList`.
- Titulo "Tu equipo te espera", texto "Agrega tu primer alumno y empieza a transformar vidas".
- Boton **"Nuevo alumno"** → abre `CreateClientModal` (estado local `open`).

### Vacio por filtro/busqueda (inline en `ClientsDirectoryClient`)

Mostrado cuando hay alumnos pero `sortedClients.length === 0`. Tarjeta con icono `Users`, titulo "Sin resultados":
- Si hay `search`: "Prueba buscando por email o nombre completo. Termino: \"<search>\"".
- Si no: "Ningun alumno coincide con los filtros activos."

> Diferencia clave: el primero es "no tienes alumnos" (ofrece crear); el segundo es "tus filtros no devuelven nada" (no ofrece crear, solo informa).

---

## 2.9 Modales y acciones a NIVEL DE LISTA

> Todas las acciones de lista son server actions en `_actions/clients.actions.ts` (`'use server'`). Patron comun de seguridad en cada una:
> 1. `createClient()` user-scoped + `getUser()`; si no, "No autenticado.".
> 2. `resolveCoachScope(supabase, user.id)` → si `!scope.ok`, devuelve `scope.error`.
> 3. SELECT de verificacion: `.eq('id', clientId).eq('coach_id', coachUser.id)` + `applyOrgScope(query, scope.orgId)`; si no existe → "Alumno no encontrado.".
> 4. La mutacion corre user-scoped (RLS = techo); la service-role key SOLO para GoTrue Admin (crear/borrar/cambiar password de usuario auth).
> 5. `revalidatePath('/coach/clients')` al terminar.

### `CreateClientModal` → `createClientAction`

Alta de alumno (lanzado desde el encabezado y desde `ClientsDirectoryEmpty`). Backend:
- Valida con `CreateClientSchema` (`@eva/schemas`); errores → `fieldErrors`.
- Resuelve scope; lee coach (`subscription_tier`, `max_clients`, etc.).
- **Cap de plan (solo standalone, no enterprise ni team):** cuenta `clients` con `is_archived=false` scopeado; si `>= maxClients` → `error` + `upgradeRequired: true` + `currentLimit`, y dispara email "upgrade required". (`getTierMaxClients(tier)` si `max_clients` null.)
- Chequea disponibilidad del email de plataforma (`assertPlatformEmailAvailable`, RPC SECURITY DEFINER).
- Crea usuario auth via `authAdmin.auth.admin.createUser` (service-role, `email_confirm: true`); maneja duplicados.
- INSERT en `clients` user-scoped con `force_password_change: true`, `age_confirmed_at`, `org_id: scope.orgId`, `team_id: scope.activeTeamId`. Si falla, rollback del usuario auth.
- Materializa identidad (`createClientIdentity`, non-fatal).
- Enterprise (`orgId`): inserta `coach_client_assignments` con **service-role real** (la RLS bloquearia al coach); FATAL con rollback completo si falla.
- Arma `loginUrl` (team → `/t/<slug>/login` con marca del team; standalone → `/c/<identifier>/login`) y envia email de bienvenida con `temp_password`.
- Devuelve `success`, `newClientPhone`, `loginUrl`, `clientName`.

### `EditClientDataModal` → `getClientIntakeAction` + `updateClientDataAction`

Modal de edicion lanzado desde la tabla (icono `Pencil`).
- Al abrir: `getClientIntakeAction(clientId)` carga `full_name`, `phone` + join `client_intake` (`weight_kg`, `height_cm`, `goals`, `experience_level`, `availability`, `injuries`, `medical_conditions`). Verifica `coach_id` + scope.
- Form (`useActionState` + `useFormStatus`): nombre (requerido), telefono, peso, estatura, objetivo (select fijo), experiencia (select), dias/semana (select), lesiones, condiciones medicas.
- `updateClientDataAction`: valida con `UpdateClientDataSchema`; UPDATE de `clients` (`full_name`, `phone`) user-scoped + scope; UPSERT en `client_intake` (`onConflict: 'client_id'`, numericos a `Number` o `0`, textos `''`/null). `revalidatePath` de lista y ficha. Al `state.success` el modal se cierra (`onClose`).

### `ArchiveClientButton` → `archiveClientAction` / `unarchiveClientAction`

`AlertDialog` de confirmacion. Toggle segun `isArchived`.
- **Archivar:** UPDATE `is_archived: true`; envia email "archived" (alumno pierde acceso temporal, datos se conservan).
- **Reactivar (`unarchive`):** RE-CHEQUEA el cap del plan (cuenta activos no archivados; si `>= maxClients` y no enterprise → error "Archiva otro alumno antes de reactivar este."); luego UPDATE `is_archived: false` y email "unarchived" con `loginUrl`.

### `DeleteClientButton` → `deleteClientAction`

`AlertDialog` con advertencia "No se puede deshacer".
- Verifica alumno scopeado. Caso borde coach-como-cliente: si el id existe en `coaches`, hace DELETE en `clients` (user-scoped) para no borrar la cuenta coach; si no, `authAdmin.auth.admin.deleteUser(clientId)` (borra cuenta auth y cascada).

### `ResetPasswordButton` / `ToggleStatusButton` (acciones disponibles, no montadas en la tabla del War Room)

Existen como componentes y server actions a nivel de lista:
- `resetClientPasswordAction`: genera `generateStudentTempPassword()` (patron `Eva<pin>!` que pasa el filtro HIBP de Supabase para PIN numerico), `authAdmin.auth.admin.updateUserById` + `force_password_change: true`. Devuelve `tempPassword`.
- `toggleClientStatusAction(clientId, isActive)`: UPDATE `is_active`.

> En la **vista tabla** del War Room los botones por fila son solo Ver / WA / Editar / Archivar / Eliminar. Reset password y toggle status se usan desde la FICHA / tarjetas (ver sus docs).

---

## 2.10 Importador — `/coach/clients/import`

> Ruta independiente (NO hay boton "Importar" en `DirectoryActionBar`). Es un wizard de 4 pasos. Enfasis backend abajo.

### Gating en el RSC (`import/page.tsx`)

- Auth via `getClaims()` (verificacion local del JWT, sin `/user`); si no, `/login`.
- `getCoachOrgContext()`: si es coach de org NO admin (`isOrgUser && !isOrgAdmin`) → `redirect('/coach/clients')` (los coaches enterprise no importan).
- Lee coach (`subscription_tier`, `max_clients`). `getTierCapabilities(tier)`: si no es org admin y `!caps.canImportClients` → `<UpsellGate variant="client_import" />`.
- `orgId = isOrgAdmin ? ctx.orgId : null`. Cuenta activos scopeados (`is_archived=false`). Pasa `coachId`, `orgId`, `maxClients`, `activeCount` al `ImportWizard`.

### `ImportWizard` (cliente) — 4 pasos

1. **Step1Upload:** drag/drop o file picker. Limites cliente: `.xlsx/.xls/.csv`, `MAX_BYTES = 5 MB`, `MAX_ROWS = 1000`. Parseo con `xlsx` (`sheet_to_json` header=1). Errores: formato no soportado, >5 MB, vacio/solo encabezados (`< 2` filas), >1000 filas. Emite `{ headers, rows, filename }`.
2. **Step2MapColumns:** mapea columnas a `ImportField` (deteccion automatica de headers ES/EN via `header-matcher`); produce `MappedRow[]`.
3. **Step3Preview:** valida y permite revisar filas; emite `validRows`.
4. **Step4Confirm:** muestra resumen (`activeCount + rows.length = total / maxClients`, N emails, tiempo estimado `~ceil(rows/10)*2 s`). Bloquea si `wouldExceedLimit = activeCount + rows.length > maxClients`. **Consentimiento obligatorio** (checkbox Ley 19.628 / 21.719). `canImport = consent && !wouldExceedLimit && !isPending`. Llama `importClientsAction(rows, filename, true)`. Al exito muestra "N alumnos importados" + lista de filas con error (`#row`, nombre, email, error) y boton a `/coach/clients`.

### `importClientsAction` (server) — validaciones y limites

- `!consentConfirmed` → error legal obligatorio (Ley 19.628).
- Auth + `getCoachOrgContext`; coach de org no-admin → "Tu rol no permite importar alumnos.".
- `orgId = isOrgAdmin ? ctx.orgId : null`. Si no hay org y el workspace activo es team → `activeTeamId` (filas entran al POOL del team, no a la cartera personal; usa marca del team).
- `caps.canImportClients` (solo standalone): si no → `'upgrade_required'`.
- `rows.length === 0` → error; `> 1000` → error de limite (segunda barrera server-side).
- **Cap de plan (solo standalone, no org/team):** `(activeCount ?? 0) + rows.length > maxClients` → error con cifras.
- Crea registro de auditoria en `client_imports` (`status: 'processing'`, `total_rows`, `consent_confirmed_at`).
- Pre-carga emails existentes (scopeado org/team/coach) → set de duplicados a omitir.
- Procesa en **chunks de 10** (`Promise.allSettled`). Por fila: `sanitizeCell` (anti CSV-injection) de nombre/email/telefono, valida con `importRowSchema` (`full_name` min 2 / max 100, `email` valido, phone/fecha opcionales). Omite (`skipped`) si email ya existe o duplicado dentro del batch (`seenInBatch`). Crea via `createClientInternal` (GoTrue Admin + INSERT user-scoped, `temp_password` aleatorio de 12 chars, fecha normalizada con `normalizeImportDate`).
- Actualiza `success_count`/`error_count` en `client_imports` tras cada chunk; al final setea `status` (`failed` si todas fallaron, si no `completed`) y guarda `errors` (JSON) + `completed_at`.
- `revalidatePath('/coach/clients')`. Devuelve `summary { total, succeeded, failed, skipped }` + `rowErrors[]`.

---

## 2.11 Notas y observaciones para el rediseno

- **Todo el filtrado/orden/busqueda/paginacion del directorio es client-side** sobre el array cargado por la pagina; cambiar filtros NO pega a la DB. Esto escala bien para carteras tipicas pero la lista de un team-pool grande se carga entera (sin paginacion server-side).
- **Doble fuente de "actividad":** la columna "Ultimo" usa `lastWorkoutDate` (solo entreno), distinto del flag de check-in. Tener presente al rediseñar la nocion de "vivo/inactivo".
- **`riskFilter` es el unico filtro compartido** entre encabezado y lista (estado en el shell); `statusFilter`/`programFilter`/`search`/orden viven solo en la lista. Las cards/banners del encabezado solo controlan `riskFilter`.
- **Filtros sin entrada en la barra:** `expired_program` y `password_reset` solo se alcanzan via banner del encabezado; el dropdown de la barra no los ofrece. Decision a revisar para consistencia.
- **`view` default = `'table'`**; el modo grid renderiza `ClientCardV2` (ver doc cards) y es el unico con paginacion "Cargar mas" (+48). La tabla virtualiza con >20 filas y no pagina.
- **Importador desconectado de la barra:** no hay enlace al wizard desde el War Room; depende de navegacion externa/menu.
- **Conteos del encabezado vs lista:** `total` cuenta archivados (`clients.length`); la lista los oculta salvo el filtro `archived`. Posible discrepancia percibida.
- **Sin acciones masivas (bulk):** no hay seleccion multiple ni operaciones por lote en la lista; todas las acciones son por fila.
