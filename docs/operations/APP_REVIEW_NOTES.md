# App review — Apple / Google

---
status: active
owner: release
last_verified: 2026-07-20@4a1249f0
canonical: reviewer-copy template; credentials never live in Git
---

## Product summary

EVA is a B2B2C fitness coaching platform. Coaches manage clients, workout
programs, nutrition plans and progress. Clients use the app provided by their
coach to train, log nutrition and complete check-ins.

## Reviewer accounts

Do not commit emails or passwords here.

Before each submission:

1. Create or verify dedicated coach and client review accounts.
2. Confirm both accounts against the exact release build.
3. Store their credentials only in App Store Connect and Google Play Console.
4. Rotate or disable the accounts after the review window.

Required reviewer data:

- Coach email: `[SET_IN_STORE_CONSOLE]`
- Coach password: `[SET_IN_STORE_CONSOLE]`
- Client email: `[SET_IN_STORE_CONSOLE]`
- Client password: `[SET_IN_STORE_CONSOLE]`
- Client entry code/slug: `[SET_IN_STORE_CONSOLE]`

## Account flows

- Coaches can sign in or create a Free account in the mobile app.
- Clients cannot self-register. Their coach creates or invites them.
- A client signs in through the entry point associated with the coach/team.
- Reviewer instructions must identify which role and entry point to use.

## Billing

- EVA does not sell digital subscriptions or add-ons inside the native app.
- Coach billing and payment-method management happen on the web platform.
- Revalidate this statement before every store submission.

## Runtime permissions currently used

| Permission | Current use |
|---|---|
| Camera | Check-in photos and nutrition barcode scanning |
| Photo library | Check-in, exercise/food and branding image selection |
| Notifications | Workout/rest timers, reminders and app badge |
| Biometrics | Optional local re-entry protection on supported devices |

Do not claim step counting, Motion/Accelerometer use or another capability
unless the release build contains and exercises that implementation.

## Pre-submission verification

- [ ] Reviewer accounts exist and use synthetic data only.
- [ ] Credentials are present in both store consoles and absent from Git.
- [ ] Coach registration and both sign-in flows work on the release build.
- [ ] Permission copy matches the permissions requested by the binary.
- [ ] Privacy labels/Data Safety match the current SDK and data-flow inventory.
- [ ] Billing copy matches the current native app behavior.
- [ ] Support and privacy-contact URLs resolve.
- [ ] Account deletion path is documented for both roles.
