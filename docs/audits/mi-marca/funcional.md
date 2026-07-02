# Auditoría "Mi Marca" — Lente FUNCIONALIDAD + BACKEND

Fecha: 2026-07-02 · Branch: `feat/redesign-eva-design-system` · Ruta auditada: `/coach/settings/brand` (page.tsx → `BrandSettingsForm` + `BrandAdvancedSection` + `BrandThemePreview`).

Read-only. Los 3 bugs del CEO están **confirmados** y todos tienen la **misma raíz o una raíz gemela**: los campos white-label v2 (fuente, loader variant, color2, acentos, tinte) **se guardan bien en la DB** (GRANT + schema OK) **y se renderizan bien en la app del alumno**, pero **(a) no se releen en el form del coach** y **(b) no se propagan al preview**. El coach edita a ciegas y al recargar cree que "se borró".

---

## Cadena de datos (mapa)

```
Form coach (Mi Marca)                         App alumno (render real)
─────────────────────                         ───────────────────────
getCoachSettingsForUser  ── SELECT ──►  coaches   ◄── SELECT ── getClientLoginCoach / get-coach / proxy.ts:203
   (settings.queries.ts:16)              │                        (SÍ traen font/loader_variant/color2/…)
   ⚠ NO trae los 7 cols v2              │
        │                                │
        ▼                                ▼
BrandSettingsForm (coach)          /c/[slug]/layout.tsx:156 resolveLoaderVariant(header)  ✔
   defaults = coach.brand_font_key ?? ''   → SIEMPRE '' (undefined en runtime)
   defaults = coach.loader_variant ?? 'eva'→ SIEMPRE 'eva'
        │
        ├─► BrandAdvancedSection  (picker de fuente + 6 loaders vive acá, en estado LOCAL)
        │        └─ emite hidden inputs → server action → UPDATE coaches (GRANT OK ✔)
        │
        └─► BrandThemePreview  ⚠ NO recibe fontKey NI loaderVariant (solo color/logo/loader-legacy)
```

El write-path (server action + GRANT UPDATE de `20260621220000`) está **sano**: el `UPDATE` escribe las 7 columnas cuando `isBrandingAllowed(tier)`; el incidente 42501 quedó cerrado por esa migración hotfix. El problema es **puro read/reflect**, no de escritura.

---

## HALLAZGOS

### H1 — [ALTA] La query de "Mi Marca" NO relee ninguna columna white-label v2 → fuente/loader/color2 "desaparecen" al recargar

- **Qué:** `getCoachSettingsForUser` hace un SELECT explícito de columnas y **omite las 7 columnas v2**: `brand_font_key`, `loader_variant`, `brand_secondary_color`, `accent_light`, `accent_dark`, `neutral_tint`, `logo_url_dark`. Como el resultado se castea a `Tables<'coaches'>` (tipo completo), TypeScript **no lo detecta** — en runtime esas props son `undefined`.
- **Dónde:** `apps/web/src/app/coach/settings/_data/settings.queries.ts:16` (string del `.select(...)`).
- **Evidencia:**
  - El SELECT lista `…loader_text, loader_text_color, loader_icon_mode, loader_show_icon, use_custom_loader, …` (loader LEGACY sí) pero **nunca** `brand_font_key` ni `loader_variant`.
  - `BrandSettingsForm.tsx:530-537` construye `defaults` con `coach.brand_font_key ?? ''` → `''` siempre, y `coach.loader_variant ?? 'eva'` → `'eva'` siempre; `neutral_tint ?? false` → `false`; `brand_secondary_color/accent_* ?? ''` → `''`.
  - `BrandAdvancedSection.tsx:35-42` inicializa el estado desde esos `defaults` → **cada recarga** muestra fuente sin seleccionar y loader = "EVA", aunque el coach haya guardado Montserrat + "radar".
  - Contraste: las queries del alumno **sí** traen todo — `login.queries.ts:24`, `lib/coach/get-coach.ts` (Pick incluye `loader_variant`/`brand_font_key`/`neutral_tint`), `proxy.ts:203`. O sea el valor guardado **funciona en la app del alumno**; solo el form del coach no lo refleja.
- **Impacto:** Es la causa central del bug #1 del CEO ("los 5-6 loaders desaparecieron"): el picker **sigue en el código** (H-nota abajo), pero la selección guardada nunca vuelve → parece que se resetea a EVA. También hace que color2/acentos/tinte se vean vacíos tras guardar.
- **Fix propuesto:** Agregar al SELECT de `settings.queries.ts:16` las 7 columnas: `brand_secondary_color, accent_light, accent_dark, neutral_tint, logo_url_dark, brand_font_key, loader_variant`. Cero cambios de escritura; es solo completar la lectura para que el round-trip refleje lo guardado.

### H2 — [ALTA] `BrandThemePreview` no recibe `brand_font_key` → el cambio de tipografía nunca se ve en el preview en vivo

