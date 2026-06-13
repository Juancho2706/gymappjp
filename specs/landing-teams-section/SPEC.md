# Landing Teams Section - SPEC

**Status:** DRAFT
**Owner:** Equipo EVA (estrategia Teams-first)
**Last updated:** 2026-06-12
**Related plan:** `docs/plans/estrategia/02-PLAN-landing-teams-ui.md`

---

## Problem

La landing pública (`/`) todavía vende **Enterprise** (sección, callouts, nav "Para Gyms", precios "$49.990"/"$89.990", Calendly, subdominio `enterprise.eva-app.cl`). Tras la decisión Teams-first de los socios (2026-06-11), enterprise queda archivado comercialmente y la nueva segunda forma de venta es **EVA Teams** (pool plano de coaches para centros de entrenamiento y equipos multidisciplinarios). La landing debe dejar de mostrar enterprise y empezar a presentar Teams como pitch corto a la audiencia secundaria, sin publicar NINGÚN precio antes del cierre de la negociación Movida (reunión 12-jun).

Es marketing puro de la landing: cero DB, cero migraciones, cero rutas protegidas. No choca con el gate Movida.

## Users

- **Primary (visitante dueño de centro):** dueño/a o coordinador/a de un centro de entrenamiento que escanea la home buscando "para equipos/centros". Necesita entender en <5 s que EVA sirve para su caso (pool compartido, marca del centro, módulos profesionales, equipo self-service) y un camino claro para conversar.
- **Secondary (visitante empresa):** representante de una empresa/organización que no encaja en self-service; necesita una vía de contacto comercial (`contacto@eva-app.cl`).
- **Internal/operator (ventas):** rol SDR que recibe los leads en el inbox de ventas y necesita triage (subject prefijado del mailto) y medición de clics del CTA Teams para decidir si el formulario v2 vale la inversión.
- **No-target a proteger (visitante coach-solo):** coach individual que es el cliente que paga hoy. El embudo coach-solo (hero → callouts → pricing → student tabs → CTA final) NO debe distraerse ni romperse; Teams es secundario y va en el slot previo al CTA final.

## Goals

- Sacar toda la superficie enterprise visible de la landing (nav, sección, callouts, metadata, JSON-LD).
- Presentar **EVA Teams** con un pitch corto: eyebrow + H2 + 4 value props + 1 CTA al embudo de contacto.
- Redirigir el CTA "gym/academia/empresa" al embudo Teams + correo `contacto@eva-app.cl` (mailto v1, medido vía `/api/contact-teams`).
- Centralizar el correo de ventas en `SALES_EMAIL` (`lib/brand-assets.ts`); copy nuevo 100% i18n es/en.
- Dejar **diseñado** (no ejecutado) el pricing preview a 4 cards + `TeamsPlanCard` (bloqueado por el plan 04).

## Non-Goals

- Publicar cualquier precio de Teams (regla dura hasta el cierre Movida del 12-jun) — ni "desde $X", ni rangos, ni "ahorra X%", ni UF, ni IVA.
- Formulario "Empresas" vía Resend (v2 diferida, §F5 del plan).
- Redirect 308 `/enterprise` → `/pricing`, crons, copy legal, org de prueba (scope del plan 01).
- Recorte 6→4 cards del pricing preview en runtime (bloqueado por el plan 04).
- Cambios de DB, migraciones, RLS o rutas protegidas (`/org`, proxy).

## User Stories

- Como **dueño de centro**, quiero ver una sección clara "para equipos/centros" con las capacidades clave, para entender en segundos que EVA sirve a mi negocio y cómo contactar.
- Como **representante de empresa**, quiero un correo de contacto comercial visible y un CTA medido, para iniciar una conversación sin depender de self-service.
- Como **ventas (operador)**, quiero que cada clic del CTA Teams se mida y llegue al inbox con subject prefijado, para hacer triage y decidir si vale el formulario v2.
- Como **coach individual (no-target)**, quiero que el embudo de registro siga intacto y sin distracciones, para seguir contratando un plan self-service sin fricción.

## Acceptance Criteria

(Matriz de verificación del plan 02 — §Verificación.)

