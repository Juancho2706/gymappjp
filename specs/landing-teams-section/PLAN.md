# Landing Teams Section - PLAN

**Status:** DRAFT
**Owner:** Equipo EVA (estrategia Teams-first)
**Last updated:** 2026-06-12
**Spec:** `specs/landing-teams-section/SPEC.md`

> Plan fuente (autoridad): `docs/plans/estrategia/02-PLAN-landing-teams-ui.md`. Este doc SDD resume la arquitectura para cumplir la regla del repo ("sin SPEC.md no se implementa"); ante divergencia, manda el plan 02.

---

## Architecture

Marketing puro de la landing pública (`/`). NO hay capa de datos de negocio: nada de `_data` → `services` → `infrastructure/db` → Supabase. La única pieza de servidor es un route handler de medición (`/api/contact-teams`) que NO toca DB (excepción aprobada por el dueño 2026-06-11; cero servicios pagos nuevos).

Patrón de presentación (Atomic Design — Opción B): `LandingTeamsSection` es un componente domain-specific de landing (`components/landing/`), no se promueve a atoms/molecules (no se reusa en 3+ domains). Espejo de los componentes hermanos: `'use client'`, framer-motion `whileInView` con `viewport={{ once: true }}`.

Copy: 100% i18n (`landing.*` en `es.json` + `en.json`, mismo commit). Correo de ventas centralizado en `SALES_EMAIL` (`lib/brand-assets.ts`). Acento visual emerald (`BRAND_PRIMARY_COLOR = '#10B981'`, clases Tailwind `emerald-*`), distinto del azul `primary` del embudo coach-solo.

## Files

| Action | Path | Notes |
|---|---|---|
| UPDATE | `apps/web/src/lib/brand-assets.ts` | `SALES_EMAIL` + helper `teamsContactMailto` (subject D4, sin body) — **TAREA SETUP (este spec)** |
| UPDATE | `apps/web/src/lib/i18n/es.json` | claves Teams nuevas; eliminar huérfana `landing.pricing.enterprise` — **TAREA SETUP** |
| UPDATE | `apps/web/src/lib/i18n/en.json` | mismo set traducido; eliminar huérfana — **TAREA SETUP** |
| CREATE | `apps/web/src/components/landing/LandingTeamsSection.tsx` | sección Teams (F2) |
| DELETE | `apps/web/src/components/landing/LandingEnterpriseSection.tsx` | D7 (F1.5) |
| UPDATE | `apps/web/src/app/page.tsx` | import/render swap, metadata, JSON-LD Teams, `overflow-x-clip` (F1.1) |
| UPDATE | `apps/web/src/components/landing/LandingPillNav.tsx` | `NAV_ITEMS` única + item Teams (F1.2) |
| UPDATE | `apps/web/src/components/landing/LandingFinalCTA.tsx` | footnote Empresas via `/api/contact-teams?src=final-cta` (F1.3) |
| UPDATE | `apps/web/src/components/landing/LandingPricingPreview.tsx` | callout Teams (F1.4); grid/carousel/TeamsPlanCard diferidos al plan 04 (F3) |
| CREATE | `apps/web/src/app/api/contact-teams/route.ts` | GET → mide clic → 302 mailto (F2bis) |
| CREATE | `apps/web/tests/landing-teams.spec.ts` | E2E landing (F4.1) |
| CREATE | `apps/web/src/lib/i18n/i18n-parity.test.ts` + detector de huérfanas | paridad GLOBAL + orphans (F4.2/F4.3) |
| CREATE | `specs/landing-teams-section/{SPEC,PLAN,TASKS}.md` | SDD (F0) — **TAREA SETUP** |

## Data Model

- DB changes: **none** (marketing puro).
- RLS impact: **none**.
- Generated types impact: **none**.

## Server Actions

