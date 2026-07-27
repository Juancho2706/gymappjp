---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-26 @ e0db4285"
canonical: implementation-plan
source_of_truth: docs/status/MOBILE_PARITY.md
---

# PLAN — Cierre de paridad React Native

## Objetivo inmediato

Olas 4A, 4B y la [experiencia de entrada mobile](../mobile-entry-experience/SPEC.md) están cerradas
estáticas. El siguiente checkpoint es generar el binario con el splash nuevo y certificar la entrada
en Android/iOS antes de abrir ola 5; después se continúa la certificación del trabajo acumulado. El
detalle efectivo está en [`MOBILE_PARITY.md`](../../docs/status/MOBILE_PARITY.md).

## Secuencia activa

### Frente 0 — Entrada mobile (cerrado estático)

1. [x] [`SPEC.md`](../mobile-entry-experience/SPEC.md) aprobada por el owner.
2. [x] Contrato/auth y validación autoritativa del workspace implementados y testeados.
3. [x] Walkthrough con assets, selector/campo único y splash nativo continuo aplicados.
4. [ ] Cerrar certificación con build EAS y QA física Android/iOS.

La estrategia y el backlog detallados viven en
[`PLAN.md`](../mobile-entry-experience/PLAN.md) y
[`TASKS.md`](../mobile-entry-experience/TASKS.md).

### Ola 5 — Builder y programas

Abrir inventario nuevo contra web responsive y RN actual cuando el frente de entrada no tenga
P0/P1/P2. El ejecutor V3 del alumno ya está integrado; no se reactiva un checklist histórico sin
revalidar código.

### Certificación transversal

Completar device QA de Secciones 1–3, 2R, 4A/4B y entrada: teclado/timers, sheets, cámara,
safe areas, offline, foreground, branding y deep links.

## Gate de cada wave

1. Spec de cada unidad actualizada con veredicto real.
2. Revisión adversarial web ↔ RN y lente de lógica/estado.
3. `pnpm exec tsc --noEmit` desde `apps/mobile`.
4. Pruebas afectadas del dominio.
5. Paridad de tokens `86/86` mediante el script vigente.
6. `expo export` Android e iOS.
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
- Android/iOS `production`: build + submit verdes en el
  [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre
  `856829fa` (2026-07-25).
- Falta retener/verificar artefactos en stores y completar QA física.
- Cambios JS-only compatibles pueden usar OTA; cambios nativos requieren binario.
- No promover a stores una ola parcialmente visible.

## Secuencia posterior

1. Certificar experiencia de entrada en binario y dispositivo.
2. Inventariar y especificar 5 — builder/programas.
3. Agrupar dominios restantes en olas pequeñas con archivos disjuntos.
4. Certificación transversal: rutas, branding, estados, accesibilidad, offline, deep links y releases.

No reutilizar como verdad el antiguo plan E0–E8: queda disponible en Git como baseline histórico, pero el código actual se revalida antes de crear cada tarea.

## Rollback

- Cambios de UI/lógica: revert del checkpoint de wave.
- Cambios nativos: volver al artefacto anterior compatible.
- DB: forward-fix aditivo; el diseño evita depender de rollback destructivo.
- Si un feature flag protege una superficie incompleta, conservarlo hasta certificarla y retirarlo al cierre.
