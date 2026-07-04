# SPEC — White-label R2: quick-wins de marca del coach

**Feature:** `whitelabel-r2`
**Branch:** `feat/redesign-eva-design-system` (off `master`)
**Fecha:** 2026-07-04
**Estado:** Aprobado por CEO (decisiones bloqueadas — ver §3). NO reabrir.

> ## ⚠️ CAMBIO DE ALCANCE (CEO, 2026-07-04) — supersede sobre §3/§4/§6
> 1. **Workstream C DIFERIDO ENTERO** (póster QR imprimible, descarga PNG, alinear Mi Marca a `/join`): el CEO no quiere promover el auto-registro de alumnos. C-D1..C-D5 y AC-C1..AC-C6 **no aplican**.
> 2. **C-P0 REEMPLAZADO por C-KILL — apagar el auto-registro standalone:** en vez de validar el límite, `/join/[invite_code]` con código de coach **standalone** deja de crear cuentas (página y action responden "El registro directo está desactivado — pedile a tu coach que te agregue"). Los flujos **team y org QUEDAN** funcionando igual. Esto cierra el hueco de `max_clients` de raíz: el flujo real actual es que el coach agrega alumnos manualmente desde el menú Alumnos (confirmado por CEO). AC-P0-1..4 se reemplazan por: (a) código standalone → no se crea `auth.user` ni fila `clients`, se muestra el mensaje; (b) código team/org → flujo intacto (tests de las 3 ramas); (c) verificar y REPORTAR si el path team valida `seat_limit` (si no lo valida, anotarlo como P1, no implementarlo en esta tanda).
> 3. **B sin QR:** el footer de las share-cards NO lleva QR (dependía de `/join`). Footer = marca + CTA de texto "Entrená con {marca}" + URL corta `eva-app.cl/c/{slug}` + regla "vía EVA" por tier tal cual hoy. B-D6/B-D7/B-D8 mueren; el plumbing `x-coach-invite-code` (T1) y `lib/qr.ts` (T8) **no se construyen**. AC-B4/B6/B7/B9 se reinterpretan sin QR.
> 4. **Directiva de diseño (CEO):** todo UI nuevo debe ser creativo, bonito y profesional, complementando el EVA DS vigente; investigar referencias visuales 2026 (Dribbble/apps líderes) antes de implementar cada pieza de UI.
**Informes fuente (fuente de verdad, con archivos:líneas):**
- `docs/audits/fase-l-wl2/informe-pwa-install-brandeada.md`
- `docs/audits/fase-l-wl2/informe-share-cards.md`
- `docs/audits/fase-l-wl2/informe-qr-invitacion.md`

---

## 1. Qué y por qué

Tres quick-wins que hacen que la marca del coach viaje más lejos y que el loop de captación del alumno funcione, agrupados en un mismo feature porque comparten plumbing (`invite_code` del coach hacia el alumno, QR brandeado, destino `/join/[invite_code]`). Todo el trabajo es **presentación + plumbing de headers**; no requiere DB nueva (la única RPC candidata queda como fast-follow fuera de alcance). Los datos de marca ya viven en `coaches`/`teams`/`organizations` y ya se resuelven server-side.

Los tres workstreams:

- **A — Instalación PWA brandeada.** El manifest, splash e ícono ya están brandeados server-side, pero el **prompt visible** de instalación (A2HS) dice "Instalar EVA" en verde EVA para el alumno de **cualquier** coach. Objetivo: que el prompt muestre la marca del coach, aparezca en un momento de valor (no al primer render), y que Android dispare la Richer Install UI (requiere `screenshots` en el manifest).
- **B — Share-cards de racha + resumen mensual.** Hoy el alumno puede compartir una card de "progreso" y de "record personal" (vía canvas cliente). Objetivo: sumar plantillas **Racha** y **Resumen mensual**, unificarlas bajo un selector, y **embeber el QR de invitación del coach** en el footer de toda card compartida (loop de referidos).
- **C — QR de invitación imprimible + hardening del límite de plan.** Objetivo: un póster A4 imprimible con QR brandeado (logo + color del coach) que deep-linkea a `/join/[invite_code]` para que un prospecto sin cuenta se auto-registre viendo la marca. Incluye el **P0 money-safety**: `joinViaInviteAction` hoy NO valida el límite de plan del coach → un póster público deja auto-registrar alumnos por encima de `max_clients`.

## 2. Usuarios

