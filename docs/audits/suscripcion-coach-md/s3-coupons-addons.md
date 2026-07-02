# 3. Cupones, descuentos y add-ons (backend)

Esta seccion documenta el nucleo de pricing del checkout del coach standalone: como se origina un cupon, como se canjea, como el descuento sobrevive al webhook recurrente, como se cobran/cancelan/sincronizan los modulos add-on, el prorrateo one-shot, el gate de capacidad y la evidencia SERNAC (`billing_snapshots`). El enfasis es **money-safety**: un solo chokepoint de precio (`getCompositeAmountClp`), descuento siempre re-resuelto server-side, escritura del catalogo y de los ledgers SOLO service-role, e idempotencia exactly-once en cada hook del webhook.

> Mapa de archivos clave:
> - `apps/web/src/services/billing/coupons.service.ts` — canje (redeem/mint/lifecycle de ciclos/revert).
> - `apps/web/src/services/billing/coupons.normalize.ts` — normalizacion pura de codigo/email.
> - `apps/web/src/services/billing/discount.service.ts` — resolucion server-side del cupon vivo + guard de cobro.
> - `apps/web/src/services/billing/addons.service.ts` — motor de cobro de add-ons (composite, prorrateo, estados, sync admin_grant).
> - `apps/web/src/services/billing/addon-webhook.service.ts` — hooks idempotentes que ejecuta el webhook.
> - `apps/web/src/services/billing/capacity.service.ts` — conteo de alumnos activos standalone (gate de downgrade).
> - `packages/tiers/index.ts` (`@eva/tiers`) — motor de precio PURO: `getTierPriceClp`, `computeDiscountedClp`, `DISCOUNT_NET_FLOOR_CLP`, `getCompositeAmountClp` lo consume.
> - `apps/web/src/lib/constants.ts` — `ADDON_CONFIG` ($9.990 uniforme), `ADDON_PAYMENT_RULES`, re-export de `@eva/tiers`.
> - `apps/web/src/infrastructure/db/coupon-redemptions.repository.ts` — catalogo + ledger + RPC cap atomico.
> - `apps/web/src/infrastructure/db/coach-addons.repository.ts` — CRUD service-role de `coach_addons`.
> - `apps/web/src/app/api/payments/redeem-coupon/route.ts` y `.../redeem-coupon-signup/route.ts` — rutas de canje.
> - Migraciones: `supabase/migrations/20260620120000_discount_codes.sql`, `20260620140000_coupon_redeem_rpcs.sql`, `20260621120000_coupon_allowed_emails.sql`, `20260612150000_coach_addons_selfservice_billing.sql`, `20260620120000` y `20260614120000` (billing_snapshots).

---

## 3.0. El chokepoint unico de precio: `getCompositeAmountClp`

Toda la seccion gira alrededor de UNA funcion (`addons.service.ts:184`). Es **el unico calculo del monto compuesto del sistema** y la consumen create-preference, el PUT a MP, la UI, el webhook (x ramas), el cron de reconcile y `redeemCoupon`. Tiene dos overloads:

- **Sin 4o argumento** -> devuelve `number` (legacy): `base + Σ(addons por ciclo)`. Comportamiento identico al historico.
- **Con 4o argumento `discount: DiscountSpec | null`** -> devuelve `CompositeWithDiscount`: `{ totalClp, baseBeforeDiscountClp, discountClp }`.

```
getCompositeAmountClp(tier, cycle, billableAddons, discount):
  base       = getTierPriceClp(tier, cycle)                        // @eva/tiers
  addonLines = billableAddons.map(a => getAddonCycleAmountClp(a.priceClpMensual, cycle))
  si discount === undefined: return base + Σ addonLines            // legacy number
  r = computeDiscountedClp({ baseClp: base, addons: addonLines, spec: discount })  // @eva/tiers
  return { totalClp: r.netClp, baseBeforeDiscountClp: r.baseBeforeDiscountClp, discountClp: r.discountClp }
```

**Invariante drift-safe (clave para money-safety):** el descuento NUNCA viaja en el `external_reference` ni se confia del cliente. En cada call site de precio se RE-RESUELVE el `DiscountSpec` vivo del coach (`resolveActiveDiscountSpec`) y se pasa como 4o arg. Asi checkout == webhook == cron computan el MISMO neto, y un preapproval con cupon nunca dispara el falso `addon_amount_drift`.

### Tabla de precios base (`@eva/tiers`, `getTierPriceClp`)

| Tier | Mensual CLP | maxClients | Nutricion |
|------|-------------|------------|-----------|
| free | 0 | 3 | no |
| starter | 19.990 | 10 | no |
| pro | 29.990 | 30 | si |
| elite | 44.990 | 100 | si |
| growth (legacy) | 84.990 | 120 | si |
| scale (legacy) | 190.000 | 500 | si |

- Descuento por ciclo (sobre el mensual): trimestral `×3 −10%`, anual `×12 −20%` (`applyDiscount`, `Math.round`). `BILLING_CYCLE_CONFIG`: `monthly {months:1, 0%}`, `quarterly {3, 10%}`, `annual {12, 20%}`.
- **Add-on uniforme:** `ADDON_MONTHLY_PRICE_CLP = 9990` para los 4 modulos (`ADDON_CONFIG`, decision del dueno 2026-06-11, no re-litigar). Monto por ciclo del add-on = mismo descuento de ciclo, `Math.round` POR ITEM (`getAddonCycleAmountClp`), para que el desglose UI sume exacto.

---

## 3.1. CUPONES — modelo de datos (catalogo + ledger)

Tres tablas + un puntero + un ledger de idempotencia (migracion `20260620120000_discount_codes.sql`). **Todo el catalogo y los ledgers son escritura SOLO service-role**; el `authenticated` no tiene siquiera SELECT del catalogo (validacion 100% server-side, anti-enumeracion).

### `coupons` — definicion del descuento

