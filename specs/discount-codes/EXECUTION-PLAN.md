# EXECUTION PLAN — Discount Codes (Cupones)

> specs/discount-codes/EXECUTION-PLAN.md · Software Architect final plan · 2026-06-20
> Status: NOT IMPLEMENTED. This is the merged, critic-folded execution plan. SDD gate (F0) blocks all code.

## 1. Summary + Resolved Decisions

EVA adds a coupon/discount-codes engine: the CEO mints codes in `/admin/codigos`; a coach redeems one in `/coach/subscription` (and optionally at `/register`). A redeemed code lowers the recurring price charged through MercadoPago by routing the discount through the **single price chokepoint** `getCompositeAmountClp`, so checkout, every webhook recompute, both reconcile passes, every billing snapshot, and the on-load read path agree on one honored amount. The system is money-safe (no MP `transaction_amount <= 0`, no `addon_amount_drift` false-fires), drift-safe (discount re-resolved server-side from `coaches.active_coupon_redemption_id`, never trusted from `external_reference` or the client), SERNAC-compliant (Ley 19.496 art.28/30/35 — blocking server-priced disclosure, per-charge snapshot evidence, future-only revert that never raises an honored mid-term price), and RLS-isolated (coupon catalog write = service-role only; coach reads only own redemption snapshot).

**Resolved decisions (CEO, 2026-06-20 — do not re-litigate):**

- `discount_type` = `percent | fixed_clp` ONLY. NO `free_period`. **"Free months" go via existing `admin_grant`** (manual CEO courtesy), NOT a redeemable code — the paid path refuses `netClp <= 0` (CEO decision 2026-06-20). MP native `free_trial` deferred to v2.
- `applies_to_scope` = FULL in the **schema**. v1 ships **`target='base'` + `target='total'`** (F2a). **`target='total'` is the PRIMARY mode** (CEO decision 2026-06-20): a standing % off the coach's WHOLE recurring bill (base + whatever modules are live), persisting across module add/remove for the coupon's duration — automatic, because `getCompositeAmountClp` re-resolves the live composite × discount on every renewal. **Per-module-SPECIFIC targeting (`target='module'`, F2b) is DEFERRED post-v1** — not needed; `total` covers all current deals.
- `fixed_clp_target` = per-coupon configurable (`base | module | total`), default `base`, clamped `>= 0` inside `getCompositeAmountClp`.
- Revert = **future-only, honor mid-term**: revoking stops FUTURE re-application but NEVER raises an honored price mid-term (SERNAC art.30/35). A gated fraud-clawback path (typed reason + audit) is DEFERRED/optional.
- Mint = CEO/`ADMIN_EMAILS` only (reuse `assertAdmin` + `admin_audit_logs`). No org/team owner minting in v1.
- Legal disclosure copy = APPROVED (blocking modal in `/coach/subscription` before confirm; server-side exact price; placeholders `{CODIGO}{DESCUENTO}{PRECIO_CON_DESCUENTO}{PRECIO_NORMAL}{DURACION}`; "de por vida" variant omits the revert line).
- Non-stackable: one active coupon per subscription. 100%-off-FOREVER courtesy goes through existing `admin_grant`, NOT the paid coupon path.

---

## 2. Architecture Recap

### 2.1 Three-table model (+ extensions)
| Table | Role | Write | Read |
|---|---|---|---|
| `coupons` | Coupon definition (type, value, target, duration, scope, caps) | service-role only | no `authenticated` SELECT |
| `coupon_codes` | Redeemable codes for a coupon (normalized code, per-code caps, restrictions) | service-role only | no `authenticated` SELECT |
| `coupon_redemptions` | Append-only ledger; frozen `discount_value_snapshot`, consent evidence, cycles remaining, status | service-role only | SELECT-own (`coach_id = auth.uid()`) |
| `coaches.active_coupon_redemption_id` (new col) | Pointer to live redemption, recomputed by trigger | **service-role only (NOT in GRANT allowlist)** | own row |
| `billing_snapshots` (+cols) | `base_before_discount_clp`, `discount_clp`, `coupon_code`, `coupon_redemption_id` | service-role only | SELECT-own |

### 2.2 MP-net-at-source
The MP `transaction_amount` set by `updateCheckoutAmount`/`updateCheckoutAmountAndRef` and the `transaction_amount` in `createCheckout` are ALWAYS the discounted net produced by `getCompositeAmountClp(tier, cycle, billableAddons, spec)`. The discount is never applied "after" MP — it is applied **at the source** so MP's stored preapproval amount already equals the honored net.

### 2.3 Drift-safety chokepoint
**Every** money computation flows through `getCompositeAmountClp`, which gains an optional `discount?: DiscountSpec` last arg and (via overload) returns `{ totalClp, baseBeforeDiscountClp, discountClp }` when a spec is passed. `DiscountSpec` is **re-resolved server-side from `coaches.active_coupon_redemption_id`** at every call site (never embedded in `external_reference`, never client math). The webhook/cron drift checks compute `expectedClp` with the SAME resolved spec, so a discounted preapproval never trips `addon_amount_drift`. Inline `baseClp + breakdown.reduce(...)` snapshot totals are **eliminated** — they too go through the structured composite return.

---

## 3. Phases

> Dependency order: **F0 → F1 → F2a → F2b → F3 → F4 → F5**. F3 (admin) can start in parallel with F2a once F1's `database.types.ts` is regenerated, but must not deploy before F2a's money path lands behind the flag.

---

### F0 — SDD gate + spec authoring (BLOCKING, task-zero)

**Why:** CLAUDE.md SDD pillar forbids implementation without `SPEC.md`. The dir `specs/discount-codes/` **does not exist** (verified). Plan text still references the dropped `free_period` type — must be purged.

#### Tasks
1. Create `specs/discount-codes/SPEC.md` from `specs/_templates/SPEC.md` — user stories, acceptance criteria, explicit out-of-scope: `free_period`, MP native `free_trial`, org/team minting, fraud-clawback.
2. Create `specs/discount-codes/PLAN.md` from template — record 3-table model, MP-net-at-source, chokepoint, F2a/F2b phasing.
3. Create `specs/discount-codes/TASKS.md` from template — atomic tasks + DoD per phase.
4. Add a **compliance section** to SPEC.md: blocking modal, server price, evidence persisted, email-before-revert lead, no-IVA, non-stackable, "de por vida" variant.

#### DoD checklist
- [ ] All 3 spec files exist, reference `discount_type = percent | fixed_clp` ONLY.
- [ ] `free_period` recorded as out-of-scope; not referenced as a type anywhere.
- [ ] F2a/F2b split documented as acceptance criteria.

#### Edge cases handled
- Stale `free_period` references purged from prose (critic gap).

#### Risks + mitigations
| Risk | Mitigation |
|---|---|
| Slices edit non-existent spec files | F0 creates them first; all other phases depend on F0. |

#### Validation gate
SPEC.md/PLAN.md/TASKS.md present and reviewed. No code merges before this.

---

### F1 — DB migration (additive, forward-only, single file)

**Single migration:** `supabase/migrations/20260620120000_discount_codes.sql`. ALL coupon DDL (3 tables + both `billing_snapshots` column sets + `coaches` col + trigger + grants + RLS) lives here. **No other slice emits its own migration** (critic: separate migrations would collide on the same `billing_snapshots`/`coaches` columns during merge replay).

