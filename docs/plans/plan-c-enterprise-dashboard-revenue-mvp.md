# Plan C - Enterprise Dashboard Revenue MVP

**Version:** 1.0  
**Fecha:** 2026-05-23  
**Prioridad:** P0 Revenue  
**Estado:** DRAFT READY FOR REVIEW  
**Scope:** Web/PWA enterprise para dueños de empresas y usuarios enterprise invitados  
**Rutas principales:** `/org/[slug]/*`  
**Fuera de scope:** app nativa EVA Enterprise, paridad mobile coach, reemplazar app coach/alumno

---

## Resumen Ejecutivo

EVA Enterprise debe sentirse como un **sistema operativo de negocio para gimnasios, academias, studios y organizaciones de entrenamiento**.

La superficie enterprise actual ya prueba la base: login aislado, rutas `/org/*`, identidad visual propia, MFA y subdominio separado. El siguiente paso no es otro admin genérico. El siguiente paso es un dashboard revenue-grade que le permita al dueño:

- entender salud del negocio;
- controlar coaches;
- asignar alumnos;
- detectar alumnos en riesgo;
- controlar el white-label de toda la organizacion;
- invitar socios/administradores con permisos propios;
- revisar reportes accionables;
- operar desde web/PWA responsive con diseño listo para futura app mobile enterprise.

Regla madre:

```text
Los usuarios enterprise NO son coaches y NO son alumnos.
Son operadores de la organización, con cuentas, permisos, auditoría y flujos propios.
```

---

## Posicionamiento Producto

### Comprador

- Dueño de gimnasio.
- Director de academia.
- Operador de franquicia.
- Manager de studio.
- Head coach que también administra negocio.

### Motivo de Compra

No compran "un dashboard". Compran:

- control operacional;
- visibilidad sobre coaches;
- menos alumnos abandonando;
- asignaciones ordenadas;
- accountability del equipo;
- reportes para reuniones;
- una plataforma profesional para mostrar a socios e inversionistas.
- una experiencia white-label real para coaches y alumnos bajo su propia marca.

### Momento de Valor en 30 Segundos

Al abrir `/org/[slug]`, el dueño debe entender inmediatamente:

- cuántos alumnos activos tiene;
- qué coaches están sobrecargados o inactivos;
- qué alumnos están en riesgo;
- cómo cambió la adherencia semanal;
- qué tareas requieren acción hoy;
- si el negocio está mejor o peor que la semana anterior.

---

## Reglas de Identidad y Acceso

- Las cuentas enterprise son separadas de cuentas coach/alumno.
- Staff enterprise entra por `/org/login`.
- Coaches no entran al dashboard enterprise por ser coaches.
- Alumnos nunca entran al dashboard enterprise.
- El dueño puede crear cuentas enterprise para socios/administradores.
- Cada cuenta enterprise tiene rol y permisos.
- Una persona puede tener cuenta coach y cuenta enterprise, pero son sesiones y permisos separados.
- Toda acción sensible debe pasar por server-side permission checks.
- Ocultar botones en UI no es autorización.

---

## White-Label Enterprise

El dashboard enterprise tambien administra la marca de la organizacion.

Ese white-label no es solo para el panel enterprise. Es la fuente de verdad visual para:

- dashboard enterprise del owner/staff;
- apps coach normales de coaches creados por la empresa;
- PWA/app alumno de alumnos asociados a esa organizacion;
- loaders, iconos, colores, manifests PWA y pantallas de acceso.

### Regla Central

```text
Si un coach pertenece a una organizacion enterprise, su branding individual queda subordinado al branding enterprise.
```

Impacto:

- Coaches creados por enterprise no ven `Mi marca`.
- Coaches creados por enterprise no ven `Billing`.
- Branding, pagos y ownership comercial los maneja la empresa.
- Alumno ve la marca de la empresa, no la marca personal del coach.
- Coach sigue usando su app/panel normal de coach, pero bajo identidad visual enterprise.

### White-Label Trends 2026 Aplicables

Investigacion mayo 2026 muestra que white-label enterprise ya no es solo logo + color. Los compradores esperan:

- dominio/subdominio propio;
- portal responsive mobile-first;
- configuracion por tenant;
- brand governance para evitar combinaciones inaccesibles;
- assets coherentes en emails, loaders, PWA manifest y login;
- dashboards/reportes con branding;
- permisos y controles;
- seguridad y auditoria;
- experiencia que no delate al proveedor base en momentos clave.

Aplicacion EVA:

- EVA puede seguir existiendo como powered-by opcional segun plan/contrato.
- En experiencia del alumno y coach enterprise, la marca visible principal es la empresa.
- La marca debe poder escalar a app mobile enterprise futura.

### Regla Cross-Platform Web + React Native

Toda decision de EVA Enterprise debe considerar desde el inicio:

- web/PWA actual;
- futura app mobile React Native;
- contratos compartibles para web+mobile;
- estados, permisos y data model portables;
- diferencias nativas documentadas, no descartadas.

Aplicacion:

- Si una feature existe en web y puede existir en mobile, se diseña para ambas.
- Si una feature solo tiene sentido en React Native, se estudia como roadmap nativo.
- Ejemplos nativos futuros: pasos, smartwatch, HealthKit/Google Fit, notificaciones nativas, widgets.
- No usar servicios pagos para resolver esto salvo decision explicita.

### Research Update White-Label Brand Ops 2026

**Actualizado:** 2026-05-23 22:20:38 -04:00

Fuentes consultadas para esta fase:

- https://www.equal.design/blog/saas-ux-best-practices-b2b-us
- https://www.velocityos.ai/help/portal-setup-branding-access/
- https://www.docsie.io/blog/glossary/white-label-portal/
- https://noloco.io/blog/client-portal-best-practices

Hallazgos aplicables:

- White-label 2026 debe cubrir logo, color, dominio/ruta, mobile, emails/reportes y governance.
- Los portales B2B deben permitir publish controlado, no solo guardar settings sueltos.
- Brand/access changes necesitan auditoria y responsables claros.
- Si no hay presupuesto para herramientas externas, usar configuracion in-app + storage existente es suficiente para validar.

Traduccion EVA:

- Usar `organizations.logo_url/primary_color/name` como draft inicial antes de crear `organization_branding`.
- Publicar debe sincronizar coaches enterprise activos y auditar `brand.published`.
- Mantener pendiente `organization_branding` solo cuando se necesite versionado, rollback o publish avanzado.

### Brand Studio Direction

**Actualizado:** 2026-05-23 22:34:08 -04:00

Brand Center debe evolucionar a Brand Studio, no quedarse como formulario de logo/color.

Criterios 2026 investigados:

- White-label moderno exige que el portal, URLs, emails, loaders y experiencia final no rompan la marca del negocio.
- Dashboard B2B fuerte prioriza claridad, progressive disclosure, permisos visibles y acciones por rol.
- Design systems 2026 deben mantener accesibilidad, theming y responsive web/mobile como obligacion continua.
- EVA debe lograr esto con recursos propios: CSS/tokens, Supabase, auditoria local y previews internos.

Componentes diferenciales sin costo:

- Brand score local: logo, nombre, contraste, readiness de propagacion.
- Brand QA: contraste dark/light, asset presente, nombre visible, warnings antes de publish.
- Propagation map: dashboard enterprise, coach app, alumno PWA, loaders, manifest futuro.
- Web + React Native parity: tokens y estados pensados para web/PWA y futura app mobile.
- Native-only roadmap: pasos, smartwatch, HealthKit/Google Fit, widgets y notificaciones nativas se estudian aparte.
- No CSS/JS custom arbitrario; creatividad dentro de un sistema seguro.

Pendiente avanzado:

- `organization_branding` con draft/published/versionado.
- rollback de publish.
- publish preview antes/despues.
- brand presets por tipo de negocio.
- derivacion automatica de paletas desde logo sin servicio pago, si se implementa localmente.

### Modulo: Brand Center

Ruta:

```text
/org/[slug]/brand
```

Tambien accesible desde:

```text
Settings -> Brand Center
```

Features MVP:

- logo principal;
- logo compacto/app icon;
- isotipo para loader;
- color primario;
- color secundario;
- color de acento;
- modo claro/oscuro preferido;
- preview de contraste;
- preview coach;
- preview alumno;
- preview login enterprise;
- preview loader;
- fallback a tema EVA Enterprise default;
- guardar borrador;
- publicar cambios.

Features avanzadas:

- custom loader:
  - logo pulse;
  - spinner con isotipo;
  - progress ring;
  - skeleton branded;
  - loader minimal premium.
- splash screen PWA;
- manifest PWA por organizacion;
- favicon/app icon por organizacion;
- email header/footer branded;
- nombre visible de app;
- copy corto de bienvenida;
- tono de voz: formal, cercano, deportivo, premium;
- brand lock para coaches;
- plantillas por sede/franquicia futuro.

### Brand Governance

Para evitar temas feos o inaccesibles:

- contraste minimo WCAG AA;
- warning si color primario y fondo no contrastan;
- paletas sugeridas;
- preview dark/light;
- reset a default EVA Enterprise;
- versionado simple:
  - draft;
  - published;
  - last published by;
  - updated at.

### Propagacion De Marca

Cuando se publica brand config:

```text
organization_branding
  -> enterprise dashboard
  -> coach panel for org-created coaches
  -> client PWA for org students
  -> login surfaces
  -> loaders
  -> PWA manifest/icons
  -> email templates future
```

Prioridad de resolucion:

1. Organization branding si existe y usuario pertenece a org enterprise.
2. Coach branding individual si coach independiente.
3. EVA system default.

### Permisos Brand Center

Permisos sugeridos:

```text
brand.view
brand.edit
brand.publish
brand.reset
```

Solo owner/admin/brand manager deberia publicar.

### No-Gos White-Label

- No permitir CSS arbitrario.
- No permitir JS custom.
- No permitir colores que rompan accesibilidad sin warning/bloqueo.
- No permitir que coach enterprise sobreescriba marca de la empresa.
- No mezclar billing coach individual con enterprise.

### Flujo: Dueño Crea Usuario Enterprise

1. Dueño abre `Team & Access`.
2. Click en `Crear usuario`.
3. Ingresa nombre, email y contraseña temporal.
4. Elige rol base o permisos personalizados.
5. Guarda.
6. Sistema crea cuenta enterprise.
7. Sistema registra evento de auditoría.
8. Dueño comparte credenciales por canal externo.
9. Usuario entra por `/org/login`.
10. Primer login fuerza cambio de contraseña y MFA si política lo exige.

MVP acepta contraseña temporal solo si:

- se fuerza cambio en primer login;
- queda auditado;
- se informa compartir fuera de EVA;
- luego se reemplaza por invite link seguro.

---

## Arquitectura de Menús

Navegación principal:

```text
Dashboard
Coaches
Alumnos
Asignaciones
Programas
Check-ins
Reportes
Pagos Alumnos
Brand Center
Team & Access
Settings
Audit Log
```

Utilidades globales:

```text
Search global
Create button
Notificaciones
Date range
Org switcher futuro
Help / onboarding
Account menu
```

---

## Dashboard Home

Ruta:

```text
/org/[slug]
```

Propósito:

Centro de comando del negocio. No una muralla de gráficos.

### Layout Responsive

Desktop:

- sidebar fija;
- top command bar;
- tira de KPIs;
- grilla principal 2 columnas;
- rail derecho para alertas y action queue.

Tablet:

- sidebar colapsable;
- KPIs 2x2;
- action queue bajo health summary.

Mobile/PWA:

- nav compacta o bottom nav;
- action queue primero;
- KPIs en carrusel;
- charts reducidos a cards con drill-down;
- acción primaria sticky.

### Secciones

#### Business Health Header

Muestra:

- Health score `0-100`.
- Tendencia vs semana anterior.
- Alumnos activos.
- Alumnos en riesgo.
- Coaches activos.
- Adherencia semanal.

Visual:

- shell dark enterprise;
- amber para acciones primarias;
- verde/amber/rojo solo como semántica;
- microanimación en cambios de score;
- texto denso, claro, profesional.

#### Action Queue

Lista priorizada de trabajo:

- alumnos sin coach asignado;
- alumnos sin entrenar en 7 días;
- alumnos con 2+ check-ins atrasados;
- coaches con baja actividad;
- nuevos alumnos pendientes de onboarding;
- issues de facturación si aplica.

