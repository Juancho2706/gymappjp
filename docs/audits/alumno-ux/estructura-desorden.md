# Auditoría de Arquitectura de Información — App del Alumno (EVA)

**Fecha:** 2026-07-02 · **Alcance:** `apps/web/src/app/c/[coach_slug]/**` + `apps/web/src/components/client/**` · **Modo:** READ-ONLY.
**Motivación (CEO):** "desorden — cosas que se repiten, menús con opciones que también están en otros lados".

> Veredicto de una línea: hay **cuatro superficies distintas de 'ajustes de cuenta'** (nav desktop, sheet "Más" mobile, engranaje del dashboard, y la pantalla `/perfil`) que exponen **el mismo trío Tema + Colores del coach + Cerrar sesión**; la pantalla nueva `/perfil` se titula **"Más"** — el mismo nombre que el sheet del nav que la abre; y **check-in** se alcanza desde 4–5 lugares del dashboard. El eje de arreglo es: **`/perfil` = hogar único de cuenta/apariencia**, y todo lo demás degrada a atajo o se elimina.

---

## 1. MAPA COMPLETO POR PANTALLA

Notación: `[TAB]` = ítem de navegación, `[BTN]`/`[CARD]` = acción, `[SHEET]`/`[MODAL]` = overlay, `→ ruta` = destino.

### Shell de navegación — `components/client/ClientNav.tsx`
Dos renders mutuamente excluyentes por breakpoint.

**Sidebar DESKTOP (`md:`)** (`ClientNav.tsx:300-385`)
- Logo + "Mi Coach" + brand name (`:307-327`)
- `[TAB]` Inicio → `/dashboard` (`baseItems :116`)
- `[TAB]` Plan Alimenticio → `/nutrition` (solo si `showNutrition`, `:117`)
- `[TAB]` Aprender → `/exercises` (`:118`)
- `[TAB]` Check-in → `/check-in` (`:119`)
- Grupo **Módulos** (`:341-349`): `[TAB]` Movimiento → `/movimiento` (`:125`), `[TAB]` Composición → `/bodycomp` (`:126`) — entitled server-side
- Zona inferior (`:353-384`): `[BTN]` Instalar app (`PwaNavButton :355`), `[TOGGLE]` **Tema** (`ThemeToggle :360`), `[TOGGLE]` **Colores del coach** (`Switch :367`), `[BTN]` **Cerrar sesión** (`:373`)
- **Nota:** `Historial` NO está en el sidebar desktop (ver §3, huérfano).

**Cápsula flotante + sheet "Más" MOBILE (`ClientNav.tsx:387-599`)**
- Cápsula: `[TAB]` Inicio · Plan · Aprender · Check-in + `[BTN]` **Más** (abre sheet)
- Sheet "Más" (`:388-501`):
  - `[CARD]` **Mi perfil** → `/perfil` — subtítulo "Racha, módulos, cuenta y más" (`:425-447`)
  - Grid overflow (`:450-473`): `[TAB]` Historial → `/workout-history` (`:132`) + Movimiento/Composición (entitled)
  - Acciones de cuenta (`:476-497`): `[BTN]` Instalar (`PwaNavButton :477`), `[TOGGLE]` **Tema** (`:480`), `[TOGGLE]` **Colores del coach** (`:487`), `[BTN]` **Cerrar sesión** (`:491`)

