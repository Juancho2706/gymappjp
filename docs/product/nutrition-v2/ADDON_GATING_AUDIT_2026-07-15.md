# Auditoria: gating del addon "Nutricion Pro" en Nutricion V2

**Fecha:** 2026-07-15 | **Autor:** CLI | **Estado:** informe, sin cambios de codigo.

## TL;DR

El addon de pago `nutrition_exchanges` (comercialmente **"Nutricion Pro"**) **no esta cableado en Nutricion V2**. V2 solo consulta el flag canary de rollout (`isNutritionV2Enabled` / `resolveNutritionV2RolloutDecision`). Ninguna superficie V2 llama a `assertModule('nutrition_exchanges', ...)`. Hoy no hay riesgo real porque el canary es un allowlist de ids (efectivamente solo `josefit`), pero al ampliar el canary un coach **sin** el addon publicaria planes con capacidades profesionales (strategy estructurada, `protocol_notes`, `private_notes`, metas clinicas) gratis.

---

## 1. Como gatea V1 hoy (patron canonico)

Motor de entitlements: `apps/web/src/services/entitlements.service.ts`
- `MODULE_KEYS` (L19-24): `cardio | movement_assessment | body_composition | nutrition_exchanges`.
- `hasModule(db, key, ctx)` (L69-82) y `assertModule(db, key, ctx)` (L85-93): guard que lanza `Error("Modulo no habilitado: ...")`.
- Resolucion por **contexto del recurso** (LOCKED): pool/team => `teams.enabled_modules`; standalone => `coaches.enabled_modules`. Default OFF. Kill-switch de operador `EVA_DISABLED_MODULES` por encima.

Copy comercial: `packages/module-catalog/catalog.ts` L81-94: `nutrition_exchanges` = **"Nutricion Pro"**, pitch = intercambios, plantillas, micronutrientes avanzados, objetivos por composicion.

Gating real V1 (todos server-side, patron `assertModule` al tope de la action/servicio):
- **Servicio Pro** `apps/web/src/services/nutrition-exchanges/nutrition-exchanges.service.ts`: `assertExchangesModuleForPlan` (L65-70) por-plan; `hasExchangesModuleForClientContext` (L73-84) fail-closed para el alumno. `moduleCtxForPlan` (L56-62) implementa "pool manda". Vista alumno `getStudentExchangeBundle` (L346-410) devuelve `EMPTY_BUNDLE` si el modulo esta OFF (L373).
- **Recetas estructuradas** `apps/web/src/app/coach/nutrition-plans/_actions/recipes.actions.ts`: `saveStructuredRecipeAction` (L152) y `getStructuredRecipeAction` (L192) => `assertModule('nutrition_exchanges', ...)`. Las "ideas" (texto libre) NO gatean (Base).
- **Guidance/protocolo/objetivos** `apps/web/src/app/coach/nutrition-plans/_actions/guidance.actions.ts`: `requireNutritionPro()` (L34-43) => `assertModule('nutrition_exchanges', ...)` en get y update de `protocol_notes` + metas.
- **Modo intercambios / variantes de dia / metas por comida** `.../nutrition-plans/_actions/exchange.actions.ts`. "Nutricion Pro es por-alumno": el gate exige `mode='client-plan'`; editar la plantilla no lo muestra (no es bug).

**Regla de oro V1:** cada action Pro re-verifica el entitlement server-side; la UI solo espeja para mostrar/ocultar.

## 2. Inventario V2 - cada superficie chequea entitlement? (spoiler: no)

