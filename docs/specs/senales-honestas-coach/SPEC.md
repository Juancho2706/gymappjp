---
status: active
owner: product-engineering
last_verified: "2026-09-10"
canonical: false
---

# SPEC — Señales honestas para el coach

Ver [PLAN](PLAN.md) · [TASKS](TASKS.md) · [TESTING-QA](TESTING-QA.md).

> **Borrador.** Origen: cuatro reportes del coach `movens` (primer coach frío pagado, Pro mensual,
> usa la app RN en iOS) el 2026-09-10. El diagnóstico confirmó que los cuatro son **fachadas de UI o
> gaps de paridad RN**, no bugs de datos. Decisiones del owner en `DECISIONS.md` (D1–D6);
> resoluciones del jefe en `RESOLUCIONES.md` y `RESOLUCIONES-2.md` (resoluciones R1–R26, que mandan
> sobre los mapas de lectura). Jerarquía: DECISIONS > RESOLUCIONES + RESOLUCIONES-2 > este SPEC > mapas.
> Un solo tren: deploy web + OTA 1.1.2, **sin migraciones y sin cambios nativos**.
> Evidencia verificada contra `rnmobiledenuevo` en `f93378c3` (2026-09-10, solo lectura); los datos
> de LIVE son lecturas del mismo día.

## Problema

### P1 — La «Agenda de hoy» inventa horas y un contador de tareas hechas

- Web: `AgendaCard.tsx:15-23` define `slotTime(i)` (`09:00`, `10:30`, `12:00`…) con un comentario que
  lo declara placeholder; `:32` fija `const done = 0` y `:35` pinta `«{done} de {items.length} hechas»`.
- RN: `CoachDashboardSections.tsx:2329-2330` calcula `startMinutes = 9 * 60 + index * 90` y lo pinta
  como `slot`; `:2320` pinta el mismo `«0 de {items.length} hechas»`.
- No existe tabla ni UI de horario en el producto: la lista sale de `buildAgendaFromPulse`
  (`dashboard.queries.ts:341-393`), que junta programas por vencer con alumnos marcados
  `SIN_CHECKIN_1M` o `SIN_EJERCICIO_7D`. Los labels son fijos y sin fecha: `'Check-in pendiente (>30d)'`
  (`:375`) y `'Sin ejercicio esta semana'` (`:384`).
- El dato de fecha ya viaja: `AgendaItem.dueAt` existe (`types.ts:64-72`) y se rellena con
  `row.lastCheckinDate` / `row.lastWorkoutDate`. RN lo descarta por contrato de tipos:
  `MobileAgendaItem` (`coach-dashboard.ts:91-97`) no declara `dueAt`.
- El fallback local RN produce **otro copy** para lo mismo: `coach-dashboard.ts:1115-1130` reusa
  `client.label` de `riskItems` («Adherencia critica - sin ejercicio en 7 dias»), sin tildes y
  distinto del servidor. Hay dos variantes de copy conviviendo.
- Sin orden por urgencia: `buildAgendaFromPulse` empuja primero todos los `programa_vence` y después
  el `pulse` en orden natural, y corta con `slice(0, 8)` (`:392`) sin decir cuántas quedaron fuera.
- El flag `SIN_EJERCICIO_7D` es real: `dashboard.service.ts:88-98` lo dispara con
  `daysSinceWorkout >= WORKOUT_INACTIVE_AFTER_DAYS` y `hasActiveWorkoutProgram`. El problema es la
  presentación, no la señal.

### P2 — El chip «Entró hace 8 d» se lee como «último ingreso»

- El chip sale de `clients.first_login_at` (migración `supabase/migrations/20260826044738_clients_first_login_at.sql`),
  que es el **primer** login y se sella una sola vez por diseño (onboarding y drip W6).
- Hoy la rama `entered` es permanente: web `client-status.ts:109-116` devuelve
  `{ key: 'entered', label: enteredLabel(...) }` para cualquier `firstLoginAt` no nulo, sin tope de
  días; RN espeja exacto en `directory-shared.ts:110-111`. `active` (`client-status.ts:130-134`,
  `directory-shared.ts:121`) solo se alcanza cuando **no** hay `firstLoginAt`, caso casi extinto.
- El dato de actividad real está al lado y es correcto: `lastInfo()` en `directory-shared.ts:125-132`
  («Hoy» / «Ayer» / «Hace N d» sobre el último `workout_log`).
- Ambos `DirRowCard` ya tienen el gate que hace falta: web `DirRowCard.tsx:191` y RN
  `DirRowCard.tsx:144` pintan la píldora solo si `st.key !== 'active'`.

### P3 — El FAB «Nuevo alumno» queda tapado por la cápsula flotante (solo RN)

- `apps/mobile/app/coach/(tabs)/clientes.tsx:1413` fija `bottom: 84` en `styles.fab` (StyleSheet
  estático), sin `insets.bottom`; el render (`:1076`) solo agrega color y glow.
- La cápsula se ancla en `insets.bottom + 16` (`CoachMobileChrome.tsx:204`) y mide ≈ 69 px
  (`:369-382`), con `COACH_TABBAR_CLEARANCE = 120` (`:88`). En iPhone con barra gestual
  (`insets.bottom` ≈ 34) el FAB queda solapado.
- El mismo archivo sí usa insets donde corresponde: las dos listas llevan
  `paddingBottom: insets.bottom + COACH_TABBAR_CLEARANCE` (`:1018`, `:1032`), y `insets` ya está en
  scope (`:333`).
- Patrón correcto ya en producción: `MobileQuickActionsFab` con `bottom: insets.bottom + 92`
  (`CoachDashboardSections.tsx:755-780`).

