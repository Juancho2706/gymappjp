---
status: draft
owner: product-engineering
last_verified: "2026-09-05"
canonical: false
---

# PLAN — Retiro de Starter + demolición gradual de Enterprise

Orquestación: el jefe (modelo principal) planifica, escribe instrucciones por worker y juzga cada wave;
workers Opus para lo guiado por informe, Sonnet para swaps textuales con lista cerrada. **Ningún gate
corre durante la escritura**: se acumulan en [TASKS § Gates acumulados](TASKS.md) y corren UNA vez al
cierre de cada tren, antes del push. Aprobación del owner: las 15 decisiones de [SPEC §5](SPEC.md)
antes de S0, y de nuevo antes de E2 y de E3. Los hallazgos de la crítica del 05-09 ya están
incorporados ([TASKS § Juicio del jefe](TASKS.md)).

## 1. Nombres canónicos (no inventar variantes)

| Nombre | Qué es | Dónde |
|---|---|---|
| `parseSubscriptionTier(raw: unknown): SubscriptionTier` | parser tolerante único para lecturas de DB/RN: `'free'\|'pro'\|'elite'\|'growth'\|'scale'` ⇒ el mismo; cualquier otra cosa (`'starter'`, null, basura) ⇒ `'free'` | `packages/tiers/index.ts` (exportado); reemplaza las 5 copias |
| `LEGACY_TIER_ALIASES` | `{ starter: 'pro', starter_lite: 'pro' }` — SOLO para deep-links de venta viejos (`?tier=`) en `reactivate`, `processing` y `flow-processing`. **`register` queda fuera**: degrada a `free` a propósito (`register/page.tsx:245-252`). NO para filas de DB | `packages/tiers/index.ts` |
| Migración `2026MMDDHHMMSS_retire_starter_default_and_last_row.sql` | `SET DEFAULT 'free'` (tier) + `SET DEFAULT 1` (`max_clients`, hoy 10 = cupo de Starter) + `COMMENT` + respaldo `_bak_starter_retire_<fecha>` (RLS on, revoke anon/authenticated) + `UPDATE` de `qa-e2e-coach` (D1) + `CREATE OR REPLACE` de `get_platform_coaches_by_tier_monthly` con la exclusión `@evatest.cl` que ya usan las RPC de MRR (`20260805211332:98-103`). ROLLBACK escrito | `supabase/migrations/` |
| Migración `2026MMDDHHMMSS_enterprise_freeze_e0.sql` | revoke EXECUTE de `assign_org_client_to_coach(uuid,uuid)` y `bulk_reassign_clients(uuid,uuid,uuid)` (las 2 sin llamador desplegado) + `ALTER TABLE public.coaches DISABLE TRIGGER coaches_org_managed_guard` (D5). **Sin DROP de índices** (son cobertura de FK; mueren en E4). ROLLBACK con los GRANT/ENABLE inversos | `supabase/migrations/` |
| Migración `2026MMDDHHMMSS_enterprise_e2bis_hook_and_sets.sql` | hook sin ramas org (conserva `coach_id`); `private.student_readable_client_ids` y `private.nutrition_v2_manageable_client_ids` **sin las ramas UNION solo-org, conservando `c.org_id IS NULL` en las ramas standalone/team**; revoke de `get_enterprise_alumno_context`, `bulk_reassign_clients_with_audit`, `bulk_assign_selected_clients`; equivalencia probada con `supabase/tests/student_gate_equivalence.sql` + `nutrition_v2_sets_equivalence.sql` en tx-rollback con `student_gate_org_fixture.sql` cargado | E2-bis |
| Migración `2026MMDDHHMMSS_enterprise_e2bis_purge_org_prueba.sql` | respaldo `_bak_*` (RLS on) + borrado en orden de FK + fila en `purge_audit` (D8) + limpieza de `requires_password_change` en `auth.users.raw_app_meta_data` (D15-A) | E2-bis |
| Migración `2026MMDDHHMMSS_enterprise_e3bis_revoke_proxy_rpcs.sql` | revoke de `get_org_branding` e `is_coach_active_org_member`, recién cuando el proxy dejó de llamarlas (E3-b.9) | E3-bis |
| `services/coach/coach-identity.service.ts` | `slugify`, `generateTempPassword`, `generateUniqueCoachSlug` copiados **verbatim** de `services/org/org.service.ts:17-39`; Teams los importa de acá | E2 |
| `resolveCoachScope` (existente, `services/auth/coach-scope.service.ts:19`) | el resolver de scope tras E3-a para los 5 duplicados que derivan de `resolvePreferredWorkspace`; `api/mobile/coach/clients/_mutation-auth.ts` **no** se reemplaza (resuelve por el workspace que declara el binario RN, `resolveExplicitScope`) | E3-a |

