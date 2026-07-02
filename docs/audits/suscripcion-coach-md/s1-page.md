# 1. Pagina de suscripcion: planes, modulos, cupon y cancelacion

> Alcance de esta seccion: la pagina cliente `/coach/subscription` (`apps/web/src/app/coach/subscription/page.tsx`, componente `CoachSubscriptionPage`, `'use client'`) y su tarjeta de cupon (`apps/web/src/app/coach/subscription/_components/CouponRedeemCard.tsx`, componente `CouponRedeemCard`). Documento funcional + datos/calculo, sin estilos. Las pantallas de procesamiento, MercadoPago y los endpoints (`create-preference`, `addons`, `redeem-coupon`, `webhook`, etc.) se documentan en otras secciones; aqui se describe que dispara la pagina y que datos consume/muestra.

---

## 1.0. Fuente de datos: el endpoint `GET /api/payments/subscription-status`

Toda la pagina se hidrata desde **una sola llamada** a `GET /api/payments/subscription-status`. Se invoca en el `useEffect` de montaje (con guard `isMounted`) y de nuevo en `refreshStatus()` tras eventos de checkout. La UI **NUNCA calcula precios por su cuenta** para el estado actual (plan 05 F5.3): el total compuesto y el cupon vigente vienen ya resueltos del server.

Campos del payload que la pagina lee y guarda en estado:

| Campo del payload | Estado React | Tipo / forma | Uso |
|---|---|---|---|
| `coach` | `coach` | `CoachSubscription` | Plan actual, estado, ciclo, fecha, tarjeta |
| `changeCardEnabled` | `changeCardEnabled` | `boolean` (server-only, NO `NEXT_PUBLIC`) | Muestra/oculta "Cambiar tarjeta" |
| `events` | `events` | `SubscriptionEvent[]` | Historial de pagos |
| `addons` | `addons` | `CoachAddonView[]` | Estado por modulo |
| `billing` | `billing` | `BillingBreakdown` (`{ baseClp, addonsClp, totalClp }`) | Desglose y total del proximo cobro |
| `activeCoupon` | `activeCoupon` | `{ code: string\|null; discountClp: number; spec: DiscountSpec } \| null` | Cupon vivo re-resuelto server-side |
| `activeClientCount` | `activeClientCount` | `number` | Alumnos activos standalone (gate de downgrade) |

`CoachSubscription` (tipo local en `page.tsx`):
- `id`, `subscription_tier` (string), `subscription_status` (string), `max_clients` (number), `billing_cycle` (string), `current_period_end` (string|null), `payment_provider` (string), `card_last4?` (string|null), `card_brand?` (string|null).

`CoachAddonView` (espejo parcial de `domain/billing` `CoachAddon`):
- `id`, `moduleKey: ModuleKey`, `status: 'active' | 'cancel_pending' | 'cancelled'`, `source: 'self_service' | 'admin_grant'`, `firstChargedAt: string|null`, `expiresAt: string|null`.

### Redireccion temprana (coaches no self-service)

Tras cargar, si `coach.subscription_status === 'org_managed'` **o** `'team_managed'`, la pagina hace `router.replace('/coach/dashboard')` y **no** renderiza nada de billing. Justificacion en codigo: a esos coaches el plan/modulos se los fija el contrato (org o team pool plano). Es la unica via por la que un coach gestionado evita el checkout.

### Errores de carga

Si `response.ok` es falso, lanza `payload.error ?? 'No se pudo cargar la suscripción'`, capturado en `setError`. Mientras carga, `loading=true` muestra `Cargando estado de suscripción...` (con `role="status" aria-live="polite"`).

---

## 1.1. Estado actual del plan (seccion "Plan actual")

Render gateado en `coach` (cargado). Muestra:

### Icono + label del tier

- Mapa `TIER_ICON` (Lucide): `free`→Leaf, `starter`→Zap, `pro`→Rocket, `elite`→Crown, `growth`→TrendingUp, `scale`→Building2. (growth/scale son LEGACY fuera de venta pero se mantienen en el mapa de display porque un coach grandfathered puede tener ese tier vigente.)
- **Tier desconocido** (no esta en `TIER_CONFIG`): NO colapsa a `starter`. Renderiza icono neutro `HelpCircle`, muestra el `subscription_tier` crudo como label, y un aviso `Plan no reconocido — contacta soporte.`. Estado de error explicito.
- Label: `TIER_CONFIG[t].label` si es conocido, si no el string crudo.
- Rango de alumnos bajo el label: `TIER_STUDENT_RANGE_LABEL[tier]` (ej. `1–10 alumnos`, `11–30 alumnos`, `31–100 alumnos`).

