# 2. Registro del coach (wizard 3 pasos)

Este es el embudo de adquisición del coach. La pantalla vive en `apps/web/src/app/(auth)/register/page.tsx` (`'use client'`, componente `RegisterPage`). Es **un solo formulario HTML** con tres "pasos" controlados por estado de cliente (`step: 1 | 2 | 3`) — no hay navegación por ruta entre pasos. La barra de progreso muestra `Paso ${step} de 3`. El acceso del coach es **siempre EVA-brandeado** (sin white-label): el color primario del botón es EVA y los colores de marca del coach no participan.

El formulario tiene **dos modos** que comparten el mismo wizard:

- **Modo email/password** (default): el `action` del `<form>` es `formAction`, ligado a `registerAction` vía `useActionState`.
- **Modo Google OAuth** (`fromGoogle === true`): el `action` es `googleFormAction`, ligado a `completeOAuthOnboarding` (importada de `@/app/coach/onboarding/complete/_actions/complete.actions`). Se activa cuando la URL trae `?from=google`.

```tsx
El formulario envia a `googleFormAction` (modo OAuth) o a `formAction` (email/password) segun el modo de alta.
```

Ambas server actions terminan con `redirect(...)`, así que el `state.error` solo se ve cuando hay validación fallida (no hay éxito que renderizar — el éxito es una redirección).

---

## 2.1 Estado del wizard y parámetros de URL (`useEffect` de montaje)

El componente mantiene estado local para todos los campos (`fullName`, `brandName`, `email`, `password`), el plan (`tier`), el ciclo (`billingCycle`), los add-ons (`selectedAddons: ModuleKey[]`), el cupón (`couponCode`, `couponFieldOpen`, `couponAutoApplied`), el flag `fromGoogle` y `clientError`.

Al montar (`useEffect(..., [])`) lee `window.location.search` y procesa varios query params:

| Param | Efecto |
|---|---|
| `?from=google` | Setea `fromGoogle = true` y llama `getCurrentOAuthUserProfile()` para pre-rellenar `fullName` y `email` desde la sesión OAuth ya creada. |
| `?codigo=` (o `?coupon=`) | Auto-aplica cupón: normaliza a `UPPER` sin espacios/guiones, abre el campo (`couponFieldOpen = true`) y marca `couponAutoApplied = true`. Camino primario del deal (link privado tipo `?codigo=PARTNER20`). |
| `?tier=` | Selecciona el plan. `starter_lite` se normaliza a `starter`. Si el valor **no** es un `SaleTier` (`isSaleTier`), degrada a `'starter'` (un link viejo con `?tier=growth/scale` cae a `starter`). |
| `?cycle=` | Selecciona la frecuencia si está en `BILLING_CYCLE_CONFIG` **y** es permitida para el tier (`isBillingCycleAllowedForTier`); si no, usa `getDefaultBillingCycleForTier`. |

Dos `useEffect` adicionales mantienen coherencia reactiva:

- Si el ciclo deja de ser válido para el tier elegido, lo resetea al default del tier.
- **Purga de add-ons**: si el tier es `free`, vacía `selectedAddons`. Si el tier no tiene nutrición (`getTierCapabilities(tier).canUseNutrition === false`), remueve `nutrition_exchanges` de la selección (regla D8).

El tier inicial por defecto en estado es `'starter'` y el ciclo `'monthly'`.

---

## 2.2 Paso 1 — Datos de cuenta

Campos visibles según modo:

**Modo email/password** (los 4 son `required` en HTML):
- `full_name` — Nombre completo (`<input>` controlado, ícono `User`).
- `brand_name` — Nombre de tu marca (placeholder "Ej: JotaP Fitness"). Texto aclara que el enlace para alumnos se genera con un **código único** (el `invite_code`).
- `email` — `type="email"`, `autoComplete="email"`.
- `password` — `type="password"`, `autoComplete="new-password"`, `minLength={8}`.

**Modo Google OAuth** (`fromGoogle === true`):
- Muestra un badge "Cuenta Google: **{email}**" (no editable).
- `full_name` y `brand_name` siguen pidiéndose (el `full_name` viene pre-rellenado desde Google, pero el `brand_name` lo escribe el coach).
- **No** se muestran email ni password (la identidad ya la prueba Google).
- Truco de naming: en modo Google, los `<input>` visibles de `full_name`/`brand_name` tienen `name={undefined}` y los valores se envían vía `<input type="hidden">` separados (líneas 237-242) — para que la action lea el valor del estado, no del input nativo.

