# TASKS — White-label R2: quick-wins de marca del coach

**Feature:** `whitelabel-r2`
**Branch:** `feat/redesign-eva-design-system`
**Fecha:** 2026-07-04
**Estado:** DRAFT
**Spec:** `specs/whitelabel-r2/SPEC.md`
**Plan:** `specs/whitelabel-r2/PLAN.md`

> Orden de ejecución: **T0 (P0 money-safety) va PRIMERO y no depende de nada.** Luego T1 (plumbing) desbloquea B y C. A/B/C pueden avanzar en paralelo tras T1.
> Gate por tanda: `pnpm typecheck` + `pnpm test`. Playwright/E2E y SQL contra PROD **solo con OK explícito del CEO**.

---

## Fase 0 — C-KILL: apagar auto-registro standalone (PRIMERO, independiente) — supersede del T0 original

- [ ] **T0 — Apagar el auto-registro standalone en `/join`** `[M]`
  - Scope: en `apps/web/src/app/join/[invite_code]/_actions/join.actions.ts`, tras `resolveInvite()`: si `invite.scope === 'standalone'` (código de `coaches.invite_code`) → retornar estado `disabled` SIN crear `auth.user` ni fila `clients`. La **página** `/join/[invite_code]` también detecta el scope standalone server-side y muestra el estado deshabilitado directamente (no un form que falla al final): mensaje "El registro directo está desactivado — pedile a tu coach que te agregue desde su panel" + link a `/c/[slug]/login` para quien YA tiene cuenta. Team y org: flujo INTACTO.
  - Diseño del estado deshabilitado: cuidado, brandeado con la marca del coach como el resto de `/join`, EVA DS (no una página de error pelada).
  - Investigar y REPORTAR (no implementar): ¿el path team valida `seat_limit` antes del insert? Anotar como P1 si no.
  - Verificación: `pnpm typecheck` + Vitest de la action (3 ramas: standalone → disabled sin side-effects; team → crea; org → crea). E2E **solo con OK CEO**.

---

## Fase 1 — Plumbing transversal `invite_code` — ❌ ELIMINADA (cambio de alcance 2026-07-04: footer sin QR, /join standalone apagado)

- [x] ~~**T1 — `x-coach-invite-code` (proxy) → `data-invite-code` (layout) → parser de marca**~~ `ELIMINADA` — el footer de las cards ya no lleva QR de invitación; `readShareCardBrand()` ya expone `data-coach-slug` para la URL corta. NO construir. Detalle original (referencia):
  - Scope:
    - `apps/web/src/proxy.ts`: bloque standalone (~733-798) agregar `invite_code` al `select` del coach + `h.set('x-coach-invite-code', coach.invite_code ?? '')`; bloque team (~601-618) `set('x-coach-invite-code', tStr(tCtx.invite_code))` (verificar que el contexto team trae `invite_code`; si no, sumarlo a su query fuente); enterprise (~501-514) queda vacío.
    - `apps/web/src/app/c/[coach_slug]/layout.tsx`: leer `headersList.get('x-coach-invite-code')` y emitir `data-invite-code={inviteCode || undefined}` en el mismo wrapper que ya lleva `data-brand-name`/`data-coach-slug`.
    - `apps/web/src/lib/workout-pr-card-canvas.ts`: extender `ShareCardBrand` con `inviteCode: string | null` e `inviteUrl: string | null`; en `readShareCardBrand()` leer `data-invite-code`, con fallback a `data-coach-slug`, y construir `inviteUrl = code ? ${SITE_URL}/join/${code} : ${SITE_URL}/c/${slug}` (`SITE_URL = process.env.NEXT_PUBLIC_SITE_URL`).
  - Verificación: `pnpm typecheck` + test de humo de `readShareCardBrand()` con DOM que expone los `data-*`. Confirma AC-B7.

---

## Fase 2 — A: hook único + prompt brandeado + banner fuera

