---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-20 @ 3867e8ad"
canonical: implementation-plan
source_of_truth: docs/status/MOBILE_PARITY.md
---

# PLAN — Cierre de paridad React Native

## Objetivo inmediato

Terminar Ola 4A de nutrición del alumno y luego certificar en dispositivo el trabajo acumulado de Secciones 1–3 y 2R. Hoy 4A tiene 5/12 unidades aplicadas; el detalle efectivo está en [`MOBILE_PARITY.md`](../../docs/status/MOBILE_PARITY.md).

## Secuencia activa

### Wave C

- `4A-06`: edición y retiro, incluyendo motivo, confirmación y errores visibles.
- `4A-08`: `AuraHero`, macros y white-label.
- `4A-09`: porciones, chips, filtros y sheet de equivalencias.

Pueden avanzar en paralelo mientras sus archivos sigan disjuntos. Integrar y ejecutar gates como un solo checkpoint.

### Wave D

- `4A-03`: vista Plan.
- `4A-12`: celebraciones y divergencias nativas ya decididas.

Revisar consumidores del kit `4A-07` y evitar duplicar componentes.

### Wave E

- `4A-04`: historial.
- `4A-05`: shell/tab bar, después de `4A-04` si ambas editan `index.tsx`.

Al terminar: barrido 4A completo contra web actual, corrección de residuos y cierre estático.

## Gate de cada wave

1. Spec de cada unidad actualizada con veredicto real.
2. Revisión adversarial web ↔ RN y lente de lógica/estado.
3. `pnpm exec tsc --noEmit` desde `apps/mobile`.
4. Pruebas afectadas del dominio.
5. Paridad de tokens `86/86` mediante el script vigente.
6. `expo export` Android.
7. Build nativo si cambian dependencias/configuración nativa.
8. `TASKS.md` y `MOBILE_PARITY.md` actualizados en el mismo checkpoint.

## Gate de certificación 4A

- Flujo Hoy, Plan e Historial.
- Registro libre, scanner, porciones, editar y retirar.
- Loading, vacío, error, offline, pending y dominio deshabilitado.
- Light/dark × marca EVA/custom.
- Android e iOS en dispositivo real.
- Regresión de navegación, cápsula, auth y datos del alumno.

Los cierres estáticos previos de Secciones 1–3 y 2R se regresionan en la misma campaña device, priorizando teclado/timers, sheets, cámara, safe areas, offline y foreground.

## Arquitectura

- UI específica permanece en `apps/mobile`.
- Schemas, tipos y lógica de dominio reutilizable se consumen desde `packages/`.
- No agregar Redux, Zustand, SWR ni React Query.
- Mantener la capa de datos y seguridad existente; no saltarse servicios/repositorios cuando exista el boundary compartido.
- Mutaciones de módulos pagos usan servidor + `assertModule`; lecturas directas requieren RLS comprobada.

## Supabase y migraciones

No se espera una migración para cerrar 4A. Si aparece una necesidad real:

### Con Supabase Branching disponible

1. Confirmar disponibilidad/costo y crear branch efímero.
2. Aplicar solo DDL aditiva, idempotente y forward-only.
3. Ejecutar seed sintético y pruebas RLS como roles reales.
4. Ejecutar advisors; cero críticos antes de continuar.
5. Crear snapshot de tablas de producción afectadas.
6. Merge del branch.
7. `db pull`, regenerar tipos y validar consumidores web/mobile.
8. Eliminar el branch el mismo día.

### Sin Supabase Branching disponible

Aplicar el protocolo aditivo-en-LIVE: snapshot, cambio mínimo, datos sintéticos, pruebas RLS, advisors y verificación posterior. Nunca usar `db push` a ciegas ni DDL destructiva.

## Builds y entrega

- Trabajo: `rnmobiledenuevo`.
- Producción: `master` mediante merge revisado.
- Android `previewv2`: build OK reportado; falta QA device.
- iOS `previewv2`: rebuild pendiente después de `c6743ef3`.
- Cambios JS-only compatibles pueden usar OTA; cambios nativos requieren binario.
- No promover a stores una ola parcialmente visible.

## Después de 4A

1. Inventariar y especificar 4B — nutrición coach/catálogos.
2. Inventariar y especificar 5 — builder/programas.
3. Agrupar dominios restantes en olas pequeñas con archivos disjuntos.
4. Certificación transversal: rutas, branding, estados, accesibilidad, offline, deep links y releases.

No reutilizar como verdad el antiguo plan E0–E8: queda disponible en Git como baseline histórico, pero el código actual se revalida antes de crear cada tarea.

## Rollback

- Cambios de UI/lógica: revert del checkpoint de wave.
- Cambios nativos: volver al artefacto anterior compatible.
- DB: forward-fix aditivo; el diseño evita depender de rollback destructivo.
- Si un feature flag protege una superficie incompleta, conservarlo hasta certificarla y retirarlo al cierre.
