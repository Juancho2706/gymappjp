# G10 — Módulos de pago: cardio + movement + bodycomp + nutrición Pro (exchanges)

Dominio: superficie completa de módulos de pago en web (coach + vista alumno read-only) y la capa de entitlements que los gatea. Meta: paridad 1:1 visual+funcional de `apps/mobile` con `apps/web` (fuente de verdad = comportamiento responsive/móvil de la web EVA DS).

Fecha: 2026-07-08. Solo lectura. Rutas archivo:línea reales verificadas.

---

## 0. Estado de partida (hallazgo central)

**Mobile NO tiene NADA de estos módulos, salvo nutrición base del alumno.** Confirmado por research 06/07 + spot-checks:

- `grep -riln "MODULE_KEYS|enabled_modules" apps/mobile` → **0 resultados**. Mobile no tiene capa de entitlements, ni lee `coaches.enabled_modules`/`teams.enabled_modules`, ni aplica el kill-switch de operador.
- `find apps/mobile -iname "*cardio*" -o "*bodycomp*" -o "*movement*"` → **0 resultados**. Cero pantallas de cardio, composición corporal y evaluación de movimiento (ni coach ni alumno).
- Mobile NO importa `@eva/module-catalog`, `@eva/feature-prefs`, `@eva/nutrition-engine`, `@eva/calc` (tsconfig de mobile solo declara paths para `@eva/schemas`, `@eva/brand-kit`, `@eva/tiers` — research 06 líneas 420-425).
- Nutrición del alumno (`app/alumno/(tabs)/nutricion.tsx`, 563 L, patrón mixto A+B) existe pero **NO consume intercambios (exchanges / nutrición Pro)** — los endpoints `/api/mobile/nutrition/exchanges/*` existen en web pero mobile no los invoca.

**Buena noticia para el arquitecto:** el backend mobile-api de estos módulos YA ESTÁ CONSTRUIDO y con gate de dinero server-side. Existen y gatean con `assertModule`:
- `apps/web/src/app/api/mobile/cardio/profile/route.ts`
- `apps/web/src/app/api/mobile/bodycomp/{bia,isak,[id]}/route.ts`
- `apps/web/src/app/api/mobile/movement/{assessment,draft,finalize,item}/route.ts` (+ `_lib.ts`)
- `apps/web/src/app/api/mobile/nutrition/exchanges/{meal-variant,set-mode,targets,variants}/route.ts` (+ `_shared.ts`)
- `apps/web/src/app/api/mobile/config/route.ts` (kill-switch + prefs flag + support — research 01 §6)

Verificado en `cardio/profile/route.ts:47-55`: gate de dinero con `assertModule(userClient, 'cardio', { coachId, teamId: null })` → 403 `MODULE_OFF`. El comentario del propio archivo (líneas 15-22) explica la razón: la RLS de `clients` NO chequea `enabled_modules`, así que sin este gate un coach sin el módulo podría escribir por PostgREST directo (evasión de cobro). **Conclusión de seguridad: mobile DEBE consumir estos endpoints `/api/mobile/*` para toda MUTACIÓN de módulo, nunca PostgREST directo.** Las lecturas read-only del alumno pueden ir por PostgREST (RLS self-select), pero verificar que la RLS también gatee por módulo (ver Riesgos).

Por tanto el trabajo de este dominio es **~90% construcción desde cero** (no re-skin), más el cableado del cliente RN a endpoints que ya existen.

---

## 1. Gaps visuales (pantalla por pantalla)

Como mobile no tiene estas pantallas, "gap visual" = qué hay que construir replicando la variante MÓVIL de la web EVA DS. Referencia de tokens/patrones en research 05 (líneas 6-13): badge "Módulo" (`rounded-pill bg-sport-100 text-sport-700`), `SegmentedControl`, cards `rounded-card`, `eva-mono`/`font-mono` tabular para métricas, `font-display` para títulos, header con tile de icono en `bg-sport-100`.

