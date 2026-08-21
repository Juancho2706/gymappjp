---
status: active
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# TASKS — Pricing v3

Decisiones cerradas el 2026-08-21: **1A 2A 3A 4A 5A 6A**. Listas para workers (modelo sugerido entre paréntesis).

## W0 — Antes de tocar nada
- [x] F0.1–F0.6 Decisiones D1–D6 (owner, 21-08).
- [x] F0.7 **Robin**: `robin-coach` free con `max_clients 3` y 5 alumnos → bloqueado por el gate duro. **Owner (21-08): opción B — no se toca la fila; sale archivando 2 alumnos o pasando a Pro.**
- [x] F0.8 `PRICING_V3_CUTOVER = '2026-08-21T00:00:00Z'` (día D = 21-08, decisión owner).

## W1 — Catálogo (`packages/tiers/index.ts`) (Opus)
- [x] F1.1 `TIER_CONFIG.free.maxClients = 1`; `TIER_STUDENT_RANGE_LABEL.free = '1 alumno con tu marca'`; `free.features` + `'Branding personalizado'`.
- [x] F1.2 `TIER_CAPABILITIES.free.canUseBranding = true`; nueva capacidad `showsEvaBadge` (free/starter `true`, pro/elite/growth/scale `false`) + helper `showsEvaBadge(tier)` fail-open a `true`.
- [x] F1.3 `PRICING_V3_CUTOVER` + `V2_TIER_MAX_CLIENTS = { free: 2 }` + `tierMaxClientsFor` de 3 buckets; `getRecommendedTierFor` coherente (0–1 free, 2–25 pro, 26–60 elite).
- [x] F1.4 Docblocks `:14-16`, `:73-75`, `:175` reescritos: «white-label en todos los planes desde v3 (decisión owner 2026-08-21); Pro = cupo + sin sello».
- [x] F1.5 Tests: `packages/tiers/pricing-v2.test.ts` (tabla CASES + snapshot free + recommended), `apps/web/src/lib/constants.test.ts` (`isBrandingAllowed('free')` true, labels), `apps/web/src/app/(auth)/register/actions.test.ts:356` (`max_clients: 1`), `nutrition-pdf-brand.test.ts` (free ⇒ marca propia + `poweredByEva: true`); `activate-free.service.test.ts` caso post-v3.
- [x] F1.6 Re-exports RN (`apps/mobile/lib/coach-tiers.ts`) exponen `showsEvaBadge`.

## W2 — Gates, lectores y analítica (Opus)
- [x] F2.1 `coach/reactivate/ReactivateClient.tsx:74` y `_data/reactivate.queries.ts:25-26`: cupo efectivo = columna (`coach.max_clients`) para el tier actual; escalera solo para tiers que no son el actual.
- [x] F2.2 `coach/_components/OverLimitBanner.tsx:63`: columna.
- [x] F2.3 `coach/clients/import/_actions/import.actions.ts:100,185` y `api/mobile/coach/clients/import/route.ts:251`: `?? tierMaxClientsFor(tier, created_at)`; precheck de UI con el cupo real.
- [x] F2.4 `upgrade_gate_hit {gate:'client_limit', limit, active}` en `clients.actions.ts:116-133` (web) y en el alta RN (`api/mobile/coach/clients/route.ts:191` → respuesta + captura en RN con `captureAppEvent`).
- [x] F2.5 `checkout_started` garantizado en `/coach/subscription/processing` (verificar que exista; PostHog no lo tiene en 30 d) y `pricing_version: 'v3'` en `coach_registered`.
- [x] F2.6 Tests de cada servicio tocado.