### Dashboard — `dashboard/page.tsx` (+ `desktop/DashboardDesktop.tsx`)
- `[MODAL]` **Engranaje "Configuración"** (`DashboardHeader.tsx:36` mobile / `DesktopDashboardHead.tsx:51` desktop) → `ClientSettingsModal` con: **Tema**, **Colores del coach**, Consentimiento (solo team), **Alarma de descanso** (sonido), footer `v1.2.0`
- `[BANNER]` **Check-in** (`checkin/CheckInBanner.tsx`) → `/check-in` — condicional (aparece si nunca hizo check-in o ≥3 días)
- `[CARD]` **Coach presence** "Tu coach" con ícono de mensaje (`coach/CoachPresenceCard.tsx:36`) → **`/check-in`** (¡no es un chat!)
- `[CARD]` Hero "qué hago hoy" → ejecución de rutina `/workout/[planId]` (`hero/WorkoutHeroCard.tsx`) + `[SHEET]` QuickLog para registrar series sin entrar (`hero/QuickLogSheet.tsx`)
- `[SECTION]` Tu programa (`program/ActiveProgramSection`) → `/workout/[planId]`
- `[CARD]` **Peso** (`weight/WeightWidget.tsx:64`) → botón "Registrar" → **`/check-in`**
- `[CARD]` **Records personales** (`records/PersonalRecordsCard.tsx`) — top 4, kg + nombre + badge "NUEVO"; **sin fecha, sin tap** (ver §4)
- `[SECTION]` Actividad reciente (`history/RecentWorkoutsSection`) → "ver todo" `/workout-history`
- `[CARD]` **Hábitos de hoy** (`habits/HabitsTrackerWidget`) — edita tabla `daily_habits`
- `[SECTION]` Nutrición de hoy (`nutrition/NutritionDailySummary`) → acción "Ver dieta" `/nutrition` (`page.tsx:159`)
- `[BANNER]` Anuncios de org (`OrgAnnouncementBanner`, solo si org)
- `[MODAL]` WelcomeModal (bienvenida del coach, 1ª vez)

### Nutrición — `nutrition/NutritionShell.tsx` (1147 líneas, single-scroll con secciones gateadas por `sectionFlags`)
- DayNavigator (navegar días), AdherenceStrip, MacroRingSummary, MealCards (marcar comidas), ExchangeEquivalencesSheet
- `[SECTION]` **Hábitos** (`HabitsTracker`) — edita la MISMA tabla `daily_habits` que el widget del dashboard
- `[SECTION]` Off-plan logger, Notas, Recetas (`RecipeIdeasSection`), Weekly recap
- `[SECTION]` **Lista de compras** (`ShoppingListView`) + `[BTN]` Compartir por WhatsApp
- `[BTN]` "WhatsApp detalle" / "Resumen WhatsApp" (`NutritionShell.tsx:1057,1082`), `[BANNER]` push notifications
- Nomenclatura del dominio: "Plan Alimenticio" (nav), "Plan" (tab corto), "Nutrición de hoy" / "Ver dieta" (dashboard) — 4 nombres.

### Aprender / Ejercicios — `exercises/page.tsx` + `ClientExerciseCatalog.tsx`
- Catálogo de técnica agrupado por músculo, búsqueda, filtros. Read-only (biblioteca).
- **5 nombres para la misma pantalla:** nav "Aprender" · header mobile "Aprender Técnica" · header desktop "Aprender" · eyebrow "Biblioteca de técnica" · `<title>` "Catálogo de Ejercicios" (`page.tsx:9,43,60,55`).

### Check-in — `check-in/CheckInForm.tsx` (713 líneas)
- Registro de peso, energía, fotos, notas. Único formulario; alcanzado desde 4–5 orígenes (ver §2).

### Workout (ejecución) — `workout/[planId]/*`
- No es un `[TAB]`; se lanza desde Hero / Programa. Oculta el nav (`ClientNav.tsx:186,389,508`).
- `[OVERLAY]` **WorkoutSummaryOverlay** post-entreno con **récords detectados** (§4) + compartir.

### Historial — `workout-history/page.tsx` + `WorkoutHistoryList.tsx`
- Lista de entrenos pasados. Entradas: sheet "Más" (mobile), `/perfil` › Cuenta, "ver todo" de Actividad reciente. Ausente del sidebar desktop.

### Movimiento — `movimiento/page.tsx` · Composición — `bodycomp/page.tsx`
- Read-only, gateados por módulo (`notFound()` si OFF). Entradas: grupo Módulos del nav (desktop + sheet) **y** `/perfil` › Módulos.

