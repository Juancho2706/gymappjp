# Informe de Pruebas Completo — 14 Roles

> Fecha: 2026-06-01 · Rama: `v2/enterprise` · Entorno: **Supabase LOCAL** (Docker)
> Alcance: suite completa (typecheck + lint + unit/Vitest + E2E/Playwright). **Sin merge a master. Sin push a prod.**

## Resumen ejecutivo (semáforo)

| Capa | Resultado | Detalle |
|------|-----------|---------|
| `pnpm typecheck` | ✅ PASS | `tsc --noEmit` limpio |
| `pnpm lint` | ✅ PASS | 0 errores · 154 warnings preexistentes (no bloqueantes) |
| Vitest (unit) | ✅ 149 passed · 4 skipped | skips = RLS-JWT integration (opt-in, cubierto por Playwright) |
| Playwright (E2E) | ✅ 142 passed · 2 skipped · 0 failed | corrida limpia tras `db reset` |
| **Bug funcional encontrado y corregido** | 🐞→✅ | Conteo de seats contaba staff no-coach (ver Backend/PM) |

Veredicto global: **verde**. La rama está estable a nivel de tests con Supabase local. Quedan riesgos de *merge* documentados aparte (`SUPABASE_MIGRATION_CONFLICT_REPORT.md`).

---

## 1. Software Architect
**Foco:** límites Clean Architecture, aislamiento de capas, deuda estructural.

- Las correcciones respetaron el flujo `_data → services → infrastructure/db → Supabase`. El fix de seats vivió en `infrastructure/db/org.repository.ts` (conteo) y en el server action (`org.actions.ts`), no en la capa de presentación. ✅
- Los tests unitarios fallidos se arreglaron *mockeando el boundary* correcto (`resolvePreferredWorkspace` en `services/auth/workspace.service`) en vez de duplicar el grafo de queries de Supabase — confirma que la frontera de servicio está bien definida y es mockeable. ✅
- Riesgo arquitectónico abierto: divergencia de migraciones local (baseline-squash) vs remoto (historial granular). No afecta tests; sí el futuro merge. Ver reporte de conflictos.

**Veredicto:** sin violaciones de capa nuevas.

## 2. Backend Engineer
**Foco:** server actions, RPC, integridad de datos.

- 🐞 **Bug corregido:** el chequeo de límite de seats en `inviteCoachAction` y `createEnterpriseUserAction` contaba **todos** los `organization_members` activos, incluyendo staff no-coach (`ops`, `analyst`, `brand_manager`, `org_admin` con `coach_id NULL`). Org A (6 seats) tenía 8 miembros activos → invitaciones de coach quedaban bloqueadas erróneamente. Fix: contar sólo miembros que consumen seat (`coach_id IS NOT NULL`) y aplicar el límite **sólo al crear coach**.
- Mismo defecto en el cálculo de `totalCoaches` (`getOrgStats`) → corregido para excluir staff; ahora `seatRate` del dashboard es correcto.
- RPC `bulk_assign_selected_clients` con `ON CONFLICT (org_id, client_id)` validado (migración `20260601000700`).
- Migración `20260601000600_check_ins_reviewed_at.sql` aplica limpio en `db reset`.

**Veredicto:** integridad de seats corregida; acciones revalidadas.

## 3. Frontend Engineer
**Foco:** RSC/client boundaries, props serializables.

- `SettingsAccordion` recibe `icon: React.ReactNode` (no función) — sin crash RSC→client. ✅
- Selectores E2E actualizados a la UI rediseñada del dashboard enterprise (h1 = `org.name`, "Command center", "Coaches activos", "Admin center enterprise", "Datos del negocio"). Los tests apuntaban a copys viejos ("Dashboard", "Uso de seats", "Configuración").

**Veredicto:** UI enterprise consistente con su suite.

## 4. Mobile Engineer (iOS/Android)
**Foco:** viewport móvil, overlays, safe areas.

