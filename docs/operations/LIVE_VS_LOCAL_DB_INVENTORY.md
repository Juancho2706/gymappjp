# LIVE (prod) vs LOCAL (branch) DB Inventory

Read-only inventory comparing the **LIVE production Supabase DB** (`jikjeokundmaafuytdcx`) against the **LOCAL branch schema** (`00000000000001_baseline.sql` + enterprise migrations `20260517120000` … `20260602000000`).

- **Generated:** 2026-06-07
- **Method:** PROD = Supabase MCP `list_tables` + read-only `SELECT` (`pg_class`, `pg_policies`, `pg_proc`, `information_schema.columns`, `storage.buckets`, `supabase_migrations.schema_migrations`). LOCAL = migration files in `supabase/migrations/`.
- **No DDL / INSERT / UPDATE / DELETE was run. Nothing was written to prod.**

> ⚠️ **Headline finding:** Prod's `supabase_migrations.schema_migrations` table proves that **none of the enterprise migrations (`20260517*` … `20260602*`) have ever been applied to prod**. The prod migration ledger jumps from `20260515222039` straight to the exercises series `20260528014920`. Confirmed structurally: `to_regclass('public.organizations')` etc. all return `NULL`, and `clients.org_id` / `coaches.invite_code` / `check_ins.reviewed_at` / `workout_programs.org_id` do **not** exist in prod. The merge therefore introduces the **entire enterprise layer at once**: 16 new tables + columns on ~7 shared tables + a large RLS rewrite.
>
> The **exercises** custom-exercise series (`exercises_add_columns_safe`, `exercises_enable_rls`, `client_imports_table`, `exercises_add_image_url`, `exercise_media_bucket` + two prod-only hotfixes) **was** applied to prod (May 28). So `exercises.{deleted_at,source,image_url}`, exercises RLS, the `client_imports` table, and the `exercise-media` bucket already exist live.

---

## 0. Migration application status (prod ledger vs local files)

| Migration series | In local files | In prod `schema_migrations` | Status |
|---|---|---|---|
| Baseline standalone (pre-`20260517`) | squashed into `00000000000001_baseline.sql` | individually listed up to `20260515222039` | Applied (standalone schema = prod) |
| `20260517120000_security_fixes` | yes | **NO** | **Local-only — NOT in prod** (see §3) |
| Enterprise `2026051713000x` … `20260524*` … `20260602*` | yes (≈45 files) | **NO** | **Local-only — the merge** |
| `20260518000000_push_tokens` | yes | **NO** | **Local-only** (table absent in prod) |
| `exercises_add_columns_safe` (`20260528014920`) | `20260527120000_*` | **yes** | Applied to prod |
| `exercises_enable_rls` (`20260528014933`) | `20260527120100_*` | **yes** | Applied to prod |
| `client_imports_table` (`20260528014944`) | `20260527120200_*` | **yes** | Applied to prod |
| `exercises_add_image_url` (`20260528024335`) | `20260527130000_*` | **yes** | Applied to prod |
| `exercise_media_bucket` (`20260528024346`) | `20260527130100_*` | **yes** | Applied to prod |
| `fix_exercises_rls_overly_permissive_policies` (`20260528223023`) | — (closest: `20260530100000_exercises_drop_conflicting_policies`) | **yes (prod only)** | Prod-only hotfix; local equivalent has a different filename/timestamp |
| `fix_exercise_media_bucket_gif_size_limit` (`20260528230731`) | — | **yes (prod only)** | Prod-only hotfix, no matching local file |

> Two prod migrations (`fix_exercises_rls_overly_permissive_policies`, `fix_exercise_media_bucket_gif_size_limit`) have **no exact local counterpart by name**. The local branch covers exercises RLS via `20260530100000_exercises_drop_conflicting_policies.sql`. Reconcile these before merge so the migration ledger lines up.

---

## 1. Table inventory matrix

Row counts are exact `count(*)` from prod (taken 2026-06-07). "RLS local" reflects the final state after all local migrations.

### 1a. Standalone tables — present in BOTH prod and local (no structural delta unless noted)