### Perfil (NUEVO) — `perfil/page.tsx` + `_components/ProfileClient.tsx`
- **`<title>` = "Más"** (`page.tsx:16`) y **`<h1>` = "Más"** (`ProfileClient.tsx:203`) — colisión de nombre con el sheet del nav.
- `[HERO]` Identidad: avatar + nombre + coach + programa (`:206-229`)
- `[STAT]` **Entrenos** + **Racha** (`StatCard :232-235`) — NO muestra records/PRs
- `[BTN]` Compartí tu logro (native share / clipboard) (`:238-255`)
- `[SECTION]` **Apariencia**: **Tema** (`:262`) + **Colores del coach** (`:272`)
- `[SECTION]` **Módulos**: Movimiento / Composición → "Ver" (`:288-322`)
- `[SECTION]` **Cuenta**: Historial de entrenos (`:330`), **Ayuda** (mailto `SALES_EMAIL` `:332`), **Cerrar sesión** (`:334`)
- `[SECTION]` **Zona de peligro**: Solicitar baja de cuenta (mailto privacidad) (`:342-358`)

### Onboarding — `onboarding/OnboardingForm.tsx` · Change-password — `change-password/page.tsx` · Suspended
- Flujos aislados fuera del shell (el nav se oculta en `/onboarding`, `/login`, etc. — `ClientNav.tsx:181`).

---

## 2. MATRIZ DE DUPLICACIÓN

| Acción / opción | Lugares (archivo:línea) | ¿Intencional? | Recomendación |
|---|---|---|---|
| **Tema (claro/oscuro)** | (1) Sidebar desktop `ClientNav.tsx:360` · (2) Sheet "Más" mobile `ClientNav.tsx:480` · (3) Engranaje dashboard `ClientSettingsModal.tsx:107` · (4) `/perfil` Apariencia `ProfileClient.tsx:262` | **RUIDO** (4×) | Hogar único = **`/perfil` › Apariencia**. Conservar el toggle en el nav (desktop+mobile) como atajo *solo si* se elimina del engranaje. **Sacar del engranaje del dashboard.** |
| **Colores del coach** | (1) `ClientNav.tsx:367` · (2) `ClientNav.tsx:487` · (3) `ClientSettingsModal.tsx:122` · (4) `ProfileClient.tsx:272` | **RUIDO** (4×) | Igual que Tema: fuente única en `/perfil`. Sacar del engranaje. (3 handlers idénticos `handleToggleBrandColors` copiados en 3 componentes.) |
| **Cerrar sesión** | (1) `ClientNav.tsx:373` · (2) `ClientNav.tsx:491` · (3) `ProfileClient.tsx:334` | Parcial | Mantener en `/perfil` (canónico) + nav desktop (sin `/perfil` visible en desktop). En mobile el sheet ya linkea a `/perfil` → **quitar el "Cerrar sesión" duplicado del sheet**. |
| **Instalar app (PWA)** | (1) `ClientNav.tsx:355` · (2) `ClientNav.tsx:477` | OK (desktop vs mobile, excluyentes) | Sin cambio; considerar sumarlo a `/perfil` para unificar "cuenta". |
| **Módulos (Movimiento/Composición)** | (1) Grupo Módulos sidebar `ClientNav.tsx:125-126` · (2) Sheet "Más" overflow `:133` · (3) `/perfil` Módulos `ProfileClient.tsx:288-322` | Parcial (3×) | Navegación primaria = nav. En `/perfil` degradar a **read-only informativo** (ya dice "solo lectura") o quitar si el nav ya los muestra. |
| **Historial de entrenos** | (1) Sheet "Más" `ClientNav.tsx:132` · (2) `/perfil` Cuenta `ProfileClient.tsx:330` · (3) "ver todo" Actividad reciente `RecentWorkoutsSection` | Parcial | OK como atajos; **falta en sidebar desktop** (§3). |
| **Ir a Check-in** | (1) `[TAB]` nav (capsule+sidebar) · (2) `[BANNER]` `CheckInBanner.tsx` · (3) `[CARD]` "Tu coach" `CoachPresenceCard.tsx:36` · (4) "Registrar" peso `WeightWidget.tsx:64` | Mezcla | Tab + banner condicional = atajos válidos. **La card "Tu coach" (ícono mensaje) que va a check-in es engañosa** (§3). "Registrar" del peso → check-in está OK pero refuerza que check-in es el hub de logging. |
| **Hábitos (`daily_habits`)** | (1) Dashboard "Hábitos de hoy" `HabitsTrackerWidget` · (2) Nutrición `HabitsTracker.tsx` | **RUIDO conceptual** | Misma tabla, **dos UIs distintas**. Decidir un hogar (sugerido: dashboard como resumen tappable → nutrición como editor, o viceversa) y que el otro sea read-only. |
| **Compartir / logro (share)** | `/perfil` "Compartí tu logro" (native share) · ShoppingList "Compartir WhatsApp" · WeeklyRecap "Compartir mi semana" · NutritionShell "WhatsApp detalle/resumen" · WorkoutSummaryOverlay compartir | Contenido distinto | No es duplicación real (distintos payloads), pero **3 mecánicas distintas** (navigator.share vs wa.me vs clipboard). Unificar en un helper de share consistente. |
| **Configuración (engranaje) vs sheet "Más" vs `/perfil`** | `ClientSettingsModal` (engranaje) ⟂ sheet "Más" ⟂ `/perfil` | **RUIDO estructural** | Ver §3 — el engranaje del dashboard es el más redundante; su único contenido propio es "Alarma de descanso". |

