# 4A-05 — Shell del hub: header + selector Hoy/Plan/Historial

Archivos RN: `apps/mobile/app/alumno/nutrition-v2/index.tsx` (bloques `StudentNutritionV2Screen`,
`NutritionTabBar`, gates `!ready`/`!enabled`). Comparte archivo con 4A-02/03/04/06 → wave separada.
(El header con flecha/eyebrow se especificó en 4A-01 afirmación 4; aquí el resto del shell.)

## Afirmaciones y deltas

1. **Toolbar contenedor.**
   Web `NutritionV2Kit.tsx` (web) `NutritionToolbar` 169-180: `min-h-12 rounded-card border
   border-border-subtle bg-surface-card p-2 shadow-sm`, hijos con `gap-2`, flex-wrap.
   RN `index.tsx:1194-1223` usa un contenedor propio `rounded-control border p-1 gap-1`.
   **Deltas:** radio (card vs control), padding (p-2 vs p-1), gap (2 vs 1), min-h (12 vs 11 por ítem),
   sin sombra. Cierre: contenedor con `rounded-card p-2 gap-2 min-h-12` (sombra: RN no tiene shadow-sm
   token equivalente en el kit — usar la misma decisión que el resto del kit, ver 4A-07).

2. **Pills de vista.**
   Web `page.tsx:115-140` (`ViewLink`): activo = `min-h-10 flex-1 rounded-control bg-primary/100
   text-white text-sm font-semibold gap-2` + icono h-4 w-4 (16px) de lucide (`Utensils/ListChecks/History`,
   `page.tsx:68-76`); inactivo = `text-muted hover:bg-surface-sunken`; `aria-current="page"`.
   RN `index.tsx:1201-1220`: activo `bg-primary` + texto blanco, icono 16, `gap-1.5`, `min-h-11`.
   **Deltas menores:** gap-1.5 vs gap-2; min-h-11 vs min-h-10 (44pt táctil RN = adaptación válida,
   documentar). Labels e íconos en paridad ("Hoy", "Plan", "Historial").
   Cierre: gap-2; el resto en paridad.

3. **Persistencia de vista.** Web usa querystring (`?view=plan`) → volver desde el scanner conserva
   la vista por URL. RN usa estado local `useState('today')` (`index.tsx:1132`) → volver de add-food
   o scanner siempre re-monta en Hoy… en realidad el estado se conserva porque la pantalla queda en
   el stack (router.push). Paridad funcional aceptable; sin cambio.

4. **Transición entre tabs.** RN agrega fade Moti por tab (`index.tsx:1173-1183`). Web no anima el
   cambio de vista (recarga RSC con skeleton `ViewSkeleton`, `page.tsx:84-98`). Delta menor RN-extra;
   aceptable como adaptación (la web "anima" con skeleton). Documentar.

5. **Gate no-habilitado.** Copys RN `index.tsx:1142-1160` ("Nutrición todavía no está disponible para
   ti" + botón "Volver a Nutrición"): sin contraparte web (web redirige). Adaptación documentada en
   INVENTARIO §2. Con 4A-01 aplicado, este estado casi no se ve (el tab decide V1/V2); conservar como
   fallback.

6. **Skeleton de carga del shell.** Web `loading.tsx:10-43` pinta toolbar + hero + 2 cards; RN usa
   `NutritionSkeleton variant="today"` (`index.tsx:1134-1140`). Aproximación aceptable — cerrar con
   nota de adaptación (el skeleton RN no dibuja el toolbar).

## Comprobación objetiva

Captura del header+toolbar web móvil vs RN en los 3 tabs; medir radio/padding/gap del toolbar y del
pill activo; verificar labels/íconos y ausencia de eyebrow (4A-01).