Cada item:

- severidad;
- responsable;
- motivo;
- acción sugerida;
- CTA directo.

Ejemplos:

- `Asignar 8 alumnos sin coach`.
- `Revisar 12 alumnos en riesgo`.
- `Rebalancear carga de coaches`.
- `Completar onboarding de 3 usuarios enterprise`.

#### Coach Performance

Tabla/cards con:

- coach;
- alumnos asignados;
- alumnos activos;
- adherencia promedio;
- check-ins revisados;
- response/activity score;
- capacidad/overload;
- tendencia.

Acciones:

- ver detalle;
- asignar alumnos;
- transferir alumnos;
- suspender acceso coach si corresponde;
- exportar reporte.

#### Student Risk Radar

Lista priorizada:

- no entrenó recientemente;
- nutrición inactiva;
- check-in atrasado;
- sin plan asignado;
- sin coach asignado;
- baja adherencia.

Acciones:

- asignar/reasignar coach;
- abrir perfil;
- crear tarea de seguimiento;
- exportar CSV;
- asignación masiva.

#### Activity Timeline

Feed organizacional:

- usuario enterprise creado;
- coach invitado;
- alumno asignado;
- programa asignado;
- check-in enviado;
- riesgo cambiado;
- export generado.

Sirve para soporte, accountability y confianza.

#### Insights

Primera capa analítica:

- observaciones simples;
- no prometer predicción si no existe modelo;
- separar facts de recomendaciones.

Ejemplos:

- `Los alumnos nuevos sin coach asignado en 48h tienen menor adherencia inicial.`
- `Coach A mantiene mejor cumplimiento de check-ins esta semana.`
- `La mayor caída está en alumnos sin actividad nutricional.`

---

## Área Coaches

Ruta:

```text
/org/[slug]/coaches
```

Propósito:

Gestionar fuerza de trabajo y performance.

Features:

- directorio de coaches;
- estado: activo, invitado, suspendido;
- alumnos asignados;
- capacidad objetivo;
- activity score;
- adherencia promedio de sus alumnos;
- velocidad de respuesta/check-ins;
- cobertura de programas;
- último activo.

Detalle coach:

```text
/org/[slug]/coaches/[coachId]
```

Tabs:

- Overview.
- Alumnos.
- Performance.
- Programas.
- Actividad.
- Acceso.

Diseño:

- tabla densa desktop;
- cards mobile;
- sparklines;
- filtros persistentes;
- colores solo para estado.

---

## Área Alumnos

Ruta:

```text
/org/[slug]/students
```

Propósito:

Gestionar pool compartido de alumnos.

Features:

- directorio con filtros:
  - asignado/no asignado;
  - coach;
  - adherencia;
  - riesgo;
  - onboarding;
  - último workout;
  - último check-in.
- selección masiva;
- asignación/reasignación masiva;
- crear alumno;
- importar CSV;
- exportar CSV;
- estados:
  - invitado;
  - onboarding;
  - activo;
  - en riesgo;
  - pausado;
  - archivado.

Detalle alumno desde enterprise:

- vista operacional;
- no reemplaza edición coach;
- muestra coach asignado, plan, adherencia, riesgo y timeline;
- acciones según permisos.

---

## Área Asignaciones

Ruta:

```text
/org/[slug]/assignments
```

Propósito:

Convertir asignación alumno-coach en workflow central.

### Research Update Scheduling/Capacity UX 2026

**Actualizado:** 2026-05-23 18:02:03 -04:00

Fuentes consultadas para esta fase:

- https://www.equal.design/blog/saas-ux-best-practices-b2b-us
- https://www.onething.design/post/b2b-saas-ux-design
- https://fieldcode.com/en/field-service-daily/what-makes-field-service-scheduling-break-down-at-scale
- https://knowledge.kantata.com/hc/en-us/articles/360035345993-Insights-Classic-Staffing-Capacity-Dashboard

Hallazgos aplicables:

- Operaciones B2B 2026 prioriza claridad, outcomes y reduccion de carga cognitiva sobre dashboards decorativos.
- Interfaces por rol y progressive disclosure evitan mostrar controles peligrosos antes de tener permisos/modelo robusto.
- La asignacion escala mal cuando depende de memoria humana y no muestra capacidad, excepciones y efecto domino.
- Dashboards de staffing/capacity deben responder rapido: quien tiene demanda, quien tiene capacidad y donde hay riesgo.

Traduccion EVA:

- Asignaciones debe empezar como cockpit read-only antes de habilitar mutations.
- Desktop necesita tablero de capacidad y queue; mobile necesita stepper guiado.
- Cada cambio futuro debe mostrar impacto antes/despues y escribir audit event.
- Bulk assign debe tener preview, confirmacion y camino de rollback.

Features:

- queue de alumnos sin coach;
- tablero de capacidad por coach;
- drag-and-drop desktop;
- flujo stepper mobile;
- warning por sobrecarga;
- historial de asignaciones;
- reasignación masiva.

Flujo:

1. Seleccionar alumnos.
2. Elegir coach.
3. Ver impacto en capacidad.
4. Confirmar.
5. Escribir audit event.
6. Coach ve alumnos nuevos en su dashboard.

---

## Área Programas

Ruta:

```text
/org/[slug]/programs
```

Propósito:

Visibilidad sobre estandarización y uso de programas sin reemplazar builder del coach.

Features:

- templates usados por la organización;
- cobertura de asignaciones;
- programas más usados;
- adherencia por programa;
- coaches que usan/no usan templates org;
- futuro: templates bloqueados por organización.

Permisos:

- owner/admin ve uso;
- program manager puede crear templates org;
- coach mantiene edición individual salvo política enterprise futura.

---

## Área Check-ins

Ruta:

```text
/org/[slug]/check-ins
```

Propósito:

Seguimiento operacional de check-ins.

Vistas:

- pendientes;
- atrasados;
- revisados/no revisados;
- por coach;
- por riesgo;
- calendario.

Métricas:

- completion rate;
- response time coach;
- alumnos con progreso crítico;
- volumen semanal.

---

## Área Reportes

Ruta:

```text
/org/[slug]/reports
```

Propósito:

Convertir uso de EVA en decisiones de negocio.

