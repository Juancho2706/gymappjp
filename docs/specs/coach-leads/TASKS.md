---
status: draft
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# TASKS — Solicitudes al coach (`coach_leads`)

Orden ejecutable. Contexto en [SPEC.md](./SPEC.md) y [PLAN.md](./PLAN.md).
Convención: `[ ]` pendiente · `[x]` hecho con evidencia real · `[~]` parcial (anotar qué falta).

**Estado 21-08: W1 y W2 EN EJECUCIÓN** (web). W3 y W4 no arrancan.

## W1 — DDL + `/join` solicitud + correo (en ejecución 21-08)

- [ ] W1.1 Migración `supabase/migrations/20260821024000_coach_leads.sql` con la tabla completa
      del SPEC: constraints de largo, `coach_leads_contact_required`, índice
      `(coach_id, status, created_at desc)`, RLS ON, política única de SELECT
      (`coach_id = auth.uid()`), `revoke all from anon, authenticated` + `grant select to
      authenticated`, trigger `before update` con `public.handle_updated_at()` (función existente).
      **Solo se escribe el archivo — aplicar en LIVE es del jefe.**
      - DoD: idempotente (correrla dos veces no falla); sin `grant update`; sin política de
        insert/update; revisada contra el protocolo aditivo-en-LIVE de `AGENTS.md`.
- [ ] W1.2 `database.types.ts`: `coach_leads` Row/Insert/Update.
      - DoD: `pnpm --filter @eva/web exec tsc --noEmit` verde con los actions ya escritos.
- [ ] W1.3 `requestJoinAction(inviteCode, prev, formData)` en el módulo de actions de `/join`.
      - DoD: orden verificable rate limit → Turnstile → Zod → `resolveInvite` (rechaza no
        standalone) → `resolveJoinReferral` → dedup → insert service role → correo → PostHog;
        devuelve `{ success: true }` tanto en insert nuevo como en dedup.
- [ ] W1.4 Turnstile idéntico a `/register` (Script + `div.cf-turnstile` + verificación server con
      `TURNSTILE_SECRET_KEY`, incluido el camino sin site key).
      - DoD: diff comparado línea a línea contra `register.actions.ts`; ningún comportamiento
        nuevo inventado.
- [ ] W1.5 Dedup 7 días (mismo coach + mismo phone o email, status `new`/`contacted`).
      - DoD: test unitario de la consulta/ventana; el segundo envío no inserta y responde el
        mismo éxito (no filtra que ya existía).
- [ ] W1.6 `lib/email/coach-lead-notification.ts` (`notifyCoachOfLead`): email del coach vía
      `admin.auth.admin.getUserById`, HTML escapado, botón «Escribir por WhatsApp» (`wa.me` con
      el normalizador), `mailto:`, mensaje, origen (tarjeta de {alumno} vs código), CTA
      «Ver solicitudes» → `${appUrl}/coach/clients?solicitudes=1`.
      - DoD: `await` + try/catch fail-open (un fallo de correo no rompe la solicitud); test del
        normalizador con `+56 9…`, `09…`, `9…` y basura.
- [ ] W1.7 Borrar `lib/email/coach-join-notification.ts` y todos sus usos/tests.
      - DoD: `grep -rn "coach-join-notification"` sin resultados; tests verdes.
- [ ] W1.8 UI de `/join/[invite_code]` standalone: formulario «Solicitud» (nombre, WhatsApp
      obligatorio, correo, mensaje ≤500, checkbox de consentimiento 21.719), inputs ocultos
      `ref`/`src`/`k`, estado de éxito con el copy del SPEC y link «¿Ya tienes cuenta? Entrar».
      - DoD: dark mode + `--theme-primary` correctos; sin emojis; errores con mensaje claro;
        el submit queda deshabilitado sin consentimiento.
- [ ] W1.9 `joinViaInviteAction`: standalone → `{ error: 'Para entrenar con este coach envía una
      solicitud.' }`, sin crear nada.
      - DoD: test que lo cubre; team/org siguen creando el alumno igual que antes.
- [ ] W1.10 Evento `coach_lead_received` (`distinctId: coachId`, props `referred`, `card_kind`,
      `source`) con `capturePostHogServerEvent` y `await`.
      - DoD: sin datos de salud ni PII en props.
- [ ] W1.11 Gates puntuales de W1: `pnpm --filter @eva/web exec tsc --noEmit`,
      `npx vitest run <archivos tocados>`, `npx eslint <archivos tocados>`.
      - DoD: salida real pegada en el reporte (números, no «verde»).

