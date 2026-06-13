# 02 · PLAN — Landing Teams-first (solo UI de la landing page)

> Ejecuta la **Parte I (paso 1) y Parte VI** de la [decisión Teams-first de los socios (2026-06-11)](2026-06-11-teams-first-modulos-addons.md). Volver al [Director de estrategia](00-DIRECTOR.md).
> Plan hermano: [01 — archivado enterprise no-landing](01-PLAN-archivado-enterprise.md) (crons, copy legal, org de prueba — **NO es scope de este plan**).
> Dependencias hacia adelante: [04 — consolidación de planes](04-PLAN-consolidacion-planes-ciclos.md) (bloquea el recorte de cards) y [05 — billing add-ons self-service](05-PLAN-billing-addons-selfservice.md) (formulario Empresas v2 y precios visibles).
> Memorias aplicables: `project-teams-first-strategy`, `project-plan1-gate-pending` (gate Movida = prioridad 1, este plan no lo toca), `project-movida-commercial` (reunión 12-jun — **regla dura: cero precios de Teams publicados antes del cierre**).

## Objetivo

Que la landing pública (`/`) deje de vender Enterprise y empiece a vender **EVA Teams** como segunda forma comercial: (A) sacar toda la superficie enterprise visible de la landing; (B) crear la sección **`LandingTeamsSection`** sin números de precio; (C) redirigir los CTAs de "gym/academia" al embudo Teams + correo `contacto@eva-app.cl` (mailto v1, medido via §F2bis); (D) dejar **diseñado** (no ejecutado) el layout objetivo del pricing preview a 4 cards + card Teams, bloqueado por el plan 04. Solo cambios visuales de la landing — cero DB, cero migraciones; **única excepción de código de servidor, aprobada por el dueño (2026-06-11): el endpoint de medición `/api/contact-teams` (§F2bis), con el stack ya contratado (PostHog/log server-side), cero servicios nuevos**.

**Este plan NO choca con el gate Movida:** no propone migraciones, no toca Supabase, no toca rutas protegidas ni el proxy. Es marketing puro (F1 del roadmap del doc fuente: "barato y sin riesgo, no bloqueada por el gate").

## Decisiones (las del doc fuente no se re-litigan; las técnicas mías van juzgadas)

| # | Decisión | Origen | Juicio |
|---|---|---|---|
| D1 | `LandingTeamsSection` reemplaza a `LandingEnterpriseSection` **en el mismo slot** (`page.tsx:74`, después de `LandingStudentTabs`, antes de `LandingFinalCTA`) | doc fuente Parte VI.2 + mía (slot) | El embudo principal coach-solo (hero → callouts → pricing → student tabs) queda intacto; Teams es el pitch a la audiencia secundaria justo antes del CTA final — misma posición que ya convertía para enterprise. Mover la sección más arriba interrumpiría el flow de conversión individual, que es el que paga hoy. |
| D2 | Acento visual **emerald** (`BRAND_PRIMARY_COLOR = '#10B981'`, `lib/brand-assets.ts:11`) en vez del amber enterprise | mía | Teams es producto EVA core, no un "otro mundo" como lo era enterprise (subdominio aparte). El amber muere con la sección; emerald = identidad de marca EVA según regla del repo. Alternativa (mantener amber) heredaría la asociación visual con lo archivado. |
| D3 | **Todo el copy nuevo via i18n** (`landing.teams.*`, `landing.empresas.*` en `es.json` + `en.json`, mismo commit) | regla del repo | Lo enterprise actual está hardcodeado en ES (`LandingPillNav.tsx:47,91`, `LandingFinalCTA.tsx:44-47`, `LandingPricingPreview.tsx:871-880`, todo `LandingEnterpriseSection.tsx`) — era deuda; al reemplazar se corrige gratis. |
| D4 | CTA mailto con **subject prefijado** (`mailto:contacto@eva-app.cl?subject=EVA%20Teams%20-%20quiero%20conversar`), sin body prefijado | mía | El subject permite triage del inbox de ventas (rol SDR: distinguir lead Teams de soporte). Sin body = cero datos del visitante en la URL (rol Security: un mailto no filtra nada; no agregar parámetros con contexto del usuario). Modelo existente verificado: `pricing/page.tsx:194-196`. **Actualización (mejora aprobada 2026-06-11):** los `href` visibles apuntan al redirect propio `/api/contact-teams?src=…` que cuenta el click y responde 302 al mailto (§F2bis); el correo sigue visible como texto copiable. |
| D5 | El item de nav 'Para Gyms' se **reemplaza** por 'Teams' → `#teams` (no se deja el hueco) — **RATIFICADA por el dueño (2026-06-11)**; el title SEO conserva 'Gyms' (keyword ya rankeada), también ratificado | mía (el doc solo dice quitar) → ratificada | Una sección de venta invisible desde el nav mata el lead-gen que el PM pide ("mensaje Teams primero"); el costo es una línea por nav (desktop + sheet mobile) y es trivialmente reversible. Alternativa (nav minimal sin item) descartada: el research 2026 muestra que el visitante B2B escanea el nav buscando "for teams/business" como señal de que el producto sirve para su caso. |
| D6 | Links pre-sección anclan a `#teams`; links post-sección van directo al embudo de contacto (mailto, servido via `/api/contact-teams` por D11) | mía | El callout del pricing preview está ARRIBA de la sección Teams en el flujo de la página → anclar hacia abajo mantiene al visitante en el pitch. El footnote de `LandingFinalCTA` está DEBAJO (el visitante ya pasó por la sección) → mailto directo, como pide el doc fuente ("links enterprise → CTA Empresas → contacto@eva-app.cl"). Ambas superficies cumplen la directiva: el mailto existe en las dos rutas. |
| D7 | `LandingEnterpriseSection.tsx` se **elimina** (no se deja dormido) | mía | La regla "archivar, no borrar" del doc fuente aplica a infraestructura compartida (workspace engine, org.service, DB) — esto es un componente presentacional sin otros imports (verificado: solo `page.tsx:12`). Dejarlo muerto invita drift; git history lo recupera en segundos si enterprise se desarchive. |
| D8 | Card Teams del pricing preview = **componente dedicado**, NO un tier falso en `SubscriptionTier` | mía | Meter `'teams'` al union type contaminaría `TIER_CONFIG`, validaciones Zod de registro y el mobile carousel con un valor no comprable. Un `TeamsPlanCard` aparte sin precio, con CTA "conversemos", no toca el dominio de suscripciones (que además es territorio del plan 04). |
| D9 | Recorte 6→4 cards: **diseño en este plan, ejecución bloqueada por el [plan 04](04-PLAN-consolidacion-planes-ciclos.md)** | doc fuente Parte III + regla del encargo | `ALL_ORDER` (`LandingPricingPreview.tsx:113`) y el grid `xl:grid-cols-6` (`:849`) leen `TIER_CONFIG` con growth/scale vivos; recortar la UI antes que las constantes rompería el typecheck o dejaría tiers comprables sin card. |
| D10 | Formulario Empresas via Resend = **v2 diferida documentada** (§F5) | doc fuente Parte VI.3 | mailto v1 = cero código nuevo hoy; el formulario captura más leads (no depende del cliente de correo del visitante) pero requiere server action + rate limit + anti-spam — no es "solo UI" y no bloquea el mensaje Teams. |
| D11 | Medición de clicks del CTA Teams via redirect propio `/api/contact-teams` → 302 al mailto, con contador en PostHog (ya en el stack) o log server-side | mejora aprobada por el dueño 2026-06-11 | Sin medición, el embudo Teams es invisible (no se sabe si el mailto convierte antes de invertir en el formulario v2 de §F5). Restricción dura del dueño: **cero servicios pagos nuevos** — PostHog/log server-side, nada premium. Detalle en §F2bis. |
| D12 | Nav: las 2 listas duplicadas de `LandingPillNav` (desktop `:44-49` + sheet `:88-93`) se unifican en una constante `NAV_ITEMS` única | mejora aprobada por el dueño 2026-06-11 | Elimina de raíz el riesgo de desincronización desktop/sheet (estaba en la tabla de riesgos); el swap 'Para Gyms' → 'Teams' se hace UNA vez. |