Reportes MVP:

- reporte semanal operacional;
- performance por coach;
- adherencia alumnos;
- alumnos en riesgo;
- capacidad/asignaciones.

Export:

- CSV primero;
- PDF después;
- scheduled email después.

### Research Update Reporting/Decision Intelligence UX 2026

**Actualizado:** 2026-05-23 22:04:56 -04:00

Fuentes consultadas para esta fase:

- https://designpixil.com/blog/saas-dashboard-ux-best-practices
- https://www.merveilleux.design/en/blog/article/saas-dashboard-design-ux
- https://www.orbix.studio/blogs/b2b-saas-dashboard-design-examples
- https://help.gooddata.com/doc/enterprise/en/dashboards-and-insights/dashboards/export-dashboards/

Hallazgos aplicables:

- Reportes B2B 2026 deben organizarse por decision y urgencia, no por cantidad de graficos.
- Enterprise buyers esperan vistas listas para stakeholders, no solo dashboards para operadores.
- Progressive disclosure y exports claros reducen ruido para owners que revisan semanalmente.
- CSV sirve para analisis externo; PDF sirve para lectura ejecutiva. No son el mismo producto.

Traduccion EVA:

- `/org/[slug]/reports` debe empezar como weekly brief read-only.
- Exports quedan bloqueados hasta permiso dedicado + audit event.
- Metricas avanzadas no se prometen hasta normalizar workout/check-in/payment facts.
- El reporte debe mostrar formula status para no vender insights falsos.

Métricas:

- alumnos activos;
- nuevos alumnos;
- pausados/churn;
- workout completion;
- adherencia nutricional;
- check-in completion;
- carga por coach;
- response velocity;
- program coverage.

Librerías:

- Recharts para gráficos.
- TanStack Virtual para tablas grandes.
- dnd-kit para assignment board.
- date-fns para rangos.
- shadcn/Base UI/Radix para accesibilidad.

Evitar BI pesado hasta que exista dolor real.

---

## Área Pagos Alumnos

Ruta:

```text
/org/[slug]/payments
```

Propósito:

EVA Enterprise por ahora no cobra a los alumnos dentro de la app ni procesa pagos del gimnasio. Esta area es operacional: permite registrar, controlar y reportar estado de pago de alumnos si la empresa quiere usar EVA como control interno.

Features:

- estado manual de pago por alumno;
- periodo pagado;
- fecha de vencimiento;
- metodo externo: efectivo, transferencia, POS, MercadoPago externo, otro;
- monto referencial;
- notas internas;
- comprobante adjunto futuro;
- filtros: pagado, pendiente, vencido, becado, pausado;
- export CSV;
- alertas de alumnos vencidos;
- indicador de riesgo comercial en dashboard.

No-goals MVP:

- no checkout dentro de EVA;
- no suscripciones alumno dentro de EVA;
- no conciliacion bancaria automatica;
- no emitir boletas/facturas desde EVA en esta fase.

Futuro opcional:

- integracion con MercadoPago/Stripe/Transbank si el negocio lo valida;
- conciliacion por CSV;
- link de pago externo;
- reportes MRR/churn comercial;
- integracion contable.

Chile/legal:

- dejar claro que EVA no reemplaza sistema contable ni emision tributaria en MVP;
- campos de monto/estado son registro operacional interno;
- revisar lenguaje antes de mostrarlo a clientes enterprise.

### Research Update Payment Ops UX 2026

**Actualizado:** 2026-05-23 18:05:05 -04:00

Fuentes consultadas para esta fase:

- https://designpixil.com/blog/saas-dashboard-ux-best-practices
- https://designpixil.com/blog/fintech-dashboard-design
- https://www.gitnexa.com/blogs/saas-dashboard-ux-patterns
- https://www.saasui.design/blog/7-saas-ui-design-trends-2026

Hallazgos aplicables:

- Dashboards financieros deben ser decision-first: que esta pagado, que falta, que vence y que necesita accion.
- En contexto fintech/payment ops, el detalle de transaccion importa mas que una tarjeta bonita.
- Role-based views evitan mezclar billing, operaciones y finanzas para usuarios que no deben verlo.
- Progressive disclosure reduce errores en pantallas sensibles como pagos, export y conciliacion.

Traduccion EVA:

- Pagos alumnos empieza como ledger operacional, no como checkout.
- Si no existe source of truth de pagos, mostrar "sin registro" antes que inventar estados.
- Export CSV y filtros solo despues de tabla real + permisos + audit log.
- Copy legal debe aclarar que EVA no emite boleta/factura ni reemplaza contabilidad.

---

## Team & Access

Ruta:

```text
/org/[slug]/team
```

Propósito:

Dueño controla quién entra a plataforma enterprise y qué puede hacer.

### Research Update RBAC/IAM 2026

**Actualizado:** 2026-05-23 17:56:15 -04:00

Fuentes consultadas para esta fase:

- https://dardesign.io/blog/multi-role-b2b-saas-ux-roles-permissions-flows
- https://www.csoonline.com/article/4148282/6-key-trends-reshaping-the-iam-market.html
- https://www.propelauth.com/post/guide-to-rbac-for-b2b-saas
- https://amplitude.com/docs/admin/account-management/rbac-best-practices

Hallazgos aplicables:

- RBAC moderno ya no basta con `admin/member/viewer`; enterprise espera roles por tenant y permisos por recurso.
- El modelo debe evitar permission creep: roles base claros + custom permissions solo cuando haga falta.
- La UI debe explicar que significa cada rol y que areas quedan bloqueadas.
- Estados de acceso denegado deben decir por que y como pedir permiso, no mostrar pantallas vacias.
- MFA y audit log son parte del producto enterprise, no configuraciones escondidas.
- Access review / last login / status son señales importantes para dueños.

Traduccion EVA:

- Team & Access debe mostrar una matriz visual de roles/permisos.
- Cada usuario enterprise debe tener estado, rol, ultimo acceso y cobertura MFA.
- Coaches y alumnos quedan fuera de esta lista salvo referencia contextual.
- Todas las mutations futuras de staff deben escribir audit log.

Tipos:

- owner;
- admin;
- operations manager;
- payments manager;
- brand manager;
- analyst/read-only;
- implementation/support collaborator.

