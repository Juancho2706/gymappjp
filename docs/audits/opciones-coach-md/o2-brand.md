# 2. Mi Marca: editor de branding y vista previa

> Alcance: el editor white-label del coach (ruta `/coach/settings/brand`) y la vista previa fiel de la app del alumno (`/coach/settings/preview`). Esta seccion enfatiza el backend: que datos llegan al server action, que columnas de `coaches` se escriben y como, el gate de tier (`canUseBranding`), los GRANT de columna que la persistencia exige, y la sanitizacion anti-inyeccion de los valores de marca. El frontend se describe solo a nivel funcional (que campo edita que dato, que dispara cada control). No se documentan estilos/CSS/layout.

---

## 2.1 Gate de acceso y carga de la pagina (`brand/page.tsx`)

`CoachBrandPage` es un RSC (`apps/web/src/app/coach/settings/brand/page.tsx`). Hidrata con `getCoachSettingsForUser()` de `_data/settings.queries.ts` y aplica una **cascada de redirecciones** antes de renderizar el editor:

1. `if (!user) redirect('/login')` — sin sesion.
2. `if (!coach) redirect('/login')` — no existe fila `coaches`.
3. `if (coach.subscription_status === 'org_managed') redirect('/coach/dashboard')` — la marca la gestiona la organizacion; el coach no tiene marca propia aca.
4. `if (coach.subscription_status === 'team_managed') redirect('/coach/settings')` — la marca la gestiona el team; vuelve al hub.
5. `const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier` (nota: fallback `'starter'` en la page, distinto del fallback `'free'` del server action — ver 2.7).
6. `const capabilities = getTierCapabilities(tier)` y `if (!capabilities.canUseBranding) redirect('/coach/settings')` — **gate de tier en lectura**. Free/Starter no llegan al editor; el upsell vive en el hub `/coach/settings`.

Esto significa que el editor solo se renderiza para Pro/Elite (y los legacy Growth/Scale grandfathered), porque `canUseBranding === true` solo en esos tiers (ver 2.6).

### Datos que llegan a la page

`getCoachSettingsForUser()` (`_data/settings.queries.ts`):
- Resuelve el usuario via `supabase.auth.getClaims()` (verificacion local del JWT ES256, sin round-trip a `/user`; el proxy ya valido la sesion). `user = { id: claims.sub }`.
- `SELECT` explicito de columnas de `coaches` (nunca `SELECT *`), incluyendo: `id, full_name, brand_name, slug, invite_code, slug_changed_at, primary_color, logo_url, welcome_message, welcome_modal_content, welcome_modal_enabled, welcome_modal_type, welcome_modal_updated_at, welcome_modal_version, loader_text, loader_text_color, loader_icon_mode, loader_show_icon, use_custom_loader, onboarding_guide, subscription_tier, subscription_status, ..., use_brand_colors_coach, updated_at, created_at`.
- **Gotcha de cobertura:** este SELECT NO trae las 7 columnas white-label v2 (`brand_secondary_color`, `accent_light`, `accent_dark`, `neutral_tint`, `logo_url_dark`, `brand_font_key`, `loader_variant`). Sin embargo `BrandSettingsForm` las consume via `coach.brand_secondary_color ?? ''`, etc. El tipo de retorno es `CoachSettingsRow = Tables<'coaches'>` (fila completa), pero los valores no seleccionados llegan `undefined` en runtime → los defaults de `BrandAdvancedSection` siempre arrancan vacios aunque el coach haya guardado avanzados. Punto a corregir en el rediseño (incluir las columnas v2 en este SELECT).

La page renderiza, en orden:
- `<WhatChangesList />` — lista informativa estatica (6 items: color, logo, nombre, mensaje de bienvenida, loader, icono de app). Solo decorativo.
- `<LogoUploadForm currentLogoUrl={coach.logo_url} brandName={coach.brand_name} />` — formulario aislado de subida de logo (form propio, server action propio).
- `<BrandSettingsForm coach={coach} />` — el editor principal (todos los demas campos).
- `<BrandSettingsTourClient coachId={coach.id} brandTourSeenServer={...} />` — el tour guiado. `brandTourSeenServer` se deriva leyendo `coach.onboarding_guide.brand_tour_seen === true` (jsonb).

---

## 2.2 Campos de marca que edita el editor (como DATOS)

El editor escribe sobre la fila `coaches` del propio coach. Los campos, agrupados por seccion del form, vistos como DATOS de marca:

### Identidad (siempre editable, NO gateada)

