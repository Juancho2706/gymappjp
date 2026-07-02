# 1. Hub de Opciones (variantes por contexto) y eliminacion de cuenta

Ruta: `/coach/settings`. Componente raiz: `CoachSettingsPage` (RSC) en `apps/web/src/app/coach/settings/page.tsx`. Metadata: `title: 'Opciones | EVA'`.

Es un hub **context-aware** que renderiza una de tres variantes de pantalla segun el `subscription_status` y el tier del coach. No tiene `_actions` propios para el hub mas alla de `DangerZone` (la marca, modulos, funciones y areas viven en subrutas). El unico bloque interactivo dentro de la pagina hub es `DangerZone` (eliminacion de cuenta).

---

## 1.1 Datos que resuelve el hub (`settings.queries.ts`)

Archivo: `apps/web/src/app/coach/settings/_data/settings.queries.ts`. Funcion: `getCoachSettingsForUser` envuelta en `cache` de React (dedup por request).

Flujo de datos:

1. `createClient()` (`@/lib/supabase/server`) — cliente Supabase SSR con cookies.
2. `supabase.auth.getClaims()` — verificacion **local** del JWT (ES256), sin round-trip a GoTrue `/user`. El proxy ya valido/refresco la sesion. Se extrae `__cl?.claims?.sub` como `user.id`. Si no hay `sub`, retorna `{ user: null, coach: null }`.
3. Una sola query a `coaches` filtrada por `.eq('id', user.id)` con `.maybeSingle()`, seleccionando columnas **explicitas** (no `SELECT *`):

> Columnas seleccionadas (todas de la fila `coaches` del propio coach):
> `id, full_name, brand_name, slug, invite_code, slug_changed_at, primary_color, logo_url, welcome_message, welcome_modal_content, welcome_modal_enabled, welcome_modal_type, welcome_modal_updated_at, welcome_modal_version, loader_text, loader_text_color, loader_icon_mode, loader_show_icon, use_custom_loader, onboarding_guide, subscription_tier, subscription_status, subscription_mp_id, superseded_mp_preapproval_id, billing_cycle, current_period_end, trial_ends_at, trial_used_email, payment_provider, max_clients, marketing_consent, previous_slugs, use_brand_colors_coach, admin_notes, health_data_consent_at, updated_at, created_at`

Retorna `{ user, coach }` tipado como `CoachSettingsRow | null` = `Tables<'coaches'>`.

Observacion backend: el hub trae un superset de columnas. Para decidir la variante el render solo usa `subscription_status` y `subscription_tier`. Gran parte de las columnas de branding (`primary_color`, `logo_url`, `welcome_*`, `loader_*`, etc.) **no se usan en el hub** porque la marca vive en `/coach/settings/brand`; quedan disponibles por la `cache` para subarboles, pero el hub actual no las consume. Candidato a adelgazar el `select` en el rediseno.

---

## 1.2 Logica de seleccion de variante (en `page.tsx`)

Orden de evaluacion (primer match gana):

1. `if (!user) redirect('/login')`
2. `if (!coach) redirect('/login')`
3. `if (coach.subscription_status === 'org_managed') redirect('/coach/dashboard')` — un coach de **org enterprise** no tiene hub de opciones aqui; se va al dashboard.
4. `if (coach.subscription_status === 'team_managed')` → **Variante (c) Team**.
5. Calcula `tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier` y `capabilities = getTierCapabilities(tier)`.
6. `if (!capabilities.canUseBranding)` → **Variante (b) Upsell sin branding** (free/starter).
7. Si llega aca (tiene `canUseBranding`) → **Variante (a) Standalone con branding** (pro/elite/growth/scale).

`getTierCapabilities` viene de `@/lib/constants` (re-export de `@eva/tiers`, `packages/tiers/index.ts`).

### Tabla de capabilities por tier (`TIER_CAPABILITIES` en `packages/tiers/index.ts`)

| tier | canUseBranding | Variante del hub resultante |
|------|----------------|------------------------------|
| `free` | `false` | (b) Upsell |
| `starter` | `false` | (b) Upsell |
| `pro` | `true` | (a) Con branding |
| `elite` | `true` | (a) Con branding |
| `growth` | `true` | (a) Con branding |
| `scale` | `true` | (a) Con branding |

`isBrandingAllowed(tier)` = `TIER_CAPABILITIES[tier]?.canUseBranding === true` (mismo gate usado server-side en los actions de marca). Decision CEO 2026-06-21 (white-label v2): branding visual = **Pro+ entero**.

