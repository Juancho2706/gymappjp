# Tareas

- [x] Auditar políticas, asignaciones, conversión y scopes Team/Standalone.
- [x] Aplicar migración previa de asignaciones en LIVE controlado (2026-08-01); smoke SQL aprobado.
- [x] Aplicar migración de guardas/RLS/read-model legacy en LIVE (2026-08-01); matriz con JWTs reales pendiente.
- [x] Centralizar archive/unarchive/bulk y reemplazar PATCH móvil genérico.
- [x] Añadir estado suspendido y limpieza de persistencia ante `CLIENT_BLOCKED`.
- [x] Extraer autorización V2 de rutas V1 y retirar rollout técnico.
- [x] Incorporar detalle histórico V1 a las superficies V2.
- [x] Añadir preflight bloqueante y operación explícita para desactivar V1 verificado.
- [ ] Ejecutar conversión y corte V1 en entorno controlado con reporte completo.
- [ ] Ejecutar pruebas RLS con JWTs reales, Playwright y QA físico iOS/Android.
