# Plan de Implementacion — White-Label v2 (web/PWA)

> specs/whitelabel-v2/PLAN.md · Workflow multi-rol (8 lentes startup + research jun-2026) + síntesis de arquitecto · 2026-06-21

> Profundidad visual sobre la base de branding existente. Scope CERRADO por el CEO (no se re-litiga): color2/acento, fuente curada (~12 Google Fonts, sin upload), dark mode brandeado, login/onboarding brandeado pre-auth, variantes de loader. Aplica a la cara del alumno (`/c/[slug]`) Y al panel coach (via toggle `use_brand_colors_coach`). Gate de pago: **Pro en adelante**. "Powered by EVA" discreto SIEMPRE. Subdominio = track aparte.

---

## 1. Resumen + decision de enfoque

**Hallazgo central (8 roles convergen):** la base es mas madura que lo que sugiere el roadmap. El motor `@eva/brand-kit` (`packages/brand-kit/index.ts`) ya resuelve tema light+dark con acento por-modo, contrast-clamp WCAG AA (`clampAccent`, `pickOnColor`, `resolveBrandTheme`, `contrastReport`, `isThemeReadable`), y el layout del alumno (`apps/web/src/app/c/[coach_slug]/layout.tsx` L162-237) YA consume `accentLight/accentDark/neutralTint` y emite un bloque `.dark`. El grueso de v2 es **threading de campos nuevos por un pipe que ya existe** (proxy SELECT → headers `x-coach-*` → `<style>` inyectado) + **UX de configuracion**, no arquitectura nueva.

**Orden de fases por valor/esfuerzo:**

| Fase | Contenido | Por que en este orden |
|---|---|---|
| **W0** | Spec congelada + gate Pro+ server-side + lista de fuentes + schema/migracion definidos | Sin gate server-side primero, todo lo demas filtra el feature pago. Bloqueante. |
| **W1** | Migracion `coaches` (paridad con orgs/teams) + motor (color2 en `generateBrandPalette` + `resolveBrandTheme`) + regen types | Motor aditivo, puro TS, testeable sin UI. Habilita W2-W4. |
| **W2** | Aplicacion visual: color2 + fuente + dark brandeado, alumno + panel coach con toggle | 80% del valor percibido. Reusa el pipe + `@eva/brand-kit`. |
| **W3** | Variantes de loader (importar los del CEO) | Depende de los assets del CEO; menor valor (solo se ve en transiciones). |
| **W4** | Login/onboarding brandeados pre-auth | Alto "wow" de demo; cierra el gate-leak del login. |
| **W5** | Subdominio `slug.eva-app.cl` (cookies aisladas host-only) | **Track aparte**, infra-dependiente (DNS/Vercel/Supabase). Detras de flag. No mezclar con W1-W4. |