- **Qué:** El componente de vista previa (el mockup de teléfono, "Vista previa de tu app") **no tiene prop de fuente**. La tipografía elegida no altera el preview.
- **Dónde:**
  - `apps/web/src/app/coach/settings/_components/BrandThemePreview.tsx:24-33` — la interface `Props` no incluye `fontKey`/`fontFamily`; el mockup usa la fuente por defecto del DOM.
  - `BrandSettingsForm.tsx:191-200` y `:743-752` — las dos instancias de `<BrandThemePreview …>` pasan `brandName/primaryColor/logoUrl/welcomeMessage/loaderText/useCustomLoader/loaderTextColor/loaderIconMode` y **nada de fuente**.
- **Causa arquitectónica agravante:** el estado `fontKey` vive **local dentro de `BrandAdvancedSection`** (`BrandAdvancedSection.tsx:35`), no está "levantado" al form padre. Aunque se agregue el prop, el padre **no tiene** el valor para pasarlo. Hoy la fuente solo se previsualiza en el swatch chico interno de `BrandAdvancedSection` (`:236`, `fontFamily: fontKey ? var(...)`), no en el phone-mockup que el CEO llama "preview en vivo".
- **Impacto:** Bug #2 del CEO, confirmado.
- **Fix propuesto:** Levantar `fontKey` (y demás campos v2) al form padre (o vía callback/estado compartido), agregar prop `fontFamily` a `BrandThemePreview`, y aplicar `style={{ fontFamily: resolveBrandFontStack(fontKey) }}` (helper ya existe en `lib/brand-fonts.ts:62`) a los títulos del mockup (login + screens).

### H3 — [ALTA] `BrandThemePreview` no recibe `loader_variant` → las 6 variantes nunca se ven en el preview (solo el loader legacy)

- **Qué:** El bloque "Así se ve al cargar la app" del preview renderiza **solo** `EvaRouteLoader` (loader legacy con texto/ícono custom). Las 6 variantes white-label v2 (progreso/anillo/radar/cometa/ritmo/órbitas) **no se muestran** nunca en el preview.
- **Dónde:**
  - `BrandThemePreview.tsx:493-506` — usa `<EvaRouteLoader customText={loaderText} useCustom={useCustomLoader} textColor={…} primaryColor={…} iconMode={loaderIconMode} />`; no hay prop `loaderVariant` ni render de `components/loaders/variants.tsx`.
  - Los componentes reales de las variantes **existen**: `apps/web/src/components/loaders/variants.tsx` + `loader-variants.module.css`. Se renderizan en el alumno (`/c/[coach_slug]/layout.tsx:156` resuelve `loaderVariant` desde el header `x-coach-loader-variant`). O sea la feature está viva end-to-end salvo en el preview del coach.
- **Impacto:** Bug #3 del CEO, confirmado. Combinado con H1, el coach Pro no tiene **ninguna** señal (ni el picker persistente ni el preview) de que su loader elegido tomó efecto.
- **Fix propuesto:** Levantar `loaderVariant` al padre, pasarlo como prop, y en el bloque de loader del preview renderizar la variante real (el mismo componente de `components/loaders/variants.tsx`) cuando `loaderVariant !== 'eva'`, cayendo a `EvaRouteLoader` para `'eva'`.

### Nota sobre bug #1: el PICKER de loaders NO fue borrado

- El catálogo de 6 variantes sigue en el código: keys en `packages/schemas/brand.ts:29-37` (`eva`+6), metadata en `apps/web/src/lib/brand-loaders.ts:29-37`, y el **picker se renderiza** en `BrandAdvancedSection.tsx:190-215` ("Pantalla de carga", `LOADER_VARIANT_TUPLE.map`).
- No se perdió en un re-skin: `git log` de `BrandSettingsForm.tsx`/`BrandAdvancedSection.tsx` muestra que la wave-2 del rediseño (`2f5ddbd0`) solo **movió la posición del preview** (agregó una instancia `lg:hidden` arriba); no tocó el picker. El picker nació en `af10ef3b` (W2.11) y sigue intacto.
- Tampoco es gate por tier: `brand/page.tsx:24-41` redirige/upsell si `!canUseBranding`; para un coach Pro (ej. josefit comp) la sección renderiza. La "desaparición" percibida = **H1 (no se relee) + H3 (no hay preview)**, no un borrado del picker.

### H4 — [MEDIA] `logo_url_dark` (logo modo oscuro) se consume en render pero NO tiene UI de carga en el form del coach

- **Qué:** La columna `logo_url_dark` se propaga end-to-end en el alumno (`proxy.ts:203/509/612/771/903` setea `x-coach-logo-url-dark`; el layout del alumno lo consume) pero el coach standalone **no tiene ningún control** para subir un logo oscuro en "Mi Marca".
- **Dónde:**
  - `settings.actions.ts:97` — comentario dice *"logo_url_dark se sube aparte (updateLogoDarkAction, W2 UI)"*, pero **`updateLogoDarkAction` no existe en ningún lado del repo** (grep: solo aparece en ese comentario). No hay UI de logo-dark en `BrandSettingsForm`/`LogoUploadForm`.
  - Teams y Orgs **sí** tienen carga de logo oscuro (`TeamBrandStudio.tsx:438`, `org/[slug]/_actions/org.actions.ts:33-49`). El standalone quedó sin esa paridad.
