# 3. Onboarding post-OAuth e intercambio de token

Esta seccion cubre los dos eslabones que cierran el alta del coach por Google (sin contraseña): la pagina transitoria **`/auth/exchange`** (canjea el codigo OAuth por sesion y enruta al destino correcto) y el **paso final de onboarding** en **`/coach/onboarding/complete`** (el coach completa nombre/marca, elige plan + ciclo, acepta legales y se crea la fila `coaches` o se lo manda al flujo de pago).

Orden cronologico real del flujo: el usuario aprieta "Continuar con Google" → Google redirige al callback de Supabase → callback route (`/auth/callback` o `/auth/register-callback`) → **`/auth/exchange`** (canje del codigo) → si NO existe coach y la intencion es `register` → **`/coach/onboarding/complete`** → server action `completeOAuthOnboarding` → dashboard (free) o `/coach/subscription/processing` (pago).

---

## 3.1. AUTH/EXCHANGE — intercambio del codigo OAuth por sesion

### 3.1.1. Archivos y forma del componente

- **`apps/web/src/app/auth/exchange/page.tsx`** — Server Component minimo. Solo renderiza `<AuthExchangeClient />`. No hace fetching, no valida, no redirige en servidor. Todo el trabajo es client-side.
- **`apps/web/src/app/auth/exchange/AuthExchangeClient.tsx`** — `'use client'`. Exporta `AuthExchangeClient`, que envuelve `<ExchangeInner />` en un `<Suspense>` (necesario porque `ExchangeInner` usa `useSearchParams()`, que en Next requiere boundary de Suspense). El fallback de Suspense es solo un spinner (`Loader2`).

El intercambio es **client-side a proposito**: el SDK de Supabase del navegador (`createClient` de `@/lib/supabase/client`) hace `exchangeCodeForSession`, lo que escribe las cookies de sesion en el cliente. La logica vive en el `useEffect` de `ExchangeInner`.

### 3.1.2. Como llega el codigo aca (callbacks que alimentan /auth/exchange)

`/auth/exchange` NO es el callback que Google llama directamente. Lo alimentan dos route handlers que reciben el `?code=` de Supabase y lo re-emiten como `?oauth_code=` hacia `/auth/exchange`:

- **`apps/web/src/app/auth/callback/route.ts`** (intencion **login**):
  1. Lee `code` y `next` del query.
  2. Si hay `code`: construye `${origin}/auth/exchange`, setea `oauth_code = code`, **`intent = 'login'`**, y si vino `next` lo reenvia (`next=/reset-password` en los links de recuperacion de contraseña). Redirige (302) a esa URL.
  3. Si NO hay `code`: redirige a `/login?error=auth_callback_failed`.
- **`apps/web/src/app/auth/register-callback/route.ts`** (intencion **register**):
  1. Lee `code`.
  2. Si hay `code`: construye `${origin}/auth/exchange` con `oauth_code = code` e **`intent = 'register'`** (no propaga `next`). Redirige.
  3. Si NO hay `code`: redirige a `/register?error=auth_callback_failed`.

> **Gotcha de naming documentado en el codigo** (`auth/callback/route.ts:13`): se usa `oauth_code` y **no** `code` a proposito, porque `detectSessionInUrl` del SDK de Supabase auto-dispara el canje al ver `?code=` en la URL. Renombrarlo evita que el SDK lo canjee dos veces. El canje real lo controla `ExchangeInner` con el nombre custom.

### 3.1.3. Logica de `ExchangeInner` (el canje y el enrutado)

Dentro del `useEffect` (corre una vez al montar, deps `[router, searchParams]`):

1. **Lee params**: `code = oauth_code`, `intent = intent ?? 'login'`. Deriva `isLoginIntent = intent !== 'register'` (cualquier valor distinto de `'register'` se trata como login → fail-safe hacia login).
2. **Guard sin codigo**: si no hay `code` → `router.replace('/login?error=auth_callback_failed')` y corta.
3. **Canje PKCE**: `supabase.auth.exchangeCodeForSession(code)`. Este es el paso que convierte el `code` del flujo OAuth (PKCE) en una sesion: setea las cookies de auth. Es asincrono (`.then(async ...)`).
   - Si `error` o `!data.user` → `router.replace('/login?error=auth_callback_failed')` y corta.