Columnas relevantes: `discount_type` (`percent`|`fixed_clp`), `percent_value` (1..100), `amount_off_clp` (>=0), `fixed_clp_target` (`base`|`module`|`total`, default `base`), `applies_to_scope` jsonb (`{ tiers:[], module_keys:[], floorClp }`), `duration` (`once`|`repeating`|`forever`), `duration_in_cycles`, `max_redemptions`, `redeem_by`, `created_by`.

CHECKs de DB que blindan la definicion:
- `coupons_value_xor`: percent exige `percent_value` y prohibe `amount_off_clp` (y viceversa). Exactamente uno.
- `coupons_repeating_cycles`: `(duration='repeating') = (duration_in_cycles IS NOT NULL)`. once/forever prohiben cycles; repeating lo exige.
- `coupons_no_100_forever`: rechaza `percent=100 AND forever` -> ese caso va por `admin_grant`, NUNCA por el path pago (MP rechaza `transaction_amount <= 0`).

### `coupon_codes` — string canjeable

`coupon_id` (FK CASCADE), `code_normalized` (UPPER+trim, unicidad case-insensitive directa por construccion), `code_display` (casing vanity), `active`, `expires_at`, `max_redemptions`, `redeemed_count` (contador atomico del cap global, default 0), `per_account_limit` (default 1), `first_time_only`, `min_amount_clp`, `restricted_to_coach_id` (codigo de partner atado a 1 coach, anti-leak).

- Indice unico parcial `coupon_codes_code_active_uq ON (code_normalized) WHERE active` -> un solo codigo activo por string. Es lo que detecta colision al mintear vanity.

### `coupon_redemptions` — ledger inmutable append-only (evidencia SERNAC)

`coupon_id`/`coupon_code_id`/`coach_id` (FK RESTRICT, preservar evidencia), `status` (`active`|`expired`|`reverted`), `discount_value_snapshot` jsonb (terminos congelados al canje), `applied_cycles_remaining` (repeating; NULL = forever/once), `revoke_effective_at`, `billing_snapshot_id`, `first_time_only`, `normalized_email` (anti +alias), `coupon_terms_version`, `coupon_terms_text` (copia interpolada del disclosure, evidencia de consentimiento), `source_ip`.

Indices unicos parciales (atomicidad de las reglas de negocio):
- `coupon_redemptions_one_active_per_coach ON (coach_id) WHERE status='active'` -> **non-stackable: 1 cupon vivo por coach.**
- `coupon_redemptions_first_time_uq ON (coupon_id, normalized_email) WHERE first_time_only AND status='active'` -> first_time atomico por (cupon, email normalizado), bloquea +alias / gmail-dot.

Inmutabilidad (trigger `trg_coupon_redemptions_immutable` BEFORE UPDATE/DELETE, funcion `guard_coupon_redemption_immutable`, SECURITY DEFINER):
- **DELETE bloqueado siempre** (append-only).
- UPDATE: solo `status` / `applied_cycles_remaining` / `revoke_effective_at` / `billing_snapshot_id` son mutables. Cualquier cambio a `coupon_id`/`coach_id`/`discount_value_snapshot`/`coupon_terms_*`/`normalized_email`/`first_time_only` -> EXCEPTION (incluso para service-role).

### `coaches.active_coupon_redemption_id` — puntero al descuento vivo

Columna `uuid REFERENCES coupon_redemptions(id) ON DELETE SET NULL`. **Service-role-only**: NO esta en el GRANT UPDATE allowlist de `coaches`, asi que un PATCH del coach da 42501. La recomputa el trigger `trg_coupon_redemptions_sync` (funcion `sync_coach_active_coupon`, SECURITY DEFINER) en CADA INSERT/UPDATE/DELETE del ledger: setea el puntero a la unica redencion `active` del coach (LIMIT 1 garantizado por el indice parcial) o NULL si no hay. Esto rompe la FK circular `coaches <-> coupon_redemptions` (SET NULL / RESTRICT).

### `coupon_cycle_decrements` — idempotencia del decremento de ciclos

`redemption_id` (FK CASCADE), `provider_payment_id`, con `CONSTRAINT coupon_cycle_decrements_once UNIQUE (redemption_id, provider_payment_id)`. Garantiza que `applied_cycles_remaining` se decrementa EXACTAMENTE una vez por cobro. Service-role-only, sin SELECT para authenticated.

### `coupon_allowed_emails` (migracion `20260621120000`)

Allowlist por cupon (`coupon_id`, `normalized_email`, PK compuesta). Si un cupon tiene >=1 fila aqui, SOLO esos correos (normalizados) pueden canjear; sin filas = abierto. Idempotente por upsert.

### RPCs del cap global (migracion `20260620140000`)

El cap `redeemed_count < max_redemptions` NO se puede enforcar atomicamente via PostgREST (no compara columna-vs-columna en un filtro). Se hace en SQL (TOCTOU fix):
- `claim_coupon_code(p_code_id)`: `UPDATE ... SET redeemed_count = redeemed_count + 1 WHERE id=… AND active AND (max_redemptions IS NULL OR redeemed_count < max_redemptions) RETURNING 1`. `true` = reclamado, `false` = lleno/inactivo. `max_redemptions NULL` = sin tope.
- `release_coupon_code(p_code_id)`: `redeemed_count = GREATEST(redeemed_count - 1, 0)`. Compensa si el INSERT de la redencion falla tras reclamar.
- EXECUTE SOLO `service_role`.

---

## 3.2. CUPONES — tipos de descuento

El `DiscountSpec` (motor en `@eva/tiers`) tiene:
- `type`: `percent` (value 1..100) | `fixed_clp` (value CLP entero >=0).
- `target`: `base` (solo el plan) | `module` (solo los add-ons en `moduleKeys`) | `total` (toda la cuenta: base + add-ons vivos).
- `moduleKeys?`: requerido para `target='module'`.
- `remainingCycles?`: `null` = forever/once vigente; `<= 0` = expirado (sin descuento).

Mapeo de `duration` -> `appliedCyclesRemaining` (`coupons.service.ts:113 appliedCyclesFor`):
- `forever` -> `null` (no decrementa nunca).
- `once` -> `1`.
- `repeating` -> `durationInCycles ?? 1`.

