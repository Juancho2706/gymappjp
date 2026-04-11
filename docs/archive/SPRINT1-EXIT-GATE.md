# Sprint 1 Exit Gate

Date: 2026-04-10

## Gate status

Overall: **Conditional Go**

- Engineering quick wins: complete
- Ops/docs baseline: complete
- QA auth action tests: complete
- Legal health disclaimers: complete
- Security secrets audit: complete
- Security signup lockdown: **pending external toggle**

## Evidence summary by area

- ENG:
  - `.env.example` added
  - auth callback fixed to `/login`
  - legacy `ClientCard` removed
  - SW cache renamed to `eva-pwa-cache-v1`
  - `font-outfit` references removed in target pages
  - `admin-raw.ts` typed with `Database`
- OPS:
  - README updated (variables + migration process)
  - migration workflow documented (`docs/SUPABASE-MIGRATION-WORKFLOW.md`)
  - migration snapshot committed (`supabase/migrations/20260410170000_remote_migrations_snapshot.sql`)
- QA:
  - `src/app/(auth)/login/actions.test.ts` passing
  - `src/app/(auth)/register/actions.test.ts` passing
- LEG:
  - disclaimer added in check-in page header
  - disclaimer added in onboarding page and health step
- SEC:
  - no hardcoded tracked secrets found
  - public signup still enabled in project-level auth settings and requires dashboard/management API change

## Blocking item before payment launch

- Set `disable_signup=true` in Supabase project auth configuration.
