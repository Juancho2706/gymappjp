# Informe: QR de invitación brandeado del coach (imprimible, para pegar en el gym)

**Fecha:** 2026-07-04
**Rama:** `feat/redesign-eva-design-system`
**Autor:** Investigación técnica (subagente)
**Alcance:** apps/web (Next.js App Router + Supabase + Tailwind v4)
**Objetivo:** QR de invitación con logo + color de marca del coach, imprimible en A4/carta, con deep-link a su app blanca — hogar natural en Mi Marca (`/coach/settings/brand`) + acceso desde Alumnos.

---

## Resumen ejecutivo (1 párrafo)

La pieza técnica ya está casi toda en el repo: `qrcode.react` v4.2.0 es dependencia viva (usada en `CoachQRButton` de org y en la sección "Compartir con alumnos" de Mi Marca), el deep-link de auto-registro `/join/[invite_code]` existe y funciona (self-service, auto-brandeado), y hay un patrón de página imprimible probado (`/coach/movement/[clientId]/print` con `@media print` + `window.print()`). El feature NO requiere migración de DB (todos los datos ya viven en `coaches`: `invite_code`, `brand_name`, `primary_color`, `logo_url`). El trabajo es 100% presentación: un componente de póster A4 que reúne logo + color + QR con `level="H"` + logo embebido, una ruta de impresión dedicada, y dos disparadores (Mi Marca y Alumnos). El único riesgo real de arquitectura es el **canvas-taint al exportar PNG con el logo cross-origin** (ya hay helper server para resolverlo) y un **hueco de gating**: `/join` no valida `max_clients`, así que un póster público podría dejar auto-registrarse alumnos por encima del límite del plan.

---

## Estado actual (archivos:líneas concretos)

### Flujo de alta de alumno hoy — hay DOS caminos

**Camino A — coach crea la cuenta (privado, con clave temporal):**
- Modal: `apps/web/src/app/coach/clients/CreateClientModal.tsx` — recoge nombre/email/teléfono/clave temporal.
- Acción: `apps/web/src/app/coach/clients/_actions/clients.actions.ts` → `createClientAction`. **Valida `max_clients`** y devuelve `upgradeRequired` cuando se alcanza el límite (`CreateClientModal.tsx:120-166`).
- Tras crear, muestra CTA de WhatsApp con `state.loginUrl` (`CreateClientModal.tsx:73-118`). El link que comparte apunta al **login** del alumno.
- Se dispara desde varios puntos del directorio: `ClientsDirectoryClient.tsx:323`, `CoachRosterMasterDetail.tsx:310`, `CoachWarRoom.tsx:469`, `ClientsDirectoryEmpty.tsx:42`.

**Camino B — auto-registro self-service (público, deep-link):** ESTE es el relevante para un póster de gym.
- Ruta pública: `apps/web/src/app/join/[invite_code]/page.tsx` — resuelve el scope del código y pinta la marca (logo/color/mensaje) del coach/team/org.
- Resolución de scope: `apps/web/src/app/join/[invite_code]/_lib/resolve-invite.ts` → `resolveInvite()`. Un `invite_code` **codifica el scope**: `coaches.invite_code` → standalone; `teams.invite_code` → pool; `organization_members.invite_code` → enterprise. Devuelve `brandName`, `primaryColor`, `logoUrl`, `loginHref`.
- Form + acción: `_components/JoinForm.tsx`, `_actions/join.actions.ts` → `joinViaInviteAction` (service-role, crea `auth.user` + fila `clients` con el scope resuelto). **NO valida `max_clients`** (a diferencia del Camino A) — ver Riesgos.

**Qué URL abre el alumno invitado hoy, según el punto:**
- Mi Marca "Compartir con alumnos": QR + link apuntan a `https://eva-app.cl/c/{identificador}/login` (**login**, no join) — `BrandSettingsForm.tsx:194,214-216,697-698`.
- Org (admin de organización): `CoachQRButton.tsx:16` apunta a `/join/{inviteCode}` (**auto-registro**).
- Team hero: `TeamShareLink.tsx:58` ofrece login (`/t/{slug}/login`) **y** código de invitación (`/join/{code}`).
- WhatsApp del Camino A: `state.loginUrl` (**login**).

