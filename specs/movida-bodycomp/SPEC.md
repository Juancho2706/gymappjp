# SPEC — Composición corporal dual (BIA + ISAK 5 componentes)

**Status:** DRAFT (Plan 3 §B)
**Owner:** TBD
**Last updated:** 2026-06-11
**Related plan:** `docs/plans/movida/03-PLAN-evaluacion-nutricion.md` §B · Director `docs/plans/movida/00-DIRECTOR.md`
**Módulo (entitlement):** `body_composition` (ya declarado en `MODULE_KEYS`, `services/entitlements.service.ts`)

> Cubre SOLO §B del Plan 3 (composición corporal dual). El screening de movimiento (§A,
> `movement_assessment`) y nutrición por intercambios + PDF (§C, `nutrition_exchanges`) son specs
> separados. El reaprovechamiento de export/print y consentimiento se comparte, pero la captura y el
> cálculo de composición viven acá.

---

## Problema / Por qué

Hoy EVA solo registra **peso** del alumno (`check_ins.weight`) + fotos + energía, graficados en
`ProgressBodyCompositionB6.tsx` (recharts: serie de peso, IMC, gauge de energía, comparador de fotos,
timeline). No hay forma de capturar **composición corporal**, que es el corazón de la evaluación de
Movida y la pega diaria de dos roles distintos del pool:

1. **El entrenador** mide con **bioimpedancia (BIA)** — InBody / Tanita / Omron. Saca de la máquina
   masa muscular, % grasa, agua corporal, grasa visceral, segmental, etc. Hoy lo deja en Excel.
2. **La nutri (Fran)** mide con **antropometría ISAK** (pliegues + perímetros + diámetros con cáliper),
   y de ahí se obtiene **fraccionamiento de 5 componentes (Ross & Kerr)**, **somatotipo (Heath-Carter)**
   y **% grasa** por ecuación de pliegues. Hoy es Excel + 5componentes/Avena.

Estos dos métodos **NO son intercambiables**: la BIA sobreestima sistemáticamente el % grasa frente a
los pliegues, y mezclarlos en una misma curva produce conclusiones falsas. El producto debe capturar
ambos, calcular ISAK **completo** del lado del software (decisión locked del usuario: dar todos los
cálculos aunque sea trabajoso), y mostrarlos **en pestañas separadas** sin cruzar % grasa entre métodos.

El diferenciador comercial: la nutri obtiene fraccionamiento + somatotipo + % grasa **automáticos y
graficados** sin Excel, y el entrenador centraliza sus reportes de BIA en la misma ficha del alumno.

## Usuarios

- **Primario (captura):** entrenador del pool (BIA), nutri del pool (ISAK). Ambos son "coach" full-access
  en el modelo team (la especialidad es etiqueta de display, no restringe acceso — Director §2.1).
- **Primario (lectura):** cualquier coach del pool ve la evolución del alumno; coach standalone con el
  módulo ON ve la de sus propios alumnos.
- **Secundario:** el alumno ve su evolución **read-only** (diferido a fase posterior; ver Fuera de alcance).
- **Operador (EVA):** kill-switch de plataforma + observabilidad de errores de cálculo ISAK.

## Goals

1. Capturar mediciones **BIA** (captura manual de los campos del reporte de la máquina) y **ISAK**
   (pliegues/perímetros/diámetros crudos) en una tabla única con discriminador de método.
2. Calcular **ISAK completo** en código puro y testeable: fraccionamiento **5 componentes Kerr**,
   **somatotipo Heath-Carter**, y **% grasa** por ecuación seleccionable según población.
3. Visualizar la evolución por método **sin mezclar** (pestaña BIA vs pestaña ISAK), con delta vs medición
   anterior **del mismo método** y etiqueta visible método+dispositivo+fecha.
4. Gatear el módulo **server-side** (`assertModule('body_composition', …)`) por contexto del recurso
   (team manda; si no, coach), respetando consentimiento de datos de salud y bitácora de accesos.
