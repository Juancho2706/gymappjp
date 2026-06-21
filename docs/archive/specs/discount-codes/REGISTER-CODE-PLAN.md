# Plan de Implementación — Código de descuento en /register (cupones v1, último item)

> specs/discount-codes/REGISTER-CODE-PLAN.md · Workflow multi-rol (7 lentes startup + research web jun-2026) · 2026-06-21

## 0. Decisiones CERRADAS por el CEO (2026-06-21) — reencuadre del deal

⚠️ **El deal NO es adquisición pública.** Es una **LISTA CERRADA de coaches selectos** (correos que el CEO proveerá): **20% de por vida** sobre **plan + add-ons que compren** (`target='total'`), compuesto sobre el descuento de ciclo.

| Decisión | Resuelto |
|---|---|
| **Duración** | `forever` (de por vida) — el riesgo de ARR está acotado porque la lista es chica/curada, NO pública |
| **Cálculo %** | **compuesto** sobre el ciclo (sin tocar el motor; 20% sobre Pro annual ya −20% = 36% off de lista) |
| **Restricción** | **allowlist de correos** en el cupón (SOLO esos correos canjean) → schema nuevo (R1.0) |
| **Vigencia** | `redeem_by` (fecha límite para registrarse-con-código; los que ya canjearon mantienen forever) |
| **Consentimiento SERNAC** | el botón **"Confirmar y pagar"** = acto afirmativo (evidencia: `coupon_terms_text`+`redeemed_at`+`source_ip`) |
| **Google OAuth** | **IN v1** (threadear también el path `completeOAuthOnboarding`, R2.10) |
| **Abandono de checkout** | **cron de barrido** automático ~48h (R3.7 confirmado, no opcional) |
| **Margin floor (gap)** | **arreglar ahora** (R1.4 confirmado) |

**Consecuencias sobre el plan base de abajo (que asumía adquisición pública):**
- **Abuso/enumeración cae fuerte:** con allowlist de correos, un link filtrado es **inútil** (solo los correos de la lista canjean). El IP-rate-limit del preview público (R3.1) se mantiene solo como higiene anti-enumeración, ya no es la defensa principal.
- **"Coupon field anxiety" moot:** el código llega por **link privado** al correo del coach selecto → **auto-apply** (`?codigo=`) es el camino real. El campo manual colapsado (R2.1) queda como fallback de baja prioridad.
- **`forever` ya funciona con la infra existente:** el cycle-decrement no-opea (`applied_cycles_remaining = null`), el email pre-aviso no dispara, y el DB CHECK `coupons_no_100_forever` solo bloquea 100%-forever (20% OK). Cero cambio de lifecycle.
- **`first_time_only` + allowlist** = doble llave: aunque el correo esté en la lista, solo canjea una vez.

---

## 1. Resumen + decisión de enfoque

**Objetivo:** un coach NUEVO ingresa (o trae por link) un código al registrarse, de modo que su **primer cobro de MercadoPago ya nazca descontado**. Habilita el deal "20% a coaches nuevos". Es el único item v1 del sistema de cupones sin construir; todo lo demás (redeem backend, money path threading F2a.2b, lifecycle F4, UI de canje post-registro, mint admin F5) está LIVE.

**Realidad confirmada leyendo el código (no inventada):**
- El money path `create-preference/route.ts:151` ya re-resuelve `resolveActiveDiscountSpec(admin, user.id)` y descuenta el composite (`:326`). El primer preapproval nace descontado SOLO si `coaches.active_coupon_redemption_id` existe **antes** de esa línea. El threading ya está hecho; no se toca create-preference.
- La route `redeem-coupon/route.ts:91` exige `tier!=='free' && PAID_ACTIVE.has(status)` (`active|trialing`). El coach recién registrado queda `'pending_payment'` (`register.actions.ts:201`) → **esa route lo rechaza con `NO_PAID_PLAN`**. Confirmado.
- `redeemCoupon` (coupons.service.ts) ya soporta `commit:false` (PREVIEW, no escribe) / `commit:true` (claim atómico + insert + trigger setea el puntero), ya construye `termsText` server-priced, ya hace compensación de cap. **Se reusa SIN cambios.**
- `getCompositeAmountClp` (addons.service.ts:180-196) **NO threadea `floorClp`** a `computeDiscountedClp` → el margin floor es hoy un no-op (gap real de Finance, confirmado en `:194`).

**Decisión de enfoque (resuelve los 5 blockers):**

