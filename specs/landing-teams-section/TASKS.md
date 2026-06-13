# Landing Teams Section - TASKS

**Status:** DRAFT
**Owner:** Equipo EVA (estrategia Teams-first)
**Last updated:** 2026-06-12
**Spec:** `specs/landing-teams-section/SPEC.md`
**Plan:** `specs/landing-teams-section/PLAN.md`

> Plan fuente: `docs/plans/estrategia/02-PLAN-landing-teams-ui.md`. Orden global: SETUP → F1+F2+F2bis (una tanda) → F4 → (F3 bloqueada por plan 04) → F5 diferidas.

---

## Tasks

- [x] **T0 — SDD spec (F0)**
  - Scope: crear `SPEC.md`, `PLAN.md`, `TASKS.md` desde los templates de `specs/_templates/`.
  - Verification: los 3 archivos existen con user stories (dueño de centro / empresa / coach-solo no-target) y AC = matriz de verificación del plan 02.

- [x] **T-SETUP-1 — `SALES_EMAIL` + helper mailto (F1.7 / D4)**
  - Scope: en `apps/web/src/lib/brand-assets.ts`, junto a `BRAND_PRIMARY_COLOR`, agregar `export const SALES_EMAIL = 'contacto@eva-app.cl'` y `teamsContactMailto(src?)` que arma `mailto:${SALES_EMAIL}?subject=EVA%20Teams%20-%20quiero%20conversar` SIN body y SIN datos del usuario en la URL.
  - Verification: helper retorna el mailto con subject prefijado; el argumento `src` no se inyecta en la URL (solo trazabilidad del call site).

- [x] **T-SETUP-2 — claves i18n del contrato (F1.6 / D3)**
  - Scope: agregar a `es.json` Y `en.json` (mismo set, traducidas) las claves del CONTRATO: `landing.nav.teams`, `landing.final.empresas`, `landing.teams.{eyebrow,title,prop1..prop4{.title,.desc},cta,ctaSub}`, `landing.pricing.teamsCallout.{title,subtitle,cta,secondary}`, `landing.pricing.teamsCard.{eyebrow,cap1,cap2,cap3,cta}`. Eliminar la huérfana `landing.pricing.enterprise` de ambos.
  - Verification: JSON válido en ambos idiomas; paridad exacta de keys (mismo conteo); huérfana ausente en es y en; **cero números de precio / IVA** en el copy nuevo.

- [ ] **T-F1.1 — `page.tsx` (swap + metadata + JSON-LD + overflow)**
  - Scope: quitar import/render de `LandingEnterpriseSection`, renderizar `<LandingTeamsSection />` en el mismo slot; meta description sin "enterprise"/"por organización"; segundo JSON-LD `OfferCatalog` "EVA Teams" SIN `price`/`priceCurrency` + `contactPoint` (email `SALES_EMAIL`, `contactType: sales`); `overflow-x-hidden` → `overflow-x-clip`.
  - Verification: grep enterprise = 0 hits en `page.tsx`; JSON-LD sin precio; build verde.

- [ ] **T-F1.2 — `LandingPillNav.tsx` (`NAV_ITEMS` única + Teams) (D12/D5)**
  - Scope: unificar las 2 listas duplicadas (desktop + sheet) en una constante `NAV_ITEMS` de módulo; reemplazar `'Para Gyms'` por `{ key: 'landing.nav.teams', id: 'teams' }`.
  - Verification: una sola fuente de items; nav muestra "Teams" en desktop y sheet; sin "Para Gyms".

- [ ] **T-F1.3 — `LandingFinalCTA.tsx` (footnote Empresas)**
  - Scope: reemplazar el footnote hardcodeado por `landing.final.empresas`; link al embudo `/api/contact-teams?src=final-cta` (D6: link directo, no ancla); correo visible como texto copiable.
  - Verification: footnote i18n; href empieza con `/api/contact-teams?src=`.

- [ ] **T-F1.4 — `LandingPricingPreview.tsx` (callout Teams)**
  - Scope: reescribir el callout con `landing.pricing.teamsCallout.*`; CTA primario ancla `#teams`; link secundario via `/api/contact-teams?src=pricing-callout`; estilo emerald; sin precios.
  - Verification: callout ancla a `#teams`; sin "$49.990"/"$89.990"; dark mode OK.

- [ ] **T-F1.5 — borrar `LandingEnterpriseSection.tsx` (D7)**
  - Scope: eliminar el archivo (sin otros imports — git history lo recupera).
  - Verification: grep `LandingEnterpriseSection` en `src/` = 0 hits.

- [ ] **T-F2 — `LandingTeamsSection.tsx`**
  - Scope: `'use client'`; `<section id="teams" aria-labelledby="teams-section-heading">`; eyebrow pill emerald; H2 `landing.teams.title`; 4 value props (`Users2`, `Palette`, `Activity`/`ClipboardCheck`, `Settings2`/`UserPlus`); CTA card con `teamsContactMailto` via `/api/contact-teams?src=teams-section`, subtexto `landing.teams.ctaSub` ("Te contactamos a la brevedad"); correo visible/copiable; sin imagen en v1; dark mode en todos los tokens.
  - Verification: 4 props + CTA; **cero precios** en la sección; subtexto exacto; `focus-visible:ring`; iconos `aria-hidden`.