> GOTCHA DE CONSISTENCIA DE PRODUCTO (no de codigo): la variante (b) Upsell **vende el branding como "Disponible en Starter"** con precio Starter ($19.990/mes), pero `TIER_CAPABILITIES.starter.canUseBranding = false`. Es decir, un coach que compre Starter siguiendo ese CTA **seguiria cayendo en la variante (b) Upsell**, no obtendria branding (el gate real es Pro+). El CTA apunta a `/coach/subscription?upgrade=starter`. Esto es un desajuste entre el copy/pricing del upsell y el gate efectivo — marcar para el rediseno (o el upsell debe vender Pro, o el gate debe bajar a Starter).

---

## 1.3 Variante (a) — Standalone CON branding (pro/elite/growth/scale)

Encabezado: titulo "Opciones", subtitulo "Tu marca, tu suscripcion y la configuracion de tu cuenta, todo en un solo lugar."

Estructura funcional (cards de navegacion, cada una un `Link` de Next):

1. **Mi Marca** → `/coach/settings/brand`. Descripcion funcional: "Logo, colores, nombre y mensajes de la app de tus alumnos". El branding **dejo de vivir inline**; ahora es su propia pagina.
2. **Suscripcion** → `/coach/subscription`. Descripcion: "Tu plan, facturacion, alumnos activos y metodos de pago". (Sin cambios funcionales respecto a la pagina de suscripcion.)
3. **Opciones Coach** (`<section>` agrupadora, no es link) con tres sub-links internos:
   - **Modulos** → `/coach/settings/modules`. Catalogo de entitlements read-only, **compra-only**. Descripcion: "Cardio, evaluacion de movimiento, composicion corporal, nutricion por intercambios".
   - **Areas del builder** → `/coach/settings/areas`. Descripcion: "Organiza los dias con tus propias areas (Movilidad, Core, HYROX...)".
   - **Funciones** → `/coach/settings/funciones`. Toggles de visibilidad. Descripcion: "Que tan a fondo trabajas la nutricion y que secciones ven tus alumnos".
4. **DangerZone** (siempre alcanzable).

Comentario en codigo: la agrupacion "Opciones Coach" se diseno para alojar la zona "Funciones" en Fase C; el espacio quedo agrupado.

---

## 1.4 Variante (b) — Standalone SIN branding / free (upsell de Mi Marca)

Condicion: `!capabilities.canUseBranding` (tiers `free` y `starter`).

Componente de tracking: `<UpgradeGateTracker gate="branding" currentTier={tier} />` (`@/components/analytics/UpgradeGateTracker`) — registra impresion del gate de branding con el tier actual (analytica de conversion).

Contenido funcional de la pantalla (toda la pagina es un argumento de venta de branding):

- **Hero "Mi Marca"** con copy: "Tus alumnos entran a **tu app** — con tu logo, tus colores y tu nombre. Disponible en Starter."
- **Comparativa before/after** (dos mockups: "Sin tu marca (ahora)" vs "Con Starter") — mockup ilustrativo, datos hardcodeados, sin lectura de la marca real del coach.
- **Bloque de pricing + features + CTA**:
  - Precio mostrado: **$19.990/mes** y **$15.992/mes anual** con badge **−20%**, etiqueta "Disponible en Starter". (Numeros literales en el JSX, no leidos de `TIER_CONFIG`.)
  - Lista de features (hardcodeada): "Tu logo en la app del alumno", "Colores y nombre de tu marca", "Loader y pantalla de carga personalizados", "Hasta 10 alumnos activos".
  - CTA: `Link` a `/coach/subscription?upgrade=starter` ("Personaliza tu app con Starter →"). Subtexto: "Sin permanencia · Cancela cuando quieras".
- **DangerZone** (comentario en codigo: "La eliminacion de cuenta es un derecho del usuario: visible tambien sin branding").

> Notas backend de esta variante:
> - El precio y los features son **estaticos en el JSX**, no provienen de la query ni de `TIER_CONFIG`. Riesgo de drift si cambian los precios reales.
> - El componente `WhatChangesList` (`_components/WhatChangesList.tsx`) define una grilla de 6 items de marca (Color de marca, Logo, Nombre, Mensaje de bienvenida, Loader animado, Icono de app) con descripcion funcional de donde aplica cada uno (login/nav/instalacion, titulo+pestaña, login del alumno, transiciones de carga, pantalla de inicio del telefono). **No esta importado ni renderizado en `page.tsx`** en su estado actual — es un componente disponible/huerfano para el rediseno del upsell. Sus 6 items son la lista canonica de "que cambia con la marca" como datos (no estilos): cada item = `{ label, desc }`.

