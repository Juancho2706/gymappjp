# PLAN — White-label R2: quick-wins de marca del coach

**Feature:** `whitelabel-r2`
**Branch:** `feat/redesign-eva-design-system`
**Fecha:** 2026-07-04
**Estado:** DRAFT (listo para ejecución por fases)
**Spec:** `specs/whitelabel-r2/SPEC.md`

---

## 1. Arquitectura

El feature es **presentación + plumbing de headers**. Respeta los 4 pilares:

- **Clean Architecture.** El único `_data` nuevo (recap mensual del alumno) sigue `_data → (RPC vía el patrón vigente del módulo dashboard/perfil) → Supabase`. No se abre un `progress.service` transversal para no introducir drift (el módulo ya llama `supabase.rpc` desde `_data`; se mantiene la consistencia del módulo). El P0 vive en la server action existente (`services`/action layer), leyendo el scope del `invite_code`, nunca del body.
- **Feature-First.** Componentes nuevos viven en su ruta: modales de share en `c/[coach_slug]/perfil/_components/`; póster en `coach/settings/brand/qr/`. Nada sube a `components/atoms|molecules|organisms` (no hay reuso en 3+ dominios).
- **Atomic Design.** Se difiere el molecule `BrandedInviteQr` (DRY) por no cumplir la regla de 3+ dominios.
- **SDD.** Este PLAN + SPEC + TASKS preceden al código.

### Flujo de datos por workstream

**A — PWA (sin `_data` nuevo):**
```text
proxy.ts (applyBrandHeaders: x-coach-*)         → ya existe
  -> c/[coach_slug]/layout.tsx (data-* en wrapper) → +data-primary-color/-logo-url
  -> InstallPrompt / PwaNavButton (leen data-* + hook useInstallPrompt)
api/manifest/[coach_slug]/route.ts (resuelve marca vía Supabase, FUERA del proxy)
  -> + screenshots (api/pwa-screenshot/[coach_slug] con next/og) + id + orientation
```

**B — Share-cards:**
```text
proxy.ts (x-coach-invite-code)
  -> c/[coach_slug]/layout.tsx (data-invite-code)
  -> lib/workout-pr-card-canvas.ts (readShareCardBrand lee data-invite-code + data-coach-slug)
     -> lib/qr.ts (buildJoinQrDataUrl, data-URL)
     -> drawBrandFooter(ctx, brand) [QR + CTA] aplicado a las 4 render fns
perfil/_data/monthly-recap.queries.ts (React.cache)
  -> get_client_workout_day_counts + get_client_daily_tonnage (RPC, patrón del módulo)
  -> filtro mes América/Santiago (lib/date-utils)
```

**C — QR imprimible + P0:**
```text
coach/settings/brand/qr/print/page.tsx (RSC)
  -> getCoachSettingsForUser / getCoach (invite_code, brand_name, primary_color, logo_url*)
  -> resolveBrandLogoDataUrlServer(logo_url) [data-URI, evita canvas-taint]
  -> InviteQrPoster ('use client': QRCodeSVG level=H + imageSettings, window.print, @page A4)
  -> InviteQrExport ('use client': QRCodeCanvas oculto → toDataURL PNG)

join/[invite_code]/_actions/join.actions.ts (P0)
  -> resolveInvite() [scope desde el código]
  -> contar alumnos activos vs límite efectivo ANTES del insert
  -> si lleno: return {full:true} + notificar coach (push/email) ; NO insert
```

## 2. Files

