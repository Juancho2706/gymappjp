# TASKS — Reemplazos autorizados por el coach (F-02)

- [x] T1. Migración `nutrition_item_substitutions_v2` (tabla + RLS + grants + índices). Aditiva, en prod.
- [x] T2. Contrato: `NutritionItemSubstitutionSchema` + `substitutions?` en `NutritionPrescriptionItemSchema`.
- [x] T3. Persistencia web: id explícito por item + freeze + insert (`buildItemSubstitutionInsertRow`, `collectSubstitutionFoodIds`) en `plan-persistence.ts`.
- [x] T4. Read type/mapper: `NutritionItemSubstitutionReadSchema` + `mapNutritionItemSubstitutionRow` + `NUTRITION_ITEM_SUBSTITUTION_SELECT`.
- [x] T5. Test del freeze + collect.
- [ ] T6. Fetch server + carry-over: inyectar reemplazos de la versión base en builder/quick-edit (web) para preservarlos al republicar. Test de carry-over.
- [ ] T7. UI coach builder web: editor de reemplazos por item (reusa buscador de alimentos, ≤8, solo structured/hybrid).
- [ ] T8. UI alumno web: render de reemplazos por item (Today + plan), fallback `notes` legado.
- [ ] T9. RN: persist de reemplazos en el builder móvil + editor coach RN + render alumno RN + fetch/merge.
- [ ] T10. Gates (tsc web+mobile, vitest, eslint) + PR (stacked) + doc MOBILE_PARITY. QA device.