**El 100%-forever NO existe como cupon** (CHECK de DB + Zod): se gestiona como cortesia `admin_grant` (precio 0). Lo mismo cualquier neto que quede en $0 (ver guard O1 en 3.3).

---

## 3.3. CUPONES — el motor de precio puro (`computeDiscountedClp`)

`@eva/tiers / computeDiscountedClp` es PURO (corre igual en web y mobile). Decision CEO O8 (2026-06-20): **el cupon COMPONE sobre el composite ya con descuento de ciclo** (no sobre el bruto mensual).

```
computeDiscountedClp({ baseClp, addons, spec, floorClp }):
  base       = max(0, round(baseClp))
  addonsTotal= Σ max(0, round(a.cycleAmountClp))
  composite  = base + addonsTotal
  active     = spec && (spec.remainingCycles == null || spec.remainingCycles > 0)
  si !active: { baseBeforeDiscountClp: composite, discountClp: 0, netClp: composite }

  targetAmount = (target='base') ? base
               : (target='module') ? Σ cycleAmountClp de los addons cuya key esta en spec.moduleKeys
               : composite                                  // 'total'

  rawDiscount  = (type='percent') ? round(targetAmount * pct/100)   // pct clamp 0..100
               : min(round(spec.value), targetAmount)               // fixed_clp nunca > target

  floor = max(0, round(floorClp ?? DISCOUNT_NET_FLOOR_CLP))         // DISCOUNT_NET_FLOOR_CLP = 0
  net   = min(composite, max(floor, composite - rawDiscount))       // nunca < floor, nunca > composite
  return { baseBeforeDiscountClp: composite, discountClp: composite - net, netClp: net }
```

Invariantes del motor:
- El cupon NUNCA sube el precio (`net <= composite`).
- `fixed_clp` nunca descuenta mas que el monto del target.
- El neto nunca baja del `floorClp` congelado al canje (margin floor O8). Default global `DISCOUNT_NET_FLOOR_CLP = 0` (solo no-negativo).
- `baseBeforeDiscountClp` siempre es el composite ANTES del cupon (evidencia SERNAC: lo que costaria sin codigo).
- El `discountClp` se RE-DERIVA desde el neto (`composite - net`), no del raw, por consistencia con el piso.

### Guard O1 de cobro (`discount.service.ts`)

`MIN_CHARGEABLE_CLP = 1`. `isChargeableNetClp(net)` = `net >= 1`. El path PAGO debe rechazar un neto no cobrable ANTES de cualquier llamada a preapproval (MP rechaza `transaction_amount <= 0`). Un 100%-off (neto 0) va por `admin_grant`. Esto se chequea en `redeemCoupon` (`NET_NOT_CHARGEABLE`), en `redeem-coupon` PUT y en create-preference (`NET_NOT_CHARGEABLE`).

---

## 3.4. DESCUENTO — resolucion server-side (`discount.service.ts`)

> Regla critica del sistema: **el descuento DEBE vivir en el calculo del monto que se cobra** (`getCompositeAmountClp`), para que el webhook recurrente, al recomputar el preapproval (p.ej. al sumar/quitar un add-on), no PISE el descuento y vuelva a precio lleno (incidente jun-2026). Por eso toda mutacion de monto re-resuelve el spec vivo y lo threadea.

### `discountSpecFromSnapshot(snapshot, appliedCyclesRemaining)` (PURO)

Valida el jsonb desconocido del ledger -> `DiscountSpec | null`. Rechaza si `type`/`target` no son del enum, `value` no es finito, o `appliedCyclesRemaining <= 0` (expirado: corta antes que el motor). Extrae `moduleKeys` si es array de strings.

### `discountFloorFromSnapshot(snapshot)` — extrae el `floorClp` congelado (O8) o `undefined`.

### Resolvers server-side (todos requieren `db` service-role)

- `resolveActiveDiscountSpec(db, coachId)`: lee `coaches.active_coupon_redemption_id` -> `resolveDiscountSpecByRedemptionId`. Dos lecturas explicitas (puntero -> ledger), no un embed PostgREST fragil. `null` si no hay cupon vivo / ledger no `active` / snapshot invalido/expirado. **Es el que llaman create-preference, la materializacion de add-ons, la cancelacion y el primer cobro** para honrar el cupon en cada PUT.
- `resolveActiveDiscountDetail(db, coachId)`: devuelve `{ redemptionId, spec, couponCode, appliedCyclesRemaining }` -> lo usan el snapshot de cobro (evidencia/MRR) y el lifecycle de ciclos (F4).
- `resolveDiscountSpecByRedemptionId(db, redemptionId)`: variante para call sites que ya tienen el puntero (p.ej. el cron lo trae en su SELECT) -> evita la lectura redundante de `coaches`.
- `resolveActiveDiscountFromRpc(db)`: usa la RPC `resolve_active_discount` (SECURITY DEFINER, sin param -> `auth.uid()` interno, anti-IDOR). Para `subscription-status`: el cliente user-scoped NO puede joinear el catalogo bajo RLS, asi que el precio MOSTRADO = el COBRADO via RPC. Devuelve `{ spec, redemptionId, code }`.

### Idempotencia del PUT cupon-driven

`buildAmountPutIdempotencyKey(coachId, amountClp) = "coupon-amt|{coachId}|{amountClp}"`. Estable por (coach, monto): un reintento del MISMO monto deduplica en MP; un monto distinto es operacion nueva. **Solo los PUTs con cupon vivo mandan este header**; los PUTs sin cupon lo omiten (comportamiento intacto). Sin timestamp (rompria el dedup).

---

## 3.5. CUPONES — como se redime

### `redeemCoupon(db, input)` (`coupons.service.ts:123`, `db` service-role)

Flujo de validacion (en orden, primer fallo corta):