### Campos ocultos siempre presentes en el `<form>`

```tsx
<input type="hidden" name="subscription_tier" value={tier} />
<input type="hidden" name="billing_cycle" value={billingCycle} />
<input type="hidden" name="addons" value={addonsCsv} />        // CSV de selectedAddons
<input type="hidden" name="coupon_code" value={couponCode} />
```

### Honeypot anti-bot

```tsx
<input name="website" type="text" tabIndex={-1} autoComplete="off"
  style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
  aria-hidden="true" />
```

Campo `website` oculto fuera de pantalla. Los bots lo rellenan; los humanos no. La server action rechaza el registro si viene con valor (ver §2.6).

### Validación client-side al avanzar (`nextStep`)

Antes de pasar de paso 1 a 2 (botón "Continuar", `type="button"`):

- Modo Google: exige `fullName` y `brandName` (no email/password). Error: "Completá tu nombre y nombre de marca antes de continuar."
- Modo email: exige `fullName`, `brandName`, `email` y `password.length >= 8`. Error: "Completa tus datos antes de continuar al paso de plan y pago."

Esto es solo un guard de UX; la validación dura ocurre server-side.

---

## 2.3 Paso 2 — Plan, ciclo, módulos y cupón

### Elección de tier

Renderiza solo los `SALE_TIERS` (`['free', 'starter', 'pro', 'elite']`) — `growth`/`scale` están fuera de venta (grandfathered). Cada tarjeta es un `<button type="button" onClick={() => setTier(key)}>`. Catálogo y precios desde `@eva/tiers` (re-exportado por `@/lib/constants`):

| Tier | `maxClients` | `monthlyPriceClp` | Nutrición | Branding |
|---|---|---|---|---|
| `free` | 3 | 0 | No | No |
| `starter` | 10 | 19.990 | No | No |
| `pro` (Más popular) | 30 | 29.990 | Sí | Sí |
| `elite` | 100 | 44.990 | Sí | Sí |

Cada tarjeta muestra: label, badge "Gratis para siempre" (free) o "Más popular" (pro), badge de nutrición (`getTierNutritionSummary`), "Hasta N alumnos · {cycleText}" (`getTierBillingCycleSummary`), y precio (free = "$0 · Sin tarjeta"; otros = precio del ciclo default vía `getTierPriceClp(key, defaultCycle)`).

### Frecuencia de pago (ciclo)

Solo se muestra si el tier tiene más de un ciclo permitido (`allowedCycleOptions.length > 1`; free tiene `[]` así que se oculta). Opciones desde `BILLING_CYCLE_CONFIG`:

| Ciclo | `months` | `discountPercent` |
|---|---|---|
| `monthly` | 1 | 0% |
| `quarterly` | 3 | 10% |
| `annual` | 12 | 20% |

Precio por ciclo (`getTierPriceClp`): mensual = `monthlyPriceClp`; trimestral = `round(monthly × 3 × 0.9)`; anual = `round(monthly × 12 × 0.8)`.

### Add-ons / Módulos opcionales

Solo aparece si `!isFreeTier && SELF_SERVICE_ADDONS_ENABLED`. Esa constante es:

```ts
export const SELF_SERVICE_ADDONS_ENABLED =
    process.env.NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED === 'true'
```

Fail-closed (build-time inlined; flip exige redeploy). Catálogo desde `ADDON_CONFIG` (`ADDON_MODULE_KEYS` = `MODULE_KEYS`), precio uniforme `ADDON_MONTHLY_PRICE_CLP = 9990` /mes para los 4 módulos:

| `ModuleKey` | Label |
|---|---|
| `cardio` | Cardio |
| `movement_assessment` | Evaluación de movimiento |
| `body_composition` | Composición corporal |
| `nutrition_exchanges` | Nutrición Pro |

`nutrition_exchanges` se **deshabilita** (checkbox `disabled`) si el tier no tiene nutrición, con aviso "Requiere un plan con nutrición (Pro o superior)" (regla D8). El total en vivo se calcula client-side:

```ts
addonsCycleTotal = Σ round(ADDON_CONFIG[key].priceClpMensual × months × (1 - discountPercent/100))
liveTotal = selectedPrice + addonsCycleTotal
```

