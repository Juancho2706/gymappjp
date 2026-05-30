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

## Identity, Workspace y Acceso - Modelo Canonico

Esta seccion reemplaza las reglas simples anteriores de "cuentas separadas". La decision nueva es mas robusta:

```text
Una identidad global.
Multiples workspaces/contextos.
Un workspace activo por sesion.
Permisos, branding y datos resueltos por workspace activo.
```

### Investigacion Mayo 2026

Fuentes revisadas antes de fijar este bloque:

- Supabase multi-tenant/RLS 2026: identidad en `auth.users`, aislamiento por tablas de membership, RLS y checks server-side.
- B2B SaaS identity 2026: la organizacion/workspace es modelo de primer nivel; un usuario puede pertenecer a varios tenants con roles distintos.
- Mobile/web account switching 2026: la app debe recordar ultimo workspace, permitir cambio rapido y no mostrar superficies irrelevantes al usuario.
- Enterprise access 2026: invitaciones/codigos sirven para enrolar o vincular acceso, no como identidad permanente sin sesion segura.

### Regla Madre de Identidad

- `auth.users.email` debe ser unico global en EVA.
- No duplicar correos entre staff enterprise, coaches y alumnos como si fueran personas distintas.
- Una persona puede tener varios contextos:
  - coach standalone;
  - coach enterprise en una o mas organizaciones;
  - owner/admin/staff enterprise;
  - alumno standalone;
  - alumno enterprise.
- El correo identifica a la persona; el workspace define que puede ver y hacer.
- El codigo enterprise NO reemplaza auth permanente. El codigo activa/vincula un workspace enterprise y luego la app mantiene una sesion segura.

### Separacion de Superficies

- Staff enterprise entra al dashboard enterprise `/org/[slug]`.
- Coach standalone entra al dashboard coach normal y no ve enterprise si no tiene membership enterprise.
- Coach enterprise entra a experiencia coach limitada bajo organizacion, no al dashboard owner/admin.
- Alumno standalone entra a dashboard alumno con marca del coach.
- Alumno enterprise entra a dashboard alumno con marca de la organizacion.
- Alumnos nunca entran al dashboard enterprise.
- Coaches no entran al dashboard enterprise por ser coaches.
- Toda accion sensible debe pasar por server-side permission checks.
- Ocultar botones en UI no es autorizacion.

### Workspace Activo

Cada sesion debe resolver un `activeWorkspace`:

```ts
type ActiveWorkspace =
  | { type: 'coach_standalone'; userId: string; coachId: string }
  | { type: 'enterprise_coach'; userId: string; orgId: string; coachId: string; memberId: string }
  | { type: 'enterprise_staff'; userId: string; orgId: string; memberId: string; role: 'org_owner' | 'org_admin' | 'ops' | 'analyst' | 'brand_manager' }
  | { type: 'student_standalone'; userId: string; clientId: string; coachId: string }
  | { type: 'student_enterprise'; userId: string; clientId: string; orgId: string; coachId: string | null }
```

Reglas:

- Si el usuario tiene un solo workspace, entrar directo.
- Si tiene varios, entrar al ultimo workspace usado.
- Si el ultimo workspace fue revocado, mostrar selector.
- Selector de workspace solo aparece para usuarios con 2+ contextos.
- Standalone no debe ver UI enterprise si no tiene workspace enterprise.
- Enterprise no debe contaminar billing/marca del coach standalone.
- Workspace activo debe persistirse de forma portable web/mobile: server-side preference + storage local solo como cache.

### Coach Enterprise con Codigo

Flujo deseado:

1. App/web muestra login normal de coach.
2. Debajo aparece opcion `Coach Enterprise`.
3. Coach ingresa codigo de empresa/invitacion.
4. Codigo valida organizacion, estado, expiracion, cupo/seats, email esperado si aplica y si ya existe usuario con ese email.
5. Si no existe identidad, crear/activar cuenta segura.
6. Si existe identidad, vincular workspace enterprise.
7. Guardar `last_workspace`.
8. Proximos ingresos abren directo en modo enterprise coach, salvo cerrar sesion o cambiar workspace.

No hacer:

- No usar codigo como password permanente.
- No crear multiples `auth.users` con el mismo email.
- No permitir que un codigo filtrado cree acceso sin trazabilidad.

### Coach con EVA Normal y EVA Enterprise

Caso:

```text
coach@email.com
  -> coach standalone propio
  -> coach enterprise en Org A
```

Debe funcionar asi:

- Un solo `auth.users`.
- Un registro coach puede operar standalone y enterprise si el modelo actual lo soporta, pero las queries deben filtrar por workspace.
- Alumnos standalone: `clients.coach_id = coach.id AND clients.org_id IS NULL`.
- Alumnos enterprise asignados: `clients.org_id = org.id AND clients.coach_id = coach.id`.
- Alumnos enterprise sin asignar: `clients.org_id = org.id AND clients.coach_id IS NULL`.
- Billing standalone solo aplica al workspace standalone.
- Billing enterprise lo maneja la organizacion.
- Branding standalone solo aplica a alumnos standalone.
- Branding enterprise gana siempre si `client.org_id` existe.

UX:

- Si solo tiene standalone: entra directo a coach normal.
- Si solo tiene enterprise coach: entra directo a coach enterprise.
- Si tiene ambos: entra al ultimo workspace usado y puede cambiar desde perfil.
- El selector debe usar labels humanos:
  - `Mi negocio EVA`;
  - `Empresa X - Coach`;
  - `Empresa Y - Coach`.

### Alumno Standalone y Alumno Enterprise

- Alumno con un solo contexto entra directo a su dashboard.
- Alumno con varios contextos ve selector simple:
  - `Entrenar con Coach Pedro`;
  - `Entrenar con Empresa X`.
- Alumno enterprise siempre ve white-label enterprise.
- Alumno standalone siempre ve white-label coach.
- No mezclar historiales, planes, pagos manuales ni notificaciones entre contextos.

### Owner/Staff que Tambien Sea Coach o Alumno

Permitido, pero por workspace separado:

```text
persona@email.com
  -> Empresa X / Owner
  -> Empresa X / Coach operativo
  -> Coach standalone propio
  -> Alumno de Coach Pedro
```

Reglas:

- Ser owner no da permisos automaticos de coach.
- Ser coach no da acceso enterprise admin.
- Ser alumno no desbloquea pantallas coach/admin.
- Cada workspace tiene home, permisos y branding propios.
- UI debe dejar claro en que contexto esta trabajando.

### Regla de Datos Supabase

Objetivo: no mezclar tenants ni contextos.

- `auth.users`: identidad unica.
- `profiles` o `platform_identities`: datos base de persona, si falta crear fase/migration.
- `organizations`: tenant enterprise.
- `organization_members`: membership enterprise por `org_id + user_id`, con `role`, `status`, `coach_id` opcional.
- `coaches`: perfil coach operativo, standalone y/o enterprise segun contexto.
- `clients`: perfil alumno, con `org_id` para enterprise y `coach_id` para asignacion.
- `workspace_preferences`: preferencia de ultimo workspace por usuario y device/app si se necesita.
- `enterprise_invites` o equivalente: codigos de activacion con hash, expiracion, estado, scope, org, rol y audit.

Restricciones deseadas:

- unique global email via Supabase Auth.
- unique membership: `(org_id, user_id)` en `organization_members`.
- unique coach membership por org: `(org_id, coach_id)` cuando `coach_id IS NOT NULL`.
- codigos enterprise almacenados hasheados, no plain text.
- revocar membership no borra usuario ni coach standalone.
- todas las queries enterprise filtran por `org_id`.
- todas las queries standalone excluyen `org_id` cuando corresponda.

### Branding Resolver

Prioridad de marca:

1. Si `activeWorkspace.type` es enterprise staff: marca de organizacion.
2. Si coach enterprise: marca de organizacion.
3. Si alumno enterprise: marca de organizacion.
4. Si coach standalone: marca del coach.
5. Si alumno standalone: marca del coach.
6. Si no hay marca: EVA default.

Esto aplica a dashboard web, PWA, futura app React Native, manifests, loaders, emails/reportes futuros, pantallas de login y selector de workspace.

### Auditoria y Seguridad

- Registrar `workspace.activated` cuando se usa codigo enterprise.
- Registrar `workspace.switched` solo si aporta valor operativo; evitar ruido excesivo.
- Registrar `membership.revoked`, `membership.role_changed`, `invite.created`, `invite.redeemed`, `invite.expired`.
- MFA obligatorio primero para owner/admin; recomendado para staff; opcional para coach enterprise al inicio.
- Login y redeem code con rate limit.
- Codigos con expiracion, max attempts y revocacion.
- No exponer service role en cliente.
- RLS debe validar membership dinamica, no confiar solo en UI.

### UX Login Web/Mobile

Pantalla de entrada recomendada:

```text
Soy coach
  - Coach independiente
  - Coach Enterprise con codigo

Soy alumno
  - Entrar a mi entrenamiento

Soy empresa
  - Dashboard enterprise
```

Comportamiento:

- Recordar ultimo workspace.
- Cierre de sesion borra sesion activa, no borra lista historica local de cuentas conocidas salvo "olvidar este dispositivo".
- Si un usuario tiene varios workspaces, mostrar selector despues de autenticacion.
- En mobile, selector debe ser una pantalla nativa simple, no un menu escondido.
- En web/PWA, selector puede vivir en profile menu y en pantalla post-login.

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

### Auditoria Estado Actual Enterprise Dashboard

**Actualizado:** 2026-05-24 12:50:25 -04:00

Estado real revisado en codigo:

