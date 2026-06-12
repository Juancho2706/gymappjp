# 04 · PLAN — Consolidación de planes + ciclos (Growth/Scale fuera de la venta, trimestral y anual en todos los pagos)

> Ejecuta la **Parte III** (y el punto de ciclos de la decisión nueva del dueño, 2026-06-11) de la fuente de verdad: [Estrategia Teams-first](2026-06-11-teams-first-modulos-addons.md). Las decisiones de los socios ahí tomadas NO se re-litigan acá; este plan las implementa.
> Set de planes: [00-DIRECTOR](00-DIRECTOR.md) · [01-archivado-enterprise](01-PLAN-archivado-enterprise.md) · [02-landing-teams-ui](02-PLAN-landing-teams-ui.md) · [03-modulos-compra-only](03-PLAN-modulos-compra-only.md) · **04 (este)** · [05-billing-addons-selfservice](05-PLAN-billing-addons-selfservice.md).
> Memorias aplicables: `project-teams-first-strategy`, `project-plan1-gate-pending` (el GATE Movida sigue PENDIENTE y es prioridad 1 — este plan no lo bloquea), `project-movida-commercial`.
>
> **⚠️ EXCEPCIÓN MOVIDA:** nada de este plan publica precios de lista nuevos antes del cierre del deal (reunión 12-jun). Movida es contrato custom; este plan toca la oferta standalone. La card/sección Teams en pricing/landing es del [plan 02](02-PLAN-landing-teams-ui.md) y va SIN números hasta post-cierre.

## Objetivo

Consolidar la oferta pública a **free + starter + pro + elite** (3 planes pagos + 1 free): `growth` y `scale` salen de TODA superficie de venta pero quedan intactos en runtime, admin y DB (grandfathering + placeholder de cuentas gestionadas). **Decisión nueva del dueño (2026-06-11): trimestral Y anual disponibles en todos los planes pagos que quedan** (hoy quarterly existe solo en elite+, `apps/web/src/lib/constants.ts:195-202`). De paso, corregir los 3 RPCs de MRR del admin que hoy computan MAL (`scale=64990` desactualizado y `growth` ausente del CASE — bug pre-existente). Todo aditivo; el CHECK de DB **no se toca**.

## Estado actual (auditado en este plan, evidencia file:line)

| Pieza | Hoy | Evidencia |
|---|---|---|
| Union type | 6 tiers | `apps/web/src/domain/coach/types.ts:3` |
| Catálogo | `TIER_CONFIG` con 6 entradas; `scale.annualPriceClp = 1.900.000` hardcodeado | `apps/web/src/lib/constants.ts:67-112` (annual en `:109`) |
| Ciclos | starter/pro: monthly+annual; elite/growth/scale: +quarterly; free: ninguno | `constants.ts:195-202` |
| Precio por ciclo | descuentos globales −10% trimestral / −20% anual, con rama especial `annualPriceClp` | `constants.ts:169-176` (rama en `:174`) |
| Fallback recomendación | `getRecommendedTier` ordena los 6 y cae a `'scale'` | `constants.ts:241-244`; duplicado en `apps/web/src/app/coach/reactivate/ReactivateClient.tsx:45-46` y `apps/mobile/lib/coach-tiers.ts:14-17` |
| Registro | itera `TIER_CONFIG` completo (6 cards) | `apps/web/src/app/(auth)/register/page.tsx:28` (y validación `:99`) |
| Validación venta | `VALID_TIERS` con 6 | `register/_actions/register.actions.ts:31`, `app/coach/onboarding/complete/_actions/complete.actions.ts:17` |
| Checkout | Zod `z.enum([...5 pagos])`; monto en `getTierPriceClp` | `app/api/payments/create-preference/route.ts:18` y `:83` |
| Webhook | parse de `external_reference` valida `tierRaw in TIER_CONFIG`; fallback a tier de DB + guard de ciclo | `lib/payments/checkout-external-reference.ts:27`, `app/api/payments/webhook/route.ts:144-153,171-173` |
| Pricing page | grupo "Negocio establecido" = elite+growth+scale | `app/pricing/page.tsx:75-90,150-160` |
| Landing preview | 6 cards + `ALL_ORDER` de 6 | `components/landing/LandingPricingPreview.tsx:93-113,863-865` |
| Upsell dashboard | `GrowthUpgradeBanner` (elite ≥48 alumnos) → `?upgrade=growth` | `app/coach/dashboard/_components/DashboardShell.tsx:101-103,212-234` |
| Placeholder gestionadas | `subscription_tier: 'scale'` en team/org provisioning | `app/coach/team/_actions/team.actions.ts:91,94`, `app/admin/(panel)/teams/_actions/teams.actions.ts:93-94`, `app/org/[slug]/_actions/org.actions.ts:355`, migración `supabase/migrations/20260609230000_coach_team_managed_status.sql:16` |
| Admin asigna cualquier tier | enums de 6 en update + bulk | `app/admin/(panel)/coaches/_actions/coach-actions.ts:114,291` |
| Mobile (duplicado, no importa de web) | mapa de 6 tiers ×3 archivos + normalizador | `apps/mobile/lib/coach-tiers.ts:5-16`, `apps/mobile/lib/coach.ts:11,21`, `apps/mobile/lib/coach-subscription.ts:12-19`, `apps/web/src/app/api/mobile/coach/dashboard/route.ts:17` |
| RPCs MRR (BUG hoy) | CASE sin `growth` y con `scale=64990` (real: 84.990/190.000) | `supabase/migrations/00000000000001_baseline.sql:476-506,512-534,540-563` (valores malos en `:492,:523,:551`) |
| CHECK DB | 6 valores; índice parcial growth | `baseline.sql:938` y `:1955` |
| Schemas compartidos | enum de 6 en `AdminCreateCoachSchema` | `packages/schemas/coach.ts:68` |

## F0 — Decisiones del dueño (2026-06-11) — RESUELTAS

Las open questions que este plan dejaba a F0 quedaron decididas (definitivas, no se re-litigan; se conservan acá por trazabilidad):

