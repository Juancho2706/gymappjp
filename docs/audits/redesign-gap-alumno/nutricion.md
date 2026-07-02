# Auditoría de fidelidad visual — Alumno · Nutrición (Plan Alimenticio)

Comparación kit Claude Design ↔ implementación real de `/c/[coach_slug]/nutrition/**`.

- **Kit móvil/PWA (viewport primario <760):** `docs/design-source/ui_kits/eva-app/screens/alumno-nutricion.jsx` (`PlanAlimenticio`, `Nut_Recap`, `Nut_Micro`, `Nut_Plate`, `Nut_ExchangeSheet`, `Nut_Notes`, `Nut_Shopping`, `Nut_Meal`) + `shared.jsx` (`TopBar`, `SectionTitle`) + `OffPlanLogger` en `alumno.jsx:567`.
- **Kit desktop (≥760):** `DesktopPlan` en `eva-desktop/desktop-coach.jsx:862-954` (2 col: comidas izq + rail stats der).
- **App:** `apps/web/src/app/c/[coach_slug]/nutrition/page.tsx` + `_components/NutritionShell.tsx` + hijos.

**Cobertura estructural: no hay P0.** Todas las secciones del kit existen en la app: recap semanal (`WeeklyRecapCard`, `page.tsx:160`), contexto entreno (`WorkoutContextBanner`), navegador por día (`DayNavigator`), banner histórico, racha (`NutritionStreakBanner`), anillos de macros (`MacroRingSummary`), micros (`MicrosPanel`), plato (`PlatePanel`/`ProportionPlate`), comidas (`MealCard` con completar/porción/satisfacción/swap + chips de intercambio), off-plan (`OffPlanLogger`), notas (`NotesThread`), export (copiar/WhatsApp/PDF), lista de compras (`ShoppingListView`), adherencia 30d (`AdherenceStrip`), recetas-idea (`RecipeIdeasSection`, `page.tsx:197`) y hoja de equivalencias (`ExchangeEquivalencesSheet`). El layout 2-col desktop del kit (`DesktopPlan`) está bien portado en `NutritionShell.tsx:900-1138` (columna única <760 en orden del kit móvil + rail sticky ≥760). Los gaps son de estilo/tokens, no de arquitectura.

---

## P1 — Control de "completar comida": la app usa un checkbox de anillo hueco en vez del botón circular relleno con ícono de cubiertos del kit
- **Kit:** `alumno-nutricion.jsx:180-181` (`Nut_Meal`) — botón 44×44 `borderRadius:'50%'` (círculo completo); relleno `var(--ember-500)` con check cuando `logged`; `var(--surface-sunken)` con **ícono `utensils`** (tenedor+cuchillo, size 20) cuando está pendiente.
- **App:** `MealCard.tsx:91-132` — contenedor 44×44 `rounded-xl` que envuelve un anillo interno de solo 28px (`w-7 h-7 rounded-full border-2`); relleno ember únicamente al completar; en estado pendiente el anillo queda **vacío, sin ícono de cubiertos**.
- **Diferencia:** se pierde la firma visual del kit (círculo sólido tintado + glifo de cubiertos como affordance de "marcar comida", repetido por cada comida). La app muestra un radio/checkbox genérico de 28px.
- **Fix:** convertir el botón a un círculo pleno de 44px (`rounded-full`) con `bg-surface-sunken` + ícono `Utensils` cuando `!isCompleted` y `bg-ember-500` + `Check` cuando `isCompleted` (espejar `Nut_Meal`).
- **Verdict:** CONFIRMED (P1). Verificado contra `MealCard.tsx:91-132`: el botón es `w-11 h-11 rounded-xl` con un anillo interno `w-7 h-7 rounded-full border-2` (28px) — hueco `border-muted-foreground/30` sin ícono en pendiente, ember+`CheckCircle2` solo al completar. El kit móvil (`Nut_Meal:180-181`) Y el desktop (`desktop-coach.jsx:894`, `Ic(logged?'check':'utensils')`) coinciden en el círculo pleno 44px con glifo de cubiertos. Control prominente repetido por comida con firma visual (cubiertos) perdida y forma errónea. Gap real, no refutable.