### V1. Cardio hub — NO EXISTE en mobile
Web: `apps/web/src/app/coach/cardio/page.tsx` + `_components/CardioToolsClient.tsx` (369 L). Header icono `HeartPulse` en tile sport + badge "Módulo" + subtítulo "Herramientas". `SegmentedControl` de 3 tools: Zonas / Pace / Plantillas.
- **Zonas** (`CardioToolsClient.tsx:83+`): selector de alumno (o "Cálculo manual"), inputs edad/FC reposo, resultado FC máx grande + filas Z1-Z5 (`ZoneRow`, cuadro de color por zona + nombre + rango bpm mono). Meta de color por zona en `CardioToolsClient.tsx:30-36` (`--aqua-500`→`--danger-500`).
- **Pace**: inputs pace + distancia, grid de resultados (tiempo total, km/h, pace/milla, pace/km).
- **Plantillas**: cards de `INTERVAL_TEMPLATES` con badge de zona sugerida (tono por zona `CardioToolsClient.tsx:39-45`).
Mobile debe transcribir el `SegmentedControl` a `SegmentedTabs` (ya existe en mobile) y las filas de zona con el token de color.

### V2. Perfil cardio del alumno (coach) — NO EXISTE
Web: `cardio/[clientId]/page.tsx` (109) + `CardioProfileForm.tsx` (135). Header back, "Perfil cardio" + nombre, form (fecha nac, FC reposo, FCmax medida opcional, ref 5K seg; `h-12 rounded-control`), sección "Zonas resultantes".

### V3. Movement hub — NO EXISTE
Web: `movement/page.tsx` + `_components/MovementHubList.tsx` (104). Título i18n + badge "Módulo". Lista de alumnos: avatar, nombre, último semáforo (`PriorityBadge` banda + score `/21` + fecha) o "sin evaluación", badge "borrador pendiente", CTA ver reporte + botón "Evaluar"/"Retomar". `MovementDisclaimer` al pie. Usa i18n (`assessment.*`) — **único módulo con i18n; el resto es español hardcodeado** (research 05 línea 252).

### V4. Movement wizard de captura — NO EXISTE (pieza más grande visualmente)
Web: `MovementWizard.tsx` (602). Tablet-first, header sticky "Paso N de 7" + barra de progreso segmentada. Por patrón: `ScoreSegmented` (0-3 con color semáforo danger→success), por lado izq/der, `ToggleRow` dolor/clearing (fuerzan score 0), textarea. Paso Revisión: preview de banda/composite (card inverse, recalculado server), consentimiento (team: badge; standalone: checkbox). Footer fijo con parcial `/21`.

### V5. Movement reporte + evolución (coach) — NO EXISTE
Web: `ClientMovementReport.tsx` (144), `MovementPrintReport.tsx` (156). `AssessmentReportCard`, `EvolutionCharts` (recharts, si ≥2 finales), historial con `DeleteAssessmentButton`. Componentes compartidos en `components/movement/`.

### V6. Body composition (coach) — NO EXISTE (pieza más densa en datos)
Web: `clients/[clientId]/bodycomp/page.tsx` + `_components/BodyCompositionTabB6b.tsx` (108). Header back + "Composición corporal · Módulo · captura" + badge. `SegmentedControl` método BIA (rol Entrenador) / ISAK (rol Nutri). Toggle "Nueva medición".
- **BIA** (`BiaCaptureForm.tsx`, 192): react-hook-form+Zod, ~11 métricas (masa muscular, %grasa, aguas, grasa visceral, metabolismo basal, ángulo de fase), sin cálculo (persiste tal cual). Badge "Entrenador".
- **ISAK** (`IsakCaptureForm.tsx`, 299): wizard 4 pasos (pliegues→perímetros→diámetros→revisión), stepper con pills, ~22 medidas, selector de ecuación %grasa (Durnin-Womersley/Yuhasz/Faulkner) + preview vivo `IsakResultCard.tsx` (103): 5 componentes Kerr, validez interna, somatotipo. Badge "Nutri".
- **Trend panels** (`BiaTrendPanel.tsx` 187, `IsakTrendPanel.tsx` 211): tiles con deltas + LineChart recharts (series pills) + lista de mediciones + eliminar.

