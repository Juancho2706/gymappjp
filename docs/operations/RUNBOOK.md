# EVA — Runbook de Incidentes

> Firmaste SLA 99% mensual con clientes enterprise (~7.3h downtime/mes permitido).
> Este documento es la respuesta al "¿qué hago a las 2am cuando algo está roto?"

---

## Diagnóstico inicial (siempre primero)

1. **UptimeRobot** → revisar qué monitor disparó la alerta
2. **Supabase Status** → https://status.supabase.com
3. **Vercel Status** → https://www.vercel-status.com
4. **Sentry** → sentry.io → proyecto `eva-web` → últimos errores
5. **PostHog** → ver si hay drop en eventos activos

---

## P0 — Producción completamente caída (usuarios no pueden acceder)

**Síntoma:** UptimeRobot alerta `eva-app.cl` o `enterprise.eva-app.cl` down. Responde != 200.

### Paso 1: Identificar la causa

```
¿Supabase Status muestra incidente? → Sí → Esperar. No hay rollback posible.
¿Vercel Status muestra incidente?   → Sí → Esperar.
¿Ambos OK?                          → El problema es código propio → Paso 2
```

### Paso 2: Rollback inmediato (si es código)

```
Vercel Dashboard → Deployments → deployment anterior → ⋯ → "Promote to Production"
→ Rollback en < 2 minutos sin tocar código
```

### Paso 3: Notificar clientes enterprise (< 15 min desde alerta)

Mensaje WhatsApp para el grupo de cada org:
```
Hola [Nombre], estamos al tanto de un problema técnico en EVA ahora mismo.
Nuestro equipo ya está trabajando en ello.
ETA estimado: [X minutos / en proceso de diagnóstico].
Les avisamos cuando esté resuelto.
```

### Paso 4: Investigar causa raíz

```bash
# Ver logs de la última hora en Vercel
vercel logs eva-app.cl --since 1h

# Sentry → proyecto eva-web → Issues → Last 1h → ordenar por frequency

# Supabase Dashboard → Logs → API / Auth / DB
```

### Paso 5: Post-mortem (dentro de 24h del incidente)

Documentar en el grupo WhatsApp del cliente:
- Qué pasó
- Cuánto tiempo duró
- Qué se hizo para resolverlo
- Qué se hace para que no vuelva a pasar

---

## P1 — Feature rota (acceso funciona, pero X falla)

**Síntoma:** Org admin reporta que no puede invitar coaches / CSV import falla / asignación no guarda.

### Protocolo

1. **Reproducir en staging** — nunca debuggear en producción directa
2. **Sentry** → buscar el error por mensaje o URL del endpoint
3. **Supabase Dashboard → Logs → API** → filtrar por la tabla o función relevante
4. Si es migración mal aplicada → ver rollback SQL en `supabase/migrations/XXXX_name.rollback.sql`
5. Fix en `v2/enterprise` → PR → CI verde → merge → deploy automático Vercel

**Comunicación (< 2h en horario hábil):**
```
"Identificamos el problema con [feature]. Fix en proceso, ETA [X horas].
Mientras tanto: [workaround si existe]."
```

---

## P2 — Performance degradada (lento pero funciona)

**Síntoma:** `/coach/clients` tarda >3s. Pool de clientes no carga.

1. **Vercel Analytics** → Web Vitals → identificar ruta lenta
2. **Supabase Dashboard → Performance** → slow queries
3. `EXPLAIN ANALYZE` en Studio local replicando la query
4. Candidatos usuales: RLS subquery sin índice, `SELECT *` en query grande, missing trgm index

---

## Comunicación SLA

| Severidad | Tiempo máximo para notificar | Canal |
|---|---|---|
| P0 (todo caído) | 15 minutos | WhatsApp grupos enterprise |
| P1 (feature rota) | 2 horas en horario hábil | WhatsApp + email si no responden |
| P2 (lento) | 24 horas | Proactivo si dura >30 min |

**Horario hábil:** Lunes a Viernes 9am-7pm, Sábado 9am-2pm (Santiago, CLT)

---

## Comandos útiles de emergencia

```bash
# Ver deployments recientes (para rollback)
vercel ls --app eva-app

# Promover deployment específico
vercel promote <deployment-url>

# Ver env vars actuales en Vercel (sin revelar values)
vercel env ls

# Verificar DB staging accesible
npx supabase db ping --db-url $STAGING_DB_URL

# Aplicar migración manual de emergencia (SOLO si es necesario)
npx supabase db push --db-url $PROD_DB_URL

# Ver crons recientes
# Vercel Dashboard → Cron Jobs → últimas ejecuciones
```