1. **pending_payment-vs-active** → NO se relaja la route `redeem-coupon` existente (es la superficie post-registro autenticada y debe seguir exigiendo plan activo + hace PUT a MP). Se crea un **endpoint dedicado `redeem-coupon-signup`** que: acepta `status==='pending_payment' && tier!=='free'`, exige `active_coupon_redemption_id IS NULL` (un solo cupón por alta), **NO hace PUT a MP** (no hay preapproval aún — el descuento entra por create-preference), y es **autenticado** (la sesión ya existe por `signInWithPassword` en `register.actions.ts:242`).

2. **Orden redención-antes-de-checkout** → el código se captura como hidden en el form, se threadea por la URL a `/processing` (igual que tier/cycle/addons), pero el **commit ocurre client-side en `/processing` tras el disclosure consentido, JUSTO ANTES de `startCheckoutFromRegister`**. Secuencia estricta (no paralela): `POST preview` → render disclosure → consentir → `POST commit` (setea el puntero en la misma tx del INSERT, trigger AFTER INSERT) → `await ok` → recién entonces `startCheckoutFromRegister()`. Esto minimiza la ventana de cuenta-fantasma y garantiza que el puntero existe cuando `resolveActiveDiscountSpec` corre.

3. **Por qué `/processing` y no `registerAction`:** el consentimiento SERNAC es interactivo (PREVIEW server-priced → acto afirmativo → commit) y debe preceder al cobro. `registerAction` es un server action que redirige; no puede mostrar un disclosure bloqueante. Por eso `registerAction` solo **sanea y threadea el código** (no canjea); el ciclo preview/consent/commit vive en `/processing`.

**Razón de fondo:** el descuento del cobro #1 es alcanzable SIN tocar el motor de precio. El trabajo nuevo es un endpoint de canje pre-pago + un disclosure consentible en `/processing` + threading del código por el form + guardrails de abuso/floor.

---

## 2. Fases

### R0 — Spec, flag y decisiones congeladas

| Tarea | Archivo / función REAL | Detalle |
|---|---|---|
| R0.1 | (decisión, sin código) | Confirmar con CEO/Legal las **decisiones abiertas** (sección 4) ANTES de R1: duración del código (`once`/`repeating N`/nunca `forever`), commit-en-processing (elegido) y barrido de abandono. |
| R0.2 | `apps/web/src/services/billing/coupons.service.ts:85` `COUPON_TERMS_VERSION` + `:92` `formatCouponTermsText` | Agregar la **línea de cancelación** que Legal marca como faltante: `'Puedes cancelar la renovación cuando quieras desde tu panel de suscripción, sin penalización.'` y **bumpear** a `sernac-v2-2026-06`. Requiere re-firma O3 (el comentario del código lo exige). |
| R0.3 | env `COUPON_REDEMPTION_ENABLED` | Confirmar que el mismo gate de dinero fail-closed (`=== 'true'`) cubrirá el path signup. OFF en prod hasta firma + QA sandbox; Preview = `'true'`. |
| R0.4 | (decisión) | Confirmar política del código del deal: `first_time_only=true`, `per_account_limit=1`, `max_redemptions` requerido, `redeem_by` requerido, distribución por link (no público en landing). |

**DoD R0:** decisiones de la sección 4 cerradas por CEO/Legal; `COUPON_TERMS_VERSION` bumpeado con copia re-firmada; flag verificado; vitest verde sobre `formatCouponTermsText` (test existente en `coupons.service.test.ts` actualizado a v2).

---

### R1 — Backend: endpoint de canje pre-pago + margin floor real