### V7. Vistas ALUMNO read-only — NO EXISTEN
Web: `c/[coach_slug]/bodycomp/page.tsx` + `components/bodycomp/StudentBodyCompositionView.tsx` (176) — gate por módulo con contexto del propio alumno (OFF → notFound), switcher de método, `StudentBiaSummary`/`StudentIsakSummary` + trends, `framer-motion` (fadeSlideLeft, count-up, gated por reduced-motion), disclaimer. Sirve también vía `/t/[team_slug]/bodycomp`.
Web: `c/[coach_slug]/movimiento/page.tsx` + `components/movement/StudentMovementView.tsx` — solo evaluaciones FINALES, gate por módulo. Comparte `AssessmentReportCard`/`EvolutionCharts`/`PriorityBadge`.
**Cardio alumno NO tiene pantalla dedicada** — las zonas se muestran embebidas en el ejecutor de rutina (ej. "Z4 · 150-165 bpm"); eso es dominio del ejecutor (G de alumno), fuera de este scope salvo el cálculo compartido.

### V8. Nutrición Pro / intercambios en el builder — PARCIAL (sí existe nutrición base)
Web builder: `PlanBuilder.tsx` (897) + `_components/PlanBuilder/`. El módulo `nutrition_exchanges` (Porciones) aparece **solo en mode client-plan + módulo ON + sección `micros_advanced` visible**: `ExchangeModePanel` (toggle gramos↔porciones, variantes de día, totales, PDF equivalencias) + `ExchangeTargetsEditor` por comida (grupos de intercambio, porciones, notas, autosave debounce 700 ms) — research 05 línea 53.
Mobile tiene `coach/nutrition-builder.tsx` (504, patrón B legacy) y `alumno/(tabs)/nutricion.tsx` (563, mixto) pero **ninguno expone modo intercambios/porciones**. Este es re-skin (nutrición base) + build (capa exchanges).

### V9. Catálogo de Módulos + CTA (settings) — NO EXISTE como pantalla dedicada
Web: `settings/modules/page.tsx` + `_components/ModulesForm.tsx` (262). Catálogo READ-ONLY (compra-only, sin switches): 4 cards con icono tonal, badge Activo/De pago, pitch, chips de alcance, precio `/mes`, CTA por contexto (`ModuleCta`). Copy desde `@eva/module-catalog`. Mobile `settings.tsx` (554, patrón B) no lo tiene.

### V10. ModuleOffNotice — NO EXISTE en mobile
Web: `components/coach/ModuleOffNotice.tsx`. Aviso amable "módulo apagado → catálogo" que renderiza cada page de módulo cuando `status === 'module_off'` (ej. `cardio/page.tsx:19-21`). Mobile necesita un equivalente RN reutilizable.

---

## 2. Gaps funcionales

### F1. Capa de entitlements COMPLETA — ausente (PREREQUISITO, bloqueante)
Mobile no tiene `MODULE_KEYS`, no lee `enabled_modules`, no aplica kill-switch (`EVA_DISABLED_MODULES`). Web: `apps/web/src/services/entitlements.service.ts` (93 L) — `MODULE_KEYS` (`cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`), `hasModule`, `assertModule`, `isModuleKilledByOperator`, `applyOperatorKillSwitch`.
- **Extraíble a paquete puro:** `MODULE_KEYS`/`ModuleKey`/`EnabledModules`/`isModuleKilledByOperator`/`applyOperatorKillSwitch` (constantes + kill-switch, sin IO). `@eva/feature-prefs` YA declara un `ModuleKey` espejo (research 07 A.3) — reusar o consolidar ahí.
- **NO extraíble:** `hasModule`/`assertModule` dependen de `SupabaseClient` (leen `teams`/`coaches`). El gate real de mutación vive en los endpoints `/api/mobile/*` (ya construidos). Mobile solo necesita: (a) leer `enabled_modules` por PostgREST para mostrar/ocultar UI, (b) aplicar kill-switch leyendo `/api/mobile/config`, (c) consumir los endpoints (que re-gatean server-side).
- **Regla de resolución (LOCKED, entitlements.service.ts:8-17):** contexto team → `teams.enabled_modules` (pool gana, no unión); standalone → `coaches.enabled_modules`. Mobile standalone v1 → `teamId null` (el mobile aún no opera workspaces de pool — comentario en `cardio/profile/route.ts:47`). Mobile debe replicar esta bifurcación cuando soporte pool.

