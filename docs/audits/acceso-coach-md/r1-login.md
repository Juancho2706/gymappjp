# 1. Login del coach, recuperar y restablecer contrasena

> Alcance: el ACCESO del coach es siempre EVA-brandeado (nunca white-label). Esta seccion cubre login con email/password, login con Google (OAuth), recuperacion y restablecimiento de contrasena, y la pantalla post-registro `verify-email`. Enfasis en backend: validacion, autenticacion, creacion de cuenta OAuth, rate-limit, CAPTCHA y redireccion post-login. Solo `apps/web`.

---

## 1.0. Mapa de rutas y archivos

| Ruta | Tipo | Archivo |
|------|------|---------|
| `/login` | RSC page | `apps/web/src/app/(auth)/login/page.tsx` |
| `/login` (form) | client | `apps/web/src/app/(auth)/login/_components/CoachLoginForm.tsx` |
| `/login` (POST) | server action | `apps/web/src/app/(auth)/login/_actions/login.actions.ts` → `loginAction` |
| `/forgot-password` | client page + form | `apps/web/src/app/(auth)/forgot-password/page.tsx` |
| `/forgot-password` (POST) | server action | `apps/web/src/app/(auth)/forgot-password/_actions/forgot-password.actions.ts` → `forgotPasswordAction` |
| `/reset-password` | client page + form | `apps/web/src/app/(auth)/reset-password/page.tsx` |
| `/reset-password` (POST) | server action | `apps/web/src/app/(auth)/reset-password/_actions/reset-password.actions.ts` → `resetPasswordAction` |
| `/verify-email` | client page | `apps/web/src/app/(auth)/verify-email/page.tsx` |
| `/auth/callback` | route handler GET | `apps/web/src/app/auth/callback/route.ts` (OAuth login + recovery) |
| `/auth/register-callback` | route handler GET | `apps/web/src/app/auth/register-callback/route.ts` (OAuth registro) |
| `/auth/exchange` | client page | `apps/web/src/app/auth/exchange/AuthExchangeClient.tsx` (intercambio de `code` por sesion) |
| `/auth/confirm` | route handler GET | `apps/web/src/app/auth/confirm/route.ts` (confirmacion de email free + recovery `token_hash`) |
| `/coach/onboarding/complete` | RSC + form | `apps/web/src/app/coach/onboarding/complete/{page.tsx,_components/CompleteOnboardingForm.tsx}` |
| `/coach/onboarding/complete` (POST) | server action | `.../complete/_actions/complete.actions.ts` → `completeOAuthOnboarding` |
| `/workspace/select` | RSC + form | `apps/web/src/app/workspace/select/page.tsx` |
| `/workspace/select` (POST) | server action | `apps/web/src/app/workspace/select/select.actions.ts` → `selectWorkspaceAction` |

El grupo `(auth)` comparte layout `apps/web/src/app/(auth)/layout.tsx`. `/login` ademas sobreescribe con su propio `login/layout.tsx`.

---

## 1.1. Layout del grupo `(auth)` y panel de marketing

**`(auth)/layout.tsx`** (`AuthLayout`): contenedor `min-h-dvh` con un gradiente ambiental fijo. No impone `max-width`; cada hijo define el suyo (el comentario aclara: el login del coach usa un split layout full-width, el resto usa `max-w-md`). Centra el contenido. Importa `ThemeToggle` y `LandingBrandMark` (aunque en este layout no los renderiza; los renderizan las paginas).

**`(auth)/login/layout.tsx`** (`LoginLayout`): exporta `metadata` con `title: 'Iniciar sesion'`, descripcion orientada al coach (gestionar alumnos, rutinas, nutricion, marca) y **`robots: { index: false, follow: true }`** (la pagina de login NO se indexa). Envuelve en un contenedor `fixed inset-0 z-50` con gradiente.

**`login/page.tsx`** (`CoachLoginPage`, RSC `async`): es el embudo de adquisicion. Estructura:

- **Panel izquierdo de marketing** (visible solo `lg:`): marca EVA (`LandingBrandMark`), `ThemeToggle`, badge "Plataforma para coaches", titulo "Tu negocio de fitness, profesionalizado", y una lista `FEATURES` hardcodeada de 3 items:
  - `Gestion de alumnos` — "Directorio completo con metricas de adherencia"
  - `Planes de entrenamiento` — "Builder drag & drop con variantes A/B"
  - `Analitica del negocio` — "MRR, sesiones, crecimiento de alumnos"
  - Footer con copyright dinamico `new Date().getFullYear()`.