#### Tasks (ordered)
1. **Header** mirroring the `coach_addons_selfservice_billing` migration: additive / idempotent / forward-only / NOT-APPLY-NOW; rollback block. **AUDIT FIX (2026-06-20): the gate migrations are ALREADY LIVE in prod** — coach_addons billing `20260613151100`, compra-only grants `20260613214148` + `20260613214158`; `billing_snapshots` discount-readiness + the `coaches` grant allowlist exist → dependency SATISFIED, not pending (drop the "must land before" framing). **Run `supabase db pull` BEFORE authoring** (the local worktree is behind prod head `20260620010858` and its gate files are mis-timestamped `20260612*`). Slot `20260620120000` is after the true head `20260620010858` → replays in order.
2. `CREATE TABLE IF NOT EXISTS coupons`: `discount_type` CHECK IN (`'percent'`,`'fixed_clp'`) ONLY; `percent_value` CHECK 1..100; `amount_off_clp` CHECK `>= 0`; `fixed_clp_target` CHECK IN (`'base'`,`'module'`,`'total'`) DEFAULT `'base'`; XOR CHECK (exactly one of `percent_value`/`amount_off_clp` per `discount_type`); `duration` IN (`'once'`,`'repeating'`,`'forever'`); `duration_in_cycles` CHECK (CASE: NOT NULL & `>= 1` ONLY when `duration='repeating'`, else NULL); `applies_to_scope` jsonb DEFAULT `'{}'`; `max_redemptions`, `redeem_by`, `stackable` bool DEFAULT false; `created_by` uuid; timestamps. **CHECK reject `(percent_value = 100 AND duration = 'forever')`** (critic: 100%-forever must route via `admin_grant`, never the paid path → MP rejects `transaction_amount <= 0`).
3. `CREATE TABLE IF NOT EXISTS coupon_codes`: `coupon_id` FK ON DELETE CASCADE; `code_normalized` text; `code_display`; `active` bool; `expires_at`; `max_redemptions`; **`redeemed_count` int DEFAULT 0 CHECK `>= 0`** (atomic global-cap counter — critic TOCTOU fix); `per_account_limit` DEFAULT 1; `first_time_only` bool; `min_amount_clp`; `restricted_to_coach_id` FK coaches. UNIQUE partial index `lower(code_normalized) WHERE active`.
4. `CREATE TABLE IF NOT EXISTS coupon_redemptions` (append-only): `coupon_id` + `coupon_code_id` + `coach_id` FKs; `redeemed_at`; `status` CHECK IN (`'active'`,`'expired'`,`'reverted'`); `discount_value_snapshot` jsonb (frozen terms); `applied_cycles_remaining` int; `revoke_effective_at` timestamptz NULL (critic: honor until `current_period_end`); `billing_snapshot_id`; `normalized_email` text (critic: first_time_only atomic key); `coupon_terms_version` text; `coupon_terms_text` text (full interpolated copy — SERNAC evidence); `source_ip`. Indexes:
   - UNIQUE partial `(coupon_id, coach_id) WHERE status='active'` (per-account non-stackable).
   - UNIQUE partial `(coach_id) WHERE status='active'` (**one active coupon per subscription**).
   - UNIQUE partial `(coupon_id, normalized_email) WHERE first_time_only AND status='active'` (DB-enforced first-time atomicity — critic).
   - UNIQUE `(coupon_redemption parent, provider_payment_id)` ledger for cycle-decrement idempotency (see F4) — implemented as a small companion table `coupon_cycle_decrements(redemption_id, provider_payment_id)` UNIQUE.
5. `ALTER TABLE coaches ADD COLUMN IF NOT EXISTS active_coupon_redemption_id uuid NULL REFERENCES coupon_redemptions(id) **ON DELETE SET NULL**` (critic: breaks circular FK; no cascade). Code comment: service-role-only write. **Do NOT add to GRANT UPDATE allowlist of `20260612140000`.** `coupon_redemptions.coach_id` FK uses **ON DELETE CASCADE only if acceptable, else RESTRICT** to preserve SERNAC ledger — **decision: RESTRICT** (ledger is legal evidence). Create `coupon_redemptions` BEFORE the `coaches` ALTER (critic: ordering).
6. `ALTER TABLE billing_snapshots ADD COLUMN IF NOT EXISTS base_before_discount_clp integer`, `discount_clp integer DEFAULT 0`, `coupon_code text`, `coupon_redemption_id uuid` — **all nullable/defaulted** (critic: existing `insertBillingSnapshot` omits them → NOT NULL breaks recurring charges).
7. **Reconcile `billing_snapshots.kind` CHECK** (critic gap — verified: webhook inserts `'tier_upgrade_proration'` but the snapshot type only allows `'recurring' | 'addon_proration'`): `ALTER ... DROP CONSTRAINT IF EXISTS ...; ADD CONSTRAINT ... CHECK (kind IN ('recurring','addon_proration','tier_upgrade_proration'))` forward-only. Assert insert of every kind in tests.
8. `CREATE OR REPLACE FUNCTION sync_coach_active_coupon() ... SECURITY DEFINER` (mirror `sync_coach_enabled_modules`): recompute `coaches.active_coupon_redemption_id` from the live (`status='active'`) redemption, **COALESCE to NULL** when none (critic: `enabled_modules '{}'` gotcha). AFTER INSERT/UPDATE/DELETE trigger on `coupon_redemptions`. **AUDIT FIX:** declare `SECURITY DEFINER SET search_path = public` EXPLICITLY (not by reference). Trigger SELECT filters `WHERE coach_id = COALESCE(NEW.coach_id, OLD.coach_id) AND status='active'` so it rides the partial-unique index (single-row, no history scan).
9. **RLS + grants:** `ENABLE ROW LEVEL SECURITY` on all 3 tables; `REVOKE ALL FROM anon, authenticated`; `GRANT ALL TO service_role`; `GRANT SELECT ON coupon_redemptions TO authenticated`; SELECT-own policy `USING (coach_id = (SELECT auth.uid()))`. NO `authenticated` SELECT on `coupons`/`coupon_codes` (validate via SECURITY DEFINER RPC — F2). Explicit comment: `active_coupon_redemption_id` is service-role-only.
10. **`resolve_active_discount()` SECURITY DEFINER RPC** (`subscription-status` reads with a USER-SCOPED client; a join to `coupons`/`coupon_codes` returns empty under RLS → page shows list price while webhook charges discounted): returns ONLY the frozen `discount_value_snapshot` + `applied_cycles_remaining` of the caller's live redemption. **AUDIT FIX — NO `coach_id` parameter** (IDOR: a client-supplied id leaks another coach's snapshot; CLAUDE.md rule = always `auth.uid()`): resolve internally `v_coach := (SELECT auth.uid())`. Declare `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` (advisor `function_search_path_mutable` + hijack). `REVOKE EXECUTE FROM anon`; `GRANT EXECUTE TO authenticated`. Add IDOR test: coach A cannot read coach B's discount.
11. **FK-covering btree on EVERY new FK** (AUDIT FIX — repo baseline keeps `unindexed_foreign_key` at ZERO): `coupon_codes(coupon_id)`, `coupon_codes(restricted_to_coach_id)`, `coupon_redemptions(coupon_id)`, `coupon_redemptions(coupon_code_id)`, `coupon_redemptions(coach_id)`, `coupon_redemptions(billing_snapshot_id)`, `coaches(active_coupon_redemption_id)`, `coupon_cycle_decrements(redemption_id)`. **Drop the bare `(status)` index** (AUDIT: lands as `unused_index`; `status` is already in the partial-unique predicates). Code lookup: index plain `(code_normalized) WHERE active` (already normalized) and pin the redeem predicate to match it (AUDIT: `lower()` double-wrap → seq-scan). `EXPLAIN`-hits-index is a DoD line, not just prose.
12. **Validate additive-in-LIVE** (Supabase branches do NOT connect — memory): snapshot `_bak_<table>_<date>`; tx-rollback test (`SET LOCAL ROLE authenticated` + `jwt.claims`: authenticated cannot write `coupons`/`coupon_codes`/`coupon_redemptions` nor set `active_coupon_redemption_id` → `42501`); `get_advisors` security+performance 0 critical; then `supabase db pull` + regen `apps/web/src/lib/database.types.ts`; extend `tests/separation/module-grants.sql` to FAIL if authenticated has UPDATE on `coaches.active_coupon_redemption_id`.

