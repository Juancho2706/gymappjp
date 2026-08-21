---
status: draft
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# PLAN — Pricing v3

**Prerrequisito: decisiones D1–D6 del owner** (ver [SPEC](./SPEC.md) y el artifact «Free con marca»).
Estimación total: ~2,5 días de trabajo de agentes + QA del owner. Un solo deploy de producto (F1–F6
juntos) precedido por el backfill.

## Fases

| Fase | Qué | Archivos clave | Gate |
|---|---|---|---|
| F0 | Decisiones D1–D6 + arreglo inmediato de `robin-coach` (sobre cupo hoy) | — | OK del owner |
| F1 | Catálogo: Free 1 + `canUseBranding: true` + escalera v2/v3 + labels/features + docblocks | `packages/tiers/index.ts` + tests `pricing-v2.test.ts`, `constants.test.ts`, `register/actions.test.ts`, `nutrition-pdf-brand.test.ts` | vitest paquete + web |
| F2 | Backfill LIVE por uso (protocolo tx-rollback → aplicar → advisors → verificación post) | SQL service_role, `supabase/migrations/<ts>_pricing_v3_backfill_free_limits.sql` (aditivo, idempotente) | 0 coaches Free con `ocupa > max_clients` |
| F3 | Write-paths respetan la columna; lectores por fecha → columna; drift de imports | `activate-free.service.ts`, `cron/trial-expiry`, `ReactivateClient.tsx`, `OverLimitBanner.tsx`, `import.actions.ts`, `api/mobile/coach/clients/import/route.ts` | tests de cada servicio |
| F4 | White-label abierto: quitar upsells web+RN, errores de servidor, política «Hecho con EVA» | `BrandUpsell.tsx`, `coach/settings/page.tsx`, RN `settings/brand.tsx`, `settings.actions.ts`, `email-brand.ts`, `nutrition-pdf-brand.ts`, `c/layout.tsx`, manifest | tsc web+mobile, tests PDF/email |
| F5 | Copy de venta y plural; nuevo pitch de Pro | landing-v2, `copy.ts`, `/pricing`, i18n, register, verify-email, `FreeWelcomeModal`, `HelpCenter`, drips y bienvenida | docs:check + revisión visual |
| F6 | Analítica: `upgrade_gate_hit client_limit` + `pricing_version` | `clients.actions.ts`, `events.ts`, RN alta | evento visible en PostHog |
| F7 | Comunicación y docs: correo a los 27, SPEC v3 → activa, CURRENT, PRODUCT_OVERVIEW, memoria | `transactional-templates.ts`, docs | envío verificado en Resend |
| F8 | QA: preview + device; OTA a 1.1.0/1.1.1/1.1.2; verificación de los 5 conservados y de robin | — | acta de QA |

## Orden del día de deploy

1. F2 backfill en LIVE (antes del código: los 3 fallbacks que leen catálogo mostrarían «1» a todos).
2. Push a master con F1+F3+F4+F5+F6 (landing, /pricing, i18n y app en el mismo commit).
3. OTA android+ios a los tres runtimes (capacidades y copys RN vienen de `packages/tiers`).
4. Correo a los 27 (F7) después de verificar en prod que un Free ve Mi Marca.

## Riesgos y mitigaciones

- **Sobre-cupo = bloqueo total** (gate duro free, `proxy.ts:552`, RN `workspace-core.ts:173`): backfill
  con `GREATEST(1, LEAST(max_clients, ocupa))`, nunca `= 1` plano; verificación post con query.
- **Clobber del grandfather** por `activate-free`/`trial-expiry`: preservar columna si ya era Free; test
  nuevo por cada path.
- **Pro sin gancho**: D3 antes de tocar copy.
- **Abuso de marca gratis**: rate-limit de uploads existente + «Hecho con EVA» en Free.
- **ToS 30 días**: D5; si B, programar el UPDATE de cupo para +30 días y abrir white-label ya.
- **Drift documental**: tres documentos dicen «branding = Pro+ entero»; esta SPEC los reemplaza
  explícitamente y `packages/tiers/index.ts:73,175` se reescribe.

## Rollback

- Catálogo y gates: revert del commit (un archivo manda).
- Backfill: tabla de respaldo `_bak_pricing_v3_free_limits_<fecha>` con `(coach_id, max_clients_prev)`
  escrita en la misma transacción; restaurar = UPDATE desde ahí.
- White-label: volver `canUseBranding` a `false` apaga los gates; las marcas guardadas no se borran.
