# Tareas

- [x] Auditar políticas, asignaciones, conversión y scopes Team/Standalone.
- [x] Aplicar migración previa de asignaciones en LIVE controlado (2026-08-01); smoke SQL aprobado.
- [x] Aplicar migración de guardas/RLS/read-model legacy en LIVE (2026-08-01); matriz con JWTs reales pendiente.
- [x] Corregir el P0 que introdujo esa migración: `archive_gate_clients` era `RESTRICTIVE FOR ALL`, así
      que su `WITH CHECK` corría en INSERT y ningún coach podía crear alumnos (LIVE 2026-08-03,
      `20260803150806`). El smoke anterior no cubría ningún flujo de coach.
- [x] Devolver al alumno bloqueado a la pantalla de cuenta suspendida: la ficha propia vuelve a ser
      legible (`20260803162000`) y los logins /c, /t y RN aterrizan ahí en vez de cerrar sesión con
      un error genérico.
- [x] Cerrar el filo del `RETURNING` en `clients` y cambiar la coerción silenciosa de asignaciones a
      un rechazo explícito (`20260803171000`).
- [x] Ampliar el smoke SQL: alta de alumno, `INSERT ... RETURNING`, ficha propia visible y asignación
      a archivado rechazada.
- [x] Centralizar archive/unarchive/bulk y reemplazar PATCH móvil genérico.
- [x] Añadir estado suspendido y limpieza de persistencia ante `CLIENT_BLOCKED`.
- [x] Extraer autorización V2 de rutas V1 y retirar rollout técnico.
- [x] Incorporar detalle histórico V1 a las superficies V2.
- [x] Añadir preflight bloqueante y operación explícita para desactivar V1 verificado.
- [ ] Ejecutar conversión y corte V1 en entorno controlado con reporte completo.
- [ ] Ejecutar pruebas RLS con JWTs reales, Playwright y QA físico iOS/Android.