### P4 — La nutrición apagada sigue viva en la app (solo RN)

El coach apagó el dominio en Funciones (`coach_feature_prefs` nutrition `_enabled:false`). La
pestaña desaparece (`client-tabs.ts:35-39` + `[clientId].tsx:659`), pero el resto no:

- Lo único del dominio que cruza a `OverviewTab` es `onViewNutrition === undefined`
  (`[clientId].tsx:782`). No hay prop de dominio: `resourceDomains` se queda en `[clientId].tsx:120`.
- El anillo «Nutrición» se pinta siempre (`OverviewTab.tsx:251`) con
  `nutritionPct = Math.min(100, compliance.nutritionWeeklyAvgPct)` (`:210`), que es `number` puro.
- El banner dispara con `nutritionCompliancePercent: nutritionTodayCompliancePct` (`:223`), también
  `number`, y `top-alert.ts:43-45` responde «Solo completó el 0 % de sus comidas (hoy / plan activo).».
- El `0` es falso, no medido: `coach-client-detail-logic.ts:86` hace `if (!activePlanId) return 0` y
  `:99` colapsa con `Math.max(1, applicableMeals.length)`; `coach-client-detail.ts:326` hace
  `if (!rows.length) return 0`; el objeto `EMPTY` pone `0` en `:738` y `:750`.
- El hero pinta «Comidas hoy» y «X% plan» sin gate (`[clientId].tsx:593-595, 619-628` →
  `ClientHero.tsx:189-193`), y el `attentionScore` suma +20 fantasma (`[clientId].tsx:599`).
- Home: `MobileClientStatsSheet` (`CoachDashboardSections.tsx:2908-2916`) no recibe dominios y su
  switcher siempre trae las dos pestañas (`:2960-2963`); `home.tsx` no consulta entitlements.
- Directorio: pill de nutrición (`DirRowCard.tsx:91-93, 135-143`), tile «Nutri.»
  (`DirectorySummary.tsx:197`), filtro «Nutrición baja (<60%)» (`DirectoryFilterSheet.tsx:24`),
  tabla densa y `nutritionLowCount` (`clientes.tsx:239-240, 626-629`).
- **La web ya resolvió el eje del dominio**: `ClientProfileDashboard.tsx:117`
  (`nutritionView = domainsEnabled.nutrition === false ? null : …`) y `:122`
  (`isNutritionAtRisk = nutritionView?.isAtRisk ?? null`), con `ProfileOverviewB3.tsx:306-319`
  aceptando `percentage: null` y pintando el hint `'sin plan vigente'` (`:314`).
- Pero el servidor sí miente para todos: `dashboard.service.ts:738` hace
  `Math.round(nutritionSummary.compliancePct)` y lo pasa como `nutritionCompliance` a
  `calculateAttentionScore` (`:746`) aunque no haya ni un día con comidas aplicables.

### Datos de LIVE (2026-09-10, solo lectura)

| Dato | Valor |
|---|---|
| Alumnos activos del coach | 9 |
| Con `workout_logs` del 09-09 | 7 |
| Último log más viejo | 02-09 (8 días al 10-09) |
| Alumno con primer log el 09-09 | 1 |
| Planes de nutrición V1 o V2 activos | 0 |
| `coach_feature_prefs` | nutrition `_enabled:false`; training / cardio / movement / bodycomp `true` |

Es decir: el caso real del coach es **dominio apagado + cero planes**, el peor cuadrante de la
matriz de nutrición, y a la vez el que hoy pinta «0 %» en tres superficies.

## Decisiones del owner

Literales de `DECISIONS.md` (2026-09-10). No se reabren.

- **D1 (Q1 = A)** Agenda honesta: «Pendientes de hoy», sin hora, sin «hechas», contador = alumnos,
  subtítulo con fecha real. Web y RN. *(La frase «contador = alumnos» era el resumen del jefe del
  mockup, no palabra del owner; la resolución R14 la corrige: el contador cuenta **filas**.)*
- **D2 (Q2 = A)** Chip «Entró hace X d» solo ≤ 7 días desde `first_login_at`; después «Activo». Sin
  tocar columna, sellado ni drip. Web y RN.
- **D3 (Q3 = A)** Nutrición apagada ⇒ anillo desaparece, sin banner, sin pill/chip/tab de nutrición
  en home y directorio (RN). Encendida sin plan ⇒ anillo gris «Sin plan vigente», banner no dispara.
  `null` en vez de `0`.
- **D4** FAB: `bottom: insets.bottom + 92`.
- **D5** Un solo tren: deploy web + OTA 1.1.2. Sin migraciones. Sin nativo. Orden: nutrición → FAB →
  agenda → chip.
- **D6** Fase de plan: cero código, cero commit. Docs solo en `docs/specs/senales-honestas-coach/`.

## Resoluciones

Resumen de `RESOLUCIONES.md`. Para no confundirlas con los requisitos de este SPEC se citan como
**«resolución Rn»**.