- **F0-a (techo de elite) — RESUELTA:** SUBE a **100 alumnos**. El bump es **REGALADO** a los elite existentes vía UPDATE idempotente (F4.5 queda **RATIFICADO y ya no condicional**). Statuses que suben: `active`/`trialing`/`canceled`, y también `past_due`/`paused` — por simplicidad; el webhook corrige `max_clients` al reactivar (`webhook/route.ts:173`).
- **F0-b (precios de tiers) — RESUELTA:** SIN CAMBIOS ($19.990 starter / $29.990 pro / $44.990 elite). Racional del dueño: más valor (60→100) al mismo precio, cero riesgo pre-Movida; revisión post-cierre. El CASE de F4.1 queda con los valores ya listados — es final.
- **F0-c (grandfather) — RATIFICADA:** D4 queda como está — cambios de cuentas legacy SOLO vía admin/soporte; reactivación pública ancla a elite + puente Teams.
- **F0-d (drift de display de D3) — RESUELTA:** drift aceptado **condicionado** a que el conteo del GATE (paso 0) muestre **0 scale-anual activos**; si aparece alguno → FRENAR y preguntar al dueño antes de mergear F1/F2.
- **F0-e (branch de la migración F4.1) — RESUELTA (default operativo, el dueño puede vetar):** entra en el MISMO branch/sesión del gate Movida — una sola ventana de riesgo, junto con el UPDATE de la org de prueba que se empaqueta en esa misma sesión.
- **F0-f (IVA — D5 del dueño):** SILENCIO total sobre IVA en todo el copy de precios que este plan toque (F2.4/F2.5/register) hasta que el dueño constituya EVAapp SpA (en proceso, jun-2026). Tarea de revisión de copy registrada en F5.
- **Restricción global:** cero servicios pagos NUEVOS — todas las mejoras integradas en este plan usan el stack ya contratado (Supabase, Resend, PostHog, Vercel, Upstash); ninguna lo tienta.

## Decisiones técnicas de este plan (con juicio)

Las decisiones de producto (matar growth/scale de la venta, grandfather, ciclos en todos los pagos) vienen del doc fuente y del dueño — acá solo se decide el **cómo**.

### D1 — Mecanismo: lista `SALE_TIERS` separada (opción b), NO borrar del union type (opción a)

**Juicio:** la opción (a) — borrar `growth`/`scale` de `TIER_CONFIG` y del union — es la más "limpia" en papel pero rompe runtime y build en cadena:

- `webhook/route.ts:144` hace fallback a `coach.subscription_tier` leído de DB; con (a), `TIER_ALLOWED_BILLING_CYCLES[tier]` es `undefined` y `:153` lanza `TypeError` **dentro del webhook de pago** de un coach grandfathered — el peor lugar posible para un crash.
- `app/coach/subscription/page.tsx:201` colapsa tier desconocido a `'starter'` → un growth grandfathered vería "Starter" como su plan actual.
- `team.actions.ts:94` y `teams.actions.ts:94` llaman `getTierMaxClients('scale')` → con (a) no compila; `org.actions.ts:355` setea el literal `'scale'` (con `max_clients: 500` hardcodeado en `:358`). Los tres son el placeholder vivo de TODAS las cuentas team/org-managed (el flujo Movida incluido).
- `apps/mobile/lib/coach.ts:21` parsea el valor crudo de DB → necesita reconocer los 6 para no degradar a `'starter'` (su fallback en `:22`).

La opción (b) logra el objetivo comercial (growth/scale invisibles e incomprables) restringiendo **las superficies de venta**, con cero migración de datos y cero riesgo fintech. El union y `TIER_CONFIG` conservan las 6 entradas como **runtime legacy**; la venta itera una lista nueva.

Concreto:
- `domain/coach/types.ts`: agregar `export type SaleTier = 'free' | 'starter' | 'pro' | 'elite'` (subset; el union `SubscriptionTier` queda intacto en `:3`).
- `constants.ts`: agregar `export const SALE_TIERS: readonly SaleTier[] = ['free', 'starter', 'pro', 'elite']`, `export const LEGACY_TIERS = ['growth', 'scale'] as const` y helper `isSaleTier(tier: string): tier is SaleTier`. Comentar las entradas growth/scale de `TIER_CONFIG`: `// LEGACY — fuera de venta. Grandfathered + placeholder team/org_managed (migración 20260609230000). NO borrar.`

### D2 — Ciclos: los 3 ciclos para los 3 pagos; entradas legacy intactas

`TIER_ALLOWED_BILLING_CYCLES` (`constants.ts:195-202`) queda:

```ts
free:    [],                                    // sin ciclo (igual que hoy)
starter: ['monthly', 'quarterly', 'annual'],    // +quarterly (decisión dueño 2026-06-11)
pro:     ['monthly', 'quarterly', 'annual'],    // +quarterly
elite:   ['monthly', 'quarterly', 'annual'],    // igual que hoy
growth:  ['monthly', 'quarterly', 'annual'],    // LEGACY — solo runtime, jamás ofertado
scale:   ['monthly', 'quarterly', 'annual'],    // LEGACY — idem
```

**Juicio:** mantener las entradas legacy con sus ciclos actuales es deliberado — el guard `webhook/route.ts:153` (`isBillingCycleAllowedForTier`) corre en CADA evento de pago; si un preapproval growth trimestral en vuelo dejara de "estar permitido", el webhook abriría una `payment_exception` falsa en cada renovación. El cobro trimestral NO requiere validación nueva en MercadoPago: EVA ya cobra `months=1/3/12` en producción (doc fuente, Parte IV) y el checkout arma el preapproval con `BILLING_CYCLE_CONFIG[cycle].months` — habilitar quarterly en starter/pro es solo abrir la compuerta de la constante.

El CHECK `coaches_billing_cycle_check` (`baseline.sql:933`) ya permite los 3 ciclos para cualquier tier — cero DDL para esta parte.

### D3 — `annualPriceClp` de scale desaparece; descuentos globales como única regla

Eliminar el campo opcional `annualPriceClp` de `TierConfig` (`domain/coach/types.ts:21`), el valor hardcodeado (`constants.ts:109`) y la rama especial de `getTierPriceClp` (`constants.ts:174`). Queda: mensual = lista; trimestral = `×3 −10%`; anual = `×12 −20%`, para todo tier.

**Juicio:** el campo existía solo para redondear el anual de scale a $1.9M; sin scale en venta es código muerto que complica el punto único de cálculo que el [plan 05](05-PLAN-billing-addons-selfservice.md) va a extender con add-ons (`create-preference/route.ts:83`). Drift aceptado y documentado: si existiera un scale-anual grandfathered, la UI le mostraría $1.824.000 en vez de $1.900.000 (cálculo `190000×12×0.8`); el cobro real NO cambia (el monto vive congelado en el preapproval de MP). El conteo del GATE (abajo) confirma si el caso existe — lo esperable es 0. **[F0-d RESUELTA]** El dueño aceptó el drift CONDICIONADO al conteo: si el paso 0 del GATE muestra ≥1 scale-anual activo, FRENAR y preguntar antes de mergear.