---

## Escalación

Si no puedes resolver en 30 minutos:
- **Supabase**: Soporte en supabase.com/dashboard → Support → New ticket (plan free tiene soporte comunitario; si el issue es crítico → Twitter/X @Supabase es más rápido)
- **Vercel**: vercel.com/support (Pro plan tiene soporte)
- **MercadoPago**: developers.mercadopago.com → soporte — para issues de webhooks o pagos

---

## Checklist post-incidente

- [ ] Causa raíz identificada
- [ ] Fix deployado y verificado
- [ ] Clientes enterprise notificados que está resuelto
- [ ] Post-mortem breve enviado al cliente si fue P0
- [ ] Cambio preventivo identificado (índice, alerta, test)
- [ ] Nuevo test E2E o alerta agregada para detectar este problema en el futuro

---

## Crons activos (vercel.json post-F1 — 2026-06-12)

> Todos los guards son **fail-closed** desde F7: si falta `CRON_SECRET` o el header no coincide, el endpoint retorna 401 y no ejecuta nada.

| Endpoint | Schedule (UTC) | Qué hace |
|---|---|---|
| `/api/cron/nutrition-cycles` | Diario 11:00 | Avanza los ciclos de planes nutricionales activos (genera el siguiente día del ciclo). |
| `/api/cron/nutrition-reminder` | Diario 00:00 | Envía recordatorio push/email a alumnos que no registraron su comida del día anterior. |
| `/api/cron/trial-expiry` | Diario 12:00 | Verifica coaches en período de prueba y los marca como expirados si corresponde. Solo afecta coaches standalone (no `team_managed` ni `org_managed`). |
| `/api/cron/purge-data` | Domingos 03:00 | Purga datos de cuentas borradas/expiradas según política de retención; registra en `purge_audit`. |
| `/api/cron/audit-checksum` | Domingos 02:00 | Calcula y almacena checksum de tablas de auditoría para detectar manipulación (`audit_log_checksums`). |
| `/api/cron/mp-reconcile` | Viernes 10:00 | Reconcilia suscripciones de MercadoPago contra el estado local (detecta cancelaciones silenciosas, retries fallidos). |

### Crons retirados del schedule en F1 (handlers vivos — sin disparo automático)

| Endpoint | Por qué se retiró | Cómo desarchivar |
|---|---|---|
| `/api/cron/org-health-alert` | Enterprise archivado comercialmente 2026-06; el alert era exclusivo de orgs enterprise. | Volver a agregar en `vercel.json` `crons[]` con `"schedule": "0 13 * * *"` y hacer redeploy. |
| `/api/cron/payment-reminder` | Enterprise archivado; el reminder era para invoices manuales de orgs. | Volver a agregar con `"schedule": "0 9 1,6,11 * *"` y hacer redeploy. |

**Block 4 — Digest de alumnos inactivos (enterprise):** apagado en F1. Es un bloque de código inline dentro del handler de `org-health-alert` (`org-health-alert/route.ts:168-271`) que corría con el schedule diario de ese cron. Al retirar `org-health-alert` de `vercel.json` se apagó junto con el resto del handler. Para reactivar: re-agregar el schedule de `org-health-alert` (fila de arriba) y redeployar — vuelve solo, no requiere tocar otro endpoint.

### Triggers manuales (sin schedule — invocar vía `curl` autenticado con `CRON_SECRET`)

| Endpoint | Cuándo usarlo |
|---|---|
| `/api/cron/weekly-snapshot` | Snapshot semanal de métricas clave (coaches activos, alumnos, logs). Útil antes de migraciones de riesgo. |
| `/api/cron/weekly-report-email` | Envía el reporte semanal de actividad a los coaches que lo tienen habilitado. Útil para re-envío manual si falló. |

