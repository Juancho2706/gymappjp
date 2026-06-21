# Plan de Implementacion — White-Label v2 (web/PWA)

> specs/whitelabel-v2/PLAN.md · Workflow multi-rol (8 lentes startup + research jun-2026) + síntesis de arquitecto · 2026-06-21

> Profundidad visual sobre la base de branding existente. Scope CERRADO por el CEO (no se re-litiga): color2/acento, fuente curada (~12 Google Fonts, sin upload), dark mode brandeado, login/onboarding brandeado pre-auth, variantes de loader. Aplica a la cara del alumno (`/c/[slug]`) Y al panel coach (via toggle `use_brand_colors_coach`). Gate de pago: **Pro en adelante**. "Powered by EVA" discreto SIEMPRE. Subdominio = track aparte.

---

## 0. Decisiones CERRADAS por el CEO (2026-06-21) — resuelven la seccion 5, no se re-litigan

1. **Color secundario = INDEPENDIENTE** (badges/tags/macros nutricionales/2da serie de charts). NO es el acento del tema; botones/links siguen saliendo del primario. Aditivo, con default derivado.
2. **Branding = Pro+ ENTERO.** starter y free ven **TODO EVA system** (colores EVA, loader EVA, logo EVA) — SIN custom de ningun tipo. NO hay "branding basico" para starter. `canUseBranding` se vuelve Pro+ (era `true` en starter). **Colapsa el diseno de 2 capabilities a UNA** (`isBrandingAllowed`).
3. **Corte DURO:** coaches < Pro que hoy tengan color/logo custom **caen a EVA en el deploy** (lo guardado en DB NO se borra, solo deja de aplicar). Sin flag de grandfathering. → el CEO avisa a cualquier starter ACTIVO afectado antes del deploy (ver nota de comms en W0/seccion 5).
4. **Fuente = solo titulos/display.** Body siempre Inter (perf + cero CLS). Aplica tambien al panel coach cuando el toggle esta en "mi marca".
5. **Dark = el ALUMNO elige claro/oscuro**; el coach solo customiza el acento por-modo. Sin `forcedTheme`, sin columna de modo forzado.
6. **logo_url_dark = SI ahora** (paridad orgs/teams; resuelve logo oscuro invisible en dark).
7. **Loaders = SI en el MVP, 6 variantes** provistas por el CEO en `specs/whitelabel-v2/loaders-source/` (DC-artifacts SVG+CSS, ya brand-aware via `--ld-brand`/`--ld-rgb`): **progreso, anillo, radar, cometa, ritmo, orbitas**. Son **opciones que el coach Pro+ elige**; el **DEFAULT (`loader_variant='eva'`) sigue siendo el loader actual de EVA** (el SVG multicolor existente) — lo ven free/starter y los Pro+ que no eligen otro. NO se reemplaza el actual. Fondo **theme-aware** (claro en light / oscuro en dark, NO el dark cosmico fijo de la demo); color fijado al `--theme-primary` del coach (el rainbow de la demo es solo muestra); icono central = logo del coach (icono EVA si no hay). W3 EN scope.
8. **Subdominio = DIFERIDO** hasta senal real (>=3 coaches Pro pidiendolo O 1 upgrade atribuido). W5 fuera del ciclo actual.

**Scope del ciclo actual (tras decisiones): W0 -> W1 -> W2 -> W3 -> W4.** W5 (subdominio) diferido.

---

## 1. Resumen + decision de enfoque

**Hallazgo central (8 roles convergen):** la base es mas madura que lo que sugiere el roadmap. El motor `@eva/brand-kit` (`packages/brand-kit/index.ts`) ya resuelve tema light+dark con acento por-modo, contrast-clamp WCAG AA (`clampAccent`, `pickOnColor`, `resolveBrandTheme`, `contrastReport`, `isThemeReadable`), y el layout del alumno (`apps/web/src/app/c/[coach_slug]/layout.tsx` L162-237) YA consume `accentLight/accentDark/neutralTint` y emite un bloque `.dark`. El grueso de v2 es **threading de campos nuevos por un pipe que ya existe** (proxy SELECT → headers `x-coach-*` → `<style>` inyectado) + **UX de configuracion**, no arquitectura nueva.

**Orden de fases por valor/esfuerzo:**

