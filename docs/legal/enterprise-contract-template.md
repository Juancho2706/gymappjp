# Contrato de Servicios Enterprise — EVA

> **TEMPLATE — completar campos marcados con [MAYÚSCULAS] antes de enviar al cliente**  
> Versión: 1.0 | Última revisión: 17 de mayo de 2026

> ⚠️ **NOTA INTERNA (no publicar):** Redactado bajo Juan Villegas como persona natural / freelancer.  
> Actualizar razón social, RUT empresa y representante legal al constituir la sociedad.  
> Ver `MANUAL_TASKS.md` → MT-19.

---

## CONTRATO DE SERVICIOS — PLAN ENTERPRISE EVA

Entre los suscritos:

**EL PROVEEDOR:** Juan Villegas, persona natural, responsable de la plataforma EVA, con domicilio en Chile, contacto en contacto@eva-app.cl (en adelante "EVA" o "el Proveedor").

**EL CLIENTE:** [NOMBRE_LEGAL_ORGANIZACIÓN], [TIPO_ENTIDAD: persona natural / persona jurídica], RUT [RUT_CLIENTE], representada por [NOMBRE_REPRESENTANTE], en calidad de [CARGO], domiciliada en [DIRECCIÓN_CLIENTE], Chile (en adelante "el Cliente" o "la Organización").

Se celebra el presente Contrato de Servicios Enterprise (en adelante "el Contrato"), sujeto a las siguientes cláusulas:

---

## CLÁUSULA 1 — OBJETO

El Proveedor otorga al Cliente acceso al **Plan Enterprise** de la plataforma EVA, disponible en eva-app.cl, que incluye:

- Panel centralizado de administración de organización
- Gestión de múltiples coaches bajo una misma organización
- Pool de alumnos compartido entre coaches de la organización
- Aislamiento de datos por organización (acceso restringido a sus propios datos)
- Aplicación móvil white-label para alumnos
- Soporte de onboarding incluido (primera configuración)
- Acceso a futuras funcionalidades Enterprise sin costo adicional durante la vigencia

---

## CLÁUSULA 2 — PRECIO Y FACTURACIÓN

### 2.1 Precio mensual base

| Concepto | Valor (CLP, con IVA) |
|----------|---------------------|
| Plan Enterprise base | $49.990/mes |
| Cada coach adicional sobre cuota incluida | $9.990/mes |

*La cuota de coaches incluida en el plan base se especifica en el Anexo A.*

### 2.2 Período de prueba

El Cliente tiene acceso a **30 días de prueba gratuita** desde la activación. Transcurrido ese período, se activa el cobro mensual salvo aviso de cancelación con 3 días de anticipación.

### 2.3 Forma de pago

El cobro se realiza mediante [FORMA_PAGO: transferencia bancaria / link de pago MercadoPago / débito automático] el día [DÍA_COBRO] de cada mes.

Para pago por transferencia:
- **Banco:** [BANCO_EVA]  
- **Cuenta corriente N°:** [CUENTA_EVA]  
- **RUT titular:** [RUT_JUAN_PERSONAL]  
- **Email:** contacto@eva-app.cl

### 2.4 Reajuste de precio

El Proveedor puede reajustar el precio con **60 días de aviso previo**. El Cliente puede terminar el Contrato sin multa dentro de ese plazo si no acepta el nuevo precio.

---

## CLÁUSULA 3 — DURACIÓN Y RENOVACIÓN

3.1 El Contrato tiene duración **mensual** y se renueva automáticamente salvo aviso de no renovación con **15 días de anticipación**.

3.2 Si el Cliente requiere un contrato anual con descuento, las condiciones se negocian caso a caso y se adicionan en un Anexo.

---

## CLÁUSULA 4 — NIVEL DE SERVICIO (SLA)

| Métrica | Compromiso |
|---------|-----------|
| Disponibilidad mensual | ≥ 99% (excluye mantenimientos programados) |
| Notificación de mantenimiento | ≥ 24 horas de anticipación |
| Tiempo de respuesta soporte | ≤ 24 horas hábiles (email) |
| Tiempo de respuesta incidentes críticos | ≤ 4 horas hábiles |

Ante incumplimiento del SLA por causas imputables al Proveedor, el Cliente tiene derecho a un crédito proporcional en la siguiente factura.

---

## CLÁUSULA 5 — OBLIGACIONES DEL PROVEEDOR

El Proveedor se obliga a:

a) Mantener la plataforma operativa conforme al SLA acordado  
b) Notificar cambios relevantes en funcionalidades con al menos 30 días de anticipación  
c) Mantener backups diarios de los datos del Cliente  
d) Tratar los datos personales conforme a la Cláusula 7 y la Ley 21.719  
e) Notificar brechas de seguridad dentro de 72 horas de detectadas  

---

## CLÁUSULA 6 — OBLIGACIONES DEL CLIENTE

El Cliente se obliga a:

a) Pagar oportunamente según lo acordado en la Cláusula 2  
b) Usar la plataforma conforme a los Términos de Servicio de EVA (eva-app.cl/tos)  
c) Designar un administrador de la organización responsable ante EVA  
d) Obtener los consentimientos necesarios de sus alumnos y coaches para el tratamiento de sus datos personales  
e) Notificar al Proveedor cambios en el número de coaches con al menos 5 días de anticipación  