## P1 — Método del plato: el kit es un dona compacta (86px) con ícono central + leyenda a la derecha (horizontal); la app es un pie sólido grande (160px) con leyenda debajo (vertical)
- **Kit:** `alumno-nutricion.jsx:44-64` (`Nut_Plate`) — `conic-gradient` **dona** 86×86 a la IZQUIERDA con hueco central (`inset:24`) y un ícono `utensils` en el centro; leyenda (3 filas: punto de color + nombre + %) a la DERECHA, `display:flex gap:16`.
- **App:** `ProportionPlate.tsx:129-221` (vía `PlatePanel.tsx`) — SVG **pie sólido** de 160px (sin hueco central, sin ícono) ARRIBA; leyenda vertical centrada DEBAJO (`flex-col items-center`).
- **Diferencia:** orientación (horizontal vs vertical), forma (dona con cubiertos en el centro vs pie liso) y tamaño. Es un elemento solo-móvil del kit (el rail desktop de `DesktopPlan` no tiene plato).
- **Fix:** renderizar el plato como dona (~86px) con hueco + ícono `Utensils` central y disponer la leyenda a la derecha en un `flex` horizontal. (El color de "verduras" con `--color-macro-fats` en vez de `success-500` es una decisión semántica deliberada de la app — no es gap.)
- **Verdict:** CONFIRMED (P1). `ProportionPlate.tsx:129-221` confirma: SVG pie SÓLIDO (`wedgePath` traza a `cx,cy`, sin hueco), `size=160` por defecto, sin ícono central, leyenda `<ul flex flex-col>` DEBAJO (contenedor `flex flex-col items-center`). El kit (`Nut_Plate:50-52`) es dona 86px `inset:24` + `utensils` centro + leyenda horizontal a la derecha. Cuatro desviaciones simultáneas (forma/tamaño/orientación/ícono) en un componente distintivo. La exclusión del color veg (`--color-macro-fats`, documentada como deliberada en `ProportionPlate.tsx:47-59`) está bien hecha. Gap real.

## P1 — Los títulos de sección no usan el `SectionTitle` del kit (font-display 17px/800) y falta el título "Comidas de hoy"
- **Kit:** `shared.jsx:61-67` (`SectionTitle`) — `h2 font-family:var(--font-display); font-weight:800; font-size:17px; letter-spacing:-0.02em`. Se usa para "Micronutrientes" (`:348`), "Método del plato" (`:361`), "Comidas de hoy" (`:368`) y "Recetas-idea de tu coach" (`:413`).
- **App:** los headings equivalentes usan labels chicos `text-sm font-semibold` (14px): "Micronutrientes" `MicrosPanel.tsx:116`, "Tu plato" `PlatePanel.tsx:28`, "Notas del día" `NutritionShell.tsx:1035`; el heading de recetas es `text-xs` uppercase (`RecipeIdeasSection.tsx:29`). Además **no existe el título "Comidas de hoy"** sobre la lista de comidas (`NutritionShell.tsx:936-1001` renderiza los `MealCard` sin encabezado).
- **Diferencia:** jerarquía tipográfica más débil que el kit; el `--font-display` (Archivo) confirmado en `globals.css:21` no se aplica a estos encabezados.
- **Fix:** promover estos headings al patrón `SectionTitle` (font-display ~17px, weight 800) y agregar un título "Comidas de hoy" encima de la lista de comidas.
- **Verdict:** CONFIRMED (P1). `SectionTitle` (shared.jsx:61-67) = `font-display / 800 / 17px` y el kit lo usa para Micronutrientes (:348), Método del plato (:361), Comidas de hoy (:368) y Recetas-idea (:413). App: `MicrosPanel.tsx:116` y `PlatePanel.tsx:28` usan `text-sm font-semibold` (14px), recetas `text-xs uppercase` (`RecipeIdeasSection.tsx:29`), y NO hay título "Comidas de hoy" sobre la lista (`NutritionShell.tsx:936-1001` pinta `MealCard` sin encabezado). Token `--font-display` existe (globals.css:21) pero no se aplica. CORRECCIÓN MENOR: el ejemplo "Notas del día" (`NutritionShell.tsx:1035`) NO es un gap de `SectionTitle` — el kit tampoco usa `SectionTitle` para notas (heading interno 13px/700 en `Nut_Notes:104`); el hallazgo se sostiene igual por los otros 3 headings + el título ausente. (Nota de impl.: `--font-display` es `@theme inline`, no var CSS emitida — el fix debe usar la utility class `font-display`, no `var(--font-display)`.)

