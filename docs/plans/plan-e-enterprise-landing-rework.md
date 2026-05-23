# Plan — Enterprise Landing Rework + Dedicated Enterprise Login

## Context

**Problema actual:**
- `enterprise.eva-app.cl/` ya rewrites a `/enterprise` (middleware OK), pero la landing actual ([apps/web/src/app/enterprise/page.tsx](apps/web/src/app/enterprise/page.tsx)) es genérica, plana, con pricing desactualizado ($49.990 base + $9.990/coach extra — modelo viejo).
- `/org/login` ([apps/web/src/app/org/login/page.tsx](apps/web/src/app/org/login/page.tsx)) es minimal — no se distingue visualmente del coach login `/login` que tiene 2-pane elaborado. Necesita identidad enterprise propia.
- `LandingEnterpriseSection` en eva-app.cl/ usa el mismo pricing obsoleto y CTA débil.
- Pricing canónico actual vive en [docs/ANALISIS_PRECIOS.md](docs/ANALISIS_PRECIOS.md): 4 tiers (Starter $89.990 / Pro $159.990 / Elite $269.990 / Enterprise custom desde $400.000).

**Objetivo:**
1. Rework total estético del enterprise landing — dark corporate + gold/amber accent, múltiples secciones profundas, inspiración 2026 (Stripe/Mercury/Ramp/Linear/Vercel/Anthropic enterprise pages).
2. Login enterprise dedicado — layout único corporativo, MFA badge visible, sin opciones coach/alumno.
3. Funnel desde eva-app.cl/ — actualizar `LandingEnterpriseSection` para invitar claramente a `enterprise.eva-app.cl`.
4. Pricing real (4 tiers de `ANALISIS_PRECIOS.md`) con toggle mensual/anual (20% off).
5. Mantener logo EVA. Conservar middleware rewrite de subdominio ya funcional.
6. Separación dura: enterprise flow vive 100% en subdominio, sin enlaces de retorno a coach/alumno excepto un link discreto en login.
7. **Mobile-first / PWA-grade**: cada sección diseñada primero para 375px, escalando hasta 1920px. Touch targets ≥44px, sin hover-only states, gestos nativos (swipe pricing carousel mobile, bottom-sheet FAQ).
8. **Blueprint para EVA Enterprise app nativa (futura RN/Expo)**: arquitectura de componentes, tokens, patterns y copy serán fuente de verdad para el panel admin org en mobile nativo. Componentes web pensados con paridad mental — bento → stack vertical, hover → tap, modales → bottom sheets, sticky CTAs → tab bar inferior.