### F2. Modelo Funciones vs Módulos — ausente
`visible = ENTITLED (billing) AND ENABLED (preferencia)` (research 05 línea 128, 250). Web tiene `FeaturePrefsPanel` (escribe solo la capa ENABLED) + presets Básico/Intermedio/Profesional. Mobile no tiene NADA de esto (`@eva/feature-prefs` sin usar). Afecta a `nutrition_exchanges` (sección `micros_advanced`) que solo se ve si ENTITLED AND ENABLED. Sin esto, el modo porciones no puede gatearse correctamente en mobile.

### F3. Cardio — cálculo + persistencia
- Cálculo: `domain/cardio/zones.ts` (Tanaka, Karvonen, %FCmax, `resolveClientZones`) + `pace.ts` (`kmhFromPace`, `paceKmToMile`, etc.) + `INTERVAL_TEMPLATES` (`lib/workout-interval`). Todo puro y con tests.
- Persistencia perfil: `POST /api/mobile/cardio/profile` (existe, gatea `cardio`). Escribe `clients.{birth_date,resting_hr,max_hr_override,ref_5k_time_sec}`. Schema `CardioProfileUpdateSchema` en `@eva/schemas`.
- Zonas del alumno en ejecutor: `hrRangeForZone` (zones.ts:150) — se usa en bloques cardio del workout; coordinar con dominio del ejecutor para no duplicar.

### F4. Movement assessment — flujo completo
- Cálculo: `@eva/calc` (`MOVEMENT_PATTERNS_V1`, 7 patrones + semáforo). Puro, con tests, **sin consumidor mobile hoy**.
- Servicio web: `@/services/assessment/movement-assessment.service` (scope 3-vías + assertModule + bitácora `view` en pool team).
- Endpoints mobile (existen): `movement/{assessment,draft,finalize,item}`. El wizard usa autosave por paso (`upsertDraftItemAction` → `movement/draft` o `movement/item`), retoma borrador cross-device, finaliza con `finalize`. Recálculo de banda/composite SIEMPRE server-side.
- Schema: `@eva/schemas/screening.ts` (marcado "SERVER-ONLY" en el index — research 07 A.6; revisar si es realmente server-only o portable, es estructuralmente Zod puro).
- i18n: usa `assessment.*` — mobile necesita cargar esas claves (verificar sistema i18n de mobile).

### F5. Body composition — captura + tendencias
- Cálculo ISAK: `domain/bodycomp` (`computeIsak`, `anthropometry.ts`, `bodyfat.ts`, `somatotype.ts`, `phantom.ts`) — 12 archivos, el domain más grande, puro, con tests. BIA no calcula (persiste tal cual).
- Schema: `@eva/schemas/bodycomp.ts` (`BodyCompositionCreateSchema`; marcado "SERVER-ONLY", revisar portabilidad).
- Endpoints mobile (existen): `bodycomp/{bia,isak,[id]}`. Repo web: `@/infrastructure/db/body-composition.repository`.
- Datos NUNCA se mezclan entre métodos (series filtradas por método — research 05 línea 212). Regla a preservar en mobile.
- Selector de ecuación de %grasa (Durnin-Womersley/Yuhasz/Faulkner) con preview vivo usando las MISMAS funciones puras que el server.

### F6. Nutrición Pro (exchanges) — modo porciones
- Endpoints mobile (existen): `nutrition/exchanges/{meal-variant,set-mode,targets,variants}` + `_shared.ts`. Mobile NO los consume.
- Schema: `@eva/schemas/nutrition-exchanges.ts` (marcado "SERVER-ONLY").
- Web: toggle gramos↔porciones, variantes de día, totales por variante, autosave 700 ms, PDF de equivalencias (`downloadNutritionExchangePdf`). Gate: `resolveNutritionDomainEnabled` + `getHasExchangesModule` + sección `micros_advanced` visible + mode client-plan.
- Vista alumno: el alumno debe ver su plan en porciones si el coach lo activó — hoy `alumno/(tabs)/nutricion.tsx` solo muestra gramos.