## 2. Frente S — Starter (un tren, 4 tandas + OTA)

Orden obligado: **dato antes que código** (S0), **red antes que retiro** (S1 antes de S2), **mockup-lote
aprobado** (S2.0) antes de S2.

### S0 · DB aditiva (INVISIBLE; LIVE; requiere D1)
1. Verificar en LIVE (SELECT): 1 fila starter, es `qa-e2e-coach`, `payment_provider='admin'`, ids MP/Flow null;
   0 cupones con scope starter (precondición de S2.10).
2. tx-rollback con el cuerpo completo de la migración + SELECT de verificación (0 starter, `column_default`
   de tier = `'free'` y de `max_clients` = `1`, 1 fila en `_bak`, la serie «coaches por tier» sin el coach QA).
3. Advisors antes → `apply_migration` → advisors después (esperable: `_bak` con RLS y 0 policies).
4. Espejo local en `supabase/migrations/` con el SQL exacto aplicado. Sin regen de tipos.
5. `scripts/qa-seed-team-movida.mjs:274` → `'scale'` (único escritor de starter en el repo).

### S1 · Blindaje (INVISIBLE; commit propio; vale por sí solo aunque S2 se posponga)
- Los 7 helpers de `packages/tiers/index.ts` con `?.` + fallback a `free` (precio 0, `TIER_CAPABILITIES.free`,
  ciclos `[]`, rank 0). Contrato explícito en JSDoc: «un tier fuera del catálogo se trata como free».
  Consecuencia declarada: los azúcares de `apps/mobile/lib/coach-tiers.ts:44-56` pasan de fail-closed a
  fail-open para un tier corrupto (inalcanzable: RN normaliza antes).
- Los 5 lectores de tier con cast crudo sin red → `parseSubscriptionTier`: `api/payments/subscription-status/route.ts:63`,
  `api/mobile/coach/subscription-status/route.ts:90`, `api/payments/addons/_lib/coach-context.ts:87,103`,
  `api/payments/confirm-addon/route.ts:136`. **`app/coach/layout.tsx:188` NO se toca**: es el fail-closed
  deliberado de marca (`:176-178`) y se decide en la ola «solo cupo + sello».
- `parseSubscriptionTier` exportado y adoptado por las 5 copias (web ×4, mobile ×1).
- Tests nuevos en `packages/tiers`: «tier desconocido ⇒ free en los 7 helpers», «parseSubscriptionTier»,
  y en `constants.test.ts` «un valor del CHECK fuera del union no crashea ningún helper».

### S2 · Retiro del tipo (INVISIBLE salvo D2)
- S2.0 Mockup-lote S aprobado (artifact del 05-09: `processing`/`flow-processing`, copy admin).
- `SubscriptionTier`/`SaleTier` sin `'starter'`; borrar las 8 claves `starter` de los `Record` del paquete
  (`:117,145,157,217,316,330,460,543`), `isMostAffordable` (`:58,171`), `LEGACY_TIERS` si sigue sin consumidores.
- Borrar `coach/subscription/_lib/tier-display.ts` + su test (módulo muerto).
- `apps/mobile/components/coach/directory/guided-invite.ts:339-346` sin la clave.
- `ReactivateClient.tsx:129-136`: borrar la comparación contra el tipo; **dejar** `:128` (cerco de string
  del query) apuntando a `LEGACY_TIER_ALIASES`.
