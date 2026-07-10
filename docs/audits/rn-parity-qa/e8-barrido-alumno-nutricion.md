# E8-01 · Barrido de paridad RN ↔ web — Alumno: Nutrición + Check-in + Aprender + Movement/Bodycomp

Referencia web: `apps/web/src/app/c/[coach_slug]/nutrition` (NutritionShell.tsx, columna <760), `check-in`, `exercises`, `bodycomp`.
RN: `apps/mobile/app/alumno/(tabs)/nutricion.tsx`, `check-in.tsx`, `exercises.tsx`, `movement.tsx`, `bodycomp.tsx`.

| Pantalla / sección | Veredicto | Detalle (archivo:línea) |
|---|---|---|
| Nutrición — orden/estructura shell | **OK** | Orden 1:1 con kit móvil web (offline→workout→dayNav→banners→racha→anillos→micros→plato→comidas→off-plan→notas→shopping→recap→recetas→adherencia). `nutricion.tsx:496-633` vs `NutritionShell.tsx:988-1233` |
| Nutrición — MealCard (toggle/porción/satisfacción/swap) | **OK** | Círculo completar, porciones, emojis satisfacción, chips intercambio, swaps. `nutricion.tsx:571-604` |
| Nutrición — Exchanges (Porciones/Gramos) | **OK** | `ExchangeModeToggle`+`ExchangeMealSection`+`ExchangeEquivalencesSheet`, gate `useStudentExchanges`. `nutricion.tsx:561,596,637` |
| Nutrición — Swaps + favoritos | **OK** | `SwapSheet` optimista con rollback. `nutricion.tsx:427-469,645` |
| Nutrición — Micros | **OK** | `MicrosPanel` auto-oculta por server (`sections.microsBase`+`domainEnabled`). `MicrosPanel.tsx:217-218` |
| Nutrición — Racha / Anillos / Adherencia | **OK** | Motor único `@eva/nutrition-engine`. `nutricion.tsx:296-312,528-536,629` |
| Nutrición — Recap / Recetas / Push | **OK** | En web viven a nivel page; RN los incluye en el shell (paridad de features). `nutricion.tsx:525,623-627` |
| **Nutrición — master switch dominio OFF** | **GAP-mayor** | Web tiene 3er estado `NutritionDomainOff` (coach apaga dominio, no borra data); RN solo maneja loading + sin-plan. Deep-link/estado stale muestra el plan completo. Auto-reconocido en comentario. `nutricion.tsx:483-494` (comment 488-490) |
| **Nutrición — gating por sección (sectionFlags)** | **GAP-mayor** | Web gatea cada sección por `resolveFeaturePrefs` (`notes`, `shopping`, `plate`, `off_plan_log`, `recipes`). RN: solo `MicrosPanel` honra su flag; Notas/Compras/Plato/Off-plan/Recetas se renderizan incondicionalmente (solo ocultan por data vacía). Sección desactivada por el coach igual aparece en móvil. `NotesThread.tsx:60` (enabled=true nunca seteado), `ShoppingList.tsx:145`, `PlatePanel` (sin gate), `OffPlanLogger.tsx:185`, `RecipeIdeasSection` (sin gate) |
| Nutrición — Export del día | **GAP-menor** | Web = 3 botones inline SIEMPRE visibles (Copiar detalle / Resumen WhatsApp / Descargar PDF), `NutritionShell.tsx:1143-1200`. RN = ícono share en header → sheet `ExportDayActions` (mismas 3 acciones). Funcional equivalente, estructura distinta. `nutricion.tsx:420-423,500,659` |
| Nutrición — banner comidas filtradas / histórico | **OK** | `FilteredMealsBanner`+`HistoricBanner`. `nutricion.tsx:521-523` |
| Check-in — wizard 3 pasos | **OK** | TopBar "Paso X de 3"+stepper+disclaimer médico+peso stepper+resumen+éxito confetti. `check-in.tsx:306-392` |
| Check-in — nivel de energía | **GAP-menor** | Web = slider 1-10; RN = selector segmentado 1-10 (no hay primitiva Slider). Auto-reconocido. `check-in.tsx:473-494` |
| Check-in — éxito | **GAP-menor** | Web `SuccessWaveOverlay` brandeado; RN círculo check + `Confetti` (sin wave). `check-in.tsx:267-304` |
| Check-in — subida fotos | **OK** | RN sube directo a bucket `checkins` (Supabase, sin WAF Cloudflare de por medio → patrón signed-URL web no aplica). Best-effort igual que web. `check-in.tsx:156-182,208-215` |
| Aprender (exercises) | **OK** | Header branded + búsqueda debounce 250ms + chips músculo + FeaturedCard (vista default) + grid 2col + "Ver más (N restantes)" + sheet detalle gif/video/instrucciones on-demand + deep-links `?q`/`?ex`. 1:1. `exercises.tsx` |
| Movement (screening) | **OK** | Gate `useEntitlements.hasModule` (cero fetch sin módulo) + `ModuleOffNotice` + estados perm_error/empty/loading. `movement.tsx:120-239` |
| Bodycomp (ISAK/somatotype) | **OK** | Mismo patrón de gating + métricas ISAK + somatotype + estados. `bodycomp.tsx:157-233` |

## Resumen de GAPs
- **2 GAP-mayor** (funcionales, ambos en el gating de nutrición): (1) master switch dominio-OFF ausente; (2) feature-pref por-sección solo aplicado a micros, el resto de secciones no lo honra.
- **3 GAP-menor** (cosméticos/estructurales): export sheet vs inline, energía segmentado vs slider, éxito sin wave brandeado.
- El resto del dominio (estructura, orden, meals, swaps, exchanges, micros, racha, anillos, adherencia, check-in wizard, Aprender, movement, bodycomp) está en paridad.