| # | Superficie / capacidad | Archivo:linea | entitlement hoy? | RLS |
|---|---|---|---|---|
| 1 | Hub coach (RSC) | `app/coach/nutrition-v2/page.tsx:36` | NO, solo `isNutritionV2Enabled(webCoach)` | - |
| 2 | Ficha alumno V2 (RSC) | `app/coach/nutrition-v2/[clientId]/page.tsx:36` | NO, solo rollout | - |
| 3 | Builder (RSC) | `app/coach/nutrition-v2/[clientId]/builder/page.tsx:27` | NO, solo rollout | - |
| 4 | **Publicar plan** (`publishPlanAction`) escribe `strategy`, `visible_notes`, **`private_notes`**, **`protocol_notes`**, variantes/franjas/items | `.../builder/_actions/builder.actions.ts:88,180,251-263` | NO, `authorizeCoach` solo rollout+scope | RLS coach-scoped (`nutrition_v2_can_manage_client`), **no** por-addon |
| 5 | Buscar catalogo (builder) | `.../builder/_actions/builder.actions.ts:342` | NO, rollout | RPC DEFINER token-scoped |
| 6 | Crear alimento coach | `.../builder/_actions/builder.actions.ts:388` | NO, rollout | `foods_insert_own` |
| 7 | Catalogo hub coach | `app/coach/nutrition-v2/_actions/food-catalog.actions.ts:57` | NO, rollout | RPC DEFINER |
| 8 | Intake alumno (record/correct/void/closeDay/search) | `app/c/[coach_slug]/nutrition-v2/_actions/intake.actions.ts:104` | NO, solo `isNutritionV2Enabled(webStudent)` | RPC DEFINER + `client=auth.uid()` |
| 9 | Gateway movil (coach+alumno) | `app/api/mobile/nutrition-v2/{coach,intake,read,catalog}/route.ts` via `_shared.ts:96` | NO, solo `resolveNutritionV2RolloutDecision` | RPC DEFINER scoped |
| 10 | Notas privadas profesionales | tabla `nutrition_plan_private_notes_v2` (mig. `20260714191500`) | NO, ninguna gate app-level la escribe aun; se persiste via `publishPlanAction` `private_notes` | RLS `nutrition_v2_private_note_scope_matches` => ownership, **no** addon |
| 11 | `protocol_notes` en version | `nutrition_plan_versions_v2` (misma migracion, GRANT UPDATE L102-113) | NO | RLS ownership |

**Confirmado por grep:** cero ocurrencias de `assertModule` / `nutrition_exchanges` / `enabled_modules` / `hasModule` en todo `app/coach/nutrition-v2`, `app/c/[coach_slug]/nutrition-v2` y `app/api/mobile/nutrition-v2`. El unico gate es el rollout canary.

## 3. Propuesta de frontera Base / Pro ("Pro = herramientas de nutricionista profesional")