- [ ] **Archivado:** grep `LandingEnterpriseSection|#enterprise|enterprise\.eva-app\.cl|calendly` en `src/components/landing/` + `src/app/page.tsx` = 0 hits; meta description sin "enterprise" ni "por organización"; nav sin "Para Gyms" (desktop y sheet mobile, ambos desde la `NAV_ITEMS` única).
- [ ] **Teams (funcional):** `#teams` renderiza eyebrow + H2 "EVA Teams — tu centro completo en una plataforma" + 4 value props + CTA al embudo de contacto; subtexto exactamente "Te contactamos a la brevedad"; el callout del pricing preview ancla a `#teams`.
- [ ] **Regla dura anti-precio (security/comercial):** CERO números de precio en `section#teams`, en el callout, en `TeamsPlanCard` y en el JSON-LD `OfferCatalog` Teams — ni `$X`, ni `CLP X`, ni `X UF`, ni miles con punto chileno, ni IVA. Guard automatizado: dentro de `section#teams` no matchea `/\$\s?\d|CLP\s?\d|\bUF\b|\d{1,3}\.\d{3}/i`; el JSON-LD Teams no contiene `"price"` ni `"priceCurrency"`.
- [ ] **Medición/observabilidad (F2bis):** `GET /api/contact-teams?src=teams-section` responde `302` con `Location` que empieza con `mailto:contacto@eva-app.cl`; los 3 CTAs (sección Teams, footnote FinalCTA, callout pricing) apuntan a `/api/contact-teams?src=…`; el correo `contacto@eva-app.cl` es texto visible/copiable junto a cada CTA; el evento de clic se registra (PostHog server-side o log estructurado, cero servicios nuevos).
- [ ] **Mobile/responsive:** sin `h-screen`/`100vh` fuera de `md:`; sección en flujo normal (`py-16 sm:py-24`); sin scroll horizontal en 375/768/1280/1536px; nav item "Teams" visible en desktop y al abrir el sheet mobile.
- [ ] **Accesibilidad:** `section#teams` con `aria-labelledby`; CTA con `focus-visible:ring`; iconos `aria-hidden`; dark mode en todos los tokens emerald nuevos.
- [ ] **i18n:** copy nuevo 100% via `landing.teams.*`, `landing.nav.teams`, `landing.final.empresas`, `landing.pricing.teamsCallout.*`, `landing.pricing.teamsCard.*` en es.json Y en.json (mismo set); paridad GLOBAL es/en verde; key huérfana `landing.pricing.enterprise` eliminada de ambos; `SALES_EMAIL` centralizado (cero hrefs `contacto@eva-app.cl` hardcodeados, solo texto visible).
- [ ] **Conversión intacta (no-regresión):** CTAs de registro (`/register?tier=…`) sin cambios en nav, hero, pricing cards y FinalCTA; `tests/navigation-perf-smoke.spec.ts` y `tests/sprint3-register-pricing.spec.ts` siguen verdes.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Se cuela un número de precio que ancla la negociación Movida antes del 12-jun | Alto (comercial) | Regla dura en el spec + guard automatizado anti-precio en `landing-teams.spec.ts` (sección + JSON-LD) + review del diff buscando `$` antes de mergear |
| Romper el embudo coach-solo al mover piezas de la landing | Alto | D1: reemplazo in-place de la sección; nada arriba del pricing se toca; asserts de CTAs de registro |
| Key i18n faltante en un idioma (string crudo en EN) | Medio | Vitest de paridad GLOBAL + detector de keys huérfanas, corren por tanda |
| Sheet mobile y nav desktop desincronizados | Medio → eliminado | Constante `NAV_ITEMS` única para ambas superficies (D12) |
| `mailto:` sin handler en desktop del visitante (lead perdido) | Medio | Correo visible/copiable junto al CTA; `/api/contact-teams` mide los clics; formulario v2 (F5) lo elimina |
| `302 → mailto:` no seguido por algún navegador | Medio | Validación cross-browser en checklist F4.4; fallback aprobado: href mailto directo + evento client-side |
| `overflow-x-clip` recorta sticky/carousel que `hidden` toleraba | Bajo-Medio | Item dedicado en checklist visual F4.4; revertir es 1 clase, registrar el porqué |

## Open Questions

- [ ] ¿El `302 → mailto:` se sigue de forma consistente en Chrome/Safari/Firefox (desktop y móvil)? — se valida en la checklist F4.4; si falla, se activa el fallback documentado (mailto directo + evento client-side).
- [ ] ¿PostHog server-side está cableado o se usa `console.info` estructurado para el evento `contact_teams_click`? — decisión a registrar al implementar §F2bis.