Cuando hay add-ons seleccionados, también muestra las **5 reglas de cobro** (`getAddonPaymentRulesForCycle(billingCycle)` desde `ADDON_PAYMENT_RULES`, variantes por ciclo: activación inmediata, cobro/prorrateo, compromiso mínimo de 1 ciclo, cancelación sin reembolso de fracciones, precios de lista) — evidencia de consentimiento informado SERNAC (Ley 19.496).

### Código de descuento (cupón)

Campo colapsable (`couponFieldOpen`). Camino primario = link `?codigo=` que lo auto-aplica. Tres estados de UI:
1. Cerrado: link "¿Tenés un código de descuento?".
2. Auto-aplicado: mensaje "Código {X} aplicado. Verás el descuento con su detalle antes de pagar."
3. Manual: `<input>` que normaliza a `UPPER` sin espacios/guiones; aviso "El descuento se confirma con su detalle antes del primer cobro."

**Importante**: el cupón NO se canjea en el registro. Solo se sanea y se threadea como query param a `/coach/subscription/processing`, donde ocurren el canje + disclosure SERNAC + consentimiento, antes del primer cobro.

---

## 2.4 Paso 3 — Resumen antes de pagar

Sección de resumen (`isFreeTier ? 'Tu plan gratuito' : 'Resumen antes de pagar'`) con desglose:

- **Plan**: `selectedTier.label`.
- **Alumnos**: "Hasta {maxClients}".
- **Facturación** (solo pago): `BILLING_CYCLE_CONFIG[billingCycle].label`.
- **Nutrición**: "Incluida" / "No incluida" (`getTierCapabilities(tier).canUseNutrition`).
- **Módulos** (solo pago, si hay): lista de labels + `$addonsCycleTotal CLP`.
- **Total a pagar** / **Costo**: free = "$0 — Gratis"; pago = `$liveTotal CLP`.

Free: nota "Sin tarjeta de crédito. Acceso inmediato. Podés hacer upgrade…". Pago: "Al crear tu cuenta, te llevaremos directamente al checkout de MercadoPago…".

### Consentimientos legales (renderizados en todos los pasos, validados al submit)

El bloque de checkboxes está fuera del `step === 3 ? ...` (siempre en el DOM), justo antes de los botones:

1. **`accept_legal`** (`required`) — términos de servicio (`/legal`) + política de privacidad (`/privacidad`). Obligatorio.
2. **`accept_health_data`** (`required`) — tratamiento de datos de salud de los alumnos (entrenamiento, nutrición, métricas corporales) conforme a la **Ley 21.719** (Art. 16). Obligatorio.
3. **`accept_marketing`** (opcional, **unchecked por default**) — opt-in de novedades/ofertas por email.

### CAPTCHA — Cloudflare Turnstile

Se carga el script solo si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` existe:

```tsx
{process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
  <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
)}
```

Y el widget invisible (`data-appearance="interaction-only"`) que inyecta un campo `cf-turnstile-response` en el form. La verificación dura es server-side (§2.6).

### Submit

Botón final `SubmitButton` (`type="submit"`, usa `useFormStatus` → "Creando tu cuenta..."). Texto: free = "Crear mi cuenta gratuita"; pago = "Crear Cuenta". En pasos 1-2 el botón es "Continuar" (`type="button"` → `nextStep`); botón "Atrás" (`prevStep`) aparece desde el paso 2.

---

## 2.5 Google OAuth — flujo completo

Definido en `apps/web/src/lib/auth/client-oauth.ts` (`'use client'`):

- **`startCoachGoogleRegistration()`**: llama `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${origin}/auth/register-callback\` } })`. Se dispara desde el botón "Registrarse con Google" (oculto cuando ya estás en `fromGoogle`).
- **`getCurrentOAuthUserProfile()`**: `supabase.auth.getUser()` y devuelve `{ email, fullName }` (lee `user_metadata.full_name ?? user_metadata.name`). Lo usa el `useEffect` de montaje para pre-rellenar.

Cadena de redirecciones tras consentir en Google:

1. Google → `/auth/register-callback` (`route.ts`, GET). Toma `?code`, lo reenvía a `/auth/exchange?oauth_code={code}&intent=register`. Sin code → `/register?error=auth_callback_failed`.
2. `/auth/exchange` (`AuthExchangeClient.tsx`, client) hace `exchangeCodeForSession(code)`. Luego:
   - Si ya existe fila en `coaches` para ese `user.id` → redirige al post-login (`getPostLoginRedirect`) — coach ya registrado.
   - Si **no** existe coach y `intent === 'register'` → `window.location.replace('/register?from=google')`.
   - (Con `intent` de login y sin coach → `/login?error=no_google_account`.)