### F7. DRIFT confirmado de cálculo nutricional (macro-calculator) — riesgo money/confianza
Research 07 C.1: `apps/mobile/lib/macro-calculator.ts` (51 L) es un port de una versión ANTIGUA del cálculo web, con fórmulas DIVERGENTES de `@eva/nutrition-engine/tdee.ts` (la fuente de verdad actual):
- Mobile usa delta absoluto de kcal (`cut -400/bulk +300`) vs multiplicador `0.85/1/1.1` del paquete.
- `proteinMultiplier` bulk 2.0 vs paquete `gain 1.6`.
- `fats = weightKg * 0.9` (g/kg fijo) vs `GOAL_FAT_KCAL_FRACTION` (% calorías).
→ **Para el mismo alumno, mobile y web devuelven macros objetivo DISTINTOS.** No es estrictamente "módulo de pago" pero toca la superficie de nutrición Pro y debe corregirse en la misma ola. Fix: borrar `macro-calculator.ts`, consumir `@eva/nutrition-engine`.

### F8. Nutrición: `lib/nutrition-utils.ts` mobile = copia manual de 235 L
Research 07 C.2: reimplementa `@eva/nutrition-engine/macros.ts` a mano, omite `household_grams`/`household_label` (porciones caseras) — justo lo relevante para exchanges. Fix: `export * from '@eva/nutrition-engine'`.

### F9. BUG conocido web a NO heredar — empty-state con 0 alumnos
Memoria `project_module_pages_crash_no_clients`: `/coach/cardio` y `/coach/movement` crashean ("Oops") con módulo ON y 0 alumnos (falta empty-state). Verificado que `cardio/page.tsx` pasa `data.clients` a `CardioToolsClient` sin guard de lista vacía. **Mobile debe construir el empty-state desde el inicio** (ej. "Aún no tienes alumnos — agrega uno para usar este módulo"), no replicar el crash. Aplica a cardio hub, movement hub (listas de alumnos) y potencialmente bodycomp si se navega sin alumno.

### F10. Config remota / kill-switch — sin cablear
`/api/mobile/config` (research 01 §6, `6c273f32`) expone kill-switch + prefs flag + support. Mobile no lo consume. Necesario para que `EVA_DISABLED_MODULES` apague módulos en la app sin redeploy del cliente.

---

## 3. Costuras (packages/ vs API) — cita research 07

| Lógica | Cómo compartir | Estado | Ref |
|---|---|---|---|
| `MODULE_KEYS`/`ModuleKey`/kill-switch | Paquete puro — reusar `@eva/feature-prefs` (ya tiene espejo) o extraer de `entitlements.service` | Espejo existe, mobile no lo usa | 07 C.4 / A.3 |
| `hasModule`/`assertModule` (gate mutación) | NO extraer — vive en endpoints `/api/mobile/*` (ya construidos, gatean server-side) | Endpoints listos | 07 C.4 |
| `domain/cardio` (zones, pace) | Extraer a `packages/@eva/cardio` (puro, con tests). Replicar patrón `@eva/nutrition-engine` | Puro, listo, sin consumidor mobile | 07 C.7 |
| `domain/bodycomp` (computeIsak, somatotype...) | Extraer a `packages/@eva/bodycomp` (12 archivos, puro) | Puro, listo, sin consumidor mobile | 07 C.7 |
| Movement 7 patrones | `@eva/calc` ya existe y es puro; mobile debe importarlo | Listo, sin consumidor mobile | 07 A.2 |
| Cálculo macros (tdee) | `@eva/nutrition-engine`; borrar `mobile/lib/macro-calculator.ts` | DRIFT confirmado | 07 C.1 |
| Macros por ítem/comida | `@eva/nutrition-engine/macros.ts`; borrar copia `mobile/lib/nutrition-utils.ts` | Duplicado confirmado | 07 C.2 |
| Copy comercial de módulos | `@eva/module-catalog` (label/pitch/surfaces/priceClp); mobile debe importarlo | Sin consumidor mobile | 07 A.4 |
| Modelo Funciones vs Módulos | `@eva/feature-prefs` (resolver `visible = ENTITLED AND ENABLED`, presets) | Sin consumidor mobile | 07 A.3 |
| Schemas bodycomp/screening/exchanges | `@eva/schemas` — marcados "SERVER-ONLY" en el index; **revisar si la etiqueta sigue válida** (son Zod estructuralmente puro) | Etiqueta a revisar | 07 A.6 |