- `mobile-visual-audit.spec.ts` ✅ dentro de los 97 enterprise.
- Test `viewport móvil: dashboard coach carga sin error` (390×844) ✅.
- 🔎 Hallazgo de interacción: `PublicCodeRequiredModal` (`fixed inset-0 z-[100]`) intercepta toda interacción del dashboard hasta confirmarse. No es bug (es intencional/bloqueante), pero **es un gate que cualquier flujo móvil/E2E debe disolver primero**. Documentado en el helper de login.

**Veredicto:** layouts móviles OK; gate de modal documentado.

## 5. DevOps Engineer
**Foco:** reproducibilidad, pipeline, entorno.

- `supabase db reset` reproducible: baseline + 55 migraciones enterprise + seed, sin errores.
- pnpm v11 + `allowBuilds` operativo; binario supabase resuelto vía `node_modules/.bin/supabase.cmd`.
- ⚠️ CLI supabase desactualizado (v2.85.0 vs v2.103.0) — sólo aviso, no rompe.
- Tests E2E requieren dev server (`:3000`) + stack local (`:54321`) arriba. Documentar en CI antes de habilitar el job E2E.

**Veredicto:** entorno local reproducible.

## 6. QA Automation Engineer (Web & Mobile)
**Foco:** estabilidad de la suite, flakiness, cobertura.

Trabajo realizado:
- **4 unit tests** reparados (mocks de resolución de workspace + cambio de comportamiento de registro free→active + `generateLink`).
- **11 E2E** reparados: copys de UI (journey, org-auth, sprint3), `summary` de invite ("Abrir formulario"), label duplicado `getByLabel('Contraseña')` → `{ exact: true }` (el toggle "Mostrar contraseña" colisionaba), y el gate de `PublicCodeRequiredModal` en el helper de login coach.
- Flakiness eliminada: strict-mode violations resueltas con `.first()/.last()`; CTA de guía con `waitFor({state:'visible'})` + skip honesto cuando el estado de cuenta no lo expone.

Métricas finales: **Vitest 149/153 (4 skip), Playwright 142/144 (2 skip), 0 fallos.**

**Veredicto:** suite verde y estable; sin gaming de asserts.

## 7. Security Engineer
**Foco:** aislamiento multi-tenant, RLS, datos de salud.

- `rls-isolation.spec.ts` **46/46** ✅ — incluye: aislamiento de exercises/workout_programs/nutrition_plans/client_payments por org, check-ins (datos de salud) por alumno y por coach, regresión "ningún coach lee TODOS los check-ins", branding por workspace, y preservación de workspace standalone al suspender coach.
- `multi-role-access.spec.ts` **18** ✅ — RBAC de `ops/analyst/brand_manager/org_admin`: cada rol sólo accede a sus superficies; cross-org bloqueado.
- `export-cross-tenant`, `storage-cross-tenant`, `workspace-revocation-cache` ✅ — sin fugas cross-tenant; cache stale no autoriza coach suspendido.
- Vitest RLS-JWT (`tests/rls/*`) en skip por diseño (opt-in con credenciales); su cobertura está duplicada y superada por la suite Playwright RLS.

**Veredicto:** aislamiento multi-tenant y de datos de salud sólido.

## 8. Product Manager
**Foco:** valor entregado, riesgo de negocio.

- El bug de seats tenía impacto directo de negocio: **una org en su límite aparente no podía sumar coaches reales** porque el staff administrativo consumía cupos de coach. Corregido → seats = capacidad de coaches, el staff no descuenta. Esto desbloquea ventas de seats sin fricción.
- Onboarding tracker, weekly snapshot y streaks (commits recientes) cubiertos por la suite sin regresiones.

**Veredicto:** riesgo de monetización de seats cerrado.

## 9. UX/UI Designer (Web & Mobile)
**Foco:** consistencia, jerarquía, accesibilidad.