No son enterprise users:

- coach;
- alumno.

### Roles Base

Owner:

- todo;
- no puede ser eliminado por no-owner.

Admin:

- gestiona coaches;
- gestiona alumnos;
- asigna alumnos;
- ve reportes;
- gestiona staff excepto owner;
- pagos/branding solo si se le da permiso.

Operations Manager:

- asignaciones;
- performance;
- alumnos/coaches;
- no billing ni staff.

Payments Manager:

- estados de pago alumno;
- vencimientos;
- exports de pagos;
- sin datos sensibles de alumnos por defecto.

Brand Manager:

- Brand Center;
- previews;
- publicar white-label;
- no permisos operacionales por defecto.

Analyst:

- reportes;
- export si se permite;
- sin mutations.

Custom:

- matriz granular.

### Permisos Sugeridos

```text
org.view_dashboard
org.view_reports
org.export_reports
coach.view
coach.invite
coach.suspend
student.view
student.create
student.assign
student.archive
program.view
program.manage_templates
checkin.view
payment_status.view
payment_status.manage
brand.view
brand.edit
brand.publish
staff.view
staff.create
staff.update_permissions
staff.deactivate
settings.manage
audit.view
```

---

## Settings

Ruta:

```text
/org/[slug]/settings
```

Features:

- perfil organización;
- branding;
- política de seguridad;
- MFA requerido;
- capacidad default por coach;
- umbrales de riesgo alumno;
- notificaciones;
- data export;
- audit log settings.

---

## Audit Log

Ruta:

```text
/org/[slug]/audit
```

Eventos:

- staff creado/desactivado;
- permisos cambiados;
- alumno asignado/reasignado;
- coach invitado/suspendido;
- export generado;
- acción billing;
- settings cambiados.

Campos:

- timestamp;
- actor enterprise user id;
- action;
- target type/id;
- metadata;
- IP/user agent si disponible.

### Research Update Audit/RBAC Evidence 2026

**Actualizado:** 2026-05-23 18:09:24 -04:00

Fuentes consultadas para esta fase:

- https://agnitestudio.com/blog/designing-tamper-resistant-audit-trails-compliance-systems/
- https://agnitestudio.com/blog/audit-trail-requirements-saas-compliance/
- https://www.mainfoundry.com/saas-rbac-audit-logging-security
- https://www.enterpriseready.io/features/audit-log/

Hallazgos aplicables:

- Audit log enterprise no es solo historial: es evidencia de seguridad y tenant isolation.
- Eventos debiles tipo "user updated record" no sirven; deben probar actor, accion, target, tenant y contexto.
- Buyers enterprise esperan audit logs exportables, buscables y conectados a RBAC.
- Exportar o leer logs tambien debe tener permisos dedicados y generar su propio audit event.

Traduccion EVA:

- Usar `org_audit_logs` existente antes de crear tablas nuevas.
- `/org/[slug]/audit` empieza read-only para validar evidencia y taxonomia.
- Todas las mutations futuras deben usar helper central de audit events.
- Antes de export CSV: filtros, permisos, retention y evento `audit.exported`.

---

## Dirección Visual

### Research Update - Mayo 2026

**Actualizado:** 2026-05-23 18:07:00 -04:00  
**Motivo:** incorporar tendencias actuales de UI/UX enterprise, dashboards B2B, PWA y white-label antes de seguir implementando fases visuales.

Hallazgos aplicables:

- Dashboards B2B 2026 estan migrando de "pared de metricas" a **orchestrator dashboards**: una vista que prioriza decisiones, action queue, contexto y proximos pasos.
- Enterprise buyers evaluan claridad operacional antes de firmar. La UI debe explicar valor sin demo guiada.
- Progressive disclosure gana sobre dashboards saturados: mostrar resumen accionable primero, drill-down despues.
- Dense-clean UI: alta densidad para operadores, pero con jerarquia fuerte, tablas utiles y espacios controlados.
- Explainable UI: si aparece un score o insight, debe explicar por que existe y que accion recomienda.
- PWA/responsive sigue vigente cuando se disena app-like: navegacion compacta, acciones sticky, offline/fast states futuros.
- Design systems 2026 priorizan tokens, accesibilidad, theming y governance, no cantidad de componentes.
- White-label enterprise moderno exige custom domain/portal, branding profundo, loaders, manifests, emails, reportes y ausencia de rastros visibles del proveedor base donde importa.
- Accesibilidad y compliance son parte del valor enterprise, no una etapa posterior.

Traduccion para EVA Enterprise:

- El dashboard home debe funcionar como **Action Command Center**, no como analytics decorativo.
- Cada grafico debe tener texto de estado y accion sugerida.
- Cada modulo debe tener vista desktop densa y mobile/PWA simplificada.
- Brand Center debe gobernar marca de enterprise, coaches enterprise y alumnos.
- La identidad EVA puede quedar como "powered by" opcional, nunca competir con la marca del cliente enterprise.

### Sensación

Premium, operacional, seria. Menos "fitness app", más "business command center".

### Paleta

- dark neutral/zinc como base;
- amber enterprise para acción primaria;
- green/amber/red solo para estado;
- evitar azul coach como color dominante;
- evitar fondos decorativos pesados.

### Layout

- denso pero respirable;
- tablas para datos repetidos;
- cards solo para KPIs, entidades repetidas, summaries y modals;
- no cards dentro de cards;
- empty states con acción real;
- acciones core visibles en mobile.
- progressive disclosure:
  - resumen primero;
  - causa/razon despues;
  - accion final siempre visible.
- cada score debe mostrar:
  - formula o proxy;
  - ultima actualizacion;
  - recomendacion.
- cada chart debe tener alternativa textual:
  - estado;
  - tendencia;
  - dato numerico principal.

### Animación

Usar movimiento para claridad:

- expansión de filas;
- drawers;
- drag feedback;
- count-up de KPIs;
- transición de risk status;
- skeletons.

Respetar `prefers-reduced-motion`.

### Blueprint Mobile/PWA

Cada área web debe traducirse a mobile:

- Dashboard -> health feed + KPI carousel.
- Coaches -> cards filtrables.
- Alumnos -> lista action-first.
- Assignments -> stepper, no depender de drag.
- Reports -> report cards y charts compactos.
- Team -> lista usuarios + permission sheet.

