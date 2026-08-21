---
status: draft
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# SPEC — Solicitudes al coach (`coach_leads`)

Quien recibe el código de invitación de un coach (o su tarjeta de Share Entreno) ya no se da de
alta solo: **envía una solicitud** que le llega al coach por correo, con botón directo a WhatsApp.
El coach decide a quién convierte en alumno.

## Problema

El 20-08 (`723b7acb`) se reabrió el alta directa standalone en `/join/[invite_code]`: cualquiera
con el código creaba su `auth.user` + su fila en `clients` sin que el coach interviniera. Eso
cerró el loop de atribución de Share Entreno, pero le sacó al coach el control sobre su cartera:
alumnos que él no aceptó ocupan cupo, aparecen en su panel y reciben su marca. Los coaches de EVA
venden servicio 1:1 y filtran a quién toman.

Además el único aviso era un correo «se unió» a posteriori: informativo, no accionable, y sin el
teléfono del interesado — el canal real de trabajo de los coaches es WhatsApp.

## Decisión del owner (21-08 — no re-preguntar)

> «el join debería llegarle al WhatsApp del coach, o al correo, no registrarse de una porque cada
> coach quiere controlar a los estudiantes igual»

Consecuencias fijadas:

1. **`/join/[invite_code]` con invitación standalone = SOLICITUD**, no alta. Se revierte el alta
   directa del 20-08.
2. **Team/org NO se tocan**: su autoalta (pre-existente desde julio, con cerco de cupo) sigue
   igual — ahí el coach/organización ya delegó la puerta a propósito.
3. El aviso al coach es **por correo con botón a WhatsApp**. WhatsApp directo del sistema al coach
   exigiría WhatsApp Business API (WABA), que EVA no tiene: fuera de alcance.
4. La atribución de Share Entreno **no se pierde**: viaja en el lead y se persiste en `clients`
   cuando el coach CONVIERTE la solicitud.

## Usuarios

- **Primario**: el interesado (aún no es usuario de EVA) que recibió un código o una tarjeta.
- **Primario**: el coach standalone, que recibe y filtra solicitudes.
- **Secundario**: el alumno que compartió la tarjeta (su referido queda atribuido).
- No aplica a: alumnos de team/org (su alta sigue siendo autoservicio).

## Flujo del interesado

1. Abre `/join/{código}` (link de la tarjeta compartida, del QR, o el código pegado). La página
   resuelve la invitación y muestra la marca del coach (white-label, igual que hoy).
2. Si el scope es **team/org** → sigue viendo el alta de siempre (`joinViaInviteAction`).
3. Si el scope es **standalone** → ve el formulario **«Solicitud»**:
   - Nombre (obligatorio, 2–120).
   - WhatsApp (**obligatorio**, 6–30) — es el canal por el que el coach va a responder.
   - Correo (opcional, ≤254).
   - Mensaje (opcional, ≤500).
   - Checkbox de consentimiento **obligatorio**: «Acepto que {brandName} reciba estos datos para
     contactarme (Ley 21.719)».
   - Turnstile, exactamente como `/register`.
   - `ref` / `src` / `k` viajan ocultos si venían en la URL.
4. Envía → estado de éxito: **«Listo. {brandName} recibió tu solicitud y te va a escribir al
   WhatsApp que dejaste.»** + link «¿Ya tienes cuenta? Entrar» (al login white-label del coach).
5. No se crea ninguna cuenta. El interesado no queda esperando un correo de confirmación.

## Flujo del coach

1. Recibe un correo (a su email de `auth.users`) con: nombre, mensaje, origen
   («llegó por la tarjeta compartida de {alumno}» o «llegó con tu código»), botón **«Escribir por
   WhatsApp»** (`wa.me`), correo en `mailto:` si lo dejó, y CTA **«Ver solicitudes»** →
   `/coach/clients?solicitudes=1`.
2. En `/coach/clients` aparece la sección **«Solicitudes»** (solo si hay leads `new`/`contacted`):
   nombre, hace cuánto, botón WhatsApp, correo, mensaje, chip «por tarjeta de {referente}».
