# EVA — App Review Notes (Apple / Google)

## App description for reviewers

EVA is a B2B fitness coaching platform. Coaches use it to manage clients, create workout programs, and track client nutrition and check-ins. Clients use it to log workouts, track nutrition, and communicate with their coach.

**The app has two distinct user roles with different flows:**

---

## Demo credentials

### Role 1: Coach
- **Email:** demo-coach@eva-app.cl
- **Password:** DemoEVA2026!
- **What you'll see:** Client list, workout program builder, nutrition plan creator, analytics dashboard, subscription management.

### Role 2: Client (alumno)
- **Email:** demo-client@eva-app.cl
- **Password:** DemoEVA2026!
- **Coach slug for login screen:** `demo`
- **What you'll see:** Assigned workout plan, nutrition log, weekly check-in, progress history.

> Both accounts are connected (the client belongs to the demo coach). You can experience the full workflow with either account.

---

## App does NOT sell anything in-app

- No in-app purchases.
- No subscriptions sold through the app.
- Coaches manage their subscriptions exclusively on the web platform (eva-app.cl).
- Guideline §3.1.3(a) applies: business-to-business app where billing happens outside the app.

---

## Permissions used and why

| Permission | Why |
|---|---|
| Camera / Photo Library | Clients upload weekly check-in photos to share with coach |
| Push Notifications | Workout reminders, coach messages, check-in alerts |
| Motion / Accelerometer | Optional step counting during workouts |

---

## Login flow notes

- The client login screen requires entering a **coach slug** (e.g., `demo`) before showing the email/password fields. This is by design — each coach has a branded white-label app experience.
- Coaches log in directly with email + password on the main screen (no slug required).
- If the reviewer sees a "coach slug" field, enter `demo` to proceed.

---

## No account creation in-app

- Coaches register on the web (eva-app.cl).
- Clients are invited by their coach — they cannot self-register in the app.
- The app is invitation-only for clients by design (medical/fitness data safety).

---

## Age restriction

- EVA requires users to be 14+ (confirmed at registration).
- The app does not target children.
- Rating: 4+ (no objectionable content).

---

## Google Play — Data Safety Form answers

| Category | Collected | Shared | Purpose |
|---|---|---|---|
| Name | Yes | No | App functionality |
| Email address | Yes | No | App functionality, account management |
| Fitness & exercise data | Yes | No | App functionality (workout logs) |
| Health info | Yes | No | App functionality (nutrition, check-ins) |
| Photos / videos | Yes | No | App functionality (check-in photos) |
| App interactions | Yes | No | Analytics (anonymized) |

Data is encrypted in transit (TLS) and at rest (Supabase encryption).
Users can delete their data by contacting privacidad@eva-app.cl or through the coach dashboard.

---

## Apple Privacy Labels

| Data type | Linked to identity | Used for tracking |
|---|---|---|
| Name | Yes | No |
| Email | Yes | No |
| Health & fitness | Yes | No |
| Photos | Yes | No |
| User content (workout logs, nutrition) | Yes | No |
| Usage data (anonymized analytics) | No | No |