| Tarea | Archivo / función REAL | Detalle |
|---|---|---|
| R1.1 | **NUEVO** `apps/web/src/app/api/payments/redeem-coupon-signup/route.ts` | Clon de `redeem-coupon/route.ts` con 4 diferencias: **(a)** gate de estado `tier!=='free' && status==='pending_payment'` (NO `PAID_ACTIVE`); **(b)** guard `if (coach.active_coupon_redemption_id) return 409 ALREADY_HAS_COUPON`; **(c)** ELIMINAR el bloque PUT `updateCheckoutAmount` (`redeem-coupon/route.ts:136-155`) — no hay preapproval; **(d)** SELECT de coaches suma `active_coupon_redemption_id`. **Mantener idéntico:** `COUPON_REDEMPTION_ENABLED` fail-closed, `rateLimitCouponRedeem(user.id, clientIp)` fail-closed, `canViewBilling`, `RedeemCouponSchema`, `getUser()` user-scoped, `redeemCoupon(admin, {...})`, el map `ERROR_STATUS`, el audit log con discriminador `source:'register'` en el payload. |
| R1.2 | `redeemCoupon` (coupons.service.ts:121) | **Reusar sin cambios.** El `tier/cycle` salen del coach `pending_payment` (`subscription_tier/billing_cycle` ya escritos en `register.actions.ts:201-203`). |
| R1.3 | `redeem-coupon-signup/route.ts` — `billable` | **Paridad de precio (riesgo SERNAC art.28):** `listLive` devuelve `[]` pre-pago, pero `create-preference:313-317` suma los add-ons del signup. Para que el preview muestre el total real, el route signup debe construir `billable` sintético desde los addons del signup (espejo del merge de create-preference): leer addons del body/coach, mapear a `{moduleKey, priceClpMensual: ADDON_MONTHLY_PRICE_CLP}` y pasarlos como `billable` a `redeemCoupon`. |
| R1.4 | **GUARDRAIL margin floor** `getCompositeAmountClp` (addons.service.ts:180-196) + `discount.service.ts` | Threadear `floorClp` al path vivo (hoy `computeDiscountedClp` se llama sin floor, `:194`). Extender el overload con-discount para aceptar/propagar `floorClp`; `resolveActiveDiscountSpec`/`resolveActiveDiscountDetail` ya tienen `discountFloorFromSnapshot` (`discount.service.ts:75`) — devolver también el floor y pasarlo en `create-preference:326`. **Sin esto un cupón mal configurado puede cobrar 1 CLP.** |

**DoD R1:** `redeem-coupon-signup` responde preview sin escribir y commit que setea el puntero, sobre un coach `pending_payment`; rechaza `free`, rechaza si ya hay `active_coupon_redemption_id`; gate OFF → 403 sin escribir; NO dispara PUT a MP. `floorClp` se respeta en create-preference (test: 50% sobre starter con floor=X nunca cobra `< X`). vitest verde por tanda.

---

### R2 — UI: captura del código + disclosure consentible

| Tarea | Archivo / función REAL | Detalle |
|---|---|---|
| R2.1 | `register/page.tsx` — Step 2 (~`:444` tras "Módulos opcionales") | Bloque **COLAPSABLE** detrás de link `¿Tienes un código de descuento?` (NO input siempre-visible — web jun-2026: "coupon field anxiety"). Solo si `!isFreeTier`. Al expandir: input + botón `Aplicar` (patrón `CouponRedeemCard.tsx:168-182`, ya `min-h-[44px]`). Estado: `idle/checking/applied/error`. Estado `applied` = chip verde + link `Quitar`. |
| R2.2 | `register/page.tsx` — `useEffect` URL (`:101-133`) | **AUTO-APPLY:** leer `?codigo=` (y `?ref=`) del query, guardar en estado, mostrar `Código X aplicado` sin tipear (camino primario del deal). Si inválido → no bloquear, aviso suave "el código X no está disponible", precio normal. |
| R2.3 | `register/page.tsx` — preview en Step 2 | `Aplicar`/auto-apply → POST a **endpoint de preview** (R2.6) con `{tier, billingCycle, addons, code}` del estado del form → render `base tachada / descuento / Pagas` (mismo render que `CouponRedeemCard.tsx:132-144`, `clp()` es-CL). Reflejar el total descontado en el `liveTotal`/resumen. **Re-correr el preview** cuando cambie `tier/billingCycle/selectedAddons/code` (evita bait-and-switch; espejo del `useEffect` de purga `:143`). |
| R2.4 | `register/page.tsx` — hidden inputs (`:202-204`) | Agregar `<input type="hidden" name="coupon_code" value={appliedCode}/>`. NO meter el código en la URL del redirect dentro de page (queda en historial) — pero sí viaja a `/processing` por query (decisión: el código no es secreto una vez aplicado; el commit es autenticado). |
| R2.5 | `register/page.tsx` — Step 3 (`:521-579`) | **Disclosure SERNAC INLINE** en "Resumen antes de pagar", adyacente al CTA (FTC/SERNAC: "immediately adjacent to consent"). Mostrar `formatCouponTermsText` (server, del preview) + fila "Descuento (CÓDIGO) −$N" en el desglose. **NO modal** sobre el wizard. El consentimiento es un **acto afirmativo separado** del `accept_legal` (checkbox dedicado o se difiere al `Confirmar` de `/processing` — ver R2.7). |
| R2.6 | **NUEVO** endpoint de preview público IP-rate-limited (ver R3.1) | El preview en Step 2 no tiene sesión (coach aún no existe). Endpoint `POST` que corre `redeemCoupon(commit:false)` con `{tier,cycle,addons}` del body (no de DB), IP-rate-limited fail-closed, errores colapsados (anti-enumeración). Devuelve el preview server-priced para pintar. |
| R2.7 | `register.actions.ts:45` `registerAction` | Leer `formData.get('coupon_code')`, **sanear** con `normalizeCouponCode` (importar de `coupons.normalize`), NO canjear. Threadear a la URL: `redirect('/coach/subscription/processing?from=register&tier=..&cycle=..&addons=..&coupon=<code>')`. |
| R2.8 | `processing/page.tsx:87` `startCheckoutFromRegister` + `:176` | Si `searchParams.get('coupon')` && `fromRegister` && `!preapprovalId`: **NO** disparar checkout de inmediato. Primero `POST redeem-coupon-signup {code, commit:false}` → render disclosure bloqueante (reusar componente extraído R2.9, focus-trap) → al `Confirmar`: `POST {code, commit:true}` → `ok` (tratar `409 ALREADY_HAS_COUPON`/`ALREADY_REDEEMED` como éxito = ya aplicado) → recién `startCheckoutFromRegister()`. Al `Cancelar`/sin-código: checkout directo a precio lleno. |
| R2.9 | **NUEVO** `CouponDisclosureDialog` extraído de `CouponRedeemCard.tsx:33-61,129-164` | Extraer focus-trap + line-items + `onDialogKeyDown` a componente compartido; consumir en `CouponRedeemCard` y en `/processing`. Evita divergencia de la copia legal. |

