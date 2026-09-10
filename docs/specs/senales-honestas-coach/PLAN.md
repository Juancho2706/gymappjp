---
status: active
owner: product-engineering
last_verified: "2026-09-10"
canonical: false
---

# PLAN — Señales honestas para el coach

Ver [SPEC](SPEC.md) · [TASKS](TASKS.md) · [TESTING-QA](TESTING-QA.md).

Jerarquía de autoridad: `DECISIONS.md` (owner, D1–D6) > `RESOLUCIONES.md` (jefe, R1–R13) > este PLAN >
mapas. Tren chico: un deploy web + una OTA 1.1.2, sin migraciones ni cambios nativos. Todas las
rutas:línea se verificaron contra el árbol real en `f93378c3` (rama `rnmobiledenuevo`); donde el mapa y
el repo diferían manda el repo y queda anotado.

---

## Reparto por archivo, no por tema

Un archivo pertenece a **un solo carril**. La única excepción es
`apps/mobile/components/coach/CoachDashboardSections.tsx`, que se toca en el carril A (sheet de stats +
label de foco) y en el carril C (agenda + NBA): **esos dos carriles se ejecutan serializados, nunca en
paralelo** (R11), primero A y después C, para que no haya dos diffs abiertos sobre el mismo archivo.

| Carril | Superficie | Archivos | Requisitos | Días-agente |
|---|---|---|---|---|
| **A** (W1) · Nutrición honesta | RN ficha + RN home + RN directorio + servidor de pulse + ficha web | `apps/mobile/lib/coach-client-detail-logic.ts` · `apps/mobile/lib/coach-client-detail.ts` · `apps/mobile/components/coach/clientDetail/OverviewTab.tsx` · `apps/mobile/components/coach/clientDetail/ClientHero.tsx` · `apps/mobile/app/coach/cliente/[clientId].tsx` · `apps/mobile/app/coach/(tabs)/home.tsx` · `apps/mobile/components/coach/CoachDashboardSections.tsx` *(stats sheet + focus label)* · `apps/mobile/app/coach/(tabs)/clientes.tsx` *(gate del screen + prop nueva `nutritionEnabled` del componente `DenseDirectoryTable`, `:177-315`)* · `apps/mobile/components/coach/directory/DirectorySummary.tsx` · `apps/mobile/components/coach/directory/DirRowCard.tsx` · `apps/mobile/components/coach/directory/DirectoryFilterSheet.tsx` · `apps/mobile/lib/clients-directory.ts` *(helpers puros)* · `apps/web/src/services/dashboard.service.ts` · `apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx` · `apps/web/src/app/coach/clients/[clientId]/ProfileOverviewB3.tsx` | D3 · R1 · R4 · R7 · R8 | **1,5** |
| **B** (W2) · FAB con insets | RN directorio | `apps/mobile/app/coach/(tabs)/clientes.tsx` *(2 líneas: `:1076` y `:1413`)* | D4 | **0,1** |
| **C** (W3) · Agenda honesta | Package compartido + dashboard web + endpoint móvil + home RN | `packages/profile-analytics/agenda-label.ts` *(nuevo)* · `packages/profile-analytics/index.ts` · `apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts` · `apps/web/src/app/coach/dashboard/_data/types.ts` · `apps/web/src/app/coach/dashboard/_components/AgendaCard.tsx` · `apps/web/src/app/coach/dashboard/_components/PriorityCard.tsx` · `apps/web/src/app/coach/dashboard/_components/DashboardShell.tsx` · `apps/mobile/lib/coach-dashboard.ts` · `apps/mobile/components/coach/CoachDashboardSections.tsx` *(agenda + NBA)* · `apps/mobile/app/coach/(tabs)/home.tsx` *(prop `agendaTotal`)* · **borrar** `apps/web/src/app/coach/dashboard/_components/today/TodayAgenda.tsx` | D1 · R2 · R3 · R5 · R6 · R10 | **1,0** |
| **D** (W4) · Chip de 7 días | Directorio web + RN (espejos) | `apps/web/src/app/coach/clients/_lib/client-status.ts` + `client-status.test.ts` · `apps/mobile/components/coach/directory/directory-shared.ts` + `tests/mobile/directory-status.test.ts` | D2 · R9 | **0,4** |
| **E** (W5) · Cierre | Docs, gates, entrega | `docs/status/CURRENT.md` *(con recorte ≤ 16 KB)* · `docs/status/MOBILE_PARITY.md` · `docs/specs/senales-honestas-coach/*` | D5 · R12 · R13 | **0,5** |

**Total ≈ 3,5 días-agente.** Orden de ejecución (D5): A → B → C → D → E. Colisiones vigiladas: `clientes.tsx` lo tocan A (gate) y B (dos líneas aisladas, `:1076` y `:1413`);
`home.tsx` lo tocan A (`useDomainGuard`) y C (`agendaTotal` en `:186-192` y `:195`). En los dos casos son líneas distintas
y los carriles están serializados. La sesión paralela (ejecutor V3 / builder / workout-engine) **no
comparte ningún archivo** con esta lista; antes de escribir en `docs/status/*` en W5 hay que avisar.

---

## Contratos entre carriles

Estos strings son literales. Ningún carril inventa variantes ni «mejora» la redacción.

| Concepto | Texto exacto |
|---|---|
| Título de la sección (web y RN) | `Pendientes de hoy` |
| Contador del header | `{N} pendientes` — con `N === 1`: `1 pendiente`. N = `agendaTotal` (total real, antes del tope) |
| Fila «y más» (solo si `agendaTotal > 8`) | `y {N} más en Alumnos` |
| Vacío — título | `Todo al día` |
| Vacío — subtítulo | `Sin pendientes hoy.` |
| `sin_ejercicio` con `dueAt` | `Sin entrenos desde el {fecha} · {days} d` |
| `sin_ejercicio` sin `dueAt` | `Todavía no registra entrenos` |
| `checkin_pendiente` con `dueAt` | `Sin check-in desde el {fecha} · {days} d` |
| `checkin_pendiente` sin `dueAt` | `Todavía no registra check-ins` |
| `programa_vence`, `daysLeft > 0` | `«{programa}» vence en {daysLeft} d` |
| `programa_vence`, `daysLeft === 0` | `«{programa}» vence hoy` |
| `programa_vence`, `daysLeft < 0` | `«{programa}» venció hace {-daysLeft} d` |
| NBA / `PriorityCard` — título | `{N} pendientes hoy` (`1 pendiente hoy` en singular) |
| NBA RN — `description` | `Alumnos sin entrenos, sin check-in o con programa por vencer.` (R21; en web `PriorityCard` **no** tiene `description`: ahí solo cambia el CTA) |
| NBA / `PriorityCard` — `ctaLabel` | `Ver pendientes` (R21) |
| Anillo de nutrición sin plan (web y RN) | `Sin plan vigente` — capitalizado (R1). La web migra desde la minúscula que hoy tiene en `ProfileOverviewB3.tsx:314` |
| Chip ≤ 7 d | `Entró hace {N} d` / `Entró hoy` / `Entró hace {N} min` (sin cambios, `client-status.ts:66-77`) |
| Chip > 7 d | `Activo` (key `active`, tono success) |

