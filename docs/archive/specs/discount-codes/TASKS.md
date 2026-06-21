# Discount Codes (Cupones) - TASKS

**Status:** DRAFT
**Owner:** CEO (Juan / JP)
**Last updated:** 2026-06-19
**Spec:** `specs/discount-codes/SPEC.md`
**Plan:** `specs/discount-codes/PLAN.md`

---

## F0 — Decisiones (bloquea código)

- [ ] T0.1 - Cerrar open questions del SPEC con CEO + Legal
  - Scope: free_period sí/no en v1; fixed_clp sobre base/total; scope por module_key en v1; copy legal de disclosure; revert de redención.
  - Verification: SPEC §Open Questions resuelto, sin TBD.

## F1 — DB (migración aditiva)

- [ ] T1.1 - Migración `<ts>_discount_codes.sql`
  - Scope: `coupons`, `coupon_codes`, `coupon_redemptions` (con CHECKs e índices únicos parciales); `coaches.active_coupon_redemption_id`; extends de `billing_snapshots`; trigger recompute; RLS (write service-role, SELECT propio); column grants (col compra-only).
  - Verification: snapshot + tx-rollback (`SET LOCAL ROLE authenticated` + jwt.claims) prueba que `authenticated` NO escribe cupones/redenciones ni setea `active_coupon_redemption_id`; `get_advisors` security+performance 0 críticos; EXPLAIN del lookup de código usa el índice.
- [ ] T1.2 - Regenerar `database.types.ts`
  - Scope: tras merge de la migración (MCP generate types o `gen types`).
  - Verification: `pnpm typecheck` verde con las nuevas tablas tipadas.

## F2 — Motor de precio (sin UI)

- [ ] T2.1 - `coupons.pricing.ts` función pura `computeDiscountedClp`
  - Scope: percent/fixed_clp/free_period × once/repeating/forever; redondeo CLP entero; respeta scope (base / módulo); nunca < 0.
  - Verification: vitest matriz de casos (incluye bordes: 100%, fixed > base, repeating con ciclos agotados).
- [ ] T2.2 - Integrar descuento activo en `getCompositeAmountClp`
  - Scope: leer `coaches.active_coupon_redemption_id` → aplicar neto en TODOS los callers (create-preference, PUT renovación, webhook reconcile).
  - Verification: test integración — checkout y webhook reconcile producen el MISMO neto; no se loguea `addon_amount_drift`.
- [ ] T2.3 - `coupons.service.ts` validación + redención atómica
  - Scope: validar (activo/expiry/cap/per-account/first_time/scope/min_amount); insertar redención (service-role) respetando el índice único parcial; setear `active_coupon_redemption_id`.
  - Verification: test de carrera (N canjes simultáneos al cap → exactamente cap aceptados); first_time bloquea coach con transacción previa.
- [ ] T2.4 - Decremento de ciclos + restauración de precio
  - Scope: en cada cobro recurrente (webhook), decrementar `applied_cycles_remaining` para `repeating`; al llegar a 0 → status `expired` + próximo PUT restaura precio lleno.
  - Verification: test simula N+1 cobros; el ciclo N+1 cobra precio lista.

## F3 — CEO panel

- [ ] T3.1 - `/admin/(panel)/codigos` page + `_data` + `_actions`
  - Scope: listar cupones + crear (`mintCouponAction`, Zod) + revocar (`revokeCouponCodeAction`); service-role write (patrón `module-form` pure builders).
  - Verification: typecheck; crear código `INDIE20` y verlo; revocar y ver estado.
- [ ] T3.2 - Drill-down de redenciones + nav
  - Scope: por código, listar redenciones (coach, fecha, descuento, snapshot); entrada en `AdminSidebar.tsx`.
  - Verification: nav aparece; redenciones se listan; gate `ADMIN_EMAILS` heredado.

## F4 — Canje coach

- [ ] T4.1 - Input + preview + breakdown en `/coach/subscription`
  - Scope: input código, apply/clear, estados, línea `base → descuento → total`.
  - Verification: aplicar código válido muestra neto; inválido/expirado/usado muestran mensaje correcto; mobile `dvh`/safe-area.
- [ ] T4.2 - Disclosure SERNAC antes de confirmar
  - Scope: duración, precio al que revierte, auto-renovación (copy aprobado por Legal).
  - Verification: no se puede confirmar sin ver la disclosure; texto coincide con el aprobado.
- [ ] T4.3 - Validación server-side en checkout
  - Scope: `discountCode?` en Zod de create-preference/addons; canje + net amount; `subscription-status` expone descuento.
  - Verification: nunca se confía monto del body; el preapproval se crea/PUTea al neto.
- [ ] T4.4 (opcional) - Código en registro
  - Scope: aceptar código en el primer checkout desde `register.actions.ts`.
  - Verification: primer cobro viene con descuento.

## F5 — Abuse + reporting + QA

- [ ] T5.1 - Rate-limit + normalización + anti-alias
  - Scope: Upstash rate-limit por IP/cuenta en intentos de canje; case-insensitive; bloquear `+`/desechables para `first_time_only`; audit trail.
  - Verification: test rate-limit dispara; `JUAN+x@` no pasa first_time.
- [ ] T5.2 - Reporting MRR/finanzas con descuento
  - Scope: ingresos descontados (no lista) en getFinanzasData/addon-metrics; respetar `lib/test-accounts.ts`.
  - Verification: MRR refleja neto; cuentas test excluidas.
- [ ] T5.3 - QA sandbox MP + flag de lanzamiento
  - Scope: Simulador de Notificaciones (modo test NO manda webhooks); flag fail-closed; redeploy.
  - Verification: cobro recurrente simulado confirma `transaction_amount` neto + snapshot con `discount_clp`/`coupon_code`.

## Universal Definition of Done

- [ ] `pnpm typecheck`
- [ ] Targeted tests for billing/coupons domain (vitest)
- [ ] No direct feature-data Supabase calls in `_data` (van por services → repositories)
- [ ] Server actions validate with Zod (cliente + servidor)
- [ ] Mutations call `revalidatePath()` where needed
- [ ] Mobile viewport uses `dvh`, not `vh`/`h-screen`
- [ ] Fixed edge UI uses safe-area utilities
- [ ] Dark mode checked when UI changes
- [ ] Migración aditiva/idempotente, forward-only, validada con advisors (0 críticos) + snapshot prod
- [ ] RLS isolation tests pasan (coach no auto-otorga; no ve redenciones ajenas)
- [ ] Money gate server-side; redención idempotente y atómica
- [ ] Disclosure SERNAC presente; evidencia en `billing_snapshots`
- [ ] Docs canónicas actualizadas (FLOWS_AND_COMPONENTS, schema en CLAUDE.md/AGENTS)

## Notes

- Cortesía 100%-off-forever de módulos NO va por acá → `admin_grant` (`syncAdminGrants`).
- Default no-stackable (un cupón activo por suscripción).
- Riesgo #1 = drift: el descuento debe vivir en `getCompositeAmountClp`, no solo en el checkout.
- MP no tiene cupón nativo: todo el cálculo es interno; el gateway solo recibe el neto.