**DoD R2:** Step 2 colapsable + auto-apply funcionando; preview server-priced refleja total en Step 2/3; código viaja por hidden + URL; `/processing` muestra disclosure consentible ANTES del checkout; commit precede a `startCheckoutFromRegister`; código inválido nunca bloquea el alta; copy es-CL latam neutro. tsc + vitest verdes.

---

### R3 — Abuso / seguridad (endpoint público)

| Tarea | Archivo / función REAL | Detalle |
|---|---|---|
| R3.1 | endpoint preview (R2.6) | **Rate-limit por IP fail-closed ANTES de tocar el catálogo** (anti-enumeración). El preview no tiene `coachId` → usar `getCouponRedeemIpRatelimit` (IP-only, fail-closed) — NO `rateLimitSignup`/`rateLimitAuth` (fail-OPEN, `rate-limit.ts:106-114`). Errores colapsados a un único mensaje genérico ("El código no es válido o no aplica") para no convertir el preview en oráculo de validez. |
| R3.2 | `redeem-coupon-signup/route.ts` | Reusar `rateLimitCouponRedeem(user.id, clientIp)` fail-closed (`rate-limit.ts:351`) — el canje commit ocurre ya autenticado, recupera el rate-limit por-coach. Verificar en code review: NINGÚN limiter fail-open en el path del código. |
| R3.3 | `register.actions.ts` — path PAGO | Cerrar gap pre-existente: el path pago NO rate-limita por IP (el conteo `:128-144` es solo `isFreeTier`). Agregar `rateLimitSignup` o un conteo IP al path pago **cuando viaja un código** (el feature lo vuelve explotable: farmeo de descuento de nuevos). `clientIpFromRequest` ya importado. |
| R3.4 | `coupons.service.ts` `normalizeEmailForFirstTime` (ya existe) | `first_time_only=true` en el código del deal + el índice único parcial `(coupon_id, normalized_email)` es la defensa real contra +alias/gmail-dots. **No duplicar en cliente.** Documentar límite: dominios custom catch-all NO se colapsan (cap global es el backstop). |
| R3.5 | `lib/auth/platform-email.ts` `assertPlatformEmailAvailable` | (Opcional, alto ROI) lista de bloqueo de ~50 dominios desechables (mailinator/temp-mail/guerrillamail) — defensa barata contra farmeo multi-identidad que `first_time_only` no cubre. |
| R3.6 | Turnstile | Verificar `TURNSTILE_SECRET_KEY` presente en prod (`register.actions.ts:70` es condicional). Si NO, el único anti-bot es el honeypot — insuficiente para un alta que ahora otorga descuento. Confirmar ANTES del flip del flag. |

**DoD R3:** preview IP-rate-limited fail-closed con errores genéricos; commit usa `rateLimitCouponRedeem`; ningún limiter fail-open en el path del código; `first_time_only` activo en el código del deal; Turnstile confirmado en prod. Test: 4º intento de preview desde misma IP → bloqueado.

---

### R4 — SERNAC / legal