| Campo (input) | Columna `coaches` | Tipo / limite | Que es como dato |
|---|---|---|---|
| `full_name` | `full_name` | string 2–100 | Nombre privado del coach (facturacion/soporte); el alumno no lo ve como chrome. |
| `brand_name` | `brand_name` | string 2–100 | Nombre publico de la marca: titulo de la app instalada, pestaña del navegador, header. |
| `welcome_message` | `welcome_message` | string ≤240 (o null) | Mensaje que el alumno ve bajo el logo en la pantalla de login. Controlado (`welcomeMessageInput`). |
| `welcome_modal_enabled` | `welcome_modal_enabled` | boolean | Activa un modal de bienvenida en el dashboard del alumno. |
| `welcome_modal_type` | `welcome_modal_type` | enum `text`\|`video` | Tipo de contenido del modal. Hidden input siempre renderizado. |
| `welcome_modal_content` | `welcome_modal_content` | string ≤1000 (o null) | Texto del modal, o URL de video (YouTube/Vimeo) si `type='video'`. Hidden input siempre renderizado. |

> **Nota de gating de comunicacion vs chrome (decisión CEO 2026-06-21):** la identidad (`full_name`/`brand_name`) y la comunicacion (`welcome_*`) NO se gatean por tier — el alumno ve el nombre del coach y su mensaje aunque el chrome visual (color/logo/loader) caiga a EVA. Solo el branding VISUAL es Pro+.

### Color de marca (gateado Pro+)

| Campo | Columna | Tipo | Dato |
|---|---|---|---|
| `primary_color` | `primary_color` | hex `#RRGGBB` | Color principal. Hidden input alimentado por el state `selectedColor` (8 presets + color picker libre). |
| `use_brand_colors_coach` | `use_brand_colors_coach` | boolean | Si ON, el panel del PROPIO coach usa su marca; si OFF, el panel del coach usa el sistema (`#007AFF`). No afecta la app del alumno (esa siempre usa la marca). |

La paleta derivada (Oscuro/Claro/Superficie/Brillo) NO se persiste: se computa en runtime con `generateBrandPalette()` (ver 2.4). Solo `primary_color` es la fuente de verdad guardada.

### Loader animado (gateado Pro+) — modelo "legacy" del loader

| Campo | Columna | Tipo | Dato |
|---|---|---|---|
| `use_custom_loader` | `use_custom_loader` | boolean | Activa texto/estilo de loader propios en vez de "EVA". |
| `loader_text` | `loader_text` | string ≤10, forzado a MAYUSCULAS en UI (o null) | Texto que reemplaza "EVA" en la animacion de carga. |
| `loader_icon_mode` | `loader_icon_mode` | enum `eva`\|`coach`\|`none` | Icono del loader: logo EVA, logo del coach (deshabilitado si no hay `logo_url`), o sin icono. Hidden input. |
| `loader_text_color` | `loader_text_color` | hex `#RRGGBB`, `''` = gradiente animado (o null) | Estilo del texto: vacio = gradiente derivado de la marca; valor hex = color solido. Hidden input. |

### Branding avanzado white-label v2 (gateado Pro+) — `BrandAdvancedSection`

Estos son los campos "avanzados Pro" agregados por el white-label v2. Todos se emiten como **hidden inputs** desde `BrandAdvancedSection` y los recoge el `<form>` padre de `BrandSettingsForm`:

| Campo | Columna | Tipo | Dato |
|---|---|---|---|
| `brand_secondary_color` | `brand_secondary_color` | hex o `''` | Color secundario (color2) INDEPENDIENTE del principal: badges, etiquetas, macros de nutricion, 2da serie de graficos. |
| `accent_light` | `accent_light` | hex o `''` | Acento explicito para modo claro (override; NULL ⇒ se deriva del `brandColor`). |
| `accent_dark` | `accent_dark` | hex o `''` | Acento explicito para modo oscuro (override; NULL ⇒ derivado). |
| `neutral_tint` | `neutral_tint` | boolean (`'on'`/`''` en form) | Si ON, los fondos/superficies/bordes se tiñen levemente con el matiz de la marca ("tinte de marca en los fondos"). |
| `brand_font_key` | `brand_font_key` | enum cerrado de 12 keys o `''` | Fuente de TITULOS (display). El cuerpo siempre queda en Inter (decisión #4). Lista CERRADA (ver 2.5). |
| `loader_variant` | `loader_variant` | enum de 7 keys, default `eva` | Variante de pantalla de carga (eva default + 6: progreso/anillo/radar/cometa/ritmo/orbitas). |

> `logo_url_dark` (logo para modo oscuro) NO lo edita este form: el comentario en `settings.actions.ts` dice que se sube aparte via `updateLogoDarkAction` (W2 UI). En el codigo leido NO existe `updateLogoDarkAction` aun en `settings.actions.ts` (solo se menciona). La columna `logo_url_dark` SI esta en el GRANT UPDATE y en el GRANT SELECT a `anon`, lista para cuando exista esa UI.

### Solo lectura / no editable en este editor

- `slug` (URL legacy alias): se muestra read-only. Inmutable (set-once en registro). Sigue funcionando como alias para alumnos antiguos.
- `invite_code` (codigo corto publico): se muestra read-only como identificador primario. Set-once a nivel DB (trigger `coaches_invite_code_set_once`).
- QR + link de alumno (`studentUrl = https://eva-app.cl/c/{publicStudentIdentifier}/login`): derivado en cliente con `getCoachPublicIdentifier(coach)` + `QRCodeSVG`. No es un dato persistido.

---

## 2.3 LogoUploadForm: subida del logo a Storage (backend)

`LogoUploadForm.tsx` es un form independiente del editor principal, con su propio server action `updateLogoAction`. Flujo:

### Cliente
- Acepta `image/*`, max 2 MB (`MAX_SIZE = 2 * 1024 * 1024`). Drag-and-drop o click.
- `processFile`: valida tamaño en cliente (toast si >2MB), genera `URL.createObjectURL` para preview, inyecta el `File` en un input file oculto via `DataTransfer` y hace `formRef.current.requestSubmit()` (auto-submit al elegir archivo). Limpia el object URL en unmount.
- Tras `state.success`: toast + `router.refresh()` para repintar el logo desde DB.
- Recomendacion de UI: PNG/JPG/SVG, 512×512, fondo transparente (texto). **Pero el server solo acepta JPEG/PNG por magic bytes** (ver abajo) — un SVG real fallaria la validacion de bytes.

### Server: `updateLogoAction(_prev, formData)` — `settings.actions.ts:117`

Defensas y pasos (en orden):
1. `file = formData.get('logo') as File`. Rechaza si falta o `size === 0`.
2. Rechaza `file.size > 2*1024*1024` ("El logo no puede superar 2 MB") — **validacion de tamaño tambien server-side** (el cliente es solo UX).
3. Rechaza si `!file.type.startsWith('image/')`.
4. **Validacion de magic bytes** (anti-spoof de extension): lee los primeros 4 bytes del `arrayBuffer`. JPEG = `FF D8`; PNG = `89 50 4E 47`. Si no es ninguno → "El archivo no es una imagen válida (JPEG o PNG)". Esto bloquea archivos no-imagen con extension/MIME falsos.
5. Auth: `supabase.auth.getUser()` (aqui SI usa `getUser`, no `getClaims`). Sin user → "No autenticado.".
6. **Gate de branding server-side**: `SELECT subscription_tier` del coach; si `!isBrandingAllowed(tier ?? 'free')` → devuelve error "El branding personalizado está disponible desde el plan Pro." El boton se oculta en UI a < Pro, pero el action es POSTeable directo → este es el enforcement real.
7. **Subida a Storage**: bucket `logos`, path `${user.id}/logo.${ext}` (ext derivada de `file.name`, default `png`). `upload(path, file, { upsert: true, contentType: file.type })`. El path namespaced por `user.id` aisla los logos por coach.
8. `getPublicUrl(path)` → URL publica. Se le agrega cache-buster: `${publicUrl}?t=${Date.now()}`.
9. **Persiste en DB**: `UPDATE coaches SET logo_url = cacheBusterUrl WHERE id = user.id`. `logo_url` esta en el GRANT UPDATE de columna (ver 2.7) → user-scoped via `coaches_update_own`.
10. Revalidacion amplia: `revalidatePath('/coach/settings', 'page')`, `revalidatePath('/coach/dashboard', 'layout')`, `revalidatePath('/', 'layout')` — el logo afecta multiples superficies.

### Storage bucket `logos`
- Definido en `supabase/migrations/20260521000004_storage_buckets.sql` (+ policies en `20260525181500_storage_workspace_policies.sql`).
- El logo se sirve via **URL publica** (`getPublicUrl`), no via URL firmada. Es branding publico por diseño (lo ve el login pre-auth). El cache-buster `?t=` evita logos cacheados tras un re-upload.
- Borrado en delete-account: best-effort `storage.from('logos').remove(['${coachId}/logo.jpg', '${coachId}/logo.png'])`.

> Nota: el prompt menciona "URL firmada" para el logo; en el codigo actual es `getPublicUrl` (URL publica con cache-buster), no `createSignedUrl`. El logo es deliberadamente publico.

---

## 2.4 BrandSettingsForm: estado, derivados y preview en vivo

`BrandSettingsForm.tsx` (`'use client'`) maneja todo el editor salvo el logo. Usa `useActionState(updateBrandSettingsAction, initialState)`.

### Estado local (controlados)
`selectedColor`, `useCoachColors`, `useCustomLoader`, `loaderText`, `loaderTextColor`, `loaderIconMode`, `welcomeModalEnabled`, `welcomeModalContent`, `welcomeModalType`, `welcomeMessageInput`. Cada uno inicializa desde la columna correspondiente de `coach`.

### Derivados (no persistidos)
- `palette = generateBrandPalette(selectedColor ?? '#007AFF')` — paleta visual (primary/dark/light/surface/glow) para mostrar swatches. Computo puro `color-utils.ts` (HEX→HSL→shades). El secundario, si se pasa, espeja las shades del primario.
- `publicStudentIdentifier = getCoachPublicIdentifier(coach)` y `studentUrl` (link de alumno) + `legacyStudentUrl` (alias slug). Solo display/QR.
- `contrast = getContrastInfo(selectedColor)` — ratio WCAG vs blanco/negro; nivel `AA` / `AA-large` / `fail`. Solo muestra un badge de legibilidad (no bloquea guardar).
- `brandScore` (0–100): **Brand Score** computado en cliente, NO persistido. Suma: logo (+25), color ≠ `#007AFF` (+20), `welcome_message` (+15), loader custom con texto (+15), modal con contenido (+15), `brand_name` ≠ `full_name` (+10). Es la "Marca completada %". Solo motivacional/UI.
- `isDirty`: compara todos los states contra los valores originales de `coach`; dispara un `beforeunload` warning y un badge "Sin guardar".

### Preview en vivo (efecto sobre el DOM del propio panel)
Un `useEffect` setea `--theme-primary` / `--theme-primary-rgb` en `document.documentElement` y en `.coach-layout-container` mientras se edita, y los restaura en cleanup. Respeta `use_brand_colors_coach`: si OFF, el preview usa `#007AFF`. Esto solo cambia el panel del coach en vivo; no toca DB.

### Hidden inputs (que viajan al server action)
`primary_color`, `loader_icon_mode`, `loader_text_color`, `welcome_modal_type`, `welcome_modal_content`, mas todos los de `BrandAdvancedSection`. Los checkboxes nativos (`use_brand_colors_coach`, `use_custom_loader`, `welcome_modal_enabled`) viajan como `'on'`/ausente.

### BrandThemePreview (columna derecha sticky)
`<BrandThemePreview />` (`_components/BrandThemePreview.tsx`): una maqueta de telefono que refleja la app del alumno en vivo con los valores actuales (brandName, primaryColor, logoUrl, welcomeMessage, loaderText, useCustomLoader, loaderTextColor, loaderIconMode). Funcional:
- Toggle claro/oscuro (`isDark` state local).
- 4 pantallas mock conmutables por bottom-nav: Inicio, Plan Alimenticio, Aprender (ejercicios), Check-in. Todas son **mock estatico** (datos ficticios), solo aplican `primaryColor` a acentos.
- Pantalla de login mock con logo (o inicial de marca), `brandName` y `welcomeMessage`.
- Preview del loader real via `<EvaRouteLoader customText loaderText useCustom textColor primaryColor iconMode size="sm" />`.
- Reflejo: color primario, logo, nombre, mensaje, loader. NO refleja los avanzados v2 (color2/font/dark/loader_variant) — esos solo se previsualizan dentro de `BrandAdvancedSection`.

---

## 2.5 BrandAdvancedSection: avanzado Pro + guardia WCAG (motor compartido)

`BrandAdvancedSection.tsx` (`'use client'`) es la seccion "Branding avanzado (Pro)". Importa el **motor de tema compartido** `@eva/brand-kit` (`resolveBrandTheme`, `contrastReport`) y los registros `CURATED_FONTS`/`LOADER_VARIANTS`.

### Gate defensivo en el componente
`if (!isBrandingAllowed(tier))` → renderiza un **teaser sin inputs** (card "Branding avanzado · Pro" sin campos). La page ya redirige a < Pro, esto es defensa en profundidad: aunque se montara, no emite hidden inputs.

### Preview en vivo + contraste (motor real, no aproximacion)
- `theme = useMemo(() => resolveBrandTheme({ brandColor, accentLight, accentDark, neutralTint, secondaryLight, secondaryDark }))`. Usa el **mismo motor** que el render real del alumno → el preview es fiel.
- `resolveBrandTheme` (`packages/brand-kit/index.ts`): puro TypeScript con `culori`/OKLCH. Deriva fondos/superficies/bordes desde el matiz de la marca, **clampa los acentos a contraste WCAG AA** (`clampAccent` ajusta lightness hasta cumplir minimo) y elige texto legible (`pickOnColor` → near-white o near-black). Esto garantiza que el texto del alumno nunca sea invisible.
- `report = contrastReport(theme)`: audita 6 pares criticos por modo (texto/fondo, texto/superficie, texto del acento, acento/fondo, + los dos del color2). `failing = report.items.filter(i => !i.passes)`.
- **Guardia WCAG en UI:** si no hay fallas → "Contraste legible (WCAG AA) en claro y oscuro"; si hay → "Ajustamos tus colores para que el texto siempre se lea (N alertas rescatadas)". Es informativo: NO bloquea guardar (el clamp del motor ya rescata el contraste en el render real).
- Toggle preview `light`/`dark` (`previewMode`); muestra `theme[previewMode]` con boton, etiqueta y texto secundario usando `accent`/`accent2`/`textMuted`.

### Validacion de hex en cliente
`HEX_RE = /^#[0-9a-fA-F]{6}$/`. Inputs no-hex caen a un placeholder seguro para el preview (`#10B981` para el primario, `#00C7BE` color2, `#047857`/`#34d399` acentos). El valor crudo igual viaja en el hidden input → el server lo re-valida con Zod.

### Fuentes — lista CERRADA (defensa anti CSS-injection)
- `CURATED_FONTS` (`lib/brand-fonts.ts`): 12 fuentes (inter, montserrat, plus-jakarta, hanken, manrope, poppins, sora, space-grotesk, outfit, figtree, dm-sans, lexend). Todas sans-serif, subset latin, pesos 400–700.
- Las KEYS canonicas viven en `@eva/schemas` (`packages/schemas/brand.ts` → `FONT_KEY_TUPLE`), fuente unica del `z.enum`. `brand-fonts.ts` solo agrega metadata de presentacion (familia CSS + `--font-brand-<key>`).
- **Sin upload, sin string libre** — es la unica defensa contra inyeccion de CSS via fuente. El server valida con `z.enum(FONT_KEY_TUPLE)`. `resolveBrandFontStack()` inyecta server-side; el cliente nunca recibe el string crudo del coach, y un valor invalido degrada a Inter (fail-closed, nunca a serif del sistema).

### Loaders — registro cerrado
- `LOADER_VARIANTS` (`lib/brand-loaders.ts`): 7 keys (`eva` default + progreso/anillo/radar/cometa/ritmo/orbitas), metadata (label, note, hasIcon, hasWordmark). Tuple canonico `LOADER_VARIANT_TUPLE` en `@eva/schemas`. `resolveLoaderVariant()` normaliza valores invalidos a `eva` (fail-closed).

---

## 2.6 Gate de tier: `canUseBranding` / `isBrandingAllowed` (`@eva/tiers`)

Fuente unica del gate de marca en `packages/tiers/index.ts`:

- `TIER_CAPABILITIES[tier].canUseBranding`:
  - `free`: **false**
  - `starter`: **false**
  - `pro`: **true**
  - `elite`: **true**
  - `growth` (legacy): true
  - `scale` (legacy): true
- `isBrandingAllowed(tier)` = `TIER_CAPABILITIES[tier]?.canUseBranding === true`. **Fail-closed**: tier invalido (string fuera del union) → `false`.
- Decisión CEO 2026-06-21 (white-label v2): branding VISUAL (color/logo/loader + color2/font/dark) es **Pro+ ENTERO** (no se desglosa por feature). Branding personalizado salio de `SHARED_TIER_FEATURES`; solo lo listan pro/elite/growth/scale.
- `isBrandingAllowed` es la fuente unica consumida por las 5 superficies de render (proxy, layout alumno, layout coach, login query, manifest/splash) **mas el write-path** (este server action). Por eso el render del alumno cae a EVA si el tier baja, sin necesidad de tocar datos.

---

## 2.7 settings.actions: como se guarda la marca (BACKEND, el corazon)

`updateBrandSettingsAction(_prev, formData)` — `_actions/settings.actions.ts:17` (`'use server'`).

### Paso 1 — extraccion del FormData (`raw`)
Lee y normaliza cada campo: strings con `.trim()`; checkboxes como `=== 'on'`; enums con defaults (`loader_icon_mode ?? 'eva'`, `loader_variant ?? 'eva'`, `welcome_modal_type ?? 'text'`). Incluye los 6 campos white-label v2.

### Paso 2 — validacion Zod server-side (`BrandSettingsSchema`)
`packages/schemas/coach.ts` → `BrandSettingsSchema.safeParse(raw)`. Si falla → `return { fieldErrors }` (sin escribir nada). Reglas:
- `full_name` / `brand_name`: string 2–100.
- `primary_color`: regex `^#[0-9a-fA-F]{6}$` (hex estricto).
- `welcome_message`: ≤240.
- `loader_text`: ≤10 o `''`.
- `loader_text_color`: hex o `''`.
- `loader_icon_mode`: `z.enum(['eva','coach','none'])`.
- `brand_secondary_color` / `accent_light` / `accent_dark`: hex o `''`.
- `neutral_tint`: boolean.
- `brand_font_key`: **`z.enum(FONT_KEY_TUPLE)`** o `''` — enum cerrado, NUNCA string libre (defensa anti CSS-injection en la fuente).
- `loader_variant`: `z.enum(LOADER_VARIANT_TUPLE)` default `eva`.
- `welcome_modal_content`: ≤1000 o `''`.
- `welcome_modal_type`: `z.enum(['text','video'])`.
- `superRefine`: si modal habilitado + type `video` + content presente, el content debe matchear `youtube.com|youtu.be|vimeo.com` (regex de URL de video) o `fieldError` en `welcome_modal_content`.

> **Sanitizacion anti-XSS / anti-inyeccion = el propio Zod + enums cerrados.** No hay un sanitizador HTML aparte: la defensa es estructural. Los colores son hex validados por regex (no pueden inyectar `url()`/`expression()`). La fuente es un enum cerrado de 12 (no string CSS libre). El loader_variant es enum de 7. El texto libre (`welcome_message`, `welcome_modal_content`, `loader_text`) se persiste como texto plano y los consumidores lo renderizan como texto (no `dangerouslySetInnerHTML` con datos del coach); la URL de video se valida contra una allowlist de dominios.

### Paso 3 — auth y fetch del estado actual
- `supabase.auth.getUser()` (aqui usa `getUser`, no `getClaims`). Sin user → `{ error: 'No autenticado.' }`.
- `SELECT welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version, subscription_tier FROM coaches WHERE id = user.id`. Trae el tier (para el gate) y el versionado del modal.

### Paso 4 — versionado del welcome modal
`welcomeModalVersion = currentCoach.welcome_modal_version ?? 0`. Si cambio `enabled`, `content` o `type` respecto al actual → `version += 1`. El incremento de version es lo que hace que el alumno vuelva a ver el modal (resetea su "no mostrar de nuevo").

### Paso 5 — gate de branding server-side (enforcement real)
```
const tier = (currentCoach?.subscription_tier ?? 'free') as SubscriptionTier
const brandingAllowed = isBrandingAllowed(tier)
```
- **Fallback `'free'`** (mas estricto que el `'starter'` de la page). El page redirige y el render del alumno cae a EVA, pero el action es POSTeable directo → este es el enforcement server-side real.

### Paso 6 — construccion del payload (gateado por columna)
Siempre se escriben (NO gateadas — identidad + comunicacion):
`full_name`, `brand_name`, `welcome_message` (`|| null`), `welcome_modal_enabled`, `welcome_modal_content` (`|| null`), `welcome_modal_type`, `welcome_modal_version`, `welcome_modal_updated_at` (solo si `modalChanged`, sino `undefined` → no se escribe), `updated_at`.

Solo si `brandingAllowed` se agregan (branding VISUAL Pro+):
`primary_color`, `use_brand_colors_coach`, `loader_text` (`|| null`), `use_custom_loader`, `loader_text_color` (`|| null`), `loader_icon_mode`, `brand_secondary_color` (`|| null`), `accent_light` (`|| null`), `accent_dark` (`|| null`), `neutral_tint`, `brand_font_key` (`|| null`), `loader_variant`.

→ Un coach que perdiera Pro y POSTeara igual no podria reescribir el branding visual; solo identidad/comunicacion.

### Paso 7 — persistencia
`UPDATE coaches SET <payload> WHERE id = user.id`. Self-update user-scoped via policy `coaches_update_own` (R3, auditoria 2026-06-11). Si error → `{ error: error.message }`. Exito → `revalidatePath('/coach/settings')` + `{ success: true }`.

### Columnas explicitamente NO tocadas (compra-only / service-role)
El comentario lo deja claro: `slug` e `invite_code` son inmutables (set-once). Las columnas compra-only que **nadie escribe via este action** (solo service-role): `enabled_modules`, `subscription_tier`, `subscription_status`, `max_clients`, `billing_cycle`, `current_period_end`, `subscription_mp_id`, `trial_*`, `payment_provider`, `admin_notes`, `active_org_id`. Es decir: la marca se edita user-scoped, pero el TIER que la habilita es compra-only.

---

## 2.8 GRANT de columnas: por que la persistencia funciona (y como rompe si falta)

`coaches` usa **GRANT a nivel de columna** (no de tabla) para `authenticated`. Patron (migracion `20260612140000_modules_compra_only_grants.sql`):
```
REVOKE INSERT, UPDATE, DELETE ON public.coaches FROM authenticated, anon;
GRANT UPDATE ( full_name, brand_name, primary_color, use_brand_colors_coach, logo_url,
  welcome_message, loader_text, use_custom_loader, loader_text_color, loader_icon_mode,
  welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version,
  welcome_modal_updated_at, onboarding_guide, invite_code, updated_at ) ON public.coaches TO authenticated;
```

**Regla obligatoria (CLAUDE.md):** toda columna nueva user-editable exige un `GRANT UPDATE(col)` en la MISMA migracion que la crea. Sin el grant, PostgREST/Supabase devuelve **42501 (permission denied for table coaches)** en runtime — y el PATCH ENTERO falla, no solo esa columna.

- **Incidente real (memoria, 2026-06-21):** el white-label v2 (#37) agrego 7 columnas a `coaches` (las v2) + 2 a `teams` SIN GRANT UPDATE → al guardar marca, 42501 del PATCH completo (hasta `welcome_message` fallaba). Fix LIVE: GRANT UPDATE de esas columnas (migracion `20260621220000`, aplicada en prod; no presente en el checkout local pero LIVE).
- **Incidente espejo de SELECT (2026-06-21):** las mismas 7 columnas sin GRANT SELECT a `anon` rompieron el login de alumno (404 para todos los coaches). Fix: migracion `20260621213600_grant_anon_select_whitelabel_v2_branding_cols.sql` → `GRANT SELECT (brand_secondary_color, accent_light, accent_dark, neutral_tint, logo_url_dark, brand_font_key, loader_variant) ON public.coaches TO anon`.
- La columna `welcome_modal_version` esta en el GRANT UPDATE → el incremento de version del modal (paso 4) es escribible user-scoped.
- El comentario del action menciona `accent_light`, `accent_dark`, `neutral_tint`, `logo_url`, `logo_url_dark`, `loader_text`, `loader_text_color`, `loader_icon_mode`, `primary_color` en el bloque de teams del grant migration — paridad con `teams` (la marca tambien funciona en team/org, con sus propias columnas y `teams_guard_owner_fields` para proteger `seat_limit`).

> **Tarea de paridad para el rediseño:** verificar que las 7 columnas v2 tengan GRANT UPDATE para `authenticated` (LIVE pero no en el .sql local committeado) y que el SELECT de `getCoachSettingsForUser` las incluya. Cualquier columna de marca NUEVA debe entrar al GRANT UPDATE (escritura coach) + GRANT SELECT a `anon` (lectura login pre-auth) en la misma migracion.

---

## 2.9 BrandSettingsTour: tour guiado

`BrandSettingsTour.tsx` + `BrandSettingsTourClient.tsx` + persistencia en `onboarding-guide.actions.ts`.

### Pasos del tour (`TOUR_STEPS`, 9 pasos)
Cada paso ancla a un `data-tour-id` del DOM y muestra titulo + descripcion en una tarjeta con spotlight:
1. `brand-header` — "Tu marca en la app de tus alumnos".
2. `brand-logo` — Logo de tu marca.
3. `brand-identity` — Identidad (nombre, URL, mensaje de bienvenida).
4. `brand-color` — Color de marca.
5. `brand-loader` — Loader animado.
6. `brand-welcome-modal` — Mensaje de bienvenida al dashboard.
7. `brand-share` — Compartir con alumnos (link/QR).
8. `brand-preview` — Vista previa en vivo (toggle claro/oscuro).
9. `brand-save` — Guardar cambios (FAB).

(Hay un `data-tour-id="brand-advanced"` en `BrandAdvancedSection` pero NO esta en `TOUR_STEPS` — el tour no cubre el avanzado v2.)

### Comportamiento (BrandSettingsTour)
- `BrandTourStep = { id, title, description, placement? }`.
- Encuentra el elemento por `[data-tour-id="<id>"]`, `scrollIntoView`, calcula `getBoundingClientRect` y dibuja un spotlight (recorte) + tarjeta. Si el elemento no existe, auto-avanza tras 80ms (y cierra si era el ultimo).
- Bloquea scroll del body mientras esta abierto. Navegacion: Saltar / Atras / Siguiente / Finalizar. Indicador "Paso N de total".

### Apertura / cierre y persistencia (BACKEND del tour)
`BrandSettingsTourClient`:
- Apertura: si `?tour=1` en la URL → abre y limpia el param; sino, merge de `brandTourSeenServer` (del jsonb `coach.onboarding_guide.brand_tour_seen`) con `localStorage[brandTourSeenStorageKey(coachId)]`. Server gana para "visto". Si no visto, abre tras 600ms. Tambien escucha evento `brand-tour-start` (boton de ayuda HelpCircle re-lanza el tour).
- Cierre: setea `localStorage[key]='true'`, dispara `BRAND_TOUR_SEEN_CHANGED_EVENT`, y llama `markBrandTourSeenAction()` (fire-and-forget).
- `markBrandTourSeenAction()` (`onboarding-guide.actions.ts:77`): `getUser` → lee `onboarding_guide` → **merge** `{ ...existing, brand_tour_seen: true }` (NO reemplazo, para no pisar `invite_code_confirmed` u otras keys) → `UPDATE coaches SET onboarding_guide, updated_at WHERE id`. `onboarding_guide` esta en el GRANT UPDATE de columna. `revalidatePath('/coach/settings')`.

> No existe un "Brand Score" persistido en el tour ni en DB: el unico Brand Score es el % computado en cliente dentro de `BrandSettingsForm` (2.4). El tour solo persiste el booleano `brand_tour_seen` en el jsonb `onboarding_guide`.

---

## 2.10 Vista previa de la app del alumno (`/coach/settings/preview`)

Pagina dedicada "Vista Previa Alumno" — `preview/page.tsx` (RSC) + `StudentDashboardPreview.tsx` (cliente) + `_data/preview.queries.ts`.

### Datos (`getPreviewCoach`, `preview.queries.ts`)
- Auth via `supabase.auth.getClaims()` (JWT local). Sin user → redirect.
- `SELECT brand_name, primary_color, logo_url, use_brand_colors_coach, loader_text, use_custom_loader, loader_text_color, loader_icon_mode FROM coaches WHERE id = user.id` (`maybeSingle`). SELECT acotado (no `*`).
- **No tiene gate de branding propio** (a diferencia de `brand/page.tsx`): solo exige user+coach. Un Free/Starter que navegue directo a `/coach/settings/preview` ve la preview con los valores de su fila (que serian los del sistema si nunca compro Pro). El gate efectivo lo da que el enlace "Vista previa" solo aparece en el editor (que es Pro+).

### page.tsx
- Resuelve `primaryColor`: si `use_brand_colors_coach === false` → `#007AFF`; sino `primary_color || #007AFF`. Calcula `primaryRgb` parseando el hex.
- Inyecta `<style>` con `:root { --theme-primary; --theme-primary-rgb }` via `dangerouslySetInnerHTML` — **pero solo con valores DERIVADOS y validados server-side** (hex parseado, fallback `0, 122, 255`), no con string crudo del coach.
- Renderiza `<StudentDashboardPreview brandName primaryColor logoUrl loaderText useCustomLoader loaderTextColor loaderIconMode />`.

### StudentDashboardPreview (funcional)
- Toggle de dispositivo (solo md+): Movil / Escritorio. En movil real renderiza el dashboard directo (el telefono ES el frame).
- `MobileFrame` (marco de telefono con dynamic island), `DesktopFrame` (marco de monitor con chrome de browser falso mostrando `app.tucoach.com/c/<brand>/dashboard`).
- `DashboardScreen`: maqueta del dashboard del alumno (sidebar/bottom-nav, calendario semanal con dia de hoy real, cards de entreno/nutricion, stats, programa activo). Todo **mock estatico**; solo aplica `primaryColor` (via `color-mix`) a acentos. Usa `logoUrl` o la inicial de `brandName`.
- Preview del loader real con `<EvaRouteLoader ... size="lg" />` usando los campos de loader.
- "Expandir vista" / device toggle = solo cambia el frame; no recarga datos.
- Refleja: brandName, primaryColor (respetando `use_brand_colors_coach`), logoUrl, y los campos de loader. NO refleja los avanzados v2 (color2/font/dark/neutral_tint/loader_variant) — limitacion conocida de la preview.

---

## 2.11 Resumen para el rediseño (puntos de cuidado backend)

- **Gate doble:** lectura (page redirect, fallback `'starter'`) + escritura (action, fallback `'free'`, mas estricto). El render del alumno y el manifest comparten `isBrandingAllowed` como fuente unica. Mantener ese helper como unico punto de verdad.
- **Compra-only:** el tier que habilita la marca es service-role-only; la marca en si es user-scoped via column-grant. Toda columna de marca nueva → GRANT UPDATE (authenticated) + GRANT SELECT (anon) en la misma migracion, o 42501 en runtime (PATCH entero) + 404 login alumno.
- **Anti-inyeccion estructural:** colores = hex regex; fuente = enum cerrado de 12 (sin upload/string libre); loader = enum de 7; video = allowlist de dominios. No hay sanitizador HTML separado — preservar este modelo (no introducir campos de marca de texto/CSS libre).
- **Sanitizar valores derivados antes de inyectar al DOM:** la unica inyeccion (`<style>` en preview) usa hex parseado server-side con fallback, nunca el string crudo. Mantener.
- **Logo:** validacion de magic bytes JPEG/PNG (no confiar en MIME/extension), tope 2MB server-side, path namespaced por `user.id`, URL publica + cache-buster. SVG anunciado en UI pero rechazado por bytes (inconsistencia a resolver).
- **Gaps actuales:** (a) `getCoachSettingsForUser` no selecciona las 7 columnas v2 → los avanzados arrancan vacios al recargar; (b) `updateLogoDarkAction` esta mencionado pero no implementado (`logo_url_dark` queda sin UI de subida); (c) la preview no refleja los avanzados v2; (d) `/coach/settings/preview` no tiene gate de branding propio.
