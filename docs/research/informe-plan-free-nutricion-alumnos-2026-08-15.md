---
status: reference
owner: engineering
last_verified: 2026-08-15
canonical: false
---

# Informe 1 — Plan Free: nutrición incluida, whitelabel solo pago, y bajar de 3 a 2 alumnos

**Fecha de corte:** 2026-08-15 · **Rama:** `claude/free-plan-nutrition-cardio-qbyycb` (desde `rnmobiledenuevo`)
**Método:** auditoría del código del repo + investigación de mercado (Trainerize, Everfit, TrueCoach, PT Distinction, Hevy Coach, FITR, TrainHeroic, WeStrive, FitBudd, QuickCoach, Harbiz). Fuentes al final.
**Nota:** este documento es un informe de decisión; no implementa nada. Los cambios de código citados son propuestas.

---

## TL;DR

| Propuesta | Veredicto | Esfuerzo real |
|---|---|---|
| Nutrición en el Free | **Sí — y de hecho ya está en runtime.** Solo falta formalizarla en el catálogo/copy y matar el paywall muerto. | Bajo (1 día) |
| Whitelabel solo en pagos | **Ojo: hoy es Pro+, no "todos los pagos"** — Starter (pago) NO tiene branding. Recomiendo dejarlo Pro+ tal como está: cero cambios. | Cero (o bajo si se abre a Starter) |
| Free de 3 → 2 alumnos | **Viable y alineado con el mercado, pero tiene una mina enterrada**: sin grandfathering, todo coach free con 3 alumnos queda bloqueado en `/coach/reactivate` el día del deploy. Hay que hacerlo con grandfathering. | Medio (2-4 días con copy y tests) |

Las tres decisiones juntas cuentan una historia coherente: *"menos cupo, más producto"* — el Free se vuelve el mejor free del mercado en features (nutrición completa, que nadie regala) mientras el crecimiento del coach (alumno nº 3) se convierte en el disparador natural de pago.

---

## 1. Nutrición en el plan Free

### 1.1 Hallazgo principal: ya la tienen

La nutrición base **ya está disponible para el tier free en runtime**. El "cambio" es más pequeño de lo que parece — es alinear el contrato comercial con la realidad:

- El ítem de navegación de nutrición no declara entitlement: `packages/coach-nav/nav.ts:98` (solo `featureDomain: 'nutrition'`, que es preferencia de UI, no billing). Visible para todos los tiers.
- La superficie V2 no consulta tier en ninguna línea: `apps/web/src/app/coach/nutrition-v2/page.tsx`.
- El único paywall de nutrición (`apps/web/src/app/coach/nutrition-plans/page.tsx:44-46`, chequea `capabilities.canUseNutrition`) es **código muerto** para coaches standalone/team: la línea 39-42 los redirige antes a `/coach/nutrition-v2` vía `shouldSwapCockpitToNutritionV2`.
- Está documentado como decisión: `packages/tiers/index.ts:283-296` — *"La superficie de nutrición V2 no tiene gate de tier — está incluida en TODOS los planes, Free incluido"*. Y la landing ya lo anuncia: `PreciosSection.tsx:294-299` pone "Planes de nutrición incluidos" en la card FREE.

### 1.2 El problema: el catálogo interno se contradice

- `TIER_CONFIG.free.features` (`packages/tiers/index.ts:100-111`) **no lista** "Planes de nutrición" — pero la landing sí la promete en Free. Dos fuentes de verdad en desacuerdo, con la propia regla del repo en contra (`docs/product/PRODUCT_OVERVIEW.md:100`: la fuente de verdad es `packages/tiers`).
- `TIER_CAPABILITIES.free.canUseNutrition = false` (`packages/tiers/index.ts:156`) ya no gatea la superficie, solo la compra del add-on Pro — nombre engañoso que va a confundir a cualquiera que toque billing.
- El paywall muerto de `nutrition-plans/page.tsx` sigue montando el tracker `upgrade_gate_hit` con `gate: 'nutrition'` (línea 52): analítica de un muro que nadie puede chocar.

