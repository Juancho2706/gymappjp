# Plantillas de correo de Supabase Auth (EVA)

Los correos de **autenticación** (restablecer contraseña, confirmar registro, magic
link, invitación, cambio de correo) los envía **Supabase (GoTrue)**, no la app. Por eso
NO se generan desde `base-layout.ts`: viven en el panel de Supabase. Estos `.html` son la
**copia versionada** para pegar en el dashboard, con la misma identidad visual que el
resto de correos EVA (header oscuro `#0f172a`, acento verde `#10B981`, tarjeta blanca,
footer "EVA Fitness Platform").

> Si cambias el header/footer de los correos de la app en `base-layout.ts`, actualiza
> también estos archivos a mano — son una copia por diseño (Supabase no importa del repo).

## 1. Remitente (Custom SMTP con Resend)

Por defecto Supabase envía desde `noreply@mail.app.supabase.io` (en inglés). Para que salga
desde EVA hay que configurar **SMTP propio** apuntando a Resend. El dominio `eva-app.cl` ya
está verificado en Resend, así que se puede enviar desde cualquier buzón `@eva-app.cl`.

**Supabase → Authentication → Emails → SMTP Settings → Enable Custom SMTP:**

| Campo            | Valor                                             |
| ---------------- | ------------------------------------------------- |
| Host             | `smtp.resend.com`                                 |
| Port             | `465` (SSL) — o `587` si prefieres STARTTLS       |
| Username         | `resend`                                          |
| Password         | `<pega aquí tu API key de Resend>`                |
| Sender email     | `no-reply@eva-app.cl` (recomendado)               |
| Sender name      | `EVA`                                             |

Después subir el límite en **Authentication → Rate Limits → "Emails per hour"** (con SMTP
propio ya no aplica el tope bajo por defecto de Supabase).

## 2. Plantillas (Authentication → Emails → Templates)

Pegar el HTML de cada archivo en la pestaña correspondiente y fijar el **Subject**:

| Archivo               | Pestaña en Supabase       | Subject sugerido                                  | Variables            |
| --------------------- | ------------------------- | ------------------------------------------------- | -------------------- |
| `reset-password.html` | **Reset Password**        | `Restablece tu contraseña de EVA`                 | `{{ .ConfirmationURL }}` |
| `confirm-signup.html` | **Confirm signup**        | `Confirma tu correo para activar tu cuenta EVA`   | `{{ .ConfirmationURL }}` |
| `magic-link.html`     | **Magic Link**            | `Tu enlace de acceso a EVA`                       | `{{ .ConfirmationURL }}` |
| `invite.html`         | **Invite user**           | `Te invitaron a EVA`                              | `{{ .ConfirmationURL }}` |
| `email-change.html`   | **Change Email Address**  | `Confirma tu nuevo correo de EVA`                 | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |

`{{ .ConfirmationURL }}` ya incluye el `redirect_to` que arma la app
(`/auth/callback?next=/reset-password`), así que el flujo de restablecer no cambia.

> **Cambio de correo:** con *Secure email change* (activado por defecto en Supabase),
> GoTrue envía `email-change.html` a **ambas** casillas (actual y nueva) y hay que confirmar
> desde las dos. El copy ya lo aclara. Si prefieres una sola confirmación, desactívalo en
> **Authentication → Providers → Email → Secure email change**.

## 3. Prueba

Tras configurar SMTP + pegar la plantilla de Reset Password: en la web ir a
`¿Olvidaste tu contraseña?`, pedir el correo con una cuenta real y verificar que llega
desde `EVA <no-reply@eva-app.cl>`, en español y con el diseño de la tarjeta.