**El contador cuenta FILAS, no alumnos únicos (R14, ratifica R6).** `agendaTotal` es el largo de la lista
antes del `slice(0, 8)`: una fila por pendiente. Un alumno con un programa por vencer **y** sin entrenos
aporta **2** (los `programa_vence` nacen en otro loop que las filas de pulse,
`dashboard.queries.ts:355-366` vs `:368-390`), y es verdad: son dos cosas que hacer. Ningún carril
deduplica por `clientId`. La frase «contador = alumnos» de `DECISIONS.md` D1 era el resumen del mockup
(su header decía «2 alumnos» porque ese ejemplo tenía dos filas) y queda corregida por el jefe.

**`{fecha}`** = `d mmm` en minúscula sin punto, zona `America/Santiago`.
**Divergencia mapa↔repo anotada:** el OUTLINE §3.1 ejemplifica `2 sep`, pero la tabla fija del repo
(`apps/web/src/lib/date-utils.ts:163`, `SHORT_MONTHS_ES`) imprime **`sept`** para septiembre, así que el
copy real es `Sin entrenos desde el 2 sept · 8 d`. Manda el repo: esa tabla es intocable, nació del
incidente de hidratación `EVA-NEXTJS-18` (JSDoc en `date-utils.ts:198-212`).

### Severidad (punto de color de la fila)

`agendaSeverity(days: number | null): 'none' | 'warning' | 'danger'`

| Entrada | Salida | Color web | Color RN |
|---|---|---|---|
| `null` | `'none'` | `var(--muted-foreground)` | `theme.mutedForeground` |
| `days >= 14` | `'danger'` | `var(--danger-500)` | `DANGER` (`directory-shared.ts:15`) |
| `days >= 7` | `'warning'` | `var(--warning-500)` | `WARNING` (`directory-shared.ts:14`) |
| `days < 7` | `'none'` | `var(--muted-foreground)` | `theme.mutedForeground` |

Para `programa_vence` la severidad **no** sale de `days` (que es `null`) sino de `daysLeft`:
`<= 0 ⇒ 'danger'`, `1..3 ⇒ 'warning'`, resto `'none'`. Los cortes de `lastInfo`
(`directory-shared.ts:124-131`, `<3` / `<7`) son otra regla y **no se reutilizan acá**.

---

## Contratos de datos

1. **`AgendaItem` (web)** — `apps/web/src/app/coach/dashboard/_data/types.ts:64-72`. Conserva
   `id`/`clientId`/`clientName`/`kind`/`label`/`href`/`dueAt` y agrega `days: number | null` y
   `severity: AgendaSeverity`. `label` viaja **ya armado** desde el servidor; ningún cliente lo recompone.

2. **`agendaTotal: number`** — conteo antes del `slice(0, 8)`. Sale de `buildAgendaFromPulse` (que pasa a
   devolver `{ items, total }`) y se expone junto a `agenda` en los dos productores:
   `dashboard.queries.ts:261`+`:291` (`getCoachDashboardDataV2`) y `:308`+`:337`
   (`…V2WithClient`); se declara en `types.ts:153`. El endpoint móvil no cambia:
   `apps/web/src/app/api/mobile/coach/dashboard/route.ts:188` serializa el `dashboard` entero.

3. **`MobileAgendaItem` (RN)** — `apps/mobile/lib/coach-dashboard.ts:91-97`. A los cinco campos actuales
   suma `dueAt: string | null`, `days: number | null` y `severity: AgendaSeverity`: tres datos que el
   tipo descarta hoy aunque ya viajan en el JSON del endpoint.
   `agendaTotal: number` se agrega a `MobileDashboardData` (junto a `agenda` en `:199`) y a
   `MobileDashboardApiResponse.dashboard` (`:706`), con `?? agenda.rows.length` como default defensivo
   en `mapApiDashboard` (`:823`) para el teléfono que le pegue a un deploy viejo.
   `dropRowsWithInvalidClientId` (`:786-789`) no recorta campos: no se toca.

4. **`ENTERED_CHIP_WINDOW_DAYS = 7`** — constante exportada, declarada **dos veces** (espejo
   intencional documentado): `apps/web/src/app/coach/clients/_lib/client-status.ts` junto a
   `HOUR_MS`/`DAY_MS` (`:50-51`) y `apps/mobile/components/coach/directory/directory-shared.ts` junto a
   sus equivalentes.

5. **`nutritionEnabled: boolean`** — nombre canónico único para prop y variable, en RN y en web. Nada de
   `nutritionOn`, `showNutrition` ni `resourceDomains` entero cruzando de componente. Fuentes: ficha RN ⇒
   `resourceDomains.nutrition !== false` (`apps/mobile/app/coach/cliente/[clientId].tsx:120`); home y
   directorio RN ⇒ `useDomainGuard('nutrition')` (`apps/mobile/lib/domain-guard.ts:53-56`); ficha web ⇒
   `domainsEnabled.nutrition !== false` (`ClientProfileDashboard.tsx:117`). **Fail-OPEN** en los tres
   casos: solo el `false` explícito apaga.

6. **`resolveNutritionSignal`** — función pura nueva en `apps/mobile/lib/coach-client-detail-logic.ts`:
   ```ts
   export function resolveNutritionSignal(input: {
     nutritionEnabled: boolean; weeklyAvgPct: number | null
     prevWeeklyAvgPct: number | null; todayPct: number | null
   }): {
     showRing: boolean; ringValue: number | null; ringHint: string | undefined
     alertInput: number | undefined   // lo que se pasa a getProfileTopAlert
     atRisk: boolean | null
   }
   ```
   Es la única decisión de «qué se ve» de nutrición en la ficha RN, y por eso es testeable sin montar
   React Native.

7. **`buildAgendaFromPulse` devuelve `{ items, total }`** — deja de devolver el array pelado
   (`dashboard.queries.ts:392`, `return items.slice(0, 8)`), pasa a `export function` para que N6 pueda
   importarla, y ordena por urgencia antes del tope.

---

## Módulo compartido nuevo

`packages/profile-analytics/agenda-label.ts` — TypeScript puro, sin React / Next / Supabase / RN, igual
que `top-alert.ts` (el precedente que ya consumen web y RN). Se re-exporta agregando
`export * from './agenda-label'` al final de `packages/profile-analytics/index.ts`.