1. **Normalizar** el codigo (`normalizeCouponCode`): vacio -> `CODE_NOT_FOUND`.
2. `findActiveCouponByCode` (catalogo, service-role): no existe/inactivo -> `CODE_NOT_FOUND`.
3. **Vigencia**: `expires_at` o `redeem_by` <= now -> `EXPIRED`.
4. **Codigo de partner**: `restricted_to_coach_id` y != coach -> `NOT_ELIGIBLE`.
5. **Scope de tier**: `applies_to_scope.tiers` no vacio y no incluye el tier del coach -> `NOT_ELIGIBLE` ("no aplica a tu plan").
6. **Allowlist de correos** (`getAllowlistStatus`): si el cupon tiene allowlist y el correo normalizado del coach NO esta -> `NOT_ELIGIBLE`.
7. **Modulo diferido (F2b)**: `fixed_clp_target='module'` o `module_keys` no vacio -> `MODULE_DEFERRED` (los codigos por modulo aun no estan live).
8. Construir `DiscountValueSnapshot` congelado `{ type, value, target, code, floorClp? }` + parsear el `DiscountSpec` con `discountSpecFromSnapshot(snapshot, appliedCycles)`. Spec invalido -> `CODE_NOT_FOUND`.
9. **Preview server-side**: `composite = getCompositeAmountClp(tier, cycle, billable, spec)`. Si `min_amount_clp` y `composite.baseBeforeDiscountClp < minAmount` -> `MIN_AMOUNT`.
10. **Guard O1**: `!isChargeableNetClp(composite.totalClp)` -> `NET_NOT_CHARGEABLE` ("un total $0 se gestiona como cortesia").
11. **per_account_limit**: `countRedemptionsForAccount(couponId, coachId) >= perAccountLimit` -> `ALREADY_REDEEMED`.
12. Construir `termsText` (evidencia SERNAC interpolada SOLO desde montos del server) + `durationLabel`.

**Bifurcacion preview vs commit** (`input.commit`):
- `commit === false` -> devuelve `{ ok:true, redemptionId:null, preview }`. NO escribe nada (es el disclosure SERNAC pre-consentimiento, con el precio server-side).
- `commit` true/omitido -> COMMIT:
  1. `claimCouponCapacity(codeId)` (RPC atomico). `false` -> `CAP_REACHED`.
  2. `insertRedemption(...)` del ledger (con `appliedCyclesRemaining`, `firstTimeOnly`, `normalizedEmail` si first_time, `couponTermsVersion`/`couponTermsText`, `sourceIp`). El 23505 de los indices unicos parciales -> `ALREADY_REDEEMED`.
  3. Si el INSERT falla tras reclamar -> **COMPENSA** el cap (`releaseCouponCapacity`).
  4. El trigger `trg_coupon_redemptions_sync` setea `coaches.active_coupon_redemption_id`.

**Disclosure SERNAC (`formatCouponTermsText`, PURA, evidencia de consentimiento, Ley 19.496 art.28/30/35):** interpola SOLO montos del server (nunca cliente). 3 lineas + 1 condicional:
- "Codigo {code}: descuento de {discountClp} {durationLabel}."
- "Pagaras {totalClp} (precio normal {normalClp}) mientras el descuento este vigente."
- "La suscripcion se renueva automaticamente."
- Si NO es lifetime: "Al terminar el descuento, el precio vuelve a {normalClp} en la siguiente renovacion." (la variante forever omite esta linea).
- `COUPON_TERMS_VERSION = 'sernac-v1-2026-06'` — congelada por redencion; bumpear si cambia el copy.

`RedeemErrorCode`: `CODE_NOT_FOUND | EXPIRED | NOT_ELIGIBLE | MODULE_DEFERRED | MIN_AMOUNT | ALREADY_REDEEMED | CAP_REACHED | NET_NOT_CHARGEABLE | INSERT_FAILED`.

> Decision deliberada: redeem <-> PUT a MP NO van en una sola transaccion. El canje escribe el ledger; el PUT del descuento ocurre despues (en `/redeem-coupon` para plan vivo, o en el siguiente `create-preference` para registro/reactivacion).

### Ruta `/api/payments/redeem-coupon` (coach con plan PAGO ACTIVO)

`POST` (`redeem-coupon/route.ts`):
1. `getUser` (id + email). Sin sesion -> 401.
2. `resolvePreferredWorkspace` + `canViewBilling` -> si no es coach independiente -> 403 ("Disponible solo para coach independiente"). **Los coaches de team/org NO canjean** (facturacion gestionada).
3. **Rate-limit fail-CLOSED** (`rateLimitCouponRedeem(userId, ip)`) ANTES de tocar el catalogo (anti-enumeracion). Excedido -> 429.
4. **Gate de dinero fail-closed**: `COUPON_REDEMPTION_ENABLED = process.env.COUPON_REDEMPTION_ENABLED === 'true'` (env SEPARADA de `SELF_SERVICE_ADDONS_ENABLED`; default OFF en prod hasta firma legal O3 + QA sandbox; Preview = `'true'`). OFF -> 403 `COUPONS_DISABLED`. **Con el flag OFF el canje NUNCA escribe una redencion.**
5. Zod `RedeemCouponSchema`. Invalido -> 400.
6. Lee `coaches` (service-role): `subscription_tier`, `subscription_status`, `billing_cycle`, `subscription_mp_id`.
7. Gate: tier != free Y status en `{active, trialing}`. Si no -> 422 `NO_PAID_PLAN` ("necesitas un plan pago activo").
8. `billable = toBillableAddons(listLive(...))`.
9. `redeemCoupon(admin, { commit: parsed.commit ?? false })` — **default PREVIEW** (commit exige confirmacion explicita).
10. Mapeo error -> HTTP (`ERROR_STATUS`): not-found 404; elegibilidad/expired/min/module/net 422; already/cap 409; insert 500.
11. **Auditoria** (solo commit real): `admin_audit_logs` `coach.coupon_redeemed` (best-effort).
12. **PUT a MP** (solo commit con `subscription_mp_id` vivo): `updateCheckoutAmount(mpId, preview.totalClp, buildAmountPutIdempotencyKey(...))`. El proximo cobro ya sale al precio del disclosure (el ciclo actual ya pagado NO se toca). **Best-effort**: si el PUT falla, la redencion queda escrita igual (drift lo loguea webhook/cron); NUNCA tumba el canje. Sin preapproval (comp/internal) -> no-op.

