---
status: active
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# SPEC — Pricing v3: Free = 1 alumno con white-label · Pro = 25 + todo

**Estado: APROBADA por el owner el 2026-08-21 (decisiones 1A 2A 3A 4A 5A 6A). EN EJECUCIÓN — día D = 2026-08-21.**
**Robin: decidido (B, se deja que archive — ver §Robin). `PRICING_V3_CUTOVER = 2026-08-21T00:00:00Z`.**

## Origen

Propuesta del socio (Jean Pierre), traída por el owner el 2026-08-21 (textual): «dejemos el free a 1
persona y con whitelabel, el pro solo tendría todo y alumnos claro como siempre (…) los que están free
ahora con más de 1 déjalos con ese límite, o sea los que tienen límite de 3 o 2 y tengan esos alumnos,
déjalos así, pero si hay gente free con 0 o 1 alumno dejarlos con el nuevo free».

Reemplaza parcialmente a [pricing-v2](../pricing-v2/SPEC.md) (17-08): mantiene Pro 25 / Elite 60 y el
grandfather de los pagadores; cambia Free (2 → 1) y **revierte la regla «branding = Pro+ entero»**
(decisión CEO 2026-06-21, escrita en `packages/tiers/index.ts:73,175`, `pricing-v2/SPEC.md:21,48` y
`docs/archive/specs/whitelabel-v2/PLAN.md:5`). Esta SPEC es la documentación explícita de esa reversión:
**desde v3 el white-label es de todos los planes; lo que distingue a Pro es el cupo y la ausencia del
sello «Hecho con EVA».**

## Problema que ataca

- 32 coaches Free reales al 21-08: **16 nunca cargaron un alumno, 11 tienen exactamente 1, 5 tienen ≥2**.
- **0 de 32 Free inició jamás un checkout** (`subscription_events` solo tiene filas de los 4 pagadores
  self-serve). El tope de 2/3 nunca convirtió: el cuello es activación, no cupo.
- El anuncio activo `AD_CoachingEvoluciono_21s` vende «con tu propia marca»; el registro Free hoy no la
  entrega (overclaim).

La apuesta: el coach Free siente que ya tiene «su app» (marca propia) y el paywall llega en el 2º alumno,
que en los datos históricos aparece en horas cuando aparece.

## Decisiones del owner (2026-08-21)

| # | Decisión | Elegida | Consecuencia |
|---|---|---|---|
| D1 | Cupo de los 5 Free con ≥2 alumnos | **A** — conservan su fila tal cual | robin 3, dudu 3, gabriel 2, jesus 3, kut 3. No se toca ninguna de esas filas. `jesus-coach` y `kut` pueden sumar un 3º gratis. **robin-coach queda sobre cupo (5/3)** → §Robin |
| D2 | Alcance del white-label en Free | **A** — completo | Logo, color, preset, fuente, loader, layout de login, modal de bienvenida, @instagram. Un solo interruptor |
| D3 | Gancho de Pro | **A** — sello «Hecho con EVA» | Free: sello visible en app del alumno, login, PDF y correos (con link). Pro/Elite: sin sello. Nueva capacidad `showsEvaBadge` |
| D4 | Vuelta a Free desde un plan pago | **A** — escalera por fecha | `activate-free`/`trial-expiry` siguen escribiendo por fecha (pre-v2 3 · v2–v3 2 · post-v3 1). Si el coach tiene más activos, la pantalla de reactivación exige archivar (vigente) |
| D5 | Aviso a los 27 Free que pasan a 1 | **A** — correo el mismo día | Plantilla en TASKS F7.1. Nadie pierde un alumno; 11 pierden holgura sin usar |
| D6 | Timing | **A** — esta semana, un solo deploy | Backfill LIVE → push único (landing + /pricing + i18n + app + correos) → OTA 3 runtimes → correo |

## Reglas de producto

1. **Catálogo de venta**: Free $0 · 1 alumno · todo EVA · white-label completo · sello «Hecho con EVA».
   Pro $29.990 · 25 alumnos · todo · sin sello. Elite $44.990 · 60 · sin sello. Starter fuera de venta.
2. **Grandfather por USO** (D1=A): Free existente con **≥2 alumnos no archivados** conserva su fila;
   Free con 0–1 pasa a cupo 1. Ningún coach pierde un alumno ya cargado.
3. **Pagadores intactos**: los 5 Pro tienen `max_clients = 30` grabado y no se tocan. Elite sin cambios.
4. **White-label** (D2=A): `TIER_CAPABILITIES.free.canUseBranding = true`. Columnas de marca ya con
   `GRANT UPDATE` a `authenticated` (migración 20260612140000) ⇒ cero DDL.
5. **Sello** (D3=A): `TIER_CAPABILITIES[tier].showsEvaBadge` — free/starter `true`, pro/elite/growth/scale
   `false`. Superficies: shell del alumno `/c`, login del alumno, PDF nutrición (`poweredByEva`), correos
   al alumno (`email-brand.ts` + `base-layout.ts`), export RN. Texto: «Hecho con EVA» + link
   `https://www.eva-app.cl/?utm_source=badge&utm_medium=student_app&utm_campaign=free_badge`.
6. **Escalera de fecha** (D4=A): `PRICING_V2_CUTOVER = 2026-08-18` (existente) y `PRICING_V3_CUTOVER =
   2026-08-21T00:00:00Z` (día D); `tierMaxClientsFor('free', createdAt)` = 3 / 2 / 1 por bucket. Solo para
   write-paths y fallback; el grandfather por uso vive en la columna.
7. **Aviso** (D5=A): correo transaccional a los 27 el día del deploy, después de verificar en prod que un
   Free ve Mi Marca.