```ts
export type AgendaKind = 'programa_vence' | 'checkin_pendiente' | 'sin_ejercicio'
export type AgendaSeverity = 'none' | 'warning' | 'danger'

/**
 * Días calendario **de Santiago** entre dos días `YYYY-MM-DD` que el llamador YA convirtió a esa
 * zona (se comparan al mediodía, inmune a DST). `null` si no hay fecha.
 * NO recibe instantes UTC ni usa la medianoche del runtime (`setHours(0,0,0,0)`): el servidor web
 * corre en UTC y entre las 21:00 y la medianoche de Chile esa «medianoche local» ya es el día
 * siguiente, así que la misma fila diría «2 sept · 9 d» cuando son 8 y la severidad saltaría un día
 * antes (es el desfase que vuelve flaky a `overview.test.ts`, ver Gates).
 */
export function daysSince(fromYmd: string | null, todayYmd: string): number | null

/** Punto de color de las filas por antigüedad. `null ⇒ 'none'`. */
export function agendaSeverity(days: number | null): AgendaSeverity

/** Punto de color de los programas: `<= 0 ⇒ 'danger'`, `1..3 ⇒ 'warning'`, resto `'none'`. */
export function programSeverity(daysLeft: number): AgendaSeverity

/** Tabla fija copiada de `apps/web/src/lib/date-utils.ts:163` (12 entradas, septiembre = `sept`). */
const SHORT_MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/**
 * `'2026-09-02'` ⇒ `'2 sept'`. Fecha corta compartida por el servidor web y el fallback RN (R22):
 * una sola tabla determinista, **sin `Intl` ni `toLocaleDateString` en ninguna de las dos plataformas**,
 * para que no reaparezca la divergencia `sept` / `sept.` (familia `EVA-NEXTJS-18`).
 */
export function shortDayMonthEs(ymd: string): string

/**
 * Texto de la fila. Recibe la fecha YA formateada (`dateText`) con `shortDayMonthEs`; el molde del
 * string es el mismo en web y RN.
 */
export function buildAgendaLabel(input: {
  kind: AgendaKind
  days: number | null
  dateText: string | null
  programName?: string
  daysLeft?: number
}): string
```

`daysSince` cuenta **días calendario**, no ventanas de 24 h: «ayer» es 1 d aunque hayan pasado menos
de 24 h. Lo que **no** hace es copiar `startOfLocalDay` de `client-status.ts:59-64`
(`d.setHours(0,0,0,0)`): esa función corre en el navegador del coach, mientras que `buildAgendaFromPulse`
corre en el servidor (UTC) y la fecha de la misma fila sale de `getSantiagoIsoYmdForUtcInstant`
(`date-utils.ts:340`) — mezclar las dos zonas desalinea texto y severidad cerca de la medianoche chilena.
Por eso el contrato es «YMD de Santiago adentro»:

- **Servidor web** — `todayYmd = getTodayInSantiago(now).iso` (`apps/web/src/lib/date-utils.ts:59`) y
  `fromYmd = getSantiagoIsoYmdForUtcInstant(dueAt)` (el mismo valor que ya alimenta `dateText`).
  Alternativa equivalente y ya probada: `daysSinceSantiagoInstant(dueAt, todayYmd)`
  (`date-utils.ts:354`), que hace exactamente esta cuenta con `differenceInCalendarDays`.
- **Fallback RN** — `getTodayInSantiago().iso` y `getSantiagoIsoYmdForUtcInstant` de
  `apps/mobile/lib/date-utils.ts:58` y `:75`.

### Ejemplos de entrada → salida (fijan `agenda-label.test.ts`)

| # | Entrada | Salida |
|---|---|---|
| 1 | `buildAgendaLabel({ kind: 'sin_ejercicio', days: 8, dateText: '2 sept' })` | `Sin entrenos desde el 2 sept · 8 d` |
| 2 | `buildAgendaLabel({ kind: 'sin_ejercicio', days: null, dateText: null })` | `Todavía no registra entrenos` |
| 3 | `buildAgendaLabel({ kind: 'checkin_pendiente', days: 34, dateText: '7 ago' })` | `Sin check-in desde el 7 ago · 34 d` |
| 4 | `buildAgendaLabel({ kind: 'checkin_pendiente', days: null, dateText: null })` | `Todavía no registra check-ins` |
| 5 | `buildAgendaLabel({ kind: 'programa_vence', days: null, dateText: null, programName: 'Fuerza 4 días', daysLeft: 2 })` | `«Fuerza 4 días» vence en 2 d` |
| 6 | `buildAgendaLabel({ kind: 'programa_vence', days: null, dateText: null, programName: 'Fuerza 4 días', daysLeft: -3 })` | `«Fuerza 4 días» venció hace 3 d` |

Bordes obligatorios del test: `agendaSeverity` 6 ⇒ `none`, 7 ⇒ `warning`, 13 ⇒ `warning`, 14 ⇒ `danger`,
`null` ⇒ `none`; `programSeverity` 0 ⇒ `danger`, 3 ⇒ `warning`, 4 ⇒ `none`; y
`buildAgendaLabel({ kind: 'programa_vence', …, daysLeft: 0 })` ⇒ `«X» vence hoy`; y para `daysSince`:
`daysSince('2026-09-02', '2026-09-10')` ⇒ `8`, `daysSince('2026-09-10', '2026-09-10')` ⇒ `0`,
`daysSince(null, '2026-09-10')` ⇒ `null`.

---

## Diseño por carril

### Carril A — Nutrición honesta (D3 · R1 · R4 · R7 · R8)

**Tarea 0 (bloqueante, antes de tocar tipos):** inventario del daño colateral del `number | null` con
`grep -rn "nutritionWeeklyAvgPct\|nutritionPrevWeeklyAvgPct\|nutritionTodayCompliancePct\|nutritionPct" apps/mobile`,
listando consumidores (al menos `NutricionTab.tsx`, `apps/mobile/lib/nutrition-coach-alerts.ts`,
`apps/mobile/lib/client-dossier-pdf.ts`) antes de cambiar firmas.

