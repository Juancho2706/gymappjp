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
