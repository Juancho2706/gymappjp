# PLAN — Conversión automática V1 → V2

## Arquitectura

```
scripts/nutrition-v2-conversion/convert-v1-plans.ts   ← driver (I/O, service-role, CLI)
        │  lee árbol V1 (plans → meals → food_items → foods)
        ▼
packages/nutrition-v2/conversion.ts                   ← mapeo PURO (testeado)
        │  ConversionPlanResult (versión + variantes + slots + items + fidelity)
        ▼
inserts service-role (espejo de persistAndPublishDraft) → RPC publish_nutrition_plan_v2
        │  (impersonación de coach vía claims en la tx — patrón tests RLS)
        ▼
nutrition_v2_conversion_links (tabla puente, migración aditiva)
        ▲
apps/web coach ficha V2: banner "plan convertido" (SELECT del link por RLS)
```

Decisión clave: publish SIEMPRE por el RPC canónico (idempotencia, supersede,
same-day rederive, auditoría) — cero duplicación de lógica de publicación. El único
código nuevo con conocimiento del dominio es el mapeo puro, aislado y testeado.

## Fases

1. **DDL** (1 migración aditiva, NO se aplica a prod en este build):
   - `nutrition_v2_conversion_links` + RLS/grants + helper de publish impersonado
     (`public.nutrition_v2_convert_publish`, service-role only).
   - Guard anti-forja P1#1: SIN migración nueva — ya cerrado por T11
     (`20260716210000_nutrition_v2_t11_hardening.sql`).
2. **Mapeo puro** `packages/nutrition-v2/conversion.ts` + tests vitest (dow 7→0,
   fan-out de comidas NULL a variantes por día, duplicados, macros snapshot con
   paridad de redondeo, texto puro, exchanges → manual_required).
3. **Driver CLI** con dry-run/apply/coach/out + reporte MD+JSON + re-sync.
4. **Banner coach** en ficha V2 web (query link + UI descartable, dark mode).
5. **Verificación adversarial** (workers independientes contra SPEC + schema real)
   → correcciones al mismo worker.
6. **Gates** + commit + push + PR draft a `rnmobiledenuevo`.

## Post-build (gates operativos, con GO del CEO)
1. Validar migraciones BEGIN/ROLLBACK en LIVE + advisors → aplicar.
2. Dry-run real contra prod → artifact con reporte de fidelidad → revisión CEO.
3. `--apply` (dark). Re-sync semanal hasta el flip; corrida final el día del mode-on.