**Arquitectura aplicada:**
- **Feature-First**: módulo completo bajo `apps/web/src/app/enterprise/` y `apps/web/src/app/org/login/`.
- **Clean Architecture**: separación `_data/` (contenido + tipos), `_components/` (UI), `_lib/` (theme/utils), `_spec/` (SDD).
- **Atomic Design**: atoms → molecules → organisms → template → page composition.
- **SDD**: archivo `_spec/landing.spec.md` con criterios de aceptación + intent declarado antes de implementar componentes.
- **Mobile-First Responsive**: cada componente nace en mobile y escala vía Tailwind breakpoints (`sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280 / `2xl` 1536). Tokens `dvh`/`pl-safe`/`pr-safe`/`pt-safe`/`pb-safe` per CLAUDE.md mobile viewport rule.
- **PWA Considerations**: si `enterprise.eva-app.cl` se sirve como PWA en futuro, landing debe cumplir manifest + service worker offline-ready (estructura preparada, no implementado en este plan).
- **RN Parity Mental Model**: cada organism documenta su equivalente nativo en comentario top (ej: `// RN equivalent: ScrollView + FlatList<PricingCard>`). Facilita port futuro.

---

## Files

### Modify (existing)

| File | Cambio |
|------|--------|
| [apps/web/src/app/enterprise/page.tsx](apps/web/src/app/enterprise/page.tsx) | Rewrite total — componer organisms del módulo. Solo composición + metadata. |
| [apps/web/src/app/org/login/page.tsx](apps/web/src/app/org/login/page.tsx) | Rework visual completo: single-pane dark, EVA Enterprise badge gold, MFA-required pill, link coach discreto. |
| [apps/web/src/app/org/login/OrgLoginForm.tsx](apps/web/src/app/org/login/OrgLoginForm.tsx) | Restyle inputs/CTA con palette enterprise. Mantener lógica auth intacta. |
| [apps/web/src/components/landing/LandingEnterpriseSection.tsx](apps/web/src/components/landing/LandingEnterpriseSection.tsx) | Restyle a nueva paleta + actualizar pricing a "Desde $89.990/mes · 4 planes" + CTA fuerte → `enterprise.eva-app.cl` + nota "Login y panel separados". |
| [apps/web/src/middleware.ts](apps/web/src/middleware.ts) | Centralizar hardcoded `enterprise.eva-app.cl` en helper `getEnterpriseDomain()` que lee `process.env.ENTERPRISE_DOMAIN` con fallback. Mantener rewrite logic. |

### Create — `apps/web/src/app/enterprise/`

**Spec (SDD):**
- `_spec/landing.spec.md` — intent, audiencia, secciones, criterios de aceptación, métricas success.

**Data:**
- `_data/enterprise-content.ts` — copy completo (hero, sections, pricing, FAQ, use cases) tipado.
- `_data/enterprise-pricing.ts` — tiers tipados desde `ANALISIS_PRECIOS.md` + lógica toggle anual.

**Lib:**
- `_lib/enterprise-theme.ts` — tokens palette (zinc-950 base, amber-400/500 accent, gradients gold), typography scale, motion presets.

**Components (atoms):**
- `_components/atoms/GoldBadge.tsx`
- `_components/atoms/GradientButton.tsx` (variantes: primary gold, ghost, outline)
- `_components/atoms/MetricCounter.tsx` (animated)
- `_components/atoms/GlowDot.tsx`
- `_components/atoms/SectionEyebrow.tsx`

**Components (molecules):**
- `_components/molecules/PricingCard.tsx` (con badge "Más popular")
- `_components/molecules/FeatureCard.tsx`
- `_components/molecules/UseCaseCard.tsx`
- `_components/molecules/FaqItem.tsx`
- `_components/molecules/ComparisonRow.tsx`
- `_components/molecules/IntegrationLogo.tsx`

**Components (organisms — secciones):**
- `_components/sections/EnterpriseNav.tsx` — sticky top, logo + Enterprise pill gold, anchors, [Login] [Demo]
- `_components/sections/EnterpriseHero.tsx` — eyebrow, headline 6xl-7xl, sub, dual CTA, trust badges row, gradient mesh background
- `_components/sections/EnterpriseLogoWall.tsx` — placeholders "Confían en EVA" (estructura lista para logos reales)
- `_components/sections/EnterpriseProblemStatement.tsx` — pain points multi-coach gyms → EVA solution
- `_components/sections/EnterpriseFeatureBento.tsx` — bento grid 6-8 features (pool compartido, aislamiento RLS, panel multi-coach, anuncios, nutrition templates, health score, branding por coach, audit logs)
- `_components/sections/EnterpriseUseCases.tsx` — 4 cards (Gimnasios urbanos, Academias deportivas, Federaciones, Franquicias/Cadenas)
- `_components/sections/EnterpriseSecurityCompliance.tsx` — MFA obligatorio, RLS Supabase, audit logs, cookies aisladas por subdominio, Ley 19.628 Chile
- `_components/sections/EnterpriseROIComparison.tsx` — tabla "5 cuentas individuales ($149.950) vs Starter Gym ($89.990) = ahorro $719.520/año" + calculadora interactiva por número de coaches
- `_components/sections/EnterprisePricing.tsx` — 4 tier cards + toggle Mensual/Anual (20% off anual) + nota "Cotizar Enterprise desde $400.000"
- `_components/sections/EnterpriseIntegrations.tsx` — grid logos: MercadoPago, Resend, Supabase, Web Push, próximamente
- `_components/sections/EnterpriseTestimonials.tsx` — estructura placeholder para casos de éxito
- `_components/sections/EnterpriseFAQ.tsx` — accordion 8-10 preguntas (privacidad coach-coach, cancelación, MFA, white-label, soporte, migración desde cuentas individuales)
- `_components/sections/EnterpriseFinalCTA.tsx` — gradient panel "Empezá hoy" + Calendly + email
- `_components/sections/EnterpriseFooter.tsx` — legal links, contacto, social, copyright + "EVA Enterprise · enterprise.eva-app.cl"

### Create — `apps/web/src/app/org/login/`

- `_components/EnterpriseLoginShell.tsx` — wrapper full-bleed dark con gradient mesh, glass card central, EVA Enterprise badge gold, MFA-required pill, footer compliance mini
- `_components/EnterpriseAuthFooter.tsx` — link discreto "¿Coach individual? eva-app.cl/login" + compliance copy

### Create — Tests

- `apps/web/tests/enterprise/landing.smoke.spec.ts` — Playwright smoke: render hero, 4 pricing tiers visibles, CTAs Calendly + login, toggle anual/mensual funcional, FAQ expandible
- `apps/web/tests/enterprise/login.smoke.spec.ts` — render página, MFA badge visible, link coach presente, form submit redirect

---

## Mobile-First Responsive Strategy

**Breakpoint map (Tailwind defaults, mobile-first):**

| Breakpoint | Width | Target | Layout principle |
|------------|-------|--------|------------------|
| base | 0–639px | Mobile phones | Single column, stack vertical, sticky bottom CTA, hamburger nav drawer |
| `sm:` | 640–767px | Large phones / small tablets portrait | Still single column, padding aumenta |
| `md:` | 768–1023px | Tablets | 2-column donde aplica, top nav visible sin drawer |
| `lg:` | 1024–1279px | Laptops | 3-column bento, full nav, pricing 4-col grid |
| `xl:` | 1280–1535px | Desktops | Hero max-width 1280, generoso whitespace |
| `2xl:` | 1536px+ | Wide monitors | Container max 1440, no full-bleed sin razón |

**Mobile-specific patterns:**

| Patrón | Implementación |
|--------|----------------|
| Touch targets | Mínimo 44×44px (`h-11 min-w-11` o `p-3` mínimo en botones/links) |
| No hover-only | Toda interacción accesible vía tap. `hover:` siempre acompañado de `focus-visible:` y estado `active:` |
| Sticky bottom CTA mobile | En landing: barra inferior fija con "Agendar demo · Login" visible mientras se hace scroll (`fixed bottom-0 inset-x-0 pb-safe` con backdrop-blur). Se oculta en `md:` |
| Hamburger drawer nav | Sheet lateral desde derecha en `<md`. Cierre por swipe + overlay tap |
| Pricing carousel mobile | `<lg`: snap-x carousel horizontal con 4 cards (peek visual del siguiente). `lg+`: grid 4-col. Indicadores de paginación abajo |
| FAQ accordion | Mobile: full-width tap targets, chevron rotate animado. Desktop: same pattern, no cambio |
| Bento → stack | `<md`: bento grid colapsa a stack vertical 1-col. Orden visual priorizado (feature principal primero) |
| Hero CTAs | `<sm`: stack vertical full-width. `sm+`: inline horizontal |
| Tablas responsive (ROI/comparison) | `<md`: convertir a stacked cards con label/valor. `md+`: tabla tradicional |
| Modales/overlays | `<md`: bottom-sheet style (slide-up desde abajo, drag handle visual). `md+`: centered modal |
| Inputs login | `text-base` (16px) mínimo en `<md` para evitar iOS zoom-on-focus |
| Safe areas | `pt-safe pb-safe pl-safe pr-safe` en elementos fixed (top nav, bottom CTA, drawer) |
| `dvh` not `vh` | Hero usa `min-h-dvh` no `min-h-screen` per CLAUDE.md rule |
| `overflow-x: clip` | En `<html>` (ya configurado globalmente) — nunca `overflow-x: hidden` |
| Reduced motion | `motion-safe:` wrap en animaciones Framer Motion. Respetar `prefers-reduced-motion` |
| Image perf | Next `<Image>` con `sizes` correcto por breakpoint. WebP/AVIF auto |
| Font perf | `font-display: swap`, preload solo headline weight |

**Por sección, comportamiento mobile específico:**

- **EnterpriseNav**: `<md` colapsa a logo + hamburger. Drawer con anchors + Login + Demo. Logo siempre visible.
- **EnterpriseHero**: `<sm` headline `4xl` → `sm:5xl` → `md:6xl` → `lg:7xl`. Trust badges wrap en 2 filas en mobile. Background mesh atenuado en mobile (perf).
- **EnterpriseLogoWall**: marquee/carousel horizontal infinito en mobile, grid estático en `md+`.
- **EnterpriseFeatureBento**: `<md` stack 1-col con featured card primero. `md` 2-col asimétrico. `lg+` bento 3-col completo.
- **EnterpriseUseCases**: `<md` snap-x carousel, `md+` grid 2x2, `lg+` 4-col fila.
- **EnterpriseSecurityCompliance**: `<md` stack con icon arriba label abajo, `md+` 2-col split (texto + visual).
- **EnterpriseROIComparison**: calculadora con input slider/stepper (NO input numérico raw) `<md` para mejor UX touch. Output card debajo. `md+` side-by-side.
- **EnterprisePricing**: ver carousel pattern arriba. Card "Más popular" siempre primera en mobile orden.
- **EnterpriseFAQ**: accordion full-width. Solo 1 expandido a la vez en mobile (auto-collapse otros). Desktop permite múltiples.
- **EnterpriseFinalCTA**: `<sm` stack vertical, `sm+` inline.
- **EnterpriseFooter**: `<md` accordion por columna o stack vertical. `md+` 4-col grid.

**Login mobile:**
- Card centered → `<sm` full-width minus 16px padding. `sm+` max-w 400px centered.
- Inputs `h-12` mínimo (touch). `text-base` para evitar zoom iOS.
- Botón submit full-width `h-12`.
- Footer compliance + coach link siempre al fondo con `pb-safe`.
- Background gradient mesh atenuado en mobile (perf budget).

---

## RN/Expo Blueprint Mapping (futura EVA Enterprise app)

Documentado en cada organism vía comentario top. Resumen de equivalencias:

| Web component | RN equivalent | Notas |
|---------------|---------------|-------|
| `EnterpriseNav` (sticky) | `<Stack.Screen options={{ header }}>` + custom header | Hamburger → `Drawer.Navigator` |
| `EnterpriseHero` | `ScrollView` con `ParallaxHeader` | Gradient via `expo-linear-gradient` |
| `EnterpriseFeatureBento` | `FlatList` 2-col en tablet, 1-col phone | Cards como `Pressable` |
| `EnterpriseUseCases` carousel | `FlatList horizontal` con `snapToInterval` | Mismo UX en RN |
| `EnterprisePricing` carousel | `FlatList horizontal` o `react-native-snap-carousel` | Toggle anual via `Switch` |
| `EnterpriseROIComparison` calculator | `Slider` de RN core | Sin cambios lógicos |
| `EnterpriseFAQ` accordion | `Animated.View` con `LayoutAnimation` | Patrón idéntico |
| `EnterpriseFinalCTA` | View con CTA buttons | Igual |
| `Sticky bottom CTA` mobile | `TabBar` o fixed View con `SafeAreaView` | Mejor UX nativo |
| Login form | `KeyboardAvoidingView` + `TextInput` | MFA flow ya planificado en panel |
| Gradient mesh background | `expo-linear-gradient` + `react-native-svg` blobs | O imagen pre-renderizada |
| Glass cards | `BlurView` de Expo (`expo-blur`) | Funciona iOS/Android |

**Tokens compartibles:** `_lib/enterprise-theme.ts` exporta tokens JSON-friendly que pueden ser importados por RN app vía package compartido en monorepo (`packages/design-tokens/` futuro — no se crea en este plan, pero estructura preparada).

**Copy compartible:** `_data/enterprise-content.ts` es texto plano tipado — directamente reutilizable en RN sin cambios.

---

## Visual System (dark corporate + gold/amber)

| Token | Valor | Uso |
|-------|-------|-----|
| `bg-base` | `zinc-950` (#09090b) | Body background |
| `bg-section` | `slate-950` (#020617) | Section variants |
| `bg-card` | `zinc-900/60` con `backdrop-blur` | Glass cards |
| `border-subtle` | `zinc-800` | Card borders |
| `text-primary` | `zinc-100` | Headlines, body |
| `text-secondary` | `zinc-400` | Subcopy |
| `accent-primary` | `amber-400` (#fbbf24) | Buttons, highlights |
| `accent-emphasis` | `amber-500` → `amber-600` gradient | CTAs principales |
| `accent-glow` | `amber-400/20` blur | Background glows |
| Headlines | Inter tight tracking `-0.04em`, peso 600-700, `6xl-7xl` en hero | — |

**Inspiración 2026 destilada:** bento grids (Linear/Vercel), gradient mesh hero (Anthropic), comparison tables (Stripe), security section pattern (Mercury), pricing toggle anual (Ramp), logo wall trust (Plaid), animated metric counters (Modal).

---

## Login enterprise — layout

**Desktop (`md+`):**
```
┌──────────────────────────────────────────┐
│  [EVA logo]  EVA · Enterprise  (badge)   │ ← top-left, fixed
│                                          │
│             ┌──────────────────┐         │
│             │  Panel Enterprise │         │
│             │  Acceso restringido│        │
│             │  [MFA required]   │ ← pill  │
│             │                  │         │
│             │  Email           │         │
│             │  Password        │         │
│             │  [Ingresar] gold │ ← h-12  │
│             │                  │         │
│             │  ¿Olvidaste pw?  │         │
│             └──────────────────┘         │
│                                          │
│  Sesión MFA · Cookies aisladas · v2026   │
│  ¿Coach individual? eva-app.cl/login     │ ← discreto
└──────────────────────────────────────────┘
```

**Mobile (`<md`):**
```
┌────────────────────┐
│ [EVA] Enterprise   │ ← top compact
│                    │
│                    │
│  ┌──────────────┐  │
│  │ Panel Enter. │  │ ← card full-w
│  │ [MFA req]    │  │   minus 16px
│  │              │  │
│  │ Email        │  │ ← h-12, text-base
│  │ Password     │  │
│  │ [Ingresar]   │  │ ← full-width
│  │              │  │
│  │ ¿Olvidaste?  │  │
│  └──────────────┘  │
│                    │
│ Sesión MFA aislada │
│ ¿Coach? eva-app.cl │ ← pb-safe
└────────────────────┘
```

**Reglas:**
- Background: gradient mesh dark + amber glow esquina superior derecha. Atenuado en mobile.
- Sin 2-pane (coach login lo usa — diferenciación intencional).
- Inputs `h-12 text-base` (no zoom iOS).
- CTA submit full-width en mobile, `min-w-40` en desktop.
- `min-h-dvh` no `h-screen` per CLAUDE.md.
- Safe areas en footer.
- Sin Google OAuth (corporate — diferenciador vs coach login que lo tiene).
- Focus ring amber-400, no blue (consistencia con palette).

---

## Pricing — 4 tiers (desde `ANALISIS_PRECIOS.md`)

| Plan | Coaches | Precio mensual | Precio anual (20% off) | Badge |
|------|---------|----------------|------------------------|-------|
| **Starter Gym** | hasta 5 | $89.990 CLP | $71.992/mes ($863.904/año) | — |
| **Pro Gym** | hasta 10 | $159.990 CLP | $127.992/mes | **Más popular** |
| **Elite Gym** | hasta 20 | $269.990 CLP | $215.992/mes | — |
| **Enterprise** | 21+ | Desde $400.000 | Cotizar | Custom |

Toggle Mensual/Anual con animación. Cada card: features list, CTA "Empezar prueba" o "Contactar ventas" (Enterprise).

---

## Main domain `LandingEnterpriseSection` — cambios

- Mantener posición en eva-app.cl/ landing flow.
- Restyle a nueva paleta dark + amber (consistencia con subdomain).
- Headline: "Para gyms, academias y franquicias"
- Sub actualizado: "Hasta 20+ coaches bajo un solo panel. White-label por coach incluido."
- Quitar pricing card detallado — solo "Planes desde $89.990/mes · 4 tiers"
- CTA principal: "Conocé EVA Enterprise →" → `https://enterprise.eva-app.cl`
- Nota debajo del CTA: "Acceso, login y panel separados en enterprise.eva-app.cl"

---

## Middleware — ajuste mínimo

- Centralizar `'enterprise.eva-app.cl'` (líneas 85, 110 de [middleware.ts](apps/web/src/middleware.ts)) en helper `lib/enterprise/domain.ts` que lee `process.env.ENTERPRISE_DOMAIN ?? 'enterprise.eva-app.cl'`.
- Verificar que rewrites para `/`, `/login`, `/org/*` siguen funcionando.
- **Sin nuevas rutas** — landing es single-page con anchors (`#producto`, `#pricing`, `#seguridad`, `#faq`, `#contacto`).

---

## Reuse — funciones existentes

- `OrgLoginForm` ([apps/web/src/app/org/login/OrgLoginForm.tsx](apps/web/src/app/org/login/OrgLoginForm.tsx)) — mantener lógica auth, solo restyle.
- Framer Motion ya usado en `LandingEnterpriseSection` — reutilizar para animaciones in-view.
- Tailwind `@theme` en `globals.css` — agregar tokens enterprise (no nueva config).
- Iconos Lucide ya importados en proyecto — usar.
- `getCoachOrgContext()` no afectado (login + auth lógica intacta).

---

## SDD spec — `_spec/landing.spec.md` contenido

**Intent:** convertir visitas B2B en demos agendadas y trials enterprise. Servir además como fuente de verdad de diseño para la futura EVA Enterprise app nativa.

**Audiencia:**
- Primario: dueño gym (3+ coaches), director academia, manager franquicia.
- Secundario: head ops de cadenas/federaciones evaluando platform.
- Terciario: coaches individuales curiosos sobre upgrade a equipo.

**Tono:** corporativo, premium, técnico cuando necesario (security section), pero sin jergón. Español Chile.

**Criterios de aceptación funcionales:**
- Landing renderiza en todos los breakpoints sin overflow horizontal ni layout shift (CLS <0.05).
- Hero CTA visible above-the-fold en 375px height 667px (iPhone SE baseline).
- Pricing toggle Mensual/Anual funcional sin reload, con animación.
- 4 tiers con info completa (precio, coaches, features, CTA).
- ROI calculator interactivo: slider de coaches (1–50) → output ahorro mensual/anual calculado en cliente.
- FAQ expandible con animación. En mobile solo 1 abierto a la vez.
- Carousel pricing mobile con snap + indicadores.
- Sticky bottom CTA en mobile aparece tras scroll >50vh.
- Drawer nav mobile abre/cierra con animación, cierra al tap en overlay o swipe.
- Todos los links externos `target="_blank" rel="noopener"`.
- Login submit lleva a `/org/[slug]/dashboard` o `/org/[slug]/setup-mfa` si requires_mfa_setup.

**Criterios de aceptación visual:**
- Paleta dark zinc-950 + amber-400/500 consistente en 100% componentes.
- Sin tonos azules (#007AFF coach) ni verdes EVA (#10B981) salvo en logo.
- Headlines `tracking-tight` con escala responsive correcta.
- Glow + gradient mesh visible pero no distractor.
- Iconos Lucide uniformes (`stroke-width: 1.5`).

**Criterios de aceptación a11y:**
- Lighthouse a11y ≥95.
- Todos los inputs con `<label>` asociado o `aria-label`.
- Color contrast WCAG AA mínimo (zinc-400 sobre zinc-950 = 7.5:1 OK).
- Focus visible en todos los interactivos (`focus-visible:ring-2 ring-amber-400`).
- Headings jerárquicos correctos (1 h1, h2 por section, h3 dentro).
- Accordion FAQ con `aria-expanded` + `aria-controls`.
- Carousel con `role="region"` + `aria-label` + controles teclado.
- `prefers-reduced-motion` respetado.

**Performance budget mobile (3G slow simulated):**
- LCP <2.5s
- FCP <1.8s
- TTI <3.8s
- CLS <0.05
- INP <200ms
- JS bundle landing <200KB gzipped
- CSS <50KB gzipped
- Images lazy-loaded vía Next Image
- Lighthouse perf mobile ≥90

**Métricas success (post-launch):**
- Conversión a Calendly demo (track via posthog event)
- Conversión a `/org/login` form submit
- Bounce rate <50%
- Avg time on page >90s
- Mobile vs desktop split tracking

**No-goals (out of scope spec):**
- A/B testing infrastructure
- Multi-idioma (solo español)
- Live chat widget
- Tour guiado / product walkthrough video

---

## Verification

### Local dev

```bash
cd apps/web && npm run dev
# En dev localhost no aplica rewrite subdomain — usar paths directos:
# http://localhost:3000/enterprise         → nueva landing
# http://localhost:3000/org/login          → nuevo login enterprise
# http://localhost:3000/                   → ver LandingEnterpriseSection actualizada

# Para probar rewrite subdomain en local:
# Agregar a C:\Windows\System32\drivers\etc\hosts:
#   127.0.0.1 enterprise.localtest.me
# Visitar http://enterprise.localtest.me:3000/ → debe rewrite a /enterprise
# Alt: curl -H "Host: enterprise.eva-app.cl" http://localhost:3000/
```

### Static checks

```bash
cd apps/web && npm run typecheck      # 0 errors esperados
cd apps/web && npm run lint           # 0 errors/warnings
cd apps/web && npm run build          # bundle size <200KB JS / <50KB CSS
```

### Playwright smoke tests

```bash
cd apps/web && npx playwright test tests/enterprise/landing.smoke.spec.ts
cd apps/web && npx playwright test tests/enterprise/login.smoke.spec.ts

# Multi-device run (mobile + desktop):
cd apps/web && npx playwright test tests/enterprise/ \
  --project=chromium --project=mobile-chrome --project=mobile-safari
```

### Mobile responsive checklist (DevTools device emulation)

Probar en cada uno:
- iPhone SE (375×667) — baseline más chico
- iPhone 14 Pro (393×852)
- Pixel 7 (412×915)
- iPad Mini (768×1024)
- iPad Pro (1024×1366)
- Desktop 1280px
- Desktop 1920px

**Por device verificar:**
- [ ] Sin overflow horizontal (`document.documentElement.scrollWidth === window.innerWidth`)
- [ ] Hero CTA visible above-the-fold
- [ ] Hamburger drawer abre/cierra (touch + esc key desktop)
- [ ] Pricing carousel snap funciona con swipe (mobile) / drag (desktop)
- [ ] Sticky bottom CTA aparece tras scroll >50vh en mobile, no en `md+`
- [ ] FAQ accordion: solo 1 abierto a la vez en mobile, múltiples en desktop
- [ ] ROI calculator slider responde a touch sin lag
- [ ] Inputs login no causan zoom en iOS Safari (text-base verified)
- [ ] Safe areas respetadas (test en device real iPhone con notch si posible)
- [ ] Logo wall marquee fluido en mobile, no janky
- [ ] Imágenes Next con `sizes` correcto (DevTools Network: WebP servido)

### A11y audit

```bash
# Lighthouse CLI
cd apps/web && npx lighthouse http://localhost:3000/enterprise \
  --only-categories=accessibility,performance,best-practices,seo \
  --form-factor=mobile --throttling-method=simulate

# Esperado: a11y ≥95, perf ≥90, best-practices ≥95, SEO ≥95
```

**Manual a11y:**
- [ ] Tab key navega por todos los interactivos en orden lógico
- [ ] Focus ring visible amber-400 en cada elemento
- [ ] Screen reader (NVDA/VoiceOver) anuncia secciones correctamente
- [ ] FAQ accordion anuncia estado expanded/collapsed
- [ ] Pricing toggle anuncia "mensual" / "anual"
- [ ] `prefers-reduced-motion` deshabilita animaciones (DevTools rendering tab)

### Visual review checklist

- [ ] Hero loads <600ms (DevTools Performance trace)
- [ ] 4 pricing tiers visibles con info correcta (Starter 5 / Pro 10 / Elite 20 / Enterprise 21+)
- [ ] Toggle mensual/anual aplica 20% off correctamente
- [ ] "Más popular" badge en Pro Gym
- [ ] ROI calculator: input 5 coaches → output ahorro $59.960/mes coincide con doc
- [ ] FAQ accordion abre/cierra suavemente
- [ ] Login form submit redirige correctamente
- [ ] Dark mode siempre (no toggle visible — diferenciador vs main eva-app.cl)
- [ ] Logo EVA visible y consistente en landing + login + nav
- [ ] CTAs Calendly abren en nueva tab

### Cross-domain validation

- [ ] `eva-app.cl/` → LandingEnterpriseSection muestra CTA actualizado a `enterprise.eva-app.cl`
- [ ] Click CTA → navega a subdomain
- [ ] `enterprise.eva-app.cl/` → muestra nueva landing (no redirige)
- [ ] `enterprise.eva-app.cl/login` → muestra nuevo login enterprise
- [ ] `enterprise.eva-app.cl/org/dashboard` (auth) → panel funciona
- [ ] `eva-app.cl/org/anything` → redirige a `enterprise.eva-app.cl/org/anything`
- [ ] Cookies aisladas: login en enterprise no autentica en main domain y viceversa

### Production smoke (post-deploy)

```
https://enterprise.eva-app.cl/         → landing nuevo
https://enterprise.eva-app.cl/login    → login enterprise
https://eva-app.cl/#enterprise         → sección actualizada con CTA al subdomain
```

### Performance budget enforcement

```bash
# Bundle analyzer
cd apps/web && ANALYZE=true npm run build

# Check sizes
# - apps/web/.next/static/chunks/app/enterprise/page-*.js  → <50KB gzipped
# - apps/web/.next/static/chunks/app/org/login/page-*.js   → <30KB gzipped
```

---

## Implementation Order (sugerencia ejecución incremental)

**Fase 1 — Foundations (no UI visible aún)**
1. Crear `_spec/landing.spec.md` con acceptance criteria final.
2. Crear `_lib/enterprise-theme.ts` con tokens (palette, gradients, typography, motion).
3. Crear `_data/enterprise-content.ts` + `_data/enterprise-pricing.ts` tipados.
4. Crear `lib/enterprise/domain.ts` helper + refactorizar `middleware.ts` para usarlo.

**Fase 2 — Atoms + Molecules**
5. Atoms: GoldBadge, GradientButton, MetricCounter, GlowDot, SectionEyebrow.
6. Molecules: PricingCard, FeatureCard, UseCaseCard, FaqItem, ComparisonRow, IntegrationLogo.

**Fase 3 — Organisms landing (orden de scroll)**
7. EnterpriseNav (con drawer mobile).
8. EnterpriseHero.
9. EnterpriseLogoWall.
10. EnterpriseProblemStatement.
11. EnterpriseFeatureBento.
12. EnterpriseUseCases.
13. EnterpriseSecurityCompliance.
14. EnterpriseROIComparison.
15. EnterprisePricing (con toggle + carousel mobile).
16. EnterpriseIntegrations.
17. EnterpriseTestimonials.
18. EnterpriseFAQ.
19. EnterpriseFinalCTA.
20. EnterpriseFooter.

**Fase 4 — Composición + sticky CTA mobile**
21. `app/enterprise/page.tsx` compose todos los organisms.
22. Sticky bottom CTA mobile (separate client component con scroll listener).

**Fase 5 — Login enterprise**
23. `EnterpriseLoginShell` wrapper.
24. Restyle `OrgLoginForm` (mantener lógica auth).
25. `EnterpriseAuthFooter` (compliance + coach link).
26. Update `app/org/login/page.tsx` para usar shell.

**Fase 6 — Funnel main domain**
27. Restyle `LandingEnterpriseSection` con nueva paleta + pricing actualizado + CTA mejorado.

**Fase 7 — Tests + verification**
28. Smoke tests Playwright (landing + login).
29. Lighthouse audit mobile + desktop.
30. Manual checklist responsive + a11y.

**Fase 8 — Docs + handoff**
31. Update `docs/architecture/FLOWS_AND_COMPONENTS.md` con nuevo módulo enterprise.
32. README en `app/enterprise/_components/README.md` documentando atomic structure + RN parity notes.

---

## Risks & Mitigations

| Riesgo | Mitigación |
|--------|------------|
| Bundle size landing crece >200KB por Framer Motion + componentes | Dynamic import secciones below-the-fold; usar `motion-safe:` para no penalizar reduced-motion users |
| ROI calculator state hydration mismatch | Componente 100% client (`'use client'`) con valor inicial default consistente |
| Pricing carousel snap UX buggy en Safari mobile | Test exhaustivo en Safari iOS real; fallback a stack vertical si snap falla |
| Hardcoded `enterprise.eva-app.cl` en más lugares no detectados | Grep global pre-deploy: `grep -r "enterprise.eva-app.cl" apps/web/src` |
| Cookies cross-subdomain leak | Verificar `Set-Cookie` headers en DevTools — debe ser `Domain=enterprise.eva-app.cl` no `.eva-app.cl` |
| Coach intenta loguear en enterprise login → confusión UX | Mensaje error claro si auth falla por rol mismatch + link discreto a coach login |
| Cambios en `LandingEnterpriseSection` rompen layout main page | Test visual snapshot pre/post |
| Performance regression mobile | Lighthouse CI step antes de merge |
| Diseño no se traduce bien a RN futuro | Comentarios `// RN equivalent: ...` en cada organism para forzar pensamiento parity |
| Pricing en doc desactualiza vs landing | Single source of truth: `_data/enterprise-pricing.ts` con comentario referenciando `docs/ANALISIS_PRECIOS.md` |

---

## Out of scope (no incluido en este plan)

- Backend changes (auth, RLS, org_invites) — login reusa lógica existente.
- Cambios al panel `/org/[slug]/*` (dashboard, coaches, clients, etc.) — solo landing + login.
- Migrations DB.
- App nativa RN/Expo de EVA Enterprise — este plan sienta blueprint (tokens + copy + patterns) pero no implementa nativo.
- PWA manifest + service worker enterprise — estructura preparada, implementación en plan futuro.
- Logos reales de clientes (estructura placeholder lista, swap manual cuando estén).
- Testimoniales reales (estructura placeholder).
- A/B testing infra.
- i18n — todo en español Chile (consistencia con resto del sitio).
- Pricing logic backend — solo display en landing; checkout/billing sigue manual via MercadoPago link/transferencia.
- Tour interactivo de producto / video walkthrough.
- Live chat widget.
- Blog/recursos section (puede agregarse en iteración futura).
- Analytics events custom más allá de Posthog ya existente.