| Acción | Path | Notas |
|---|---|---|
| **Workstream A** | | |
| CREATE | `apps/web/src/lib/pwa/use-install-prompt.ts` | Hook único: `{deferredPrompt, promptInstall, isIOS, isStandalone, isInstalled}`; una sola captura de `beforeinstallprompt`; escucha `appinstalled`; tipado fuerte |
| UPDATE | `apps/web/src/components/InstallPrompt.tsx` | Consumir el hook; leer marca de `[data-coach-slug]` (`data-brand-name`/`-primary-color`/`-logo-url`); gating por primer workout; `appinstalled`; copy iOS 26 |
| UPDATE | `apps/web/src/components/client/PwaNavButton.tsx` | Consumir el hook (quitar segundo listener + `any`); entrada "Instalar la app" siempre visible |
| UPDATE | `apps/web/src/app/c/[coach_slug]/layout.tsx` | Emitir `data-primary-color` y `data-logo-url` en el wrapper; **quitar** `<AppDownloadBanner>`; conservar `crossOrigin="use-credentials"` |
| UPDATE | `apps/web/src/app/api/manifest/[coach_slug]/route.ts` | + `screenshots` (`form_factor:"narrow"`), `id`, `orientation` |
| UPDATE | `apps/web/src/app/api/manifest/default/route.ts` | + `screenshots`, `id` (espejo) |
| CREATE | `apps/web/src/app/api/pwa-screenshot/[coach_slug]/route.tsx` | `next/og` (`ImageResponse`), PNG brandeado, aspect ratio uniforme, `runtime='nodejs'`, cache; patrón `/api/splash` |
| **Workstream B** | | |
| CREATE | `apps/web/src/lib/qr.ts` | `buildJoinQrDataUrl(joinUrl)` puro (usa `qrcode.react` offscreen o `QRCode.toDataURL`); data-URL `#0B0E13` sobre `#FFFFFF`, margen |
| UPDATE | `apps/web/src/lib/workout-pr-card-canvas.ts` | + `drawBrandFooter(ctx, brand, opts)` (extraído de las 2 render fns); + `renderStreakCardToBlob`; + `renderMonthlySummaryCardToBlob`; `ShareCardBrand.inviteCode/inviteUrl`; `readShareCardBrand` lee `data-invite-code`+`data-coach-slug` |
| CREATE | `apps/web/src/app/c/[coach_slug]/perfil/_components/StreakShareCardModal.tsx` | Copia de `ProgressShareCardModal` (copy/emoji distintos) |
| CREATE | `apps/web/src/app/c/[coach_slug]/perfil/_components/MonthlySummaryShareCardModal.tsx` | Ídem; grid 3 tiles (v1: Sesiones/Volumen/Racha, sin PRs) |
| UPDATE | `apps/web/src/app/c/[coach_slug]/perfil/_components/ProfileClient.tsx` | Selector único de plantilla (Progreso/Racha/Mensual); montar modales nuevos |
| CREATE | `apps/web/src/app/c/[coach_slug]/perfil/_data/monthly-recap.queries.ts` | `getMonthlyRecap(clientId)` `React.cache`; RPCs día-count + tonnage; filtro mes Santiago |
| UPDATE | `apps/web/src/app/c/[coach_slug]/perfil/page.tsx` | Fetch recap si la entrada vive en perfil; pasar a `ProfileClient` |
| UPDATE | `apps/web/src/app/c/[coach_slug]/layout.tsx` | Emitir `data-invite-code` (mismo wrapper) |
| UPDATE | `apps/web/src/proxy.ts` | `x-coach-invite-code` en bloque standalone (+`invite_code` al select) y team (`tCtx.invite_code`); enterprise queda vacío |
| **Workstream C** | | |
| CREATE | `apps/web/src/app/coach/settings/brand/qr/print/page.tsx` | RSC: fetch coach, gate de página (hereda `canUseBranding`), logo→data-URI, arma `joinUrl` |
| CREATE | `apps/web/src/app/coach/settings/brand/qr/_components/InviteQrPoster.tsx` | 'use client': A4, headline i18n, `QRCodeSVG level="H"` + `imageSettings` logo, `invite_code` mono, `window.print()`, `@page A4`, fondo blanco fijo |
| CREATE | `apps/web/src/app/coach/settings/brand/qr/_components/InviteQrExport.tsx` | 'use client': `QRCodeCanvas` oculto + ref → `toDataURL('image/png')` → `<a download>` |
| UPDATE | `apps/web/src/app/coach/settings/BrandSettingsForm.tsx` | Sección "Compartir": botón al póster; corregir destino del QR/link de `/login` → `/join/[invite_code]`; subir a `level="H"` si lleva logo |
| UPDATE | `apps/web/src/app/coach/clients/*` (disparador) | Acción "QR de invitación" cerca de "Agregar alumno" (reusa `coach.invite_code`/`appUrl` ya disponibles en el shell) |
| **Workstream C — P0** | | |
| UPDATE | `apps/web/src/app/join/[invite_code]/_actions/join.actions.ts` | Contar activos vs límite efectivo antes del insert; `full` → mensaje + notificar coach; scope del `invite_code` |
| UPDATE | `apps/web/src/app/join/[invite_code]/_components/JoinForm.tsx` | Renderizar el estado `full` (mensaje "sin cupos") |