| # | Qué resuelve |
|---|---|
| Resolución R1 | Copy del anillo vacío = `Sin plan vigente` capitalizado en web y RN; `ProfileOverviewB3.tsx:314` se alinea en este tren. |
| Resolución R2 | Copys de agenda: check-in espeja a entrenos y `programa_vence` usa `«{programa}»` sin la palabra «Plan». |
| Resolución R3 | Fuente única del label en `packages/profile-analytics/agenda-label.ts`; el servidor manda `label`/`days`/`severity`, RN pinta, y el fallback RN llama a la misma función. |
| Resolución R4 | Alcance del arreglo de nutrición: (a) servidor manda `nutritionCompliance: null` sin comidas aplicables, (b) la ficha web gatea el anillo por dominio, (c) directorio y KPI web quedan como deuda declarada. |
| Resolución R5 | Orden de la agenda por urgencia: `danger` → `warning` → `none`, y dentro del grupo por antigüedad. |
| Resolución R6 | Contador = total real; la lista muestra hasta 8 y agrega una fila «y N más en Alumnos». |
| Resolución R7 | `CoachDashboardSections.tsx:2062` filtra `NUTRICION_RIESGO` de `flags` cuando el dominio está apagado. |
| Resolución R8 | El filtro `nutrition_low` se gatea en presentación; `filterClients` no se toca. |
| Resolución R9 | Ubicaciones corregidas: gate web `DirRowCard.tsx:191`, gate RN `DirRowCard.tsx:144`, `MobileAgendaItem` en `coach-dashboard.ts:91-97`, `bottom: 84` en `clientes.tsx:1413`, KPI web en `kpi/KpiStrip.tsx:45`. |
| Resolución R10 | El huérfano `_components/today/TodayAgenda.tsx` se borra. |
| Resolución R11 | Waves serializadas; `CoachDashboardSections.tsx` se toca en dos waves distintas, nunca en paralelo. |
| Resolución R12 | Un solo checklist de QA en `TESTING-QA.md`. |
| Resolución R13 | `CURRENT.md` se mide y recorta antes de agregar la fila del tren. |
| Resolución R14 | El contador de la agenda cuenta **filas** («N pendientes»), no alumnos únicos; ratifica R6 y corrige la frase de D1. |
| Resolución R15 | Criterio del `null` del servidor + el pulse de nutrición lee solo V1: falso positivo V2 y el efecto secundario aceptado quedan declarados en §Riesgos. |
| Resolución R16 | `DenseDirectoryTable` (`clientes.tsx:177-315`) gana la prop `nutritionEnabled`; TASKS parte A19 en A19 (screen) y A19b (tabla densa). |
| Resolución R17 | El `agendaTotal` del fallback RN se cuenta sobre `riskItems` antes de los `slice`, nunca sobre `topRiskClients`. |
| Resolución R18 | N8 vive en `apps/web/src/services/dashboard-attention-nutrition.test.ts` y prueba `calculateAttentionScore` + `nutritionComplianceFromAdherence`. |
| Resolución R19 | Puntero del PLAN: «TASKS.md § D · Cierre» ⇒ «§ E · Cierre» (fuera de este archivo). |
| Resolución R20 | `DirTableMobile.tsx` es **web** (`apps/web/src/app/coach/clients/DirTableMobile.tsx:200-207`); Q16 (RN) y Q16b (web) no se renumeran. |
| Resolución R21 | Copy canónico del NBA: `description` = «Alumnos sin entrenos, sin check-in o con programa por vencer.», `ctaLabel` = «Ver pendientes». |
| Resolución R22 | Fecha corta compartida `shortDayMonthEs` en el package, sin `Intl` en ningún lado; se cierra la divergencia `sept` / `sept.`. |
| Resolución R23 | Las líneas del SDD son orientativas (HEAD `f93378c3`, ±3): se ancla por identificador, no por número. |
| Resolución R24 | Firma canónica `daysSince(fromYmd: string \| null, todayYmd: string): number \| null`. |
| Resolución R25 | Q14 puede quedar N/A y Q16b se mantiene (fuera de este archivo). |
| Resolución R26 | `MobileFocusList` / NBA reciben `agendaTotal`, cableado desde `home.tsx:186-192` además de `:195`. |

## Requisitos

### R1 — Agenda honesta

- **R1.1** El título de la sección dice `Pendientes de hoy` en web (`AgendaCard.tsx:36`) y RN
  (`CoachDashboardSections.tsx:2318`). No dice «Agenda de hoy».
- **R1.2** No se ve ninguna hora en ninguna fila: `slotTime` (`AgendaCard.tsx:15-23`) y el par
  `startMinutes`/`slot` (`CoachDashboardSections.tsx:2329-2330`) desaparecen del render.
- **R1.3** No se ve «hechas» en ningún lado: se retiran `done` (`AgendaCard.tsx:32`) y los dos
  literales `«0 de N hechas»` (`AgendaCard.tsx:35`, `CoachDashboardSections.tsx:2320`).
- **R1.4** El header muestra `{N} pendientes` con singular `1 pendiente`, donde N es el **total real
  antes del tope**, no la cantidad de filas visibles. El contador cuenta **filas**, una por pendiente
  (resoluciones R6 y R14): como los `programa_vence` nacen en un loop aparte
  (`dashboard.queries.ts:355-366` vs `:368-390`), un alumno con programa por vencer **y** sin entrenos
  cuenta **2 pendientes**, y es verdad. No se deduplica por `clientId`.
- **R1.5** Con `total > 8` la última fila dice `y {N} más en Alumnos` y navega al directorio
  (`/coach/clients` en web, `/coach/clientes` en RN).
- **R1.6** El estado vacío dice título `Todo al día` y subtítulo `Sin pendientes hoy.` — reemplaza el
  actual «Todo cerrado» / «Sin pendientes en el día.» de `AgendaCard.tsx:42-43` y
  `CoachDashboardSections.tsx:2324`.