| # | Archivo:línea | Cambio | Efecto |
|---|---|---|---|
| A1 | `apps/mobile/lib/coach-client-detail-logic.ts:80-101` | Retorno `number \| null`; `:86` `if (!activePlanId) return null`; agregar `if (applicableMeals.length === 0) return null` **antes** del `Math.max(1, …)` de `:99` | «sin plan» y «plan sin comidas hoy» dejan de valer 0 % |
| A2 | `apps/mobile/lib/coach-client-detail.ts:325-335` | `nutritionAveragePct(rows): number \| null`; `:326` `if (!rows.length) return null` | semana sin logs ⇒ `null` |
| A3 | `apps/mobile/lib/coach-client-detail.ts:202-203` | `ComplianceSummary.nutritionWeeklyAvgPct` y `nutritionPrevWeeklyAvgPct` pasan a `number \| null` | tipo honesto |
| A4 | `apps/mobile/lib/coach-client-detail.ts:696` | `nutritionTodayCompliancePct: number \| null` (paridad con `nutritionMonthlyAvgPct` de `:695`, que ya lo es) | tipo honesto |
| A5 | `apps/mobile/lib/coach-client-detail.ts:738` y `:750` | En el objeto `EMPTY`: los dos pct de `compliance` y `nutritionTodayCompliancePct` pasan de `0` a `null` | el fallback deja de mentir |
| A6 | `apps/mobile/components/coach/clientDetail/OverviewTab.tsx:354` | `Ring` gana `value: number \| null` y `hint?: string`; adentro `<ComplianceRing value={value == null ? 0 : value / 100} empty={value == null} … />`; `accessibilityLabel` (`:373`) dice `Sin plan vigente` cuando `value == null`; `hint` se pinta entre label y delta | reutiliza `ComplianceRing.empty` (`ComplianceRing.tsx:17-18`), que ya pinta gris + «—» |
| A7 | `OverviewTab.tsx:122-144` | prop nueva `nutritionEnabled: boolean` | gate |
| A8 | `OverviewTab.tsx:210-211` | `nutritionPct` y `nutritionDelta` pasan por `resolveNutritionSignal`; sin ambos pct no se fabrica delta (espejo de `ProfileOverviewB3.tsx:172`) | sin delta inventado |
| A9 | `OverviewTab.tsx:247-254` | el `Ring` de Nutrición se renderiza solo si `signal.showRing`; con `ringValue === null` va gris + `hint='Sin plan vigente'` | **D3**: apagado ⇒ desaparece; encendido sin plan ⇒ gris «—» |
| A10 | `OverviewTab.tsx:220-229` | `nutritionCompliancePercent: signal.alertInput` (`undefined` cuando no hay señal honesta) | el banner «Solo completó el 0 %…» no dispara; `top-alert.ts:32,43` ya respeta `null`/`undefined` y **no se toca** |
| A11 | `OverviewTab.tsx:262-272`, `:381-401`, `:461-480` | `ProgramSummary.nutritionAtRisk: boolean \| null`; `:268` pasa `signal.atRisk`; la píldora de `:461` se pinta solo `{nutritionAtRisk != null ? … : null}` | desaparece «Nutrición en riesgo / en track» con dominio apagado o sin plan |
| A12 | `apps/mobile/app/coach/cliente/[clientId].tsx:773-788` | agregar `nutritionEnabled={resourceDomains.nutrition !== false}`; `onViewNutrition` (`:782`) queda como está | wiring de la ficha |
| A13 | `[clientId].tsx:593-600` | `const nutritionEnabled = resourceDomains.nutrition !== false`; **`todayMealsDone` y `todayMealsTotal` pasan a `number \| null`** (hoy `:593` es `?? 0` y `:594` `Math.max(1, … ?? 0)`: nunca son `null`, por eso «ON · sin plan» pintaría `0/1`); `todayNutritionPct: number \| null`; `:599` `(todayNutritionPct != null && todayNutritionPct < 60 ? 20 : 0)`. Snippet exacto abajo | el `attentionScore` deja de sumar +20 fantasma y el chip del hero puede decir «—» |
| A14 | `[clientId].tsx:606` | `nutritionAdherencePct: todayNutritionPct` (ya puede ser `null`) | `deriveClientStatus` acepta `null` (`packages/profile-analytics/client-status.ts:42-44`) |
| A15 | `[clientId].tsx:619-628`, `:733-748` + `ClientHero.tsx:47-55`, `:61-…`, `:184-194`, `:239-247` | `HeroChips.nutritionPct: number \| null` y el sub `{chips.nutritionPct}% plan` solo si no es `null`; **`ClientHeroProps` suma `nutritionEnabled: boolean`** (cableado en `:733`) y con `false` el chip «Comidas hoy» **no se renderiza**; `HeroChip.sub` pasa a `sub?: ReactNode` y no envuelve nada cuando falta | ON·sin plan ⇒ «Comidas hoy» en «—» sin sub; OFF ⇒ chip ausente (R4.18) |
| A16 | `[clientId].tsx:498` | `else if (nutritionEnabled && data.activeNutrition && (data.compliance?.nutritionWeeklyAvgPct ?? 100) < 60)` | «Adherencia nutricional baja esta semana.» no aparece con el dominio apagado |
| A17 | `apps/mobile/components/coach/CoachDashboardSections.tsx:2908-2981` | `MobileClientStatsSheet` recibe `nutritionEnabled: boolean`; `:2919` fuerza `tab='adherence'` si está apagado; `:2960-2963` arma el array de tabs filtrado y con un solo tab no pinta el switcher | D3 en el home |
| A18 | `apps/mobile/app/coach/(tabs)/home.tsx:211-215` | `const { enabled: nutritionEnabled } = useDomainGuard('nutrition')` y pasarlo al sheet | wiring del home |
| A19 | `apps/mobile/app/coach/(tabs)/clientes.tsx:239-240`, `:626-629`, `:869` | mismo `useDomainGuard`; `nutritionRisk` (`:240`) y `nutritionLowCount` (`:626-629`) se calculan con los helpers puros nuevos; `nutritionEnabled` viaja a `DirectorySummary` | tabla densa + resumen |
| A19b | `apps/mobile/app/coach/(tabs)/clientes.tsx:177-315` (componente `DenseDirectoryTable`, aparte del screen que arranca en `:331`) | prop nueva `nutritionEnabled: boolean`, cableada desde el screen con el mismo `useDomainGuard('nutrition')` de A19; con `false` se apaga el cálculo de `nutritionRisk` (`:240`) y no se pinta el ícono `Apple` (`:269`) | la tabla densa deja de mostrar rastro de nutrición con el dominio apagado (R16) |
| A20 | `apps/mobile/components/coach/directory/DirectorySummary.tsx:193-198` | prop `nutritionEnabled: boolean`; el tile `'nutrition'` (`:197`) entra solo si está encendido (la grilla pasa de 4 a 3) | el chip «Nutri.» desaparece |
| A21 | `apps/mobile/components/coach/directory/DirRowCard.tsx:91-93`, `:135-143` | prop `nutritionEnabled?: boolean` con default `true` (fail-OPEN); `:93` `const hasNutritionData = nutritionEnabled !== false && nutritionPct > 0` | el pill de la fila desaparece |
| A22 | `apps/mobile/components/coach/directory/DirectoryFilterSheet.tsx:20-24` | prop nueva: la fila `{ v: 'nutrition_low', l: 'Nutrición baja (<60%)' }` se filtra de `RISK_ROWS` cuando el dominio está apagado; en `clientes.tsx`, `useEffect` que resetea `riskFilter` a `'all'` si quedó en `nutrition_low` (R8) | `filterClients` (`clients-directory.ts:285-290`) **no se toca** ⇒ `tests/mobile-directory-pulse-parity.test.ts` queda intacto |
| A23 | `apps/web/src/services/dashboard.service.ts:715-746` | **fix del servidor** (snippet abajo): `nutritionCompliance: null` cuando ningún día del rango tuvo comidas aplicables | sin plan ⇒ sin flag `NUTRICION_RIESGO` ni puntos de score, en web y RN |
| A24 | `apps/web/src/app/coach/clients/[clientId]/ClientProfileDashboard.tsx:265-285` + `ProfileOverviewB3.tsx:299-319` | prop nueva `nutritionEnabled` (desde `domainsEnabled.nutrition !== false`); el anillo de Nutrición se omite si está apagado y la grilla pasa a `grid-cols-2`; copy de `:314` → `Sin plan vigente` | paridad web↔RN del anillo (R1 + R4b) |
| A25 | `apps/mobile/components/coach/CoachDashboardSections.tsx:2062` | resolver el label de foco **después** de filtrar `NUTRICION_RIESGO` de `item.flags` cuando `nutritionEnabled === false` (R7); `FOCUS_FLAG_LABEL` (`:1961-1968`) no se toca | el coach deja de ver «Nutricion en riesgo» como razón del alumno |

