---
status: active
owner: Juan Manuel Villegas
last_verified: "2026-07-20 @ 34b09d8f"
canonical: false
role: methodology
source_of_truth: docs/status/MOBILE_PARITY.md
---

# Método del port Web/PWA → React Native

Este directorio define **cómo** se trabaja la paridad. No mantiene el estado ni una cronología.

- Estado actual y punto de reanudación: [`docs/status/MOBILE_PARITY.md`](../status/MOBILE_PARITY.md)
- Plan de ejecución: [`specs/rn-mobile-parity-redesign/PLAN.md`](../../specs/rn-mobile-parity-redesign/PLAN.md)
- Backlog vivo: [`specs/rn-mobile-parity-redesign/TASKS.md`](../../specs/rn-mobile-parity-redesign/TASKS.md)
- Specs de la ola activa: [`specs/seccion-4a/`](./specs/seccion-4a/)
- Snapshot de reconocimiento inicial, no backlog: [`artifacts/ola0-hallazgos-20260710.json`](./artifacts/ola0-hallazgos-20260710.json)

## Principio rector

La superficie responsive de `apps/web` es la referencia visual y funcional. React Native debe preservar jerarquía, contenido, estados, validaciones y resultado de cada interacción. Las diferencias idiomáticas de plataforma son válidas únicamente cuando mantienen esa experiencia o aportan una capacidad nativa aprobada y documentada.

No se implementa desde recuerdos, handoffs ni capturas aisladas. Cada unidad se verifica contra código actual y contra un commit conocido.

## Pipeline por unidad

1. **Inventario:** rutas, componentes, modales, datos, estados y acciones de la superficie web.
2. **Spec:** evidencia por símbolo/ruta y criterios objetivos de cierre.
3. **Implementación:** modificar la contraparte RN existente; compartir contratos y lógica de dominio cuando corresponda.
4. **Verificación adversarial:** una revisión independiente compara spec, web y RN.
5. **Lente de lógica:** revisar carreras, foco/foreground, offline, dobles envíos, permisos y errores inalcanzables.
6. **Gates:** typecheck, pruebas afectadas, paridad de tokens y export/build correspondiente.
7. **QA device:** light/dark, EVA/marca personalizada y ambos sistemas operativos cuando aplique.
8. **Checkpoint:** código, spec de unidad, tareas y estado canónico se actualizan juntos.

## Definition of Done

Una unidad solo queda certificada cuando cumple todo:

- cero diferencias P0/P1/P2 accionables contra web responsive;
- divergencias nativas justificadas y aprobadas por escrito;
- estados loading, empty, error, offline, disabled y permisos cubiertos;
- `pnpm exec tsc --noEmit` en `apps/mobile` verde;
- pruebas del dominio tocado verdes;
- `pnpm check:tokens` o gate equivalente verde;
- export Android verde y build nativo cuando el cambio lo requiera;
- QA real en dispositivo registrado.

Si falta device QA, el estado correcto es **cerrado estático; no certificado**.

## Reglas de implementación

- Usar tokens del theme; no introducir colores o spacing crudos sin contrato.
- Preservar white-label, dark mode y safe areas.
- No eliminar funcionalidad RN sin registrarla como delta o decisión.
- No cambiar primitivas compartidas preventivamente: demostrar el delta y revisar consumidores.
- Lógica reutilizable y contratos viven en `packages/`; UI específica permanece en su app.
- Mantener write-paths idempotentes, validación de servidor y RLS/entitlements reales; un gate visual no es seguridad.
- No abrir más de una unidad que edite el mismo archivo monolítico.

## Política documental

- Este README cambia solo si cambia el método.
- `MOBILE_PARITY.md` contiene únicamente el estado resumido.
- `TASKS.md` contiene únicamente trabajo vivo y gates pendientes.
- Cada spec de unidad contiene evidencia y decisiones de esa unidad.
- Handoffs, prompts, portlogs y reportes intermedios no son documentación activa.
- Git conserva la historia; `archive/` se reserva para evidencia con valor legal, operativo o de decisión.