| table | in PROD? | rows in prod | in LOCAL? | RLS prod | RLS local | delta the merge introduces |
|---|---|---|---|---|---|---|
| admin_audit_logs | ✅ | 51 | ✅ | on | on | none |
| beta_invite_registrations | ✅ | (~0) | ✅ | on | on | none |
| check_ins | ✅ | **99** | ✅ | on | on | **+`reviewed_at`, +`reviewed_by` cols; RLS leak fixed (see §2,§3)** |
| client_food_preferences | ✅ | 40 | ✅ | on | on | none |
| client_intake | ✅ | 27 | ✅ | on | on | none |
| client_payments | ✅ | 43 | ✅ | on | on | RLS rewritten to workspace-aware (§3) |
| clients | ✅ | **60** | ✅ | on | on | **+`org_id`, +`age_confirmed_at`; `coach_id` made NULLable; unique(org_id,email); RLS rewritten (§2,§3)** |
| coach_email_drip_events | ✅ | 50 | ✅ | on | on | none |
| coach_onboarding_events | ✅ | 3907 | ✅ | on | on | none |
| coaches | ✅ | **21** | ✅ | on | on | **+`invite_code` (NOT NULL, backfilled+trigger), +`active_org_id`; subscription_status CHECK expanded incl. `org_managed` (§2)** |
| daily_habits | ✅ | 111 | ✅ | on | on | none |
| daily_nutrition_logs | ✅ | 381 | ✅ | on | on | none |
| exercises | ✅ | **822** | ✅ | on | on | additive cols (`deleted_at,source,org_id,image_url`) ALREADY in prod; RLS workspace-scoping reconcile (§3) |
| food_items | ✅ | 1009 | ✅ | on | on | none |
| food_swap_groups | ✅ | (~0) | ✅ | on | on | none |
| foods | ✅ | **305** | ✅ | on | on | none |
| news_items | ✅ | (~0) | ✅ | on | on | none |
| news_reads | ✅ | (~0) | ✅ | on | on | none |
| nutrition_meal_food_swaps | ✅ | (~0) | ✅ | on | on | none |
| nutrition_meal_logs | ✅ | 1238 | ✅ | on | on | none |
| nutrition_meals | ✅ | 336 | ✅ | on | on | none |
| nutrition_plan_cycles | ✅ | (~0) | ✅ | on | on | none |
| nutrition_plan_history | ✅ | (~0) | ✅ | on | on | none |
| nutrition_plan_templates | ✅ | **20** | ✅ | on | on | **+`org_id`; `coach_id` made NULLable; +owner CHECK; RLS rewritten (§2,§3)** |
| nutrition_plans | ✅ | **76** | ✅ | on | on | **+`org_id` (backfilled from clients); RLS rewritten (§2,§3)** |
| push_subscriptions | ✅ | (~0) | ✅ | on | on | none |
| recipe_ingredients | ✅ | 0 | ✅ | on | on | none |
| recipes | ✅ | (~0) | ✅ | on | on | none |
| saved_meal_items | ✅ | 748 | ✅ | on | on | none |
| saved_meals | ✅ | 203 | ✅ | on | on | none |
| subscription_events | ✅ | 11 | ✅ | on | on | **+`org_id`** (links B2B invoices) |
| template_meal_groups | ✅ | 75 | ✅ | on | on | none |
| template_meals | ✅ | 75 | ✅ | on | on | none |
| workout_blocks | ✅ | 3864 | ✅ | on | on | none |
| workout_logs | ✅ | **6729** | ✅ | on | on | none |
| workout_plans | ✅ | **644** | ✅ | on | on | none |
| workout_programs | ✅ | **146** | ✅ | on | on | **+`org_id`, +`created_by_coach_id`; `coach_id` made NULLable; +`chk_workout_owner` CHECK; RLS rewritten (§2,§3)** |
| workout_sessions | ✅ | (~0) | ✅ | on | on | none |

### 1b. Enterprise-only tables — created by the merge (NOT in prod)

All confirmed absent in prod (`to_regclass` = NULL). All `ENABLE ROW LEVEL SECURITY` in local.

