# Decisiones operativas — EVA Empresas

> **Para quién es este documento:** fundadores, socio de negocio, o cualquier persona del equipo que necesite entender cómo funcionará EVA Empresas sin conocimientos técnicos.
> **Versión:** 2026-04-30
> **Estado:** decisiones tomadas, listas para ejecutar.

---

## Parte 1 — Precios

### ¿Cuánto cobra EVA a un gimnasio?

Hoy EVA cobra a cada coach individualmente. Un gym con 5 coaches paga 5 suscripciones separadas. Con EVA Empresas, el gym paga **un solo precio que cubre a todos sus coaches**, más barato que comprarlos por separado, y además incluye el panel de administración del equipo.

### Los planes

| Plan | ¿Para quién? | Coaches incluidos | Precio mensual |
|------|-------------|-------------------|----------------|
| **Starter Gym** | Estudio pequeño, box, clínica chica | Hasta 5 coaches | **$59.990 CLP** |
| **Pro Gym** | Gimnasio mediano, centro deportivo | Hasta 10 coaches | **$109.990 CLP** |
| **Elite Gym** | Gym grande, cadena pequeña | Hasta 20 coaches | **$199.990 CLP** |
| **Enterprise** | Cadena, franquicia, corporativo | 21+ coaches | Desde $300.000 · Cotizar |

### ¿Por qué es un buen negocio para el gym?

Porque pagan menos que comprando cuentas individuales. Ejemplo concreto:

```
5 coaches en EVA Pro individual = $29.990 × 5 = $149.950/mes
Pack Starter Gym                =                  $59.990/mes
                                        ─────────────────────
Ahorro mensual                  =                  $90.000/mes
Ahorro anual                    =               $1.080.000/año
```

Más el panel de administración, que antes no existía.

### Descuento por pago anual

Si el gym paga por adelantado un año completo, obtiene **20% de descuento** en el precio mensual:

| Plan | Precio normal | Precio anual (mensualizado) | Total anual |
|------|--------------|----------------------------|-------------|
| Starter Gym | $59.990/mes | $47.990/mes | $575.880 |
| Pro Gym | $109.990/mes | $87.990/mes | $1.055.880 |
| Elite Gym | $199.990/mes | $159.990/mes | $1.919.880 |

El pago anual se cobra todo junto al inicio. Esto es bueno para EVA porque da certeza de ingresos; es bueno para el gym porque se ahorra aún más.

### ¿Qué incluye cada plan?

Todos los planes de equipo incluyen lo mismo que el plan Pro individual de EVA por cada coach:
- Hasta 30 alumnos por coach
- Programas de entrenamiento ilimitados
- Planes de nutrición
- Check-in y progreso de alumnos
- Dashboard del coach
- **Panel de administración del equipo** (esto es exclusivo del plan empresa — no existe en planes individuales)

### ¿Cómo se cobra?

**Simple:** cuando el gym quiere comenzar (o renovar), uno de los fundadores de EVA le envía un link de MercadoPago desde `contacto@eva-app.cl`. El gym paga. Los fundadores ven el pago en su cuenta y activan el acceso del gym en menos de 30 minutos.

No hay checkout automático ni formulario de tarjeta dentro del panel. El gym verá en su panel el estado de su plan, cuándo vence, y un botón "¿Cómo renovar?" que muestra las instrucciones.

### ¿Qué pasa si el gym no paga a tiempo?

- **Día 0 (vencimiento):** el gym entra en "período de gracia" de 7 días. Todos los coaches siguen con acceso.
- **Día 7 sin pago:** el acceso se pausa. Los coaches ven un mensaje "Tu acceso está pausado, contacta al administrador de tu gym."
- **Los datos de los alumnos nunca se borran.** Si el gym reactiva, todo sigue igual.

### ¿Qué pasa si el gym quiere más coaches de los que cubre su plan?

Al alcanzar el límite, el panel le avisa: "Has alcanzado el límite de X coaches de tu plan. Para agregar más, actualiza tu plan." EVA recibe una alerta y contacta al gym para ofrecerles el plan siguiente.

---

## Parte 2 — Cómo se protege el producto actual (para no técnicos)

### El problema que queremos evitar

EVA tiene coaches que pagan de forma individual hoy. Cuando agreguemos el modo empresa, **no queremos que algo se rompa para esos coaches**. Es como agregar un nuevo piso a un edificio sin tocar los pisos de abajo.

### La regla técnica que garantiza esto

Cada coach en EVA tiene un campo interno llamado `organization_id`. Hoy ese campo está vacío para todos los coaches. La regla es simple:

- **Campo vacío** → el coach es retail. Todo funciona exactamente igual que hoy. EVA no hace nada diferente.
- **Campo con valor** → el coach pertenece a un gym. Se aplican las reglas del plan empresarial.

Ningún coach existente va a tener ese campo lleno a menos que sea invitado explícitamente por un gym y acepte la invitación.

### ¿Por qué hay una suite de pruebas para esto?

Antes de activar el modo empresa en producción, el equipo técnico va a crear una batería de pruebas automáticas que verifican que los coaches individuales no se ven afectados. Esas pruebas corren automáticamente cada vez que se hace un cambio en el código — si algo rompe el flujo de un coach retail, la prueba falla y no se puede publicar el cambio.

**En términos simples:** es un sistema de alarma que suena si algo sale mal para los coaches actuales.

### Las 5 alarmas que se verifican automáticamente

