---
status: active
owner: engineering
last_verified: 2026-07-20
canonical: true
---

# EVA — runbook de incidentes

Procedimiento operativo vigente para web, mobile, Supabase y pagos. No es backlog ni historial de decisiones.

## Clasificación

| Nivel | Ejemplos | Objetivo inicial |
|---|---|---|
| P0 | producción caída, fuga de datos, cobro incorrecto masivo, auth inaccesible | contener y comunicar de inmediato |
| P1 | flujo crítico roto para un grupo, pérdida/duplicación acotada, build de release bloqueado | mitigar y asignar dueño |
| P2 | degradación con alternativa disponible | diagnosticar y programar corrección |

Pagos y acceso tienen prioridad operativa. No esperar a conocer la causa raíz para contener un P0.

## Diagnóstico inicial

Registrar antes de cambiar estado:

- hora UTC y zona del reporte;
- superficie: web, PWA, Android, iOS, API, cron o proveedor;
- entorno, URL/ruta y SHA desplegado;
- workspace técnico afectado;
- pasos y resultado esperado/real;
- request ID, error ID o enlace al run, sin tokens ni datos sensibles;
- alcance estimado y si existe alternativa.

Revisar en este orden:

1. Vercel: deployment activo, Runtime Logs, funciones y crons.
2. Sentry: errores nuevos por release, ruta y plataforma.
3. Supabase: estado del servicio, Auth, API y Postgres logs/advisors.
4. Proveedor afectado: MercadoPago, Flow, Resend, Edge Config o EAS/GitHub Actions.
5. Últimos cambios en código, configuración, migraciones y feature flags.

No pegar secrets, JWT, service-role keys ni payloads personales en Slack, issues o Markdown.

## Contención

### Código o deployment

1. Promover desde Vercel el último deployment conocido como sano.
2. Confirmar landing, login, dashboard coach y una ruta de alumno.
3. Si existe kill-switch/flag específico, apagar solo la superficie afectada.
4. Mantener el deployment defectuoso disponible para inspección; no borrar evidencia.

### Datos o migración

1. Detener writers afectados mediante el flag o deployment anterior.
2. Tomar snapshot y conteos de alcance.
3. No ejecutar rollback DDL destructivo ni restaurar toda la base sin análisis.
4. Preparar una migración forward-only o reparación idempotente.
5. Probar en branch Supabase/entorno aislado, RLS y advisors antes de producción.

### Nutrición V2

Usar [NUTRITION_V2_ROLLOUT_RUNBOOK.md](NUTRITION_V2_ROLLOUT_RUNBOOK.md). `mode=off` es la primera contención; no eliminar planes ni intake.

### Catálogo

Usar [FOOD_CATALOG_CL_IMPORT.md](FOOD_CATALOG_CL_IMPORT.md). Detener applies y conservar batches/rows.

## Verificación tras mitigar

- error rate vuelve a baseline;
- el flujo afectado pasa con una cuenta técnica;
- no aparecen nuevos eventos duplicados;
- scopes standalone/team/org siguen aislados;
- crons y webhooks no quedaron pausados;
- mobile recibe configuración remota correcta al volver a foreground;
- soporte conoce impacto, alternativa y siguiente actualización.

## Crons activos

`vercel.json` es la fuente ejecutable. Estado verificado el 20 de julio de 2026:

| Endpoint | Horario UTC | Función |
|---|---:|---|
| `/api/cron/nutrition-cycles` | `0 11 * * *` | ciclos nutricionales |
| `/api/cron/nutrition-reminder` | `0 0 * * *` | recordatorios de nutrición |
| `/api/cron/trial-expiry` | `0 12 * * *` | expiración de trials |
| `/api/cron/purge-data` | `0 3 * * 0` | purga semanal |
| `/api/cron/audit-checksum` | `0 2 * * 0` | integridad semanal de auditoría |
| `/api/cron/mp-reconcile` | `0 10 * * *` | reconciliación MercadoPago y expiración de add-ons |
| `/api/cron/flow-reconcile` | `0 11 * * *` | reconciliación Flow y sincronización acotada de monto |
| `/api/cron/mirror-exercise-thumbnails` | `0 4 * * *` | mirror de thumbnails |
| `/api/cron/paid-expiry` | `30 12 * * *` | backstop provider-verified de suscripciones vencidas |