## W2 — Panel «Solicitudes» del coach (EJECUTADA 21-08, sin commit)

> Notas de ejecución (21-08):
> - W2.1 quedó en `_data/leads.queries.ts` con `createClient()` directo, IGUAL que su hermano
>   `_data/clients.queries.ts` de la misma carpeta: no se inventó un service/repository para una
>   sola lectura cuando el patrón vigente del directorio del coach no lo tiene.
> - W2.7: el `?solicitudes=1` está implementado (abre la sección + `scrollIntoView`), pero la
>   verificación en NAVEGADOR con la URL del correo NO se corrió — queda como QA pendiente.
> - Gates corridos: `tsc --noEmit` (@eva/web) exit 0; `vitest run` 3 archivos / 11 tests passed;
>   `eslint` sobre los 8 archivos tocados exit 0. Suite completa y `build` NO corridos.

- [x] W2.1 Lectura `_data → service → repository` con el cliente del usuario (RLS), filtrando
      `status in ('new','contacted')` ordenado por `created_at desc`.
      - DoD: cero uso de service role en el camino de lectura; `check:nutrition-v2-boundaries` no
        aplica pero la regla de capas sí — verificado en revisión de diff.
- [x] W2.2 Sección «Solicitudes» en `/coach/clients`, oculta si no hay filas: nombre, «hace X»,
      botón WhatsApp, correo, mensaje, chip «por tarjeta de {referente}».
      - DoD: dark mode + white-label; responsive en 360 px; sin emojis.
- [x] W2.3 `markLeadContactedAction` y `dismissLeadAction` (service role, previa verificación de
      que el lead es del coach autenticado) + `revalidatePath`.
      - DoD: intentar con un lead ajeno devuelve error y no muta nada (test).
- [x] W2.4 `CreateClientModal` acepta `initialValues` opcional (full_name/email/phone).
      - DoD: los usos existentes compilan y se comportan igual sin la prop.
- [x] W2.5 `markLeadConvertedAction(leadId, clientId)`: `status='converted'`,
      `converted_client_id`, y COPIA de `referred_by_client_id`/`referral_source`/
      `referral_card_kind` a la fila de `clients` (service role).
      - DoD: verificado que la conversión de un lead con atribución deja las tres columnas en
        `clients`; sin atribución no escribe nulos encima de datos previos.
- [x] W2.6 Eventos: `coach_client_referred` (solo si había atribución) y `coach_lead_converted`
      (`referred`), ambos con `await`.
- [x] W2.7 `?solicitudes=1` hace scroll/abre la sección (es el destino del CTA del correo).
      - DoD: probado con la URL exacta del correo.
- [x] W2.8 Gates puntuales de W2 (mismos comandos que W1.11) + revisión de diff del jefe.

## W3 — RN (no arrancada)

- [ ] W3.1 `GET /api/mobile/coach/leads` con el contrato en `packages/*` (sin duplicar tipos).
- [ ] W3.2 Lista de solicitudes en el tab de clientes de la app del coach + acciones contactado/
      descartar/convertir.
- [ ] W3.3 Push al coach cuando entra una solicitud (reusar la infra de push existente).
- [ ] W3.4 Decidir si entra por OTA o exige binario, y anotarlo en `MOBILE_RELEASES_OTA`.

## W4 — Invitar alumno → `/join` (no arrancada)

- [ ] W4.1 El sheet «Invitar alumno» del coach emite `/join/{código}` (un solo link en
      circulación) y el QR de la tarjeta se revisa contra eso.
- [ ] W4.2 Retención/purga de leads: decisión del owner + implementación + mención en la política
      de privacidad.

## Definition of Done universal

- [ ] `pnpm --filter @eva/web exec tsc --noEmit`
- [ ] Tests dirigidos de los archivos tocados
- [ ] `_data` sin llamadas Supabase de datos de feature saltándose services/repository
- [ ] Server actions validan con Zod y verifican pertenencia antes de mutar
- [ ] Mutaciones llaman `revalidatePath()`
- [ ] Dark mode y white-label revisados en toda UI nueva
- [ ] Migración aditiva, idempotente y NO aplicada por el ejecutor
- [ ] Documentos canónicos afectados actualizados (`CURRENT.md`, y `MOBILE_PARITY` cuando entre W3)
