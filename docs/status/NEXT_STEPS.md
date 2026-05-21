# Next Steps

Ultima modificacion: 2026-05-21 18:25 -04:00

## Donde estamos

`v2/enterprise` esta en buen estado tecnico para seguir desarrollo local:

- Enterprise core validado en local.
- Arquitectura feature-first cerrada contra gates medibles.
- Typecheck web/mobile, Vitest, build y E2E focal pasan.
- Documentacion canonica reorganizada en `docs/`.

## Lo que falta de verdad

1. Hardening frontend:
   - Hydration warnings.
   - `middleware.ts` -> `proxy` por Next 16.
   - Warnings visuales de charts/images.
2. Playwright completo:
   - Ejecutar suite completa, no solo bloque enterprise/alumno.
3. Limpieza de producto:
   - Revisar rutas/components legacy con analisis de imports.
   - Eliminar solo despues de confirmar sin referencias.
4. Preparacion prod:
   - Checklist de env vars.
   - Migraciones remotas.
   - Buckets/hooks/webhooks.
   - Deploy preview y smoke.
5. Mobile:
   - Validar paridad real con web.
   - Builds Android/iOS.
   - Push/deep links/auth recovery.

## Orden recomendado

1. Terminar limpieza documental/workspace.
2. Corregir warnings de hydration y migrar `middleware` a `proxy`.
3. Correr Playwright completo.
4. Auditar archivos no usados con herramienta automatica.
5. Preparar checklist de deploy/staging.

## Opinion tecnica

No conviene ir a Live todavia. El core ya esta fuerte, pero falta convertir la confianza local en confianza operativa: suite completa, deploy preview, env vars, migraciones remotas y smoke. El siguiente bloque deberia ser hardening + QA, no nuevas features grandes.
