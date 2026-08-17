# SPEC — Pricing v2: Free total (2), Pro 25, Elite 60, Starter fuera de venta

- **Origen:** decisión del dueño (2026-08-17) sobre el informe «Precios EVA v2»
  (artifact `e1c1f0db`, investigación de 5 workers: repo + DB LIVE + Supabase + 9
  competidores + economía freemium). La reestructura cuesta $0 de MRR hoy: nadie
  ocupa las zonas afectadas.
- **Rama:** `rnmobiledenuevo`. **Los PRECIOS no cambian en esta tanda** (29.990 /
  44.990): el estudio de IVA (aparte, en curso) decide si los montos se tocan —
  una sola renegociación con los pagadores, no dos.

## Decisiones

**P1 — Estructura de venta: Free / Pro / Elite. Starter MUERE de venta.**
- Free $0 · **2 alumnos** · TODO liberado (4 módulos: cardio, evaluación de
  movimiento, composición corporal, intercambios de nutrición; ejercicios custom;
  importar alumnos) EXCEPTO white-label (`isBrandingAllowed` sigue Pro+).
- Pro $29.990 · **hasta 25 alumnos** · todo + marca propia.
- Elite $44.990 · **hasta 60 alumnos** (antes 100; 0 coaches afectados).
- `starter` sale de `SALE_TIERS` pero QUEDA en el union, en `TIER_CONFIG` y en el
  CHECK de DB (mismo trato que growth/scale). Compras nuevas de starter se
  RECHAZAN (enums de pago, cupones).

**P2 — Grandfathering (regla del dueño, literal): «los pro actuales retienen sus
30; los free actuales retienen sus 3; y los demás archivados igual».**
- Mecanismo: helper único en `@eva/tiers` — `tierMaxClientsFor(tier, coachCreatedAt)`
  con fecha de corte `PRICING_V2_CUTOVER` (la fecha del deploy): coach creado ANTES
  del corte ⇒ límites viejos (free 3, pro 30, elite 100); creado DESPUÉS ⇒ nuevos
  (2/25/60). CERO DDL: la fecha de creación ya existe y es inmutable.
- TODO sitio que ESCRIBE `coaches.max_clients` pasa por ese helper:
  `activate-free.service.ts` (hoy escribe `freeLimit`), `trial-expiry/route.ts`
  (hoy hardcodea 3), confirms de pago/webhooks que fijen límite, panel admin.
  Así un coach viejo que se da de baja, queda archivado y REACTIVA (web
  `/coach/reactivate` o RN «volver al plan gratuito») conserva su 3 — y un pro
  viejo que renueva o cae y vuelve conserva su 30.
- `capacity.service` (OVER_CAPACITY en downgrades) usa el mismo helper.
- Las filas existentes de `max_clients` NO se tocan (nada de UPDATE masivo).

**P3 — Módulos liberados para free:** `hasPaidModuleAccess()`
(`entitlements.service.ts`) deja de exigir `tier != 'free'` para standalone; los
4 módulos van `ALL_MODULES_ON` para todo coach activo. El addon
`nutrition_exchanges` deja de tener sentido de compra (ya venía incluido en todo
plan pago desde 2026-07-17; ahora también en free) — la compra se retira de la UI,
las cortesías `admin_grant` existentes no se tocan. White-label intacto.

**P4 — Capabilities de free a true:** `canCreateCustomExercises`,
`canImportClients` (y sus enforcement en exercises.actions, import.actions, API
mobile). `canUseNutrition` se re-lee: hoy solo gatea superficies de venta — esas
superficies pasan a mostrar nutrición como incluida en TODOS los planes.

**P5 — El bug `?? 'starter'` se paga entero:** los ~35 sitios con fallback a
`'starter'` pasan a `?? 'free'` (proxy, webhook-pipeline ×5, confirms ×3, crons
de reconciliación ×2, pr-card, register.actions, layouts web, API mobile,
settings RN, email-brand, crons de recordatorio, admin). Con starter fuera de
venta, un tier null aterrizando en un tier pago es inaceptable. Nota: para
branding era fail-closed de casualidad; para `max_clients` inflaba free 3→10.

