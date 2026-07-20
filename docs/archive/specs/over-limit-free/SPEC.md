# SPEC — Sobre-límite free: aviso de upgrade + archivado masivo + candado de archivados

**Fecha:** 2026-07-19 · **Estado:** en build (aprobado CEO) · **Origen:** caso robin-coach (cortesía Pro vencida → free con 7 alumnos activos, cupo 3).

## Problema

Un coach standalone puede quedar con más alumnos activos que el cupo de su plan (fin de cortesía, downgrade). Hoy:
1. No ve ningún aviso (el banner free del dashboard capea el conteo en `max`, muestra "3/3" con 7).
2. Sigue trabajando gratis sin fricción → injusto con los que pagan y fuga de revenue.
3. Su única salida a free legítimo (archivar alumnos hasta el cupo) es de a uno.
4. "Archivar" no bloquea de verdad: la app RN (PostgREST directo) y la API mobile no chequean `is_archived` — solo el proxy web lo hace.

## User stories

- Como coach free sobre-límite, veo en todo mi panel un aviso claro: cuántos alumnos tengo vs mi cupo, qué plan me calza (con precio y los 4 módulos incluidos), y las dos salidas: **pagar** o **archivar**.
- Como coach, puedo seleccionar varios alumnos y archivarlos de una (desktop y móvil), con confirmación que aclara que no se borra nada.
- Como alumno archivado, NO puedo entrar por ninguna superficie (web, API mobile, app RN, escrituras DB) y veo una pantalla que me tranquiliza: mis datos siguen guardados.
- Como CEO, los alumnos existentes de un coach sobre-límite NUNCA se cortan automáticamente — la presión es solo al coach.

## Criterios de aceptación

1. Banner `OverLimitBanner` en `/coach/*` (standalone, no org/team) cuando `activos > (max_clients ?? tierMax)`; no cerrable; oculto en subscription/reactivate/onboarding; recomienda el tier pago más barato que cubra el conteo; CTAs a `/coach/subscription` y `/coach/clients`; dark mode + safe areas.
2. `FreeTierBanner` del dashboard muestra el conteo activo REAL (7/3, no 3/3) y excluye archivados.
3. `bulkArchiveClientsAction(ids[])`: scoped al coach (RLS techo), un UPDATE, emails de archivado fan-out no bloqueante, revalidate.
4. Selección múltiple: barra bulk desktop existente gana "Archivar"; vista móvil gana modo selección + barra flotante.
5. Candado DB (migración `20260719190000_student_write_gate_blocked_clients`, APLICADA en prod 2026-07-19): `private.student_write_allowed` devuelve false si `is_archived` o `is_active=false` → bloquea escrituras en workout_logs/check_ins/daily_nutrition_logs/nutrition_meal_logs y RPCs intake V2 en TODAS las superficies. Fail-open sin fila se conserva. Validado: pausado=false, archivado(simulado tx)=false, activos legítimos=true, sin-fila=true, 0 advisors nuevos.
6. API mobile superficie alumno responde 403 `CLIENT_BLOCKED` para archivado/pausado; `/api/mobile/config` e identidad quedan accesibles (la RN los usa para detectar el bloqueo).
7. RN: login rechaza `is_archived`; el gate de tabs se re-evalúa al volver del background; pantalla suspendido con línea de datos-a-salvo. (PR aparte a `rnmobiledenuevo`.)
8. Proxy web pasa `reason=archived|paused` a `/c/[slug]/suspended`; copy específico para archivado.

## No-goals

- Cortar/archivar alumnos automáticamente por sobre-límite.
- Endurecer los SELECT RLS del alumno archivado (las escrituras quedan candadas a nivel DB; lecturas RN directas mueren al re-evaluar el gate en resume/relaunch).
- Cambios de precios o tiers.