---

## CLÁUSULA 7 — TRATAMIENTO DE DATOS PERSONALES

### 7.1 Roles

En el contexto de este Contrato:
- El **Cliente** actúa como **Responsable del Tratamiento** de los datos personales de sus alumnos y coaches
- El **Proveedor (EVA)** actúa como **Encargado del Tratamiento**, procesando datos por instrucción del Cliente

### 7.2 Instrucciones de tratamiento

El Proveedor procesará datos personales únicamente para prestar los servicios descritos en la Cláusula 1. No los usará con fines propios, no los compartirá con terceros salvo subprocesadores necesarios (Supabase, Vercel) y los eliminará o devolverá al Cliente al término del Contrato.

### 7.3 Subprocesadores

El Proveedor utiliza los siguientes subprocesadores:

| Subprocesador | Finalidad | País |
|--------------|-----------|------|
| Supabase (AWS) | Base de datos y autenticación | EE.UU. |
| Vercel | Hosting | EE.UU. |

El Cliente consiente estos subprocesadores al firmar este Contrato.

### 7.4 Medidas de seguridad

El Proveedor implementa: cifrado TLS 1.2+, Row-Level Security en base de datos, contraseñas con hash, logs de auditoría y backups diarios cifrados.

### 7.5 Derechos de los titulares

El Cliente es responsable de responder las solicitudes ARCO de sus alumnos. El Proveedor asistirá técnicamente en lo necesario.

---

## CLÁUSULA 8 — CONFIDENCIALIDAD

Ambas partes se obligan a mantener confidencialidad sobre la información del negocio de la otra parte. Esta obligación persiste por **2 años** tras el término del Contrato.

---

## CLÁUSULA 9 — PROPIEDAD INTELECTUAL

9.1 La plataforma EVA, su código y diseño son propiedad exclusiva del Proveedor.

9.2 Los datos del Cliente (rutinas, información de alumnos, branding) son propiedad del Cliente. Al término del Contrato, el Proveedor entregará una exportación de los datos del Cliente en formato estándar (CSV/JSON) dentro de 15 días hábiles, previa solicitud.

---

## CLÁUSULA 10 — LIMITACIÓN DE RESPONSABILIDAD

10.1 La responsabilidad máxima del Proveedor no excederá el monto pagado por el Cliente en los últimos **3 meses**.

10.2 Ninguna de las partes será responsable por daños indirectos, lucro cesante o pérdida de clientes.

10.3 El Proveedor no garantiza que EVA sea compatible con todos los sistemas del Cliente.

---

## CLÁUSULA 11 — TERMINACIÓN

### 11.1 Terminación normal
Cualquier parte puede terminar el Contrato avisando con **15 días de anticipación**. El acceso se mantiene hasta el final del período pagado.

### 11.2 Terminación por incumplimiento
Si el Cliente no paga dentro de 10 días de vencida la factura, el Proveedor puede suspender el acceso. Si no paga en 30 días, puede terminar el Contrato sin reembolso.

Si el Proveedor incumple el SLA por más de 3 meses consecutivos, el Cliente puede terminar sin multa y con derecho a reembolso proporcional.

### 11.3 Efecto de la terminación
Al terminar el Contrato, el Proveedor conservará los datos del Cliente por **30 días** para exportación, luego los eliminará definitivamente.

---

## CLÁUSULA 12 — LEY APLICABLE Y RESOLUCIÓN DE CONFLICTOS

Este Contrato se rige por las leyes de la **República de Chile**. Las partes acuerdan someterse a la jurisdicción de los tribunales ordinarios de **Santiago, Chile**.

---

## CLÁUSULA 13 — MODIFICACIONES

Cualquier modificación a este Contrato debe constar por escrito (email con acuse de recibo es válido) y ser aceptada por ambas partes.

---

## FIRMAS

Firmado en Santiago, Chile, el **[DÍA]** de **[MES]** de **[AÑO]**.

**EL PROVEEDOR**

Nombre: Juan Villegas  
Plataforma: EVA (eva-app.cl)  
Email: contacto@eva-app.cl  
Firma: ______________________

---

**EL CLIENTE**

Nombre: [NOMBRE_REPRESENTANTE]  
Cargo: [CARGO]  
Organización: [NOMBRE_ORGANIZACIÓN]  
RUT: [RUT_CLIENTE]  
Email: [EMAIL_CLIENTE]  
Firma: ______________________

---

## ANEXO A — Detalle del Plan

| Concepto | Valor |
|----------|-------|
| Coaches incluidos en plan base | [N] coaches |
| Alumnos máximos | Ilimitados |
| Almacenamiento de archivos | [X] GB |
| Período de inicio | [FECHA_INICIO] |
| Período de prueba gratuita | 30 días desde [FECHA_INICIO] |
| Primer cobro | [FECHA_PRIMER_COBRO] |

---

*EVA — eva-app.cl | contacto@eva-app.cl*