#### Files
- `supabase/migrations/20260620120000_discount_codes.sql`
- `apps/web/src/lib/database.types.ts` (regen)
- `tests/separation/module-grants.sql` (extend)

#### DoD checklist
- [ ] One migration file; idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
- [ ] `discount_type` schema omits `free_period`.
- [ ] `(percent=100 AND forever)` rejected by CHECK.
- [ ] `kind` CHECK includes `tier_upgrade_proration`.
- [ ] `active_coupon_redemption_id` NOT in GRANT allowlist; tx-rollback proves `42501`.
- [ ] `resolve_active_discount` RPC executes for authenticated, returns own snapshot only.
- [ ] Circular FK: `coaches → redemption` = SET NULL; `redemption → coaches` = RESTRICT.
- [ ] `database.types.ts` regenerated; `get_advisors` 0 critical.

#### Edge cases handled
- New `billing_snapshots` cols nullable/defaulted (back-compat with existing inserts).
- Circular FK won't deadlock on coach delete (SET NULL + trigger COALESCE).
- Timestamp > latest migration; replays in order on merge.

#### Risks + mitigations
| Risk | Mitigation |
|---|---|
| Merge re-applies all history | Idempotent DDL, mirror coach_addons header. |
| Gate migrations not yet in prod | Header documents hard dependency; whole stack lands in one gate pass. |
| Code reads new cols before migration | F2 code gated behind launch flag; migration ships first. |

#### Validation gate
tx-rollback `42501` proof + `get_advisors` 0 critical + `module-grants.sql` green + types regenerated.

#### Audit fixes folded — DB security + Supabase optimization (2026-06-20)
> 3 expert auditors (RLS/grants, Postgres-perf, Supabase-advisors). Verdict: **design solid, minor-gaps, 0 blockers.** The HIGH items are folded into tasks 1/8/10/11 above; the rest:
- **REVOKE before GRANT:** for ALL 4 new tables emit `REVOKE ALL ON <t> FROM anon, authenticated;` BEFORE the minimal grants — the project `ALTER DEFAULT PRIVILEGES` grants ALL to `authenticated` on new public tables (mirror `coach_addons`).
- **`coupon_cycle_decrements` is a full table:** ENABLE RLS + REVOKE anon/authenticated + GRANT ALL `service_role` + NO authenticated SELECT (internal idempotency ledger) + FK-covering index on `redemption_id`.
- **Ledger immutability (SERNAC):** add a BEFORE UPDATE/DELETE trigger on `coupon_redemptions` blocking mutation of finalized cols (`coupon_terms_text/version`, amounts, `discount_value_snapshot`) — allow only `status`/`applied_cycles_remaining`/`revoke_effective_at`. (service-role grant alone does NOT make it immutable.)
- **Drop the redundant `(coupon_id, coach_id) WHERE active` index:** non-stackable v1 → `(coach_id) WHERE active` subsumes it. Reintroduce only if `stackable` ships.
- **Autovacuum** on the hot counter: `ALTER TABLE coupon_codes SET (autovacuum_vacuum_scale_factor=0, autovacuum_vacuum_threshold=50, autovacuum_analyze_scale_factor=0.02)` (mirror `20260617170346`; `redeemed_count` HOT-updates every redeem). `coupon_redemptions` stays default (append-only).
- **No GIN** on `applies_to_scope` / `discount_value_snapshot` jsonb in v1 (accessed by PK/code lookup, never by containment) — explicit decision.
- **Lock order (no deadlock):** `coupon_codes` counter `UPDATE...WHERE redeemed_count<max...RETURNING` FIRST → `coupon_redemptions` INSERT → trigger touches `coaches` by single id. Concurrent-last-seat test (F5) also asserts no deadlock.
- **`billing_snapshots.kind` CHECK already includes `tier_upgrade_proration` in prod** (`20260614120000`) — keep the idempotent DROP/ADD as a re-assert, NOT framed as a live gap (F1 task 7 / F4 task 1 prose).
- **Separation suite:** also assert authenticated has NO UPDATE on `billing_snapshots.{discount_clp,base_before_discount_clp,coupon_code,coupon_redemption_id}` (they inherit the table REVOKE).
- **Advisor expectation:** migration adds ZERO new ERROR/critical (gate met). It DOES add 1 expected WARN `authenticated_security_definer` (the RPC, self-scoped to `auth.uid()`) — state in DoD so it's not mistaken for a regression.
- **Invariant note:** `coupon_redemptions.coach_id` references `coaches(id)` = `auth.uid()`; the SELECT-own policy depends on that identity (same as `coach_addons`).

---

### F2a — Pricing engine + base-plan discount (money path)

**Scope:** `target='base'` AND `target='total'` (base + ALL live add-ons). **`target='total'` is the primary mode** — a standing % off the coach's whole bill that persists across module add/remove (re-resolved each renewal). `target='module'` (specific add-on) computes as base-behavior here and is REJECTED at redeem until F2b ships (deferred). No re-migration when F2b lands.