### Resoluciones del dueño (2026-06-11) — preguntas abiertas RESUELTAS (trazabilidad, no borrar)

| Pregunta que estaba pendiente | Resolución |
|---|---|
| ¿Nav item 'Teams' o nav minimal? (D5) | **RESUELTA: 'Teams' reemplaza 'Para Gyms'** (D5 ratificada). |
| ¿Title SEO conserva 'Gyms'? | **RESUELTA: SÍ** — keyword ya rankeada; solo cambia la meta description (F1.1). |
| ¿SLA del CTA ("menos de 24 horas hábiles")? | **RESUELTA: se suaviza a "Te contactamos a la brevedad"** — sin plazo comprometido (F2). |
| ¿Qué precio mostrarán los módulos cuando la superficie add-ons del pricing exista? | **RESUELTA (D3 dueño): $9.990/mes por módulo, uniforme, standalone** — post-cierre Movida, via planes 04/05. Precios de módulos para Teams van **por contrato y NO se publican** (sugerencia interna ~$29.990 flat/team/módulo). Este plan sigue sin publicar NINGÚN precio Teams (regla dura intacta). |
| ¿IVA en el copy de precios? | **RESUELTA (D5 dueño): SILENCIO total sobre IVA** en todo copy de precios hasta que se constituya EVAapp SpA (en proceso, jun-2026). Tarea de revisión del copy al constituirse: documentada en §F5. |
| ¿Qué pasa con `eva-app.cl/enterprise` (precio viejo googleable)? | **RESUELTA: redirect 308 `/enterprise` → `/pricing`**, a ejecutar **post-deploy de este plan** (implementación en el [plan 01](01-PLAN-archivado-enterprise.md)); además, **remoción en Search Console de las URLs con precios viejos = tarea manual pre-12-jun** (ver nota de F1). |

## Evidencia auditada (estado actual, verificado 2026-06-11 en branch `feat/movida-platform`)

