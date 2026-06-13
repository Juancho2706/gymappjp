# SPEC — Billing de add-ons self-service (módulos como add-ons de pago)

**Status:** DRAFT (listo para implementación por fases)
**Owner:** Juan V.
**Last updated:** 2026-06-12
**Related plan:** `docs/plans/estrategia/05-PLAN-billing-addons-selfservice.md` · Director estrategia: `docs/plans/estrategia/00-DIRECTOR.md` · Doc fuente: `docs/plans/estrategia/2026-06-11-teams-first-modulos-addons.md` §2.3 / §4
**Módulos:** `cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges` (`MODULE_KEYS`, `apps/web/src/services/entitlements.service.ts`)
**Constantes congeladas (F0, este branch):** `ADDON_CONFIG` + `ADDON_PAYMENT_RULES` en `apps/web/src/lib/constants.ts`

> Estado: fundación lista. Los 4 módulos ya existen y se gatean por `enabled_modules`
> (`entitlements.service.ts`). El catálogo read-only de Settings > Módulos lo construye el
> plan 03. El motor de cobro (un solo preapproval MP por coach, supersede, webhook,
> reconcile) ya existe para el plan base (plan 04). Este plan agrega la capa de COMPRA
> self-service de los módulos sobre ese motor: tabla `coach_addons` como fuente de verdad,
> monto compuesto (plan base + add-ons), y las 5 reglas de pago con consentimiento informado.

---

## Problema / Por qué

Hoy un coach standalone NO puede comprarse ni darse de baja un módulo sin que intervenga
el CEO (toggle manual). La decisión Teams-first (socios, 2026-06-11) define los 4 módulos
como add-ons de pago self-service a **$9.990/mes de lista uniforme**, con descuento por
ciclo (trimestral −10%, anual −20%). Sin self-service: cada alta/baja es trabajo manual del
dueño, no escala, y el coach no tiene control sobre lo que paga — fricción comercial directa.

El motor debe: (1) cobrar add-ons dentro del MISMO preapproval del plan base (un solo cobro,
sin un segundo medio de pago — la fricción que el doc fuente §4.1 descarta); (2) cumplir la
normativa chilena de renovación automática (Ley 19.496 / SERNAC): condiciones de cobro,
renovación y término informadas ANTES de contratar, baja self-service por el mismo medio que
el alta; (3) no hostigar: exactamente 2 superficies de venta (catálogo Settings > Módulos +
sección Add-ons de /coach/subscription), CERO banners nuevos.

## Users

- **Primary:** coach standalone con plan pago activo (compra/baja sus propios módulos).
- **Primary:** coach en signup (tier pago) que quiere arrancar con módulos.
- **Secondary:** coach que reactiva su suscripción y recupera ex-add-ons.
- **Internal/operator:** CEO (cortesías vía `admin_grant`), operador (kill-switch, reconcile),
  dueño (boleta/IVA manual mientras EVA opere como persona natural).
- **Excluidos del flujo:** coaches de team/org (`team_managed`/`org_managed`) — sus add-ons
  van por contrato + toggle CEO; quedan fuera por `canViewBilling` (ya implementado). Movida
  es contrato custom, EXENTA de todo este motor.

## Goals

- Coach standalone activo compra y se da de baja los 4 módulos sin intervención del CEO.
- Un solo preapproval MP por coach; monto = plan base + add-ons facturables (monto compuesto).
- 5 reglas de pago visibles + checkbox de aceptación, con consentimiento persistido
  (`terms_version` + `terms_accepted_at`) y texto íntegro guardado en el evento de alta.
- Mecánica de alta BIFURCADA por ciclo (decisión final del dueño): mensual = cortesía hasta el
  corte; trimestral/anual = one-shot prorrateado inmediato + add-on a la renovación.
- Cero drift `enabled_modules ↔ coach_addons` (trigger de DB recomputa en la misma transacción).
- Cero superficies de venta fuera de las 2 permitidas; CERO mención de IVA en el copy.

## Non-Goals

- **Bundle de 4 módulos** (descuento −20/25%): post-v1 (F7), ratificado por el dueño.
- **Add-ons para teams/org:** por contrato + toggle CEO; fuera de este motor.
- **Prorrateo general v2:** solo el one-shot prorrateado de alta trim/anual entra en v1.
- **Boleta/emisión tributaria automática:** proceso manual del dueño (persona natural).
- **Publicar precios de lista** (landing/pricing): post-cierre Movida (roadmap plan 02).
- **Copy de IVA:** silencio total hasta constituir EVAapp SpA (tarea de revisión en MANUAL_TASKS).
- **Prender `SELF_SERVICE_ADDONS_ENABLED`:** es el switch de lanzamiento MANUAL (post-gate +
  sandbox MP verde + hardening RLS del plan 03 en prod), NO parte del desarrollo.

## User Stories

