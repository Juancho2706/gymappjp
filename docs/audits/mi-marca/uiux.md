# Auditoría UI/UX + Estructura — "Mi Marca" (/coach/settings/brand)

Fecha: 2026-07-02 · Lente: UI/UX + estructura · Modo: READ-ONLY
CEO: "está desordenado y cosas se repiten."

## Alcance

Árbol auditado:
- `apps/web/src/app/coach/settings/brand/page.tsx` — ruta standalone (mobile + desktop directo)
- `apps/web/src/app/coach/settings/BrandSettingsForm.tsx` — form principal (824 líneas, casi todo vive acá)
- `apps/web/src/app/coach/settings/LogoUploadForm.tsx` — subida de logo (form propio, save independiente)
- `apps/web/src/app/coach/settings/BrandAdvancedSection.tsx` — "Branding avanzado (Pro)": color2 + fuente + tinte + loader_variant + preview propio
- `apps/web/src/app/coach/settings/_components/BrandThemePreview.tsx` — mini-mockup de la app (preview grande)
- `apps/web/src/app/coach/settings/_components/CoachSettingsDesktop.tsx` — SettingsShell 2-panel (desktop)
- `apps/web/src/app/coach/settings/page.tsx` — hub Opciones + ensamblado del pane "marca" embebido

Referencia kit CD:
- `docs/design-source/ui_kits/eva-app/screens/coach-settings.jsx` → `MiMarca` (líneas 396-667)
- `docs/design-source/ui_kits/eva-desktop/desktop-coach.jsx` → `DesktopOpciones` (líneas 457-540)

---

## 1. Inventario de secciones en orden real de render

### Ruta standalone (`/coach/settings/brand` — mobile y desktop directo)

`page.tsx` renderiza, en este orden:
1. Hero de página: tile icono Palette + `<h1>Mi Marca</h1>` + descripción 2 líneas (page.tsx:54-67)
2. **LogoUploadForm** (card propia, form propio con su botón "Subir logo" + éxito/error inline) (page.tsx:72-75)
3. **BrandSettingsForm** (page.tsx:78), que a su vez renderiza:
   - a) **Brand Score** (barra % + indicador "Sin guardar") — BrandSettingsForm.tsx:166-187
   - b) **Vista previa de tu app** (BrandThemePreview, instancia mobile `lg:hidden`) — 190-201
   - c) **Identidad de tu marca** — 206-394, contiene:
     - Tu nombre completo (full_name — privado, facturación) + Nombre de marca (grid 2-col)
     - URL legacy (alias, solo lectura)
     - Mensaje de bienvenida (welcome_message, sale en login)
     - **card anidada** "Mensaje de bienvenida al dashboard" (welcome_modal + tabs Texto/Video) — 302-393
   - d) **Color de marca** — 397-524, contiene:
     - 8 presets + color picker + badge contraste WCAG + reset
     - Paleta generada + "Vista previa del botón principal" (mini botón)
     - **card anidada** "Configuración de visualización" (use_brand_colors_coach) — 501-519
   - e) **Branding avanzado (Pro)** (BrandAdvancedSection) — 527-538, contiene color2 + fuente + tinte + acento por modo + **Pantalla de carga (loader_variant)** + **preview propio con su propio toggle claro/oscuro** — BrandAdvancedSection.tsx:80-256
   - f) **Loader animado** (use_custom_loader + loader_text + loader_icon_mode + loader_text_color) — 540-687
   - g) **Compartir con alumnos** (QR + código + link) — 690-737
   - h) **Vista previa de tu app** (BrandThemePreview, instancia desktop sticky `hidden lg:block`) — 742-753
   - i) **FAB fijo**: botón "Expandir vista" + SaveButton (fixed bottom-right) — 764-788
   - j) **Modal "Expandir vista"**: BrandThemePreview otra vez, a pantalla completa — 791-821

### Pane embebido desktop (`/coach/settings` → CoachSettingsDesktop → sección `marca`)

`page.tsx:248-260`: dentro de `PaneBody` (caja `dt-set-embed`, `max-width:720px`) renderiza el MISMO `<LogoUploadForm/>` + `<BrandSettingsForm/>`. El título "Mi Marca" + subtítulo los pone la SettingsShell (`dt-set-panehd` / `dt-set-panesub`). El FAB de BrandSettingsForm queda fijo al viewport, no al pane.

---

## 2. DUPLICADOS detectados ("cosas se repiten")

### D1 — Loader configurado en DOS lugares distintos [ALTA]
- "Loader animado" (BrandSettingsForm.tsx:540-687): `use_custom_loader` + `loader_text` + `loader_icon_mode` + `loader_text_color` (gradiente/sólido).
- "Pantalla de carga" (BrandAdvancedSection.tsx:190-215): `loader_variant` (LOADER_VARIANTS).
Son dos controles de "loader" en dos cards separadas, con nombres distintos ("Loader animado" vs "Pantalla de carga"), sin relación visible entre sí. El kit tiene UN solo loader, dentro del acordeón Pro (coach-settings.jsx:611-630).
**Fix:** unificar en una sola sección "Pantalla de carga" que combine variant + texto + ícono + color, o mover `loader_variant` dentro de "Loader animado".