**Orden de extracción (bloqueante):** primero extraer `domain/cardio` y `domain/bodycomp` a packages y adoptar `@eva/calc`/`@eva/feature-prefs`/`@eva/module-catalog`; recién después construir UI RN. No portar cálculo a mano (repetiría el drift de F7/F8).

---

## 4. Tareas propuestas (ordenadas, atómicas)

### OLA 0 — Costuras / prerequisitos (bloqueante, antes de cualquier UI)
- **T1 [SEAM] S** — Extraer `apps/web/src/domain/cardio/*` a `packages/@eva/cardio` (mover, actualizar imports web, mantener tests). Patrón `@eva/nutrition-engine`. Sin dependientes mobile aún → bajo riesgo. Dep: —
- **T2 [SEAM] M** — Extraer `apps/web/src/domain/bodycomp/*` (12 archivos) a `packages/@eva/bodycomp`. Actualizar imports web + repo. Dep: —
- **T3 [SEAM] S** — Añadir paths tsconfig mobile + declarar deps para `@eva/calc`, `@eva/module-catalog`, `@eva/feature-prefs`, `@eva/nutrition-engine`, y los nuevos `@eva/cardio`/`@eva/bodycomp`. Verificar Metro/monorepo resuelve. Dep: T1, T2
- **T4 [FUNCIONAL] M** — Capa de entitlements mobile: helper que lea `coaches.enabled_modules` (PostgREST, con fallback db-compat), aplique kill-switch desde `/api/mobile/config`, y exponga `hasModuleClient(key)` para show/hide UI. Reusar `ModuleKey` de `@eva/feature-prefs`. Dep: T3
- **T5 [FUNCIONAL] S** — Cablear `/api/mobile/config` (kill-switch + prefs flag + support) en `lib/api.ts` + cache. Dep: T3
- **T6 [SEAM] S** — Borrar `mobile/lib/macro-calculator.ts` y `mobile/lib/nutrition-utils.ts`; reemplazar por `@eva/nutrition-engine`. Verificar consumidores (`nutrition-builder.tsx`, `nutricion.tsx`). Corrige drift F7/F8. Dep: T3

### OLA 1 — Re-skin visual de lo que YA existe (nutrición base)
- **T7 [VISUAL] M** — Re-skin `alumno/(tabs)/nutricion.tsx` (563, mixto A+B) a patrón A puro (matar objeto `theme` legacy, tokens DS). Dep: —
- **T8 [VISUAL] M** — Re-skin `coach/(tabs)/nutricion.tsx` (491, patrón B) + `coach/nutrition-builder.tsx` (504) + `coach/foods.tsx` (274) a patrón A. Dep: —
- **T9 [VISUAL] S** — Componente RN `ModuleOffNotice` reutilizable (aviso módulo apagado → catálogo). Dep: T4