- **Panel derecho (formulario)**: header mobile con marca + theme toggle, titulo "Bienvenido de vuelta", subtitulo, y el `<CoachLoginForm>` dentro de `<Suspense>`.

**Trabajo de backend en la page (server-side, antes de renderizar):**

1. `const params = await searchParams` — lee `?error=<code>`.
2. `const failCount = await readFailCount('coach')` — cuenta de fallos desde cookie (ver 1.3).
3. `const showCaptcha = failCount >= CAPTCHA_THRESHOLD` (`CAPTCHA_THRESHOLD = 3`).
4. `const turnstileSiteKey = getTurnstileSiteKey()` — lee `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
5. `const urlError = getAuthErrorMessage(params.error, 'coach')` — traduce el codigo de error de la URL a mensaje (ver 1.6).

Estos tres valores (`urlError`, `showCaptcha`, `turnstileSiteKey`) se pasan como props al form.

---

## 1.2. LOGIN — `CoachLoginForm` (cliente)

**Validacion cliente:** `react-hook-form` + `zodResolver(CoachLoginSchema)`, `mode: 'onBlur'`. El schema (`@eva/schemas`, `packages/schemas/auth.ts`):

```
CoachLoginSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  captchaToken: z.string().optional(),
})
```

> Nota de paridad: `CoachLoginSchema === OrgLoginSchema === baseLogin`. `LoginSchema`/`LoginInput` son alias deprecated del mismo. El minimo de password en login es **6** caracteres (distinto del de reset = 8, ver 1.9).

**Campos del form:**
- `AuthFormField` email (`type=email`, `autoComplete=email`, icono `Mail`, `variant=coach`, registrado con `register('email')`).
- `PasswordInput` password (`variant=coach`), con un `labelEnd` que es el `Link` a `/forgot-password` ("¿Olvidaste tu contraseña?").
- `CaptchaSlot` — **solo se renderiza si `showCaptcha === true`** (`theme="light"`). Ver 1.5.
- `AuthErrorAlert` — muestra `displayError = state?.error || urlError` (error del action o de la URL).
- `AuthSubmitButton` label "Ingresar al Panel" / pending "Iniciando sesion...".
- Boton **"Continuar con Google"** (`type=button`, `onClick={startCoachGoogleLogin}`), separado por divisor "o ingresá con".
- Divisor "¿Nuevo en EVA?" + `Link` a `/register` ("Crear cuenta").

**Mecanica de envio:** el form usa `useActionState(loginAction, initialState)` para `formAction`, pero el `onSubmit` real pasa por `handleSubmit(onSubmit)` de react-hook-form. En `onSubmit(data)`:
```
const fd = new FormData()
fd.set('email', data.email)
fd.set('password', data.password)
if (data.captchaToken) fd.set('cf-turnstile-response', data.captchaToken)
React.startTransition(() => formAction(fd))
```
Es decir: validacion cliente con Zod primero; si pasa, se construye `FormData` manual y se dispara el server action dentro de una transicion. El token de Turnstile se manda en el campo `cf-turnstile-response`.

---

## 1.3. LOGIN — `loginAction` (server action)

Archivo: `login/_actions/login.actions.ts`. Es `'use server'`. Tipo de retorno `LoginState = { error?, success? }`. Mensaje de error unico y generico (anti-enumeracion de usuarios):

```
GENERIC_ERROR = 'No pudimos verificar tus credenciales. Revisá email y contraseña.'
```

**Flujo paso a paso (backend):**

1. **Parseo del FormData:** `email`, `password`, y `captchaToken` desde `cf-turnstile-response` (`|| undefined`).
2. **Validacion server con Zod:** `CoachLoginSchema.safeParse(raw)`. Si falla → `await jitter()` + `return { error: GENERIC_ERROR }`. (Doble validacion cliente+servidor, regla del proyecto.)
3. **Lectura de fallos:** `const failCount = await readFailCount('coach')`.
4. **CAPTCHA condicional:** si `failCount >= CAPTCHA_THRESHOLD` (3):
   - Lee la IP de headers: `x-forwarded-for` → `x-real-ip` → `null`.
   - `verifyTurnstile(captchaToken, ip, { failCount })`. Si **no** verifica → `jitter()` + `incrementFailCount('coach')` + `return GENERIC_ERROR`.
5. **Autenticacion:** `supabase.auth.signInWithPassword({ email, password })`. Si hay error → `jitter()` + `incrementFailCount('coach')` + `GENERIC_ERROR`.
6. **Recupera el user:** `supabase.auth.getUser()`. Si no hay user → `jitter()` + `GENERIC_ERROR`.
7. **Verifica que el user sea COACH:** consulta `coaches` por `id = user.id` (`maybeSingle`). Si **no** existe fila coach → `supabase.auth.signOut()` (¡cierra la sesion recien creada!) + `jitter()` + `GENERIC_ERROR`. Esto bloquea a alumnos/otros que intenten entrar por el login de coach.
8. **Exito:** `await clearFailCount('coach')` → resuelve destino con `resolvePostLoginRedirect(supabase, user.id)` → `revalidatePath(redirectPath)` → `redirect(redirectPath)`.

**Defensas anti-abuso integradas en el action:**
- `jitter()` (`lib/auth/timing.ts`): delay aleatorio 300-500ms en **todos** los caminos de error, para igualar la latencia del camino de exito y mitigar timing attacks / enumeracion.
- Contador de fallos por cookie (`lib/auth/fail-counter.ts`):
  - Cookie `eva_auth_fails`, `path=/login`, `httpOnly`, `secure` en prod, `sameSite=lax`, `maxAge = 15 min`.
  - `incrementFailCount` suma 1; `clearFailCount` la borra (`maxAge: 0`); `readFailCount` la lee.
  - `CAPTCHA_THRESHOLD = 3`: a partir de 3 fallos, la page muestra el captcha y el action lo exige.
- Mensaje generico unico: nunca distingue "email no existe" vs "password incorrecta" vs "no es coach".

> Gotcha de seguridad: la cookie de fallos tiene `path=/login`, por lo que solo viaja en requests a `/login`. El captcha se evalua tanto en el render (`page.tsx` lee `failCount`) como en el POST (`loginAction` lo re-lee).

---

## 1.4. Verificacion de Turnstile (`lib/auth/turnstile.ts`)

`verifyTurnstile(token, ip, { failCount, failOpenMax = 5 })` — edge-compatible (usa `fetch` global). Endpoint `https://challenges.cloudflare.com/turnstile/v0/siteverify`, timeout 3000ms con `AbortController`.