### Badge de estado de suscripcion

Pill con texto segun `coach.subscription_status`:

| `subscription_status` | Texto mostrado |
|---|---|
| `active` | **Activo** |
| `canceled` | **Cancelado** |
| `trialing` | **En prueba** |
| `pending_payment` | **Procesando** |
| cualquier otro | el string crudo |

> Nota money-safety: la pagina escribe `'canceled'` (una sola L) al cancelar localmente (`setCoach(... subscription_status: 'canceled')`), y los textos de estado reconocen `'canceled'`. El comentario interno menciona estados `past_due`/`paused` (dunning); esos caen al fallback (string crudo) en este badge, pero SI son reconocidos para mostrar "Cambiar tarjeta" (ver abajo).

### Proximo cobro / acceso

Si `coach.current_period_end` existe:
- Etiqueta condicional: `'Acceso hasta'` si `subscription_status === 'canceled'`, si no `'Próximo cobro'`.
- Fecha formateada `es-CL` (`day numeric, month long, year numeric`).
- Si `subscription_status === 'active'`: agrega ` · $<total> CLP` donde `total = billing?.totalClp ?? getTierPriceClp(tier, cycle)`. El total compuesto (base + add-ons) lo da el endpoint; el fallback a `getTierPriceClp` solo se usa si `billing` viniera null. Solo se muestra si `total > 0`.

Si NO hay `current_period_end` y el tier es `free`: muestra `Sin fecha de vencimiento · Gratis para siempre`.

### Tarjeta registrada + "Cambiar tarjeta"

Se muestra solo si `changeCardEnabled === true` (flag server-only, llega del endpoint) **Y** `subscription_status` esta en `['active', 'trialing', 'paused', 'past_due']`. Justificacion: en dunning (`paused`/`past_due`) cambiar la tarjeta es la recuperacion del cobro fallido (P0-3b).

- Si hay `card_last4`: muestra `Tarjeta: <marca> ···· <last4>`. La marca se traduce con `mpBrandLabel(card_brand)`: mapa `MP_BRAND_LABEL` (`visa`→Visa, `debvisa`→Visa débito, `master`→Mastercard, `debmaster`→Mastercard débito, `amex`→American Express, `diners`, `maestro`, `magna`, `naranja`, `cabal`). Fallback: el id capitalizado. (Razon: `debvisa` es id de maquina de MP, no marca legible — P1-8.)
- Si no hay `card_last4`: `Sin tarjeta registrada`.
- Boton "Cambiar tarjeta" → `router.push('/coach/subscription/update-card')`.

### Desglose compuesto (base + add-ons)

Solo si `subscription_status === 'active'` **y** `billing && billing.addonsClp > 0`. Tres lineas, todas tomadas del endpoint (la UI no calcula):
- `Plan base` → `$<billing.baseClp> CLP`
- `Módulos add-on` → `$<billing.addonsClp> CLP`
- `Total próximo cobro` → `$<billing.totalClp> CLP`

---

## 1.2. Add-ons (seccion "Módulos add-on") — catalogo + alta/baja

Seccion `id="addons"`, gateada en `coach`. Itera `ADDON_MODULE_KEYS` (= `MODULE_KEYS` de `entitlements.service`: los 4 modulos `cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges`).

### Datos por modulo

- `cfg = ADDON_CONFIG[key]` → `{ priceClpMensual: 9990 (uniforme, `ADDON_MONTHLY_PRICE_CLP`), label, description }`.
- `row = addonForKey(key)` → la fila viva relevante. `addonForKey` toma las filas con `status !== 'cancelled'` y prioriza la `self_service` sobre la `admin_grant` (una fila paga manda sobre el grant para mostrar la accion de baja; si solo hay grant, se muestra "Cortesía EVA"). Refleja la coexistencia D2 (un `admin_grant` y un `self_service` del mismo modulo pueden convivir).

### Estados derivados por modulo (todos espejo del backend de billing)

| Variable | Condicion | Badge mostrado |
|---|---|---|
| `isCourtesy` | `row.source === 'admin_grant'` | **Cortesía EVA** (`Gift`) + nota "Activo sin costo por cortesía de EVA. No se incluye en tu cobro." |
| `isActive` | `row.status === 'active' && source === 'self_service'` | **Activo** (`Check`) |
| `isCancelPendingCharged` | `status === 'cancel_pending' && source === 'self_service' && firstChargedAt !== null` | **Se desactiva el `<expiresAt>`** (fecha `es-CL` `day, month long`, o "fin del período") |
| `isCommitted` | `status === 'cancel_pending' && source === 'self_service' && firstChargedAt === null` | **Comprometido hasta el primer cobro** |
| `requiresNutritionTier` | `key === 'nutrition_exchanges' && !getTierCapabilities(coachTier).canUseNutrition` (D8) | **Requiere plan Pro+** (`Lock`) |
| (default) | sin fila viva, comprable | **Disponible** |

