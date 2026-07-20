# Guía de cuentas paso a paso — MercadoPago Empresa + Flow (de cero)

> Para el CEO. Explicado simple. Esto NO es código — son cosas que hacés vos en las webs de MercadoPago, Flow y Vercel. Cada paso dice qué hacer y por qué.
>
> Glosario rápido:
> - **Env var (variable de entorno):** un "cajón" secreto donde la app guarda claves. La app las lee sola; vos solo pegás el valor en Vercel.
> - **Access token / API key:** la "contraseña" que le prueba a MercadoPago/Flow que las llamadas son tuyas. NUNCA la pegues en un chat ni en el código.
> - **Sandbox:** un mundo de juguete con plata FALSA para probar sin cobrar de verdad.
> - **Producción (prod):** el mundo real, plata de verdad.
> - **Webhook:** un aviso automático que la pasarela le manda a tu servidor cuando pasa algo (ej. "se pagó").
> - **Redeploy:** volver a publicar la app para que tome cambios.

---

# PARTE A — Cambiar los tokens a MercadoPago EMPRESA

**Qué logramos:** que MercadoPago cobre desde tu cuenta Empresa (RUT SpA) y no la vieja. **No se toca ni una línea de código** — solo cambiás valores en Vercel y registrás el webhook en MercadoPago.

## A1. Sacar las credenciales de la cuenta Empresa
1. Entrá a **mercadopago.cl** con tu cuenta **Empresa**.
2. Andá a **"Tu negocio" → "Configuración" → "Gestión y administración" → "Credenciales"** (o buscá "Credenciales" en el buscador del panel).
3. Vas a ver dos bloques: **Credenciales de producción** y **Credenciales de prueba**. De cada uno copiá:
   - **Access Token** (producción empieza con `APP_USR-…`; prueba empieza con `TEST-…`)
   - **Public Key** (misma lógica, `APP_USR-…` / `TEST-…`)
   > La Public Key y el Access Token vienen en PAREJA. Si mezclás la public key de una cuenta con el token de otra, no funciona.

## A2. Pegar los valores en Vercel
1. Entrá a **vercel.com** → proyecto **`gymappjp`** → **Settings → Environment Variables**.
2. Reemplazá los valores de estas variables (buscalas por nombre y editá el valor):

| Variable | Valor en Production | Valor en Preview | Nota importante |
|---|---|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | `APP_USR-…` de Empresa | `TEST-…` de Empresa | efecto inmediato, sin re-publicar |
| `NEXT_PUBLIC_MP_PUBLIC_KEY` | `APP_USR-…` de Empresa | `TEST-…` de Empresa | ⚠️ **NO marques "Sensitive"** (si lo marcás, llega vacío y se rompe el formulario de tarjeta) · **necesita redeploy** |
| `MERCADOPAGO_WEBHOOK_SIGNING_SECRET` | (lo sacás en A3) | (idem) | — |
| `MERCADOPAGO_WEBHOOK_TOKEN` | **dejalo como está** | dejalo | es un secreto TUYO, no de MP |

## A3. Registrar el webhook en MercadoPago Empresa
1. En el panel de MercadoPago Empresa: **"Tus integraciones" → tu aplicación → "Webhooks"** (o "Notificaciones").
2. En "URL de producción" pegá:
   `https://eva-app.cl/api/payments/webhook?token=EL_VALOR_DE_TU_MERCADOPAGO_WEBHOOK_TOKEN`
   (reemplazá `EL_VALOR_...` por el valor que ya tenés en esa env var — es tu secreto).
3. Marcá los eventos: **Pagos** y **Suscripciones (preapproval)**.
4. Guardá. MercadoPago te muestra una **"clave secreta" / "firma"** → copiala y pegala en Vercel como `MERCADOPAGO_WEBHOOK_SIGNING_SECRET`.

## A4. Redeploy
En Vercel → pestaña **Deployments** → botón **"Redeploy"** en el último deploy (necesario por la Public Key).

## A5. (dev local, opcional)
En tu PC, en los archivos `.env.local` (raíz) y `apps/web/.env.local`, cambiá las mismas 3 vars por las **`TEST-`** de Empresa. Esto es solo para probar en tu compu.

