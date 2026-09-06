# Auditoría de correos y crons — 2026-09-05

Fecha: 2026-09-05 · HEAD verificado: `5b4d99dd` (master = rnmobiledenuevo) · Datos LIVE: `coach_email_ledger`,
`admin_audit_logs`, Resend (dominio, webhook, 439 envíos en 14 días), PostHog `coach_registered` por plataforma.
Informe visual: artifact `fac8d7fa` (https://claude.ai/code/artifact/fac8d7fa-a8e3-41e2-9931-2ba86c7b76ae).
Método: 4 lectores en paralelo (crons, correos en código, cuenta Resend, docs) + crítico adversarial de solapes,
y verificación del jefe contra la base y los envíos reales.

> Conclusión corta: **casi no hay correos dobles.** El ledger `coach_email_ledger` y el cooldown de ventas
> funcionan. Lo que sí hay es un problema de gobierno: el drip «apagado» sigue con cola viva en Resend, la regla
> de higiene le esconde el «pásate a Pro» a la mitad de las altas nuevas, y W6 (correos por comportamiento) no
> vende. **Nada de este documento está implementado**: es diagnóstico + decisiones del owner + plan.

---

## 1. Hallazgos que gobiernan

- **Duplicados exactos: 0** (ningún coach recibió la misma `template_key` dos veces). El correo de cupo
  («Alcanzaste el límite de N alumnos») sale por evento (402 al agregar) y por barrido (`cap-nudge`), pero ambos
  comparten evento, ledger en `admin_audit_logs`, cooldown de 7 días y escalera 0/7/28: 56 envíos a 27 coaches sin
  repetir en ventana. Falsos positivos descartados: cupo vs `checkout-abandoned`, `north-star-weekly` vs
  `coach-kpi-snapshot`, fin de trial vs plan vencido (poblaciones disjuntas).
- **Solapes reales (chicos):** confirmación + bienvenida salen en el mismo segundo y se contradicen («confirma para
  activar» vs «ya está activa»); drip `day1_value` y W6 `behavior_no_client_2h` son el mismo correo con dos keys y
  el ledger no los cruza; los digests admin de `mp-reconcile` (10:00Z) y `paid-expiry` (12:30Z) van al mismo buzón
  sin dedupe y la divergencia de `ljfitness` (activo en DB, `pending` en MP) se repitió idéntica del 29-08 al 05-09;
  el dunning tiene dos ramas del webhook sin ledger; el botón manual de trial del panel usa los mismos builders que
  el cron sin barrera compartida; «Nuevo programa» web sin idempotencia vs app con `Idempotency-Key`.
- **El drip se agenda EN RESEND al alta** (`scheduledAt` por fila del ledger). `FREE_COACH_DRIP_ENABLED` (OFF desde el
  deploy 05-09 22:56Z, D11) solo frena altas nuevas: al cierre quedaban 30 filas `scheduled` de 20 coaches, hasta el
  19-09. Decisión del owner: dejarlas salir.
- **`drip-hygiene` (13:30Z) cancela los días 2/7/14 a todo coach con `email_verified_at` vacío a las 24 h del alta,
  aunque el día 1 le llegó entregado.** Altas Free del 23-08 al 05-09: 45. Verificadas 21 → 18 recibieron `day2_pro`.
  No verificadas 24 → **0** recibieron `day2_pro` (a 20 les llegó el día 1); 23 no recibieron NINGÚN correo de Pro.
  Registrados desde la app (PostHog, 8 vivos): 4 sí, 3 cancelados, 1 en cola. En la app no hay precios (regla de
  tiendas): el correo es su único canal. Los 24 que sí recibieron `day2_pro` siguen en Free.
- **W6 no vende**: sus 5 correos acompañan (aha, sin alumno 2 h, no volvió 24 h, alumno no entró 48 h, ayuda 7 d).
  El único correo de venta por calendario es `day2_pro`. `ONBOARDING_BEHAVIOR_EMAILS_DRY_RUN` exige
  `ONBOARDING_BEHAVIOR_EMAILS_ENABLED=true` primero (fail-closed). `enqueueBehaviorCheck` (aha en línea) no tiene
  call sites.
- **Población 0 hoy** en `trialing`, `past_due`/`paused` y `expired`: `trial-expiry`, `paid-expiry` y el dunning corren
  en vacío. `nutrition-cycles` corre con 0 ciclos activos y sin escritor desde el 29-07. `flow-reconcile` promete en su
  docblock un correo a `ADMIN_EMAILS` que no manda. El batch del 05-09 17:53Z «Dos cambios en EVA que tocan tus
  programas» (14 correos) es el aviso W6.5b del owner, enviado fuera del repo.
- **Resend 14 d:** 439 enviados, 411 entregados (93,6 %), 28 rebotes (6,4 %, casi todos transitorios, el grueso
  cuentas `@evatest.cl` que solo excluyen `cap-nudge`, `checkout-abandoned` y W6), 13 suppressions, 1 webhook con los
  7 eventos del handler, 0 templates y 0 automations en Resend, 2 broadcasts (agosto). Sin tracking de apertura.
- **Docs:** el RUNBOOK lista 12 de 15 crons (faltan `drip-hygiene`, `checkout-abandoned`, `north-star-weekly`) y se
  contradice sobre `purge-data` (tabla: diario; prosa: domingos). Chile pasa a UTC-3 el 06-09: todo corre una hora más
  tarde en reloj chileno; `nutrition-reminder` queda a las 21:00.

## 2. Los 15 crons (UTC · Chile hasta el 05-09 → desde el 06-09)

| Cron | UTC | Chile | Manda | Dedupe | Estado |
|---|---|---|---|---|---|
| `onboarding-behavior` | `0 * * * *` | cada hora | correo coach (W6 ×5) | ledger por key | apagado por flag |
| `checkout-abandoned` | `15 * * * *` | cada hora | correo coach | ledger, 1 vez | vivo (2 envíos / 260 corridas) |
| `cap-nudge` | `0 13 * * *` | 09:00 → 10:00 | correo coach | ventas + cooldown 7 d | vivo (50 envíos desde 22-08) |
| `drip-hygiene` | `30 13 * * *` | 09:30 → 10:30 | cancela | por fila | vivo, regla dañina (ver §1) |
| `mp-reconcile` | `0 10 * * *` | 06:00 → 07:00 | digest admin + aviso SERNAC | ninguno | repite divergencia |
| `flow-reconcile` | `0 11 * * *` | 07:00 → 08:00 | nada (docblock miente) | — | asimétrico con MP |
| `nutrition-cycles` | `0 11 * * *` | 07:00 → 08:00 | nada | columnas | 0 ciclos, sin escritor |
| `trial-expiry` | `0 12 * * *` | 08:00 → 09:00 | correo coach | array en fila | población 0 |
| `paid-expiry` | `30 12 * * *` | 08:30 → 09:30 | correo coach + digest | ancla por período | población 0 |
| `checkin-reminder` | `0 14 * * *` | 10:00 → 11:00 | push alumno (días 8 y 15) | igualdad exacta | vivo, pierde el hito si falla |
| `nutrition-reminder` | `0 0 * * *` | 20:00 → 21:00 | push alumno | log del día | vivo, hora tardía |
| `purge-data` | `0 3 * * *` | 23:00 → 00:00 | nada | corte de fecha | vivo, diario desde 05-09 |
| `coach-kpi-snapshot` | `30 4 * * *` | 00:30 → 01:30 | nada | upsert | vivo |
| `mirror-exercise-thumbnails` | `0 4 * * *` | 00:00 → 01:00 | nada | — | vivo |
| `north-star-weekly` | `0 13 * * 1` | lunes 09:00 → 10:00 | correo owner | semanal | vivo (llegó el 31-08) |

Fuera de Vercel no hay nada programado (0 GitHub Actions con `schedule`, 0 `pg_cron`, 0 Edge Functions).

## 3. Decisiones del owner (05-09)

| # | Decisión | Elegido |
|---|---|---|
| D1 | Regla de `drip-hygiene` | Cancelar SOLO por rebote/queja real (webhook de Resend), no por «no verificado» |
| D2 | Los 24 coaches sin correo de Pro | Reenvío único de `day2_pro` con key propia en el ledger, excluyendo `@evatest.cl`, 600 ms entre envíos; mostrar la lista antes de enviar |
| D3 | Calendario cuando W6 encienda | Queda SOLO `day2_pro`; se retiran day1 (duplica W6), day7 y day14 |
| D4 | Digests admin | Silenciar si el contenido es idéntico al de ayer + cerrar la divergencia de `ljfitness` |
| — | Cola del drip (30 filas) | Dejarla salir |
| — | W6 | Ensayo: `ONBOARDING_BEHAVIOR_EMAILS_ENABLED=true` + `ONBOARDING_BEHAVIOR_EMAILS_DRY_RUN=true` en Vercel Production + redeploy (lo setea el owner) |

## 4. Plan en tres tandas

1. **Destrabar el «pásate a Pro» — HECHA el 06-09 03:41Z** (`00061836`…`2bdd9aa5`, deploy `dpl_CijuEuGmwmmkuHVWVzURuDVNrSTT`):
   D1 (`drip-hygiene` cancela solo por rebote real del día 1) · D2 (`scripts/day2-pro-catchup.ts`: 22 correos
   agendados para el 06-09 13:00Z con key `day2_pro_catchup`, que también entra en `DRIP_SALES_KEYS`) ·
   `isTestCoachEmail` en el correo de cupo por evento y en la bienvenida · D4 (digests con supresión por hash y
   divergencia de `ljfitness` cerrada en LIVE: `subscription_mp_id` a null con auditoría) · **extra por el ensayo
   de W6** (83 correos de golpe): corte de lanzamiento `BEHAVIOR_LAUNCH_CUTOVER` = 06-09 y 24 h entre correos
   a un mismo coach (el aha exceptuado). Gates en [TEST_STATUS](../testing/TEST_STATUS.md).
2. **Higiene de lo que ya existe (~1 día-agente):** bienvenida única con el botón de confirmar adentro · dedupe del
   dunning por período reusando `sendSalesEmailOnce` · botón manual de trial escribe `trial_warning_days_sent` o se
   retira · retirar el «anuncio masivo» del panel admin (copy de junio, sin freno) y canalizar masivos por broadcast de
   Resend · `flow-reconcile` deja de prometer un correo que no manda · throttle en el archivado masivo · RUNBOOK con
   los 15 crons y `purge-data` diario · `nutrition-reminder` a `0 22 * * *` · retirar `nutrition-cycles`.
3. **Encender W6 sobre terreno limpio:** dry-run → leer «a quién habría mandado» en los logs → aprobar copy → quitar
   el dry-run · cablear el aha en línea · retirar day7/day14 (D3).

Regla para lo que venga: todo correo al coach pasa por `coach_email_ledger` (una fila por coach y key, cancelable en
Resend), excluye `@evatest.cl` y demo, y tiene dueño en el RUNBOOK. Lo que no cumpla eso no se manda.
