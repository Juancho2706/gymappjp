# SPEC — W-brand: consolidación de color white-label (muerte total de las ruedas hex)

- **Origen:** decisión del dueño (2026-08-17) tras la auditoría de la oferta white-label:
  el primario custom murió en julio (W1b) solo para el coach standalone; quedaron ruedas
  hex por deriva en el acordeón «Branding avanzado (Pro)» y en los studios de Team/Org.
  Se consolidan TODAS bajo el sistema de presets + derivación.
- **Rama:** `rnmobiledenuevo`. **Cero DDL, cero migración, cero backend nuevo** (solo
  normalización en server actions existentes).

## Decisiones

**B1 — Acordeón «Branding avanzado»: mueren los inputs hex de color.**
Se retira la UI de color libre en web (`BrandAdvancedSection.tsx`: secundario, acento
claro/oscuro, color de texto del loader) y su espejo RN (`apps/mobile/app/coach/settings/brand.tsx`,
inputs de texto hex). El acordeón queda con: fuente de títulos, tinte neutro, loader
(variantes + compositor), y todo lo no-color. Las columnas DB permanecen intactas.

**B2 — Grandfather (regla del dueño 2026-08-17):** el coach legacy con primario custom
conserva SU primario tal cual; el par/secundario se deriva SIEMPRE del primario vía la
fórmula `sealPair` (`hsl(H+38°, S×0.85, min(L+14%, 68%))`). El `brand_secondary_color` y
los `accent_*` almacenados dejan de resolverse (quedan en DB, inertes por contrato — hoy
ya lo eran de facto: nadie lee `--theme-secondary` y elegir preset los pisaba). La server
action normaliza: escrituras nuevas de esos campos se descartan para standalone.

**B3 — Team/Org: presets primero, hex exacto como escape hatch.**
Portar la galería de los 14 presets curados (mismo catálogo `packages/brand-kit/presets.ts`,
misma precedencia asimétrica: colores del preset siempre pisan; fuente/loader = sugerencia)
a `TeamBrandStudio` y al `BrandStudio` de Org. Debajo, el camino «manual de marca»: UN solo
input hex de primario exacto, y el sistema deriva TODO (rampa `generateBrandPalette`, par
`sealPair`, contraste por gate WCAG del brand-kit). Mueren el picker libre + 8 swatches y
los inputs sueltos de acentos. Diferencia vs la rueda de julio: el hex ya no sale crudo —
entra un hex, sale una paleta curada por el motor.

**B4 — Color de texto del loader:** lo decide `readableInkOn`/`getContrastInfo`
(misma filosofía de contraste dinámico de Familia N). El campo UI muere.

**B5 — Fix de gating del PDF:** `lib/nutrition-pdf-brand.ts` gatea hoy
`subscriptionTier === 'free'`; pasa a `!isBrandingAllowed(tier)` — un coach starter deja
de recibir PDF brandeado (alineado con el resto del branding Pro+).

**B6 — NO se toca:** «con tecnología de EVA» incondicional (canal de distribución;
posible palanca Elite futura, no ahora); `--theme-secondary` (su primer consumidor real es
el Sello v2); columnas DB; la app enterprise congelada (los studios de Team/Org viven en
`apps/web`, fuera de la cuarentena).

## Invariantes

- Cero DDL y cero pérdida de datos: solo UI + normalización de escritura.
- Coach con preset: cero cambio visual.
- Coach legacy custom: solo cambia donde el secundario aparezca (hoy: únicamente el
  Sello v2, que es nuevo — no hay regresión visible posible).
- Team/Org con color guardado: conservan su hex exacto vía escape hatch (grandfather
  automático, sin migración ni aviso).
- El gate WCAG del brand-kit sigue siendo la última palabra sobre contraste.

## Criterios de aceptación

- Tests de la server action: escrituras de secundario/acentos/loader-text-color desde
  standalone se descartan; identidad/welcome intactos.
- Golden `sealPair` para legacy custom (par derivado, no el almacenado).
- Capturas del Team studio: camino preset y camino hex exacto (paleta derivada visible).
- PDF: test de gating starter → sin marca.
- Gates de siempre verdes; diff cero en rutas pre-auth y en la app enterprise.
