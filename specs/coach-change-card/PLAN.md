# Coach Change Card (MercadoPago) - PLAN

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-06-15
**Spec:** `specs/coach-change-card/SPEC.md`

---

## Architecture

Modalidad A: pagina web propia que tokeniza la tarjeta client-side (MercadoPago.js **Secure Fields**, `iframe:true` → PCI SAQ-A, sin cuenta MP) y un backend que hace `PUT /preapproval/{id} { card_token_id }` para swap in-place. La misma pagina la abre la futura app RN en navegador externo (fase 2).

Data flow (Clean Architecture):

```text
app/coach/subscription/update-card/_components (Secure Fields client)
  -> POST /api/payments/change-card (shell delgado: guards + adapter)
  -> services/billing/change-card.service.ts (logica)
  -> lib/payments/providers/mercadopago.ts (PaymentsProvider.updateCardAtProvider)
  -> MercadoPago PUT /preapproval/{id}
```

El provider abstrae MP detras de `PaymentsProvider` (ya existente). El service orquesta guards + audit + last4. La ruta es shell delgado (no estilo route-heavy de addons).

## Files

| Action | Path | Notes |
|---|---|---|
| CREATE | `specs/coach-change-card/{SPEC,PLAN,TASKS}.md` | SDD |
| UPDATE | `apps/web/src/lib/payments/types.ts` | `updateCardAtProvider(checkoutId, cardTokenId, idempotencyKey)` en `PaymentsProvider` |
| UPDATE | `apps/web/src/lib/payments/providers/mercadopago.ts` | impl PUT body `{ card_token_id }` + idempotency via `mpPutJson` (sin tocar callers) |
| UPDATE | `apps/web/src/lib/payments/providers/stripe.ts` | stub `NotImplemented` |
| UPDATE | `apps/web/src/lib/rate-limit.ts` | `rateLimitCardChange` fail-closed (espeja `rateLimitInviteAccept`) |
| UPDATE | `apps/web/src/lib/constants.ts` | `CARD_CHANGE_DISCLOSURE` versionada |
| CREATE | `apps/web/src/services/billing/change-card.service.ts` | logica + `CardChangePort` estrecho |
| CREATE | `apps/web/src/app/api/payments/change-card/route.ts` | guards order + consent + audit + last4 + error taxonomy |
| CREATE | `apps/web/src/app/coach/subscription/update-card/page.tsx` + `_components/` | Secure Fields + Trust UI + gate por flag |
| UPDATE | `apps/web/src/app/api/payments/webhook/route.ts` | early-return no-op para card-only `updated` |
| UPDATE | `apps/web/src/app/coach/subscription/page.tsx` | mostrar `····last4` + banner `paused` con CTA |
| CREATE | `supabase/migrations/<ts>_coach_card_metadata.sql` | `card_last4/card_brand/card_payment_method_id` service-role-only |
| UPDATE | `apps/web/vercel.json` | orígenes MP en CSP + consolidar headers |
| UPDATE | `apps/web/.env.example`, `CLAUDE.md`, `docs/operations/MANUAL_TASKS.md` | `NEXT_PUBLIC_MP_PUBLIC_KEY`, `CHANGE_CARD_ENABLED` |

## Data Model

- **DB changes:** migracion aditiva (`ADD COLUMN IF NOT EXISTS`): `coaches.card_last4 text`, `card_brand text`, `card_payment_method_id text` (nullable).
- **RLS impact:** ninguna policy nueva. Column grants: NO agregar a la allowlist de `GRANT UPDATE` de `authenticated` (default deny). Asercion de ausencia en `information_schema.column_privileges`.
- **Generated types:** regenerar `database.types.ts` tras merge.

## Server Actions

- **Endpoint:** `POST /api/payments/change-card` (route handler, no server action — alineado con el resto de `api/payments/*`).
- **Validation:** Zod `{ cardToken: string, acceptedTermsVersion: string, last4?: /^\d{4}$/, brand?: allowlist }`.
- **Guards order:** auth → flag (`CHANGE_CARD_ENABLED`) → rate-limit (`rateLimitCardChange`) → workspace (`canViewBilling`) → zod → terms (`acceptedTermsVersion`) → fetch coach (service-role) → status/in-flight/superseded/null guards.
- **Revalidation:** la pagina re-hidrata via fetch del estado (`subscription-status`); update optimista de last4.

## UI/UX

- **Mobile viewport:** `dvh`, safe areas. Iframes de Secure Fields no heredan Tailwind → estilos via `fields.create()` (incluye dark mode).
- **Dark mode:** soportado; pasar tokens de color al brick.
- **Trust UI:** "{brand} ···· {last4}", estado vacio legacy, lockup "Procesado por Mercado Pago / EVA no almacena tu numero", CTA "Guardar tarjeta" (no "Pagar").
- **Components:** route-local en `update-card/_components/` (no atomico — uso single-domain).
- **SDK:** `next/script`, mount idempotente useRef+cleanup; retry re-tokeniza (token single-use).

## Phases

1. **Fase 1 (web, este branch):** provider + ruta + service + pagina Secure Fields + migracion + webhook guard + CSP + consent + tests; flag OFF en prod. Gate sandbox Q1/Q6/Q9 antes del flip.
2. **Fase 2:** recuperacion de pago fallido (`paused`/`pending_payment` resume, Q10); handoff RN mobile (scheme `eva://` + OTT + assetlinks/AASA reales).
3. **Fase 3:** tarjeta secundaria, `advancedFraudPrevention`, funnel PostHog, dunning email sequence.

## Test Plan

- **Unit:** guards (standalone/status/in-flight/superseded/null), flag OFF→403, consent stale→400, `rateLimitCardChange` (N+1→429, Redis-throw→403/429), body shape (1 key), grants ausentes, last4 spoof ignorado, token no loggeado.
- **Integration:** provider call mockeada (fetch); webhook no-op para `updated` sin cambio de monto.
- **E2E (Playwright):** route-stub de `sdk.mercadopago.com` + `/v1/card_tokens` → asegura POST a `/api/payments/change-card`. Iframe real = manual.
- **Manual (sandbox MP Preview test-seller):** Q1 (diff GET pre/post), Q2 (iframe real), Q6 (smoke CSP en preview), Q9 (webhooks 24h), Q10 (PUT en paused).

## Rollback Plan

Flag `CHANGE_CARD_ENABLED` OFF + redeploy (la ruta da 403, la pagina no monta). La migracion es aditiva (columnas nullable sin lectores criticos) → no requiere revert. Provider/route/service son net-new → revert = quitar el codigo nuevo. Cero impacto en create/cancel/reactivate.