### D4 — Grandfathering: política explícita + parse legacy

**Política (la recomendada por el doc fuente §3.4, ratificada acá):** los suscriptores growth/scale **activos mantienen plan, precio y límite de alumnos mientras no cambien nada**. Los tiers solo salen de la VENTA.

Cómo lo sostiene el código tras este plan:
- **Webhooks en vuelo:** `parseCheckoutExternalReference` valida `tierRaw in TIER_CONFIG` (`checkout-external-reference.ts:27`); como `TIER_CONFIG` conserva las 6 entradas (D1), un `external_reference = 'uuid|growth|quarterly'` sigue resolviendo tier+ciclo correctos — **no cae al fallback** ni congela el tier. Es la respuesta a la decisión "parse acepta legacy": sí, por construcción.
- **Renovaciones:** el webhook re-escribe `subscription_tier`/`max_clients` desde el parse (`webhook/route.ts:171-173`) con los valores legacy correctos (`getTierMaxClients('growth')=120` sigue existiendo).
- **Lo que un grandfathered YA NO puede hacer self-service:** cambiar de ciclo o reactivarse EN growth/scale (el checkout nuevo solo acepta sale tiers, F2.4). Caso esperado raro (ver GATE paso 0); se resuelve vía admin (`coach-actions.ts:114` conserva el union completo; requiere los fixes de F4.3 — agregar `growth` al `CoachEditSheet` y corregir `yearly`→`annual`, sin los cuales la palanca admin falla justo en estos casos) o migrando a elite/Teams. Documentar en el runbook de soporte.
- **Reactivación pública de un growth/scale cancelado:** `ReactivateClient` lo ancla a elite + aviso puente a Teams (F2.7), nunca a su tier muerto.

### D5 — Admin conserva el union completo; solo la CREACIÓN baja a sale tiers

El panel admin es la palanca del CEO sobre cuentas legacy y placeholders: `UpdateCoachSchema` (`coach-actions.ts:114`), bulk (`:291`), `CoachFilterBar`, `CoachCommandPanel.tsx:394`, `AdminStatusBadge`, `ChartSection` **mantienen los 6 valores** (hay filas con esos tiers; filtrar/editar/graficar legacy es correcto). **[corregido por panel de revisión]** `CoachEditSheet.tsx:77-80` hoy NO tiene los 6: hardcodea solo starter/pro/elite/scale (faltan `free` y `growth` — gap pre-existente); como la palanca de D4 es justamente el admin, F4.3 lo completa. Lo único que baja a `SALE_TIERS`: `CoachCreateSheet` (`_components/CoachCreateSheet.tsx:184`) y `AdminCreateCoachSchema` (`packages/schemas/coach.ts:68`) — cuentas nuevas no nacen en tiers muertos; los placeholders team se crean por `/admin/teams` con `'scale'` hardcodeado, que no pasa por ese schema.

**Juicio:** separar "gestionar lo que existe" (union completo) de "crear lo nuevo" (sale tiers) es la línea que evita tanto el lock-out del CEO como la resurrección accidental de growth.

### D6 — Techo de elite y puente a Teams: ~~parametrizado por F0~~ **F0-a RESUELTA (2026-06-11): techo = 100, bump regalado**

~~El techo (60 hoy vs ~100 propuesto por el doc §3.5) es decisión del dueño (open question, no se asume acá).~~ **RESUELTA:** el techo SUBE a **100** y el bump es **regalado** a los elite existentes (D2 del dueño: el precio NO cambia). El plan implementa el puente "más → Teams" de forma independiente del número, y la tarea antes condicional pasa a ser obligatoria:
- `TIER_CONFIG.elite.maxClients` (`constants.ts:95`) → 100, `TIER_STUDENT_RANGE_LABEL.elite` (`:62`) actualizado, espejo mobile (`coach-tiers.ts:9`), y el `UPDATE` idempotente post-deploy de F4.5 (statuses definidos por F0-a: `active`/`trialing`/`canceled` + `past_due`/`paused`, por simplicidad — el webhook corrige al reactivar) — sin él, los elite existentes quedarían en 60 hasta su próxima renovación (el webhook re-setea `max_clients` en `route.ts:173`). Migración aditiva, entra al mismo protocolo de branch (F0-e: la sesión del gate Movida).

---

## Fases

### F1 — Núcleo: domain + constants (web)

1. `domain/coach/types.ts`: agregar `SaleTier`; quitar `annualPriceClp?` de `TierConfig` (`:21`). El union `SubscriptionTier` (`:3`) NO cambia.
2. `lib/constants.ts`:
   - `SALE_TIERS`, `LEGACY_TIERS`, `isSaleTier()` (D1).
   - `TIER_ALLOWED_BILLING_CYCLES` (`:195-202`) según D2.
   - `getTierPriceClp` (`:169-176`): eliminar rama `annualPriceClp` (`:174`); quitar `annualPriceClp` de scale (`:109`).
   - `getRecommendedTier` (`:241-244`): `ordered = SALE_TIERS`, fallback `'elite'` (el "más de elite" lo maneja la UI con el puente Teams, no un tier).
   - `getTierBillingCycleSummary` (`:221-232`): tras D2 la rama "mensual o anual" (`:225-227`) queda muerta para sale tiers — simplificar a free/"los 3 ciclos" y dejar la genérica para legacy.
   - **(F0-a)** Techo elite: `TIER_CONFIG.elite.maxClients` (`:95`) → `100`; `TIER_STUDENT_RANGE_LABEL.elite` (`:62`) → rango actualizado a 100. Precios NO se tocan (F0-b).
   - Comentarios `LEGACY` en las entradas growth/scale de `TIER_CONFIG`, `TIER_CAPABILITIES`, `TIER_STUDENT_RANGE_LABEL`.