### Ruta `/api/payments/redeem-coupon-signup` (registro o reactivacion, SIN preapproval vivo)

`POST` (`redeem-coupon-signup/route.ts`). Igual que arriba en auth/workspace/rate-limit/gate/Zod, con diferencias:
- Gatea por **ESTADO** (no por tier): `PRE_CHECKOUT_STATUSES = {pending_payment, expired, canceled}` (los 3 que create-preference trata como alta/reactivacion). Otro estado -> 422 `NO_PENDING_SIGNUP`. Un coach pago ACTIVO NO entra aqui (usa `/redeem-coupon`).
- **Un solo codigo por registro**: si `active_coupon_redemption_id` ya esta seteado -> 409 `ALREADY_HAS_COUPON`.
- **Pricing del preview** sobre el plan ELEGIDO en pantalla (`previewTier`/`previewCycle` del body, validados con `isSaleTier`/`isBillingCycleAllowedForTier`), porque un coach reactivando sigue en `tier='free'` en DB hasta que el pago confirma (sin esto el composite seria $0 -> NET no cobrable). El COBRO real lo recalcula `create-preference`; esto solo afina la disclosure.
- **NO hay PUT a MP** (no hay preapproval vivo). La redencion queda escrita y el primer `create-preference` threadea el spec en el monto.
- `ERROR_STATUS` incluye ademas `ALREADY_HAS_COUPON` (409) y `NO_PENDING_SIGNUP` (422).

### Normalizacion (`coupons.normalize.ts`, PURA)

- `normalizeCouponCode(raw)`: `UPPER + trim + quita espacios/guiones internos`. Idempotente. El codigo se guarda YA normalizado -> unicidad case-insensitive directa del indice (sin `lower()` wrap).
- `normalizeEmailForFirstTime(raw)`: lowercase + trim; trunca `+alias`; para gmail/googlemail ademas quita los puntos del local-part (misma cuenta). Anti-bypass de `first_time_only`.
- `randomCouponCode(length=10)`: alfabeto sin ambiguedad (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, sin 0/O/1/I/L), `randomInt` de `node:crypto` (CSPRNG). Unicidad por retry-on-collision del llamador.

### Mint (CEO `/admin/codigos`, `mintCoupon`)

Crea `coupons` (definicion) + `coupon_codes` (string). Codigo vanity (`codeDisplay`) o autogenerado random con retry-on-collision (max 6 intentos; vanity = 1, colision -> `CODE_TAKEN`). `applies_to_scope` mapea `scopeTiers`/`scopeModuleKeys`/`floorClp` al jsonb. Inserta `coupon_allowed_emails` si vino `allowedEmails`. El Zod `CreateCouponAdminSchema` ya valido XOR/repeating/100%-forever/override-de-descuento-alto ANTES.

`CreateCouponAdminSchema` (`packages/schemas/coupon.ts`) ademas de espejar los CHECKs de DB:
- `MAX_PERCENT_WITHOUT_OVERRIDE = 21`: un percent > 21% exige `highDiscountOverride === true` (R3.8, guardrail de negocio).
- `perAccountLimit` default 1, `firstTimeOnly` default false, `restrictedToCoachId` (partner), `floorClp` (margin floor), `allowedEmails` (max 2000), `redeemBy`.
- `COUPON_TIERS = ['starter','pro','elite']` (free no canjea), `COUPON_MODULE_KEYS` espejo de MODULE_KEYS.

### Lifecycle de ciclos (F4, ejecutado por el webhook)

- `decrementCouponCycleForCharge(db, coachId, providerPaymentId)`: resuelve el detalle vivo; si `appliedCyclesRemaining == null` (forever) -> no-op. **Idempotencia exactly-once**: inserta `coupon_cycle_decrements (redemption_id, provider_payment_id)`; el 23505 del UNIQUE -> no-op (reentrega/otra rama ya decremento). Decrementa `applied_cycles_remaining`; al llegar a 0 marca la redencion `expired` -> el trigger nulea `active_coupon_redemption_id` (proximo cobro a precio lleno). Best-effort: NUNCA tumba el cobro. Ante error inesperado NO decrementa (mejor honrar un ciclo de mas que cobrar de mas por error).
- `revertActiveCouponForCoach(db, coachId)`: refund/chargeback/expire terminal -> marca la redencion viva `reverted` (WHERE status='active') -> el trigger nulea el puntero -> un coach reactivado arranca SIN descuento fantasma. No-op si no hay cupon vivo.

---

## 3.6. ADD-ONS — modelo de datos (`coach_addons`)

Tabla `coach_addons` (migracion `20260612150000`). **Fuente de verdad de los entitlements de modulos de pago del coach standalone.** Escritura SOLO service-role (RLS: unica policy = SELECT propio; INSERT/UPDATE/DELETE revocados a `authenticated`).

Columnas: `coach_id` (FK CASCADE), `module_key` (CHECK = los 4 MODULE_KEYS), `status` (`active`|`cancel_pending`|`cancelled`), `source` (`self_service`|`admin_grant`), `price_clp` (precio MENSUAL congelado; 0 en grant), `terms_version`, `terms_accepted_at`, `activated_at`, `first_charged_at` (set-once webhook), `cancel_requested_at`, `expires_at` (fin del periodo ya pagado), `cancelled_at`.

### Maquina de estados (`domain/billing/types.ts`)

```
active ──baja──► cancel_pending ──(corte alcanzado)──► cancelled (terminal)
```
`cancelled` es terminal: reactivar un modulo crea una fila NUEVA (re-congela el precio).

### `source`: `self_service` (paga) vs `admin_grant` (cortesia, price 0, NUNCA factura)