- `apps/web/src/app/page.tsx:12` import + `:74` render de `LandingEnterpriseSection`; `:16-17` metadata menciona "planes enterprise" y "Panel centralizado por organización"; `:60` wrapper ya usa `min-h-dvh` ✅ **pero usa `overflow-x-hidden` (verificado 2026-06-11) — viola la regla del repo ("Horizontal scroll: `overflow-x: clip`, never `overflow-x: hidden`") → se corrige en F1.1 (mejora aprobada)**; `:44-57` JSON-LD `SoftwareApplication` sin mención enterprise.
- `apps/web/src/components/landing/LandingEnterpriseSection.tsx` (169 líneas): links a `enterprise.eva-app.cl` (`:6`) y Calendly (`:7`), precio "$89.990 CLP/mes" (`:119`), copy ES hardcodeado.
- `apps/web/src/components/landing/LandingPillNav.tsx:47` (desktop) y `:91` (sheet mobile): item `{ key: '', id: 'enterprise', label: 'Para Gyms' }` hardcodeado. Las listas completas están **duplicadas inline** (`:44-49` desktop, `:88-93` sheet) — se unifican en `NAV_ITEMS` (D12, F1.2).
- Mailto repetido como string literal en 4+ sitios (`pricing/page.tsx:194-196`, `LandingContactFooter.tsx:46-51`, y los 2 nuevos de F1.3/F2) → constante `SALES_EMAIL` en `lib/brand-assets.ts` (mejora aprobada, F1.7).
- `apps/web/src/components/landing/LandingFinalCTA.tsx:43-48`: footnote "¿Gestionas un gym o academia? Ver planes enterprise →" → `#enterprise`.
- `apps/web/src/components/landing/LandingPricingPreview.tsx:868-882`: callout enterprise "Desde $49.990/mes" → `#enterprise`. ⚠️ Inconsistencia pre-existente: $49.990 aquí vs $89.990 en la sección (`LandingEnterpriseSection.tsx:119`) — muere con el archivado.
- `LandingPricingPreview.tsx:113` `ALL_ORDER` = 6 tiers; `:849-866` grid `lg:grid-cols-3 xl:grid-cols-6` + separador "Negocio establecido" (`landing.pricing.group.business`); carousel mobile itera `ALL_ORDER` (`:688`) y los dots también (`:713`).
- Modelo mailto: `apps/web/src/app/pricing/page.tsx:189-197` ("Escríbenos a contacto@eva-app.cl") y `LandingContactFooter.tsx:46-51` (mismo mailto en footer — se conserva tal cual).
- i18n: keys planas `landing.*` en `apps/web/src/lib/i18n/{es,en}.json` (ej. `landing.nav.pricing` en `es.json:12`). No existe test de paridad es/en (verificado: cero `*.test.ts` referencian los json).
- Tests existentes que tocan la landing: solo `tests/navigation-perf-smoke.spec.ts:8-16` (smoke de `/`, no asserta contenido — no se rompe). `tests/sprint3-register-pricing.spec.ts` apunta a `/pricing` (territorio del plan 04, no de este). **No existe spec dedicado de landing** → se escribe uno nuevo (§F4).
- Únicas referencias a `#enterprise` / `LandingEnterpriseSection` en `src/`: las 5 listadas arriba (grep verificado) — no hay deep-links externos en el código.
- ⚠️ **Superficie enterprise que este plan NO elimina:** la página de marketing `apps/web/src/app/enterprise/page.tsx` queda **públicamente alcanzable en `eva-app.cl/enterprise`** después del swap — el proxy solo host-gatea `/org/*` (`proxy.ts:145-147`); `/enterprise` en el dominio principal se sirve como ruta normal, sin noindex, con meta description "Desde $89.990 CLP/mes" (`app/enterprise/page.tsx:18`) y Calendly vivo (`_data/enterprise-content.ts:8`). No está en `sitemap.ts` (verificado), pero pudo ser indexada vía el subdominio. **Delegado al [plan 01](01-PLAN-archivado-enterprise.md): noindex (`robots: { index: false }`) o redirect, idealmente ANTES de la reunión Movida del 12-jun** — ese "$89.990/mes" visible es un ancla bajo que Ani puede googlear (memoria `project-movida-commercial`). **→ RESUELTO por el dueño (2026-06-11): redirect 308 `/enterprise` → `/pricing` post-deploy de este plan (ejecuta plan 01) + remoción Search Console pre-12-jun (tarea F1.8 de este plan).**
- i18n: key huérfana `landing.pricing.enterprise` (`es.json:110` / `en.json:110`, sin uso en ningún `.tsx` — grep verificado); la versión EN dice literalmente "enterprise options" → se elimina en F1.6 para que la palabra no reaparezca si alguien reusa la key.

## Research UX jun-2026 (complementa el del doc fuente, que ya cubre add-ons y benchmarks)