### OLA 2 — Módulos gated NUEVOS (funcional, requiere Ola 0)
- **T10 [FUNCIONAL] L** — Cardio: hub (SegmentedTabs Zonas/Pace/Plantillas) + perfil del alumno. Consumir `@eva/cardio` para cálculo y `POST /api/mobile/cardio/profile` para persistencia. **Incluir empty-state con 0 alumnos (F9).** Dep: T1, T3, T4, T9
- **T11 [FUNCIONAL] XL** — Movement assessment completo: hub (lista + PriorityBadge), wizard 7 pasos con autosave (`movement/draft`+`item`), reporte + EvolutionCharts, vista alumno read-only (`/movimiento`). Consumir `@eva/calc`. i18n `assessment.*`. Empty-state 0 alumnos. Dep: T3, T4, T9
- **T12 [FUNCIONAL] XL** — Body composition: shell BIA/ISAK, `BiaCaptureForm`, `IsakCaptureForm` (wizard 4 pasos), `IsakResultCard` preview vivo, trend panels (LineChart), vista alumno read-only (`/bodycomp`). Consumir `@eva/bodycomp` + endpoints `bodycomp/*`. Series NUNCA se mezclan por método. Dep: T2, T3, T4, T9
- **T13 [FUNCIONAL] M** — Catálogo de Módulos en settings mobile: cards read-only desde `@eva/module-catalog`, badges de estado, CTA por contexto (mailto / web). Captura evento `module_interest_cta_clicked`. Dep: T3, T4

### OLA 3 — Nutrición Pro (exchanges) + Funciones
- **T14 [FUNCIONAL] M** — Modelo Funciones vs Módulos: adoptar `@eva/feature-prefs`, panel de preferencias por sección (presets), resolver `visible = ENTITLED AND ENABLED`. Dep: T4
- **T15 [FUNCIONAL] L** — Nutrición Pro (exchanges) en el builder coach: modo gramos↔porciones, variantes de día, targets por comida (autosave), consumir `nutrition/exchanges/*`. Gate por T14 + módulo. PDF equivalencias (expo-print). Dep: T8, T14
- **T16 [FUNCIONAL] M** — Vista alumno de nutrición en porciones (si el coach activó exchanges). Dep: T7, T15

---

## 5. Riesgos

1. **Seguridad / evasión de cobro (crítico):** si mobile escribe `clients`/tablas de módulo por PostgREST directo en vez de los endpoints `/api/mobile/*`, se salta el gate `assertModule` (la RLS de `clients` NO chequea `enabled_modules` — ver `cardio/profile/route.ts:15-22`). REGLA: toda MUTACIÓN de módulo va por endpoint. Para LECTURAS read-only del alumno (bodycomp/movement) verificar que exista RLS que gatee por módulo, o servirlas también por endpoint; de lo contrario un alumno cuyo coach apagó el módulo podría leer datos vía PostgREST.
2. **Drift de cálculo (confirmado):** `macro-calculator.ts` y `nutrition-utils.ts` mobile ya divergen de los packages (F7/F8). Cualquier pantalla nueva que no importe los packages perpetúa el drift. Mitigación: Ola 0 antes de UI.
3. **Schemas marcados "SERVER-ONLY":** `bodycomp`, `screening`, `nutrition-exchanges` en `@eva/schemas/index.ts` están etiquetados server-only. Hay que confirmar si es una restricción real (referencian `org_id`/`coach_id`) o solo conservadora; si son Zod puro, mobile los necesita para validar client-side. No asumir; leer los 3 archivos antes de portar.
4. **Bug de empty-state heredable:** si se transcribe la web tal cual, mobile hereda el crash con 0 alumnos (F9). Construir empty-state desde el inicio.
5. **Pool/team no soportado en mobile:** el gate usa `teamId null` (standalone v1). Cuando mobile soporte workspaces de pool, la resolución de entitlements cambia (pool gana) y hay que revisar TODOS los endpoints y lecturas. Riesgo de que un coach de pool vea/no vea el módulo incorrecto.
6. **i18n movement:** movement es el único módulo con `useTranslation`/`assessment.*`. Verificar que el sistema i18n de mobile tenga esas claves; si no, hay trabajo extra de traducción no contemplado en el resto de módulos (español hardcodeado).
7. **New Architecture / charts:** los trend panels usan recharts en web; mobile tiene victory-native/Skia. Transcribir gráficos no es 1:1 — riesgo de esfuerzo subestimado en T11/T12.
8. **Coordinación con dominio ejecutor:** las zonas cardio del alumno viven en el ejecutor de rutina (otro dominio). `hrRangeForZone` debe compartirse vía `@eva/cardio`, no duplicarse. Riesgo de doble implementación si las olas no se coordinan.