- **Impacto:** Un coach Pro no puede setear logo para modo oscuro; su logo claro se usa (o no) en dark. Feature a medias (columna + render sin editor).
- **Fix propuesto:** Implementar `updateLogoDarkAction` + control de subida en `LogoUploadForm`/`BrandSettingsForm` (espejo de `TeamBrandStudio`), o documentar el faltante. Además H1 debe traer `logo_url_dark` para poder mostrar el preview/estado actual.

### H5 — [MEDIA] El indicador "Sin guardar" y el guard `beforeunload` ignoran todos los campos de `BrandAdvancedSection`

- **Qué:** `isDirty` solo compara color, useCoachColors, loader-legacy y welcome-*. **No** compara fuente, loader variant, color2, acentos ni tinte (viven en el estado local del hijo). Editar solo esos campos → **no** marca "Sin guardar" y **no** dispara el aviso de salir sin guardar.
- **Dónde:** `BrandSettingsForm.tsx:89-103` (deps de `isDirty` no incluyen los campos avanzados; el estado avanzado está encapsulado en `BrandAdvancedSection`).
- **Impacto:** El coach puede cambiar fuente/loader, navegar, y perder los cambios sin ninguna advertencia. Agrava la sensación de "no se guarda".
- **Fix propuesto:** Levantar el estado avanzado al padre (misma refactor que H2/H3) o exponer un callback `onDirtyChange` desde `BrandAdvancedSection` e incorporarlo a `isDirty`.

### H6 — [BAJA] `brandScore` (medidor "Marca completada") no cuenta el branding avanzado

- **Qué:** El score (`BrandSettingsForm.tsx:74-83`) suma logo/color/welcome/loader-legacy/welcome-modal/brand_name, pero **no** premia fuente, loader variant ni color secundario. Un coach que configuró todo el branding Pro puede quedar por debajo del 100%.
- **Dónde:** `BrandSettingsForm.tsx:74-83`.
- **Impacto:** Cosmético/motivacional; subestima el avance real de un coach Pro.
- **Fix propuesto:** Incluir `brand_font_key`/`loader_variant`/`brand_secondary_color` en el cálculo (requiere H1 para tener los valores).

### H7 — [BAJA] Preview de color desacoplado del chrome según `use_brand_colors_coach`, potencial confusión

- **Qué:** El efecto de "live preview" del color (`BrandSettingsForm.tsx:115-135`) solo empuja `--theme-primary` al dashboard del coach si `useCoachColors` está ON; si está OFF fuerza `#007AFF`. En cambio el `BrandThemePreview` (mockup) **siempre** usa `selectedColor`. Es intencional (el chrome del coach vs. la app del alumno), pero produce que "el color no cambie mi panel" mientras el mockup sí — fácil de reportar como bug.
- **Dónde:** `BrandSettingsForm.tsx:115-135`.
- **Impacto:** Observación de UX; no es un defecto funcional. Documentar el comportamiento esperado.

---

## Resumen ejecutivo

| # | Sev | Bug CEO | Raíz | Archivo:línea |
|---|-----|---------|------|---------------|
| H1 | ALTA | #1 loaders "desaparecen" | query no relee cols v2 | `settings.queries.ts:16` |
| H2 | ALTA | #2 fuente no en preview | preview sin prop de fuente + estado no levantado | `BrandThemePreview.tsx:24-33`, `BrandSettingsForm.tsx:743-752` |
| H3 | ALTA | #3 loaders no en preview | preview solo render loader legacy | `BrandThemePreview.tsx:493-506` |
| H4 | MEDIA | — | `logo_url_dark` sin UI (action inexistente) | `settings.actions.ts:97` |
| H5 | MEDIA | — | dirty/beforeunload ignoran campos avanzados | `BrandSettingsForm.tsx:89-103` |
| H6 | BAJA | — | brandScore no cuenta branding avanzado | `BrandSettingsForm.tsx:74-83` |
| H7 | BAJA | — | preview de color desacoplado del chrome | `BrandSettingsForm.tsx:115-135` |

**Write-path OK:** GRANT UPDATE de las 7 columnas presente (`20260621220000_grant_update_whitelabel_v2_brand_cols.sql`); schema Zod valida (`packages/schemas/coach.ts:19-25`); el server action escribe todo bajo gate `isBrandingAllowed`. No hay riesgo 42501 aquí.

**Refactor unificador:** H1+H2+H3+H5 se resuelven juntos: (1) completar el SELECT en `settings.queries.ts`, y (2) levantar el estado de `BrandAdvancedSection` (fontKey/loaderVariant/secondary/accents/tint) al form padre para que `BrandThemePreview` reciba y renderice esos valores. Es la corrección de mayor palanca.