### 1.3 Qué hace la competencia

| Plataforma | ¿Nutrición en free? | Nutrición en pago |
|---|---|---|
| Trainerize | Solo tracking básico (free = 1 cliente) | Avanzada = add-on **US$20–45/mes** |
| Everfit | **No** (excluida del free explícitamente) | Add-on **US$39/mes**, solo sobre planes pagos |
| Hevy Coach | — (sin free) | **No tiene nutrición** (queja nº1 en G2) |
| TrueCoach / PT Distinction / FitBudd | — (sin free) | Incluida en planes |
| QuickCoach | Sí (free hasta 20 clientes) | Incluida |
| Harbiz (ES) | — (sin free) | Nutri AI add-on **+14,99€/mes** |

**Ninguna plataforma grande da nutrición completa gratis.** Las workout-first la monetizan como add-on caro; las all-in-one la incluyen pero sin free real. Un Free de EVA con nutrición V2 completa (planes estructurados/flexibles, registro del alumno, adherencia, catálogo con scanner) es un diferenciador de adquisición genuino, sobre todo contra Everfit y Trainerize.

### 1.4 Mi opinión

**Formalizarlo, sí — y conservar la frontera BASE/PRO como palanca de ARPU.** El riesgo de "regalar demasiado" ya está acotado por diseño: la frontera BASE vs PRO de nutrición (`apps/web/src/app/coach/nutrition-v2/_lib/nutrition-pro.ts`, decisión CEO 2026-07-15) deja en el add-on `nutrition_exchanges` lo clínico/avanzado (estrategia híbrida, multi-variante de día, notas privadas/protocolo, histórico completo vs 30 días). Esa es exactamente la escuela Everfit/Harbiz (add-on de nutrición avanzada) pero con la base gratis — lo mejor de las dos escuelas del mercado.

### 1.5 Fixes propuestos

1. **Catálogo**: agregar `'Planes de nutrición'` a `TIER_CONFIG.free.features` (`packages/tiers/index.ts:104-110`). Es lo que cierra la contradicción con la landing.
2. **NO tocar `free.canUseNutrition`** (dejarlo `false`): hoy solo gatea la compra del add-on Pro (`addons.service.ts:263`, `create-preference/route.ts:378`) y un Free no debe poder comprar add-ons (coherente con `canPurchaseAddon`/`hasActivePaidPlan`). Sí conviene **renombrarla o comentarla** (p. ej. nota `// gatea SOLO la compra del add-on, no la superficie`) para que el nombre deje de mentir.
3. **Retirar el paywall muerto** de `nutrition-plans/page.tsx:44-46` y su `UpgradeGateTracker` de nutrición (línea 52), dejando la redirección a V2 como único camino.
4. **Copy comparativo**: revisar `nutrition-plans/page.tsx:124` ("Hasta 30 alumnos activos (3× más que Free)") — queda desactualizado si Free pasa a 2.

---

## 2. Whitelabel solo para planes pagos

### 2.1 Estado real: hoy es Pro+, no "planes pagos"

El gate único es `isBrandingAllowed(tier)` → `TIER_CAPABILITIES[tier].canUseBranding` (`packages/tiers/index.ts:230-232`). Lo tienen `pro`, `elite` y los legacy `growth`/`scale`. **Starter — que es un plan pago de $19.990 — NO tiene branding** (decisión CEO 2026-06-21, comentarios en `packages/tiers/index.ts:62-63` y `147-153`). Las 17 superficies que consumen el gate (settings, layout del coach, área del alumno `c/[coach_slug]`, manifest/splash PWA, emails de cron, tema RN) derivan todas de esa única función y son fail-closed — la arquitectura está sana.

### 2.2 Qué hace la competencia