Indice unico parcial `coach_addons_one_live_per_module ON (coach_id, module_key, source) WHERE status IN ('active','cancel_pending')`. **`source` va en el indice A PROPOSITO**: un grant del CEO (`admin_grant`) y un add-on pago (`self_service`) del MISMO modulo COEXISTEN como filas distintas (D2). Si el modulo esta pago Y con grant, sigue ON por la fila paga aunque se retire el grant.

### Precio congelado

`price_clp` se congela al insertar (`getAddonMonthlyPriceClp(key)` = `ADDON_CONFIG[key].priceClpMensual` = 9990). El monto por ciclo se DERIVA on-the-fly con los descuentos de ciclo (`getAddonCycleAmountClp`); no se persiste el monto por ciclo (se recalcula). El grant tiene `price_clp = 0`.

### Trigger D1 (`trg_coach_addons_sync`, funcion `sync_coach_enabled_modules`, SECURITY DEFINER)

Recomputa `coaches.enabled_modules` desde las filas vivas (`status IN active|cancel_pending`) en CADA INSERT/UPDATE/DELETE: `jsonb_object_agg(module_key, true)` con `COALESCE('{}')` obligatorio (sobre 0 filas vivas `agg` devuelve NULL y `enabled_modules` es NOT NULL). **El override del CEO para standalone es write-through**: crea/cancela filas `admin_grant`, nunca escribe el jsonb directo (el trigger lo pisaria). El trigger es SECURITY DEFINER para escribir aunque `enabled_modules` este bloqueado por column-grant.

### Repository (`coach-addons.repository.ts`, todo service-role salvo SELECT propio)

- `listLive(db, coachId)`: filas `active|cancel_pending` (las que prenden el modulo).
- `listAll`: incluye `cancelled` (historial).
- `insertAddon`: fila `status='active'`. El indice unico parcial rechaza una 2a fila viva del mismo (modulo, source) -> el service lo mapea a "modulo ya activo".
- `markFirstCharged(db, coachId, chargedAt)`: set-once `first_charged_at` (WHERE `IS NULL`, idempotente), SOLO `source='self_service'`, filas vivas. (P0-6: se quito el guard `.lt(activated_at, chargedAt)` que en el alta combo dejaba `first_charged_at` null y sobre-cobraba un ciclo en una baja regla-3.)
- `requestCancel(db, addonId, {cancelRequestedAt, expiresAt?})`: `status='cancel_pending'`.
- `applyExpiry`: `cancel_pending` con `expires_at` alcanzado -> `cancelled` (lo usa el reconcile diario; el trigger D1 apaga el modulo).
- `revokeAdminGrant(db, coachId, key, cancelledAt)`: cancela DURO la fila viva `admin_grant` de un modulo (cortesia retirada; sin ciclo que esperar).
- `cancelAllForCoach`: cancela todas las filas vivas (rama `expire` del webhook cuando el preapproval expira de verdad).

### `billing_snapshots` — evidencia SERNAC por cobro (ver 3.10)

---

## 3.7. ADD-ONS — facturabilidad y composite

### `isAddonBillable(row)` (regla 3 en una linea)

Factura si `status='active'` OR (`status='cancel_pending'` AND `firstChargedAt === null`). La rama `cancel_pending && first_charged_at IS NULL` solo se da en ciclo MENSUAL (en trim/anual la fila nace con el one-shot ya cobrado -> `first_charged_at` seteado).

### `toBillableAddons(addons)` -> `BillableAddon[]`

Filtra `source='self_service'` AND `isAddonBillable` -> `{ moduleKey, priceClpMensual }`. **Los `admin_grant` jamas entran al composite** (cortesia, price 0). Es lo que alimenta `getCompositeAmountClp`.

### Gating de compra (D8, `canPurchaseAddon(coach, key)`)

- Coach de team/org (`isManagedByTeamOrOrg`) -> `managed_by_team_or_org` (sus add-ons van por contrato).
- Plan pago activo = tier != free AND status en `{active, trialing}` (con preapproval vivo donde sumar el monto; `canceled`/`expired` conservan acceso pero NO tienen preapproval vivo -> deben recontratar). Si no -> `no_paid_plan`.
- `nutrition_exchanges` exige tier con nutricion (`getTierCapabilities(tier).canUseNutrition` = Pro+; starter NO) -> `requires_nutrition_tier`.
- El kill-switch `EVA_DISABLED_MODULES` NO bloquea la compra (es palanca de incidentes, no de billing).

---

## 3.8. ADD-ONS — prorrateo one-shot

> Decision del dueno (2026-06-12, no re-litigar): **TODOS los ciclos** (mensual incluido) cobran un one-shot prorrateado inmediato por la fraccion restante del ciclo actual + suman el valor completo del modulo DESDE la siguiente renovacion (PUT). El compromiso minimo de 1 ciclo queda cubierto por ese cobro inicial.

### `getAddonCycleAmountClp(priceClpMensual, cycle)`

`gross = priceClpMensual * months`; `round(gross * (1 − discountPercent/100))`. Mismo descuento de ciclo del plan, `Math.round` por item.

### `getAddonProrationClp(priceClpMensual, cycle, now, currentPeriodEnd)`

```
cycleAmount  = getAddonCycleAmountClp(priceClpMensual, cycle)
totalDays    = BILLING_CYCLE_CONFIG[cycle].months * 30        // base meses×30
rawRemaining = ceil((currentPeriodEnd - now) / DAY_MS)
remainingDays= min(max(rawRemaining, 1), totalDays)           // min 1 dia, tope al ciclo completo
return max(1, round(cycleAmount * remainingDays / totalDays)) // nunca $0
```
Borde: alta el dia del corte (o `now >= corte`) -> minimo 1 dia (cubre el compromiso minimo, nunca $0).

### Cupon sobre el one-shot (`applyCouponToAddonProration(prorationClp, key, spec)`)

El one-shot es UNA linea de add-on parcial, asi que SOLO un `percent` que cubra ese add-on lo descuenta: `target='total'` o `target='module'` con la key incluida. `base` no toca add-ons; `fixed_clp` sobre la fraccion de un solo modulo sobre-acreditaria (se OMITE). Piso $1. `spec null` -> sin cambio.

