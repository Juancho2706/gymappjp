# Enterprise Dashboard Revenue MVP - SPEC

**Status:** ACTIVE  
**Owner:** EVA  
**Last updated:** 2026-05-23  
**Plan:** `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md`

---

## Problem

Enterprise buyers need a professional command center that explains business health, coach workload, student risk, white-label control, and operational next steps without requiring EVA staff to narrate every detail in a demo.

## Users

- Primary: gym/academy owner
- Secondary: org admin, operations manager, brand manager, payments manager, analyst
- Indirect: enterprise-created coaches and students affected by organization branding and assignments

## Goals

- Make `/org/[slug]` feel revenue-ready and operational.
- Show useful business health using existing data first.
- Introduce enterprise navigation for future full modules without breaking existing routes.
- Keep enterprise accounts separate from coach/student accounts.
- Establish Brand Center and white-label propagation as first-class product concepts.

## Non-Goals

- Native EVA Enterprise app.
- In-app student checkout.
- Full permission engine in first visual slice.
- Full white-label persistence/migrations before data model review.
- Replacing the coach dashboard or student PWA.

## User Stories

- As an owner, I want to see health, coaches, students, and risk at a glance, so I know what needs action.
- As an owner, I want clear enterprise menus, so I understand what EVA Enterprise offers.
- As an owner, I want a Brand Center, so my coaches and students see my company's identity.
- As an admin, I want placeholders for upcoming modules to explain the operating model during demos.

## Acceptance Criteria

- [ ] Dashboard has a professional enterprise visual hierarchy.
- [ ] Dashboard uses existing org data only; no DB schema changes.
- [ ] New navigation does not link to missing routes.
- [ ] Placeholder module pages are responsive and explain value/actions.
- [ ] White-label concepts are visible in plan and Brand Center placeholder.
- [ ] `npm run typecheck` passes.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Overbuilding visual shell before data model | Rework | First slice is read-only and uses current data. |
| Linking to missing enterprise modules | 404s | Add safe placeholder pages for new nav items. |
| Confusing billing with student payments | Sales/product confusion | Rename to Pagos Alumnos and state no in-app checkout. |