- **R1.7** El subtítulo de cada fila usa exactamente estos textos (OUTLINE §3.1, resolución R2):

  | Caso | Texto exacto |
  |---|---|
  | `sin_ejercicio` con `dueAt` | `Sin entrenos desde el {fecha} · {days} d` |
  | `sin_ejercicio` sin `dueAt` | `Todavía no registra entrenos` |
  | `checkin_pendiente` con `dueAt` | `Sin check-in desde el {fecha} · {days} d` |
  | `checkin_pendiente` sin `dueAt` | `Todavía no registra check-ins` |
  | `programa_vence`, `daysLeft > 0` | `«{programa}» vence en {daysLeft} d` |
  | `programa_vence`, `daysLeft === 0` | `«{programa}» vence hoy` |
  | `programa_vence`, `daysLeft < 0` | `«{programa}» venció hace {-daysLeft} d` |

- **R1.8** `{fecha}` es `d mmm` en minúscula y sin punto, zona `America/Santiago`, con las
  abreviaturas **exactas** de la tabla fija `SHORT_MONTHS_ES`
  (`apps/web/src/lib/date-utils.ts:163`): septiembre es **`sept`**, no `sep`. El copy real de QA es
  `Sin entrenos desde el 2 sept · 8 d` (y `14 oct`).
  **Una sola función de formato, sin `Intl` en ningún lado** (resolución R22):
  `packages/profile-analytics/agenda-label.ts` exporta `shortDayMonthEs(ymd: string): string` con la
  tabla `SHORT_MONTHS_ES` copiada de `apps/web/src/lib/date-utils.ts:163` (12 entradas, septiembre =
  `sept`). El servidor **y** el fallback RN formatean con esa función del package. En web queda
  **prohibido `Intl` en client components** por el incidente de hidratación `EVA-NEXTJS-18` (JSDoc en
  `date-utils.ts:201-212`); el servidor obtiene el YMD con
  `getSantiagoIsoYmdForUtcInstant(iso)` (`date-utils.ts:340`). En RN el YMD de Santiago sale de
  `apps/mobile/lib/date-utils.ts` (`getTodayInSantiago`, `:58`, y `getSantiagoIsoYmdForUtcInstant`,
  `:75`); RN **deja de usar** `toLocaleDateString('es-CL', …)`, así que ya no hay divergencia
  `sept` / `sept.` por la ICU del dispositivo y un `sept.` con punto es rojo en QA en las dos
  plataformas.
- **R1.9** Los textos de R1.7 se componen en **una sola función pura compartida**,
  `packages/profile-analytics/agenda-label.ts` (archivo nuevo; hoy el paquete tiene
  `types/strength/body-composition/overview/client-status/top-alert` y `index.ts` re-exporta con
  `export * from './…'`, así que hay que agregar la línea). Exports: `AgendaKind`, `AgendaSeverity`,
  `agendaSeverity`, `programSeverity` (`daysLeft <= 0 ⇒ danger`, `1..3 ⇒ warning`, `>= 4 ⇒ none`),
  `daysSince`, `shortDayMonthEs` (R1.8), `buildAgendaLabel`. `buildAgendaLabel` recibe la fecha **ya
  formateada** por el llamador. Firma canónica (resolución R24):
  `daysSince(fromYmd: string | null, todayYmd: string): number | null`, en días calendario de
  `America/Santiago`.
- **R1.10** Cada fila muestra un punto de color por severidad: `agendaSeverity(days)` con `null ⇒ none`
  (gris), `days >= 14 ⇒ danger`, `days >= 7 ⇒ warning`, menor ⇒ `none`; para `programa_vence`,
  `daysLeft <= 0 ⇒ danger` y `1..3 ⇒ warning`. Colores: web `var(--danger-500)` /
  `var(--warning-500)` / `var(--muted-foreground)`; RN `DANGER` / `WARNING`
  (`directory-shared.ts:13-15`) / `theme.mutedForeground`. **No** se reusan los cortes de `lastInfo`
  (`directory-shared.ts:125-132`, `<3` / `<7`), que son otra regla.
- **R1.11** El orden es por urgencia (resolución R5): `danger` → `warning` → `none`; dentro del grupo,
  por `days` descendente y los programas por `daysLeft` ascendente. `buildAgendaFromPulse`
  (`dashboard.queries.ts:341-393`) devuelve `{ items: slice(0, 8), total }`.
- **R1.12** El contrato web crece con `days: number | null` y `severity: AgendaSeverity` en
  `AgendaItem` (`types.ts:64-72`), más un `agendaTotal: number` en el retorno del dashboard. `label`
  viaja ya armado desde el servidor.
- **R1.13** El contrato RN deja de descartar el dato: `MobileAgendaItem` (`coach-dashboard.ts:91-97`,
  y sus usos en `:199` y `:706`) suma `dueAt: string | null`, `days: number | null` y
  `severity: AgendaSeverity`. El endpoint ya serializa el objeto entero
  (`api/mobile/coach/dashboard/route.ts:188`) y `dropRowsWithInvalidClientId` no recorta campos.
- **R1.14** El fallback local RN (`coach-dashboard.ts:1115-1130`) produce el **mismo shape y los
  mismos strings** que el servidor: llama a `buildAgendaLabel`, toma la fecha de
  `latestWorkout.get(id).logged_at` y del último check-in, y deja de reusar `client.label`.
- **R1.14b** El `agendaTotal` del fallback local RN se cuenta sobre `riskItems`
  (`coach-dashboard.ts:1061`) más los programas, **antes** de los `slice` (`:1087`, `:1113`, `:1130`),
  nunca sobre `topRiskClients` —que ya viene cortado a 5— (resolución R17). Ejemplo de prueba:
  fallback con 9 riesgos ⇒ `agendaTotal: 9` y 8 filas visibles.
