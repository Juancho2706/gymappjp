# Auditoría — Vista del alumno · Nutrición V2 (web/PWA)

Fecha: 2026-07-16 · Rama: `fix/qa-ceo-1` · Alcance: `c/[coach_slug]/nutrition-v2/**` + kit `components/nutrition-v2/**`.
Contexto: el CEO entró como alumno de prueba (canary) y reportó "se veía medio feo". Foco: pulido presentacional con tokens del DS. No se tocó lógica, datos ni flujos. El color de marca (naranja/ember) lo ajusta otro agente.

## Hallazgos

| # | Severidad | Hallazgo | Estado |
|---|-----------|----------|--------|
| 1 | Media | Desktop: la vista del alumno no lleva `aside`, así que las cards se estiraban a todo el ancho del shell (`max-w-[1440px]`) → línea de lectura larguísima y aire mal repartido. | ARREGLADO |
| 2 | Media | Faltaba `tabular-nums` en las cifras clave (kcal grande de Energía, "restantes", kcal de Historial y de Plan). Al ser dígitos proporcionales, saltaban de fila a fila y en cada refresh. | ARREGLADO |
| 3 | Baja | Cifras de macros/subtotales en `FoodRow`/`MealSlotCard` ya usan `font-mono` (ancho fijo) → no requieren cambio. | OK, sin cambio |
| 4 | Baja | Estados vacíos: los de página completa usan ilustración del CEO (`sin-plan`, `historial-vacio`); el empty in-page de "Consumido hoy" usa glifo lucide. Es una regla razonable (sección vs página), no un bug. | OK |
| 5 | Info | Dark mode y contraste: se usan tokens en todo (`text-strong/muted/subtle`, `surface-*`, `border-*`) y las tonalidades success/warning/danger traen variante dark. No se detectó contraste malo salvo el uso del acento de marca (fuera de mi alcance). | OK |
| 6 | Media | Fechas crudas ISO: Historial muestra `2026-07-16` como título y el badge de versión dice "desde 2026-07-16". Se ve técnico/feo. Formatear roza presentación de dato → lo dejo como recomendación para evitar tocar utilidades. | RECOMENDACIÓN |
| 7 | Baja | `MacroBudget` apila los 3 macros en 1 columna en móvil (mucho scroll vertical). En pantallas chicas 3-col compacto sería más escaneable. | RECOMENDACIÓN |
| 8 | Info | Espaciado/DS (`space-y-5`, `rounded-card`, `shadow-sm`, jerarquía `font-display`) consistente. CTA principal ("Registrar alimento") claro y único; "Escanear" secundario correcto. | OK |

## Fixes aplicados (solo className/estructura, sin lógica)

- `apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:79-85` — envolví las tres vistas (Hoy/Plan/Historial) en `mx-auto w-full max-w-2xl` → columna de lectura cómoda y centrada en desktop, una columna en móvil.
- `apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:164` — `tabular-nums` en el subtítulo de la card de Plan (franjas · kcal).
- `apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx:201` — `tabular-nums` en el resumen de cada día del Historial (registros · kcal).
- `apps/web/src/components/nutrition-v2/NutritionV2Overrides.tsx:60` — `tabular-nums` en la cifra grande de Energía (`font-display`, era la que más saltaba).
- `apps/web/src/components/nutrition-v2/NutritionV2Overrides.tsx:65` — `tabular-nums` en "N restantes".

## Recomendaciones para después (por impacto)

1. Formatear fechas legibles (ej. "mié 16 jul") en Historial, títulos de día y `effectiveLabel` del badge de versión, con util de fecha compartida (evita el ISO crudo). Impacto alto en percepción.
2. `MacroBudget`: evaluar `grid-cols-3` compacto en móvil para escanear proteína/carbos/grasas de un vistazo.
3. Consistencia total de estados vacíos: darle ilustración al empty in-page de "Consumido hoy" si se quiere paridad visual estricta.
4. Menor: el toolbar (Hoy/Plan/Historial) y el header siguen a ancho completo mientras la columna queda centrada a `max-w-2xl`; si molesta el desalace, constreñir también header/toolbar de la superficie del alumno.

## Validación

`pnpm typecheck` ✓ · `pnpm check:nutrition-v2-boundaries` ✓ (64 archivos) · `vitest` nutrition-v2 (web) ✓ 27/27. Cambios 100% presentacionales.