**Comportamiento (modo fail-open acotado):**
- Si `token` vacio/ausente → `false`.
- Si falta `TURNSTILE_SECRET_KEY` (env mal configurado) → fail-open: devuelve `failCount < failOpenMax` (permite hasta 5 fallos sin secret, para que dev/preview funcionen).
- POST con `secret`, `response`, opcional `remoteip`. Si `!res.ok` o excepcion/timeout → `failCount < failOpenMax` (fail-open hasta el tope, luego fail-closed para frenar abuso).
- Caso normal → `data.success === true`.

`getTurnstileSiteKey()` devuelve `NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null`.

---

## 1.5. CAPTCHA UI (`CaptchaSlot`)

`components/auth/CaptchaSlot.tsx`: si `siteKey` es null/undefined → `return null` (no renderiza nada). Si hay key, inyecta `<Script src=".../turnstile/v0/api.js" strategy="lazyOnload">` y un `<div class="cf-turnstile">` con `data-sitekey`, `data-theme`, `data-response-field-name` (default `cf-turnstile-response`, que coincide con el campo que lee el action) y `data-size="flexible"`. El widget de Turnstile rellena ese campo oculto que luego react-hook-form lee como `captchaToken`.

---

## 1.6. Mensajes de error por URL (`lib/auth/error-messages.ts`)

`getAuthErrorMessage(code, variant)` mapea `?error=<code>` a texto. Variantes: `'coach' | 'enterprise'`. Codigos (`AUTH_ERROR_CODES`):