## ⚠️ A6. OJO — las suscripciones viejas
Las suscripciones que YA están cobrando viven en la cuenta **vieja**. Apenas cambiás el token, la app deja de "ver" esas suscripciones viejas (son de otra cuenta). Como tenés poquitos que pagan de verdad, el plan es: **hacer el cambio y re-inscribir a esos pocos** (que se vuelvan a suscribir en la cuenta nueva). Avisame y te armo la lista de a quién re-inscribir.

---

# PARTE B — Flow desde CERO (no tenés cuenta)

**Qué logramos:** tener Flow listo para que aparezca el botón "Pagar con Webpay". Primero el mundo de juguete (sandbox) para probar, después el real.

## B1. Crear cuenta SANDBOX (juguete — hacé ESTO primero)
1. Andá a **https://dashboard.sandbox.flow.cl/register**.
2. Registrate (podés usar tu email; es un ambiente de prueba, no cobra nada).
3. Adentro del panel sandbox, buscá **"Mis datos"** (o "Integración") → ahí están tu **apiKey** y **secretKey** de sandbox. Copialas y guardalas en un lugar seguro (NO las pegues en chats).

## B2. Correr el test de Fase 0 (ver el Webpay real)
Esto confirma lo más importante: que al pagar con Flow el cliente ve la página REAL de Webpay.
1. Abrí una terminal (PowerShell).
2. Pegá esto (reemplazando por tus claves de sandbox del paso B1):
   ```powershell
   $env:FLOW_API_KEY="tu_apiKey_sandbox"; $env:FLOW_SECRET_KEY="tu_secretKey_sandbox"; node "<local-temp-path>"
   ```
3. El script te imprime una **URL**. Abrila en el navegador.
4. **Mirá:** ¿aparece una pantalla de Flow para elegir medio (con el logo Webpay)? Al elegir Webpay, ¿te lleva a la página real de Transbank/Webpay? Sacá screenshot de las dos.
5. (Opcional) En el script cambiá `PAYMENT_METHOD = 9` por `= 1` y volvé a correr: eso salta la pantalla de Flow y va DIRECTO a Webpay.
6. Contame qué viste → con eso confirmamos la luz verde (o replanteamos).

> Tarjetas de prueba: el panel sandbox de Flow publica tarjetas falsas (ej. VISA 4051 8856 0044 6623) para simular pagos.

## B3. Crear cuenta de PRODUCCIÓN (el mundo real — cuando Fase 0 esté OK)
1. Andá a **https://www.flow.cl/** → **"Crear cuenta"** / **"Registrarse"** (cuenta de comercio/empresa).
2. Datos que te va a pedir (por eso conviene tener a mano): **RUT de la SpA**, **inicio de actividades en SII**, datos del representante, y la **cuenta bancaria** donde querés recibir la plata (tu **BancoEstado Empresas**).
3. Flow revisa/activa la cuenta. Puede pedir verificación. (Cuánto demora y si pide contrato: te lo confirma Flow directo — no está 100% documentado.)
4. Ya activa: en **"Mis datos"** están tu **apiKey** y **secretKey** de **producción** (distintas de las de sandbox).
5. Configurá la **cuenta de abono** (BancoEstado) para que Flow te deposite. Recordá: Flow abona al **3er día hábil (2,89%+IVA)** o **día hábil siguiente (3,19%+IVA)**.

## B4. Guardar las credenciales de Flow en la app (cuando construyamos)
Cuando el código de Flow esté listo, vas a pegar en Vercel (yo te digo los nombres exactos ahí):
- `FLOW_API_KEY` (prod en Production, sandbox en Preview)
- `FLOW_SECRET_KEY` (idem)
- (y registrar en el panel de Flow las URLs de webhook: la del PLAN `urlCallback` para cobros recurrentes y la `urlConfirmation` para pagos sueltos — te las paso cuando existan las rutas).

---

# Orden recomendado (qué hacer primero)
1. **B1 + B2** — crear sandbox Flow y correr el test de Fase 0. (Es el gate: sin esto no codeamos Flow.)
2. **A1–A4** — cambiar tokens de MercadoPago Empresa (cuando quieras; avisame para coordinar la re-inscripción de las subs viejas).
3. **B3** — crear la cuenta Flow de producción (mientras yo construyo con sandbox).
4. **B4** — pegar credenciales de Flow prod al final, antes del go-live.

Dudas en cualquier paso: preguntame y lo bajamos más.