- [ ] **T2 — Hook `useInstallPrompt()`** `[M]`
  - Scope: crear `apps/web/src/lib/pwa/use-install-prompt.ts` — una sola captura de `beforeinstallprompt` (preventDefault + guardar `deferredPrompt`), expone `{ deferredPrompt, promptInstall(), isIOS, isStandalone, isInstalled }`, escucha `appinstalled`. Tipado fuerte (`BeforeInstallPromptEvent`, sin `any`).
  - Verificación: `pnpm typecheck`. Confirma AC-A2.
- [ ] **T3 — Refactor `InstallPrompt` + `PwaNavButton` al hook** `[M]`
  - Scope: `apps/web/src/components/InstallPrompt.tsx` y `apps/web/src/components/client/PwaNavButton.tsx` consumen el hook (quitar el segundo listener y el `deferredPrompt: any`). `InstallPrompt` lee la marca de `document.querySelector('[data-coach-slug]')` (`data-brand-name`/`data-primary-color`/`data-logo-url`) → auto-branding bajo `/c`, EVA fuera. `PwaNavButton` mantiene "Instalar la app" **siempre visible** en el perfil.
  - Verificación: `pnpm typecheck` + build. Confirma AC-A1, AC-A2.
- [ ] **T4 — Emitir `data-primary-color`/`data-logo-url` + quitar `AppDownloadBanner` de `/c`** `[S]`
  - Scope: `apps/web/src/app/c/[coach_slug]/layout.tsx`: agregar `data-primary-color` y `data-logo-url` al wrapper; **remover** el render de `<AppDownloadBanner>`. **NO tocar** `crossOrigin="use-credentials"` del `<link rel="manifest">`.
  - Verificación: `pnpm typecheck` + build; grep confirma que `/c` ya no renderiza el banner. Confirma AC-A1, AC-A8, AC-A9.
- [ ] **T5 — Gating por primer workout + `appinstalled` + copy iOS 26** `[M]`
  - Scope: en `InstallPrompt.tsx`: no mostrar en el primer render; disparar tras señal "primer workout completado" en `localStorage` (back-off del dismiss en vez de "nunca más"). Ocultar/persistir en `appinstalled`. Hoja iOS condicionada a `!isStandalone` (`display-mode: standalone` / `navigator.standalone`), copy alineado a iOS 26 ("Open as Web App").
  - Verificación: `pnpm typecheck`. Confirma AC-A3, AC-A4, AC-A5.

## Fase 3 — A: manifest enriquecido + screenshots next/og

- [ ] **T6 — Screenshots del manifest vía `next/og`** `[L]`
  - Scope: nueva ruta `apps/web/src/app/api/pwa-screenshot/[coach_slug]/route.tsx` (`ImageResponse`, `runtime='nodejs'`, cache 86400) — 1-3 imágenes `narrow` brandeadas (marca + claim), **aspect ratio uniforme por código**, PNG. Patrón `/api/splash`. **PROHIBIDO** `render/image` de Supabase.
  - Verificación: `pnpm typecheck` + build; abrir la ruta y validar dimensiones idénticas. Confirma AC-A7.
- [ ] **T7 — Extender manifest per-coach y default** `[M]`
  - Scope: `apps/web/src/app/api/manifest/[coach_slug]/route.ts` y `.../manifest/default/route.ts`: agregar `screenshots` (`form_factor:"narrow"`, apuntando a `api/pwa-screenshot`), `id` estable (`/c/[slug]` o `/t/[team_slug]`), `orientation:"portrait"`. Mantener el patrón de resolución de marca vía Supabase (fuera del proxy).
  - Verificación: `pnpm typecheck` + build; smoke Richer Install UI en Android **solo con OK CEO**. Confirma AC-A6.

## Fase 4 — B: footer QR + cards nuevas