| Codigo | Mensaje coach |
|--------|---------------|
| `auth_callback_failed` | "No se pudo completar el inicio de sesión con Google. Intentá de nuevo." |
| `confirmation_expired` | "El enlace de confirmación expiró. Solicitá uno nuevo." |
| `no_google_account` | "No encontramos una cuenta con ese correo de Google." |
| `session_expired` | "Tu sesión expiró. Iniciá sesión nuevamente." |
| `captcha_failed` | "No pudimos verificar el captcha. Reintentá." |
| (cualquier otro) | FALLBACK: "Ocurrió un error. Intentá de nuevo." |

Estos codigos los setea el flujo OAuth (`/auth/callback`, `/auth/exchange`) al redirigir de vuelta a `/login`.

---

## 1.7. LOGIN con Google (OAuth) — flujo completo

El boton "Continuar con Google" llama a `startCoachGoogleLogin` (`lib/auth/client-oauth.ts`, cliente):
```
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${origin}/auth/callback?next=/coach/dashboard` },
})
```
(Existe tambien `startCoachGoogleRegistration` que apunta a `/auth/register-callback`, usado en `/register`.)

**Cadena de redirecciones OAuth (login):**

1. Google → `/auth/callback?code=...&next=/coach/dashboard` (`auth/callback/route.ts`, GET):
   - Lee `code` y `next`. Si hay `code`, redirige a `/auth/exchange` con `oauth_code=<code>` (renombra `code`→`oauth_code` a proposito, para que el `detectSessionInUrl` de Supabase NO auto-dispare sobre `?code=`), `intent=login`, y propaga `next` si existe.
   - Sin `code` → `/login?error=auth_callback_failed`.
2. `/auth/exchange` (`AuthExchangeClient.tsx`, cliente, en `useEffect`):
   - Lee `oauth_code`, `intent` (default `login`), `next`.
   - Sin `code` → `/login?error=auth_callback_failed`.
   - `supabase.auth.exchangeCodeForSession(code)`. Si error/sin user → `/login?error=auth_callback_failed`.
   - **Open-redirect guard:** si hay `next` que empieza con `/` y NO con `//` → `window.location.replace(next)` (esto es lo que lleva al `/reset-password` en recovery por link OAuth).
   - Consulta `coaches` por `id = user.id` (`id, active_org_id`):
     - **Si existe coach:** si tiene `active_org_id`, resuelve `organization_members` + slug de la org. Luego `window.location.replace(getPostLoginRedirect({ isCoach: true, activeOrgSlug, activeOrgRole }))` (ver 1.8).
     - **Si NO existe coach e `intent=login`** → `/login?error=no_google_account` (no hay cuenta de coach con ese Google).
     - **Si NO existe coach e intent != login (registro)** → `window.location.replace('/register?from=google')`.

> Diferencia clave: el login con Google NO crea cuentas. Si el Google no tiene coach asociado y el intent es login, rebota con `no_google_account`. La creacion de coach por OAuth ocurre por el camino de registro (`/auth/register-callback` → `/auth/exchange?intent=register` → `/register?from=google` → eventualmente `/coach/onboarding/complete`).

**Creacion de cuenta coach via OAuth — `/coach/onboarding/complete`** (`completeOAuthOnboarding`, server action). Aunque el detonante esta en el registro, aqui se materializa la fila `coaches` para usuarios que llegaron por Google:
- `getUser()`; sin user → error "Sesión expirada...".
- Lee del form: `brand_name`, `full_name`, `subscription_tier` (default `free`), `billing_cycle` (default `monthly`), consentimientos `accept_legal`, `accept_health_data`, `accept_marketing`.
- Valida: brand ≥2 chars, full_name ≥2, `accept_legal` obligatorio, `accept_health_data` obligatorio (Ley 21.719 Art. 16), tier en `SALE_TIERS`, cycle en `['monthly','quarterly','annual']`, cycle valido para el tier.
- Email: `normalizePlatformEmail` + rechazo de `isDisposableEmail` (correos temporales).
- **Anti-abuso de trial:** consulta `coaches.trial_used_email = emailNorm`; si existe → "Ya existe una cuenta gratuita con este correo...".
- **Slug:** deriva de `brand_name` (lowercase, NFD sin tildes, no alfanum→`-`), rechaza `RESERVED_SLUGS` (admin, api, coach, login, register, pricing, eva, nike, gym, etc.), y resuelve colisiones con sufijo aleatorio (hasta 8 intentos).
- `generateUniqueInviteCode(adminDb)` (codigo de invitacion del coach).
- **Insert (service-role):** crea la fila `coaches` con `id = user.id`, `primary_color='#10B981'`, `subscription_status = isFreeTier ? 'active' : 'pending_payment'` (Google ya viene email-confirmed → free se activa de una), `subscription_tier`, `billing_cycle`, `payment_provider`, `max_clients = getTierMaxClients(tier)`, `health_data_consent_at`, `marketing_consent`, `onboarding_guide.invite_code_confirmed = true`, y `trial_used_email` solo si free.
- Redireccion: free → `/coach/dashboard?welcome=free`; pago → `/coach/subscription/processing?from=register&tier=...&cycle=...&plan=...[&coupon=...]` (saneando el cupon con `normalizeCouponCode`).

