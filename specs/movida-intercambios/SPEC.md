# SPEC — Nutrición por intercambios + PDF branded (`nutrition_exchanges`)

**Status:** DRAFT (listo para implementación)
**Owner:** Juan V.
**Last updated:** 2026-06-11
**Related plan:** `docs/archive/movida/03-PLAN-evaluacion-nutricion.md` §C · Director: `docs/archive/movida/00-DIRECTOR.md`
**Módulo:** key `nutrition_exchanges` (ya declarada en `MODULE_KEYS`, `apps/web/src/services/entitlements.service.ts`)
**Milestone:** M1 "Diferenciador nutri" — mata el Canva de Fran (`@franallendel.nutri`)

> Estado: **greenfield sobre fundación lista**. Del lado DB ya existen `food_swap_groups`
> (equivalencia visual del modo gramos, NO se reusa como unidad de porción), `foods.category`,
> `foods.org_id`, y toda la fundación team (pool, `clients.team_id`, helpers RLS set-returning,
> `teams.enabled_modules`, marca white-label completa en `teams`). Del lado app ya existen el
> builder de nutrición (`app/coach/nutrition-plans/_components/PlanBuilder/`), la app del alumno
> (`app/c/[coach_slug]/nutrition/`), el PDF jsPDF (`lib/nutrition-day-pdf.ts`, branding EVA
> hardcodeado) y el gating `assertModule`. Nada del modo intercambios está construido.

---

## Problema / Por qué

Fran, la nutricionista de Movida, prescribe con el **método chileno de porciones de intercambio**:
asigna **N porciones por grupo de alimentos por comida** ("Desayuno 7:00 → 1C + 3P") y el alumno
elige equivalencias dentro de cada grupo. Hoy arma cada pauta **a mano en Canva** (portada con
marca, objetivos, requerimientos, variantes de día, comidas con códigos de colores) y la envía como
PDF. Eso significa: horas por pauta, cero trazabilidad en la app, y riesgo comercial concreto de
que contrate **Avena.io** por su cuenta (que ya ofrece equivalentes + PDF + lista de compras).

EVA tiene el módulo de nutrición por **gramos** (alimentos + cantidades + macros). El método de
Fran es por **porciones**: necesita un modo de plan distinto, un catálogo de grupos de intercambio
con macros de referencia, equivalencias alimento→porción con productos chilenos, y un **PDF con la
marca del TEAM (Movida)** que reemplace 1:1 su layout de Canva.

## Research 2026

Hallazgos verificados (búsquedas 2026-06-11) que fundamentan decisiones de este SPEC:

1. **El sistema chileno NO es el sistema ADA gringo.** Los listados de porciones de intercambio
   chilenos nacen del INTA (publicados 1999, descontinuados ~2007 sin reedición). La referencia
   moderna canónica es el **"Manual de Porciones de Intercambio para Chile" de la UDD** (1ª ed.
   mayo 2019, nueva versión sept 2021), hoy la herramienta de formación estándar de nutricionistas
   en Chile: grupos por aporte nutricional similar, gramajes + **medida casera** (taza 200 cc,
   vaso 180 cc, cucharada 10 cc, cucharadita 5 cc, plato extendido 22 cm). El seed de grupos y
   equivalencias debe hablar ese idioma (medida casera + gramos, alimentos chilenos), no el de
   "exchange lists" ADA. Fuentes: [Rev Chil Nutr / SciELO — Sistema de porciones de intercambio de
   alimentos en Chile y el mundo](https://www.scielo.cl/scielo.php?script=sci_arttext&pid=S0717-75182020000300484)
   · [UDD — nueva versión del Manual](https://www.udd.cl/noticias/2021/09/27/nutricion-y-dietetica-udd-presenta-nueva-version-de-manual-de-porciones-de-intercambio-para-chile/)
   · [PDF del Manual UDD](https://www.institutomedicinanatural.cl/wp-content/uploads/2022/08/MANUAL-DE-PORCIONES-DE-INTERCAMBIO-PARA-CHILE-UDD.pdf).
   **Implicación:** los grupos de Fran se modelan como catálogo propio con `ref_*` editables y se
   validan contra UDD/SMAE solo como referencia; la nomenclatura de Fran manda (bloqueante #1 del
   director §7).
2. **Avena.io (competidor directo, riesgo de churn de Fran):** menús con porciones y equivalentes,
   el alumno ve equivalencias y modifica ingredientes, **PDF imprimible para pacientes sin app** y
   lista de compras. Fuentes: [avena.io/producto](https://avena.io/producto/) ·
   [avena.io](https://avena.io/en-us/). **Implicación:** paridad mínima v1 = pauta por porciones +
   equivalencias + PDF + lista de compras; el diferenciador de EVA = **white-label real del team**
   (PDF y app con marca Movida) + pool plano multi-profesional.
3. **White-label de PDF es diferenciador real en 2026:** Nutrium NO ofrece white-label (todo sale
   con marca Nutrium); NutriAdmin permite logo/colores en PDF pero su portal mantiene marca propia.
   Fuentes: [comparativa dietitian software 2026](https://www.promealplan.com/en/blog/dietitian-meal-planning-software)
   · [NutriAdmin review 2026](https://www.promealplan.com/en/blog/nutriadmin-review-2026) ·
   [Nutrium vs NutriAdmin](https://www.promealplan.com/en/blog/nutrium-vs-nutriadmin).
4. **Generación de PDF en Next.js 2026:** jsPDF client-side ≈ 200-400 ms y 30-50 MB por documento;
   Puppeteer ≈ 1.5-2.5 s y 150-200 MB por instancia de browser, con fugas de memoria conocidas y
   Chromium en serverless = imágenes Docker grandes / layers en Lambda; react-pdf es el punto medio
   pero agrega dependencia nueva. Fuentes: [React PDF Generation in 2026](https://viprasol.com/blog/react-pdf-generation/)
   · [PDFKit vs Puppeteer vs jsPDF](https://reintech.io/blog/nodejs-pdf-generation-pdfkit-vs-puppeteer-vs-jspdf-comparison)
   · [JS PDF libraries guide](https://www.nutrient.io/blog/javascript-pdf-libraries/).
   **Decisión:** mantener **jsPDF client-side** (ya en el repo: `lib/nutrition-day-pdf.ts`, import
   dinámico async, nota legal "no envía el plan al servidor"; `PrintProgramDialog` usa print CSS y
   queda como precedente para export A4 del builder de entreno). Cero costo de servidor, cero
   Chromium en Vercel, privacidad por diseño. Se extiende con parámetros de marca por tenant.

## Alcance

- **Modo de plan "porciones/intercambios"** (`plan_mode = 'exchanges'`) coexistiendo con el modo
  gramos actual (`'grams'`, default, byte-identical para todo lo existente).
- **Catálogo `exchange_groups`**: 8 grupos system con la nomenclatura de Fran (C, P, F, V, LAC,
  ARL, SP, G) + grupo compuesto Legumbres (1P+1C) + grupos custom por coach o team. Macros de
  referencia (`ref_*`) editables; flag `macros_confirmed=false` hasta validar con Fran.
- **Equivalencias alimento→porción**: `foods.exchange_group_id` + `exchange_portion_grams` +
  `exchange_portion_label` (medida casera). Seed desde la guía real de Fran
  (`PORCIONES DE INTERCAMBIO.pdf`) con alimentos chilenos.
- **Builder del coach**: toggle gramos ↔ porciones por plan; steppers de porciones por grupo por
  comida con chips de color; macros derivados en vivo (Σ ref × porciones) vs objetivo diario.
- **App del alumno**: comidas como códigos ("2C · 1LAC · 1F"); tap en chip abre equivalencias del
  grupo (alimento + medida casera + gramos); registro de comida reusa el flujo de completado +
  offline-queue existente.
- **Variantes de día** (Descanso / Entreno AM / Entreno PM — presets editables): tabla aditiva +
  selector en builder + secciones en PDF. UI en fase propia (F6).
- **PDF branded multi-formato (mata Canva)**: generado por el COACH desde el builder (workflow de
  Fran: enviar por WhatsApp incluso a alumnos sin cuenta) y por el alumno desde su app. Formatos:
  compacto / con equivalencias + lista de compras / completo. Marca del **TENANT del contexto**
  (team Movida vía `/t`, org vía `/e`, coach standalone; free tier fuerza marca EVA) — nunca el
  branding EVA hardcodeado actual. Generación registrada en `team_access_logs` (`pdf_generate`)
  SOLO cuando la genera el COACH en contexto team; la descarga del alumno de su propia pauta no
  se registra (ver AC7).
- **Fix transversal de marca**: `downloadNutritionDayPdf` (PDF diario existente) recibe la marca
  del tenant — corrige la violación actual de white-label (EVA hardcodeado) para TODOS los planes,
  con o sin módulo.
- **Gating**: módulo `nutrition_exchanges` OFF por defecto; server-side `assertModule` en toda
  action/RSC del módulo; resolución por contexto del recurso (pool manda). Kill-switch de operador
  a nivel plataforma ANTES del entitlement (env `EVA_DISABLED_MODULES`).
- **Templates de pauta team-owned** (`nutrition_plan_templates.team_id`): compartidos dentro del
  pool (decisión 2.1 del director). Fase final, no bloquea M1.

## Fuera de alcance

- Registro por porción individual del alumno (log granular por grupo/alimento consumido): v1
  registra a nivel comida (flujo existente `nutrition_meal_logs.is_completed`).
- Unificar `food_swap_groups` con `exchange_groups` (decisión default del plan 03: tablas
  distintas; swap_group = equivalencia visual del modo gramos, exchange_group = unidad de porción
  con macros de referencia). Se documenta el mapping; consolidación = fase contract futura.
- Formato PDF "completo con receta + imagen" más allá de placeholder (depende de integrar
  `recipes` al modo porciones; v2).
- Subgrupos por % de grasa (lácteos descremado/semi/entero como filas separadas del seed sí; árbol
  de subgrupos en el modelo no — pendiente confirmación de Fran).
- Editor WYSIWYG del PDF / plantillas visuales alternativas (layout = clon del de Fran, fijo v1).
- Importación de pautas históricas de Canva.
- App Expo (el cálculo puro queda en `packages/calc/` para reuso futuro; UI mobile nativa fuera).

## User stories

1. Como **nutricionista del pool (Fran)**, quiero crear una pauta en modo porciones asignando
   N porciones por grupo a cada comida, para prescribir con mi método sin pelear con gramos.
2. Como **nutricionista**, quiero descargar la pauta como **PDF con la marca de Movida** (logo,
   color, nombre) en formato compacto o con equivalencias + lista de compras, para enviarla por
   WhatsApp y dejar de armar PDFs en Canva (incluso para alumnos que aún no tienen cuenta).
3. Como **nutricionista**, quiero variantes de día (Descanso / Entreno AM / Entreno PM) dentro de
   la misma pauta, para que el PDF y la app reflejen mi prescripción real.
4. Como **alumno del pool**, quiero ver mi comida como "2 Cereales · 1 Lácteo · 1 Fruta" y tocar
   un grupo para ver equivalencias (medida casera + gramos, alimentos chilenos), para elegir qué
   comer y marcar la comida como cumplida (también offline).
5. Como **coach de otro contexto** (standalone con módulo ON), quiero usar el mismo modo porciones
   con MI marca en el PDF, porque el módulo es revendible fuera de Movida.
6. Como **operador (CEO)**, quiero que el módulo esté OFF por defecto, activable por team/coach, y
   apagable globalmente sin migración, para controlar despliegue y soporte.

## Criterios de aceptación (AC)

- **AC1 — Cero regresión modo gramos:** con el módulo OFF (default), builder, app del alumno,
  PDF diario y tests existentes se comportan byte-identical a hoy. `plan_mode` default `'grams'`
  en todos los planes/templates existentes. Verificable: baselines F0 + suite vitest existente
  verde sin cambios.
- **AC2 — Gating server-side:** toda server action y RSC del módulo ejecuta
  `assertModule(db, 'nutrition_exchanges', ctx)` resuelto por el CONTEXTO del recurso (alumno de
  pool ⇒ `teams.enabled_modules`; standalone ⇒ `coaches.enabled_modules`); con el módulo OFF la
  action falla y la UI no ofrece el modo. El kill-switch de plataforma (env) apaga el módulo para
  todos ANTES del entitlement. Verificable: unit tests de `entitlements.service` + E2E de matriz
  de módulos en el gate.
- **AC3 — Macros derivados correctos:** asignar porciones a una comida muestra macros derivados
  Σ(porciones × ref del grupo) y el total diario vs objetivo; el grupo compuesto Legumbres expande
  a 1P+1C. Verificable: golden tests en `packages/calc/` (≥10 asserts, incluye redondeo y grupo
  compuesto) — los valores `ref_*` del seed quedan `macros_confirmed=false` y la UI los marca
  "referencial" hasta confirmar con Fran.
- **AC4 — PDF branded del tenant, NO EVA:** el PDF de pauta generado en contexto team sale con
  logo + color + nombre de Movida; en standalone con la marca del coach; free tier fuerza EVA;
  cabecera "EVA FITNESS" hardcodeada eliminada de la ruta con marca. El layout clona la pauta real
  de Fran: portada/encabezado branded → objetivos → requerimientos (kcal + P/CHO/L g) → variantes
  de día → comidas por horario con códigos de color → agua + nomenclatura de códigos. Verificable:
  unit test del threading de marca (params del PDF) + E2E del gate verifica marca del team en el
  flujo (y descarga exitosa) + checklist visual vs PDF real de Fran.
- **AC5 — Equivalencias y registro del alumno:** alumno de pool con módulo ON ve chips por grupo;
  el sheet de equivalencias lista alimentos del grupo con medida casera + gramos; marcar la comida
  funciona offline (queue existente). Con módulo OFF (o apagado posterior) la vista degrada a la
  descripción de la comida sin chips, sin romper. Verificable: E2E persona alumno-pool en el gate.
- **AC6 — Aislamiento y RLS:** grupos custom de un team no son visibles para otro team ni para
  coaches ajenos; `meal_exchange_targets` hereda el techo RLS de su plan (coach dueño, pool
  full-access vía helpers set-returning, alumno solo su plan). Policies sin `SECURITY DEFINER`
  per-row ni `EXISTS` correlacionado; `get_advisors` 0 críticos y `EXPLAIN ANALYZE` con
  `loops=1` en el branch. Verificable: suite SQL `tests/team/exchanges-isolation.sql` (corre en el
  gate autorizado).
- **AC7 — Acceso registrado (alcance: SOLO el coach en contexto team):** la generación de PDF
  por el COACH vía contexto team queda en `team_access_logs` con action `pdf_generate`,
  `actor_coach_id` = coach autenticado y metadata `{format, plan_id}`. La generación por el
  ALUMNO de su propia pauta NO se registra — decisión de diseño: (a) el titular accediendo a su
  propia data no constituye acceso de terceros a data de salud (la bitácora Ley 21.719 cubre
  accesos de profesionales del pool); (b) el esquema lo hace irrealizable de forma honesta:
  `team_access_logs.actor_coach_id` es `NOT NULL REFERENCES coaches(id)` y la policy
  `team_access_logs_member_insert` exige `actor_coach_id = auth.uid()` + miembro del team, y
  forzar el insert vía service-role con el coach del plan como actor falsearía la bitácora.
  Verificable: assert en suite SQL/E2E del gate — la descarga del coach en team SÍ deja fila; el
  flujo del alumno NO genera fila ni invoca la action de log. (Confirmación DPO en Open
  questions del PLAN.)
- **AC8 — i18n + mobile:** todo string nuevo usa `t()` con namespace `nutrition.exchange.*` en
  `es.json` Y `en.json` del mismo commit; steppers/sheets cumplen reglas mobile (`h-dvh`, `*-safe`,
  targets ≥44px). Verificable: grep de strings hardcodeados + revisión responsive.
- **AC9 — Calidad por tanda:** `pnpm typecheck` + `pnpm test` (vitest) verdes en cada fase;
  Playwright/SQL contra Supabase SOLO en el gate final autorizado (regla 2026-06-10).

## Riesgo

**MEDIO.**

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Tocar el flujo de nutrición del alumno (hot path diario, offline) | Regresión a usuarios reales | Modo `grams` intacto por default; F0 baselines; UI de intercambios solo aditiva detrás del entitlement |
| Macros `ref_*` provisorios (no confirmados por Fran) | Pauta con kcal erradas frente a un alumno real | `macros_confirmed=false` + badge "referencial" en UI/PDF; bloqueante #1 del director §7; editables sin migración |
| RLS de tablas nuevas ligadas a `nutrition_meals` (volumen alumno) | Repetir incidente 2026-06-09 | Reusar helpers existentes (`current_user_pool_meal_ids()` ya en prod); patrón `col IN (SELECT helper())`; EXPLAIN ANALYZE + advisors en branch antes de merge |
| Logo en jsPDF (CORS / formatos / dark logo sobre fondo claro) | PDF sin logo o ilegible | Fetch→dataURL con fallback a inicial+color (patrón favicon del layout); pedir logo alta resolución fondo claro (bloqueante Ani) |
| Layout PDF no convence a Fran (vs su Canva) | M1 no mata Canva | Clonar SU pauta real (ya en mano); pedir 1 pauta extra de validación (director §7); iterar formato compacto primero |
| Scope creep (variantes, lista de compras, templates) | M1 se atrasa frente a urgencia Avena | Fases: MVP visual (F2-F4) demo-able en 2-3 días; variantes/templates en fases posteriores |

## Bloqueantes a pedirle a Ani (extiende director §7, no duplica)

Ya listados en `00-DIRECTOR.md` §7 (vigentes para este módulo): **kcal/macros por grupo + set
canónico (incluye SP) + subgrupos por % grasa** · **ejemplo de pauta extra para validar layout
PDF** · **¿Fran ya evalúa Avena?** (urgencia). Nuevos de este SPEC (agregados también a §7):

- **Variantes de día canónicas de Fran**: ¿set fijo (Descanso / Entreno AM / Entreno PM) o libre
  por alumno? ¿una comida puede diferir solo en horario entre variantes?
- **Granularidad de porciones**: ¿se prescriben medias porciones (0.5) u otras fracciones? Define
  el step del stepper y el render de códigos ("1.5C").
- **Lista de compras**: ¿qué espera Fran que contenga? (¿agregado semanal por grupo con ejemplos,
  o lista por alimentos sugeridos?) ¿la usa hoy?
- **Scoop proteína (SP)**: macros dependen del producto — ¿valor genérico del team o override por
  alumno?
- **Logo Movida en alta resolución apto fondo claro** (PNG) para el encabezado del PDF.
- **¿Cuántas pautas son para personas SIN cuenta en la app?** (valida prioridad del flujo
  "coach descarga PDF y lo envía por WhatsApp" vs onboarding del alumno).