- **Sección "for teams" en landings B2B:** las homepages que mejor convierten en 2026 responden "¿qué problema, qué producto, para quién?" en <5 segundos y **dejan cosas fuera deliberadamente** — la sección Teams debe ser un pitch corto de 4 value props + 1 CTA, no un mini-sitio ([Genesys Growth, "Designing B2B SaaS Homepages 2026"](https://genesysgrowth.com/blog/designing-b2b-saas-homepages), consultado 2026-06-11). CTAs personalizados por audiencia convierten 202% mejor que los genéricos (análisis HubSpot citado ahí) → el CTA Teams habla al dueño del centro ("tu centro", "tu equipo"), no al coach individual.
- **Card "conversemos" en pricing:** el patrón estándar 2026 es un tier/card separado con CTA "Contact sales" SOLO para el segmento enterprise/teams, descripción de para quién es + 3-4 capacidades específicas (no solo "contáctanos"); 3-4 tiers self-serve es el óptimo (más = parálisis de decisión) y la card recomendada destacada convierte ~22% mejor ([InfluenceFlow, SaaS Pricing Page Best Practices 2026](https://influenceflow.io/resources/saas-pricing-page-best-practices-complete-guide-for-2026/); [PipelineRoad, What Actually Converts in 2026](https://pipelineroad.com/agency/blog/saas-pricing-page-best-practices), consultados 2026-06-11). Importante el matiz: ocultar precio en productos de ticket bajo destruye confianza, pero para teams/enterprise el "conversemos" es el patrón esperado — exactamente nuestra situación pre-cierre Movida.
- **Mobile:** ~58% del tráfico a pricing pages es móvil en 2026 → cards apiladas/carousel con targets táctiles ≥44px (ya cumplido por el carousel actual, `h-11 w-11` en los dots `LandingPricingPreview.tsx:725`).

---

## F0 — Spec SDD (antes de código)

- [ ] Crear `specs/landing-teams-section/SPEC.md` + `PLAN.md` + `TASKS.md` (templates en `specs/_templates/`): user stories (visitante dueño de centro, visitante empresa, visitante coach-solo que NO debe distraerse), AC = los checks de la matriz de verificación de abajo. Regla del repo: sin SPEC.md no se implementa.

## F1 — Limpieza enterprise de la landing (tanda 1)

1. **`apps/web/src/app/page.tsx`**
   - [ ] Quitar import (`:12`) y render (`:74`) de `LandingEnterpriseSection`; en su lugar renderizar `<LandingTeamsSection />` (mismo slot, D1).
   - [ ] Meta description (`:17`): reemplazar por copy sin "enterprise" ni "por organización". Propuesta: `'EVA: plataforma para coaches, personal trainers y centros de entrenamiento. Rutinas, nutrición, evaluaciones y app con tu marca. Desde gratis — EVA Teams para equipos.'` El **title** (`:16`) se mantiene ("Gyms" sigue siendo keyword objetivo de Teams — **RATIFICADO por el dueño 2026-06-11**). `keywords` (`:18`): agregar `'software centro entrenamiento'`. El JSON-LD existente (`:44-57`) no menciona enterprise — sin cambios.
   - [ ] **(Mejora aprobada) JSON-LD adicional `Offer`/`OfferCatalog` "EVA Teams" SIN precio**: segundo bloque `<Script type="application/ld+json">` junto al existente (`:61-65`) con un `OfferCatalog` (name "EVA Teams", `itemListElement` = las 4 capacidades) y `contactPoint` (`@type: ContactPoint`, `email: contacto@eva-app.cl`, `contactType: sales`) — **cero campos `price`/`priceCurrency`** (la regla dura anti-precio aplica también al markup; el guard E2E de F4.1 cubre el HTML renderizado, incluido el JSON-LD). SEO B2B: señal "for teams/business" para rich results sin anclar la negociación.
   - [ ] **(Mejora aprobada) `overflow-x-hidden` → `overflow-x-clip`** en el wrapper (`:60`) — regla del repo. ⚠️ Riesgo: `clip` deshabilita TODO scroll programático horizontal y puede cambiar el comportamiento de sticky/carousel → item dedicado en la checklist visual de F4.4.
2. **`LandingPillNav.tsx`** — **(Mejora aprobada D12) unificar las 2 listas duplicadas** (`:44-49` desktop y `:88-93` sheet mobile) en una constante única `NAV_ITEMS` a nivel de módulo, y ahí (una sola vez) quitar el item hardcodeado `'Para Gyms'` reemplazándolo por `{ key: 'landing.nav.teams', id: 'teams' }` (D5 ratificada). Deja de existir el último label sin i18n del nav y muere el riesgo de desincronización desktop/sheet.
3. **`LandingFinalCTA.tsx:43-48`** — reemplazar el footnote hardcodeado por keys i18n: "¿Gestionas un centro o una empresa? Escríbenos a contacto@eva-app.cl" con el mailto de D4 servido via `/api/contact-teams?src=final-cta` (D11, §F2bis; el correo queda visible como texto copiable). Link directo al embudo de contacto, no ancla (D6: está debajo de la sección Teams).
4. **`LandingPricingPreview.tsx:868-882`** — reescribir el callout: título "¿Centro de entrenamiento o equipo multidisciplinario?", subtítulo sin precios ("Pool de alumnos compartido · Marca de tu centro · Módulos profesionales"), CTA primario ancla `#teams` ("Conocer EVA Teams →") + link secundario "Empresas: contacto@eva-app.cl" via `/api/contact-teams?src=pricing-callout` (D6 + D11). Estilo emerald (D2), todo via i18n (D3). Muere la inconsistencia $49.990/$89.990.
5. **Borrar `components/landing/LandingEnterpriseSection.tsx`** (D7).
6. **i18n** — agregar a `es.json` Y `en.json` en el mismo commit: `landing.nav.teams`, `landing.final.empresas*`, `landing.pricing.teamsCallout.*`. **Eliminar la key huérfana `landing.pricing.enterprise`** (`es.json:110` / `en.json:110`, sin uso en `.tsx` — la EN dice "enterprise options" y reusarla rompería el guard anti-enterprise del spec).
7. **(Mejora aprobada) Constante `SALES_EMAIL = 'contacto@eva-app.cl'` en `apps/web/src/lib/brand-assets.ts`** (junto a `BRAND_PRIMARY_COLOR`, `:11`) y helper del subject D4 — el mailto deja de ser string repetido en 4+ sitios. Usarla en F1.3, F1.4, F2 (CTA), §F2bis (route handler) y, oportunistamente, en las superficies existentes que ya lo hardcodean (`pricing/page.tsx:194-196`, `LandingContactFooter.tsx:46-51` — refactor sin cambio visual).
8. [ ] **(Default operativo del dueño — tarea MANUAL, pre-12-jun)** Search Console: solicitar **remoción de las URLs con precios viejos** (`eva-app.cl/enterprise` y cualquier URL del subdominio enterprise indexada con "$89.990"/"$49.990") — herramienta de remociones de Search Console, sin costo. Complementa el redirect 308 `/enterprise` → `/pricing` que el [plan 01](01-PLAN-archivado-enterprise.md) ejecuta post-deploy de este plan.
9. [ ] `pnpm typecheck` + `pnpm test` de la tanda (permitidos por la regla 2026-06-10).

> Fuera de scope de F1 (van en el [plan 01](01-PLAN-archivado-enterprise.md)): crons `org-health-alert`/`payment-reminder` (**default del dueño 2026-06-11: payment-reminder SE QUITA junto con org-health-alert — confirmado**), copy de `legal/` y `privacidad/`, org de prueba a `active` (**default del dueño: el UPDATE en prod se empaqueta con la sesión del gate Movida — una sola ventana de riesgo**), docs canónicos del archivado, **y la página de marketing `eva-app.cl/enterprise`** (ver Evidencia — sigue alcanzable en el dominio principal con precio "$89.990/mes" y Calendly). **RESUELTO por el dueño (2026-06-11): redirect 308 `/enterprise` → `/pricing`, a desplegar post-deploy de este plan** (implementación en el plan 01); la remoción en Search Console es la tarea manual F1.8 de este plan (pre-12-jun).

## F2 — Nueva `LandingTeamsSection` (tanda 1, mismo commit que F1)

Componente nuevo `apps/web/src/components/landing/LandingTeamsSection.tsx` (`'use client'`, patrón de sus hermanos: framer-motion `whileInView`, `viewport={{ once: true }}`).

**Estructura (espejo del esqueleto que ya convertía en `LandingEnterpriseSection`, reskineado):**

- `<section id="teams" className="scroll-mt-28 …">` + `aria-labelledby="teams-section-heading"`.
- **Eyebrow** (pill): "Para centros de entrenamiento y equipos multidisciplinarios" — borde/fondo emerald (`border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`).
- **H2:** "EVA Teams — tu centro completo en una plataforma" (copy fijado por el doc fuente Parte VI.2).
- **4 value props** (grid `sm:grid-cols-2 lg:grid-cols-4`, iconos lucide):
  1. *Pool compartido* — "Todo tu equipo ve a todos los alumnos. Sin silos entre profesionales." (`Users2`)
  2. *La marca de tu centro* — "Tu logo y colores en la app de cada alumno." (`Palette`)
  3. *Módulos profesionales* — "Cardio, screening de movimiento, antropometría ISAK y nutrición por intercambios." (`Activity` o `ClipboardCheck`)
  4. *Equipo self-service* — "Suma y gestiona a tus coaches sin depender de nadie." (`Settings2` o `UserPlus`)
- **CTA card:** texto "Conversemos sobre tu centro" + botón al mailto D4 via `/api/contact-teams?src=teams-section` (D11, §F2bis; estilo botón primario emerald con focus-visible ring, dark variant; el correo `SALES_EMAIL` visible además como texto copiable). Subtexto: **"Te contactamos a la brevedad"** — copy fijado por el dueño (2026-06-11): sin plazo comprometido (reemplaza el borrador "menos de 24 horas hábiles").
- ⚠️ **REGLA DURA (memoria `project-movida-commercial`): CERO números de precio en esta sección** — ni "desde $X", ni rangos, ni "ahorra X%" — hasta cerrar Movida (reunión 12-jun). El anclaje con Team S/M del doc fuente Parte VI.2 queda explícitamente POST-cierre (ver §F3 y plan [05](05-PLAN-billing-addons-selfservice.md)).

**Reglas de UI del repo (checklist de implementación):**

- [ ] Sin `h-screen`/`100vh`; la sección es flujo normal (`py-16 sm:py-24` como sus hermanas). El wrapper de la página ya usa `min-h-dvh` (`page.tsx:60`).
- [ ] Dark mode variants en TODOS los tokens nuevos (`dark:` en fondos, bordes, textos emerald — espejo del manejo dual del pricing preview).
- [ ] i18n es/en mismo commit: namespace `landing.teams.*` (`eyebrow`, `title`, `prop1.title`…`prop4.desc`, `cta`, `ctaSub`).
- [ ] Si la sección lleva imagen/mockup (v1: ninguno — los 4 props + CTA bastan; un placeholder baja la percepción), usar `<Image>` de Next, jamás `<img>`. **(Mejora aprobada — diferida documentada)** El asset definitivo es un **screenshot enmarcado del panel de equipo** cuando el panel esté pulido (post-gate Movida): captura propia + marco device en CSS/Figma propio — costo $0, cero servicios nuevos. Tarea registrada en §F5.
- [ ] Acento emerald referencia `BRAND_PRIMARY_COLOR` conceptualmente (clases Tailwind `emerald-*`, que ya mapean al verde de marca `#10B981`); los CTAs de registro del resto de la landing siguen en `primary` (azul) — no competir con el embudo coach-solo.
- [ ] Accesibilidad: `aria-labelledby`, `focus-visible:ring`, iconos `aria-hidden`.

## F2bis — Medición de clicks del CTA Teams (mejora aprobada 2026-06-11, D11)

Única excepción de código de servidor del plan, aprobada por el dueño. **Restricción dura: cero servicios pagos nuevos** — solo PostHog (ya en el stack) o log server-side.

1. [ ] **Route handler `apps/web/src/app/api/contact-teams/route.ts`** (GET):
   - Lee `?src=` (allowlist cerrada: `teams-section` | `final-cta` | `pricing-callout`; cualquier otro valor → `unknown` — no reflejar input arbitrario).
   - Registra el click: evento PostHog server-side (`contact_teams_click`, prop `src`) o, si PostHog server-side no está cableado aún, `console.info` estructurado (visible en logs de Vercel, ya contratado). **Nada de DB, nada de servicios nuevos.**
   - Responde `302` con `Location: mailto:${SALES_EMAIL}?subject=…` (subject D4, construido desde la constante de F1.7 — sin parámetros con contexto del usuario, regla Security de D4).
2. [ ] Los 3 CTAs (F1.3 footnote, F1.4 callout, F2 sección Teams) apuntan a `/api/contact-teams?src=…` en vez del mailto crudo; el correo sigue impreso como texto copiable junto a cada CTA (mitigación del riesgo "mailto sin handler").
3. [ ] ⚠️ **Riesgo conocido a validar en la checklist de F4.4:** no todos los navegadores siguen un `302` hacia un esquema `mailto:` de forma consistente. Si la QA manual (Chrome/Safari/Firefox, desktop y móvil) muestra fallas, **fallback aprobado: href mailto directo + `onClick` no bloqueante que dispara el evento PostHog desde el cliente** (mismo contador, cero servicios nuevos) — decisión a registrar en el TASKS.md del spec.
4. [ ] El spec E2E de F4.1 asserta el `href` de los CTAs y el `302`+`Location` del endpoint (ejecución solo en el GATE).

## F3 — Layout objetivo del pricing preview (DISEÑO AQUÍ, EJECUCIÓN BLOQUEADA POR [PLAN 04](04-PLAN-consolidacion-planes-ciclos.md))

> ⛔ **No ejecutar nada de esta fase hasta que el plan 04 haya sacado growth/scale de la VENTA (decision D1 del plan 04: lista `SALE_TIERS` — el union type y `TIER_CONFIG` completos QUEDAN como runtime legacy para grandfathered y placeholders managed; la UI de venta itera `SALE_TIERS`, no `TIER_CONFIG`).** Hoy `ALL_ORDER` (`LandingPricingPreview.tsx:113`) lista los 6 y el grid está dimensionado `xl:grid-cols-6` (`:849`). Esta fase queda especificada para que el plan 04 la ejecute (o la ejecute este plan en tanda posterior, tras 04).

**Diseño objetivo:**

- `ALL_ORDER` → `['free', 'starter', 'pro', 'elite']`.
- Desktop: 4 `PlanCardCompact` + 1 **`TeamsPlanCard`** al final (componente nuevo dedicado, D8): sin precio, eyebrow "EVA Teams", 3 capacidades (pool compartido, marca del centro, módulos profesionales), CTA ancla `#teams` + contacto secundario via `/api/contact-teams?src=pricing-callout`. Borde superior emerald, mismo alto que las demás (research: la card de contacto debe decir para quién es + capacidades, no solo "contáctanos").
- **(Mejora aprobada) Guía del breakpoint `lg` — 5 cards no calzan en 3 columnas (queda 3+2 asimétrico).** Decisión de diseño especificada para quien ejecute: en `lg` (1024-1279px) usar `lg:grid-cols-2` para los 4 tiers (2×2 simétrico) y la `TeamsPlanCard` con `lg:col-span-2` a lo ancho debajo (layout interno horizontal: eyebrow+capacidades a la izquierda, CTA a la derecha); en `xl:grid-cols-5` las 5 cards en una fila (la TeamsPlanCard vuelve a layout vertical). Alternativa descartada: `lg:grid-cols-3` con fila huérfana de 2 — el hueco visual debilita la card recomendada. En `<lg` rige el carousel mobile (sin cambios de patrón).
- Eliminar el separador "Negocio establecido" (`:855-861`, key `landing.pricing.group.business` queda huérfana → limpiar de ambos json, junto con su hermana `landing.pricing.group.business.badge` que ya está huérfana hoy — `es.json:121`/`en.json:121`, grep verificado).
- Mobile carousel: 4 slides de tiers + slide final Teams (`data-plan-slide="teams"`); dots iteran una lista de slides paralela (no `ALL_ORDER` crudo) para incluir el dot Teams sin tocar `SubscriptionTier`.
- `MIN_TIER_FOR_CYCLE` (`:29-32`) sigue válido (annual→starter, quarterly→elite) — sin cambios.
- Cuando los precios de Teams se publiquen (POST-cierre Movida, [plan 05](05-PLAN-billing-addons-selfservice.md)), la `TeamsPlanCard` gana el "desde $—" — una línea, no rediseño. **Resoluciones del dueño (2026-06-11) que rigen esa publicación futura:** (a) **D3:** precio de lista de módulos standalone = **$9.990/mes uniforme** (lo que la superficie add-ons del pricing mostrará via planes 04/05); los precios de módulos para **Teams van por contrato y NO se publican** (sugerencia interna ~$29.990 flat/team/módulo — jamás en la landing); (b) **D2:** precios de tiers SIN CAMBIOS ($19.990/$29.990/$44.990) — las 4 cards no cambian número; (c) **D5 (IVA):** cualquier copy de precios que esta superficie gane guarda **silencio total sobre IVA** hasta que se constituya EVAapp SpA (tarea de revisión en §F5).

## F4 — Tests (TAREAS DE ESCRITURA — la ejecución va al GATE)

1. [ ] **Spec E2E nuevo `tests/landing-teams.spec.ts`** (no existe spec dedicado de landing — se crea siguiendo el estilo de `tests/navigation-perf-smoke.spec.ts`):
   - Landing carga; el nav NO contiene "Para Gyms"; contiene "Teams" (desktop y abriendo el sheet mobile con viewport móvil).
   - `#teams` existe, heading "EVA Teams" visible al scrollear.
   - **Guard anti-precio (la regla dura, automatizada):** dentro de `section#teams`, asercion de que NO matchea `/\$\s?\d|CLP\s?\d|\bUF\b|\d{1,3}\.\d{3}/i` — cubre `$X`, "CLP X", "X UF" y miles con punto chileno (un guard solo-`$` dejaría pasar "89.990 CLP"). Si alguien agrega un precio antes del cierre Movida, el spec revienta.
   - **Guard anti-precio del JSON-LD Teams (mejora F1.1):** el bloque `OfferCatalog` "EVA Teams" del HTML NO contiene `"price"` ni `"priceCurrency"` (el guard de arriba está scoped a `section#teams` y no lo cubriría).
   - El CTA de la sección y el footnote del FinalCTA tienen `href` que empieza con `/api/contact-teams?src=` (D11), y el correo `contacto@eva-app.cl` es texto visible junto a cada CTA; **request directo al endpoint responde `302` con `Location` que empieza con `mailto:contacto@eva-app.cl`** (Playwright `request.get` con `maxRedirects: 0`). *(Si la QA de F2bis.3 activa el fallback mailto directo + evento client-side, los asserts se ajustan a `mailto:` en el href — registrar en el spec cuál rige.)*
   - El callout del pricing preview ancla a `#teams`.
   - El body visible de la landing NO contiene `/enterprise/i` (la palabra desaparece de la superficie pública).
2. [ ] **Vitest de paridad i18n GLOBAL (mejora aprobada — amplía el alcance original)** `apps/web/src/lib/i18n/i18n-parity.test.ts`: **TODA key de `es.json` existe en `en.json` y viceversa — el árbol completo, no solo `landing.*`** (hoy no existe ningún test así — barato y ataja el bug clásico de key faltante en un idioma en cualquier superficie).
3. [ ] **(Mejora aprobada) Detector de keys i18n huérfanas** (mismo archivo de test o `i18n-orphans.test.ts`): extrae las keys de ambos json y las cruza contra los literales `t('...')` presentes en `apps/web/src/**/*.{ts,tsx}`; falla si una key no aparece en ningún call site. **Allowlist explícita para keys construidas dinámicamente** (call sites con template literal, p. ej. ``t(`landing.pricing.${tier}.name`)`` — familias completas tipo `landing.pricing.group.*` entran por prefijo), documentada con comentario por entrada. Habría cazado solas las huérfanas ya detectadas a mano (`landing.pricing.enterprise`, `landing.pricing.group.business.badge`).
4. [ ] **Checklist visual/manual** (documentar en el TASKS.md del spec SDD):
   - [ ] Light + dark mode de la sección Teams y el callout (contraste emerald sobre ambos fondos).
   - [ ] Viewports: 375px (sheet mobile + carousel), 768px, 1280px, 1536px — sin scroll horizontal.
   - [ ] **(Mejora F1.1 — `overflow-x-clip`)** Verificar que el cambio de `hidden` a `clip` en `page.tsx:60` NO recorta ni rompe: el sticky branding card (`LandingStickyBrandingCard`), el carousel mobile del pricing (swipe + dots) y cualquier elemento animado que se asome fuera del viewport (framer-motion `whileInView` con offsets). Si algo se recorta, investigar el contenedor — no revertir a `hidden` sin registrar por qué.
   - [ ] El click del CTA pasa por `/api/contact-teams` y abre el mailto con subject prefijado correcto en Chrome, Safari y Firefox (desktop y móvil) — es la validación del riesgo F2bis.3; si falla, activar el fallback documentado.
   - [ ] El subtexto del CTA dice exactamente "Te contactamos a la brevedad" (copy del dueño — sin plazos).
   - [ ] Flujo de conversión coach-solo intacto: hero → register CTA funciona igual que antes (no se tocó nada arriba del pricing).
   - [ ] Toggle de idioma EN: la sección Teams completa traducida (cero strings ES residuales).
5. [ ] `pnpm typecheck` + `pnpm test` (vitest) por tanda: **permitidos** por la regla 2026-06-10. Playwright NO se corre por tanda.

## F5 — Diferidas v2 (documentadas, NO se implementan en este plan)

**1. Formulario "Empresas" que envía a contacto@eva-app.cl via Resend** (doc fuente Parte VI.3):

- Server action en `app/(landing)/_actions/` con Zod (nombre, correo, nombre del centro, nº aprox. de alumnos, mensaje) → `src/lib/email/send-email.ts` (Resend ya integrado) → inbox de ventas.
- Obligatorio: rate limit Upstash (`src/lib/rate-limit.ts` ya existe), honeypot anti-bot, sin persistencia en DB (v1 sin tabla de leads).
- Esfuerzo estimado: **0.5-1 día** (action + form client + estados + tests). Momento natural: junto con la sección Teams "completa con precios" del plan [05](05-PLAN-billing-addons-selfservice.md)/F6 del roadmap, post-cierre Movida.
- Juicio: captura más leads que el mailto (no depende del cliente de correo del visitante), pero no es "solo UI" — por eso queda fuera del scope visual de este plan. La medición de §F2bis dirá con datos si el mailto pierde leads (justifica o entierra este formulario).

**2. (Mejora aprobada) Asset visual del panel de equipo para la sección Teams:**

- Cuando el panel de equipo esté pulido (post-gate Movida, módulos ON): screenshot real del panel con data sintética → enmarcado en mockup de device (CSS/asset propio, costo $0, cero servicios nuevos) → `<Image>` de Next en `LandingTeamsSection` (slot ya previsto en la checklist de F2).
- Hasta entonces la sección vive sin imagen (decisión v1 ratificada: placeholder baja la percepción).

**3. (D5 del dueño — IVA) Revisión del copy de precios al constituirse EVAapp SpA:**

- Mientras EVAapp SpA no esté constituida (en proceso, jun-2026): **SILENCIO total sobre IVA en todo copy de precios** — ni "+IVA", ni "IVA incluido", ni asteriscos. Este plan no publica precios, así que cumple por construcción; la regla aplica a las superficies futuras de F3/planes 04-05.
- **Tarea diferida:** al constituirse la SpA, revisar TODO el copy de precios (landing, `/pricing`, emails) y decidir el tratamiento del IVA con el dueño. Registrarla también en el plan que publique precios primero (04/05).

## Archivos clave

`apps/web/src/app/page.tsx` (import/render/metadata/JSON-LD Teams/overflow-x-clip) · `components/landing/LandingTeamsSection.tsx` (NUEVO) · `components/landing/LandingEnterpriseSection.tsx` (BORRAR) · `components/landing/LandingPillNav.tsx` (NAV_ITEMS unificada + item Teams) · `components/landing/LandingFinalCTA.tsx` (footnote) · `components/landing/LandingPricingPreview.tsx` (callout ahora; grid/carousel/TeamsPlanCard tras plan 04) · `lib/brand-assets.ts` (`SALES_EMAIL` NUEVO) · `app/api/contact-teams/route.ts` (NUEVO — §F2bis) · `lib/i18n/{es,en}.json` (`landing.teams.*`, `landing.nav.teams`, `landing.final.empresas*`, `landing.pricing.teamsCallout.*`) · `tests/landing-teams.spec.ts` (NUEVO) · `lib/i18n/i18n-parity.test.ts` + detector de huérfanas (NUEVOS) · `specs/landing-teams-section/` (NUEVO).

## Orden sugerido

1. F0 spec SDD. 2. F1 + F2 + F2bis en **una tanda/commit** (la landing nunca queda en estado intermedio "sin enterprise y sin teams"; los CTAs nacen apuntando a `/api/contact-teams`, así que el endpoint va en el mismo commit; i18n va en el mismo commit por regla del repo) + typecheck/vitest. La tarea manual F1.8 (Search Console) se hace en paralelo, pre-12-jun. 3. F4 escritura de specs/tests (puede ir en la misma tanda o la siguiente). 4. F3 queda en pausa hasta el merge del plan 04. 5. F5 diferidas.

## Verificación (matriz)

- **Archivado:** grep `LandingEnterpriseSection|#enterprise|enterprise\.eva-app\.cl|calendly` en `src/components/landing/` + `src/app/page.tsx` = 0 hits; meta description sin "enterprise"; nav sin "Para Gyms" (desktop y sheet, ambas desde la `NAV_ITEMS` única).
- **Teams:** `#teams` renderiza con los 4 value props + CTA al embudo de contacto; **cero matches de precio en la sección Y en el JSON-LD OfferCatalog**; subtexto "Te contactamos a la brevedad"; dark mode OK; EN completo.
- **Medición (F2bis):** `GET /api/contact-teams?src=teams-section` responde `302` con `Location` mailto correcto; los 3 CTAs apuntan al endpoint; el evento aparece en PostHog/logs.
- **i18n:** paridad GLOBAL es/en verde (árbol completo); detector de huérfanas verde (con allowlist documentada); mailto centralizado en `SALES_EMAIL` (grep `contacto@eva-app.cl` en `.tsx` = solo render de texto visible, cero hrefs hardcodeados).
- **Conversión intacta:** CTAs de registro (`/register?tier=pro&cycle=monthly`) sin cambios en nav, hero, pricing cards y FinalCTA; `tests/navigation-perf-smoke.spec.ts` y `tests/sprint3-register-pricing.spec.ts` siguen verdes (no se tocó `/pricing` ni el registro).
- **No-regresión fuera de landing:** `/pricing`, `/legal`, `/privacidad`, proxy y rutas `/org` `/e` intactos (son scope de los planes [01](01-PLAN-archivado-enterprise.md) y [04](04-PLAN-consolidacion-planes-ciclos.md)).
- `pnpm typecheck` / `pnpm test` / `pnpm build` verdes.

## GATE DEL PLAN — ejecución de Playwright

> ⚠️ **ANTES DE CORRER: preguntar al usuario** — tiene tests pendientes de otros planes (**gate consolidado Movida**, memoria `project-plan1-gate-pending`, prioridad 1) y la **regla 2026-06-10 exige autorización explícita** para correr Playwright/SQL contra Supabase. Los specs nuevos (`tests/landing-teams.spec.ts`) se escriben igual en F4 y se corren SOLO aquí, con OK del usuario.

Con autorización:

```bash
npx playwright test tests/landing-teams.spec.ts tests/navigation-perf-smoke.spec.ts --workers=1
```

más la checklist visual/manual de F4.4 (incluye la validación cross-browser del 302→mailto de F2bis y el chequeo de clipping del `overflow-x-clip`). Si el gate Movida sigue pendiente al llegar acá, proponer correr ambos en la misma sesión autorizada (la landing no necesita branch de Supabase — corre contra el dev server local).

## Definition of Done

Landing sin rastro enterprise visible (nav, sección, callouts, metadata); `LandingTeamsSection` en producción con el mensaje "EVA Teams — tu centro completo en una plataforma", 4 value props, CTA al embudo de contacto medido (§F2bis) con subtexto "Te contactamos a la brevedad" y **cero precios** (sección + JSON-LD); nav unificado en `NAV_ITEMS` con item 'Teams'; `SALES_EMAIL` centralizado en `brand-assets.ts`; `overflow-x-clip` en el wrapper sin regresiones visuales; JSON-LD `OfferCatalog` Teams sin precio con `contactPoint`; copy nuevo 100% i18n es/en; dark mode y viewports móviles verificados; spec E2E de landing + paridad i18n GLOBAL + detector de huérfanas escritos; Search Console (F1.8) gestionado pre-12-jun; F3 documentada (incl. guía `lg` 2+span) y bloqueada por plan 04; flujo de conversión coach-solo sin regresión; typecheck/vitest/build verdes; Playwright ejecutado solo tras el GATE autorizado.

## Riesgos y mitigaciones

| Riesgo | Prob. | Mitigación |
|---|---|---|
| Publicar (por copy/diseño) cualquier número que ancle la negociación Movida antes del 12-jun | Media (es fácil que se cuele un "desde $X") | Regla dura en el spec SDD + **guard automatizado anti-precio** en `landing-teams.spec.ts` + review del diff buscando `$` antes de mergear |
| Romper el embudo coach-solo al mover piezas de la landing | Baja | D1 (reemplazo in-place, nada arriba del pricing se toca) + asserts de CTAs de registro en la matriz |
| Ejecutar el recorte de cards antes del plan 04 (typecheck roto o tier comprable sin card) | Baja | F3 marcada ⛔ con dependencia explícita; el diseño vive aquí pero el toggle es el merge de 04 |
| Key i18n faltante en un idioma (string crudo en EN) | Media (hoy no hay red) | Vitest de paridad GLOBAL nuevo (F4.2) + detector de huérfanas (F4.3), corren en cada tanda |
| El sheet mobile y el nav desktop quedan desincronizados (dos listas duplicadas en `LandingPillNav.tsx:44-49` y `:88-93`) | ~~Media~~ → eliminada de raíz | **Mejora aprobada D12 (F1.2): constante `NAV_ITEMS` única para ambas superficies**; el spec E2E asserta el nav en ambos viewports igual (cinturón y tirantes) |
| `mailto:` sin handler en desktop del visitante (lead perdido) | Media | El correo aparece también como texto visible/copiable (patrón `LandingContactFooter.tsx:46-51`); **§F2bis mide cuántos clicks hay (dato para decidir)**; F5 (formulario) elimina el riesgo en v2 |
| El `302 → mailto:` de §F2bis no es seguido por algún navegador (CTA muerto) | Media (comportamiento no estandarizado) | Validación cross-browser explícita en F4.4 ANTES del deploy; fallback aprobado y documentado en F2bis.3 (mailto directo + evento client-side, mismo contador); el correo copiable visible es la red final |
| `overflow-x-clip` recorta sticky/carousel que `hidden` toleraba | Baja-Media | Item dedicado en la checklist F4.4 (sticky branding card, carousel mobile, animaciones whileInView); el cambio es 1 clase — revertir es trivial pero hay que registrar el porqué |
| `eva-app.cl/enterprise` sigue vivo tras el swap (precio $89.990 + Calendly googleables — ancla baja para la negociación Movida) | Media → mitigada por decisión | Fuera del scope UI de este plan; **delegado con urgencia al [plan 01](01-PLAN-archivado-enterprise.md)** — **RESUELTO por el dueño (2026-06-11): redirect 308 `/enterprise` → `/pricing` post-deploy de este plan** + remoción Search Console (F1.8, manual, pre-12-jun). El guard E2E de este plan solo cubre `/` |