3. Acciones por solicitud:
   - **Agregar como alumno** → abre el modal de crear alumno **prellenado** (nombre/correo/
     teléfono). Al crearse, el lead pasa a `converted` y la atribución del lead se copia a la fila
     de `clients`.
   - **Marcar contactado** (`contacted`) — opcional, para no perder de vista las que ya trabajó.
   - **Descartar** (`dismissed`) — sale de la lista, **no se borra**.

## Modelo de datos

Tabla nueva `public.coach_leads` (migración `supabase/migrations/20260821030821_coach_leads.sql`):

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `default gen_random_uuid()` |
| `coach_id` | uuid NOT NULL | FK `public.coaches(id)` ON DELETE CASCADE |
| `team_id` | uuid NULL | FK `public.teams(id)` ON DELETE SET NULL |
| `org_id` | uuid NULL | FK `public.organizations(id)` ON DELETE SET NULL |
| `full_name` | text NOT NULL | CHECK `char_length` entre 2 y 120 |
| `phone` | text NULL | CHECK null o `char_length` entre 6 y 30 |
| `email` | text NULL | CHECK null o `char_length` ≤ 254 |
| `message` | text NULL | CHECK null o `char_length` ≤ 500 |
| `referred_by_client_id` | uuid NULL | FK `public.clients(id)` ON DELETE SET NULL |
| `referral_source` | text NULL | CHECK ≤ 40 (`share_card`, …) |
| `referral_card_kind` | text NULL | CHECK ≤ 40 (mismo vocabulario que `k=`) |
| `status` | text NOT NULL | `default 'new'`, CHECK in (`new`,`contacted`,`converted`,`dismissed`) |
| `converted_client_id` | uuid NULL | FK `public.clients(id)` ON DELETE SET NULL |
| `consent_accepted_at` | timestamptz NOT NULL | `default now()` |
| `created_at` | timestamptz NOT NULL | `default now()` |
| `updated_at` | timestamptz NOT NULL | `default now()`; trigger reusa `public.handle_updated_at()` (ya existe en el baseline) |

Constraint adicional: `coach_leads_contact_required` — `phone is not null or email is not null`
(el formulario exige WhatsApp; el constraint es el piso de la DB).

Índice: `(coach_id, status, created_at desc)` — la consulta del panel es exactamente esa.

### Seguridad de la tabla

- RLS **ON**.
- Una sola política, de **SELECT**, para `authenticated`: `using (coach_id = auth.uid())`.
- `revoke all on public.coach_leads from anon, authenticated;` + `grant select to authenticated`.
- **Todas** las escrituras (insert desde `/join`, updates del coach) van por `service_role` desde
  server actions / route handlers, después de verificar en el servidor que el lead pertenece al
  coach autenticado. Por eso NO hay `grant update(col)`: ninguna columna es user-editable directa.
- Migración idempotente (`if not exists` / `drop policy if exists`) y **aditiva**.

## Privacidad (Ley 21.719)

- **Consentimiento explícito y previo**: checkbox obligatorio con el nombre de la marca que va a
  recibir los datos. Se guarda el momento en `consent_accepted_at`.
- **Datos mínimos**: nombre + un canal de contacto + un mensaje libre. Nada de salud, peso,
  objetivos medibles ni documentos. El campo `message` es libre: el copy no pide datos sensibles.
- **Quién los ve**: solo el coach dueño del código (RLS por `coach_id = auth.uid()`) y los
  procesos de servidor de EVA. No se exponen a `anon` ni a otros coaches.
- **Descartar NO borra**: `status = 'dismissed'` conserva la fila (evita que la misma persona
  reaparezca como novedad y deja rastro del consentimiento). **Retención: a definir** — pendiente
  abierto: purga automática de leads `dismissed`/`converted` con más de N meses, alineada con la
  purga de cuentas ya comprometida. Hay que anunciarla en la política de privacidad antes de
  activarla.
- El interesado no queda con cuenta en EVA: si el coach no lo convierte, no existe usuario.

## Anti-abuso

- **Turnstile** en el formulario, con la misma implementación y el mismo comportamiento de
  fallback que `/register` (incluido qué pasa si falta la site key).
- **Rate limit** por invitación con `rateLimitInviteAccept` (el mismo cerco que ya protegía el
  alta).
