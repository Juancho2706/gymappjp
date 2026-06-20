# Discount Codes (Cupones) - SPEC

**Status:** DRAFT
**Owner:** CEO (Juan / JP)
**Last updated:** 2026-06-19
**Related plan:** `specs/discount-codes/PLAN.md` · audit memory `project_discount_codes_plan`

---

## Problem

El CEO cierra deals que requieren entregar descuentos a coaches concretos: "3 códigos de 50% en plan por X tiempo/vida", "20% para X coaches independientes que entren", etc. Hoy **no existe** ningún sistema de cupones en EVA. El único mecanismo de cortesía es `admin_grant` (módulos gratis price 0 vía `syncAdminGrants`), que no cubre descuentos porcentuales sobre el plan ni códigos auto-canjeables por el usuario.

Se necesita: que el CEO **cree códigos** desde su panel, y que el coach los **canjee** en su menú de suscripción, aplicando el descuento al cobro recurrente de MercadoPago — de forma money-safe, drift-safe y conforme a SERNAC.

## Users

- **Primary:** Coach standalone (canjea un código en `/coach/subscription` y ve su precio con descuento).
- **Secondary:** Coach que se registra con un código de promo (canje en el primer checkout).
- **Internal/operator:** CEO/admin (crea, lista, revoca códigos y audita redenciones en `/admin`).

## Goals

- CEO crea códigos con: tipo (`percent` | `fixed_clp` | `free_period`), duración (`once` | `repeating` N ciclos | `forever`), alcance (plan tier(s) y/o `module_key`(s)), cap global de redenciones, expiración, límite por cuenta, `first_time_only`.
- Coach canjea un código en su menú de suscripción; el descuento se aplica al `transaction_amount` del preapproval de MP y **persiste** en cada renovación según la duración.
- Cada cobro descontado deja evidencia congelada (base, descuento, total, código) para SERNAC.
- Redención server-side, idempotente, atómica contra el cap; un coach no puede auto-otorgarse descuentos.
- Disclosure SERNAC clara antes de canjear (duración, precio al que revierte, auto-renovación).

## Non-Goals

- **Stacking** de cupones (default OFF: un cupón activo por suscripción). Se diseña la tabla para permitirlo después, pero no se implementa en v1.
- Cupones para módulos cortesía **100%-off-forever**: eso sigue por el path `admin_grant` existente (no por el motor de cupones pago).
- Cupones aplicables a orgs enterprise o teams (v1 = coach standalone; teams se cotizan por contrato/CEO).
- Generación masiva de miles de códigos únicos (batch) — el modelo lo soporta (`code_kind='unique_batch'`) pero la UI v1 hace códigos single/reusables.
- Gateway-level coupons: MP no los tiene; todo el cálculo es interno.

## User Stories

- Como **CEO**, quiero crear un código `AMIGO50` de 50% sobre el plan por 6 ciclos con cap de 3 usos, para entregárselo a 3 partners.
- Como **CEO**, quiero crear un código `INDIE20` de 20% forever con cap de 20 usos y `first_time_only`, para captar coaches independientes.
- Como **CEO**, quiero revocar un código y ver quién lo canjeó y cuánto descuento se aplicó.
- Como **coach**, quiero ingresar un código en mi menú de suscripción y ver el precio con descuento antes de confirmar, sabiendo cuándo termina y a cuánto vuelve.
- Como **coach nuevo**, quiero aplicar un código de promo durante el registro para que mi primer cobro ya venga con descuento.

## Acceptance Criteria

- [ ] **Funcional:** un código válido aplicado reduce el `transaction_amount` del preapproval (recurrente) o el `unit_price` del one-shot (alta de add-on / upgrade) al neto calculado server-side.
- [ ] **Drift-safe:** el descuento vive dentro de `getCompositeAmountClp` (vía `coaches.active_coupon_redemption_id`); el webhook/PUT de renovación recomputa el MISMO neto y no lo marca como `addon_amount_drift` ni lo revierte. Duración `repeating` decrementa ciclos; al agotarse, el siguiente PUT restaura precio lleno.
- [ ] **Money-safety:** redención y cambio de precio son service-role only; el cliente solo manda el string del código; nunca se confía un monto del body.
- [ ] **Atomicidad:** el cap global y el `per_account_limit` se enforcean a nivel DB (índice único parcial sobre redenciones vivas) — el Nth+1 canje se rechaza sin condición de carrera.
- [ ] **Evidencia (SERNAC):** cada cobro descontado escribe en `billing_snapshots`: `base_before_discount_clp`, `discount_clp`, `coupon_code`, `total_clp`.
- [ ] **Disclosure (SERNAC):** antes de confirmar el canje, el coach ve duración del descuento, precio al que revierte y que la suscripción se auto-renueva.
- [ ] **Abuse:** rate-limit de intentos de canje (IP/cuenta), normalización case-insensitive, bloqueo de alias `+` en email para `first_time_only`, audit trail append-only.
- [ ] **Mobile/responsive:** input de código y preview de descuento usable en `/coach/subscription` en viewport PWA (`dvh`, safe areas).
- [ ] **Reporting:** MRR / addon-metrics / finanzas reflejan ingresos descontados (no precio lista) y respetan la exclusión de cuentas de prueba.
- [ ] **Inmutabilidad:** un código ya canjeado congela sus términos económicos; editar = nuevo código.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Descuento aplicado solo en checkout → revertido en la renovación por el recompute del webhook | Alto (cobro lleno sorpresa, queja SERNAC) | El descuento DEBE leerse dentro de `getCompositeAmountClp` en TODOS los call sites (checkout, PUT, webhook reconcile) |
| Carrera en el cap ("primeros 20") → más redenciones que el límite | Medio (pérdida $) | Cap enforce por índice único parcial + count atómico, no chequeo en app |
| Coach existente churnea y re-entra para tomar promo new-customer | Medio | `first_time_only` = sin transacción pagada previa; bloquear alias `+`/desechables |
| MP no documenta CUÁNDO toma efecto un nuevo `transaction_amount` | Medio | Reusar `mp-reconcile` cron + drift detection ya existentes; validar en sandbox |
| Disclosure insuficiente → multa SERNAC hasta 300 UTM | Alto (legal) | UX de disclosure obligatoria antes de confirmar + snapshot de evidencia por cobro |
| `free_period` fingido como cargo $0 | Medio (edge cases MP) | Usar `auto_recurring.free_trial` nativo de MP |

## Open Questions

- [ ] ¿`free_period` (meses gratis) se ofrece en v1 o se difiere? (requiere wiring de `free_trial` en create-preference).
- [ ] ¿El descuento `fixed_clp` aplica sobre base, sobre add-ons, o sobre el total? (recomendado: sobre base; definir).
- [ ] ¿Un código puede targetear un `module_key` específico (descuento solo sobre un add-on) en v1, o v1 = solo plan base?
- [ ] ¿Quién además del CEO puede mintear códigos? (recomendado: solo `ADMIN_EMAILS`).
- [ ] ¿Texto legal exacto de disclosure (revisar con Legal/Compliance Chile) para el copy del canje?
- [ ] ¿Se permite cancelar/revertir una redención activa (status `reverted`) desde el panel CEO, y qué pasa con el precio en la próxima renovación?
