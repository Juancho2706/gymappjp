# PLAN — T2.7 Re-skin del alumno + paleta fija

Fases chicas, cada una entregable con gates propios. F1 no depende de ninguna decision abierta;
F2 arranca recien con D-A y D-C respondidas por el owner.

## F1 — Paleta de macros al trio fijo (web + RN, sin decision pendiente)

1. `packages/nutrition-v2/design.ts`: `NUTRITION_MACROS` pasa a los tokens canonicos
   (`webColor: var(--color-macro-*)`, `webTextClass: text-macro-*`, `webBarClass/nativeClass:
   bg-macro-*`). El trio es data-viz categorical fijo: JAMAS white-label, identico claro/oscuro
   (practica de prod de V1; las variantes `-dark` siguen sin usarse).
2. RN tokens: canales en `apps/mobile/global.css` (`--color-macro-protein: 94 159 214` ·
   `carbs: 255 183 77` · `fats: 129 199 132`) + colores `macro.*` en `tailwind.config.js`.
3. RN `resolveNutritionMacroColors()`: trio fijo literal, MUERE el parametro `brandColor`
   (y su `resolveSportRamp`); caller `AuraHero.tsx` deja de pasar la marca.
4. Hardcodes inventariados en la SPEC → tokens: `NutritionV2Overrides`, AuraHero web (mapa local),
   `DayTotalsBar`, `AddFoodSheet` web, AuraHero RN, `NutritionV2Kit`.
5. Tests: `mobile-aura-theme.test.ts` se invierte (ningun macro sigue la marca);
   `white-label-tokens.test.ts` debe seguir verde sin tocarse.

## F2 — Jerarquia del Hoy (espera D-A y D-C)

Banda de energia con rango sombreado (si D-A=banda) · checkbox primario y muerte de "Lo comi"
(si D-C=si) · nota del coach expandida en RN · "⇄ N equivalentes" literal en la fila ·
racha semanal "N de 7 en rango" (agregado de la semana visible, snapshot-first) ·
celebracion de dia completo (paridad web de las 3 piezas RN).

## F3 — Plan + Historial

Tendencia de 4 barras semanales arriba del historial · dias con nombre del coach ·
semana actual solo en Hoy (web mata el duplicado) · poda de chips de permisos en RN.

## F4 — Correccion: verificacion visual

Contra el mock: stepper hibrido, chips de razon primero, campo libre solo en "Otra…". Deltas
menores unicamente; el motor (correct_/void_) no se toca.

## F5 — Cierre

Re-QA visual completa (anillos/chips/barras de O1 cambian de color todos a la vez): preview web
(claro/oscuro/white-label con marca custom) + device Android. Paridad declarada en MOBILE_PARITY.
OTA android propuesto al owner (cierre de O2 = "OTA unico" del programa).

## Riesgos

- La paleta toca superficies QA-eadas en O1: el riesgo no es logico sino visual (contraste del
  texto ambar/verde sobre claro). Mitigacion: F1 mantiene la ESTRUCTURA de clases (texto sigue
  coloreado donde lo estaba) y la re-QA de F5 juzga el resultado.
- Banda vs anillo pega en el componente mas visible del alumno; por eso D-A es del owner.