1. Un coach nuevo puede registrarse en EVA sin ver nada relacionado con "empresas" o "organizaciones".
2. Un coach individual accede a su cuenta igual que hoy, sin lentitud ni errores adicionales.
3. Las páginas del coach individual no hacen consultas innecesarias a la base de datos del modo empresa.
4. El coach A no puede ver los alumnos del coach B (esto ya funciona; la prueba confirma que sigue así).
5. Si un coach individual intenta entrar al panel de empresa, lo redirige a su propio dashboard.

**Tiempo estimado para configurar esto:** 3 horas de trabajo técnico. Se hace una vez antes de la primera entrega de código del modo empresa.

---

## Parte 3 — Términos de uso para gyms

### ¿Para qué sirve este documento?

Es el acuerdo entre EVA y el gym. No es un contrato legal complejo — es un documento de 1 página que explica qué ofrece EVA, cómo se paga, y qué pasa con los datos. Se envía como PDF adjunto al email de bienvenida. El gym no necesita firmarlo: el hecho de pagar implica que acepta los términos.

### ¿Por qué no un contrato complejo?

Porque EVA todavía es una startup de dos personas. Un contrato de 20 páginas redactado por un abogado cuesta tiempo y dinero que hoy no tiene ROI. Con los primeros 5–10 gyms, este documento de 1 página es suficiente para proteger a ambas partes. Cuando EVA tenga empresa registrada y contratos de mayor valor, se contrata un abogado.

---

### Documento listo para usar

> Copiar el texto de abajo, reemplazar `[X]` con los datos reales, exportar como PDF, adjuntar al email de bienvenida.

---

**TÉRMINOS DE USO — EVA Plan de Equipo**
Versión 1.0 · Vigente desde [fecha de inicio]

**1. PARTES**
Proveedor: EVA Fitness Platform, operado por [Nombre Fundador 1] y [Nombre Fundador 2], RUT [X] y RUT [X]. Contacto: contacto@eva-app.cl
Cliente: la organización (gym, estudio, clínica) identificada al momento del pago, en adelante "el Gym".

**2. QUÉ OFRECE EVA**
Acceso a la plataforma EVA para hasta [N] coaches durante el período contratado. Incluye programas de entrenamiento, planes de nutrición, seguimiento de alumnos, y panel de administración del equipo. Los límites exactos dependen del plan contratado (Starter / Pro / Elite / Enterprise).

**3. PAGO Y RENOVACIÓN**
El monto mensual o anual se acuerda al contratar. El pago se realiza via link MercadoPago o transferencia bancaria a contacto@eva-app.cl. Si el pago no se recibe dentro de 7 días del vencimiento, el acceso se pausa automáticamente. No se realizan reembolsos por períodos ya iniciados.

**4. DATOS Y PRIVACIDAD**
EVA no comparte datos de alumnos con terceros. El panel de administración del Gym muestra únicamente métricas agregadas (totales y porcentajes), sin nombres ni datos de salud individuales de los alumnos. Los datos del Gym y sus alumnos son propiedad del Gym. EVA los procesa exclusivamente para prestar el servicio, conforme a la Ley 19.628 de Protección de Datos Personales de Chile.

**5. CANCELACIÓN Y EXPORTACIÓN DE DATOS**
El Gym puede cancelar avisando con 30 días de anticipación a contacto@eva-app.cl. Tras la cancelación, EVA proveerá una exportación de los datos del Gym dentro de los 30 días siguientes. EVA puede suspender el servicio por incumplimiento de pago o uso que viole estos términos.

**6. RESPONSABILIDAD**
EVA no responde por pérdida de datos causada por el Gym, sus coaches, o sus alumnos. La responsabilidad máxima de EVA ante el Gym no supera el monto del último período pagado.

**7. ACEPTACIÓN**
El pago del primer período implica aceptación plena de estos términos. Ley aplicable: República de Chile. Jurisdicción: tribunales de Santiago.

Consultas y soporte: contacto@eva-app.cl

---

### Checklist antes de enviar los términos al primer gym

- [ ] Completar nombres de los dos fundadores y sus RUTs.
- [ ] Completar la fecha de inicio del documento (hoy).
- [ ] Verificar que el número de coaches del plan coincide con lo contratado.
- [ ] Exportar como PDF (Google Docs → Archivo → Descargar → PDF).
- [ ] Adjuntar al email de bienvenida del gym.

---

## Resumen ejecutivo — decisiones tomadas

| Decisión | Qué se decidió |
|----------|---------------|
| **Precios** | Starter $59.990 · Pro $109.990 · Elite $199.990 · Enterprise cotizar. Anual –20%. |
| **Cómo se cobra** | Link MP o transferencia a contacto@eva-app.cl. Fundadores activan manualmente. |
| **Qué pasa si no pagan** | 7 días de gracia → acceso pausado. Datos nunca se borran. |
| **Qué incluye cada plan** | Límites Pro por coach + panel de equipo exclusivo. |
| **Protección coaches actuales** | Suite de pruebas automáticas que verifica que nada se rompe. 3h técnicas. |
| **Contrato con el gym** | Documento de 1 página. Pago = aceptación. Sin firma digital por ahora. |
| **Nombre del producto** | "EVA Empresas" en marketing. "Plan de equipo" en el panel. |

---

*Próximo paso: los dos fundadores aprueban este documento y el runbook de alta org (§14.1 del plan técnico). Luego comienza la implementación por olas.*
