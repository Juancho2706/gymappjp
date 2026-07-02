# 4. Modales y sheets

Esta sección documenta cada modal/sheet del dashboard del coach (`/coach/dashboard`): cómo se abre, qué datos recibe o carga, qué muestra, qué valida, qué hace al confirmar y cómo persiste. El énfasis está en el **backend** (server actions, servicios, queries, agregaciones, tablas). El frontend se describe solo a nivel funcional.

> Convención de auth en todas las acciones: el cliente Supabase user-scoped se crea con `createClient()` de `@/lib/supabase/server`; las mutaciones leen el usuario con `supabase.auth.getUser()` (revocación fresca, boundary de mutación) y las lecturas que no mutan usan `supabase.auth.getClaims()` (verificación local del JWT ES256, sin round-trip a `/user`). El scope coach→alumno (standalone / org / team) se resuelve con `resolveCoachScope` / `getCoachClientScope` y se aplica con `applyOrgScope`/`applyClientScope`. NUNCA se lee `org_id`/`team_id` del body.

---

## 4.1 FreeWelcomeModal

Archivo: `apps/web/src/app/coach/dashboard/_components/FreeWelcomeModal.tsx`. Es un componente `'use client'`. Bienvenida one-time al coach del plan **Free** tras registrarse.

### Cómo se abre

- No lo dispara un KPI ni un tap del usuario. Se auto-abre por **query param + estado local persistido**.
- En un `useEffect` que depende de `searchParams`, abre (`setOpen(true)`) solo si se cumplen las tres condiciones:
  1. `searchParams.get('welcome') === 'free'` (la URL trae `?welcome=free`, lo agrega el flujo de registro/redirect).
  2. Hay `window` (guard SSR).
  3. `localStorage.getItem('eva_free_welcome_seen')` es falsy (nunca se vio antes).

### Cómo sabe que es la primera vez / qué persiste el dismiss

- **Fuente de la verdad: `localStorage`**, clave constante `STORAGE_KEY = 'eva_free_welcome_seen'`. No hay backend: el "ya lo vio" vive solo en el navegador del coach.
- `dismiss()` hace `localStorage.setItem('eva_free_welcome_seen', '1')`, cierra el modal (`setOpen(false)`) y **limpia la URL**: arma un `URLSearchParams` desde el `searchParams` actual, borra `welcome`, y hace `router.replace(next)` (replace, no push: no ensucia el historial) hacia `pathname` con o sin el resto de params.
- Consecuencia: el dismiss NO escribe nada en Supabase. Si el coach borra storage o usa otro dispositivo, y la URL vuelve a traer `?welcome=free`, el modal reaparece.

### Qué muestra (funcional)

Contenido estático hardcodeado, sin datos de backend:

- Encabezado "¡Bienvenido a EVA!" + subtítulo de plan gratuito activo.
- Lista "Primeros pasos" (3 ítems fijos): agregar primer alumno ("Hasta 3 alumnos en el plan Free"), crear primera rutina ("Constructor de programas sin límites"), personalizar app con Starter ("Tu logo y colores desde $19.990/mes").
- Bloque "Tu plan Free incluye": grilla fija de 6 ítems con check/cruz — incluidos: `3 alumnos activos`, `Entrenos ilimitados`, `App para tus alumnos`, `Check-ins`; no incluidos: `Marca personalizada`, `Nutrición`.

### Acciones

- Botón "Empezar ahora →": ejecuta `dismiss()`.
- Link "Ver todos los planes" → navega a `/coach/subscription` y también ejecuta `dismiss()` en el `onClick`.
- Cerrar el `Dialog` por overlay/escape (`onOpenChange` con `v` falsy) también llama `dismiss()`.

### Persistencia

Ninguna en backend. Solo `localStorage` (`eva_free_welcome_seen='1'`). No hay server action involucrada.

---

## 4.2 ClientStatsSheet

Archivo: `apps/web/src/app/coach/dashboard/_components/sheets/ClientStatsSheet.tsx`. Componente `'use client'`. Detalle por alumno (adherencia / nutrición) que se abre desde los KPI de adherencia y nutrición del dashboard.

### Cómo se abre

- Controlado por props `open` / `onOpenChange` desde el contenedor del dashboard. Lo dispara el tap sobre el KPI de **adherencia** (o el de nutrición). El sheet tiene dos tabs internos (`'adherence'` | `'nutrition'`), estado local `tab` con `useState`, default `'adherence'`.

### Qué datos recibe