`canAdd = hasActivePaidPlan && !requiresNutritionTier && !row`.

`hasActivePaidPlan` = `coachTier !== 'free' && (subscription_status === 'active' || 'trialing')`.

### Precio por modulo (linea bajo el nombre)

Texto: `$<priceClpMensual> CLP / mes`. Si `coachCycle !== 'monthly'`, agrega ` (tu ciclo <anual|trimestral> descuenta <discountPercent>%)` con `BILLING_CYCLE_CONFIG[coachCycle].discountPercent` (trimestral 10, anual 20). Es solo informativo del descuento de ciclo; el monto por ciclo y el prorrateo los calcula el server.

### Boton Agregar / Quitar

- Si `isActive || isCancelPendingCharged || isCommitted` → boton **Quitar** (o "Baja solicitada" si ya esta en `cancel_pending`). `disabled` cuando: `addonSaving`, o `isCancelPendingCharged`, o `isCommitted`, o `!SELF_SERVICE_ADDONS_ENABLED`. Al click guarda `modalTriggerRef`, resetea `cancelAddonEffective=undefined`, abre modal de baja (`setCancelAddonKey(key)`).
- Si `canAdd` → boton **Agregar**. `disabled` cuando `addonSaving` o `!SELF_SERVICE_ADDONS_ENABLED`. Al click guarda `modalTriggerRef` y `openAddonModal(key)`.

### Gates visibles de la seccion

- Si `!hasActivePaidPlan`: nota "Los módulos add-on están disponibles con un plan pago activo."
- Si `hasActivePaidPlan && !SELF_SERVICE_ADDONS_ENABLED`: nota interina "La compra y baja de módulos estará disponible muy pronto." + mailto `contacto@eva-app.cl`.

> `SELF_SERVICE_ADDONS_ENABLED` (constants.ts) = `process.env.NEXT_PUBLIC_SELF_SERVICE_ADDONS_ENABLED === 'true'` (build-time inlined, fail-closed). En prod hoy esta OFF hasta el flip; los botones de alta/baja quedan deshabilitados aunque la seccion se vea.

### Modal de ALTA de add-on (catalogo "Agregar ahora")

Abierto por `addonModalKey`. Contenido:

1. **Titulo/descripcion** del modulo (`cfg.label`, `cfg.description`).
2. **Desglose** (todo del endpoint, la UI no calcula):
   - `Tu plan (<label>)` → `$<billing.baseClp ?? getTierPriceClp(coachTier, coachCycle)> CLP`.
   - `<cfg.label>` → `$<priceClpMensual> CLP / mes`.
   - Texto: "Pagas ahora un monto único prorrateado por los días que restan de tu ciclo. Desde la renovación, el valor del módulo se suma a tu cobro habitual. El monto exacto del pago inicial se calcula en el checkout seguro de Mercado Pago."
   - **Aviso de cupon condicional**: si `activeCoupon.spec.type === 'percent'` y (`target === 'total'` o (`target === 'module'` y `moduleKeys` incluye este modulo)), muestra "Tu cupón `<code>` (`<value clamp 0..100>`%) también se aplica a este módulo...". (Refleja que `computeDiscountedClp` con target total/module descuenta el add-on.)
3. **Condiciones de cobro (5 reglas)**: `getAddonPaymentRulesForCycle(coachCycle).rules`. Texto bifurcado por ciclo (mensual vs trimestral/anual) — ver constants. Las 5: (1) Activación inmediata, (2) Cobro y prorrateo, (3) Compromiso mínimo de 1 ciclo, (4) Cancelación sin reembolso de fracciones, (5) Precios de lista. Version `v2-2026-06`. Es la evidencia de consentimiento informado SERNAC (Ley 19.496).
4. **Checkbox obligatorio**: "Acepto estas condiciones de cobro, renovación y término." → `addonTermsAccepted`. Habilita el CTA. Al marcarse dispara funnel `addon_terms_accepted`.
5. **CTA "Ir a pagar"** (`handleAddAddon`): `disabled` si `!addonTermsAccepted || addonSaving || !SELF_SERVICE_ADDONS_ENABLED`.

