---
status: draft
owner: product-engineering
last_verified: "2026-08-29"
canonical: false
---

# SDD — Correos y push del motor «Cobros coach → alumno»

> Writer «emails». Manda `OUTLINE.md` (§9 correos, §14 push, §15 nombres canónicos). Moldes
> verificados en el repo (rama `rnmobiledenuevo`, HEAD `c85ef28b`) leído en SOLO LECTURA.
> Toda ruta lleva `archivo:línea`. Español latinoamericano con tildes; copys de usuario en «tú»
> chileno neutro. Slug del feature: `cobros-coach-alumno`.

---

## 0. Contrato en una pantalla

- **13 correos al alumno** (E0, E1, E1-link, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11) y **9 al
  coach** (C1, C2, C2-bis, C3, C4, C5, C6, C7, C8) ⇒ **22 plantillas**. **6 push** (3 coach, 3 alumno).
  > **Conteo — CERRADO en 22.** El «16 plantillas» de DECISIONS-2 §SPEC es el conteo heredado de
  > antes de R5/R9/R21: sobre esas 16 hay que sumar **E0** (R21), **E11** (R9), **C6** (R5),
  > **C7** y **C8** (R9) y el recordatorio diario **C2-bis** (R3), ninguna de las cuales cabe en la
  > enumeración vieja. Las fusiones que se evaluaron (E10 dentro de E5, C2-bis dentro de C1) quedan
  > **rechazadas**: son dos noticias distintas con dos ledgers y dos cadencias. **22 es el número
  > canónico** y así debe leerse en `SPEC.md` §4/§11, `PLAN.md` §W3/§W5/COB-08/§6 y `TASKS.md`
  > W3.8/W5.13/W6.8; cualquier «16» que quede en esos documentos es residuo del conteo previo.
- **Un solo transporte**: `sendTransactionalEmail` (`apps/web/src/lib/email/send-email.ts:14`).
  `from` es siempre `process.env.EMAIL_FROM` (`send-email.ts:16`); el white-label vive **dentro
  del HTML** (`base-layout.ts` header + footer «Enviado por X · con tecnología de EVA»).
- **`replyTo` = correo del coach en TODOS los correos al alumno.** Precedente exacto:
  `buildClientWelcomeEmail` devuelve `replyTo` (`transactional-templates.ts:35,38,90`) y el caller
  lo pasa (`app/coach/clients/_lib/create-client-internal.ts:157-162`). El correo del coach no está
  en `coaches`: se resuelve con `resolveCoachEmail(admin, coachId)`
  (`services/billing/sales-emails.service.ts:304-311`).
- **Un solo `<a>` por correo** (contrato heredado de `drip-templates.ts:14-19` y
  `__tests__/no-prices.ts:16`). Lo que no es el CTA va en texto plano.
- **Una columna que hoy no existe y es prerrequisito bloqueante** (§1.5, dependencia de
  `DATA-SECURITY.md`, cerrada **antes** de W5): `client_billing_plans.description` (R21: `text`,
  **≤ 140 caracteres**, obligatorio — el «Concepto» de E0/E1/E2/E4/E5/E6, p. ej. «Asesoría online
  mensual»). **No hay columnas `contract_text` / `contract_version` / `contract_rendered_at`**: el
  contrato del art. 12 A es el **template estándar de EVA parametrizado** en el momento del envío
  (DECISIONS-2 §EMAILS), versionado en el repo y sellado por
  `student_billing_consents.terms_version` (R21). Ver §1.5.
- **Consentimiento auditable (R21)**: `student_billing_consents (id, client_id, plan_id, kind in
  ('subscription','first_checkout'), terms_version, consented_at, ip_hash, user_agent)`. Se escribe
  una fila **antes** del preapproval (`kind='subscription'`, aviso previo completo) y **antes del
  primer checkout de `mp_link`** (`kind='first_checkout'`, aviso previo en versión corta). E6 y el
  aviso previo se apoyan en esa fila; el export CSV para evidencia vive en admin (TESTING-LEGAL).
- **Ledger nuevo `client_email_ledger`** (OUTLINE §3.7) con `dedupe_key` único. Sin período/ID
  adentro, el correo se manda una sola vez en la vida del alumno — trampa real documentada en
  `services/email/coach-email-ledger.service.ts:66-67`.
- **Kill-switch propio `EVA_COBROS_EMAILS_DISABLED`** (OUTLINE §15), CSV de `template_key`;
  `*` o `1` apagan todo. Semántica calcada de `isSalesEmailEnabled`
  (`services/billing/sales-emails.service.ts:50-55`). **E5, E6 y E7 lo ignoran** (§6.4).
- **Nunca** IVA, nunca «boleta»/«factura»/«documento tributario», nunca precios de EVA, nunca link
  a las tiendas ni deep link a la app nativa, nunca urgencia falsa ni etiquetas sobre la persona.
- **R6 — ningún correo dice ni insinúa que se pague dentro de la app.** Los verbos de pago apuntan
  siempre a la web (`https://www.eva-app.cl/...`) o a Mercado Pago. Lo único que el alumno hace
  desde la app es **avisar que pagó** (R19) y ver estado. El hint de la app es un literal único
  (`apps/mobile/lib/web-only-hint.ts`) y **no se cita en ningún correo**; los correos al coach que
  hablan de configurar el cobro dicen «desde el computador», nunca un dominio (§6.3.11).

### 0.1 Archivos nuevos

| Ruta | Qué es | Molde |
|---|---|---|
| `apps/web/src/lib/email/cobros-format.ts` | `formatClp`, `formatCobrosDate`, `escHtml`, `amountBlock`, `detailTable` | `addon-receipt-templates.ts:16` + `sales-templates.ts:27,37` |
| `apps/web/src/lib/email/cobros-templates.ts` | E0…E11 (+ E1-link), builders **puros** | `transactional-templates.ts:459` + `sales-templates.ts:141` |
| `apps/web/src/lib/email/cobros-coach-templates.ts` | C1…C8 (+ C2-bis), builders puros | `coach-lead-notification.ts:25` |
| `apps/web/src/lib/email/cobros-templates.test.ts` | render tests (§10) | `sales-templates.test.ts` |
| `apps/web/src/infrastructure/db/client-email-ledger.repository.ts` | CRUD del ledger | `coach-email-ledger.repository.ts` |
| `apps/web/src/services/cobros/emails.service.ts` | `sendCobrosEmailOnce()` | `coach-email-ledger.service.ts:147` |

**Decisión del writer 1:** el nombre del módulo es `cobros-*`, no `client-dunning-*` como proponía
`maps/r4-emails.md §8.1`. OUTLINE §15 fija «cobros» como el nombre canónico del feature y «dunning»
no es una palabra que el owner use; además `payment-dunning-templates.ts` ya existe y es del billing
EVA↔coach — dos archivos con «dunning» en el nombre invitan al error de importar el equivocado.

---

## 1. Convenciones comunes

### 1.1 Envío

```ts
// apps/web/src/services/cobros/emails.service.ts (contrato)
export type CobrosEmailTemplate =
  | 'cobro_activado'       // E0  (R21)
  | 'cobro_recordatorio'   // E1
  | 'cobro_link'           // E1-link
  | 'cobro_vencido'        // E2
  | 'cobro_ultimo_aviso'   // E3
  | 'cobro_cortado'        // E4  (variantes reason: 'unpaid' | 'ended', R1)
  | 'cobro_confirmado'     // E5
  | 'susc_activada'        // E6
  | 'susc_cancelada'       // E7
  | 'cobro_rechazado'      // E8
  | 'plan_cambiado'        // E9
  | 'cobro_reactivado'     // E10
  | 'cobro_revertido'      // E11 (R9: reembolso / contracargo)

export async function sendCobrosEmailOnce(admin, input: {
  template: CobrosEmailTemplate
  clientId: string
  coachId: string
  to: string                 // clients.email (baseline 00000000000001_baseline.sql:828)
  replyTo: string | null     // SIEMPRE el correo del coach
  subject: string
  html: string
  dedupeKey: string          // ver la tabla §9
  trigger: 'cron' | 'coach_action' | 'webhook' | 'transactional'
  payload?: Record<string, Json>   // sin PII: ids, flags, mode. NUNCA nombre+correo+monto juntos
  ignoreKillSwitch?: boolean       // E0/E5/E6/E7/E11 (§6.4)
}): Promise<'sent' | 'skipped_disabled' | 'skipped_duplicate' | 'skipped_no_recipient'
          | 'skipped_opted_out' | 'skipped_bounced' | 'skipped_demo'
          | 'skipped_no_contract'   // solo E6: faltan datos para parametrizar el contrato (§1.5)
          | 'skipped_claim_open'    // R3: E2/E3/E4 con claim vivo en la cuota
          | 'failed'>
```

Invariantes, todas heredadas de código vivo:

1. **Nunca lanza** (`coach-email-ledger.service.ts:27-29`).
2. Orden: kill-switch → exclusiones → dedupe → Resend → fila
   (`coach-email-ledger.service.ts:143-146`; la fila se escribe tras el envío exitoso,
   `sales-emails.service.ts:193-195`).
3. **Fail-CLOSED en el cron** (si no se puede leer el ledger, no se manda nada; razón textual en
   `api/cron/cap-nudge/route.ts:42-47`); **fail-OPEN en la acción puntual del coach**.
4. **`await` siempre.** Vercel congela la invocación al responder y mata el POST pendiente a Resend
   — incidente medido el 19-08 (`lib/email/free-coach-onboarding.ts:24-28`).
5. **Espaciado 600 ms** entre envíos reales del cron (`api/cron/cap-nudge/route.ts:96-110`;
   Resend acepta 2 req/s).
6. **Exclusiones duras** antes de cualquier envío: `clients.is_demo`
   (precedente `api/cron/checkin-reminder/route.ts:71`), alumnos archivados/inactivos,
   `org_id`/`team_id` no nulos (el módulo es standalone, OUTLINE §3.1),
   coach de prueba (`isTestCoachEmail`, `lib/test-accounts.ts`), correo del alumno con última fila
   `bounced`/`complained` en el ledger.
7. `payload` sin PII (regla del schema del ledger del coach,
   `20260822004243_coach_email_ledger.sql:56-57`).
8. **Claim vivo suspende la presión (R3).** Antes de mandar E2, E3 o E4, el service relee la cuota:
   si tiene un claim en estado `claimed` sin resolver (máx. 1 claim vivo por cuota), devuelve
   `skipped_claim_open` y **no escribe** la fila del ledger — así el correo sale igual el día que el
   coach rechaza el claim y la cuota vuelve al calendario normal. El claim **no reactiva** el acceso:
   solo difiere el corte hasta 5 días después del fin de la gracia. Mientras tanto la presión se
   mueve al coach: C2 al instante y **C2-bis diario**.

### 1.2 Formato

| Cosa | Helper | Resultado |
|---|---|---|
| Monto | `formatClp(n)` = `` `$${Math.round(n).toLocaleString('es-CL')}` `` | `$35.000` |
| Fecha larga | `formatCobrosDate(iso)` = `toLocaleDateString('es-CL', {day:'numeric',month:'long',year:'numeric', timeZone:'America/Santiago'})` | `3 de septiembre de 2026` |
| Fecha corta | `{day:'numeric',month:'long', timeZone:'America/Santiago'}` | `3 de septiembre` |
| Periodicidad | `periodLabel(kind)` | `cada mes` · `cada 15 días` · `cada 3 meses` · `pago único` |

`formatClp` calca `addon-receipt-templates.ts:16` (la forma más limpia de las cuatro que conviven,
inventario en `maps/r4-emails.md §7.3`). **Nunca `/mes`**: el guard de RN lo prohíbe y en el correo
suena a tarifario de EVA; se dice «cada mes».
Zona horaria obligatoria `America/Santiago` (`lib/date-utils.ts`, `SANTIAGO_TZ`): un cron que compare
vencimientos con `new Date()` a secas se corre un día en verano.

### 1.3 Escapado

Todo lo que escribe el coach (`brand_name`, `description` del plan, `transfer_instructions`,
`claim_note` del alumno) pasa por `escHtml`. El contrato renderizado (§1.5) también: se escapa y
se imprime con `white-space:pre-wrap` para conservar los saltos de línea exactos del template. Hoy hay **tres** copias del helper
(`base-layout.ts:50`, `sales-templates.ts:37`, `coach-lead-notification.ts:97`): el motor exporta
**una** desde `cobros-format.ts` y no crea la cuarta dentro de los templates. `wrapEmailLayout`
escapa solo `brandName`, no el `body` ni el `footerText` (`base-layout.ts:78-104`).

### 1.4 White-label

El caller resuelve con `resolveStudentEmailBranding({ isStandalone, tier, logoUrl, primaryColor })`
(`lib/email/email-brand.ts:20-33`) y pasa `brand` a `wrapEmailLayout`. El CTA usa
`brandCtaColors(primaryColor)` (`base-layout.ts:59-65`, mismo `deriveSportTokens` de la app ⇒ el
botón nunca queda ilegible). Como el módulo es solo-Pro, `showsEvaBadge` será `false` casi siempre
(Pricing v3), pero se pasa igual: el helper es la fuente.

**El nombre del coach viaja SIEMPRE en el texto**, aunque el visual caiga a EVA. El alumno tiene que
saber quién le cobra (s6 §8.2: «Quién te cobra»).

### 1.5 De dónde salen «Concepto» y el contrato (prerrequisito de datos, BLOQUEANTE antes de W5)

Los correos necesitan dos cosas: el **«Concepto»** del plan y el **contrato íntegro** de E6. Sin
la primera E5 no puede llenar «Concepto»; sin el segundo E6 no cumple el art. 12 A (copia íntegra ⇒
el retracto se estira de 10 a 90 días, s6 §3.3). **Solo la primera es una columna nueva** y es
dependencia dura de la lista única de migraciones de `DATA-SECURITY.md §1` (R17), que se cierra
**antes** de W5, no durante; el contrato es código, no DDL:

1. **`client_billing_plans.description text not null` (R21: ≤ 140 caracteres).** Es el objeto del
   contrato: «Asesoría online mensual». Lo usan E0, E1, E2, E4, E5 y E6.
   El nombre canónico lo fija **R21** (`description`), no `service_description` como decía el
   borrador previo de este documento: en todo el SDD se lee `client_billing_plans.description`.
   El único `service_description` que existe hoy en el repo es
   `client_payments.service_description` (`supabase/migrations/00000000000001_baseline.sql:813`),
   que describe **el pago**, no el plan: el correo no puede leerlo antes de que el pago exista, y en
   E0/E1/E2/E4 todavía no existe. El plan es la fuente; al confirmar, `client_payments.service_description`
   copia ese texto.