- Layout enterprise actual: `apps/web/src/app/org/[slug]/layout.tsx`.
- Menus actuales: Dashboard, Coaches, Alumnos, Asignaciones, Brand Center, Reportes, Pagos alumnos, Novedades, Nutricion, Team & Access, Settings, Audit Log.
- Rutas reales: `announcements`, `assignments`, `audit`, `brand`, `clients`, `coaches`, `nutrition`, `onboarding`, `payments`, `reports`, `settings`, `setup-mfa`, `team`.
- Menus con rework fuerte: Dashboard, Brand Center/Studio, Team & Access preview, Asignaciones preview, Pagos alumnos funcional inicial, Reportes preview, Audit Log, Onboarding workspace.
- Menus con deuda visual/UX/IA: Coaches, Alumnos, Settings, Novedades, Nutricion.
- Menus con solapamiento: Coaches + Team & Access; Alumnos + Asignaciones; Settings + Brand Center + Billing; Reportes + Audit Log + Exports; Novedades + Nutricion como "Herramientas".

Hallazgo central:

- Hay demasiados items top-level para un dashboard B2B. El owner no necesita 12 entradas principales.
- La navegacion actual mezcla objetos de negocio, operaciones, herramientas, seguridad y settings en el mismo nivel.
- Mobile queda con scroll horizontal largo y baja orientacion.
- Desktop tampoco marca active state ni agrupa por job-to-be-done.

Research IA/Dashboard 2026:

- Dashboards B2B deben funcionar como decision environment: estado rapido, problema, causa, accion.
- SaaS escalable recomienda 4-6 secciones top-level, no un menu por feature.
- Role-based navigation reduce friccion durante pilotos enterprise.
- Onboarding/CS dashboards modernos centralizan progreso, riesgos y proximas acciones.

Fuentes:

- https://dardesign.io/blog/b2b-dashboard-information-architecture-2026
- https://www.brandson.digital/insights/saas-dashboard-design
- https://whatifdesign.co/feeds/blog/saassolar-branding-ui-guidelines
- https://www.velaris.io/articles/include-on-customer-onboarding-dashboard

### IA v2 - Consolidacion de Menus Enterprise

Objetivo:

- Pasar de 12 menus top-level a 6 secciones maximo.
- Mantener URLs existentes para no romper deep links, pero mover navegacion visible a grupos.
- Preparar misma arquitectura mental para futura app EVA Enterprise React Native.

Propuesta top-level:

1. **Command Center**
   - Ruta principal: `/org/[slug]`.
   - Incluye: dashboard, action queue, health score, risks, coach load, shortcuts.
   - Subrutas relacionadas: `/reports` como "Insights" dentro de Command Center.

2. **Operaciones**
   - Incluye: Alumnos + Asignaciones + Pagos alumnos.
   - Rutas actuales: `/clients`, `/assignments`, `/payments`.
   - Razon: son workflows diarios del owner/ops sobre alumnos.

3. **Equipo**
   - Incluye: Coaches + Team & Access.
   - Rutas actuales: `/coaches`, `/team`.
   - Razon: separar tabs internas "Coaches operativos" y "Staff enterprise".

4. **Marca**
   - Incluye: Brand Studio + settings publicos de marca.
   - Rutas actuales: `/brand`, parte de `/settings`.
   - Razon: white-label es un producto, no un formulario de settings.

5. **Herramientas**
   - Incluye: Novedades + Nutricion.
   - Rutas actuales: `/announcements`, `/nutrition`.
   - Futuro: templates de entrenamiento, recursos, automatizaciones.

6. **Seguridad y Admin**
   - Incluye: Settings, Audit Log, MFA, Billing enterprise interno.
   - Rutas actuales: `/settings`, `/audit`, `/setup-mfa`.
   - Razon: todo lo sensible/administrativo queda agrupado.

Reglas de implementacion:

- Mantener rutas existentes.
- Cambiar solo shell/nav visible y titulos/contexto.
- Desktop: sidebar agrupado con labels compactos y active state.
- Mobile: tabs primarias 6 maximo + subnav contextual por seccion.
- No usar nueva libreria paga.
- No agregar estado global.
- Compatible con futura app React Native: groups pueden mapear a bottom tabs + stack screens.

### Backlog Rework Antes de E2E

### Bitacora Compacta de Trabajo Completado

**Compactado el 2026-05-26.** Esta seccion reemplaza la lista larga de checks ya cerrados para dejar el plan legible. Los detalles finos viven en commits y en `specs/identity-workspace-access/TASKS.md`.

**P0 navegacion enterprise completado:**

- Shell `/org/[slug]` con sidebar desktop agrupado y nav mobile primaria.
- Active state y subnav contextual para Command Center, Operaciones, Equipo, Marca, Herramientas, Seguridad/Admin.
- Labels visibles normalizados: Marca, Equipo, Auditoria, Admin.
- Logo enterprise usa `next/image`.

**P1 rework visual base completado:**

- `/coaches`: Equipo > Coaches con stats, capacidad, health y acciones.
- `/clients`: Operaciones > Alumnos con KPIs, filtros, pagos/asignacion e import CSV.
- `/settings`: Seguridad/Admin con datos org, billing manual, seats y guardrails.
- `/announcements`: Novedades con audience preview, expiracion y estado.
- `/nutrition`: templates de nutricion enterprise con macros/meals y biblioteca visual.
- `/brand`: Brand Studio inicial con preview, upload, publish a coaches enterprise y brand score.
- `/audit`: timeline read-only y export CSV owner-only con audit `audit.exported`.
- `/payments`: registro manual de pagos externos, sin cobro in-app.
- `/reports`: snapshot read-only de reportes operacionales.
- `/assignments`: cockpit de carga/asignaciones con cola sin coach, capacidad por coach y asignacion rapida auditada.

**P1.5 Identity & Workspace completado hasta ahora:**

- SPEC/PLAN/TASKS de `identity-workspace-access`.
- Migraciones locales aditivas para `workspace_preferences`, `organization_invites`, nutricion con `org_id`, RLS workspace y storage policies.
- Contratos `ActiveWorkspace`, `WorkspaceSummary`, `WorkspaceBrand`, permisos workspace y `EnterpriseCoachLoginSchema` compartible web/mobile.
- Resolver server-side de workspaces, last workspace, branding y guards de ruta.
- Login `Coach Enterprise` por codigo hasheado, sin romper coach standalone.
- `/org/login` separado para staff enterprise.
- Coach enterprise sin `Mi Marca` ni `Billing`; dashboard coach usa marca org en contexto enterprise.
- Alumno enterprise autenticado ve white-label de la empresa en portal y manifests PWA; standalone conserva marca coach.
- Aislamiento de `/coach/clients`, cliente directo, workout programs/builder, nutricion, dashboard coach y APIs mobile coach por workspace activo.
- RLS local reforzado para `clients`, `workout_programs`, `nutrition_plans`, `nutrition_plan_templates`, `client_payments`.
- Storage policy por path para logos, org-assets y checkins.
- Auditoria base: `invite.created`, `invite.redeemed`, `invite.revoked`, `membership.revoked`, `workspace.activated`, `workspace.switched`.
- Redirect/login/cache: autorizacion decide server-side; `localStorage` queda solo para preferencias visuales/offline.
- Guard pass server actions Enterprise iniciado el 2026-05-26 19:55:20 -04:00: `org.actions.ts` centraliza contexto admin en marca/org/invites/revocacion/reasignacion; `clients.actions.ts` valida org/admin/coach por mutation y evita fallback de alumnos enterprise sin coach a `user.id`.
- Migration local preparada el 2026-05-26 19:55:20 -04:00: `20260526103000_clients_nullable_coach_for_enterprise.sql` permite `clients.coach_id IS NULL` para alumnos enterprise sin asignar; standalone conserva `org_id IS NULL + coach_id NOT NULL` por flujo de app.
- Migration local aplicada el 2026-05-26 20:39:12 -04:00 con `npx supabase db push --local`; verificado `clients.coach_id IS NULL` permitido y `npx supabase db lint --local` sin errores.
- Guard pass server actions Enterprise completado en menus secundarios el 2026-05-26 20:39:12 -04:00: anuncios, templates de nutricion, pagos manuales y onboarding usan `getOrgAdminContext`, validan UUIDs antes de `service_role` y conservan audit/revalidate.
- Export audit avanzado completado el 2026-05-26 20:39:12 -04:00: `/org/[slug]/audit/export` soporta filtros server-side por action/actor/target/date, limita filas, calcula SHA-256 del CSV y registra `row_count`, filtros y checksum en `audit.exported` antes de entregar el archivo.

**Verificaciones ya corridas en fases cerradas:**

- `npm run typecheck`.
- `npm run build`.
- Vitest focalizado login/post-login.
- `npx supabase db push --local`.
- `npx supabase db lint --local`.
- Consultas locales a `pg_policies` en `supabase_db_gymappjp`.

### P1.5 Pendiente Antes de P2 Funcional
- [ ] Documentar flujo coach standalone que se suma a enterprise sin duplicar correo.
- [ ] Documentar flujo owner/staff que tambien es coach/alumno sin mezclar permisos.
- [ ] FUTURO DB: modelo multi-contexto de alumno por email. Problema actual: `clients.id = auth.users.id` impide que el mismo correo tenga varios perfiles de alumno en distintas empresas/coaches sin duplicar auth. Propuesta: crear `client_profiles` o mantener `clients` como perfil y agregar `client_auth_id`, migrar login a buscar memberships por `auth.uid()`, y preservar compatibility con filas existentes. No ejecutar antes de cerrar P1.5 porque toca muchas rutas alumno.
- [ ] Plan de migracion local primero, live despues con backup/rollback.

#### Riesgos Criticos Standalone vs Enterprise Detectados 2026-05-26