4. **Open-redirect guard + `next`**: lee `next` del query. Si `next` empieza con `/` y **NO** empieza con `//` (anti open-redirect cross-origin), hace `window.location.replace(next)` y corta. Esto es lo que lleva al usuario a `/reset-password` tras un link de recuperacion, en vez de aplicar el redirect default de post-login.
5. **Lookup del coach**: consulta `coaches` por `id = data.user.id`, seleccionando `id, active_org_id` (`maybeSingle`).
   - **Coach existe** → resuelve org activa: si `coach.active_org_id` no es null, consulta `organization_members` (`role, organizations(slug)`) filtrando por `org_id`, `user_id`, `status = 'active'`, `deleted_at IS NULL`. De ahi saca `activeOrgSlug` y `activeOrgRole`. Luego `window.location.replace(getPostLoginRedirect({ isCoach: true, activeOrgSlug, activeOrgRole }))`.
   - **Coach NO existe** y **`isLoginIntent`** (intentaba loguearse con Google pero no tiene cuenta) → `router.replace('/login?error=no_google_account')`. (Mensaje: "no tenes cuenta con ese Google").
   - **Coach NO existe** y **intencion register** → `window.location.replace('/register?from=google')`.

> Nota: el camino "register, sin coach" NO va directo a `/coach/onboarding/complete` desde aca: re-entra a `/register?from=google`. Es la pagina de registro la que (con la sesion OAuth ya seteada por el canje) reenvia el flujo `from=google` al paso `/coach/onboarding/complete`. `ExchangeInner` solo garantiza la sesion y separa "coach existente" de "alta nueva".

### 3.1.4. `getPostLoginRedirect` (destino del coach existente)

`apps/web/src/lib/auth/post-login-redirect.ts`. Recibe un `PostLoginProfile` (`@/domain/auth/types`) y devuelve la ruta:

- Si `activeOrgSlug` y el rol es staff de enterprise (`isEnterpriseStaffRole(activeOrgRole)`) → `/org/${activeOrgSlug}`.
- Si `isCoach` → **`/coach/dashboard`** (caso normal del coach standalone).
- Si `clientCoachSlug` → `/c/${clientCoachSlug}/dashboard` (no aplica en este flujo coach).
- Fallback → `/login`.

Para el alta de coach standalone tipica, el destino es `/coach/dashboard`.

### 3.1.5. Resumen de redirects de `/auth/exchange`

| Condicion | Destino | Metodo |
|---|---|---|
| Sin `oauth_code` | `/login?error=auth_callback_failed` | `router.replace` |
| Canje falla (`error`/`!user`) | `/login?error=auth_callback_failed` | `router.replace` |
| `next` interno valido (ej. recuperacion) | el `next` (ej. `/reset-password`) | `window.location.replace` |
| Coach existe (sin org) | `/coach/dashboard` | `window.location.replace` |
| Coach existe (org staff) | `/org/${slug}` | `window.location.replace` |
| No-coach + intent register | `/register?from=google` | `window.location.replace` |
| No-coach + intent login | `/login?error=no_google_account` | `router.replace` |

> Patron a notar: para destinos autenticados se usa **`window.location.replace`** (hard navigation, fuerza recarga del servidor con las cookies recien seteadas) y para los errores **`router.replace`** (client nav). Esto evita estados de sesion stale en el primer render del dashboard.

---

## 3.2. COMPLETE ONBOARDING — `/coach/onboarding/complete`

Es el ultimo paso del alta por Google: el usuario ya tiene **sesion OAuth viva** (email confirmado por Google, sin contraseña) pero **aun no existe la fila `coaches`**. Aca completa el perfil, elige plan/ciclo, acepta legales, y se crea la cuenta (free) o se lo manda al pago.

### 3.2.1. Pre-carga de datos — `complete.queries.ts`

**`apps/web/src/app/coach/onboarding/complete/_data/complete.queries.ts`**

- `getCompleteOnboardingUser` — `cache(async () => ...)` (React.cache). Crea `createClient()` (cliente server con cookies) y hace **`supabase.auth.getUser()`**, devolviendo el `user` completo.
- Comentario explicito en el codigo: usa `getUser()` y **no** `getClaims()` a proposito, porque el onboarding necesita el **perfil completo** (`email` + `user_metadata` del provider Google), no solo el `id` del JWT. Es de baja frecuencia (corre 1 vez al signup), asi que el round-trip a GoTrue se justifica.