| Fase | Contenido | Por que en este orden |
|---|---|---|
| **W0** | Spec congelada + gate Pro+ server-side + lista de fuentes + schema/migracion definidos | Sin gate server-side primero, todo lo demas filtra el feature pago. Bloqueante. |
| **W1** | Migracion `coaches` (paridad con orgs/teams) + motor (color2 en `generateBrandPalette` + `resolveBrandTheme`) + regen types | Motor aditivo, puro TS, testeable sin UI. Habilita W2-W4. |
| **W2** | Aplicacion visual: color2 + fuente + dark brandeado, alumno + panel coach con toggle | 80% del valor percibido. Reusa el pipe + `@eva/brand-kit`. |
| **W3** | Variantes de loader (importar los del CEO, 5+) | Depende de los assets del CEO; menor valor (solo se ve en transiciones) pero el CEO lo quiere en el MVP. |
| **W4** | Login/onboarding brandeados pre-auth | Alto "wow" de demo; cierra el gate-leak del login. |
| **W5** | Subdominio `slug.eva-app.cl` (cookies aisladas host-only) | **DIFERIDO** (decision #8), infra-dependiente (DNS/Vercel/Supabase). Detras de flag. No mezclar con W1-W4. |

**Scope del ciclo (decision CEO): W0 → W1 → W2 → W3 → W4.** El CEO eligio mantener loaders (W3, 5+ variantes) en el MVP. **Solo W5 (subdominio) se difiere** hasta senal real (>=3 coaches Pro pidiendolo O >=1 upgrade atribuido a branding). El PM marca el riesgo #1 (roadmap-burner con revenue ~nulo): mitigacion = usar v2 como argumento de venta en las 14 llamadas + instrumentar atribucion (seccion 7) para validar el gasto antes de abrir W5.

---

## 2. Fases

### W0 — Spec, gate Pro+, schema y curaduria (bloqueante, sin codigo visual)

**Objetivo:** cerrar el contrato de datos, el gate de pago y la lista de fuentes ANTES de tocar el motor o la UI.

**Tareas atomicas:**

1. **Gate UNICO: branding (todo) = Pro+ — flip de `canUseBranding` (decision CEO #2).**
   - Archivo: `packages/tiers/index.ts`. Hoy `TIER_CAPABILITIES.starter.canUseBranding = true` (L154-160). **Flip a `false` para `free` y `starter`**; `true` para `pro`/`elite`/`growth`/`scale`. NO se agrega un 2do capability: starter/free pierden TODO el branding (color/logo/loader), no solo la "profundidad".
   - Ajustar el copy de `SHARED_TIER_FEATURES` ("Branding personalizado", L68) para que starter ya NO lo liste (era un feature de starter; ahora arranca en Pro). Revisar paginas de pricing/planes que muestren ese bullet.
   - Helper puro `isBrandingAllowed(tier): boolean` (= `getTierCapabilities(tier).canUseBranding`). **Fuente unica** de las 5 superficies (proxy, layout alumno, layout coach, login, manifest/splash). Reusa el `canUseBranding` ya existente — solo cambia su valor por tier.
   - **DoD:** test de matriz `free=false, starter=false, pro=true, elite=true, growth=true, scale=true` + fail-closed (`'' / null / unknown → false`).

2. **Gate Pro+ en el WRITE path (hoy AUSENTE — bloqueante de monetizacion).**
   - Archivo: `apps/web/src/app/coach/settings/_actions/settings.actions.ts`. Hoy `updateBrandSettingsAction` (L16-88) valida el schema y hace UPDATE **sin chequear tier**. Un coach starter/free puede POSTear el action directo y persistir branding.
   - Plan: en la action, fetch `coach.subscription_tier`; si `!isBrandingAllowed(tier)`, **rechazar** la escritura de TODOS los campos de marca (`primary_color`, `brand_secondary_color`, `logo_url`, `logo_url_dark`, `brand_font_key`, `accent_*`, `neutral_tint`, `loader_*`, `welcome_*`). Branding es Pro+ entero (decision #2).
   - **DoD:** un starter que envia cualquier payload de branding NO lo persiste; un pro SI.

3. **Modelo de columnas (paridad con orgs/teams).** Verificado: `coaches` solo tiene `primary_color` + `logo_*` + `loader_*` + `welcome_*`. `organizations`/`teams` ya tienen `accent_light/accent_dark/neutral_tint/logo_url_dark` (`packages/schemas/org.ts` ya valida `HexColor` para accent/neutral). `brand_secondary_color` y `loader_variant` son conceptos NUEVOS (no existen en orgs/teams tampoco). `logo_url_dark` SE AGREGA (decision #6).

4. **Congelar la lista de ~12 fuentes** (ver seccion 3). **Loaders (decision #7): 6 variantes ya provistas** en `specs/whitelabel-v2/loaders-source/` (SVG+CSS, brand-aware). Congelar el enum `loader_variant = ['eva' (default = loader actual), 'progreso', 'anillo', 'radar', 'cometa', 'ritmo', 'orbitas']`. Pipeline de W3 = portar DC→React/CSS-modules (sin Lottie, sin sanitizacion de upload — es codigo propio).

5. **Definir el registry de fuentes como fuente unica:** crear `apps/web/src/lib/brand-fonts.ts` (web-only) con `CURATED_FONTS: Record<FontKey, { family, cssVar, fallback, category }>` y un `z.enum` de las 12 keys. (La carga real con `next/font` va en W2; aca solo se congela el contrato y el enum para que schema/proxy puedan confiar en el.)

**DoD de W0:** capability flipeado + helper testeado; write-path gateado; lista de columnas/fuentes/loaders firmada; enums de fuente y loader definidos. Sin cambios visuales.

---

### W1 — Motor + migracion (aditivo, puro TS, zero-regression)

**Objetivo:** extender el motor de color y la DB sin tocar render todavia.

**Tareas atomicas:**

1. **Migracion unica aditiva (aditivo-en-LIVE, sin Supabase branches — ver memoria `feedback_no_supabase_branches`).**
   ```
   ALTER TABLE public.coaches
     ADD COLUMN brand_secondary_color text NULL,
     ADD COLUMN accent_light text NULL,
     ADD COLUMN accent_dark text NULL,
     ADD COLUMN neutral_tint boolean NOT NULL DEFAULT false,
     ADD COLUMN logo_url_dark text NULL,
     ADD COLUMN brand_font_key text NULL,
     ADD COLUMN loader_variant text NOT NULL DEFAULT 'eva';
   -- Paridad para que el selector de loader/color2 funcione en las 3 fuentes de marca:
   ALTER TABLE public.teams ADD COLUMN brand_secondary_color text NULL,
     ADD COLUMN loader_variant text NOT NULL DEFAULT 'eva';
   ALTER TABLE public.organizations ADD COLUMN brand_secondary_color text NULL,
     ADD COLUMN loader_variant text NOT NULL DEFAULT 'eva';
   ```
   - Todas nullable/defaulted → NULL accent ⇒ `resolveBrandTheme` cae a `brandColor` (ya manejado en L119/124). Zero-regression.
   - **NO** se cambia RLS: `coaches_update_own` ya cubre self-update. El gate del branding (todo Pro+) vive en el server action (RLS no ve el tier barato).
   - Validar con tx-rollback antes de aplicar (`SET LOCAL ROLE` + advisors). Regenerar `apps/web/src/lib/database.types.ts`.

2. **Motor color2 en `apps/web/src/lib/color-utils.ts` (puro, sin deps).**
   - Extender `generateBrandPalette(primaryHex, secondaryHex?)` (L71) para emitir, cuando hay secundario: `secondary`, `secondaryDark`, `secondaryLight`, `secondarySurface`, `secondaryRgb`, `secondaryForeground` (espejo exacto de las shades primary, L75-83, usando `getContrastInfo` para el foreground).
   - **Firma single-arg sigue funcionando** (`secondaryHex` default `undefined` ⇒ sin vars secundarias) → todos los callers actuales (`coach/layout.tsx` L110, `c/[coach_slug]/layout.tsx` L170) intactos.

3. **Motor color2 en `@eva/brand-kit` (`packages/brand-kit/index.ts`) — SOLO aditivo (compartido web+mobile).**
   - Agregar a `BrandThemeInput` (L30-38) campo opcional `secondaryLight?: string|null` + `secondaryDark?: string|null`. Agregar a `BrandThemeTokens` (L18-26) `accent2: string` + `accent2Text: string`, derivados con el MISMO `clampAccent`/`pickOnColor` por-modo (cuando son null → default = `accent`/`accentText`, sin alterar defaults existentes).
   - Extender `contrastReport` (L152-164) con los pares del secundario (`accent2Text`-on-`accent2` ≥ 4.5, `accent2`-on-`bg` ≥ 3) en ambos modos, para que `isThemeReadable` (publish-gate) tambien bloquee un secundario ilegible.
   - **La fuente NO entra a brand-kit** (es concern DOM/CSS; brand-kit es DOM-free por diseno). La lista de fuentes vive en `apps/web/src/lib/brand-fonts.ts` (web-only); mobile carga fuentes via Expo en su propia sesion.
   - **DoD:** nuevos tests en `packages/brand-kit/brand-kit.test.ts` con pares brand+secondary adversariales (`#ffffff`, `#000000`, neon `#39FF14`, `#808000`) que aseguren AA en light Y dark; `mobile tsc` verde (probar que las firmas opcionales no rompen RN).

**DoD de W1:** migracion aplicada + types regenerados; motor extendido aditivamente; vitest + mobile tsc verdes. Render aun sin cambios (las columnas vienen NULL).

---

### W2 — Aplicacion visual: color2 + fuente + dark (alumno + coach con toggle)

**Objetivo:** que el coach Pro+ vea y aplique color2, fuente y dark brandeado, en la cara del alumno Y en su panel (gobernado por `use_brand_colors_coach`).

**Tareas atomicas:**

1. **Schema de escritura (`packages/schemas/coach.ts`, `BrandSettingsSchema` L3-28).**
   - `brand_secondary_color`: `z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal(''))` (espejo de `primary_color` L7).
   - `accent_light` / `accent_dark`: mismo hex regex, opcionales.
   - `neutral_tint`: `z.boolean().default(false)`.
   - `logo_url_dark`: URL opcional (mismo manejo que logo via `updateLogoAction`).
   - `brand_font_key`: `z.enum([...12 keys...]).optional()` (importar el enum de `brand-fonts.ts`). **NUNCA string libre** — es la unica defensa contra CSS-injection en la fuente.
   - `loader_variant`: `z.enum([...keys del registry...]).default('eva')` (espejo de `loader_icon_mode` L13).

2. **Threading por el proxy (`apps/web/src/proxy.ts`).**
   - Extender el SELECT de `coachBrandingPromise` (L200-202) con: `brand_secondary_color, accent_light, accent_dark, neutral_tint, logo_url_dark, brand_font_key, loader_variant`. **Es la misma fila ya fetcheada** → costo ~0 (sin query nueva; respeta la optimizacion de DB-requests de la memoria).
   - En el branch `/c` (L730-741), tras computar el tier, setear los headers de marca SOLO si `isBrandingAllowed(tier)`: `x-coach-secondary-color`, `x-coach-accent-light`, `x-coach-accent-dark`, `x-coach-neutral-tint`, `x-coach-logo-url-dark`, `x-coach-font-key`, `x-coach-loader-variant` (mas los `x-coach-*` actuales de color/logo). Si no es Pro+, **no setear NINGUN header de marca** (cae a EVA completo en el layout). Espejar en `buildClientRouteResponse` (L743-763).
   - **Factor compartido:** extraer `buildCoachBrandHeaders(coach, tier)` para que el branch `/c` y el futuro branch subdominio (W5) no driften.

3. **Layout del alumno (`apps/web/src/app/c/[coach_slug]/layout.tsx`).**
   - Leer los headers nuevos (espejo de L164-166). Gate: reemplazar el predicado `isFreeTier` por `!isBrandingAllowed(tier)` para **TODOS** los campos de marca (color1+color2/logo/font/accent/dark/loader). starter cae al gate igual que free (decision #2) → ven EVA completo.
   - Pasar `secondaryHex` a `generateBrandPalette` (L170) y agregar al `<style>` (L214-237): `--theme-secondary`, `--theme-secondary-rgb`, `--theme-secondary-foreground` en `:root` + su override en `.dark`. Re-validar hex en 2da capa igual que `safeLoaderTextColor` (L157-159) ANTES de interpolar.
   - Fuente: emitir `--brand-font: var(--font-brand-<key>, var(--font-inter))` resuelta desde el registry server-side (NUNCA el string crudo del coach).

4. **Fuente: cargar las 12 con `next/font` (build-time, self-hosted).**
   - En `apps/web/src/app/layout.tsx` (hoy solo `Inter`+`Montserrat`, L22-32): instanciar las 12 con `next/font/google`, cada una `{ variable: '--font-brand-<key>', subsets:['latin'], display:'swap', preload:false, weight:['400','500','600','700'], adjustFontFallback:true }`. `preload:false` en las 11 no-default es **critico** (12 `<link rel=preload>` en `<head>` degradaria LCP). El browser solo descarga la woff2 cuya `font-family` se usa.
   - **Refactor del `!important` (bloqueante "looks done but isn't"):** `globals.css` L300 (`body`) y L306 (`h1..h6`) hardcodean `font-family ... !important`, que **silenciara** `--brand-font`. Rerutear via los tokens `@theme` (L14-15): `--font-sans: var(--brand-font-body, var(--font-inter), ...)` y `--font-display: var(--brand-font, var(--font-montserrat), ...)`, y **quitar** los `!important` (o scopearlos a un wrapper del subtree branded para que las paginas de marketing EVA queden byte-identicas). **Decision #4: fuente custom solo en headings/display + wordmark**; body queda Inter (legibilidad + colapsa CLS casi a cero).

5. **Panel coach (`apps/web/src/app/coach/layout.tsx`) — el gap real del dark brandeado.**
   - Hoy llama `generateBrandPalette(primaryColor)` (L110) y emite SOLO `:root` (L140-156), **sin** `.dark`, **sin** `resolveBrandTheme`. El alumno ya lo hace bien.
   - Plan: portar el patron del alumno — usar `resolveBrandTheme({ brandColor, accentLight, accentDark, neutralTint, secondaryLight, secondaryDark })` + emitir el bloque `.dark` + `--brand-font` + vars secondary. Gatear con `use_brand_colors_coach !== false` (toggle existente, L112) **Y** `isBrandingAllowed(coach.subscription_tier)`.
   - **DoD del toggle:** con `use_brand_colors_coach = false` el panel coach renderiza EVA; con `true` renderiza la marca (incl. fuente+dark+color2). Los alumnos SIEMPRE ven la marca (el toggle solo afecta el panel del coach).

6. **UI del coach (`apps/web/src/app/coach/settings/BrandSettingsForm.tsx`).**
   - Reusar el loop de live-preview existente (el `useEffect` que escribe `--theme-primary` al DOM en cada cambio) para color2/fuente/dark — nunca guardar a ciegas.
   - Agregar: color-picker secundario, dropdown de fuente (cada opcion renderizada en su tipografia + par Titulo/cuerpo), accent dark + toggle de preview light/dark, neutral_tint. **Reusar la red de seguridad:** badge WCAG existente + `contrastReport` por-modo (patron de `org/[slug]/brand/_components/BrandStudio.tsx`), y **bloquear Guardar si cualquier modo falla AA** (publish-gate `isThemeReadable`).
   - **Reuso fuerte recomendado:** extraer un `<BrandStudio>` compartido de `org/[slug]/brand/_components/BrandStudio.tsx` (que YA tiene preview light/dark, accent por-modo, dual logo, guard de contraste) y parametrizarlo por who-can-edit + set de columnas. Mata el drift entre las superficies de inyeccion.

**DoD de W2:** un coach Pro guarda color2/fuente/dark y los ve live en preview, en la app del alumno (light Y dark) y en su panel (con toggle). Un starter NO puede guardarlos (write-path) ni verlos (render cae a EVA completo). vitest + tsc + mobile tsc verdes.

---

### W3 — Variantes de loader (6 del CEO + default EVA actual)

**Objetivo:** registry cerrado de 6 loaders seleccionables por el coach Pro+, porteados desde `specs/whitelabel-v2/loaders-source/` a React/CSS-modules. **El default (`'eva'`) sigue siendo el loader EVA actual** (no se reemplaza).

**Fuente (en el repo):** `specs/whitelabel-v2/loaders-source/LoaderGallery.dc.html` (las 6: progreso/anillo/radar/cometa/ritmo/orbitas), `Loader.dc.html` (la "progreso" full-screen), `eva-icon-white.png` (icono fallback). TODAS SVG+CSS puras (`@keyframes` lgSpin/lgPing/lgEq/lgDash/lgSpinRev/lgFloat), **0 deps, sin Lottie, sin upload**, ya brand-aware via `--ld-brand`/`--ld-rgb`.

**Tareas atomicas:**

1. **Portar DC→React.** Cada variante a un componente en `apps/web/src/components/loaders/variants/` + su CSS module (los `@keyframes` se copian tal cual). El `<x-dc>`/`DCLogic`/`support.js` NO se usa (es runtime de artifact, no del app).
2. **De-demo (color):** quitar el color-morph del palette (es solo muestra). Mapear `--ld-brand = var(--theme-primary)` y `--ld-rgb = var(--theme-primary-rgb)` (ya emitidos por el `<style>` del layout). Cada loader toma el color del coach.
3. **Fondo theme-aware (decision CEO):** reemplazar el `#08080a` + glow + grid fijos por tokens que respeten el modo (`var(--background)` claro/oscuro; el glow usa `--theme-primary` a baja opacidad). NO forzar dark.
4. **Icono central = logo del coach** (`logo_url`/`logo_url_dark` segun modo) con fallback a `eva-icon-white.png`. La variante "ritmo" (05) no lleva icono.
5. **Registry tipado:** `apps/web/src/components/loaders/registry.tsx` mapeando `loader_variant` enum → componente. **Default `'eva'` = el loader ACTUAL** (`EvaRouteLoader.tsx`/`EvaTreefrogLoader.tsx`, el SVG multicolor existente) — intacto, 0 JS extra. Las 6 nuevas se suman como keys: `progreso/anillo/radar/cometa/ritmo/orbitas`. Variante invalida o no-Pro → fallback `'eva'`.
6. **Threading:** header `x-coach-loader-variant` (ya seteado en W2) + CSS var `--coach-loader-variant` (mismo patron que `--coach-loader-icon-mode` L228). `useLoaderBrandConfig` (en `EvaRouteLoader.tsx`) lee la var y elige el componente.
7. **Completo vs compacto:** la "progreso" (full: wordmark+barra+%) en carga inicial/splash; en transiciones rapidas de ruta, **version compacta** (solo spinner/icono, sin barra) para no sentir lag. `prefers-reduced-motion` → estatico (los keyframes ya lo respetan via el media-query del source).
8. **Wordmark:** el "EVA" del wordmark (variantes progreso/anillo) pasa a `brand_name` del coach.

**DoD de W3:** coach Pro elige 1 de 6 en el selector (galeria con thumbnails), se aplica en alumno + panel con SU color y logo; default/free/starter = loader EVA actual; fondo respeta light/dark; `prefers-reduced-motion` estatico; bundle del first-load sin regresion (code-split por variante, solo carga la elegida).

---

### W4 — Login/onboarding brandeados pre-auth

**Objetivo:** que el alumno vea la marca (color2 + fuente + dark) ANTES de loguearse, coherente con la app, y cerrar el gate-leak del login.

**Tareas atomicas:**

1. **Extender la query pre-auth (`apps/web/src/app/c/[coach_slug]/login/_data/login.queries.ts`).** `getClientLoginCoach` (L19-28) hoy selecciona `brand_name, primary_color, logo_url, welcome_message` y **NO mira tier** → un coach free/starter ya filtra su marca en login (gate-leak). Agregar al SELECT: `brand_secondary_color, accent_dark, logo_url_dark, brand_font_key, subscription_tier`.
2. **Aplicar el gate Pro+ en el login (`login/page.tsx` + `ClientLoginForm.tsx`).** Si `!isBrandingAllowed(tier)` → caer a **EVA total** (decision #2/#3: starter no tiene branding, ni siquiera color1/logo en login). Pro+ ve marca completa. Mismo predicado que el layout autenticado.
3. **Migrar el login a `resolveBrandTheme` + var de fuente.** Hoy pinta `primary_color` crudo, sin acento por-modo, sin fuente, sin dark. Inyectar un `<style>` scopeado (mismo helper `buildBrandStyleTag` de W2) con `--brand-font` + acento + `.dark`. **Decision #4 (perf):** fuente custom solo en el wordmark/titulo del login (texto corto, swap imperceptible), body/inputs en Inter (es la primera pantalla, sin cache caliente).
4. **Onboarding/welcome modal** (`welcome_modal_*` ya existen) hereda las mismas vars una vez el login las inyecta.

**DoD de W4:** alumno nuevo de un coach Pro ve marca completa (color2/fuente/dark) en login y onboarding, identica a la app; coach free/starter ve **EVA total** en login. Incluir el login como tab en el preview del coach para que confirme coherencia.

---

### W5 — Subdominio `slug.eva-app.cl` (DIFERIDO, track aparte, cookies aisladas)

**Estado: DIFERIDO (decision #8)** hasta senal real (>=3 coaches Pro pidiendolo O >=1 upgrade atribuido a branding). Se documenta para no perder el diseno; NO entra al ciclo actual.

**Objetivo:** servir cada coach Pro+ bajo su subdominio, con **sesiones aisladas host-only** (sin SSO cruzado).

**Pre-requisitos de INFRA (CEO/ops, dashboard actions — NO codigo, primero):**
- DNS wildcard `*.eva-app.cl` apuntando SOLO al proyecto EVA en Vercel + delegar `_acme-challenge` (TLS wildcard). **Auditar que no queden CNAMEs colgantes** (vector de subdomain-takeover).
- Supabase Auth redirect URLs `https://*.eva-app.cl/**`.

**Tareas atomicas (detras de Edge Config flag, espejo de `PROXY_USE_GETCLAIMS`):**
1. **Rama nueva en `proxy.ts`** (arriba, tras el bloque enterprise-domain): detectar host que termina en `.eva-app.cl` y NO es `enterprise`/apex/`www`/reservado, extraer subdominio como slug, resolver coach con el MISMO `INVITE_CODE_RE`/`SLUG_RE`, y **rewrite a `/c/{slug}{path}`** inyectando `buildCoachBrandHeaders` (el factor compartido de W2). 404 si el slug no existe (no fabricar tenant).
2. **Cookies HOST-ONLY:** **NO** setear `AUTH_COOKIE_DOMAIN` para white-label (sigue dormido en `proxy.ts` L183-186 y `server.ts`). Login por subdominio, sin SSO cruzado. El "gap" de `client.ts` (browser no setea domain) es **correcto** para host-only — dejarlo, con comentario documentando que el switch dormido es solo para el caso `/e` enterprise SSO.
3. **Denylist de subdominios reservados** (`www`, `app`, `api`, `enterprise`, `admin`, `mail`, ...) para que un slug no eclipse infra.
4. **Polish:** `X-Robots-Tag: noindex` en tenants; emails con base-URL del subdominio (`resolveMetadataBase`/`site-url`); manifest start_url/scope rooteados al subdominio.
5. **Gate Pro+ tambien aca:** un coach < Pro no obtiene subdominio brandeado.

**DoD de W5:** `slug.eva-app.cl` resuelve la marca del coach correcto con TLS valido; cookie de `coachA` NO se manda a `coachB` ni al apex (Set-Cookie sin atributo `Domain`); flag apagable; assert de deploy/CI que `AUTH_COOKIE_DOMAIN` queda vacio en prod para white-label.

---

## 3. Curaduria sugerida de ~12 fuentes

Todas Google Fonts, subset `latin`, sans-serif (legibilidad de app), variable donde exista, pesos `400/500/600/700`. **Inter SIEMPRE en el fallback de la var** (`--brand-font: 'X', var(--font-inter), sans-serif`) para que una fuente que no carga degrade a legible, nunca a serif del sistema.

| Key | Fuente | Nota |
|---|---|---|
| `inter` | **Inter** | default EVA / body workhorse (ya cargada) |
| `montserrat` | **Montserrat** | display actual (ya cargada) |
| `plus-jakarta` | **Plus Jakarta Sans** | variable, moderna |
| `hanken` | **Hanken Grotesk** | variable, body fuerte 2026 |
| `manrope` | **Manrope** | variable, geometrica limpia |
| `poppins` | **Poppins** | geometrica, amistosa |
| `sora` | **Sora** | techy, variable |
| `space-grotesk` | **Space Grotesk** | creativa, variable |
| `outfit` | **Outfit** | geometrica clean, variable |
| `figtree` | **Figtree** | calida, variable |
| `dm-sans` | **DM Sans** | compacta, legible en small |
| `lexend` | **Lexend** | **pick de accesibilidad** (disenada para legibilidad) |

Si el peso de build de las 12 molesta, recortar a 6-8 (excluir las que no aporten contraste de personalidad). Decision #4: aplicar a headings/display; body en Inter.

---

## 4. Riesgos consolidados + mitigacion

| # | Riesgo | Sev | Mitigacion |
|---|---|---|---|
| R1 | **Roadmap-burner:** features de pixeles con revenue ~nulo | alta | CEO mantiene W0-W4 (incl. loaders); solo W5 diferido. Mitigacion: usar v2 como argumento en las 14 llamadas + instrumentar atribucion de upgrade (seccion 7) para validar el gasto antes de abrir W5. |
| R2 | **Gate-leak / bypass de monetizacion:** write-path sin tier check; login/manifest sin tier check | alta | `isBrandingAllowed` (= `canUseBranding` flipeado a Pro+) como predicado unico en proxy + layout alumno + layout coach + login query + manifest/splash + write action. Test de matriz. |
| R3 | **Cookie compartida `Domain=.eva-app.cl`:** XSS o subdomain-takeover en 1 tenant compromete la auth de TODA la plataforma | alta | **Host-only por tenant** (`AUTH_COOKIE_DOMAIN` SIN setear, login por subdominio, sin SSO cruzado). Wildcard DNS solo al proyecto EVA, sin CNAMEs colgantes. Assert de deploy. Consenso seguridad 2026 (Okta/WorkOS). Aplica solo cuando se abra W5. |
| R4 | **`!important` de fuente** (`globals.css` L300/L306) silencia `--brand-font` → "looks done but isn't" | alta | Rerutear `--font-sans`/`--font-display` por `var(--brand-font, default)` y quitar/scopear los `!important`. Test que asserta `font-family` computada en un heading `/c`. |
| R5 | **Fuente dinamica rompe build** (`next/font` es build-time) o `@import` runtime degrada LCP/CLS + fuga IP (Ley 21.719) | media | Pre-cargar las 12 con `next/font` self-hosted, `preload:false`, `adjustFontFallback:true`; conmutar por `--brand-font`. PROHIBIR `@import`/`<link>` a googleapis. |
| R6 | **Contraste/legibilidad:** coach elige color2/dark ilegible; valida solo light y publica un dark que falla AA | media | `clampAccent` ya rescata; **bloquear Guardar** si `contrastReport` falla en CUALQUIER modo (publish-gate `isThemeReadable`). Preview light/dark obligatorio. Mostrar swatch clampeado con nota "ajustamos tu color para legibilidad". |
| R7 | **color2 invisible** (sin consumidores definidos) o choca con primary | media | color2 es INDEPENDIENTE (decision #1). Allow-list cerrada ANTES de wirear: botones secundarios/outline, badges/tags + macros nutricionales, 2da serie de charts, underline de tab activo. Excluir: CTA primario, nav activo, links, focus ring (quedan primary). Warning suave si color2 ≈ primary (deltaE/hue OKLCH). |
| R8 | **brand-kit compartido web+mobile** se rompe al agregar color2 | media | Solo aditivo: `secondaryLight/Dark` opcionales en `BrandThemeInput`, `accent2/accent2Text` con default = accent. Nunca cambiar firmas/defaults. `mobile tsc` en el gate. Fuente NO entra a brand-kit. |
| R9 | **Loaders del CEO (6)** inflan bundle | baja-media | Todas SVG+CSS puras (0 deps, **sin Lottie, sin upload → sin vector XSS**); code-split por variante (solo carga la elegida); default = loader EVA actual (0 JS extra, intacto). Sin runtime de animacion externo. |
| R10 | **Drift entre los 3 sitios de inyeccion** (`<style>` alumno, coach, login) | media | Un solo helper server-side `buildBrandStyleTag({palette, theme, fontKey, secondary, loaderCfg})` consumido por las 3 superficies. El client SOLO lee vars, nunca input directo. |
| R11 | **Corte duro a starter (decision #3):** un coach starter activo pierde su marca sin aviso y se queja | media | Antes del deploy, el CEO corre la query (seccion 5) de coaches < Pro con branding seteado y les avisa. El valor en DB NO se borra (si suben a Pro, vuelve). |
| R12 | **Powered-by-EVA removible** por CSS del coach o confundido con el footer free | baja | Render fuera del scope de vars manipulables (markup fijo, como L272-281). Pro+ = micro-badge discreto SIN UTM agresivo; free = footer-CTA con `utm_source=free_footer`. Incognito total descartado (decision cerrada). |

---

## 5. Decisiones (RESUELTAS por el CEO 2026-06-21)

Las 8 decisiones abiertas quedaron cerradas (ver bloque "Decisiones CERRADAS" — seccion 0). Resumen: color2 independiente · branding = Pro+ entero (starter/free = EVA total) · corte duro sin grandfather · fuente solo titulos · dark lo elige el alumno (accent-only) · logo_url_dark SI · loaders SI 5+ variantes en MVP · subdominio diferido.

**Notas de implementacion que sobreviven a las decisiones:**
- **Manifest cacheado 24h** (`s-maxage=86400`): tras un downgrade Pro→starter el manifest PWA puede tardar en volver a EVA. Documentar el lag o cache-bustear en cambio de tier.
- **Comms del corte duro (decision #3):** antes del deploy, el CEO revisa si algun coach starter/free ACTIVO tiene branding seteado y le avisa (cae a EVA). Query rapida:
  ```sql
  select id, slug, subscription_tier, primary_color, logo_url
  from public.coaches
  where subscription_tier in ('free','starter')
    and (primary_color is not null or logo_url is not null);
  ```
- **Loaders: RESUELTO** — 6 variantes SVG+CSS provistas (`specs/whitelabel-v2/loaders-source/`); default = loader EVA actual (no se reemplaza); fondo theme-aware; color = `--theme-primary`; icono = logo del coach. Port DC→React en W3. NO bloquea W0-W2.

---

## 6. Gate Pro+ server-side + "Powered by EVA" + toggle

- **Gate Pro+ (server-side, fuente unica):** `isBrandingAllowed(tier)` (W0) consumido en las 5 superficies: (a) `updateBrandSettingsAction` (rechaza branding si no Pro+), (b) `proxy.ts` branch `/c` (no setear headers de marca si no Pro+), (c) `c/[coach_slug]/layout.tsx` (render EVA si no Pro+), (d) `coach/layout.tsx` (idem panel), (e) `login.queries.ts`/`login/page.tsx` + `api/manifest/[coach_slug]/route.ts` + `api/splash`. **El proxy es el choke-point ideal:** neutralizar los headers de marca ahi colapsa "gatear en cada superficie" a un punto testeado. Defense-in-depth: el render igual cae a EVA si una fila stale trae valores Pro tras un downgrade.
- **Downgrade Pro→starter:** el branding NO se aplica (gate lee tier LIVE), SIN borrar lo guardado en DB. **Manifest cacheado 24h** (`s-maxage=86400`) → documentar el lag o decidir cache-bust en cambio de tier.
- **"Powered by EVA" discreto SIEMPRE (no incognito):** mantener las instancias actuales (footer alumno L272-281, "Impulsado por EVA" en login). Para Pro+ NO se oculta: micro-badge discreto que **respeta dark/acento del coach** (que se vea integrado, no parche EVA), SIN el UTM agresivo del footer free. Render como markup fijo fuera del scope de vars del coach. Guard de regresion (snapshot) que asegure su presencia en free/starter/pro en alumno + login + panel.
- **Toggle `use_brand_colors_coach`** (panel coach): ya gobierna color+loader del panel; v2 lo extiende a fuente+acento+dark. Reformular el copy confuso ("Usar todos mis estilos personalizados en mi dashboard actual", `BrandSettingsForm.tsx`) a un segmented control **"Ver mi marca | Ver EVA"** + nota "Esto solo cambia TU panel; tus alumnos siempre ven tu marca". Los alumnos SIEMPRE ven la marca del coach (el toggle no los afecta).

---

## 7. Metricas a instrumentar (desde el dia 1)

1. **Adopcion:** % de coaches Pro+ que configuran ≥1 atributo de marca (color2/fuente/dark/loader) en 30 dias.
2. **Atribucion de upgrade:** evento analytics "vio/toco el gate de branding" + upgrades starter→pro en los 7 dias siguientes (sin el evento, la atribucion de revenue es debil — instrumentar evento real, no solo el proxy de brand-score). **Este es el dato que abre/cierra W5.**
3. **Brand-completion score:** extender el `brandScore` existente en `BrandSettingsForm.tsx` con los campos nuevos; trackear distribucion (motor de descubrimiento Pro: un coach recien upgradeado ve su score incompleto).
4. **Retencion:** retencion de alumnos en coaches con marca completa vs sin (la research liga app-branded ↔ retencion — argumento de venta, no solo estetica).
5. **Performance (ya instrumentado con SpeedInsights + `@vercel/analytics` en el root layout):** baseline LCP/CLS/INP de `/c/[slug]/dashboard` y `/c/[slug]/login` ANTES del feature; gate de merge: **CLS no sube > 0.01, LCP mobile no sube > 100ms** tras cada sub-feature (color2 → fuente → dark → loader).
6. **Gate parity (test, no negocio):** assert E2E de que starter NO obtiene branding en las 5 superficies, y que el "powered by EVA" esta SIEMPRE presente.

---

**Archivos clave (reales, verificados):** `packages/tiers/index.ts`, `packages/brand-kit/index.ts`, `packages/schemas/coach.ts`, `packages/schemas/org.ts`, `apps/web/src/lib/color-utils.ts`, `apps/web/src/lib/brand-fonts.ts` (nuevo), `apps/web/src/proxy.ts` (branch `/c` L709-763; `AUTH_COOKIE_DOMAIN` L183-186), `apps/web/src/app/c/[coach_slug]/layout.tsx` (L128-237), `apps/web/src/app/c/[coach_slug]/login/page.tsx` + `login/_data/login.queries.ts`, `apps/web/src/app/coach/layout.tsx` (L102-156), `apps/web/src/app/coach/settings/_actions/settings.actions.ts`, `apps/web/src/app/coach/settings/BrandSettingsForm.tsx`, `apps/web/src/app/org/[slug]/brand/_components/BrandStudio.tsx` (reuso), `apps/web/src/app/api/manifest/[coach_slug]/route.ts`, `apps/web/src/app/layout.tsx` (fonts) + `apps/web/src/app/globals.css` (L14-15, L300/L306 `!important`), `apps/web/src/components/loaders/EvaTreefrogLoader.tsx`, `apps/web/src/components/ui/EvaRouteLoader.tsx`, `apps/web/src/app/enterprise/_components/atoms/LottiePlayer.tsx`.
