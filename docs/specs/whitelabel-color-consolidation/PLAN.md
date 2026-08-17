# PLAN — W-brand: consolidación de color white-label

Referencia: [SPEC](SPEC.md). Ejecución con workers (Opus implementa, Sonnet mecánico,
Fable juzga). Tareas en [TASKS](TASKS.md).

## Arquitectura

1. **W1 — PDF gating (independiente, 1 línea):** `nutrition-pdf-brand.ts` importa
   `isBrandingAllowed` de `@eva/tiers`; test de starter sin marca. Puede entrar en
   cualquier paquete de commits sin esperar al resto.
2. **W2 — Acordeón sin color (web + RN):** retirar los bloques hex de
   `BrandAdvancedSection.tsx` y `apps/mobile/app/coach/settings/brand.tsx`; la server
   action (`_actions/settings.actions.ts`) descarta esos campos para standalone
   (whitelist explícita, no blacklist); loader text color pasa a `readableInkOn`.
   El resolutor de standalone deja de considerar `brand_secondary_color`/`accent_*`
   almacenados (B2): el par legacy sale de `sealPair(primario)` — misma función que ya
   introduce el Sello v2 (S1.1), por eso W2 depende de que S1 esté mergeada.
3. **W3 — Team/Org presets + escape hatch:** extraer la galería de presets a un
   componente compartible (hoy vive acoplada a Mi Marca standalone), montarla en
   `TeamBrandStudio` y en el `BrandStudio` de Org con su modelo de datos
   (`theme_preset_key` ya existe solo en `coaches` — Team/Org lo emulan guardando los
   colores del preset en sus columnas actuales, SIN DDL: el preset es un «rellenador»
   de primario+par derivado, no una FK). Escape hatch: input único de hex →
   `generateBrandPalette` + `sealPair` + gate WCAG. Draft/publish de Org intacto.
4. **Gate:** tests unit (normalización, golden sealPair legacy, PDF) + capturas de los
   dos caminos del Team studio en el visual check.

## Waves

| Wave | Contenido | Gate |
|---|---|---|
| W1 | Fix PDF gating + test | vitest |
| W2 | Acordeón sin color web+RN + normalización server + resolutor legacy→sealPair | vitest + typecheck + tsc mobile |
| W3 | Galería presets en Team/Org + escape hatch hex | visual check + capturas |
| W4 | Docs (`CURRENT`) + juicio + QA dueño | todo verde |

**No arrancar hasta cerrar el tren vigente** (Guía Viva → Sello v2 → OTA #3 → QA del
dueño): W2/W3 comparten archivos con nada del tren, pero W2 consume `sealPair` (S1.1)
y el QA del dueño debe evaluar UNA cosa a la vez.

## Qué NO hacer

- Nada de DDL ni migraciones; columnas quedan.
- No borrar ni sobreescribir valores almacenados (grandfather pasivo).
- No tocar la app enterprise congelada (los studios viven en `apps/web`).
- No inventar presets nuevos ni variar el catálogo de 14.
- No quitar el escape hatch de Team/Org «para simplificar»: es requisito B2B.