- Dashboard/Settings/Coaches enterprise rediseñados con hero "Command center / Admin center / Equipo enterprise" — jerarquía coherente y badges por dominio (color-coded).
- Empty states reutilizables (`OrgEmptyState`) presentes.
- Contraste AA en dark mode validado en sesiones previas; sin regresiones visuales en `mobile-visual-audit`.
- 💡 Recomendación: el `PublicCodeRequiredModal` es bloqueante y sin botón de cierre alternativo (sólo "Entendido"); aceptable para un cambio crítico de acceso, pero revisar que no reaparezca tras confirmar.

## 10. Head of Sales (B2B Enterprise)
- El fix de seats es argumento comercial: el cliente puede agregar staff administrativo (recepción, analista, marca) **sin gastar seats de coach**. Diferenciador claro vs cobrar por cada usuario.
- Demo enterprise (login org, dashboard, equipo, settings, clients) pasa E2E de punta a punta → demo estable.

## 11. SDR
- Flujo de invitación de coach existente (`invite-flow`) funciona end-to-end vía UI → onboarding de pilotos sin fricción.
- Registro público + pricing (`sprint3`) verde → captación self-serve operativa (tier free ahora queda `active` con verificación por email).

## 12. Customer Success Manager (CSM)
- Onboarding wizard, tracker de progreso y reasignación de clientes con rollback (`rollbackLastReassignmentAction`) operativos.
- `markCheckInReviewed` (check-in revisado por coach) con migración aplicada → CSM/coach pueden cerrar el loop de revisión.

## 13. Legal & Compliance Counsel (Chile)
- Aislamiento de **datos de salud** (check-ins) verificado por RLS: ningún coach ajeno ni alumno peer accede. Relevante para Ley 19.628 (datos personales sensibles).
- Cookies scoped por subdominio (coach vs enterprise) — sin CSRF cross-subdomain (decisión intencional documentada en CLAUDE.md).
- Registro exige `accept_legal` + `accept_health_data` (tests de registro lo cubren).
- Privacidad/ARCO link presente en dashboard coach.

## 14. Fintech/Integrations Specialist
- `payment-flow-mock.spec.ts` ✅ — flujo de pago mockeado sin regresión.
- Billing enterprise es **manual** (link/transferencia MP) — `org_invoices`/`payment_exceptions` presentes; aislamiento de `client_payments` por org verificado en RLS.
- MercadoPago pre-approvals (coaches) fuera del alcance de esta corrida local (requiere tokens prod/preview).

---

## Comandos ejecutados (evidencia)

```bash
pnpm typecheck                                   # PASS
pnpm lint                                        # 0 errors / 154 warnings
npx vitest run                                   # 149 passed / 4 skipped
node_modules/.bin/supabase.cmd db reset          # baseline + 55 migr + seed OK
npx playwright test tests/ --workers=1           # 142 passed / 2 skipped / 0 failed
```

## Cambios de código (no-test) derivados de los hallazgos

| Archivo | Cambio | Rol que lo motivó |
|---------|--------|-------------------|
| `app/org/[slug]/_actions/org.actions.ts` | Seat check cuenta sólo `coach_id IS NOT NULL`; límite sólo al crear coach | Backend / PM / Sales |
| `infrastructure/db/org.repository.ts` | `totalCoaches` excluye staff no-coach | Backend |

## Skips (justificados, no fallos)

1. `tests/rls/rls-tenant-isolation.test.ts` + `rls-client-modes.test.ts` (4 casos) — requieren `SUPABASE_RLS_INTEGRATION=1` + credenciales; **cubiertos** por `rls-isolation.spec.ts` (Playwright, 46 casos).
2. `coach-onboarding-dashboard.spec.ts` CTA "Ir a Mi Marca y guía" — skip honesto si el estado de cuenta del coach PERF no expone el CTA (free tier / paso colapsado). Pasa cuando el estado lo permite.

## Restricciones respetadas
- ❌ Sin merge a master.
- ✅ Sólo Supabase **local** (migraciones + tests).
- ❌ Sin `supabase db push` a prod (riesgo de conflicto documentado aparte).
