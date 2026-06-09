# 03 · PLAN — Evaluación + Nutrición ("lo que diferencia a Movida")

> Depende del pool `team`, toggles y **consentimiento** de [01 Cimientos](01-PLAN-cimientos.md). Volver al [Director](00-DIRECTOR.md).

## Objetivo

El diferenciador de Movida: **evaluación de ingreso** (screening de movimiento + composición corporal dual) y **nutrición por intercambios** con **PDF branded** (reemplaza Canva). Cubre kine + entrenador + nutri.

> **Prerrequisito legal (bloqueante de captura):** consentimiento por propósito activo (tabla `client_consents`, Plan 01 §F) antes de registrar cualquier dato de salud (movimiento/composición/antropometría). Sin consentimiento → no se guarda. Todo acceso queda en `team_access_logs`.

---

## A. Screening de Movimiento de Ingreso (kine)

> **REGLA DURA DE MARCA:** "FMS"/"Functional Movement Screen" NO aparecen en ninguna superficie de usuario, UI, PDF, nombre de módulo/feature, ruta, ni material comercial (marca registrada de Functional Movement Systems). Nombre canónico **"Screening de Movimiento de Ingreso"**; ruta `/movimiento`; key de módulo `movement_assessment` (ya OK). En docs internos solo: "protocolo basado en literatura de tamizaje (Cook & Burton, IJSPT 2014)". Usar **nombres propios** de los 7 patrones (no reproducir tablas/ilustraciones/nomenclatura propietaria). **Disclaimer obligatorio** en reporte y PDF: "Tamizaje de priorización de trabajo correctivo; no es diagnóstico ni predice lesiones; no sustituye evaluación clínica."

7 patrones, score 0-3 c/u, compuesto **/21**, + clearing de dolor. `0`=dolor→derivar · `1`=no logra · `2`=compensa · `3`=limpio. Los patrones por-lado → **score = lado peor**; asimetría = bandera.

**7 patrones** (con `is_per_side`): sentadilla profunda (bilat), paso de valla (L/R), desplante en línea (L/R), movilidad de hombro (L/R + clearing), elevación activa de pierna (L/R), flexión de estabilidad de tronco (bilat + clearing), estabilidad rotatoria (L/R + clearing).

**Modelo:**
- `movement_assessments`: `id, client_id, coach_id, team_id, assessed_at, composite_score int (0-21), has_pain bool, has_asymmetry bool, risk_band text (low|moderate|high), consent_confirmed_at, notes`.
- `movement_assessment_items`: `id, assessment_id (cascade), pattern, is_per_side bool, score_left smallint, score_right smallint, score_single smallint, final_score smallint, pain bool, clearing_positive bool`. `UNIQUE(assessment_id, pattern)`.

**Cálculo (en `packages/calc/`, puro):**
- `final = (clearing_positive || pain) ? 0 : (is_per_side ? min(left,right) : single)`
- `composite = Σ final`
- **`has_asymmetry = ∃ item POR-LADO (is_per_side) con |left−right| ≥ 1`** ← (corrige bug: antes decía "bilateral", que daría siempre false)
- `risk_band`: high si `pain || composite ≤ 14`; moderate si `(15-16) || has_asymmetry`; low si `≥17 && !asym && !pain`.

**Golden tests:** [todos 3, sin dolor → 21, low]; [un test `pain=true` → final 0 de ese test, high]; [`clearing_positive` shoulder → final 0]; [L=3 R=1 paso de valla → final 1 y `has_asymmetry` true]; [composite 14 sin dolor → high]; [16 → moderate]; [17 sin asim/dolor → low]; [16 con asimetría → moderate].