Recibe por props dos arreglos ya computados en el server (no hace fetch propio):

- `adherenceStats: AdherenceStat[]`
- `nutritionStats: NutritionStat[]`

(Tipos en `apps/web/src/app/coach/dashboard/_data/types.ts`.) Estos arreglos provienen del **pulse** del directorio. Hay dos caminos según cómo se pueble el contenedor:

1. Pre-cargados en el RSC del dashboard (incluidos en `DashboardV2Data.adherenceStats` / `.nutritionStats`).
2. Bajo demanda vía las server actions `getAdherenceStats()` / `getNutritionStats()` de `apps/web/src/app/coach/dashboard/_actions/dashboard.actions.ts`, que:
   - leen el usuario con `getUser()` (si no hay, `throw 'No autorizado'`),
   - llaman `getCachedDirectoryPulse(user.id)` (`apps/web/src/lib/coach/directory-pulse-cache.ts`, envuelto en `React.cache` → una sola carga de pulse por request),
   - y mapean con `mapDirectoryPulseToAdherenceStats(pulse)` / `mapDirectoryPulseToNutritionStats(pulse)` de `@/services/dashboard.service`.

### Cómo se calcula el pulse (backend, `DashboardService.getDirectoryPulse`)

`getCachedDirectoryPulse` instancia `new DashboardService(supabase).getDirectoryPulse(coachId, orgId)` (`apps/web/src/services/dashboard.service.ts`). Resumen del algoritmo por alumno (todo coach-scoped por RLS):

1. **Alumnos**: `SELECT id, full_name FROM clients WHERE coach_id = coachId` (+ filtro `org_id` si `orgId !== undefined`). Si no hay alumnos, devuelve `[]`.
2. **Workout logs (35 días)**: `workout_logs` (`client_id, logged_at, weight_kg, reps_done, plan_name_at_log`) por chunks de 120 IDs (`CLIENT_ID_IN_CHUNK`), `gte logged_at` a -35 días, `limit WORKOUT_LOGS_ROW_CAP=2000` por chunk (tope anti-runaway).
3. **Última fecha de workout exacta**: RPC `get_clients_last_workout_date(p_client_ids, p_since)` con `MAX` server-side (evita truncamiento por el row-cap); fallback a reduce en memoria.
4. **Check-ins (35 días)**: `check_ins` (`client_id, created_at, date, weight, energy_level`).
5. **Programa activo**: `workout_programs` (`is_active=true`, ordenado `created_at desc`), se toma el más reciente por alumno.
6. **Sets planificados**: RPC `get_workout_program_planned_set_totals(p_program_ids)` por chunks de 80; fallback `plannedSetsFromProgram` (suma `sets` de `workout_blocks`).
7. **Nutrición**: `daily_nutrition_logs` desde `lastWeekStr` (corte 7 días), denormalizado con `nutrition_meal_logs → nutrition_meals → food_items → foods` y targets congelados `target_*_at_log`. Se reconstruye y se delega a `computeNutritionAdherence` de `@eva/nutrition-engine` (maneja unidades g/ml/un correctamente).
8. **Streaks**: RPC batch `get_coach_clients_streaks(p_coach_id)` (requiere `auth.uid() = coach`, no funciona bajo service_role); fallback batch-by-ids `get_clients_streaks_by_ids(p_client_ids)` para los faltantes.

Por alumno produce un `DirectoryPulseRow` con, entre otros:

- `percentage` (adherencia de entreno semanal): `min(round(logsLastWeek / totalPlannedSets * 100), 100)`; 0 si no hay sets planificados.
- `completedSets` = nº de logs en la última semana; `totalSets` = sets planificados del programa activo.
- `nutritionPercentage` = `round(compliancePct)` del motor de nutrición.
- `consumed` / `target` (cal/prot/carb/fat) desde `nutritionSummary`.
- `lastPlan` (nombre del plan del último log, o "Sin actividad reciente").
- `lastWorkoutDate`, `lastCheckinDate`, `currentWeight`, `weightDelta7d`, `weightHistory30d`, `adherenceHistory4w` (4 ventanas de 7 días), `oneRMDelta` (Epley, ventanas 7 vs 14 días), `planDaysRemaining/CurrentWeek/TotalWeeks`, `streak`, `latestEnergyLevel`, y `attentionScore`/`attentionFlags` (ver §calculateAttentionScore).

### Mappers (qué campos quedan en cada stat)

