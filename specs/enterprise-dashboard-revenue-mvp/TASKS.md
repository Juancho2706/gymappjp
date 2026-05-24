# Enterprise Dashboard Revenue MVP - TASKS

**Status:** ACTIVE  
**Owner:** EVA  
**Last updated:** 2026-05-23  
**Spec:** `specs/enterprise-dashboard-revenue-mvp/SPEC.md`  
**Plan:** `specs/enterprise-dashboard-revenue-mvp/PLAN.md`

---

## Phase 0 - Spec Lock

- [x] Create SPEC.
- [x] Create PLAN.
- [x] Create TASKS.

## Phase 1 - Visual Shell And Dashboard Slice

- [x] Upgrade enterprise navigation shell.
- [x] Add read-only business health dashboard.
- [x] Add safe placeholder routes for new enterprise menus.
- [x] Run `npm run typecheck`.
- [x] Update `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md` with timestamp.

## Phase 3 - Team & Access Preview

- [x] Research 2026 RBAC/IAM enterprise patterns before implementation.
- [x] Replace Team & Access placeholder with read-only visual preview.
- [x] Separate enterprise users from linked coaches in the UI.
- [x] Add role template matrix and security posture preview.
- [x] Document partial completion timestamp in plan.
- [x] Run `npm run typecheck`.

## Phase 4 - Brand Center Preview

- [x] Replace Brand Center placeholder with read-only visual preview.
- [x] Add coach app, student PWA, enterprise dashboard and loader previews.
- [x] Document partial completion timestamp in plan.
- [x] Run `npm run typecheck`.

## Phase 5 - Assignments Preview

- [x] Research 2026 scheduling/capacity UX patterns before implementation.
- [x] Replace Assignments placeholder with read-only operational cockpit.
- [x] Add unassigned student queue, coach capacity and overload warnings.
- [x] Add future-safe rules for bulk assign, audit and rollback.
- [x] Document partial completion timestamp in plan.
- [x] Run `npm run typecheck`.

## Phase 6 - Student Payment Ops Preview

- [x] Research 2026 dashboard/payment ops UX patterns before implementation.
- [x] Replace Payments placeholder with read-only operational ledger.
- [x] Keep copy explicit: no in-app charging, no tax invoice, no accounting replacement.
- [x] Show MVP payment states without inventing real payment records.
- [x] Document partial completion timestamp in plan.
- [x] Run `npm run typecheck`.

## Phase 7A - Audit Log Preview

- [x] Research 2026 SaaS audit/RBAC evidence patterns before implementation.
- [x] Confirm existing `org_audit_logs`/RLS before adding any migration.
- [x] Add repository/query access for org audit events.
- [x] Replace Audit placeholder with read-only real timeline.
- [x] Document completion timestamp in plan.
- [x] Run `npm run typecheck`.

## Phase 7B - Audit Event Helper

- [x] Add central `writeOrgAuditEvent` service helper.
- [x] Use `resource.action` event naming for new connections.
- [x] Connect announcement mutations to audit helper.
- [x] Connect nutrition template mutations to audit helper.
- [x] Connect enterprise coach/staff mutations to audit helper.
- [x] Connect client assignment/import/create mutations to audit helper.
- [x] Document partial completion timestamp in plan.
- [x] Run `npm run typecheck`.

## Universal Definition of Done

- [x] `npm run typecheck`
- [x] No direct feature-data Supabase calls in new `_data`
- [x] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [x] Dark mode checked when UI changes
- [x] Docs updated when routes, flows, DB, tests, or priorities change