- **Primario (A, B):** alumno del coach (instala la PWA brandeada; comparte cards con el QR de su coach).
- **Primario (C):** coach standalone Pro+ (imprime el póster para pegarlo en el gym; comparte el QR).
- **Secundario:** prospecto sin cuenta que escanea el QR y cae en `/join/[invite_code]`.
- **Interno/operador:** el CEO / soporte, que necesita que el límite de plan no se pueda saltar por el funnel público (money-safety).

## 3. Decisiones bloqueadas (delegadas por el CEO — NO reabrir)

### Workstream A — PWA
- **A-D1** — **Hook único `useInstallPrompt()`**: mata el doble listener de `beforeinstallprompt` (hoy lo capturan por separado `InstallPrompt.tsx` y `PwaNavButton.tsx`). Fuente única de verdad de `deferredPrompt`, tipado fuerte, escucha `appinstalled`.
- **A-D2** — **Prompt brandeado** leyendo `data-*` del wrapper del layout `/c` (que ya expone `data-brand-name`; se agregan `data-primary-color` y `data-logo-url`). El manifest queda **fuera del matcher del proxy** y resuelve su marca vía Supabase (patrón actual, no depender de headers del proxy).
- **A-D3** — **Screenshots del manifest generadas con `next/og`** (mismo patrón que `/api/splash`), aspect ratio **uniforme** por código. **PROHIBIDO usar Supabase `render/image`** (cuota agotada — incidente conocido).
- **A-D4** — **Gating del prompt** a "primer workout completado" (señal en `localStorage`, sin DB) + **entrada manual "Instalar la app" siempre visible** en el perfil del alumno.
- **A-D5** — Escuchar `appinstalled` (ocultar + persistir tras instalar).
- **A-D6** — **Hoja de instrucciones iOS** con detección `display-mode: standalone` (no mostrarla si ya está instalada); copy alineado al flujo iOS 26.
- **A-D7** — **ELIMINAR `AppDownloadBanner` de `/c`** (apunta a una App Store / Google Play inexistentes; decisión CEO previa "app-promos fuera").
- **A-D8** — **NO romper** `crossOrigin="use-credentials"` del `<link rel="manifest">` (load-bearing: sin cookies el manifest colapsa team/org a marca de coach).

### Workstream B — Share-cards
- **B-D1** — **Vía canónica = canvas CLIENT-SIDE** (`lib/workout-pr-card-canvas.ts`), consistente con `renderProgressCardToBlob`. Zero-server, sin cuota de render/imagen.
- **B-D2** — **Selector único de plantilla**: Progreso / Racha / Resumen mensual (un solo trigger que abre el selector, no botones sueltos).
- **B-D3** — **Datos desde RPCs existentes**: racha `get_client_current_streak`; sesiones `get_client_workout_day_counts`; volumen `get_client_daily_tonnage`. Todos ya con GRANT a `authenticated` y guard IDOR 3-vías.
- **B-D4** — **Resumen mensual v1 SIN conteo de PRs.** La RPC aditiva de PRs-del-mes (`get_client_month_pr_count`) es **FAST-FOLLOW fuera de alcance**.
- **B-D5** — **Dedupe de la card de record duplicada hacia la vía canvas**: el flujo del alumno usa canvas; el footer se unifica en un helper compartido. El endpoint servidor `/api/pr-card` se conserva **solo** para el flujo coach-comparte-record-de-alumno (no se porta a canvas).
- **B-D6** — **Footer con QR de invitación + CTA "Escanea para entrenar con {marca}"**, manteniendo la regla de co-branding **"vía EVA" por tier TAL CUAL existe hoy** (no inventar gating nuevo). El QR aparece para **todos** los tiers (el funnel de registro no es feature pago).
- **B-D7** — **`invite_code` llega al alumno** vía header del proxy (`x-coach-invite-code`) + `data-invite-code` del layout `/c`.
- **B-D8** — **QR como data-URL** (no `http`) para no tintar el canvas (`toBlob()`/CORS).
- **B-D9** — **Mes filtrado en TZ `America/Santiago`** (misma zona que agregan los RPCs), reutilizando helpers de `lib/date-utils`.

### Workstream C — QR imprimible + hardening
- **C-D1** — **Destino del QR = `/join/[invite_code]`** (auto-registro brandeado). **Alinear** el QR/link de Mi Marca que hoy apunta a `/login`.
- **C-D2** — **`qrcode.react`** (ya dependencia), `level="H"`, **logo embebido** vía `imageSettings` con **data-URI resuelto server-side** por `resolveBrandLogoDataUrlServer()` (evita canvas-taint). Módulos del QR oscuros; el color de marca solo en el chrome del póster.
- **C-D3** — **Póster A4 imprimible** con `@page { size: A4 }` + `window.print()` (patrón `coach/movement/[clientId]/print`) + botón **"Descargar PNG"** (`QRCodeCanvas` oculto → `toDataURL`).
- **C-D4** — **UI**: sección "Compartir" en Mi Marca (`/coach/settings/brand`) + acceso desde Alumnos.
- **C-D5** — **SIN gating por tier** para el QR/póster de invitación (el funnel de captación no es feature pago). El branding del póster (logo/color) hereda el gate de la página de Mi Marca donde vive, pero el QR de invitación en sí no se gatea.