---

## 3. HUÉRFANOS / INCONSISTENCIAS (modelo mental del alumno)

1. **Dos cosas llamadas "Más".** El sheet del nav se rotula "Más" (`ClientNav.tsx:412`) y la pantalla `/perfil` también (`<title>` y `<h1>` = "Más", `perfil/page.tsx:16`, `ProfileClient.tsx:203`). El sheet **abre** la pantalla "Mi perfil" pero además **duplica** sus acciones (Tema/Colores/Cerrar sesión/Historial/Módulos). Tras crear `/perfil`, el sheet quedó **redundante**: debería ser un lanzador delgado (Mi perfil + navegación overflow) y delegar TODA la cuenta/apariencia a `/perfil`. **Recomendación de nombre:** la pantalla = **"Perfil"** o **"Mi cuenta"**; el sheet = **"Más"** (solo navegación). Nunca los dos "Más".

2. **El engranaje del dashboard casi no tiene razón de ser.** `ClientSettingsModal` (`DashboardHeader.tsx:36`) repite Tema + Colores (que ya están en nav y en `/perfil`). Su **único contenido exclusivo** es **"Alarma de descanso"** (sonido del timer, `ClientSettingsModal.tsx:149-177`) — que conceptualmente pertenece a la **ejecución de rutina**, no a un engranaje global del dashboard. Además muestra `v1.2.0`. **Recomendación:** eliminar el engranaje del dashboard; mover "Alarma de descanso" a los ajustes del reproductor de rutina (`/workout`) o a `/perfil › Preferencias`; mover la versión al footer de `/perfil`.

3. **Card "Tu coach" que no contacta al coach.** `CoachPresenceCard` se presenta como chat (avatar, badge "Tu coach", ícono `MessageCircle`, texto "Escríbeme cuando quieras…") pero navega a **`/check-in`** (`CoachPresenceCard.tsx:36`). Rompe la expectativa: el alumno cree que va a mensajear y termina en un formulario. **Recomendación:** o (a) renombrar/reencuadrar como "Enviar check-in a tu coach", o (b) apuntar a un canal real de contacto. No presentarlo como mensajería.

4. **`Historial` es ítem de nav en mobile pero no en desktop.** Está en `overflowItems` (sheet "Más", `ClientNav.tsx:131-134`) pero el sidebar desktop solo muestra `baseItems` + `moduleItems`. En desktop, Historial solo se alcanza vía `/perfil` o "ver todo" de Actividad reciente. **Inconsistencia de paridad.** Decidir: o Historial entra al sidebar desktop, o se acepta que vive en `/perfil` en ambos.