3. De vuelta en `/register?from=google`, el wizard corre en modo Google. El `submit` invoca `completeOAuthOnboarding` (no `registerAction`).

> Nota: la página `/coach/onboarding/complete/page.tsx` existe y renderiza `CompleteOnboardingForm`, pero el flujo OAuth desde el botón de registro vuelve a `/register?from=google`, no a esa página. Ambos caminos comparten la **misma** server action `completeOAuthOnboarding`.

---

## 2.6 `registerAction` — cómo se crea la cuenta (ÉNFASIS BACKEND)

Archivo: `apps/web/src/app/(auth)/register/_actions/register.actions.ts` (`'use server'`). Firma: `registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState>` donde `RegisterState = { error?: string }`.

### Lectura de campos

Lee del `FormData`: `full_name`, `email`, `password`, `brand_name`, `accept_legal`, `accept_health_data`, `accept_marketing` (`=== 'on'`), `subscription_tier` (default `'starter'`), `billing_cycle` (default `'monthly'`), `addons` (CSV crudo), `website` (honeypot), `coupon_code`.

### Orden exacto de validaciones (cada una hace `return { error }`)

1. **Honeypot**: si `website` tiene valor → `{ error: 'Algo salió mal. Intentá de nuevo en unos minutos.' }`.
2. **Turnstile** (solo si `process.env.TURNSTILE_SECRET_KEY` existe): exige `cf-turnstile-response`; si falta → error de verificación; hace `POST` a `https://challenges.cloudflare.com/turnstile/v0/siteverify` con `{ secret, response }`; si `success !== true` → "Verificación de seguridad fallida."
3. **Campos obligatorios**: `fullName/email/password/brandName` → "Todos los campos son obligatorios".
4. **Password** `< 8` → "La contraseña debe tener al menos 8 caracteres".
5. **`acceptLegal`** falsy → error de términos.
6. **`acceptHealthData`** falsy → error Ley 21.719 Art. 16.
7. **Tier/ciclo válidos**: `VALID_TIERS = SALE_TIERS`, `VALID_CYCLES = ['monthly','quarterly','annual']`. Si alguno inválido → "Debes seleccionar un plan y una frecuencia válidos."
8. **Ciclo permitido para tier** (solo pago): `!isBillingCycleAllowedForTier(...)` → error.

### Generación de slug

```ts
baseSlug = brandName.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g,'')           // quita diacríticos
  .replace(/[^a-z0-9]+/g,'-')
  .replace(/^-|-$/g,'')
```

Si `baseSlug` está en `RESERVED_SLUGS` (admin, api, coach, register, login, eva, www, nike, adidas, crossfit, gym, etc.) → "Este nombre de marca no está disponible."

### Rate-limit anti-abuso (solo free tier)

Antes de crear nada, con `adminDb = createServiceRoleClient()`: lee la IP con `clientIpFromRequest({ headers })` (orden de precedencia: `cf-connecting-ip` → `x-forwarded-for[0]` → `x-real-ip` → `'unknown'`). Cuenta cuántas filas `coaches` con `subscription_tier='free'` y misma `registration_ip` se crearon en los **últimos 7 días**. Si `>= 3` → "No se pudo completar el registro… contacta soporte." (Máximo **3 cuentas gratis por IP cada 7 días**.)

### Unicidad de slug e invite_code

- Slug: hasta 8 intentos; si `slug` ya existe en `coaches`, prueba `${baseSlug}-${random 6 chars}`; si tras 8 falla → error.
- `inviteCode = await generateUniqueInviteCode(adminDb)`: genera un código de 5 chars del alfabeto sin ambigüedad (`generateInviteCode`, alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, patrón `/^[A-Z2-9]{5}$/`), reintenta hasta 20 veces contra `coaches.invite_code`. El `invite_code` es el identificador público primario del coach (su enlace de alumnos).

### Disponibilidad de email en TODA la plataforma

```ts
emailSan  = sanitizePlatformEmail(email)    // trim + lowercase (conserva dots/+alias)
emailNorm = normalizePlatformEmail(email)   // dedup: gmail sin dots, sin +alias
availability = await assertPlatformEmailAvailable(adminDb, email)
```