| Tarea | Archivo / función REAL | Detalle |
|---|---|---|
| R4.1 | `formatCouponTermsText` (R0.2 ya lo bumpeó) | Disclosure con precio **server-side**: (a) total con código en CLP, (b) precio normal tachado, (c) duración, (d) precio-al-que-revierte, (e) "se renueva automáticamente", (f) cómo cancelar. Reusar; NO redactar copia nueva. Variante `forever` omite reversión (`coupons.service.ts:105`) pero conserva auto-renovación + cancelación. |
| R4.2 | `/processing` disclosure (R2.8) | El precio del disclosure == el del cobro (mismo `getCompositeAmountClp` server-side, vía `redeemCoupon` preview). Mostrar y **consentir ANTES de redirigir a MercadoPago** (Reglamento Comercio Electrónico + art.30). Consentimiento = acto afirmativo separado del `accept_legal` genérico. |
| R4.3 | `redeemCoupon` commit (coupons.service.ts:217-228, ya lo hace) | Evidencia persistida: `coupon_terms_text` (texto exacto mostrado), `coupon_terms_version`, `source_ip`, `redeemed_at` — columnas inmutables (`guard_coupon_redemption_immutable`). **NO crear tabla nueva.** `redeemed_at` == consentimiento. |
| R4.4 | gate OFF | Con `COUPON_REDEMPTION_ENABLED` OFF, el path de register NO escribe redención ni descuenta — el coach paga precio lleno (degradación segura, NUNCA 500 que rompa el alta). El campo de código se oculta. |

**DoD R4:** disclosure server-priced consentido pre-checkout con evidencia persistida (`coupon_terms_text/version/source_ip/redeemed_at`); copy `sernac-v2` re-firmada por O3; gate OFF degrada sin descuento; "continuar sin código" siempre disponible.

---

### R5 — QA + datos

| Tarea | Archivo / función REAL | Detalle |
|---|---|---|
| R5.1 | **NUEVO** `redeem-coupon-signup/route.test.ts` | (a) gate OFF → 403, cero escrituras; (b) acepta `pending_payment`, rechaza `free`, rechaza si ya hay `active_coupon_redemption_id` (409); (c) rate-limit fail-closed → 429; (d) preview no escribe; (e) commit escribe + setea puntero; (f) NO dispara `updateCheckoutAmount`. Patrón de mocks de `confirm-upgrade/route.test.ts`. |
| R5.2 | **NUEVO** `register.actions.test.ts` (no existe hoy — gap) | (a) alta pago sin código → redirect con tier/cycle/addons (regresión baseline); (b) alta pago con código → redirect preserva `coupon=`; (c) código inválido NO bloquea el alta. |
| R5.3 | invariante de dinero (el más importante) | Test: spec 20% `repeating-3` desde snapshot → `getCompositeAmountClp(tier,cycle,billable,spec).totalClp == amountClp` que `create-preference` pasa a `createCheckout`. Aserto sobre `provider.createCheckout.mock.calls[0][0].amountClp`. Verifica que el cobro #1 NO sale a precio lleno. |
| R5.4 | floor test | `getCompositeAmountClp` con `floorClp` nunca devuelve `< floorClp` (cierra el gap R1.4). |
| R5.5 | cleanup/abandono | Test de `revertActiveCouponForCoach` + `releaseCouponCapacity` para coach `pending_payment` con redención `active` sin pago. Si se agrega cron de barrido: selecciona `active_coupon_redemption_id IS NOT NULL && status='pending_payment' && created_at < N horas && subscription_mp_id IS NULL` y NO toca a los que pagaron. |
| R5.6 | idempotencia/first_time | Doble commit → 2º `409 ALREADY_HAS_COUPON`/`ALREADY_REDEEMED`, una sola redención, `redeemed_count` no incrementa. `first_time_only` con +alias/gmail-dots → bloqueado (ya cubierto en `coupons.service.test.ts:145`). |
| R5.7 | E2E (Playwright, SOLO al cierre + OK explícito, regla IO budget memoria) | 1 happy + 4 negativos en UN spec contra Preview (`COUPON_REDEMPTION_ENABLED='true'`, MP sandbox): registro paid + código seed → disclosure con precio descontado + reversión → consentir → `/processing` → create-preference con `amountClp < full`. Negativos: inexistente, expirado, first_time 2º gmail+dots, gate OFF. Seed vía script (espejo `seed-e2e-personas.mjs`). |
| R5.8 | DATA/atribución | `coupon_redemptions` ya liga `coach_id↔code↔created_at`. Cohorte conversión = JOIN `coupon_redemptions ↔ coaches.subscription_status ↔ billing_snapshots` (fuente de verdad de revenue por memoria). Audit log con discriminador `source:'register'` vs `'subscription_page'` (R1.1). PostHog `useCaptureCouponAtRegisterFunnel` (espejo `useCaptureAddonFunnel`, events.ts:114) como funnel best-effort cookie-gated — NO fuente de verdad. |