---

## 1.8. Redireccion post-login (a donde va el coach al entrar)

Dos piezas:

**`resolvePostLoginRedirect(supabase, userId)`** (`lib/auth/post-login-redirect.server.ts`) — orquesta DB:
1. `resolvePreferredWorkspace(supabase, userId)` → si hay workspace preferido persistido → `defaultWorkspaceHome(preferido)`.
2. `listUserWorkspaces(supabase, userId)`:
   - `> 1` workspaces → **`/workspace/select`** (selector).
   - `== 1` → `defaultWorkspaceHome(ese)`.
3. Si 0: consulta `coaches` (`id, active_org_id`) y `clients` (`id, coach_id, coaches(slug)`) en paralelo; resuelve membership de org si aplica; arma `PostLoginProfile` y delega en `getPostLoginRedirect`.

**`getPostLoginRedirect(profile)`** (funcion PURA, `lib/auth/post-login-redirect.ts`):
- org staff con slug → `/org/${slug}`
- `isCoach` → **`/coach/dashboard`**
- `clientCoachSlug` → `/c/${slug}/dashboard`
- fallback → `/login`

**`defaultWorkspaceHome(workspace)`** (`services/auth/workspace-route-guard.service.ts`):
- `enterprise_staff` → `/org/${slug}` (o `/org/login`)
- `coach_standalone | enterprise_coach | coach_team` → **`/coach/dashboard`**
- `student_team` → `/t/${slug}/dashboard`
- alumno con slug → `/c/${slug}/dashboard`
- fallback → `/login`

**Selector de workspace** (`workspace/select/page.tsx`): usa `getClaims()` (verificacion local del JWT, sin round-trip a `/user`). Si 0 workspaces → `/login`; si 1 → `setLastWorkspace` + redirige; si N → lista botones, cada uno un `<form action={selectWorkspaceAction}>` con `workspace_key` oculto. `selectWorkspaceAction` (`select.actions.ts`): `getUser()`, busca el workspace por key, `setLastWorkspace` (si falla → `/workspace/select?error=persist_failed`), y para workspaces de coach sincroniza `coaches.active_org_id` (service-role) + `refreshSession()` para re-emitir el JWT con el org correcto, luego redirige a `workspaceHome(workspace)`.

**Redireccion de usuarios ya autenticados desde `/login` (proxy.ts):** el proxy (`§4`, ~linea 1022) trata `/login`, `/register`, `/forgot-password` como auth pages: si hay `user` y es coach, resuelve `resolvePostLoginRedirect` y redirige fuera del login. **Excepcion:** `/reset-password` NO se incluye (necesita la sesion de recovery activa). Ademas, en `/coach/*` el proxy aplica guardas: sin user → `/login`; user sin fila coach → `/coach/onboarding/complete`; coach free con `subscription_status='pending_email'` → `/verify-email`; multi-workspace → `/workspace/select`.

---

## 1.9. RECUPERAR contrasena — `/forgot-password`

**Page (`forgot-password/page.tsx`, cliente):** `ForgotPasswordForm` con `useActionState(forgotPasswordAction)`. Lee de la URL `coach_slug` y `team_slug` para construir el `loginHref` de "Volver al inicio de sesion":
- `teamSlug` → `/t/${teamSlug}/login` (alumno de pool vuelve a su login white-label)
- `coachSlug` → `/c/${coachSlug}/login` (alumno standalone al login del coach)
- ninguno → **`/login`** (login del coach)