---

## 1.5 Variante (c) — Team managed (`subscription_status === 'team_managed'`)

Contexto: el coach pertenece a un **team** (pool plano de coaches). La marca es **del equipo** (Brand Studio en `/coach/team`) y la facturacion la maneja EVA. Por eso aqui NO hay card de Mi Marca propia ni de Suscripcion; solo modulos del pool, areas, equipo, funciones y cuenta personal.

Encabezado: titulo "Opciones", subtitulo "La marca y la suscripcion las gestiona tu equipo. Aqui estan los modulos del pool y tu cuenta personal."

Cards (todas `Link`):

1. **Modulos del equipo** → `/coach/settings/modules`. Descripcion: "Cardio, evaluacion de movimiento, composicion corporal, intercambios".
2. **Areas del builder** → `/coach/settings/areas`. Descripcion: "Areas del equipo para armar los dias (Movilidad, Potencia, custom...)".
3. **Mi Equipo** → `/coach/team`. Descripcion: "Marca del equipo, miembros, accesos de alumnos y codigo de invitacion".
4. **Funciones del equipo** → `/coach/settings/funciones`. Descripcion: "Que tan a fondo trabaja el equipo la nutricion y que secciones ven los alumnos". Comentario en codigo: visibilidad de nutricion solo gestores; la query/RLS gatean.
5. **DangerZone**.

Diferencias clave vs variante (a): NO hay "Mi Marca" propia, NO hay "Suscripcion", se agrega "Mi Equipo", y las descripciones se reescriben en terminos de "del equipo".

---

## 1.6 DangerZone — Eliminacion de cuenta

Componente: `apps/web/src/app/coach/settings/_components/DangerZone.tsx` (`'use client'`). Server action: `deleteCoachAccountAction(confirmText)` en `apps/web/src/app/coach/settings/_actions/settings.actions.ts`.

### Frontend (funcional)

- Card "Zona de peligro" con boton "Eliminar mi cuenta" que abre un **overlay modal fijo** (`fixed inset-0 z-50`).
- El modal lista las consecuencias y exige escribir literalmente **`ELIMINAR`** en un input. El boton de confirmacion esta **deshabilitado** mientras `confirmText !== 'ELIMINAR'` o mientras `isPending`.
- Estado: `useState` (open, confirmText, error) + `useTransition` (isPending).
- Al confirmar llama `deleteCoachAccountAction(confirmText)`. Si retorna `{ error }`, lo muestra inline. En exito el server **redirige a `/login?deleted=true`** (no hay manejo de exito en cliente, el redirect lo hace el action).
- Texto de consecuencias mostrado al usuario (modal): datos personales de alumnos anonimizados; registros de entrenamiento y nutricion eliminados; suscripcion activa cancelada en MercadoPago; desuscripcion de todos los emails de EVA. Nota legal: "Los registros contables se conservan 6 anos por obligacion legal (Ley SII)".

### Backend — `deleteCoachAccountAction` (que borra, que conserva, COMO)

Encuadre legal en codigo: "Ley 21.719 — right to erasure".

Pasos exactos:

1. **Guard de confirmacion:** si `confirmText !== 'ELIMINAR'` → `{ error: 'Confirmacion incorrecta.' }`. (Doble guard: cliente deshabilita el boton, server revalida.)
2. **Auth:** `createClient()` + `supabase.auth.getUser()` (aqui usa `getUser`, no `getClaims`, por ser operacion destructiva). Sin user → `{ error: 'No autenticado.' }`. `coachId = user.id`.
3. **Cliente service-role:** `createServiceRoleClient()` (`@/lib/supabase/admin-client`) = `adminDb`, que **bypasea RLS** (sin cookies) para los borrados cross-tabla.
4. **Lee datos minimos del coach** via `adminDb`: `subscription_mp_id, subscription_status, subscription_tier` (`.maybeSingle()`).
5. **Cancela suscripcion MercadoPago (best-effort, no fatal):** solo si `mpId` existe (trim no vacio) **y** `subscription_status === 'active'` **y** `subscription_tier !== 'free'`. Llama `getPaymentsProvider().cancelCheckoutAtProvider(mpId)` (`@/lib/payments/provider`). Cualquier error se atrapa con `console.warn` y continua (no bloquea la eliminacion).
6. **Anonimiza PII de alumnos (conserva la estructura de entrenamiento como IP del coach):** trae `clients.id` por `coach_id`, guarda `clientIds`, y hace `UPDATE clients` por `coach_id` seteando `full_name = '[Eliminado]'`, `email = 'eliminado-<coachId>@anonymized.eva'`, `phone = null`. **No borra** las filas de `clients` (solo borra identificadores).
7. **Borra datos de salud (sensibles) si hay `clientIds`:**
   - `DELETE workout_logs WHERE client_id IN (clientIds)`.
   - Trae `daily_nutrition_logs.id` por `client_id IN (clientIds)`; si hay, `DELETE nutrition_meal_logs WHERE daily_log_id IN (dailyLogIds)`.
   - `DELETE check_ins WHERE client_id IN (clientIds)`.
