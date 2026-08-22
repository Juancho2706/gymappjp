---
status: active
owner: release
last_verified: 2026-08-22
canonical: true
---

# App review — Apple / Google

## Product summary

EVA is a B2B2C fitness coaching platform. Coaches manage clients, workout
programs, nutrition plans and progress. Clients use the app provided by their
coach to train, log nutrition and complete check-ins.

## Reviewer accounts

Do not commit emails or passwords here.

Before each submission:

1. Create or verify the three dedicated review accounts (Free coach, Pro coach, client).
2. Confirm the three accounts against the exact release build.
3. Store their credentials only in App Store Connect and Google Play Console.
4. Rotate or disable the accounts after the review window.

Required reviewer data — **three** accounts (W7 del embudo Free→Pro: el revisor tiene que poder
ver el plan chico y el grande sin que nadie le muestre un precio):

- Free coach email: `[SET_IN_STORE_CONSOLE]`
- Free coach password: `[SET_IN_STORE_CONSOLE]`
- Pro coach email: `[SET_IN_STORE_CONSOLE]`
- Pro coach password: `[SET_IN_STORE_CONSOLE]`
- Client email: `[SET_IN_STORE_CONSOLE]`
- Client password: `[SET_IN_STORE_CONSOLE]`
- Client entry code/slug: `[SET_IN_STORE_CONSOLE]`

## Account flows

- Coaches can sign in or create a Free account in the mobile app.
- Clients cannot self-register. Their coach creates or invites them.
- A client signs in through the entry point associated with the coach/team.
- Reviewer instructions must identify which role and entry point to use.

## Billing

- EVA does not sell digital subscriptions or add-ons inside the native app.
- Coach billing and payment-method management happen on the web platform.
- Revalidate this statement before every store submission.

## Notes for Review (EN) — modelo de negocio

Bloque listo para pegar en **App Store Connect → App Review Information → Notes** (y, con el mismo
texto, en las notas de Google Play). Se pega tal cual: cada frase está elegida contra la guideline
que aplica. **No agregar la línea de Android** («Los cambios de plan se hacen en eva-app.cl») a las
notas de Apple: en iOS esa frase no existe ni en la app ni en las notas.

```text
EVA is a B2B tool for personal trainers and nutrition coaches. A coach uses it to run their own
practice: training programs, nutrition plans, check-ins and client progress.

How the business works, before you test:

1. The coach's subscription to EVA is contracted, paid and managed entirely outside the app, on
   our website. EVA is a paid web-based service and this app is its free companion for the coach
   and their clients (guideline 3.1.3(f)).
2. The app sells nothing. There is no purchase flow, no price, no name of any plan other than the
   one the signed-in coach already has, and no button, link, URL or text pointing to any place to
   buy. There is also no button that triggers a sales email. A coach who decides to change plan
   does it on the website, on their own initiative.
3. Clients never pay anything in EVA. A client cannot sign up alone: their coach invites them, and
   they use the app to train, log nutrition and send check-ins. There is no consumer purchase of
   any kind anywhere in the app.
4. Everything the app shows about the plan is status, not an offer: the current plan name, how many
   active clients the account holds, which modules are included, and a "Refresh status" action that
   re-reads the account after the coach makes a change on the website.

Demo accounts (credentials are in the fields of this submission):

- Coach on the Free plan — sign in on the first screen. Small client allowance; the app states the
  limit as a fact and offers to archive a client to free a slot.
- Coach on the Pro plan — same app, larger allowance. Useful to confirm that no screen ever offers,
  compares or prices a plan.
- Client — invited by the demo coach. Sign in with the client entry code provided.

Screens you may want to open:

- "Mi plan" (My plan), in the coach's profile: plan name, client allowance, active and archived
  clients, included modules, and "Actualizar estado" ("Refresh status").
- The client limit sheet, shown when a coach at their limit tries to add one more client: it states
  the limit and offers "Archivar un alumno" ("Archive a client"), which is reversible and keeps the
  client's history.
- The "Hecho con EVA" ("Made with EVA") mark at the bottom of some client-facing screens: it opens
  eva-app.cl/hecho-con-eva, a page that explains what EVA is. That page shows no prices and no
  plans.

If any screen appears to be non-compliant, please tell us which one and we will change it in this
submission.
```