## P1 — Panel de micros: falta el sub-encabezado "Avanzados · PRO" con badge y el panel arranca colapsado
- **Kit:** `alumno-nutricion.jsx:348-358` — "Micronutrientes" es una `Card` **siempre visible**; muestra los micros base, luego un divisor (`height:1 border-subtle`) + `"AVANZADOS"` uppercase + **pill `PRO`** (`sport-100`/`sport-600`), y debajo las barras avanzadas o el mensaje "Azúcar y grasas detalladas con Nutrición Pro de tu coach."
- **App:** `MicrosPanel.tsx:100-201` — acordeón **colapsado por defecto** (`useState(false)`); las filas avanzadas se agregan sin el divisor rotulado "AVANZADOS/PRO"; el estado no-Pro muestra una nota plana "Nutrición Pro desbloquea más micros (azúcar, grasas)." (`:192-195`).
- **Diferencia:** (a) el panel oculta las barras tras un chevron (el kit las muestra directamente); (b) se pierde el sub-encabezado con la pill PRO que enmarca la sección avanzada.
- **Fix:** renderizar los micros abiertos (o al menos las barras visibles) y agregar el divisor "AVANZADOS" + pill `PRO` antes de las filas avanzadas, espejando el kit.
- **Verdict:** DOWNGRADED → P2. Los hechos son ciertos (verificado `MicrosPanel.tsx:78` `useState(false)` colapsado; filas avanzadas sin divisor rotulado; nota plana `:192-196`; kit `:349-357` siempre visible con divisor "AVANZADOS"+pill PRO). PERO la parte (a) —panel colapsado por defecto— es una **decisión intencional documentada** en el propio componente ("Collapsible … closed by default — progressive disclosure", `MicrosPanel.tsx:55-61`), no un gap. Queda solo la parte (b): el divisor rotulado "AVANZADOS · PRO", que aparece UNA vez, dentro de un panel colapsado, y es un añadido de estilo menor → severidad P2, no P1.

## P1 — Adherencia 30 días: el kit es una tira de una sola fila de 30 barras; la app es una grilla heatmap de 10×3
- **Kit (móvil y desktop):** `alumno-nutricion.jsx:405-409` — `display:flex gap:3` con 30 barras (`flex:1 height:26 rounded:3`), ember si adherente / `--track` si no; header "Adherencia · 30 días" + "84%" mono. El rail desktop de `DesktopPlan` (`desktop-coach.jsx:940-941`) usa **la misma tira de una fila** (height 24). Binario ember/track.
- **App:** `AdherenceStrip.tsx:73-95` — `grid grid-cols-10` (3 filas) de cuadrados pequeños, graduados en 4 colores (ember ≥80% / amber 50-79 / rojo 1-49 / track 0), header "Adherencia — 30 días" + "X/30 días" + fila de leyenda + ring en el día de hoy.
- **Diferencia:** el layout difiere en AMBOS breakpoints del kit (fila única vs grilla de 3 filas). La graduación por color es riqueza extra legítima, pero la disposición no coincide.
- **Fix:** renderizar como tira horizontal de una fila (`flex`, cada celda `flex:1`), conservando —si se quiere— la graduación de color dentro de la tira.
- **Verdict:** DOWNGRADED → P2. Los hechos son ciertos (verificado kit móvil `:405-409` y desktop `desktop-coach.jsx:941`: ambos = tira de UNA fila `flex gap:3`, binario ember/track; app `AdherenceStrip.tsx:73-95` = `grid grid-cols-10` de 3 filas, 4 colores + leyenda + ring hoy). La desviación se reduce a la DISPOSICIÓN (1 fila vs 3 filas) de las mismas 30 celdas, en un elemento secundario/informativo donde la app es MÁS rica (graduación de 4 tramos + leyenda + ring del día requieren mayor área por celda → la grilla 10×3 es una elección de legibilidad coherente, no drift). Mismatch real pero de baja severidad → P2.

---

## P2 — Header de pantalla: título más chico que el kit y eyebrow/subtítulo invertidos
- **Kit:** `shared.jsx:42-58` (`TopBar`) — subtítulo como **eyebrow UPPERCASE** (12px, weight 700, `tracking .08em`) ENCIMA del `h1`; título `font-display weight 900, 26px, letter-spacing -0.03em`.
- **App:** `page.tsx:148-151` — `h1 text-lg` (18px) `font-black`; el `plan.name` va como caption diminuto (10px) DEBAJO del título, sin uppercase ni tracking de eyebrow.
- **Diferencia:** título más pequeño y relación eyebrow↔título invertida. Probablemente consistente en todo el shell del alumno (header sticky compacto con back-arrow, chrome de app), así que puede ser decisión global — verificar contra otras pantallas antes de tocar.
- **Fix:** llevar el título a ~26px `font-display` 900 y renderizar `plan.name` como eyebrow uppercase por encima.