`handleAddAddon` hace `POST /api/payments/addons` con body `{ moduleKey: key, acceptedTermsVersion: ADDON_PAYMENT_RULES.version }` (= `'v2-2026-06'`). Si la respuesta trae `kind === 'one_shot_checkout' && checkoutUrl`, dispara funnel `addon_oneshot_redirected` y hace `window.location.href = checkoutUrl` (redirige a MP — pago prorrateado one-shot, todos los ciclos). Cualquier otra respuesta lanza "No se pudo iniciar el pago del módulo." Errores → `setError`.

### Modal de BAJA de add-on

Abierto por `cancelAddonKey`. Dos fases segun `cancelAddonEffective`:

- **Fase confirmacion** (`cancelAddonEffective === undefined`): titulo "Quitar `<label>`", texto "Conservas el acceso hasta el final del período que ya pagaste. **No hay reembolsos** por fracciones no usadas. ¿Confirmas...?". Botones "Volver" / "Quitar módulo" (`disabled` si `addonSaving || !SELF_SERVICE_ADDONS_ENABLED`).
- **Fase resultado** (`cancelAddonEffective` seteado): titulo "**Baja registrada**", texto bifurcado:
  - Si hay `effectiveAt`: "Conservas el acceso a `<label>` hasta el `<fecha es-CL>`. Sin reembolso de fracciones."
  - Si `effectiveAt` es null (no cobrado aun = compromiso minimo): "Tu primer cobro incluirá igualmente `<label>` (compromiso mínimo de un ciclo). Después de ese cobro se programa su término. Sin reembolso de fracciones." (`data-testid="addon-cancel-effective"`)
  - Boton "Entendido".

`handleCancelAddon` hace `POST /api/payments/addons/cancel` con `{ moduleKey: key }`. Setea `cancelAddonEffective = payload.effectiveAt ?? null` y luego `refreshStatus()`. La baja NO redirige a MP (no hay cobro); solo registra estado `cancel_pending`. Sin reembolso por fracciones (regla 4).

---

## 1.3. Cambiar plan (seccion "Cambiar plan")

Gateada en `coach` cargado (evita que renderice con `coachTier='starter'` default y deje Starter clickeable unos segundos). Itera `tierOptions = SALE_TIERS.filter(t => t !== 'free')` → `starter`, `pro`, `elite`. (Free excluido: no se baja manualmente a free, es automatico al cancelar. growth/scale LEGACY no se ofertan.)

### Pills de ciclo (mensual/trimestral/anual)

- `allowedCycles = getTierAllowedBillingCycles(selectedTier)`; `allowedCycleOptions = cycleOptions.filter(...)`. Para los tiers de venta los 3 ciclos estan permitidos.
- Solo se muestran si `allowedCycleOptions.length > 1`.
- Cada pill: `BILLING_CYCLE_CONFIG[cycle].label` (`Mensual`/`Trimestral`/`Anual`). Anual y trimestral muestran badge `−<discountPercent>%` (anual −20%, trimestral −10%).
- Al click: `setSelectedCycle(cycle)`.
- Hay un `useEffect` de coherencia: si `selectedCycle` deja de ser valido para `selectedTier`, se resetea a `getDefaultBillingCycleForTier(selectedTier)`.

### Cards de tier (selector)

Por cada `tier` de `tierOptions`:

- Icono (`TIER_ICON`), label (`TIER_CONFIG[tier].label`), rango de alumnos (`TIER_STUDENT_RANGE_LABEL[tier]`).
- **Precio**: `price = getTierPriceClp(tier, <ciclo permitido o default>)`. Se muestra como `$<price> CLP/mes` (la cifra ya es el equivalente por ciclo elegido: el helper devuelve el total del ciclo... ver detalle de calculo abajo). Si `selectedCycle === 'annual'` y el tier permite anual, agrega `$<price*12> cobrado anualmente`.
- Hasta 3 features (`TIER_CONFIG[tier].features.slice(0,3)`).
- Badges: `getTierBillingCycleSummary(tier)` (ej. "Cobro mensual, trimestral o anual") + `getTierNutritionSummary(tier)` ("Incluye planes de nutrición" / "Sin módulo de nutrición").
- Badge promocional opcional (`TIER_BADGE`): `pro`→"Más popular", `growth`→"Nuevo" (growth no esta en `tierOptions`, asi que solo aplica a pro).

#### Bloqueos de seleccion (espejo de los 409 del server)

Dos guards que bloquean elegir un tier (card `aria-disabled`, no clickeable):