### D2 — Preview de la app renderizado 3 veces + un 4º preview propio del avanzado [ALTA]
- BrandThemePreview instancia mobile `lg:hidden` (190-201)
- BrandThemePreview instancia desktop sticky `hidden lg:block` (742-753)
- BrandThemePreview en el modal "Expandir vista" (809-818)
- BrandAdvancedSection tiene su PROPIO preview (chip botón/etiqueta claro-oscuro) — BrandAdvancedSection.tsx:217-253
Ambas instancias mobile/desktop de BrandThemePreview están montadas a la vez (solo ocultas por CSS) → dos instancias React con estado local independiente (tab activo, modo oscuro): editar una no refleja la otra.
**Fix:** una sola instancia responsive de BrandThemePreview (mover el elemento, no duplicarlo) y que el avanzado use ese mismo preview en vez de uno propio.

### D3 — Toggle claro/oscuro duplicado [MEDIA]
BrandThemePreview tiene su propio toggle Sol/Luna (BrandThemePreview.tsx:381-393) y BrandAdvancedSection tiene OTRO toggle claro/oscuro para su preview (BrandAdvancedSection.tsx:221-234). Dos toggles de modo en la misma página que no se sincronizan.
**Fix:** un único control de modo compartido por el preview canónico.

### D4 — Dos conceptos "Mensaje de bienvenida" con nombres casi idénticos [MEDIA]
En la card Identidad conviven "Mensaje de bienvenida" (welcome_message, aparece en login — 276-299) y "Mensaje de bienvenida al dashboard" (welcome_modal — 302-306). Etiquetas colisionan; el coach no distingue cuál es cuál.
**Fix:** renombrar a "Mensaje en el login" vs "Aviso al abrir el dashboard (modal)".

### D5 — CTA de preview repetido [BAJA]
"Vista previa del botón principal" (mini botón "Ingresar al Panel", 490-499) duplica el botón "Ingresar al Panel" que ya muestra el login del BrandThemePreview (BrandThemePreview.tsx:428-433).
**Fix:** eliminar el mini botón; el preview grande ya lo cubre.

### D6 — Dos mecanismos de guardado en la misma pantalla [ALTA]
LogoUploadForm es un `<form>` propio que auto-guarda al subir (LogoUploadForm.tsx:165-177) con su propio éxito/error inline, mientras TODO lo demás se guarda con el FAB (BrandSettingsForm.tsx:785). El coach ve dos "guardados" distintos: el logo se aplica solo, el resto exige apretar el FAB. Inconsistente y confuso. El kit tiene un único flujo: logo Subir/Quitar dentro del mismo FAB "Guardar" (coach-settings.jsx:529-538, 659-663).
**Fix:** que el logo participe del flujo dirty/FAB único (o dejar claro que el logo se guarda aparte con microcopy).

---

## 3. Jerarquía vs kit CD y vs orden lógico

Orden lógico objetivo: **Score → Preview → Logo → Identidad → Colores → Tipografía → Loader → Avanzado**.
Orden del kit `MiMarca`: Score → Preview → Logo → Identidad → Color → Branding avanzado(acordeón: fuente + loader) → Compartir → FAB.
Orden real: **Logo → Score → Preview → Identidad → Color → Avanzado(fuente+loader_variant) → Loader animado → Compartir → (2ª preview) → FAB → modal preview**.

### H1 — Logo por ENCIMA del Brand Score [ALTA]
`page.tsx` renderiza `LogoUploadForm` ANTES de `BrandSettingsForm` (page.tsx:72-78; embed 252-253), así que el Brand Score —el resumen que debería encabezar— queda debajo del logo. El kit pone Score primero, preview, y recién después Logo (coach-settings.jsx:472-538).
**Fix:** mover Logo dentro de BrandSettingsForm, después del Score+Preview (o subir el Score al tope de la página).

### H2 — Tipografía y Loader partidos y fuera de orden [MEDIA]
La fuente (tipografía) vive enterrada dentro de "Branding avanzado" (BrandAdvancedSection.tsx:127-154) y el loader aparece dos veces (loader_variant en avanzado + "Loader animado" como card top-level 540-687). El orden Tipografía→Loader→Avanzado se rompe: hay loader antes y después del avanzado.
**Fix:** consolidar tipografía + loader (único) en una secuencia contigua dentro del avanzado.

### H3 — "Branding avanzado" NO colapsable (kit = acordeón) [MEDIA]
El kit muestra "Branding avanzado (Pro)" como acordeón cerrado por defecto (coach-settings.jsx:589-600, chevron). En la implementación toda la sección (color2 + fuente + tinte + acento + loader + preview) está SIEMPRE expandida (BrandAdvancedSection.tsx:80-256); solo el sub-bloque "acento por modo" colapsa. Esto alarga muchísimo la página.
**Fix:** envolver toda la sección avanzada en un acordeón cerrado por defecto, como el kit.