## P2 — Recap semanal: la app pierde el tratamiento de tarjeta tintada sport + ícono `sparkles`
- **Kit:** `alumno-nutricion.jsx:8-19` (`Nut_Recap`) — `Card` `background:var(--sport-100)`, borde sport, cuadrado 40×40 `sport-500` con ícono `sparkles` a la IZQUIERDA, título + stat inline, cuerpo debajo.
- **App:** `WeeklyRecapCard.tsx:69-127` — fondo gradiente por tono (`from-primary/10` etc.), **sin badge de ícono a la izquierda**, pill "Tu semana" a la derecha, número 4xl de adherencia + delta + días + botón compartir (más rico).
- **Diferencia:** la riqueza se mantiene; cambia el contenedor (sin la tarjeta tintada sport + sparkles del kit).
- **Fix (opcional):** agregar el badge `sparkles` a la izquierda y alinear el tratamiento de tarjeta tintada; baja prioridad.

## P2 — Recetas-idea: el kit es un carrusel horizontal de tarjetas 168px; la app es una lista vertical
- **Kit:** `alumno-nutricion.jsx:413-425` — `SectionTitle` + fila con scroll horizontal (`overflow-x:auto`) de tarjetas de 168px (ícono `book-open`, nombre, badge tag, `kcal · P` mono).
- **App:** `RecipeIdeasSection.tsx:39-83` — lista vertical de tarjetas full-width dashed ámbar con thumbnail de imagen (56px) + badge "Idea" + bottom-sheet de detalle al tocar.
- **Diferencia:** riqueza mantenida (imágenes, sheet de detalle, ausencia de macros es intencional para "inspiración"); difiere el layout (carrusel horizontal vs stack vertical).
- **Fix (opcional):** un carrusel horizontal acercaría al kit; baja prioridad.

## P2 — Banner de contexto de entreno usa `sky` hardcodeado en vez del token `sport`/theme
- **Kit:** `alumno-nutricion.jsx:297-302` — `Card` `background:var(--sport-100)`, borde sport, cuadrado `var(--sport-500)` con ícono `dumbbell`. `sport` deriva del color del coach (white-label).
- **App:** `WorkoutContextBanner.tsx:13-17` — `border-sky-500/25 bg-sky-500/10` + `text-sky-*`, un cian fijo que NO sigue el token de marca `sport`/`--theme-primary`.
- **Diferencia:** drift de token — el banner debería tintarse con el color del coach (sport), no con un cian estático.
- **Fix:** cambiar `sky-*` por `sport-*` / `--theme-primary` para respetar el white-label.

## P2 — Hilo de notas: el kit usa avatares + burbuja propia rellena de acento; la app usa labels de rol de texto + burbuja neutra
- **Kit:** `alumno-nutricion.jsx:97-126` (`Nut_Notes`) — coach con `Avatar` (ring sport) / alumno con chip de iniciales; burbuja del coach `surface-sunken`, burbuja PROPIA (alumno) `var(--cta-fill)` **rellena de acento con texto blanco**; input tipo pill + botón redondo sport-500.
- **App:** `NotesThread.tsx:90-177` — labels de texto ("Coach"/"Alumno") + timestamp arriba de cada burbuja, **sin avatares**; burbuja propia `bg-muted` (gris neutro, no acento); textarea de 2 filas + botón `primary`.
- **Diferencia:** se pierde la convención de chat "mi mensaje = burbuja de acento rellena" y los avatares del kit.
- **Fix (opcional):** rellenar la burbuja propia con el acento (cta-fill/primary) y, opcionalmente, sumar avatares.

---

## Elementos verificados 1:1 (sin gap)
- **Anillos de macros** (`MacroRingSummary.tsx`) ↔ `Card variant="inverse"` del kit (`:333-345`): superficie oscura, anillo grande de kcal ember con centro "RESTANTES/DE MÁS" + 3 anillos macro (proteína ember / carbos sport / grasas aqua). 1:1.
- **Racha** (`NutritionStreakBanner.tsx`) ↔ `Nut_Streak` (`:323-330`): `bg-ember-100 border-ember-200`, flame en círculo `ember-500` 40px, "N de 7 días de racha" `ember-700`, número grande `font-display` a la derecha. 1:1 (+ variante "en riesgo" ámbar = riqueza extra).
- **Navegador por día** (`DayNavigator.tsx`) ↔ `:305-312`: chevrons + label + "Volver a hoy". 1:1 (+ swipe).
- **Off-plan** (`OffPlanLogger.tsx`) ↔ `OffPlanLogger` de `alumno.jsx:567`: botón dashed "Registrar algo más" + bottom-sheet con handle, búsqueda, recientes en chips, resultados. 1:1.
- **Lista de compras** (`ShoppingListView.tsx`) ↔ `Nut_Shopping` (`:129-167`): colapsable (`<details>` en `NutritionShell.tsx:1108`), agrupada por pasillo, check-off con tachado. 1:1 (+ compartir/copiar/alta manual = riqueza extra).
- **Chips de intercambio** (`ExchangeMealChips.tsx`) ↔ `:194-199`: fila de códigos por comida; la app usa círculo de código coloreado + porciones (variante menor, aceptable).
- **Hoja de equivalencias** (`ExchangeEquivalencesSheet.tsx`) — variante por-grupo buscable (más funcional que el overview de todos los grupos del `Nut_ExchangeSheet` del kit); riqueza mantenida, no es gap.
- **Layout 2-col desktop** (`NutritionShell.tsx:902-1138`) ↔ `DesktopPlan`: comidas izq + rail sticky der (racha · anillos · micros · plato · adherencia). Portado correctamente.