## 3. Data Model

- **DB changes:** **ninguno en v1.** Todo el dato ya existe (`coaches.invite_code/brand_name/primary_color/logo_url/logo_url_dark/max_clients`, `teams.invite_code/seat_limit`, RPCs de racha/día-count/tonnage con GRANT y guard 3-vías).
- **P0:** solo **lectura** (conteo de alumnos activos + límite) — no escribe columnas nuevas → **no aplica** el gotcha de `GRANT UPDATE(col)`.
- **Fast-follow (fuera de alcance):** la RPC `get_client_month_pr_count(p_client_id, p_from, p_to)` sería aditiva (forward-only, idempotente, guard IDOR 3-vías copiado de `get_client_workout_day_counts`, `REVOKE ... FROM PUBLIC, anon` + `GRANT EXECUTE TO authenticated, service_role`, validación prod con snapshot `_bak` + `get_advisors` + tx-rollback, SIN branches Supabase). **No se ejecuta en este feature.**
- **RLS impact:** ninguno. Los RPCs consumidos ya tienen sus policies/guards.
- **Generated types impact:** ninguno (no hay schema nuevo). `qrcode.react` ya está en `package.json`; `lib/qr.ts` no agrega deps con postinstall.

## 4. Server Actions

**`joinViaInviteAction` (P0 — endurecer la existente):**
- **Validación:** Zod v4 en el form + en la action (ya existe el schema del join; extenderlo no es necesario para el chequeo de límite). El scope se resuelve con `resolveInvite()` desde el `invite_code` del path (nunca del body).
- **Chequeo de límite (antes del insert):**
  - standalone → contar alumnos activos del coach vs `coaches.max_clients` (misma semántica que `createClientAction`).
  - team → contar el pool vs `teams.seat_limit`.
  - org → su límite propio si existe; si no hay límite definido, no bloquear (documentar).
- **Resultado lleno:** retornar un estado `{ full: true }` (sin crear `auth.user` ni `clients`) para que `JoinForm` muestre el mensaje; disparar notificación al coach (push/email existentes) con CTA de upgrade.
- **Revalidation:** no aplica (el join crea sesión/redirige en el camino feliz; el camino lleno no muta nada).

**Sin server actions nuevas** en A/B/C fuera del P0 (A y C son presentación + rutas GET; B usa canvas cliente + `_data` de lectura).

## 5. UI/UX

- **Mobile viewport:** modales de share y póster usan `dvh`/`min-h-dvh` (nunca `h-screen` fuera de `md:`); el `InstallPrompt` fijo usa `pb-safe`/`pl-safe`/`pr-safe`. Copiar el shell de `ProgressShareCardModal` (ya cumple DS del rediseño: `rounded-card`, tokens `--sport-*`/`--ember-*`).
- **Dark mode:** modales de share light+dark; el **área imprimible** del póster es **fondo blanco fijo** (ignora dark mode, como `MovementPrintReport`).
- **Componentes:** route-local. El póster vive en el feature; los modales en `perfil/_components`. Nada a atomic aún.
- **Marca:** el prompt PWA y las cards leen la marca ya tier-gateada por el layout (`SYSTEM_PRIMARY_COLOR` si free). El QR de invitación NO se gatea. Co-branding "vía EVA" intacto por tier.
- **QR (scannability):** `level="H"`, módulos oscuros (`~#0B0E13`) sobre blanco, quiet-zone ≥ 2 módulos, recuadro blanco en cards de fondo oscuro. Color de marca solo en el chrome.

## 6. Fases (con gates)

> Gate por tanda (regla del repo): `pnpm typecheck` + `pnpm test` (Vitest de lo tocado) verdes. **Playwright/E2E y cualquier SQL contra PROD solo con OK explícito del CEO.** Migraciones (no hay en v1): aditivas, idempotentes, forward-only, con snapshot `_bak` previo — aplica solo si se activa el fast-follow de PRs.