1. **`wouldExceed` (OVER_CAPACITY)**: `comparePlanDirection(coachTier, tier) === 'downgrade'` y `getTierMaxClients(tier) < activeClientCount`. Razon corta visible: "Sin cupo para tus alumnos activos." Tooltip: "Este plan permite hasta `<max>` alumnos y tienes `<activeClientCount>` activos. Archiva alumnos...". Badge `Sin cupo` con `Lock`.
2. **`nutritionBlocks` (NUTRITION_ADDON_ON_DOWNGRADE)**: `downgrade` a un tier sin nutricion (`!getTierCapabilities(tier).canUseNutrition`) mientras `hasLiveNutrition` (un add-on `nutrition_exchanges` con `status === 'active'`). Razon corta: "Quita el módulo de Nutrición primero." Badge `Nutrición` con `Lock`.

Si `isBlocked` (cualquiera de los dos): al click setea `blockedMsg` (banner ambar con `role="alert"`, scroll-into-view) en vez de seleccionar. Si no esta bloqueado: `setSelectedTier(tier)` y limpia `blockedMsg`.

> Solo `status === 'active'` de nutricion bloquea: si el add-on ya esta en `cancel_pending`, el downgrade se permite.

### Combo "Sumar módulos" (add-ons junto al cambio de plan)

Visible solo si `SELF_SERVICE_ADDONS_ENABLED` (flag de lanzamiento; oculto en prod hoy). Espejo del combo del signup (`register/page.tsx`).

- Itera `ADDON_MODULE_KEYS` con checkboxes. Estado `upgradeAddons: ModuleKey[]`.
- Texto: "Se cobran junto a tu plan en el mismo checkout y toman efecto al corte. Si necesitas un módulo de inmediato, usa 'Agregar' en la sección Módulos add-on (cobro prorrateado ahora)." (Dos superficies distintas: el combo cobra al corte, el catalogo cobra proracion inmediata.)
- Por modulo: `needsNutrition = key === 'nutrition_exchanges' && !getTierCapabilities(selectedTier).canUseNutrition` y `alreadyLive = !!addonForKey(key)`. `disabled = needsNutrition || alreadyLive`. Checkbox `checked = upgradeAddons.includes(key) && !alreadyLive`. Etiqueta "ya activo" (verde) o "requiere Pro+" (ambar).
- Dos `useEffect` saneadores: (a) si `selectedTier` pierde nutricion, saca `nutrition_exchanges` de `upgradeAddons`; (b) issue #12: saca de `upgradeAddons` cualquier modulo que ya tenga fila viva (lo cobraria dos veces / el server lo rechazaria).

### Calculo del precio mostrado (preview — la UI replica la fn pura del server)

Todo el bloque de precio del cambio de plan es **solo preview**; el monto real lo recalcula el server en el checkout (nunca confia en montos del cliente). Variables (page.tsx ~423-467):

- `selectedPrice = getTierPriceClp(selectedTier, selectedCycle)`.
  - `getTierPriceClp` (@eva/tiers): `monthly` si ciclo mensual; `applyDiscount(monthly*3, 0.1)` trimestral; `applyDiscount(monthly*12, 0.2)` anual. `applyDiscount(p, d) = Math.round(p*(1-d))`. Devuelve el **total del ciclo** (no el por-mes).
- `upgradeAddonsCycleTotal`: suma por cada `key` de `upgradeAddons` de `Math.round(ADDON_CONFIG[key].priceClpMensual * months * (1 - discountPercent/100))` con `months`/`discountPercent` de `BILLING_CYCLE_CONFIG[selectedCycle]`. (Mismo descuento de ciclo del plan sobre el add-on.)
- `selectedComposite = selectedPrice + upgradeAddonsCycleTotal`.
- `selectedAddonLines`: array `{ moduleKey, cycleAmountClp }` con el mismo calculo por add-on.
- `selectedCouponResult = activeCoupon ? computeDiscountedClp({ baseClp: selectedPrice, addons: selectedAddonLines, spec: activeCoupon.spec }) : null`.
  - `computeDiscountedClp` (@eva/tiers) es la **MISMA fn pura que cobra el server** → preview mostrado == lo que cobrara el server (sin drift). Compone el cupon sobre el composite ya con descuento de ciclo (decision CEO O8). Targets: `base` (solo plan), `module` (solo add-ons indicados por `moduleKeys`), `total` (toda la cuenta). Piso `DISCOUNT_NET_FLOOR_CLP = 0`. Si `spec.remainingCycles <= 0` el descuento no se aplica.
- `selectedCompositeNet = couponResult ? couponResult.netClp : selectedComposite`.
- `selectedCouponDiscount = couponResult ? couponResult.discountClp : 0`.

### Direccion del cambio (bifurca el copy del modal)