Documentar equivalentes RN en componentes complejos cuando se implementen.

---

## Arquitectura

Ruta objetivo:

```text
apps/web/src/app/org/[slug]/
  page.tsx
  layout.tsx
  loading.tsx
  _data/
    org-dashboard.queries.ts
  _actions/
    org-dashboard.actions.ts
    org-staff.actions.ts
    org-assignments.actions.ts
  _components/
    dashboard/
    coaches/
    students/
    assignments/
    reports/
    brand/
    team/
```

No renombrar rutas existentes sin necesidad.

Data flow obligatorio:

```text
_data/*.queries.ts
  -> services/org/org.service.ts
  -> infrastructure/db/org.repository.ts
  -> Supabase
```

No crear Supabase direct feature reads nuevos en `_data`.

Tipos y contratos:

- `domain/org/types.ts`;
- `packages/schemas`;
- `infrastructure/db/org.repository.ts`;
- `services/org/org.service.ts`.

---

## Modelo de Datos a Confirmar

Antes de migrar:

- revisar tablas org actuales;
- revisar RLS;
- revisar `organization_members`;
- evitar duplicar si ya existe base útil.

Posibles tablas:

```text
organization_users
organization_roles
organization_permissions
organization_user_permissions
client_assignment_events
organization_branding
student_payment_status
```

Ya existen y no deben duplicarse:

- `organization_members`;
- `coach_client_assignments`;
- `org_audit_logs`;
- `org_invoices`;
- `payment_exceptions`.

Si `clients.coach_id` es source of truth actual, mantenerlo y agregar historial primero.

---

## Seguridad

- Coaches no acceden enterprise salvo cuenta enterprise separada.
- Staff enterprise no accede coach dashboard salvo cuenta coach separada.
- RLS por organización.
- Permission checks server-side.
- Mutations enterprise escriben audit log.
- Exports requieren permiso explícito.
- Billing separado de datos sensibles de alumnos.
- Pagos alumnos es registro operacional, no cobro in-app.
- Branding enterprise no puede ser editado por coach.
- Brand publish requiere permiso dedicado y audit log.
- Temporary password flow revisado por Security.
- MFA recomendado/obligatorio por org policy.

---

## Fases

### Fase 0 - Discovery y Spec Lock

**Estado:** COMPLETADA parcialmente para primer slice.  
**Completado:** 2026-05-23 17:42:51 -04:00  
**Notas:** Se crearon `specs/enterprise-dashboard-revenue-mvp/{SPEC,PLAN,TASKS}.md`. No hubo cambios DB ni Supabase remoto.

- [x] Confirmar DB/RLS actual a nivel de alcance: primer slice usa datos existentes y Supabase local.
- [x] Crear `specs/enterprise-dashboard-revenue-mvp/{SPEC,PLAN,TASKS}.md`.
- Definir matriz exacta de permisos.
- Definir fórmulas de métricas.

### Fase 1 - Shell Visual y Navegación

**Estado:** COMPLETADA para primer slice read-only.  
**Completado:** 2026-05-23 17:42:51 -04:00  
**Notas:** Se actualizo shell `/org/[slug]`, dashboard home y placeholders seguros para menus nuevos. Sin migrations, sin mutations, sin nuevas queries directas.

- [x] Layout enterprise premium.
- [x] Sidebar/topbar responsive.
- [x] Loading/empty/demo states iniciales via placeholders.
- [x] Empty/demo states.
- [x] Sin DB changes.

### Fase 2 - Dashboard Data MVP

**Estado:** INICIADA en modo read-only con datos existentes.  
**Completado parcial:** 2026-05-23 17:42:51 -04:00  
**Notas:** Dashboard ya muestra health score, KPI strip, action queue, coach performance basico y student risk basico. Falta metricas reales avanzadas y activity feed persistente.

- [x] Health score inicial.
- [x] KPI strip.
- [x] Action queue.
- [x] Coach performance table basica.
- [x] Student risk list basica.
- Activity feed.

### Fase 3 - Team & Access MVP

- **Estado:** INICIADA con preview read-only.
- **Completado parcial:** 2026-05-23 17:55:15 -04:00
- **Notas:** `/org/[slug]/team` ya muestra control plane visual de identidad, usuarios enterprise separados de coaches, postura de seguridad y matriz de roles. Sin persistencia, sin creacion de usuarios, sin mutations, sin cambios RLS y sin DB changes.

- [x] Lista staff enterprise read-only.
- [x] Separacion visual enterprise users vs coaches vinculados.
- [x] Matriz visual de roles base.
- [x] Security posture preview.
- Crear usuario con email + password temporal.
- Roles.
- Permisos.
- Audit events.
- First-login reset/MFA si aplica.

### Fase 4 - Brand Center y White-Label Propagation

**Estado:** INICIADA con controles funcionales sobre modelo existente.
**Completado parcial:** 2026-05-23 22:34:08 -04:00
**Notas:** `/org/[slug]/brand` ya permite guardar nombre/color, subir logo a `org-assets`, publicar marca a coaches enterprise activos, ver Brand score, QA visual, propagation map y web/mobile parity. Coaches con `subscription_status = org_managed` no ven `Mi Marca` ni `Suscripcion`, y middleware bloquea acceso directo a esas rutas. Sin nuevas dependencias y sin migrations porque ya existen `organizations` + campos de branding en `coaches`. Queda pendiente modelo dedicado `organization_branding` para versionado/rollback/publish avanzado.

- [x] Brand Center preview.
- [x] Upload/seleccion logo.
- [x] Paleta y contraste preview.
- [x] Loader custom preview.
- [x] Previews coach/alumno/enterprise.
- [x] Brand score local.
- [x] Brand QA visual.
- [x] Propagation map.
- [x] Web + React Native parity notes.
- [x] Publicar brand config inicial a coaches enterprise.
- [x] Ocultar `Mi marca` y `Billing` en coaches enterprise. Verificado en sidebar + middleware el 2026-05-23 22:36:52 -04:00.
- [x] Aplicar branding enterprise en alumnos via coaches enterprise actualizados.
- [x] Audit events de cambios de marca.

### Fase 5 - Asignaciones