5. **`/perfil` muestra Entrenos + Racha pero NO records.** El alumno esperaría ver sus logros (PRs) junto a Racha/Entrenos en su perfil; hoy los records solo viven en el dashboard (§4). Hogar natural de un "historial de logros" = `/perfil`.

6. **Nomenclatura inconsistente (misma cosa, varios nombres):**
   - Ejercicios: "Aprender" / "Aprender Técnica" / "Biblioteca de técnica" / "Catálogo de Ejercicios" (5 nombres, `exercises/page.tsx`).
   - Nutrición: "Plan Alimenticio" / "Plan" / "Nutrición de hoy" / "dieta".
   - Cuenta/ajustes: "Configuración" (modal) / "Más" (sheet+pantalla) / "Apariencia" (sección) / "Cuenta" (sección). Elegir un léxico único.

7. **Código muerto que perpetúa duplicación de records.** `DashboardSidebarBlocks.tsx` (usa `PersonalRecordsBanner`) **no se importa en ningún lado** → dos componentes de records (`PersonalRecordsCard` vivo, `PersonalRecordsBanner`+`PRBadge` muertos) mantienen dos diseños del mismo dato. Borrar el muerto al rediseñar §4.

8. **`Ayuda` (contacto/soporte) solo en `/perfil`** (`ProfileClient.tsx:332`, mailto). Bien centralizado — mantener como fuente única; no dispersarlo.

---

## 4. RECORDS / TROFEOS (pedido explícito del CEO)

### 4.1 Dónde se muestran hoy (3 superficies, ninguna con fecha ni detalle)

| Superficie | Componente | Qué muestra | Fecha | Tap→detalle |
|---|---|---|---|---|
| Dashboard (mobile + desktop) | `records/PersonalRecordsCard.tsx` (usada en `dashboard/page.tsx:139` y `DashboardDesktop.tsx:111`) | Card oscura, grid 2-col, top 4: `weightKg` + `exerciseName` + badge "NUEVO" (si `fresh` <24h) | ❌ | ❌ |
| Dashboard (chips) | `records/PersonalRecordsBanner.tsx` + `PRBadge.tsx` | Chips horizontales + confetti si fresh | ❌ | ❌ | **← CÓDIGO MUERTO** (solo usada por `DashboardSidebarBlocks`, sin imports) |
| Post-entreno | `workout/[planId]/WorkoutSummaryOverlay.tsx:219-257` | Récords de la sesión: `prevKg → newKg (+%)` + 1RM estimado | ❌ (es "ahora") | ❌ |

### 4.2 Qué data YA existe (no hay que crear tablas)

`getPersonalRecords(clientId)` (`dashboard/_data/dashboard.queries.ts:288-364`) ya devuelve por PR el tipo `PersonalRecordItem` (`:279-286`):

```ts
type PersonalRecordItem = {
  exerciseId: string      // ← ya disponible (para el tap → detalle)
  exerciseName: string
  weightKg: number
  achievedAt: string      // ← ISO, ya disponible (para la FECHA)
  fresh: boolean          // PR logrado en <24h
}
```

La progresión histórica de un lift también es derivable **sin schema nuevo**: `workout_logs(weight_kg, block_id, logged_at)` → `workout_blocks(id → exercise_id)` → filtrar por `exercise_id` (exactamente el mismo join que ya hace `getPersonalRecords`, `:294-331`).

### 4.3 Diseño propuesto (concreto)

**A. Fecha visible en cada PR.** En `PersonalRecordsCard` agregar bajo el nombre del lift una línea con la fecha de `achievedAt` (formato corto Santiago, p.ej. "12 jun" o relativo "hace 3 días" con `formatRelativeDate`/`formatLongDateSantiago` ya en `lib/date-utils`). El badge "NUEVO" (`fresh`) se conserva.