Estos slugs tambien se inyectan como `<input type=hidden>` en el form para que el action los reciba. Form: input email (`type=email`, `autoComplete=email`, `required`) + `SubmitButton` ("Enviar link de recuperación" / "Enviando..."). En `state.success` reemplaza el form por un panel de exito ("¡Email enviado!", "El link expira en 1 hora").

**`forgotPasswordAction` (server):**
1. Normaliza `formData`: `email`, y `coach_slug`/`team_slug` con `null ?? undefined` (formData.get devuelve null cuando no esta el campo).
2. Valida con `ForgotPasswordSchema`:
   ```
   email: z.string().trim().toLowerCase().email('Email inválido'),
   team_slug: z.string().nullish(),
   ```
   (Usa `.nullish()` a proposito; `.optional()` rechazaba el `null` de formData y rompia el reset de usuarios no-team.)
3. Construye `appUrl` desde el header `host` (protocolo `http` si localhost, si no `https`).
4. Arma `nextPath`: prioriza `team_slug` sobre `coach_slug` (para preservar la marca del pool); query `/reset-password?team_slug=...&coach_slug=...` o `/reset-password` pelado.
5. `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${appUrl}/auth/callback?next=<nextPath encoded> })`.
6. Error → `{ error: 'No se pudo enviar el email. Verifica que el correo sea correcto.' }`; exito → `{ success: true }`.

> El `redirectTo` apunta a `/auth/callback?next=/reset-password...`. Asi, al clickear el link, el `code` se intercambia por sesion en `/auth/exchange`, que detecta el `next` interno (guard open-redirect) y manda a `/reset-password` con la sesion de recovery viva.

---

## 1.10. RESTABLECER contrasena — `/reset-password`

**Page (`reset-password/page.tsx`, cliente):** `ResetPasswordForm` con `useActionState(resetPasswordAction)`. Re-lee `coach_slug`/`team_slug` de la URL (mismo `loginHref` que forgot) y los inyecta como hidden inputs. Dos campos: `password` (`type=password`, `required`, `minLength=8`, placeholder "Mínimo 8 caracteres") y `confirm_password` (`required`). `SubmitButton` "Establecer nueva contraseña" / "Guardando...".

**`resetPasswordAction` (server):**
1. Lee `password`, `confirm_password`, `coach_slug`, `team_slug`.
2. Valida con `ResetPasswordSchema`:
   ```
   password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
   confirm_password: z.string(),
   .refine(password === confirm_password, 'Las contraseñas no coinciden')
   ```
   (Minimo **8** aqui, vs 6 en login. Gotcha conocido del proyecto: Supabase con leaked-password protection puede rechazar PINs numericos puros con 422.)
3. `supabase.auth.updateUser({ password })` — usa la sesion de recovery activa (puesta por `/auth/exchange` o `/auth/confirm`).
4. Error → `{ error: 'Error al actualizar la contraseña. El link puede haber expirado.' }`.
5. Exito → `redirect` segun slug: `team_slug` → `/t/${team_slug}/login`; `coach_slug` → `/c/${coach_slug}/login`; ninguno → **`/login`**.

**Camino alternativo de recovery por `token_hash` — `/auth/confirm` (route GET):** maneja links tipo `?token_hash=...&type=recovery|email`:
- Sin `token_hash`/`type` → `/login?error=invalid_confirmation_link`.
- `verifyOtp({ token_hash, type })`; error → `/login?error=confirmation_expired`.
- `type='recovery'` → redirige al `next` interno (guard `/` y no `//`, default `/reset-password`) con la sesion ya activa.
- `type='email'` → activa el coach free pendiente (ver 1.11).

---

## 1.11. VERIFY-EMAIL — pantalla post-registro free

**Page (`verify-email/page.tsx`, cliente):** lee `?email=` de la URL. Muestra panel "Revisa tu email", indica que se envio un enlace de confirmacion a ese correo y que hay que clickearlo para "activar tu cuenta gratuita". Lista los beneficios free (3 alumnos sin costo, planes ilimitados, app personalizada, upgrade cuando quiera). Link "Volver al login" → `/login`. Esta pantalla es puramente informativa: NO hace backend, no reenvia, no valida; solo orienta.

