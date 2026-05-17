# Política de Privacidad — EVA

**Última actualización:** 17 de mayo de 2026  
**Vigencia:** Desde la aceptación del usuario

> ⚠️ **NOTA INTERNA (no publicar):** Redactado bajo Juan Villegas como persona natural / freelancer.  
> Actualizar razón social, RUT empresa y representante legal al constituir la sociedad.  
> Ver `MANUAL_TASKS.md` → MT-19.

---

## 1. Responsable del Tratamiento

**Juan Villegas**, responsable del desarrollo y operación de la plataforma EVA (eva-app.cl).

- **Email de contacto:** privacidad@eva-app.cl  
- **País:** Chile

---

## 2. Datos que Recopilamos

### 2.1 Datos que el usuario nos entrega directamente

| Categoría | Datos | Quién los entrega |
|-----------|-------|-------------------|
| Identidad | Nombre completo, email | Coach, alumno, org admin |
| Cuenta | Contraseña (hash, nunca en texto plano) | Coach, alumno |
| Perfil | Foto de perfil, descripción | Coach (opcional) |
| Salud | Peso, altura, objetivos fitness | Alumno (voluntario) |
| Actividad | Rutinas, sets, repeticiones, cargas | Alumno |
| Nutrición | Alimentos, calorías, macros | Alumno |
| Check-ins | Fotos de progreso, medidas corporales | Alumno |
| Facturación | Email de pago (procesado por MercadoPago) | Coach |
| Organización | Nombre org, logo, datos de contacto | Org admin |

### 2.2 Datos recopilados automáticamente

- Dirección IP (para seguridad y rate limiting)
- Logs de uso y errores (para mejorar el servicio)
- Cookies técnicas de sesión (Supabase Auth)
- Datos de analítica de uso (PostHog, solo con consentimiento)

---

## 3. Finalidad del Tratamiento

| Finalidad | Base de licitud |
|-----------|----------------|
| Prestar el servicio de gestión de rutinas y nutrición | Ejecución del contrato |
| Autenticación y seguridad de la cuenta | Interés legítimo / ejecución del contrato |
| Facturación y cobro de suscripciones | Ejecución del contrato |
| Comunicaciones sobre el servicio (cambios, alertas) | Ejecución del contrato |
| Mejora del servicio y analítica (PostHog) | Consentimiento |
| Cumplimiento de obligaciones legales | Obligación legal |

---

## 4. Menores de Edad

4.1 EVA no recopila datos de menores de 14 años sin consentimiento del tutor legal.

4.2 Al registrar un alumno menor de 14 años, el coach debe confirmar que cuenta con autorización del tutor legal. EVA registra esta confirmación con marca de tiempo (`age_confirmed_at`), conforme al artículo pertinente de la **Ley 21.719**.

4.3 Si detectamos que se han recopilado datos de un menor sin consentimiento, los eliminaremos de forma inmediata. Notificar a privacidad@eva-app.cl.

---

## 5. Transferencias Internacionales de Datos

EVA usa proveedores de infraestructura cuyos servidores están ubicados fuera de Chile:

| Proveedor | Servicio | País servidores | Garantía |
|-----------|---------|-----------------|---------|
| **Supabase** | Base de datos y autenticación | EE.UU. (AWS us-east-1) | DPA firmado + SCC |
| **Vercel** | Hosting y despliegue | EE.UU. + CDN global | DPA aceptado + SCC |
| **MercadoPago** | Procesamiento de pagos | Argentina / región | Regulado por BCRA |
| **PostHog** | Analítica (solo con consentimiento) | EE.UU. / EU | DPA disponible |

Estas transferencias se realizan con las garantías adecuadas conforme a la Ley 21.719 (Cláusulas Contractuales Tipo).

---

## 6. Derechos ARCO

Tienes derecho a:

| Derecho | Descripción |
|---------|-------------|
| **Acceso** | Saber qué datos tenemos sobre ti |
| **Rectificación** | Corregir datos inexactos |
| **Cancelación** | Solicitar la eliminación de tus datos |
| **Oposición** | Oponerte a ciertos tratamientos (ej. analítica) |
| **Portabilidad** | Recibir tus datos en formato estructurado |

**Para ejercer tus derechos:** envía un email a **privacidad@eva-app.cl** con:
- Asunto: "Solicitud ARCO"
- Tu nombre completo y email de la cuenta
- El derecho que deseas ejercer
- Descripción de tu solicitud

Responderemos en un plazo máximo de **30 días hábiles**.

---

## 7. Retención de Datos

| Dato | Período de retención |
|------|---------------------|
| Datos de cuenta activa | Mientras la cuenta esté activa |
| Datos tras cierre de cuenta | 30 días (recuperación), luego eliminación |
| Logs de auditoría | 90 días |
| Datos de facturación | 6 años (obligación tributaria Chile) |
| Datos de menores | Se eliminan inmediatamente ante solicitud del tutor |

---

## 8. Cookies y Analítica

### 8.1 Cookies técnicas (esenciales)
Usamos cookies de sesión de Supabase para mantener tu sesión autenticada. No se pueden desactivar sin afectar el funcionamiento del servicio.

### 8.2 Cookies de analítica (PostHog)
Solo con tu consentimiento explícito (banner de cookies). Puedes revocar el consentimiento en cualquier momento desde el pie de página → "Configuración de cookies".

### 8.3 Sin cookies de publicidad
EVA no usa cookies publicitarias ni comparte datos con plataformas de publicidad.

---

## 9. Seguridad

- Contraseñas almacenadas con hash seguro (bcrypt via Supabase Auth)
- Comunicaciones cifradas con TLS 1.2+
- Acceso a datos restringido por Row-Level Security (RLS) en base de datos
- Cada coach accede solo a sus propios alumnos; cada organización accede solo a sus propios datos
- Logs de auditoría para acciones administrativas críticas

---

## 10. Notificación de Brechas

En caso de brecha de seguridad que afecte tus datos personales, te notificaremos por email dentro de **72 horas** de detectada la brecha, conforme a lo exigido por la Ley 21.719.

---

## 11. Cambios a esta Política

Notificaremos cambios significativos por email con **30 días de anticipación**. La versión vigente siempre estará publicada en **eva-app.cl/privacidad**.

---

## 12. Ley Aplicable

Esta Política se rige por la **Ley 19.628** (vigente) y la **Ley 21.719** (vigente desde el 1 de diciembre de 2026), ambas de la República de Chile.

---

## 13. Contacto

**Email privacidad:** privacidad@eva-app.cl  
**Email general:** contacto@eva-app.cl  
**Plataforma:** eva-app.cl

---

*EVA — eva-app.cl*