Esto es **toda** la pre-carga: el unico dato pre-cargado es el `user` de la sesion OAuth. Del `user` se deriva un nombre default (ver page.tsx).

### 3.2.2. La pagina — `page.tsx`

**`apps/web/src/app/coach/onboarding/complete/page.tsx`** (Server Component):

1. `user = await getCompleteOnboardingUser()`.
2. **Guard de sesion**: si `!user` → `console.error('[onboarding/complete] no user in server session → redirecting to /login')` y `redirect('/login')`. (Sin sesion OAuth no se puede onboardear.)
3. Loguea `[onboarding/complete] user ok:` con `user.id` y `user.email` (observabilidad del embudo).
4. **Nombre default**: toma `user.user_metadata.full_name` o, si no, `user.user_metadata.name`, o `''`. Esto pre-rellena el campo "Nombre completo" con lo que Google entrego.
5. Renderiza `<CompleteOnboardingForm defaultName={defaultName} />`.

> No hay guard "ya sos coach" en esta pagina: si un coach ya existente cae aca, el guard real esta en la server action (el insert a `coaches` chocaria por PK `id`, ver 3.2.4). El flujo normal evita esto porque `ExchangeInner` enruta a coaches existentes directo al dashboard.

### 3.2.3. El formulario — `CompleteOnboardingForm.tsx`

**`apps/web/src/app/coach/onboarding/complete/_components/CompleteOnboardingForm.tsx`** (`'use client'`). Solo describo la **mecanica funcional** (sin estilos):

**Estado y wiring de formulario:**
- `useActionState(completeOAuthOnboarding, initialState)` → `[state, formAction]`. `state.error` es el unico campo del estado (`CompleteOnboardingState = { error?: string }`); se muestra como bloque de error si esta presente.
- `useState` para `tier` (default `'free'`) y `billingCycle` (default `'monthly'`).
- `tier` y `billingCycle` se mandan al server por **inputs hidden** (`name="subscription_tier"` y `name="billing_cycle"`), no por estado del action. Los botones de plan/ciclo solo cambian el estado React local que alimenta esos hidden.
- `SubmitButton` usa `useFormStatus()` para el `pending` y cambia el texto segun `isFreeTier` ("Creando tu cuenta..." / "Preparando pago..." y "Empezar gratis →" / "Continuar al pago →").

**Campos del formulario (todos van por FormData a la server action):**

| `name` | Tipo / validacion cliente | Proposito |
|---|---|---|
| `full_name` | text, `required`, `minLength={2}`, `defaultValue={defaultName}` | Nombre del coach (pre-cargado de Google) |
| `brand_name` | text, `required`, `minLength={2}` | Nombre de la marca (base del slug) |
| `subscription_tier` | hidden, valor = estado `tier` | Plan elegido |
| `billing_cycle` | hidden, valor = estado `billingCycle` | Ciclo de facturacion |
| `accept_legal` | checkbox, `required` | Acepta TOS + privacidad |
| `accept_health_data` | checkbox, `required` | Acepta tratamiento de datos de salud (Ley 21.719) |
| `accept_marketing` | checkbox, opcional | Opt-in de marketing |

> No hay input `coupon_code` en este formulario. La server action lee `formData.get('coupon_code')` (ver 3.2.4) pero el form de onboarding no lo renderiza → en este flujo el cupon viaja siempre vacio. El soporte de cupon esta cableado server-side para reuso, pero la UI de onboarding no lo expone.

**Eleccion de plan (UI, datos desde `@/lib/constants` → `@eva/tiers`):**
- `tierOptions = Object.entries(TIER_CONFIG)` → renderiza un boton por cada tier de `TIER_CONFIG` (incluye legacy growth/scale en el map del objeto, pero la validacion server los rechaza — ver 3.2.4; en la practica el set visible es free/starter/pro/elite/growth/scale del objeto config, mientras que la venta valida es solo `SALE_TIERS`).
- Por cada plan muestra: `option.label`, badge "Gratis para siempre" si free, badge de nutricion (`getTierNutritionSummary` + `getTierCapabilities(key).canUseNutrition`), "Hasta {maxClients} alumnos · {ciclos}", y precio (`getTierPriceClp(key, getDefaultBillingCycleForTier(key))`); free muestra "$0 · Sin tarjeta".
- `handleTierChange(newTier)`: setea el tier; recalcula el ciclo default con `getDefaultBillingCycleForTier`; mantiene el ciclo actual solo si `isBillingCycleAllowedForTier(newTier, billingCycle)`, si no cae al default.

