# Ola 4A — Ranking de unidades por severidad del delta

> Severidad = cuánta diferencia observable real hay hoy entre RN y la web V2 responsive.
> Restricción dura: 4A-02, 4A-03, 4A-04, 4A-05 y 4A-06 editan TODAS
> `app/alumno/nutrition-v2/index.tsx` → jamás en la misma wave. 4A-01 mueve archivos → wave propia inicial.

| # | Unidad | Severidad | Por qué | Archivos RN |
|---|--------|-----------|---------|-------------|
| 1 | **4A-01 Ruteo/chrome** | **P0** | El tab Nutrición RN abre V1 aunque V2 esté activo para todos desde 2026-07-18; V2 vive fuera de `(tabs)` sin cápsula; dominio OFF no gatea la pantalla V2 | `(tabs)/nutricion.tsx`, `(tabs)/_layout.tsx`, mover `alumno/nutrition-v2/*` |
| 2 | **4A-02 Hoy estructura** | **P1 alto** | Estructura del Hoy divergente (consumido por franja vs sección única, sin "Tu plan de hoy", sin estado "Registrado", CTAs distintos, sin lag banner, sin chip "Día registrado", sin empty sin-plan web) | `nutrition-v2/index.tsx` (TodayTab) |
| 3 | **4A-11 Scanner** | **P1 alto** | Registro sin cantidad/franja (flujo P0 que web ya arregló), reporte de faltante con bug de idempotencia que web corrigió, copys/estados | `nutrition-v2/scanner.tsx` |
| 4 | **4A-10 Registro/buscador** | **P1 alto** | Sin selector de franja en registro libre, unidades incompletas (falta porción/unidad), sin aviso anti-duplicado de porciones, copys | `nutrition-v2/add-food-v2.tsx` |
| 5 | **4A-07 Kit + ilustraciones** | **P1** | Ilustraciones del CEO ausentes en TODOS los estados; CTA primario RN no es botón relleno (jerarquía rota); fallback emoji vs icono | `components/nutrition-v2/NutritionV2Kit.tsx`, `NutritionCard.tsx`, `MacroChipRow.tsx`, nuevo `state-illustration` |
| 6 | **4A-08 AuraHero** | **P1** | Carbs AZUL FIJO `#126BE1` — rompe white-label (web: `sport-500`); labels sin 700/300; hex crudos V1 importados | `components/nutrition-v2/AuraHero.tsx` |
| 7 | **4A-06 Editar/Retirar** | **P1** | Falta el motivo obligatorio (dato que ve el coach), retiro sin confirmación/explicación, errores crudos con sheet cerrado | `nutrition-v2/index.tsx` (EntryActionSheet) |
| 8 | **4A-03 Plan tab** | **P2 alto** | Faltan subtotales, objetivos de franja, guía de ítems (min/max), notas fuera de lugar, copy "Metas diarias" | `nutrition-v2/index.tsx` (PlanTab) |
| 9 | **4A-04 Historial** | **P2 alto** | Mayormente RN-EXTRA a retirar (macros por día, detalle expandible, estrategia) + copy de resumen | `nutrition-v2/index.tsx` (HistoryTab) |
| 10 | **4A-09 Porciones** | **P2** | Cerca de paridad (contrato compartido); deltas finos: chip sin borde, checks/badges, buscador del sheet ausente (único P1 interno: punto 13), filtro prescribed>0 | `components/alumno/nutrition-v2/*` |
| 11 | **4A-05 Shell/tab bar** | **P2** | Deltas finos de toolbar (radio/padding/gap) + eyebrow (que cierra 4A-01) | `nutrition-v2/index.tsx` (shell) |
| 12 | **4A-12 Celebraciones** | **P2 / decisión** | 3 celebraciones RN-extra sin contraparte web — requiere decisión del owner antes de codificar | `components/nutrition-v2/CelebrationOverlay.tsx`, `lib/nutrition-v2-celebrations*` |

## Waves sugeridas (archivos disjuntos por wave)

- **Wave A:** 4A-01 (sola — mueve archivos).
- **Wave B:** 4A-02 (index.tsx) ∥ 4A-07 (kit) ∥ 4A-11 (scanner) ∥ 4A-10 (add-food).
- **Wave C:** 4A-06 (index.tsx) ∥ 4A-08 (AuraHero) ∥ 4A-09 (porciones).
- **Wave D:** 4A-03 (index.tsx) ∥ 4A-12 (celebraciones — con decisión del owner ya tomada).
- **Wave E:** 4A-04 (index.tsx) ∥ 4A-05 (index.tsx sólo si se separa el shell a archivo propio;
  si no, secuencial tras 4A-04).

Notas para el orquestador:
- 4A-02 depende de la API `getNutritionPlanV2` (ya existe en `lib/nutrition-v2.api.ts`) para el lag banner.
- 4A-07 debe aterrizar ANTES de que 4A-02/03/04/11 hagan wire-up de ilustraciones (o esas unidades
  dejan el copy correcto y el wire-up queda como follow-up de 1 línea).
- Decisiones de owner requeridas ANTES de sus waves: historial RN-extra (4A-04 §5), celebraciones
  (4A-12), live-search vs botón Buscar (4A-10 §4), scroll infinito vs botón (4A-04 §1).
- Gates completos (tokens 86/86, expo export, QA device light/dark × marca) los corre el orquestador
  al cierre de cada wave, según DoD §2 del plan.
