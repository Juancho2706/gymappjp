# Resumen de ejecución — Plan Maestro EVA al 100%

**Referencia:** `claudeplans/PLAN-MAESTRO-100.md`  
**Fecha de este resumen:** 2026-04-14  
**Alcance cubierto en código y documentación:** desde **FASE 0 / TASK-01** (parte código) hasta **FASE 1 / TASK-03** inclusive.  
**No ejecutado aún en esta sesión:** **TASK-04** en adelante (el plan en el repo sigue con esos ítems sin marcar).

---

## Cómo leer este documento

- Cada sección corresponde a una **TASK** del plan maestro.
- Los subtasks marcados **[x]** en el plan reflejan trabajo **verificado o implementado**.
- Los subtasks **manuales** (panel MP, Vercel, pago real) solo se documentan como estado según lo indicado en conversación.

---

## TASK-01: MercadoPago → Modo Producción

### Subtasks manuales (01.1–01.6)

Indicaste que **ya aplicaste el cambio a producción** en MercadoPago (credenciales / entorno). En el archivo del plan esos checkboxes pueden seguir sin marcar si no se actualizaron a mano; **operativamente los diste por hechos**.

### 01.7 — Verificación en código

**Hecho.** Se confirmó el flujo:

1. `src/app/api/payments/create-preference/route.ts` construye `appUrl` con `process.env.NEXT_PUBLIC_SITE_URL` (fallback local) y arma `webhookUrl` como  
   `{appUrl}/api/payments/webhook?token=...` cuando existe `MERCADOPAGO_WEBHOOK_TOKEN`.
2. Esa URL se pasa a `MercadoPagoProvider.createCheckout` como `webhookUrl`.
3. `src/lib/payments/providers/mercadopago.ts` envía `notification_url: input.webhookUrl` al crear el `preapproval`.

No hay dominio hardcodeado para el webhook: depende de `NEXT_PUBLIC_SITE_URL`.

### 01.8 — Smoke test post-deploy

**Pendiente (manual en producción).** Checklist del plan: registro coach de prueba → checkout → pago → verificar `subscription_status = 'active'` y eventos en `subscription_events`.

### 01.9 — Documentación

**Hecho.** Se creó `docs/archive/MP-PRODUCCION.md` con:

- Variables de entorno esperadas en Vercel.
- Pasos de configuración de webhooks / eventos en MercadoPago.
- Referencia explícita a los archivos de código relevantes.
- Checklist de smoke test y troubleshooting breve.

---

## TASK-02: Branding por defecto — Logo EVA + colores del sistema

Objetivo del plan: si el coach no configuró “Mi Marca”, el alumno ve **logo y color EVA** en lugar de vacío o solo una letra.

### 02.1 — `BRAND_PRIMARY_COLOR`

**Hecho.** En `src/lib/brand-assets.ts` se exportó la constante:

- `BRAND_PRIMARY_COLOR = '#10B981'`

### 02.2 — Middleware: logo por defecto en header

**Hecho.** En `src/middleware.ts`:

- Si `coach.logo_url` es null o vacío (tras `trim`), el header `x-coach-logo-url` se setea a `BRAND_APP_ICON` (`/LOGOS/eva-icon.png`).
- El color por defecto del coach en ruta `/c/...` usa `BRAND_PRIMARY_COLOR` en lugar de `#007AFF`.
- Cuando el alumno desactiva colores del coach (`use_brand_colors`), el color por defecto pasa a `BRAND_PRIMARY_COLOR` (antes `#007AFF`).

### 02.3 — `ClientNav`: icono EVA cuando corresponde

**Hecho.** En `src/components/client/ClientNav.tsx`:

- Se añadió prop `coachLogoUrl`.
- Se renderiza el logo con `next/image`; si la URL coincide con `BRAND_APP_ICON`, se usa explícitamente ese asset (mismo tratamiento visual que un logo de coach).

### 02.4 — Layout alumno `/c/[coach_slug]`

**Hecho.** En `src/app/c/[coach_slug]/layout.tsx`:

- Fallback de color primario y viewport alineados con `BRAND_PRIMARY_COLOR` cuando faltan headers.
- Se lee `x-coach-logo-url` y se pasa a `ClientNav` como `coachLogoUrl` (con fallback a `BRAND_APP_ICON`).
- RGB por defecto del tema ajustado al verde EVA cuando el hex no parsea (fallback coherente con `#10B981`).