#### Tasks (ordered)
1. Add pure `computeDiscountedClp(input)` to `packages/tiers/index.ts`: `percent | fixed_clp`, target `base | module | total`, clamp `>= 0`, `Math.round` per-item (mirror `getTierPriceClp`/`getAddonCycleAmountClp` rounding so base+addons sum stays exact). Returns `{ netClp, discountClp, baseBeforeDiscountClp }`. Pure, no DB. **Co-located** with tiers (shared with mobile).
2. Define `DiscountSpec` type (`type`, `value`, `target`, `moduleKeys?`, `remainingCycles`) in `apps/web/src/domain/billing/types.ts` (NON-`'use server'` module). Re-export from `apps/web/src/lib/constants.ts` with a plain `export type Foo = ...` alias — **NEVER `export type { X }` without `from`** in any `'use server'` file (memory gotcha → ReferenceError-at-eval → 500 on every coupon action).
3. Refactor `getCompositeAmountClp` in `apps/web/src/services/billing/addons.service.ts`: accept optional `discount?: DiscountSpec` last arg; **overload** so old callers compile unchanged; when spec passed, return `{ totalClp, baseBeforeDiscountClp, discountClp }`; default `undefined` = identical legacy net. Apply discount to base (F2a).
4. Add `apps/web/src/services/billing/discount.service.ts`: `resolveActiveDiscountSpec(db, coachId)` (service-role read via `coaches.active_coupon_redemption_id` → `coupon_redemptions.discount_value_snapshot`; returns `DiscountSpec | null` only when `remainingCycles > 0`). Pure `applyCouponDiscount` re-exported for tests.
5. **Thread spec into EVERY price/snapshot site** (critic: 9+ sites, not 6 — grep `getCompositeAmountClp` AND every inline `baseClp + breakdown.reduce`):
   - `create-preference/route.ts:310` — resolve spec, `getCompositeAmountClp(tier, cycle, billable, spec)`.
   - `webhook/route.ts` recurring branch (~262) — **replace inline `baseClp + breakdown.reduce(...)`** with structured composite + spec.
   - `webhook/route.ts` stale-checkout branch (~753) — same inline-total replacement + spec.
   - `webhook/route.ts` tier-upgrade (~607) — spec into `newComposite`.
   - `webhook/route.ts` reconcile (b) (~1015) — `expectedClp` WITH spec (no false `addon_amount_drift`).
   - `webhook/route.ts` first-charge snapshot (e) (~1099) — spec.
   - `confirm-upgrade/route.ts:184` — spec into `newComposite` + `getTierUpgradeProrationClp` (honor mid-term discount on upgrade).
   - `cron/mp-reconcile/route.ts:203` — **add `active_coupon_redemption_id` to the coach SELECT (~line 112)** (critic: column omitted → spec unresolvable) + resolve + pass spec into `expectedClp`.
   - `subscription-status/route.ts:74` — **resolve via `resolve_active_discount` RPC** (critic blocker: user-scoped client can't join catalog) so on-load price = charged price.
   - `addons/route.ts` `applyFirstChargeToAddons` PUT (~180) — the PUT-that-sets-MP-amount must use the SAME spec as reconcile expected.
   - `addons/route.ts` one-shot proration at add-on ALTA (`getAddonProrationClp`) + `confirm-addon` materialized price — apply the active discount HERE too (`target='total'`: a newly-added module is discounted from day one, including its prorated first charge). The add-on purchase preview/disclosure shows the discounted module price.
6. **`updateCheckoutAmount` idempotency** (critic: verified — it passes NO `X-Idempotency-Key`): extend `mercadopago.ts` `updateCheckoutAmount` with an `idempotencyKey?` arg/overload; coupon-driven PUTs pass `key = hash(coachId|redemptionId|expectedClp)`.
7. **100%-off / MP-floor guard** (critic blocker): in `create-preference` + `confirm-upgrade`, detect `netClp === 0` and **refuse the paid path** (block 100%-for-N-cycles from reaching MP; route via `admin_grant` or special-case skip). Unit-test `netClp > 0` before any MP preapproval call. (DB CHECK already blocks 100%-forever; this guards 100%-for-N-cycles.)
8. **Concurrency: redeem vs upgrade** (critic): redeem rejects `409` if `isUpgradeInFlight`; `confirm-upgrade`/webhook re-resolve active coupon when recomputing `newComposite` so the upgrade PUT preserves the discount.
9. Unit tests: `discount.service.test.ts` + extend `addons.service.test.ts` — net identical at every site, clamp `>= 0`, 100%-off=0 refused-on-paid-path, rounding parity, upgrade-preserves-discount.

#### Files
`packages/tiers/index.ts`, `apps/web/src/domain/billing/types.ts`, `apps/web/src/lib/constants.ts`, `apps/web/src/services/billing/addons.service.ts`, `apps/web/src/services/billing/discount.service.ts`, `apps/web/src/app/api/payments/{create-preference,webhook,confirm-upgrade,addons,subscription-status}/route.ts`, `apps/web/src/app/api/cron/mp-reconcile/route.ts`, `apps/web/src/lib/payments/providers/mercadopago.ts`, `apps/web/src/services/billing/discount.service.test.ts`.

#### DoD checklist
- [ ] `computeDiscountedClp` pure + tested (matrix type×target×cycle, clamp, 0%, 100%).
- [ ] `getCompositeAmountClp` overload returns structured object; legacy callers unchanged.
- [ ] All 10 enumerated sites route through spec; NO inline `baseClp + reduce` survives.
- [ ] cron coach SELECT includes `active_coupon_redemption_id`.
- [ ] `subscription-status` resolves via RPC (not user-scoped catalog join).
- [ ] `updateCheckoutAmount` accepts idempotency key; coupon PUTs pass it.
- [ ] `netClp === 0` refuses paid path; unit test asserts.

#### Edge cases handled
- `target=module` with no live add-on → discount 0 (no-op), not negative.
- Displayed price = charged price (RPC, not client math, not catalog join).
- Upgrade mid-term honors discount.

#### Risks + mitigations
| Risk | Mitigation |
|---|---|
| One of the 9+ sites missed → silent drift | Grep enumeration + parity test per site (F5). |
| Discount in pure fn breaks purity | Resolve `DiscountSpec` at call site, pass as arg (mirrors `billableAddons`). |
| Non-idempotent PUT double-applies | `X-Idempotency-Key` on coupon PUT path. |

#### Validation gate
`pnpm typecheck`; `npx vitest run` discount + addons tests; drift-equality unit test (checkout `transaction_amount` == webhook `expectedClp` == cron `expectedClp` for a discounted coach) green.

---

### F2b — Per-module discount (target = module)

**Scope:** per-MODULE-SPECIFIC targeting (`target='module'` — discount ONE specific add-on, e.g. "50% off only the nutrition module"). **DEFERRED post-v1 (CEO decision 2026-06-20):** the common "X% off the coach's whole bill incl. modules" case is `target='total'` (handled in F2a), so module-specific targeting is not needed for current deals. Schema (`fixed_clp_target='module'`) stays reserved; `target='module'` codes are rejected at redeem until F2b ships.

#### Tasks
1. In `computeDiscountedClp` + `getCompositeAmountClp`, apply `fixed_clp`/`percent` to the targeted module's add-on cycle amount only (use `getAddonCycleAmountClp` per module), clamp `>= 0` to that component.
2. **Server preview returns `discountClp=0` + `ineligible/no-op` code** when the targeted module is not a live add-on for the coach (critic: silent no-op). Block redeem (don't write a redemption that discounts nothing).
3. Gate module-target codes behind F2b enforcement, not just schema presence (a module-scoped code minted during F2a must NOT apply as base behavior — reject at redeem until F2b is live).
4. Extend tests: per-module target matrix; no-op rejection; module+base composition.

#### Files
`packages/tiers/index.ts`, `apps/web/src/services/billing/addons.service.ts`, `apps/web/src/services/billing/coupons.service.ts`, `apps/web/src/services/billing/discount.service.test.ts`.

#### DoD checklist
- [ ] Module-target discount applies only to owned module add-on.
- [ ] Unowned-module target → `ineligible`, redeem blocked.
- [ ] F2a-minted module codes rejected until F2b live.

#### Edge cases handled
- `fixed_clp > module price` → clamp to 0 on that component, total never negative.

#### Validation gate
Per-module vitest matrix green; no-op rejection asserted.

---

### F3 — Redeem flow, abuse controls, RLS isolation (security/backend)

#### Tasks
1. `apps/web/src/services/billing/coupons.normalize.ts` (pure): `normalizeCouponCode()` (uppercase+trim+strip whitespace/dashes) and `normalizeEmailForFirstTime()` (lowercase, strip dots/`+alias` for gmail). Unit tests.
2. `apps/web/src/infrastructure/db/coupon-redemptions.repository.ts` (service-role): atomic insert (map `23505` → `ALREADY_REDEEMED`), `countRedemptionsForAccount`, `existsForNormalizedEmail`. **Add coupon READ methods** (critic: repository boundary) so `_data` never SELECTs catalog tables directly.
3. **Atomic global cap** (critic TOCTOU): `redeemCoupon()` in `apps/web/src/services/billing/coupons.service.ts` enforces global cap via `UPDATE coupon_codes SET redeemed_count = redeemed_count + 1 WHERE id = $1 AND (max_redemptions IS NULL OR redeemed_count < max_redemptions) RETURNING` (fail if 0 rows) **in the same tx** as the redemption insert. Never count-then-insert. Per-account + first_time_only enforced by the DB partial unique indexes from F1.
4. `rateLimitCouponRedeem()` in `apps/web/src/lib/rate-limit.ts`: Upstash `slidingWindow(10,'1h')` per coach + `(5,'1h')` per IP, **fail-CLOSED** (mirror `rateLimitCardChange` exactly: missing limiter → `{ok:false}`). Both keys enforced.
5. POST `apps/web/src/app/api/payments/redeem-coupon/route.ts`: `getUser` → rateLimit (coach+IP) → **server-side fail-closed launch gate** (see F6/rollback) → service-role redeem → write audit row. Returns **priced preview only** (no money committed). **Redeem only writes the redemption + sets `active_coupon_redemption_id`; it does NOT PUT MP** (critic: redeem↔PUT not atomic; discount applies at next preapproval recompute in create-preference/upgrade).
6. **Refund/chargeback cleanup** (critic): in the webhook refund/chargeback + terminal-expire branches, set live redemption `status='reverted'` + null `active_coupon_redemption_id` via trigger, so a reactivated coach starts clean.
7. RLS isolation suite `tests/separation/coupon-rls.sql` (mirror `module-grants.sql`): BEGIN/ROLLBACK, `SET LOCAL ROLE authenticated` + `jwt.claims`, assert `42501` on self-grant, on `active_coupon_redemption_id` PATCH, on cross-coach redemption read; expect `ALL COUPON RLS TESTS PASSED`.

#### Files
`apps/web/src/services/billing/coupons.{service,normalize}.ts`, `apps/web/src/infrastructure/db/coupon-redemptions.repository.ts`, `apps/web/src/lib/rate-limit.ts`, `apps/web/src/app/api/payments/redeem-coupon/route.ts`, `tests/separation/coupon-rls.sql`.

#### DoD checklist
- [ ] Global cap atomic (UPDATE...WHERE...RETURNING), never count-then-insert.
- [ ] Per-account + first_time_only enforced by DB indexes, not app code.
- [ ] Rate-limit fail-CLOSED on both keys; unit test asserts.
- [ ] Redeem writes redemption only; no MP PUT.
- [ ] `coupon-rls.sql` passes (42501 on all write/cross-read attempts).

#### Edge cases handled
- Concurrent double-redeem (same coach) → unique idx `23505` → `ALREADY_REDEEMED`, not 500.
- Concurrent last-seat global cap → atomic UPDATE, exactly-once.
- Gmail dot/`+alias` first_time bypass → normalize + persisted `normalized_email` + partial unique idx.
- Redis down → 429 (abuse endpoint), never unbounded.

#### Risks + mitigations
| Risk | Mitigation |
|---|---|
| TOCTOU on global cap | Atomic counter UPDATE in same tx. |
| Coach self-grants via PATCH | No UPDATE grant on col; `coupon-rls.sql` asserts 42501. |
| Catalog read leak | No authenticated SELECT on coupons/coupon_codes; preview via service-role route. |

#### Validation gate
`coupon-rls.sql` green; normalize + concurrent-redeem unit/integration tests green.

---

### F4 — Webhook, snapshots, cycle lifecycle, reporting (backend billing)

#### Tasks
1. **Snapshot semantics redefined** (critic high): `insertBillingSnapshot` in `apps/web/src/services/billing/addon-webhook.service.ts` — `total_clp` = honored (DISCOUNTED) charged amount; `base_before_discount_clp` = list; `discount_clp` = delta; `coupon_code` + `coupon_redemption_id` set. Persist at EVERY call site (recurring/stale/first-charge/one-shot/tier-upgrade). Idempotent on `provider_payment_id`. **The input `kind` type widened to include `'tier_upgrade_proration'`** (matches F1 CHECK fix).
2. **Snapshot upsert carries discount on first write** (critic: `ignoreDuplicates:true` → second discounted write is a no-op). Ensure whichever path writes first already carries discount cols, OR change to upsert-update of discount fields on conflict. Test: any discounted charge's snapshot always carries discount cols.
3. **Cycle decrement idempotency** (critic blocker — recurring charge runs in `isRecurringAuthorizedPayment` AND stale-checkout fallback AND redelivery): `decrementCouponCycle` keyed on `provider_payment_id` via the `coupon_cycle_decrements` UNIQUE companion row (mirror `markFirstCharged` WHERE-IS-NULL). Decrement EXACTLY once per distinct payment. When `applied_cycles_remaining` hits 0 → next recompute uses no-spec full price; `restoreOnExpiry` clears active pointer for non-repeating.
4. **Test-mode sync path** (critic blocker — MP test mode sends NO webhooks): extend `confirm-subscription/route.ts` to synchronously insert `billing_snapshots` (with discount cols) AND mark the redemption, mirroring `confirm-addon` materialization. Idempotent with the webhook by `provider_payment_id` + redemption unique idx. (Note: `confirm-subscription` does NOT call `getCompositeAmountClp` today — it gains the snapshot+redemption write, computing the honored amount via the resolved spec.)
5. **Reconcile drift** (critic): `reconcilePreapprovalAmount` in webhook + cron `expectedClp` include the active discount (done in F2a); add `coupon_amount_drift` reconcile log on snapshot/charge mismatch.
6. **Mid-term honor on revoke vs PUT** (critic high): revoke sets `revoke_effective_at = current_period_end`; pricing keeps honoring the discount until that boundary (`remainingCycles` read from the redemption snapshot, not the post-revoke pointer). Revoke NEVER triggers a PUT; any PUT reads `remainingCycles > 0` from the snapshot. Reconcile `expected` honors discount until the boundary → no false drift, no mid-cycle price hike.
7. **Email-before-revert / pre-increase** (critic high — webhook is SPOF + MP test sends no webhooks + EVA can't gate MP's recurring charge): fire the heads-up from the **cron pre-check** (scan redemptions with `applied_cycles_remaining == 1` and `current_period_end` within N days) AND at revoke time. New Resend template in `apps/web/src/lib/email/`. Persist `notice_sent_at`. Document: "before next renewal" = `>= 1` discounted cycle lead, since EVA cannot hold MP's charge. If notice not sent, keep the discount one more cycle rather than silently raise price.
8. **Reporting — single revenue source** (critic high, both reporting critics): MRR = sum `billing_snapshots.total_clp` (net) in `apps/web/src/app/admin/(panel)/finanzas/_data/finanzas.queries.ts`; keep the 3 list-price MRR RPCs ONLY for plan-mix. **Do NOT subtract discount in two places.** Keep `@evatest.cl`/`juanmvr2706` exclusion via `getTestCoachIds` in the snapshot query.

#### Files
`apps/web/src/services/billing/{addon-webhook.service.ts,coupon.service.ts}`, `apps/web/src/app/api/payments/{webhook,confirm-subscription}/route.ts`, `apps/web/src/app/api/cron/mp-reconcile/route.ts`, `apps/web/src/app/admin/(panel)/finanzas/_data/finanzas.queries.ts`, `apps/web/src/lib/email/`, `apps/web/src/lib/test-accounts.ts`.

#### DoD checklist
- [ ] `total_clp` = honored discounted amount at ALL snapshot sites; discount cols always populated when discounted.
- [ ] `kind` type/CHECK includes `tier_upgrade_proration`; all kinds insert-tested.
- [ ] Cycle decrement exactly-once per `provider_payment_id` (companion unique row).
- [ ] `confirm-subscription` writes snapshot + redemption synchronously (test-mode).
- [ ] Revoke honors discount until `current_period_end`; never PUTs; never raises mid-term.
- [ ] Pre-increase email fires from cron pre-check; `notice_sent_at` persisted.
- [ ] MRR sourced from `billing_snapshots.total_clp` only; test accounts excluded.

#### Edge cases handled
- 100%-off → routed via admin_grant / refused on paid path (no `transaction_amount=0`).
- Webhook redelivery → no double-decrement.
- Refund/chargeback → redemption reverted, pointer nulled.
- Snapshot redelivery idempotent; discount evidence never lost.

#### Risks + mitigations
| Risk | Mitigation |
|---|---|
| Discount dropped on renewal | Single chokepoint + recurring-path parity test. |
| Evidence gap on test-mode | Sync snapshot+redemption in confirm-subscription. |
| MRR ignores discounts | Net via snapshots, single source. |
| Pre-increase email missed (Resend down) | Keep discount one more cycle; gate/log if increase without notice row. |

#### Validation gate
Webhook + reconcile + cron integration tests; redelivery double-decrement test; snapshot-carries-discount test; MRR net-source test. MP sandbox manual matrix (Simulador de Notificaciones — test mode sends no webhooks) for the sync confirm path.

---

### F5 — Admin mint UI + Coach redeem/disclosure UI + QA gate

#### Tasks — CEO admin (`/admin/(panel)/codigos`)
1. `packages/schemas/coupon.ts`: `CreateCouponAdminSchema` + `RevokeRedemptionSchema` (`percent | fixed_clp`, `fixed_clp_target`, scope tiers+module_keys, duration cycles). Export from `packages/schemas/index.ts`. Use `z.guid()` (not `z.uuid()`) for any id that can reference seed rows (memory). **Code format = BOTH (CEO decision 2026-06-20):** schema has optional `code_display` (vanity, e.g. `PARTNER50`, validated normalized-unique); when omitted, server autogenerates a high-entropy random code (8-10 chars, unambiguous alphabet). Add `generateCouponCode()` (mirror `generateUniqueInviteCode` retry-on-collision) in `coupons.normalize.ts`.
2. `codigos/_actions/coupon-form.ts` — **NO `'use server'`** (pure builder, mirror `module-form.ts`): `buildCouponInsert` + `readScope`. + `coupon-form.test.ts`. (Critic memory gotcha: pure builder, no type re-export-without-`from`.)
3. `codigos/_data/codigos.queries.ts`: `getCouponsForAdmin()` + `getCouponRedemptions(couponId)` via `createServiceRoleClient`, specific cols, `Promise.all` counts (mirror `teams.queries.ts`).
4. `codigos/_actions/codigos.actions.ts` (`'use server'`, async-only): `mintCouponAction` (`assertAdmin`, Zod, insert coupons+coupon_codes, `logAdminAction 'coupon.mint'`, `revalidatePath`), `revokeRedemptionAction` (future-only: set `revoke_effective_at`, mark redemption; **NEVER raise price, never touch a price field**). Mint guard rejects `(percent=100 AND forever)` pointing to admin_grant.
5. `codigos/page.tsx` RSC + `_components/{CodigosTable,CouponMintSheet,RedemptionsDrawer}.tsx`. **CouponMintSheet code field = vanity text input + "Autogenerar" toggle** (empty/toggle → server random; typed → vanity, live uniqueness check). For `discount_type`/`fixed_clp_target`/`duration` use native `<select>`/radio (TeamCreateSheet pattern), NOT raw Base UI Select (memory: renders value not label). If Tabs used, style active on `[data-active]` not `[data-state=active]` (memory). Reuse `CredentialRow`/`AdminEmptyState`.
6. `AdminSidebar.tsx`: add `{href:'/admin/codigos', label:'Códigos', icon: Ticket}` to `NAV_PLATAFORMA` + `NAV_MOBILE`.

#### Tasks — Coach redeem + SERNAC disclosure (`/coach/subscription`)
7. `CouponDisclosureModal`: blocking `role=dialog aria-modal`, `max-h-[90dvh] overflow-y-auto pb-safe`, Escape close, focus restore, **real focus trap** (critic: existing modals lack one — cycle Tab/Shift+Tab within dialog), autofocus confirm. **Consent = the Confirmar button itself** (NO checkbox, NO pre-checked box — critic). All APPROVED copy in normal flow (no scroll-hidden text). "de por vida" variant omits the revert line.
8. `getCouponDisclosureText(redemption, serverPrices)` — pure formatter near constants/tiers; interpolates `{CODIGO}{DESCUENTO}{PRECIO_CON_DESCUENTO}{PRECIO_NORMAL}{DURACION}` **ONLY from server amounts** (critic: never client `selectedComposite`). Persist full interpolated text into `coupon_redemptions.coupon_terms_text` at redeem.
9. `CouponRedeemCard` in `coach/subscription/page.tsx`: code input + Aplicar/Quitar, `h-11 min-h-[44px]`, dark mode. Calls POST `/api/payments/redeem-coupon` (server preview). Wrap redeem/revoke in `useTransition`; `aria-busy` + `role=status` live region while checking. Per-state UI from `redeemStatus` (idle|checking|valid|invalid|expired|used|ineligible|applied). After redeem `refreshStatus()` (existing pattern; NO `revalidatePath` for this client page).
10. Discount line in breakdown blocks rendered **only from server billing payload** (critic blocker: "Cambiar plan" total is client-computed today → server-price the selected tier+cycle preview, never `selectedComposite`).
11. Extend `subscription-status/route.ts` response with `billing.baseBeforeDiscountClp/discountClp/couponCode` + `activeCoupon{code,durationLabel,revertsToClp}` (via `resolve_active_discount` RPC). **Ship in the SAME change as the UI** (critic: else input shows over an applied coupon). Default-hide input until billing payload loaded.
12. Gate `CouponRedeemCard` behind `hasActivePaidPlan && SELF_SERVICE_ADDONS_ENABLED` (critic: hide for free/managed; show "muy pronto" notice when flag OFF). Non-stackable: if `activeCoupon` present hide input, show chip+Quitar.
13. **Stale preview invalidation** (critic): on `selectedTier`/`selectedCycle` change, invalidate cached preview, re-run preview before opening modal; re-price server-side at confirm, reject stale (`AMOUNT_OUTDATED`).
14. **Code-at-register — IN v1 (CEO decision 2026-06-20).** `register.actions.ts` accepts an optional `codigo`. Ordering that resolves the critic's concern (new coach has no row/redemption at first preapproval; auto-apply must NOT skip consent): (a) create the coach row first; (b) validate the code server-side (eligibility, global cap, `first_time_only` — natural fit for new-coach promos); (c) render `CouponDisclosureModal` with SERVER-computed prices BEFORE the first checkout (consent at register, same copy + `coupon_terms_text` evidence as `/coach/subscription`); (d) on confirm, atomically write the redemption + set `active_coupon_redemption_id`, then the first `create-preference` resolves the discount (already threaded in F2a) so the FIRST charge is discounted. Reuse the same `redeem-coupon` service path + disclosure component; never trust a client price. Add `data-testid` `register-coupon-input`. (Powers the "20% a X coaches nuevos" acquisition deal.)
15. `data-testid` hooks: `coupon-input`, `coupon-discount-line`, `coupon-disclosure-modal`, `coupon-confirm`.

#### Tasks — QA gate
16. `computeDiscountedClp.test.ts` matrix (type × duration × target × cycle; edges 100%-off, fixed>base clamp, cycles-exhausted, 0% no-op).
17. Drift-equality integration test: checkout `transaction_amount` == webhook `expectedClp` == cron `expectedClp` WITH coupon; assert NO `addon_amount_drift` row.
18. Cycle-expiry restore + revoke future-only tests (current cycle unchanged, next full).
19. Concurrent last-seat redeem test (exactly-once).
20. E2E `coupon-redeem.spec.ts` (coach) + CEO mint/revoke spec (`assertAdmin` gate; non-admin 403).
21. **Launch-flag fail-closed test**: assert OFF default (mirror exact-`'true'` pattern).

#### Files
`packages/schemas/coupon.ts`, `packages/schemas/index.ts`, `apps/web/src/app/admin/(panel)/codigos/**`, `apps/web/src/app/admin/(panel)/AdminSidebar.tsx`, `apps/web/src/app/coach/subscription/page.tsx`, `apps/web/src/app/api/payments/subscription-status/route.ts`, `apps/web/src/lib/constants.ts`, test files under `apps/web/src/...` + `tests/billing/`, `tests/separation/coupon-rls.sql`.

#### DoD checklist
- [ ] Mint: pure builder (no `'use server'`), `assertAdmin` + audit, `(percent=100 AND forever)` rejected.
- [ ] Disclosure modal: focus trap, blocking, server-priced, no checkbox/pre-check, dvh-capped, confirm reachable, "de por vida" omits revert.
- [ ] All coach-facing prices from server payload; no client math.
- [ ] `subscription-status` activeCoupon fields ship with the UI; input default-hidden until loaded.
- [ ] Redeem/revoke in `useTransition`, `aria-busy` + live region, `h-11 min-h-[44px]`.
- [ ] Launch flag fail-closed; OFF-default test passes.
- [ ] E2E + RLS + drift-equality + concurrent-redeem gates green.

#### Edge cases handled
- Cap fills between preview and confirm → 409 `used`, refreshStatus, no price change.
- tier/cycle changed between preview and confirm → re-price server-side, reject stale.
- Lifetime coupon → revert line omitted.
- Module-scoped (F2b) while tier lacks module → ineligible, no Aplicar.
- Empty/whitespace code → Aplicar disabled, normalize before POST.
- Flag OFF / no active paid plan / managed → card hidden, "muy pronto" notice.

#### Risks + mitigations
| Risk | Mitigation |
|---|---|
| Client computes discount → SERNAC drift | All amounts from server payload/preview. |
| Scroll-hidden disclosure fails SERNAC | dvh-capped, copy in flow, confirm below not scroll-gated. |
| Tab escapes dialog | Real focus trap. |
| `'use server'` type re-export 500 | Pure builder; types in domain/schemas; only async exports in actions. |

#### Validation gate
`pnpm typecheck` + `pnpm lint`; full vitest; `coupon-rls.sql`; E2E coupon-redeem + mint/revoke; drift-equality + concurrent-redeem; MP sandbox manual matrix (with OK from user per testing rules). Gate Playwright/SQL against Supabase only at plan close, with explicit authorization.

---

## 4. Nothing-Slips Checklist (consolidated from critics)

### Money-safety
- [ ] No MP `transaction_amount <= 0`: 100%-forever via admin_grant (DB CHECK); 100%-for-N-cycles refused on paid path (`netClp === 0` guard) before any preapproval call.
- [ ] `fixed_clp > base/module` clamped to component, total never negative.
- [ ] Discount applied at MP source (`updateCheckoutAmount`/`createCheckout`), with `X-Idempotency-Key` on coupon PUTs.
- [ ] Redeem commits no money; discount applies at next preapproval recompute (redeem↔PUT not in one tx).
- [ ] Redeem rejects 409 during upgrade-in-flight; upgrade preserves discount.

### Drift
- [ ] ALL 9+ `getCompositeAmountClp` sites + every inline `baseClp + reduce` route through the discount-aware composite.
- [ ] Discount re-resolved server-side from `coaches.active_coupon_redemption_id` (never `external_reference`, never client).
- [ ] cron coach SELECT includes `active_coupon_redemption_id`; cron `expectedClp` matches PUT net.
- [ ] Drift-equality test (checkout == webhook == cron) per discounted coach; `coupon_amount_drift` log on mismatch.
- [ ] Snapshot `total_clp` = honored discounted amount (not list); discount cols always populated when discounted.
- [ ] Cycle decrement exactly-once per `provider_payment_id` (companion unique row); no double/zero decrement across recurring + stale + redelivery branches.

### RLS / grants
- [ ] `coupons`/`coupon_codes` no authenticated SELECT; `coupon_redemptions` SELECT-own.
- [ ] `coaches.active_coupon_redemption_id` NOT in GRANT allowlist; tx-rollback proves `42501` on self-PATCH.
- [ ] `module-grants.sql` extended to FAIL on authenticated UPDATE of that column; `coupon-rls.sql` green.
- [ ] Coach read via `resolve_active_discount` RPC, not catalog join.
- [ ] `_data` admin queries via service-role; repository boundary preserved (no `_data` → Supabase catalog).

### SERNAC (Ley 19.496)
- [ ] Blocking disclosure modal, server-priced, focus-trapped, no checkbox/pre-check, copy in flow, confirm reachable.
- [ ] Disclosed price == charged price (single server computation).
- [ ] Per-charge snapshot evidence (base/discount/coupon_code/redemption_id) at every kind; idempotent, discount-carrying on first write.
- [ ] Consent evidence (`coupon_terms_version` + full `coupon_terms_text`) persisted on redemption.
- [ ] Revert future-only: honored until `current_period_end`; never PUTs higher mid-cycle.
- [ ] Pre-increase email `>= 1` cycle lead from cron pre-check; `notice_sent_at` persisted; keep discount one more cycle if not sent.
- [ ] "de por vida" variant omits revert line; ZERO IVA/impuesto wording (lint copy).
- [ ] Charge without matching consent row/snapshot → reconcile flags `coupon_amount_drift`.

### Migration
- [ ] Single `20260620120000_discount_codes.sql`; idempotent; forward-only; timestamp after `20260619140000`.
- [ ] Gate migrations `20260612140000` + `20260612150000` in prod first (documented dependency).
- [ ] `billing_snapshots` new cols nullable/defaulted; `kind` CHECK widened to `tier_upgrade_proration`.
- [ ] Circular FK: `coaches → redemption` ON DELETE SET NULL; `redemption → coaches` RESTRICT; redemption table created before coaches ALTER.
- [ ] Validated additive-in-LIVE (snapshot + tx-rollback + `get_advisors` 0 critical); `database.types.ts` regenerated before wiring queries.

### Reporting
- [ ] MRR = single source `billing_snapshots.total_clp` (net); list-price RPCs only for plan-mix; no double discount subtraction.
- [ ] `@evatest.cl`/`juanmvr2706` exclusion kept in snapshot query.

### Mobile / apps PostgREST
- [ ] New `coaches`/`billing_snapshots` cols service-role-write only — no `authenticated` GRANT needed; `apps/mobile`/`apps/enterprise` (direct PostgREST) unaffected.
- [ ] `computeDiscountedClp` in `packages/tiers` (shared, pure) so mobile pricing stays consistent.

### Rollback
- [ ] Server-side fail-closed money gate (`=== 'true'`) on redeem + create-preference coupon branch.
- [ ] Refund/chargeback/terminal-expire clears active redemption + nulls pointer.

---

## 5. Open Items — require CEO/Legal decision before the named phase

| # | Phase | Item | Default if undecided |
|---|---|---|---|
| O1 | F2a/F4 | **100%-off-for-N-cycles behavior on the paid path.** MP rejects `transaction_amount <= 0`. Options: (a) block this combo from the percent engine entirely (only admin_grant), (b) clamp net to a 1-CLP floor with documented SERNAC copy, (c) suspend/skip the charge for discounted cycles. **Blocks shipping the percent engine.** | (a) block — simplest, no MP-floor copy needed. |
| O2 | F4 / Legal | **Minimum lead time** for the pre-increase/revert email before next renewal to satisfy SERNAC (suggest `>= 1` renewal cycle / `>= 10` days). | `>= 1` discounted cycle lead. |
| O3 | F5 / Legal | **Disclosure version must be non-DRAFT + JP (rep SII)-signed** before flipping the prod money gate. Confirm sign-off. | Gate money path on non-DRAFT version. |
| O4 | F4 / Legal | **Is MRR list-price or net-of-discount?** (decision taken: net via snapshots for revenue; list-RPC for plan-mix) — confirm with CEO before finanzas change ships. | Net via snapshots. |
| O5 | F3 | **`per_account_limit` key** — `coach_id` (subscription) vs auth-account identity across multiple subscriptions over time. | `coach_id` for v1. |
| O6 | F5 | **Code-at-register** — defer to post-payment redeem (with disclosure) vs atomic redemption inside the register tx. | Defer to v1.1 post-payment redeem. |
| O7 | F1 | **Confirm migration timestamp slot** `20260620120000` is free + after `20260619140000` and not inside any reserved gate-window. | Use `20260620120000`. |
| O8 | F2a / Finance | **Coupon × cycle-discount stacking + margin floor.** A 20% code on an annual plan compounds to **36% off** (0.8×0.8); 50%+annual = **60%**. | ✅ **RESOLVED (CEO 2026-06-20): COMPOUND** on the already-cycle-discounted composite + a configurable **margin floor** (net never below floor). `computeDiscountedClp` (F2a) applies the code % to the post-cycle-discount composite, then clamps to the floor; the floor is a config constant in `packages/tiers`. Add a unit test: 50%+annual clamps at the floor. |
| O9 | F4 / Legal | **IVA / boleta of a discounted recurring charge** when the SpA invoices — what the boleta shows (net? IVA on net?). `billing_snapshots` (base/discount/total) maps to it. Tie to O3 legal sign-off. | Define with Legal before flipping the money gate. |

---

## 6. Rollback / Flag Strategy

### Launch flag (server-side, fail-closed)
- **New server-side gate** on the money path, separate from any `NEXT_PUBLIC_` client flag: exact `=== 'true'` check (mirror `NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED` pattern) in `POST /api/payments/redeem-coupon` AND the coupon branch of `create-preference`. **Default OFF in prod; Preview = `'true'` for QA.** Build-time inlined for the client flag (flip needs redeploy); the server gate reads `process.env` at runtime.
- A `CouponRedeemCard` is additionally gated behind `hasActivePaidPlan && SELF_SERVICE_ADDONS_ENABLED`; flag OFF → "muy pronto" notice, no input.
- Flag-OFF test asserts the money path is closed by default.

### Deploy ordering
1. F1 migration lands (additive-in-LIVE, validated) + `database.types.ts` regenerated and committed.
2. F2a/F2b/F3/F4 code deploys with the money gate **OFF** in prod (Preview ON for QA).
3. After E2E + RLS + drift-equality + MP-sandbox gates pass and Legal sign-off (O3), flip the prod gate to `'true'` (redeploy — `NEXT_PUBLIC` build-time inline).

### Reversal (seconds → minutes)
- **Money path:** flip server gate env var to anything but `'true'` + redeploy (fail-closed). New redemptions blocked; existing honored mid-term (SERNAC).
- **Per-coupon:** set `coupon_codes.active = false` (service-role) — stops new redemptions immediately, no deploy.
- **Per-redemption:** `revokeRedemptionAction` (future-only) — stops future re-application at `current_period_end`, never raises the honored price.
- **Schema:** migration is additive/forward-only; nullable cols + trigger COALESCE mean a code rollback leaves the DB inert (no active redemptions → no discount applied). Do NOT drop columns (forward-only).
- **Refund/chargeback:** webhook auto-reverts the active redemption + nulls the pointer so a reactivated coach starts clean.

---

## 7. Business audit — startup roles (2026-06-20)

> 5 lenses (PM/Growth, Finance, Sales/CSM, Data, Support). Engineering/security/legal covered in §1-§6. Verdict: feature is commercially sound; these are BUSINESS additions, not blockers — **except O8 (stacking/floor), which needs a CEO decision.**

**PM / Growth**
- Codes are **CEO-minted only** (not public/self-serve) → low risk of training discount-seeking or anchoring price low. Keep it that way.
- Default duration = **time-boxed (N cycles)**; reserve `forever` for strategic partners (mint UI defaults to finite + confirms on `forever`).
- **Mint guardrails:** soft cap on discount % (confirm above ~50%), default `expires_at`, default `max_redemptions`.
- Referral / winback / reactivation = future use-cases the generic-code + `restricted_to_coach_id` schema already supports.

**Finance / unit-economics**
- 🔴 **O8 stacking + margin floor** (see Open Items): a code compounds on the cycle discount today (20%+annual = 36%). Decide compound-vs-list + a max-effective-discount floor so net never drops below cost.
- **Discount-cost reporting:** beyond MRR-net, report margin given away (Σ `discount_clp`) + effective ARPU per cohort.
- 🔴 **O9 IVA/boleta** of discounted charges when the SpA invoices.

**Sales / CSM**
- **Leak control:** for partner / high-value codes use **`restricted_to_coach_id`** (schema already has it) and/or low `max_redemptions` — bind a "50% partner" code to one coach so a leak is useless. Make this the **default for high-value mints**.
- Winback: hand a time-boxed code at churn (use-case, no new build).

**Data / Analytics**
- 🟡 The `coupon_redemptions` ledger HAS the data, but the plan only reports MRR-net. Add **`/admin/codigos` metrics**: redemptions per code, register-conversion, discounted-vs-non cohort retention, total discount cost. Mostly queries — measurable from day 1 without re-migration (confirm `redeemed_at`/`source_ip`/`discount` captured — they are).

**Support / Ops**
- 🟡 **Per-coach discount visibility:** #1 ticket = "why did my price go up?" — CS needs to SEE a coach's active discount + history on **`/admin/coaches/[id]`** (not only per-code). Add it. Pre-increase email + disclosure already cut the volume.
- Leaked-code (`active=false`) + dispute/chargeback (webhook reverts) responses already covered.

**Must-add to plan/spec:** mint guardrails (PM) · O8 stacking+floor decision · O9 IVA-boleta · `restricted_to_coach_id` default for high-value (Sales) · coupon analytics on `/admin/codigos` (Data) · per-coach discount view for CS (Support).