8. **Borra logo del storage (best-effort):** `supabase.storage.from('logos').remove(['<coachId>/logo.jpg', '<coachId>/logo.png'])` dentro de try/catch (no fatal). Usa el cliente con cookies (`supabase`), no `adminDb`.
9. **Borra el auth user:** `adminDb.auth.admin.deleteUser(coachId)`. La fila `coaches` se elimina por **CASCADE** del FK al auth user. Si falla → `{ error: 'Error al eliminar la cuenta. Contacta soporte en privacidad@eva-app.cl' }`.
10. **`redirect('/login?deleted=true')`**.

### Que se BORRA vs que se CONSERVA

| Dato | Accion |
|------|--------|
| Auth user (`auth.users`) | Borrado (`deleteUser`) |
| Fila `coaches` | Borrada por CASCADE del FK |
| Filas `clients` | **Conservadas pero anonimizadas** (`full_name='[Eliminado]'`, `email` sintetico, `phone=null`) |
| `workout_logs` de esos clientes | Borrados |
| `nutrition_meal_logs` (via `daily_nutrition_logs`) | Borrados |
| `check_ins` | Borrados |
| Logo en bucket `logos` | Borrado (best-effort, solo `.jpg`/`.png`) |
| Suscripcion MercadoPago | Cancelada en el proveedor (best-effort, solo si active + no free) |
| Registros contables | **Conservados 6 anos** (obligacion Ley SII) — declarado al usuario; el action no los toca |

### Brechas/observaciones backend de la eliminacion (para el rediseno)

- La cancelacion MP y el borrado de logo son **best-effort** (errores silenciados). Si MP falla, la cuenta se elimina igual y podria quedar una preaprobacion viva en el proveedor.
- El borrado de logo asume extensiones `.jpg`/`.png` literales; si el path real tenia otra extension (el upload usa `file.name.split('.').pop()`, ver `updateLogoAction`) el archivo puede quedar huerfano en storage.
- No se mencionan ni borran explicitamente: `coach_addons`, `billing_snapshots`, `push_subscriptions`, `nutrition_plans`/`workout_programs`/`workout_plans` (estructura — intencional, IP del coach), ni filas de `teams`/`organization_members`. Depende de CASCADEs no verificados en este archivo. La accion **no toca** `coach_addons`/`billing_snapshots` (service-role only) — quedan a merced de FKs.
- El copy del modal promete "desuscripto de todos los emails de EVA" pero el action **no llama** a ninguna API de Resend/desuscripcion; ese efecto seria un side-effect del borrado del usuario, no una llamada explicita. Posible promesa no cumplida en codigo.

---

## 1.7 Resumen de gating y compra-only relevante al hub

- **Decision de variante:** `subscription_status` (`org_managed`→redirect dashboard, `team_managed`→(c)) y `capabilities.canUseBranding` (`pro`+→(a), `free`/`starter`→(b)).
- **`canUseBranding`** es funcion pura de tier via `TIER_CAPABILITIES`/`getTierCapabilities`/`isBrandingAllowed` en `packages/tiers/index.ts`. Mismo gate que enforcan los actions de marca server-side (`updateBrandSettingsAction`, `updateLogoAction`).
- **Compra-only / service-role:** el hub solo lee de `coaches` (user-scoped). Las escrituras de marca van por `coaches_update_own` (RLS user-scoped, columnas branding con GRANT UPDATE de columna). Modulos/funciones/areas son subrutas; sus entitlements (`coaches.enabled_modules`, `coach_addons`) son compra-only / service-role y el hub solo los referencia por navegacion, no los escribe.
- **DangerZone** es la unica escritura del hub y corre con **service-role** (`adminDb`) para cross-tabla, excepto auth/storage que usan el cliente con cookies.