### 02.5 — Layout panel coach

**Hecho.** En `src/app/coach/layout.tsx`:

- Fallback de `--theme-primary` cuando no hay color de coach o el coach desactiva marca: `BRAND_PRIMARY_COLOR` en lugar de `#007AFF`.
- Fallback RGB del helper alineado con el verde EVA.

### 02.6 — `LogoUploadForm`: preview sin logo

**Hecho.** En `src/app/coach/settings/LogoUploadForm.tsx`:

- Sin `currentLogoUrl`, el placeholder muestra `BRAND_LOGO_WEB` (wordmark EVA) en lugar de la inicial del nombre.

### 02.7 — Manifest PWA default

**Hecho.** En `src/app/api/manifest/default/route.ts`:

- `theme_color` usa `BRAND_PRIMARY_COLOR` en lugar de un literal duplicado.

---

## TASK-03: Alineación Pricing / Landing

### 03.1 — Auditoría `/pricing`

**Hecho (verificación).** `src/app/pricing/page.tsx` ya:

- Lista los **5 tiers** (`starter_lite`, `starter`, `pro`, `elite`, `scale`).
- Muestra montos en **CLP** vía `getTierPriceClp` y formato `es-CL` (el símbolo `$` en Chile es convención local para pesos, no USD).

### 03.2 — CTAs `/pricing` → `/register`

**Hecho (verificación).** Cada tarjeta enlaza a:

`/register?tier={plan.id}&cycle={getDefaultBillingCycleForTier(plan.id)}`

IDs alineados con el esquema de registro.

### 03.3 — Landing `#precios` vs `/pricing`

**Hecho (verificación).** `src/app/page.tsx` usa las mismas utilidades (`TIER_CONFIG`, `getTierPriceClp`, `getDefaultBillingCycleForTier`, etc.) que pricing; no hay duplicación de números “a mano” fuera de `TIER_CONFIG`.

### 03.4 — Link “Ver todos los planes”

**Hecho (implementación).** En la sección `#precios` de la landing se añadió un enlace visible a `/pricing`.

### 03.5 — FAQ en `/pricing`

**Hecho (verificación).** La página de pricing incluye un bloque de **cuatro** preguntas/respuestas (dentro del rango 3–5 del plan) sobre cobro, cambio de plan, cancelación y soporte.

---

## Archivos tocados o creados (lista compacta)

| Archivo | Acción |
|---------|--------|
| `docs/archive/MP-PRODUCCION.md` | Creado |
| `docs/archive/RESUMEN-EJECUCION-PLAN-MAESTRO-100.md` | Creado (este documento) |
| `claudeplans/PLAN-MAESTRO-100.md` | Actualizado (checkboxes 01.7, 01.9, 02.*, 03.*) |
| `src/lib/brand-assets.ts` | Modificado (`BRAND_PRIMARY_COLOR`) |
| `src/middleware.ts` | Modificado (fallback logo/color EVA) |
| `src/app/c/[coach_slug]/layout.tsx` | Modificado (props a nav, fallbacks) |
| `src/components/client/ClientNav.tsx` | Modificado (logo dinámico + EVA) |
| `src/app/coach/layout.tsx` | Modificado (fallback color EVA) |
| `src/app/coach/settings/LogoUploadForm.tsx` | Modificado (preview EVA) |
| `src/app/api/manifest/default/route.ts` | Modificado (`theme_color`) |
| `src/app/page.tsx` | Modificado (link a `/pricing`) |

**Nota:** No se alteró la lógica de MercadoPago más allá de la verificación documentada; el cambio principal de TASK-01 en tu entorno fue **operativo** (credenciales / Vercel / webhooks).

---

## Próximo bloque del plan (sin hacer en esta ronda)

A partir de **`TASK-04: Registro Coach + Gate de Pago`** el plan sigue abierto: auditoría de `(auth)/register`, página de procesamiento post-pago, `/coach/reactivate`, trial `trialing`, y UX de login sin suscripción activa.

---

## Verificación sugerida antes de seguir

1. Completar **01.8** (smoke pago producción) y anotar resultado en `docs/archive/MP-PRODUCCION.md` si quieres trazabilidad.
2. Revisar en staging/prod: alumno sin marca del coach ve **icono + verde EVA** en nav y tema.
3. Desde la landing, probar el nuevo link **Ver todos los planes** → `/pricing`.
