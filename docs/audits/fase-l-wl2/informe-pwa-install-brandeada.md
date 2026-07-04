# Informe: momento de instalación de la PWA del alumno, brandeado con la marca del coach

Rama: `feat/redesign-eva-design-system` · App: `apps/web` (Next.js App Router + Supabase + Tailwind v4) · Fecha: 2026-07-04

Objetivo del tema: que el alumno instale la PWA (A2HS) con la **marca de su coach** (nombre, logo, color, splash), no con la marca EVA genérica. Cubre: prompt custom de `beforeinstallprompt` (Chrome/Android), hoja de instrucciones iOS (Safari sin evento), y el campo `screenshots`/metadata del manifest.

---

## Estado actual

### 1. Manifest dinámico per-coach — YA existe y YA está brandeado (server-side)

- **`apps/web/src/app/api/manifest/[coach_slug]/route.ts`** (GET). Resuelve la marca del coach y, si el alumno es de pool, del **team**; si es enterprise, de la **org** (`resolveManifestBrand`, líneas 110-175). Devuelve `name`, `short_name`, `description`, `start_url`, `scope`, `display: "standalone"`, `background_color`, `theme_color`, `icons`.
  - `start_url`/`scope` se anclan a `/t/[team_slug]` para pool o `/c/[slug]` para standalone/org (líneas 40-43).
  - `background_color` del splash nativo: para coach/org se **deriva** del color de marca vía OKLCH (`deriveSplashBackground` → `resolveBrandTheme(...).light.bg`, líneas 84-87); para pool espeja `splash_bg_color` del team (líneas 49-51).
  - `icons` (`buildIcons`, líneas 94-108): logo del coach/team en 192+512 (`any` y `maskable`) o fallback EVA `icon-512.png` + maskable con safe-zone.
  - **Falta**: `screenshots`, `id`, `orientation`, `categories`. Sin `screenshots` NO se dispara la Richer Install UI de Android (ver Investigación).
  - Cache: `s-maxage=86400, stale-while-revalidate=3600` (línea 69).
  - Usa `getClaims()` (verificación local del JWT, sin `/user`) para identity best-effort (líneas 114-116).
- **`apps/web/src/app/api/manifest/default/route.ts`** — manifest EVA genérico (`start_url: "/"`, `orientation: "portrait"`, `background_color: "#000000"`). También sin `screenshots`. Es el que referencia el root layout.
- **Enlace del manifest**: en `apps/web/src/app/c/[coach_slug]/layout.tsx:266` se inyecta RAW:
  ```
  <link rel="manifest" href={`/api/manifest/${coach_slug}`} crossOrigin="use-credentials" />
  ```
  El `crossOrigin="use-credentials"` es **crítico**: sin cookies el fetch del manifest es anónimo → `getClaims()` null → colapsa a marca de coach y el `start_url`/`scope` de team caen a `/c` (comentario líneas 80-84, 263-265). El root layout en cambio declara `metadata.manifest = '/api/manifest/default'` (`apps/web/src/app/layout.tsx:125`).
- **Exclusión del proxy**: el matcher del middleware excluye `api/manifest/.*` (`apps/web/src/proxy.ts:1070`). Por eso el manifest **NO recibe** los headers `x-coach-*`; resuelve su propia marca por Supabase. Cualquier trabajo sobre el manifest debe seguir ese patrón (no depender de headers del proxy).

### 2. Apple touch icon + splash iOS — YA brandeado

- `appleTouchIconFor()` (`c/[coach_slug]/layout.tsx:54-59`): logo raster del coach o EVA. iOS ignora SVG/WebP/AVIF/`data:` (por eso el favicon SVG generado no sirve como ícono de instalación). `<link rel="apple-touch-icon">` en línea 262.
- Apple splash screens: array `APPLE_SPLASH` (11 tamaños de dispositivo, líneas 33-45) → `<link rel="apple-touch-startup-image">` (líneas 267-274) apuntando a `/api/splash/[coach_slug]?w=&h=`.
- **`apps/web/src/app/api/splash/[coach_slug]/route.tsx`** — genera el PNG del splash con `next/og` (`ImageResponse`), brandeado (gradiente del `primary_color` + logo o inicial; team override para pool). `runtime = 'nodejs'`, cache 86400. Importante: `next/og` genera PNG server-side, **no** usa Image Transformations de Supabase (relevante por la cuota — ver Riesgos).
- `appleWebApp` metadata (`c/[coach_slug]/layout.tsx:85-89`): `capable: true`, `statusBarStyle: 'black-translucent'`, `title: brandName`.

