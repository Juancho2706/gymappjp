# Auditoría de código — Sistema White-label de EVA

READ-ONLY. Fecha: 2026-07-02. Branch: `feat/redesign-eva-design-system`.
Alcance: mapa de punta a punta de qué brandea un coach, dónde se aplica, dónde se ignora, y factibilidad del pivote CEO a **temas preset curados** (matar la rueda de color libre).

---

## 0. Arquitectura del motor (cómo fluye una marca hasta el alumno)

```
coaches (fila DB, ~15 columnas de branding)
   │  SELECT en el PROXY (apps/web/src/proxy.ts, branch /c/ · /e/ · /t/)
   ▼
x-coach-* request headers  ── gate Pro+ (isBrandingAllowed) aplicado ACÁ
   │
   ▼
app/c/[coach_slug]/layout.tsx  → resolveBrandTheme() + deriveSportTokens() (@eva/brand-kit)
   │  inyecta <style> con --sport-100..700, --cta-fill, --theme-primary,
   │  --brand-font, --coach-loader-* en :root y .dark
   ▼
Toda la app del alumno hereda esos CSS vars
```

- **Motor único compartido web+RN:** `packages/brand-kit/index.ts` — TS puro (culori/OKLCH), sin DOM. `resolveBrandTheme(input)` deriva light+dark con clamp WCAG AA; `deriveSportTokens(hex)` genera la rampa sport de 7 pasos + `ctaFill` + `focusRing` + `textOnSport` + foregrounds dark. Mismo módulo lo consume `apps/mobile/lib/theme.ts` → **paridad de render garantizada por construcción**.
- **Gate de branding:** `isBrandingAllowed(tier)` (`@eva/tiers`). White-label VISUAL = **Pro+ ENTERO** (no solo free). free/starter → skin EVA completo, conservando SOLO el nombre del coach (identidad) + "Potenciado por EVA" footer. Enforcement en 3 capas: proxy (headers), server action (`isBrandingAllowed` en `settings.actions.ts`), y render (`isFreeTier` en el layout).
- **Fuente de verdad DB:** columnas de branding en `coaches` son **compra-only / service-role-write** salvo la allowlist de `GRANT UPDATE` (migr. `20260621220000`). El coach edita su propia fila vía `coaches_update_own`. Columnas nuevas del white-label v2: migr. `20260621150000` (aditiva).

---

## 1. INVENTARIO — Qué es brandeable HOY