#### A13 + A15 — chip «Comidas hoy», snippet exacto

Sin esto la matriz R4.18 no cierra: hoy `mealsDone`/`mealsTotal` nunca son `null`
(`[clientId].tsx:593-594`) y el chip pinta `0/1` en «ON · sin plan», donde la matriz exige «—» sin sub.

```tsx
// [clientId].tsx:593-595
const rawMealsTotal = derived.today?.mealsTotal ?? 0
// Hay señal honesta solo con dominio encendido, plan vigente y comidas aplicables HOY (espejo de A1).
const hasMealsToday = nutritionEnabled && data.activeNutrition != null && rawMealsTotal > 0
const todayMealsDone: number | null = hasMealsToday ? derived.today?.mealsDone ?? 0 : null
const todayMealsTotal: number | null = hasMealsToday ? rawMealsTotal : null
const todayNutritionPct: number | null = hasMealsToday
    ? Math.min(100, Math.round(((derived.today?.mealsDone ?? 0) / rawMealsTotal) * 100))
    : null
```

```tsx
// ClientHero.tsx:189-193 — el chip entero se gatea por dominio; el valor ya cae a «—» con la
// condición que existe en :191, y el sub desaparece cuando no hay porcentaje honesto.
{nutritionEnabled ? (
  <HeroChip
    label="Comidas hoy"
    value={chips.mealsDone != null && chips.mealsTotal != null ? `${chips.mealsDone}/${chips.mealsTotal}` : '—'}
    sub={chips.nutritionPct != null
      ? <Text style={[styles.chipSub, { color: chips.nutritionPct >= 80 ? theme.success : WARNING }]}>{chips.nutritionPct}% plan</Text>
      : undefined}
  />
) : null}
```

**Grilla con 3 chips (OFF):** no se toca el `StyleSheet`. `chipGrid` es `flexWrap` y `chip` tiene
`width: '47%'` + `flexGrow: 1` (`ClientHero.tsx:266-267`), así que al quedar tres el tercero
(«Workouts») ocupa la fila completa: 2 + 1 ancho, sin huecos. Se actualiza el comentario `{/* 4 chips
2×2 … */}` de `:184` para que no mienta.

#### A23 — fix del servidor, snippet exacto

Hoy `dashboard.service.ts:715` destructura solo `summary` y `:738` colapsa a `0`; el comentario de `:101`
(«`null` = sin dato de nutrición ⇒ el término se omite») describe una intención que el valor nunca cumple.
El engine `packages/nutrition-engine/adherence.ts` **no se toca**.

El criterio vive en un helper **exportado** (nombre canónico R18), para que N8 lo pruebe sin Supabase:

```ts
// dashboard.service.ts — helper exportado, junto a `calculateAttentionScore` (:73)
export function nutritionComplianceFromAdherence(
    perDay: Array<{ applicableMeals: number }>,
    summary: { compliancePct: number }
): number | null {
    return perDay.some((d) => d.applicableMeals > 0) ? Math.round(summary.compliancePct) : null;
}
```

```ts
// :715 — sumar `perDay` al destructuring existente
const { summary: nutritionSummary, perDay: nutritionPerDay } = computeNutritionAdherence({ /* … */ });

// :738 — `null` cuando NINGÚN día del rango tuvo comidas aplicables (sin plan ⇒ sin dato).
const nutritionCompliance = nutritionComplianceFromAdherence(nutritionPerDay, nutritionSummary);
// Presentación: `DirectoryPulseRow.nutritionPercentage` sigue siendo `number` (:253) porque lo leen
// 4 superficies con `?? 0` propio; el `null` entra ANTES del score, no después.
const nutritionPercentage = nutritionCompliance ?? 0;

// :742-748 — el score recibe el valor honesto
const { score, flags } = calculateAttentionScore({
    lastCheckinDate,
    lastWorkoutDate,
    hasActiveWorkoutProgram: activeProgram != null,
    nutritionCompliance,            // antes: nutritionPercentage
    planDaysRemaining,
    oneRMDelta,
});
```

`rows.push({ …, nutritionPercentage })` (`:760`), `mapDirectoryPulseToAdherenceStats` (`:315`) y
`mapDirectoryPulseToNutritionStats` (`:322`) siguen leyendo el campo `number`: sin cambios.

**Riesgo V1/V2 declarado (R15):** el pulse de nutrición (`dashboard.service.ts:548-560, 679-748`) lee
**solo** tablas V1 (`daily_nutrition_logs` / `nutrition_meal_logs`), y V1 está congelada mientras V2 es la
canónica ⇒ hoy todo alumno que registra en V2 (o que no tiene plan) recibe `NUTRICION_RIESGO` falso y +20
puntos de score; con el `null` ese falso positivo desaparece. Efecto secundario **aceptado**: un alumno con
plan V1 activo y cero registros en 35 días deja de llevar el flag de nutrición (conserva los de entreno y
check-in). Deuda nueva en `TASKS.md § Backlog`: «pulse de nutrición sobre V2» — el service no conoce
`nutrition_plans_v2` (`dashboard.queries.ts:986` solo lo usa para el demo). N8 cubre el `null`.