- **R1.15** El NBA sigue apuntando a `agenda[0]` (ahora el más urgente) y usa el total real:
  RN `CoachDashboardSections.tsx:2215-2222` (`{N} pendientes hoy`, CTA `Ver pendientes`), web
  `PriorityCard.tsx:66-72` con `agendaPending` alimentado desde `DashboardShell.tsx:257`.
  Copy canónico (resolución R21): `description` = `Alumnos sin entrenos, sin check-in o con programa
  por vencer.` y `ctaLabel` = `Ver pendientes`. En web `PriorityCard` **no tiene** `description`: ahí
  solo cambia el CTA (`cta: 'Ver agenda'` ⇒ `Ver pendientes`).
- **R1.16** Se borra `apps/web/src/app/coach/dashboard/_components/today/TodayAgenda.tsx` (huérfano
  confirmado: su único hit en todo `apps/web/src` es su propia definición en `:16`).

### R2 — Chip «Entró hace X d» con ventana de 7 días

- **R2.1** Con `days <= 7` desde `first_login_at` el chip sigue diciendo `Entró hace {N} d` /
  `Entró hoy` / `Entró hace {N} min`, sin cambios.
- **R2.2** Con `days > 7` el estado pasa a `{ key: 'active', label: 'Activo' }`.
- **R2.3** El borde es inclusivo: 7 días exactos siguen en `entered`; 8 días ya es `active`.
- **R2.4** El cambio vive en el llamador, no en `enteredLabel`: web `client-status.ts:109-116`, RN
  `directory-shared.ts:110-111`, con la constante `ENTERED_CHIP_WINDOW_DAYS = 7` en ambos archivos
  (duplicación espejo intencional, ya documentada en el docblock de `directory-shared.ts`).
- **R2.5** El cálculo de días reusa la fórmula de medianoche local que ya usa `enteredLabel`
  (`startOfLocalDay`, `client-status.ts:59-63`), no una ventana de 24 h.
- **R2.6** Ningún `DirRowCard` se toca: ambos ya ocultan la píldora con `st.key !== 'active'` (web
  `:191`, RN `:144`), así que el alumno de 8 días simplemente deja de tener chip.
- **R2.7** Dos superficies distintas, verificadas en el repo, pasan a pintar `Activo` porque no gatean
  por key: la **tabla densa RN** (`apps/mobile/app/coach/(tabs)/clientes.tsx:258-261`) y la **tabla
  angosta web** (`apps/web/src/app/coach/clients/DirTableMobile.tsx:200-207`, `{st.label}` en `:206`;
  el archivo **no existe en RN**). Es aceptable y va al checklist de QA (Q16 RN, Q16b web).
- **R2.8** Filtros y contadores no cambian: `filterClients` y `pendingSyncCount`
  (`clients-directory.ts:252, 262-278`) recalculan desde flags crudos y nunca llaman a `statusMeta`.
- **R2.9** No se toca `clients.first_login_at`, ni su sellado
  (`student-login-signal.service.ts:53-58`), ni el drip W6, ni `FIRST_LOGIN_SIGNAL_CUTOVER`.

### R3 — FAB «Nuevo alumno» sobre la cápsula

- **R3.1** En iPhone con barra gestual el FAB queda visiblemente **arriba** de la cápsula flotante,
  con aire entre ambos.
- **R3.2** Se quita `bottom: 84` de `styles.fab` (`clientes.tsx:1413`) para que no queden dos fuentes
  de verdad del anclaje.
- **R3.3** El render (`clientes.tsx:1076`) pasa a
  `style={[styles.fab, { backgroundColor: theme.primary, bottom: insets.bottom + 92 }, GLOWS.sport]}`,
  mismo patrón que `MobileQuickActionsFab` (`CoachDashboardSections.tsx:755-780`). `insets` ya existe
  en scope (`:333`).
- **R3.4** En Android con navegación de tres botones (`insets.bottom` chico o 0) el FAB no queda
  pegado al borde ni flotando de más.
- **R3.5** Nada más cambia en el archivo: los `paddingBottom: insets.bottom + COACH_TABBAR_CLEARANCE`
  de las listas (`:1018`, `:1032`) ya son correctos.

### R4 — Nutrición: un solo gate honesto (RN + servidor + ficha web)

- **R4.1** Nombre canónico único: `nutritionEnabled: boolean`. Prohibido `nutritionOn`,
  `showNutrition` o pasar `resourceDomains` entero a los componentes.
- **R4.2** Ficha RN: el flag sale del workspace del **recurso**
  (`resourceDomains.nutrition !== false`, `[clientId].tsx:120`) y viaja como prop nueva a
  `OverviewTab` y al `ClientHero`. Home y directorio usan el workspace **activo** vía
  `useDomainGuard('nutrition')` (`domain-guard.ts:53-56`), respetando su contrato de consumo (sin
  early-return antes de los hooks).
- **R4.3** El estado transitorio (`ready === false`, o error de `getWorkspaceEntitlements`) es
  **fail-OPEN**: se pinta como dominio encendido. Es el comportamiento vigente y no cambia.
- **R4.4** Estas funciones dejan de devolver `0` cuando no hay dato y pasan a `number | null`:
  `activePlanNutritionComplianceForDay` (`coach-client-detail-logic.ts:86` y el
  `Math.max(1, applicableMeals.length)` de `:99`), `nutritionAveragePct`
  (`coach-client-detail.ts:326`), los dos pct de `ComplianceSummary` (`:202-203`),
  `nutritionTodayCompliancePct` (`:696`) y sus valores en el objeto `EMPTY` (`:738`, `:750`).
  `nutritionMonthlyAvgPct` (`:695`) ya es `number | null` y sirve de precedente.
- **R4.5** El anillo acepta el vacío: `Ring` (`OverviewTab.tsx:354`) gana `value: number | null` y
  `hint?: string`, y delega en `ComplianceRing` con `empty`, que ya pinta gris y «—»
  (`ComplianceRing.tsx:18, 31, 34, 66-68`). El `accessibilityLabel` dice «sin plan vigente» en vez de
  «0 %».
