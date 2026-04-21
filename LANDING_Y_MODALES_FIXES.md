# Landing y modales fixes

> Plan de ajustes en la landing (hero con carcasa negra/blanca por tema, menú móvil aestético, pestañas de Panel coach con indicador animado, sección de precios sin bullets repetidos, reemplazo de "Casos de uso" por una sección Panel alumno con mockups animados) y dos fixes de modales en la app coach (Nuevo alimento detrás del header; X del comparador de fotos inalcanzable en móvil).

Fuente de verdad investigada: hero en `src/app/page.tsx` + `src/components/landing/LandingDeviceShowcase.tsx` + `src/components/landing/landing-coach-dioramas.tsx`; pestañas en `src/components/landing/LandingCoachTabs.tsx`; precios en `src/components/landing/LandingPricingPreview.tsx` + `src/lib/constants.ts`; casos de uso en `src/components/landing/LandingUseCases.tsx`; client shell en `src/app/c/[coach_slug]/**` + `src/components/client/ClientNav.tsx`; modales en `src/components/ui/dialog.tsx`, `src/app/coach/nutrition-plans/_components/FoodLibrary.tsx`, `src/components/coach/PhotoComparisonSlider.tsx`. Barra móvil del coach: `src/components/coach/CoachSidebar.tsx` (`z-[55]`, `pt-safe pb-3`).

---

## 1. Hero: carcasa negra en claro, blanca en oscuro

Archivos: `src/components/landing/LandingDeviceShowcase.tsx` y `src/components/landing/landing-coach-dioramas.tsx`.

Cambios:

- **Ventana desktop (browser chrome)**: el contenedor exterior y su barra superior pasan a fondo negro en claro y blanco en oscuro. Sustituir:
  - `border-border bg-card/80 ... dark:bg-card/50` -> `border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100` en el wrapper.
  - Barra de pestaña/URL (`border-b border-border/60 bg-muted/30`) -> `border-b border-zinc-800 bg-zinc-900 dark:border-zinc-200 dark:bg-zinc-100`.
  - Input de URL: contraste sobre barra oscura -> `border-zinc-700/60 bg-zinc-800/70 text-zinc-200 dark:border-zinc-300/60 dark:bg-zinc-200 dark:text-zinc-800`.
  - Área de contenido (`rounded-b-xl bg-background/50 dark:bg-zinc-950/50`) mantener con `bg-background` para que el mock interno siga legible con `border-border`.
- **Marco interno MiniCoachShell** en `landing-coach-dioramas.tsx`: `border-border bg-white/90 dark:bg-zinc-950` se mantiene (es la pantalla), pero añadir 1 px de separación visual con la carcasa gracias al padding del wrapper (sin tocar).
- **Móvil `DioramaClientPhone`**: bezel actual `border-4 border-zinc-300 ... dark:border-zinc-700` -> `border-[6px] border-zinc-900 dark:border-zinc-100`, sombra reforzada; "dynamic island" actual `bg-zinc-400/80 dark:bg-zinc-800` -> `bg-zinc-700 dark:bg-zinc-300` para mantener contraste sobre la pantalla.

Aceptación: en claro el set se lee como "laptop + móvil con carcasa negra"; en oscuro ambos aparecen con carcasa blanca contrastando con el fondo oscuro de la app.

## 2. Menú móvil del mockup (bottom nav aestético)

Archivo: `src/components/landing/landing-coach-dioramas.tsx`, función `DioramaClientPhone`, bloque "`mt-auto flex justify-around ...`" (aprox. 425-442).

Cambios:

- Quitar bordes cuadrados en ítems inactivos: `border border-transparent rounded-xl` -> solo icono sin fondo ni borde (`rounded-full` y sin `border`).
- Ítem activo: pastilla rellena con `bg-primary/15 text-primary` y sombrita, con **indicador superior** (3 px) centrado con `var(--theme-primary)` para reforzar la noción de "tab actual" (similar a iOS).
- Íconos: `strokeWidth={2}`; usar `h-[18px] w-[18px]`.
- Añadir una **etiqueta** muy pequeña (`text-[9px] font-semibold`) debajo del ícono activo ("Inicio") y vacía/oculta en los demás.
- Contenedor: `bg-background/90 dark:bg-zinc-900/95`, `border-t border-border/60`, padding `pt-2 pb-[10px]`.

Aceptación: el bottom nav del mock se ve como un menú real de app móvil, no como 4 cuadrados vacíos.

## 3. Panel coach: indicador animado de pestaña activa

Archivo: `src/components/landing/LandingCoachTabs.tsx`.

Cambios:

- Añadir **subrayado deslizante** con `framer-motion` usando `layoutId="coach-tabs-underline"` bajo la pestaña activa; grosor 2.5 px, color `bg-primary`.
- Pestaña activa: `text-foreground font-bold`; inactivas: `text-muted-foreground hover:text-foreground`.
- En móvil (scroll horizontal), `scroll-snap-x` para fluidez y mismo underline animado.
- `AnimatePresence mode="wait"` en el panel contenido para un fade suave al cambiar de tab.