- **Fase 0 — P0 money-safety (independiente, va PRIMERA).** Endurecer `joinViaInviteAction` + estado `full` en `JoinForm` + notificación al coach. Gate: typecheck + vitest (test de conteo/límite con las tres ramas de scope). No depende de A/B/C.
- **Fase 1 — Plumbing transversal `invite_code`.** `proxy.ts` (standalone + team) → `layout.tsx` (`data-invite-code`) → `readShareCardBrand()`. Base para B y para alinear C. Gate: typecheck + test de humo del parser de marca.
- **Fase 2 — A: hook + prompt brandeado + banner.** `use-install-prompt.ts`; refactor `InstallPrompt` + `PwaNavButton`; `data-primary-color`/`-logo-url`; gating por primer workout; `appinstalled`; copy iOS; quitar `AppDownloadBanner` de `/c`. Gate: typecheck + build.
- **Fase 3 — A: manifest enriquecido + screenshots.** `screenshots`/`id`/`orientation` en manifest per-coach y default; ruta `api/pwa-screenshot` (`next/og`). Gate: typecheck + build; smoke Android **solo con OK CEO**.
- **Fase 4 — B: footer QR + cards nuevas.** `lib/qr.ts`; `drawBrandFooter`; `renderStreakCardToBlob`; `renderMonthlySummaryCardToBlob`; `_data/monthly-recap`; modales; selector en `ProfileClient`. Gate: typecheck + vitest (QR puro + reconcile mensual). Smoke de share en dispositivo **solo con OK CEO**.
- **Fase 5 — C: póster QR imprimible + disparadores + alinear destino.** Ruta print; `InviteQrPoster`/`InviteQrExport`; botón en Mi Marca (+ corregir `/login`→`/join`); acceso en Alumnos. Gate: typecheck + build; QA de impresión/escaneo **solo con OK CEO**.
- **Fase 6 — Cierre.** Docs (`FLOWS_AND_COMPONENTS.md`), revisión dark/safe-area/`<Image>`, checklist AC. E2E de join (límite lleno) y de share **solo con OK CEO**.

## 7. Test Plan

- **Unit (Vitest, por tanda):**
  - `lib/qr.ts` → `buildJoinQrDataUrl` devuelve `data:image/...` para un `/join/{code}` (humo).
  - Filtro mensual de `getMonthlyRecap` → cuenta correcta de sesiones/volumen para bordes de mes en TZ Santiago (fixtures).
  - P0: función de conteo/límite efectivo por scope (standalone/team/org) → decide `full` correctamente.
- **Integración:** `readShareCardBrand()` con un DOM que expone `data-invite-code`/`data-coach-slug` → arma `inviteUrl` correcto y fallback.
- **E2E (Playwright, solo con OK CEO):** `join` con coach lleno → mensaje "sin cupos", sin `clients` creado; share de card → `canShareFiles` true / fallback descarga.
- **Manual (solo con OK CEO):** Android Chrome (Richer Install UI con screenshots); iOS Safari (hoja brandeada, oculta en standalone); escanear QR de card y de póster desde otra pantalla en claro/oscuro; imprimir póster A4 (print-to-PDF Chrome/Safari).

## 8. Rollback Plan

- **A:** revert de los commits de Fase 2/3. El prompt vuelve al global EVA; `AppDownloadBanner` se re-renderiza con un revert de una línea en `layout.tsx`; el manifest sin `screenshots` sigue válido (Richer UI simplemente no aparece). Sin estado persistente que limpiar (todo `localStorage`).
- **B:** revert de Fase 4. Las cards nuevas y el footer QR desaparecen; las cards existentes vuelven a su footer previo. `lib/qr.ts` es aditivo; no rompe nada al removerse. `x-coach-invite-code` (Fase 1) es un header aditivo; su revert no afecta al resto.
- **C:** revert de Fase 5. La ruta print y disparadores desaparecen; el destino del QR de Mi Marca vuelve a `/login` (cambio de una línea). **P0 (Fase 0)** es la única pieza que NO conviene revertir (cierra un agujero de dinero); si hubiera un falso positivo de "lleno", el fix es ajustar el conteo, no revertir el gate.
- **DB:** nada que revertir (v1 no toca schema).