`assertPlatformEmailAvailable` (`@/lib/auth/platform-email`):
- Rechaza dominio bloqueado (`eva-app.cl`) → "Este dominio de correo no está permitido para registro."
- Rechaza emails desechables (`isDisposableEmail`, set de ~120 dominios temp: mailinator, guerrillamail, yopmail, 10minutemail, etc.) → "Los correos temporales o desechables no están permitidos."
- Llama al RPC SECURITY DEFINER `check_platform_email_availability(p_email)`, que devuelve `{ exists_in_auth, is_coach, is_client, orphan_client_email }` (matchea por email normalizado contra `auth.users` y, si no, contra `clients.email`). Si `exists_in_auth || orphan_client_email` → email tomado (`PLATFORM_EMAIL_TAKEN_ES`). Esto bloquea registrar un coach con un email que ya es de un alumno (orphan client).

### Creación del usuario auth

```ts
adminDb.auth.admin.createUser({ email: emailSan, password, email_confirm: !isFreeTier })
```

- **Free**: `email_confirm: false` → requiere verificación de email.
- **Pago**: `email_confirm: true` → auto-confirmado (el pago es prueba de identidad).

Si falla: si el mensaje matchea `isAuthDuplicateEmailMessage` (varios patrones "already registered"/"duplicate"/"unique email") → "Este correo ya está registrado en la plataforma…"; si no → mensaje crudo de auth o "Error al crear la cuenta".

### Inserción de la fila `coaches`

Tras crear el auth user (solo en free recaptura la IP en `registrationIp`), inserta en `coaches` con `adminDb` (service-role, porque `coaches` es compra-only / escritura columnar restringida):

```ts
{
  id: authData.user.id,                       // misma PK que auth.users
  full_name, brand_name, slug, invite_code,
  primary_color: '#10B981',                   // BRAND_PRIMARY_COLOR (EVA), no white-label
  subscription_status: isFreeTier ? 'pending_email' : 'pending_payment',
  subscription_tier: selectedTier,
  billing_cycle: isFreeTier ? 'monthly' : selectedBillingCycle,
  payment_provider: isFreeTier ? 'admin' : (process.env.PAYMENT_PROVIDER ?? 'mercadopago'),
  max_clients: getTierMaxClients(selectedTier),
  health_data_consent_at: now,
  marketing_consent: acceptMarketing,
  onboarding_guide: { invite_code_confirmed: true, invite_code_confirmed_at: now },
  ...(isFreeTier && { trial_used_email: emailNorm }),   // anti-reuso de free trial
  ...(registrationIp && { registration_ip: registrationIp }),
}
```

Detalles backend clave:
- El `coaches.id` **es** el `auth.users.id` (la fila auth es la PK).
- `subscription_status` free arranca en `'pending_email'` (NO `'active'`): el welcome + drip se disparan recién al confirmar el email en `/auth/confirm` (mismo comportamiento que el path mobile; insertar `'active'` aquí saltaría welcome/drip).
- `onboarding_guide.invite_code_confirmed: true` salta el modal legacy (`PublicCodeRequiredModal`), porque el coach ya conoce su código.
- `trial_used_email` (email normalizado) se setea solo en free para detectar reuso del trial.

**Rollback transaccional manual**: si la inserción en `coaches` falla, se borra el auth user (`adminDb.auth.admin.deleteUser`) y se devuelve el error — no quedan usuarios huérfanos.

### Bifurcación final (free vs pago)

**FREE** → verificación de email:
```ts
const emailSent = await sendCoachSignupConfirmationEmail({ email: emailSan, password, coachName: fullName })
```
`admin.createUser` no dispara emails de Supabase, así que se genera un link OTP de tipo `signup` (`admin.auth.admin.generateLink`, `redirectTo: ${appUrl}/auth/confirm`) y se entrega vía Resend (`buildCoachEmailConfirmationEmail` → `confirmUrl = /auth/confirm?token_hash=...&type=email`). Si el envío falla, **rollback completo**: borra la fila `coaches` y el auth user, y devuelve "No pudimos enviar el correo de confirmación…". Si OK:
```ts
redirect(`/verify-email?email=${encodeURIComponent(emailSan)}`)
```
(El welcome + drip se disparan después, en `/auth/confirm`.)

