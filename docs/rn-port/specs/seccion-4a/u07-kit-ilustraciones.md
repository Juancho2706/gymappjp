# 4A-07 — Kit V2 RN: ilustraciones de estado, StatePanel, botones, FoodRow

Archivos RN: `apps/mobile/components/nutrition-v2/NutritionV2Kit.tsx`, `NutritionCard.tsx`,
`MacroChipRow.tsx`, nuevo `state-illustration.ts(x)` RN + assets. Disjunto de las demás unidades.
Referencias web: `apps/web/src/components/nutrition-v2/NutritionV2Kit.tsx`, `NutritionV2Motion.tsx`,
`state-illustration.ts`, `_components/NutritionFoodRow.tsx`.

## Afirmaciones y deltas

1. **Ilustraciones del CEO en StatePanel (FALTA COMPLETA).**
   Web `state-illustration.ts:11-71`: 8 assets (`sin-plan`, `dia-completado`, `sin-conexion`,
   `sin-resultados`, `catalogo-vacio`, `sin-alumnos`, `historial-vacio`, `error-amable`) en
   `/illustrations/*.webp` + `@2x`. `NutritionStatePanel` web (`NutritionV2Kit.tsx:347-400`) las
   renderiza en un círculo `h-36 w-36` (sm:40) tintado `color-mix(theme-primary 10%)` con la imagen
   `h-24 w-24` (sm:28). Superficies del alumno que las usan: sin plan (`page.tsx:155-161`), plan vacío
   (197), historial vacío (432), scanner inválido/no encontrado (`FoodScannerClient.tsx:556,569`),
   celebración del hero (`AuraHero.tsx:229-235`, `dia-completado`).
   RN `NutritionV2Kit.tsx:488-529`: StatePanel solo con glifo lucide. **Delta mayor.**
   Cierre: prop `illustration` en el StatePanel RN, assets webp empaquetados en la app (require
   estático, sin red), círculo tintado con el primario (`hexToRgba(theme.primary, 0.10)`), y wire-up
   en los call-sites listados (las unidades dueñas de cada archivo hacen el wire-up; este kit expone la API).

2. **Tonos del `NutritionMotionButton`.**
   Web `NutritionV2Motion.tsx:24-32`: botones RELLENOS — nutrition = `bg-primary/100 text-white`;
   success = `bg-emerald-600 text-white`; danger = `bg-rose-600 text-white`; warning = `bg-amber-500
   text-slate-950`; neutral = `bg-surface-card text-strong border-border-default`.
   RN `NutritionV2Kit.tsx:562-617` reusa `toneClasses` de CARD: nutrition = `bg-primary/10` con texto
   `text-primary` (¡no relleno!), success = `bg-success-500/10`, etc.
   **Delta mayor de jerarquía visual**: el CTA primario RN se ve como chip fantasma, no como botón
   primario blanco-sobre-primary. Cierre: mapa de tonos propio de botón espejo del web
   (relleno + texto de contraste), conservando háptica/Moti.

3. **`FoodRow`/miniatura: icono de categoría vs emoji.**
   Web alumno `NutritionFoodRow.tsx:48-105`: miniatura 44px `rounded-control` con foto real o icono
   estático de categoría (24px) sobre `bg-primary/10`; macros como `MacroChipRow sm`; nota bajo macros.
   RN `NutritionV2Kit.tsx:364-454`: miniatura 36-64px, fallback EMOJI de categoría sobre
   `bg-surface-sunken` sin tinte primario; sin soporte de `note`.
   **Deltas:** fallback emoji ≠ icono web (decisión: portar los iconos estáticos de
   `apps/web/public` al bundle RN, o documentar el emoji como adaptación aprobada — default de la ola:
   portar iconos para 1:1); tinte `bg-primary/10` faltante; prop `note` faltante (la usa 4A-02/03).
   Cierre: fallback visualmente igual al web + `note`.

4. **`MacroChipRow`.** Web `MacroChipRow.tsx:63-84` vs RN `MacroChipRow.tsx:60-81`: estructura y
   colores en paridad (punto `var(--ember-500)/sport/aqua` ↔ `nativeClass bg-*-500`). Delta fino:
   paddings sm (web `px-1.5 py-0.5`; RN `px-2 py-0.5`) y md (web `px-2`; RN `px-2.5 py-1`); web
   `tabular-nums` en cifras, RN sin fontVariant. Cierre: paddings y tabular-nums.