### Workstream C — P0 money-safety (va PRIMERO, independiente del resto)
- **C-P0** — `joinViaInviteAction` (`apps/web/src/app/join/[invite_code]/_actions/join.actions.ts`, insert ~línea 55) **NO valida el límite de plan del coach**. Contar alumnos activos vs `max_clients` efectivo **ANTES** del insert (scope standalone; para team usar su `seat_limit`, para org su límite propio si existe). Si está lleno → mensaje claro al alumno ("este coach no tiene cupos disponibles") + **notificar al coach** (push/email existentes) con CTA de upgrade. Reutilizar la misma lógica de conteo/límite efectivo que `createClientAction` para no divergir.

## 4. Alcance

### In-scope
- **A:** hook único de instalación; prompt brandeado en `/c`; gating por primer workout; entrada manual en perfil; `appinstalled`; hoja iOS con detección standalone; `screenshots`+`id`+`orientation` en manifest per-coach y default vía `next/og`; eliminar `AppDownloadBanner` de `/c`.
- **B:** plumbing de `invite_code` (proxy → layout → canvas); `drawBrandFooter` compartido con QR + CTA; plantillas Racha y Resumen mensual (v1 sin PRs); selector único; dedupe del record card del alumno hacia canvas; `_data` de recap mensual respetando capas; `lib/qr.ts` (data-URL) usando la dep existente.
- **C:** póster A4 imprimible con QR brandeado (logo data-URI); ruta de impresión dedicada; "Descargar PNG"; disparadores en Mi Marca y Alumnos; alinear destino a `/join`; **P0** de límite de plan en `joinViaInviteAction`.

### Fuera de alcance (Non-Goals)
- **RPC `get_client_month_pr_count`** y el conteo de PRs en el resumen mensual → **fast-follow** (B-D4). El recap v1 muestra Sesiones + Volumen + Racha.
- **Portar el flujo coach-comparte-record (`/api/pr-card`) a canvas** o unificarlo por completo. Se conserva server-side; el dedupe (B-D5) aplica solo al flujo del alumno. Que la invitación viaje también en el flujo coach queda fuera (nota de deuda).
- **Extraer un molecule `BrandedInviteQr`** y refactorizar `CoachQRButton` (org) / el QR de `BrandSettingsForm` a un componente común (DRY opcional). No bloquea; se difiere.
- **Analítica del funnel de instalación** (eventos PostHog `pwa_install_*`). Opcional; fuera de v1.
- **Capturas reales del producto** para los `screenshots` del manifest (pipeline Playwright). v1 usa imágenes brandeadas `next/og`.
- **Enterprise (`/org`)**: no hay un `invite_code` único por org → esas cards/QR caen al fallback `/c/{slug}` (o sin QR). Prioridad baja (enterprise archivado comercialmente); no bloquea.
- **`AppOnlyPopup.tsx`** en pantallas del coach (no en `/c`): no se toca en este feature.
- **Persistir server-side el estado del prompt** (todo el gating es `localStorage`). Sin DB → sin gotcha de `GRANT UPDATE(col)`.

## 5. User Stories

**A — PWA**
- Como **alumno de un coach Pro**, quiero que el aviso para instalar la app muestre el logo, color y nombre de mi coach, para reconocerla como "su" app y no como EVA genérico.
- Como **alumno**, quiero que el aviso de instalar aparezca recién cuando ya usé la app (tras mi primer entreno), y poder instalarla a mano desde mi perfil cuando quiera, para no ser interrumpido de entrada.
- Como **alumno de Android**, quiero ver un diálogo tipo app-store (con imagen y descripción) al instalar, para confiar en lo que estoy agregando.
- Como **alumno de iPhone**, quiero instrucciones claras para "Añadir a inicio" cuando no hay prompt automático, y no verlas si ya la tengo instalada.

**B — Share-cards**
- Como **alumno**, quiero compartir mi **racha** y mi **resumen del mes** como una imagen linda con la marca de mi coach, para presumir mi progreso.
- Como **alumno**, quiero que cada card que comparto lleve el QR de invitación de mi coach con un "Escanea para entrenar con {marca}", para que un amigo pueda sumarse.
- Como **coach**, quiero que cuando mis alumnos comparten, se vea mi marca y mi QR, para captar alumnos nuevos sin esfuerzo.

