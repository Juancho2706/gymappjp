# RET-002 - Email Drip Ops

## Secuencia
- Dia 1: `day1_welcome`
- Dia 3: `day3_clients`
- Dia 7: `day7_nutrition`
- Dia 14: `day14_upgrade`

## Implementacion en codigo
- Templates: `src/lib/email/drip-templates.ts`
- Envio: `src/lib/email/send-email.ts`
- Runner: `POST /api/internal/email-drip/run`
- Historial: tabla `coach_email_drip_events` (migracion Sprint 5)
- Scheduler: `.github/workflows/email-drip.yml`

## Variables requeridas
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `DRIP_CRON_TOKEN`
- GitHub Secrets para scheduler:
  - `BETA_APP_URL`
  - `DRIP_CRON_TOKEN`

## Ejecucion manual
```bash
curl -X POST "https://tu-dominio/api/internal/email-drip/run" \
  -H "Authorization: Bearer $DRIP_CRON_TOKEN"
```

## Dry run
```bash
curl -X POST "https://tu-dominio/api/internal/email-drip/run?dryRun=1" \
  -H "Authorization: Bearer $DRIP_CRON_TOKEN"
```

## Monitoreo
- Revisar total de `sent/failed/skipped` por corrida.
- Si `failed > 0`, revisar `error` en `coach_email_drip_events`.
- Reintento manual al corregir credenciales/proveedor.
