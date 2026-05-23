# Auth UX & Security — Web → React Native Blueprint

> Last updated: 2026-05-23  
> Branch: v2/enterprise  
> Covers: `/login` (coach) and `/org/login` (enterprise)

---

## Visual identities

| Surface | Background | Accent | Layout |
|---|---|---|---|
| Coach | Light / dark-mode aware | iOS blue `#007AFF` | Split panel (lg+): 52% branding + flex-1 form |
| Enterprise | Dark `#09090b` always | Amber `#F59E0B` | Single centered glass card |

Token source: `packages/tokens/auth.ts` — JS objects portable to RN with zero modification.  
CSS vars: `[data-eva-surface="enterprise"]` in `packages/tokens/theme.css`.

---

## Web → RN component mapping

| Web | RN equivalent | Notes |
|---|---|---|
| `min-h-dvh` | `flex: 1` in `SafeAreaView` | dvh accounts for iOS virtual keyboard |
| `pt-safe pb-safe` | `react-native-safe-area-context` insets | See `globals.css` utilities |
| `<input type="email" autoComplete="email">` | `<TextInput keyboardType="email-address" autoComplete="email" textContentType="emailAddress">` | |
| `<input type="password" autoComplete="current-password">` | `<TextInput secureTextEntry autoComplete="password" textContentType="password">` | |
| `aria-live="polite"` | `accessibilityLiveRegion="polite"` | Or `AccessibilityInfo.announceForAccessibility()` |
| `aria-pressed` on toggle | `accessibilityState={{ selected }}` + `accessibilityRole="button"` | |
| `role="alert"` | `accessibilityLiveRegion="assertive"` | |
| `aria-busy` on submit | `accessibilityState={{ busy: pending }}` | |
| Tailwind tokens | `packages/tokens/auth.ts` color objects | Import directly in RN styles |
| Framer-motion + `useReducedMotion` | `reanimated` + `AccessibilityInfo.isReduceMotionEnabled()` | |
| `KeyboardAvoidingView` (NOT used in web) | `KeyboardAvoidingView behavior="padding"` | Web handles this with `min-h-dvh` |
| `CaptchaSlot` (Turnstile widget) | WebView wrapper for Turnstile OR native challenge | Tracker: future RN PR |
| RHF `useForm` | RHF works in RN unchanged | Same `@hookform/resolvers` + Zod |

Tested viewport matrix: 360×640, 375×812, 393×852.

---

## Security architecture

### Anti-enumeration
Both login server actions return a single generic message regardless of failure reason:
- Coach: `'No pudimos verificar tus credenciales. Revisá email y contraseña.'`
- Enterprise: `'No pudimos iniciar sesión.'` (intentionally shorter — no info about org membership)

### Timing attack mitigation
All error paths call `jitter(300, 500)` before returning (`apps/web/src/lib/auth/timing.ts`).  
Success path has natural DB latency — no jitter needed.

### Brute-force layered defense

```
Layer 1: Upstash Redis sliding window — 20 POST/min/IP (middleware, before any DB hit)
Layer 2: Cookie fail counter per feature — `eva_auth_fails` (coach) / `eva_org_auth_fails` (org)
Layer 3: Cloudflare Turnstile captcha gate at ≥3 cookie failures
```

Cookie properties: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Max-Age=900`, scoped `Path`.

### Cookie domain isolation
Auth cookies are scoped per subdomain — **not** shared:
- `eva-app.cl` → coach + student sessions  
- `enterprise.eva-app.cl` → org_owner / org_admin sessions  

Sharing via `.eva-app.cl` parent `Domain` would introduce CSRF cross-subdomain — intentionally avoided.

### MFA
Enforcement is post-login in middleware via `requires_mfa_setup` JWT claim.  
The "MFA TOTP obligatorio" badge in `EnterpriseTrustHeader` is accurate — it reflects real enforcement.

---

## Accessibility checklist

- All `<input>` have `<label htmlFor>` — no placeholder-only labels
- `aria-invalid` + `aria-describedby` on error state (`AuthFormField`)
- Decorative icons `aria-hidden="true"` throughout
- Errors in `role="alert"` + `aria-live="polite"` + programmatic focus (`AuthErrorAlert`)
- Password toggle: `aria-pressed`, `aria-label`, `type="button"`, touch area ≥44×44px (`PasswordInput`)
- CapsLock warning: `role="status"` + `aria-live="polite"` (`PasswordInput`)
- Submit button: `disabled` + `aria-busy={pending}` (`AuthSubmitButton`)
- Focus ring: 2px + offset 2px, contrast ≥3:1
- `font-size: 16px` minimum on all inputs (prevents iOS auto-zoom)
- `min-h-dvh` (not `min-h-screen`) for iOS virtual keyboard
- Coach page: `prefers-reduced-motion` respected (framer-motion removed; feature list is static `<ul>`)

---

## Component locations

```
apps/web/src/components/auth/
├── AuthFormField.tsx      # Base field: label + icon + input + error + hint
├── PasswordInput.tsx      # Eye toggle + CapsLock warning
├── AuthErrorAlert.tsx     # Alert banner with programmatic focus
├── AuthSubmitButton.tsx   # Pending-aware submit with aria-busy
├── TrustStrip.tsx         # Trust signal pills
├── CaptchaSlot.tsx        # Cloudflare Turnstile slot
└── index.ts               # Barrel export

packages/tokens/auth.ts    # Portable JS token objects for web + RN
packages/tokens/theme.css  # [data-eva-surface="enterprise"] CSS vars
apps/web/src/lib/auth/
├── turnstile.ts           # Server: verifyTurnstile(), getTurnstileSiteKey()
├── fail-counter.ts        # Server: cookie-based per-feature fail counter
├── timing.ts              # Server: jitter() anti-timing helper
└── error-messages.ts      # Shared: URL ?error= code → message map
```

---

## Feature flags

| Flag | File | Covers |
|---|---|---|
| (no flag, shipped inline) | — | Phase 1–4 shipped directly as improvements to existing pages |

The plan originally called for `eva_auth_v2_coach` and `eva_auth_v2_enterprise` flags.  
Since the refactor is backwards-compatible (same routes, same action signatures, no DB changes), flags were omitted — the improvement ships as-is and is trivially revertable via `git revert`.

---

## Environment variables

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile widget site key (client-exposed) |
| `TURNSTILE_SECRET` | Turnstile server verification secret |

See `docs/operations/MANUAL_TASKS.md` §MT-37 for Cloudflare dashboard setup steps.

---

## Runbook: captcha gate stuck

If users report being stuck with Turnstile after a legitimate login failure:
1. Cookie `eva_auth_fails` / `eva_org_auth_fails` expires automatically in 15 min.
2. Users can clear browser cookies manually as workaround.
3. If Cloudflare Turnstile is down: `verifyTurnstile()` fails-open for `failCount < 5` — users can still log in up to 5 consecutive failures before hard block.
4. To fully disable captcha gate: unset `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` → widget hidden, verify fails-open always.