- `selectedDirection = comparePlanDirection(coachTier, selectedTier)` → `'upgrade' | 'downgrade' | 'same'` (orden total `free<starter<pro<elite<growth<scale`).
- `hasActivePaidPlan = coachTier !== 'free' && (status === 'active' || 'trialing')`.
- `isUpgradeNow = hasActivePaidPlan && selectedDirection === 'upgrade'` (espejo de `isActiveUpgrade` del server). Solo un upgrade de un pago activo se activa AHORA con cobro prorrateado; `free→paid` y reactivacion son altas completas, no cambios mid-cycle.
- `isNoOpChange = selectedTier === coachTier && selectedCycle === coachCycle` → deshabilita "Continuar".

### Barra de total + CTA "Continuar"

- Etiqueta: `Total (plan + módulos)` si hay `upgradeAddons`, si no `Total a pagar`.
- Cifra principal: si `selectedCouponDiscount > 0`, muestra `selectedComposite` tachado + `selectedCompositeNet`. Si no, `selectedComposite`. Sufijo ` / <label ciclo en minuscula>`.
- Si hay descuento: linea verde "Cupón `<code>` aplicado · −$`<descuento>`".
- Si hay add-ons: linea "plan $`<selectedPrice>` + `<n>` módulo(s) $`<upgradeAddonsCycleTotal>`".
- **CTA "Continuar →"**: `disabled` si `saving || isNoOpChange`. Tooltip de no-op: "Ya tienes este plan y ciclo...". Guarda `modalTriggerRef` y abre el modal de confirmacion (`setShowUpgradeConfirm(true)`). NO dispara el checkout directo — el checkout lo dispara "Confirmar" del modal.

### Modal de confirmacion de cambio de plan