5. Validar los cálculos en **dos capas**: golden tests contra casos publicados (ahora) + paridad <1-2%
   contra fichas reales de Fran (cuando lleguen); no exponer % grasa "validado" a un alumno real antes.

## Non-Goals (Fuera de alcance)

- **Import CSV de InBody / API de báscula** — fase 2 condicionada (`source='csv_import'` ya modelado en el
  schema; el parser best-effort por marca/modelo se difiere). v1 = captura manual.
- **Vista del alumno** (`/c/[coach_slug]/composicion` read-only) — el plan la menciona; v1 entrega la captura
  y la vista del **coach**. La superficie del alumno se difiere a una fase posterior (gate extra: no mostrar
  % grasa ISAK hasta `is_validated`).
- **Screening de movimiento** (§A) y **nutrición intercambios/PDF** (§C) — specs separados.
- **Cambiar `check_ins`** — el peso sigue viviendo en `check_ins`; este módulo NO migra ni rompe esa tabla.
- **DEXA / pletismografía / otros métodos** — solo `bia` e `isak` en v1 (el CHECK del discriminador es
  expand-contract: agregar un método nuevo es aditivo).
- **Medilink / sistemas clínicos** — diferido (Director).

## User Stories

1. Como **entrenador del pool**, quiero registrar la lectura de mi InBody/Tanita (masa muscular, % grasa,
   grasa visceral, agua, segmental) en la ficha del alumno, para no depender de Excel y que la nutri vea el
   contexto sin mezclar métodos.
2. Como **nutri del pool**, quiero ingresar los pliegues/perímetros/diámetros ISAK y que el sistema calcule
   solo el **fraccionamiento de 5 componentes**, el **somatotipo** y el **% grasa**, para entregar la ficha
   sin recalcular en Excel.
3. Como **nutri**, quiero **elegir la ecuación de % grasa** apropiada a la población (general vs atleta),
   porque las ecuaciones tienen sesgo distinto según el sujeto.
4. Como **coach del pool**, quiero ver la **evolución por método en pestañas separadas** con delta vs la
   medición anterior del mismo método y la etiqueta "InBody 570 · 05 jun", para leer tendencia sin confundir.
5. Como **operador EVA**, quiero que el cálculo ISAK esté validado contra literatura y que el módulo no se
   pueda usar si el flag de plataforma lo apaga, para no exponer un % grasa equivocado.
6. Como **DPO**, quiero que ninguna medición de salud se guarde sin consentimiento activo y que todo acceso
   quede en `team_access_logs`, para cumplir la Ley 21.719.

## Acceptance Criteria

- [ ] **AC1 — Captura BIA:** un coach con `body_composition` ON registra una medición `method='bia'` con los
  campos del reporte (masa muscular esquelética, masa grasa, % grasa, agua total/ICW/ECW, ecw_tbw_ratio,
  grasa visceral **área cm² (InBody) y/o nivel (Tanita/Omron) como campos separados**, BMR, ángulo de fase,
  segmental, dispositivo). La BIA es **captura, no cálculo** → solo validación de schema, sin golden de cálculo.
- [ ] **AC2 — Captura + cálculo ISAK:** una medición `method='isak'` con pliegues/perímetros/diámetros crudos
  produce, vía código puro, **5 masas Kerr (kg y %)**, **somatotipo (endo/meso/ecto)** y **% grasa** según la
  ecuación elegida; los crudos quedan en `raw_input` y los derivados en `metrics`.
- [ ] **AC3 — Golden tests de literatura (verde local):** Kerr, Heath-Carter y las ecuaciones de % grasa pasan
  golden tests contra **casos resueltos publicados** con tolerancia: masas <2 %, % grasa ≤1.0 pp,
  somatotipo ≤0.3 por eje. Corren en Vitest **sin** Supabase/Next.
