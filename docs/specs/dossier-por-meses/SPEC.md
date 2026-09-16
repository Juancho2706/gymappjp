---
status: active
owner: product-engineering
last_verified: "2026-09-16"
canonical: false
---

# SPEC — Dossier por meses

> El «dossier del alumno» deja de ser solo una foto de HOY: el coach elige uno o varios meses con chips y exporta un informe mensual por mes, con el mismo PDF oscuro de siempre.
>
> Origen: pedido del coach **Joaco** (JB fitness coach, `coaches.slug = joaquinamr7`), que exporta el dossier y pidió «la misma vista pero por mes» (jul/ago/sep) para mandarle el progreso a su alumno. Decisiones del owner: **Q1–Q4 = a** (§3). Arquitectura y resoluciones del jefe: **R1–R26** (§4), que **mandan sobre el brief** donde choquen.
>
> Un solo tren: **W0 migra → W1 modelo → W2 web ‖ W3 RN → W4 cierre**. Plan de ejecución en [PLAN.md](PLAN.md); tareas en [TASKS.md](TASKS.md); contrato jsonb ejecutable, SQL de validación, casos de prueba y rollback en [DATA-TESTING.md](DATA-TESTING.md).

Cada regla de comportamiento está numerada **DM-nn** y redactada como criterio verificable: si no se puede probar con un test o con un paso de QA, no es una regla de este SPEC.

Las rutas `archivo:línea` de este documento están verificadas contra el worktree `dossier-por-meses` (rama `worktree-dossier-por-meses`, HEAD `96800255`). **El implementador ancla por identificador** (nombre de función, constante, prop), nunca por número de línea.

---

## 1. Problema (con evidencia)

### P1 · El dossier de hoy no acepta ningún rango

`buildClientDossier` (`apps/web/src/services/client/client-dossier.ts:268`) arma un modelo que es una **foto del instante**, y cada sección lo declara en su propio tipo (`:51-128`):

| Sección | Qué mide hoy | Dónde |
|---|---|---|
| Adherencia | `workoutsThisWeek / workoutsTarget` de **esta semana** | `client-dossier.ts:382-384` |
| Racha | `compliance.currentStreak` a hoy | `client-dossier.ts:394` |
| Volumen por grupo | `get_client_muscle_volume(p_client_id, 30)` = **últimos 30 días desde ahora** | `supabase/migrations/20260903212800_muscle_volume_side_metadata.sql:66` |
| Récords | `get_client_exercise_prs(p_client_id)` = **all-time**, sin ventana | `supabase/migrations/20260910205101_get_client_exercise_prs_reps_filter.sql:38-45` |
| Check-ins | últimos **30**, sin corte de período | `client-dossier.ts:241`, `:432` |
| Nutrición | señal V2 de **hoy** + semana en curso | `client-dossier.ts:354-379` |

Ninguna de las seis acepta un `from`/`to`. No hay «mes» en ninguna capa: ni en el modelo, ni en la server action (`apps/web/src/app/coach/clients/[clientId]/_actions/client-detail.actions.ts:47-67`), ni en los dos generadores de PDF.

### P2 · El botón es un disparo único, sin diálogo

Web: el icon-button del hero llama directo a `getClientDossier(clientId)` y a `downloadClientDossierPdf(dossier)` (`apps/web/src/app/coach/clients/[clientId]/ClientProfileHero.tsx:217-229`). No hay diálogo, no hay opciones, y el error se pinta en un texto suelto del hero (`:215`, `:225`).

RN: `handleExportPdf` (`apps/mobile/app/coach/cliente/[clientId].tsx:678-696`) llama a `exportClientDossierPdf(clientId, data, scalars)` y abre el share sheet. Mismo disparo único; el error sale por `Alert.alert` (`:692`).

### P3 · Dos generadores independientes que hoy ya divergen

- Web: jsPDF con dibujo manual, `downloadClientDossierPdf(dossier: ClientDossierData)` (`apps/web/src/lib/pdf/client-dossier-pdf.ts:66`), grid de 6 KPI armado **dentro** de la función (`:193-266`) y `doc.save()` con un solo stem (`:662-663`).
- RN: HTML + `expo-print`, `exportClientDossierPdf(clientId, data, scalars)` (`apps/mobile/lib/client-dossier-pdf.ts:180`), tiles armados con `kpiCard(...)` (`:176`) desde `CoachClientDetailData`, no desde el modelo puro (el propio archivo lo documenta en `:8-12`).

Resultado medible hoy: el tile de nutrición del dossier web usa la señal **V2** (`client-dossier.ts:419-422`) y el de RN usa `data.nutritionMonthlyAvgPct`, que es **V1** (`apps/mobile/lib/coach-client-detail.ts:1157`). El mismo alumno da dos números distintos según desde dónde se exporte.

### P4 · `workout_sessions` no sirve como contador de sesiones

La ficha web ya usa como fallback «días distintos con `workout_logs`» porque `workout_sessions` suele estar vacía. El informe mensual **no** consulta `workout_sessions`: cuenta días locales distintos con series registradas (§8.3, DM-22).

---

## 2. Objetivo y criterio de salida

Que el coach abra «Exportar PDF» en la ficha de su alumno, elija «Por meses», toque los chips **jul · ago · sep** y reciba **el mismo dossier oscuro** tres veces, cada uno recortado a su mes, con los seis cuadros contestando preguntas del mes y no de hoy.

**Criterio de salida del tren (verificable en QA, §17):**

- **DM-01** En la ficha de un alumno de Joaco, «Por meses» + jul/ago/sep + «Un solo PDF» produce **un** archivo `dossier-<slug>-2026-07_2026-09.pdf` con **3 informes** y numeración de página global.
- **DM-02** El mismo caso con «Un solo PDF» apagado produce **un zip** `dossier-<slug>-2026-07_2026-09.zip` con 3 PDF adentro. **Nunca** N descargas sueltas.
- **DM-03** En RN, el mismo alumno y los mismos tres meses producen **un** PDF que se abre en el share sheet nativo, con los **mismos seis valores** que la web para cada mes.
- **DM-04** «Estado actual» sigue produciendo byte-por-byte el mismo dossier que hoy: mismo nombre de archivo, mismos rótulos, mismos tiles (test de identidad sobre `buildClientDossier`, DATA-TESTING §5.1).

---

## 3. Decisiones del owner (cerradas, no se reabren)

| # | Decisión | Consecuencia en este SPEC |
|---|---|---|
| **Q1 = a** | En RN v1 **solo «un PDF junto»**. «Separado» (un archivo por mes) existe **solo en web**. | §7: el sheet RN **no** lleva interruptor junto/separado (R21). |
| **Q2 = a** | En modo mes **los 6 cuadros cambian de pregunta**. | §8.2, los seis tiles nuevos con rótulo con período (R14). |
| **Q3 = a** | **Selección libre** de meses con chips: uno o varios, seguidos o no. | §6 y §7: chips multiselección, sin rango contiguo forzado. |
| **Q4 = a** | Interruptor **«Incluir fotos de check-in»**, **encendido por defecto**. | §6, §7 y §13. |
| — | **Mismo estilo del PDF**: paleta, tipografía, secciones, orden. **NO rediseñar.** | §8: el informe mensual reusa el layout existente; los únicos cambios son rótulos y contenido. |
| — | **Va en todos los planes, sin gate por tier.** | No hay lectura de `subscription_tier` ni de `enabled_modules` en ninguna capa de este tren. |

