---
status: active
owner: product-engineering
last_verified: "2026-08-21"
canonical: false
---

# PLAN — Embudo Free → Pro (8 waves, ~37 h + RN visual)

Orquestación: el jefe (modelo principal) planifica, escribe instrucciones por worker y juzga; workers Opus para
implementación guiada, Sonnet para swaps mecánicos. Cada wave cierra con gates proporcionales y la suite completa
corre UNA vez antes del push. **Aprobación del owner entre W1 y W2, y antes del OTA de W5/W6.**

## Orden obligado (sale de las 7 colisiones de la SPEC)

```text
W0 desatascar → W1 cap-nudge → W2 canal correo → W3 ?next= → W4 alta móvil
→ W5 packages/tiers + OTA → W6 verdad y visual en la app (mismo OTA) → W7 blindar + PostHog → W8 activación (opcional)
```

## Waves

| Wave | Qué | Archivos clave | Workers | Gate de salida |
|---|---|---|---|---|
| W0 | `void` → `await` en los 4 call sites del correo de cupo | `coach/clients/_actions/clients.actions.ts:128` · `coach/clients/import/_actions/import.actions.ts:201` · `api/mobile/coach/clients/route.ts:212` · `api/mobile/coach/clients/import/route.ts:270` | jefe (4 líneas) | vitest de `sales-emails.service` (pinnea «nunca lanza») + typecheck |
| **W1** | Cron `cap-nudge` diario con escalera 0/7/28 d; variante `sweep` del correo; entrada #11 en `vercel.json`; tests; RUNBOOK | nuevo `api/cron/cap-nudge/route.ts` (+ `cap-nudge.ts` puro + `route.test.ts` + `vercel-cron.test.ts`) · `lib/email/sales-templates.ts` · `services/billing/sales-emails.service.ts` · `vercel.json` · `docs/operations/RUNBOOK.md` | 1 Opus (route+tests) + 1 Opus (template/service) + juicio | vitest dirigido (cron + service + templates), lint, typecheck, `docs:check`, build |
| W2 | Canal correo completo: endurecer `templateByKey`; drip rediseñado para Free = 1 (D+1 valor · D+2 precio+link · D+7 nutrición · D+14 última llamada, precios desde el catálogo); `assertNoPrices` sobre drip y transaccionales; `subscriptionUrl` + bloque «Cómo funciona EVA» en la bienvenida; Google móvil manda bienvenida+drip con `await`; purga manual de la cola de Resend | `lib/email/send-drip-sequence.ts:59-65` · `drip-templates.ts` · `sales-templates.test.ts:26-31` · `transactional-templates.ts:169-209` · `api/mobile/auth/complete-coach-onboarding/route.ts:165` | 1 Opus (drip+guard) + 1 Opus (bienvenida + Google móvil) + operación | tests de templates/drip, typecheck, `docs:check`; lista de correos cancelados en Resend |
| W3 | `?next=` con allowlist en el redirect de `/coach`; `redirectUrl.search = ''`; `fd.set('next', …)` en el form y en el camino Google; tests de `safeNext` ANTES | `proxy.ts:426-431` · `proxy.ts:1240-1258` · `login/page.tsx:12` · `CoachLoginForm.tsx:41-46` · `post-google-auth.ts:33` | 1 Opus | tests nuevos de `safeNext` + e2e manual login→checkout |
| W4 | Alta móvil: devolver `uid`, endpoint de reenvío con los 7 guards de `resend.actions.ts`, botón en `verify-email` | `register-coach-free/route.ts:185` · `api.ts:138` · `verify-email.tsx:66` · `resend.actions.ts` (leer entero) | 1 Opus | tests del endpoint (identidad por `uid`, `pending_email`, rate-limit), tsc mobile |
| W5 | `packages/tiers` + compliance en un solo OTA: sello «Hecho con EVA» → landing sin precios; `studentCountLabel` en el muro; `TIER_LABELS` del package; `/mes` anual; test que prohíbe `monthlyPriceClp` en `apps/mobile` | `packages/tiers/index.ts:430` · `pricing-v3.test.ts:78-92` · `email-brand.test.ts:59,68,74` · `CreateClientModal.tsx:292` · `perfil.tsx:30-34` · `SubscriptionContent.tsx:791` · `apps/mobile/lib/coach-tiers.ts` | 1 Opus (web/packages) + 1 Opus (RN) | tests de tiers/email-brand, tsc ×2, `check:tokens`, `expo export` android |
| W6 | La app dice la verdad y lo hace visual: predicado de módulos, muro de cupo rediseñado (+ archivar + línea Android), medidor de cupo, Mi plan = verdad + «Actualizar estado» + celebración, «¿Dudas con tu cuenta?» mailto, «Ver mi plan» ×3, botón «Abrir EVA» en el éxito del checkout web | `subscription.tsx:153,277-279` · `modules.tsx:209` · `CreateClientModal.tsx:284-303` · `ProgresoTab.tsx:836` · `BuilderDayStrip.tsx:487` · `verify-email.tsx:16` · mapa completo en TASKS | 2 Opus RN (muro+medidor / Mi plan+celebración) + 1 Opus web | tsc mobile, tests de contrato, QA device del owner light/dark × marca EVA/custom × iOS/Android |
| W7 | Blindar y medir: ficha ASC («Sitio web del desarrollador» → landing que convierte; copy «herramienta invitada»), `platform` en `coach_registered`, regla permitido/prohibido a `apps/mobile/AGENTS.md`, Notes for Review (EN, 3.1.3(f), 3 cuentas demo) | `register-coach-free/route.ts` · `complete-coach-onboarding/route.ts` · `apps/mobile/AGENTS.md` · `docs/operations/APP_REVIEW_NOTES.md` | 1 Sonnet (instrumentación) + jefe (textos) | PostHog muestra `platform`; `docs:check` |
| W8 | Activación (el agujero real: 23/40 sin alumno). Candidatos: onboarding que no termina sin el primer alumno · D+1 con link de invitación listo · `/join` adelante · estados vacíos del funnel (artifact `04324b08`) | a estimar | decisión del owner | — |