Aceptación: al cambiar de pestaña tanto en móvil como desktop la barra se desliza al nuevo destino y la pestaña activa queda claramente marcada.

## 4. Precios: bullets compartidos fuera + copy correcto por tier

Archivo: `src/components/landing/LandingPricingPreview.tsx`.

Cambios:

- **Fuera de los cards** (franja justo sobre la grilla): bloque "Todos los planes incluyen" con los 5 items compartidos (`routinesUnlimited`, `catalogGif`, `programs`, `checkin`, `dashboard`). Layout: grid 1/2/5 columnas responsive con chip + check.
- **Dentro de cada card** dejar solo diferenciadores: rango de alumnos, badge verde de nutrición o neutro, badge de billing.
- **Billing/copy**: badge del card usa `monthlyOnly` para Starter/Pro y `monthlyQuarterlyAnnual` para Elite/Scale; se elimina la rama muerta `quarterlyAnnual`.
- Se elimina el `ul` de features del `PlanCard` (ya no repite los 5 bullets compartidos).
- Nuevas claves i18n: `landing.pricing.includedEyebrow`, `landing.pricing.includedTitle`, `landing.pricing.includedSubtitle`.

Aceptación: los 4 cards ya no repiten los 5 bullets; un bloque común los muestra una sola vez; Starter/Pro sin bloque prepago; Elite/Scale con mensual y prepago trimestral/anual.

## 5. Reemplazar "Casos de uso" por sección Panel alumno

Pasos:

- Quitar `<LandingUseCases />` en `src/app/page.tsx` y eliminar el archivo `LandingUseCases.tsx`.
- Crear **`src/components/landing/LandingStudentTabs.tsx`** con 4 pestañas basadas en el `ClientNav` real:
  1. **Inicio** — StreakWidget (pill naranja con flame + días), 3 rings de cumplimiento (Entrenos/Nutrición/Check-ins), barra de progreso de series, calendario semanal con puntos.
  2. **Plan Alimenticio** — 3 rings de macros (proteína/carbs/grasas), barra de kcal consumidas vs objetivo, lista de comidas con checkbox.
  3. **Aprender** — chips de grupos musculares, grid de tarjetas de ejercicio con thumbnail.
  4. **Check-in** — wizard en 3 pasos (peso, energía, fotos) con stepper interactivo.
- **Animaciones** con `framer-motion`:
  - Anillos crecen de 0% a valor final al entrar en viewport (`whileInView`).
  - Barras con `width: 0 -> target`.
  - Cards de ejercicios con `staggerChildren`.
  - Wizard con `AnimatePresence` alternando pasos mediante botones Atrás/Siguiente.
- Mismo patrón de tabs (underline `layoutId="student-tabs-underline"`) que `LandingCoachTabs`.
- Mockup unificado en un `PhoneFrame` con bezel negro/blanco por tema (coherente con el hero) y bottom nav propio.
- Copy i18n: claves bajo `landing.studentTabs.*` en `src/lib/i18n/es.json` y `src/lib/i18n/en.json`.

Aceptación: en `/` ya no aparece "Lo que EVA resuelve día a día"; en su lugar hay una sección con tabs animadas que muestra los 4 menús del alumno con visuales que reflejan los componentes reales.

## 6. Fix modales coach

### 6a. "Nuevo alimento" queda detrás del header móvil

Archivo: `src/components/ui/dialog.tsx` (shared).

- Subir el z-index del overlay y del popup: `z-50` -> `z-[70]` en `DialogOverlay` y `z-[71]` en `DialogContent`. Mismo rango que `Sheet` para que ambos primitives queden sobre la barra móvil del coach (`z-[55]`).

### 6b. Comparativa de fotos: X no se puede pulsar en móvil

Archivo: `src/components/coach/PhotoComparisonSlider.tsx`.

- El `DialogContent` ya sube a `z-[71]` con 6a, así que el modal cubre el header.
- Botón cerrar: `top: max(0.75rem, calc(env(safe-area-inset-top, 0px) + 0.25rem))` y `right-3`; se añade `aria-label="Cerrar comparativa"` y `focus-visible:ring`.
- Bloque de título: mismo offset con safe-area (`top: max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))`) para que no lo corte el notch.

Aceptación: en iPhone con notch, la X del comparador es pulsable; el modal de nuevo alimento aparece íntegro sobre el header.

## 7. Verificación

- `npm run typecheck` limpio.
- QA manual rápida:
  - Landing en claro/oscuro: carcasa negra/blanca + menú móvil visible y aestético + tabs coach con underline deslizante + cards precios sin bullets repetidos + nueva sección Panel alumno.
  - App coach móvil: abrir "Nuevo alimento" en `/coach/nutrition-plans` (no debería quedar detrás del header); abrir comparativa de fotos en el progreso del cliente (X accesible).