2. **Contrato = template de EVA parametrizado, renderizado al enviar. SIN columnas nuevas.**
   DECISIONS-2 §EMAILS lo resolvió así y manda: no existen `contract_text`, `contract_version` ni
   `contract_rendered_at` en `client_billing_plans` (una versión previa de este documento las
   declaraba «prerrequisito bloqueante»; **quedan eliminadas** — no había migración, tarea ni
   entrada de SPEC que las creara, y E6 habría dependido de columnas fantasma).
   E6 llama a `renderCobrosContract(version, params)`
   (`apps/web/src/lib/cobros/contract-template.ts`) y **embebe el resultado completo en el HTML**:
   la copia íntegra viaja en la bandeja del alumno, que es lo que exige el art. 12 A.
   - `version` = `student_billing_consents.terms_version` de la fila del consentimiento que originó
     el plan (R21); si falta, el `CONTRACT_VERSION` vigente.
   - `params` = `client_billing_plans.description` (R21), monto, periodicidad, día de cobro, días de
     gracia, forma de cancelar, responsable del servicio (el coach) y datos del coach (**nombre y
     RUT**) — exactamente la lista de DECISIONS-2.
   - **Reproducibilidad sin columna congelada** (tres reglas, las tres verificables):
     (i) `contract-template.ts` es un **registro append-only**: cada `CONTRACT_VERSION` publicada
     queda en el archivo y **nunca se edita**; un cambio de texto agrega una versión, no pisa la
     anterior. (ii) Cualquier cambio en los términos económicos del plan (monto, ciclo, día de
     cobro, gracia, concepto) **exige un consentimiento nuevo** ⇒ fila nueva en
     `student_billing_consents` y **E9 + E6 nuevos** (§11.7, §11.10): no se re-escribe el contrato
     de un período ya aceptado, se emite otro. (iii) La evidencia ante un reclamo es el trío
     *fila de consentimiento (`terms_version`, `consented_at`, `ip_hash`) + versión del template en
     el repo + historial del plan*, exportable como CSV desde admin (TESTING-LEGAL, retención 24
     meses).
   - **Riesgo residual declarado**: re-renderizar hoy un contrato aceptado hace dos años usa los
     parámetros **actuales** del plan. Lo mitiga (ii) —los términos no cambian sin nuevo E6— y por
     eso el CA de E6 (abajo) se prueba sobre versión + parámetros, no sobre un blob guardado. Si
     el abogado exige el blob congelado, la vuelta atrás es una migración aditiva de una sola
     columna `contract_text` y este documento es el único que cambia (TESTING-LEGAL B.8).

**`coach_billing_settings.terms_version` / `terms_accepted_at` NO sirven para esto**: versionan el
**anexo T&C de EVA aceptado por el COACH** (OUTLINE §3.4) — otro documento, otras partes, otro
consentimiento. Usarlo para sellar «lo que el alumno vio» es un error de identidad y rompe la
trazabilidad que promete `TESTING-LEGAL.md` B.8.

**CONFIRMADO por DECISIONS-2 §EMAILS — template estándar de EVA parametrizado, sin campo libre del
coach en el primer tren** (cierra la duda 2 de §12). El template vive en el repo
(`apps/web/src/lib/cobros/contract-template.ts`, versionado con
un `CONTRACT_VERSION` literal) y se parametriza con, **exactamente**: `client_billing_plans.description`
(R21), monto, periodicidad, día de cobro, días de gracia, forma de cancelar, responsable del servicio
(el coach) y datos del coach (**nombre y RUT**). El coach solo aporta datos; no hay textarea libre.

**Retracto — texto estándar (DECISIONS-2 §EMAILS), va dentro del template del contrato y en el aviso previo:**

```
Tienes derecho a retractarte dentro de 10 días desde la contratación si el servicio aún no
comenzó. Al usar tu plan antes de ese plazo, aceptas que el servicio comience de inmediato.
```

> ⚖️ **VALIDAR CON ABOGADO** (marcado también en `TESTING-LEGAL.md`). No bloquea el diseño ni la
> implementación: el literal se centraliza en `contract-template.ts` y cambiarlo es **agregar** una
> `CONTRACT_VERSION` — las versiones ya publicadas no se tocan ni se borran del archivo.

`terms_version` del consentimiento (`student_billing_consents`, R21) = el `CONTRACT_VERSION` vigente
al momento de aceptar; es lo que permite reconstruir «qué texto vio este alumno ese día».

**CA (bloqueante de W5):** dado un plan con una fila de consentimiento cuya `terms_version` es una
versión **antigua** del registro, el HTML de E6 reproduce esa versión del template —no la vigente— y
no depende en ningún caso de `coach_billing_settings.terms_version` (que es el anexo EVA↔coach).

---

## 2. Anatomía HTML común de un correo de cobro

Orden fijo dentro del `body` que recibe `wrapEmailLayout`:

1. **Badge de estado** — `badge(texto, color)` (`base-layout.ts:194`). Semáforo ya usado en el repo:
   ámbar `#F59E0B` = aviso (`sales-templates.ts:149`), rojo `#EF4444` = vencido/cortado
   (`sales-templates.ts:189`), verde `#10B981` = resuelto (`payment-dunning-templates.ts:50`),
   gris `#6B7280` = neutro (`transactional-templates.ts:552`).
2. **H1** — `font-size:22px;font-weight:800;color:#111827` (calco literal de todos los templates).
   Nunca empieza culpando: el hecho, no la persona.
3. **Párrafo de contexto** — `15px/#374151`, dice monto, fecha y quién cobra.
4. **Bloque de monto grande** — tabla `#f9fafb` + borde `#e5e7eb` + radio 10 px, etiqueta
   `MONTO` en 12 px mayúsculas y el número en `font-size:24px;font-weight:900`. Calco estructural
   del bloque de credenciales de la bienvenida (`transactional-templates.ts:60-77`).
5. **Tabla de detalle** — filas `label / valor` (`Período`, `Vence`, `Modo`, `Cada`), estilo de
   `addon-receipt-templates.ts:52-58`.
6. **Bloque «Cómo pagar»** (solo modo `manual`) — misma tarjeta gris, `white-space:pre-wrap` para
   respetar los saltos de línea que escribió el coach (patrón de `coach-lead-notification.ts:62`).
7. **UN CTA** — `ctaButton(label, url, cta.bg, cta.text)`.
8. **Cierre en 13 px `#6b7280`** — «Si ya pagaste, ignora este correo» y a quién escribirle.
9. **Bloque legal** cuando corresponde (§6).

Opciones del layout:

- `previewText` = el preheader (40-90 caracteres útiles, `base-layout.ts:68-70`).
- `headerTitle` = nombre de marca del coach.
- `footerText` = línea de contexto/baja (mismo hueco que usa `DRIP_UNSUBSCRIBE_FOOTER`,
  `drip-templates.ts:229`).

**Decisión del writer 2 — dark mode:** agregar al `<head>` de `base-layout.ts` (cambio de una línea,
beneficia a los ~26 correos existentes):

```html
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
```

Es lo que pide OUTLINE §9 («agregar `<meta name="color-scheme">` al layout base») y evita que Gmail
y Outlook mobile inviertan el header `#0f172a` y el badge de color (research/s7 §3.2). No se
construye un tema oscuro completo: volumen chico, costo alto. Además, logos con transparencia se
rompen al invertir ⇒ el bloque de monto y el CTA llevan color inline explícito, que es lo que ya
hace el shell.

---

## 3. Calendario del motor (relativo a `paid_through`)

`F` = `client_billing_plans.paid_through` = último día con acceso pagado. **R2**: `paid_through` se
inicializa al crear el plan con `first_due_on`, así que nunca es `null` en un plan activo — E0 sale
el día de la creación y el calendario arranca desde ahí. Estados derivados (**R1**, seis en total:
`off | ok | due_soon | due | unpaid | ended`): `ok` hasta el fin del día `F`; `due` desde `F+1` hasta
`F+grace`; `unpaid` desde `F+grace+1`; **`ended`** cuando el plan está `canceled` y ya pasó `F`.
`off` solo con plan `paused`, coach no Pro, módulo apagado o `paid_through` nulo. El cron
`cobros-sweep` corre `45 12 * * *` (12:45 UTC = 09:45 CL, DECISIONS-2 § PLAN/TASKS, que corrige
OUTLINE §15): corre después de `paid-expiry` (`30 12`) y antes de `cap-nudge` (`0 13`).
`cobros-mp-reconcile` corre `15 13 * * *`, después de ambos.

| Correo | Gracia 3 | Gracia 0 | Estado del alumno ese día |
|---|---|---|---|
| **E0 cobro activado** | día de creación del plan | día de creación del plan | ok |
| E1-link (`mp_link`) | F-5 | F-5 | ok |
| E1 recordatorio | F-`reminder_days` (default F-3) | F-3 | ok / due_soon |
| E2 vencido | **F+1** | **F** (variante «último día») | due / ok |
| E3 último aviso | **F+3** (= F+grace) | — **no existe** | due |
| E4 cortado (`reason: unpaid`) | **F+4** (= F+grace+1) | **F+1** | unpaid |
| E4 terminado (`reason: ended`) | **F+1** tras cancelar | **F+1** tras cancelar | ended |

**R4 — umbral, no igualdad.** Cada fila de esta tabla se evalúa con `≤` sobre la fecha, nunca con
`fecha === hoy`: un plan creado dentro de la ventana recibe al día siguiente, en el sweep, el aviso
que le corresponda, y una corrida perdida del cron no se salta un correo. El dedupe de
`client_email_ledger` es lo que impide el duplicado, no la igualdad de fecha.

**R3 — claim vivo.** Mientras la cuota tenga un claim `claimed` sin resolver, **E2, E3 y E4 no salen**
(`skipped_claim_open`, §1.1.8) y el corte se difiere hasta 5 días después del fin de la gracia. Si el
coach **rechaza** el claim, la cuota vuelve al calendario de esta tabla y los correos pendientes salen
en el siguiente sweep. Al coach: C2 al instante y **C2-bis todos los días** mientras el claim siga
vivo. Forjar un claim compra 5 días como máximo, y son 5 días visibles para el coach.

**R1 — cancelación ≠ acceso eterno.** Cancelar (E7) **no** apaga el motor de correos: hasta `F` el
alumno está `ok` y el copy dice «tu plan **termina** el {F}»; pasado `F` entra en `ended` y sale E4
con `reason: 'ended'` («tu plan **terminó**»). Los recordatorios de plata (E1/E1-link/E2/E3) **no** se
mandan en un plan `canceled`: ya no hay nada que cobrar.

**Decisión del writer 3:** el calendario se ancla en la función de estado de OUTLINE §2.1, no en la
lectura literal de OUTLINE §4 («E3 en T+(gracia-1)», «E4 en T+gracia»), que queda corrida un día
respecto de esa función (con gracia 3 el corte real ocurre el día `F+4`, no `F+3`). Mandar «mañana
se pausa» y cortar dos días después es exactamente el tipo de mentira chica que dispara un reclamo.
Con gracia 0 no hay ventana `due`, así que E2 se adelanta al día `F` y dice «hoy es el último día»:
mandar «tu plan venció, tienes X días» a alguien que ya está cortado sería falso.

---

## 4. Correos al ALUMNO

Comunes a los trece: `from` = `EMAIL_FROM`; `replyTo` = correo del coach; white-label del coach;
un solo `<a>`; `to` = `clients.email`.

---

### E0 · `cobro_activado` — «tu coach activó tu cobro» (R21)

Es el correo de **apertura del contrato**: el alumno no puede enterarse de que le van a cobrar
recién cuando le llega el recordatorio. Sale **siempre**, en los tres modos, al crear el plan.

- **Disparador**: server action del coach que crea el plan (`plans.service.ts`, el mismo request que
  escribe `paid_through = first_due_on`, R2). `trigger: 'coach_action'`. **`await` obligatorio.**
- **Momento**: al instante. Si el plan se crea con el primer vencimiento ya pasado, E0 igual sale
  primero y el sweep del día siguiente manda lo que corresponda (R4).
- **Badge**: `PLAN ACTIVADO` `#10B981`.
- **Asunto**: `{coachName} activó el cobro de tu plan en {coachBrandName}`
  · alt A: `Tu plan con {coachBrandName}: {monto} {periodLabel}`
  · alt B: `Así funciona el cobro de tu plan con {coachName}`
- **Preheader**: `{monto} {periodLabel} · primer vencimiento {fechaCorta}`
- **CTA**: `Ver mi plan` → `https://www.eva-app.cl/c/{slug}/pagos`
- **dedupe_key**: `cobro_activado:{plan_id}` — uno por plan en toda su vida. Si el coach cambia el
  plan después, eso es E9, no otro E0.
- **Kill-switch**: **no aplica** (§6.4).
- **Cuerpo**:

```
{clientName}, {coachName} activó el cobro de tu plan

Desde ahora tu plan con {coachBrandName} tiene un cobro asociado. Esto es lo que acordaste
con {coachName}; guarda este correo.

  MONTO
  {monto} {periodLabel}
  {planDescription}                          ← client_billing_plans.description (≤ 140)

  Concepto              {planDescription}
  Cada                  {periodLabel}
  Primer vencimiento    {fechaLarga}
  Días de gracia        {graceDays === 0 ? 'sin días de gracia' : `{graceDays} días`}
  Cómo pagas            {transferencia / link de pago / cobro automático}

  CÓMO PAGAS
  [manual]           Le pagas directo a {coachName}:
                     {transferInstructions}
                     Cuando pagues, avísale desde «Mi plan» y él lo confirma.
  [mp_link]          Te llega un link de pago por correo antes de cada vencimiento. Pagas
                     con débito, crédito o saldo de Mercado Pago, en una sola vez. No queda
                     ninguna tarjeta guardada.
  [mp_subscription]  El cobro se hace solo cada {período} con el medio de pago que registres
                     en Mercado Pago. Puedes cancelar cuando quieras, en un toque.

  QUIÉN TE COBRA Y QUIÉN RESPONDE
  {coachName} — {coachEmail}{, coachPhone si existe}. El servicio y el cobro son de
  {coachName}. EVA es la plataforma que usa tu coach: no recibe tu dinero ni cobra comisión.

  QUÉ PASA SI NO PAGAS
  Tu acceso queda en pausa {graceDays === 0 ? 'al día siguiente del vencimiento'
  : `{graceDays} días después del vencimiento`}. Tu progreso no se borra y vuelve
  apenas el pago quede confirmado.

            ( Ver mi plan )

Si crees que esto es un error, responde este correo y le llega a {coachName}.
```