- Como **coach standalone con plan mensual**, quiero agregar un módulo y que se active al
  instante, pagándolo completo recién desde mi próximo cobro (cortesía la fracción restante),
  para probarlo sin un cargo inmediato sorpresa.
- Como **coach standalone con plan trimestral/anual**, quiero agregar un módulo pagando ahora
  solo la fracción que resta de mi ciclo (prorrateado) y que desde la renovación se sume al
  cobro habitual, para no regalar meses ni quedar comprometido a un ciclo completo a ciegas.
- Como **coach**, quiero darme de baja un módulo cuando quiera por el mismo medio que lo
  contraté, conservando el acceso hasta el fin del ciclo ya pagado, para tener control sin
  llamar a soporte.
- Como **coach que cambia de plan (upgrade/downgrade o cambio de ciclo)**, quiero que mis
  add-ons activos viajen automáticamente al plan nuevo, para no perderlos ni descubrir el monto
  real recién en el checkout de MercadoPago.
- Como **coach en signup (tier pago)**, quiero un paso opcional para elegir módulos con el
  total en vivo, para arrancar con todo desde el primer cobro.
- Como **coach que reactiva su suscripción**, quiero que mis ex-add-ons aparezcan pre-marcados
  (deseleccionables) al precio de lista vigente, para recuperarlos sin reconfigurar.
- Como **CEO**, quiero conceder un módulo gratis (cortesía) a un coach standalone sin que el
  próximo cambio de add-ons lo pise, para hacer excepciones comerciales auditables.
- Como **coach que navega directo a una URL de módulo apagado**, quiero un aviso amable hacia
  el catálogo (sin precio ni urgencia) en vez de un error seco.

## Acceptance Criteria — por regla de pago

> Las 5 reglas viven textuales en `ADDON_PAYMENT_RULES` (`constants.ts`, `terms_version: 'v1-2026-06'`),
> con variante mensual vs trimestral/anual bajo la misma versión. Reglas 1-3 bifurcan por ciclo.

### Regla 1 — Activación inmediata al confirmar
- [ ] **Mensual:** al confirmar el modal (checkbox aceptado) → INSERT `coach_addons` `status='active'`
      → el trigger de DB prende `coaches.enabled_modules.<key>` en la MISMA transacción → el módulo
      queda usable de inmediato.
- [ ] **Trimestral/anual:** "confirmar" redirige al checkout del one-shot prorrateado; la fila y el
      módulo se materializan recién cuando el webhook ve el pago aprobado (no antes).
- [ ] Checkout/one-shot abandonado → cero filas, cero módulos prendidos.

### Regla 2 — Cobro y prorrateo
- [ ] **Mensual:** se cobra completo desde el próximo corte; la fracción restante es cortesía
      (`first_charged_at IS NULL` hasta que el webhook ve el primer cobro recurrente; sin one-shot).
- [ ] **Trimestral/anual:** la alta cobra de inmediato un one-shot prorrateado por la fracción
      restante del ciclo (días restantes / días del ciclo × monto-por-ciclo con descuento, alineado
      al corte real del preapproval, mínimo 1 día — nunca $0), y un PUT suma el add-on al monto del
      preapproval desde la renovación; `first_charged_at` = fecha del one-shot aprobado.
- [ ] El monto del one-shot lo calcula SOLO el servidor (`getAddonProrationClp`); el cliente jamás
      manda montos.

### Regla 3 — Compromiso mínimo de 1 ciclo cobrado
- [ ] **Mensual, baja antes del 1er cobro** (`first_charged_at IS NULL`): → `cancel_pending` SIN bajar
      el monto en MP (el próximo corte cobra el add-on igual); recién cobrado, se programa la salida
      (PUT que lo excluye + `expires_at`).
- [ ] **Trimestral/anual:** el compromiso queda CUBIERTO por el one-shot inicial → la baja siempre va
      por la regla 4 (no existe la rama "antes del 1er cobro" porque `first_charged_at` ya está seteado).

### Regla 4 — Cancelación efectiva al fin del ciclo, sin reembolso de fracciones
- [ ] Baja con `first_charged_at` seteado → `cancel_pending` + PUT bajando el monto YA (el próximo
      cobro lo excluye); acceso ON hasta `expires_at` = fin del período ya pagado.
- [ ] La baja es self-service por el mismo medio que el alta (requisito de la norma) y no hay
      reembolso de fracciones no usadas; la UI muestra la fecha efectiva devuelta por el endpoint.

### Regla 5 — Precios de lista; contratos custom exentos
- [ ] Teams / `team_managed` / `org_managed` quedan excluidos del flujo por `canViewBilling`
      (ya implementado). Movida (contrato custom) no pasa por este motor.

## Acceptance Criteria — transversales