`baseClientStatFields(p)` copia los campos comunes (id, nombre, lastPlan, fechas, peso, historiales, oneRMDelta, plan*, attention*, streak, energy). Luego:

- `mapDirectoryPulseToAdherenceStats`: agrega `percentage = p.percentage`, `completedSets`, `totalSets`, y `nutritionCompliance = p.nutritionPercentage`. → `AdherenceStat`.
- `mapDirectoryPulseToNutritionStats`: agrega `percentage = p.nutritionPercentage`, `consumed`, `target`, y `adherence = p.percentage` (la adherencia de entreno, invertida respecto a la pestaña de adherencia). → `NutritionStat`.
- `mapDirectoryPulseToClientStats(pulse, mode)`: overload que enruta a uno u otro según `'adherence'` | `'nutrition'`.

### Qué muestra y derivaciones en el cliente

- Según el tab, mapea filas a `{ clientId, name, pct, hint }`:
  - tab adherencia: `pct = s.percentage`, `hint = "{completedSets}/{totalSets} sets · {lastPlan}"`.
  - tab nutrición: `pct = s.percentage`, `hint = "{round(consumed.cal)} / {round(target.cal)} kcal"`.
- Ordena `sorted` de **menor a mayor** `pct` (los de peor cumplimiento primero).
- Cada fila es un `Link` a `/coach/clients/{clientId}` con barra `Progress value={pct}`.
- Estado vacío: "Sin datos." si no hay filas.

### Validación / persistencia

No valida ni persiste nada: es solo lectura. No hay server action de escritura. Las actions `getAdherenceStats`/`getNutritionStats` son de lectura.

---

## 4.3 RevenueSheet

Archivo: `apps/web/src/app/coach/dashboard/_components/sheets/RevenueSheet.tsx`. Componente `'use client'`. Desglose de ingresos por alumno que se abre desde el KPI de ingresos (MRR).

### Cómo se abre

- Controlado por props `open` / `onOpenChange` desde el contenedor del dashboard; lo dispara el tap sobre el **KPI de ingresos**.

### Qué datos recibe

Por props (computados en el server, sin fetch propio):

- `kpi: KpiSummary` — usa `mrrCurrentMonth`, `mrrPreviousMonth`, `mrrDeltaPct`.
- `clientPaymentSummary: ClientPaymentSummary[]` — una fila por alumno.

### Cómo se calcula el MRR (backend, `dashboard.queries.ts`)

El MRR se computa a partir de la tabla `client_payments` (pagos manuales que el coach registra; ver QuickAddPaymentModal). En `apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts`:

- Solo cuentan los pagos cuyo `status` (lower) sea `paid` | `pagado` | `completed` (`isClientPaymentCountedForRevenue`).
- Cada pago se **reparte por meses calendario** con `allocatePaymentToMonthKeys(payment_date, amount, period_months)`:
  - Si `payment_date` cae el **último día del mes**, el servicio empieza el **mes siguiente** (ej. 31-mar mensualidad abril → todo el monto en abril).
  - Con `period_months > 1`, divide `amount / period_months` (`base = floor(total/pm)`, el `remainder` se reparte) en meses consecutivos desde ese inicio.
  - Acumula en `revenueByMonth[YYYY-MM]`.
- `mrrCurrentMonth = revenueByMonth[mesActual]`, `mrrPreviousMonth = revenueByMonth[mesAnterior]` (claves con `monthKeyFromYm`, mes anterior con `addWholeMonths(-1)`).
- `mrrDeltaPct`: si `mrrPreviousMonth > 0` → `round((curr - prev) / prev * 100)`; si no, 100 cuando `curr > 0`, else 0 (lógica en el ensamblado de `kpi`).

### Cómo se calcula `clientPaymentSummary` (backend, `buildClientPaymentSummary`)

Recibe los pagos crudos (`base._rawClientPayments`) + el `pulse` (para nombre/id de alumno). Por cada alumno del pulse:

- `paidByClient`: del set de pagos del alumno con status `paid`/`pagado`/`completed`, toma el de **mayor `payment_date`** (último pago) → `{ payment_date, amount (redondeado), period_months }`.
- `lastPaymentDate`, `lastPaymentAmount`, `lastPaymentPeriodMonths` salen de ese último pago (o `null`).
- `nextRenewalDate`: si hay `period_months > 0`, suma `period_months` a `payment_date` y formatea `YYYY-MM-DD`.
- `hasRecentPayment`: `true` si el último pago es de hace **< 35 días** (`thirtyFiveDaysAgo`).
- Ordena: los **sin pago reciente primero** (para que destaquen los vencidos).

