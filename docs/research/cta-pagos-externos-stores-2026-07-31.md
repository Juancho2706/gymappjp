# CTA de pago externo en la app movil: que exigen Apple y Google

> **Histórico.** La regla vigente vive en `apps/mobile/AGENTS.md`
> §«Pagos y tiendas — regla vigente» (W7 del embudo Free→Pro, 2026-08-22). Este documento se
> conserva por la investigación que la sustenta; no se usa como instrucción.

**Fecha:** 2026-07-31
**Contexto:** preparacion del lanzamiento de EVA en App Store y Google Play.
**Decision del CEO:** una sola build para iOS y Android, alineada al criterio mas estricto (iOS).

---

## 1. Resumen ejecutivo

EVA cobra al **coach** una suscripcion de software (Pro, modulos, limites de alumnos) que se paga
**en la web** via MercadoPago / Flow. La app movil hoy tiene botones que abren el navegador en
`eva-app.cl/coach/subscription`.

- **El pago en la web NO es el problema.** Ambas tiendas permiten que una suscripcion comprada
  fuera se use dentro de la app.
- **El problema son los CTA dentro de la app** (botones, links, precios, textos que digan donde
  pagar). Eso es *anti-steering* y lo prohiben **Apple y tambien Google**.
- **Accion:** quitar los CTA en ambas plataformas, dejar solo estado del plan, y mover la venta a
  email + web.

Riesgo si no se hace: rechazo casi seguro en App Store (motivo 3.1.1) y riesgo de suspension en
Play por la politica de pagos.

---

## 2. Que dice Apple

### 2.1 Guideline 3.1.1 — In-App Purchase

> "If you want to unlock features or functionality within your app (by way of example:
> subscriptions, in-game currencies, game levels, access to premium content, or unlocking a full
> version), you must use in-app purchase."

Y sobre los links, fuera del storefront de EE.UU.:

> "apps and their metadata may not include buttons, external links, or other calls to action that
> direct customers to purchasing mechanisms other than in-app purchase."

**Aplicacion a EVA:** la suscripcion del coach desbloquea funcionalidad dentro de la app (modulos,
cupos de alumnos) → cae en 3.1.1.

### 2.2 Excepcion que NO nos salva: 3.1.3(d) Person-to-Person Services

> "If your app enables the purchase of real-time person-to-person services between two individuals
> (for example tutoring students, medical consultations, real estate tours, or **fitness training**),
> you may use purchase methods other than in-app purchase to collect those payments. One-to-few and
> one-to-many real-time services must use in-app purchase."

Menciona explicitamente *fitness training*, pero pide dos condiciones que EVA no cumple:

1. **En tiempo real** — el coaching de EVA es asincrono (planes, check-ins), no sesiones en vivo.
2. **Que lo que se compra sea el servicio entre dos personas** — en EVA lo que se cobra es la
   suscripcion del coach al software, no el alumno pagandole al coach dentro de la app.

### 2.3 Excepcion que NO nos salva: 3.1.3(c) Enterprise Services

Permite acceso a suscripciones ya compradas cuando la app se vende **solo a organizaciones para sus
empleados o estudiantes**, pero cierra con:

> "Consumer, single user, or family sales must use in-app purchase."

Un coach independiente es exactamente una venta *single user*.

### 2.4 La excepcion real: storefront de EE.UU.

Tras el fallo judicial contra Apple (2025), en el **storefront de EE.UU.** los links y botones
externos estan permitidos sin entitlement ni comision. **Chile queda bajo la regla vieja**, y la app
se distribuye en 175 paises, asi que la restriccion aplica.

Caminos formales si algun dia se quiere el link dentro de la app:
- Implementar **IAP** (comision 15-30%).
- Pedir el **External Purchase Link Entitlement** (hoy no cubre Chile).

---

## 3. Que dice Google