**Backend que la respalda — `/auth/confirm` (type='email'):** cuando el coach free clickea el link de confirmacion de su email:
1. `verifyOtp({ token_hash, type:'email' })` (error → `/login?error=confirmation_expired`).
2. Con service-role consulta `coaches` (`id, subscription_status, subscription_tier, ...`).
3. Si `subscription_status === 'pending_email'` y `subscription_tier === 'free'`:
   - `UPDATE coaches SET subscription_status='active'`.
   - Dispara email de bienvenida (`buildFreeCoachWelcomeEmail`) y secuencia drip (`scheduleFreeCoachDripSequence`) — ambos `.catch(() => null)` (best-effort).
   - Redirige a `/coach/dashboard?welcome=free`.
4. Si no aplica (otro tipo de confirmacion) → `/coach/dashboard`.

> El proxy refuerza esto: un coach free con `subscription_status='pending_email'` que intente entrar a `/coach/*` es desviado a `/verify-email` hasta que confirme. Por eso esta pantalla es el estado de espera obligatorio del registro free por email/password.

---

## 1.12. Rate limiting (proxy.ts)

El rate-limit de los POSTs auth corre en `proxy.ts` ANTES del rewrite de subdominio enterprise (SEC-002). Para `request.method === 'POST'`:
- Si el `pathname` es `/login`, `/register`, `/forgot-password`, `/reset-password`, `/org/login`, `/c/[slug]/login`, `/e/[slug]/login`, `/t/[slug]/login` o `/t/[slug]/consent` → `rateLimitAuth(ip)`; si `!ok` → `jsonRateLimited(retryAfter)` (429).
- `/register` ademas: `rateLimitSignup(ip)` (limite mas estricto, 5/hora, anti-abuso free-tier).

La IP sale de `clientIpFromRequest(request)`. Asi, el login del coach esta protegido por dos capas: rate-limit por IP en el proxy (todos los POST a `/login`) + el contador de fallos por cookie con CAPTCHA condicional en el action.

---

## 1.13. Resumen de "que valida / autentica / persiste cada accion"

| Accion | Valida | Autentica / crea | Persiste | Redirige (exito) |
|--------|--------|------------------|----------|------------------|
| `loginAction` | `CoachLoginSchema` (email, pass ≥6) + Turnstile si ≥3 fallos | `signInWithPassword` + verifica fila `coaches` | sesion Supabase; limpia cookie de fallos | `resolvePostLoginRedirect` (`/coach/dashboard` \| `/workspace/select` \| `/org/...`) |
| `startCoachGoogleLogin` (OAuth) | — | `signInWithOAuth(google)` → callback/exchange; NO crea cuenta | sesion Supabase | `/coach/dashboard` o error `no_google_account` |
| `completeOAuthOnboarding` | brand/full ≥2, consentimientos, tier `SALE_TIERS`, cycle, email no-disposable, trial unico | inserta fila `coaches` (service-role) | `coaches` (slug, invite_code, tier, status, consents) | free → `/coach/dashboard?welcome=free`; pago → `/coach/subscription/processing` |
| `forgotPasswordAction` | `ForgotPasswordSchema` (email, team_slug nullish) | `resetPasswordForEmail` (envia email) | — (envia link a `/auth/callback?next=/reset-password`) | `{ success:true }` (panel) |
| `resetPasswordAction` | `ResetPasswordSchema` (pass ≥8 + match) | `updateUser({ password })` sobre sesion recovery | nueva password | `/login` \| `/c/[slug]/login` \| `/t/[slug]/login` |
| `/auth/confirm` (email) | `token_hash`+`type` | `verifyOtp` + activa coach free | `coaches.subscription_status='active'`; emails welcome/drip | `/coach/dashboard?welcome=free` |
| `selectWorkspaceAction` | workspace_key existe en lista | `getUser` | `last_workspace` pref + `coaches.active_org_id` + `refreshSession` | `workspaceHome(workspace)` |

> Principio transversal del modulo de acceso del coach: **mensaje de error generico** en login (anti-enumeracion), **jitter** en errores, **doble validacion Zod** cliente+servidor, **rate-limit por IP** + **CAPTCHA escalonado por cookie**, y **separacion estricta de identidad** (login de coach rechaza no-coaches con `signOut`). El acceso del coach es siempre EVA-brandeado; los slugs `coach_slug`/`team_slug` que aparecen en forgot/reset existen solo para devolver al ALUMNO a su login white-label, no afectan al coach (sin slug → `/login` EVA).
