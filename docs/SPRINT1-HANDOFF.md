# Sprint 1 Handoff -> Sprint 2

## Foundation status

- Quick wins P0 implemented (`ENG-026` to `ENG-034` scope covered in codebase).
- Auth server-actions now have automated tests (`QA-006`, `QA-007`).
- Legal disclaimers for health data are visible in onboarding and check-in (`LEG-016`, `LEG-017`).
- Migration workflow is documented and `supabase/migrations` is now tracked in git.

## Environment baseline

- `.env.example` exists with safe placeholders.
- `README.md` includes variable table and setup sequence.
- Security audit report is available in `docs/SPRINT1-SECURITY-AUDIT.md`.

## Security posture before Sprint 2

- Repository scan found no hardcoded secrets in tracked files.
- Public signup is still enabled at project level and must be disabled in Supabase config before payment rollout.

## DB/migration baseline

- Remote migration history snapshot is committed at:
  - `supabase/migrations/20260410170000_remote_migrations_snapshot.sql`
- Full `supabase db pull` requires a valid `SUPABASE_ACCESS_TOKEN` in local CLI auth.

## Ready-for-Sprint-2 checklist

- [x] Auth callback redirect fixed.
- [x] Legacy `ClientCard` V1 removed.
- [x] Service worker cache namespace updated to EVA.
- [x] Runtime dependencies cleaned (`puppeteer` moved to devDependencies).
- [x] `admin-raw.ts` no longer uses `any`.
- [x] Migration workflow documented.
- [x] Auth action unit tests passing.
- [ ] Disable public signup at Supabase project level.