### `activateAddonForCoach(db, payments, ctx, key, termsVersion)` (alta in-app)

1. `fullProration = getAddonProrationClp(...)`.
2. Re-resuelve el cupon vivo (`resolveActiveDiscountSpec`) y aplica `applyCouponToAddonProration` (no cobrar el one-shot a precio lleno mientras el plan tiene cupon).
3. Crea la preference one-shot (`createOneShotPayment`) con `externalReference = buildOneShotExternalReference(coachId, key, termsVersion)` (= `addon_oneshot|{coachId}|{key}|{termsVersion}`; 1a parte NO es uuid -> el parser de suscripcion no la confunde). El monto SIEMPRE lo calcula el server.
4. **NO crea fila** -> la materializa el webhook al aprobarse (cero filas en checkout abandonado). Devuelve `{ kind: 'one_shot_checkout', checkoutUrl, prorationClp, cycleAmountClp }`.

### Prorrateo de UPGRADE de tier (`getTierUpgradeProrationClp`)

Espejo de la proration de add-on, pero sobre la **diferencia de precio** entre tier nuevo y actual en el ciclo actual. Si la diferencia es `<= 0` (no es upgrade real) devuelve 0 (el llamador exige > 0). El nuevo tier se activa al confirmar el pago y el preapproval pasa al composite completo DESDE la siguiente renovacion. Los add-ons NO entran en este one-shot.

### Puerto de pagos (`AddonPaymentsPort`)

Interface estrecha inyectada (desacopla del provider MP):
- `updateCheckoutAmount(checkoutId, amountClp, idempotencyKey?)`: PUT /preapproval/{id} — sube/baja el monto del proximo cobro sin re-autorizar al pagador.
- `createOneShotPayment(input)`: Checkout Pro one-shot -> `{ checkoutUrl }`.

---

## 3.9. ADD-ONS — materializacion y baja (via webhook)

### `materializeAddonFromOneShot(db, payments, ctx, key, termsVersion, paidAt)` (one-shot aprobado, trim/anual)

1. **Idempotente**: si ya hay fila viva `self_service` del modulo -> no duplica.
2. `insertAddon(... firstChargedAt: paidAt)` (one-shot ya cobrado, compromiso cubierto; el trigger D1 prende el modulo). Carrera confirm-addon <-> webhook: si el indice unico parcial rechaza la insercion, re-lee la fila viva (evita 500 espurio).
3. Re-lee filas vivas + **re-resuelve el cupon** -> `newComposite = getCompositeAmountClp(tier, cycle, billable, spec).totalClp`.
4. PUT que suma el add-on al preapproval DESDE la renovacion, **honrando el cupon** (sin el spec el PUT recomputaria a precio LLENO y BORRARIA el descuento de la base — incidente jun-2026). Idempotency key solo si hay spec.

### `materializeAddonsFromPreapproval(db, coachId, addons, termsVersion)` (signup/supersede con add-ons)

Materializa filas desde los add-ons del `external_reference` de un preapproval `authorized`. `firstChargedAt = NULL` (el preapproval ya nace con el composite completo; el primer cobro recurrente lo setea via `markFirstCharged`). Idempotente por el indice unico parcial (carrera de doble entrega = no-op).

### `requestAddonCancellation(db, payments, ctx, key)` (reglas 3-4)

- Sin fila viva `self_service` -> throw "no hay add-on activo".
- **`first_charged_at` SETEADO (regla 4)**: `cancel_pending` + `expires_at = currentPeriodEnd` + PUT que BAJA el monto YA (el proximo cobro excluye el add-on). **Honra el cupon** al recomputar. Si el PUT falla (preapproval pausado/MP caido/id invalido) NO se tumba la baja (queda aplicada en DB); el reconcile diario detecta el drift y reintenta (devolver error dejaria la baja aplicada pero con un 500 al usuario, y el over-bill ocurriria igual). `putApplied` refleja si se aplico.
- **`first_charged_at` NULL (regla 3, SOLO mensual)**: `cancel_pending` SIN bajar el monto (el proximo corte lo cobra igual — compromiso minimo); `expires_at` queda null y se fija recien al primer cobro. `effectiveAt: null` (la UI muestra "tras tu primer cobro").

### `applyFirstChargeToAddons(db, payments, ctx, chargedAt)` (primer cobro recurrente, mensual)

1. `markFirstCharged` (set-once, idempotente). Si nada se marco -> no-op.
2. Si alguna recien-cobrada estaba `cancel_pending` (baja regla-3 antes del 1er cobro): el compromiso minimo ya se cumplio -> fija `expires_at = currentPeriodEnd` y baja el monto del proximo cobro (PUT que excluye las bajas), **honrando el cupon**. `putApplied` refleja si se aplico.

### `reconcilePreapprovalAmount({ providerAmountClp, expectedClp })` (PURA)

Para el evento preapproval `updated`: compara monto vigente vs composite esperado. `provider === null` -> `{ ok:false, drift:false }` (no se puede confirmar). Si difieren -> `drift:true`. El route decide el `subscription_event` (la funcion no escribe DB).

### Override del CEO (`syncAdminGrants(db, coachId, desired)`, write-through D2)

Diffea el mapa `desired` (una entrada por MODULE_KEY) contra las filas vivas `admin_grant`:
- deseado ON sin grant vivo -> `insertAddon(source='admin_grant', priceClpMensual: 0, terms_version: ADMIN_GRANT_TERMS_VERSION='admin_grant')`.
- deseado OFF con grant vivo -> `revokeAdminGrant` (cancel duro; coexiste con la fila paga).
- NO toca filas `self_service` (retirar la cortesia jamas cancela un add-on que el coach paga).
Idempotente. El trigger D1 recomputa `enabled_modules` en la misma transaccion. Devuelve `{ granted[], revoked[] }` (audit log).

---

## 3.10. `billing_snapshots` — evidencia SERNAC por cobro