> **Discrepancia a resolver:** hoy conviven dos destinos. Para un póster pegado en el gym (lo escanea un prospecto SIN cuenta) el destino correcto es **`/join/[invite_code]`** (se auto-registra y ve la marca), no `/c/{slug}/login` (asume cuenta existente). El task pide "deep-link a su `/c/[coach_slug]`"; nótese que `invite_code` ES el identificador público (`getCoachPublicIdentifier` resuelve `invite_code || slug`, `apps/web/src/lib/coach/public-identifier.ts:6-8`), así que `/join/[invite_code]` y `/c/[invite_code]/login` comparten el mismo código corto. Recomendación: **join**. (Pregunta CEO abajo.)

### QR: qué hay instalado y cómo se usa

- **Dependencia viva:** `qrcode.react": "^4.2.0"` en `package.json` (raíz). **JS/TS puro, sin postinstall** → cumple la política pnpm `allowBuilds` sin tocar nada.
- Uso actual con `QRCodeSVG`:
  - `apps/web/src/app/coach/settings/BrandSettingsForm.tsx:18,214-216` → `<QRCodeSVG value={studentUrl} size={96} level="M" />` (SIN logo, `level="M"`).
  - `apps/web/src/app/org/[slug]/coaches/_components/CoachQRButton.tsx:4,47` → `<QRCodeSVG value={joinUrl} size={200} level="M" />` (modal, botón copiar, SIN logo).