**P6 — Superficies de venta:**
- Landing (`LandingPricingPreview`), `/pricing` y register web leen `SALE_TIERS`
  ⇒ quitar starter del array los deja en 3 planes solos; PERO `/pricing` agrupa
  (starter+pro) manualmente y los bullets de features por plan mencionan qué trae
  cada tier — revisar copy: free ahora dice «todo incluido, 2 alumnos, sin marca
  propia»; el JSON-LD SEO de /pricing se regenera solo desde TIER_CONFIG.
- `/coach/reactivate` (web y RN): revisar que muestre la estructura nueva y que
  la salida «volver al plan gratuito» comunique el límite correcto del coach
  (grandfather incluido — un coach viejo ve «3 alumnos», uno nuevo «2»).
- Página de suscripción del coach (`SubscriptionContent`) y panel admin
  (`CoachCommandPanel`): sin starter como opción de cambio.
- RN registro ya es free-only sin precios (compliance stores): sin cambios.
- Upsell/upgrade gates (`upgradeRequired` en clients.actions y API mobile):
  el mail de venta y el CTA apuntan a Pro (no a starter).

**P7 — Cerco de verdad:** `joinViaInviteAction` (join.actions.ts) gana el
conteo contra `max_clients` que hoy NO tiene (scope standalone está apagado,
pero team/enterprise insertan sin tope y el hueco documentado sigue vivo).

**P8 — Medición ANTES de encender Meta:** instrumentar `/pricing` (pageview +
click de plan) y el funnel de checkout en PostHog (la F0 del informe de agosto,
aún pendiente). Sin baseline no se evalúa nada de lo anterior.

## Invariantes

- Cero DDL, cero migraciones, cero UPDATE masivo de datos.
- Ningún coach existente pierde capacidad ni features: el cambio solo AGREGA
  (módulos/capabilities a free) o acota a NUEVOS (límites 2/25/60).
- Ningún pagador actual cambia de precio ni de límite.
- Starter queda operable para el histórico (billing snapshots, cupones ya
  emitidos sobre starter se decide en pendientes).
- Enterprise congelada intacta; RN sigue registrando solo free.

## Decisiones PENDIENTES del dueño (anotadas, NO van en esta tanda)

1. **Tramo de entrada Pro $17.990 ≤10 alumnos** (propuesta F1 de agosto): se
   evalúa con datos POST-campaña Meta, no antes.
2. **WhatsApp 1:1 con los 9 pros actuales**: contarles que conservan 30 y que
   free ahora regala más (transparencia > que se enteren solos). Y revisar si
   alguno con ≤2 alumnos y sin marca podría bajarse (riesgo −29.990).
3. **IVA**: estudio aparte en curso (precio+IVA mostrado y cobrado). Toca montos,
   checkout, boleta/factura y a los 9 preapprovals vigentes.
4. **Cupones starter históricos** (`COUPON_TIERS`): ¿rechazar canje futuro o
   migrar a pro? (hoy: dejar de emitir; canje existente se decide aquí).
5. **Compresión client-side de fotos de check-in** (695 KB → ~100 KB): backlog
   técnico barato, único costo que escala por alumno.
6. **Backfill del drip** de los coaches free existentes sin welcome (deuda de
   junio): con free más generoso + ads, el drip es la palanca de conversión.
7. **Anual «2 meses gratis»**: único cambio que SUBE caja; empaquetar con el
   anuncio del re-empaque o con el cambio de IVA.

## Criterios de aceptación

- Tests: helper de grandfather (fechas antes/después del corte × 3 tiers),
  activate-free/trial-expiry/capacity con coach viejo y nuevo, módulos free ON,
  fallbacks `?? 'free'`, enums rechazan starter, joinViaInviteAction respeta tope.
- Capturas: landing/pricing/register a 3 planes; reactivate web con límite
  grandfathered.
- Gates completos verdes; RN tsc + expo export (consume @eva/tiers).
- PostHog: eventos de /pricing visibles en el proyecto.