- **Variantes por modo**: el bloque «CÓMO PAGAS» es el único que cambia; el resto es idéntico.
- **Qué NO decir** (R6): que se pueda pagar desde la app. En `manual` el alumno **avisa** desde la
  app o la web, pero **paga fuera**; en `mp_link` y `mp_subscription` el pago ocurre en Mercado Pago.
  Tampoco «suscripción» en modo `mp_link` (no deja tarjeta guardada), ni IVA, ni «boleta».
- **No reemplaza al aviso previo del checkout** (R21): el aviso previo se muestra **en pantalla**
  antes del primer checkout de `mp_link` (versión corta) y antes del preapproval (versión completa),
  y deja fila en `student_billing_consents`. E0 es informativo del plan, no es el consentimiento.

---

### E1 · `cobro_recordatorio` — «tu plan vence pronto»

- **Disparador**: cron `cobros-sweep` (`api/cron/cobros-sweep/route.ts`), rama «cuota `pending` con
  `due_on - reminder_days === hoy`». `trigger: 'cron'`.
- **Momento**: F-3 (o F-`reminder_days_before` del plan/coach).
- **Badge**: `VENCE PRONTO` `#F59E0B`.
- **Asunto**: `Tu plan con {coachBrandName} vence el {fechaLarga}`
  · alt A: `Quedan {n} días de tu plan con {coachBrandName}`
  · alt B: `Recordatorio: tu mensualidad con {coachBrandName}`
- **Preheader**: `{monto} · vence el {fechaCorta}`
- **CTA**: `Ver cómo pagar` → `https://www.eva-app.cl/c/{slug}/pagos`
- **dedupe_key**: `cobro_recordatorio:{charge_id}`
- **Cuerpo**:

```
{clientName}, tu plan vence el {fechaLarga}

Te {quedan n días / queda 1 día} de acceso con {coachBrandName}. Tu coach {coachName}
te deja este recordatorio para que no se te pase.

  MONTO
  {monto}
  {planDescription}

  Período     {periodStart} — {periodEnd}
  Vence       {fechaLarga}
  Cada        {periodLabel}

  [modo manual] CÓMO PAGAR
  {transferInstructions}

            ( Ver cómo pagar )

Si ya pagaste, ignora este correo. Cualquier duda, responde y le llega a {coachName}.
```

- **footerText**: `Recibes este aviso porque entrenas con {coachBrandName} en EVA. Si prefieres no
  recibir el recordatorio previo, desactívalo en «Mi plan».`
  (**único correo, junto con E1-link, que ofrece baja** — el opt-out vive en
  `client_billing_plans.reminder_opt_out_at`, OUTLINE §3.7.)
- **Variantes**: `manual` → bloque «Cómo pagar» con las instrucciones del coach y, si el coach cargó
  `own_payment_link_url`, la URL **en texto plano** (no gasta el `<a>`). `mp_link` → este correo no
  se manda: lo reemplaza **E1-link**. `mp_subscription` → sin bloque de instrucciones, párrafo
  «El cobro se hace solo el {fecha} con el medio de pago que dejaste en Mercado Pago» y CTA
  `Ver mi plan`.
- **Qué NO decir**: «último aviso», «tu acceso será suspendido» (todavía falta), «reintentaremos el
  cobro» en `manual`/`mp_link` (no hay reintento: la acción es humana, research/s7 §4.4), ningún
  precio de EVA, ninguna mención de IVA.

---

### E1-link · `cobro_link` — «tu link de pago de {mes}» (solo `mp_link`)

- **Disparador**: `cobros-sweep`, después de crear la preference de Checkout Pro con el token OAuth
  del coach (OUTLINE §2.2). `trigger: 'cron'`.
- **Momento**: F-5. Si el plan se crea con la cuota ya vencida, sale al instante.
- **Badge**: `LINK DE PAGO` `#F59E0B`.
- **Asunto**: `Tu link de pago de {mesEnPalabras} con {coachBrandName}`
  · alt A: `Ya puedes pagar tu plan con {coachBrandName}`
  · alt B: `{coachBrandName}: link para pagar tu mensualidad`
- **Preheader**: `{monto} · vence el {fechaCorta} · pagas con débito, crédito o saldo`
- **CTA**: `Pagar {monto}` → `{checkout_url}` (el `init_point` de la preference).
- **dedupe_key**: `cobro_link:{charge_id}:{preference_id}` — si la preference se regenera (expiró a
  los 30 días), el `preference_id` cambia y el correo vuelve a salir, que es lo correcto.
- **Cuerpo**:

```
{clientName}, acá está tu link de pago

{coachName} preparó el cobro de tu plan en {coachBrandName}. Pagas con débito, crédito
o saldo de Mercado Pago, en una sola vez. No queda ninguna tarjeta guardada.

  MONTO
  {monto}

  Período      {periodStart} — {periodEnd}
  Vence        {fechaLarga}
  El link vive hasta el {checkoutExpiresAt}

            ( Pagar {monto} )

Apenas Mercado Pago confirme el pago, tu acceso queda al día solo: no tienes que avisarle
a nadie. El dinero va directo a la cuenta de {coachName}; EVA no lo recibe ni cobra comisión.
```

- **Qué NO decir**: «suscripción» (esto NO deja tarjeta guardada, confundirlo genera contracargos),
  «boleta», IVA, ni la comisión que MP le descuenta al coach (es información del coach, no del
  alumno).

---

### E2 · `cobro_vencido` — «tu plan venció»

- **Disparador**: `cobros-sweep`, cuota `pending` con `hoy ≥ F+1` (gracia > 0) o `hoy ≥ F`
  (gracia 0) — umbral, no igualdad (R4). `trigger: 'cron'`.
- **Suspendido por claim (R3)**: si la cuota está `claimed` (claim vivo, sin resolver), **E2 no sale**
  (`skipped_claim_open`) y no se escribe ledger. Sale en el siguiente sweep si el coach rechaza el
  claim. Además el plan `canceled` no recibe E2 (R1: ya no hay nada que cobrar).
- **Badge**: `PLAN VENCIDO` `#EF4444` (gracia 3) · `ÚLTIMO DÍA` `#F59E0B` (gracia 0).
- **Asunto**: `Tu plan con {coachBrandName} venció`
  · alt A: `{coachBrandName}: tu mensualidad quedó pendiente`
  · alt B: `Tu plan venció el {fechaCorta}`
  · **gracia 0**: `Hoy es el último día de tu plan con {coachBrandName}`
- **Preheader**: `Tu acceso sigue hasta el {fechaFinGracia}` · gracia 0: `Si no se paga hoy, mañana
  queda en pausa`
- **CTA**: `Ver cómo pagar` → `/c/{slug}/pagos` (modos `manual` y `mp_subscription`);
  `Pagar {monto}` → `{checkout_url}` (modo `mp_link`).
- **dedupe_key**: `cobro_vencido:{charge_id}`
- **Cuerpo (gracia 3)**:

```
{clientName}, tu plan venció el {fechaLarga}

Tu acceso sigue funcionando hasta el {fechaFinGracia}. Después queda en pausa hasta que
te pongas al día con {coachName}. Tu progreso no se borra.

  MONTO PENDIENTE
  {monto}
  {planDescription}

  Período   {periodStart} — {periodEnd}
  Venció    {fechaLarga}
  Tu acceso sigue hasta   {fechaFinGracia}

  [manual] CÓMO PAGAR
  {transferInstructions}

            ( Ver cómo pagar )

Si ya pagaste, avísale a {coachName} desde «Mi plan» o responde este correo.
```

- **Cuerpo (gracia 0)**: mismo esqueleto, primer párrafo →
  `Hoy es el último día de tu plan con {coachBrandName}. Si el pago no entra hoy, mañana tu acceso
  queda en pausa. Tu progreso no se borra.`
- **Qué NO decir**: «moroso», «atrasado» como etiqueta, mayúsculas gritando, countdown por horas,
  «te vamos a cobrar recargo» (no existe recargo en el motor).

---

### E3 · `cobro_ultimo_aviso` — «mañana se pausa tu acceso» (solo gracia > 0)

- **Disparador**: `cobros-sweep`, `hoy ≥ F + grace_days` (umbral, R4) y la cuota sigue sin pagar.
  `trigger: 'cron'`.
- **Suspendido por claim (R3)**: cuota `claimed` ⇒ `skipped_claim_open`, sin ledger. Plan `canceled`
  ⇒ tampoco sale (R1).
- **Badge**: `ÚLTIMO DÍA DE GRACIA` `#EF4444`.
- **Asunto**: `Mañana se pausa tu acceso a {coachBrandName}`
  · alt A: `Último día para ponerte al día con {coachName}`
  · alt B: `Tu acceso a {coachBrandName} se pausa mañana`
- **Preheader**: `{monto} pendiente · después queda en pausa`
- **CTA**: igual que E2.
- **dedupe_key**: `cobro_ultimo_aviso:{charge_id}`
- **Cuerpo**:

```
{clientName}, mañana tu acceso queda en pausa

Tu plan con {coachBrandName} venció el {fechaLarga} y el {fechaFinGracia} es el último día
de tu ventana para ponerte al día. Después, tu cuenta queda en pausa: tu historial, tus
rutinas y tu progreso siguen guardados, no se borra nada.

  MONTO PENDIENTE
  {monto}

  [manual] CÓMO PAGAR
  {transferInstructions}

            ( Ver cómo pagar )

Si ya pagaste y {coachName} todavía no lo confirma, avísale desde «Mi plan»: apenas lo
confirme, todo sigue igual.
```

- **Qué NO decir**: nada que suene a castigo («vas a perder todo», «se borra tu progreso» — es
  falso), ni «última oportunidad».
- **Gracia 0**: este correo **no existe**. El sweep ni siquiera lo evalúa.

---

### E4 · `cobro_cortado` — «tu acceso está en pausa» · dos variantes: `unpaid` y `ended` (R1)

Un solo `template_key`, **dos `reason`** que cambian badge, asunto y cuerpo. Es el correo del corte,
y hay dos formas de llegar al corte: no pagar (`unpaid`) o que el plan cancelado llegue a su fin
(`ended`). Se mantienen juntos porque comparten estructura, tono y ledger; el `reason` viaja en el
`payload` y en el `dedupe_key`.

#### E4/`unpaid` — no se pagó

- **Disparador**: `cobros-sweep`, primer día en estado `unpaid` (`hoy ≥ F + grace + 1`, umbral R4).
  Marca `student_billing_charges.cut_notified_at` para que no se repita. `trigger: 'cron'`.
- **Suspendido por claim (R3)**: con un claim vivo el corte se **difiere hasta 5 días** después del
  fin de la gracia y E4 **no sale** en ese lapso (`skipped_claim_open`). Vencidos esos 5 días, o
  rechazado el claim, el corte ocurre y E4 sale.
- **Badge**: `ACCESO EN PAUSA` `#EF4444`.
- **Asunto**: `Tu acceso a {coachBrandName} está en pausa`
  · alt A: `Pausamos tu acceso a {coachBrandName}`
  · alt B: `{coachBrandName}: tu cuenta quedó en pausa`
- **Preheader**: `Tu progreso está guardado. Se reactiva al confirmar el pago.`
- **CTA**: `Ver cómo pagar` → `/c/{slug}/pagos` (o `Pagar {monto}` en `mp_link`).
- **dedupe_key**: `cobro_cortado:{charge_id}`
- **Cuerpo**:

```
Tu acceso está en pausa

Hola {clientName}: tu plan con {coachBrandName} quedó pendiente y por eso tu acceso está
en pausa. Tu progreso está guardado y te espera.

  MONTO PENDIENTE
  {monto}

  Período   {periodStart} — {periodEnd}
  Venció    {fechaLarga}

  [manual] CÓMO PAGAR
  {transferInstructions}

            ( Ver cómo pagar )

Apenas {coachName} confirme tu pago, tu acceso vuelve al instante y retomas donde lo dejaste.
Cualquier duda, responde este correo y le llega a {coachName}.
```

- **Tono**: espeja `STUDENT_ACCESS_COPY` (`lib/student-access.ts:42-53`): «Tu progreso está guardado
  y te espera», calma, un solo camino. El molde estructural es `buildClientArchivedEmail`
  (`transactional-templates.ts:459`).
- **Qué NO decir**: «suspendimos tu cuenta por no pagar» (culpa + etiqueta), «te dimos de baja»
  (no es baja, es pausa), ni un plazo de borrado que no existe. Tampoco (R6) que se pueda pagar
  desde la app: el CTA es web y las instrucciones son de transferencia o Mercado Pago.

#### E4/`ended` — el plan cancelado llegó a su fin (R1)

- **Disparador**: `cobros-sweep`, primer día con el plan en estado `ended` (`status='canceled'` y
  `hoy > paid_through`, umbral R4). `trigger: 'cron'`. Marca `cut_notified_at` en el plan
  (no hay cuota pendiente que marcar).
- **Badge**: `PLAN TERMINADO` `#6B7280` (neutro: no hay deuda, no hay reproche).
- **Asunto**: `Tu plan con {coachBrandName} terminó`
  · alt A: `Se terminó tu plan con {coachName}`
  · alt B: `{coachBrandName}: tu plan llegó a su fin`
- **Preheader**: `Tu progreso está guardado. Si quieres volver, habla con {coachName}.`
- **CTA**: `Ver mi plan` → `/c/{slug}/pagos`
- **dedupe_key**: `cobro_cortado:ended:{plan_id}:{paid_through}` — con `paid_through` adentro, si el
  coach reactiva y el plan vuelve a terminar más adelante, el correo sale de nuevo (correcto).
- **Cuerpo**:

```
Tu plan con {coachBrandName} terminó

Hola {clientName}: tu plan estaba cancelado y su último día pagado fue el {paidThrough},
así que desde hoy tu acceso queda en pausa. No te vamos a cobrar nada.

  Plan          {planDescription}
  Último día    {paidThrough}
  Cancelado el  {canceledAt} · por {tú | tu coach}

Tu historial, tus rutinas y tu progreso siguen guardados. Si quieres volver, habla con
{coachName} y él reactiva tu plan cuando quieras.

            ( Ver mi plan )

Cualquier duda, responde este correo y le llega a {coachName}.
```

- **Copys canónicos de R1** — se usan tal cual, incluida la web y la app:
  - antes de `paid_through` (plan `canceled`, estado `ok`): «**tu plan termina el {paid_through}**»
    (E7, banner web y estado en la app);
  - después (estado `ended`): web «**Tu plan con {coach} terminó**»; app «**Tu acceso está en
    pausa**» (la app nunca dice «terminó»: el copy nativo es el genérico de pausa, R7, con la
    `reason: 'ended'` que trae `/api/mobile/config`).
- **Qué NO decir**: nada de deuda, monto pendiente, «ponte al día» ni CTA de pago — no hay cuota
  que cobrar. Tampoco «te dimos de baja de EVA»: la cuenta sigue, lo que terminó es el plan con
  ese coach.

---

### E5 · `cobro_confirmado` — comprobante de pago (NO es boleta)

- **Disparador**: `confirmCharge()` en `services/cobros/confirm-payment.service.ts`, sea cual sea la
  fuente (`manual`, `student_claim`, `mp_link`, `mp_subscription`). En el camino web/RN del coach es
  `trigger: 'coach_action'`; desde el webhook de MP, `trigger: 'webhook'`.
- **Badge**: `PAGO REGISTRADO` `#10B981`.
- **Asunto**: `Comprobante de tu pago a {coachBrandName}`
  · alt A: `{coachName} confirmó tu pago`
  · alt B: `Tu pago quedó registrado — {monto}`
- **Preheader**: `{monto} · {fechaCorta} · tu acceso sigue hasta el {paidThrough}`
- **CTA**: `Ver mi plan` → `/c/{slug}/pagos`
- **dedupe_key**: `cobro_confirmado:{client_payments.id}`
- **Kill-switch**: **no aplica** (es la constancia del pago; §6.4).
- **Cuerpo**:

```
Pago registrado — gracias, {clientName}

  MONTO
  {monto}

  Alumno       {clientName}
  Coach        {coachName}
  Concepto     {planDescription}
  Período      {periodStart} — {periodEnd}
  Fecha        {fechaPago}
  Medio        {Mercado Pago | transferencia | efectivo | otro}
  N° interno   {paymentId corto}

Tu acceso a {coachBrandName} sigue activo hasta el {paidThrough}.

            ( Ver mi plan )

Este comprobante lo genera la plataforma como constancia del pago registrado. No es una
boleta ni una factura: el documento tributario lo emite {coachName} conforme a la ley chilena.
EVA no recibe tu dinero ni cobra comisión.
```

- **«Concepto»** = `client_billing_plans.description` (§1.5, R21), copiado a
  `client_payments.service_description` (`NOT NULL`, baseline:813) al confirmar: así el comprobante
  dice lo mismo que decían los avisos, aunque el coach edite el plan después.
- **Bloque legal**: los tres últimos renglones son el texto de research/s6 §8.4, obligatorios y
  literales en el sentido (no en la letra exacta hasta que el abogado los revise).
- **Qué NO decir**: «boleta», «factura», «documento tributario», «recibo tributario», IVA, ni el
  neto/bruto del monto. **Regla dura de UI y de nombre de archivo**: si algún día se descarga en PDF,
  el archivo se llama `comprobante-...`, nunca `boleta-...`.

---

### E6 · `susc_activada` — confirmación escrita del contrato (art. 12 A LPC)

- **Disparador**: webhook `subscription_preapproval` con `status: authorized`, o el retorno síncrono
  de `/c/{slug}/pagos/retorno` que confirma por re-fetch con el token del coach. `trigger: 'webhook'`.
- **Badge**: `SUSCRIPCIÓN ACTIVA` `#10B981`.
- **Asunto**: `Confirmación de tu plan con {coachBrandName}`
  · alt A: `Tu suscripción con {coachName} quedó activa`
  · alt B: `Guarda este correo: tu plan con {coachBrandName}`
- **Preheader**: `{monto} {periodLabel} · próximo cobro {fechaCorta} · cancelas en un toque`
- **CTA**: `Ver o cancelar mi plan` → `/c/{slug}/pagos`
- **dedupe_key**: `susc_activada:{preapproval_id}`
- **Kill-switch**: **no aplica** (obligación legal; s6 §8.3 lo dice explícitamente).
- **Cuerpo**:

```
{clientName}, confirmamos tu plan con {coachName}

Guarda este correo: es la confirmación escrita de tu contrato.

  PRECIO
  {monto} {periodLabel}

  Servicio           {planDescription}      ← client_billing_plans.description (R21, ≤ 140)
  Inicio             {fechaInicio}
  Primer cobro       {fechaPrimerCobro}
  Próximo cobro      {fechaProximoCobro}
  Día de cobro       el {díaDelMes} de cada {período}
  Renovación         automática {periodLabel}, hasta que la canceles
  Medio de pago      {medio registrado en Mercado Pago}
  Contratado el      {fechaHora} desde {web}

  Días de gracia     {graceDays === 0 ? 'sin días de gracia' : `{graceDays} días`}

  QUIÉN TE PRESTA EL SERVICIO Y TE COBRA
  {coachName} — RUT {coachRut} — {coachEmail}{, coachPhone si existe}
  EVA es la plataforma que usa tu coach: no recibe tu dinero ni cobra comisión.

  CÓMO CANCELAR
  Entra a «Mi plan» y toca «Cancelar suscripción». Un toque, sin llamar a nadie y sin
  necesidad de estar al día. Conservas el acceso hasta el {finDelPeríodoPagado} y después
  tu plan termina.

  TU BOLETA
  Te la emite {coachName}. Si no la recibes, escríbele.

  DERECHO A RETRACTO
  Tienes derecho a retractarte dentro de 10 días desde la contratación si el servicio aún
  no comenzó. Al usar tu plan antes de ese plazo, aceptas que el servicio comience de
  inmediato.

            ( Ver o cancelar mi plan )

  CONDICIONES COMPLETAS DEL CONTRATO
  ------------------------------------------------------------------
  {renderCobrosContract(consent.terms_version, params)}   ← template estándar parametrizado
  Versión {consent.terms_version} · aceptado el {consent.consented_at}
  ------------------------------------------------------------------

EVA es la plataforma que usa tu coach. EVA no recibe tu dinero ni cobra comisión.
Dudas sobre el cobro: responde este correo y le llega a {coachName}.
Dudas sobre tus datos: privacidad@eva-app.cl
```

- **Bloque legal**: art. 12 A Ley 19.496 exige **copia íntegra, clara y legible del contrato** — un
  enlace que mañana cambia no cumple (s6 §8.3). Por eso el texto **completo va embebido en el HTML**:
  el correo lo obtiene de `renderCobrosContract(terms_version, params)` (§1.5), con
  `terms_version` de la fila de `student_billing_consents` que originó el plan. Si falta el
  consentimiento o algún parámetro obligatorio (`description`, monto, ciclo, nombre o RUT del coach)
  **E6 no se manda y el builder tira `null`** (`skipped_no_contract`, con log de alerta) — mandar la
  «confirmación escrita» sin la copia íntegra es peor que no mandarla: estira el retracto de 10 a 90
  días igual, pero además deja constancia de que se prometió y no se cumplió.
  **Prohibido** rellenar ese bloque con `coach_billing_settings.terms_version`: es el anexo de EVA
  aceptado por el coach, no el contrato alumno↔coach.
  `{planDescription}` sale de `client_billing_plans.description` (R21), no de `client_payments`.
  El **bloque de retracto ya no es una duda**: DECISIONS-2 §EMAILS fija el texto estándar (§1.5),
  que vive **dentro** del template (misma `CONTRACT_VERSION`) y va **marcado
  ⚖️ VALIDAR CON ABOGADO** en `TESTING-LEGAL.md`; no bloquea el diseño ni la implementación.
  El mismo texto se muestra en el **aviso previo** (versión completa antes del preapproval; versión
  corta antes del primer checkout de `mp_link`, R21), cada uno con su fila en
  `student_billing_consents`.
- **CA de E6**: el HTML contiene, carácter por carácter, la salida de
  `renderCobrosContract(consent.terms_version, params)`; con una `terms_version` antigua se renderiza
  **esa** versión del registro append-only, sin depender de los ajustes vigentes del coach ni de la
  `CONTRACT_VERSION` actual. Test en §10.6.
- **Qué NO decir**: nada que suene a que EVA cobra o retiene; nada de IVA; no esconder la
  cancelación en letra chica (Ley 21.398 exige baja simétrica).
- **Excepción al «un solo `<a>`»**: este correo puede llevar un segundo `<a>` solo si el contrato
  íntegro incluye un enlace propio del coach. El test de §10 contempla la excepción por
  `template === 'susc_activada'`.

---

### E7 · `susc_cancelada` — suscripción cancelada

- **Disparador**: server action del alumno (`/c/{slug}/pagos/_actions`, `canceled_by:'student'`),
  acción del coach, o webhook `subscription_preapproval` con `status: cancelled` (incluido el caso
  «MP canceló sola tras 3 cuotas rechazadas», OUTLINE §2.2). `trigger` según origen.
- **Badge**: `SUSCRIPCIÓN CANCELADA` `#6B7280`.
- **Asunto**: `Cancelaste tu plan con {coachBrandName}` (por el alumno)
  · variante coach: `Tu plan con {coachBrandName} quedó cancelado`
  · alt A: `Confirmamos la baja de tu plan`
  · alt B: `Tu suscripción con {coachName} quedó cancelada`
- **Preheader**: `Tu plan termina el {paidThrough}. No se te vuelve a cobrar.`
- **CTA**: `Ver mi plan` → `/c/{slug}/pagos`
- **dedupe_key**: `susc_cancelada:{preapproval_id}` (modos MP) · `susc_cancelada:{plan_id}:{canceled_at}` (modo `manual`)
- **Kill-switch**: **no aplica**.
- **Cuerpo**:

```
Listo, {clientName}: no se te vuelve a cobrar

  Cancelado el        {fechaHora}
  Cancelado por       {tú | tu coach}
  Tu plan termina     el {paidThrough}

Hasta el {paidThrough} tu acceso sigue funcionando igual. Ese día tu plan termina y tu
cuenta queda en pausa. Tu progreso no se borra: si vuelves, retomas donde lo dejaste.

            ( Ver mi plan )

Si quieres volver, habla con {coachName} y activa el plan de nuevo cuando quieras.
```

- **R1 en el copy**: «tu plan **termina** el {paidThrough}», nunca «tu acceso sigue» a secas —
  cancelar **no** da acceso eterno. El día después de `paidThrough` el plan pasa a `ended` y sale
  **E4/`ended`** («tu plan terminó»). Si el alumno ya está en `unpaid` cuando cancela, `paidThrough`
  quedó atrás: el correo dice «tu plan ya terminó el {paidThrough}» y **no** se manda E4/`ended`
  (el corte ya fue notificado por E4/`unpaid`; el dedupe por `plan_id`+`paid_through` lo garantiza).
- **Cancelación ≠ reembolso**: cancelar deja el período ya pagado intacto. Si además hubo devolución
  de plata, eso es **E11** (R9), un correo distinto.

- **Qué NO decir**: nada de retención («¿seguro? mira lo que te pierdes»): Ley 21.398 exige que la
  baja sea tan simple como el alta, y una pared de retención en el correo de confirmación es
  exactamente el reclamo SERNAC que el módulo tiene que evitar. Tampoco «te devolveremos» si no hay
  reembolso.

---

### E8 · `cobro_rechazado` — el cobro automático no pasó (solo `mp_subscription`)

- **Disparador**: webhook `subscription_authorized_payment` con estado rechazado, resuelto por
  `mapProviderStatus`. `trigger: 'webhook'`.
- **Badge**: `COBRO RECHAZADO` `#F59E0B` (mismo semáforo que `payment-dunning-templates.ts:27`).
- **Asunto**: `No se pudo cobrar tu plan con {coachBrandName}`
  · alt A: `Tu cobro automático fue rechazado`
  · alt B: `{coachBrandName}: revisa tu medio de pago`
- **Preheader**: `Mercado Pago va a reintentar. Tu acceso sigue hasta el {paidThrough}.`
- **CTA**: `Ver mi plan` → `/c/{slug}/pagos`
- **dedupe_key**: `cobro_rechazado:{mp_payment_id}` — **nunca por fecha**: un webhook reentregado
  mandaría tres copias (`maps/r4-emails.md §9.7`).
- **Cuerpo**:

```
{clientName}, tu cobro automático no pasó

Mercado Pago no pudo cobrar {monto} de tu plan con {coachBrandName}. Suele ser saldo
insuficiente o un problema con la tarjeta.

  MONTO
  {monto}

  Intento        {fechaIntento}
  Tu acceso      sigue hasta el {paidThrough}

Mercado Pago va a reintentar el cobro en los próximos días. Si quieres adelantarte,
actualiza el medio de pago de esta suscripción desde tu cuenta de Mercado Pago
(Tu negocio → Suscripciones).

            ( Ver mi plan )

Si el cobro no entra, tu acceso queda en pausa el {fechaCorte}. Cualquier duda,
responde este correo y le llega a {coachName}.
```

- **Nota**: acá **sí** se dice «reintentará» porque MP efectivamente reintenta (4 intentos / 10 días,
  OUTLINE §2.2). En `manual` y `mp_link` decirlo sería mentira (research/s7 §4.4).
- **Qué NO decir**: el nombre completo ni los 4 últimos dígitos de la tarjeta (no los tenemos y no
  los queremos), ni un link a Mercado Pago que gaste el `<a>` — la instrucción va en texto.

---

### E9 · `plan_cambiado` — tu coach pausó o cambió tu cobro

- **Disparador**: server action del coach que edita monto / periodicidad / modo / gracia, o que pausa
  el plan (`plans.service.ts`). `trigger: 'coach_action'`.