- **`jspdf": "^4.2.1"`** también instalado (dossier de ficha #106: `apps/web/src/lib/pdf/client-dossier-pdf.ts`; PDFs de nutrición/reportes).

### Mi Marca — estructura actual (hogar natural)

- Página: `apps/web/src/app/coach/settings/brand/page.tsx`. Gate: `getTierCapabilities(tier).canUseBranding`; free tier cae a `<BrandUpsell>` (`page.tsx:27-40`); `org_managed`/`team_managed` redirigen fuera (`page.tsx:20-21`).
- Form: `apps/web/src/app/coach/settings/BrandSettingsForm.tsx`. Ya tiene una **sección "Compartir con alumnos"** con QR + link + `invite_code` en mono (`:686-734`) — es el lugar exacto donde encaja el póster imprimible.

### Patrón de impresión existente (para reusar)

- **Ruta imprimible dedicada** (patrón recomendado): `apps/web/src/app/coach/movement/[clientId]/print/page.tsx` — RSC que fetchea data y renderiza cuerpo con `@media print { @page { margin: 14mm } }` inline (`:24-29`).
- Cuerpo: `apps/web/src/app/coach/movement/_components/MovementPrintReport.tsx` — 'use client', logo del contexto (`next/image`), botón `window.print()` con `print:hidden` (`:45-52`), estilo claro fijo independiente de dark mode. Marca del contexto (team/coach), nunca EVA hardcodeado.
- `globals.css:1031-1038` — `@media print` ya oculta el `aside` del `.coach-layout-container` (chrome del coach fuera al imprimir).
- Print de programas: `apps/web/src/app/coach/builder/[clientId]/components/PrintProgramDialog.tsx`.
- **Helper server para logo → dataURL (clave para PNG/canvas):** `apps/web/src/lib/nutrition-pdf-logo.server.ts` → `resolveBrandLogoDataUrlServer(logoUrl)` fetchea el logo del bucket público `logos` server-side (sin CORS), valida content-type raster, límite 3 MB, y devuelve `data:...;base64,...` o `null`. Reutilizable tal cual.

---

## Investigación web 2026 (fuentes)

1. **`qrcode.react` v4 API** (embebido de logo + export): props `value`, `size`, `level` (L/M/Q/H), `bgColor`, `fgColor`, `marginSize`, `title`, y `imageSettings` con `{ src, height, width, excavate, x, y, opacity, crossOrigin }`. Export a PNG: renderizar `QRCodeCanvas` y `canvas.toDataURL('image/png')` desde un ref. Sin dependencias nativas. — GitHub `zpao/qrcode.react` y demo oficial https://zpao.github.io/qrcode.react/
2. **qrcode vs qr-code-styling**: para el 95% de casos `qrcode`/`qrcode.react` es la elección correcta; `qr-code-styling` solo aporta si necesitás puntos redondeados/gradientes y **requiere canvas + jsdom en Node** (más peso/riesgo). El headroom de corrección de error (~30% en `H`) es exactamente lo que explota el logo embebido. — https://npm-compare.com/qr-code-styling,qr-image,qrcode,qrcode-generator,react-qr-code y https://www.grizzlypeaksoftware.com/articles/p/qr-code-generator-using-nodejs-the-complete-2026-guide-y7TytT
3. **Nivel de corrección con logo**: `L` suele quedar ILEGIBLE; `M` es default y suele bastar; con logo overlay hay que subir a `Q`/`H`. — mismo Grizzly Peak 2026 guide.
4. **Impresión A4 / póster**: usar `@page { size: A4 }` (210×297mm) + márgenes; `window.print()` → PDF del navegador es el "gold standard" para pósters (preserva vector/fuentes), por encima de PNG (los PNG son para pantalla y no exportan limpio a tamaños grandes). — MDN `@page/size` https://developer.mozilla.org/en-US/docs/Web/CSS/@page/size ; Print CSS cheatsheet https://www.customjs.space/blog/print-css-cheatsheet/ ; comparativa de formatos de impresión https://www.printrunner.com/blog/choosing-the-right-file-type-for-printing/
5. **Descarga PNG del QR en React**: patrón `QRCodeCanvas` + ref → `toDataURL('image/png')` → `<a download>` (o `image/octet-stream`). Consistente 2022-2026. — https://dev.to/anshsaini/how-to-download-fancy-qr-codes-with-react-b25 y https://cluemediator.com/generate-and-download-a-qr-code-image-in-react

**Conclusión de librería:** NO agregar `qr-code-styling`. Usar `qrcode.react` (ya instalado): `QRCodeSVG` con `level="H"` + `imageSettings` para el póster vectorial (impresión nítida) y `QRCodeCanvas` oculto para el botón "Descargar PNG".

---

## Diseño propuesto (arquitectura por capas)

### Decisiones de producto que fija el diseño

- **Destino del deep-link:** `/join/[invite_code]` (auto-registro brandeado). Es la única URL correcta para un prospecto sin cuenta.
- **Formato imprimible:** **ruta de impresión dedicada + `window.print()`** (patrón `movement/print`), NO jsPDF. Razones: (a) el póster es HTML/CSS con QR vectorial → impresión nítida y fiel a la marca; (b) jsPDF es raster y armar un A4 por coordenadas es mucho más trabajo que print-CSS; (c) web 2026 confirma window.print()→PDF como estándar de pósters. **Complemento:** botón "Descargar PNG" (QRCodeCanvas ref) para reusar el QR con logo en Canva/Instagram.
- **Datos:** cero DB nueva. Todo vive en `coaches` (`invite_code`, `brand_name`, `primary_color`, `logo_url`, `logo_url_dark`). **Sin migración → sin problema de GRANT UPDATE.**
- **Gating:** el póster **brandeado** (logo + color) es feature de branding → detrás de `canUseBranding` (Pro). Como vive en Mi Marca, hereda el gate de la página (free tier ya cae a `BrandUpsell`). Para el acceso desde Alumnos: mostrar el póster brandeado solo si Pro; el free tier ve el QR plano o el upsell (decisión CEO).

### Capa de datos (`_data`) — reusar, no crear
- Mi Marca ya trae el coach completo vía `getCoachSettingsForUser()` (`apps/web/src/app/coach/settings/_data/settings.queries.ts`). La ruta de impresión puede fetchear con el mismo query o con `getCoach()` (`apps/web/src/lib/coach/get-coach.ts`) — necesita `invite_code`, `brand_name`, `primary_color`, `logo_url`, `logo_url_dark`, `subscription_tier`.
- El `appUrl`/host se arma como en `clients/page.tsx:52-55` (headers `host` + protocolo) o con `NEXT_PUBLIC_SITE_URL`.

### Capa server (helper)
- Reusar `resolveBrandLogoDataUrlServer()` (`lib/nutrition-pdf-logo.server.ts`) para pasar el logo como **data-URI base64** al póster. Esto evita el canvas-taint en la exportación PNG (el `<canvas>` no queda "tainted" porque el logo es same-origin data-URI, no una URL cross-origin del bucket). Este es el punto de arquitectura más importante.

### Capa presentación (componentes nuevos)
Ubicación sugerida (feature-first, module pattern): sub-ruta de Mi Marca.
```
apps/web/src/app/coach/settings/brand/qr/
├── print/page.tsx                 # RSC: fetch coach + logo dataURI, gate canUseBranding, render póster A4
└── _components/
    ├── InviteQrPoster.tsx         # 'use client' — póster A4 (logo, headline, QR level H + logo, invite_code, footer) + window.print() + Descargar PNG
    └── InviteQrExport.tsx         # 'use client' — QRCodeCanvas oculto + ref → toDataURL('image/png') → <a download>
```
Componente reutilizable transversal (opcional, DRY): un `BrandedInviteQr` (molecule) que encapsule `QRCodeSVG level="H" imageSettings={logo}` con reglas de contraste, y que **también** reemplace la duplicación de `CoachQRButton` (org) y del QR de `BrandSettingsForm`. Solo moverlo a `components/molecules/` si se usa en 3+ domains (regla Atomic Design del CLAUDE.md); por ahora vive en el feature.

**Contenido del póster A4 (`InviteQrPoster`):**
- Header: logo de marca (`next/image` o data-URI) + `brand_name`.
- Headline grande: "Escaneá para unirte a {brand_name}" (i18n vía `LanguageContext`, como `MovementPrintReport`).
- QR central grande (≈ 60mm), `level="H"`, `imageSettings={{ src: logoDataUri, height, width, excavate: true }}`, `fgColor` oscuro (near-black) por scannability, `bgColor="#fff"`.
- El `invite_code` en mono + la URL corta `eva-app.cl/join/{code}` como fallback tipeable.
- Color de marca en acentos del póster (borde, headline, franja), NO en los módulos del QR.
- Botones `print:hidden`: "Imprimir" (`window.print()`) y "Descargar PNG".
- `@media print { @page { size: A4; margin: 0 } }` + fondo blanco fijo (independiente de dark mode). En pantalla, preview responsive (max-width + scale), `min-h-dvh` (nunca `h-screen` fuera de `md:`).

### Disparadores (dónde vive la UI)
1. **Mi Marca (primario):** en la sección "Compartir con alumnos" de `BrandSettingsForm.tsx:686-734`, agregar un botón "Cartel para tu gym / QR imprimible" que abre `/coach/settings/brand/qr/print` (o un modal preview → print). Actualizar de paso el QR de esa sección para que apunte a `/join/[invite_code]` (hoy va a `/login`) y suba a `level="H"` si se le mete logo.
2. **Alumnos (secundario):** junto a los disparadores de `CreateClientModal` (`ClientsDirectoryClient.tsx:323`, `CoachRosterMasterDetail.tsx:310`, `CoachWarRoom.tsx:469`, `ClientsDirectoryEmpty.tsx:42`), añadir una acción "QR de invitación" → misma ruta de impresión. El shell ya baja `coach.invite_code` + `appUrl` (`CoachClientsShell.tsx:19`, `clients/page.tsx:52`).

---

## Tareas atómicas estimadas (S/M/L)

| # | Tarea | Tamaño | Notas |
|---|-------|--------|-------|
| 1 | SPEC.md + PLAN.md + TASKS.md en `specs/coach-invite-qr/` (SDD obligatorio, feature nueva) | S | Templates en `specs/_templates/`. |
| 2 | `InviteQrPoster.tsx` ('use client'): layout A4, headline i18n, QR `level="H"` + `imageSettings` logo, invite_code mono, acentos de color, `window.print()`, `@page A4` | **L** | Núcleo visual; cuidar contraste y `min-h-dvh`. |
| 3 | Ruta `qr/print/page.tsx` (RSC): fetch coach (reusar `getCoachSettingsForUser`), gate `canUseBranding`, resolver logo → data-URI con `resolveBrandLogoDataUrlServer`, armar `joinUrl` | M | Redirect/upsell para free tier igual que la page de Mi Marca. |
| 4 | `InviteQrExport.tsx` — `QRCodeCanvas` oculto + ref → `toDataURL('image/png')` → `<a download>` (botón "Descargar PNG") | M | Verificar que el canvas NO queda tainted (logo data-URI). |
| 5 | Disparador en "Compartir con alumnos" de `BrandSettingsForm.tsx` + corregir destino del QR existente a `/join/[invite_code]` y subir a `level="H"` | S | Un botón + cambio de `value`/`level`. |
| 6 | Disparador "QR de invitación" en el directorio de Alumnos (cerca de "Agregar alumno") | S | Reusar `coach.invite_code`/`appUrl` que ya bajan. |
| 7 | (Opcional DRY) Extraer `BrandedInviteQr` molecule y refactor de `CoachQRButton` (org) + QR de Mi Marca a usarlo | M | Solo si se decide consolidar; no bloquea. |
| 8 | Gate/decisión de límite: chequear `max_clients` en `joinViaInviteAction` (o restringir póster público a tiers pagos) — cerrar el hueco de auto-registro sobre el límite | M | Ver Riesgos; toca `join.actions.ts` (money-safety). |
| 9 | Copy/i18n del póster (es-CL + en si aplica) vía `LanguageContext` | S | Espejar patrón de `MovementPrintReport`. |
| 10 | QA de impresión real (Chrome/Safari print-to-PDF A4), escaneo del QR con logo desde teléfono, y smoke de PNG | M | Verificar scannability con `level="H"` + logo a tamaño real. |
| 11 | Docs: actualizar `docs/architecture/FLOWS_AND_COMPONENTS.md` (ruta nueva) | S | Regla de docs del CLAUDE.md. |

---

## Riesgos y gotchas

1. **Canvas-taint al exportar PNG (crítico).** Embeber el logo del bucket `logos` (cross-origin) en un `<canvas>` y llamar `toDataURL()` lanza `SecurityError` (canvas tainted) salvo CORS correcto. **Mitigación ya disponible:** pasar el logo como **data-URI base64** resuelto server-side con `resolveBrandLogoDataUrlServer()` (`lib/nutrition-pdf-logo.server.ts`). Con SVG (impresión) el taint no aplica, pero rasterizar un SVG con `<image href>` cross-origin también tainta → la data-URI es la ruta robusta para ambos.
2. **Hueco de gating / money-safety (importante).** `joinViaInviteAction` (`join.actions.ts:17-95`) **no valida `max_clients`** — el Camino A (CreateClientModal) sí lo hace y devuelve `upgradeRequired`. Un póster público con `/join` deja auto-registrarse alumnos **por encima del límite del plan** (free = 3) sin gate → posible overage silencioso / fuga de upgrade. Recomendación: agregar chequeo de límite en `joinViaInviteAction` o limitar el póster a tiers pagos. (Ver Pregunta CEO 3.)
3. **Scannability con logo + color.** Con logo embebido hay que usar `level="H"` (30% ECC) + `excavate:true`. El QR de Mi Marca hoy usa `level="M"` size 96 sin logo — subir a `H` al meter logo. Mantener los **módulos del QR oscuros** (near-black) y usar el color de marca solo en el chrome del póster; un `fgColor` claro (pastel/amarillo) baja el contraste y rompe el escaneo. Enforce contraste mínimo.
4. **Destino inconsistente (`/join` vs `/login`).** Hoy Mi Marca apunta a `/login` y org/team a `/join`. Un póster debe ir a `/join` (prospecto sin cuenta). Alinear también el QR existente de Mi Marca para no dejar dos comportamientos.
5. **Regla `<Image>` vs `<img>` cruda.** El CLAUDE.md prohíbe `<img>`. `qrcode.react` maneja el logo internamente vía `imageSettings.src` (OK). El logo del header del póster debe ir con `next/image` o data-URI; nótese que `/join/page.tsx:40-41` usa `<img>` con eslint-disable como precedente — evitarlo en el póster salvo necesidad de canvas.
6. **Print CSS y viewport.** Ruta dedicada = evita el chrome del coach. En pantalla usar `min-h-dvh`/`h-dvh` (nunca `h-screen` fuera de `md:`). `@page { size: A4; margin: 0 }` + fondo blanco fijo (ignorar dark mode en el área imprimible, como `MovementPrintReport`).
7. **`invite_code` puede faltar en coaches legacy.** Se garantiza vía `ensureCoachPublicCode()` (`app/coach/_data/public-code.queries.ts`) llamado desde el layout de `/coach`. El póster debe manejar `invite_code` nulo (fallback a `slug` vía `getCoachPublicIdentifier`, o forzar generación antes de imprimir).
8. **`org_managed` / `team_managed`.** Mi Marca redirige estos contextos (`brand/page.tsx:20-21`). El póster brandeado del coach standalone no aplica a estos; en team/org la marca es del team/org (patrón ya resuelto por `resolveInvite` y `CoachQRButton`). Definir si el póster se ofrece también en esos contextos (fuera del alcance inicial recomendado).
9. **Peso/deps.** Cero dependencias nuevas si se usa `qrcode.react`. Agregar `qr-code-styling` metería canvas/jsdom y ruido de `allowBuilds` — no hacerlo.

---

## Preguntas para el CEO

1. **Destino del QR:** ¿el póster deep-linkea a `/join/[invite_code]` (el prospecto se auto-registra y ve tu marca — recomendado para pegar en el gym) o a `/c/[slug]/login` (asume cuenta ya creada)?
2. **Gating del póster brandeado (logo+color):** ¿solo Pro (`canUseBranding`), y el free tier ve QR plano / upsell? ¿O QR plano imprimible para todos y branded solo Pro?
3. **Límite de plan en auto-registro:** hoy `/join` NO valida `max_clients`. Con un póster público, ¿bloqueamos el auto-registro al superar el límite (free=3) o lo dejamos abierto (overage)? Es una decisión de dinero.