### 3. Headers `x-coach-*` del proxy (la fuente de marca en runtime para /c)

- `apps/web/src/proxy.ts`, helper `applyBrandHeaders()` (líneas 759-801) para `/c/`: setea `x-coach-id`, `x-coach-slug`, `x-coach-brand-name`, `x-coach-primary-color`, `x-coach-logo-url`, `x-coach-secondary-color`, `x-coach-accent-light/-dark`, `x-coach-neutral-tint`, `x-coach-logo-url-dark`, `x-coach-font-key`, `x-coach-loader-*`, `x-coach-theme-preset-key`, `x-coach-loader-config`. Gateado por tier: Pro+ pinta marca, free/starter → EVA system (líneas 764-800).
- Espejo para `/e/` (org, líneas 499-517) y `/t/` (team, líneas 599-625).
- El `/c` layout lee estos headers (líneas 144-187) y produce `brandName`, `logoUrl`, `primaryColor`, más los tokens `--sport-*`, `--theme-primary`, etc. **Ya tiene todo lo necesario para brandear el prompt.**

### 4. Prompt de instalación — EL GAP PRINCIPAL

- **`apps/web/src/components/InstallPrompt.tsx`** — componente A2HS. **Acepta props de marca** (`brandName`, `logoUrl`, `coachInitial`, `primaryColor`, líneas 35-45) pero:
  - Se renderiza UNA sola vez, **globalmente**, en `apps/web/src/app/layout.tsx:150` como `<InstallPrompt brandName="EVA" />` — **hardcodeado a EVA, sin logo ni color del coach**.
  - El `/c` layout **NO** renderiza un InstallPrompt brandeado. Comentario explícito (líneas 342-343): *"InstallPrompt is rendered once globally in the root app/layout.tsx — rendering a second one here stacked two banners"*.
  - **Consecuencia**: el alumno de CUALQUIER coach ve "**Instalar EVA**" en verde EVA (`#10B981`), nunca la marca de su coach. El manifest/splash/icono ya están brandeados, pero el **prompt visible** no.
  - Lógica interna: `isEligibleMobileClient()` (max-width 768 + `pointer: coarse` o UA móvil, líneas 19-25). En Android captura `beforeinstallprompt`, hace `preventDefault`, guarda `deferredPrompt` y muestra banner. En iOS muestra hoja de instrucciones **tras 3s** (`setTimeout`, líneas 77-82). Dismiss persistente en `localStorage['eva-pwa-install-dismissed']` (líneas 8, 90-97).
  - **NO hay engagement-gating**: aparece apenas dispara el evento / a los 3s en iOS.
  - **NO escucha `appinstalled`** (no oculta ni registra tras instalar).
  - Interfaz `BeforeInstallPromptEvent` bien tipada (líneas 10-17).
- **`apps/web/src/components/client/PwaNavButton.tsx`** — botón "Instalar App" en `ClientNav` (renderizado en `components/client/ClientNav.tsx:329` y `:442`). Este SÍ hereda color: usa `var(--theme-primary)` (líneas 83-84, 106, 117), que el `/c` layout inyecta con la marca. iOS abre un `Dialog` con instrucciones (líneas 96-131). **Duplica** la lógica de `beforeinstallprompt` (segundo listener, líneas 37-48) y usa `deferredPrompt: any` (tipado flojo, línea 15).
- **Doble render en /c**: en móvil no-standalone se muestran a la vez el InstallPrompt global (marca EVA) y el `AppDownloadBanner` (ver abajo). Dos avisos apilados que dicen cosas distintas.

### 5. Promo de app store nativa — a reconciliar (NO confundir con el prompt PWA)

- **`apps/web/src/components/AppDownloadBanner.tsx`** — banner "Mejor en la app" con enlaces a **App Store / Google Play que son placeholders inexistentes** (líneas 41-43: *"Placeholder store URLs — replace with real URLs in Fase 6B before submission"*). Se renderiza en `c/[coach_slug]/layout.tsx:344` (`<AppDownloadBanner brandName={brandName} primaryColor={primaryColor} />`). O sea: **sigue vivo en esta rama** y apunta a listados de tienda que no existen.
- **`apps/web/src/components/AppOnlyPopup.tsx`** — "Mejor en la app de EVA" (usado en pantallas del coach, no en /c).
- **Discrepancia con el brief**: el contexto de la tarea afirma que "AppOnlyPopup/Badge fueron ELIMINADOS (promos de app store fuera)". En `feat/redesign-eva-design-system` **NO** están eliminados (ambos componentes existen; `AppDownloadBanner` está renderizado en /c). Confirmar alcance con el CEO — si la intención es sacarlos, es parte de este trabajo.