- [ ] **AC4 — Métodos no se mezclan:** la UI muestra BIA e ISAK en pestañas separadas; las series de % grasa /
  masas nunca combinan métodos en una misma curva; el peso sí puede coexistir.
- [ ] **AC5 — Gating server-side (entitlement + suspensión de team):** toda action/RSC del módulo llama
  `assertModule(db, 'body_composition', ctx)` con `ctx` derivado del **workspace activo** (team ⇒ teamId; standalone ⇒
  coachId); sin el módulo ON, la action falla server-side (no solo se oculta la UI). Un team con `teams.suspended_at`
  no resuelve workspace, por lo que el módulo queda apagado para ese tenant. Estos dos leveres cubren el apagado
  **per-tenant** y **per-workspace** en v1.
- [ ] **AC5b — Kill-switch de plataforma (operador EVA):** el guard del módulo (`assertBodyCompositionEnabled()`)
  consulta el flag `body_composition_kill_switch` en **Vercel Edge Config** (espeja `free_tier_kill_switch` de
  `proxy.ts`) **antes** del entitlement; con el flag en `true`, toda action/RSC del módulo falla server-side para
  **todos** los tenants sin deploy. Es el lever exigido por el Director §3 para este módulo de riesgo (un % grasa mal
  calculado expuesto a todos los teams). Default ausente = habilitado.
- [ ] **AC6 — Consentimiento + bitácora:** en contexto team, guardar/leer una medición sin consentimiento de
  salud activo falla server-side; cada operación queda en `team_access_logs` (`resource='body_composition'`).
- [ ] **AC7 — "Preliminar" hasta validar:** mientras `is_validated=false` para el set de cálculo ISAK, el % grasa
  se muestra etiquetado **"preliminar"** y NO se expone en una eventual superficie del alumno.
- [ ] **AC8 — Aislamiento (RLS):** team A no ve mediciones de team B; un coach standalone no ve mediciones de
  pool; las policies usan **helpers set-returning + `col IN (SELECT helper())`** (sin SECURITY DEFINER por-fila
  ni EXISTS correlacionado), `(select auth.uid())`, FKs indexadas; `get_advisors` 0 críticos.
- [ ] **AC9 — Mobile/responsive:** captura y gráficas usan `h-dvh`/`*-safe` fuera de `md:`; cáliper/segmental en
  tablet; dark mode en todos los componentes nuevos.
- [ ] **AC10 — Verdes:** `pnpm typecheck` + `pnpm test` (incluye golden ISAK) + `pnpm build`. RLS/aislamiento se
  corre en el **gate E2E autorizado** (regla 2026-06-10), no por tanda.

## Research 2026 (fuentes)

Hallazgos que fundamentan las decisiones de fórmula y de campos. Detalle de implementación numérica en el PLAN.

- **Fraccionamiento 5 componentes = Ross & Kerr (phantom).** El modelo de 5 componentes de **Kerr & App**
  (validado vía cadáveres) es hoy "el método más preciso y exacto para el fraccionamiento de la masa
  corporal"; fracciona **adiposo / muscular / óseo / residual / piel** en kg y %. Usa la estrategia
  **Phantom Z-score** (cada medida se ajusta por talla con exponente dimensional y se compara contra la media
  y desviación del "phantom" de referencia) y, a diferencia de las ecuaciones de % grasa, **incorpora la
  talla** en el análisis de adiposidad y estima el tejido adiposo anatómico completo (no solo lípido). Es el
  estándar contemporáneo en ciencias del deporte (estudios recientes de fútbol/combate). → Decisión: ISAK
  "completo" = **Kerr (5 comp.) + Heath-Carter (somatotipo) + % grasa por pliegues**.
  Fuentes: Kerr & App (Semantic Scholar / SFU Summit); IJOK 2024; MDPI Appl. Sci. 2022; SciELO IJMorphol 2025.