### Qué muestra y derivaciones en el cliente

- Header: `formatCLP(kpi.mrrCurrentMonth)` (Intl `es-CL`, CLP, sin decimales), badge de delta con ícono `TrendingUp/Down/Minus` según signo de `mrrDeltaPct`, y "Mes anterior: {formatCLP(mrrPreviousMonth)}".
- Reordena `clientPaymentSummary` poniendo `hasRecentPayment=false` primero.
- Lista de alumnos (`Link` a `/coach/clients/{clientId}`), cada uno con: nombre, "Último pago: {fecha} · {monto}" o "Sin pagos registrados", y "Renovación: {nextRenewalDate}" si existe.
- `StatusBadge` por alumno:
  - sin ningún pago (`lastPaymentDate === null`) → "Sin pago".
  - `hasRecentPayment` → "Al día".
  - tiene pagos pero no reciente → "Vencido".
- Estado vacío: "Sin datos de pagos registrados."

### Validación / persistencia

Solo lectura. No valida ni escribe; no dispara server actions de mutación.

---

## 4.4 QuickAddPaymentModal

Archivo: `apps/web/src/app/coach/dashboard/_components/payments/QuickAddPaymentModal.tsx`. Componente `'use client'`. Registro rápido de un pago manual de alumno desde el dashboard.

### Cómo se abre

- Controlado por props `open` / `onOpenChange` desde el contenedor del dashboard (acción rápida del coach). Recibe `clients: ClientListItem[]` (`{ id, name }`) para poblar el `<select>` de alumno.

### Estado / campos del formulario

Estado local (`useState`): `clientId`, `amount`, `paymentDate` (default `new Date().toISOString().split('T')[0]`, hoy), `description`, `periodMonths`, `error`. `useTransition` para el submit. Campos del form:

- **Alumno** (`<select>` requerido) — opciones desde `clients`.
- **Monto** (number, CLP).
- **Fecha** (date, default hoy).
- **Concepto** (texto, ej. "Mensualidad abril").
- **Meses** (number opcional — `period_months`).

### Validación (cliente, en `handleSubmit`)

Antes de llamar la action:

- `clientId` requerido → "Selecciona un alumno."
- `amount`: se parsea a entero (`Math.round(Number(amount.replace(/\s/g,'')))`); debe ser finito y `> 0` → "Indica un monto válido."
- `paymentDate` requerido → "Indica la fecha del pago."
- `description` (trim) requerido → "Indica un concepto (ej. mensualidad)."
- `periodMonths`: si no está vacío, debe ser finito y `>= 1` → "Período en meses debe ser ≥ 1 o vacío."; si está vacío, se manda `undefined`.

### Qué hace al confirmar / cómo persiste

- En `startTransition`, llama la server action `addPayment(...)` importada de `@/app/coach/clients/[clientId]/_actions/client-detail.actions`, con payload:
  ```
  { client_id, amount: amt, payment_date, service_description: desc, period_months: pm, status: 'paid' }
  ```
- Al éxito: `handleClose()` (resetea el form y cierra) + `router.refresh()` (re-fetch del RSC del dashboard para reflejar el nuevo MRR/summary).
- Al error: setea `error = 'No se pudo registrar el pago. Intenta de nuevo.'`.

### Cadena de backend del `addPayment`

1. **Action** (`client-detail.actions.ts`, `'use server'`): `addPayment(data)` → delega a `addPaymentService(data)` (alias de `addPayment` de `@/services/client/client-detail.service`).
2. **Service** (`client-detail.service.ts` `addPayment`): crea `createClient()`, lee `getUser()` (si no → `throw 'Unauthorized'`), resuelve `scope = getCoachClientScope(supabase, user.id)`, llama `addPaymentForCoach(supabase, user.id, data, scope)`, y al final `revalidatePath('/coach/clients/{client_id}')`.
3. **Repo/service** (`client.service.ts` `addPaymentForCoach`): primero `assertCoachCanManageClient(db, coachId, data.client_id, scope)` (guard de scope coach→alumno); luego `INSERT` en la tabla **`client_payments`** con `{ ...data, coach_id: coachId }` (incluye `client_id`, `amount`, `service_description`, `payment_date`, `period_months`, `status`). Si falla, `throw 'Failed to add payment'`.