Investigacion 2026 revisada despues del slice `/payments`:

- Multi-tenant moderno exige tenant/workspace context en cada decision, no solo `user.id`.
- El riesgo principal en EVA no es UI, es que una query vieja use solo `coach_id` y mezcle alumnos standalone con enterprise.
- La arquitectura debe tratar standalone como workspace propio: `org_id IS NULL`, billing propio, brand coach, permisos coach completos.
- Enterprise debe tratarse como workspace org: `org_id = active_org_id`, billing/brand gestionados por empresa, coach limitado.

Checklist anti-regresion:

- [x] Buscar y auditar queries/mutations que usen `coach_id` sin `org_id`. Avance completado el 2026-05-26 21:51:34 -04:00 para servicios criticos de perfil de alumno coach: pagos manuales, borrado de pagos, meta de peso y repository preventivo `findClientsByCoach`.
  - Cambio: `addPaymentForCoach`, `deletePaymentForCoach` y `updateClientGoalWeightForCoach` ahora reciben scope del workspace activo y validan `clients.org_id` antes de escribir.
  - Cambio: API mobile `/api/mobile/coach/payments` pasa `orgId` resuelto server-side, preservando coach standalone como `org_id IS NULL`.
  - Verificacion: `npm run typecheck` y ESLint focalizado sin errores.
- [x] Continuar auditoria de lecturas por `client_id` en perfil de alumno: nutricion por fecha, workout por fecha, habits y activity dates deben validar pertenencia al workspace antes de devolver datos. Completado el 2026-05-26 21:53:09 -04:00.
  - Cambio: `getClientProfileData`, `getWeeklyCompliance`, `getDynamicMetrics`, historial nutricion/workout por fecha, activity dates y habits usan `assertCoachClientReadAccess`.
  - Resultado: coach standalone solo lee alumnos `org_id IS NULL`; coach enterprise solo lee alumnos del `org_id` activo.
  - Verificacion: `npm run typecheck` y ESLint focalizado sin errores.
- [x] Auditar builder/workout coach por workspace para no mezclar programas entre standalone y enterprise. Completado el 2026-05-26 21:58:08 -04:00.
  - Cambio: builder `/coach/builder/[clientId]` filtra cliente y programa inicial por `org_id` del workspace activo.
  - Cambio: `deactivateActiveProgramsForClient` desactiva solo programas del workspace activo.
  - Cambio: historial de ejercicio valida acceso al alumno antes de leer `workout_logs`.
  - Verificacion: `npm run typecheck` y ESLint focalizado sin errores.
- [x] Auditar propagacion de nutricion coach por workspace. Completado el 2026-05-26 21:59:53 -04:00.
  - Cambio: `NutritionService.propagateTemplateChanges` valida todos los `clientIds` contra `clients.coach_id + org_id` antes de crear/desactivar planes.
  - Cambio: planes existentes propagados filtran `coach_id` y updates vuelven a aplicar `org_id`.
  - Cambio: pagina `/coach/nutrition-plans/client/[clientId]` valida `coach_id` en la query inicial, no solo en el page guard.
  - Verificacion: `npm run typecheck` y ESLint focalizado sin errores.
- [x] Negative tests: coach standalone no ve alumnos enterprise aunque tenga mismo `user.id`. Completado el 2026-05-30. 24/24 tests passing en rls-isolation.spec.ts.
- [x] Negative tests: coach enterprise no ve alumnos standalone cuando workspace activo es org. Completado el 2026-05-30.
- [ ] Negative tests: alumno standalone conserva coach brand y portal `/c/[coach_slug]`.
- [ ] Negative tests: alumno enterprise conserva org brand y no cae a brand del coach.
- [ ] Exports/reportes nunca deben derivar tenant solo desde parametros URL; deben resolver workspace server-side.

Prioridad P2 - completar features que ya existen pero siguen incompletas:

- [ ] BLOQUEADO hasta cerrar P1.5 Identity & Workspace: no avanzar bulk actions, pagos/reportes profundos ni features que toquen coach/alumno.
- [ ] Asignaciones: pasar de preview a cockpit accionable para asignar/reasignar desde `/assignments`, no solo desde alumnos/coaches.
  - [x] Primer slice accionable: asignacion individual desde `/assignments` con preview de carga, guard org/client/coach y audit `client.assigned`. Completado el 2026-05-26 21:11:37 -04:00. Verificacion: `npm run typecheck`, ESLint focalizado.
  - [x] Segundo slice accionable: bulk assign seguro desde `/assignments` con seleccion explicita, contador, preview de carga, limite 50, guard server-side por lote y audit `client.bulk_assigned`. Completado el 2026-05-26 21:32:49 -04:00. Verificacion: `npm run typecheck`, ESLint focalizado, screenshots Playwright desktop/mobile sin overflow horizontal.
- [x] Alumnos: bulk actions seguros. Completado el 2026-05-30. bulkAssignSelectedClientsAction + bulkArchiveClientsAction. ClientsListClient con checkboxes + floating bar. Guards cross-tenant en server action.
- [ ] Pagos alumnos: filtros pagado/pendiente/vencido, vencimientos, export CSV auditado.
  - [x] Filtros por estado y CSV auditado para pagos operacionales. Completado el 2026-05-26 21:44:53 -04:00. Verificacion: `npm run typecheck`, ESLint focalizado, screenshots Playwright desktop/mobile sin overflow horizontal, descarga CSV con header valido.
- [x] Reportes: CSV de weekly brief con `report.exported`, owner/admin permission y audit event. Completado el 2026-05-30. Route /org/[slug]/reports/export, fail-closed audit, metadata header.
- [ ] Audit: filtros por action/actor/date y checksum generation job local/manual.
- [ ] Brand Studio: modelo `organization_branding` con draft/published/versionado/rollback.
- [ ] Team: permisos granulares por feature, no solo `org_owner/org_admin/coach`.
- [ ] Admin: definir flujo comercial para aumentar seats, cambiar plan y registrar contacto legal/finanzas sin cobro in-app.
- [ ] Novedades: evaluar canal separado para coaches enterprise con audience/permissions propios antes de tocar el flujo coach normal.
- [ ] Nutricion: tracking de uso por template/coach y filtros por objetivo cuando exista volumen suficiente de datos.

Prioridad P3 - diferenciadores futuros sin costo externo:

- [ ] "Proof Pack" exportable para ventas/CSM: brand preview, roles, audit, alumnos asignados, reporte semanal.
- [ ] Capacity Autopilot manual: sugerencias de reasignacion por carga/riesgo, con aprobacion humana.
- [ ] Trust Center Lite: permisos, MFA, audit, retention, exports en una vista.
- [ ] Role home: owner, ops/admin, brand manager y analyst ven landing interna distinta.
- [ ] Mobile parity matrix por menu: Web/PWA, RN, native-only.

No hacer todavia:

- No integrar pasarela de pago para alumnos.
- No comprar herramientas de analytics/CSM.
- No crear BI builder complejo.
- No hacer app RN todavia; solo dejar arquitectura portable.

### Fase 0 - Discovery y Spec Lock

**Estado:** COMPLETADA parcialmente para primer slice.  
**Completado:** 2026-05-23 17:42:51 -04:00  
**Notas:** Se crearon `specs/enterprise-dashboard-revenue-mvp/{SPEC,PLAN,TASKS}.md`. No hubo cambios DB ni Supabase remoto.

- [x] Confirmar DB/RLS actual a nivel de alcance: primer slice usa datos existentes y Supabase local.
- [x] Crear `specs/enterprise-dashboard-revenue-mvp/{SPEC,PLAN,TASKS}.md`.
- Definir matriz exacta de permisos.
- Definir fórmulas de métricas.

### Fase 0B - Identity, Workspace y Tenant Isolation

**Estado:** NUEVA / BLOQUEANTE antes de P2 profundo.
**Creada:** 2026-05-24.
**Motivo:** evitar mezcla de datos entre `coach standalone -> alumno` y `enterprise -> coach enterprise -> alumno enterprise`, y preparar UX rapida web/mobile.

#### Resultado Esperado

Un usuario puede tener varias capacidades sin duplicar email ni mezclar datos:

```text
auth.user unico
  -> workspace coach standalone
  -> workspace enterprise coach
  -> workspace enterprise staff
  -> workspace alumno standalone
  -> workspace alumno enterprise
```

La app siempre sabe quien es la persona, que workspaces tiene, cual workspace esta activo, que datos puede leer/escribir, que marca debe ver y que menus no debe ver.

#### Decisiones Arquitectonicas

- Supabase Auth sigue siendo fuente de identidad.
- `auth.users.email` unico global.
- Memberships definen acceso, no emails duplicados.
- Codigos enterprise son activadores de workspace, no passwords permanentes.
- RLS y server actions validan membership real.
- `activeWorkspace` vive en server/domain; UI solo consume decisiones.
- Web/PWA y futura React Native deben compartir tipos/schemas.

#### Modelo Supabase Propuesto

Revisar primero si ya existe algo equivalente antes de crear migrations:

```text
auth.users
profiles/platform_identities
organizations
organization_members
coaches
clients
workspace_preferences
enterprise_invites
org_audit_logs
```

Campos/ideas:

- `workspace_preferences.user_id`
- `workspace_preferences.last_workspace_type`
- `workspace_preferences.last_org_id`
- `workspace_preferences.last_coach_id`
- `workspace_preferences.last_client_id`
- `workspace_preferences.updated_at`
- `enterprise_invites.org_id`
- `enterprise_invites.code_hash`
- `enterprise_invites.role`
- `enterprise_invites.coach_id`
- `enterprise_invites.email`
- `enterprise_invites.status`
- `enterprise_invites.expires_at`
- `enterprise_invites.redeemed_by`
- `enterprise_invites.redeemed_at`
- `enterprise_invites.max_attempts`
- `enterprise_invites.attempt_count`

