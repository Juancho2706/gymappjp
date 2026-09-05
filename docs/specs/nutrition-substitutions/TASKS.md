# TASKS — Reemplazos autorizados por el coach (F-02)

- [x] T1. Migración `nutrition_item_substitutions_v2` (tabla + RLS + grants + índices). Aditiva, en prod.
- [x] T2. Contrato: `NutritionItemSubstitutionSchema` + `substitutions?` en `NutritionPrescriptionItemSchema`.
- [x] T3. Persistencia web: id explícito por item + freeze + insert (`buildItemSubstitutionInsertRow`, `collectSubstitutionFoodIds`) en `plan-persistence.ts`.
- [x] T4. Read type/mapper: `NutritionItemSubstitutionReadSchema` + `mapNutritionItemSubstitutionRow` + `NUTRITION_ITEM_SUBSTITUTION_SELECT`.
- [x] T5. Test del freeze + collect.
- [x] T6. Fetch server + carry-over: inyectar reemplazos de la versión base en builder/quick-edit web y preservarlos al republicar; test incluido.
- [x] T7. UI coach builder web: editor de reemplazos por item (reusa buscador de alimentos, ≤8, solo structured/hybrid).
- [x] T8. UI alumno web Today: render de reemplazos por item, fallback `notes` legado.
- [x] T9. RN data path: persist en builder móvil + fetch/merge/carry-over + render alumno en Today.
- [x] T10. UI alumno Plan web/RN: integrar reemplazos estructurados y fallback legado. **HECHO
      02-09 (`bbfc5136`, en prod con el tren `794aee52`):** `PlanVariantCard` web y tab Plan RN pintan
      «⇄ o 120 g de …» con la gramática compartida de `@eva/nutrition-v2/plan-substitutions`; QA del
      owner en device VERDE 02-09.
- [x] T11. RN coach: editor visual de reemplazos en quick-edit/builder — verificado en
      `editor-state.ts:826-828` + `QuickEditMode` (cierre 2026-08-17).
- [x] T12. Gates estáticos (tsc web+mobile, vitest, eslint, boundaries) + PR #159 integrado en `master`.
- [x] T13. QA device web/RN del flujo completo; seguimiento consolidado en `MOBILE_PARITY.md`.
      **Parcial 02-09:** el lado alumno (item con reemplazos «⇄ o 120 g de …» en web y RN, `bbfc5136`)
      quedó VERDE con el owner en device. **Cerrado 05-09:** el **lado coach** (editor de reemplazos) de
      punta a punta quedó verde — **QA del owner VERDE 05-09** (sesión única, artifact `6bd32370`, Android 1.1.2 build 86 / iOS 1.1.2 build 59 con OTA del 04-09 android `d8220490` / ios `54487ddd`, web `f9ba8a3f`).
- [x] T14. `get_nutrition_plan_read_v2` transporta `substitutions` por ítem (array siempre presente) —
      migración `20260902220850_nutrition_v2_plan_read_substitutions` **aplicada en LIVE el 02-09**
      (create or replace aditivo, verificado como `authenticated` contra un plan real: 123 ítems con la
      clave, 2 con reemplazos). `planSubstitutionsByItem` (`@eva/nutrition-v2`) decide por presencia de
      clave; web y RN dejan de hacer la lectura extra y conservan el select directo como fallback
      (`347f441d`, en código, pendiente de deploy/OTA).