---

## 4. Ruido visual

### R1 — Cards anidadas (card dentro de card) [MEDIA]
- "Mensaje de bienvenida al dashboard" es una card con borde DENTRO de la card Identidad (BrandSettingsForm.tsx:302).
- "Configuración de visualización" es una card interna con h3 + card bordeada DENTRO de la card Color (501-518).
Nesting de cajas que engorda visualmente cada sección.
**Fix:** aplanar a filas/toggles sin borde propio dentro de la card padre (patrón del kit: fila + toggle, coach-settings.jsx:549-555, 579-585).

### R2 — FAB fijo al viewport, no al pane (desktop SettingsShell) [MEDIA]
El FAB de BrandSettingsForm es `fixed bottom-right z-50` (BrandSettingsForm.tsx:764). En el pane embebido desktop (`/coach/settings` → CoachSettingsDesktop), flota sobre TODA la pantalla —encima del rail y de otros panes— desacoplado del formulario embebido.
**Fix:** en contexto embebido, anclar el guardado al pane (sticky dentro de `dt-set-pane`) en vez de fixed global.

### R3 — Botón "Expandir vista" mayormente redundante [MEDIA]
El FAB agrega "Expandir vista" (779-784) que abre un modal con el MISMO BrandThemePreview que ya está visible inline (arriba en mobile, sticky en desktop). Duplica un preview ya presente.
**Fix:** quitarlo en mobile (donde el preview ya está a la vista) o reemplazar por "ampliar el preview existente".

### R4 — full_name (privado, facturación) mezclado en "Identidad de tu marca" [MEDIA]
"Tu nombre completo" (facturación/soporte, privado) comparte grid con "Nombre de tu marca" (público) en la card Identidad (BrandSettingsForm.tsx:216-231). Mezcla identidad privada y pública bajo el mismo header "Identidad de tu marca". El kit solo pone "Nombre de la marca" acá (coach-settings.jsx:543).
**Fix:** sacar full_name a Cuenta/Suscripción (dato privado), o separarlo con microcopy claro.

### R5 — Hero de página redundante en standalone [BAJA]
La ruta standalone tiene un hero (tile Palette + h1 "Mi Marca" + descripción 2 líneas, page.tsx:54-67) cuya info se repite abajo. En desktop embebido el título ya lo da el `dt-set-panehd`. Doble encabezado según contexto.
**Fix:** un solo encabezado; en standalone acortar el hero.

---

## 5. Responsive del form

### RSP1 — Grid `1fr_300px` del form dentro del pane angosto de 720px [MEDIA]
BrandSettingsForm usa `lg:grid lg:grid-cols-[1fr_300px]` (BrandSettingsForm.tsx:203) con preview sticky de 300px. En el pane embebido desktop, esto vive dentro de `dt-set-embed` (`max-width:720px`, globals.css:1313). Resultado: form ~380px + preview 300px → columna de form apretada y un segundo preview metido en un contexto ya embebido y estrecho.
**Fix:** en contexto embebido, forzar layout de una columna (sin la columna sticky de 300px) o ampliar el ancho del pane para marca.

### RSP2 — Dos instancias de BrandThemePreview montadas a la vez [BAJA]
`lg:hidden` (mobile, 190-201) + `hidden lg:block` (desktop, 742-753) están ambas en el DOM; solo CSS las oculta. Dos árboles React con estado local propio (tab activo, modo oscuro) que divergen si la ventana se redimensiona.
**Fix:** una sola instancia reubicada por CSS (order/grid) en vez de dos copias.

---

## Resumen de severidades

| # | Finding | Sev |
|---|---------|-----|
| D1 | Loader configurado en dos lugares (Loader animado + Pantalla de carga) | ALTA |
| D2 | Preview de la app x3 + preview propio del avanzado | ALTA |
| D6 | Dos mecanismos de guardado (logo auto vs FAB) | ALTA |
| H1 | Logo por encima del Brand Score (orden invertido vs kit) | ALTA |
| D3 | Toggle claro/oscuro duplicado | MEDIA |
| D4 | Dos "Mensaje de bienvenida" con nombres casi idénticos | MEDIA |
| H2 | Tipografía/Loader partidos y fuera de orden | MEDIA |
| H3 | "Branding avanzado" no colapsable (kit = acordeón) | MEDIA |
| R1 | Cards anidadas (Welcome Modal / Config visualización) | MEDIA |
| R2 | FAB fijo al viewport (flota sobre el SettingsShell) | MEDIA |
| R3 | "Expandir vista" redundante con preview inline | MEDIA |
| R4 | full_name privado mezclado en Identidad de marca | MEDIA |
| RSP1 | Grid 1fr_300px dentro del pane de 720px (apretado) | MEDIA |
| D5 | Mini "Vista previa del botón" duplica el CTA del preview | BAJA |
| R5 | Hero de página redundante en standalone | BAJA |
| RSP2 | Dos instancias de BrandThemePreview montadas a la vez | BAJA |