5. **`NutritionCard`.** Web `NutritionV2Kit.tsx:502-504`: `rounded-card border p-4 shadow-sm`.
   RN `NutritionCard.tsx:30-37`: sin sombra. Delta menor; decisión única para todo el kit
   (elevation/shadow tokens del DS RN) — documentar la que se tome.
   Tonos de card: web usa canvas fijos emerald/amber/rose/sky (líneas 39-52) y RN los mapea a
   success/warning/danger/info del DS RN — mapa ya sancionado por el contrato white-label
   (esas rampas no se recolorean); en paridad de intención, verificar contraste dark.

6. **`SyncOfflineState`, `PlanVersionBadge`, `StrategyBadge`, `NutritionSkeleton`,
   `MealTimeline`/`MealSlotCard`**: comparados campo a campo (web 182-216, 329-345, 402-413 vs RN
   151-188, 456-486, 531-560) — **en paridad** (labels, iconos, tonos). `NutritionHeader` RN carece de
   la variante compacta con flecha (web 122-150) — la necesita 4A-01/09; agregarla aquí.

## Comprobación objetiva

Storybook manual (pantalla de prueba o capturas por componente) light/dark, marca EVA + marca de alto
contraste: StatePanel con y sin ilustración, botón por tono, FoodRow con foto/fallback/nota,
MacroChipRow sm/md contra la web a zoom 1:1.

## Veredicto (2026-07-19 — aplicada a nivel código, tsc mobile limpio)

1. **Ilustraciones — CERRADO.** Nuevo `components/nutrition-v2/state-illustration.tsx`: espejo del
   módulo puro web (mapeo estado→ilustración) + requires estáticos de los 8 webp del CEO copiados
   1x/@2x a `apps/mobile/assets/illustrations/` (212 KB; el resolver RN elige densidad, espejo del
   srcSet). API de 1 línea `<StateIllustration name=... />` y prop `illustration` en
   `NutritionStatePanel` (círculo 144pt `hexToRgba(theme.primary, 0.10)`, arte 96pt, decorativa
   oculta a lectores). Wire-up en call-sites = 4A-02/03/04/11 (este kit solo expone la API).
   Re-export agregado al barrel `components/nutrition-v2/index.ts` (1 línea).
2. **Botón relleno — CERRADO.** `buttonToneClasses`/`buttonToneTextClasses` espejo de
   `NutritionV2Motion.tsx:24-32`; nutrition = `bg-primary` + `text-white` (como web). Adaptación
   escrita: los fills de estado usan la convención solid del DS RN (`*-500` fijo + glifo
   `on-warning`/`on-success`; Badge.tsx:56-63) en vez de los raw emerald-600/amber-500/rose-600/
   sky-600 del web — el paso -600 RN flipea a tinte claro en dark y rompería el fill; contrato
   white-label prohíbe valores crudos nuevos. `disabled:opacity-55` y shadow sm portados.
3. **FoodRow — CERRADO (decisión default de la ola: iconos portados).** 10 webp de
   `apps/web/public/food-icons/` → `assets/food-icons/` (31 KB, Fluent Emoji MIT); fallback del
   thumbnail = icono de categoría a proporción web (24/44) sobre tinte `bg-primary/10`; categoría
   explícita (`fallbackCategory`) o derivada del nombre (web `NutritionFoodRow.tsx:102`); las filas
   ya nunca caen a emoji (`fallbackEmoji` deprecado sin romper call-sites). Prop `note` agregada
   (web :127). Nota: los call-sites que hoy pasan `foodCategoryEmoji(food.category)` quedan con
   categoría derivada del nombre hasta que su unidad pase `fallbackCategory` (misma precisión que
   las filas del alumno web).
4. **MacroChipRow — CERRADO.** Paddings sm `px-1.5 py-0.5` / md `px-2 py-0.5` 1:1 y `tabular-nums`
   vía `fontVariant` en las cifras.
5. **Sombra del kit — DECISIÓN TOMADA.** `shadow-sm` web = token de elevación DS RN
   `shadow('sm', theme.scheme)` (`lib/shadows.ts`), aplicado donde el web lo tiene: NutritionCard
   (web :503), MealSlotCard (:266), NutritionToolbar (:173), BuilderInspector (:455) y
   NutritionMotionButton (Motion :57).
6. **Header compacto — CERRADO.** Variante de una fila [flecha][eyebrow overline + título 22
   black + descripción][acciones] (web :122-150). Adaptación escrita: `backHref` (Link) → callback
   `onBack` (navegación imperativa del stack RN); la consumen 4A-01/09.

Pendiente (no bloqueante): comprobación objetiva visual (storybook manual light/dark) en QA device.
Peso total agregado al bundle: ~243 KB en 26 webp (máximo individual 25,6 KB — bajo el umbral de
200 KB, sin compresión necesaria).