- `processing/page.tsx` y `flow-processing/page.tsx` (D2-A): separar `tierForDisplay: SubscriptionTier | null`
  (chip) de `tierForCheckout: SubscriptionTier | null` (POST a `create-preference`, `captureCheckoutStarted`,
  `captureCheckoutFailed`, `CheckoutPreview.tier`; consumidores en `processing/page.tsx:55,195,205-213,244,253`);
  sin tier válido no hay chip, y con `from=register` sin tier no hay POST: error de `resolveCheckoutError`
  con salida a `/pricing`. Desde A5 (`create-preference/route.ts:531-537`) el `back_url` de MP trae
  `tier|cycle`, así que el caso afecta solo preapprovals pre-A5 y URLs manuales.
- `z.enum` sin starter: `packages/schemas/coach.ts:121`, `admin/(panel)/coaches/_actions/coach-actions.ts:121,357`.
- `checkout-external-reference.ts:54`: comportamiento resultante (ref legacy ⇒ `tier: null`) documentado y testeado.
- `services/billing/coupons.service.ts:144-155`: borrar el guard y su copy (0 cupones con scope starter en LIVE,
  re-verificado en S0.1) + sus 2 tests.
- `create-preference/route.ts:441-465` (`NUTRITION_ADDON_ON_DOWNGRADE`) y `SubscriptionContent.tsx:827-833`: quedan
  como defensa con comentario corregido (la poda es de la ola §4.2 de la SPEC).

### S3 · Superficies, scripts, tests, docs (INVISIBLE tras S0, salvo copy admin)
- Labels/colores: `AdminStatusBadge.tsx:25`, `ChartSection.tsx:52,59,67,200`, `FinanzasCharts.tsx:36`,
  `coach/settings/page.tsx:30`, `apps/mobile/app/coach/(tabs)/settings.tsx:64`, `apps/mobile/lib/plan-change.ts:43`.
- Copy admin (VISIBLE-admin, texto en el mockup-lote): `admin/(panel)/coaches/page.tsx:19`.
- Scripts: `seed-e2e-personas.mjs:71`, `create-coach-account.mjs:8,22,71`, `scripts/e2e/seed-pool-fixture.mjs:96`.
- Comentarios (~32 archivos, lista cerrada en TASKS): worker Sonnet, un solo commit, sin tocar lógica.
- Tests: ~24 archivos vitest (reescribir/borrar según TASKS) + 2 specs Playwright (`payment-flow-mock`,
  `sprint3-register-pricing`, ya desalineados): se actualizan y se validan solo con `playwright test --list`.
- Docs: `PRODUCT_OVERVIEW.md:92`, `embudo-free-pro/SPEC.md:24` (deroga «starter no se toca»),
  `pricing-v3/SPEC.md` (nota de superación) y `TASKS.md:50` (F4.8 marcada hecha sin hacer),
  `cobros-coach-alumno/SPEC.md:42` (una línea), `nutrition-flows-redesign/SPEC.md:66` (absorbido),
  `whitelabel-color-consolidation` (nota), `MANUAL_TASKS.md:123-131` (ficha del coach QA con tier nuevo),
  `TEST_STATUS.md` (corrida), `CURRENT.md` prioridad 10 (cerrar «(2) fallback a starter» y «(d) Starter en processing»),
  y el árbol raíz `specs/` (`nutrition-exchange-lists/SPEC.md:50`, `coupon-redeem-free/{SPEC,PLAN,TASKS}.md`: nota de superación).
- Entrega mobile: OTA `eas update` sobre el piso 1.1.2, android + ios (TS puro, sin build nativo).

### Consecuencias de segundo orden que el plan asume
- `isBrandingAllowed` queda fail-closed solo para tier corrupto y solo en `layout.tsx:188`: los 5 tests que usaban
  starter como «tier sin marca» pasan a usar un string basura (`'legacy_unknown' as SubscriptionTier`); el test
  `api/mobile/coach/dashboard/route.test.ts:243-251` desaparece (el normalizador mapea a free antes).
- `getTierRank` con fallback 0 ⇒ un tier desconocido cuenta como free en `comparePlanDirection` y en el
  correo de cupo (`sales-emails.service.ts:271` ⇒ recomienda Pro). Es el comportamiento deseado.