Restricciones:

- unique `(org_id, user_id)` en `organization_members`.
- unique `(org_id, coach_id)` parcial cuando `coach_id IS NOT NULL`.
- codigo hasheado, nunca plain text persistido.
- revocacion por membership, no borrado destructivo.

#### UX Web/PWA

- Login coach normal se mantiene simple para standalone.
- Agregar entrada secundaria `Coach Enterprise` con codigo.
- No mostrar dashboard enterprise a standalone.
- No mostrar billing/mi marca a coach enterprise.
- Si solo hay un workspace, redirect directo.
- Si hay varios, usar ultimo workspace.
- Selector de workspace:
  - visible en menu perfil;
  - pantalla post-login si no hay ultimo workspace valido;
  - labels humanos y marca clara.

#### UX Mobile React Native Futura

- Mismo modelo de workspaces.
- Selector como pantalla nativa, no menu escondido.
- Persistencia local solo cache; server decide acceso final.
- Native-only future features se cuelgan del workspace correcto:
  - pasos/smartwatch para alumno;
  - notificaciones nativas por org/coach;
  - widgets por alumno/workout.

#### Casos que Deben Quedar Resueltos

- Coach standalone se une a empresa sin crear otro correo.
- Coach enterprise luego crea negocio standalone sin perder empresa.
- Owner enterprise tambien opera como coach.
- Staff enterprise tambien es alumno.
- Alumno tiene contexto standalone y enterprise.
- Empresa revoca coach enterprise sin borrar su coach standalone.
- Empresa cambia marca y solo afecta enterprise.
- Standalone cambia marca y no afecta enterprise.
- Alumno enterprise nunca ve marca del coach si hay `org_id`.
- Alumno standalone nunca ve marca enterprise.

#### Riesgos a Auditar

- Queries coach existentes que no filtren `org_id IS NULL` para standalone.
- Queries alumno que asuman un solo `client` por usuario/email.
- Middleware que redirija por rol global en vez de workspace.
- Sidebar coach que muestre billing/marca a `org_managed`.
- Actions compartidas que escriban datos sin `org_id`.
- RLS policies que validen solo `authenticated` y no membership.
- Caches/localStorage que mantengan workspace revocado.

#### Entregables Antes de Implementar P2

- [x] SPEC `identity-workspace-access`. Completado el 2026-05-24 15:52:13 -04:00.
- [x] PLAN `identity-workspace-access`. Completado el 2026-05-24 15:52:13 -04:00.
- [x] TASKS `identity-workspace-access`. Completado el 2026-05-24 15:52:13 -04:00.
- [x] Auditoria DB actual. Completado el 2026-05-24 15:52:13 -04:00. Nota: auditoria inicial de schema/migrations; RLS tabla por tabla queda pendiente.
- [ ] Diagrama de datos final.
- [ ] Matriz de permisos por workspace.
- [ ] Matriz de branding por workspace.
- [ ] Lista de rutas afectadas web.
- [ ] Lista de contratos compartibles mobile.
- [x] Migrations locales necesarias para alumnos enterprise sin coach. Completado el 2026-05-26 19:55:20 -04:00. Migration: `supabase/migrations/20260526103000_clients_nullable_coach_for_enterprise.sql`; pendiente aplicarla cuando Supabase local este levantado.
- [x] Aplicar migration local y verificar DB. Completado el 2026-05-26 20:39:12 -04:00. Verificacion: `npx supabase migration list --local`, consulta `information_schema.columns` para `clients.coach_id`, `npx supabase db lint --local`.
- [ ] Plan rollback local/live.
- [ ] Criterios QA web/mobile.

#### Regla de Ejecucion y Trazabilidad del Plan

Cuando se implemente codigo para cualquier punto de esta fase:

- marcar el checklist correspondiente como `[x]`;
- agregar fecha/hora exacta `YYYY-MM-DD HH:mm:ss -04:00`;
- describir archivos/rutas/DB afectadas;
- indicar verificacion realizada;
- indicar si afecta web, PWA, futura React Native o Supabase local/live.

Formato:

```text
- [x] Punto N / item. Completado el 2026-05-24 15:30:00 -04:00. Notas: ...
```

#### Auditoria P1.5 por Punto Critico

Cada punto debe ejecutarse en orden. No avanzar al siguiente bloque de features si el punto actual toca datos compartidos y no tiene guardrails.

##### 1. Offboarding / Revocacion

Investigacion 2026:

- Identity governance moderno prioriza revocar accesos no justificados y registrar el resultado.
- En B2B SaaS, offboarding debe revocar membership/roles, no destruir identidad global.

Auditoria EVA:

- Revisar `organization_members.status`, `deleted_at`, `coach_id`.
- Revisar acciones que suspenden coach enterprise.
- Revisar si revocar coach enterprise tambien desasigna alumnos, suspende acceso o solo bloquea workspace.
- Revisar que revocar enterprise no borre coach standalone ni alumno standalone.

Solucion propuesta:

- Crear flujo `membership.revoked` por workspace.
- Revocar acceso enterprise cambiando membership a `revoked`/`inactive`.
- Mantener `auth.users` y registros standalone.
- Si coach enterprise sale, alumnos quedan en cola `unassigned` o reasignacion guiada.
- Registrar audit con actor, target, reason, affected_clients_count.

Fases futuras:

- [x] Auditar schema actual de revocacion. Completado parcialmente el 2026-05-25 18:27:32 -04:00 para `organization_members` y flujo `removeCoachAction`.
- [x] Definir estados canonicos `active`, `invited`, `revoked`, `suspended`. Completado el 2026-05-25 18:27:32 -04:00. Migration local `20260525182500_org_member_revoked_status.sql` permite `revoked` sin cambiar checks activos existentes.
- [x] Crear action segura para revocar staff/coach enterprise. Completado el 2026-05-29. `revokeStaffAction` en `org.actions.ts`: revoca membership, limpia workspace_preferences, audit `membership.revoked`. Guard: owner no revocable, coach redirige a panel coaches, ya-revocado bloqueado.
- [x] Agregar UI de revocacion con preview de impacto. Completado el 2026-05-29. `RevokeStaffButton` en `team/_components/`: dialog con lista de consecuencias, error inline, botón solo para non-owner non-revoked staff. Team page actualizado con columna de acción + status coloreado.
- [ ] Agregar prueba: coach revocado no entra enterprise pero mantiene standalone.

##### 2. RLS y Tenant Isolation

Investigacion 2026:

- Postgres RLS es capa no opcional para Supabase multi-tenant.
- Los leaks ocurren por `WHERE org_id` olvidado, joins indirectos, reports y service role mal usado.

Auditoria EVA:

- Revisar RLS de `clients`, `coaches`, `organization_members`, `org_*`, `client_payments`, `workout_*`, `nutrition_*`.
- Revisar queries enterprise que usan service role.
- Revisar queries standalone que deberian excluir `org_id`.
- Revisar joins que permiten leer por `coach_id` sin validar `org_id`.

Solucion propuesta:

- Policies por tenant con helper SQL estable: `is_org_member(org_id, roles[])`.
- Queries enterprise siempre con `org_id`.
- Queries standalone con `org_id IS NULL` cuando aplique.
- Service role solo en server actions con permission helper y audit.

Fases futuras:

- [ ] Inventariar tablas con datos tenant-sensitive.
- [ ] Crear checklist RLS por tabla.
- [ ] Agregar negative tests org A vs org B.
- [ ] Revisar RPCs transaccionales con `org_id` obligatorio.
- [ ] Documentar excepciones service role.

##### 3. Storage y Archivos

Investigacion 2026:

- Supabase Storage usa RLS en `storage.objects`; bucket publico o path mal definido puede saltarse aislamiento.
- Storage no tiene carpetas reales; policies por prefix deben ser explicitas y testeadas.

Auditoria EVA:

- Revisar buckets `org-assets`, logos, progress photos, PDFs, QR, exports.
- Revisar paths actuales: si usan `coach_id`, `client_id`, `org_id`.
- Revisar buckets publicos vs signed URLs.
- Revisar upload de logos enterprise y coach standalone.

Solucion propuesta:

- Namespace canonico:
  - `orgs/{org_id}/...`
  - `coaches/{coach_id}/...`
  - `clients/{client_id}/...`
- Assets enterprise bajo `orgs/{org_id}`.
- Exports sensibles privados/signed, no public.
- Policies por membership y ownership.

Fases futuras:

- [ ] Inventariar buckets y paths.
- [ ] Definir storage path matrix.
- [ ] Crear policies por bucket/path.
- [ ] Test org A no lee assets org B.
- [ ] Revisar manifests/loaders/brand assets enterprise.

##### 4. Caches y `last_workspace`

Investigacion 2026:

- Workspace switching moderno usa cache local solo como acelerador; servidor decide acceso.
- Revocacion debe invalidar sesiones/workspaces obsoletos.

Auditoria EVA:

- Revisar localStorage/sessionStorage/cookies usados en login, PWA, theme, language, onboarding.
- Revisar si middleware confia en datos cliente.
- Revisar caches RSC/React.cache por request.

Solucion propuesta:

- `workspace_preferences` server-side como fuente final.
- Local cache: `last_workspace_hint`, nunca autorizacion.
- Al entrar a workspace, validar membership vigente.
- Si workspace revocado, limpiar cache y mostrar selector.

Fases futuras:

- [ ] Inventariar storage/cookies relevantes.
- [ ] Disenar `workspace_preferences`.
- [ ] Resolver workspace server-side.
- [ ] Agregar invalidacion al revocar membership.
- [ ] Test workspace revocado no reingresa por cache.

