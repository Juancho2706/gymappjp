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
- [ ] T10. UI alumno Plan web/RN: integrar reemplazos estructurados y fallback legado.
- [ ] T11. RN coach: editor visual de reemplazos en quick-edit/builder.
- [x] T12. Gates estáticos (tsc web+mobile, vitest, eslint, boundaries) + PR #159 integrado en `master`.
- [ ] T13. QA device web/RN del flujo completo; seguimiento consolidado en `MOBILE_PARITY.md`.