- La serie «coaches por tier» del admin se recalcula en vivo desde `coaches`; con la exclusión `@evatest.cl`
  agregada en S0 el coach QA deja de contar en cualquier barra (hoy contamina la de starter).

## 3. Frente E — Enterprise (5 fases; esta ola ejecuta E0 + E1 y deja E2 listo)

### E0 · Regalos + congelamiento (INVISIBLE salvo el correo del cron; requiere D5, D7)
- Código: `packages/schemas/auth.ts:15-20`; `apps/web/src/domain/org/types.ts`; `components/auth/TrustStrip.tsx`
  + `components/auth/index.ts:7-8`; `apps/web/scripts/enterprise-isolation-test.mjs`; crons sin scheduler
  `org-health-alert`, `payment-reminder`, `weekly-report-email`, `weekly-snapshot` (+ `buildOrgInactiveClientsEmail`
  en `transactional-templates.ts:611-653` y su test; `package.json:41,44,45`; `scripts/run-audit-checksum-manual.mjs`);
  `audit-checksum` (ruta + entrada de `vercel.json`, D7); `docs/operations/RUNBOOK.md:91,115`.
- DB (D5): migración `enterprise_freeze_e0` — verificar antes con V1–V5 del informe E4 §7 (0 filas de negocio,
  ACL previa, 0 llamadas RPC en 7 días por Logs Explorer). Nada del hot path del proxy se revoca en E0; nada se dropea.

### E1 · Demolición sin runtime (INVISIBLE; requiere D6, D13)
- Borrar 41 archivos (lista exacta en TASKS): `apps/enterprise/**` (26), `tests/enterprise/**` (11),
  `tests/enterprise-login.spec.ts`, `tests/archive/enterprise-archive.spec.ts`, `scripts/seed-enterprise-demo-local.mjs`.
- Editar: `package.json:38,42,43`; `.github/workflows/ci.yml:12,121-123,132-134,145,227-229`;
  `mobile-build.yml:11-12`; `scripts/check-qa-test-lint.mjs:37`; AASA `:24-28,35` + `tests/mobile/applinks-claims.test.ts:17,142-145`;
  `TEST_STATUS.md:87,107`, `QA_PLAYWRIGHT.md:167`, `MANUAL_TASKS.md:120-121`, `MOBILE_RELEASES_OTA.md:19`,
  `CURRENT.md` (fila Enterprise, ≤ 16 KB), `ola-de-orden/TASKS.md:68`; locales `AGENTS.md:20,30,71,107,141`, `CLAUDE.md:7`.
- `pnpm install --lockfile-only` una sola vez; el diff del lock debe tocar SOLO el importer `apps/enterprise:` y
  el subárbol `expo@54.0.36` / `expo-constants@18.0.13` / `expo-updates@29.0.19` / `async-storage@2.2.0` /
  variante de `expo-router`. Cualquier bump de web/mobile en el diff ⇒ parar y revisar.
- `actionlint` se verifica en CI después del push (no hay binario local).
- Conservar: `docs/legal/enterprise-contract-template.md` (insumo de LEGAL-03), `scripts/check-docs.mjs:30`, `docs/README.md:48`.