```bash
# Invocar un cron manualmente (reemplazar <endpoint> y <secret>)
# Los handlers de cron exponen GET (verbo por defecto de curl); los triggers manuales
# (weekly-snapshot, weekly-report-email) aceptan además POST.
curl https://eva-app.cl/<endpoint> \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

## Guarda del subdominio enterprise (archivado 2026-06-12)

### Estado actual

`enterprise.eva-app.cl` está activo pero sin contenido útil. El proxy de Next.js (`apps/web/src/proxy.ts`) tiene un condicional que redirige **solo `/org/*`** del dominio principal a `/login` en prod (`proxy.ts:145-147`). El panel `/org/[slug]/*` queda **inaccesible en prod a propósito** — decisión intencional de archivado comercial.

**Alcance del guard (importante):** el condicional NO bloquea `/e` ni `/enterprise`. El flujo del alumno enterprise `/e/[org_slug]/*` sigue vivo **a propósito** (es un DoD del plan 01 — no se afecta). La landing `/enterprise` se sigue sirviendo hasta que se active el redirect 308 `/enterprise` → `/pricing` (F6 del plan 01, secuenciado post-deploy del plan 02); mientras tanto solo lleva `noindex` + meta description sin precio.

**Paso manual pendiente (config Vercel):** agregar un redirect 308 en el dashboard de Vercel para el dominio `enterprise.eva-app.cl` → `https://eva-app.cl`. Esto hace que cualquier visita directa al subdominio aterrice en la landing principal.

### Cómo revertir el archivado

1. **Quitar el redirect 308** en Vercel (Dashboard → Domains → `enterprise.eva-app.cl` → eliminar redirect).
2. **Revertir el condicional del proxy** en `apps/web/src/proxy.ts` (buscar el bloque con comentario `// ARCHIVADO 2026-06: subdominio enterprise redirige al home` en `:143` y remover la guarda `/org/*` → `/login` de `:145-147`).
3. Hacer redeploy.

> El motor enterprise (tablas `organizations`, `organization_members`, RLS, JWT hook, `org.service`) sigue intacto en la DB y en el código — no se borró nada. Reactivar es reversible sin migración.

---

## Coach grandfathered (growth/scale) pide cambio de ciclo o reactivación (plan 04)

> Contexto: desde el plan 04 (`docs/plans/estrategia/04-PLAN-consolidacion-planes-ciclos.md`) los tiers `growth` y `scale` salieron de TODA superficie de venta, pero los suscriptores existentes (grandfathered) **conservan su plan, precio y límite de alumnos** mientras no cambien nada. El union type, `TIER_CONFIG` y el CHECK de DB conservan las 6 entradas: el grandfathered sigue viendo "Growth"/"Scale" correcto en su página de suscripción y el webhook de renovación sigue resolviendo su tier+ciclo sin romper.

**Lo que el grandfathered YA NO puede hacer self-service:** cambiar de ciclo (mensual↔trimestral↔anual) ni reactivarse EN su tier muerto. El checkout (`create-preference`) solo acepta sale tiers (`starter`/`pro`/`elite`) → un intento self-service en growth/scale responde 400. La reactivación pública (`/coach/reactivate`) ancla al plan elite (o muestra el puente a Teams si su cartera supera el techo). **Esto es intencional, no un bug.**

### Caso A — pide cambiar de ciclo manteniéndose en su tier legacy

El CEO/admin lo cambia desde `/admin/coaches` (la palanca de soporte):

1. Abrir el coach en el panel admin → `CoachEditSheet`.
2. El Select de tier **conserva el union completo** (incluye growth/scale/free) → mantener su tier legacy.
3. Cambiar el Select de ciclo al deseado. **Importante:** el valor válido es `annual` (no `yearly`) — el fix del plan 04 alineó los selects al CHECK de DB; si ves un error de constraint al guardar el ciclo anual, confirmá que el deploy con el fix `yearly`→`annual` ya está en prod.
4. Guardar. El cambio escribe directo `coaches.subscription_tier`/`billing_cycle`/`max_clients` (no pasa por MercadoPago — el monto del preapproval en MP queda como está; si el coach quiere recobrar al nuevo monto/ciclo hay que recrear el preapproval, decisión caso a caso con el dueño).

### Caso B — pide reactivarse (estaba cancelado) en growth/scale

No hay flujo self-service para resucitar un tier muerto. Opciones:

1. **Mantenerlo legacy (excepción):** el admin re-activa el coach en su tier legacy desde `CoachEditSheet` (status → `active`, tier legacy, ciclo `annual`/`quarterly`/`monthly`). Solo si el dueño aprueba conservar el precio viejo.
2. **Migrarlo a la oferta vigente (preferido):** ofrecerle elite ($44.990, techo 100 alumnos) o, si su cartera supera 100, EVA Teams (mailto `contacto@eva-app.cl`). El coach se reactiva self-service en elite por el flujo público normal.

### Observabilidad — cuántos grandfathered quedan

`/admin/finanzas` muestra una card **"Legacy (grandfather)"** alimentada por el RPC `get_legacy_tier_counts()`: conteo de filas growth/scale por status y ciclo. Sirve para saber cuándo el grandfather se extingue solo (los placeholders `team_managed`/`org_managed` aparecen ahí pero se distinguen por status — no son suscriptores reales). Cuando los reales lleguen a 0, se puede planear matar el union legacy.

> **Nunca** "limpiar" growth/scale del union type, de `TIER_CONFIG` ni del CHECK de DB para resolver uno de estos casos: rompería el webhook de pago de cualquier grandfathered en vuelo y los placeholders `scale` de las cuentas team/org-managed. Los tiers salen de la VENTA, no del runtime.

---

## Add-ons self-service — incidentes de cobro (plan estrategia 05)

> Contexto: el coach standalone tiene **un solo preapproval MercadoPago** cuyo monto = base del tier + add-ons facturables (`getCompositeAmountClp`). La fuente de verdad es la DB (`coach_addons`); el monto en MP es opaco y la reconciliación **solo alerta** divergencias (nunca auto-corrige). Detalle de diseño: `docs/plans/estrategia/05-PLAN-billing-addons-selfservice.md` §F3.

### Divergencia de monto (DB ≠ MP)

**Síntoma:** el reconcile diario (`/api/cron/mp-reconcile`) alerta por email que `auto_recurring.transaction_amount` de un preapproval ≠ `getCompositeAmountClp` esperado, o lo reporta un evento de webhook `updated` (confirmación del PUT que no cuadra).

1. Identificar el coach y recalcular el monto esperado: base del tier por ciclo + Σ `getAddonCycleAmountClp` de los add-ons facturables vivos (`status='active'` o `cancel_pending` sin `first_charged_at`).
2. La DB MANDA. Si el monto en MP quedó viejo (PUT caído, ver abajo), corregir con un PUT manual: script service-role que llame `provider.updateCheckoutAmount(subscriptionMpId, montoEsperado)`. NO tocar `coach_addons` para "cuadrar" con MP — sería invertir la fuente de verdad.
3. Registrar la corrección en `subscription_events` (patrón `addon:<uuid>:<acción>`).

### PUT de monto caído (alta/baja in-app)

**Síntoma:** alta o baja in-app de un add-on devolvió error, o el reconcile detecta un add-on facturable cuyo monto no se reflejó en MP.

- **Alta mensual (D5):** el orden es DB-primero → PUT-después con reversión inmediata. Si el PUT falla, la fila recién insertada se borra en el mismo request (el trigger D1 apaga el módulo) y se relanza el error → el coach ve el fallo y reintenta. Si la reversión TAMBIÉN falló (fila viva + monto MP viejo), el reconcile diario lo detecta como divergencia de monto → PUT manual (arriba).
- **Alta trim/anual:** la fila se materializa recién en el webhook del one-shot aprobado; si el PUT de ese webhook falla, el reconcile lo detecta como drift → PUT manual.
- **Baja regla 4:** si el PUT que baja el monto falló, el próximo cobro cobraría de más. Reconcile lo detecta → PUT manual con el monto SIN el add-on de baja.

### Dunning — preapproval `paused` prolongado (política explícita)

**Síntoma:** el reconcile alerta que un preapproval lleva en `status='paused'` (dunning de MP por cobros fallidos) **más de N días (default 14)**.

1. Un preapproval pausado NO cobra → los add-ons no se pueden seguir cobrando.
2. Pasar los add-ons del coach a `cancel_pending` **SIN PUT** (el preapproval pausado ya no cobra; el PUT no aplica). Dejar registro en `subscription_events`.
3. Si el preapproval vuelve a `authorized` antes del corte, **revertir manualmente** (volver los add-ons a `active`) según el caso — no hay auto-revert.
4. Ejecución semiautomática: la detección es del reconcile (F3.5.e), la ejecución la decide el operador.

### Kill-switch de operador prolongado vs cobro (exposición SERNAC)

**Síntoma:** el reconcile alerta que un add-on FACTURABLE lleva su `module_key` en `EVA_DISABLED_MODULES` (kill-switch de operador) **más de N días (default 3)**.

- Cobrar un servicio que el operador apagó es exposición SERNAC directa (servicio no provisto). El kill-switch NO pausa el cobro por sí mismo.
- **Acción del CEO:** kill prolongado → compensar al coach. Opciones: pausar el add-on (bajar su monto del preapproval con un PUT manual mientras dure el incidente) o convertirlo en cortesía (`source='admin_grant'`, price 0, vía el override del CEO en `/admin/coaches`). Registrar la compensación.
- El kill-switch sigue siendo palanca de incidentes (no bloquea compra): la compensación es operativa, no automática. Ver también `docs/operations/MANUAL_TASKS.md`.