- **Badge**: `PLAN ACTUALIZADO` `#6B7280` · pausa: `COBRO EN PAUSA` `#6B7280`.
- **Asunto**: `{coachName} actualizó tu plan en {coachBrandName}`
  · pausa: `{coachName} pausó el cobro de tu plan`
  · alt A: `Cambios en tu plan con {coachBrandName}`
  · alt B: `Tu plan con {coachBrandName} cambió`
- **Preheader**: `Desde el {fechaVigencia}: {monto} {periodLabel}` · pausa: `No se te va a cobrar
  por ahora. Tu acceso sigue igual.`
- **CTA**: `Ver mi plan` → `/c/{slug}/pagos`
- **dedupe_key**: `plan_cambiado:{plan_id}:{updated_at ISO}` — un cambio, un correo; dos ediciones el
  mismo segundo no duplican.
- **Cuerpo (cambio)**:

```
{clientName}, {coachName} actualizó tu plan

              Antes            Ahora
  Monto       {montoAntes}     {montoAhora}
  Cada        {períodoAntes}   {períodoAhora}
  Cómo pagas  {modoAntes}      {modoAhora}

Rige desde el {fechaVigencia}. Tu acceso actual no cambia: sigue hasta el {paidThrough}.

            ( Ver mi plan )

Si no estás de acuerdo con el cambio, responde este correo y le llega a {coachName}.
```

- **Cuerpo (pausa)**: `{coachName} pausó el cobro de tu plan. Por ahora no se te va a cobrar y tu
  acceso sigue funcionando igual. Te avisamos si lo reactiva.`
- **Bloque legal**: un cambio de precio unilateral no obliga al alumno (LPC). Por eso la última línea
  ofrece un canal de rechazo, y en `mp_subscription` el cambio de monto **no se aplica al preapproval
  vivo** sin un nuevo consentimiento (que dispara E6 de nuevo). **Decisión del writer 4.**
- **Qué NO decir**: presentar el aumento como decisión de EVA («actualizamos los precios»); es del
  coach y así se dice.

---

### E10 · `cobro_reactivado` — tu acceso volvió

- **Disparador**: `confirmCharge()` cuando el estado inmediatamente anterior del alumno era `unpaid`.
  Sale **además** de E5 (E5 = comprobante, E10 = la buena noticia). `trigger` según origen.
- **Badge**: `ACCESO ACTIVO` `#10B981`.
- **Asunto**: `Listo — tu acceso a {coachBrandName} está activo de nuevo`
  · alt A: `Tu acceso volvió, {clientName}`
  · alt B: `{coachName} confirmó tu pago: ya puedes entrenar`
- **Preheader**: `Activo hasta el {paidThrough}. Retomas donde lo dejaste.`
- **CTA**: `Entrar a mi cuenta` → `https://www.eva-app.cl/c/{slug}/login`
- **dedupe_key**: `cobro_reactivado:{client_payments.id}`
- **Cuerpo**: molde de `buildClientUnarchivedEmail` (`transactional-templates.ts:517`).

```
¡Tu acceso está activo de nuevo!

Hola {clientName}: {coachName} confirmó tu pago y tu acceso a {coachBrandName} volvió.
Puedes retomar exactamente donde lo dejaste.

  Activo hasta   {paidThrough}
  Próximo cobro  {nextDueOn}

            ( Entrar a mi cuenta )
```

**Decisión del writer 5:** E10 se mantiene separado de E5 en vez de fundirse (OUTLINE §9 lo permitía).
Son dos noticias distintas con dos ledgers distintos: E5 es el comprobante que el alumno guarda, E10
es «vuelve a entrar». Fundirlos obliga a un template con dos personalidades y a un `dedupe_key`
ambiguo; separados, E10 simplemente no se manda cuando el alumno nunca estuvo cortado, que es el
caso normal.

---

### E11 · `cobro_revertido` — tu pago fue reembolsado o desconocido (R9)

La contracara de E5: la plata volvió y el acceso se recalcula. Un solo template con dos `reason`
(`refunded` | `charged_back`), porque el efecto para el alumno es idéntico y el tono también.

- **Disparador**: webhook de MP con `refunded` / `charged_back` (o reembolso registrado a mano por el
  coach) resuelto vía `private.cobros_revert_charge(...)` (R13). Ese RPC deja la cuota en `refunded` |
  `charged_back`, `client_payments.status` igual, y **retrocede `paid_through`** al `period_end` de la
  cuota anterior pagada (R8/R9: `paid_through` avanza por confirmaciones y retrocede solo por
  deshacer, reembolso o contracargo). El estado derivado puede quedar `unpaid` de inmediato.
  `trigger: 'webhook'` (o `'coach_action'`).
- **Badge**: `PAGO REVERTIDO` `#F59E0B`.
- **Asunto** (`refunded`): `Se reembolsó tu pago a {coachBrandName}`
  · (`charged_back`): `Tu pago a {coachBrandName} fue desconocido en Mercado Pago`
  · alt A: `Tu pago de {monto} fue devuelto`
  · alt B: `Cambió el estado de tu pago con {coachBrandName}`
- **Preheader**: `{monto} · tu acceso queda en pausa el {fechaCorte}`
- **CTA**: `Ver mi plan` → `/c/{slug}/pagos`
- **dedupe_key**: `cobro_revertido:{payment_id}:{reason}` — por pago y por motivo, nunca por fecha:
  un reembolso parcial seguido de un contracargo son dos avisos distintos.
- **Kill-switch**: **no aplica** (§6.4): es plata que se movió; callarlo es peor que cualquier loop.
- **Cuerpo**:

```
{clientName}, cambió el estado de tu pago

  [refunded]      Se reembolsó el pago de {monto} que habías hecho a {coachBrandName}.
  [charged_back]  Mercado Pago informó que este pago de {monto} fue desconocido y lo
                  devolvió mientras revisa el caso.

  MONTO
  {monto}

  Concepto      {planDescription}
  Período       {periodStart} — {periodEnd}
  Pago original {fechaPagoOriginal}
  Motivo        {reembolso | cargo desconocido}

Como ese pago ya no está, ese período vuelve a quedar pendiente. Tu acceso queda en pausa
{el {fechaCorte} | desde hoy}. Tu progreso no se borra.

            ( Ver mi plan )

Si esto fue un error o ya lo resolviste con {coachName}, responde este correo y le llega a él.
```

- **Variante «sigue con acceso»**: si tras retroceder `paid_through` el alumno todavía está `ok`
  (prepago de varios períodos, R16), el párrafo cambia a «Tu acceso sigue activo hasta el
  {paidThrough}» y desaparece la frase de pausa. **Nunca** se anuncia un corte que no va a ocurrir.
- **En paralelo sale C7 al coach** (§5, C7). E11 y C7 son el mismo evento visto desde los dos lados.
- **Qué NO decir**: acusar al alumno de fraude («desconociste el cargo»), prometer que el dinero
  vuelve o no vuelve (la disputa la resuelve Mercado Pago), IVA, «boleta», ni ninguna gestión de
  contracargo dentro de la app (R6). Tampoco un plazo de resolución que EVA no controla.
- **No se manda** si el reembolso corresponde a un pago que nunca dio acceso (por ejemplo un
  `duplicate`, R9): ese caso es solo C8 al coach.

---

## 5. Correos al COACH

`to` = `resolveCoachEmail(admin, coachId)`. **Sin white-label** (son correos de EVA al coach, misma
doctrina que `sales-templates.ts:23`). Ledger: `coach_email_ledger` vía `scheduleCoachEmail`
(`services/email/coach-email-ledger.service.ts:147`) con `trigger: 'transactional'` — el CHECK del
ledger es cerrado (`20260822004243_coach_email_ledger.sql:38`) y `'transactional'` es el valor
correcto sin migrar nada.

---

### C1 · `cobros_digest:{yyyy-mm-dd}` — resumen diario

- **Disparador**: `cobros-sweep`, al final de la corrida, **solo si hay algo** (cuotas vencidas, por
  vencer en la ventana, o claims sin confirmar). Si no hay nada, no se manda.
- **Momento**: diario 09:00 CL.
- **replyTo**: ninguno.
- **Asunto**: `Cobros de hoy: {n} por cobrar, {m} vencidos`
  · alt A: `Tu resumen de cobros — {fechaCorta}`
  · alt B: `{m} alumnos vencidos y {k} avisaron que pagaron`
- **Preheader**: `{k} avisaron que pagaron · {totalPorCobrar} por cobrar`
- **CTA**: `Ver mis cobros` → `https://www.eva-app.cl/coach/cobros?filtro=vencidos`
- **dedupe_key** (`template_key` del ledger del coach): `cobros_digest:{yyyy-mm-dd}` — con la fecha
  adentro, obligatorio: el índice único parcial es `(coach_id, template_key)` para siempre
  (`20260822005701_coach_email_ledger_dedupe_uidx.sql:11-13`).
- **Cuerpo**:

```
{coachName}, tus cobros de hoy

  Por cobrar esta semana   {n} alumnos · {totalPorCobrar}
  Vencidos                 {m} alumnos · {totalVencido}
  Avisaron que pagaron     {k} alumnos
  En pausa por pago        {p} alumnos

  {lista corta: {alumno} — {monto} — vence/venció el {fechaCorta} — {estado}}   (máx 8 filas)

            ( Ver mis cobros )

Confirmar un pago toma un toque y el acceso del alumno vuelve al instante.
```

---

### C2 · `cobros_claim:{charge_id}` — «{alumno} avisó que pagó»

- **Disparador**: server action del claim del alumno (web o RN). **`await` obligatorio** (§1.1.4).
  `trigger: 'transactional'`.
- **replyTo**: **el correo del alumno** — **decisión del writer**: es el único correo del motor donde
  responder directamente al alumno es la acción natural del coach.
- **Asunto**: `{clientName} avisó que pagó {monto}`
  · alt A: `{clientName} dice que ya pagó`
  · alt B: `Pago por confirmar: {clientName}`
- **Preheader**: `{monto} · período {periodStart}–{periodEnd} · confírmalo en un toque`
- **CTA**: `Revisar y confirmar` → `/coach/cobros?alumno={clientId}`
- **Cuerpo**:

```
{clientName} avisó que pagó

  Monto        {monto}
  Período      {periodStart} — {periodEnd}
  Avisó el     {fechaHora}
  Comprobante  {sí, adjunto en la ficha | no adjuntó}
  Nota         «{claimNote}»                        ← escapada, máx 280

            ( Revisar y confirmar )

Confirmarlo reactiva su acceso al instante y le manda su comprobante.
Si el pago no llegó, no confirmes: el aviso queda registrado igual.
```

- El comprobante **no se adjunta** (el transporte no soporta `attachments`,
  `maps/r4-emails.md §0.1`): se ve en la ficha, en el bucket privado `payment-receipts`.
- **Cuerpo, línea final (R3)**: `Mientras no lo resuelvas, no le mandamos más avisos de cobro a
  {clientName} y su corte se difiere hasta 5 días. Rechazarlo lo devuelve al calendario normal.`

---

### C2-bis · `cobros_claim_pendiente:{charge_id}:{yyyy-mm-dd}` — recordatorio diario del claim (R3)

El claim del alumno **suspende E2/E3/E4 y difiere el corte hasta 5 días**: toda la presión se mueve
al coach, y por eso hay recordatorio diario hasta que lo resuelva. Es lo que hace que forjar un claim
cueste 5 días y nada más, con el coach mirando.

- **Disparador**: `cobros-sweep`, una vez al día por cada cuota con claim vivo (`claimed`, sin
  confirmar ni rechazar). No se manda el mismo día que salió C2. `trigger: 'transactional'`.
- **Corte del recordatorio**: cuando el coach confirma o rechaza, o cuando pasan los 5 días de
  diferimiento y el corte se ejecuta (ese día sale E4 al alumno y el último C2-bis dice que el
  acceso quedó en pausa con el aviso todavía sin resolver).
- **replyTo**: **el correo del alumno** (igual que C2).
- **Asunto**: `{clientName} avisó hace {n} días: confirmar o rechazar`
  · alt A: `Sigue pendiente el aviso de pago de {clientName}`
  · alt B: `{n} días esperando: ¿{clientName} te pagó?`
- **Preheader**: `{monto} · si no lo resuelves, su acceso se pausa el {fechaCorteDiferido}`
- **CTA**: `Confirmar o rechazar` → `/coach/cobros?alumno={clientId}`
- **dedupe_key** (ledger del coach): `cobros_claim_pendiente:{charge_id}:{yyyy-mm-dd}` — con la fecha
  adentro, obligatorio (el índice único del ledger del coach es `(coach_id, template_key)` para
  siempre, `20260822005701_coach_email_ledger_dedupe_uidx.sql:11-13`).
- **Cuerpo**:

```
{clientName} avisó hace {n} días que pagó

Todavía no lo confirmas ni lo rechazas.

  Monto        {monto}
  Período      {periodStart} — {periodEnd}
  Avisó el     {fechaHora}
  Su acceso    se pausa el {fechaCorteDiferido} si esto sigue sin resolverse

            ( Confirmar o rechazar )

Si el pago llegó, confirmarlo reactiva su acceso al instante y le manda su comprobante.
Si no llegó, recházalo: vuelve al calendario normal de cobro y el aviso queda registrado.
```

- **Qué NO decir**: nada que sugiera que EVA verificó el pago (EVA no ve la cuenta del coach), ni
  presión sobre el alumno («te está mintiendo»). El hecho: avisó, falta resolverlo.

---

### C3 · `cobros_pago:{payment_id}` — cobro recibido (riel MP)

- **Disparador**: webhook de MP confirmando pago (`mp_link` o `mp_subscription`). Respeta el toggle
  `coach_billing_settings.notify_on_payment` (default true).
- **Asunto**: `Cobro recibido de {clientName} — {monto}`
  · alt A: `{clientName} pagó {monto}`
  · alt B: `Entró un pago de {clientName}`
- **Preheader**: `{monto} · {fechaCorta} · su acceso quedó al día hasta el {paidThrough}`
- **CTA**: `Ver el pago` → `/coach/cobros?alumno={clientId}`
- **Cuerpo**: monto, alumno, período, medio, `paid_through` nuevo, y una línea:
  `El dinero entró directo a tu cuenta de Mercado Pago. EVA no lo toca ni te cobra comisión.`
- **Qué NO decir**: el monto neto después de la comisión de MP (EVA no lo conoce con certeza y
  publicarlo mal es un reclamo).

---

