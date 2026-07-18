> ARCHIVADO 2026-07-18: dice "canary solo para josefit" (17-jul), contradicho por el flip a `mode=on` del 18-jul — reemplazado por `docs/product/nutrition-v2/README.md` (nuevo) y `docs/product/nutrition-v2/ESTADO_Y_PENDIENTES.md`.

# EVA Nutrición V2 — índice de documentación

**Rama de trabajo:** `rnmobiledenuevo`
**Supabase productivo:** `jikjeokundmaafuytdcx`
**Estado:** implementado y estabilizado, en canary solo para josefit. Última actualización: 2026-07-17.

> Este índice apunta a los docs vigentes. Los handoffs y roadmaps congelados (estado al
> 2026-07-15) se archivaron en [`../../archive/nutrition-v2/`](../../archive/nutrition-v2/)
> porque su contenido quedó superado por lo implementado. No los uses como estado actual.

## Fuente de verdad del estado

1. [`ESTADO_Y_PENDIENTES.md`](./ESTADO_Y_PENDIENTES.md) — **empieza acá.** Qué está listo,
   qué falta, decisiones tomadas, datos útiles. Doc vivo que reemplaza a los handoffs.
2. [`TANDA_1_PRODUCT_CONTRACT_WIREFRAMES_2026.md`](./TANDA_1_PRODUCT_CONTRACT_WIREFRAMES_2026.md)
   — contrato de producto y wireframes (referencia de diseño vigente).
3. [`ASSETS_CEO_2026-07.md`](./ASSETS_CEO_2026-07.md) — inventario de assets (ilustraciones,
   íconos de alimentos, navbar, badges).

## Runbooks operativos

- [`../../operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md`](../../operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md)
- [`../../operations/FOOD_CATALOG_CL_IMPORT.md`](../../operations/FOOD_CATALOG_CL_IMPORT.md)
- [`../../operations/food-catalog-cl.example.json`](../../operations/food-catalog-cl.example.json)

## Reglas no negociables del rework

- Supabase es producción: solo migraciones aditivas y versionadas, validadas BEGIN/ROLLBACK.
- No activar `nutrition_v2` globalmente; rollout solo canary/allowlist con flags fail-closed.
- No inventar datos históricos; correcciones vía correction chain (el original se conserva).
- No mezclar componentes V1 dentro de rutas V2 (CI: `pnpm check:nutrition-v2-boundaries`).
- No usar APIs externas de alimentos en runtime (catálogo local Chile en Supabase).
- No exponer service role en web/PWA/RN; RPCs profesionales solo versión scoped.
- Paridad web responsive/PWA/RN, light/dark/white-label, accesibilidad.

## Histórico archivado

Handoffs, roadmaps y tandas cerradas en [`../../archive/nutrition-v2/`](../../archive/nutrition-v2/):
`CLAUDE_CLI_HANDOFF_2026-07-15`, `CURRENT_IMPLEMENTATION_AND_FILE_MAP_2026`,
`REMAINING_ROADMAP_AND_DEFINITION_OF_DONE_2026`, `TANDA_0/2/3/4/5_*`. Se conservan como
contexto; NO representan el estado actual (ver `ESTADO_Y_PENDIENTES.md`).