**BASE (gratis, incluido en todo plan):**
- Plan simple / macros por gramos (`strategy='flexible'`): reemplazo directo de la nutricion gratis actual.
- Registro de consumo del alumno + cierre de dia + snapshots (#8, #9 intake): el alumno nunca debe pagar por registrar.
- Catalogo local + busqueda + scanner + crear alimento propio (#5, #6, #7): herramienta de captura, no diferenciador clinico.
- Ficha de alimento / lectura del plan.
- `visible_notes` (notas que el alumno ve): comunicacion basica coach-alumno.

**PRO (addon `nutrition_exchanges`):**
- `strategy='structured'` y `'hybrid'` (prescripcion por franjas/variantes de dia): equivalente V2 del "modo intercambios" que V1 ya gatea. *(es el metodo del nutricionista)*
- `protocol_notes` (protocolo longitudinal): paridad directa con `guidance.actions` Pro de V1.
- `private_notes` / `nutrition_plan_private_notes_v2` (notas clinicas no visibles al alumno): herramienta profesional pura.
- Metas/objetivos clinicos avanzados (hidratacion, ayuno, sueno, suplementacion, objetivos por composicion): paridad con `guidance.actions`.
- Recetas estructuradas V2 (cuando existan; hoy la V1 `recipe_mode='structured'` ya es Pro) + micronutrientes avanzados + historial clinico/versionado visible.

**Dudosas => decision CEO:**
- **Variantes de dia** (`nutrition_day_variants_v2`): en V1 son Pro (parte de intercambios). Base con 1 variante y Pro multiples, o todo-Pro? *(recomiendo multi-variante = Pro).*
- **`strategy='hybrid'`**: cuenta como structured (Pro) o transicion Base? *(recomiendo Pro).*
- **`visible_notes`**: propuesto Base; si se quiere como diferenciador, mover a Pro.
- **Historial de versiones para el alumno**: Base ve solo version vigente y Pro habilita historico? Definir.

## 4. Puntos de cableado (siguiendo el patron V1 `assertModule`)

Regla: resolver `ctx` desde el workspace (team => `teamId`, si no `coachId`) y llamar `assertModule(db, 'nutrition_exchanges', ctx)` **server-side**, fail-closed, DESPUES de `isNutritionV2Enabled` y antes de escribir.

- **P1 - `publishPlanAction`** (`builder.actions.ts`, en `authorizeCoach` o antes del insert de version L249): si `draft.strategy !== 'flexible'` **o** `draft.privateNotes` **o** `draft.protocolNotes` no vacios => `assertModule('nutrition_exchanges', {coachId, teamId})`. EL punto critico: hoy un draft Pro se publica sin check. `authorizeCoach` (L78-106) ya calcula `teamId`/`orgId`.
- **P2 - read builder/ficha** (`page.tsx` #2, #3): pasar flag `nutritionProEnabled` al cliente para mostrar/ocultar campos Pro (espejo UI, no es el gate real).
- **P3 - notas privadas**: cuando exista action dedicada de `private_notes` (hoy embebidas en publish), gatear ahi. La RLS actual (`nutrition_v2_private_note_scope_matches` => ownership) NO chequea addon; gate en DB requeriria **migracion** que consulte `enabled_modules` en policy/trigger. App-level basta si toda escritura pasa por P1.
- **P4 - gateway movil** (`_shared.ts:96`): `gateNutritionV2Api` ya resuelve `coachId/teamId/orgId`; agregar `assertModule` por-ruta para escrituras Pro (coach). Lecturas del alumno solo devuelven campos Pro si el plan se publico con addon (se hereda de P1).
- **P5 - vista alumno**: sin gate propio si P1 impide crear data Pro sin addon; el alumno solo lee lo que su coach pudo publicar.

**Migracion necesaria?** No para la frontera app-level (P1 cierra el vector de escritura). Opcional para defensa-en-profundidad en DB de `private_notes`/`protocol_notes` (P3): seria aditiva y debe respetar el patron column-grants (no rompe `check:nutrition-v2-boundaries`).

## 5. Riesgo actual

- **Puede un coach SIN addon usar algo Pro via V2 hoy?** Tecnicamente **si**: si el coach entra al canary (id en `coachIds`/`teamIds`/`clientIds` con `webCoach=true`), `publishPlanAction` publica `strategy='structured'`, `protocol_notes` y `private_notes` **sin ningun** `assertModule`. Ninguna capa (app ni RLS) verifica `enabled_modules`.
- **Riesgo real hoy: bajo/teorico.** El canary es un allowlist explicito de ids (hoy efectivamente solo `josefit`, cuenta comp Pro). Nadie fuera del allowlist alcanza las superficies V2.
- **Se vuelve real al escalar el rollout** (mode `on` global o canary amplio) antes de cablear P1. Recomendacion: **cablear P1 antes de cualquier expansion del canary mas alla de cuentas comp/QA**, y tratar la frontera Base/Pro (seccion 3) como Definition of Done de V2, no como follow-up.

---

## DECISIONES DEL CEO (2026-07-15, tarde)

**Frontera cableada en esta ola:**
- BASE: estrategias `structured` y `flexible`, UNA variante de día, `visible_notes`, registro alumno, catálogo/scanner/ficha, historial coach ≤30 días.
- PRO (`nutrition_exchanges`): estrategia `hybrid`, >1 variante de día, `private_notes`, `protocol_notes`, histórico clínico completo (>30 días).

**Roadmap del addon (post-cierre V2, por olas):**
1. Calculadora de requerimiento energético (Mifflin-St Jeor / Harris-Benedict / Katch-McArdle + factor de actividad + objetivo → setea metas del plan) + distribución % de macros por franja. Esfuerzo bajo.
2. Antropometría + % graso (pliegues/perímetros → Durnin-Womersley / Jackson-Pollock, gráficos de evolución). Esfuerzo medio.

Descartados por ahora: PDF brandeado del plan, generador automático de menú, recall 24h, FFQ, SOAP, labs (re-evaluar tras adopción). Análisis micros vs RDI: bloqueado por cobertura de micros del catálogo.
Investigación de mercado: Nutrium, Healthie, Practice Better, NutriAdmin, That Clean Life, Foodzilla, DietMaster, Dietbox, Nutrimind (informe en la sesión 2026-07-15).
