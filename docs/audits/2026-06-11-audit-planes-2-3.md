# Auditoria codigo vs Planes 2+3 (Movida) — 2026-06-11

> Auditoria multi-agente (workflow `audit-planes-2-3-movida`, 10 agentes: 5 auditores + 5 verificadores adversariales, 562 tool calls) que compara el codigo real del branch `feat/movida-platform` (hasta `e6ecf55`) contra los 4 paquetes SDD de Planes 2+3 y los claims de la bitacora del director. 100% estatica (Read/Grep/Glob + git readonly); no toco Supabase ni Playwright (regla de testing 2026-06-10).

## Veredicto global

La bitacora del director es **honesta**: el nucleo de los 4 modulos esta implementado de verdad, con evidencia file:line verificada por segundo agente adversarial. Vitest local: **676 pass / 4 skip** (claim exacto de la bitacora) + typecheck verde.

**Totales: 108 done · 18 partial · 19 missing · 35 pending-gate.**

`pending-gate` = el artefacto existe (SQL autorado, spec escrito) y solo falta correrlo contra la DB en el gate consolidado autorizado — consistente con la decision del dueno.

## Por paquete

| Paquete | done | partial | missing | gate | Estado del nucleo |
|---|---|---|---|---|---|
| movida-entrenamiento | 32 | 4 | 8 | 11 | ✅ builder polimorfico, cardio calc, timers, catalogo 3-vias |
| movida-screening | 24 | 5 | 2 | 6 | ✅ wizard 7 patrones, semaforo, bitacora AC9, calc + 18 goldens |
| movida-bodycomp | 25 | 2 | 5 | 7 | ✅ ISAK Kerr/Heath-Carter + goldens de literatura, UI BIA/ISAK dual |
| movida-intercambios | 17 | 5 | 4 | 11 | ✅ dominio→PDF punta a punta, 33 keys i18n, mustFix R1/R2 aplicados |
| wiring-director (claims) | 10 | 2 | 0 | 0 | ✅ NAV, kill-switch, MODULE_KEYS, links perfil, R1/R2 enterprise |

## Hallazgos accionables (no documentados como diferidos, o bugs latentes)

1. **BUG latente — env stale en movement service.** `services/assessment/movement-assessment.service.ts:61` duplicado local `isMovementModuleKilled()` lee `DISABLED_MODULES` (sin prefijo `EVA_`); con la var real del operador ese pre-check nunca dispara. Lo salva `assertModule→hasModule` central. → **Tanda 1**
2. **Ruta del alumno inalcanzable.** `/c/[slug]/movimiento` existe pero `ClientNav.tsx` no tiene entrada; el wiring `e6ecf55` cerro la nav del coach, no la del alumno. → **Tanda 1**
3. **DoD i18n violado en 2 de 4 namespaces.** `assessment.*` (73 keys) y `nutrition.exchange.*` (33) OK en es+en; `workout.cardio.*` y `bodycomp.*` = 0 keys (timers del alumno, labels de tipo y todo bodycomp hardcodeados es-neutro). → post-gate
4. **MuscleBalancePanel suma cardio.** `MuscleBalancePanel.tsx:21-27` acumula sets de TODOS los bloques sin filtrar `exercise_type`. → **Tanda 1**
5. **R3 "completo" exagerado en bitacora.** Sin renombre (solo `@deprecated`) y quedan 3 call sites de `createRawAdminClient`: `exercise-media.actions.ts:103,167` + `dashboard.actions.ts:28`. → **Tanda 1**
6. **Guard duplicado.** `services/bodycomp/body-composition.service.ts:63` copia privada de `getCoachClientScope` (canonico: `services/client/client-scope.service.ts`). → **Tanda 1**
7. **Violacion Clean Arch puntual.** `getCoachPdfBrand` en `nutrition-plans/_data/exchange.queries.ts:55-91`: 3 SELECTs directos a Supabase desde `_data`. → post-gate
8. **Kill-switch `EVA_DISABLED_MODULES` sin unit test** y sin doc en RUNBOOK / MANUAL_TASKS §MT-25 (solo CLAUDE.md). → post-gate
9. **Gap de cobertura:** el spec E2E de intercambios delega el assert de `pdf_generate` a la suite SQL, pero `tests/team/exchanges-isolation.sql` no lo contiene. → **Tanda 1**

## Missing aceptables (diferidos con justificacion en TASKS, sin sorpresa)

- F8 seed ejercicios Movida (CSV + script) — **bloqueado por insumos de Ani** (sesiones reales, HYROX; director §7).
- Reviews adversariales F4/F5 de entrenamiento — agendadas al cierre del plan.
- "Copiar al team" AC11 (E2E `test.fixme`) · filtro por tipo en catalogo UI · rename de variante sin UI · demo M1 · fases post-M1 (templates team, grupos custom) · InBody CSV · vista alumno de composicion · goldens con fichas reales de Fran (bloqueante externo) · baselines T0.1/T0.2 intercambios · EditedByBadge en reporte movement · registro de repos nuevos en `infrastructure/db/index.ts` · docs canonicas de arquitectura (nota: `docs/testing/TEST_STATUS.md` citado en CLAUDE.md **no existe**).

## Plan derivado

- **Tanda 1 pre-gate (2026-06-11, misma noche):** hallazgos 1, 2, 4, 5, 6 y 9 — fixes baratos que el gate no arregla. Workflow `tanda1-pre-gate-fixes` (6 agentes). Cierre: typecheck + vitest.
- **Gate consolidado (requiere OK explicito del dueno):** branch efimero → 7 migraciones `20260611*` + pre-check exercises → suites SQL authenticated → advisors → snapshot → merge → `db pull` + regen types → delete branch mismo dia → Playwright vs build prod → manual (area CUSTOM, enterprise R1/R2, modulos ON).
- **Post-gate:** hallazgos 3, 7, 8 + docs canonicas.

## Detalle completo

Los 37 hallazgos missing/partial con evidencia y nota de verificacion adversarial quedaron en el transcript del workflow (`wf_4ede40da-5a1`); este doc registra lo accionable.