3. **Tests (escritura, misma tanda):** reescribir `lib/constants.test.ts`:
   - starter/pro/elite × quarterly = `true`; free × todo = `false`; growth/scale × los 3 = `true` (runtime legacy, con comentario de por qué).
   - `getTierPriceClp('starter','quarterly') = 53.973` (`19990×3×0.9`, redondeo `Math.round`) y `('pro','quarterly') = 80.973`; `('scale','annual') = 1.824.000` (rama especial eliminada — pin del drift D3/F0-d).
   - `getRecommendedTier(80) = 'elite'` (cabe en el techo nuevo 100) y `getRecommendedTier(1000) = 'elite'` (fallback); `getTierMaxClients('elite') = 100` (pin F0-a).
   - `isSaleTier('growth') = false`, `SALE_TIERS.length = 4`.
   - **(mejora #10 aprobada) Vitest de labels:** por CADA uno de los 6 valores del CHECK de DB (`baseline.sql:938` — free/starter/pro/elite/growth/scale) existe label en `TIER_CONFIG` y entrada en los mapas de display de suscripción (icono `subscription/page.tsx:21`, fondo `:25`, color `:30,:34`) y en `TIER_LABELS` de mobile (`apps/mobile/lib/coach-subscription.ts:12-19`). Para poder pinnearlos: exportar esos mapas a un módulo testeable (o directo al paquete de F6, donde el test queda como fuente única web+mobile). Pin estructural: si alguien agrega un tier al CHECK sin display, el test rompe.
4. `pnpm typecheck` + `npx vitest run apps/web/src/lib/constants.test.ts` por tanda (permitido por la regla 2026-06-10).

### F2 — Superficies de venta (web)

1. **Registro** `app/(auth)/register/page.tsx`:
   - `:28` `tierOptions` itera `SALE_TIERS` (mapear a `TIER_CONFIG[t]`), no `Object.entries(TIER_CONFIG)`.
   - `:98-101` la normalización del query param `tier` usa `isSaleTier` — `?tier=growth` (links viejos en mails/ads) degrada a `'starter'` sin romper. El ciclo (`:103-112`) se re-valida solo contra el tier resultante vía `isBillingCycleAllowedForTier` — sin cambios.
   - El selector de frecuencia (`:372-396`) ya es dinámico vía `getTierAllowedBillingCycles` (`:75-79`) y su grid ya es `md:grid-cols-3` (`:375`) → quarterly aparece en starter/pro sin trabajo extra. Verificar el copy del resumen paso 3 (`:414-419`) con ciclo trimestral.
   - **(mejora #6 aprobada)** Marcar **pro** como "Más popular" en las cards del paso 2 (render `:314`): badge equivalente al de `/pricing` (`pricing/page.tsx:64` define `popular: true` para pro; badge en `:223-226`) — anchoring + paridad de superficies de venta.
   - **(F0-f)** Cero mención de IVA en el copy de precios del registro (silencio total hasta EVAapp SpA).
2. **Server actions de venta:** `register.actions.ts:31` y `complete.actions.ts:17` → `VALID_TIERS = SALE_TIERS`.
3. **Checkout:** `create-preference/route.ts:18` → `z.enum(['starter', 'pro', 'elite'])`. El guard `:48` y el monto `:83` no cambian de firma (el [plan 05](05-PLAN-billing-addons-selfservice.md) suma add-ons ahí — no chocar). Consecuencia D4 documentada: grandfathered no puede re-checkout en su tier.
4. **Pricing** `app/pricing/page.tsx`:
   - Quitar `growth` (`:75-82`) y `scale` (`:83-90`) de `planDisplay`.
   - Grupo "Negocio establecido" (`:150-160`): queda solo elite; el espacio de la grilla recibe la **card Teams "conversemos"** del [plan 02](02-PLAN-landing-teams-ui.md) — frontera: este plan SOLO recorta; el 02 agrega la card (sin números pre-cierre Movida, CTA mailto como el callout existente `:190-197`).
   - Badge del grupo "Coach individual" (`:142`) "Mensual o anual" → "Mensual, trimestral o anual" (o eliminar ambos badges: ya no diferencian nada).
   - Callout final (`:190-197`): "¿más de 500 alumnos…?" → "¿Trabajas en equipo o superaste el plan Elite? Conoce EVA Teams" + mailto (números post-cierre). **(default operativo SLA)** Si el copy del CTA menciona tiempos de respuesta: "Te contactamos a la brevedad" — sin plazo comprometido.
   - FAQ (`:162-187`): revisar "¿Cuándo se cobra?" — sigue válido; agregar respuesta corta sobre trimestral/anual si el copy del 02 no la cubre.
   - Metadata `:23` ya dice "mensual, trimestral o anual" — queda correcta recién ahora.
   - **(F0-f / D5 del dueño)** Cero mención de IVA en TODO el copy de precios de la página (ni "+ IVA" ni "IVA incluido") hasta constituir EVAapp SpA — tarea de revisión registrada en F5.
5. **Landing** `components/landing/LandingPricingPreview.tsx`: quitar growth/scale de `planDisplay` (`:93-111`) y de `ALL_ORDER` (`:113` → `SALE_TIERS`); quitar `PlanCardCompact` de growth/scale (`:864-865`); limpiar claves i18n huérfanas `landing.pricing.plan.growth.desc` / `scale.desc` en `lib/i18n/es.json:115-116` y `en.json:115-116`. El re-layout de 6→4 cards + sección Teams es del [plan 02](02-PLAN-landing-teams-ui.md) — coordinar en la misma tanda si ambos están en curso.
6. **Reactivación** `app/coach/reactivate/ReactivateClient.tsx`:
   - `:22` `tierOptions` desde `SALE_TIERS`.
   - `:42` candidate de query/currentTier: si es legacy (growth/scale cancelado), anclar a `'elite'`.
   - `:45-46` fallback → `'elite'`; si `activeClientCount > getTierMaxClients('elite')`, mostrar bloque "tu cartera supera el plan más alto — conversemos de EVA Teams" (mailto) en lugar de auto-bump silencioso a un tier que ya no existe. El botón de pago queda deshabilitado en ese estado (el guard `tierBlockedByClients` `:73` ya existe — reusar su UX).
7. **Suscripción** `app/coach/subscription/page.tsx`:
   - `:71` `tierOptions` = `SALE_TIERS` sin free (hoy `Object.keys(TIER_CONFIG)` sin free).
   - **[corregido por panel de revisión]** La página NO lee query params (cero `useSearchParams`/`searchParams` en el archivo) — el `?upgrade=growth` de DashboardShell es no-op hoy y muere con el href en F2.8; no hay tarea de deep-link acá. Lo que SÍ hay en `:102-111`: el fetch de `subscription-status` pre-selecciona `selectedTier` con el tier ACTUAL del coach (`tier in TIER_CONFIG`). **Tarea real:** si el tier actual es legacy (growth/scale), `setSelectedTier('elite')` en vez del legacy — sin esto, un grandfathered abre la página con `selectedTier='growth'` (que ya no se renderiza en la lista de venta de F2.7.1), y "Continuar" mandaría `tier=growth` a `create-preference`, que tras F2.3 responde 400 en plena UX de cambio de plan.
   - `:201,:214,:390-391` el render del **plan actual** del coach sigue usando `TIER_CONFIG[coach.subscription_tier]` completo → un grandfathered ve "Growth" correcto (garantizado por D1). Verificar que el card de plan actual no se mezcle con la lista de venta.
   - **(mejora #4 aprobada)** Fallback de tier DESCONOCIDO en `:201`: hoy un valor que no está en `TIER_CONFIG` colapsa silenciosamente a `'starter'` (icono/color de starter para un tier que no es starter — enmascara data corrupta o un tier nuevo sin display). Reemplazar por un **estado de error explícito** en el card de plan actual (icono neutro + label crudo `coach.subscription_tier` + aviso "plan no reconocido — contacta soporte"), nunca colapsar a starter. El label en `:214` ya cae al valor crudo — alinear icono/color con esa misma filosofía. Con el vitest de labels (F1.3, mejora #10) este estado debería ser inalcanzable, pero el render no debe mentir si se alcanza.
   - Limpiar iconos/colores growth/scale de los mapas de display (`:21,:25,:30,:34`) solo si se quitan del render — si el plan actual puede ser legacy, **se quedan** (decisión: se quedan, con comentario LEGACY).
8. **Dashboard puente Teams** `app/coach/dashboard/_components/DashboardShell.tsx`:
   - `GrowthUpgradeBanner` (`:212-234`) → renombrar `TeamsBridgeBanner`: copy "¿Más de 100 alumnos o trabajas con otros profesionales? Conoce EVA Teams" (número actualizado al techo nuevo F0-a) + CTA mailto `contacto@eva-app.cl` (sin precios pre-cierre Movida; el [plan 02](02-PLAN-landing-teams-ui.md) puede luego apuntarlo a `/pricing#teams`; si menciona tiempos: "Te contactamos a la brevedad"). Trigger `:101-103` (`elite && totalClients >= 48`): ajustar el umbral a **80** (~80% del techo nuevo 100, mismo momento Head-of-Sales que el 48/60 actual).
   - Muere el href `?upgrade=growth` (`:227`).
9. **Processing** `app/coach/subscription/processing/page.tsx:48-49`: la normalización `in TIER_CONFIG` puede quedarse (muestra label de lo que se pagó, incluso legacy en vuelo) — solo comentario.
10. **Tests (escritura, misma tanda):**
    - `tests/sprint3-register-pricing.spec.ts`: asserts nuevos — `/pricing` muestra exactamente 4 cards de plan (free/starter/pro/elite) y NO contiene texto "Growth"/"Scale"; card de starter y pro listan fila "Trimestral"; `/register?tier=growth&cycle=quarterly` normaliza a starter; `/register?tier=pro&cycle=quarterly` deja `billing_cycle=quarterly` en el hidden input (espejo del test existente `:9-31`); paso 2 del registro marca pro como "Más popular" (mejora #6); ni `/pricing` ni `/register` contienen el texto "IVA" (pin F0-f).
    - `tests/payment-flow-mock.spec.ts`: agregar variante `tier=starter&cycle=quarterly` (hoy solo monthly `:24-25,:51`).
    - `lib/payments/checkout-external-reference.test.ts`: casos nuevos — `'uuid|growth|quarterly'` **sí** parsea (grandfather en vuelo, pin de D4) y `'uuid|starter|quarterly'` parsea (ciclo nuevo permitido).
    - La EJECUCIÓN Playwright va al GATE (abajo); vitest por tanda sí.

### F3 — Mobile (mismo cambio, anti-drift)

`apps/mobile` duplica el mapa de tiers sin importar de web — actualizar en la **misma tanda** que F1/F2 o divergen:

1. `apps/mobile/lib/coach.ts:11,21`: union y normalizador **se mantienen con los 6** (parsean el valor crudo de DB de cuentas legacy) + comentario LEGACY.
2. `apps/mobile/lib/coach-tiers.ts`: `TIER_CONFIG` conserva las 6 entradas (display de grandfathered, `:5-12`); `getRecommendedTier` (`:14-17`) → ordered sale tiers + fallback `'elite'` (espejo exacto de F1.2). **(F0-a, ya no condicional)** `elite.maxClients` en `:9` → 100.
3. `apps/mobile/lib/coach-subscription.ts:12-19`: `TIER_LABELS` ya tiene los 6 — sin cambio. **(mejora #3 aprobada, 1 línea)** `STATUS_LABELS` (`:21-30`) tiene `org_managed` (`:29`) pero le falta `team_managed` (status que existe desde la migración `20260609230000_coach_team_managed_status.sql`) → agregar `team_managed: 'Gestionada por tu equipo'`; sin esto, un coach de pool team ve el status crudo sin label.
4. `apps/mobile/components/coach/CoachDashboardSections.tsx` — `MobileGrowthUpgradeBanner` (`:233-264`) completo, no solo el href: el copy `:256` ("Hay un plan Growth para coaches con 60-120 alumnos.") y el CTA `:260` ("Ver Growth") siguen VENDIENDO el tier muerto → espejo del `TeamsBridgeBanner` de F2.8 (copy puente Teams, mailto/`openCoachWebPath` a la superficie que F2.8 defina); el href `:241` (`?upgrade=growth`) muere junto con el resto. Alinear con F2.8 en la misma tanda.
5. Lado web del contrato mobile: `app/api/mobile/coach/dashboard/route.ts:17` y `app/coach/dashboard/page.tsx:17` normalizan el valor de DB con los 6 — **sin cambio**, comentario LEGACY (son parse, no venta).
6. **Validación mobile por tanda:** `npx tsc --noEmit` + `npx expo export --platform android` (regla de `apps/mobile/AGENTS.md`).

### F4 — Admin + RPCs MRR (única migración del plan, aditiva)

1. **Migración `CREATE OR REPLACE`** (idempotente, forward-only) para los 3 RPCs de MRR — corrige el bug pre-existente Y contempla los tiers finales:
   - `get_platform_mrr_12_months` (`baseline.sql:476-506`), `get_platform_revenue_by_cycle` (`:512-534`), `get_platform_revenue_by_tier` (`:540-563`).
   - CASE nuevo: `starter 19990 · pro 29990 · elite 44990 · growth 84990 · scale 190000` (hoy: `scale=64990` MAL en `:492,:523,:551` y `growth` AUSENTE → un growth activo computa $0 de MRR). ~~Si F0 ajusta precios, este CASE toma los finales.~~ **F0-b RESUELTA: precios sin cambios — este CASE es final.**
   - Los legacy se quedan en el CASE a propósito: mientras exista UN grandfathered pagando, su MRR debe contarse. Las cuentas team/org-managed no contaminan: el filtro `subscription_status='active' AND subscription_mp_id IS NOT NULL` (`:499-501`) ya las excluye (`team_managed`/`org_managed` ≠ `active`).
   - **(mejora #5 aprobada, misma migración)** RPC nuevo `get_legacy_tier_counts()`: conteo por `subscription_tier × subscription_status × billing_cycle` de filas con tier `growth`/`scale` (excluyendo nada — los placeholders `team_managed`/`org_managed` salen visibles y se distinguen por status). Mismo patrón de seguridad que los RPCs MRR existentes (`baseline.sql:476-506`). Observabilidad de extinción del grandfather: cuando llegue a 0 reales, se puede planear matar el union legacy.
   - **Compatible con el protocolo del gate Movida:** DDL aditiva, ~~puede subirse al MISMO branch efímero… o al siguiente branch, decisión del dueño (open question)~~ **F0-e RESUELTA: entra en el MISMO branch/sesión del gate Movida** (Director Movida §3; memoria `project-plan1-gate-pending`), empaquetada junto con el UPDATE de la org de prueba — una sola ventana de riesgo.
2. `app/admin/(panel)/finanzas/_data/finanzas.queries.ts:25-32`: `TIER_PRICES` local está correcto hoy pero es la tercera copia del precio — derivarlo de `TIER_CONFIG` (`Object.fromEntries(... monthlyPriceClp)`) para que no vuelva a divergir.
   - **(mejora #8 aprobada)** El archivo usa `unstable_cache` (`finanzas.queries.ts:1` import, `:34` wrapper) — excepción a la regla del repo ("React.cache, no unstable_cache — incompatible con Supabase SSR"). Acá NO rompe porque la query corre con service-role SIN cookies (la incompatibilidad es por el contexto de cookies de SSR). **Normalizar:** comentario explícito en el archivo documentando POR QUÉ es excepción válida + nota en el doc de arquitectura que aplique (F5); si al tocar el archivo la migración a `React.cache` resulta trivial y sin pérdida (el TTL de `unstable_cache` sí se pierde), migrar — si no, queda documentada como excepción. Cero servicios nuevos.
   - **(mejora #5, lado UI)** Card "Legacy (grandfather)" en `/admin/finanzas`: consume `get_legacy_tier_counts()` desde `finanzas.queries.ts` (sumarlo al `Promise.all` existente de los RPCs) y muestra cuántos growth/scale quedan por status/ciclo — el dashboard de extinción que D4 necesita para saber cuándo el grandfather muere solo.
3. Admin UI según D5: `CoachCreateSheet.tsx:184` y `packages/schemas/coach.ts:68` bajan a sale tiers; `coach-actions.ts:114,291`, `CoachFilterBar.tsx:21-22`, `CoachCommandPanel.tsx:394`, `AdminStatusBadge.tsx:18`, `ChartSection.tsx:121` **quedan con los 6** + comentario LEGACY. **[corregido por panel de revisión]** `CoachEditSheet.tsx:77-80` hoy lista solo starter/pro/elite/scale — **agregar `growth` (y `free`)** para que el CEO pueda editar grandfathered (la palanca de D4; hoy un coach growth abriría el sheet con un Select sin su valor).
   - **(mejora #7 aprobada — cómo se implementa lo anterior)** NO re-hardcodear: las 3 listas de tiers del admin (`CoachEditSheet.tsx:77-80`, `CoachCommandPanel.tsx:394`, `CoachFilterBar.tsx:21-22`) ya divergieron entre sí — derivarlas de las constantes (union completo desde `Object.keys(TIER_CONFIG)`; tras F6, desde el paquete compartido). El fix de `CoachEditSheet` (agregar growth/free) sale gratis al derivar; mata la clase de bug, no solo la instancia.
   - **Bug pre-existente que rompe la palanca D4 para ciclo anual (mejora #1, RATIFICADA por el dueño):** los selects de ciclo del admin envían `yearly` (`CoachEditSheet.tsx:114`, `CoachCommandPanel.tsx:447`) y `UpdateCoachSchema` lo acepta (`coach-actions.ts:117` — `z.enum(['monthly','quarterly','yearly'])`), pero el CHECK de DB solo permite `annual` (`baseline.sql:933`) → hoy TODO cambio de ciclo a anual vía admin falla con constraint violation. Como D4 manda los cambios de ciclo de grandfathered "vía admin", corregir en esta fase: valor `annual` en los 2 selects + enum del schema (3 líneas, cero DDL).
4. **NO tocar:** CHECK `coaches_subscription_tier_check` (`baseline.sql:938`) — grandfather + placeholder; índice parcial `idx_coaches_growth_tier` (`:1955`) — inofensivo y útil para monitorear grandfathered; placeholders `'scale'` de team/org provisioning (`team.actions.ts:91`, `teams.actions.ts:93-94`, `org.actions.ts:355`) — siguen compilando por D1.
5. **(F0-a RESUELTA — ya NO condicional, RATIFICADO)** Techo elite 100 con bump regalado: migración post-deploy idempotente
   ```sql
   UPDATE coaches SET max_clients = 100
   WHERE subscription_tier = 'elite'
     AND subscription_status IN ('active','trialing','canceled','past_due','paused')
     AND max_clients = 60;
   ```
   Statuses definidos por el dueño: `active`/`trialing`/`canceled` suben; `past_due`/`paused` TAMBIÉN — simplicidad, el webhook corrige `max_clients` al reactivar (`route.ts:173`). El predicado `max_clients = 60` la hace idempotente y respeta overrides manuales del admin. + cambios de F1.2/F3.2 (constantes web/mobile a 100). Entra al mismo branch/sesión del gate (F0-e).
6. **Tests (escritura):** script SQL read-only para el gate — sobre data sintética del branch: cada RPC devuelve el precio correcto por tier (incluye growth=84990, scale=190000); un coach `team_managed` con tier scale suma $0; `get_legacy_tier_counts()` (mejora #5) refleja la data sintética legacy insertada y NO cuenta tiers de venta; el UPDATE de F4.5 es no-op al correrlo dos veces (pin de idempotencia).

### F6 — Paquete compartido de tiers (mejora #2 aprobada — refactor estructural anti-drift, fase propia)

Mover el mapa de tiers a un paquete del workspace para que web Y mobile importen UNA fuente — mata la clase de drift que F3 mitiga a mano (el "Estado actual" documenta el duplicado: `apps/mobile/lib/coach-tiers.ts:5-16` no importa de web):

1. Crear `packages/tiers` (`@eva/tiers`, junto a `@eva/schemas` — workspace pnpm ya configurado; paquete puro TS sin postinstall → no toca `allowBuilds`): mover `TIER_CONFIG`, `SALE_TIERS`, `LEGACY_TIERS`, `isSaleTier`, `BILLING_CYCLE_CONFIG`, `TIER_ALLOWED_BILLING_CYCLES`, `getTierPriceClp`, `getTierMaxClients`, `getRecommendedTier`, los mapas de display testeables (F1.3 mejora #10) y los tipos (`SubscriptionTier`, `SaleTier`, `TierConfig`, `BillingCycle`) desde `apps/web/src/lib/constants.ts` y `domain/coach/types.ts`. Regla de capas respetada: el paquete es puro (cero Next.js/Supabase/React), compatible con "domain/ no importa de lib/" — domain re-exporta del paquete (mismo patrón que `packages/schemas`).
2. `apps/web`: `lib/constants.ts` y `domain/coach/types.ts` re-exportan de `@eva/tiers` (los call sites NO cambian en esta fase — limpieza de imports gradual, fuera de alcance). `constants.test.ts` apunta al paquete; el vitest de labels (mejora #10) pasa a pinnear web+mobile con UN test.
3. `apps/mobile`: `lib/coach-tiers.ts` pasa a re-exportar de `@eva/tiers` (muere el espejo a mano de F3.2); `lib/coach.ts:11` y `coach-subscription.ts:12` consumen el union/labels del paquete. Patrón ya probado en mobile: ya importa `@eva/schemas` y `@eva/brand-kit` (AGENTS.md mobile, "Shared logic anti-drift").
4. Las 3 listas del admin (F4.3, mejora #7) cambian su import a `@eva/tiers` en esta fase (si F4 ya las derivó de `constants.ts`, es un cambio de import 1-línea).
5. **Validación de la fase:** `pnpm typecheck` + `npx vitest run` (web) + `npx tsc --noEmit` + `npx expo export --platform android` (mobile — el export pesca errores de resolución metro/pnpm que tsc no ve, regla de `apps/mobile/AGENTS.md`).
6. **Orden:** después de F1–F3 (mover constantes ya finalizadas, no a mitad de cambio) y antes del cierre F5. Es mover + re-exportar, cero lógica nueva — el riesgo real es resolución de módulos en metro, cubierto por el expo export.

### F5 — Docs en la misma PR

- `docs/status/NEXT_STEPS.md` y la bitácora del director de estrategia: oferta consolidada + política grandfather escrita + techo elite 100 (F0-a) registrado.
- Nota en `docs/operations/RUNBOOK.md` (o el runbook de soporte que aplique): qué hacer cuando un grandfathered growth/scale pide cambio de ciclo o reactivación (vía admin; ver D4).
- **(F0-f / D5 del dueño)** Dejar tarea explícita en `docs/status/NEXT_STEPS.md`: **al constituirse EVAapp SpA, revisar TODO el copy de precios** (pricing, landing, register, mails) para definir el tratamiento del IVA — hasta entonces, silencio total (ningún "+ IVA" ni "IVA incluido").
- **(mejora #8)** Registrar la excepción `unstable_cache` de finanzas (F4.2) en el doc de arquitectura que aplique, o documentar la migración a `React.cache` si se hizo.
- `packages/tiers` (F6): actualizar `docs/architecture/PROJECT_STRUCTURE.md` (regla del repo: cambios de estructura actualizan canónicos en el mismo change).
- Grep final de cierre: `growth|scale` en `apps/web/src` y `apps/mobile` — todo hit restante debe estar comentado LEGACY o ser falso positivo (animaciones `scale` de Moti/Reveal, `phantom.ts`).

---

## Archivos clave

`domain/coach/types.ts` · `lib/constants.ts` + `constants.test.ts` · `app/(auth)/register/page.tsx` + `_actions/register.actions.ts` · `app/coach/onboarding/complete/_actions/complete.actions.ts` · `app/api/payments/create-preference/route.ts` · `lib/payments/checkout-external-reference.ts` + `.test.ts` · `app/pricing/page.tsx` · `components/landing/LandingPricingPreview.tsx` + `lib/i18n/{es,en}.json` · `app/coach/reactivate/ReactivateClient.tsx` · `app/coach/subscription/page.tsx` · `app/coach/dashboard/_components/DashboardShell.tsx` · `apps/mobile/lib/{coach-tiers,coach,coach-subscription}.ts` + `components/coach/CoachDashboardSections.tsx` · `app/admin/(panel)/coaches/_components/{CoachCreateSheet,CoachEditSheet,CoachCommandPanel,CoachFilterBar}.tsx` + `_actions/coach-actions.ts` + `packages/schemas/coach.ts` · `app/admin/(panel)/finanzas/` (queries + card legacy) · `packages/tiers/` (nuevo, F6) · `supabase/migrations/<ts>_fix_mrr_rpcs_consolidated_tiers.sql` (RPCs MRR + `get_legacy_tier_counts` + UPDATE elite 100) · `tests/sprint3-register-pricing.spec.ts` + `tests/payment-flow-mock.spec.ts`.

## Orden sugerido

1. ~~F0 del dueño (techo elite, precios) — ver open questions~~ **F0 RESUELTO (2026-06-11):** techo elite 100 + bump regalado, precios sin cambios — el plan arranca con esos valores (sección F0 arriba).
2. F1 (núcleo) + F3 (mobile) en la MISMA tanda → typecheck + vitest + tsc/expo-export.
3. F2 (superficies) en 1-2 tandas → typecheck + vitest; specs Playwright se ESCRIBEN acá, se corren en el gate.
4. F4 (admin + migración RPCs) — la migración espera al branch efímero autorizado (F0-e: la sesión del gate Movida).
5. F6 (paquete compartido `@eva/tiers`) → typecheck + vitest + tsc/expo-export.
6. F5 (docs) en la PR de cierre.
7. GATE DEL PLAN (abajo).

Dependencias cruzadas: [02](02-PLAN-landing-teams-ui.md) rehace pricing/landing por encima de este recorte (este plan recorta, el 02 agrega Teams) — si corren juntos, F2.4/F2.5 se hacen en la rama del 02. [05](05-PLAN-billing-addons-selfservice.md) extiende `create-preference:83` — este plan no le cambia la firma; además el 05 implementa D3/D4 del dueño (precio de lista de módulos $9.990 uniforme; add-ons con descuento de ciclo + regla nueva trim/anual de cobro inicial one-shot prorrateado) — este plan NO los toca. [01](01-PLAN-archivado-enterprise.md) es independiente.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Webhook de preapproval growth/scale en vuelo crashea o congela tier | D1+D4: `TIER_CONFIG` y `TIER_ALLOWED_BILLING_CYCLES` conservan entradas legacy; test de parse legacy pinneado |
| Grandfathered bloqueado para cambiar ciclo self-service | Asumido y documentado (D4); vía admin; conteo del GATE dimensiona el impacto (esperado ~0) |
| Drift web↔mobile si F3 se posterga | F1+F3 misma tanda, obligatorio |
| Publicar números de Teams antes del cierre Movida | PROHIBIDO en este plan; card Teams sin precios es del 02; memoria `project-movida-commercial` |
| Subir techo elite sin el UPDATE deja a elites viejos en 60 | F4.5 (RATIFICADO, ya no condicional, statuses definidos); el webhook igual los corrige en la próxima renovación (`route.ts:173`) |
| La migración RPC se cuela fuera del protocolo de branch | Solo entra vía branch efímero autorizado (F0-e: sesión del gate Movida; Director Movida §3); jamás `db push` directo |
| Links externos viejos `?tier=growth` rompen registro | F2.1: degradación silenciosa a starter + spec que lo pinnea |
| F6 rompe resolución de módulos en metro (pnpm aislado) | `npx expo export --platform android` obligatorio en la validación de F6; patrón ya probado con `@eva/schemas`/`@eva/brand-kit` |
| Copy de precios menciona IVA antes de constituir EVAapp SpA | F0-f: silencio total; spec pinnea ausencia de "IVA" en pricing/register; revisión de copy queda como tarea al constituirse (F5) |

## Definition of Done

- La venta entera (register, pricing, landing preview, reactivate, subscription upgrade, create-preference) ofrece exactamente free/starter/pro/elite, con **mensual, trimestral y anual** seleccionables y cobrables en los 3 pagos; pro marcado "Más popular" en register y pricing; cero mención de IVA (F0-f).
- growth/scale: invisibles en venta; intactos en runtime (webhook, subscription page del grandfathered, placeholders team/org, admin completo); CHECK de DB sin tocar.
- **Techo elite = 100** en constantes web + mobile y en DB para los elite existentes (UPDATE F4.5 aplicado, idempotente verificado); umbral del `TeamsBridgeBanner` ajustado a 80.
- RPCs MRR computan growth=84990 y scale=190000 (bug pre-existente cerrado); `get_legacy_tier_counts` live + card legacy visible en `/admin/finanzas`.
- Admin: fix `yearly`→`annual` aplicado (selects + `UpdateCoachSchema`); las 3 listas de tiers del admin derivadas de las constantes (cero hardcodeo).
- Mobile espejado en la misma tanda (tsc + expo export verdes); `STATUS_LABELS` incluye `team_managed`; fallback de tier desconocido en subscription page es error explícito, no starter.
- **F6:** `@eva/tiers` es la única fuente de tiers importada por web Y mobile (re-exports en su lugar); vitest de labels cubre los 6 valores del CHECK.
- `pnpm typecheck` + `pnpm test` verdes por tanda; specs Playwright y SQL escritos.
- Política de grandfathering escrita en docs + runbook de soporte; excepción `unstable_cache` documentada (o migrada); tarea de revisión de copy IVA registrada en NEXT_STEPS.

---

## GATE DEL PLAN (ejecución de Playwright/SQL/prod)

> **⚠️ ANTES DE CORRER: preguntar al usuario — tiene tests pendientes de otros planes (gate Movida, prioridad 1) y la regla 2026-06-10 exige autorización explícita** para todo Playwright/SQL contra Supabase. typecheck+vitest por tanda sí están permitidos y se corren durante F1-F4.

Con autorización explícita, en este orden:

1. **Paso 0 — conteo grandfather (read-only en PROD, pedir OK aparte porque toca Supabase — ratificado por el dueño: la query de conteo en prod SIGUE requiriendo OK en el GATE):**
   ```sql
   select subscription_tier, subscription_status, billing_cycle,
          count(*) as total,
          count(*) filter (where subscription_mp_id is not null) as con_preapproval
   from coaches
   where subscription_tier in ('growth','scale')
   group by 1, 2, 3 order by 1, 2, 3;
   ```
   Excluir mentalmente los placeholders (`team_managed`/`org_managed`). Si hay >0 activos con preapproval real → confirmar la política grandfather con el dueño ANTES de mergear F2. **Regla F0-d:** si aparece ≥1 `scale` activo con `billing_cycle='annual'` → FRENAR (el drift de display D3 deja de ser teórico) y preguntar al dueño.
   **(mejora #9 aprobada) Segundo SELECT sanity — quarterly en starter/pro debe ser 0** (el ciclo recién se habilita con este plan; >0 = data inesperada, investigar antes de deploy):
   ```sql
   select count(*) as starter_pro_quarterly_activos
   from coaches
   where subscription_tier in ('starter','pro')
     and billing_cycle = 'quarterly'
     and subscription_status in ('active','trialing','past_due','paused');
   ```
2. **Migración RPCs + UPDATE elite (F4.1 + F4.5):** branch efímero Pro según Director Movida §3 — ~~idealmente el MISMO branch… (decisión del dueño)~~ **F0-e RESUELTA: el MISMO branch/sesión de las 7 migraciones `20260611*` del gate pendiente**, empaquetado junto con el UPDATE de la org de prueba (una sola ventana de riesgo). `apply_migration` → suite SQL de F4.6 (incluye pin de idempotencia del UPDATE y `get_legacy_tier_counts`) → `get_advisors` (0 críticos) → merge en verde → `supabase db pull` → **borrar el branch el mismo día**.
3. **Playwright:** `tests/sprint3-register-pricing.spec.ts` y `tests/payment-flow-mock.spec.ts` actualizados; smoke de no-regresión: `tests/separation/*.spec.ts` no tocan tiers de venta pero validan que el recorte no rompió nav/login de cuentas `team_managed` (tier scale placeholder).
4. **Manual (5 min):** registro real con starter+trimestral hasta la pantalla de MP (sin pagar) — el preapproval debe mostrar monto $53.973 y frecuencia 3 meses; `/coach/subscription` de la cuenta de prueba juanmvr (o un grandfathered si el paso 0 encontró alguno) muestra su plan actual correcto; `/admin/finanzas` muestra la card legacy (mejora #5) con los conteos consistentes con el paso 0; un elite de prueba muestra límite 100 (F0-a).
5. Sandbox MP completo NO es requisito de este plan (no cambia el mecanismo de preapproval; quarterly ya cobra en prod) — el sandbox queda para el [plan 05](05-PLAN-billing-addons-selfservice.md).
