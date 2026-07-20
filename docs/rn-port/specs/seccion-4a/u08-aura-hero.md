# 4A-08 — AuraHero: paleta de macros white-label + composición

Archivo RN: `apps/mobile/components/nutrition-v2/AuraHero.tsx`. Disjunto.
Referencia web: `_components/AuraHero.tsx` + `packages/nutrition-v2/design.ts`.

## Verificación del hallazgo del plan (MacroRingSummary) en V2

El hallazgo de entrada del plan (§Ola 4A) describía el hero V1. En V2 la composición cambió: el hero
web V2 es una card NORMAL (`bg-surface-card border-border-subtle`, `AuraHero.tsx:110` web), NO
`surface-inverse` — esa parte del hallazgo quedó obsoleta. Lo que SÍ sigue vigente es el error de
paleta de macros en RN:

1. **Carbs debe ser sport (white-label); RN usa azul fijo.**
   Web `AuraHero.tsx:322,332`: mini-anillos con `stroke: meta.webColor` donde
   `NUTRITION_MACROS.carbs.webColor = 'var(--sport-500)'`, `protein = 'var(--ember-500)'`,
   `fats = 'var(--aqua-500)'` (`packages/nutrition-v2/design.ts:9-31`).
   RN `AuraHero.tsx:32,110`: usa `MACRO_COLORS` de `components/MacroRingSummary.tsx:12` —
   `protein '#FF6A3D'`, `carbs '#126BE1'` (AZUL FIJO), `fats '#18ABD4'`, hex crudos V1.
   **Delta P1 white-label**: con marca custom, carbs web se tiñe con la rampa del coach; RN no.
   Cierre: colores desde el DS RN (clases `bg/text-ember-500|sport-500|aqua-500` o el resolver de
   tema RN equivalente a `nativeClass`), CERO hex crudos nuevos; carbs debe cambiar al recolorear la marca.

2. **Label del mini-anillo.**
   Web `AuraHero.tsx:275-279,345`: label P/C/G con `text-ember-700 dark:text-ember-300` (y sport/aqua
   equivalentes). RN `AuraHero.tsx:126`: usa el MISMO color del trazo (500) sin variante dark.
   Delta: usar 700/300 según esquema.

3. **Anillo principal y aura.** Web: track `rgba(theme-primary, 0.13)` (`AuraHero.tsx:160`), trazo
   `var(--theme-primary)` (170), glow radial `auraGlowAlpha` (116-125). RN `AuraHero.tsx:179-184,161-178`:
   mismo contrato con `hexToRgba(theme.primary, 0.13)` + glow/sombra nativa. **En paridad**
   (sombra nativa = adaptación documentada del radial-gradient).

4. **Números.** Web: kcal animada con resorte (`AnimatedKcal`, 248-267), `es-CL` format, `text-4xl
   sm:5xl tabular-nums`. RN: número estático (`index` 186-188 del archivo RN) — SIN animación de conteo.
   Delta menor: web anima el número al cambiar; RN solo anima el trazo. Cierre: animar con reanimated
   (o documentar como residuo P2 si el costo supera el valor; el trazo ya cumple el motion principal).

5. **Celebración de meta de energía.** Web dentro del hero: confeti tintado con `--theme-primary-rgb`
   + overlay con ilustración `dia-completado` + pill "¡Meta de energía cumplida!", 1×/día por
   sessionStorage (`AuraHero.tsx:70-104,211-242`). RN: la dispara el contenedor sobre
   `CelebrationOverlay` (`app/alumno/nutrition-v2/index.tsx:572-583`) — adaptación sancionada por el
   propio comentario del RN (`AuraHero.tsx:12-14` RN). Verificar en 4A-10 que el overlay RN de la meta
   de energía muestre ilustración + pill equivalentes; aquí solo se documenta.

6. **Textos.** Saludo por hora (`greetingForHour`), subtítulo "Tu energía de hoy"/"Vas sumando tu día",
   "de {target}", hint "Registra lo que comas para ver tu avance", "{n} restantes"/"Meta de energía
   cumplida" — comparados: **en paridad** (helpers compartidos).

7. **Geometría.** Web MAIN 216/16, MINI 74/8 (`AuraHero.tsx:37-38,270-272`); RN 208/15 y 74/7
   (`AuraHero.tsx:36-39` RN). Delta sub-pixel de tamaño principal (216 vs 208, 16 vs 15, 8 vs 7):
   cerrar a los valores web salvo que el ancho de card RN lo impida (documentar si se conserva 208).

## Comprobación objetiva

Marca EVA y marca de alto contraste, light/dark: screenshot del hero web vs RN; el anillo de carbs
DEBE cambiar de color al cambiar la marca; kcal/proteína en ember, grasas en aqua; labels 700/300;
sin hex crudos nuevos en el diff (`git diff` + grep `#[0-9A-Fa-f]{6}`).
