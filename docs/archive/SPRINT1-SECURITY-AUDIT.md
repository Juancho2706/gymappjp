# Sprint 1 Security Audit (SEC-007, SEC-008)

Date: 2026-04-10

## SEC-007 - Secrets audit

Scans executed against the repository with `rg`:

- API key/token patterns (`AIza`, `sk_live`, `ghp_`, `xox*`)
- hardcoded Supabase credentials
- private key headers (`BEGIN PRIVATE KEY`)
- credentialed connection strings (`postgres://user:pass@...`)

Result:

- No hardcoded secrets were found in tracked files.
- `.env.example` was added to keep safe placeholders versioned.
- `README.md` now documents required environment variables and explicitly avoids committing real values.

## SEC-008 - Public signup posture

Current product flow uses server-side admin user creation for coach registration (`registerAction` with service role), not open client-side signup.

Operational action for Supabase Auth:

- Verify `Enable email signups` is disabled in Supabase Auth settings for production.
- Keep it disabled unless a product requirement explicitly needs public self-signup.

Verification status:

- App-side onboarding/auth flow remains functional after Sprint 1 quick wins.
- Supabase `/auth/v1/settings` currently reports `"disable_signup": false`.
- Public signup was validated and then cleaned up with service-role delete during audit.
- Final toggle must be applied through Supabase dashboard or Management API (`PATCH /v1/projects/{ref}/config/auth`).
- Helper script added: `npm run supabase:disable-signup` (requires `SUPABASE_ACCESS_TOKEN`).