> Nota: la persistencia es en `client_payments`, que es la misma tabla que alimenta el MRR/`clientPaymentSummary` del RevenueSheet. El `status: 'paid'` enviado por este modal hace que el pago cuente de inmediato en el cálculo de ingresos.

> El mismo `addPaymentForCoach` también lo usa la ruta mobile `app/api/mobile/coach/payments/route.ts` (con su propio `AddPaymentSchema` Zod: `clientId` uuid, `amount` int positivo, `paymentDate` `YYYY-MM-DD`).

---

## 4.5 CreateClientModal

Archivo: `apps/web/src/app/coach/clients/CreateClientModal.tsx`. Componente `'use client'`. Crea un alumno con cuenta + contraseña temporal y ofrece un CTA de WhatsApp. Se invoca desde el dashboard (acción rápida "agregar alumno") y desde `/coach/clients`.

### Cómo se abre

- Controlado por props `open` / `onClose`. Usa `useActionState(createClientAction, initialState)` y `useFormStatus` (botón submit con estado `pending`). Tiene `usePostHog` para telemetría del gate de límite.

### Estados del modal (3 vistas)

El render depende del `state` devuelto por la action:

1. **Vista éxito + WhatsApp** (`state.success && state.newClientPhone`): muestra "¡Alumno creado!" y un botón "Enviar link por WhatsApp" que arma `https://wa.me/{digits}?text={mensaje}` con `digits = newClientPhone.replace(/\D/g,'')` y mensaje `"Hola {clientName}! 👋 Soy tu coach. Aquí está tu link para acceder a tu plan: {loginUrl}"`. Botón "Omitir por ahora" → cierra. Si hubo éxito **sin** teléfono, un `useEffect` auto-cierra (no hay CTA que mostrar).
2. **Vista upgrade requerido** (`state.upgradeRequired`): "Límite de {currentLimit} alumnos alcanzado", link a `/coach/subscription` ("Ver planes →") y "Ahora no". Dispara eventos PostHog `upgrade_initiated` / `upgrade_modal_dismissed` con `gate: 'client_limit'` y `current_limit`.
3. **Vista formulario** (default).

### Campos del formulario

- **Nombre completo** (`full_name`, requerido).
- **Email del alumno** (`email`, requerido, type email).
- **Teléfono (WhatsApp)** (`phone`, opcional). Determina si aparece el CTA de WhatsApp.
- **Inicio de mensualidad** (`subscription_start_date`, date, opcional).
- **Contraseña temporal** (`temp_password`, requerido, `minLength=8`, mono). Nota UI: "Se le pedirá cambiarla al entrar."
- **Confirmación de edad** (`age_confirmed`, checkbox requerido) — Ley 21.719: confirma 14+ o consentimiento de tutor.

### Validación (servidor, Zod)

La action valida con `CreateClientSchema` (`packages/schemas/client.ts`):

- `full_name`: string 2–100.
- `email`: email válido.
- `phone`: opcional.
- `subscription_start_date`: opcional.
- `temp_password`: min 8.
- `age_confirmed`: `z.literal('on')` (el checkbox debe venir marcado; si no, mensaje de la Ley 21.719).

Si falla, devuelve `{ fieldErrors }` que el form muestra por campo.

### Qué hace al confirmar / cómo persiste (backend `createClientAction`)

Archivo: `apps/web/src/app/coach/clients/_actions/clients.actions.ts`, `createClientAction(prev, formData)`:

1. Parsea `formData` y valida con `CreateClientSchema` (early return con `fieldErrors`).
2. Auth: `getUser()` (si no → `'No autenticado.'`); resuelve `scope = resolveCoachScope(...)`.
3. Carga el coach: `SELECT id, slug, invite_code, full_name, brand_name, welcome_message, subscription_tier, max_clients, active_org_id FROM coaches WHERE id = coachUser.id`.
4. **Límite de alumnos (gate)**: cuenta activos `clients WHERE coach_id AND is_archived=false` (con `applyClientScope`). El cap del tier personal **solo aplica a standalone** (`!isEnterprise && !activeTeamId`): si `activeClientsCount >= maxClients` (`max_clients` o `getTierMaxClients(tier)`), envía email `buildUpgradeRequiredEmail` (fire-and-forget) y devuelve `{ error, upgradeRequired:true, currentLimit:maxClients }` → vista upgrade del modal. Enterprise/team no tienen este cap (pagan centralizado).
5. **Disponibilidad de email**: `assertPlatformEmailAvailable(supabase, email)` (RPC SECURITY DEFINER); si no, devuelve error.
6. **Crea cuenta auth**: `createServiceRoleClient().auth.admin.createUser({ email, password: temp_password, email_confirm: true })`. Si el email está duplicado, mensaje específico. (Solo GoTrue Admin usa service key.)
7. **Inserta el alumno** (user-scoped, RLS como techo real): `INSERT INTO clients` con `id = newAuthUser.id`, `coach_id`, `full_name`, `email` (saneado), `phone || null`, `subscription_start_date || null`, `force_password_change: true`, `age_confirmed_at: now()`, `org_id: scope.orgId`, `team_id: scope.activeTeamId`. Si falla, **rollback**: borra el auth user (`deleteUser`); `23505` → mensaje de email duplicado.
8. **Identidad/membership** (no fatal): `createClientIdentity({...})` materializa account + membership.
9. **Asignación enterprise** (si `scope.orgId`): con **service role** inserta en `coach_client_assignments` (`org_id, coach_id, client_id, assigned_by`). Es FATAL con rollback (borra client + auth user) si falla, para no dejar un alumno huérfano.
10. **Login URL + email de bienvenida**:
    - Contexto team: `loginPath = /t/{team.slug}/login` y la marca del email es el nombre del team.
    - Standalone: `loginPath = /c/{getCoachPublicIdentifier(coach)}/login`.
    - Envía `buildClientWelcomeEmail` (incluye `loginUrl`, `tempPassword`, `welcomeMessage` del coach) vía `sendTransactionalEmail`.
11. `revalidatePath('/coach/clients')` y devuelve `{ success:true, newClientPhone, loginUrl, clientName }` → habilita la vista WhatsApp del modal.

### Tablas que toca

- `clients` (INSERT del alumno), tabla auth de GoTrue (createUser), `coach_client_assignments` (solo enterprise), más lecturas de `coaches`, `teams` y el conteo de `clients` para el gate. El reset de la flag `force_password_change=true` obliga al alumno a cambiar la clave en su primer login.

---

## 4.6 dashboard.actions — acciones disponibles

Archivo: `apps/web/src/app/coach/dashboard/_actions/dashboard.actions.ts` (`'use server'`). Exporta **solo dos acciones, ambas de lectura** (no persisten nada):

- `getAdherenceStats()`: `getUser()` (throw `'No autorizado'` si no) → `getCachedDirectoryPulse(user.id)` → `mapDirectoryPulseToAdherenceStats(pulse)`. Devuelve `AdherenceStat[]` (alimenta el tab Adherencia de ClientStatsSheet).
- `getNutritionStats()`: idéntico pero con `mapDirectoryPulseToNutritionStats(pulse)`. Devuelve `NutritionStat[]` (tab Nutrición).

Ambas comparten el mismo `getCachedDirectoryPulse` (React.cache) para no recomputar el pulse dos veces por request.

> Las mutaciones que disparan los modales del dashboard NO viven en `dashboard.actions.ts`: el registro de pago usa `addPayment` de `client-detail.actions.ts` (persiste en `client_payments`), y la creación de alumno usa `createClientAction` de `clients.actions.ts` (persiste en `clients` + auth + `coach_client_assignments`). El FreeWelcomeModal no usa ninguna server action (solo `localStorage`).

---

## 4.7 calculateAttentionScore (insumo de las stats mostradas)

Aunque no es un modal, varios datos que muestran los sheets (riesgo, flags por alumno) salen de `calculateAttentionScore` (`dashboard.service.ts`), que recibe `{ lastCheckinDate, lastWorkoutDate, hasActiveWorkoutProgram, nutritionCompliance, planDaysRemaining, oneRMDelta }` y suma puntos + flags:

- `SIN_CHECKIN_1M`: +25 si el último check-in fue hace > 30 días (`CHECKIN_OVERDUE_AFTER_DAYS`).
- `SIN_EJERCICIO_7D`: +25 si hay programa activo y no hay workout, o el último fue hace ≥ 7 días (`WORKOUT_INACTIVE_AFTER_DAYS`).
- `NUTRICION_RIESGO`: +20 si `nutritionCompliance < 60`.
- `PROGRAMA_VENCIDO`: +15 si `planDaysRemaining <= 0`; `PROGRAMA_POR_VENCER`: +8 si `<= 3`.
- `FUERZA_CAYENDO`: +15 si `oneRMDelta < -5`.

Devuelve `{ score, flags }`, que cada `DirectoryPulseRow` propaga a las stats consumidas por los sheets.