**DoD R5:** unit por tanda verde (typecheck + vitest); invariante de dinero y floor cubiertos; cleanup testeado; E2E corre solo al gate con OK del usuario; query de cohorte server-side documentada.

---

## 3. Riesgos consolidados + mitigación

| # | Riesgo | Sev | Mitigación (en este plan) |
|---|---|---|---|
| 1 | Relajar `redeem-coupon` existente debilita la superficie post-registro (PUT a un `subscription_mp_id` inexistente/abandonado) | alta | NO tocar `redeem-coupon`. Endpoint dedicado `redeem-coupon-signup` (R1.1), sin PUT, guard `active_coupon_redemption_id IS NULL`. |
| 2 | **Margin floor inerte:** `getCompositeAmountClp` omite `floorClp` → un cupón puede cobrar 1 CLP en el charge #1 | alta | R1.4: threadear `discountFloorFromSnapshot`→`floorClp` a create-preference ANTES del flip. |
| 3 | **Descuento compuesto invisible:** cupón sobre composite ya-descontado por ciclo (annual −20% + 20% = 36% off; 50% forever annual = 60% off permanente) | alta | R0.4/sección 4: el deal NO `forever`; preview en mint muestra neto compuesto (CouponMintForm). Anclaje numérico para CEO en sección 4. |
| 4 | **Cuenta-fantasma:** commit + puntero seteado pero abandona checkout → quema 1 cupo del cap, bloquea su `first_time` | alta | Commit en `/processing` (ventana mínima, R2.8) + barrido cron `revertActiveCouponForCoach`+`releaseCouponCapacity` para `pending_payment >48h sin pago` (R5.5). |
| 5 | **Enumeración/farmeo** en preview público no-auth | alta | R3.1: IP-rate-limit fail-closed + errores colapsados; commit autenticado recupera rate-limit por-coach; `first_time_only`+`normalizeEmailForFirstTime`+cap global; R3.3 rate-limit al path pago con código. |
| 6 | **Carrera commit↔create-preference:** checkout dispara antes de que el trigger setee el puntero → cobro #1 full | med | Secuenciar `await commit` ANTES de `startCheckoutFromRegister` (R2.8). El trigger es AFTER INSERT en la misma tx → sin ventana si es secuencial. |
| 7 | **Bait-and-switch:** preview muestra total, pero cambia tier/cycle/addons entre preview y checkout | med | Re-correr preview en cada cambio de `tier/cycle/addons/code` (R2.3); `termsText` server-priced siempre refleja el composite actual; revalidar `scopeTiers` en commit. |
| 8 | **Paridad de precio (art.28):** `listLive=[]` pre-pago → preview sin addons del signup, pero create-preference SÍ los suma | med | R1.3: pasar addons del signup como `billable` sintético al preview (espejo `create-preference:313-317`). |
| 9 | `accept_legal` genérico reusado como consentimiento del descuento | alta | R4.2: consentimiento del cupón = acto afirmativo separado, server-priced, en `/processing` antes de MP. |
| 10 | Doble-submit / Reintentar | low/med | Guard `active_coupon_redemption_id IS NULL` + índice `one_active_per_coach` (23505→ALREADY); `/processing` trata "ya aplicado" como éxito; botón disabled durante pending. |
| 11 | Código inválido bloquea el alta | med | Cupón OPCIONAL no-bloqueante: error inline + "continuar sin código" → checkout a precio lleno (R2.8, R4.4). |
| 12 | 100%-off / NET_NOT_CHARGEABLE en el alta | low | `redeemCoupon` rechaza `NET_NOT_CHARGEABLE` (`:174`) y create-preference (`:328`); surfacear copy claro ("se gestiona como cortesía") antes del redirect, no como fallo de checkout. |

---

## 4. Decisiones abiertas para CEO / Legal (bloquean R0)