Copy **bifurcado por `isUpgradeNow`** (issue #1):

- **Upgrade inmediato** (`isUpgradeNow === true`):
  - "Tu nuevo plan `<label>` se activa **ahora**. Hoy pagas solo la **diferencia prorrateada** por los días que restan de tu ciclo actual."
  - "Desde tu próxima renovación se cobra el valor completo **$`<getTierPriceClp(selectedTier, coachCycle)>` CLP / `<ciclo actual>`**" (+ " (más tus módulos add-on activos)" si hay alguno `self_service` no cancelado). "El monto exacto de la diferencia se calcula en el checkout seguro de Mercado Pago."
  - Si hay `upgradeAddons`: nota de que en un upgrade los modulos del combo "Sumar módulos" **no** se incluyen en el cobro inmediato (agregarlos despues desde el catalogo).
- **Downgrade / cambio de ciclo / alta** (`isUpgradeNow === false`):
  - Si hay `current_period_end`: "Tu plan actual (`<label>`) continúa hasta el `<fecha>`."
  - "A partir de esa fecha, tu nuevo plan `<label>` se activará por **$`<selectedCompositeNet>` CLP / `<ciclo elegido>`**" (+ "(cupón `<code>`: −$`<descuento>`)" si aplica) (+ "(plan $`<selectedPrice>` + `<labels add-ons>`)" si hay combo).

Avisos extra (ambos casos):
- Si el nuevo tier no incluye `'Planes de nutrición'` y el tier actual si: "⚠ El nuevo plan no incluye el módulo de nutrición. Perderás ese acceso al cambiar."
- Si hay add-ons `self_service` no cancelados: "Tus módulos add-on activos (`<labels>`) se mantienen y se suman al monto del nuevo plan en el checkout."

Botones: "Cancelar" (cierra) / **"Confirmar"** → `setShowUpgradeConfirm(false)` + `handleChangePlan()`.

### `handleChangePlan` (disparo del checkout de cambio de plan)

`POST /api/payments/create-preference` con body `{ tier: selectedTier, billingCycle: selectedCycle, addons: upgradeAddons }`. Manejo de respuesta:

- `409 OVER_CAPACITY`: lanza `payload.error` (o mensaje armado con `payload.maxClients` / `payload.activeClients`).
- `409 NUTRITION_ADDON_ON_DOWNGRADE`: lanza `payload.error` (o "Quita el modulo de Nutricion Pro antes de bajar a este plan.").
- Otro error: `payload.error ?? 'No se pudo iniciar el cambio de plan'`.
- OK sin `checkoutUrl`: "No se recibió URL de checkout".
- OK con `checkoutUrl`: `window.location.href = checkoutUrl` (redirige a MercadoPago). En error, `setSaving(false)`; en exito no se resetea `saving` (la pagina se abandona por el redirect).

---

## 1.4. Cupon de descuento (`CouponRedeemCard`)

Componente self-contained renderizado al tope de la pagina. Hace **su propia** llamada a `GET /api/payments/subscription-status` (`loadStatus`) para el gate y el cupon vigente — independiente del fetch de la pagina.

### Gate de visibilidad

`loadStatus` setea `enabled = tier && tier !== 'free' && (status === 'active' || status === 'trialing')` y `activeCode = data.activeCoupon?.code ?? null`. **Si `!enabled && !activeCode` → retorna `null`** (no renderiza). O sea: visible solo con plan pago activo/en prueba, o si ya hay un cupon aplicado.

### Maquina de estados (`phase`)

`'idle' | 'checking' | 'preview' | 'applying' | 'done'`.

- **Cupon ya aplicado** (`activeCode` presente): muestra "Código `<activeCode>` aplicado a tu suscripción." (no input).
- **`idle`**: input de texto (`code`) + boton **"Aplicar"** (`disabled` si `!code.trim()` o `phase === 'checking'`).
- **`onAplicar`** → `phase='checking'` → `POST /api/payments/redeem-coupon` con `{ code: code.trim(), commit: false }` (PREVIEW, no comitea). Si error: `setError(data.error)` y vuelve a `idle`. Si OK: guarda `data.preview` y `phase='preview'`.
- **`preview` / `applying`** (con `preview`): **disclosure SERNAC bloqueante** (`role="dialog" aria-modal="true"`, con focus-trap propio: Tab/Shift+Tab ciclan dentro, Escape cancela). Muestra:
  - `preview.termsText` (texto legal del cupon).
  - Desglose: `Precio normal` = `$<baseBeforeDiscountClp>` (tachado); `Descuento (<durationLabel>)` = `−$<discountClp>`; `Pagas` = `$<totalClp>` (estos montos vienen del SERVER, no se calculan en el cliente).
  - Botones: **"Confirmar y aplicar"** (`onConfirmar`, `disabled` si `phase==='applying'`, texto "Aplicando…" mientras) / "Cancelar" (vuelve a `idle`, limpia `preview`).
- **`onConfirmar`** → `phase='applying'` → `POST /api/payments/redeem-coupon` con `{ code, commit: true }` (COMMIT). Si error: `setError` y `idle`. Si OK: `phase='done'`, `activeCode = data.preview?.couponCode ?? code.trim()`.
- **`done`**: "¡Código aplicado! Se reflejará en tu próximo cobro."

`Preview` (tipo): `{ baseBeforeDiscountClp, discountClp, totalClp, couponCode, durationLabel, termsText }`.

> Flujo SERNAC explicito: Aplicar → PREVIEW server-priced → disclosure bloqueante (texto + precio del SERVER, con consentimiento via boton Confirmar dentro del focus-trap) → commit. El cliente nunca calcula el monto del cupon: todo lo arma `redeem-coupon` server-side. Los errores se muestran al pie en rojo.

### Interaccion con el resto de la pagina

El cupon vigente que muestra la **pagina** (`activeCoupon`) viene del fetch de `page.tsx`, separado del `CouponRedeemCard`. La pagina usa `activeCoupon.spec` para previsualizar el descuento sobre el tier/ciclo elegido (`selectedCouponResult`) y en el aviso del modal de alta de add-on. `CouponRedeemCard` solo lee `activeCoupon.code` para el gate de "ya aplicado". Tras aplicar un cupon, el `CouponRedeemCard` actualiza su propio `activeCode` localmente, pero la pagina recien lo refleja en su `activeCoupon` en el siguiente `refreshStatus()` (no se llama automaticamente al confirmar el cupon).

---

## 1.5. Cancelar suscripcion (seccion "Cancelar suscripción")

- Copy: si hay `current_period_end`, "Al cancelar, **conservarás acceso hasta el `<fecha es-CL>`**. Después de esa fecha tu cuenta quedará suspendida." Si no, "Cuéntanos el motivo para ayudarnos a mejorar."
- `<textarea>` para `reason` (4 filas, placeholder "Ejemplo: no usaré la app este mes...").
- Boton "Enviar solicitud de cancelación" (`disabled` si `saving`).

### `handleCancel`

- **Valida** `reason.trim()` no vacio en el cliente → si vacio: `setError('Cuéntanos una razón para cancelar.')` y aborta.
- `POST /api/payments/cancel-subscription` con `{ reason }`.
- Si error: `payload.error ?? 'No se pudo procesar la cancelación.'`.
- Si OK: `setSuccessMessage('Suscripción cancelada. Conservas acceso hasta el final del período que ya pagaste.')`, setea localmente `subscription_status: 'canceled'` (preserva `current_period_end` — el periodo de gracia depende de esa fecha), limpia `reason`.
- NO redirige a MP (cancelar no genera cobro). El acceso se conserva hasta `current_period_end` (la puerta real la maneja `coach-subscription-gate.ts`, fuera de esta pagina).

---

## 1.6. Historial de pagos (seccion "Historial de pagos")

- Tabla de `events` (`SubscriptionEvent[]`): columnas Fecha, Estado, Monto, Referencia.
- Si `events.length === 0`: "Aún no hay movimientos de suscripción registrados."
- Por evento:
  - Fecha: `created_at` formateada `es-CL` (`dateStyle short`, `timeStyle short`, zona local).
  - Estado: `provider_status ?? '—'`.
  - Monto: `extractAmountClpFromEventPayload(payload)` → busca `transaction_amount` en `payload.transaction_amount`, `payload.auto_recurring.transaction_amount` o `payload.data.transaction_amount` (numero o string parseable, `>0`, `Math.round`). Muestra `$<amount> CLP` o `—`.
  - Referencia: `<provider> · <provider_checkout_id>` (o solo `provider` si no hay id).

---

## 1.7. Feedback post-checkout (banners al volver de MercadoPago)

Las pantallas de procesamiento redirigen a `/coach/subscription` con query params. Un `useEffect` (guard `checkoutFeedbackHandledRef`) lee `?addon=` y `?upgrade=` y luego hace `router.replace('/coach/subscription')` (limpia el param para que un refresh no re-muestre el banner):

| Param | Banner |
|---|---|
| `?addon=success` | success: "Tu módulo quedó activo y se suma a tu próximo cobro." + `refreshStatus()` |
| `?addon=pending` | error/aviso: pago en proceso, se activa al confirmar MP + `refreshStatus()` |
| `?addon=failure` | error: "No se pudo completar el pago del módulo. No se realizó ningún cobro." |
| `?upgrade=success` | success: "Plan actualizado." + `refreshStatus()` |
| `?upgrade=pending` | error/aviso: cambio de plan en proceso + `refreshStatus()` |
| `?upgrade=failure` | error: "No se pudo completar el cambio de plan. No se realizó ningún cobro." |

Los valores exactos vienen de `addon-processing` / `upgrade-processing` + `create-preference`.

### Banners globales de feedback

- Error: `<p role="alert" aria-live="assertive">` con `error`.
- Exito: `<p aria-live="polite">` con `successMessage`.
- Ambos hacen scroll-into-view al setearse (se renderizan al final de la pagina, off-screen en movil cuando se disparan desde mas arriba). El banner ambar de bloqueo (`blockedMsg`) tambien.

---

## 1.8. Resumen de CTA y a donde llevan

| CTA | Accion | Endpoint / destino |
|---|---|---|
| "Cambiar tarjeta" | `router.push` | `/coach/subscription/update-card` |
| "Continuar →" (cambiar plan) | abre modal confirmacion | (no dispara checkout aun) |
| "Confirmar" (modal cambio plan) | `handleChangePlan` | `POST /api/payments/create-preference` → `window.location.href = checkoutUrl` (MercadoPago) |
| "Agregar" (modulo) | abre modal alta | (no dispara checkout aun) |
| "Ir a pagar" (modal alta add-on) | `handleAddAddon` | `POST /api/payments/addons` → `window.location.href = checkoutUrl` (one-shot prorrateado MP) |
| "Quitar" / "Quitar módulo" | `handleCancelAddon` | `POST /api/payments/addons/cancel` (sin redirect; `cancel_pending`) |
| "Aplicar" (cupon) | `onAplicar` | `POST /api/payments/redeem-coupon` `{commit:false}` (preview) |
| "Confirmar y aplicar" (cupon) | `onConfirmar` | `POST /api/payments/redeem-coupon` `{commit:true}` (commit) |
| "Enviar solicitud de cancelación" | `handleCancel` | `POST /api/payments/cancel-subscription` (sin redirect) |

### Invariantes money-safety de la pagina

- La UI **nunca** decide montos para el cobro: para el estado actual usa `billing.*` del endpoint; para el preview de cambio usa `getTierPriceClp` + `computeDiscountedClp` (las MISMAS fn puras de `@eva/tiers` que ejecuta el server), pero el monto **real** lo recalcula el server en `create-preference`/`addons` (nunca confia en montos del cliente).
- Add-ons con fila viva no viajan en el combo de cambio de plan (sanea `upgradeAddons`) → evita doble cobro.
- Los gates de seleccion de tier (OVER_CAPACITY / NUTRITION_ADDON_ON_DOWNGRADE) son espejo de los 409 del server; el bloqueo del cliente es UX, el server es la autoridad.
- El consentimiento SERNAC (checkbox add-on con `terms_version v2-2026-06`; disclosure de cupon con texto+precio del server) precede a todo cobro.