### Por qué está redactado así (no tocar sin leer esto)

- **3.1.3(f) «Free Stand-alone Apps» y nada más.** Es la excepción que describe exactamente a EVA:
  app gratis que acompaña a un servicio web de pago, sin compra ni CTA de compra adentro. **NO citar
  3.1.3(b) ni 3.1.3(c)**: son «Multiplatform Services» y «Enterprise Services», casos distintos, y
  nombrarlos invita al revisor a evaluarnos con requisitos que no cumplimos.
- **«sells nothing» dicho de las cuatro formas** (sin flujo, sin precio, sin tier ajeno, sin botón
  que dispare correo) porque las cuatro son las que el revisor busca en pantalla.
- **El alumno no paga.** Cierra de entrada la lectura de «app de consumo con compras afuera».
- **El cierre es una invitación explícita a señalar la pantalla.** Un rechazo genérico cuesta un
  ciclo de review completo; una pantalla nombrada se arregla en horas y sin resubir binario si es
  copy que viaja por OTA.

## Notas para el owner (ES)

Resumen del bloque de arriba, para leer antes de mandar a review — no se pega en ninguna consola:

- EVA es una herramienta de trabajo B2B: la usa el coach para atender a SUS alumnos.
- La suscripción del coach se contrata, se paga y se administra **fuera de la app**, en la web. La
  app es el acompañante gratis de un servicio web de pago (3.1.3(f)).
- La app **no vende, no enlaza y no muestra precios**. Ni un botón que dispare un correo de venta.
- El alumno entra **invitado por su coach** y no paga nada, nunca.
- Tres cuentas demo: coach Free, coach Pro, alumno. Las credenciales van SOLO en las consolas.
- Cierre pedido a propósito: «si alguna pantalla parece no cumplir, dígannos cuál y la cambiamos en
  esta misma entrega».

### Qué va a tocar un revisor y qué va a ver

| Pantalla | Qué ve | Riesgo |
|---|---|---|
| **Mi plan** (perfil del coach) | nombre del plan, cupo de alumnos, activos/archivados, módulos incluidos, «Actualizar estado» y «¿Dudas con tu cuenta?» (`mailto:`) | ninguno: es estado. No hay precio, ni otro tier, ni link de compra |
| **Muro de cupo** (al agregar un alumno con el cupo lleno) | «Alcanzaste el cupo de tu plan», el cupo actual, **[Archivar un alumno]** y **[Entendido]** | en iOS no lleva ninguna línea extra; en Android suma la frase canónica (ver abajo) |
| **Sello «Hecho con EVA»** (pie de pantallas del alumno en planes sin Pro) | abre `eva-app.cl/hecho-con-eva` | esa página **no tiene precios ni planes**; existe justo para que el sello sea tocable desde iOS |
| **Novedades** (home del coach) | tarjetas con CTA opcional | el destino pasa por `isStoreSafeUrl`: `/pricing`, `/register`, `/coach/subscription`, `/hecho-con-eva` y `#precios` quedan fuera |

### Solo para Google Play

En Android —y **solo** en Android— la app muestra una línea de texto plano, sin link:
«Los cambios de plan se hacen en eva-app.cl». Google publica esa forma como aceptable para apps
*consumption-only*. El split es por `Platform.OS`, nunca por storefront. Regla completa y guards de
código en `apps/mobile/AGENTS.md` §«Pagos y tiendas — regla vigente».

## Runtime permissions currently used

| Permission | Current use |
|---|---|
| Camera | Check-in photos and nutrition barcode scanning |
| Photo library | Check-in, exercise/food and branding image selection |
| Notifications | Workout/rest timers, reminders and app badge |
| Biometrics | Optional local re-entry protection on supported devices |

Do not claim step counting, Motion/Accelerometer use or another capability
unless the release build contains and exercises that implementation.

## Pre-submission verification

- [ ] Reviewer accounts exist and use synthetic data only.
- [ ] Credentials are present in both store consoles and absent from Git.
- [ ] Coach registration and both sign-in flows work on the release build.
- [ ] Permission copy matches the permissions requested by the binary.
- [ ] Privacy labels/Data Safety match the current SDK and data-flow inventory.
- [ ] Billing copy matches the current native app behavior.
- [ ] Support and privacy-contact URLs resolve.
- [ ] Account deletion path is documented for both roles.
