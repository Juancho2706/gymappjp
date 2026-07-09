-- MIGRATION — pagos multi-gateway (Flow.cl + MercadoPago), Ola 1 (andamiaje DB).
-- Spec: specs/pagos-multigateway-flow/ (SPEC.md / PLAN.md §Data Model / TASKS.md T1.4).
--
-- Aditiva, forward-only, idempotente (IF NOT EXISTS / IF EXISTS): re-ejecutable sin efecto
-- destructivo — obligatorio por el reset del merge de branching (ver CLAUDE.md). Cero DROP/rename
-- de datos. MercadoPago no se toca: todas las columnas nuevas defaultean a 'mercadopago', asi las
-- filas existentes quedan correctamente atribuidas a MP por backfill del DEFAULT.

-- ── coaches: identidad del gateway que posee la suscripcion viva ───────────────────────────────
-- Todas SERVICE-ROLE-ONLY (billing / compra-only). Gotcha GRANT INVERTIDO (critico, ver CLAUDE.md):
-- `coaches` usa grants de UPDATE a nivel de COLUMNA (allowlist). Una columna NUEVA queda
-- automaticamente FUERA de la allowlist -> `authenticated` NO puede escribirla. Aqui el patron se
-- invierte a proposito: NO agregamos `GRANT UPDATE(col)`. No hacer nada = correcto y seguro; la
-- escritura pasa solo por service-role (checkout + webhook + confirm + cron). La suite
-- tests/separation/module-grants.sql NO debe ver estas columnas con UPDATE para `authenticated`.
ALTER TABLE public.coaches
  -- Que gateway posee la sub recurrente viva ('mercadopago' | 'flow'). Default MP = cero regresion.
  ADD COLUMN IF NOT EXISTS subscription_provider text NOT NULL DEFAULT 'mercadopago',
  -- Id generico de la sub en el provider (Flow `subscriptionId`). MP sigue usando `subscription_mp_id`
  -- por compatibilidad; esta columna es el espejo agnostico para gateways nuevos.
  ADD COLUMN IF NOT EXISTS subscription_provider_external_id text NULL,
  -- Flow `customerId` (cus_xxx): tarjeta enrolada reusable (flujo de dos fases register -> subscribe).
  ADD COLUMN IF NOT EXISTS provider_customer_id text NULL,
  -- Flow `planId` deterministico (eva_<tier>_<cycle>).
  ADD COLUMN IF NOT EXISTS provider_plan_id text NULL;

-- ── billing_snapshots: desambiguar el gateway del cobro (evidencia SERNAC) ──────────────────────
-- `provider` NOT NULL DEFAULT 'mercadopago' -> filas MP existentes se atribuyen a MP por backfill.
ALTER TABLE public.billing_snapshots
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'mercadopago';

-- Unique compuesto (provider, provider_payment_id): evita colision de ids ENTRE gateways (un id
-- numerico de MP podria chocar con un id de Flow).
--
-- ⚠️ ADITIVO A PROPOSITO (Ola 1): NO dropeamos el UNIQUE simple `billing_snapshots_provider_payment_id_key`.
-- Motivo money-safety (panel adversarial Ola 1): codigo (deploy Vercel) y migracion (MCP a mano) son
-- relojes NO atomicos; dropear el simple deja una ventana donde el `onConflict` del codigo (viejo o
-- nuevo) no resuelve -> insertBillingSnapshot tira -> la rama recurrente lo traga y ackea 200 -> MP no
-- reintenta -> cobro sin snapshot y sin avance de periodo (perdida SILENCIOSA). Con Flow OFF en Ola 1,
-- `provider` es siempre 'mercadopago' => (provider, provider_payment_id) es 1:1 con provider_payment_id,
-- asi que el simple y el compuesto COEXISTEN sin conflicto: `ON CONFLICT (provider, provider_payment_id)
-- DO NOTHING` resuelve por el compuesto y, al ser DO NOTHING, NUNCA llega a violar el simple (skip de
-- fila). Ambos indexes vivos => cualquier orden de deploy y el rollback solo-codigo son seguros.
-- El DROP del constraint simple se DIFIERE al go-live de Flow (Ola 7), cuando un id de Flow SI podria
-- colisionar con uno de MP y el codigo nuevo ya este 100% desplegado (migracion+codigo atomicos).
CREATE UNIQUE INDEX IF NOT EXISTS billing_snapshots_provider_paymentid_ux
  ON public.billing_snapshots (provider, provider_payment_id);

-- NOTA: RLS intacta (SELECT propio, escritura solo service-role). coach_addons SIN columnas nuevas
-- en v1 (el line-item en la sub Flow + coaches.subscription_provider ya identifican el gateway;
-- el trigger D1 recomputa enabled_modules igual). subscription_events.provider ya existe (agnostico).
