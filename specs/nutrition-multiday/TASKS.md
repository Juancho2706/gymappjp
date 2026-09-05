# TASKS — Multi-dia Nutricion V2

- [x] FD1a `draft-builder.ts`: BuilderState.variants[] + reducer + assembleDraft + autosave v2 + tests
- [x] FD1b `portions-state.ts`: claves por variante + tests slots homonimos
- [x] FD1c `builder/page.tsx`: rehidratacion completa desde detail.plan.dayVariants (reemplaza guard)
- [x] FD1d `PlanBuilderClient.tsx`: DayVariantBar + AddDayPopover + menu ⋯ + banner herencia + Revisar por dia + upsell BASE
- [x] FD4 RN: `nutrition-v2-builder.ts` espejo + `builder/[clientId].tsx` chips/sheet (reemplaza guard RN)
- [x] FD5 quick-edit: ADD/REMOVE_VARIANT + SET_VARIANT_DAY web y RN + boton Agregar dia
- [x] FD3 alumno/ficha: badge "Hoy: plan de X" + tira Lu-Do (web+RN, alumno+coach) — helpers puros en `packages/nutrition-v2/day-variants.ts` (+ tests) y componente `DayVariantWeekStrip` web/RN
- [x] Gates completos + QA visual del flujo
- [x] QA fisica Android/iOS — **QA del owner VERDE 05-09** (sesión única, artifact `6bd32370`, Android 1.1.2 build 86 / iOS 1.1.2 build 59 con OTA del 04-09 android `d8220490` / ios `54487ddd`, web `f9ba8a3f`)
