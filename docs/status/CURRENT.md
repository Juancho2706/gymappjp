---
status: active
owner: product-engineering
last_verified: "2026-09-23"
canonical: true
---

# Current status

Vista global mínima: solo prioridades vigentes y punteros. Cada prioridad ocupa como máximo 4 líneas
(título, estado, qué queda, link). La cronología, los commits intermedios, los gates y la evidencia
viven en la spec de cada frente (`docs/specs/*/TASKS.md` § «Cierre»), en `docs/audits/` y en el
historial de git — no aquí. El código, las migraciones aplicadas y el estado remoto (Vercel/Supabase)
prevalecen sobre este resumen. La prosa retirada está en
[current-historial-2026-09](../archive/current-historial-2026-09.md) (último corte: 23-09, «Casa en orden»).

## Estado por frente

| Frente | Estado | Fuente de detalle |
|---|---|---|
| Web/PWA | Pricing v3 productivo: Free = 1 alumno + white-label + sello «Hecho con EVA»; Pro 25 sin sello. **Deploy vigente 23-09: `master` = `rnmobiledenuevo` = `111460b0`** («Elige cómo pagar», `dpl_b6qKULbc…`). | [Runbook](../operations/RUNBOOK.md) · [spec](../specs/pricing-v3/SPEC.md) |
| App nativa (RN) | iOS **1.1.3** pública desde el 16-09 (piso OTA iOS = 1.1.3); Android **1.1.2** (build 86 «En revisión» en Play desde el 10-09; sin binario 1.1.3). **OTAs vigentes 23-09**: ios 1.1.3 grupo `6041fa25` + 1.1.2 desde el tag `ota/1.1.2-20260923` (android `49d04dd1` / ios `2c87e903`). | [Mobile parity](MOBILE_PARITY.md) · [OTA](../operations/MOBILE_RELEASES_OTA.md) |
| Nutrition V2 | Canónica para Standalone/Team. «Porciones a la chilena» y «Cantidades honestas» cerrados con QA VERDE (SDD `done`). V1 congelada, **no se borra** (decisión owner 03-08): solo migrar usuarios. | [Porciones CL](../specs/nutrition-porciones-chilenas/SPEC.md) · [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) · [Delta V1](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados; queda la matriz Team del archivado. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) · [Archivado](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Enterprise | **ELIMINADO (owner 01-09)**: E0+E1 en producción 05-09 (`/enterprise` ⇒ 308 a `/pricing`). **Queda E2**: ruta `/e/…`, tablas/funciones org y 2 RPC `SECURITY DEFINER` ejecutables por `anon` (`get_enterprise_alumno_context`, `get_org_branding`). | [SDD retiro](../specs/retiro-starter-y-enterprise/SPEC.md) |

## Prioridades vigentes

### 1. En producción, esperan QA del owner (⇒ SDD `done`)

1. **«Elige cómo pagar»** (23-09, sin OTA, sin SDD; mockup `JQtEuDvT`): alta free→pago, registro y
   `/coach/reactivate` eligen medio con Webpay primero + rescate al volver de MP. **QA celular VERDE 23-09.
   Escritorio 24-09: selector, Webpay→Flow y oscuro OK; 3 bugs arreglados en local SIN deploy (botón muerto
   al volver de Webpay en `/coach/subscription` y en el alta paga, historial con estados crudos, subtítulo
   «Standalone»). Abierto: MP respondió 400 «User bad request» con un correo alias «+» (no confirmado si
   afecta a correos normales); rescate MP y alta con plan pago sin probar en escritorio.**
2. **«Dossier por meses»** (16-09, [SDD](../specs/dossier-por-meses/SPEC.md)): **QA §17 (14 web + 8 device + 2
   comunes)**; el E2E `tests/dossier-export.spec.ts` se corre solo con su OK.
3. **«Reps tras el reloj» + E1** (12-09, [SDD](../specs/reps-tras-el-reloj/SPEC.md)): **QA §10 (10 puntos,
   incluye el arrastre del share).**
4. **«Despegue rápido»** (11-09, [SDD](../specs/despegue-rapido/SPEC.md)): **QA de 5 puntos.** Sentry 23-09:
   `EVA-NEXTJS-1P`/`1Q` («exec-v3: fallback 4.6s ganó la carrera») reaparecieron hoy.
5. **Fix RN «Asignar plantilla»** (14-09, [OTA](../operations/MOBILE_RELEASES_OTA.md)): **QA en device.**

### 2. Frentes abiertos

1. **Meta SDK iOS** ([SDD](../specs/meta-app-events-ios/SPEC.md)): mide de punta a punta desde el 16-09.
   Queda SKAN cuando Meta habilite «Configurar eventos» y confirmar si la hoja ATT salió en inglés
   (⇒ `locales`, build nueva). Pasos de consola en [MANUAL_TASKS](../operations/MANUAL_TASKS.md) (MOB-META-01).
2. **Onboarding del coach v2 — correos W6 en ENSAYO desde el 06-09** ([spec](../specs/coach-onboarding-v2/SPEC.md),
   [auditoría](../audits/correos-y-crons-2026-09-05.md)): `..._DRY_RUN=true` en Production. Falta aprobar el copy
   y quitar el DRY_RUN; W8.4.2B a medias (`enqueueBehaviorCheck` sin sus 3 call sites); D13
   `OWNER_WHATSAPP_URL`; W7, F5.3–F5.5 RN y D4. `FREE_COACH_DRIP_ENABLED` **no** se setea.
3. **Embudo Free→Pro** ([spec](../specs/embudo-free-pro/SPEC.md)): W0–W6 en producción; queda App Store Connect (W7.4).
4. **FC de toda la sesión** (punto 2 de Movens, fuera del tren «Vuelta nueva»): plan aparte, arranca preguntándole
   a Movens qué banda usa ([SDD §6](../specs/vuelta-nueva-salud-y-reloj/SPEC.md)).

### 3. Decisiones del owner pendientes

1. **Prueba Pro 14 días al registrarse** (plan 14-09, artifact `WSXBg586`): veredicto variante B (día 15 vuelve
   a Free-1 + muro de cupo). Nada implementado; esperan Q1–Q4. Reemplaza la idea previa «trial al tocar el cupo».
2. **Dunning de `paused`**: (a) la gracia es letra muerta porque el webhook nulea `current_period_end`
   (`subscription-state.ts` vía `webhook-pipeline.ts`) ⇒ hacerla simétrica a `past_due` o borrarla del comentario;
   (b) apuntar el CTA del correo de dunning a `/coach/subscription/update-card`; (c) el camino Flow no tiene CTA.
3. **«Cobros coach → alumno» — BLOQUEADO** ([spec](../specs/cobros-coach-alumno/SPEC.md) `draft`, artifact `046f3bb1`):
   8 decisiones (§18.1) + 3 verificaciones externas (§18.2). Estimación 26-32 días-agente + 2-3 semanas de beta.

### 4. Bloqueado por terceros

1. **Push iOS caída desde el 07-09** (APNs `InvalidCredentials`): falta una Push Key `.p8`; el Apple ID del owner
   no tiene rol para crearla en el team `5GKWMMZ46Q` ⇒ Guimel crea la key o sube al owner a Admin.
2. **Android 1.1.2 en revisión de Play** desde el 10-09; producción espera 12 testers × 14 días.

### 5. Higiene y deuda técnica (tren «Casa en orden», ola C)

1. Dependabot: `js-yaml` (alta ×2) y `vitest`/`@vitest/mocker` (media ×2), todas dev.
2. DB: 3 tablas `_bak_*` (19-08, 21-08, 05-09) listas para retiro; el cron `purge-data` llama a
   `purge_old_audit_logs`, que no existe en LIVE; probe de columnas `side_photo_url`/`receipt_url`
   inexistentes (~12 errores `42703`/día, revisión 21-09).
3. Regen completo de `database.types.ts` (deja 13 errores en 7 archivos V1; retira los workarounds de T2.3
   y el cast `V2ReadClient`) · matriz RLS con JWTs reales + preflight V1→V2 (sin cambios desde 08-06).
4. **TTFB del área alumno**: región corregida (`regions: ["pdx1"]`, `deb8aee3`); queda re-medir p50/p75 de
   `/c/:coach_slug/dashboard` y decidir QW3 (doble render móvil+desktop).

### 6. Avisos a coaches pendientes (los manda el owner)

Movens y los 4 coaches A/B de «Vuelta nueva» ([SPEC §9](../specs/vuelta-nueva-salud-y-reloj/SPEC.md)) ·
`jotap-coach`/`olympuswolf` de «Cantidades honestas» (TASKS C7) · Ani (clave temporal HIBP).

### Cerrados recientes (detalle en cada spec)

Con QA VERDE ⇒ SDD `done`: «Vuelta nueva, salud y reloj» (21-09) · parche next 16.3.5 + REVOKE anon (21-09) ·
incidente Ani (23-09) · «Arreglos chicos pre-OTA», «Cuenta atrás», «Share bloque», «Señales honestas»,
«Porciones a la chilena», «Cantidades honestas» (10/11-09) · «Ciclo real y por lado» y cierres 02/04/05-09.
Prosa completa en el [historial](../archive/current-historial-2026-09.md).

## Reglas de actualización

- `master` integrado no implica production sana: confirmar Vercel y Supabase.
- Un build verde no sustituye QA físico; una migración en el repo no significa que esté aplicada.
- Las acciones operativas/manuales viven en [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md).
- Este archivo guarda solo prioridades y punteros; la evidencia extensa va a specs y auditorías
  fechadas. **Tope duro: 16 KB, verificado por `pnpm docs:check`** — si no entra, la historia se
  mueve a la spec, no se resume acá.