##### 5. Exports y Reportes

Investigacion 2026:

- Audit logs de SaaS deben capturar data exports y report generation.
- Exports son punto frecuente de fuga cross-tenant.

Auditoria EVA:

- Revisar `/org/[slug]/audit/export`, reportes CSV/PDF, progress-print, pagos.
- Revisar filtros de reportes por `org_id`.
- Revisar si export usa service role y si audita.

Solucion propuesta:

- Todo export enterprise requiere permission helper.
- Audit `report.exported` con actor, org, filters, row_count, format.
- Exports standalone y enterprise separados.
- Paginacion/limits para evitar exports masivos accidentales.

Fases futuras:

- [ ] Inventariar exports actuales.
- [ ] Definir `exportPolicy`.
- [ ] Agregar audit obligatorio.
- [ ] Test export org A no contiene org B.
- [ ] Agregar UI de filtros claros antes de exportar.

##### 6. Billing Separado

Investigacion 2026:

- B2B SaaS separa billing owner/admin de usuarios operativos.
- Per-seat/tenant billing no debe bloquear usuarios equivocados sin proceso comercial.

Auditoria EVA:

- Revisar middleware de subscription coach.
- Revisar `/coach/subscription`, `/coach/settings`, sidebar coach.
- Revisar `subscription_status = org_managed`.
- Revisar pagos enterprise manuales vs pagos alumno.

Solucion propuesta:

- Coach standalone: billing EVA propio.
- Coach enterprise: no billing propio, no `Mi marca`.
- Enterprise: billing manual/tenant, owner/admin.
- Alumno payments: estado operativo, no cobro in-app.

Fases futuras:

- [ ] Auditar rutas billing.
- [x] Centralizar `canViewBilling(workspace)`. Completado el 2026-05-26 22:01:57 -04:00 en `workspace-permissions.service.ts`.
- [x] Bloquear direct access server-side. Completado el 2026-05-26 22:01:57 -04:00 para APIs `/api/payments/subscription-status`, `create-preference`, `confirm-subscription`, `cancel-subscription` y `activate-free`.
  - Cambio: billing EVA solo responde si el workspace activo es `coach_standalone`.
  - Cambio: `activate-free` cuenta solo alumnos standalone con `org_id IS NULL`.
  - Verificacion: `npm run typecheck` y ESLint focalizado sin errores.
- [ ] Mostrar mensaje claro a coach enterprise.
- [ ] Test coach enterprise no accede subscription.

##### 7. Branding Resolver End-to-End

Investigacion 2026:

- White-label real incluye login, domain, manifests, emails, reports, loaders y no solo logo/color.
- Branding parcial genera desconfianza B2B.

Auditoria EVA:

- Revisar dashboard enterprise, coach app, alumno PWA, manifest, loader, emails, PDFs, QR, error pages.
- Revisar si `org_id` gana siempre sobre coach brand para alumno enterprise.

Solucion propuesta:

- Crear `resolveBrandForWorkspace(activeWorkspace)`.
- Aplicar en shell, login, manifests, loaders, reportes.
- Brand score/governance valida contraste y assets.

Fases futuras:

- [ ] Inventariar superficies de marca.
- [ ] Crear matriz brand resolver.
- [ ] Centralizar helper.
- [ ] Test alumno enterprise ve org brand.
- [ ] Test alumno standalone ve coach brand.

##### 8. Invite Codes / Codigos Enterprise

Investigacion 2026:

- Codigos/links de invitacion deben tener expiracion, revocacion, rate limit y audit.
- Magic links/codes deben tener fallback mobile-friendly, pero no ser identidad permanente.

Auditoria EVA:

- Revisar `invite_code` coach actual.
- Revisar `/join/[invite_code]`.
- Revisar creacion de coaches enterprise y staff.
- Revisar si codigos se guardan plano.

Solucion propuesta:

- `enterprise_invites` con `code_hash`, scope, role, org_id, optional email, expires_at, status.
- Codigo visible solo al crear; DB guarda hash.
- Redeem code crea/vincula workspace.
- Rate limit y max attempts.

Fases futuras:

- [ ] Auditar invite model actual.
- [ ] Disenar migration local.
- [ ] Crear redeem action con audit.
- [ ] UI `Coach Enterprise` con codigo.
- [ ] Test codigo expirado/revocado/fuerza bruta.

##### 9. Usuarios con Multiples Roles

Investigacion 2026:

- B2B SaaS debe evitar `role` global; roles son por workspace/tenant/recurso.
- RBAC puede iniciar simple, pero permisos deben ser evaluados con contexto.

Auditoria EVA:

- Revisar checks por `role`, `subscription_status`, `active_org_id`.
- Revisar si una persona puede ser owner + coach + alumno.
- Revisar perfiles duplicados por email.

Solucion propuesta:

- `ActiveWorkspace` decide permisos.
- `org_member.role` solo vale dentro de org.
- Coach/alumno son capabilities, no identidad global unica.
- Selector solo para 2+ workspaces.

Fases futuras:

- [ ] Crear matriz roles/capabilities.
- [ ] Auditar checks globales.
- [ ] Crear permission helper por workspace.
- [ ] UI switcher.
- [ ] Tests multi-role.

##### 10. Rutas y Middleware

Investigacion 2026:

- Middleware sirve para gates amplios; server actions/data layer deben repetir autorizacion.
- Route RBAC en Next.js debe cubrir middleware, server components, route handlers y actions.

Auditoria EVA:

- Revisar `middleware/proxy`, `/coach/*`, `/org/*`, `/c/[coach_slug]/*`, `/api/mobile/*`.
- Revisar redirects por rol global.
- Revisar direct route access a billing/brand.

Solucion propuesta:

- Route matrix por workspace:
  - `/org/*`: enterprise_staff.
  - `/coach/*`: coach_standalone o enterprise_coach con feature gates.
  - `/c/*`: student workspace.
- Middleware bloquea broad routes.
- Server actions validan recurso.

Fases futuras:

- [x] Crear route/workspace matrix. Hecho el 2026-05-25 18:35:14 -04:00 en `workspace-route-guard.service.ts` y documentado en P1.5.
- [x] Refactor guard central. Hecho el 2026-05-25 18:35:14 -04:00 para rutas web principales; queda P2 granular por feature/role interno.
- [x] Bloquear direct URLs sensibles. Hecho parcialmente el 2026-05-25 18:35:14 -04:00: `/org/*` bloquea coaches enterprise, `/coach/subscription` y `/coach/settings` bloquean enterprise coach. Pendiente: exports/reportes profundos.
- [ ] Test route access por workspace.
- [ ] Documentar mobile route equivalents.

##### 11. Mobile y Deep Links

Investigacion 2026:

- Deep links deben abrir pantalla correcta y preservar contexto; deferred deep links requieren fallback.
- En B2B mobile, workspace selector debe ser claro si hay multiples contextos.

Auditoria EVA:

- Revisar manifests PWA, `/join/[invite_code]`, futuros app links.
- Revisar push notification future y URLs alumno/coach.
- Revisar si slug/codigo identifica org correctamente.

Solucion propuesta:

- Deep link payload incluye `workspace_type`, `org_id/slug`, target.
- Si no hay sesion, login y luego resolver target.
- Si usuario no tiene workspace, mostrar error/invite redeem.
- No abrir enterprise data desde standalone context.

Fases futuras:

- [ ] Definir deep link schema.
- [ ] Mapear web routes a RN screens.
- [ ] Plan app links/universal links futuro.
- [ ] Test link alumno enterprise con sesion standalone.
- [ ] Documentar fallback PWA.

##### 12. Auditoria Util

Investigacion 2026:

- Audit logs utiles capturan membership changes, role escalation, exports, admin/support access y acciones sensibles.
- Auditar demasiado genera ruido; auditar poco no sirve en ventas/compliance.

Auditoria EVA:

- Revisar `org_audit_logs` coverage.
- Revisar eventos existentes de brand, payments, announcements, nutrition, clients, onboarding.
- Revisar export CSV auditado.

Solucion propuesta:

- Taxonomia:
  - `invite.*`
  - `membership.*`
  - `workspace.*`
  - `brand.*`
  - `report.*`
  - `assignment.*`
  - `payment.*`
- Cada evento con actor, target, org_id, metadata minima.

Fases futuras:

- [ ] Crear audit event taxonomy.
- [ ] Detectar mutations sin audit.
- [ ] Agregar filters en audit UI.
- [ ] Export audit con checksum.
- [ ] Test audit obligatorio en sensitive actions.

##### 13. Legal Chile / Privacidad

Investigacion 2026:

- Chile mantiene Ley 19.628 hasta el 30 de noviembre de 2026.
- Ley 21.719 entra en vigencia el 1 de diciembre de 2026 y crea una autoridad de datos personales.
- Datos de salud/fitness/nutricion/fotos pueden requerir mayor cuidado operativo.

Auditoria EVA:

- Revisar datos personales/sensibles: email, telefono, fotos, peso, medidas, nutricion, workouts, pagos manuales.
- Revisar quien es responsable: EVA, empresa, coach.
- Revisar consentimiento y borrado/export futuro.

Solucion propuesta:

- Data map por workspace.
- Minimizar acceso: enterprise owner ve lo necesario; coach enterprise solo asignados.
- Terminos enterprise: empresa como responsable/mandante segun contrato; EVA como proveedor/procesador segun modelo final.
- Preparar derechos ARCO/portabilidad/borrado.

Fases futuras:

- [ ] Crear data inventory.
- [ ] Revisar legal copy enterprise.
- [ ] Definir retention/export/delete.
- [ ] Auditar acceso a fotos/progreso.
- [ ] Preparar checklist Ley 21.719 antes de 2026-12-01.