**Fuera de alcance, deuda declarada en `TASKS.md § Backlog` y en `MOBILE_PARITY.md` (R4c):**
`apps/web/src/app/coach/clients/CoachWarRoom.tsx:222` y `:352-356` (tile y filtro «Nutri.» del directorio
web) y `apps/web/src/app/coach/dashboard/_components/kpi/KpiStrip.tsx:45` (hint «Nutricion: X%»). Con A23
esos contadores dejan de mentir para el coach sin planes, que es el caso real.

### Carril B — FAB con insets (D4)

Dos líneas, sin tests automatizados (no hay suite de layout RN); se valida en device.

```tsx
// apps/mobile/app/coach/(tabs)/clientes.tsx:1076 — render del FAB
style={[styles.fab, { backgroundColor: theme.primary, bottom: insets.bottom + 92 }, GLOWS.sport]}
```
```diff
// apps/mobile/app/coach/(tabs)/clientes.tsx:1410-1420 — StyleSheet `fab`
   fab: {
     position: 'absolute',
     right: 16,
-    bottom: 84,
     height: 50,
```

`insets` ya existe en el scope (`const insets = useSafeAreaInsets()`, `clientes.tsx:333`). El patrón es el
de `MobileQuickActionsFab` (`CoachDashboardSections.tsx:755-780`), que convive sin solaparse con la
cápsula flotante de `CoachMobileChrome.tsx` (anclada en `insets.bottom + 16`, `:204`). Se **quita** el
`bottom: 84` del StyleSheet para que no queden dos fuentes del mismo valor.

### Carril C — Agenda honesta (D1 · R2 · R3 · R5 · R6 · R10)

**Orden de trabajo obligatorio: servidor → web → RN.** El label se arma una sola vez y RN pinta lo que
llega; el fallback local RN llama a la misma función pura para no crear una tercera variante de copy (hoy
conviven dos: `'Sin ejercicio esta semana'` del servidor, `dashboard.queries.ts:385`, y
`'Adherencia critica - sin ejercicio en 7 dias'` del fallback, `coach-dashboard.ts:1082`).

1. **Package** — escribir `packages/profile-analytics/agenda-label.ts` + `agenda-label.test.ts` y
   re-exportarlo desde `index.ts`.
2. **Servidor** — `dashboard.queries.ts:341-393`: exportar `buildAgendaFromPulse`, calcular
   `days`/`label`/`severity`, ordenar por urgencia y devolver `{ items, total }`.
3. **Tipos y productores** — `types.ts:64-72` (+`:153`), `dashboard.queries.ts:261/291` y `:308/337`.
4. **Web UI** — `AgendaCard.tsx`, `PriorityCard.tsx:66-73`, `DashboardShell.tsx:257,266`.
5. **RN** — tipos y fallback en `coach-dashboard.ts`, render en `CoachDashboardSections.tsx:2309-2361`,
   NBA en `:2215-2223`, prop `agendaTotal` en `home.tsx:186-192` (`MobileFocusList`/NBA) y `:195`
   (`MobileTodayAgenda`).
6. **Borrar** `apps/web/src/app/coach/dashboard/_components/today/TodayAgenda.tsx` (R10): cero imports en
   `apps/web/src`, el árbol real usa `AgendaCard.tsx`.

#### `buildAgendaFromPulse` — programas

```ts
// apps/web/src/app/coach/dashboard/_data/dashboard.queries.ts:341 — pasa a `export function`
export function buildAgendaFromPulse(
    pulse: Awaited<ReturnType<typeof getCachedDirectoryPulse>>,
    expiring: Array<{ id: string; clientId?: string; clientName?: string; daysLeft: number; name: string }>,
    now: Date = new Date()
): { items: AgendaItem[]; total: number } {
    const items: AgendaItem[] = []
    const todayYmd = getTodayInSantiago(now).iso

    // R1.11 — los programas se ordenan por `daysLeft` ascendente ACÁ, al empujarlos: como su `days`
    // es `null`, el comparador de abajo los deja empatados y `Array#sort` es estable (ES2019), así
    // que este orden sobrevive dentro de cada grupo de severidad.
    for (const p of [...expiring].sort((a, b) => a.daysLeft - b.daysLeft)) {
        if (!p.clientId || !p.clientName) continue
        items.push({
            id: `expire-${p.id}`,
            clientId: p.clientId,
            clientName: p.clientName,
            kind: 'programa_vence',
            label: buildAgendaLabel({
                kind: 'programa_vence', days: null, dateText: null,
                programName: p.name, daysLeft: p.daysLeft,
            }),
            href: `/coach/clients/${p.clientId}`,
            dueAt: null,
            days: null,
            severity: programSeverity(p.daysLeft),
        })
    }