**Recomendacion de PM (riesgo #1 = roadmap-burner con revenue casi nulo):** construir **W0→W2 + W4** en el primer ciclo (reusan motor, ~5-7 dias, y dan el argumento de venta para las 14 llamadas). **W3 (loaders) y W5 (subdominio) detras de senal real:** ≥3 coaches Pro pidiendo "mas marca" O ≥1 upgrade atribuido a branding. Esto NO es re-litigar scope: el scope sigue completo, solo se faseo el gasto de ingenieria.

---

## 2. Fases

### W0 — Spec, gate Pro+, schema y curaduria (bloqueante, sin codigo visual)

**Objetivo:** cerrar el contrato de datos, el gate de pago y la lista de fuentes ANTES de tocar el motor o la UI.

**Tareas atomicas:**

1. **Nuevo capability `canUseBrandingV2` (deep branding) — NO redefinir `canUseBranding`.**
   - Archivo: `packages/tiers/index.ts`. Hoy `TIER_CAPABILITIES.starter.canUseBranding = true` (L154-160) y el motivo es que el branding basico (1 color + logo) YA se vendio a starter via `SHARED_TIER_FEATURES` ("Branding personalizado", L68). Redefinir `canUseBranding` romperia eso.
   - Agregar a `TierCapabilities` (L37-43) el campo `canUseBrandingV2: boolean`. Setear `false` para `free`/`starter`, `true` para `pro`/`elite`/`growth`/`scale`.
   - Exportar helper puro `isBrandingV2Allowed(tier: SubscriptionTier): boolean` (= `getTierCapabilities(tier).canUseBrandingV2`). Esta es la **fuente unica** que consumen las 5 superficies (proxy, layout alumno, layout coach, login, manifest/splash). No existe hoy ningun `isProOrAbove`/tier-rank helper para branding — este se crea aca.
   - **DoD:** test unitario nuevo (`packages/tiers/*.test.ts`) que asegure la matriz: `free=false, starter=false, pro=true, elite=true, growth=true, scale=true`, y fail-closed (`'' / null / unknown → false`).

2. **Gate Pro+ en el WRITE path (hoy AUSENTE — bloqueante de monetizacion).**
   - Archivo: `apps/web/src/app/coach/settings/_actions/settings.actions.ts`. Hoy `updateBrandSettingsAction` (L16-88) valida el schema y hace UPDATE **sin chequear tier**. El unico gate vive en la page (redirect) + en el render del alumno (`isFreeTier`). Un coach starter/free puede POSTear el action directo y persistir campos v2.
   - Plan: en la action, fetch `coach.subscription_tier`; si `!isBrandingV2Allowed(tier)`, **strip** (no persistir) los campos v2 (`brand_secondary_color`, `brand_font_key`, `accent_light`, `accent_dark`, `neutral_tint`, `logo_url_dark`, `loader_variant != 'eva'`). Los campos v1 (`primary_color`, `logo_url`, `loader_*`, `welcome_*`) se mantienen como hoy para no romper starter.
   - **DoD:** un starter que envia payload con `brand_font_key` NO lo persiste; un pro SI.

3. **Decidir el modelo de columnas (paridad con orgs/teams).** Verificado: `coaches` solo tiene `primary_color` + `logo_*` + `loader_*` + `welcome_*`. `organizations`/`teams` ya tienen `accent_light/accent_dark/neutral_tint/logo_url_dark` (`packages/schemas/org.ts` ya valida `HexColor` para accent/neutral). `brand_secondary_color` y `loader_variant` son conceptos NUEVOS (no existen en orgs/teams tampoco).

4. **Congelar la lista de ~12 fuentes** (ver seccion 3) y el formato/cantidad de loaders del CEO (decision abierta — seccion 5).

5. **Definir el registry de fuentes como fuente unica:** crear `apps/web/src/lib/brand-fonts.ts` (web-only) con `CURATED_FONTS: Record<FontKey, { family, cssVar, fallback, category }>` y un `z.enum` de las 12 keys. (La carga real con `next/font` va en W2; aca solo se congela el contrato y el enum para que schema/proxy puedan confiar en el.)

**DoD de W0:** capability + helper testeado; write-path gateado; lista de columnas y de fuentes firmada; enum de fuentes definido. Sin cambios visuales.

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
   - **NO** se cambia RLS: `coaches_update_own` ya cubre self-update. El gate de los campos pagados vive en el server action (RLS no ve el tier barato).
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
   - En el branch `/c` (L730-741), tras computar el tier, setear headers nuevos SOLO si `isBrandingV2Allowed(tier)`: `x-coach-secondary-color`, `x-coach-accent-light`, `x-coach-accent-dark`, `x-coach-neutral-tint`, `x-coach-logo-url-dark`, `x-coach-font-key`, `x-coach-loader-variant`. Si no es Pro+, **no setearlos** (caen a EVA en el layout). Espejar en `buildClientRouteResponse` (L743-763).
   - **Factor compartido:** extraer `buildCoachBrandHeaders(coach, tier)` para que el branch `/c` y el futuro branch subdominio (W5) no driften.

3. **Layout del alumno (`apps/web/src/app/c/[coach_slug]/layout.tsx`).**
   - Leer los headers nuevos (espejo de L164-166). El gate ya esta cableado: cambiar el predicado de `isFreeTier` a `!isBrandingV2Allowed(tier)` **solo para los campos v2** (color2/font/accent-dark/neutral-tint). Los campos v1 (`primary_color`, `logo_url`) mantienen su gate actual `isFreeTier` para no degradar starter.
   - Pasar `secondaryHex` a `generateBrandPalette` (L170) y agregar al `<style>` (L214-237): `--theme-secondary`, `--theme-secondary-rgb`, `--theme-secondary-foreground` en `:root` + su override en `.dark`. Re-validar hex en 2da capa igual que `safeLoaderTextColor` (L157-159) ANTES de interpolar.
   - Fuente: emitir `--brand-font: var(--font-brand-<key>, var(--font-inter))` resuelta desde el registry server-side (NUNCA el string crudo del coach).

4. **Fuente: cargar las 12 con `next/font` (build-time, self-hosted).**
   - En `apps/web/src/app/layout.tsx` (hoy solo `Inter`+`Montserrat`, L22-32): instanciar las 12 con `next/font/google`, cada una `{ variable: '--font-brand-<key>', subsets:['latin'], display:'swap', preload:false, weight:['400','500','600','700'], adjustFontFallback:true }`. `preload:false` en las 11 no-default es **critico** (12 `<link rel=preload>` en `<head>` degradaria LCP). El browser solo descarga la woff2 cuya `font-family` se usa.
   - **Refactor del `!important` (bloqueante "looks done but isn't"):** `globals.css` L300 (`body`) y L306 (`h1..h6`) hardcodean `font-family ... !important`, que **silenciara** `--brand-font`. Rerutear via los tokens `@theme` (L14-15): `--font-sans: var(--brand-font-body, var(--font-inter), ...)` y `--font-display: var(--brand-font, var(--font-montserrat), ...)`, y **quitar** los `!important` (o scopearlos a un wrapper del subtree branded para que las paginas de marketing EVA queden byte-identicas). **MVP recomendado: fuente custom solo en headings/display + wordmark**; body queda Inter (legibilidad + colapsa CLS casi a cero).

5. **Panel coach (`apps/web/src/app/coach/layout.tsx`) — el gap real del dark brandeado.**
   - Hoy llama `generateBrandPalette(primaryColor)` (L110) y emite SOLO `:root` (L140-156), **sin** `.dark`, **sin** `resolveBrandTheme`. El alumno ya lo hace bien.
   - Plan: portar el patron del alumno — usar `resolveBrandTheme({ brandColor, accentLight, accentDark, neutralTint, secondaryLight, secondaryDark })` + emitir el bloque `.dark` + `--brand-font` + vars secondary. Gatear con `use_brand_colors_coach !== false` (toggle existente, L112) **Y** `isBrandingV2Allowed(coach.subscription_tier)` para los campos v2.
   - **DoD del toggle:** con `use_brand_colors_coach = false` el panel coach renderiza EVA; con `true` renderiza la marca (incl. fuente+dark+color2). Los alumnos SIEMPRE ven la marca (el toggle solo afecta el panel del coach).

6. **UI del coach (`apps/web/src/app/coach/settings/BrandSettingsForm.tsx`).**
   - Reusar el loop de live-preview existente (el `useEffect` que escribe `--theme-primary` al DOM en cada cambio) para color2/fuente/dark — nunca guardar a ciegas.
   - Agregar: color-picker secundario, dropdown de fuente (cada opcion renderizada en su tipografia + par Titulo/cuerpo), accent dark + toggle de preview light/dark, neutral_tint. **Reusar la red de seguridad:** badge WCAG existente + `contrastReport` por-modo (patron de `org/[slug]/brand/_components/BrandStudio.tsx`), y **bloquear Guardar si cualquier modo falla AA** (publish-gate `isThemeReadable`).
   - **Reuso fuerte recomendado:** extraer un `<BrandStudio>` compartido de `org/[slug]/brand/_components/BrandStudio.tsx` (que YA tiene preview light/dark, accent por-modo, dual logo, guard de contraste) y parametrizarlo por who-can-edit + set de columnas. Mata el drift entre las superficies de inyeccion.

**DoD de W2:** un coach Pro guarda color2/fuente/dark y los ve live en preview, en la app del alumno (light Y dark) y en su panel (con toggle). Un starter NO puede guardarlos (write-path) ni verlos (render cae a EVA). vitest + tsc + mobile tsc verdes.

---

### W3 — Variantes de loader (importar los del CEO)

**Objetivo:** registry cerrado de loaders seleccionables, con los disenos del CEO importados como codigo del repo (no upload).

**Tareas atomicas:**

1. **Registry tipado:** `apps/web/src/components/loaders/registry.tsx` mapeando `loader_variant` (enum) → componente. Default `'eva'`/`'treefrog'` = los actuales (`EvaRouteLoader.tsx`, `EvaTreefrogLoader.tsx`), 0 JS extra. Los disenos del CEO se incrustan como NUEVAS entradas vetadas en PR.
2. **Threading:** header `x-coach-loader-variant` (ya seteado en W2) + CSS var `--coach-loader-variant` en el `<style>` (mismo patron que `--coach-loader-icon-mode` L228). El lector client `useLoaderBrandConfig` (en `EvaRouteLoader.tsx`) lee la var en runtime.
3. **Brand-aware:** cada variante DEBE consumir `--theme-primary`/`--theme-secondary` (o aceptar `{primary,secondary}` prop). Modelo a copiar: `EvaTreefrogLoader.module.css` (SVG + CSS module, 0 deps, brand-tintable).
4. **Lottie (si aplica) — gateado:** preferir variantes CSS/SVG (0 dep) para el default. Si una variante es Lottie, lazy-load del player (`next/dynamic({ ssr:false })`) SOLO dentro de esa variante, reusando el patron de `apps/web/src/app/enterprise/_components/atoms/LottiePlayer.tsx` (ya respeta `prefers-reduced-motion`). Presupuesto: cada JSON < 30KB; nunca meter el runtime Lottie en el critical path del loader default. Render `EvaTreefrogLoader` como placeholder sincrono hasta que hidrate.
5. **Sanitizacion al importar:** SVG inline → strip `<script>`/`on*=`/`<foreignObject>`/`href=javascript:` (DOMPurify perfil SVG en build). Lottie → validar JSON, rechazar expresiones y URLs remotas en `assets[].u/p`. El coach solo elige por enum; nunca markup.

**DoD de W3:** coach Pro elige una variante en el selector (galeria con thumbnails), se aplica en alumno + panel, `prefers-reduced-motion` cae a estatico, variante invalida → fallback EVA. Bundle del first-load del alumno sin regresion (Lottie lazy).

---

### W4 — Login/onboarding brandeados pre-auth

**Objetivo:** que el alumno vea la marca (color2 + fuente + dark) ANTES de loguearse, coherente con la app, y cerrar el gate-leak del login.

**Tareas atomicas:**

1. **Extender la query pre-auth (`apps/web/src/app/c/[coach_slug]/login/_data/login.queries.ts`).** `getClientLoginCoach` (L19-28) hoy selecciona `brand_name, primary_color, logo_url, welcome_message` y **NO mira tier** → un coach free/starter ya filtra su marca en login (gate-leak). Agregar al SELECT: `brand_secondary_color, accent_dark, logo_url_dark, brand_font_key, subscription_tier`.
2. **Aplicar el gate Pro+ en el login (`login/page.tsx` + `ClientLoginForm.tsx`).** Si `!isBrandingV2Allowed(tier)` → caer a EVA para los campos v2 (espejo del gate del layout autenticado). Para v1 (primary/logo), mantener el comportamiento actual (decidir con CEO si starter conserva su color en login — seccion 5).
3. **Migrar el login a `resolveBrandTheme` + var de fuente.** Hoy pinta `primary_color` crudo, sin acento por-modo, sin fuente, sin dark. Inyectar un `<style>` scopeado (mismo helper `buildBrandStyleTag` de W2) con `--brand-font` + acento + `.dark`. **Recomendacion perf:** fuente custom solo en el wordmark/titulo del login (texto corto, swap imperceptible), body/inputs en Inter (es la primera pantalla, sin cache caliente).
4. **Onboarding/welcome modal** (`welcome_modal_*` ya existen) hereda las mismas vars una vez el login las inyecta.

**DoD de W4:** alumno nuevo de un coach Pro ve marca completa (color2/fuente/dark) en login y onboarding, identica a la app; coach free/starter ve EVA (o solo v1, segun decision CEO) en login. Incluir el login como tab en el preview del coach para que confirme coherencia.

---

### W5 — Subdominio `slug.eva-app.cl` (track aparte, cookies aisladas)

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

Si el peso de build de las 12 molesta, recortar a 6-8 (excluir las que no aporten contraste de personalidad). MVP: aplicar a headings/display; body en Inter.

---

## 4. Riesgos consolidados + mitigacion

| # | Riesgo | Sev | Mitigacion |
|---|---|---|---|
| R1 | **Roadmap-burner:** 5 features de pixeles con revenue ~nulo | alta | Time-box: W0→W2+W4 ahora; W3/W5 detras de senal (≥3 pedidos Pro o 1 upgrade atribuido). Usar v2 como argumento en las 14 llamadas. |
| R2 | **Gate-leak / bypass de monetizacion:** write-path sin tier check; login/manifest sin tier check; starter ya tiene branding | alta | `isBrandingV2Allowed` como predicado unico en proxy + layout alumno + layout coach + login query + manifest/splash + write action. Test de matriz. |
| R3 | **Cookie compartida `Domain=.eva-app.cl`:** XSS o subdomain-takeover en 1 tenant compromete la auth de TODA la plataforma | alta | **Host-only por tenant** (`AUTH_COOKIE_DOMAIN` SIN setear, login por subdominio, sin SSO cruzado). Wildcard DNS solo al proyecto EVA, sin CNAMEs colgantes. Assert de deploy. Consenso seguridad 2026 (Okta/WorkOS). |
| R4 | **`!important` de fuente** (`globals.css` L300/L306) silencia `--brand-font` → "looks done but isn't" | alta | Rerutear `--font-sans`/`--font-display` por `var(--brand-font, default)` y quitar/scopear los `!important`. Test que asserta `font-family` computada en un heading `/c`. |
| R5 | **Fuente dinamica rompe build** (`next/font` es build-time) o `@import` runtime degrada LCP/CLS + fuga IP (Ley 21.719) | media | Pre-cargar las 12 con `next/font` self-hosted, `preload:false`, `adjustFontFallback:true`; conmutar por `--brand-font`. PROHIBIR `@import`/`<link>` a googleapis. |
| R6 | **Contraste/legibilidad:** coach elige color2/dark ilegible; valida solo light y publica un dark que falla AA | media | `clampAccent` ya rescata; **bloquear Guardar** si `contrastReport` falla en CUALQUIER modo (publish-gate `isThemeReadable`). Preview light/dark obligatorio. Mostrar swatch clampeado con nota "ajustamos tu color para legibilidad". |
| R7 | **color2 invisible** (sin consumidores definidos) o choca con primary | media | Allow-list cerrada ANTES de wirear: botones secundarios/outline, badges/tags + macros nutricionales, 2da serie de charts, underline de tab activo. Excluir: CTA primario, nav activo, links, focus ring (quedan primary). Warning suave si color2 ≈ primary (deltaE/hue OKLCH). |
| R8 | **brand-kit compartido web+mobile** se rompe al agregar color2 | media | Solo aditivo: `secondaryLight/Dark` opcionales en `BrandThemeInput`, `accent2/accent2Text` con default = accent. Nunca cambiar firmas/defaults. `mobile tsc` en el gate. Fuente NO entra a brand-kit. |
| R9 | **Loaders del CEO** inflan bundle / XSS via SVG-Lottie | media | Registry cerrado en repo (no upload); Lottie lazy `next/dynamic({ssr:false})` solo en su variante, < 30KB; SVG sanitizado (DOMPurify) en build; default sigue siendo SVG 0-dep. |
| R10 | **Drift entre los 3 sitios de inyeccion** (`<style>` alumno, coach, login) | media | Un solo helper server-side `buildBrandStyleTag({palette, theme, fontKey, secondary, loaderCfg})` consumido por las 3 superficies. El client SOLO lee vars, nunca input directo. |
| R11 | **Powered-by-EVA removible** por CSS del coach o confundido con el footer free | baja | Render fuera del scope de vars manipulables (markup fijo, como L272-281). Pro+ = micro-badge discreto SIN UTM agresivo; free = footer-CTA con `utm_source=free_footer`. Incognito total descartado (decision cerrada). |

---

## 5. Decisiones abiertas que requieren al CEO

1. **Color secundario = acento por-modo o color independiente?** ¿`brand_secondary_color` es el `accent_light/accent_dark` del tema (botones/links por modo) o un color SEPARADO para badges/charts/etiquetas nutricionales? Cambia el scope de columnas y del motor. *(El plan asume independiente + aditivo con default derivado, lo mas seguro.)*
2. **Gate de v1 en starter:** ¿starter conserva el branding BASICO (1 color + logo, ya vendido) y solo se gatea la "profundidad" (color2/fuente/dark/loader) a Pro+? *(El plan asume que SI — evita downgrade de un feature vivo. Necesita OK explicito porque toca `@eva/tiers` y el copy de planes.)*
3. **Login pre-auth y starter:** ¿el login de un coach starter/free cae a EVA total, o mantiene logo+nombre+color1 y solo dropea los campos v2 como teaser de conversion? *(Define el assert exacto de W4.)*
4. **Fuente: headings-only o body+headings?** ¿Tambien aplica al PANEL del coach? *(El plan recomienda headings-only para colapsar CLS; afecta cuantos lugares cargan la fuente.)*
5. **Dark mode del alumno: ¿el coach FUERZA un modo o solo customiza el acento dentro del modo que elige el alumno?** Forzar requiere `forcedTheme` + un `dark_mode_pref` y pelea con el toggle del alumno. *(El plan asume accent-only, mas simple, reusa el `.dark` existente.)*
6. **Loaders del CEO: formato exacto** (React/SVG vs Lottie JSON) y **cuantas variantes en el MVP**. Define el registry (component-switch vs Lottie lazy) y el pipeline de sanitizacion. *(Bloquea W3.)*
7. **`logo_url_dark`:** ¿se agrega ahora (riesgo real de logo dark-on-dark invisible)? *(El plan lo incluye en la migracion por paridad con orgs/teams; barato.)*
8. **Subdominio: junto a v2 o despues?** *(El plan lo trata como track aparte W5; recomendado despues de senal.)*

---

## 6. Gate Pro+ server-side + "Powered by EVA" + toggle

- **Gate Pro+ (server-side, fuente unica):** `isBrandingV2Allowed(tier)` (W0) consumido en las 5 superficies: (a) `updateBrandSettingsAction` (strip de campos v2 si no Pro+), (b) `proxy.ts` branch `/c` y subdominio (no setear headers v2 si no Pro+), (c) `c/[coach_slug]/layout.tsx` (render EVA para v2 si no Pro+), (d) `coach/layout.tsx` (idem panel), (e) `login.queries.ts`/`login/page.tsx` + `api/manifest/[coach_slug]/route.ts` + `api/splash`. **El proxy es el choke-point ideal:** neutralizar los headers v2 ahi colapsa "gatear en cada superficie" a un punto testeado. Defense-in-depth: el render igual cae a EVA si una fila stale trae valores Pro tras un downgrade.
- **Downgrade Pro→starter:** las vars v2 NO se aplican (gate lee tier LIVE), SIN borrar lo guardado en DB. Mismo patron que `isFreeTier` hoy. **Manifest cacheado 24h** (`s-maxage=86400`) → documentar el lag o decidir cache-bust en cambio de tier.
- **"Powered by EVA" discreto SIEMPRE (no incognito):** mantener las instancias actuales (footer alumno L272-281, "Impulsado por EVA" en login). Para Pro+ NO se oculta: micro-badge discreto que **respeta dark/acento del coach** (que se vea integrado, no parche EVA), SIN el UTM agresivo del footer free. Render como markup fijo fuera del scope de vars del coach. Guard de regresion (snapshot) que asegure su presencia en free/starter/pro en alumno + login + panel.
- **Toggle `use_brand_colors_coach`** (panel coach): ya gobierna color+loader del panel; v2 lo extiende a fuente+acento+dark. Reformular el copy confuso ("Usar todos mis estilos personalizados en mi dashboard actual", `BrandSettingsForm.tsx`) a un segmented control **"Ver mi marca | Ver EVA"** + nota "Esto solo cambia TU panel; tus alumnos siempre ven tu marca". Los alumnos SIEMPRE ven la marca del coach (el toggle no los afecta).

---

## 7. Metricas a instrumentar (desde el dia 1)

1. **Adopcion v2:** % de coaches Pro+ que configuran ≥1 atributo v2 (color2/fuente/dark/loader) en 30 dias.
2. **Atribucion de upgrade:** evento analytics "vio/toco el gate de deep-branding" + upgrades starter→pro en los 7 dias siguientes (sin el evento, la atribucion de revenue es debil — instrumentar evento real, no solo el proxy de brand-score).
3. **Brand-completion score:** extender el `brandScore` existente en `BrandSettingsForm.tsx` con los campos v2; trackear distribucion (motor de descubrimiento Pro: un coach recien upgradeado ve su score incompleto).
4. **Retencion:** retencion de alumnos en coaches con marca completa vs sin (la research liga app-branded ↔ retencion — argumento de venta, no solo estetica).
5. **Performance (ya instrumentado con SpeedInsights + `@vercel/analytics` en el root layout):** baseline LCP/CLS/INP de `/c/[slug]/dashboard` y `/c/[slug]/login` ANTES del feature; gate de merge: **CLS no sube > 0.01, LCP mobile no sube > 100ms** tras cada sub-feature (color2 → fuente → dark → loader → subdominio).
6. **Gate parity (test, no negocio):** assert E2E de que starter NO obtiene branding v2 en las 5 superficies, y que el "powered by EVA" esta SIEMPRE presente.

---

**Archivos clave (reales, verificados):** `packages/tiers/index.ts`, `packages/brand-kit/index.ts`, `packages/schemas/coach.ts`, `packages/schemas/org.ts`, `apps/web/src/lib/color-utils.ts`, `apps/web/src/lib/brand-fonts.ts` (nuevo), `apps/web/src/proxy.ts` (branch `/c` L709-763; `AUTH_COOKIE_DOMAIN` L183-186), `apps/web/src/app/c/[coach_slug]/layout.tsx` (L128-237), `apps/web/src/app/c/[coach_slug]/login/page.tsx` + `login/_data/login.queries.ts`, `apps/web/src/app/coach/layout.tsx` (L102-156), `apps/web/src/app/coach/settings/_actions/settings.actions.ts`, `apps/web/src/app/coach/settings/BrandSettingsForm.tsx`, `apps/web/src/app/org/[slug]/brand/_components/BrandStudio.tsx` (reuso), `apps/web/src/app/api/manifest/[coach_slug]/route.ts`, `apps/web/src/app/layout.tsx` (fonts) + `apps/web/src/app/globals.css` (L14-15, L300/L306 `!important`), `apps/web/src/components/loaders/EvaTreefrogLoader.tsx`, `apps/web/src/components/ui/EvaRouteLoader.tsx`, `apps/web/src/app/enterprise/_components/atoms/LottiePlayer.tsx`.