- **R4.6** El copy del hint es `Sin plan vigente`, capitalizado, en RN **y en web**: en este tren
  `ProfileOverviewB3.tsx:314` pasa de `'sin plan vigente'` a la forma capitalizada. Una sola variante
  en todo el producto (resolución R1).
- **R4.7** El delta no se fabrica: con cualquiera de los dos pct en `null`, `nutritionDelta`
  (`OverviewTab.tsx:211`) es `null` y el anillo no muestra flecha (espejo de
  `ProfileOverviewB3.tsx:172`).
- **R4.8** El banner no dispara sin dato: `OverviewTab.tsx:223` pasa `undefined` a
  `getProfileTopAlert` cuando el dominio está apagado o el pct es `null`. `top-alert.ts` **no se
  toca**: su contrato ya omite la regla con `null` (`:32`, `:43-45`) y sus tests lo fijan.
- **R4.9** La decisión se extrae a una función pura testeable
  `resolveNutritionSignal({ nutritionEnabled, weeklyAvgPct, prevWeeklyAvgPct, todayPct })` en
  `coach-client-detail-logic.ts`, que devuelve `{ showRing, ringValue, ringHint, alertInput, atRisk }`.
- **R4.10** Se apagan también las superficies de la ficha que hoy no tienen gate: la píldora
  «Nutrición en riesgo / en track» de `ProgramSummary` (`OverviewTab.tsx:262-272, 461-480`), el chip
  «Comidas hoy» del hero (`ClientHero.tsx:189-193`), el `+20` del `attentionScore`
  (`[clientId].tsx:599`) y la razón «Adherencia nutricional baja» (`[clientId].tsx:498`).
- **R4.11** Home RN: `MobileClientStatsSheet` (`CoachDashboardSections.tsx:2908-2916`) recibe
  `nutritionEnabled`; con el dominio apagado el switcher de `:2960-2963` queda con un solo tab
  (Adherencia) y no se pinta. `home.tsx:211` cablea el flag.
- **R4.12** Home RN: el label de foco filtra `NUTRICION_RIESGO` de `flags` antes de resolver
  (`CoachDashboardSections.tsx:2062`, catálogo en `:1963`) cuando `nutritionEnabled === false`
  (resolución R7).
- **R4.13** Directorio RN: sin dominio no hay pill (`DirRowCard.tsx:91-93, 135-143`), no hay tile
  «Nutri.» (`DirectorySummary.tsx:197`, la grilla pasa a 3) y la opción «Nutrición baja (<60%)» se
  oculta del sheet (`DirectoryFilterSheet.tsx:24`). La **tabla densa** también se apaga (resolución
  R16): `DenseDirectoryTable` es un componente aparte dentro de
  `apps/mobile/app/coach/(tabs)/clientes.tsx:177-315` (el screen arranca en `:331`) y gana la prop
  `nutritionEnabled: boolean`, cableada desde el screen con `useDomainGuard('nutrition')`; con ella
  se apagan `nutritionRisk` (`:240`) y el ícono `Apple` (`:269`).
- **R4.14** Si el filtro `nutrition_low` estaba activo y el coach apaga el dominio, `riskFilter` se
  resetea a `'all'` por efecto. `filterClients` (`clients-directory.ts:285-290`) **no se toca**, para
  que `tests/mobile-directory-pulse-parity.test.ts` siga intacto (resolución R8).
- **R4.15** Servidor: `dashboard.service.ts` pasa `nutritionCompliance: null` a
  `calculateAttentionScore` (`:746`) **cuando ningún día del rango tuvo comidas aplicables**, es
  decir cuando `perDay.some(d => d.applicableMeals > 0)` es `false` — destructurando `perDay` de
  `computeNutritionAdherence` (`:715-724`) en vez del `Math.round(...)` incondicional de `:738`. Ese
  criterio se encapsula en un helper exportado con nombre canónico
  **`nutritionComplianceFromAdherence(perDay, summary)`** (resoluciones R15 y R18), que devuelve
  `number | null` y es lo que testea N8. El engine `packages/nutrition-engine/adherence.ts` **no se
  toca**. Efecto: sin plan no hay flag `NUTRICION_RIESGO` ni puntos de score, en web y RN.
- **R4.16** `DirectoryPulseRow.nutritionPercentage` sigue siendo `number` para no mover cuatro
  archivos web: el `null` entra **antes** del score y solo ese campo de presentación se rellena con
  `?? 0`, documentado en el código.
- **R4.17** Ficha web: el anillo de nutrición **desaparece** con el dominio apagado, vía una prop
  nueva `nutritionEnabled` desde `ClientProfileDashboard.tsx` a `ProfileOverviewB3.tsx:299-326`. Hay
  que distinguir «apagado» (ocultar) de «sin plan» (gris con hint), porque hoy `:117` manda `null` en
  los dos casos.
- **R4.18** Matriz de aceptación (los cuatro cuadrantes se verifican en QA):

  | Caso | Ficha (Resumen + Hero) | Home | Directorio |
  |---|---|---|---|
  | **ON · con plan** | Anillo con % real y delta; banner si < 60; píldora de riesgo; chip «Comidas hoy N/M · X% plan»; pestaña visible | Sheet con los dos tabs; el alumno aparece en Nutrición | Pill si hay riesgo; tile «Nutri.» con conteo; filtro disponible |
  | **ON · sin plan** | Anillo **gris con «—» + `Sin plan vigente`**, sin delta; **sin banner**; sin píldora; chip «Comidas hoy» en «—» sin sub; sin `+20` de score; pestaña visible | Tab Nutrición presente, el alumno no aparece en la lista | Sin pill; no cuenta en «Nutri.» |
  | **OFF · con plan** | **Anillo ausente** (quedan Entreno y Check-in); sin banner, sin píldora, sin chip; pestaña ya ausente | Sheet con **un solo tab**, sin switcher | Sin pill; sin tile; filtro oculto y reseteado a `all` |
  | **OFF · sin plan** (caso Movens) | Idéntico al anterior: **cero rastro de nutrición** | Idéntico | Idéntico |