Tabla escrita por el webhook (service-role), una fila por CADA cobro aprobado (recurrente u one-shot prorrateado). RLS: SELECT propio, escritura solo service-role.

Columnas: `coach_id` (FK CASCADE), `provider_payment_id` (**UNIQUE** -> idempotencia por cobro), `charged_at`, `tier`, `billing_cycle`, `kind` (`recurring`|`addon_proration`|`tier_upgrade_proration`), `base_clp`, `addons` jsonb (`[{module_key, price_clp, cycle_amount_clp}]`), `total_clp`. Columnas de cupon (migracion `20260620120000`, nullable/defaulted -> back-compat): `base_before_discount_clp`, `discount_clp` (default 0), `coupon_code`, `coupon_redemption_id` (FK SET NULL). El CHECK de `kind` se re-asegura forward-only.

### `insertBillingSnapshot(db, input)` (`addon-webhook.service.ts`)

Construye la fila con los campos de cupon solo si vienen (`base_before_discount_clp`/`discount_clp`/`coupon_code`/`coupon_redemption_id`). **Upsert con `onConflict: 'provider_payment_id', ignoreDuplicates: true`** -> un reintento del webhook es no-op (idempotente). `total_clp` = honrado (descontado); `base_before_discount_clp` = lista. Evidencia de QUE se cobro y POR QUE.

`buildAddonBreakdown(addons, cycle)`: lineas de add-ons facturables (`module_key`, `price_clp` mensual congelado, `cycle_amount_clp`).

### Invariantes de `billing_snapshots`

- **Una fila por `provider_payment_id`** (UNIQUE + upsert ignoreDuplicates) -> no doble-conteo de MRR ante reentrega.
- `total_clp` siempre = lo efectivamente cobrado (neto descontado si hubo cupon); `base_before_discount_clp` preserva el precio de lista (evidencia SERNAC de la rebaja).
- Escritura SOLO service-role; el coach solo SELECT propio.

---

## 3.11. CAPACIDAD — cambio de plan con cartera que no cabe

### `countActiveStandaloneClients(db, coachId)` (`capacity.service.ts`)

Cuenta alumnos ACTIVOS standalone con el filtro canonico: `coach_id = coachId` + `is_archived = false` + `org_id IS NULL` (usa `is_archived`, NO `is_active`; excluye alumnos de org/team). `head:true` + `count:'exact'` (no trae filas). 0 si null.

### Gate OVER_CAPACITY (en `create-preference`, no en este service)

En un **DOWNGRADE** (`direction === 'downgrade'`): si `getTierMaxClients(tier) < countActiveStandaloneClients(...)` -> **409 `OVER_CAPACITY`** con `{ maxClients, activeClients }` y mensaje "Archiva alumnos antes de bajar de plan". **CERO efectos colaterales** (no toca el coach ni crea checkout). El coach debe archivar alumnos primero.

Gate hermano **`NUTRITION_ADDON_ON_DOWNGRADE`**: si el tier destino no admite nutricion (Starter) y el coach tiene un add-on `nutrition_exchanges` `status='active'` vivo -> 409 (debe quitar el modulo antes de bajar). Solo cuenta nutricion ACTIVE: si ya esta `cancel_pending`, el downgrade se PERMITE (expira al corte, plan nuevo arranca al corte — timing consistente).

`getTierMaxClients`: free 3, starter 10, pro 30, elite 100, growth 120, scale 500. El webhook/confirm-* setea `max_clients = getTierMaxClients(tier)` al activar el plan.

---

## 3.12. Tablas e invariantes (resumen money-safety)

| Tabla / columna | Escritura | Invariante clave |
|---|---|---|
| `coupons` | service-role | CHECK XOR valor; repeating biconditional; no 100%-forever. Sin SELECT a authenticated. |
| `coupon_codes` | service-role | `redeemed_count` = cap atomico via RPC; 1 codigo activo por string. |
| `coupon_redemptions` | service-role | **Append-only** (trigger bloquea DELETE + cols de evidencia congeladas); 1 viva por coach; first_time atomico por (cupon, email). |
| `coupon_cycle_decrements` | service-role | UNIQUE (redemption, payment) -> decremento exactly-once por cobro. |
| `coupon_allowed_emails` | service-role | Allowlist por cupon; presente = solo esos correos. |
| `coaches.active_coupon_redemption_id` | service-role (trigger) | NO en GRANT UPDATE -> coach PATCH = 42501. Recomputado por trigger. |
| `coach_addons` | service-role | 1 viva por (coach, modulo, source) -> grant y pago coexisten. Trigger D1 recomputa `enabled_modules`. |
| `coaches.enabled_modules` | service-role (trigger D1) | Nunca se escribe directo (write-through `coach_addons`); compra-only por column-grant. |
| `billing_snapshots` | service-role | UNIQUE `provider_payment_id` -> idempotente; evidencia SERNAC del desglose congelado. |

### Cadena drift-safe del descuento (la regla critica)

1. Canje escribe el ledger -> trigger setea `coaches.active_coupon_redemption_id`.
2. **Todo** call site de precio (create-preference, materializacion de add-on, baja, primer cobro, redeem PUT, cron, subscription-status) **re-resuelve el spec** (`resolveActiveDiscountSpec` / RPC) y lo pasa a `getCompositeAmountClp`.
3. El neto del preapproval ya nace descontado (MP-net-at-source); webhook y cron recomputan con el MISMO spec -> sin falso `addon_amount_drift`.
4. El lifecycle (F4) decrementa ciclos exactly-once; al expirar nulea el puntero -> el siguiente cobro vuelve a precio lleno SIN intervencion. Refund/chargeback -> `reverted` -> el reactivado arranca limpio.

> Gotcha money-safety recurrente: cualquier PUT que recompute el monto (sumar add-on, quitar add-on, primer cobro) DEBE re-resolver y threadear el cupon vivo. Omitir el spec recomputa a precio LLENO y BORRA el descuento de la base (incidente jun-2026, hoy cubierto en las 4 superficies: materialize, cancel, firstCharge, redeem-PUT).