---

## 4. Resoluciones del jefe (R1–R26)

Salieron de dos refutaciones adversariales (datos/SQL = **D#n**; producto/generadores = **P#n**). **Mandan sobre el brief.** Cada una está aplicada en el cuerpo de este SPEC con el DM-nn que la hace verificable.

| # | Origen | Qué decide | Dónde vive |
|---|---|---|---|
| **R1** | D1, D2 | TZ **`America/Santiago` hardcodeada** en el RPC; sin `p_timezone`; ni RN ni web mandan TZ | §12, **DM-10** |
| **R2** | D3 | **Una sola función** `get_client_month_reports(p_client_id, p_months date[])`, ≤ 24 meses, filtro sargable, window function para el máximo previo | §9.1, §11, **DM-30** |
| **R3** | D11 | Denegación = `raise exception 'client_month_reports_denied' using errcode = '42501'`; guard de 3 vías verbatim | §10.1, **DM-40** |
| **R4** | D12 | `language plpgsql stable security definer set search_path = ''`, nombres calificados, ACL + bloque `DO` de verificación, `COMMENT` | §10.2, **DM-41** |
| **R5** | D5, P5 | Eje temporal de check-ins = **`check_ins.created_at`**, nunca `date` | §12, **DM-11** |
| **R6** | D12, P12 | Predicados de récords / volumen / grupo **copiados verbatim** de las RPC vigentes | §9.2, **DM-31** |
| **R7** | D6, D7, D8 | Programa del mes, días planificados por semana y **adherencia = entrenados ÷ planificados** | §8.4, **DM-23**, **DM-24** |
| **R8** | D4 | No se reutilizan `get_client_workout_day_counts` / `get_client_daily_tonnage` | §9.1 |
| **R9** | D9, D10 | Nutrición del mes **solo lecturas**, prohibido invocar cualquier función que escriba snapshots | §8.6, §10.3, **DM-26** |
| **R10** | — | Contrato jsonb por mes (completo en DATA-TESTING §1) | §9.3 |
| **R11** | P15, D15b | Segunda función `get_client_report_bounds(p_client_id)` para los chips | §9.4, **DM-32** |
| **R12** | D3 | Protocolo tx-rollback antes de aplicar en LIVE | [PLAN.md](PLAN.md) §W0, [DATA-TESTING.md](DATA-TESTING.md) §3 |
| **R13** | P10 | Package nuevo **`packages/client-dossier`** (`@eva/client-dossier`) con el modelo mensual | [PLAN.md](PLAN.md) §Arquitectura |
| **R14** | P14 | `period` + **`tiles` precomputados por el modelo** (6 tiles) | §8.2, **DM-20** |
| **R15** | — | Reglas del modelo mensual: peso, récord nuevo, programa, encabezado | §8, **DM-21**…**DM-25** |
| **R16** | P3, D11 | Server action con cliente de cookies; service-role **solo** para firmar fotos | §10.4, **DM-42** |
| **R17** | P11 | Firmas de las dos funciones en `database.types.ts`, **sin `as any`** | [TASKS.md](TASKS.md) W2 |
| **R18** | P6, P13 | jsPDF: `renderDossierReport` + `downloadClientDossierPdf(input, {separate})`; separado ⇒ **zip con `fflate`** | §6.3, **DM-05**, **DM-06** |
| **R19** | P8, P15 | UI web: `DossierExportDialog` con segmented, chips, atajos e interruptores | §6 |
| **R20** | P1, D13, D14 | Fotos RN por `ImageManipulator`; tope 3/mes y 18/exportación; `refs` acotado a 24 en la ruta | §13, **DM-50**…**DM-52** |
| **R21** | P9 | UI RN: `DossierExportSheet` con `components/Sheet.tsx`, sin interruptor junto/separado | §7 |
| **R22** | P2 | Datos RN por `supabase.rpc`; el modelo sale de `@eva/client-dossier`. Nutrición V1 del dossier «de hoy» ⇒ **backlog** | §5.2, [TASKS.md](TASKS.md) §Backlog |
| **R23** | — | HTML RN: `renderDossierHtml` separado; concatenación con `page-break-after`; fixes de corte | §7.3, **DM-07** |
| **R24** | P4 | W0 poda `docs/status/CURRENT.md` bajo 15 KB; `pnpm docs:check` verde es gate de W0 | [TASKS.md](TASKS.md) W0 |
| **R25** | — | SDD en esta carpeta; tests por capa; E2E **escrito, no corrido** | [PLAN.md](PLAN.md) §Olas, [TASKS.md](TASKS.md) E3 |
| **R26** | D15a | Divergencia aceptada: la ficha web cuenta la semana en **UTC**; el informe corta en Santiago | §15 |

---

## 5. Alcance y no-alcance

### 5.1 Entra

1. Dos funciones SQL aditivas nuevas (`get_client_month_reports`, `get_client_report_bounds`).
2. Package `@eva/client-dossier` con el modelo mensual puro y los tipos movidos.
3. Diálogo web `DossierExportDialog` + server actions `getClientMonthDossiers` / `getClientReportBounds`.
4. jsPDF multi-informe (junto) y zip (separado).
5. Sheet RN `DossierExportSheet` + lectura por `supabase.rpc` + HTML multi-informe con los fixes de corte.
6. Tope de `refs` en `apps/web/src/app/api/mobile/coach/checkin-photos/route.ts` (R20).
7. Firmas nuevas en `apps/web/src/lib/database.types.ts` (R17).

### 5.2 No entra (declarado, con dueño)

- **La nutrición V1 del dossier RN «de hoy»** (R22). `apps/mobile/lib/client-dossier-pdf.ts` lee `data.nutritionMonthlyAvgPct`, que sale de `averageNutritionTimelineCompliance` sobre el timeline V1 (`apps/mobile/lib/coach-client-detail.ts:1157`), mientras el dossier web ya usa la señal V2. **Es un bug preexistente, no lo arregla este tren**: queda en [TASKS.md](TASKS.md) §Backlog. El informe **mensual** no lo hereda: su nutrición sale del RPC nuevo (§8.6).
- **El dossier «Estado actual»**: no cambia ni un rótulo (DM-04). Solo gana el envoltorio del diálogo/sheet.
- **Rediseño del PDF.** Paleta, tipografía, orden de secciones y grilla 3×2 quedan como están.
- **Gate por tier.** Ninguno.
- **Semanas y rangos libres.** Solo meses calendario.
- **La divergencia UTC de la ficha web** (R26, §15): se documenta, no se toca.
- **`workout_sessions`.** No se lee ni se llena.

---

## 6. UX web (R19)

### 6.1 Entrada y estructura

- **DM-02a** El icon-button «Exportar PDF» del hero (`ClientProfileHero.tsx:241-242`) deja de disparar la descarga y **abre `DossierExportDialog`** (`@/components/ui/dialog`, que ya existe). El `aria-label`/`title` **se mantienen en «Exportar PDF»** — el botón del hero web ya se llamaba así antes de este tren y no cambia de rótulo, solo de comportamiento (abre el diálogo en vez de descargar directo). El sheet RN sí se titula «Exportar dossier» (`DossierExportSheet.tsx:172`, prop `title`) porque ese componente es nuevo y no hereda ningún rótulo previo.
- **DM-02b** Al abrir, el diálogo pide `getClientReportBounds(clientId)`. Mientras no llegan los bordes, el segmento «Por meses» está deshabilitado con un esqueleto; «Estado actual» ya es usable.
- **DM-02c** Segmento (`@/components/ui/segmented-control`, `SegmentedControlProps` en `segmented-control.tsx:22-30`): **«Estado actual» | «Por meses»**, con «Estado actual» **preseleccionado** y el CTA con foco ⇒ el caso frecuente es **2 clics** (abrir + Enter).

### 6.2 Modo «Por meses»

- **DM-02d** Chips de mes desde `bounds.first_month` hasta `bounds.current_month`, **todos**, incluso los vacíos. Se implementan como `<button aria-pressed>` (no hay componente de chip multiselección en `@/components/ui`); la lista scrollea cuando hay más de 12.
- **DM-02e** Atajos **«Últimos 3»** y **«Últimos 6»**, que seleccionan los N meses más recientes disponibles.
- **DM-02f** El mes en curso se rotula **«sept 2026 · hasta hoy»** y su período corta en la fecha de generación (§12).
- **DM-02g** Interruptor **«Un solo PDF»** (`@/components/ui/switch`), visible solo con **≥ 2 meses** seleccionados, encendido por defecto.
- **DM-02h** Interruptor **«Incluir fotos de check-in»**, visible solo en «Por meses», **encendido por defecto** (Q4).
- **DM-02i** El CTA dice cuántos archivos produce: **«Descargar PDF»** (estado actual) · **«Descargar 1 PDF»** (junto) · **«Descargar 3 PDF (zip)»** (separado).
- **DM-02j** Los errores se pintan **dentro del diálogo**, nunca con `alert()` ni en el texto suelto del hero. Un `42501` del RPC se traduce a «No tenés acceso a este alumno» (§10.4).
- **DM-02k** Sin meses seleccionados el CTA está deshabilitado con el hint «Elegí al menos un mes».

### 6.3 Nombres de archivo y descarga (R18)

- **DM-05** Un mes ⇒ `dossier-<slug>-2026-07.pdf`. Varios meses junto ⇒ `dossier-<slug>-2026-07_2026-09.pdf` (primero y último **seleccionados**, en orden cronológico).
- **DM-06** Varios meses separados ⇒ **un zip** `dossier-<slug>-2026-07_2026-09.zip` con un PDF por mes adentro, armado con `zipSync` de `fflate`. **Nunca** N `doc.save()`: el navegador bloquea descargas múltiples y el segundo archivo se pierde sin aviso.
- **DM-05a** El `slug` sale del mismo `slugify(dossier.identity.fullName)` que ya usa `client-dossier-pdf.ts:54-64`; no se inventa otro.
- **DM-05b** Junto: **un** `doc`, `addPage()` entre informes (el helper ya existe, `client-dossier-pdf.ts:88-92`) y footer con **numeración global** «p/total» — es un solo documento, no tres pegados.

---

## 7. UX RN (R21)

### 7.1 Entrada y estructura

- **DM-03a** El botón de exportar del hero (`apps/mobile/components/coach/clientDetail/ClientHero.tsx:137-143`, prop `onExportPdf`) abre **`DossierExportSheet`**, construido con **`apps/mobile/components/Sheet.tsx`** (`SheetProps` en `:80`, componente en `:173`). **No se monta un `@gorhom/bottom-sheet` nuevo a mano**: `Sheet.tsx` ya envuelve el backdrop, el teclado y los tokens del DS.
- **DM-03b** Segmento con `apps/mobile/components/SegmentedTabs.tsx`: **«Estado actual» | «Por meses»**, «Estado actual» preseleccionado.
- **DM-03c** Chips de mes en un `ScrollView` **horizontal**, con los mismos atajos «Últimos 3» / «Últimos 6» que la web.
- **DM-03d** Interruptor «Incluir fotos» con `apps/mobile/components/Switch.tsx`, visible solo en «Por meses», encendido por defecto.
- **DM-03e** **Sin** interruptor junto/separado (Q1 = a): RN siempre produce **un** PDF.
- **DM-03f** CTA **«Generar y compartir»**, con el mismo contador de meses en el subtítulo.

### 7.2 Datos

- **DM-03g** `fetchClientMonthReports(clientId, months)` y `fetchClientReportBounds(clientId)` viven en `apps/mobile/lib/client-month-reports.ts` (**nuevo**, no en `coach-client-detail.ts`: las lecturas mensuales se separaron en su propio módulo, junto con `MAX_EXPORT_MONTHS` y `photoRefsByCheckInId`), y usan el JWT del coach vía `supabase.rpc`. El modelo se arma con `buildClientMonthDossier` de `@eva/client-dossier` — RN **no** reimplementa ni una regla.

### 7.3 Generación (R23)

- **DM-07** `renderDossierHtml(model, photoMap)` se separa de la exportación; `exportClientDossierPdfs(models[], opts)` concatena bloques `<div class="report">` con `page-break-after: always`.
- **DM-07a** CSS obligatorio: `.vol-row, tr, .photo-cell { page-break-inside: avoid }`, bloque de fotos envuelto en `.photos-block { break-inside: avoid }`, y `.vol-track/.vol-bar { display: block }`. Motivo verificado en producción: las barras de volumen (`apps/mobile/lib/client-dossier-pdf.ts:158`) quedaban huérfanas al pie de página y las celdas de foto (`:168-171`) se partían a la mitad.
- **DM-07b** El nombre del archivo sigue la misma regla que la web (DM-05), reemplazando el stem de `client-dossier-pdf.ts:329`.
- **DM-07c** Los tiles se leen de `model.tiles` (R14); `kpiCard(...)` (`:176`) pasa a recibirlos, no a calcularlos.

---

## 8. El informe mensual (R14, R15)

Es el **mismo layout del dossier**: misma paleta, mismas secciones, mismo orden. Cambian los rótulos, el recorte temporal y tres reglas de contenido.

### 8.1 Encabezado

- **DM-25a** Eyebrow: **«Informe mensual del alumno · N de M»**, con `N = period.index` (1-based) y `M = period.total` (`packages/client-dossier/src/types.ts:56-69`).
- **DM-25b** Chip superior derecho: **el rótulo del mes** («JUL 2026»). **Sin chip de score ni de atención** — un informe mensual no juzga al alumno con el score de hoy.
- **DM-25c** Nombre y contacto, igual que hoy.
- **DM-25d** Línea meta: `Cliente desde <mes año> · Activo|Pausado · Período 1–31 jul 2026 · Generado <dd mmm>`. La racha **sale** de esta línea (es un dato de hoy, no del mes).
- **DM-25e** `generatedAtIso` es **único para toda la exportación**: los tres informes dicen la misma fecha de generación.

### 8.2 Los seis cuadros (Q2 = a, R14)

Los seis los **precomputa el modelo** como `tiles: DossierTile[]` de largo 6 (`{ label, value, sub, tone }`), para que jsPDF y HTML impriman lo mismo sin duplicar lógica. `DossierTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'mid'` (`packages/client-dossier/src/types.ts:72`); cada generador mapea el tono a **su** paleta, que los dos ya tienen (`apps/web/src/lib/pdf/client-dossier-pdf.ts:14-25` en RGB y `apps/mobile/lib/client-dossier-pdf.ts:20-31` en hex).

| # | Rótulo (modo mes) | Valor | Sub |
|---|---|---|---|
| 1 | **Peso · jul 2026** | `weight.last_kg` + « kg», o `—` | Δ vs `prev_kg`: «−0,1 kg» / «+0,3 kg» / «sin cambio»; si `last_at` cae **fuera** del período ⇒ «último check-in dd mmm» |
| 2 | **Adherencia · jul 2026** | `round(training_days ÷ planned_days × 100)` con tope 100, o `—` | «N de M días» · sin programa ⇒ «sin programa» |
| 3 | **Días entrenados · jul 2026** | `training_days.length` («N») cuando no hay programa, o `training_days.length/planned_days` («N/M») cuando sí lo hay | «N sesiones» (usa `sessions`, no `training_days`) |
| 4 | **Volumen · jul 2026** | `volume_total` con separador de miles + « kg» | «kg × reps» |
| 5 | **Récords nuevos · jul 2026** | cantidad de `prs` con `isNew` | «de N ejercicios» |
| 6 | **Check-ins · jul 2026** | `check_ins.length` | «en el mes» |

- **DM-20** Sin `period` (dossier «Estado actual») los tiles se calculan **exactamente como hoy** y los rótulos **no cambian** (DM-04). Para que el generador no vuelva a armarlos a mano, el package expone `buildTodayTiles(dossier)` (`packages/client-dossier/src/today-tiles.ts:33`) con los seis cuadros de siempre: Peso, Adherencia semanal, Racha, Workouts semana, Nutrición semana, Check-ins.
- **DM-21 · Peso.** El valor es `weight.last_kg` (último check-in con peso **hasta el fin del período**, puede ser de un mes anterior); el Δ es contra `weight.prev_kg` (el check-in con peso inmediatamente anterior). Sin ningún check-in con peso en la historia ⇒ valor `—`, sub vacío. Dead-band de ±0,05 kg, el mismo que ya usa el PDF web (`client-dossier-pdf.ts:198`), para que +0,03 no se imprima «+0,0 kg» en ámbar.
- **DM-22 · Días entrenados.** `training_days` = días **locales** distintos con al menos un `workout_logs`. No se lee `workout_sessions` (§1, P4).

### 8.3 Sección «Entrenamiento»

- **DM-23a** **«Récords del mes»**: top **10** por peso máximo **dentro del mes**. El corte a 10 lo hace el modelo, no el SQL (el RPC devuelve la lista completa ordenada).
- **DM-23b** **★** en la fila cuando `prev_max_kg IS NULL OR max_weight_kg > prev_max_kg` (`isNew`): ese ejercicio superó su máximo de **todos los meses anteriores**. El mismo `isNew` alimenta el tile 5.
- **DM-23c** Un récord **repetido** (igualar el máximo previo, `max_weight_kg = prev_max_kg`) **no** es récord nuevo: no lleva ★ y no cuenta en el tile.
- **DM-23d** **«Volumen por grupo (mes)»**: top **8** por volumen, mismo corte en el modelo.

### 8.4 Sección «Programa» (R7)

- **DM-24a** El programa del mes es el `workout_programs` del cliente con `start_date <= fin_período AND (end_date IS NULL OR end_date >= inicio_período)`. Con varios candidatos gana el de `start_date` más reciente; empate ⇒ `is_active`, luego `created_at`.
- **DM-24b** Subtítulo **«Semanas a–b de N»**, más **«· finalizó el dd mmm»** cuando `end_date < period.to`.
- **DM-24c** Días del programa con su cantidad de ejercicios (`block_count`), igual que hoy.
- **DM-24d** **Sin programa** (borrado duro o `start_date` nulo) pero con logs: el nombre pasa a **«Entrenamientos registrados»** y los días son los `plan_names_from_logs` **sin conteo** de ejercicios.
- **DM-24e** Sin programa y sin logs: el empty-state **de mes**, «Sin programa ni entrenamientos registrados en el período.» (§8.7) — no el texto de «Estado actual» («Sin programa activo asignado.»), que es el que sigue usando el dossier de HOY sin tocarse (DM-04).
- **DM-24f** **Días planificados** del período = `planned_per_week × días_del_período ÷ 7`, redondeado. `planned_per_week` = cantidad de `day_of_week` distintos de los `workout_plans` del programa con al menos un `workout_blocks`; si el programa es `ab_mode`, el **promedio de las variantes A y B**, redondeado.
- **DM-24g** Sin programa ⇒ `planned_days = null` ⇒ **adherencia `null`**: el tile 2 imprime `—` y el tile 3 imprime solo `N` (sin `/planned_days`), con sub «N sesiones» **sin denominador**. Nunca se inventa un denominador de 7.

### 8.5 Sección «Check-ins»

- **DM-25f** Tabla **igual a hoy** (fecha, peso, variación, energía, notas), con los check-ins **del mes**, orden `created_at` descendente.
- **DM-25g** Las fotos del mes van debajo, solo si el interruptor está encendido (§13).

### 8.6 Sección «Nutrición» (R9)

- **DM-26a** Si hubo un plan V2 **publicado y vigente** dentro del período (`nutrition_plan_versions_v2.effective_from/effective_to`, `supabase/migrations/20260714190000_nutrition_v2_domain.sql:36-37`), se imprimen el nombre del plan y la adherencia del mes: **«X de Y días en rango»**.
- **DM-26b** Los snapshots de día son **lazy**: `tracked_days` = filas existentes de `nutrition_day_snapshots_v2` en el período (`20260714190000:152-172`), no los días del calendario. Por eso el copy es «X de Y días registrados» y nunca «X de 31».
- **DM-26c** Sin plan vigente en el mes ⇒ `nutrition = null` y el PDF imprime **«Sin plan de nutrición vigente.»**
- **DM-26d** El cálculo de «en rango» **se copia, no se reinventa** — ver §15 D-3: hoy vive en TypeScript, no en el RPC de historia.

### 8.7 Estados vacíos del informe mensual (DM-27)

- **DM-27** Los cuatro estados vacíos del **modo mes** son **idénticos, carácter por carácter, en web y en RN** (`apps/web/src/lib/pdf/client-dossier-pdf.ts:77-85`, const `EMPTY`, campo `.month`; `apps/mobile/lib/client-dossier-pdf.ts:311,350-351,357,382`), para que el mismo mes exportado desde cualquiera de los dos lados diga lo mismo:

  | Sección | Texto |
  |---|---|
  | Programa (sin programa y sin logs) | «Sin programa ni entrenamientos registrados en el período.» |
  | Volumen por grupo | «Sin volumen de entrenamiento en el período.» |
  | Nutrición | «Sin plan de nutrición vigente en el período.» |
  | Check-ins | «Sin check-ins en el período.» |

  El dossier **«Estado actual»** conserva sus propios cuatro textos de siempre («Sin programa activo asignado.», «Sin volumen de entrenamiento en los últimos 30 días.», «Sin plan de nutrición vigente.», «Sin check-ins registrados.») — DM-04, no se tocan.

---

## 9. Contrato de datos

El jsonb completo está en [DATA-TESTING.md](DATA-TESTING.md) §1. Acá va lo que gobierna el producto.

### 9.1 Una sola función para toda la exportación (R2, R8)

- **DM-30** `public.get_client_month_reports(p_client_id uuid, p_months date[]) returns jsonb`. Cada `date` del array es el **primer día** de un mes. Devuelve `{ "months": [ … ] }` **en el orden pedido**.
- **DM-30a** Máximo **24 meses** por llamada; más ⇒ `raise exception … using errcode = '22023'`.
- **DM-30b** **No** se reutilizan `get_client_workout_day_counts`, `get_client_daily_tonnage` ni `get_client_activity_dates`: una sola llamada evita 3 viajes y trae volumen por grupo y récords que esas funciones no dan. El patrón de `monthly-summary` queda como referencia, **no** como dependencia.

### 9.2 Predicados copiados verbatim (R6)

| Concepto | Predicado | Origen verificado |
|---|---|---|
| Récords | `weight_kg IS NOT NULL AND weight_kg > 0 AND reps_done IS NOT NULL AND reps_done > 0 AND COALESCE(wb.exercise_id, wl.exercise_id) IS NOT NULL` | `20260910205101_get_client_exercise_prs_reps_filter.sql:39-44` |
| `reps_eff` | `left_reps` y `right_reps` `~ '^[0-9]{1,4}$'` en **los dos** ⇒ suma; si no, `reps_done` | `20260903212800_muscle_volume_side_metadata.sql:56-60` |
| Volumen | `COALESCE(weight_kg,0) * COALESCE(reps_eff,0) > 0` | `20260903212800:67-75` |
| Grupo muscular | `COALESCE(NULLIF(BTRIM(e.muscle_group), ''), 'Otro')` | `20260903212800:53` |
| JOIN de ejercicio | `LEFT JOIN exercises e ON e.id = COALESCE(wb.exercise_id, wl.exercise_id)` | `20260903212800:63-64` |

- **DM-31** Si estos cinco predicados divergen de sus originales, el volumen del mes contradice el volumen de 30 días de la misma ficha. Se copian **literal**; el test de paridad de DATA-TESTING §4 lo congela.

### 9.3 Forma del jsonb (R10)

Por mes: `month`, `period {from,to}`, `training_days[]`, `sessions`, `planned_days`, `planned_per_week`, `volume_total`, `volume_by_group[]`, `prs[]`, `program | null`, `plan_names_from_logs[]`, `check_ins[]`, `weight | null`, `nutrition | null`.

- **DM-33a** `sessions` = `count(distinct (día_local, COALESCE(plan_name_at_log, wp.title)))`. Es un dato informativo; el tile 3 usa `training_days`.
- **DM-33b** `prs` ordenados por `max_weight_kg desc`, **sin tope en SQL**. `volume_by_group` por `volume desc`, **sin tope en SQL**. Los topes (10 y 8) los aplica el modelo.
- **DM-33c** `check_ins` orden `created_at desc`, ya con los campos `reviewed_*` **fuera** del contrato (son metadatos del coach, no van al alumno).
- **DM-33d** `check_ins[].front_photo_url` viaja **sin firmar** (path del bucket). Firmarlo es responsabilidad de la capa de aplicación (§13).
- **DM-33e** `weight.prev_kg` puede venir de un mes anterior: es el check-in con peso inmediatamente anterior a `last_at`, sin recorte de período.

### 9.4 Bordes de los chips (R11)

- **DM-32** `public.get_client_report_bounds(p_client_id uuid) returns jsonb` ⇒ `{ "first_month": "2026-06-01", "current_month": "2026-09-01" }`, con
  `first_month = date_trunc('month', least(clients.created_at, clients.subscription_start_date, min(workout_logs.logged_at), min(check_ins.created_at)))` en Santiago.
- **DM-32a** Se usa `least(...)` y no solo `clients.created_at` porque un alumno migrado puede tener logs **anteriores** a su fila de `clients`: con `created_at` a secas esos meses no tendrían chip y el coach no podría exportarlos.
- **DM-32b** Mismo guard, misma ACL y `stable` que la función grande.

---

## 10. Seguridad

### 10.1 Guard IDOR (R3)

- **DM-40** Las dos funciones repiten **verbatim** el guard de 3 vías de `get_client_muscle_volume` (`20260903212800:39-43`):

  ```sql
  if auth.uid() is null or not (
      p_client_id = (select auth.uid())
      or exists (select 1 from public.clients c where c.id = p_client_id and c.coach_id = (select auth.uid()))
      or p_client_id in (select public.current_user_pool_client_ids())
  ) then
      raise exception 'client_month_reports_denied' using errcode = '42501';
  end if;
  ```

- **DM-40a** La denegación **lanza**, nunca devuelve vacío. Un `RETURN` mudo (lo que hacen hoy `get_client_muscle_volume` y `get_client_exercise_prs`) haría que un coach ajeno vea «el alumno no entrenó en julio» en vez de un error: el PDF saldría con seis ceros y una tabla vacía, y eso es peor que un error. Patrón de referencia: `20260714190500_nutrition_v2_security_rpc.sql:449`.

### 10.2 Hardening de la función (R4)

- **DM-41** `language plpgsql stable security definer set search_path = ''`, con **todos** los nombres calificados (`public.workout_logs`, `public.clients`, `auth.uid()`, `private.nutrition_v2_intake_totals`…). Precedente en el repo: `20260716210000_nutrition_v2_t11_hardening.sql:214`.
- **DM-41a** ACL: `REVOKE ALL … FROM PUBLIC, anon, service_role;` + `GRANT EXECUTE … TO authenticated, service_role;` + bloque `DO $verify$` con `has_function_privilege` copiado de `20260903212800:89-106`, más `COMMENT ON FUNCTION`.
- **DM-41b** Migración **aditiva, idempotente, forward-only**. Sin `DROP TABLE`, sin renames, sin tocar filas.

### 10.3 Nutrición: solo lecturas (R9)

- **DM-26** Está **prohibido** que el RPC invoque `get_nutrition_today_v2`, `get_nutrition_client_detail_v2`, cualquier `…_scoped_v2` o cualquier función que llame a `private.nutrition_v2_ensure_day_snapshot`. Un informe de julio **no puede crear filas** de julio: sería reescribir historia del alumno desde un botón de exportar.
- **DM-26e** Lo que sí puede usar: `public.nutrition_day_snapshots_v2`, `public.nutrition_plan_versions_v2`, `public.nutrition_plans_v2` y el helper de lectura `private.nutrition_v2_intake_totals` (`supabase/migrations/20260728120000_nutrition_v2_macros_basis.sql:221`, `language sql stable`, sin escrituras).

### 10.4 Frontera cliente/servidor en web (R16)

- **DM-42** `getClientMonthDossiers(clientId, months, { includePhotos })`:
  1. `assertCoachClientReadAccess` como hoy (el service ya scopea; `client-detail.actions.ts:41` lo documenta);
  2. el **RPC** se llama con el **cliente de cookies** (`createClient()` de `@/lib/supabase/server`, `server.ts:14`) ⇒ el guard de 3 vías corre con el JWT real del coach;
  3. el **service-role** (`createServiceRoleClient()`, `admin-client.ts:7`) se usa **únicamente** dentro de `resolveCheckinPhotoUrls` (`checkin-photos.ts:85`), porque los coaches no tienen policy de SELECT en storage.
- **DM-42a** Esa separación es un **invariante escrito en el código** (comentario en la server action) y en este SPEC: llamar el RPC con service-role saltearía el guard IDOR entero y convertiría la action en un agujero cross-tenant. El precedente correcto ya existe: `client-detail.service.ts:702` pasa `createServiceRoleClient()` **solo** a `resolveCheckinPhotoUrls`.
- **DM-42b** Un `42501` del RPC se traduce a `Error('No tenés acceso a este alumno')` y un `22023` a `Error('Selección de meses inválida')`; nunca se filtra el mensaje crudo de Postgres a la UI.
- **DM-42b.1 · Estado real (ronda de revisión 16-09) — regla, no todavía código.** `translateReportRpcError` (`apps/web/src/services/client/client-month-report.service.ts:63-67`) traduce **solo** `42501` y `22023`; para **cualquier otro código** hoy devuelve `new Error(error.message || 'No se pudo leer el informe del alumno')`, es decir, **propaga el mensaje crudo de Postgres** en el objeto `Error` (con el comentario explícito «es un bug, no una decisión de producto», `:61`). En la web esto **no llega a filtrarse a la UI** porque `DossierExportDialog.messageFor()` (`DossierExportDialog.tsx:58-61`) solo muestra los dos mensajes de la allowlist `KNOWN_ERRORS` y cualquier otro texto cae a `GENERIC_ERROR` («No se pudo generar el PDF. Intentá de nuevo.») — la UI web es segura hoy pase lo que pase en el service. **En RN NO existe ese filtro**: `throwRpcError` (`apps/mobile/lib/client-month-reports.ts:25-30`) traduce el `42501` pero para cualquier otro código (incluido un futuro `22023` sin manejar explícito) hace `throw new Error(error?.message || fallback)`, y `DossierExportSheet.tsx:138` pinta `e.message` **directo** en el sheet — un coach en RN puede ver un mensaje de Postgres en crudo. **Regla de cierre de este tren** (pendiente de implementar, no confundir con lo que ya funciona en la web): (a) el service debe devolver un mensaje **genérico** («No se pudo leer el informe del alumno») para cualquier código que no sea `42501`/`22023`, y loguear el error original **server-side** (`console.error` o el logger que use el resto de `services/client`), nunca en el `Error` que sube al cliente; (b) `throwRpcError` en RN debe aplicar la misma allowlist que la web (solo `DENIED_MESSAGE` y el mensaje de `22023` viajan tal cual; cualquier otro código cae a su `fallback` genérico, nunca a `error.message`). **Cierre**: [TASKS.md](TASKS.md) tareas C10 y D9 (nuevas, sin marcar).
- **DM-42c** El archivo de la action es `'use server'`: **solo exporta funciones async**; los tipos y constantes del diálogo viven fuera.

---

## 11. Rendimiento (R2)

- **DM-30c** El filtro temporal es **sargable**:

  ```sql
  wl.logged_at >= (m::timestamp at time zone 'America/Santiago')
  and wl.logged_at <  ((m + interval '1 month')::timestamp at time zone 'America/Santiago')
  ```

  **Nunca** `timezone('America/Santiago', wl.logged_at)::date` sobre la columna: eso mata el índice y obliga a un seq scan del historial completo.

- **DM-30d** **Una sola pasada** sobre `workout_logs` del cliente hasta el fin del último mes pedido, con `date_trunc` a mes local como bucket. El máximo previo por ejercicio sale de una **window function** (`max(...) over (partition by exercise order by month_bucket rows between unbounded preceding and 1 preceding)`), no de una subconsulta por mes.
- **DM-30e** Objetivo medible: un alumno con **4.000 logs y 12 meses** ⇒ **un** range scan sobre `idx_workout_logs_client_id_logged_at` (`supabase/migrations/00000000000001_baseline.sql:2079`) o `idx_wl_client_logged_notnull` (`20260612050000_workout_logs_perf_indexes.sql:9`). El `EXPLAIN (ANALYZE, BUFFERS)` esperado está en [DATA-TESTING.md](DATA-TESTING.md) §4.
- **DM-30f** El tope de 24 meses (DM-30a) es la defensa dura contra un alumno de 4 años de historia: 48 meses en una llamada no se rechazan por gusto, se rechazan porque el jsonb resultante entra al PDF entero.

---

## 12. Zona horaria (R1, R5)

- **DM-10** **`America/Santiago` hardcodeada en el RPC**, igual que `get_client_workout_day_counts` (`supabase/migrations/20260612051000_rpc_client_workout_day_counts.sql:20,23`). **Sin parámetro `p_timezone`**: ni RN ni web mandan TZ. Razón: si el coach viaja, el mismo alumno daría cortes de mes distintos según el dispositivo desde el que se exporte, y dos PDF del mismo julio no coincidirían.
- **DM-10a** «Mes en curso» = el mes de `current_date` en Santiago. Su `period.to` es **hoy** (Santiago), no el fin de mes.
- **DM-10b** Todos los días locales (`training_days`, buckets de mes) se derivan con la misma conversión.
- **DM-11 · Eje de check-ins = `check_ins.created_at`.** La columna `check_ins.date` es un `date` y el **peso rápido** la escribe como `YYYY-MM-DD` ⇒ al leerla como instante queda en **medianoche UTC** ⇒ **día anterior** en Santiago, y un check-in del 1 de agosto se contabiliza en julio. `created_at` es `timestamptz` y no tiene ese corrimiento. El dossier «de hoy» **no se toca** aunque comparta el defecto.

---

## 13. Fotos (R16, R20)

- **DM-50 · Web.** El service firma **como máximo 3 fotos por mes** y **solo `front_photo_url`**, pero lo hace con `{ fullPhotoRows: 0, tailFields: ['front_photo_url'] }` (`apps/web/src/services/client/client-month-report.service.ts:157-158`), **no** `fullPhotoRows: 3`: `resolveCheckinPhotoUrls` firma las **tres** fotos (front/side/back) en las filas dentro de `fullPhotoRows` y **solo** `tailFields` en el resto (`checkin-photos.ts:32-41,91,98,100`); como el informe mensual imprime únicamente la frontal, `fullPhotoRows: 0` + `tailFields: ['front_photo_url']` firma exactamente esa y nada más, en **todas** las filas. El tope de 3 por mes y 18 por exportación lo aplica `pickPhotoRefs` **antes** de llamar al firmador (`client-month-report.service.ts:124-139`), no la opción `fullPhotoRows`.
- **DM-51 · RN.** Antes de embeber, cada foto pasa por
  `ImageManipulator.manipulateAsync(uri, [{ resize: { width: 700 } }], { compress: 0.6, format: JPEG, base64: true })`.
  El paquete ya está en la app (`apps/mobile/package.json:65`, `expo-image-manipulator ~14.0.8`) y el check-in ya lo usa con el mismo patrón (`apps/mobile/lib/exercises.ts:420-423`). Sin el resize, 18 fotos de cámara en base64 hacen un HTML de decenas de MB y `expo-print` se queda sin memoria en gama media.
- **DM-51a** Mismo tope: **3 fotos por mes**, **18 por exportación**. Se firma **por lote de mes** (`signCheckinPhotos`, `apps/mobile/lib/api.ts:246`), no foto por foto.
- **DM-52 · Ruta compartida — estado actual (16-09): trunca, no rechaza.** `apps/web/src/app/api/mobile/coach/checkin-photos/route.ts:54` hoy hace `.slice(0, 24)` sobre `refs`: acota el trabajo del service-role, pero un caller que mande 100 `refs` recibe **200 con 24 URLs firmadas** y ningún aviso de que las otras 76 se descartaron.
- **DM-52a · Corrección del revisor final (pendiente de aplicar).** Un array de `refs` con más de 24 elementos es una señal de bug del caller (nadie exporta más de 18 fotos, DM-50/DM-51a): la ruta debe **rechazar con `400`** (`{ error: 'Demasiadas fotos por request' }` o similar) en vez de truncar en silencio, para que el bug se vea en el caller y no se entierre en una respuesta 200 incompleta. **Todavía no está en el código** (verificado 16-09: la ruta sigue con `.slice(0, 24)`, sin el `if (refs.length > 24)` que devolvería 400) — regla escrita para que quien lo implemente no reabra la discusión; tarea sin marcar en [TASKS.md](TASKS.md) (D5).
- **DM-53** El interruptor apagado ⇒ **no se firma ni una foto** (ni en web ni en RN): la sección de fotos no se imprime y no se hace ninguna llamada a storage.
- **DM-54** Una foto que falla (path irreconocible, firma vencida, descarga caída) **no rompe el informe**: se pinta el placeholder que ya existe (`apps/mobile/lib/client-dossier-pdf.ts:170`, `client-dossier-pdf.ts:644`).

---

## 14. Decisiones cerradas de los refutadores

Cada hallazgo de las dos refutaciones quedó cerrado por una resolución. Ninguno se reabre.

### 14.1 Refutador de datos/SQL (D#)

| # | Hallazgo | Cerrado por |
|---|---|---|
| D1, D2 | El `p_timezone` del brief abría dos verdades para el mismo mes | **R1** — Santiago hardcodeada (§12) |
| D3 | Una llamada por mes = N viajes y N pasadas sobre `workout_logs` | **R2** — función única, filtro sargable, window function (§9.1, §11); **R12** — tx-rollback (PLAN §W0) |
| D4 | Reusar `get_client_workout_day_counts` / `get_client_daily_tonnage` no alcanzaba | **R8** — no se reutilizan (§9.1) |
| D5 | `check_ins.date` corre los check-ins un día | **R5** — eje en `created_at` (§12) |
| D6, D7, D8 | Programa del mes, `ab_mode` y días planificados sin regla | **R7** — §8.4 completo |
| D9, D10 | La nutrición podía crear snapshots al exportar | **R9** — solo lecturas (§10.3) |
| D11 | Denegar devolviendo vacío es indistinguible de «no entrenó» | **R3** — 42501 (§10.1) |
| D12 | `search_path`, calificación de nombres y ACL sin verificar | **R4** — §10.2 |
| D13, D14 | Fotos sin tope y sin recompresión | **R20** — §13 |
| D15a | La ficha web cuenta la semana en UTC | **R26** — divergencia aceptada (§15) |
| D15b | Los chips necesitaban un borde inferior real | **R11** — `get_client_report_bounds` (§9.4) |

### 14.2 Refutador de producto/generadores (P#)

| # | Hallazgo | Cerrado por |
|---|---|---|
| P1 | El PDF RN con fotos base64 revienta la memoria | **R20** — resize + topes (§13) |
| P2 | RN armaba el modelo desde `CoachClientDetailData` | **R22** — `@eva/client-dossier` (§7.2) |
| P3 | La server action podía llamar el RPC con service-role | **R16** — §10.4 |
| P4 | `CURRENT.md` no admitía una entrada más | **R24** — poda en W0 (TASKS) |
| P5 | Mismo corrimiento de `date` visto desde producto | **R5** — §12 |
| P6, P13 | N `doc.save()` = descargas bloqueadas por el navegador | **R18** — zip con `fflate` (§6.3) |
| P8, P15 | El botón sin diálogo no admite opciones | **R19** — §6 |
| P9 | Montar un gorhom nuevo a mano rompía el DS | **R21** — `Sheet.tsx` (§7.1) |
| P10 | El modelo en `apps/web` no lo puede importar RN | **R13** — package nuevo (PLAN) |
| P11 | `supabase.rpc` sin tipos obligaba a `as any` | **R17** — `database.types.ts` (TASKS W2) |
| P12 | Predicados reescritos a mano divergen | **R6** — verbatim (§9.2) |
| P14 | Cada rótulo se tocaba dos veces (jsPDF y HTML) | **R14** — `tiles` en el modelo (§8.2) |

---

## 15. Divergencias aceptadas

- **D-1 (R26) · La ficha web cuenta «workouts esta semana» en UTC.** El fallback parte el ISO con `split('T')[0]`, mientras el informe mensual corta en Santiago. Entre las 21:00 y la medianoche de Chile, un entreno puede caer en semanas distintas según quién lo cuente. **No se toca la ficha en este tren**: se anota en [DATA-TESTING.md](DATA-TESTING.md) §6 y en [TASKS.md](TASKS.md) §Backlog.
- **D-2 · `fflate` no está declarado hoy.** Aparece en `pnpm-lock.yaml` como transitiva (y con un override de seguridad `fflate@<0.8.3: '>=0.8.3'` en el `package.json` raíz), pero no como dependencia directa de ninguna app. R18 pide declararla en `apps/web/package.json`, que ya declara dependencias propias de la app (`jose`, `xlsx`, `zxing-wasm`, `:12-23`). Se declara **`fflate@0.8.3`**, la misma versión que resuelve el lockfile hoy. Nota para el revisor: `jspdf` vive en el `package.json` **raíz** (`:65`), así que las dos dependencias del generador quedan en manifiestos distintos; es consistente con cómo está armado el monorepo, no un descuido.
- **D-3 · El criterio de «en rango» no vive en SQL.** R9 dice que se copie «el MISMO criterio que usa `get_nutrition_history_page_v2`». Verificado contra el código: ese RPC (`supabase/migrations/20260716210000_nutrition_v2_t11_hardening.sql:207-360`) devuelve `targets` y `consumed` por día y **no clasifica nada**; la clasificación «en rango» es **TypeScript** y vive en `resolveCoachDayAdherence` (`apps/web/src/app/coach/nutrition-v2/[clientId]/_lib/week-nav.ts:97-107`): `ratio = consumidas ÷ meta`, **en rango cuando `ratio ∈ [0,9 ; 1,1]`**. Lectura operativa de R9, sin reinventar nada: el RPC mensual replica **ese** umbral en SQL, comparando `private.nutrition_v2_intake_totals(client, día) ->> 'calories'` contra `nutrition_day_snapshots_v2.target_calories`, y descarta los días sin meta o sin consumo (igual que la función TS devuelve `null`). Así quedó escrito en `supabase/migrations/20260915230000_client_month_reports.sql:472-490`. El caso de paridad de [DATA-TESTING.md](DATA-TESTING.md) §5.4 congela la equivalencia.
- **D-4 · El dossier RN «de hoy» seguirá mostrando nutrición V1** hasta que se tome el backlog de R22 (§5.2). El informe **mensual** no la hereda.

---

## 16. Riesgos

| # | Riesgo | Mitigación en este tren |
|---|---|---|
| 1 | **Dos generadores**: cada rótulo se tocaría dos veces y divergen (ya pasó con la nutrición, §1 P3) | `tiles` precomputados en el modelo (R14, DM-20); los dos generadores solo pintan |
| 2 | **Datos raros se imprimen tal cual** (un peso de 640 kg, una nota de 3 líneas) | El modelo trunca notas a 200 chars (regla existente, `client-dossier.ts:242`) y los tiles tienen `—` en todos los caminos nulos |
| 3 | **PDF grande** con fotos | Topes de §13 (3/mes, 18/exportación) + resize en RN + tope de 24 meses |
| 4 | **Descargas múltiples bloqueadas** por el navegador | Zip único (DM-06), nunca N `save()` |
| 5 | **RPC costoso** con 12 meses | Función única, filtro sargable, window function, `EXPLAIN` obligatorio en W0 (DM-30c…f) |
| 6 | **Mes en curso ambiguo**: el coach exporta el día 3 y el informe parece vacío | Rótulo «hasta hoy» en el chip y `Período 1–3 sept` en la meta (DM-02f, DM-25d) |
| 7 | **Alumno sin programa** ⇒ adherencia inventada | `planned_days = null` ⇒ `—`, nunca un denominador de 7 (DM-24g) |
| 8 | **El package nuevo no resuelve en Metro/Vitest** | Registro explícito en los 5 lugares (PLAN §Arquitectura) + `expo export` como gate de W3 |
| 9 | **Regresión en el dossier de hoy** | DM-04: test de identidad + el re-export de tipos mantiene a los 4 consumidores intactos |

---

## 17. QA del owner

En device (RN) y en navegador (web). Ningún punto se da por bueno sin ejecutarlo.

### Notas — cambios intencionales (no son regresión)

- **RN · «null%» → «—».** El tile Nutrición del dossier **de HOY** en RN imprimía literalmente `null%` cuando `data.nutritionMonthlyAvgPct` era `null`. Ahora imprime `—` (`apps/mobile/lib/client-dossier-pdf.ts:598-599`, comentario «Micro-fix: sin dato el cuadro imprimía literalmente «null%»»). Si el QA del owner venía de una build vieja y esperaba ver `null%`, **no es un bug**: es el fix.
- **Récord nuevo: marca distinta por plataforma.** Web marca el récord nuevo con el sufijo **«(nuevo)»** en vez de ★ (`apps/web/src/lib/pdf/client-dossier-pdf.ts:68`, `NEW_PR_MARKER`): las fuentes estándar de jsPDF van en WinAnsiEncoding y **no tienen** el carácter ★ (U+2605), que sale corrupto en el PDF. RN sí imprime **★** (`apps/mobile/lib/client-dossier-pdf.ts:334`), porque el HTML + `expo-print` no tiene esa limitación de encoding. El punto 13 de abajo distingue los dos casos.
- **Modo «separado» web entrega un `.zip`.** Con «Un solo PDF» apagado y 2+ meses, la descarga es un archivo `dossier-<slug>-<primero>_<último>.zip` (no N PDF sueltos): ábrelo y verificá que tiene un PDF por mes adentro.

### Web

1. Abrir la ficha de un alumno con historial (Joaco) y tocar «Exportar PDF»: **se abre un diálogo**, no se descarga nada.
2. Con «Estado actual» preseleccionado, Enter descarga **el dossier de siempre**, con el mismo nombre de archivo de antes.
3. «Por meses»: aparecen chips desde el primer mes con actividad del alumno hasta el mes actual, y el último dice **«hasta hoy»**.
4. Elegir **jul + sep** (no contiguos): el CTA dice «Descargar 1 PDF» y sale un archivo con **dos** informes.
5. Apagar «Un solo PDF»: el CTA dice «Descargar 2 PDF (zip)» y baja **un zip** con dos archivos adentro.
6. «Últimos 6» selecciona seis chips de una; «Últimos 3», tres.
7. Abrir el PDF de julio: el chip del encabezado dice **JUL 2026**, **no** hay chip de score, y la meta dice `Período 1–31 jul 2026`.
8. Los seis cuadros dicen **«· jul 2026»** en su rótulo.
9. Un mes **vacío** (sin entrenos ni check-ins) produce un informe con `—` en todos lados y los empty-states de siempre: **no crashea y no queda en blanco**.
10. Un alumno **sin programa**: la adherencia dice `—` y «Días entrenados» muestra solo el número entrenado (sin `/planificados`), con «N sesiones» debajo.
11. Apagar «Incluir fotos»: el informe sale sin la grilla de fotos.
12. Encendido: hasta 3 fotos por mes, ninguna partida entre páginas.
13. Récords del mes: las filas marcadas (web: sufijo **«(nuevo)»**; ver nota arriba) son las que superan el máximo de meses anteriores; el tile «Récords nuevos» coincide con esa cantidad.
14. Provocar un error (exportar un alumno de otro coach desde la URL): el mensaje sale **dentro del diálogo** y dice «No tenés acceso a este alumno».

### RN (device)

15. El botón de exportar del hero abre un **sheet**, no genera directo.
16. «Estado actual» sigue generando y compartiendo el dossier de siempre.
17. «Por meses» con tres meses: **un solo PDF**, sin interruptor junto/separado.
18. Los chips scrollean horizontal y los atajos «Últimos 3/6» funcionan.
19. Abrir el PDF compartido: las **barras de volumen** no quedan cortadas al pie de página y **ninguna foto se parte** entre páginas.
20. Los seis cuadros del mes de julio dan **exactamente los mismos números** que el PDF web del mismo mes (comparar lado a lado).
21. Con «Incluir fotos» encendido, el PDF pesa lo razonable y se abre sin trabarse en el visor del teléfono.
22. Exportar 6 meses con fotos en un teléfono de gama media: **no crashea** y termina en un tiempo tolerable.

### Ambos

23. El mes en curso corta **hoy**: exportar septiembre el día 15 no muestra actividad del 16 al 30.
24. Un check-in registrado ayer con el **peso rápido** aparece en el mes que le corresponde (no en el anterior).