- **% grasa: Durnin-Womersley vs Jackson-Pollock vs atletas.** Revisión sistemática (Curr. Obes. Rep. 2022):
  ambas clásicas **siguen siendo válidas** en adultos, pero **Durnin-Womersley** tiene sesgo medio **−2 %** vs
  **Jackson-Pollock −6.6 %**, y ambas **subestiman en sujetos grandes**; fueron desarrolladas en poblaciones
  caucásicas/occidentales → se recomienda **validación poblacional** (no ideales para mezcla latinoamericana).
  Para **atletas**, ecuaciones como **Yuhasz** (6 pliegues, lineal, sin paso de densidad ni edad) y **Faulkner**
  correlacionan muy alto con DXA. → Decisión: ofrecer **set seleccionable** — **Durnin-Womersley** (default
  población general adulta: 4 pliegues → densidad log10 → Siri), **Yuhasz/Faulkner** (sub-población atlética).
  La ecuación queda guardada en `equation_used`. **Bloqueante:** confirmar con Fran cuál usa hoy.
  Fuentes: PMC9729144 (Curr. Obes. Rep. 2022); PMC2891061 (Jackson-Pollock en obesos); MDPI Appl. Sci. 2022.
- **Somatotipo Heath-Carter (ecuaciones antropométricas).** 10 medidas → endomorfia / mesomorfia / ectomorfia.
  Endomorfia = `−0.7182 + 0.1451·X − 0.00068·X² + 0.0000014·X³` con `X = Σ(tríceps+subescapular+supraespinal)·
  (170.18/talla)`; mesomorfia desde diámetros (húmero/fémur), perímetros corregidos (brazo/pantorrilla) y talla;
  ectomorfia desde la razón altura/peso (HWR) con sus tramos. → Decisión: implementar Heath-Carter (1990) tal
  cual; golden test contra los ejemplos del manual.
  Fuentes: Heath-Carter Instruction Manual (PDF); ExploreAnthro 2024; TopEndSports calculator; PMC12337254 (2024).
- **Campos de export BIA consumer (InBody/Tanita/Omron).** El **InBody 570** reporta: peso, agua total (TBW),
  ICW/ECW + **ECW/TBW**, masa magra seca, masa grasa, **masa muscular esquelética (SMM)**, **% grasa**, análisis
  **segmental** (magro y grasa por segmento), **nivel de grasa visceral**, BMR, índice de músculo esquelético,
  ángulo de fase, InBody Score; export vía **LookinBody Web** / app. Ojo: los equipos **médicos** dan **grasa
  visceral en área (cm²)** mientras **consumer (Tanita/Omron, e InBody básicos)** dan **nivel** (escala) → se
  modelan **campos separados** `visceral_fat_area_cm2` y `visceral_fat_level`. → Decisión: `metrics` BIA es un
  superset opcional; la captura manual muestra solo los campos del dispositivo elegido.
  Fuentes: InBody 570 spec sheet (lenexa.com PDF); InBody USA result-sheet interpretation; Professional's Guide
  to the InBody Result Sheet (UK PDF).
- **Apps de antropometría para nutricionistas.** El flujo ISAK estándar para nutris = **perfil restringido**
  (talla, masa, **8 pliegues**, **5 perímetros**, **2 diámetros**) → somatotipo + composición; calculadoras
  existentes (AnthroMetrix Yuhasz, NutriActiva, TopEndSports) confirman los inputs y outputs esperados. → Decisión:
  el formulario de captura ISAK sigue el **perfil restringido ISAK** (confirmar nivel exacto con Fran).
  Fuentes: ISAK Level 1 (Northumbria/Bournemouth/HAN); AnthroMetrix; NutriActiva; TopEndSports.