### E2 · Islas web (tren aparte; INVISIBLE salvo «Organizaciones» del admin; requiere D8, D9, D15)
E2.pre (LIVE, antes del deploy): borrar con respaldo la fila `workspace_preferences` tipo `enterprise_staff`
(usuario owner de `org-prueba`), para que no caiga en 404 cuando `/org` deje de existir.
E2.pre-mockup: mockup-lote E2 (artifact del 05-09: «Organizaciones» del admin; labels `org.*` de `/admin/auditoria`).
Paso 0: `coach-identity.service.ts` + repuntar `teams.actions.ts:7` y `team.actions.ts:6`; borrar
`writeWorkspaceAuditEvent` (`services/auth/workspace.service.ts:267-291`, su llamada `:230` y el import `:11`) y
`api/org/[orgSlug]/client-history/route.ts`. Verde: 0 imports de `services/org/org.service` fuera de `app/org/**`.
Paso 1: borrar 145 archivos (`app/org` 98, `app/enterprise` 30, `app/e` 5, `admin/orgs` 5, `api/org` 2,
`services/org`, `org.repository`, `domain/org/permissions.ts` → **solo** deja `ENTERPRISE_STAFF_ROLES`/`isEnterpriseStaffRole`
hasta E3, `lib/enterprise/domain.ts`, `check-org-sensitive-actions-audit.mjs` + `package.json:40`).
Paso 2: `proxy.ts` (`:39`, `:192`, `:197`, `:254-291`, `:449-493`, `:822-930`, `:1601-1637`, `:358`), `infrastructure/db/index.ts:5`,
`AdminSidebar.tsx:18,44`, `robots.ts:10`, `fail-counter.ts:9,18` (+test `:75`), `purge-data/route.ts:224-261` (3 bloques org,
incluida la purga de `coach_client_assignments`), `mp-reconcile/route.ts:427-452,503` (**solo** el barrido de `org_invoices`;
no tocar los `.not(... 'team_managed')`), `admin-action-catalog.ts:94-99`, `CoachSidebar.tsx:51,158,215,401-403,419-437` +
`layout.tsx:369` (**sin tocar** `layout.tsx:184,189-196,360,362-368`), `workspace-home.ts:4` y
`workspace-route-guard.service.ts:48` (rama `enterprise_staff` ⇒ `/workspace/select`), D15-A en `teams.actions.ts:72` /
`team.actions.ts:69`, `seed-e2e-personas.mjs` (bloque enterprise) + `tests/e2e-accounts.ts:19,26,43-45,61` + `E2E_PERSONAS.md`.
Paso 3 (E2-bis, DB, después del deploy de E2): hook + sets (conservando `c.org_id IS NULL`) + revoke de
`get_enterprise_alumno_context` y las 2 `bulk_*` + purga `org-prueba` + limpieza de `requires_password_change`.
Gate distintivo: `pnpm --filter @eva/web build` (typed routes: `CoachSidebar.tsx:421` apuntaba a `/org/…`).

### E3 · Colapso de tipos (tren propio; requiere D10, D12, D14)
E3.0: mockup-lote E3 (switcher, `areas.tsx:205-206`, `perfil.tsx:72-78`, `coach-subscription.ts:52`, `managedBy`).
Regla de apertura: re-grepear `org_managed|active_org_id|'enterprise'` contra el HEAD del día (los informes son del 05-09).
E3-a (sin cambio de comportamiento): 5 resolvers duplicados → `resolveCoachScope` (conservando el `throw` de
`getCoachClientScope` y el `{ok:false}` de `getCoachWorkoutScope`); 9 copias de `applyOrgScope` → la compartida;
`client-archive.service.ts:57-70` queda aislado a propósito; `_mutation-auth.ts` no se reemplaza.
E3-b: unions (`domain/auth/types.ts:12-19,21,23-63,93-97`; `packages/coach-nav/nav.ts:41,47,88,255-267,284-290`),
constant-fold de `orgId` en 20 archivos (Sonnet, lista cerrada) + lectores de `active_org_id` (`cap-nudge:329`,
`checkout-abandoned:130,367`, `api/mobile/coach/clients/route.ts:141`, `clients.actions.ts:157`, `nutrition-plans/new/page.tsx:65,69-70`),
24 ramas `if enterprise` en 17 archivos de `app/coach`, `app/api/**` (30, ramas de `_mutation-auth.ts:87,109,137,161,174`),
`app/join/**` (5), `app/c/**` (11), switcher (4, VISIBLE), retiro de `org_managed` en 43+ lectores (**quitar el término,
nunca el bloque**: `flow-reconcile:70-71`, `mp-reconcile:129-130,338-339`, `coach-subscription-gate.ts:23`,
`persona.service.ts:72`, `nav.ts:290`, `workspace.service.ts:31`, `layout.tsx:361-368`, `lib/email/behavior/behavior-triggers.ts:150,170,199`,
`behavior-emails.ts:107,111,253,327`, `scripts/nutrition-v2-conversion/cutover-preflight.ts:7,109`), `domain/coach/types.ts:16`.
E3-bis (DB): revoke de `get_org_branding` e `is_coach_active_org_member`.
Mobile M1 (mismo tren, OTA propia): `workspace-core.ts:22,65,67,88-102,205-213,267,302`, `workspace.ts:133-160`,
`WorkspaceSwitcherSheet.tsx:36,40`, 19 comparaciones en 15 archivos, 6 unions literales → `WorkspaceKind`,
`nutrition-v2-scope.ts:33` (conservar el `default: return null`), `profile-analytics-load-policy.ts:11-13`,
bug de copy `settings/areas.tsx:205-206` («organización» ⇒ «equipo»). M2: borrados (`enterprise-profile-analytics.ts`,
`lib/org.ts` + 9 consumidores, `org-announcements` + banner, gates `orgScoped` de bodycomp/movement).
Invariantes verificables: I-1…I-12 (web, informe E3 §7) y 1–14 (RN, informe E5 §6) — van al TASKS como checklist de cierre.