## Entrega y OTA

- Ningún cambio exige binario nuevo. W5+W6 salen en **un solo OTA** a los tres runtimes (1.1.0 / 1.1.1 / 1.1.2),
  `--platform android` y `--platform ios` por separado (`--platform all` falla), vía GH Actions `mobile-ota.yml`,
  solo desde rama con master mergeado (`rnmobiledenuevo` tiene commits sin merge: mergear primero).
- Web: push a `master` por wave o en dos tandas (W0–W4 / W5–W7). Nada de push, deploy ni OTA sin pedido explícito.
- Kill-switch del canal: `EVA_SALES_EMAILS_DISABLED=client_limit_reached` apaga evento y cron sin deploy.
- Primera corrida del cron: `GET /api/cron/cap-nudge?dry=1` con el Bearer desde un entorno seguro → lista de slugs
  sin enviar; luego la corrida real del día siguiente (o manual sin `dry`).

## Gates por wave

`pnpm lint` · `pnpm typecheck` · `pnpm test` (dirigido por wave; completo una vez pre-push) · `pnpm build` ·
`pnpm docs:check` · `pnpm check:tokens`. RN además: `pnpm --filter @eva/mobile exec tsc --noEmit` y
`expo export --platform android`. Lint y vitest NO cubren `apps/mobile`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Spam a coaches Free «en cupo» permanente (11 con 1/1) | escalera 0/7/28 por nivel de cupo; cooldown del service como 2ª barrera; kill-switch |
| Copy «intentaste agregar» a quien no intentó | variante `sweep` en la plantilla (W1) |
| Correo aterriza en dashboard y no en checkout | W3 antes de W5; URL del correo con `?next=` y `utm_source=cap_email` |
| Cola de drip vieja en Resend sigue saliendo | purga manual (W2) + ledger local de `providerMessageId` en el mismo PR |
| `proxy.ts` sin tests | tests de `safeNext` primero (W3) |
| OTA parcial (solo 1.1.2) no llega al público | procedimiento de 3 runtimes de `MOBILE_RELEASES_OTA.md` |