### C4 · `cobros_mp_conectado:{connection_id}` — conectaste Mercado Pago

- **Disparador**: `GET /api/cobros/mp/callback` exitoso. `trigger: 'transactional'`.
- **Asunto**: `Conectaste tu Mercado Pago a EVA`
  · alt A: `Listo: tu cuenta de Mercado Pago quedó conectada`
  · alt B: `Ya puedes cobrar automático en EVA`
- **Preheader**: `Cuenta {nickname} · lo que tienes que saber antes de cobrar`
- **CTA**: `Ir a mis cobros` → `/coach/cobros`
- **Cuerpo** (calco de s6 §8.8, es el aviso legal al coach):

```
{coachName}, tu Mercado Pago quedó conectado

  Cuenta conectada   {nickname} ({país})
  Conectada el       {fechaHora}

  · La plata de tus alumnos llega directo a tu cuenta. EVA no la toca y no te cobra
    comisión por esto (0 %).
  · La comisión de Mercado Pago por cada cobro la pagas tú, no EVA.
  · Tú emites la boleta de cada pago. EVA no emite documentos tributarios.
  · Si un alumno desconoce un cargo, Mercado Pago descuenta ese dinero de tu cuenta
    mientras se resuelve, y la disputa la das tú. EVA te entrega la evidencia.
  · Puedes desconectar cuando quieras desde «Cobros». Al desconectar, los cobros ya
    creados los administras directo en Mercado Pago.

            ( Ir a mis cobros )
```

---

### C5 · `cobros_mp_desconectado:{connection_id}:{reason}` — MP se desvinculó / token vencido

**R5 manda acá.** Hay dos mundos y el correo tiene que decir cuál es:

- **Desconexión iniciada en EVA** (el coach toca «Desconectar») o **baja a Free**: EVA todavía tiene
  tokens ⇒ **cancela por API TODAS las suscripciones vivas ANTES de revocar** (`PUT status=cancelled`,
  con reintentos y alerta si falla). El diálogo de la UI lo dice antes de confirmar. En ese camino el
  correo es **C6** (baja a Free) o el aviso de éxito de la desconexión; C5 solo cubre el resto.
- **Desautorización llegada desde MP** (`mp-connect` / `application.deauthorized`) o
  **`invalid_grant`** en el refresh: EVA **ya no puede llamar a la API**. La conexión queda `revoked`,
  los planes `mp_*` pasan a `manual` (sin cortar a nadie) y este correo lleva las **instrucciones
  para que el coach cancele él mismo en su panel de Mercado Pago** — es el único que puede.

- **Disparador**: webhook `mp-connect` (`application.deauthorized`), o el cron
  `cobros-mp-reconcile` cuando el refresh devuelve `invalid_grant`.
- **Badge**: `ATENCIÓN` `#F59E0B`.
- **Asunto**: `Tu Mercado Pago se desconectó de EVA`
  · alt A: `Reconecta tu Mercado Pago para seguir cobrando`
  · alt B: `Los cobros automáticos de tus alumnos están pausados`
- **Preheader**: `Tus alumnos NO fueron cortados. Revisa tus suscripciones en Mercado Pago.`
- **CTA**: `Reconectar Mercado Pago` → `/coach/cobros`
- **Cuerpo**:

```
{coachName}, tu Mercado Pago se desconectó

Motivo: {lo desconectaste desde Mercado Pago | el permiso venció}

Qué pasa mientras tanto:
  · Ninguno de tus alumnos fue cortado por esto.
  · Los {n} alumnos que cobrabas automático pasaron a modo transferencia: siguen con su
    plan y sus vencimientos, pero el cobro lo confirmas tú a mano.

  IMPORTANTE: las {k} suscripciones que ya existen SIGUEN COBRANDO
  Al desconectarte, EVA perdió el permiso para tocarlas: no podemos cancelarlas por ti.
  Si no quieres que sigan cobrando, cancélalas tú:

    1. Entra a mercadopago.cl con tu cuenta y ve a «Tu negocio».
    2. Abre «Cobros» → «Suscripciones».
    3. Busca las suscripciones cuyo número de referencia empieza con «cobro|».
    4. En cada una, «Cancelar suscripción».

  Si reconectas EVA, volvemos a administrarlas por ti y no tienes que hacer nada.

            ( Reconectar Mercado Pago )

Si necesitas la lista exacta de tus alumnos con suscripción viva, está en «Cobros».
```

- **Qué NO decir**: que EVA canceló algo que no canceló (es exactamente el escenario donde el coach
  sigue cobrándole a alguien que ya no tiene acceso, R5), ni un link directo al panel de MP que gaste
  el `<a>` — los pasos van en texto plano.

---

### C6 · `cobros_downgrade_free:{coach_id}:{fecha}` — bajaste a Free (R5)

- **Disparador**: el coach deja de ser Pro (downgrade, impago, expiración). Antes de mandarlo, EVA
  **cancela por API todas sus suscripciones vivas** (`PUT status=cancelled`, reintentos + alerta si
  falla) y deja los planes en `paused`. El correo se manda **después** de esa cancelación y reporta
  su resultado real. `trigger: 'transactional'`.
- **Badge**: `COBROS PAUSADOS` `#F59E0B`.
- **Asunto**: `Bajaste a Free: cancelamos tus cobros automáticos`
  · alt A: `Tus cobros automáticos quedaron cancelados`
  · alt B: `Qué pasó con los cobros de tus alumnos`
- **Preheader**: `{k} suscripciones canceladas · tus alumnos no fueron cortados`
- **CTA**: `Ver mis cobros` → `/coach/cobros`
- **dedupe_key**: `cobros_downgrade_free:{coach_id}:{yyyy-mm-dd}`
- **Kill-switch**: sí (pero es el correo que evita un cobro indebido: apagarlo se documenta en el
  runbook como decisión consciente).
- **Cuerpo**:

```
{coachName}, bajaste a Free y cancelamos tus cobros automáticos

El módulo de cobros es del plan Pro. Como tu cuenta pasó a Free, hicimos esto por ti:

  · Cancelamos {k} suscripciones de Mercado Pago. Nadie te va a seguir cobrando por EVA,
    y a tus alumnos no se les vuelve a cobrar automático.
  · Pausamos los planes de cobro de tus {n} alumnos. Sus vencimientos quedan congelados.
  · Ninguno de tus alumnos fue cortado por esto.
  · La plata que ya recibiste es tuya y no se toca. EVA nunca la tuvo.

  {si alguna cancelación falló}
  No pudimos cancelar {f} suscripciones. Cancélalas tú desde mercadopago.cl → Tu negocio
  → Cobros → Suscripciones (referencia «cobro|»). Te avisamos para que nadie siga
  cobrando sin tu decisión.

Si vuelves a Pro, tus planes se reactivan donde quedaron y puedes volver a invitar a tus
alumnos a la suscripción.

            ( Ver mis cobros )
```

- **Qué NO decir**: ningún precio de EVA ni CTA de upgrade con monto (regla 3 de §6.3: los correos
  del motor no venden EVA). «Si vuelves a Pro» sin precio es todo lo que se dice.

---

### C7 · `cobros_reverso:{payment_id}:{reason}` — reembolso o contracargo (R9)

- **Disparador**: el mismo evento que E11, tras `private.cobros_revert_charge(...)`.
  `trigger: 'webhook'` (o `'coach_action'`).
- **Badge**: `PAGO REVERTIDO` `#EF4444`.
- **Asunto** (`refunded`): `Se reembolsó el pago de {clientName} — {monto}`
  · (`charged_back`): `{clientName} desconoció un cargo de {monto}`
- **Preheader**: `Su período volvió a quedar pendiente · su acceso se pausa el {fechaCorte}`
- **CTA**: `Ver el caso` → `/coach/cobros?alumno={clientId}`
- **dedupe_key**: `cobros_reverso:{payment_id}:{reason}`
- **Cuerpo**: monto, alumno, período, fecha del pago original, motivo, el nuevo `paid_through` tras
  el retroceso (R8/R9) y el estado en que quedó el alumno. Más:

```
  · Mercado Pago descuenta ese dinero de tu cuenta mientras se resuelve. La disputa la das
    tú: EVA no es parte del cobro y no puede responder por ti.
  · En «Cobros» tienes la evidencia que registramos: fecha del pago, período cubierto,
    plan contratado y el consentimiento del alumno.
  · Le avisamos a {clientName} que su pago fue revertido y que su acceso queda en pausa.
```

- **Qué NO decir**: consejos legales, promesas sobre el resultado de la disputa, ni el neto de la
  comisión de MP.

---

### C8 · `cobros_pago_duplicado:{payment_id}` — entró un pago duplicado (R9)

- **Disparador**: llega un segundo pago aprobado para una cuota que ya está `paid`. Se registra en
  `client_payments` con `charge_id null` y `status='duplicate'`; **`paid_through` no avanza dos
  veces**. `trigger: 'webhook'`.
- **Badge**: `REVISAR` `#F59E0B`.
- **Asunto**: `{clientName} pagó dos veces — revisa la devolución`
  · alt A: `Pago duplicado de {clientName} ({monto})`
- **Preheader**: `{monto} de más · devuélvelo desde Mercado Pago`
- **CTA**: `Ver el pago` → `/coach/cobros?alumno={clientId}`
- **dedupe_key**: `cobros_pago_duplicado:{payment_id}` (por pago, nunca por fecha: un webhook
  reentregado no puede mandar tres copias).
- **Cuerpo**:

```
{clientName} pagó dos veces el mismo período

  Monto duplicado   {monto}
  Período           {periodStart} — {periodEnd}
  Pago ya aplicado  {fechaPagoOriginal}
  Pago duplicado    {fechaPagoDuplicado}

No aplicamos este segundo pago: el período ya estaba cubierto y el acceso de {clientName}
no cambia. El dinero está en TU cuenta de Mercado Pago, no en EVA.

Devuélveselo desde mercadopago.cl → Tu negocio → Pagos → busca el pago → «Devolver».
Si prefieres dejarlo como adelanto del próximo período, dilo con {clientName} y regístralo
como pago del período siguiente desde «Cobros».

            ( Ver el pago )
```

- **Al alumno no se le manda nada automático** por el duplicado: EVA no sabe si el coach devolverá o
  lo dejará como adelanto, y prometerle un reembolso que depende del coach genera el reclamo que el
  módulo debe evitar. Si el coach devuelve, el reverso dispara **E11 + C7** por el camino normal.

---

## 6. Reglas transversales

### 6.1 Variantes por modo

| Bloque | `manual` | `mp_link` | `mp_subscription` |
|---|---|---|---|
| E0 | **sí** (bloque «Cómo pagas» = transferencia) | **sí** (bloque = link por ciclo) | **sí** (bloque = cobro automático) |
| Bloque «Cómo pagar» | **sí**: `transfer_instructions` en `pre-wrap` + `own_payment_link_url` en texto plano | no | no |
| CTA de E1/E2/E3/E4 | `Ver cómo pagar` → `/c/{slug}/pagos` | `Pagar {monto}` → `checkout_url` | `Ver mi plan` → `/c/{slug}/pagos` |
| E1-link | no aplica | **sí** (reemplaza E1) | no aplica |
| Frase «avisar que pagué» | **sí** en E2/E3/E4 | no (el webhook confirma solo) | no |
| «Mercado Pago reintentará» | **prohibido** | **prohibido** | permitido (E8) |
| E6/E7/E8 | no (E7 sí, sin llamada a MP) | no (E7 sí) | **sí** |
| E5 | sí (`source: manual`/`student_claim`) | sí (`source: mp_link`) | sí (`source: mp_subscription`) |
| E4/`ended` (R1) | **sí** | **sí** | **sí** |
| E11 / C7 (R9) | solo si el coach registra el reverso a mano | **sí** (webhook MP) | **sí** (webhook MP) |
| C8 duplicado (R9) | raro pero posible (dos registros manuales) | **sí** | **sí** |
| C2 / C2-bis (R3) | **sí** (es el modo del claim) | posible (el alumno pagó por fuera igual) | posible |

### 6.2 Variantes por gracia

- **Gracia 3**: E2 el `F+1`, E3 el `F+3`, E4 el `F+4`. E2/E3 dicen hasta cuándo sigue el acceso.
- **Gracia 0**: **E3 no existe**. E2 se manda el `F` con badge `ÚLTIMO DÍA` y copy «si el pago no
  entra hoy, mañana queda en pausa». E4 el `F+1`. Ningún correo menciona «días de gracia» — con
  gracia 0 esa palabra no aparece nunca.

### 6.3 Qué NO decir — lista cerrada, aplica a las 22 plantillas

1. Nada de **IVA**, ni neto/bruto (regla D5 del owner, repetida en
   `payment-dunning-templates.ts:8` y `addon-receipt-templates.ts:11-12`).
2. Nada de **«boleta» / «factura» / «documento tributario»** para nombrar el comprobante (s6 §8.4).
3. Ningún **precio de EVA** ni nombre de plan de EVA. El monto del alumno es del coach y sale de la
   fila del plan, nunca escrito a mano.
4. Ninguna **amenaza ni urgencia falsa**: sin countdown por horas, sin mayúsculas, sin «última
   oportunidad», sin «vas a perder tu progreso» (es falso).
5. Ninguna **etiqueta sobre la persona**: «moroso», «deudor», «incumplidor». Se describe el hecho.
6. Ningún **link a la app nativa ni a las tiendas**: nada de `eva://`, `apps.apple.com`,
   `play.google.com`. Los correos apuntan a la web (`https://www.eva-app.cl/...`) y punto.
7. Ninguna **afirmación no sostenible** («tu coach te está esperando», «recupera 5× más rápido»)
   — mismo contrato que `drip-templates.ts:19`.
8. Ninguna **frase que ponga a EVA como acreedor**: «te cobramos», «nuestro cobro», «paga a EVA».
   Siempre «tu plan con {coach}», «{coach} te cobra».
