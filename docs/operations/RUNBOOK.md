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
