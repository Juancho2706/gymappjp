# EVA Nutrición V2 — índice de documentación

**Rama de trabajo:** `Nuevascosasrnopenai`  
**PR:** #121 — draft  
**Base:** `rnmobiledenuevo`  
**Supabase productivo:** `constant` (`jikjeokundmaafuytdcx`)  
**Última actualización del handoff:** 15 de julio de 2026

Este directorio es la fuente de orientación para continuar el rework de Nutrición V2. No asumir que una migración aplicada o una ruta canary equivale a una funcionalidad terminada.

## Lectura obligatoria para Claude CLI

Leer en este orden:

1. [`CLAUDE_CLI_HANDOFF_2026-07-15.md`](./CLAUDE_CLI_HANDOFF_2026-07-15.md)  
   Punto de entrada operativo, reglas, comandos, orden de trabajo y bloqueos inmediatos.
2. [`CURRENT_IMPLEMENTATION_AND_FILE_MAP_2026.md`](./CURRENT_IMPLEMENTATION_AND_FILE_MAP_2026.md)  
   Qué existe realmente y dónde vive cada pieza.
3. [`VALIDATION_RISKS_AND_KNOWN_BLOCKERS_2026.md`](./VALIDATION_RISKS_AND_KNOWN_BLOCKERS_2026.md)  
   Estado de CI, riesgos técnicos, inconsistencias detectadas y pruebas pendientes.
4. [`REMAINING_ROADMAP_AND_DEFINITION_OF_DONE_2026.md`](./REMAINING_ROADMAP_AND_DEFINITION_OF_DONE_2026.md)  
   Trabajo restante desde la estabilización de Tandas 4–5 hasta el retiro de V1.
5. [`TANDA_4_READ_MODELS_CACHE_OFFLINE_HANDOFF_2026.md`](./TANDA_4_READ_MODELS_CACHE_OFFLINE_HANDOFF_2026.md)  
   Read models, rollout, gateways web/RN, caché y cola offline.
6. [`TANDA_5_CATALOG_SCANNERS_MEDIA_HANDOFF_2026.md`](./TANDA_5_CATALOG_SCANNERS_MEDIA_HANDOFF_2026.md)  
   Catálogo local, GTIN, scanners, Storage, media e importación Chile.
7. [`../NUTRITION_V2_MASTER_EXECUTION_PLAN_2026.md`](../NUTRITION_V2_MASTER_EXECUTION_PLAN_2026.md)  
   Visión completa y tandas 0–12.
8. [`../NUTRITION_TOTAL_REWORK_AUDIT_2026.md`](../NUTRITION_TOTAL_REWORK_AUDIT_2026.md)  
   Auditoría funcional original y contexto V1.

## Tandas documentadas

| Tanda | Estado de handoff | Documento |
|---|---|---|
| 0 | Cerrada | [`TANDA_0_BASELINE_GUARDRAILS_2026.md`](./TANDA_0_BASELINE_GUARDRAILS_2026.md) |
| 1 | Cerrada como contrato de producto | [`TANDA_1_PRODUCT_CONTRACT_WIREFRAMES_2026.md`](./TANDA_1_PRODUCT_CONTRACT_WIREFRAMES_2026.md) |
| 2 | Kit y contratos creados; requiere integración visual futura | [`TANDA_2_DESIGN_SYSTEM_COMPONENTS_2026.md`](./TANDA_2_DESIGN_SYSTEM_COMPONENTS_2026.md) |
| 3 | Dominio aditivo aplicado y probado | [`TANDA_3_ADDITIVE_DOMAIN_2026.md`](./TANDA_3_ADDITIVE_DOMAIN_2026.md) |
| 4 | Implementación avanzada, no cerrada para rollout | [`TANDA_4_READ_MODELS_CACHE_OFFLINE_HANDOFF_2026.md`](./TANDA_4_READ_MODELS_CACHE_OFFLINE_HANDOFF_2026.md) |
| 5 | Infraestructura y scanners creados, sin catálogo piloto ni cierre de QA | [`TANDA_5_CATALOG_SCANNERS_MEDIA_HANDOFF_2026.md`](./TANDA_5_CATALOG_SCANNERS_MEDIA_HANDOFF_2026.md) |
| 6–12 | Pendientes | [`REMAINING_ROADMAP_AND_DEFINITION_OF_DONE_2026.md`](./REMAINING_ROADMAP_AND_DEFINITION_OF_DONE_2026.md) |

## Runbooks operativos

- [`../../operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md`](../../operations/NUTRITION_V2_ROLLOUT_RUNBOOK.md)
- [`../../operations/FOOD_CATALOG_CL_IMPORT.md`](../../operations/FOOD_CATALOG_CL_IMPORT.md)
- [`../../operations/food-catalog-cl.example.json`](../../operations/food-catalog-cl.example.json)

## Reglas de oro

- No modificar `master` ni `rnmobiledenuevo` desde esta entrega.
- Mantener PR #121 en draft.
- Supabase es producción: solo migraciones aditivas y versionadas.
- No activar `nutrition_v2` globalmente.
- No usar APIs externas de alimentos en runtime.
- No inventar datos históricos.
- No mezclar componentes V1 dentro de rutas V2.
- No promover Tandas 4 o 5 a “completadas” hasta cerrar los bloqueos del documento de validación.
- Ejecutar CI completo antes de solicitar merge.
- Generar un único Preview de Vercel al finalizar un bloque de dos tandas, no por cada corrección.