9. Ninguna **retención** en el correo de cancelación (Ley 21.398, baja simétrica).
10. Nunca **más de un `<a>`** (excepción declarada: el contrato íntegro de E6).
11. **R6 — nunca decir ni sugerir que se paga dentro de la app.** Prohibidos en los 22 correos:
    «paga desde la app», «abre la app para pagar», «toca aquí para pagar en tu teléfono», cualquier
    instrucción de pago con la app como sujeto. El pago ocurre por transferencia, por link de Mercado
    Pago o en la cuenta de Mercado Pago del alumno; el CTA de pago apunta **siempre** a
    `https://www.eva-app.cl/...` o al `init_point` de MP. Lo único que el alumno hace desde la app es
    **avisar que pagó** (R19) y ver estado, y así se redacta: «avísale desde «Mi plan»», nunca
    «paga desde «Mi plan»». En los correos al coach, configurar el cobro se dice **«desde el
    computador»** (mismo literal que el hint de R6), sin dominio y sin «abre la app».
12. **Ningún correo promete lo que EVA no controla**: que Mercado Pago fallará a favor del coach en
    un contracargo, que el coach devolverá un duplicado, ni un plazo de resolución de disputa.

### 6.4 Kill-switch y obligatoriedad

`EVA_COBROS_EMAILS_DISABLED` = CSV de `template_key`; `*` o `1` apagan todo. **Lo ignoran E5
(comprobante), E6 (confirmación art. 12 A) y E7 (confirmación de baja)** — regla aceptada en
DECISIONS-2 — **y, por extensión del writer, E0 y E11**: E0 es el aviso de apertura del cobro que
R21 hace obligatorio (apagarlo deja al alumno enterándose por el recordatorio de que le cobran) y
E11 informa que se movió plata ya cobrada (R9). Si el jefe quiere lo literal de DECISIONS-2, basta
sacar E0/E11 de la lista de `ignoreKillSwitch`: es un cambio de una línea, sin efecto en el diseño.
El resto se puede apagar sin deploy si un cron entra en loop. **Decisión del writer**: el switch existente `EVA_SALES_EMAILS_DISABLED` NO se
reutiliza — su tipo `SalesEmailEvent` es una unión cerrada de 3 valores
(`services/billing/sales-emails.service.ts:37`) y ampliarla mezcla venta con cobro.

### 6.5 Opt-out y consentimiento

- Los correos de cobro son **transaccionales**: nacen del contrato alumno↔coach, no de una lista de
  marketing. Gmail exime al transaccional puro del one-click unsubscribe (research/s7 §3.3), y el
  transporte no soporta headers custom (`send-email.ts:21-29`), así que no hay `List-Unsubscribe`.
- **Lo único dado de baja es el recordatorio previo** (E1 / E1-link), vía
  `client_billing_plans.reminder_opt_out_at` escrito por una server action del alumno desde
  `/c/{slug}/pagos` (toggle «Recibir recordatorios»). El pie de E1/E1-link lo dice en texto plano,
  sin gastar el `<a>` — mismo mecanismo que `DRIP_UNSUBSCRIBE_FOOTER` (`drip-templates.ts:51`).
- El resto de los correos lleva la frase de contexto, no de baja: `Recibes este correo porque
  entrenas con {coachBrandName} en EVA.` (calco de `transactional-templates.ts:491`).

### 6.6 Deliverability

1. **`replyTo` = coach en todos los correos al alumno.** Sin eso, la respuesta llega a EVA, que no
   puede ayudar (razón textual en `transactional-templates.ts:19-23`).
2. **Registrar rebotes**: extender `api/webhooks/resend/route.ts` para buscar en
   `client_email_ledger` cuando `findByProviderMessageId` no matchea en `coach_email_ledger`
   (`route.ts:5`, `:26-29`), **sin cambiar los códigos de respuesta** (503 sin secreto, 401 firma
   mala, 500 solo si la DB falla, 200 en todo lo demás). Hoy un alumno con casilla muerta recibiría
   recordatorios de plata para siempre y nos quema el dominio: registrar rebotes es requisito, no
   lujo.
3. **Bloqueo por rebote**: si la última fila del ledger para ese `client_id` es `bounced` o
   `complained`, `sendCobrosEmailOnce` devuelve `skipped_bounced` y el coach ve en la ficha
   «su correo rebota».
4. **Preview de Vercel**: **no setear `RESEND_API_KEY` en Preview** (precedente exacto:
   `RESEND_WEBHOOK_SECRET` se dejó fuera a propósito, `docs/operations/MANUAL_TASKS.md:61`). Además
   el cron chequea `VERCEL_ENV === 'production'` antes de enviar; en preview corre en modo `?dry=1`
   forzado.
5. **`?dry=1`** en `cobros-sweep` (patrón `api/cron/cap-nudge/route.ts:39-41`) devuelve `wouldSend`
   sin mandar nada. Se corre antes de abrir la beta.
6. **Espaciado 600 ms** y paginado PostgREST con `.order` estable (gotcha real:
   `api/cron/cap-nudge/route.ts:111-124`, sin orden una fila omitida = un correo perdido).
7. **Resumen siempre** en el `finally` del cron (`cron.cobros_sweep_ran`, `outcome: 'ok'|'aborted'`,
   contadores por template).
8. **Volumen**: 55 alumnos de coaches Pro hoy (STATS.md). Con 22 plantillas el techo teórico sigue
   en decenas de correos/día, muy por debajo de cualquier límite; el riesgo no es la cuota sino la
   reputación por rebotes. El único que puede repetirse a diario es **C2-bis**, y va al coach, tope
   5 días por claim (R3).

---

## 7. Push (OUTLINE §14)

Infra: `sendPushToClient(clientId, payload)` (`apps/web/src/lib/push.ts`), catálogo de constructores
en `apps/web/src/lib/push-events.ts`. Hay que **ampliar la unión `PushEventKey`** (`push.ts:17`,
hoy `'meal_reminder' | 'program_assigned' | 'checkin_received' | 'checkin_due'`) con los 6 nuevos;
el kill-switch `EVA_PUSH_DISABLED_EVENTS` (`push.ts:38-44`) los cubre sin tocar nada más. Todas
best-effort: jamás revertir una mutación de cobro porque falló una push.

`url` = path web (lo abre el service worker); `screen` = ruta expo-router del tap nativo
(`push.ts:24-27`; ejemplo vivo `push-events.ts:39-40`).

| # | Evento | Dest. | Título | Cuerpo | `url` | `screen` |
|---|---|---|---|---|---|---|
| P1 | `cobros_claim_received` | Coach | `{clientFirstName} avisó que pagó 💸` | `{monto} · toca para confirmar` | `/coach/cobros?alumno={clientId}` | `/coach/cliente/{clientId}` |
| P2 | `cobros_payment_received` | Coach | `Cobro recibido de {clientFirstName}` | `{monto} · entró a tu Mercado Pago` | `/coach/cobros?alumno={clientId}` | `/coach/cliente/{clientId}` |
| P3 | `cobros_daily_digest` | Coach | `{m} alumnos vencidos` | `{n} por cobrar esta semana · toca para revisar` | `/coach/cobros?filtro=vencidos` | `/coach/cobros` |
| P4 | `cobros_payment_confirmed` | Alumno | `Pago confirmado ✅` | `Tu acceso sigue activo hasta el {fechaCorta}` | `/c/{slug}/dashboard` | `/alumno/(tabs)/home` |
| P5 | `cobros_access_paused` | Alumno | `Tu acceso está en pausa` | `Escríbele a tu coach.` | `/c/{slug}/suspended?reason={unpaid\|ended}` | `/alumno/suspended` |
| P6 | `cobros_access_restored` | Alumno | `Tu acceso volvió 💪` | `Retoma donde lo dejaste.` | `/c/{slug}/dashboard` | `/alumno/(tabs)/home` |

Reglas:

- **Las tres push del alumno son solo ESTADO**: cero monto, cero link de pago, cero «paga acá»
  (R6). Idénticas en iOS y Android (nada de split). Una push «te toca pagar» en la pantalla bloqueada
  del teléfono es un CTA de compra a la vista del revisor de Apple.
- **P5 cubre los dos cortes (R1/R7)**: `reason: 'unpaid'` y `reason: 'ended'`. El **título y el
  cuerpo son idénticos** en ambos casos — el copy nativo del corte es siempre «Tu acceso está en
  pausa» (R1: la app nunca dice «terminó»); lo que cambia es el `reason` que viaja en el payload y
  en la URL, y que la pantalla de pausa usa para el texto de detalle. `/api/mobile/config` emite
  `studentAccess: { state:'blocked', reason:'unpaid'|'ended' }`: los binarios viejos muestran la
  pausa genérica (seguro) y el OTA agrega el matiz.
- **No hay push para E0, E11, C6, C7 ni C8.** E0 llega junto con el alta y no necesita interrupción;
  E11/C7/C8 son plata revertida o duplicada, y una push de eso en la lockscreen es alarmante y
  ambigua — el correo lo explica con el detalle que la push no puede llevar. El coach igual lo ve en
  el digest (C1) del día siguiente.
- **P4 no lleva monto** aunque el correo E5 sí: la notificación se ve en la lockscreen de un
  teléfono que puede estar en la mano de otra persona.
- **No existe push de recordatorio previo al alumno** (OUTLINE §14). El correo lo cubre.
- Las push del coach sí pueden llevar el monto: es su negocio, y la app del coach ya muestra montos
  de datos (la excepción angosta del guard `tests/mobile-no-prices.test.ts`, OUTLINE §7).
- White-label: P4/P6 pasan `brandName` y `iconUrl` con el logo del coach cuando
  `resolveStudentEmailBranding` lo habilita (patrón `notifyProgramAssigned`, `push-events.ts:52-68`).

---

## 8. Analytics

`capturePostHogServerEvent` (`lib/posthog/server-capture.ts:69`, nunca lanza, timeout 1500 ms) con
`cobros_email_sent { template, mode, surface }` — **solo cuando el outcome fue `sent`** (patrón
`api/cron/checkout-abandoned/route.ts:437-450`). `distinctId` = `coach_id` (convención del helper,
`server-capture.ts:34-47`). **Sin montos, sin `client_id`, sin correos** (OUTLINE §8).

---

## 9. Tabla resumen — 22 plantillas (13 alumno + 9 coach) + 6 push

Todos los días se evalúan por **umbral `≤`, nunca por igualdad de fecha** (R4); el dedupe lo hace la
`dedupe_key`, no el calendario. Los correos al alumno van al ledger nuevo `client_email_ledger`; los
del coach, a `coach_email_ledger` (donde el índice único es `(coach_id, template_key)` para siempre,
así que todo lo repetible lleva fecha o id en la key).

| ID | `template_key` | Disparador | Día / evento | Dest. | replyTo | `dedupe_key` | Kill-switch |
|---|---|---|---|---|---|---|---|
| **E0** | `cobro_activado` | server action: crear plan (R21) | al crear (paid_through = first_due_on, R2) | Alumno | coach | `cobro_activado:{plan_id}` | **no** (§6.4) |
| E1 | `cobro_recordatorio` | cron `cobros-sweep` | F-3 (`reminder_days`) | Alumno | coach | `cobro_recordatorio:{charge_id}` | sí |
| E1-link | `cobro_link` | cron, tras crear preference | F-5 (`mp_link`) | Alumno | coach | `cobro_link:{charge_id}:{preference_id}` | sí |
| E2 | `cobro_vencido` | cron · **suspendido con claim vivo (R3)** | F+1 (gracia 3) · F (gracia 0) | Alumno | coach | `cobro_vencido:{charge_id}` | sí |
| E3 | `cobro_ultimo_aviso` | cron · **suspendido con claim vivo (R3)** | F+grace (solo gracia > 0) | Alumno | coach | `cobro_ultimo_aviso:{charge_id}` | sí |
| E4 `unpaid` | `cobro_cortado` | cron (marca `cut_notified_at`) · **claim vivo difiere hasta 5 días (R3)** | F+grace+1 | Alumno | coach | `cobro_cortado:{charge_id}` | sí |
| **E4 `ended`** | `cobro_cortado` (`reason:'ended'`, R1) | cron: plan `canceled` con hoy > `paid_through` | F+1 tras cancelar | Alumno | coach | `cobro_cortado:ended:{plan_id}:{paid_through}` | sí |
| E5 | `cobro_confirmado` | `confirmCharge()` | evento | Alumno | coach | `cobro_confirmado:{payment_id}` | **no** |
| E6 | `susc_activada` | webhook `subscription_preapproval` authorized | evento | Alumno | coach | `susc_activada:{preapproval_id}` | **no** (exige consentimiento + parámetros del contrato, §1.5) |
| E7 | `susc_cancelada` | acción alumno/coach o webhook cancelled | evento | Alumno | coach | `susc_cancelada:{preapproval_id}` · `susc_cancelada:{plan_id}:{canceled_at}` (manual) | **no** |
| E8 | `cobro_rechazado` | webhook `subscription_authorized_payment` rechazado | evento | Alumno | coach | `cobro_rechazado:{mp_payment_id}` | sí |
| E9 | `plan_cambiado` | server action del coach | evento | Alumno | coach | `plan_cambiado:{plan_id}:{updated_at}` | sí |
| E10 | `cobro_reactivado` | `confirmCharge()` si venía de `unpaid` | evento | Alumno | coach | `cobro_reactivado:{payment_id}` | sí |
| **E11** | `cobro_revertido` | `private.cobros_revert_charge` tras reembolso/contracargo (R9) | evento | Alumno | coach | `cobro_revertido:{payment_id}:{reason}` | **no** (§6.4) |
| C1 | `cobros_digest:{fecha}` | cron, solo si hay algo | diario 09:00 CL | Coach | — | `cobros_digest:{yyyy-mm-dd}` | sí |
| C2 | `cobros_claim:{charge_id}` | claim del alumno (web o RN, R19) | evento | Coach | **alumno** | `cobros_claim:{charge_id}` | sí |
| **C2-bis** | `cobros_claim_pendiente` | cron, claim vivo sin resolver (R3) | **diario**, tope 5 días | Coach | **alumno** | `cobros_claim_pendiente:{charge_id}:{yyyy-mm-dd}` | sí |
| C3 | `cobros_pago:{payment_id}` | webhook MP | evento | Coach | — | `cobros_pago:{payment_id}` | sí |
| C4 | `cobros_mp_conectado:{conn}` | callback OAuth | evento | Coach | — | `cobros_mp_conectado:{connection_id}` | **no** |
| C5 | `cobros_mp_desconectado:{conn}:{reason}` | deauth desde MP / `invalid_grant` (R5) — lleva instrucciones para cancelar en el panel de MP | evento | Coach | — | `cobros_mp_desconectado:{connection_id}:{reason}` | sí |
| **C6** | `cobros_downgrade_free` | el coach baja a Free (R5); se manda **después** de cancelar sus suscripciones vivas | evento | Coach | — | `cobros_downgrade_free:{coach_id}:{yyyy-mm-dd}` | sí |
| **C7** | `cobros_reverso` | mismo evento que E11 (R9) | evento | Coach | — | `cobros_reverso:{payment_id}:{reason}` | sí |
| **C8** | `cobros_pago_duplicado` | segundo pago aprobado sobre cuota ya `paid` (R9, `status='duplicate'`) | evento | Coach | — | `cobros_pago_duplicado:{payment_id}` | sí |
| P1-P6 | ver §7 | — | — | — | — | sin ledger (best-effort) | `EVA_PUSH_DISABLED_EVENTS` |