**B. Tap → `PRDetailSheet` (bottom-sheet).** Hacer cada PR tappable; pasa `exerciseId` (ya en `pr.exerciseId`). El sheet muestra:
- Encabezado: `exerciseName` + trofeo
- PR actual: `weightKg` grande + "logrado el {fecha}" (`achievedAt`)
- **Progresión histórica** del lift: mini-gráfico de línea (peso tope por sesión/fecha) + lista de hitos (fechas donde se superó la marca) + 1RM estimado (helper `epleyOneRM` ya usado en `WorkoutSummaryOverlay`).

**C. Contrato de la query nueva (data ya disponible):**

```ts
// dashboard/_data/dashboard.queries.ts (o records.queries.ts)
export type PRHistoryPoint = { date: string; topWeightKg: number; estimated1RM: number }
export type ExercisePRDetail = {
  exerciseId: string
  exerciseName: string
  currentPr: { weightKg: number; achievedAt: string }
  history: PRHistoryPoint[]   // orden ascendente por fecha; topWeightKg = max weight de ese día
}
export const getExercisePRHistory =
  cache(async (clientId: string, exerciseId: string): Promise<ExercisePRDetail | null> => { /* … */ })
```

Implementación: `workout_logs` del cliente `.not('weight_kg','is',null)` → resolver `block_id → exercise_id` (join a `workout_blocks`, filtrar `= exerciseId`) → agrupar por `logged_at::date`, `topWeightKg = max(weight_kg)` por día → `estimated1RM` con Epley sobre las reps del set tope. Es el mismo pipeline de `getPersonalRecords`, acotado a un ejercicio.

**D. Consolidación.** Un solo componente de records (borrar `PersonalRecordsBanner` + `PRBadge` + `DashboardSidebarBlocks` muertos). Considerar **replicar la lista de records en `/perfil`** (junto a Entrenos/Racha) como "historial de logros" tappable → mismo `PRDetailSheet`, un solo hogar de detalle.

---

## 5. PRIORIZACIÓN (por impacto en la sensación de "desorden")

1. **[ALTA] Colapsar las 4 superficies de ajustes en 1.** Hacer `/perfil` el hogar único de Tema + Colores + Cerrar sesión + Ayuda + Zona de peligro. **Eliminar el engranaje del dashboard** (mover "Alarma de descanso" a `/workout`); **quitar del sheet "Más"** las acciones que `/perfil` ya cubre (dejar el sheet como navegación pura). Resuelve el trío duplicado ×4.
2. **[ALTA] Deshacer la colisión "Más" vs "Más".** Renombrar la pantalla a **"Perfil"/"Mi cuenta"**; reservar "Más" para el sheet de navegación.
3. **[MEDIA] Records con fecha + tap→detalle** (§4) usando data ya disponible; borrar los 3 componentes muertos de records.
4. **[MEDIA] Arreglar la card "Tu coach"** que va a check-in (renombrar o repuntar a contacto real).
5. **[MEDIA] Decidir un hogar para Hábitos** (dashboard vs nutrición escriben la misma tabla).
6. **[BAJA] Paridad de `Historial`** desktop/mobile y **unificar nomenclatura** (Aprender, Nutrición, Cuenta).

### Anclas de código (para el fix)
- Nav/sheet: `components/client/ClientNav.tsx:355-497`
- Engranaje: `components/client/ClientSettingsModal.tsx` (usos en `DashboardHeader.tsx:36`, `DesktopDashboardHead.tsx:51`)
- Perfil: `app/c/[coach_slug]/perfil/{page.tsx,_components/ProfileClient.tsx}`
- Records: `dashboard/_components/records/*` + `dashboard/_data/dashboard.queries.ts:279-364`
- Card coach engañosa: `dashboard/_components/coach/CoachPresenceCard.tsx:36`
- Hábitos duplicados: `dashboard/_components/habits/HabitsTrackerWidget.tsx` vs `nutrition/_components/HabitsTracker.tsx`
- Código muerto: `dashboard/_components/DashboardSidebarBlocks.tsx`, `records/PersonalRecordsBanner.tsx`, `records/PRBadge.tsx`