## Modelo técnico

- `coaches.max_clients` es `integer NOT NULL DEFAULT 10` y **gana en todos los gates reales** (alta
  manual, invite, desarchivar, import, proxy duro, RN). `tierMaxClientsFor(tier, created_at)` solo decide
  qué se ESCRIBE en activaciones/bajadas y es fallback si el select omite la columna.
- **Backfill** (una vez, con respaldo, protocolo tx-rollback → aplicar → advisors → verificación):
  `UPDATE public.coaches SET max_clients = 1 WHERE subscription_tier = 'free' AND <standalone> AND
  <ocupa> <= 1 AND max_clients > 1` donde `ocupa` = `clients` con `is_archived = false`, `org_id IS NULL`,
  `team_id IS NULL` (`capacity.service.ts:15,30`). Excluir `evademo` y `josefit`. Esperado al 21-08 (re-medido
  antes de ejecutar): **31 filas** (15 de 3→1, 16 de 2→1; incluye `aura` en `pending_email` e `improve-motion`,
  alta de las 15:05Z; la SPEC original decía 27). **EJECUTADO el 2026-08-21 15:35Z** (migración LIVE
  `20260821153527_pricing_v3_free_limits_backfill`, advisors 0 ERROR). Los 5 con ≥2 no entran en el `WHERE`. Respaldo
  `_bak_pricing_v3_free_limits_20260821` `(coach_id, slug, max_clients_prev, backed_up_at)` en la misma
  transacción, con RLS habilitada y sin grants a `anon`/`authenticated`.
- Lectores que miran la fecha en vez de la columna y hay que corregir: `ReactivateClient.tsx:74`,
  `_data/reactivate.queries.ts:25-26`, `OverLimitBanner.tsx:63`. Drift previo: `import.actions.ts:100`
  (`?? 10`), `:185` y `api/mobile/coach/clients/import/route.ts:251` (catálogo sin grandfather) ⇒
  `?? tierMaxClientsFor(tier, created_at)`.
- White-label: ~30 consumidores de `isBrandingAllowed` se apagan solos; a mano: `BrandUpsell` (muere o pasa
  a upsell de cupo), badge «Pro» del hub (`coach/settings/page.tsx:284-288,378-397`), pantalla gate RN
  (`app/coach/settings/brand.tsx:434-459`, comentario «starter+» stale), 3 errores de servidor en
  `settings.actions.ts:218,263,330`.
- Sello: hoy `poweredByEva`/«powered by» se decide por `isBrandingAllowed`; pasa a leer `showsEvaBadge`.
- Copy de venta: `PreciosSection.tsx:281,311-318,399,418`, `landing-v2/copy.ts:93-108`,
  `pricing/page.tsx:145,154,223`, i18n `es/en.json:29,86,108-111,138`, `FreeWelcomeModal.tsx:115`,
  `HelpCenter.tsx:68,125,152`, `transactional-templates.ts:193`, `drip-templates.ts:127,133`; plural
  «1 alumnos» en `PreciosSection:93-98`, `FaqSection:63`, `HelpCenter:152`, `verify-email:63`.
- Analítica: emitir `upgrade_gate_hit {gate:'client_limit'}` (hoy sin call-site) en el alta web y RN;
  prop `pricing_version: 'v3'` en `coach_registered`.
- RN: capacidades y labels vienen de `packages/tiers` ⇒ OTA a los tres runtimes (1.1.0 / 1.1.1 / 1.1.2).

## Robin (decidido 2026-08-21: B)

`robin-coach`: free/active, `max_clients 3`, **5 alumnos no archivados**. El gate duro de Free
(`coach-subscription-gate.ts:87` + `proxy.ts:552`; RN `workspace-core.ts:173`) lo redirige a
`/coach/reactivate`. Last active 2026-08-18 15:08Z. Opciones presentadas: (i) `UPDATE coaches SET
max_clients = 5`; (ii) dejarlo bloqueado hasta que archive 2. **El owner eligió (ii): su fila NO se toca;
sale del bloqueo archivando 2 alumnos desde `/coach/reactivate` (panel de archivado) o pasando a Pro.**
El backfill no lo alcanza (ocupa 5 > 1).

## Invariantes

- Ningún coach pierde un alumno ya cargado ni queda sobre cupo POR el cambio (el backfill solo toca
  filas con `ocupa <= 1`).
- Ningún pagador cambia de cupo ni de features.
- Un solo interruptor de branding y uno de sello; un solo catálogo (`packages/tiers`); copy derivado.
- Landing, `/pricing`, i18n, app y correos cambian en el MISMO deploy.

## Fuera de alcance

Precios, Elite, Teams/Enterprise, Starter, el flujo de solicitudes de `/join` ([coach-leads](../coach-leads/SPEC.md)),
fichas de tiendas (no mencionan cupos), el sheet «Invitar alumno» del coach.

## Datos de respaldo (21-08, LIVE, excluidos evademo/josefit)

37 coaches: 5 Pro (todos `max_clients 30`), 32 Free (19 con 3, 13 con 2, 0 null, 0 trial). Free con ≥2
alumnos: 5 (robin-coach 5/3, dudu 3/3, gabriel 2/2, jesus-coach 2/3, kut 2/3). Con 1: 11. Con 0: 16. Free
con marca ya guardada: 5 (`pauli-coach`, `robin-coach`, `dudu`, `coach-derek`, `anais-perez`). Altas Free
semana del 17-08: 14 (vs 6 en las 7 semanas previas). ~6% de las altas históricas llegaron al 2º alumno
en 2 semanas.