##### 14. Testing Web/Mobile

Investigacion 2026:

- Negative testing multi-tenant es obligatorio: probar que org A no lee org B.
- QA debe cubrir middleware, server actions, RLS, storage, exports y mobile navigation.

Auditoria EVA:

- Revisar coverage Vitest/Playwright actual.
- Revisar ausencia de tests para multi-workspace.
- Revisar scripts Supabase local.

Solucion propuesta:

- Test matrix por workspace:
  - coach standalone;
  - enterprise coach;
  - enterprise staff;
  - student standalone;
  - student enterprise.
- Seed local con dos orgs, dos coaches, alumnos cruzados.
- Negative tests cross-tenant.

Fases futuras:

- [ ] Crear seed multi-workspace local.
- [ ] Tests route guards.
- [ ] Tests RLS/API negative.
- [ ] Tests branding resolver.
- [ ] Tests revocation/cache.
- [ ] Tests exports.
- [ ] Checklist RN futuro por screen/deep link.

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

- **Estado:** INICIADA con separacion funcional base.
- **Completado parcial:** 2026-05-23 22:53:33 -04:00
- **Notas:** `/org/[slug]/team` ya muestra control plane visual de identidad, usuarios enterprise separados de coaches, postura de seguridad y matriz de roles. La creacion desde `/org/[slug]/coaches` ahora separa `org_admin` como staff enterprise real: auth user + `organization_members` con `coach_id = null`, sin fila `coaches`, sin coach dashboard ni billing propio. Si el rol es `coach`, se crea coach enterprise gestionado por la empresa.

- [x] Lista staff enterprise read-only.
- [x] Separacion visual enterprise users vs coaches vinculados.
- [x] Matriz visual de roles base.
- [x] Security posture preview.
- [x] Crear usuario con email + password temporal.
- [x] Roles base `org_admin` y `coach`.
- [x] Staff enterprise separado de coach/alumno.
- [x] Audit events para creacion de coach/staff.
- Permisos granulares por feature.
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
- **Notas:** `/org/[slug]/assignments` ya muestra queue de alumnos sin coach, capacidad por coach, sobrecarga, cupos sugeridos y reglas. Desde 2026-05-26 tiene asignacion individual accionable con preview de carga, guard server-side y audit. Sin drag-and-drop ni bulk assign todavia.

- [x] Queue alumnos sin coach read-only.
- [x] Asignacion individual desde cockpit `/assignments`. Completado el 2026-05-26 21:11:37 -04:00.
- [x] Bulk assign seguro desde cockpit `/assignments`. Completado el 2026-05-26 21:32:49 -04:00.
- [x] Capacidad por coach read-only.
- [x] Warning visual por sobrecarga.
- [x] Reglas de bulk assign seguro.
- Asignar/reasignar.
- Historial.
- Bulk assign.

### Fase 6 - Pagos Alumnos Operacional

- **Estado:** INICIADA con registro operacional funcional.
- **Completado parcial:** 2026-05-23 22:53:33 -04:00
- **Notas:** `/org/[slug]/payments` ya muestra ledger operacional con pagos reales desde `client_payments`, permite registrar pago externo por alumno con monto/fecha/estado/nota, escribe audit event `client_payment.recorded` y mantiene texto legal: no cobra in-app, no emite boleta/factura y no reemplaza contabilidad.

- [x] Ledger operacional.
- [x] Estados MVP visibles: pagado, pendiente, vencido, becado, pausado.
- [x] Guardrails: no checkout, no facturacion tributaria, no contabilidad.
- [x] Cobertura real usando `client_payments`.
- [x] Registrar pago externo por alumno.
- [x] Audit event para registro de pago.
- Vencimientos.
- Filtros pagado/pendiente/vencido.
- Export CSV.
- Alertas en dashboard.
- [x] Sin cobro in-app.

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

- **Estado:** COMPLETADA para MVP.
- **Completado:** 2026-05-23 22:53:33 -04:00
- **Notas:** Se agrego `writeOrgAuditEvent()` en `services/org/org.service.ts` y se conecto a mutations reales de announcements, nutrition templates, enterprise coaches, clientes y onboarding. `bulkReassignClientsAction` ahora usa RPC transaccional `bulk_reassign_clients_with_audit`: mueve alumnos, actualiza assignments, suspende miembro y escribe audit log en una sola funcion PostgreSQL. Export CSV usa politica fail-closed si falla audit event.

- [x] Helper central en service layer.
- [x] Taxonomia inicial `resource.action`.
- [x] Audit events para announcements.
- [x] Audit events para nutrition templates.
- [x] Migrar staff/coaches/client actions al helper.
- [x] Definir politica fail-open vs fail-closed para exports: fail-closed si falla audit event.
- [x] RPC transaccional para mutation sensible de bulk reassignment. Migracion local aplicada el 2026-05-23 22:53:33 -04:00.

### Research Update Transactional Audit/RPC 2026

**Actualizado:** 2026-05-23 22:53:33 -04:00

Hallazgos aplicables:

- Mutations sensibles enterprise deben evitar estados partidos: data cambiada sin audit, o audit escrito sin data final.
- En Supabase/Postgres, PL/pgSQL permite atomicidad real para operaciones multi-tabla sin pagar servicios externos.
- `SECURITY DEFINER` es util pero riesgoso: limitar `search_path`, revocar `PUBLIC` y conceder solo a `service_role`.
- Mantener validaciones de rol en server action y validaciones de pertenencia dentro de la RPC.

Decision EVA:

- Usar RPC transaccional solo para operaciones con riesgo multi-tabla real.
- Mantener CRUD simple en Server Actions mientras no necesite atomicidad cross-table.
- Para futuras mutations sensibles: `operation + audit` debe vivir en una RPC o fallar cerrado.

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

## Auditoria Menu por Menu del Dashboard Enterprise

**Fecha:** 2026-05-26  
**Estado:** auditoria agregada al plan; no es fase de pruebas todavia.  
**Criterio:** revisar utilidad real, flujo enterprise-coachenterprise-alumnoenterprise, aislamiento contra coach standalone y responsive web/PWA mobile.

### Hallazgo transversal: responsive enterprise mobile

El dashboard enterprise tiene layout responsive basico, pero en celular se siente pesado y poco operativo. El problema no es solo CSS: muchas pantallas fueron pensadas como dashboard desktop y luego apiladas. En mobile hay demasiadas cards grandes, headers altos, tablas convertidas en bloques largos y formularios dentro de filas.

Pendiente:

- [ ] Crear fase `Enterprise Responsive/PWA Rework` antes de E2E: shell mobile, nav sticky, subnav contextual, cards compactas, sheets para acciones y safe areas.
  - [x] Fix transversal shell mobile: layout Enterprise cambia a `flex-col md:flex-row` y main usa `overflow-x-clip`. Completado el 2026-05-26 21:32:49 -04:00. Verificado en `/assignments` mobile 390px sin overflow horizontal.
  - [x] Hero compression global (13 páginas org): título text-xl sm:text-3xl md:text-5xl; descripción hidden sm:block. Completado el 2026-05-29. Ahorra ~60px en 390px.
  - [x] Rows compactas en mobile: coaches y clients usan flex single-line con stats inline bajo el nombre; columnas separadas solo en lg+/xl+. Completado el 2026-05-29.
- [ ] Evitar tablas apiladas largas en más páginas: assignments, payments. Usar list items + details sheet/modal.
- [ ] Revisar cada menu en viewport 390x844 y 430x932 antes de considerar listo.
- [ ] Documentar equivalente futuro React Native por pantalla.

### Shell y navegacion global

Estado actual:

- Desktop sidebar agrupada funciona.
- Mobile tiene nav primaria en grilla, pero ocupa demasiado y no muestra submenus claros.

Pendiente:

- [ ] Bottom/tab nav enterprise mobile con 5-6 destinos maximos.
- [ ] Subnav por grupo visible solo dentro del grupo.
- [ ] Acciones globales: cambiar workspace, cerrar sesion, alertas, soporte.
- [ ] Validar `pb-safe`, `pt-safe`, `min-h-dvh` y no scroll horizontal.

### Command Center `/org/[slug]`

Estado actual:

- Dashboard home sirve como snapshot.
- KPIs/action queue son utiles pero todavia no accionables.

Pendiente:

- [ ] Activity feed persistente.
- [ ] Action queue con acciones reales: asignar coach, registrar pago, invitar coach, publicar brand.
- [ ] Health score explicado por componentes.
- [ ] Version mobile: resumen ejecutivo compacto + acciones prioritarias.

### Operaciones / Alumnos `/clients`

Estado actual:

- Alta individual e import CSV existen.
- Filtros y busqueda existen.
- Asignacion individual existe desde select.

Pendiente:

- [ ] Bulk actions seguros con preview: asignar, pausar/reactivar, cambiar pago, exportar seleccion.
- [x] Server action guards para alta/import/asignacion de alumnos: org, rol, coach activo de la empresa y audit. Completado el 2026-05-26 19:55:20 -04:00. Verificacion: `npm run typecheck`. Supabase local no estaba levantado, migracion pendiente de aplicar.
- [x] Server action guards restantes de menus enterprise no auditados aun. Completado el 2026-05-26 20:39:12 -04:00 para anuncios, nutricion, pagos y onboarding. Verificacion: `npm run typecheck`, ESLint focalizado.
- [x] Export/report guards avanzados para audit CSV: filtros, checksum/export hash y audit metadata. Completado el 2026-05-26 20:39:12 -04:00. Verificacion: `npm run typecheck`, ESLint focalizado.
- [ ] Pruebas negativas export org A vs org B.
- [ ] Mejorar mobile: list item compacto y details sheet para editar/asignar.
- [ ] Resolver futuro modelo multi-contexto alumno por email antes de soportar mismo alumno en varios negocios.