### R5 — Cierre del tren

- **R5.1** Los tests nuevos y ampliados viven fuera de `apps/mobile/**` (el runner no incluye esa
  ruta): `packages/profile-analytics/agenda-label.test.ts` y `tests/mobile/coach-dashboard-agenda.test.ts`
  son nuevos; se amplían `apps/web/src/app/coach/clients/_lib/client-status.test.ts:91-98`,
  `tests/mobile/directory-status.test.ts:111-114`, `tests/mobile-coach-client-detail-logic.test.ts` y
  `apps/web/src/app/coach/dashboard/_data/dashboard.queries.test.ts` (215 líneas, hoy sin ninguna
  mención de agenda ⇒ `buildAgendaFromPulse` debe exportarse para poder testearla).
- **R5.2** Se conservan verdes sin tocarlos: `packages/profile-analytics/top-alert.test.ts`,
  `tests/mobile-directory-pulse-parity.test.ts`, `tests/mobile/domain-guard.test.ts`,
  `tests/mobile/client-tabs.test.ts`.
- **R5.3** `packages/profile-analytics/overview.test.ts` es flaky entre las 21:00 y medianoche de
  Chile (UTC vs. hora local) y no se usa como gate si no se tocó esa lógica.
- **R5.4** Gates reales antes de declarar nada verde, incluido
  `pnpm --filter @eva/mobile exec tsc --noEmit`, que CI no corre y es el que atrapa la cadena de
  `number | null` de R4.4. Comandos exactos en `PLAN.md`.
- **R5.5** Docs canónicos al cierre: `docs/status/CURRENT.md` (midiendo el tope de 16 KB antes de
  agregar, resolución R13), `docs/status/MOBILE_PARITY.md` (QA + la deuda web de nutrición) y
  `docs/testing/TEST_STATUS.md` si aplica.
- **R5.6** Un solo checklist de QA del owner en `TESTING-QA.md`, con los cuatro arreglos, la matriz de
  R4.18 en las tres superficies, el alumno con 8 días de `first_login_at`, el FAB en iPhone y
  Android, y el destino del NBA tras el reordenamiento.
- **R5.7** Sin migraciones, sin cambios nativos: la OTA es solo JS compatible con `runtimeVersion`
  1.1.2.

## Alcance y no-alcance

| Superficie | Se toca | Deuda / no se toca |
|---|---|---|
| Agenda web | `dashboard.queries.ts:341-393`, `types.ts:64-72`, `AgendaCard.tsx:15-43`, `PriorityCard.tsx:66-72`, `DashboardShell.tsx:257, 266` | — |
| Agenda RN | `coach-dashboard.ts:91-97, 199, 706, 1115-1130`, `CoachDashboardSections.tsx:2309-2361, 2215-2222` | — |
| Label compartido | `packages/profile-analytics/agenda-label.ts` (nuevo) + `index.ts` | — |
| Huérfano web | `_components/today/TodayAgenda.tsx` se borra (0 imports) | — |
| Chip web | `client-status.ts:109-116` + su test | `DirRowCard.tsx:191` y `DirTableMobile.tsx:203-206` quedan como están |
| Chip RN | `directory-shared.ts:110-111` + `tests/mobile/directory-status.test.ts` | `DirRowCard.tsx:144`, `clientes.tsx:260`, `enteredLabel`, `FIRST_LOGIN_SIGNAL_CUTOVER` |
| Columna y drip | — | `clients.first_login_at`, `student-login-signal.service.ts:53-58`, drip W6, `behavior-emails.ts`, `north-star-weekly.service.ts` |
| FAB RN | `clientes.tsx:1076, 1413` | `CoachMobileChrome.tsx` (la cápsula ya usa insets) |
| Nutrición ficha RN | `[clientId].tsx:120, 498, 593-628, 773-788`, `OverviewTab.tsx:210-211, 220-229, 247-254, 262-272, 354, 461-480`, `ClientHero.tsx:189-193`, `coach-client-detail.ts`, `coach-client-detail-logic.ts` | `top-alert.ts` (contrato `null` ya resuelto); `nutritionActivityDates371` (`OverviewTab.tsx:169-178`) es racha del alumno, no señal del dominio |
| Nutrición home RN | `home.tsx:211`, `CoachDashboardSections.tsx:2062, 2908-2963` | El atajo «+ Nutricion» del FAB del home (`:655`) queda fuera |
| Nutrición directorio RN | `clientes.tsx:239-240, 626-629, 869`, `DirectorySummary.tsx:197`, `DirRowCard.tsx:91-93, 135-143`, `DirectoryFilterSheet.tsx:24`, helpers en `clients-directory.ts` | `filterClients` (`clients-directory.ts:285-290`) NO se toca (resolución R8) |
| Nutrición servidor | `dashboard.service.ts:715-746` | `packages/nutrition-engine/adherence.ts`; `pulse/route.ts` y `dashboard/route.ts` siguen sin resolver dominios |
| Nutrición ficha web | `ClientProfileDashboard.tsx` (prop nueva) y `ProfileOverviewB3.tsx:306-319` (copy `:314`) | — |
| Nutrición directorio web | — | **Deuda declarada**: `CoachWarRoom.tsx:222` (`nutritionLowCount`) y `:350-358` (chip «Nutri.») siguen sin gate por dominio |
| KPI web | — | **Deuda declarada**: `kpi/KpiStrip.tsx:45` (`hint={`Nutricion: ${kpi.avgNutrition}%`}`) sigue sin gate |
| Ejecutor V3 / builder / workout-engine | — | Sesión paralela: este tren no toca esos archivos |

