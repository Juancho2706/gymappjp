# TEST_STATUS — Estado de las suites

> Doc canónico referenciado en `CLAUDE.md`. Última actualización: 2026-06-13 (plan estrategia 05 — billing add-ons self-service).
>
> Regla 2026-06-10 (memoria `feedback-test-each-batch`): por tanda solo `pnpm typecheck` + `pnpm test` (vitest local). Playwright/SQL contra Supabase y sandbox MP (tocan red/MP) se corren **únicamente en el GATE autorizado**, con OK explícito del usuario. Las suites nuevas se ESCRIBEN en sus fases y quedan pendientes de gate.

## Vitest (unit — se corren por tanda)

| Suite | Estado | Cubre |
|---|---|---|
| `apps/web/src/services/billing/addons.service.test.ts` | ✅ verde | cálculo compuesto por ciclo + redondeos; `getAddonProrationClp` (mitades, día del corte, mínimo 1 día); `isAddonBillable`; bifurcación de `activateAddonForCoach` (mensual INSERT+PUT / trim-anual one-shot); reversión D5; `materializeAddonFromOneShot` idempotente; máquina de estados de baja (reglas 3-4); `canPurchaseAddon` (D8); **`syncAdminGrants` write-through del override CEO (otorga/retira/idempotente; no toca self_service)** |
| `apps/web/src/services/billing/addon-webhook.service.test.ts` | ✅ verde | hooks del webhook con provider mockeado (materialización, set-once `first_charged_at`, snapshots, evento `updated`, terminal) |
| `apps/web/src/app/admin/(panel)/coaches/_actions/coach-actions.test.ts` | ✅ verde | `buildCoachUpdateData` ya NO emite `enabled_modules` (write-through D2); override solo de módulos deja `updateData` vacío |
| `apps/web/src/app/admin/(panel)/_actions/module-form.test.ts` | ✅ verde | `readModules` (mapa por checkbox) |

## Suites del GATE (escritas, se EJECUTAN solo en el gate autorizado)

| Suite | Tipo | Estado | Nota |
|---|---|---|---|
| `tests/billing/coach-addons-rls.sql` | SQL (RLS + trigger) | escrita, **pendiente de gate** | SELECT propio OK / ajeno invisible; INSERT/UPDATE/DELETE como `authenticated` denegados; service-role full; trigger prende/apaga `enabled_modules`; coalesce `'{}'`; admin_grant coexiste con paga; índice único parcial; `billing_snapshots` (SELECT propio, escritura denegada, unique por `provider_payment_id`). Correr como `authenticated`+claims, nunca service_role para los casos negativos |
| `tests/billing/addons-flow.spec.ts` | Playwright (mock MP) | **pendiente (F5)** | alta con checkbox, total en vivo, modal trim/anual + redirect mock, baja con fecha efectiva, historial, estado "Comprometido", aviso amable en módulo OFF, paso de add-ons en signup, reactivate pre-marca ex-add-ons, admin-grant "Cortesía EVA". Usa la 9na persona e2e dedicada con módulos ON — **no tocar las 8 personas de la matriz de separación** |
| `specs/addons-billing/SANDBOX-CHECKLIST.md` | Sandbox MP (token TEST) | escrita, **pendiente de gate** | 9 ítems: PUT de monto (cuándo aplica / email), payload de cobro recurrente, alta mensual, supersede, baja, compromiso mínimo, PUT sobre paused/cancelled, evento `updated`, alta trim/anual one-shot |

## Orden del gate (con OK del usuario)

branch efímero + migración `20260612150000_coach_addons_selfservice_billing.sql` + suite SQL + advisors → merge + regen `database.types.ts` → vitest completo → Playwright `tests/billing/` → sandbox MP (9 ítems) → smoke manual de la matriz QA con cuenta de prueba standalone (`juanmvr` — memoria `project-test-accounts`).

> **Lanzamiento (post-gate):** prender `SELF_SERVICE_ADDONS_ENABLED` SOLO con sandbox checklist verde + hardening RLS del plan 03 confirmado en prod. Sin eso se estaría vendiendo algo tomable gratis por API (doc fuente §2.2).
