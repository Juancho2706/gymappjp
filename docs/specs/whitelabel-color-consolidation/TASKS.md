# TASKS — W-brand (worker-ready)

Convenciones de la casa (Opus implementa guiado, Sonnet mecánico, jefe juzga; DoD +
typecheck local antes de DONE; guardia backend-cero). Prerrequisito global: tren
Guía Viva + Sello v2 cerrado (W2 consume `sealPair` de S1.1).

## W1 — PDF gating

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| W1.1 | Sonnet | `apps/web/src/lib/nutrition-pdf-brand.ts` + test | Reemplazar `subscriptionTier === 'free'` por `!isBrandingAllowed(tier)` (`@eva/tiers`); test: starter → PDF sin marca, pro → con marca. | vitest verde. |

## W2 — Acordeón sin color (standalone web + RN)

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| W2.1 | Opus | `BrandAdvancedSection.tsx`, `_actions/settings.actions.ts` + tests | Retirar bloques hex (secundario, acentos, loader text color) y el aviso de precedencia que los acompañaba; server action pasa a whitelist explícita que descarta esos campos; loader text color derivado con `readableInkOn` donde se consumía. | vitest + typecheck verdes; acordeón conserva fuente/tinte/loader/compositor. |
| W2.2 | Opus | resolutor standalone (donde se emiten `--theme-*`) + `packages/brand-kit` | B2: para brand SIN preset (legacy custom), el secundario resuelto = `sealPair(primario).secondary`; `brand_secondary_color`/`accent_*` almacenados dejan de leerse. Golden: legacy con secundario almacenado ≠ derivado → gana el derivado. | vitest verde; coach con preset sin cambio alguno (snapshot). |
| W2.3 | Opus | `apps/mobile/app/coach/settings/brand.tsx` + resolutor RN | Espejo RN de W2.1/W2.2 (retirar inputs hex, mismo contrato de resolución). | tsc mobile verde. |

## W3 — Team/Org: presets + escape hatch

| ID | Modelo | Archivos | Instrucción | DoD |
|---|---|---|---|---|
| W3.1 | Opus | galería de presets (extracción a compartible) + `TeamBrandStudio.tsx` | Montar galería de 14 presets como camino default; al elegir preset se rellenan primario + par derivado en las columnas actuales de team (sin DDL); retirar picker libre + 8 swatches + acentos sueltos. Escape hatch: input único «hex exacto de tu manual de marca» → `generateBrandPalette` + `sealPair` + gate WCAG. Grandfather: color guardado actual aparece como hex exacto vigente. | typecheck verde; capturas de ambos caminos. |
| W3.2 | Opus | Org `BrandStudio.tsx` (+ su page draft/publish) | Igual que W3.1 respetando el flujo draft → publish y el historial. | typecheck verde; publish intacto (test existente). |
| W3.3 | Sonnet | `scripts/cabina-visual-check.mjs` o script hermano | Capturas Team studio: preset elegido y hex exacto (paleta derivada visible); assert de que el hex crudo nunca llega sin pasar por el motor. | script EXIT 0. |

## W4 — Cierre (jefe + dueño)

| ID | Quién | Qué |
|---|---|---|
| W4.1 | jefe | Gates completos + juicio + `CURRENT.md` + docs:check |
| W4.2 | dueño | **HECHA 2026-09-05** — QA de Mi Marca standalone (acordeón simplificado), Team studio (2 caminos) y PDF starter: **QA del owner VERDE 05-09** (sesión única, artifact `6bd32370`, Android 1.1.2 build 86 / iOS 1.1.2 build 59 con OTA del 04-09 android `d8220490` / ios `54487ddd`, web `f9ba8a3f`) |