```

#### `buildAgendaFromPulse` — pulse, orden y tope

```ts
    for (const row of pulse) {
        const checkin = row.attentionFlags.includes('SIN_CHECKIN_1M')
        // `else if` conservado: un alumno con los dos flags genera UNA fila (check-in gana).
        if (!checkin && !row.attentionFlags.includes('SIN_EJERCICIO_7D')) continue
        const kind = checkin ? ('checkin_pendiente' as const) : ('sin_ejercicio' as const)
        const dueAt = checkin ? row.lastCheckinDate : row.lastWorkoutDate
        // Un solo YMD de Santiago alimenta el texto Y la cuenta de días: nada de medianoche del runtime.
        const dueYmd = dueAt ? getSantiagoIsoYmdForUtcInstant(dueAt) : null
        const days = daysSince(dueYmd, todayYmd)
        const dateText = dueYmd ? shortDayMonthEs(dueYmd) : null
        items.push({
            id: `${checkin ? 'checkin' : 'workout'}-${row.clientId}`,
            clientId: row.clientId,
            clientName: row.clientName,
            kind,
            label: buildAgendaLabel({ kind, days, dateText }),
            href: `/coach/clients/${row.clientId}`,
            dueAt,
            days,
            severity: agendaSeverity(days),
        })
    }

    // R5 — urgencia primero; dentro del grupo, el más viejo arriba. Los programas empatan en este
    // comparador (`days === null`) y conservan, por estabilidad, el `daysLeft` ascendente con el que
    // se empujaron arriba: quedan antes que las filas de pulse de la misma severidad.
    const rank = { danger: 0, warning: 1, none: 2 }
    items.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.days ?? -1) - (a.days ?? -1))
    return { items: items.slice(0, 8), total: items.length }
}
```

Los ids (`expire-`, `checkin-`, `workout-`) se conservan para no mover ninguna key de React. La fecha se
formatea **en el servidor** con `shortDayMonthEs` del package (R22) sobre el día Santiago del instante
(`getSantiagoIsoYmdForUtcInstant`, `date-utils.ts:340`): `AgendaCard` es un client component y **no
puede** usar `Intl` (`EVA-NEXTJS-18`), y usar la misma función que RN evita la divergencia de texto.
`dashboard.queries.ts` hoy **no importa** `@/lib/date-utils` (verificado con grep): la línea de import es
nueva y trae `getSantiagoIsoYmdForUtcInstant` y `getTodayInSantiago`; `shortDayMonthEs`, `daysSince`,
`agendaSeverity`, `programSeverity` y `buildAgendaLabel` vienen de `@eva/profile-analytics`.

**Orden con `daysLeft` — ejemplo obligatorio del test** (`dashboard.queries.test.ts`): con un programa
`daysLeft: 3` (`warning`), otro `daysLeft: 1` (`warning`) y una fila `sin_ejercicio` de 9 d (`warning`),
el orden esperado es `daysLeft 1` → `daysLeft 3` → `sin_ejercicio 9 d`. Es lo que decide el destino del
NBA (`agenda[0]`, `CoachDashboardSections.tsx:2007-2008`) y el color de la primera fila.

#### Web UI

- `AgendaCard.tsx`: prop nueva `total: number`; borrar `slotTime` (`:16-23`) y `const done = 0` (`:32`);
  `SectionTitle` pasa a título `Pendientes de hoy` con `action={`${total} pendientes`}`; cada fila pinta
  un punto de 8 px con el color de `a.severity` en lugar de la hora mono y el subtítulo es `a.label`; si
  `agendaTotal > items.length` (= `> 8`, el tope), última fila `y {N} más en Alumnos` con `href="/coach/clients"`; el vacío pasa a
  `Todo al día` / `Sin pendientes hoy.`.
- `PriorityCard.tsx:66-73`: `agendaPending` se alimenta de `data.agendaTotal` (`DashboardShell.tsx:257`),
  título `{N} pendientes hoy` (singular `1 pendiente hoy`) y CTA `Ver pendientes`.
- `DashboardShell.tsx:266`: `<AgendaCard items={data.agenda} total={data.agendaTotal} />`.

#### RN

- `MobileTodayAgenda` (`CoachDashboardSections.tsx:2309-2361`): firma
  `{ items, total }: { items: MobileAgendaItem[]; total: number }`; se borran `startMinutes`/`slot`
  (`:2329-2330`) y el header `0 de {items.length} hechas` (`:2320`) pasa a `{total} pendientes`; el
  título pasa a `Pendientes de hoy`; el `leading` del `ListRow` (`:2342-2350`) deja de reservar 86 px de
  hora y queda punto de severidad + ícono por `kind`; fila final `y {N} más en Alumnos` →
  `router.push('/coach/(tabs)/clientes')`; vacío `Todo al día` / `Sin pendientes hoy.`.
- NBA (`:2215-2223`): usa `agendaTotal` para el título y sigue navegando a `agenda[0].clientId` desde los
  dos `handleNba` (`:1995-2010` y `:2266-2280`). Con el orden nuevo `agenda[0]` es el **más urgente**:
  es el comportamiento buscado y va explícito al checklist de QA (R5).
- **Cableado de `agendaTotal` en el home (R26):** no alcanza con `MobileTodayAgenda`. `MobileFocusList`
  —que embebe el NBA— también gana la prop y se la pasa desde `apps/mobile/app/coach/(tabs)/home.tsx:186-192`
  (`agendaTotal={data.agendaTotal}` junto a `agenda={data.agenda}`), además del `:195` de
  `MobileTodayAgenda`. Sin eso el NBA seguiría contando `agenda.length` (tope 8) y el título mentiría
  con más de 8 pendientes.
- Fallback local (`coach-dashboard.ts:1115-1130`): arma el mismo shape con `buildAgendaLabel` —`dueAt`
  desde `latestWorkout.get(id)?.logged_at` / `latestCheckIn.get(id)?.created_at` (los dos `Map` ya
  existen en `:989-990`), `days` con `daysSince(getSantiagoIsoYmdForUtcInstant(dueAt), getTodayInSantiago().iso)`
  y `dateText` con `shortDayMonthEs(dueYmd)`, el mismo YMD de Santiago que alimenta la cuenta de días
  (helpers de `apps/mobile/lib/date-utils.ts`: `getTodayInSantiago` `:58` y `getSantiagoIsoYmdForUtcInstant`
  `:75`). **Nada de `toLocaleDateString`** en el fallback (R22): si RN formateara con `Intl` volvería la
  divergencia `sept` / `sept.` contra el servidor y el test de paridad N4 quedaría rojo. Deja de reusar
  `client.label` de `riskItems` (`:1071`, `:1078`).
- **`agendaTotal` del fallback (R17)**: se cuenta sobre **`riskItems`** (`coach-dashboard.ts:1061`) más los
  programas por vencer, **antes** de cualquier `slice`: ni sobre `topRiskClients` (`:1087`, ya recortado a
  5), ni después del `.slice(0, 8)` de `expiringPrograms` (`:1113`) o del `.slice(0, 8)` del array `agenda`
  (`:1130`). Con 9 riesgos el fallback debe reportar `agendaTotal: 9` y pintar 8 filas + «y 1 más en
  Alumnos»; es exactamente lo que prueba N4.

### Carril D — Chip de 7 días (D2 · R9)

El cambio vive **solo** en las dos funciones de estado. Ningún `DirRowCard` se toca: los dos ya gatean por
key — web `apps/web/src/app/coach/clients/DirRowCard.tsx:191` y RN
`apps/mobile/components/coach/directory/DirRowCard.tsx:144`, ambos `{st.key !== 'active' ? <pill/> : null}`
— así que a los 8 días la píldora desaparece sola en las dos plataformas. (Corrige a R2 §A4, que atribuía
el `:191` a RN y afirmaba que la web no gateaba.)

```ts
// apps/web/src/app/coach/clients/_lib/client-status.ts — junto a HOUR_MS/DAY_MS (:50-51)
export const ENTERED_CHIP_WINDOW_DAYS = 7

/** Días calendario desde el primer login; misma fórmula que `enteredLabel` (:73). */
function daysSinceFirstLogin(firstLoginMs: number, now: Date): number {
    return Math.round((startOfLocalDay(now.getTime()) - startOfLocalDay(firstLoginMs)) / DAY_MS)
}

// :109-116 — la rama `firstLoginMs !== null` de `getClientStatusMeta`
    const firstLoginMs = parseIso(firstLoginAt)
    if (firstLoginMs !== null) {
        const activeMeta = { key: 'active', label: 'Activo',
            cls: 'bg-[var(--success-100)] text-[var(--success-700)]' } as const
        if (daysSinceFirstLogin(firstLoginMs, now) > ENTERED_CHIP_WINDOW_DAYS) return activeMeta
        return { key: 'entered', label: enteredLabel(firstLoginMs, now),
            cls: 'bg-[var(--success-100)] text-[var(--success-700)]' }
    }