La [politica de pagos de Google Play](https://support.google.com/googleplay/android-developer/answer/10281818)
exige Google Play Billing para suscripciones de contenido y servicios (menciona *fitness* entre los
ejemplos) y prohibe:

> "may not lead users to a payment method other than Google Play's billing system"

incluido "directly linking to a webpage that could lead to an alternate payment method".

**Exenciones que existen y por que no aplican a EVA:**

| Exencion | Aplica a EVA |
|---|---|
| Bienes y servicios fisicos (incl. membresias de gimnasio fisico) | No — EVA es software |
| Servicios 1:1 online no grabables (clases, consejeria) | No — se cobra el software, no la sesion |
| Servicios regulados (seguros, clinicos) | No |
| Apps "consumption-only" (solo consumir contenido comprado afuera) | Parcial: permite referenciar la compra externa **sin links** |
| Propinas 100% al creador | No |

**Programa de pagos externos:** desde el 30-jun-2026 Google habilita links y billing alternativo en
**EE.UU., Reino Unido y EEE**, con fee de servicio (10% primer millon anual) y obligacion de reportar
transacciones. No cubre Chile.

**Conclusion:** el criterio de iOS y el de Android coinciden en lo que importa. Una sola build sin
CTA cumple en ambas.

---

## 4. Inventario de CTA en el codigo

Rama `rnmobiledenuevo`, todos abren el navegador hacia la pagina de pago:

| Archivo | Linea | Que hace |
|---|---|---|
| `apps/mobile/app/coach/(tabs)/nutricion.tsx` | 1317 | Boton "Mejorar a Pro" → `/coach/subscription?upgrade=pro` |
| `apps/mobile/app/coach/(tabs)/perfil.tsx` | 188 | Link a `eva-app.cl/coach/subscription` |
| `apps/mobile/app/coach/(tabs)/reactivate.tsx` | 221 | `REACTIVATE_URL` |
| `apps/mobile/app/coach/(tabs)/subscription.tsx` | 278, 300, 391 | `CARD_URL`, `notice.url`, `SUB_URL` |
| `apps/mobile/app/coach/modules.tsx` | 136 | `SUBSCRIPTION_URL` |
| `apps/mobile/app/coach/settings/brand.tsx` | 438 | `/coach/subscription` |
| `apps/mobile/app/coach/settings/features.tsx` | 367 | `eva-app.cl/coach/subscription` |
| `apps/mobile/components/ModuleOffNotice.tsx` | 69 | `/coach/subscription` |

---

## 5. Que se puede y que no dentro de la app

**Permitido (es estado, no venta):**
- "Plan Pro · activo hasta el 12 de septiembre"
- "Alcanzaste el maximo de 3 alumnos de tu plan"
- "Nutricion no esta incluido en tu plan actual"
- Boton **"Actualizar estado"** que revalida entitlements (clave para que el plan se refleje apenas
  se pague en la web)
- Correo de soporte (`contacto@eva-app.cl`) como salida al usuario

**Prohibido:**
- Botones "Mejorar a Pro", "Suscribirse", "Reactivar plan" que abran el navegador
- Mostrar precios de los planes
- Cualquier link a `/coach/subscription` u otra pagina de pago
- Texto que indique donde pagar ("entra a eva-app.cl para renovar") — tambien cuenta como CTA

---

## 6. Donde vive la venta entonces

1. **Registro y onboarding web** — el coach se registra en `eva-app.cl`, ahi ve planes y precios y
   paga. La app movil queda como herramienta de trabajo diario.
2. **Email (canal legitimo y sin restricciones de contenido)** — con Resend ya cableado:
   - "te quedan N dias de tu plan"
   - "tu plan vencio"
   - "llegaste al limite de alumnos de tu plan"
   Cada uno con su boton de pago. El correo se dispara por el **mismo evento** que muestra el muro
   neutro en la app, para que llegue en el momento exacto de la friccion.
3. **PWA / web** — sin restricciones, ahi se ve todo.
4. **WhatsApp y contacto directo** con los coaches.

---

## 7. Sobre "ocultar los botones, aprobar, y despues reponerlos"

**No conviene.** Apple lo llama *bait and switch* y lo cubre la guideline 2.3.1 (no ocultar
funciones que se activan despues de la revision):

- Reponerlos en una **actualizacion** → esa actualizacion pasa por revision igual y se rechaza ahi.
- Activarlos **remotamente** sin update → remocion de la app y, en casos repetidos, cierre de la
  cuenta de desarrollador.

Lo legitimo es dejarlos fuera de forma permanente: es como funcionan Spotify, Netflix y el SaaS B2B
en general dentro de iOS.

---

## 8. Plan de implementacion propuesto

1. Quitar los 9 CTA de la tabla (seccion 4) — sin `Platform.OS`, se van en ambas plataformas por
   decision del CEO (una sola build).
2. Reemplazar copys por los estados neutros de la seccion 5.
3. Agregar boton "Actualizar estado" (revalida entitlements) donde hoy esta el CTA, y refetch al
   volver la app a foreground.
4. Correos de limite / por vencer / vencido con el link de pago (verificar cuales ya existen).
5. Revisar que el registro de coach dentro de la app no muestre planes ni precios.

---

## Fuentes

- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — 3.1.1, 3.1.3(a)(b)(c)(d), 2.3.1
- [Understanding Google Play's Payments policy](https://support.google.com/googleplay/android-developer/answer/10281818)
- [Play Billing — external payment links](https://developer.android.com/google/play/billing/externalpaymentlinks/integration)