- No hay server actions en v1. Única pieza de servidor: route handler `GET /api/contact-teams`:
  - Lee `?src=` con **allowlist cerrada** (`teams-section` | `final-cta` | `pricing-callout`; cualquier otro → `unknown`, no reflejar input arbitrario).
  - Registra evento (`contact_teams_click`, prop `src`) en PostHog server-side o `console.info` estructurado. Sin DB.
  - Responde `302` con `Location: mailto:${SALES_EMAIL}?subject=…` (subject D4 desde `teamsContactMailto`, sin parámetros con contexto del usuario).
- Validation schema: enum de `src` (allowlist) — no Zod necesario por ser un único query param trivial; allowlist explícita en el handler.
- Revalidation path: n/a (GET, sin mutación).
- Formulario "Empresas" vía Resend (server action + Zod + rate limit + honeypot): **diferido a v2** (§F5).

## UI/UX

- Mobile viewport: sección en flujo normal `py-16 sm:py-24`; sin `h-screen`/`100vh`; el wrapper de la página usa `min-h-dvh`. Wrapper cambia `overflow-x-hidden` → `overflow-x-clip` (regla del repo).
- Dark mode: variants `dark:` en TODOS los tokens emerald nuevos (fondos, bordes, textos) — espejo del manejo dual del pricing preview.
- Acento emerald (`emerald-*`) para Teams; los CTAs de registro siguen en `primary` (azul) — no competir con el embudo coach-solo.
- Componentes: route-local (`components/landing/`); `TeamsPlanCard` será componente dedicado (D8), NO un tier falso en `SubscriptionTier`.
- Accesibilidad: `aria-labelledby="teams-section-heading"`, `focus-visible:ring` en el CTA, iconos lucide `aria-hidden`.
- **Regla dura:** cero precios en la sección, callout, card y JSON-LD; cero mención de IVA.

## Phases

1. **F0 — SDD:** SPEC/PLAN/TASKS (este spec). **TAREA SETUP.**
2. **SETUP:** `SALES_EMAIL` + helper en `brand-assets.ts`; claves i18n es/en (contrato); eliminar huérfana. **Corre primero — todos dependen de las claves.**
3. **F1 + F2 + F2bis (una tanda/commit):** limpieza enterprise + `LandingTeamsSection` + route handler `/api/contact-teams` + i18n + typecheck/vitest.
4. **F4:** specs/tests (E2E landing + paridad i18n GLOBAL + detector de huérfanas).
5. **F3:** pricing preview a 4 cards + `TeamsPlanCard` — **bloqueado por el plan 04** (no ejecutar hasta el merge de 04).
6. **F5:** diferidas (formulario Empresas Resend, asset visual del panel, revisión IVA al constituirse la SpA).

## Test Plan

- Unit (vitest, por tanda): paridad i18n GLOBAL es/en; detector de keys huérfanas (con allowlist documentada para keys dinámicas tipo `landing.pricing.${tier}.*`).
- Integration: n/a (sin capa de datos).
- E2E (Playwright, SOLO en el GATE autorizado): `tests/landing-teams.spec.ts` — nav sin "Para Gyms"/con "Teams" (desktop + sheet mobile); `#teams` con H2 visible; **guard anti-precio** scoped a `section#teams` + guard anti-precio del JSON-LD; CTAs apuntan a `/api/contact-teams?src=`; `GET /api/contact-teams` responde `302` con `Location` mailto (request con `maxRedirects: 0`); callout ancla a `#teams`; body de la landing sin `/enterprise/i`.
- Manual (checklist en TASKS.md): light/dark; viewports 375/768/1280/1536; `overflow-x-clip` sin recortes; CTA→mailto cross-browser; subtexto exacto "Te contactamos a la brevedad"; embudo coach-solo intacto; toggle EN sin strings ES residuales.

## Rollback Plan

Es marketing puro y atómico por commit. Revert más pequeño y seguro: `git revert` del commit de la tanda F1+F2+F2bis restaura `LandingEnterpriseSection` (vive en git history), el nav y los callouts. El route handler `/api/contact-teams` no tiene estado (sin DB), así que su eliminación es inocua. La constante `SALES_EMAIL` y las claves i18n son aditivas y no rompen nada si quedan (refactor sin cambio visual).