Handlers sin schedule automático:

- `/api/cron/weekly-snapshot`;
- `/api/cron/weekly-report-email`;
- `/api/cron/org-health-alert`;
- `/api/cron/payment-reminder`.

Para ejecutar un handler manual, usar un entorno seguro y el Bearer `CRON_SECRET`. No incluir el valor en el comando pegado a documentación o tickets.

Ante un cron fallido:

1. revisar la última ejecución y logs completos;
2. determinar si es idempotente antes de reintentar;
3. comprobar writes parciales por event/batch ID;
4. corregir la causa o aislar el elemento defectuoso;
5. reintentar una vez y verificar conteos.

## Pagos — reglas comunes

- La DB representa el estado comercial que consume EVA; el proveedor debe reconciliarse contra ella.
- Un webhook puede repetirse: toda reparación conserva idempotencia y eventos previos.
- No editar montos o estados para “hacerlos coincidir” sin revisar el cobro real.
- Toda corrección manual deja evidencia en `subscription_events` o `admin_audit_logs`.
- No cancelar una suscripción solo porque el proveedor está temporalmente inaccesible.

### Divergencia MercadoPago

1. Identificar coach, ciclo, tier y add-ons facturables.
2. Calcular el monto compuesto esperado con el mismo servicio del runtime.
3. Comparar con el preapproval vigente.
4. Si DB es correcta y el provider quedó atrás, actualizar mediante el provider adapter/servicio soportado.
5. Registrar antes/después y confirmar que el próximo `mp-reconcile` queda limpio.

Si un PUT de alta de add-on falló, comprobar si la reversión DB también falló. Si la fila quedó viva con monto antiguo, reparar el proveedor; no borrar la fila para ocultar la divergencia.

### Flow: refund o chargeback

Un refund hecho en el panel no garantiza que la suscripción deje de cobrar.

1. Cancelar primero la suscripción Flow o confirmar que ya es terminal.
2. Ejecutar el refund con su referencia.
3. Actualizar en EVA el estado correspondiente mediante el camino administrativo seguro.
4. Registrar `subscriptionId`, invoice/refund ID y decisión sin datos de tarjeta.
5. Confirmar al día siguiente que `flow-reconcile` no informa divergencia.

### Flow: webhook perdido o período no avanzado

1. Verificar invoice y pago directamente en Flow.
2. Reenviar la notificación si el proveedor lo permite o aplicar una reparación service-role con esa invoice como evidencia.
3. Respetar la clave idempotente del evento; no crear un segundo cobro/snapshot.
4. Confirmar `current_period_end` y el siguiente reconcile.

### Add-on con kill-switch prolongado

`EVA_DISABLED_MODULES` apaga la funcionalidad, no el cobro.

1. Si el corte supera la ventana operativa, decidir compensación o cortesía.
2. Ajustar el monto mediante el flujo soportado cuando corresponda.
3. Registrar la compensación y su fecha de término.
4. Verificar que reactivar el módulo no duplique el cargo.

### Cuenta legacy `growth`/`scale`

Esos tiers están fuera de venta pero siguen soportados en runtime para suscriptores existentes.

- No eliminarlos del union, configuración ni constraints mientras queden cuentas.
- Un cambio excepcional se realiza desde administración y requiere revisar también el preapproval/plan del proveedor.
- Para reactivación normal, migrar a una oferta vigente; conservar legacy solo con decisión explícita del dueño.

## Incidente de seguridad

1. Revocar/rotar el secreto afectado en el proveedor.
2. Revocar sesiones o tokens derivados.
3. Revisar logs de uso desde la primera exposición posible.
4. Eliminar el secreto del HEAD y artefactos públicos.
5. Evaluar reescritura de historial como una operación separada y coordinada.
6. Documentar impacto y medidas sin reproducir el valor filtrado.

## Post-incidente

Cerrar solo cuando exista:

- línea de tiempo UTC;
- alcance confirmado;
- causa raíz y factor contribuyente;
- mitigación aplicada y evidencia de recuperación;
- prueba o guardrail que previene recurrencia;
- dueño y fecha para acciones restantes;
- actualización de [CURRENT.md](../status/CURRENT.md) si cambia el estado del proyecto.

La narración detallada vive en el incidente/ticket. Este runbook cambia únicamente si cambió el procedimiento reutilizable.