## W3 — White-label abierto + sello (Opus web + Opus RN)
- [x] F3.1 Web: `coach/settings/brand/page.tsx:26-39` renderiza `BrandSettingsForm` para todos; `coach/settings/page.tsx:284-288,378-397` sin badge «Pro» ni pane upsell; `BrandUpsell.tsx` → borrar o reconvertir a upsell de cupo (decisión del worker, documentada).
- [x] F3.2 Web: `settings.actions.ts:218,263,330` — el gate pasa a `isBrandingAllowed` (que ahora es true para free); mensajes para el único caso restante (tier inválido / org-managed).
- [x] F3.3 RN: `app/coach/settings/brand.tsx:434-459` pantalla gate fuera; comentario «starter+» corregido; hero de Opciones pinta logo (`app/coach/(tabs)/settings.tsx:287,290`).
- [x] F3.4 Sello «Hecho con EVA» por `showsEvaBadge`: `c/[coach_slug]/layout.tsx` (footer/badge discreto pero visible), `c/[coach_slug]/login/page.tsx`, `lib/nutrition-pdf-brand.ts:99-125` (`poweredByEva`), `lib/email/email-brand.ts:23` + `base-layout.ts` (footer del alumno), `api/manifest` (sin cambio), RN `lib/theme.ts:309,385` y `lib/nutrition-day-export.ts:96`. Link con UTM `utm_source=badge&utm_medium=student_app&utm_campaign=free_badge`.
- [x] F3.5 Proxy `apps/web/src/proxy.ts:889-910`: headers de marca para todos los tiers (hoy color/logo solo Pro+).
- [x] F3.6 Verificar las 5 marcas ya guardadas (`pauli-coach` #8B5CF6, `robin-coach` #4c2020 + ember + hero, `dudu` emerald + montserrat + clasico, `coach-derek` logo, `anais-perez` #0000ff + loader custom): contraste WCAG del sello sobre esos colores; ninguna rompe el login.
- [x] F3.7 Tests: PDF, email-brand, proxy headers, RN theme.

## W4 — Copy de venta (Sonnet + juicio)
- [x] F4.1 `PreciosSection.tsx`: `:281` «Todo EVA con tu marca, sin tarjeta. 1 alumno, para siempre.»; `:311-318` ✗ «Sin marca propia» → ✓ «White-label: tu logo y tu color»; `:399` Pro «Hasta 25 alumnos · sin rastro de EVA»; `:418` bullet Pro → «Sin el sello “Hecho con EVA”»; `:12` comentario; plural `:93-98`.
- [x] F4.2 `landing-v2/copy.ts:93-108` (EN) espejo.
- [x] F4.3 `/pricing/page.tsx:145` «Todo EVA · 1 alumno · con tu marca»; `:154` «Hasta 25 alumnos · sin sello EVA»; `:223`.
- [x] F4.4 i18n `es/en.json:29` (nutrición y marca en todos los planes), `:86`, `:108` «Lo único que cambia entre planes es el cupo de alumnos y el sello EVA», `:109-111`, `:138`.
- [x] F4.5 `FreeWelcomeModal.tsx:115` ✓ «Marca personalizada (tu logo y color)»; `verify-email/page.tsx:63` «1 alumno sin costo, con tu marca»; `HelpCenter.tsx:68,125` «incluida en todos los planes», `:152`; `FaqSection.tsx:63` plural + «con tu marca».
- [x] F4.6 Correos: `transactional-templates.ts:193` (bienvenida Free: «suma más cupo y saca el sello de EVA»); `drip-templates.ts:127,133` (Pro/Elite sin «tu marca propia», con «sin sello»); drip día 7/14 como upsell de cupo.
- [x] F4.7 RN: `register.tsx:405-413`, `verify-email.tsx:13`, `subscription.tsx`, `perfil.tsx` — derivados; verificar plural y «Incluida».
- [x] F4.8 `docs/legal` sin cambios (genérico); `PRODUCT_OVERVIEW.md:92` quitar «Starter».

## W5 — Comunicación y docs (Opus)
- [x] F5.1 Plantilla `buildFreePlanV3NoticeEmail` en `apps/web/src/lib/email/pricing-v3-notice-template.ts` (asunto «Tu plan Free ahora incluye tu marca»): qué ganan (logo, color, tu app con tu identidad, sello «Hecho con EVA»), qué cambia (cupo 1 alumno; «los alumnos que ya tienes se conservan»), CTA «Configurar mi marca» → `/coach/settings/brand`, ghost «Ver planes» → `/pricing`. Sin promesas de precio. Español neutro, HTML + texto plano, 6 tests de render.
- [x] F5.2 Envío desde el panel admin (Coaches › «Aviso Pricing v3»): `countPricingV3NoticeRecipientsAction` / `sendPricingV3NoticeTestAction` / `sendPricingV3NoticeAction` en `coach-actions.ts` leen los Free activos con `max_clients = 1` tras el backfill (excluyen `evademo`, `josefit` y `qa-%`), mandan con Resend y deduplican contra `admin_audit_logs` (`coach.pricing_v3_notice`, una fila por envío OK).
- [x] F5.3 Docs: `pricing-v2/SPEC.md` con la nota «superada parcialmente por v3 (21-08)»; `CURRENT.md` fila Web/PWA + prioridad 0 (resto renumerado); `PRODUCT_OVERVIEW.md` (marca en todos los planes, tiers en venta Free/Pro/Elite); `docs/operations/MANUAL_TASKS.md` COMMS-01 con el trámite del envío.
- [x] F5.4 Memoria del asistente (`project_pricing_v3_free_1_whitelabel_20260821.md`).

## W6 — Día D (jefe)
- [x] F6.1 Backfill LIVE **EJECUTADO 2026-08-21 15:35Z** (tx-rollback → `apply_migration` → advisors 0 ERROR → archivo `supabase/migrations/20260821153527_pricing_v3_free_limits_backfill.sql`): **31 filas** (15 de 3→1, 16 de 2→1), 0 sobre cupo, los 5 con ≥2 intactos. SQL aplicado:
  ```sql
  create table if not exists public._bak_pricing_v3_free_limits_20260821 as
    select c.id as coach_id, c.max_clients as max_clients_prev, now() as backed_up_at
    from public.coaches c
    where c.subscription_tier = 'free'
      and c.slug not in ('evademo','josefit')
      and c.max_clients > 1
      and (select count(*) from public.clients cl
             where cl.coach_id = c.id and cl.is_archived = false
               and cl.org_id is null and cl.team_id is null) <= 1;
  alter table public._bak_pricing_v3_free_limits_20260821 enable row level security;
  update public.coaches c set max_clients = 1
    where c.id in (select coach_id from public._bak_pricing_v3_free_limits_20260821);
  -- verificación real: 31 filas; 0 tocados con ocupa > 1
  ```
- [x] F6.2 Push único `2edea500` a `rnmobiledenuevo` y `master` (mismo commit); Vercel prod READY (`dpl_HAx84t2663iAmonorQUcDLwWmE5x`, 2:12); verificado en prod con curl: `/pricing` y `#precios` dicen «1 alumno con tu marca» / «sin sello EVA»; login de `pauli-coach` (Free) pinta `#8B5CF6` + sello con `utm_medium=student_login`; login de `jotap-coach` (Pro) sin sello.
- [x] F6.3 OTA android + ios a los 3 runtimes por GH Actions (`mobile-ota.yml`, canal `production`): 1.1.2 desde `rnmobiledenuevo` (`ota/1.1.2-20260821` = `2edea500`; grupos `7c91756f` / `d7237681`), 1.1.0 desde `ota/1.1.0-20260821` = `c5501cc3` (`4b12bb78` / `c095d5e1`), 1.1.1 desde `ota/1.1.1-20260821` = `fce4ceb8` (`c301b034` / `0c7e5407`). En 1.1.0/1.1.1 se omitió la captura `upgrade_gate_hit` de RN (sin `lib/analytics`).
- [x] F6.4 Correo «Tu plan Free ahora incluye tu marca» ENVIADO por el owner desde admin › Coaches › «Aviso Pricing v3» el 2026-08-21 21:31Z: **34 enviados, 0 fallidos, 0 saltados, 0 errores de auditoría** (`admin_audit_logs`: 34 × `coach.pricing_v3_notice` + 1 × `coach.pricing_v3_notice_batch`). Dedupe activo: repetir el botón no reenvía.
- [x] F6.5 Insights PostHog `I5QSlFSq` (paywall por gate) y `9cVq1F6v` (altas por pricing_version/tier); artifact «Free con marca» `8853ed20` y memoria actualizados el 21-08.