**Eleccion de ciclo (solo planes pagos):**
- `allowedCycles = getTierAllowedBillingCycles(tier)`; `allowedCycleOptions` filtra `BILLING_CYCLE_CONFIG`. Para `free` el array es `[]` → la seccion de ciclo solo se renderiza si `allowedCycleOptions.length > 1`, asi que free no muestra selector.
- Cada ciclo muestra `option.label` y "Ahorro N%" usando `option.discountPercent`.
- Resumen de precio (solo no-free): `selectedPrice = getTierPriceClp(tier, billingCycle)`, mostrado como "Total {precio} CLP / {ciclo}".

**Datos de pricing concretos (de `packages/tiers/index.ts`, fuente real):**

| Tier | maxClients | Precio mensual CLP | Ciclos permitidos | Nutricion | Branding |
|---|---|---|---|---|---|
| free | 3 | 0 | (ninguno) | No | No |
| starter | 10 | 19.990 | monthly/quarterly/annual | No | No |
| pro | 30 | 29.990 | monthly/quarterly/annual | Si | Si |
| elite | 100 | 44.990 | monthly/quarterly/annual | Si | Si |
| growth (legacy, no venta) | 120 | 84.990 | — | Si | Si |
| scale (legacy, no venta) | 500 | 190.000 | — | Si | Si |

Descuentos por ciclo (`BILLING_CYCLE_CONFIG`): mensual 0%, trimestral 10%, anual 20%. `getTierPriceClp` calcula: monthly = precio base; quarterly = `round(monthly*3*0.9)`; annual = `round(monthly*12*0.8)`.

**Legales y copy condicional:**
- Tres checkboxes (descritos arriba). `accept_legal` y `accept_health_data` son `required` (HTML5); `accept_marketing` opcional.
- Copy condicional segun `isFreeTier`: "Sin tarjeta · Acceso inmediato." vs "Registro seguro + activacion automatica.". Para free se muestra ademas un bloque "Plan Free incluye:" (3 alumnos activos, entrenos ilimitados, app para alumnos, check-ins).

### 3.2.4. La server action — `completeOAuthOnboarding`

**`apps/web/src/app/coach/onboarding/complete/_actions/complete.actions.ts`** (`'use server'`). Firma: `(_prev: CompleteOnboardingState, formData: FormData) => Promise<CompleteOnboardingState>`. Es el corazon backend de esta seccion.

**Constantes de validacion del modulo:**
- `VALID_TIERS = SALE_TIERS` (= `['free','starter','pro','elite']`). growth/scale quedan fuera de venta (grandfathered).
- `VALID_CYCLES = ['monthly','quarterly','annual']`.
- `RESERVED_SLUGS` — set de slugs prohibidos para la marca: `admin, api, coach, coaches, register, login, logout, pricing, about, contact, eva, antigravity, soporte, help, blog, app, www, mail, support, dashboard, settings, subscription, nike, adidas, crossfit, gym`.

**Paso a paso del action:**

1. **Sesion**: `createClient()` (server) → `supabase.auth.getUser()`. Si `!user` → `{ error: 'Sesión expirada. Volvé a iniciar sesión con Google.' }`. (La cuenta se crea con `user.id` de la sesion OAuth — nunca se confia en el body para el id, principio del proyecto.)

2. **Lectura de FormData**:
   - `brandName = brand_name.trim()`, `fullName = full_name.trim()`.
   - `selectedTier = subscription_tier ?? 'free'`, `selectedBillingCycle = billing_cycle ?? 'monthly'`.
   - `acceptLegal = accept_legal`, `acceptHealthData = accept_health_data` (truthiness del checkbox), `acceptMarketing = accept_marketing === 'on'`.

3. **Validaciones server (espejo del cliente, defensa en profundidad):**
   - `brandName` vacio o < 2 → "El nombre de tu marca es obligatorio (mínimo 2 caracteres)."
   - `fullName` vacio o < 2 → "Tu nombre completo es obligatorio."
   - `!acceptLegal` → "Debés aceptar los términos de servicio y la política de privacidad."
   - `!acceptHealthData` → "Debés aceptar el tratamiento de datos de salud (Ley 21.719, Art. 16)."
   - tier no en `VALID_TIERS` → "Plan inválido."
   - ciclo no en `VALID_CYCLES` → "Frecuencia de pago inválida."
   - `isFreeTier = selectedTier === 'free'`.
   - Si NO es free y `!isBillingCycleAllowedForTier(selectedTier, selectedBillingCycle)` → "La frecuencia elegida no está disponible para ese plan."