- **Estado:** INICIADA con preview read-only.
- **Completado parcial:** 2026-05-23 18:02:03 -04:00
- **Notas:** `/org/[slug]/assignments` ya muestra queue de alumnos sin coach, capacidad por coach, sobrecarga, cupos sugeridos y reglas para el flujo editable. Sin drag-and-drop, sin mutations, sin audit writes y sin DB changes.

- [x] Queue alumnos sin coach read-only.
- [x] Capacidad por coach read-only.
- [x] Warning visual por sobrecarga.
- [x] Reglas de bulk assign seguro.
- Asignar/reasignar.
- Historial.
- Bulk assign.

### Fase 6 - Pagos Alumnos Operacional

- **Estado:** INICIADA con preview read-only.
- **Completado parcial:** 2026-05-23 18:05:05 -04:00
- **Notas:** `/org/[slug]/payments` ya muestra ledger operacional read-only, estados MVP, guardrails legales/financieros y decision tecnica pendiente para source of truth. Sin montos reales, sin cobro in-app, sin export, sin mutations y sin DB changes.

- [x] Ledger operacional read-only.
- [x] Estados MVP visibles: pagado, pendiente, vencido, becado, pausado.
- [x] Guardrails: no checkout, no facturacion tributaria, no contabilidad.
- [x] Cobertura real sin inventar payment statuses.
- Vencimientos.
- Filtros pagado/pendiente/vencido.
- Export CSV.
- Alertas en dashboard.
- Sin cobro in-app.

### Fase 7 - Reportes y Exports

- **Estado:** INICIADA con preview read-only.
- **Completado parcial:** 2026-05-23 22:04:56 -04:00
- **Notas:** `/org/[slug]/reports` ya muestra weekly brief, KPIs conservadores, coach performance por carga, findings, exports bloqueados y formula status. Audit Log ya tiene CSV real owner-only con audit event. Reportes CSV/PDF siguen pendientes.

- [x] Reporte semanal read-only.
- [x] Coach performance por carga actual.
- [x] Student risk basico por sin coach/inactivos.
- [x] Pagos enterprise operacional via invoices pendientes.
- [x] CSV export audit con permiso dedicado `org.audit.export`.
- PDF después.

### Fase 7A - Audit Log Read-Only

- **Estado:** COMPLETADA para preview real read-only.
- **Completado:** 2026-05-23 18:09:24 -04:00
- **Notas:** `/org/[slug]/audit` ya lee `org_audit_logs` existente via repository/query layer y muestra timeline, actores, target types, guardrails, export CSV owner-only y politica fail-closed para audit export. Sin migrations ni dependencias.

- [x] Reusar tabla `org_audit_logs` existente.
- [x] Timeline read-only de eventos.
- [x] Estado del modelo y RLS visible.
- [x] Guardrails para export y helper central futuro.
- [x] Helper central para escribir audit events.
- [x] Normalizar taxonomia de acciones.
- [x] Export CSV con permiso dedicado. Completado el 2026-05-23 22:36:52 -04:00.

### Fase 7B - Audit Event Helper

- **Estado:** INICIADA con cobertura mayoritaria.
- **Completado parcial:** 2026-05-23 21:59:56 -04:00
- **Notas:** Se agrego `writeOrgAuditEvent()` en `services/org/org.service.ts` y se conecto a mutations reales de announcements, nutrition templates, enterprise coaches, clientes y bulk reassignment. Sin migrations porque `org_audit_logs` ya existe. Falta decidir si la escritura de audit debe ser fail-closed via RPC/transaccion para operaciones sensibles.

- [x] Helper central en service layer.
- [x] Taxonomia inicial `resource.action`.
- [x] Audit events para announcements.
- [x] Audit events para nutrition templates.
- [x] Migrar staff/coaches/client actions al helper.
- [x] Definir politica fail-open vs fail-closed para exports: fail-closed si falla audit event.
- [ ] RPC transaccional para mutations sensibles.

### Fase 8 - Sales/Implementation Layer

- **Estado:** INICIADA con workspace de implementation.
- **Completado parcial:** 2026-05-23 22:45:03 -04:00
- **Notas:** `/org/[slug]/onboarding` fue rearmado como implementation workspace responsive con readiness score, outcome checklist, rutas directas a modulos y CSM notes. Se agrego seed opt-in local `npm run seed:enterprise-demo:local` para demo org realista en Supabase local. Sin herramientas pagas, sin nuevas dependencias y sin migrations. Las mutations existentes de onboarding ahora escriben audit events.

- [x] Demo org con datos realistas. Ejecutado localmente el 2026-05-23 22:45:03 -04:00.
- [x] Checklist onboarding orientado a outcomes.
- [x] Guia implementacion inline sin herramienta externa.
- [x] Estados utiles para CSM.
- [x] Audit events para onboarding progress/branding/completion.

### Research Update Onboarding/Implementation 2026

**Actualizado:** 2026-05-23 22:13:27 -04:00

Fuentes consultadas para esta fase:

- https://www.equal.design/blog/saas-ux-best-practices-b2b-us
- https://www.onboard-success.com/playbooks/saas-onboarding-checklist-2026
- https://www.docebo.com/learning-network/blog/b2b-customer-onboarding/
- https://www.velaris.io/articles/saas-onboarding-checklist-ensuring-smooth-customer-journeys

Hallazgos aplicables:

- Onboarding B2B no debe medir solo pasos completados; debe medir time-to-value y outcomes.
- Checklists funcionan mejor cuando separan tareas del cliente, CSM e implementation.
- Para startups sin presupuesto, un workspace in-app + follow-up manual es mejor que pagar herramientas externas.
- Completion no equivale a success: hay que validar que el negocio logre un cambio observable.

Traduccion EVA:

- Readiness score debe reflejar marca, coaches, alumnos y asignaciones.
- El onboarding puede vivir dentro de EVA sin pagar Customer Success tools.
- Cada avance relevante debe auditarse.
- La demo org queda pendiente hasta tener seed local controlado.

---

## Auditoría por Roles

### Software Architect

- Cuentas enterprise separadas.
- Clean Architecture.
- No duplicar producto coach dentro de enterprise.

### Senior Backend Engineer

- Permisos reutilizables en services.
- Mutations transaccionales con audit.
- Preservar `clients.coach_id` salvo migración explícita.

