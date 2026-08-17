# PLAN — Pricing v2 (ejecución en el día)

Referencia: [SPEC](SPEC.md) + artifact «Precios EVA v2» (`e1c1f0db`). Workers Opus
implementan guiados, Sonnet lo mecánico, Fable juzga. Tareas en [TASKS](TASKS.md).

## Arquitectura

1. **Wave A — catálogo + grandfather (el corazón):** `packages/tiers` gana
   `PRICING_V2_CUTOVER` (ISO date) + `tierMaxClientsFor(tier, coachCreatedAt)`
   (viejo: free 3 / pro 30 / elite 100 · nuevo: 2 / 25 / 60) + free capabilities
   a true + `SALE_TIERS = ['free','pro','elite']`. `getTierMaxClients` clásico
   queda como los límites NUEVOS (catálogo de venta); todo sitio con `coach` a
   mano usa el helper con fecha. Módulos: `hasPaidModuleAccess` sin `!= 'free'`.
2. **Wave B — escritores y lectores de límite:** activate-free, trial-expiry,
   capacity.service, confirms/webhooks que fijen `max_clients`, clients.actions y
   API mobile (lectura ya prioriza la columna: `coach.max_clients ?? …` — el
   fallback pasa al helper con fecha), admin panel. joinViaInviteAction gana el
   conteo (P7).
3. **Wave C — fallbacks starter (mecánico):** barrido `\?\? 'starter'` → `?? 'free'`
   (lista exacta en el informe del worker repo, ~35 sitios) + enums de pago
   (`create-preference`, `confirm-enrollment` Flow) rechazan starter + `COUPON_TIERS`
   deja de emitir starter. Cada sitio con su test donde exista suite.
4. **Wave D — superficies:** /pricing re-agrupado 3 planes + copy free «todo
   incluido»; landing bullets; register; reactivate web+RN (límite comunicado con
   grandfather); SubscriptionContent; CoachCommandPanel; upsell copy → Pro.
5. **Wave E — medición:** PostHog en /pricing (pageview + plan_click) y checkout
   (`checkout_started`/`checkout_confirmed`), mismo gate de consentimiento que el
   resto (patrón MetaPixel/PostHog existente).
6. **Cierre jefe:** gates completos + capturas + docs (`CURRENT`) + juicio.

## Orden y adyacencia

- **NO arrancar hasta que el workflow del Sello v2 cierre y se commitee**: Wave C
  toca `coach/layout.tsx` y `c/[coach_slug]/layout.tsx` (fallbacks starter), los
  mismos archivos donde el Sello monta `AppSeal`. Ejecutar en serie, mismo día.
- A → B/C en paralelo (comparten solo el helper) → D → E. Sonnet para C y E;
  Opus para A, B, D.
- El OTA #3 acumulado sale DESPUÉS de esta tanda (RN consume @eva/tiers): un solo
  OTA con Sello + Guía Viva + pricing.

## Qué NO hacer

- No tocar precios CLP (espera el estudio IVA).
- No DDL, no UPDATE masivo, no tocar filas existentes de `max_clients`.
- No borrar `starter` del union/TIER_CONFIG/CHECK (histórico + growth/scale patrón).
- No prometer features en superficies que el gate server no libere en la misma
  tanda (UI nunca autoriza: capability primero, copy después).
- No tocar la app enterprise ni el registro RN (free-only stores).