**Divergencia web ↔ RN resuelta en este tren.** El mapa de lectura la dejó abierta: hoy, con el
dominio apagado, la ficha web **sigue mostrando** el anillo en gris (no hay ningún `if` que lo saque
de `ProfileOverviewB3.tsx:299-326`), mientras D3 pide que en RN **desaparezca**. La resolución R4(b)
cierra la divergencia alineando la web (R4.17) en vez de dejar RN por delante. Lo que sí queda
divergente y declarado como deuda es el directorio web y el KPI (`CoachWarRoom.tsx`,
`kpi/KpiStrip.tsx`): con R4.15 esos contadores dejan de mentir para coaches sin planes —el caso
real— pero siguen sin gate por dominio.

## Riesgos

| Riesgo | Cobertura |
|---|---|
| El typecheck de mobile rompe en cadena por los `number \| null` de R4.4 | Tarea 0 de inventario (`grep` de `nutritionWeeklyAvgPct\|nutritionPrevWeeklyAvgPct\|nutritionTodayCompliancePct\|nutritionPct` en `apps/mobile`) antes de cambiar tipos, y `pnpm --filter @eva/mobile exec tsc --noEmit` como gate del wave de nutrición. Consumidores conocidos: `NutricionTab.tsx`, `nutrition-coach-alerts.ts`, `client-dossier-pdf.ts` |
| Hydration mismatch en web (`EVA-NEXTJS-18`) al pintar fechas | La fecha se formatea en servidor con `shortDayMonthEs`; `AgendaCard` no usa `Intl` (R1.8) |
| El NBA cambia de destino al reordenar la agenda por urgencia | Es el comportamiento deseado; va explícito al checklist de QA (`agenda[0]` = el más urgente) |
| `nutritionPercentage ?? 0` de presentación vuelve a alimentar el score | El `null` entra **antes** de `calculateAttentionScore` (R4.15/R4.16); el `?? 0` queda solo en `DirectoryPulseRow` |
| Romper el drip u onboarding al tocar el chip | D2 cambia solo presentación; los seis consumidores del drip leen `clients.first_login_at` directo y nunca importan `client-status.ts` ni `directory-shared.ts` (R2.9) |
| Romper los filtros del directorio RN | El gate vive en presentación; `filterClients` intacto ⇒ `tests/mobile-directory-pulse-parity.test.ts` sigue verde (R4.14) |
| `CURRENT.md` supera el tope de 16 KB de `scripts/check-docs.mjs` | Tarea explícita de medición y recorte en el wave de cierre (R5.5) |
| Colisión con la sesión paralela (ejecutor V3 / builder) | Este tren no toca esos archivos; se avisa antes de escribir en `docs/status/*` |
| `CoachDashboardSections.tsx` lo tocan dos carriles | Waves serializadas (resolución R11): nutrición en el primero, agenda y NBA en el tercero, nunca en paralelo |

**El pulse de nutrición lee V1 y por eso hoy miente (resolución R15).** El pulse
(`dashboard.service.ts:548-560, 679-748`) consulta **solo tablas V1**: `daily_nutrition_logs`
(`:443`) y su embed `nutrition_meal_logs` (`:453`). V1 está congelada y V2 es la canónica, así que
hoy **todo alumno que registra en V2 —o que no tiene plan— recibe un `NUTRICION_RIESGO` falso y
+20 puntos** de `attentionScore`. Con el `nutritionCompliance: null` de R4.15 ese falso positivo
desaparece. **Efecto secundario aceptado:** un alumno con plan **V1 activo** y cero registros en 35
días deja de llevar el flag de nutrición (sigue con los de entreno y check-in). Queda **deuda nueva**
en `TASKS.md § Backlog`: «pulse de nutrición sobre V2» — hoy el service no conoce `nutrition_plans_v2`
y `dashboard.queries.ts:986` solo la usa para el conteo del alumno demo. El test N8 cubre el `null`.

## Fuera de este tren

- **Agenda real con horario.** No existe tabla ni UI de citas; «Pendientes de hoy» es trabajo
  pendiente derivado, no un calendario. Un horario real es producto nuevo con migración.
- **`last_seen` del alumno.** El chip honesto de «último ingreso» exigiría una columna nueva y su
  escritura en cada login; `first_login_at` se sella una vez por diseño y no se toca (R2.9). Hoy la
  señal de actividad real ya está al lado, en `lastInfo()`.
- **«Hechas» marcable.** Marcar un pendiente como hecho requiere persistencia por coach y por día;
  este tren solo retira el contador que hoy miente (R1.3).
- **Directorio y KPI web de nutrición.** `CoachWarRoom.tsx:222, 350-358` y `kpi/KpiStrip.tsx:45`
  quedan como deuda declarada en `TASKS.md § Backlog` y en `MOBILE_PARITY.md` (resolución R4c).
- **Gate de dominios en los endpoints móviles.** `api/mobile/coach/clients/pulse/route.ts` y
  `api/mobile/coach/dashboard/route.ts` no resuelven dominios hoy; el gate de este tren es de
  presentación en RN más el `null` honesto del servicio.