| # | Elemento | Columna(s) `coaches` | Dónde se CONFIGURA | Dónde se APLICA | Gate |
|---|----------|----------------------|--------------------|-----------------|------|
| 1 | **Color primario** | `primary_color` | `BrandSettingsForm.tsx` (8 swatches + `<input type=color>` libre) | Todo: rampa `--sport-*`, botones, `--theme-primary`, gráficos, glows, favicon fallback, splash, PDF, manifest theme_color | Pro+ |
| 2 | **Color secundario (color2)** | `brand_secondary_color` | `BrandAdvancedSection.tsx` (color picker) | `--theme-secondary` / `accent2` — badges, 2ª serie de gráficos, macros nutrición. Independiente del primario | Pro+ |
| 3 | **Acento por-modo** | `accent_light`, `accent_dark` | `BrandAdvancedSection` (acordeón "avanzado") | Override del accent en claro/oscuro respectivamente (`resolveBrandTheme` accentLight/Dark) | Pro+ |
| 4 | **Tinte neutro** (`neutralTint`) | `neutral_tint` | `BrandAdvancedSection` (toggle) | Tiñe bg/surface/border con el hue de marca (chroma 0.012) para "premium feel" | Pro+ |
| 5 | **Fuente curada** | `brand_font_key` | `BrandAdvancedSection` (grid 12 fuentes) | `--brand-font` → SOLO títulos/display (decisión #4; body queda Inter). Cargadas en `app/layout.tsx` vía next/font | Pro+ |
| 6 | **Variante de loader** | `loader_variant` | `BrandAdvancedSection` (grid 7: eva+6) | Animación de carga de la app (`components/loaders/`, `--coach-loader-variant`) | Pro+ |
| 7 | **Logo claro** | `logo_url` | `BrandSettingsForm` LogoSlot (bucket `logos`) | Nav, login hero, offline screen, manifest icons, splash, favicon, install prompt | Pro+ |
| 8 | **Logo oscuro** | `logo_url_dark` | `BrandSettingsForm` LogoSlot (dark) | Modo oscuro de la app del alumno (`data-logo-dark`) | Pro+ |
| 9 | **Nombre de marca** | `brand_name` | `BrandSettingsForm` (Identidad) | Título de pestaña, `<title>`, login, nav, emails (texto), PWA name, splash, OG | **Siempre** (identidad, no gateado) |
| 10 | **Mensaje de bienvenida (login)** | `welcome_message` | `BrandSettingsForm` (Textarea 240 char) | Tagline debajo del logo en `/c/[slug]/login` | No gateado |
| 11 | **Modal de bienvenida (dashboard)** | `welcome_modal_enabled/content/type/version` | `BrandSettingsForm` (texto o video YouTube/Vimeo) | Modal al entrar al dashboard del alumno | No gateado |
| 12 | **Loader: texto/ícono/color** | `use_custom_loader`, `loader_text`, `loader_icon_mode`, `loader_text_color` | `BrandAdvancedSection` (sub-sección) | Texto (≤10 char), ícono (eva/coach/none), gradiente vs sólido en la pantalla de carga | Pro+ |
| 13 | **Marca en panel del coach** | `use_brand_colors_coach` | `BrandSettingsForm` (toggle) | Tiñe el CHROME del panel `/coach/*` (no afecta al alumno) | Pro+ |

**Paralelos:** `teams` y `organizations` replican un subconjunto (`primary_color`, `logo_url`, `brand_secondary_color`, `loader_variant`, `accent_light/dark`, `neutral_tint`, `logo_url_dark`, `loader_*`, `splash_bg_color`). El alumno de pool (`/t`) o enterprise (`/e`) recibe la marca del TEAM/ORG, nunca la personal del coach (resuelto en el proxy vía RPCs `get_team_alumno_context` / `get_enterprise_alumno_context` / `get_org_branding`).

**Preview:** `BrandThemePreview` (mockup de teléfono en `BrandSettingsForm`) refleja color+logo+fuente+loader+welcome, claro/oscuro, expandible a fullscreen. Es la vista canónica; el `BrandAdvancedSection` no tiene preview propio (solo guardia WCAG textual).

### Superficies del alumno que SÍ respetan la marca
Nav (`ClientNav`), dashboard, ejecución de rutina, nutrición, check-in, login (hero full-bleed con gradiente del color), offline screen, 404/error del árbol (`--theme-primary`), splash iOS (`/api/splash`), manifest (`/api/manifest` — name/theme_color/icons), install prompt, PDFs de nutrición (`nutrition-pdf-brand.ts`).

---

## 2. GAPS — Superficies NO brandeadas (rompen la ilusión de "app del coach")

| Gap | Qué ve el alumno HOY | Qué debería ver | Severidad | Ubicación |
|-----|----------------------|-----------------|-----------|-----------|
| **G1 · Emails al alumno** | Header oscuro `#0f172a` + acento verde EVA `#10B981` + wordmark "EVA" hardcoded + footer "Enviado por EVA Fitness Platform". El nombre del coach solo aparece en el TEXTO del cuerpo. | Header con color/logo del coach, CTA con su color, footer neutro. `wrapEmailLayout` NO acepta parámetros de marca. | **ALTA** | `lib/email/base-layout.ts` (`EVA_GREEN`, `DARK_BG` const), `transactional-templates.ts` (`buildClientWelcomeEmail`, `buildProgramAssignedEmail`) |
| **G2 · Push notifications (PWA)** | `sw.js`: título default `'EVA Fitness'`, ícono/badge hardcoded `/LOGOS/eva-icon.png`. `lib/push.ts` default `icon:'/icons/icon-192x192.png'`. | Ícono = logo del coach, título con su marca. El SW no tiene acceso a la marca del tenant; el payload podría inyectar `icon` pero ningún caller lo hace con el logo del coach. | **ALTA** | `apps/web/public/sw.js:148-158`, `apps/web/src/lib/push.ts:46-50` |
| **G3 · Push notifications (mobile Expo)** | `sendExpoTokens` no manda ícono; usa el ícono de la app EVA del store (esperado: app única EVA). | En mobile el ícono de notificación ES el de la app EVA por diseño (store = EVA). Aceptable, pero el título podría llevar la marca. | BAJA (decisión store=EVA) | `lib/push.ts:17-35` |
| **G4 · Favicon de pestaña (fallback)** | Si el coach NO tiene logo → SVG generado con inicial + color (OK). Con logo → usa `logo_url` (OK). En rutas NO-`/c` (raíz, login coach) → favicon EVA. | El favicon del árbol `/c` sí se brandea (`generateFaviconSvg`). No hay gap real dentro de `/c`. | RESUELTO | `app/c/[coach_slug]/layout.tsx:194,338` |
| **G5 · Loader inicial SSR / first paint** | El `<style>` con la marca se inyecta en el layout, pero el HTML shell base (`app/layout.tsx`) pinta con tokens EVA hasta que hidrata. Primer frame puede ser EVA. | Idealmente el color de marca ya en el primer byte. Mitigado porque el proxy manda headers y el layout es RSC, pero el root `app/layout.tsx` es EVA. | MEDIA | `app/layout.tsx` vs `app/c/[coach_slug]/layout.tsx` |
| **G6 · Manifest PWA — profundidad** | `/api/manifest/[slug]` SÍ brandea name/short_name/theme_color/icons/start_url/scope. `background_color` queda `#000000` para coach/org (solo pool team usa `splash_bg_color`). | El `background_color` del splash nativo Android debería ser el color de marca del coach, no negro fijo. | MEDIA | `api/manifest/[coach_slug]/route.ts:46-48` |
| **G7 · Manifests per-coach DEPRECADOS (Fase 6A)** | Memoria dice "per-coach manifests deprecados". Verificado: **NO están deprecados en código** — `/api/manifest/[slug]` está vivo y linkeado con `crossOrigin=use-credentials` en el layout. Lo deprecado fue el *install prompt* nativo (RN lo reemplaza), no el manifest. | Aclarar la nota de memoria: el manifest white-label sigue vivo y funcional. | INFO (doc stale) | `layout.tsx:220-223` |
| **G8 · PDFs — logo** | `resolvePdfBrand` pone `logoDataUrl:null` server-side; el logo se resuelve client-side vía `loadBrandLogoDataUrl` (fetch→canvas). Si el fetch CORS falla → PDF sin logo (solo inicial+color). Color y nombre SÍ se brandean. | Logo del coach siempre presente en el PDF. Fragilidad por CORS del bucket. | MEDIA | `lib/nutrition-pdf-brand.ts:100,125-141` |
| **G9 · Página de login** | YA muy brandeada: hero full-bleed con gradiente del color, logo/iniciales, `brand_name`, `welcome_message` como tagline, fuente en el wordmark, "con tecnología de EVA" discreto. | Es la superficie MEJOR brandeada. Sin gap material (ver §4 para variación de layout/animación). | RESUELTO | `app/c/[coach_slug]/login/page.tsx` |
| **G10 · Error boundaries del alumno** | `error.tsx` y `not-found.tsx` usan `var(--theme-primary, #007AFF)` → SÍ heredan el color si el `<style>` ya se inyectó. `global-error.tsx` (raíz) reemplaza `<html>` → EVA puro. | Los errores del segmento `/c` sí brandean; solo el crash catastrófico (global-error) es EVA. Aceptable. | BAJA | `app/c/[coach_slug]/error.tsx`, `not-found.tsx` |
| **G11 · OG / share cards** | `openGraph.images` usa `BRAND_OG_IMAGE` (imagen EVA fija) para TODOS los coaches. `siteName`/`title` sí llevan `brand_name`. | Share card con logo/color del coach (generada tipo `/api/splash`). Hoy comparte una card EVA con nombre del coach. | MEDIA | `layout.tsx:87-103` (`BRAND_OG_IMAGE`) |
| **G12 · Emails — verificación/reset password** | Correos de auth (Supabase GoTrue templates) son 100% EVA/genéricos. | Fuera del control de la app (plantillas de Supabase). Difícil de brandear por-coach. | BAJA (limitación plataforma) | Supabase Auth templates |

**Resumen de gaps que más "rompen la ilusión":** G1 (emails), G2 (push icon), G11 (OG card), G6 (splash bg negro). Los cuatro son superficies que el alumno ve FUERA de la app renderizada, donde el `<style>` inyectado no llega.

---

## 3. ARQUITECTURA para TEMAS PRESET (pivote CEO: matar la rueda de color libre)

**Decisión CEO:** catálogo de temas curados donde cada tema define branding completo (colores, tipografía, tono), legible en claro Y oscuro.

### Factibilidad: ALTA. El sistema ya está diseñado para esto.
El motor `deriveSportTokens(hex)` + `resolveBrandTheme(input)` **ya deriva rampa completa + WCAG desde 1–3 hex**. Un preset no necesita nada nuevo en el engine: es una tupla de inputs que ya se consumen. Toda la app lee CSS vars (`--sport-*`, `--brand-font`, `--theme-secondary`), agnósticas de si el valor vino de un color libre o de un preset.

**NO existe hoy** ningún sistema de presets de tema (el `PRESET_COLORS` de `BrandSettingsForm` son 8 swatches de conveniencia del color picker; los "presets" del feature-matrix son de *Funciones*, no de tema). Es green-field.

### Modelo de datos propuesto (SIN implementar)

**Opción A — preset como catálogo en código + `theme_preset_key` en DB (recomendada):**

```ts
// packages/brand-kit/presets.ts (nuevo, TS puro — compartido web+RN)
export type BrandPreset = {
  key: string            // 'ember-steel', 'aqua-mono', ... (estable, va a DB)
  label: string          // "Ember / Acero"
  brandColor: string     // hex primario (semilla del deriveSportTokens)
  secondaryColor: string // hex color2
  accentLight?: string   // override opcional por-modo
  accentDark?: string
  fontKey: FontKey       // una de las 12 curadas
  loaderVariant: LoaderVariant
  neutralTint: boolean
  feel: 'bold' | 'calm' | 'techy' | 'warm'  // metadato de tono/UI
}
// Invariante de curaduría: isThemeReadable(preset) === true en claro Y oscuro
// (validado con contrastReport en un test — ningún preset ships si falla WCAG).
```

```sql
-- Migración aditiva (espejo de whitelabel_v2_brand_columns):
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS theme_preset_key text NULL;
-- + GRANT UPDATE(theme_preset_key) ON coaches TO authenticated (obligatorio, ver CLAUDE.md)
```

- El coach elige un preset → se persiste `theme_preset_key`. En el proxy/layout, si `theme_preset_key` está set, se hidratan `primary_color`/`brand_secondary_color`/`brand_font_key`/`loader_variant`/`accent_*`/`neutral_tint` **desde el catálogo** (código, no DB) antes de `deriveSportTokens`.
- Ventaja: el CEO puede reajustar un preset (mejorar contraste, cambiar fuente) editando código sin migrar filas de coaches. Los coaches "siguen" el preset.

**Opción B — preset materializado (snapshot a columnas existentes):** al elegir preset, se copian sus valores a `primary_color`, `brand_secondary_color`, etc. Sin columna nueva. Ventaja: cero cambios de lectura (el proxy ya lee esas columnas). Desventaja: el coach queda "congelado" al preset del día que eligió; reajustes del CEO no se propagan; y no se distingue "eligió preset" de "eligió color libre".

**Recomendación:** Opción A (referencia por key). Permite curaduría viva + telemetría de qué preset usa cada coach + reversibilidad.

### Contrato del preset (validación de curaduría)
```
Para cada preset P, en {light, dark}:
  contrastReport(resolveBrandTheme(P)).passes === true   // texto/accent/accent2 ≥ WCAG AA
  deriveSportTokens(P.brandColor) genera 500 verbatim + 600/700 white-safe
```
El publish-gate ya existe (`isThemeReadable`, `contrastReport`) — se reusa como test de CI sobre el catálogo. **Un preset curado nunca puede ser ilegible por definición** porque pasa por el mismo clamp WCAG.

### Migración / grandfather de coaches con color custom
- **Estrategia sugerida:** NO forzar migración. `theme_preset_key = NULL` ⇒ el coach sigue en modo "color legacy" (lee `primary_color` custom actual). El catálogo de presets se ofrece como la NUEVA forma de elegir; la rueda libre se oculta de la UI pero la columna sigue respetándose para los ~coaches existentes.
- **Backfill opcional:** para cada coach con color custom, calcular el preset más cercano (distancia OKLCH del hue) y ofrecerlo como sugerencia ("Tu marca se parece a: Ember"). Nunca auto-aplicar.
- **Riesgo cero de data-loss:** las columnas actuales son aditivas y siguen leyéndose; el preset solo las override cuando está set.

### "Presets curados de F (semilla)" — NO existen
Grep confirmó: no hay sistema de white-label-desde-semilla previo. El único precedente es `deriveSportRamp(brandHex)` (derivar de 1 color), que es exactamente el bloque de construcción que un preset explota. Green-field limpio.

---

## 4. LOGIN del alumno — customización actual vs "opciones de diseño/animación"

**Estado actual (`app/c/[coach_slug]/login/page.tsx`):** UN solo layout hardcoded — variante "Inmersivo":
- Hero full-bleed con `radial-gradient` del color de marca (`--login-accent`, derivado + por-modo).
- Brand-mark: logo del coach o iniciales sobre "vidrio" (glass, backdrop-blur).
- `brand_name` en fuente curada, `welcome_message` como tagline.
- Sheet con esquinas redondeadas superpuesto (`rounded-t-2xl`).
- Animación de entrada: `LoginEntrance` / `LoginEntranceItem` (wrapper con stagger — ya existe la primitiva de animación).
- "con tecnología de EVA" discreto.

**Slots de variación que soportaría (para la decisión CEO de ofrecer "opciones de diseño o animación"):**
1. **Layout del hero:** inmersivo (actual) vs. split (logo izq / form der) vs. minimal (logo centrado sobre fondo sólido) vs. card-flotante. Cada uno es un branch de render; el color/logo/fuente ya vienen resueltos.
2. **Estilo de fondo:** gradiente radial (actual) vs. mesh gradient vs. sólido vs. imagen (requeriría columna nueva `login_bg_image_url`).
3. **Animación de entrada:** `LoginEntranceItem` ya soporta stagger; se podría exponer variantes (fade, slide-up, scale, none) como `login_animation` key.
4. **Forma del brand-mark:** cuadrado glass (actual) vs. círculo vs. sin marco.

**Cómo encajaría:** una columna `login_layout_key` (o parte del preset, campo `loginVariant`) + un mapa de componentes `LOGIN_LAYOUTS[key]`. La lógica de resolución de marca (color/logo/fuente/tagline) NO cambia — solo el shell visual. Bajo esfuerzo porque los datos ya están resueltos server-side.

---

## 5. RN MOBILE — Qué ya está espejado y qué falta

**Motor compartido (paridad por construcción):** `apps/mobile/lib/theme.ts` importa `resolveBrandTheme` + `deriveSportTokens` de `@eva/brand-kit` (mismo módulo que web). `brandVars()` inyecta `--color-sport-*`, `--color-primary`, `--color-cta-fill`, `--color-focus-ring` vía `nativewind vars()` en `ThemeContext.tsx`. **Color primario → paridad exacta con web/PWA.**

| Elemento | Web | RN Mobile | Gap |
|----------|-----|-----------|-----|
| Color primario + rampa sport | ✅ | ✅ (`brandVars`, `applyCoachBranding`) | — |
| Logo del coach | ✅ | ✅ (`CoachBranding.logoUrl`) | — |
| Loader custom (texto/ícono/color) | ✅ | ✅ parcial (`useCustomLoader`, `loaderText`, `loaderIconMode`, `loaderTextColor` en `branding.ts`; consumido por `EvaLoader`) | Falta `loader_variant` (las 6 animaciones) |
| **Color secundario (color2)** | ✅ | ❌ NO en `CoachBranding` (branding.ts no trae `brand_secondary_color`) | **Falta** |
| **Fuente curada** | ✅ | ❌ NO — mobile usa `HankenGrotesk`/`Archivo` fijos (`theme.ts fontSans/fontDisplay`); no lee `brand_font_key` | **Falta** (requiere cargar fuentes vía Expo Font) |
| **Acento por-modo** (`accent_light/dark`) | ✅ | ❌ `brandVars` solo toma `primaryColor` | **Falta** |
| **Tinte neutro** (`neutralTint`) | ✅ | ❌ no pasado a `resolveBrandTheme` | **Falta** |
| **Logo oscuro** (`logo_url_dark`) | ✅ | ❌ no en `CoachBranding` | **Falta** |
| **Variante de loader** (6 animaciones) | ✅ | ❌ solo el loader default | **Falta** (portar `components/loaders/`) |
| Push notification icon | N/A (icon EVA del store por diseño) | store=EVA (decisión) | — |

**Fila `branding.ts` (RN) trae solo:** `id, slug, primary_color, display_name, invite_code, logo_url, use_custom_loader, loader_text, loader_icon_mode, loader_text_color`. **Le faltan 5 columnas del white-label v2:** `brand_secondary_color`, `accent_light`, `accent_dark`, `neutral_tint`, `logo_url_dark`, `brand_font_key`, `loader_variant`.

**Trabajo extra en RN para paridad completa:**
1. Ampliar `BRANDING_COLS_RICH` + `CoachBranding` type con las 7 columnas faltantes.
2. Pasar `secondaryLight/Dark`, `accentLight/Dark`, `neutralTint` a `resolveBrandTheme` en `brandVars`/`applyCoachBranding`.
3. Cargar las 12 fuentes curadas vía `expo-font` (o subset) + mapear `brand_font_key` → `fontDisplay`.
4. Portar las 6 variantes de loader (`components/loaders/` web → RN/Reanimated).
5. Logo oscuro condicional por scheme.

**Para el pivote a presets:** RN se beneficia — un `theme_preset_key` en `@eva/brand-kit/presets.ts` (TS puro) se resuelve idéntico en RN. Si RN hidrata el preset por key, obtiene color2/fuente/accents "gratis" sin traer 7 columnas sueltas. **El modelo de presets simplifica la paridad mobile.**

---

## 6. Veredicto para el CEO

- **El motor es sólido y ya es "preset-ready".** `deriveSportTokens` + `resolveBrandTheme` derivan una marca completa y WCAG-safe desde 1–3 hex, compartidos web+RN. El pivote a temas curados es **configuración, no reingeniería**: un catálogo `BrandPreset[]` en `@eva/brand-kit` + una columna `theme_preset_key` + ocultar la rueda libre.
- **Lo que "no convence" probablemente son los GAPS de borde**, no el core: emails EVA-verdes (G1), push con ícono EVA (G2), OG card EVA (G11), splash background negro (G6). Son las superficies que el alumno ve FUERA del `<style>` inyectado, y son las que rompen la ilusión de "app del coach". Ninguna es cara de arreglar, pero hoy están sin brandear.
- **Login ya es la mejor superficie** — el pedido de "opciones de diseño/animación" es aditivo (variantes de layout/entrada), no un rescate.
- **Deuda de paridad RN:** color2, fuente, accents por-modo, tinte, logo dark y las 6 animaciones de loader NO están en mobile. El modelo de presets es la palanca para cerrarla barato (resolver por key en vez de 7 columnas).

Archivos clave: `packages/brand-kit/index.ts`, `apps/web/src/proxy.ts` (branch /c·/e·/t), `apps/web/src/app/c/[coach_slug]/layout.tsx`, `apps/web/src/app/coach/settings/BrandSettingsForm.tsx` + `BrandAdvancedSection.tsx`, `apps/web/src/app/coach/settings/_actions/settings.actions.ts`, `apps/mobile/lib/theme.ts` + `branding.ts`, `apps/web/src/lib/email/base-layout.ts` (gap), `apps/web/public/sw.js` (gap), `apps/web/src/lib/nutrition-pdf-brand.ts`.