Whitelabel es LA feature premium universal; nadie la regala y casi todos la ponen en su tier más alto o como add-on caro: Trainerize Studio (~US$105–139/mes, +setup ~$169 en Pro), Everfit solo Enterprise, PT Distinction Pro/Master (US$59.90+), FitBudd Super Pro (US$149 + $75 setup), FITR Unlimited (US$129.99), Harbiz My APP (149€/mes o add-on +49,99€). TrueCoach y Hevy ni la ofrecen — y pierden clientes por ello. El dato más interesante es el de QuickCoach: con un free de 20 clientes, **más de la mitad de sus coaches pagos siguen bajo el límite de clientes — pagan por la branded app**, no por el cupo. El branding convierte por estatus/identidad, no por necesidad operativa.

### 2.3 Mi opinión y decisión pendiente

"Whitelabel queda igual solo para pagos" admite dos lecturas y hay que elegir una:

- **(a) Dejarlo como hoy (Pro+): recomendado.** Cero cambios de código. Mantiene un motivo claro de upgrade Starter→Pro (hoy Pro = branding + poco más sobre Starter; si Starter recibe branding, el salto de $19.990 a $29.990 se queda sin argumento fuerte). Es además el patrón del 100% del mercado: branding arriba, no en el primer escalón pago.
- **(b) Abrirlo a Starter**: cambio pequeño (`TIER_CAPABILITIES.starter.canUseBranding = true` en `packages/tiers/index.ts:164`, `'Branding personalizado'` en features línea 117, actualizar los comentarios de decisión y el test `apps/web/src/lib/constants.test.ts:52`) — pero debilita la escalera de precios sin evidencia de que Starter lo necesite.

Con Free ganando nutrición, la escalera queda especialmente limpia en la opción (a): **Free = producto completo con 2 alumnos · Starter = cupo y módulos · Pro+ = tu marca.**

---

## 3. Bajar el Free de 3 a 2 alumnos

### 3.1 Qué dice el mercado

El free permanente es minoría y su palanca estándar es el nº de clientes: Trainerize 1, WeStrive 1, Everfit 5, QuickCoach 20; el resto solo da trial de 14–30 días. Con 2 alumnos EVA seguiría en la mitad alta de los frees reales, y con nutrición incluida el Free de EVA sería objetivamente mejor que el plan **pago** Grow de Trainerize (US$9/mes por 2 clientes) — buen argumento de marketing. El límite de clientes funciona porque cada alumno extra es ingreso directo del coach: la disposición a pagar aparece sola al crecer.

### 3.2 La mina enterrada: no hay grandfathering, y hay dos rieles divergentes

El límite vive en dos sitios que hoy coinciden y con el cambio divergen:

- **Riel A — DB (`coaches.max_clients`, baseline `00000000000001_baseline.sql:908`)**: las altas de alumno (web `clients.actions.ts:97`, mobile `api/mobile/coach/clients/route.ts:189`), el import, el desarchivar y el banner over-limit usan el patrón `coach.max_clients ?? getTierMaxClients(tier)`. Los free existentes tienen `3` **persistido en su fila** → bajar la constante **no los toca** (grandfathering de facto).
- **Riel B — constante (`getTierMaxClients('free')`)**: el gate de suscripción **del middleware** (`apps/web/src/lib/coach-subscription-gate.ts:74-83`, llamado desde `proxy.ts:541`) y su espejo RN (`apps/mobile/lib/workspace-core.ts:154-167`) comparan `activeStandaloneClientCount > getTierMaxClients('free')` **directo contra la constante**. El día que la constante pase a 2, **todo coach free con 3 alumnos activos queda redirigido a `/coach/reactivate` en cada navegación**, en web y en la app. También `activate-free.service.ts:62` exigiría archivar 1 alumno para "volver a gratis".

Además: el cron `api/cron/trial-expiry/route.ts:59` escribe `max_clients: 3` **hardcodeado** (beta→free), hay ~23 strings de copy con "3" (landing, pricing, FAQ, emails transaccionales, dashboard RN, `TIER_STUDENT_RANGE_LABEL` en `packages/tiers/index.ts:79`) y 2 tests con el literal (`sales-templates.test.ts:50,56`, `activate-free/route.test.ts:84`).