- [ ] **T-F2bis — `/api/contact-teams/route.ts` (D11)**
  - Scope: GET; `?src=` allowlist cerrada (`teams-section`|`final-cta`|`pricing-callout`→ else `unknown`); registra `contact_teams_click` (PostHog server-side o `console.info` estructurado, sin DB); `302` con `Location` mailto (subject D4).
  - Verification: `GET ?src=teams-section` → 302, `Location` empieza con `mailto:contacto@eva-app.cl`; valor `src` fuera de allowlist no se refleja crudo.
  - **Decisión a registrar aquí (F2bis.3):** si la QA cross-browser muestra que el `302 → mailto:` no es seguido por algún navegador, se activa el FALLBACK aprobado: href mailto directo + `onClick` no bloqueante que dispara el evento PostHog desde el cliente (mismo contador, cero servicios nuevos). Anotar en este TASKS cuál rige finalmente.

- [ ] **T-F4.1 — `tests/landing-teams.spec.ts`** (escrito ahora; ejecutado solo en el GATE)
  - Scope: nav sin "Para Gyms"/con "Teams" (desktop + sheet mobile); `#teams` con H2 visible; guard anti-precio `/\$\s?\d|CLP\s?\d|\bUF\b|\d{1,3}\.\d{3}/i` scoped a `section#teams`; guard anti-precio del JSON-LD (`OfferCatalog` sin `"price"`/`"priceCurrency"`); CTAs con href `/api/contact-teams?src=`; correo visible; `request.get` con `maxRedirects:0` → 302 + `Location` mailto; callout ancla `#teams`; body sin `/enterprise/i`.
  - Verification: spec escrito y parseable; se corre en el GATE autorizado.

- [ ] **T-F4.2/4.3 — paridad i18n GLOBAL + detector de huérfanas**
  - Scope: `i18n-parity.test.ts` (toda key de es existe en en y viceversa, árbol completo); detector de huérfanas (keys vs literales `t('...')` en `src/**/*.{ts,tsx}`) con **allowlist documentada** para keys dinámicas (familias por prefijo, p. ej. `landing.pricing.group.*`, `landing.pricing.${tier}.*`).
  - Verification: vitest verde; habría cazado `landing.pricing.enterprise` y `landing.pricing.group.business.badge`.

## Checklist visual/manual (F4.4 — se ejecuta antes del deploy)

- [ ] Light + dark mode de la sección Teams y el callout (contraste emerald sobre ambos fondos).
- [ ] Viewports 375 / 768 / 1280 / 1536px — sin scroll horizontal.
- [ ] `overflow-x-hidden` → `overflow-x-clip` (`page.tsx`) NO recorta ni rompe: sticky branding card, carousel mobile del pricing (swipe + dots), animaciones `whileInView`. Si algo se recorta, investigar el contenedor — no revertir a `hidden` sin registrar el porqué.
- [ ] El clic del CTA pasa por `/api/contact-teams` y abre el mailto con subject prefijado en Chrome, Safari y Firefox (desktop y móvil). Si falla, activar el fallback documentado en T-F2bis.
- [ ] El subtexto del CTA dice exactamente "Te contactamos a la brevedad".
- [ ] Embudo coach-solo intacto: hero → register CTA igual que antes.
- [ ] Toggle EN: sección Teams completa traducida (cero strings ES residuales).

## Universal Definition of Done

- [ ] `pnpm typecheck`
- [ ] `pnpm test` (vitest: paridad i18n GLOBAL + huérfanas) por tanda
- [x] No direct feature-data Supabase calls in `_data` (n/a — marketing puro, sin capa de datos)
- [x] Server actions validate with Zod (n/a — el único handler es un GET con allowlist trivial, sin Zod)
- [x] Mutations call `revalidatePath()` where needed (n/a — sin mutaciones)
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Fixed edge UI uses safe-area utilities (si aplica)
- [ ] Dark mode checked when UI changes
- [x] New atomic UI has Storybook story (n/a — `LandingTeamsSection` es domain-specific de landing, no atomic)
- [ ] Docs updated when routes, flows, DB, tests, or priorities change (E2E nuevo → registrar en `docs/testing/TEST_STATUS.md`)

## Notes

- **Regla dura (memoria `project-movida-commercial`):** CERO precios de Teams hasta el cierre Movida (12-jun) — sección, callout, `TeamsPlanCard`, JSON-LD; cero mención de IVA. Guard automatizado + review del diff.
- F3 (pricing preview 4 cards + `TeamsPlanCard`) NO se ejecuta hasta el merge del plan 04: `SALE_TIERS` ya existe; la UI de venta debe iterar `SALE_TIERS`, no `TIER_CONFIG`.
- Playwright NO se corre por tanda; solo en el GATE con autorización explícita (regla 2026-06-10). Preguntar al usuario; coordinar con el gate Movida si sigue pendiente.