## Risks

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Constantes del phantom Kerr** mal transcritas (medias/SD/exponentes) → masas erróneas | ALTO (dato de salud equivocado) | Constantes en un único módulo `domain/bodycomp/phantom.ts` con cita de fuente; golden test contra caso publicado byte-cercano; `is_validated=false` + label "preliminar" hasta paridad con ficha de Fran |
| Mezclar % grasa BIA vs ISAK en una curva | MEDIO (conclusión clínica falsa) | Pestañas separadas a nivel de datos y UI; series filtradas por `method`; test de que no hay dataset combinado |
| Ecuación de % grasa inadecuada para población chilena | MEDIO | Ecuación **seleccionable** + `equation_used` persistido + label población; bloqueante a Fran |
| RLS por-fila en tabla con volumen creciente (incidente 2026-06-09) | ALTO (caída prod) | Helpers set-returning + `col IN (SELECT helper())`, `(select auth.uid())`, EXPLAIN ANALYZE loops=1, advisors 0 `auth_rls_initplan` antes de aplicar |
| Guardar dato de salud sin consentimiento | ALTO (legal) | Gate server-side de consentimiento en contexto team + bitácora `team_access_logs`; sin consentimiento → no persiste |
| `metrics`/`raw_input` jsonb sin forma → basura no validada | MEDIO | **Zod por método server-side ANTES de persistir** (`packages/schemas/bodycomp.ts`); rechaza payload desconocido |
| Exponer % grasa "preliminar" como definitivo al alumno | MEDIO (confianza) | Vista de alumno diferida; gate `is_validated`; label "preliminar" en la vista del coach |

## Open Questions

Ver **Bloqueantes a pedir a Ani / Fran** (abajo) — no se decide producto sin esos datos. Preguntas técnicas
internas resolubles sin Movida:

- [ ] ¿% grasa default = Durnin-Womersley para población general? (decisión técnica recomendada; confirmar con Fran).
- [ ] ¿La vista del alumno entra en v1 o se difiere? (recomendado **diferir** — ver Non-Goals).
- [ ] ¿Adjuntar PDF/foto del reporte BIA al bucket `team-health-docs` en v1 o fase 2? (recomendado: opcional v1).

## Bloqueantes a pedir a Ani / Fran (extiende Director §7 y Plan 03 — no duplica)

> Plan 03 ya pide: *"3-5 fichas ISAK reales (ecuación/pliegues) + 3-5 reportes bioimpedancia (marca/modelo,
> export CSV?)"*. Acá se **detalla y extiende** lo específico de composición:

> **NO es bloqueante externo:** las **constantes del phantom (Ross & Kerr)** — medias `P`, desviaciones `s` y
> exponentes dimensionales `d` de cada variable del modelo de 5 componentes — **no** las posee Movida (ni Fran ni
> Ani): están en la **literatura publicada** (Ross & Kerr 1988; tabla/manual original, reproducidas en material
> ISAK). Por eso son **tarea de research del implementador con cita de fuente** (ver T1.2), NO una pregunta a
> Movida. Lo que sí depende de Fran es la **paridad con fichas reales** para marcar `is_validated` (último bullet).

- **Ecuación de % grasa que usa Fran hoy** (Durnin-Womersley / Yuhasz / Faulkner / otra) y para qué población
  (general vs atletas) → define el default y el set seleccionable.
- **Nivel de perfil ISAK** que toma Fran (restringido vs completo): qué **8 pliegues**, qué **5 perímetros**,
  qué **2 diámetros** exactos → define los campos del formulario `raw_input`.
- **Inventario de equipos BIA del centro** (¿InBody? ¿modelo? ¿Tanita/Omron?) → define si `visceral_fat` es
  **área (cm²)** o **nivel**, qué campos segmental existen, y si hay export CSV para fase 2.
- **3-5 fichas ISAK reales resueltas** (input crudo + output que Fran considera correcto) → set de **golden de
  paridad** para marcar `is_validated`.
- **¿El alumno debe ver su % grasa / composición?** (decisión de producto + legal) → habilita o no la vista de
  alumno y el gate `is_validated`.