### 3.3 Mi opinión

**Sí bajar a 2, pero solo con grandfathering explícito y como parte del paquete "nutrición gratis".** Bajar cupo en solitario es una noticia negativa para la base instalada; bajarlo el mismo día que se anuncia "nutrición completa incluida en Free" es un rebalanceo defendible (nadie pierde nada que ya tenía si hay grandfathering, y los nuevos reciben más producto con menos cupo). El free de 2 con nutrición sigue siendo top-3 del mercado en generosidad efectiva.

### 3.4 Fixes propuestos (en orden)

1. **Arreglar el riel B para que lea DB** — es un bug latente independiente de esta decisión: `coach-subscription-gate.ts:74-83` y `workspace-core.ts:154-167` deben comparar contra `coaches.max_clients ?? getTierMaxClients(tier)` igual que el riel A. Con esto, el gate y el alta de alumnos dejan de poder divergir para siempre.
2. **Congelar a los existentes**: migración one-shot que asegure `max_clients = 3` en toda fila `subscription_tier='free'` con `max_clients IS NULL` o distinto (hoy debería ser no-op porque las altas lo escriben, pero blinda el grandfathering contra filas antiguas).
3. **Bajar la constante**: `packages/tiers/index.ts:102` (`maxClients: 3` → `2`) y el label `:79` (`'Hasta 2 alumnos'`).
4. **Matar el hardcode del cron**: `api/cron/trial-expiry/route.ts:59` → `getTierMaxClients('free')`.
5. **Copy y tests**: barrer las ~23 ocurrencias (pricing, landing v2, FAQ, HelpCenter, FreeWelcomeModal, ReactivateClient, verify-email web/RN, emails `transactional-templates.ts:182-517`, dashboard RN `CoachDashboardSections.tsx:517-933`) + los 2 tests. Revisar también `import.actions.ts:100` (fallback hardcodeado `?? 10`, otro literal suelto).
6. **Comunicación**: los free existentes conservan 3 (decirlo explícitamente evita churn de pánico); el pricing público pasa a 2.

---

## 4. Cierre: la foto completa del Free propuesto

| | Hoy | Propuesto |
|---|---|---|
| Alumnos | 3 | **2** (existentes conservan 3) |
| Nutrición base (V2) | De facto sí, sin contrato | **Sí, oficial en el catálogo** |
| Nutrición Pro (exchanges) | No (add-on de pago) | Igual |
| Whitelabel | No (Pro+) | Igual (Pro+) |
| Módulos (cardio, movement, bodycomp, exchanges) | No | Igual (planes pagos) |

Palancas de conversión resultantes: **alumno nº 3** (la principal, se dispara sola con el crecimiento del coach), **módulos profesionales** (Starter), **marca propia** (Pro). La nutrición gratis pasa de coste oculto a arma de adquisición con contrato claro.

---

## Fuentes de mercado (agosto 2026)

Trainerize: trainerize.com/pricing · help.trainerize.com (CBA fees) · quickcoach.fit/trainerize-pricing-2026 · pt-suite.com/blog/trainerize-add-on-trap-real-cost-2026 — Everfit: quickcoach.fit/everfit-pricing-2026 · coachway.io/articles/everfit-pricing · promealplan.com/everfit-review-2026 — TrueCoach: truecoach.co/pricing · help.truecoach.co (custom branding) — PT Distinction: ptdistinction.com/pricing — Hevy Coach: hevycoach.com/pricing — FITR: coachwithfitr.com/pricing — TrainHeroic: support.trainheroic.com — WeStrive: westrive.com/pricing — FitBudd: fitbudd.com (pricing + white label 2026) — QuickCoach: quickcoach.fit (sustainable-free-coaching-platform, quickcoach-pro) — Harbiz: totalgains.es/blog/harbiz-precios-2026. Datos no verificables de primera mano marcados en la investigación original; "Harder" no pudo confirmarse como competidor real (solo existe una app de un coach individual holandés con ese nombre).