**UX:** wizard 7 pasos (tablet, `h-dvh`), segmented 0/1/2/3, L/R lado a lado en por-lado, toggle clearing en hombro/tronco/rotatoria, total parcial /21. **Estado:** estado local por paso + autosave de borrador (restaurar al volver) + `useTransition` entre pasos + submit final `useActionState`. `loading.tsx` con skeleton. Reporte: semáforo + badges (dolor/asimetría) + tabla 7 patrones (lado bajo resaltado) + disclaimer. Evolución: línea del compuesto + **radar** de 7 patrones (inicial vs último) con `recharts`. Enlace a correctivos de la librería filtrados por patrón más bajo → precarga áreas "Movilidad"/"Activación".

**Export/print:** del reporte (semáforo+radar+asimetría) reusando `progress-print/page.tsx` y/o jsPDF — necesario para reemplazar de verdad el Excel del kine. Registrar en access log (`pdf_generate`).

**Toggle** `movement_assessment`. **Esfuerzo MVP:** 3-5 días.

---

## B. Composición corporal dual (BIA + ISAK)

Dos métodos **NO mezclables**. BIA (entrenador, InBody/Tanita/Omron) ≠ ISAK 5 componentes (nutri, pliegues). BIA sobreestima %grasa → **nunca graficar juntos**; comparar tendencias dentro del mismo método.

**Modelo (tabla genérica con discriminador):**
- `body_composition_measurements`: `id, client_id, coach_id, team_id, method text check (bia|isak), measured_at, weight_kg, height_cm, device_brand, device_model, metrics jsonb (payload por método, **Zod por method server-side antes de persistir**), raw_input jsonb (pliegues/perímetros/segmental crudos — sin identificadores innecesarios), measurement_conditions jsonb (BIA: ayuno/hidratación/hora), source text (manual|csv_import|api), consent_confirmed_at, notes`.

**`metrics` BIA:** skeletal_muscle_mass_kg, fat_mass_kg, body_fat_pct, fat_free_mass_kg, total_body_water/ICW/ECW, ecw_tbw_ratio, protein_kg, mineral_kg, **visceral_fat_area_cm2 (InBody) y/o visceral_fat_level (Tanita/Omron) = campos separados**, bmr_kcal, bmi, phase_angle_deg, segmental. BIA = **captura manual** (no cálculo) → solo validación de schema, sin golden test de cálculo.

**`metrics` ISAK (5 componentes Ross & Kerr):** adipose/muscle/bone/residual/skin (kg y %), sum_skinfolds_mm, equation_used, somatotipo (endo/meso/ecto).

**Cálculo ISAK — construir COMPLETO ahora** (decisión del usuario: dar todos los cálculos/features aunque sea trabajoso). 5 componentes Kerr + somatotipo Heath-Carter + %grasa, en `packages/calc/` (puro). Documentar en el SPEC la ecuación elegida (Kerr variante 5componentes; %grasa Yuhasz/Faulkner/Durnin-Womersley). **Validación en 2 capas:** (1) golden tests contra **casos resueltos publicados** (manuales ISAK) — se hace YA; (2) cuando Fran pase 3-5 fichas reales, confirmar paridad y marcar "validado". **Tolerancia:** masas <2%, %grasa ≤1.0 pp, somatotipo ≤0.3/eje. **NO exponer %grasa a un alumno real hasta validar contra fichas de Fran** (mostrar "preliminar" mientras tanto).

**UX:** pestañas separadas por método ("Bioimpedancia (entrenador)" / "Antropometría (nutri)"), serie temporal + delta vs anterior **del mismo método**, etiqueta visible método+dispositivo+fecha ("InBody 570 · 05 jun"). Peso puede coexistir; %grasa/masas no. Captura manual primero (`react-hook-form`+Zod, `useActionState`), import CSV InBody después (`source`). Extiende `ProgressBodyCompositionB6.tsx`. Export/print de la ficha de composición. `loading.tsx` skeleton.

**Toggle** `body_composition`. **Esfuerzo:** BIA manual 1,5-3 días; cálculo ISAK completo ~1-3 sem (se construye ya; validación de paridad cuando lleguen fichas de Fran).

---

## C. Nutrición por intercambios + PDF branded

