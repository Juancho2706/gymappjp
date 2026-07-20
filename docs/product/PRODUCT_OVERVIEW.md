---
status: active
owner: product
last_verified: 2026-07-20
canonical: true
---

# Product overview

## Qué es EVA

EVA es una plataforma fitness B2B2C. El profesional prescribe y supervisa; el alumno ejecuta y registra; EVA conserva el contexto, la trazabilidad y la marca del workspace.

El producto opera en dos clientes:

- web responsive/PWA con Next.js;
- app nativa iOS/Android con Expo y React Native.

Ambos clientes comparten contratos y motores puros. No se espera igualdad de componentes visuales, sino paridad funcional y semántica donde la plataforma lo permite.

## Modelos de operación

| Modelo | Propiedad y acceso | Superficie |
|---|---|---|
| Standalone | Un coach administra sus propios alumnos y su suscripción | Coach `/coach/*`; alumno `/c/[coach_slug]/*` |
| Teams | Pool plano de coaches con acceso al mismo grupo de alumnos; owner/manager administra miembros y marca | Coach `/coach/*` con workspace Team; alumno `/t/[team_slug]/*` |
| Enterprise | Organización separada, roles granulares, staff, coaches asignados, auditoría y reportes | Staff `/org/[slug]/*`; alumno `/e/[org_slug]/*` |

Teams no es una versión reducida de Enterprise. Tiene tablas, permisos y ciclo operativo propios. Un usuario puede pertenecer a más de un contexto y debe elegir un workspace antes de operar.

## Actores y superficies

| Actor | Capacidades principales | Web | Nativa |
|---|---|---|---|
| Visitante | Conocer EVA, precios, Enterprise, registro y legal | Sí | No |
| Coach standalone | Alumnos, programas, nutrición, marca, módulos y suscripción | Sí | Sí |
| Coach de Team | Operar el pool compartido según permisos del Team | Sí | Sí |
| Coach Enterprise | Operar alumnos de la organización asignada | Sí | Sí, mediante workspace activo |
| Alumno | Entrenar, registrar nutrición, check-in y revisar progreso | Sí | Sí |
| Staff Enterprise | Organización, coaches, asignaciones, reportes, pagos, marca y auditoría | Sí | No como panel administrativo |
| Admin EVA | Operación global, soporte, finanzas y configuración | Sí | No |

## Capacidades del producto

### Entrenamiento

- biblioteca de ejercicios y media;
- programas reutilizables y asignados;
- builder por días, áreas, bloques, superseries, fases y variantes A/B;
- objetivos tipados: fuerza, cardio, duración, distancia e intervalos;
- ejecución con registro de series, timers, sustitución de ejercicios, modo lista/paso a paso y resumen;
- historial, PRs, fuerza, tonelaje, adherencia y exportación.

La reconciliación y reglas del programa compartidas viven en `@eva/workout-engine` y `@eva/plan-builder`.

### Nutrición

Nutrition V2 implementa:

- planes versionados con variantes de día y franjas;
- estrategias estructurada, flexible e híbrida;
- objetivos, macros, micronutrientes, hábitos, notas y protocolo;
- catálogo, alimentos propios, recetas, búsqueda y escáner;
- consumo real, historial, edición rápida y funcionamiento offline móvil;
- porciones/intercambios y equivalencias;
- cockpit del coach y experiencia diaria del alumno.

El rollout se autoriza server-side mediante Edge Config. Nutrition V1 permanece como compatibilidad y rollback; una feature nueva no debe ampliar V1 salvo necesidad explícita de migración, seguridad o reversión.

### Seguimiento

- ficha integral del alumno;
- check-ins con peso, energía, notas y fotografías;
- progreso corporal y analítica de entrenamiento;
- composición corporal BIA/ISAK;
- evaluación de movimiento;
- perfiles y zonas cardio;
- historial y reportes PDF donde corresponde.

Las capacidades profesionales están sujetas a tier, módulo, consentimiento y contexto. Algunos módulos excluyen Enterprise en su primera versión; el entitlement server-side manda sobre la visibilidad de UI.

### Marca

- marca EVA por defecto;
- branding de coach permitido por tier;
- marca de Team y Enterprise;
- logo claro/oscuro, colores, tipografía, loader y presets;
- PWA y app nativa resuelven la marca del workspace en runtime.

### Comercial y pagos

- tiers en venta: Free, Starter, Pro y Elite;
- Growth y Scale permanecen solo por compatibilidad con cuentas legacy;
- suscripciones standalone, cambios de plan, cupones, grace period y reactivación;
- MercadoPago como gateway principal;
- integración Flow/Webpay disponible detrás de feature flag;
- módulos profesionales sujetos al catálogo de entitlements;
- Enterprise maneja contrato y registros operativos separados del billing self-service standalone.

La fuente de verdad de tiers es `packages/tiers`; no duplicar precios, límites ni capacidades en documentación o UI.

### Teams

- creación y gestión de un Team;
- miembros, owner, co-gestores y cupos;
- pool común de alumnos;
- marca y módulos del Team;
- aislamiento estricto frente a alumnos standalone y organizaciones Enterprise;
- acceso del alumno bajo `/t/[team_slug]`.

### Enterprise

- onboarding de organización y MFA para acciones sensibles;
- roles y permisos de staff;
- coaches, alumnos y asignaciones;
- programas y plantillas nutricionales organizacionales;
- marca con borrador/publicación;
- check-ins, anuncios, confianza y prueba operativa;
- reportes/exportaciones, registros de pagos y audit log.

### Administración interna

- coaches, alumnos, Teams y organizaciones;
- finanzas, cupones, novedades y personal;
- auditoría y controles del sistema.

## Identidad, workspace y aislamiento

Supabase Auth entrega la identidad. EVA resuelve uno de estos workspaces activos:

- `coach_standalone`;
- `coach_team`;
- `enterprise_coach` o `enterprise_staff`;
- `student_standalone`;
- `student_team`;
- `student_enterprise`.

`client_memberships`, las asignaciones y las tablas de Team/Enterprise determinan el alcance. La aplicación filtra por el workspace y RLS actúa como techo de seguridad. Nunca aceptar desde el cliente un `teamId`, `orgId` o `coachId` como prueba suficiente de autorización.

## Qué no asumir

- PWA y app nativa conviven; una no reemplaza automáticamente a la otra.
- White-label no significa un binario móvil por cliente.
- Teams y Enterprise no comparten modelo de permisos.
- Una ruta existente no demuestra que un entitlement esté activo en producción.
- Un feature flag visible en el cliente no sustituye la validación server-side.
- Specs, auditorías y handoffs históricos no son estado del producto.

## Fuentes canónicas relacionadas

- Estado actual: [`../status/CURRENT.md`](../status/CURRENT.md)
- Estructura: [`../architecture/PROJECT_STRUCTURE.md`](../architecture/PROJECT_STRUCTURE.md)
- Flujos: [`../architecture/FLOWS_AND_COMPONENTS.md`](../architecture/FLOWS_AND_COMPONENTS.md)
- Paridad nativa: [`../status/MOBILE_PARITY.md`](../status/MOBILE_PARITY.md)
- Pruebas: [`../testing/TEST_STATUS.md`](../testing/TEST_STATUS.md)