### E4 · DROP (no planificado en fino; D11)
Precondición dura: cero lecturas de `org_id`, `active_org_id` y `last_org_id` en código (tres greps separados; hoy
186 archivos solo con `org_id`). Recomendación: no hacerlo.

## 4. Riesgos que gobiernan el orden

| Riesgo | Mitigación |
|---|---|
| Starter: TypeError en billing (`getTierPriceClp` sin `?.`) si queda una fila starter y el catálogo ya no la tiene | S0 antes de S2; S1 antes de S2 |
| Starter: `ReactivateClient` sin la rama manda al coach a Elite | `LEGACY_TIER_ALIASES` explícito ⇒ `'pro'` |
| Starter: un tier inventado viajando al money path desde `processing` | `tierForCheckout` nullable; sin tier no hay POST |
| Enterprise E1: lock desincronizado ⇒ CI ×4 y deploy de Vercel rojos | `pnpm install --lockfile-only` + diff revisado (D6) |
| Enterprise E1: `qa:lint` rojo por `LEGACY_ALLOWLIST` stale; CI rojo por `applinks-claims` | ambos en el mismo commit que los borrados |
| Enterprise E2: `CoachSidebar.tsx:421` apunta a `/org/[slug]` ⇒ typed routes rojo al borrar `app/org` | tarea propia en E2 paso 2 |
| Enterprise E2: revocar RPC del hot path del proxy antes de borrar sus llamadas tumba `/c/*` | `get_org_branding`/`is_coach_active_org_member` recién en E3-bis (lección `20260805182248:6-8`) |
| Enterprise E2-bis: reescribir los sets `private.*` sin `c.org_id IS NULL` ensancha conjuntos y el gate contra LIVE (0 filas org) no lo ve | conservar el predicado; V6 con el fixture org cargado |
| Enterprise E3: 12 puntos donde borrar «el bloque» en vez de «el término» rompe Teams (Movens en prod) | edición textual exacta por worker con lista cerrada + invariantes + QA de device |
| `CURRENT.md` supera 16 KB (hoy 13.249 B) | la crónica vive en este SDD |

## 5. Gates (acumulados, corren UNA vez por tren antes del push)

Lista exacta por tanda en [TASKS § Gates acumulados](TASKS.md). Durante cada tanda, los bloques vitest puntuales
son verificación opcional (el owner decide cuándo hay CPU). El tren de cierre, deduplicado y en este orden:
`pnpm docs:check` → `pnpm --filter @eva/web typecheck` → `pnpm exec eslint $(git diff --name-only <base> -- '*.ts' '*.tsx')`
→ `pnpm vitest run` (suite completa, una vez) → `pnpm --filter @eva/web build` (solo E2) → grep de cierre → push →
`gh workflow run CI --ref master` (e2e; `sherif`/`actionlint` corren ahí) → `pnpm qa:prod:suave` (1 navegador) → OTA (S3, M1).
`tsc` de mobile corre en GitHub al pushear `apps/mobile/**` o `packages/**` (`mobile-integration-ci.yml`).