**C — QR imprimible + límite**
- Como **coach**, quiero un cartel A4 con mi QR brandeado para pegar en el gym, que al escanearse lleve al prospecto a registrarse viendo mi marca.
- Como **coach**, quiero imprimir el cartel y también descargar el QR como PNG para usarlo en redes.
- Como **CEO/operador**, quiero que nadie se auto-registre por el QR/`/join` por encima del límite del plan del coach, para no regalar cupos ni perder upgrades.
- Como **prospecto sin cuenta**, quiero un mensaje claro si el coach no tiene cupos, en vez de un error, y que el coach se entere para poder ampliar.

## 6. Criterios de aceptación

### Workstream A
- [ ] **AC-A1** — Bajo `/c`, el prompt de instalación muestra `brand_name`, `logo_url` y `primary_color` del coach (Pro+); en free/starter cae a EVA system. Fuera de `/c` (landing, `/coach`) sigue EVA.
- [ ] **AC-A2** — Existe un único listener de `beforeinstallprompt` (hook `useInstallPrompt`); `InstallPrompt` y `PwaNavButton` lo consumen sin duplicar captura ni usar `any`.
- [ ] **AC-A3** — El prompt NO aparece en el primer render; aparece tras "primer workout completado" (señal `localStorage`). La entrada "Instalar la app" está **siempre** visible en el perfil del alumno.
- [ ] **AC-A4** — Al instalar, `appinstalled` oculta el prompt y persiste el estado (no reaparece).
- [ ] **AC-A5** — En iOS, la hoja de instrucciones NO se muestra si `display-mode: standalone` (ya instalada); el copy referencia el flujo iOS 26.
- [ ] **AC-A6** — El manifest per-coach y el default incluyen `screenshots` (`form_factor: "narrow"`, aspect ratio uniforme, PNG/JPEG), `id` estable y `orientation`. En Android Chrome aparece la Richer Install UI.
- [ ] **AC-A7** — Las screenshots se generan con `next/og` (server-side, PNG), **sin** tocar `render/image` de Supabase.
- [ ] **AC-A8** — `AppDownloadBanner` ya no se renderiza en `/c`.
- [ ] **AC-A9** — El `<link rel="manifest">` conserva `crossOrigin="use-credentials"`; team/org siguen resolviendo su marca correctamente.

### Workstream B
- [ ] **AC-B1** — Desde el perfil del alumno, un único trigger abre un selector con Progreso / Racha / Resumen mensual; cada uno genera su PNG 1080×1350 vía canvas cliente.
- [ ] **AC-B2** — La card de **Racha** usa la racha real (`get_client_current_streak`, ya en perfil); el copy dice "días seguidos activo" (racha = entreno **o** nutrición, no solo gym).
- [ ] **AC-B3** — El **Resumen mensual** muestra Sesiones y Volumen del mes calendario en TZ `America/Santiago`; v1 **sin** conteo de PRs.
- [ ] **AC-B4** — Toda card compartida (record, progreso, racha, mensual) lleva el footer con QR de `/join/[invite_code]` + CTA "Escanea para entrenar con {marca}" + código legible. El QR aparece para todos los tiers.
- [ ] **AC-B5** — El co-branding "vía EVA" se mantiene exactamente como hoy por tier (sin gating nuevo).
- [ ] **AC-B6** — El QR se dibuja desde un `data:` URL; `toBlob()` no lanza (canvas no tainted). Si el logo del coach falla por CORS, la card se genera igual (QR intacto).
- [ ] **AC-B7** — `invite_code` llega al canvas vía `x-coach-invite-code` (proxy) → `data-invite-code` (layout) → `readShareCardBrand()`; con fallback a `data-coach-slug` si no hay código.
- [ ] **AC-B8** — El recap mensual respeta la capa `_data → (service/RPC del patrón vigente del módulo)`; sin `SELECT *`; TZ Santiago consistente.
- [ ] **AC-B9** — El QR del recuadro blanco escanea desde otra pantalla en tema claro y oscuro (contraste ≥ 4:1, quiet-zone).