Verificado 1:1.

---

## Fix log (2026-07-02)

Implementados los CONFIRMED + P2 baratos del informe (lado alumno, `apps/web`). White-label respetado: cero colores de marca hardcodeados; se usó la rampa `sport`/`ember` de tokens EVA DS. No se corrió typecheck/build/tests (fuera de alcance del worker).

- **P1 (CONFIRMED) — Completar comida:** `MealCard.tsx` — el botón pasó de anillo hueco 28px (`w-7 h-7 rounded-full border-2`) a **círculo pleno 44px** (`w-11 h-11 rounded-full`): pendiente = `bg-surface-sunken` + ícono `Utensils` (w-5 h-5, `text-muted-foreground`); completo = `bg-ember-500 text-white` + `Check` + `shadow-[var(--glow-ember)]`. Se conserva el spring elástico y el mismo handler optimista (`handleToggle`). Import: `CheckCircle2` → `Check, Utensils`.
- **P1 (CONFIRMED) — Método del plato:** `components/nutrition/ProportionPlate.tsx` (solo lo renderiza `PlatePanel` del alumno; sin uso en coach) — pie sólido 160px → **dona ~96px** con hueco central (`<circle r={r*0.44} fill="var(--card)">`) + ícono `Utensils` centrado, y **leyenda a la derecha** (layout horizontal `flex items-center gap-4`, filas dot·nombre(flex-1)·% a la derecha). `size` default 160 → 96. Se mantiene el color veg `--color-macro-fats` (decisión deliberada), el `aria-label` del SVG y la nota "proporción sugerida".
- **P1 (CONFIRMED) — SectionTitle 17/800 + "Comidas de hoy":** headings promovidos a `font-display text-[17px] font-extrabold tracking-tight text-foreground` en `MicrosPanel` ("Micronutrientes"), `PlatePanel` ("Tu plato") y `RecipeIdeasSection` ("Ideas de recetas", se quitó `text-xs uppercase tracking-widest`). Nuevo título **"Comidas de hoy"** en `NutritionShell.tsx` sobre la lista de comidas (gated en `mealsVisible.length > 0`; usa `isToday ? 'Comidas de hoy' : 'Comidas del día'`).
- **P2 (DOWNGRADED, barato) — divisor "AVANZADOS · PRO":** `MicrosPanel.tsx` — se separaron `baseRows`/`advancedRows` (helper `renderRow`) y se agregó el divisor `h-px bg-border/60` + label "Avanzados" + pill `PRO` (`bg-sport-100 text-sport-600`) antes de las filas avanzadas; no-Pro muestra "Azúcar y grasas detalladas con Nutrición Pro de tu coach.". El panel sigue colapsado por defecto (decisión documentada, no gap).
- **P2 (CLAVE, BUG white-label) — WorkoutContextBanner:** `WorkoutContextBanner.tsx` — `sky-*` hardcodeado → tokens `sport-*` (`border-sport-500/25 bg-sport-500/10 text-sport-700 dark:text-sport-200`, icono `text-sport-600 dark:text-sport-300`, tooltip `text-sport-600/70 dark:text-sport-300/80`). Ahora tinta con el color del coach.

**No tocado (justificado):**
- **P2 Adherencia 30d (DOWNGRADED):** grilla 10×3 → 1 fila NO es swap barato (rework de layout) y el propio verdict defiende la grilla como elección de legibilidad coherente (4 tramos + leyenda + ring de hoy). Diferido.
- **P2 header pantalla / recap sparkles / recetas carrusel / notas burbuja-acento:** marcados "opcional/baja prioridad" en el informe; el header además requiere verificación global cross-pantalla y las notas comparten componente con coach. Fuera de scope de swaps baratos.
