---
status: active
owner: product-engineering
last_verified: "2026-09-30"
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
| Web/PWA | Pricing v3 productivo: Free = 1 alumno + white-label + sello «Hecho con EVA»; Pro 25 sin sello. **Deploy vigente 30-09: `master` = `rnmobiledenuevo` = `759b47d1`** («Kilos o libras», `dpl_AouZB5An…`). | [Runbook](../operations/RUNBOOK.md) · [spec](../specs/pricing-v3/SPEC.md) |
| App nativa (RN) | iOS **1.1.3** pública desde el 16-09 (piso OTA iOS = 1.1.3); Android **1.1.3 (87) pública en Play desde el 25-09** (producción 100 %, 177 países; verificado en consola 26-09; ficha anónima 200 con «Instalar» en CL/AR/US el 01-10). La landing enlaza Play junto al App Store desde el 01-10 (`ANDROID_STORE_IS_PUBLIC = true`). Pistas de prueba: interna y cerrada pausadas (pausa de alpha aprobada al 27-09), abierta nunca usada; el 01-10 se quitó la lista «EVA TESTERS» (22) de ambas (interna aplicada al instante, alpha enviada a revisión) ⇒ todos reciben producción. Queda OTA doble mientras haya Android en 1.1.2 y el binario B (R8, antes de feb 2027). **OTAs vigentes 30-09**: 1.1.3 android `24d7a59f` / ios `6c11fb23` desde `master` `759b47d1` (kg/lb); 1.1.2 android `31212063` desde el tag `ota/1.1.2-20260930` (sin kg/lb). | [Mobile parity](MOBILE_PARITY.md) · [OTA](../operations/MOBILE_RELEASES_OTA.md) · [SDD Android 1.1.3](../specs/android-113-play/SPEC.md) |
| Nutrition V2 | Canónica para Standalone/Team. «Porciones a la chilena» y «Cantidades honestas» cerrados con QA VERDE (SDD `done`). V1 congelada, **no se borra** (decisión owner 03-08): solo migrar usuarios. | [Porciones CL](../specs/nutrition-porciones-chilenas/SPEC.md) · [Runbook de corte](../operations/NUTRITION_V2_CUTOVER_RUNBOOK.md) · [Delta V1](../audits/v1-deprecation-map-delta-2026-08-03.md) |
| Teams | Pool, membresías y workspaces implementados; queda la matriz Team del archivado. | [Flows](../architecture/FLOWS_AND_COMPONENTS.md#team) · [Archivado](../../specs/archive-nutrition-v2-cutover/SPEC.md) |
| Enterprise | **ELIMINADO (owner 01-09)**: E0+E1 en producción 05-09 (`/enterprise` ⇒ 308 a `/pricing`). **Queda E2**: ruta `/e/…`, tablas/funciones org y 2 RPC `SECURITY DEFINER` ejecutables por `anon` (`get_enterprise_alumno_context`, `get_org_branding`). | [SDD retiro](../specs/retiro-starter-y-enterprise/SPEC.md) |

## Prioridades vigentes

### 1. En producción, esperan QA del owner (⇒ SDD `done`)

Nada pendiente: el owner confirmó el 01-10 que los QA de «Elige cómo pagar», «Reps tras el reloj» + E1,
«Despegue rápido», fix RN «Asignar plantilla», fix RN buscador de «Cambiar», «Kilos o libras» (SPEC §7),
Android 1.1.3 en Play, «Entrada dark v1», «+ Nueva pregunta qué crear» e íconos de Nutrición estaban
verdes. De «Kilos o libras» queda solo el barrido W5.4 (re-correr la Parte A del SQL con la adopción del
OTA; [TASKS](../specs/kg-lb-ejecutor/TASKS.md)).

### 2. Frentes abiertos

1. **Meta SDK iOS** ([SDD](../specs/meta-app-events-ios/SPEC.md)): mide de punta a punta desde el 16-09.
   Queda SKAN cuando Meta habilite «Configurar eventos» y confirmar si la hoja ATT salió en inglés
   (⇒ `locales`, build nueva). Pasos de consola en [MANUAL_TASKS](../operations/MANUAL_TASKS.md) (MOB-META-01).
2. **Onboarding del coach v2 — correos W6 en ENSAYO desde el 06-09** ([spec](../specs/coach-onboarding-v2/SPEC.md),
   [auditoría](../audits/correos-y-crons-2026-09-05.md)): `..._DRY_RUN=true` en Production. Copy v2 aprobado el
   01-10 y en código ([TASKS § W6 v2](../specs/coach-onboarding-v2/TASKS.md)): falta el botón de baja del admin,
   deploy + `ONBOARDING_BEHAVIOR_EMAILS_SINCE` en Vercel, 24 h de ensayo y quitar el DRY_RUN. W8.4.2B a medias
   (`enqueueBehaviorCheck` sin sus 3 call sites); W7, F5.3–F5.5 RN y D4. `FREE_COACH_DRIP_ENABLED` **no** se setea.
3. **Embudo Free→Pro** ([spec](../specs/embudo-free-pro/SPEC.md)): W0–W6 en producción; queda App Store Connect (W7.4).
4. **FC de toda la sesión** (punto 2 de Movens, fuera del tren «Vuelta nueva»): plan aparte, arranca preguntándole
   a Movens qué banda usa ([SDD §6](../specs/vuelta-nueva-salud-y-reloj/SPEC.md)).
5. **Renovaciones Flow** (28-09, [incidente](../audits/flow-renovaciones-2026-09-28.md)): el plan de $29.990 avisaba a
   `//api` (308) ⇒ ninguna renovación llegaba; `olympuswolf` quedó 24 días con Pro gratis (cortado). Arreglado con
   regla de Cloudflare + guardas en `paid-expiry`/`flow-reconcile`. **Queda: verificar la renovación de Movens el 02-10.**

### 3. Decisiones del owner pendientes

1. **Dunning de `paused`**: (a) la gracia es letra muerta porque el webhook nulea `current_period_end`
   (`subscription-state.ts` vía `webhook-pipeline.ts`) ⇒ hacerla simétrica a `past_due` o borrarla del comentario;
   (b) apuntar el CTA del correo de dunning a `/coach/subscription/update-card`; (c) el camino Flow no tiene CTA.
2. **«Cobros coach → alumno» — BLOQUEADO** ([spec](../specs/cobros-coach-alumno/SPEC.md) `draft`, artifact `046f3bb1`):
   8 decisiones (§18.1) + 3 verificaciones externas (§18.2). Estimación 26-32 días-agente + 2-3 semanas de beta.

### 4. Bloqueado por terceros

1. **Push iOS caída desde el 07-09** (APNs `InvalidCredentials`): falta una Push Key `.p8`; el Apple ID del owner
   no tiene rol para crearla en el team `5GKWMMZ46Q` ⇒ Guimel crea la key o sube al owner a Admin.

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

01-10: los 10 QA del owner de la prioridad 1 (`reps-tras-el-reloj`, `despegue-rapido`, `entrada-dark-v1` y
`library-new-choice` pasan a `done`) · «Prueba Pro 14 días» **descartada** por el owner · reels de marketing
cerrados. Con QA VERDE ⇒ SDD `done`: [«Dossier por meses»](../specs/dossier-por-meses/SPEC.md) (26-09; su E2E sigue
sin correr, espera OK del owner) · «Vuelta nueva, salud y reloj» (21-09) · parche next 16.3.5 + REVOKE anon (21-09) ·
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