4. **Email y anti-abuso:**
   - `email = user.email ?? ''`; si vacio → "No se pudo obtener tu email de Google."
   - `emailNorm = normalizePlatformEmail(email)` (lib `@/lib/auth/platform-email`): lowercase + trim, strip de `+alias` para gmail/googlemail/outlook/hotmail/live, y para gmail/googlemail ademas elimina los puntos del local-part y normaliza a `@gmail.com` (dedup-only; misma bandeja = misma cuenta).
   - `isDisposableEmail(emailNorm)` → si es de un dominio desechable (lista hardcoded de ~120 dominios: mailinator, yopmail, guerrillamail, 10minutemail, etc.) → "Los correos temporales no están permitidos."

5. **Admin client**: `adminDb = createServiceRoleClient()` (bypassa RLS; `coaches` es escritura solo service-role por los GRANT de columna).

6. **Anti-abuso de free trial** (clave del embudo): consulta `coaches` por `trial_used_email = emailNorm` (`maybeSingle`). Si existe → "Ya existe una cuenta gratuita con este correo. Iniciá sesión o contacta soporte." Esto previene que un mismo email (con variantes de puntos/alias) cree multiples cuentas free. `trial_used_email` solo se setea para cuentas free (ver insert).

7. **Generacion de slug**:
   - `baseSlug` = `brandName` lowercased, `normalize('NFD')` + strip de diacriticos (`/[̀-ͯ]/g`), `[^a-z0-9]+ → -`, y trim de guiones de bordes.
   - Si `RESERVED_SLUGS.has(baseSlug)` → "Este nombre de marca no está disponible. Probá con otro."
   - Loop de unicidad (hasta 8 intentos): consulta `coaches` por `slug`; si no existe usa ese; si colisiona genera `${baseSlug}-${random6}` (`Math.random().toString(36).slice(2,8)`). En el intento 8 sin exito → "No se pudo generar un ID único. Probá con otro nombre."

8. **Invite code**: `inviteCode = await generateUniqueInviteCode(adminDb)`. Genera codigos de 5 chars del alfabeto sin ambiguedad (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, sin 0/O/1/I/L) y reintenta hasta 20 veces verificando colision contra `coaches.invite_code`; si no encuentra unico lanza error. Este `invite_code` es el identificador publico primario del coach (las URLs `/c/[code]` lo resuelven).

9. **INSERT a `coaches`** (con `adminDb`, service-role). Campos:
   - `id: user.id` (PK = el uid de la sesion OAuth → vincula `coaches` ↔ `auth.users`).
   - `full_name`, `brand_name`, `slug`, `invite_code`.
   - `primary_color: '#10B981'` (verde de marca EVA por default).
   - `subscription_status: isFreeTier ? 'active' : 'pending_payment'` — **bifurcacion central**: el free queda activo de una; el pago queda pendiente hasta que el webhook lo active.
   - `subscription_tier: selectedTier`.
   - `billing_cycle: isFreeTier ? 'monthly' : selectedBillingCycle`.
   - `payment_provider: isFreeTier ? 'admin' : (process.env.PAYMENT_PROVIDER ?? 'mercadopago')`.
   - `max_clients: getTierMaxClients(selectedTier)`.
   - `health_data_consent_at: now` (timestamp del consentimiento Ley 21.719).
   - `marketing_consent: acceptMarketing`.
   - `onboarding_guide: { invite_code_confirmed: true, invite_code_confirmed_at: now }` — marca el codigo como ya confirmado para **saltar** el modal `PublicCodeRequiredModal` (ese modal de migracion one-shot era solo para coaches legacy sin codigo; los nuevos ya conocen el suyo).
   - `...(isFreeTier && { trial_used_email: emailNorm })` — solo en free se graba el email normalizado, que es lo que alimenta el guard anti-abuso del paso 6.
   - Si `insertError` → "Error al crear tu perfil. Intentá de nuevo o contactá soporte." (mensaje generico; el detalle real va a logs).