### 6. Service worker + registro

- **`apps/web/public/sw.js`** — registrado por `apps/web/src/components/PwaRegister.tsx` (montado en el root layout, línea 148). Estrategias offline para `/c` y `/t`; push handler brandeado por payload. No participa del prompt de instalación (pero un SW registrado es **prerrequisito** de instalabilidad en Chrome).
- `PwaRegister.tsx` también mide `env(safe-area-inset-bottom)` en standalone (bug iOS) y expone `--pwa-sab`.

### 7. Analítica

- **No existe** ningún evento de instalación. `apps/web/src/lib/posthog/events.ts` tiene funnels de upgrade/addons/registro, pero **nada** de `beforeinstallprompt`/`appinstalled`. PostHog está disponible y gateado por consentimiento de cookies (no-op sin `ph`).

---

## Investigación web 2026 (fuentes)

**`beforeinstallprompt` (Chrome/Android) y su uso recomendado.** El evento es cancelable: se hace `preventDefault()`, se guarda y se dispara `prompt()` **más tarde, tras una acción del usuario**. La recomendación consistente es NO mostrarlo apenas carga, sino **gatearlo por engagement / momento contextual** (tras un journey crítico, tras N visitas, desde un menú), y mantener la promoción **fuera del flujo** para no dañar la usabilidad.
- [web.dev — Installation prompt](https://web.dev/learn/pwa/installation-prompt)
- [web.dev — Patterns for promoting PWA installation](https://web.dev/promote-install/index.html)
- [MDN — Trigger install prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)
- [web.dev — Install criteria](https://web.dev/articles/install-criteria)

**iOS Safari (sin evento).** iOS **no soporta `beforeinstallprompt`**: no hay prompt automático. Se detecta si ya está instalada con `window.navigator.standalone === true` o `window.matchMedia('(display-mode: standalone)').matches`, y se muestran **instrucciones manuales** (Compartir → "Añadir a inicio" → "Añadir"). **iOS 26 (2026)**: todo sitio agregado a Home abre como web app por defecto; aparece un toggle "Open as Web App" en el diálogo de Compartir (activado por defecto). Push en iOS requiere: iOS 16.4+, **PWA instalada primero**, y fuera de la UE.
- [MagicBell — PWA iOS Limitations and Safari Support (2026)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Apple — Configuring Web Applications (`navigator.standalone`)](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- [MacRumors — iOS 26 Add Web App to Home Screen](https://www.macrumors.com/how-to/save-safari-bookmark-web-app-iphone-home-screen/)

**Campo `screenshots` del manifest (Richer Install UI, Android).** Si el manifest tiene `description` + al menos un `screenshots` con `form_factor: "narrow"`, Chrome Android reemplaza el infobar "Add to home screen" por un **diálogo tipo app-store** (título, descripción, screenshots deslizables). Restricciones:
- Cada screenshot: **320–3840 px**; la dimensión máxima **≤ 2.3×** la mínima; **todas las del mismo `form_factor` con idéntico aspect ratio** (si no, Chrome ignora todo el richer UI); solo **JPEG/PNG**.
- Chrome muestra **hasta 8** screenshots.
- `form_factor`: `"narrow"` (móvil) / `"wide"` (desktop). `label` opcional por screenshot.
- `description` se trunca a ~324 caracteres (7 líneas).
- [web.dev — How to add Richer Install UI](https://web.dev/patterns/web-apps/richer-install-ui)
- [MDN — manifest `screenshots`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/screenshots)
- [web.dev — Web app manifest](https://web.dev/learn/pwa/web-app-manifest/)

---

## Diseño propuesto (por capas)

Principio rector: el manifest/splash/icono ya están brandeados server-side; **el trabajo real es (a) brandear el prompt visible, (b) gatearlo por engagement, (c) enriquecer el manifest con `screenshots`, (d) reconciliar el banner de store**. No requiere cambios de DB.

### A. Capa infraestructura — Manifest (extender lo existente)

1. Añadir a `api/manifest/[coach_slug]/route.ts` (y espejo en `default`):
   - `id` estable (ej. `/c/[slug]` o `/t/[team_slug]`) — evita que el navegador trate reinstalaciones como apps distintas.
   - `orientation: "portrait"` (el default ya lo tiene; el per-coach no).
   - `screenshots: [...]` con `form_factor: "narrow"`, `description` ya presente.
2. **Origen de las screenshots** (decisión CEO): dos caminos.
   - **Barato**: generar 1-3 imágenes `narrow` **dinámicas y brandeadas** con `next/og` (mismo patrón que `/api/splash`), mostrando marca + claim ("Rutinas, nutrición y progreso con {brand}"). Cero capturas manuales, cero cuota de Image Transformations. Aspect ratio uniforme controlado por código.
   - **Mejor conversión, más trabajo**: capturas reales del dashboard/ejecución del alumno (assets estáticos EVA neutros o con overlay de marca). Requiere pipeline de screenshots (Playwright + mint) por preset.

### B. Capa presentación — un prompt brandeado y único

Problema: `InstallPrompt` es global (root layout, sin acceso a `x-coach-*`) y `PwaNavButton` duplica el listener. Objetivo: **una sola fuente de verdad** para `deferredPrompt`, brandeada en /c.

Opción recomendada (mínimo blast radius):
1. Extraer un hook `useInstallPrompt()` (client) que capture `beforeinstallprompt` una vez, exponga `{ deferredPrompt, promptInstall, isIOS, isStandalone, isInstalled }` y escuche `appinstalled`. Lo consumen tanto el banner como `PwaNavButton` (elimina el doble listener y el `any`).
2. Brandear el banner leyendo la marca del **wrapper del /c layout**, que ya expone `data-*`: `data-coach-slug`, `data-brand-name` (`c/[coach_slug]/layout.tsx:324-325`). Añadir `data-primary-color` y `data-logo-url` a ese div y que el prompt los lea (`document.querySelector('[data-coach-slug]')`). Así el InstallPrompt **global** se auto-brandea cuando está bajo /c, sin duplicar instancias ni romper el árbol enterprise/team. Fuera de /c (landing, /coach) cae a EVA.
   - Alternativa: suprimir el global en /c/e/t y renderizar un `<InstallPrompt brandName logoUrl primaryColor />` dentro del /c layout (que ya tiene esas variables). Es más explícito pero reintroduce el riesgo de doble banner que el comentario actual advierte — habría que condicionar el global a `!pathname.startsWith('/c')`.
3. iOS: mantener la hoja de instrucciones (ya brandeable por props), condicionada a `!isStandalone`; refrescar el copy al flujo iOS 26 ("Open as Web App" activado por defecto) y usar el ícono real de Compartir.

### C. Engagement-gating (momento del journey)

- No mostrar en el primer render. Disparar en un **momento de valor**: p.ej. tras **completar el primer workout** o al inicio de la **segunda sesión** (contador en `localStorage`, sin DB).
- Guardar `deferredPrompt` apenas dispare `beforeinstallprompt` pero **retrasar la UI** hasta que se cumpla la señal.
- Respetar el dismiss persistente actual (`localStorage`) y añadir un back-off (no re-mostrar por X días en vez de "nunca más").

### D. Reconciliar `AppDownloadBanner`

- Como apunta a App Store/Google Play inexistentes, en /c genera ruido y compite con el prompt PWA. Recomendación: **quitarlo de /c** (o gatearlo a que exista app nativa real) para que el único CTA de instalación sea el prompt PWA brandeado. Decisión CEO.

### E. Analítica (opcional pero barata)

- Eventos PostHog nuevos: `pwa_install_prompt_shown`, `pwa_install_accepted`, `pwa_install_dismissed`, `pwa_installed` (desde `appinstalled`). Propiedades: `platform` (ios/android), `coach_slug`/`tier`. Gateado por consent (patrón existente en `events.ts`).

---

## Tareas atómicas estimadas (S/M/L)

1. **[S]** Pasar branding real al prompt: añadir `data-primary-color`/`data-logo-url` al wrapper del /c layout y hacer que `InstallPrompt` los lea (quitar el hardcode `brandName="EVA"` para el árbol /c). `apps/web/src/app/c/[coach_slug]/layout.tsx`, `apps/web/src/components/InstallPrompt.tsx`.
2. **[S]** Añadir listener `appinstalled` → ocultar + persistir + (si E) evento. `InstallPrompt.tsx`.
3. **[M]** Extraer `useInstallPrompt()` y refactorizar `InstallPrompt` + `PwaNavButton` para compartirlo (una sola captura de `beforeinstallprompt`, tipado fuerte). `apps/web/src/components/client/PwaNavButton.tsx`, `InstallPrompt.tsx`, nuevo `apps/web/src/lib/pwa/use-install-prompt.ts`.
4. **[M]** Engagement-gating: señal de "primer workout completado / segunda sesión" (localStorage) que habilita la UI; back-off del dismiss.
5. **[M]** Extender el manifest per-coach y default con `screenshots` + `id` + `orientation`. `apps/web/src/app/api/manifest/[coach_slug]/route.ts`, `.../manifest/default/route.ts`.
6. **[L]** Generar las screenshots `narrow` brandeadas (ruta `next/og` tipo `/api/splash`, o pipeline de capturas). Nueva ruta `apps/web/src/app/api/pwa-screenshot/[coach_slug]/route.tsx` si se va por next/og.
7. **[S]** Refrescar el copy iOS al flujo iOS 26 y detección `standalone` robusta. `InstallPrompt.tsx`, `PwaNavButton.tsx`.
8. **[S]** Reconciliar `AppDownloadBanner` en /c (quitar o gatear). `apps/web/src/app/c/[coach_slug]/layout.tsx`, `apps/web/src/components/AppDownloadBanner.tsx`.
9. **[S]** Eventos PostHog de install funnel. `apps/web/src/lib/posthog/events.ts` + consumidores.
10. **[S]** Verificación: build prod + smoke en Android (richer UI aparece con screenshots) e iOS (hoja brandeada, standalone oculta). Actualizar `docs/` si cambia flujo/deploy.

---

## Riesgos y gotchas

- **Manifest fuera del matcher del proxy** (`proxy.ts:1070`, `api/manifest/.*`): el manifest NO ve `x-coach-*`; resuelve su marca por Supabase. Mantener ese patrón para las screenshots (no depender de headers).
- **`crossOrigin="use-credentials"`** del `<link rel="manifest">` (layout.tsx:266) es load-bearing: si se pierde al tocar el manifest, el fetch va sin cookies → team/org colapsan a marca de coach y `start_url`/`scope` a `/c`. No romperlo.
- **Screenshots — aspect ratio uniforme obligatorio**: si dos `narrow` tienen distinta proporción, Chrome descarta **todo** el richer UI silenciosamente. Controlar dimensiones por código.
- **Cuota Image Transformations de Supabase** (incidente conocido, jul-2026): NO usar `render/image` per-view para las screenshots. `next/og` (como splash) genera PNG server-side y **no** cuenta contra esa cuota → es el camino seguro.
- **`<Image>` de Next obligatorio** (regla del repo, cero `<img>` raw). Excepción legítima: dentro de `ImageResponse` de `next/og` (splash ya usa `<img>` ahí con eslint-disable). El prompt en sí ya usa `next/image`.
- **Mobile viewport** (regla): elementos fijos con `pl-safe/pr-safe/pt-safe/pb-safe`; nunca `h-screen` fuera de `md:`. El InstallPrompt usa `fixed bottom-6` — verificar safe-area en notch/gestos.
- **iOS es frágil**: no hay evento; la hoja depende de UA sniffing. iOS 26 cambió el flujo (Open as Web App por defecto) → el copy actual ("Compartir → Añadir a inicio") sigue válido pero conviene mencionar el toggle.
- **Doble listener `beforeinstallprompt`** (InstallPrompt + PwaNavButton): el evento se dispara UNA vez; hoy ambos lo capturan por separado. Si uno hace `preventDefault`/consume el `deferredPrompt`, el otro puede quedar sin él. La tarea 3 (hook único) lo resuelve.
- **Standalone ≠ instalado en primer arranque**: `display-mode: standalone` sólo es fiable una vez abierta como app. Para "no volver a molestar" combinar con `appinstalled` + `localStorage`.
- **Sin cambios de DB**: nada de esto requiere columnas nuevas → no aplica el gotcha de `GRANT UPDATE(col)`. Si a futuro se persistiera el estado del prompt server-side, sí aplicaría.
- **Discrepancia de alcance**: el brief da por eliminados `AppOnlyPopup`/badge; en esta rama siguen vivos y `AppDownloadBanner` está renderizado en /c. Confirmar antes de asumir que "las promos de store ya no están".

---

## Preguntas para el CEO

1. **Screenshots del manifest**: ¿imagen brandeada generada con `next/og` (barata, cero capturas, marca del coach) — recomendada — o capturas reales del producto (mejor conversión, requiere pipeline de screenshots)?
2. **`AppDownloadBanner` en /c**: ¿lo quitamos (apunta a App Store/Google Play inexistentes y compite con el prompt PWA) o lo mantenemos hasta que exista app nativa real?
3. **Momento del prompt**: ¿lo gateamos a "tras el primer workout completado" / "segunda sesión" (recomendado), o lo mantenemos inmediato como hoy?
