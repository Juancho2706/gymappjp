# Coach Change Card (MercadoPago) - TASKS

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-06-15
**Spec:** `specs/coach-change-card/SPEC.md`
**Plan:** `specs/coach-change-card/PLAN.md`

---

## Tasks

- [ ] **T0 (BLOQUEANTE, primero) - Diff de sandbox Q1/Q9/Q10** *(requiere creds MP test-seller)*
  - Scope: `PUT { card_token_id }` en sandbox; capturar `GET /preapproval` before/after; observar webhooks 24h; probar PUT en `paused`.
  - Verification: el body shape del provider y el allowlist de status se congelan con este resultado. Fixture commiteado para Q1.

- [ ] **T1 - Env + flag server-only**
  - Scope: `CHANGE_CARD_ENABLED` (sin `NEXT_PUBLIC_`, `=== 'true'`), `NEXT_PUBLIC_MP_PUBLIC_KEY` (publica, NO Sensitive; Preview `TEST-`, Prod `APP_USR-`). `.env.example` + CLAUDE.md + MANUAL_TASKS §MT-25.
  - Verification: ruta da 403 con flag OFF (unit); build con la key inyectada.

- [ ] **T2 - Provider `updateCardAtProvider`**
  - Scope: `types.ts` interfaz; `mercadopago.ts` impl body literal `{ card_token_id }` + `X-Idempotency-Key` via `mpPutJson` (sin tocar callers); `stripe.ts` stub `NotImplemented`.
  - Verification: snapshot test del body saliente (exactamente 1 key); `pnpm typecheck`; `mercadopago.snapshot.test.ts` + 8 `route.test.ts` verdes.

- [ ] **T3 - `rateLimitCardChange` fail-closed**
  - Scope: `rate-limit.ts`, espeja `rateLimitInviteAccept` (try/catch + null-Redis → `{ok:false}`), ~5/h por `auth.uid()`.
  - Verification: unit N+1→429; Redis-throw→403/429 (no 500/200).

- [ ] **T4 - `CARD_CHANGE_DISCLOSURE` versionada**
  - Scope: `constants.ts`, texto es-latam con los 5 puntos (nueva tarjeta para proximos cobros, monto/ciclo/fecha sin cambio, no cobra hoy, MP notifica, como cancelar). Pendiente firma JP.
  - Verification: version distinta a `ADDON_PAYMENT_RULES.version`; consumida por la ruta.

- [ ] **T5 - Service + ruta**
  - Scope: `change-card.service.ts` (logica + `CardChangePort`); `route.ts` (guards order del PLAN, consent 400-on-stale, audit `subscription_events` key `card_change:{coachId}:{ts}`, last4 autoritativo via `GET /v1/card_tokens/{id}`, error taxonomy tipada, assert post-PUT de Q1).
  - Verification: unit de cada guard; IDOR (body con otro `mp_id` ignorado); 403 para 4 workspaces no-standalone; token no aparece en logs.

- [ ] **T6 - Pagina Secure Fields**
  - Scope: `update-card/page.tsx` + `_components/`; `next/script`, mount idempotente, retry re-tokeniza; Trust UI; dark mode via `fields.create()`; `dvh`/safe areas; gate por flag.
  - Verification: render con flag ON; estados loading/error; E2E route-stub del POST.

- [ ] **T7 - Migracion `card_*`**
  - Scope: `<ts>_coach_card_metadata.sql` aditiva service-role-only; comentario "token nunca persistido".
  - Verification: asercion estilo `tests/separation/module-grants.sql` (ausencia de UPDATE para `authenticated`); regen `database.types.ts`.

- [ ] **T8 - Webhook no-op guard**
  - Scope: `webhook/route.ts` early-return `{ok:true}` para `preapproval updated` con monto==compuesto, ref intacto, status active, ANTES del bloque `:670`.
  - Verification: unit `updated` sin cambio de monto → cero drift/snapshot/mutacion; Q7b con captura real.

- [ ] **T9 - CSP MP en `vercel.json` + consolidar**
  - Scope: orígenes MP en `script-src`/`frame-src`/`connect-src`; consolidar CSP a fuente unica (borrar duplicado de `next.config.ts`); comentar la asimetria de `X-Frame-Options`.
  - Verification: test CI parsea `vercel.json` (3 orígenes en 3 directivas); smoke iframe en Vercel Preview (release gate).

- [ ] **T10 - UI de entrada + last4 + banner paused**
  - Scope: `coach/subscription/page.tsx` mostrar `····last4` + estado vacio legacy + banner `paused` con CTA a update-card.
  - Verification: render por estado; dark mode.

- [ ] **T11 - Soporte/observabilidad**
  - Scope: email de confirmacion (Resend, informativo); runbook `docs/operations/RUNBOOK.md` seccion cambio de tarjeta + macros; metrica de outcome (fila de swap + contador `paused→active`).
  - Verification: email en preview; runbook revisado por CSM.

## Universal Definition of Done

- [ ] `pnpm typecheck`
- [ ] Targeted tests for touched domain (`npx vitest run`)
- [ ] No direct feature-data Supabase calls in `_data`
- [ ] Server route validates with Zod
- [ ] Mutations call `revalidatePath()` where needed
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Fixed edge UI uses safe-area utilities
- [ ] Dark mode checked when UI changes
- [ ] New atomic UI has Storybook story (N/A — route-local)
- [ ] Docs updated (CLAUDE.md env table, MANUAL_TASKS, RUNBOOK, canonical docs)

## Gates pre-prod (no negociables)

- [ ] Q1 verde (CI durable, fixture grabado): swap no mueve ciclo, no escribe snapshot
- [ ] Q6 verde (smoke iframe Vercel Preview, 0 violaciones CSP)
- [ ] Q9 resuelto (captura webhooks 24h post-swap)
- [ ] Firma JP: delta de T&C/privacidad + copy `CARD_CHANGE_DISCLOSURE`
- [ ] 11 P0 del panel cerrados

## Notes

- Feature standalone, necesaria para EVA, **NO gated en Movida**.
- Body shape del PUT se congela con T0 (sandbox), no antes.
- Flag OFF en prod hasta gates verdes; Preview ON.