- [ ] **Seguridad / RLS:** `coach_addons` y `billing_snapshots` con `enable row level security` +
      ÚNICA policy SELECT propio (`coach_id = (select auth.uid())`); CERO policies de
      INSERT/UPDATE/DELETE para `authenticated` → toda escritura solo service-role. El cliente jamás
      manda montos ni módulos al cálculo del monto compuesto.
- [ ] **Sin drift por construcción:** trigger `AFTER INSERT OR UPDATE OR DELETE ON coach_addons`
      recomputa `enabled_modules` de las filas vivas (`active`/`cancel_pending`); cancelar el último
      add-on deja `enabled_modules = '{}'` (no NULL — pin del `coalesce`).
- [ ] **Override CEO write-through (D2):** la cortesía es fila `source='admin_grant'`, `price_clp=0`,
      excluida del monto compuesto; coexiste con una fila paga del mismo módulo (índice único incluye
      `source`); el CEO NO escribe `enabled_modules` directo para standalone.
- [ ] **Monto compuesto único:** `getCompositeAmountClp(tier, cycle, billableAddons)` es el único
      cálculo del monto; lo consumen create-preference, PUT, UI y tests.
- [ ] **Evidencia SERNAC:** `billing_snapshots` congela el desglose base+add-ons de CADA cobro
      (recurrente y one-shot), idempotente por `provider_payment_id`; el evento de alta guarda el
      TEXTO íntegro de las 5 reglas aceptadas + `terms_version`.
- [ ] **Reconciliación:** `mp-reconcile` pasa a DIARIO (`0 10 * * *`) y detecta expiraciones, drift de
      monto (solo alerta, no auto-fix), kill-switch prolongado y `paused` prolongado.
- [ ] **Anti-hostigamiento:** grep final confirma cero superficies de venta fuera de las 2 permitidas;
      el funnel PostHog (catálogo → modal → checkbox → confirmado) es analítica pasiva, no venta.
- [ ] **Mobile/responsive:** la sección Add-ons y los modales usan `dvh`/safe-area según las reglas;
      sin `h-screen`/`100vh` fuera de `md:`.
- [ ] **Dark mode:** componentes nuevos (sección Add-ons, modales, `ModuleOffNotice`, paso signup)
      con variantes dark.
- [ ] **Observabilidad / soporte:** recibo transaccional por email en alta/baja (desglose + reglas +
      fecha efectiva); RUNBOOK con divergencia de monto, PUT caído, dunning `paused`, kill-switch
      prolongado; métricas de adopción de add-ons en /admin.
- [ ] **Copy:** CERO mención de IVA en ADDON_CONFIG, ADDON_PAYMENT_RULES, modales, emails y pricing.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Timing del PUT no documentado por MP (¿cargo inmediato? ¿próximo cobro?) | Reglas 2-4 cambian de mecánica | Sandbox bloqueante ítem #1 antes de cualquier coach real; mensual sin prorrateo; el prorrateo trim/anual va por one-shot separado (Checkout Pro), NO por el PUT |
| Match de payment events recurrentes (`payment.order.id` ≠ preapproval id) | Mal match marca `first_charged_at` con un pago ajeno | Payload real en sandbox (ítem #2) antes de fijar el campo; `markFirstCharged` set-once limita el daño |
| Drift DB↔MP (PUT caído tras INSERT) | Coach con módulo ON y monto MP viejo | DB-primero + reversión inmediata (D5, ventana de ms) + reconcile diario que alerta; nunca auto-fix |
| Kill-switch de operador vs cobro (módulo apagado, cobro vivo) | Cobrar servicio no provisto = exposición SERNAC | Reconcile alerta semiautomática cuando un add-on facturable lleva > N días en `EVA_DISABLED_MODULES`; CEO compensa (pausa/cortesía) |
| Choque con gate Movida pendiente | Migración no debe entrar en el mismo branch | Timestamp posterior a `20260611*`; branch efímero propio; se ejecuta solo tras sellar ese gate, con OK del usuario |
| Coach free/starter compra `nutrition_exchanges` | Vendido sin soporte → reclamo | D8: `canPurchaseAddon` + validación espejo en create-preference (signup) + copy "requiere Pro+" |
| Doble clic del coach en el one-shot trim/anual | Dos preferences vivas; 2ª aprobación choca con índice único | Idempotencia por `provider_payment_id` en snapshots + índice único parcial en `coach_addons` → no-op amable |

## Open Questions

- [ ] (Bloqueante de LANZAMIENTO, no de desarrollo) Sandbox MP: ¿cuándo aplica el PUT? ¿genera cargo?
      ¿llega el evento `updated`? — resuelto en el GATE vía `SANDBOX-CHECKLIST.md` (9 ítems).
- [ ] (Resuelto por el dueño 2026-06-11, conservado por trazabilidad) Precio diferenciado por módulo
      → descartado: **$9.990 uniforme**. Descuento por ciclo → SÍ. Copy IVA → silencio total. Bundle
      → post-v1. Starter + `nutrition_exchanges` → NO (Pro+).