- [x] ~~**T8 — `lib/qr.ts` (QR data-URL puro)**~~ `ELIMINADA` (cambio de alcance 2026-07-04: footer sin QR). NO construir.
- [ ] **T9 — `drawBrandFooter` compartido SIN QR + aplicarlo a las 4 cards** `[M]` *(re-alcance 2026-07-04)*
  - Scope: en `apps/web/src/lib/workout-pr-card-canvas.ts` extraer `drawBrandFooter(ctx, brand, opts)` de `renderWorkoutPRCardToBlob` y `renderProgressCardToBlob`: línea divisoria + `brand.brandName.toUpperCase()` + CTA de texto "Entrená con {marca}" + URL corta `eva-app.cl/c/{slug}` (desde `data-coach-slug`, ya expuesto). **SIN QR.** Mantener "vía EVA" por tier **tal cual hoy**. Aplicarlo a las 4 render fns (record, progreso, racha, mensual). Dedupe del record card del alumno hacia esta vía (B-D5). Tipografía/contraste cuidados (directiva de diseño CEO).
  - Verificación: `pnpm typecheck`; generar cada card y confirmar CTA + contraste. Confirma AC-B4 (reinterpretado sin QR), AC-B5.
- [ ] **T10 — `renderStreakCardToBlob` + `StreakShareCardModal`** `[M]`
  - Scope: tipo `StreakCardData { fullName; streak; brandName? }` + `renderStreakCardToBlob` (hero = número de racha, motivo ember `--ember-500`, eyebrow "RACHA", copy "días seguidos activo"). Modal `apps/web/src/app/c/[coach_slug]/perfil/_components/StreakShareCardModal.tsx` (copia de `ProgressShareCardModal`). Reusa `drawBrandFooter`.
  - Verificación: `pnpm typecheck`. Confirma AC-B2.
- [ ] **T11 — `_data/monthly-recap` + `renderMonthlySummaryCardToBlob` + modal** `[M]`
  - Scope: `apps/web/src/app/c/[coach_slug]/perfil/_data/monthly-recap.queries.ts` → `getMonthlyRecap(clientId)` (`React.cache`): sesiones vía `get_client_workout_day_counts(clientId, 31)` filtradas al mes calendario **Santiago**; volumen vía `get_client_daily_tonnage(clientId, 31)` sumando `tonnage` del mes; **sin PRs** (v1). Tipo `MonthlySummaryCardData { fullName; monthLabel; sessions; volumeKg; brandName? }` + `renderMonthlySummaryCardToBlob` (grid 3 tiles: Sesiones/Volumen/Racha). Modal `MonthlySummaryShareCardModal.tsx`. Wire en `perfil/page.tsx` si la entrada vive en perfil.
  - Verificación: `pnpm typecheck` + Vitest del filtro mensual (bordes de mes en Santiago). Confirma AC-B3, AC-B8.
- [ ] **T12 — Selector único en `ProfileClient`** `[M]`
  - Scope: `apps/web/src/app/c/[coach_slug]/perfil/_components/ProfileClient.tsx`: convertir el trigger actual en un selector de plantilla (Progreso / Racha / Resumen mensual); montar los tres modales.
  - Verificación: `pnpm typecheck` + build. Confirma AC-B1.

## Fase 5 — C: póster QR imprimible + disparadores — ⏸️ DIFERIDA ENTERA (CEO 2026-07-04: no promover auto-registro; T13/T14/T15 no se construyen)

- [ ] **T13 — Ruta print del póster (RSC)** `[M]`
  - Scope: `apps/web/src/app/coach/settings/brand/qr/print/page.tsx`: fetch coach (reusar `getCoachSettingsForUser`/`getCoach`), heredar el gate de Mi Marca, resolver logo con `resolveBrandLogoDataUrlServer()` → data-URI, armar `joinUrl = ${SITE_URL}/join/${invite_code}`. Manejar `invite_code` nulo (fallback slug / `ensureCoachPublicCode`).
  - Verificación: `pnpm typecheck` + build. Confirma AC-C1, AC-C6.