| table | in PROD? | rows | in LOCAL? | RLS local | notes |
|---|---|---|---|---|---|
| organizations | ❌ | — | ✅ | on | core org table; many brand columns added across later migrations (§2) |
| organization_members | ❌ | — | ✅ | on | `user_id` is primary identity; `coach_id` NULLable; roles expanded to `org_owner/org_admin/ops/analyst/brand_manager/coach`; status `invited/active/suspended/revoked`; +`last_health_score(_at)` |
| organization_invites | ❌ | — | ✅ | on | created → dropped (`20260521100000`) → **recreated with workspace cols** (`20260524155600`); net: present with `status/redeemed_by/redeemed_at/max_attempts/attempt_count/last_attempt_at` |
| coach_client_assignments | ❌ | — | ✅ | on | unique(org_id, client_id); soft-delete |
| org_audit_logs | ❌ | — | ✅ | on | append-only (no UPDATE/DELETE policies) |
| audit_log_checksums | ❌ | — | ✅ | on | append-only, weekly tamper-evidence (Ley 21.719) |
| org_invoices | ❌ | — | ✅ | on | +`expected_amount_clp` |
| payment_exceptions | ❌ | — | ✅ | on | manual credits/exceptions |
| purge_audit | ❌ | — | ✅ | on | append-only; `org_id` w/o FK (org may be gone) |
| org_announcements | ❌ | — | ✅ | on | +`published_at`, +`audience('all/coaches/clients')` |
| org_nutrition_templates | ❌ | — | ✅ | on | org-level shared nutrition templates |
| org_weekly_snapshots | ❌ | — | ✅ | on | weekly org metrics; service_role write, members read |
| workspace_preferences | ❌ | — | ✅ | on | last-workspace router state; PK = user_id; CHECK shape per workspace type |
| push_tokens | ❌ | — | ✅ | on | **Expo push tokens — local-only (NOT in prod)**; `users_own_push_tokens` policy |

### 1c. Tables present in BOTH but introduced by the *exercises series already in prod*

| table | in PROD? | rows in prod | in LOCAL? | RLS prod | RLS local | notes |
|---|---|---|---|---|---|---|
| client_imports | ✅ | 2 | ✅ | on | on | Already live (applied `20260528014944`). Supports coach_id XOR org_id. Org branch of its RLS references `organization_members` which does not yet exist in prod, but is gated by `org_id IS NOT NULL` (always false in prod today). |

### 1d. Prod-only / leftover tables (NOT in local migrations)

| table | in PROD? | rows in prod | in LOCAL? | RLS prod | notes |
|---|---|---|---|---|---|
| exercises_backup_20260405 | ✅ | **70** | ❌ | **OFF** | Backup snapshot of `exercises` before a 2026-04-05 wipe. RLS DISABLED → exposed via PostgREST. The local `20260517120000_security_fixes` migration would `ENABLE RLS` on it, but that migration is not in prod. |
| personal_gastos | ✅ | **6** | ❌ | **OFF** | Owner's personal expense table, unrelated to the app. RLS DISABLED. Same fix pending in `security_fixes`. |

**Counts:** PROD has **39 tables** (37 standalone-in-both + 2 prod-only leftovers). LOCAL final schema has **37 standalone + 14 enterprise-only + client_imports** = **52 tables** (minus the 2 prod-only leftovers it never references). The merge introduces **14 brand-new enterprise tables**, modifies **~9 shared tables**, and leaves **2 prod-only tables** untouched (still missing RLS unless `security_fixes` is also applied).

---

## 2. Column-level deltas on SHARED tables

Columns the enterprise migrations ADD/ALTER on tables that already exist in prod. ⚠️ = ALTER touching a populated prod table.

### `clients` (⚠️ 60 rows)
- **ADD** `org_id uuid REFERENCES organizations(id)` — NULL = standalone (safe additive).
- **ADD** `age_confirmed_at timestamptz`.
- **ALTER** `coach_id DROP NOT NULL` ⚠️ — allows enterprise clients before assignment. Standalone rows keep coach_id; safe but relaxes a long-standing invariant.
- **ADD CONSTRAINT** `clients_org_email_unique UNIQUE (org_id, email)` ⚠️ — for the 60 existing rows org_id is NULL; Postgres treats NULLs as distinct so no collision, but verify no duplicate `(NULL,email)` issues with app assumptions.
- Source: `20260517130007`, `20260526103000`.

