---
status: active
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# PLAN — Pricing v3 (decisiones 1A 2A 3A 4A 5A 6A)

Estimación: ~2,5 días de agentes (3 waves) + QA del owner (1 h) + día D (2 h). Orquestación: jefe planifica
y juzga; workers Opus para implementación guiada, Sonnet para swaps mecánicos de copy.

## Waves

| Wave | Qué | Workers | Gate de salida |
|---|---|---|---|
| W0 | Decisión Robin + `PRICING_V3_CUTOVER` fijada a la fecha del día D | owner + jefe | — |
| W1 | Catálogo + capacidades + escalera + tests (`packages/tiers`, `constants.test`, `register/actions.test`, `nutrition-pdf-brand.test`) | 1 Opus | vitest de los 4 archivos + `pnpm typecheck` |
| W2 | Gates y lectores: reactivate/OverLimitBanner por columna; imports sin drift; `upgrade_gate_hit client_limit` web+RN; `pricing_version` | 1 Opus | tests de servicios + tsc web/mobile |
| W3 | White-label abierto + sello: quitar upsells web+RN, errores de servidor, `showsEvaBadge` en shell `/c`, login, PDF, correos, export RN | 1 Opus (web) + 1 Opus (RN) | tsc ×2, tests PDF/email, gate visual `cabina-visual-check` si aplica |
| W4 | Copy de venta + plural + pitch Pro + correos (bienvenida, drips) + i18n + landing EN | 1 Sonnet (swaps) + juicio | `docs:check`, revisión visual en preview |
| W5 | Correo «Tu Free ahora tiene tu marca» (plantilla + script de envío a los 27 desde DB) + docs (SPEC v2 superada, CURRENT, PRODUCT_OVERVIEW) | 1 Opus | envío de prueba al owner |
| W6 | Gates completos una vez (suite, build, lint, tsc ×2, tokens, boundaries, docs) | jefe | todo verde |

Las waves W1–W4 pueden correr en paralelo si se reparten archivos sin solape (W1 `packages/tiers` +
tests; W2 `coach/reactivate`, `OverLimitBanner`, imports, `clients.actions`, RN alta; W3 settings/brand
web+RN, `email-brand`, `base-layout`, `nutrition-pdf-brand`, `c/layout`, `c/login`, RN theme/export; W4
landing, pricing, i18n, HelpCenter, FreeWelcomeModal, verify-email, templates). W5 después de W3/W4.

## Día D (en este orden, sin saltarse pasos)

1. **Backfill LIVE** con protocolo: `BEGIN` → crear `_bak_pricing_v3_free_limits_<fecha>` con las 27 filas
   → `UPDATE` → `SELECT` de verificación (27 filas; 0 Free con `ocupa > max_clients` entre los tocados) →
   `ROLLBACK` de prueba; luego `apply_migration` con el mismo SQL; advisors security 0 ERROR; **renombrar el
   archivo de migración a la versión que registre `schema_migrations`**.
2. `PRICING_V3_CUTOVER` = fecha del día D 00:00Z en `packages/tiers` (ya en el commit de W1; confirmar).
3. Push a `master` (= `rnmobiledenuevo`) con W1–W5: landing, `/pricing`, i18n, app y correos en el mismo
   commit. Vercel prod READY.
4. Verificación en prod: un Free nuevo (cuenta QA `qa-*`) ve Mi Marca y su alumno ve la marca con el sello;
   `/pricing` y `#precios` dicen «1 alumno con tu marca»; un Free con 1 alumno ve el gate al intentar el 2º;
   Pro sin cambios.
5. OTA android + ios a runtimes 1.1.0, 1.1.1 y 1.1.2 (tags `ota/<v>-<fecha>` desde el último commit de cada
   `version`, receta en `docs/operations/MOBILE_RELEASES_OTA.md`).
6. Correo a los 27 (W5), con prueba previa al owner.
7. Memoria, CURRENT y artifact actualizados; PostHog: insight `coach_registered` por `pricing_version` +
   `upgrade_gate_hit` por gate.

## Métricas para juzgar (2 y 6 semanas)

- Activación: % de altas Free que cargan su 1º alumno en 7 días (hoy ~50% nunca lo carga).
- Paywall: `upgrade_gate_hit {gate:'client_limit'}` por semana y `checkout_started` después del gate
  (hoy `checkout_started` no existe en PostHog — lo agrega W2).
- Conversión Free→Pro (hoy 0/32 histórico).
- Marca: % de Free con `logo_url` o `primary_color` ≠ default a los 7 días del alta.

## Riesgos y mitigaciones

- **Sobre-cupo = bloqueo total** (gate duro Free): el backfill solo toca `ocupa <= 1`; verificación
  post-UPDATE obligatoria. Robin es el único sobre cupo y es decisión aparte.
- **Regalo por escalera** (D4=A): un Free backfilleado a 1 que pase por `activate-free` (solo desde
  expired/blocked) recibe 3 o 2 por fecha. Raro e inofensivo; documentado.
- **Pro sin gancho**: resuelto con el sello (D3=A); el copy de Pro pasa a «25 alumnos · sin rastro de EVA».
- **Abuso de marca gratis**: rate-limit de uploads existente + sello visible.
- **ToS 30 días**: D5=A; el correo explica que nadie pierde alumnos y qué ganan.
- **Drift documental**: `packages/tiers/index.ts:73,175` y `pricing-v2/SPEC.md` se reescriben en W1/W5.

## Rollback

- Código: revert del commit del día D (catálogo + gates en un archivo manda).
- Backfill: `UPDATE coaches c SET max_clients = b.max_clients_prev FROM _bak_pricing_v3_free_limits_<fecha> b
  WHERE b.coach_id = c.id`.
- White-label/sello: `canUseBranding` a `false` apaga los gates; las marcas guardadas no se borran.