1. **Duración del descuento del deal:** `once` (solo cobro #1), `repeating N` ciclos, o `forever`. **Recomendación Finance: `once` o `repeating 1-3`, NUNCA `forever`** para adquisición (forever destruye ~36% del ARR de la cohorte permanente). El sistema soporta las tres. — *decisión de negocio, define el payback.*

2. **¿20% sobre lista o sobre precio ya-descontado-por-ciclo?** Hoy **se compone**: 20% sobre Pro annual = **36% off de lista**; 50% forever annual = 60% permanente. Anclaje numérico: Pro annual = $287.904/año (ya −20%); 20% encima cobra $230.323 = 36% off. ¿Intencional, o el CEO espera 20% sobre lista? Si lista → restringir a ciclo mensual (`scopeTiers` + gate de ciclo) o bajar el % nominal.

3. **`floorClp`/costo variable mínimo por tier** que el negocio acepta como piso del cobro #1 (necesario para setear un floor real en R1.4, hoy 0).

4. **Presupuesto de campaña:** `max_redemptions` total + ventana `redeem_by` decididos, o ¿código ilimitado? (Finance: hacer ambos **obligatorios** en `CreateCouponAdminSchema` para códigos públicos — hoy `.optional()`, `coupon.ts:30-31`).

5. **Un código vanity público (`PARTNER20`)** distribuido por links vs **N códigos por-partner** con atribución. Define minteo masivo + dashboard vs un solo código con UTM. Para partners: códigos vanity con cap bajo (`restricted_to_coach_id` no aplica a coach-nuevo).

6. **Consentimiento SERNAC:** ¿checkbox dedicado (4º) o el `Confirmar y pagar con descuento` de `/processing` cuenta como acto afirmativo? **Legal (O3) debe confirmar** que el cobro-con-descuento exige consent explícito separado del ToS. (Recomendado: el `Confirmar` de `/processing` ES el acto afirmativo; `redeemed_at`+`coupon_terms_text` son la evidencia.)

7. **Re-firma O3 de `sernac-v2-2026-06`** (línea de cancelación nueva) antes del flip del flag — igual que la v1.

8. **OAuth signup (`completeOAuthOnboarding`)** ¿entra en v1? El brief solo cubre `registerAction` (email/pass). El path Google es un 2º call site que necesitaría el mismo threading. **Recomendación: diferir a v1.1**, declararlo explícito.

9. **Cron de barrido de abandono** (recomendado, robusto) vs limpieza manual v1. Define cuántos cupos del cap se "queman" por altas no convertidas.

---

## 5. Métricas a instrumentar

- **Coupon-attach-rate por fuente:** % de registros con código, segmentado `?codigo=` auto vs typed-manual vs sin-código (discriminador `source:'register'` en `admin_audit_logs`, R1.1; funnel PostHog `useCaptureCouponAtRegisterFunnel`).
- **Conversión register→cobro-confirmado CON vs SIN código:** JOIN server-side `coupon_redemptions ↔ coaches.subscription_status ↔ billing_snapshots` (fuente de verdad; PostHog es cookie-gated y se pierde sin consent → best-effort).
- **Incrementalidad (proxy):** % de redenciones typed-manual sin link = señal de seeker (¿habría pagado igual?).
- **Por-código:** redenciones/cap consumido vs ventas reales (detecta cuentas-fantasma que queman cap); descuento otorgado acumulado en CLP.
- **Retención M1/M3 de la cohorte con-código vs sin** (Finance: si el descuento atrae coaches que no renuevan, el daño supera el ahorro; cohorte first-invoice).
- **Funnel UI:** `coupon_register_entered → _validated{result} → _disclosure_shown → _consented` (props: `tier`, `billing_cycle`, `code_hash` — NUNCA código crudo ni email; sin montos).

---

**Orden de ejecución recomendado:** R0 (decisiones+copy) → R1 (backend+floor) → R3 (abuso, en paralelo con R2) → R2 (UI) → R4 (legal, transversal) → R5 (QA por tanda; E2E al cierre con OK). El flip de `COUPON_REDEMPTION_ENABLED` en prod es el último paso, post-QA sandbox + re-firma O3.

**Archivos nuevos:** `apps/web/src/app/api/payments/redeem-coupon-signup/route.ts`, `apps/web/src/app/coach/subscription/_components/CouponDisclosureDialog.tsx` (extraído), endpoint de preview público, `redeem-coupon-signup/route.test.ts`, `register.actions.test.ts`.
**Archivos a tocar:** `register/page.tsx`, `register.actions.ts`, `processing/page.tsx`, `coupons.service.ts` (copy/version R0.2 + check de allowlist R1.0), `addons.service.ts` + `discount.service.ts` (floor R1.4), `create-preference/route.ts` (pasar floor R1.4), `CouponRedeemCard.tsx` (consumir el dialog extraído), `coupon.ts` schema, `platform-email.ts` (disposable domains, opcional), `rate-limit.ts`.

---

## 6. DELTAS por las decisiones del CEO (2026-06-21) — tareas NUEVAS/CAMBIADAS

> Estas tareas se SUMAN/PISAN a las fases R0–R5 de arriba (que asumían adquisición pública). Las decisiones cerradas (sección 0) las hacen obligatorias.

### R1.0 — Allowlist de correos en el cupón (NUEVO, lo más importante)
- **Migración aditiva** `supabase/migrations/<ts>_coupon_allowed_emails.sql`: tabla `coupon_allowed_emails(coupon_id uuid FK ON DELETE CASCADE, normalized_email text, PK (coupon_id, normalized_email))` + RLS service-role-only (espejo del catálogo). Índice por `normalized_email`. Sin SELECT para authenticated.
- **`coupons.service.ts` `redeemCoupon`**: nuevo check de elegibilidad — si el cupón tiene allowlist (existe ≥1 fila), exigir que `normalizeEmailForFirstTime(input.coachEmail)` esté en `coupon_allowed_emails`; si no → `NOT_ELIGIBLE`. (Reusa `normalizeEmailForFirstTime`, ya cierra +alias/gmail-dots.) Cupones SIN allowlist se comportan como hoy (abiertos).
- **Mint admin** (`coupon.ts` schema + `mintCoupon` + `CouponMintForm`): textarea opcional "Correos permitidos (uno por línea)"; el server normaliza c/u (`normalizeEmailForFirstTime`) e inserta en `coupon_allowed_emails`. Para ESTE deal: 1 cupón `percent 20 / target=total / forever / first_time_only / redeem_by=<fecha>` + la lista de correos.
- **Distribución:** link privado `?codigo=XXX` por email a cada coach de la lista → auto-apply (R2.2). Un link filtrado es inútil (el correo del filtrador no está en la allowlist).

### R2.10 — Google OAuth signup (IN v1)
- El path OAuth es un 2º punto de entrada al alta. Buscar `completeOAuthOnboarding` (o el callback `/auth/callback` + el paso de onboarding que setea tier/cycle para un signup pago por Google) y threadear el `coupon` igual que `registerAction`: capturar el código (del estado/onboarding), sanear, y llevarlo a `/processing` para el mismo ciclo preview→consent→commit. Mismo endpoint `redeem-coupon-signup`. DoD: un signup pago por Google con `?codigo=` llega a `/processing` con el código y cobra #1 descontado.

### R3.7 — Cron de barrido de abandono (CONFIRMADO, no opcional)
- En `cron/mp-reconcile` (o un cron dedicado): seleccionar coaches con `active_coupon_redemption_id IS NOT NULL AND subscription_status='pending_payment' AND subscription_mp_id IS NULL AND created_at < now()-interval '48 hours'` → `revertActiveCouponForCoach` (ya existe) + `releaseCouponCapacity` (ya existe) para liberar el cupo. NO tocar a quien ya pagó (status active / mp_id presente). Idempotente. Test R5.5 ya contemplado.

### Decisiones de sección 4 — ESTADO tras el CEO (2026-06-21, 2da ronda)
- #1 duración → **forever** (RESUELTO). #2 compound → **compuesto** (RESUELTO). #6 consent → **botón Confirmar** (RESUELTO). #8 OAuth → **IN v1** (RESUELTO). #9 cron → **construir** (RESUELTO).
- #7 legal/SERNAC → **AUTORIZADO por el CEO** (2026-06-21: "tengo todo el permiso"). O3 satisfecho por autoridad del socio; NO bloquea el flip. (Bumpear igual `COUPON_TERMS_VERSION` con la línea de cancelación, R0.2.)
- **R3.8 — Guardrail de % de descuento (NUEVO, decisión CEO):** el tope de descuento por defecto es **21%**. Un código con `percent_value > 21` (ej. el 50% futuro para "1 persona / 3 cuentas", sin datos aún) **solo se mintea si el CEO tilda un check explícito** `high_discount_override` en /admin/codigos ("confirmo que este % alto es intencional"). Implementación: `CreateCouponAdminSchema` gana `highDiscountOverride` boolean + refine `percent>21 ⇒ requiere override`; `CouponMintForm` muestra el checkbox cuando el % supera 21 (reemplaza el confirm suave del 60% actual). Esto es la guardrail de NEGOCIO; el `floorClp` (piso CLP del motor, R1.4) queda como higiene separada (valor 0 por defecto — 21% nunca lo toca).
- **SIGUE abierto (logística, no bloquea el build):** la **lista de correos** que el CEO proveerá para cargar en el mint del cupón del deal.