### `coaches` (⚠️ 21 rows)
- **ADD** `invite_code text` then **backfilled** for all existing coaches, set **NOT NULL**, `UNIQUE`, with a `BEFORE INSERT` trigger `generate_invite_code()` ⚠️ — runs a backfill UPDATE on all 21 prod rows.
- **ADD** `active_org_id uuid REFERENCES organizations(id)`.
- **ALTER CHECK** `coaches_subscription_status_check` dropped/recreated to add `org_managed` (and the migration's list also swaps `trialing→trial`, `canceled→cancelled` etc. — ⚠️ verify against current prod values: prod currently allows `active/trialing/pending_payment/past_due/canceled/expired/paused`; the enterprise CHECK in `20260517130008` lists `active/inactive/trial/cancelled/past_due/paused/org_managed`, which would **reject existing `trialing`/`canceled`/`expired`/`pending_payment` rows**). **This CHECK mismatch must be reconciled before merge** or the migration will fail on populated data.
- Source: `20260517130008`.

### `check_ins` (⚠️ 99 rows)
- **ADD** `reviewed_at timestamptz`, **ADD** `reviewed_by uuid REFERENCES coaches(id)` + index. Safe additive.
- RLS: the leak-fix drops the dangerous `USING(true)` policies (§3).
- Source: `20260601000600`, `20260530170000`.

### `workout_programs` (⚠️ 146 rows)
- **ADD** `org_id uuid`, **ADD** `created_by_coach_id uuid`.
- **ALTER** `coach_id DROP NOT NULL` ⚠️.
- **ADD CONSTRAINT** `chk_workout_owner CHECK (coach_id IS NOT NULL OR org_id IS NOT NULL)` ⚠️ — all 146 prod rows have coach_id, so passes.
- Source: `20260517130009`, `20260601000000`.

### `nutrition_plans` (⚠️ 76 rows)
- **ADD** `org_id uuid` + **backfill** `UPDATE nutrition_plans SET org_id = clients.org_id` ⚠️ (harmless on prod since clients.org_id is NULL).
- Source: `20260524185102`.

### `nutrition_plan_templates` (⚠️ 20 rows)
- **ADD** `org_id uuid`.
- **ALTER** `coach_id DROP NOT NULL` ⚠️ + **ADD CONSTRAINT** `chk_nutrition_template_owner`.
- Source: `20260524185102`, `20260601000100`.

### `subscription_events` (11 rows)
- **ADD** `org_id uuid REFERENCES organizations(id)`. Safe additive.
- Source: `20260517140001`.

### `exercises` (822 rows) — already applied in prod
- `deleted_at`, `source`, `org_id`, `image_url` already present live. `exercises_image_url_host_chk` CHECK (`NOT VALID`) restricts to the prod storage host. RLS reconcile only (§3).

### `organizations` (new table, but columns accreted across many migrations)
Beyond the base table, the merge adds: `client_limit`, `last_health_score`, `last_health_score_at`, `default_coach_capacity (1..500, default 25)`, `brand_draft jsonb`, `brand_published_at`, `brand_published_by`, `loader_text`, `use_custom_loader`, `loader_icon_mode`, `loader_text_color`, `splash_bg_color`, `accent_light`, `accent_dark`, `logo_url_dark`, `neutral_tint`, `brand_history jsonb` + several hex/length CHECK constraints.

---

## 3. RLS / policy deltas

### Prod RLS issues that the merge (partly) fixes — but which are LIVE TODAY
Confirmed by querying `pg_policies` on prod:

- **`check_ins` has the catch-all leak LIVE.** Prod currently has these permissive policies (PERMISSIVE = OR-ed, so they override scoped isolation):
  - `Enable read access for authenticated users` — `SELECT USING (true)` ← **any logged-in user can read every check-in (weight, photos, notes = sensitive health data).**
  - `Enable insert access for authenticated users` — `INSERT WITH CHECK (true)`
  - `Enable update access for authenticated users` — `UPDATE USING (true)`
  - `Enable delete access for authenticated users` — `DELETE USING (true)`
  - Plus duplicate scoped policies (`check_ins_client`, `check_ins_coach`, `client_manage_checkins`, `coaches_read_checkins`, `Client can manage…`, `Coach can view…`).
  - **Fix lives in `20260530170000_fix_checkins_rls_leak.sql` (drops the SELECT leak + dups) and `20260517120000_security_fixes.sql` (drops insert/update/delete) — NEITHER is in prod.** This is the single most important security delta to ship.
- **`exercises_backup_20260405` — RLS DISABLED in prod.** `security_fixes` would enable it (not yet applied).
- **`personal_gastos` — RLS DISABLED in prod.** Same.
- **`workout_sessions`** — `security_fixes` replaces permissive `Enable *` policies with scoped client/coach policies (not yet applied).

### Tables whose policies the merge rewrites (workspace-aware)
`20260525180500_workspace_rls_sensitive_tables.sql` introduces SECURITY DEFINER helpers `is_org_admin_member()`, `is_org_coach_member()`, `is_org_coach_assigned_to_client()` and **drops the old broad coach_id-only policies, replacing them** on:
- **clients** — `clients_standalone_coach_manage`, `clients_org_admin_manage`, `clients_org_coach_assigned_select/update`, `clients_org_coach_insert` (+ `org_admin_see_pool`, `org_coach_see_assigned` from `rls_user_id`). ⚠️ Old prod policies (`Coach can manage their own clients`, `clients_coach_all`, `coaches_manage_clients`, `Coaches can update their own clients`) are dropped.
- **workout_programs** — `workout_programs_workspace_manage` (+ `org_coaches_read_org_workout_templates`). Drops `Coaches can manage their own programs`, `workout_programs_coach`.
- **nutrition_plans** — `nutrition_plans_workspace_manage`. Drops `…coach`, `…coach_all`, `Coaches can manage their own nutrition plans`.
- **nutrition_plan_templates** — `nutrition_plan_templates_workspace_manage` (+ `org_coaches_read_org_nutrition_plan_templates`).
- **client_payments** — `client_payments_workspace_manage`.

### New RLS on enterprise tables
- `rls_user_id` (`20260521000003`) creates membership-scoped policies for `organizations`, `organization_members`, `organization_invites`, `coach_client_assignments`, `org_audit_logs` (insert+read), `org_invoices`, `payment_exceptions`.
- `fix_rls_recursion` (`20260517150000`) — `org_members_see_peers` uses SECURITY DEFINER `is_active_org_member()` to avoid infinite recursion on `organization_members`. (Later updated by `rls_user_id` to key on `user_id`.)
- Per-table policies also defined inline in: `org_announcements`, `org_nutrition_templates`, `org_weekly_snapshots`, `workspace_preferences`, `push_tokens`, `client_imports`.

### exercises RLS
- Prod currently has a large, overlapping policy set on `exercises` (legacy `Coach can…`, `exercises_read`, `read_global_exercises`, `clients_read_coach_exercises`, plus the newer `exercises_select_visible`, `exercises_*_own`, `exercises_write_own`, `coaches_manage_exercises`). `20260530100000_exercises_drop_conflicting_policies.sql` (local) prunes the broad ones, leaving only the workspace-scoped set. Reconcile with the prod-only hotfix `fix_exercises_rls_overly_permissive_policies` (`20260528223023`).

### Storage policies
`20260525181500_storage_workspace_policies.sql` adds owner/admin-scoped policies on `storage.objects` for buckets `logos` (owner = first path folder), `org-assets` (`orgs/{org_id}/…`, gated by `is_org_admin_member`), and `checkins` (owner-scoped). `20260527130100` (already in prod) added `exercise-media` owner-write + public-read policies.

---

## 4. Storage buckets (prod)

From `storage.buckets` on prod:

| bucket | public | notes / merge expectation |
|---|---|---|
| checkins | **`true`** ⚠️ | **Security concern: public bucket holding client progress photos.** Direct object URLs are guessable/listable. Storage policies in `storage_workspace_policies` only gate authenticated API writes/listing; the bucket itself stays public. Consider making private + signed URLs. |
| exercise-animations | true | legacy animation assets |
| exercise_animations_backup | true | backup of the above |
| exercise-media | true | created by `exercise_media_bucket` (already in prod). Public read by design; writes path-scoped to `auth.uid()`. |
| logos | true | coach/brand logos. Merge adds owner-scoped write policies (`logos_owner_*`). |
| news | true | news images |
| support-attachments | **false** | the only private bucket |

**Buckets the merge expects/creates:**
- `20260521000004_storage_buckets.sql` upserts `checkins` (public), **`org-assets` (public, new)**, `logos` (public) — so **`org-assets` is a NEW bucket the merge introduces** (not in prod today).
- `20260527130100_exercise_media_bucket.sql` upserts `exercise-media` — **already in prod**.
- `20260525181500_storage_workspace_policies.sql` adds the `storage.objects` policies (logos/org-assets/checkins).

---

## 5. Functions / RPCs

### Prod function inventory (`pg_proc`, schema `public`)
**SECURITY DEFINER functions in prod (8):**
| function | args | anon EXECUTE? |
|---|---|---|
| check_platform_email_availability | `p_email text` | **yes** |
| get_admin_coaches_paginated | `(text,text,text,boolean,text,text,int,int)` | **yes** |
| get_client_current_streak | `p_client_id uuid` | **yes** |
| get_clients_last_workout_date | `(uuid[], timestamptz)` | **yes** |
| get_coach_clients_streaks | `p_coach_id uuid` | **yes** (guards with `auth.uid()` check internally) |
| get_coach_workout_sessions_30d | `p_coach_id uuid` | **yes** (guards internally) |
| get_platform_trial_conversion_rate | `()` | **yes** |
| touch_coach_activity | `p_coach_id uuid` | **yes** |

⚠️ **Audit flag:** every SECURITY DEFINER function above is **executable by the `anon` role**. `get_admin_coaches_paginated` (exposes coach PII, emails, MRR-adjacent data) and `check_platform_email_availability` (email enumeration) are the highest-risk — they run with definer privileges and bypass RLS. `get_coach_*` functions self-guard on `auth.uid()`, so anon calls return empty, but the admin/email ones do not. Recommend `REVOKE EXECUTE … FROM anon` on the admin/email functions.

**Non-SECURITY-DEFINER, anon-executable platform RPCs (also reachable by anon):** `get_admin_audit_logs_paginated`, `get_platform_checkins_7d`, `get_platform_churn_last_30d`, `get_platform_churn_monthly`, `get_platform_clients_count`, `get_platform_coach_signups_last_6_months`, `get_platform_coaches_by_tier(_monthly)`, `get_platform_coaches_count`, `get_platform_mrr_12_months`, `get_platform_revenue_by_cycle`, `get_platform_revenue_by_tier`, `get_platform_subscription_events_series`, `get_platform_workout_sessions_30d`, `get_workout_program_planned_set_totals`, `get_coach_client_signups_last_6_months`, `search_foods`, plus `handle_updated_at`, `immutable_unaccent`, `unaccent*`. These are STABLE/non-definer so they respect RLS, but `get_admin_audit_logs_paginated` reads `admin_audit_logs` and should still be locked down to admins. ⚠️ Several platform-metric RPCs (counts, MRR, churn, revenue) are anon-callable and leak aggregate business metrics.

### Functions the merge ADDS (local-only, not in prod)
- `generate_invite_code()` (trigger fn) — `20260517130008`
- `is_active_org_member(uuid)` — `20260517150000`, updated in `20260521000003` (SECURITY DEFINER)
- `is_org_admin_member(uuid)`, `is_org_coach_member(uuid,uuid)`, `is_org_coach_assigned_to_client(uuid)` — `20260525180500` (all SECURITY DEFINER, `search_path=public`)
- `try_uuid(text)` — `20260525181500`
- Plus the `custom_access_token_hook` / auth-hook changes in `20260517130012`, `20260521000002`, `20260522000000` (auth-hook + MFA check) and bulk-reassign RPCs (`20260521110000`, `20260523224600`, `20260530210000_bulk_assign_selected_clients_rpc`).

### Functions hardened by `security_fixes` (local-only — NOT in prod)
`20260517120000` re-creates `immutable_unaccent`, `handle_updated_at`, `search_foods`, `get_client_current_streak` with explicit `SET search_path` (mutable-search-path advisor fix). Prod still has the older definitions without the pinned search_path on some of these.

---

## Summary (counts)

- **Total tables in PROD:** 39 (37 standalone-in-both + 2 prod-only leftovers).
- **Total tables in LOCAL final schema:** 52 (37 shared + 14 enterprise-only + `client_imports`, which is also live in prod).
- **Enterprise-only tables the merge creates:** **14** — `organizations`, `organization_members`, `organization_invites`, `coach_client_assignments`, `org_audit_logs`, `audit_log_checksums`, `org_invoices`, `payment_exceptions`, `purge_audit`, `org_announcements`, `org_nutrition_templates`, `org_weekly_snapshots`, `workspace_preferences`, `push_tokens`.
- **Shared tables with column/RLS deltas:** **9** — `clients`, `coaches`, `check_ins`, `workout_programs`, `nutrition_plans`, `nutrition_plan_templates`, `subscription_events`, `exercises` (cols already live; RLS reconcile), `client_payments` (RLS only).
- **Prod-only leftover tables:** **2** — `exercises_backup_20260405` (70 rows, RLS OFF), `personal_gastos` (6 rows, RLS OFF).
- **New storage bucket the merge creates:** 1 — `org-assets`.
- **Prod SECURITY DEFINER functions:** 8 (all anon-executable — see §5 audit flag).
- **🔴 Highest-priority pre-merge items:** (1) The `check_ins` `USING(true)` SELECT/INSERT/UPDATE/DELETE leak is **live in prod** — ship `fix_checkins_rls_leak` + `security_fixes`. (2) The `coaches_subscription_status_check` CHECK list mismatch in `20260517130008` would reject existing `trialing/canceled/expired/pending_payment` rows — reconcile before applying. (3) RLS missing on `exercises_backup_20260405` and `personal_gastos`. (4) `checkins` bucket is public. (5) Reconcile the two prod-only exercises hotfixes with the local migration ledger.
