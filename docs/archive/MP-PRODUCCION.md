# MercadoPago en Produccion (EVA)

Este documento deja estandarizado el proceso para operar suscripciones con MercadoPago en modo produccion.

## Variables de entorno requeridas (Vercel)

- `MERCADOPAGO_ACCESS_TOKEN`: token de produccion (`APP_USR-...`).
- `MERCADOPAGO_WEBHOOK_TOKEN`: token secreto para proteger el webhook.
- `NEXT_PUBLIC_SITE_URL`: dominio canonico de produccion (ej. `https://eva-app.cl`).
- `MERCADOPAGO_WEBHOOK_SIGNING_SECRET` (opcional recomendado): secreto `x-signature` desde MP.

## Configuracion en MercadoPago

1. Ir a `MercadoPago Developers > Mis aplicaciones`.
2. Seleccionar la app EVA y copiar credenciales de produccion.
3. Configurar notificaciones apuntando a:
   - `https://[tu-dominio]/api/payments/webhook?token=[MERCADOPAGO_WEBHOOK_TOKEN]`
4. Habilitar eventos de suscripcion:
   - `subscription_preapproval`
   - `subscription_authorized_payment`

## Comportamiento en codigo (validado)

- El backend construye URLs usando `NEXT_PUBLIC_SITE_URL` en:
  - `src/app/api/payments/create-preference/route.ts`
- `notification_url` se envia a MercadoPago via `webhookUrl` en:
  - `src/lib/payments/providers/mercadopago.ts`

Esto evita hardcodes y permite cambiar entorno solo por variables.

## Smoke test de produccion (checklist)

1. Registrar coach de prueba.
2. Elegir tier Starter y abrir checkout MP.
3. Completar pago.
4. Verificar en BD (`coaches`) que `subscription_status = 'active'`.
5. Verificar evento recibido en `subscription_events`.

## Troubleshooting rapido

- Error 401/403 en MP:
  - Validar que el token sea `APP_USR-...` y no `TEST-...`.
- Error `Both payer and collector must be real or test users`:
  - Verificar que en produccion **NO** exista `MERCADOPAGO_TEST_PAYER_EMAIL`.
  - Si usas token `APP_USR-...`, el `payer_email` debe ser real (no `@testuser.com`).
- Webhook no llega:
  - Verificar `NEXT_PUBLIC_SITE_URL`, token querystring y eventos habilitados.
- Suscripcion queda pendiente:
  - Revisar logs de `/api/payments/webhook` y `subscription_events` para estado del provider.
