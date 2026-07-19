# 4A-01 — Ruteo del tab Nutrición + chrome (P0)

Archivos RN de la unidad: `apps/mobile/app/alumno/(tabs)/nutricion.tsx`,
`apps/mobile/app/alumno/(tabs)/_layout.tsx`, movimiento de `apps/mobile/app/alumno/nutrition-v2/*`
bajo `(tabs)` como rutas ocultas (patrón 2R-1 de movement/bodycomp).
**Debe correr en wave propia ANTES que 4A-02/03/04/08/09** (mueve los archivos que ellas editan).

## Afirmaciones (evidencia web) y delta RN

1. **El destino canónico del ítem "Nutrición" es V2.**
   Web: `apps/web/src/app/c/[coach_slug]/nutrition/page.tsx:67-80` — con `isNutritionV2Enabled(...)`
   la página V1 hace `redirect(`${base}/nutrition-v2`)`; el nav (`ClientNav.tsx:120`) apunta a `/nutrition`.
   RN: `app/alumno/(tabs)/nutricion.tsx` NO consulta `isEnabled('nutritionV2Student')` (0 matches) y
   renderiza el shell V1 siempre. El alumno RN con V2 activo ve una experiencia distinta a la web.
   **Delta P0.** Cierre: con flag on, tocar el tab Nutrición muestra la experiencia V2 (tabs Hoy/Plan/Historial);
   con flag off, sigue mostrando V1 intacta.

2. **La superficie V2 conserva el chrome del alumno (cápsula con tab activo).**
   Web: `/nutrition-v2` vive dentro del layout `/c/[coach_slug]` → la cápsula `ClientNav` sigue visible con
   "Nutrición" activa (misma señal que `ClientNav.tsx:120`). El scanner también (`scanner/page.tsx:49-66`).
   RN: `app/alumno/nutrition-v2/{index,add-food-v2,scanner}.tsx` viven FUERA de `(tabs)` → sin cápsula.
   **Delta P0 de chrome.** Cierre: las tres pantallas viven bajo `(tabs)` como rutas `href:null`
   (mismo mecanismo documentado en `AlumnoMobileChrome.tsx:114-119` para movement/bodycomp), con el tile
   "Nutrición" encendido en index y deep links `/alumno/nutrition-v2*` preservados.

3. **Gate del dominio también en la pantalla, no solo en el nav.**
   Web: el redirect + `showNutrition` del nav aseguran que dominio OFF jamás muestra nutrición
   (`ClientNav.tsx:44-46,120`). RN: la cápsula oculta el tile (`AlumnoMobileChrome.tsx:143`) pero
   `app/alumno/nutrition-v2/index.tsx` no chequea `nutritionEnabled` — un deep-link (widget de Inicio,
   notificación) muestra la V2 con dominio apagado. El shell V1 sí lo hace (`nutricion.tsx:507-515`).
   **Delta P1.** Cierre: con `nutritionEnabled=false`, la pantalla V2 muestra el mismo estado que V1
   (`NutritionDomainOff` o equivalente V2) y nunca el plan.

4. **Header del hub: sin eyebrow "Vista previa", con flecha de volver.**
   Web: `page.tsx:62-66` — `NutritionPageShell` con `title="Nutrición"`,
   `description="Prescripción, consumo real e historial en una sola experiencia."`,
   `backHref={base}/dashboard` y SIN eyebrow; la variante compacta con flecha es
   `NutritionV2Kit.tsx:122-150` (web). RN: `index.tsx:1166-1170` pasa `eyebrow="Vista previa"` y el
   `NutritionHeader` RN no tiene variante con flecha (`components/nutrition-v2/NutritionV2Kit.tsx:106-135`).
   Nota: si la pantalla queda como tab (afirmación 1-2), la flecha "Volver" puede quedar como adaptación
   omitida (los tabs RN no tienen back) — decisión a documentar; el eyebrow "Vista previa" se ELIMINA sí o sí.
   Cierre: header RN = título "Nutrición" + descripción exacta de la web, sin eyebrow.

## Comprobación objetiva de cierre

- Device/emulador con flag on: tab Nutrición → V2 con cápsula visible y tile activo; flag off → V1.
- Deep link `evafit://alumno/nutrition-v2` (y push del widget) → misma pantalla, cápsula visible.
- Dominio OFF (coach apaga nutrición): tile oculto Y pantalla V2 inaccesible/estado apagado.
- `pnpm exec tsc --noEmit` en `apps/mobile` verde.