**Lo que NO manda correo, a propósito:** el kill-switch global (R14) es temporal y no cancela nada,
así que no avisa a nadie; la desconexión de MP **iniciada desde EVA** se resuelve en el diálogo de la
UI (que dice, antes de confirmar, que se cancelarán todas las suscripciones vivas) y no repite C5;
archivar o eliminar a un alumno cancela su preapproval (R5) y se comunica en la propia acción, no por
correo aparte.

---

## 10. Los 8 tests que deben existir

Ubicación: `apps/web/src/lib/email/cobros-templates.test.ts` y
`apps/web/src/services/cobros/emails.service.test.ts` (convención vitest del repo: test hermano
junto al código, `maps/r9-analytics-tests-utils.md §5`).

1. **Render de las 22 plantillas sin precios de EVA ni palabras prohibidas.** Para cada builder, con
   un contexto fixture: el HTML **no** contiene `29.990`, `29990`, `/mes`, `IVA`, `boleta`,
   `factura`, `documento tributario`, `apps.apple.com`, `play.google.com`, `eva://`, ni
   `mailto:` a EVA. **No importar `assertNoPrices`** de `__tests__/no-prices.ts` (prohíbe `\$\s?\d`
   y ahí el monto del coach es legítimo; el guard es para correos al COACH, `no-prices.ts:4`) —
   dejarlo comentado en el archivo para que nadie lo agregue «por consistencia». Sí verificar
   `countLinks(html) === 1`, con la excepción declarada de `susc_activada`.

2. **Dedupe por período.** Con un ledger en memoria: dos llamadas a `sendCobrosEmailOnce` con el
   mismo `dedupeKey` → la segunda devuelve `skipped_duplicate` y **no** llama a Resend; con el
   `charge_id` del mes siguiente → `sent`. Test adicional del anti-patrón: una key **sin** el
   `charge_id` (`'cobro_recordatorio'` pelado) hace que el segundo mes no salga — el test lo
   documenta como regresión conocida (`coach-email-ledger.service.ts:66-67`).

3. **Exclusión de demo y de no-elegibles.** `sendCobrosEmailOnce` devuelve `skipped_demo` para
   `clients.is_demo = true`, y no envía para: alumno archivado/inactivo, alumno con `org_id` o
   `team_id`, coach sin tier Pro activo, coach de prueba (`isTestCoachEmail`), y alumno cuya última
   fila del ledger es `bounced`. Un caso por rama, todos verificando **cero** llamadas al transporte.

4. **`replyTo` correcto.** Los 13 builders del alumno devuelven `replyTo === coachEmail` y el service
   lo pasa a `sendTransactionalEmail`; los builders del coach **no** devuelven `replyTo`, salvo
   **C2 y C2-bis** que devuelven el correo del alumno. Caso borde: coach sin correo en GoTrue →
   `replyTo` `undefined` y el correo igual sale (fail-open) sin la frase «responde y le llega a
   {coach}».

5. **Ausencia de links a stores y a la app nativa, coherencia de modo, y R6.** Barrido sobre el HTML
   de las 22: todo `href` empieza con `https://www.eva-app.cl/`, con `https://` a un host de la
   allowlist de MP (solo en E1-link/E2/E3/E4 en modo `mp_link`), o es un `mailto:` al coach. Además:
   en modo `manual` y `mp_link` ningún cuerpo contiene «reintentar»/«reintentará»; con `grace_days = 0`
   el builder de E3 no se invoca y ningún cuerpo contiene la palabra «gracia».
   **R6 (regresión dura)**: ningún HTML de las 22 matchea `/pag(a|ar|as)[^.]{0,40}\b(app|aplicación|
   teléfono|celular)\b/i` ni contiene «desde la app» junto a un verbo de pago; el hint literal de
   `apps/mobile/lib/web-only-hint.ts` no aparece en ningún correo; y ningún correo contiene
   «eva-app.cl» **dentro** de un texto sobre configurar el cobro (ahí se dice «desde el computador»).

6. **E6 lleva el contrato íntegro embebido** (CA del art. 12 A, §1.5). (a) Con un registro fixture
   cuya versión rinde 40 líneas con acentos, `<`, `&` y saltos de línea: el HTML de E6 lo contiene
   **completo y en el mismo orden**, escapado, y el texto extraído del HTML es igual carácter por
   carácter a la salida de `renderCobrosContract`. (b) Con dos versiones en el registro
   (`v1`, `v2`) y un consentimiento en `v1`, el HTML rinde **v1** aunque `CONTRACT_VERSION` valga
   `v2`, y no cambia al mutar `coach_billing_settings.terms_version` — prueba de que E6 lee el
   consentimiento y el registro, no el anexo del coach ni la versión vigente.
   (c) Sin fila de consentimiento, o con `description`/monto/nombre/RUT ausentes, el builder
   devuelve `null` y `sendCobrosEmailOnce` no llama a Resend (`skipped_no_contract`), con log de
   alerta. (d) grep del propio archivo de templates: la cadena `coach_billing_settings` no aparece en
   `cobros-templates.ts`. (e) el HTML contiene el literal de retracto de §1.5 y el RUT del coach
   (R21 + DECISIONS-2). (f) **registro append-only**: un test de snapshot pinnea la salida de cada
   versión publicada, de modo que editar una versión vieja rompe el build.

7. **R3 — el claim suspende al alumno y presiona al coach.** Con una cuota vencida y un claim
   `claimed` vivo: `sendCobrosEmailOnce` devuelve `skipped_claim_open` para E2, E3 y E4, **no**
   escribe fila en el ledger y **no** llama al transporte; C2 salió una vez y C2-bis sale una vez por
   día (keys distintas por fecha) hasta el tope de 5 días. Rechazado el claim, el siguiente sweep
   manda el correo que tocaba (prueba de que el `skip` no consumió el dedupe). Confirmado el claim,
   salen E5 (+E10 si venía de `unpaid`) y no sale ningún E2/E3/E4 atrasado.

8. **R1 — `ended` vs `unpaid`.** (a) Plan `canceled` con `hoy ≤ paid_through`: el estado derivado es
   `ok`, E7 dice «tu plan termina el {paid_through}» y **no** sale E4. (b) `hoy > paid_through`: el
   estado es `ended`, sale **E4/`ended`** con el copy «Tu plan con {coach} terminó», sin monto, sin
   CTA de pago y con badge neutro; el HTML no contiene «pendiente», «ponte al día» ni `$`. (c) No
   salen E1/E1-link/E2/E3 para un plan `canceled`. (d) El payload de P5 lleva
   `reason: 'ended'` pero el título y el cuerpo de la push son idénticos a los de `unpaid` («Tu
   acceso está en pausa»). (e) Dedupe: E4/`unpaid` ya enviado ⇒ cancelar después no dispara un
   E4/`ended` sobre el mismo `paid_through`.

---

## 11. Decisiones del writer (resumen para el jefe)

1. **Nombres `cobros-*`** en vez de `client-dunning-*` (r4 §8.1): OUTLINE §15 fija «cobros» y ya
   existe `payment-dunning-templates.ts` del otro subsistema.
2. **`<meta name="color-scheme" content="light only">`** en `base-layout.ts` (una línea, beneficia a
   los 26 correos existentes) en vez de un tema oscuro.
3. **Calendario anclado en `resolveStudentBillingState`** (OUTLINE §2.1), no en la lectura literal de
   OUTLINE §4: con gracia 3, E3 el `F+3` y E4 el `F+4`. Con gracia 0, E2 se adelanta al día `F`.
4. **E9 con canal de rechazo** y, en `mp_subscription`, el cambio de monto **no** se aplica al
   preapproval vivo sin nuevo consentimiento (que re-dispara E6).
5. **E10 separado de E5** (OUTLINE §9 permitía fundirlos): dos noticias, dos ledgers, un template
   simple cada uno.
6. Menores: **C2 lleva `replyTo` = correo del alumno**; **E5/E6/E7 ignoran el kill-switch**; el
   opt-out cubre solo E1/E1-link.
7. **El contrato del art. 12 A es un template de EVA parametrizado, renderizado al enviar** desde
   `apps/web/src/lib/cobros/contract-template.ts` (registro append-only de `CONTRACT_VERSION`),
   sellado por `student_billing_consents.terms_version` (R21) y **embebido íntegro** en el HTML de
   E6. **No hay columnas `contract_text`/`contract_version`/`contract_rendered_at`** (§1.5): la
   versión previa de este documento las declaraba prerrequisito bloqueante, pero ninguna migración,
   tarea ni entrada de SPEC las creaba y DECISIONS-2 §EMAILS resolvió el punto por render
   parametrizado. Lo único nuevo en el DDL es **`client_billing_plans.description` (R21, ≤ 140)**,
   que sí es **prerrequisito bloqueante de W5** en la lista única de migraciones de
   `DATA-SECURITY.md §1` (R17) y en `TASKS.md`. E6 nunca lee el anexo del coach
   (`coach_billing_settings.terms_version`); sin consentimiento o sin parámetros, E6 no sale.

### Alineación con R1–R23 y DECISIONS-2 (esta pasada)

| Resolución | Qué cambió en este documento |
|---|---|
| **R1** | §3 con los seis estados y `ended`; **E4 pasa a tener dos `reason`** (`unpaid` / `ended`) con copy «Tu plan con {coach} terminó»; E7 dice «tu plan **termina** el {paid_through}»; la app nunca dice «terminó» (P5 idéntica en ambos motivos, con `reason` en el payload). |
| **R2** | `paid_through = first_due_on` al crear el plan; E0 sale ese día y el calendario arranca ahí (nunca `null`). |
| **R3** | Invariante §1.1.8 + `skipped_claim_open`; E2/E3/E4 suspendidos con claim vivo y corte diferido 5 días; **C2-bis** diario al coach («{alumno} avisó hace {n} días: confirmar o rechazar») + línea nueva en C2; test 7. |
| **R4** | §3: umbral `≤`, nunca igualdad de fecha; disparadores de E2/E3/E4 reescritos; nota en la tabla §9. |
| **R5** | **C5** reescrito con las instrucciones paso a paso para cancelar en el panel de MP cuando la desautorización llega desde MP (EVA ya no puede llamar a la API); **C6** «bajaste a Free: cancelamos tus cobros automáticos» (se manda después de cancelar, reporta fallos); §9 declara lo que a propósito no manda correo. |
| **R6** | Regla 11 de §6.3 + bullet en §0 + test 5: ningún correo dice ni sugiere que se pague dentro de la app; «avisar que pagó» sí, «pagar» no; a los coaches se les dice «desde el computador», sin dominio. |
| **R8/R9** | **E11** `cobro_revertido` al alumno (reembolso / contracargo, con la variante «sigue con acceso» si el retroceso de `paid_through` no lo deja `unpaid`); **C7** al coach; **C8** pago duplicado (`status='duplicate'`, `charge_id null`, `paid_through` no avanza dos veces). |
| **R13** | E11/C7 nombran `private.cobros_revert_charge(...)` como el origen del evento. |
| **R16** | La variante de E11 «sigue con acceso» contempla el prepago de N períodos. |
| **R19** | C2/C2-bis reconocen el claim desde web y RN. |
| **R21** | **E0** completo; `client_billing_plans.description` (≤ 140) reemplaza a `service_description` en todo el documento; `student_billing_consents` en §0 y §1.5; aviso previo corto en el primer checkout de `mp_link` y completo en la suscripción; retracto estándar dentro del template versionado + E6 con contrato estándar (monto, periodicidad, día de cobro, gracia, cancelación, responsable, nombre y **RUT** del coach). |

## 12. Dudas para el jefe

1. **Retracto — RESUELTO** por DECISIONS-2 §EMAILS: texto estándar (§1.5), dentro del template
   versionado, marcado **⚖️ VALIDAR CON ABOGADO** en `TESTING-LEGAL.md`. No bloquea nada; si el
   abogado lo cambia, se **agrega** una `CONTRACT_VERSION` y las versiones publicadas quedan
   intactas en el registro.
2. **Contrato íntegro en E6 — RESUELTO** por DECISIONS-2 §EMAILS: template estándar de EVA
   parametrizado (sin campo libre del coach en el primer tren), renderizado al enviar y **embebido
   íntegro** en el correo; el sello histórico es `student_billing_consents.terms_version`, no una
   columna congelada (§1.5, con su riesgo residual declarado). Sigue abierto solo **el texto
   inicial** y quién lo firma («contrato entre {coach} y {alumno}; EVA solo provee la plataforma»),
   tarea legal de W0/W7.
3. **Off-by-one del calendario — SIGUE ABIERTO.** §3 corta el `F+grace+1`; OUTLINE §4 leía «E4 en
   T+gracia». R1–R23 no lo zanjan. Si el jefe quiere cortar el `F+3` con gracia 3, se mueve la
   función de estado (`resolveStudentBillingState`), no los correos: este documento se ancla en el
   estado derivado, no en fechas escritas a mano.
4. **Conteo de plantillas — NUEVO.** DECISIONS-2 dice «16» pero enumerar R5/R9/R21/R3 da **22**
   (§0). Si el jefe quiere bajar el número, los únicos candidatos honestos a fusión son E10 dentro de
   E5 y C2-bis dentro de C1; ninguna obligación legal (E0, E6, E7, E11) se puede fusionar. Este
   writer recomienda dejar 22.
5. **Kill-switch de E0 y E11 — NUEVO.** Se los puso a ignorar `EVA_COBROS_EMAILS_DISABLED` por el
   mismo argumento que E5/E6/E7 (§6.4), pero DECISIONS-2 solo nombró esos tres. Confirmar o revertir:
   es una línea.