**Aprovechar lo existente:** `food_swap_groups` (YA existe), `foods.category` (enum), `foods.org_id`, `nutrition-day-pdf.ts` (jsPDF), `nutrition-utils.ts`, `nutrition_plan_templates`, `recipes` (con `image_url`), offline-queue de nutrición.

**Método (guía real de Fran `@franallendel`):** 8 grupos; "1 porción de intercambio" = kcal/macros estándar; el alumno intercambia dentro del grupo. La nutri asigna **N porciones por grupo por comida**, con variantes por tipo de día.

**Grupos (nomenclatura de Fran) ↔ propuesta SMAE (CONFIRMAR con Fran):**

| Grupo Fran | Código | kcal | Prot | Líp | CHO |
|---|---|---|---|---|---|
| Carbohidratos/Cereales | C | 70 | 2 | 0 | 15 |
| Proteínas (bajo grasa) | P | 55 | 7 | 3 | 0 |
| Frutas | F | 60 | 0 | 0 | 15 |
| Verduras | V/VG | 25 | 2 | 0 | 4 |
| Lácteo | Lac | 95-150 (por % grasa) | 9 | 2-8 | 12 |
| Alimento rico en lípidos | ARL | 45 | 0 | 5 | 0 |
| Scoop proteína | SP | (según producto) | ~24 | ~1 | ~2 |
| Grasa de cocina | G | 45 | 0 | 5 | 0 |

> La guía de Fran (`PORCIONES DE INTERCAMBIO.pdf`) trae las **equivalencias alimento→porción** (medida casera + gramos, productos chilenos) = seed directo. Las kcal/macro por grupo NO vienen ahí → **bloqueante #1: confirmar con Fran** + set canónico de grupos + subgrupos por % grasa. Regla `legumbres = 1P + 1C` modelada como grupo compuesto.