**PAGO** → checkout MercadoPago:
```ts
const supabase = await createClient()
await supabase.auth.signInWithPassword({ email: emailSan, password })  // login inmediato (email ya confirmado)
```
Sanea los add-ons (solo `MODULE_KEYS` válidos; `nutrition_exchanges` solo si el tier tiene nutrición; dedupe con `Set`). Sanea el cupón con `normalizeCouponCode` (UPPER, sin espacios/guiones) — **no lo canjea**, solo lo threadea. Redirige a la pantalla de procesamiento que arranca el checkout:
```ts
redirect(`/coach/subscription/processing?from=register&tier=${tier}&cycle=${cycle}&plan=${cycleLabel}${addonsParam}${couponParam}`)
```
El **monto se calcula SOLO server-side** en `create-preference` (esta action no decide precio, solo qué módulos/tier/ciclo/cupón viajan). El primer cobro y el canje del cupón + disclosure SERNAC ocurren en `/coach/subscription/processing` → MercadoPago.

---

## 2.7 `completeOAuthOnboarding` — registro vía Google (diferencias backend)

Archivo: `apps/web/src/app/coach/onboarding/complete/_actions/complete.actions.ts` (`'use server'`). Misma forma (`CompleteOnboardingState = { error?: string }`), pero la identidad ya existe (sesión OAuth).

Diferencias frente a `registerAction`:
- Obtiene el usuario de la sesión: `supabase.auth.getUser()`; sin user → "Sesión expirada. Volvé a iniciar sesión con Google."
- Lee `brand_name`, `full_name`, `subscription_tier` (default `'free'` aquí), `billing_cycle`, `accept_legal`, `accept_health_data`, `accept_marketing`. **No** pide ni valida password (Google la maneja). **No** corre honeypot ni Turnstile.
- Validaciones: `brandName >= 2`, `fullName >= 2`, `acceptLegal`, `acceptHealthData`, tier en `VALID_TIERS`, ciclo en `VALID_CYCLES`, y ciclo permitido para tier.
- Email viene de `user.email` (Google); rechaza desechable (`isDisposableEmail`).
- **Anti-abuso de free trial por email normalizado**: consulta `coaches.trial_used_email === emailNorm`; si existe → "Ya existe una cuenta gratuita con este correo." (No usa el rate-limit por IP; usa la unicidad del email normalizado.)
- Slug + `invite_code`: misma lógica que `registerAction`.
- Inserción `coaches` con `id: user.id`. Diferencia crítica: para **free**, `subscription_status: 'active'` (no `'pending_email'`) — la cuenta Google ya está email-confirmada, así que es activa de inmediato. `payment_provider: isFreeTier ? 'admin' : mercadopago`.
- Bifurcación:
  - **Free** → `redirect('/coach/dashboard?welcome=free')` (acceso inmediato, sin pantalla de verificación).
  - **Pago** → sanea cupón (`normalizeCouponCode`) y `redirect('/coach/subscription/processing?from=register&tier=...&cycle=...&plan=...&coupon=...')`. (Esta action **no** threadea add-ons en el redirect — solo el cupón.)

---

## 2.8 Resumen del contrato de creación de cuenta

| Aspecto | Free | Pago (starter/pro/elite) |
|---|---|---|
| Auth user | `createUser({ email_confirm: false })` | `createUser({ email_confirm: true })` |
| `subscription_status` (email) | `pending_email` | `pending_payment` |
| `subscription_status` (Google) | `active` | `pending_payment` |
| `payment_provider` | `admin` | `mercadopago` (o `PAYMENT_PROVIDER`) |
| `trial_used_email` | sí (normalizado) | no |
| Anti-abuso | 3 free/IP/7 días (email) · email normalizado (Google) | — |
| Cupón | no aplica | threadeado a `/processing` (canje allá) |
| Add-ons | no | sanitizados + threadeados (solo `registerAction`) |
| Destino | `/verify-email` (email) · `/coach/dashboard?welcome=free` (Google) | `/coach/subscription/processing` → MercadoPago |
| Rollback | borra coach + auth user si falla insert o envío de email | borra auth user si falla insert |

Todas las escrituras a `coaches`/`auth` usan `createServiceRoleClient()` (bypass RLS — `coaches` es compra-only y columnar-restringida). El cliente de sesión (`createClient`) solo se usa para el `signInWithPassword` del path pago.