### Senior Frontend Engineer

- UI densa, responsive, rápida.
- Reutilizar librerías existentes.
- No agregar dependencias pesadas sin necesidad.

### DevOps / Infrastructure Engineer

- Validar env vars enterprise.
- Mantener subdomain/cookie isolation testeable.
- Cuidar límites serverless en exports.

### QA Automation Engineer

- E2E para login, dashboard, permisos, staff creation, assignment, responsive smoke.

### Security Engineer / SecOps

- Server-side authorization.
- Audit log.
- RLS.
- Temporary password review.
- Export permissions.

### SRE

- Logs para fallas dashboard/staff/assignment/export.
- Estados de error soporte-friendly.
- Métricas de latencia y error.

### Product Manager

- Fase 1-2 enfocada en demo y venta.
- No mobile native antes de validar enterprise.
- Priorizar workflows semanales del dueño.

### UX/UI Designer

- Premium operacional.
- Mobile desde día 1.
- Action queue como centro de utilidad.
- Empty states accionables.

### Data Scientist / Data Analyst

- Fórmulas claras.
- Facts separados de insights.
- Risk scoring futuro, sin claims falsos.

### Head of Sales / SDR

Demo story:

1. salud del negocio;
2. alumnos en riesgo;
3. performance coaches;
4. acción inmediata.

### CSM

- Checklist onboarding.
- Explicación health score.
- Reportes compartibles.

### Implementation Specialist

- CSV import.
- Setup capacidad coaches.
- Primera asignación.
- Setup staff.

### Marketing & Growth Lead

- Screenshots vendibles.
- Beneficios visibles sin explicación larga.
- Consistencia con enterprise landing.

### Legal & Compliance Chile

- Revisar lenguaje de pagos alumnos como registro operacional, no cobro/facturacion tributaria.
- Privacidad de alumnos.
- Acceso staff a datos sensibles.
- Términos de uso enterprise.

### Fintech / Integrations Specialist

- EVA Enterprise MVP no cobra dentro de la app.
- Preparar abstraccion para payment status interno.
- Evaluar MercadoPago/Stripe/Transbank solo si el negocio valida cobro in-app futuro.

### FinOps Specialist

- Medir costos por coaches, alumnos, storage, exports, reportes programados futuros.

---

## Acceptance Criteria MVP

- [ ] Dueño entiende salud del negocio en menos de 30 segundos.
- [ ] Dueño identifica alumnos en riesgo.
- [ ] Dueño identifica carga/performance de coaches.
- [ ] Dueño crea staff enterprise con rol/permisos.
- [ ] Dueño configura white-label enterprise.
- [ ] White-label enterprise se aplica a coaches enterprise y alumnos.
- [ ] Coaches enterprise no ven `Mi marca` ni `Billing`.
- [ ] Staff enterprise separado de coach/alumno.
- [ ] Dueño asigna/reasigna alumnos a coaches.
- [ ] Dueño puede registrar estado de pago alumno sin cobro in-app.
- [ ] Mutations enterprise escriben audit log.
- [ ] Dashboard responsive desktop/tablet/mobile.
- [ ] No direct feature-data Supabase calls nuevos en `_data`.
- [ ] `npm run typecheck` pasa.
- [ ] E2E smoke cubre login, dashboard, permisos y asignación.

---

## No Construir Todavía

- App nativa EVA Enterprise.
- AI predictiva compleja.
- BI builder completo.
- SAML/SCIM.
- Dashboard colaborativo realtime.
- Reemplazo del coach builder.
- Dar acceso enterprise automático a coaches.
- Checkout/cobro alumno dentro de EVA.
- CSS/JS custom arbitrario para white-label.

---

## Primer Slice Recomendado

1. Crear `specs/enterprise-dashboard-revenue-mvp`.
2. Pulir shell `/org/[slug]`.
3. Crear dashboard home con:
   - health score;
   - KPI strip;
   - action queue;
   - coach performance table;
   - student risk list.
4. Diseñar Brand Center MVP:
   - logo;
   - colores;
   - loader;
   - preview coach/alumno;
   - reglas de propagacion.
5. Diseñar permission model antes de DB changes.
6. Agregar demo data fallback para ventas/dev.

Este slice es vendible, visualmente fuerte y no obliga a reconstruir todos los menús de una vez.

---

## Referencias De Tendencias White-Label Mayo 2026

Inputs usados para esta version del plan:

- StarterPick: white-label SaaS 2026 enfatiza custom domains, branded portals, multi-tenant branding y reseller/enterprise use cases.
- Basedash: white-label analytics 2026 destaca branding profundo, embedding y semantic/governance layers para dashboards.
- Activo Consulting: custom branding en enterprise portals requiere governance, accesibilidad, consistencia de marca y multi-brand readiness.
- FluxBilling: portales white-label 2026 deben ser mobile-first y no romper experiencia mostrando rastros del proveedor base.
- Reddit SaaS/white-label founder notes 2026: enterprise white-label valora confiabilidad, branding, controles, seguridad, reporting y soporte mas que solo "logo swap".

## Referencias UI/UX Enterprise Mayo 2026

Inputs usados antes de seguir implementando:

- SaaSUI Design 2026: roles, mejores patrones SaaS modernos y B2B con mas carga emocional sin perder claridad.
- Dfeelings B2B UX 2026: predictive/intent-oriented B2B experiences y experiencias globales mas guiadas.
- Brandson Digital dashboard principles: dashboards escalables necesitan jerarquia, foco y navegacion primaria limitada.
- Orbix B2B dashboard trends 2026: progressive disclosure, modulos colapsables y claridad como factor de venta enterprise.
- CorgenX UI/UX 2026: design systems mas livianos, tokens, accesibilidad y extensibilidad por producto.
- GetStream dashboard redesign 2026: alta densidad de informacion puede funcionar si sigue siendo limpia y funcional.
- Outrunly AI SaaS UI 2026: Explainable UI y orchestrator dashboards para generar confianza.
- Accessibility.com 2026: accesibilidad como gobernanza continua, no checklist final.
- Reddit UIUX/SaaS mayo 2026: lo que funciona es menos friccion, rapidez, progressive disclosure y contenido adaptativo util.