**Modelo (aditivo, no rompe modo gramos):**
- `exchange_groups`: catálogo system + custom (coach/**team**), `ref_calories/protein_g/carbs_g/fats_g` (editables), `color`, `sort_order`, `slug`. **Frontera con `food_swap_groups` (decisión):** default = tablas distintas (swap_group = equivalencia visual en modo gramos; exchange_group = unidad de porción con macros de referencia); evaluar extender `food_swap_groups` con `ref_*` si conviene menos duplicación. Mapear la relación para no tener dos taxonomías.
- `foods.exchange_group_id` (FK nullable) + opcional `foods.exchange_portion_grams`. Migrar `category`→grupo donde sea claro; `category` queda display.
- `nutrition_plans.plan_mode text check (grams|exchanges) default 'grams'` (existentes quedan `grams`; templates de intercambios necesitan ownership de **team**).
- `meal_exchange_targets`: `meal_id, exchange_group_id, portions numeric`. Macros = derivados (Σ ref × porciones).

**UX coach:** toggle "gramos ↔ porciones"; steppers por grupo por comida con chips de color (`useOptimistic` para totales/macros vivos, debounce de persistencia); total diario por grupo vs objetivo. **UX alumno:** "2 Cereales · 1 Lácteo · 1 Fruta" → tap abre equivalencias para registrar (reusa offline-queue). `loading.tsx` skeleton.

**Pauta real de Fran (layout a clonar en PDF):** portada branded → objetivos → requerimientos (kcal + P/CHO/L g + periodo) → **variantes de día** (Descanso / Entreno AM / Entreno PM) → comidas por hora con códigos (`Desayuno 7:00 → 1C+3P`) + pre/post entreno + agua + nomenclatura. Visual = badges circulares de color por grupo.

**PDF (mata Canva):** firmar `downloadNutritionDayPdf` con `brand {primaryColor, logoUrl}` (del **team/coach**, NO EVA hardcodeado) → reemplazar la paleta fija. Multi-formato (radio selector): compacto / con equivalencias + **lista de compras auto** / completo con receta+imagen. Botón "Generar PDF" con estado pending (`useTransition`, el import jsPDF es async). **E2E debe verificar que usa branding del team/coach, NO EVA.** Registrar generación en access log.

**Toggle** `nutrition_exchanges`. **Esfuerzo:** 2-3 sem por fases (MVP visual 2-3 días). **Prioridad alta** (urgencia Avena — intercalar tan pronto Cimientos exponga pool+toggles).

---

## Storage de artefactos de salud (transversal A/B/C)

PDFs y fotos de salud en bucket Supabase Storage **privado** con RLS scoped a `is_team_member` (no public URL; signed URLs de corta expiración). Confirmar región (us-east-1) y cubrir Storage en la cláusula de subprocesadores/transferencia internacional. Retención alineada a política + inclusión en `api/cron/purge-data` al eliminar cuenta/alumno.

## Integraciones (marcar condicionadas)

- **InBody CSV** = fase 2 condicionada (consentimiento del titular; parsing best-effort por marca/modelo).
- **Medilink** = DIFERIDO/exploratorio, no comprometer en demo (sistema clínico; DPA + revisión Ley 20.584).

## Archivos clave

`supabase/migrations/*` · `packages/calc/{movement,anthropometry}.ts` (puro) · `services/{movement-assessment,anthropometry,nutrition-exchanges}.service.ts` · `infrastructure/db/*.repository.ts` · `app/c/[coach_slug]/{movimiento,composicion}/*` (nuevos) + vistas coach en `clients/[clientId]` · `ProgressBodyCompositionB6.tsx` · `app/coach/nutrition-plans/_components/PlanBuilder/*` · `lib/nutrition-day-pdf.ts` · `progress-print/page.tsx` (reuso export).

## Specs SDD

`specs/movement-assessment/` · `specs/body-composition-dual/` · `specs/nutrition-exchanges/` · `specs/nutrition-branded-pdf/`.

## Bloqueantes a pedir a Ani

kcal/macro por grupo + set canónico (incl. SP) · 3-5 fichas ISAK reales · 3-5 reportes bioimpedancia (marca/modelo, CSV?) · hoja real del screening del kine · ejemplo de pauta extra para validar layout PDF.

## Orden sugerido

1. SDD specs. 2. **Nutrición intercambios + PDF branded** (mayor valor + urgencia Avena): `exchange_groups` + seed Fran + `plan_mode` + steppers + PDF branded. 3. Screening de movimiento (diferenciador kine). 4. Composición dual (BIA manual + cálculo ISAK completo con golden tests de literatura; validar paridad al recibir fichas de Fran).

## Verification

- **Marca:** grep confirma que "FMS"/"Functional Movement Screen" no aparece en UI/PDF/rutas/keys.
- **Asimetría:** golden test confirma `has_asymmetry` sobre patrones por-lado (no bilaterales).
- **Consentimiento:** guardar movimiento/composición sin consentimiento activo falla server-side; queda en `team_access_logs`.
- **Composición:** medición BIA e ISAK del mismo alumno en pestañas separadas, sin mezclar %grasa. ISAK pasa golden tests de literatura; paridad <1-2% vs ficha real de Fran antes de exponer (mientras tanto, "preliminar").
- **Intercambios:** asignar porciones → macros derivados correctos → PDF con branding del **team** (no EVA) + lista de compras → alumno registra por equivalencias (offline).
- **Storage:** PDF/foto de salud no accesible por URL pública; signed URL solo a miembro del team.
- `pnpm typecheck`/`test`/`build` verdes (incluye golden tests movimiento/ISAK).

## Definition of Done

Nutrición con modo intercambios + PDF branded (reemplaza Excel+Canva de Fran); módulo de screening de movimiento con semáforo/evolución/export (marca propia, disclaimer); composición dual BIA+ISAK sin mezclar métodos; consentimiento + log de accesos respetados; Storage de salud privado; todos toggleables; seed de grupos/alimentos chilenos cargado.
