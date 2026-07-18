# Unidad: dashboard-sections (key: `dashboard-sections`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = el MONOLITO de widgets del dashboard del coach. Un solo archivo RN (4405 L) posee TODAS las secciones visibles. Es la unidad de mayor peso visual de la Seccion 3 (la que el CEO mira primero).

## Alcance exacto — inventario de exports (CoachDashboardSections.tsx)
Cada export = una seccion; cita web + linea RN:
| RN export | RN L | Web fuente |
|---|---|---|
| `MobileBillingBanners` | 138 | `dashboard/_components/banners/BillingBanners.tsx` |
| `MobileTierUsageBanners` | 205 | (tier/uso — banners) |
| `MobilePublicCodeRequiredModal` | 356 | modal codigo publico |
| `MobileFreeWelcomeModal` | 448 | `dashboard/_components/FreeWelcomeModal.tsx` |
| `MobileOnboardingChecklist` | 625 | `dashboard/CoachOnboardingChecklist.tsx` + `_components/onboarding/*` |
| `MobileQuickActionsBar` / `MobileQuickActionsFab` | 1059 / 1112 | `_components/header/QuickActionsBar.tsx`, `DashboardFab.tsx` |
| `MobileOnboardingGuideChip` | 1209 | `_components/onboarding/*` |
| `MobileGreetingHeader` | 1748 | `_components/header/GreetingHeader.tsx` + `_hooks/useTimeOfDayGreeting.ts` |
| `CoachNewsBell` | 1985 | `components/coach/NewsBellButton.tsx` |
| `MobilePulseHero` | 2117 | `_components/PulseHero.tsx` |
| `MobileKpiStrip` | 2226 | `_components/kpi/KpiStrip.tsx` + `KpiTile.tsx` |
| `MobileFocusList` | 2340 | `_components/PriorityCard.tsx` + `focus/FocusList.tsx` |
| `MobileNextBestAction` | 2587 | `_components/cs/NextBestAction.tsx` + `_lib/nextBestAction.rules.ts` |
| `MobileTodayAgenda` | 2659 | `_components/today/TodayAgenda.tsx` + `AgendaCard.tsx` |
| `MobileExpiringPrograms` | 2707 | `_components/expiring/ExpiringPrograms.tsx` |
| `MobileActivityFeed` | 2768 | `_components/activity/ActivityFeed.tsx` |
| `MobileNovedades` | 2841 | `_components/NewsFeed.tsx` |
| `MobileDashboardCharts` | 3012 | (charts) |
| `MobileRevenueSheet` | 3161 | `_components/sheets/RevenueSheet.tsx` |
| `MobileClientStatsSheet` | 3269 | `_components/sheets/ClientStatsSheet.tsx` |

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/CoachDashboardSections.tsx` (UNICO; 4405 L). **Esta unidad es la unica dueña de este archivo** — todas las demas unidades lo tratan read-only.

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/WorkspaceSwitcherSheet.tsx` (importado L87, montado L1833) → posee `chrome-workspace-switcher`.
- `apps/mobile/app/coach/(tabs)/home.tsx` → posee `dashboard-shell` (monta estos widgets).

## P0 / riesgos conocidos (del audit R5 `docs/audits/rn-parity-qa/r5-audit-coach-core.md` §1)
Prioridad por impacto visual (el fixer ataca EST primero):
1. **§1.1 GreetingHeader (EST):** falta saludo por hora (`Buenos dias/tardes/noches` via useTimeOfDayGreeting), falta firstName coloreado `text-sport-500`, falta linea "Tienes N pendiente(s) hoy." RN hardcodea `Hola, {firstName}` (L1793) + fila de botones. Size 28 vs 31; fecha sin uppercase/tracking.
2. **§1.3 FocusList/PriorityCard NextStepInset (EST):** reconstruir icono por tono en circulo `bg-white/8` + eyebrow "Tu proximo paso" tono + CTA tono+flecha + radius 10; RN usa Sparkles pelado + descripcion extra + ring="sport" inexistente (L2413,2441-2459). Weights 700→800 en eyebrow/badge.
3. **§1.5 Novedades (EST):** colores de tono de actividad **INVERTIDOS** vs web (nuevo alumno debe ser AZUL sport-600, check-in VERDE success-600; RN los tiene al reves, L2724-2728); workout usa brand en vez de ember; icono check-in Camera vs CheckCircle; layout 2 lineas (ListRow) vs 1 linea web.
4. **§1.4 TodayAgenda (EST):** web usa EMOJI (⏳/📷/💪) en circulo neutro 32px; RN usa lucide brand en squircle 28px (L2652-2663). Titulo 18/900 vs 17/800.
5. **§1.2 PulseHero (PX):** familia del numero (`.eva-metric` web vs display-black RN); delta colors success-600/danger-600 vs `#10B981`/`#F4365A`.
6. **§1.6 BillingBanners (PX, pendiente R5.1):** RN tonos hardcode `#F43F5E`/`#F59E0B` (L137+) → confirmar contra tokens danger/warning del banner web.

### Sheets — bomba -999 (gotcha 6a)
- `MobileRevenueSheet` (L3161) y `MobileClientStatsSheet` (L3269): **verificar el mecanismo de sheet**. Si usan `@gorhom/bottom-sheet` con `snapPoints` fijos y sin `dynamicSizing`, o el wrapper `components/Sheet.tsx` con snapPoints fijos → riesgo `containerHeight -999` en el primer present. ClientStatsSheet es CRITICO para el flujo (el coach lo abre desde home.tsx `statsOpen`) → si falla, migrar a `nativeModal` de `components/Sheet.tsx` (patron ronda 7). Anotar riesgo si se decide no migrar.

### Congelamiento (gotcha 6b)
- `CoachNewsBell` (L1985) y `MobileNovedades` (L2841): si tienen fetch propio de novedades (no reciben todo por props del shell), aplican riesgo de congelamiento → `useFocusEffect`. Verificar: la mayoria recibe `data` de home.tsx (sin fetch propio) = OK; confirmar por export.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"PulseHero"` (7 hits, L~6711), `"PriorityCard"` (3 hits, L~6725), `"Agenda"` (2), `"NewsFeed"` (1), `"CoachGlobalSearch"` NO (es del chrome). `"GreetingHeader"`/`"FocusList"`/`"KpiStrip"` = 0 hits (no en ola0; usar R5 audit §1).

## Notas de datos (queries/RPC, claves de dia)
- Todos los widgets reciben `data: MobileDashboardData` como props desde home.tsx (fetch en el shell). Sin queries propias salvo (verificar) CoachNewsBell/Novedades.
- **Claves de dia (gotcha 6d):** greeting-por-hora y agenda "hoy" via `getSantiagoIsoYmdForUtcInstant`. useTimeOfDayGreeting web deriva greeting de la hora local — en RN debe usar la hora Santiago consistente.
- Copy VERBATIM neutro (ya latino): "Buenos dias/tardes/noches", "Tienes N pendiente(s) hoy.", "Todo al dia. Buen momento para planificar.".
