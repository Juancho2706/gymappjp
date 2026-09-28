# Incidente: las renovaciones de Flow no llegaban a EVA — 2026-09-28

Fecha: 2026-09-28 · Base: `rnmobiledenuevo` @ `e1eb9693` · Datos LIVE: `coaches`, `subscription_events`,
`billing_snapshots`, `admin_audit_logs`, API Flow producción (solo lectura salvo lo indicado), borde de
Vercel/Cloudflare probado con `curl`.

> Conclusión corta: **Flow siempre cobró solo; lo que fallaba era el aviso a EVA.** El plan
> `eva_pro_monthly_29990` (y el retirado `eva_starter_monthly_19990`) se crearon con el `urlCallback`
> `https://www.eva-app.cl//api/payments/flow/webhook?...` (doble barra). El borde de Vercel responde 308 a
> los paths con `//` y Flow no sigue redirecciones ⇒ ninguna renovación de esos planes llegó nunca. El único
> aviso de Flow procesado en la historia fue el de MDR (02-09, plan `eva_pro_monthly_14995`, creado ese día con
> la URL buena).

## Qué pasó

- **Causa:** `NEXT_PUBLIC_SITE_URL` tenía slash final cuando `olympuswolf` creó el plan de $29.990 (05-08).
  `ensurePlan` es idempotente y nunca actualiza un plan existente, y Flow no deja editar el `urlCallback` de un
  plan con suscriptores (doc `plans/edit`: solo `trial_period_days`) ⇒ el error quedó horneado.
- **Primer impacto:** `olympuswolf` llegó a su renovación el 05-09. Flow generó la invoice 7431240, la intentó
  4 veces, se rindió y dejó la sub en `status=1` con `morose=1`. EVA nunca se enteró y el backstop
  `paid-expiry` la leía «viva» ⇒ **Pro gratis 24 días**.
- **Por qué nadie lo vio:** `flow-reconcile` alertó TODOS los días desde el 05-09 (`coach.flow_period_not_advanced`)
  pero solo escribía `admin_audit_logs` (no mandaba correo, pese a su comentario); el digest de `paid-expiry`
  salió una vez y después se autosuprimió por contenido idéntico (D4).

## Qué se hizo (28-09)

| Acción | Dónde | Estado |
|---|---|---|
| Cancelar la sub de `olympuswolf` (`at_period_end=0`) | Flow | ✅ status 4, sin próxima invoice |
| `olympuswolf` ⇒ `expired`, gracia de alumnos desde el corte | DB (audit `coach.paid_expired_manual`) | ✅ |
| Correo «Tu plan venció» (plantilla real) | Resend, ledger `coach.sales_email_plan_expired` | ✅ |
| URL Rewrite Rule «Flow webhook doble barra»: `raw.http.request.uri.path eq "//api/payments/flow/webhook"` (host www) ⇒ `/api/payments/flow/webhook`, query intacta | Cloudflare | ✅ `//api/...` responde 401 (llega a la ruta); otras rutas `//` siguen 308 |
| Token del plan 29990 == token del plan 14995 (que funcionó en vivo) | API Flow | ✅ comparado sin imprimirlo |
| Plan `eva_pro_monthly_v2_29990` (URL buena) | Flow | creado, **sin uso** |
| Migrar las subs a un plan nuevo | — | ❌ descartado: `changePlanPreview` mostró que el cambio inmediato reinicia el ciclo y cobra prorrateo (Movens $25.991); `startDate` no cambia la preview |

Gotcha de Cloudflare: con `http.request.uri.path` la regla NO matchea (Cloudflare junta las barras antes de
evaluar); hay que usar el campo `raw.`.

## Código (commit de este incidente)

- `lib/payments/flow-webhook-url.ts`: único constructor de la URL (sin slash final) + comparador de `urlCallback`.
- `paid-expiry` regla 5: sub Flow morosa **sin reintentos pendientes** ⇒ cancelar en Flow y recién ahí expirar
  (si la cancelación falla, queda en alerta). Morosa con reintentos ⇒ alerta.
- `flow-reconcile`: alerta de morosas, revisión del `urlCallback` de cada plan en uso y **digest por correo** a
  `ADMIN_EMAILS` con el mismo dedupe D4.

## Pendiente

- **02-10:** renovación de Movens (plan 29990) ⇒ debe aparecer `flow:authpay:invoice:<id>` en
  `subscription_events` y avanzar `current_period_end`. Si no, buscar 401/308 en los logs de Vercel.
- No se sabe si Flow avisa los cobros **fallidos** por el `urlCallback`; por eso la regla 5 de `paid-expiry`.