10. **Bifurcacion free vs pago (redirect final):**
    - **Free** → `redirect('/coach/dashboard?welcome=free')`. Cuenta creada y activa: acceso inmediato, sin tarjeta. (Comentario en codigo: las cuentas Google ya estan email-confirmadas, asi que el free arranca activo de una.)
    - **Pago** → arma el redirect a `/coach/subscription/processing`:
      - `selectedCycleLabel = BILLING_CYCLE_CONFIG[selectedBillingCycle].label.toLowerCase()` (ej. "mensual").
      - `couponCode = normalizeCouponCode(formData.get('coupon_code') ?? '')` (UPPER + sin espacios/guiones; vacio en este flujo porque el form no lo expone). Si hay cupon, `couponParam = '&coupon=...'`.
      - `redirect('/coach/subscription/processing?from=register&tier=...&cycle=...&plan=...' + couponParam)`. El canje del cupon y la disclosure SERNAC pasan **alla** (en `/processing`), no aca. El comentario lo marca como "REGISTER-CODE (R2.10 OAuth)".

> **Diferencia clave free vs pago**: en free la cuenta queda **completamente creada y operativa** (`status='active'`, `payment_provider='admin'`, `trial_used_email` grabado). En pago la fila `coaches` tambien se crea, pero con `status='pending_payment'` y `payment_provider='mercadopago'` — el coach queda en estado bloqueado hasta que el flujo de pago (`/processing` → preferencia MP → webhook) confirme el cobro y suba el status. Es decir, la cuenta del coach pago **ya existe** antes de pagar, pero no tiene acceso hasta confirmar el pago.

### 3.2.5. Resumen de salidas de `completeOAuthOnboarding`

| Resultado | Salida |
|---|---|
| Validacion falla (cualquiera) | `return { error: '<mensaje es>' }` (re-render con error, sin navegar) |
| Email ya uso free | `{ error: 'Ya existe una cuenta gratuita...' }` |
| Insert falla | `{ error: 'Error al crear tu perfil...' }` |
| Exito free | `redirect('/coach/dashboard?welcome=free')` (cuenta activa) |
| Exito pago | `redirect('/coach/subscription/processing?from=register&tier=...&cycle=...&plan=...[&coupon=...]')` |

---

## 3.3. Notas backend transversales (lo que NO se debe perder en el rediseño)

- **No CAPTCHA, no rate-limit en esta capa**: ni `/auth/exchange` ni `completeOAuthOnboarding` invocan CAPTCHA ni rate-limit (Upstash). El gating anti-abuso del onboarding OAuth es: (a) email desechable bloqueado, (b) email normalizado dedup contra `trial_used_email`. El rate-limit/CAPTCHA, si existe, vive en el alta por password (otra ruta, no esta).
- **Source of truth del id**: la cuenta SIEMPRE se crea con `user.id` de `getUser()` server-side, jamas con un id del body. Espejo de la politica del proyecto (nunca leer identidad del request body).
- **Escritura service-role obligatoria**: `coaches` tiene los inserts/updates revocados a `authenticated` (GRANT de columna), por eso el insert usa `createServiceRoleClient()`. Cualquier campo nuevo que el onboarding deba escribir requiere que la columna exista y sea escribible por service-role.
- **`invite_code` set-once**: el codigo se genera aca y a nivel DB es set-once (trigger: `authenticated` solo NULL→valor). El onboarding lo escribe via service-role, lo cual es correcto.
- **Consentimientos legales persistidos**: `health_data_consent_at` (timestamp) y `marketing_consent` (bool) se graban en el insert — evidencia de aceptacion (Ley 21.719). El TOS/privacidad (`accept_legal`) se valida pero NO se persiste como columna separada en este insert (solo como gate).
- **Pricing centralizado**: todo precio/limite/ciclo sale de `@eva/tiers` (re-exportado por `@/lib/constants`). El form NO hardcodea precios; consume `TIER_CONFIG`, `BILLING_CYCLE_CONFIG`, `getTierPriceClp`, `getTierMaxClients`, `getTier*BillingCycle*`. El rediseño debe seguir consumiendo estos helpers (no duplicar tablas de precio).
- **Cupon cableado pero no expuesto**: el action ya threadea `coupon_code` a `/processing`; reactivar cupones en onboarding seria solo agregar el input al form (la plomeria server ya existe).