```

**Detalle que no se puede perder:** el retorno de `active` va **dentro** de la rama
`firstLoginMs !== null`, antes del `if (forcePasswordChange)`. Si se dejara caer, un alumno viejo con
`force_password_change: true` pasaría a `pending_sync` («Todavía no cambió su clave»): regresión. La
precedencia queda archivado > pausado > primer login (entered ≤ 7 d, active > 7 d) > pendiente de clave.

RN es el espejo en `apps/mobile/components/coach/directory/directory-shared.ts:111` (la rama `entered` es
una sola línea), devolviendo `{ key: 'active', label: 'Activo', tone: 'success' }` cuando
`days > ENTERED_CHIP_WINDOW_DAYS`. `enteredLabel` (web `:66-77`, RN `:65-76`),
`FIRST_LOGIN_SIGNAL_CUTOVER`, `clientStatusInputFromRow`, `lastInfo` y los filtros de
`apps/mobile/lib/clients-directory.ts:252-278` **no se tocan**: ese filtro recalcula desde flags crudos y
nunca llama a `statusMeta`. Dos superficies distintas pintan siempre el label, sin gate por key: la **tabla densa RN**
(`apps/mobile/app/coach/(tabs)/clientes.tsx:258-261`) y la **tabla angosta web**
(`apps/web/src/app/coach/clients/DirTableMobile.tsx:200-207`, `{st.label}` en `:206`; ese archivo no
existe en RN). A los 8 días mostrarán `Activo` — aceptable, va al QA (Q16 RN, Q16b web).
Nada toca `clients.first_login_at`, su sellado
(`apps/web/src/services/client/student-login-signal.service.ts:53-58`) ni el drip W6: los consumidores de
la columna leen la fila directo y ninguno importa estos dos módulos.

---

## Gates

Comandos exactos (OUTLINE §7, literal). Nada se declara verde sin ejecutarlo:

```
pnpm docs:check
pnpm lint
pnpm lint:mobile
pnpm typecheck
pnpm --filter @eva/mobile exec tsc --noEmit
pnpm exec vitest run apps/web/src/app/coach/clients/_lib/client-status.test.ts apps/web/src/app/coach/dashboard/_data/dashboard.queries.test.ts packages/profile-analytics/agenda-label.test.ts packages/profile-analytics/top-alert.test.ts packages/profile-analytics/client-status.test.ts apps/web/src/services/dashboard-attention-nutrition.test.ts tests/mobile-coach-client-detail-logic.test.ts tests/mobile-directory-pulse-parity.test.ts tests/mobile-directory-nutrition-gate.test.ts
pnpm exec vitest run --project mobile-node tests/mobile/directory-status.test.ts tests/mobile/coach-dashboard-deltas.test.ts tests/mobile/coach-dashboard-agenda.test.ts tests/mobile/domain-guard.test.ts tests/mobile/client-tabs.test.ts
pnpm check:tokens
```

Notas de ejecución:
- `pnpm --filter @eva/mobile exec tsc --noEmit` es el gate que más va a doler (cadena de `number | null`
  del carril A) y **no lo corre CI**: es obligatorio local
  (`docs/testing/TEST_STATUS.md § Gates locales obligatorios que CI no corre`).
- Los archivos del package van **uno por uno** (mismo comando que `TASKS.md:104`, E2): pasar la carpeta
  `packages/profile-analytics` como filtro arrastra `overview.test.ts`, flaky entre las 21:00 y medianoche de Chile
  por `toISOString()` en UTC contra ventanas en hora local (`overview.test.ts:9-12`). Si sale rojo y el
  diff no tocó `overview.ts`, es el reloj: correrlo de día y anotarlo, no «arreglarlo».
- N8 (`nutritionCompliance: null` ⇒ sin `NUTRICION_RIESGO`) va en el archivo **nuevo**
  `apps/web/src/services/dashboard-attention-nutrition.test.ts` (ruta única del tren, la que ya usan
  `TASKS.md` A27, A28 y E2) — verificado que hoy no existe y que ningún test
  mockea `computeNutritionAdherence` fuera de `packages/nutrition-engine/adherence.test.ts`.
  `calculateAttentionScore` está exportada (`dashboard.service.ts:73`) y el criterio del `null` sale del
  helper exportado `nutritionComplianceFromAdherence(perDay, summary)` (A23): el test los importa a los dos
  y es puro, sin Supabase.

---

## Entrega

1. **Commit** en `rnmobiledenuevo`, con los gates de arriba corridos y su salida real en `TASKS.md`.
2. **Deploy web**: se dispara solo al mergear `rnmobiledenuevo` → `master` (integración Git de Vercel).
   Se anota el `dpl_…` y se espera READY antes de la OTA.
3. **OTA 1.1.2** en el canal `production`, **desde el piso Apple**: antes de publicar, leer el estado
   real en App Store Connect y confirmar que la versión `READY_FOR_SALE` sea ≥ 1.1.2
   (`docs/operations/MOBILE_RELEASES_OTA.md`). Solo JS: nada nativo, el `runtimeVersion` no se mueve.
4. **Verificación de la OTA**: `eas update:list --branch production --limit 8 --json`, chequeando **un
   grupo por plataforma** (android `<uuid>` / ios `<uuid>`) y `runtimeVersion` 1.1.2. Los dos uuid y los
   run de GitHub Actions se anotan en `TASKS.md § E · Cierre` y en `CURRENT.md`.
5. **E2E `prod-suave` al cierre**, tras el deploy y contra producción: `pnpm qa:prod:suave` (Playwright,
   un solo navegador). Se registra el resultado `N/N` y el id del run.
6. **Docs (W5)**: fila Web/PWA + lista de trenes en `docs/status/CURRENT.md` — antes medir con
   `wc -c docs/status/CURRENT.md` y, si se pasa de 16 KB, mover una entrada «Anterior …» a su spec (R13);
   blockquote de QA + la deuda web de nutrición (directorio y KPI) en `docs/status/MOBILE_PARITY.md`;
   `docs/testing/TEST_STATUS.md` solo si cambian los gates. Cerrar con `pnpm docs:check`.
7. **QA del owner en device** con el checklist único de `TESTING-QA.md` (Q1…Qn). Con el verde del owner
   el `status` del SDD pasa a `active` y, al cierre, a `done`.
8. **Aviso a Movens** una vez verde el QA, sobre los cuatro puntos que reportó. Lo manda el owner.

Push, deploy y OTA **solo a pedido del owner**: la fase de plan no ejecuta ninguno de los tres (D6).
