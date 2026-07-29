# TASKS — Multi-dia Nutricion V2

- [x] FD1a `draft-builder.ts`: BuilderState.variants[] + reducer + assembleDraft + autosave v2 + tests
- [x] FD1b `portions-state.ts`: claves por variante + tests slots homonimos
- [x] FD1c `builder/page.tsx`: rehidratacion completa desde detail.plan.dayVariants (reemplaza guard)
- [x] FD1d `PlanBuilderClient.tsx`: DayVariantBar + AddDayPopover + menu ⋯ + banner herencia + Revisar por dia + upsell BASE
- [x] FD4 RN: `nutrition-v2-builder.ts` espejo + `builder/[clientId].tsx` chips/sheet (reemplaza guard RN)
- [x] FD5 quick-edit: ADD/REMOVE_VARIANT + SET_VARIANT_DAY web y RN + boton Agregar dia
- [x] FD3 alumno/ficha: badge "Hoy: plan de X" + tira Lu-Do (web+RN, alumno+coach) — helpers puros en `packages/nutrition-v2/day-variants.ts` (+ tests) y componente `DayVariantWeekStrip` web/RN
- [x] Gates completos + QA visual del flujo
- [ ] QA fisica Android/iOS (pendiente humano, no bloquea merge de codigo)