### Workstream C
- [ ] **AC-C1** — El póster A4 muestra logo + `brand_name` + headline i18n + QR `level="H"` con logo embebido (data-URI) + `invite_code` en mono + URL `eva-app.cl/join/{code}`.
- [ ] **AC-C2** — "Imprimir" abre `window.print()` con `@page { size: A4 }` y fondo blanco fijo (ignora dark mode en el área imprimible); el chrome del coach queda oculto al imprimir.
- [ ] **AC-C3** — "Descargar PNG" exporta el QR sin `SecurityError` (canvas no tainted por logo data-URI).
- [ ] **AC-C4** — El QR y el link de Mi Marca apuntan a `/join/[invite_code]` (ya no a `/login`); el póster es accesible desde Mi Marca y desde Alumnos.
- [ ] **AC-C5** — El QR/póster de invitación NO se gatea por tier (branding del póster hereda el gate de la página, pero el QR de captación aparece).
- [ ] **AC-C6** — Maneja `invite_code` nulo en coaches legacy (fallback a slug vía `getCoachPublicIdentifier` o forzar generación).

### Workstream C — P0
- [ ] **AC-P0-1** — `joinViaInviteAction` cuenta alumnos activos vs límite efectivo **antes** del insert (standalone: `coaches.max_clients`; team: `teams.seat_limit`; org: su límite si existe), con la misma semántica de conteo que `createClientAction`.
- [ ] **AC-P0-2** — Si está lleno, el alumno ve un mensaje claro ("este coach no tiene cupos disponibles") y NO se crea `auth.user` ni fila `clients`.
- [ ] **AC-P0-3** — Al rechazar por límite, se notifica al coach (push/email existentes) con CTA de upgrade.
- [ ] **AC-P0-4** — El chequeo corre server-side en la action (no confía en el cliente); scope resuelto desde el `invite_code` (nunca del body).

### Transversales
- [ ] **AC-T1** — `pnpm typecheck` + `pnpm test` verdes por tanda.
- [ ] **AC-T2** — Móvil: modales/póster usan `dvh` (nunca `h-screen` fuera de `md:`), safe areas en elementos fijos.
- [ ] **AC-T3** — Dark mode verificado en los modales de share; área imprimible del póster fija en claro.
- [ ] **AC-T4** — Cero `<img>` raw (excepto dentro de `ImageResponse` de `next/og`); `<Image>` de Next en el resto.
- [ ] **AC-T5** — Docs actualizados si cambian rutas/flujos (`docs/architecture/FLOWS_AND_COMPONENTS.md`).

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Screenshots del manifest con distinto aspect ratio | Chrome descarta **todo** el richer UI en silencio | Dimensiones fijas por código en la ruta `next/og`; validar en Android real |
| Usar `render/image` de Supabase para screenshots/QR | Agota la cuota de Image Transformations (incidente vivo) | Solo `next/og` (PNG server-side) y `data:` URL para el QR; prohibido `render/image` per-view |
| Perder `crossOrigin="use-credentials"` del `<link manifest>` | Team/org colapsan a marca de coach; `start_url`/`scope` a `/c` | No tocar ese atributo; test de manifest de team tras cambios |
| Doble listener `beforeinstallprompt` deja a un consumidor sin `deferredPrompt` | Botón "Instalar" muerto | Hook único `useInstallPrompt` (A-D1) |
| Canvas-taint al dibujar QR o logo cross-origin | `toBlob()`/`toDataURL()` lanza `SecurityError` | QR desde `data:` URL; logo del póster vía `resolveBrandLogoDataUrlServer`; tolerar logo nulo en canvas cliente |
| P0: contar mal los alumnos activos o el límite efectivo | Bloquear coaches con cupos, o dejar pasar overage | Reutilizar la lógica exacta de `createClientAction`; no reimplementar el conteo |
| TZ del filtro mensual distinta a la de los RPCs | Sesiones/volumen del borde del mes mal contados | Filtrar en `America/Santiago` con helpers de `lib/date-utils` |
| iOS frágil (sin evento, UA sniffing) | Hoja mal mostrada/oculta | Detección `display-mode: standalone` + `navigator.standalone`; copy iOS 26 |
| `invite_code` nulo en coaches legacy | QR/póster roto | Fallback a slug vía `getCoachPublicIdentifier` o `ensureCoachPublicCode` |
| Card de record diverge (canvas vs server) | El flujo coach queda sin QR/footer nuevo | Documentado como deuda; dedupe (B-D5) solo cubre el flujo del alumno |

## 8. Preguntas abiertas

- Ninguna que bloquee. Las decisiones de producto ya están tomadas (§3). Residual no-bloqueante: si a futuro se quiere que la invitación también viaje en el flujo coach-comparte-record (`/api/pr-card`), se abre como fast-follow (requiere resolver `joinUrl` del alumno objetivo server-side y dibujar un `<img>` de QR data-URL en satori).