- [ ] **T14 — `InviteQrPoster` + `InviteQrExport`** `[L]`
  - Scope: `apps/web/src/app/coach/settings/brand/qr/_components/InviteQrPoster.tsx` ('use client'): A4, header logo (`next/image` o data-URI) + `brand_name`, headline i18n ("Escaneá para unirte a {brand}"), `QRCodeSVG value={joinUrl} level="H" imageSettings={{src: logoDataUri, excavate:true}}` (módulos oscuros, `bgColor="#fff"`), `invite_code` en mono + `eva-app.cl/join/{code}`, acentos de color de marca en el chrome, botones `print:hidden`, `window.print()`, `@media print { @page { size: A4; margin: 0 } }`, fondo blanco fijo, preview `min-h-dvh`. `InviteQrExport.tsx`: `QRCodeCanvas` oculto + ref → `toDataURL('image/png')` → `<a download>` (verificar canvas no tainted por el logo data-URI).
  - Verificación: `pnpm typecheck` + build; imprimir A4 y descargar PNG **solo con OK CEO**. Confirma AC-C1, AC-C2, AC-C3, AC-T2, AC-T3.
- [ ] **T15 — Disparadores + alinear destino `/login` → `/join`** `[S]`
  - Scope: `apps/web/src/app/coach/settings/BrandSettingsForm.tsx`: en "Compartir con alumnos" agregar botón "Cartel para tu gym / QR imprimible" → ruta print; corregir el `value` del QR/link de `/c/{id}/login` a `/join/[invite_code]` y subir a `level="H"` si lleva logo. Disparador "QR de invitación" en el directorio de Alumnos (cerca de "Agregar alumno"), reusando `coach.invite_code`/`appUrl` que ya baja el shell.
  - Verificación: `pnpm typecheck` + build. Confirma AC-C4, AC-C5.

## Fase 6 — Cierre

- [ ] **T16 — Docs + revisión final** `[S]`
  - Scope: actualizar `docs/architecture/FLOWS_AND_COMPONENTS.md` (ruta print nueva, header `x-coach-invite-code`, ruta `api/pwa-screenshot`). Revisión dark mode + safe-area + cero `<img>` raw. Recorrer la checklist de AC.
  - Verificación: `pnpm typecheck` + `pnpm lint` + `pnpm test` verdes. E2E de join (lleno) + share **solo con OK CEO**. Confirma AC-T1..T5.

---

## Definición de Hecho universal

- [ ] `pnpm typecheck`
- [ ] Tests dirigidos del dominio tocado (Vitest por tanda)
- [ ] Sin llamadas Supabase directas de datos de feature en `_data` fuera del patrón vigente del módulo
- [ ] Server actions validan con Zod (aplica al P0)
- [ ] Mutaciones llaman `revalidatePath()` donde corresponde
- [ ] Viewport móvil usa `dvh`, no `vh`/`h-screen`
- [ ] UI fija de borde usa utilidades de safe-area
- [ ] Dark mode revisado cuando cambia UI (área imprimible del póster fija en claro)
- [ ] Cero `<img>` raw (excepto dentro de `ImageResponse` de `next/og`)
- [ ] Docs actualizados cuando cambian rutas, flujos, DB, tests o prioridades

## Notas

- **T0 no depende de nada** y cierra un agujero de dinero: shippearlo aunque el resto se demore.
- **NO** ejecutar la RPC de PRs-del-mes (fast-follow, fuera de alcance): el recap v1 es Sesiones + Volumen + Racha.
- **NO** romper `crossOrigin="use-credentials"` del `<link manifest>` ni usar `render/image` de Supabase (cuota).
- Preferir componentes route-local; el molecule `BrandedInviteQr` (DRY) se difiere.
- Preservar el co-branding "vía EVA" por tier tal cual existe hoy — no inventar gating nuevo.