- **Dedup 7 días**: si ya existe un lead del mismo coach con el mismo teléfono o correo en estado
  `new`/`contacted` creado en los últimos 7 días, no se crea otro y se responde el **mismo éxito**
  (no se le confirma al emisor que ya estaba registrado).
- **El cupo del plan NO aplica al lead** (recibir una solicitud no consume nada). El cerco de cupo
  sigue donde estaba: al convertir, vía `createClientAction`. Un coach en el tope puede acumular
  solicitudes y no podrá agregarlas hasta liberar o subir de plan — es el mensaje correcto.
- `joinViaInviteAction` rechaza el scope standalone («Para entrenar con este coach envía una
  solicitud.») como defensa en profundidad: aunque alguien invoque el action viejo, no crea nada.

## Atribución (Share Entreno)

- La tarjeta sigue emitiendo `/join/{código}?ref={clientId}&src=share_card` (+`&k={preset}` al
  copiar). `resolveJoinReferral` valida que el `ref` pertenezca al **mismo coach**.
- Esos tres datos se guardan en el lead (`referred_by_client_id`, `referral_source`,
  `referral_card_kind`).
- **La atribución se marca al CONVERTIR**: al crear el alumno desde la solicitud, se copian a la
  fila de `clients` con service role (esas columnas no tienen grant de usuario) y se emite
  `coach_client_referred`. Antes de eso no hay alumno al que atribuir.
- Eventos PostHog server: `coach_lead_received` (al llegar), `coach_lead_converted` y
  `coach_client_referred` (al convertir con atribución).

## Criterios de aceptación

- [ ] `/join/{código}` standalone NO crea `auth.user` ni `clients` bajo ninguna ruta.
- [ ] Team/org conservan su alta directa sin cambios de comportamiento.
- [ ] El formulario exige nombre, WhatsApp y consentimiento; correo y mensaje son opcionales.
- [ ] Turnstile verificado en el servidor antes de insertar.
- [ ] Dedup de 7 días: un segundo envío idéntico no crea fila y devuelve el mismo éxito.
- [ ] El correo al coach llega con WhatsApp normalizado y CTA a `/coach/clients?solicitudes=1`;
      un fallo de correo NO rompe la solicitud (fail-open, `await`).
- [ ] `coach_leads` con RLS: un coach no lee leads de otro (verificado con el cliente del usuario).
- [ ] El panel lee por `_data` con el cliente del usuario (RLS), nunca service role.
- [ ] Convertir copia `referred_by_client_id`/`referral_source`/`referral_card_kind` a `clients`.
- [ ] Dark mode y white-label (`--theme-primary`) correctos en formulario, éxito y panel.
- [ ] Copys en español neutro, sin emojis.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El coach no revisa el correo y la solicitud muere | Pérdida del lead | Sección visible en `/coach/clients` + CTA directo; W3 suma push en RN |
| Spam de formularios (sin cuenta de por medio) | Ruido, costo de correo | Turnstile + rate limit + dedup 7 días |
| Fricción nueva: el interesado esperaba entrar solo | Caída de conversión del loop de shares | Copy explícito de qué pasa después; se mide con `coach_lead_received` vs `coach_lead_converted` |
| Coach en tope de cupo no puede convertir | Frustración | Mensaje del cerco existente de `createClientAction`, con la solicitud intacta |
| Datos personales sin cuenta asociada | Cumplimiento 21.719 | Consentimiento explícito guardado, datos mínimos, RLS, retención a definir |

## Preguntas abiertas

- [ ] Retención: ¿a los cuántos meses se purgan los leads `dismissed`/`converted`?
- [ ] ¿El coach quiere poder reenviarse la solicitud por correo, o alcanza con el panel?

## Fuera de alcance (waves siguientes)

- **RN**: `GET /api/mobile/coach/leads` + lista de solicitudes en el tab de clientes + push al
  coach cuando llega una (W3).
- **WhatsApp directo al coach** desde el sistema: exige WhatsApp Business API / WABA, que EVA no
  tiene contratada. El correo con botón `wa.me` es el sustituto.
- Cambiar el sheet «Invitar alumno» del coach para que emita `/join` (W4).
- Purga/retención automática de leads viejos (decisión del owner pendiente).