### Operaciones / Asignaciones `/assignments`

Estado actual:

- Principalmente read-only: cola, capacidad, sobrecarga y sugerencias.

Pendiente:

- [ ] Convertir en cockpit accionable para asignar/reasignar.
- [x] Cockpit accionable slice 1: asignar alumno sin coach a coach activo de la empresa. Completado el 2026-05-26 21:11:37 -04:00.
- [x] Bulk assign con preview antes/despues. Completado el 2026-05-26 21:32:49 -04:00. UI responsive: mobile 390px y desktop 1440px verificados con Playwright, sin overflow horizontal.
- [ ] Historial de reasignaciones por alumno/coach.
- [ ] Rollback de ultima reasignacion.
- [ ] Configurar capacidad objetivo por empresa.
- [ ] Mobile: cards por coach + sheet de alumnos, no grids anchas.

### Operaciones / Pagos alumnos `/payments`

Estado actual:

- Registro manual de pago externo funciona.
- Mantiene alcance correcto: no cobro in-app, no boleta/factura, no contabilidad.

Pendiente:

- [ ] Filtros por pagado/pendiente/vencido/becado/pausado.
- [x] Filtros por pagado/pendiente/vencido/becado/pausado/sin registro. Completado el 2026-05-26 21:44:53 -04:00. UI responsive verificada en 390px y 1440px.
- [ ] Vencimientos/proximo pago por alumno.
- [ ] Export CSV auditado.
- [x] Export CSV auditado de pagos operacionales. Completado el 2026-05-26 21:44:53 -04:00. Incluye permiso `org.payments.export`, metadata `client_payments.exported`, checksum SHA-256, filtro de status y proteccion basica contra CSV formula injection.
- [ ] Alertas en dashboard por vencidos/sin registro.
- [ ] Mobile: mover formulario de `details` a sheet/modal por alumno.

### Equipo / Coaches `/coaches`

Estado actual:

- Rework visual hecho.
- Creacion coach/staff base y revocacion coach enterprise existen.

Pendiente:

- [ ] Preview de impacto antes de revocar: alumnos afectados, reasignacion sugerida, standalone intacto.
- [ ] Reset password/cambio rol con audit y feedback claro.
- [ ] Separar mejor coaches operativos vs staff admin para evitar confusion de permisos.
- [ ] Mobile: cards accionables con menu contextual.

### Equipo / Staff & Access `/team`

Estado actual:

- Mayormente read-only/preview: lista staff, role templates y posture.

Pendiente:

- [ ] CRUD staff real: crear, revocar, cambiar rol, reset password.
- [ ] Permisos granulares por feature: owner/admin/ops/analyst/brand_manager.
- [ ] MFA policy real y first-login reset.
- [ ] Tests multi-role.
- [ ] Mobile: role matrix como accordion/cards.

### Marca / Brand Studio `/brand`

Estado actual:

- Guarda nombre/color/logo.
- Publish inicial a coaches enterprise.
- Alumno enterprise autenticado ya recibe marca org.

Pendiente:

- [ ] Modelo `organization_branding`: draft/published/versionado/rollback.
- [ ] Loader custom real por org: logo loader, texto, icon mode, contraste y preview PWA.
- [ ] Inventario de superficies: login, manifests, loaders, emails, reports, QR, PDFs, error pages.
- [ ] Tests: alumno enterprise ve org brand; alumno standalone ve coach brand.
- [ ] Mobile: previews en tabs/swipe, no paneles largos.

### Herramientas / Novedades `/announcements`

Estado actual:

- Crear/toggle/delete anuncios para alumnos enterprise.
- Preview y expiracion existen.

Pendiente:

- [ ] Audiences: alumnos, coaches enterprise, staff o todos.
- [ ] Programar publicacion y expiracion con estados visibles.
- [ ] Read receipts/delivery status futuro.
- [ ] Mobile: composer como sheet/modal.

### Herramientas / Nutricion `/nutrition`

Estado actual:

- Templates org con macros/meals.
- Coaches enterprise pueden usar templates desde flujo coach.

Pendiente:

- [ ] Tracking de uso por template/coach/alumno.
- [ ] Filtros por objetivo cuando exista volumen.
- [ ] Flujo claro para aplicar template desde enterprise o coach enterprise.
- [ ] Mobile: editor por steps/tabs, no formulario largo.

### Seguridad/Admin `/settings`

Estado actual:

- Datos org, billing enterprise manual, invoices y guardrails.

Pendiente:

- [ ] Flujo comercial para seats, cambio de plan y contacto legal/finanzas sin cobro in-app.
- [ ] Separar settings administrativos de billing/contrato.
- [ ] Centralizar `canViewBilling(workspace)`.
- [ ] Mobile: lista de secciones con drill-down.

### Seguridad/Admin / Auditoria `/audit`

Estado actual:

- Timeline real.
- Export CSV owner-only con audit fail-closed.

Pendiente:

- [ ] Filtros por action/actor/date/target.
- [ ] Checksum generation job local/manual.
- [x] Export audit con checksum. Completado el 2026-05-26 20:39:12 -04:00. Header `X-Content-SHA256` y metadata `checksum_sha256` en `audit.exported`.
- [ ] Detectar mutations sensibles sin audit.
- [ ] Mobile: timeline compacta con filtros sticky.

### Insights / Reportes `/reports`

Estado actual:

- Weekly brief read-only con formulas conservadoras.

Pendiente:

- [ ] CSV de weekly brief con permission + audit `report.exported`.
- [ ] PDF ejecutivo despues del CSV.
- [ ] Rango de fechas y comparacion historica.
- [ ] No vender como analytics avanzado hasta normalizar adherencia/check-ins/pagos.
- [ ] Mobile: resumen ejecutivo vertical con tabs.

### Onboarding `/onboarding`

Estado actual:

- Implementation workspace con readiness score y CSM notes.

Pendiente:

- [ ] Medir time-to-value real: primer coach activo, primeros alumnos asignados, primer reporte exportado.
- [ ] Checklist por owner/admin/CSM.
- [ ] Mobile: wizard paso a paso.

---

## Auditoría por Roles

### Software Architect

- Cuentas enterprise separadas.
- Clean Architecture.
- No duplicar producto coach dentro de enterprise.

### Senior Backend Engineer

- Permisos reutilizables en services.
- Mutations transaccionales con audit.
- Preservar `clients.coach_id` como asignacion activa cuando existe; migration explicita 2026-05-26 permite `NULL` solo para cola enterprise sin coach.

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

## Auditoria Multi-Rol 2026

**Actualizado:** 2026-05-23 22:53:33 -04:00

Auditoria sin servicios pagos, considerando Web/PWA actual y futura app React Native.

### Product Manager / UX/UI Designer

Estado:

- Dashboard ya cuenta historia clara: salud, riesgo, coaches, acciones.
- Brand Studio ya es diferenciador visual: score, QA, propagation map y parity web/mobile.

Mejoras futuras:

- "Command Center" configurable por rol: owner ve salud/finanzas; ops ve alumnos/asignaciones; brand manager ve white-label.
- Preview "antes/despues" de publish brand para evitar errores de marca.
- Empty states con quick actions reales, no texto generico.

### Software Architect / Backend / SecOps

Estado:

- Separacion staff enterprise vs coach corregida: `org_admin` no crea fila `coaches`.
- Bulk reassignment sensible ahora es transaccional por RPC con audit integrado.
- Audit export es owner-only y fail-closed.

Mejoras futuras:

- Permission matrix persistente por feature (`org.permissions`) en vez de roles fijos.
- RPC transaccional para publish brand con versionado/rollback.
- Checksums periodicos de `org_audit_logs` usando tabla existente `audit_log_checksums`.

### DevOps / SRE / FinOps

Estado:

- Demo local opt-in evita tocar live y no agrega costos.
- No se agregaron SaaS pagos ni dependencias nuevas.

Mejoras futuras:

- Script local de health-check enterprise: buckets, policies, RPC grants, RLS y seed status.
- Cost guardrails por org: storage logos, exports, volumen de audit logs y reportes programados.
- Runbook de deploy: aplicar migrations locales -> staging -> live con checklist.

### Web / Mobile / QA

Estado:

- UI principal es responsive y evita depender de features web-only.
- Plan registra regla Web/PWA + React Native.

Mejoras futuras:

- Contrato compartido de brand tokens para React Native (`@eva/tokens` + org branding).
- Matriz de parity por feature: web, PWA, RN, native-only.
- E2E smoke pendiente para login, permisos, asignacion y brand propagation.

### Data / Analytics

Estado:

- KPIs actuales son conservadores y no prometen IA falsa.
- Reports separa facts de insights.

Mejoras futuras:

- Risk score versionado con formula visible.
- Coach capacity model por alumnos activos, adherencia y alertas, no solo conteo.
- Export de reports con snapshot firmado/auditado.

### Growth / Sales / CSM / Implementation

Estado:

- Demo org local permite vender y explicar sin datos reales.
- Onboarding workspace enfoca outcomes.

Mejoras futuras:

- Demo script por ICP: gym boutique, box funcional, equipo de personal trainers.
- Implementation checklist con owner asignado, fecha objetivo y bloqueo visible.
- "Proof pack" exportable: brand preview, roles, audit, alumnos asignados, reporte semanal.

### Legal Chile / Fintech

Estado:

- Pagos alumnos se mantienen como registro operacional, no cobro/facturacion tributaria.
- Enterprise billing no se mezcla con billing de coaches.

Mejoras futuras:

- Texto legal claro en pagos: "registro interno, no boleta/factura".
- Consentimiento explicito para datos sensibles de salud/progreso.
- Preparar integraciones futuras Transbank/MercadoPago solo si hay validacion comercial.

### Features Futuras Diferenciadoras

- Brand Studio Pro: presets por tipo de negocio, contraste automatico, preview PWA/RN, rollback de marca.
- Trust Center Lite: audit export, security posture, MFA status, retention y permisos en un solo panel.
- Capacity Autopilot: sugerencias de reasignacion por carga y riesgo, con aprobacion humana.
- Client Revenue Ops: estado pagado/pendiente/vencido, promesas de pago y recordatorios manuales sin cobrar in-app.
- Mobile-native roadmap: pasos, HealthKit/Google Fit, smartwatch, widgets y notificaciones nativas, estudiadas aparte.

---

## Auditoria por Menu Enterprise

**Actualizado:** 2026-05-24 12:50:25 -04:00

### Dashboard / Command Center

Estado:

- Buen primer impacto visual.
- Ya muestra health, action queue, riesgos y carga de coaches.

Falta:

- Activity feed persistente.
- Jerarquia mas ejecutiva para owner: "que paso", "que requiere accion", "que cambio esta semana".
- Drill-down consistente hacia Alumnos, Coaches, Pagos y Reportes.
- Mobile: cards deben priorizar accion, no solo metricas.

Roles:

- PM/Sales: la demo story funciona, pero falta "proof" semanal.
- Data: risk score debe versionarse.
- SRE/Backend: evitar metricas caras sin cache si escala.

### Operaciones / Alumnos

Estado:

- CRUD/import basico existe.
- Filtros simples y asignacion individual desde lista.

Falta:

- Rework visual completo.
- Bulk selection con acciones seguras.
- Columnas de estado: coach, pago, actividad, onboarding, riesgo.
- Drawer/perfil rapido sin salir de la lista.
- Estados de import: errores, duplicados, rollback parcial.
- Mobile: lista debe parecer operational inbox, no tabla comprimida.

Roles:

- UX: hoy es utilitario pero no enterprise.
- Backend/SecOps: validar limites por org y audit para bulk operations.
- CSM: necesita detectar quien esta sin coach/onboarding en segundos.

### Operaciones / Asignaciones

Estado:

- Cockpit read-only bueno para entender problema.
- Bulk reassignment sensible ahora es transaccional en RPC.

Falta:

- Acciones reales desde esta pantalla: assign, reassign, preview impacto, confirmar.
- Filtros por coach, riesgo, inactivo, sin pago.
- Historial de reasignaciones visible.
- Capacidad configurable por coach.
- Mobile: flujo wizard de reasignacion.

Roles:

- Architect: esta debe ser la pantalla source-of-truth para movimientos.
- QA: necesita pruebas de atomicidad y rollback.
- CSM: herramienta clave de implementacion inicial.

### Operaciones / Pagos Alumnos

Estado:

- Registro manual externo existe usando `client_payments`.
- Audit event `client_payment.recorded`.
- Texto legal correcto: no cobra, no factura, no contabilidad.

Falta:

- Filtros por estado/vencimiento/coach.
- Promesa de pago / nota de cobranza manual.
- Export CSV auditado.
- Dashboard alerts para vencidos.
- Comprobante adjunto futuro, con Storage y limites.

Roles:

- Legal Chile: mantener copy explicito.
- Fintech: no integrar cobro hasta validar demanda.
- Sales: feature vendible como "control operacional", no "facturacion".

### Equipo / Coaches

Estado:

- Crear coach enterprise funciona.
- Crear `org_admin` ahora no crea fila coach.
- Lista activa con QR/invite code y acciones.

Falta:

- Rework visual profesional.
- Separar tabs: Coaches operativos / Staff enterprise.
- Stats: alumnos asignados, riesgo, carga, actividad, invite status.
- Filtros y search.
- Estado de acceso: org_managed, ultimo login, MFA si aplica.
- Acciones con confirmation sheets coherentes.

Roles:

- Product: aqui se vende control del negocio.
- Security: evitar que admins no-owner cambien roles sensibles.
- Mobile: cards por coach con drilldown.

### Equipo / Team & Access

Estado:

- Buen preview visual de roles y matriz.
- Staff enterprise separado conceptualmente.

Falta:

- Permisos reales por feature.
- Usuarios enterprise desde esta pantalla, no desde Coaches.
- Access review: ultimo login, status, MFA, owner/admin.
- Role templates: Owner, Admin, Ops, Analyst, Brand Manager.
- Revocar/suspender staff no-coach.

Roles:

- SecOps/Legal: esta es pantalla critica.
- PM: debe explicar roles sin documentacion externa.
- QA: pruebas owner/admin/coach/staff.

### Marca / Brand Studio

Estado:

- Diferenciador fuerte: score, QA, propagation map, previews, publish.

Falta:

- `organization_branding` con draft/published/versionado.
- Rollback y preview antes/despues.
- Tokens exportables web/RN.
- Presets por tipo de negocio.
- QA de contraste mas estricto WCAG.
- Loader/manifest/app icon con validacion de asset.

Roles:

- UX/Sales: gran feature para B2B.
- Mobile: tokens deben mapear a RN.
- Architect: evitar custom CSS inseguro por tenant.

### Herramientas / Novedades

Estado:

- Crear/listar anuncios existe.

Falta:

- Rework visual.
- Audience preview: todos, por coach, por alumnos sin pago, por grupo futuro.
- Expiracion clara y estado activo/inactivo.
- Vista de impacto: cuantos alumnos veran el mensaje.
- Historial y audit visible.

Roles:

- CSM: util para comunicacion masiva.
- Legal: evitar mensajes sensibles sin consentimiento.
- Mobile: push/native futuro queda separado.

### Herramientas / Nutricion

Estado:

- Templates org existen y coaches pueden usarlos.

Falta:

- Rework biblioteca profesional.
- Tags/goal filters.
- Uso por coach/alumnos.
- Duplicar template y versionar.
- Bloqueo por permisos.
- Relacion con futuras plantillas de entrenamiento.

Roles:

- Product: herramienta B2B real si reduce trabajo repetitivo.
- Data: medir adopcion de templates.
- Mobile: templates son admin web; consumo por coach/alumno sigue separado.

### Seguridad y Admin / Settings

Estado:

- Muestra info org, branding basico y billing manual.

Falta:

- Rework completo.
- Mover branding fuerte a Brand Studio.
- Billing enterprise separado de pagos alumnos.
- Seats y plan con historial.
- MFA/security posture.
- Zona de peligro: suspender org/exportar/borrar futuro.
- Contacto soporte y datos legales.

Roles:

- DevOps/SRE: configuracion debe ser auditable.
- Legal Chile: terminos, privacidad, datos empresa.
- FinOps: costos por seats/storage/export.

### Seguridad y Admin / Audit Log

Estado:

- Timeline real y export CSV owner-only.

Falta:

- Filtros actor/action/date.
- Export con filtros.
- Checksums periodicos.
- Retention policy visible.
- Alertas de eventos sensibles.

Roles:

- Security: pieza fuerte para confianza B2B.
- Sales: Trust Center Lite vendible.
- QA: verificar permisos y fail-closed.

### Reportes

Estado:

- Weekly brief read-only.

Falta:

- Export CSV/PDF auditado.
- Filtros por periodo/coach.
- Snapshot "esta semana vs anterior".
- Report pack para owner/CSM.

Roles:

- Data: evitar claims falsos.
- Sales/CSM: clave para retencion.
- Mobile: vista ejecutiva resumida.

---

## Acceptance Criteria MVP

- [x] Dueño entiende salud del negocio en menos de 30 segundos. Verificado por dashboard/action queue.
- [x] Dueño identifica alumnos en riesgo. Verificado por dashboard/reports/assignments.
- [x] Dueño identifica carga/performance de coaches. Verificado por dashboard/reports/coach detail.
- [x] Dueño crea staff enterprise con rol/permisos base. `org_admin` queda separado de coaches.
- [x] Dueño configura white-label enterprise. Brand Studio funcional.
- [x] White-label enterprise se aplica a coaches enterprise y alumnos. Publish inicial a coaches enterprise.
- [x] Coaches enterprise no ven `Mi marca` ni `Billing`.
- [x] Staff enterprise separado de coach/alumno.
- [x] Dueño asigna/reasigna alumnos a coaches.
- [x] Dueño puede registrar estado de pago alumno sin cobro in-app.
- [x] Mutations enterprise escriben audit log.
- [x] Dashboard responsive desktop/tablet/mobile.
- [x] No direct feature-data Supabase calls nuevos en `_data`.
- [x] `npm run typecheck` pasa.
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

## Referencias Identity / Workspace Mayo 2026

Inputs usados para el bloque `Identity, Workspace y Acceso`:

- Supabase Docs - Multiple SSO Providers: organizaciones, role-based routing e invitaciones explicitas por entorno.
- Supabase Docs - Access Control: roles y asignacion scoped.
- DOTxLabs 2026 - Next.js + Supabase Multi-Tenant SaaS: Auth + RLS + middleware/server checks como tres capas.
- CIAM Compass 2026 - B2B SaaS Identity: organizaciones como entidad central del modelo B2B.
- Afterbuild Labs 2026 - Supabase RLS SaaS Blueprint: membership helpers, soft-delete, audit y tenant checks.
- TokenIDP 2026 - Designing Multi-Tenant Identity: tenants/clientes como entidades de primer nivel.
- Techstack 2026 - SaaS Auth Providers: Supabase viable sin costo, pero requiere disciplina manual en organizaciones/RLS.
- Reddit Supabase/Next.js 2026: usuarios pueden pertenecer a multiples organizaciones; tenant/membership no debe vivir solo en UI.
